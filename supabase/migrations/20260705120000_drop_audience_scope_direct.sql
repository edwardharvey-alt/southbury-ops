-- Widen drops.audience_scope to allow 'direct' (T-comms-direct-1).
--
-- 'direct' is the third value on the reachability axis (alongside the existing
-- 'public' and 'community'). It marks a single-client booking — stamped on
-- drops created from catering enquiries by convert-catering-enquiry.
--
-- FOUNDATION ONLY: this widens the allowed value set. It does NOT change which
-- Share/activation cards appear for any drop — a converted 'direct' event drop
-- still resolves to the same 'closed' openness (via drop_type='event') and the
-- same [3,7,9] card profile it had when audience_scope was null. The
-- direct-specific card behaviour is a later step.
--
-- Existing values are unchanged: NULL, 'public' and 'community' all remain
-- valid. No backfill — 'direct' applies to NEW catering conversions only, so
-- no genuine event drop is mislabelled.
--
-- The current CHECK constraint on audience_scope was created ad hoc (it is not
-- defined by any repo migration), so its exact name is not known from source.
-- This migration drops ANY check constraint on public.drops that references
-- audience_scope, whatever its name, then recreates the canonical widened one.
-- It is safe if no such constraint currently exists (the loop finds nothing and
-- the ADD simply installs the constraint for the first time).
--
-- BEFORE RUNNING (dev first), inspect the current constraint(s) to confirm the
-- name/definition this replaces:
--
--   SELECT conname, pg_get_constraintdef(oid) AS def
--   FROM pg_constraint
--   WHERE conrelid = 'public.drops'::regclass
--     AND contype = 'c'
--     AND pg_get_constraintdef(oid) ILIKE '%audience_scope%';

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.drops'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%audience_scope%'
  LOOP
    EXECUTE format('ALTER TABLE public.drops DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.drops
  ADD CONSTRAINT drops_audience_scope_check
  CHECK (audience_scope IS NULL OR audience_scope IN ('public', 'community', 'direct'));
