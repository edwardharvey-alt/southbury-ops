-- T5-11 slice 1 — comms_log: the platform's transactional/relationship
-- comms audit + dedupe ledger. First consumer is dispatch-interest-open
-- (emails interest-registrants when their drop's ordering opens), but the
-- table is touchpoint-agnostic so every future comms trigger logs here.
--
-- Dedupe model: one row per (touchpoint, drop, customer, channel), keyed by
-- a caller-built `dedupe_key`. Dispatchers claim work with
-- INSERT ... ON CONFLICT (dedupe_key) DO NOTHING RETURNING id — a returned
-- row means "this caller owns the send"; no row means "already handled, skip".
--
-- Access: service-role only. RLS is enabled with NO policies (mirrors the
-- `admins` table) so only the service-role client used by Edge Functions can
-- read or write — there is no frontend access path.

CREATE TABLE IF NOT EXISTS comms_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_id     uuid NOT NULL REFERENCES drops(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  touchpoint  text NOT NULL,
  channel     text NOT NULL,
  recipient   text NOT NULL,
  dedupe_key  text NOT NULL,
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at     timestamptz,
  error       text,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Conflict target for the claim-by-insert dedupe pattern.
CREATE UNIQUE INDEX IF NOT EXISTS idx_comms_log_dedupe_key
  ON comms_log (dedupe_key);

-- Common read pattern: "what has been sent for this drop / touchpoint".
CREATE INDEX IF NOT EXISTS idx_comms_log_drop_touchpoint
  ON comms_log (drop_id, touchpoint);

ALTER TABLE comms_log ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only.
