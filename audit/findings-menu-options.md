# Audit — per-product option groups (modifiers) vs. the existing bundle machinery

**Scope:** read-only. Establishes facts only — no recommendation, no design.
**Baseline:** `origin/main` @ `a00d954`.
**Method:** grep-first, quotes are the actual code. SCHEMA.md used only for orientation; every claim verified against file contents. One DB-only question is recorded as NEEDS-ED-VERIFY.

**Files that carry the answer:**
- `supabase/functions/create-order/index.ts` — the money path (order + Stripe charge)
- `order.html` — customer order page (bundle modal, selection capture, payload build)
- `drop-menu.html` — vendor Offer/menu builder (bundle line + choice-set editor)
- `supabase/functions/save-bundle-line/index.ts` — write path for bundle lines + choice products
- `supabase/functions/fetch-order/index.ts`, `send-order-confirmation/index.ts`, `service-board.html` — read-only consumers of `order_item_selections`

---

## A. THE MONEY PATH

### A1 — Which EF builds the charge, and is the total re-read from the DB or trusted from the client?

The order-creating function is **`create-order`** (`supabase/functions/create-order/index.ts`). The charged total is **computed entirely from client-sent prices — no line price is ever re-read from the database.**

Step 7 sums the client's per-line `unit_price_pence`:

```
399    const computedSubtotal = payload.basket.reduce(
400      (sum, item) => sum + item.unit_price_pence * item.quantity,
401      0
402    );
...
406    const computedTotal = Math.max(0, computedSubtotal - computedDiscount + deliveryPence);
408    if (computedTotal !== payload.totals.total_pence) {
409      return jsonResponse(
410        { error: "Total does not match basket — please refresh and try again" },
```

`unit_price_pence` is the client payload field (`create-order/index.ts:34`, type `BasketItem`), populated by `order.html`'s `buildCheckoutPayload()` at `order.html:3876` (`unit_price_pence: Number(item.unit_price_pence || 0)`). The Step 7 "guard against client-side tampering" (comment at `:394`) only checks that the client's line prices sum to the client's declared total — an **internal-consistency check, not an authenticity check** against the DB. A client that sends a coherent (price, total) pair for any amount passes.

### A2 — Per-line pricing: DB lookup by id, or trust the client?

**Trust the client.** `price_pence` is never selected from `products` or `bundles`. The only DB reads of catalogue rows fetch capacity/ownership fields, explicitly *not* price:

```
319        .from("products")
321        .select("id, vendor_id, category_id, counts_toward_capacity, capacity_weight")
...
341        .from("bundles")
343        .select("id, vendor_id, category_id, counts_toward_capacity, capacity_weight")
```

Every occurrence of `price_pence` in the whole function is either the client payload type, client validation, or a *write* of the client value — never a read:

- `:34` payload type · `:171–172` validates the client number is ≥ 0 · `:400` sums the client number · `:636` writes the client number to `order_items` · `:731` sends the client number to Stripe.

The Stripe charge line uses the same client value:

```
727        line_items: payload.basket.map((item) => ({
728          price_data: {
729            currency: "gbp",
730            product_data: { name: item.name },
731            unit_amount: item.unit_price_pence,
732          },
```

(Note: `product_data.name` is also the client-supplied `item.name` — the receipt label is client-controlled too.)

### A3 — How is a BUNDLE priced today?

A bundle is **not priced specially at all** — server-side it is just a basket item with a client-sent `unit_price_pence`, summed by the same Step 7 reducer (`:399–401`) and charged via the same `line_items` map (`:731`). `bundles.price_pence` is never read in `create-order`.

The **flat** bundle price is resolved client-side, once, when the basket item is built:

```
order.html:2649   base_price_pence: row.price_override_pence ?? bundle.price_pence ?? 0,
```

and carried unchanged into the draft at modal open:

```
order.html:3562     unit_price_pence: Number(bundle.base_price_pence || 0),
order.html:3569     byId("bundleModalPrice").textContent = formatMoneyPence(bundle.base_price_pence);
```

So today a bundle is **flat from `bundles.price_pence`** (or the drop's `price_override_pence`), not summed from chosen products.

### A4 — Do bundle selections influence the charged total?

**No — selections are purely descriptive and recorded *after* pricing.** In `create-order` the order of operations is decisive:

- Step 6 (`:362–392`) validates selections for *membership* only (does this `selected_product_id` belong to a `bundle_line` of this bundle) — it does not read or add any price.
- Step 7 (`:399–406`) computes the total **before** any selection row is written, from `unit_price_pence` alone.
- Selections are written last, in block D (`:649–667`), after the order/items already exist.

Client-side confirms the same: `syncBundleDraftFromUi()` (`order.html:3724–3769`) updates `state.bundleDraft.selections` and the validation message on every pick, but **never touches `unit_price_pence` or the displayed `bundleModalPrice`.** Picking a different choice changes what is recorded, never what is charged.

---

## B. REUSABLE MACHINERY

### B5 — One bundle-with-choice order, end to end

1. **Vendor builds it** (`drop-menu.html`): inside a selected bundle, adds a *bundle line* of type `choice_set` and ticks the eligible products (`drop-menu.html:963–966`, `:2287–2306`); sets label / quantity / min / max / required. Persisted by `save-bundle-line` → `bundle_lines` + `bundle_line_choice_products`.
2. **Presented to customer** (`order.html`): `openBundleModal()` (`:3554`) renders each line via `renderBundleLine()` (`:3594`); choice lines become radio inputs when `max_choices === 1`, checkboxes when `> 1` (`:3649`).
3. **Captured client-side**: `hydrateBundleDraftDefaults()` (`:3687`) seeds defaults; `syncBundleDraftFromUi()` (`:3724`) reads `input:checked` into `state.bundleDraft.selections` on every change and toggles the Add button on min/max validity.
4. **Sent**: `buildCheckoutPayload()` (`:3819`) emits the basket item with `selections: [{ bundle_line_id, selected_product_id, quantity, … }]` (`:3879–3886`).
5. **Validated server-side**: `create-order` Step 6 (`:362–392`) — line belongs to bundle, choice product is a valid option for the line. No cardinality check.
6. **Priced**: Step 7 (`:399–406`) from the flat `unit_price_pence` — selection-independent.
7. **Recorded**: `order_items` insert (`:627–640`), then `order_item_selections` insert (`:652–661`).
8. **Read back**: `fetch-order`, `send-order-confirmation`, and `service-board.html` read `order_item_selections` for display only.

### B6 — What writes `order_item_selections`, and the exact shape

`create-order` block D:

```
652      const { error: selErr } = await serviceClient
653        .from("order_item_selections")
654        .insert(
655          selections.map((s) => ({
656            order_item_id: orderItemId,
657            bundle_line_id: s.bundle_line_id,
658            selected_product_id: s.selected_product_id,
659            quantity: s.quantity,
660          }))
661        );
```

Columns written: `order_item_id` (server-generated, from the `order_items` insert at `:639–640`), `bundle_line_id` (from the client selection), `selected_product_id` (from the client selection), `quantity` (from the client selection).

**Structurally tied to `bundle_line_id`.** Every row requires a `bundle_line_id`, and SCHEMA.md declares it as a FK to `bundle_lines` (`SCHEMA.md:314–316`, `:120`). A per-*product* modifier (which has no bundle line) could only reuse this table by inventing a synthetic `bundle_line` to point at, or by making `bundle_line_id` nullable and adding a different discriminator. As-is, the table records "which product filled which bundle line," not "which option a customer chose on a product." Whether the FK/NOT-NULL can accept a null is a DB fact — see NEEDS-ED-VERIFY-2.

### B7 — Is "pick exactly one, required" enforced anywhere?

**Partly, client-side only; not server-side; `is_required` is enforced nowhere.**

- **Client min/max** — enforced in `syncBundleDraftFromUi()`, disabling the Add button:

```
order.html:3742      if (inputs.length < minChoices) {
3743              isValid = false;
3744              validationMessage = `${line.label || "This choice"} needs at least ${minChoices} selection${…}`;
...
3746            if (maxChoices > 0 && inputs.length > maxChoices) {
3747              isValid = false;
```

  "Exactly one" is achieved indirectly: a single-choice line renders as a `radio` (`order.html:3649`) with the first option pre-checked (`:3671`), and `min_choices`/`max_choices` = 1 gate the button.
- **`is_required`** — only ever emitted as a DOM data attribute, never read for enforcement:

```
order.html:3655   … data-required="${Boolean(line.is_required)}">
```

  (`grep` for `is_required` / `dataset.required` in `order.html` returns only this render line.)
- **Server-side** — `create-order` Step 6 validates membership only; there is **no** min/max/required cardinality check in the EF. A crafted payload with zero or many selections on a required single-choice line would pass server validation.

### B8 — Does the choice path carry a price / price-delta column?

**No price column is written or read anywhere on the choice path in the repo.** The `bundle_line_choice_products` insert writes only three columns:

```
save-bundle-line/index.ts:147    const rows = choiceIds.map((productId, index) => ({
148            bundle_line_id,
149            product_id: productId,
150            sort_order: (index + 1) * 10,
151          }));
```

`bundle_lines` `ALLOWED_FIELDS` (`save-bundle-line/index.ts:9–20`) contains no price field either. A repo-wide grep for `price_delta | extra_pence | surcharge | upcharge | modifier` and for any `choice`+`price` pairing across `drop-menu.html`, `order.html`, and every Edge Function returns **zero** matches. SCHEMA.md agrees (`:214–216`, three columns: `bundle_line_id`, `product_id`, `sort_order`).

Repo evidence proves the column is never *used*, but cannot prove it is *absent* from the live table (a column could exist unwritten). SCHEMA.md has known drift, so:

> **NEEDS-ED-VERIFY-1** — confirm no price/delta column exists on the choice table:
> ```sql
> SELECT column_name, data_type, is_nullable
> FROM information_schema.columns
> WHERE table_name = 'bundle_line_choice_products'
> ORDER BY ordinal_position;
> ```
> Expected: `bundle_line_id`, `product_id`, `sort_order` (+ `id`) and nothing price-shaped.

---

## C. THE TWO SURFACES

### C9 — Vendor: how is a choice attached today, and where would a per-product option group have to live?

A choice today exists **only as a line inside a bundle** — there is no path to attach an option to a standalone product. In `drop-menu.html`, the vendor must first create/select a **bundle** (`state.selectedBundleId`), then use the Included-item editor:

```
drop-menu.html:962   <label for="bundleLineType">Included Item Type</label>
963                  <select id="bundleLineType">
964                    <option value="fixed_product">…</option>
965                    <option value="category_choice">Choose from a category</option>
966                    <option value="choice_set">Choose from a selected list</option>
```

For `choice_set`, the vendor ticks eligible products from a checkbox list:

```
drop-menu.html:2300     .map((product) => `
2301            <label class="choiceSetOption">
2302              <input type="checkbox" value="${product.id}" … />
2303              <span>${escapeHtml(product.name)}</span>
```

then sets Customer-facing Label, Quantity, Minimum Choices, Maximum Choices, Required, Drives Capacity (`drop-menu.html:986–1016`); Save calls `save-bundle-line`. **The entire choice UI is nested under the bundle editor** — a per-product option group has no home on this screen today; it would need a new attachment point hung off a *product*, not off a bundle.

### C10 — Customer: how is a choice rendered, and does the price update on pick?

Rendered by `renderBundleLine()` — radios for single-choice, checkboxes for multi:

```
order.html:3649   const inputType = Number(line.max_choices || 1) > 1 ? "checkbox" : "radio";
...
3666            <input
3667              type="${lineType === "fixed_product" ? "checkbox" : inputType}"
3668              name="bundleLine:${line.id}"
3669              value="${opt.value}"
```

**The displayed price does not update on pick.** `bundleModalPrice` is set exactly once at modal open (`order.html:3569`) and is never rewritten; the only mutators of the price element in the whole file are that line and the static `£0.00` markup (`:1943`). The change handler `syncBundleDraftFromUi()` recomputes selections + validation but leaves the price untouched. There is no price-update logic to quote because none exists.

---

## SUMMARY (plain English)

**(a) Is the charged total recomputed server-side from the DB?**
No. `create-order` computes and charges from the **client-sent `unit_price_pence`** (`create-order/index.ts:399–401, 636, 731`). `price_pence` is never read from `products`/`bundles`. The Step-7 guard (`:408`) only checks the client's line prices sum to the client's total — internal consistency, not authenticity. This gates any priced-option work: **there is no server-authoritative price to attach a modifier price to today.**

**(b) Which bundle/selection pieces are genuinely reusable for a per-product modifier, and which are not?**
- *Reusable as UI/interaction patterns:* the radio-vs-checkbox render keyed on `max_choices` (`order.html:3649`), the client min/max validation loop (`:3742–3749`), and the choice-set product-picker UI (`drop-menu.html:2287–2306`) are all directly analogous to "pick one option."
- *Reusable as a recording table, only with a schema change:* `order_item_selections` records "chosen product per slot," but every row is bound to a NOT-NULL `bundle_line_id` FK (`create-order:657`; SCHEMA.md:314–316). It cannot record a product-level modifier without either a synthetic bundle line or a schema change (nullable FK + new discriminator).
- *Not reusable — genuinely absent:* there is **no price on the choice path anywhere** (B8), **no server-side cardinality/required enforcement** (B7), **no vendor surface to attach a choice to a product** (only to a bundle, C9), and **no price-updates-on-pick** on the customer side (C10). None of these exist to be extended.

**(c) The single biggest gap.**
The charged amount is **100% client-supplied and never reconciled against catalogue prices**, and nothing anywhere associates a price with a chosen option. "Customer picks one protein on one dish, priced differently, charged correctly" needs a server-authoritative per-option price (salmon vs. tofu) folded into the total by `create-order` — but `create-order` neither reads any price from the DB nor has any option-price concept to read. Closing that (server-side price re-derivation + an option-price source of truth) is the load-bearing gap; the UI/validation/recording pieces are comparatively shallow.

---

## Spillover (noted, not chased)

- `create-order` trusts client `unit_price_pence` for *all* items today, so **product and bundle prices themselves are already tamperable** (send £0.01 for any item, pass the Step-7 guard). This is broader than modifiers and predates this question — flagging only.
- The receipt/line-item **name** sent to Stripe is client-supplied (`create-order:730`, `item.name`), not the DB `item_name_snapshot` source.
- `is_required` is a stored, vendor-set column that no code reads (`order.html:3655` render-only) — dead as an enforced constraint.

> **NEEDS-ED-VERIFY-2** — confirm the `order_item_selections.bundle_line_id` FK/NOT-NULL status (bears on whether the table could ever record a non-bundle modifier):
> ```sql
> SELECT column_name, is_nullable
> FROM information_schema.columns
> WHERE table_name = 'order_item_selections'
> ORDER BY ordinal_position;
>
> SELECT conname, contype, confrelid::regclass AS references
> FROM pg_constraint
> WHERE conrelid = 'order_item_selections'::regclass;
> ```
