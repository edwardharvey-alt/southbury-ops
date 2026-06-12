CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Idempotent lifecycle transitions. Touches only live/closed rows; never draft/cancelled/archived.
CREATE OR REPLACE FUNCTION advance_drop_lifecycle()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Complete first (terminal): delivery is done. Covers live rows with a null closes_at too.
  UPDATE drops SET status = 'completed'
  WHERE status IN ('live','closed')
    AND delivery_end IS NOT NULL
    AND delivery_end < now();

  -- Then close: ordering has shut but delivery hasn't happened yet.
  UPDATE drops SET status = 'closed'
  WHERE status = 'live'
    AND closes_at IS NOT NULL
    AND closes_at < now()
    AND (delivery_end IS NULL OR delivery_end >= now());
END;
$$;

-- Run every 15 minutes.
SELECT cron.schedule('advance-drop-lifecycle', '*/15 * * * *', 'SELECT advance_drop_lifecycle();');
