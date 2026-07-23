-- T-vendor-location-contact: structured public location + contact for the vendor page.
--
-- `address` is REDEFINED here as the STREET LINE only. It previously held a full
-- composed address (street + town + postcode) captured at onboarding Stage 4.
-- Existing composed values are deliberately NOT migrated: the display composition
-- omits absent parts, so a row with a composed `address` and empty town/postcode
-- renders exactly as it does today. Operators re-enter the split values in Brand
-- at their convenience. No backfill, no parse, no data migration.
--
-- All nullable and optional by design: a home baker or food truck may not want a
-- street address public, and absent fields render nothing.
alter table public.vendors
  add column if not exists town          text,
  add column if not exists postcode      text,
  add column if not exists contact_email text;

comment on column public.vendors.address is
  'Public: STREET LINE only (e.g. "14 High Street"). Historically held a full composed address from onboarding Stage 4; legacy composed values remain until re-entered in Brand and render correctly because composition omits absent parts. Maps to streetAddress for JSON-LD (Ticket 2a). Nullable.';

comment on column public.vendors.town is
  'Public: vendor town or city. Maps to addressLocality for JSON-LD and to the town element of the vendor page title (Ticket 2a). Nullable.';

comment on column public.vendors.postcode is
  'Public: vendor postcode. Maps to postalCode for JSON-LD (Ticket 2a). Nullable.';

comment on column public.vendors.contact_email is
  'Public: customer-facing contact address, edited in Brand. DISTINCT from vendors.email, which is the account/login email and must NEVER be surfaced publicly. Nullable.';
