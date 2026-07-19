-- T-CAP-1 (PR4) — vendor-authored FAQ.
--
-- Vendors write their own questions and answers on the Brand page; the
-- permanent vendor page (vendor.html, via get-vendor-page) renders them. This
-- was deliberately held back from PR3 rather than shipping invented copy as
-- the vendor's own words.
--
-- Shape: a jsonb ARRAY of objects, each { "q": string, "a": string }, in the
-- order the vendor arranged them. Order is meaningful — the array carries it.
--
-- The CHECK asserts only that the value is a jsonb array, never an object or a
-- scalar. The inner shape (string q / string a, trimming, per-field length
-- caps, the 8-entry maximum, and dropping half-filled rows) is validated in the
-- update-vendor Edge Function, which is the sole write path. Duplicating that
-- validation in SQL would give two sources of truth that drift apart; the DB's
-- job here is to guarantee the container type the readers iterate over.
--
-- NOT NULL DEFAULT '[]'::jsonb means every existing vendor gets an empty array
-- with no backfill, and every reader can iterate without a null guard. An empty
-- array renders NOTHING on the public page — vendor.html hides the entire
-- section, heading included, so a vendor who never opens this editor is
-- unchanged by this migration.

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS faq jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.vendors
  DROP CONSTRAINT IF EXISTS vendors_faq_is_array;

ALTER TABLE public.vendors
  ADD CONSTRAINT vendors_faq_is_array
  CHECK (jsonb_typeof(faq) = 'array');

COMMENT ON COLUMN public.vendors.faq IS
  'Vendor-authored FAQ rendered on the permanent vendor page. jsonb array of {"q","a"} objects, order-significant. Entry shape, trimming, 8-entry max and length caps (q 200 / a 1000) are enforced by the update-vendor Edge Function; empty array means the FAQ section is hidden entirely.';
