# order.html fulfilment.mode → create-order — Full Trace (read-only)

**Date:** 2026-06-23 · **Question:** how does `order.html` determine and send
`fulfilment.mode` to `create-order` for each drop mode (collection / delivery / mixed)
and for null? No fixes/code proposed. All tags `[REPO-CONFIRMED]` with file:line.

Uncommitted — for review before code.

---

## S. Where order.html reads the drop's `fulfilment_mode`. Source = the `drops` row on `state.drop` (NOT v_drop_public). [REPO-CONFIRMED]

Normal customer path reads the drop straight from the `drops` table into `state.drop`,
with `fulfilment_mode` in the select list (`order.html:2426-2433`):
```js
const dropRes = await supabase
  .from("drops")
  .select("id, slug, name, status, drop_type, ... fulfilment_mode, capacity_units_total, ... delivery_area_type, allowed_postcode_prefixes, discount_tiers")
  .eq("slug", state.dropSlug).maybeSingle();
...
state.drop = dropRes.data;                                   // :2433
```
The Drop-Studio **preview** path instead builds `state.drop` from the `get-drop` EF,
mapping `inv.fulfilment_mode` (`order.html:2405-2411`). Either way the mode lives at
**`state.drop.fulfilment_mode`**. `v_drop_public` is read separately into
`state.dropSummary` (`:2441-2447`) and is used for **capacity only** — it is **not**
the fulfilment-mode source. Every fulfilment read uses `state.drop?.fulfilment_mode`
(`:2594, 2707, 3447, 3798`). [REPO-CONFIRMED]

---

## T. Where the payload is built + exactly how `fulfilment.mode` is set. [REPO-CONFIRMED]

`buildCheckoutPayload()` (`order.html:3783-3825`) — the mode is resolved at
`:3798` and assigned at `:3820-3822`:
```js
const selectedFulfilmentMode = state.selectedFulfilmentMode || state.drop?.fulfilment_mode;  // :3798
...
fulfilment: {
  mode: selectedFulfilmentMode,                              // :3821
  address: deliveryAddress || null,                          // :3822
  table_number: tableNumber || null,
  table_notes: tableNotes || null
},
```
This payload is sent verbatim to create-order via
`supabase.functions.invoke('create-order', { body: payload })`
(`order.html:3940-3945`). So the wire value of `fulfilment.mode` is
**`state.selectedFulfilmentMode || state.drop.fulfilment_mode`** — the customer's
selected mode if set, else the raw drop mode as fallback. [REPO-CONFIRMED]

`state.selectedFulfilmentMode` initial value is `null` (`order.html:1966`), set to a
default on drop load (U), and updated by the picker radio (`order.html:4121-4123`):
```js
if (e.target.matches('input[name="selectedFulfilmentMode"]')) {
  state.selectedFulfilmentMode = e.target.value;             // 'delivery' | 'collection'
  renderBasketSheet(); return;
}
```

---

## U. Mapping per drop mode. [REPO-CONFIRMED]

Two functions govern the mapping: `getDefaultSelectedFulfilmentMode()`
(`order.html:2593-2599`, called on every drop load at `:2574`) and
`renderCheckoutForm()` (`order.html:3446-3474`).

```js
function getDefaultSelectedFulfilmentMode() {               // :2593-2599
  const raw = String(state.drop?.fulfilment_mode || "").toLowerCase();
  if (raw === "mixed" || raw === "both") return "delivery";  // mixed defaults to delivery
  if (raw === "delivery") return "delivery";
  if (raw === "collection") return "collection";
  return null;                                               // null/absent/unknown → null
}
```

### drop mode = `'collection'` → sends `"collection"`. [REPO-CONFIRMED]
- Default resolver returns `"collection"` (`:2597`).
- `renderCheckoutForm` takes the **else** branch (no picker), `wrap` hidden, and
  `state.selectedFulfilmentMode = fulfilmentMode || state.selectedFulfilmentMode`
  → `"collection"` (`:3470-3473`).
- Payload mode = `"collection" || …` = **`"collection"`**.

### drop mode = `'delivery'` → sends `"delivery"`. [REPO-CONFIRMED]
- Default resolver returns `"delivery"` (`:2596`).
- Else branch hides the picker, sets `state.selectedFulfilmentMode = "delivery"` (`:3473`).
- Payload mode = **`"delivery"`**.

### drop mode = `'mixed'` (or legacy `'both'`) → renders a picker; sends the picked concrete mode; defaults to `"delivery"` if the customer picks nothing. [REPO-CONFIRMED]
- Default resolver maps `mixed`/`both` → **`"delivery"`** (`:2595`), so
  `state.selectedFulfilmentMode` is `"delivery"` **before any interaction**.
- `renderCheckoutForm` takes the **mixed** branch and renders two radio cards
  (`order.html:3451-3469`):
  ```js
  if (fulfilmentMode === "mixed" || fulfilmentMode === "both") {
    wrap.classList.remove("hidden");
    choice.innerHTML = `
      <label class="choiceCard ...">
        <input type="radio" name="selectedFulfilmentMode" value="delivery" ${...=== "delivery" ? "checked":""} /> ... Delivery ...
      </label>
      <label class="choiceCard ...">
        <input type="radio" name="selectedFulfilmentMode" value="collection" ${...=== "collection" ? "checked":""} /> ... Collection ...
      </label>`;
  }
  ```
  Radio **values are only `"delivery"` / `"collection"`** (`:3455, 3463`).
- Picking either fires the change handler → `state.selectedFulfilmentMode = e.target.value`
  (`:4122`). So **pick Delivery → sends `"delivery"`**, **pick Collection → sends
  `"collection"`**.
- **Pick nothing:** the default (`"delivery"`) is already set and the Delivery radio is
  pre-`checked`, so the payload sends **`"delivery"`**. Not null, not blocked.

### drop mode = `null` / absent → sends `mode: null` (→ server 400; not blocked client-side). [REPO-CONFIRMED]
- Default resolver returns `null` (`:2598`).
- `renderCheckoutForm` else branch: `String(null || "")` → `""`, so
  `state.selectedFulfilmentMode = "" || state.selectedFulfilmentMode` stays `null`
  (`:3473`); the picker is hidden.
- Payload mode = `null || state.drop?.fulfilment_mode` = `null || null` = **`null`**
  (`:3798, 3821`).
- `validateCheckout()` does **not** check for a null mode (`order.html:3855-3923` —
  it gates basket/closed/pre-open/capacity/contact/postcode/address only), so the
  client lets it through and create-order returns 400 (W). This is the
  T5-B29-shaped null-mode case (e.g. a multi-window parent with `fulfilment_mode = null`). [REPO-CONFIRMED]

---

## V. Delivery address collection + wiring into the payload. Address is collected and sent — and is required for EVERY order, regardless of mode. [REPO-CONFIRMED]

Collected and concatenated in `buildCheckoutPayload` (`order.html:3789-3792`) and
wired to `fulfilment.address` (`:3822`):
```js
const addrLine1 = byId("addrLine1").value.trim();
const addrLine2 = byId("addrLine2").value.trim();
const addrTown  = byId("addrTown").value.trim();
const deliveryAddress = [addrLine1, addrLine2, addrTown, customerPostcode].filter(Boolean).join(", ");  // :3792
...
fulfilment: { mode: selectedFulfilmentMode, address: deliveryAddress || null, ... }   // :3822
```
So a **delivery order carries the concatenated address through to create-order**
(written to `orders.delivery_address`, per create-order:560).

Note for the rebuild: the address requirement is **not** gated on mode.
`validateCheckout()` requires `addrLine1` + `addrTown` (and a valid postcode)
**unconditionally** (`order.html:3907-3918`):
```js
// Address fields — line 1 and town required; line 2 optional
if (!addrLine1) { showFieldError("addrLine1", ... "Please enter your address."); hasFieldError = true; }
if (!addrTown)  { showFieldError("addrTown",  ... "Please enter your town or city."); hasFieldError = true; }
```
So a **collection** order also collects, validates, and sends a full address — the
build does not branch the address on `selectedFulfilmentMode`. (This diverges from the
CLAUDE.md note "delivery_address … required for delivery mode only" — flagged as an
observation, not a fix.) [REPO-CONFIRMED]

---

## W. Could order.html send `'mixed'`? Not in normal flow, but the fallback can forward any raw drop value verbatim. create-order accepts only `'delivery'`/`'collection'`. [REPO-CONFIRMED]

**create-order's accepted modes** (`supabase/functions/create-order/index.ts:138-140`):
```ts
if (f.mode !== "delivery" && f.mode !== "collection") {
  return { ok: false, reason: "fulfilment.mode must be 'delivery' or 'collection'" };
}
```
So the server rejects anything that is not exactly `"delivery"` or `"collection"` —
including `"mixed"`, `"both"`, and `null` — with a **400** before any write. An
individual order is never `'mixed'`. [REPO-CONFIRMED]

**Does order.html ever send `'mixed'`?** In normal flow, **no**:
- The payload mode is `state.selectedFulfilmentMode || state.drop?.fulfilment_mode`
  (`order.html:3798`). For a `mixed`/`both` drop, `getDefaultSelectedFulfilmentMode`
  sets `state.selectedFulfilmentMode = "delivery"` at load (`:2595`), and the radio can
  only set it to `"delivery"`/`"collection"` (`:3455, 3463, 4122`). So the **first
  operand is always a concrete mode** for a mixed drop, and the fallback is never
  reached → `"mixed"` is not sent.

**Latent mismatch to flag (no fix proposed):** the `|| state.drop?.fulfilment_mode`
fallback at `:3798` forwards the **raw drop value verbatim**. If
`state.selectedFulfilmentMode` were ever falsy while `state.drop.fulfilment_mode` is
`"mixed"`/`"both"` (or any other non-`delivery`/`collection` string), order.html would
send that raw string and create-order would 400. With the current load-time default
(`mixed`→`delivery`) this path is unreachable for a correctly-loaded mixed drop, but
the fallback is a value create-order does not accept, and there is **no client-side
guard** that the outgoing mode ∈ {delivery, collection} (`validateCheckout` does not
check it, `:3855-3923`). The one case where the fallback *does* fire today is
**null-mode** drops, where it forwards `null` → server 400 (U, the T5-B29 case). [REPO-CONFIRMED]

---

### One-line summary (facts only)
`order.html` sources the drop mode from `state.drop.fulfilment_mode` (the `drops`
row), maps `collection→"collection"`, `delivery→"delivery"`, `mixed/both→` a
customer-picked `"delivery"`/`"collection"` (default `"delivery"`), and `null→null`;
it sends `mode = state.selectedFulfilmentMode || state.drop.fulfilment_mode` plus an
always-collected `address`. create-order accepts only `"delivery"`/`"collection"`, so
`null` (and any raw `"mixed"`/`"both"` that reached the fallback) is rejected 400 — and
nothing client-side guards the outgoing mode.

*End — facts only, no fixes or code, per instructions.*
