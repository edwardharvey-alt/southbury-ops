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

T1-4: Order page — hero image white strip ✓ COMPLETE
Confirmed complete. Visual verification by Edward — hero image fills
correctly with no white strip. CSS min-height and background-size:cover
working as intended.
Hero image not filling top section, leaving white strip at bottom of
image area. CSS background-size or min-height fix required.

### Tier 2 — Must work before showing anyone

T2-1: Global navigation — add all pages to every header
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

T3-8: Stripe integration — DEFERRED
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

T4-30: Onboarding delivery model audit ✓ COMPLETE
Audited and confirmed. detectArchetype() in hearth-intelligence.js
flags aggregator vendors when primary_goal includes reduce_aggregators
or delivery_model is aggregator. generateRecommendations() has a
dedicated archetype-aware block for this condition pushing a
recommendation about building direct customer relationships independent
of aggregator platforms. The aggregator reduction pathway is prominent
in onboarding Q3 and Q5.

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

T4-33: Brand Hearth — vendor copy generation and customisation review

Two parts:

**Part 1 — GenAI brand copy generation**

The blank page problem is real for food vendors who aren't confident writers. After onboarding completes, Brand Hearth offers to generate a first-draft tagline and about paragraph. The vendor triggers generation on demand via a "Generate a starting point →" prompt — never automatic, always opt-in. The API call passes structured onboarding data: business name, operating model, primary goal, existing host contexts, customer data posture, food category (inferred from brand and product data where available), and social handles if set. Haiku 4.5 generates a tagline and 2–3 sentence about paragraph in Hearth's warm, local, artisan tone. Vendor reviews and edits inline before saving. Frame explicitly as a starting point, not a finished output. Client-side, same pattern as T5-25.

Key constraint: the model must never generate claims about specific locations, specific products, or specific customers — those must come from vendor input. The generation scope is tone and framing only. See GenAI shared principles for hard rules.

**Part 2 — Customisation review**

Conduct a structured review of Brand Hearth to identify what additional brand controls would meaningfully change how vendor-owned the experience feels. Current state is minimal: hero image, display name, tagline, colour picker. Assess whether vendors currently feel proud showing their brand to customers. Candidates: font choices, accent colour application across more UI elements, secondary brand image, richer about copy, social handle display. Goal is not feature bloat — identify what is missing before deciding what to build. Run as a focused design review before any build work.

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

T4-37: Drop Studio inline host creation — capture terms acceptance
The inline "+ New Host" modal in `drop-manager.html`
(`createHostInline` around line 4464) calls `create-host` without
`terms_accepted` or `terms_accepted_at`. Hosts created via this path
land in the database with `terms_accepted: false` (confirmed on Test
11 vendor — Mini Balls and Medium Balls both have
`terms_accepted: false`). The `hosts.html` Add Host flow already
captures terms; this is the only remaining path that bypasses it.
Build needs: (a) UX decision on where the terms checkbox lives in
the inline modal (the inline flow is intentionally minimal —
name/type/postcode only — to keep drop creation fast), (b) payload
update to send `terms_accepted: true` and
`terms_accepted_at: new Date().toISOString()`. Once both paths
capture terms, `terms_accepted` can be made required in
`create-host` (currently optional for backwards compatibility — see
the comment in `supabase/functions/create-host/index.ts`).

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

### GenAI use cases — shared principles

Five confirmed GenAI use cases are planned across the platform. All follow the same architectural pattern and must observe the hard rules below.

**The five use cases**

| Entry | Use case | When it fires | Where | Model |
|---|---|---|---|---|
| T4-33 | Brand copy generation | Post-onboarding, on demand | Client-side | Haiku 4.5 |
| T5-9 | Recommendation copy | Nightly pre-compute | Edge Function / Batch API | Haiku 4.5 |
| T5-11 | Email body copy | Event-triggered | Edge Function | Haiku 4.5 |
| T5-25 | Social copy generator | On demand, drop published | Client-side | Haiku 4.5 |
| T5-26 | Host introduction copy | On demand, vendor-triggered | Client-side | Haiku 4.5 |

Haiku 4.5 is the default for all five. Sonnet 4.6 is only worth considering if copy quality is demonstrably flat after real vendor testing. Opus is not appropriate for any of these use cases.

**Hard rules — apply to every GenAI call across the platform**

- SQL and structured data own the facts. Prices, times, order counts, fill rates, references, and postcodes are always passed as structured data and rendered deterministically. They are never left to the model to recall, infer, or generate. A model hallucinating an order total or a wrong collection time inside copy is a trust-destroying failure.
- LLM owns the framing only. The model's job is to turn structured signal data into plain-English copy that matches vendor voice and Hearth tone. Nothing more.
- System prompts explaining Hearth's vocabulary, tone, and the vendor's archetype are fixed per call type and should be prompt-cached. Variable signal data goes in the user message. This reduces cost and latency on every subsequent call.
- Client-side calls (T4-33, T5-25, T5-26) use the existing Anthropic API pattern established in the platform. The API key is handled by the infrastructure — do not expose it in client code.
- Server-side calls (T5-9, T5-11) run inside Supabase Edge Functions. The Anthropic API key lives in Supabase secrets alongside STRIPE_SECRET_KEY and Postmark credentials.
- Batch API should be used for T5-9 nightly pre-computation. 50% cost reduction, no quality tradeoff, latency is irrelevant for overnight jobs.
- Never use GenAI to make capacity, pricing, or fulfilment decisions. Copy generation only.

**Cost framing**

At current Haiku 4.5 pricing ($1/$5 per million input/output tokens), a typical recommendation or copy call costs under $0.000005. Even at 1,000 active vendors running multiple sessions daily, API cost is not a meaningful constraint. Architectural decisions should be driven by copy quality, latency, and maintainability — not cost optimisation.

T5-9: Recommendation engine — matured intelligence

The matured form of T4-28 (intelligence engine). Extends hearth-intelligence.js with geographic demand scoring, host intelligence, and cross-category affinity matching, surfacing proactive recommendations directly inside Drop Studio and Home — not just in Insights after the fact.

**Architecture decisions (locked before build)**

Three decisions must be confirmed at the start of the T5-9 build session rather than left open:

(1) Postcode → coordinates via postcodes.io enrichment at write time. When a customer or vendor address is saved, call postcodes.io to retrieve lat/lng and write coordinates back to the relevant row. Enables proper proximity queries without full PostGIS adoption. PostGIS remains an option if spatial query volume warrants it later — postcodes.io is the pragmatic first step.

(2) Nightly materialisation via Edge Function cron. Demand scores, host performance summaries, and postcode cluster rankings are pre-computed and written to dedicated tables overnight. Intelligence surfaces read pre-computed rows — they do not scan raw order and customer data on page load. This is the correct architecture from the start; retrofitting materialisation onto a live-compute model is expensive.

(3) SQL owns signals, LLM owns framing. The SQL layer computes scores, gaps, fill rates, and trends. Those structured outputs are passed to Haiku 4.5 via the Anthropic API to generate the plain-English recommendation card copy. See GenAI shared principles above for hard rules.

**Geographic demand scoring**

Customer clustering by outward postcode with recency and frequency weighting. Identifies the vendor's strongest demand areas from customer_relationships and order history. Output: ranked list of postcode areas with customer count, order history, and a confidence score (Strong / Building / New territory).

Drop Studio integration: Basics pane Audience Preview panel (T4-17) extended to show a plain-English recommendation — "Your strongest area is BH18 with 34 customers. Your last two drops there averaged 28 orders. Consider placing your next drop here." Recommendation fires when no host is selected and customer data exists.

Home dashboard integration: replaces the current generic next-action cards with demand-scored recommendations. Maximum 3 cards. Each card names the specific area, customer count, and a Create drop CTA pre-seeded with the postcode. Shows "Signals are building — run more drops to unlock recommendations" when data is insufficient.

data_posture awareness: data-rich vendors receive import-first and demand-targeting recommendations. Data-light vendors receive host-first or drop-first recommendations. This distinction must be explicit in the recommendation body copy.

**Host intelligence layer**

(1) Repeat host cadence recommendations. When a vendor has run 2+ drops at the same host, the engine analyses the gap between them and the fill rate trend. If drops at that host are filling well and the gap is longer than 14 days, the recommendation engine surfaces a cadence nudge: "Your last 3 drops at The Bell have averaged 87% capacity. You're running there monthly — could you explore fortnightly?" Cadence suggestion is context-aware: recurring event hosts (pub, sports club, workplace) get frequency nudges; one-off or event-type hosts (charity fundraiser, school fair) are excluded. Host type from the host_type field on the hosts table drives this distinction. Also surfaces multiple-window suggestions for eligible hosts.

(2) Same-type geographic host discovery. When a vendor has a successful host relationship (2+ drops, avg fill rate ≥ 70%), the engine recommends exploring similar host types in the same or adjacent postcode areas. Uses the vendor's existing host postcodes and the hosts table to identify host_type matches. Surfaces as a plain-English recommendation card with a "Draft introduction" CTA linking to T5-26. In V1 this uses host records already in the platform. V2 scope (do not build now): integrate with Google Places API to surface named nearby venues not yet in the platform.

(3) Cross-category affinity matching. Extends host discovery beyond same-type matching to audience alignment. A vendor's food category and positioning is matched against audience_description and audience_tags on the hosts table. Example: a healthy food vendor surfaces gym, sports club, and workplace wellness hosts as strong candidates even if those host types differ from the vendor's existing relationships. LLM-assisted matching is the mechanism — structured vendor and host profile data passed to Haiku 4.5, affinity scored and explained in plain English. Surfaced as a distinct recommendation card from same-type geographic discovery, with its own "Draft introduction" CTA linking to T5-26.

Dependency: T4-28 (intelligence engine — complete), meaningful customer and order data from real drops. Do not build geographic scoring on synthetic test data — wait for Healthy Habits Cafe to run at least 2 drops before evaluating signal quality.

T5-11: Comms engine V1

Event-driven transactional and demand generation messaging triggered by order and drop lifecycle events. Built on Supabase Edge Functions calling Postmark for email. SMS via Twilio deferred to V2 — focus V1 on getting email right.

**GenAI integration**

Email body copy is generated via the Anthropic API (Haiku 4.5) inside the Edge Function at send time, not from static string literal templates. Each trigger passes structured event data (order reference, drop name, timing, vendor name, host name where present, fulfilment mode) plus the vendor's brand voice settings from Brand Hearth to the API. The model generates the connecting prose and the framing of the message in the vendor's voice. Subject lines, CTAs, order references, times, and prices are deterministic — templated and rendered separately, never generated. See GenAI shared principles for hard rules.

The Anthropic API key lives in Supabase secrets alongside STRIPE_SECRET_KEY and the Postmark credentials. The Edge Function pattern is the same as invite-vendor and create-stripe-connect-link.

**Transactional triggers (V1 scope — email only)**

order_confirmed: fires immediately after order insert in order.html. Sends to customer email if present. Contains order reference, items ordered, fulfilment mode, collection point or delivery address, drop timing. Vendor-branded with display_name and brand_primary_color.

order_ready: fires when Service Board operator marks order as Ready (the same event that currently opens the T3-10 notification modal). Sends to customer if email present. Supplements rather than replaces the manual modal — operator still sees the modal, email sends automatically in parallel.

drop_closing_soon: fires 2 hours before closes_at for any live drop with orders placed. Sends to consented customers (contact_opt_in true) who have not yet ordered this drop. Maximum one per customer per drop.

**Proactive demand generation triggers (V1 scope — email only)**

drop_announced: fires when a drop status changes to scheduled or live. Sends to all consented customers who have previously ordered from this vendor OR who have previously ordered at this host (if the drop has a host). Maximum one drop_announced message per customer per drop.

drop_reminder: fires 24 hours before closes_at for drops with remaining capacity. Sends only to consented customers who have NOT yet placed an order for this drop. Maximum one drop_reminder per customer per drop.

**Hard rules**

Maximum 2 automated messages per customer per drop across all non-transactional triggers combined (drop_announced + drop_reminder). Transactional messages (order_confirmed, order_ready) do not count toward this limit. Only send demand generation messages to customers where contact_opt_in is true on at least one previous order from this vendor. consent_status on customer_relationships must be 'granted' or 'imported'. Vendor-sourced imported customers (T4-14) are eligible if lawful_basis was declared at import. Host-audience targeting requires explicit host consent chain — flagged for T5-18, do not implement cross-vendor host targeting in V1. All sends logged to a new comms_log table (customer_id, drop_id, trigger, sent_at, channel, status) — design channel-agnostic from the start so SMS can be added without schema changes.

Infrastructure required before building: T6-1 (domain — lovehearth.co.uk must be live for sender addresses), T6-6 (Postmark configured with SPF/DKIM/DMARC).

Dependency: T3-9 (customer capture — complete), T6-1, T6-6.

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

T5-25: Drop promotion — marketing copy and print assets
Vendors currently have no way to promote a drop beyond sharing the order
link manually. This ticket adds a lightweight promotion tool that generates
ready-to-use marketing assets directly from drop data — removing the blank
page problem and making every drop feel professionally promoted.

Two output types:

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

T5-B18: Stripe status visibility surface. No UI path to inspect,
manage, or re-enter Stripe Connect onboarding from any vendor page.
Vendor cannot self-serve "am I set up to get paid" status; operator
(Edward) cannot diagnose vendor payment readiness without SQL.
Surfaced when checking Test 11's Stripe state during Test 12 fixture
setup. Likely belongs in a future Stripe-surface workstream of its
own (no existing priority covers full lifecycle). Not blocking PR 4b.

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
production-state ticket.

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

T5-B26: admin.html — ADMIN_UID hardcoded in two places
ADMIN_UID is duplicated in admin.html and
supabase/functions/invite-vendor/index.ts. Should be moved to a single
source of truth — options include an environment variable, a config
table, or an admins table with RLS. Low priority cleanup.

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

T5-B32: Duplicate anon SELECT policies on products.
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
BACKLOG.md. CLAUDE.md's Tier 5-B index lists T5-B29 (multi-window
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
flags. Surfaced during the 2 May 2026 T5-B16 product batch (PR
following #209). When a product is duplicated via Duplicate in the
product editor, the constructed payload omits `travels_well`,
`suitable_for_collection`, and `prep_complexity`. The original
product carries those flags but the duplicate is created without
them, so the copy silently loses suitability metadata that the
operator just spent time configuring on the source. Fix is a
one-liner — add the three fields to the `fields` object in
`duplicateCurrentProduct` (drop-menu.html, near line 2390) sourced
from the original `product`. Held back from the T5-B16 product
batch PR to keep that PR scoped to the Edge Function migration
only. Bounded one-session piece of work.

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
orders. Two policies on the `orders` table need removing:
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

T6-3: Staging environment
Set up a second Netlify site deployed from a separate branch (e.g.
"staging"), pointing at a separate Supabase staging project. Accessible
at a URL like staging.lovehearth.co.uk. All changes flow: local → staging
branch → verified on staging URL → merged to main → deployed to
production. Requires: branch created, Netlify site configured against it,
Supabase staging project, DNS record for staging subdomain, separate
environment variables in Netlify for staging vs production, documented
promotion workflow.

T6-4: Branch protection and PR review workflow
GitHub branch protection rules on main: require pull requests, require
at least one review before merge, require status checks to pass.
Claude Code workflow must change — it can no longer commit directly
to main. It commits to feature branches, opens PRs, and Ed reviews and
merges. Catches the category of Claude Code mistakes where the commit
does the wrong thing subtly. Slower per-change, but appropriate once
real vendors are on the platform. Needs to be agreed in a session with
CLAUDE.md updated so the new workflow is written down.

T6-5: Supabase backup strategy
The production Supabase project needs point-in-time recovery enabled,
which is a Pro-tier feature. Before real customer data lands, upgrade
to Supabase Pro and verify PITR is active. Without this, a bad SQL
migration or accidental data deletion has no recovery path beyond
whatever daily backup Supabase's free tier provides. Separate from
Netlify Pro (which is about bandwidth — also needed, flagged elsewhere).

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

T7-1: Platform health cockpit
Single-screen daily overview showing active vendors by state
(onboarded, active, paused, at risk), upcoming drops with fill rates,
last-24h orders and revenue across the platform, live drops in
progress, underfilled drops (below capacity threshold with closes_at
approaching), vendors without upcoming drops, and a recent events
timeline (new vendors, new hosts, drops created, drops closed).
Read-only. The first thing Ed opens each morning.

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

T7-13: Capacity driver concept and modelling
The platform currently models capacity via `capacity_category`
(text, now nullable post-PR-3) and `capacity_units_total`
(integer). This implicitly assumes capacity is menu-driven —
vendors think in terms of "I can make 40 pizzas." Real-world
capacity may also be order-driven ("I can handle 30 orders
regardless of items"), time-driven ("I can serve 10 customers
per 30-minute slot"), or hybrid. Review whether the data model
needs to express capacity as a typed driver (units / orders /
time-slots) rather than a free-text category. Surfaced during
PR 3 (`create-drop`) when the legacy `'pizza'` default was
removed and the broader question of how capacity should be
modelled became visible.

- With W-4 closed by orphan-text refusal in update-drop (PR 4b),
  the redundant capacity_category non-null check in
  transition-drop-status:71-74 becomes a candidate for removal.
  Slug field is provably non-null only when the FK is non-null
  after the guard lands. Removing the check is a one-line change
  but adds noise to PR 4b for no behavioural benefit. Defer to
  T7-13.

T7-14: Multi-admin access
Platform-level admin access is currently gated to a single hardcoded
UID. As the platform adds partners or staff, a proper admins table is
required: id, auth_user_id, name, role (owner/admin/support),
granted_at, granted_by. Admin pages query this table server-side via
supabase.auth.getUser() rather than comparing against a hardcoded UID.
Prerequisite for adding a business partner to the admin surface.
Unblocks T5-B25 and T5-B26. Build before any second person needs
admin access.

T7-15: Admin write capability — vendor and drop data amendment
T7-1 through T7-7 cover read-only oversight. A write surface is needed
for admin interventions: correcting vendor profile data, amending a
drop on a vendor's behalf, resetting onboarding state. Every write
action must route through T7-7 (audit log). Pattern: admin selects
vendor → read-only view → "Edit on behalf of vendor" → confirms →
audit log entry written → change applied via service-role Edge Function.
Dependency: T7-7.

T7-16: Business partner admin access
Specific instance of T7-14. Add business partner as platform admin
with owner-level access. Requires T7-14 admins table and Supabase
Auth invite. Do not build until T7-14 is in place — do not add their
UID to the hardcoded list as a temporary measure.

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

T9-2: Brand configuration AI
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

Recommended build sequence for Tier 9:
First: T9-6 (at-risk flagging) and T9-5 (promotion copy) —
immediate vendor value, fewest dependencies.
Second: T9-2 (brand AI) and T9-3 (host identification) —
demo-compelling, no deep drop history needed.
Third: T9-1, T9-4, T9-7, T9-8 — need real data to be credible,
build once Southbury Farm has meaningful drop history and Healthy
Habits is live.

