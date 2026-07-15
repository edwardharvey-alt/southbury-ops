# Holds-expiry & Capacity — Fact-Gathering (read-only)

**Date:** 2026-06-22 · **Scope:** answer A–F from source before a rebuild prompt.
No fixes/code proposed. Tags: `[REPO-CONFIRMED]` = file:line read; `[NEEDS-ED-VERIFY]`
= live DB/view internals (Ed applies schema by hand, so view bodies aren't in repo).

Uncommitted — for review before code.

---

## PHASE 1 — hold expiry

### A. stripe-webhook event types — does it handle `checkout.session.expired`? YES. [REPO-CONFIRMED]
It allow-lists exactly three event types and ignores everything else
(`supabase/functions/stripe-webhook/index.ts:52-62`):
```ts
const handled = new Set([
  "checkout.session.completed",
  "checkout.session.expired",
  "checkout.session.async_payment_failed",
]);
if (!handled.has(event.type)) { /* 200 ack, ignored */ }
```
It branches `completed` (→ placed/paid) at `:94`, and `expired` **or**
`async_payment_failed` together at `:167-200`. The expired/failed block
(`stripe-webhook:167-200`):
```ts
} else if (
  event.type === "checkout.session.expired" ||
  event.type === "checkout.session.async_payment_failed"
) {
  // Only act if the order is still pending payment...
  if (order.status !== "pending_payment") { /* 200 idempotent */ }
  const stripePaymentStatus = event.type === "checkout.session.expired" ? "expired" : "failed";
  await serviceClient.from("orders")
    .update({ status: "cancelled", stripe_payment_status: stripePaymentStatus })
    .eq("id", order.id);                                   // :180-183
  await serviceClient.from("order_status_events").insert({ // :188-196
    order_id: order.id, drop_id: order.drop_id,
    from_status: "pending_payment", to_status: "cancelled",
    event_type: "status_change", actor: "stripe-webhook", actor_type: "system",
  });
}
```
So the hold is released only when Stripe **delivers** `checkout.session.expired`
(or `async_payment_failed`) **and** the order is still `pending_payment`. There is
no time-based sweep inside the function — it is purely event-driven off Stripe. [REPO-CONFIRMED]

### B. create-order — does it set session expiry? YES, `expires_at = now + 1800s`. [REPO-CONFIRMED]
`supabase/functions/create-order/index.ts:708-741` (session-create params):
```ts
session = await stripe.checkout.sessions.create({
  mode: "payment",
  // Stripe's documented minimum for expires_at is 1800 seconds (30 minutes)...
  expires_at: Math.floor(Date.now() / 1000) + 1800,        // :713
  customer_email: payload.customer.email || undefined,
  billing_address_collection: "auto",
  line_items: payload.basket.map(...),                      // :716-723
  discounts: coupon ? [{ coupon: coupon.id }] : undefined,
  payment_intent_data: {
    application_fee_amount: platformFeePence,
    transfer_data: { destination: vendor.stripe_account_id! },
    metadata: { order_id, drop_id, vendor_id },
  },
  metadata: { order_id, drop_id, vendor_id },
  success_url: successUrl,
  cancel_url: cancelUrl,
});
```
The session expires 30 min after creation; Stripe then emits
`checkout.session.expired`, which (A) converts to `cancelled`. The order is written
`pending_payment` before this (`create-order:564`), and the hold persists until that
event fires. [REPO-CONFIRMED]

### C. order.html — availability / "slots remaining" / sold-out source + render. [REPO-CONFIRMED]
**Source:** the drop-level summary is read from the **`v_drop_public`** view into
`state.dropSummary` (`order.html:2440-2447`):
```js
const summaryRes = await supabase
  .from("v_drop_public")
  .select("*")
  .eq("drop_id", state.drop.id)
  .maybeSingle();
...
state.dropSummary = summaryRes.data || null;
```
Remaining capacity is read straight off that row (`order.html:2228-2238`):
```js
function getCapacityRemainingRaw() {
  return Number(state.dropSummary?.capacity_units_remaining ?? 0);   // :2229
}
function getBasketCapacityUnits() {                                   // client mirror
  return state.basket.reduce((sum, item) =>
    sum + (Number(item.capacity_units || 0) * Number(item.quantity || 0)), 0);  // :2233
}
function getCapacityRemainingAfterBasket() {
  return getCapacityRemainingRaw() - getBasketCapacityUnits();        // :2237
}
```
**Render decision (drop-level chip + notices)** — `order.html:2760-2796`:
```js
if (String(state.drop?.drop_type || "").toLowerCase() === "event") {
  capacityChip.classList.add("hidden"); ...                          // events: hide chip
} else {
  const remaining = Math.max(0, getCapacityRemainingAfterBasket());
  const rawRemaining = Math.max(0, getCapacityRemainingRaw());
  const total = Math.max(0, Number(state.drop?.capacity_units_total ?? 0));
  const lowThreshold = Math.max(5, Math.ceil(total * 0.1));
  if (total > 0 && rawRemaining >= total) { /* hide chip */ }        // :2771
  else if (total > 0 && rawRemaining > 0 && rawRemaining <= lowThreshold) {
    capacityChip.textContent = "Last few places";                    // :2774-2776
  } else {
    capacityChip.textContent = total > 0
      ? `${remaining} of ${total} places remaining` : `Places available · ${remaining}`; // :2778-2780
  }
}
const remaining = Math.max(0, getCapacityRemainingAfterBasket());
... else if (remaining <= 0) { showNotice("This service is fully booked.", "warn"); }  // :2792-2793
```
`capacity_units_total` here comes from the drop row read directly from `drops`
(`order.html:2427-2428`, `select(... capacity_units_total ...)`). Checkout is also
gated client-side on the same number (`validateCheckout`:`order.html:3860-3862`).
**Sibling/window tiles** read remaining from `v_drop_public` too
(`order.html:4305-4315`: `select("drop_id, capacity_units_remaining")`,
`isFull = remaining <= 0` at `:4351-4352`). [REPO-CONFIRMED]

**Per-MENU-ITEM sold-out is NOT capacity-driven in this build.** Each menu item is
built with `is_sold_out: false` hardcoded (`order.html:2621` product, `:2644`
bundle); the `soldOut` CSS / "Sold out" badge / disabled add-button
(`:3037, 3043, 3159-3192`) therefore never trigger from capacity — only the
drop-level `capacity_units_remaining` path above drives the live availability UI. [REPO-CONFIRMED]

### D. Existing reconcile / sweep / cron-target EF? NONE in `supabase/functions/`. [REPO-CONFIRMED]
Full directory (61 functions + `_shared`):
```
_shared, activation-events, admin-get-vendor, admin-list-drop-orders,
admin-list-vendor-drops, admin-list-vendors, admin-verify, assign-menu-items,
bulk-create-customers, cancel-order, check-stripe-connect-status, complete-onboarding,
create-bundle, create-category, create-drop, create-host, create-order, create-product,
create-stripe-connect-link, create-stripe-login-link, create-vendor, delete-bundle,
delete-bundle-line, delete-category, delete-product, dispatch-interest-open,
dispatch-post-drop-thankyou, duplicate-bundle, fetch-order, generate-activation-copy,
get-customers-workspace, get-demand-preview, get-drop, get-drop-comms,
get-drop-host-token, get-drop-signals, get-home-dashboard, get-host, get-insights,
get-vendor-customer-count, host-view-summary, invite-vendor, list-drops, list-hosts,
register-interest, remove-event-window, save-bundle-line, send-drop-open-email,
send-early-access-email, send-host-activation-email, send-order-confirmation,
send-post-drop-thankyou, stripe-webhook, transition-drop-status, transition-order-status,
update-bundle, update-bundle-sort-order, update-category, update-category-sort-order,
update-drop, update-host, update-product, update-product-sort-order, update-vendor
```
The only "dispatch-*" functions are comms senders (`dispatch-interest-open`,
`dispatch-post-drop-thankyou`) — they email; they do **not** reconcile orders or
release holds. There is **no** order-reconcile, capacity-sweep, expire-stale-holds,
or generic cron-target function. The only hold-release paths are the event-driven
`stripe-webhook` expiry (A) and the customer-return `cancel-order`
(`cancel-order:91-101`, pending→cancelled). [REPO-CONFIRMED]

---

## PHASE 2 — capacity

### E. create-order capacity-enforcement block — driver-aware, writes both columns. [REPO-CONFIRMED]
**(1) Per-item server-authoritative usage, branches on `drops.capacity_driver` and
`drops.capacity_categories`** (`create-order:409-456`). The driver/categories are
read from the `drops` row at `:256-258`
(`select("... capacity_driver, capacity_categories, drop_type ...")`):
```ts
const capacityDriver = String(dropAreaRow.capacity_driver || "");        // :415
const capacityCategorySet = new Set<string>( ...capacity_categories... ); // :416-422
const serverItemCapacity: number[] = new Array(payload.basket.length).fill(0);
for (let i = 0; i < payload.basket.length; i++) {
  const item = payload.basket[i];
  const row = item.type === "product" ? productMap.get(item.product_id)
                                       : bundleMap.get(item.bundle_id);   // :427-430
  if (!row || !row.counts_toward_capacity) { serverItemCapacity[i] = 0; continue; }  // :431-434
  if (capacityDriver === "by_order")   { serverItemCapacity[i] = 0; continue; }      // :435-439 (counted once at total)
  if (capacityDriver === "by_category") {
    if (!row.category_id || !capacityCategorySet.has(row.category_id)) {
      serverItemCapacity[i] = 0; continue;                                            // :441-444
    }
    serverItemCapacity[i] = row.capacity_weight * item.quantity;                      // :445
    continue;
  }
  serverItemCapacity[i] = 0;  // unknown driver → 0                                   // :450
}
const totalOrderConsumption =
  capacityDriver === "by_order" ? 1 : serverItemCapacity.reduce((s,n)=>s+n,0);         // :453-456
```
`counts_toward_capacity`, `capacity_weight`, and `category_id` come from the
`products`/`bundles` rows fetched in Step 5 (`create-order:312-353`). So it does
**NOT** assume a flat count — `by_order` = 1 per order, `by_category` =
Σ(`capacity_weight × qty`) for items whose `category_id ∈ capacity_categories`.
The incoming order's `payload.totals.capacity_units` and per-item `capacity_units`
are explicitly **ignored** (`create-order:412-414`). [REPO-CONFIRMED]

**(2) Enforcement check — sums `orders.pizzas` over non-cancelled rows**
(`create-order:458-489`):
```ts
if (dropAreaRow?.drop_type !== "event") {                       // events skip enforcement
  const { data: liveOrders } = await serviceClient
    .from("orders").select("pizzas")
    .eq("drop_id", payload.drop_id).neq("status", "cancelled"); // :469-473 (incl. pending_payment)
  const alreadyConsumed = (liveOrders||[]).reduce((s,r)=>s+Number(r.pizzas ?? 0),0); // :478-481
  const capacityTotal = Number(dropSummary.capacity_units_total ?? 0);               // :482
  if (alreadyConsumed + totalOrderConsumption > capacityTotal) {                     // :483
    return jsonResponse({ error: "Not enough capacity remaining..." }, 400);
  }
}
```

**(3) Both capacity columns ARE written:**
- `orders.pizzas` ← `capacityUnitsConsumed = Math.max(1, totalOrderConsumption)`
  (`create-order:502` computed, written at `:577` in the orders insert). This is the
  value the enforcement check (2) sums, and the carrier the display view mirrors. [REPO-CONFIRMED]
- `order_items.capacity_units_snapshot` ← `serverItemCapacity[i]` (the per-item
  server-computed contribution) (`create-order:627`, in the order_items insert loop). [REPO-CONFIRMED]

Summary: incoming usage is computed server-side per driver; `orders.pizzas` holds the
order-total units (min 1), `order_items.capacity_units_snapshot` holds the per-line
units; the available-capacity check is `Σ(orders.pizzas where status≠cancelled) +
thisOrder ≤ capacity_units_total`, skipped for `drop_type='event'`. [REPO-CONFIRMED]

### F. Customer-facing capacity source of truth. [REPO-CONFIRMED + view internals NEEDS-ED-VERIFY]
- **order.html** reads `v_drop_public.capacity_units_remaining` /
  `capacity_units_total` (see C: `order.html:2441-2447, 2229, 4308-4315`). So the
  customer's "places remaining / fully booked" resolves to **`v_drop_public`**. [REPO-CONFIRMED]
- **order-confirmation.html** reads **no capacity at all** — its only data source is
  the `fetch-order` EF (`order-confirmation.html:428-429, 736-737`), and `fetch-order`'s
  response surface returns order/items/drop/vendor/host but **no** capacity fields
  (`fetch-order/index.ts:184-225` — `drop` projection is
  `id, slug, name, opens_at, closes_at, fulfilment_mode, collection_point_description,
  delivery_area_description`). The confirmation page does not display availability. [REPO-CONFIRMED]
- **Does `v_drop_public` count `pending_payment`?** The view body is not in the repo
  (applied by hand), so it is **[NEEDS-ED-VERIFY]**. Repo evidence of the intended
  behaviour: `create-order:458-464` comment states the server check "Mirrors
  `v_drop_capacity_usage`: only cancelled rows are excluded, so pending_payment orders
  DO consume capacity," and the enforcement query (E2) excludes only `status='cancelled'`.
  CLAUDE.md operational learning #74 asserts the same (`v_drop_capacity_usage` feeds
  `v_drop_summary` → `v_drop_public`, computing `SUM(orders.pizzas) WHERE status ≠
  'cancelled'`), i.e. display and enforcement are in parity and both count
  `pending_payment`. Confirm against the live view definition before relying on it:
  ```sql
  select viewname, definition from pg_views
  where schemaname='public'
    and viewname in ('v_drop_public','v_drop_summary','v_drop_capacity_usage')
  order by viewname;
  ```
  (Check the `capacity_units_remaining` / `capacity_units_used` expression excludes
  only `cancelled`, i.e. includes `pending_payment`.) [NEEDS-ED-VERIFY]

---

### One cross-cutting note (no fix, just the fact)
The same legacy column `orders.pizzas` is simultaneously (i) the capacity carrier the
enforcement check sums (E2, `:471`), (ii) written from the server-computed total
(`:577`), and (iii) — per CLAUDE.md #74 / the create-order comment — the value the
display view aggregates. So holds (`pending_payment` rows) and capacity display/enforce
all hinge on `orders.pizzas` + `status≠cancelled`. Whether the live `v_drop_public`
actually computes it that way is the one open [NEEDS-ED-VERIFY] (query above).

*End — facts only, no fixes or code, per instructions.*
