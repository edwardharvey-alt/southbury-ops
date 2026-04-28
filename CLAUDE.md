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

- index.html — public marketing landing page (served at the root of
  lovehearth.co.uk). Formerly landing.html; renamed on 2026-04-20 as
  part of the routing rewire so unauthenticated visitors hit the
  landing page at the root URL rather than a broken Service Board.
- service-board.html — Service Board (live operational view for active
  drops). Formerly index.html; renamed on 2026-04-20.
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

For the full schema reference (every table, every column, every
foreign key, plus views and known gotchas), see SCHEMA.md at the
repo root. Regenerate it when meaningful migrations land — the
regeneration query is at the top of that file.

- vendors — vendor identity and brand settings. Key columns include
  `slug`, `display_name`, `name`, `contact_phone`, `address` (text,
  physical address — added this session), `social_handles` (jsonb,
  default `{}`, shape `{"instagram": "handle", "tiktok": "handle", ...}`
  — added this session), `onboarding_completed` (boolean), and the
  onboarding answer columns (`primary_goal`, `delivery_model`,
  `pos_platform`, `pos_platform_other`, `customer_data_posture`,
  `existing_host_contexts`, etc.) populated by the onboarding flow.
  `terms_accepted` (boolean), `terms_accepted_at` (timestamptz) — added
  as part of T4-25. `stripe_account_id` (text, nullable) and
  `stripe_onboarding_complete` (boolean, NOT NULL DEFAULT false) — added
  as part of T3-8 Phase 1. Partial index
  `idx_vendors_stripe_account_id` WHERE `stripe_account_id IS NOT NULL`
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
  estimated_reach), `notes_internal` (text). Hosts are vendor-scoped
  — `vendor_id` is NOT NULL and the unique constraint is
  `(vendor_id, slug)`, so two vendors can each own a host with the
  same slug. `created_by_vendor_id` is retained for audit but new
  rows should set both. Drop history shown per vendor is filtered
  via v_drop_summary.
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

11. Backlog items get logged in the same commit as the PR that surfaced
    them. When an audit pass surfaces issues that are out of scope for
    the current PR, log them in CLAUDE.md's backlog section as part of
    the same commit as the PR's main changes. Do not defer to a
    follow-up commit. Rationale: keeps audit findings and backlog
    entries atomic, and `git blame` on the backlog entry lands on the
    PR that surfaced it.

12. Verification steps use the lowest-blast-radius surface that
    exercises the change. Prefer read-only or non-mutating surfaces
    over write paths, and prefer the same surface used in earlier
    verification steps (e.g. the curl smoke test) so the verification
    story is consistent. Only escalate to write-path surfaces if no
    read path exercises the code under test. Rationale: avoids
    mutating production data during routine PR verification.

13. Claude Code's environment has no Supabase CLI, no Stripe
    credentials, no preview deploy access. Manual verification on the
    developer's machine is the contract between Claude Code and the
    human. Each PR description spells out the manual verification
    checklist explicitly: CLI deploy commands, curl smoke tests with
    expected responses, in-browser verification steps, and SQL
    confirmations. Do not merge on TypeScript parse + transpile alone.

14. When an audit declares a hard prerequisite for a future PR, run a
    quick prerequisite investigation as the first step of that PR's
    build session. The audit framing may be stale by the time the
    build runs (PR 4a's T5-B12 prerequisite was wrong-premise — the
    actual question was different). The investigation is read-only,
    ~5–30 minutes, and locks in the build strategy before any code is
    written.

## Operational learnings

Gotchas and patterns captured from real bugs. Treat these as hard rules
on top of the coding rules above.

1. **Vendor isolation — `v_drop_summary` has no RLS safety net.** Any
   page that queries `v_drop_summary` as a list MUST filter with
   `.eq("vendor_id", state.vendorId)`. The view exposes every vendor's
   drops; the frontend is the only thing scoping them. `loadDrops()` in
   drop-manager.html and service-board.html were both missing this filter and
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

11. **Vendor provisioning links auth_user_id via the Edge Function, not
    set-password.html.** When admin.html creates a new vendor via
    admin.html and triggers the invite-vendor Edge Function, the function
    now reads the newly created user.id from inviteUserByEmail and
    immediately updates vendors.auth_user_id where email matches. If the
    link update fails, the function returns an error rather than silent
    success. This ensures set-password.html can always resolve the vendor
    via auth session. The alternative — deferring the link to
    set-password.html client-side — leaves a window where a vendor row
    has no owner and resolveVendor() cannot find it by auth_user_id.
    Server-side linking with the service role is the correct pattern.

12. **Inline `window.supabase.createClient(url, key)` calls produce
    clients that silently fail authenticated mutations.** The bare
    two-argument form does not reliably attach the persisted user
    session to subsequent requests. Mutations leave the browser with
    the anon publishable key as Bearer, RLS on the target table
    evaluates `auth.uid()` as null, the request matches zero rows, and
    PostgREST returns 204 No Content. The UI receives no error and
    displays success. Nothing is written. Always use
    `window._getHearthClient()` from `assets/config.js` — never
    instantiate a Supabase client inline on operator pages. A
    platform-wide audit identified one page (drop-manager.html) using
    the singleton and most other operator pages using inline
    createClient — the migration is staged: brand-hearth.html first as
    validation (this commit), other operator pages to follow.

13. **supabase-js version pinning experiment in progress.** As of this
    commit, brand-hearth.html is pinned to
    `@supabase/supabase-js@2.74.0`. All other pages remain on `@2`
    (currently resolving to 2.104.1). This is a deliberate A/B
    experiment to test whether 2.104.1 has a regression in user-JWT
    attachment when paired with the publishable-key format.
    Pre-experiment evidence: with 2.104.1, brand save silently fails —
    PATCH requests go out with `Authorization: Bearer sb_publishable_...`
    instead of the user session JWT, RLS rejects with 204 No Content,
    no rows update. The session is correctly stored in the client
    (verified via `getSession()`) but is not attached to outbound
    requests. If pinning to 2.74.0 restores correct auth-attachment
    behaviour on brand-hearth.html, a follow-up PR will pin all 24
    remaining pages. If pinning does not fix it, the version pin will
    be reverted and the investigation will move to manually setting
    the Authorization header via `global.headers` and
    `onAuthStateChange`.

14. **Manual Authorization header attachment in the Supabase singleton.**
    The supabase-js library does not reliably attach the user session
    JWT to outbound PostgREST requests when the apikey is in the new
    publishable-key format (`sb_publishable_...`). Without manual
    intervention, authenticated mutations silently fail with HTTP 204 /
    zero rows changed. The singleton in `assets/config.js` now manually
    attaches the Authorization header by writing to
    `client.rest.headers["Authorization"]` and keeps it in sync via
    `onAuthStateChange`. This is documented in Supabase's own docs as
    "no longer recommended" — that recommendation assumes the library's
    auto-attach works, which it does not in our configuration. Pages
    MUST use `window._getHearthClient()` to benefit from this fix.
    Pages that call `window.supabase.createClient()` inline do NOT
    benefit and will continue to silently fail. Migration of remaining
    inline-createClient pages to the singleton is tracked separately.

15. **Never run two Claude Code sessions in parallel against the same
    repo.** Today's debugging session was complicated by a parallel
    session merging five unrelated PRs (#180–#184) to main while we
    were diagnosing the auth-attach bug. Although neither session
    reverted the other's changes, the local clone diverged silently
    from origin/main, and there was a real risk of one session
    reverting another's work without anyone noticing. Hard rule going
    forward: only one Claude Code session active per repo at a time.
    If a session is paused, finish or close it before starting another.
    The cost of breaking this rule is hours of confused debugging
    chasing phantom bugs in code that's been silently changed by the
    other session.

## Stripe Connect Express (T3-8)

- vendors schema: `stripe_account_id` TEXT (nullable),
  `stripe_onboarding_complete` BOOLEAN NOT NULL DEFAULT FALSE
- Partial index `idx_vendors_stripe_account_id` WHERE
  `stripe_account_id IS NOT NULL`
- Edge Functions: `create-stripe-connect-link`,
  `check-stripe-connect-status`
- Both use `verify_jwt = false` in `supabase/config.toml` plus in-function
  `supabase.auth.getUser()` for JWT verification (mirrors the
  `invite-vendor` pattern)
- Stripe account type: Express (`country=GB`,
  `business_type=individual`)
- Secret in Supabase: `STRIPE_SECRET_KEY` (test/sandbox mode at launch)
- Publishable key exposed via
  `window.HEARTH_CONFIG.STRIPE_PUBLISHABLE_KEY`
- After Stripe redirects back, ALWAYS call
  `check-stripe-connect-status` Edge Function. Never read the DB
  directly — it may not be updated yet when the vendor returns. The
  Edge Function hits Stripe for the authoritative state and, on
  completion, flips `stripe_onboarding_complete` via a service-role
  update.
- Drop publish gate: drops cannot transition to live/published status
  unless `vendor.stripe_onboarding_complete = true`. Draft operations
  (create, edit, save) remain unblocked. The gate in `drop-manager.html`
  renders a notice above the drop list, disables the Publish button,
  and disables the `live` option in the status dropdown until Stripe
  onboarding completes.
- Platform handover note: `stripe_account_id` values are scoped to a
  single Stripe platform. If platform ownership changes, all
  `stripe_account_id` values must be nulled and affected vendors
  re-onboard. Document this as a known migration task.

## Admin and monitoring design principles

These principles apply to any platform oversight or monitoring surface
built under Tier 7 (platform oversight and administration). They sit on
top of the general coding rules and operational learnings above —
admin and monitoring pages have stricter expectations because they are
the control surface for the platform itself.

- Admin and monitoring pages are HTML-first (single-file pattern,
  consistent with the rest of Hearth). No framework, no build step.
- Read-first, write-second for admin. Default admin surfaces to
  read-only views. Any write action (claim, unclaim, suspend, override)
  requires an explicit confirmation step and must be recorded in the
  admin audit log (T7-7).
- Server-side auth verification via `supabase.auth.getUser()` on every
  admin page. Frontend-only UID gating (as used by admin.html today) is
  UX, not security — it hides the page but does not protect the data.
  RLS policies and server-side verification are the actual boundary.
- Admin tone matches platform tone: calm, considered, restrained. No
  dashboard-y chrome, no alert-red everywhere, no emoji status
  indicators. Plain language, clear hierarchy, honest signals.
- No duplication of vendor-facing tooling. Admin surfaces what vendors
  cannot see (platform-wide state, cross-vendor patterns, health
  signals, audit trails). It does not re-implement Drop Studio or
  Insights at a platform level.
- Alert fatigue is the enemy. Every alert must be rare, actionable,
  and ranked by severity. An alert that fires daily is noise; an alert
  that fires for something the operator cannot act on is worse than
  no alert at all.
- Every alert must suggest an action, not just describe a symptom.
  "Edge Function X failed 3 times in the last hour — check logs at
  [link]" is useful; "Error rate elevated" is not.
- Monitor what vendors experience (end-to-end flows), not just
  individual server components. A green Supabase status with a broken
  order flow is still a broken platform. Synthetic transactions
  (T7-M9) and end-to-end health checks beat component-level pings.
- Silence is data. Weekly heartbeat alerts protect against monitoring
  itself failing — if the digest stops arriving, that is the signal.
- Phase 1 should feel complete before Phase 2 starts. Resist the
  temptation to build cohort analytics or structured logging
  pipelines before the basic cockpit and uptime monitoring are in
  place and trusted.

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
The matured form of T4-28 (intelligence engine). Extends hearth-intelligence.js
with geographic demand scoring and host intelligence, surfacing proactive
recommendations directly inside Drop Studio and Home — not just in Insights
after the fact.

Geographic demand scoring:
  - Customer clustering by outward postcode with recency and frequency weighting.
    Identifies the vendor's strongest demand areas from customer_relationships
    and order history. Output: ranked list of postcode areas with customer count,
    order history, and a confidence score (Strong / Building / New territory).
  - Drop Studio integration: Basics pane Audience Preview panel (T4-17) extended
    to show a plain-English recommendation — "Your strongest area is BH18 with
    34 customers. Your last two drops there averaged 28 orders. Consider placing
    your next drop here." Recommendation fires when no host is selected and
    customer data exists.
  - Home dashboard integration: replaces the current generic next-action cards
    with demand-scored recommendations. Maximum 3 cards. Each card names the
    specific area, customer count, and a Create drop CTA pre-seeded with the
    postcode. Shows "Signals are building — run more drops to unlock
    recommendations" when data is insufficient.
  - data_posture awareness: data-rich vendors (customer_data_posture rich or
    partial) receive import-first and demand-targeting recommendations.
    Data-light vendors receive host-first or drop-first recommendations.
    This distinction must be explicit in the recommendation body copy, not
    just in the archetype label.

Host intelligence layer — two signals built on top of existing host and drop data:

(1) Repeat host cadence recommendations. When a vendor has run 2+ drops at
the same host, the engine analyses the gap between them and the fill rate
trend. If drops at that host are filling well and the gap is longer than 14
days, the recommendation engine surfaces a cadence nudge: "Your last 3 drops
at The Bell have averaged 87% capacity. You're running there monthly — could
you explore fortnightly?" Cadence suggestion is context-aware: recurring event
hosts (pub, sports club, workplace) get frequency nudges; one-off or event-type
hosts (charity fundraiser, school fair) are excluded. Host type from the
host_type field on the hosts table drives this distinction — pub, club, and
workplace types are eligible; event and other types are not. Also surfaces
multiple-window suggestions for eligible hosts: "Your Friday evening drop at
The Bell is consistently strong — could you add a lunchtime window on the same
day?" Links to Drop Studio with host pre-seeded.

(2) New host discovery recommendations. When a vendor has a successful host
relationship (2+ drops, avg fill rate ≥ 70%), the engine recommends exploring
similar host types in the same or adjacent postcode areas. Uses the vendor's
existing host postcodes and the hosts table to identify host_type matches.
Surfaces as a plain-English card: "You're doing well at pub drops in BH18.
There are other venues of the same type in BH18 and neighbouring areas —
exploring a new pub partnership could open a second demand channel." In V1
this is a static recommendation with no live venue data. V2 scope (T5-9b,
do not build now): integrate with Google Places API or similar to surface
named nearby venues of the relevant type, with estimated audience size where
available. This is the foundation for the matching engine in T5-4.

Dependency: T4-28 (intelligence engine — complete), meaningful customer and
order data from real drops, T6 complete so production data is real. Do not
build the geographic scoring on synthetic test data — wait for Healthy Habits
Cafe to run at least 2 drops before evaluating signal quality.

T5-11: Comms engine V1
Event-driven transactional and demand generation messaging triggered by order
and drop lifecycle events. Built on Supabase Edge Functions calling Postmark
for email. SMS via Twilio deferred to V2 — focus V1 on getting email right.

Transactional triggers (V1 scope — email only):
  - order_confirmed: fires immediately after order insert in order.html.
    Sends to customer email if present. Contains order reference, items
    ordered, fulfilment mode, collection point or delivery address, drop
    timing. Vendor-branded with display_name and brand_primary_color.
  - order_ready: fires when Service Board operator marks order as Ready
    (the same event that currently opens the T3-10 notification modal).
    Sends to customer if email present. "Your order is ready for
    collection / on its way." Supplements rather than replaces the manual
    modal — operator still sees the modal, email sends automatically in
    parallel.
  - drop_closing_soon: fires 2 hours before closes_at for any live drop
    with orders placed. Sends to consented customers (contact_opt_in true)
    who have not yet ordered this drop. "Orders close soon — don't miss
    your slot." Maximum one per customer per drop.

Proactive demand generation triggers (V1 scope — email only):
  - drop_announced: fires when a drop status changes to scheduled or live.
    Sends to all consented customers (contact_opt_in true) who have
    previously ordered from this vendor OR who have previously ordered at
    this host (if the drop has a host). Subject: "[Vendor name] has a drop
    coming up — [drop name], [date]." Body: drop name, host name if present,
    timing, capacity signal ("limited spots"), order link. This is the
    primary demand generation trigger — it turns the vendor's earned customer
    asset into active pre-drop promotion. Maximum one drop_announced message
    per customer per drop.
  - drop_reminder: fires 24 hours before closes_at for drops with remaining
    capacity. Sends only to consented customers in the vendor's audience who
    have NOT yet placed an order for this drop. "Orders close tomorrow —
    [drop name] at [host], [time]." Targets non-orderers who have previously
    engaged with the vendor. Maximum one drop_reminder per customer per drop.

Hard rules:
  - Maximum 2 automated messages per customer per drop across all
    non-transactional triggers combined (drop_announced + drop_reminder).
    Transactional messages (order_confirmed, order_ready) do not count
    toward this limit — they are responses to customer actions.
  - Only send demand generation messages to customers where contact_opt_in
    is true on at least one previous order from this vendor.
  - consent_status on customer_relationships must be 'granted' or 'imported'
    (not pending or revoked).
  - Vendor-sourced imported customers (T4-14) are eligible if lawful_basis
    was declared at import.
  - Host-audience targeting (customers who ordered at this host from a
    different vendor) requires explicit host consent chain — flagged for
    T5-18. Do not implement cross-vendor host targeting in V1. Target the
    vendor's own audience only.
  - All sends logged to a new comms_log table (customer_id, drop_id, trigger,
    sent_at, channel, status) for audit and deduplication. Design
    channel-agnostic from the start so SMS can be added without schema changes.

Infrastructure required before building:
  - T6-1 (domain — lovehearth.co.uk must be live for sender addresses)
  - T6-6 (Postmark configured with SPF/DKIM/DMARC)
  - Supabase Edge Function runtime available (already used for invite-vendor)

Email template design: vendor-branded header using display_name and
brand_primary_color, Hearth footer. Plain-text fallback required.
Templates stored as Edge Function string literals initially.

SMS (Twilio) for all triggers including demand generation is V2 scope.
Consent and eligibility rules are identical across channels — the
comms_log and eligibility logic must be channel-agnostic from day one.

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

T5-B13: Drop Studio — remove dead `dropStatus` dropdown
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

T5-B15: PR 4b — clone-mode for create-drop, retire residual stamps
PR 4a leaves two residual direct-PostgREST writes alongside the
migrated paths because their fields (`series_id`, `series_position`,
`window_group_id`, `status`) are excluded from `update-drop`'s
whitelist (clone-mode shape — stamped on creation only). Targets:
- `drop-manager.html` series-template branch (after the update-drop
  call, a follow-up PostgREST `.update({ series_id, series_position,
  status: 'draft' })`).
- `drop-manager.html` `handleCreateEventWindows()` parent
  `window_group_id` stamp.
PR 4b's clone-mode work on `create-drop` (using the widened whitelist
landed in PR 4a) replaces both flows with create-drop sibling
generation, at which point both residuals can be deleted. Carries
over from the PR 4a build prompt.

T5-B16: drop-menu.html category INSERT blocked by RLS policy on
`categories` table. Authenticated POST fails with `new row violates
row-level security policy for table "categories"`. Surfaced during
PR 4a in-browser verification: Test 11 had zero categories because
the create flow has never worked. Manually inserted "Mains" via SQL
(service-role context bypasses RLS). Investigate in PR 4b: is the
policy missing or wrong, or is the client query missing a required
field? Coordinate with Priority 4 (Menu Library writes migration) —
likely either fixed in PR 4b standalone or rolled into Priority 4.

### Tier 6 — Production readiness

These items must all land before any real vendor starts capturing live
customer data. The current workflow (direct pushes to main, auto-deploy
to live site, no staging, no local dev) is fine for solo development
but dangerous the moment real vendors depend on the platform. A bug in
order.html today would reach live customers within 30 seconds of commit.

T6-1: Domain migration to lovehearth.co.uk
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

## Recommended next session order

All Tier 1 and Tier 2 items are complete. T3-1 is also complete.

1.  T3-2  — Drop Studio saveAssignments defensive pattern ✓ COMPLETE
3.  T3-3  — Menu Library saveSortOrderBatch performance ✓ COMPLETE
4.  T3-4  — Insights Supabase chaining pattern ✓ COMPLETE
5.  T3-5  — Drop Studio unsaved changes warning ✓ COMPLETE
6.  T3-6  — Service Board confirmation on status changes ✓ COMPLETE
7.  T3-7  — Order page real-time capacity update ✓ COMPLETE
8.  T3-8  — Stripe integration
9.  T3-9  — Order page customer data capture and consent ✓ COMPLETE
10. T3-10 — Order ready notification ✓ COMPLETE
11. T3-11 — Menu Library delivery and collection suitability flags ✓ COMPLETE
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
25. T4-30 — Onboarding delivery model audit ✓ COMPLETE
26. T4-29 — Series intelligence in Insights
27. T4-12 — Post-drop scorecard ✓ COMPLETE
28. T4-13 — Minimal host-facing view ✓ COMPLETE
29. T4-15 — Multiple drops within a single event ✓ COMPLETE
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
34. T4-21 ✓ COMPLETE — Customer import post-import demand view
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

Next priority: T6 workstream (production readiness) must complete before
any real vendor captures live data. Order:
  1. T6-1 — Domain migration to lovehearth.co.uk (in progress)
  2. T6-2 — Local development environment
  3. T6-3 — Staging environment
  4. T6-4 — Branch protection and PR review workflow
  5. T6-5 — Supabase Pro upgrade for point-in-time recovery
  6. T6-6 — Transactional email via Resend or Postmark

Once T6 is complete, T3-8 (Stripe integration) unblocks, and real vendor
onboarding (Healthy Habits Cafe first) can proceed safely.

After T6 and Stripe, the recommended build sequence is:
  1. T5-11 — Comms engine V1 (transactional first: order_confirmed,
     order_ready; then demand generation: drop_announced, drop_reminder)
  2. T5-9  — Recommendation engine maturation (geographic scoring,
     host cadence intelligence, new host discovery)
  3. T5-25 — Drop promotion (social copy generator and print poster)
  4. T5-14 — Home page demand orchestration dashboard
  5. T4-29 — Series intelligence in Insights
  6. T3-12 — Neighbourhood radius enforcement (if neighbourhood drops
     are in active use by then)

Going live before T6-2, T6-3, and T6-4 means any Claude Code mistake
reaches live customers within 30 seconds — appropriate for solo
development, dangerous when real vendors depend on the platform.
