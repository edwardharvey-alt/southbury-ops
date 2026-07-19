-- Fundraising: name the cause, and hold a private remittance reference.
--
-- Today a drop can say HOW MUCH it raises (fundraising_model +
-- fundraising_per_order_pence | fundraising_percentage) but not WHO the money
-- goes to. The only place the beneficiary appears is inside the free-text
-- fundraising_display_text, hand-written per drop — the live Gather Cafe drop
-- reads "Funds raised go to support your local youth club", with the cause
-- buried in prose that no view can read, group by, or total. These two columns
-- make the cause structured data.
--
-- fundraising_cause_name — PUBLIC. The beneficiary or appeal the money
-- supports, as a customer should see it: "Southbury Food Bank", or
-- "Southbury Food Bank – Winter Appeal". This is the field a customer-facing
-- view may expose so the order page can compose an accurate contribution line
-- instead of relying on the vendor to restate it in display text.
--
-- fundraising_cause_reference — PRIVATE, OPERATOR-ONLY. A URL, registered
-- charity number, or remittance note: how the vendor actually gets the money to
-- the cause. It exists for the vendor's own records and for reconciliation.
-- It MUST NOT be added to v_drop_public or to any other anon-readable view, and
-- MUST NOT be returned by get-vendor-page, host-view-summary, or any customer-
-- or host-facing Edge Function projection. There is no customer question it
-- answers, and a charity number or internal remittance note on a public page is
-- a disclosure with no upside.
--
-- BOTH NULLABLE, deliberately. "Required when fundraising is on" is enforced in
-- the app layer, exactly as fundraising_display_text is today — see the
-- fundraising_enabled === true branch in supabase/functions/update-drop/index.ts
-- (~line 407), which already rejects a missing model, a non-positive amount, and
-- an empty display text. A NOT NULL column could not express "required only
-- when the flag is on" without a table-level CHECK, and a CHECK would put that
-- rule in two places that drift apart. The DB's job here is to hold the value.
--
-- EXISTING DROPS ARE UNAFFECTED. Nullable with no default and no backfill, so
-- every existing row gets NULL and nothing is rewritten. No view, Edge Function
-- or page reads these columns yet, so adding them changes no current behaviour:
-- the customer order page and the host page render exactly as they do now.
-- Adding a column cannot break a `select('*')` reader, and every narrowed
-- column list in the codebase is unaffected because none of them names these.
--
-- NOT DONE HERE, and required before anything can write these fields: neither
-- column is in update-drop's ALLOWED_FIELDS, so both are silently stripped on
-- save until that whitelist is widened (operational learning #26 — a schema
-- change has a write side and a read side, and either alone is silently
-- broken). That is a paired Edge Function change and follows the
-- deploy-before-merge workflow, so it is deliberately not bundled into this
-- migration.
--
-- SEE ALSO: drops.fundraising_notes and drops.host_share_notes are dormant
-- columns in the same family — nullable text, no code references, absent from
-- every Edge Function whitelist, therefore unwritable. fundraising_cause_reference
-- overlaps fundraising_notes in spirit. They are deliberately left untouched
-- here; whether the structured fields replace them or a free-form notes field
-- is still wanted is an open decision, tracked as T-fundraising-notes-overlap
-- in BACKLOG.md.

ALTER TABLE public.drops
  ADD COLUMN IF NOT EXISTS fundraising_cause_name text;

ALTER TABLE public.drops
  ADD COLUMN IF NOT EXISTS fundraising_cause_reference text;

COMMENT ON COLUMN public.drops.fundraising_cause_name IS
  'PUBLIC. Beneficiary or appeal the fundraising supports, as shown to customers (e.g. "Southbury Food Bank - Winter Appeal"). Safe to expose in customer-facing views. Nullable; required-when-fundraising-enabled is enforced in the update-drop Edge Function, mirroring fundraising_display_text.';

COMMENT ON COLUMN public.drops.fundraising_cause_reference IS
  'PRIVATE / OPERATOR-ONLY. URL, charity number or remittance note recording how funds reach the cause. MUST NOT be added to v_drop_public or any anon-readable view, and MUST NOT be returned by any customer- or host-facing Edge Function projection. Nullable; never customer-visible.';
