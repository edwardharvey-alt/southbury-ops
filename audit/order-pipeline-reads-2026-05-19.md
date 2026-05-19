# Operator reads of RLS-locked order / customer / host views — audit

**Date:** 2026-05-19
**Workstream framing:** invoker-regression / auth-attach blast-radius
inventory for the order-pipeline read paths (Service Board orders
list, Insights / scorecard order rollups, Customers workspace,
Drop Studio demand preview, Home dashboard recommendations).
**Phase:** READ-ONLY inventory. No code, page, Edge Function,
schema, or config changes. No fix recommendations.
**Reference:** operational learning #52 (operator pages are not
authenticated at the PostgREST layer — every direct PostgREST read
reaches the database as `anon`); operational learning #49 (a
definer view that reads an invoker view runs the child as the
definer's owner, bypassing the child's RLS); T5-A14 audit
(`audit/T5-A14-v_drop_summary-reads-2026-05-19.md`) — the
`v_drop_summary` slice of this surface is already inventoried
there; this audit covers the remaining order-pipeline views and
the direct table reads.

---

## 1. Scope & method

### In-scope RLS-locked tables

Per the T5-A3 reads-audit correction (BACKLOG.md:2598-2603), the
following tables have **NO `anon` SELECT policy**: `orders`,
`order_items`, `order_item_selections`, `customers`,
`customer_relationships`, `hosts`. Any direct PostgREST read of
these tables under the anon-effective publishable-key client
returns zero rows — silently — per operational learning #52.

A read of a `v_*` view that joins to one of these tables is in
the same blast radius unless the view is `security_invoker = off`
(definer) AND its owner has access to the underlying table. Only
`v_drop_summary` is known to be definitely held as definer
(BACKLOG.md:2586-2591); the status of every other order-pipeline
view (`v_drop_orders_summary`, the `v_order_item_detail*` family,
`v_hearth_summary`, `v_hearth_drop_stats`,
`v_hearth_revenue_over_time`, `v_item_sales`,
`v_host_performance`) needs a separate DB check that this audit
explicitly does NOT perform — see §4.

### Grep patterns

```
grep -rn -E "\.from\(['\"](v_|orders|order_items|order_item_selections|customers|customer_relationships|hosts)['\"]" \
  --include="*.html" --include="*.js" . \
  | grep -v node_modules | grep -v "\.claude/"

grep -rn -E "\.from\(['\"]v_" \
  --include="*.html" --include="*.js" . \
  | grep -v node_modules | grep -v "\.claude/"
```

### Files swept

All HTML and JS files in the working tree. `supabase/functions/**`
matches are out of scope (server-side, service-role).
`*.md` matches ignored (audit / docs).

### In / out classification

- **IN SCOPE** — a client-side read in an operator-facing HTML
  page (or shared client JS), of an RLS-locked table OR of a
  view whose join graph touches an RLS-locked table, made via
  the anon-effective publishable-key Supabase client.
- **ALREADY SAFE** — `order.html` (customer-facing; drop reads
  migrated to `v_drop_public`) and `host-view.html` (host-facing;
  migrated to the token-auth `host-view-summary` EF per T5-A3
  host-view sub-track closure 2026-05-19). Listed in §3 with
  any residual hits noted.
- **OUT OF SCOPE** — server-side reads inside
  `supabase/functions/**`; pure write paths;
  `v_drop_summary` reads (covered separately by T5-A14,
  cross-referenced inline in §2 for completeness).

---

## 2. In-scope inventory

**Total in-scope call sites: 23** across 7 operator HTML files.
(`hosts.html` and `host-profile.html` v_drop_summary reads are
counted here for completeness; they are already tracked under
T5-A14.)

### 2.1 Single-table direct reads (RLS-locked tables)

| # | File:line | Table | LIST/SINGLE | Scoping (client-side) | Client | Adjacent to existing `functions.invoke`? |
|---|---|---|---|---|---|---|
| 1 | `customers.html:731` | `customer_relationships` (joined `customers(name,email,postcode,phone)`) | LIST | `.eq('owner_id', state.vendorId).eq('owner_type','vendor')` | inline anon (line 674) | No |
| 2 | `customers.html:748` | `orders` (`customer_email, created_at`) | LIST | `.in('drop_id', vendorDropIds)` where `vendorDropIds` comes from a sibling `drops` SELECT at line 742-745 | inline anon | No |
| 3 | `drop-manager.html:2722` | `customer_relationships` (count, `head: true`) | LIST (count) | `.eq('owner_id', state.vendorId).eq('owner_type','vendor')` | singleton `_getHearthClient()` | No |
| 4 | `drop-manager.html:2947` | `customer_relationships` (`customer_id`) | LIST | `.eq('owner_id', state.vendorId).eq('owner_type','vendor')` | singleton | No (drives the demand-preview loop) |
| 5 | `drop-manager.html:2960` | `customers` (`id, postcode`) | LIST | `.in('id', customerIds)` (from #4) | singleton | No |
| 6 | `home.html:1218` | `customer_relationships` (joined `customers(name,email,postcode,phone)`) | LIST | `.eq('owner_id', vendorId).eq('owner_type','vendor')`, inside `Promise.all` | inline anon (line 1114) | **Yes** — sits in the same `Promise.all` as `functions.invoke('list-drops', ...)` (lines 1213, 1219) |
| 7 | `home.html:1219` | `orders` (`customer_email, created_at`) | LIST | `.in('drop_id', vendorDropIds)` where `vendorDropIds` is sourced inline from a NESTED `functions.invoke('list-drops')` call | inline anon | **Yes** — call already invokes `list-drops` inside itself; the orders read is the natural fold-in target |
| 8 | `insights.html:1099` | `orders` (`id, drop_id, created_at`) | LIST | `.in('drop_id', dropIds)` where `dropIds` comes from `state.allDrops` (sourced via `v_hearth_drop_stats` at line 1083) | inline anon (line 973) | No |
| 9 | `scorecard.html:686` | `orders` (`customer_email, drop_id`) | LIST | `.eq('drop_id', dropId)`, in `Promise.all` | inline anon (line 574) | No (sibling reads are also direct, not EFs) |
| 10 | `scorecard.html:687` | `orders` (`customer_email, drop_id`) | LIST | `.eq('vendor_id', state.vendorId)` — full vendor history for new-vs-returning analysis | inline anon | No |

### 2.2 View reads sourcing RLS-locked tables

#### 2.2.1 `v_drop_summary` (already covered by T5-A14)

Listed for completeness only — closure already tracked under
T5-A14 (audit at `audit/T5-A14-v_drop_summary-reads-2026-05-19.md`).

| # | File:line | View | LIST/SINGLE | Scoping (client-side) | Client | Fold-in candidate? |
|---|---|---|---|---|---|---|
| 11 | `hosts.html:558` | `v_drop_summary` (`drop_id, host_id, order_count`) | LIST | `.eq('vendor_id', state.vendorId)` | inline anon (line 493) | Adjacent to `functions.invoke('list-hosts', ...)` at line 546 — possible fold into a host-stats projection on `list-hosts` |
| 12 | `host-profile.html:1057` | `v_drop_summary` (`*`) | LIST | `.eq('vendor_id', state.vendorId).eq('host_id', state.hostId)` | inline anon (line 747) | No |
| 13 | `service-board.html:1713` | `v_drop_summary` (`*`) | LIST | `.eq('vendor_id', state.vendorId).order('delivery_start', desc)` | inline anon (line 2395) | No |
| 14 | `service-board.html:1824` | `v_drop_summary` (`*`) | SINGLE | `.eq('drop_id', state.selectedDropId).single()` — no vendor filter on query; assertion post-fetch | inline anon | **Yes** — sits in the same `Promise.all` as `functions.invoke('get-drop', ...)` at line 1823 |
| 15 | `scorecard.html:665` | `v_drop_summary` (`*`) | SINGLE | `.eq('drop_id', dropId).maybeSingle()` — no vendor filter on query; assertion post-fetch (line 676) | inline anon | No |
| 16 | `drop-manager.html:2781` | `v_drop_summary` (`*`) | LIST | `.eq('vendor_id', state.vendorId)` | singleton (line 6448) | No |
| 17 | `drop-manager.html:3057` | `v_drop_summary` (`*`) | SINGLE | `.eq('drop_id', state.selectedDropId).eq('vendor_id', state.vendorId).maybeSingle()` | singleton | **Yes** — sits in the same `Promise.all` as `functions.invoke('get-drop', ...)` |

#### 2.2.2 Service Board order-list / item-detail views

These are the two views the framing called out as **confirmed-broken
candidates** (`v_order_item_detail_expanded`,
`v_drop_orders_summary`). Both join to `orders` / `order_items` /
`order_item_selections`; their security_invoker status is **not
verified by this audit** (see §4 surprise #1).

| # | File:line | View | LIST/SINGLE | Scoping (client-side) | Client | Fold-in candidate? |
|---|---|---|---|---|---|---|
| 18 | `service-board.html:1780` | `v_order_item_detail_expanded` (`*`) | LIST | `.eq('drop_id', dropId).order('created_at', asc)` | inline anon | Inside `loadExpandedOrderDetails()` — called from the `Promise.all` at line 1822-1827 alongside `functions.invoke('get-drop', ...)`. **Fold-in candidate** if the new EF returns expanded item detail too. |
| 19 | `service-board.html:1792` | `v_order_item_detail_v2` (`*`) | LIST | same as #18 — **fallback** when expanded view errors | inline anon | Same fold-in as #18 |
| 20 | `service-board.html:1804` | `v_order_item_detail` (`*`) | LIST | same as #18 — **legacy fallback** when v2 errors | inline anon | Same fold-in as #18 |
| 21 | `service-board.html:1825` | `v_drop_orders_summary` (`*`) | LIST | `.eq('drop_id', state.selectedDropId).order('created_at', asc)` | inline anon | **Yes** — sits in the same `Promise.all` as `functions.invoke('get-drop', ...)` at line 1823 |

#### 2.2.3 Hearth / Insights aggregate views

Each of these joins to `orders` and/or `order_items` and/or
`hosts`. As with §2.2.2, security_invoker status is **not
verified** here.

| # | File:line | View | LIST/SINGLE | Scoping (client-side) | Client | Fold-in candidate? |
|---|---|---|---|---|---|---|
| 22 | `home.html:1216` | `v_hearth_summary` (`*`) | SINGLE | `.eq('vendor_id', vendorId).maybeSingle()`, in `Promise.all` | inline anon | **Yes** — same Promise.all as `list-drops` invoke (item #6, #7) |
| 23 | `home.html:1217` | `v_hearth_drop_stats` (`*`) | LIST | `.eq('vendor_id', vendorId).order('delivery_start', desc)`, in `Promise.all` | inline anon | **Yes** — same Promise.all |
| 24 | `home.html:1220` | `v_item_sales` (`*`) | LIST | `.eq('vendor_id', vendorId)`, in `Promise.all` | inline anon | **Yes** — same Promise.all |
| 25 | `home.html:1221` | `v_host_performance` (`*`) | LIST | `.eq('vendor_id', vendorId)`, in `Promise.all` | inline anon | **Yes** — same Promise.all |
| 26 | `customers.html:830` | `v_hearth_drop_stats` (`*`) | LIST | `.eq('vendor_id', state.vendorId)`, in `Promise.all` | inline anon | No |
| 27 | `customers.html:831` | `v_item_sales` (`*`) | LIST | `.eq('vendor_id', state.vendorId)` | inline anon | No |
| 28 | `customers.html:832` | `v_host_performance` (`*`) | LIST | `.eq('vendor_id', state.vendorId)` | inline anon | No |
| 29 | `scorecard.html:685` | `v_item_sales` (`*`) | LIST | `.eq('drop_id', dropId)`, in `Promise.all` with items #9 + #10 | inline anon | No |
| 30 | `insights.html:1083` | `v_hearth_drop_stats` (`*`) | LIST | `.eq('vendor_id', vendorId).order('delivery_start', desc)`, paged via `fetchAllPages`, in `Promise.all` | inline anon | No |
| 31 | `insights.html:1084` | `v_hearth_revenue_over_time` (`*`) | LIST | `.eq('vendor_id', vendorId).order('order_date', asc)` | inline anon | No |
| 32 | `insights.html:1085` | `v_item_sales` (`*`) | LIST | `.eq('vendor_id', vendorId)` | inline anon | No |
| 33 | `insights.html:1086` | `v_host_performance` (`*`) | LIST | `.eq('vendor_id', vendorId)` | inline anon | No |

**Tally:** 33 in-scope sites total. Of these, **7 (excluding the T5-A14
duplicates)** sit adjacent to an existing `functions.invoke` and are
natural fold-in candidates: items #6, #7, #18, #21, #22, #23, #24, #25
(actually 8 — see §4). Counting items already covered by T5-A14 brings
the total Promise.all-adjacent count to 10 (adds #14, #17).

---

## 3. Already-safe / out-of-scope page-level hits

### `order.html` (customer-facing — listed for completeness)

- `order.html:2377`, `:3738`, `:4050` — `v_drop_public` reads.
  Migrated (T5-A3). Out of scope.
- `order.html:2396` — **direct read of `hosts`**
  (`.eq('id', state.drop.host_id).single()`). NOT covered by the
  `v_drop_public` migration. Per operational learning #52 + the
  T5-A3 finding that `hosts` carries NO anon SELECT policy, this
  read returns zero rows for anonymous customers — the page wraps
  it in `if (!hostRes.error)` and the host display gracefully
  degrades. Flagged here for visibility; out of scope for the
  operator-read closure but a candidate to fold into the customer
  drop-fetch EF when one is built (no such EF exists today —
  `order.html` reads drop from `v_drop_public` directly).
  Listed under §4 surprise #4.

### `host-view.html` (host-facing — listed for completeness)

Grep found **zero** `v_*` / `orders` / `order_items` /
`order_item_selections` / `customers` / `customer_relationships` /
`hosts` references in `host-view.html`. Migrated (T5-A3 host-view
sub-track, 2026-05-19) to the token-auth `host-view-summary` EF.
Clean.

### Customer-import page

- `customer-import.html` — already migrated to the
  `bulk-create-customers` EF (T-ops-rls-customer-import, closed
  2026-05-15). Grep produced no direct reads of the in-scope
  tables in this file. Out of scope.

### Service Board mutation paths

- `service-board.html` writes against `orders` and
  `order_status_events` are already routed through the
  `transition-order-status` EF (T-ops-rls-fix, closed 2026-05-15).
  Out of audit scope (this is a reads-only audit) but listed so
  the reader sees that the mutation path of this page is closed
  while the **read path is still open** (items #18-#21).

---

## 4. Surprises / fold-in opportunities

1. **The security_invoker status of seven order-pipeline views
   is unverified by this audit.** T5-A3 closure named "all 34
   vendor-scoped `v_*` views" as flipped to invoker, but did not
   enumerate them in the available artefacts. The following are
   load-bearing on operator pages today and need an explicit DB
   check before the fix design is scoped:
   `v_drop_orders_summary`, `v_order_item_detail`,
   `v_order_item_detail_v2`, `v_order_item_detail_expanded`,
   `v_hearth_summary`, `v_hearth_drop_stats`,
   `v_hearth_revenue_over_time`, `v_item_sales`,
   `v_host_performance`. Two prior-art shapes:
   (a) invoker → these are silently empty in production today and
   every Service Board / Insights / customers / scorecard / home
   surface reading them is broken-but-unflagged;
   (b) definer → they currently work because the definer's owner
   sees the underlying tables, and the eventual closure will need
   to either flip them and migrate (mirroring T5-A14's shape for
   `v_drop_summary`) or refit them inside an EF.
   This is the single most important pre-fix question — the
   audit's framing of `v_order_item_detail_expanded` and
   `v_drop_orders_summary` as "confirmed-broken views" implies (a),
   but the codebase contains no fallback chain anywhere except for
   the three-step `loadExpandedOrderDetails()` (items #18→#19→#20),
   which catches errors but not silent-empty results. If (a) is the
   actual state, every operator visiting Service Board on
   production sees an empty orders list — which they evidently do
   not (the page is in daily use). **High-confidence first
   investigation step for any follow-up ticket.**

2. **Service Board orders surface is the densest fold-in
   opportunity.** Items #14 (`v_drop_summary`, T5-A14), #21
   (`v_drop_orders_summary`), and #18 (`v_order_item_detail_expanded`,
   called from `loadExpandedOrderDetails`) are all four siblings
   inside the same `Promise.all` at `service-board.html:1822-1827`,
   and that Promise.all already invokes
   `functions.invoke('get-drop', ...)`. The natural shape for
   closure is one extension to `get-drop` (or one new EF) that
   returns drop + summary + orders summary + expanded item detail
   in a single envelope, replacing four parallel direct PostgREST
   reads with one EF invoke.

3. **Home dashboard `Promise.all` is similarly dense.** Items #6,
   #7, #22, #23, #24, #25 (six in-scope sites) all sit in the
   same `Promise.all` at `home.html:1212-1222` and already invoke
   `list-drops` twice inside it. If a `get-home-dashboard` EF were
   built, every order-pipeline read on the page would close in
   one rewire. The two `list-drops` invokes inside the Promise.all
   are themselves a fold-in opportunity — `home.html:1219`
   nests a `list-drops` call inside the `orders` read just to
   build the `vendorDropIds` filter, redundantly with the outer
   `list-drops` invoke at `home.html:1213`.

4. **`order.html:2396` reads `hosts` directly under anon —
   silently degraded today.** Customer page, out of operator-audit
   scope, but worth flagging: the host display on the order page
   is currently a best-effort render that returns empty for every
   anonymous customer because `hosts` has no anon SELECT. Closure
   shape would either (a) widen `v_drop_public` to surface the
   joined host metadata (cheapest), or (b) add a new
   `get-host-public` token-auth EF mirroring `host-view-summary`.

5. **`scorecard.html:687` pulls the vendor's full orders history
   for every scorecard load** — `.eq('vendor_id', state.vendorId)`
   with no date filter, just to drive the new-vs-returning split
   at `scorecard.html:692-728`. Unrelated to the closure framing
   but a payload-size concern at vendor scale; flag for an
   eventual EF design (server-side aggregation rather than
   shipping every order to the client).

6. **`drop-manager.html` demand preview makes three reads
   (`customer_relationships`, `customers`, plus the historical
   drops from `v_drop_summary`) per outward-postcode keystroke.**
   Items #4 + #5 together build a per-vendor customer map just
   to count customers in one outward code. Closure could collapse
   this into a single `get-demand-preview` EF; or the cleaner
   shape might be to fold the postcode count into the existing
   `list-drops` summary projection (T5-A14 candidate). Calls out a
   payload-size + N+1 issue alongside the RLS one.

7. **The three-step `loadExpandedOrderDetails()` fallback chain
   (items #18 → #19 → #20)** suggests prior schema migration anxiety
   around the `v_order_item_detail*` views. Once the closure EF is
   built, the fallback chain can collapse into the EF itself
   (server-side fallback) or be eliminated if v_order_item_detail
   and v_order_item_detail_v2 are confirmed retired.

8. **No exceptions / unclear hits.** Every grep hit classified
   cleanly into the inventory or the already-safe section.

---

## 5. BACKLOG.md / CLAUDE.md findings

### Existing tickets touching this surface

- **T5-A3** (RLS rewrite — partial; BACKLOG.md:2472-2606) — names
  the broader workstream. Section A correction explicitly notes
  that `orders`, `order_items`, `order_item_selections`,
  `customers`, `customer_relationships`, `hosts` carry NO anon
  SELECT policy (BACKLOG.md:2598-2603) — meaning every operator
  read of these tables under the anon-effective client should be
  silent-empty unless going through a definer view. T5-A3's framing
  is that the operator-read robustness "depends on the separate
  auth-attach workstream, not on any policy T5-A3 changes" — i.e.
  T5-A3 considers these out of its confidentiality scope but
  acknowledges them as a separate workstream's problem.
- **T5-A14** (`v_drop_summary` closure; BACKLOG.md:2686-2769) —
  in flight. Phase A audit produced
  (`audit/T5-A14-v_drop_summary-reads-2026-05-19.md`); Phase B
  slice 1 already shipped (commit `3b064fc`: `get-drop`
  additively returns the owned drop's `v_drop_summary` row). The
  same EF-migration pattern is the canonical move for everything
  in this audit.
- **T-ops-rls-reads-audit** (BACKLOG.md:492-504) — open. "A
  separate audit of SELECT paths on RLS-protected tables to
  identify silent filtering candidates (Variant 3 failure mode in
  operational learning #14). Deferred — addressable during T5-A
  auth migration." Cross-references operational learning #14
  (auth-not-attached symptom). **This document is the first
  concrete inventory of that ticket's scope** for the
  order/customer/host slice, and could be filed as its Phase A.
- **T-ops-rls-fix** (BACKLOG.md:441-451, closed 2026-05-15) —
  closed the Service Board status-transition WRITE path via
  `transition-order-status`. The matching READ path
  (items #18-#21 in this audit) was never inventoried as part of
  that workstream — the audit at `audit/T-ops-rls-audit-2026-05-14.md`
  is reads-out-of-scope per BACKLOG.md:498.
- **T-ops-rls-customer-import** (BACKLOG.md:453-476, closed
  2026-05-15) — closed `customer-import.html`'s reads+writes via
  the `bulk-create-customers` EF. Established the EF pattern
  used by every closure in this audit's surface.

### CLAUDE.md "Production mutation/read status" — order-read lines verbatim

The status section (CLAUDE.md:1331) documents the **write** path
explicitly:

> Service Board order status transitions (`orders.status` UPDATE
> and `order_status_events` INSERT) — WORKING via
> `transition-order-status` Edge Function as of 2026-05-15.
> (…) Previously broken silently — direct PATCH from anonymous
> service-board.html returned 204 with zero rows affected
> because the `orders` RLS policies require `auth.uid()` to
> match `vendors.auth_user_id`. The bug was undiscoverable by
> routine testing because the optimistic UI showed success and
> the post-commit `refreshData()` re-fetched stale data that
> masked the failure on page reload.

There is **no corresponding entry for the Service Board ORDERS
READ path** — neither for `v_drop_orders_summary` nor for the
`v_order_item_detail*` chain. CLAUDE.md is silent on the
read-side state of these surfaces. If the underlying views are
invoker (§4 surprise #1), the page would be silently empty in
the same way the transitions were silently no-ops, with the
same UI-makes-it-undiscoverable property. If the underlying views
are still definer, the reads work today but are part of the same
closure path as `v_drop_summary` (T5-A14). Either way, the gap
in CLAUDE.md is itself a finding.

Same gap for the Insights / scorecard / home / customers
aggregate-view reads (items #22-#33): CLAUDE.md documents
neither working nor broken state for any of them.

---

End of audit.
