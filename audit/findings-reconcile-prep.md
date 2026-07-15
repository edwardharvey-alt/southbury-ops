# Reconcile-path prep — findings

Read-only audit of what a `pending_payment → placed` reconcile path (cron EF +
on-demand) must replicate from `stripe-webhook`'s `checkout.session.completed`
branch. No edits made.

All line refs against current `origin/main` working tree.

---

## 1. `checkout.session.completed` handler — full quote + every side effect

`supabase/functions/stripe-webhook/index.ts:94-166` (the `completed` branch inside
the shared `try` at `:93`). Verbatim:

```ts
    if (event.type === "checkout.session.completed") {
      if (order.status === "placed") {
        return new Response(JSON.stringify({ received: true, idempotent: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      const { error: updateErr } = await serviceClient
        .from("orders")
        .update({ status: "placed", stripe_payment_status: "paid" })
        .eq("id", order.id);
      if (updateErr) {
        console.error("order placed update failed", updateErr);
        return new Response("Order update failed", { status: 500 });
      }
      const { error: eventErr } = await serviceClient.from("order_status_events").insert({
        order_id: order.id,
        drop_id: order.drop_id,
        from_status: "pending_payment",
        to_status: "placed",
        event_type: "status_change",
        actor: "stripe-webhook",
        actor_type: "system",
      });
      if (eventErr) {
        console.error("order_status_events insert (placed) failed", eventErr);
      }

      // Fire-and-forget order_confirmed email. Failures NEVER propagate ...
      try {
        const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        if (!internalSecret || !supabaseUrl) {
          console.error( ... "Missing INTERNAL_FUNCTION_SECRET or SUPABASE_URL" ... );
        } else {
          const emailResp = await fetch(`${supabaseUrl}/functions/v1/send-order-confirmation`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Internal-Secret": internalSecret,
            },
            body: JSON.stringify({ order_id: order.id }),
          });
          if (!emailResp.ok) { ... console.error(... order_confirmation_failed ...); }
        }
      } catch (emailErr) {
        console.error(... order_confirmation_failed ...);
      }
    }
```

### Side effects (the full set a reconcile path MUST reproduce)

| # | Effect | Location | Detail |
|---|--------|----------|--------|
| A | **`orders` UPDATE** | `:101-104` | Sets `status = "placed"` AND `stripe_payment_status = "paid"`. Both columns. Filter `.eq("id", order.id)`. Hard-fails (500) if it errors. |
| B | **`order_status_events` INSERT** | `:109-117` | Audit row: `{ order_id, drop_id, from_status:"pending_payment", to_status:"placed", event_type:"status_change", actor:"stripe-webhook", actor_type:"system" }`. **Non-fatal** — error is logged (`:118-120`) but does NOT abort. A reconcile path should use its own `actor` value (e.g. `"reconcile"` / `"reconcile-cron"`), not `"stripe-webhook"`. |
| C | **`send-order-confirmation` call** | `:138-145` | `POST ${SUPABASE_URL}/functions/v1/send-order-confirmation`, header `X-Internal-Secret: <INTERNAL_FUNCTION_SECRET>`, body `{ order_id: order.id }`. Fire-and-forget — wrapped in try/catch, every failure (incl. missing env) is logged only, never propagated. This is the ONLY downstream EF/function called. |
| D | **Idempotency guard** | `:95-100` | If `order.status === "placed"` already, returns `200 {received:true, idempotent:true}` BEFORE doing A/B/C. This is the sole idempotency mechanism — a status check, not a DB unique constraint. |

Order columns the order row is selected with (the only fields available in-handler):
`id, drop_id, status` — `stripe-webhook/index.ts:74-78`, looked up by
`.eq("stripe_session_id", sessionId)`.

No other tables touched. No capacity write (capacity is reserved at create-order
time and counted by `SUM(orders.pizzas)` over non-cancelled rows — placing doesn't
change capacity; see CLAUDE.md learning #74). No Stripe write-back.

---

## 2. Shared helper vs inlined — what reconcile must replicate

**Fully inlined.** There is no shared helper. The completed-logic lives entirely
inside the `Deno.serve` handler (`stripe-webhook/index.ts:94-166`). Nothing is
exported or importable from `_shared/`.

A reconcile path therefore has to replicate, in its own code, the four side
effects above (A–D), specifically:

1. **Idempotency check first** — re-read `orders.status`; if already `"placed"`
   (or `"cancelled"`), no-op. (`:95-100` analogue.)
2. **`orders` UPDATE** → `status:"placed", stripe_payment_status:"paid"`,
   `.eq("id", …)`, with a service-role client. (`:101-104`.)
3. **`order_status_events` INSERT** → same shape as B above, non-fatal on error,
   with a reconcile-specific `actor`. (`:109-117`.)
4. **`send-order-confirmation` POST** → `X-Internal-Secret` header + `{order_id}`
   body, fire-and-forget try/catch so an email failure can't fail the reconcile.
   (`:126-166`.) Requires `INTERNAL_FUNCTION_SECRET` + `SUPABASE_URL` env.

Shared infra it can reuse directly: service-role client construction
(`createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`, `:67-70`).

> NOTE — the reconcile path must NOT skip C. "Just flip status" would leave the
> customer without the confirmation email that the happy webhook path always
> sends. Replicating A+B without C is the trap this audit exists to flag.

---

## 3. Payment-truth verification — does the webhook trust the event or re-fetch?

**The webhook TRUSTS the event payload. It does NOT re-fetch the session or the
payment_intent from Stripe.**

- The only verification is the **signature** check on the raw body, which proves
  the event genuinely came from Stripe — `stripe-webhook/index.ts:37-49`:

```ts
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider()
    );
  } catch (err) {
    console.error("stripe webhook signature verification failed", err);
    return new Response("Invalid signature", { status: 400 });
  }
```

- The session object is then taken straight from the event with no Stripe round-trip
  — `:64` `const session = event.data.object as Stripe.Checkout.Session;` — and the
  branch keys purely off `event.type === "checkout.session.completed"` (`:94`).
  `session.payment_status` is never read; no `stripe.checkout.sessions.retrieve(...)`
  and no `paymentIntents.retrieve(...)` anywhere in the file.

**Implication for reconcile:** a reconcile path has NO signed event to trust, so it
MUST establish payment truth itself by re-fetching from Stripe. It should call
`stripe.checkout.sessions.retrieve(order.stripe_session_id)` and require
`session.payment_status === "paid"` (and/or `status === "complete"`) before running
side effects A–C. This is the one place reconcile is *more* work than the webhook,
not less. `order.stripe_session_id` is the lookup key (stamped at
`create-order/index.ts:751-754`).

---

## 4. Stripe secret key + API version available to the functions

- **Secret key env:** `STRIPE_SECRET_KEY` — read at `stripe-webhook/index.ts:20`
  and `create-order/index.ts:493`. Documented as a required Edge Function secret in
  CLAUDE.md ("Edge Function secrets"). Test/sandbox at launch. Available to any new
  reconcile EF the same way.
- **Webhook signing secret:** `STRIPE_WEBHOOK_SECRET` — `stripe-webhook/index.ts:21`
  (webhook-only; a reconcile EF does not need it).
- **Stripe library:** `https://esm.sh/stripe@14.21.0?target=deno` —
  `stripe-webhook/index.ts:2` and the same pin in `create-order` (import).
- **API version pinned in code:** `apiVersion: "2023-10-16"` — identical in
  `stripe-webhook/index.ts:28` and `create-order/index.ts:496`. This is the explicit
  per-call pin both Stripe clients use; it is NOT the dashboard default
  (`2026-03-25.dahlia` or similar). A reconcile EF should pin the **same**
  `apiVersion: "2023-10-16"` for behavioural parity with the existing flow.
- Stripe client construction reference — `create-order/index.ts:495-497` /
  `stripe-webhook/index.ts:27-30`:

```ts
  const stripe = new Stripe(stripeSecret, {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
  });
```

(The webhook additionally passes `Stripe.createSubtleCryptoProvider()` to
`constructEventAsync` — that's signature-verification-only and irrelevant to a
reconcile `sessions.retrieve` call.)

Other relevant env for the reconcile path: `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` (service-role writes), `INTERNAL_FUNCTION_SECRET`
(needed to call `send-order-confirmation`).

---

## 5. `fetch-order` return surface + how order-confirmation.html polls it

### What `fetch-order` returns
`supabase/functions/fetch-order/index.ts:184-226`. Anonymous, matched-pair auth
(`order_id` + `session_id` must point at the same row — `:73-80`). Returns:

- **`order`** (`:186-196`): `id, status, stripe_payment_status, customer_name,
  customer_postcode, fulfilment_mode, delivery_address, total_pence, created_at`.
  Deliberately omits `customer_email/phone, customer_id, contact_opt_in,
  platform_fee_pence` (`:14-17`). **`status` and `stripe_payment_status` are the
  two fields the poll loop keys on.**
- **`items`** (`:197-205`): per line `id, item_name_snapshot, qty, price_pence,
  item_type, capacity_units_snapshot, selections[]`.
- **`drop`** (`:206-215`): `id, slug, name, opens_at, closes_at, fulfilment_mode,
  collection_point_description, delivery_area_description`.
- **`vendor`** (`:216-222`): `id, name, display_name, website_url,
  powered_by_hearth_visible`.
- **`host`** (`:223`): `{id, name}` or `null`.
- Errors: `404 {error:"Order not found"}` on no matched pair (`:86`); `400` on bad
  payload; `500` on lookup failure.

`fetch-order` is a **pure read** — it does NOT itself reconcile or touch Stripe. So
on-demand reconcile must be a *separate* call, not folded into `fetch-order` (unless
deliberately changed).

### How order-confirmation.html polls
Initial load — `order-confirmation.html:402-471`:
- Reads `order_id` + `session_id` from query params (`:403-404`).
- Invokes `fetch-order` once (`:428-430`).
- Branches on `data.order.status` (`:448`): `placed` → `renderConfirmation` (`:450`);
  `cancelled` → `renderCancelled` (`:462`); **`pending_payment` → `renderPending` +
  `setupPendingWatch(supabase, orderId, sessionId)` (`:467-470`)**.

Poll loop — `setupPendingWatch`, `order-confirmation.html:684-771`:
- **Realtime channel** (`:746-753`): subscribes to `postgres_changes` UPDATE on
  `orders` filtered `id=eq.<orderId>`; on any event calls `refetch()`.
- **Fallback poll** (`:755`): `pollInterval = setInterval(refetch, 3000)` — every 3s.
- `refetch()` (`:734-744`): re-invokes `fetch-order` with the same matched pair,
  passes result to `handleStatus`.
- `handleStatus()` (`:710-732`): if new `order.status` is still `pending_payment`,
  keeps watching (`:713`); otherwise `cleanup()` and render `placed` /`cancelled` /
  empty.
- **Timeout** (`:757-768`): at 60s, swaps the pending copy to "taking longer than
  expected" + a manual "Refresh page" button. The watcher keeps running (the timeout
  only changes copy; it does not stop the interval or channel).
- `cleanup()` (`:692-708`): removes channel, clears interval + timeout, removes the
  `beforeunload` listener. Guarded by `cleaned` so it runs once.

### Where the on-demand reconcile call fits
The natural insertion point is **inside `setupPendingWatch`** — the client is
already in a "still pending after redirect-back" state, which is exactly the case
the webhook may have missed/lagged. Options:
- Add a reconcile EF invoke **once on entry to `setupPendingWatch`** (or after the
  first N seconds / first failed poll), then let the existing realtime+poll loop
  pick up the resulting `orders` UPDATE — no change to `handleStatus` needed, because
  the reconcile EF's `orders` UPDATE (side effect A) fires the realtime event at
  `:750`.
- And/or wire it to the 60s **timeout** branch (`:757`) and the manual "Refresh"
  button so a stuck order self-heals on user action.

The 3s poll calling `fetch-order` stays as-is for read; reconcile is the new
*write-back* trigger layered alongside it.

---

### One-line summary for the build
Reconcile EF must: (i) load order by `stripe_session_id` (service role), (ii)
**re-fetch the Stripe session and require `payment_status === "paid"`** (the webhook
skips this because it has a signed event — reconcile does not), (iii) idempotency-
guard on `order.status === "placed"`, then replicate side effects A (orders update:
`status:"placed"`,`stripe_payment_status:"paid"`), B (`order_status_events` audit row
with a reconcile-specific `actor`), and C (fire-and-forget `send-order-confirmation`
via `X-Internal-Secret`). Pin `stripe@14.21.0` / `apiVersion:"2023-10-16"`. Wire the
on-demand trigger into `setupPendingWatch` (entry and/or 60s timeout) in
order-confirmation.html; the existing realtime+poll loop renders the result with no
further change.
