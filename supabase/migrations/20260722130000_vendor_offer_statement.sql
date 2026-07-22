-- T-vendor-offer-statement (Ticket 1, PR1) — customer-facing vendor offer
-- statement. A clean ADD: verified before authoring that no column named
-- offer_statement, about, description or bio exists on public.vendors, and that
-- nothing in the repo references such a name. This does NOT repurpose any of
-- the orphan brand columns (brand_headline / primary_color / logo_asset_url) —
-- that drift is a separate ticket and is left untouched here.
--
-- The field describes the VENDOR'S OFFER, not the Hearth mechanic. "Healthy
-- Habits releases fresh meals at set times you order ahead for" — not "a drop
-- is a time-bound pre-order window". The Brand editor's label, helper and
-- placeholder encode that; this comment records why, because the distinction is
-- the whole reason the column exists and is easy to lose.
--
-- Nullable, no default, no backfill, and DELIBERATELY no length constraint.
-- Both live vendors correctly start NULL: they have not written one. NULL is a
-- supported end state — the pages render nothing at all rather than a gap
-- (PR2). A default would put words in the vendor's mouth, which is the one
-- thing this field must never do.
--
-- Length is unconstrained on purpose, unlike qr_card_line (60 chars, backed by
-- a CHECK) — that one is bounded by a fixed-width printed artefact, this is a
-- paragraph on a page that reflows. The Brand editor shows an advisory ~200
-- character counter with no maxlength; nothing rejects a longer statement.

alter table public.vendors
  add column if not exists offer_statement text;

comment on column public.vendors.offer_statement is
  'Customer-facing: short vendor-authored description of what they offer, framed as the vendor offer (not the Hearth mechanic). Edited in Brand via update-vendor; read by get-vendor-page and v_vendor_public; rendered on vendor + order pages (PR2). Nullable — absent renders nothing.';

-- Expose offer_statement on the order page's read path (v_vendor_public).
--
-- The view PREDATES the migrations directory — no committed migration creates
-- it (20260627194122 only re-grants it) and there is no base-DDL dump in the
-- repo, so its definition was captured from live via pg_get_viewdef before this
-- section was authored. Every existing column, name and position below is
-- verbatim from that capture; offer_statement is appended LAST and nothing else
-- changes, which is what lets `create or replace view` succeed without a drop
-- and guarantees no existing consumer breaks. Both known consumers
-- (order.html:2668, catering-enquiry.html:566) select their columns by name, so
-- an appended column is invisible to them.
--
-- Not `select *`: the view's entire safety mechanism is column restriction —
-- it is a DEFINER view the anon role reads, so a widened projection is a PII
-- leak, not a convenience. No email, no contact fields, no auth_user_id, no
-- stripe_*.

-- Captured definition (pg_get_viewdef, live, 2026-07-22): a plain
-- SELECT <23 columns> FROM vendors — no UNION, no GROUP BY, no join — so an
-- appended column is structurally safe. Several of those columns are the orphan
-- brand set (brand_headline, brand_subheadline, primary_color, secondary_color,
-- accent_color, text_on_brand, logo_asset_url, hero_asset_url, brand_logo_url,
-- brand_tagline). They are reproduced VERBATIM and left alone: removing them
-- here would be a second, unrelated change riding along, and their retirement
-- belongs to T-vendors-brand-column-drift-cleanup.

create or replace view public.v_vendor_public as
select
  id,
  slug,
  name,
  display_name,
  tagline,
  brand_headline,
  brand_subheadline,
  primary_color,
  secondary_color,
  accent_color,
  text_on_brand,
  logo_url,
  hero_image_url,
  brand_primary_color,
  brand_secondary_color,
  logo_asset_url,
  hero_asset_url,
  brand_text_on_primary,
  brand_logo_url,
  brand_tagline,
  order_label,
  powered_by_hearth_visible,
  website_url,
  offer_statement
from vendors;
