# Findings — Product option groups (modifiers) feasibility audit

**Date:** 2026-07-04
**Branch/base:** `main` @ `5363117` ("fix(create-order): make the server the pricing authority (#427)")
**Type:** Read-only audit. No edits, no commits. Facts only — no design, no recommendations.
**Method:** Grep-first, evidence-first. Every claim below is anchored to `file:line` with a real
code quote taken from the working tree at the commit above. SCHEMA.md was consulted for
orientation only and is flagged where relied on (it is known to drift).

**Feature under evaluation:** a *product option group (modifier)* — a single product offering a
required, pick-exactly-one choice. Two sub-cases:
1. all options same price (e.g. a salad's dressing), and
2. options priced differently (e.g. a poke bowl's protein — salmon +£3).

This is a modifier on **one** product, distinct from bundles (which group several products).

**Headline fact established up front:** the price-delta / modifier concept is **entirely absent**
from the codebase. A repo-wide grep for `surcharge`, `price_delta`, `modifier`, `option_group`,
`option_price`, `extra_pence`, `upcharge`, `add_on`, `price_adjust`, `delta_pence` returns **zero
matches** in any `.ts` or `.html` file. The only near-hit is a create-order comment that
*explicitly states choices never change price* (Q4b). Every fact below is read against that baseline.

---

## Q1 — CHECKOUT (`supabase/functions/create-order/index.ts`, read in full)

### Q1a — Server-side re-derivation of each item's effective price (#427)

The server, not the client, is the pricing authority. Overrides for the drop are loaded into two
maps, then a single helper re-derives each item's unit price with the `override ?? catalog ?? 0`
precedence:

`create-order/index.ts:436-445`
```ts
const effectivePriceFor = (item: BasketItem): number => {
  if (item.type === "product") {
    const ov = productOverride.get(item.product_id as string);
    if (ov !== undefined) return ov;
    return productMap.get(item.product_id as string)?.price_pence ?? 0;
  }
  const ov = bundleOverride.get(item.bundle_id as string);
  if (ov !== undefined) return ov;
  return bundleMap.get(item.bundle_id as string)?.price_pence ?? 0;
};
```

The override map is populated only from the drop's available menu rows (`create-order/index.ts:418-433`),
and the per-item server price array is computed once here:

`create-order/index.ts:447-450`
```ts
// Per-item server unit price, indexed to payload.basket. Reused for the
// subtotal, the Stripe line items, and the order_items price snapshot so
// all three are guaranteed to agree.
const serverUnitPrice: number[] = payload.basket.map(effectivePriceFor);
```

The server subtotal, discount, and total are then computed from `serverUnitPrice` (never the
client figures), and the client's declared total is only cross-checked:

`create-order/index.ts:457-471`
```ts
const computedSubtotal = payload.basket.reduce(
  (sum, item, i) => sum + serverUnitPrice[i] * item.quantity,
  0
);
const matchedTier = findMatchingTier(computedSubtotal, dropAreaRow?.discount_tiers ?? null);
const computedDiscount = calculateDiscountPence(computedSubtotal, matchedTier);
const deliveryPence = 0;  // matches client; delivery pricing not shipped
const computedTotal = Math.max(0, computedSubtotal - computedDiscount + deliveryPence);

if (computedTotal !== payload.totals.total_pence) {
  return jsonResponse(
    { error: "Total does not match basket — please refresh and try again" },
    400
  );
}
```

The header comment makes the client-price stance explicit — and, notably, records the current
"choices never upcharge" assumption:

`create-order/index.ts:407-410`
```ts
// (mirrors order.html getDropMenuItems(): base_price_pence =
//  row.price_override_pence ?? catalog.price_pence ?? 0). Bundle prices are
// fixed at the bundle's effective price — choice selections never upcharge,
// matching the client. payload.basket[*].unit_price_pence is now display-only
```

### Q1b — How `order_items` is written (every column + source)

`create-order/index.ts:689-701`
```ts
      .from("order_items")
      .insert({
        order_id: orderId,
        item_type: item.type,
        product_id: item.type === "product" ? item.product_id : null,
        bundle_id: item.type === "bundle" ? item.bundle_id : null,
        item_name_snapshot: item.name,
        qty: item.quantity,
        // Server-derived effective price, not the client's declared value.
        price_pence: serverUnitPrice[i],
        capacity_units_snapshot: serverItemCapacity[i],
      })
```

Column-by-column source:
- `order_id` ← the inserted order row id (`orderId`).
- `item_type` ← `item.type` (client-supplied, validated to `"product"|"bundle"`).
- `product_id` / `bundle_id` ← client-supplied id (validated as a UUID belonging to the vendor, Step 5).
- `item_name_snapshot` ← `item.name` (client-supplied display name only).
- `qty` ← `item.quantity` (client-supplied, validated positive integer).
- **`price_pence` ← `serverUnitPrice[i]`** — the server-derived effective price from Q1a, **not** the
  client's `unit_price_pence`. This is the price snapshot.
- `capacity_units_snapshot` ← `serverItemCapacity[i]` (server-computed, `create-order/index.ts:488-515`).

The same `serverUnitPrice[i]` also feeds the Stripe line item's `unit_amount`
(`create-order/index.ts:795`: `unit_amount: serverUnitPrice[i],`), so subtotal, Stripe charge, and
`order_items` snapshot are guaranteed to agree by construction (they all read the one array).

### Q1c — The precise seam where an option delta must be added

The single seam that keeps subtotal, Stripe `unit_amount`, and `order_items.price_pence` mutually
consistent is the `serverUnitPrice` array at `create-order/index.ts:450`. Because all three
downstream consumers (subtotal reduce at :457-460, Stripe `unit_amount` at :795, `order_items`
snapshot at :699) read from that one array, **a per-item option delta that is folded into
`serverUnitPrice[i]` before line 457 propagates to all three automatically.** The delta must be
**looked up server-side** (from the DB, keyed by the chosen option id in the payload) exactly as
`effectivePriceFor` looks up the base price — it must never be taken from a client-supplied delta,
or the #427 guarantee is defeated. (Seam identified only; not designed.)

---

## Q2 — OFFER SCREEN (`drop-menu.html` — the vendor product create/edit surface)

### Q2a — How a vendor creates/edits a product today, and where an option editor would attach

A product is edited through a form of discrete fields (name, description, category, base price,
capacity, dietary/allergen pills, image). The base-price input is a plain number field:

`drop-menu.html:745-746`
```html
<label for="productPricePence">Base Price (£)</label>
<input id="productPricePence" type="number" min="0" step="0.01" />
```

Saving an edit gathers those fields into a `payload` and invokes the `update-product` Edge Function
(create uses `create-product` — `drop-menu.html:2852`):

`drop-menu.html:2944-2969` (abridged to the shape)
```ts
const payload = {
  name: byId("productName").value.trim(),
  ...
  price_pence: Math.round(Number(byId("productPricePence").value || 0) * 100),
  counts_toward_capacity: byId("productCountsTowardCapacity").checked,
  capacity_weight: Math.max(1, Number(byId("productCapacityWeight").value || 1)),
  ...
};
const { data, error } = await supabase.functions.invoke("update-product", {
  body: { vendor_id: state.vendorId, product_id: product.id, fields: payload }
});
```

An option-group editor would attach **inside this product-editing surface** (the same panel that
owns `saveCurrentProduct` / the `productPricePence` field), owning the product currently identified
by `state.selectedProductId`. Structurally the closest existing precedent is not to widen this
`update-product` payload but to add a sibling save call for the option groups — mirroring how bundle
lines are a *separate* save path from the bundle itself (Q2b).

### Q2b — How the existing bundle-choice (choice-set) editor is built

The bundle "choice set" is the nearest existing UI to a pick-one option group. The choice options
are rendered as a plain checkbox checklist of the vendor's products — **with no price field per
option**:

`drop-menu.html:2300-2306`
```js
.map((product) => `
  <label class="choiceSetOption">
    <input type="checkbox" value="${product.id}" ${selectedIds.includes(product.id) ? "checked" : ""} />
    <span>${escapeHtml(product.name)}</span>
    <span class="subMeta">${escapeHtml(product.category_name || product.legacy_category || "—")}</span>
  </label>
`).join("");
```

The line carries "pick-one" semantics via `min_choices` / `max_choices` / `is_required` and a
customer-facing `label`, saved together with the checked product ids:

`drop-menu.html:3156-3171`
```js
const fields = {
  label,
  line_type: lineType,
  product_id: productId,
  category_id: categoryId,
  quantity: Number(byId("bundleLineQty").value || 1),
  min_choices: Number(byId("bundleLineMinChoices").value || 1),
  max_choices: Number(byId("bundleLineMaxChoices").value || 1),
  is_required: byId("bundleLineRequired").value === "true",
  drives_capacity: byId("bundleLineDrivesCapacity").value === "true",
  sort_order: existingLine?.sort_order ?? getNextSortOrder(bundleLinesForCurrentBundle)
};

const choice_product_ids = lineType === "choice_set"
  ? Array.from(byId("bundleLineChoiceSetList").querySelectorAll('input[type="checkbox"]:checked')).map((cb) => cb.value)
  : [];
```

The save invokes `save-bundle-line` with `fields` + a bare `choice_product_ids` array
(`drop-menu.html:3175-3182`). On the server, each choice row is written with **only three columns —
no price**:

`supabase/functions/save-bundle-line/index.ts:180-184`
```js
const rows = choiceIds.map((productId, index) => ({
  bundle_line_id: newLine.id,
  product_id: productId,
  sort_order: (index + 1) * 10,
}));
```

**Reusable:** the label + required + min/max=1 "pick exactly one" framing, and the product-checklist
render/save shape. **Absent for the priced sub-case:** there is nowhere in this editor to enter a
per-option price (no delta input in the DOM, no delta field in `fields` or `choice_product_ids`, no
delta column in the insert).

---

## Q3 — ORDER PAGE (`order.html` — the customer surface)

### Q3a — How a single product is rendered / added, and where price appears

The product card shows the effective price directly:

`order.html:3060`
```js
<div class="menuPrice">${formatMoneyPence(item.base_price_pence)}</div>
```

`base_price_pence` is the client mirror of the server's `override ?? catalog` logic, computed when
the drop's menu items are built:

`order.html:2626`
```js
base_price_pence: row.price_override_pence ?? product.price_pence ?? 0,
```

Adding to basket pushes a flat line carrying that single unit price — there is no per-line option
state:

`order.html:3302-3311`
```js
state.basket.push({
  key: `product:${productId}`,
  type: "product",
  product_id: productId,
  name: productMenuItem.name,
  unit_price_pence: Number(productMenuItem.base_price_pence || 0),
  capacity_units: Number(productMenuItem.capacity_units || 0),
  allergens: Array.isArray(productMenuItem.allergens) ? productMenuItem.allergens : [],
  quantity: nextQty
});
```

### Q3b — How a bundle choice is presented, and whether the displayed price updates on selection

Bundle customisation happens in a dedicated modal. The price is written **once** on open, from the
bundle's base price:

`order.html:3559-3569`
```js
state.bundleDraft = {
  bundle_id: bundleId,
  name: bundle.name,
  unit_price_pence: Number(bundle.base_price_pence || 0),
  capacity_units: Number(bundle.capacity_units || 0),
  selections: []
};
...
byId("bundleModalPrice").textContent = formatMoneyPence(bundle.base_price_pence);
```

**The displayed price does not move on selection.** `bundleModalPrice` is written in exactly two
places in the whole file — the static `£0.00` placeholder (`order.html:1943`) and the single
`openBundleModal` assignment above (`order.html:3569`). No selection handler rewrites it. Choices
are rendered as `choiceCard` option lists per line (`renderBundleLine`, `order.html:3594` onward),
and selecting an option only updates `state.bundleDraft.selections` (`order.html:3721`, `:3766`) —
never the price.

**Reusable:** the modal + `choiceCard` pick-one option UI, and the draft-selection state machine.
**Missing for a price-moving option chooser:** any recompute of the displayed price when a selection
changes (the whole "selection changes price" behaviour does not exist today).

### Q3c — Where a chosen option + delta would attach in the payload build

Basket lines are serialised in `buildCheckoutPayload`. A product line today has no per-choice
substructure; only bundle lines carry a `selections` array:

`order.html:3871-3887`
```js
basket: state.basket.map((item) => ({
  type: item.type,
  product_id: item.product_id || null,
  bundle_id: item.bundle_id || null,
  name: item.name,
  unit_price_pence: Number(item.unit_price_pence || 0),
  quantity: Number(item.quantity || 0),
  capacity_units: Number(item.capacity_units || 0),
  selections: (item.selections || []).map((s) => ({
    bundle_line_id: s.bundle_line_id,
    label: s.label,
    selected_product_id: s.selected_product_id,
    product_name: s.product_name,
    quantity: Number(s.quantity || 1),
    drives_capacity: Boolean(s.drives_capacity)
  }))
}))
```

A chosen product-level option would attach here as a new per-line field on the basket item (the
existing `selections` array is structurally bound to `bundle_line_id`, so it cannot carry a
product-level option without change — see Q4a). Whatever is attached must be the option **identity**
(an id the server can resolve to a delta), not a client-computed delta — the server ignores
`unit_price_pence` for charging (Q1a), so it must equally ignore any client-sent option price.

---

## Q4 — SELECTION RECORDING

### Q4a — Is `order_item_selections` structurally bound to `bundle_line_id`?

At the application layer, every write to `order_item_selections` supplies `bundle_line_id` and
`selected_product_id` from a bundle selection — there is no product-level path:

`create-order/index.ts:716-723`
```ts
      .from("order_item_selections")
      .insert(
        selections.map((s) => ({
          order_item_id: orderItemId,
          bundle_line_id: s.bundle_line_id,
          selected_product_id: s.selected_product_id,
          quantity: s.quantity,
        }))
      );
```

The payload validator also *requires* both to be UUIDs for any selection
(`create-order/index.ts:184-185`: `bundle_line_id must be a uuid` / `selected_product_id must be a
uuid`), and this insert block runs only for bundle items (`// D. Insert order_item_selections for
bundle items.` — `create-order/index.ts:712`). SCHEMA.md (orientation only, drifts) describes the
table as "for bundle line items … `bundle_line_id` (FK), `selected_product_id` (FK)"
(SCHEMA.md:314-316).

**The `order_item_selections` table DDL is not present anywhere in the repo** — no
`supabase/migrations/*.sql` defines it (grep returns nothing), so column nullability and the FK
target **cannot be confirmed from source**. Whether a product-level option selection could reuse
this table hinges on whether `bundle_line_id` is `NOT NULL` and FK-bound to `bundle_lines`.

> **NEEDS-ED-VERIFY** — run against the live DB and paste back:
> ```sql
> -- Column nullability / types
> select column_name, is_nullable, data_type
> from information_schema.columns
> where table_name = 'order_item_selections'
> order by ordinal_position;
>
> -- Foreign keys (confirm bundle_line_id → bundle_lines, and its NOT NULL status above)
> select tc.constraint_name, kcu.column_name,
>        ccu.table_name  as foreign_table,
>        ccu.column_name as foreign_column
> from information_schema.table_constraints tc
> join information_schema.key_column_usage kcu
>   on kcu.constraint_name = tc.constraint_name
> join information_schema.constraint_column_usage ccu
>   on ccu.constraint_name = tc.constraint_name
> where tc.table_name = 'order_item_selections'
>   and tc.constraint_type = 'FOREIGN KEY';
> ```
> If `bundle_line_id` is `NOT NULL` (the strongly-expected result given every insert supplies it),
> the table cannot record a product-level option selection without a schema change; options then
> need either a nullable discriminator or their own selection table. If it is already nullable, the
> table could in principle be extended. Fact to be decided by the query, not guessed here.

### Q4b — Is there any existing price/delta column on the product/choice path?

**No. The concept is entirely absent.** Confirmed three ways:
1. Repo-wide grep for `surcharge|price_delta|modifier|option_group|option_price|extra_pence|upcharge|add_on|price_adjust|delta_pence` → **zero** matches in `.ts`/`.html`.
2. The bundle choice rows (`bundle_line_choice_products`) are written with only
   `bundle_line_id`, `product_id`, `sort_order` — no price column
   (`supabase/functions/save-bundle-line/index.ts:180-184`, quoted in Q2b).
3. create-order's own comment states the current invariant explicitly:
   `create-order/index.ts:408` — *"choice selections never upcharge"*.

There is no place on a product, a bundle line, or a bundle choice where a per-option price
adjustment can be stored today.

---

## SUMMARY (plain English)

**(a) The exact seam in create-order where an option delta gets added.**
The `serverUnitPrice` array at `create-order/index.ts:450`. It is the single source consumed by the
subtotal (`:457-460`), the Stripe `unit_amount` (`:795`), and the `order_items.price_pence` snapshot
(`:699`). A per-item option delta, **looked up server-side from the DB by the chosen option id**
(the same way `effectivePriceFor` looks up base price) and folded into `serverUnitPrice[i]` before
line 457, propagates to all three consistently. The delta must never come from the client payload.

**(b) Reusable UI vs build-fresh.**
Reusable from bundles: the "pick exactly one, required" framing (`is_required` + `min/max_choices=1`
+ a `label`) and the checklist/`choiceCard` render+save shapes — on the offer screen
(`drop-menu.html` choice-set editor) and on the order page (`bundleModal` + `choiceCard` + the
`bundleDraft.selections` state machine). Build fresh: (i) a **per-option price input** on the offer
screen — no delta field exists anywhere in the choice editor DOM, `fields`, or the server insert;
and (ii) a **price that recomputes on selection** on the order page — `bundleModalPrice` is written
once at open (`order.html:3569`) and never on selection, so "selection moves the price" is entirely
new behaviour. Note also that a product option group attaches to a *product* editor
(`state.selectedProductId` / `saveCurrentProduct`), whereas the reusable choice editor currently
lives inside the *bundle* editor.

**(c) New selection table, or extend the existing one?**
Undetermined from source and gated on the Q4a query. Every code path writes
`order_item_selections` with a `bundle_line_id` + `selected_product_id`, the validator requires both
as UUIDs, and the table DDL is absent from the repo. If `bundle_line_id` is `NOT NULL` (expected),
the existing table cannot hold a product-level option selection unmodified — options would need a
new/parallel selection table or a schema change to that column. Do not assume; run the NEEDS-ED-VERIFY query.

**(d) Single biggest risk to the #427 pricing guarantee.**
Letting any part of the option price originate from, or be validated against, the client. #427's
guarantee holds precisely because create-order ignores `payload.basket[*].unit_price_pence` and
re-derives every charge from DB rows (`:407-410`, `:450`, `:699`, `:795`). If an option feature
carries a client-supplied delta (or trusts a client "chosen option → price" mapping) into
`serverUnitPrice`, the tamper surface the #427 total-guard closed reopens at the option layer — a
customer could pick "salmon +£3" but submit a £0 delta. The option delta must be resolved
**server-side from the option's own DB row**, keyed only by the option identity in the payload,
with the client sending which option, never how much.

---

## Spillover (one line each — noted, not chased)

- `order_item_selections` and `order_items` have **no DDL committed anywhere in the repo** (no `supabase/migrations/` dir with these tables) — schema truth lives only in the live DB; SCHEMA.md is prose and drifts. Broader gap than this audit.
- `order.html` keeps a client-side price mirror (`base_price_pence = price_override_pence ?? price_pence`, `:2626`) that must stay in lockstep with create-order's server logic — an option-pricing feature doubles this duplication surface.
