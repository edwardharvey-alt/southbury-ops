# Findings — "Sent by Hearth" comms-visibility section (read-only audit)

Date: 2026-06-20. Scope: confirm three integration points on the per-drop Activation view. No code changed.

## 1. Activation view + signals-read frontend pattern

**Correction to seed:** `get-drop-signals` is NOT invoked from the Activation view. It is invoked from **drop-manager.html** (Drop Studio drop-tile demand pills), `hydrateSignalPills()`:

- drop-manager.html:3308-3311 — the idiom:
  ```js
  supabase.functions.invoke("get-drop-signals", {
    body: { vendor_id: state.vendorId, drop_id: dropId }
  }).then(({ data, error }) => { ... })
  ```
  Client is the shared singleton: `supabase = window._getHearthClient()` (drop-manager.html:6407), session via `await supabase.auth.getSession()` (drop-manager.html:6410). The singleton attaches the user JWT (the only path that survives the auth-attach bug), so `invoke` carries `Authorization: Bearer <access_token>` automatically — no manual header.

- **The per-drop Activation view is `activation.html` → `renderDropView(dropId)`** (activation.html:2732), entered via `showDropView(dropId)` (3703). Its invoke idiom differs: client is a **bare inline createClient**, NOT the singleton —
  - activation.html:1324-1327 — `const sb = window.supabase.createClient(window.HEARTH_CONFIG.SUPABASE_URL, window.HEARTH_CONFIG.SUPABASE_ANON_KEY);`
  - All EF calls go through `sb.functions.invoke('<name>', { body })` and check both `error` and `data.error`. Examples: `list-drops` (1558), `activation-events` (1795/3724), `update-drop` (2327/2350), `send-host-activation-email` (4363), `get-drop-host-token` (4434), confirm-email path `sb.functions.invoke(fnName, ...)` (4311).
  - Vendor id available as `state.vendor` / `state.vendor.id`; selected drop as `state.selectedDropId`; per-drop summary as `state.summaryById[dropId]`, raw row as `state.rawById[dropId]`.

- **Render target / nearest stable anchor.** `renderDropView` assembles its HTML at **activation.html:3632-3644**:
  ```js
  content.innerHTML = `
    <button class="act-back-link" ...>← All drops</button>
    <div class="act-drop-header">...</div>
    <div class="act-layout">
      <div class="act-layout-main"><div class="act-timeline">${cards.join('')}</div></div>
      <aside class="act-layout-aside">${asideHtml}</aside>
    </div>`;
  ```
  The nearest stable markup anchor is the aside stat card `asideHtml` (built 3602-3630): `<div class="act-stat-card"><p class="act-stat-eyebrow">This drop, live</p>...</div>`. A "Sent by Hearth" card sits naturally inside `.act-layout-aside`, beside/after `.act-stat-card`. (Note: the "Promotion plan"/"Help fill this drop" checklist lives in drop-manager.html review pane `#reviewPromotionPlan` at 4305-4306, a different surface — not in activation.html.)

## 2. get-drop-signals EF (pattern to mirror)

File: supabase/functions/get-drop-signals/index.ts. `verify_jwt = false` (config.toml:37).

- JWT read + getUser — index.ts:37-47:
  ```ts
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
  if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);
  ```
- Service-role client — index.ts:60-63: `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`.
- Ownership: two checks — vendor owned by caller (66-73): `vendors.select('id').eq('id', vendor_id).eq('auth_user_id', user.id).maybeSingle()` → 403 if none; then drop belongs to vendor (76-83): `drops.select('id').eq('id', drop_id).eq('vendor_id', vendor_id).maybeSingle()` → 404 if none.
- Response shape — index.ts:101: `{ interest_count, waitlist_count }` (200). Errors are `{ error: "..." }` with status.

## 3. send-order-confirmation EF (where order_confirmation routing hooks in)

File: supabase/functions/send-order-confirmation/index.ts. Input `Payload = { order_id }` (21). Internal shared-secret auth (not JWT); service-role client.

- Identifiers at send time: `order_id` (input, 350); `order.customer_email` (386); order fields via `orders` select (358-364). **`drop_id` is NOT selected as a scalar** — the drop is pulled via nested embed `drop:drop_id ( name, ... )` (361) so only drop *name* is in scope, not its id. To build a `{drop_id}` dedupe_key the routing must add `drop_id` (a column on `orders`) to the select at 360-361.
- Resend send: **index.ts:469** — `await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: Bearer ${resendKey} }, body: JSON.stringify(resendPayload) })`. Payload built 459-467 (`to: order.customer_email`, subject 454). Success log 499-505 has `resend_id`.
- comms_log: **does NOT write comms_log** (confirmed — no `comms_log` reference anywhere in the file). On success returns `{ ok: true, resend_id }` (507). This is the hook point: claim before send, update status after the 469 fetch.

## 4. comms_log claim idiom (canonical)

No shared helper — `grep comms_log supabase/functions/_shared` → NONE. Each dispatcher inlines it.

Canonical claim (dispatch-interest-open/index.ts:186-209):
```ts
const dedupeKey = `interest_open:${drop.id}:${customer.id}`;
const { data: claimRows, error: claimErr } = await sb
  .from("comms_log")
  .upsert(
    {
      drop_id: drop.id,
      customer_id: customer.id,        // NULLABLE — host/vendor touchpoints omit
      touchpoint: "interest_open",
      channel: "email",
      recipient: customer.email,
      dedupe_key: dedupeKey,
      status: "pending",
    },
    { onConflict: "dedupe_key", ignoreDuplicates: true }
  )
  .select("id");
if (claimErr) { /* failed++ */ }
if (!claimRows || claimRows.length === 0) { /* skip — already claimed */ }
```
(Note: idiom is `.upsert(..., { onConflict, ignoreDuplicates: true }).select("id")` — an empty returned array = conflict = already handled. The header comment phrases it as `INSERT ... ON CONFLICT DO NOTHING RETURNING id`.)

Post-send status updates (dispatch-interest-open/index.ts:284-302):
```ts
// failure:
await sb.from("comms_log").update({ status: "failed", error: `${res.status} ${errText}`.slice(0,2000) }).eq("id", claimId);
// success:
await sb.from("comms_log").update({ status: "sent", sent_at: new Date().toISOString(), meta: { resend_id: resendId } }).eq("id", claimId);
```

dedupe_key shape varies by touchpoint identifier:
- `interest_open:${drop.id}:${customer.id}` (customer-id based — dispatch-interest-open:182)
- `post_drop_thankyou:${drop.id}:${recipient.email}` (email based — dispatch/send-post-drop-thankyou:185/143)

## Build readiness

1. **New section file + anchor:** render in `activation.html` `renderDropView` inside `<aside class="act-layout-aside">` beside `asideHtml`'s `.act-stat-card` (assembled at activation.html:3632-3644; aside markup 3602-3630). Fetch via the page's existing `sb.functions.invoke('<new-read-ef>', { body: { vendor_id: state.vendor.id, drop_id } })` idiom (note: activation.html uses a bare inline `sb` client, not the `_getHearthClient` singleton).
2. **EF to clone for the read:** `get-drop-signals` (verify_jwt=false, `auth.getUser` + vendor-owns + drop-owns checks, service-role count of a vendor-scoped table) — point it at `comms_log` filtered by `drop_id` instead of `drop_signals`. For the write hook, add the claim/update block (target 3) to `send-order-confirmation` around its Resend fetch (index.ts:469).
3. **Proposed dedupe_key:** `order_confirmation:${drop_id}:${order_id}` — order-id based (not customer-id/email), because one customer can place multiple orders in a single drop. Requires adding `drop_id` to send-order-confirmation's `orders` select (currently absent; only the embedded drop name is fetched). `customer_id` on the comms_log row can be left null (column is nullable) or backfilled if available.
