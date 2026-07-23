# Ticket 1 PR2 — render `offer_statement` on the public pages: audit findings

Audited against `origin/main` @ `ffafae0`. Symbol/DOM-led, not line-number-led.

---

## 1. Vendor page (`vendor.html`) — read path and identity block

**Read path confirmed.** `vendor.html` consumes `get-vendor-page`; the response is
assigned at `state.vendor = result.data.vendor`. PR1 added the field in both
required places in that EF — `VENDOR_COLUMNS` (the fetch) and `buildVendorBlock()`
(the re-projection) — so **the client already receives it** under the key
`vendor.offer_statement`, top-level alongside `tagline`. Verified by reading
`get-vendor-page/index.ts`: `offer_statement: vendor.offer_statement ?? null`.
No read-path change needed on this page.

**Identity block — the important structural finding.** The vendor's *name* renders
in `topbarHtml()` (present in all four states). The *tagline* renders in exactly
ONE place: `heroRestingHtml()`, as `<div class="vendorline">`. The three drop
states (`live_drop`, `full_drop`, `announced_drop`) render `heroDropHtml()`, whose
`<h1>` is the **drop** name, whose lede is `drop_intro`, and which is followed
directly by the facts strip and the order CTA. There is no vendor identity block
in those states at all.

So the brief's "in whatever states the identity block already shows" resolves to:
**the resting state only.** Adding the offer line to the drop heroes would place a
paragraph of vendor identity copy between the drop name and "See the menu and
order" — that is transactional territory and a composition change, i.e. the
2c/redesign boundary the brief tells me to stop at. Ticket 2c's own stated job
("reorder the resting state to lead identity → offer → next drop → follow")
corroborates that the offer line's home is the resting state.

**Insertion point:** inside `heroRestingHtml()`, immediately after the `vline`
(tagline) fragment, at the end of the resting hero. The resting hero contains no
transactional content, so "before any transactional content" is satisfied by
construction.

**Escaping:** `vendor.html` builds HTML strings into `root.innerHTML`; every
vendor-authored string goes through `escapeHtml()` (`vendor.html:320`) — `tagline`
at `heroRestingHtml`, every FAQ q/a at `faqHtml`. Mirrored exactly.

**Absent-state behaviour of the sibling:** `tagline` uses
`(vendor && vendor.tagline) ? '<div class="vendorline">…</div>' : ""` — returns an
empty string, so no element is emitted at all. Mirrored, with the falsy test
widened to cover whitespace-only (a stored `"   "` is falsy-adjacent but truthy in
JS; PR1's write path coerces blank to NULL, but this render must stand on its own).

---

## 2. Order page (`order.html`) — read path and identity block

**Read path — the brief's premise is wrong here, and this is load-bearing.**

The brief states "no read-path change (the data already arrives)". That holds for
`vendor.html` but **not** for `order.html`. The page's `v_vendor_public` read uses
an **explicit column list**, not `select("*")`:

```js
.from("v_vendor_public")
.select("id, display_name, name, tagline, logo_url, hero_image_url, website_url,
         brand_primary_color, brand_secondary_color, brand_text_on_primary,
         powered_by_hearth_visible")
```

`offer_statement` is a column on the view (PR1's migration appended it) but the
client never asks for it, so `state.vendor.offer_statement` is `undefined` today.
**One column name must be added to that select list** or this page renders nothing,
always. This is a client select-list change, not a change to the view, the EF, or
any migration — the read path itself is untouched.

Per operational learning #54, adding a name to an explicit select list is the
exact shape that hard-400s the *entire* query if the column is absent on the live
DB — which would take the customer order page down, not degrade it. The column
exists: PR1's migration `20260722130000` recreates `v_vendor_public` with
`offer_statement` appended last, and PR1 is merged and verified in production.
Restated as a pre-merge check in the PR body regardless.

**Identity block.** Hero markup is:

```
.heroMedia > .heroInner
  .heroTopRow
    .heroTopLeft
      img#vendorLogoHero
      .heroVendorBlock
        h1#heroVendorName      ← vendor name
        p#heroTagline          ← tagline
    #heroVisitWrap
  .heroDropBlock               ← drop title, sub, host, chips, lockup, CTA
```

**Insertion point:** inside `.heroVendorBlock`, immediately after `#heroTagline`,
which is below the name and above `.heroDropBlock` — every piece of drop/menu and
transactional content sits in or after that block. `.heroVendorBlock` is
`min-width:0` inside a flex row, so a stacked paragraph in it is a block-level
child that reflows correctly; `.heroTagline` already carries `max-width:540px`,
so the new line follows the same measure discipline.

**Escaping:** `applyVendorBranding()` sets both identity strings via
`textContent` (`byId("heroTagline").textContent = tagline`), never `innerHTML`.
Mirrored — `textContent`, so no escaping call is needed or appropriate.

**Absent-state behaviour of the sibling — deliberate divergence.** `tagline` on
this page does *not* degrade to nothing: `vendor.tagline || "Freshly made and
ready to order"` substitutes a generic fallback, so the element always renders.
The brief's degrade-to-nothing rule is explicit and load-bearing, so
`offer_statement` does **not** copy that behaviour — it renders nothing when
absent. The absent-state model followed is the one used by this page's other
optional hero elements (`#heroHostLine`, `#heroDropEyebrow`, `#vendorLogoHero`):
a `.hidden` class toggle, where `.hidden{display:none !important}` is global at
`order.html:1651`. `display:none` reserves no space, so there is no gap.

---

## 3. Brand tokens — what exists, and one required deviation

**`vendor.html`** defines real tokens in `:root`:

| Token | Value | Role |
|---|---|---|
| `--display` | `"Cormorant Garamond",Georgia,serif` | display face |
| `--ui` | `"Figtree",…` | UI face |
| `--h-ink` | `#1f2937` | brand ink |
| `--h-ink-soft` | `#6b6660` | secondary ink |

Resting-hero type scale, for sizing one step down from the heading:

- `.hero.resting h1` — `var(--display)`, weight 500, `clamp(52px,9vw,86px)`
- `.lede` — 20px, `var(--h-ink-soft)`, `max-width:34em`
- `.vendorline` — 15px, `var(--h-ink-soft)`, `margin:34px 0 0`, `border-top`

The offer line therefore uses `var(--display)` + `var(--h-ink)` at
`clamp(22px,2.6vw,26px)` — unambiguously a step down from the h1, and above
`.vendorline`'s 15px soft-ink strapline register. `34px` top margin reuses
`.vendorline`'s existing rhythm value rather than inventing a new one. No new
colour or font-family value is introduced.

**`order.html` has no token layer** — it uses literal font stacks and
per-component values, with brand colour injected as CSS custom properties at
runtime (`--order-brand-primary`, `--order-brand-text`, …).

Two consequences, both checked rather than assumed:

1. **The display face still applies.** `.heroVendorName` is an `<h1>`, and the
   `h1, h2` rule at `order.html:41` sets `font-family:'Cormorant Garamond',
   Georgia, serif`. `.heroVendorName` overrides `font-weight` (950) but not
   `font-family`, so the vendor name genuinely renders in the display face. The
   offer line reuses that same stack at 20px (17px at the mobile breakpoint,
   matching where `.heroVendorName` steps 30px → 22px) — a step down from the
   name, above `.heroTagline`'s 13px.

2. **"Brand-ink" must NOT be used here, and this is a correctness matter.** The
   order hero is a saturated colour/photo panel; all of its text is
   `var(--order-brand-text, #fff)`. `.heroTagline` uses
   `color-mix(in srgb, var(--order-brand-text,#fff) 72%, transparent)`. Applying
   a dark brand-ink value would render the line near-invisible on the vendor's
   own hero. The offer line uses the same hero text token at 92% — brighter than
   the tagline's 72%, dimmer than the name's 100%, which is the intended
   prominence ordering expressed in the token that actually governs this surface.

---

## 4. Scope confirmation

Files to change: `vendor.html`, `order.html` (plus this findings file).
No migration, no Edge Function, no view change, no state-cascade change, no
header/layout rework, no token changes.
