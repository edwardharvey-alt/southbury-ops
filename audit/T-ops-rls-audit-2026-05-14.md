# T-ops-rls audit — direct PostgREST mutations across the frontend

**Date:** 2026-05-14
**Branch:** `audit/T-ops-rls-mutations`
**Trigger:** T-ops-rls-fix — Service Board order status transitions silently
fail in production. The optimistic UI shows success; the database never
changes. Same failure shape: direct PostgREST mutation against an
RLS-protected table from an inline-`createClient`-built (no JWT
attached) or anonymous client returns HTTP 204 / zero rows affected.

This audit checks whether the same shape exists elsewhere. Read-only
investigation. No code changes, no SQL execution, no Edge Function
deploys.

## Scope

- `.html` files at repo root
- `.js` files under `assets/`
- Patterns: `.from(...).insert(` / `.update(` / `.upsert(` / `.delete(` / `.rpc(`
- Excluded: third-party libraries (`assets/libheif.js`), Edge Function
  internals (`supabase/functions/`), pure-read patterns (`.select(`,
  `.single(`, `.maybeSingle(`).

## Summary counts

- **Total mutation findings:** 8
- **RED (silent-failure candidate):** 7
- **AMBER (mutation possible but bounded):** 0
- **UNKNOWN (needs `pg_policy` check):** 1
- **GREEN (false positive on inspection):** 0

By table:

- `orders` — 1 finding (RED, already T-ops-rls-fix)
- `order_status_events` — 1 finding (RED, already T-ops-rls-fix)
- `customers` — 2 findings (RED, customer-import.html)
- `customer_relationships` — 2 findings (RED, customer-import.html)
- `vendors` — 2 findings (1 RED auth-callback.html, 1 UNKNOWN drop-manager.html)

`.upsert(` and `.rpc(` returned zero hits outside Edge Functions.

## RED findings (silent-failure candidates)

### Finding 1 — auth-callback.html:404-407 — `vendors.update({ auth_user_id })`

- **Page:** `auth-callback.html`
- **Audience:** operator (post-login bridge)
- **Auth posture today:** Yes — `_sb.auth.getSession()` is called at
  line 386 and the page redirects to `./login.html` if no session. The
  mutation runs after a valid session is established.
- **Client construction:** inline `supabase.createClient(...)` at
  line 307. Does NOT use `window._getHearthClient()`, so does NOT
  benefit from the manual `Authorization` header attach documented in
  CLAUDE.md operational learning #14.
- **Table:** `vendors`
- **Operation:** `update`

**Snippet:**

```js
// Auto-link: if a vendor row exists with this email but no auth_user_id, claim it
const { data: unlinked } = await _sb
  .from("vendors")
  .select("id")
  .eq("email", session.user.email)
  .is("auth_user_id", null)
  .maybeSingle();

if (unlinked) {
  await _sb
    .from("vendors")
    .update({ auth_user_id: session.user.id })
    .eq("id", unlinked.id);
}
```

**Why RED:** Two stacked failures.

1. Inline `createClient` per operational learning #12 silently fails
   authenticated mutations — the user JWT is not attached, PostgREST
   sees only the `apikey` bearer, RLS evaluates `auth.uid()` as null,
   zero rows match, returns 204.
2. Even with JWT attached, the RLS policy on `vendors UPDATE` would
   need to permit a user to claim a row where `auth_user_id IS NULL`
   based on email match. That is an unusual policy shape; the
   canonical pattern (per operational learning #16) is to do this
   linking server-side via the `invite-vendor` Edge Function, which
   uses a service-role client.

The result is invisible because the page does not check the update's
`error`/`count` return — `await _sb…update(...)` is fire-and-forget.
A failed claim leaves `auth_user_id` null and the next block
(`.select(...).eq("auth_user_id", session.user.id)`) returns no row,
so the user is routed to `./onboarding.html`. In practice the
`invite-vendor` Edge Function already linked the row server-side
(operational learning #11), so this code path is a backstop. But if
that backstop ever has to fire (e.g. a vendor row created
out-of-band, an invite path skipped), it would silently no-op.

**Recommended action:** Spin out as a new ticket (separate from
T-ops-rls-fix scope). Either (a) delete the auto-link block as dead
backstop now that `invite-vendor` does the linking, or (b) move the
auto-link to a dedicated `claim-vendor` Edge Function with explicit
server-side authorisation (verify the session user's email matches
the unlinked row's email, then service-role update). Low priority —
the path is rarely exercised — but worth resolving rather than
leaving as silent-failure latent code.

### Finding 2 — customer-import.html:1658-1662 — `customers.insert`

- **Page:** `customer-import.html`
- **Audience:** operator (vendor CSV import flow)
- **Auth posture today:** No — `grep` for `auth.getSession`, `auth.getUser`,
  `login.html`, or `redirect` in this file returns zero hits. The page
  resolves vendor purely from the `?vendor=` URL param. Anyone with the
  URL can reach the page.
- **Client construction:** inline `sb = window.supabase.createClient(...)`
  at line 1075. Does NOT use `window._getHearthClient()`.
- **Table:** `customers`
- **Operation:** `insert`

**Snippet:**

```js
/* 3a. Create new customers + relationships */
for (const row of createNewRows) {
  try {
    const customerPayload = { name: row.name, email: row.email };
    if (row.phone) customerPayload.phone = normalisePhone(row.phone);
    if (row.postcode) customerPayload.postcode = row.postcode;
    if (row.address) customerPayload.address = row.address;

    const { data: newCust, error: insertErr } = await sb
      .from('customers')
      .insert(customerPayload)
      .select('id')
      .single();

    if (insertErr) {
      if (insertErr.code === '23505') { counts.skipped++; } else { counts.failed++; }
      continue;
    }
```

**Why RED:** Per CLAUDE.md "Production mutation/read status" section,
`customer-import.html` writes are explicitly listed as UNVERIFIED.
The page has no session check (anonymous client) and uses inline
`createClient`. The `customers` table has a permissive anon SELECT
policy (operational learning #6) but the INSERT/UPDATE policies are
unverified. If anon INSERT is blocked by RLS, this write returns 204
silently. The `.select('id').single()` after `.insert(...)` partially
mitigates the silent-failure mode — if no row is inserted, the
`.single()` throws (PGRST116 "Cannot coerce the result to a single
JSON object") which the catch block treats as `counts.failed++`. So
the silent failure has a visible counter, but the page does not
surface a user-facing error other than the aggregate count.

**Recommended action:** Migrate the four `customers` /
`customer_relationships` writes in customer-import.html to a single
`import-customers` Edge Function with server-side JWT verification,
vendor ownership check, and service-role batch writes. Spin out as a
new ticket. Higher priority than auth-callback because (a) the file
runs anonymously, which is itself a separate auth-workstream issue
(T5-A3), and (b) the import flow will be exercised the moment a real
vendor onboards customer data.

### Finding 3 — customer-import.html:1669-1678 — `customer_relationships.insert` (create-new path)

- **Page:** `customer-import.html`
- **Audience:** operator
- **Auth posture today:** No (see Finding 2)
- **Client construction:** inline `createClient` (see Finding 2)
- **Table:** `customer_relationships`
- **Operation:** `insert`

**Snippet:**

```js
const { error: relInsertErr } = await sb
  .from('customer_relationships')
  .insert({
    customer_id: newCust.id,
    owner_type: 'vendor',
    owner_id: vendorId,
    consent_status: 'imported',
    source: 'import',
    lawful_basis: lawfulBasis
  });

if (relInsertErr) {
  if (relInsertErr.code === '23505') { counts.skipped++; } else { counts.failed++; }
  continue;
}
```

**Why RED:** Same shape as Finding 2 — anonymous page + inline client +
unverified anon-INSERT RLS on `customer_relationships`. The
`.insert(...)` here does NOT `.select()` afterwards so a silent
204/zero-rows return would be indistinguishable from success — the
catch block only fires on a thrown error. If RLS silently denies the
insert, the page reports `counts.newCustomers++` (incremented two
lines lower) but no relationship row is written. The vendor would
see "N customers imported" with N customer rows but zero
relationships — orphaned data, not visible to the vendor's owned
customer base.

**Recommended action:** Bundle into the `import-customers` Edge
Function from Finding 2.

### Finding 4 — customer-import.html:1694-1703 — `customer_relationships.insert` (add-relationship path)

- **Page:** `customer-import.html`
- **Audience:** operator
- **Auth posture today:** No
- **Client construction:** inline `createClient`
- **Table:** `customer_relationships`
- **Operation:** `insert`

**Snippet:**

```js
/* 3b. Add relationships only (+ address backfill) */
for (const item of addRelationshipOnly) {
  try {
    const { error: relInsertErr } = await sb
      .from('customer_relationships')
      .insert({
        customer_id: item.customerId,
        owner_type: 'vendor',
        owner_id: vendorId,
        consent_status: 'imported',
        source: 'import',
        lawful_basis: lawfulBasis
      });
```

**Why RED:** Same shape as Finding 3 — `.insert()` with no
`.select()` follow-up means silent 204 is indistinguishable from
success.

**Recommended action:** Bundle into the `import-customers` Edge
Function from Finding 2.

### Finding 5 — customer-import.html:1717-1720 — `customers.update({ address })`

- **Page:** `customer-import.html`
- **Audience:** operator
- **Auth posture today:** No
- **Client construction:** inline `createClient`
- **Table:** `customers`
- **Operation:** `update`

**Snippet:**

```js
/* Backfill address if import row has one and existing customer does not */
if (item.importAddress && (!item.existingAddress || item.existingAddress.trim() === '')) {
  await sb
    .from('customers')
    .update({ address: item.importAddress })
    .eq('id', item.customerId);
}
```

**Why RED:** Same shape — anonymous page + inline client + unverified
RLS posture for `customers UPDATE`. The result of the update is not
inspected at all (no destructuring of `error` or `count`) — the call
is pure fire-and-forget. If RLS denies, the address backfill silently
no-ops and the vendor's existing customer rows retain their previous
(possibly empty) address.

**Recommended action:** Bundle into the `import-customers` Edge
Function from Finding 2.

### Finding 6 — service-board.html:1872-1882 — `order_status_events.insert`

- **Page:** `service-board.html`
- **Audience:** operator
- **Auth posture today:** No — `grep` for `auth.getSession`,
  `auth.getUser`, or `login.html` in this file returns zero hits. The
  Service Board resolves vendor purely from the `?vendor=` URL param.
- **Client construction:** inline `supabase = window.supabase.createClient(...)`
  at line 2413. Does NOT use `window._getHearthClient()`.
- **Table:** `order_status_events`
- **Operation:** `insert`

**Snippet:**

```js
async function writeStatusEvent(order, fromStatus, toStatus) {
  const { error } = await supabase
    .from("order_status_events")
    .insert({
      order_id: order.order_id,
      drop_id: state.selectedDropId,
      from_status: fromStatus,
      to_status: toStatus,
      event_type: "status_change",
      actor: "service_board",
      actor_type: "operator"
    });

  if (error) throw error;
}
```

**Why RED:** Pre-known case — downstream of the T-ops-rls-fix root.
`writeStatusEvent` is called from `commitPending` (line 1938) after
the `orders.update` at Finding 7. The Service Board runs anon (no
session check), uses inline `createClient`, and the audit trail
insert goes through the same broken path as the status update.
PostgREST returns 204 with no rows inserted; the JS sees `error`
as null and reports success. The optimistic UI shows the transition;
no event row is written.

**Recommended action:** Bundle into T-ops-rls-fix. The
`transition-order-status` Edge Function planned to fix the
`orders.update` should also write the matching `order_status_events`
row in the same atomic operation (service-role) — that's the
canonical pattern (`transition-drop-status` is the reference). No
separate ticket needed.

### Finding 7 — service-board.html:1933-1936 — `orders.update({ status })`

- **Page:** `service-board.html`
- **Audience:** operator
- **Auth posture today:** No
- **Client construction:** inline `createClient`
- **Table:** `orders`
- **Operation:** `update`

**Snippet:**

```js
try {
  const { error: updateError } = await supabase
    .from("orders")
    .update({ status: pc.toStatus })
    .eq("id", pc.orderId);
  if (updateError) throw updateError;
  await writeStatusEvent(pc.orderSnapshot, pc.fromStatus, pc.toStatus);
  if (!skipRefresh) await refreshData();
} catch (err) {
  console.error(err);
  showError(err.message || "Status update failed.");
  applyStatusOptimistically(pc.orderId, pc.fromStatus);
}
```

**Why RED:** Pre-known case — this is the T-ops-rls-fix root finding.
The `orders` RLS policies "Orders: authenticated owner select" and
"Orders: authenticated owner update" require `auth.uid()` to match
`vendors.auth_user_id`. The Service Board runs anon (no session
check, inline client). Every status UPDATE returns HTTP 204 with
zero rows affected. `updateError` is null so the try-block
completes; `applyStatusOptimistically` already ran on the optimistic
path. UI shows transition; DB never changed. All four transitions
(Confirm, Bake, Ready, Delivered) are affected.

**Recommended action:** Already on backlog as T-ops-rls-fix. Fix
path: build a `transition-order-status` Edge Function mirroring
`transition-drop-status` (service-role bypass with in-function
authorisation via `supabase.auth.getUser()` and vendor-ownership
check). Same Edge Function should write the
`order_status_events` row from Finding 6.

## UNKNOWN findings (need `pg_policy` check)

### Finding 8 — drop-manager.html:4981-4984 — `vendors.update({ head_start_dismissed })`

- **Page:** `drop-manager.html`
- **Audience:** operator
- **Auth posture today:** Yes — `auth.getSession()` at line 5939 with
  redirect handling.
- **Client construction:** `window._getHearthClient()` at line 5936
  (the singleton with manual `Authorization` header attach per
  operational learning #14). JWT IS attached for this mutation.
- **Table:** `vendors`
- **Operation:** `update`

**Snippet:**

```js
if (variant === "head-start") {
  const dismissBtn = byId("firstDropGuidanceDismiss");
  if (dismissBtn) {
    dismissBtn.addEventListener("click", async () => {
      dismissBtn.disabled = true;
      try {
        const { error } = await supabase
          .from("vendors")
          .update({ head_start_dismissed: true })
          .eq("id", state.vendorId);
        if (error) throw error;
        state.vendor.head_start_dismissed = true;
        el.style.display = "none";
        el.innerHTML = "";
      } catch (err) {
        console.error(err);
        showError(err.message || "Unable to dismiss. Please try again.");
        dismissBtn.disabled = false;
      }
    });
```

**Why UNKNOWN:** The page has correct auth posture (singleton client +
JWT attached). However, operational learning #16 explicitly lists
`update-vendor` as the canonical write path for `vendors`. Every
other vendor-write site in the codebase has been migrated to that
Edge Function. This direct PostgREST update is the only remaining
exception. Two scenarios:

1. `vendors UPDATE` RLS permits authenticated owner updates (a policy
   like `auth.uid() = auth_user_id`). In that case, this update
   succeeds — the call is AMBER (works, but inconsistent with the
   "all vendor writes via update-vendor" pattern, and easy to break
   later by tightening the RLS).
2. `vendors UPDATE` RLS does NOT permit authenticated owner updates
   and only service-role writes are allowed. In that case, this
   update silently fails with 204 / zero rows. The dismiss button
   would appear to work in the UI (the JS sets
   `state.vendor.head_start_dismissed = true` and hides the element
   regardless of the server's response), but on the next page load
   the banner would reappear. This is the classic silent-failure
   shape. The page does check `error` and throws, but a 204 with
   zero rows affected does not produce an error object — it produces
   a null `error`, so the try block completes successfully.

The behaviour is empirically observable: dismiss the head-start
banner once, reload the page, see whether the banner returns. If it
returns, this is RED and matches T-ops-rls-fix shape exactly. If it
stays dismissed across reloads, it's AMBER (works today, brittle).

**Recommended action:** Run the `pg_policy` query below to determine
which scenario applies. If RED, either (a) migrate to a new
`dismiss-head-start` Edge Function, or (b) extend `update-vendor`'s
`ALLOWED_FIELDS` to include `head_start_dismissed` and route through
that. The second option is cleaner — one canonical vendor-write
function — and matches operational learning #16's pattern.

## AMBER findings

None.

## GREEN findings

None. (All 8 mutation hits are real, against RLS-protected tables.)

## SQL queries for Ed to run

Run each block in the Supabase SQL editor to determine the RLS posture
of the tables in the UNKNOWN finding and to confirm the policies on
the tables already classified RED. The audit's RED categorisation is
based on (a) inline-`createClient` client construction or anonymous
page audience, and (b) operational learnings #12 and #14 about the
auth-attach bug — the RLS posture lookups are confirmatory, not
load-bearing for the categorisation.

### `vendors` (Findings 1, 8)

```sql
SELECT polname, polcmd, polroles::regrole[], polqual::text, polwithcheck::text
FROM pg_policy
WHERE polrelid = 'vendors'::regclass;
```

```sql
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_name = 'vendors' AND grantee IN ('anon', 'authenticated');
```

For Finding 1 specifically, look for any UPDATE policy whose `polqual`
permits a row where `auth_user_id IS NULL` to be claimed by the
session user — if no such policy exists, the auto-link block is dead
code (or worse, silently no-ops).

For Finding 8 specifically, look for an UPDATE policy whose
`polwithcheck` permits `auth.uid() = auth_user_id`. If absent, the
head_start_dismissed update silently fails and the finding is RED.

### `customers` (Findings 2, 5)

```sql
SELECT polname, polcmd, polroles::regrole[], polqual::text, polwithcheck::text
FROM pg_policy
WHERE polrelid = 'customers'::regclass;
```

```sql
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_name = 'customers' AND grantee IN ('anon', 'authenticated');
```

Operational learning #6 confirms a permissive anon SELECT policy. The
audit needs the INSERT and UPDATE policies for the anon role — these
are unverified per CLAUDE.md "Production mutation/read status".

### `customer_relationships` (Findings 3, 4)

```sql
SELECT polname, polcmd, polroles::regrole[], polqual::text, polwithcheck::text
FROM pg_policy
WHERE polrelid = 'customer_relationships'::regclass;
```

```sql
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_name = 'customer_relationships' AND grantee IN ('anon', 'authenticated');
```

### `orders` (Finding 7)

```sql
SELECT polname, polcmd, polroles::regrole[], polqual::text, polwithcheck::text
FROM pg_policy
WHERE polrelid = 'orders'::regclass;
```

Confirmatory only — T-ops-rls-fix already names the policies "Orders:
authenticated owner select" and "Orders: authenticated owner update"
and identifies them as the cause.

### `order_status_events` (Finding 6)

```sql
SELECT polname, polcmd, polroles::regrole[], polqual::text, polwithcheck::text
FROM pg_policy
WHERE polrelid = 'order_status_events'::regclass;
```

```sql
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_name = 'order_status_events' AND grantee IN ('anon', 'authenticated');
```

## Read-side risk (out of scope, flagged for follow-up)

This audit did NOT enumerate SELECT paths. However, the same
auth-attach bug (operational learning #14 Variant 3) silently filters
authenticated SELECT queries on pages that use inline `createClient`
against tables with `auth.uid()`-based SELECT policies. Likely
candidates observed in passing during the grep pass:

- `service-board.html` — reads `v_drop_orders_summary`, `orders`,
  `order_items`, `order_item_selections` against an inline anon
  client with no session. If any of these (or their underlying
  tables) have authenticated-owner SELECT policies, the Service
  Board's order list could be silently empty or partial in
  production. T-ops-rls-fix should verify the read side, not just
  the write side.
- `customer-import.html` — reads `customers`, `customer_relationships`
  on the same anon-no-session client. Operational learning #6 says
  these have anon `USING (true)` SELECT policies as a pre-auth
  measure, so reads probably work today, but the temporary policies
  are part of the T5-A3 workstream and will tighten.
- `auth-callback.html` — reads `vendors` immediately after the failed
  link. The select uses `auth_user_id` predicate against an inline
  client, which means JWT may or may not be attached. If RLS on
  `vendors SELECT` requires the user to own the row, this is the same
  shape.

A separate audit (T-ops-rls-read-audit) is recommended once the
write-side fixes land.

## Action summary

| Finding | File | Recommendation |
|---|---|---|
| 1 | auth-callback.html | New ticket — delete dead backstop or migrate to `claim-vendor` Edge Function |
| 2 | customer-import.html | New ticket — migrate to `import-customers` Edge Function |
| 3 | customer-import.html | Bundle with Finding 2 |
| 4 | customer-import.html | Bundle with Finding 2 |
| 5 | customer-import.html | Bundle with Finding 2 |
| 6 | service-board.html | Bundle into T-ops-rls-fix |
| 7 | service-board.html | Already T-ops-rls-fix |
| 8 | drop-manager.html | Run `pg_policy` lookup; if RED, extend `update-vendor` `ALLOWED_FIELDS` |

Three new ticket bundles fall out of this audit:

- **T-ops-rls-fix** (existing) — expand to include the
  `order_status_events` insert and the read-side risk on the Service
  Board.
- **New ticket: customer-import.html → Edge Function migration** —
  highest priority of the new findings because the page runs
  anonymously and will be exercised by the first vendor onboarding
  customer data.
- **New ticket: auth-callback.html auto-link backstop** — lowest
  priority; investigate then decide between deletion and migration.

Finding 8 (drop-manager.html head-start dismissal) is single-line and
either no-op or trivial-Edge-Function-extension depending on the
`pg_policy` result. Resolve as part of one of the above bundles
rather than a separate ticket.
