# Pass P1 findings — Capacity & concurrency integrity (create-order path)

**Summary: 2 CRITICAL · 1 HIGH · 2 MEDIUM · 4 NEEDS-ED-VERIFY · 3 invariants recorded as HOLDS (C2, C3 check-side, C4 model coherence).**

Run 2026-07-08 against origin/main @ dc3865f. Read-only pass per
audit/Hearth_Transaction_Integrity_Audit.md, invariants C1–C5. All evidence quoted
from actual source on this commit — no assertions inherited from handover docs.
The one standing-context claim relied on (operational learning #74, the
`v_drop_capacity_usage` definition) is explicitly flagged NEEDS-ED-VERIFY below
because the view DDL is not in the repo.

---

## [CRITICAL] C1 — Last-slot race: capacity check is read-then-write with a multi-round-trip window before the insert

**Where:** supabase/functions/create-order/index.ts:661-692 (check) and :791-799 (insert). DB objects: `orders`, `drops`, `v_drop_summary`.

**Invariant:** C1.

**Evidence:** The capacity check is a plain read:

```ts
// Step 8 — capacity available. (:671-692)
const { data: liveOrders, error: liveOrdersErr } = await serviceClient
  .from("orders")
  .select("pizzas")
  .eq("drop_id", payload.drop_id)
  .neq("status", "cancelled");
...
const alreadyConsumed = (liveOrders || []).reduce(
  (sum, row) => sum + Number(row.pizzas ?? 0), 0);
const capacityTotal = Number(dropSummary.capacity_units_total ?? 0);
if (alreadyConsumed + totalOrderConsumption > capacityTotal) {
  return jsonResponse({ error: "Not enough capacity remaining..." }, 400);
}
```

The order insert is a separate, unconditional statement that runs later (:791-799):

```ts
const { data: orderRow, error: orderErr } = await serviceClient
  .from("orders")
  .insert(orderInsert)
  .select("id")
  .single();
```

Between check and insert sit at least two more network round trips: the Stripe
env check (:696-701) and the customer + customer_relationships upserts
(:717-754, only when email present). There is no transaction (the function's own
comment at :710-711 says "No transactions over PostgREST"), no `SELECT ... FOR
UPDATE`, no conditional insert, no atomic decrement, and no RPC. No DB-level
trigger or constraint enforcing the capacity sum is visible anywhere in
`supabase/migrations/` (grep for `CREATE TRIGGER` returns nothing; the only
constraint documented on `orders.pizzas` is the per-row `>= 1` CHECK, SCHEMA.md
"Gotchas"). The Edge Function check is the only enforcement.

**Proof (failure sequence):** Drop D, `capacity_driver = 'by_order'`,
`capacity_units_total = 10`, nine non-cancelled orders already exist
(alreadyConsumed = 9 — one slot left).

1. t1 — Request A (customer 1 hits Pay) runs Step 8: reads sum = 9; 9 + 1 ≤ 10 → passes.
2. t2 — Request B (customer 2 hits Pay) runs Step 8 concurrently: A has not yet inserted, so B also reads sum = 9 → passes. (The window is the full Step-8→Step-B span: Stripe env check + customer upsert + relationship upsert ≈ hundreds of ms — easily wide enough for two Pay clicks in the closing minutes of a drop.)
3. t3 — Request A inserts its order (`pizzas = 1`). Sum is now 10.
4. t4 — Request B inserts its order (`pizzas = 1`). Sum is now 11 > 10.
5. Both requests proceed to create Stripe Checkout sessions and return 200; both customers can pay. The drop is oversold by one unit and nothing detects it.

Runnable demonstration (against a test drop with exactly 1 unit remaining;
`payload.json` = a valid 1-unit basket for that drop):

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/create-order" -H "Content-Type: application/json" -d @payload.json &
curl -sS -X POST "$SUPABASE_URL/functions/v1/create-order" -H "Content-Type: application/json" -d @payload.json &
wait
# Buggy behaviour: both return 200 with checkout_url.
# Correct behaviour: exactly one 200, one 400 "Not enough capacity remaining".
# Confirm with: SELECT count(*), sum(pizzas) FROM orders WHERE drop_id = '<D>' AND status <> 'cancelled';
```

**Suggested:** Move check + insert into a single Postgres function called via
`rpc()` that takes `FOR UPDATE` on the drop row (serialising per-drop) before
summing and inserting — or add a capacity-enforcing insert trigger as a DB
backstop. Per-drop serialisation is cheap at Hearth's scale. Ticket:
T-TX-C1-atomic-capacity-check.

---

## [CRITICAL] C3 — Phantom capacity consumption: zero-consumption orders write `pizzas = 1` and the ledger counts it

**Where:** supabase/functions/create-order/index.ts:708 and :786-788 (write); :671-684 (the ledger read that counts it). Also the display path (`v_drop_capacity_usage` → `v_drop_summary` → `v_drop_public`) per operational learning #74.

**Invariant:** C3 (and corrupts the C1/C2 ledger).

**Evidence:** Step 7.5 correctly computes a `by_category` order containing only
non-driving items (e.g. drinks) as consuming **0** units (:643-649: items whose
`category_id` is not in `capacity_categories`, or with
`counts_toward_capacity = false`, contribute 0). The Step-8 check for the
current order uses that true value (`totalOrderConsumption`). But the row is
then written with a floor of 1:

```ts
const capacityUnitsConsumed = Math.max(1, totalOrderConsumption);   // :708
...
// Legacy NOT NULL >= 1 column (see SCHEMA.md). Populate with
// capacity units consumed, minimum 1, until formally migrated away.
pizzas: capacityUnitsConsumed,                                      // :786-788
```

And the capacity ledger for every *subsequent* order is `sum(orders.pizzas)`
(:681-684). So a drinks-only order on a `by_category` drop consumes 0 units at
its own check but permanently occupies 1 unit in every later check. The public
capacity chip shows the same corrupted number, because the display path
(`v_drop_capacity_usage`, per operational learning #74) also sums
`orders.pizzas` — display and enforcement agree with each other and are both
wrong. The `Math.max(1, …)` exists only to satisfy the legacy `pizzas >= 1`
CHECK constraint (SCHEMA.md Gotchas), not as a capacity decision; the true
per-item values are already stored in `order_items.capacity_units_snapshot`
(:843).

**Proof:** Drop D, `capacity_driver = 'by_category'`,
`capacity_categories = [<pizza-category-id>]`, `capacity_units_total = 10`.
Menu includes Cola (category Drinks, not in `capacity_categories`).

1. t1 — Customer orders 2× Cola, nothing else. Step 7.5: `serverItemCapacity = [0]`, `totalOrderConsumption = 0`. Step 8: `0 + 0 ≤ 10` → passes. Row written with `pizzas = Math.max(1, 0) = 1`.
2. t2 — Any later capacity check on D reads `alreadyConsumed = 1` although zero pizzas have been sold.
3. Repeat step 1 ten times: the drop reads as sold out (`capacity_units_remaining = 0` on the order page, Step 8 rejects everything) with **zero units of the driving category actually sold** — a phantom sellout that silently costs the vendor the entire drop's pizza revenue.

Detection SQL (any environment with by_category drops):

```sql
SELECT o.id, o.pizzas,
       COALESCE(SUM(oi.capacity_units_snapshot), 0) AS true_units
FROM orders o JOIN order_items oi ON oi.order_id = o.id
WHERE o.status <> 'cancelled'
GROUP BY o.id, o.pizzas
HAVING o.pizzas <> GREATEST(1, COALESCE(SUM(oi.capacity_units_snapshot), 0))
    OR (o.pizzas = 1 AND COALESCE(SUM(oi.capacity_units_snapshot), 0) = 0);
-- Rows where pizzas = 1 but true_units = 0 are phantom consumers.
```

**Suggested:** Make the ledger sum a source that can hold 0 — either sum
`order_items.capacity_units_snapshot` in Step 8 and the capacity views, or
relax the `pizzas >= 1` CHECK to `>= 0` and write the true value (schema change
+ EF redeploy are an atomic pair, operational learning #43). Overlaps
T5-B31/T-B3 (pizzas column retirement) — this finding makes that cleanup
correctness-bearing, not just hygiene. Ticket: T-TX-C3-zero-unit-pizzas-floor.

---

## [HIGH] C4 — Unreleasable capacity hold: a pending order with no `stripe_session_id` is skipped forever by every release path

**Where:** supabase/functions/create-order/index.ts:802-822 (`markCancelled`, best-effort with swallowed catch); supabase/functions/reconcile-pending-orders/index.ts:163-172 (permanent skip).

**Invariant:** C4.

**Evidence:** The order row is inserted (:791) *before* the Stripe session
exists; `stripe_session_id` is stamped last (:997-1000). If any step between
fails, cleanup is `markCancelled`, which is explicitly best-effort:

```ts
} catch (cleanupErr) {
  console.error("cleanup after order failure failed", cleanupErr);  // :819-821
}
```

If `markCancelled` itself fails (the same outage that broke the primary step is
the likely cause), the order stays `pending_payment` with
`stripe_session_id = NULL`. From there, every release path declines it:

- stripe-webhook finds orders by `stripe_session_id` (stripe-webhook/index.ts:74-78) — no session, no event, never fires.
- cancel-order requires the matched pair including `session_id` (cancel-order/index.ts:76-81) — the customer never received one.
- reconcile-pending-orders explicitly skips it, forever, on every sweep:

```ts
if (!order.stripe_session_id) {
  console.error(JSON.stringify({ event: "reconcile_skipped_no_session", ... }));
  return "skipped";                     // reconcile-pending-orders/index.ts:164-172
}
```

Meanwhile Step 8's ledger counts it (`.neq("status", "cancelled")` — a stuck
`pending_payment` row consumes capacity indefinitely). No alert exists beyond a
console.error line in the EF logs. This meets the HIGH definition exactly:
state corruption recoverable only by manual intervention, failure with no alert.

**Proof (failure sequence):**

1. t1 — create-order inserts order O (`pending_payment`, `pizzas = n`, no session id yet).
2. t2 — `stripe.checkout.sessions.create` throws (Stripe outage / network fault) → `markCancelled("stripe_session_create_failed")` runs (:988-991).
3. t3 — `markCancelled`'s UPDATE also fails (same transient fault window); the catch at :819-821 swallows it. Customer sees a 502 and gives up or retries (a retry creates a *second* order, doubling the held units).
4. Result: O is `pending_payment`, `stripe_session_id IS NULL`, holds n units in every Step-8 check on that drop, and is skipped by reconcile on every future sweep. On a capacity-10 drop, a handful of these during a Stripe blip quietly shrinks the sellable drop with no operator-visible signal.

Detection SQL (also the manual recovery query):

```sql
SELECT id, drop_id, pizzas, created_at
FROM orders
WHERE status = 'pending_payment'
  AND stripe_session_id IS NULL
  AND created_at < now() - interval '1 hour';
```

**Suggested:** Extend reconcile-pending-orders' cancel branch to cover
session-less pendings past the hold window (there is nothing to ask Stripe
about — no session can ever pay, so cancelling is safe and idempotent). One
conditional change in `reconcileOne`. Ticket: T-TX-C4-reconcile-sessionless-pendings.

---

## [MEDIUM] C5 — Close-window enforcement has two gaps: an in-flight seconds race, and a 15-minute open window when `closes_at` is NULL

**Where:** supabase/functions/create-order/index.ts:260-284 (Steps 2–3) vs :791 (insert); supabase/migrations/20260612061555_drop_lifecycle_engine.sql (the cron engine).

**Invariant:** C5.

**Evidence:** create-order enforces the window server-side at *check* time:
Step 2 requires `v_drop_summary.status ∈ {live, scheduled}` (:271-273) and
Step 3 independently checks the timestamps (:276-284):

```ts
if (opensAt !== null && now < opensAt) { ...400... }
if (closesAt !== null && now > closesAt) { ...400... }
```

Because Step 3 reads `closes_at` directly, a cron-lag race on time-based
closure does not exist — the check does not wait for the engine. Two gaps
remain:

(a) **In-flight race (small, arguably legitimate).** Nothing re-validates the
drop at insert time — the `orders` INSERT (:791) carries no predicate on drop
status. A request that passes Step 3 microseconds before `closes_at` commits
its row seconds after it. Bounded by EF execution latency (~1–2s).

(b) **`closes_at IS NULL` + `delivery_end` passed (real gap).** Step 3 skips a
NULL `closes_at` entirely. The lifecycle engine is the only thing that closes
such a drop, and only via `delivery_end`:

```sql
UPDATE drops SET status = 'completed'
WHERE status IN ('live','closed')
  AND delivery_end IS NOT NULL AND delivery_end < now();   -- runs */15 * * * *
```

Between `delivery_end` passing and the next cron tick (up to 15 minutes),
stored status is still `live`, and per operational learning #81 the
`v_drop_summary` in-view status CASE derives `'closed'` only from `closes_at`
and ignores `delivery_end` — so Step 2 sees `live` and Step 3 has nothing to
check. Orders are accepted for a delivery window that has already ended.
Nothing in the repo forces `closes_at` to be set on a live drop (T5-B44's
publish-time `closes_at > now()` guard is still open; T-A4-merged-timing-
validation is open), so this state is reachable.

**Proof:**

(a) t1 = closes_at − 0.2s: request passes Steps 2–3. t2 = closes_at + 1s: order
row inserted on a drop the engine will mark closed at the next tick. One
marginal order; capacity still enforced; impact negligible — recorded for
completeness.

(b) Drop D: `status = 'live'`, `closes_at = NULL`, `delivery_end = 14:00`.
1. 14:00 — delivery window ends. Stored status still `live` (cron last ran 13:52).
2. 14:05 — customer submits an order. Step 2: status `live` → passes (view CASE keys on closes_at, which is NULL). Step 3: `closesAt === null` → no time check. Capacity OK → order inserted, Stripe session created; customer pays for food whose delivery window ended 5 minutes ago.
3. 14:07 — cron flips D to `completed`. The order stands, attached to a completed drop; the vendor discovers it only on the Service Board.

**Suggested:** Two small guards: reject in create-order when
`delivery_end < now()` (one added check in Step 3 — closes the 15-minute
window regardless of cron cadence), and ship T5-B44's publish-time
`closes_at > now()` guard as already planned. Ticket: T-TX-C5-delivery-end-guard.

---

## [MEDIUM] C1/C2 adjunct — capacity ledger read is subject to the PostgREST default row cap

**Where:** supabase/functions/create-order/index.ts:672-676.

**Invariant:** C2 (count correctness), feeds C1.

**Evidence:** Step 8's `select("pizzas")` has no `.limit()` and no pagination.
Hosted Supabase PostgREST enforces a default `db-max-rows` cap (typically
1000): a drop with more than max-rows non-cancelled orders would return a
truncated set, silently undercounting `alreadyConsumed` and re-opening sold-out
capacity. Today this is unreachable in practice — every order writes
`pizzas >= 1` and the check bounds order count ≈ `capacity_units_total`, so it
requires a drop with capacity > max-rows — but it is a latent oversell that
switches on silently the first time a large-capacity drop is configured (and
the F2/pizzas cleanup, if it allows `pizzas = 0` rows, removes the bound that
currently protects it).

**Proof:** Drop with `capacity_units_total = 5000` and 1,200 one-unit
non-cancelled orders → Step 8 receives 1,000 rows → `alreadyConsumed = 1000`
(real: 1200) → orders keep passing until the true count reaches
`capacity + 200`. Sequence: configure such a drop, insert 1,200 orders via SQL,
then run one create-order — it returns 200 where correct behaviour is 400.

**Suggested:** Replace the row-fetch-and-reduce with a server-side aggregate
(`select('pizzas.sum()')` or an RPC `SELECT COALESCE(SUM(pizzas),0)`), which
also shrinks the C1 window. Folds naturally into the
T-TX-C1-atomic-capacity-check fix. Ticket: same.

---

## [HOLDS] C2 — Capacity source of truth is the service-role path; the auth-attach silent-zero trap does not apply

**Where:** supabase/functions/create-order/index.ts:255-258, :262-266, :672-676.

**Invariant:** C2.

**Evidence:** The entire create-order function uses one client, constructed
with the service-role key (:255-258):

```ts
const serviceClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
```

Every capacity-relevant read goes through it: the consumed count is a direct
service-role read of the RLS-locked `orders` table (:672-676) — deliberately
*not* a view read ("doesn't depend on view freshness", comment :662-663) and
not an anon PostgREST count, so the auth-attach silent-zero failure mode
(operational learnings #12/#52/#58) cannot produce a phantom "unlimited
capacity" read here. The denominator `capacity_units_total` comes from
`v_drop_summary` (:262-266) — also via the service role, so RLS/invoker state
of the view is irrelevant to this path. The customer-facing display reads
`capacity_units_remaining` from the definer view `v_drop_public`
(order.html:2478, :2265-2266), which returns real counts to anon by design.

**Proof (confirming sequence):** On a test drop with capacity N and k
non-cancelled orders: (1) `SELECT COALESCE(SUM(pizzas),0) FROM orders WHERE
drop_id='<D>' AND status <> 'cancelled'` returns k′; (2) a create-order request
for (N − k′) units succeeds; (3) an immediate second request for 1 more unit
returns 400 "Not enough capacity remaining" — demonstrating the live check
reads real order data, not a silently-zero count. (Subject to the F2 pizzas
distortion and the row-cap adjunct above — the *path* is correct; two of its
*inputs* have the defects recorded separately.)

**Suggested:** No change to the path. Residuals are tracked as findings F2 and
the row-cap adjunct.

---

## [HOLDS] C3 (check side) — enforcement is genuinely category-driven; non-driving items consume nothing at check time

**Where:** supabase/functions/create-order/index.ts:612-659 (Step 7.5), :352-396 (Step 5 row data).

**Invariant:** C3.

**Evidence:** Capacity contributions are recomputed server-side from row data
fetched in Step 5 (`category_id`, `counts_toward_capacity`, `capacity_weight`
from `products`/`bundles`); the client's declared
`payload.totals.capacity_units` and per-item `capacity_units` are explicitly
ignored (comment :615-617). Under `by_category`, an item contributes
`capacity_weight × qty` only when `counts_toward_capacity` is true AND its
`category_id ∈ drops.capacity_categories` (:643-649); everything else — and
every item under an unknown driver — contributes 0. Under `by_order` the whole
order contributes a flat 1 (:656-659). Event drops skip enforcement entirely by
declared design (:671, T3-13b). This matches operational learning #75 and is
confirmed against source, not inherited from it.

**Proof (confirming sequence):** by_category drop (Pizza driving, weight 1,
capacity 10): a basket of 3 pizzas + 5 colas yields
`serverItemCapacity = [3, 0]`, `totalOrderConsumption = 3` — Step 8 admits it
against remaining ≥ 3 and rejects when remaining = 2; the 5 colas never enter
the sum. A tampered payload declaring `capacity_units: 0` on the pizzas changes
nothing (values ignored).

Two scoped caveats, recorded here rather than as separate findings:
(i) the *write-back* of that correct computation is distorted by the
`Math.max(1, …)` floor — finding F2; (ii) bundle capacity is enforced from the
**bundle row's own** `counts_toward_capacity`/`capacity_weight`, never from the
selected contents — `bundle_lines.drives_capacity` (SCHEMA.md) and the client's
per-selection `drives_capacity` flag are both ignored server-side (BasketSelection
:22-27 is accepted but unused for capacity). That is the documented T3-13 model
(vendor sets the bundle's weight to reflect its contents), but it means a
mis-weighted bundle under-consumes silently; see NEEDS-ED-VERIFY NV4 for the
display-parity half.

**Suggested:** No change to the check. F2 covers the write-back defect.

---

## [HOLDS, with residuals] C4 — slot-holding model is held-at-creation, intentional, with three release paths

**Where:** supabase/functions/create-order/index.ts:16-20, :661-670, :771-776; supabase/functions/cancel-order/index.ts:93-106; supabase/functions/stripe-webhook/index.ts:167-200; supabase/functions/reconcile-pending-orders/index.ts (whole file); order-confirmation.html:758-790.

**Invariant:** C4.

**Evidence:** The model is explicit and single-sourced: capacity is held at
order creation for `HOLD_WINDOW_SECONDS = 1800` (:20), the same constant
driving both `orders.expires_at` (:776) and the Stripe session `expires_at`
(:958) so they cannot drift. Step 8 counts `pending_payment` rows deliberately
(comment :663-667: "prevents two customers racing for the same last slot
during checkout"). The held-at-creation failure mode (abandoned checkout
locking capacity) has three release paths, all idempotent and all guarded by
`status = 'pending_payment'` predicates so they cannot double-release or fight
a paid order:

1. **Customer-explicit:** cancel-order flips pending→cancelled on Stripe-cancel redirect, matched-pair authorised, no-op on any other status (cancel-order/index.ts:93-106).
2. **Webhook:** `checkout.session.expired` / `async_payment_failed` → cancelled, early-return if already moved on (stripe-webhook/index.ts:171-183).
3. **Backstop:** reconcile-pending-orders — on-demand from order-confirmation.html (:758-790) and a secret-gated cron sweep over pendings past their hold window, with conditional `.eq("status","pending_payment")` updates so webhook/reconcile races resolve to exactly one winner (reconcile-pending-orders/index.ts:195-212, :292-308).

The choice is coherent: at Hearth's scale a 30-minute hold on an abandoned
checkout is the honest trade against the held-at-payment alternative (two
payers passing the same check). Worst-case transient loss is bounded at 30
minutes per abandonment — provided the release paths actually run.

**Proof (confirming sequence):** t1 — order created, capacity chip on
order.html decrements (pending counted). t2 — customer clicks Cancel on Stripe
Checkout → redirect fires cancel-order → status `cancelled` → next Step-8 read
excludes it; capacity restored within seconds. t3 — replaying the webhook
`expired` event for the same session returns `{received: true}` without a
second release (status guard). Alternative abandonment (tab closed): released
at t+30m by webhook expiry, or by the next reconcile sweep.

**Residuals:** (i) the session-less orphan hole — finding F3 (HIGH); (ii) the
cron sweep's existence/cadence is not verifiable from the repo — NV3 below. If
NV3 finds no scheduled sweep, the only backstop for a *dropped* expired-webhook
is the customer happening to revisit order-confirmation.html, and a capacity
hold can outlive its window until then.

**Suggested:** No model change. Close F3 and confirm NV3.

---

## NEEDS-ED-VERIFY

**NV1 — Live DDL of `v_drop_summary` capacity fields and `v_drop_capacity_usage`.**
Neither view's definition is in the repo; Step 8's denominator
(`capacity_units_total`) and the display-path consumed count are asserted only
by operational learning #74 ("both compute SUM(orders.pizzas) WHERE status <>
'cancelled'"). Findings F2 (display shows the same phantom units) and F4b (the
in-view status CASE ignores `delivery_end`) lean on that learning. Run:

```sql
SELECT viewname, definition FROM pg_views
WHERE viewname IN ('v_drop_summary','v_drop_capacity_usage','v_drop_capacity_usage_v2','v_drop_public');
```

Confirm: (a) consumed = SUM(pizzas) excluding only cancelled; (b)
`capacity_units_total` projects `drops.capacity_units_total` unchanged; (c) the
status CASE keys on `closes_at` only.

**NV2 — No DB-level trigger or constraint backstops capacity on `orders`.**
F1's severity assumes the EF check is the sole enforcement. Migrations show no
trigger, but most schema predates the committed migrations. Run:

```sql
SELECT tgname, pg_get_triggerdef(t.oid) FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE c.relname = 'orders' AND NOT t.tgisinternal;
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'orders'::regclass;
```

Expected (confirming F1): only the `pizzas >= 1` CHECK and FKs — nothing
capacity-summing.

**NV3 — Is the reconcile-pending-orders cron sweep actually scheduled, and at what cadence?**
The EF header says the schedule was "applied by hand in SQL" — it is not in any
committed migration (only `advance-drop-lifecycle` is), and no GitHub Actions
workflow pings it (.github/workflows/ contains only comms-dispatch.yml). Run:

```sql
SELECT jobid, jobname, schedule, command, active FROM cron.job;
```

Confirm a job invoking reconcile-pending-orders with the
`x-internal-secret: <INTERNAL_RECONCILE_SECRET>` header exists and is active.
If absent, the C4 backstop is on-demand-only and abandoned holds can persist
past their window whenever the expired-webhook is dropped.

**NV4 — `v_drop_menu_item_stock` capacity display parity with enforcement columns.**
The order page's per-item `capacity_units` (order.html:2708, :2731 — drives the
client-side chip and add-to-basket gating) comes from the menu-stock view; the
server enforces from `products/bundles.capacity_weight` +
`counts_toward_capacity` + category membership. SCHEMA.md shows products carry
BOTH a legacy `capacity_units` (numeric, default 1) and the T3-13
`capacity_weight` (integer). If the view projects the legacy column rather than
deriving from the T3-13 trio, display and enforcement can diverge (customer
blocked client-side on capacity the server would admit, or vice-versa — UX-only,
enforcement stays authoritative). Run:

```sql
SELECT definition FROM pg_views WHERE viewname = 'v_drop_menu_item_stock';
```

Confirm its `capacity_units` output derives from
`capacity_weight`/`counts_toward_capacity`/category membership, not the legacy
`products.capacity_units` column.

---

## Spillover — for Pass P2 (noted, not chased)

- **Unknown-session 200-ack + session-less orders (P3/P4):** stripe-webhook acks unknown `stripe_session_id` with 200 (stripe-webhook/index.ts:84-91), stopping Stripe retries. Combined with the F3 shape where the session-id *stamp* fails after the session was created (create-order/index.ts:997-1005): a customer could pay a live session whose order row carries no session id — webhook acks-and-drops, reconcile skips (no session id to retrieve). Money-taken-no-fulfilment candidate; P2 should trace it under P3/P4.
- **No event-ID dedupe table (P1/P2):** webhook idempotency rests entirely on order-status guards (early return when already `placed` / not `pending_payment`), not on `event.id` dedupe. Appears sufficient for the three handled event types but P2 should verify each side effect (email send sits after the status flip — confirm redelivery-after-flip can't re-send).
- **Paid-amount verification (P5):** did not verify whether the `checkout.session.completed` branch compares `amount_total` against `orders.total_pence` before fulfilment — P2 must check.
- **Orphaned Stripe coupons:** create-order creates a one-off coupon *before* the session (:934-948); if session creation then fails, the coupon is never cleaned up. Stripe-side hygiene only, no money impact.
