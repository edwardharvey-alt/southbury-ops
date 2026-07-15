# Capacity lifecycle for an abandoned checkout — read-only audit

**Date:** 2026-07-10 · **Branch synced to:** `origin/main` @ `00d4dac`
**Scope:** trace whether an unpaid/abandoned checkout consumes drop capacity and whether it is ever released.
**No fixes proposed.** Tags: `[REPO-CONFIRMED]` = read from source at file:line; `[NEEDS-ED-VERIFY]` = live DB object whose body is applied by hand and is not in the repo.

---

## TL;DR

An abandoned checkout **does** reserve capacity the instant `create-order` runs — the order row is written `status = 'pending_payment'` **before** the Stripe redirect, and pending rows count toward consumed capacity (capacity is `SUM(orders.pizzas) WHERE status <> 'cancelled'`, not a decrement column).

The slot is **released automatically, but not immediately**. For a true tab-close abandonment the release path is **(b) `stripe-webhook` on `checkout.session.expired`**, which Stripe fires at the session's `expires_at` — **~30 minutes after order creation**. It is **not a permanent leak** under normal operation, but during that ~30-minute window the pending order counts against capacity and **can make the drop look more sold-out to other customers than the paid orders alone would**.

`reconcile-pending-orders` exists as a time-based backstop, but its **cron sweep has no scheduled trigger committed in the repo** (no GitHub workflow, no `pg_cron` migration) — so the reliable release for an abandonment is the Stripe `expired` webhook, with reconcile only exercised on-demand on paths the abandoning customer never hits.

---

## The capacity model (essential context)

Capacity is **not** a stored counter that gets decremented/incremented. Consumed capacity is a live aggregate: `SUM(orders.pizzas)` over the drop's orders **excluding `status = 'cancelled'`**. Therefore:

- "Reserving" a slot = inserting an order row with any status other than `cancelled` (here `pending_payment`).
- "Releasing" a slot = flipping that row's `status` to `cancelled` (it drops out of the sum). There is no explicit "give the units back" write — cancellation *is* the release.

`orders.pizzas` is the carrier (legacy NOT NULL ≥1 column), written from the server-computed `capacityUnitsConsumed = Math.max(1, totalOrderConsumption)` (`create-order/index.ts:685`, inserted at `:765`). Both the enforcement check and the customer-facing display read the same `pizzas`-over-non-cancelled sum → display and enforcement are in parity (CLAUDE.md operational learning #74). The aggregating view body (`v_drop_capacity_usage` → `v_drop_summary` → `v_drop_public`) is applied by hand and not in the repo `[NEEDS-ED-VERIFY]`, but every repo signal (the create-order comments, the enforcement query it replaced, learning #74) says it excludes only `cancelled`, i.e. **counts `pending_payment`**.

---

## 1. create-order — when is capacity reserved, and at what status?

**Reserved at order creation, before any payment, at `status = 'pending_payment'`.** `[REPO-CONFIRMED]`

- Order row is assembled with `status: "pending_payment"`, `stripe_payment_status: "pending"`, `pizzas: capacityUnitsConsumed`, and a hold deadline `expires_at = now + 1800s` — `create-order/index.ts:748-753, 765`.
- Server-authoritative capacity is computed per `capacity_driver` (`by_order` = 1; `by_category` = Σ `capacity_weight × qty` for items whose `category_id ∈ capacity_categories`); the client's declared capacity is ignored — `:612-659`.
- The row is inserted **and** capacity is checked/reserved **atomically inside the `create_order_atomic` RPC**, under a drop-row lock — `:768-791`:

```ts
const { data: rpcResult } = await serviceClient.rpc("create_order_atomic", {
  p_order: orderInsert,              // status: 'pending_payment', pizzas: capacityUnitsConsumed
  p_incoming_consumption: totalOrderConsumption,
});
if (!rpcResult?.ok) {
  if (rpcResult?.error === "capacity") { /* 400 "Not enough capacity remaining" */ }
  ...
}
const orderId = rpcResult.order_id as string;
```

- The RPC returns `{ ok, order_id, error }`; `error === "capacity"` → 400. The **RPC body is not in the repo** (`grep create_order_atomic` finds only the caller; commit `983db71` "route order creation through atomic capacity RPC (closes last-slot race + phantom consumption)" changed only `create-order/index.ts`) `[NEEDS-ED-VERIFY]`. From the call site + commit message it does `SELECT … FOR UPDATE` on the drop, sums existing non-cancelled consumption, checks `existing + p_incoming_consumption ≤ capacity_units_total`, and inserts the `pending_payment` row in one transaction.

**Timing relative to Stripe:** the `pending_payment` row (and its capacity hold) is committed at `:768`. The Stripe Checkout Session is created **afterwards** at `:943-978`, and the row is stamped with `stripe_session_id` at `:988-991`. So the slot is committed **before the customer is ever redirected to Stripe** — i.e. before any chance to pay. `capacity_units_snapshot` per line is written into `order_items` at `:834`; `orders.pizzas` (the value that actually feeds the sum) is written inside the RPC insert at `:765`.

**Conclusion:** capacity is consumed BEFORE the Stripe redirect and BEFORE payment. Row status pre-payment is `pending_payment`. The RPC decrements-by-reservation at insert time under a row lock.

---

## 2. stripe-webhook — what each event does to status and capacity

Handles exactly three event types (`stripe-webhook/index.ts:52-56`); everything else is 200-acked and ignored. `[REPO-CONFIRMED]`

- **`checkout.session.completed`** (`:94-166`): `pending_payment → placed` + `stripe_payment_status: 'paid'`, audit event, fire-and-forget confirmation email. Capacity is **not touched and stays reserved** — correct: `placed` is still non-cancelled, so the slot the customer just paid for remains consumed. Idempotent (early-returns if already `placed`).
- **`checkout.session.expired`** (`:167-199`): guarded on `order.status === 'pending_payment'`, then `→ cancelled` + `stripe_payment_status: 'expired'`, audit event. **This is the release** — flipping to `cancelled` drops the row out of the capacity sum. `[REPO-CONFIRMED]`
- **`checkout.session.async_payment_failed`** (same branch, `:167-199`): identical path, `→ cancelled` + `stripe_payment_status: 'failed'`. Also releases. `[REPO-CONFIRMED]`

There is **no time-based sweep inside the webhook** — it is purely event-driven. The hold is released only when Stripe *delivers* `expired`/`failed` **and** the order is still `pending_payment`.

**Webhook subscription** to these event types is a Stripe Dashboard config (endpoint "brilliant-rhythm" per CLAUDE.md), not in the repo `[NEEDS-ED-VERIFY]` — if `checkout.session.expired` were not subscribed, the automatic release would never fire and reconcile (below) would be the only path.

---

## 3. reconcile-pending-orders — does it release capacity, and on what timeout?

**Yes, it releases capacity for stale unpaid pendings — but the automatic cron trigger is not committed in the repo.** `[REPO-CONFIRMED for logic; scheduling NEEDS-ED-VERIFY]`

Logic (`reconcile-pending-orders/index.ts`):
- Per-order it retrieves the Stripe session (`:177`). If `payment_status === 'paid'` → promote to `placed` (race-safe via `.eq("status","pending_payment")`) + email (`:192-286`). If **unpaid AND past hold window** → `→ cancelled` + `stripe_payment_status: 'expired'` (`:291-332`) — **this is the capacity release**, same status flip as the webhook.
- "Past hold window" = `expires_at < now`, or if null, `created_at + 30min < now` (`isPastHoldWindow`, `:75-86`). So the release timeout is the **same 30-minute hold** as the Stripe session.
- Cron sweep query selects `status = 'pending_payment'` AND `(expires_at < now OR (expires_at IS NULL AND created_at < now-30min))`, bounded to 100 (`:376-382`).

**Two run modes:**
- **Cron mode** (`{}`/no body): shared-secret gated (`X-Internal-Secret: INTERNAL_RECONCILE_SECRET`, `:135-145`). **But no caller is committed:** `comms-dispatch.yml` pings only `dispatch-interest-open` and `dispatch-post-drop-thankyou`, **not** reconcile; no `pg_cron.schedule('...reconcile...')` in `supabase/migrations/` (only `advance-drop-lifecycle` at `20260612061555`). The function header explicitly states the cron schedule is "applied by hand in SQL." So whether the sweep actually runs on a schedule is **unverifiable from the repo** `[NEEDS-ED-VERIFY]`.
- **On-demand mode** (`{ order_id }`): no secret, reconciles one order against Stripe truth. Invoked from `order-confirmation.html:766` (and again at ~60s, `:790`). **Crucially this only runs on the confirmation/return page** — a customer who closes the tab never loads `order-confirmation.html`, so on-demand reconcile **never fires for an abandonment**.

So for an abandoned order, reconcile helps **only if the cron sweep is actually scheduled in the live DB** — and that is exactly the piece the repo cannot confirm.

---

## 4. Synthesised lifecycle — ABANDONED checkout (customer closes the tab)

1. Customer adds item → `create-order` runs → `pending_payment` order committed, **slot reserved** (RPC, before redirect). `expires_at = created_at + 30min`.
2. Stripe Checkout Session created (`expires_at` = same +30min); customer redirected to Stripe.
3. **Customer closes the tab without paying.**
   - `cancel-order` is **NOT** called — it only fires when Stripe redirects back to `order.html?checkout_cancelled=1` (the explicit "cancel" button), not on a tab-close. `[REPO-CONFIRMED: cancel-order header + order.html cancel-return wiring]`
   - On-demand `reconcile-pending-orders` is **NOT** called — that only runs from `order-confirmation.html`, which the customer never reaches.
   - The slot stays reserved.
4. **Release:** at `expires_at` (~30 min after step 1), Stripe emits **`checkout.session.expired`** → `stripe-webhook` flips the order `pending_payment → cancelled` → the row leaves the capacity sum → **slot freed.**

**Verdict: (b) — released on `checkout.session.expired`, ~30 minutes after order creation.** Not a permanent leak under normal operation.

Caveats that could turn (b) into a longer/indefinite hold:
- If the Stripe endpoint is **not subscribed** to `checkout.session.expired` `[NEEDS-ED-VERIFY]`, or the webhook delivery is dropped, the only remaining release is the reconcile **cron** — whose schedule is **not committed in the repo** `[NEEDS-ED-VERIFY]`. If that cron isn't running in the live project, an abandoned slot would remain held indefinitely (a real leak). Both are live-config facts outside the repo; confirm before relying on the 30-minute guarantee.
- Best case the hold is ~30 min; there is **no** sub-30-minute release for a tab-close abandonment because Stripe's `expires_at` minimum is 1800s and the reconcile window mirrors it.

---

## 5. Does the customer-facing order page count pending or paid? → **pending + paid** `[REPO-CONFIRMED path; view body NEEDS-ED-VERIFY]`

`order.html` reads `capacity_units_remaining` / `capacity_units_total` from `v_drop_public` (findings-holds-capacity.md §C/F: `order.html:2229, 2441-2447, 4308-4315`). That view chains to `v_drop_capacity_usage`, which sums `orders.pizzas` over **`status <> 'cancelled'`** — i.e. **`pending_payment` orders are included** in the displayed "places remaining / fully booked" number (create-order's own comments + operational learning #74 assert display/enforcement parity; the live view body is `[NEEDS-ED-VERIFY]`).

**Implication:** during the ~30-minute hold, an abandoned pending order **makes the drop look more sold-out to other customers** than the actually-paid orders would — and on the last slot it will show **"fully booked"** to everyone until the `expired` webhook (or a running reconcile cron) frees it ~30 min later. The display is honest about *reservations* (a held slot genuinely can't be sold twice — the atomic RPC guarantees that), but a customer who abandons transiently blocks the slot for up to half an hour.

To confirm the view semantics against the live DB:
```sql
select viewname, definition from pg_views
where schemaname='public'
  and viewname in ('v_drop_public','v_drop_summary','v_drop_capacity_usage')
order by viewname;
-- confirm the remaining/used expression excludes only 'cancelled' (i.e. includes 'pending_payment')
```

---

## Open items for Ed to verify (live-config only; not in repo)

1. `create_order_atomic` RPC body — confirm it locks the drop row, sums non-cancelled consumption, and reserves atomically. (Caller behaviour is confirmed; body is hand-applied.)
2. `v_drop_capacity_usage` / `v_drop_public` view bodies — confirm consumed = `SUM(pizzas) WHERE status <> 'cancelled'` (includes `pending_payment`).
3. Stripe endpoint subscription — confirm `checkout.session.expired` (and `async_payment_failed`) are subscribed on the live "brilliant-rhythm" endpoint. This is the primary abandonment-release path.
4. `reconcile-pending-orders` **cron schedule** — confirm whether a `pg_cron` job (or other scheduler) actually invokes the sweep in the live project with `INTERNAL_RECONCILE_SECRET`. **No committed trigger exists** (`comms-dispatch.yml` does not call it; no migration schedules it). If it is not scheduled, the webhook `expired` event is the *sole* automatic release for abandonments.

*End — findings only, no fixes.*
