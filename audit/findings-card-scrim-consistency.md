# Findings — generated social-card scrim consistency (T5-25, activation.html)

READ-ONLY audit. No edits made. All line numbers are `activation.html`.

## TL;DR — the root cause

The three generated cards lay text over the **same photo** (confirmed §3) but use
**two different scrim families**:

- **Reveal card** darkens with **neutral BLACK**, a **bottom-weighted gradient**,
  leaving the top ~25–50% of the photo untouched → photo reads bright/saturated.
- **Orders-open + Capacity cards** darken with a **flat, full-bleed BROWN wash**
  (the vendor brand colour `#8B6B3F`) over the **entire** image → the whole photo
  is desaturated and hue-shifted warm → reads muted/greyer.

So the inconsistency is **colour + coverage**, not the image. Two specific defects:

1. **Brown vs black.** Orders-open and capacity tint with `var(--vendor-brand-primary)`
   (brown) full-bleed; reveal tints with black bottom gradient. The brown full wash
   is what makes those two cards look muted next to the vivid reveal card.
2. **Sold-out bump.** Capacity's tint jumps from `opacity:0.28` to `0.62` when sold
   out, so a sold-out drop's capacity card is dramatically darker than its
   orders-open sibling (which is fixed at 0.28). Within one card set this is the
   biggest same-state divergence.

(Note: orders-open and capacity are *identical* — both flat brown `0.28` — in the
**non-sold-out** state. The orders-open-vs-capacity brightness difference the brief
describes is therefore the **sold-out** case (0.28 vs 0.62); the reveal-vs-others
difference is present on **every** drop.)

---

## 1. The scrim/overlay for each card

### Reveal / menu card — `.menuCardArtwork__scrim` (196–211)
A black, bottom-weighted **linear-gradient**, covering only the **bottom 58%**
(`height: 58%; bottom:0`). Top of the photo is fully transparent.

```css
.menuCardArtwork__scrim {
  position: absolute; left: 0; right: 0; bottom: 0;
  height: 58%;
  background: linear-gradient(
    to bottom,
    rgba(0,0,0,0)    0%,
    rgba(0,0,0,0)    25%,
    rgba(0,0,0,0.38) 52%,
    rgba(0,0,0,0.74) 76%,
    rgba(0,0,0,0.92) 100%
  );
  pointer-events: none;
}
```
Markup: `<div class="menuCardArtwork__scrim">` at 3013. Text lockup
(`.menuCardArtwork__lockup`, 213) sits **bottom-left** (`left:36px; bottom:32px`),
inside the darkest zone.

### Orders-open card — `.act-orders-open-artwork__tint` (946–952)
A **flat, full-bleed** tint in the **brand colour**, `inset:0`, `opacity:0.28`.

```css
.act-orders-open-artwork__tint {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-color: var(--vendor-brand-primary);   /* #8B6B3F default */
  opacity: 0.28;
}
```
Markup: `<div class="act-orders-open-artwork__tint">` at 3319. Text is **centre**
(`.act-orders-open-artwork__centre`, 954, `inset:0; align/justify center`) — the
"Orders open" headline + dropname — plus a **bottom-centre** closing line
(`.act-orders-open-artwork__closing`, 988, `bottom:28px`). Legibility currently
leans on text-shadows (e.g. headline `text-shadow: 0 2px 8px rgba(0,0,0,0.45), 0 0 20px rgba(0,0,0,0.35)`, 972).
The render JS does **not** modify the tint — it only sets `--vendor-brand-primary`
(2016–2017); tint stays at the CSS default.

### Capacity card — `.act-capacity-artwork__tint` (1074–1084)
**Identical** flat full-bleed brand tint at `opacity:0.28`, **plus a sold-out
override** to `0.62`.

```css
.act-capacity-artwork__tint {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-color: var(--vendor-brand-primary);   /* #8B6B3F default */
  opacity: 0.28;
}
.act-capacity-artwork__tint.is-soldout {
  opacity: 0.62;
}
```
Markup: `<div class="act-capacity-artwork__tint" id="act-capacityTint">` at 3319-area
(3515 block). The `is-soldout` class is toggled in JS by capacity state
(2173–2178: `soldOut = remaining===0 || used>=total; tintEl.classList.toggle('is-soldout', soldOut)`).
Text is **centre** (`.act-capacity-artwork__centre`, 1086, `inset:0; align/justify center`):
the big number/slots/sold-out word + dropname — all centred, again backed by
text-shadows (number `text-shadow: 0 2px 8px rgba(0,0,0,0.45), 0 0 20px rgba(0,0,0,0.35)`, 1104).

> Placement correction for the brief: the capacity number is **centred**
> (`align-items:center; justify-content:center`), **not** bottom-right. The
> recommendation below is sized for centre text.

---

## 2. Side-by-side comparison

| Card | Selector / line | Colour | Shape / coverage | Strength | Dynamic? |
|------|-----------------|--------|------------------|----------|----------|
| Reveal | `.menuCardArtwork__scrim` 196 | **black** `rgba(0,0,0,…)` | gradient, **bottom 58%**, top transparent | peaks **0.92** at bottom (0.38→0.74→0.92) | static |
| Orders-open | `.act-orders-open-artwork__tint` 946 | **brand brown** `#8B6B3F` | **flat, full-bleed** `inset:0` | **0.28** | static |
| Capacity | `.act-capacity-artwork__tint` 1074 | **brand brown** `#8B6B3F` | **flat, full-bleed** `inset:0` | **0.28**, → **0.62** sold-out | **yes (sold-out)** |

How they differ, precisely:
- **Colour:** reveal = neutral black; orders-open & capacity = brand brown
  (`var(--vendor-brand-primary)`). → brown washes/desaturates the photo; black darkens
  it without a hue shift. **This is the primary visual mismatch.**
- **Coverage:** reveal = bottom 58% only (top untouched, stays bright); the other two
  = entire frame tinted. → reveal looks more saturated overall purely because most of
  its photo carries no overlay.
- **Shape:** reveal = gradient; the other two = flat constant alpha.
- **Strength / dynamics:** orders-open fixed 0.28; capacity 0.28 → **0.62** when sold
  out. → sold-out capacity diverges hard from orders-open in the same card set.
- No `background-blend-mode` is used anywhere; no `::before/::after` darkening on any
  artwork; no inline scrim styles. The tint elements are the only overlays.

---

## 3. Confirmation the base photo is the same across cards

Yes — single shared source and identical geometry; only the scrim differs.

- All three resolve the photo through the same helper `resolveDropSocialImage(rawDrop, vendor)`
  (1999–2009), explicitly commented "Single source of truth … so the vendor's chosen
  photo cannot drift between cards." Preference chain: `social_image_url` → reveal
  product `image_url` → vendor `hero_image_url` → '' (solid brand fallback).
  - Reveal uses it at **1859**.
  - Orders-open uses it at **2020**.
  - Capacity uses it at **2207**.
- Each card also applies the **same** cover-centre fit math against the 540 box
  (`S=540; sc=Math.max(S/iw,S/ih); left=(S-w)/2; top=(S-h)/2`): reveal 1864–1874,
  orders-open 2023–2033, capacity 2210-onward. So the framing/crop is identical too.

→ The image is constant; the look difference is entirely the scrim. **Confirmed.**

---

## 4. Recommendation — one consistent scrim

Unify the **colour to neutral black** (drop the brand-brown wash) and a **single peak
strength** across all three, keeping each card's **direction** appropriate to its text
placement. Net effect: the photo darkens consistently (same hue-neutral family, same
perceived strength) on all three, and legibility is preserved everywhere.

**Single unified value to standardise on: a neutral-black scrim peaking at `rgba(0,0,0,0.55)`**
(legible for centre text with the existing text-shadows; not so strong it kills the
photo). Apply it per card as follows — strength unified, direction preserved:

- **Orders-open** (`.act-orders-open-artwork__tint`, 946) and **Capacity**
  (`.act-capacity-artwork__tint`, 1074) — centre text, so they need darkening in the
  **middle**, which a pure bottom gradient won't give. Replace the brand-brown flat
  `0.28` with a **neutral flat black** at the unified strength, e.g.
  `background: rgba(0,0,0,0.40);` (drop `background-color: var(--vendor-brand-primary)`
  and `opacity`). Black at ~0.40 ≈ the perceptual darkening of the old brown-0.28 but
  **without the hue shift** and matched between the two cards. Keep them **byte-identical**
  so the two flat cards can never drift again.
  - **Remove or neutralise the `.is-soldout` 0.62 bump** (1082–1084) — or, if sold-out
    emphasis is wanted, move it to a small text/treatment change rather than a tint-alpha
    jump, so the scrim stays constant across states. The 0.28→0.62 swing is the
    same-state divergence and should not survive the unification.
- **Reveal** (`.menuCardArtwork__scrim`, 196) — bottom-left text, so its gradient
  **MUST stay bottom-weighted** (`to bottom`, bottom ~58%; a flat full tint would
  over-darken the bright top and lose the hero look). It is **already neutral black**,
  so its colour is consistent; only align its **peak** to the unified figure. Its
  current bottom peak `0.92` is darker than the flat cards' ~0.40 — that is acceptable
  because reveal's text sits in the darkest bottom band while the centre cards spread a
  lighter constant tint across the whole frame; but if you want the bottom edges to feel
  equal, ease the reveal peak toward the unified strength (e.g. cap the gradient around
  `rgba(0,0,0,0.72–0.80)` at 100%).

**Direction that must be preserved (do not flatten):**
- Reveal → **bottom-weighted** gradient (bottom-left text).
- Orders-open / Capacity → **full-bleed flat** (centre text needs centre darkening; a
  bottom-only gradient would leave centre text washed on a bright photo).

**The single decision the one-value fix turns on:** switch orders-open + capacity from
`var(--vendor-brand-primary)` / `0.28` (+`is-soldout 0.62`) to **one neutral-black flat
alpha (recommended `rgba(0,0,0,0.40)`)**, identical on both cards, and keep reveal's
black bottom gradient (optionally easing its peak toward the same family). Colour and
strength then read consistent across the whole set; geometry and export are untouched.

*(Out of scope per instructions: the 540px box geometry and the html2canvas export were
not examined for change and must not be altered — the fix is purely the overlay colour/alpha.)*
