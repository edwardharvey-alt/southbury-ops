# Customer Order Flow — Source Audit (read-only)

**Date:** 2026-06-22 · **Scope:** customer order path end-to-end, re-derived from
current repo source only. **Constraint:** no DB access — every finding is tagged
`[REPO-CONFIRMED]` (file:line I read) or `[NEEDS-ED-VERIFY]` (live DB state; SQL
provided). Repo SQL/migrations/SCHEMA.md/comments are LEADS, not proof, because Ed
applies schema by hand via the SQL editor.

Uncommitted — for review before any code.

---

## 1. The order path end-to-end (as actually found)

**Files:** customer page = `order.html`; landing = `order-confirmation.html`;
vendor incoming-orders = `service-board.html`. Edge Functions in the path:
`create-order`, `stripe-webhook`, `fetch-order`, `cancel-order` (all present under
`supabase/functions/`, all `verify_jwt = false` — `supabase/config.toml:121-132`).
[REPO-CONFIRMED]

| Step | Where | Evidence |
|---|---|---|
| Basket held in client state | `order.html` `state.basket` (array of `{type, product_id/bundle_id, name, unit_price_pence, quantity, capacity_units, selections[]}`) | `order.html:3835-3851` |
| Client-side capacity/window mirror | `validateCheckout()` blocks closed/pre-open/over-capacity before pay | `order.html:3855-3862` (`getCapacityRemainingAfterBasket()<0`, `isDropClosed()`, `isDropPreOpen()`) |
| Checkout triggered | `handoffToPayment()` → `supabase.functions.invoke('create-order', { body: payload })` | `order.html:3925-3945` |
| Payload built | `buildCheckoutPayload()` — sends totals + per-item capacity (server ignores capacity, see §2b) | `order.html:3783-3852` |
| Redirect to Stripe | `window.location.href = data.checkout_url` | `order.html:3964` |
| Return-from-cancel | `?checkout_cancelled=1` → `invoke('cancel-order', {order_id, session_id})` | `order.html:4222-4246` |
| Order written + Stripe session created | `create-order` (see §2) | `supabase/functions/create-order/index.ts` |
| Payment outcome applied | `stripe-webhook` transitions the order | `supabase/functions/stripe-webhook/index.ts` |
| Landing reads order | `order-confirmation.html` → `invoke('fetch-order', {order_id, session_id})`; renders placed/cancelled/pending + polls while pending | `order-confirmation.html:403-470` |
| Service Board reads orders | `service-board.html loadSelectedDropData()` → `invoke('get-drop', {drop_id})` → `orders_summary` / `drop_orders` / `order_items` | `service-board.html:2863-2900` |
| Operator status transitions | `invoke('transition-order-status', …)` | `service-board.html:2950` |

**Dead reference (not a bug, but noise):** `order.html:1946` defines
`STRIPE_CHECKOUT_FUNCTION = CONFIG.STRIPE_CHECKOUT_FUNCTION || "create-stripe-checkout"`
but it is **never used** — the only checkout invoke is `create-order`
(`order.html:3942`). `create-stripe-checkout` does not exist as a function. [REPO-CONFIRMED]

---

## 2. Server-side trace (from source)

### create-order (`supabase/functions/create-order/index.ts`, 766 lines)
- **Auth:** anonymous; `verify_jwt=false`. Trusts payload shape + does server-side
  ownership/validity checks. Service-role client for all writes. `create-order:11-12, 218-221`. [REPO-CONFIRMED]
- **Validation sequence:** schema (`213-216`) → drop exists & status orderable via
  `v_drop_summary` (`223-236`, `ORDERABLE_STATUSES = {live, scheduled}` at `:14`) →
  ordering window `opens_at`/`closes_at` (`238-247`) → delivery-area enforcement
  (`249-276`; `radius` → 501, `postcode_prefix` matched server-side) → vendor
  Stripe-ready (`280-291`) → every product/bundle belongs to this vendor (`293-354`)
  → bundle selections valid for the right bundle (`356-386`) → totals match
  server-recomputed subtotal − discount (`388-407`). [REPO-CONFIRMED]
- **Writes (sequence, no DB transaction — manual cleanup via `markCancelled`):**
  - `customers` upsert on `onConflict:"email"` + `customer_relationships` upsert on
    `onConflict:"customer_id,owner_id"` (only if email present) `509-548`
  - `orders` insert, `status:"pending_payment"`, `stripe_payment_status:"pending"`,
    `total_pence`, `platform_fee_pence`, `discount_pence`, `discount_breakdown`,
    `pizzas:capacityUnitsConsumed` (legacy capacity carrier) `550-588`
  - `order_items` per basket line (`item_type, product_id|bundle_id, qty,
    price_pence, capacity_units_snapshot=serverItemCapacity[i]`) `613-637`
  - `order_item_selections` for bundle lines `639-657`
  - `order_status_events` initial `null→pending_payment` `659-673`
  - Stripe Checkout session created **after** the DB writes `706-741`; then
    `orders.stripe_session_id` stamped `751-759`
  - Returns `{ order_id, checkout_url }` `761`. [REPO-CONFIRMED]
- **Stripe:** destination charge — `application_fee_amount = platformFeePence`,
  `transfer_data.destination = vendor.stripe_account_id`, `expires_at = now+1800s`,
  one-off coupon when a discount tier matches `685-741`. metadata carries
  `order_id/drop_id/vendor_id`. [REPO-CONFIRMED]
- **Error handling / idempotency:** any post-orders-insert failure →
  `markCancelled(note)` flips the row to `cancelled`/`failed` + audit event
  `591-611`. **No idempotency key** — every successful call creates a NEW order +
  NEW Stripe session. [REPO-CONFIRMED]

### stripe-webhook (`…/stripe-webhook/index.ts`, 210 lines)
- **Auth:** Stripe signature via `constructEventAsync` (`32-49`); no CORS, no JWT. [REPO-CONFIRMED]
- **Writes:** looks up order by `stripe_session_id` (`74-78`); on
  `checkout.session.completed` → `status:"placed", stripe_payment_status:"paid"` +
  audit event, then fire-and-forget `send-order-confirmation` (failures never
  propagate) `94-166`; on `expired`/`async_payment_failed` (only if still
  `pending_payment`) → `cancelled` + `expired|failed` `167-200`. [REPO-CONFIRMED]
- **Idempotency:** completed skips if already `placed` (`95-100`); expired/failed
  skip unless `pending_payment` (`173-178`); unknown session → 200 ack (`84-91`).
  Late / duplicate deliveries are safe. [REPO-CONFIRMED]

### fetch-order (`…/fetch-order/index.ts`, 231 lines)
- **Auth:** matched pair `order_id` + `stripe_session_id` (`73-80`); service-role
  read; minimal customer-safe surface (no email/phone/customer_id/fee) `184-225`. [REPO-CONFIRMED]
- **Does NOT reconcile with Stripe** — returns whatever `status` /
  `stripe_payment_status` the row holds (`188-189`). The landing's view of payment
  is only as current as the webhook. [REPO-CONFIRMED]

### cancel-order (`…/cancel-order/index.ts`, 133 lines)
- Matched-pair auth (`74-81`); **idempotent**, only flips `pending_payment →
  cancelled` (`91-101`), audit event `108-118`; benign 200 on not-found/wrong-status.
  Does not call Stripe. [REPO-CONFIRMED]

---

## 3. The five suspected issues

### (a) Persistence + webhook robustness — VERDICT: order persists reliably at creation; one real robustness gap (no Stripe-side reconciliation). Tier: correctness/robustness.
- The order row is written by **create-order** at `status:"pending_payment"`
  **before** the Stripe redirect (`create-order:564, 580-588`), not by the webhook.
  So an order always lands at checkout time. The webhook only *transitions* it. [REPO-CONFIRMED]
- Late webhook → fine. Twice → idempotent (`stripe-webhook:95-100, 173-178`).
  **Never delivered while payment succeeded** → order stays `pending_payment`
  forever: capacity stays reserved (§2b counts `pending_payment`), the vendor never
  sees it as `placed`, and **nothing in the repo reconciles against Stripe** —
  `fetch-order` reports DB status as-is (`fetch-order:188-189`) and the
  confirmation page only re-polls the DB (`order-confirmation.html:470`
  `setupPendingWatch`). Stripe's own `checkout.session.expired` (at +1800s) only
  rescues the *unpaid* case and only if the endpoint is reachable. [REPO-CONFIRMED problem]
- Status set in the create/webhook half: `pending_payment → placed`
  (completed) | `cancelled` (expired/failed via webhook, or cancel-order, or
  create-order cleanup). Operator-side `placed→confirmed→preparing→ready→delivered`
  is owned by `transition-order-status` (invoked at `service-board.html:2950`; not
  re-read in this pass). [REPO-CONFIRMED for create/webhook]

### (b) Overselling race — VERDICT: enforced server-side and category-aware, but NOT atomic — last-slot race remains. Tier: correctness.
- Capacity **is** enforced server-side: `create-order` Step 8 sums `orders.pizzas`
  over non-cancelled rows for the drop and rejects if
  `alreadyConsumed + totalOrderConsumption > capacity_units_total`
  (`create-order:468-489`). `pending_payment` rows are counted (reserved during the
  30-min window). Client-supplied capacity is explicitly ignored (`409-414`). [REPO-CONFIRMED]
- Category-level driver honoured: `by_category` contributes
  `capacity_weight × quantity` only for items whose `category_id ∈
  drops.capacity_categories`; `by_order` = 1 per order (`415-456`). Matches the
  "not a flat per-order count" model. [REPO-CONFIRMED]
- **The race is not closed.** Step 8 is a `SELECT`-then-`INSERT` over PostgREST with
  no transaction, no row lock, no unique/exclusion constraint (`468-489` read, then
  `580-588` insert). Two concurrent calls can both read the pre-insert
  `alreadyConsumed`, both pass, both insert → oversell by up to (N−1) near the cap.
  No atomic guard exists in source. [REPO-CONFIRMED problem]

### (c) RLS on orders / order_items / order_item_selections — VERDICT: cannot determine from repo. Tier: defence-in-depth (functional flow doesn't depend on it).
- The repo `supabase/migrations/` (6 files) does **not** define these tables or any
  RLS on them; only `comms_log` has `ENABLE ROW LEVEL SECURITY`
  (`migrations/20260618120000_create_comms_log.sql:44`). So the repo neither
  confirms nor denies the "RLS disabled" claim. [NEEDS-ED-VERIFY]
- Every order-path read/write is via the **service-role** client
  (`create-order:218`, `stripe-webhook:67`, `fetch-order:66`, `cancel-order:69`,
  `get-drop` service-role reads), which **bypasses RLS regardless of its state**.
  So the flow's correctness does not depend on RLS being on; RLS only matters for any
  *direct* anon/authenticated PostgREST access to these tables. Verify live (queries
  in §4). [REPO-CONFIRMED that the path is service-role; RLS state itself NEEDS-ED-VERIFY]

### (d) Stripe mode (test vs live, T3-8) — VERDICT: repo implies TEST mode. Tier: launch-blocker checklist.
- Client publishable key is **test**: `assets/config.js:7`
  `STRIPE_PUBLISHABLE_KEY:"pk_test_51TPHfy…"`. [REPO-CONFIRMED]
- Server keys (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) are Supabase secrets,
  not in repo — test vs live unconfirmable from source (`create-order:493`,
  `stripe-webhook:20-21`). T3-8 (live-mode conversion) is open per CLAUDE.md. [NEEDS-ED-VERIFY]
- Going live = swap publishable key (`config.js`) + `STRIPE_SECRET_KEY` +
  `STRIPE_WEBHOOK_SECRET`, re-point the webhook endpoint to the live key's events,
  and ensure each vendor's Connect account is a **live** `stripe_account_id`. Flag
  for Ed. [REPO-CONFIRMED items / live values NEEDS-ED-VERIFY]

### (e) Post-payment landing + Service Board — VERDICT: landing confirms the right order; Service Board scope derivation correct. Tier: works as designed (pending live column verification).
- `success_url = https://lovehearth.co.uk/order-confirmation.html?order_id=<id>&session_id={CHECKOUT_SESSION_ID}`
  (`create-order:677-679`, hardcoded prod). The landing reads that exact matched pair
  via `fetch-order` (`order-confirmation.html:428-429`), so it can only resolve the
  customer's own order; renders placed/cancelled/pending and polls while pending. [REPO-CONFIRMED]
- Service Board: `get-drop` verifies the caller **owns** the drop's vendor
  (`anonClient.auth.getUser` → `vendors.auth_user_id = user.id` → `drops.id=drop_id
  AND vendor_id=vendor.id`, `get-drop:26, 50-66`), then reads orders **scoped by
  drop_id** (`165-169`) and the vendor's other drops by
  `drops where vendor_id=vendor.id` → `orders.in('drop_id', otherDropIds)`
  (`181-209`). This is the exact "**orders has NO vendor_id; scope = drop_id IN
  vendor's drops**" derivation, confirmed in source. [REPO-CONFIRMED]
- Both depend on the EF's column references existing live (see §4). [NEEDS-ED-VERIFY]

---

## 4. NEEDS-ED-VERIFY — consolidated SQL (copy-paste)

> Run in the Supabase SQL editor against the live DB. (Note: SQL-editor runs bypass
> RLS — query (4a) reads the catalog directly, which is the reliable way to see RLS
> state without an app session.)

**(4a) RLS enabled state** — confirms whether RLS is on/forced for the order tables
(the "disabled as a hack" claim):
```sql
select relname, relrowsecurity, relforcerowsecurity
from pg_class
where relname in ('orders','order_items','order_item_selections','drops','products','bundle_lines')
order by relname;
```

**(4b) Policies on customer-facing tables** — confirms which roles/policies exist
(esp. any `anon` policy or none at all):
```sql
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where tablename in ('orders','order_items','order_item_selections')
order by tablename, policyname;
```

**(4c) Real columns on order tables + drops** — confirms every column the EFs
reference actually exists (see (4f)/(4g) for the specific names to eyeball):
```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_name in ('orders','order_items','order_item_selections','drops')
order by table_name, ordinal_position;
```

**(4d) View definitions** — confirms `v_drop_summary`, `v_drop_orders_summary`,
`v_order_item_detail_expanded` (+ `_v2`/`_detail` fallbacks), `v_item_sales`,
`v_drop_capacity_usage` exist and what they project:
```sql
select viewname, definition
from pg_views
where schemaname='public'
order by viewname;
```

**(4e) Test drop true state** (do not trust its nudged state):
```sql
select * from drops where id='e2a2fbd3-1637-46cd-92e8-3c0e2a7636d0';
```
> Audit-specific: confirm its `status`, `opens_at`, `closes_at`, `capacity_driver`,
> `capacity_categories`, `capacity_units_total`, `drop_type`, `delivery_area_type`.
> create-order only accepts `status ∈ {live, scheduled}` (`create-order:14`) **and**
> independently time-gates on `opens_at/closes_at` — so a drop that looks live but is
> past `closes_at`, or whose `v_drop_summary.status` re-derives to `closed`, is not
> orderable.

**(4f) `orders` columns the EFs write/read must exist** (create-order / webhook /
fetch-order / cancel-order reference these):
```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name='orders'
  and column_name in ('status','stripe_payment_status','stripe_session_id',
    'pizzas','total_pence','platform_fee_pence','discount_pence','discount_breakdown',
    'contact_opt_in','contact_opt_in_scope','customer_id','customer_name',
    'customer_phone','customer_email','customer_postcode','customer_notes',
    'fulfilment_mode','delivery_address','drop_id','created_at')
order by column_name;
```
> `orders.pizzas` is the capacity carrier used for both the write (`create-order:577`)
> and the overselling check (`create-order:471`). Confirm it exists, is the value
> create-order writes, and nothing else mutates it.

**(4g) `drops` columns create-order reads for area/capacity/discount** must exist:
```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name='drops'
  and column_name in ('delivery_area_type','allowed_postcode_prefixes',
    'capacity_driver','capacity_categories','discount_tiers','drop_type','expected_guests')
order by column_name;
```

**(4h) Unique constraints the upserts depend on** — `create-order` upserts
`customers` on `(email)` and `customer_relationships` on `(customer_id, owner_id)`
(`create-order:522, 542`); these `onConflict` targets need matching unique
constraints or the upsert errors / silently mis-resolves:
```sql
select conrelid::regclass as table, conname, pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid in ('customers'::regclass,'customer_relationships'::regclass)
  and contype in ('u','p')
order by 1, 2;
```

**(4i) v_drop_summary projection** create-order/get-drop depend on
(`status, opens_at, closes_at, capacity_units_total, vendor_id, slug, drop_id`):
```sql
select definition from pg_views where schemaname='public' and viewname='v_drop_summary';
```

---

## 5. Open questions / contradictions with known architecture

1. **Orderable status set vs lifecycle.** `ORDERABLE_STATUSES = {live, scheduled}`
   (`create-order:14`), but the lifecycle/visibility set is `{live, closed,
   completed}` (CLAUDE.md #69/#70) and nothing writes `'scheduled'` yet (CLAUDE.md
   #69). Net: effectively only `'live'` is orderable. Plus `v_drop_summary` re-derives
   `'closed'` from `closes_at` in-view (CLAUDE.md #81), so a time-closed drop is
   rejected by status *and* by the explicit window check (`create-order:239-247`).
   Belt-and-braces, no bug — but verify the test drop's real state (4e) before testing
   "ordering is open." [REPO-CONFIRMED logic / live state NEEDS-ED-VERIFY]
2. **No create-order idempotency.** Re-submitting Pay (return-then-retry) creates
   multiple `pending_payment` orders, each reserving capacity until expiry/cancel.
   `cancel-order` on the `?checkout_cancelled=1` return mitigates the abandoned one
   (`order.html:4222-4246`), but a customer who hard-reloads mid-checkout can hold
   several reservations briefly. Design point, not a defect. [REPO-CONFIRMED]
3. **Webhook-down reconciliation gap (restates 3a).** There is no server-side
   "ask Stripe for the session status" fallback anywhere in the repo. The only
   advancement of `pending_payment → placed` is the webhook. If you want the landing
   page or a cron to self-heal a paid-but-stuck order, it does not exist today. [REPO-CONFIRMED absence]
4. **`order-confirmation.html` uses inline `window.supabase.createClient`**
   (`order-confirmation.html:416`). Harmless here (it only *invokes* `fetch-order`,
   which runs service-role; no RLS-dependent direct read), but it is the pattern
   CLAUDE.md #12 warns against — worth noting so it isn't copied into a path that
   does a direct authenticated read/write. [REPO-CONFIRMED]
5. **`drop_capacity` / `v_drop_capacity_usage` not in the write path.** create-order
   computes consumption directly from `orders.pizzas` (`create-order:468-489`) rather
   than reading a view, which is the right call for authority — flagged only so the
   display-vs-enforcement parity (CLAUDE.md #74) is verified to still hold after any
   rebuild. [REPO-CONFIRMED]

*End of audit — no rebuild, fixes, or code proposed, per instructions.*
