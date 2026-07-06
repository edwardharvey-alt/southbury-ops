-- Extend comms_log to hold enquiry-stage sends (T-comms-ack-record Part A).
--
-- Until now a comms_log row was always anchored to a drop (drop_id NOT NULL).
-- The catering enquiry ACKNOWLEDGEMENT fires at enquiry time, before any drop
-- exists (and a drop may never exist, if the enquiry is archived), so it had no
-- home in the ledger. This lets one row anchor to EITHER a drop OR an enquiry.
--
-- Safe for existing rows / writers / reads:
--   * Every existing row has drop_id set; enquiry_id defaults NULL, so
--     num_nonnulls(drop_id, enquiry_id) = 1 and every existing row passes the
--     new CHECK.
--   * Existing writers keep setting drop_id and never touch enquiry_id.
--   * Existing reads scope on drop_id (get-drop-comms .eq('drop_id', …)); an
--     enquiry row has NULL drop_id and so never matches a drop-scoped read.
--
-- enquiry_id references catering_enquiries specifically — catering is the first
-- enquiry type. This is deliberately NOT a polymorphic any-enquiry reference; a
-- future enquiry type adds its own typed column and widens the CHECK then.
--
-- BEFORE RUNNING, inspect current constraints on production (should show the
-- drop_id/customer_id FKs and the status CHECK; the dedupe UNIQUE lives in
-- pg_index, and the drop_id NOT NULL is a column attribute, not a pg_constraint
-- row):
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint WHERE conrelid = 'public.comms_log'::regclass;

ALTER TABLE public.comms_log ALTER COLUMN drop_id DROP NOT NULL;

ALTER TABLE public.comms_log
  ADD COLUMN enquiry_id uuid REFERENCES public.catering_enquiries(id) ON DELETE CASCADE;

ALTER TABLE public.comms_log
  ADD CONSTRAINT comms_log_scope_check
  CHECK (num_nonnulls(drop_id, enquiry_id) = 1);

-- Read pattern for enquiry-anchored sends ("what has been sent for this
-- enquiry / touchpoint"), mirroring idx_comms_log_drop_touchpoint. Partial so
-- it stays small — only enquiry rows are indexed here.
CREATE INDEX IF NOT EXISTS idx_comms_log_enquiry_touchpoint
  ON public.comms_log (enquiry_id, touchpoint)
  WHERE enquiry_id IS NOT NULL;
