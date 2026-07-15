# Findings — Drop Studio Timing init: order window "Not set" until checkbox toggled

**Scope:** read-only audit of `drop-manager.html` (+ `convert-catering-enquiry`). No fixes.
**Verdict:** Confirmed. Root cause is an **init-vs-change-handler asymmetry**: the change
handler derives `closes_at` (and `opens_at`) from the delivery window; the **load path
(`populateForm`) does not** — it only copies stored values. When a drop is loaded with a
stored `closes_at` of `null` but a real `delivery_start`, the close fields stay empty on
load, so readiness reads "Not set". Toggling the box fires the change handler, which
derives and fills them.

---

## 1. The "Open for orders straight away" control

Checkbox markup — `drop-manager.html:1525-1528`:

```html
<label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
  <input type="checkbox" id="openImmediateToggle" checked />
  <span>Open for orders straight away</span>
</label>
```

The toggle is read (never stored as a boolean) via `getOpenPattern()` — `2334-2336`:

```js
function getOpenPattern() {
  return byId("openImmediateToggle")?.checked ? "immediate" : "scheduled";
}
```

Change handler — `5890-5896`:

```js
byId("openImmediateToggle").addEventListener("change", () => {
  state.timingTouched.openPattern = true;
  renderConditionalFields();
  recapCloseOptions();
  deriveTimingFromDelivery();   // <-- the derivation the load path never runs
  markDirty();
});
```

`deriveTimingFromDelivery()` — `2388-2397` — is what actually **fills the date/time
inputs** from the delivery window:

```js
function deriveTimingFromDelivery() {
  const deliveryStart = combineDateTime(byId("deliveryDate").value, byId("deliveryStartTime").value);
  if (!deliveryStart) { renderOrderWindowSentence(); return; }
  const startMs = new Date(deliveryStart).getTime();
  setDateTimeControls("closesAtDate", "closesAtTime", startMs - getCloseLeadMinutes() * 60 * 1000);
  if (getOpenPattern() === "scheduled") {
    setDateTimeControls("opensAtDate", "opensAtTime", startMs - getOpenLeadMinutes() * 60 * 1000);
  }
  renderOrderWindowSentence();
}
```

So toggling the box (in either direction) always calls `setDateTimeControls("closesAtDate",
"closesAtTime", …)`, populating the close inputs even in `immediate` mode. That is the only
thing the toggle changes that matters here — it does not change any value semantically, it
fills previously-empty inputs. This exactly matches the observed "uncheck/re-check makes it
go green".

---

## 2. Initialisation from stored state — the gap

`populateForm(d)` timing block — `3623-3641`:

```js
byId("deliveryDate").value = formatDateInput(d.delivery_start);
buildTimeOptions(byId("deliveryStartTime"), formatTimeInput(d.delivery_start));
buildTimeOptions(byId("deliveryEndTime"), formatTimeInput(d.delivery_end));

byId("openImmediateToggle").checked = !d.opens_at;          // 3627  box checked when opens_at null

byId("opensAtDate").value = formatDateInput(d.opens_at);    // 3629  copies STORED opens_at only
buildTimeOptions(byId("opensAtTime"), formatTimeInput(d.opens_at));
byId("closesAtDate").value = formatDateInput(d.closes_at);  // 3631  copies STORED closes_at only
buildTimeOptions(byId("closesAtTime"), formatTimeInput(d.closes_at));
const delivMs = d.delivery_start ? new Date(d.delivery_start).getTime() : null;
if (delivMs && d.opens_at)  { byId("openLeadSelect").value  = nearestLeadOption(...); }  // guarded on d.opens_at
if (delivMs && d.closes_at) { byId("closeLeadSelect").value = nearestLeadOption(...); }  // guarded on d.closes_at
recapCloseOptions();
state.timingTouched = { opensAt: false, closesAt: false, openPattern: false };
```

`formatDateInput(null)` / `formatTimeInput(null)` yield empty strings, so when stored
`d.closes_at` is `null` the `closesAtDate` / `closesAtTime` inputs are left **empty**.
**`populateForm` never calls `deriveTimingFromDelivery()`** — it only calls
`renderOrderWindowSentence()` at `3677` (cosmetic sentence, not derivation).

**This is the gap.** The change handler derives-from-delivery; the load path copies-only.
A drop with `delivery_start` set but `closes_at` null therefore loads with empty close
inputs and no derivation to fill them.

---

## 3. The readiness check — what it reads

Review pane renders `{ ok: readiness.timing_complete, label: "Timing complete" }` at
`4261`, and the summary "Order Window … Not set" at `4244`. `readiness` comes from
`getLiveReadiness()` (`4232`), which reads a form-derived drop object via
`getLiveDropFromForm()` → `readDropFromForm()`.

`getLiveReadiness()` timing logic — `2479-2502`:

```js
const closesAtOk = Boolean(dropData.closes_at);                       // 2481  <-- decisive field
...
let openWindowOk = true;
if (getOpenPattern() === "scheduled") {                               // immediate => stays true
  openWindowOk =
    Boolean(dropData.opens_at) && Boolean(dropData.closes_at) &&
    isValidDateOrder(dropData.opens_at, dropData.closes_at);
}
const timingComplete =
  deliveryStartOk && deliveryEndOk && closesAtOk &&
  deliveryWindowOk && closeBeforeDeliveryOk && openWindowOk;          // 2496-2502
```

`dropData.closes_at` is `readDropFromForm()`'s value, built from the form inputs at
`4433`:

```js
closes_at: combineDateTime(byId("closesAtDate").value, byId("closesAtTime").value),
```

and `combineDateTime` returns `null` when either input is empty — `2131-2136`:

```js
function combineDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  ...
}
```

**Chain, immediate-open case (converted catering drop):** stored `closes_at` null →
`closesAtDate`/`closesAtTime` empty on load (§2) → `combineDateTime(...)` = null →
`closesAtOk` = false → `timing_complete` = false → "Timing complete" fails; the summary
line shows "Not set" because `liveDrop.closes_at` is also null (`4244`). `openWindowOk`
is not the blocker here — in immediate mode it stays `true` — **`closesAtOk` is the field
that flips.** After a toggle fills the close inputs, `readDropFromForm` returns a real
`closes_at`, `closesAtOk` becomes true, and (delivery placeholders satisfying the other
predicates) `timing_complete` goes green.

Confirmed: the change handler (via `deriveTimingFromDelivery` → `setDateTimeControls`)
populates exactly the inputs (`closesAtDate/Time`, and `opensAtDate/Time` when scheduled)
that `readDropFromForm` reads — and the load path does not.

---

## 4. What "straight away" actually stores; where `closes_at` comes from

- **"Straight away" is not a stored boolean.** It is the *absence* of `opens_at`. On save,
  `readDropFromForm` — `4356-4358`:
  ```js
  const opensAt = openPattern === "scheduled"
    ? combineDateTime(byId("opensAtDate").value, byId("opensAtTime").value)
    : null;
  ```
  Immediate ⇒ `opens_at = null` persisted. On load the box is re-checked from
  `!d.opens_at` (`3627`). Round-trips correctly.
- **`closes_at` is always a concrete timestamp** derived from the delivery window minus the
  "Orders close N before" lead (`closeLeadSelect`, default 2h — `1552-1553`,
  `getCloseLeadMinutes()` `2365`). It is computed in `deriveTimingFromDelivery` (`2392`)
  and read from the `closesAtDate/Time` inputs at save (`4433`). There is **no independent
  storage** of the close lead — it is reconstructed on load from stored `closes_at` via
  `nearestLeadOption` (`3637-3638`), which is guarded on `d.closes_at` and therefore skipped
  when it's null.
- Payload path to DB: `readDropFromForm` → `getDropPayload` (carries `opens_at` `4483`,
  `closes_at` `4484`) → `update-drop`. So a valid order window on disk **requires a real
  `closes_at` timestamp** in the form at save time — a cosmetic pass is not enough (see §6).

---

## 5. Scope of impact — general bug, catering-triggered today

The readiness failure is driven by **stored `closes_at` being null**, not by the box being
pre-checked per se (opens_at null is merely correlated). Which load paths produce that state:

- **`createNewDrop` (`4798-4826`)** sets both `opens_at` and `closes_at` to concrete
  timestamps and leaves the box **unchecked** (scheduled). Normal fresh drafts load green.
- **`duplicateDrop`** likewise sets both (`4889-4890`). Fine.
- **`convert-catering-enquiry/index.ts`** builds its insert (`171-196`) with
  `drop_type:"event"`, `fulfilment_mode`, `expected_guests`, and **placeholder
  `delivery_start`/`delivery_end` only** (`194-195`). It **never sets `opens_at` or
  `closes_at`** → both null in the row (a direct service-role insert; note this is *not*
  the `create-drop` null-strip path). Loading that drop: `opens_at` null ⇒ box pre-checked;
  `closes_at` null + `delivery_start` present ⇒ close inputs empty, no derivation ⇒ "Not
  set" / "Timing complete" fails until toggled.

**Conclusion:** the underlying defect is **general** (any drop loaded with `closes_at` null
and a `delivery_start` present hits it), but **the only path that currently produces that
row shape is the catering conversion**. Once an operator toggles + saves such a drop, its
`closes_at` is persisted and every subsequent load is green — so it presents as
catering-conversion-specific in practice. A fix should target the general init gap, not
just the catering case.

---

## 6. Publish-path dependency — fix must produce a real `closes_at`, not a cosmetic pass

`ready_to_publish` (the publish gate) hard-requires `timingComplete` — `2530-2536`:

```js
ready_to_publish:
  basicsComplete && Boolean(dropData.fulfilment_mode) &&
  timingComplete && menuComplete && hasCapacityItem && commercialsValid
```

and `timingComplete` requires `closesAtOk = Boolean(dropData.closes_at)` (§3), where
`dropData` is read from the form and then saved verbatim through `getDropPayload` →
`update-drop`. So a valid published drop must carry a genuine `closes_at` timestamp. The
correct fix must therefore **populate the `closesAtDate/Time` inputs on load** (so the value
both passes readiness *and* gets persisted on save) — e.g. run the same delivery-derivation
`deriveTimingFromDelivery()` performs, when the stored close field is empty but
`delivery_start` exists. Simply flipping the readiness predicate would leave `closes_at`
null on disk and the drop would still be unpublishable / mis-timed.

---

## Adjacent risks worth flagging (not chased)

- **Do not derive unconditionally on load.** `deriveTimingFromDelivery` recomputes
  `closes_at` as `delivery_start − closeLeadSelect`. On load, `closeLeadSelect` is snapped
  to the *nearest* option from a stored `closes_at` (`3637-3638`, `nearestLeadOption`).
  Calling the derivation unconditionally in `populateForm` would **overwrite a legitimately
  stored custom `closes_at`** with the nearest-lead approximation for every drop, not just
  the null-close case. Any fix must be **guarded** to fire only when the close input is
  empty (stored `closes_at` null) — mirror the existing `if (delivMs && d.closes_at)` guard
  shape.
- **Scheduled-open variant of the same gap.** A drop loaded with `opens_at` null but *meant*
  to be scheduled cannot occur today (immediate is the null-open encoding), but if a future
  insert path leaves `opens_at` null while intending scheduled, `openWindowOk` (`2489-2493`)
  would fail identically. Same root asymmetry; same guarded-derivation fix would cover it.
- **`state.timingTouched` reset at `3641`** happens after the (absent) derivation would run;
  `deriveTimingFromDelivery` does not set `timingTouched`, so a load-time derive would not
  spuriously mark the drop dirty via that flag — but note the change handlers call
  `markDirty()`, so wiring a fix through the handler vs. calling the derive fn directly has
  different dirty-state consequences. Decide deliberately in the fix.

---

## One-line root cause

`populateForm` copies stored `opens_at`/`closes_at` into the timing inputs but never runs
`deriveTimingFromDelivery()`, so a drop with `delivery_start` set and `closes_at` null
(today: converted catering drops) loads with empty close inputs → `closesAtOk` false →
"Timing complete" fails until the checkbox `change` handler fires the derivation that the
load path omits.
