-- T-CAP-2a — capture placement plumbing.
--
-- Records WHICH PHYSICAL OBJECT a person scanned to arrive at a vendor page,
-- ahead of the durable vendor QR generator (PR 3b) which will encode
-- `https://lovehearth.co.uk/{slug}?src={placement}`. This half must land FIRST:
-- if the generator ships first, every printed sticker carries a parameter
-- nothing reads, and capture origin CANNOT be retrofitted — the fact of a scan
-- exists only at the moment of the scan.
--
-- WHY A NEW COLUMN AND NOT capture_surface
-- ----------------------------------------
-- `capture_surface` and `capture_state` already exist from T-CAP-7 and the RPC
-- writes the constant pair ('vendor_page','resting'). They answer a DIFFERENT
-- question: capture_surface is WHICH SURFACE captured this person (the vendor
-- page), capture_placement is WHAT PHYSICAL OBJECT they scanned to reach it.
-- Overloading one field would lose the first answer to gain the second.
-- `capture_surface` continues to write 'vendor_page' here, unchanged.
--
-- Verified on live before authoring: drop_signals holds exactly one
-- (capture_surface, capture_state) group — ('vendor_page','resting'), 2 rows,
-- all vendor-scoped (drop_id IS NULL). Nothing writes these columns outside
-- this RPC.
--
-- KNOWN AND DELIBERATELY NOT FIXED HERE: capture_state is hardcoded to
-- 'resting' while the follow form renders in all four states, so it currently
-- misreports. Tracked as T-capture-state-accuracy, post-launch. Touching it
-- here would widen a plumbing PR into a semantics change.

-- ---------------------------------------------------------------------------
-- STEP 1 — the new column
-- ---------------------------------------------------------------------------
-- Nullable, no default, no backfill. Existing rows keep NULL, which is the
-- honest value: they predate QR placement and their physical origin is
-- genuinely unknown. A default would assert an origin we do not have.
ALTER TABLE public.drop_signals
  ADD COLUMN IF NOT EXISTS capture_placement text;

COMMENT ON COLUMN public.drop_signals.capture_placement IS
  'Which physical object the person scanned to reach the capture surface: counter | table | van | flyer. NULL means NOT FROM A QR — a shared link, a typed URL, an organic visit — which is a real and common case, not a missing value. Distinct from capture_surface, which remains the answer to WHICH SURFACE captured them (vendor_page) and is unaffected by this column. Written once on first follow and never overwritten: the drop_signals conflict clause is DO NOTHING, so a later follow from a different source leaves the original physical capture intact.';

-- ---------------------------------------------------------------------------
-- STEP 2 — replace register_vendor_interest_atomic (new p_capture_placement arg)
-- ---------------------------------------------------------------------------
-- DROP before CREATE is REQUIRED, not housekeeping, for the same two reasons
-- documented in 20260720130000:
--   (a) CREATE OR REPLACE compares the row type defined by the OUT parameters
--       of a RETURNS TABLE function and refuses to change it;
--   (b) the new argument carries a DEFAULT, so leaving the old seven-arg
--       function in place would make an existing seven-arg call ambiguous
--       between the two overloads ("function name is not unique").
--
-- The DROP targets the CURRENT SEVEN-ARG signature (the previous migration
-- dropped the six-arg one). The REVOKE/GRANT block at the foot of this file is
-- re-applied for the NEW EIGHT-ARG signature — a DROP discards privileges, and
-- without the re-GRANT the Edge Function loses EXECUTE and every follow 500s.
DROP FUNCTION IF EXISTS public.register_vendor_interest_atomic(uuid, text, text, text, text, boolean, boolean);

CREATE OR REPLACE FUNCTION public.register_vendor_interest_atomic(
  p_vendor_id         uuid,
  p_name              text,
  p_email             text,
  p_postcode          text,
  p_phone             text,
  p_consent           boolean,
  p_messaging_consent boolean DEFAULT false,
  p_capture_placement text    DEFAULT NULL
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
  -- Blank/whitespace placement is the same thing as no placement. The Edge
  -- Function already whitelists and nulls anything unrecognised; this is the
  -- belt-and-braces normalisation for any future caller that bypasses it.
  v_placement   text := nullif(trim(coalesce(p_capture_placement, '')), '');
  v_customer_id uuid;
  v_signal_id   uuid;
BEGIN
  -- 1. Guards. A follow REQUIRES a name, an email, an outward postcode, and an
  --    explicit consent tick. The Edge Function validates all four first (it owns
  --    the user-facing error copy); these are the belt-and-braces enforcement
  --    point for any future caller that bypasses it. The postcode guard is new —
  --    it brings the RPC to parity with the EF and closes
  --    T-follow-validation-rpc-parity.
  --
  --    capture_placement is deliberately NOT guarded. It is a machine-supplied
  --    hint about a sticker, not part of the person's submission: an unrecognised
  --    or absent value must never fail a capture. See the EF for why permissive
  --    is correct in exactly this one place.
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
  -- silently truncated — matching normaliseOutwardPostcode() in the EF.
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
  --    Messaging consent is per-vendor and asymmetric by design:
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
  --
  --    capture_placement is written on INSERT ONLY. The conflict clause remains
  --    DO NOTHING and is deliberately NOT converted to a DO UPDATE, which gives
  --    the required first-placement-wins behaviour for free: someone who follows
  --    via a counter QR and later follows again from a shared link keeps
  --    'counter'. The first physical capture is the true one. Converting to
  --    DO UPDATE would also break newly_following, which derives precisely from
  --    the empty RETURNING under DO NOTHING.
  --
  --    capture_surface stays 'vendor_page' — see this file's header.
  INSERT INTO public.drop_signals (
    vendor_id, customer_id, kind, capture_surface, capture_state, capture_placement
  )
  VALUES (
    p_vendor_id, v_customer_id, 'interest', 'vendor_page', 'resting', v_placement
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
-- service_role only — never anon. Re-applied for the NEW EIGHT-ARG signature:
-- the DROP above discarded the privileges granted to the seven-arg one.
REVOKE ALL ON FUNCTION public.register_vendor_interest_atomic(uuid, text, text, text, text, boolean, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_vendor_interest_atomic(uuid, text, text, text, text, boolean, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.register_vendor_interest_atomic(uuid, text, text, text, text, boolean, boolean, text) TO service_role;
