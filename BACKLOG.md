# Hearth — Development Backlog

This file holds the complete development backlog: every ticket from Tier 1 through
Tier 9, both completed (✓ COMPLETE / ✓ PARTIAL / SUPERSEDED / RETIRED / RESOLVED /
CLOSED) and open, with their full implementation narratives and detailed specs.
It is the historical record of what has shipped and the working specifications for
what hasn't been built yet.

CLAUDE.md is loaded into every Claude Code session as standing context; this file
is not. When working on a specific ticket, open BACKLOG.md to read the full spec
or the implementation history. The CLAUDE.md "Development backlog" section
maintains a one-line index of currently open tickets only.

Caveats:
- ✓ COMPLETE entries describe what was implemented at the time of writing — git
  log and the code are authoritative for the current state. Treat the narratives
  here as supplementary context, not source of truth.
- New tickets are still added to this file as they're surfaced. When closing a
  ticket, mark it ✓ COMPLETE here and remove its entry from the open-ticket index
  in CLAUDE.md.

---

## Development backlog

---

## ⛔ THE STOP LINE — table stakes above, the moat below

> **Per Hearth_Strategy.md §11 Phase 4 (the stop line).** This banner is a
> **classifier**, not a physical ordering — the tickets below are grouped by
> Tier (T2–T9), which cuts across the capture→moat axis. Read every ticket
> through this line.

**At this point Hearth is "a competent ordering platform with a good customer
list." So is Flipdish. So is Slerp. So is Square. One of them is free.**
Everything **above the line** is *table stakes* — the price of entry, not the
business. Build it cheap, build it fast, then stop. Every hour **below the
line** belongs to the moat. No new capture surfaces; no feature-parity chasing.
If a vendor asks for something Flipdish already does well, the answer is *"not
yet"* — unless it feeds the customer asset or the intelligence layer.

**ABOVE THE LINE — table stakes (be competent, never distinctive; §8 Tier 1 +
§11 Phases 1–3).** The capture layer and everything at or below it: Identity &
Offer, demand capture doors (permanent vendor page, table/till QR, ordering
windows, follow/notify-me, sold-out capture, import), moment design &
fulfilment, the Service Board, Drop Studio, the Offer catalogue, Stripe/payments,
and asset integrity (identity resolution, capture origin). In backlog terms:
most of Tier 2–4, the ordering/capacity/fulfilment work in Tier 5-B, and Tier 6
production readiness.

**BELOW THE LINE — the moat (Hearth lives or dies here; §8 Tier 3 + §11 Phases
5–7 + §12.3 engines).** No competitor has this:

- **Intelligence & coaching (§11 Phase 5 — the primary moat investment).** The
  recommendation surface (sentences, not charts), geographic clustering, cadence
  monitoring / scorecard coaching, menu intelligence (occasion/shape/audience —
  never the food), the neighbourhood recommendation. Tickets: T5-15, T5-C5,
  T4-29, the intelligence-engine work.
- **Host, affinity & community network (§11 Phases 6–7).** Recruited by hand per
  vendor first (a motion, not a platform), then directory/discovery/matching
  once catchment density exists. Tickets: T5-16 → T5-20, T5-26, T5-27,
  T5-C2/C3/C4.
- **Vendor referral (§12.3 Engine 4 — the only compounding channel).** Currently
  **absent from every document** — status and early access, never a discount. It
  needs a mechanic and one does not yet exist; it should be designed.

**The convergence that makes the line non-negotiable (§12.3):** the intelligence
layer is simultaneously our moat, our salesperson (Engine 3 — it sells the drop
so vendor #20 converts with no founder in the room), our coach (Engine 1 —
productise the cadence coaching), and our retention mechanism. **Building the
moat *is* the scaling solution.** If founder-led acquisition is still the
majority of our vendors in year three, we have a job, not a company.

---

## ⬆️ ABOVE THE STOP LINE — Capture layer (T-CAP-, table stakes)

The capture-first entry points (Hearth_Strategy.md §11 Phases 1–3). These are
**table stakes** — build them cheap, build them fast, then stop (§11 Phase 4).
They exist to turn the capture → own → read loop (§5), not to win on ordering.
Grouped here as the capture-door cluster; classified above the stop line by the
banner above (a classifier, not a physical reordering of the tiers).

**T-CAP-1 · Permanent vendor page — THE UNLOCK (highest priority in the capture layer)**

**Status:** Open. Above the stop line. Source: Hearth_Strategy.md §11 Phase 1
("the unlock — and it is not currently in the backlog"). Healthy Habits has
already asked, unprompted, for a permanent QR — the customer telling us what to
build.

A durable address — `lovehearth.co.uk/{vendor}` — that always resolves to
whatever is true now: ordering open, drop announced, drop live, or **nothing
on**. Everything in Hearth today is drop-scoped and drop links expire; a QR
sticker on a table or a van cannot point at a drop URL (stickers last months,
drops last days). **The "nothing on" state is NOT an empty state — it IS a
capture surface** (follow/notify-me, T-CAP-7), and it is the state the page will
be in most of the time. When a drop is live/open the page must show **real,
honest capacity** (§6.2, and the Trust & Governance constraint in §8).

**EF-read constraint (hard):** the page's public capacity read MUST go through a
JWT/token-scoped Edge Function (the `v_drop_public` / `host-view-summary`
pattern), **never direct anon PostgREST** against `v_drop_summary` /
`drop_capacity`. See T-drop-capacity-anon-grants (reframed as this page's public
read-path prerequisite).

**Cross-reference:** T-CAP-2 (the durable QR points here), T-CAP-7 (the "nothing
on" capture surface), T-drop-capacity-anon-grants (public read path).

**T-CAP-2 · Vendor QR vs drop QR — two distinct artefacts**

**Status:** Open. Above the stop line. Source: §11 Phase 1. Two clearly-labelled
artefacts: the **durable vendor QR** points at the permanent vendor page
(T-CAP-1) and lasts months on a sticker/van/counter; the **drop QR** points at a
specific drop and is short-lived by design. Never conflate them — a durable
sticker must never carry an expiring drop URL. **Cross-reference:** T-CAP-1,
T-CAP-3 (till QR is a vendor QR variant).

**T-CAP-3 · Till QR — capture only (no ordering, no payment)**

**Status:** Open. Above the stop line. Source: §11 Phase 2; §9.2 (payments).
*"Scan to hear what's next."* Capture a named, consented, contactable local
person at the counter with **no ordering and no payment** on this door. This is
a **principled boundary, not a Stripe compromise:** §9.2 establishes there is no
payment-cost win available to offset routing counter sales through Hearth (Stripe
1.5% + 20p is dearer than the vendor's card machine on every basket below ~£105),
so the till QR must be capture-only — which also keeps the fee model clean (we
earn only on demand we created, §9.1). **Cross-reference:** T-CAP-2, T-CAP-7,
T-CAP-10 (capture origin = 'presence').

**T-CAP-4 · Table QR / order-ahead — order + pay**

**Status:** Open. Above the stop line. Source: §11 Phase 2. Order and pay from
the table, justified specifically where the vendor **saves staff time** or the
customer **skips a queue** (not as a general always-on channel). Distinct from
the till QR (T-CAP-3, capture-only) precisely because a table order clears one of
those two bars. Still bounded by presence (the vendor is there). **Cross-reference:**
T-CAP-3, T-CAP-10 (capture origin = 'presence').

**T-CAP-5 · Ordering windows — ring-fenced, slotted capacity**

**Status:** Open. Above the stop line. Source: §6.2, §11 Phase 2. A vendor-set
ordering window (Saturday collection, Thursday pre-order, weekday lunch),
implemented as a drop with a long window, large capacity and recurrence. The §6.2
design is non-negotiable and is what separates us from Square/Flipdish "hours":

- **Default is closed.** Closed is the dignified resting state ("here's when
  we'll be back", capturing you while it waits), open is the event. Not a
  greyed-out failure state.
- **Real declared capacity, so nobody is ever rejected.** Capacity is committed
  up front; ordering closes when reached. You never accept more than you said you
  could make. (Early close — "we've run out" — is a binary pause with clean
  refunds, not a rejection.)
- **Slotted.** e.g. four orders per fifteen-minute collection slot, pacing online
  orders to a rate the kitchen absorbs alongside walk-ins.
- **Ring-fenced, never dynamic.** A declared block genuinely committed, not
  competing with the counter. **No live "how busy am I" capacity dial** — it
  breaks the promise, corrupts honest scarcity, won't be used when needed, and is
  dangerous on the money path (§6.2). Planned variation only (Saturdays 20 / bank
  holiday 10), set before ordering opens so the customer never sees it change.
- **Never "always on."** Every ordering surface stays bounded — by presence, or
  by time + capacity. ("How busy am I" belongs in the intelligence layer as an
  input, not a control — see T-MOAT tickets / §6.2.)

**Note:** distinct from the existing event multi-window feature
(`window_group_id`, T4-34/35/36, T5-B29) — those are sibling time-windows within
one event drop; this is the recurring, default-closed, ring-fenced collection
window. **Cross-reference:** T5-8 (interest registration), T-drop-capacity-anon-grants.

**T-CAP-7 · Follow / notify-me — vendor-scoped capture (no live drop required)**

**Status:** Open. Above the stop line. Source: §11 Phase 2 ("probably the
highest-leverage door we have, and the one we have most under-rated"). Let a
person follow a vendor and be captured **when NO drop is live** — the "nothing
on" state of the permanent vendor page (T-CAP-1). Capture without a sale.

**Explicitly distinct from T5-8** (interest registration, ✓ COMPLETE) and
T-notify-next-time (sold-out waitlist, ✓ COMPLETE): both of those are
**drop-scoped** — they attach to a specific `drop_id` in `drop_signals`. A
vendor-scoped follow has no drop to attach to.

**Requires vendor-scoped signals:** `drop_signals` is currently **drop-scoped**
(`drop_signals(drop_id, customer_id, kind)`) — note this. A follow needs a
vendor-scoped signal (e.g. a `vendor_id`-keyed signal, or a nullable `drop_id`
with a `vendor_id` column), so the mechanic must be extended, not reused as-is.
**Cross-reference:** T-CAP-1 (the "nothing on" surface), T5-8 / T-notify-next-time
(drop-scoped siblings), T-CAP-10 (capture origin = 'follow').

**T-CAP-9 · Identity resolution — one customer across counter / window / drop**

**Status:** Open. Above the stop line. Source: §11 Phase 3 (Asset integrity —
"ships *with* Phase 2, not after"). A customer who orders at the counter, then at
a drop, then through a window must become **one** customer, not three. Without
it, *"every way you sell builds one customer base"* is a claim we cannot honour,
the repeat-customer signal silently fails, and the intelligence layer reads three
strangers where there is one regular — which quietly corrupts every T-MOAT
signal downstream. Broader than the import-time dedup already shipped in
`bulk-create-customers` (email-then-phone, four-way, import-scoped) — this is
cross-door resolution across all capture surfaces. **Cross-reference:** T-CAP-10
(capture origin), T-MOAT-1-equivalent clustering in T5-9 (depends on this being
correct).

**T-CAP-10 · Capture-origin extension — source per touch, cannot be retro-fitted**

**Status:** Open. Above the stop line. Source: §11 Phase 3 ("capture origin on
every touch... This cannot be retro-fitted. The data is captured from the first
order, or it never exists"). `customer_relationships.source_drop_id` already
exists (also added incidentally by T5-C2's schema block — verify before
re-adding); extend capture-origin to every new capture door and add a
capture-origin values `'drop' | 'presence' | 'window' | 'follow' | 'import' |
'host'`.

**HARD CONSTRAINT — do NOT add a fourth overlapping field.** Two origin-bearing
columns already exist on `customer_relationships`: **`source`** (used today with
`'import'`, e.g. `source === 'import'` in home/customers state) and
**`source_drop_id`** (added by T5-C2's schema block). This ticket must
**reconcile against both** — it must not introduce a third/fourth overlapping
origin column that partially duplicates them.

**Open design question (resolve at build time, not now):** either **extend the
existing `source` column's value set** to cover all six capture origins, or add a
single `source_type` enum and migrate `source`/`source_drop_id` onto a coherent
model — but land on **one** canonical origin representation, not several.
**Cautionary precedent:** tonight's legacy-pizzas cleanup (PR #467 — dropping
`orders.pizzas` / `capacity_pizzas` after overlapping capacity columns
accumulated across generations) is exactly the mess overlapping columns create;
do not repeat it on the source side. **Cross-reference:** T-CAP-3/4/5/7 (each
writes a distinct origin), T5-C2 (`source_drop_id`), T-CAP-9, PR #467 (overlapping
-column precedent).

**Not created — close equivalent already exists (reported, not duplicated):**
- **T-CAP-6 · Sold-out capture** → shipped as **T-notify-next-time** (✓ COMPLETE
  2026-07-14): `register-interest` accepts `kind='waitlist'` for sold-out/closed
  drops; order.html renders the demand-capture block; drop-manager surfaces
  `waitlist_count`. The full-drop dead end is already a capture moment.
- **T-CAP-8 · Bring-your-own-list import** → shipped as `customer-import.html` +
  the `bulk-create-customers` Edge Function (WORKING since 2026-05-15; closed
  T-ops-rls-customer-import). CSV import with four-way dedup is live. (Advanced
  POS/email/booking import remains open under T5-12.)

---

## ⬇️ BELOW THE STOP LINE — The moat (T-MOAT-)

The moat (Hearth_Strategy.md §8 Tier 3, §11 Phases 5–7, §12.3 engines). No
competitor has this; Hearth lives or dies here. Every hour beyond the stop line
belongs here. Classified below the stop line by the banner above.

**T-MOAT-2 · Recommendation surface — sentences, not charts (cross-reference)**

**Status:** Open — **folded into the reframed T5-15**, cross-referenced here so
the moat cluster is complete. Source: §11 Phase 5, §12.3 Engine 3, §9.3. T5-15
was reframed (PR #470) to BE the recommendation surface: plain-English signals
(*"140 of your customers live in Broadstone. That's a Friday drop."*), **not** a
dashboard or charts — closing the "a dashboard reports what happened; the vendor
still has to work out what to do" gap is the differentiation. It is also the
free-tier graduation mechanism (§9.3). **Do not build a second ticket — build
T5-15.** This entry exists only as the moat-cluster pointer. **Cross-reference:**
T5-15 (the actual ticket), T-MOAT-1-equivalent (geographic clustering in T5-9,
the primitive it reads), Hearth_Insights_Intelligence_Layer_Scope.md.

**T-MOAT-3 · Referral mechanic — Engine 4, the only compounding channel**

**Status:** Open. Below the stop line. Source: §12.3 Engine 4. Currently **absent
from every document** — self-serve, operators and partnerships each add a *fixed*
number of vendors a year, but **referral scales with the base we already have**
(independents know each other; a warm peer introduction beats any cold approach
and costs nothing). Above ~0.8 referrals per vendor per year with churn
contained, it begins to run on its own. **The reward must be status and early
access — NEVER a discount** (discounting is off-brand, §9.1/Appendix, and erodes
the vendor's margin to buy growth we should earn). *"You brought someone in — you
get first look at what we build next."* **This needs a mechanic and one does not
yet exist — it should be designed** (design-reference-first, like the other voice
work). **Cross-reference:** §13 item 7 (referral is unproven AND unbuilt).

**T-MOAT-4 · Affinity partnership support — gym / office / nursery**

**Status:** Open. Below the stop line. Source: §6.4, §11 Phase 6, §10.3. Support
for running an affinity drop with an audience-and-shared-context partner (gym,
workplace, nursery, co-working) — distinct from a host (no venue, no occasion, no
service window; §6.4) and distinct from affinity *matching/discovery* (already
specced inside T5-9 cross-category matching and T5-26 outreach — this is the
partner-facing operational support, not the match).

- **Pay partners in early access, not margin.** *"Gym members get first choice on
  Wednesday's menu, 24 hours before anyone else."* No discount, no margin erosion,
  no payout infrastructure — the insider mechanic already in the Drop
  Communications Architecture.
- **Curated menu = a relabelled subset, not a second kitchen.** A separate line
  means separate prep and SKUs (real cost to a small cafe); it must be a
  relabelled selection of what the vendor already makes.
- **Ask the cannibalisation question first (§6.4):** many gyms already run a café
  / shake bar — establish whether we'd be *adding* revenue or cannibalising theirs
  before anything else.
- Concierge/by-hand first (§11 Phase 6) — no platform build; line up one affinity
  partner for Healthy Habits by hand (§13 what-happens-next item 3, "the
  highest-value experiment available to us").

**Cross-reference:** T5-9 (cross-category affinity matching), T5-26 (host/partner
outreach), T5-C2 (early-access comms), §6.4.

**Not created — close equivalent already exists (reported, not duplicated):**
- **T-MOAT-1 · Geographic clustering** → **DECISION: kept folded inside T5-9, not
  a standalone ticket.** T5-9's "Geographic demand scoring" section has been
  reframed (this PR) as the moat primitive behind the *"N of your customers live
  in X"* recommendation, with its Strong / Building / New-territory confidence
  tiers explicitly called out as the §11 Phase 5 graceful-degradation requirement
  (a fabricated signal is a brand violation). No standalone T-MOAT-1 ticket or
  pointer exists — build it as part of T5-9.

---

### Service Board (T-sb) — ✓ COMPLETE

Service Board hardening workstream, all four tickets shipped and merged
2026-05-26 (PRs #275–#278).

- **T-sb-1: Rename 'baking' → 'preparing' status — ✓ COMPLETE 2026-05-26 (PR #275).**
  Renamed the `baking` order status to `preparing` across the Service Board
  UI and the Edge Function source (schema migration shipped with the PR).
  The status pipeline is now `placed → confirmed → preparing → ready →
  delivered`.
- **T-sb-2: Respect capacity_driver in Service Board item display — ✓ COMPLETE 2026-05-26 (PR #276).**
  Service Board item display now honours the drop's `capacity_driver`
  (`by_order` vs `by_category`) when rendering item/capacity counts, rather
  than assuming a single capacity model.
- **T-sb-3: All items prep sheet with branded PDF export — ✓ COMPLETE 2026-05-26 (PR #277).**
  Added an all-items prep sheet with a branded PDF export (html2canvas →
  off-screen `#prepSheetPrint` container, vendor logo/colour, A4 portrait).
- **T-sb-4: Delivery manifest and ready-for-delivery overlay — ✓ COMPLETE 2026-05-26 (PR #278).**
  Added the branded delivery manifest PDF export and the phone-first
  ready-for-delivery overlay (sticky "View delivery run →" action, ready
  manifest download). Column-height parity fixed via `align-items: stretch`
  on `.boardGrid` and an absolutely-positioned delivery bar that adds no
  height to the Ready column. See CLAUDE.md operational learnings for the
  CSS gotchas surfaced during this build.

---

### Product options (menu modifiers) — ✓ COMPLETE

Per-product option groups (modifiers) — a named, required, pick-exactly-one
choice attached to a single product, each option carrying a price delta in pence
(e.g. Protein: Salmon +£2, Steak +£3, Tofu +£0). Distinct from bundles (which
group several products). Shipped across PRs #429–#434 (2026-07) and live in
production. Full reference: `docs/features/product-options.md`. Pricing-authority
invariant: CLAUDE.md operational learning #93.

- **Stage 1 (#429)** — schema only, inert: `product_option_groups`,
  `product_options`, `order_option_selections` (snapshot columns
  `option_name_snapshot` / `price_delta_pence_snapshot`). Service-role only (RLS
  on, no policies, `REVOKE`d from anon/authenticated); vendor-scoped via parent
  chain (no `vendor_id` column).
- **Stage 2 (#430)** — vendor "Choices" editor in `drop-menu.html`, via
  `save-product-options` / `get-product-options` EFs.
- **Stage 3 (#431)** — customer chooser in `order.html`, via the anon-safe
  `get-drop-product-options` EF; chosen `group_id` + `option_id` added to the
  checkout payload.
- **Stage 4 (#432)** — `create-order` re-derives the option delta server-side from
  `product_options.price_delta_pence`, tenancy-checks it, folds it into the
  charged total, and writes the snapshots. Client price never trusted (verified
  end-to-end 2026-07-04).
- **Stage 5 (#433)** — chosen option shown on the confirmation page
  (`fetch-order`), confirmation email (`send-order-confirmation`), and the
  Service Board kanban card (`get-drop` now returns `order_item_lines` with
  `options[]`).
- **Stage 6 (#434)** — chosen option shown on the two remaining Service Board
  views: the "All orders" compact table (inline suffix) and the "All items" prep
  sheet (product total + indented option-count sub-lines, on screen and in the
  branded PNG export).

**Future scope (deferred from v1 — schema supports, UI does not yet write):**

- **T-opt-per-option-stock** — per-option stock limits (v1 has none; only
  product/drop-level stock applies). — open
- **T-opt-per-drop-override** — per-drop override of an option's
  `price_delta_pence` (v1 has a single catalogue delta; only the product *base*
  price is drop-overridable). — open
- **T-opt-on-bundles** — options on bundle lines (v1 attaches options to
  standalone products only; `create-order` rejects options on non-product lines).
  — open
- **T-opt-multiselect-groups** — multi-select and min/max option groups (schema
  carries `min_select` / `max_select` / `is_required`; the v1 editor writes a
  fixed `1 / 1 / required`). — open

**Related Service Board follow-up (not a product-options ticket, recorded here for
proximity):**

- **T-sb-bundle-selection-aggregates** — bundle *choice selections* now render on
  the Service Board **kanban card** (Stage 5, via `get-drop`'s
  `order_item_lines[].selections[]`), but the aggregate/scan views still render
  bundles **parent-only**: the "All items" prep sheet and the "All orders" compact
  table show the bundle name and quantity without a per-selection breakdown (the
  Stage 6 sub-line work added *option* counts to the prep sheet, not bundle
  selection counts). The render hooks are already marked in `service-board.html`
  (`renderAllItems` / `buildPrepSheetMarkup` bundle-sub-row comments). Note: this
  is **not** T-sb-3 (which is the prep-sheet build itself, ✓ COMPLETE PR #277) —
  it is a distinct, previously-untracked gap surfaced while documenting Stage 6.
  Low priority, display-only. — open

---

### Tier 1 — Must work before first real drop

T1-1: Double-submit protection on order.html ✓ COMPLETE
Confirmed complete. isSubmitting flag at order.html:1340, button
disabled at :2880, resets only on failure path.
Disable Pay button permanently after successful order insert. Prevent
duplicate orders from impatient taps.

T1-2: Service Board — verify new order structure ✓ COMPLETE
Confirmed complete. service-board.html reads item_name_snapshot and
capacity_units_snapshot from v_order_item_detail_expanded.
Confirm Service Board reads correctly from new order_items structure
including item_name_snapshot. Ensure capacity display is accurate.

T1-3: Home page — fix vendor resolution error
maybeSingle().catch is not a function — Supabase JS v2 chaining issue.
Replace .catch() with proper async try/catch. Page flashes then fails.
✓ COMPLETE 2026-05-26. Resolved as a side-effect of T5-A5
(session-aware resolveVendor() rewrite, 2026-04-27). home.html loads
cleanly for Healthy Habits Cafe on production — no flash, no error.
Verified 2026-05-26.

T1-4: Order page — hero image white strip ✓ COMPLETE
Confirmed complete. Visual verification by Edward — hero image fills
correctly with no white strip. CSS min-height and background-size:cover
working as intended.
Hero image not filling top section, leaving white strip at bottom of
image area. CSS background-size or min-height fix required.

### Tier 2 — Must work before showing anyone

T2-1: Global navigation — add all pages to every header ✓ COMPLETE
Subsumed by T4-22 (nav consistency sweep, complete) — verified 2026-06-27,
all operator pages build nav via HearthNav.renderNav.
Every operator page needs consistent nav: Home, Service Board, Drop Studio,
Menu Library, Brand Hearth, Insights. Currently inconsistent.

T2-2: Service Board — remove need to scroll to reach Kanban
Operator needs Kanban visible on load during live service. Hero KPI section
should be collapsible or layout restructured.

T2-3: Service Board — Realtime auto-refresh ✓ COMPLETE
Confirmed complete. subscribeToDropOrders() with Supabase Realtime
postgres_changes subscription at service-board.html:1972.
Add Supabase Realtime subscription to orders table for selected drop.
Board updates live as orders come in. No manual refresh needed.

T2-4: Drop Studio — fix inconsistent horizontal tile spacing ✓ COMPLETE
Confirmed complete. Visual verification by Edward — Drop Studio
horizontal tile spacing consistent across breakpoints.
Drop card band spacing inconsistent. Audit and fix across all breakpoints.

T2-5: Menu Library — fix inconsistent horizontal tile spacing ✓ COMPLETE
Confirmed complete. Visual verification by Edward — Menu Library
horizontal tile spacing consistent across breakpoints.
Same issue as Drop Studio.

T2-6: Brand Hearth — fix text and button edge positioning ✓ COMPLETE
Confirmed complete. Visual verification by Edward — Brand Hearth text
and button edge positioning correct.
Text in first major horizontal section too close to edge. Buttons on right
need proper padding/margin.

T2-7: Brand Hearth — file upload for logo and hero image ✓ COMPLETE
Confirmed complete. File inputs for logo and hero in brand-hearth.html,
wired to Supabase Storage upload.
Replace URL inputs with file upload. Save to Supabase Storage under
assets/vendors/{vendor-slug}/. Blocking proper brand setup and testing.

T2-8 ✓ COMPLETE 2026-05-15 — remediated by T5-A5 (session-aware vendor resolution migration).

**Closure note:** Original concern was hardcoded "southbury-farm-pizza" fallback in operator pages exposing other vendors' data if vendor resolution failed. T5-A5's rewrite of `assets/hearth-vendor.js` `resolveVendor()` eliminated all such fallbacks — module now resolves via session → URL-param-on-localhost → null, with explicit "No `.limit(1)` fallback" comment at line 19. All operator pages treat null as a hard error. Verified by audit 2026-05-15: literal slug appears in zero code files (only in BACKLOG.md, historical audit docs, and the GitHub repo name).

### Tier 3 — Should be done before regular use

T3-1: Mobile responsiveness — operator pages ✓ COMPLETE
All six operator pages have max-width: 768px treatment:
Service Board, Brand Hearth, Drop Studio, Menu Library, Home, Insights.

T3-1b: Mobile optimisation pass — all operator pages ✓ COMPLETE
Full mobile pass at 768px breakpoint across all platform pages.
Established mobile principles: 44px touch targets, no horizontal scroll
(except intentional carousels), single-column forms with full-width inputs,
nav scrolls horizontally with no visible scrollbar, radio/checkbox inputs
excluded from width:100% rule, date/time inputs use -webkit-appearance:none
for iOS Safari, overflow:hidden on parents checked before applying to
children. Root cause fix: hearth.css .container overridden to width:100%
at 768px to fix iOS Safari 100vw feedback loop. Grid display grids use
minmax(0,1fr) to prevent max-content overflow. Pages completed: order.html,
home.html, brand-hearth.html, drop-menu.html, drop-manager.html, hosts.html,
host-profile.html, service-board.html (Service Board), onboarding.html (Setup),
insights.html. Remaining pages (scorecard.html, customer-import.html,
privacy.html, vendor-terms.html, host-terms.html) are lower priority —
legal pages are rarely accessed on mobile and scorecard/import are
occasional-use flows.

T3-2: Drop Studio — saveAssignments defensive pattern ✓ COMPLETE
Replace destructive delete-then-insert with safer upsert pattern.
Upsert split into two calls — products use onConflict:'drop_id,product_id',
bundles use onConflict:'drop_id,bundle_id' — matching the two separate
unique constraints on drop_menu_items.

T3-3: Menu Library — saveSortOrderBatch performance ✓ COMPLETE
Replace sequential per-row updates with single upsert array call.

T3-4: Insights — fix Supabase chaining pattern ✓ COMPLETE
Audit and fix all Supabase query chains to use proper async/await try/catch.

T3-5: Drop Studio — unsaved changes warning ✓ COMPLETE
isDirty flag added with markDirty() function. Four surgical additions:
markDirty() now sets isDirty = true, createNewDrop() resets it to false,
duplicateDrop() resets it to false, and drop card selection resets it to
false. Native beforeunload dialog covers all exit routes.

T3-6: Service Board — confirmation on status changes ✓ COMPLETE
Undo toast system: pendingChange object, showUndoToast() with 5-second
countdown and progress bar, undoPending() for reversal, commitPending()
for DB write. Applies to all forward and backward status transitions.
Notify modal (collection orders marking Ready) routes through the same
updateOrderStatus path.

T3-7: Order page — real-time capacity update ✓ COMPLETE
Supabase Realtime subscription implemented via
subscribeToCapacityUpdates() watching INSERT events on orders filtered
by drop_id. refreshCapacity() re-fetches v_drop_summary and re-renders
on each event. Channel cleaned up on beforeunload.

T3-8: Stripe integration ✓ COMPLETE 2026-05-03
Intentionally parked until the production domain migration is complete.
Stripe Connect Express requires a stable production domain for return URLs
and webhook endpoints. Setting up Stripe against spiffy-tulumba-848684.netlify.app
would require reconfiguration once the platform moves to lovehearth.co.uk.
Order ID is generated and payload is structured with a TODO marker in
handoffToPayment(). Build after T6-1 (domain migration) is complete.

Status: PARTIAL. Connect Express scaffold complete (Edge Functions,
schema, publish gate in drop-manager.html). Customer checkout not
wired — order.html:2894 still has TODO comment; no create-order Edge
Function exists yet.

Closure note (2026-05-03): Customer checkout wired end-to-end via
four Edge Functions:

- create-order — atomic write of orders, order_items,
  order_item_selections, customers, customer_relationships under a
  service-role client; creates a Stripe Connect destination charge
  with the vendor's stripe_account_id as destination; returns a
  Checkout Session URL with 1800s expiry. Order starts at
  status='pending_payment' and reserves capacity during the pending
  window.
- stripe-webhook — handles checkout.session.completed (→ placed/
  paid), checkout.session.expired (→ cancelled/expired),
  checkout.session.async_payment_failed (→ cancelled/failed). Stripe
  Dashboard endpoint name: "brilliant-rhythm".
- fetch-order — anonymous matched-pair authorization (order_id +
  session_id) powering order-confirmation.html. Returns
  customer-visible fields only.
- cancel-order — idempotent flip of pending_payment → cancelled on
  customer return from Stripe cancel. Frees capacity immediately
  rather than waiting for session expiry. Does not call Stripe.

Verified end-to-end 2026-05-03 against Test 11 in production. Order
placed via order.html, status='placed' and stripe_payment_status=
'paid' confirmed in DB, order-confirmation.html rendered correctly
via fetch-order. No orphan rows, no RLS errors, no client-side
PostgREST writes against the order tables.

Connect Express scaffold (schema, Edge Functions for
create-stripe-connect-link / check-stripe-connect-status /
create-stripe-login-link, drop publish gate in drop-manager.html)
remains intact and described in the "Stripe Connect Express (T3-8)"
section of CLAUDE.md.

Cross-reference: T5-B22 (closed 2026-05-03 — captured this same
resolution but did not update T3-8), T6-1 (production domain
migration completed 2026-04-22, unblocked Stripe integration),
T5-B18 (Stripe status visibility surface, closed via PR #221).

T3-9: Order page — customer data capture and consent ✓ COMPLETE
At checkout capture customer name, email, and postcode. Write to a new
customers table and link to the order via customer_id. Consent language:
"We'll use your details to notify you about this and similar local food
moments. You can opt out any time." Foundation of the demand intelligence
model — T4-12, T4-13, T5-8, T5-9, T5-11 all depend on this. Schema to
be created by Edward before implementation: customers (id, name, email,
postcode, created_at) and customer_relationships (id, customer_id,
owner_type, owner_id, consent_status, source, created_at). Anon INSERT
RLS policies required on both tables.

T3-10: Order ready notification ✓ COMPLETE
When operator marks a collection order as Ready on the Service Board, a
modal appears pre-populated with the customer's name and phone number.
Offers Call, SMS (pre-filled with "your order is ready" message), and
Skip options. Delivery orders skip the modal and go straight to status
update. Modal HTML is in the DOM before attachEvents() runs.

**Update note (May 2026 — from T5-C1 design session):**

The manual modal (call/SMS/skip) is the correct fallback path and should
remain. However, the automated SMS path — firing automatically when the
vendor marks an order Ready, without requiring the modal — is the
preferred default. T5-11 (comms engine) is the correct home for the
automated path. When T5-11 ships, the order_ready trigger should fire an
automated SMS to the customer's mobile number if present, and the manual
modal should appear as a secondary option for vendors who want to
personalise the notification or call the customer. Both paths coexist.

SMS is confirmed as the correct channel for order-ready notifications
(not WhatsApp) because it reaches every mobile regardless of app
availability or data connectivity — important in a busy collection
environment.

T3-11: Menu Library — delivery and collection suitability flags ✓ COMPLETE
Fulfilment suitability section added to the product editor in
drop-menu.html. Three fields: travels_well checkbox,
suitable_for_collection checkbox, and prep_complexity select
(simple/standard/complex). Pre-populated on load, saved to products
table on Save Product.

T3-12: Order page — neighbourhood radius enforcement
Validate that a customer's delivery postcode falls within the declared
drop radius before allowing order submission. This is a hard block, not
a soft warning — if the postcode is outside the radius, the order cannot
proceed and a clear message is shown. Applies to neighbourhood delivery
drops only. Collection drops are unaffected.
Audit first: check whether any radius validation currently exists in
order.html before writing a prompt. If none exists, the build requires:
(1) drop_id to carry a centre postcode and radius value, (2) a postcode
distance calculation at order submission time, (3) a clear error state
on the order form.
This is potentially urgent — if neighbourhood drops go live without
enforcement, vendors could receive orders from outside their intended
area and feel obligated to fulfil them. Treat as Tier 3 priority once
neighbourhood drops are in active use.

### T3-12b — neighbourhood delivery area enforcement (radius mode)

**Status:** Backlog. Pre-launch if a radius-thinking vendor is onboarded;
otherwise post-launch.

**Depends on:** T3-12a complete. The `delivery_area_type = 'radius'` branch
in create-order currently returns 501 — this ticket replaces that with real
validation. update-drop currently rejects writes with `delivery_area_type =
'radius'` — this ticket relaxes that gate.

**Scope:**
Add radius-based delivery area enforcement as a second mode alongside postcode
prefixes.

- **Drop Studio:** add "Radius from a centre point" as a third radio option
  in the existing "Delivery area restriction" section. Reveal `centrePostcode`
  and `radiusKm` inputs (already exist, currently dormant — see T3-12a-fu2).
  Save logic sets `delivery_area_type = 'radius'`, populates `centre_postcode`
  and `radius_km`, and nulls `allowed_postcode_prefixes`.
- **update-drop:** widen the `delivery_area_type` validation to accept
  `'radius'`. Add a new pair invariant: when type is `'radius'`, both
  `centre_postcode` and `radius_km` must be present.
- **order.html:** add a radius branch in `checkDeliveryArea()`. On blur of
  postcode, call postcodes.io to look up customer coordinates, compute
  Haversine distance from `drop.centre_postcode` (looked up the same way),
  compare against `drop.radius_km`. Show inline error if outside.
- **create-order:** replace the current 501 stub with real validation. Same
  lookup + distance pattern. Cache postcode lookups within a single request
  to avoid duplicate API calls. Handle postcodes.io failures gracefully —
  fail closed (reject with "couldn't verify delivery area, please try again")
  rather than fail open.

**Open questions for spec finalisation:**
- Cache postcode → coordinates lookups in a Supabase table? Postcodes don't
  move; one cache hit per UK postcode forever is cheap and removes most of
  the postcodes.io load.
- Should `centre_postcode` default to vendor address with per-drop override?
  Current schema has it on `drops` only — vendor-level default would need a
  `default_centre_postcode` on `vendors`. Decide before building.
- postcodes.io rate limits: free tier is generous (no documented hard limit)
  but worth verifying before launch.

### T3-12a-fu1 — ✓ COMPLETE 2026-05-04 — Drop Studio: clear postcode-prefix error on successful save

**Status:** ✓ COMPLETE 2026-05-04. Pre-launch polish.

**Issue:** When a vendor saves a drop and the empty-prefix guard fires, the
inline error banner persists at the top of the Basics pane even after a
subsequent successful save. Confirmed cosmetic — saved data is correct.

**Fix:** In drop-manager.html `saveDrop()`, clear the postcode prefix error
after successful save (call `clearPostcodePrefixError()` in the success branch).

**Closure note (4 May 2026):** Fixed in PR #223 across two commits.
The original spec correctly identified the symptom — error banner
persisting after successful save — but prescribed
clearPostcodePrefixError() which targets #postcodePrefixError (the
inline error under the prefix chip input). Deploy-preview verification
surfaced that the user-visible persistent banner is actually
#errorBox at the top of the Basics pane, set by saveDraftBtn's catch
handler via showError() when saveDrop throws and never cleared on a
subsequent success — only refreshAll() clears it, and the
saveDraftBtn flow never calls refreshAll. Both errors now clear on
successful save: clearPostcodePrefixError() and showError("") run
after saveDrop's try/catch (catch re-throws, so success-only
execution). Side benefit: errorBox now also clears on success after
any prior failed-save error (slug validation, network errors, etc.).

### T3-12a-fu2 — ✓ COMPLETE 2026-05-04 — Drop Studio: hide legacy centre postcode and radius inputs

**Status:** ✓ COMPLETE 2026-05-04. Pre-launch polish, before T3-12b.

**Issue:** The legacy `CENTRE POSTCODE` and `RADIUS (KM)` inputs remain
visible in Drop Studio's Basics pane even though they are not exposed by
the new "Delivery area restriction" UI (T3-12a). Stale values can persist
visually (e.g. RG10 0JP from a previous default) creating user confusion.
Confirmed inert — mode hygiene correctly nulls these columns on save
when `delivery_area_type` is set.

**Fix:** In drop-manager.html, hide `#centrePostcodeField` and
`#radiusKmField` (or wrap in a conditional render) so they are not displayed
in the current build. T3-12b will reintroduce them as the reveal block of
the "Radius" radio option in the "Delivery area restriction" section.

**Closure note (4 May 2026):** Fixed in PR #223. The spec referenced
#centrePostcodeField and #radiusKmField IDs that did not exist on
disk — wrappers were bare .field divs. Added the IDs and inline
style="display:none;" to both wrapper divs in drop-manager.html.
Input IDs (centrePostcode, radiusKm) untouched, so JS references in
populateForm and resolveDemandPreviewOutwardCode continue to resolve.
T3-12b will reintroduce these as the radius reveal block of the
Delivery area restriction radio group, with the IDs now in place
for it to reference.

### T3-12a-fu3 — Drop the dead `is_radius_restricted` column on `drops`

**Status:** Backlog. Schema cleanup. Ship after T3-12b confirms it's not
needed for radius mode (it isn't — `delivery_area_type` is the discriminator).

**Issue:** `drops.is_radius_restricted` (boolean NOT NULL) was added
pre-T3-12a but was never read or written by any UI or Edge Function.
Confirmed dead by grep across the codebase during T3-12a investigation.

**Fix:** SQL editor —
```sql
ALTER TABLE drops DROP COLUMN is_radius_restricted;
```
Verify no Edge Function or UI references it before running.

---

T3-13: Capacity driver — multi-mode support ✓ COMPLETE 2026-05-13

**Fix:** Shipped end-to-end on 2026-05-13. Schema migration retired the per-item decimal `capacity_units` field in favour of `drops.capacity_driver` (`'by_order'` | `'by_category'`) and `drops.capacity_categories` (jsonb), plus `counts_toward_capacity` (boolean) and `capacity_weight` (integer 1–3) on `products` and `bundles`. Drop Studio capacity mode UI (PR #251) replaced the single-category dropdown with a two-mode selector and a dedicated Capacity stage. Menu Library capacity UI (PR #252) replaced the decimal "Capacity Impact" field with a binary toggle + collapsible slots-per-item input. `create-order` rewritten as server-authoritative (PR #249) — per-item contribution computed server-side and snapshotted into `order_items.capacity_units_snapshot`, with client-supplied totals ignored; follow-up `pending_payment` fix shipped via PR #250. Eight Edge Functions redeployed in lockstep with the schema migration: `create-order`, `create-drop`, `update-drop`, `create-product`, `update-product`, `create-bundle`, `update-bundle`, `duplicate-bundle`. Legacy `capacity_units` / `capacity_category` / `capacity_category_id` fields retained for `v_drop_summary` compatibility. Polish PR #253 added a chevron CSS rule and an `applySavedRowToState` helper; T3-13-polish-2 (chip refresh) remains open as a follow-up.

**Verification:** End-to-end verification on Test 11 in production for both `by_order` and `by_category` modes — capacity math correct in both.

**Cross-reference:** T7-13 superseded by this ticket. T3-13b (paired event / catering workflow, see entry below) closed 2026-05-14. T3-13-polish-2 (open) and T3-13-polish-3 (open) — remaining polish items in the CLAUDE.md index.

---

**Original spec preserved below for historical reference.**

**The problem with the current model**

The platform currently models capacity via a single `capacity_category` (text slug, nullable) and `capacity_units_total` (integer), with individual items carrying a `capacity_units` decimal field. Two problems: (1) decimal capacity units are confusing in practice — no vendor thinks in fractions of a slot; (2) asking "how many units does this item consume?" at the item level is really a drop-level configuration question dressed as a product attribute. The decimal field is retired as part of this ticket.

**Three modes to support**

**(1) By item type — replaces current behaviour**
One category drives capacity. Every item from that category ordered draws one slot from the pool. Items in other categories are unrestricted. Example: 40 pizzas; drinks and sides don't count.

**(2) By order — new**
Capacity is a ceiling on total orders, not tied to any category. Every order placed draws one slot regardless of contents. Example: a café that can handle 30 orders per service regardless of what's in them. Simplest mode — no category association needed.

**(3) By shared pool — new**
Multiple categories all draw from a single shared total. Any item from any of the designated categories consumes one slot from the shared pool. Example: vendor sets 40 capacity; burgers, wraps, and sandwiches all contribute — the drop closes when the pool is exhausted regardless of which category filled it. One pool, multiple contributing categories — not independent caps per category.

**Item-level model**

The `capacity_units` decimal field is retired. Replaced with a binary: does this item count toward capacity — yes or no? If yes, it always counts as 1 slot.

One exception: an optional integer field (whole numbers 1, 2, or 3 only — no decimals) for items that genuinely consume multiple slots (e.g. a sharing platter that takes as long as two mains). This field defaults to 1 and is hidden unless the vendor explicitly needs it. Most vendors will never touch it. This field only applies when the item's category is a capacity driver — it has no effect otherwise.

**Drop Studio UX**

Capacity setup becomes a short mode selector in Drop Studio Basics pane:

- Pick mode: By item type / By order / By shared pool
- Set capacity total (integer)
- For "By item type": confirm which single category is the driver
- For "By shared pool": confirm which categories share the pool (multi-select)
- "By order" requires no category selection

**Menu Library UX**

Item-level capacity field becomes a simple toggle: "Counts toward drop capacity." Replaces the current decimal input. The optional integer weight field (1–3) appears beneath the toggle only when it is switched on. Label: "Slots used per item" — defaults to 1.

**Downstream surfaces affected**

- `drops` schema — `capacity_driver` type field required; multi-category mode needs a `capacity_categories` join or array column. Schema changes are Ed's responsibility via the SQL editor before any build begins.
- `products` schema — `capacity_units` decimal column retired; replaced with `counts_toward_capacity` boolean and `capacity_weight` integer (default 1, range 1–3).
- `create-order` / capacity check logic — currently counts units from one category; must branch by driver type. Payment-critical — must be verified end-to-end against a real Stripe test order before shipping.
- `order.html` — capacity display and real-time reservation must reflect the correct pool and mode.
- `v_drop_summary` / `v_drop_menu_item_stock` — capacity consumed calculation changes by driver type; views must be updated to match.
- Service Board — capacity bar reads from these views; unaffected once views are correct.
- Drop Studio — capacity setup UI replaced with mode selector as described above.

**Sequencing**

Schema design to be agreed in Claude Chat before any build begins. Ed runs schema changes via SQL editor. Recommended build order: mode selector UI in Drop Studio → item-level toggle in Menu Library → capacity check logic in `create-order` → view updates → end-to-end Stripe test verification.

Do not ship until verified end-to-end against a real Stripe test order. The capacity check inside `create-order` is payment-critical.

Supersedes T7-13.

T3-13b: Event / catering workflow ✓ COMPLETE 2026-05-14 — paired follow-up to T3-13.

**Fix:** Shipped via PR #254 (three-prompt split to keep each step inside the stream-idle window per operational learning #27). Schema additions applied earlier: `drops.expected_guests`, `drops.discount_tiers` (jsonb), `orders.discount_pence`, `orders.discount_breakdown` (jsonb). Drop Studio event-type behaviour merged across the T3-13b series — event-mode toggle, expected guests field, bulk discount tier editor, slug random suffix (`-e-<token>`) with server-side application after the uniqueness check, draft-rename / publish-immutable slug rules. Order page event UX — capacity chip hidden on event drops, volume discount preview at checkout. `create-order` updated to skip capacity enforcement on event drops, apply the matched discount inside the Step 7 total guard, persist `discount_pence` and `discount_breakdown` on the orders row, and apply a one-off Stripe coupon (`amount_off` + `currency: 'gbp'` + `duration: 'once'` + `max_redemptions: 1`) to the Checkout Session so the itemised breakdown remains intact on Stripe's side. `transition-drop-status` readiness gate ported the T3-13 capacity model from the frontend and skips capacity for events.

**Verification:** PR #254 deploy-before-merge per Critical Rule #15. Operational learnings #43 (atomic schema-migration + Edge-Function-deploy pairing) and #44 (Stripe Connect discounts via one-off coupon, not collapsed line items) captured from this build.

**Cross-reference:** T3-13 (parent ticket, closed 2026-05-13).

T-ops-rls-fix ✓ COMPLETE 2026-05-15 — Healthy Habits launch gate, ran in parallel with T3-8 as equal priority.

**Problem:** Service Board order status transitions (Confirm, Bake, Ready, Delivered) silently failed in production. The Kanban card moved forward optimistically on click, but the underlying `orders.status` update returned HTTP 204 with zero rows affected. The `orders` RLS policies "Orders: authenticated owner select" and "Orders: authenticated owner update" require `auth.uid()` to match `vendors.auth_user_id`. Service Board runs anonymously — there is no logged-in vendor session — so every UPDATE was rejected at the RLS layer. The optimistic UI masked the failure entirely; the bug only surfaced when refreshing the page revealed the card had snapped back. Diagnosed against order `8f56908e-3c3c-4407-b306-2a235c63d4db`, which had accumulated five silent-failure attempts in `order_status_events` before the fix.

**Fix:** New `transition-order-status` Edge Function mirroring the anonymous pattern of `create-order` (not the JWT-authenticated pattern of `transition-drop-status`, which would have required wiring vendor auth into the Service Board first). The function uses `verify_jwt = false` in `supabase/config.toml` and a service-role client to bypass RLS. State machine on the server enforces adjacent-only transitions in `placed → confirmed → baking → ready → delivered` (forward and backward by one step only; rejects `pending_payment` and `cancelled` as source states; rejects no-ops). Optimistic-concurrency guard via `.eq("status", currentStatus)` returns 409 if a concurrent caller has already moved the order. Audit event written server-side to `order_status_events` with `actor: 'service_board'` and `actor_type: 'operator'`.

**Migration:** `commitPending` in service-board.html replaced its direct PostgREST PATCH with `supabase.functions.invoke('transition-order-status', { body: { order_id, to_status } })` using the standard transport-vs-function-error two-check pattern. The `writeStatusEvent` helper was deleted — the Edge Function writes the event server-side. Shipped via PR #256.

**Polish fix (PR #257):** The fix exposed a pre-existing race condition. Two refresh paths fire on every successful transition: the Supabase realtime subscription on `orders` filtered by `drop_id`, and `commitPending`'s explicit `refreshData()` call after function success. Before this fix the orders row never actually changed, so both paths refreshed identical stale data. With the fix working, both paths now refreshed real new data — and they raced, producing a visible flick-back on forward transitions. Solution: delete the explicit `refreshData()` call from `commitPending`, leaving the realtime subscription as the single source of truth for post-transition refresh. Closes T-ops-rls-fix-polish in the same workstream.

**Verification:** OPTIONS smoke test against `transition-order-status` returned 204 with `access-control-allow-origin: https://lovehearth.co.uk`. DevTools function test returned `{ ok: true, order_id: '8f56908e...', from_status: 'placed', to_status: 'confirmed' }`. SQL confirmed `orders.status = 'confirmed'` (the row had been stuck on `placed` for months despite multiple operator clicks). Full UI clicking test on production passed all four transitions and one backward step.

**Audit linkage:** The parallel T-ops-rls-audit (same day, audit report at `audit/T-ops-rls-audit-2026-05-14.md`) inventoried silent-failure RLS surfaces across the platform — bounded this fix to `service-board.html` mutations on `orders` and `order_status_events`, and surfaced three further tickets (see below).

T-ops-rls-customer-import ✓ COMPLETE 2026-05-15 — Healthy Habits launch gate, shipped same day as T-ops-rls-fix as part of the parallel RLS-audit workstream.

**Problem:** Four direct PostgREST mutations in customer-import.html (two on `customers`, two on `customer_relationships`) silently failed in production under RLS. Same root cause as T-ops-rls-fix (`orders` status transitions): anon caller against authenticated-only RLS policies, JWT not attached, writes returned 204 with zero rows affected. Compounded for customer-import by the fact that the two pre-write reads (the dedup classification queries) also returned empty arrays under the same RLS pattern, meaning every CSV row was classified as `createNewRows` regardless of platform state, and then every INSERT silently failed. Net result: customer-import was end-to-end non-functional — the operator saw a "success" toast but absolutely nothing landed in the database. No real vendor had ever successfully imported a customer list before this fix.

**Investigation:** Pre-build investigation produced as `audit/customer-import-investigation-2026-05-15.md` (~900 lines, read-only). Mapped the five-stage flow (Upload → Preview → GDPR confirm → Import → Done), quoted the four write call sites with surrounding context, documented the dedup logic (in-memory classification on email-then-phone with four-way conflict resolution), confirmed the GDPR lawful basis is persisted per-batch on every relationship's `lawful_basis` column (the confirm checkbox is a gate but not persisted), and surfaced 13 open questions for the design conversation. RLS dump confirmed only one policy on `customers` (`customers_vendor_access`, SELECT-only, authenticated role) and one on `customer_relationships` (`customer_relationships_vendor_access`, ALL operations, authenticated role) — no anon policies exist on either table, confirming the writes-and-reads-broken end-to-end state.

**Fix — function (PR #260):** New `bulk-create-customers` Edge Function. Anonymous gateway with `verify_jwt = false`, manual JWT verification via `anonClient.auth.getUser()`, vendor resolution from `vendors.auth_user_id`, body validation (1000-row cap, lawful_basis enum check, per-row name/email validation with per-row outcome bucketing rather than aborting). Batched lookups via `.or()` + `.in()` (one round-trip for customers, one for vendor relationships, regardless of platform size) replacing the page's full-table customer SELECT. In-memory classification preserves today's four-way conflict logic (added / linked / skipped / conflict). Sequential write phases for createNew (customers INSERT + customer_relationships INSERT) and linkExisting (customer_relationships INSERT + optional customers UPDATE for address backfill). Service-role client throughout (bypasses RLS, matches `create-order` pattern). Demand breakdown query folded into the function response — aggregates this vendor's all-time imported customers by outward postcode, returns top areas plus the customers-with-postcode count. 534 lines.

**Fix — page (PR #261):** customer-import.html rewired to invoke `bulk-create-customers` in a single call. 286 lines deleted, 39 lines added. Removed: inline `window.supabase.createClient()` (replaced by `_getHearthClient()` singleton), two pre-write reads, in-memory classification logic, two per-row write loops, address backfill UPDATE, helper functions `normalisePhone` and `fetchDemandBreakdown`, classification state arrays (`createNewRows`, `addRelationshipOnly`, `skippedRows`, `conflictRows`, `counts`). Added: single `supabase.functions.invoke('bulk-create-customers', { body: { rows, lawful_basis } })` call, conflict row derivation from `data.results.filter(r => r.outcome === 'conflict')`, `renderResults()` reading from `importResults.summary` and `importResults.demand_breakdown` instead of locally-computed state.

**Verification:** End-to-end test against Test 12 fixture on 2026-05-15. 5-row test CSV (`test-import.csv`, mixed completeness — some rows with all fields, some with missing phone or address) uploaded via the live UI. Stage 5 reported 5 added, 0 skipped, 0 conflicts, 0 failed. SQL check: `SELECT COUNT(*) FROM customer_relationships WHERE owner_id = (vendor_id for test-12) AND source = 'import'` returned 5. Demand breakdown rendered the thin-data placeholder (4 customers with postcodes, under the 10-threshold). First successful end-to-end customer import in the platform's history.

**Design decisions locked during the design conversation** (full rationale in the investigation report and chat transcript):
- Batched function call (not per-row invocations) with 1000-row request cap
- In-function batched lookup via `.or()` + `.in()` rather than full-table scan
- Phone-match dedup preserved (not dropped to email-only)
- Continue-on-failure with per-row report, not abort-on-first
- Address backfill kept as today's behaviour (best-effort fill of empty addresses on existing customer rows); cross-vendor concern noted but deferred to a future schema rationalisation
- Lawful basis stays per-batch (mixed-source lists require split CSVs)
- GDPR confirm checkbox remains a gate; not persisted (implicit audit via the relationship row + lawful_basis column)
- Email lowercased on write to align dedup with storage
- Orphan customer rows accepted on partial failure (matches `create-order`); recoverable on next import via the addRelationshipOnly path

**Audit linkage:** Closes the second of three RLS surfaces flagged by T-ops-rls-audit (2026-05-15). T-ops-rls-cleanup-auth-callback and T-ops-rls-reads-audit remain open per their original framing — both are low priority or properly deferred to T5-A3.

**Follow-up surfaced:** T-customers-page-import-entry (Tier 4, see below) — Customers page has no entry point to import despite being framed as "Your owned customer asset." Pre-launch gap didn't matter because import was broken; now that it works, the navigation gap is real.

T-ops-rls-cleanup-auth-callback — delete `auth-callback.html` dead-code backstop

**Status:** Open. Tier 3. Low priority cleanup.

**Problem:** `auth-callback.html` contains a dead-code backstop that writes `vendors.auth_user_id` directly via PostgREST. The write silently fails (same RLS pattern as the rest of this workstream), but more importantly, it's dead code — per operational learning #11, the `invite-vendor` Edge Function now handles `auth_user_id` linking server-side at the moment of vendor provisioning, before the vendor ever reaches auth-callback.html. The client-side write was a backstop for an earlier flow where linking was deferred to the first sign-in.

**Fix path:** delete the client-side update. Do NOT migrate to a `claim-vendor` Edge Function — the backstop is obsolete, not in need of upgrade. The invite-vendor flow is the canonical linking path.

**Why low priority:** the write silently fails today, but it's masked by the invite-vendor server-side link that has already happened. Removing it changes nothing functional — it just deletes confusing dead code that future investigators (or future Claude Code sessions) might mistake for active linking logic.

**Cross-reference:** operational learning #11 (invite-vendor handles auth_user_id linking server-side).

T-ops-rls-reads-audit — silent SELECT filtering audit

**Status:** Open. Tier 3. Deferred — addressable during T5-A auth migration.

**Problem:** T-ops-rls-audit covered direct PostgREST *writes* against RLS-protected tables. It did not cover *reads*. The Variant 3 failure mode in operational learning #14 is RLS silently returning zero rows on reads when the JWT isn't attached. The bug presents as "empty data" rather than "failed write" — pages look like they have nothing to show rather than failing visibly, which makes it harder to detect.

**Scope:** a separate audit of SELECT paths on RLS-protected tables, identifying every read path that depends on the JWT being attached. Each finding triages into: (a) migrate to Edge Function, (b) relax SELECT policy (only where the data is genuinely public, e.g. live drops on host-view), or (c) accept current state because the read happens through an authenticated path that does correctly attach.

**Why deferred:** T5-A1 through T5-A7 are the vendor auth workstream — they replace URL-param vendor resolution with session-based identity and rewrite RLS to use `auth.uid()` properly. Most read-path silent filtering will be resolved as a side-effect of T5-A3 (RLS rewrite). Running this audit before T5-A3 risks producing findings that the auth rewrite then makes obsolete.

**Trigger to revisit:** start of T5-A3 build. The audit becomes a checklist for the rewrite rather than a standalone workstream.

**Cross-reference:** T5-A3 (RLS rewrite, dependency), operational learning #14 (auth-not-attached symptom, Variant 3 silent SELECT filtering).

### Tier 4 — Enhancements that will impress

T4-1: Recurring series — actually create drops ✓ COMPLETE
Drop Studio has full recurring series UI and generation function.
createSeriesDrops() built — vendors can generate drops from series
schedules.

T4-2: Order confirmation page ✓ COMPLETE
Post-order destination showing order details, reference number, and
fulfilment information. order-confirmation.html created; order.html
redirects to it after successful insert.

T4-3: Insights — drop performance, intelligence layer, archetype integration ✓ COMPLETE
Full Insights page built with drop performance analytics, revenue and
capacity tracking, item sales breakdown, host performance, and demand
curve charting. Archetype-aware recommendation engine integrated —
vendor archetype (derived from onboarding answers) drives contextual
recommended actions across all primary_goal values. Layout restructured
with collapsible sections and mobile-responsive design.

T4-4: Home dashboard — intelligence surface and next action centre ✓ COMPLETE
Page existed and was in good shape. Strategic alignment pass completed:
Today strip (live/scheduled/quiet state), Asset snapshot (customer counts,
loyal core, earned vs imported), intelligence-driven next actions from
HearthIntelligence.generateRecommendations(), Business pulse with link to
Insights, Customers workspace card. Hero copy updated to lead with customer
ownership, "Why it feels different" panel updated, flow extended to Step 6
(Compound), "How Hearth works" section updated with compounding paragraph.
Three intelligence surfaces (Insights, Customers, Home) now complete and
strategically aligned.

Dependencies: T4-14 (customer import), T4-16 (hosts as first-class
entities), T4-27 (Customers page), T4-28 (intelligence engine)

T4-5: Drop Studio — duplicate drop improvement ✓ COMPLETE
Timing fields (opens_at, closes_at, delivery_start, delivery_end) set to
null on duplicate. Form opens on timing pane with persistent notice and
highlighted date/time fields.

T4-6: Menu Library — delete products, bundles, categories ✓ COMPLETE
Permanent delete with safety check — warns if item is used in any
drop menu before allowing deletion.

T4-7: Service Board — order notes and fulfilment details ✓ COMPLETE
Surface customer notes, delivery address, and fulfilment mode on order
cards. Essential for delivery drops.

T4-8: Order form enhancements ✓ COMPLETE
Address fields (line 1, line 2, town/city, postcode), phone number validation,
marketing opt-in checkbox. Written to delivery_address and customer_postcode
on orders table.

T4-12: Post-drop scorecard — making the compounding asset visible ✓ COMPLETE
scorecard.html created as a standalone page accepting ?drop= parameter.
Four-tile performance strip (orders/capacity, fill rate with signal,
revenue, new customers), capacity narrative from HearthIntelligence,
top 5 items by quantity, new vs returning customer breakdown with
plain-English framing, two recommendation cards, and action row
(duplicate drop, view insights). Home dashboard shows scorecard prompt
for drops closed within the last 48 hours. Drop Studio shows
"Scorecard →" text link on closed drop cards.

Dependency: T3-9 (customer capture — complete)

T4-13: Minimal host-facing view ✓ COMPLETE
host-view.html created as a read-only, no-login page accepting
?drop=<slug>. Queries v_drop_summary directly (bypassing drops table
RLS). Displays drop name, host context, timing, live order count,
capacity fill bar, and host share (model-aware: fixed vs percentage).
Handles loading / not-found / pre-open / closed states. Realtime
subscription on orders table re-renders live values on each event.
No nav. Copy host link button added to drop cards in drop-manager.html,
shown only when host_name is present.

T4-14: Vendor customer data import ✓ COMPLETE
Five-step import flow with CSV parsing, address support, phone normalisation,
GDPR lawful basis confirmation, and full deduplication on email and normalised
phone. Writes to customers and customer_relationships with source = import.
consent_status = 'imported' (distinct from customer-direct consent).
Cross-vendor customer linking supported — existing platform customers gain
new vendor relationship without duplicating the customer record.
Allow vendors to upload existing customer list via CSV (name, email,
postcode). Must include a non-skippable GDPR lawful basis confirmation
step — vendor must declare the legal basis for processing before any
data is written. Write to customers and customer_relationships with
source = import. Accelerates recommendation engine for data-rich vendors.

Note: the import story is most relevant for vendors with direct booking
history or email lists (e.g. from their own website, a booking platform,
or a mailing list). Aggregator-dependent vendors (Deliveroo, Uber Eats,
Just Eat) likely have no exportable customer data — those vendors build
their customer asset through drops instead.

Primary dependency for T4-27 (Customers page). Dependency: T3-9 schema.

T4-15: Multiple drops within a single event ✓ COMPLETE
Event windows section added to the Timing pane in Drop Studio, shown
when a host is selected. Single/Multiple radio toggles a dynamic
window rows UI. createEventWindow() copies the full drop payload and
menu assignments, linking windows via window_group_id. Existing
windows render read-only with a confirm/cancel remove flow. "— Window
N" suffix applied to names on create and stripped from card display.

T4-16: Host onboarding — host as first-class entity ✓ COMPLETE
hosts.html created as a vendor-facing Host Directory with card grid,
quick-create modal, and per-host drop stats. host-profile.html created
with editable profile form (identity, location, contact, social handles,
audience with tag pills, service windows, comms channels, internal notes)
and read-only History tab querying v_drop_summary by vendor_id and
host_id. drop-manager.html modified: Create Host modal slimmed to
name/type/postcode only; Selected Host panel enriched to fetch and
display audience description, audience size, service windows summary,
and "Complete host profile" link when onboarding_completed is false.
"Hosts" added to platform nav in vendor-nav.js between Drop Studio and
Service Board. hosts.html and host-profile.html added to operator pages
whitelist. hosts table extended with schema columns: contact_name,
contact_email, contact_phone, website_url, social_handles (jsonb),
audience_description, estimated_audience_size, audience_tags (jsonb),
service_windows (jsonb), comms_channels (jsonb), relationship_status,
onboarding_completed.

T4-17: Drop Studio — audience targeting and demand preview ✓ COMPLETE
Audience Preview panel added to Basics stage of Drop Studio. Triggers
on centre postcode blur or host selection change. Shows customer count
in postcode area, area drop history, host-specific drop history (count
and avg orders), and a confidence signal (Strong / Building / New
territory). Panel is context-aware by drop type: hosted/community drops
lead with host history and suppress postcode customer count;
neighbourhood drops lead with area signals.

T4-18: Brand Hearth — add contact phone field ✓ COMPLETE
Phone number input added to Brand Identity section of Brand Hearth.
Saves to `vendors.contact_phone`. Pre-populates from saved value on
load.

T4-19: Onboarding → Brand Hearth continuity ✓ COMPLETE
Quiet confirmation bar in Brand Identity section when
onboarding_completed is true. Adapts message based on whether website
is set. Links back to Setup.

T4-20: Onboarding → first drop pathway ✓ COMPLETE
Completion card leads to Brand Hearth as primary action ("Set up your
brand →") with dashboard as secondary. The first-drop nudge from Brand
Hearth carries the vendor into Drop Studio after brand setup is saved.
This preserves the Brand → Menu → Drop sequence from the brand playbook.

T4-21: Customer import — post-import demand view ✓ COMPLETE
Post-import demand view built in customer-import.html Step 5.
fetchDemandBreakdown() queries customer postcodes grouped by outward
code. Renders rich view (10+ customers) with bar chart of top areas
and plain-English recommendation, or thin data view for smaller
imports.

Dependency: T4-14 (customer import)

T4-22: Navigation consistency sweep ✓ COMPLETE
All operator pages audited — "Setup" appears consistently and links to
`onboarding.html`. Nav order consistent across all pages: Home, Brand
Hearth, Menu Library, Drop Studio, Service Board, Insights, Setup.
Setup excluded from customer-facing `order.html`.

T4-23: Drop Studio — first drop guidance for new vendors ✓ COMPLETE
First-drop guidance card rendered in drop-manager.html only. Appears
when the vendor has zero drops AND `onboarding_completed` is true
(vendors who have not finished setup are routed to onboarding first).
Three personalised states driven entirely off `state.vendor` with no
extra queries:
- **Host-first** — when `existing_host_contexts` is non-empty. Copy
  references the host types the vendor flagged in onboarding and
  nudges them to add a host and create their first drop together.
- **Data-first** — when `customer_data_posture` is `rich` or
  `partial`. Nudges the vendor toward customer import as a demand
  accelerant before building the first drop.
- **Fallback** — generic "start with a host you know" copy for
  vendors with neither host context nor customer data.
Also handles an inbound `?host_context=` URL param from Brand Hearth
nudge links, pre-filling the host context when the vendor lands in
Drop Studio from the brand setup flow. The card disappears completely
once the vendor has any drop (including drafts).

T4-24: Customer privacy policy — order page ✓ COMPLETE

privacy.html created (platform-level page, 8 sections, plain English,
Hearth tone, amber draft banner, version 0.1 note). Links added to
order.html: adjacent to marketing opt-in checkbox and in the "Powered
by Hearth" footer.

Note: Anthropic cannot provide legal advice. The privacy policy content
should be reviewed by a qualified legal professional before Hearth
processes real customer data at scale. This ticket covers the platform
implementation; legal review is a separate obligation.

T4-25: Vendor terms of participation ✓ COMPLETE

vendor-terms.html created (platform-level page, 8 sections, staged
pricing model documented: 3-month free period, per-drop fee TBD, future
subscription, amber draft banner, version 0.1 note). Terms acceptance
step added as final onboarding step in onboarding.html — writes
terms_accepted and terms_accepted_at to vendors table. Returning vendors
who completed onboarding before terms existed are routed to the terms
step on next login.

Schema addition required before building:
```sql
ALTER TABLE vendors
ADD COLUMN IF NOT EXISTS terms_accepted boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz DEFAULT NULL;
```

Note: as with the privacy policy, the terms content should be reviewed
by a qualified legal professional before Hearth onboards real vendors.
This ticket covers the platform implementation.

Restored: vendor-terms.html was missing from origin/main after PR #133
only partially merged the source branch. Restored at commit 2e04e66.

T4-26: Host participation terms ✓ COMPLETE

host-terms.html created (platform-level page, 8 sections, amber draft
banner, version 0.1 note). Host quick-create modal in hosts.html
converted to two-step flow — step 1 collects name/type/postcode, step 2
requires terms acceptance. terms_accepted and terms_accepted_at written
to hosts table in the same insert as host creation.

Dependency: T4-16 (hosts as first-class entities — complete).

Note: host terms content requires legal review before use with real
hosts.

Restored: host-terms.html was missing from origin/main for the same
reason. Restored at commit 1cdc982.

T4-27: Customers page — first-class customer asset view ✓ COMPLETE
customers.html built as a first-class operator page. Four sections:
asset summary bar (total/earned/imported counts), segment cards (loyal
core, occasional, lapsed via HearthIntelligence.segmentCustomers()),
recommendations strip (filtered from HearthIntelligence.generateRecommendations()),
and full customer list with client-side segment filtering (200-row cap).
Mobile-responsive layout with stacked cards, hidden low-priority table
columns, and 44px touch targets at 768px and below.

Session notes: Customers nav item added between Insights and Hosts.
Hosts and Setup carry `utility: true` flag, rendered with
`class="utility"`, styled at 55% opacity / 12px in hearth.css. Vendor
`display_name` now dynamically updates `.brandSubtitle` on Service
Board, Insights and Customers after vendor resolves.

Dependency: T4-14 (customer import — complete)

T4-28: Intelligence engine — extract to shared module ✓ COMPLETE
assets/hearth-intelligence.js created as a shared module exposing
window.HearthIntelligence with: detectArchetype(), analyseCapacitySignals(),
analyseRhythmSignals(), analyseMenuSignals(), analyseGrowthSignals(),
generateRecommendations(), and segmentCustomers(). insights.html
refactored to consume the shared module. Customers page (T4-27) and
Home dashboard (T4-4) draw from this engine without duplicating logic.
Foundation that T5-9 matures into a full recommendation engine.

T4-29: Series intelligence in Insights
Add series-level performance view to Insights — cumulative revenue
across a series, fill rate trend by occurrence, whether the series is
growing or declining over time. Surface plain-English observations:
"Your Friday series has filled above 80% for 4 consecutive weeks" or
"Fill rate has dropped for 3 occurrences — consider adjusting capacity
or timing." Depends on real series data from T4-1.

Dependency: T4-1 (recurring series — complete)

Note: when built, T4-29's plain-English observations should adopt the repetition-layer voice (Hearth_Repetition_Layer_Voice_Spec.md). Copy held until real series data exists — do not write trend copy against synthetic data.

T4-30: Onboarding delivery model audit ✓ COMPLETE
Audited and confirmed. detectArchetype() in hearth-intelligence.js
flags aggregator vendors when primary_goal includes reduce_aggregators
or delivery_model is aggregator. generateRecommendations() has a
dedicated archetype-aware block for this condition pushing a
recommendation about building direct customer relationships independent
of aggregator platforms. The aggregator reduction pathway is prominent
in onboarding Q3 and Q5.

T4-31: Order page polish (photography excluded) ✓ COMPLETE
Polish pass on the customer-facing ordering experience to make it
feel more premium, more locally specific, and more vendor-led. This
is about making vendors proud to share their order link.

Scope covers: hero proportions and signal hierarchy (timing chip
primary, capacity chip honest framing, lighter vendor identity);
host-context copy line replacing any host crest/logo; a new "Drop
Story" card (vendor-written occasion copy read from a `drop_intro`
field, hidden gracefully when absent); replacing the menu accordion
with a sticky horizontal category pill-nav; two designed item-card
states (with-photo and without-photo, both first-class); minor
basket bar and checkout sheet language and ordering changes;
designed edge states for closed / pre-open / capacity-low.

Per-item photography is explicitly out of scope for T4-31 and lives
in T4-31b. Item cards include both with-photo and without-photo
states so the with-photo path Just Works once T4-31b lands.

Shipped in PR #224 (merged 6 May 2026). 24 commits on
feature/t4-31-order-page-polish. Scope: hero proportions and chip
hierarchy (timing primary, capacity honest framing); host-context
copy line replacing any host crest; Drop Story card reading
drops.drop_intro (hidden gracefully when absent); accordion replaced
with sticky horizontal category pill-nav; two designed item card
states (with-photo path ready, no-image path typography-led); warm
card backgrounds (#faf7f4); category headings in Cormorant Garamond;
vendor primary_color on CTAs (not Hearthfire); basket bar language
("Your order · N items · £X"); checkout sheet fulfilment-first
sequencing and opt-in visually distinct; designed edge states for
closed / pre-open / capacity-low. Drop Studio Basics: "Drop Story"
section with "About this drop" textarea, 280-char hint, saves via
update-drop Edge Function (redeployed v11 same day). Per-item
photography deferred to T4-31b.

T4-31b: Per-item photography asset workflow (storage, upload UX,
format constraints, phone capture guidance for vendors).
Scope covers the full asset workflow that T4-31 explicitly carved
out: schema migration to add `image_url` (text, nullable) to the
products table; Supabase Storage layout under
`assets/vendors/{vendor-slug}/products/`; upload UX inside Menu
Library (likely on the product edit drawer, mirroring the Brand
Hearth file-upload pattern from T2-7); format constraints (JPEG /
WebP, max dimensions, max file size); guidance copy for vendors on
phone capture (lighting, angle, framing) so the resulting library
feels coherent rather than a mix of stock photos and bad lit-from-
above kitchen shots. Does not require any further order page
changes — the order page item-card with-photo state shipped in
T4-31 already reads `image_url` and renders correctly when
present.

Backlogged. Schedule after vendor onboarding friction confirms
photography is the next-most-valuable polish lever (i.e. when
the order page polish from T4-31 is live and vendors are asking
for the photo path).

**Status update (7 May 2026):** PARTIAL. Hero photo upload (Brand
Hearth) shipped in PR #225. Includes: shared
`assets/hearth-photo-upload.js` component (Cropper.js + canvas
compression + Supabase Storage); self-hosted libheif-js bundled
variant (`assets/libheif.js`, ~1.4MB) for modern iPhone HEIC
decode; hero composition guidance copy; full state machine
(empty / selected / converting / uploading / has-image / error);
replace and remove flows; mobile camera capture verified;
storage bucket confirmed as `vendor-assets` with path
`{slug}/hero` and `upsert: true`. See CLAUDE.md operational
learnings #35-#38 for technical context.

Per-product photography (Menu Library mount, schema migration,
Edge Function whitelist updates, order page field verification)
is split out into **T4-31b-products** as a new open ticket — see
below.

T4-31b-products: Per-item photography asset workflow — Menu
Library mount + schema + order page integration ✓ COMPLETE 2026-05-09

**Status:** ✓ COMPLETE 2026-05-09. Tier 4. Successor to T4-31b's
deferred product-photo scope.

**Closure note (2026-05-09):** Per-item photography is wired
end-to-end across products and bundles.

- Schema: `products.image_url` (text, nullable) added; later
  extended to `bundles.image_url` (text, nullable).
- Views: `v_drop_menu_items_enriched`, `v_menu_library_items`,
  `v_drop_menu_item_stock`, `v_products_enriched`, and
  `v_bundles_enriched` updated to expose `image_url` (per
  operational learning #26 — appended at end of SELECT to satisfy
  Postgres's no-reorder-on-replace rule).
- Edge Functions: `create-product` and `update-product` accept
  `image_url` in their ALLOWED_FIELDS. `create-bundle` and
  `update-bundle` accept `image_url`. Both `create-product` and
  `create-bundle` accept an optional caller-supplied `id` field
  (UUID-validated; conflict → 409) so the storage upload path
  can be constructed before the row is saved (operational
  learning #41).
- Storage: bucket `vendor-assets`, path `{slug}/products/{id}`
  for products and `{slug}/bundles/{id}` for bundles, both with
  `upsert: true` so replacements overwrite in place.
- drop-menu.html: HearthPhotoUpload mounted on the product
  editor drawer, the bundle editor drawer, and the product /
  bundle creation modals — mirroring the Brand Hearth hero
  integration.
- order.html: `:has()`-based horizontal photo-right layout
  (96px thumbnail on the right, body on the left) for cards
  with a direct `.menuItemMedia` child. Bundle outer cards
  with nested choice cards and text-only cards fall through to
  the existing vertical layout. Specificity (0,4,0) of the new
  selector wins over the (0,1,0) base `.menuItemBody` rules
  including in the mobile `@media` block — no per-breakpoint
  scoping required (operational learning #40).

Original spec preserved below for reference.

**Original status:** Open. Tier 4. Successor to T4-31b's deferred
product-photo scope.

The shared HearthPhotoUpload component built in PR #225 is ready
to mount. Remaining work:

**Schema (Ed runs in SQL editor):**
ALTER TABLE products ADD COLUMN image_url text;

**Storage layout:** Bucket `vendor-assets` (existing). Path
`{slug}/products/{product_id}-{timestamp}.jpg`. Mirrors the flat
`{slug}/{asset}` pattern with a `products/` subdirectory. Verify
Storage RLS policies allow nested writes under each vendor's
slug folder; extend if needed.

**Edge Function whitelist updates:** Add `image_url` to
ALLOWED_FIELDS in `supabase/functions/create-product/index.ts`
and `supabase/functions/update-product/index.ts`. Both deploy
via `supabase functions deploy` per CLAUDE.md rule #15.

**View widening (Ed runs in SQL editor):** Per operational
learning #26, append `image_url` to any v_*_enriched view that
surfaces products to operator UI or order page. Audit list:
`v_products_enriched`, `v_menu_library_items`,
`v_drop_menu_items_enriched`, `v_drop_menu_item_stock`. Use
CREATE OR REPLACE VIEW with `image_url` appended at end of
SELECT (Postgres rejects column reordering).

**Menu Library mount (drop-menu.html):** Add a Photo section to
the product editor drawer mounting HearthPhotoUpload with 16:9
aspect ratio, storage path
`{slug}/products/{product_id}-{ts}.jpg`, and item-photo
composition guidance.

New product chicken-and-egg: products need an ID before upload
can succeed. Generate a client-side UUID for the storage
filename and save it with the product on first save. Orphan
files possible if vendor uploads but cancels save — accepted
for V1.

**Order page verification (order.html):** T4-31 built the
conditional render for with-photo and no-image card states.
Verify the field name reads from `image_url`. Eye-test
mixed-state visual rhythm on deploy preview with Test 11 (some
products with photos, some without) — strategy 1 from T4-31b
design (mixed by default, no per-item visibility toggle in V1).

**Sequencing:** waits until the in-flight platform brand
refresh merges to main, then this work goes onto the
brand-refreshed drop-menu.html. Likely two PRs: PR1 covers Edge
Function whitelists + drop-menu.html mount; PR2 covers order
page verification. Could be one if scope holds.

**Verification checklist:** product photo upload, crop, save
end-to-end on Test 11 deploy preview; replace, remove flows;
order page renders mixed-state cards correctly; mobile capture
verified.

T4-31d: Allergen capture and display ✓ COMPLETE 2026-05-11

**Status:** ✓ COMPLETE 2026-05-11. Tier 4. Customer-facing allergen
information across order.html, the bundle picker, and the basket.

**Closure note (2026-05-11):**

- Schema: `products.allergens` (text[] NOT NULL DEFAULT '{}') added.
  The Postgres `allergen` ENUM type was created up front but is
  unused by application code — see operational learning #42 in
  CLAUDE.md for the PostgREST-can't-write-ENUM-array reason the
  columns are `text[]` rather than `allergen[]`.
- Edge Functions: `create-product` and `update-product` accept
  `allergens` in their ALLOWED_FIELDS (shipped earlier in the
  T4-31d batch, PR #236).
- drop-menu.html: allergen pill picker on the product editor with
  the canonical 14-allergen set (PR #237).
- order.html: expanded menu cards render a "Contains: …" line
  above the description using the `ALLERGEN_LABELS` lookup; bundle
  picker choice cards render a small muted "Contains: …" line
  beneath each option; basket product line items render the same
  "Contains: …" line beneath the item name. Bundles deliberately
  show nothing allergen-related — bundle composition can vary by
  selection, so allergen surfacing happens at the constituent
  product card and inside the basket summary for products. Order
  page changes shipped this session.

**Operational learning surfaced:** PostgREST cannot write
custom Postgres ENUM array types via the Supabase JS client — use
`text[]` columns and validate at the application layer. Recorded as
operational learning #42 in CLAUDE.md.

T4-31e: Dietary flag capture and display ✓ COMPLETE 2026-05-11

**Status:** ✓ COMPLETE 2026-05-11. Tier 4. Customer-facing dietary
flag information across order.html and the bundle picker.

**Closure note (2026-05-11):**

- Schema: `products.dietary_flags` (text[] NOT NULL DEFAULT '{}')
  added. As with allergens, the `dietary_flag` ENUM type exists
  but the column is `text[]` for PostgREST write compatibility —
  see operational learning #42.
- Edge Functions: `create-product` and `update-product` accept
  `dietary_flags` in their ALLOWED_FIELDS (PR #236).
- drop-menu.html: dietary flag pill picker on the product editor
  with the canonical five-flag set (vegetarian, vegan, gluten_free,
  dairy_free, nut_free) (PR #237).
- order.html: compact menu cards show abbreviated dietary badges
  (V / VG / GF / DF / NF) immediately below the dish name in a
  muted-green pill style; expanded cards show a "Suitable for: …"
  line with the full labels above the description; bundle picker
  choice cards show the same abbreviated badges beneath each
  option name. Dietary flags are deliberately not shown in the
  basket — allergens are the safety-critical surface there.

T4-31b-fu1: Server-side HEIC conversion fallback

**Status:** Open. Tier 4. Deferred — build only when a real
vendor surfaces this as live friction.

**Background:** PR #225 added client-side HEIC conversion via
libheif-js bundled variant. Modern iPhone HEIC files from
mobile Safari work because iOS auto-converts. Modern iPhone
HEIC files synced to Mac Photos and uploaded via desktop Chrome
may still fail on libheif's parser limits — though the bundled
variant 1.19.8 has handled all test cases so far.

**Scope when triggered:** Add a Supabase Edge Function
(`convert-heic` or similar) that accepts a HEIC blob, runs
server-side conversion via Sharp or ImageMagick with HEIF
support, returns JPEG. The client falls back to this Edge
Function when libheif-js decode throws.

**Trigger:** real vendor reports being unable to upload HEIC
from Mac Photos and the libheif client-side decode fails for
their specific files. Until then, the workaround copy ("upload
from your phone, or convert to JPEG via Preview") is in place.

T4-31-BH: Brand Hearth — guidance updates required following T4-31
order page redesign

Three pieces of vendor-facing guidance need adding to Brand Hearth
as a result of the T4-31 design review:

(1) Drop Story tone guidance — vendors need to understand this
field is occasion-level copy ("why this drop, this week") not
brand-level copy. Suggested prompt: "This week's story, not your
brand story." With a 280-character limit and a worked example.

(2) Hero image guidance — food-led photography performs significantly
better than logo-led imagery in the hero. Guidance should set
expectations on framing, lighting, and subject.

(3) Tagline guidance — clarify that the vendor tagline (e.g.
"Wood-fired pizza. Simply done.") is brand-level copy that appears
on every drop, and is distinct from the drop-specific intro copy in
the Drop Story field.

Backlogged pending first vendor onboarding.

T4-32: Order page — map display for collection point and delivery area
Add a toggleable map to the order page, controlled per-drop in Drop Studio.
Two modes:
- Collection drops: vendor pins an exact location (coordinate or address)
  when creating the drop. Order page shows a map marker so customers know
  precisely where to collect. Particularly valuable for food trucks where
  location changes per drop.
- Neighbourhood delivery drops: order page shows the delivery area as a
  shaded radius so customers can see at a glance whether they are covered.
Map should be off by default and enabled per-drop. Applies to any drop
type — not exclusive to food trucks. Implementation likely via Google Maps
embed or equivalent. Dependency: T3-12 for the radius data model.

T4-33: Brand Hearth — vendor copy generation and customisation review

Two parts:

**Part 1 — GenAI brand copy generation**

The blank page problem is real for food vendors who aren't confident writers. After onboarding completes, Brand Hearth offers to generate a first-draft tagline and about paragraph. The vendor triggers generation on demand via a "Generate a starting point →" prompt — never automatic, always opt-in. The API call passes structured onboarding data: business name, operating model, primary goal, existing host contexts, customer data posture, food category (inferred from brand and product data where available), and social handles if set. Haiku 4.5 generates a tagline and 2–3 sentence about paragraph in Hearth's warm, local, artisan tone. Vendor reviews and edits inline before saving. Frame explicitly as a starting point, not a finished output. Client-side, same pattern as T5-25.

Key constraint: the model must never generate claims about specific locations, specific products, or specific customers — those must come from vendor input. The generation scope is tone and framing only. See GenAI shared principles for hard rules.

**Part 2 — Customisation review**

Conduct a structured review of Brand Hearth to identify what additional brand controls would meaningfully change how vendor-owned the experience feels. Current state is minimal: hero image, display name, tagline, colour picker. Assess whether vendors currently feel proud showing their brand to customers. Candidates: font choices, accent colour application across more UI elements, secondary brand image, richer about copy, social handle display. Goal is not feature bloat — identify what is missing before deciding what to build. Run as a focused design review before any build work.

**Status update (May 2026):** Deferred pending T5-25 (drop
promotion / marketing assets). T4-33 generates vendor brand
copy (tagline, about paragraph) which has no current
customer-facing surface — vendor tagline and about paragraph do
not render on the customer order page (see CLAUDE.md "Product
decisions captured" — customers arrive in-context). The first
surface that actually exposes vendor brand copy to customers
indirectly is T5-25's promotion materials (poster, social
copy). Build T4-33 alongside or just before T5-25, not as a
standalone Brand Hearth feature. Possibly split into
tagline-only (low blank-page burden, manual fine) and
about-paragraph (higher blank-page burden, AI helps) at build
time.

The drop-level equivalent — T4-33b drop copy generation — has
independent customer-facing value via Drop Story card and is
not deferred. See T4-33b.

T4-33b: Drop copy AI generation — sixth GenAI use case

**Status:** Open. Tier 4. Surfaced during T4-31b design
conversation, May 2026.

**Scope:** AI-assisted copy generation for the per-drop
`drop_intro` field that powers the Drop Story card on
order.html. Architectural pattern matches T4-33 — opt-in CTA in
Drop Studio, client-side Anthropic API call (Haiku 4.5),
structured drop data in, plain-English copy out as editable
starting point. Same hard rules as the GenAI shared principles
(deterministic facts rendered separately, framing only
generated, never automatic).

**Why this earned its own ticket vs riding on T4-33:** vendor
brand copy is a once-per-vendor asset with no current
customer-facing surface (deferred until T5-25). Drop copy is a
weekly-cadence asset that surfaces directly on order.html every
drop. Blank-page burden is real and recurring. Higher-value
GenAI piece in the near term.

**Inputs to the prompt:** vendor brand voice from Brand Hearth
(display_name, tagline, food category cues); drop occasion data
(host context, day of week, drop_type, fulfilment_mode,
opens_at / delivery_start); menu highlights (top 3-5 items by
name from drop_menu_items); optional vendor "what's the angle
this week" steering input.

**UX:** "Generate a starting point →" link inside the Drop
Story textarea in Drop Studio. On click, call API, populate
textarea with editable draft. Vendor edits, saves via existing
update-drop flow. 280-character limit unchanged.

**Architecture:** client-side Haiku 4.5 call via established
Claude-in-artifact pattern. No new Edge Function. No new
schema.

**Sequencing:** independent of brand refresh and
T4-31b-products. Can ship anytime after the platform's first
vendor is running real drops (otherwise no real drops to test
against).

T4-34: Multiple windows — windowCount race condition on sibling naming
Multiple windows flow assigns the same "Window N" suffix to multiple
siblings. handleCreateEventWindows iterates over user-defined window rows
and calls createEventWindow once per row in sequence. createEventWindow's
windowCount is computed by querying drops at the same host on the same
delivery_start date. When two siblings are created in rapid succession,
the second iteration's query may not observe the just-created first
sibling, so both siblings get assigned "Window 2" as their suffix instead
of "Window 2" / "Window 3". Confirmed during PR 4b Phase 2 verification
on test-11 deploy preview — two siblings created from the Multiple
windows flow both ended up named "Test 8b.1.a 1 Copy — Window 2"
(window_group_id and unique slug were correct via buildUniqueSlug; only
the human-readable name field collided). Pre-PR-4b bug; PR 4b's migration
preserved the same windowCount logic. Fix candidates: pass an explicit
position counter through the loop instead of querying, or await each
sibling's commit confirmation before the next iteration. Cosmetic — does
not break functionality but creates operator confusion.

T4-35: Multiple windows + Close Orders duplicative timing UX
In Drop Studio Timing pane, when "Multiple windows" is selected, each
window row has its own Close time field — but the parent drop's overall
closes_at is also still required separately at the bottom of the pane via
the Close Orders date/time fields. Operator confusion: the parent close
is duplicative-feeling and could conflict with the per-window closes;
readiness check requires parent closes_at regardless. Confirmed during
PR 4b Phase 2 verification on test-11 deploy preview. Pre-PR-4b UX issue;
PR 4b inherited it. Proposed fix: when Multiple windows is selected and
at least one window has a close time set, hide the parent-level Close
Orders fields and auto-derive parent closes_at from the latest window
close.

T4-36: Multiple windows — discoverability of Create windows action
In Drop Studio Timing pane, the "Multiple windows" radio toggle shows
when a host is selected and the drop has no window_group_id. After
toggling Multiple windows, operator must (a) configure window rows, then
(b) click "Create windows" button to materialise the siblings. Step (b)
is easily missed — the Create windows button is small, lives below "Add
another window", and is not visually emphatic. Operator can save the
drop and proceed through Continue without ever clicking Create windows,
leaving configured windows unmaterialised. Confirmed during PR 4b Phase 2
verification on test-11 deploy preview. Proposed fix: either
auto-materialise windows on save (treat configured rows as committed),
or strengthen Create windows button visual prominence (larger, primary
colour, separator above).

T4-37: Drop Studio inline host creation — capture terms acceptance ✓ COMPLETE
The inline "+ Create Host" modal in `drop-manager.html` now captures
host participation terms acceptance before invoking `create-host`.
Vendor-attestation pattern: a single checkbox in the modal reading
"I have explained the host participation terms to [host name] and
they have agreed", with the host name interpolated live from the
Host Name field as the vendor types and falling back to "this host"
when empty. The phrase "host participation terms" within the
attestation sentence links to `host-terms.html` opening in a new tab.

The `create-host` Edge Function already accepted `terms_accepted`
and `terms_accepted_at` in its payload — see the explicit comment
in the function body. Client-side change only; no Edge Function
deploy and no schema change required (columns existed on the
`hosts` table from T4-26).

Three additions to drop-manager.html:
(a) New checkbox field in the inline modal markup, between the
    existing studioGrid2 (name/type/postcode) and the modalMessage
    div, styled as a bordered box matching hosts.html's terms step.
(b) `createHost()` validates the checkbox before invoking the
    Edge Function (matching hosts.html line 711 wording exactly:
    "Please confirm the host participation terms before creating
    this host."), and the payload now sends `terms_accepted: true`
    and `terms_accepted_at: new Date().toISOString()`.
(c) New `openHostModal()` wrapper resets all fields, the checkbox
    state, the host-name fallback in the label, and the disabled
    state of the Create Host button before opening the modal.
    Replaces the `openHostModalBtn` click handler's previous
    direct call to `openModal('hostModal')`.

Once both host creation paths capture terms (hosts.html via T4-26
and drop-manager.html inline via T4-37), `terms_accepted` can be
made required in `create-host` rather than optional. Tracked as a
post-T4-37 follow-up; the optional-for-backwards-compatibility
comment in the Edge Function remains in place until both paths
are confirmed live and stable in production.

T4-37b (host-direct terms acceptance via email confirmation) is
the natural progression of this work and is now in the backlog
as a separate ticket — see below.

Shipped on PR #222 (commit eb18d37). Verified end-to-end on Test
11 production: host "T4-37 Prod Verify" created with
`terms_accepted: true`.

T4-37b: Host-direct terms acceptance via email confirmation
Tier 4. Open — gated on T5-11 transactional email plumbing maturity
and on real evidence from Healthy Habits Cafe of vendor pull for
host-direct consent.

T4-37 captured host terms acceptance via vendor attestation — the
vendor confirms on the host's behalf that the host has read and
agreed. That is correct for a pre-launch platform with one vendor
and a handful of hosts, but it is structurally weaker than
host-direct consent. The host themselves never sees the terms in
the T4-37 flow.

This ticket adds host-direct consent as a second path that vendors
can choose at host-creation time, alongside the existing
attestation path. The vendor picks the path appropriate to the
relationship context: attestation for hosts they already have a
working arrangement with; host-email for hosts they are bringing
onto the platform fresh or for whom direct consent is preferable.
The choice puts the integrity judgement where it belongs — with
the vendor, who knows whether the conversation has genuinely
happened.

**Path A (existing) — Vendor attestation.** Unchanged from T4-37.
Single checkbox, vendor confirms on the host's behalf. Stores
`terms_accepted: true`, `terms_accepted_at: now()`,
`terms_acceptance_method: 'vendor_attestation'`.

**Path B (new) — Host-direct via email confirmation.** Vendor
captures the host's email at host creation time. A new
`send-host-invite` Edge Function generates a single-use
confirmation token, stores it on the host record with an expiry,
and sends the host an email. The email contains a summary of the
terms, a link to the full `host-terms.html` page, and a "Confirm
and view your drop" CTA. Clicking the CTA lands on a new
`host-confirm.html?token=<uuid>` page that validates the token
via a `confirm-host-terms` Edge Function, writes
`terms_accepted: true` and the matching timestamp, then redirects
to the existing `host-view.html?drop=<slug>` for their first drop
— giving the host an immediate concrete view of what they're
hosting rather than a blank confirmation page.

No host login required at this stage. Token-based one-shot
confirmation, structurally similar to a magic link but
single-purpose (accepts terms for one specific host record, then
expires). This is deliberately not T5-27 Phase 1 (host platform
participation with auth) — it is a smaller consent-capture step
that builds toward Phase 1 without requiring it.

**Publish gate.** Drops at hosts where `terms_accepted` is
`false` cannot transition to live until either the host confirms
via the email link or the vendor switches that host to
attestation. Soft block, not hard — vendors can build the drop,
configure the menu, prepare everything; they just cannot publish.
Reuses the existing `transition-drop-status` server-side gate
pattern.

**Pending-state UX.** Hosts in `terms_acceptance_pending` state
appear in the host dropdown with an "Awaiting host confirmation"
pill. Vendor can re-send the confirmation email or switch the
host to attestation if direct confirmation is taking too long.

**Schema additions required before build (Edward to run via
Supabase SQL editor):**

```sql
ALTER TABLE hosts
  ADD COLUMN terms_acceptance_method text
    CHECK (terms_acceptance_method IN ('vendor_attestation', 'host_email')),
  ADD COLUMN terms_acceptance_pending_at timestamptz,
  ADD COLUMN host_contact_email text,
  ADD COLUMN terms_confirmation_token uuid,
  ADD COLUMN terms_confirmation_token_expires_at timestamptz;
```

Existing host records (where `terms_accepted: true` is already
set via T4-37 or T4-26) get `terms_acceptance_method =
'vendor_attestation'` backfilled at deploy time.

**Build scope (estimated 2–3 Claude Code sessions):**

- Modal redesign in drop-manager.html and hosts.html — two-path
  selector ("Vendor confirms" vs "Send to host"), conditional
  email field, conditional checkbox
- New Edge Function: `send-host-invite` — generates UUID token,
  stores on host record, sends Resend email with confirmation
  link
- New Edge Function: `confirm-host-terms` — token validation,
  service-role write of `terms_accepted: true`, single-use
  enforcement
- New page: `host-confirm.html` — single CTA, calls
  `confirm-host-terms`, redirects to host-view.html on success,
  handles expired/invalid token states
- Schema migration (Edward runs)
- Publish gate update in `transition-drop-status` to check
  `terms_accepted` before allowing live transitions
- Pending-state pill in host dropdown / host directory in both
  drop-manager.html and hosts.html

**Token security:** UUID v4, single-use (cleared on successful
confirmation), 30-day expiry. Stored on the host row as
`terms_confirmation_token` and
`terms_confirmation_token_expires_at`. Standard pattern, no
novel risk.

**Sequencing rationale:** Path A (T4-37) shipped first to close
the immediate integrity gap (drop-manager.html bypassed terms
entirely). Path B waits until (1) T5-11 transactional email
plumbing is mature enough that adding a new send is a small
addition rather than building infrastructure, and (2) Healthy
Habits Cafe has run several real drops and we have evidence of
whether vendors actually want host-direct consent or whether
attestation is sufficient in practice. Designing Path B from
imagination rather than from real friction risks building
something vendors do not pick.

**Relationship to T5-27:** T4-37b is a stepping stone toward
T5-27 Phase 1 (host platform participation with auth). When
T5-27 Phase 1 ships, the email sent in T4-37b is the natural
place to add "or create a host account to manage this and
future drops." The consent already captured by T4-37b carries
forward — hosts who confirmed via T4-37b's flow do not need to
re-accept terms on T5-27 signup. T4-37b builds toward T5-27,
T5-27 does not replace T4-37b.

Dependency: T5-11 transactional email plumbing matures beyond
its current PARTIAL state (auth and onboarding emails wired,
application-level send pattern not yet established). T4-37b
needs one new send template; doable as a small addition once
T5-11's pattern is in place.

Cross-reference: T4-37 (parent ticket, closed), T5-11 (email
infrastructure dependency), T5-27 (host platform participation
follow-on workstream).

T-customers-page-import-entry — surface customer import from Customers and Home ✓ COMPLETE 2026-05-22

**Status:** ✓ COMPLETE 2026-05-22. Tier 4. Surfaced 2026-05-15 after T-ops-rls-customer-import shipped, making the import flow functional in production for the first time.

**Closure:** CTA-only fix landed 2026-05-22 on customers.html. Engine threading (Part 2 audit findings) spun off as T-intelligence-engine-import-recommendation (now closed).

**Problem:** The Customers page (`customers.html`) is framed as "Your owned customer asset — independent of any platform" but has no CTA to add customers via CSV import. Vendors arriving with an existing customer list have no obvious path from the page that's literally about growing their customer asset to the page that grows it. The only current entry to `customer-import.html` is via onboarding for data-rich vendors (T4-23) or by knowing the URL directly.

Same likely concern on Home dashboard — "Import your existing customer list" should be a first-class next-action for data-rich vendors per T4-23 / T4-28's archetype-aware recommendation logic, but the surfacing should be audited now that the flow actually works.

**Scope:**

Part 1 — Customers page CTA. Add an "Import customers from a CSV" entry point to `customers.html`. Suggested placement: as a fourth tile in the asset summary section's stat grid, OR as a quiet button beneath the asset summary heading, OR as a more prominent card-style CTA when the vendor has zero imported customers yet. Design conversation before build — the right shape depends on whether the CTA should be persistent (always visible) or contextual (more prominent for vendors with empty imports). The action itself is a simple route to `customer-import.html`.

Part 2 — Home dashboard audit. Verify that data-rich vendors (per `detectArchetype()` + the `customer_data_posture` field from onboarding) receive a recommendation to import their existing customer list during the first-drop phase. If the recommendation already fires correctly, no Home dashboard change needed. If it doesn't, extend `generateRecommendations()` in `assets/hearth-intelligence.js` to surface it.

**Why this is Tier 4 not Tier 3:** the import flow is functional end-to-end; this is a discoverability / UX improvement, not a launch blocker. Healthy Habits can import via the URL today. The fix matters more when Hearth has multiple vendors than it does for the first.

**Dependency:** T-ops-rls-customer-import (closed 2026-05-15 — prerequisite for this gap to be worth fixing).

**Cross-reference:** T4-23 (first-drop guidance — already nominally routes data-rich vendors toward import), T4-27 (Customers page — this ticket extends), T4-28 (intelligence engine — Home dashboard recommendation surfacing).

T-intelligence-engine-import-recommendation: Recommendation engine threading for data-rich vendor import nudge ✓ COMPLETE 2026-05-23

Status: ✓ COMPLETE 2026-05-23. Tier 4. Surfaced 2026-05-22 during T-customers-page-import-entry Part 2 audit.

Closure: Shipped 2026-05-23 across two commits. Engine extended (detectArchetype exposes customerDataPosture; signals shape adds importedCount; new archetype_import_existing_customers branch). EF get-vendor-customer-count widened with optional source filter (backward compatible). home.html and customers.html compute importedCount from in-memory state; insights.html calls the extended EF. Branch position promoted to top of recommendation priority so it surfaces on Home (which slices to top 3) for the pre-import data-rich audience, suppressing naturally once importedCount >= 5. Verified end-to-end on production by flipping test-11 customer_data_posture to 'rich' and confirming surface on all three pages with correct CTA routing to customer-import.html. New operational learning surfaced: direct PostgREST counts on RLS-locked tables silently return 0 due to the publishable-key auth-attach pattern — extending the engine's signal contract requires reading from in-memory state or routing through JWT-authed EFs, never a direct count query.

Problem: The recommendation engine in assets/hearth-intelligence.js does not currently thread customer_data_posture or imported-customer count into generateRecommendations(). detectArchetype() returns { type, label, goals, deliveryModel, vendorType } only. Adding a data-rich-vendor import-first nudge per T-customers-page-import-entry Part 2 requires extending both the archetype output and the signals input shape.

Scope:
1. Extend detectArchetype() in hearth-intelligence.js to expose customerDataPosture from vendorPreferences.customer_data_posture.
2. Add importedCount (or equivalent) to the signals parameter shape consumed by generateRecommendations().
3. Update every caller of generateRecommendations() (Home dashboard, Customers page, Insights) to compute and pass the new signal.
4. Add a new recommendation branch alongside archetype_grow_customer_base for data-rich vendors with < 5 imported customers, with ctaTarget: 'customer-import'.

Defer until at least one real data-rich vendor is onboarded. Building speculatively for an audience that doesn't exist is the wrong call.

Cross-reference: T-customers-page-import-entry (parent, closed via CTA-only fix), T4-28 (intelligence engine).

T-auth-callback-admin-routing: Admin-aware login routing in auth-callback.html ✓ COMPLETE 2026-05-22

Status: ✓ COMPLETE 2026-05-22. Retrospective ticket — no ticket previously existed; logged at docs-sweep time to record the closure.

Closure: After a successful login and before the existing vendor resolution flow, auth-callback.html now calls admin-verify. If it returns 200, the user is routed to platform-admin.html (respecting storedRedirect only when it begins with 'platform-admin'). Non-admins fall through to the unchanged vendor lookup flow. Result: admins and vendors share a single entry point at login.html with no separate admin login page. Verified for both admin and vendor sign-ins. Builds on the platform admin MVP (admin-verify Edge Function, 2026-05-21).

Cross-reference: Platform admin MVP (admin-verify EF), operational learning #7 (auth flow routing patterns).

### Tier 5 — Strategic platform features

T5-1: Delivery optimisation
Route planning and batching for neighbourhood drops. Cluster addresses,
suggest optimal route. Not needed for community drops.

T5-2: Demand generation — SMS alerts — SUPERSEDED

**Status:** SUPERSEDED by T5-C2 and T5-11 (May 2026).

The original framing — SMS as the primary demand generation channel for
drop announcements and reminders — is incorrect. Research conducted as
part of T5-C1 establishes that WhatsApp is the correct channel for drop
demand generation (98% open rate, 45–60% CTR, community activation
through host groups), while SMS is the correct channel only for
transactional notifications where guaranteed delivery matters regardless
of app availability. The order-ready notification is the sole SMS use
case for Hearth.

Superseded by:
- T5-C2 (WhatsApp activation system) — covers demand generation
  broadcasts to vendor customer lists via WhatsApp
- T5-11 (comms engine) — updated to include automated SMS for
  order-ready notification as default transactional path
- T3-10 (order ready notification — complete) — manual path already
  in place; T5-11 adds the automated SMS default

No build work required.

T5-3: Host onboarding and contact list upload
Hosts upload contact lists to drive demand. CSV import, consent
management, targeted messaging to host's audience.

T5-4: Marketplace evolution — host-to-vendor matching
Hosts request drops, vendors accept. Vendors declare availability windows
and service areas. Dynamic matching between supply and demand.

T5-5: Vendor onboarding flow — RETIRED — absorbed by T5-13

T5-6: Customer accounts
Order history, saved addresses, preferred drops. Builds repeat
participation central to the Hearth model.

T5-8: Interest registration — signals mechanic ✓ COMPLETE 2026-07-14
Shipped and confirmed complete via the backlog reconciliation audit
(audit/findings-backlog-reconciliation.md); marked open in error. The pre-open
interest-registration mechanic is live end-to-end: the `register-interest` Edge
Function upserts the `drop_signals` table; order.html renders the pre-open
`#registerInterestBlock` (order.html:1760) and invokes `register-interest` with
`kind='interest'`; the vendor sees the "Signals building" count (home.html:1697,
via `get-drop-signals`). Implementation evolved from the original spec — signals
are stored in a dedicated `drop_signals(drop_id, customer_id, kind)` table rather
than `customer_relationships` with `source='interest'`. Ed confirmed
`drop_signals` exists in production via the SQL editor (2026-07-14), sealing the
one non-repo-verifiable dependency. Original spec prose retained below for history.

Pre-live state on order page before opens_at. Customer registers interest
with name and email. Writes to customer_relationships with source =
interest. Vendor sees interest count in Drop Studio labelled "Signals
building". Dependency: T3-9.

T-comms-automation: Behaviour-triggered comms automation + plain-language
insight prompts

**Status:** Open. Tier 5 (intelligence/comms-derived). Competitor-derived
(Owner.com).

Two parts, both layering onto existing work:

(a) Behaviour-triggered re-engagement — automated, event-driven sends
(post-first-order, lapsed customer, drop-day) that fire the touchpoints
already mapped in the Drop Communications Architecture via the comms
engine (T5-11) and its channel routing, rather than relying on manual
prompts.

(b) Plain-language insight prompts — surface intelligence-engine findings
as single-line, actionable nudges in the vendor's voice (e.g. "Your Friday
drops fill fastest — keep the rhythm"), not charts. Aligns with the
Insights reframe as a demand-visibility and cadence-coaching engine
(May 2026 strategy session), not a reporting dashboard.

**Voice guardrail:** all generated copy follows the repetition-layer voice
spec and banned-word list (no boost/convert/funnel/campaign/promotion/etc.);
creative fields are AI-first-draft, vendor-edited, never blank templates.

**Relations:** T5-11 (comms engine), intelligence-engine track,
repetition-layer voice spec, Drop Communications Architecture.

**Note:** larger build; design-before-code. Capture only — sits with the
intelligence-engine track, not near-term.

T-aggregator-savings-calculator: Vendor-facing aggregator cost comparison

**Status:** Open. Tier 5 (vendor onboarding / positioning).
Competitor-derived (Slerp).

A simple vendor-facing tool showing, in plain pounds, what a vendor
currently hands to aggregators (their commission rate x monthly volume)
versus operating through Hearth — making "complement today, displace the
aggregator habit over time" concrete and numeric.

Use: vendor onboarding and the dry run; reinforces the May 2026 positioning
(lead with control, name the aggregator problem plainly) and draws on the
Aggregator Evidence File (T-strategy-1).

**Voice guardrail:** factual and restrained; no marketplace or urgency
language; frame as an honest comparison, not a sales pitch.

**Scope:** could be a calculator on the landing page or a standalone
onboarding asset — decide in design.

**Relations:** T-strategy-1 (Aggregator Evidence File), vendor onboarding
flow, landing page.

**Note:** design-before-code.

T-notify-next-time: Sold-out waitlist / demand capture

**Status:** ✓ COMPLETE 2026-07-14. Competitor-derived (Hotplate item waitlist).
Shipped and confirmed complete via the backlog reconciliation audit
(audit/findings-backlog-reconciliation.md); marked open in error. The post-fill
demand-capture path is live end-to-end on the same `drop_signals` mechanic as
T5-8: `register-interest` accepts `kind='waitlist'` for sold-out/closed drops,
order.html renders the demand-capture block (order.html:1753, tagged
`T5-8 / T-notify-next-time`), and the operator side surfaces `waitlist_count`
(drop-manager.html). Ed confirmed the backing `drop_signals` table exists in
production via the SQL editor (2026-07-14) — the same check that sealed T5-8.
Original spec prose retained below for history.

When a drop or item reaches capacity, let customers leave a contact to be
notified when the vendor next runs it. Captures demand that exceeded supply
— a direct input to capacity-setting and the intelligence layer. Distinct
from pre-open interest registration (T5-8): this is post-fill demand. High
value, low complexity.

**Relations:** T5-8 (interest registration), intelligence engine.

T-cart-hold-timer: Visible cart-hold countdown

**Status:** Open. Competitor-derived (Hotplate cart timer).

We already hold an order for a set time; this surfaces that hold as a
visible per-customer countdown that releases items back to available
capacity on expiry. Protects fill rate and fairness on oversubscribed
drops.

**Guardrail:** audit-first — confirm the current order-hold mechanism in
the order flow before any design or build; framing must read as honest
scarcity, not manufactured urgency.

**Relations:** order flow.

T-comms-order-timeline: Comms→order timeline (honest correlation view, not attribution)

**Status:** Open. Tier 5 / Insights. Post-order-flow — not pre-launch.

**Scope.** Surface order volume in the window *following* each activation
comms send, by joining `comms_log` (the send-side ledger — `sent_at`,
`touchpoint`, `drop_id`) against the drop's `orders` so a vendor can SEE the
shape of demand after each touchpoint (the ordering-opens email, the capacity
signal, the early-access send, etc.). Presented as a readable per-drop
timeline: sends marked along the time axis with the orders that landed after
each one.

**Framing constraint (load-bearing).** This is a READABLE TIMELINE /
correlation view, NOT a causal attribution claim. With multiple channels
firing close together — and customers who would have ordered anyway —
single-send attribution is not provable and Hearth must not pretend it is.
Copy must avoid conversion / funnel / "this send drove N orders" language;
present as "orders after each send", honest and observational, in Hearth
voice (no marketplace or growth-hacking framing). The vendor draws their own
conclusions about which touchpoints move demand for them over repeated drops
— the platform shows the shape, it does not assert the cause.

**Why it exists.** T5-11 slice 1 gave us the `comms_log` ledger (sends are
now recorded with `sent_at` + `touchpoint`); the natural next question a
vendor asks is "did sending that do anything?". Answering it honestly —
correlation, not attribution — is exactly the cadence-coaching / demand-
visibility job of the Insights layer (the intelligence layer is "demand
visibility and cadence coaching", not a reporting dashboard). Showing the
demand shape after each touchpoint builds the vendor confidence the strategy
doc names as the first link in the causal chain.

**Dependencies.** None new — `comms_log` already carries `sent_at` +
`touchpoint` + `drop_id`, and orders are joinable by `drop_id`. Read-only;
fits the operator-read-auth pattern (a JWT-authed `get-*` EF reading the
join server-side). Per operational learning #56(e), `orders` has no
`vendor_id` — scope via `drop_id IN (vendor's drops)`.

**Relations.** Sits beside T-comms-automation (behaviour-triggered comms +
plain-language prompts) and the `get-drop-comms` read EF; surfaces into
T5-15 (Insights demand/audience intelligence layer) and T5-11 (comms
engine). Voice reference: the "honest, not attribution" framing above and
the strategic-principles "we build the demand that fills the next one"
line — observational, never a conversion claim.

## Hearth AI Strategy

### Why AI is central to Hearth's competitive position

Hearth's structural advantage over aggregators is that it returns the
customer relationship to the vendor. Every order through Hearth builds
something the vendor owns: a named, located, opted-in customer who can
be reached again. That owned asset is the moat.

AI is what makes that moat compound. Without an intelligence layer,
customer data is just a list. With one, it becomes a demand engine —
telling vendors where to drop next, which customers to reach, which
menu items to lead with, when their cadence is drifting, and what their
next eight drops should look like. An aggregator cannot offer this
because they own the customer relationship and will never return it.
Hearth can offer it precisely because it does.

The strategic framing: **Hearth is not an AI platform. It is a platform
that uses AI to make vendors significantly smarter than they could be
alone.** That distinction protects the brand (no AI-for-its-own-sake
features) and sharpens the product (every AI surface must answer a
question a vendor actually has).

The compounding principle: **every drop should make the platform smarter,
not just bigger.** A vendor on their tenth drop should have materially
better guidance than on their first — not because the UI changed, but
because the system has learned their customers, their geography, their
capacity patterns, and their best-performing menu items. This is
Hearth's answer to "why not just use a spreadsheet."

### The three layers of AI in Hearth

**Layer 1 — Intelligence (signals → recommendations)**
SQL computes signals from structured drop, order, and customer data.
LLM turns those signals into plain-English recommendations the vendor
can act on. This is the core loop: data in, language out, vendor
decides. Examples: T5-9 (recommendation engine), T9-4 (drop
optimisation), T9-7 (capacity intelligence).

**Layer 2 — Generation (structured data → assets)**
Drop and vendor data is passed to an LLM to generate ready-to-use
assets — social copy, email body text, menu card images, host
introduction drafts. Removes the blank-page problem for vendors who
are food people, not copywriters. Examples: T5-25 (promotion assets),
T5-26 (host outreach copy), T5-11 (email body copy), T5-C6 (activation
plan).

**Layer 3 — Conversation (natural language → structured records)**
Vendor describes what they want in plain English; the platform
extracts structured field values and pre-populates the relevant form.
The form stays canonical; conversation is the fast path in. Removes
form-filling friction for repeat actions (new drop creation) and
blank-page paralysis for first-time setup (brand identity). Examples:
T9-11 (conversational drop creation), T9-12 (conversational brand
setup), T9-2-positioning (brand AI from uploaded assets).

Future direction — **Layer 4 — Ambient / voice input**: vendor speaks
or sends a voice note; platform transcribes, extracts intent, creates
a draft record. Closest near-term use case: post-service drop
scheduling ("same as last Friday, shift capacity to 45"). Not on the
immediate roadmap but architecturally continuous with Layer 3.

### The data foundation everything builds on

None of the intelligence layer works without clean data captured from
the first real order. Four fields are load-bearing:

1. **Customer postcode** — captured at checkout, stored on both
   `orders.customer_postcode` and the customer record. Enables all
   geographic demand scoring.
2. **Drop origin tag** — every `customer_relationships` row carries
   the `drop_id` of the originating order. Enables geographic
   segmentation ("customers who ordered from a Broadstone drop should
   hear about Broadstone drops").
3. **Recency** — `customer_relationships.created_at` plus
   `orders.created_at`. Enables lapsed/at-risk detection.
4. **Frequency** — order count per customer per vendor, derivable
   from `customer_relationships` + `orders`. Enables loyal core
   identification and habit-formation signals.

These four fields are already captured by the platform as of the T3-9
and T5-A3 workstreams. The intelligence layer can be built on them
without schema changes.

**Do not build geographic scoring or recommendation features on
synthetic test data.** Wait for Healthy Habits Cafe to run at least
two real drops before evaluating signal quality. The risk is building
a system that appears to work on test data but produces nonsense
recommendations in production because the signals are too thin.

### AI phasing principles

**Phase 0 (now — pre real data):** Generation layer only. Assets and
copy can be generated from structured drop data with no order history
required. T5-25 (menu card image), T5-C6 (activation plan), T9-12
(brand setup), T9-11 (drop creation fast-path) all belong here.
Build these now.

**Phase 1 (after first real drops, ~2–5 vendors):** Intelligence layer
V1. Geographic demand scoring, cadence signals, at-risk customer
flagging. T5-9, T5-C5, T9-6. Build once Healthy Habits has meaningful
order history and signal quality can be assessed against real data.

**Phase 2 (growing vendor base, ~10+ vendors):** Intelligence layer V2.
Cross-vendor patterns, archetype-aware recommendations, predictive
capacity scoring. T9-9, T9-10. Requires minimum cluster sizes to be
statistically meaningful. Do not build ahead of evidence.

**Phase 3 (scale, ~20+ vendors):** Ambient / voice input, fully
automated drop drafting, proactive host matching at platform scale.
T9-1 (auto-draft drops), T9-3 (proactive host identification). Gated
on the intelligence layer producing credible signals consistently.

### Conversational interface — governing principle

Conversational input is an **accelerant, not a replacement**. The form
stays canonical; the conversation is the fast path in. This distinction
is critical for three reasons:

1. **Editability.** Vendors need to correct what the AI got wrong.
   A pre-populated form is easy to adjust. A conversation that
   produced a wrong answer is awkward to undo.
2. **Latency tolerance.** A vendor who knows what they want does not
   want to wait for a conversation. The form is always faster for
   confident users. Conversation helps uncertain or first-time users.
3. **Auditability.** The record created by a conversation is identical
   to one created by form. No special handling required downstream.

The pattern for every conversational surface: natural-language input →
structured field extraction → vendor lands in the normal editor with
fields pre-populated → vendor reviews, adjusts, saves. The AI does the
first draft; the vendor owns the final state.

### Hard rules — apply to every AI feature across the platform

**SQL owns the facts. LLM owns the framing only.**
Prices, times, order counts, fill rates, references, postcodes, and
any other deterministic fact are computed by SQL and passed as
structured data to the LLM. They are never left to the model to
recall, infer, or generate. A model hallucinating an order total or
a wrong collection time inside copy is a trust-destroying failure.

**Never use AI to make capacity, pricing, or fulfilment decisions.**
These are vendor decisions. AI can surface signals and suggest options;
it cannot decide. The vendor is always the decision-maker.

**Output is always a draft pending vendor approval.**
No AI feature applies anything automatically. Every generated asset,
recommendation, or pre-populated record is presented for review before
being saved. The vendor's explicit action is required to commit.

**System prompts are fixed per call type; variable data goes in the
user message.**
System prompts explaining Hearth's vocabulary, tone, and the vendor's
archetype are stable per call type and should be prompt-cached. This
reduces cost and latency on every subsequent call of the same type.

**Client-side calls use the Anthropic API pattern established in the
platform.**
T5-25 Part 0 is the reference implementation. The API key is handled
by infrastructure — never exposed in client code.

**Server-side calls run inside Supabase Edge Functions.**
The Anthropic API key lives in Supabase secrets. Batch API should be
used for nightly pre-computation (T5-9). 50% cost reduction, no
quality tradeoff, latency is irrelevant for overnight jobs.

**Model selection: Haiku 4.5 for generation; Sonnet 4.6 for
reasoning-heavy tasks.**
Haiku 4.5 is the default for copy generation, template filling, and
structured extraction. Sonnet 4.6 for tasks requiring genuine
reasoning — brand positioning analysis, complex recommendation
synthesis, conversational intent extraction. Opus is not appropriate
for any current use case.

**Cost framing.**
At current Haiku 4.5 pricing, a typical generation call costs under
$0.000005. Even at 1,000 active vendors running multiple sessions
daily, API cost is not a meaningful constraint. Architecture decisions
should be driven by output quality, latency, and maintainability —
not cost optimisation.

*The GenAI shared principles block previously in this location is
superseded by this strategy document. Individual ticket specs
reference the Hearth AI Strategy section rather than restating
the principles.*

T5-9: Recommendation engine — matured intelligence

The matured form of T4-28 (intelligence engine). Extends hearth-intelligence.js with geographic demand scoring, host intelligence, and cross-category affinity matching, surfacing proactive recommendations directly inside Drop Studio and Home — not just in Insights after the fact.

**Architecture decisions (locked before build)**

Three decisions must be confirmed at the start of the T5-9 build session rather than left open:

(1) Postcode → coordinates via postcodes.io enrichment at write time. When a customer or vendor address is saved, call postcodes.io to retrieve lat/lng and write coordinates back to the relevant row. Enables proper proximity queries without full PostGIS adoption. PostGIS remains an option if spatial query volume warrants it later — postcodes.io is the pragmatic first step.

(2) Nightly materialisation via Edge Function cron. Demand scores, host performance summaries, and postcode cluster rankings are pre-computed and written to dedicated tables overnight. Intelligence surfaces read pre-computed rows — they do not scan raw order and customer data on page load. This is the correct architecture from the start; retrofitting materialisation onto a live-compute model is expensive.

(3) SQL owns signals, LLM owns framing. The SQL layer computes scores, gaps, fill rates, and trends. Those structured outputs are passed to Haiku 4.5 via the Anthropic API to generate the plain-English recommendation card copy. See GenAI shared principles above for hard rules.

**Geographic demand scoring — the moat primitive (Hearth_Strategy.md §11 Phase 5)**

This is the **foundational moat primitive** behind the geographic-clustering
recommendation — the single most important sentence Hearth can say: *"N of your
customers live in X."* It lives here (folded into T5-9), not as a standalone
ticket. Per §11 Phase 5 it must **degrade gracefully**, and the confidence tiers
below (Strong / Building / New territory) ARE that graceful-degradation
requirement in practice: below the data threshold the surface says *"not enough
data yet"* / *"Signals are building"* rather than inventing a number. **A
fabricated demand signal is a brand violation, not a UX gap** — honest empty
states are on-brand; confident wrong ones are not.

Customer clustering by outward postcode with recency and frequency weighting. Identifies the vendor's strongest demand areas from customer_relationships and order history. Output: ranked list of postcode areas with customer count, order history, and a confidence score (Strong / Building / New territory).

Drop Studio integration: Basics pane Audience Preview panel (T4-17) extended to show a plain-English recommendation — "Your strongest area is BH18 with 34 customers. Your last two drops there averaged 28 orders. Consider placing your next drop here." Recommendation fires when no host is selected and customer data exists.

Home dashboard integration: replaces the current generic next-action cards with demand-scored recommendations. Maximum 3 cards. Each card names the specific area, customer count, and a Create drop CTA pre-seeded with the postcode. Shows "Signals are building — run more drops to unlock recommendations" when data is insufficient.

data_posture awareness: data-rich vendors receive import-first and demand-targeting recommendations. Data-light vendors receive host-first or drop-first recommendations. This distinction must be explicit in the recommendation body copy.

**Host intelligence layer**

(1) Repeat host cadence recommendations. When a vendor has run 2+ drops at the same host, the engine analyses the gap between them and the fill rate trend. If drops at that host are filling well and the gap is longer than 14 days, the recommendation engine surfaces a cadence nudge: "Your last 3 drops at The Bell have averaged 87% capacity. You're running there monthly — could you explore fortnightly?" Cadence suggestion is context-aware: recurring event hosts (pub, sports club, workplace) get frequency nudges; one-off or event-type hosts (charity fundraiser, school fair) are excluded. Host type from the host_type field on the hosts table drives this distinction. Also surfaces multiple-window suggestions for eligible hosts.

(2) Same-type geographic host discovery. When a vendor has a successful host relationship (2+ drops, avg fill rate ≥ 70%), the engine recommends exploring similar host types in the same or adjacent postcode areas. Uses the vendor's existing host postcodes and the hosts table to identify host_type matches. Surfaces as a plain-English recommendation card with a "Draft introduction" CTA linking to T5-26. In V1 this uses host records already in the platform. V2 scope (do not build now): integrate with Google Places API to surface named nearby venues not yet in the platform.

(3) Cross-category affinity matching. Extends host discovery beyond same-type matching to audience alignment. A vendor's food category and positioning is matched against audience_description and audience_tags on the hosts table. Example: a healthy food vendor surfaces gym, sports club, and workplace wellness hosts as strong candidates even if those host types differ from the vendor's existing relationships. LLM-assisted matching is the mechanism — structured vendor and host profile data passed to Haiku 4.5, affinity scored and explained in plain English. Surfaced as a distinct recommendation card from same-type geographic discovery, with its own "Draft introduction" CTA linking to T5-26.

Dependency: T4-28 (intelligence engine — complete), meaningful customer and order data from real drops. Do not build geographic scoring on synthetic test data — wait for Healthy Habits Cafe to run at least 2 drops before evaluating signal quality.

T5-11: Comms engine V1 ✓ PARTIAL — T5-11-minimum (order_confirmed only) shipped 2026-05-16; slice 1 (interest-registrant ordering-open auto-email) shipped 2026-06-19; remaining triggers open.

**T5-11 slice 1 closure note (2026-06-19):** Interest-registrant
ordering-open auto-email shipped — `dispatch-interest-open` EF +
`comms_log` ledger, scheduled by a GitHub Actions pinger
(`.github/workflows/comms-dispatch.yml`, every 30 min). First
automated (non-transactional) demand-generation trigger and first use
of the `comms_log` send ledger. Establishes the comms engine spine
(Trigger → Audience → Template → Dispatch → Log) documented in CLAUDE.md
operational learnings.

**T5-11-minimum closure note (2026-05-16, PR #266):** Shipped a
narrowly-scoped first slice — `send-order-confirmation` Edge Function
invoked by `stripe-webhook` after `checkout.session.completed` flips
the order to placed/paid. Sends the order_confirmed transactional
email via Resend, calling the Resend HTTP API directly with
`RESEND_API_KEY`. Inter-function call authenticated by a shared
`INTERNAL_FUNCTION_SECRET` passed in the `X-Internal-Secret` header;
`verify_jwt = false` at the gateway because Stripe → webhook → send
has no user JWT. Email failures are non-fatal: the webhook catches,
logs structured JSON, and returns 200 regardless of email outcome so
a Resend outage cannot trigger Stripe webhook retries that would
re-place the order. No `comms_log` table yet — Edge Function logs
are the audit trail until full T5-11 ships.

This slice establishes two reusable patterns documented as
operational learnings #46 (application-level Resend integration) and
#47 (inter-Edge-Function shared-secret auth) in CLAUDE.md. Both
patterns are the templates for every remaining T5-11 trigger.

**Remaining T5-11 scope (still open):** order_ready automated SMS
(Twilio — supplements the existing T3-10 manual modal),
drop_announced, drop_reminder, drop_early_access (highest-leverage
retention mechanic per T5-C1), drop_closing_soon, post_drop_thank_you,
the `comms_log` audit table (customer_id, drop_id, trigger, sent_at,
channel, status — channel-agnostic from the start so SMS / WhatsApp /
email all share one schema), per-customer per-drop frequency caps,
consent gating, and the GenAI Haiku-4.5 body-copy generation layer
described below.

---

Event-driven transactional and demand generation messaging triggered by order and drop lifecycle events. Built on Supabase Edge Functions. Email provider is Resend (live since T5-11-minimum); SMS via Twilio is the remaining V1 channel for order_ready specifically.

**Update (May 2026 — from T5-C1 design session):**

Channel scope has been revised following the drop communications
architecture design session. Key changes to incorporate when building:

(1) WhatsApp as a parallel channel to email for drop_announced and
drop_reminder triggers. Where the customer has provided a phone number
with WhatsApp consent (captured at checkout per T5-C2), the platform
should route the drop announcement and reminder to WhatsApp in addition
to or instead of email, based on customer preference. WhatsApp
click-through rates (45–60%) significantly outperform email (2–5%) for
conversion-intent messages. The pre-written templates for each trigger
are specified in T5-C2.

(2) Automated SMS for order_ready as the default transactional path.
When the vendor marks an order Ready on the Service Board, an SMS fires
automatically to the customer's mobile number if one has been provided.
This supplements rather than replaces the existing manual T3-10 modal.
SMS is the correct channel here specifically because guaranteed delivery
matters — some customers will not have WhatsApp or may miss app
notifications in a busy collection environment.

(3) The early-access email (Thursday morning, 24 hours before public
ordering opens) to previous customers is a new trigger not currently in
the V1 spec. Add: drop_early_access — fires when a drop's ordering
window opens, sends only to customers who have previously ordered from
this vendor. This is the highest-leverage retention mechanic in the
communications architecture.

(4) Post-drop thank-you email (Saturday morning) with next drop date
is confirmed as a required trigger. This is already in the V1 spec as
the Saturday morning send. Ensure it surfaces the next scheduled drop
date for this vendor if one exists, with the early-access link.

Reference: Hearth_Drop_Communications_Architecture.md sections 4, 5,
and 11 for full channel rationale and trigger specifications.

**GenAI integration**

Email body copy is generated via the Anthropic API (Haiku 4.5) inside the Edge Function at send time, not from static string literal templates. Each trigger passes structured event data (order reference, drop name, timing, vendor name, host name where present, fulfilment mode) plus the vendor's brand voice settings from Brand Hearth to the API. The model generates the connecting prose and the framing of the message in the vendor's voice. Subject lines, CTAs, order references, times, and prices are deterministic — templated and rendered separately, never generated. See GenAI shared principles for hard rules.

The Anthropic API key lives in Supabase secrets alongside STRIPE_SECRET_KEY, RESEND_API_KEY, and INTERNAL_FUNCTION_SECRET. The Edge Function pattern is the same as invite-vendor and create-stripe-connect-link.

**Transactional triggers (V1 scope — email only)**

order_confirmed: ✓ SHIPPED 2026-05-16 as T5-11-minimum (PR #266). Fires from `stripe-webhook` after `checkout.session.completed` (not from order insert — the insert happens during pending_payment, before money has actually moved). Sends to customer email if present. Contains order reference, items ordered, fulfilment mode, collection point or delivery address, drop timing. Vendor-branded with display_name and brand_primary_color. Implemented in `supabase/functions/send-order-confirmation`. NOTE: implementation pre-dates the GenAI integration above — body copy is currently deterministic templated HTML, not AI-generated. The Haiku 4.5 body-copy layer is part of the remaining T5-11 work and would be retrofitted onto this trigger alongside the other triggers.

order_ready: fires when Service Board operator marks order as Ready (the same event that currently opens the T3-10 notification modal). Sends to customer if email present. Supplements rather than replaces the manual modal — operator still sees the modal, email sends automatically in parallel.

drop_closing_soon: fires 2 hours before closes_at for any live drop with orders placed. Sends to consented customers (contact_opt_in true) who have not yet ordered this drop. Maximum one per customer per drop.

**Proactive demand generation triggers (V1 scope — email only)**

drop_announced: fires when a drop status changes to scheduled or live. Sends to all consented customers who have previously ordered from this vendor OR who have previously ordered at this host (if the drop has a host). Maximum one drop_announced message per customer per drop.

drop_reminder: fires 24 hours before closes_at for drops with remaining capacity. Sends only to consented customers who have NOT yet placed an order for this drop. Maximum one drop_reminder per customer per drop.

**Hard rules**

Maximum 2 automated messages per customer per drop across all non-transactional triggers combined (drop_announced + drop_reminder). Transactional messages (order_confirmed, order_ready) do not count toward this limit. Only send demand generation messages to customers where contact_opt_in is true on at least one previous order from this vendor. consent_status on customer_relationships must be 'granted' or 'imported'. Vendor-sourced imported customers (T4-14) are eligible if lawful_basis was declared at import. Host-audience targeting requires explicit host consent chain — flagged for T5-18, do not implement cross-vendor host targeting in V1. All sends logged to a new comms_log table (customer_id, drop_id, trigger, sent_at, channel, status) — design channel-agnostic from the start so SMS can be added without schema changes.

Infrastructure required before building: T6-1 (domain — lovehearth.co.uk must be live for sender addresses), T6-6 (Postmark configured with SPF/DKIM/DMARC).

Dependency: T3-9 (customer capture — complete), T6-1, T6-6.

T5-C1: Pre-drop customer engagement — research brief

**Status:** ✓ CLOSED May 2026. Research brief delivered.

**Closure note (May 2026):** Design session completed in Claude Chat.
Full communications architecture design brief produced and saved as
Hearth_Drop_Communications_Architecture.md in project files. Covers:
foundational anticipation insight, channel roles and hierarchy (social /
WhatsApp / email / SMS), nine-touchpoint weekly drop playbook with every
message scripted and attributed, WhatsApp host/vendor activation model,
Phase 1 vs Phase 2 WhatsApp approach and UK Coexistence constraint,
customer segmentation model by drop origin and postcode, post-drop
content strategy, habit formation principles, and full platform
enablement requirements. Output has spawned five new backlog tickets:
T5-C2, T5-C3, T5-C4, T5-C5, T5-C6. T5-11 and T5-25 updated with
findings. T5-2 retired.

Tier 5. Research ticket, not a build ticket. Should be completed before T5-11 (comms engine) is extended beyond its current transactional scope.

The comms engine (T5-11) specifies what to send and when in a mechanical way: order confirmed, drop announced, drop reminder. That is the baseline. What it does not answer is the deeper question: what does the evidence say about optimal pre-event engagement strategies, and how does that apply to the Hearth context specifically?

Hearth drops have a natural narrative arc that most food brands do not: announced → building → closing → live → fulfilled. Each stage is a legitimate engagement moment. But what is the right number of touchpoints? What channel mix performs best for different vendor archetypes? What creative approaches drive genuine anticipation rather than inbox fatigue? What can be learned from adjacent industries — ticketed events, subscription commerce, farmers market pre-orders, community commerce — about pre-purchase engagement that builds excitement rather than noise? The Domino's SMS model (high frequency, low relevance, broadly ignored) is the anti-pattern.

Scope: review emerging evidence on pre-event engagement timing and sequencing; identify the channel mix most appropriate for Hearth's vendor archetypes (WhatsApp, email, SMS — and when each is appropriate); review personalisation techniques relevant to the Hearth data model (postcode clustering, recency, loyalty segment, host context); identify what Hearth's owned customer data enables that rented-list platforms cannot replicate; produce a design brief covering recommended touchpoint sequence, channel guidance, creative principles, and hard rules (e.g. maximum messages per customer per drop across all non-transactional channels).

Output: a design brief document, not code. This is a Claude Chat research task, not a Claude Code build task. Conduct as a dedicated research session using web search and synthesis.

Dependency: none. Can run in parallel with ongoing platform build work. Does not block any current Tier 1–6 priorities.

T5-C2: WhatsApp activation system — templates, segmentation, consent,
and broadcast management

**Status:** Open. Tier 5. Post-launch — the Phase-1 comms shape
(comms-engine email to the vendor's own customers + a wa.me deep-link into
the host's existing group, per the 2026-06-19 steer note) covers launch;
the full WhatsApp template/consent/broadcast system is post-launch and not
a launch blocker.

**The problem**

The communications architecture specifies nine touchpoints across five
days for each drop. Five of those touchpoints involve WhatsApp — three
from the vendor's own number, two from the host's. Currently the
platform provides none of the infrastructure to support these touchpoints:
no template library, no customer WhatsApp consent capture, no broadcast
management, no segmentation. Vendors are left to do this entirely manually
with no guidance, no pre-written copy, and no visibility of which customers
are relevant for which drop.

**Scope — four components**

**(1) Pre-written message template library**

Every WhatsApp touchpoint in the drop cycle has a pre-written template
generated automatically from drop data. Vendors and hosts never write
from scratch. Templates are generated at the point of drop publication
and stored against the drop record.

Required templates:
- Tuesday host community message: warm, in the host's voice, names the
  vendor, the venue, the food description, the ordering-open time, and
  the capacity. Reads as the host talking to their members, not a
  platform notification.
- Thursday ordering-open message (vendor to customers): short, direct,
  link prominent, slot count visible, kitchen close time included.
- Thursday host link message: second, shorter host message — just the
  live link and remaining slot count.
- Friday order-ready message: transactional, venue name, collection
  window close time.

All templates are surfaced in a "Communications" tab or panel on the
drop card in Drop Studio. The vendor and host see their respective
templates, can edit them, and can copy to clipboard with one tap.
The platform also surfaces a prompted broadcast workflow (see component
4 below).

**(2) Phone number capture with WhatsApp consent at checkout**

Extend the checkout flow on order.html to capture mobile number with an
explicit WhatsApp consent field, distinct from the existing email
marketing opt-in. The two consents must be captured and stored
separately.

WhatsApp consent language: "Get WhatsApp updates about upcoming drops
from [Vendor Name] near you."

The phone number field should already exist from T4-8 (order form
enhancements). Verify that T4-8 captures phone number to the orders
table or customers table. If not already present, add it. The WhatsApp
consent flag should be stored on customer_relationships as a new boolean
column: whatsapp_opt_in (default false). Schema change required — Ed
to run via SQL editor before build begins.

**(3) Customer geographic segmentation by drop origin**

Every customer record must carry the drop they first ordered from and
the outward postcode they provided. These two data points are the
foundation of the geographic segmentation model.

The drop origin tag should already be capturable from T3-9 (customer
capture — complete) since every order belongs to a drop. Verify that
customer_relationships stores the drop_id of the originating order.
If not, add it.

From these two fields, the platform derives: which vendor, which host,
which geographic area, which drop type. This enables the targeting rule:
customers who ordered from a Broadstone drop should receive
communications about Broadstone drops; customers who ordered from a
Canford Heath drop should receive communications about Canford Heath
drops.

Broadcast segmentation surface: when a vendor goes to send a drop
announcement, the platform automatically filters the relevant customer
segment based on the new drop's location and surfaces: "Based on this
drop's location, [X] customers have ordered from nearby drops. Send
announcement to this group?" The vendor reviews and approves before
any message is sent. The platform does the filtering; the vendor owns
the decision.

**(4) Prompted broadcast workflow**

When a drop reaches each communication trigger point, the platform
surfaces a prompt to the vendor with the pre-drafted message ready to
send. One tap to execute. The vendor owns the decision; the platform
does the preparation.

Trigger points:
- Drop published → "Send your Tuesday host message?" (shows host
  template, host contact details, copy button)
- Ordering opens → "Send your ordering-open WhatsApp?" (shows vendor
  customer template, customer count, copy button)
- Drop reaches 80% capacity → "Let your audience know — almost full"
  (shows capacity signal template for social/WhatsApp)
- Drop completes → "Share the moment?" (shows post-drop social template,
  prompts for a photo)

The broadcast workflow surfaces in the drop card actions panel in
Drop Studio, not as a separate page. Notifications can also be
surfaced via the Home dashboard Today strip for live drops.

**Schema changes required before build (Ed to run via SQL editor):**
```sql
-- WhatsApp consent on customer_relationships
ALTER TABLE customer_relationships
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opted_in_at timestamptz;

-- Drop origin on customer_relationships (if not already present)
ALTER TABLE customer_relationships
  ADD COLUMN IF NOT EXISTS source_drop_id uuid REFERENCES drops(id);
```

Verify whether source_drop_id already exists before adding.

**Dependencies:** T3-9 (customer capture — complete), T4-8 (order form
enhancements — complete). T5-11 (comms engine) will route automated
sends through the consent model captured here.

**Cross-reference:** T5-C1 (closed — design brief), T5-C3 (Phase 2
WhatsApp API integration), T5-11 (comms engine — consumes WhatsApp
consent data), Hearth_Drop_Communications_Architecture.md sections 7
and 8.

T5-C3: WhatsApp Business API integration — Meta Tech Provider programme

**Status:** Open. Tier 5. Phase 2 infrastructure — do not build until
Phase 1 (WhatsApp Business App broadcast lists, managed via T5-C2) has
been proven with multiple vendors running consistently. Gated on UK
WhatsApp Coexistence becoming available.

**The problem**

Phase 1 (T5-C2) enables vendor WhatsApp activation through manual
broadcast lists using the free WhatsApp Business App. This is correct
for the first 6–12 months. Two constraints will eventually trigger
Phase 2:

(1) WhatsApp Business App broadcast lists cap at 256 contacts. A vendor
who builds a customer base beyond this cannot broadcast to their full
list from within the app.

(2) The Phase 1 workflow requires the vendor to manually copy and paste
the pre-written template and send it from their own WhatsApp. Hearth
cannot trigger the send from within the platform. Phase 2 enables the
platform to initiate the broadcast, with the vendor approving in one
tap, and the message arriving from the vendor's own registered number.

**The mechanism — Meta Embedded Signup**

Hearth becomes a Meta Tech Provider (ISV). This involves registering
a Meta app and having it approved (typically 3–4 weeks), accepting a
partner solution link with a Business Solution Provider (BSP) such as
Twilio, and completing the technical Embedded Signup integration.

The vendor flow: vendor clicks "Connect WhatsApp" in their Hearth
account → a Meta-hosted OAuth popup opens → vendor connects their
business number → Meta verifies with a one-time code → popup closes →
Hearth is granted permission to send on the vendor's behalf via the API
→ messages arrive from the vendor's own registered number.

The vendor's WABA (WhatsApp Business Account), phone number, and
Business Portfolio remain owned by the vendor. Hearth is granted
access. If the vendor ever leaves, their assets stay with them.

**Critical UK constraint — Coexistence**

WhatsApp Coexistence — the feature allowing a vendor to use WhatsApp
Business App for personal conversations while the API sends broadcasts
from the same number — is not currently available in the UK. Until it
is, Phase 2 requires vendors to use a dedicated second number for API
broadcasts, separate from their personal WhatsApp number. This is
significant friction and is the primary reason Phase 2 must not be
rushed. Monitor Meta's Coexistence rollout; UK availability is expected
within 12 months of May 2026.

**Template pre-approval**

WhatsApp Business API marketing messages require pre-approved templates
from Meta. For Hearth's use cases this is not a significant constraint
— the drop announcement messages are highly consistent. Submit the
four core templates from T5-C2 once; every vendor uses them. Approval
typically takes 24–48 hours.

**Cost model**

As of July 2025, Meta charges per delivered message for marketing
broadcasts. UK rates approximately £0.02–0.05 per message. For a
vendor sending to 100 customers, this is £2–5 per drop activation.
Cost is low relative to drop GMV; pass through to vendors transparently
rather than absorbing into platform margin.

**Trigger for building Phase 2**

Build when any of the following are true:

- A vendor's WhatsApp customer list exceeds 256 contacts
- UK WhatsApp Coexistence becomes available
- Hearth has 5+ vendors running consistently and operational value of
  platform-triggered sends is confirmed from vendor feedback

Do not build ahead of this trigger. Phase 1 is sufficient until then
and the Coexistence constraint makes Phase 2 a poor vendor experience
in the UK market today.

**Dependencies:** T5-C2 (Phase 1 WhatsApp system — Phase 2 is additive
to Phase 1, not a replacement). UK WhatsApp Coexistence availability.

**Cross-reference:** T5-C1 (closed — design brief),
Hearth_Drop_Communications_Architecture.md section 7 (Phase 2 detail).

**WhatsApp API — PARKED post-launch (steer note, 2026-06-19).** When
this work is picked up: Twilio first (one integration covers SMS +
WhatsApp via a single BSP), 360dialog later (zero per-message markup at
volume). Drop comms fall under Meta's Utility category (cheap; only UK
Marketing-category pricing is pricey). The realistic Phase-1 shape with
no API: email for the vendor's OWN customers (the comms engine sends it),
and a `wa.me` deep-link into the HOST's existing group (one tap). The
only clunky pre-API path is vendor broadcast-to-own-customers — don't
centre the design on it.

T5-C4: Drop activation guide — vendor-facing communication playbook

**Status:** PARTIAL (2026-05-30). Tier 5. Should land before Healthy
Habits Cafe goes live — vendors need to understand the activation model
before their first drop, not after.

T5-C4 PARTIAL 2026-05-30 — Review pane promotion plan checklist
shipped (signals for host and previous customers, "Go to Activation →"
handoff). Standalone guide page (drop-activation-guide.html) remains
open — build after the first real drop so the guide reflects actual
experience.

**The problem**

The platform gives vendors the tools to run a drop. It does not yet tell
them how to maximise the chance that drop fills. A vendor who publishes
a drop and shares the link once on Instagram, then waits, will likely
underfill. That underfill will damage their confidence in the model and
produce weak learning data. The gap is not capability — the tools are
there. The gap is education: vendors need to understand the activation
sequence, why each step matters, and what the platform does to help them
execute it.

This is not a marketing problem. It is an operational one. Filling a
drop consistently is a learnable behaviour. The platform should teach it.

**What the guide must cover**

The guide explains the drop communication cycle in plain, practical
language. Structured around the three-act model: anticipation (before
ordering opens), activation (during the ordering window), and nurture
(after the drop). For each act: what to do, which channel, why it
works, what the platform prepares automatically versus what the vendor
must do.

The five things every vendor must understand before their first drop:

(1) Announce the menu before ordering opens. Post the menu to social
media 4–5 days before the drop — not a link to order, just the menu.
This starts the anticipation period and seeds the algorithm. The
platform generates a menu card image automatically (T5-25). The vendor
just shares it.

(2) Activate through the host, not around them. The host's WhatsApp
group is the highest-quality audience for a community node drop. A
message from the host carries more trust than any vendor broadcast.
The platform generates the exact message for the host to copy and
paste (T5-C2). The host's only job is one tap.

(3) Give previous customers early access. The early-access email goes
to previous customers 24 hours before the public link. They get first
choice of limited capacity. The platform sends this automatically
(T5-11).

(4) Tell people when ordering opens via WhatsApp. When the ordering
window opens, a WhatsApp message to opted-in customers outperforms
every other conversion channel. The platform prepares the message; the
vendor sends in one tap (T5-C2).

(5) Close the loop after the drop. A post-drop social moment and a
Saturday morning email with the next drop date are the most effective
tools for building the habit that makes the next drop easier to fill.
The platform prepares both; the vendor approves and sends (T5-11,
T5-25).

**Where the guide surfaces — three integration points**

(1) Drop Studio — first-drop guidance card (extends T4-23). When a
vendor is creating their first drop, the existing T4-23 guidance card
is extended with a "How to fill this drop" section introducing the
five-step activation approach in 3–4 sentences with a link to the
full guide.

(2) Drop Studio — Review pane readiness checklist. Add a "Promotion
plan" row to the review checklist alongside Basics, Timing, Menu,
Capacity, Commercials. Not a hard publish gate — a soft prompt. Shows:
whether a host is assigned (host WhatsApp activation available),
whether there are previous customers (early-access email will send),
whether a social caption is ready (link to T5-25 copy generator).
Each row links to the relevant platform tool.

(3) Standalone guide page (drop-activation-guide.html or equivalent).
Dedicated page explaining the full five-step sequence in depth. Written
in Hearth's plain, vendor-first tone — not platform documentation, not
a marketing pitch. An operational guide for a professional food
business. Accessible from the operator nav as a utility link and
linked from the Review pane checklist.

**Tone and language principles**

Feels like advice from a trusted operator, not instructions from a
platform. Use concrete examples: "your Friday drop at the cricket club"
not "your community node drop event." Lead with what works and why,
not with what the platform does.

Avoid: "optimise your conversion", "maximise engagement", "leverage
your customer base", "utilise the platform."
Use: "fill your drop", "your customers", "before ordering opens",
"the host's group", "the morning after."

**Build scope — two parts, ship independently**

Part 1: Drop Studio integration (Review pane checklist row + T4-23
first-drop guidance card extension). Client-side only. No new page,
no Edge Function. Bounded one-session piece of work.

Part 2: Standalone guide page. New HTML page, vendor-nav.js updated
with a utility link. No Supabase queries. One session. Recommended
after the first real drop so the guide can be reviewed against actual
experience before being shown to subsequent vendors.

**Dependencies:** T4-23 (first-drop guidance card — complete). T5-25
(social copy generator — referenced in Review pane, not required for
checklist to ship). T5-C2 (WhatsApp template system — referenced in
guide, manual approach documented until T5-C2 ships).

**Cross-reference:** T5-C1 (closed — this ticket is the vendor-facing
output of that research), T5-C2, T5-C3, T5-11, T5-25, T4-23,
Hearth_Drop_Communications_Architecture.md section 11 and the full
weekly rhythm table.

T5-C5: Cadence visibility and consistency mechanics

**Strategic reframe — Engine 1 · Productise the coach (Hearth_Strategy.md
§12.3).** This is the ticket that operationalises the "Repetition Layer"
coaching, and it is **the first throughput unlock.** Human coaching through
the first ten drops is currently what stops vendors churning; encoding it
removes our largest recurring human cost. The copy is **already written** in
Hearth_Repetition_Layer_Voice_Spec.md — the scorecard variants, the
cadence-drift line, the "what's normal at drop three" reassurance — so this
is an encoding job, not an authoring one. **Hard dependency: this must land
before self-serve onboarding (§12.3 Engine 2).** Onboard vendors at volume
before the coach is encoded and they churn in the fragile weeks with nobody
holding them — the one sequencing error that would actively hurt us. Sits
**below the stop line** (§11 Phase 5, the primary moat investment); building
this coach *is* part of the scaling solution, not a nice-to-have. (Named
"Cadence visibility and consistency mechanics" historically; that is the
same work as Engine 1.)

**Status:** Open. Tier 5. Part 1 can ship early (Home dashboard and
scorecard enhancements — no new Edge Functions). Part 2 (gap alert
notifications) depends on T5-11 comms engine.

**The problem**

Research on habit formation establishes that customer habits form only
when the same contextual cues (same vendor, same day, same time, same
host) repeat consistently across 8–10 drops. A vendor who skips weeks,
changes their drop day, or treats each drop as a standalone event
actively prevents the habit from forming — regardless of how good the
individual drops are.

The platform currently has no mechanism that makes cadence visible,
celebrates consistency, or actively nudges vendors back onto rhythm when
they drift. Vendors who don't understand why consistency matters will
treat drops as isolated events. This ticket changes that framing.

**Six mechanics to build**

(1) Drop rhythm indicator on Home dashboard. A simple, persistent
signal showing: consecutive drops at this cadence, average gap between
drops, and a plain-English health signal. Three states:

- Strong: "You've run [X] consecutive [Friday] drops. Your customers
  are building a habit."
- Building: "You're [X] drops into your rhythm. Keep going — habits
  typically form after 8 consistent drops."
- Needs attention: "Your last drop was [X] days ago. Your customers
  may be starting to drift. Scheduling your next drop now will protect
  the momentum you've built."

The indicator sits in the Today strip or as a dedicated card in the
Home dashboard. It is always visible, not buried in Insights.

(2) Series as default path in Drop Studio. Currently a recurring series
is an enhancement — the vendor must choose it explicitly. Invert this.
When a vendor creates a new drop, the first question should be "Is this
a recurring drop or a one-off?" with recurring as the encouraged option.
Copy: "Most vendors who build consistent customer habits start with a
recurring series. A one-off is fine for events — for your regular drops,
a series keeps your customers expecting you." The one-off path remains
available but is not the default.

(3) The 8-drop progress signal. Surface the "8 drops to habit"
framework as a visible, honest progress mechanic on the Home dashboard
and scorecard. Not gamification — just context. Show progress through
the first 8 drops: "Drop [N] of 8 — you're building toward a rhythm
your customers will rely on." When a vendor completes drop 8, a quiet
acknowledgement: "Your customers have now seen you show up consistently.
The habit is forming." After drop 8, the progress signal retires and
the rhythm indicator takes over.

(4) Next-drop CTA on every scorecard. T4-12 (scorecard — complete)
surfaces after every completed drop. Extend it with a prominent
"Schedule your next drop" CTA, pre-seeded with the date that would
maintain the vendor's established cadence. If they run every Friday,
suggest next Friday. If no cadence is established, suggest the same
day of the following week. One tap opens Drop Studio with the date
pre-populated. The moment immediately after a good drop is the
highest-motivation moment for a vendor to commit to the next one.

(5) Gap alerts — proactive cadence nudges. When a vendor does not have
a drop scheduled within their typical cadence window, the Home dashboard
surfaces a quiet but clear prompt: "You haven't scheduled your next
[Friday] drop yet. Based on your pattern, [date] would keep your rhythm
going. [Schedule now →]" Not alarming or aggressive — just visible.
The platform knows the pattern; it should use it. Part 2 of this
ticket — depends on T5-11 for email/WhatsApp delivery of the nudge
beyond the dashboard.

(6) Customer habit signals. Show vendors when individual customers are
forming repeat habits. Surface on the Customers page and Home dashboard:
"[N] customers have now ordered from [X] or more consecutive drops.
Your regulars are forming a routine." Calculated from order history
per customer. This is the moment that makes the model feel real to a
vendor — seeing that specific people are now relying on their drops
transforms cadence from a platform recommendation into something the
vendor feels personal responsibility toward.

**Build scope — two parts**

Part 1 (no T5-11 dependency): Drop rhythm indicator (1), Series as
default path (2), 8-drop progress signal (3), Next-drop CTA on
scorecard (4), Customer habit signals (6). All client-side enhancements
to Home dashboard, Drop Studio, and scorecard. No new Edge Functions.
Two sessions estimated.

Part 2 (depends on T5-11): Gap alerts delivered via email or WhatsApp
when a vendor drifts from their cadence. One additional T5-11 trigger:
drop_cadence_gap — fires when a vendor has no drop scheduled within
their typical cadence window plus a 3-day grace period. One session.

**Dependencies:** T4-12 (scorecard — complete), T4-4 (Home dashboard
— complete), T4-1 (recurring series — complete), T5-11 (for Part 2
gap alert delivery only).

**Cross-reference:** T5-C1 (closed — design brief),
Hearth_Drop_Communications_Architecture.md section 10 (habit formation
principles), T5-C6 (vendor activation plan — sets the expectation that
T5-C5 mechanics then reinforce throughout the vendor's journey).

Vendor-facing copy authored in Hearth_Repetition_Layer_Voice_Spec.md (canonical repetition-layer voice spec).

T5-C6: AI-powered vendor activation plan

**Status:** Open. Tier 5. Should surface at the end of onboarding —
before the vendor touches Drop Studio for the first time. Can ship
once T5-13 (onboarding — complete) and T4-28 (intelligence engine —
complete) are confirmed stable and Healthy Habits has been onboarded.

**The problem**

Onboarding captures rich, structured data about every vendor: their
archetype, operating model, primary goal, existing host relationships,
customer data posture, geographic area, food category, and social
presence. This data currently feeds into archetype detection and generic
recommendation cards.

It does not produce a forward-looking activation strategy. A vendor who
completes onboarding today receives no clear answer to: "So what exactly
should I do first, and in what order?" The gap between onboarding
completion and first drop is the most fragile moment in the vendor
journey — motivation is high but direction is unclear. This ticket fills
that gap with a tailored plan generated from the vendor's own onboarding
answers.

**What the plan contains — five sections**

(1) Where to start. Which drop format to launch with first, and why.
Specific to archetype and operating model:

- Cafe/restaurant moving away from aggregators (e.g. Healthy Habits):
  community node drop at a known host with an existing audience.
  Start with one host you already have a relationship with.
- Food truck: host-led drop at a pub or sports club to provide
  guaranteed footfall context before attempting open neighbourhood drops.
- Artisan producer (butcher, baker): seasonal or occasion-led drop
  with high natural demand. Christmas hampers, summer BBQ box, etc.
- Caterer: single-payer catering drop (T3-13) — simpler mechanics,
  lower consumer behaviour change required.
- Pop-up/chef: community fundraiser or school event context —
  introduces the vendor to a warm, captive audience.

(2) What capacity to set. A conservative starting point based on
archetype and recommended format. First drops should always
underpromise and overdeliver. Framing: "Start with [X] capacity.
Better to sell out and build demand than to underfill and lose
confidence in the model."

(3) Who to approach first. Specific host types to target based on
food category and operating model. If the vendor flagged existing host
relationships in onboarding, those are referenced first. Otherwise,
platform recommends relevant host types in their area. Framing:
"Your food and your community fit [host type] audiences well. Start
with any you already know, or explore the Hosts directory when you're
ready."

(4) The first 8 drops — milestone structure. A simple, honest
progression:

- Drops 1–2: Prove the mechanics. Fill rate matters less than
  learning how the drop feels to run and how customers respond.
- Drops 3–4: Repeat the same host and day. First returning customers
  will appear. This is evidence the model is working.
- Drops 5–6: Cadence becomes visible to customers. Some will start
  ordering before the announcement. That is the habit forming.
- Drops 7–8: The habit is embedding. Customer acquisition cost is
  falling. The owned asset is growing. Now is the time to consider
  whether to expand to a second host or increase capacity.

(5) What the platform does automatically. Explicitly list the parts
of the activation model that require no vendor action: early-access
email to previous customers (T5-11), order confirmation email (T5-11),
post-drop thank-you email (T5-11), customer asset building from every
order (T3-9). Vendors should know what they don't need to think about.

**Where it surfaces**

Primary: End of onboarding, immediately after the vendor completes
setup. Full-screen moment before they enter Drop Studio for the first
time. Framing: "Here's your activation plan, built around how you
want to operate." One CTA: "Go to Drop Studio →"

Persistent: Home dashboard "Your activation plan" card, visible and
collapsible until the vendor completes drop 8. After drop 8 the card
retires — they've graduated.

**AI architecture — follows GenAI shared principles**

Client-side Anthropic API call (Haiku 4.5). Structured onboarding data
in, plain-English plan out. The plan is generated once at onboarding
completion and stored — not regenerated on every page load.

Inputs to the API call (all deterministic, passed as structured data):
vendor archetype from detectArchetype(), primary_goal,
delivery_model, existing_host_contexts, customer_data_posture,
social_handles presence (boolean), food category cues from brand
data, geographic area from vendor address outward code.

The model generates the connecting prose and framing for each of the
five sections. Specific numbers (recommended capacity, milestone drop
counts, host type names) are rendered deterministically from the
structured inputs — never generated. See GenAI shared principles in
BACKLOG.md for hard rules.

The plan explicitly avoids claiming knowledge it doesn't have. Where
the model cannot give a specific recommendation (e.g. exact drop dates,
specific venue names), it frames the guidance in principles and defers
to vendor judgement: "We don't know your specific area yet. Run your
first drop and we'll start to learn together."

**Storage**

The generated plan is stored as a JSON blob on the vendors table
(activation_plan jsonb, nullable) at onboarding completion. This
avoids regenerating on every Home dashboard load and lets the plan
be updated as the vendor progresses. Schema change required — Ed to
run via SQL editor:

```sql
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS activation_plan jsonb,
  ADD COLUMN IF NOT EXISTS activation_plan_generated_at timestamptz;
```

**Dependencies:** T5-13 (vendor onboarding — complete), T4-28
(intelligence engine and detectArchetype() — complete), T5-C5
(cadence mechanics — T5-C6 sets the expectation that T5-C5 then
reinforces throughout the vendor journey). GenAI shared principles
(BACKLOG.md) apply.

**Cross-reference:** T5-C1 (closed — design brief), T5-C4 (vendor
activation guide — the guide explains the activation model to vendors;
this ticket generates a personalised plan from their specific situation),
T5-C5 (cadence mechanics — the two tickets form one coherent arc from
"here is your plan" through to "here is how you are doing against it"),
T4-23 (first-drop guidance card — T5-C6 supersedes T4-23's first-drop
guidance with a fully personalised plan).

**Note — deferred scope and manual precursor (2026-06-16):**

Two extensions are explicitly out of scope for T5-C6 as specced, recorded here
so they aren't lost:

(1) Online-presence ingestion. T5-C6 reads social-handle presence as a boolean
only — it does not look at what's on a vendor's Instagram, website, or local
listings. Ingesting that content as a real input (to surface vendor-specific
ideas a person would spot) is a later, larger piece — likely Sonnet-with-vision
plus a research step, adjacent to T9-2-positioning. Not in V1.

(2) Welcome-email surface. T5-C6 surfaces in-app (onboarding completion + Home
card). Delivering the plan — or a slice of it — as a vendor welcome email is a
separate surface owned jointly with the comms engine (T5-11), not built here.

Manual precursor: T-support-activation-ideas is the off-system version Rob/Ed
run for the first vendors — it does the online-presence research a person can do
today and T5-C6 can't, and its runs are the pattern library T5-C6's generation
should later draw on.

Vendor-facing copy authored in Hearth_Repetition_Layer_Voice_Spec.md (canonical repetition-layer voice spec).

T5-12: Vendor customer data import — advanced
Extend T4-14 to support connections to existing vendor systems: email
platforms, booking systems, POS exports. Two vendor pathways: data-rich
vendors fast-track to recommendations, data-light vendors build through
drops.

T5-13: Vendor onboarding — two distinct pathways ✓ COMPLETE
Structured onboarding journey capturing vendor identity (business name,
phone, website), operating model, customer data posture, geographic
context, existing host relationships, and operating preferences.
Two-pathway logic implemented: data-rich vendors routed toward customer
import and demand targeting; data-light vendors routed toward host-led
first drop. Onboarding preferences written to vendors table and
pre-populate Brand Hearth automatically. Revisitable at any time via
Setup in nav.

T5-14: Home page — demand orchestration dashboard
Major evolution from workspace landing to decision dashboard. Above fold:
audience size, strongest demand cluster, next recommended drop, drop
health, action status. Replace conceptual panels with tactical signals.
Add workspace cards for Audience, Hosts, Comms. Dependency: T3-9,
T4-16, T5-9.

Strategic framing: a vendor using Hearth at maturity does not just
operate a location — they operate a network of customers, communities,
and demand that can be activated in different places, at different times,
in different ways. This dashboard is where that network becomes visible
and actionable.

T5-15: Insights — demand and audience intelligence layer
The intelligence layer is now partially built inside Insights via
archetype-aware recommendations (T4-3). This ticket covers extracting
and maturing that logic into the shared intelligence engine (T4-28) and
extending it to the Customers page (T4-27) and Home dashboard (T4-4).

Remaining scope: customer growth trend, repeat rate over time, postcode
cluster analysis, strongest areas, host performance, vendor vs host
sourced demand, recommended next actions surfaced across all three
consumer pages. Dependency: T4-28, T4-27, T4-16.

Strategic framing (reframed per Hearth_Strategy.md §12.3 Engine 3 and
§9.3): Insights is **not a dashboard or a reporting layer.** A dashboard
reports what happened and leaves the vendor to work out what to do —
closing that gap is our differentiation. Two things this surface actually
is:

1. **The recommendation surface (§12.3 Engine 3 — "the intelligence layer
   sells the drop").** Plain-English signals, not charts: *"140 of your
   customers live in Broadstone. That's a Friday drop."* Sentences a vendor
   can act on, derived honestly from their own data and degrading gracefully
   ("not enough data yet") below the threshold. This is the only mechanism
   that lets vendor number twenty convert with no founder in the room — and
   it is the same build as the moat.
2. **The mechanism that converts the free tier (§9.3 — "graduation becomes
   the intelligence layer's explicit job").** Not passive reporting — active
   pressure: *"You now have 140 customers in Broadstone. That's a drop."*
   Repeated, patiently, until they run one. This is how a capture-only /
   window vendor graduates to drops (the moment Hearth actually earns), so
   the surface is a revenue mechanism, not a read-only report.

Design ref / governing scope: Hearth_Insights_Intelligence_Layer_Scope.md — voice,
drop-granularity discipline, honesty gate; defers T4-29.

T5-16: Organisations — shared entity for hosts and communities
Introduce an organisations table as the parent entity for both hosts and
communities. Fields: id, name, type (host/community/both), category,
location, audience_size, description, contact details, created_at.
Existing hosts table gains organisation_id foreign key. Communities
reference the same table. Schema and migration only, no UI required at
this stage. Dependency: T4-16.

T5-17: Communities — first-class entity
Community profile: name, parent organisation, audience size, type, dietary
context, communication channels, collaboration terms, revenue share
willingness. Community management page in operator nav under new
Organisations section. Vendors can view communities and express interest
in collaborating. Dependency: T5-16.

T5-18: Community consent and permissions model
Consent chain required before vendor can target a community: organisation
consent plus individual member consent tracked via customer_relationships
with source = community_invite. Consent status field on community record
(pending/active/suspended). No vendor can access a community audience
without active consent status. GDPR compliance is a hard requirement.
Dependency: T5-17.

T5-19: Community-to-vendor matching and discovery
Vendor-facing discovery interface surfacing relevant communities by food
type, location, drop history. Match score based on proximity, category
alignment, audience size, consent status. Vendor can express interest —
triggers notification to community contact. Dependency: T5-18.

T5-20: Community-sourced drops
Drop Studio gains community targeting option alongside host linking. Drop
communications go to consented community members through available
channels. Community context shown on drop card. Capacity optionally
reserved exclusively for community members. Dependency: T5-19, T5-11.

T5-21: Multi-vendor accounts
One auth account owning multiple vendor workspaces. When resolveVendor()
finds more than one vendor row linked to a session, show a vendor picker
before entering the platform. Schema already supports this — auth_user_id
on vendors means one user can own multiple rows. Deferred: one account =
one vendor for now.

T5-22: Catering business flow ✓ COMPLETE 2026-07-14
Shipped and confirmed complete via the backlog reconciliation audit
(audit/findings-backlog-reconciliation.md); the ticket line was stale (it still
read as spec-before-build while the full stack had shipped). The Hearth-native
catering model — enquiries modelled as private drops — is live end-to-end: pages
`catering-enquiry.html` and `enquiries.html`; five Edge Functions
(`submit-catering-enquiry`, `list-catering-enquiries`, `get-catering-context`,
`convert-catering-enquiry`, `send-catering-confirm`); two migrations
(`20260703120000_create_catering_enquiries.sql`,
`20260706120000_comms_log_enquiry_scope.sql`); and Activation confirm-send wiring
(activation.html). Ed confirmed the `catering_enquiries` table exists in
production via the SQL editor (2026-07-14), sealing that the migrations are
applied. Original spec prose retained below for history.

Explore how Hearth could support catering enquiries and jobs without
drifting from the core drop model. The tension: catering is often bespoke,
negotiated, and not capacity-led in the same way as a drop. The question
is whether a catering job can be modelled as a private drop — pre-sold,
fixed menu, fixed window, known recipient — rather than building a
separate quoting or invoicing flow.
Spec required before any build: define what a Hearth-native catering model
looks like and where it diverges enough to need its own UX treatment. This
is a longer-term item. Do not build until the core drop model is proven
with real vendors.

T5-23: Multi-vendor events
An event (festival, community gathering, large fundraiser) creates a Hearth
event landing page that acts as a hub. Multiple vendors each configure their
own drop within the event — their own menu, their own window, their own
capacity — managed independently. Customers land on the event page, browse
vendors, click through and pre-order. The event link could be sent alongside
a ticket purchase or promoted by the event organiser.
Commercial model: this is a vendor-side feature, not an organiser product.
Vendors already on a Hearth subscription get multi-vendor event participation
as part of their plan. Hearth does not charge the event organiser — the
event landing page and unified hub is platform infrastructure, not a
separately priced service. This makes Hearth a selling point for vendors
when pitching to event organisers.
Data model question: is the event a new top-level object sitting above drops,
or a host with a special presentation layer? To be resolved at spec stage.
Dependency: subscription model must be live and a vendor base must exist to
pilot with. Longer-term item — revisit once subscription model is proven.

T5-24: POS integration
Vendors using an existing POS (Square, Lightspeed, etc.) currently manage
two separate order streams: real-time in-person or aggregator orders through
their POS, and Hearth drop orders through the platform. Without integration,
this creates operational confusion and friction.
Two separate items:
(1) Short term — capture POS platform during onboarding ✓ COMPLETE
Q2b added to onboarding (Square, Lightspeed, Clover, Toast, Other, None);
writes `pos_platform` and `pos_platform_other` to the vendors table.
Useful signal for future integration prioritisation and for understanding
vendor operational context.
(2) Longer term — full POS integration. Allow Hearth drop orders to flow
into the vendor's existing POS so they manage a single order stream. The
point is not to replace the POS — it is to make Hearth feel like part of
the vendor's existing operation rather than a parallel one. Scope and
approach depend on which POS platforms are most common among early vendors.
Do not build until real friction is confirmed from live vendor feedback.

T5-25: Drop promotion — marketing copy and print assets
Vendors currently have no way to promote a drop beyond sharing the order
link manually. This ticket adds a lightweight promotion tool that generates
ready-to-use marketing assets directly from drop data — removing the blank
page problem and making every drop feel professionally promoted.

Two output types — updated to three output types following T5-C1 design session:

(0) Auto-generated menu card image
A formatted, vendor-branded menu card image generated automatically from
the drop's published menu. Designed for the Monday reveal post — the
moment vendors announce the menu to social media before ordering opens.
The vendor should be able to post this to Instagram without any design
work. Asset is generated from drop menu data and branded with the
vendor's identity (logo, primary_color, display_name). Format: square
(1:1) and portrait (4:5) variants for Instagram feed and Stories
respectively. Vendor downloads or copies to clipboard. No direct posting
integration in V1. This is the highest-priority output type in T5-25 —
it removes the single biggest friction point in the Monday touchpoint
and is the reason many vendors will not execute the anticipation phase
without platform support.

Reference: Hearth_Drop_Communications_Architecture.md section 5
(Monday — The reveal) and section 11 (Auto-generated menu card image).

(1) Social copy generator
Accessible from the drop card in Drop Studio (and from the Review pane)
once a drop is published or scheduled. Generates platform-appropriate copy
variants for Instagram, Facebook, and WhatsApp using the drop's name,
host, timing, capacity, and the vendor's tagline. Copy is generated
client-side using the Anthropic API (Claude) with a structured prompt
drawing on drop fields and vendor brand voice. Vendor can regenerate,
edit inline, and copy to clipboard. No direct posting integration in V1
— copy is for the vendor to paste. Platform selector (Instagram /
Facebook / WhatsApp) adjusts copy length and hashtag style.

(2) Drop poster with QR code
A printable A5 or A4 poster generated as a styled HTML page using the
drop's brand colours, vendor logo, drop name, host name, timing, and a
QR code pointing at the order page. Vendor can download as PDF or PNG
for printing in-store, at the host venue, or sharing digitally. QR code
generated via the existing qrserver.com API already used in Drop Studio
review pane. Poster layout uses the Hearth two-layer brand structure:
Hearth frames, vendor fills. Vendor name and logo prominent; "Powered
by Hearth" in footer.

Both outputs are generated on demand, not stored. No new database schema
required for V1.

Future V2 scope (do not build now): direct Instagram post via Graph API,
WhatsApp Business API broadcast to consented customers, scheduled posting.

Dependency: Stripe live (T3-8) so drops being promoted are payable.
Social copy generation uses the Anthropic API from the frontend —
use the Claude-in-artifact pattern already established in the platform.
Poster generation is pure client-side HTML/CSS — no external dependency
beyond QR code API already in use.

**Progress note (2026-05-17, PR #268):** The Monday reveal menu-card surface (output type 0) and the Drop Studio Review-pane layout that houses it shipped. Review & Publish + Drop link merged into one "Publish & share" card opposite the reveal card; review-pane cards are natural content height (uneven bottoms intentional, not a defect); reveal fields moved beside an enlarged reveal image; the reveal hook input is now a <textarea> relabelled "Your line for this drop". reveal_line is captured and stored for the Part 1 caption composer. T5-25 REMAINS OPEN — Part 1 (social copy generator) and Part 2 (drop poster) are not built; this note records the Part 0 surface + housing only.

T5-26: Host discovery outreach

When the intelligence engine (T5-9) surfaces a prospective host recommendation — whether via same-type geographic discovery or cross-category affinity matching — the vendor needs a way to act on it. This entry covers the outreach capability in two phases.

**V1 — vendor-mediated, no host login required**

A "Draft introduction" CTA appears on each host discovery recommendation card generated by T5-9. The vendor triggers a generated introduction message drawing on: their own brand voice and display name from Brand Hearth, headline facts from their strongest existing host relationships (fill rates, average orders, drop cadence — written deterministically from SQL, never generated), the prospective host's audience description and audience_tags from the hosts table where available, and a plain-English framing of the mutual benefit specific to the vendor's food category and the host's audience type.

Vendor reviews, edits, and sends directly — email, phone, or in person. The platform generates the copy and provides the key facts; the vendor owns the contact channel. No host authentication required.

Outreach outcome recorded by the vendor on the host record. Add relationship_status progression to host records if not already present: prospect → approached → responded → active. Vendor updates this manually after making contact. The hosts.html Host Directory should surface relationship_status as a visible column or filter so the vendor can track their outreach pipeline.

V1 GenAI pattern: client-side, Haiku 4.5. Structured signal data in, introduction copy out. Deterministic facts (fill rates, order counts, drop history) passed as structured data and rendered separately — never generated. See GenAI shared principles for hard rules.

**V2 — platform-mediated outreach**

Requires T5-27 (host platform participation) Phases 1–3 to be complete. When hosts have their own authenticated accounts and an inbox, the vendor sends the introduction through the platform rather than copying it into an external channel. The introduction lands in the host's inbox with the vendor's profile and key performance data attached. Host can respond through the platform. Vendor sees response status. This closes the outreach loop that V1 leaves open and gives the platform visibility of partnership formation — the foundation for the T5-4 marketplace evolution.

Dependency: T5-9 (host discovery recommendations). V2 additionally depends on T5-27 Phases 1–3.

T5-27: Host platform participation

Hosts currently exist as vendor-owned records. The read-only host-view.html is the entirety of the host-facing experience. This workstream elevates hosts to authenticated platform participants with their own identity, inbox, and view of the platform. Treat as a parallel tier to T5-A (which did the same for vendors) — significant scope, build incrementally across six phases.

**Phase 1 — Host identity and login**

Host account creation (email, password) with matching to an existing host record by email or vendor invite link. Auth flow mirrors vendor auth: signup → callback → session-aware resolution. Host record gains auth_user_id. resolveHost() pattern analogous to resolveVendor(). Hosts authenticated separately from vendors — different session namespace, different post-auth routing. Existing host-view.html remains unauthenticated for passive drop viewing; authenticated hosts get access to additional surfaces.

**Phase 2 — Host self-onboarding**

A host discovering Hearth independently (not via a vendor) can register their venue, declare audience size and description, add service windows and comms channels, and accept host terms. Creates a host record in a discoverable state — vendors and the intelligence engine can surface it as a prospective partner. This is the supply side of the T5-4 marketplace evolution: hosts making themselves available; vendors finding and approaching them. Distinct from the vendor-initiated host creation flow already in place, which remains unchanged.

**Phase 3 — Host inbox and platform-mediated outreach**

Host inbox surface where vendor introductions land (T5-26 V2). Host receives a notification when a vendor sends an introduction, can review the vendor's profile and existing drop performance data, and respond through the platform. Vendor sees response status in their outreach pipeline. This phase is the prerequisite for T5-26 V2 and closes the outreach loop.

**Phase 4 — Host-managed profile**

Hosts edit their own audience description, service windows, comms channels, and availability directly rather than the vendor managing it on their behalf. Vendor retains read access to the host profile for drops they have run together. Host owns their data; the vendor relationship becomes a link, not ownership. Resolves the current model where host profile accuracy depends entirely on vendor diligence.

**Phase 5 — Host analytics surface**

Host-facing view of their own performance: drops hosted, total orders fulfilled, audience reached, revenue share earned, growth over time. The compounding asset made visible from the host's perspective, not just the vendor's. Motivation for hosts to stay active on the platform and attract further vendor partnerships. Data already exists in v_host_performance — this phase is primarily a new host-facing UI surface reading from existing views.

**Phase 6 — Host-initiated partnerships**

Hosts browse vendors on the platform, express interest in hosting a drop, and initiate the conversation. Vendor receives the approach in their inbox. Completes the two-sided model implied by T5-4 — supply (hosts) and demand (vendors) can find each other without a manual introduction from either side.

Dependency chain: T5-A (vendor auth — complete) provides the auth pattern to follow. T4-16 (hosts as first-class entities — complete) provides the data model foundation. T5-26 V1 ships before any phase of T5-27. Phases 1–3 are prerequisites for T5-26 V2. Phases 4–6 depend on meaningful host adoption — do not build ahead of evidence that hosts want platform participation.

Relationship to T5-4 (marketplace evolution): T5-27 is the infrastructure T5-4 assumes. T5-4 should not be built until at least Phases 1–3 of T5-27 are complete and validated with real hosts.

**T-STRATEGY-1: Aggregator Evidence File**
Tier: Strategy/Content. Not a build ticket.

A standalone, shareable document summarising documented aggregator sales and operational practices — drawn from research conducted May 2026. Intended for three audiences: internal team reference, vendor onboarding conversations, future investor or partner materials.

Must distinguish clearly between documented fact, cited analysis, and industry-reported claims. Must not read as a polemic — factual, sourced, and calm in tone.

Content to include:
- Commission rates and margin impact (20–30%, vs 3–5% net margins)
- Forced always-on behaviour and contractual acceptance rate requirements (95% minimum documented)
- Customer data ownership and lock-in as the primary platform mechanism
- Price parity clauses and algorithmic enforcement
- Pay-to-appear: visibility sold back to vendors on top of commission
- Exit penalties and contract terms
- Listing without consent (Uber settlement documented)
- Ratings manipulation — CMA investigation into Just Eat opened March 2026 (live, UK-specific)
- The "impossible choice" framing and "economic captivity" analysis

Status: Open. Priority: complete before first external investor or partner conversation.

**T5-C7: Vendor early cadence support — drops 1 to 10**
Tier: 5. Strategic platform feature. Depends on real drop data existing.

Note: closely related to the existing T5-C5 (cadence visibility and consistency mechanics). T5-C5 covers the visible cadence mechanics across Home/scorecard/Drop Studio; this ticket (originally drafted as a second "T5-C5" in the May 2026 strategy session, renumbered to avoid an ID collision) frames the early-drop support programme specifically. The two should be built as one coherent arc.

The causal chain vendor confidence → cadence consistency → customer habit formation means the platform must actively support vendors through the early drop period before habits are established. One underfilled drop, a skipped week, or a changed day can break the loop before it forms.

This ticket covers the mechanics of that support. Not a single feature — a programme of signals, prompts, and honest expectation-setting built into the platform experience for vendors in their first 10 drops.

Design requirements:
- Cadence drift detection: surface a prompt when a vendor's drop pattern becomes inconsistent. Tone: observational and coaching, never punitive. Example: "Your last three drops ran on different days. Customers find it easier to plan around a consistent schedule."
- Fill rate feedback: after each drop, show the vendor their fill rate in context — not just as a number but framed against what's typical for drops at this stage.
- Early expectation-setting: during onboarding, be honest that habit formation takes 8–10 consistent drops. Frame the early period as investment, not immediate payoff.
- Milestone markers: acknowledge when a vendor reaches drop 5, drop 10 — small signals that reinforce continuity.

Dependencies: T5-8 (interest registration), T5-9 (recommendation engine V1), real drop data.
Cross-reference: T5-C5 (cadence visibility and consistency mechanics — overlapping scope), T5-C6 (vendor activation plan).
Status: Open. Post-launch.

Vendor-facing copy authored in Hearth_Repetition_Layer_Voice_Spec.md (canonical repetition-layer voice spec).

**T5-C8: Platform-sent visual email — primary email path; customer-list import as the unlock**
Tier: 5 (comms-architecture-derived). Strategic platform feature. Depends on customer-list infrastructure. Post-launch — not activation-pass blocking.

The email touchpoint on the activation surface is currently copy-paste plain text. This ticket reframes it: the highest-value version of "email your customers" is one Hearth sends — branded, visual, one tap — because that is the action that makes loading customer details into the platform worthwhile. The owned customer list is the compounding asset the model rests on; every drop adds named, opted-in local customers, and each makes the next easier to fill. Platform-sent visual email is therefore the most natural on-ramp to the customer import the strategy depends on. Copy-paste stays as the graceful fallback for vendors who won't or can't load contacts.

Behaviour: when a vendor has customers loaded (imported, or accumulated from prior drops), the email touchpoint's primary action is "Send to your customers" — visual, branded, no design effort. When they don't, the surface nudges them toward importing (lightly, in voice) and offers the copy-paste text so they're never blocked. Copy-paste remains available always, as the backup.

Fix shape (not built): a restrained, branded HTML template — the drop's food image, vendor identity (logo/colours per the brand layer; Hearth frames subtly, vendor fills), the announcement copy (reuse the existing email seed/AI copy), one clear "Order" button to the drop link, the close time. Sent via Resend (already wired), from a sender that reads as the vendor. Triggered by the vendor from the activation email zone; sends to the relevant segment (T5-C2 rule — same vendor, same/adjacent area), honouring the early-access insider mechanic where relevant.

Guardrails:
- Restraint over polish. The bar is "a beautiful, simple note with the dish on it," not "a marketing campaign." An over-designed template loses the warm-personal quality and fights the voice.
- Consent and lawful basis. Marketing email to a vendor's list requires confirmed permission (UK GDPR/PECR). Imported lists need an explicit lawful-basis confirmation at import; order-accumulated customers need the right opt-in. Unsubscribe handling is mandatory and built in.
- Deliverability. Sending on behalf of many vendors needs care (send subdomain DNS exists; SPF/DKIM/DMARC alignment; reputation). Decide shared vs per-vendor sender early.
- Never auto-send. The platform prepares; the vendor approves the segment and presses send.
- Copy-paste is never removed. It is the fallback; the feature degrades gracefully.

Where it surfaces: activation surface, Card 4 (vendor_open) email zone — send-primary when a list exists, copy-fallback otherwise. The automated email touchpoints (early_access, thank_you) the comms engine already sends should adopt the same template once it exists.

Open decisions: from-address model (vendor-display via Hearth vs per-vendor domain auth); single vs segmented send for v1; consent mechanics for imported vs order-accumulated contacts; how hard to nudge import without it feeling like pressure.

Dependencies: T-customers-page-import-entry + customers workspace (hard), Resend (wired).
Cross-reference: T5-11 (comms engine — this extends it with the visual template + vendor-triggered send), T5-C2 (consent capture, segmentation), T5-C3 (WhatsApp API — companion channel), Hearth_Drop_Communications_Architecture.md (email role; early-access insider mechanic).
Status: Open. Post-launch. Larger build than copy-paste (template + send infra + compliance + list dependency); must not block the current activation pass — copy-paste email is the correct interim.

**T-drop-anticipation-window-default: Drop Studio — default ordering-open time to create an anticipation window**

**Status:** ✓ COMPLETE 2026-06-15 (#369). The "currently defaults `opens_at` to immediate" problem statement below was already false for new drops — `createNewDrop` set the 24h lead (`opens_at = delivery − 24h`). The real remaining gap was duplicate-only, closed by #369 with explicit placeholder timing on `duplicateDrop`. Both creation paths now produce the announce→open window. Original problem/fix-shape prose retained below for history.

**The problem**

Drop Studio currently defaults `opens_at` to immediate open: a published drop is orderable straight away. This directly contradicts the Drop Communications Architecture (T5-C1 output), which is built around a window between announce and ordering opens — the Monday menu reveal, the Tuesday host message, the anticipation the comms doc calls "part of the product." If ordering is live the instant a drop is published, that window cannot exist. The platform is quietly fighting its own communications model on the most important screen, and the vendor never learns the announce-then-open rhythm because the default never asks them to. This is a contradiction between the locked strategy and the build, not a cosmetic gap.

**Fix shape (not built)**

- Anchor `opens_at` to `delivery_start`, not to publish time. Default it to roughly the evening before delivery (≈24h prior), editable. The gap between whenever the vendor publishes and that opens time becomes the anticipation window automatically — set delivery for Friday, finish setup on Monday, and the vendor has a four-day reveal window with no effort. Publishing is the announce; `opens_at` is when ordering goes live; the gap is the product.
- Name and explain the gap in the Timing pane. A short line in voice, e.g.: "Ordering opens Thursday evening. The days before are your window to reveal the menu and build anticipation — share it, but customers can't order yet." This stops a vendor reading the delay as a bug.
- Nudge, don't force. Keep an explicit "open now" choice for last-minute or event drops, mirroring the series-as-default stance in T5-C5 mechanic 2.
- Coherent re-derivation. `opens_at` (and `closes_at`) should re-derive when the delivery date changes. Sits directly adjacent to the known re-derivation gap in T5-B44 — decide whether to fix together.

**Guardrails**

- Audit-first. Before any build prompt, confirm the actual current default in `drop-manager.html` (the Timing pane) rather than assuming it — standing discipline, doubly worth it given the adjacent T5-B44 timing-derivation fragility.
- The anticipation window is also the home for interest registration (T5-8) and the comms reveal touchpoints (T5-25 menu card image; T5-C2 / T5-C4 announce messages). Defaulting `opens_at` forward enables all of them, not just the reveal.

**Where it surfaces:** Drop Studio Timing pane (default value + explanatory line). Connects to the Review-pane "Promotion plan" checklist already shipped under T5-C4 (PARTIAL, 2026-05-30).

**Relationship to T5-C5 mechanic 2:** same principle — Drop Studio's defaults and nudges should encode the model's intent, not the path of least resistance — and the two land in adjacent panes. Ticketed separately but design together.

**Dependencies:** none hard. Relates to T5-B44 (timing re-derivation), T5-8 (interest registration), T5-25 (menu card reveal), T5-C2 / T5-C4 (announce touchpoints), T5-C5 mechanic 2 (series nudge).

**Cross-reference:** Hearth_Repetition_Layer_Voice_Spec.md (section 4), T5-C1 (closed — design brief).

**Priority:** pre-launch. If Healthy Habits Cafe creates their first drop under today's default, ordering opens immediately and the announce window is lost on the drop that matters most. The dry run (T-support-dryrun-checklist) is where this would surface — address it before then.

**T-CONTENT-1: Landing page proof quote — Healthy Habits Cafe**
Tier: Content. Not a build ticket.

The landing page currently carries a placeholder proof statement in place of a genuine vendor quote. A real quote from Healthy Habits Cafe — even an informal one — would significantly strengthen the page.

Action: obtain a genuine quote during or immediately after the vendor onboarding dry run. The quote should speak to the experience of using Hearth, the control it gives them, or the difference in how it feels to operate this way. It does not need to be polished — authentic is better than constructed.

Once obtained, update the proof section of landing.html to replace the placeholder with the real quote and correct attribution.

Status: Open. Blocked on dry run completion.

**T-menu-import: Menu page — AI-assisted menu import (extract-to-curate)**

**Status:** Open. Tier 5. Priority: post-launch — first
acquisition-enablement item. Not in the pre-launch sequence. Validate
the spec against Healthy Habits' real menu during the dry run before
building.

**The problem**

The Menu page asks a non-technical vendor to hand-build their catalogue
from a blank state. This is real friction at the moment a self-serve
vendor's confidence is most fragile, and it bears on the model's known
soft spot (cost-to-serve per vendor doesn't compress cheaply). Most
vendors arrive with an existing menu — website, printed card, aggregator
listing — that already holds the raw material.

**The reframe (strategic spine — do not skip)**

The job is NOT to reproduce a vendor's full à la carte catalogue. A
scraped menu is a sprawling list; the Hearth drop menu is a designed,
restrained selection. "Menu builder → your menu is built" pushes vendors
toward exactly the sprawling behaviour the model exists to avoid. The
framing is to extract candidates so the vendor curates down. The review
step IS the product: "here's everything we found — now pick what belongs
in your drops", never "here's your menu, confirmed." This removes typing,
not deciding.

**Scope**

In: categories, product names, prices.

Out, deliberately manual:

- Capacity. Categories carry capacity semantics; a scraped menu has zero
  signal about the capacity driver. AI must never guess — a wrong setup
  is invisible to a non-technical vendor. Set knowingly at drop creation.
- Bundles. Too much operational judgement. Manual.
- Auto-commit. Prices are money; vision models misread £8.50 as £8.00 and
  invent items. Everything lands editable, the vendor confirms, then it
  writes. Sits inside the AI-approval requirement by design.

**Four stages (weight on stage 3)**

1. Input — empty-state CTA "Start from a menu you already have." Photo
   upload or link. Photos are the reliable primary; link degrades
   gracefully.
2. Extract — Edge Function receives images/page text, calls the model,
   returns structured JSON. Key never touches the client.
3. Review & curate — editable table; edit name/price, deselect freely.
   25+ items selected → one calm line in repetition-layer voice. Capacity
   named, not hidden.
4. Commit — confirmed items write via Edge Function. Nothing persists
   before this.

**Technical (validate against live system first)**

- New Edge Function, canonical auth (`verify_jwt = false` + in-function
  `getUser()`).
- Model returns JSON only; parsed defensively; never trusted as final.
- Write path uses the same tables as the manual Menu flow. AUDIT-FIRST:
  confirm insert path + column names via `information_schema` before any
  build prompt.

**v1 recommendation:** photos-only. The link path is where most failure
and engineering live, for the least reliable result. Add later if vendors
ask.

**Open decisions:** vision model choice + image size/count limits; link
path in v1 or not; curation-nudge threshold (25 is a placeholder).

**T-menu-restraint-layer: Menu selectivity as a repetition layer**

**Status:** Open. Tier 5. Copy to be authored as a design reference
first (chat), then implemented. Not pre-launch. Build only after copy
exists.

**The gap**

The platform never tells vendors that a drop menu is a designed,
restrained selection. Restraint is currently implicit. The manuscript and
May strategy both treat the per-drop menu as "a considered selection,
part of the moment" — but no surface says so.

**The shape (parallel to the cadence repetition layer)**

Restraint is a property of the DROP menu, not the Menu library. The
library is allowed to be broad. Author the principle once; surface it at
three moments, heaviest where the selection decision is made:

- Menu page — LIGHT anchor only: "This is your full set of items. Each
  drop uses a designed selection from it." Sets expectation without
  telling vendors to under-build their library.
- Drop Studio, at menu assembly — the REAL nudge (highest-leverage;
  currently silent). This is where the selection happens.
- Import flow — curation step (already covered in T-menu-import stage 3).

**Internal convention to keep legible:** nav and page = "Menu"; the
per-drop selection = "drop menu" wherever named in Drop Studio.

**Voice:** repetition-layer (calm, factual, warm). Banned words apply.

**Not this ticket:** vendor selectivity (Hearth isn't for every business)
— related in spirit, different surface and audience (flagged in May
strategy session). Track separately; do not merge.

**Dependency:** canonical copy authored first, like the repetition-layer
voice spec.

### Tier 5-A — Auth workstream

Must complete before any real vendor enters live data. The current
`?vendor=<slug>` URL param model is fine for dev and demos but is not
a security boundary — any operator can load any vendor's workspace by
guessing a slug. Auth replaces URL-based vendor resolution with
session-based identity, and RLS moves from frontend filtering to
server-side enforcement.

T5-A1: Enable Supabase Auth — magic link / passwordless email
SUPERSEDED — password-based authentication was implemented instead of
magic link. Vendors sign in with email and password via
signInWithPassword. No magic link infrastructure required.

T5-A2: Link vendors to auth users ✓ COMPLETE
auth_user_id uuid column confirmed present on vendors table and in
active use. auth-callback.html queries vendors by auth_user_id and
performs auto-link on first sign-in by matching email where
auth_user_id is null.

T5-A3: RLS rewrite — server-side vendor scoping
Every vendor-scoped table and view (`drops`, `products`, `bundles`,
`categories`, `orders`, `customer_relationships`, `v_drop_summary`,
`v_hearth_drop_stats`, `v_item_sales`, `v_host_performance`, etc.)
gets RLS policies filtering on `vendor_id IN (SELECT id FROM vendors
WHERE auth_user_id = auth.uid())`. Frontend no longer needs to pass
vendor_id as a filter for correctness — the server enforces it.
Frontend filters stay for clarity but become belt-and-braces rather
than the only defence.

[Extension — 2026-04-27 RLS audit] Today's RLS layer is incoherent.
Most vendor-scoped tables have BOTH a strict authenticated-only
policy AND one or more permissive `anon USING (true)` policies.
Postgres RLS is additive, so the permissive anon path is what's
actually keeping the platform functional under the auth-attach bug
— but the same permissive policies allow any authenticated or anon
user to read every other vendor's drops, products, orders, and
customer data.

Once the Edge Function migration covers the legitimate authenticated
paths (see operational learning #16), this workstream:

- Removes the permissive `anon USING (true)` SELECT policies on
  tables that should be vendor-scoped (`drops`, `products`,
  `bundles`, `categories`, `drop_menu_items`, `vendors`)
- Removes the permissive `anon UPDATE/INSERT` policies on `orders`,
  `order_items`, `order_item_selections`, `vendors`
- Tightens vendor SELECT to expose only public-readable columns
  via a dedicated view, removing direct public access to
  contact_phone, address, social_handles, etc.
- Consolidates duplicate policies (e.g. `drops` has six different
  anon SELECT policies — one is enough)
- Adds RLS to authenticated-only views where missing
  (e.g. `v_drop_summary`)

Do this strictly AFTER the Edge Function migration. Removing
permissive policies before the Edge Functions are in place breaks
the platform. The migration creates the legitimate auth paths;
this ticket removes the illegitimate ones.

Reference: full RLS audit performed in session dated 27 April 2026.

[Extension — 2026-05-19 checkpoint] T5-A3 partial. Operator view layer
closed; `v_drop_public` live; anon `order.html` re-pointed; host-view
authorisation sub-track CLOSED 2026-05-19 (verified end-to-end on
production). Priority 2 + adversarial isolation test still open. The
previously planned `v_drop_summary security_invoker` flip is
ABANDONED — closure now tracked under T5-A14 (see operational
learning #52).

[Closure — 2026-06-29] **T5-A3 is now ✓ COMPLETE.** Priority 2 Half A
(#413, 2026-06-27) shipped the column-safe public views; Priority 2
Half B (#415, 2026-06-29) shipped the `get-current-vendor` EF, re-pointed
the four session-identity reads, and DROPPED `vendors_select_all`
(capstone) — no anon SELECT remains on `vendors`. The T5-A14
`v_drop_summary` closure was subsumed by the operator-read-auth track
(✓ COMPLETE 2026-06-27). The only carry-forward is the Catering Direct
two-vendor adversarial isolation test (empirical, non-blocking,
structurally guaranteed by the EF design). Detail in the Half B and
"Two-vendor adversarial isolation test" entries below.

T5-A3 DONE:

- Reads audit and view-reads audit artefacts produced
  (`audit/T5-A3-reads-audit-2026-05-17.md`,
  `audit/T5-A3-view-reads-2026-05-17.md`).
- `order.html` anonymous `vendors` read narrowed to safe display
  columns (commit 390985e) + follow-up restoring non-sensitive
  consumed fields `name`, `powered_by_hearth_visible`
  (commit 65d66c1).
- `v_drop_public` created: 29 safe columns, status-filtered, granted
  `anon` + `authenticated`.
- `order.html` re-pointed: its 3 anonymous drop reads now use
  `v_drop_public` (commit 8d4c63d).
- Entire operator view layer: all 34 `v_*` views set
  `security_invoker = on`, applied bottom-up (canary
  `v_products_enriched` → Tier 0 → Tier 1 → Tier 2+3), each tier
  verified via the authenticated app path.
- **Host-view authorisation sub-track CLOSED 2026-05-19, verified
  end-to-end on production.** Two new Edge Functions:
  - `host-view-summary` — token-authenticated (slug + `&t=`
    token in query string). Returns an 18-field minimal host
    projection. NEVER returns `drop_gmv_pence` or raw
    host-share mechanics; `host_share_descriptor` is built
    server-side from the underlying mechanics. Returns a
    uniform `403 {"error":"not_authorised"}` on any failure
    (bad token, wrong slug, missing drop) so anonymous
    callers cannot enumerate drops.
  - `get-drop-host-token` — JWT-authenticated operator EF
    mirroring `get-drop`'s auth pattern. Verifies the caller
    owns the drop's vendor and returns
    `{ host_access_token }`. Used by Drop Studio's "Copy
    host link" action — direct PostgREST against
    `drop_host_tokens` was returning empty rows because the
    anon role hit RLS (operational learning #52), so the
    token is now fetched through this EF and appended to the
    host-view URL.
  `host-view.html` no longer reads `v_drop_summary` or
  `drop_host_tokens` directly. Drop Studio's host-link builder
  now routes via `get-drop-host-token` before producing the
  share link.

T5-A3 OPEN:

- **Priority 2 — ✓ COMPLETE 2026-06-29 (Half A #413, Half B #415).**
  Originally: remove `vendors_select_all` (anon SELECT, `qual = true`;
  exposes `stripe_account_id`, `auth_user_id`, contact fields), gated on
  remediating the `hearth-vendor.js` boot read, then provide a
  column-safe anon path. Closed across the two halves below — the boot
  read was re-pointed onto the `get-current-vendor` EF (Half B) and
  `vendors_select_all` was dropped as the capstone.

  **Half A ✓ COMPLETE 2026-06-27 (#413).** Column-safe public views
  for the anon order path. `v_host_public` CREATED (`id`, `name`,
  `host_type` only) — this closes the customer-facing host-PII leak:
  `contact_email` / `contact_phone` / `contact_name` and
  `notes_internal` no longer reach anon. `v_vendor_public` was found
  to ALREADY EXIST (a 23-column PII-safe branding view predating this
  work) and was REUSED as-is, not created — `order.html` selects its
  11 vendor columns by name so the re-point works against the wider
  view. `order.html`'s two anon reads (vendors ~:2458, hosts ~:2470)
  re-pointed onto the two views; the host read also switched to
  `.maybeSingle()`, with host conditionality preserved. Migration
  `20260627194122_vendor_host_public_views.sql` creates only
  `v_host_public` + grants; repaired `--status applied` 2026-06-27.
  Known residual: both views carry inert non-SELECT anon grants
  (INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) — same pattern as
  T-drop-capacity-anon-grants, inert on non-updatable views; folded
  into that ticket, no new ticket opened.

  **Half B ✓ COMPLETE 2026-06-29 (#415).** The vendor-data anon
  exposure is now SHUT — T5-A3 Priority 2 fully closed. The
  `get-current-vendor` JWT Edge Function was built and deployed
  (`verify_jwt = false` at gateway, in-function `auth.getUser()` JWT
  verify, service-role read of the caller's own `vendors` row by
  `auth_user_id`; 401 no-JWT / 404 no-row / 500 unexpected; full-row
  select by design). All four session-identity reads re-pointed onto
  `invoke('get-current-vendor')`: `hearth-vendor.js` `resolveVendor()`
  boot read (load-bearing), `activation-poster.html`,
  `auth-callback.html`, `set-password.html`. The boot read now splits
  404→null (security-correct null-on-no-row, no `.limit(1)` fallback)
  from any-other-error→throw — STRICTER than the old code, which
  collapsed both into null; this hardened the load-bearing read. The
  localhost `?vendor=` dev override in `hearth-vendor.js` is left in
  place, intentionally inert post-REVOKE, marked with a known-broken
  comment; proper fix deferred to T6-2 (local dev env). CAPSTONE:
  `DROP POLICY vendors_select_all` applied — confirmed via `pg_policy`
  that only `Vendors: admin insert`, `Vendors: authenticated owner
  select` (inert defence-in-depth, intentionally left), and `Vendors:
  authenticated owner update` remain; no anon SELECT policy on
  `vendors`. `stripe_account_id`, `auth_user_id`, contact fields and
  onboarding answers are off the anon path. Verified on live: every
  operator surface resolves identity through `get-current-vendor`
  (network tab shows the EF invoke, no direct `vendors` REST read); the
  customer `order.html` renders full vendor branding in an
  incognito/anon session post-REVOKE (`v_vendor_public` is a definer
  view, unaffected by the base-table policy drop).
- **Two-vendor adversarial isolation test — RESIDUAL (carry forward,
  not blocking).** Empirical cross-vendor check still outstanding
  (no fixture login available the night of closure). Structurally
  guaranteed by the EF design (resolves strictly by the caller's own
  `auth_user_id`; there is no parameter to request another vendor's
  row). Run before the dry run once Catering Direct access is sorted
  (Robin may hold it; fixture vendor_id
  `a2a757fd-6882-49f8-9a54-7e682eab1e90`).
- **Deferred low-severity:** catalog anon policies (`categories`
  `qual=true`; `products` / `bundles` `is_active`; `drop_menu_items`
  `is_available`; `drop_products` duplicate `true` policies) —
  decide keep-scoped vs route via public views. No PII.
- **Write-side flags surfaced by the audit, for the write/auth
  workstream (out of T5-A3 reads scope):**
  - `order_status_events` anon+authenticated INSERT
    `with_check = true` (unconstrained).
  - `drop_products` two redundant anon SELECT `true` policies.
  - `vendors` "admin insert" is authenticated `with_check = true`
    (any authenticated user can insert vendor rows).
- **`v_drop_summary` cross-vendor exposure (now T5-A14):** the
  previously planned `security_invoker` flip is ABANDONED — under
  the auth-attach bug, operator pages read `v_drop_summary` as
  anon, so flipping it to invoker would silently zero out every
  operator page. Closure now requires the JWT-auth EF migration
  tracked as T5-A14 below.

Handover prerequisite corrections (T5-A3 Section A): the T5-A3
handover's policy claims were stale. "`drops` has ~6 anon SELECT
policies" and "`categories` / `products` have duplicate policies"
were both wrong. Reality: exactly one anon SELECT policy per table;
duplicate anon SELECT (`qual = true`) policies exist only on
`drop_products`; `orders`, `order_items`, `order_item_selections`,
`customers`, `customer_relationships` and `hosts` carry NO anon
policy (already locked; T5-B39 confirmed), so their operator reads
are out of T5-A3 confidentiality scope — their robustness depends
on the separate auth-attach workstream, not on any policy T5-A3
changes.

PARALLEL STILL OPEN: T6-5 — upgrade Supabase to Pro and verify PITR
active (hard gate before real customer data).

T5-A4: Login page ✓ COMPLETE
login.html created as a standalone page for returning vendors. Uses
signInWithPassword (email + password) rather than magic link as
originally specced — password-based auth was implemented throughout.
Routes to auth-callback.html on success. Links to signup.html and
reset-password.html.

T5-A5: Session-aware `resolveVendor()` ✓ COMPLETE
`assets/hearth-vendor.js` rewritten with session-aware resolution.
Localhost retains `?vendor=<slug>` dev override; without the param it
falls through to the session path. Production reads
`_sb.auth.getSession()` — unauthenticated users are redirected to
`login.html` (with `hearth:redirect` stored in sessionStorage);
authenticated users resolve via `vendors.auth_user_id = session.user.id`.
The first-vendor dev fallback and URL-param-based vendor identity are
retired — vendor identity now comes from the session, closing the
URL-param impersonation path.

T5-A6: Vendor provisioning ✓ COMPLETE
admin.html created as a standalone admin page (no vendor-nav.js). Auth-gated
to Ed's UID only. Form captures business name, slug (auto-generated, editable),
contact email, and optional display name. Inserts a new vendor row with
onboarding_completed: false — never sets auth_user_id (that happens on
first sign-in). Shows confirmation with instructions to send a Supabase
invite. Slug conflict detection with clear error message.

auth-callback.html modified with auto-linking step: after session is
confirmed, queries vendors where email matches session.user.email and
auth_user_id is null. If found, updates that row with the session user's
ID. Routing then continues as normal — the vendor row is now linked and
the existing new-vs-returning logic handles the rest.

T5-A7: Logout ✓ COMPLETE
"Sign out" link added to operator nav in `assets/vendor-nav.js` as the
last utility item (after Setup). Renders at 55% opacity / 12px matching
Hosts and Setup. On click: initialises a Supabase client from
`window.HEARTH_CONFIG`, calls `_sb.auth.signOut()`, then redirects to
`/login.html`. Click handler attached via event delegation on the nav
container — no inline onclick attributes. Falls back to redirect if
config is missing or signOut fails.

T5-A8: Upgrade auth to email OTP + optional 2FA
SUPERSEDED — password-based auth was implemented instead of magic link
or OTP. No upgrade path required.

T5-A9: landing.html — public marketing page
Unauthenticated. No vendor-nav.js. Two CTAs: "Get started" (routes to
signup.html) and "Sign in" (routes to login.html). Explains what Hearth
is, who it's for, and why it's different. Root URL destination for anyone
arriving at the platform cold.

Note (2026-04-20): landing.html was renamed to index.html and the old
Service Board was renamed to service-board.html as part of the routing
rewire. The root URL now serves the landing page directly, and
/landing.html redirects to / via _redirects for stale bookmarks.

T5-A10: signup.html — new vendor email capture ✓ COMPLETE
signup.html created as a standalone page for new vendors. No
vendor-nav.js. Uses signUp with email, password, and confirm password
fields (password-based auth, not magic link as originally specced).
Routes to auth-callback.html on success. Links to vendor-terms.html
and login.html.

T5-A11: auth-callback.html — post-magic-link routing ✓ COMPLETE
auth-callback.html handles full post-auth routing. No session →
redirect to login.html. Auto-link step claims unlinked vendor row by
email on first sign-in. hearth:redirect read from sessionStorage and
cleared before routing. No vendor row → onboarding.html.
onboarding_completed false → onboarding.html. onboarding_completed
true → stored redirect or home.html. Also handles PASSWORD_RECOVERY
event for the reset-password flow.

T5-A13: why-hearth.html should not load vendor-nav.js ✓ COMPLETE
vendor-nav.js script tag and HearthNav calls removed from
why-hearth.html. Replaced with a simple public nav pattern pointing at
/ (landing), /why-hearth.html, /signup.html and /login.html. Vendor
slug no longer leaks into URLs unauthenticated visitors see.

operator-read-auth: migrate the entire operator
order / capacity / production / analytics read surface to
JWT-authenticated, ownership-verifying Edge Functions; capstone
revokes anon SELECT on the two still-definer views. ✓ COMPLETE 2026-06-27

**Status:** ✓ COMPLETE 2026-06-27. Tier 5-A. Read-auth track closed.
All six get-* EFs present on disk (`get-drop`, `get-home-dashboard`,
`get-insights`, `get-customers-workspace`, `get-vendor-customer-count`,
`get-demand-preview`); `REVOKE SELECT` on `v_drop_summary` and
`drop_capacity` confirmed via `information_schema`; zero direct anon
reads remain across home / scorecard / insights / customers / hosts /
host-profile / drop-manager / service-board (verified 2026-06-27,
reconciliation audit). SUBSUMED the narrow T5-A14 (`v_drop_summary`-only
migration) — same pattern, same EFs, same capstone shape; T5-A14's
invoker-flip approach remains abandoned per operational learning #52.
Load-bearing operational learning #53 captures the rationale.

**Capstone carry-forward — NOT fully done.** The capstone's
`drop_capacity` disposition is incomplete: after the SELECT revoke, anon
still retains the six non-SELECT table privileges (INSERT, UPDATE,
DELETE, TRUNCATE, REFERENCES, TRIGGER) on both `v_drop_summary` and
`drop_capacity`. Carried forward to new ticket **T-drop-capacity-anon-grants**
(Tier 5-B, post-launch low priority — write-side hygiene, not a read
exposure).

**Background — invoker-regression blast radius.** The T5-A3
`security_invoker` view-layer rollout regressed the entire
operator order / capacity / production / analytics read
surface. Twenty `v_*` views derived from the RLS-locked tables
(`orders`, `order_items`, `order_item_selections`, `customers`,
`customer_relationships`, `hosts`) are `security_invoker = on`;
aggregate views layered on them (`v_hearth_summary`,
`v_item_sales`, `v_hearth_drop_stats`,
`v_hearth_revenue_over_time`, `v_host_performance`,
`v_drop_orders_summary`, the `v_order_item_detail*` family)
inherit the same emptiness transitively. Operator pages are
anon-at-DB (operational learning #52) so an invoker view over
RLS-locked base tables returns `[]` to the anon-effective
publishable-key client — operators silently saw empty Service
Boards / Insights / Customers / scorecards / home dashboards.
These views MUST NOT be reverted to definer: that reintroduces
cross-vendor order / customer-PII exposure, strictly worse than
the `v_drop_summary` economics case. The views STAY invoker.
Inventory of record:
`audit/order-pipeline-reads-2026-05-19.md` (commit 1b60aab).

**Scope.** Close the read-side blast radius by migrating every
legitimate operator caller to a JWT-authenticated Edge Function
path; the capstone removes anon SELECT on the two still-definer
views (`v_drop_summary` and `drop_capacity`) once nothing reads
them directly.

**Proven pattern (Slice 1 reference, 2026-05-19).**
(a) Extend the relevant existing EF additively — service-role
read of the relevant invoker view(s), returned verbatim under
new top-level keys, ownership already enforced by the EF's
existing JWT check. The additive deploy is a no-op for current
callers and ships ahead of the page change.
(b) Re-point the page to consume the new EF keys; delete the
direct anon reads, any dead client-side fallback chain (the EF
replicates the fallback server-side), and the now-redundant
client-side `vendor_id` assertion (EF enforces ownership
server-side — its removal is a security improvement).
(c) **Verify against a drop WITH real orders in real workflow
states.** Empty test drops mask this exact failure mode because
`[]` is the symptom. Standing verification-discipline rule for
any read-path migration against RLS-gated data. Slice 1 fixture:
drop "Neighbourhood massive"
(`25e75db9-01bd-4847-bc6c-7f858e216898`), 1 placed + 1
delivered.

**Sequenced slices:**

1. **Slice 1 — Service Board selected-drop pipeline.** ✓ DONE
   2026-05-19. `get-drop` extended additively (commit 3b064fc
   added `summary`; commit 9c63c5f added `orders_summary` +
   `order_items` + `order_items_source` via service-role reads
   of `v_drop_summary` + `v_drop_orders_summary` + the
   `v_order_item_detail_expanded` → `_v2` → `_detail` fallback
   chain). `service-board.html` re-pointed in commit a471990 to
   consume those keys; the three direct anon reads and the
   client-side `vendor_id` assertion deleted. Verified
   end-to-end on production against the "Neighbourhood massive"
   fixture.
2. **Slice 2 — Home dashboard.** Build a single
   `get-home-dashboard` EF that folds the `home.html:1212-1222`
   cluster (`v_hearth_summary` + `v_hearth_drop_stats` +
   `customer_relationships` + `orders` + `v_item_sales` +
   `v_host_performance`, all already in a Promise.all
   alongside an existing `functions.invoke('list-drops', ...)`).
   Service-role reads of the invoker views + RLS-locked tables;
   single response object with one top-level key per data
   source; page re-pointed; direct anon reads deleted.
3. **Slice 3 — Scorecard.** Per-drop performance view. Direct
   anon reads at `scorecard.html:665` (`v_drop_summary`),
   `:685` (`v_item_sales`), `:686` and `:687` (`orders`). Likely
   shape: extend `get-drop` further (per-drop scorecard
   projection) or a dedicated `get-drop-scorecard` EF.
4. **Slice 4 — Insights.** Multi-view analytics page. Direct
   anon reads at `insights.html:1083-1086` (`v_hearth_drop_stats`,
   `v_hearth_revenue_over_time`, `v_item_sales`,
   `v_host_performance`) and `:1099` (`orders`). Likely shape:
   a `get-insights` EF (or `list-` family) that returns all
   five datasets in one round-trip.
5. **Slice 5 — Customers workspace.** Direct anon reads at
   `customers.html:731` (`customer_relationships`), `:748`
   (`orders`), `:830-832` (`v_hearth_drop_stats`, `v_item_sales`,
   `v_host_performance`). Likely shape: a
   `get-customers-workspace` or `list-customers` EF.
6. **Slice 6 — Hosts / Host-profile.** Direct anon reads at
   `hosts.html:558` (`v_drop_summary`) and `host-profile.html:1057`
   (`v_drop_summary`). Likely fold-in to `list-hosts` (host stats
   projection) and `get-host` respectively.
7. **Slice 7 — Drop Studio single-drop.** Direct anon reads at
   `drop-manager.html:2722` + `:2947` + `:2960`
   (`customer_relationships`, `customers` — drives the demand
   preview loop), `:2781` (`v_drop_summary` LIST), `:3057`
   (`v_drop_summary` SINGLE). Likely fold-in: SINGLE into
   `get-drop`; LIST into `list-drops`; the demand-preview reads
   into a dedicated EF or `get-drop`.
8. **Slice 8 — Service Board drop-list.** The lone Slice 1
   leftover at `service-board.html:1713` (`v_drop_summary` LIST
   scoped by `vendor_id`). Likely fold-in to `list-drops`.
9. **Capstone — `REVOKE SELECT ... FROM anon`** on
   `v_drop_summary` (after Slices 2-8 have removed all direct
   anon reads of it) and an assessment of `drop_capacity` (still
   definer, derived from `orders`, no known frontend reader —
   drop / revoke / migrate as appropriate). Adversarial
   two-vendor isolation test after each phase.

Slice ordering is the suggested build order — slices are largely
independent and may be re-ordered for sequencing convenience.
The capstone is the only step that strictly depends on every
prior slice landing.

**Reference:** `audit/order-pipeline-reads-2026-05-19.md`
(commit 1b60aab) is the inventory of record — 33 in-scope call
sites across 7 operator HTML files, fold-in candidates flagged.
The narrower T5-A14 audit
(`audit/T5-A14-v_drop_summary-reads-2026-05-19.md`) is now a
sub-slice index inside the larger inventory.

**Cross-reference:** operational learnings #52
(auth-attach + invoker-flip-abandonment) and #53 (LOAD-BEARING
invoker-regression blast radius + proven pattern + verification-
discipline rule); T5-A3 (parent workstream; host-view sub-track
is an adjacent secured-read pattern reference); T5-B17
(underlying auth-attach bug — out-of-scope here because the
track routes around it via EFs rather than fixing it at the
client).

**Out of scope:** the auth-attach bug itself (T5-B17). The track
takes the bug as a given and moves every operator read off the
anon path. Fixing the bug at the supabase-js layer would, in
principle, restore direct PostgREST as a viable path, but that
fix has not landed and is not on the critical path.

**Priority:** medium-high — closes the full read-side blast
radius of the T5-A3 view-layer rollout. Not gating real-vendor
go-live (client-side scoping is in place on the still-definer
views, and the invoker-regressed surfaces are not the customer
order path), but is the largest remaining read-side exposure
and the natural completion of the T5-A3 reads workstream.

Revenue discount-blindness — net-of-discount correctness pass ✓ COMPLETE 2026-05-20

Fixed in `v_hearth_drop_stats` + `v_drop_fundraising_summary` DDL
rewrites; net-revenue commercial policy locked; per-item revenue
deliberately left gross. Cross-reference: operational learning #55
(LOAD-BEARING — orders.total_pence is the only source of truth for
what was charged) which absorbed the three defects — Cartesian
fan-out, discount-blindness, and bundle-revenue-loss — into a
single rule. Verification: switching
`v_hearth_drop_stats.revenue_pence` to `sum(orders.total_pence)`
moved Healthy Habits Cafe's 30-day revenue UP by ~£6.80 net of
known discounts (bundle revenue that had been invisible because
`order_items.price_pence` is NULL for bundle lines).

Operator-read-auth mop-up — v_drop_summary SINGLE-read fold-ins

**Status:** Open. The remaining direct anon reads of
`v_drop_summary` that the larger operator-read-auth slices don't
already cover, queued ahead of the REVOKE capstone:
- `scorecard.html:665` (v_drop_summary SINGLE) → fold into
  `get-drop` summary projection (overlaps Slice 3).
- `drop-manager.html:3057` (v_drop_summary SINGLE) → fold into
  `get-drop` summary projection (overlaps Slice 7 SINGLE).
- `host-profile.html:1057` (v_drop_summary) → fold into `get-host`
  (overlaps Slice 6).
- `drop-manager.html:2722` + `:2947` + `:2960` demand-preview
  reads (`customer_relationships`, `customers`) — dedicated EF or
  fold into `get-drop` (overlaps Slice 7 demand-preview).

Then **REVOKE capstone** — `REVOKE SELECT ON v_drop_summary FROM
anon` once nothing reads it directly, plus the `drop_capacity`
assessment.

Governed by operational learning #54 (every narrowed column list
validated against `information_schema.columns` on the live DB
before merge — SCHEMA.md is orientation, not adjudication) and
the orders.total_pence rule above (operational learning #55) —
any revenue-bearing EF projection must derive per-order revenue
from `orders.total_pence`.

**Priority:** queued after the larger operator-read-auth slices
land. The fold-ins above are the natural completion before the
REVOKE flips on.

SCHEMA.md ↔ live information_schema reconciliation

**Status:** Open. Surfaced 2026-05-19 — SCHEMA.md was proven
stale during the select-narrowing regression captured in
operational learning #54. The 2026-05-19 hotfix surgically
patched four columns into SCHEMA.md but a curated full
regeneration from `information_schema` is still pending.

**Interim contract.** Until SCHEMA.md is regenerated, every
select-narrowing under the T5-A3 / anon-revoke /
operator-read-auth track must be validated against
`information_schema.columns` on the live DB — not against
SCHEMA.md, which is an orientation layer, not adjudication.
Critical rule #13 / operational learning #54 spell out the
verification-SQL fallback when the live DB is not reachable
from the build environment.

**Priority:** parked behind the revenue discount-blindness pass
and the operator-read-auth slices. Documentation hygiene, not a
production-correctness gate while the interim contract holds.

### Tier 5-B — Platform improvements

Smaller cleanups and onboarding enrichments that don't gate anything
but pay down friction and tech debt.

T5-B1: Extract `resolveVendor()` into a shared module ✓ COMPLETE
`assets/hearth-vendor.js` created as a shared module exposing
`window.HearthVendor.resolveVendor(_sb)`. All 12 operator pages
(service-board.html, drop-manager.html, drop-menu.html, brand-hearth.html,
insights.html, customers.html, customer-import.html, onboarding.html,
home.html, hosts.html, host-profile.html, scorecard.html) updated to
load the module after config.js and before vendor-nav.js, with their
inline `resolveVendor()` bodies deleted and call sites rewritten to
`await window.HearthVendor.resolveVendor(sb)` (or `supabase` / `_sb`
depending on the page's local variable). T5-A5 has since landed —
the module now uses session-aware resolution on production and
`?vendor=<slug>` dev override on localhost only.

T5-B2: Onboarding — capture social handles ✓ COMPLETE
Stage 5 in onboarding captures Instagram, Facebook, TikTok, and
WhatsApp Business handles. Writes to `vendors.social_handles` as
jsonb. Skippable.

T5-B3: Onboarding — capture vendor address ✓ COMPLETE
Stage 4 in onboarding captures a free-text address. Writes to
`vendors.address`. Skippable.

T5-B4: Brand Hearth — edit social handles and address ✓ COMPLETE
Brand Identity section extended with a vendorAddress field and four
social handle inputs (Instagram, Facebook, TikTok, WhatsApp Business).
Pre-populated from saved values on load. Saves via the existing
vendors-table upsert pattern.

T5-B5: Schema cleanup — legacy artefacts and missing constraints
Tech debt ticket from the SCHEMA.md generation. Not blocking; tackle
before any T6 production data work so migrations run against test
data, not live vendor data.

Specific items:
- drop_menu_items has both `item_type` and `menu_item_type` columns,
  both NOT NULL. Investigate which is canonical, migrate writes to a
  single column, drop the other.
- drop_products and drop_menu_items both exist as tables. Confirm
  whether drop_products is deprecated and drop it if so.
- Confirm whether drop_products is deprecated and drop it if so.
  drop_menu_items is the canonical table per PR 4b's
  assign-menu-items Edge Function. Investigation: row count on
  drop_products and pg_stat_user_tables.last_seq_scan. Read-only,
  bounded, unblocks no other work.
- drop_capacity table has all-nullable columns, no FKs, and uses
  legacy pizza vocabulary. Likely a stale view that didn't get the
  v_ prefix. Confirm whether it's a relation or a view.
  **✓ RESOLVED / verified 2026-07-15: `drop_capacity` is a view, not a
  table.** This single sub-item is closed; the other items in T5-B5
  remain open and the ticket stays open.
- vendors brand columns — three overlapping generations exist. Pick
  one canonical set, migrate reads/writes, drop the others.
- Missing FK constraints: drops.series_id should reference
  drop_series.id; drop_series.vendor_id should reference vendors.id.
- Legacy NOT NULL columns: orders.pizzas (>= 1 constraint),
  drops.capacity_pizzas, drops.max_orders.
- bundles.vendor_id and products.vendor_id are nullable but always
  set in practice. Tighten to NOT NULL after orphan cleanup.
- hosts.created_by_vendor_id alongside hosts.vendor_id — decide if
  the audit column is still needed.

Reference: SCHEMA.md "Schema observations" section.

T5-B6: invite-vendor — hardcoded production redirect URL
`supabase/functions/invite-vendor/index.ts:64` sets
`redirectTo: "https://lovehearth.co.uk/set-password.html"` on the
`inviteUserByEmail` call. Vendors invited from a preview deploy still
get redirected to production after accepting. Same root-cause class as
the CORS preview-domain issue (PR that introduced
`_shared/cors.ts`) — hardcoded production URL inside an Edge Function.
Fix: derive the redirect host from the request's `Origin` header when
it matches the same allowlist `_shared/cors.ts` already enforces, fall
back to production otherwise. Surfaced during the CORS audit pass.

T5-B7: Edge Functions missing top-level try/catch
`update-vendor`, `complete-onboarding`, and `create-host` have no
top-level `try/catch` around the handler body. An unhandled throw
returns Supabase's default 500 with no CORS headers, which means the
browser surfaces it as an opaque CORS failure rather than the actual
error. This masks unrelated server bugs as apparent CORS errors during
development — the fix has real diagnostic value, not just cosmetic.
The other five functions wrap their bodies in `try/catch` and return a
CORS-decorated 500 via `jsonResponse`. Align the three by adding
matching wrappers. Surfaced during the CORS audit pass.

Status: PARTIAL. update-vendor and complete-onboarding have top-level
try/catch. create-host is missing the wrapper — one function remains
unaligned with the pattern.

T5-B8: invite-vendor — does not use jsonResponse helper
The other seven Edge Functions converged on a `jsonResponse(body,
status)` helper. `invite-vendor` instead inlines `{ ...corsHeaders,
"Content-Type": "application/json" }` at eight separate Response
constructors. Functionally equivalent, structurally inconsistent — and
adds an extra editing surface every time the response shape changes.
Refactor to match the pattern used elsewhere. Surfaced during the CORS
audit pass.

T5-B9: host-profile.html — host-status-field no-ops after update-host migration
The Save button on host-profile.html sends a `status` field, but
`update-host`'s whitelist deliberately excludes `status` (server-
controlled per the Edge Function design). Result: the dropdown is
visible and editable but selections silently fail to persist on
save. Decide whether vendors should be able to set host status
(active / inactive / archived) themselves. If yes: add `status`
to the `update-host` whitelist with valid-value validation. If
no: hide or remove the dropdown from host-profile.html. Surfaced
during the update-host migration audit.

T5-B10: Server-side payload validation on create-drop / update-drop ✓ PARTIAL
update-drop (PR 4a) implements the validation surface: drop_type enum
check, capacity_units_total >= 0, radius_km >= 0, delivery_end >
delivery_start, closes_at <= delivery_start, host_id ownership lookup
against hosts.vendor_id (closes the cross-vendor host-poisoning gap),
capacity_category_id ownership lookup against categories.vendor_id with
slug reconciled server-side (Audit B(a)), and coherence checks on the
fundraising and host_share blocks. transition-drop-status (PR 4a) ports
the publish gate server-side and stamps lifecycle timestamps.

Remaining: retrofit create-drop with the same validation set. Today
create-drop only enforces required-name/slug; the rest of the invariants
are unguarded. Source: see ALLOWED_FIELDS and the validation block in
update-drop/index.ts — port the same checks across. Drop Studio is the
only client today, but a non-Drop-Studio client could insert nonsense
rows via create-drop.

Pass A / A2 addendum (Build Coherence Audit): when retrofitting
create-drop, also add app-layer validation of `drop_type` and
`audience_scope` so the function returns friendly, specific errors.
The DB CHECK constraints (`drop_type IN (neighbourhood, community,
event)`) already backstop integrity, so this is UX, not a
correctness gap. Source: Build Coherence Audit Pass A / A2.

T5-B11: Drop Studio readiness checklist — surface capacity row
explicitly. The Review pane checklist in `drop-manager.html`
(renderReview, lines 3217–3221) shows five rows: Basics complete,
Timing complete, Menu items enabled, Capacity item present,
Commercials valid. "Capacity model set" (capacity_category and
capacity_units_total) is bundled inside `basics_complete` rather
than surfaced as its own row. Post PR 3 fix, capacity is now
publish-gated (not NOT-NULL-gated) — vendors who haven't set
capacity will see "Basics complete" failing without immediately
knowing it's the capacity field. Add capacity-set as its own
readiness row, or add an inline hint inside the basics row, so
the gating reason is legible. Surfaced during PR 3 publish-gate
audit. Low priority — the gate works correctly today; this is
purely a UX legibility improvement.

T5-B12: capacity_category_id reconciliation — wrong-premise correction ✓ CLOSED
The original framing assumed `capacity_category_id` referenced a
missing `capacity_categories` table. That was wrong. The column is a
working FK to the existing `categories` table (which is dual-purpose:
menu-section grouping AND capacity-category grouping per
SCHEMA.md:190). The publish gate works as-is.
What was actually missing was server-side reconciliation between
`capacity_category_id` (uuid) and `capacity_category` (text slug).
update-drop (PR 4a) implements Audit B(a): when a payload includes
`capacity_category_id`, the server looks up the matching row in
`categories` filtered by vendor_id and writes that row's `slug` to
`capacity_category`, ignoring whatever the client sent. The two
columns are now a server-managed pair on the update path. Closing
this entry; T7-13 (capacity model conceptual review) is the right
home for any further capacity-driver rework.

T5-B13: Drop Studio — remove dead `dropStatus` dropdown ✓ COMPLETE
Confirmed complete. dropStatus dropdown removed from drop-manager.html;
no payload.status write paths remain.
Post PR 4a, `update-drop`'s whitelist excludes `status`. Lifecycle
transitions go through `transition-drop-status`. The status dropdown
in the Basics pane (`#dropStatus`) is now a no-op on save — selecting
a value writes to the form payload, the Edge Function silently drops
it, and `loadSelectedDrop()` resets the dropdown to the actual DB
status afterwards. No data inconsistency, but it's dead UX. Remove
the dropdown in PR 4b cleanup, alongside the form-level
`dropData.status` and `payload.status` references in
`getDropPayload()` / `readDropFromForm()`.

T5-B14: Cross-vendor host-poisoning — defence-in-depth on RLS
PR 4a's `update-drop` rejects payloads where `host_id` does not
belong to the calling vendor (lookup against `hosts.vendor_id`).
That closes the save surface on Drop Studio. But direct PostgREST
mutations against `drops` could still in principle write a foreign
host_id if the per-row RLS policy on `drops` does not assert the
host belongs to the same vendor. Audit `drops` and `hosts` RLS
policies and tighten if needed (defence-in-depth — every gap
should be guarded at both the surface and the row level). Surfaced
during PR 4a audit pass.

Observation (parked here for the broader RLS audit): Categories RLS
policies have a duplicate — "Categories: anon select" and
"allow_anonymous_category_select" both grant SELECT to anon/public
with `qual=true`. Also, the "Categories: authenticated owner all"
policy lacks explicit `with_check` (relies on PostgreSQL's fallback
of using `qual` as `with_check` for ALL policies). Not urgent.

- service-board.html:1683 enrichItemDetailsWithProductData() reads
  products by id with no vendor filter — relies on RLS for
  cross-vendor protection. Latent isolation gap that PR 4b's
  assign-menu-items per-item product/bundle ownership check does
  not close (write-side only). Defend at view / RLS layer.

Status: PARTIAL. Write-side closed by update-drop host_id ownership
check. RLS-side defence-in-depth not implemented — no policy
definitions in supabase/migrations/ for drops/hosts cross-vendor guard.

T5-B15: PR 4b — clone-mode for create-drop, retire residual stamps ✓ RESOLVED BY PR 4b
PR 4a left two residual direct-PostgREST writes alongside the
migrated paths because their fields (`series_id`, `series_position`,
`window_group_id`, `status`) were excluded from `update-drop`'s
whitelist (clone-mode shape — stamped on creation only). Targets
were:
- `drop-manager.html` series-template branch (after the update-drop
  call, a follow-up PostgREST `.update({ series_id, series_position,
  status: 'draft' })`).
- `drop-manager.html` `handleCreateEventWindows()` parent
  `window_group_id` stamp.
PR 4b retires both via create-drop clone-mode (using the widened
whitelist landed in PR 4a): series_id / series_position / status
(call site 2) and window_group_id (call site 5) are stamped via
create-drop sibling generation, and the drop_menu_items writes
(call sites 1, 4, 6, 7) move to the assign-menu-items Edge
Function. All residual direct-PostgREST writes on
`drop-manager.html` are now retired.

T5-B16: drop-menu.html — full Edge Function migration for
categories/products/bundles writes ✓ COMPLETE 2026-05-02. Shipped
across three PRs: PR #209 (categories batch — `create-category`,
`update-category`, `delete-category`), PR #211 (products batch —
`create-product`, `update-product`, `delete-product`), and PR #212
(bundles batch — `create-bundle`, `update-bundle`, `delete-bundle`,
`duplicate-bundle`, `save-bundle-line`, `delete-bundle-line`,
covering bundle_lines and bundle_line_choice_products via the
composite functions). All direct client-side PostgREST writes from
drop-menu.html for the catalog tables (categories, products,
bundles, bundle_lines, bundle_line_choice_products) now flow through
Edge Functions following the canonical pattern: `verify_jwt = false`
in `supabase/config.toml`, manual JWT verification via
`anonClient.auth.getUser()`, vendor ownership check via
service-role client, service-role write with tenancy belt and
ALLOWED_FIELDS whitelist, CORS via `getCorsHeaders()` from
`_shared/cors.ts`, top-level try/catch with `jsonResponse` inline
closure. The shared `saveSortOrderBatch` upsert path is deliberately
out of scope and tracked separately as T5-B34. Two follow-up
hardening tickets surfaced during the bundles batch and are tracked
as T5-B36 (duplicate-bundle rollback verification) and T5-B37
(save-bundle-line update-path partial-failure note).

Manifestation of the auth-not-attached pattern (operational
learnings #12, #13, #14, #16), fourth surface across the platform
after hosts SELECT, customers UPSERT, and host UPDATE — all now
resolved via Edge Function migration. drop-menu.html is the
remaining surface.

**Production diagnosis (2 May 2026)**

Live production test against Test 12 (vendor_id
32a6665a-7b68-428d-90b3-d9b11259c16e, slug test-12) with Network tab
open. Attempted to create a category via the drop-menu.html "Create
Category" modal. POST /rest/v1/categories returned 401 with PostgREST
error code 42501 ("new row violates row-level security policy for
table categories"). Captured request header:

  Authorization: Bearer sb_publishable_GftZ3Mw1M2-jb2bStjv80Q_gRDC9FzD

This is the publishable anon key, not a user JWT. The request
therefore evaluated as the anon role server-side. The "Categories:
authenticated owner all" RLS policy is correctly scoped (authenticated
role, vendor_id IN (SELECT id FROM vendors WHERE auth_user_id =
auth.uid())) and does not apply to anon. No anon INSERT policy exists
on categories (correctly — adding one would be a security regression
allowing any anon caller to insert categories for any vendor by
passing vendor_id in the body).

drop-menu.html uses inline `window.supabase.createClient(SUPABASE_URL,
SUPABASE_ANON_KEY)` rather than `window._getHearthClient()`. This is
part of the failure mode (the inline client does not benefit from the
manual Authorization header workaround in `assets/config.js` per
operational learning #14) but is not the durable fix. Even with the
singleton, the reliable platform pattern is Edge Function migration
per operational learning #16.

RLS policies on categories, products, and bundles were checked during
the audit and are correct. They do not need changing — the request
needs the right Bearer token, which the Edge Function path provides
via `client.functions.invoke()`.

**Migration scope — nine Edge Functions**

Following the create-host / update-host pattern:

- create-category, update-category, delete-category
- create-product, update-product, delete-product
- create-bundle, update-bundle, delete-bundle

Plus likely (verify during build): bundle_lines and
bundle_line_choice_products writes — same page, almost certainly same
RLS surface and same bug. If confirmed broken during the bundle
build, fold into the bundle batch rather than a separate ticket.

Plus rewrites in drop-menu.html: replace direct PostgREST writes with
`supabase.functions.invoke()` calls against the new functions. While
rewiring, also switch from inline `window.supabase.createClient()` to
`window._getHearthClient()` for read paths on the same page (read
paths are not currently broken because of the permissive anon SELECT
policies, but the singleton is the correct pattern).

**Reference patterns**

- INSERT shape: `supabase/functions/create-host/index.ts`. Manual JWT
  verification via `anonClient.auth.getUser()`, ownership check via
  service-role client against `vendors.auth_user_id`, service-role
  write.
- UPDATE shape: `supabase/functions/update-host/index.ts`. Adds
  ALLOWED_FIELDS whitelist and tenancy belt with
  `.eq("id", x).eq("vendor_id", y)`.

Each Edge Function must follow CLAUDE.md rule #15 (deploy-before-merge)
and operational learning #16 (verify_jwt = false in
supabase/config.toml, in-function getUser, ALLOWED_ORIGIN, jsonResponse
helper from _shared/cors.ts).

**Estimated build effort**

3–4 Claude Code build sessions due to the function count and
deploy-before-merge cadence. Per operational learning #15, single-
file-stop discipline applies — one logical chunk per session, fresh
session per chunk. Recommended sequencing: categories first (no FK
dependencies on products or bundles), products second, bundles last
(most complex, plus bundle_lines / bundle_line_choice_products if
confirmed in scope).

Cross-reference T5-B23 (production-state ticket — categories blocked
on fresh-vendor inserts). Once this migration lands, T5-B23 closes.

T5-B17: underlying auth-not-attached client bug. The Edge Function
migration treats symptoms; the underlying problem is that
`supabase.auth.getSession()` doesn't return a hydrated session on
certain pages, even when the user is logged in. Three confirmed
surfaces: drop-menu.html category INSERT (T5-B16), drop-manager.html
host SELECT (PR 4a verification), order page customer UPSERT (earlier
RLS work). Possible causes: race condition between page load and
`getSession()`, session storage hydration issue, supabase-js client
initialisation pattern. Worth investigating before declaring the
platform "done" — the Edge Function migration makes this
non-blocking but doesn't address root cause. Slot after Priority 7,
alongside the broader RLS hygiene workstream (T5-B14).

Status: PARTIAL. Manual Authorization header workaround implemented
in assets/config.js via onAuthStateChange. Root-cause session
hydration race not resolved.

T5-B18: Stripe status visibility surface.
✓ COMPLETE 2026-05-03. PR #221 merged. Payments workspace card
added to home.html surfacing four Stripe Connect states (not
started / checking / incomplete / ready). Deferred fast-path:
stripe_onboarding_complete=true renders immediately with no API
call; all other states call check-stripe-connect-status after first
paint. Action buttons call create-stripe-connect-link (onboard
states) or create-stripe-login-link (dashboard states) —
vendor-specific Express dashboard, not platform owner account. New
Edge Function create-stripe-login-link deployed.

No UI path to inspect, manage, or re-enter Stripe Connect
onboarding from any vendor page. Vendor cannot self-serve "am I set
up to get paid" status; operator (Edward) cannot diagnose vendor
payment readiness without SQL. Surfaced when checking Test 11's
Stripe state during Test 12 fixture setup. Likely belongs in a
future Stripe-surface workstream of its own (no existing priority
covers full lifecycle). Not blocking PR 4b.

T5-B19: drop-menu.html surfaces a CSP eval-blocked warning in the
browser console — "Content Security Policy of your site blocks the
use of 'eval' in JavaScript". Probably a third-party library
(qrcode generator or similar). Minor, not blocking. Worth
identifying which lib at some point.

T5-B20: PR 4b build session — hard prerequisite
Before deploying update-drop with the W-4 server guard, run
`select count(*) from drops where capacity_category is not null and
capacity_category_id is null;` against production. Expected: 0. If
non-zero, pause build session pending Edward's decision per
PR-4B-AUDIT.md Section 7.3 (backfill / clear / defer).

T5-B21: Window cancellation with existing orders — distinct from
remove-event-window. Future flow with refunds, customer
notifications, audit trail. Not a force flag on remove-event-window
(per PR-4B-AUDIT.md Section 9.5). Out of scope until
cancellation-with-refunds infrastructure exists.

T5-B22: Customer-flow order placement fails on order_items RLS insert
✓ COMPLETE 2026-05-03.

Resolved by test, not by build. Both `create-order` (v7) and
`cancel-order` (v2) Edge Functions were already fully built and
deployed by the time this ticket was formally investigated, alongside
`stripe-webhook` and `fetch-order`. The original RLS failure on
order_items was caused by the Edge Function not existing at the time
of the PR 4b fixture test — the client was still falling back to
direct PostgREST writes against `order_items`, which RLS correctly
rejected. Once the Edge Function path was wired up (Phase 2 / PR
#204) and order.html rewired to invoke it (Phase 3, merged
2026-05-01), the orphan-row failure mode was structurally impossible:
all five tables (orders, order_items, order_item_selections,
customers, customer_relationships) are now written atomically by the
service-role client inside `create-order`.

End-to-end verification 2026-05-03: order placed against Test 11 via
the production order.html flow. orders row created with
`status='placed'` and `stripe_payment_status='paid'` confirmed in the
database. order-confirmation.html rendered correctly via
`fetch-order` with the matched-pair authorization (order_id +
session_id). No orphan rows, no RLS errors, no client-side
PostgREST writes against the affected tables.

Lesson captured as operational learning #24 and #25: when a bug is
logged against a missing function, check whether the function has
since been built before scoping a build session. The audit-first
opening sequence (ls supabase/functions/, cat the relevant function,
check deployment, check schema) takes minutes and avoids planning a
significant build that the codebase no longer needs.

T5-B23: categories RLS violation on fresh-vendor inserts —
production-state ticket. ✓ COMPLETE 2026-05-03.

Confirmed broken in production 2 May 2026 via captured-headers test
against Test 12. Root cause is the publishable-key auth-attach bug
(operational learnings #12, #13, #14, #16), not a missing RLS policy.
See the production status snapshot in CLAUDE.md for the captured
Bearer header and the PostgREST 42501 response.

This ticket tracks the production state (categories INSERT blocked
on fresh vendors, blocking the entire vendor activation path:
categories → products → drops). T5-B16 tracks the migration work
that resolves it.

Closes when T5-B16 lands and a fresh-vendor category create succeeds
end-to-end on Test 12.

**Resolution (2026-05-03):** T5-B16 (Edge Function migration for
categories) resolved the root cause. Verified 3 May 2026 by logging
in as Test 12 and successfully creating Test Category D via the
Menu Library. "All changes saved" confirmed. The publishable-key
auth-attach bug no longer affects category writes because
`create-category`, `update-category`, and `delete-category` all
route through Edge Functions.

T5-B24: Password reset page — button stuck on "Sending..."
Low priority UX bug. On reset-password.html the submit button never
resolves to a "Sent" / success state — it stays on "Sending..."
indefinitely after submit. The "Check your inbox" confirmation block
below the button renders correctly, so the flow functionally works and
the user is not blocked. Fix is cosmetic: resolve the button state (or
hide the button) once the confirmation block appears.

T5-B25: admin.html — vendor creation is not atomic
If the invite-vendor Edge Function call fails, the vendor row is still
created, leaving orphan records in the database. Should either be
wrapped in a transaction (both insert and invite succeed or neither
does) or the invite should happen before the vendor row insert.
Medium priority refactor.

T5-B26: admin.html — ADMIN_UID hardcoded in two places ✓ COMPLETE 2026-05-21

Retired across all three sites: admin.html,
supabase/functions/invite-vendor/index.ts, and
supabase/functions/create-vendor/index.ts. The third site was caught
by grep against the actual repo — the handover named two sites; see
operational learning #57. All three now call the admin-verify Edge
Function or check the admins table via service role; the literal UID
string is gone.

Closes alongside T7-14 (multi-admin access — the admins table is the
replacement). See CLAUDE.md "Platform admin MVP" section for the
schema, Edge Functions, and canonical admin EF auth pattern.

Cross-reference: T7-14 (admins table), T7-1 (MVP cockpit closure that
landed in the same workstream).

[Verification confirmation — 2026-06-29] Re-verified against the live
system tonight. Admin identity is DATA-DRIVEN via the `admins` table,
decided by the caller's verified-JWT `auth_user_id` against
`is_active = true` — NO hardcoded UID remains anywhere in the auth path
(checked the auth-callback admin-verify branch and all admin EFs).
Inherently multi-admin. Server-side gating is enforced across SEVEN
Edge Functions, each running the same admins-table check via a
service-role client (not client-side bypassable): `admin-verify`,
`admin-list-vendors`, `admin-get-vendor`, `admin-list-vendor-drops`,
`admin-list-drop-orders`, `invite-vendor`, `create-vendor`. The two
surface pages `platform-admin.html` + `platform-admin-vendor.html` exist
and gate via `admin-verify`. PROVISIONED in the DB tonight: two active
admins — `ed@lovehearth.co.uk` and `robin@lovehearth.co.uk`, both
`is_active = true` — so Robin is a working second admin today (no
further admin provisioning needed). Caveat carried forward as a new
ticket: the `admins` table itself has no committed CREATE TABLE
migration (it was created out-of-band in the SQL editor) — see
T-admins-table-migration-backfill below.

T5-B27: Edge Function `.single()` vs `.maybeSingle()` consistency sweep ✓ COMPLETE
Confirmed complete. All audited Edge Functions use .maybeSingle() for
ownership lookups; no .single() offenders found.
PR #192 flipped `create-host` from `.single()` to `.maybeSingle()` on
the ownership check. `.maybeSingle()` is the canonical default — it
returns `null` when no row is found, where `.single()` throws a 406
that bypasses the explicit `if (!vendor)` guard immediately
following. Confirmed consistent after #192: `update-vendor`,
`list-hosts`, `complete-onboarding`, `get-host`, `create-host`.
Audit remaining functions and flip if needed:
`check-stripe-connect-status`, `create-stripe-connect-link`,
`invite-vendor`. Low priority — no known live failures, just
hygiene.

T5-B28: `update-host` Edge Function (Priority 6 — migration sequence) ✓ COMPLETE
Confirmed complete. update-host Edge Function exists with JWT
verification, vendor ownership check, and ALLOWED_FIELDS whitelist.
host-profile.html invokes via functions.invoke().
Migrate the direct `hosts` UPDATE at `host-profile.html:1007` to a
new `update-host` Edge Function following the same pattern as
`update-vendor`: auth via `supabase.auth.getUser()`, ownership check
on `vendors`, service-role write, explicit field whitelist. Remove
the TODO comment added by PR #192 once landed.

Silent-204 behaviour confirmed in production on 2026-04-27. Host
profile save shows the success toast but writes are RLS-rejected.
Direct PATCH to `/rest/v1/hosts?id=eq.<host-id>` returns 204 with
empty body. This is now blocking host editing entirely on
production. Operational learning #14 verified in the wild — this is
no longer theoretical.

T5-B29: Multi-window parent drop fulfilment.mode bug.
Surfaced during T5-B22 Phase 3 manual testing on 2026-05-01. When
a customer orders against a drop with `window_group_id` set and
`fulfilment_mode = null` (the multi-window parent pattern), the
`buildCheckoutPayload()` helper in order.html sends
`fulfilment.mode: null`. The `create-order` Edge Function rejects
this with a 400 because fulfilment mode is a required server-side
field. The root cause is that the parent drop intentionally has no
fulfilment mode of its own — fulfilment is a property of each
child window. The customer must be steered to a specific child
window before the basket and checkout pane are reachable.

Two viable fixes:
- (a) order.html's window-selection step in `init()` routes
  customers to a child drop (by id or slug) before the basket
  pane is allowed to render. Cleanest customer-flow story:
  customers never see a parent drop URL with an active basket.
- (b) `buildCheckoutPayload()` reads `fulfilment_mode` from the
  selected child window in state rather than from `state.drop`,
  and `validateCheckout()` refuses to submit when
  `fulfilment.mode` is null with a user-friendly error rather
  than relying on the server's 400.

Either fix is sufficient. Option (a) is the architecturally
cleaner choice — option (b) is a defensive belt that's worth
adding regardless. The 400 is currently invisible to the customer:
they see a generic checkout error rather than a clear instruction
to pick a window. Whatever ships, the user-visible fallback path
must surface a readable message.

Discovered alongside T5-B30 during the same Phase 3 session.
Distinct enough to track separately because the fix lives in
order.html state-machine logic rather than in CORS configuration.

T5-B32: Duplicate anon SELECT policies on products. ✓ COMPLETE 2026-07-15.

**Closure note (2026-07-15):** Products RLS confirmed clean — a single
anon SELECT policy active plus authenticated owner-scoped access, verified.
The overlapping/duplicate anon SELECT policies this ticket tracked are gone,
so the policy set is now unambiguous. Closed per this session's verification.

Original context —
Surfaced during the 2 May 2026 audit while reviewing categories /
products / bundles RLS in support of T5-B16. The products table has
multiple anon SELECT policies that overlap (same pattern as the
categories observation noted in T5-B14). Postgres RLS is additive,
so this is functionally a no-op — but it adds editing surface and
makes the policy set harder to reason about during the broader RLS
hygiene workstream.

Pulled forward from T5-A3 (full RLS rewrite) because today's audit
surfaced it specifically. Low priority cleanup; can be folded into
T5-A3 when that workstream runs, or picked off independently as a
one-line policy DROP if convenient.

Reference: full RLS audit performed in session dated 27 April 2026
(covered categories/drops/products/bundles policy duplication). The
2 May audit confirmed products specifically still has the duplicate.

T5-B33: Restore missing T5-B29 / T5-B30 / T5-B31 ticket bodies in
BACKLOG.md. ✓ COMPLETE / obsolete — T5-B29/B30/B31 detail now lives in
self-sufficient CLAUDE.md open-index lines (full paragraph-length, with
context + fix). Restoring separate BACKLOG bodies is no longer warranted —
confirmed 2026-06-27. (T5-B29 itself was separately resolved 2026-06-27 by
the fulfilment mandate.)
CLAUDE.md's Tier 5-B index lists T5-B29 (multi-window
parent drop fulfilment.mode bug), T5-B30 (Edge Function CORS
allow-list excludes Netlify deploy previews), and T5-B31 (legacy
capacity columns cleanup) as open tickets, but BACKLOG.md has no
corresponding ticket bodies for any of the three. The two-file
system relies on every CLAUDE.md index entry having a BACKLOG.md
body — this drift was surfaced during the 2 May 2026 audit-findings
doc-sync when attempting to add T5-B32 after T5-B31. Restore the
three bodies from session memory: T5-B29 and T5-B30 were both
surfaced during T5-B22 Phase 3 testing (1 May 2026), T5-B31 is the
legacy capacity columns cleanup (orders.pizzas, drops.capacity_pizzas,
drops.max_orders) flagged in earlier work. Each body should follow
the existing T5-B ticket format: short title, paragraph of context,
proposed fix, dependencies if any. Bounded one-session piece of work.

T5-B34: drop-menu.html shared saveSortOrderBatch upsert path
migration to Edge Functions ✓ COMPLETE 2026-05-03. Shipped via PR
#214 (commit 0e7137c, merged into b7ddb03).

Three sibling Edge Functions (update-category-sort-order,
update-product-sort-order, update-bundle-sort-order) replace
the shared client-side saveSortOrderBatch upsert path on
drop-menu.html. Each function follows the canonical T5-B16
pattern (verify_jwt = false, manual JWT verification via
anonClient.auth.getUser(), vendor ownership check via
service-role client, top-level try/catch with jsonResponse
inline closure, CORS via getCorsHeaders() from _shared/cors.ts)
plus a new bulk-ownership-check pattern for the multi-row write
case: .in('id', ordered_ids).eq('vendor_id', vendor_id) followed
by length-equality assertion against ordered_ids.length. This
is the reference pattern for any future bulk-write Edge Functions.
Server controls the sort_order gap value ((i + 1) * 10) — clients
send IDs only, server builds the row payload. Tightens the attack
surface and keeps the gap value as a single-source-of-truth platform
invariant.

Page-side: saveSortOrderBatch in drop-menu.html retained its name
and signature, body swapped for a tableName → functionName
dispatcher invoking the new functions. Three call sites in
persistCurrentVisibleOrder unchanged.

Verified end-to-end on Test 12 deploy preview across all three
reorder paths (categories, products, bundles) with 200 responses,
order persisting through hard refresh, and no console errors.

T5-B16 (parent migration) closes with this. drop-menu.html has zero
direct client-side writes for any catalog table.

Surfaced during build: an initial upsert pattern (.upsert(rows,
{ onConflict: 'id' })) was deployed and immediately failed on the
first drag with `null value in column "name" of relation
"categories" violates not-null constraint`. supabase-js's
.upsert() builds an INSERT...ON CONFLICT statement, and Postgres
validates the whole INSERT against table constraints before
conflict resolution applies the UPDATE half — so a payload
missing required columns fails even when every row matches an
existing primary key. Fixed by replacing the upsert with a
sequential .update() loop. Captured as operational learning #23.

Surfaced during the 2 May 2026 T5-B16
category batch (PR #209). The category batch deliberately migrated
only create/update/delete call sites and left the shared
saveSortOrderBatch path on direct PostgREST. saveSortOrderBatch is
shared infrastructure across categories, products, and bundles
(drop-menu.html:1709) — a single function takes a table name
parameter and runs an upsert. This means category drag-reorder is
silently broken on production after PR #209 merged (same root cause
as the rest of T5-B16: publishable-key auth-attach bug, operational
learnings #12/#14/#16). Products and bundles drag-reorder will
likewise be silently broken once their respective T5-B16 batches
ship.

**Proposed fix: three sibling Edge Functions, not a generic
dispatcher.** update-category-sort-order, update-product-sort-order,
update-bundle-sort-order. Each follows the canonical pattern
established by the rest of T5-B16: verify_jwt = false, manual JWT
verification via anonClient.auth.getUser(), ownership check via
service-role client against vendors.auth_user_id, service-role
upsert with tenancy belt (every row in the upsert payload must
match the ownership-checked vendor_id; reject the request if any
row's vendor_id mismatches). Reasoning: a generic
update-sort-orders function taking a table name parameter would
reimplement ownership-check logic and introduce an attack surface
where a caller could attempt to update sort orders on tables that
aren't categories/products/bundles. Three siblings keep the
per-function blast radius tight and stay consistent with the rest
of the T5-B16 migration.

**Sequencing:** ship after all three T5-B16 batches
(categories/products/bundles) land. Doing it earlier means the
same shared path migrates while different batches are still on
the old PostgREST path — confusing partial state. Doing it later
is clean: by the time T5-B34 ships, drop-menu.html is fully off
PostgREST writes for categories/products/bundles.

**Page-side rewire:** saveSortOrderBatch in drop-menu.html
becomes a dispatcher on the page side — given a table parameter,
it invokes the matching Edge Function via
supabase.functions.invoke(). Single page-side function, three
page-side call sites unchanged.

Bounded one-session piece of work. Estimated 1 Claude Code build
session (three near-identical functions plus minor page-side
wiring change). Closes when fresh-vendor drag-reorder for
categories, products, and bundles all persist correctly on Test
12 deploy preview.

Cross-reference: T5-B16 (parent migration), PR #209 (category
batch that surfaced this).

T5-B35: drop-menu.html duplicateCurrentProduct drops suitability
flags ✓ COMPLETE 2026-05-03 (PR #218).

Three-line fix to `duplicateCurrentProduct()` in drop-menu.html
adding `travels_well`, `suitable_for_collection`, and
`prep_complexity` to the duplicate payload sourced from the
original product. Resolved the silent loss of suitability
metadata when a vendor used Duplicate in the product editor.

During testing, `v_products_enriched` was discovered to be missing
these three columns — the underlying `products` table held the
saved values correctly, but the view returned `undefined` to the
client which fell back to defaults, making correctly-saved data
look like a save bug. View fixed in production via SQL editor
(`CREATE OR REPLACE VIEW` with the three columns appended; column
reorder rejected with error 42P16 so append-only). View-audit
ticket logged as T5-B40 to confirm no other `v_*_enriched` view
has the same gap. Lessons captured as operational learnings #26
(read-write loop audit) and #29 (symptom ambiguity).

`duplicateCurrentBundle` was checked for an equivalent
metadata-loss gap during T5-B16 batch 3 prerequisite investigation
(2 May 2026). None was found — the duplicate copies every column
the client knows about for `bundles`, `bundle_lines`, and
`bundle_line_choice_products`. Future investigators do not need to
repeat this check.

T5-B36: duplicate-bundle rollback verification. The
`duplicate-bundle` Edge Function (shipped in PR #212 as part of
T5-B16 batch 3) clones a bundle by performing sequential
service-role inserts: parent `bundles` row, then each
`bundle_lines` row, then each `bundle_line_choice_products` row.
On partial failure mid-clone, the function attempts a best-effort
rollback by deleting the rows it inserted in reverse order. If the
rollback itself fails (e.g. transient database error during the
delete), the function logs the rollback failure and re-throws the
original insert error. The failure mode this leaves behind: a
half-cloned bundle remains visible to the operator on
drop-menu.html, with no clear signal that it is half-cloned.

**Risk profile:** identical to today's pre-migration client code,
which also had no transactional guarantee across the multi-step
clone. Not a regression.

**Proposed fix:** add a final reconciliation step after rollback
that verifies the new bundle was fully removed; if not, retry the
deletion or surface a clearer error to the caller (e.g. include
the orphan bundle id in the response so the operator can clean up
manually). Better still: rewrap the entire clone in a Postgres
function called via `rpc()` to get true transactional semantics.

**Priority:** low — same risk profile as the pre-migration code,
no known live failures, hardening rather than bug fix.

**File:** `supabase/functions/duplicate-bundle/index.ts`.

Cross-reference: T5-B16 (parent migration), T5-B37 (sibling
partial-failure note for save-bundle-line).

T5-B37: save-bundle-line update-path partial-failure note. The
`save-bundle-line` Edge Function (shipped in PR #212 as part of
T5-B16 batch 3) handles two code paths controlled by whether the
client supplies an existing `bundle_line_id`:
- INSERT path (no id): inserts a new `bundle_lines` row and then
  inserts any `bundle_line_choice_products` children.
- UPDATE path (id supplied): updates the existing `bundle_lines`
  row first, then reconciles `bundle_line_choice_products`
  (deletes children no longer in the payload, inserts new ones,
  updates existing ones).

**Failure mode:** on the UPDATE path, if the line update succeeds
but the children reconcile fails, the line is already updated and
the children are left inconsistent with the new line state. There
is no rollback of the line update on children-reconcile failure.

This matches today's pre-migration client-side behaviour
(drop-menu.html performed the same line-then-children sequence
with no transactional wrapper) and was deliberately preserved
during T5-B16 batch 3 to keep the PR scoped to the migration
itself. Not a regression — but worth fixing as part of the
broader transactional-integrity workstream.

**Proposed fix:** wrap the line update + children reconcile in a
Postgres function called via `rpc()` for true transactional
semantics, OR add explicit rollback logic that captures the
pre-update line state and restores it if the children reconcile
fails.

**Priority:** low — known constraint, documented, no known live
failures. Same risk profile as pre-migration.

**File:** `supabase/functions/save-bundle-line/index.ts`.

Cross-reference: T5-B16 (parent migration), T5-B36 (sibling
rollback-verification ticket for duplicate-bundle).

T5-B40: Audit v_*_enriched views for missing columns.

**Status:** Backlog. Pre-launch hygiene.

**Issue:** During T5-B35 testing (3 May 2026), `v_products_enriched`
was discovered to be missing the `travels_well`,
`suitable_for_collection`, and `prep_complexity` columns. The
product editor form was reading from this view and falling back to
defaults when the columns came back undefined, making it appear
that saves weren't sticking. The underlying `products` table held
correct data throughout — the view was the silent gap. View fix
applied in production via SQL editor (`CREATE OR REPLACE VIEW` with
columns appended).

**Fix:** Audit every `v_*_enriched` view in the schema and confirm
each exposes every column its corresponding write-path Edge
Function whitelists. Specifically verify against the matching
`update-*` / `create-*` ALLOWED_FIELDS sets:
- `v_products_enriched` ↔ `update-product` / `create-product`
- `v_bundles_enriched` ↔ `update-bundle` / `create-bundle`
- `v_bundle_lines_enriched` ↔ `save-bundle-line`
- `v_bundle_line_choice_products_enriched` ↔ `save-bundle-line`
  (choice_product_ids)
- `v_drop_summary` ↔ `update-drop` / `create-drop`
- `v_drop_menu_items_enriched` ↔ `assign-menu-items` and related
- `v_menu_library_items` ↔ `update-product` / `update-bundle`
- Any other `v_*_enriched` view discovered during the audit.

For each mismatch, append missing columns to the view definition
(`CREATE OR REPLACE VIEW` only allows append, not reorder/insert —
Postgres rejects column reordering with error 42P16). Update
SCHEMA.md views section to note any column-level detail worth
recording.

Cross-reference: T5-B35 (surfacing fix), operational learning #26
(read-write loop audit), operational learning #29 (symptom
ambiguity).

T5-B38: T5-B16 bulk-write Edge Functions — migrate to Postgres
RPC for true atomic transactions. Sweep ticket grouping T5-B34's
new sort-order functions with the existing partial-failure
hardening tickets T5-B36 and T5-B37.

The T5-B16 migration shipped 12 Edge Functions covering all
catalog write paths from drop-menu.html. Of those, several
perform multi-step writes with no transactional guarantee:

- `duplicate-bundle` clones a bundle via sequential service-role
  inserts across `bundles`, `bundle_lines`, and
  `bundle_line_choice_products` with best-effort rollback on
  partial failure (T5-B36).
- `save-bundle-line` UPDATE path updates the line row first, then
  reconciles `bundle_line_choice_products` children — line update
  succeeds but children-reconcile fails leaves inconsistent state
  (T5-B37).
- `update-category-sort-order`, `update-product-sort-order`,
  `update-bundle-sort-order` perform a sequential `.update()` loop
  across N rows; partial failure mid-loop produces visibly weird
  ordering on the page but no orphans (T5-B34).

The proper hardening for all three patterns is the same: rewrap
the multi-step writes in Postgres functions invoked via `rpc()`
to get true transactional semantics. One database round-trip,
atomic commit or atomic rollback, no half-states.

**Scope of this sweep:**

- `duplicate-bundle` → `rpc('duplicate_bundle_atomic', ...)`
- `save-bundle-line` → `rpc('save_bundle_line_atomic', ...)`
- `update-category-sort-order` → `rpc('reorder_categories', ...)`
- `update-product-sort-order` → `rpc('reorder_products', ...)`
- `update-bundle-sort-order` → `rpc('reorder_bundles', ...)`

Each requires: a Postgres function (created via SQL editor by ed,
matching the existing pattern of all schema work), an Edge
Function rewrite to call `rpc()` instead of the current sequential
service-role writes, and verification that the existing JWT
verification + vendor ownership check + bulk ownership check
pattern is preserved (the RPC body itself runs as the calling
role, but the Edge Function still verifies auth before dispatching
to the RPC).

**Priority:** low. Risk profile across all five functions is
identical to today's pre-RPC behaviour (no regression, no known
live failures, hardening rather than bug fix). Cost-of-failure for
all five is bounded (visible UI weirdness, recovery is "try
again," no data loss).

**Sequencing:** can be done as one PR or split per function. One
PR is cleaner — establishes the RPC pattern once, applies
consistently across all five — but is larger. Split-per-function
is safer for incremental testing. Architectural decision at start
of the build session.

**Closes:** T5-B36, T5-B37 (folded in). Itself once the five
functions are migrated and verified.

Cross-reference: T5-B16 (parent migration), T5-B34 (sort-order
shipping that surfaced this need consolidating), T5-B36
(duplicate-bundle rollback), T5-B37 (save-bundle-line partial
failure).

**Note (2026-05-03):** `create-order` also performs sequential
service-role writes across orders, order_items,
order_item_selections, customers, and customer_relationships rather
than wrapping the chain in an RPC. This is consistent with the rest
of the platform's Edge Function pattern at this stage — the same
risk profile as the bundles/sort-order functions listed above (no
true atomic commit, best-effort handling on partial failure). Folds
into T5-B38 as a sixth function to migrate when this sweep runs.
Not a regression vs the pre-Edge-Function client-side path it
replaced; hardening rather than bug fix.

T5-B39: Orders RLS audit — remove permissive anon policies on
orders. ✓ COMPLETE 2026-05-03. Two policies on the `orders` table need removing:
- "Orders: anon select" (qual: `true`) — exposes every order on
  the platform to any anonymous caller. This includes
  customer_email, customer_phone, customer_postcode,
  delivery_address, customer_notes, and total_pence across every
  vendor.
- "orders_update_public" — allows any anon or authenticated caller
  to UPDATE any order with no restriction. Covers the same
  customer-PII fields plus status, stripe_payment_status, and
  capacity-affecting columns.

Both predate the create-order / fetch-order / cancel-order Edge
Function migration and are no longer needed by any legitimate
client path. fetch-order uses the service-role client with a
matched-pair (order_id + session_id) check; cancel-order uses the
service-role client with the same matched-pair check.

**Action:** Ed to remove both policies from the Supabase SQL
editor. No code change required on the client or Edge Function
side. Confirm via captured-headers test that order placement,
confirmation page render, and cancel-on-return all still work end
to end after the policies are dropped.

**Priority:** high from a security standpoint — anon SELECT
exposes all customer PII platform-wide, anon UPDATE allows tampering
with order state. Low effort: two DROP POLICY statements.

Surfaced during the 2026-05-03 RLS audit alongside the T5-B22
investigation. Cross-reference: T5-A3 (broader RLS rewrite — this
is one specific instance of the wider permissive-policy cleanup),
T5-B32 (sibling cleanup on products SELECT policies).

**Resolution (2026-05-03):** the two dangerous policies ("Orders:
anon select" and "orders_update_public") were already absent from
the database when investigated — removed in an earlier session.
Additionally removed "anon_update_order_status" (qual: `true`,
allowing any anon caller to update any order by ID) and three
redundant anon INSERT duplicates ("Allow anon to insert orders",
"allow_anonymous_order_insert", "anon_insert_orders"), retaining
only "Orders: anon insert" as the single anon INSERT policy.
Verified end-to-end: test order placed on Test 11 post-cleanup
returned `status=placed`, `stripe_payment_status=paid`. No
legitimate client path uses anon role for order updates —
`cancel-order`, `stripe-webhook`, and `fetch-order` all use the
service-role client.

T5-B41: drop-manager.html `enrichHostPreview` appends rather than
replaces — Complete host profile link rendered multiple times.

**Status:** Backlog. Pre-launch hygiene. Cosmetic, no data
impact.

**Issue:** Surfaced during T4-37 production verification on 4
May 2026. The "Complete host profile →" link in the Selected
Host preview block on drop-manager.html (Operating Setup pane)
renders 2–3 times when a host is selected. Confirmed on Test 11
with newly-created host "Eddie's Play Pen" — the link appeared
three times. Pre-existing bug; T4-37 work did not introduce it
but did surface it.

**Root cause:** `enrichHostPreview()` (around
drop-manager.html:2350) appends enrichment HTML to the
preview's existing `innerHTML` rather than replacing the
enrichment block. The function is called from three places:
`populateForm()`, `markDirty()`, and the inline `createHost()`
flow. A single host selection that triggers any combination of
these three call paths produces N "Complete host profile →"
links where N is the number of triggers fired.

**Fix:** Restructure `enrichHostPreview()` to either (a) build
the enrichment block as a single string and replace a dedicated
enrichment container's innerHTML, or (b) clear any existing
enrichment block before appending. Approach (a) is cleaner —
introduce a `<div id="hostPreviewEnrichment">` inside the
preview container, render the enrichment into that container
each time, and let the basic name/type/postcode line stay
outside it.

**Verification:** select a host with an incomplete profile,
confirm only one "Complete host profile →" link renders;
trigger `markDirty()` (e.g. type into another field), confirm
still only one; switch hosts, confirm only one; create a new
host inline, confirm only one.

**Out of scope:** the `state._fullHosts` enrichment cache. That
caching pattern is correct and should not be changed by this
ticket.

**Priority:** low — purely visual, does not affect host data,
host selection, or drop creation. Bounded one-session piece of
work.

Cross-reference: T4-37 (parent verification surfaced this).

**Closure note (2026-05-21):** Fixed in feature/t8-3-home-copy. renderHostPreview() now includes a dedicated #hostPreviewEnrichment div; enrichHostPreview() replaces its innerHTML rather than appending to the outer preview container. Surfaced during T8-3 Drop Studio copy audit.

### T5-B42 — Edge Function migration for authenticated drops table reads ✓ COMPLETE

**Status update (2026-05-12):** ✓ COMPLETE. Shipped across three PRs:
- PR #244 — get-drop Edge Function + drop-manager.html rewire (loadSelectedDrop, duplicateDrop, createEventWindow source fetches)
- PR #246 — list-drops Edge Function + service-board.html, drop-manager.html sibling window queries, brand-hearth.html rewires
- PR #247 — home.html rewires (final session)

All 10 identified direct PostgREST reads against the raw drops table on authenticated operator pages have been migrated. The platform has no remaining surfaces that depend on the user JWT being honoured by direct PostgREST queries for drops. Catering Direct (the triggering fixture — vendor with only draft drops) verified working end-to-end.

**Status:** Open. Tier 5-B. Direct successor to T5-B16 (catalog writes migration), applied to drops reads.

**Issue:**

The platform's publishable-key auth-attach issue (operational learnings #12, #13, #14, #16, #17) is still active for direct PostgREST reads against tables with restrictive anon SELECT policies. Authenticated requests are silently treated as anon — the JWT is attached to outbound requests (verified via the assets/config.js global.fetch wrapper) but PostgREST does not honour it for direct table reads.

For the `drops` table specifically, the anon SELECT policy is scoped to `status IN ('live', 'scheduled', 'completed')`. Authenticated users cannot see their own draft drops via direct PostgREST queries. The bug is normally masked because:

1. Drop Studio loads its drop list from `v_drop_summary` (which has no RLS — anon sees everything)
2. Most vendors have at least one live drop, so anon can see at least some rows

But when a vendor has ONLY draft drops (e.g., a brand-new vendor mid-onboarding), the bug becomes fully visible: `loadSelectedDrop` returns null for every drop, the catalogue won't render, and Drop Studio appears completely broken.

**Confirmed in production 11 May 2026** against Catering Direct (vendor_id `a2a757fd-6882-49f8-9a54-7e682eab1e90`). Verification:

- SQL editor (service role): drops with that vendor_id exist
- Browser console as authenticated Test 11 user: `from('drops').select().limit(10)` returned only `live` drops across multiple vendor_ids — the unmistakable anon signature
- Healthy Habits Cafe and Test 11 unaffected because both have live drops that mask the bug

**Architectural fix:**

Migrate direct PostgREST reads against the `drops` table to Edge Functions, following the canonical pattern from operational learning #16:

- `verify_jwt = false` in `supabase/config.toml`
- Manual JWT verification via `anonClient.auth.getUser()`
- Vendor ownership check via service-role client against `vendors.auth_user_id`
- Service-role read with tenancy belt (`vendor_id` filter)
- Top-level try/catch with `jsonResponse` inline closure
- CORS via `getCorsHeaders()` from `_shared/cors.ts`

**Prerequisite investigation (already specced):**

Run the codebase audit prompt for all direct `drops` table reads. For each match, decide:

- **Migrate to Edge Function** — any read that fetches by drop_id and needs to see drafts (the operator's own drops in Drop Studio, Service Board's selected-drop fetch, Scorecard's drop fetch).
- **Stay on v_drop_summary** — any list read that's already going through the view and doesn't need anon-invisible rows.
- **Stay on PostgREST** — any read where the table-level anon policy is permissive enough for the use case (e.g., a public host-view fetch of a live drop is fine via the existing anon policy).

Likely candidates for migration (subject to investigation confirmation):

- `drop-manager.html` `loadSelectedDrop()` — fetches a specific drop by ID
- `service-board.html` selected-drop fetch — same shape
- `scorecard.html` drop fetch — same shape

**Function spec:**

`get-drop` Edge Function:

- Input: `{ drop_id: uuid }`
- Auth: in-function JWT verification, vendor ownership check
- Returns: full drop row (all columns) or 404 if not owned or not found
- Tenancy belt: `where drops.id = drop_id AND drops.vendor_id = <ownership-resolved vendor_id>`
- CORS: `getCorsHeaders()` from `_shared/cors.ts` (preview-domain safe)

Possibly also `list-drops` if the investigation surfaces a list-style read that needs migrating:

- Input: `{ status?: text[], limit?: int, host_id?: uuid }`
- Returns: array of drop rows for the calling vendor only

**Reference patterns:**

- `supabase/functions/get-host/index.ts` — single-row fetch with ownership check
- `supabase/functions/list-hosts/index.ts` — list fetch with ownership check
- `supabase/functions/update-drop/index.ts` — auth + ownership pattern (read won't need ALLOWED_FIELDS but the auth + ownership block is the precedent)
- Operational learning #16 — canonical pattern

**Estimated effort:** 2–3 Claude Code build sessions.

1. `get-drop` function + drop-manager.html rewire (1 session)
2. `list-drops` function (if needed) + remaining page rewires (1 session)
3. Verification + close-out (partial session)

Mirror the T5-B16 sequencing — one function per session is safer than batching, per CLAUDE.md rule #15 (deploy-before-merge cadence).

**Verification checklist:**

- Catering Direct fixture: create a fresh draft, the draft renders correctly in Drop Studio, "Loading categories…" resolves, the catalogue loads, "selectedDropId did not resolve" warning is gone
- Test 11 regression check: existing drops still load correctly, no behavioural change
- Cross-vendor isolation maintained: vendor A cannot fetch vendor B's drop via the Edge Function
- Service Board / Scorecard unaffected if those surfaces are out of scope; migrated together if they're in scope
- Captured-headers test: confirm no remaining direct PostgREST reads against drops on the migrated pages

**Cross-references:**

- T5-B16 (catalog writes migration — same pattern, precedent)
- T5-B17 (underlying auth-not-attached bug — partial; this ticket addresses one surface but does not close T5-B17)
- T5-A3 (RLS rewrite — broader workstream that eventually removes the dependency on permissive anon policies entirely)
- Operational learning #14 (auth-not-attached symptom)
- Operational learning #16 (Edge Function migration as canonical authenticated DB access pattern)

**Notes:**

- Read-side mirror of T5-B16. Same root cause drove both.
- The Catering Direct vendor fixture should be retained for verification — it's the simplest reproduction case of the bug.
- After this ticket lands, the platform has no remaining surfaces that depend on the user JWT being honoured by direct PostgREST queries.
- New operational learning candidate: when a brand-new vendor's Drop Studio appears broken (catalogue won't load, drops won't resolve), check whether that vendor has any drops in public status (live/scheduled/completed). If all their drops are drafts, you're hitting the auth-not-attached bug on direct drops table reads. The Edge Function pattern is the durable fix. Test fixtures for new vendors should include at least one live drop to avoid masking this symptom.

### T5-B43 — Home page Payments card: Dashboard button routed to platform Stripe account ✓ COMPLETE 2026-05-12

**Status:** ✓ COMPLETE. Shipped in PR #248.

**Root cause:** The Dashboard button handler in home.html used a raw fetch() call to invoke the create-stripe-login-link Edge Function, passing only an Authorization header. Per CLAUDE.md operational learning #17, Edge Function calls from operator pages require both apikey and Authorization headers. Missing apikey caused the function call to fail silently and the button to route to the platform Stripe dashboard instead of the vendor's own Express dashboard.

**Fix:** Migrated the raw fetch() to sb.functions.invoke('create-stripe-login-link', { body: { vendor_id: state.vendor.id } }). The Edge Function itself was unchanged — it already correctly called stripe.accounts.createLoginLink(vendor.stripe_account_id). Page-only change, no deploy required.

**Verified:** Test 11 and Catering Direct both open their own vendor-specific connect.stripe.com/express/... dashboard correctly.

**Cross-reference:** Operational learning #17 (both apikey and Authorization headers required for Edge Function calls from operator pages).

### T5-B44 — Publish-validation bug: stale `orders_close` not re-derived when drop date changes

**Status:** Open. Tier 5-B. Independent of T5-A3 / T5-A14. No
data loss.

**Issue:** Publishing is allowed for drops whose `orders_close`
timestamp is already in the past, and `orders_close` is not
re-derived when the drop's date or service window is changed.
A drop saved with a future drop date but a stale `orders_close`
(left over from an earlier date that has since been moved) is
immediately classified as already-closed by downstream filters
and drops out of the "Live" filter on Drop Studio / service
board lists. The operator sees a successful save, no error, and
no published drop in the live list.

**Two distinct gaps:**

1. **Publish-time validation does not check `orders_close`
   against now().** The publish action (drop status → `live`)
   should refuse to publish — or warn and require explicit
   override — when `orders_close <= now()`. Currently silent.
2. **`orders_close` is not re-derived when the drop date or
   service window changes.** When the drop date is moved
   forward, the saved `orders_close` (which was derived from
   the previous date) is retained verbatim. The two fields
   drift out of sync and the drop is immediately stale.

**Fix shape (not built):**

- **Validation:** add a publish-time check in `update-drop`
  (and any other path that transitions to `live`) that
  rejects with a clear error when `orders_close <= now()`.
  Decide whether this is a hard refusal or a confirmation
  step — leaning hard refusal because there is no legitimate
  reason to publish a drop that is already past its ordering
  window.
- **Re-derivation:** decide whether `orders_close` is a
  derived field (computed from drop date + service window
  offset on every save) or a stored field that gets re-derived
  on date change. The cleanest fix is a derived column or a
  trigger that updates `orders_close` whenever the relevant
  source fields change. Document the policy explicitly so the
  next change to drop scheduling does not re-introduce the
  drift.
- **Client surface:** Drop Studio should show the
  `orders_close` value alongside the drop date so the operator
  can see the relationship; today it is buried.

**Verification:** create a drop with a date in the past
(impossible via UI but reachable via the schema), edit it to
move the date forward, save, attempt to publish — current bug
allows publish but the drop disappears from the live filter.
After fix, either publish refuses with a clear error, or
`orders_close` is correctly re-derived and the drop appears in
the live list.

**Pass A addendum (Build Coherence Audit / A4, 2026-06-10):**

1. **Re-test the original repro before building.** The UI
   re-derivation half (delivery-date change →
   `deriveTimingFromDelivery` in `drop-manager.html`) appears
   already fixed in current source — do NOT build against the
   stale repro. Confirm against live source first.
2. **Add a publish-time guard.** Enforce `closes_at > now()`
   (and consider `delivery_start > now()`) in
   `evaluateLiveReadiness` (`transition-drop-status`) and its
   client mirror `getLiveReadiness` (`drop-manager.html`), so a
   stale or duplicated old-date draft cannot publish
   already-closed. This is the cross-link to T-A1-dup-gap, which
   produces exactly such a stale-timing draft.

**Out of scope:** broader drop scheduling refactor (recurring
drop schedules, multi-window timing). This ticket is the narrow
publish-validation + re-derivation gap.

**Priority:** medium — surfaces as silent operator confusion
("I published it, why isn't it live?") and the workaround
(manually editing `orders_close`) is non-obvious. Bounded
one-session piece of work.

T-demand-preview-prefix-trigger — postcode prefix chip changes don't fire the demand preview

**Status:** Open. Tier 5-B. Surfaced during operator-read-auth track wrap-up (2026-05-20). Independent of T5-A3.

**Problem:** In drop-manager.html, the demand preview (`loadDemandPreview()`) only fires on host selection or on changes to the hidden `centre_postcode` field. T3-12a replaced the legacy `centre_postcode + radius` pair with `allowed_postcode_prefixes` as the delivery-area-restriction mechanism, but never migrated the trigger that drives the demand preview. Result: editing the prefix chips does not re-fetch demand, so the operator sees stale demand counts that don't reflect the actual delivery area being configured.

**Fix shape (not built):** wire the prefix chip add/remove handlers to call `loadDemandPreview()`. Needs a product call on which prefix's outward code to use when multiple are entered (use the first? aggregate across all? take the most-specific?). Until that call is made, the trigger can't ship.

**Cross-reference:** T3-12a (closed 2026-05-03 — the migration that orphaned this trigger).

T-dead-centre-postcode-cleanup — remove dead centrePostcode input from drop-manager.html

**Status:** Open. Tier 5-B. Cosmetic / dead-code cleanup. Surfaced during operator-read-auth track wrap-up (2026-05-20).

**Problem:** drop-manager.html still contains a `centrePostcode` input element in the DOM, marked `display:none` and never un-hidden by any code path. Dead code from the T3-12a transition that replaced `centre_postcode + radius` with `allowed_postcode_prefixes`. The element and any remaining JS references (event handlers, value reads, `byId('centrePostcode')` calls) should be removed.

**Fix shape (not built):** grep for `centrePostcode` and `centre_postcode` in drop-manager.html, remove the hidden input and any references that are no longer reachable. Verify no Edge Function or view still expects `centre_postcode` on save payloads (T3-12a-fu2 closed the equivalent for the radius pair).

**Cross-reference:** T3-12a (closed 2026-05-03), T3-12a-fu2 (closed 2026-05-04 — equivalent cleanup for the radius inputs).

T-drop-capacity-anon-grants — revoke residual non-SELECT anon privileges on v_drop_summary / drop_capacity

**Reframe (2026-07-15) — a documented prerequisite for the permanent vendor
page's public read path, not standalone housekeeping.** Hearth_Strategy.md
§11 Phase 1 makes the permanent vendor page (`lovehearth.co.uk/{vendor}`) the
anchor of the whole capture model: a durable address that always resolves to
whatever is true now — ordering open, drop live, or the "nothing on" capture
state — and when a drop is live/open it must show **real, honest capacity**
(§6.2, the Trust & Governance constraint in §8). That public read path is
where `drop_capacity` / capacity data gets exposed to anonymous callers, so
its grants must be settled before that page ships. **Two things to hold:**
(1) the permanent vendor page must read capacity via a JWT/token-scoped Edge
Function (the `v_drop_public` / `host-view-summary` pattern), **never direct
anon PostgREST** against `v_drop_summary` / `drop_capacity`; (2) the residual
non-SELECT grants below are **defence-in-depth** — inert on the aggregating
(non-auto-updatable) view, but they should be revoked so the anon role holds
nothing on these objects once the public capacity read is EF-mediated.

**Status:** Open. Tier 5-B. Post-launch, low priority — write-side hygiene, not a read exposure. Carried forward from the operator-read-auth capstone (✓ COMPLETE 2026-06-27), which revoked anon SELECT but did not address the remaining grants.

**Problem:** After the operator-read-auth capstone revoked anon `SELECT` on `v_drop_summary` and `drop_capacity`, the anon role still retains the other six table privileges on both objects — `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`. On `v_drop_summary` these are inert: it is a non-updatable aggregating view, so the write privileges cannot do anything. On `drop_capacity` they may be a live write exposure **if** `drop_capacity` is a base table rather than a view — an aggregating/derived view would make them inert there too, but a base table would let the anon role mutate capacity rows.

**Fix shape (not built):**
1. Determine relation-vs-view for `drop_capacity` first (`SELECT relkind FROM pg_class WHERE relname = 'drop_capacity'`, or `information_schema.tables`). This overlaps T5-B5's open `drop_capacity` disposition question.
2. `REVOKE ALL ON v_drop_summary, drop_capacity FROM anon`. Safe: `order.html` reads `v_drop_public`, `host-view.html` uses the `host-view-summary` EF, and the operator-read-auth audit confirmed zero direct anon reads of either object remain.

**Cross-reference:** operator-read-auth (parent — the capstone that surfaced this), T5-B5 (open `drop_capacity` relation-vs-view question).

T-hearth-intelligence-revenue-field-audit — audit hearth-intelligence.js for stale revenue field names

**Status:** Open. Tier 5-B. Surfaced during operator-read-auth track wrap-up (2026-05-20).

**Problem:** `hearth-intelligence.js` reads `d.revenue_pence` in at least one place. This is a third field name in the same family as the canonical `drop_gmv_pence` (current) and the legacy `total_revenue_pence` (removed under operational learning #56(d)). If `revenue_pence` is not actually present on whatever object `d` is at the call site, the intelligence module's revenue-related helpers may be rendering empty or zero values without throwing — same silent-failure mode as the rest of the revenue/scope-source family.

**Fix shape (not built):** grep `revenue_pence` across `assets/hearth-intelligence.js`, identify every read site, trace `d` back to its source (raw row from which view? from which EF response?), confirm the field is actually populated. For each broken read, switch to the canonical field name. Verify against the same surfaces the intelligence module renders into (insights.html, customers.html, home.html).

**Cross-reference:** operational learning #56 (the consolidated revenue/scope-source correctness rule).

T-order-error-state-polish — order.html failed-load state reads as a rendering failure

**Status:** Open. Tier 5-B. Post-launch, cosmetic. Surfaced during the session-isolation work (2026-07-19).

**Problem:** When a drop fails to load, `order.html` now resolves to a single calm message instead of hanging on "Loading vendor…" (PR #477). But the hero placeholders are cleared in place, so the hero collapses to an empty full-width colour block sitting above the message. The page reads as a rendering failure rather than a deliberate state — the opposite of the calm resolution the fix was meant to produce.

**Fix shape (not built):** collapse the hero entirely on the error path (hide `.heroMedia`, keep the `.heroBodyCard`) so the page resolves to one centred message in a single frame, rather than a message beneath an empty band. Cosmetic only — no change to the message, the copy, or the load logic.

**Why it matters more than "cosmetic" suggests:** this is the first thing a customer sees when a shared drop link goes stale, which will be common once drop links circulate in WhatsApp groups and outlive their drop. The state is rare per-customer but high-volume in aggregate, and it is the only Hearth surface some recipients will ever see.

**Cross-reference:** PR #477 (the fix that produced this state).

T-order-confirmation-realtime-dead-code — inert realtime subscription on `orders`

**Status:** Open. Tier 5-B. Post-launch. Surfaced during the session-isolation work (2026-07-19).

**Problem:** The `postgres_changes` realtime subscription on `orders` in `order-confirmation.html`'s `setupPendingWatch` delivers no events. `orders` has no anon policy — verified by read-only curl, which returns `[]` to the anon role — so realtime filters every event out for anonymous callers. Before PR #478 a logged-in vendor inherited an operator session and DID receive events, meaning a vendor testing the flow was exercising a code path no customer has ever had. What actually carries every customer through pending→placed is the 3-second poll (`setInterval(refetch, 3000)`) plus the `reconcile-pending-orders` backstop. Post-#478 the subscription is inert for all callers, including vendors.

**Fix shape (not built):** decide between removing the subscription (and its `removeChannel` cleanup) or documenting it as inert with a comment. **Recommendation: remove.** Working-looking code that does nothing is a trap for whoever next debugs the pending→placed flow at speed during a live drop — the obvious first hypothesis ("realtime isn't firing") is both true and irrelevant, and costs time in exactly the moment there is none.

**Do NOT** add an anon policy to `orders` to make the subscription work. That is unnecessary exposure on the money path, against a table carrying customer PII and order contents, to restore a path the poll already covers.

**Cross-reference:** PR #478 (session isolation), operational learning #95, operational learning #53 (`orders` carries no anon policy).

---

T-fundraising-order-count-single-source — `order_count` is computed twice, independently

**Status:** Open. Tier 5-B. Post-launch, low priority. **Not a live bug** — the two computations agree today, verified 2026-07-19. This is drift prevention. **Parked pending a test fixture** carrying both a `pending_payment` and a `cancelled` order: the two predicates differ only on the rows their exclusion lists touch, so a drop without those statuses cannot demonstrate either the current agreement or a future divergence. Noted during the per_item live verification (2026-07-20), where every order under test was `placed`.

**What's doubled.** `v_drop_summary` and `v_drop_fundraising_summary` each derive `order_count` from `orders` by their own route, and then `v_drop_summary` joins the other view in and takes `drop_gmv_pence` / `fundraising_total_pence` / `host_share_total_pence` from it:

- `v_drop_summary` — `count(DISTINCT o.id)` over a `LEFT JOIN orders o ON o.drop_id = d.id AND o.status <> ALL (ARRAY['pending_payment','cancelled'])`
- `v_drop_fundraising_summary` — `count(DISTINCT o.id)` inside a `paid_order_rollup` CTE with `WHERE o.status <> ALL (ARRAY['pending_payment','cancelled'])`

The predicates are character-identical and both aggregate the same way, including on the edge cases (a NULL status is excluded by both; a drop with no qualifying orders yields 0 from both). So `fundraising_total_pence` genuinely equals `order_count × fundraising_per_order_pence` for the per_order model, and the displayed pair is consistent.

**The risk is a future edit, not the current state.** Because `fundraising_total_pence` is computed *from the fundraising view's* `order_count` but displayed *next to `v_drop_summary`'s*, changing one exclusion list without the other makes a drop's order count and its fundraising total silently disagree. Add `'refunded'` to one and not the other and the host page shows, say, 12 orders raising £39 — wrong in a way that looks like a fundraising bug rather than a filter mismatch, and on a surface a community host reads as a promise about money owed to their cause.

**Fix shape (not built):** have `v_drop_summary` take `order_count` from the joined view — `COALESCE(fs.order_count, 0)` — the same way it already takes `drop_gmv_pence` and the two share totals, so one predicate feeds every number in the row. `CREATE OR REPLACE VIEW` permits changing a column's source expression as long as name, position and type are unchanged, and `fs.order_count` is already `bigint`, so this is an in-place replace with no dependent breakage. Verify against a drop carrying a `pending_payment` and a `cancelled` order — the state where a mismatch would actually show, and which the single-order Gather Cafe fixture cannot exercise.

**Cross-reference:** operational learning #55/#56 (revenue correctness — this view is otherwise a *correct* implementation of both: the CTE pre-aggregates before joining, so no Cartesian fan-out, and the percentage model derives from `sum(orders.total_pence)`, so it is net-of-discount and bundle-inclusive), `20260719150000_drop_fundraising_cause_views.sql` (the PR that surfaced it).

---

T-fundraising-notes-overlap — decide the fate of `fundraising_notes` and `host_share_notes`

**Status:** Open. Tier 5-B. Post-launch, low priority. Surfaced by the fundraising-cause data-layer work (2026-07-19).

**This is a decision ticket, not a delete ticket.** Do not open it expecting to drop two columns.

**What exists.** `drops.fundraising_notes` and `drops.host_share_notes` are both nullable text, and both are completely dormant:

- zero references in any `.html`, `.ts` or `.js` file in the repo — the only mention anywhere is a passing line in `docs/archive/SCHEMA.md`, which is archived and therefore not authority
- absent from `update-drop`'s and `create-drop`'s `ALLOWED_FIELDS`, so **nothing can write them** — a value sent for either is silently stripped
- null on every drop readable via the anon path

They are almost certainly scaffolding from an earlier fundraising/host-share design that was never wired up. Their original intent is **not recoverable from code** — which is exactly why this is a decision rather than a cleanup.

**Why it surfaced.** `20260719140000_drop_fundraising_cause.sql` added `fundraising_cause_name` (public) and `fundraising_cause_reference` (private, operator-only: URL / charity number / remittance note). `fundraising_cause_reference` overlaps `fundraising_notes` in spirit. The decision taken at the time was deliberate: add the structured column, leave the dormant one untouched, and record the overlap rather than compound it — per critical rule #11, logged in the same commit as the PR that surfaced it. CLAUDE.md's T-CAP-10 entry and the PR #467 legacy-`pizzas` cleanup are the cautionary precedents for letting overlapping columns accumulate unexamined.

**The actual question.** Do the structured fields fully replace free-form notes, or is a free-form notes field still wanted alongside them?

- **If structured replaces free-form:** `fundraising_notes` is redundant against `fundraising_cause_reference`, and `host_share_notes` should get a structured equivalent (a `host_share_reference`, mirroring the fundraising pair) rather than being kept as prose. Then both `*_notes` columns can go.
- **If free-form is still wanted:** the two columns stay, but they need a defined purpose distinct from the structured fields, a name that states it, and an `ALLOWED_FIELDS` entry — a column nothing can write is not a feature, it is a trap for whoever finds it next and assumes it works.

The honest third answer is that vendors have not yet used structured fundraising in anger, so there is no evidence either way. Deferring until the first few real fundraising drops have run is legitimate — but leaving it *undecided and unrecorded* is what this ticket prevents.

**Before acting either way,** confirm the columns are genuinely empty across all rows (the anon path only sees `live` / `closed` / `completed` drops, so it is not proof):

```sql
SELECT count(*) FILTER (WHERE fundraising_notes IS NOT NULL) AS fundraising_notes_used,
       count(*) FILTER (WHERE host_share_notes  IS NOT NULL) AS host_share_notes_used
FROM drops;
```

Dropping a column is irreversible without PITR (T6-5), so a non-zero count changes the shape of this entirely.

**Cross-reference:** `20260719140000_drop_fundraising_cause.sql` (the migration that surfaced it), T5-B5 (schema cleanup — legacy artefacts, same family), T-CAP-10 (overlapping-column precedent), T6-5 (PITR, prerequisite for any irreversible drop).

---

T-fundraising-composed-line-consumers — teach the customer- and host-facing surfaces to compose the fundraising line

**Status:** ✓ COMPLETE 2026-07-19 (#485). Tier 5-B. Surfaced by the Drop Studio cause-capture PR (2026-07-19) and closed the same day.

**What shipped.** Exactly the fix shape described below. `host-view-summary` now builds `fundraising_descriptor` server-side (`buildFundraisingDescriptor`, mirroring the existing `host_share_descriptor` precedent in the same function), widened its named `v_drop_summary` projection to include `fundraising_cause_name`, and returns the composed descriptor alongside the retained raw field so the deploy was a no-op for the then-current page. `host-view.html:1132` reads `drop.fundraising_descriptor` and renders one field, holding no fundraising copy of its own. The customer-facing half landed in the same PR: `order.html` composes its line through the shared `assets/hearth-fundraising.js` module.

`fundraising_cause_reference` was never projected — the host projection stays a named column list precisely so it cannot leak, and `v_drop_public` continues to exclude it.

The **vendor-facing** half of the loop — surfacing the raised total on the Scorecard and Home, where the vendor who actually owes the cause can see it — was a separate concern and shipped later as its own PR.

**What changed upstream.** The cause-capture PR made `fundraising_display_text` an **optional override** of a line composed from the structured fields (`fundraising_model` + `fundraising_percentage` / `fundraising_per_order_pence` + `fundraising_cause_name`). It is no longer required by Drop Studio readiness, by `update-drop`, or by the `transition-drop-status` publish gate — `fundraising_cause_name` took over that role.

**The gap (as found — all of the following is now fixed).** Drop Studio composed and previewed the line client-side (`composeFundraisingLine` in `drop-manager.html`), but that helper was **the only implementation**. Every downstream reader still rendered `fundraising_display_text` verbatim, so a fundraising drop saved with a blank override rendered **nothing** where it previously always had text:

- `host-view.html` (~:1126) — `const fundraisingText = drop.fundraising_display_text || null;`
- `host-view-summary/index.ts` — projects `fundraising_display_text` (~:103 select list, ~:148 response) and does **not** currently project `fundraising_cause_name`

This is a silent-empty failure, not an error — the same shape as operational learning #26 (a schema change has a read side and a write side, and either alone is silently broken). The write side shipped; this is the read side.

**The fix, and the pattern to follow.** Build the line **server-side** in `host-view-summary` and return a single composed descriptor, exactly as `host_share_descriptor` is already built there rather than shipping raw mechanics to the client. Precedent is in the same function. Then:

- widen the `v_drop_summary` select list in `host-view-summary` to include `fundraising_cause_name` (validate against `information_schema.columns` first — operational learning #54: a single unknown column hard-400s the whole query)
- return `fundraising_descriptor = fundraising_display_text?.trim() || composed`
- re-point `host-view.html` onto the descriptor
- **never** project `fundraising_cause_reference` — it is operator-only by design and explicitly barred from customer- and host-facing projections (see the column comment and `20260719140000_drop_fundraising_cause.sql`)

**Also outstanding (done — shipped in the same PR):** `order.html` rendered no fundraising line at all. Composing one there is the customer-facing half of what the cause column was added for (see the migration header: "so the order page can compose an accurate contribution line instead of relying on the vendor to restate it in display text"). Worth doing in the same pass.

**Watch for divergence.** Once the line is composed in two places (client preview + server descriptor), the two can drift and show a vendor one line in Drop Studio and customers another. Prefer making the server the single authority and having Drop Studio's preview mirror its wording exactly; if they must stay separate, keep the phrasing in one documented place. Same family as T-fundraising-order-count-single-source (two independent derivations of one number that agree today).

**Cross-reference:** `20260719140000_drop_fundraising_cause.sql` and `20260719150000_drop_fundraising_cause_views.sql` (the data layer), operational learning #26 (read side / write side), #54 (select-narrowing validation), the `host_share_descriptor` pattern in `host-view-summary/index.ts`.

---

T-fundraising-per-item-model — a third fundraising model: a fixed amount per ITEM

**Status:** ✓ COMPLETE 2026-07-20 (#488 data layer, #490 write path + surfaces). Tier 5-B.
Verified end-to-end on live before closure: all three models — `per_order`, `percentage`,
`per_item` — compute correctly across Drop Studio, the order page, checkout, the
confirmation page and email, the host view, and the vendor Scorecard / Home; penny-verified
against `SUM(qty) × amount` on a real order; `fundraising_cause_reference` confirmed absent
from every customer- and host-facing payload.

**What shipped.** `per_item` alongside `percentage` and `per_order`: the vendor pledges a
flat amount for every item unit sold, so a drop's contribution scales with basket size
rather than with order count or revenue.

PR 1 (#488) — data layer only, provably inert: `drops.fundraising_per_item_pence`
(nullable integer pence), the widened `drops_fundraising_model_check`, and the money-view
maths. `v_drop_fundraising_summary` pre-aggregates `order_items` to one row per order in
its own CTE and LEFT JOINs it 1:1 onto `orders`, so `drop_gmv_pence` and `order_count`
stay byte-identical (no Cartesian fan-out — operational learning #55).

PR 2 — the write path and every rendering surface: Drop Studio (model option, £ field,
load/save/change-detection/readiness, and the amount advisory extended to the new model),
`update-drop` (whitelist + `VALID_FUNDRAISING_MODELS` + `> 0` guard), `transition-drop-status`
(publish gate + typed `Drop`), the shared `assets/hearth-fundraising.js` module (rate
pre-purchase, actual £ post-purchase), and its two Deno mirrors (`host-view-summary`,
`send-order-confirmation`), plus `fetch-order` and `order-confirmation.html`.

**THE ITEM-COUNT RULE (locked, and the reason the figures agree).** An order's item count
is `SUM(order_items.qty)` across ALL lines, product AND bundle, with **no descent into
`order_item_selections`** — a bundle counts as its own line quantity, not as the items
inside it. The rule is fixed by the money view (`20260720120100_..._views.sql`) and is
restated, not re-decided, at every other site. Because the view, the confirmation page and
the confirmation email all apply the same rule to the same rows, the running total the
vendor and host see and the figure quoted to the customer agree **by construction** rather
than by coincidence. Any future consumer must adopt this rule verbatim; counting a
different set (descending into bundle selections being the obvious trap) would tell the
customer one number while the drop totals another.

**Two properties worth keeping.** `per_item` is the one model whose wording is
**audience-neutral** — "£1.00 per item supports X" is equally true of one basket and of
every order, so customer and host get the same words and differ only in the terminal full
stop; there is deliberately no host variant. And integer pence × integer count is **exact**,
so unlike `percentage` there is no rounding that could drift from the view.

**The amount advisory is per-model, not one shared string.** `per_order` and `per_item` are
both fixed models that can exceed what they are taken from, but they are not the same risk:
`per_order` is bounded to small baskets, whereas `per_item` is **structural** — the pledge
is charged against every unit, so exceeding the cheapest item loses money on every one of
those sold at any basket size. The `per_order` copy ("on small orders …") would be actively
false for `per_item`, hence a distinct sentence for each. Non-blocking by design, as before.

**Deliberately unchanged.** `order.html` (reads `v_drop_public` with `select('*')` and
delegates wholly to the shared module), `scorecard.html` and `home.html` (read the computed
`fundraising_total_pence`, which PR 1 already teaches) needed no edit. `create-drop` was
**not** widened: its whitelist admits only `fundraising_enabled` and none of the detail
fields — `fundraising_per_order_pence` included — because Drop Studio creates a blank draft
and sets detail via `update-drop`. Adding `per_item` alone there would have broken that
symmetry. `fundraising_cause_reference` remains absent from every customer- and host-facing
projection.

**Cross-reference:** `20260720120000_drop_fundraising_per_item.sql` and
`20260720120100_drop_fundraising_per_item_views.sql` (data layer), operational learning #55
(fan-out, net-of-discount, `orders.total_pence` as sole revenue truth), #26 (read side /
write side), #54 (select-narrowing validation), T-fundraising-composed-line-consumers (the
shared-module pattern this extends), T-fundraising-fixed-contribution-guard (the MOV / cap
guard, which the per-model advisory shipped here deliberately stops short of).

---

T-fundraising-fixed-contribution-guard — a fixed contribution can exceed the vendor's NET proceeds

**Status:** Open. Tier 5-B. Post-launch, low priority. **Not a go-live blocker** — real
vendors at real order sizes never approach the boundary. Surfaced as prose during the
per_item build (2026-07-20) and given its own ticket, with the net-proceeds correction,
after live end-to-end verification the same day.

**The risk.** The two FIXED fundraising models — `per_order`
(`fundraising_per_order_pence`) and `per_item` (`fundraising_per_item_pence`) — pledge an
absolute amount that is not derived from the order, so nothing stops it exceeding what the
order is worth. `percentage` needs no guard and is out of scope: a fraction of an order is
always less than the order, so it is self-limiting by construction.

The two fixed models are not the same shape of risk. `per_order` is **bounded** — it only
bites on a small basket, and a £3 pledge on a £20 order is fine. `per_item` is
**structural** — the pledge is charged against every unit, so if it exceeds the cheapest
item, that item loses money on every single one sold, at any basket size.

**THE FINDING (from live verification, and the reason this is not merely a restatement).**
The ceiling is **not the order total.** It is the vendor's **net proceeds** — what actually
lands in their Stripe account — because two deductions come out first:

- **Hearth's platform fee**, taken as Stripe `application_fee_amount` on the destination
  charge (`create-order` ~:966), computed from the vendor's `platform_fee_pct` +
  `platform_fee_fixed_pence` — currently **1.5% + 20p** for all vendors (PR #474).
- **Stripe's own processing fee** — UK standard **1.4% + 20p** — which Stripe deducts
  independently and which no Hearth code sees.

Worked case, the one to reason from: a **£1.00** order on a `per_item` pledge of **£1.00
per item** incurs **£1.00** fundraising + **~22p** platform fee (1.5% + 20p) + **~21p**
Stripe fee (1.4% + 20p) ≈ **£1.43 of obligations against a £1.00 charge.** The vendor is
underwater by ~43p before the fundraising pledge is even the problem — and note that the
fixed 20p components mean the gap is *proportionally worst at exactly the small order sizes
where a flat pledge already bites hardest.*

So a guard that clamps the contribution at the order total would still let the vendor lose
money. **Any guard built here must reckon with fees — net proceeds, not order value.**

**What exists today (and what it does not do).** `renderFundraisingAmountWarning()` in
`drop-manager.html` (~:4193) is a **non-blocking, per-model advisory**, deliberately a
warning rather than a block: there are legitimate reasons a vendor accepts the trade (a
token cheap item alongside a main range, an evening where they intend to absorb the
difference), and the job is to ensure they *chose* it rather than *missed* it. That framing
stands and should survive into any guard.

Two limits to close if this is built:
- It compares the pledge against the **cheapest enabled item price**, not against any
  actual order total, and now — per the finding above — not against net proceeds either.
- `getCheapestEnabledPricePence()` (~:4183) returns `null` when no items are enabled, and
  the advisory then goes **silent entirely**. An advisory built on a half-known basket was
  judged worse than none, which is correct for an advisory but is a real blind spot for a
  guard.

There is **no server-side guard at all**: `update-drop` and `transition-drop-status`
validate only `> 0` and membership in `VALID_FUNDRAISING_MODELS`; `create-order` does not
reference fundraising in any form. Fundraising is purely reporting, computed in views after
the fact (`audit/findings-hosted-lifecycle.md:208`) — it never touches the money path, which
is why this cannot currently overcharge a customer or mis-split a payment. The exposure is
entirely to the **vendor's** margin.

**Open design questions for the build session** (do not pre-decide):
- Advisory-with-better-maths, or an actual publish-time block? The existing
  chose-it-not-missed-it rationale argues for staying advisory.
- Where does the fee knowledge live? The vendor's `platform_fee_pct` /
  `platform_fee_fixed_pence` are readable, but Stripe's rate is not in the schema — hardcoding
  1.4% + 20p introduces a constant that silently rots if Stripe repricing or a non-UK vendor
  ever lands. Consider whether an approximate, clearly-labelled estimate is more honest than a
  precise-looking figure.
- Is a minimum-order-value the better instrument than a contribution cap? MOV is a concept
  customers already understand and it addresses the small-basket case directly, but Hearth has
  no MOV primitive today and adding one is a larger change than a guard.

**Cross-reference:** T-fundraising-per-item-model (where this risk was first written down,
as advisory prose), T-vendor-fee-copy (the same 1.5% + 20p cost-recovery, on the copy side —
worth resolving the commercial question there first, since a change to the fee changes the
arithmetic here), operational learning #55 (`orders.total_pence` is what was charged — note
that it is *gross* of both fees, which is precisely the trap this ticket exists to name),
`create-order/index.ts` ~:681 and ~:966 (fee computation and `application_fee_amount`).

### Build Coherence Audit — Pass A (drop lifecycle, timing & type)

Tickets surfaced by Build Coherence Audit Pass A
(`audit/Hearth_Build_Coherence_Audit.md`, Pass A — drop lifecycle,
timing & type). Pre-launch items first, in build order (lifecycle
last); post-launch capture stubs follow. T5-B44 (Pass A / A4) and
T5-B10 (Pass A / A2 app-layer validation) are updated in place in the
Tier 5-B list above rather than duplicated here.

#### Pre-launch (do in this order; lifecycle last)

T-A1-dup-gap — Duplicating a drop discards the announce→open gap

**Status:** ✓ COMPLETE 2026-06-15 (#369). Source: Pass A / A1.

**Resolution:** the real root cause was not the toggle but `create-drop`
stripping null payload fields so DB defaults apply — `delivery_start`'s DB
default is `now()`, so nulling timing surfaced the duplicate dated today
with `opens_at` null = open-immediately. Fixed by having `duplicateDrop`
mirror `createNewDrop`'s explicit placeholder timing (week out, scheduled
24h open) instead of nulling the timing fields.

**Problem:** `duplicateDrop` (`drop-manager.html` ~4786) sets
`opens_at` / `closes_at` to null, so a duplicated drop loads as "open
immediately" and silently loses the source drop's anticipation window
unless the vendor manually re-sets the toggle. If duplication is how
each week's drop is made, every repeat loses its reveal window —
directly fighting the comms model that treats the announce→open gap as
part of the product.

**Fix shape (not built):** carry the source's open pattern across on
duplicate, or re-default to `createNewDrop`'s 24h-lead pattern.
Audit-first: confirm current `duplicateDrop` behaviour against live
source before building.

**Cross-reference:** T5-B44 (a duplicated old-date draft is exactly the
stale-timing case its publish-time guard should catch).

T-A2-orphan-hosted — Remove dead `'hosted'` drop_type from update-drop

**Status:** ✓ COMPLETE 2026-06-13 (#354). Built across two commits on
`fix/align-drop-type-validation`: (1) removed `'hosted'` from
`update-drop` `VALID_DROP_TYPES` (now the canonical 3-value set
`{neighbourhood, community, event}`); added the same set + a
present-but-invalid `drop_type` check to `create-drop` (closing the
T5-B10 / Pass A A2 create-drop addendum for `drop_type`). (2) removed
the null guard on `update-drop`'s `drop_type` check so a drop must
always carry a type (DB CHECK backs this; the frontend always sends a
non-null value); added `audience_scope` validation to `create-drop`
(allowing null, which derives downstream). Ed deploys both functions
before merging PR #354. Pre-launch (tiny, zero-risk hygiene). Source:
Pass A / A2.

**Problem:** `update-drop` `VALID_DROP_TYPES` includes `'hosted'`,
which no surface writes and the DB `drop_type` CHECK constraint
(`{neighbourhood, community, event}`) would reject anyway.
`update-drop` also permits `drop_type = null`.

**Fix shape (not built):** remove `'hosted'` from `VALID_DROP_TYPES`
and disallow null `drop_type` on the update path. No live rows carry
`'hosted'` (verified: 127 drops, only the three real values).

T-activation-deadcode-sweep — Remove code the card/overview redesigns left behind

**Status:** ✓ COMPLETE 2026-06-15 (#370). Removed four dead functions
from `activation.html` (`statusPill`, `capacityLine` — superseded by
`overviewStatus` / `statusChip` / `.actod-fill` in #368;
`actInitRevealFields` — reveal select replaced by the picker in #366;
`messageCard` — caption cards went bespoke/composer in #361–367) plus
their dead CSS (`.home-work*`, `.act-progress-*`, `.act-next-action*`)
and three stale `messageCard` comment references. `contextLine` kept —
still live at the drop-detail view. ~212 lines removed, no behavioural
change.

T-A6-lifecycle — Drop status lifecycle: live→closed→completed via scheduled job

**Status:** ✓ COMPLETE 2026-06-15. Pre-launch, sequenced LAST in the
pre-launch batch. Source: Pass A / A6.

**Resolution:** shipped the back half of the stored-status lifecycle as
a `pg_cron` job (the `draft→scheduled→live` front half was deferred by
decision — captured as T-A6-lifecycle-scheduled-state below). `pg_cron`
was enabled; the job `'advance-drop-lifecycle'` runs
`advance_drop_lifecycle()` every 15 minutes. The function is idempotent
and only ever touches `live`/`closed` rows:

- `status → 'completed'` where `status IN ('live','closed')` AND
  `delivery_end < now()`
- `status → 'closed'` where `status = 'live'` AND `closes_at < now()`
  AND (`delivery_end IS NULL` OR `delivery_end >= now()`)

It never touches `draft`, `scheduled`, `cancelled`, or `archived` rows,
so the same logic also serves as the idempotent backfill of existing
`live` rows whose windows have passed (design decision (c)).

**Shipped artefacts:**

- Migration `20260612055452_drop_lifecycle_access.sql` — widens anon
  visibility so finished drops stay reachable. BOTH `v_drop_public` AND
  the `"Drops: anon select public statuses"` RLS policy now scope to
  `('live','closed','completed')`. `order.html` reads the `drops` table
  directly (anon) as well as via the view, so both surfaces had to move
  in lockstep or finished drops' order pages would break for anon (see
  operational learning #70). Resolves design decision (d).
- Migration `20260612061555_drop_lifecycle_engine.sql` — enables
  `pg_cron`, defines `advance_drop_lifecycle()`, and schedules the
  15-minute `'advance-drop-lifecycle'` job. Resolves design decisions
  (a) `pg_cron` over a scheduled EF, (b) the two transition triggers,
  and (c) idempotent backfill.
- EF `transition-drop-status` (PR #372, deployed) — extended so the new
  lifecycle-produced states have sensible operator exits: cancel is now
  allowed from `closed` (`CANCEL_SOURCE_STATUSES = {live, closed}`;
  `completed` is not cancellable) and archive from `completed`
  (`ARCHIVE_SOURCE_STATUSES` includes `closed` + `completed`).

**Notes carried forward:** customer ordering stays time-gated in
`order.html` (`getOrderWindowState` reads `opens_at`/`closes_at`,
independent of stored status — operational learning #71); stored status
drives vendor surfaces and public visibility only. Status values now in
use: `draft`, `live`, `closed`, `completed`, `cancelled`, `archived`;
`'scheduled'` is constraint-permitted but unwritten (front half
deferred); `'published'`/`'open'` were never constraint-valid (learning
#69). Operational learnings #68–#72 capture the engine, status set, anon
visibility rule, checkout-gating independence, and transition source
sets. Follow-ons logged below: T-A6-lifecycle-timestamps and
T-A6-lifecycle-scheduled-state.

---

**Original design spec (retained for the record):**

**Decision:** build the full stored-status lifecycle (not the
derived-status alternative). The status CHECK constraint already
permits `draft / scheduled / live / closed / completed / cancelled /
archived`, but nothing currently writes `scheduled` / `closed` /
`completed` — they are an unfinished lifecycle (UI branches and the
anon SELECT policy already reference them; no transition engine
exists). A published drop stays `'live'` forever; customer ordering is
unaffected (time-gated in `order.html`) but vendor surfaces never
resolve and activation's closed states never light up.

**Open design decisions (settle in the design spec before any build):**

- (a) **Scheduler mechanism** — `pg_cron` is NOT enabled, so either
  enable `pg_cron` or use a Supabase scheduled Edge Function
  (preference: EF, keeping `transition-drop-status` the single status
  writer).
- (b) **Transition triggers** — `live`→`closed` on `closes_at`
  passing; `closed`→`completed` on `delivery_end` passing; whether to
  also add a `draft` / `scheduled` front-half.
- (c) **Idempotent backfill** of the existing `live` rows whose
  windows have passed, touching only `status='live'` / `'closed'` rows
  (never `draft` / `cancelled` / `archived`).
- (d) **Public-listing scope review** — review the anon SELECT policy /
  `v_drop_public` scope (currently `'live','scheduled','completed'`) so
  a `'closed'` drop doesn't disappear from the public listing
  mid-window, and so `'completed'` showing publicly is intended.

#### Post-launch (capture stubs)

T-A3-host-type-source — Single source of truth for the host_type set

**Status:** Open. Post-launch. Source: Pass A / A3. Consolidate the
13-value `host_type` set to one shared source across the three pickers
+ the DB constraint. No bug today (constraint matches pickers) —
drift-prevention only.

T-activation-css-orphan-sweep — Sweep CSS orphaned by #370

**Status:** Open. Post-launch (low priority). After #370 removed
`statusPill` / `messageCard`, some CSS they used is now unreferenced in
markup — `.home-pill` (and variants) and the `.act-message-*` family.
Each needs an individual ref-check before removal because sibling
classes (e.g. `.act-ai-draft`, `.act-copy-btn`) are still shared by live
code. Cosmetic only; no functional impact.

T-schema-regen — Regenerate SCHEMA.md from the live DB

**Status:** Open. Post-launch. Source: Pass A spillover. `SCHEMA.md` is
stale — it omits `audience_scope` and lists a 7-value `host_type` set
that conflicts with the live 13-value constraint. Regenerate from the
live DB (the regeneration query is at the top of `SCHEMA.md`). The regen
should also capture the T-A6-lifecycle additions: the
`advance_drop_lifecycle()` function, the `'advance-drop-lifecycle'`
`pg_cron` job, and the `closed`/`completed` status usage on `drops`.

T-A1-window-gap — Optional anticipation gap for multi-window event siblings

**Status:** Open. Post-launch (low priority). Source: Pass A / A1.
Multi-window event siblings hardcode `opens_at = now`; give event
windows an optional anticipation gap. Immediate-open is defensible for
events, so this is low priority. Audited 2026-06-15 — the
`createEventWindow` `: null` fallback is unreachable (sole caller always
passes a full `timingOverride`); only the intentional now-open remains.

T-A4-merged-timing-validation — Validate the merged stored timing on update-drop

**Status:** Open. Post-launch (latent). Source: Pass A / A4.
`update-drop` validates timing only within a single payload; it should
validate the merged stored result (payload merged over the existing
row). Latent today because Drop Studio always sends a full timing set;
matters for future partial-update / API callers.

T-dup-updated-at-trigger — Drop one of two identical updated_at triggers on drops

**Status:** Open. Post-launch. Source: Pass A / A6 (trigger dump).
`drops` has two identical `updated_at` triggers
(`set_updated_at_drops` and `trg_drops_updated_at`); drop one.

T-A6-lifecycle-timestamps — Lifecycle drops carry no closed_at/completed_at

**Status:** Open. Post-launch. Source: T-A6-lifecycle. The lifecycle
engine (`advance_drop_lifecycle()`) sets `status` only; `closed` /
`completed` drops carry no lifecycle timestamp recording when they
transitioned. If wanted, this is a two-part fix to bundle: (1) have the
engine stamp `closed_at` / `completed_at` alongside the status flip; and
(2) have `transition-drop-status`'s cancel path preserve an existing
`closed_at` rather than overwriting it with `now()` — it currently
re-stamps unconditionally (see PR #372). No bug today; this is reporting
fidelity for "when did this drop actually close/complete".

T-A6-lifecycle-scheduled-state — Deferred draft→scheduled→live front half

**Status:** Open. Post-launch. Source: T-A6-lifecycle. The
`draft→scheduled→live` front half of the drop lifecycle was deferred
when T-A6-lifecycle shipped the back half (`live→closed→completed`). It
is a cosmetic vendor-board state — surfacing a published-but-not-yet-open
drop as `'scheduled'` rather than `'live'`. The CHECK constraint already
permits `'scheduled'`; nothing writes it. Low priority.

**Pass C note (2026-06-15):** when the front-half lifecycle lands,
review `send-post-drop-thankyou`'s next-drop lookup, which keys on
`status IN ('live','scheduled')`. `'scheduled'` is currently unwritten,
so this is harmless today — published future drops are `'live'` and so
are still caught — but once `'scheduled'` becomes a real stored state
the query should be re-confirmed to cover it as intended.

### Build Coherence Audit — Pass B (capacity & honest scarcity)

Tickets surfaced by Build Coherence Audit Pass B
(`audit/Hearth_Build_Coherence_Audit.md`, Pass B — capacity & honest
scarcity). Pre-launch item first; post-launch capture stubs follow.
Pass B verdict: B1/B2/B3/B4 clean; the only real finding is B5
(delivery rendered as a line item). The capacity model, server-side
close-on-full enforcement, per-driver counting, and real-data
provenance of the displayed counts were all confirmed clean — see the
CLAUDE.md operational learnings added in the same commit.

#### Pre-launch

T-B5-delivery-not-a-line-item — Delivery shown as a "Free" basket line, not structurally absent

**Status:** ✓ COMPLETE. Pre-launch. Source: Pass B / B5 (CONTRADICTION).

**Closure note (verified against live order.html):** the `basketDelivery`
span and its 'Delivery — Free' render are removed; #basketTotals renders
Subtotal / Volume discount / Total only, delivery structurally absent. The
only remaining 'Delivery' string is the legitimate fulfilment-mode choice
card. Fix landed untagged in an earlier PR, which is why prior docs sweeps
missed it. The dormant fee scaffolding (`getDeliveryChargePence()` returning
0, `delivery_pence` in the order payload + create-order validation) is
deliberately retained — its retirement remains tracked under the still-open
T-B5-retire-delivery-scaffolding.

**Problem:** `order.html` renders a "Delivery — Free" basket line (the
`basketDelivery` span, ~1779-1782; render path ~3223) via
`getDeliveryChargePence()`, which always returns 0. Per the brand,
no-delivery-fee is structural — "Delivery: Free" frames it as a waived
fee, which the playbook bans.

**Fix shape (not built):** remove the "Delivery" basket line and its
"Free" render so delivery is structurally absent. Leave the
`delivery_pence` scaffolding dormant (retired in the separate
post-launch ticket T-B5-retire-delivery-scaffolding). Audit-first:
confirm the markup and render against live source before editing.

#### Post-launch (capture stubs)

T-B5-retire-delivery-scaffolding — Retire dormant fee-shaped delivery plumbing

**Status:** Open. Post-launch. Source: Pass B / B5. Retire the dormant
fee-shaped plumbing — `getDeliveryChargePence()`, `totals.delivery_pence`
in the order payload + `create-order` schema validation, and any
`orders.delivery_pence` column — so no latent delivery-fee infra
remains. Follows T-B5-delivery-not-a-line-item (which removes only the
UI line).

**Status note (2026-07-15): Schema half complete** (`orders.delivery_pence`
dropped, verified 2026-07-15); **code retirement** (`getDeliveryChargePence()`,
payload field, `create-order` validation) **still outstanding.** Ticket
stays open.

T-B1-landing-mockup — Marketing landing page shows fabricated static scarcity

**Status:** Open. Post-launch (low priority). Source: Pass B / B1.
`index.html` marketing landing page shows fabricated static scarcity
("26 of 36 slots filled", "10 remaining") in a demo drop card. Soften
to non-numeric, or label clearly as illustrative, to honour
honest-scarcity on the public page. Not backed by real capacity state
(it is hand-coded demo markup), but it is an illustration, not a live
ordering surface — hence low priority.

T-B1-deadcode-capacityleft — Remove dead formatCapacityLeft helper

**Status:** Open. Post-launch. Source: Pass B / B1. Remove the dead
`formatCapacityLeft` helper in `order.html` (~2110, defined, never
called). Trivial.

T-B3-orders-pizzas-rename — Rename legacy capacity column orders.pizzas

**Status:** Open. Post-launch. Source: Pass B / B3. Rename the legacy
capacity column `orders.pizzas` (and `capacity_pizzas`) to a generic
units name. Touches `create-order`, `v_drop_capacity_usage`, and the
order insert — a DB column rename, bigger than it looks. The logic is
correct today; this is clarity only (overlaps T5-B31 legacy-capacity
cleanup).

**Pass E spillover (note for the Pass E voice review — not a standalone
ticket):** `activation.html` early-access email body ends "Don't hang
about." — mild hype, borderline for the warm-restraint voice. Record
against Pass E when that pass runs.

### Build Coherence Audit — Pass C (auth & data scoping)

Tickets surfaced by Build Coherence Audit Pass C
(`audit/Hearth_Build_Coherence_Audit.md`, Pass C — auth & data scoping).
Pass C verdict: the auth architecture is sound. C1 (mutations via EF),
C2 (EF auth pattern), C3 (no `orders.vendor_id`), C5 (activation actor
filtering) and C6 (admin data-driven) all checked clean; C4 produced one
real finding (host-poster session isolation, now fixed in #376); C7
clean on spot-check with an `information_schema` validation deferred to
the anon-revoke capstone. The items below are the residual cleanups and
one redundant-derivation ticket.

T-C4-host-poster-session-isolation — Host-poster client must not inherit a vendor session

**Status:** ✓ COMPLETE 2026-06-15 (#376). Source: Pass C / C4.
`host-poster.html` is a host-facing page (token-authed via
`host-view-summary`, no login) whose `createClient` call was bare,
missing the `{ auth: { persistSession: false, autoRefreshToken: false } }`
options `host-view.html` uses — so on the shared origin it could inherit
a logged-in vendor's persisted session, contradicting the adjacent
comment that claimed parity with host-view. Fixed by adding the same
options object. Blast radius was low (the page's only call,
`host-view-summary`, is token-authed and ignores any JWT) — a
defence-in-depth / code-matches-its-own-comment fix.

T-A6-vsummary-status-single-source — v_drop_summary re-derives 'closed' in-view

**Status:** Open. Lifecycle / Pass A6 domain. Source: Pass C / C3
spillover. `v_drop_summary` re-derives `'closed'` in-view via a CASE
(`status = 'live' AND closes_at < now()` → `'closed'`). This predates the
`pg_cron` lifecycle engine and is now redundant: the in-view derivation
can diverge from the stored status because it only knows `'closed'` (not
`'completed'`) and ignores `delivery_end`, and it leads the engine by up
to 15 minutes (the cron interval).

**Evidence confirmed this session (2026-07-15):** `v_drop_summary` derives
`'closed'` in-view via a CASE (`status = 'live' AND closes_at < now()` →
`'closed'`) **while `pg_cron` (`advance_drop_lifecycle()`, every 15 min) also
writes the closed state to the stored `status`** — two independent writers of
the same fact. A view reader and a stored-status reader can therefore disagree
by up to the 15-minute cron interval (the window between `closes_at` passing
and the next cron tick). This is the concrete divergence the collapse-to-
`d.status` fix removes.

**Fix shape (not built):** collapse the view to project `d.status`
directly. Audit-first — grep every surface that reads `v_drop_summary`
status to confirm none relies on the instant `live → closed` flip before
the engine catches up. Ordering closure for customers is enforced
server-side at checkout (time-gated in `order.html` / capacity check in
`create-order`), NOT off this view label, so the label can safely follow
the stored status. Small view migration (Ed runs). Not pre-launch-blocking.

T-C-inline-createClient-host-pages — Inline createClient on three host/vendor pages

**Status:** Open. Post-launch (low priority). Source: Pass C / C1
spillover. `host-profile.html`, `hosts.html`, and `host-terms.html`
instantiate `supabase.createClient()` inline rather than via the
`window._getHearthClient()` singleton (operational learning #14). No
mutation risk — `host-profile.html` / `hosts.html` writes go through
`functions.invoke` (which attaches the JWT via a separate code path,
learning #16) — so this is pattern-consistency cleanup, part of the
broader inline-createClient → singleton migration (root cause tracked as
T5-B17). `host-terms.html` additionally creates an **unused dead client**
(instantiated in an IIFE, never queried) that can simply be dropped.

T-C-rm-onboarding-backup — Delete deprecated onboarding_backup.html

**Status:** Open. Housekeeping. Source: Pass C / C1. `onboarding_backup.html`
is untracked + gitignored, so it cannot deploy — but it is the sole
remaining copy of the deprecated direct-PostgREST-write onboarding
pattern (4× `.from('vendors').update(...)`, which would silently fail
under the auth-attach bug if ever served). Delete it to remove the
foot-gun; no production impact.

### Build Coherence Audit — Pass D (activation & communications surfaces)

Tickets surfaced by Build Coherence Audit Pass D
(`audit/Hearth_Build_Coherence_Audit.md`, Pass D — activation &
communications surfaces). Pass D verdict: the activation/comms
architecture is coherent with strategy. D1 (reachability), D2
(closed-drop = host-handoff + monitor, not a doing surface), and D3
(host is an activator in their own voice, not a platform distribution
channel) all checked clean. D4's known-suspect — that
activation-poster.html reads a stale `reveal_line` — was itself STALE:
`reveal_line` was RELOCATED from Drop Studio to Activation's Card 4
poster-hook field (not removed), is written there, and is correctly read
and rendered as the hero by activation-poster.html. D5 (Hearth presence
subtle) checked clean with one cosmetic polish. The two residuals below
are a documentation/semantic drift and a cosmetic fallback.

T-D4-reveal-line-semantics — reveal_line's documented purpose has drifted from its actual use

**Status:** Open. Post-launch (low priority). Source: Pass D / D4.
`reveal_line` is now the Activation poster-hook field — written by Card
4's poster-hook input (`#act-posterHookInput`) in activation.html, and
read and rendered as the hero line by activation-poster.html. CLAUDE.md's
T5-25 LOCKED DESIGN note previously described `reveal_line` as the
deferred caption-generator seed that is NOT rendered — that is now
inaccurate (corrected in this same PR). No functional bug — the poster
reads exactly what Activation writes — but the column's documented
meaning has drifted from its actual use and will mislead whoever builds
T5-25 Part 1 (the caption generator).

**Fix shape (not built):** before T5-25 Part 1 is built, give the
caption seed its OWN column so it doesn't collide with the poster hook.
Until then, treat `reveal_line` as the poster-hook line only.

T-D5-vendor-name-fallback — Customer-facing vendor-name slots fall back to literal "Hearth"

**Status:** Open. Post-launch (low priority). Source: Pass D / D5.
Customer-facing vendor-name slots fall back to the literal "Hearth" when
a vendor has neither `display_name` nor `name`:
- `activation-poster.html` (`.poster-vendor-name`, ~:416)
- `send-order-confirmation/index.ts` email subject (~:454) and From
  header (~:460)
If ever triggered, this frames "Hearth" over the (missing) vendor
identity — the one place D5's "never frame over the vendor" could break.
Blast radius is ~nil (onboarded vendors have a name; this is cosmetic if
vendor name is mandatory at onboarding — worth confirming that
invariant).

**Fix shape (not built):** use a neutral fallback (the vendor slug or
similar), not "Hearth", in customer-facing vendor-name slots.

### Build Coherence Audit — Pass E (voice, vocabulary & brand)

Tickets surfaced by Build Coherence Audit Pass E
(`audit/Hearth_Build_Coherence_Audit.md`, Pass E — voice, vocabulary &
brand). Pass E verdict: voice/brand is largely on-message. The pass
found a cluster of small rendered-copy fixes (banned words, one
fake-urgency line, a US spelling, stale T8-3 nav labels) plus the E4
accent-token decision — all now shipped (#379, #380) or logged below.

T-E2-early-access-urgency — Manufactured-urgency line in the early-access email

**Status:** ✓ DONE 2026-06-16 (#379). Source: Pass E / E2. Removed
"Don't hang about." from BOTH the static early-access email template and
the AI-composed variant in `activation.html`; the honest "Capacity is
limited … closes at {time}" clause and the `{vendorName}` signature were
retained. Also contradicted the platform's own generate-activation-copy
voice guardrail, now consistent.

T-E5-customize-spelling — US "Customize" on the customer order page

**Status:** ✓ DONE 2026-06-16 (#379). Source: Pass E / E5.
"Customize"→"Customise" ×4 on `order.html` (bundle modal title, the
menu "Customise" button, and two aria-labels). UK spelling; matches the
"customise" used elsewhere in the codebase.

T-E1-scorecard-promotion-copy — Banned word "promotion" in scorecard insight copy

**Status:** ✓ DONE 2026-06-16 (#379). Source: Pass E / E1. Both
`scorecard.html` insight lines reworded off "promotion" → "a more
focused message to your own customers" (articles adjusted to stay
grammatical).

T-E1-bundle-placeholder — Banned word "deal" / discount framing in a placeholder

**Status:** ✓ DONE 2026-06-16 (#379). Source: Pass E / E1.
`drop-menu.html` bundle-name input placeholder "Meal deal"→"Family
feast" (×2, `#bundleName` and `#newBundleName`).

T-E1-promotion-plan-rename — "Promotion plan" banned word

**Status:** PARTIAL. Source: Pass E / E1. The rendered Drop Studio
Review heading is fixed ("Promotion plan"→"Help fill this drop", #379).
Still OPEN — the INTERNAL feature name: the `reviewPromotionPlan` element
id and the `drop-manager.html` ~:4192 "Promotion plan" code comment, to
rename for consistency. Post-launch, code only (no rendered-copy impact).

T-E3-stale-nav-labels — Stale "Menu Library" / "Brand Hearth" after the T8-3 rename

**Status:** PARTIAL. Source: Pass E / E3. The dry-run-visible labels are
fixed (#379: `home.html` card titles "Menu Library"→"Offer" and "Brand
Hearth"→"Brand"; three `drop-manager.html` "Menu Library"→"Offer"
strings; `brand-hearth.html` error reworded). Still OPEN and folded into
**T8-3-sub1**: `vendor-terms.html` legal copy, `order-entry.html` legacy
dev tool, and the `home.html` card icon glyphs 'ML'/'BH'.

T-E4-activation-accent — Activation accent migrated to canonical Hearthfire

**Status:** ✓ DONE 2026-06-16 (#380). Source: Pass E / E4.

**Decision:** Hearthfire (`#c4511a` / token `var(--h-fire)`) is the
canonical Hearth accent. `#8B6B3F` retires as a Hearth primary but is
RETAINED as the `--vendor-brand-primary` fallback (the neutral default
when a vendor has set no colour) and must NOT be migrated there —
swapping it would render a colourless vendor's customer-facing
surface/poster in Hearth's own accent (brand-bleed — the D5 concern).

**Shipped:** Activation operator-chrome refs migrated to the token on
`activation.html` (`.actod-fill`, `.actod-next-key`, `.actod-cta`,
`.act-capacity-wording.is-selected`, `.act-stat-eyebrow`) and to literal
`#c4511a` where a token can't resolve (the image-picker JS inline-style
border; `activation-poster.html` `.btn-primary`, since the poster
doesn't import hearth.css). All vendor-colour slots and the printed
`.poster-date` artwork were held.

T-E4-activation-rgba-tints — Finish the Activation Hearthfire convergence

**Status:** Open. Post-launch (low priority). Source: #380. On the
Activation surface, `.act-channel-badge` (~:390) and
`.act-social-toggle.is-on` (~:509) couple `#8B6B3F` with
`rgba(139,107,63,…)` tints, and `.actod-cta:hover` (~:125) uses the
`#75592f` derived dark shade. These were held during the Hearthfire
migration (#380) to avoid guessing tint/shade values, so the surface is
partially converted. Migrate them to Hearthfire-derived equivalents so
Activation fully converges on one accent.

**Platform convergence note:** the canonical primary is now Hearthfire
(`#C4511A` / `--h-fire`); the remaining `#8B6B3F` across the codebase is
scoped to the vendor-fallback role. The brand playbook is now **committed in
the repo** at `Hearth_Brand_Playbook.md` (§8), which records `#C4511A` as the
platform accent and `#8B6B3F` only as the `--vendor-brand-primary` fallback —
so the earlier "external playbook still names #8B6B3F as primary" flag is
**resolved.** The only work remaining under this ticket is the CSS tint
convergence described above.

### Tier 6 — Production readiness

These items must all land before any real vendor starts capturing live
customer data. The current workflow (direct pushes to main, auto-deploy
to live site, no staging, no local dev) is fine for solo development
but dangerous the moment real vendors depend on the platform. A bug in
order.html today would reach live customers within 30 seconds of commit.

T6-1: Domain migration to lovehearth.co.uk ✓ COMPLETE
Move the production deployment from spiffy-tulumba-848684.netlify.app to
lovehearth.co.uk. Scope includes: DNS configuration (registrar records
pointing at Netlify), Netlify custom domain setup with HTTPS certificate
provisioning, Supabase Auth URL configuration update (site URL, redirect
URLs), Supabase Auth email template updates (sender address, any hardcoded
links), Edge Function hardcoded URLs (invite-vendor redirectTo URL
currently references the netlify.app subdomain — needs update and redeploy),
admin.html Edge Function invoke URL, any other hardcoded URLs across the
codebase. Also removes the "Dangerous" browser warning that appears on
the netlify.app subdomain. Blocks T3-8 (Stripe).

[Completion note — 22 April 2026] Production deployment moved from
spiffy-tulumba-848684.netlify.app to lovehearth.co.uk. DNS configured
at registrar, Netlify custom domain active with HTTPS certificate
provisioned, Supabase Auth site URL and redirect URLs updated,
Supabase Auth email templates updated (sender address and hardcoded
links), invite-vendor Edge Function redirectTo URL updated and
redeployed, admin.html Edge Function invoke URL updated, transactional
email SMTP configured against the new domain. The "Dangerous" browser
warning that previously appeared on the netlify.app subdomain is gone.
Unblocks T3-8 (Stripe Connect Express integration) — Stripe now has a
stable production domain for return URLs and webhook endpoints.

Follow-up (manual dashboard task, not a code change): remove the two
stale Supabase Auth allowlist entries for
spiffy-tulumba-848684.netlify.app. They are no longer needed now that
lovehearth.co.uk is the canonical domain.

T6-2: Local development environment
Set up Ed's Mac to run the Hearth site locally for testing changes
before they reach any deployed environment. Requires: Node.js installed,
a local static file server (netlify dev, or a simpler equivalent like
npx serve), a separate Supabase dev project with test data (not the
production database), and a config switch in assets/config.js so the
site connects to the dev Supabase instance when running locally. This
is the first line of defence against shipping broken code — changes
can be verified end-to-end before any commit.

[Extension — 2026-05-04 dev workflow scope additions]

Two scope additions surfaced during a Claude Chat dev workflow review on
4 May 2026:

(1) Supabase MCP server integration. Wire the official Supabase MCP server
(https://mcp.supabase.com/mcp) to Claude Code, scoped to the dev Supabase
project with full read/write access via the project_ref query parameter.
Lets Claude Code execute SQL, inspect schema, query data, and deploy Edge
Functions directly during development — replacing the manual SQL editor
and `supabase functions deploy` handoffs. OAuth-based, no PAT required.

Security note: full-write MCP must never connect to the production
project. The primary risk is prompt injection — an attacker could embed
instructions in user-submitted content (vendor description, customer
order notes) that Claude Code later reads via MCP and interprets as
commands to execute destructive SQL. Production gets read-only +
project-scoped access only; see the T6-3 extension for the production
configuration.

(2) supabase/migrations/ directory in the repo. Dump the current
production schema as the initial migration file. Future schema changes
flow as migration files: Claude Code writes the SQL, tests on dev via
MCP, ed reviews the diff in PR, and ports to production via the existing
SQL editor flow until CI promotion is in place. Versioned migration
files provide the rollback path direct SQL editor work currently lacks
and align with Supabase CLI conventions for future automation.

Sequencing note: T5-A3's RLS hardening (the 27 April 2026 audit
extension — removing permissive anon policies) should land before
production-facing MCP read access. The same permissive policies that
keep the platform functional under the auth-attach bug also expose the
prompt-injection surface to MCP. Treat T5-A3 as a soft prerequisite for
the production read-only MCP configuration in T6-3.

Cross-reference: T6-3 extension (production read-only MCP), T6-8 (dev
workflow tooling).

T6-3: Staging environment
Set up a second Netlify site deployed from a separate branch (e.g.
"staging"), pointing at a separate Supabase staging project. Accessible
at a URL like staging.lovehearth.co.uk. All changes flow: local → staging
branch → verified on staging URL → merged to main → deployed to
production. Requires: branch created, Netlify site configured against it,
Supabase staging project, DNS record for staging subdomain, separate
environment variables in Netlify for staging vs production, documented
promotion workflow.

[Extension — 2026-05-04 production Supabase MCP read-only scope]

Add to T6-3 scope: configure a second Supabase MCP server connection
for the production project in read-only + project-scoped mode
(read_only=true&project_ref=<prod-ref>). Lets Claude Code inspect
production schema, query data for diagnosis, and read logs without any
write capability. Full-write MCP remains scoped to dev (T6-2 extension)
and staging.

Migration promotion path becomes: migration written and tested on dev
via Claude Code + Supabase MCP → PR opened (T6-4) → merged to staging
branch → CI applies migration to staging Supabase → manual smoke test
on staging.lovehearth.co.uk → merged to main → CI applies migration to
production.

Cross-reference: T6-2 extension (dev MCP scope), T5-A3 (RLS hardening
soft prerequisite), T6-4 extension (PR review as MCP safety net).

T6-4: Branch protection and PR review workflow
GitHub branch protection rules on main: require pull requests, require
at least one review before merge, require status checks to pass.
Claude Code workflow must change — it can no longer commit directly
to main. It commits to feature branches, opens PRs, and Ed reviews and
merges. Catches the category of Claude Code mistakes where the commit
does the wrong thing subtly. Slower per-change, but appropriate once
real vendors are on the platform. Needs to be agreed in a session with
CLAUDE.md updated so the new workflow is written down.

[Extension — 2026-05-04 sequencing relative to MCP write access]

T6-4 becomes meaningfully more important once Claude Code has Supabase
MCP write access on dev (T6-2 extension). Today, Claude Code mistakes on
schema or Edge Functions are caught by the manual SQL editor and
`supabase functions deploy` checkpoints. With MCP write access, those
manual gates disappear — PR review becomes the primary safety net before
any change reaches main and auto-deploys to production. Land T6-4 before
enabling any production-facing MCP read access in T6-3.

T6-5: Supabase backup strategy
The production Supabase project needs point-in-time recovery enabled,
which is a Pro-tier feature. Before real customer data lands, upgrade
to Supabase Pro and verify PITR is active. Without this, a bad SQL
migration or accidental data deletion has no recovery path beyond
whatever daily backup Supabase's free tier provides. Separate from
Netlify Pro (which is about bandwidth — also needed, flagged elsewhere).

HARD PREDECESSOR: T-admins-table-migration-backfill must be done first.
The `admins` table was created out-of-band in the SQL editor and has no
CREATE TABLE migration, so the migration history cannot reproduce it.
Any fresh-environment rebuild (a likely part of validating PITR/restore)
would silently lose the table and 403 all admin access. Backfill the
migration before relying on T6-5's recovery path.

T6-6: Transactional email via Resend or Postmark
Supabase currently sends auth emails (magic links, password reset,
vendor invites) from its default noreply address. These can look
generic and sometimes land in spam. Configure Supabase to send
auth emails from noreply@lovehearth.co.uk via a dedicated
transactional email service — Resend is the modern default, Postmark
is the deliverability-focused alternative. Requires: Resend or
Postmark account, DNS records at GoDaddy (SPF, DKIM, DMARC for
transactional sending), Supabase SMTP configuration updated, test
the full auth flow end-to-end. Separate infrastructure from the
Google Workspace account being set up 21 April — regular email
providers aren't designed for programmatic bulk sending.

Status: PARTIAL. Resend integrated for auth and onboarding emails —
plumbing confirmed present. Transactional email triggers
(order_confirmed, order_ready, drop_announced, drop_reminder) not yet
built.

T6-7: Edge Function CORS allowlist — support Netlify preview domains ✓ COMPLETE
Confirmed complete. supabase/functions/_shared/cors.ts implements
getCorsHeaders() supporting both lovehearth.co.uk and Netlify preview
domain pattern.
Every Edge Function currently hardcodes
`ALLOWED_ORIGIN = "https://lovehearth.co.uk"`. Netlify deploy
previews (`deploy-preview-*--spiffy-tulumba-848684.netlify.app` and
the equivalent on the production custom domain) cannot talk to the
functions, which blocks pre-merge browser verification of any PR
that touches HTML → Edge Function wiring. Discovered while
verifying PR #192 — the only verification path is post-merge
against the live site, which is the wrong default once real vendors
depend on the platform.
Options:
- Allow `*.netlify.app` (broad, simple, accepts any Netlify-hosted
  caller — slightly looser than ideal).
- Allow a specific preview pattern (e.g. exact match on the
  production preview prefix). Tighter, but requires the production
  URL to be stable and known.
- Environment-aware CORS config: read allowed origins from a
  function-level secret or runtime env var. Cleanest, most
  flexible.
Affects every current and future PR that touches HTML → Edge
Function wiring. Should land before T6-3 (staging) so previews
work end-to-end against deployed Edge Functions.

T6-8: Dev workflow tooling — Claude Code skills, MCP integrations,
knowledge base

Tier 6. Open. Post-launch dev hygiene; not a go-live inhibitor.

Captures forward-looking improvements to ed's Claude Code workflow
surfaced during a 4 May 2026 Chat session. The aim is to reduce friction
in the architecture-to-build loop and the existing copy-paste handoff
between Claude Chat and Claude Code. Three parts plus an optional
fourth.

**Part 1 — Codify repeating Hearth patterns as Claude Code skills**

Claude Code (post-merger of skills and custom slash commands) loads
markdown files from .claude/skills/ as auto-triggering or
explicitly-invoked workflows. Three Hearth-specific skills are clear
candidates based on patterns already captured as operational learnings:

- hearth-edge-function-migration. Codifies operational learning #16 —
  the canonical Edge Function pattern (verify_jwt = false in
  supabase/config.toml, manual JWT verification via
  anonClient.auth.getUser(), vendor ownership check via service-role
  client, ALLOWED_FIELDS whitelist, top-level try/catch with
  jsonResponse helper from _shared/cors.ts). Auto-triggers when Claude
  Code is migrating a write path from direct PostgREST to an Edge
  Function. Removes the need to re-paste the pattern from prior PRs
  each time.

- hearth-ticket-investigation. Codifies operational learnings #24 and
  #25 — the audit-first opening sequence (ls supabase/functions/, cat
  the relevant function, check deployment status, check schema) before
  scoping any build against a logged ticket. T5-B22 ("Resolved by test,
  not by build") is the reference example: a significant build session
  was avoided once the audit-first opening confirmed the function
  already existed.

- hearth-schema-change. Codifies the migration-file workflow from the
  T6-2 extension. Auto-triggers when Claude Code is asked to modify the
  schema. Produces a migration file, applies it on dev via Supabase
  MCP, prompts ed to review the SQL diff before any production
  application.

**Part 2 — GitHub MCP integration**

Wire the official GitHub MCP server to Claude Code, scoped to the
github.com/edwardharvey-alt/southbury-ops repo. Lets Claude Code read
commit history, manage PR descriptions, and reference tickets directly.
Particularly useful given Hearth's disciplined T-ticket numbering and
PR cross-referencing conventions — Claude Code can update BACKLOG.md
status markers (✓ COMPLETE, ✓ PARTIAL) referencing the merging PR
without ed pasting it in.

**Part 3 — Claude Project knowledge base on claude.ai**

For the architecture-side work that genuinely benefits from the Chat
surface (strategic exploration, research, brainstorming where Code's
editing tools aren't wanted), set up a Hearth project on claude.ai
with CLAUDE.md, BACKLOG.md, and SCHEMA.md pinned as project knowledge.
Each Chat session inherits standing context without copy-paste. Reduces
the architecture-to-build handoff to one copy-paste of the polished
prompt rather than fifteen of context, rules, and reminders.

**Part 4 (optional) — Netlify MCP**

If a Netlify MCP server is available and adds value (deploy logs, env
var inspection, build status), wire it up alongside GitHub. Lower
priority than Parts 1–3.

**Sequencing within T6-8**

Recommended order once picked up post-launch: Part 1 first (skills are
local-only, no service auth needed), then Part 3 (knowledge base is a
one-off claude.ai configuration), then Part 2 (GitHub MCP, OAuth flow
required). Part 4 if and when convenient.

Cross-reference: T6-2 extension (Supabase MCP scope), T6-3 extension
(production read-only MCP), T6-4 extension (PR review as safety net),
operational learnings #16, #24, #25.

T-base-ddl-backfill: Committed base-table DDL / SQL schema dump — open
The base tables of the live DB were largely created out-of-band in the
Supabase SQL editor and are NOT reconstructable from
`supabase/migrations/`. Consequence: schema audits and select-narrowing
work keep needing live-DB `NEEDS-ED-VERIFY` queries because there is no
plain-SQL DDL dump to check against locally.

Current state (verified against the repo 2026-07 — the tracked repo has
NO reliable machine-checkable schema dump):
- `SCHEMA.md` IS tracked, but is documented-stale and must not be used for
  adjudication (operational learnings #54, #57 — it omits columns and lists
  a `host_type` set conflicting with the live constraint). Hence audits keep
  falling back to live-DB `NEEDS-ED-VERIFY` queries.
- A structural JSON dump apparatus (`schema-snapshot/` —
  `columns-constraints-indexes.json` + `views.json` + a `README.md` with the
  refresh queries, captured 2026-06-30) exists ONLY as **untracked local
  files** in Ed's working tree — it is NOT committed to `origin/main`, so a
  fresh clone, CI, or another session does not have it. **First action:
  commit that directory** so there is a ground-truth structural dump in the
  repo (the `README.md` there already documents the two refresh queries).
- `prod-schema.sql` at the repo root is an empty 0-byte **untracked**
  placeholder — either populate it with a real `pg_dump --schema-only` (or an
  equivalent generated DDL of the base tables) or remove it, so it stops
  implying a dump exists when it doesn't.
- Still missing beyond that: a plain-SQL `CREATE TABLE` reconstruction of the
  base tables, so the schema can be rebuilt / diffed as SQL rather than read
  out of JSON.

The `T-base-ddl-backfill` name is referenced in the (untracked)
`schema-snapshot/README.md` but was not previously tracked as a backlog
ticket — this entry formalises it. Post-launch; enables SQL-level schema
audits and a self-contained rebuild path. — open

### Tier 7 — Platform oversight and administration

Hearth has operator tools for vendors and customer-facing pages for
diners, but no equivalent surface for Ed as the platform operator.
Today that visibility comes from ad hoc SQL queries and direct database
inspection — fine for one vendor, untenable at ten, dangerous at a
hundred. Tier 7 builds the admin control surface and the monitoring
spine that sits underneath it.

Two parallel tracks:

- **Oversight** — understanding what vendors are doing on the
  platform: who is active, which drops are running, where the
  customer base is concentrated, which vendors are struggling.
- **Monitoring** — understanding whether the platform itself is
  healthy: is Supabase reachable, are Edge Functions running, are
  emails sending, are there any orphan records accumulating.

Both tracks follow the admin and monitoring design principles
documented above. All admin surfaces are gated on Ed's UID with
server-side verification via `supabase.auth.getUser()`.

#### Oversight track

**Phase 1 — needed before vendor count reaches ~10**

T7-1: Platform health cockpit ✓ COMPLETE 2026-05-21

MVP fulfilled by platform-admin.html (vendor list) and
platform-admin-vendor.html (vendor drill-down with drops and orders).
The original spec's core daily-overview function — see active vendors,
upcoming and live drops, last-24h orders and revenue — is met by the
two pages: vendor list with onboarding/Stripe state, drop count, and
last activity; drill-down with drops table (status, order rollup,
revenue) and orders table (customer details). Read-only throughout.

Deferred to a future ticket if needed: recent-events timeline,
no-upcoming-drops alerts, underfilled-drop warnings (closes_at
approaching with capacity below threshold), explicit at-risk
classification. These were in the original maximal spec but did not
make the MVP cut. Reopen — or open a fresh ticket — if Ed's daily
admin workflow surfaces a gap the current pages don't cover.

See CLAUDE.md "Platform admin MVP" section for the full schema, Edge
Functions, views, and canonical admin EF auth pattern.

T7-2: Vendor profile page
Consolidated per-vendor view: identity (name, contact, address,
socials), onboarding status (completion state, answers given), drop
history (all drops with status, fill rate, revenue), revenue
trajectory (last 30 / 90 days chart), customer base (earned vs
imported counts, consent breakdown), activity timeline (sign-ins,
drops published, settings changes from audit log), and quick actions
(open workspace as vendor, impersonate for support, flag as at risk,
suspend — all writes audit-logged).

T7-3: Vendor list view
Searchable/sortable table of every vendor on the platform with
summary columns (name, slug, onboarding state, drops in last 30 days,
revenue in last 30 days, last sign-in, relationship status). Each
row links through to T7-2. Primary navigation into per-vendor detail.

T7-4: Drop oversight page
All upcoming drops across the platform with fill progression and time
to close, recently completed drops with outcomes (orders, capacity,
revenue, customer acquisition), and drill-down into drop detail
(menu, orders, host, vendor). Read-only equivalent of Drop Studio at
platform scope.

T7-5: Host management page
List of hosts with host type, postcode / area, associated vendors
(how many vendors have run drops there), status and relationship
status, and claim / unclaim actions for platform-level host
stewardship. Surfaces the host graph across the platform — which
hosts are shared, which are single-vendor, which are inactive.

T7-6: Aggregate customer base view
Platform-wide unique customer count (across all vendors), postcode
distribution (top outward codes by customer count), repeat rate
distribution (customers by number of orders placed), consent status
breakdown (granted / imported / revoked / pending). No individual
customer records — aggregate only. Informs platform strategy without
compromising vendor-level ownership of the customer asset.

T7-7: Admin event log / audit trail
Append-only log of admin actions (vendor created, vendor suspended,
host claimed, impersonation started, override applied). Writable only
by admin surfaces; readable by Ed. Required before any admin write
action ships — without audit, reversing a mistake is guesswork.

**Phase 2 — needed as vendor count approaches ~100**

T7-8: At-risk vendor detection queue
Heuristic-driven queue of vendors showing signals of disengagement
(no drops in N days, declining fill rate, onboarded but never
published, customers imported but no drops run). Ordered by severity.
Each entry suggests an intervention.

T7-9: Cohort analytics
Vendor cohort analysis — activation rate, time to first drop, revenue
at N days since onboarding, retention by cohort. Informs product
decisions at scale.

T7-10: Geographic map view
Map of the UK showing vendor locations, host locations, and customer
density by postcode area. Identifies coverage gaps and clustering
opportunities.

T7-11: Platform economics dashboard
GMV, take rate, revenue per vendor, revenue per drop, cost per
customer acquired, and other platform-level commercial metrics.
Depends on Stripe (T3-8) being live and billing model being defined.

T7-12: Moderation and intervention tooling
Tools for handling vendor or host policy violations — suspend
workspace, freeze drop, revoke host access, notify affected customers.
Hopefully rarely used, but required before the platform is operating
at scale without direct trust in every participant.

T7-13: Capacity driver concept and modelling — SUPERSEDED
Promoted to Tier 3 as T3-13. See T3-13 for full spec.

T7-14: Multi-admin access ✓ COMPLETE 2026-05-21

The admins table replaces the hardcoded ADMIN_UID. Columns: id,
auth_user_id (UNIQUE FK to auth.users), email, granted_at, is_active.
RLS enabled with no policies — only service_role reads, so membership
is authoritative. Indexed on auth_user_id WHERE is_active = true. To
add a new admin: Supabase Auth invite + INSERT INTO admins
(auth_user_id, email).

Closes T5-B26 (hardcoded UID retired across admin.html, invite-vendor,
create-vendor — three sites, not two as the handover suggested; see
operational learning #57). Unblocks T7-16 (business partner admin
access) — Robin can now be added via the standard flow. T5-B25
(admin.html vendor creation atomicity) remains open and is not
addressed by this work, but the admin-verify pattern is now in place
to support a future atomic flow.

[Update — 2026-06-29] Robin is provisioned: `robin@lovehearth.co.uk`
holds an active `admins` row alongside `ed@lovehearth.co.uk` (both
`is_active = true`, verified in the DB tonight) — multi-admin is live in
production, not just enabled.

[Caveat — 2026-06-29] The column list above (UNIQUE FK on
`auth_user_id`, RLS-enabled-no-policies, the partial index) is the
DOCUMENTED shape and is UNVERIFIED against the live DB —
`information_schema.columns` confirms the five columns
(`id` uuid, `auth_user_id` uuid, `email` text, `is_active` boolean,
`granted_at` timestamptz, all NOT NULL) but the constraints and RLS
state have NOT been confirmed via `pg_constraint` / `pg_policies`. There
is also NO committed CREATE TABLE migration for this table. Do not author
a migration against the documented shape blind — see
T-admins-table-migration-backfill.

See CLAUDE.md "Platform admin MVP" section for the full schema, Edge
Functions, views, pages, and canonical admin EF auth pattern.

T-admins-table-migration-backfill — ✓ COMPLETE
Tier: schema reproducibility / pre-launch. Hard predecessor to T6-5
(Supabase Pro PITR upgrade).

**Closure note (2026-06-29):** Live table shape verified against production
via `information_schema.columns`, `pg_constraint`, `pg_indexes`, `pg_class`
(RLS state), `pg_policies` (confirmed zero policies) and
`role_table_grants`. CREATE TABLE migration
`20260629221021_create_admins_table.sql` added (#419) reproducing the exact
shape — five columns, PK on `id`, UNIQUE + ON DELETE CASCADE FK on
`auth_user_id`, the partial index `idx_admins_auth_user_id_active`, RLS
enabled (not forced), zero policies. The migration deliberately diverges from
the live grant state in one way: it `REVOKE ALL ON public.admins FROM anon,
authenticated` as defence-in-depth (the live table carries Supabase's default
broad grants, inert only because RLS-with-no-policies denies them; this closes
the latent privilege-escalation path on fresh environments). Reconciled on
production via `supabase migration repair --status applied 20260629221021` —
history now reproduces the table, so a PITR restore / fresh staging build will
not silently 403 all admin access. The live table and its data were not
modified. Unblocks T6-5.

Problem: the `admins` table was created out-of-band in the Supabase SQL
editor; there is NO CREATE TABLE migration for it in
`supabase/migrations/`. Seven admin Edge Functions depend on it
(`admin-verify`, `admin-list-vendors`, `admin-get-vendor`,
`admin-list-vendor-drops`, `admin-list-drop-orders`, `invite-vendor`,
`create-vendor`). The live DB therefore holds an object the migration
history cannot reproduce. The risk surfaces at T6-5 (PITR) and any
fresh-environment rebuild: the table won't reconstruct and all admin
access silently 403s (including the auth-callback `admin-verify` branch).

Live table shape (verified tonight via `information_schema`, all NOT
NULL): `id` uuid, `auth_user_id` uuid, `email` text, `is_active`
boolean, `granted_at` timestamptz. NOTE: constraints (PK, UNIQUE/FK on
`auth_user_id`) and RLS state are NOT yet confirmed —
`information_schema.columns` shows columns only. The documented shape
(CLAUDE.md) claims UNIQUE + FK + RLS-no-policies but this is UNVERIFIED
and must not be trusted.

Fix shape (NOT built): (1) confirm live constraints + RLS via
`pg_constraint` and `pg_policies` on `admins` before authoring; (2)
write a CREATE TABLE `admins` migration matching the live definition
INCLUDING real constraints; (3) `supabase migration repair` to mark it
already-applied so it does not attempt to re-create the live table.
Audit-first: confirm constraints against the DB, do not reproduce the
documented shape blind.

Priority: do before T6-5, not after.

T7-15: Admin write capability — vendor and drop data amendment
T7-1 through T7-7 cover read-only oversight. A write surface is needed
for admin interventions: correcting vendor profile data, amending a
drop on a vendor's behalf, resetting onboarding state. Every write
action must route through T7-7 (audit log). Pattern: admin selects
vendor → read-only view → "Edit on behalf of vendor" → confirms →
audit log entry written → change applied via service-role Edge Function.
Dependency: T7-7.

T7-16: Business partner admin access ✓ COMPLETE 2026-07-14
Shipped and confirmed complete via the backlog reconciliation audit
(audit/findings-backlog-reconciliation.md); marked open in error. Robin was
added as a platform admin through the sanctioned path (Supabase Auth invite +
`INSERT INTO admins`), so multi-admin is live in production, not just supported.
Ed confirmed via the SQL editor (2026-07-14) that `admins` contains both
ed@lovehearth.co.uk and robin@lovehearth.co.uk with `is_active = true`. Original
spec prose retained below for history.

Specific instance of T7-14. Add business partner as platform admin
with owner-level access. T7-14 closed 2026-05-21 so the admins table
is in place — adding Robin is now a one-line Supabase Auth invite +
INSERT INTO admins (auth_user_id, email). Do not add their UID to any
hardcoded list as a shortcut; the admins table is the only sanctioned
path.

T7-17: Vendor configuration inspector (post-launch)
Read-only view of a vendor's full configuration on
platform-admin-vendor.html: menu items (products, bundles, capacity
drivers), brand setup (logo, hero, colours, copy), drop config
details, onboarding answers. Built after first real support cases
reveal what's actually needed. Defer until at least one real vendor
has been live for 2+ weeks and support questions have been logged
(see T-support-issue-log). Avoids building speculative inspector UI
that does not match the questions Ed actually has when supporting a
vendor in practice.

T7-18: Vendor impersonation / "act as vendor" (post-launch)
Admin capability to view the platform from a specific vendor's
perspective. High-trust feature requiring explicit security and audit
design before any code: session token minting from an admin Edge
Function, in-page banner whenever impersonation is active, full audit
log of impersonation sessions (into T7-7), scoped read-only mode by
default. Do not begin until the audit and security shape is agreed in
Claude Chat. Not for launch.

T-vendor-deactivation — Vendor lifecycle status + admin-list filter
Status: Open. Not pre-launch-blocking; needed at first real vendor churn.

The problem: vendors has no status column (confirmed by grep — no migration
defines it, no code reads/writes it; CLAUDE.md schema lists status on every
table except vendors). No way to deactivate, archive or hide a vendor. So the
admin vendor list (admin-list-vendors → v_admin_vendor_list, rendered in
platform-admin.html) shows all rows including test clutter with no filter
available; and a churned vendor could not be retired (their public page would
still resolve).

Fix shape (not built): mirror the existing hosts.status pattern (values
active/inactive/archived; list-hosts filters .neq("status","archived")).
Add vendors.status (text, NOT NULL, default 'active') via migration; filter
v_admin_vendor_list / admin-list-vendors to exclude archived; decide whether
customer-facing reads (get-vendor-page, v_vendor_public) honour status so an
archived vendor's page stops resolving (design decision); permit status writes
via update-vendor ALLOWED_FIELDS, admin only. Then archive the inert test rows
reversibly: robs-nutz, teddys-pies, teddys-tea, test-14, test-activation,
test-vendor-1, jigsaw-sausages, nathalies-novelties, test-12. Explicitly NOT
healthy-habits (live row, 0 orders but real), NOT test-11 (dry-run vendor),
NOT anything with order history.

Guardrails: soft-delete only — never hard-DELETE test vendors; they have
FK-linked child rows (drops, activation records, customer_relationships, offer
rows) that a delete would block on or cascade through irreversibly. Archiving
via status is reversible; deletion is not.

Relations: hosts.status pattern (proven shape to copy), pre-go-live test-data
tidy-up (this is the safe mechanism for it).

#### Monitoring track

**Phase 1 — build soon; the platform currently has no observability,
and failures during drops could erode vendor trust.**

T7-M1: External uptime monitoring
Subscribe to an external service (Better Uptime or Uptime Robot, free
tier) that pings `lovehearth.co.uk` and `/api/health` every 1–5
minutes and alerts on failure via email and mobile push. External is
the point — if Netlify is down, internal monitoring cannot tell Ed.
Cheapest and highest-leverage piece of infrastructure on this list.

T7-M2: /api/health endpoint
A new endpoint (Netlify Function or Supabase Edge Function) that
verifies Supabase connectivity, runs a trivial query (e.g.
`select 1` or a count on `vendors`), and returns 200 OK or 5xx with
diagnostic info. Feeds T7-M1. Must be cheap to call — invoked every
few minutes by the uptime service.

T7-M3: /admin/status page
Real-time dashboard showing Supabase connectivity, Resend API
reachability, Netlify deploy status, recent Edge Function invocation
success rates, recent email send success rates, orphan record counts
(orders without order_items, customer_relationships without customers,
etc.). Red / amber / green per component. Admin-gated.

T7-M4: Critical error alerting
When something critical fails (Edge Function throws, invite email
bounces, payment fails, drop closes but notifications don't send),
send an email to `alerts@lovehearth.co.uk` which forwards to Ed's
phone. Severity ranked — critical alerts wake him up, warnings wait
for the digest. Every alert must include a suggested action.

T7-M5: Daily digest email
Automated 7am email summarising platform uptime (last 24h), drops
that ran, orders processed, errors encountered, anomalies detected,
vendor issues flagged. Delivers the "I slept well, here's what
happened" check. Also serves as the heartbeat — if the digest stops
arriving, monitoring itself has failed.

T7-M6: Scheduled health checks via Supabase Edge Functions on a cron
Verify Resend is sending (test send, check API response), Edge
Functions are responding, no orphan rows have accumulated, auth
flows are completing. Infrastructure dependency for T7-M4 (alerting
source) and T7-M5 (digest data source).

**Phase 2 — year 2+, as the platform matures**

T7-M7: Structured logging pipeline
Route logs from Netlify Functions, Supabase Edge Functions, and
client-side errors into a single searchable pipeline (Axiom,
Logflare, or Supabase Log Drains). Replaces ad hoc console
inspection. Unblocks pattern detection across components.

T7-M8: Error tracking with alerting on new error types
Sentry or equivalent. Groups errors, alerts on new signatures,
surfaces release regressions. Builds on T7-M7 once the log volume
justifies a dedicated error surface.

T7-M9: Synthetic transaction monitoring
Bot that places a test order every hour against a synthetic drop,
verifying the full order flow (page load, menu render, item add,
checkout submit, order_items written, confirmation shown). First
alert if the checkout flow silently breaks. Higher-signal than any
component-level ping.

T7-M10: Documented incident response runbooks
Written playbooks for common failures — Supabase down, auth broken,
Resend failing, payment provider outage, Netlify deploy stuck. Each
runbook names the symptom, the diagnostic steps, the likely fix, and
the rollback path. Written once, used when Ed is stressed.

T7-M11: Public status page at status.lovehearth.co.uk
Vendor-facing status page showing current platform health and
historical incidents. Builds trust by being transparent about
outages rather than hiding them. Depends on T7-M1 and T7-M3 as data
sources.

### Support & operations

Operational tooling and documentation that supports running the
platform alongside the build work. Not feature work; not in any
tier's critical path. Lives here because the items have lifecycle
and traceability concerns that belong in BACKLOG.md even though
they're not strictly product tickets.

T-support-dryrun-checklist: Pre-drop dry-run checklist (document, not code)
Written sequence to run with Healthy Habits Cafe before their first
real drop: create test drop → publish → place test order from a
separate device → mark order through full lifecycle (placed →
confirmed → baking → ready → delivered) → review scorecard. Goal:
build muscle memory before live customers arrive. Document lives in
repo as docs/support/dryrun-checklist.md or equivalent. No code
change; the deliverable is the checklist itself plus the lessons
captured from running it once.

T-support-issue-log: Internal vendor issue log
Running markdown file or Google Doc capturing every question, bug,
or confusion from real vendors. Each entry: date, vendor,
question/issue, resolution (or "unresolved → ticket X"). Source of
truth for what to build next and what to document. Lightweight —
text-only, no tooling. Source of upcoming tickets and onboarding
documentation. Feeds T7-17 priority and many post-launch Tier 4/5
tickets.

T-support-activation-ideas: Curated vendor activation ideas — manual onboarding runbook

Tier: Support & operations. Not a build ticket — the deliverable is a runbook
plus the curated ideas it produces.

A repeatable process Rob or Ed runs when a new vendor onboards: research what's
known about the vendor — their food, their existing audience, their online
presence (Instagram, website, local reputation) — and hand-build a small,
curated set of activation ideas to give them a head start. The ideas are
specific to that vendor: which hosts to approach first, how to use the audience
they already have, what first-drop format suits their archetype, and any angle
their online presence suggests. Delivered off-system at first (a short email or
a conversation), this is the human version of what T5-C6 will later automate.

Why manual, why now. T5-C6 (AI-powered activation plan) is the productionised
version, but it's a build, it depends on T4-28, and — by design — it reads only
structured onboarding fields plus social-handle presence as a boolean. It cannot
look at what's actually on a vendor's Instagram or website. The first real
vendors (Healthy Habits Cafe, Nathalie) onboard now and benefit most from exactly
the judgement a person brings to that research. The runbook covers the gap the
automated plan can't, and the gap before it ships.

Structure. Use T5-C6's five-section skeleton as the template (where to start ·
capacity · who to approach first · the first 8 drops · what the platform handles
automatically), plus a sixth, manual-only section: ideas drawn from the vendor's
online presence and local context. Reusing the skeleton means the manual work
also pressure-tests T5-C6's structure before anyone builds it.

Guardrails. Ideas stay inside the Hearth model: activation is letting people who
already value the vendor's food know a drop is happening, not chasing strangers
or competing for attention. No aggregator-style reach tactics, no manufactured
urgency. Voice follows the repetition-layer spec and the banned-word list.
Honest and restrained — a head start, not a sales pitch.

Deliverable. (1) A runbook in the repo at docs/support/activation-ideas-runbook.md
(or equivalent): the research steps, the section template, worked guardrails, and
one fully worked example. (2) The curated ideas per vendor captured somewhere
lightweight (the runbook specifies where — a per-vendor doc, or alongside the
issue log).

Feedback loop. Note which ideas a vendor actually acts on and how they land.
This feeds two things: the eventual T5-C6 pattern library (the manual runs are
its training material), and the vendor issue log (T-support-issue-log).

Surfaces later. The eventual productionised channels — a vendor welcome email
and in-platform prompts — are owned by T5-C6 plus a comms surface, not by this
ticket. This is the off-system human process that comes first and informs them.

Dependencies: none hard. Best run for every new vendor from first onboarding.
Cross-reference: T5-C6 (automated activation plan — this is its manual precursor
and research input), T-support-dryrun-checklist (sibling onboarding runbook),
T-support-issue-log (feedback capture), Hearth_Repetition_Layer_Voice_Spec.md (voice).
Status: Open. Pre-launch — run during the Healthy Habits / Nathalie onboarding.

T-support-healthy-habits-env-cleanup: Healthy Habits test-environment cleanup for vendor walkthrough

**Status:** Open. Pre-walkthrough — do in a dedicated focused session, not
folded into other work.

**Scope.** During the mobile-overflow and activation testing work, the
Big Ballz Catering drop (`e2a2fbd3-1637-46cd-92e8-3c0e2a7636d0`) was nudged
into a fake live/public state to exercise the activation detail cards:
`status`, `audience_scope = public`, `drop_type`, and shifted
`opens_at` / `closes_at` / delivery timing no longer reflect a real drop.
Alongside it are stray test rows that must come out before a real vendor sees
the workspace:
- `comms_log` seed rows (`vendor_open` / `interest_open` test sends),
- a seeded interest row for `test@example.com`,
- a test `order_confirmation` row.

The environment must be reverted to a clean, honest state before the Healthy
Habits workspace is walked through WITH the vendor (Nathalie) — a vendor
should never see fabricated drop state or test-customer data in their own
workspace.

**Why it exists.** Test mutations on the shared live Supabase accumulate and
will be visible to the real vendor during onboarding. Leaving fake live/public
state on a drop also risks it appearing on customer-facing surfaces
(`v_drop_public` scopes to `live`/`closed`/`completed` — operational learning
#70), so this is not purely cosmetic.

**Guardrail (load-bearing).** AUDIT-FIRST / read-only-inventory-first. This is
the shared production database — enumerate every affected row (the drop's
original vs current field values, the exact `comms_log` / interest /
order_confirmation rows) and reason out the dependency order BEFORE any
destructive delete or update. Deletes in FK-dependency order only. Prefer
restoring the drop's real prior field values over guessing; if the originals
aren't recoverable, set it back to a plain `draft` rather than inventing
timing. No bulk deletes.

**Also in scope.** Resolve the outstanding Southbury Farm Pizza
keep-as-demo-seed vs clear decision (~28 drops of historical test data) — decide
whether that history stays as the founding-vendor demo fixture or is cleared,
and record the decision here.

**Dependencies.** None code. Blocks the Healthy Habits dry run / vendor
walkthrough (pre-launch sequence item 5). Best run immediately before that
session.

**Cross-reference.** T-support-dryrun-checklist (the walkthrough this unblocks),
operational learning #70 (anon visibility of finished/public drops),
CLAUDE.md "Vendors currently in the database" (fixture inventory).

### Tier 8 — Platform audit and design system consolidation

Hearth has grown page by page, ticket by ticket. Each page is
well-built in isolation, but the platform has never had a single
pass of fresh eyes asking whether it feels coherent end to end.
Tier 8 is that pass — an independent audit across visual design,
vendor experience, and language, followed by the consolidation of
findings into a single source of truth so the platform does not
re-drift as it grows.

Principle: the audit is run by fresh eyes (Claude Chat in a
dedicated session), not by the original builder. Its purpose is
to ensure Hearth feels like one coherent platform, not a series
of well-built but inconsistent pages.

Sequencing:
- Do not start T8 until T3-8 (Stripe Connect Express) is complete.
- T8-1 through T8-3 can be run in parallel as independent audits.
- T8-4 depends on the outputs of T8-1 through T8-3.
- Findings from T8 become individual backlog items that get picked
  off alongside feature work — the audit itself does not stop
  ongoing development.

T8-1: Brand and visual consistency audit
Independent review of every page in the platform for:
- Consistent application of design tokens (colours, spacing, type,
  shadows, radii) from hearth.css
- Consistent component behaviour and styling (buttons, inputs, cards,
  modals, empty states, error states, loading states)
- Consistent iconography and imagery
- Consistent wordmark usage
Output: severity-ranked findings document with specific locations,
recommendations, and fix complexity estimates.

T8-2: Vendor journey experience audit
End-to-end walkthrough of the vendor experience from invite to
ongoing operation:
- Invite and onboarding flow
- First drop creation
- Live drop operation via Service Board
- Menu and brand setup
- Post-drop insights and history
- Navigation consistency
- Mobile-first quality
Output: journey map with friction points, confusion risks, and
recommendations for each step.

T8-3: Language, copy, and tone audit
Platform-wide review for:
- Vocabulary consistency against the Hearth brand playbook
  (drop, capacity, host, menu, community — and forbidden terms like
  campaign, listing, promotion, marketplace)
- Tone consistency (warm, calm, considered)
- Clarity (does every screen tell the user what, why, what next)
- Conciseness
- Empty and error state quality
- Microcopy consistency (buttons, form hints, confirmations)
Output: per-page copy recommendations plus a glossary/style guide
checkpoint.

**Closure note (2026-05-21):** All operator pages audited and copy pass complete. Pages covered: home.html (PR #270), onboarding.html (PR #271), drop-manager.html, brand-hearth.html, drop-menu.html, insights.html, scorecard.html, service-board.html. Key outcomes: ~45% word count reduction on home; governing principle "show rather than tell" applied throughout; nav renamed (Brand Hearth → Brand, Menu Library → Offer); Commercials terminology standardised (Community Contribution → Community fundraising, Host share → Host fee); Setup section → Fulfilment in Drop Studio; all brandTitle elements standardised to Hearth; T5-B41 enrichHostPreview duplicate rendering bug fixed in same branch. All changes accumulated on feature/t8-3-home-copy before single merge.

T8-3-sub1: Operator pages — "menu" language consistency audit
Tier 8. Open — pre-identified gap, does not wait for full T8 sweep.

The landing page (index.html) was broadened to cover non-hot-food vendors and updated to use "offer" rather than "menu" throughout. Operator pages — Drop Studio, Menu Library, Service Board, Insights, Brand Hearth — still use "menu" as the default term throughout UI copy, labels, and microcopy.

For a hot food vendor, "menu" is appropriate. For a butcher running a hamper drop, a bakery running a pre-order, or a farm shop running a weekly box, "menu" is the wrong word. The platform needs to be format-agnostic in its language.

Proposed fix: audit every operator page for "menu" language in UI copy, labels, buttons, empty states, and microcopy. Determine which instances should become offer/items/selection/catalogue and which are correctly "menu" in context (the Menu Library itself may retain its name — that is a separate vocabulary decision). Produce a vocabulary decision before implementing changes. This feeds into T8-3 (language, copy, and tone audit) and T8-4 (design system consolidation).

Note: the Menu Library page name and nav label is a separate decision. Do not change the page name as part of this ticket without a broader vocabulary decision first.

Dependency: none. Can be picked off before T8-1 through T8-4 are formally run.

T8-4: Design system consolidation
After T8-1 through T8-3 are complete, codify a single source of
truth for:
- Design tokens
- Component patterns
- Language and vocabulary
- Navigation patterns
- Mobile behaviour standards
This becomes the reference for all future pages and ensures the
platform doesn't re-drift.

Dependency: T8-1, T8-2, T8-3 complete.

T8-5: Per-vendor brand colour on generated social card scrims
Tier 8 — design-system / brand consistency. Open. Low priority.

**Scope.** The reveal card (Card 1) and capacity card (Card 6) generated
social assets currently hardcode their scrim/gradient colour to the warm-brown
family `rgba(139,107,63, …)` (= the `#8B6B3F` neutral default) rather than
driving it from `var(--vendor-brand-primary)`. This was a deliberate
export-fidelity tradeoff for html2canvas 1.4.1 (most recently unified under
#403, "one warm-brown family"). The orders-open card's flat tint already
follows the vendor colour via `var()`; the two scrim-based cards do not — so a
vendor with a custom `brand_primary_color` sees their colour on one generated
card but not the other two.

**Why it exists.** Per-vendor brand fidelity on the assets a vendor posts to
their own audience is the whole point of the Activation card system (Hearth
frames, vendor fills). The current state is an inconsistency: one of the three
generated cards honours the vendor's colour, two fall back to Hearth's neutral
brown. Investigate driving ALL generated-card scrims from
`var(--vendor-brand-primary)` while keeping the html2canvas export
pixel-faithful to the on-screen preview.

**Constraints (load-bearing).** (1) Export fidelity is sacrosanct — html2canvas
1.4.1 re-implements gradients/`object-fit` differently from the browser, which
is why the explicit-pixel/hardcoded-colour approach exists (T5-25 hard rule
family). Any change must keep preview and exported PNG identical by
construction. (2) Respect the E4 decision (operational learning #85): `#8B6B3F`
is RETAINED as the `--vendor-brand-primary` *fallback* (the neutral default
when a vendor has set no colour) and must NOT be swapped to Hearthfire there —
a colourless vendor's card must stay neutral, never render in Hearth's own
accent (brand-bleed). So the fix is "use the vendor colour when set, fall back
to the neutral brown when not", not "replace brown with Hearthfire".

**Dependencies.** None hard. Touches `activation.html` generated-card render +
the html2canvas export path; verify against a vendor WITH a custom
`brand_primary_color` and one without (fallback). Audit-first — confirm the
current scrim colour source per card before editing.

**Relations.** #403 (scrim unification — the change this follows up),
T-E4-activation-rgba-tints (the operator-chrome rgba convergence — sibling
brand-colour cleanup), T5-25 (generated-asset export hard rules), operational
learnings #63 and #85.

T-vendor-fee-copy — Reconcile vendor-facing fee copy with live cost-recovery
Status: Open. Commercial-decision gate before any copy is written. Near-term
(fee is live on all vendors) but not blocking.

The problem: Cost-recovery (1.5% + 20p) is now applied to every vendor via
platform_fee_pct / platform_fee_fixed_pence (all rows backfilled; new-vendor
default set in merged PR #474). No vendor-facing surface names or explains the
Hearth application fee. The only fee figure shown is the onboarding FAQ
(onboarding.html:1466), which attributes 1.5% + 20p to Stripe alone and does
not mention that Hearth's application fee is the recovery mechanism. Conflict
risks: vendor-terms.html:152 ("passed through at cost … no markup") must stay
literally true; vendor-terms.html:150 (three-month-free promise) is now stale
since cost-recovery is live for all vendors; why-hearth.html / index.html
"no commission" copy is fine under pass-through framing, conflicts under a fee
framing.

Decision required first (Ed): (1) pass-through vs fee — is the vendor covering
Stripe's cost (Hearth nets ~£0) or is Hearth charging on top? (2) is the
three-month free trial over (making terms:150 stale)?

Fix shape (not built, assumes pass-through confirmed): reword onboarding FAQ so
~1.5% + 20p reads as the card-processing cost the vendor bears (recovered via
Hearth, no markup); reconcile vendor-terms.html (no-markup line + stale
free-trial line); confirm "no commission" marketing still reads true. Word the
figure as "approximately/up to" since a flat 1.5% + 20p under-recovers on
premium/international cards (Hearth is safe on no-markup, but the wording should
never make it technically a markup on a cheap-card transaction).

Guardrails: copy only, not money-path. Must ship consistently across FAQ, terms
and marketing in one pass. Low severity — risk is under-explanation, not
overcharge.

Relations: PR #474 (fee default), repetition-layer voice spec, vendor-terms.html.

### Tier 9 — Agentic AI workstream

The boundary between Tier 5 and Tier 9 is intent. Tier 5
intelligence surfaces signals and recommendations as text. Tier 9
agentic features propose, draft, and prepare — then wait for
vendor approval before anything is committed. The vendor is always
the decision-maker. The platform does the thinking.

All Tier 9 features use the Anthropic API via Claude Sonnet.
Prompts are constructed from structured vendor data — never from
raw user input. Output is always presented as a draft for vendor
review, never applied automatically.

T9-1: Auto-draft drops from demand signals
When the intelligence engine identifies a strong demand cluster —
enough known customers in an area, a gap in the drop cadence, or a
returning host window — Hearth drafts a drop automatically and
surfaces it to the vendor as a suggestion. Draft includes: date and
window (based on cadence patterns), host context if a match exists,
suggested capacity (based on area customer count and historical
fill rates), and a menu pre-selected from the vendor's catalogue.
Vendor sees "We've drafted a drop for you" on the Home dashboard,
reviews, edits if needed, and publishes with one click. Nothing is
created without explicit vendor action.
Dependency: T4-28, T5-9, meaningful drop history.

T9-2-positioning: Brand positioning AI from uploaded assets

**Status:** Open. Tier 9. Split from T9-2 during T4-31b design,
May 2026.

On Brand Hearth, a vendor can trigger an AI brand analysis. They
provide their uploaded logo, hero image, a short free-text
description of their food and ethos, and their vendor category.
Claude analyses the inputs and returns: a suggested tagline (3
options), a brand positioning statement (2–3 sentences), a target
audience description, and an accent colour suggestion with
rationale. All outputs are presented as editable drafts — vendor
accepts, edits, or discards each independently. Nothing saves
until the vendor explicitly confirms. Particularly high value for
new vendors who arrive at Brand Hearth unsure how to describe
themselves.
Dependency: T2-7 (file upload for logo and hero image).

T9-2-visual: First-slice visual brand AI for the order page

**Status:** Open. Tier 9 (or earlier — could land before full
T9-2-positioning if vendor signal warrants).

**Scope:** Smaller, more focused than T9-2-positioning. Helps
the vendor's existing brand work *inside* Hearth's order-page
frame without redesigning their brand.

**Capabilities:**
- Logo palette extraction — analyse uploaded logo, surface 3-5
  dominant colours as suggested vendor primary/accent options.
- Hero image suitability assessment — analyse uploaded hero,
  flag if it's logo-led rather than food-led (per T4-31-BH
  guidance), suggest framing improvements.
- Contrast checks against the order page palette — vendor
  primary_color against `#faf7f4` warm card background, against
  body text `#1F2937`. Flag low-contrast configurations and
  suggest adjustments.
- Suggested primary_color for CTAs that work harmoniously with
  the hero image without clashing.

**Architecture:** client-side Anthropic API call with vision
(Sonnet 4.6 or Opus 4.7). Structured outputs: colour swatches
with hex values, suitability flags, suggested values. UI shows
accept/reject per suggestion, never auto-applies.

**Out of scope (lives in T9-2-positioning):** tagline
generation, about paragraph generation, brand positioning
statement, target audience description.

**Brand playbook constraint:** "Hearth frames the experience,
vendor fills the experience." This ticket helps vendors
articulate their brand inside Hearth's frame, never imposes a
Hearth-house style.

**Sequencing:** could land much earlier than T9-2-positioning
since the building blocks (hero upload, logo upload, vendor
primary_color) are now all in place after PR #225.

T9-3: Proactive host identification
Rather than vendors browsing the host directory manually, Hearth
suggests hosts they haven't worked with yet based on fit signals.
Matching logic: vendor category and audience tags cross-referenced
with host host_type and audience_tags, weighted by proximity
(vendor address vs host postcode), host estimated_audience_size,
and whether the host has an active service window that aligns with
the vendor's typical drop timing. Output: a ranked shortlist of
3–5 suggested hosts surfaced on the Home dashboard and in the
Hosts directory under "Suggested for you." Each suggestion shows
the match rationale in plain English: "Local gym, 200+ members,
Friday evening service window — strong fit for your health-focused
menu." Vendor clicks to view the full host profile or express
interest.
Dependency: T4-16 (complete), T5-B3 (vendor address captured).

T9-4: Drop optimisation strategy
A single surface — accessible from Drop Studio when creating or
editing a drop — that consolidates all available intelligence into
a plain-English strategy brief for that specific drop. Covers:
recommended timing based on cadence patterns, optimal capacity
given demand signals and historical fill rates, menu
recommendations based on what has performed in similar contexts,
predicted fill rate with confidence level, and estimated customer
reach in the target area. Presented as a collapsible "Strategy"
panel alongside the drop form. Vendor can accept individual
recommendations (which pre-populate the relevant fields) or ignore
them entirely.
Dependency: T4-28, T5-9, meaningful drop and customer history.

T9-5: Promotion copy generation
When a drop is published or moved to scheduled status, Hearth
offers to generate promotion copy in one click. Output: a WhatsApp
message (under 160 characters, conversational), a social caption
(Instagram/Facebook tone, 2–3 sentences with relevant emoji), and
a short descriptive paragraph suitable for email or a community
newsletter. All copy is generated in the vendor's brand voice —
informed by their tagline, category, and the specific drop context
(host name, date, menu highlights, capacity). Presented as
editable drafts in a modal. Vendor copies to clipboard or edits
before sharing.
Dependency: T2-7 (brand assets), T4-28 (intelligence engine for
context).

T9-6: At-risk customer flagging
Before customers reach lapsed status (60+ days no order), flag
them as at risk at 40 days. Surface a quiet alert on the Customers
page and Home dashboard: "14 customers haven't ordered in 40 days.
A drop in their area could re-engage them." Clicking through shows
the at-risk segment on the Customers page with postcode
clustering. The intelligence engine generates a plain-English
recommended action: "Your strongest at-risk cluster is RG10 with 9
customers. A Friday evening drop there could re-engage them before
they lapse entirely."
Dependency: T4-27 (complete), T4-28 (complete).

T9-7: Capacity intelligence
Upgrade the capacity signal from descriptive to predictive. Based
on historical fill rate patterns — day of week, drop type, host
context, time since opening — generate a prediction: "Based on
your last 6 Friday drops at The Bell, you typically reach 80%
capacity by Wednesday evening. At current trajectory this drop
will sell out by Tuesday." Surface on the Service Board for live
drops and in Drop Studio when setting capacity for a new drop. For
new vendors without history, fall back to platform-wide benchmarks
for similar drop types.
Dependency: T4-28, minimum 5 drops of the same type.

T9-8: Menu suggestion by context
When a vendor assigns a menu to a drop, surface AI-powered menu
suggestions based on context matching. Analyse item sales
performance grouped by host type, drop type, day of week, and
fulfilment mode. Present a ranked suggestion: "For a sports club
Friday evening, your Margherita, Garlic Bread and Brownie Box have
historically driven the strongest basket value. Consider featuring
these." Vendor can add suggested items to the drop menu with one
click.
Dependency: T4-28, meaningful item sales history across varied
contexts.

T9-9: Drop success prediction — pre-publish confidence scoring
Tier 9. Open — gated on real drop history across multiple vendors.

When a vendor configures a drop in Drop Studio, Hearth scores the drop's predicted fill rate before it is published and surfaces specific actionable recommendations to improve it. The score is based on the vendor's own historical drop patterns and, once cross-vendor data is sufficient, platform-wide patterns for similar vendor archetypes.

Scoring inputs (deterministic, SQL-computed): day of week and time window against the vendor's historical fill rates; capacity level relative to comparable past drops; host context — does this host have a strong track record for this vendor; offer composition — do the items enabled have strong sales history in this context; lead time — how many days between now and the drop opening; customer asset size in the relevant postcode area.

Output: a plain-English confidence signal surfaced in the Drop Studio Review pane. "Based on your last six Friday drops at this host, an 80-unit capacity at this price point typically reaches 85% fill. Your current configuration looks strong." Or: "Your last two drops with this offer on a Wednesday averaged 52% fill. Consider shifting to a Friday or reducing capacity." Maximum three recommendations, each with a clear rationale.

LLM role: SQL layer computes the scores and identifies the gap. Haiku 4.5 generates the plain-English framing only. Scores, counts, and percentages are always passed as structured data — never generated. See GenAI shared principles in BACKLOG.md for hard rules.

Dependency: T5-9 (intelligence engine maturity), meaningful drop history across at least 10 drops per vendor. Do not build on synthetic test data — wait for real drop history from real vendors before evaluating signal quality.

T9-10: Cross-vendor pattern intelligence — transferable archetype improvements
Tier 9. Open — gated on vendor count reaching meaningful scale (~20+ active vendors across at least two archetypes).

Once the vendor base reaches sufficient scale, Hearth can identify performance patterns that transfer across similar vendors and surface them as proactive improvement recommendations. Examples: food trucks that shift from Wednesday to Friday drops see an average fill rate lift in similar catchment areas; artisan producers who add a quantity-limited signal to their drop communication see higher early-order conversion; restaurants running community node drops with a fixed host for three or more consecutive months see higher customer return rates than ad-hoc host rotation.

Architecture: vendors are segmented by archetype (from onboarding answers) and by drop format patterns (host vs neighbourhood, hot food vs artisan goods, etc.). For each archetype cluster, performance patterns are computed nightly and written to a materialised intelligence table. Vendors whose configuration diverges from the high-performing pattern for their archetype receive a plain-English suggestion surfaced on the Home dashboard and in Drop Studio.

LLM role: same as T9-9 — SQL owns the signal computation, Haiku 4.5 owns the plain-English framing only. Patterns must be statistically significant before surfacing — minimum cluster size to be defined at build time.

Privacy consideration: no vendor sees another vendor's data directly. Recommendations are framed as "vendors like you" patterns, never as named comparisons.

Dependency: T9-9 (establishes the pattern computation infrastructure this ticket extends), minimum ~20 active vendors with meaningful drop history across at least two archetypes. Phase 3 roadmap item — do not build until the validation and early cohort stages are well established.

T9-11: Conversational drop creation — fast-path input for Drop Studio

**Status:** Open. Tier 9. Phase 0 — no drop history required.
Can ship once T9-12 (brand setup) has validated the conversational
pattern with real vendors.

**The problem**

A vendor creating their sixth Friday drop at The Bell already knows
exactly what they want. They have to click through five panes —
Basics, Timing, Menu, Capacity, Commercials — to say something they
could describe in one sentence. The form is the right canonical
representation; it is a poor input interface for a confident,
repeat user.

At the same time, a first-time vendor staring at a blank drop form
has the opposite problem: they do not know what fields mean, what
values are sensible, or where to start. Neither user is well served
by the current blank form as the only entry point.

**The solution**

A natural-language fast-path into Drop Studio. An optional "Describe
your drop" input appears at the top of the create-new-drop flow —
above the pane structure, before any field is touched. The vendor
types a sentence or two: "Friday evening at The Cricket Club, 40
pizzas, my usual menu, orders open Wednesday." Claude extracts
structured field values from the description and pre-populates the
drop form. The vendor lands on the Review pane with a draft ready
to inspect, adjust, and publish. The form stays canonical; the
conversation is the fast path in.

**Extraction scope**

The LLM extracts the following from the vendor's input, mapping to
existing drop fields:

- Day and time → `delivery_start`, `delivery_end` (inferred from
  vendor's typical window if not specified)
- Host name → `host_id` (matched against vendor's existing hosts
  by name)
- Capacity → `capacity_units_total` or the appropriate capacity
  mode fields
- Menu intent → pre-selects the vendor's most recently used menu
  items, or all items if "usual menu" is specified
- Orders open timing → `opens_at` (inferred from drop date if not
  specified)

Fields that cannot be confidently extracted from the description
are left blank for the vendor to complete. The system never guesses
at ambiguous values — it surfaces them as "we need a bit more
detail" prompts rather than filling with defaults that might be
wrong.

**Architecture**

Client-side Anthropic API call (Haiku 4.5). Input: vendor's
natural-language description plus structured context (vendor's
existing hosts as a lookup table, vendor's available menu items,
vendor's historical drop timing patterns). Output: a JSON object
mapping drop fields to extracted values, with a confidence flag
per field and a short explanation of any ambiguity. The page-side
JS applies the extracted values to the form state and renders the
pre-populated drop in the Review pane.

Follows the conversational interface governing principle in the
Hearth AI Strategy section: the form stays canonical; conversation
is the fast path in. The vendor's explicit save action is always
required to commit the record.

**UX**

A quiet "Describe your drop →" link or button on the Drop Studio
landing state (when no drop is selected and "Create new drop" is
the primary action). Vendor types into a single textarea. Platform
responds with a pre-populated draft and a plain-English summary of
what it understood: "I've set up a Friday evening drop at The Bell
with 40 capacity and your usual menu. Ordering opens Wednesday at
5pm — check the details below and adjust anything I got wrong."
Vendor reviews, edits if needed, publishes.

The fast-path is optional and dismissible. Vendors who prefer the
form directly are not impeded.

**Failure mode handling**

If the vendor's description is too vague to extract any meaningful
values, the platform surfaces a brief clarifying question rather
than pre-populating nothing: "Sounds good — what date are you
thinking, and which host?" One round of clarification maximum.
After that, open the blank form.

**Sequencing rationale**

Gated on two conditions: (1) T9-12 has validated the extraction
pattern with real vendors on a lower-stakes surface before applying
it to drop creation; (2) at least one real vendor has run multiple
drops so the historical timing pattern context is meaningful.

**Dependencies:** T9-12 (pattern validation), meaningful vendor
drop history. Vendor's hosts must be populated in the hosts table
for host matching to work.

**Cross-reference:** T9-12 (sibling conversational surface),
Hearth AI Strategy section (governing principles), T5-C6
(activation plan — same structured extraction pattern at a
different lifecycle stage).

T9-12: Conversational brand setup — fast-path input for Brand Hearth

**Status:** Open. Tier 9. Phase 0 — no drop history required.
High priority within Tier 9: should surface at the end of
onboarding as the entry point into Brand Hearth for every new
vendor.

**The problem**

A vendor completing onboarding arrives at Brand Hearth facing a
set of blank inputs: display name, tagline, about paragraph, accent
colour, hero image. Most food vendors are confident about their
food and uncertain about how to describe it in writing. The blank
page is the problem. A tagline field labelled "Tagline" does not
help a baker figure out what their tagline should be.

The result is one of two failure modes: vendors skip brand setup
entirely (their order page looks unbranded), or they fill in the
first thing that comes to mind and never revisit it (their copy is
generic and does not represent them well).

**The solution**

A guided conversation as the entry point into Brand Hearth for new
vendors. Three to four natural-language questions surface what the
vendor needs to communicate; Claude drafts their brand copy from
the answers. The vendor lands on Brand Hearth with tagline and
about paragraph pre-filled, and reviews, edits, and saves.

**The conversation — three questions maximum**

1. "What do you make, and what makes it worth ordering?" — opens
   the vendor's voice. Surfaces food type, quality signals,
   occasion context.
2. "Who do you mostly sell to, and where?" — surfaces audience
   and geographic identity.
3. "Is there anything specific you want people to know about how
   you work or what you care about?" — optional. Surfaces
   provenance, sourcing, ethos, or operational pride points.

Three questions. No more. The platform asks the minimum needed to
generate a credible first draft, not a brand strategy workshop.

**Extraction and generation scope**

From the vendor's answers, Claude generates:

- **Tagline** — two or three options, each under 8 words, in the
  vendor's voice. Warm, specific, not generic. "Wood-fired and
  worth waiting for" not "Delicious food for everyone."
- **About paragraph** — two to three sentences. Describes what
  the vendor makes, for whom, and what distinguishes them.
  Written in first person, calm and proud.
- **Accent colour suggestion** — if the vendor has uploaded a
  logo, palette extraction surfaces 2–3 dominant colours as
  options. If not, a category-informed suggestion with rationale.

All outputs are presented as editable drafts. The vendor accepts
each independently, edits inline, or discards and writes their
own. Nothing saves until the vendor explicitly confirms.

**Architecture**

Client-side Anthropic API call (Haiku 4.5 for copy generation;
Sonnet 4.6 if logo image is provided and colour extraction requires
vision). Structured context passed to the model: vendor category
and archetype from onboarding answers, food type inferred from
brand data where available, Hearth tone principles as system
prompt.

Follows the governing principle in the Hearth AI Strategy section:
conversation is the fast path in; the Brand Hearth form stays
canonical. The vendor's explicit save via the existing
`update-vendor` Edge Function is required to commit.

**Where it surfaces**

**Primary:** end of onboarding, intercepting the "Set up your
brand →" CTA. T9-12 runs the three-question conversation, then
routes the vendor into Brand Hearth with fields pre-filled.

**Secondary:** an optional "Re-generate a starting point →" link
on Brand Hearth for returning vendors who want to revisit their
copy. Surfaces the same conversation with existing answers
pre-loaded for editing.

**Relationship to T5-C6**

T5-C6 generates a personalised activation plan from onboarding
answers. T9-12 generates brand copy from a short conversation.
Both are Phase 0 AI features that make the early vendor experience
feel intelligent and personal. Together they define what it feels
like to complete onboarding on Hearth: not a form-filling exercise,
but a platform that understood you and got you ready.

**Dependencies:** T5-C6 (establishes the onboarding completion
moment this ticket extends). T2-7 (logo upload — optional; enables
colour extraction if present). Onboarding archetype data (complete).

**Cross-reference:** T9-11 (sibling conversational surface —
validate pattern here first), T9-2-positioning (complementary;
T9-12 handles copy, T9-2-positioning handles visual brand
analysis), T4-20 (onboarding to Brand Hearth continuity — T9-12
supersedes the current quiet confirmation bar), Hearth AI Strategy
section (governing principles).

Recommended build sequence for Tier 9:
First: T9-6 (at-risk flagging) and T9-5 (promotion copy) —
immediate vendor value, fewest dependencies.
Second: T9-2 (brand AI) and T9-3 (host identification) —
demo-compelling, no deep drop history needed.
Third: T9-1, T9-4, T9-7, T9-8 — need real data to be credible,
build once Southbury Farm has meaningful drop history and Healthy
Habits is live.

### Activation surface (T-ACT)

Follow-on tickets surfaced by the Activation surface build (shipped
2026-05-29 — see CLAUDE.md "Recent updates" and operational learnings
#63–#65). All open.

#### T-ACT-1 — AI-personalised activation message copy

Replace generated template text in Cards 2, 4, 5 with vendor/drop-aware
copy via Claude API (Haiku 4.5). Input: vendor name, drop name, drop
context (host, date, capacity, closes_at). Output: WhatsApp message,
social caption. No AI feature commits anything without explicit vendor
approval — edit state allows vendor to review and modify before
copying. Gated on real drop history from Healthy Habits Cafe.

Note (2026-05-30): Early access and thank-you sends now ship via
send-early-access-email and send-post-drop-thankyou Edge Functions,
wired to Cards 3 and 9 in Activation. T-ACT-1 covers the AI
personalisation layer on top of these working sends — the plumbing
is in place, the copy is still template-generated.

#### T-ACT-2 — Cross-drop today's actions summary strip

Aggregate due touchpoints across all live/upcoming drops on the
Activation landing page. Show what needs attention today without
clicking into individual drops. Deferred from original Activation build
session.

#### T-ACT-3 — Card 3 actual customer count

Fetch count of customer_relationships where owner_id = vendor_id and
consent_status = 'granted' and customer has email. Display as "Sends to
X previous customers" on Card 3. Currently shows generic text. Requires
a lightweight Edge Function call or addition to get-home-dashboard
payload.

#### T-ACT-4 — Activation progress persistence ✓ COMPLETE 2026-07-14

Shipped and confirmed complete via the backlog reconciliation audit
(audit/findings-backlog-reconciliation.md); marked open in error. Activation
progress is now persisted to a sealed store: the `activation-events` Edge
Function backs an `activation_events` table, and each drop's log is hydrated from
it on load (activation.html:1864), replacing the previous in-memory-only
`state.activationLog` that reset on reload. Ed confirmed the `activation_events`
table exists in production via the SQL editor (2026-07-14), sealing the one
non-repo-verifiable dependency (the table was created out-of-band via the SQL
editor, not a committed migration — a backfill migration remains a separate
housekeeping item under T-base-ddl-backfill). Original spec prose retained below
for history.

state.activationLog is in-memory only — resets on page reload. Persist
log to Supabase (new table or JSONB column on drops) so progress
survives sessions. Design carefully: log should be vendor-scoped and
drop-scoped. Consider whether confirmed email sends (Cards 3, 9) should
write back to a communications log rather than a UI-state log.

#### T-ACT-5 — Drop Studio Review pane polish

Review pane layout needs tightening now the reveal post section is
removed. Currently single-column with generous whitespace. Reduce
padding, tighten section gaps, make "Go to Activation →" button more
prominent as the primary post-publish action.

