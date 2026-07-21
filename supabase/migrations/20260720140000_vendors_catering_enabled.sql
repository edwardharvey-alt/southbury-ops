-- T-vendor-page-catering-link — vendor-declared catering.
--
-- Catering has been unconditionally live for every vendor since it shipped:
-- there was no flag anywhere, so catering-enquiry.html was reachable for any
-- vendor whether or not they actually cater. This column lets a vendor DECLARE,
-- explicitly, that they offer catering — and only then does a catering enquiry
-- link appear on their public page (vendor.html, via get-vendor-page).
--
-- The declaration is Hearth-frames-vendor-fills: nothing derived, no proxy for
-- commercial intent. The vendor sets it themselves on the Enquiries page, beside
-- the enquiry poster and enquiry list it governs.
--
-- NOT NULL DEFAULT false means every existing vendor gets false with no backfill
-- and NO catering CTA they did not ask for — neither live vendor's page changes
-- on merge. Ed sets the flag per vendor by hand after speaking to each of them.
--
-- Follows the vendors.faq pattern (20260719120000): the update-vendor Edge
-- Function is the sole write path and validates the value (boolean only); the
-- column type is the container guarantee the readers rely on.

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS catering_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.vendors.catering_enabled IS
  'Vendor-declared: they offer catering. When true, vendor.html renders a catering enquiry link (via get-vendor-page). Default false — no vendor gets a catering CTA they did not ask for. Sole write path is the update-vendor Edge Function (boolean validation).';
