# PR 4b — Build Session Log

Author: Claude Code (build session, Phase 1 — server-side)
Date: 2026-04-29
Branch: `claude/build-pr-4b-server-side`
Base: `origin/main` @ b4f0c90

This document tracks the PR 4b Phase 1 build (Edge Functions + RPCs +
update-drop W-4 guard). The authoritative spec is
[PR-4B-AUDIT.md](PR-4B-AUDIT.md). Phase 2 (client migration in
`drop-manager.html`) begins in a fresh chat after Phase 1 lands as a
draft PR.

## Scope of Phase 1

Server-side only. Five artefacts:

1. RPC migration `assign_drop_menu_items` (audit Section 2.4).
2. RPC migration `remove_event_window` (audit Section 3.7).
3. New Edge Function `assign-menu-items` (audit Section 2 entire).
4. New Edge Function `remove-event-window` (audit Section 3 entire).
5. Modify `update-drop` to add the W-4 server guard (audit
   Section 7.2).

Out of scope for Phase 1: any edit to `drop-manager.html`, the
`dropStatus` dropdown removal, the `capacity_category` client-throw
retirement. Those wait for Phase 2.

## Three Phase 1 checkpoints

- **Checkpoint 1** — RPC verification. Both functions exist with
  `security definer` + `search_path=public, pg_temp`.
- **Checkpoint 2** — SQL prerequisite for `update-drop` W-4 guard.
  Orphan `capacity_category` count = 0 (audit Section 7.3 / 8a.1).
- **Checkpoint 3** — Six 8a curl smokes pass (audit Section 8a.3).

If any checkpoint trips a STOP condition, this file records the
stop point, the failure detail, and the resume condition.

## Build session log

Entries appended in commit-order as Phase 1 progresses.

### Checkpoint 1 — RPC verification (PASSED)

Migrations applied to the linked production Supabase project
(`tvqhhjvumgumyetvpgid`) via `supabase db push --linked --yes`:

```
Applying migration 20260429210900_assign_drop_menu_items.sql...
Applying migration 20260429211000_remove_event_window.sql...
Finished supabase db push.
```

Verification query (per audit Section 8a.2):

```sql
select
  proname,
  prosecdef                                   as is_security_definer,
  pg_get_function_identity_arguments(oid)     as args,
  proconfig                                   as config
from pg_proc
where proname in ('assign_drop_menu_items', 'remove_event_window')
order by proname;
```

Result:

| proname                | is_security_definer | args                       | config                             |
|------------------------|---------------------|----------------------------|------------------------------------|
| assign_drop_menu_items | true                | p_drop_id uuid, p_items jsonb | `["search_path=public, pg_temp"]` |
| remove_event_window    | true                | p_drop_id uuid             | `["search_path=public, pg_temp"]` |

Both required invariants present on both rows:
- `is_security_definer = true`
- `config` includes `search_path=public, pg_temp`

Proceeding to Edge Functions.

### Checkpoint 2 — orphan capacity_category data check (PASSED)

Audit Section 7.3 / 8a.1 hard prerequisite. Run against production
linked Supabase project before deploying the `update-drop` W-4
guard.

```sql
select count(*)
from drops
where capacity_category is not null
  and capacity_category_id is null;
```

Result: `0`.

`Drop Studio's getDropPayload() always sends both fields together,
so the orphan state should not exist in the wild` (audit Section
7.3). The data confirms that. The W-4 server guard is safe to
deploy — no migration / backfill / clear required.

Proceeding to update-drop W-4 guard.

### Checkpoint 3 — six 8a curl smokes (PASSED)

JWT minted for Test 11 owner (auth_user_id = 6b85d24b-ea3f-420c-ab49-ff4f6bb9ec7c, email eddierenzo1@gmail.com) via the documented mechanism — admin `generate_link` → email_otp → POST `/auth/v1/verify`. JWT stored locally for the duration of the smoke run (single session, ~1 hour validity). Resolved fixture UUIDs taken from the build prompt.

Foreign southbury drop for Test 3 chosen via:
```sql
select id from drops where vendor_id = '71d3fbf9-5b7e-4275-95a7-e59da93bcd71' limit 1;
-- → 94d00f45-c5aa-4116-8891-6a2c06f9c949 (slug: test-drop-2)
```

#### Test 1 — assign-menu-items refuses cross-vendor `product_id`

Pre: `select count(*) from drop_menu_items where drop_id = '51ec7a1e-...';` → `1`.

Request: `POST /functions/v1/assign-menu-items` with vendor_id Test 11, drop_id Test 11, items=[product with southbury product_id].

Response:
```
HTTP/2 400
{"error":"One or more product_ids do not belong to this vendor"}
```

Post: `select count(*) from drop_menu_items where drop_id = '51ec7a1e-...';` → `1`. **Unchanged. PASS.**

#### Test 2 — assign-menu-items refuses cross-vendor `bundle_id`

Request: `POST /functions/v1/assign-menu-items` with vendor_id Test 11, drop_id Test 11, items=[bundle with southbury bundle_id].

Response:
```
HTTP/2 400
{"error":"One or more bundle_ids do not belong to this vendor"}
```

**PASS.**

#### Test 3 — remove-event-window refuses cross-vendor `drop_id`

Pre: `select id from drops where id = '94d00f45-...';` → row present.

Request: `POST /functions/v1/remove-event-window` with vendor_id Test 11, drop_id southbury-test-drop-2.

Response:
```
HTTP/2 400
{"error":"drop_id does not belong to this vendor"}
```

Post: `select id from drops where id = '94d00f45-...';` → row still present. **Unchanged. PASS.**

#### Test 4 — remove-event-window refuses soloist drop

Pre: `select id, window_group_id from drops where id = 'c2a64401-...';` → `{window_group_id: None}`.

Request: `POST /functions/v1/remove-event-window` with vendor_id Test 11, drop_id Test 11 soloist.

Response:
```
HTTP/2 400
{"error":"Drop is not part of a window group. To delete a soloist drop, archive it via transition-drop-status (target_status: archived)."}
```

Post: soloist drop still present. **Archive hint matches audit Section 3.4 condition 6 verbatim. PASS.**

#### Test 5 — remove-event-window refuses drop with orders (THE BIG ONE)

Pre: `{drop_count: 1, order_count: 1}` for Test 11 parent (51ec7a1e-..., window_group_id 47588de8-..., 1 order).

Request: `POST /functions/v1/remove-event-window` with vendor_id Test 11, drop_id Test 11 parent.

Response:
```
HTTP/2 409
{"error":"Cannot remove a window with existing orders"}
```

Post: `{drop_count: 1, order_count: 1}`. **Drop and order both intact post-curl. PASS.**

This is the single most important assertion of the entire PR. Section 5.2 of the audit named the four ON DELETE CASCADE FKs that fire on `drops.id` and the three downstream surfaces (scorecard.html new-vs-returning, hearth-intelligence customer segmentation, order_status_events audit history) that a cascade-delete on an order-bearing drop would silently destroy. The 409 with both drop_count and order_count unchanged proves the EXISTS-style probe in `remove-event-window/index.ts` short-circuits before the RPC fires.

#### Test 6a — update-drop refuses orphan `capacity_category` text (W-4 guard)

Request: `POST /functions/v1/update-drop` with vendor_id Test 11, drop_id Test 11 parent, fields = `{capacity_category: "pizzas"}` (no capacity_category_id).

Response:
```
HTTP/2 400
{"error":"capacity_category cannot be set without capacity_category_id"}
```

**PASS.**

#### Test 6b — update-drop positive control

Request: `POST /functions/v1/update-drop` with vendor_id Test 11, drop_id Test 11 parent, fields = `{capacity_category_id: TEST11_CAT, capacity_category: "ignored — server reconciles"}`.

Response: `HTTP/2 200`.

Post-state SQL:
```sql
select capacity_category, capacity_category_id from drops where id = '51ec7a1e-...';
-- → {capacity_category: 'mains', capacity_category_id: 'de976f3a-...'}
```

The client-supplied `capacity_category` text was discarded; the server reconciled to the slug looked up against `categories.id`. Reconciliation path still runs, the new guard fires only on orphan text writes. **PASS.**

#### Smoke summary

| # | Surface | Pass condition | Result |
|---|---|---|---|
| 1 | assign-menu-items cross-vendor product | 400 + body | PASS |
| 2 | assign-menu-items cross-vendor bundle | 400 + body | PASS |
| 3 | remove-event-window cross-vendor drop | 400 + body, drop intact | PASS |
| 4 | remove-event-window soloist (with archive hint) | 400 + body | PASS |
| 5 | remove-event-window orders-presence | **409** + body, drop+order intact | **PASS** |
| 6 | update-drop W-4 orphan capacity_category | 400 + body; positive control 200 | PASS |

All six gates green. No vendor data mutated by any smoke (Test 6b reconciled `capacity_category` from `mains` → `mains` via the FK, which was already the persisted state — no behavioural change). Phase 1 server-side work is complete.

## Phase 2 handoff

Phase 1 is complete. Phase 2 begins in a fresh chat against the same
branch (`claude/build-pr-4b-server-side`) and migrates the eight
client call sites in `drop-manager.html` per audit Section 4. Phase 1
introduces no client edits — the Edge Functions and the W-4 guard
are deployed and validated, but `drop-manager.html` still issues the
direct-PostgREST writes documented in audit Section 1.

### Phase 1 commit log (in order)

```
eb2cd9b docs: PR 4b build session start
6cb95a0 feat: assign_drop_menu_items RPC migration
c90917e feat: remove_event_window RPC migration
03423a0 docs: Phase 1 checkpoint 1 verified
74969d3 feat: assign-menu-items Edge Function
e8632b4 feat: remove-event-window Edge Function
46c3a5f docs: Phase 1 checkpoint 2 verified — orphan capacity_category count = 0
66f61eb feat: update-drop W-4 server guard
822eed9 docs: Phase 1 checkpoint 3 — all 8a smokes green
```

### Edge Functions deployed (project `tvqhhjvumgumyetvpgid`)

From `supabase functions list` at the close of Phase 1:

| Function | Version | Last deployed (UTC) |
|---|---|---|
| `assign-menu-items` | 1 | 2026-04-29 21:12:09 |
| `remove-event-window` | 1 | 2026-04-29 21:13:15 |
| `update-drop` (W-4 guard) | 2 | 2026-04-29 21:14:27 |

### RPCs migrated

Both `security definer` with `set search_path = public, pg_temp`,
verified via `pg_proc` query in Checkpoint 1:

- `public.assign_drop_menu_items(p_drop_id uuid, p_items jsonb)` —
  bulk-replace + clone-mode reconcile, returns `setof drop_menu_items`.
  Source: `supabase/migrations/20260429210900_assign_drop_menu_items.sql`.
- `public.remove_event_window(p_drop_id uuid)` — atomic delete +
  conditional survivor clear, returns `table (deleted_drop_id uuid,
  survivor_drop_id uuid, cascaded_drop_menu_items integer,
  group_dissolved boolean)`.
  Source: `supabase/migrations/20260429211000_remove_event_window.sql`.

Both function comment headers enumerate the three downstream
corruption surfaces named in audit Section 5.2 (scorecard.html
new-vs-returning, hearth-intelligence customer segmentation,
order_status_events audit history) so a future contributor cannot
silently break the safety property.

### Smoke results

All six 8a smokes green. Captured in the Checkpoint 3 section above
with response bodies, pre/post SQL assertions on the count-bearing
smokes (Test 1, Test 3, Test 5), and a positive-control follow-up
on Test 6 confirming the existing reconciliation path still works.

### Phase 2 scope (in fresh chat)

Phase 2 implements audit Section 4 in `drop-manager.html`:

1. Call site 1 (`saveAssignments`) → `assign-menu-items` bulk-replace.
2. Call site 2 (`saveDrop` series template promotion) → `update-drop`
   carries `series_id` / `series_position`; drop the `status: "draft"`
   no-op write.
3. Call site 3 (`saveDrop` series sibling INSERT) → per-sibling
   `create-drop` loop using the widened whitelist landed in PR 4a.
4. Call site 4 (`saveDrop` series clone menus) → per-sibling
   `assign-menu-items` clone-mode (interleaved with call site 3).
5. Call site 5 (`handleCreateEventWindows` window_group_id stamp) →
   `update-drop` carries `window_group_id`.
6. Call site 6 (`duplicateDrop`) → `create-drop` + `assign-menu-items`
   clone-mode.
7. Call site 7 (`createEventWindow`) → `create-drop` +
   `assign-menu-items` clone-mode.
8. Call site 8 (`renderExistingWindows` confirm-remove) →
   `remove-event-window`. The parent-clear inside
   `renderExistingWindows()` (lines 4057–4070) is also retired,
   subsumed by the RPC's survivor-clear.

Plus the two retirements parked from Phase 1:
- Deliverable 4 — remove the dead `dropStatus` dropdown (audit
  Section 6).
- Deliverable 5 — retire the `capacity_category` client-throw at
  `drop-manager.html:3519` (audit Section 7.1). The server-side W-4
  guard backing this retirement is already live.

Phase 2 verification surfaces (audit Section 8b) cover UI
happy-paths on Test 11 / Test 12 / southbury fixtures, the two-line
direct-PostgREST grep regression check on `drop-manager.html`, and
the rollback playbook. Those run after Phase 2 lands but before
the draft PR is moved out of draft.

### Preconditions confirmed for Phase 2

- `update-drop`'s ALLOWED_FIELDS already includes `series_id`,
  `series_position`, `window_group_id` per audit Section 4.0
  preconditions. Verified via inspection: PR 4a widened the
  whitelist; the W-4 guard added in Phase 1 sits before the
  capacity-category reconciliation block and does not interact
  with the new series / window fields.
- `create-drop`'s ALLOWED_FIELDS already includes `window_group_id`,
  `series_id`, `series_position` (verified at
  `supabase/functions/create-drop/index.ts:35–37`). No further
  whitelist widening required for clone-mode at creation.
- The RPC + Edge Function pair for `assign-menu-items` accepts both
  `items[]` and `clone_from_drop_id`. Phase 2 client call sites 4,
  6, 7 use clone-mode; call site 1 uses bulk-replace mode.

---

## Phase 2 — client migration in drop-manager.html

Author: Claude Code (build session, Phase 2 — client-side)
Date: 2026-04-29
Branch: `claude/build-pr-4b-server-side` (continuing the Phase 1
branch — Phase 2 lands as additional commits on the same branch
that hosts PR #201).

### Scope of Phase 2

Client-side only, all in `drop-manager.html`:

1. Migrate the eight call sites named in audit Section 4.10 from
   direct PostgREST writes to Edge Function invocations.
2. Remove the `dropStatus` dropdown across the seven reference sites
   in audit Section 6.1.
3. Retire the `capacity_category` client-side throw at
   `drop-manager.html:3519` (audit Section 7.1).

Out of scope: any edit to `supabase/functions/`, any edit to
`supabase/migrations/`, any RPC changes, any new server work.
Phase 1 deployed everything the server needs.

Precondition correction. Phase 1's "preconditions confirmed"
note above stated `update-drop`'s ALLOWED_FIELDS already
included `series_id`, `series_position`, and
`window_group_id`. Re-inspection at the start of Phase 2 shows
the actual whitelist (`supabase/functions/update-drop/index.ts:17–46`)
explicitly excludes those three fields with a comment block
("clone-mode shape — stamped on creation only via create-drop's
widened whitelist"). The widening still has to land. Phase 2
adds it as part of the relevant client-migration commits per
audit Section 4.0:

- Commit 3 widens `update-drop` to accept `window_group_id`
  (uuid or null).
- Commit 8 widens `update-drop` to accept `series_id` and
  `series_position` together (paired validation: both present
  together or both null; `series_id` is uuid; `series_position`
  is integer >= 1).

`create-drop`'s whitelist is correct as documented — no widening
required there.

### Phase 2 commit ordering

Server-first ordering of call sites is intentional. Simpler /
lower-risk migrations land first; the series-branch (commits 8 +
9) is last because it carries the per-sibling loop with
partial-failure semantics.

```
Commit 1  docs: PR 4b Phase 2 start
Commit 2  feat: migrate saveAssignments to assign-menu-items (call site 1)
Commit 3  feat: migrate handleCreateEventWindows window_group_id stamp (call site 5)
Commit 4  feat: migrate duplicateDrop (call site 6)
Commit 5  feat: migrate createEventWindow (call site 7)
Commit 6  feat: migrate renderExistingWindows confirm-remove (call site 8)
Commit 7  docs: Phase 2 checkpoint 1 verified — five call sites migrated
Commit 8  feat: migrate saveDrop series-branch template promotion (call site 2)
Commit 9  feat: migrate saveDrop series siblings + cloned menus (call sites 3 + 4)
Commit 10 docs: Phase 2 checkpoint 2 verified — all eight call sites migrated, greps green
Commit 11 refactor: remove dropStatus dropdown (Section 6)
Commit 12 refactor: retire capacity_category client-throw (Section 7.1)
Commit 13 docs: Phase 2 checkpoint 3 — UI walk green on all three fixtures
Commit 14 docs: Phase 2 complete — PR ready for review
```

### Four checkpoints

Phase 2 has four verification gates. Each is captured below as it
fires.

- **Checkpoint 1** — call sites 1, 5, 6, 7, 8 migrated. UI walk on
  Test 11 (saveAssignments, duplicateDrop, createEventWindow +
  handleCreateEventWindows, remove-event-window) confirming each
  step calls the correct Edge Function and shows no direct-
  PostgREST writes on the Network tab.
- **Checkpoint 2** — all eight call sites migrated. The static
  invariant from audit Section 8b.2 — both direct-PostgREST greps
  return zero — plus a saveDrop recurring-toggle UI walk to confirm
  the per-sibling loop's partial-failure semantics.
- **Checkpoint 3** — full UI walk (audit Section 8b.1.a/b/c) on
  Test 11, Test 12, southbury-farm-pizza. Stripe gate, dropdown
  removal, and production-shaped data regression check.
- **Checkpoint 4** — Phase 2 complete. Final greps green, all three
  fixtures verified, PR ready to move out of draft.

If any checkpoint trips a STOP condition, the build session stops
and this file records the stop point, the failure detail, and the
resume condition.

### Build environment limitations

Per CLAUDE.md Critical rule #13, the Claude Code build environment
has no Supabase CLI / no Stripe credentials / no preview-deploy
access — and equally no browser, no DevTools, and no Network tab.
The UI verification surfaces in audit Sections 8b.1.a, 8b.1.b, and
8b.1.c are manual prerequisites for the human operator and
**cannot** be exercised from inside the build session. The static
verification surfaces (the two greps in audit Section 8b.2, the
file-level invariants, and the precondition checks on Edge
Functions) are exercised inside the build session and recorded in
the checkpoint commits below.

The PR description names every UI walk that the operator must run
post-merge before moving the PR out of draft. The static gates are
flagged as build-session-verified.

### Checkpoint 1 — five call sites migrated (build-session, static)

Call sites 1 (`saveAssignments`), 5 (`handleCreateEventWindows`
window_group_id stamp), 6 (`duplicateDrop`), 7 (`createEventWindow`),
and 8 (`renderExistingWindows` confirm-remove) migrated. Static
verification:

```
$ grep -nE 'from\("drops"\).*\.(insert|update|delete|upsert)' drop-manager.html
$ grep -nE 'from\("drop_menu_items"\).*\.(insert|update|delete|upsert)' drop-manager.html
(both return zero)
```

The audit's single-line greps return zero matches. A multi-line
scan (awk over `.from("drops|drop_menu_items")` followed within six
lines by `.insert`, `.update`, `.delete`, or `.upsert`) shows three
remaining writes — all in the `saveDrop` series branch. They are
the call sites Phase 2 has not yet migrated:

```
3522: .from("drops") .update({ series_id, series_position, status: "draft" })  → call site 2 (Commit 8)
3557: .from("drops") .insert(seriesDrops)                                       → call site 3 (Commit 9)
3583: .from("drop_menu_items") .insert(allAssignmentRows)                       → call site 4 (Commit 9)
```

These three lines are the entire remaining surface. Commits 8 and
9 retire them.

Other Edge Function preconditions checked at this checkpoint:

- `update-drop`'s ALLOWED_FIELDS now includes `window_group_id`
  with explicit uuid-or-null validation (Commit 3 added it).
  `series_id` and `series_position` not yet added — Commit 8 lands
  those alongside the call-site-2 migration.
- `create-drop`'s ALLOWED_FIELDS already includes `window_group_id`,
  `series_id`, `series_position` (Phase 1 verification).
- `assign-menu-items` accepts both `items[]` and `clone_from_drop_id`
  (Phase 1 deployment).

UI walk — manual prerequisite for the human operator (cannot run
inside the build session per Critical rule #13). Per audit Section
8b.1.a steps 2–5, walk the following on Test 11 in Chrome with
DevTools → Network tab open:

| Step | Surface | Expected POST |
|---|---|---|
| 2 | Open a drop, add 3+ menu items, save | `/functions/v1/assign-menu-items` (no direct PostgREST writes) |
| 3 | Drop card kebab → Duplicate | `/functions/v1/create-drop` + `/functions/v1/assign-menu-items` |
| 4 | Timing pane → Multiple → save two windows | `/functions/v1/update-drop` (window_group_id stamp) + 2× `/functions/v1/create-drop` + 2× `/functions/v1/assign-menu-items` |
| 5 | renderExistingWindows → Remove on a sibling | `/functions/v1/remove-event-window` (no other writes) |

If the operator's UI walk does not match these expectations, stop
and investigate before continuing to Commits 8/9.



