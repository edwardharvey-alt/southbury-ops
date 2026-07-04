# Hearth — Product Options (Menu Modifiers)

**Purpose.** Reference for the product-options feature: what it does, its data
model, the surfaces it touches, and the v1 scope boundaries. Written after the
feature shipped so a future session can understand it without re-reading six PRs.

**Status.** Shipped and merged across PRs **#429–#434** (2026-07). Live in
production. The customer, vendor, checkout, receipt and Service Board surfaces
all handle options. This document records the completed state; git log and the
code are authoritative for current behaviour.

**Voice.** Options are a fulfilment concept — what the kitchen makes and what the
customer chose — not a sales lever. No upsell framing, no "add-on" marketing
language. An option is a choice the customer makes about their dish.

---

## What it does

A product can carry one or more **option groups** — a named, required,
pick-exactly-one choice attached to a single product. Examples: a poke bowl's
**Protein** (Salmon +£2, Steak +£3, Tofu +£0), a salad's **Dressing** (all the
same price). Each option carries a **price delta in pence** — `0` for same-price
choices, a positive amount for a priced upgrade. The delta is added to the
product's base price when that option is chosen.

In v1 every group is **required** and **pick-exactly-one** (`min_select = 1`,
`max_select = 1`, `is_required = true`).

**Distinct from bundles.** A bundle groups several *products* into one purchasable
item (e.g. "Family feast" = 2 pizzas + 1 side). An option group is a *choice
within one product* (e.g. which protein goes in this one bowl). They are separate
mechanisms with separate tables, separate editors, and separate render paths —
options never appear on bundle lines (see scope boundaries).

---

## Data model

Three tables, added inert in Stage 1 (migration
`20260704120000_create_product_option_tables.sql`) and wired up in later stages.

- **`product_option_groups`** — a named choice attached to ONE product.
  `product_id` (FK → `products`, `ON DELETE CASCADE`), `name`, `min_select`
  (default 1), `max_select` (default 1), `is_required` (default true),
  `sort_order`, `is_active`.
- **`product_options`** — the choices inside a group. `group_id` (FK →
  `product_option_groups`, `ON DELETE CASCADE`), `name`, `price_delta_pence`
  (integer, default 0 — the per-option price adjustment in pence), `sort_order`,
  `is_active`.
- **`order_option_selections`** — which option a customer chose on an order line.
  `order_item_id` (FK → `order_items`, `ON DELETE CASCADE`), `option_id` and
  `group_id` (FKs with **no** cascade — an option that has been ordered cannot be
  hard-deleted; retire it with `is_active = false`), plus the two **snapshot**
  columns **`option_name_snapshot`** and **`price_delta_pence_snapshot`**. The
  snapshots are what reporting and the receipts read, so a historical order
  survives later edits or retirement of the option definition.

**Access posture — service-role only.** All three tables have RLS enabled with
**no policies**, and grants are additionally `REVOKE`d from `anon` and
`authenticated` as defence-in-depth. A direct browser read returns zero rows;
every read and write goes through an Edge Function using the service-role client.
Mirrors the `admins` and `comms_log` tables.

**Vendor scoping is by parent — there is no `vendor_id` column** on any of the
three tables. Scope resolves through the parent chain exactly as `products` and
`order_items` already do:
`product_option_groups → products → vendor_id`;
`order_option_selections → order_items → orders → drops → vendor_id`.
Every Edge Function enforces ownership through that chain server-side.

---

## Surfaces, and how each handles options

- **Vendor editor** — the "Choices" section in `drop-menu.html` (Menu Library),
  on the product editor. The vendor adds option groups and their priced options.
  Loaded via the owner-gated **`get-product-options`** EF (returns every group +
  option for all of the vendor's products, shaped for grouping by `product_id`)
  and saved via **`save-product-options`**.
- **Customer chooser** — `order.html`. When a product has option groups the
  customer picks one option per group before adding to basket. Options are read
  via the anonymous **`get-drop-product-options`** EF (the customer has no
  session and cannot call the owner-gated read or touch the RLS-locked tables
  directly — this EF is the anon-safe equivalent, mirroring `v_drop_public`'s
  posture). The chosen `group_id` + `option_id` ride along in the checkout
  payload; the client-supplied `price_delta_pence` on those selections is
  **display-only**.
- **Checkout** — **`create-order`** is the pricing authority. It re-derives every
  option's delta **server-side** from `product_options.price_delta_pence` (never
  from the client payload), checks tenancy (option → group → product must be the
  line's product), folds the delta into `serverUnitPrice[i]` **before** the
  subtotal is summed, and hard-stops on any mismatch with the client-declared
  total. It then writes `order_option_selections` with the server-derived name
  and delta in the snapshot columns. See CLAUDE.md operational learning #93
  (pricing authority invariant).
- **Confirmation page + email** — `order-confirmation.html` (via **`fetch-order`**)
  and **`send-order-confirmation`** both show each line's chosen option as a
  descriptive sub-line beneath the product name, by name only (the line price
  already includes the delta, so nothing is double-counted). Reads the snapshot
  columns.
- **Service Board** — `service-board.html`, three views, all fed by **`get-drop`**
  (which returns `order_item_lines` carrying each line's `options[]` by
  `option_name_snapshot`):
  - **Kanban card** (per-order kitchen ticket) — chosen option(s) as sub-lines
    beneath the item, alongside bundle choice selections.
  - **"All orders in this drop" table** — the chosen option appended inline to
    the item text, kept compact for the scan view (e.g. "Mexican Brunch ×1 ·
    Salmon").
  - **"All items in this drop" prep sheet** — the product total row unchanged
    (e.g. "Mexican Brunch ×8"), with an indented option-count breakdown beneath
    (e.g. "· Salmon ×3", "· Steak ×2", "· Tofu ×3"). Shown both on screen and in
    the branded PNG export. The base product total is never altered — the option
    counts are an additive sub-breakdown derived separately from the line-level
    source.

---

## Key Edge Functions

- **`save-product-options`** — vendor write path (owner-gated). Creates / updates
  / retires groups and options for a product.
- **`get-product-options`** — vendor read path (owner-gated). All groups +
  options for a vendor's products.
- **`get-drop-product-options`** — customer read path (anonymous, anon-safe).
  Options for the products in a drop.
- **`create-order`** — server-side option-delta pricing authority (re-derives the
  delta, tenancy-checks it, folds it into the charged total, writes the snapshots).
- **`get-drop`** — returns `order_item_lines` with each line's chosen `options[]`
  for the Service Board views.
- **`fetch-order`** — powers the confirmation page; returns each item's chosen
  options.
- **`send-order-confirmation`** — the confirmation email; renders chosen options
  as sub-rows.

---

## v1 scope boundaries (deliberately deferred)

The schema supports more than the v1 UI writes. Kept out of v1 on purpose:

- **Per-option stock** — no stock limit per option; only the product/drop-level
  stock applies.
- **Per-drop option price override** — an option's `price_delta_pence` is a single
  catalogue value; there is no drop-level override of it (unlike the product base
  price, which the drop's `price_override_pence` can override).
- **Options on bundle lines** — options attach to standalone products only.
  `create-order` rejects any option attached to a non-product line. A bundle's
  internal choices are handled by the separate bundle-selection mechanism.
- **Multi-select and min/max groups** — the schema carries `min_select`,
  `max_select` and `is_required`, but the v1 editor writes a fixed
  `1 / 1 / required` (pick exactly one, always required). Ranged or optional
  groups are a later stage.

---

## References

- Migration: `supabase/migrations/20260704120000_create_product_option_tables.sql`
- Pricing authority invariant: CLAUDE.md operational learning #93
- PRs: #429 (schema), #430 (vendor editor), #431 (customer chooser + payload),
  #432 (server-side option delta), #433 (confirmation page, email, Service Board
  kanban), #434 (Service Board "all orders" table + prep sheet).
