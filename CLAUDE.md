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
- home.html — Platform home dashboard
- order.html — Customer-facing ordering page
- order-entry.html — Dev tool for test order entry (legacy, needs rebuild)
- assets/hearth.css — shared platform stylesheet
- assets/config.js — Supabase config
- assets/vendors/southbury-farm-pizza/ — vendor image assets

## Database — key tables

- vendors — vendor identity and brand settings
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
- hosts — community hosts (clubs, schools, venues)
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

T3-2: Drop Studio — saveAssignments defensive pattern ✓ COMPLETE
Replace destructive delete-then-insert with safer upsert pattern.
Upsert split into two calls — products use onConflict:'drop_id,product_id',
bundles use onConflict:'drop_id,bundle_id' — matching the two separate
unique constraints on drop_menu_items.

T3-3: Menu Library — saveSortOrderBatch performance ✓ COMPLETE
Replace sequential per-row updates with single upsert array call.

T3-4: Insights — fix Supabase chaining pattern ✓ COMPLETE
Audit and fix all Supabase query chains to use proper async/await try/catch.

T3-5: Drop Studio — unsaved changes warning
Add beforeunload guard when operator navigates away with unsaved changes.

T3-6: Service Board — confirmation on status changes
Add brief confirmation or undo window for status transitions to prevent
misclicks during busy service.

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

### Tier 4 — Enhancements that will impress

T4-1: Recurring series — actually create drops
Drop Studio has full recurring series UI but no generation function.
Build createSeriesDrops() — critical for vendors running weekly drops.

T4-2: Order confirmation page ✓ COMPLETE
Post-order destination showing order details, reference number, and
fulfilment information. order-confirmation.html created; order.html
redirects to it after successful insert.

T4-3: Insights — drop performance and growing business narrative

Insights answers two questions that matter to a vendor building with
Hearth:

**Layer 1 — How did my drop perform?**
Fill rate vs capacity, revenue, order count, fastest-selling items,
fulfilment mode breakdown, capacity timing curve (when did orders arrive
across the window).

**Layer 2 — How is Hearth growing my business?**
Customer growth over time, repeat rate trend, new vs returning customers
per drop, geographic spread of customer base, host performance (which
hosts drive the most demand and repeat participation), revenue trend
across drops.

**Narrative intelligence:**
Each section should include a plain-English observation in Hearth's
voice — not a generic insight, but something grounded in the vendor's
actual data. "Your Friday drops fill faster than Saturdays. Consider
opening orders earlier." "3 of your last 5 drops sold out. You may have
room to increase capacity." Language must be calm, supportive, and
non-judgmental — consistent with the Insights vocabulary: Signals,
Momentum, What's working.

Fix demand curve chart (buckets by hour not datetime). Complete all seven
sections. Ensure all views referenced are live in Supabase before
building.

Dependencies: real drop data, T3-9 (customer capture — complete)

T4-4: Home dashboard — intelligence surface and next action centre

The Home dashboard is where the Hearth model becomes visible to the
vendor. It is not a workspace landing page. It is the place where a
vendor understands what they have built, what is working, and what to
do next.

Two distinct states based on onboarding pathway and drop history:

**Pre-first-drop state** (vendor has completed onboarding but not yet
run a drop):
- If `data_posture = rich`: primary action is "Import your customers"
  (T4-14), with supporting context explaining that Hearth will use their
  existing audience to identify where demand is strongest
- If `data_posture = light`: primary action is "Create your first drop",
  with a suggestion to start with an existing host relationship if
  `existing_host_contexts` is populated
- Setup completion status card — shows which of Brand Hearth, Menu
  Library, and Drop Studio are ready
- Onboarding summary — reflects back what the vendor told us about
  themselves and their operating model

**Active state** (vendor has run at least one drop):
- Audience card: total known customers, new customers this month, repeat
  rate. Framed as "your audience" not "your data"
- Demand signal card: strongest postcode clusters from customer geography.
  Feeds directly from recommendation engine (T5-9)
- Next recommended drop card: plain-English recommendation with a "Create
  this drop" CTA pre-populated in Drop Studio. Shows "Signals are
  building" if insufficient data
- Recent drop performance: last completed drop — fill rate, revenue, new
  customers added. One plain-English observation
- Host and community summary: active hosts, last activation date, next
  opportunity
- Quick actions: Create drop, Import customers, View insights

The dashboard must feel calm and considered — never busy, never
dashboard-for-dashboard's-sake. Every element earns its place by
pointing to a real action or surfacing a genuine signal.

Dependencies: T4-14 (customer import), T4-16 (hosts as first-class
entities), T5-9 (recommendation engine V1)

T4-5: Drop Studio — duplicate drop improvement ✓ COMPLETE
Timing fields (opens_at, closes_at, delivery_start, delivery_end) set to
null on duplicate. Form opens on timing pane with persistent notice and
highlighted date/time fields.

T4-6: Menu Library — delete products, bundles, categories
Add permanent delete with safety check — warn if item is used in any
drop menu before allowing deletion.

T4-7: Service Board — order notes and fulfilment details ✓ COMPLETE
Surface customer notes, delivery address, and fulfilment mode on order
cards. Essential for delivery drops.

T4-8: Order form enhancements ✓ COMPLETE
Address fields (line 1, line 2, town/city, postcode), phone number validation,
marketing opt-in checkbox. Written to delivery_address and customer_postcode
on orders table.

T4-12: Post-drop scorecard — making the compounding asset visible

When a drop closes, the Home dashboard surfaces a scorecard that frames
the drop not just as a revenue event but as a moment that grew the
vendor's audience.

Content: orders placed, revenue, fill rate, fastest-selling item, new
customers added tonight, customers who have ordered before. One
plain-English observation in Hearth's voice.

Framing example: "Tonight you served 23 customers. 18 are new to your
audience. 4 have ordered from you before — your repeat rate is growing."

This is the moment a vendor first sees that Hearth is building something
for them beyond a single service. The language must make the compounding
effect tangible without overstating it.

Dependency: T3-9 (customer capture — complete)

T4-13: Minimal host-facing view
Read-only page via drop shareable link. Content: drop name, date, time,
live order count via Realtime, capacity fill bar, revenue share calculated
in real time. No login. Display only.

T4-14: Vendor customer data import
Allow vendors to upload existing customer list via CSV (name, email,
postcode). Confirm lawful basis before import. Write to customers and
customer_relationships with source = import. Accelerates recommendation
engine for data-rich vendors. Dependency: T3-9 schema.

T4-15: Multiple drops within a single event
Allow vendor to create multiple drops linked to the same host context with
different time windows — e.g. food truck running 12–2pm and 6–8pm at same
event. Drop Studio to offer "Create another window" option when drop is
host-linked, pre-populating vendor, host, and menu. Capacity and ordering
windows remain separate per drop.

T4-16: Host onboarding — host as first-class entity
Expand hosts beyond contextual drop attachment. Hosts need: full profile
with type, location, audience size, communication channels, service windows
they want to fill, revenue share willingness, performance history. Simple
host management page accessible from Drop Studio. Foundation for T5-4
and T5-9. hosts table must include a host_type field (pub, school,
sports_club, gym, office, neighbourhood, event_space, other) and a
has_community boolean flag indicating whether this host also has a
targetable audience beyond the physical event.

T4-17: Drop Studio — audience targeting and demand preview
When creating a drop, surface: known customers in target area, estimated
demand range from historical data, suggested host if one exists nearby.
Pre-drop confidence indicator. Dependency: T3-9.

Priority note: should be built immediately after T4-14 (customer import)
and T5-9 (recommendation engine V1) are complete. This is the moment
Drop Studio becomes visibly intelligent — a vendor creating a drop sees
how many known customers are in the target area before they commit.
Strategically important, not just a nice-to-have.

T4-18: Brand Hearth — add contact phone field
Brand Hearth currently does not expose `contact_phone` as an editable
field, even though the column was added to the vendors table during
onboarding (T5-13). Add a phone number input to the Brand Identity
section of Brand Hearth, between the display name and tagline fields.
Saves to `vendors.contact_phone`. Pre-populates from saved value on
load. No schema change required.

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

T4-22: Navigation consistency sweep
Audit all operator pages to confirm "Setup" appears in the nav
consistently and links to `onboarding.html`. Pages to check:
`home.html`, `brand-hearth.html`, `drop-menu.html`, `drop-manager.html`,
`index.html` (Service Board), `insights.html`, `order-confirmation.html`.
Nav order must be consistent across all pages: Home, Brand Hearth, Menu
Library, Drop Studio, Service Board, Insights, Setup. Note: Setup should
not appear on `order.html` as that is a customer-facing page.

T4-23: Drop Studio — first drop guidance for new vendors
When a vendor opens Drop Studio for the first time (no existing drops),
surface a quiet guidance state above the drop list: "Ready to create
your first drop? Start with a host you know — it's the fastest way to
fill capacity and build your audience." If the vendor flagged existing
host relationships in onboarding, reference that context: "You mentioned
you already work with a pub or venue — add them as a host and create
your first drop together." Links to the host creation flow and new drop
creation. Disappears once the vendor has at least one drop.

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

T5-9: Recommendation engine V1
Deterministic demand scoring on Home and Drop Studio. Cluster customers by
outward postcode, score by count plus recency and frequency boosts, check
for nearby hosts, generate plain-English recommendation cards (maximum 3)
each with Create drop CTA. Show "Signals are building" if insufficient
data. Dependency: meaningful customer data from real drops.

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
Major evolution beyond drop performance. Add: customer growth, repeat rate
trend, postcode cluster analysis, strongest areas, host performance, vendor
vs host sourced demand, recommended next actions. Dependency: T3-9, T4-16.

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

## Recommended next session order

All Tier 1 and Tier 2 items are complete. T3-1 is also complete.

1.  T3-2  — Drop Studio saveAssignments defensive pattern ✓ COMPLETE
3.  T3-3  — Menu Library saveSortOrderBatch performance ✓ COMPLETE
4.  T3-4  — Insights Supabase chaining pattern ✓ COMPLETE
5.  T3-5  — Drop Studio unsaved changes warning
6.  T3-6  — Service Board confirmation on status changes
7.  T3-7  — Order page real-time capacity update
8.  T3-8  — Stripe integration
9.  T3-9  — Order page customer data capture and consent ✓ COMPLETE
10. T3-10 — Order ready notification
11. T3-11 — Menu Library delivery and collection suitability flags
12. T4-1  — Recurring series drop generation
13. T4-2  — Order confirmation page ✓ COMPLETE
14. T4-3  — Insights drop performance and growing business narrative
15. T4-4  — Home dashboard intelligence surface and next action centre
16. T4-5  — Drop Studio duplicate drop improvement ✓ COMPLETE
17. T4-6  — Menu Library delete with safety check
18. T4-7  — Service Board order notes and fulfilment details ✓ COMPLETE
19. T4-8  — Order form enhancements ✓ COMPLETE
20. T4-12 — Post-drop scorecard
21. T4-13 — Minimal host-facing view
22. T4-14 — Vendor customer data import
23. T4-15 — Multiple drops within a single event
24. T4-16 — Host onboarding as first-class entity
25. T4-17 — Drop Studio audience targeting and demand preview
26. T4-18 — Brand Hearth add contact phone field
27. T4-19 — Onboarding to Brand Hearth continuity
28. T4-20 — Onboarding to first drop pathway
29. T4-21 — Customer import post-import demand view
30. T4-22 — Navigation consistency sweep
31. T4-23 — Drop Studio first drop guidance for new vendors
