-- T-CAP-7 : vendor-scoped signals (follow-the-vendor). Purely additive.
--
-- ALREADY APPLIED + verified in production. Committed here so the repo
-- migration history matches live. If `supabase db push` offers to re-run
-- this, repair instead (`supabase migration repair --status applied
-- 20260717120000`) — see CLAUDE.md operational learning #92. The SQL below
-- is reproduced verbatim from the applied statement; do not alter it.

ALTER TABLE public.drop_signals
  ADD COLUMN vendor_id uuid REFERENCES public.vendors(id) ON DELETE CASCADE;
ALTER TABLE public.drop_signals
  ALTER COLUMN drop_id DROP NOT NULL;
ALTER TABLE public.drop_signals
  ADD COLUMN capture_surface text,
  ADD COLUMN capture_state   text;
ALTER TABLE public.drop_signals
  ADD CONSTRAINT drop_signals_vendor_or_drop_chk
  CHECK (vendor_id IS NOT NULL OR drop_id IS NOT NULL);
CREATE UNIQUE INDEX idx_drop_signals_vendor_follow_uq
  ON public.drop_signals (vendor_id, customer_id, kind)
  WHERE drop_id IS NULL;
