# PR-RLS-FIXES — Audit

**Status:** Audit complete, awaiting PR 1 and PR 2 implementation.
**Date opened:** 30 April 2026.
**Author of investigation:** Claude (in conversation with Edward).
**Predecessor PR:** PR 4b (closed direct PostgREST writes on `drops` and `drop_menu_items` from drop-manager.html). This audit follows the same investigative pattern.

---

## Section 1 — Scope

This audit covers two independent platform bugs surfaced during the post-PR-4b backlog review and confirmed during this investigation. They share a superficial similarity ("RLS-shaped errors on fresh vendors") but have entirely different root causes and fixes. Treating them as a single bug would have caused a poorly-scoped migration; treating them as two cleanly separated fixes is the right shape.

### Bugs covered

**Bug A — T5-B22.** The customer ordering flow on `order.html` fails on `order_items` insert under specific session conditions. Root cause is a policy asymmetry: `orders` and `order_item_selections` permit INSERT to the `public` Postgres role (which covers both `anon` and `authenticated`), but `order_items` permits INSERT only to the `anon` role. When the customer flow runs from a browser carrying an authenticated vendor session in localStorage, the `order_items` insert is rejected.

**Bug B — Categories cannot be created on fresh vendors.** Filed in CLAUDE.md as "categories RLS violation on fresh-vendor inserts." Root cause is NOT an RLS policy bug. It is a client-side bug: drop-menu.html constructs its Supabase client via `window.supabase.createClient(...)` directly instead of using the singleton wrapper `window._getHearthClient()` that drop-manager.html uses. The result is "Multiple GoTrueClient instances detected in the same browser context" (a known supabase-js v2 footgun), under which the user's JWT is not reliably attached to outgoing PostgREST writes. The write hits the database as the `anon` role rather than `authenticated`, the authenticated-only ALL policy refuses it, and the user sees what looks like an RLS bug.

**Bug B-companion — customer-import.html has the same JWT-attach bug.** Confirmed by code review during this investigation. customer-import.html uses the same `window.supabase.createClient(...)` pattern and writes to `customers` and `customer_relationships`. There is no confirmed user-visible failure (the page's error handling masks 401s as generic "failed rows"), but the bug pattern is identical and the fix is identical, so it is bundled into PR 2.

### What this audit does NOT cover

Four other pages (home.html, host-view.html, insights.html, order-confirmation.html, service-board.html) have the same `window.supabase.createClient(...)` anti-pattern. They are documented in Section 5 and deferred to a future PR 3. They are read-heavy rather than write-heavy and have no confirmed user-visible breakage at time of writing, so they do not block PR 2.

The `orders_update_public` permissive policy (which allows anon to UPDATE any orders row with no row filter, a real security hole) is flagged in Section 6 as a new backlog item but is not in scope for this audit.

### Sequencing

PR 1 ships first (pure SQL migration). PR 2 ships second (client code change in two files). The two are independent; either can be rolled back without affecting the other.

---

## Section 2 — Investigation history

This section captures the diagnostic path including a false start. The false start is preserved deliberately because it represents a real failure mode — pattern-matching from policy dumps to a confident-sounding theory before validating against actual reproduction. Future investigations of similar shape should expect to fall into the same trap if they don't gate their hypotheses against runtime evidence.

### Starting position

The post-PR-4b handover characterised the two bugs (T5-B22 and the categories bug) as "probably the same root cause" — RLS configuration that grants writes to authenticated-vendor role but not all required tables, or a missing JWT-attach pattern. The handover's instinct on the latter was correct for one of the two bugs, but the framing of "shared root cause" was wrong.

### Step 1 — Policy dump

The first diagnostic was a `pg_policies` dump scoped to the relevant tables (categories, order_items, orders, products, bundles, drop_menu_items, drops). Key findings:

The dump showed `order_items` had only one INSERT policy: `Order items: anon insert`, `check_clause = true`, role `{anon}`. This policy looks structurally fine on its face — anon INSERT with no condition. So if T5-B22's "orders insert succeeds, order_items insert fails" report was accurate, the policy alone could not be the cause. This was the first clue that the bug involved something about role semantics, not policy semantics.

The dump showed `categories` had `Categories: authenticated owner all` with USING clause `vendor_id IN (SELECT id FROM vendors WHERE auth_user_id = auth.uid())` and no explicit WITH CHECK. Postgres auto-implies WITH CHECK from USING for ALL policies, so this should let an authenticated vendor create their own categories. Structurally correct.

So both bugs looked like "policy is fine in theory; failure must come from somewhere else."

### Step 2 — Tables not in the initial dump

The initial SQL filter was too narrow. A second dump covered `customers`, `customer_relationships`, and `order_item_selections`. This revealed the asymmetry that became Bug A: `orders` had a `public`-role INSERT policy (`allow_anonymous_order_insert`); `order_item_selections` had a `public`-role INSERT policy (`allow_anonymous_order_item_selections_insert`); `order_items` did NOT — its only INSERT policy was the `anon`-role one. The asymmetry meant `order_items` was the only table in the customer-flow chain that would reject writes from `authenticated` role.

This was the moment Bug A became diagnosable from policy data alone.

### Step 3 — False hypothesis on Bug B

For the categories bug, the working theory at this point was: "test-12 vendor row probably has `auth_user_id = NULL` because it was created via SQL fixture rather than a real signup flow." The reasoning was that this would explain why fresh vendors fail and established ones don't, while leaving the policy structurally sound.

A SQL check disproved the theory:

```sql
SELECT slug, name, auth_user_id IS NOT NULL AS has_auth_link, stripe_onboarding_complete
FROM vendors
WHERE slug IN ('test-12', 'test-11', 'southbury-farm-pizza');
```

Returned `has_auth_link = true` for all three vendors, including test-12. So the fixture-misconfiguration theory was wrong.

A second false hypothesis followed: "JWT-versus-slug mismatch — Edward is signed in as one vendor's auth user but viewing test-12's slug, so the policy check fails." This was also disproved by an in-browser auth check: `auth.uid()` returned test-12's `auth_user_id` exactly, confirming the session belonged to the right user.

### Why these false starts mattered

Both false hypotheses sounded confident from policy data alone. Both were wrong because they assumed runtime behaviour matched static policy semantics. The lesson, captured here for future investigations: when policy dumps look correct but writes fail, the next diagnostic step must be a runtime reproduction with full error visibility, not a third hypothesis from the same data.

### Step 4 — Reproduction with full error visibility

The diagnostic that finally surfaced the true cause was an in-browser insert with `console.log` of both the auth user and the resulting error object:

```js
const c = window.supabase.createClient(window.HEARTH_CONFIG.SUPABASE_URL, window.HEARTH_CONFIG.SUPABASE_ANON_KEY);
const { data: u } = await c.auth.getUser();
console.log('Auth user before insert:', u?.user?.id);

const { data, error } = await c.from('categories').insert({
  vendor_id: '26e3721b-34d9-4b13-9dc3-e92c47d058a8',
  name: 'Diagnostic Test Category',
  slug: 'diagnostic-test-' + Date.now(),
  sort_order: 999,
  is_active: false
}).select('*').single();

console.log('Insert error:', error);
console.log('Insert data:', data);
```

Output:

```
GoTrueClient@sb-tvqhhjvumgumyetvpgid-auth-token:1 (2.105.1) ... 
  Multiple GoTrueClient instances detected in the same browser context. 
  It is not an error, but this should be avoided as it may produce 
  undefined behavior when used concurrently under the same storage key.

Auth user before insert: 40d17b2d-2960-4d06-afd4-d27d399becd9

POST https://tvqhhjvumgumyetvpgid.supabase.co/rest/v1/categories?select=* 
  401 (Unauthorized)

Insert error: {code: '42501', details: null, hint: null, 
  message: 'new row violates row-level security policy for table "categories"'}
Insert data: null
```

This is the smoking gun. It tells us four things:

1. The session is correctly available — `getUser()` returned test-12's auth user id.
2. The POST returned `401 Unauthorized` plus error code `42501`. This combination means the request reached PostgREST without the user's JWT attached. Only the anon key was sent. PostgREST evaluated the row against the `anon` role, found no INSERT policy on `categories` for `anon`, and rejected with the RLS error.
3. The "Multiple GoTrueClient instances" warning identifies the mechanism: when multiple clients share the same storage key, the access-token-attach behaviour becomes unreliable. One client thinks it owns the session; the other sends requests anyway without the token.
4. This is structurally identical to the bug class PR 4b just fixed for `drops` and `drop_menu_items` from drop-manager.html. drop-menu.html is the next page in line.

### Step 5 — Inventory expansion

A grep across the repo showed the bug pattern was not isolated to drop-menu.html:

```
$ grep -n "window.supabase.createClient" *.html
brand-hearth.html:1828          guard check, not actual call
customer-import.html:1066       BUG: actual createClient call
drop-manager.html:4934          guard check, not actual call (uses singleton)
drop-menu.html:3127             guard check
drop-menu.html:3134             BUG: actual createClient call
home.html:1074                  BUG: actual createClient call
host-view.html:383              BUG: actual createClient call
insights.html:981               BUG: actual createClient call
order-confirmation.html:373     BUG: actual createClient call
order.html:3089                 guard check
order.html:3097                 anon flow — not affected
service-board.html:2332         guard check
service-board.html:2340         BUG: actual createClient call
```

```
$ grep -l "_getHearthClient" *.html
brand-hearth.html
drop-manager.html
```

Combined reading:

- **Singleton (correct):** drop-manager.html, brand-hearth.html.
- **Direct construction (the bug):** drop-menu.html, customer-import.html, home.html, host-view.html, insights.html, order-confirmation.html, service-board.html.
- **Anonymous flow (not affected):** order.html.

That is six authenticated pages with the same defect, not one. Section 5 covers the full inventory; PR 2 covers the two write-heavy pages from this list.

---

## Section 3 — Bug A: order_items policy gap (T5-B22)

### Symptom

When a customer places an order on `order.html`, the `orders` row inserts successfully but the subsequent `order_items` insert fails with an RLS violation. If the order included a bundle, `order_item_selections` is never reached. The customer sees a blocking error message; the order does not complete.

The bug was filed in CLAUDE.md as T5-B22 ("customer-flow order_items RLS bug").

### Reproduction

The bug reproduces under one specific condition: when the browser opening order.html has an authenticated Supabase session in localStorage. This happens whenever Edward (or any developer) opens order.html from the same browser they use to sign in as a vendor on drop-manager.html. Both pages share localStorage; both use the same Supabase project; the authenticated session leaks into the customer client.

For a real anonymous customer with no session in localStorage, the bug does not reproduce — they hit the `anon`-role policy and the insert succeeds. This is why the bug has not affected real production traffic; it has only blocked Edward's ability to test the customer flow from his vendor-logged-in browser.

That said, it is still a real platform bug and a real risk. Any future flow where an authenticated user (such as a logged-in regular customer in a future feature) attempts to place an order would hit it. The fix closes the gap structurally, regardless of whether real customers have hit it yet.

### Evidence — policy comparison across the three customer-flow tables

Pulled from the production `pg_policies` dump on 30 April 2026.

**`orders` — INSERT policies:**

| Policy name | Role | check_clause |
|---|---|---|
| `Allow anon to insert orders` | `{anon}` | `true` |
| `Orders: anon insert` | `{anon}` | `true` |
| `allow_anonymous_order_insert` | `{public}` | `true` |
| `anon_insert_orders` | `{anon}` | `true` |

The `public`-role policy (`allow_anonymous_order_insert`) covers both `anon` and `authenticated`. An `authenticated` request inserts successfully via this policy. (Several anon-only duplicates also exist; they are redundant but not harmful.)

**`order_item_selections` — INSERT policies:**

| Policy name | Role | check_clause |
|---|---|---|
| `Order item selections: anon insert` | `{anon}` | `true` |
| `allow_anonymous_order_item_selections_insert` | `{public}` | `true` |

Same shape as `orders`. The `public`-role policy covers both roles.

**`order_items` — INSERT policies:**

| Policy name | Role | check_clause |
|---|---|---|
| `Order items: anon insert` | `{anon}` | `true` |

This is the gap. There is no `public`-role INSERT policy. An `authenticated` request to insert into `order_items` matches NO policy and is rejected.

### Root cause

`order_items` is the only table in the three-table customer-flow chain whose INSERT permissions are restricted to `anon` only. When a customer client carries an authenticated session, `orders` and `order_item_selections` accept the write via their `public`-role policies, but `order_items` rejects it because the `anon`-role policy does not match the `authenticated` role's request.

This is a structural inconsistency, not a typo or a recent regression. It has been present since the customer flow was first built. It only surfaces under the testing condition described above.

### Fix proposal — migration

The fix mirrors `order_items` to its sibling tables. Drop the `anon`-only policy and create a `public`-role replacement. The naming follows the existing convention from `allow_anonymous_order_item_selections_insert`.

```sql
-- Migration: align order_items INSERT policy with sibling customer-flow tables
-- Hearth bug ref: T5-B22
-- Audit: PR-RLS-FIXES-AUDIT.md, Section 3

BEGIN;

-- Drop the existing anon-only policy
DROP POLICY IF EXISTS "Order items: anon insert" ON public.order_items;

-- Create a public-role INSERT policy mirroring orders and order_item_selections
CREATE POLICY allow_anonymous_order_items_insert
  ON public.order_items
  FOR INSERT
  TO public
  WITH CHECK (true);

COMMIT;
```

After this migration, the three customer-flow INSERT policies are structurally identical:

- `allow_anonymous_order_insert` on `orders`
- `allow_anonymous_order_items_insert` on `order_items`  ← new
- `allow_anonymous_order_item_selections_insert` on `order_item_selections`

### Rollback

If for any reason the migration causes unexpected behaviour, the rollback is straightforward — restore the original anon-only policy:

```sql
-- Rollback for T5-B22 fix
BEGIN;

DROP POLICY IF EXISTS allow_anonymous_order_items_insert ON public.order_items;

CREATE POLICY "Order items: anon insert"
  ON public.order_items
  FOR INSERT
  TO anon
  WITH CHECK (true);

COMMIT;
```

This restores the database to its exact pre-migration state. Have this script in a scratch tab when running the migration so it is one paste away if needed.

### Risk analysis

**Risk to existing customer orders:** None. The new `public`-role policy is strictly more permissive than the `anon`-role policy it replaces (any anon request that previously passed will still pass; some authenticated requests that previously failed will now pass). No previously-allowed write becomes blocked.

**Risk of write abuse:** Negligible relative to current state. The existing `Allow anon to insert orders` policy already permits unrestricted anon INSERT on `orders` with `check_clause = true`. The `order_items` change brings nothing new in terms of openness — the table already accepts unrestricted writes from anon, this just extends the same permissiveness to `authenticated`. If unrestricted INSERT on the customer-flow tables is a concern in general, that is a separate audit (and a separate PR) that should be opened alongside the `orders_update_public` finding flagged in Section 6.

**Risk of breaking authenticated reads:** None. The migration only touches an INSERT policy. The existing authenticated SELECT policy (`Order items: authenticated owner select`) is untouched.

### Smoke test plan — PR 1

PR 1 is a SQL migration. It ships against production directly because Hearth has no staging environment (CLAUDE.md rule 13). Netlify deploy previews are not relevant here — the deploy preview pulls from the same production Supabase, so the migration's effect is identical whether the preview is loaded or not.

The smoke test must therefore run against production after the migration is applied. The plan:

**Pre-merge preparation:**

1. Open the rollback SQL in a scratch tab. Do not close it until the smoke test passes.
2. Capture the current production state of `pg_policies` for `order_items`:

   ```sql
   SELECT policyname, roles, cmd, qual AS using_clause, with_check AS check_clause
   FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'order_items';
   ```

   Save the output. This is the recovery reference if anything goes sideways.

**Apply migration:**

3. Run the migration SQL from above against production via Supabase SQL editor.
4. Re-run the `pg_policies` query. Confirm:
   - `Order items: anon insert` is GONE.
   - `allow_anonymous_order_items_insert` is PRESENT, with role `{public}`, cmd `INSERT`, check_clause `true`.
   - `Order items: authenticated owner select` is still PRESENT and unchanged.

**Anonymous-customer test (the original failure mode for real users — should still work):**

5. Open an incognito Chrome window. No session in localStorage.
6. Navigate to a live drop's ordering page on production.
7. Add a single product to the basket. Complete the checkout flow with a test phone, name, and address.
8. Verify the order completes and you see the confirmation page.
9. In Supabase SQL editor, query the most recent order:

   ```sql
   SELECT o.id, o.customer_name, o.total_pence, oi.id AS item_id, oi.qty
   FROM orders o
   LEFT JOIN order_items oi ON oi.order_id = o.id
   WHERE o.created_at > NOW() - INTERVAL '5 minutes'
   ORDER BY o.created_at DESC;
   ```

   Confirm both `orders` and `order_items` rows persisted.

**Authenticated-session test (the failing case the bug report described — should now work):**

10. In the same browser used in step 5, sign in as test-11 on drop-manager.html. This places an authenticated session in localStorage.
11. In the same browser (NOT incognito), open a different live drop's ordering page in a new tab.
12. Repeat the order flow from step 7 — add product, complete checkout.
13. Confirm the order completes. Pre-fix this would have failed with an RLS error on `order_items`.
14. Verify in SQL as in step 9.

**Bundle test (covers `order_item_selections` path):**

15. Find a drop with a configured bundle. In an incognito window, place an order containing a bundle.
16. Complete checkout.
17. Confirm in SQL that `orders`, `order_items`, AND `order_item_selections` all persisted:

    ```sql
    SELECT o.id, oi.id AS item_id, oi.item_type, ois.id AS selection_id
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN order_item_selections ois ON ois.order_item_id = oi.id
    WHERE o.created_at > NOW() - INTERVAL '5 minutes'
    ORDER BY o.created_at DESC;
    ```

**If any test fails:** apply the rollback SQL from the scratch tab. Re-run the `pg_policies` query to confirm restoration. Investigate before re-attempting.

**Backlog reconciliation:** After all tests pass, mark T5-B22 as resolved in CLAUDE.md.

---

## Section 4 — Bug B: drop-menu.html and customer-import.html JWT-attach

### Symptom

On drop-menu.html, when signed in as a vendor, clicking "+ New Category" (or "+ New Product" / "+ New Bundle") and submitting the modal returns an "Unable to create category" error toast. Browser dev tools show `401 Unauthorized` on the POST to `/rest/v1/categories`, with response body containing `code: '42501'` and `message: 'new row violates row-level security policy for table "categories"'`.

The bug was filed in CLAUDE.md as "categories RLS violation on fresh-vendor inserts." The "fresh vendor" framing was misleading — the bug affects ANY vendor signed in via drop-menu.html, not just fresh ones; it just happened to be discovered first on test-12 because that vendor had zero pre-existing categories and so the issue was unmissable. Established vendors with pre-existing categories may not have noticed if they weren't actively trying to create new ones.

For customer-import.html, no user-visible failure has been confirmed because the page's error handling catches the 401 and buckets it into a generic "X rows could not be imported due to an error" message (see "customer-import.html error handling" below). However, the bug pattern is identical and the fix is identical, so the page is bundled into PR 2.

### Reproduction (drop-menu.html)

Reproduced live during this investigation as test-12 on production:

1. Sign in as the test-12 auth user (id `40d17b2d-2960-4d06-afd4-d27d399becd9`).
2. Navigate to `lovehearth.co.uk/drop-menu.html?vendor=test-12`.
3. Open browser dev tools, Console tab.
4. Run the diagnostic insert (full code in Section 2, Step 4).

**Expected (working) result:** Insert succeeds, `data` contains the new row, `error` is null.

**Actual result:**

```
GoTrueClient@sb-tvqhhjvumgumyetvpgid-auth-token:1  
  Multiple GoTrueClient instances detected in the same browser context...

Auth user before insert: 40d17b2d-2960-4d06-afd4-d27d399becd9

POST .../rest/v1/categories?select=*  401 (Unauthorized)

Insert error: {code: '42501', message: 'new row violates row-level security policy for table "categories"'}
Insert data: null
```

The auth user is correctly resolved. The request reaches PostgREST. The response is 401/42501.

### Root cause

drop-menu.html constructs its own Supabase client at line 3134:

```js
supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

drop-manager.html, by contrast, retrieves a singleton:

```js
supabase = window._getHearthClient();
```

The singleton is defined in (most likely) `assets/hearth-vendor.js` or `assets/config.js` — both are loaded on drop-menu.html, so the helper is already available there; it is just not being called.

When drop-menu.html constructs its own client while another singleton client already exists in the same tab (because the user has navigated through other pages, or because hearth-vendor.js has already initialised one), supabase-js v2 produces the warning `Multiple GoTrueClient instances detected in the same browser context. It is not an error, but this should be avoided as it may produce undefined behavior when used concurrently under the same storage key.`

The "undefined behavior" the warning describes is exactly what we see: one of the two clients holds the in-memory access token, the other does not. When drop-menu.html's client makes a write request, the JWT attach step inside supabase-js queries the storage layer for the current session — and depending on which client "won" the storage key, it may or may not get a token. In the failing case, no token is attached. The request goes out with only the `apikey` header (the anon key), PostgREST evaluates the row against the `anon` role, finds no INSERT policy on `categories` for `anon`, and rejects with 401/42501.

This is the exact same mechanism PR 4b fixed for `drops` and `drop_menu_items` writes from drop-manager.html, except drop-manager.html's fix was to route writes through Edge Functions (which carry the service role key). drop-menu.html doesn't need Edge Functions; the simpler structural fix is to use the singleton client like drop-manager.html does for its non-write operations.

### Why customer-import.html has the same bug

customer-import.html line 1066:

```js
const sb = window.supabase.createClient(
  window.HEARTH_CONFIG.SUPABASE_URL,
  window.HEARTH_CONFIG.SUPABASE_ANON_KEY
);
```

Same anti-pattern. Same `Multiple GoTrueClient instances` warning will fire. Same JWT-attach unreliability.

The page does multiple authenticated writes during a customer import:

- `customers` insert (new customer rows)
- `customer_relationships` insert (vendor → customer link)
- `customers` update (address backfill)

The `customer_relationships` table has policy `customer_relationships_vendor_access` on `{authenticated}` only — there is no `public`-role fallback. So `customer_relationships` writes from this page WILL hit the JWT-attach bug under the same conditions that affect drop-menu.html.

### customer-import.html error handling — backlog item

The catch blocks around the customer and customer_relationship inserts swallow JWT-attach failures silently into a generic "failed" counter:

```js
if (insertErr) {
  if (insertErr.code === '23505') { counts.skipped++; } else { counts.failed++; }
  continue;
}
```

A 401/RLS rejection has `code === '42501'`, which does not match the 23505 duplicate-key check. So it gets bucketed as `failed`, and the user sees a calm-toned message: "X rows could not be imported due to an error." No diagnostic detail is logged or surfaced.

This means: if any vendor has previously attempted a customer import and seen "X rows could not be imported," it is plausible (though unconfirmed) that they were hitting this exact JWT-attach bug — and Edward would have no way of knowing without checking Supabase logs for 401s correlated with `/rest/v1/customer_relationships` inserts.

This is filed as a new backlog item in Section 6: improve customer-import.html error handling to log the actual error code/message in dev console (and ideally surface the count of auth-failed rows separately from the generic failed count, so vendors get an actionable error message).

### Fix proposal — drop-menu.html

The current init block (around lines 3127–3134):

```js
async function init() {
  try {
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error("Supabase library failed to load.");
    }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Missing Supabase config. Check ./assets/config.js.");
    }

    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    // ... rest of init
```

The proposed change:

```js
async function init() {
  try {
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error("Supabase library failed to load.");
    }
    if (typeof window._getHearthClient !== "function") {
      throw new Error("Hearth Supabase singleton helper not available. Check ./assets/hearth-vendor.js or ./assets/config.js.");
    }

    supabase = window._getHearthClient();
    window._hearthSupabase = supabase;
    // ... rest of init
```

Two changes:

1. The `createClient` call is replaced with `_getHearthClient()`, returning the same singleton drop-manager.html uses.
2. `window._hearthSupabase = supabase` exposes the client on window for diagnostic access, mirroring what drop-manager.html does. This is what made the auth check possible during this investigation. drop-menu.html previously did not expose its client, which was why the first auth check attempt failed with `Cannot read properties of undefined (reading 'auth')`.

The `SUPABASE_URL` and `SUPABASE_ANON_KEY` variable references in the init block become unused after this change. They can be removed for cleanliness, or left in place — the singleton handles the URL/key internally.

### Fix proposal — customer-import.html

The current init block (around line 1066):

```js
const sb = window.supabase.createClient(
  window.HEARTH_CONFIG.SUPABASE_URL,
  window.HEARTH_CONFIG.SUPABASE_ANON_KEY
);
```

The proposed change:

```js
if (typeof window._getHearthClient !== "function") {
  throw new Error("Hearth Supabase singleton helper not available. Check ./assets/hearth-vendor.js or ./assets/config.js.");
}
const sb = window._getHearthClient();
window._hearthSupabase = sb;
```

Same pattern. The variable name `sb` (rather than `supabase`) is preserved to minimise diff churn elsewhere in the file.

### Pre-implementation verification

Before merging PR 2, confirm one assumption that this audit is making: that `window._getHearthClient` is actually available on drop-menu.html and customer-import.html at the point of the init call.

Both files include these scripts in the same order as drop-manager.html:

- `./assets/config.js`
- `./assets/hearth-vendor.js?v=1`
- `./assets/vendor-nav.js?v=2`
- supabase-js@2 from CDN

drop-manager.html calls `window._getHearthClient()` successfully, so the helper is defined in one of those four scripts. The simplest verification before implementing the diff: load drop-menu.html in the browser, open dev console, run `typeof window._getHearthClient`. If it returns `"function"`, the fix as proposed will work. If it returns `"undefined"`, the helper is defined in a script that drop-menu.html does not load (unlikely, given the script lists are identical, but worth one console line to confirm).

### Risk analysis

**Risk to existing functionality:** Low. The change is structural — same client interface, different construction path. All existing reads continue to work because the singleton client uses the same Supabase URL and anon key. All existing writes either continue to work (because the page already had a working session, the JWT-attach bug just happened intermittently) or START working (the previously-failing writes now go through with a properly-attached JWT).

**Risk of new bugs:** Low. The singleton client is the same one drop-manager.html uses successfully. PR 4b validated this client extensively across drop-manager.html's call sites. Reusing it on drop-menu.html and customer-import.html does not introduce new code paths.

**Risk to other in-tab clients:** None new. The bug we are fixing IS the multi-client problem. Reducing to one singleton client per tab is strictly better; it is the fix that the supabase-js warning explicitly recommends.

**Risk of unreviewed edge cases:** drop-menu.html's `setSaveState`, `markDirty`, and form-validation flows do not interact with the Supabase client directly. The singleton swap should not affect them. customer-import.html's CSV parsing, validation, and step navigation are likewise client-independent.

### Smoke test plan — PR 2

PR 2 is a client code change. The Netlify deploy preview will exercise it fully. The deploy preview shares production Supabase, so authenticated writes during testing will create real rows — use the Test 12 fixture (which has zero existing data and is intentionally disposable) and clean up afterwards if needed.

**Deploy preview URL pattern (from PR 4b precedent):** `deploy-preview-{PR_NUMBER}--spiffy-tulumba-848684.netlify.app/...`

**Test 1 — drop-menu.html, fresh vendor (the original failure):**

1. Open the deploy preview URL for drop-menu.html as test-12: `?vendor=test-12`.
2. Sign in as the test-12 auth user.
3. Open browser dev console. Watch for the `Multiple GoTrueClient instances` warning. Pre-fix: warning should fire on page load. Post-fix: warning should NOT fire.
4. Click "+ New Category". Enter a name like "Mains" and click Create.
5. Confirm the category appears in the catalogue list and the success toast says "Category created."
6. Refresh the page. Confirm the category persists.
7. Click "+ New Product". Pick the new category, enter a name, price 5.00, capacity 1. Click Create.
8. Confirm the product appears and persists across a refresh.
9. Click "+ New Bundle". Pick the category, enter a name, price 10.00, capacity 1. Click Create.
10. Confirm the bundle appears and persists across a refresh.
11. In the dev console, run the diagnostic insert from Section 2 Step 4. Pre-fix this returned 401/42501. Post-fix it should return a valid `data` row and `error: null`.

**Test 2 — drop-menu.html, established vendor (regression check):**

12. Open the deploy preview as Southbury Farm Pizza: `?vendor=southbury-farm-pizza`.
13. Sign in as the Southbury auth user.
14. Confirm the existing categories, products, and bundles load correctly.
15. Edit an existing product — change the description, click Save Product. Confirm the change persists across a refresh.
16. Toggle a product active/inactive. Confirm the change persists.
17. Drag-reorder a product within its category. Confirm the order persists across a refresh.

**Test 3 — customer-import.html, fresh vendor:**

18. Prepare a sample CSV with 3 rows: one valid (name, email, postcode), one with a missing email (should be flagged as issue), one with a duplicate email matching an existing customer in the database (should be classified as skip or relationship-only).
19. Open the deploy preview for customer-import.html as test-12.
20. Sign in. Watch the dev console for the `Multiple GoTrueClient` warning. Post-fix: should NOT fire.
21. Drop the CSV onto the page. Step through Upload → Preview → Confirm → Import.
22. On the Done step, confirm the summary text. Expected: "1 customer added to your audience" (the valid row). The other two should be reflected in the issues / skipped counts as appropriate.
23. In Supabase SQL editor, verify the new customer and customer_relationship rows were created:

    ```sql
    SELECT c.id, c.name, c.email, cr.owner_id, cr.consent_status, cr.source, cr.lawful_basis
    FROM customers c
    JOIN customer_relationships cr ON cr.customer_id = c.id
    WHERE cr.owner_id = '26e3721b-34d9-4b13-9dc3-e92c47d058a8'  -- test-12
    AND cr.created_at > NOW() - INTERVAL '5 minutes'
    ORDER BY cr.created_at DESC;
    ```

24. Confirm the row has `consent_status = 'imported'`, `source = 'import'`, and `lawful_basis` matching the radio you selected on Step 3.

**Test 4 — customer-import.html, regression check:**

25. As any established vendor, run a small import (1–2 rows) through customer-import.html.
26. Confirm the import completes without errors and the relationships are created in the database.

**If any test fails:** the deploy preview can be discarded without merge. Investigate, push a fix to the branch, re-run.

**Pre-merge requirements:**

- All 4 tests pass on the deploy preview.
- The `Multiple GoTrueClient` warning is GONE from both fixed pages.
- No regressions on drop-manager.html or brand-hearth.html (which already use the singleton — sanity-check that a quick load of each still works).

**Backlog reconciliation:** After all tests pass and merge, mark "categories RLS violation on fresh-vendor inserts" as resolved in CLAUDE.md.

---

## Section 5 — Audit of other pages (PR 3 inventory)

The grep findings (Section 2 Step 5) identified six pages with the `window.supabase.createClient(...)` anti-pattern. PR 2 fixes two of them. The remaining four are deferred to PR 3. This section documents each one, what it does, what writes it performs, and what risk profile it carries.

### Pages fixed in PR 2

| Page | Construction line | Risk |
|---|---|---|
| drop-menu.html | 3134 | Confirmed user-visible bug (categories failure). Fix: PR 2. |
| customer-import.html | 1066 | Confirmed bug pattern; user-visible failures masked by error handling. Fix: PR 2. |

### Pages deferred to PR 3

| Page | Construction line | Page purpose | Known writes | Risk |
|---|---|---|---|---|
| home.html | 1074 | Vendor home dashboard. | TBD — needs code review. | Latent. |
| host-view.html | 383 | Host-facing read-only view of an upcoming drop. | None (read-only). | Low — no writes affected. |
| insights.html | 981 | Vendor analytics / reporting. | TBD — needs code review. | Latent. |
| order-confirmation.html | 373 | Customer order confirmation page after checkout. | None expected (read-only). | Low — also possibly anon-flow, would need review to confirm. |
| service-board.html | 2340 | Vendor operational board for a live drop (orders, status updates). | UPDATE on `orders.status` and similar. | High — vendor uses this in real time during a drop. |

### Notes on the deferred pages

**home.html** and **insights.html** need code review to determine what writes they perform. If they are pure read pages that only render views, the JWT-attach bug is harmless to user functionality (anon SELECT works fine on most tables) and the fix is a defence-in-depth swap rather than a bug fix. The `Multiple GoTrueClient` warning will still fire, contributing to the inconsistent-storage-key state across the app.

**host-view.html** at line 383 uses a different pattern (`_sb = window.supabase.createClient(...)` rather than the more common `const sb = ...` or `supabase = ...`). Confirm during PR 3 implementation that it actually needs an authenticated session — host views may operate as anon, in which case the swap is unnecessary.

**order-confirmation.html** is reached from the customer flow and is plausibly an anon page like order.html. Verify before swapping. If anon, it does not need the singleton (it will not have a session to attach in the first place). If authenticated, the swap follows the same template as drop-menu.html and customer-import.html.

**service-board.html** is the one to be most careful with. It is used live during drops. Issuing a status update from the board (e.g., marking an order as "ready") is the kind of write that would silently fail under the JWT-attach bug, and the consequences of a silent failure during a real service are operationally bad. PR 3 should prioritise this page and test it on a real (non-test-12) drop with at least one real-looking order. The deploy preview test should include placing a fake order on a Southbury drop, opening service-board.html, transitioning the order through several states, and confirming each state change persists and is reflected in the order's `status` field in the database.

### Recommended PR 3 scope

A single PR fixing all five remaining pages, with its own audit doc that:

- Code-reviews each page's writes (so we know the actual risk profile, not just "TBD")
- Applies the same singleton swap as PR 2
- Smoke-tests each page with a representative scenario, with extra scrutiny on service-board.html
- Removes the `Multiple GoTrueClient` warning from every authenticated page in the app

This audit recommends NOT bundling PR 3 with PR 2 because (a) PR 2 is already touching two files and adding a third quintet would inflate blast radius, and (b) the two write-heavy pages in PR 2 have confirmed bug behaviour, while PR 3's pages are mostly defence-in-depth with one or two confirmed-write pages mixed in. Different risk profiles, different review attention.

---

## Section 6 — Backlog reconciliation

This section reconciles the four CLAUDE.md backlog items present at the start of this investigation against the work proposed in this audit, plus identifies new backlog items that surfaced during the investigation.

### Backlog items closed by this audit

**T5-B22 — customer-flow order_items RLS bug.** Closed by PR 1 once the migration is applied and the smoke test passes. Update CLAUDE.md to mark resolved with reference to this audit.

**Categories RLS violation on fresh-vendor inserts.** Closed by PR 2 once drop-menu.html is on the singleton client and the smoke test passes. The "RLS violation" framing in the original ticket is technically inaccurate — the policy was correct; the JWT-attach was the issue — but the user-facing failure is what gets resolved. Update CLAUDE.md to mark resolved with reference to this audit, noting the actual root cause for posterity.

### Backlog items unaffected by this audit

These three remain on the backlog as filed during the PR 4b verification session. None are addressed here.

**Multiple windows windowCount race condition.** Pre-existing, cosmetic. Siblings created in rapid succession via `handleCreateEventWindows` get the same "Window N" suffix. Fix candidates remain as filed: pass explicit position counter through the loop, or await commit confirmation between iterations. Recommend bundling with the other two multi-window items below into a single Thread B PR.

**Close Orders + Multiple windows duplicative timing UX.** Pre-existing UX issue. Hide parent-level Close Orders when Multiple windows is selected; auto-derive parent `closes_at` from the latest window close.

**Multiple windows discoverability.** Auto-materialise windows on save, or strengthen visual prominence of the Create windows button.

### New backlog items surfaced by this audit

**PR 3 — singleton client swap on remaining five pages.** As detailed in Section 5: home.html, host-view.html, insights.html, order-confirmation.html, service-board.html. Single PR with its own audit, prioritised on service-board.html due to operational risk during live drops. File this against post-PR-2 with a cross-reference to PR-RLS-FIXES-AUDIT.md.

**customer-import.html error handling masks JWT failures.** The catch blocks bucket 401/42501 errors into a generic "X rows could not be imported due to an error" message with no diagnostic detail in console. Fix: log the actual error code and message to console for any error not matching `code === '23505'`; consider surfacing the count of auth-failed rows separately in the user-facing summary if the count is non-zero. Low priority once PR 2 is merged (since the JWT failures should stop happening entirely), but worth doing for resilience against future similar bugs.

**`orders_update_public` permissive policy is a security hole.** Identified during the policy dump. The policy permits both `anon` and `authenticated` to UPDATE any `orders` row with `check_clause = true` and no row filter. Concretely: any anonymous customer can modify any other customer's order. This is a real security issue, not a hypothetical one — anyone who knows or can guess an order ID can change its status, customer info, or any other field. Filing as a separate backlog item because the fix involves designing the right replacement policy (presumably restricting UPDATE to specific fields under specific conditions, e.g., status transitions only, with proper auth checks) and that design work is out of scope for an RLS-bugfix audit. Estimated priority: high, but separate from this PR.

**Operational rule reminders.** From the PR 4b session, several operational rules were added to CLAUDE.md. They remain relevant to PR 1 and PR 2 work and are repeated here for emphasis:

- Hearth has no staging environment (CLAUDE.md rule 13). PR 1 ships to production directly. The rollback SQL must be ready in a scratch tab when applying the migration.
- Mobile chat client may inject markdown link syntax invisibly when filenames are pasted. Workaround: hand-type git commands with file paths rather than copy-paste.
- Per-section commit pattern + fresh chats reduces Claude Code timeout risk on multi-step work.
- Sign-out-and-back-in clears stale vendor state in the browser session. Multiple times during PR 4b verification, switching `?vendor=test-X` URL parameters didn't actually swap vendors because the in-memory state held the previous vendor.
- Netlify deploy previews are the right way to verify pre-merge for PR 2. They are NOT relevant for PR 1 (which is a SQL migration).

---

## Appendix A — Summary of all SQL and code changes

For convenience, a single-page reference of every change this audit proposes.

### PR 1 — SQL migration

```sql
-- Applied to production via Supabase SQL editor.
BEGIN;

DROP POLICY IF EXISTS "Order items: anon insert" ON public.order_items;

CREATE POLICY allow_anonymous_order_items_insert
  ON public.order_items
  FOR INSERT
  TO public
  WITH CHECK (true);

COMMIT;
```

### PR 1 — Rollback SQL

```sql
BEGIN;

DROP POLICY IF EXISTS allow_anonymous_order_items_insert ON public.order_items;

CREATE POLICY "Order items: anon insert"
  ON public.order_items
  FOR INSERT
  TO anon
  WITH CHECK (true);

COMMIT;
```

### PR 2 — drop-menu.html (lines around 3127–3134)

Replace:

```js
if (!window.supabase || !window.supabase.createClient) {
  throw new Error("Supabase library failed to load.");
}
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing Supabase config. Check ./assets/config.js.");
}

supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

With:

```js
if (!window.supabase || !window.supabase.createClient) {
  throw new Error("Supabase library failed to load.");
}
if (typeof window._getHearthClient !== "function") {
  throw new Error("Hearth Supabase singleton helper not available. Check ./assets/hearth-vendor.js or ./assets/config.js.");
}

supabase = window._getHearthClient();
window._hearthSupabase = supabase;
```

### PR 2 — customer-import.html (line around 1066)

Replace:

```js
const sb = window.supabase.createClient(
  window.HEARTH_CONFIG.SUPABASE_URL,
  window.HEARTH_CONFIG.SUPABASE_ANON_KEY
);
```

With:

```js
if (typeof window._getHearthClient !== "function") {
  throw new Error("Hearth Supabase singleton helper not available. Check ./assets/hearth-vendor.js or ./assets/config.js.");
}
const sb = window._getHearthClient();
window._hearthSupabase = sb;
```

---

## Appendix B — Diagnostic SQL reference

Useful queries for verification during testing, kept here for quick reference.

### Check current order_items policies

```sql
SELECT policyname, roles, cmd,
       qual AS using_clause,
       with_check AS check_clause
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'order_items'
ORDER BY policyname;
```

### Check recent customer orders (post-migration smoke test)

```sql
SELECT o.id, o.customer_name, o.total_pence,
       oi.id AS item_id, oi.qty,
       ois.id AS selection_id
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
LEFT JOIN order_item_selections ois ON ois.order_item_id = oi.id
WHERE o.created_at > NOW() - INTERVAL '5 minutes'
ORDER BY o.created_at DESC, oi.id, ois.id;
```

### Check customer_relationships for a vendor (post-import smoke test)

```sql
SELECT c.id, c.name, c.email, c.postcode,
       cr.owner_id, cr.consent_status, cr.source, cr.lawful_basis,
       cr.created_at
FROM customers c
JOIN customer_relationships cr ON cr.customer_id = c.id
WHERE cr.owner_id = '<vendor_id>'
  AND cr.created_at > NOW() - INTERVAL '15 minutes'
ORDER BY cr.created_at DESC;
```

### Check vendor auth linkage (used during investigation)

```sql
SELECT slug, name,
       auth_user_id IS NOT NULL AS has_auth_link,
       stripe_onboarding_complete
FROM vendors
WHERE slug IN ('test-12', 'test-11', 'southbury-farm-pizza')
ORDER BY slug;
```

### Full RLS policy dump (used during investigation)

```sql
SELECT schemaname, tablename, policyname, roles, cmd,
       qual AS using_clause,
       with_check AS check_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'categories', 'order_items', 'orders', 'products', 'bundles',
    'drop_menu_items', 'drops',
    'customers', 'customer_relationships', 'order_item_selections'
  )
ORDER BY tablename, policyname;
```

---

*End of audit.*
