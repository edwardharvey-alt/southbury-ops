# Audit — display of chosen product options on downstream order surfaces

**Date:** 2026-07-04
**Type:** READ-ONLY. No edits, commits, or PRs. Evidence-first, file:line quotes.
**Repo state audited:** `origin/main` @ `6ff9944` (Stage 2 — vendor-facing
option-group editor). Stage 4 checkout write (`27419a3`) and PR #431 (order
page) / #432 (checkout deltas) are **UNMERGED** — the `create-order` write of
`order_option_selections` and the customer-facing option picker are not on main.

## Data model (the thing to display)

`order_option_selections` exists on main as a Stage-1 table
(`supabase/migrations/20260704120000_create_product_option_tables.sql:75`):

```
order_item_id              → order_items(id) ON DELETE CASCADE
option_id                  → product_options(id)   (no cascade)
group_id                   → product_option_groups(id)
option_name_snapshot       text NOT NULL     ← the display string ("Salmon")
price_delta_pence_snapshot integer NOT NULL  ← the delta (+200)
```

Access posture (migration:99-101): **service-role only.** RLS enabled, no
policies, `revoke all ... from anon, authenticated`. So any surface that
displays options MUST reach it through an Edge Function using the service-role
client. The two snapshot columns are exactly what a display needs — no join to
the live catalog required.

**No view on main references `order_option_selections`.** Confirmed by grep over
`supabase/**/*.sql`: the only reference outside the table's own migration is the
table description in `SCHEMA.md:338`. The bundle-selection analog
(`v_order_item_selections_detail`, `SCHEMA.md:501`) has no option-selection
sibling. A surface can only show what its query fetches — and today **nothing
fetches `order_option_selections`.**

The existing precedent is bundle selections (`order_item_selections`), which the
downstream surfaces DO render. Product options are the exact same shape and the
same surfaces are in scope.

---

## Surface 1 — Customer confirmation page (order-confirmation.html + fetch-order EF)

**Shows options? NO. Does not fetch them.**

**Fetch** (`supabase/functions/fetch-order/index.ts`): reads `order_items`
(`:90-91`) selecting `id, item_name_snapshot, qty, price_pence, item_type,
capacity_units_snapshot` — no option columns — then, only for bundle linkage,
reads `order_item_selections` (`:114-118`):

```
.from("order_item_selections")
.select("order_item_id, bundle_line_id, quantity, selected_product_id, products:selected_product_id ( name ), bundle_lines:bundle_line_id ( label )")
```

`order_option_selections` is never queried. Response builds each item with
`selections: selectionsByItemId[item.id] || []` (`:204`) — bundle selections
only.

**Render** (`order-confirmation.html:524-547`): line item = name + qty + (bundle
only) nested selections:

```js
return `<div class="confItem">
  <div class="confItemLeft">
    <p class="confItemName">${escapeHtml(item.item_name_snapshot || "Item")}</p>
    ${Number(item.qty) > 1 ? `<p class="confItemQty">Qty ${...}</p>` : ""}
    ${selectionsBlock}                 // populated only when item_type === "bundle"
  </div>
  <span class="confItemPrice">${formatMoneyPence(lineTotal)}</span>
</div>`;
```

`selectionsBlock` is gated on `item.item_type === "bundle"` (`:528`). A product
with a chosen option is `item_type === "product"`, so nothing extra renders —
matching the confirmed gap: "Mexican Brunch £12.50" appears, "Salmon" does not.
This is the surface the reported symptom names. Fix goes here (render) + in
`fetch-order` (add a service-role read of `order_option_selections` keyed by
`order_item_id`, surfaced under each item like `selections`).

---

## Surface 2 — Vendor Service Board (service-board.html + get-drop EF) — **CRITICAL**

**Shows options? NO. Does not fetch them — and does not even render bundle
selections today (a pre-existing, documented gap).**

**Fetch** (`supabase/functions/get-drop/index.ts:105-140`): order line detail
comes from the view fallback chain
`v_order_item_detail_expanded → v_order_item_detail_v2 → v_order_item_detail`,
each `select("*")`. Returned as `order_items` (`:234`). None of these views
reference `order_option_selections` (grep-confirmed above), so the option data
never reaches the page.

**Render** — the Board renders line items in three places, none of which show
options:

- Order-card compact detail (the kitchen's per-order view),
  `service-board.html:2596-2601` via `renderCompactBlock`:
  ```js
  const html = lines.map((line) => `
    <div class="compactLine">
      <span>${line._item_name}</span>
      <span>×${line._item_qty}</span>
    </div>`).join("");
  ```
  `_item_name` = `getItemName(line)` = `row.item_name || row.product_name ||
  row.selected_product_name || row.name || "Item"` (`:1394-1396`). No option field.
- Table/summary line, `:1739`: `<div class="itemsLine">${line._item_name}
  ×${line._item_qty}</div>`.
- All-items prep panel / prep sheet, `:1739`, `:2007-2014`.

**The Board already can't show sub-line detail.** Explicit code comment at
`service-board.html:1943-1952`:

> // T-sb-3 bundle selection detail: state.itemDetails
> // (v_order_item_detail_expanded) carries no reliable bundle→selection
> // linkage, and there is no state.orderItemSelections in the loaded
> // data, so bundle parent rows are rendered standalone (parent-only
> // fallback). When selection detail becomes available (e.g. get-drop
> // extended to return order_item_selections, or a
> // v_order_item_selections_detail projection), inject indented
> // `.bundleSubRow` <tr>s here ...

Same infrastructure gap that hides bundle selections hides product options. For
fulfilment this is the highest-stakes surface: Nathalie sees "Mexican Brunch
×1" with no "Salmon", so the kitchen cannot make the order correctly.

**Fix-path note / NEEDS-ED-VERIFY:** the coherent fix is to extend `get-drop` to
return `order_option_selections` (service-role read, ownership already enforced
by `get-drop`'s JWT check — operational learning #53), then render an indented
sub-line under the product row, exactly as the T-sb-3 comment anticipates for
bundles. Whether options can be attached to the existing
`v_order_item_detail_expanded` rows depends on whether that view exposes
`order_item_id` per row — see NEEDS-ED-VERIFY #3. If not, `get-drop` fetches
`order_option_selections` as a separate array (like `fetch-order` does for bundle
selections) and the page maps by `order_item_id`.

---

## Surface 3 — Confirmation email (send-order-confirmation EF, Resend)

**Shows options? NO. Does not fetch them.**

**Fetch** (`supabase/functions/send-order-confirmation/index.ts:417-420`):
```
.from("order_items")
.select("id, item_type, item_name_snapshot, qty, price_pence, bundle_id, selections:order_item_selections ( quantity, bundle_line:bundle_line_id ( label ), product:selected_product_id ( name ) )")
```
Embeds `order_item_selections` (bundle) only; `order_option_selections` absent.

**Render** (HTML, `:151-168`): item row = name / ×qty / price, then bundle
sub-rows gated on `item.item_type === "bundle"` (`:159`):
```js
`<td colspan="3" ...>+ ${escapeHtml(label)} &times;${escapeHtml(sel.quantity)}</td>`
```
Plain-text render is the same shape (`:263-268`). A product's chosen option is
never printed. Emailed receipt would say "Mexican Brunch ×1 £12.50" with no
"Salmon". Fix mirrors Surface 1: add the embedded `order_option_selections`
read + a sub-row render (this EF already uses the service-role client, so RLS is
not a blocker).

---

## Surface 4 — Vendor order-detail / order-list views

Two candidates; **neither shows per-order line-item options, and neither is a
per-order line-item surface in the way Surfaces 1–3 are.**

**4a. Platform-admin vendor drill-down (platform-admin-vendor.html →
admin-list-drop-orders → `v_admin_drop_orders`).**
`supabase/functions/admin-list-drop-orders/index.ts:85-86` reads
`v_admin_drop_orders` `select("*")`. Per CLAUDE.md this is an **order-level
rollup** (customer details, status, total) — it does not enumerate line items at
all, so there is nothing to hang an option off. `grep` for
`order_option|order_item|selection|item_name` in `platform-admin-vendor.html`
returns nothing. **Shows options? N/A — shows no line items.** NEEDS-ED-VERIFY #1
to confirm the view carries no line-item/option columns.

**4b. Insights / scorecard (get-insights + scorecard.html, via `v_item_sales`).**
`get-insights/index.ts:121-122` and `scorecard.html` (via `get-drop`'s
`item_sales` key, `scorecard.html:687`) read `v_item_sales` — an **aggregate**
"units/revenue per product across the drop" view (`SCHEMA.md:489`), rendered at
`scorecard.html:830` as a top-items list (`item.product_name || item.item_name`).
It is a sales-analytics roll-up, not a per-order fulfilment list, and has no
option dimension. **Shows options? NO — and arguably shouldn't at line-item
granularity; if option-level sales analytics is ever wanted, that's a separate,
lower-priority ask (spillover).** NEEDS-ED-VERIFY #2 to confirm no option column.

---

## SUMMARY

**(a) Complete list of surfaces that display an order's line items:**

| # | Surface | Query / source | Fetches `order_option_selections`? | Shows chosen option? |
|---|---------|----------------|-----------------------------------|----------------------|
| 1 | Customer confirmation (order-confirmation.html) | `fetch-order` EF → `order_items` + `order_item_selections` | No | **No** |
| 2 | **Service Board (service-board.html)** | `get-drop` EF → `v_order_item_detail_expanded` (fallback chain) | No | **No** (also omits bundle selections — T-sb-3) |
| 3 | Confirmation email (send-order-confirmation) | `order_items` w/ embedded `order_item_selections` | No | **No** |
| 4a | Platform-admin vendor drill-down | `admin-list-drop-orders` → `v_admin_drop_orders` | No | N/A — no line items (order rollup only) |
| 4b | Insights / scorecard | `v_item_sales` aggregate | No | No — aggregate sales, no per-order options |

**(b) Every per-order line-item surface (1, 2, 3) currently shows the product
name but NOT the chosen option.** The root cause is uniform: none of them fetch
`order_option_selections`, and no view exposes it. The admin/insights surfaces
(4a/4b) are aggregate/rollup and out of the immediate fulfilment picture.

**(c) One shared change, or several? — SEVERAL independent surface fixes.**
There is **no single shared view or EF** that all line-item surfaces read:
- Surface 1 (`fetch-order`) fetches `order_items` + `order_item_selections`
  directly with the service-role client.
- Surface 2 (`get-drop`) fetches via the `v_order_item_detail_*` view chain.
- Surface 3 (`send-order-confirmation`) fetches `order_items` with an embedded
  PostgREST selection join.
Each fetches items independently, so each needs its own query extension +
render change. However the **data side is already done** (the snapshot table
exists with everything needed; no schema migration required), and the work per
surface is small and identical in shape: (1) add a service-role read of
`order_option_selections` keyed by `order_item_id`, (2) render an indented
sub-line under the product — exactly the pattern each surface already uses for
bundle selections. A **shared `v_order_option_selections_detail` projection**
(mirroring the existing `v_order_item_selections_detail`) would let all three
fetches read one consistent shape and is the tidiest lever, but the render
changes remain per-surface regardless. So: one small optional shared view +
three thin per-surface reads/renders — not a single point fix, but a single
coherent pattern applied three times.

**(d) Most urgent for go-live: Surface 2, the Service Board.** As expected.
Surfaces 1 and 3 are customer-facing receipts (annoying if wrong, not
operationally fatal). The Service Board is the kitchen's fulfilment surface — if
it shows "Mexican Brunch" without "Salmon", the order is made wrong. It is also
the hardest of the three (needs a `get-drop` extension and the T-sb-3 sub-line
render infrastructure that does not yet exist), so it should lead the fix.

---

## NEEDS-ED-VERIFY (only confirmable against the live DB)

View definitions for `v_admin_drop_orders`, `v_item_sales`, and the
`v_order_item_detail_*` family are **not in the repo** (created via the SQL
editor; `prod-schema.sql` is empty, `SCHEMA.md` is prose-only). Run:

1. **`v_admin_drop_orders` has no line-item/option columns** (confirms 4a is a
   pure order rollup):
   ```sql
   select column_name from information_schema.columns
   where table_name = 'v_admin_drop_orders' order by ordinal_position;
   ```

2. **`v_item_sales` has no option dimension** (confirms 4b):
   ```sql
   select column_name from information_schema.columns
   where table_name = 'v_item_sales' order by ordinal_position;
   ```

3. **CRITICAL for the Service Board fix path — does
   `v_order_item_detail_expanded` expose `order_item_id`** (i.e. can
   `order_option_selections` be joined onto its rows, or must `get-drop` fetch
   options as a separate array and map client-side)?
   ```sql
   select column_name from information_schema.columns
   where table_name = 'v_order_item_detail_expanded' order by ordinal_position;
   ```
   The T-sb-3 comment ("carries no reliable bundle→selection linkage") suggests
   it may not — which would mean the separate-array approach, exactly as
   `fetch-order` already does for bundle selections.

4. **Confirm the write is live before building display** (the write is on
   unmerged #432, not on main): that placed orders actually have
   `order_option_selections` rows to display —
   ```sql
   select count(*) from order_option_selections;
   ```

---

## Spillover (one line each — NOT investigated, outside the strict question set)

- **order.html basket (pre-order):** the in-cart display of a chosen option is
  PR #431 territory (unmerged); not a downstream order surface, not audited here.
- **Option-level sales analytics** (units sold per option in Insights/scorecard)
  is a possible future want; distinct from fulfilment display, low priority.
- **`get-drop` service-role read of the option table:** the EF verifies vendor
  ownership then reads with the service-role client, so the `revoke ... from
  authenticated` posture is not a blocker for any of the three EF-mediated fixes.
