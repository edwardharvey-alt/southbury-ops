# Findings — Activation artwork 540px width vs mobile overflow

Read-only audit of `activation.html`. No source edits. Concerns the three
social-asset artwork boxes (menu/reveal, orders-open, capacity) reporting
`width=540` on a 393px phone.

## TL;DR / premise correction

**The 540px width is NOT an inline style set in JS. It is a plain
stylesheet rule (`width:540px`) on each artwork class.** A stylesheet
`max-width:100% !important` *can* beat `width:540px` in the cascade — so
"inline JS width beats the stylesheet" is not why the previous attempts
failed.

Two real reasons the box still measures 540:

1. **`getBoundingClientRect()` ignores ancestor `overflow:hidden`
   clipping.** The frame (`overflow:hidden`) visually clips the box, but
   the diagnostic still reads the box's full *unclipped* geometry. So
   `width=540` does not by itself prove page-level overflow.
2. **`width=540` means the box's `transform: scale()` is currently
   `scale(1)` (or unset) at scan time** — if a sub-1 scale were applied,
   `getBoundingClientRect` would report the *scaled* (~280px) width.
   So the live symptom is "**the scale isn't being applied**", not "the
   box width can't be overridden".

**Do NOT cap the box width.** The box's children are absolutely
positioned against a hardcoded 540 grid AND the export rasterises the
live box at its 540 layout size — shrinking the layout width breaks both.
Containment must come from the **frame** (fluid + `overflow:hidden`) plus
**making the scale recompute**, never from the box's own width.

---

## 1. THE "INLINE" WIDTH — where 540 is actually set

### It is CSS, on the artwork boxes (not inline, not JS):

| Card | Class | CSS rule | file:line |
|---|---|---|---|
| menu/reveal | `.menuCardArtwork` | `width:540px; height:540px;` | activation.html:185-187 |
| orders-open | `.act-orders-open-artwork` | `width:540px; height:540px;` | activation.html:1003-1005 |
| capacity | `.act-capacity-artwork` | `width:540px; height:540px;` | activation.html:1132-1134 |

All three also carry `position:relative; overflow:hidden;
transform-origin: top left;` (e.g. activation.html:188-192). Children
(`__image`, `__scrim`, `__lockup`, `__centre`, etc.) are
`position:absolute` against this 540 box.

### The ONLY inline `.style.width/.height` set in JS:

- **The inner `<img>`**, with cover-centre geometry **hardcoded to
  `S = 540`** — `img.style.width/height/left/top` computed against a 540
  box (activation.html:2004-2014 menu; :2163-2173 orders-open;
  :2350-2360 capacity). Comment at :2001-2002: *"Explicit pixel geometry
  against the 540×540 source box so the html2canvas scale:2 export
  matches the preview exactly."* → the inner image alignment is welded
  to 540; a fluid box would mis-place it.
- **`frame.style.height = `${540 * scale}px``** on the *frame*, not the
  box (activation.html:2050, :2132, :2294).

No JS anywhere assigns `540` (or any width) to `.menuCardArtwork` /
`.act-orders-open-artwork` / `.act-capacity-artwork` as an inline style.
Grep of `540`, `.style.width`, `.style.height`, `style="width`,
`offsetWidth`, `clientWidth` confirms it (clientWidth appears only as
`frame.clientWidth` reads — see §2).

---

## 2. THE SCALE MODEL

Three near-identical functions + a ResizeObserver each:

```
actUpdateMenuCardScale()      activation.html:2042-2051
actUpdateOrdersOpenScale()    activation.html:2126-2133
actUpdateCapacityScale()      activation.html:2288-2295
```

Each does exactly (menu shown; other two identical bar ids):

```js
const frame   = byId("act-menuCardFrame");
const artwork = byId("act-menuCardArtwork");
if (!frame || !artwork) return;
const targetWidth = frame.clientWidth;
if (!targetWidth) return;                       // ← early-out when frame is 0 (collapsed/not laid out)
const scale = Math.min(1, targetWidth / 540);
artwork.style.transform = `scale(${scale})`;    // ← sets TRANSFORM only
frame.style.height = `${540 * scale}px`;        // ← sets FRAME height only
```

- **Measures:** `frame.clientWidth`.
- **Sets:** the box's `transform: scale(min(1, frame.clientWidth/540))`,
  and the *frame's* height. **It never sets the box's `width`.** The box
  stays **540 in layout**; only its painted size changes.
- **Confirms #4:** layout still sees a 540 box.

ResizeObservers re-run these on frame resize:

```
menu        actSetupMenuCard:     state.resizeObserver = new ResizeObserver(actUpdateMenuCardScale); .observe(frame)  (~2457-2461)
orders-open                       new ResizeObserver(actUpdateOrdersOpenScale); .observe(ordersOpenFrame)            (~3864-3866)
capacity                          new ResizeObserver(actUpdateCapacityScale);   .observe(capacityFrame)              (~3882-3884)
```

**Implication of the diagnostic:** `width=540` ⇒ `transform` is
`scale(1)`/unset ⇒ `frame.clientWidth` was `≥540` (scale clamps to 1) or
the function early-returned on `targetWidth===0` and never set a sub-1
scale. Either way the **frame is not being held below 540 on the device**
(ancestor `.act-social-grid` / `.act-zone` not stacking) **or the scale
never recomputed after the card became visible**. That — not the box
width — is the bug to chase.

---

## 3. THE EXPORT PATH — the deciding dependency

All three downloads rasterise the **LIVE on-screen node** with
`html2canvas`, and **temporarily reset `transform` to `scale(1)`** for
the capture, restoring the previous transform afterwards:

```
actDownloadMenuCard()         activation.html:2053-2117
actDownloadOrdersOpenCard()   activation.html:2211-2268+
actDownloadCapacityCard()     activation.html:2383-2418+
```

Exact deciding lines (menu; the other two are identical in shape):

```js
const artworkEl = byId("act-menuCardArtwork");           // :2054  LIVE node
const originalTransform = artworkEl.style.transform;     // :2063
...
artworkEl.style.transform = "scale(1)";                  // :2078  neutralise visual scale
canvas = await window.html2canvas(artworkEl, {           // :2082  rasterise the LIVE node
  scale: 2, useCORS: true, backgroundColor: null, logging:false
});
...
artworkEl.style.transform = originalTransform;           // :2089  restore (finally)
```

Orders-open: `:2212`, `:2238`, `:2242`, `:2249`. Capacity: `:2384`,
`:2409`, `:2413`.

**This is case (b): the export rasterises the live element at its LAYOUT
dimensions.** It only resets the *transform* — it does NOT reset/restore
the box's *width*. So:

- Capture size = the box's **layout width at capture time**.
- Today that is **540** (CSS `width:540px`, untouched by the scale fn) →
  with `scale:2` you get the intended 1080×1080.
- **If the on-screen LAYOUT width were made fluid** (e.g. `max-width:100%`
  resolving to 360px, or setting `style.width` responsively), html2canvas
  would capture a **360×360 box** → a smaller/cropped export, and the
  hardcoded-540 inner-image geometry (§1) would be mis-aligned.

No offscreen canvas, no node clone, no independent 540 surface. The
`S = 540` constant in the *populate* functions only drives the inner
image's cover math — it is not a separate render target.

**All three cards share this same mechanism. None are
fluid-safe; all are equally safe only if you leave the box layout at 540.**

---

## 4. WHY `transform: scale()` DIDN'T CONTAIN IT

`transform` is a paint-time operation: it scales the *rendered* pixels but
**does not change the element's laid-out box**. The box still occupies
`540×540` in normal flow (and in `getBoundingClientRect`'s untransformed
contribution to ancestor scroll width). With `transform-origin: top left`
the visual shrinks toward the top-left, but the layout footprint is
unchanged. So if anything upstream lets a 540-wide box (or its 540-wide
frame) sit in the layout without the frame clipping it inside a
viewport-bounded ancestor, it contributes 540 to horizontal extent.
→ **The fix must constrain the LAID-OUT width of the containing FRAME
(and keep `overflow:hidden` clipping the 540 box), not merely rely on the
visual scale, and must NOT shrink the box's own layout width.**

Note also: capping the **box** with `max-width:100%` is doubly wrong — it
(a) shrinks the html2canvas capture (§3) and (b) breaks the absolutely
positioned, 540-welded children (§1). The earlier
`.menuCardArtwork/.act-*-artwork { max-width:100% !important }` rule added
to the ≤768px block should be **reverted** as part of the fix.

---

## RECOMMENDED FIX SHAPE — **A, applied to the FRAME (not the box)**

Because the export rasterises the live node and depends on the box's
**540 layout**, the box must stay 540. The good news: the export already
neutralises `transform` (`scale(1)`) during capture, so **a fluid FRAME +
a 540 box visually scaled by `transform` is fully export-safe with NO
capture wrapper needed.** Therefore:

1. **Leave the 540 box alone.** Keep `width/height:540px` on
   `.menuCardArtwork` / `.act-orders-open-artwork` / `.act-capacity-artwork`.
   **Revert** the `max-width:100%` rule the prior attempt added to those
   classes (it threatens the export and the inner-image geometry).
2. **Make the FRAME and its flex ancestors viewport-fluid** so
   `frame.clientWidth` is always `< 540` on a phone, which makes
   `scale < 1`, and the frame's existing `overflow:hidden` clips the 540
   box cleanly. The frame is already `width:100%`
   (`.menuCardArtworkFrame`, e.g. :3150) — the missing piece is that its
   ancestors `.act-social-grid` (`display:flex; flex-wrap:wrap`, :468) and
   `.act-zone:first-child` (`flex:0 0 280px`, :470) / `:last-child`
   (`min-width:280px`, :471) are not reliably collapsing to one fluid
   column on the device.
3. **Guarantee the scale recomputes** once the card body is actually laid
   out/visible. The functions early-return on `frame.clientWidth === 0`
   (collapsed body), and the ResizeObserver is the only thing that re-runs
   them; verify it fires after the touchpoint body expands (and after the
   zone stacks) so a sub-1 `scale` is actually applied.

This is **shape A** (make the on-screen container fluid, let scale
recompute) — but pointed at the **frame/ancestors**, the only safe lever.
It is the lowest-risk option and needs **no export wrapper**.

**Shape B is NOT required** here and should be avoided: B (make the box
layout fluid, then restore 540 + scale(1) for capture) would mean
restoring the box's *width* — not just its transform — inside every
download handler, and re-running the 540-welded inner-image geometry per
capture. More moving parts, more regression surface, and it fights the
existing (already-correct) "frame clips a fixed 540 box" design.

### Before-coding check (answers the "no visible change in 4 attempts")
The diagnostic's `width=540`/`scale(1)` reading says the ≤768px rules are
**not in effect on the device** (stale build or the media query not
matching) — confirm the on-screen `BUILD <marker>` matches the just-pushed
build and `mq<=768:true` **first**. If the rules aren't applying at all,
no amount of additional CSS will change anything; that gate must be
cleared before fix shape A is implemented.

---

## Cross-card export mechanism summary

| Card | Export fn | Mechanism | Resets transform for capture? | Independent 540 surface? | Fluid-box-safe? |
|---|---|---|---|---|---|
| menu/reveal | `actDownloadMenuCard` (:2053) | `html2canvas` on **live** `act-menuCardArtwork` | Yes — `scale(1)` (:2078) | No | No |
| orders-open | `actDownloadOrdersOpenCard` (:2211) | `html2canvas` on **live** `act-ordersOpenArtwork` | Yes — `scale(1)` (:2238) | No | No |
| capacity | `actDownloadCapacityCard` (:2383) | `html2canvas` on **live** `act-capacityArtwork` | Yes — `scale(1)` (:2409) | No | No |

All identical → one fix shape (A-on-the-frame) covers all three.
