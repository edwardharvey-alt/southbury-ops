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

