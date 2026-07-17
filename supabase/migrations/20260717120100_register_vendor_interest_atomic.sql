-- T-CAP-7 : atomic vendor-follow write path (new function only — purely additive).
--
-- One implicitly-transactional function performs all three writes (customer
-- find-or-create, vendor relationship upsert, follow signal) so a partial
-- follow can never persist. Depends on 20260717120000 (vendor-scoped
-- drop_signals + the partial unique index idx_drop_signals_vendor_follow_uq).
--
-- Semantics mirror the audited find-or-create in
-- supabase/functions/register-interest/index.ts: dedupe on lower(trim(email));
-- NEVER overwrite an existing customer's name / phone / postcode. (register-
-- interest additionally best-effort-backfills EMPTY fields on an existing
-- customer; this function deliberately does NOT touch an existing customer row
-- at all, per the task's explicit "only populate those columns when the
-- customer is newly created" and the additive/no-mutation safety gate.)

-- DROP before CREATE is REQUIRED, not housekeeping. This function's output column
-- was renamed (customer_id -> out_customer_id, see below). For a RETURNS TABLE
-- function prorettype is RECORD, and CREATE OR REPLACE compares the row type
-- defined by the OUT parameters — attribute NAMES included — against the existing
-- function. Renaming an output column therefore fails on any database that already
-- has the previous definition with:
--   ERROR: cannot change return type of existing function
--   DETAIL: Row type defined by OUT parameters is different.
--   HINT: Use DROP FUNCTION ... first.
-- The GRANT/REVOKE block at the foot of this file re-establishes privileges, which
-- the DROP discards.
DROP FUNCTION IF EXISTS public.register_vendor_interest_atomic(uuid, text, text, text, text, boolean);

CREATE OR REPLACE FUNCTION public.register_vendor_interest_atomic(
  p_vendor_id uuid,
  p_name      text,
  p_email     text,
  p_postcode  text,
  p_phone     text,
  p_consent   boolean
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
  v_customer_id uuid;
  v_signal_id   uuid;
BEGIN
  -- 1. Guards. A follow REQUIRES an email and an explicit consent tick.
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

  -- 2. Find-or-create the customer on the UNIQUE(email) constraint. The
  --    ON CONFLICT DO UPDATE is a deliberate no-op (email = its own value):
  --    it returns the existing row's id under a race WITHOUT overwriting the
  --    existing name / phone / postcode. Details are only ever populated on a
  --    genuinely new insert. Mirrors the audited find-or-create's non-destructive
  --    reuse (email is stored lowercased on every write path).
  INSERT INTO public.customers (name, email, phone, postcode)
  VALUES (
    nullif(trim(p_name), ''),
    v_email,
    nullif(trim(p_phone), ''),
    nullif(trim(p_postcode), '')
  )
  ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
  RETURNING id INTO v_customer_id;

  -- 3. Upsert the vendor relationship on UNIQUE(customer_id, owner_id). An
  --    explicit tick is fresh consent, so UPGRADE consent_status to 'granted'
  --    on conflict (including re-granting after a prior 'withdrawn'). The original
  --    origin is preserved — source and source_drop_id are NOT touched on
  --    conflict.
  INSERT INTO public.customer_relationships (
    customer_id,
    owner_type,
    owner_id,
    consent_status,
    source,
    lawful_basis,
    source_drop_id,
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
    now()
  )
  ON CONFLICT (customer_id, owner_id) DO UPDATE SET
    consent_status = 'granted',
    lawful_basis   = 'explicit_consent';

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
  --    customer_relationships.consent_status = 'granted' (step 3).

  RETURN QUERY SELECT v_customer_id, (v_signal_id IS NOT NULL);
END;
$$;

-- The write EF calls this with the service-role client. Lock execution down to
-- service_role only — never anon.
REVOKE ALL ON FUNCTION public.register_vendor_interest_atomic(uuid, text, text, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_vendor_interest_atomic(uuid, text, text, text, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.register_vendor_interest_atomic(uuid, text, text, text, text, boolean) TO service_role;
