# Hearth — Database Schema

A reference for the Hearth Postgres database (Supabase project
`tvqhhjvumgumyetvpgid`). Built so any Claude session can understand
the shape of the data before writing a query.

This document is the orientation layer. The full column-level CSV
export is the source of truth — regenerate it any time the schema
changes meaningfully.

---

## How to regenerate

Run this in the Supabase SQL Editor and export the result as CSV.
Replace this document with a refresh whenever a meaningful migration
lands.

```sql
SELECT
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default,
  fk.foreign_table_name,
  fk.foreign_column_name
FROM information_schema.columns c
LEFT JOIN (
  SELECT
    kcu.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
) fk
  ON fk.table_name = c.table_name
  AND fk.column_name = c.column_name
WHERE c.table_schema = 'public'
  AND c.table_name NOT LIKE 'pg_%'
ORDER BY c.table_name, c.ordinal_position;
```

---

## Domain map

The public schema groups into seven domains. Knowing which domain a
table belongs to tells you most of what you need before writing a
query.

**Vendors** — `vendors`. The root identity of every operator. Most
other tables hang off this either directly or through a parent.

**Catalog** — `products`, `bundles`, `bundle_lines`,
`bundle_line_choice_products`, `categories`. Vendor-owned menu
material that exists independently of any drop.

**Drops** — `drops`, `drop_menu_items`, `drop_products`,
`drop_series`, `drop_series_schedule`. The core unit of operation. A
drop is a planned moment with a window, capacity, host, and menu.

**Orders** — `orders`, `order_items`, `order_item_selections`,
`order_status_events`. Customer-placed orders against a specific
drop, with a full audit trail of state transitions.

**Customers** — `customers`, `customer_relationships`. Platform-wide
customer records linked to vendors (and other owner types) via a
polymorphic relationship table.

**Hosts** — `hosts`. Community venues, clubs, schools, and event
contexts. Now vendor-scoped (see Vendor scoping below — this changed
recently).

**Auth & onboarding state** — lives on the `vendors` table itself
(`auth_user_id`, `onboarding_completed`, `terms_accepted`,
`stripe_onboarding_complete`, plus the onboarding answer columns).

---

## Vendor scoping — the most important section

Every Hearth query that returns vendor-scoped data needs to filter
by the active vendor. The mechanism for that filter is not the same
across all tables. Get this wrong and you either leak cross-vendor
data or write a query that returns nothing.

The four patterns:

**Direct `vendor_id` column.** The simplest case. Filter with
`.eq('vendor_id', state.vendorId)`. Applies to: `vendors` itself
(via `id`), `products`, `bundles`, `categories`, `drops`,
`drop_series`, `hosts`.

**Via parent table.** The table has no `vendor_id` of its own —
scope by joining through its parent.
- `orders` → `drops` → `vendor_id`. Pattern:
  `.in('drop_id', vendorDropIds)` after a separate fetch of drop IDs.
- `order_items` → `orders` → `drops` → `vendor_id`.
- `order_status_events` → `orders` → `drops` → `vendor_id`.
- `order_item_selections` → `order_items` → `orders` → `drops` → `vendor_id`.
- `drop_menu_items` → `drops` → `vendor_id`.
- `drop_products` → `drops` → `vendor_id`.
- `drop_series_schedule` → `drop_series` → `vendor_id`.
- `bundle_lines` → `bundles` → `vendor_id`.
- `bundle_line_choice_products` → `bundle_lines` → `bundles` → `vendor_id`.

**Polymorphic owner.** `customer_relationships` uses
`owner_id` + `owner_type`. There is no `vendor_id` column. Filter
with `.eq('owner_id', state.vendorId).eq('owner_type', 'vendor')`.
The polymorphic shape is intentional — it lets future owner types
(host audiences, communities) reuse the same relationship table.

**Platform-wide (no vendor scope).** `customers` is a global table.
A single email might be a customer of multiple vendors. To find a
specific vendor's customers, query `customer_relationships` first
and join back.

---

## Vendors

The root of everything. `vendors.id` is the foreign key target for
most other tables.

**Identity** — `slug`, `name`, `display_name`, `tagline`,
`contact_phone`, `address`, `email`, `website_url`, `social_handles`
(jsonb).

**Brand** — multiple generations of brand columns coexist:
`brand_primary_color`, `brand_secondary_color`,
`brand_text_on_primary`, `brand_logo_url`, `brand_tagline`,
`hero_asset_url`, `logo_asset_url`. Older legacy columns also
present: `primary_color`, `secondary_color`, `accent_color`,
`text_on_brand`, `logo_url`, `hero_image_url`. See "Schema
observations" below.

**Auth & lifecycle** — `auth_user_id` (uuid, nullable, links to
`auth.users.id`), `onboarding_completed`, `terms_accepted`,
`terms_accepted_at`, `status`, `head_start_dismissed`.

**Stripe** — `stripe_account_id` (text, nullable),
`stripe_onboarding_complete` (NOT NULL DEFAULT false). Partial index
on `stripe_account_id` where not null.

**Onboarding answers** — `vendor_type`, `data_posture`,
`delivery_model`, `customer_data_posture`, `customer_geography`,
`primary_goal` (text array), `typical_capacity_range`,
`preferred_fulfilment`, `preferred_cadence`,
`existing_host_contexts` (text array), `existing_host_details`
(jsonb), `pos_platform`, `pos_platform_other`, `order_label`.

`primary_goal` and `existing_host_contexts` are PostgreSQL ARRAY
columns — query with array operators (`@>`, `&&`), not equality.

---

## Catalog

**products** — vendor-owned menu items. `vendor_id` (FK), `name`,
`description`, `category_id` (FK to `categories`), `category` (text,
legacy), `price_pence`, `capacity_units` (numeric, NOT NULL DEFAULT 1),
`is_active`, `sort_order`, `travels_well`, `suitable_for_collection`,
`prep_complexity` (text, default 'standard').

**bundles** — fixed or choose-your-own combinations.
`vendor_id` (FK, nullable — note this; older bundles may not have it
set), `name`, `description`, `category_id` (FK), `price_pence`,
`capacity_units`, `is_active`, `sort_order`.

**bundle_lines** — the slots inside a bundle.
`bundle_id` (FK), `label`, `line_type`, `product_id` (FK, nullable),
`category_id` (FK, nullable), `quantity`, `min_choices`,
`max_choices`, `is_required`, `drives_capacity`, `sort_order`.
A line is either a fixed product (`product_id` set), a category
choice (`category_id` set), or a free-choice slot.

**bundle_line_choice_products** — for choice lines, the specific
products available. `bundle_line_id` (FK), `product_id` (FK),
`sort_order`.

**categories** — vendor-owned groupings used both for menu structure
and for capacity categorisation on drops. `vendor_id` (FK), `name`,
`slug`, `is_active`, `sort_order`.

---

## Drops

**drops** is the central table. Critical columns:

- **Identity** — `id`, `slug`, `name`, `vendor_id` (FK),
  `host_id` (FK to `hosts`).
- **Type & status** — `drop_type` (default 'neighbourhood'),
  `status` (default 'draft'), `published_at`, `closed_at`,
  `archived_at`.
- **Timing** — `opens_at`, `closes_at`, `cutoff_time`,
  `delivery_start`, `delivery_end`.
- **Capacity** — `capacity_units_total` (current),
  `capacity_category` (text, nullable, no default — must be set
  before the drop is published, but optional at draft; the publish
  gate in `drop-manager.html:getLiveReadiness` enforces this),
  `capacity_category_id` (FK to `categories`, current). Older
  `capacity_pizzas` and `max_orders` columns also still present.
- **Geography** — `is_radius_restricted`, `radius_km`,
  `centre_postcode`, `fulfilment_mode`,
  `collection_point_description`, `delivery_area_description`.
- **Fundraising** — `fundraising_enabled`, `fundraising_model`,
  `fundraising_percentage`, `fundraising_per_order_pence`,
  `fundraising_display_text`, `fundraising_notes`.
- **Host share** — `host_share_enabled`, `host_share_model`,
  `host_share_percentage`, `host_share_per_order_pence`,
  `host_share_fixed_pence`, `host_share_customer_visible`,
  `host_share_notes`.
- **Series** — `series_id`, `series_position` (no FK declared on
  `series_id` — it should reference `drop_series.id`).
- **Multi-window events** — `window_group_id` (no FK declared,
  groups drops created from the same event window UI).
- **Misc** — `notes_internal`, `customer_notes_enabled` (default true).

**drop_menu_items** — current menu-item table. `drop_id` (FK),
`item_type` and `menu_item_type` (both present — see observations),
`product_id` (FK, nullable), `bundle_id` (FK, nullable),
`is_available`, `price_override_pence`, `stock_limit`, `sort_order`.

**drop_products** — older product-only menu-item table. Two unique
constraints (`drop_id, product_id`) and (`drop_id, bundle_id`).
Status of this table relative to `drop_menu_items` is unclear — see
observations.

**drop_series** — recurring schedule definition. `vendor_id` (uuid
NOT NULL, but no FK constraint declared in `information_schema` —
should reference `vendors.id`). `name`, `start_date`, `end_date`.

**drop_series_schedule** — the days of the week and times for a
series. The foreign key column is named `series_id`, not
`drop_series_id`. `day_of_week` (integer, 0–6), `fulfilment_start`,
`fulfilment_end`, `order_close_time`.

---

## Orders

**orders** — one row per customer order against a specific drop.
- **Link** — `drop_id` (FK), `customer_id` (FK to `customers`,
  nullable). No `vendor_id` — scope via `drop_id`.
- **Customer fields** — `customer_name`, `customer_phone` (NOT NULL),
  `customer_email`, `customer_postcode`, `customer_notes`,
  `delivery_address`. `pizzas` (integer, NOT NULL, legacy capacity
  unit field — populate with order's capacity unit count, minimum 1).
- **Status & meta** — `status` (default 'placed'), `order_source`
  (default 'order_page'), `created_at`.
- **Fulfilment** — `fulfilment_mode`, `delivery_address`,
  `total_pence`.
- **Stripe** — `stripe_session_id`, `stripe_payment_status`.
- **Marketing** — `contact_opt_in` (default false),
  `contact_opt_in_scope` (default 'both').

**order_items** — line items for an order. `order_id` (FK),
`item_type` (NOT NULL), `product_id` (FK, nullable),
`bundle_id` (FK, nullable), `qty` (NOT NULL DEFAULT 1),
`price_pence`, `item_name_snapshot` (string captured at order time),
`capacity_units_snapshot` (numeric captured at order time).
Snapshots exist so historical orders survive product edits and
deletes.

**order_item_selections** — for bundle line items, the specific
choices the customer made. `order_item_id` (FK),
`bundle_line_id` (FK), `selected_product_id` (FK), `quantity`.

**order_status_events** — append-only audit trail of order status
transitions. `order_id` (FK), `drop_id` (FK), `from_status`,
`to_status` (NOT NULL), `event_type` (default 'status_change'),
`actor`, `actor_type` (default 'operator'), `created_at`.

---

## Customers

**customers** — platform-wide customer records. `name` (NOT NULL —
note this; an email-only signup pathway would need to provide a
placeholder), `email` (NOT NULL), `phone`, `address`, `postcode`.
No `vendor_id`. The same email can have one customers row and many
relationships across many vendors.

**customer_relationships** — the link from a customer to whoever
"owns" the relationship. Polymorphic.
- `customer_id` (FK to `customers`).
- `owner_id` (uuid, no FK constraint — points at vendors when
  owner_type is 'vendor', will point at hosts or communities later).
- `owner_type` (text, NOT NULL — 'vendor' today, 'host' / 'community'
  reserved for future).
- `consent_status` (default 'pending') — values: 'pending',
  'granted', 'imported', 'revoked'.
- `source` (NOT NULL) — values include 'order', 'import',
  'interest' (T5-8), 'community_invite' (T5-18, future).
- `lawful_basis` — populated for imported records (T4-14).

The standard vendor-customer query:
```javascript
const { data } = await sb
  .from('customer_relationships')
  .select('customer_id, consent_status, source, customers(*)')
  .eq('owner_id', state.vendorId)
  .eq('owner_type', 'vendor');
```

---

## Hosts

**hosts** — community venues and contexts. Now vendor-scoped:
`vendor_id` is **NOT NULL**. This is recent — the previous model
had hosts as platform-wide entities.

- **Identity** — `name` (NOT NULL), `slug`, `host_type` (NOT NULL —
  values: club, pub, school, venue, neighbourhood, event, other),
  `vendor_id` (FK, NOT NULL), `created_by_vendor_id` (FK, nullable —
  recent migration kept this for audit; new rows should set both).
- **Status** — `status` (default 'active' — 'active', 'inactive',
  'archived'), `relationship_status` (default 'prospect' —
  'prospect', 'active', 'paused'), `onboarding_completed`,
  `terms_accepted`, `terms_accepted_at`.
- **Location & contact** — `postcode`, `address_summary`,
  `contact_name`, `contact_email`, `contact_phone`, `website_url`,
  `social_handles` (jsonb).
- **Audience** — `audience_description`, `estimated_audience_size`,
  `audience_tags` (jsonb array), `service_windows` (jsonb array),
  `comms_channels` (jsonb array), `notes_internal`.

The unique constraint on hosts is `(vendor_id, slug)`, not `slug`
alone. Two vendors can each have a host with slug `the-bell`.

---

## Views

Views are how the operator pages avoid hand-rolling joins. They're
also where vendor scoping safety lives or fails — none of these
views have RLS. The frontend is the only thing scoping them.

**v_drop_summary** — the primary drop view, used across every
operator page. Includes drop core fields plus host name, vendor
name, capacity calculations, fundraising and host-share fields,
order count, and GMV. **Reads as a list MUST filter by `vendor_id`.**
Fetches by `id` MUST additionally assert
`row.vendor_id === state.vendorId` after the fetch (defends against
stale cached drop IDs pointing at another vendor's drop).

**v_drop_orders_summary** / **v_drop_orders_summary_v2** — order
list for the Service Board. v2 is current.

**v_drop_menu_item_stock** — menu items for a drop with capacity,
pricing, and stock-remaining calculations. Used by Drop Studio menu
configuration.

**v_drop_menu_items_enriched** — menu items joined with category
and product/bundle metadata.

**v_drop_readiness** / **v_drop_readiness_v2** — boolean checklist
for whether a drop is ready to publish. v2 is current.

**v_drop_capacity_usage** / **v_drop_capacity_usage_v2** — capacity
calculations. v2 is current.

**v_drop_menu_summary_v2** — aggregate counts and revenue per
drop's menu.

**v_drop_production_queue** — items to make for a live drop,
grouped by category.

**v_drop_product_queue** / **v_drop_product_stock** — older
product-only versions; production queue and menu stock have v2/menu
equivalents.

**v_drop_fundraising_summary** — per-drop fundraising and host-share
totals.

**v_hearth_summary** — 30-day vendor business summary (revenue,
drops, capacity utilisation). Used on home and insights.

**v_hearth_drop_stats** — per-drop analytics for Insights.

**v_hearth_revenue_over_time** — daily revenue series for Insights
charts.

**v_hearth_drop_capacity_usage** — vendor-level capacity utilisation.

**v_host_performance** — host-level analytics (drops run, revenue,
average capacity utilisation).

**v_item_sales** — item-level sales aggregation for Insights.

**v_menu_library_items** — unified product/bundle list for Menu
Library, with sales analytics joined in.

**v_order_item_detail** / **v_order_item_detail_v2** /
**v_order_item_detail_expanded** — order line detail at increasing
levels of bundle expansion. v2 includes both products and bundles;
expanded breaks bundles into their selected products.

**v_order_menu_item_detail** — order items joined with menu metadata.

**v_order_item_selections_detail** — bundle line selections with
product names resolved.

**v_order_item_enriched** — order items joined with drop and vendor
metadata for analytics.

**v_product_analytics** / **v_bundle_analytics** — sales aggregates
per product / per bundle.

**v_products_enriched** / **v_bundles_enriched** /
**v_bundle_lines_enriched** /
**v_bundle_line_choice_products_enriched** — catalog with category
metadata joined in. Used in Menu Library.

---

## Schema observations

Things that work today but would benefit from cleanup. Not urgent —
flagged so they don't get repeatedly re-discovered.

**Multiple generations of brand columns on `vendors`.** Three
overlapping sets exist: original (`primary_color`, `logo_url`,
`hero_image_url` etc.), a `brand_*` prefix generation
(`brand_primary_color`, `brand_logo_url`), and `*_asset_url`
variants (`logo_asset_url`, `hero_asset_url`). Brand Hearth writes
should pick one canonical set and the others should be migrated and
dropped. Today the frontend has to know which generation to read
from.

**`drop_capacity` table.** Listed as a table but every column is
nullable, no FKs are declared, and the column names use legacy
pizza vocabulary (`capacity_pizzas`, `pizzas_ordered`,
`pizzas_remaining`). Almost certainly a legacy view that didn't get
the `v_` prefix. Should be confirmed and either renamed or dropped.

**`drop_products` vs `drop_menu_items`.** Both tables exist.
`drop_menu_items` is the current model (handles products and
bundles). `drop_products` looks like a predecessor. CLAUDE.md
references `drop_menu_items` as current. `drop_products` should
either be confirmed as deprecated and removed, or its purpose
documented.

**`drop_menu_items` has both `item_type` and `menu_item_type`
columns.** Both NOT NULL. Likely one is legacy and the other current
— needs confirmation. Writing to the wrong one (or only one)
silently breaks downstream views.

**Missing FK constraints.** Several columns look like they should
be foreign keys but aren't declared as such:
- `drops.series_id` should reference `drop_series.id`.
- `drops.window_group_id` is intentionally not an FK (groups drops
  by a shared UUID generated client-side) — that's fine.
- `drop_series.vendor_id` should reference `vendors.id`.
- `customer_relationships.owner_id` is intentionally polymorphic
  (no FK possible) — that's fine.
- `vendors.auth_user_id` should reference `auth.users.id` — but
  cross-schema FKs to the `auth` schema are sometimes deliberately
  omitted. Confirm whether Supabase recommends this.

**Legacy `orders.pizzas` column.** NOT NULL with a `>= 1` check
constraint. Currently populated with the order's capacity unit
count (minimum 1) on insert. Needs a migration to drop the
constraint, then drop the column, once no code path reads from it.

**Legacy `drops.capacity_pizzas` and `drops.max_orders` columns.**
NOT NULL DEFAULT 40. Superseded by `capacity_units_total` and
`capacity_category` / `capacity_category_id`. Same migration story
as `orders.pizzas`.

**`bundles.vendor_id` is nullable.** `products.vendor_id` is also
nullable, but products in practice always have one. Bundles too.
Could be tightened to NOT NULL once any orphan rows are cleaned up.

**`hosts.created_by_vendor_id` alongside `hosts.vendor_id`.** Both
are FKs to vendors. After the recent vendor-scoping migration, new
rows set both. Worth deciding whether `created_by_vendor_id` is
still meaningful or whether `vendor_id` covers everything it needs
to.

---

## Gotchas

Real bugs that have hit Hearth in production. Treat as hard rules.

**Orders link to vendors via drops, not directly.** No `vendor_id`
column on `orders`. To filter orders by vendor: fetch drop IDs from
`drops` first, then `.in('drop_id', vendorDropIds)`.

**`customer_relationships` uses polymorphic ownership.** No
`vendor_id` column. Filter with
`.eq('owner_id', state.vendorId).eq('owner_type', 'vendor')`. Future
owner types (host, community) will reuse this table.

**`customers` is platform-wide.** No `vendor_id`. Two vendors who
both have a customer with the same email share the customer row but
have separate `customer_relationships` entries.

**`drop_series_schedule` foreign key is `series_id`, not
`drop_series_id`.** Caught us during a cleanup query.

**`v_drop_summary` has no RLS.** Any list query against it must
include `.eq('vendor_id', state.vendorId)`. Fetches by `id` must
additionally assert vendor ownership after the fetch — defends
against stale `localStorage.hearth:selectedDropId` pointing at
another vendor's drop.

**`orders.pizzas` is NOT NULL with a `>= 1` constraint.** When
inserting orders, populate `pizzas` with the order's capacity unit
count (minimum 1). Don't omit the field.

**`orders.customer_phone` is NOT NULL.** Every order needs a phone.
The order page enforces this.

**`customers.name` and `customers.email` are NOT NULL.** Email-only
or phone-only signup paths would need to provide a placeholder name.

**`drops.capacity_pizzas` is NOT NULL DEFAULT 40 — but
`capacity_units_total` is the current capacity field.** Inserts
that omit `capacity_pizzas` rely on the default; explicit insert
payloads should set both.

**`hosts.vendor_id` is NOT NULL.** Hosts are vendor-scoped now.
Inserts must include `vendor_id`.

**Hosts unique constraint is `(vendor_id, slug)`, not `slug`.** Two
vendors can each own a host with slug `the-bell`.

**`primary_goal` and `existing_host_contexts` on vendors are
ARRAY columns.** Use array operators (`@>`, `&&`) — not equality.

---

## Where to look next

For column-level detail (defaults, exact data types, every column
not summarised here), refer to the CSV export — that's the
authoritative source. This document is the orientation layer.

For RLS policies, run:
```sql
SELECT schemaname, tablename, policyname, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

For triggers, indexes, and check constraints, run:
```sql
-- Triggers
SELECT event_object_table, trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public';

-- Indexes
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- Check constraints
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'c' AND connamespace = 'public'::regnamespace
ORDER BY table_name, conname;
```

These could be folded into a future expanded SCHEMA.md if RLS or
constraints start causing bugs the way column-name guesswork has.
