-- T-vendor-is-internal — distinguish Hearth's own test records from real vendors.
--
-- WHY NOW: the permanent vendor page (T-CAP-1) turned every vendor record into
-- a public storefront, and the clean guessable URL (lovehearth.co.uk/{slug})
-- makes each one trivially discoverable. Test records must not reach search
-- engines, must not be counted as vendors in admin surfaces, and must never
-- pollute Insights. Before this column there was no way to ask "is this a real
-- vendor?" other than reading the slug and guessing.
--
-- CLASSIFICATION, NOT LIFECYCLE. `status` and `is_internal` are ORTHOGONAL and
-- neither substitutes for the other:
--   status      — is this vendor live / suspended / archived? (lifecycle)
--   is_internal — is this Hearth's own test record or a real vendor? (identity)
-- Internal vendors are deliberately kept status='active' precisely so the
-- ACTIVE path stays testable. Marking them inactive instead would hide them
-- from the very surfaces they exist to exercise (get-vendor-page 404s any
-- explicitly-inactive vendor), so the two concepts must not be collapsed.
--
-- NOT NULL DEFAULT false means every existing and future vendor is real unless
-- explicitly marked otherwise, and every reader can test the flag without a
-- null guard. Defaulting the other way would silently hide a real vendor on
-- insert — the failure mode that actually costs money.

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.vendors.is_internal IS
  'TRUE for Hearth''s own test/demo vendor records, FALSE for real vendors. Classification, NOT lifecycle: `status` governs live/suspended/archived, `is_internal` governs real-vs-test. The two are orthogonal — internal vendors are deliberately kept active so the active path remains testable. Consumers: vendor.html emits <meta name="robots" content="noindex, nofollow"> when true; admin vendor counts and Insights should exclude internal records.';

-- Backfill. An EXPLICIT slug list, never a LIKE pattern on 'test%' — a pattern
-- is fragile and would silently capture a future real vendor whose name merely
-- begins with those characters. Adding a new internal vendor later is a
-- deliberate one-line UPDATE, which is the correct amount of friction.
--
-- These six are the complete set of internal records as of 2026-07-19. The two
-- real vendors — 'gather' and 'healthy-habits' — are deliberately absent and
-- must never be added here.
UPDATE public.vendors
   SET is_internal = true
 WHERE slug IN (
   'test-11',
   'test-12',
   'southbury-farm-pizza',
   'eds-creamy-nuts',
   'jigsaw-mega-sausages',
   'catering-direct'
 );
