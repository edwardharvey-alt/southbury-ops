# Drop Studio — how `fulfilment_mode` is SET — Fact-Gathering (read-only)

**Date:** 2026-06-23 · **Goal:** understand every way a drop's `fulfilment_mode` is
set today, so a mandatory-fulfilment requirement (UI gate → data cleanup → NOT NULL +
CHECK `{collection, delivery, mixed}`) can be added correctly. No fixes/code proposed.
Tags: `[REPO-CONFIRMED]` = file:line read; `[NEEDS-ED-VERIFY]` = live DB, with query.
Drop Studio = `drop-manager.html`.

Uncommitted — for review before code.

---

## X. The Drop Studio control — a 4-option `<select>` whose blank default → `null`; the drop CAN be saved AND published with it unset. [REPO-CONFIRMED]

The control is a native `<select id="fulfilmentMode">` in the Basics pane
(`drop-manager.html:1294-1300`):
```html
<label for="fulfilmentMode">Fulfilment Mode</label>
<select id="fulfilmentMode">
  <option value="">Select mode</option>     <!-- blank, no `selected` on others → this is the default -->
  <option value="delivery">Delivery</option>
  <option value="collection">Collection</option>
  <option value="mixed">Mixed</option>
</select>
```
- **Emittable values:** `""` (blank), `"delivery"`, `"collection"`, `"mixed"`. The
  blank "Select mode" is the first/default option, so a drop starts with **no mode
  selected**. [REPO-CONFIRMED]
- On save the value is coerced blank→null: `fulfilment_mode: byId("fulfilmentMode").value || null`
  (`drop-manager.html:4403`). On load the field is hydrated `d.fulfilment_mode || ""`
  (`drop-manager.html:3581`). [REPO-CONFIRMED]
- **Can it be saved/published unset today? YES.** The publish/readiness gate
  `getLiveReadiness()` computes `basicsComplete` from name, slug, drop_type, capacity,
  and host-if-community — **`fulfilment_mode` is not part of it**
  (`drop-manager.html:2472-2477`):
  ```js
  const basicsComplete =
    Boolean(dropData.name) && Boolean(dropData.slug) && Boolean(dropData.drop_type) &&
    capacityValid && (!requiresHost || Boolean(dropData.host_id));
  ```
  `ready_to_publish` is `basicsComplete && timingComplete && menuComplete &&
  capacity_product_present && commercialsValid` (`:2529-2531`) — none of those flags
  reference `fulfilment_mode`. So a drop with `fulfilment_mode = null` passes the
  client publish gate, and (see Z) neither create-drop nor update-drop rejects it.
  [REPO-CONFIRMED]
- The mode only drives conditional UI reveal (collection-point / delivery-area fields,
  `drop-manager.html:3934-3941`), never a required-field check. [REPO-CONFIRMED]

---

## Y. The existing required-field / publish-gate pattern to match. [REPO-CONFIRMED]

The page's mandatory-field enforcement is the **readiness object** returned by
`getLiveReadiness()` (`drop-manager.html:2457-2535`): each stage has a boolean
`*_complete` / `*_valid` flag built from `Boolean(field)` (and value checks), and
`ready_to_publish` is the AND of them. The Review pane renders those flags as a
checklist (`drop-manager.html:4257-4260`) and stage status derives from them
(`:2539-2545`). Representative example — `basicsComplete` (`:2472-2477`, quoted in X):
required fields are simply `&&`-ed `Boolean(...)` checks, with conditional members
(e.g. host only `if requiresHost`). A new "fulfilment mode required" rule would
naturally be a new `Boolean(dropData.fulfilment_mode)` conjunct in `basicsComplete`
(or a new flag) — matching this pattern. Conditional-commercials validation
(`fundraising`/`host_share`, `:2504-2518`) is the in-file precedent for value-level
checks. (Pattern noted for matching only — no change proposed.) [REPO-CONFIRMED]

---

## Z. EFs that write `fulfilment_mode` — `create-drop` and `update-drop`. It IS whitelisted in both; NEITHER validates the value. [REPO-CONFIRMED]

Both Edge Functions carry `fulfilment_mode` in their `ALLOWED_FIELDS` whitelist:
- `create-drop/index.ts:18-28` — `ALLOWED_FIELDS` includes `"fulfilment_mode"` (`:28`).
- `update-drop/index.ts:23-34` — `ALLOWED_FIELDS` includes `"fulfilment_mode"` (`:34`).

**Validation present in each — `fulfilment_mode` is NOT among them:**
- `create-drop` validates only `name`/`slug` required (`:125-127`), `drop_type` against
  `VALID_DROP_TYPES` (`:129-130`), and `audience_scope` against `VALID_AUDIENCE_SCOPES`
  (`:133-134`). There is **no** `VALID_FULFILMENT_MODES` set and no check on the value.
  Crucially it **null-strips** every null/undefined field before insert so DB defaults
  apply (`create-drop/index.ts:116-123`):
  ```ts
  // Drop null/undefined values so DB defaults apply. A whitelisted key with a null
  // value would override the DB default and fail NOT NULL constraints...
  for (const key of Object.keys(insert)) {
    if (insert[key] === null || insert[key] === undefined) { delete insert[key]; }
  }
  ```
  So a blank/`null` `fulfilment_mode` from the UI is **dropped**, and whatever the
  `drops.fulfilment_mode` column default is takes effect (per CLAUDE.md learning #67).
  [REPO-CONFIRMED]
- `update-drop` validates `drop_type`, `audience_scope`, fundraising/host-share models,
  and several paired invariants (`update-drop/index.ts:191-420`), but has **no**
  `fulfilment_mode` value check. It only writes whitelisted keys that are
  `!== undefined` (`:159`), so an explicit `null` **is** written on the update path
  (unlike create-drop's strip). [REPO-CONFIRMED]

**Function version:** neither file carries an explicit version string in source (no
`VERSION`/`// vN` header) — version not visible in the repo. [REPO-CONFIRMED]

> Net: the write layer accepts any value (including `null`, and any string — there is
> no allow-list, so a stray `"both"`/typo would be written verbatim by update-drop or,
> if non-null, by create-drop). The `{collection, delivery, mixed}` constraint does not
> exist in either EF today.

---

## AA. Every write path to `fulfilment_mode` — four, two of which propagate/emit `null`. [REPO-CONFIRMED]

1. **Manual edit / save** — `getLiveDropFromForm()` sets
   `fulfilment_mode: byId("fulfilmentMode").value || null` (`drop-manager.html:4403`),
   serialised by `getDropPayload()` which passes `dropData.fulfilment_mode` through
   (`:4457`), then sent to **`update-drop`** (saves at `:4671, 4758`) or **`create-drop`**
   (new siblings at `:4711`). Blank select → `null` written. [REPO-CONFIRMED]

2. **New blank draft — `createNewDrop()`** hardcodes `fulfilment_mode: null`
   (`drop-manager.html:4787, 4804`), `status:"draft"`, `drop_type:"neighbourhood"`, sent
   to **`create-drop`** (`:4821`). create-drop null-strips it → DB default. This is a
   primary source of **null-mode draft rows**. [REPO-CONFIRMED]

3. **Duplicate — `duplicateDrop(dropId)`** clones the source via
   `getDropPayload(sourceDrop)` (`drop-manager.html:4857`), which copies
   `sourceFields.fulfilment_mode` verbatim (`:4457`), then calls **`create-drop`**
   (`:4884`). So duplicating a drop **propagates the source's mode** — and if the source
   is null-mode, the clone is null-mode too. (This matches the observed "many null-mode
   draft clones": a null source begets null clones, and create-drop's null-strip leaves
   the column at its DB default.) [REPO-CONFIRMED]

4. **Second clone flow (~`:4960-4975`)** — a separate path also builds from
   `getDropPayload(sourceDrop)` (`drop-manager.html:4960`) and calls **`create-drop`**
   (`:4975`), again carrying `fulfilment_mode` verbatim from the source. [REPO-CONFIRMED]

(The series/recurrence save at `:4646-4711` reuses path 1's `getDropPayload`, so it is
not a distinct rule — it forwards the same value.) **All four paths funnel through
`getDropPayload`/`create-drop`/`update-drop`; none asserts a non-null mode.** The two
that introduce `null` are #2 (new draft, explicit `null`) and #3/#4 (clone of a
null-mode source). [REPO-CONFIRMED]

---

## AB. CHECK constraint / enum on `drops.fulfilment_mode` — no repo lead; live state unknown. [NEEDS-ED-VERIFY]

The repo migrations do **not** define or constrain `drops.fulfilment_mode`. The only
migration mention is inside a **view** select list
(`supabase/migrations/20260612055452_drop_lifecycle_access.sql:9`, recreating
`v_drop_public`/`v_drop_summary`), not a column/constraint definition. The only
migration that alters `drops` at all is `20260505193331_add_drops_drop_intro.sql` (a
different column). So there is **no repo evidence** of an existing CHECK or enum on
`fulfilment_mode`, nor of its column default / nullability — schema is applied by hand
(per CLAUDE.md rule #13). Confirm live before designing the NOT NULL + CHECK:

```sql
-- existing CHECK constraints on drops (look for any on fulfilment_mode)
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'drops'::regclass and contype = 'c';
```
Recommend also confirming column type / nullability / default and the current value
distribution (the cleanup target) before adding NOT NULL:
```sql
-- column nullability + default
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'drops' and column_name = 'fulfilment_mode';

-- current values present (find the null/blank/legacy rows to clean up first)
select fulfilment_mode, count(*)
from drops group by fulfilment_mode order by count(*) desc;
```
[NEEDS-ED-VERIFY]

---

### One-line summary (facts only)
`fulfilment_mode` is set by a blank-default `<select>` (`""/delivery/collection/mixed`)
that is **not** part of the publish/readiness gate, written through `create-drop`
(null-stripped → DB default) and `update-drop` (writes explicit null), with **no value
validation in either EF** and **no repo evidence of a DB CHECK/enum**; `null` is
introduced by `createNewDrop` (explicit null) and by duplicate/clone flows propagating a
null-mode source. A mandatory requirement would add the UI gate in the
`getLiveReadiness`/`basicsComplete` pattern, then clean up existing null rows, then add
NOT NULL + CHECK `{collection, delivery, mixed}` (live-state-verify first).

*End — facts only, no fixes or code, per instructions.*
