# Hosted / Neighbourhood Drops + Lifecycle — Fact-Gathering (read-only)

**Date:** 2026-06-22 · **Scope:** answer G–L from source before a hold-expiry rebuild.
No fixes/code proposed. Tags: `[REPO-CONFIRMED]` = file:line read; `[NEEDS-ED-VERIFY]`
= live DB/view/cron internals not in repo, with the query to run.

Uncommitted — for review before code.

---

## G. create-order — `drop_type` branching beyond capacity. Only ONE branch exists (the event capacity-skip). Hosted/neighbourhood are NOT special-cased. [REPO-CONFIRMED]

`drop_type` is read **once**, in the Step 3.5 `drops` select
(`supabase/functions/create-order/index.ts:258`):
```ts
.select("delivery_area_type, allowed_postcode_prefixes, capacity_driver, capacity_categories, drop_type, discount_tiers")
```
and branched on in **exactly one place** — the capacity-enforcement skip for events
(`create-order:467-468`):
```ts
// is skipped entirely for drop_type === "event".
if (dropAreaRow?.drop_type !== "event") {
   ... capacity check ...                                  // :469-489
}
```
A full-file grep for `drop_type` returns only `:258` (select), `:467` (comment),
`:468` (the event skip). There is **no** `hosted` / `neighbourhood` / `community`
branch anywhere in the function — host-anchored and neighbourhood drops flow through
create-order **identically** to a plain vendor drop (same validation, same capacity
math, same writes). The only `drop_type`-conditional behaviour is: events skip the
capacity ceiling check (G is the same fact as the known ~468-489 capacity-skip; there
is nothing else). [REPO-CONFIRMED]

---

## H. create-order — fulfilment + delivery-area enforcement. [REPO-CONFIRMED]

**Reads `fulfilment.mode`? Yes, and null/other is rejected at validation.**
The payload validator requires `mode` to be exactly `"delivery"` or `"collection"`
(`create-order:136-140`):
```ts
const f = b.fulfilment as Record<string, unknown> | undefined;
if (!f || typeof f !== "object") return { ok: false, reason: "fulfilment is required" };
if (f.mode !== "delivery" && f.mode !== "collection") {
  return { ok: false, reason: "fulfilment.mode must be 'delivery' or 'collection'" };
}
```
So a **null** `fulfilment.mode` (the T5-B29 multi-window-parent concern, where
`buildCheckoutPayload` can send `mode: null`) → **400 at the validator**, before any
DB work. create-order does not infer a mode from the child window; it hard-rejects.
The mode is later written verbatim to `orders.fulfilment_mode`
(`create-order:559`) and `orders.delivery_address ← payload.fulfilment.address`
(`:560`). [REPO-CONFIRMED]

**Delivery-area enforcement — server-side, on `drops.delivery_area_type`
(`create-order:249-276`):**
```ts
const { data: dropAreaRow } = await serviceClient
  .from("drops")
  .select("delivery_area_type, allowed_postcode_prefixes, ...")     // :256-258
  .eq("id", payload.drop_id).maybeSingle();
const areaType = dropAreaRow.delivery_area_type;                     // :264
if (areaType === "radius") {
  return jsonResponse({ ok: false, reason: "delivery_area_radius_not_supported" }, 501); // :265-267
}
if (areaType === "postcode_prefix") {
  const allowed = dropAreaRow.allowed_postcode_prefixes;
  if (!Array.isArray(allowed) || allowed.length === 0) {
    return jsonResponse({ ok: false, reason: "delivery_area_misconfigured" }, 500);       // :270-272
  }
  if (!matchesAllowedPrefix(payload.customer.postcode, allowed)) {
    return jsonResponse({ ok: false, reason: "delivery_area_excluded" }, 400);            // :273-275
  }
}
```
So it **does** enforce server-side, but the surface is narrow:
- `delivery_area_type === 'radius'` → hard **501** (radius mode never accepts an order;
  T3-12b unbuilt). There is **no** `radius_km` / `is_radius_restricted` read or distance
  math anywhere — those column names do not appear in the function. [REPO-CONFIRMED]
- `delivery_area_type === 'postcode_prefix'` → checks `customer.postcode` against
  `allowed_postcode_prefixes` via `matchesAllowedPrefix` (`create-order:68-76`).
- `delivery_area_type` NULL / anything else → **no restriction**, passes through.

**Caveat to quote for the rebuild:** the area check is **not** gated on
`fulfilment.mode` — it runs against `payload.customer.postcode` regardless of whether
the order is `delivery` or `collection` (`:264-276` has no `mode` condition). A
`postcode_prefix`-restricted drop therefore also prefix-filters collection orders. [REPO-CONFIRMED]

---

## I. create-order — cutoff / orderability gate. A gate EXISTS (status + time window). [REPO-CONFIRMED]

Two stacked checks before any write:

**(1) Status** (`create-order:14, 223-236`) — read from `v_drop_summary` (chosen so a
time-closed drop is caught regardless of raw `drops.status`):
```ts
const ORDERABLE_STATUSES = new Set(["live", "scheduled"]);            // :14
...
.from("v_drop_summary").select("drop_id, vendor_id, slug, status, opens_at, closes_at, capacity_units_total")  // :225-227
...
if (!ORDERABLE_STATUSES.has(String(dropSummary.status))) {
  return jsonResponse({ error: "This drop is not currently open for orders" }, 400);  // :234-235
}
```
So a drop whose (view-derived) status is `closed`, `completed`, `cancelled`,
`draft`, `archived` → **400, no order**. Only `live`/`scheduled` proceed.

**(2) Time window** (`create-order:238-247`) — independent of status:
```ts
const now = Date.now();
const opensAt = dropSummary.opens_at ? Date.parse(dropSummary.opens_at) : null;
const closesAt = dropSummary.closes_at ? Date.parse(dropSummary.closes_at) : null;
if (opensAt !== null && now < opensAt) {
  return jsonResponse({ error: "This drop has not opened yet" }, 400);       // :242-243
}
if (closesAt !== null && now > closesAt) {
  return jsonResponse({ error: "Ordering for this drop has closed" }, 400);  // :245-246
}
```
**Answer: NO order can be created against a closed / past-`closes_at` drop** — it is
rejected either by the status gate (1) or the `closes_at` window gate (2). There is no
separate `cutoff_time` column read; `closes_at` is the cutoff. (If `closes_at` is NULL,
the time gate is skipped and the status gate alone governs.) [REPO-CONFIRMED]

> [NEEDS-ED-VERIFY] The status gate's correctness depends on `v_drop_summary.status`.
> Per CLAUDE.md #81 the view re-derives `'closed'` from `closes_at` in-view (and only
> knows `closed`, not `completed`), and can lead/lag the stored `pg_cron` status by up
> to 15 min. Confirm what `v_drop_summary.status` actually projects:
> ```sql
> select definition from pg_views where schemaname='public' and viewname='v_drop_summary';
> ```

---

## J. order.html — same gates client-side; the time fields are enforced server-side too. [REPO-CONFIRMED]

**What it reads:** `state.drop` is read **directly from the `drops` table** (anon),
including `status, opens_at, closes_at` (`order.html:2426-2433`):
```js
.from("drops")
.select("id, slug, name, status, drop_type, ... opens_at, closes_at, ... fulfilment_mode, ... delivery_area_type, allowed_postcode_prefixes, discount_tiers")
...
state.drop = dropRes.data;
```
(Capacity comes separately from `v_drop_public` → `state.dropSummary`, see prior
holds-capacity audit; that's not the orderability gate.)

**Window computation — time-based, mirrors server** (`order.html:2203-2211`):
```js
function getOrderWindowState() {
  const now = new Date();
  const opensAt = state.drop?.opens_at ? new Date(state.drop.opens_at) : null;
  const closesAt = state.drop?.closes_at ? new Date(state.drop.closes_at) : null;
  if (opensAt && now < opensAt) return { state: "preopen", ... };
  if (closesAt && now > closesAt) return { state: "closed", ... };
  return { state: "open", ... };
}
```
**Closed/pre-open helpers** (`order.html:2294-2299`) — note `isDropClosed` ALSO honours
stored status:
```js
function isDropClosed() {
  return getOrderWindowState().state === "closed" || String(state.drop?.status || "").toLowerCase() === "closed";
}
function isDropPreOpen() { return getOrderWindowState().state === "preopen"; }
```
**Checkout gate** (`order.html:3855-3862`):
```js
function validateCheckout() {
  if (!state.basket.length) return "Add at least one item to your basket.";
  if (isDropClosed())  return "Ordering for this service is closed.";        // :3857
  if (isDropPreOpen()) return "This service is not open for orders yet.";    // :3858
  if (getCapacityRemainingAfterBasket() < 0) { return "...exceeds the remaining ... capacity..."; }
  ...
}
```
The whole menu add/qty UI is also disabled when closed/pre-open
(`order.html:3033, 3159, 3178, 3198, 3423`).

**Cross-ref to I:** the client gates on `opens_at`/`closes_at` (time) and
`status==='closed'`. Server-side create-order independently re-checks the **same**
`opens_at`/`closes_at` (I.2) and a **status allow-list** (I.1, `{live,scheduled}` from
`v_drop_summary`). So the time window is enforced on both sides; the client's
`status==='closed'` short-circuit is backstopped server-side by the stricter
allow-list. The client reads raw `drops.status`; the server reads
`v_drop_summary.status` (view-derived) — these can momentarily disagree (CLAUDE.md
#81), but both reject a genuinely-closed drop. Client-side checks are UX; the server
gate in I is the boundary. [REPO-CONFIRMED]

---

## K. host-share in create-order's write path? NONE. Host economics are reporting-only. [REPO-CONFIRMED]

A full-file grep of `create-order/index.ts` for
`host_share | host_split | host_cut | host_fee | host_pence | host_id | fundrais*`
returns **zero matches**. create-order:
- never reads `host_id` (it reads the drop's vendor/Stripe/capacity/area fields only,
  `:225-227, 256-258, 282-284`);
- computes only `platform_fee_pence` (`:500-501`) and writes `total_pence`,
  `discount_pence`, `discount_breakdown`, `platform_fee_pence`, `pizzas` to the order
  (`:563-577`) — **no host column** is written to `orders`, `order_items`, or
  `order_item_selections`;
- the Stripe split is platform-fee + vendor-destination only
  (`application_fee_amount` + `transfer_data.destination`, `:725-727`) — **no host
  transfer/leg**.

So host-share / fundraising is **purely reporting** (computed in views such as
`v_drop_fundraising_summary` / `v_host_performance` from `orders.total_pence`,
per CLAUDE.md #55/#56), not part of the order write path. The host descriptor shown to
hosts is built server-side in `host-view-summary`, not here. [REPO-CONFIRMED]

> [NEEDS-ED-VERIFY] (only if the rebuild needs to confirm the reporting side is
> view-derived and writes nothing back to orders):
> ```sql
> select viewname, definition from pg_views
> where schemaname='public' and viewname in ('v_drop_fundraising_summary','v_host_performance');
> ```

---

## L. Reconcile / sweep / pending_payment-vs-Stripe EF — STILL DOES NOT EXIST. [REPO-CONFIRMED]

Re-confirmed against the current `supabase/functions/` tree. Filtering the directory
for `reconcile|sweep|cron|expire|stale|hold|sync|poll|check|stripe` yields only:
```
check-stripe-connect-status   — reads a vendor's Connect onboarding state (Stripe Account), not orders
create-stripe-connect-link    — onboarding link
create-stripe-login-link      — Express dashboard login link
stripe-webhook                — event receiver (completed/expired/async_payment_failed)
```
None of these scans `orders` for stuck `pending_payment` rows or queries Stripe to
reconcile them. The only paths that move a `pending_payment` order off that state are
the **event-driven** `stripe-webhook` (expired/failed → cancelled; completed → placed)
and the **customer-return** `cancel-order` (pending→cancelled). There is **no**
time-based sweep, cron-target reconcile, or "expire stale holds" function anywhere in
the tree. (The two `dispatch-*` functions are comms senders, not order reconcilers.) [REPO-CONFIRMED]

---

### Cross-cutting summary (facts only)
- Hosted/neighbourhood drops are **not** distinguished in create-order; only `event`
  is (capacity skip, G). [REPO-CONFIRMED]
- A null `fulfilment.mode` is **rejected** at validation (H, the T5-B29 case 400s
  server-side). Delivery-area enforcement exists for `postcode_prefix` (and 501s
  `radius`), runs regardless of mode, with no radius/distance logic. [REPO-CONFIRMED]
- Orderability is gated server-side by status allow-list + `opens_at`/`closes_at`
  (I); the client mirrors the same window + raw status (J). A closed/past-cutoff drop
  cannot create an order. [REPO-CONFIRMED]
- No host-share in the write path (K); no reconcile/sweep EF (L) — holds release only
  via Stripe's `checkout.session.expired` webhook or customer-cancel.

*End — facts only, no fixes or code, per instructions.*
