-- T-CAP-4 (PR 1) — customer record integrity + per-vendor messaging consent.
--
-- Touches the live `customers` and `customer_relationships` tables. There is no
-- PITR. Ed takes a `customers_backup_20260720` snapshot before applying (see the
-- PR description); step 1 below is an independent hard gate that aborts the whole
-- migration before anything is written if the data has moved since verification.
--
-- ORDER WITHIN THIS FILE IS LOAD-BEARING:
--   1. collision gate   — abort before any write if lower(email) is not unique
--   2. new columns      — messaging consent, per-vendor, on customer_relationships
--   3. normalise emails — MUST precede step 5, or the new index rejects a live row
--   4. postcode backfill— truncate full postcodes to outward code, in place
--   5. add index        — additive only; nothing is dropped
--   6. replace the RPC  — DROP (old signature) / CREATE / re-GRANT
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- --------------------------------------------
-- `customers_email_unique` is a UNIQUE CONSTRAINT (contype = 'u'), not a bare
-- index. PostgREST's `onConflict: "email"` in create-order infers against it and
-- CANNOT reference an expression index. Dropping or swapping it breaks customer
-- checkout permanently. It is KEPT EXACTLY AS IS, and every `ON CONFLICT (email)`
-- inference target — here and in create-order — is left unchanged.
--
-- `customers_email_lower_unique` is ADDED ALONGSIDE it as a database-level net:
-- now that every writer normalises (create-order at the parse boundary, PR #492;
-- this RPC via lower(trim(...))), the two are functionally identical. The
-- lower() one exists to catch a FUTURE unnormalised writer loudly, instead of
-- silently forking one person into two customer rows.

-- ---------------------------------------------------------------------------
-- STEP 1 — collision gate (runs first; aborts everything on failure)
-- ---------------------------------------------------------------------------
-- Verified zero on live data at authoring time. Re-checked here because the
-- window between verification and apply is not zero, and because step 3 rewrites
-- emails in place: if two rows differ only by case, normalising them would
-- collide against `customers_email_unique` mid-migration. Fail loudly, first,
-- before any write.
DO $$
DECLARE
  v_collisions integer;
  v_sample     text;
BEGIN
  SELECT count(*), min(lower_email)
    INTO v_collisions, v_sample
  FROM (
    SELECT lower(trim(email)) AS lower_email
    FROM public.customers
    WHERE email IS NOT NULL
    GROUP BY lower(trim(email))
    HAVING count(*) > 1
  ) collisions;

  IF v_collisions > 0 THEN
    RAISE EXCEPTION
      'ABORTED: % lower(email) collision group(s) in public.customers (e.g. %). Resolve these by hand before applying — a merge strategy is deliberately NOT automated here.',
      v_collisions, v_sample
      USING ERRCODE = 'unique_violation';
  END IF;

  RAISE NOTICE 'step 1: lower(email) collision gate passed (0 groups).';
END;
$$;

-- ---------------------------------------------------------------------------
-- STEP 2 — per-vendor messaging consent columns
-- ---------------------------------------------------------------------------
-- Messaging consent is PER-VENDOR and therefore lives on customer_relationships,
-- NOT on customers. A boolean on the shared customers row would make a tick given
-- to one vendor readable as consent by every other vendor on the platform.
--
-- Nullable text, mirroring the existing consent_status shape. NULL means "never
-- asked", which is the honest state for every row that exists today — a boolean
-- could not distinguish that from "asked and declined", and could not express
-- withdrawal at all.
ALTER TABLE public.customer_relationships
  ADD COLUMN IF NOT EXISTS messaging_consent_status text,
  ADD COLUMN IF NOT EXISTS messaging_consent_at     timestamptz;

COMMENT ON COLUMN public.customer_relationships.messaging_consent_status IS
  'Per-vendor consent to receive messages (SMS/WhatsApp): granted | withdrawn | pending. NULL = never asked. Scoped to this owner_id — never read as platform-wide consent.';
COMMENT ON COLUMN public.customer_relationships.messaging_consent_at IS
  'When messaging consent was first granted for this owner. Set once on the original grant and never reset by a repeat follow.';

-- ---------------------------------------------------------------------------
-- STEP 3 — normalise existing emails
-- ---------------------------------------------------------------------------
-- REQUIRED, and required BEFORE step 5. `ON CONFLICT (email)` compares the bare
-- column: a normalised incoming write would not match a raw-cased stored row,
-- would fall through to an INSERT, and would then be rejected by the new
-- lower(email) index — failing a live checkout. Two rows were verified to hold
-- non-normalised values at authoring time.
--
-- Safe because step 1 has already proven zero lower(email) collisions: nothing
-- here can conflict with an existing row.
DO $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.customers
  SET email = lower(trim(email))
  WHERE email IS NOT NULL
    AND email <> lower(trim(email));

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'step 3: normalised % email row(s) (expected 2).', v_rows;
END;
$$;

-- ---------------------------------------------------------------------------
-- STEP 4 — postcode backfill (full postcode -> outward code, in place)
-- ---------------------------------------------------------------------------
-- Hearth only ever needs the outward code: it is what the follow form asks for,
-- what demand-by-area reporting groups on, and the least personal thing that
-- still answers "is this drop near me". Storing a full postcode is data we do not
-- need and did not ask for.
--
-- ONLY the full-postcode pattern is matched, against an uppercased,
-- space-stripped value. Anything that does not match is left COMPLETELY
-- UNTOUCHED — not nulled, not truncated, not re-cased. That deliberately covers
-- the already-outward rows, the blank/NULL row, and anything unrecognised: this
-- migration narrows known-good data and never guesses at the rest.
DO $$
DECLARE
  v_rows integer;
BEGIN
  WITH compacted AS (
    SELECT id, upper(regexp_replace(postcode, '\s+', '', 'g')) AS compact
    FROM public.customers
    WHERE postcode IS NOT NULL
  )
  UPDATE public.customers c
  SET postcode = left(k.compact, length(k.compact) - 3)
  FROM compacted k
  WHERE c.id = k.id
    AND k.compact ~ '^[A-Z]{1,2}[0-9]{1,2}[A-Z]?[0-9][A-Z]{2}$';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'step 4: truncated % full postcode(s) to outward code (expected 50).', v_rows;
END;
$$;

-- ---------------------------------------------------------------------------
-- STEP 5 — add the lower(email) uniqueness net
-- ---------------------------------------------------------------------------
-- ADD ONLY. `customers_email_unique` is untouched and remains the ON CONFLICT
-- inference target everywhere. See the header for why swapping them is unsafe.
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_lower_unique
  ON public.customers (lower(email));

COMMENT ON INDEX public.customers_email_lower_unique IS
  'Case-insensitive net alongside the customers_email_unique CONSTRAINT (which PostgREST ON CONFLICT (email) infers against and which must NOT be dropped). Catches any future writer that skips normalisation.';

-- ---------------------------------------------------------------------------
-- STEP 6 — replace register_vendor_interest_atomic (new p_messaging_consent arg)
-- ---------------------------------------------------------------------------
-- DROP before CREATE is REQUIRED, not housekeeping — for two independent
-- reasons:
--   (a) CREATE OR REPLACE compares the row type defined by the OUT parameters of
--       a RETURNS TABLE function and refuses to change it;
--   (b) the new argument carries a DEFAULT, so leaving the old six-arg function
--       in place would make an existing six-arg call ambiguous between the two
--       overloads ("function name is not unique").
-- The old signature is therefore dropped EXPLICITLY, and the REVOKE/GRANT block
-- at the foot of this file is re-applied for the NEW signature — a DROP discards
-- privileges, and without the re-GRANT the Edge Function loses EXECUTE and every
-- follow 500s.
DROP FUNCTION IF EXISTS public.register_vendor_interest_atomic(uuid, text, text, text, text, boolean);

CREATE OR REPLACE FUNCTION public.register_vendor_interest_atomic(
  p_vendor_id         uuid,
  p_name              text,
  p_email             text,
  p_postcode          text,
  p_phone             text,
  p_consent           boolean,
  p_messaging_consent boolean DEFAULT false
)
-- The output column is deliberately named out_customer_id, NOT customer_id. A
-- RETURNS TABLE column is a PL/pgSQL variable in scope for the whole body, so an
-- output named customer_id collides with the customer_id COLUMN referenced in the
-- INSERT column lists and ON CONFLICT (customer_id, owner_id) targets below —
-- Postgres cannot disambiguate and raises "column reference customer_id is
-- ambiguous" at runtime. The out_ prefix keeps the output name out of the
-- column namespace. Callers read this field by name (see
-- supabase/functions/register-vendor-interest/index.ts).
RETURNS TABLE (out_customer_id uuid, newly_following boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email       text := lower(trim(p_email));
  v_postcode    text := upper(regexp_replace(coalesce(p_postcode, ''), '\s+', '', 'g'));
  -- A phone number is only captured when the person has ticked the messaging
  -- consent box. Without that tick we have no basis to hold a mobile number from
  -- this surface, so we do not take one — the field going unused is the point.
  v_phone       text := CASE WHEN p_messaging_consent IS TRUE
                             THEN nullif(trim(p_phone), '')
                             ELSE NULL END;
  v_customer_id uuid;
  v_signal_id   uuid;
BEGIN
  -- 1. Guards. A follow REQUIRES a name, an email, an outward postcode, and an
  --    explicit consent tick. The Edge Function validates all four first (it owns
  --    the user-facing error copy); these are the belt-and-braces enforcement
  --    point for any future caller that bypasses it. The postcode guard is new —
  --    it brings the RPC to parity with the EF and closes
  --    T-follow-validation-rpc-parity.
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'email is required' USING ERRCODE = 'check_violation';
  END IF;
  IF p_consent IS NOT TRUE THEN
    RAISE EXCEPTION 'consent is required' USING ERRCODE = 'check_violation';
  END IF;
  -- customers.name is NOT NULL, but the INSERT below passes nullif(trim(p_name),'')
  -- which is NULL for an empty/blank name. Reject cleanly here rather than let a
  -- nameless follow throw a raw not-null constraint error.
  IF nullif(trim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'name is required' USING ERRCODE = 'check_violation';
  END IF;
  IF v_postcode = '' THEN
    RAISE EXCEPTION 'postcode is required' USING ERRCODE = 'check_violation';
  END IF;
  -- Outward code ONLY (BH18, SW1A, M1). A full postcode is REJECTED, never
  -- silently truncated — matching normaliseOutwardPostcode() in the EF. (Step 4
  -- above truncates historical rows; that is a one-off backfill of data captured
  -- before this rule existed, not the ongoing write behaviour.)
  IF v_postcode !~ '^[A-Z]{1,2}[0-9]{1,2}[A-Z]?$' THEN
    RAISE EXCEPTION 'postcode must be a UK outward code' USING ERRCODE = 'check_violation';
  END IF;

  -- 2. Find-or-create the customer on the UNIQUE(email) CONSTRAINT.
  --    ON CONFLICT (email) — bare column, deliberately unchanged. Do NOT retarget
  --    this at the lower(email) index: create-order infers against the same
  --    constraint via PostgREST, and the two must stay in step.
  --
  --    The DO UPDATE is a FILL-IF-NULL merge, never an overwrite:
  --      - name     is not touched at all. The name on file is the one the person
  --                 gave first; a follow does not get to rewrite it.
  --      - postcode fills only when we hold nothing. A different postcode is a
  --                 person who has moved or typed a work address — we are not
  --                 confident enough to overwrite, and the outward code we
  --                 already have is what demand reporting is built on.
  --      - phone    fills only when we hold nothing, and only when v_phone is
  --                 non-null (i.e. they ticked). This is the important one: a
  --                 number captured at checkout for order-ready SMS must never be
  --                 wiped by a later follow submitted with the mobile field blank.
  INSERT INTO public.customers (name, email, phone, postcode)
  VALUES (
    nullif(trim(p_name), ''),
    v_email,
    v_phone,
    v_postcode
  )
  ON CONFLICT (email) DO UPDATE SET
    postcode = coalesce(customers.postcode, excluded.postcode),
    phone    = coalesce(customers.phone,    excluded.phone)
  RETURNING id INTO v_customer_id;

  -- 3. Upsert the vendor relationship on UNIQUE(customer_id, owner_id). An
  --    explicit tick is fresh consent, so UPGRADE consent_status to 'granted'
  --    on conflict (including re-granting after a prior 'withdrawn'). The original
  --    origin is preserved — source and source_drop_id are NOT touched on
  --    conflict.
  --
  --    Messaging consent (new) is per-vendor and asymmetric by design:
  --      - ticked   -> 'granted'. messaging_consent_at is stamped ONLY if this is
  --                    not already a live grant, so a repeat follow cannot reset
  --                    the original consent date (which is the date we would have
  --                    to stand behind if the grant were ever questioned).
  --      - unticked -> BOTH columns left entirely alone. The absence of a tick is
  --                    not a withdrawal, and must never quietly clear a prior
  --                    grant. Withdrawal is a separate, explicit act.
  INSERT INTO public.customer_relationships (
    customer_id,
    owner_type,
    owner_id,
    consent_status,
    source,
    lawful_basis,
    source_drop_id,
    messaging_consent_status,
    messaging_consent_at,
    created_at
  )
  VALUES (
    v_customer_id,
    'vendor',
    p_vendor_id,
    'granted',
    'interest',
    'explicit_consent',
    NULL,
    CASE WHEN p_messaging_consent IS TRUE THEN 'granted' ELSE NULL END,
    CASE WHEN p_messaging_consent IS TRUE THEN now()     ELSE NULL END,
    now()
  )
  ON CONFLICT (customer_id, owner_id) DO UPDATE SET
    consent_status = 'granted',
    lawful_basis   = 'explicit_consent',
    messaging_consent_status = CASE
      WHEN p_messaging_consent IS TRUE THEN 'granted'
      ELSE customer_relationships.messaging_consent_status
    END,
    messaging_consent_at = CASE
      WHEN p_messaging_consent IS TRUE
       AND customer_relationships.messaging_consent_status IS DISTINCT FROM 'granted'
      THEN now()
      ELSE customer_relationships.messaging_consent_at
    END;

  -- 4. Insert the follow signal. The ON CONFLICT target is the PARTIAL unique
  --    index idx_drop_signals_vendor_follow_uq — (vendor_id, customer_id, kind)
  --    WHERE drop_id IS NULL — NOT the base UNIQUE(drop_id, customer_id, kind).
  --    The WHERE predicate below must match that partial index predicate exactly.
  --    A conflict (already following) leaves v_signal_id NULL via the empty
  --    RETURNING, which is how we report already-following vs newly-following.
  INSERT INTO public.drop_signals (
    vendor_id, customer_id, kind, capture_surface, capture_state
  )
  VALUES (
    p_vendor_id, v_customer_id, 'interest', 'vendor_page', 'resting'
  )
  ON CONFLICT (vendor_id, customer_id, kind) WHERE drop_id IS NULL DO NOTHING
  RETURNING id INTO v_signal_id;

  -- 5. contact_opt_in / contact_opt_in_scope are deliberately NOT written here.
  --    Audit finding: the order path (create-order) writes those two columns to
  --    the ORDERS row, never to the customers table — customers is never given
  --    a contact_opt_in value anywhere in the codebase. Per the task, if the
  --    order path does not set them we do not invent a customers-level scope
  --    convention. Per-vendor consent for this follow lives on
  --    customer_relationships.consent_status = 'granted' (email) and
  --    messaging_consent_status = 'granted' (messaging), both step 3.

  RETURN QUERY SELECT v_customer_id, (v_signal_id IS NOT NULL);
END;
$$;

-- The write EF calls this with the service-role client. Lock execution down to
-- service_role only — never anon. Re-applied for the NEW seven-arg signature:
-- the DROP above discarded the privileges granted to the old one.
REVOKE ALL ON FUNCTION public.register_vendor_interest_atomic(uuid, text, text, text, text, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_vendor_interest_atomic(uuid, text, text, text, text, boolean, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.register_vendor_interest_atomic(uuid, text, text, text, text, boolean, boolean) TO service_role;
