# Hearth — Claude Code Project Guide

## What Hearth is

Hearth is a vendor-first, community-powered food ordering platform built around
planned "drops" — not always-on ordering. Every drop has a fixed time window,
a designed menu, declared capacity, and a host context. This is not a
marketplace. It is not an aggregator. It is infrastructure for shared local
food moments.

Core belief: great local food should strengthen communities, not bypass them.

## The model — non-negotiables

- Drops are always: time-bound, capacity-limited, pre-order only
- Vendors control when and how they operate
- Community hosts benefit visibly and meaningfully
- No marketplace language, no fake urgency, no aggregator patterns
- Capacity is always real and respected — never manipulated

## Tech stack

- Static HTML / CSS / JS — no framework
- Supabase (Postgres) with Supabase JS v2 — direct DB queries from frontend
- Netlify hosting — auto-deploys from main branch
- GitHub repo: github.com/edwardharvey-alt/southbury-ops
- Shared stylesheet: assets/hearth.css
- Config: assets/config.js — exports window.HEARTH_CONFIG.SUPABASE_URL
  and window.HEARTH_CONFIG.SUPABASE_ANON_KEY

## File structure

- index.html — Service Board (live operational view for active drops)
- drop-manager.html — Drop Studio (create and configure drops)
- drop-menu.html — Menu Library (products, bundles, categories)
- brand-hearth.html — Brand Hearth (vendor identity editor)
- insights.html — Insights (analytics dashboard)
- customers.html — Customers workspace (owned-customer asset view)
- customer-import.html — CSV import flow for existing vendor customer lists
- onboarding.html — Vendor onboarding / Setup (two-pathway journey)
- home.html — Platform home dashboard
- order.html — Customer-facing ordering page
- order-confirmation.html — Post-order confirmation destination
- order-entry.html — Dev tool for test order entry (legacy, needs rebuild)
- scorecard.html — Post-drop scorecard (per-drop performance view)
- hosts.html — Host Directory (vendor-facing host management page)
- host-profile.html — Host Profile (editable profile and drop history per host)
- host-view.html — Read-only host-facing drop view (no login)
- admin.html — Admin vendor provisioning page (auth-gated to Ed's UID)
- assets/hearth.css — shared platform stylesheet
- assets/config.js — Supabase config
- assets/hearth-intelligence.js — shared intelligence engine module
  (archetype detection, capacity/rhythm/menu/growth signals, recommendation
  generation, customer segmentation) consumed by insights.html,
  customers.html and home.html
- assets/vendor-nav.js — HearthNav helper module exposing
  withVendor(href), renderNav(container, activeFile), and decorateLinks(root).
  Loaded synchronously in every operator page's <head>. Used to build nav
  bars at parse time and preserve the ?vendor= URL param across all internal
  navigation. Cache-busted via ?v=2
- assets/vendors/southbury-farm-pizza/ — vendor image assets

## Vendors currently in the database

- Southbury Farm Pizza Company (slug: southbury-farm-pizza) — the
  founding vendor, used as the default historical test workspace with
  real product/bundle/drop data
- Healthy Habits Cafe (slug: healthy-habits) — real vendor added this
  session. Restaurant in Broadstone, Poole. Instagram: healthyhabits_.
  onboarding_completed: false — first workspace a real vendor will
  walk through
- Test Vendor (slug: test-vendor) — clean test workspace with no drops
  or catalogue, used to verify first-drop guidance, vendor isolation,
  and empty-state rendering. onboarding_completed: false

Load any vendor's workspace via the ?vendor=<slug> URL param on any
operator page (see the Operational learnings section on resolveVendor
and HearthNav.withVendor).

## Database — key tables

- vendors — vendor identity and brand settings. Key columns include
  `slug`, `display_name`, `name`, `contact_phone`, `address` (text,
  physical address — added this session), `social_handles` (jsonb,
  default `{}`, shape `{"instagram": "handle", "tiktok": "handle", ...}`
  — added this session), `onboarding_completed` (boolean), and the
  onboarding answer columns (`primary_goal`, `delivery_model`,
  `pos_platform`, `pos_platform_other`, `customer_data_posture`,
  `existing_host_contexts`, etc.) populated by the onboarding flow.
  `terms_accepted` / `terms_accepted_at` to be added when T4-25 is built
- drops — the core unit: each drop has slug, timing, capacity, host, status,
  collection_point_description (text), delivery_area_description (text),
  customer_notes_enabled (boolean, default true)
- drop_menu_items — items enabled for a specific drop (product or bundle)
- products — catalogue products (vendor-scoped)
- bundles — catalogue bundles with bundle_lines and bundle_line_choice_products
- categories — product/bundle groupings (vendor-scoped)
- orders — customer orders (drop_id, customer details, status, pizzas field)
- order_items — line items (item_type: product|bundle, qty, price_pence,
  capacity_units_snapshot)
- order_item_selections — bundle choice selections per order item
- order_status_events — audit trail of status transitions
- hosts — community hosts (clubs, schools, venues). Key columns include
  `name`, `slug`, `host_type` (club, pub, school, venue, neighbourhood,
  event, other), `status` (active, inactive, archived), `relationship_status`
  (prospect, active, paused), `onboarding_completed` (boolean),
  `postcode`, `address_summary`, `contact_name`, `contact_email`,
  `contact_phone`, `website_url`, `social_handles` (jsonb, shape
  `{"instagram": "handle", "facebook": "handle"}`),
  `audience_description` (text), `estimated_audience_size` (integer),
  `audience_tags` (jsonb array, e.g. `["families","sport"]`),
  `service_windows` (jsonb array of objects with day_of_week,
  time_start, time_end, occasion_label, notes),
  `comms_channels` (jsonb array of objects with type, detail,
  estimated_reach), `notes_internal` (text). Hosts are platform-wide
  entities (not vendor-scoped) — drop history shown per vendor is
  filtered via v_drop_summary
- drop_series / drop_series_schedule — recurring drop infrastructure

## Database — key views

- v_drop_summary — primary drop view used across all operator pages
- v_drop_orders_summary — order list for Service Board
- v_order_item_detail_expanded — expanded item detail for Service Board
- v_drop_menu_item_stock — menu items with capacity and stock tracking
- v_drop_readiness_v2 — drop readiness checklist
- v_hearth_summary — 30-day business summary for home/insights
- v_hearth_drop_stats — per-drop analytics
- v_hearth_revenue_over_time — revenue time series
- v_item_sales — item-level sales analytics
- v_host_performance — host-level analytics

## Critical rules for all code changes

1. NEVER hardcode vendor slugs, vendor IDs, or capacity category names.
   All vendor resolution must use resolveVendor() pattern:
   URL param → window.HEARTH_VENDOR_ID → first vendor fallback.

2. NEVER use pizza-specific language or assumptions. Capacity drivers are
   vendor-agnostic. The capacity category is defined per drop.

3. ALWAYS use window.HEARTH_CONFIG.SUPABASE_URL and
   window.HEARTH_CONFIG.SUPABASE_ANON_KEY for Supabase initialisation.
   Never use window.HEARTH_SUPABASE_URL or window.HEARTH_SUPABASE_KEY.

4. NEVER patch — always understand the full context before making changes.

5. ALWAYS produce complete, untruncated, copy-paste ready code.

6. Branch naming: fix/description for fixes, feature/description for new
   features, enhance/description for improvements.

7. One logical change per branch. Never bundle unrelated changes.

8. orders.pizzas is a legacy NOT NULL field with a >= 1 constraint.
   When inserting orders, populate pizzas with the capacity units consumed
   (minimum 1) until this field is formally migrated away.

9. hearth.css contains page-specific override blocks — always check before
   adding CSS.
   hearth.css has historically had page-specific !important blocks appended
   to the end of the file (e.g. "DROP STUDIO HARD WIDTH RESET"). These blocks
   use class selectors with !important and will silently override page-level
   <style> block rules that use the same selectors and flag.
   When CSS changes are not applying as expected:
   - Check the end of hearth.css for page-specific override blocks targeting
     the same selectors
   - If a hearth.css block is overriding a page fix, remove the hearth.css
     block and apply the correct rule in the page <style> block using an ID
     selector (#elementId) for guaranteed specificity
   - Never add new page-specific rules to hearth.css — all page-specific
     styles belong in the page's own <style> block

10. Always start every session with `git fetch origin && git reset --hard
    origin/main` before making any changes. Do not use `git checkout main &&
    git pull` — this fails silently when local and remote histories have
    diverged, which is a known persistent issue with this repo. The hard
    reset always wins regardless of local state.

## Operational learnings

Gotchas and patterns captured from real bugs. Treat these as hard rules
on top of the coding rules above.

1. **Vendor isolation — `v_drop_summary` has no RLS safety net.** Any
   page that queries `v_drop_summary` as a list MUST filter with
   `.eq("vendor_id", state.vendorId)`. The view exposes every vendor's
   drops; the frontend is the only thing scoping them. `loadDrops()` in
   drop-manager.html and index.html were both missing this filter and
   leaked cross-vendor data until it was fixed. The same rule applies to
   any future view or page that reads drops as a collection. Fetching
   by drop_id (`.eq("id", …)`) must additionally assert
   `row.vendor_id === state.vendorId` after the fetch, mirroring
   scorecard.html:657 — this defends against stale
   `localStorage.hearth:selectedDropId` values pointing at another
   vendor's drop.

2. **`resolveVendor()` must never silently fall back when a slug was
   provided.** The `.limit(1)` fallback is a dev convenience that only
   fires when NO `?vendor=` / `?vendor_slug=` param was given. If a slug
   WAS provided but no row matches, the function must `return null` and
   the caller must show a clear "Vendor not found" error state — never
   load another vendor's data. Silent wrong-vendor fallback is a data
   exposure risk and was fixed across all 10 operator pages this
   session.

3. **Always use `HearthNav.withVendor(href)` when generating operator
   page URLs in JS.** This applies to template literals that build
   anchor HTML AND to every `window.location.href` / `location.assign`
   assignment that targets an operator page. Never construct an
   internal operator URL in JS without routing it through
   `HearthNav.withVendor()` — otherwise the active vendor context is
   lost on navigation. Nav bars themselves are built synchronously by
   `HearthNav.renderNav(containerId, activeFile, opts)` called inline
   right after the nav placeholder element. Static content CTAs that
   live in HTML are covered by `HearthNav.decorateLinks()` called as
   the last script tag inside each operator page's `<body>`.
   Customer-facing pages (order.html, order-confirmation.html) and
   host-facing pages (host-view.html) intentionally do NOT load
   vendor-nav.js — the vendor slug must not appear in URLs those
   audiences see.

4. **Netlify free tier has bandwidth limits.** Upgrade to Pro before
   the first real vendor goes live. Current hosting is fine for
   development and demos but will not cover sustained real-drop
   traffic.

5. **Legal pages (privacy, terms) are platform-level** — suppress
   vendor subheading in nav, replace with neutral platform language.
   All three documents carry amber draft banners and version 0.1
   notes pending legal review.

6. **`customer_relationships` uses a polymorphic `owner_id` /
   `owner_type` pattern — there is no `vendor_id` column on this
   table.** Correct query pattern:
   `.eq('owner_id', state.vendorId).eq('owner_type', 'vendor')`. The
   `customers` table uses `name` (not `full_name`). The `orders` table
   has no `vendor_id` — filter orders by vendor by first fetching drop
   IDs from `drops` where `vendor_id = state.vendorId`, then using
   `.in('drop_id', vendorDropIds)`. RLS: `customer_relationships` and
   `customers` both have temporary anon SELECT policies (`USING (true)`)
   added as pre-auth measures. Both must be replaced with
   `auth.uid()`-based policies when T5-A lands.

7. **Auth flow routing patterns**
   - `?redirect=` pattern: before redirecting an unauthenticated user to
     login.html, store the intended URL in sessionStorage as
     `hearth:redirect`. After successful auth, auth-callback.html reads
     and clears this value and routes accordingly.
   - New vs returning vendor: auth-callback.html distinguishes by querying
     vendors where auth_user_id = session.user.id. No row = new vendor.
     Row with onboarding_completed false = incomplete onboarding. Row with
     onboarding_completed true = returning vendor.
   - `?vendor=` param: retained as a localhost-only dev override after auth
     ships. resolveVendor() checks window.location.hostname === 'localhost'
     before honouring it. On production, session is the only identity source.

8. **PRs from claude/ branches must be verified — not all files always merge**
   PR #133 from branch claude/add-privacy-policy-V4lvq merged only
   privacy.html, silently dropping vendor-terms.html and host-terms.html
   which were on the same branch. Both files had to be manually restored
   from the source branch after the fact. Always check that all intended
   files from a claude/ branch PR have landed on origin/main before
   marking a task complete in CLAUDE.md.

9. **Repo root cause — orphan history now resolved**
   Local main and origin/main had completely disjoint histories across
   multiple sessions (104 local vs 67 remote commits) due to multiple
   root commits in the repo. Fix applied: local main reset hard to
   origin/main. Backup branch main-backup-pre-divergence-fix preserves
   the old local history. Future sessions should behave normally —
   git pull on main will fast-forward cleanly.
   The git pull on main will fast-forward cleanly expectation has since
   proved false — the divergence recurs every session because Claude Code
   does not persist local repo state between sessions. The correct fix is
   to always start with git fetch origin && git reset --hard origin/main,
   documented above as Critical rule #10.

10. **Onboarding grids use click handlers on the card div, not change
    events on hidden inputs.** The `.onboardingOption` cards hide their
    native radio/checkbox input with `pointer-events: none` so the whole
    card is the tap target. That means input `change` events never fire
    on iOS Safari — the grid wiring must listen for `click` on the card
    and toggle `.active` on the card itself, with state read from
    `.onboardingOption.active` rather than `input:checked`. All nine
    grids (Q1–Q9) now follow this pattern. `syncStateFromDOM()`
    enumerates every grid including `q9Grid`, so `evaluate()` sees
    consistent state after any click. Q1–Q9 click-handler fix validated
    on iOS Safari — the original iOS radio selection bug flagged in the
    handover is definitively closed.

## Brand and tone

- Calm, assured, warm, considered, local
- Never: marketplace language, fake urgency, discount/promotion framing,
  algorithmic language
- Vocabulary: Drop, Capacity, Host, Planned moment, Service Board,
  Drop Studio, Menu Library, Brand Hearth, Insights
- Avoid: Campaign, Listing, Inventory, SKU, Funnel, Promotion, Deal

## Order flow — current state

Order persistence is complete. order.html writes to:
- orders (with pizzas legacy field populated from capacity units, minimum 1)
  Fields captured: customer_name, customer_phone, customer_email,
  customer_postcode (always required), delivery_address (always shown,
  required for delivery mode only), fulfilment_mode, customer_notes,
  contact_opt_in (boolean, default false), contact_opt_in_scope ('both'
  when opted in), total_pence, drop_id.
- order_items (item_type, product_id or bundle_id, qty, price_pence,
  capacity_units_snapshot, item_name_snapshot)
- order_item_selections (for bundle choice selections)

Fulfilment mode selection: shown to customer when drop.fulfilment_mode is
'mixed' or 'both'. Single-mode drops silently write the drop's mode.

Marketing opt-in: unticked checkbox on checkout form. Label populated
dynamically with vendor name and host name (if present). Maps to
contact_opt_in and contact_opt_in_scope on orders table.

Address capture: checkout form collects house number/name, street, town/city,
and postcode as separate structured fields. These are concatenated into a
single string ([house], [street], [town], [postcode]) and written to
delivery_address. Postcode is also stored separately in customer_postcode
(reformatted with a single canonical space). Phone is stored normalised
(spaces and hyphens stripped).

Stripe integration is next. Order ID is generated, payload is structured,
TODO comment marks exact insertion point in handoffToPayment().
When configuring the Stripe Payment Element, set it to skip address
collection — Hearth captures the full address at order time.

## Development backlog

### Tier 1 — Must work before first real drop

T1-1: Double-submit protection on order.html
Disable Pay button permanently after successful order insert. Prevent
duplicate orders from impatient taps.

T1-2: Service Board — verify new order structure
Confirm Service Board reads correctly from new order_items structure
including item_name_snapshot. Ensure capacity display is accurate.

T1-3: Home page — fix vendor resolution error
maybeSingle().catch is not a function — Supabase JS v2 chaining issue.
Replace .catch() with proper async try/catch. Page flashes then fails.

T1-4: Order page — hero image white strip
Hero image not filling top section, leaving white strip at bottom of
image area. CSS background-size or min-height fix required.

### Tier 2 — Must work before showing anyone

T2-1: Global navigation — add all pages to every header
Every operator page needs consistent nav: Home, Service Board, Drop Studio,
Menu Library, Brand Hearth, Insights. Currently inconsistent.

T2-2: Service Board — remove need to scroll to reach Kanban
Operator needs Kanban visible on load during live service. Hero KPI section
should be collapsible or layout restructured.

T2-3: Service Board — Realtime auto-refresh
Add Supabase Realtime subscription to orders table for selected drop.
Board updates live as orders come in. No manual refresh needed.

T2-4: Drop Studio — fix inconsistent horizontal tile spacing
Drop card band spacing inconsistent. Audit and fix across all breakpoints.

T2-5: Menu Library — fix inconsistent horizontal tile spacing
Same issue as Drop Studio.

T2-6: Brand Hearth — fix text and button edge positioning
Text in first major horizontal section too close to edge. Buttons on right
need proper padding/margin.

T2-7: Brand Hearth — file upload for logo and hero image
Replace URL inputs with file upload. Save to Supabase Storage under
assets/vendors/{vendor-slug}/. Blocking proper brand setup and testing.

T2-8: Replace hardcoded vendor slug across operator pages
drop-manager.html, drop-menu.html, brand-hearth.html hardcode
"southbury-farm-pizza". Replace with resolveVendor() pattern.

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
host-profile.html, index.html (Service Board), onboarding.html (Setup),
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

T3-7: Order page — real-time capacity update
Add periodic re-fetch or Realtime subscription so capacity shown to
customer reflects other customers' orders placed while page is open.

T3-8: Stripe integration
When ready for go-live. Order ID generated, payload structured, TODO
comment marks exact insertion point.

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

T3-10: Order ready notification
When operator marks order as Ready on Service Board, prompt with customer
phone number pre-filled for manual SMS notification. Full automation via
Twilio in T5-11. No dependency.

T3-11: Menu Library — delivery and collection suitability flags
Add per-item flags: travels well for delivery, suitable for collection,
prep complexity. Helps vendors build delivery-appropriate menus and feeds
future fulfilment intelligence.

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

T4-15: Multiple drops within a single event
Allow vendor to create multiple drops linked to the same host context with
different time windows — e.g. food truck running 12–2pm and 6–8pm at same
event. Drop Studio to offer "Create another window" option when drop is
host-linked, pre-populating vendor, host, and menu. Capacity and ordering
windows remain separate per drop.

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

T4-17: Drop Studio — audience targeting and demand preview
When creating a drop, surface: known customers in target area, estimated
demand range from historical data, suggested host if one exists nearby.
Pre-drop confidence indicator. Dependency: T3-9.

Priority note: should be built immediately after T4-14 (customer import)
and T5-9 (recommendation engine V1) are complete. This is the moment
Drop Studio becomes visibly intelligent — a vendor creating a drop sees
how many known customers are in the target area before they commit.
Strategically important, not just a nice-to-have.

T4-18: Brand Hearth — add contact phone field ✓ COMPLETE
Phone number input added to Brand Identity section of Brand Hearth.
Saves to `vendors.contact_phone`. Pre-populates from saved value on
load.

T4-19: Onboarding → Brand Hearth continuity
When a vendor arrives at Brand Hearth having completed onboarding, the
page should acknowledge that their identity basics are already set. Show
a quiet confirmation at the top of the Brand Identity section: "Your
business name and website were carried over from your setup." This
removes the friction of a vendor feeling they need to re-enter
information they already provided. No data change — purely a UX state
based on `onboarding_completed` being true and `display_name` being
populated.

T4-20: Onboarding → first drop pathway
When a vendor completes onboarding and has flagged existing host
relationships in Q9, the completion screen should offer a direct pathway
to creating their first drop with that context pre-populated. Button:
"Create your first drop →" linking to Drop Studio with the host type
pre-selected where possible. For vendors with no existing host context,
the button links to Drop Studio without pre-population. This closes the
gap between setup and action — the moment onboarding ends should feel
like the beginning of something, not a dead end.

T4-21: Customer import — post-import demand view
After a vendor completes a customer import (T4-14), surface a
post-import summary showing: total customers imported, geographic
breakdown by outward postcode, top three demand clusters with customer
counts. Plain-English framing: "Your strongest area is RG10 with 34
customers. That's a good starting point for your first neighbourhood
drop." This is the moment the recommendation engine becomes real for
data-rich vendors. The summary should appear on the Home dashboard and
be accessible from Insights.

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

T4-30: Onboarding delivery model audit
Review whether aggregator-dependent vendors are correctly captured in
the onboarding flow. The `reduce_aggregators` goal and `aggregator`
delivery_model option exist but may not be prominent enough given that
reducing aggregator dependency is a core Hearth pitch. Ensure the
intelligence layer (T4-28) surfaces appropriate recommendations for
these vendors — e.g. "You told us you want to reduce aggregator
dependency. Your last 3 drops brought in 12 new direct customers —
that's 12 people you can reach without paying commission." Audit
onboarding Q3 (primary_goal) and Q5 (delivery_model) for clarity and
prominence of the aggregator reduction pathway.

T4-31: Order page and ordering experience — visual polish pass
Review and improve the visual quality of the customer-facing ordering
experience. Known opportunity: per-item menu photography. Allow vendors
to upload an image per product, stored in Supabase Storage and rendered
on the order page alongside the item name and description. Schema change
required: add image_url (text, nullable) to products table. Order page
renders image when present, degrades gracefully when absent.
Broader brief: assess what else would make the ordering page feel more
premium, more locally specific, and more vendor-led. This is about making
vendors proud to share their order link.

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

T4-33: Brand Hearth — vendor customisation review
Conduct a structured review of Brand Hearth to identify what additional
brand controls would meaningfully change how vendor-owned the experience
feels. Current state is minimal: hero image, display name, tagline, colour
picker. Assess whether vendors currently feel proud showing their Brand
Hearth page to customers. Candidates for improvement: font choices, accent
colour application across more UI elements, a secondary brand image, richer
"about" copy, social handle display.
Goal is not feature bloat — it is asking what is missing before deciding
what to build. Run as a focused design review before any build work.

### Tier 5 — Strategic platform features

T5-1: Delivery optimisation
Route planning and batching for neighbourhood drops. Cluster addresses,
suggest optimal route. Not needed for community drops.

T5-2: Demand generation — SMS alerts
Text previous customers when new drop announced. Triggers: drop live,
capacity running low, new vendor in area, regular cadence reminders.
Requires customer consent model.

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

T5-8: Interest registration — signals mechanic
Pre-live state on order page before opens_at. Customer registers interest
with name and email. Writes to customer_relationships with source =
interest. Vendor sees interest count in Drop Studio labelled "Signals
building". Dependency: T3-9.

T5-9: Recommendation engine — matured intelligence
The matured form of T4-28 (intelligence engine). Not a standalone build —
this is the intelligence module growing in sophistication as real customer
and drop data accumulates. Adds: deterministic demand scoring across Home
and Drop Studio, customer clustering by outward postcode with recency and
frequency boosts, nearby host matching, plain-English recommendation cards
(maximum 3) each with Create drop CTA. Shows "Signals are building" if
insufficient data. The foundation (archetype-aware analysis, capacity and
rhythm signals) is already built inside T4-28 — this ticket extends it
with geographic intelligence and predictive scoring.

Dependency: T4-28 (intelligence engine), meaningful customer data from
real drops.

Note (from T4-30 audit, Issue 2): Intelligence engine should incorporate
data_posture into recommendation generation — data-rich vendors should
receive import-first recommendations; data-light vendors should receive
drop-first or host-first recommendations.

T5-11: Comms engine V1
Event-driven email and SMS. Triggers: drop_published, order_confirmed,
order_ready, drop_closing_soon, drop_completed. Maximum 2 messages per
customer per drop. Stack: Postmark for email, Twilio for SMS, Supabase
Edge Functions. Dependency: T3-9 and T5-6.

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

Strategic framing: the goal of this layer is to make the compounding
asset tangible. Every drop adds to something. This surface shows what
has been built, where it is strongest, and what it is worth — in plain
language a vendor can act on.

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

T5-22: Catering business flow
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

### Tier 5-A — Auth workstream

Must complete before any real vendor enters live data. The current
`?vendor=<slug>` URL param model is fine for dev and demos but is not
a security boundary — any operator can load any vendor's workspace by
guessing a slug. Auth replaces URL-based vendor resolution with
session-based identity, and RLS moves from frontend filtering to
server-side enforcement.

T5-A1: Enable Supabase Auth — magic link / passwordless email
Turn on Supabase Auth with email magic-link sign-in. Configure the
email template to match Hearth's voice. No passwords.

T5-A2: Link vendors to auth users
Add `auth_user_id uuid` to the vendors table with a foreign key to
`auth.users(id)`. A vendor row becomes a workspace owned by exactly
one authenticated user. Provisioning flow (T5-A6) populates this.

T5-A3: RLS rewrite — server-side vendor scoping
Every vendor-scoped table and view (`drops`, `products`, `bundles`,
`categories`, `orders`, `customer_relationships`, `v_drop_summary`,
`v_hearth_drop_stats`, `v_item_sales`, `v_host_performance`, etc.)
gets RLS policies filtering on `vendor_id IN (SELECT id FROM vendors
WHERE auth_user_id = auth.uid())`. Frontend no longer needs to pass
vendor_id as a filter for correctness — the server enforces it.
Frontend filters stay for clarity but become belt-and-braces rather
than the only defence.

T5-A4: Login page
New static page `login.html` for returning vendors only — not signup.
Email input, magic-link request, and a clear "check your inbox" state.
Magic link lands back on `home.html`. New vendors arrive via
`signup.html` (T5-A10), not this page.

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
Before the platform scales to multiple vendors, upgrade from magic link
to email OTP (6-digit code entered on login page rather than a
clickable link) and make 2FA available as an optional vendor setting.
Primarily a Supabase configuration change with minor login.html updates.
Build when vendor count warrants it.

T5-A9: landing.html — public marketing page
Unauthenticated. No vendor-nav.js. Two CTAs: "Get started" (routes to
signup.html) and "Sign in" (routes to login.html). Explains what Hearth
is, who it's for, and why it's different. Root URL destination for anyone
arriving at the platform cold.

T5-A10: signup.html — new vendor email capture
Standalone page. No vendor-nav.js. Email input triggers Supabase magic
link. On click, routes to auth-callback.html which detects no existing
vendor row and redirects to onboarding.html. Separate from login.html —
different copy, different intent.

T5-A11: auth-callback.html — post-magic-link routing
Supabase lands here after magic link click. Reads session, queries
vendors table for a row matching auth_user_id. If no row found: new
vendor — redirect to onboarding.html. If row found and
onboarding_completed is false: redirect to onboarding.html. If row
found and onboarding_completed is true: redirect to intended URL
(from ?redirect= param if present) or home.html.

### Tier 5-B — Platform improvements

Smaller cleanups and onboarding enrichments that don't gate anything
but pay down friction and tech debt.

T5-B1: Extract `resolveVendor()` into a shared module ✓ COMPLETE
`assets/hearth-vendor.js` created as a shared module exposing
`window.HearthVendor.resolveVendor(_sb)`. All 12 operator pages
(index.html, drop-manager.html, drop-menu.html, brand-hearth.html,
insights.html, customers.html, customer-import.html, onboarding.html,
home.html, hosts.html, host-profile.html, scorecard.html) updated to
load the module after config.js and before vendor-nav.js, with their
inline `resolveVendor()` bodies deleted and call sites rewritten to
`await window.HearthVendor.resolveVendor(sb)` (or `supabase` / `_sb`
depending on the page's local variable). T5-A5 has since landed —
the module now uses session-aware resolution on production and
`?vendor=<slug>` dev override on localhost only.

T5-B2: Onboarding — capture social handles
Add a socials question to the onboarding flow (Q10 or similar)
capturing Instagram, Facebook, TikTok, and WhatsApp Business handles.
Writes to `vendors.social_handles` (jsonb) in the shape
`{"instagram": "handle", "facebook": "handle", "tiktok": "handle",
"whatsapp": "+44..."}`. Optional — skippable. Populated handles
flow through to Brand Hearth (T5-B4) and are visible to customers
on order.html as a footer treatment.

T5-B3: Onboarding — capture vendor address
Add an address question to the onboarding flow capturing the
vendor's primary physical address as a single free-text field
(house/street, town/city, postcode). Writes to `vendors.address`
(text). Used downstream by demand targeting (T4-17) as an implicit
centre for neighbourhood drops when no explicit centre postcode is
set, and surfaced in Brand Hearth.

T5-B4: Brand Hearth — edit social handles and address
Brand Hearth's Brand Identity section currently shows business name,
phone, website, and tagline. Extend it to display and edit the
address captured in T5-B3 and the social handles captured in T5-B2,
alongside the existing website URL field. Save pattern mirrors the
existing vendors-table upserts on that page.

## Recommended next session order

All Tier 1 and Tier 2 items are complete. T3-1 is also complete.

1.  T3-2  — Drop Studio saveAssignments defensive pattern ✓ COMPLETE
3.  T3-3  — Menu Library saveSortOrderBatch performance ✓ COMPLETE
4.  T3-4  — Insights Supabase chaining pattern ✓ COMPLETE
5.  T3-5  — Drop Studio unsaved changes warning ✓ COMPLETE
6.  T3-6  — Service Board confirmation on status changes ✓ COMPLETE
7.  T3-7  — Order page real-time capacity update
8.  T3-8  — Stripe integration
9.  T3-9  — Order page customer data capture and consent ✓ COMPLETE
10. T3-10 — Order ready notification
11. T3-11 — Menu Library delivery and collection suitability flags
12. T3-12 — Order page neighbourhood radius enforcement
12. T4-1  — Recurring series drop generation ✓ COMPLETE
13. T4-2  — Order confirmation page ✓ COMPLETE
14. T4-3  — Insights drop performance and intelligence layer ✓ COMPLETE
15. T4-5  — Drop Studio duplicate drop improvement ✓ COMPLETE
16. T4-6  — Menu Library delete with safety check ✓ COMPLETE
17. T4-7  — Service Board order notes and fulfilment details ✓ COMPLETE
18. T4-8  — Order form enhancements ✓ COMPLETE
19. T4-18 — Brand Hearth add contact phone field ✓ COMPLETE
20. T4-22 — Navigation consistency sweep ✓ COMPLETE
21. T4-14 — Vendor customer data import ✓ COMPLETE
22. T4-28 — Intelligence engine — extract to shared module ✓ COMPLETE
23. T4-27 — Customers page — first-class customer asset view ✓ COMPLETE
24. T4-4  — Home dashboard intelligence surface and next action centre ✓ COMPLETE
25. T4-30 — Onboarding delivery model audit
26. T4-29 — Series intelligence in Insights
27. T4-12 — Post-drop scorecard ✓ COMPLETE
28. T4-13 — Minimal host-facing view ✓ COMPLETE
29. T4-15 — Multiple drops within a single event
30. T4-16 ✓ — Host onboarding as first-class entity
31. T4-17 ✓ — Drop Studio audience targeting and demand preview
    Audience Preview panel added to Basics stage of Drop Studio.
    Triggers on centre postcode blur or host selection change. Shows
    customer count in postcode area, area drop history, host-specific
    drop history (count and avg orders), and a confidence signal
    (Strong / Building / New territory). Signal factors in both area
    and host drop history. Host suggestion hint removed — not
    appropriate for the Hearth model. Panel is context-aware by drop
    type: hosted/community drops lead with host history and suppress
    postcode customer count; neighbourhood drops lead with area
    signals. Host-customer relationship intel (customers acquired via
    a specific host) deferred to T4-16 when host becomes a first-class
    entity.
34. T4-21 ✓ — Customer import post-import demand view
35. T4-23 ✓ — Drop Studio first drop guidance for new vendors
36. T4-16 ✓ — Host as first-class entity
    hosts.html (Host Directory), host-profile.html (Host Profile),
    drop-manager.html (enriched host picker), vendor-nav.js (Hosts in nav).
37. T4-24 ✓ — Customer privacy policy
38. T4-25 ✓ — Vendor terms of participation
39. T4-26 ✓ — Host participation terms

Parallel workstream — schedule before any real vendor goes live:
T5-A1 → T5-A7 (Auth) must be done before Healthy Habits Cafe (or
any real vendor) starts capturing live data. Vendor isolation is
enforced by frontend filtering today; auth moves that enforcement
server-side and closes the URL-param impersonation path.

Also on deck (low effort, high value):
T5-B1 ✓ — extract resolveVendor() into shared module (complete —
`assets/hearth-vendor.js`, 12 operator pages consuming it)
T5-B2 / T5-B3 — onboarding capture for social handles and address
(schema columns already exist; just need the UI)
T5-B4 — surface social handles and address in Brand Hearth
