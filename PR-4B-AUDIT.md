# PR 4b — Audit

Author: Claude Code (audit-only session)
Date: 2026-04-29
Branch: `claude/audit-pr-4b-FXVuy`
Base: `origin/main` @ 5e917e2

This document is the audit pass for PR 4b. It is design and verification
only — no code changes are made in this session. The five deliverables
under audit are scoped in CLAUDE.md and the PR 4b kickoff prompt:

1. `assign-menu-items` Edge Function (bulk-replace, cross-vendor
   validation, including a clone-from-source-drop mode).
2. `remove-event-window` Edge Function (single delete-drop consumer
   in `renderExistingWindows`).
3. Migrate the three clone-mode call sites to Edge Functions; retire
   residual direct-PostgREST stamps for `series_id`/`series_position`/
   `status` and `window_group_id`.
4. Remove the dead `dropStatus` dropdown.
5. Retire (or transform) the client-side `capacity_category` hard-throw
   at `drop-manager.html:3519`.

---

## Section 0 — Wrong-premise check on handover assumptions

For each handover claim, verified against the current code on
`origin/main` @ 5e917e2. Findings flagged where premise is stale.

### 0.1 — `saveAssignments` uses upsert+delete, not insert-replace

**ACCURATE.** `drop-manager.html:3360–3465`. The function:
- Builds `cleanedRows` from enabled rows (lines 3360–3411).
- Splits into `productRows` and `bundleRows` (lines 3413–3414).
- Upserts products with `onConflict: "drop_id,product_id"` (lines
  3416–3428).
- Upserts bundles with `onConflict: "drop_id,bundle_id"` (lines
  3430–3442).
- Computes `idsToDelete` from previously enabled rows that aren't in
  the new enabled set, then deletes them by primary key (lines 3444–3464).

Two unique constraints exist on `drop_menu_items` because a row is
either product-typed or bundle-typed (the inactive FK is null). The
two upserts handle the two paths separately.

### 0.2 — `saveDrop`'s series branch leaves three fields on direct PostgREST

**ACCURATE.** `drop-manager.html:3533–3649`. After invoking `update-drop`
with the form payload, the code does a direct PostgREST update to stamp
`series_id`, `series_position`, and `status` (lines 3566–3571), then a
direct INSERT loop for sibling drops (3601–3604) and a direct INSERT
loop for cloned `drop_menu_items` rows (3627–3631). Both `update-drop`
and `transition-drop-status` whitelists exclude these three fields — the
direct stamp is the only path today.

### 0.3 — `handleCreateEventWindows` leaves `window_group_id` on direct PostgREST

**ACCURATE.** `drop-manager.html:4003–4008`. After validating the form
input, the function generates a `windowGroupId` (line 3994) and stamps
it onto the parent drop via `.from("drops").update({ window_group_id }).
eq("id", state.selectedDropId).eq("vendor_id", state.vendorId)`. The
`vendor_id` filter is present here as defence-in-depth (good); the
field itself is not in `update-drop`'s whitelist.

### 0.4 — The three clone-mode sites have the same "fetch source assignments, insert clones" shape

**ACCURATE.** Confirmed at all three call sites:
- **`saveDrop` series branch** (`drop-manager.html:3577–3631`) — fetches
  template assignments via `.from("drop_menu_items").select("*").eq
  ("drop_id", state.selectedDropId)`, builds clone rows for each sibling
  drop, single bulk INSERT.
- **`duplicateDrop`** (`drop-manager.html:3738–3796`) — fetches source
  assignments, maps to clone rows preserving `item_type`/`menu_item_type`,
  filters out incomplete rows, single bulk INSERT.
- **`createEventWindow`** (`drop-manager.html:3818–3911`) — same shape
  as `duplicateDrop`, with the addition of an optional `window_group_id`
  in the parent `windowPayload`.

The three sites differ only in the source-drop discovery and the parent
drop creation/update around the clone block. The clone block itself is
substitutable across all three.

### 0.5 — `renderExistingWindows` confirm-remove is the only direct delete-drop consumer

**ACCURATE on uniqueness, but the framing was incomplete.**

**Wrong-premise finding (W-1).** The handover described the click handler
as "a direct DELETE on drops with no orders check, no parent re-stamping
logic." The orders-check claim is correct. The parent re-stamping claim
is misleading: re-stamping does happen, but inside
`renderExistingWindows()` itself (lines 4057–4070) on its next invocation
after the delete completes — not in the click handler. The click handler
deletes, then calls `renderExistingWindows()` (line 4974), which detects
"no siblings remain" and clears `window_group_id` on the parent drop
(lines 4059–4062). So removal of `remove-event-window` cannot just port
the click handler — it must also subsume the parent-clear logic that
currently lives in the renderer.

**Wrong-premise finding (W-2).** Two security gaps in this surface that
the handover did not flag:
- The click handler at `drop-manager.html:4967–4970` does
  `.delete().eq("id", dropId)` with **no `vendor_id` filter**. Today this
  relies entirely on RLS for cross-vendor protection. The other migrated
  surfaces (PR 4a's `update-drop`, the `window_group_id` stamp at line
  4007) consistently double-filter on `id + vendor_id`. The remove path
  is the odd one out.
- The parent-clear inside `renderExistingWindows()` at lines 4059–4062
  does `.from("drops").update({ window_group_id: null }).eq("id",
  state.selectedDropId)` — also **no `vendor_id` filter**. The
  `state.selectedDropId` is set from session state, so the practical
  exposure is bounded, but the pattern is inconsistent with the rest
  of the codebase.

`remove-event-window` should subsume both writes (the sibling delete
and the conditional parent-clear) under a single transactional Edge
Function call. See Section 3.

### 0.6 — The `dropStatus` dropdown has been a no-op since PR 4a (save-path only)

**WRONG-PREMISE.**

**Wrong-premise finding (W-3).** The save-path is a no-op, but
`dropStatus` has live read-path consumers that the handover did not
mention.

Inventory of `dropStatus` references in `drop-manager.html`:
- Definition: lines 925–936 (the `<select id="dropStatus">` element
  with seven options: draft, scheduled, live, closed, completed,
  cancelled, archived).
- Read on save (no-op since PR 4a): line 3278 — `byId("dropStatus")
  .value` flows into the form payload via `readDropFromForm()`.
  `update-drop`'s whitelist excludes `status`, so the value is silently
  dropped on the wire. Confirmed dead.
- Write on load: line 2746 — `populateForm()` sets `byId("dropStatus")
  .value = d.status || "draft"`.
- **Live read by `renderStripeGate`: lines 4163 and 4178** — the
  Stripe gate selects `'#dropStatus option[value="live"]'` and toggles
  its `disabled` property based on `vendor.stripe_onboarding_complete`.
  The "Live" option is greyed out in the dropdown when Stripe is not
  yet connected. This is the visible UX of the Stripe gate today.
- Form-wiring (input/change → markDirty): line 4663, included in the
  bulk wiring loop at 4662–4684.

Implications for Deliverable 4:
- Removing the element alone is not sufficient. The two
  `renderStripeGate` queries (lines 4163, 4178) become null-deref
  candidates and must be removed.
- The Stripe gate's user-facing signal currently lives on the dropdown
  ("Live" greyed out). With the dropdown gone, the gate signal must
  move somewhere else — the existing `<div id="stripeGate">` banner
  (rendered at lines 4168–4176) already covers the explanatory copy,
  but the publish-button affordance needs a parallel treatment so the
  user understands why publish is blocked. PR 4b should not invent new
  UI for this — it should disable the publish button (the actual
  control that calls `transition-drop-status`) when Stripe is gated,
  matching the existing pattern.
- Form-wiring at line 4663 must drop `"dropStatus"` from the array.
- `populateForm()` at line 2746 must lose its assignment.
- `readDropFromForm()` at line 3278 must lose its read; downstream
  `getDropPayload()` at line 3329 must drop `status` from the returned
  object.

### 0.7 — `update-drop` excludes `capacity_category` from its whitelist

**WRONG-PREMISE.**

**Wrong-premise finding (W-4).** `update-drop`'s `ALLOWED_FIELDS`
explicitly **includes** `capacity_category` (line 29 in
`supabase/functions/update-drop/index.ts`), alongside
`capacity_category_id` (line 28). The audit prompt's phrasing —
"update-drop now reconciles capacity_category server-side via
capacity_category_id lookup" — is half-right.

What `update-drop` actually does (lines 190–214):
- If `capacity_category_id` is in the update payload **and** non-null:
  look up the matching row in `categories` filtered by
  `vendor_id`. If found, **overwrite** `update.capacity_category` with
  `category.slug` regardless of what the client sent. If not found,
  refuse with 400 "capacity_category_id does not belong to this vendor".
- If `capacity_category_id` is in the payload but **null**: the function
  also writes `update.capacity_category = null` to keep the pair
  consistent.
- If `capacity_category_id` is **not in the payload at all**: the
  whitelisted `capacity_category` text passes through unchanged. No
  reconciliation. The client could send arbitrary text.

Implications for Deliverable 5 (Section 7):
- The client-side throw at `drop-manager.html:3519` is enforcing that
  saves include both fields. If the throw is retired, today's
  `getDropPayload()` always sends both together (lines 3288–3289), so
  the unverified-text path is not currently exercised. But it is a
  latent gap on `update-drop` if a future caller sends only the text.
- Recommended outcome (full argument in Section 7): retire the client
  throw so drafts can save without a capacity category, and tighten
  `update-drop` to refuse a `capacity_category` text write that is not
  accompanied by a matching `capacity_category_id`. This closes the
  latent server gap as a side effect of the client change.

### Summary of Section 0 findings

| # | Handover claim | Verdict |
|---|---|---|
| 0.1 | `saveAssignments` uses upsert+delete | Accurate |
| 0.2 | `saveDrop` series branch stamps three fields direct | Accurate |
| 0.3 | `handleCreateEventWindows` stamps `window_group_id` direct | Accurate |
| 0.4 | Three clone sites share the same shape | Accurate |
| 0.5 | `renderExistingWindows` confirm-remove is the only delete consumer | **Accurate on uniqueness; W-1 / W-2 add scope** |
| 0.6 | `dropStatus` dropdown is a save-path no-op | **W-3: read-path consumers exist** |
| 0.7 | `update-drop` excludes `capacity_category` from whitelist | **W-4: included; reconciled only when FK present** |

Findings W-1 through W-4 expand PR 4b's scope; none invalidate the
five-deliverable framing. The build prompt should incorporate them
as called out in Sections 3, 6, and 7 below.

---

## Section 1 — Current state inventory

Eight call sites in `drop-manager.html` write to `drops` or
`drop_menu_items` outside the existing Edge Function surface (or, in
the case of `saveAssignments`, write to a table that PR 4b is moving
behind one). Each entry below captures the call site's current
behaviour, fields and tables touched, and the protections (or absence
of them) in place today. References to ownership / orders / referential
checks are based on direct inspection of `drop-manager.html` at
`origin/main` @ 5e917e2.

Tables in scope: `drops`, `drop_menu_items`. RLS today on both is
permissive enough that direct PostgREST writes succeed when the user's
JWT is attached and the row's `vendor_id` matches the session vendor
— see operational learning #14 and T5-B17 for the auth-not-attached
caveat that motivates this whole migration.

### Call site 1 — `saveAssignments` (drop_menu_items bulk replace)

- **Location:** `drop-manager.html:3360–3465`
- **Behaviour:** Builds the desired enabled set from the form, splits
  by item type, upserts product rows, upserts bundle rows, then
  deletes any previously-enabled rows that are no longer enabled. Net
  effect is "make `drop_menu_items` for this drop equal the enabled
  set." Three writes per save.
- **Tables:** `drop_menu_items` (upsert + upsert + delete).
- **Fields written:** `drop_id`, `item_type`, `menu_item_type`,
  `product_id`, `bundle_id`, `is_available`, `price_override_pence`,
  `stock_limit`, `sort_order`.
- **Conflict targets:** `drop_id,product_id` for product upsert;
  `drop_id,bundle_id` for bundle upsert. Two upserts because the table
  has two unique constraints (one per type — see Section 0.1).
- **Cross-vendor / ownership validation:** None server-checked. The
  client trusts that `state.selectedDropId` belongs to
  `state.vendorId` because `loadSelectedDrop()` asserts it on read.
  No verification that `product_id` / `bundle_id` belong to the same
  vendor as the drop — a malicious or buggy client could attach
  another vendor's product to its own drop. RLS is the only backstop
  and there is no positive evidence today that it forbids this.
- **Orders / referential checks:** None. The delete branch removes
  `drop_menu_items` rows by primary key with no check for whether any
  `order_items` already reference them via `product_id` /
  `bundle_id` + `drop_id`. Today this is a soft hazard — Service Board
  rendering uses snapshot fields (`item_name_snapshot`,
  `capacity_units_snapshot`) so historical orders survive, but the
  `order_items.product_id` / `bundle_id` FK targets `products` /
  `bundles` rather than `drop_menu_items`, so the integrity surface is
  bounded.
- **Maps to PR 4b deliverable:** 1 (`assign-menu-items`, bulk-replace
  mode).

### Call site 2 — `saveDrop` series branch: series stamp on template

- **Location:** `drop-manager.html:3566–3571`
- **Behaviour:** After `update-drop` writes the form payload to the
  template drop, a direct PostgREST update stamps the three
  series-shape fields onto the same row. Fires only when a drop is
  being converted into a recurring series for the first time.
- **Tables:** `drops` (update).
- **Fields written:** `series_id` (newly minted UUID),
  `series_position` (`1`), `status` (`"draft"`).
- **Filters:** `.eq("id", state.selectedDropId).eq("vendor_id",
  state.vendorId)` — double-filter on row + vendor, defence-in-depth
  pattern that matches the rest of the codebase.
- **Cross-vendor / ownership validation:** Vendor filter present.
  `series_id` is freshly generated client-side so no orphan reference
  risk.
- **Orders / referential checks:** None. Stamping `status = "draft"`
  on a drop that already has orders would silently regress a published
  drop to draft — but the surrounding flow (`isRecurring &&
  !alreadyInSeries`) only fires when a drop is being newly converted
  into a series, so a live drop reaches this branch only if the user
  is actively editing it back into series-template form.
- **Maps to PR 4b deliverable:** 3 (clone-mode in `create-drop` makes
  the existing template drop one of the siblings; the residual stamp
  goes away).

### Call site 3 — `saveDrop` series branch: sibling drops INSERT

- **Location:** `drop-manager.html:3584–3604`
- **Behaviour:** Generates `position 2..N` sibling drops by spreading
  the template payload, overriding slug / timing / `series_position`
  per occurrence, and inserting them in a single bulk INSERT.
- **Tables:** `drops` (bulk insert).
- **Fields written:** Every column on the template payload (full
  `getDropPayload(dropData)` shape) plus `id` (client-minted UUID),
  `slug` (per-occurrence unique slug), `series_position`,
  `delivery_start`, `delivery_end`, `closes_at`, `opens_at` (`null`
  for siblings), `status` (`"draft"`), and the inherited `series_id`.
- **Cross-vendor / ownership validation:** None. `vendor_id` is
  carried through from `payload` (set by `getDropPayload(dropData)`,
  which inherits from `state.drop.vendor_id`). The client controls the
  inserted `vendor_id` — RLS is the only backstop. `host_id` /
  `capacity_category_id` are also carried through unchecked.
- **Orders / referential checks:** Not applicable — these are brand
  new drops, no orders can yet exist.
- **Maps to PR 4b deliverable:** 3 (`create-drop` clone-mode generates
  siblings server-side using the widened whitelist landed in PR 4a).

### Call site 4 — `saveDrop` series branch: clone drop_menu_items

- **Location:** `drop-manager.html:3577–3631`
- **Behaviour:** Fetches all assignments for the template drop, then
  for each newly-inserted sibling drop builds a clone row and bulk
  inserts the entire cross-product into `drop_menu_items` in one call.
- **Tables:** `drop_menu_items` (read on template, bulk insert on
  siblings).
- **Fields written (per row):** `drop_id` (sibling drop id),
  `item_type`, `menu_item_type`, `product_id`, `bundle_id`,
  `is_available`, `price_override_pence`, `stock_limit`, `sort_order`.
- **Cross-vendor / ownership validation:** None. The product / bundle
  ids are inherited from the template's assignments without any
  re-check that they still belong to the calling vendor.
- **Orders / referential checks:** Not applicable — sibling drops are
  brand new.
- **Maps to PR 4b deliverable:** 1 (`assign-menu-items` clone-mode,
  invoked by `create-drop`'s sibling generation in deliverable 3).

### Call site 5 — `handleCreateEventWindows` window_group_id stamp

- **Location:** `drop-manager.html:3994–4008`
- **Behaviour:** Mints a fresh `window_group_id` UUID and stamps it on
  the parent drop, then invokes `createEventWindow()` per child window
  (call site 7). This is the only path that sets `window_group_id` on
  the parent today.
- **Tables:** `drops` (update).
- **Fields written:** `window_group_id` (newly minted UUID).
- **Filters:** `.eq("id", state.selectedDropId).eq("vendor_id",
  state.vendorId)` — vendor double-filter present.
- **Cross-vendor / ownership validation:** Vendor filter present.
- **Orders / referential checks:** None. Setting `window_group_id` on
  a drop that has orders is harmless — it's a grouping marker, not a
  capacity or fulfilment field.
- **Maps to PR 4b deliverable:** 3 (`create-drop` clone-mode receives
  the parent id and stamps `window_group_id` on the parent atomically
  with sibling-window creation; the standalone stamp goes away).

### Call site 6 — `duplicateDrop` (drop-card "Duplicate" action)

- **Location:** `drop-manager.html:3726–3804`
- **Behaviour:** Reads source drop + source assignments, builds a
  `-copy` slug, clones the source's `getDropPayload()` shape into a
  new drop with timing nulled and status forced to `"draft"`, inserts
  it, then bulk inserts cloned `drop_menu_items` rows for the new
  drop. Two writes (one per table).
- **Tables:** `drops` (insert with `.select("id").single()`),
  `drop_menu_items` (bulk insert).
- **Fields written on `drops`:** Full `getDropPayload()` spread plus
  overrides: `slug`, `name` (`"X Copy"`), `status` (`"draft"`),
  `series_id` (`null`), `series_position` (`null`), `opens_at`,
  `closes_at`, `delivery_start`, `delivery_end` (all `null`).
- **Fields written on `drop_menu_items`:** Same shape as call site 4.
- **Cross-vendor / ownership validation:** None. Source drop is read
  with `.eq("id", targetId).single()` — no vendor filter, so a
  guessed/leaked drop id from another vendor would clone successfully
  and the new row would carry the source's `vendor_id` (the duplicator
  ends up owning a copy of someone else's drop only if the source is
  theirs to begin with — but the read leaks the source row regardless,
  see W-1-style framing). `host_id` / `capacity_category_id` are
  carried through from the source unchecked.
- **Orders / referential checks:** Not applicable — duplicate creates
  a brand new drop with no orders.
- **Maps to PR 4b deliverable:** 3 (`create-drop` clone-mode), with
  the assignments insert subsumed by `assign-menu-items` clone-mode
  (deliverable 1).

### Call site 7 — `createEventWindow` (per-window sibling creation)

- **Location:** `drop-manager.html:3806–3918`
- **Behaviour:** Reads source drop + source assignments, computes a
  per-host window count to suffix the name (`"— Window N"`), inserts
  a new sibling drop with the optional `window_group_id` on it, and
  bulk inserts cloned `drop_menu_items`. Same two-write shape as
  `duplicateDrop`. Invoked from `handleCreateEventWindows()` per
  parsed window row.
- **Tables:** `drops` (insert), `drop_menu_items` (bulk insert).
- **Fields written on `drops`:** Full `getDropPayload(sourceDrop)`
  spread plus overrides: `slug`, `name`, `status` (`"draft"`),
  `series_id` (`null`), `series_position` (`null`), `opens_at`,
  `closes_at`, `delivery_start`, `delivery_end` (set from
  `timingOverride`), `window_group_id` (when supplied by caller).
- **Fields written on `drop_menu_items`:** Same shape as call sites
  4 and 6.
- **Cross-vendor / ownership validation:** None — same gap as call
  site 6. Source drop read by id only; cloned `vendor_id` /
  `host_id` / `capacity_category_id` inherited unchecked.
- **Orders / referential checks:** Not applicable — sibling window
  creation produces a brand new drop.
- **Maps to PR 4b deliverable:** 3 (subsumed by `create-drop`
  clone-mode invoked from `handleCreateEventWindows`), with
  assignments via `assign-menu-items` clone-mode (deliverable 1).

### Call site 8 — `renderExistingWindows`: sibling delete + parent clear

- **Location:** Click handler at `drop-manager.html:4960–4980`
  (sibling delete); parent-clear at `drop-manager.html:4057–4070`
  (executed on the next `renderExistingWindows()` invocation).
- **Behaviour:** Two paired writes. (a) The Confirm-Remove click
  handler hard-deletes the chosen sibling drop by id. (b) On the
  follow-up render, if the sibling list comes back empty, the
  renderer clears `window_group_id` on the parent so the UI reverts
  from "edit existing windows" to "create windows" mode. Both writes
  are direct PostgREST today.
- **Tables:** `drops` (delete on sibling, then update on parent).
- **Fields written:** Sibling — full row deletion. Parent —
  `window_group_id = null`.
- **Filters:** Sibling delete: `.eq("id", dropId)` — **no vendor_id
  filter** (W-2). Parent clear: `.eq("id", state.selectedDropId)` —
  **no vendor_id filter** (W-2). Both rely entirely on RLS for
  cross-vendor protection.
- **Cross-vendor / ownership validation:** None on either write.
- **Orders / referential checks:** None on the sibling delete. If the
  sibling drop has orders, the delete cascades or fails depending on
  FK definition — `order_items.drop_id` references `drops.id` (per
  SCHEMA.md), so a sibling with orders would either (i) cascade and
  destroy customer order history, or (ii) fail with a FK violation
  surfaced as a generic Postgres error. This is a real hazard that
  PR 4b's `remove-event-window` must address — see Section 3.
- **Maps to PR 4b deliverable:** 2 (`remove-event-window` Edge
  Function subsumes both writes under one transactional call, adds an
  orders-presence check before delete, adds vendor ownership
  enforcement on both writes).

### Cross-cutting observations

- **Vendor filter coverage on the eight call sites:** 2 of 8 currently
  carry an explicit `.eq("vendor_id", ...)` clause (call sites 2 and
  5). The remaining 6 rely on RLS plus client trust in
  `state.vendorId`. PR 4b's three Edge Functions (`assign-menu-items`,
  `remove-event-window`, plus widened `create-drop`) collapse this to
  zero direct-PostgREST writes — the server enforces ownership on
  every path.
- **Orders-presence checks:** Zero of 8 today. Only call site 8
  (sibling delete) has any plausible ordering exposure; the other
  seven all touch new or fully-owned drops where orders cannot
  meaningfully exist.
- **Cross-vendor reference risk on clone-mode (call sites 4, 6, 7):**
  All three sites carry `host_id`, `capacity_category_id`,
  `product_id`, and `bundle_id` from a source row to a cloned row
  with no re-validation. PR 4a's `update-drop` validates these on the
  update path (Section 0); the clone-mode work in PR 4b should apply
  the same checks at sibling creation, because today a vendor whose
  source drop somehow holds a foreign reference would propagate that
  reference to every clone.

---

## Section 2 — `assign-menu-items` Edge Function design

This is PR 4b's central new surface. It subsumes call site 1
(`saveAssignments` bulk replace) and the assignment portion of call
sites 4, 6, and 7 (the three clone-mode sibling-creation paths). The
function is the only write path into `drop_menu_items` after PR 4b —
all direct PostgREST writes to that table go away.

### 2.1 Request body shape

```jsonc
{
  "vendor_id": "<uuid>",            // required
  "drop_id":   "<uuid>",            // required (target drop)
  // Exactly one of the following must be present:
  "items":              [ ... ],    // bulk-replace mode
  "clone_from_drop_id": "<uuid>"    // clone mode
}
```

`items[]` shape (one entry per enabled menu row, mirroring today's
`cleanedRows` in `saveAssignments`):

```jsonc
{
  "item_type":            "product" | "bundle",  // required
  "menu_item_type":       "product" | "bundle",  // required, must match item_type
  "product_id":           "<uuid>" | null,
  "bundle_id":            "<uuid>" | null,
  "is_available":         true | false,
  "price_override_pence": <int> | null,
  "stock_limit":          <int> | null,
  "sort_order":           <int>
}
```

Per-item invariant: when `item_type === "product"`, `product_id` is
required and `bundle_id` must be `null`. When `item_type === "bundle"`,
`bundle_id` is required and `product_id` must be `null`. Mirrors
today's client-side validation at `drop-manager.html:3379–3389`.

### 2.2 Whitelist of fields per item

`assign-menu-items` writes exactly the nine columns above to
`drop_menu_items`. Any other field on an inbound `items[]` entry is
silently ignored, in line with `update-drop`'s whitelist pattern.
`drop_id` is NOT a per-item field — the function injects the
top-level `drop_id` onto every row server-side.

**Note on T5-B5 dual-field redundancy.** `drop_menu_items` has two
NOT NULL columns covering the same concept: `item_type` and
`menu_item_type`. Until that schema cleanup lands, the function
writes both — taking `item_type` from the payload and copying it to
`menu_item_type` (matching the current behaviour at
`drop-manager.html:3393–3394`). When T5-B5 retires one of the
columns, the function changes in one place. No client change needed.

### 2.3 Ownership validation

The validation centrepiece. PR 4b's main security improvement.

Two ownership checks fire before any write:

1. **Drop ownership.** Look up the `drop_id` in `drops` filtered by
   `vendor_id`. Refuse with 400 if not found. Pattern matches
   `update-drop`'s host/category lookups (`update-drop/index.ts:176–186`).
2. **Per-item product/bundle ownership.** Collect distinct
   `product_id` values from `items[]`, look them up in `products`
   filtered by `vendor_id`. Same for `bundle_id` against `bundles`.
   Refuse with 400 if any id resolves to zero rows. Done in two
   batched `IN` lookups, not one query per item.

This explicitly closes the cross-vendor reference risk identified in
Section 1's cross-cutting observations (call sites 4, 6, 7) and
extends to call site 1 the host-ownership-style enforcement that
PR 4a introduced for `host_id` on `update-drop`. Together with the
parallel `host_id` / `capacity_category_id` checks already present
in `update-drop` and slated for `create-drop` clone-mode in
deliverable 3, the three Edge Functions in scope for PR 4a + PR 4b
collectively guarantee that no vendor-scoped reference on `drops` or
`drop_menu_items` can carry across vendor boundaries via any
client-driven path.

### 2.4 Transaction shape

The current `saveAssignments` runs three independent PostgREST calls
(product upsert, bundle upsert, delete-by-id). A failure between any
two leaves `drop_menu_items` in a state that disagrees with the
operator's intent. The Edge Function must collapse this into one
atomic operation.

**Recommended approach: a Postgres function called via RPC.** The
Edge Function does auth + ownership validation in TypeScript (read
paths, no atomicity needed), then invokes a single PL/pgSQL function
that does the diff atomically inside one server-side transaction.

Sketch:

```sql
create or replace function assign_drop_menu_items(
  p_drop_id uuid,
  p_items   jsonb        -- array of normalised item objects
) returns setof drop_menu_items
language plpgsql
security definer        -- caller is service role; no row-level skip needed
as $$
begin
  -- Upsert products by (drop_id, product_id)
  insert into drop_menu_items (drop_id, item_type, menu_item_type,
    product_id, bundle_id, is_available, price_override_pence,
    stock_limit, sort_order)
  select p_drop_id, ...
  from jsonb_to_recordset(p_items) as r(...)
  where r.item_type = 'product'
  on conflict (drop_id, product_id) do update set ...;

  -- Upsert bundles by (drop_id, bundle_id)
  -- (mirror of the above, swapping target unique constraint)

  -- Delete rows for this drop that aren't in the desired set
  delete from drop_menu_items dmi
  where dmi.drop_id = p_drop_id
    and (
      (dmi.item_type = 'product' and dmi.product_id not in (
        select (item->>'product_id')::uuid from jsonb_array_elements(p_items) item
        where item->>'item_type' = 'product'
      ))
      or
      (dmi.item_type = 'bundle' and dmi.bundle_id not in (
        select (item->>'bundle_id')::uuid from jsonb_array_elements(p_items) item
        where item->>'item_type' = 'bundle'
      ))
    );

  return query select * from drop_menu_items where drop_id = p_drop_id
    order by sort_order;
end $$;
```

The Edge Function calls `serviceClient.rpc('assign_drop_menu_items',
{ p_drop_id, p_items })`. Either every step lands or the transaction
rolls back. No partial state.

**Critical safety property to preserve.** `order_items.product_id`
and `order_items.bundle_id` reference `products` and `bundles`
directly — not `drop_menu_items`. Deleting `drop_menu_items` rows
does not cascade into order history, and the snapshot fields
(`item_name_snapshot`, `capacity_units_snapshot`,
`price_pence`) on `order_items` mean past orders survive even if
the underlying menu row is removed mid-drop. **This makes
bulk-replace on `drop_menu_items` safe by design.**

This property must be defended explicitly:

- The Postgres function above performs no cascading delete on
  `order_items` and must never be "tidied" to do so.
- If the schema is ever changed to FK `order_items` against
  `drop_menu_items` (it isn't today), bulk-replace becomes destructive
  and the design must change before the FK lands.
- Document the property in the function's SQL comment and in
  CLAUDE.md / SCHEMA.md so the next contributor doesn't add a
  well-meaning ON DELETE CASCADE that breaks order history.

The unrelated FK observation surfaced during the SQL audit —
`drop_menu_items.drop_id → drops.id ON DELETE CASCADE` — is
reassuring but **not** what makes bulk-replace safe. That cascade
fires only when a whole drop is deleted (Section 3 territory). For
mid-drop menu edits, the safety comes from `order_items` decoupling
from `drop_menu_items`.

### 2.5 Refusal conditions

The function returns a 4xx with a structured error body in any of
the following cases (all return before any write):

| Condition | Status | Error body |
|---|---|---|
| Missing `Authorization` header / unverified JWT | 401 | `{ error: "Unauthorized" }` |
| Missing `vendor_id` | 400 | `vendor_id is required` |
| Missing `drop_id` | 400 | `drop_id is required` |
| Both `items` and `clone_from_drop_id` provided | 400 | `Provide either items or clone_from_drop_id, not both` |
| Neither `items` nor `clone_from_drop_id` provided | 400 | `items array or clone_from_drop_id is required` |
| Vendor not owned by calling user | 403 | `Vendor not found or not owned by user` |
| `drop_id` does not belong to vendor | 400 | `drop_id does not belong to this vendor` |
| `clone_from_drop_id` does not belong to vendor | 400 | `clone_from_drop_id does not belong to this vendor` |
| Per-item: missing `item_type` | 400 | `item_type is required (item N)` |
| Per-item: `item_type` not in `{product, bundle}` | 400 | `Invalid item_type (item N)` |
| Per-item: `item_type !== menu_item_type` | 400 | `item_type and menu_item_type must match (item N)` |
| Per-item: product row missing `product_id` | 400 | `product item missing product_id (item N)` |
| Per-item: bundle row missing `bundle_id` | 400 | `bundle item missing bundle_id (item N)` |
| Any `product_id` does not belong to vendor | 400 | `One or more product_ids do not belong to this vendor` |
| Any `bundle_id` does not belong to vendor | 400 | `One or more bundle_ids do not belong to this vendor` |
| `price_override_pence` not null and not finite int >= 0 | 400 | `price_override_pence must be a non-negative integer` |
| `stock_limit` not null and not finite int >= 0 | 400 | `stock_limit must be a non-negative integer` |
| RPC fails | 400 / 500 | error from Postgres |

Validation runs in the order above so the cheapest checks
short-circuit before the database lookups.

### 2.6 Clone-mode interface

Three options were on the table; recommend **option (c)** with a
twist — accept `clone_from_drop_id` as a server-hydrated alternative
to `items[]`, **mutually exclusive at the request body, but
internally hydrated into the same `items[]` shape and run through
the same validation and write path.**

Rationale:

- **Single endpoint, single Edge Function** — fewer surfaces to keep
  in sync. Mirrors the existing pattern of one function per write
  intent (`update-drop`, `create-drop`, `transition-drop-status`).
- **Mutual exclusion at the request body** prevents ambiguity for
  callers ("which one wins if both are sent?") without needing
  server precedence rules.
- **Server-side hydration into `items[]`** means clone-mode and
  bulk-replace share one validation surface, one write surface, one
  transaction. No clone-specific code paths in the SQL function.
  This is what option (c) offers that (a) doesn't.

Hydration sequence for clone-mode:

1. Verify `clone_from_drop_id` belongs to `vendor_id` (same lookup
   pattern as `drop_id` verification).
2. Fetch `drop_menu_items` for the source drop. The source rows are
   already vendor-owned (verified in step 1) so per-item
   product/bundle ownership re-checks are redundant — but the
   function should re-run them anyway as defence-in-depth, because
   a future bug or stale row could carry a foreign reference and
   the per-item ownership check is the audit-style guarantee that
   PR 4b is delivering. Belt-and-braces over assumptions.
3. Map source rows to the canonical `items[]` shape (drop the
   `id`, `created_at`, `updated_at` columns; carry the rest).
4. Continue down the bulk-replace path.

Clone-mode is invoked from create-drop's sibling generation across
the three call sites: `saveDrop` series branch (call site 4),
`duplicateDrop` (call site 6), `createEventWindow` (call site 7).
After PR 4b, those three call sites become a single
`create-drop` invocation with a sibling specification, and
`create-drop` invokes `assign-menu-items` per sibling with
`clone_from_drop_id` set to the source drop. The client never
manually fetches and re-inserts assignments.

### 2.7 Response shape

Success (200):

```jsonc
{
  "drop_id": "<uuid>",
  "items": [ /* full drop_menu_items rows for this drop, sorted by sort_order */ ],
  "summary": { "inserted_or_updated": <int>, "deleted": <int> }
}
```

Returning the full post-write rows means the caller can update
`state.dropMenuItems` directly without a follow-up `loadSelectedDrop()`
round-trip — keeps the UI fast and removes a class of stale-state
bugs. The summary is informational; useful for logging and for
showing "N items updated" toasts in future.

Error (4xx / 5xx):

```jsonc
{ "error": "<message>" }
```

Same shape as `update-drop` and the rest of the Edge Function suite.

### 2.8 Pattern carry-forward from existing Edge Functions

The function follows the patterns established in PR 4a's
`update-drop`:

- **Top-level `try/catch`** around the request handler with a
  CORS-decorated 500 fallback (avoids the masked-as-CORS issue
  flagged in T5-B7).
- **`getCorsHeaders(req)` per request** with allowlist enforcement
  via `_shared/cors.ts`.
- **`OPTIONS` 204 short-circuit** before any work.
- **`jsonResponse(body, status)` helper** for every response (the
  pattern T5-B8 wants `invite-vendor` to converge on).
- **`anonClient.auth.getUser(authHeader)`** for JWT verification —
  `verify_jwt = false` in `supabase/config.toml` so the function
  is reachable, but JWT verification happens inside the function
  (mirrors `invite-vendor` and `update-drop`).
- **Service-role client (`SUPABASE_SERVICE_ROLE_KEY`)** for all
  database writes after auth has passed.
- **`.maybeSingle()` for ownership lookups** so a missing row
  becomes `null` (clean refusal), not a thrown error.
- **Double-filter equivalence.** Bulk-replace doesn't need the
  classic `id + vendor_id` double-filter on the write call, because
  the function reconstructs the full desired state for one drop
  scoped by `drop_id`. The ownership-checked `drop_id` (verified to
  belong to `vendor_id` before any write) is the equivalent guard
  — every row written or deleted carries the verified `drop_id`,
  and `drop_menu_items.drop_id` is the only vendor-bridging column
  on the row. The same logic applies to clone-mode source-fetch:
  source `drop_id` is ownership-verified before the source rows are
  read.

### 2.9 What this design does not do (out of scope)

- **No partial updates.** `assign-menu-items` always writes the
  complete desired set for a drop. Callers wanting to add or remove
  a single item compute the new full set client-side and resubmit.
  Mirrors today's `saveAssignments` behaviour; revisit only if a
  real call site needs it.
- **No reordering-only fast path.** A `sort_order`-only update could
  in theory skip some validation, but the perf cost of revalidating
  is trivial against the simplicity gain of one code path.
- **No order-impact warnings.** The function does not check whether
  any `order_items` reference the products/bundles being removed —
  per Section 2.4 the schema makes this unnecessary, and adding it
  would add a query to every save for no benefit.
- **No `drop_products` writes.** SCHEMA.md flags `drop_products` as
  a possibly-deprecated parallel table; T5-B5 owns sorting that out.
  PR 4b only writes to `drop_menu_items`.

---

## Section 3 — `remove-event-window` Edge Function design

This function subsumes call site 8 (the `renderExistingWindows`
confirm-remove click handler at `drop-manager.html:4960–4980` plus
the parent-clear logic at `drop-manager.html:4057–4070`). It is the
only delete path on `drops` introduced by PR 4b; no other call site
in scope deletes drops.

### 3.1 Schema reality check — there is no "parent" in a window group

Before describing the function, a clarification that affects the
refusal model. The brief refers to a "parent drop" of a window group;
the schema does not.

- `drops.window_group_id` is a uuid that members of the same
  multi-window event share. No `parent_drop_id` column. No
  `is_parent` flag. No structural distinction between members.
- Members are stamped with `window_group_id` from two paths today:
  - **Call site 5 (`handleCreateEventWindows`).** Mints a fresh
    `window_group_id` and stamps it on the drop the user has open
    (`state.selectedDropId`), then calls `createEventWindow()` (call
    site 7) per child window with the same `window_group_id`.
  - The drop the user happened to have open at creation time is
    informally the "Window 1" / "parent" in the UI, but only because
    the click flow stamps it first. There is no schema-level
    distinction.
- `renderExistingWindows` reinforces the informal framing: it
  excludes the currently-open drop from the sibling list and treats
  a "no surviving siblings" state as "this drop is now soloist; clear
  its `window_group_id`."

The Edge Function should not adopt the parent framing. Every member
of a window group is equal; any member can be the target of
`remove-event-window`; the function reasons about coherence of the
post-delete group rather than parenthood.

### 3.2 Request body shape

```jsonc
{
  "vendor_id": "<uuid>",   // required
  "drop_id":   "<uuid>"    // required (the drop to remove from its window group)
}
```

`drop_id` is the drop being deleted — typically a sibling row from
`renderExistingWindows`'s list, but the function does not require
it to be "non-current"; the function works correctly whichever
member of the group is named.

### 3.3 Ownership validation

Two ownership-shaped checks fire before any write:

1. **Drop ownership.** Look up `drop_id` in `drops` filtered by
   `vendor_id`, returning at minimum `id, vendor_id,
   window_group_id`. Refuse with 400 if not found. Same pattern as
   `update-drop`'s `host_id` lookup (`update-drop/index.ts:176–186`).
2. **Window-group membership.** From the result of step 1, refuse
   with 400 if `window_group_id` is `null`. A soloist drop should
   not be deleted via this function — the surface is for removing
   a drop from a group of windows, not for deleting drops in
   general. `delete-drop` (or `transition-drop-status` →
   `archived`) is the intended path for soloist deletion, and it is
   explicitly out of scope for PR 4b.

### 3.4 Refusal conditions

Validation runs in this order so the cheapest checks short-circuit
before the database lookups:

| # | Condition | Status | Error body | Notes |
|---|---|---|---|---|
| 1 | Missing `Authorization` header / unverified JWT | 401 | `Unauthorized` | Pattern carry from `update-drop`. |
| 2 | Missing `vendor_id` | 400 | `vendor_id is required` | |
| 3 | Missing `drop_id` | 400 | `drop_id is required` | |
| 4 | Vendor not owned by calling user | 403 | `Vendor not found or not owned by user` | |
| 5 | `drop_id` does not belong to vendor | 400 | `drop_id does not belong to this vendor` | Closes W-2 (no `vendor_id` filter on today's direct delete). |
| 6 | Drop's `window_group_id` is null | 400 | `Drop is not part of a window group` | Use `delete-drop` instead (out of scope for PR 4b). |
| 7 | **Drop has any orders** | 409 | `Cannot remove a window with existing orders` | **Hard refusal — no override.** Cite the cascade hazard inline. |

**On condition 7 — the orders-presence refusal.** This is a primary
refusal, not a soft warning, and the framing matters.
`drops.id` is the cascade root for four ON DELETE CASCADE FKs:

- `orders.drop_id → drops.id ON DELETE CASCADE`
- `order_status_events.drop_id → drops.id ON DELETE CASCADE`
- `drop_menu_items.drop_id → drops.id ON DELETE CASCADE`
- `drop_products.drop_id → drops.id ON DELETE CASCADE`

Today's direct PostgREST delete in the click handler will silently
destroy every order, every status event, and every audit row for
the deleted drop. Customer order history disappears with no warning.
This is the single most important behaviour change PR 4b introduces.

The check is implemented as an `EXISTS`-style probe — `select id
from orders where drop_id = $1 limit 1` — not a `count(*)`. If any
row exists, refuse. Cheap, sub-millisecond, no edge cases around
status (a draft order or a cancelled order still represents customer
data and still counts).

The function does **not** offer a "force" parameter. Operators
cancelling a window with real orders need to refund and remove
orders first via Service Board, then revisit the window removal.
This is the deliberate Hearth model: capacity and order history are
real, not editable away. If a future flow needs to merge orders to
another window (e.g. consolidate Window 2 into Window 1 before
removing Window 2), it gets its own purpose-built function — not a
flag on this one.

Conditions 1–6 are 4xx (client error). Condition 7 is 409 Conflict
because the request is well-formed but the resource state forbids
it. Mirrors the publish-gate refusal style in
`transition-drop-status`.

### 3.5 Post-delete coherence — when to clear `window_group_id` on the survivor

After a successful delete, the function must look at the surviving
membership of the same `window_group_id` and adjust:

| Members before delete | Members after delete | Action |
|---|---|---|
| ≥ 3 | ≥ 2 | None. Group remains coherent. |
| 2 | 1 | Clear `window_group_id` on the surviving member (group dissolves). |
| 1 | 0 | None. The "group" had only one member; it now has zero. Stale state cleared by the delete itself. |

The "members before delete = 1" case shouldn't occur in normal flow
(`handleCreateEventWindows` always creates ≥ 2 members), but a stale
group from a previous removal could theoretically leave a single
member carrying a `window_group_id` — see Section 0.5 W-1 / W-2 for
how today's parent-clear logic handles this. The Edge Function's
coherence step handles all three transitions uniformly: count
remaining members in the group; if exactly 1, clear that member's
`window_group_id`; otherwise do nothing.

The surviving-member nullify is a server-decided outcome, not a
caller-supplied parameter. The caller never names the survivor —
the function determines it from `select id from drops where
window_group_id = $group_id` post-delete. This closes the W-1 issue
where the parent-clear was a separate write triggered by a
re-render rather than part of the same logical operation.

### 3.6 Cascading writes — what the database removes for free

When the delete clears the orders-presence check and proceeds, four
cascade FKs fire:

- `drop_menu_items.drop_id` — desirable. Per-drop assignments are
  meaningless after the drop is gone; cascading them avoids orphan
  rows.
- `drop_products.drop_id` — desirable for the same reason
  (T5-B5 may retire this table; the cascade still works for now).
- `order_status_events.drop_id` — would only fire if the drop has
  status events, which only exist when the drop has orders. The
  orders-presence refusal at 3.4 condition 7 means this cascade
  never fires in practice.
- `orders.drop_id` — same. The orders-presence refusal is the
  layered defence that prevents this cascade from ever running.

Layered defence summary: the orders-presence check is the **primary**
defence (refuses before any delete); the cascade is the **schema-level
backstop** that exists regardless of which client performs the delete.
PR 4b adds the primary defence. The cascade was always there.

The function does not need to manually delete `drop_menu_items` or
any other dependent rows — the cascade does it.

### 3.7 Transaction shape

Like `assign-menu-items`, this is a multi-write atomic operation:
delete the drop **and** conditionally clear `window_group_id` on a
survivor inside one transaction. Two reasons it must be atomic:

1. If the delete succeeds and the post-delete count fails (network,
   service-role token rotation, etc.), the surviving member could
   be left carrying a `window_group_id` that points at a now-empty
   group. Today's two-phase pattern (delete + re-render decides
   nullify) has exactly this gap.
2. A concurrent `handleCreateEventWindows` run on the same group
   could race the count: another window appears between the delete
   and the count, the function's "exactly one" check now sees two,
   no nullify fires, but logically the new window was never part of
   the original group. Wrapping in a transaction with appropriate
   isolation closes this.

**Recommended approach: a Postgres function called via RPC.** Same
pattern as `assign-menu-items` (Section 2.4). The Edge Function does
auth + ownership + orders-presence in TypeScript, then calls a
single PL/pgSQL function that performs the delete, evaluates the
post-delete membership, and conditionally nullifies the survivor.

```sql
create or replace function remove_event_window(
  p_drop_id uuid
) returns table (
  deleted_drop_id uuid,
  survivor_drop_id uuid,         -- null if no survivor was nullified
  cascaded_drop_menu_items int   -- count of dmi rows removed by cascade
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group_id uuid;
  v_dmi_count int;
  v_survivor uuid;
begin
  -- Re-fetch the group_id under the transaction (don't trust the
  -- caller's earlier read — group_id could have changed).
  select window_group_id into v_group_id
  from drops
  where id = p_drop_id
  for update;

  if v_group_id is null then
    raise exception 'Drop is not part of a window group';
  end if;

  -- Count drop_menu_items that will cascade away (informational).
  select count(*) into v_dmi_count
  from drop_menu_items
  where drop_id = p_drop_id;

  delete from drops where id = p_drop_id;

  -- Determine survivor coherence.
  if (select count(*) from drops where window_group_id = v_group_id) = 1 then
    select id into v_survivor
    from drops
    where window_group_id = v_group_id;

    update drops set window_group_id = null where id = v_survivor;
  end if;

  return query select p_drop_id, v_survivor, v_dmi_count;
end $$;
```

The `set search_path = public, pg_temp` clause is required on every
`security definer` function — without it the function inherits the
caller's `search_path` and a malicious `public` role could shadow
`drops` with a temp table. Carry this forward to `assign-menu-items`'
RPC as well (noted in the build prompt; not amended in Section 2).

The Edge Function calls
`serviceClient.rpc('remove_event_window', { p_drop_id })` after the
TypeScript-side checks pass. Either every step lands or the
transaction rolls back; no partial state.

The TypeScript-side orders-presence check happens **outside** the
RPC because it is a refusal, not a write. Performing it in the
Edge Function keeps the SQL function focused on the write semantics
and lets the Edge Function return a structured 409 with a clear
error body before reaching the RPC.

### 3.8 Response shape

Success (200):

```jsonc
{
  "deleted_drop_id":          "<uuid>",
  "group_dissolved":          true | false,
  "survivor_drop_id":         "<uuid>" | null,
  "cascaded_drop_menu_items": <int>
}
```

- `group_dissolved` is `true` when post-delete membership is exactly
  zero or one (i.e. the group no longer functionally exists).
- `survivor_drop_id` is the id of the drop whose `window_group_id`
  was cleared, if any. Null when no nullify was needed
  (group still has ≥ 2 members) or when the deleted drop was already
  the last member.
- `cascaded_drop_menu_items` is informational; lets the caller
  display "removed N items along with the window" if useful.

Returning structured outcomes lets the caller update the UI without
a follow-up `loadSelectedDrop()` round-trip. If the survivor's group
was cleared and the survivor happens to be `state.selectedDropId`,
the client can update `state.drop.window_group_id = null` directly.

Error (4xx / 5xx):

```jsonc
{ "error": "<message>" }
```

Same shape as the rest of the suite.

### 3.9 Pattern carry-forward from existing Edge Functions

This function follows the same patterns as `update-drop`,
`update-host`, and `transition-drop-status`:

- **Top-level `try/catch`** around the request handler with a
  CORS-decorated 500 fallback (T5-B7 hygiene).
- **`getCorsHeaders(req)` per request** with allowlist enforcement
  via `_shared/cors.ts`.
- **`OPTIONS` 204 short-circuit** before any work.
- **`jsonResponse(body, status)` helper** for every response (T5-B8
  convergence).
- **`anonClient.auth.getUser(authHeader)`** for JWT verification —
  `verify_jwt = false` in `supabase/config.toml`, in-function
  verification.
- **Service-role client** (`SUPABASE_SERVICE_ROLE_KEY`) for the
  ownership lookup and the RPC call.
- **`.maybeSingle()` on the drop ownership lookup** so a missing
  row becomes a clean 400, not a thrown error.
- **RPC into a `security definer` Postgres function** with
  `set search_path = public, pg_temp` for the multi-write atomic
  block. Same approach as `assign-menu-items`; the search_path
  guard is mandatory on both.

### 3.10 What this design does not do (out of scope)

- **No general-purpose drop deletion.** `remove-event-window` is
  scoped to drops that are part of a window group (Section 3.3
  refusal 6). Soloist drop deletion is a separate concern; today
  the platform has no in-app delete-soloist surface and PR 4b does
  not introduce one. Vendors archive drops via
  `transition-drop-status`.
- **No force-override on orders.** Section 3.4 spells out the
  reasoning; the function deliberately leaves no flag for it.
- **No cross-drop data migration.** A future "merge orders from
  Window 2 into Window 1 before removing Window 2" flow is its own
  function.
- **No client-side coherence rendering.** After a successful
  response, the client refreshes its view; the post-delete
  `renderExistingWindows()` re-render today (the path that
  contained the W-1 parent-clear write) is replaced by a state
  update from the response and a normal re-render.

---

## Section 4 — Client-side migration plan

This section describes how each of the eight call sites in
`drop-manager.html` changes once the new Edge Functions
(`assign-menu-items`, `remove-event-window`) and the widened
`create-drop` / `update-drop` whitelists are in place. The aim is
zero remaining direct-PostgREST writes on `drops` and
`drop_menu_items` from this page.

### 4.0 Preconditions (function widenings required for the migration)

The migration assumes three small whitelist widenings beyond the
new functions described in Sections 2 and 3. Each is a one-line
addition; the build prompt should land them alongside the function
work, not as a follow-up.

- **`update-drop` accepts `series_id` and `series_position`.**
  Required for the template-promotion case in call site 2 (a
  one-off drop being converted to the position-1 template of a new
  series). Validation: both must be present together or both null;
  `series_id` must be a uuid; `series_position` must be an integer
  >= 1.
- **`update-drop` accepts `window_group_id`.** Required to retire
  call site 5's residual stamp. Validation: must be a uuid or null.
- **`create-drop` accepts `series_id`, `series_position`, and
  `window_group_id` at creation time.** Required so that newly
  generated siblings carry the clone-mode shape without a
  follow-up stamp. T5-B13 noted these as "stamped on creation only
  via create-drop's widened whitelist" — this is that widening.

These additions do not contradict T5-B13's framing. T5-B13 said
clone-mode shape fields are stamped on creation, which `create-drop`
now does directly. The post-creation update path (`update-drop`)
needs them only for the rare promotion case where an existing
soloist drop is folded into a new series, which today's saveDrop
series branch already supports as a UX. Excluding these fields
from `update-drop` would force a UX regression — easier to widen
the whitelist with explicit validation.

### 4.1 Call site 1 — `saveAssignments` → `assign-menu-items` bulk-replace

**New code shape.** Replace the body of `saveAssignments()`
(`drop-manager.html:3360–3465`) with a single Edge Function call:

```js
async function saveAssignments() {
  const enabledRows = getEnabledAssignments();
  const items = enabledRows.map((row, index) => buildAssignmentItem(row, index));

  const { data, error } = await supabase.functions.invoke("assign-menu-items", {
    body: { vendor_id: state.vendorId, drop_id: state.selectedDropId, items }
  });
  if (error) throw error;
  if (!data || data.error) throw new Error(data?.error || "Unable to save menu items");

  state.dropMenuItems = data.items;  // server-returned authoritative state
}
```

`buildAssignmentItem(row, index)` is the existing per-row
normalisation logic from lines 3363–3411, lifted into a small helper.

**Direct-PostgREST writes retired.** All three writes inside
`saveAssignments`: the product upsert, the bundle upsert, and the
delete. None remain.

**State management.** Today the function mutates the database and
relies on a follow-up `loadSelectedDrop()` to refresh
`state.dropMenuItems`. After migration, the response from
`assign-menu-items` (Section 2.7) returns the full post-write rows
sorted by `sort_order`; the client assigns this directly to
`state.dropMenuItems`, eliminating the round-trip and removing a
class of stale-state bugs.

### 4.2 Call site 2 — `saveDrop` series branch: template promotion

**New code shape.** The three-field stamp (lines 3566–3571) goes
away. The template's series shape is set via the same `update-drop`
call that already writes the form payload, with `series_id` and
`series_position` now in the request body:

```js
payload.series_id        = seriesId;
payload.series_position  = 1;
// status no longer in the payload — see below

const { data: updatedTemplate, error } = await supabase.functions.invoke("update-drop", {
  body: { vendor_id: state.vendorId, drop_id: state.selectedDropId, fields: payload }
});
if (error) throw error;
```

**Direct-PostgREST writes retired.** The `series_id` /
`series_position` / `status` stamp at lines 3566–3571 is removed
entirely. Two of the three fields move into the existing
`update-drop` call (now whitelisted per 4.0). The third — `status:
"draft"` — has nowhere to go and should not be written in the first
place: a one-off drop being promoted to a series template is
already a draft (the saveDrop series branch only fires when
`isRecurring && !alreadyInSeries`, and the UI only allows the
recurring toggle on a draft). The current code's `status: "draft"`
write is a defensive no-op against a UI state that can't actually
occur. Drop it. If a future reshuffle exposes a non-draft drop to
this branch, `transition-drop-status` is the correct path; silently
demoting via `update-drop` was always the wrong shape.

**State management.** `update-drop` returns the updated row;
existing flow already updates `state.drop` from the response.

### 4.3 Call site 3 — `saveDrop` series branch: sibling drops INSERT → `create-drop` loop

**New code shape.** Replace the bulk INSERT (lines 3601–3604) with
a per-sibling `create-drop` invocation, carrying the clone-mode
shape fields at creation:

```js
const createdSiblings = [];
for (const occ of occurrences.slice(1)) {
  const position = createdSiblings.length + 2;
  const siblingFields = {
    ...siblingPayload(payload, occ, position, seriesId),
    // series_id / series_position now accepted at creation
  };
  const { data, error } = await supabase.functions.invoke("create-drop", {
    body: { vendor_id: state.vendorId, fields: siblingFields }
  });
  if (error) throw new Error(`Failed creating series occurrence ${position}: ${error.message}`);
  if (!data || data.error) throw new Error(data?.error || `Failed creating series occurrence ${position}`);
  createdSiblings.push({ occurrence: occ, drop: data });
}
```

**Direct-PostgREST writes retired.** The bulk INSERT at lines
3601–3604.

**State management.** Each `create-drop` returns the new row.
Append to an in-memory list during the loop; the final
`loadDrops()` / `loadSelectedDrop()` refresh at lines 3634–3635 is
retained because the user is about to look at the list view (a
single composite refresh is cheaper than threading 5–20 incremental
mutations through the client model).

**Error handling.** No partial-rollback infrastructure. If the
loop fails on occurrence N, occurrences 1..N-1 are persisted and
N..end are not. The user sees `"Failed creating series occurrence
3 of 5: <reason>"` via `setSaveState("error", ...)`. Recovery is
manual — the user opens the drop list, sees the partial siblings,
and either fills in the rest by editing the series timing or
deletes the partial siblings. The series template (the original
drop) at this point has `series_id` set and is position 1, so it
remains coherent on its own.

This is consistent with how the platform handles partial failures
elsewhere (the existing direct PostgREST INSERT could leave the
template in series-mode but with no siblings if the INSERT failed
— same end-state, marginally less clear error surface). The
migration does not regress this property; it just makes the failure
point legible (one failed `create-drop` invocation, named by
sibling position).

### 4.4 Call site 4 — `saveDrop` series branch: clone drop_menu_items → `assign-menu-items` clone loop

**New code shape.** After each successful `create-drop` in 4.3,
invoke `assign-menu-items` in clone mode, sourcing from the
template:

```js
for (const sibling of createdSiblings) {
  const { error } = await supabase.functions.invoke("assign-menu-items", {
    body: {
      vendor_id: state.vendorId,
      drop_id: sibling.drop.id,
      clone_from_drop_id: state.selectedDropId  // template drop
    }
  });
  if (error) throw new Error(`Failed assigning menu to occurrence: ${error.message}`);
}
```

This can run inside the same per-sibling loop as 4.3 (one iteration
= create + assign) or as a second pass after all siblings are
created. The interleaved version surfaces failures earlier and
keeps the response time linear in the number of siblings; the
two-pass version is structurally cleaner but identical in
behaviour. Recommend interleaved.

**Direct-PostgREST writes retired.** The fetch-template-and-bulk-
INSERT at lines 3577–3631. The template fetch goes away because
`assign-menu-items` clone-mode does the equivalent fetch
server-side (Section 2.6 hydration sequence).

**State management.** No client state to update for sibling drop
menus — they are not the currently-selected drop. The eventual
`loadDrops()` refresh at line 3634 handles drop-list rendering;
sibling menus are fetched lazily when the user selects one.

**Error handling.** If `create-drop` succeeded but
`assign-menu-items` fails for a sibling, the sibling exists with
no menu. The user sees the named failure and can either retry from
the drop list or accept and reassign manually. Mirrors 4.3's
shape.

### 4.5 Call site 5 — `handleCreateEventWindows` window_group_id stamp → `update-drop`

**New code shape.** Replace the direct stamp at lines 4003–4008
with an `update-drop` call:

```js
const windowGroupId = crypto.randomUUID();

const { error: updateErr } = await supabase.functions.invoke("update-drop", {
  body: {
    vendor_id: state.vendorId,
    drop_id: state.selectedDropId,
    fields: { window_group_id: windowGroupId }
  }
});
if (updateErr) throw updateErr;
```

**Direct-PostgREST writes retired.** The `.from("drops").update({
window_group_id })` at lines 4003–4008.

**State management.** `update-drop` returns the updated row;
update `state.drop.window_group_id = windowGroupId` from the
response so the immediate next loop iteration (calling
`createEventWindow`) sees a consistent in-memory drop.

**Note.** `update-drop` whitelisting `window_group_id` is one of
the preconditions in Section 4.0. If the build prompt elects not
to widen `update-drop` for this field, the alternative is to have
`create-drop` (called per child window in 4.6) accept a
`stamp_parent_window_group_id` flag and perform the stamp atomically
with the first sibling's creation. Either is acceptable; the
explicit stamp is clearer and is recommended.

### 4.6 Call site 6 — `duplicateDrop` → `create-drop` + `assign-menu-items` clone-mode

**New code shape.** Replace the two-write block (lines 3759–3796)
with two Edge Function calls:

```js
const duplicatePayload = buildDuplicatePayload(sourceDrop);  // existing logic, lines 3745–3757
const { data: insertedDrop, error: insertDropError } = await supabase.functions.invoke("create-drop", {
  body: { vendor_id: state.vendorId, fields: duplicatePayload }
});
if (insertDropError) throw insertDropError;
if (!insertedDrop || insertedDrop.error) throw new Error(insertedDrop?.error || "Duplicate failed");

const { error: assignError } = await supabase.functions.invoke("assign-menu-items", {
  body: {
    vendor_id: state.vendorId,
    drop_id: insertedDrop.id,
    clone_from_drop_id: targetId   // source drop
  }
});
if (assignError) throw assignError;

state.selectedDropId = insertedDrop.id;
```

**Direct-PostgREST writes retired.** The drops INSERT
(lines 3759–3763) and the drop_menu_items INSERT (lines 3792–3795).
The source-fetch reads (lines 3730–3743) are no longer needed
client-side: `create-drop` already takes the fields shape directly,
and `assign-menu-items` clone-mode does the source fetch
server-side.

**Cross-vendor reference closure.** This is one of the three
clone-mode call sites flagged in Section 1's cross-cutting
observations. Today the flow trusts that the source's `host_id`,
`capacity_category_id`, `product_id`, and `bundle_id` belong to
the calling vendor. After migration, `create-drop`'s host /
capacity-category ownership checks plus `assign-menu-items`' per-
item product/bundle checks (Section 2.3) close the gap server-side.

**State management.** `create-drop` returns the new row; the
existing `refreshAll()` at line 3801 is retained.

### 4.7 Call site 7 — `createEventWindow` → `create-drop` + `assign-menu-items` clone-mode

**New code shape.** Mirrors 4.6, with the source-drop fetch and
window-counting logic preserved (the per-host window count drives
the `"— Window N"` name suffix and is only readable client-side):

```js
async function createEventWindow(dropId, timingOverride, windowGroupId) {
  const targetId = dropId || state.selectedDropId;
  if (!targetId) return;

  const sourceDrop = await fetchSourceDrop(targetId);             // existing read
  const windowCount = await computeWindowCount(sourceDrop);        // existing read
  const windowPayload = buildWindowPayload(sourceDrop, timingOverride, windowGroupId, windowCount);

  const { data: insertedDrop, error: insertDropError } = await supabase.functions.invoke("create-drop", {
    body: { vendor_id: state.vendorId, fields: windowPayload }
  });
  if (insertDropError) throw insertDropError;
  if (!insertedDrop || insertedDrop.error) throw new Error(insertedDrop?.error || "Window creation failed");

  const { error: assignError } = await supabase.functions.invoke("assign-menu-items", {
    body: {
      vendor_id: state.vendorId,
      drop_id: insertedDrop.id,
      clone_from_drop_id: targetId
    }
  });
  if (assignError) throw assignError;

  state.selectedDropId = insertedDrop.id;
  state.currentStage = "timing";
  await refreshAll();
  isDirty = false;
  showDuplicateBanner();
}
```

**Direct-PostgREST writes retired.** The drops INSERT
(lines 3873–3877) and the drop_menu_items INSERT (lines 3906–3909).

**Cross-vendor reference closure.** Same as 4.6.

**State management.** Same as 4.6.

### 4.8 Call site 8 — `renderExistingWindows` confirm-remove → `remove-event-window`

**New code shape.** Replace the click handler body
(`drop-manager.html:4960–4980`) with a single Edge Function call:

```js
const ewConfirmLink = e.target.closest(".js-confirm-remove-window");
if (ewConfirmLink) {
  e.stopPropagation();
  e.preventDefault();
  const dropId = ewConfirmLink.getAttribute("data-drop-id");
  if (!dropId) return;
  try {
    const { data, error: delErr } = await supabase.functions.invoke("remove-event-window", {
      body: { vendor_id: state.vendorId, drop_id: dropId }
    });
    if (delErr) throw delErr;
    if (!data || data.error) throw new Error(data?.error || "Unable to remove window.");

    if (data.group_dissolved && data.survivor_drop_id === state.selectedDropId) {
      state.drop.window_group_id = null;
    }

    existingWindowsLoaded = false;
    await renderExistingWindows();
  } catch (err) {
    console.error("Delete window error:", err);
    showError(err.message || "Unable to remove window.");
  }
  return;
}
```

**Direct-PostgREST writes retired.** Both writes from W-1 / W-2:

- The sibling delete at lines 4967–4970 (had no `vendor_id`
  filter).
- The parent-clear at lines 4057–4070 inside
  `renderExistingWindows()` (had no `vendor_id` filter, lived in
  the renderer rather than the click handler).

**State management.** `remove-event-window`'s response (Section
3.8) reports `group_dissolved` and `survivor_drop_id`. The client
applies the survivor un-grouping to `state.drop.window_group_id`
directly when the survivor is the currently-selected drop. This
replaces the implicit "next render figures it out" pattern with an
explicit state update from the response.

**Renderer simplification.** The parent-clear block at lines
4057–4070 is removed. `renderExistingWindows()` reverts to a
straightforward "fetch siblings, render them" function with no
side effects. The "no siblings remain → switch UI back to creation
mode" branch becomes a pure UI condition driven by the post-
response `state.drop.window_group_id` value, not a database write
side effect.

### 4.9 Survivor-clear has no side effects on the survivor's orders

Surfaced as an open question in the Section 3 review and worth
making explicit here so the migration plan is self-contained.

`window_group_id` on `drops` is a grouping marker only. It
participates in no other column's semantics:

- `orders.drop_id` references `drops.id` — orders are scoped to a
  single drop, never to a window group. Clearing `window_group_id`
  on the survivor does not move, modify, or invalidate any order.
- `drop_menu_items.drop_id` references `drops.id` likewise — the
  survivor's menu rows are unaffected.
- No FK targets `window_group_id` itself; no view aggregates by
  it. SCHEMA.md confirms there is no `window_groups` parent table.

When `remove-event-window` clears `window_group_id` on the
survivor, the survivor becomes a soloist drop with all of its
existing orders, menu items, capacity, host, and timing intact.
The only observable change is that
`renderExistingWindows()` no longer applies (the survivor has no
group to render windows for) and `eventWindowsBlock` reverts to
creation mode in the UI.

### 4.10 Summary — what changes per call site

| # | Call site | New shape | Direct-PostgREST writes retired |
|---|---|---|---|
| 1 | `saveAssignments` | `assign-menu-items` (bulk-replace, items[]) | Product upsert, bundle upsert, delete-by-id |
| 2 | `saveDrop` series: template promotion | `update-drop` carries `series_id` / `series_position` (whitelist widened); `status: "draft"` write dropped entirely | Three-field stamp on `drops` |
| 3 | `saveDrop` series: sibling drops | Per-sibling `create-drop` loop (clone-mode shape fields at creation) | Bulk INSERT on `drops` |
| 4 | `saveDrop` series: clone menus | Per-sibling `assign-menu-items` clone-mode (interleaved with 3) | Bulk INSERT on `drop_menu_items`; template fetch read |
| 5 | `handleCreateEventWindows` group stamp | `update-drop` carries `window_group_id` (whitelist widened) | Stamp on `drops` |
| 6 | `duplicateDrop` | `create-drop` + `assign-menu-items` clone-mode | Drops INSERT, drop_menu_items INSERT |
| 7 | `createEventWindow` | `create-drop` + `assign-menu-items` clone-mode | Drops INSERT, drop_menu_items INSERT |
| 8 | `renderExistingWindows` confirm-remove | `remove-event-window` (subsumes both W-1 / W-2 writes) | Sibling delete on `drops`; parent-clear update on `drops` |

All eight call sites converge on Edge Function invocations. After
PR 4b, `drop-manager.html` contains zero direct-PostgREST writes
to `drops` or `drop_menu_items`. The remaining direct-PostgREST
reads on these tables (drop list rendering, source-drop fetches in
`createEventWindow`, sibling listing in `renderExistingWindows`)
are out of scope for PR 4b — the auth-not-attached read failures
flagged in T5-B17 affect those paths but are tracked separately.

---

## Section 5 — Layer-of-bugs analysis

For each surface PR 4b is migrating, what is currently masked by the
broken or insecure behaviour we are about to fix? Concrete findings
from reading the code; speculation about future surfaces lives in
Section 10.

### 5.1 — assign-menu-items cross-vendor validation

**Finding: nothing today requires cross-vendor enablement; the
validation in Section 2.3 is purely additive.**

The two consuming paths in `drop-manager.html` and the Service
Board both degrade gracefully when a `drop_menu_items` row
references a product or bundle the current vendor does not own:

- **`buildMenuAssignments()` at `drop-manager.html:2416–2497`**
  composes the catalogue from `state.products` and `state.bundles`
  (vendor-scoped reads). A `drop_menu_items` row whose `product_id`
  / `bundle_id` is not in the catalogue falls into the
  `missingAssigned` branch (lines 2464–2497), which renders a row
  named `"Missing product"` / `"Missing bundle"` with `null`
  description and `catalogue_is_active: false`. No crash, no data
  leak — the foreign reference simply renders as a placeholder.
- **`enrichItemDetailsWithProductData()` at
  `service-board.html:1672–1708`** fetches products by id with
  `.in("id", missingIds)` and **no vendor filter** (lines 1683–
  1686). A foreign `product_id` would be enriched with the foreign
  product's `category_id` / `capacity_units` and rendered. This is
  a latent vendor-isolation gap, but not one PR 4b creates — it
  exists today regardless. Worth flagging in the broader RLS audit
  (T5-B14 territory) but out of scope here.

No flow exists that intentionally enables another vendor's products
on a drop. The cross-vendor validation in `assign-menu-items`
(Section 2.3) closes the write surface; the read-side gap above is
a separate item to defend at the view / RLS layer.

### 5.2 — remove-event-window orders-presence check

**Finding: today's no-orders-check delete silently corrupts at
least two downstream analytics surfaces.**

The cascade chain — `orders.drop_id`, `order_status_events.drop_id`,
`drop_menu_items.drop_id`, `drop_products.drop_id`, all ON DELETE
CASCADE on `drops.id` — means deleting a sibling drop with orders
wipes every row tied to it. Consumers that aggregate across orders
are not warned and have no way to detect the loss after the fact.

Two concrete corruption surfaces:

- **`scorecard.html:684–703` "new vs returning" classification.**
  `priorCustomers` is built from `orders.customer_email` filtered
  to `o.drop_id !== dropId`. If a vendor deletes a sibling drop
  with orders, customers who ordered **only** from the deleted
  drop disappear from `priorCustomers`. On any future scorecard
  run, those customers are classified as new even though they had
  prior orders. The misclassification is silent — the per-drop
  scorecard's "X new, Y returning" copy reads consistently — and
  irreversible (the data is gone from the database).
- **`assets/hearth-intelligence.js` customer segmentation
  (lines 528–576).** `segmentCustomers()` partitions on
  `customer.order_count`. If a customer's order history straddled
  the deleted drop, their order count silently decreases. A
  loyalCore customer (3+ orders) can demote to occasional (exactly
  2 orders) without any vendor action. Affects Customers page
  segments, Home dashboard recommendations, and Insights
  archetype detection.

A third surface is structural rather than analytical:

- **`order_status_events` audit history.** The cascade also wipes
  every status event for the deleted drop — the trail of "draft →
  scheduled → live → closed" with timestamps is gone. No surface
  in the platform currently reads this audit data routinely, but
  any future incident review or compliance request loses the
  history with no trace.

PR 4b's orders-presence refusal (Section 3.4 condition 7) prevents
this cascade from ever firing on a drop with orders. The fix is
not just a UX improvement — it is the only thing standing between
today's window-removal flow and silent multi-surface data loss.

### 5.3 — dropStatus dropdown removal

**Finding: confirmed silent-no-op on save; no flow uses the
dropdown to drive a transition; no UX is lost by removal.**

Inventoried every reference to `dropStatus` in `drop-manager.html`
(complete list, no others exist):

| Line | Reference | Effect today |
|---|---|---|
| 925–936 | `<select id="dropStatus">` element | Visible on form. |
| 2746 | `byId("dropStatus").value = d.status \|\| "draft"` | Read-only display from DB on load. |
| 3278 | `status: byId("dropStatus").value` | **Silent no-op** — value flows into payload, `update-drop` whitelist drops it, `loadSelectedDrop()` on next render resets the dropdown to actual DB status. |
| 4163, 4178 | `'#dropStatus option[value="live"]'` | `renderStripeGate` toggles `disabled` on the Live option. |
| 4663 | Form-wiring loop | Included in bulk markDirty array. |

No transition is driven by the dropdown's change event. Lifecycle
buttons (`publishBtn`, `cancelDropBtn`, `archiveDropBtn` at lines
4810–4850) call `updateDropStatus(target)` → `transition-drop-status`
directly — they read nothing from the dropdown.

The save-path no-op is a real UX bug, not just a maintenance
nuisance. A vendor selecting "cancelled" from the dropdown and
clicking Save Draft sees `setSaveState("saved")` flash green, then
on the next render the dropdown reverts to its actual status. The
vendor reasonably believes they cancelled the drop. They have not.
Removing the dropdown closes the confusion path entirely; the
cancel button is the only legitimate cancel surface.

The Stripe gate's "Live option disabled" affordance (lines 4163,
4178) is the only legitimate function the dropdown still serves,
and Section 0.6 W-3 already specifies its replacement: disable the
publish button when Stripe is gated. No UX is lost.

### 5.4 — capacity_category client-throw retirement

**Finding: retirement is safe. The publish gate already enforces
capacity invariants server-side; the client throw forces the same
constraint earlier than necessary and breaks valid draft workflows.**

The throw at `drop-manager.html:3519` fires on every save — draft
or otherwise. It refuses to persist a drop without
`capacity_category_id` and `capacity_category` set.

What it currently protects:

- **Nothing not also enforced server-side at publish time.**
  `transition-drop-status/index.ts:71–74` refuses any transition
  to a non-draft status if `capacity_category_id` is null,
  `capacity_category` is null, or `capacity_units_total` is not a
  finite number > 0. The publish gate is the actual invariant.

What downstream code does on a null capacity_category:

- **`getCapacityCategoryLabel()` at `drop-manager.html:1681–1691`**
  returns `titleCase(dropLike?.capacity_category || "Units")`.
  Falls back to the literal string "Units" when null.
- **`order.html:1493–1505` `getCategoryDisplayName()`** falls back
  through three lookups before returning `"Items"`. No crash.
- **Demand preview and capacity calculations** read
  `capacity_units_total` and per-item `capacity_units`, never
  `capacity_category` itself. The text slug is purely a label.
- **Readiness checklist (`drop-manager.html:1812–1822`)** already
  treats `capacity_category` as a `basics_complete` predicate.
  Without it set, the checklist shows Basics as incomplete — which
  is the correct, visible signal to the vendor that the field
  needs filling before publish.

What user-facing behaviour changes after retirement:

- A vendor can save a half-built draft without picking a capacity
  category. Useful — currently the only way to escape the throw is
  to make a category choice that may not yet be considered.
- The Basics readiness row continues to flag the missing field.
- Publish remains blocked server-side until the field is set.

The latent gap on `update-drop` (W-4: a `capacity_category` text
write without a `capacity_category_id` is not reconciled
server-side) is real but not exercised by any current call site —
`getDropPayload()` always emits both fields together. PR 4b should
tighten `update-drop` to refuse a `capacity_category` write that
is not paired with a matching `capacity_category_id`, as a
side-effect of the client retirement. Section 7 covers this.

---

## Section 6 — `dropStatus` dropdown removal scope

Surgical scope for Deliverable 4. Section 0.6 W-3 inventoried the
references; Section 5.3 confirmed no UX is lost. This section
locks the change set, sequences the edits so dangling references
cannot land mid-PR, and specifies the replacement for the
`renderStripeGate` consumers.

### 6.1 Inventory — every reference, verified at `origin/main` @ 5e917e2

All references exist in `drop-manager.html`. Line numbers re-checked
against current code; Section 0.6's inventory is accurate to the
line.

| Site | Lines | Reference | Action |
|---|---|---|---|
| 1 | 924–936 | `<div class="field"><label for="dropStatus">…</label><select id="dropStatus">…7 options…</select><div class="helperText">…</div></div>` | Delete the entire `.field` block. |
| 2 | 2746 | `byId("dropStatus").value = d.status \|\| "draft";` (in `populateForm()`) | Delete the line. |
| 3 | 3278 | `status: byId("dropStatus").value,` (in `readDropFromForm()`) | Delete the line. `...existing` spread (line 3274) keeps `state.drop.status` flowing through unchanged. |
| 4 | 3329 | `status: dropData.status,` (in `getDropPayload()`) | Delete the line. `update-drop`'s whitelist already drops it server-side; the field has no role on the wire. |
| 5 | 4163–4164 | `const liveOpt = document.querySelector('#dropStatus option[value="live"]'); if (liveOpt) liveOpt.disabled = false;` (in `renderStripeGate()`, gate-cleared branch) | Delete both lines. |
| 6 | 4178–4179 | `const liveOpt = document.querySelector('#dropStatus option[value="live"]'); if (liveOpt) liveOpt.disabled = true;` (in `renderStripeGate()`, gate-active branch) | Delete both lines. |
| 7 | 4663 | `"dropType", "dropStatus", "hostSelect", …` (form-wiring `markDirty` array) | Remove the `"dropStatus"` token only; keep the array and surrounding entries. |

Seven edits in one file. No edits required in any other file —
the dropdown is referenced only from `drop-manager.html` (verified
by grep across the repo).

### 6.2 Replacement for the `renderStripeGate` consumers

The two `#dropStatus option[value="live"]` queries (sites 5 and 6)
are the only remaining behaviour the dropdown still drives — the
"Live option greyed out when Stripe is gated" affordance.

**Finding: the replacement is already implemented elsewhere.**

`renderReview()` at `drop-manager.html:3237–3247` already disables
the publish button and sets explanatory help text when
`isStripeGated()` returns true:

```js
if (isStripeGated()) {
  publishHelp.textContent = "Finish payment setup in Setup before publishing drops.";
  publishBtn.disabled = true;
} else if (readiness.ready_to_publish) {
  // …
}
```

`renderStripeGate()` and `renderReview()` both fire on every
`renderEverything()` call (lines 4135 and 4146). The
publish-button disabled state is the user-facing affordance the
gate needs; the dropdown's greyed-out option was a redundant second
signal.

**Replacement strategy: rely on the existing `renderReview()`
path.** No new code required. The orange `#stripeGate` banner
(lines 4168–4176) continues to render as the primary "why is
publish blocked" message, and the disabled `publishBtn` continues
to be the affordance. Sites 5 and 6 in the inventory are simply
deleted — there is nothing to replace them with.

The `isStripeGated()` helper at line 4152 is the right read-side
for any future code; no new state field is needed.

Visible disabled treatment is whatever `publishBtn.disabled = true`
already produces — the existing CSS for disabled `btnAccent`
buttons. No opacity / text / tooltip changes are part of PR 4b.
The publishHelpText at line 3238 supplies the explanatory copy;
the disabled cursor and reduced contrast on the button are
inherited from the platform's button styling.

### 6.3 Removal checklist — execution order

Sequencing matters because each step removes a dependency the next
step relies on. Reorderings can leave dangling references that
fail at runtime. Execute the seven edits in this order in a single
commit:

1. **Site 6** (lines 4178–4179) — delete the gate-active query
   first. Removing the gated branch's effect before the element is
   gone is harmless: `liveOpt` returns `null`, `if (liveOpt)`
   short-circuits, no error.
2. **Site 5** (lines 4163–4164) — delete the gate-cleared query.
   Same short-circuit reasoning.
3. **Site 7** (line 4663) — remove `"dropStatus"` from the
   form-wiring `markDirty` array. With the element still present,
   the wiring loop's `byId(id)` returns the element and `if (!el)
   return` is bypassed. Removing the token is safe at this point
   because the dropdown is still rendered but no other code reads
   it.
4. **Site 4** (line 3329) — drop `status: dropData.status` from
   `getDropPayload()`. Server already discards it; removing the
   field on the wire is a no-op.
5. **Site 3** (line 3278) — drop `status: byId("dropStatus").value`
   from `readDropFromForm()`. Order matters: `getDropPayload()`
   (modified in step 4) no longer reads `status`, so the read in
   `readDropFromForm` becomes orphaned. The `...existing` spread
   on line 3274 still carries `state.drop.status` through for any
   other reader (`renderReview()`'s summary, `getLiveReadiness()`,
   the publish-button textContent at line 3235), so the data path
   is preserved.
6. **Site 2** (line 2746) — drop the populateForm assignment. By
   this point no read path consumes the dropdown's value, so the
   write path is safely orphaned.
7. **Site 1** (lines 924–936) — delete the markup block. With all
   JS references gone, `byId("dropStatus")` returns null nowhere
   the result is consumed.

Reverse-engineering the order: leaves first (consumers of the
dropdown's value), root last (the markup itself). The short-circuit
checks in `renderStripeGate` and the form-wiring loop are the only
runtime safeties; both tolerate the element being present without
the JS, but not the JS being present without the element. Hence
JS first, markup last.

### 6.4 Verification path

Before the change, in browser console on
`drop-manager.html?vendor=southbury-farm-pizza`:

```js
> document.getElementById("dropStatus")
< <select id="dropStatus">…</select>
> document.querySelector('#dropStatus option[value="live"]')
< <option value="live">Live</option>
> document.querySelector('#dropStatus option[value="live"]').disabled
< true   // when Stripe is gated (Test 12 fixture)
< false  // when Stripe is connected (Test 11 / production fixtures)
```

After the change, on the same URL:

```js
> document.getElementById("dropStatus")
< null
> document.querySelector('#dropStatus option[value="live"]')
< null
```

Behavioural verification on the publish button:

- **Test 12 fixture** (`stripe_onboarding_complete = false`).
  Open Drop Studio, select any draft drop, navigate to the Review
  pane. Expect: orange Stripe banner visible at top of page,
  publish button disabled, help text reads "Finish payment setup
  in Setup before publishing drops."
- **Test 11 fixture or southbury-farm-pizza**
  (`stripe_onboarding_complete = true`). Same flow. Expect: no
  Stripe banner, publish button enabled when readiness checklist
  passes, help text reads "This drop is ready to publish."
- **Save a draft and re-open it.** Expect: the Status row in
  Review summary still reads the actual database status (drawn
  from `liveDrop.status` at line 3203). Removing the dropdown
  does not remove status visibility — it remains visible read-only
  in the Review summary.

The silent-no-op verification is the most important behavioural
check. Pre-change, selecting "cancelled" from the dropdown and
clicking Save Draft flashes "Saved" briefly then reverts. Post-
change, that path no longer exists — the only cancel surface is
the dedicated `cancelDropBtn`, which routes through
`transition-drop-status` and either succeeds with a "Drop
cancelled" toast or fails with a server-side reason.

### 6.5 Backwards compatibility

None required. This is a UI element removal; no public surface
depends on the dropdown.

Browser-cached HTML is not the function's concern. A vendor with a
stale cached page would briefly see the old dropdown until the
next hard refresh, at which point it disappears with the rest of
the page reload. No data corruption is possible during the
transition window — the save-path no-op behaves identically (silent
discard) before and after the removal.

### 6.6 Out-of-scope cleanup notes

- **Status enum values.** The seven option values
  (`draft / scheduled / live / closed / completed / cancelled /
  archived`) are also referenced in `transition-drop-status`
  validation, in `v_drop_summary` filtering, and in
  `service-board.html` status normalisation. They remain valid
  status values; the dropdown was just one read surface for them.
  No enum-level cleanup required by this PR.
- **`renderStripeGate()` itself.** After sites 5 and 6 are
  removed, the function reduces to "show or hide the orange
  banner." It still has work to do (the banner is the primary
  explanatory copy for the gate state) and should not be deleted.
  Renaming it to something more accurate (e.g.
  `renderStripeBanner`) is tempting but out of scope.
- **`getDropPayload()` field shape.** With `status` removed, the
  payload now contains exactly the fields `update-drop`'s
  whitelist accepts plus the three clone-mode fields covered in
  Section 4 preconditions (`series_id`, `series_position`,
  `window_group_id`). No further trimming is required by this PR.
- **`populateForm()` shape.** The function continues to populate
  every other field on the form. The removal of the dropdown
  assignment leaves the function structurally unchanged.
- **HTML element id `dropStatus`.** No CSS rule references it
  (verified by grep on `assets/hearth.css` and the inline `<style>`
  block in `drop-manager.html`). No further CSS cleanup required.

---

## Section 7 — `capacity_category` client-throw retirement

Surgical scope for Deliverable 5. Section 0.7 W-4 characterised
`update-drop`'s actual behaviour (the function reconciles `capacity_category` from `capacity_category_id` when the FK is present, but lets an orphan text write pass through if only the slug is sent). Section 5.4 confirmed retirement of the client throw is safe — the publish gate enforces capacity invariants server-side, and downstream consumers degrade gracefully on null. This section locks the change set on both sides (client retirement + server tightening) and the prerequisite data check.

### 7.1 Client change — remove the save-time throw

**Single line to delete.** Verified against current code:

```js
3517      let dropData = readDropFromForm();
3518      if (!dropData.slug) throw new Error("Drop Link Name is required.");
3519      if (!dropData.capacity_category_id || !dropData.capacity_category) throw new Error("Capacity Category is required.");
3520
3521      dropData.slug = buildUniqueSlug(dropData.slug, state.selectedDropId);
```

The edit deletes line 3519 in its entirety. Lines 3517, 3518,
3520, 3521 remain unchanged. The slug-required throw at 3518
stays — `slug` is structurally required (used as the URL key,
unique constraint enforced) and has no server-side equivalent
that would catch a missing slug at save time. It is a different
class of validation from capacity_category and is not in scope
for this deliverable.

No other client edits are required for the retirement. The form's
capacity_category select element, `populateCapacityCategoryOptions()`,
`getCategoryById()`, `getCapacityCategoryLabel()`, and the
readiness predicate at lines 1819–1820 all continue to operate
correctly with null values:

- The select element renders with no option chosen when both
  fields are null.
- `getCapacityCategoryLabel()` falls back to `"Units"`.
- The Basics readiness row (`basics_complete` predicate at
  line 1815) continues to evaluate `false` when either field is
  null — meaning Drop Studio's Review pane shows Basics as
  incomplete and the publish button stays disabled until the
  vendor picks a category. That is the desired behaviour.

### 7.2 Server tightening — refuse orphan text writes on `update-drop`

W-4 identified a latent gap: `update-drop` accepts a
`capacity_category` text write that is not paired with a
`capacity_category_id`, and reconciliation does not run, so the
client-supplied text passes through unchanged. No current call
site exercises this path (`getDropPayload()` at
`drop-manager.html:3336–3337` always emits both fields together),
but a future client or a hand-crafted request could trip it. PR 4b
closes the gap as a side-effect of the client retirement.

**Insertion point.** A new guard before the existing
`capacity_category_id` block in `supabase/functions/update-drop/index.ts`. Insert immediately before line 189 (the `// capacity_category_id ownership + reconcile slug from categories.` comment):

```ts
// capacity_category text writes must be paired with capacity_category_id
// so the server can reconcile the text from the FK lookup. An orphan
// text write would bypass reconciliation and let the client supply
// arbitrary text. Refuse it.
if (
  Object.prototype.hasOwnProperty.call(update, "capacity_category") &&
  !Object.prototype.hasOwnProperty.call(update, "capacity_category_id")
) {
  return jsonResponse(
    { error: "capacity_category cannot be set without capacity_category_id" },
    400
  );
}
```

The existing block at lines 189–214 then runs unchanged:

- If `capacity_category_id` is in the payload (null or non-null):
  reconciliation runs as before — non-null FK looks up the
  category by id + vendor_id and writes the matching slug;
  null FK clears both fields together.
- If `capacity_category` is in the payload but `capacity_category_id`
  is NOT: the new guard refuses with 400.
- If neither is in the payload: existing behaviour — the field is
  simply not updated.

The guard uses `Object.prototype.hasOwnProperty.call(...)` to match
the pattern used elsewhere in the file (lines 134, 141, 150, 170,
190). Order of evaluation matters: the guard runs **before** the
existing block, so an orphan text write is rejected before any
database lookup. No behaviour change for the current client.

### 7.3 Migration prerequisite — SQL data check

Before the server tightening lands, run the following query against
production:

```sql
select count(*)
from drops
where capacity_category is not null
  and capacity_category_id is null;
```

**Expected result: 0.** Drop Studio's `getDropPayload()` always
sends both fields together, so the orphan state should not exist
in the wild. Confirmation via the SQL query is the contract before
merge.

**If the count is non-zero**, three options:

1. **Backfill the FK from the slug** (preferred). For each affected
   row, find the matching category by `(vendor_id, slug)` and
   stamp `capacity_category_id` with that row's id:

   ```sql
   update drops d
   set capacity_category_id = c.id
   from categories c
   where d.capacity_category_id is null
     and d.capacity_category is not null
     and c.vendor_id = d.vendor_id
     and c.slug = d.capacity_category;
   ```

   Re-run the count query after the backfill. If still non-zero,
   the remaining rows have a `capacity_category` slug that does
   not match any category for the same vendor — orphan text data.
   Decide per-row whether to clear the text or create a category.

2. **Clear the text on orphan rows** if the data is known to be
   stale and re-picking is acceptable:

   ```sql
   update drops set capacity_category = null
   where capacity_category_id is null
     and capacity_category is not null;
   ```

   Operators reopen affected drops and pick a category before the
   next save. Acceptable for drafts; disruptive for live drops.
   Pair with a vendor-comms note.

3. **Defer the server tightening** if the data is messy enough that
   neither (1) nor (2) is comfortable. The client retirement (7.1)
   can land independently — it does not depend on the server-side
   guard. Note in the PR description that W-4 is left open for a
   follow-up.

The Claude Code environment has no Supabase CLI / direct database
access (Critical rule #13), so this query is a manual prerequisite
the operator runs before merging the server-side change. The
Section 9 verification checklist should record the operator's
result inline ("count = 0; tightening safe to land").

**Important note on existing tightening behaviour.** Even without
the new guard, the existing reconciliation block already handles
the orphan-data case at runtime: when an operator reopens a drop
where `capacity_category_id` is null and saves, `getDropPayload()`
sends both fields, the reconciliation runs at lines 209–213
(`else { update.capacity_category = null; }`), and the orphan
text is cleared. The first save after the PR lands silently
fixes the data — but the operator sees the category disappear
from the UI on the next render. The backfill SQL in option (1) is
the operator-friendlier path because the text label survives.

### 7.4 Verification path

**What changes for users:**

- A vendor can save a partial draft with no capacity category set
  — capacity_category_id and capacity_category both null. Currently
  the throw at line 3519 prevents this. After retirement, the
  draft saves and the Basics readiness row continues to flag
  `basics_complete: false` until the field is filled.
- The save flow no longer throws an inline error message
  ("Capacity Category is required") at the top of the form. The
  surfacing of "this field is missing" moves entirely to the
  Review pane's readiness checklist, where it already lives.

**What does not change:**

- **Publish remains blocked server-side.**
  `transition-drop-status/index.ts:71–74` still refuses any
  transition to a non-draft status if `capacity_category_id` is
  null, `capacity_category` is null, or `capacity_units_total` is
  not finite > 0.
- **Readiness checklist still flags the missing field.**
  `getLiveReadiness()` at `drop-manager.html:1819–1820` evaluates
  `Boolean(dropData.capacity_category_id) &&
  Boolean(dropData.capacity_category)` as part of `basics_complete`.
  Vendors see "Basics complete" failing in the Review pane until
  they pick a category.
- **Order page rendering** (`order.html:1493–1505`) continues to
  fall back to `"Items"` when capacity_category is null. Customer-
  facing surfaces are unaffected because no published drop can
  reach this state — the publish gate prevents it.

**Fixtures to use:**

- **Test Vendor (slug: `test-vendor`)** — clean test workspace
  with no drops or catalogue. Create a new draft drop, leave the
  capacity field blank, click Save. Pre-change: throws "Capacity
  Category is required" inline. Post-change: save succeeds, Review
  pane shows Basics as incomplete, publish button stays disabled.
- **southbury-farm-pizza** — historical workspace with real
  categories. Create a new draft, save without picking capacity,
  reopen, pick a category, save again. Verify capacity_category
  and capacity_category_id pair correctly via the standard
  reconciliation path. No regression on the happy path.
- **Test 12 (slug: `test-12`)** — Stripe-incomplete fixture. Same
  draft-save flow as above. Verify the Stripe gate banner and
  publish-button-disabled treatment continue to render correctly
  alongside the new "no capacity category yet" draft state. The
  two gates are independent.

**Server-side guard verification.** Hand-craft a curl request to
`update-drop` that sends `capacity_category` without
`capacity_category_id`:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/update-drop" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"vendor_id":"<uuid>","drop_id":"<uuid>","fields":{"capacity_category":"pizzas"}}'
```

Expected response: 400 with body `{ "error": "capacity_category
cannot be set without capacity_category_id" }`. Mirrors the
verification surface for the host-id and capacity-category-id
ownership checks landed in PR 4a (Critical rule #12 — use the
read-style curl smoke test rather than a UI write path where
possible).

### 7.5 Out-of-scope cleanup

- **Make `capacity_category` server-derived only.** The cleanest
  end-state is one column (`capacity_category_id`) with a view or
  computed slug for read-side convenience. The current dual
  storage (FK + denormalised text) is a tech-debt item flagged in
  T5-B5 and folded into T7-13 (capacity model conceptual review).
  PR 4b should not collapse the columns — that's a schema-level
  decision that affects multiple consumers.
- **Move the slug-required throw at line 3518** to a similar
  server-side surface. `update-drop` already handles slug
  reconciliation through `buildUniqueSlug()` on the client and
  `slug` is excluded from the whitelist (Section 0.7 / `update-drop/index.ts:9–10`). The slug-required check is structurally
  different (slug is identity, not a categorisation label) and
  lives with other identity-shape concerns. Out of scope for PR 4b.
- **Tighten `transition-drop-status`'s capacity check.** The
  publish gate currently re-validates the three capacity fields
  (`capacity_category_id` non-null, `capacity_category` non-null,
  `capacity_units_total` > 0). With the server tightening in 7.2,
  the slug field is provably non-null only when the FK is
  non-null, so the second check is redundant. Removing it is a
  one-line change but adds noise to PR 4b for no behavioural
  benefit. Defer to T7-13.
- **Add a `default capacity_category` for new vendors.** The
  current `getDefaultCapacityCategory()` flow at
  `drop-manager.html:3688` populates a sensible default on
  `createNewDrop()` if the vendor has any categories. New vendors
  with zero categories see the field as blank — an onboarding
  prompt would be friendlier than relying on Drop Studio to
  surface it. Tracked separately under T4-23 (first-drop guidance)
  / T5-13 (onboarding refinements).

---

## Section 8a — Pre-merge verification

The pre-merge half of the integrated PR 4b verification ladder. The
post-merge half (UI happy-paths, direct-PostgREST grep, rollback)
lives in Section 8b.

Per Critical rule #13, the Claude Code environment has no Supabase
CLI, no Stripe credentials, and no preview-deploy access. Every
step in this section runs on the developer's Mac. Steps 8a.1 and
8a.2 are prerequisites that must complete before any curl smoke is
attempted. Steps within 8a.3 can run in any order.

Hearth has no staging environment today (T6-3 is open), so
`supabase functions deploy` writes the new functions to production.
Read-side curl smokes run against production Edge Functions and do
not mutate any vendor data. The orders-presence smoke (test 5)
targets a fixture drop that is explicitly preserved for testing —
no real order data is at risk.

### 8a.1 SQL prerequisite — orphan capacity_category data check

Hard prerequisite from Section 7.3. Run before deploying the
`update-drop` server-side guard.

Operator runs against the production Supabase project (Supabase
SQL editor or `psql` via the project's connection string):

```sql
select count(*)
from drops
where capacity_category is not null
  and capacity_category_id is null;
```

**Expected: 0.**

If the count is non-zero, **stop**. Do not deploy the server
guard. Do not merge the PR. The build session pauses pending
Edward's decision per Section 7.3 options (1) backfill the FK from
slug, (2) clear the orphan text, or (3) defer the server guard
and land only the client retirement. Whichever path is chosen,
re-run the query and confirm zero before resuming. Record the
chosen path inline in the PR description so the audit trail is
preserved.

### 8a.2 Build / deploy verification

Two artefacts to confirm before any smoke runs.

**Edge Function deploys.** From the repo root on Mac:

```bash
supabase functions deploy assign-menu-items --no-verify-jwt
supabase functions deploy remove-event-window --no-verify-jwt
supabase functions deploy update-drop --no-verify-jwt   # carries the new guard from 7.2
```

`--no-verify-jwt` matches the existing pattern (functions verify
JWTs in-function via `anonClient.auth.getUser()`; see the
`invite-vendor` / `update-drop` precedent in CLAUDE.md and
`supabase/config.toml`).

After each deploy, Supabase prints the function URL and a
deployed timestamp. Confirm:

- `assign-menu-items` and `remove-event-window` appear in the
  Supabase Dashboard → Functions list with non-zero size and a
  fresh deployed-at timestamp.
- `update-drop` shows a fresh deployed-at timestamp (the guard
  is an additive change to an existing function).

**RPC migration.** The two PL/pgSQL functions
(`assign_drop_menu_items`, `remove_event_window`) land via a
`supabase db push` (or equivalent migration) executed on Mac.
After the migration, confirm in Supabase SQL editor:

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

**Expected: two rows.** For each row:

- `is_security_definer` = `true`
- `config` includes `search_path=public, pg_temp`

Both invariants are required (Sections 2.4, 2.8, 3.7, 3.9 carry-
forwards). If either function exists without `security definer`
**or** without the search_path config, **stop** — fix the migration
and re-run before any curl smoke. A `security definer` function
without an explicit search_path is an injection surface, not a
hardening; merging in that state is worse than not migrating at
all.

### 8a.3 Read-side curl smokes — six refusal surfaces

The curls in this section all use these placeholders:

- `$SUPABASE_URL` — the production project URL (from
  `assets/config.js`).
- `$JWT` — a session JWT for Edward (or any operator with
  multi-vendor access). Obtain by signing in to
  lovehearth.co.uk in a browser, opening DevTools → Application
  → Local Storage, copying the `access_token` from the
  Supabase auth entry. Or via `supabase login` then `supabase
  status` to retrieve a session.
- Vendor and drop UUIDs come from CLAUDE.md's fixture inventory
  or from the inline SQL helpers below.

Each test refuses *before* any database write. None mutate vendor
data, including test 5 (orders-presence refuses 409 before the
delete fires).

#### Test 1 — `assign-menu-items` refuses cross-vendor `product_id`

Calling vendor: Test 11 (Stripe-connected).
Foreign vendor: southbury-farm-pizza or Test Vendor (any other).

Find suitable ids:

```sql
-- Calling-vendor drop_id (Test 11)
select id, name from drops
where vendor_id = (select id from vendors where slug = 'test-11')
limit 1;

-- Foreign vendor's product_id
select id, name from products
where vendor_id = (select id from vendors where slug = 'southbury-farm-pizza')
limit 1;
```

Curl:

```bash
curl -i -X POST "$SUPABASE_URL/functions/v1/assign-menu-items" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "vendor_id": "<test-11 vendor uuid>",
    "drop_id":   "<test-11 drop uuid>",
    "items": [
      {
        "item_type": "product",
        "menu_item_type": "product",
        "product_id": "<southbury-farm-pizza product uuid>",
        "bundle_id": null,
        "is_available": true,
        "price_override_pence": null,
        "stock_limit": null,
        "sort_order": 10
      }
    ]
  }'
```

**Expected:**

- HTTP `400`
- Body: `{"error":"One or more product_ids do not belong to this vendor"}`

Then re-run the same `select count(*) from drop_menu_items where
drop_id = '<test-11 drop uuid>';` before and after the curl —
expect identical row counts (the function refused before any
write).

#### Test 2 — `assign-menu-items` refuses cross-vendor `bundle_id`

Mirror of Test 1 with a foreign bundle_id.

```sql
select id, name from bundles
where vendor_id = (select id from vendors where slug = 'southbury-farm-pizza')
limit 1;
```

Curl:

```bash
curl -i -X POST "$SUPABASE_URL/functions/v1/assign-menu-items" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "vendor_id": "<test-11 vendor uuid>",
    "drop_id":   "<test-11 drop uuid>",
    "items": [
      {
        "item_type": "bundle",
        "menu_item_type": "bundle",
        "product_id": null,
        "bundle_id": "<southbury-farm-pizza bundle uuid>",
        "is_available": true,
        "price_override_pence": null,
        "stock_limit": null,
        "sort_order": 10
      }
    ]
  }'
```

**Expected:**

- HTTP `400`
- Body: `{"error":"One or more bundle_ids do not belong to this vendor"}`

#### Test 3 — `remove-event-window` refuses cross-vendor `drop_id`

Calling vendor: Test 11.
Target drop: a southbury-farm-pizza drop (any drop with
`window_group_id` is ideal so the soloist refusal at condition 6
doesn't preempt — but the cross-vendor refusal at condition 5
fires first by Section 3.4 ordering, so window-group membership
is not strictly required for this test).

```sql
-- Any southbury-farm-pizza drop will trip condition 5 first
select id, name, window_group_id from drops
where vendor_id = (select id from vendors where slug = 'southbury-farm-pizza')
limit 1;
```

Curl:

```bash
curl -i -X POST "$SUPABASE_URL/functions/v1/remove-event-window" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "vendor_id": "<test-11 vendor uuid>",
    "drop_id":   "<southbury-farm-pizza drop uuid>"
  }'
```

**Expected:**

- HTTP `400`
- Body: `{"error":"drop_id does not belong to this vendor"}`

Confirm via SQL that the southbury-farm-pizza drop is still
present (`select id from drops where id = '<…>';` returns the
row) — verifies the function refused before any delete.

#### Test 4 — `remove-event-window` refuses soloist drop

Calling vendor: Test 11. Target drop: a Test-11 drop with
`window_group_id IS NULL`.

```sql
select id, name from drops
where vendor_id = (select id from vendors where slug = 'test-11')
  and window_group_id is null
limit 1;
```

Curl:

```bash
curl -i -X POST "$SUPABASE_URL/functions/v1/remove-event-window" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "vendor_id": "<test-11 vendor uuid>",
    "drop_id":   "<test-11 soloist drop uuid>"
  }'
```

**Expected:**

- HTTP `400`
- Body: `{"error":"Drop is not part of a window group. To delete a soloist drop, archive it via transition-drop-status (target_status: archived)."}`

(Carry-forward applied — the message extension agreed in the
Section 3 review tells the operator the right path for soloist
deletion.)

If Test 11 has no soloist drops, fall back to creating one via
the UI (Drop Studio → Create Drop, save, then run the curl) or
swap Test 11 for any vendor with a soloist drop in the fixture
set.

#### Test 5 — `remove-event-window` refuses drop with orders (409)

The most important refusal — Section 5.2 confirmed today's no-
check delete cascades into orders, order_status_events,
drop_menu_items, drop_products. This smoke confirms the new
defence holds.

Calling vendor: southbury-farm-pizza (the only fixture with real
order history). Target drop: any southbury drop that **(a)** is
in a window group AND **(b)** has at least one order. If no such
drop exists in current fixtures, create one by adding a window
group to a drop with orders, or skip this smoke and verify via
UI in Section 8b instead — flag in the PR description.

```sql
-- Find a southbury drop in a window group with orders
select d.id, d.name, d.window_group_id, count(o.id) as order_count
from drops d
left join orders o on o.drop_id = d.id
where d.vendor_id = (select id from vendors where slug = 'southbury-farm-pizza')
  and d.window_group_id is not null
group by d.id
having count(o.id) > 0
limit 1;
```

Curl:

```bash
curl -i -X POST "$SUPABASE_URL/functions/v1/remove-event-window" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "vendor_id": "<southbury-farm-pizza vendor uuid>",
    "drop_id":   "<southbury drop uuid with orders & window_group_id>"
  }'
```

**Expected:**

- HTTP `409`
- Body: `{"error":"Cannot remove a window with existing orders"}`

Verify post-curl that the drop and its orders are intact:

```sql
select id from drops where id = '<…>';
select count(*) from orders where drop_id = '<…>';
```

Both counts should match their pre-curl values. This is the
primary regression-protection assertion for the entire PR — if
this curl returns 200 or any 2xx, **roll back immediately** (see
Section 8b) — the cascade hazard from Section 5.2 has fired.

#### Test 6 — `update-drop` refuses orphan `capacity_category` text

The server-side guard from Section 7.2. Verifies the latent gap
flagged by W-4 is closed.

Calling vendor: Test 11. Target drop: any Test-11 drop (the test
exercises the validation guard, not any specific drop content).

Curl:

```bash
curl -i -X POST "$SUPABASE_URL/functions/v1/update-drop" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "vendor_id": "<test-11 vendor uuid>",
    "drop_id":   "<test-11 drop uuid>",
    "fields": {
      "capacity_category": "pizzas"
    }
  }'
```

**Expected:**

- HTTP `400`
- Body: `{"error":"capacity_category cannot be set without capacity_category_id"}`

Counter-test (positive control). The same drop, both fields
together, expects a 200:

```bash
curl -i -X POST "$SUPABASE_URL/functions/v1/update-drop" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "vendor_id": "<test-11 vendor uuid>",
    "drop_id":   "<test-11 drop uuid>",
    "fields": {
      "capacity_category_id": "<a valid Test-11 category uuid>",
      "capacity_category": "ignored — server reconciles"
    }
  }'
```

Confirms the existing reconciliation path still runs, and that the
new guard fires only on orphan text writes.

### 8a.4 Pre-merge gate summary

| # | Check | Pass condition | If fail |
|---|---|---|---|
| 8a.1 | Orphan capacity_category SQL count | `0` | Stop. Resolve per Section 7.3 before deploy. |
| 8a.2 | Edge Function deploys | All three show fresh timestamp | Stop. Re-deploy. |
| 8a.2 | RPC migration | Both functions exist with `security definer` + `search_path=public, pg_temp` | Stop. Fix migration. Do not run smokes against a misconfigured RPC. |
| 8a.3 / 1 | assign-menu-items cross-vendor product | 400 + expected body | Block merge. Investigate validation order. |
| 8a.3 / 2 | assign-menu-items cross-vendor bundle | 400 + expected body | Block merge. |
| 8a.3 / 3 | remove-event-window cross-vendor drop | 400 + expected body | Block merge. |
| 8a.3 / 4 | remove-event-window soloist drop | 400 + expected body (with archive hint) | Block merge. |
| 8a.3 / 5 | remove-event-window orders-presence | **409** + expected body, drop + orders intact post-curl | **Roll back immediately if 2xx.** Cascade hazard active. |
| 8a.3 / 6 | update-drop orphan capacity_category | 400 + expected body; positive control returns 200 | Block merge. Investigate guard placement. |

All eight gates green → proceed to Section 8b (UI happy-paths,
direct-PostgREST grep, rollback plan).

---

## Section 8b — Post-merge verification and rollback

The post-merge half of the integrated PR 4b verification ladder.
Section 8a's curl smokes proved each Edge Function refuses the
right things. Section 8b proves the eight call sites in
`drop-manager.html` succeed at the right things, that no direct-
PostgREST writes against `drops` or `drop_menu_items` survive on
the client, and that the team has a rehearsed rollback path if
either gate fails after merge.

Per Critical rule #13, every step in this section runs on the
developer's Mac in production (Hearth has no staging — T6-3 is
open). The three fixtures named below all exist in production
today; using them avoids creating throwaway data on the live
project. UI verification is destructive only against fixture data
that is explicitly preserved for testing — no real customer or
order data is at risk.

Out of scope for this section: load testing, accessibility audits,
mobile responsive checks (covered by T3-1 acceptance criteria, not
PR 4b), and verification of reads (drop list rendering, source-drop
fetches) that PR 4b does not touch. Read paths fail under T5-B17
"auth-not-attached" today and are tracked separately.

### 8b.1 UI happy-path verification

Three fixtures, three different surface areas. Test 11 walks every
PR 4b call site end-to-end. Test 12 confirms the Stripe gate
treatment survived the `dropStatus` removal. southbury-farm-pizza
confirms no regression on production-shaped data.

For each fixture, open `drop-manager.html?vendor=<slug>` in
Chrome with DevTools → Console open. Watch for thrown exceptions
or 4xx / 5xx responses on the Network tab during each step. Any
red console output is a fail.

#### 8b.1.a Test 11 — full call-site walk

Test 11 is the Stripe-connected fixture. It carries `stripe_account_id`
populated, `stripe_onboarding_complete = true`, and is the
designated workspace for end-to-end PR 4b validation.

Walks all eight call sites from Section 4.10 in their new
Edge-Function shape. The order below is chosen so each step's
output feeds the next — the duplicate is built off the freshly-
saved drop, the event windows hang off the duplicate, and the
final remove fires against a window created in step 3.

| Step | Action | Call sites exercised | Pass condition |
|---|---|---|---|
| 1 | Create a new drop. Fill basics (name, host, timing, capacity). Save. | `create-drop` (existing PR 3 path; sanity check) | Drop appears in card list. No console errors. |
| 2 | Open the new drop. Add 3+ menu items (mix of products and bundles). Save assignments. | **Call site 1** — `saveAssignments` → `assign-menu-items` bulk-replace | "Saved" toast fires. Reopening the drop shows the same menu items selected. No console errors. Network tab shows a single POST to `/functions/v1/assign-menu-items`. |
| 3 | From the drop card kebab menu, choose **Duplicate**. | **Call site 6** — `duplicateDrop` → `create-drop` + `assign-menu-items` clone-mode | Duplicate opens with timing fields blanked (per T4-5), all other basics copied, all menu items copied. No direct PostgREST `INSERT` calls visible on Network tab. |
| 4 | On the duplicate, open the Timing pane and add two event windows (Multiple toggle on, two rows). Save. | **Call sites 5 and 7** — `handleCreateEventWindows` → `update-drop` with `window_group_id` + per-sibling `create-drop` + `assign-menu-items` clone-mode | All three drops (parent + two siblings) appear in the card list with "— Window N" suffix on siblings. Parent and siblings share `window_group_id`. Each sibling carries the parent's full menu. No direct PostgREST writes to `drops` or `drop_menu_items` on Network tab. |
| 5 | From `renderExistingWindows` UI on the parent, click **Remove** on one of the windows. Confirm the modal. | **Call site 8** — `remove-event-window` (subsumes both legacy writes) | Sibling disappears from the card list. Parent remains. If only one sibling remains, parent's `window_group_id` is preserved (this is the no-op-clear behaviour from Section 3.5). No `delete` or `update` on `drops` visible on Network tab — only the single POST to `/functions/v1/remove-event-window`. |

For every step, three invariants hold:

- **The action succeeds** (toast or navigation as expected, no
  4xx / 5xx in Network).
- **State updates without a round-trip** (the Edge Function returns
  the new state in its response body — see Sections 2.6, 3.6 — and
  the client renders from the response, not from a re-fetch).
  Verify by watching the Network tab: each step shows exactly one
  outbound request to the relevant function, not two.
- **No console errors.** Yellow warnings from third-party libraries
  (qrcode CSP eval — T5-B19) are pre-existing and not a fail.

If any step fails: capture the console output and Network tab
HAR, stop the walk, and trigger 8b.3 rollback if the failure is
unfixable in <1 hour.

#### 8b.1.b Test 12 — Stripe gate cross-reference

Test 12 is the Stripe-incomplete fixture (`stripe_account_id`
populated, `stripe_onboarding_complete = false`). Its purpose is
to verify the publish gate continues to fire correctly *after*
the `dropStatus` dropdown is removed (Section 6).

Cross-references Section 6.4 — the same behavioural assertions,
re-validated post-merge against the live build.

Steps:

1. Open `drop-manager.html?vendor=test-12`.
2. Select any draft drop. Navigate to the Review pane.
3. Confirm the orange Stripe banner renders at the top of the
   page with copy "Finish payment setup in Setup before publishing
   drops."
4. Confirm the publish button is disabled and its help text reads
   "Finish payment setup in Setup before publishing drops."
5. In DevTools Console, confirm the dropdown is gone:

   ```js
   > document.getElementById("dropStatus")
   < null
   ```

6. Open the Basics pane. Confirm there is no status field present
   anywhere in the form. The Status row in the Review summary
   (read-only, from `liveDrop.status`) still renders — that surface
   is unaffected by the dropdown removal.

Pass condition: orange banner present, publish disabled, dropdown
absent, Review summary status still legible. Any deviation is a
regression — the most likely cause is a missed reference to
`dropStatus` in `getDropPayload()` or `readDropFromForm()`.

#### 8b.1.c southbury-farm-pizza — production-shaped regression check

southbury-farm-pizza is the founding-vendor fixture with real
historical drops, products, bundles, and orders. Its purpose is
to confirm PR 4b does not regress against production-shaped data
that was created before any of these Edge Functions existed.

Steps:

1. Open `drop-manager.html?vendor=southbury-farm-pizza`.
2. Confirm the drop list renders. Spot-check 3–5 drop cards across
   different statuses (draft, scheduled, closed). Each card shows
   the expected name, host, timing, fill rate, and status badge.
3. Open one closed drop and one draft drop. For each, confirm the
   Basics pane reads the saved values correctly (no blanks, no
   mojibake).
4. **Capacity label spot check.** Open the Basics pane on at least
   three existing drops. Confirm the `capacity_category` text
   ("pizzas", or whatever was historically saved) renders in the
   capacity-category label as expected. This is the regression
   guard for Section 7 — the client retirement removed the throw
   on missing label, but the *display* path must continue to
   render existing legitimate values.
5. Open a draft drop and edit its menu (add or remove an item).
   Save. Reopen. Confirm the change persists. This re-runs call
   site 1 against production-shaped data with real product and
   bundle UUIDs that pre-date the migration.

Pass condition: every existing drop renders, every existing
capacity label displays, menu edits round-trip cleanly. No new
errors in the console that were not already present pre-merge.

### 8b.2 Direct-PostgREST grep verification

Section 4.10 promised: after PR 4b lands, `drop-manager.html`
contains zero direct-PostgREST writes against `drops` or
`drop_menu_items`. This subsection makes that promise executable
as a one-line regression check.

Run from the repo root on Mac:

```bash
grep -nE 'from\("drops"\).*\.(insert|update|delete|upsert)' drop-manager.html
grep -nE 'from\("drop_menu_items"\).*\.(insert|update|delete|upsert)' drop-manager.html
```

**Expected: zero matches from each grep.**

The patterns match the supabase-js v2 builder shape — a
`.from("drops")` or `.from("drop_menu_items")` call followed on
the same line by `.insert(`, `.update(`, `.delete(`, or
`.upsert(`. Method-chained calls that span multiple lines are
the legitimate concern; in current `drop-manager.html`, every
PostgREST write fits on a single line per the existing code
style, so the single-line grep is sufficient. If a future refactor
splits a chain across lines, broaden to a multi-line grep before
relying on this check.

Any non-zero result is a fail. Investigate the matched line and
confirm whether it is:

- a write that should have been migrated and was missed (block
  merge / fix forward),
- a residual write deliberately preserved per Section 4.10 (none
  remain — series template stamping was migrated as call site 2
  in PR 4b; T5-B15 is closed by this PR), or
- a new write introduced by an unrelated change that landed on
  the same branch (not expected, but possible — unwind via
  branch isolation).

Document this two-line check in the PR description as the
regression contract. Any future PR touching `drop-manager.html`
should re-run both greps and confirm zero matches before merge.

### 8b.3 Rollback plan

PR 4b touches:

- `drop-manager.html` (client migration of eight call sites + the
  `dropStatus` and `capacity_category` retirements)
- `supabase/functions/assign-menu-items/index.ts` (new)
- `supabase/functions/remove-event-window/index.ts` (new)
- `supabase/functions/update-drop/index.ts` (modified — the
  Section 7.2 server guard)
- Two RPC migrations (`assign_drop_menu_items`,
  `remove_event_window`)

Rollback applies in reverse-engineered order so the system
remains bisected at every intermediate step — at no point does the
client expect an Edge Function the server no longer has, or
vice-versa.

#### 8b.3.a Trigger signals

Roll back if any of the following fires post-merge:

- **Any 8a.4 gate flips to fail** when re-run after deploy.
  Specifically: if the orphan capacity_category SQL count
  becomes non-zero, or any of the six refusal smokes regresses
  to a 2xx, the assumption underlying the merge is invalid.
- **Any 8b.1 UI happy-path step fails** and the failure is
  unfixable in under one hour. Above the one-hour threshold,
  rolling back is faster than fixing forward.
- **Test 5 (remove-event-window orders-presence) returns 2xx**
  at any point post-merge. This is the single hardest fail in
  the audit — a 2xx here means a sibling drop with orders was
  deleted, with the cascade corruption documented in Section 5.2.
  Roll back immediately, no diagnostics first.

Cosmetic UI failures — state-update timing, missed re-render,
toast wording, spinner placement — are explicitly *not* rollback
triggers. See "When NOT to roll back" below.

#### 8b.3.b Rollback order

Execute in this order. Each step leaves the system in a
self-consistent state.

1. **Revert client commits on `drop-manager.html` first.** Land a
   revert commit on `main` that restores the pre-merge state of
   the eight call sites, the `dropStatus` dropdown, and the
   client `capacity_category` throw. After deploy (Netlify
   auto-deploys from `main`), the client is once again issuing
   direct-PostgREST writes — which the server still accepts,
   because the new Edge Functions and RPCs are still deployed.
   System is functional.
2. **Redeploy `update-drop` without the 7.2 guard.** Revert the
   Section 7.2 commit on `update-drop/index.ts`, then
   `supabase functions deploy update-drop --no-verify-jwt`. The
   client is no longer sending `capacity_category` text writes
   (rolled back in step 1), so the guard's removal is invisible.
   System is functional.
3. **Drop the two new Edge Functions from production.** Via
   Supabase Dashboard → Functions or
   `supabase functions delete assign-menu-items` and
   `supabase functions delete remove-event-window`. Nothing on
   the client invokes them after step 1, so the deletion is
   silent. System is functional.
4. **Drop the two new RPCs.** Run in Supabase SQL editor:

   ```sql
   drop function if exists public.assign_drop_menu_items(uuid, uuid, jsonb);
   drop function if exists public.remove_event_window(uuid, uuid);
   ```

   (Adjust signatures to match the migration as deployed.)
   Nothing else references these functions; dropping them is
   safe. System is fully reverted.

After step 4, re-run the two greps from 8b.2 against the post-
revert `drop-manager.html` and confirm both return non-zero
(the legitimate pre-PR-4b writes are back). Re-running the
8a.3 cross-vendor refusal smokes will now 404 (the functions
are gone) — that is correct.

#### 8b.3.c What stays untouched on rollback

Three artefacts are explicitly *not* rolled back:

- **PR 4a** (`update-drop`, `transition-drop-status`, `create-drop`
  whitelist widening). PR 4a is independent of PR 4b — every
  PR 4a path is exercised by call sites that PR 4b does not
  rewrite (drop save, lifecycle transition). Rolling back PR 4a
  alongside PR 4b would unnecessarily reopen the cross-vendor
  host-poisoning gap that PR 4a closed.
- **CLAUDE.md updates** that landed alongside PR 4b. Documentation
  is separate from code — keeping the audit findings, backlog
  entries, and rule additions on `main` after a PR rollback
  preserves the institutional record of what was tried, what
  failed, and why. The next attempt benefits from the trail.
- **Test 12 fixture.** Test infrastructure is separate from
  production code. The fixture exists to verify the Stripe gate
  and is referenced by ongoing Stripe-surface work (T5-B18) — its
  value is independent of PR 4b's outcome.

#### 8b.3.d When NOT to roll back

Rollback is reserved for the data-loss / security-regression
class of failure. Specifically:

- A sibling-drop deletion with orders fires (Section 5.2 cascade).
- A cross-vendor refusal regresses to a 2xx (data-exposure class).
- The orphan capacity_category guard regresses and a write
  succeeds that should have been refused.

Cosmetic and UX issues do *not* warrant a rollback. Examples
that get a fix-forward commit, not a revert:

- A toast fires twice instead of once.
- A spinner persists 200ms longer than it should after save.
- The "— Window N" suffix renders with the wrong dash glyph.
- A re-render misses one card and requires a manual refresh.
- Network tab shows two requests where Section 8b.1 expected one,
  but both succeed and the user-visible state is correct.

The bias is: prefer fix-forward unless the failure is in the
class that motivated the migration in the first place. PR 4b
exists to close cross-vendor write paths and the cascade hazard
on sibling deletes. A rollback is appropriate only when one of
those gates re-opens.

---


## Section 9 — Architectural decisions

PR 4b commits to six architectural decisions worth recording. Each
locks in constraints that shape what future Hearth contributors can
and cannot do without revisiting the rationale. They are documented
together so the trade-offs surface as a set, not in isolation.

### 9.1 Ship PR 4b as a single PR rather than splitting it

**Choice.** PR 4b ships as one PR containing five deliverables
(assign-menu-items, remove-event-window, and three clone-mode call-
site migrations covering saveDrop series-template, duplicateDrop,
and createEventWindow) plus the dropStatus dropdown removal, the
capacity_category client-throw retirement, and the W-1 through W-4
scope expansions.

**Alternatives.** (a) Split into PR 4b-i (assign-menu-items + the
first call site as a thin proof) and PR 4b-ii (everything else).
(b) Split into three PRs — Edge Functions first, then client
migrations, then retirements.

**Why this choice.** The eight call sites depend on assign-menu-
items existing, so a split forces an artificial ordering bottleneck
where the second PR cannot land until the first deploys. Any shape
mismatch between the Edge Function whitelist and what the call sites
need only surfaces when the call sites land on top of it — reviewing
both together exposes that signal; a split hides it until PR 4b-ii.
Hearth has zero live vendors today, so the rollback-granularity
argument for a split is theoretical: no production traffic exercises
the touched paths between merges. Review burden is bounded — two
new Edge Functions, one update-drop tightening, and well-scoped
client edits.

**What becomes harder if wrong.** A regression in any one
deliverable forces a revert that drags the others with it.
Mitigation: Section 8b's rollback playbook isolates each
deliverable, so the rollback unit is the deliverable, not the PR.

### 9.2 Bulk-replace semantics on assign-menu-items

**Choice.** assign-menu-items accepts a full items[] array treated
as the authoritative target state for the drop. The server
reconciles by deleting drop_menu_items rows not present in the
request and upserting those that are. No PATCH-style add / remove /
reorder verbs.

**Alternatives.** (a) Granular endpoints — add-menu-item,
remove-menu-item, reorder-menu-items. (b) A diff request body —
{ added, removed, updated }.

**Why this choice.** Drop Studio's existing saveAssignments builds
the full target state in memory before saving — it does not track
diffs. A PATCH-style API would force the client to compute diffs
against a previously-fetched list, which is more client code for
no operational gain. Bulk-replace also makes the Edge Function
idempotent: replaying the same request body produces the same
database state. The reconcile inside a single RPC keeps adds and
removes atomic — the drop is never observed half-saved. Granular
endpoints would need either an HTTP-level transaction wrapper
(impossible from a browser) or a coordinator that rebuilds the
bulk shape anyway.

**What becomes harder if wrong.** Two scenarios. (1) Very large
menus where the client cannot afford to send the full array on
every save — Hearth drops cap menus at tens of items, so bulk-
replace is cheap today. (2) Concurrent edits from two operator
sessions on the same drop — there is no operator collaboration
model today; last-write-wins is acceptable. If either constraint
breaks, layering PATCH verbs on the same Edge Function is
additive; replacing bulk semantics with a diff API later is the
harder migration.

### 9.3 Mutually-exclusive items[] / clone_from_drop_id at the request body

**Choice.** assign-menu-items accepts either an items[] array or a
clone_from_drop_id (with a server-side ownership check). Exactly
one must be present; passing both is a 400.

**Alternatives.** (a) Two separate endpoints — assign-menu-items
and clone-menu-items. (b) Precedence rules — both fields permitted,
clone_from_drop_id wins or items[] overrides.

**Why this choice.** The two operations share their post-parse code
path entirely: ownership lookup, transactional reconcile, audit
fields, response shape. Splitting into endpoints duplicates that
surface and forces the same server-side checks to live in two
places — one of which will drift. Precedence rules look attractive
until you ask what passing both means: every answer is either
ambiguous (does items[] override the cloned items by id, by
position, or strictly?) or it collapses back to one of the two
pure modes. Mutual exclusion makes every request unambiguous and
makes the failure mode (passing both by mistake) loud rather than
silent.

**What becomes harder if wrong.** If a real use case emerges for
"clone then mutate" in a single round trip, the request body
extends to a third shape — { clone_from_drop_id, overrides: {...} }
— added alongside the two existing modes. That extension is
additive and does not break existing clients. Reverting to a
precedence model later is harder; this decision preserves the
option of staying mutually exclusive forever.

### 9.4 RPC for atomicity rather than Edge-Function-orchestrated transactions

**Choice.** The reconcile in assign-menu-items and the cascade in
remove-event-window run inside a Postgres function (RPC) called
from the Edge Function. The Edge Function performs authentication,
ownership verification, and request validation, then issues a
single RPC call that does the multi-row work in one database
transaction.

**Alternatives.** Issue multiple PostgREST or supabase-js mutations
from the Edge Function inside a transaction by wrapping with
begin / commit (or by using a supabase-js .transaction() facility).

**Why this choice.** PostgREST does not expose a transactional
multi-statement API — every HTTP call is its own implicit
transaction. supabase-js does not provide a true client-side
multi-statement transaction either; "transaction" wrappers in the
JS client either serialise calls (no atomicity) or rely on RPC
underneath. To get real ACID across the delete + upsert fan-out,
the work has to happen server-side in a single database round
trip — which is exactly what an RPC provides. RPC also colocates
the atomicity boundary with the reconcile logic — a future
contributor reading the function sees both the SQL and the
transactional boundary in one place, not split across the Edge
Function and the database.

**What becomes harder if wrong.** RPC functions are versioned in
migrations rather than in application code; changing the reconcile
shape requires a SQL migration, not a TypeScript edit. That
friction is the point — atomic state transitions deserve migration-
level rigour. If the RPC ever needs to call external services
(webhooks, Stripe), the work has to move back into the Edge
Function and atomicity has to be reworked, likely via outbox-
pattern queuing. No PR 4b Edge Function touches external services.

### 9.5 Hard refusal on orders presence rather than a force flag

**Choice.** remove-event-window refuses outright (400 / 409) if any
order_items exist for the window's drop. There is no force flag,
no override path, no admin bypass.

**Alternatives.** Accept a force=true field that allows the delete
to proceed when orders exist, leaving the operator responsible for
downstream consequences.

**Why this choice.** Section 5.2 enumerates three corruption
surfaces opened by deleting a drop with live orders: (1) order_items
rows whose drop_id references a deleted drop break
v_drop_orders_summary and the Service Board's order list;
(2) capacity_units_snapshot on order_items becomes unreconcilable
because the source drop's capacity is gone; (3) downstream reporting
(v_hearth_drop_stats, scorecard) silently drops the orders or shows
them under a phantom drop. A force flag papers over all three with
a UX promise the operator cannot keep — the customer who placed an
order does not know the window was deleted, the confirmation email
points at a dead drop, and the refund path is undefined. The
correct response to "I need to delete a window with orders" is not
a force flag; it is a separate, deliberate cancellation flow with
refunds, notifications, and audit trail. PR 4b does not build that
flow, so it does not pretend to support it.

**What becomes harder if wrong.** If an operator hits the refusal
and needs to proceed (e.g. a test order placed by the vendor
themselves on a window they want to delete), the escape hatch
today is to delete the order_items first via direct database
access, then call remove-event-window. That friction is intentional
— direct DB access is logged. A future cancellation flow would
expose a dedicated endpoint with explicit refund / notify
semantics, not a force flag.

### 9.6 Server tightening landed in PR 4b rather than deferred

**Choice.** PR 4b includes the update-drop server-side guard that
rejects any payload writing capacity_category as a free-form text
value not matching a canonical slug (W-4). This lands in the same
PR as the client retirement of the capacity_category client-throw,
not in a follow-up.

**Alternatives.** Defer the server guard to a follow-up PR, shipping
the client retirement alone in PR 4b and the server tightening
separately.

**Why this choice.** Retiring the client throw without the server
guard opens a regression window: a non-Drop-Studio client (or a
hand-crafted PATCH from a developer console) could write an
unrecognised capacity_category value while the defence-in-depth
that previously blocked it client-side is gone. The server guard
closes that window in the same merge that opens it. The SQL
prerequisite (Section 8a.1 — confirming the canonical
capacity_category slug set against existing drops rows) is small
and read-only; it does not justify splitting server work into a
separate PR. Bundling the guard with the client retirement also
makes the W-4 scope expansion atomic with the change that motivated
it — a future git blame on the guard lands on the PR that explains
why it exists.

**What becomes harder if wrong.** If the SQL prerequisite surfaces
an unexpected capacity_category value that the guard would reject,
the guard has to be widened or the offending row migrated before
merge. Either response is a small SQL change, not a structural
rework. The canonical slug set is small, well-known, and already
exercised by the create-drop validation that landed in PR 4a. If a
future capacity-driver rework (T7-13) reshapes the
capacity_category vocabulary entirely, the guard moves with the
rework; it is not load-bearing infrastructure.
