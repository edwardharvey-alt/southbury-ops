# Ticket 2c — vendor page resting-state lead rework: audit findings

Audited against `origin/main` @ `33c0632`. Symbol-led, not line-number-led.

---

## 1. Full resting page composition, as shipped

Assembled by `renderPage()`'s final `else` branch plus the shared tail:

```js
hero     = heroRestingHtml(vendor)
sections = recentDropsHtml(recent) + explainHtml() + followHtml({...})
sections += faqHtml(vendor)
root.innerHTML = topbarHtml(vendor) + "<main>" + hero + sections + "</main>" + footerHtml(vendor)
```

What a visitor actually sees, top to bottom:

| # | Block | Content |
|---|---|---|
| 1 | `topbarHtml` | logo + vendor name (nav chrome) + Share button |
| 2 | `heroRestingHtml` | eyebrow "Nothing on right now" → `<h1>Between drops</h1>` → `.lede` ("{Vendor} cooks to a plan — …") → offer/tagline line |
| 3 | `recentDropsHtml` | "Recent drops" dated rhythm list (omitted when none) |
| 4 | `explainHtml` | static Hearth explainer, "What's a drop?" + three rules |
| 5 | `followHtml` | **the follow/capture card**, `#vpFollowCard` (+ catering block as a sibling inside the same `<section>`) |
| 6 | `faqHtml` | vendor-authored FAQ (omitted when none) |
| 7 | `footerHtml` | vendor name + "Powered by Hearth" |

**The finding that matters:** the follow control — the only thing a visitor can
do in this state, on the state the strategy calls the capture surface — is
**fifth**, behind both the recent-drops list and a static explainer. The hero
leads with absence and the action is buried two sections down.

Moving `followHtml(...)` to the front of the resting `sections` string is a pure
ordering change to one concatenation in one branch. It needs no new component,
no new class and no CSS. That is the whole repositioning.

Note the drop states deliberately put `explainHtml()` first ("a stranger
arriving mid-order needs the model explained before the CTA makes sense" —
existing comment). That reasoning does not carry to resting once the new status
line states the model inline, and those branches are not being touched anyway.

## 2. The follow control — write path confirmed, and untouched

Markup: `followHtml(opts)` → `<section>` containing `.follow#vpFollowCard`
(h2 title, sub `<p>`, `.follow-note`, `#vpFollowForm` with name / email /
outward postcode / optional mobile / consent / conditional messaging consent /
submit / notice) followed by `cateringLinkHtml()` as a **sibling** of the card
inside the same section.

Resting copy today: title `"See what's coming next"`, sub `"Hear first when the
next drop opens."`, cta `"Keep me posted"`, `ghost: false`.

Submit handler (`wireFollow`) posts to `register-vendor-interest` with exactly:

```
vendor_slug, name, email, postcode, phone, consent,
messaging_consent, capture_placement
```

**`capture_state` is not sent by the page at all** — it is set server-side; the
`register_vendor_interest_atomic` RPC hardcodes `'resting'` (the known
inaccuracy tracked as T-capture-state-accuracy, out of scope here). So "do not
change what the follow control writes" is satisfied structurally: this PR
changes *where the block is emitted in a string*, and touches neither
`followHtml`'s form markup, nor the handler, nor the payload.

One invariant to preserve when moving the block: the catering block must stay a
**sibling** of `#vpFollowCard`, never nested — the success handler replaces
`card.innerHTML` and would destroy anything inside it. Moving the whole
`followHtml()` return value keeps that intact.

## 3. Offer/tagline precedence (Ticket 1 PR2) — confirmed, reused unchanged

Inside `heroRestingHtml`: `offerText` and `taglineText` are read and `trim()`ed,
then

- `offerText` → `<p class="offerline">` (display face, considered statement)
- else `taglineText` → `<div class="vendorline"><span>` (quiet strapline)
- else `identityLine = ""` — no element at all

Exactly one is ever emitted. This block is **lifted verbatim** into the new
order; its logic, its two classes and its comment are unchanged.

## 4. The other three states + not-found — what they render, so the diff can prove them untouched

- `live_drop` / `full_drop` / `announced_drop` all render `heroDropHtml(st, drop, capacity)`:
  eyebrow → `<h1>` = **drop** name → optional `.lede` (`drop_intro`, or the
  full-drop "all places taken" sentence) → `factsStripHtml` → `orderCtaHtml`
  (live only). Each branch then composes
  `explainHtml() + recentDropsHtml() + followHtml({state-specific copy})`.
- `renderNotFound()` renders its own `.hero.plain` block; `renderError()`
  likewise. Neither calls `heroRestingHtml`.

`heroDropHtml`, `factsStripHtml`, `orderCtaHtml`, `renderNotFound` and
`renderError` are not edited by this PR, and the three drop branches of
`renderPage` keep their existing `sections` order.

## 5. Available classes on the resting hero, and the one spacing gap

| Class | Definition | Role after the rework |
|---|---|---|
| `.hero.resting` | `padding:72px 0 8px` | container, unchanged |
| `.eyebrow` | UI face, 12px, uppercase, `var(--v-primary)` | **no longer emitted in resting**; class stays (drop heroes use it) |
| `h1` | `var(--display)`, 500, `clamp(48px,8.2vw,80px)`, `margin:0 0 22px` | now the vendor name |
| `.hero.resting h1` | `clamp(52px,9vw,86px)`, `line-height:.98` | unchanged override |
| `.lede` | 20px UI face, `var(--h-ink-soft)`, `max-width:34em`, `margin:0` | now the platform status line |
| `.offerline` | `var(--display)`, `clamp(22px,2.6vw,26px)`, `var(--h-ink)`, `margin:34px 0 0` | offer statement, unchanged |
| `.vendorline` | 15px, `var(--h-ink-soft)`, `border-top`, `margin:34px 0 0` | tagline fallback, unchanged |

`vendorName()` returns `display_name || name || "This vendor"` — the existing
helper, reused for the `<h1>`.

**The one gap.** `.lede{margin:0}` works today because the lede sits directly
after the `<h1>` (whose `margin-bottom:22px` supplies the space). In the new
order the lede follows the offer/tagline line, which has no `margin-bottom`, so
the status would butt straight against the offer with zero separation.

Fix used: one scoped spacing rule, `.hero.resting .lede{margin-top:26px}` — an
adjustment to an existing class, no new class or component, and scoped to
`.resting` so the drop heroes' and `.plain`'s `.lede` are provably unaffected.
Adjacent-sibling margins collapse, so the separation resolves to a consistent
26px in all three content cases (offer present, tagline present, neither).

**Flagged for the deploy-preview eyeball, not fixed here:** `.hero.resting h1`
tops out at 86px, a size tuned for the two-word "Between drops". A long vendor
name ("Southbury Farm Pizza Company") will wrap to two lines at desktop width.
That is plausibly correct for a display-face identity lead, and `text-wrap:balance`
would even it out — but adding it is a visual-treatment change, which is
redesign territory rather than 2c. Left alone deliberately; worth human eyes.
