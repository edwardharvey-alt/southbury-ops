> **SUPERSEDED — 2026-06-29.** T5-A14 was subsumed by the operator-read-auth
> track (✓ COMPLETE 2026-06-27; `v_drop_summary` and `drop_capacity` REVOKEd
> from anon). This is a historical point-in-time audit artefact, retained for
> the record. For current state see the "View security model" section of
> CLAUDE.md and the BACKLOG.md operator-read-auth narrative.

# T5-A14 Phase A — `v_drop_summary` operator-read audit

**Date:** 2026-05-19
**Workstream:** T5-A14 (`v_drop_summary` closure — migrate operator
reads to JWT-authenticated Edge Functions, then `REVOKE SELECT ON
v_drop_summary FROM anon`).
**Phase:** A — READ-ONLY inventory. No code, page, Edge Function,
schema, or config changes.
**Reference:** operational learning #52 (load-bearing: operator pages
are not authenticated at the PostgREST layer; the previously planned
`security_invoker` flip is abandoned; closure now requires JWT-auth EF
migration + revoke).

---

## 1. Scope & method

### Grep patterns

```
grep -rn "v_drop_summary" . --include="*.html" --include="*.js" \
  | grep -v node_modules
grep -rn "v_drop_summary" supabase/functions
```

### Files swept

All HTML and JS files in the working tree (operator pages, customer
pages, host pages, shared assets); `supabase/functions/**` swept
separately for classification only. `*.md` matches ignored (audit
artefacts / documentation are not reads).

### In/out classification rule

- **IN SCOPE** — a client-side read of `v_drop_summary` in an
  operator-facing HTML page (or shared client JS), made via a
  publishable-key (anon-effective) Supabase client. Per operational
  learning #52, every such read reaches the database as the `anon`
  role regardless of session state.
- **OUT OF SCOPE** — server-side reads inside
  `supabase/functions/**` (run with service-role and are
  structurally unaffected by the eventual `REVOKE SELECT FROM
  anon`; the post-REVOKE end state depends on them continuing).
  Already-migrated pages (`host-view.html` — T5-A3 host-view
  sub-track; `order.html` — `v_drop_public`).
- **UNCLEAR** — flagged for discussion.

---

## 2. In-scope inventory

**Total in-scope call sites: 7** (5 files).

### 2.1 `hosts.html:558` — Host Directory drop stats per host

- **File / line:** `hosts.html:554-572` (call at line 558).
- **Feature / UX:** Host Directory cards. Aggregates per-host
  drop count and total order count to populate the "Drops with
  you" / "Total orders" stats on each host card.
- **`.select(...)` verbatim:** `'drop_id, host_id, order_count'`.
- **Consumed columns:** `drop_id`, `host_id`, `order_count`
  (explicit, all three consumed in the immediate aggregation loop
  at lines 564-570). Fully traced.
- **Scoping / filter chain:**
  `.eq('vendor_id', state.vendorId)`. No `.order()`,
  no `.in()`, no `.single()`/`.maybeSingle()`. LIST read.
- **Scoping key:** `vendor_id` (LIST).
- **Auth posture:** `const sb =
  supabase.createClient(CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_ANON_KEY)` at `hosts.html:493`. Inline
  publishable-key client — anon-effective per #52.

### 2.2 `service-board.html:1713` — Service Board drop selector list

- **File / line:** `service-board.html:1711-1734` (call at line
  1713).
- **Feature / UX:** Powers the drop selector / hero state on
  Service Board. The full list is read, sorted, and used to
  pick the currently-selected drop (with a "live" preference)
  and to drive `renderDropSelect()`.
- **`.select(...)` verbatim:** `'*'`.
- **Consumed columns (best-effort, not exhaustively traced):**
  observed in the immediate window — `drop_id`, `status`,
  `delivery_start`. The result is stored in `state.drops` and
  consumed widely across the page; full row acceptable per
  Phase B scope guidance.
- **Scoping / filter chain:**
  `.eq('vendor_id', state.vendorId).order('delivery_start',
  { ascending: false })`. LIST read.
- **Scoping key:** `vendor_id` (LIST).
- **Auth posture:** `supabase = window.supabase.createClient(
  SUPABASE_URL, SUPABASE_ANON_KEY)` at
  `service-board.html:2395`. Inline publishable-key client —
  anon-effective per #52.

### 2.3 `service-board.html:1824` — Service Board selected-drop summary

- **File / line:** `service-board.html:1822-1869` (call at line
  1824, sits inside `Promise.all`).
- **Feature / UX:** Hydrates the selected drop's KPI / capacity
  panel and queue chrome (`state.dropSummary`). Read in
  parallel with `get-drop` (already a JWT-auth EF), the orders
  summary view, and the expanded item detail view.
- **`.select(...)` verbatim:** `'*'`.
- **Consumed columns (best-effort, not exhaustively traced):**
  `capacity_units_used`, `capacity_units_total`,
  `capacity_units_remaining`, `capacity_category`,
  `capacity_category_name`, `capacity_category_id`,
  `drop_name`, `status`, `vendor_name` (observed via
  `state.dropSummary.*` references in `renderHeader` /
  `renderQueue` / `getCapacityCategoryLabel` /
  receipt header). Full row acceptable per Phase B scope.
- **Scoping / filter chain:**
  `.eq('drop_id', state.selectedDropId).single()`. SINGLE-row
  read. NO `vendor_id` filter — relies on the sibling
  `get-drop` invoke (line 1823) and the explicit
  `dropData.vendor_id !== state.vendorId` assertion (line
  1852) for vendor isolation.
- **Scoping key:** `drop_id` (SINGLE).
- **Auth posture:** same inline anon-effective client as 2.2.

### 2.4 `host-profile.html:1057` — Host Profile drop history table

- **File / line:** `host-profile.html:1050-1107` (call at line
  1057).
- **Feature / UX:** Host Profile "History" tab. Renders the
  per-host drop history table (Drop Name / Date / Orders /
  Revenue / Capacity Fill %) and a totals row.
- **`.select(...)` verbatim:** `'*'`.
- **Consumed columns (best-effort, observed in
  `host-profile.html:1081-1095`):** `delivery_start`,
  `drop_date`, `name`, `drop_name`, `order_count`,
  `total_revenue_pence`, `revenue_pence`,
  `capacity_units_total`, `capacity_units_used`. Plus the
  filter columns `vendor_id`, `host_id`. Not exhaustively
  traced.
- **Scoping / filter chain:**
  `.eq('vendor_id', state.vendorId).eq('host_id',
  state.hostId)`. LIST read. No `.order()` (sort happens
  client-side post-fetch); no terminator (`.single()` /
  `.maybeSingle()`).
- **Scoping key:** `vendor_id` + `host_id` (LIST). Closest in
  shape to a "list this vendor's drops at this host" query.
- **Auth posture:** `var _sb = supabase.createClient(
  window.HEARTH_CONFIG.SUPABASE_URL,
  window.HEARTH_CONFIG.SUPABASE_ANON_KEY)` at
  `host-profile.html:747`. Inline publishable-key client —
  anon-effective per #52.
- **Note:** the code contains a defensive branch (lines
  1062-1069) that catches `host_id` column-not-found errors
  and surfaces "Drop history by host is not yet available."
  Suggests schema uncertainty when this was written; worth
  confirming `v_drop_summary.host_id` is present today during
  Phase B design.

### 2.5 `scorecard.html:665` — Post-drop scorecard hydration

- **File / line:** `scorecard.html:663-681` (call at line 665).
- **Feature / UX:** Per-drop scorecard page. Single fetch of
  the drop summary that feeds the entire KPI panel; followed
  by parallel reads of `v_item_sales` and `orders` for
  new-vs-returning analysis.
- **`.select(...)` verbatim:** `'*'`.
- **Consumed columns:** not exhaustively traced. Stored as
  `state.drop` and consumed across the page. Full row
  acceptable per Phase B scope.
- **Scoping / filter chain:**
  `.eq('drop_id', dropId).maybeSingle()`. SINGLE-row read. NO
  `vendor_id` filter on the query; vendor-isolation assertion
  is post-fetch (line 676): `if (dropData.vendor_id !==
  state.vendorId)`.
- **Scoping key:** `drop_id` (SINGLE).
- **Auth posture:** `const sb = supabase.createClient(...)` at
  `scorecard.html:574`. Inline publishable-key client —
  anon-effective per #52.

### 2.6 `drop-manager.html:2781` — Drop Studio drops list

- **File / line:** `drop-manager.html:2779-2797` (call at line
  2781).
- **Feature / UX:** Drop Studio drops list / cards. Stored as
  `state.drops`, sorted client-side by status priority then
  delivery time, used to drive the drop list and select the
  current drop id when the cached one is missing.
- **`.select(...)` verbatim:** `'*'`.
- **Consumed columns (best-effort, observed via greps for
  `d.*` accessors on `state.drops`):** `drop_id`, `status`,
  `delivery_start`, `order_count`, `host_id`. Plus full row
  consumption in the form-populate path (`populateForm(d)` at
  line 3551 — name, delivery_area_description,
  delivery_area_type, capacity_driver, capacity_categories,
  capacity_units_total, etc.). Not exhaustively traced.
- **Scoping / filter chain:**
  `.eq('vendor_id', state.vendorId)`. No `.order()` (sort
  happens client-side post-fetch); LIST read.
- **Scoping key:** `vendor_id` (LIST).
- **Auth posture:** `supabase = window._getHearthClient()` at
  `drop-manager.html:6448`. The shared singleton in
  `assets/config.js` manually attaches an `Authorization`
  header (operational learning #14). Per operational learning
  #52, this does NOT in practice deliver a user JWT honoured
  by PostgREST for direct table/view reads — the read
  reaches the database as `anon`. Recorded here as the
  client pattern, not as a real auth difference.

### 2.7 `drop-manager.html:3057` — Drop Studio selected-drop summary

- **File / line:** `drop-manager.html:3054-3113` (call at line
  3057, sits inside `Promise.all`).
- **Feature / UX:** Hydrates the selected drop's summary panel
  (`state.selectedDropSummary`). Read in parallel with
  `get-drop` (already JWT-auth EF), `v_drop_readiness_v2`,
  `drop_menu_items`, `v_drop_menu_item_stock`.
- **`.select(...)` verbatim:** `'*'`.
- **Consumed columns (best-effort):** `order_count` (line
  2625 — `<span class="miniChip">${Number(state
  .selectedDropSummary.order_count || 0)} orders</span>`).
  Not exhaustively traced.
- **Scoping / filter chain:**
  `.eq('drop_id', state.selectedDropId).eq('vendor_id',
  state.vendorId).maybeSingle()`. SINGLE-row read. Belt-and-
  braces vendor scoping is already on the query (line 3057)
  AND a post-fetch assertion (line 3096).
- **Scoping key:** `drop_id` + `vendor_id` (SINGLE).
- **Auth posture:** same singleton client as 2.6.

---

## 3. Out-of-scope references

### Server-side reads inside `supabase/functions/**`

These run with service-role and are unaffected by the eventual
`REVOKE SELECT ON v_drop_summary FROM anon`. They are the post-
REVOKE end state and must keep working.

- `supabase/functions/host-view-summary/index.ts:101` — the
  T5-A3 host-view sub-track Edge Function. Reads
  `v_drop_summary` server-side under service-role, returns
  the 18-field minimal host projection.
- `supabase/functions/create-order/index.ts:223-250` —
  customer order creation. Reads `v_drop_summary` server-side
  under service-role to validate the drop, capacity, and
  fulfilment posture before creating a Stripe Checkout
  Session.

### Already-migrated pages

- **`host-view.html` — NO `v_drop_summary` references.**
  Confirmed clean. The grep across `*.html` / `*.js`
  produced zero matches in this file. Migrated to
  `host-view-summary` Edge Function per T5-A3 host-view
  sub-track closure (2026-05-19). No regression.
- **`order.html` — NO `v_drop_summary` reads.** One stale
  COMMENT remains at `order.html:4047` ("Fetch capacity data
  for each sibling from v_drop_summary"); the actual `.from(
  "v_drop_public")` call on the next line (4050) is the
  migrated path. Doc hygiene only — not a regression.

### Doc-only mentions (not reads)

- `drop-manager.html:4473` — comment ("Legacy fields kept in
  sync for v_drop_summary compatibility.") inside the save
  payload builder. Not a read.
- `host-profile.html:1063` and `host-profile.html:1091` —
  inline comments around the call site at line 1057. Not
  separate reads.

---

## 4. Consumed-column union

Best-effort. The Phase B EFs will be JWT-authenticated and
vendor-scoped, so returning an operator their own vendor's full
`v_drop_summary` row is acceptable. The union below is informative
input for selecting projections; it is NOT a contract.

### 4.1 LIST-context reads (`vendor_id`-scoped, many rows)

Sites: 2.1, 2.2, 2.4, 2.6.

Union of observed columns:

- `drop_id`
- `host_id`
- `order_count`
- `status`
- `delivery_start`
- `delivery_end` (likely — implied by `populateForm` path)
- `name` / `drop_name`
- `drop_date`
- `total_revenue_pence` / `revenue_pence`
- `capacity_units_total`
- `capacity_units_used`
- `capacity_driver`
- `capacity_categories`
- `capacity_category` / `capacity_category_name` /
  `capacity_category_id`
- `delivery_area_description`
- `delivery_area_type`
- (additional fields consumed in `populateForm` not exhaustively
  traced)

Note: `hosts.html:558` is the only LIST site with an explicit
column list (`'drop_id, host_id, order_count'`). The other three
LIST sites use `select('*')`.

### 4.2 SINGLE-drop reads (`drop_id` / slug-scoped, one row)

Sites: 2.3, 2.5, 2.7.

Union of observed columns (best-effort; full row acceptable):

- `drop_id` (filter)
- `vendor_id` (for post-fetch isolation assertion)
- `drop_name`
- `name`
- `status`
- `vendor_name`
- `order_count`
- `capacity_units_used` / `capacity_units_total` /
  `capacity_units_remaining`
- `capacity_category` / `capacity_category_name` /
  `capacity_category_id`
- (full row consumed across scorecard.html / service-board
  rendering paths; not exhaustively traced)

---

## 5. Scoping-key breakdown

| Scoping key | Sites | List/Single | Files |
|---|---|---|---|
| `vendor_id` (LIST) | 3 | LIST | `hosts.html:558`, `service-board.html:1713`, `drop-manager.html:2781` |
| `vendor_id` + `host_id` (LIST) | 1 | LIST | `host-profile.html:1057` |
| `drop_id` (SINGLE) | 2 | SINGLE | `service-board.html:1824`, `scorecard.html:665` |
| `drop_id` + `vendor_id` (SINGLE) | 1 | SINGLE | `drop-manager.html:3057` |
| slug (SINGLE) | 0 | — | — |
| other | 0 | — | — |

**LIST sites:** 4. **SINGLE-row sites:** 3.

### Exceptions / non-anon-effective sites

None. All 7 in-scope sites are direct PostgREST reads via a
publishable-key client (inline `supabase.createClient(...)` on
five sites; the shared `window._getHearthClient()` singleton on
the two `drop-manager.html` sites). Per operational learning #52,
all seven reach the database as `anon`. No call site is already
routed through `functions.invoke`.

The two `drop-manager.html` sites do use the singleton with the
manual Authorization-header attach (operational learning #14),
but this does not produce a JWT-authenticated PostgREST read in
practice (#52). They are listed in the inventory with their
client pattern for accuracy; they are NOT exceptions to the
anon-at-DB story.

---

## 6. Discrepancies & surprises

### Count vs the "~7 sites" prior estimate

Actual in-scope count: **7**. Matches the prior estimate
exactly. No discrepancy.

### UNCLEAR hits

None — every grep hit classified cleanly.

### Surprises worth flagging

1. **`service-board.html:1824` and `drop-manager.html:3057`
   sit inside `Promise.all` calls that already invoke
   `get-drop` (JWT-auth EF).** Two of the three SINGLE-row
   reads are already adjacent to the canonical secured-read
   pattern — the natural Phase B shape is to fold the summary
   projection into `get-drop` and remove the parallel direct
   read, rather than build a new EF.
2. **`host-profile.html:1057` has a defensive branch
   (lines 1062-1069) that catches a `host_id` column-not-found
   error.** Suggests schema uncertainty when the page was
   written. `v_drop_summary.host_id` should be confirmed
   present today during Phase B design — if it is, the branch
   can be removed during the migration; if not, the Phase B
   EF must derive `host_id` from the underlying `drops` row.
3. **Three of the four LIST sites use `select('*')`** —
   `service-board.html:1713`, `host-profile.html:1057`,
   `drop-manager.html:2781`. Only `hosts.html:558` uses an
   explicit column list. The full-row payload is currently
   relied upon (especially by `drop-manager.html`'s
   `populateForm` path), so the Phase B `list-drops`
   extension should return the full row by default rather
   than try to thread a column-selector argument through every
   call site.
4. **`scorecard.html:665` and `service-board.html:1824` query
   `v_drop_summary` by `drop_id` only — no vendor scoping on
   the query itself.** Both pages assert `vendor_id` match
   post-fetch. Under the current anon-effective path this is
   fine because `v_drop_summary` is publicly readable and
   client-side scoping does the work; after T5-A14 closure
   (REVOKE FROM anon), the Phase B EF MUST do the vendor-
   scoping server-side via the JWT — these two sites cannot
   keep the "fetch by drop_id, assert later" pattern.
5. **`order.html:4047` carries a stale comment referring to
   `v_drop_summary` while the actual call on the next line is
   `v_drop_public`.** Doc hygiene only; flagged here to avoid
   noise in future grep sweeps. Out of scope for T5-A14.

---

## 7. Preliminary Phase B grouping (NON-binding)

First-pass suggestion only. Input for chat review, NOT a
decision. The choice between extending `get-drop` /
`list-drops` versus standing up new EFs is a Phase B design
call.

### Extend `list-drops` (vendor_id-list)

- 2.1 `hosts.html:558` — explicit 3-column projection;
  could be served by the existing `list-drops` summary
  projection or by a tiny dedicated stats EF.
- 2.2 `service-board.html:1713` — full-row, vendor_id-only.
- 2.6 `drop-manager.html:2781` — full-row, vendor_id-only.

### Special case (extend `list-drops` with `host_id` filter, OR build dedicated EF)

- 2.4 `host-profile.html:1057` — full-row, vendor_id +
  host_id. Either: (a) extend `list-drops` with an optional
  `host_id` argument, or (b) build a small `list-drops-at-
  host` / `get-host-drop-history` EF mirroring the existing
  `get-host` pattern.

### Extend `get-drop` (drop_id-single)

- 2.3 `service-board.html:1824` — already adjacent to a
  `get-drop` invoke in `Promise.all`. Natural fold-in:
  extend `get-drop`'s response with an embedded `summary`
  projection so the parallel direct read disappears.
- 2.7 `drop-manager.html:3057` — same shape, also adjacent
  to a `get-drop` invoke in `Promise.all`.
- 2.5 `scorecard.html:665` — single read; not currently
  adjacent to a `get-drop` invoke, but the same `get-drop`
  extension would serve it cleanly (replace this read with
  `functions.invoke('get-drop', ...)` returning both the
  drop and summary).

### Sequencing observation

Folding the summary projection into `get-drop` closes 3 of
7 sites with one EF change and three small page rewires.
The four LIST sites (hosts, service-board drops list,
drop-manager drops list, host-profile history) want either
a `list-drops` projection extension or — for the
host-profile case — a dedicated host-scoped EF. The full
closure is one EF extension to `get-drop`, one EF
extension to `list-drops`, and possibly one new EF for the
host history surface. Two- or three-PR shape.

---

End of audit.
