# Findings — Activation detail-card mobile width sweep (all drop profiles)

Read-only static audit of `activation.html` at branch
`claude/activation-detail-mobile-overflow-t9ytrs` (HEAD `ff72ccb`). Goal:
confirm no drop type ships a detail card with an un-contained, fixed-wide
field — including the host cards (2, 5) and email cards (3, 9) that do NOT
render on the current live/public/no-host test drop.

## Headline

**The sweep CONFIRMS we are done.** There are exactly **two** fixed-px
width sources in the entire detail-card surface —
`.act-message-edit { width:720px }` (:1153) and
`.act-poster-hook { width:600px }` (:1406) — and **both are already
covered** by the Step-2 `@media (max-width:768px)` block (commit
`ff72ccb`). Every other field across all nine cards is either `width:100%`,
`width:auto`, or sits in a `flex-wrap:wrap` row, so none exceeds a 393px
viewport. The host cards (2, 5) and email cards (3, 9) contain **no
fixed-wide fields at all**.

One *non-blocking* parity nit: `.act-email-send-error` (cards 3 & 9) is an
inline-styled block with no CSS rule and is not in Step-2's
`overflow-wrap` list (its sibling `.act-copy-error` is). It is **not** a
fixed-width offender — it inherits the constrained card width — so it
cannot cause horizontal overflow on its own; only a pathological unbroken
error token could. Optional hardening, not a gap.

---

## 4. Card → drop-profile matrix (from `getDropProfile`, :1815-1818)

| Profile (openness × host) | Cards rendered |
|---|---|
| open + host | 1, 2, 3, 4, 5, 6, 7, 8, 9 |
| open + no-host | 1, 3, 4, 6, 7, 8, 9 |
| closed + host | 2, 3, 5, 7, 9 |
| closed + no-host | 3, 7, 9 |

- **Host-only cards: 2 (`host_heads_up`), 5 (`host_link`)** — only on
  `host` profiles. Not on the current test drop.
- **Email cards: 3 (`early_access`), 9 (`thank_you`)** — on *every*
  profile (3 and 9 render in all four). Built by the shared `emailCard()`
  (:2846).
- Card 4 (`vendor_open`) and 5 vary internal channels by openness
  (`card4`/`card5` descriptors, :1805-1813) but the field *classes* are
  the same set.
- Cards 1, 6, 8 carry the 540 artwork + caption (open profiles); 8 is
  locked-until-closed. 7 is a static auto-card (an `.act-copy-btn` link).

---

## 1+2+3. Field-by-field table  [card → field → base width rule → covered?]

Legend for "Covered?": **Y(frame)** = artwork handled by the frame-fluid +
overflow:hidden + JS-scale design; **Y(Step-2)** = explicitly in the
≤768px containment block; **Y(base)** = base rule is already
`width:100%`/`auto` or a `flex-wrap:wrap` row, no fix needed; **n/a** =
not width-bearing.

### Card 1 — reveal / `menu_reveal` (open profiles)
| Field | Class | Base width rule | Covered? |
|---|---|---|---|
| artwork frame | `.menuCardArtworkFrame` | inline width:100%;max-width:280px | Y(frame) |
| artwork box | `.menuCardArtwork` | width:540px (:186) | Y(frame, clipped) |
| caption wrap | `.act-message-edit` | **width:720px (:1153)** | **Y(Step-2)** |
| caption field | `.act-message-edit textarea` | width:100% (:1117) | Y(base) |
| tweak chips row | `.act-chip-row` / `.act-chip` | inline-flex; flex-wrap:wrap (:506) | Y(Step-2 wrap) |
| guidance row/field | `.act-guidance-row` / `.act-guidance-input` | width:100% (:1348/:1369) | Y(Step-2) |
| generate row | `.act-message-edit-row` | flex; flex-wrap:wrap (:1127) | Y(Step-2) |
| error slot | `.act-copy-error` | inline-styled, no width | Y(Step-2) |
| photo controls | `.act-photo-controls` (+`__swatches` max-width:240; `__upload` flex:0 0 132px) | flex; flex-wrap:wrap (:472) | Y(base wrap) |
| zone/grid | `.act-zone` / `.act-social-grid` | flex (:465/:468) | Y(Step-2) |

### Card 2 — host heads-up / `host_heads_up` (host profiles only)
| Field | Class | Base width rule | Covered? |
|---|---|---|---|
| note | `.act-note` | font only, no width (:532) | Y(base) |
| button row | `.act-channel-row` | flex; **flex-wrap:wrap** (:715) | Y(base) |
| buttons | `.act-copy-btn` | inline-flex; mobile max-width:100%+white-space:normal (:837) | Y(base mobile) |
| error slot | `.act-copy-error` | inline-styled, no width | Y(Step-2) |
| actions | `.act-actions` | flex column; align-items:flex-start (:524) | Y(base) |

### Card 3 — early-access email / `early_access` (all profiles) — `emailCard()`
| Field | Class | Base width rule | Covered? |
|---|---|---|---|
| brand header | `.act-email-brand-header` / `.act-email-brand-dot` | flex; dot 28px (:1375/:1383) | Y(base) |
| subject field | `.act-email-field` + `.act-email-subject-input` | width:100% (:752) + inline width:100%; box-sizing (:739) | Y(base) |
| body field | `.act-email-body-input` (textarea) | width:100% via `.act-email-field textarea` (:752) | Y(base) |
| ai-draft note | `.act-ai-draft` | font only (:1367) | Y(base) |
| tweak chips | `.act-chip-row` / `.act-chip` | inline-flex; flex-wrap:wrap (:506) | Y(Step-2 wrap) |
| guidance | `.act-guidance-row` / `.act-guidance-input` | width:100% | Y(Step-2) |
| confirm row | `.act-confirm-row` | flex; **flex-wrap:wrap** (:772) | Y(base) |
| buttons | `.act-copy-btn` | mobile max-width:100% | Y(base mobile) |
| send error | `.act-email-send-error` | inline-styled block, no width | **Y(inherits) — parity nit** |
| note | `.act-note` | font only | Y(base) |

### Card 4 — ordering opens / `vendor_open` (open profiles)
| Field | Class | Base width rule | Covered? |
|---|---|---|---|
| artwork frame/box | `.menuCardArtworkFrame` / `.act-orders-open-artwork` | width:540px (:1010) | Y(frame) |
| message wrap | `.act-message-edit` | **width:720px (:1153)** | **Y(Step-2)** |
| poster wrap | `.act-poster-hook` | **width:600px (:1406)** | **Y(Step-2)** |
| poster generate | `.act-poster-generate` | width:100% (:1409) | Y(Step-2) |
| poster hook input | `.act-guidance-input` (nested) | width:100% | Y(Step-2) |
| chip / generate rows | `.act-chip-row` / `.act-message-edit-row` | flex-wrap:wrap | Y(Step-2) |
| social toggles | `.act-social-toggles` / `.act-social-toggle` | inline-flex; flex-wrap:wrap; max-width:100% (:513) | Y(base) |
| photo controls | `.act-photo-controls` | flex-wrap:wrap (:472) | Y(base) |
| error slot | `.act-copy-error` | inline-styled | Y(Step-2) |
| zone/grid | `.act-zone` / `.act-social-grid` | flex | Y(Step-2) |

### Card 5 — host link / `host_link` (host profiles only)
| Field | Class | Base width rule | Covered? |
|---|---|---|---|
| note | `.act-note` | font only | Y(base) |
| button row | `.act-channel-row` | flex; **flex-wrap:wrap** (:715) | Y(base) |
| buttons | `.act-copy-btn` | mobile max-width:100% | Y(base mobile) |
| error slot | `.act-copy-error` | inline-styled | Y(Step-2) |
| done line | `.act-done-state` | font only (:428) | Y(base) |

### Card 6 — capacity / `capacity_signal` (open profiles)
| Field | Class | Base width rule | Covered? |
|---|---|---|---|
| artwork frame/box | `.menuCardArtworkFrame` / `.act-capacity-artwork` | width:540px (:1139) | Y(frame) |
| wording options | `.act-capacity-wordings` / `.act-capacity-wording` | width:100% (:495) | Y(base) |
| caption (if message variant) | `.act-message-edit` family | width:720px | Y(Step-2) |
| copy button | `.act-copy-btn` | mobile max-width:100% | Y(base mobile) |
| locked note | `.act-locked-note` | font only (:422) | Y(base) |
| photo controls | `.act-photo-controls` | flex-wrap:wrap | Y(base) |
| zone/grid | `.act-zone` / `.act-social-grid` | flex | Y(Step-2) |

### Card 7 — order ready / `service` (all profiles, static auto-card)
| Field | Class | Base width rule | Covered? |
|---|---|---|---|
| sent line | `.act-sent-line` | font; :empty→display:none (:695) | Y(base) |
| CTA link | `.act-copy-btn` (anchor) | mobile max-width:100% | Y(base mobile) |

### Card 8 — post-drop / `post_drop` (open profiles, locked until closed)
| Field | Class | Base width rule | Covered? |
|---|---|---|---|
| caption wrap | `.act-message-edit` | **width:720px (:1153)** | **Y(Step-2)** |
| caption field | `.act-message-edit textarea` | width:100% | Y(base) |
| chips / guidance / generate / error | `.act-chip-row`, `.act-guidance-*`, `.act-message-edit-row`, `.act-copy-error` | as Card 1 | Y(Step-2) |

### Card 9 — thank-you email / `thank_you` (all profiles) — `emailCard()`
Identical field set to **Card 3** (same `emailCard()` builder). All
**Y(base)** / **Y(Step-2)**; same `.act-email-send-error` parity nit.

---

## Cross-reference vs the Step-2 ≤768px block (commit `ff72ccb`)

Step-2 covers: `.act-zone`, `.act-message-edit`, `.act-message-edit-row`,
`.act-guidance-row`, `.act-guidance-input`, `.act-copy-error`,
`.act-poster-hook`, `.act-poster-generate` (width/max-width:100% +
min-width:0 + box-sizing), `overflow-wrap:anywhere` on the text fields,
and `flex-wrap:wrap` on `.act-chip-row` + `.act-message-edit-row`. Plus the
earlier artwork-frame fluid rule + zone-stacking.

**Full-stylesheet fixed-width sweep results:**
- `width: ≥100px` literals (excl. 540 artwork): **only** `:1153`
  (`.act-message-edit` 720) and `:1406` (`.act-poster-hook` 600) — **both
  covered**.
- `min-width: ≥Npx`: only `:471` (`.act-social-grid>.act-zone:last-child`
  min-width:280) — **overridden** to `min-width:0` by the zone-stacking
  rule.
- `flex: 0 0 Npx` fixed bases: `:470` (zone first-child 280 — overridden
  by zone-stacking) and `:474` (`.act-photo-controls__upload` 132 —
  <393 and in a `flex-wrap:wrap` parent, fits).
- `white-space: nowrap`: `:404` (`.act-channel-badge`, a tiny header
  pill — short text, not a wide row), `:481` (`.hpu-add-btn`, small),
  `:991` (`.nav`, the **intentional** nav scroller — the known
  `a.utility`/`nav-action` exception), `:991`-area only. The `:109/:113/
  :132` nowrap rules are on `.actod-*` = the **overview** (cross-drop)
  cards, NOT detail cards (out of scope of renderDropView).

---

## UNCOVERED offenders to fix

**None that cause overflow.** Every fixed-wide detail-card field is
already contained.

Optional hardening (cosmetic parity only, not an overflow risk):
- `.act-email-send-error` (cards 3 & 9) — add `overflow-wrap:anywhere`
  (and it would inherit the existing width:100% containment of its parent)
  for parity with `.act-copy-error`. Only matters if an error message ever
  contains a long unbreakable token. Safe to leave as-is for launch.

**Conclusion:** the sweep validates that the Step-2 fix is complete across
all four drop profiles — including the host (2, 5) and email (3, 9) cards
not visible on the current test drop. No additional containment rules are
required before removing the diagnostic.
