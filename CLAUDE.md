# Hearth — Claude Code Project Guide

## What Hearth is

Hearth is a vendor-first, community-powered food ordering platform built around
planned "drops" — not always-on ordering. Every drop has a fixed time window,
a designed menu, declared capacity, and a host context. This is not a
marketplace. It is not an aggregator. It is infrastructure for shared local
food moments.

Core belief: great local food should strengthen communities, not bypass them.

## Documentation canon

- On any conflict between strategy or reference documents,
  `Hearth_Strategy.md` wins.
- Anything under `docs/archive/` is historical record, never current
  authority.
- Live canon:
  - `Hearth_Strategy.md` — master strategy
  - `Hearth_Brand_Playbook.md` — brand + vocabulary
  - `Hearth_Drop_Communications_Architecture.md` — comms
  - `Hearth_Repetition_Layer_Voice_Spec.md` — repetition/coaching voice
  - `audit/Hearth_Build_Coherence_Audit.md` — coherence invariants

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
- drop-menu.html — Offer (products, bundles, categories; nav canon is
  "Offer" per Hearth_Brand_Playbook.md §7 — formerly labelled "Menu Library")
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
- admin.html — Admin vendor provisioning page. Auth-gated via the
  admins table (no longer a hardcoded UID — see "Platform admin MVP"
  section). Calls admin-verify on load.
- platform-admin.html — Platform admin vendor list. URL-only access
  (not linked from any nav). Auth-gated via admin-verify.
- platform-admin-vendor.html — Platform admin vendor drill-down:
  header, drops table, orders table. Reached via
  ?id=<vendor_uuid> from platform-admin.html. Same gate.
- assets/hearth.css — shared platform stylesheet
- assets/config.js — Supabase config
- assets/hearth-intelligence.js — shared intelligence engine module
  (archetype detection, capacity/rhythm/menu/growth signals, recommendation
  generation, customer segmentation) consumed by insights.html,
  customers.html and home.html.
  The recommendation engine threads `customer_data_posture` (exposed by
  `detectArchetype()` as `customerDataPosture`) and `importedCount` (on the
  `signals` object) through `generateRecommendations()`. The
  `archetype_import_existing_customers` branch fires at the top of
  recommendation priority for vendors where `customer_data_posture` is
  `'rich'` or `'partial'` AND `importedCount < 5`, and suppresses
  automatically once the vendor imports 5+ customers via the
  `bulk-create-customers` flow. Callers compute `importedCount` before
  invoking: home.html and customers.html derive it from in-memory state
  (`state.customers` / `state.allCustomers` filtered by
  `source === 'import'`), avoiding extra queries; insights.html calls the
  extended `get-vendor-customer-count` Edge Function (which now accepts an
  optional `source` filter — backward compatible; existing callers without
  `source` get unchanged behaviour) and reads back the count. (T-intelligence-engine-import-recommendation, 2026-05-23.)
- assets/vendor-nav.js — HearthNav helper module exposing
  withVendor(href), renderNav(container, activeFile), and decorateLinks(root).
  Loaded synchronously in every operator page's <head>. Used to build nav
  bars at parse time and preserve the ?vendor= URL param across all internal
  navigation. Cache-busted via ?v=2
- assets/hearth-photo-upload.js — shared photo upload component (Cropper.js
  + canvas compression + Supabase Storage). Constructor:
  `new HearthPhotoUpload(container, opts)` with aspectRatio, storagePath
  generator, initialUrl, guidanceCopy ('item' | 'hero'), onUpload, onRemove.
  Used by Brand Hearth (hero) today; will be used by Menu Library (item
  photos) in T4-31b-products.
- assets/libheif.js — self-hosted libheif-js bundled variant (~1.4MB, WASM
  inlined). Decodes modern iPhone HEIC for the upload component. See
  operational learning #37 for variant choice rationale.
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
- Test 11 (slug: test-11, vendor_id 26e3721b-34d9-4b13-9dc3-e92c47d058a8,
  email eddierenzo1@gmail.com) — primary verification fixture for
  Edge Function PRs. Used to verify PR #192 (get-host bundle).
  Currently has eight hosts attached, kept in place as test fixtures:
  Large Balls, Massive Balls, Medium Balls, Small balls, The Bell,
  Tiny balls (all pre-existing). Mini Balls (created via Drop Studio
  inline → terms_accepted: false — see T4-37 backlog item) and
  Blue Balls (created via hosts.html Add Host → terms_accepted: true)
  were added during PR #192 verification and are deliberately
  retained as test fixtures covering both terms-acceptance code
  paths.
- Test 12 (slug: test-12) — Stripe-incomplete fixture. vendor_id
  `32a6665a-7b68-428d-90b3-d9b11259c16e`, auth_user_id
  `40d17b2d-2960-4d06-afd4-d27d399becd9`, email `eddierenzo1+test12@gmail.com`. `stripe_account_id`
  populated (`acct_1TRIxBDLu8y9FWo2`), `stripe_onboarding_complete =
  false`. Used for verifying the publish-time Stripe gate fires
  correctly server-side and the gate UI renders correctly client-side
  (orange banner, disabled "Live" status option). Do NOT complete
  Stripe onboarding on this fixture — the value is precisely that it
  stays incomplete. If a future test requires a fully-connected
  vendor, use Test 11.

Load any vendor's workspace via the ?vendor=<slug> URL param on any
operator page (see the Operational learnings section on resolveVendor
and HearthNav.withVendor).

## Pre-launch sequence

The remaining sequence before the first real drop with Healthy Habits
Cafe. Items marked ✓ are complete; everything else is open.

1. ✓ Platform admin MVP — COMPLETE 2026-05-21
2. ✓ T-customers-page-import-entry — COMPLETE 2026-05-22
3. ✓ T-intelligence-engine-import-recommendation — COMPLETE 2026-05-23
4. ✓ Admin-aware login routing (auth-callback.html) — COMPLETE 2026-05-22
5. T-B5-delivery-not-a-line-item — remove the "Delivery — Free"
   basket line from order.html (delivery is structurally absent)
6. T-support-healthy-habits-env-cleanup — revert the Big Ballz
   Catering fake live/public test state + clear stray comms_log /
   interest / order test rows; audit-first (hard predecessor to the
   dry run)
7. Healthy Habits Cafe dry run (next)
8. ✓ T1-3 closure — COMPLETE 2026-05-26 (resolved by T5-A5)
9. T3-8 Stripe live mode conversion
10. T6-5 Supabase Pro PITR upgrade (parallel — Ed completes
    independently)
11. Go live

Post-launch: T5-25 Part 0 (Instagram menu card image).

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
  customer_notes_enabled (boolean, default true). Capacity is driven by
  `capacity_driver` (`'by_order'` | `'by_category'`) and
  `capacity_categories` (jsonb) — added as part of T3-13. Legacy
  `capacity_units` retained for backward compatibility.
- drop_menu_items — items enabled for a specific drop (product or bundle)
- products — catalogue products (vendor-scoped). `allergens` and
  `dietary_flags` are `text[] NOT NULL DEFAULT '{}'` (T4-31d /
  T4-31e). The matching Postgres `allergen` and `dietary_flag`
  ENUM types exist in the database but are deliberately not used
  as the column types — see operational learning #42.
  `counts_toward_capacity` (boolean) and `capacity_weight` (integer)
  drive per-item capacity contribution under T3-13. Same pair exists
  on `bundles`.
- bundles — catalogue bundles with bundle_lines and bundle_line_choice_products.
  `counts_toward_capacity` (boolean) and `capacity_weight` (integer)
  mirror the product columns — see T3-13.
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

15. **Edge Function changes follow the deploy-before-merge workflow.**
    Claude Code drafts the function source, the `supabase/config.toml`
    block, and any page changes on a feature branch and opens a PR.
    Claude Code does NOT push to main and does NOT attempt to deploy.
    Ed deploys the function from his linked Supabase CLI:
    ```
    git fetch origin
    git checkout feature/<branch-name>
    supabase functions deploy <function-name>
    supabase functions list
    ```
    Then runs the smoke test:
    ```
    curl -i -X OPTIONS https://tvqhhjvumgumyetvpgid.supabase.co/functions/v1/<function-name> \
      -H "Origin: https://lovehearth.co.uk" \
      -H "Access-Control-Request-Method: POST"
    ```
    Expect HTTP 204 with `access-control-allow-origin:
    https://lovehearth.co.uk`. Only after the smoke test passes is
    the PR merged. Merging before deploy produces 404s on every
    save in production until the Edge Function is deployed. T6-1
    (auto-deploy via GitHub Actions) is outstanding — manual
    deploy required for now.

16. **Edge Functions protected only by the gateway `verify_jwt` flag
    have no real server-side auth boundary.** Any privileged Edge
    Function must include explicit in-function JWT verification via
    `supabase.auth.getUser()` and an authorisation check against the
    returned user claims. The frontend UID check is UX, not security.
    (Learned from invite-vendor session, 22 April 2026.)

17. **When admin.html or any authenticated page calls a Supabase Edge
    Function, both `apikey` and `Authorization: Bearer <access_token>`
    headers must be included,** matching the pattern used for direct
    PostgREST calls. Missing headers produce
    UNAUTHORIZED_NO_AUTH_HEADER / 401 errors that fail silently after
    creating partial database state. (Learned from admin.html bug,
    22 April 2026.)

18. **Supabase has migrated all projects to asymmetric JWT signing
    keys (ECC P-256 / ES256).** Edge Functions deployed before this
    migration that relied on the gateway's HS256 verification will
    fail with UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM. Fix: set
    `verify_jwt = false` in supabase/config.toml for the function and
    use `supabase.auth.getUser()` in-function, which handles both
    algorithms natively. (Learned from invite-vendor session, 22 April
    2026.)

19. **Challenge handover assertions before acting on them.** Session
    handover notes sometimes describe deployed state rather than
    source state, or describe an investigation result as a confirmed
    fact. Before running any Claude Code prompt based on "the file
    has X", verify with grep/read first. (Learned from aborted
    branch 8609900 on 22 April 2026.)

20. **Stripe checkout flow always returns customers to production, not
    deploy previews.** The `success_url` and `cancel_url` in
    `create-order/index.ts` are hardcoded to `https://lovehearth.co.uk`.
    This means deploy preview testing of the post-Stripe flow
    (order-confirmation.html in particular) cannot complete the success
    path on the preview domain — Stripe will redirect to prod regardless.
    To verify confirmation-page changes against a feature branch, either
    (a) merge to main and test on prod, or (b) manually construct the
    confirmation URL against the preview domain after a real prod
    payment completes (substitute the order_id and session_id from the
    prod URL into the preview domain's order-confirmation.html path).
    See T5-B30 for the proper fix.

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
   `.in('drop_id', vendorDropIds)`. RLS state (confirmed 2026-05-15 via
   T-ops-rls-customer-import investigation): `customers` has one policy
   `customers_vendor_access`, SELECT-only, authenticated role only;
   `customer_relationships` has one policy
   `customer_relationships_vendor_access`, ALL operations, authenticated
   role only. No anon policies exist on either table. The "temporary
   anon SELECT policies" claim in earlier versions of this learning was
   true at some point in the platform's history but those policies were
   removed before 2026-05-15.

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
   - Admin-aware routing (auth-callback.html, 2026-05-22): once the session
     is established and before vendor resolution, auth-callback.html calls
     `admin-verify`. If it returns 200, the user is routed to
     platform-admin.html (respecting `storedRedirect` only if it begins with
     `platform-admin`). Non-admins fall through to the existing vendor lookup
     flow unchanged. Admins and vendors share a single login surface at
     login.html — there is no separate admin login page.

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

16. **Authenticated mutations migrate to Edge Functions following the
    `update-vendor` and `create-host` pattern.** The supabase-js +
    publishable-key auth-attach bug documented in learnings #12, #13,
    #14 is a real, persistent issue and cannot be sidestepped at the
    config level — the legacy anon JWT path was confirmed closed on
    27 April. The proven fix is to invoke an Edge Function via
    `client.functions.invoke()`, which uses a separate code path
    that does correctly attach the user JWT, and have the function
    verify ownership server-side and use a service-role client for
    the actual write. Pattern reference:
    `supabase/functions/update-vendor/index.ts` (UPDATE template
    with whitelist) and `supabase/functions/create-host/index.ts`
    (INSERT template). Each Edge Function:
    - Sets `verify_jwt = false` in `supabase/config.toml`
    - Verifies the JWT manually via `anonClient.auth.getUser()`
    - Verifies the user owns the relevant vendor / parent resource
    - Uses a service-role client (`SUPABASE_SERVICE_ROLE_KEY`) for
      the actual database write, bypassing RLS
    - Uses a tight `ALLOWED_ORIGIN` (currently
      `https://lovehearth.co.uk`)
    - Returns `{ error: "..." }` JSON for 4xx/5xx and the updated
      row for 200
    Page-side wiring uses `supabase.functions.invoke("<name>", { body })`
    and checks BOTH `error` (transport) and `data.error` (function
    error response). Migration is in progress. Confirmed migrated as of 2 May 2026:
    `update-vendor`, `create-host`, `update-host`, `create-drop`,
    `update-drop`, `transition-drop-status`, `assign-menu-items`,
    `remove-event-window`, `complete-onboarding` (covering Drop
    Studio drop CRUD, host CRUD, and onboarding writes), and the
    T5-B16 catalog batch — `create-category`, `update-category`,
    `delete-category`, `create-product`, `update-product`,
    `delete-product`, `create-bundle`, `update-bundle`,
    `delete-bundle`, `duplicate-bundle`, `save-bundle-line`,
    `delete-bundle-line` (covering all drop-menu.html catalog
    writes for categories, products, bundles, bundle_lines, and
    bundle_line_choice_products). Still on the direct PostgREST
    path: `drop-menu.html` shared `saveSortOrderBatch` upsert path
    (tracked as T5-B34 — drag-reorder for categories, products,
    and bundles is silently broken in production until that
    migration ships). `customer-import.html` writes are out of
    scope of the 2 May audit and remain unverified. RLS reads on
    tables without permissive `anon USING (true)` SELECT policies
    are also broken silently (`hosts`, `customer_relationships`,
    `customers`, `drop_series`, `drop_series_schedule`,
    `order_items`, `order_item_selections`, `order_status_events`)
    — those need either `list-X` Edge Functions or relaxed SELECT
    policies as part of the same workstream. See session handover
    dated 27 April 2026 for the full migration plan and priority
    order.

17. **Claude Code CLI is materially more reliable than the desktop app
    for multi-file or large-file edits.** The Claude desktop app's Code
    mode hit stream-idle timeouts repeatedly during the T5-B22 Phase 3
    session on order.html edits — three timeouts in succession on a
    single function deletion. The Claude Code CLI (`npm install -g
    @anthropic-ai/claude-code`, launched with
    `claude --dangerously-skip-permissions` from the repo folder) ran
    the same workload cleanly: order.html sessions A/B/C in
    41s/13m/48s, order-confirmation.html session D in 2m46s, session E
    in 1m56s. Same Opus 4.7 1M-context model underneath; different
    runtime. Required Node 18+ (installed Node 24.15.0 fresh via
    nodejs.org GUI; npm-global setup with `prefix=~/.npm-global` to
    avoid sudo). Default to the CLI for any multi-file or large-file
    order.html / order-confirmation.html / drop-manager.html work going
    forward.

18. **Claude Code worktree pattern.** Each Claude Code session creates
    a worktree at `.claude/worktrees/<auto-name>/` that owns the branch
    checkout. The main repo path cannot simultaneously check out a
    worktree-owned branch. When switching context (e.g. starting a
    fresh session against a branch a previous session was working on),
    verify the worktree is clean (`git -C .claude/worktrees/<name>
    status`) and remove it first (`git worktree remove
    .claude/worktrees/<name>`). `supabase functions deploy` works from
    either the main repo path OR the worktree path, but only after the
    relevant branch is checked out and the function source is present.
    Always verify with `git log origin/<branch> --oneline -10` after
    Claude Code claims it has pushed — pushes can silently fail while
    the CLI reports success.

19. **Stripe Checkout `expires_at` minimum is 1800 seconds (30
    minutes), not 600.** The original spec for the create-order
    function specified 600s and Stripe rejected with a clear error at
    deploy-test time. Corrected in commit 575b299. Always verify Stripe
    API minima before specifying constants.

20. **order.html uses literal `\u`-escape sequences for non-ASCII
    characters** (`\u2014` em-dash, `\u2026` ellipsis, `\u2714` checkmark) rather than the actual Unicode characters. Edit tools
    autoformat real Unicode chars to match this convention. Equivalent
    at runtime — just don't grep for the literal `—` later when
    looking for these markers.

21. **Search past Claude chats before starting any RLS or auth
    investigation on Hearth.** The supabase-js publishable-key
    auth-attach bug (operational learnings #12, #13, #14, #16) is the
    answer to almost all RLS-shaped errors on this platform.
    Diagnosing it from scratch wastes hours. The 30 April session lost
    time precisely this way.

22. **Edge Function migration is now the canonical write pattern for
    catalog tables.** All catalog writes from `drop-menu.html`
    (categories, products, bundles, bundle_lines,
    bundle_line_choice_products) flow through Edge Functions as of
    2 May 2026 (T5-B16, PRs #209, #211, #212). When adding new write
    paths for catalog tables, follow the same pattern:
    `verify_jwt = false` in `supabase/config.toml`, manual JWT
    verification via `anonClient.auth.getUser()`, vendor resolution
    from JWT, body-mismatch check, service-role write, tenancy belt
    (server sets `vendor_id` and any parent_id, never trusts client
    body), `ALLOWED_FIELDS` whitelist on update paths, top-level
    try/catch, CORS via `getCorsHeaders()` from `_shared/cors.ts`,
    `jsonResponse` as inline closure inside the handler.
    Reference functions:
    - Flat (single-table writes): `create-category`, `update-category`,
      `create-product`, `update-product`, `create-bundle`,
      `update-bundle`, `delete-bundle-line`.
    - Composite (multi-table operations with rollback):
      `delete-category`, `delete-product`, `delete-bundle`,
      `duplicate-bundle`, `save-bundle-line`. Pattern: sequential
      service-role writes with explicit rollback on failure.
      `duplicate-bundle` (clone + nested children) and
      `save-bundle-line` (line + reconcile children) are the
      references for rollback logic.
    All T5-B16 functions use `getCorsHeaders()` from `_shared/cors.ts`
    correctly, so they are already preview-domain-safe. Older
    functions (e.g. `create-order`) still using bare
    `Access-Control-Allow-Origin: "*"` headers are the cleanup target
    for T5-B30 — not new debt introduced by T5-B16.

23. **For multi-row writes against tables with NOT NULL constraints,
    use sequential `.update()` calls, not `.upsert()`.** supabase-js's
    `.upsert(rows, { onConflict: 'id' })` builds an `INSERT ... ON
    CONFLICT DO UPDATE` SQL statement under the hood. Postgres
    validates the INSERT half against table constraints (including
    NOT NULL) before conflict resolution applies the UPDATE half —
    so a payload of `{ id, sort_order }` against a table with
    `name NOT NULL` (no default) fails with `null value in column
    "name" violates not-null constraint`, even when every id matches
    an existing primary key. The conflict resolver never gets to
    run.
    Surfaced T5-B34 first deploy (3 May 2026). The three sort-order
    Edge Functions used `.upsert()` and failed immediately on first
    drag in deploy preview. Fixed by replacing each upsert with a
    sequential `.update().eq('id', row.id).eq('vendor_id',
    vendor_id)` loop.
    Rule: only use `.upsert()` when the row payload includes every
    NOT NULL column on the target table. For partial-row updates
    (e.g. just `sort_order`, just `is_active`), use `.update()`. The
    N-round-trip cost of N sequential updates is acceptable for
    bounded N and infrequent operations (sort-order, status
    toggles). For frequent or unbounded N, use a Postgres function
    via `rpc()` for atomic semantics — see T5-B38.

24. **T5-B22 resolution — the customer order flow was already
    built.** The customer order flow (`create-order`, `cancel-order`,
    `stripe-webhook`, `fetch-order`) was fully built and deployed
    before the session that logged it as a bug. The original RLS
    failure on `order_items` was caused by the Edge Function not
    existing at the time of the PR 4b fixture test — at that point
    the client was still falling back to direct PostgREST writes,
    which RLS correctly rejected. By the time T5-B22 was formally
    investigated (3 May 2026), all four functions were ACTIVE and
    the schema (`pending_payment` status, `vendor.platform_fee_pct`,
    `orders.platform_fee_pence`, capacity-reservation view updates)
    was complete. Lesson: when a bug is logged against a missing
    function, check whether the function has since been built before
    scoping a build session.

25. **Audit before building.** The T5-B22 session opened as an
    architecture discussion for a significant build and resolved in
    under an hour as a test session because the investigation step
    revealed the code already existed. The correct opening sequence
    for any ticket referencing a missing function or missing pattern:
    (1) `ls supabase/functions/` to see what exists, (2) `cat` the
    relevant function body if it exists, (3) check deployment status
    with `supabase functions list`, (4) check schema (relevant
    tables, columns, constraints, RLS policies), (5) only then
    assess whether a build is actually needed. Five minutes of
    investigation up front beats an hour of planning a build that
    the codebase no longer needs. Especially relevant for tickets
    logged days or weeks before they're picked up, when the platform
    state may have moved underneath the ticket framing.

26. **When adding new columns, audit the full read-write loop.**
    Schema changes have two sides that need to be in lockstep:
    - **Write path:** the `ALLOWED_FIELDS` whitelist in the matching
      Edge Function (e.g. `update-product`, `update-drop`). A missing
      whitelist entry means the new column is silently stripped on
      save. Discovered during T3-12a where `delivery_area_type` and
      `allowed_postcode_prefixes` needed adding to `update-drop`'s
      whitelist.
    - **Read path:** the matching `v_*_enriched` view that the UI
      loads from. A missing column in the view returns `undefined`
      to the client, which typically falls back to defaults — the
      data is being saved correctly but the UI shows stale values,
      indistinguishable from a save bug. Discovered during T5-B35
      where `v_products_enriched` was missing `travels_well`,
      `suitable_for_collection`, and `prep_complexity`.
    When designing schema changes, list every Edge Function whitelist
    AND every `v_*_enriched` view that needs widening. Either alone
    is silently broken. Note that `CREATE OR REPLACE VIEW` cannot
    reorder columns (error 42P16) — append new columns to the end of
    the SELECT list.

27. **Stuck "thinking" loops past ~10 minutes are stuck, not
    progressing.** If Claude Code shows a long-running "thinking"
    or "almost done thinking" state with retry attempts and no
    token output for more than ~10 minutes, the model is not
    making progress — it is in a degenerate retry loop. Don't wait
    it out. Press esc to interrupt, then resume with an explicit
    recovery prompt: "Continue from where the timeout interrupted
    you. First check disk state with `git status` and `git diff`
    to confirm what's already on disk — do not re-edit anything
    that's already been written." Then list the remaining tasks
    explicitly. The model picks up cleanly from disk state rather
    than from its own confused internal state. If the recovery
    prompt also stalls on the same step, the issue is likely
    specific to that file or section — work around it by splitting
    the task or providing more prescriptive instructions about
    what to write.

28. **macOS Terminal.app auto-renders domain-like text as
    `[text](http://text)` in `cat` output.** The underlying file
    bytes are clean — Terminal's "Smart Selection" or similar
    feature adds the markdown-link rendering at display time. When
    in doubt, confirm with `xxd <file> | tail -N` to see the real
    bytes. Surfaced during the .gitignore cleanup in this session:
    `cat` displayed `*.[rtf.sb](http://rtf.sb)-*` while `xxd`
    confirmed the file actually contained `*.rtf.sb-*`. Don't waste
    cycles "fixing" a content problem that isn't there. If the
    rendering itself is a nuisance during scripting work, Terminal →
    Settings → Profiles → Advanced has options that reportedly affect
    this.

29. **Symptom "values won't stick after save" is ambiguous.** Two
    distinct bug shapes can present identically: (a) save broken
    (values not persisted to the database), or (b) read broken
    (values persisted but not displayed). The first thing to do
    when this symptom appears is a direct SELECT against the
    underlying table — not the view, not the API — to disambiguate.
    If the table holds the saved values, the bug is on the read
    side, almost certainly a missing column in a `v_*_enriched`
    view (see learning #26). If the table holds defaults, the bug
    is on the write side — check the network payload first, then
    the Edge Function whitelist. Surfaced during T5-B35 testing
    where suitability flags appeared to revert on save. Direct
    table SELECT showed the saved values were correct in
    `products`; `v_products_enriched` was the gap.

30. **Large file sessions — targeted greps, not full reads.**
    `order.html` is 3,287 lines. Any session that reads the full
    file at once risks stream-idle timeouts (experienced three
    times during T4-31). Always grep for specific function names,
    class names, or IDs before reading. Pattern:
    `grep -n "functionName\|className" order.html | head -30`
    then read only the relevant line ranges. If a session stalls
    past 10 minutes without output, interrupt with Escape, run
    `/clear`, and restart with a scoped grep-first instruction.
    The Claude Code CLI (learning #17) is more reliable than the
    desktop app for large file work.

31. **Modal sheet architecture — fixed header/body/footer, not
    sticky.** `position: sticky` for modal headers failed
    repeatedly during T4-31 because sticky only works when the
    element's parent is the scroll container. The reliable
    pattern for any slide-up sheet (bundle modal, checkout sheet)
    is a three-part flex column: fixed-height header
    (`flex-shrink: 0`), scrolling body (`flex: 1; overflow-y:
    auto; -webkit-overflow-scrolling: touch`), fixed-height
    footer (`flex-shrink: 0`). The modal container is `position:
    fixed; inset: 0; display: flex; flex-direction: column`.
    Reset `scrollTop = 0` on open. No sticky required.

32. **iOS Safari mobile overflow — html not body.**
    `overflow-x: hidden` must be set on the `html` element, not
    `body`. Setting it on `body` alone does not prevent
    horizontal overflow on iOS Safari. Both `html` and `body`
    should also carry `max-width: 100%`.

33. **Vendor colour vs Hearthfire on customer-facing pages.**
    `order.html` is the vendor's customer surface, not a Hearth
    operator page. Primary CTAs ("Add to order", "Customize",
    "Pay") use the vendor's `primary_color` from the loaded
    vendor record — not the Hearthfire constant `#c4511a`.
    Hearthfire belongs on Hearth operator pages only. The only
    Hearth signal on the order page is the "Powered by Hearth"
    footer attribution.

34. **Southbury Farm as visual test fixture.** During T4-31,
    `stripe_onboarding_complete` was temporarily set to true
    with a dummy `stripe_account_id` to enable order page visual
    review with real branding. Reverted to false / null after
    the session. If needed again:
    `UPDATE vendors SET stripe_onboarding_complete = true,
    stripe_account_id = 'acct_test_southbury' WHERE slug =
    'southbury-farm-pizza';`. Remember to revert.

35. **Vendor asset Storage bucket is `vendor-assets`, path pattern
    is `{slug}/{asset}`.** Earlier prose in this file may have
    referenced `assets/vendors/{slug}/...` paths — that was wrong.
    The actual production bucket is `vendor-assets` (not
    `assets`), and the path pattern is flat: `{slug}/logo`,
    `{slug}/hero`, etc., established by T2-7. New asset types
    should follow the same pattern
    (`{slug}/products/{product_id}-{ts}.jpg` for product photos).
    Always upsert to the same path so replacements overwrite in
    place — eliminates orphan file accumulation. Confirmed via
    T4-31b investigation (PR #225) where the initial spec
    assumed the wrong bucket and path; the working code uses
    `client.storage.from('vendor-assets').upload('${slug}/hero',
    ...)` with `upsert: true`.

36. **Self-host critical client-side libraries rather than
    depending on CDNs.** PR #225 burned multiple iterations on
    heic2any CDN URLs that didn't actually serve the file
    (cdnjs doesn't host heic2any; jsDelivr's first guess URL
    was wrong). The clean fix was to download the library into
    `assets/` and reference locally. CDN failures are silent
    (script tag fails to load, downstream calls throw "X is
    not defined") and CDN coverage isn't always what you
    expect. For libraries in critical user flows, self-host.
    Standard cdnjs entries (Cropper.js, popular libraries) are
    still fine; specialist or smaller libraries should be
    vendored.

37. **Modern iPhone HEIC requires a current libheif build.**
    heic2any@0.0.4 (most recent release, from 2020) bundles a
    years-old libheif WASM that fails on modern iPhone HEIC
    encoding with "Could not parse HEIF file" (libheif error
    code object visible in DevTools console). Switching
    libraries doesn't help if they wrap the same libheif
    build. The fix is `libheif-js` (catdad-experiments) which
    ships a current libheif build — specifically the *bundled*
    variant (`libheif-wasm/libheif-bundle.js`, ~1.4MB single
    file with WASM inlined as base64), not the wasm-split
    variant which has separate-WASM-file path resolution
    issues. Confirmed in PR #225. Mobile uploads from iOS
    Safari are unaffected because iOS auto-converts HEIC →
    JPEG before passing to the browser; the issue only
    manifests on desktop Chrome (or Mac Photos picks) where
    HEIC reaches the JS unmodified.

38. **Always hard-reload (Cmd+Shift+R) when testing save flows
    on deploy preview.** PR #225 spent significant time
    investigating a "save doesn't persist" bug that turned out
    to be Chrome serving cached page state. The save was
    working all along; the regular Cmd+R reload was returning
    the old hero URL from disk cache. Hard-reload bypasses the
    cache and shows current state. Standard practice for any
    PR where save+reload matters: at least one full hard-reload
    as part of the verification checklist, especially after
    observing an unexpected "didn't persist" symptom.

39. **Bundles support `image_url` the same way products do.**
    Schema column is `bundles.image_url` (text, nullable).
    Storage path convention is `{slug}/bundles/{id}` in the
    `vendor-assets` bucket, mirroring the product pattern
    (`{slug}/products/{id}`). Both `create-bundle` and
    `update-bundle` Edge Functions accept `image_url` in their
    field whitelists. `v_drop_menu_items_enriched`,
    `v_menu_library_items`, and `v_bundles_enriched` all expose
    `image_url` so the order page and Menu Library can read it.

40. **order.html menu card layout uses a `:has()`-based
    selector to distinguish standalone-cards-with-photos from
    bundle-outer-cards.** The selector
    `.menuItemCard:has(> .menuItemMedia):not(:has(> .menuItemCard))`
    targets the horizontal photo-right layout (96px thumbnail
    on the right, body on the left). Anything not matching that
    selector — text-only cards, or future bundle outer cards
    that wrap nested choice cards — falls through to the
    existing vertical layout. The `>` combinator inside `:has()`
    is required: descendant matching (`:has(.menuItemMedia)`)
    would catch nested cards and break the bundle case.
    Specificity of the new selector is (0,4,0), which beats
    the (0,1,0) base `.menuItemBody` rule including in the
    `@media (max-width:720px)` block — no per-breakpoint
    scoping needed.

41. **Edge Function pattern for new-row creation with
    client-supplied UUID.** `create-product` and `create-bundle`
    both accept an optional `id` field at the top level of the
    request body (sibling of `vendor_id` and the field payload).
    The `id` is validated by UUID regex; invalid → 400, conflict
    → 409 (Postgres SQLSTATE 23505). This pattern is required
    for any future "upload before save" photo flow because the
    storage path needs the row id before the row exists.

42. **PostgREST cannot write custom Postgres ENUM array types via
    the Supabase JS client. Use text[] columns instead.** Surfaced
    during T4-31d / T4-31e (allergens and dietary flags). Postgres
    ENUM types serialise fine over single-value reads but the
    array variant (`allergen[]`, `dietary_flag[]`) cannot be
    written through PostgREST — inserts and updates fail with a
    binary-encoding error from the client, regardless of whether
    the payload is sent as a JSON array, a Postgres array literal
    string, or via `.rpc()`. The fix is to define the columns as
    `text[]` with `DEFAULT '{}'` and move value validation to the
    application layer via shared constants (`ALLERGEN_LABELS`,
    `DIETARY_BADGE_LABELS`, `DIETARY_FULL_LABELS` in `order.html`;
    matching option arrays in `drop-menu.html` and the Edge
    Function whitelists). `products.allergens` and
    `products.dietary_flags` follow this pattern. The
    `allergen` and `dietary_flag` ENUM types exist in the
    database but are unused by application code. Future
    tag-array columns (e.g. dish tags, drop tags) should use
    `text[]` from the outset for the same reason.

43. **Schema migrations and the matching Edge Function deploy are
    an atomic pair.** When a new column is added as `NOT NULL`
    with no default, every subsequent write through an Edge
    Function that does not yet know about the column will fail
    with a not-null violation — and on the customer order path
    that means every checkout 500s in production until the
    function is redeployed. Same shape applies for new tables and
    new constraints. The migration and the function deploy must
    land in the same operation: either deploy the widened function
    first (it tolerates the old schema), then apply the migration;
    or apply the migration with a sensible default, then deploy
    the function, then drop the default. Never run the bare
    migration on its own and hope the deploy follows shortly.
    Surfaced during T3-13b where `orders.discount_pence` /
    `orders.discount_breakdown` were added and `create-order` had
    to be redeployed in lockstep — the gap between the two would
    have broken every order.

44. **Stripe Connect discounts: use a one-off coupon, not collapsed
    line items.** When applying a volume / event discount on a
    Stripe Connect destination charge, the wrong move is to
    re-shape `line_items` so each line carries a reduced
    `unit_amount` — that destroys the itemised breakdown on
    Stripe's side (vendor and customer receipts both lose the
    original prices, and reconciliation against `order_items`
    becomes impossible). The right move is to create a one-off
    Stripe coupon (`amount_off` in pence, `currency: 'gbp'`,
    `duration: 'once'`, `max_redemptions: 1`) and attach it to
    the Checkout Session via `discounts: [{ coupon: <id> }]`.
    `line_items` stay at their true unit prices; Stripe applies
    the discount at the session level and the receipt shows the
    breakdown plus the discount line. `application_fee_amount` is
    naturally correct because it's computed from the post-discount
    `total_pence` we already hold — no extra arithmetic needed.
    Surfaced during T3-13b prompt 3.3 (PR #254).

45. **Customer-payment Edge Function changes go through branch + PR
    + Ed-deploys + Ed-merges, never directly to main.** This is
    Critical Rule #15 (deploy-before-merge), reaffirmed during the
    T3-13b prompt 3 build of `create-order`. The three-prompt
    split (3.1 helpers, 3.2 capacity skip + total guard, 3.3
    persist discount + Stripe coupon) was specifically a defence
    against stream-idle timeouts on a long function — keeping each
    prompt under the threshold that triggers the degenerate retry
    loop documented in operational learning #27. Pattern works:
    Claude Code drafts source on a feature branch, Ed pulls,
    deploys via `supabase functions deploy create-order`, smoke-
    tests, and only then merges the PR. Never short-circuit by
    pushing function changes straight to main — merging before
    deploy 500s every order until the function redeploys.

46. **Application-level Resend integration established.** Pattern:
    a dedicated Edge Function reads `RESEND_API_KEY` from Supabase
    secrets and calls the Resend HTTP API directly (`POST
    https://api.resend.com/emails`) with `Authorization: Bearer
    ${RESEND_API_KEY}`. Success and failure both emit a single
    structured-JSON line to `console.log` / `console.error` so the
    Edge Function logs view is the audit trail until a real
    `comms_log` table arrives with T5-11 full. `RESEND_API_KEY` is
    now a required Edge Function secret in addition to the existing
    Supabase Auth SMTP layer (which only covers auth/onboarding mail
    — magic links, password reset, vendor invites — not
    application-triggered transactional sends). Reference
    implementation: `supabase/functions/send-order-confirmation`,
    shipped as T5-11-minimum (PR #266, 2026-05-16). Future
    transactional triggers (order_ready SMS via Twilio,
    drop_announced, drop_reminder, drop_early_access,
    post_drop_thank_you) should follow the same pattern: dedicated
    Edge Function per trigger, provider HTTP API called directly,
    structured-JSON logs.

47. **Inter-Edge-Function calls use shared-secret authentication.**
    Pattern: the caller does a direct `fetch()` to
    `${SUPABASE_URL}/functions/v1/<name>` with an
    `X-Internal-Secret` header containing the
    `INTERNAL_FUNCTION_SECRET` env var value; the callee reads the
    same env var, compares, and returns 401 on mismatch. JWT
    verification is disabled at the gateway via
    `verify_jwt = false` in `supabase/config.toml` for any function
    on this pattern — the shared secret is the only auth, so the
    function MUST refuse any request without the matching header
    (frontend code never calls these endpoints directly). Reference
    implementation: `stripe-webhook` → `send-order-confirmation`,
    shipped as T5-11-minimum (PR #266). See the header comment on
    `send-order-confirmation/index.ts` for the documented pattern.
    Use this for any future internal-only Edge Function call paths
    (e.g. order-ready trigger → SMS sender, scheduled-drop-reminder
    cron → reminder sender).

48. **`security_invoker` must be applied bottom-up across the view
    dependency tree** — leaf views first, then parents. A parent
    view stays effectively unscoped until every view beneath it is
    invoker; otherwise the parent (which is now invoker) reads from
    a still-definer child, and the child runs as its owner,
    bypassing the caller's RLS context. Verify tier by tier through
    the authenticated app path before moving to the next tier.
    Surfaced during the T5-A3 operator view rollout (2026-05-18).

49. **A definer view (`security_invoker` off) that reads an invoker
    view runs the child as the definer's owner, bypassing the
    child's RLS.** This is why the deliberately-held definer
    `v_drop_summary` still functions for `host-view.html` even
    though all its child views are now invoker — anonymous callers
    reach `v_drop_summary` as the definer's owner, which then reads
    the invoker children with that same elevated context. The
    exposure is bounded only by the columns `v_drop_summary`
    exposes; flipping it to invoker would cause the underlying RLS
    to filter every anonymous host-view caller to zero rows.
    Surfaced during the T5-A3 operator view rollout (2026-05-18).

50. **SQL-editor queries run with privileged access and bypass RLS
    entirely** (`rls_forced = false` on all tables), so they cannot
    verify `invoker`/RLS scoping. Only the authenticated app/REST
    path with a real session token exercises it. Same family as
    the `v_drop_public` REST-path lesson: SQL-editor success does
    not prove app-path success. Surfaced during the T5-A3 operator
    view rollout (2026-05-18).

51. **For silent-failure-mode changes (e.g. the invoker rollout,
    where a wrong outcome is empty data with no error), canary one
    isolated low-severity view and verify it via the authenticated
    app path before batching the rest.** The canary protects
    against a whole-batch regression that would manifest as "every
    operator page renders empty" rather than as an error in any
    single query. The T5-A3 operator view rollout used
    `v_products_enriched` as the canary before stepping through
    Tier 0 → Tier 1 → Tier 2+3.

52. **LOAD-BEARING — Operator pages are NOT authenticated at the
    PostgREST layer.** `supabase-js` with the publishable key does
    not attach the user JWT to direct table/view reads (the
    auth-attach bug — operational learnings #12, #13, #14, #16).
    Operator pages work today only because `v_drop_summary` (and
    other operator views) remain definer views with anon SELECT
    granted, and scoping is done client-side via
    `.eq("vendor_id", state.vendorId)`. The anon role is the
    actual role on the wire for every "authenticated" operator
    read. Two hard implications:
    - **(a) The previously planned `v_drop_summary
      security_invoker` flip is UNSAFE and is ABANDONED.** Do not
      attempt it. Flipping a view that the anon role currently
      reads to invoker filters every operator caller to zero rows
      — the symptom is silent empty data on every operator page,
      not an error. Same family as operational learnings #49, #50.
    - **(b) Closing the `v_drop_summary` cross-vendor exposure
      requires migrating the operator reads to JWT-authenticated
      server-side Edge Functions** (canonical pattern: extend
      `get-drop` / `list-drops` with the summary projection, or
      build dedicated EFs), THEN `REVOKE SELECT ON
      v_drop_summary FROM anon`. Any RLS-gated authenticated
      read must go via `supabase.functions.invoke`, never direct
      PostgREST.
    Surfaced concretely during the T5-A3 host-view sub-track
    build (2026-05-19): `host-view.html`'s direct PostgREST read
    against `drop_host_tokens` returned empty rows on a freshly
    JWT-authenticated session for exactly this reason — the JWT
    was not attached, anon hit the RLS-locked table, and the
    rows were filtered to zero. Fix was to route via the new
    JWT-auth `get-drop-host-token` Edge Function. The same
    lesson applies platform-wide to every operator read
    currently going via `v_drop_summary` and other definer views.

53. **LOAD-BEARING — the T5-A3 `security_invoker` view-layer
    rollout regressed the ENTIRE operator order / capacity /
    production / analytics read surface.** Twenty `v_*` views
    derived from the RLS-locked tables (`orders`, `order_items`,
    `order_item_selections`, `customers`,
    `customer_relationships`, `hosts`) are `security_invoker =
    on`; plus aggregate views layered on them
    (`v_hearth_summary`, `v_item_sales`, `v_hearth_drop_stats`,
    `v_hearth_revenue_over_time`, `v_host_performance`,
    `v_drop_orders_summary`, the `v_order_item_detail*` family)
    inherit the same emptiness transitively. Because operator
    pages are anon-at-DB (operational learning #52), an invoker
    view over RLS-locked base tables returns `[]` to the
    anon-effective publishable-key client — operators silently
    saw empty Service Boards, empty Insights, empty Customers
    workspaces, empty scorecards, empty home dashboards.
    Inventory of record:
    `audit/order-pipeline-reads-2026-05-19.md` (commit 1b60aab).

    **These order-pipeline views MUST NOT be reverted to
    definer.** Reverting reintroduces cross-vendor order /
    customer-PII exposure — strictly worse than the
    `v_drop_summary` economics case, because the surface
    includes customer email, phone, address, and order
    contents. The views STAY invoker.

    **Closure = migrate operator reads to JWT-authenticated,
    ownership-verifying Edge Functions.**
    `supabase.functions.invoke(...)` attaches the user JWT (the
    auth-attach bug only affects direct PostgREST). The EF
    verifies caller ownership via `auth.getUser()` +
    `vendors.auth_user_id`, then reads the invoker view with a
    service-role client (which legitimately bypasses RLS), and
    returns the rows verbatim under additive top-level keys.
    Pages re-point to consume the EF keys and delete the
    direct anon reads. The capstone is `REVOKE SELECT ... FROM
    anon` on the two still-definer views (`v_drop_summary` and
    `drop_capacity`) once nothing reads them directly.

    **Proven pattern (Slice 1, service-board, 2026-05-19):**
    (a) extend the relevant existing EF additively — service-
    role read of the relevant invoker view(s), returned
    verbatim under new top-level keys, ownership already
    enforced by the EF's existing JWT check; the additive
    deploy is a no-op for current callers and ships ahead of
    the page change;
    (b) re-point the page to consume the new EF keys and
    delete the direct anon reads plus any dead client-side
    fallback chain (the EF replicates the fallback server-
    side) and the now-redundant client-side `vendor_id`
    assertion (EF enforces ownership server-side — its removal
    is a security improvement, not a regression);
    (c) **verify against a drop WITH real orders in real
    workflow states.** An empty test drop masks this exact
    failure mode because `[]` is the symptom — verification on
    an empty surface proves nothing. This is a standing
    verification-discipline rule for any read-path migration
    against RLS-gated data. Slice 1 fixture: drop
    "Neighbourhood massive"
    (`25e75db9-01bd-4847-bc6c-7f858e216898`), 1 placed + 1
    delivered.

    **`drop_capacity`** is the open loose end — it is still
    definer, is derived from `orders`, and has no known
    frontend reader. To be assessed (drop, revoke from anon,
    or migrate) as part of the capstone phase.

    **Workstream framing.** The previously narrow T5-A14
    (`v_drop_summary`-only migration) is SUBSUMED by this
    larger operator-read-auth track — same pattern, same EFs
    (especially `get-drop`), same capstone shape. T5-A14's
    invoker-flip approach remains abandoned per operational
    learning #52. See the BACKLOG.md operator-read-auth entry
    for the sequenced slices.

54. **LOAD-BEARING — T5-A3 select-narrowing rule.** Every
    explicit column list replacing a `select('*')` MUST be
    validated against the LIVE `drops` / view / table schema
    before it ships — not against SCHEMA.md, which can be
    stale. PostgREST hard-400s the ENTIRE query on a single
    unknown column (`column <table>.<col> does not exist`),
    whereas `select('*')` silently tolerated missing columns
    by simply omitting them from the response. Regression:
    commit 69b1651 (T5-A3 host-view narrowing, 2026-05-18)
    swept the phantom columns `allow_table_numbers` and
    `table_numbers_enabled` (a never-built table-number
    feature whose consumer `inferCommunityTableMode()` was
    optional-chained) into `order.html`'s `drops` select,
    taking the customer order path
    (`order.html?drop=…`) hard-down for every drop from
    2026-05-18 until the 2026-05-19 fix. Same failure mode
    sits latent in any future select-narrowing under the
    T5-A3 / anon-revoke track AND in the **operator-read-auth
    REVOKE capstone** (operational learning #53), which by
    definition removes the `select('*')` fallback safety
    net by revoking anon SELECT once nothing reads the
    definer views directly. Every narrowed column list shipped
    on that track must be cross-checked against
    `information_schema.columns` on the live DB before merge —
    SCHEMA.md is an orientation layer, not adjudication. If
    you cannot reach the live DB from your environment, the
    contractual fallback (CLAUDE.md critical rule #13) is to
    spell out the verification SQL in the PR description and
    have the developer run it before merging.

55. **LOAD-BEARING — orders.total_pence is the only source of
    truth for what was charged.** Recomputing per-order revenue
    from order_items (sum(qty * price_pence)) carries THREE
    distinct correctness defects, all surfaced together in the
    May 2026 reporting pass:
    (1) Cartesian fan-out. A view that LEFT JOINs one parent row
    to two or more independent child tables and then SUM()s
    across the result multiplies each child's sum by the other
    child's row count. Regression: v_drop_orders_summary joined
    orders→order_items AND orders→v_order_item_detail_expanded,
    inflating Service Board UNITS/TOTAL and the hero Revenue
    headline by each order's line-item count (a real £157.50
    order showed as £945). Fixed 2026-05-19 by pre-aggregating
    each child to one row per join key in its own CTE before
    joining 1:1. Pattern: never SUM across multiple
    un-collapsed child joins in one query.
    (2) Discount-blindness. order_items.price_pence is the
    pre-discount unit price; sum(qty * price_pence) ignores
    orders.discount_pence and overstates by the total discounts
    applied. Fixed 2026-05-20 by switching
    v_hearth_drop_stats.revenue_pence and
    v_drop_fundraising_summary.drop_gmv_pence (plus the
    percentage-based fundraising_total_pence and
    host_share_total_pence calcs) to derive from
    sum(orders.total_pence). Commercial policy locked:
    fundraising and host-share percentages compute on
    net-of-discount revenue, not gross GMV — vendors retain a
    share of what they actually earn.
    (3) Bundle-revenue-loss. order_items rows for bundles have
    price_pence = NULL (the price lives on the bundle, not the
    line); qty * NULL = NULL and silently drops out of the sum.
    Any per-order revenue computed from order_items.price_pence
    systematically under-counts bundle sales. Verified:
    switching v_hearth_drop_stats.revenue_pence to
    sum(orders.total_pence) moved Healthy Habits Cafe's 30-day
    revenue UP by ~£6.80 net of known discounts — that's bundle
    revenue that had been invisible.
    The unified rule: any revenue-bearing view, Edge Function,
    or select expression must derive per-order revenue from
    orders.total_pence (the post-discount, bundle-inclusive
    amount create-order wrote to the row) or explicitly net and
    bundle-correct in another way. Per-item revenue
    (v_order_item_enriched.revenue_pence,
    v_item_sales.revenue_pence) is deliberately left gross and
    bundle-blind for now — line-level "what did this product
    sell for at list price" is a defensible product-performance
    number; revisit only if a per-item net or bundle-inclusive
    reporting need emerges. Binds the REVOKE capstone and all
    future view authoring.

56. **Revenue and scope-source correctness (composite learning, 5
    facets).** Any code reading or computing per-order revenue,
    customer counts, or vendor-scoped aggregates must respect:
    (a) read `orders.total_pence` for per-order revenue, never
    recompute from `order_items` — joining items + selections
    produces Cartesian fan-out;
    (b) use NET-of-discount semantics in views the operator UI
    consumes (`drop_gmv_pence`, `fundraising_total_pence`,
    `host_share_total_pence` subtract `discount_pence`
    proportionally);
    (c) include bundle parents in item-sales views via LEFT JOIN
    through `parent_item_id` with `COALESCE` so bundle headers
    surface;
    (d) match view column names exactly in client code —
    `drop_gmv_pence` is the canonical revenue field on
    `v_drop_summary`, NOT `total_revenue_pence`;
    (e) `orders` has no `vendor_id` column — vendor scope on
    `orders` derives via `drop_id IN (vendor's drops)`, mirroring
    the `get-customers-workspace` two-step pattern.
    Symptoms across all five are silent: zero revenue, zero
    counts, undefined flags, no errors. Corollary for future
    migrations: when moving direct PostgREST reads into an Edge
    Function, validate column references against
    `information_schema` before copying the pattern — original
    code might already be silently broken.

57. **Handover documents drift from code.** Any handover assertion
    about file locations, file counts, schema column names, or enum
    values must be verified by grep against the actual repo or by
    SQL against the actual database before being treated as a build
    instruction. The T5-B26 closure caught a three-file scope when
    the handover named two — Claude Code surfaced the discrepancy
    via grep before making changes, and the scope was corrected in
    conversation. The same prompt would have shipped broken if the
    handover had been trusted verbatim.

58. **Extending the recommendation engine to surface a new
    archetype-driven nudge means extending the engine's input signal
    contract too — and a direct PostgREST query is never the way to
    populate that signal from an RLS-locked table.** Operator pages
    cannot count RLS-locked tables (`customer_relationships`, etc.)
    via direct PostgREST because the publishable-key auth-attach
    pattern never delivers the user JWT (operational learnings #12,
    #14, #52). The T-intelligence-engine-import-recommendation build
    initially proposed a direct count query that would have silently
    returned 0 in production, making the import recommendation fire
    indefinitely (the suppression condition `importedCount >= 5`
    could never be met). Three correct paths: (a) read from in-memory
    state if the data is already loaded server-side via JWT-authed EFs
    (home.html, customers.html derive `importedCount` from
    `state.customers` / `state.allCustomers` filtered by
    `source === 'import'`); (b) extend an existing `get-vendor-*` EF
    with an optional filter parameter (insights.html →
    `get-vendor-customer-count` widened with an optional `source`
    filter); (c) build a new dedicated EF. Direct PostgREST counts on
    RLS-locked tables are never the right path. (Learned from
    T-intelligence-engine-import-recommendation, 2026-05-23.)

59. **`overflow:hidden` on `.boardCol` silently clips
    absolutely-positioned children.** When overlaying an element on a
    container that has `overflow:hidden`, the child must use
    `position:absolute` (with the parent `position:relative`) plus a
    `z-index` to sit on top of sibling content — appending it as a
    normal flow child instead expands the container's height. This is
    how the Ready-column delivery bar overlays the bottom of the
    column without changing its height. (Learned from T-sb-4,
    2026-05-26.)

60. **`align-items:start` on a grid container makes columns size to
    their own content, not the tallest sibling.** For equal-height
    Kanban columns, override with `align-items:stretch`. The Service
    Board's `.boardGrid` inherited `align-items:start` from hearth.css,
    which left the Ready column shorter than its siblings whenever its
    cards didn't fill the body height; `align-items:stretch` is the
    correct, permanent fix. (Learned from T-sb-4, 2026-05-26.)

61. **`.boardColFooter` is a fixed 12px decorative strip — never use
    it as a button container.** Appending an action button to the
    footer makes it grow beyond its decorative 12px and pushes the
    column taller than its siblings. Use a separate element positioned
    with `position:absolute` (see learning #59) instead. (Learned from
    T-sb-4, 2026-05-26.)

62. **`state.dropOrders` (the base `orders` table) is the reliable
    source for `fulfilment_mode` and `delivery_address` — the
    `v_drop_orders_summary` view does not reliably expose these
    fields.** Code that needs per-order fulfilment mode or delivery
    address on the Service Board must read from `state.dropOrders`, not
    the summary view. (Learned from T-sb-4, 2026-05-26.)

63. **CSS `zoom` (not `transform: scale`) is the correct approach for
    scaling a fixed-dimension HTML element to fit a smaller viewport
    while preserving layout footprint.** `transform: scale` shrinks the
    rendered element but leaves its original footprint in the layout
    (leaving overflow/scroll gaps), whereas `zoom` rescales the box
    itself so the layout footprint shrinks with it. Used in
    activation-poster.html. (Learned from the Activation build,
    2026-05-29.)

64. **Activation Card 2's touchpoint key is `'tuesday_host'`, not
    `'tuesday_host_whatsapp'`.** Confirmed from source. Code that logs
    or reads Card 2 progress must use the bare `'tuesday_host'` key.
    (Learned from the Activation build, 2026-05-29.)

65. **Activation Card 7 (order ready) is a passive auto-card with no
    touchpoint key.** It never logs and must be excluded from the
    progress-countable set — `getDropProfile()` keeps it in the card
    list but `getDropProgress()` does not count it. (Learned from the
    Activation build, 2026-05-29.)

66. **Neighbourhood drops do not have hosts by design.** Surfacing a
    "no host" warning on a neighbourhood drop incorrectly suggests adding
    one, which violates the model (neighbourhood + host = community drop).
    Always gate host-related signals on `drop_type !== 'neighbourhood'`.
    (Learned from the Review pane promotion plan build, 2026-05-30.)

67. **`create-drop` null-strips its payload (drops null/undefined fields)
    so the DB defaults apply** (a whitelisted null would override the DB
    default — this null-strip is intentional, see `create-drop/index.ts`).
    Consequence: passing `delivery_start: null` (or other timing fields)
    does not create a blank-timing draft — the DB backfills its default,
    and delivery_start's DB default is now(), which leaves `opens_at`
    null = open-immediately. To control a new or duplicated drop's timing, set
    explicit values (as `createNewDrop` and now `duplicateDrop` do), never
    null. Surfaced via T-A1-dup-gap (#369).

68. **Drop status lifecycle is real and automatic now.** `pg_cron` is
    enabled; the job `'advance-drop-lifecycle'` runs
    `advance_drop_lifecycle()` every 15 minutes. Two transitions, both
    idempotent and only ever touching `live`/`closed` rows:
    `status → 'completed'` where `status IN ('live','closed')` AND
    `delivery_end < now()`; `status → 'closed'` where `status = 'live'`
    AND `closes_at < now()` AND (`delivery_end IS NULL` OR
    `delivery_end >= now()`). The function never touches `draft`,
    `scheduled`, `cancelled`, or `archived` rows. (T-A6-lifecycle,
    2026-06-15.)

69. **Drop status values in use: `draft`, `live`, `closed`, `completed`,
    `cancelled`, `archived`.** `'scheduled'` is permitted by the CHECK
    constraint but nothing writes it yet — the `draft→scheduled→live`
    front half was deferred (see T-A6-lifecycle-scheduled-state).
    `'published'` and `'open'` were never constraint-valid and remain
    dead aliases — do not write them. (T-A6-lifecycle, 2026-06-15.)

70. **Anon visibility of finished drops requires BOTH the view AND the
    RLS policy to scope to the same status set.** `order.html` reads the
    `drops` table directly (anon) as well as via `v_drop_public`, so
    `v_drop_public` AND the `"Drops: anon select public statuses"` RLS
    policy must each scope to `('live','closed','completed')`. Omitting
    `closed`/`completed` from either one breaks finished drops' order
    pages for anon callers. Both now scope to the full set (migration
    `20260612055452_drop_lifecycle_access.sql`). (T-A6-lifecycle,
    2026-06-15.)

71. **Customer ordering window stays time-gated in `order.html`,
    independent of stored status.** `getOrderWindowState` derives the
    open/closed checkout state from `opens_at` / `closes_at`, not from
    the drop's stored `status`. The lifecycle engine's stored status
    drives vendor surfaces and public visibility only — never checkout.
    A drop's order page opens and closes on its timing fields regardless
    of whether the cron job has flipped its status yet. (T-A6-lifecycle,
    2026-06-15.)

72. **`transition-drop-status` source-status sets.**
    `CANCEL_SOURCE_STATUSES = {live, closed}` — a `completed` drop is NOT
    cancellable; `ARCHIVE_SOURCE_STATUSES` includes `closed` and
    `completed`. Extended in PR #372 so the new lifecycle-produced
    `closed`/`completed` states have sensible operator exits.
    (T-A6-lifecycle, 2026-06-15.)

73. **Pass A seed corrections (record where the original audit seed was
    wrong).** Two seeds from Build Coherence Audit Pass A proved wrong
    against live source and should not be built against: (a) the A1 seed
    "the Timing pane defaults `opens_at` to immediate" was WRONG —
    `createNewDrop` defaults `opens_at` to `delivery_start − 24h`, and
    immediate open is an explicit toggle only (also captured in learning
    #67 and the T-A1-dup-gap / T-drop-anticipation-window-default
    closures); (b) T5-B44's UI re-derivation half
    (`deriveTimingFromDelivery`) does NOT reproduce against current
    source — the remaining T5-B44 work is the publish-time guard, not the
    re-derivation (already noted in T5-B44's Pass A / A4 addendum).
    (T-A6-lifecycle, 2026-06-15.)

74. **Capacity display and enforcement are in parity.**
    `v_drop_capacity_usage` (which feeds `v_drop_summary` → `v_drop_public`,
    the display path) and the `create-order` EF both compute consumed
    capacity as `SUM(orders.pizzas)` over orders WHERE
    `status <> 'cancelled'` — so `pending_payment` IS counted in both
    (capacity is reserved during the Stripe Checkout window). There is no
    display-vs-enforcement divergence: the chip a customer sees and the
    server-side close-on-full check are computed the same way. (Pass B /
    B4, verified 2026-06-15.)

75. **Capacity enforcement is driver-aware.** `create-order` Step 7.5
    counts weighted category units when `capacity_driver = 'by_category'`
    (an item contributes only if its `category_id ∈ capacity_categories`,
    and then `capacity_weight × qty`) and a flat 1 per order when
    `capacity_driver = 'by_order'`. Client-supplied capacity totals in the
    payload are ignored — the server recomputes from row data and is
    authoritative. (Pass B / B3.)

76. **Pass B verdict: B1/B2/B3/B4 clean; only B5 is a real finding.**
    Honest scarcity (B1), server-side close-on-full that can't be bypassed
    (B2), category-level capacity counting (B3), and real-data provenance
    of displayed counts via definer views rather than silent-zero anon
    counts (B4) all confirmed clean. The single real finding is B5 —
    delivery rendered as a "Free" basket line item rather than being
    structurally absent (T-B5-delivery-not-a-line-item). (Pass B,
    2026-06-15.)

77. **Pass C verdict: auth architecture is sound.** All authenticated
    mutations on served pages route through Edge Functions — there are no
    direct PostgREST writes on any tracked/served page; the only
    direct-write file, `onboarding_backup.html`, is gitignored + untracked
    and cannot deploy. All 57 EFs are `verify_jwt = false` at the gateway
    with in-function `auth.getUser()`; the 6 without `getUser()` use
    correct alternative auth — `create-order` (public customer placement),
    `cancel-order` / `fetch-order` (matched-pair order_id + session_id),
    `host-view-summary` (per-drop host token), `send-order-confirmation`
    (internal shared secret), `stripe-webhook` (Stripe signature).
    `orders` has no `vendor_id` — every `orders` read scopes via
    `drop_id IN (vendor's drops)`; and the `send-*` EFs bind a
    client-supplied `vendor_id` to `auth_user_id = user.id` (403 otherwise).
    (Pass C, 2026-06-15.)

78. **Admin gating is data-driven and multi-admin is live.** Access is
    gated by the `admin-verify` EF, which checks the `admins` table on
    `auth_user_id` + `is_active` — there is no hardcoded `ADMIN_UID`
    (retired under T5-B26). Ed and Robin both have active `admins` rows,
    so multi-admin is in production, not just supported. (Pass C / C6,
    2026-06-15.)

79. **Host-facing surfaces isolate their Supabase client.**
    `host-poster.html` now creates its client with
    `{ auth: { persistSession: false, autoRefreshToken: false } }` like
    `host-view.html` (#376), so a host-facing page can never inherit a
    logged-in vendor's persisted session on the shared origin. Any future
    host-facing (no-login, token-authed) surface must do the same.
    (Pass C / C4, 2026-06-15.)

80. **The activation host-origin progress exception is `host_link` +
    `shared`, NOT `thursday_host_link`.** The single host-origin event
    that counts toward vendor activation progress is the one with
    touchpoint `host_link` and action `shared` (the Card 5 host link-share
    — the #332 fix); every other `actor === 'host'` event is excluded from
    vendor card/progress state. Correct any doc that references a
    day-of-week form (`thursday_host_link`) for THIS specific exception —
    that string is not what the filter keys on. (Pass C / C5, 2026-06-15.)

81. **`v_drop_summary` re-derives `'closed'` in-view and can now diverge
    from stored status.** A CASE in the view flips a `'live'` drop to
    `'closed'` when `closes_at < now()`. This predates the `pg_cron`
    lifecycle engine and is now redundant: the in-view label only knows
    `'closed'` (not `'completed'`), ignores `delivery_end`, and leads the
    engine by up to 15 minutes — so a view reader and a stored-status
    reader can disagree. Tracked as T-A6-vsummary-status-single-source
    (collapse the view to project `d.status` directly, audit-first).
    Customer ordering closure does NOT depend on this label — it is
    enforced server-side at checkout. (Pass C / C3 spillover, 2026-06-15.)

82. **Pass D verdict: the activation/comms architecture is coherent with
    strategy.** Reachability holds — the vendor's host cards (Card 2
    `host_heads_up`, Card 5 `host_link`) reach the HOST (email the share
    page / copy the link / nudge), and the host is the one who reaches
    their community; no vendor CTA posts into a host-owned audience.
    Closed drops drop all public Instagram cards (1/6/8) and keep only the
    host-handoff (Card 5) plus the vendor's OWN email list (Cards 3/9), so
    the vendor's closed-drop screen is handoff + monitor, not a doing
    surface. Host→community messages are copy-paste templates sent BY the
    host (`host-view.html` STEP1/STEP2 templates, in the host's own
    voice); the ONLY platform auto-send is platform→host
    (`send-host-activation-email`, single recipient = the host's own
    `contact_email`), never into the host's community. (Pass D, 2026-06-15.)

83. **`reveal_line` was RELOCATED from Drop Studio to Activation's Card 4
    poster-hook field — not removed.** It is written by
    `#act-posterHookInput` in activation.html and is the live source for
    activation-poster.html's hero line (also auto-generated once when
    blank). The old "activation-poster reads stale `reveal_line`"
    suspicion is itself stale. But the column's documented T5-25 purpose
    (deferred caption-generator seed) now diverges from this actual use:
    when the caption generator is built it must use its own column, not
    reveal_line. Tracked as T-D4-reveal-line-semantics. (Pass D / D4,
    2026-06-15.)

84. **Pass E verdict: voice/brand is on-message.** The banned-word
    (promotion, deal), fake-urgency ("Don't hang about."), US-spelling
    ("Customize") and stale T8-3-label (Menu Library / Brand Hearth)
    fixes shipped in #379, and the Activation accent was migrated to
    Hearthfire in #380. Residual open items are small/post-launch: the
    `reviewPromotionPlan` internal rename, the T8-3-sub1 label remainder
    (legal copy, legacy dev tool, icon glyphs), and the Activation
    rgba-tint convergence. (Pass E, 2026-06-16.)

85. **E4 DECISION — Hearthfire `#c4511a` (token `var(--h-fire)`) is the
    canonical Hearth accent platform-wide.** `#8B6B3F` is RETIRED as a
    Hearth primary and RETAINED ONLY as the `--vendor-brand-primary`
    fallback (the neutral default when a vendor has set no colour). It
    must NEVER be swapped to Hearthfire in that fallback role — doing so
    would render a colourless vendor's customer-facing surface/poster in
    Hearth's own accent (brand-bleed — the D5 concern). The brand
    playbook is now committed at `Hearth_Brand_Playbook.md` with the
    accent corrected to `#C4511A` / `--h-fire` as canonical (the earlier
    external playbook that still named `#8B6B3F` primary is superseded).
    Finishing the Activation rgba-tint convergence is tracked as
    T-E4-activation-rgba-tints. (Pass E / E4, 2026-06-16; playbook
    committed 2026-07-15.)

86. **Build Coherence Audit COMPLETE — all five passes (A–E) run,
    triaged, and fixed or logged.** Net: one real structural gap found —
    the unfinished drop-status lifecycle, built in Pass A
    (T-A6-lifecycle, the `pg_cron` engine). The auth foundation (Pass C)
    and the activation/comms architecture (Pass D) are both sound. Every
    other finding was a small copy/brand item, now shipped or backlogged.
    Pass seeds repeatedly proved stale against live source (A1 timing,
    D4 reveal_line) — always verify the seed before building. (Build
    Coherence Audit, complete 2026-06-16.)

87. **Comms engine (T5-11) spine: Trigger → Audience → Template →
    Dispatch → Log.** The trigger is an external GitHub Actions cron
    pinger, NOT `pg_net` — the database stays sealed (no DB outbound
    HTTP). The dispatcher EF self-discovers its work (scans
    `drop_signals` against currently-open drops) and dedupes via
    `comms_log.dedupe_key` (`INSERT ... ON CONFLICT DO NOTHING` claim),
    so the pinger is "dumb" and late/overlapping runs are harmless. New
    touchpoints reuse this spine: new audience query + deterministic
    in-voice template, same dispatch + log. (T5-11 slice 1, 2026-06-19.)

88. **`comms_log` is the touchpoint-agnostic send ledger.**
    `dedupe_key` UNIQUE = `'{touchpoint}:{drop}:{recipient}'`;
    `customer_id` is NULLABLE (host/vendor-directed touchpoints have no
    customer — `recipient` is the universal target); RLS on, no policies
    (service-role only). (T5-11 slice 1, 2026-06-19.)

89. **Cron/automated EF auth = the internal shared-secret pattern**
    (`x-internal-secret` header vs `INTERNAL_FUNCTION_SECRET` env),
    the same pattern as `stripe-webhook` → `send-order-confirmation`
    (operational learning #47). `verify_jwt = false` at the gateway plus
    an in-function compare — cron callers can't use JWT/`getUser()`.
    (T5-11 slice 1, 2026-06-19.)

90. **Create tables via a committed migration, never ad-hoc SQL run in
    the editor.** `comms_log` was created both via the SQL editor AND
    independently by a Claude Code migration → two divergent definitions;
    it cost a drop-and-reapply reconciliation. (T5-11 slice 1,
    2026-06-19.)

91. **Secrets generated inline must be saved at creation.** A secret
    generated inline (e.g. `INTERNAL_FUNCTION_SECRET` via
    `openssl rand -hex 32`) must be saved to the password manager (and a
    gitignored `supabase/.env`) the moment it is created. The live value
    was unrecoverable and had to be reset, then the three consumers
    redeployed (`stripe-webhook`, `send-order-confirmation`,
    `dispatch-interest-open`). (T5-11 slice 1, 2026-06-19.)

92. **Migration-history drift repaired 2026-06-19.** Four
    shipped-but-unrecorded migrations were marked applied via
    `supabase migration repair --status applied 20260505193331
    20260612055452 20260612061555 20260618120000`. If `db push` offers
    to re-run shipped migrations, repair — don't push. (T5-11 slice 1,
    2026-06-19.)

93. **LOAD-BEARING — the server is the sole pricing authority; the client
    is NEVER trusted for any price.** `create-order` re-derives every
    charged amount server-side from the database and hard-stops on any
    mismatch with the client-declared total. The base unit price is
    `drop_menu_items.price_override_pence ?? products.price_pence` (the
    drop's override wins, else catalogue list price); each chosen product
    option's delta is re-read from `product_options.price_delta_pence` and
    folded into `serverUnitPrice[i]` BEFORE the subtotal is summed; the
    client's declared `unit_price_pence` and the display-only
    `option_selections[].price_delta_pence` are ignored entirely. Step 7
    compares the server-computed total against `payload.totals.total_pence`
    and returns a 400 ("Total does not match basket") on any divergence —
    so an under-declared total cannot buy an upgrade, and a tampered line
    price cannot discount an order. Any future money-path audit MUST assert
    this explicitly (verified end-to-end for options on 2026-07-04: honest
    Steak/Salmon accepted at the true total, tamper rejected, bogus client
    delta ignored). Refs: PR #427 (pricing authority) + PR #432 (option
    deltas). See also learning #55 (`orders.total_pence` is the only source
    of truth for what was charged).

94. **LOAD-BEARING — hard-reset the local tree to remote before every
    `supabase functions deploy`.** Run `git fetch origin && git reset
    --hard origin/<branch>` immediately before deploying so the code you
    ship is the branch's remote HEAD, never a stale local working tree.
    `supabase functions deploy` uploads whatever is on disk — it does not
    check that disk matches the branch — so a drifted local checkout
    silently deploys OLD code while the CLI reports success. This caused a
    real production incident: an option-blind `create-order` was deployed
    from a stale local checkout during the product-options rollout and
    appeared to work because the test order's total coincidentally matched
    the (delta-less) server computation — the drift only surfaced when a
    differently-priced option was tried. Mirrors critical rule #10 (always
    start a session from `git reset --hard origin/main`) and rule #15
    (deploy-before-merge); this is the deploy-time corollary. Verify with
    `git status` (clean) and `git log origin/<branch> --oneline -1`
    (matches HEAD) before the deploy command.

Insights / intelligence-layer invariants:
- The unit of intelligence is the drop, series, vendor, or geography — never the individual
  reorder. Any signal whose purpose is to push a named customer to buy on a predicted date is
  the aggregator reflex and is out of model.
- Intelligence degrades honestly. Below the data threshold, say "not enough data yet". A
  fabricated demand or scarcity signal is manufactured urgency — a brand violation, not a UX
  gap. Honest empty states are on-brand; confident wrong ones are not.

## Edge Function secrets

Required Supabase Edge Function secrets (set via `supabase secrets set
KEY=value` and propagated to running instances on the next deploy):

- `STRIPE_SECRET_KEY` — Stripe Connect platform key (test/sandbox at
  launch). Used by `create-order`, `cancel-order`, `stripe-webhook`,
  `create-stripe-connect-link`, `check-stripe-connect-status`. See
  the "Stripe Connect Express (T3-8)" section below.
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret. Used by
  `stripe-webhook` to verify event authenticity.
- `SUPABASE_SERVICE_ROLE_KEY` — service-role JWT for bypassing RLS
  in privileged writes. Used by every Edge Function that writes to
  a vendor-scoped table.
- `RESEND_API_KEY` — Resend HTTP API key for transactional email.
  Used by `send-order-confirmation` (T5-11-minimum) and any future
  email-triggered Edge Functions per operational learning #46.
- `INTERNAL_FUNCTION_SECRET` — shared secret for inter-Edge-Function
  authentication per operational learning #47. Used by
  `stripe-webhook` (caller) and `send-order-confirmation` (callee)
  today, and by any future internal-only function pair.
  Rotate by running `supabase secrets set
  INTERNAL_FUNCTION_SECRET=$(openssl rand -hex 32)` and
  **immediately** redeploying every function that reads the secret
  on either side of the call (caller and callee) so the new value
  propagates to running instances. A redeploy of only one side
  breaks the call until the other side redeploys.

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

## Platform admin MVP

Platform-level admin surface for Ed (and future business partners),
shipped 2026-05-21 across the platform-admin workstream. URL-only
access read-only views of every vendor on the platform, with
drill-down into a vendor's drops and orders. Not linked from any nav
— bookmarked or typed directly. Retires the hardcoded ADMIN_UID
across admin.html, invite-vendor, and create-vendor (T5-B26 closed)
and fulfils the T7-1 cockpit MVP and T7-14 multi-admin enabler.

**New table:**

- `admins` — `id` uuid PK, `auth_user_id` uuid UNIQUE FK to
  `auth.users`, `email` text, `granted_at` timestamptz, `is_active`
  boolean. RLS enabled with no policies — only `service_role` reads,
  so membership is authoritative. Indexed on `auth_user_id WHERE
  is_active = true`. To add a new admin: Supabase Auth invite +
  `INSERT INTO admins (auth_user_id, email)`. No frontend write path.

**New Edge Functions** (all `verify_jwt = false`, all use the
canonical admin auth check pattern documented below):

- `admin-verify` — identity check. Returns
  `{ isAdmin, email, authUserId }`. Used by every admin page on load
  to gate access.
- `admin-list-vendors` — full vendor list with onboarding and Stripe
  state, drop count, last activity. Backs platform-admin.html.
- `admin-get-vendor` — single vendor row by id. Backs the header of
  platform-admin-vendor.html.
- `admin-list-vendor-drops` — drops for a vendor with order rollup
  and revenue. Backs the drops table on platform-admin-vendor.html.
- `admin-list-drop-orders` — orders for a drop with customer
  details. Backs the orders table on platform-admin-vendor.html.

**New database views** (service_role read only — `anon` has no SELECT
grant; admin Edge Functions read these via a service-role client):

- `v_admin_vendor_list` — vendors joined with drop count and
  MAX(drops.created_at) as last activity.
- `v_admin_vendor_drops` — drops with order count, status breakdown,
  total_pence.
- `v_admin_drop_orders` — orders for the drop drill-down.

**New pages** (URL-only access; not linked from any nav):

- `platform-admin.html` — vendor list. Gated by `admin-verify`.
- `platform-admin-vendor.html?id=<vendor_uuid>` — vendor drill-down:
  header, drops table, orders table. Same gate.

**Canonical admin EF auth check pattern.** Same shape as the
canonical vendor EF auth check (operational learning #16:
`anonClient.auth.getUser()` then service-role `.maybeSingle()` on the
owning table) but checks the `admins` table instead of `vendors`:

```ts
const { data: { user } } = await anonClient.auth.getUser(jwt);
if (!user) return jsonResponse({ error: 'unauthenticated' }, 401);

const { data: admin } = await serviceClient
  .from('admins')
  .select('id')
  .eq('auth_user_id', user.id)
  .eq('is_active', true)
  .maybeSingle();

if (!admin) return jsonResponse({ error: 'not_authorised' }, 403);
```

Used by all five admin Edge Functions and by the in-page gates on
platform-admin.html, platform-admin-vendor.html, and admin.html
(which calls `admin-verify` rather than checking the admins table
directly from the page). Any new admin Edge Function or admin page
MUST use this pattern — no frontend UID check is sufficient on its
own.

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
  Drop Studio, Offer, Brand Hearth, Insights
  (nav canon is "Offer", not "Menu Library" — Hearth_Brand_Playbook.md §7)
- Avoid: Campaign, Listing, Inventory, SKU, Funnel, Promotion, Deal
- **Outbound, customer-facing copy never names "Hearth".** Any text a
  host or vendor sends to people outside the platform (shareable
  messages, social posts, emails, posters, SMS) must foreground the
  vendor and the food, never the platform — Hearth is infrastructure,
  not the brand the community engages with. Hearth stays invisible in
  shared/outbound copy. The platform's own in-app UI chrome (nav,
  eyebrow labels like "A Hearth drop", "Powered by Hearth"
  attribution) may still say Hearth — the rule applies only to copy
  that leaves the platform. Reference: the host-view "Share with your
  community" channel templates (host-view.html) name the food and the
  host, not Hearth.

**Product decisions captured during build:**

- **Vendor tagline and about paragraph do not render on the customer
  order page.** Customers arriving at order.html have already clicked
  through a vendor- or host-specific link, so they know what vendor
  they're ordering from. Tagline does discovery work; Hearth
  deliberately doesn't have browsing. Vendor brand copy is a latent
  asset that surfaces in promotion materials (T5-25), host outreach
  (T5-26), multi-vendor events (T5-23), and host platform
  participation (T5-27) — none of which are live yet. Captured 6 May
  2026 during T4-31b design conversation.

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

Customer checkout is wired via the create-order Edge Function:
order.html invokes it on Pay, the function atomically writes orders +
order_items + order_item_selections + customers +
customer_relationships under a service-role client, creates a Stripe
Connect destination charge with the vendor's stripe_account_id as
destination, and returns a Checkout Session URL. Order starts at
status='pending_payment' and capacity is reserved during the
1800-second pending window. stripe-webhook handles session lifecycle
events (completed/expired/async_payment_failed); fetch-order powers
order-confirmation.html via matched-pair authorization (order_id +
session_id); cancel-order frees capacity on customer return from
Stripe cancel. See the "Production mutation/read status" section for
current state of every read/write path, and the "Stripe Connect
Express (T3-8)" section for the vendor onboarding scaffold.

## View security model

The view layer is the read boundary for both anonymous and
authenticated callers. Two patterns are used deliberately:

- **Public-facing views are column-safe definer views.**
  `v_drop_public` is live: 29 customer-safe columns,
  `WHERE status IN ('live','scheduled','completed')`, granted to
  `anon` and `authenticated`. `v_vendor_public` EXISTS — a 23-column
  PII-safe branding view (predates T5-A3); `order.html` reuses it for
  its anon vendor read as of #413, selecting 11 columns by name.
  `v_host_public` EXISTS (`id`, `name`, `host_type` only) — created by
  #413 and read by `order.html`'s anon host path, closing the
  customer-facing host-PII leak. Both shipped as T5-A3 Priority 2
  Half A. **`vendors_select_all` is now DROPPED — T5-A3 Priority 2
  Half B closed (#415, 2026-06-29).** The four session-identity reads
  (`hearth-vendor.js` `resolveVendor()` boot read, `activation-poster.html`,
  `auth-callback.html`, `set-password.html`) all route through the new
  JWT-authed `get-current-vendor` Edge Function (in-function
  `auth.getUser()`, service-role read of the caller's own `vendors` row
  by `auth_user_id`). No anon SELECT policy remains on `vendors` —
  confirmed via `pg_policy`, only `Vendors: admin insert`,
  `Vendors: authenticated owner select` (inert defence-in-depth), and
  `Vendors: authenticated owner update` survive. `stripe_account_id`,
  `auth_user_id`, contact fields and onboarding answers are off the anon
  path. The customer order page still renders full vendor branding in an
  anon session because `v_vendor_public` is a definer view, unaffected
  by the base-table policy drop.
- **All 34 operator `v_*` views are `security_invoker = on`**,
  scoped via the existing authenticated-owner base-table RLS
  (`vendor_id IN (SELECT id FROM vendors WHERE auth_user_id =
  auth.uid())`). Applied bottom-up and verified tier by tier
  (see operational learnings #48 and #49 for the dependency-order
  rule).
- **`v_drop_summary` remains a definer view (held) and is
  currently read by the anon role from operator pages.** This
  is structurally necessary under the auth-attach bug — operator
  pages are not authenticated at the PostgREST layer (see
  operational learning #52). The previously planned
  `security_invoker` flip is ABANDONED — it would silently
  zero-out every operator page. Closing the cross-vendor
  exposure requires migrating operator reads to JWT-authenticated
  Edge Functions and then `REVOKE SELECT ON v_drop_summary FROM
  anon`. The narrow T5-A14 (`v_drop_summary`-only) ticket is
  SUBSUMED by the wider **operator-read-auth** track — see
  operational learning #53 and the BACKLOG.md operator-read-auth
  entry. Same pattern, same EFs, same capstone.
- **`drop_capacity`** is the other still-definer view derived
  from `orders`. No known frontend reader. Open loose end — to
  be assessed (drop / revoke from anon / migrate) as part of
  the operator-read-auth capstone.
- **`order.html` anonymous drop reads use `v_drop_public`**
  (commit 8d4c63d). `host-view.html` no longer reads
  `v_drop_summary` or `drop_host_tokens` directly — both go
  through the new token-authenticated `host-view-summary` Edge
  Function (T5-A3 host-view sub-track, closed 2026-05-19,
  verified end-to-end on production).
- **Host-view sub-track Edge Functions (closed 2026-05-19):**
  - `host-view-summary` — token-authenticated (slug + `&t=`
    token in query string). Returns an 18-field minimal host
    projection. NEVER returns `drop_gmv_pence` or raw
    host-share mechanics; `host_share_descriptor` is built
    server-side from the underlying mechanics. Returns a
    uniform `403 {"error":"not_authorised"}` on any failure
    (bad token, wrong slug, missing drop) so anonymous
    callers cannot enumerate drops.
  - `get-drop-host-token` — JWT-authenticated operator EF
    that mirrors `get-drop`'s auth pattern. Verifies the
    caller owns the drop's vendor, then returns
    `{ host_access_token }`. Used by Drop Studio's "Copy
    host link" action — direct PostgREST against
    `drop_host_tokens` was returning empty rows under the
    anon role (RLS rejection), so the token is now fetched
    through this EF and appended to the host-view URL.
- **Anon `vendors` read — now via `v_vendor_public`.** `order.html`'s
  anonymous `vendors` read was first narrowed to safe display columns
  only (commits 390985e, 65d66c1), then re-pointed onto the column-safe
  `v_vendor_public` definer view in #413. With `vendors_select_all`
  dropped (#415), there is no longer any anon SELECT path against the
  base `vendors` table.
- **Select-narrowing validation rule.** Every explicit column
  list shipped under the T5-A3 / anon-revoke / operator-read-auth
  narrowing must be cross-checked against
  `information_schema.columns` on the live DB before merge — see
  operational learning #54 (regression: commit 69b1651 took
  `order.html?drop=…` hard-down for 24h with two phantom
  columns).
- **orders.total_pence is the only source of truth for what was
  charged.** Three distinct correctness defects collapse into one
  rule (operational learning #55): Cartesian fan-out when SUM()ing
  across multiple un-collapsed child LEFT JOINs; discount-blindness
  when recomputing revenue from `order_items.price_pence` (ignores
  `orders.discount_pence`); and bundle-revenue-loss because bundle
  line `price_pence` is NULL (`qty * NULL` drops silently from the
  sum). The unified rule: derive per-order revenue from
  `orders.total_pence` (post-discount, bundle-inclusive) or
  explicitly net and bundle-correct in another way. The
  v_hearth_drop_stats + v_drop_fundraising_summary DDL rewrites
  (2026-05-20) closed the GMV/fundraising family; per-item revenue
  is deliberately left gross. Binds the REVOKE capstone and all
  future view authoring.
- **Operator-read-auth track closed 20 May 2026.**
  `v_drop_summary` and `drop_capacity` REVOKEd from `anon`. All
  vendor-scoped reads now flow through JWT-authed Edge Functions.
  Six EFs in the family: `get-drop`, `get-home-dashboard`,
  `get-insights`, `get-customers-workspace`,
  `get-vendor-customer-count`, `get-demand-preview`.

## Production mutation/read status

Snapshot of which read/write paths are working in production and which are known broken. Update whenever a PR confirms or breaks a path. Last updated 2026-05-19 after T5-A3 host-view sub-track closed — `host-view.html` and Drop Studio's host-link builder now route through token-authenticated and JWT-authenticated Edge Functions respectively.

- Customer order placement (orders, order_items, order_item_selections, customers, customer_relationships) — WORKING via `create-order` Edge Function. Atomic write of all five tables, Stripe Connect destination charge created, order starts at `status='pending_payment'` and flips to `'placed'` on webhook receipt. Capacity is reserved during the pending_payment window (Stripe expires_at = 1800s).
- Stripe webhook handling — WORKING via `stripe-webhook` Edge Function. Handles `checkout.session.completed` (→ placed/paid), `checkout.session.expired` (→ cancelled/expired), `checkout.session.async_payment_failed` (→ cancelled/failed). Endpoint configured at https://tvqhhjvumgumyetvpgid.supabase.co/functions/v1/stripe-webhook (Stripe Dashboard endpoint name: "brilliant-rhythm"). After flipping the order to placed/paid the webhook invokes `send-order-confirmation` (T5-11-minimum) via shared-secret auth; email send is wrapped in try/catch and any failure is logged but never propagated to Stripe so Resend outages cannot cause webhook retries that would re-place the order.
- Order confirmation email (order_confirmed transactional trigger) — WORKING via `send-order-confirmation` Edge Function as of 2026-05-16 (PR #266). Invoked by `stripe-webhook` after `checkout.session.completed`. Calls Resend HTTP API directly with `RESEND_API_KEY`; inter-function call authenticated via `INTERNAL_FUNCTION_SECRET` in the `X-Internal-Secret` header (`verify_jwt = false` at gateway). First application-level Resend integration in production — see operational learnings #46 and #47 for the pattern. Other T5-11 triggers (order_ready automated SMS, drop_announced, drop_reminder, drop_early_access, post_drop_thank_you, the `comms_log` table) remain backlog per pre-launch scope decision.
- Order read on confirmation page — WORKING via `fetch-order` Edge Function. Anonymous, matched-pair authorization (order_id + session_id). Returns order, items (including bundle line selections), drop, vendor, host. Customer-visible fields only — no email, phone, customer_id, contact_opt_in, or platform_fee_pence in response.
- Order cancel-on-return — WORKING via `cancel-order` Edge Function. Idempotent, only flips pending_payment → cancelled. Frees capacity immediately when the customer hits Cancel on Stripe Checkout rather than waiting for Stripe's 30-minute session expiry. Does NOT call Stripe — relies on Stripe's own session expiry to clean up the unused Checkout session.
- Service Board order status transitions (`orders.status` UPDATE and `order_status_events` INSERT) — WORKING via `transition-order-status` Edge Function as of 2026-05-15. Anonymous gateway (`verify_jwt = false`), server-side state machine enforcing adjacent-only transitions in `placed → confirmed → preparing → ready → delivered` (forward and backward by one step only), optimistic-concurrency guard via `.eq("status", currentStatus)` returning 409 on concurrent writes, audit event written server-side as `actor: 'service_board'`, `actor_type: 'operator'`. Previously broken silently — direct PATCH from anonymous service-board.html returned 204 with zero rows affected because the `orders` RLS policies require `auth.uid()` to match `vendors.auth_user_id`. The bug was undiscoverable by routine testing because the optimistic UI showed success and the post-commit `refreshData()` re-fetched stale data that masked the failure on page reload.
- Host listing — WORKING via `list-hosts` Edge Function.
- Single-host fetch — WORKING via `get-host` Edge Function.
- Host creation from `hosts.html` — WORKING via `create-host` Edge Function. Sends `terms_accepted: true` and `terms_accepted_at`.
- Host creation from Drop Studio inline ("+ New Host" modal) — WORKING via `create-host`, BUT does NOT capture terms acceptance. Tracked as T4-37.
- Brand Hearth preview-drop host fetch — WORKING via `get-host`.
- Hosts UPDATE (host-profile.html save) — WORKING via `update-host` Edge Function. Whitelisted field updates with vendor-scoped tenancy belt (id + vendor_id) and service-role write. Verified end-to-end in production 2 May 2026.
- Drops INSERT / UPDATE / status transitions — WORKING via `create-drop`, `update-drop`, `transition-drop-status`, `assign-menu-items`, `create-host`, and `remove-event-window` Edge Functions. Confirmed via source-level grep against drop-manager.html on 2 May 2026 — no remaining direct PostgREST writes against `drops`, `drop_menu_items`, `hosts` (insert path), or related tables on the Drop Studio page.
- Onboarding writes (vendors, host context, terms acceptance) — WORKING via `update-vendor` and `complete-onboarding` Edge Functions. Confirmed via source-level grep against onboarding.html on 2 May 2026 — no remaining direct PostgREST writes.
- Vendor hero image upload (`vendors.hero_image_url` and Supabase Storage `vendor-assets/{slug}/hero`) — WORKING via `update-vendor` Edge Function for the DB write and direct `storage.from('vendor-assets').upload(...)` for the asset. Confirmed end-to-end on Test 11 production via PR #225. Bucket is `vendor-assets`, path is `{slug}/hero` with `upsert: true` so replacements overwrite in place. Same pattern in use for logo (`{slug}/logo`) since T2-7. Future asset types should follow the same pattern.
- Categories INSERT / UPDATE / DELETE (drop-menu.html) — WORKING via `create-category`, `update-category`, `delete-category` Edge Functions. Shipped 2 May 2026 as T5-B16 batch 1 (PR #209).
- Products INSERT / UPDATE / DELETE (drop-menu.html) — WORKING via `create-product`, `update-product`, `delete-product` Edge Functions. Shipped 2 May 2026 as T5-B16 batch 2 (PR #211).
- Bundles INSERT / UPDATE / DELETE (drop-menu.html) — WORKING via `create-bundle`, `update-bundle`, `delete-bundle`, `duplicate-bundle`, `save-bundle-line`, `delete-bundle-line` Edge Functions. Shipped 2 May 2026 as T5-B16 batch 3 (PR #212). bundle_lines and bundle_line_choice_products writes are covered by the composite `save-bundle-line` and `duplicate-bundle` functions.
- customer-import.html writes — WORKING via `bulk-create-customers` Edge Function as of 2026-05-15. Anonymous gateway (`verify_jwt = false`), batched email+phone customer lookup, in-memory classification preserving four-way conflict resolution (added / linked / skipped / conflict), per-row writes for createNew (customers INSERT + customer_relationships INSERT) and linkExisting (customer_relationships INSERT + optional customers UPDATE for address backfill), demand breakdown aggregated by outward postcode in the same response. Previously broken end-to-end — both the pre-write reads and the four writes silently failed under RLS because customer-import.html used inline `window.supabase.createClient()` and the publishable-key auth-attach bug never delivered the user JWT to anon-blocked PostgREST endpoints. Closes T-ops-rls-customer-import.
- Category creation on a fresh vendor — WORKING end-to-end as of 2026-05-03 (closes T5-B23). Verified by logging in as Test 12 and successfully creating Test Category D via the Menu Library; "All changes saved" confirmed. The publishable-key auth-attach bug no longer affects category writes because `create-category`, `update-category`, and `delete-category` all route through Edge Functions (T5-B16 batch 1).
- Host-view summary read (host-view.html) — WORKING via `host-view-summary` Edge Function as of 2026-05-19. Token-authenticated (slug + `&t=` token in query string), returns an 18-field minimal host projection. Never returns `drop_gmv_pence` or raw host-share mechanics — `host_share_descriptor` is built server-side from the underlying mechanics. Uniform `403 {"error":"not_authorised"}` on any failure (bad token, wrong slug, missing drop) to prevent anonymous enumeration. Replaces the previous direct read of `v_drop_summary` on host-view.html. Closes the host-view authorisation sub-track of T5-A3.
- Operator host-token fetch (drop-manager.html "Copy host link") — WORKING via `get-drop-host-token` Edge Function as of 2026-05-19. JWT-authenticated (mirrors `get-drop`'s auth pattern), verifies the caller owns the drop's vendor, returns `{ host_access_token }`. Drop Studio's host-link builder appends the returned token to the host-view URL. Previously broken silently — direct PostgREST against `drop_host_tokens` returned empty rows because the anon role hit RLS (see operational learning #52). Part of the T5-A3 host-view sub-track closure.
- Service Board selected-drop pipeline read (service-board.html `loadSelectedDropData`: summary, orders list, and order-item detail for the currently-selected drop) — WORKING via the extended `get-drop` Edge Function as of 2026-05-19 (operator-read-auth Slice 1). `get-drop` was extended additively (commit 3b064fc added the `summary` key; commit 9c63c5f added `orders_summary` + `order_items` + `order_items_source`; both reads use the service-role client against the invoker views, ownership already enforced by `get-drop`'s existing JWT verification). `service-board.html` re-pointed in commit a471990 to consume those keys; the three direct anon reads (`v_drop_summary` single, `v_drop_orders_summary`, the three-step `v_order_item_detail_expanded` → `_v2` → `_detail` fallback) and the client-side `vendor_id` assertion are deleted. Verified end-to-end in production against drop "Neighbourhood massive" (`25e75db9-01bd-4847-bc6c-7f858e216898`, 1 placed + 1 delivered) — verifying on an empty drop would not have exercised the failure mode (see operational learning #53). Previously this read surface was absent from this section — added on 2026-05-19. All four `loadDrops` sites (service-board.html, drop-manager.html, hosts.html, host-profile.html) migrated to `list-drops` EF; scorecard.html uses `get-drop`. No direct anon reads of `v_drop_summary` remain.

## Strategic principles (updated May 2026)

**Positioning**
Hearth complements however a vendor already operates — shop front, food truck, catering, market stall, pop-up. It adds a controlled, planned demand channel alongside whatever they already do. It does not ask them to change their primary operation.

Hearth competes with and aims to displace the aggregator habit specifically — always-on, reactive, commission-heavy delivery. These are two different relationships and must not be conflated.

Internal framing: "complement today, displace the aggregator habit over time."

**Commercial alignment**
Hearth has no alternative growth mechanism. Its only measure of success is whether individual vendors are building deeper customer relationships and driving more controlled revenue. If vendors don't succeed, Hearth doesn't succeed.

Draft expression for platform use: "Hearth grows only when you do."

**The demand-side challenge — the hardest problem Hearth has to solve**
The aggregator model wins on convenience. Hearth asks customers to plan ahead — a genuine behavioural shift. It only works if two conditions are simultaneously true:

1. The drop pattern is reliable enough to plan around. Vendor cadence consistency is a communication requirement, not just an operational preference. Every deviation weakens customer habit formation.
2. The moment feels worth anticipating. Research shows 40–50% of product enjoyment comes from the anticipation phase. Hearth should design this window deliberately, not minimise it.

Habit formation typically takes 8–10 consistent, high-quality drops.

**The vendor confidence gap**
The causal chain is: vendor confidence → cadence consistency → customer habit formation. Breaking the first link breaks the whole chain. The platform needs explicit mechanisms to support vendors through the early drop period (drops 1–10) before habits are established.

**The intelligence layer**
The Insights page is not a reporting dashboard. It is a demand visibility and cadence coaching engine. Its job:
- Monitor vendor cadence and flag drift before it breaks customer habit loops
- Surface demand signals that give vendors confidence to commit to regular drops
- Identify the right moment, context, and customer segment for each drop
- Prompt the right communications at the right moment

**Key phrases — locked**
- "Sell before you serve" — the core shift Hearth enables
- "Complement today, displace the aggregator habit over time" — the positioning
- "Hearth grows only when you do" — the commercial alignment
- "Vendor confidence → cadence consistency → customer habit formation" — the causal chain the platform must protect
- "We don't just fill drops. We build the demand that fills the next one" — the intelligence layer in one line
- "Economic captivity" — the documented state of aggregator-dependent vendors

## Development backlog

Open tickets are tracked in `BACKLOG.md` — see that file when working a specific
ticket. The full historical record (every ✓ COMPLETE entry with its implementation
narrative, every unbuilt-ticket spec) lives there. The list below is a one-line
index of currently open tickets only — not started, partial, or in progress. When
a ticket closes, mark it ✓ COMPLETE in BACKLOG.md and remove its line from this
index.

### Capture layer (T-CAP) — ⬆️ ABOVE the stop line (table stakes)
See the STOP LINE banner + T-CAP cluster at the top of BACKLOG.md. Capture-first
entry points per Hearth_Strategy.md §11 Phases 1–3; build cheap, build fast, then
stop.
- T-CAP-1 — Permanent vendor page: durable `lovehearth.co.uk/{vendor}` resolving to ordering / drop announced / drop live / nothing on; the "nothing on" state IS a capture surface; live state shows real capacity via an Edge Function (never anon PostgREST — see T-drop-capacity-anon-grants). **THE UNLOCK / highest capture-layer priority.** §11 Phase 1. — open
- T-CAP-2 — Vendor QR vs drop QR: two artefacts — durable vendor QR → vendor page; drop QR → a drop, short-lived. §11 Phase 1. — open
- T-CAP-3 — Till QR (capture only): no ordering, no payment; "scan to hear what's next." Capture-only is principled, not a Stripe compromise (§9.2). — open
- T-CAP-4 — Table QR / order-ahead: order + pay; justified by staff-time / queue saving. §11 Phase 2. — open
- T-CAP-5 — Ordering windows, ring-fenced slotted capacity: §6.2 design — default closed, real declared capacity (no rejection), slotted, planned variation only, never dynamic, never "always on." Distinct from the event multi-window feature. — open
- T-CAP-7 — Follow / notify-me (vendor-scoped): capture when NO drop is live. Explicitly distinct from T5-8 (drop-scoped, ✓ COMPLETE); `drop_signals` is currently drop-scoped, so vendor-scoped signals must be added. §11 Phase 2. — open
- T-CAP-9 — Identity resolution: one customer across counter/window/drop; without it the repeat-customer signal and the intelligence layer silently fail. §11 Phase 3. — open
- T-CAP-10 — Capture-origin extension: `customer_relationships.source_drop_id` already exists; extend to new capture doors and add a `source_type` (`'drop'|'presence'|'window'|'follow'|'import'|'host'`); reconcile with the existing `source` column. Cannot be retro-fitted. §11 Phase 3. — open
- *(T-CAP-6 sold-out capture NOT created — shipped as T-notify-next-time ✓ COMPLETE; T-CAP-8 BYO import NOT created — shipped as customer-import.html + bulk-create-customers.)*

### The moat (T-MOAT) — ⬇️ BELOW the stop line
See the T-MOAT cluster at the top of BACKLOG.md. Hearth_Strategy.md §8 Tier 3, §11 Phases 5–7, §12.3 engines.
- T-MOAT-2 — Recommendation surface (sentences, not charts): **folded into the reframed T5-15** — build T5-15, not a second ticket; pointer only. §11 Phase 5, §12.3 Engine 3, §9.3. — open
- T-MOAT-3 — Referral mechanic (§12.3 Engine 4, the only compounding channel): absent from every document; reward = status + early access, never a discount; needs a mechanic that does not yet exist. — open
- T-MOAT-4 — Affinity partnership support (gym/office/nursery): early-access currency not margin; curated menu = a relabelled subset, not a second kitchen; ask the cannibalisation question first. Distinct from affinity matching (T5-9/T5-26). §6.4. — open
- *(T-MOAT-1 geographic clustering NOT created — already specced inside T5-9; flagged for Ed's decision to extract as a standalone primitive vs keep folded.)*

### Tier 2 — Must work before showing anyone
- T2-2 — Service Board: remove need to scroll to reach Kanban — open

### Tier 3 — Should be done before regular use
- T3-8 — Stripe Connect Express: next major priority — final gate before Healthy Habits go-live. Schema (`vendors.stripe_account_id`, `vendors.stripe_onboarding_complete`) and the `create-stripe-connect-link` / `check-stripe-connect-status` Edge Functions are in place; drop publish gate is wired. Outstanding work is whatever remains to take a real vendor (Healthy Habits) through onboarding end-to-end on the live Stripe platform. See the dedicated "Stripe Connect Express (T3-8)" section above for current state.
- T-ops-rls-cleanup-auth-callback — `auth-callback.html` contains a dead-code backstop that writes `vendors.auth_user_id` directly. Per operational learning #11, `invite-vendor` handles this server-side now. Delete the client-side update; do not migrate. Low priority cleanup. — open
- T-ops-rls-reads-audit — separate audit of SELECT paths on RLS-protected tables to identify silent filtering candidates (Variant 3 failure mode in operational learning #14). Deferred — addressable during T5-A auth migration. — open
- T3-12b — Order page: neighbourhood delivery area enforcement (radius mode) — open. T3-12a (postcode prefix mode) closed 2026-05-03: schema discriminator added (`delivery_area_type`, `allowed_postcode_prefixes`); Drop Studio UI for prefix entry; client-side onBlur validation; server-side enforcement in `create-order`; widened `update-drop` ALLOWED_FIELDS with paired-field invariants. Radius mode reserved for T3-12b.
- T3-13-polish-2 — Product/bundle editor chips ("£X", "Y slot per item / Doesn't count", "Z sold") don't refresh after save until hard refresh — open. PR #253 attempted a fix by adding `applySavedRowToState` to patch `state.products` / `state.bundles` with the Edge Function response after `refreshAll()`, but the chips remained stale in production. Leading hypothesis: the chip render function reads from an enriched / derived source (a separately-fetched array, or a `v_products_enriched` / `v_bundles_enriched` result the helper doesn't touch) while `applySavedRowToState` only mutates the raw `state.products` / `state.bundles` arrays. Two follow-up sessions stalled in extended thinking — start the next session by `grep`-ing for `productsEnriched`, `bundlesEnriched`, `menuItems`, and the enriched view names in `drop-menu.html`, and trace the chip render function back to its actual data source before editing.
- T3-13-polish-3 — Drop Studio Capacity section feels oversized — open. Pills are large, category list is one-per-row. Possibly compact pills + multi-column chip layout for categories. Needs design conversation.
- T-A1-dup-gap — ~~Duplicating a drop discards the announce→open gap: `duplicateDrop` (drop-manager.html ~4786) nulls `opens_at`/`closes_at`, so a duplicated drop opens immediately and loses the source's announce→open anticipation window — fighting the comms model that treats that gap as part of the product. Carry the source's open pattern across, or re-default to `createNewDrop`'s 24h-lead. Audit-first. Pre-launch. Source: Build Coherence Audit Pass A / A1.~~ ✓ COMPLETE 2026-06-15 (#369). Root cause was not the toggle — create-drop strips null payload fields so DB defaults apply, and `delivery_start`'s DB default is `now()`, so nulling timing surfaced the duplicate as open-immediately on today's date. Fixed by giving `duplicateDrop` explicit `createNewDrop`-style placeholder timing (week out, scheduled 24h open) instead of nulls.
- T-A2-orphan-hosted — ~~Remove the dead `'hosted'` value from `update-drop` `VALID_DROP_TYPES` (no surface writes it; DB CHECK is `{neighbourhood, community, event}`) and disallow null `drop_type` on the update path. Tiny, zero-risk hygiene; no live rows carry `'hosted'`. Pre-launch. Source: Pass A / A2.~~ ✓ COMPLETE 2026-06-13 (#354)
- T-A6-lifecycle — Drop status lifecycle (live→closed→completed) via scheduled job — ✓ COMPLETE 2026-06-15. Built as a `pg_cron` job (back half only; the `draft→scheduled→live` front half was deferred by decision — see T-A6-lifecycle-scheduled-state post-launch). Migrations `20260612055452_drop_lifecycle_access.sql` (anon access widen to `live`/`closed`/`completed`) + `20260612061555_drop_lifecycle_engine.sql` (`pg_cron` enable + `advance_drop_lifecycle()` on a 15-min job); `transition-drop-status` extended (PR #372, deployed) so cancel is allowed from `closed` and archive from `completed`. Source: Pass A / A6.

T3-13 (capacity driver multi-mode) closed 2026-05-13: Drop Studio capacity mode UI (PR #251), Menu Library capacity UI (PR #252), pending_payment fix (PR #250) merged; eight Edge Functions redeployed (`create-order`, `create-drop`, `update-drop`, `create-product`, `update-product`, `create-bundle`, `update-bundle`, `duplicate-bundle`); schema migrations and view rewrites applied earlier; verified end-to-end on Test 11 for both `by_order` and `by_category` modes with capacity math correct in both.

T3-13b (event / catering workflow) closed 2026-05-14: schema migration (`drops.expected_guests`, `drops.discount_tiers` jsonb, `orders.discount_pence`, `orders.discount_breakdown` jsonb) applied earlier; Drop Studio event-type behaviour (event-mode toggle, expected guests, bulk discount tier editor, slug random suffix, helper text) and order page event UX (capacity chip hidden on event drops, volume discount preview at checkout) merged across PRs in the T3-13b series; `create-order` updated to skip capacity enforcement for events, apply the matched discount in the Step 7 total guard, persist `discount_pence` and `discount_breakdown` on the orders row, and apply a one-off Stripe coupon (`amount_off` + `duration: 'once'` + `max_redemptions: 1`) to the Checkout Session so the itemised breakdown remains intact on Stripe's side. Shipped via PR #254 (three-prompt split: 3.1 helpers + select extension, 3.2 capacity skip + total guard, 3.3 persist discount + Stripe coupon).

T-ops-rls-fix closed 2026-05-15 (closes T-ops-rls-fix-polish in same workstream): built `transition-order-status` Edge Function (anonymous, `verify_jwt = false`, server-side state machine enforcing adjacent-only transitions in `placed → confirmed → preparing → ready → delivered`, optimistic-concurrency guard via `.eq("status", currentStatus)`, audit event written server-side as `actor: 'service_board'`, `actor_type: 'operator'`); migrated `commitPending` in service-board.html to invoke it (PR #256). Polish PR #257 removed the redundant `refreshData()` call inside `commitPending` so the Supabase realtime subscription is the single source of truth for post-transition refresh — eliminates the visible flick-back on forward transitions. Verified end-to-end on order `8f56908e-3c3c-4407-b306-2a235c63d4db`. Parallel T-ops-rls-audit (2026-05-15) produced the inventory that bounded this fix and surfaced T-ops-rls-customer-import, T-ops-rls-cleanup-auth-callback, T-ops-rls-reads-audit (see Tier 3 backlog index). Full closure narrative and audit linkage in BACKLOG.md.

T-ops-rls-customer-import closed 2026-05-15: built `bulk-create-customers` Edge Function (anonymous, `verify_jwt = false`, batched email+phone lookup, in-memory classification matching the page's existing four-way logic, sequential per-row writes for createNew + linkExisting, demand breakdown aggregation folded into the response — PR #260) and rewired customer-import.html to invoke it (286 deletions / 39 additions, removing inline `supabase.createClient()` + two pre-write reads + classification + four write loops + the now-dead `fetchDemandBreakdown` + `normalisePhone` — PR #261). Verified end-to-end on Test 12 with a 5-row CSV: stage 5 reported 5 added / 0 skipped / 0 conflicts / 0 failed; SQL count confirmed 5 customer_relationships rows for the vendor with source='import'. First successful end-to-end customer import in the platform's history. Full closure narrative and design rationale in BACKLOG.md. Audit linkage: closes the second of three RLS surfaces from T-ops-rls-audit (2026-05-15); T-ops-rls-cleanup-auth-callback and T-ops-rls-reads-audit remain open per their original framing.

T5-11-minimum closed 2026-05-16 (parent T5-11 remains partial): built `send-order-confirmation` Edge Function and wired `stripe-webhook` to invoke it after `checkout.session.completed` transitions the order to placed/paid (PR #266). Resend HTTP API called directly with `RESEND_API_KEY`; inter-function call authenticated via shared `INTERNAL_FUNCTION_SECRET` in `X-Internal-Secret` header (`verify_jwt = false` at gateway). Webhook treats every error from the send function as non-fatal — try/catch + return 200 regardless of email outcome — so a Resend outage cannot cause Stripe to retry the webhook and double-place an order. First application-level Resend integration in production. Establishes two reusable patterns documented as operational learnings #46 (application-level Resend) and #47 (inter-Edge-Function shared-secret auth) for future T5-11 triggers (order_ready automated SMS, drop_announced, drop_reminder, drop_early_access, post_drop_thank_you), all of which remain open per pre-launch scope decision. Full closure narrative in BACKLOG.md.

T5-A3 checkpoint 2026-05-19 (in progress, not closed): operator view layer closed — all 34 vendor-scoped `v_*` views set `security_invoker = on`, applied bottom-up (canary `v_products_enriched` → Tier 0 → Tier 1 → Tier 2+3), each tier verified via the authenticated app path. Anonymous customer reads now route through column-safe `v_drop_public` (29 safe columns, status-filtered, granted `anon` + `authenticated`); `order.html` re-pointed in commit 8d4c63d. Interim narrowing of `order.html`'s anonymous `vendors` read landed in commits 390985e + 65d66c1. **Host-view authorisation sub-track CLOSED 2026-05-19, verified end-to-end on production:** `host-view.html` no longer reads `v_drop_summary` or `drop_host_tokens` directly. The page now invokes the new token-authenticated `host-view-summary` Edge Function (slug + `&t=` token; 18-field minimal projection; never returns `drop_gmv_pence` or raw host-share mechanics — `host_share_descriptor` is built server-side; uniform `403 {"error":"not_authorised"}` on any failure to prevent enumeration). Drop Studio's "Copy host link" routes through the new JWT-authenticated `get-drop-host-token` EF (mirrors `get-drop`'s auth pattern; verifies caller owns the drop's vendor; returns `{ host_access_token }`) — direct PostgREST against `drop_host_tokens` was returning empty rows because the anon role hit RLS, see operational learning #52. Section A of the T5-A3 reads audit also corrected stale handover claims: the platform has exactly one anon SELECT policy per table (not six on `drops`; not duplicate policies on `categories` / `products`); duplicate anon SELECT (`qual = true`) policies exist only on `drop_products`; `orders`, `order_items`, `order_item_selections`, `customers`, `customer_relationships` and `hosts` carry NO anon policy (already locked; T5-B39 confirmed), so their operator reads are out of T5-A3 confidentiality scope — their robustness depends on the separate auth-attach workstream, not on any policy T5-A3 changes. **Major framing change (2026-05-19):** the planned `v_drop_summary security_invoker` flip is ABANDONED (operational learning #52) — under the auth-attach bug, operator pages read `v_drop_summary` as anon, so the flip would zero out every operator page. The closure of the `v_drop_summary` cross-vendor exposure now requires the JWT-auth EF migration documented in the new ticket T5-A14 (BACKLOG.md). Open residuals: T5-A14 (v_drop_summary closure track — supersedes the abandoned invoker flip); T5-A3 Priority 2 — remove `vendors_select_all`, gated on remediating the `hearth-vendor.js:33` boot read, then create `v_vendor_public`; two-vendor adversarial isolation test; deferred low-severity catalog anon policies. Full DONE / OPEN narrative in BACKLOG.md. **[Closure update 2026-06-29] These residuals are now resolved: T5-A14 was subsumed by the operator-read-auth track (✓ COMPLETE 2026-06-27); T5-A3 Priority 2 Half A (#413, 2026-06-27) created the column-safe public views; Half B (#415, 2026-06-29) shipped the `get-current-vendor` EF, re-pointed the four session-identity reads, and DROPPED `vendors_select_all` (capstone). T5-A3 is CLOSED. The only carry-forward is the Catering Direct two-vendor adversarial isolation test (empirical, non-blocking, structurally guaranteed by EF design).**

T5-25 Part 0 — SHIPPED (prod, squash commit f95c12c). Vendor Monday
"reveal" Instagram post asset (auto-generated 1080x1080 card).

LOCKED DESIGN — do not relitigate or expand:
- Card = ONE full-bleed photo of the drop's reveal dish + a
  restrained drop-name/date lockup (Cormorant, near-white,
  lower-left) over a bottom legibility scrim. NOTHING else: no menu
  list, no logo, no tagline, no Hearth mark, no host. Vendor
  identity comes from posting via their own Instagram (Hearth
  frames, vendor fills).
- Reveal dish is chosen via the "Reveal dish" picker in Drop Studio
  Basics (lists the drop's ENABLED products only). Image fallback
  chain: selected product image -> vendor.hero_image_url -> solid
  brand-colour block.

HARD RULE — card image geometry (regression guard):
- The card photo uses explicit JS-computed pixel geometry
  (cover-centre math against the 540px box, clipped by
  .menuCardArtwork overflow:hidden). Do NOT replace this with
  object-fit:cover or background-size:cover. html2canvas 1.4.1
  re-implements those differently from the browser, so the exported
  PNG diverges from the on-screen preview. The explicit-pixel
  approach exists specifically to make preview and export
  pixel-identical by construction. This was the root cause of the
  stretch and crop bugs.

SCHEMA/EF (live in prod): drops.reveal_line (text),
drops.reveal_product_id (uuid -> products.id). create-drop and
update-drop EFs carry both in ALLOWED_FIELDS and are deployed.
reveal_line is now the Activation poster-hook field — written by
Card 4's poster-hook input (`#act-posterHookInput`) in activation.html
and rendered as the hero line on activation-poster.html. It was
RELOCATED here from Drop Studio, not removed. (It remains NOT rendered
on this Monday Instagram menu card — that HARD RULE is unchanged.) When
T5-25 Part 1 (the caption generator) is built, the caption seed MUST get
its own column rather than reusing reveal_line, whose documented purpose
has drifted from its actual use — tracked as T-D4-reveal-line-semantics.

Drop Studio Review-page restructure SHIPPED 2026-05-17 (PR #268, squash commit 4200d6a). Final layout: `#pane-review` → `.reviewGrid` (Drop Summary | Readiness) → `.reviewActionsRow` (merged "Publish & share" card | `mondayRevealSection`). The merged left card stacks Publish & Drop link content separated by a `.reviewCardDivider`. The reveal section internal structure is `.mondayRevealHeader` (full-width above), then `.revealBody` (`display: grid; grid-template-columns: 220px 1fr; align-items: start`) containing `.revealFields` on the left (the editorial-line textarea + reveal-dish select) and `.revealAsset` on the right (the entire `.menuCardWrap` — artwork frame + nested `.menuCardActions`). Review-pane cards are natural content height: `#pane-review .reviewGrid` and `.reviewActionsRow` both use `align-items: start`, so uneven card bottoms are INTENTIONAL (dense-not-voided) — do not "fix" them in future work.

Locked reveal card update — sanctioned containment lever value is now `#pane-review .reviewActionsRow .menuCardArtworkFrame { max-width: 320px }`. The HARD RULE above remains in force unchanged: export is always 1080×1080 via the 540px base via html2canvas at scale(1); only the artwork-frame `max-width` may ever be adjusted. Never touch `#menuCardArtwork`, `updateMenuCardScale`, or the export path.

Reveal hook field — `#dropRevealLine` is now a `<textarea>` (4 rows, `maxlength=100`), relabelled "Your line for this drop". `reveal_line` is still stored for the future caption composer (T5-25 Part 1, deferred — composes the hook + drop data into the full Monday post; not built).

### Tier 4 — Enhancements that will impress
- T4-29 — Series intelligence in Insights — open
- T4-31b-fu1 — Server-side HEIC conversion fallback for Mac-Photos-HEIC — open, deferred until real vendor friction.
- T4-32 — Order page: map display for collection point and delivery area — open
- T4-33 — Brand Hearth: GenAI copy generation + customisation review — open, deferred until T5-25 surfaces a customer-facing use for vendor brand copy.
- T4-33b — Drop copy AI generation (sixth GenAI use case, Drop Story card on order.html) — open.
- T4-34 — Multiple windows: windowCount race condition on sibling naming — open
- T4-35 — Multiple windows + Close Orders: duplicative timing UX — open
- T4-36 — Multiple windows: discoverability of Create windows action — open
- T4-37b — Host-direct terms acceptance via email confirmation — open

### Tier 5 — Strategic platform features
- T5-1 — Delivery optimisation (route planning) — open
- T5-3 — Host onboarding: contact list upload — open
- T5-4 — Marketplace evolution: host-to-vendor matching — open
- T5-6 — Customer accounts (order history, saved addresses) — open
- T5-9 — Recommendation engine: matured intelligence — open
- T5-11 — Comms engine V1 (transactional + demand generation email) — partial. T5-11-minimum (order_confirmed email via Resend, fired by `stripe-webhook` after Stripe success) shipped 2026-05-16 (PR #266). Slice 1 ✓ COMPLETE 2026-06-19: interest-registrant ordering-open auto-email shipped — `dispatch-interest-open` EF + `comms_log` ledger, scheduled by a GitHub Actions pinger (`.github/workflows/comms-dispatch.yml`, every 30 min). Remaining triggers — order_ready automated SMS, drop_announced, drop_reminder, drop_early_access, post_drop_thank_you — remain open per pre-launch scope decision.
- T5-12 — Vendor customer data import: advanced (POS / email / booking integrations) — open
- T5-14 — Home page: demand orchestration dashboard — open
- T5-15 — Insights: the recommendation surface (plain-English signals, not charts) AND the mechanism that converts the free tier by driving graduation (capture → drop). Reframed per Hearth_Strategy.md §12.3 Engine 3 (the intelligence layer sells the drop) and §9.3 (graduation is the intelligence layer's explicit job — not a dashboard). — open
- T5-16 — Organisations: shared entity for hosts and communities — open
- T5-17 — Communities: first-class entity — open
- T5-18 — Community consent and permissions model — open
- T5-19 — Community-to-vendor matching and discovery — open
- T5-20 — Community-sourced drops — open
- T5-21 — Multi-vendor accounts — open
- T5-23 — Multi-vendor events — open
- T5-24 — POS integration: full integration — partial (Part 1 complete; Part 2 deferred until live vendor friction confirms)
- T5-25 — Drop promotion: marketing copy + print assets — open
- T5-26 — Host discovery outreach (V1 vendor-mediated, V2 platform-mediated) — open
- T5-27 — Host platform participation (six phases) — open
- T5-C2 — WhatsApp activation system — templates, segmentation, phone consent, broadcast management — open
- T5-C3 — WhatsApp Business API / Meta Tech Provider integration (Phase 2 — gated on UK Coexistence) — open
- T5-C4 — Drop activation guide — vendor-facing communication playbook (Part 1: Drop Studio; Part 2: guide page) — open
- T5-C5 — Engine 1 · Productise the coach (Hearth_Strategy.md §12.3): encode the cadence coaching through the first ten drops — scorecard variants, cadence-drift line, "what's normal at drop three" — whose copy is already written in Hearth_Repetition_Layer_Voice_Spec.md. The first throughput unlock; **must land before self-serve onboarding** (§12.3 Engine 2), else vendors churn in the fragile weeks with nobody holding them. Part 1: dashboard/scorecard; Part 2: gap alerts via T5-11. — open
- T5-C6 — AI-powered vendor activation plan — post-onboarding personalised first-8-drops strategy — open
- T-drop-anticipation-window-default — ~~Drop Studio: default opens_at to delivery_start so publish=announce and the publish→opens gap is the anticipation window. Pre-launch.~~ ✓ COMPLETE 2026-06-15. New-drop default (`opens_at = delivery − 24h`) was already live in `createNewDrop`; #369 closed the only remaining gap (the duplicate path). Both creation paths now produce the announce→open window.
- T-comms-automation — Behaviour-triggered comms automation + plain-language insight prompts (competitor-derived, Owner.com) — open
- T-aggregator-savings-calculator — Vendor-facing aggregator cost comparison (competitor-derived, Slerp) — open
- T-cart-hold-timer — Visible cart-hold countdown (competitor-derived, Hotplate) — open
- T-comms-order-timeline — Comms→order timeline: honest correlation view (orders after each send), NOT attribution. Joins comms_log.sent_at against orders per drop for the Insights layer — open

GenAI shared principles (model choice, hard rules, cost framing) live in
BACKLOG.md alongside the ticket specs that depend on them — read there before
building any T4-33, T5-9, T5-11, T5-25 or T5-26 work.

### Tier 5-A — Auth workstream
- T5-A3 — RLS rewrite: server-side vendor scoping — ✓ COMPLETE 2026-06-29. Operator view layer closed (all 34 `v_*` views set `security_invoker = on`, bottom-up); anon order page re-pointed to `v_drop_public`; **host-view authorisation sub-track closed 2026-05-19** via the token-auth `host-view-summary` + JWT-auth `get-drop-host-token` Edge Functions, verified end-to-end on production. Priority 2 Half A ✓ COMPLETE 2026-06-27 (#413): column-safe public views for the anon order path — pre-existing 23-col PII-safe `v_vendor_public` reused + `v_host_public` created, `order.html` re-pointed, customer-facing host PII closed. Priority 2 Half B ✓ COMPLETE 2026-06-29 (#415): `get-current-vendor` EF built and deployed, the four session-identity reads re-pointed onto it, and the `vendors_select_all` policy DROPPED (capstone) — no anon SELECT remains on `vendors`, confirmed via `pg_policy`. The planned `v_drop_summary` invoker flip is abandoned (see operational learning #52); the wider closure of the invoker-regression blast radius across the operator order / capacity / production / analytics surface was the **operator-read-auth** track (operational learning #53), which subsumed the narrow T5-A14 and is ✓ COMPLETE 2026-06-27 (see BACKLOG.md). RESIDUAL (not blocking, carry forward): the Catering Direct two-vendor adversarial isolation test — empirical cross-vendor check, structurally guaranteed by the EF design, to run before the dry run once fixture access is sorted. See the "View security model" standing-context section above and the BACKLOG.md T5-A3 DONE / OPEN narrative.

### Tier 5-B — Platform improvements
- T5-B5 — Schema cleanup: legacy artefacts and missing constraints — open
- T-drop-capacity-anon-grants — documented prerequisite for the permanent vendor page's public read path (Hearth_Strategy.md §11 Phase 1 — the durable `lovehearth.co.uk/{vendor}` anchor whose "nothing on" state is a capture surface, and whose live/open state must show real capacity). The permanent vendor page MUST read capacity via a JWT/token-scoped Edge Function, never direct anon PostgREST. Revoke residual non-SELECT anon privileges (INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) on `v_drop_summary` / `drop_capacity` left after the operator-read-auth SELECT revoke; inert on the aggregating (non-auto-updatable) view, so this is defence-in-depth there, but possibly a live write exposure on `drop_capacity` if it's a base table (determine relation-vs-view first — overlaps T5-B5). Post-launch, low priority. — open
- T5-B6 — invite-vendor: hardcoded production redirect URL — open
- T5-B7 — Edge Functions missing top-level try/catch — partial (create-host remaining)
- T5-B8 — invite-vendor: doesn't use jsonResponse helper — open
- T5-B9 — host-profile.html: host-status-field no-ops after update-host migration — open
- T5-B10 — Server-side payload validation on create-drop / update-drop — partial. Pass A / A2 addendum CLOSED 2026-06-13 (#354): create-drop now app-validates `drop_type` and `audience_scope` (rejecting present-but-invalid values with friendly 400s; DB CHECK still backstops integrity), matching update-drop's semantics. Remaining T5-B10 scope: broader create-drop payload validation beyond these two fields (e.g. timing/fundraising fields).
- T5-B11 — Drop Studio readiness checklist: surface capacity row explicitly — open
- T5-B14 — Cross-vendor host-poisoning: defence-in-depth on RLS — partial (write-side closed; RLS-side outstanding)
- T5-B17 — Underlying auth-not-attached client bug — partial (header workaround in place; root cause not resolved)
- T5-B18 — Stripe status visibility surface — open
- T5-B19 — drop-menu.html: CSP eval-blocked warning — open
- T5-B21 — Window cancellation with existing orders (refunds + audit trail) — open
- T-fulfilment-mode-publish-gate — COMPLETE — deployed + migration applied + merged 2026-06-30. Adds the missing server-side `fulfilment_mode` check to `transition-drop-status` `evaluateLiveReadiness()` and drops the contradictory column-level NOT NULL on `drops.fulfilment_mode` (migration `20260630120000`), so the live-drop fulfilment_mode guarantee moves from the column constraint up to the publish gate. Ed's order: deploy the EF first, then apply the migration, then merge (operational learning #43). See 2026-06-30 Recent updates entry.
- T5-B29 — Multi-window parent drop fulfilment.mode bug — open. When ordering against a drop with `window_group_id` set and `fulfilment_mode = null` (the multi-window parent pattern), `buildCheckoutPayload()` in order.html sends `fulfilment.mode: null` and create-order rejects with 400. Either: (a) order.html's window-selection step in init() should route customers to a child drop before allowing basket entry, or (b) `buildCheckoutPayload` should read `fulfilment_mode` from the selected child window rather than `state.drop`. Also: `validateCheckout()` should refuse to submit when `fulfilment.mode` is null, surfacing a user-friendly error instead of relying on the server's 400. Discovered during Phase 3 manual testing on 2026-05-01.
- T5-B30 — Edge Function CORS allow-list excludes Netlify deploy previews — open. All current Edge Functions hardcode `ALLOWED_ORIGIN = 'https://lovehearth.co.uk'`, which means deploy previews on `*.netlify.app` cannot exercise the customer flow. Phase 3 testing had to be completed against production after merge rather than against the deploy preview. Widen the allow-list to include the Netlify preview domain pattern, or accept the limitation and document it in the PR template (deploy preview testing requires merge-to-prod for final visual confirmation).
- T5-B31 — Legacy capacity columns cleanup — open. `orders.pizzas` (NOT NULL CHECK >= 1), `drops.capacity_pizzas`, `drops.max_orders` are still being populated as `Math.max(1, capacity_units)`. Audit all read sites for these columns; remove those reads; then drop the columns. Currently written-only by the create-order Edge Function (line marked with `// LEGACY: see SCHEMA.md — orders.pizzas column slated for removal`). Bounded one-session piece of work.
- T5-B24 — Password reset page: button stuck on "Sending..." — open (cosmetic)
- T5-B25 — admin.html: vendor creation is not atomic — open
- T5-B36 — duplicate-bundle rollback verification — open
- T5-B37 — save-bundle-line update-path partial-failure note — open
- T5-B40 — Audit v_*_enriched views for missing columns — open
- T5-B41 — ~~drop-manager.html enrichHostPreview appends rather than replaces (cosmetic)~~ ✓ COMPLETE
- T5-B44 — Publish-validation bug: drops can be published with `orders_close` already in the past, and `orders_close` is not re-derived when the drop date changes — so a drop saved with a future date but a stale `orders_close` is immediately classified as already-closed and disappears from the "Live" filter. No data loss; independent of T5-A3. Pass A / A4 addendum: re-test the original repro first (the UI re-derivation half via `deriveTimingFromDelivery` appears already fixed in current source); add a publish-time guard `closes_at > now()` in `evaluateLiveReadiness` (transition-drop-status) + client mirror `getLiveReadiness` (drop-manager.html). — open
- T-A3-host-type-source — Consolidate the 13-value `host_type` set to one shared source across the three pickers + the DB constraint (no bug today; drift-prevention). Post-launch. Source: Pass A / A3. — open
- T-A1-window-gap — Multi-window event siblings hardcode `opens_at = now`; give event windows an optional anticipation gap (low priority — immediate-open is defensible for events). Post-launch. Source: Pass A / A1. — open. Audited 2026-06-15: `createEventWindow`'s `: null` timing fallback is unreachable — its sole caller (`handleCreateEventWindows`) always passes a full `timingOverride` — so the only live behaviour is the intentional `opens_at = now`. Confirms the low-priority/defensible framing; no fix needed pre-launch.
- T-A4-merged-timing-validation — `update-drop` validates timing only within a single payload; validate the merged stored result (latent; matters for future partial-update/API callers). Post-launch. Source: Pass A / A4. — open
- T-dup-updated-at-trigger — `drops` has two identical `updated_at` triggers (`set_updated_at_drops` and `trg_drops_updated_at`); drop one. Post-launch. Source: Pass A / A6. — open
- T-schema-regen — Regenerate `SCHEMA.md` from the live DB; it is stale (omits `audience_scope`; lists a 7-value `host_type` set conflicting with the live 13-value constraint). The regen should also capture `advance_drop_lifecycle()`, the `'advance-drop-lifecycle'` `pg_cron` job, and the `closed`/`completed` status usage (all added by T-A6-lifecycle). Post-launch. Source: Pass A spillover. — open
- T-A6-lifecycle-timestamps — the lifecycle engine sets `status` only; `closed`/`completed` drops carry no lifecycle timestamp. If wanted: have the engine stamp `closed_at`/`completed_at`, AND have `transition-drop-status`'s cancel path preserve an existing `closed_at` rather than overwriting it with `now()` (it currently re-stamps unconditionally — see PR #372). Bundle the two. Post-launch. Source: T-A6-lifecycle. — open
- T-A6-lifecycle-scheduled-state — deferred `draft→scheduled→live` front half of the drop lifecycle (cosmetic vendor-board state; the CHECK constraint already permits `'scheduled'`). Post-launch. Source: T-A6-lifecycle. — open
- T-B5-retire-delivery-scaffolding — retire the dormant fee-shaped plumbing (`getDeliveryChargePence`, `totals.delivery_pence` in the order payload + `create-order` schema validation, any `orders.delivery_pence` column). Post-launch. Source: Pass B / B5. — open
- T-B1-landing-mockup — `index.html` marketing landing shows fabricated static scarcity ("26 of 36 slots filled", "10 remaining") in a demo drop card; soften to non-numeric or label as illustrative. Low priority, post-launch. Source: Pass B / B1. — open
- T-B1-deadcode-capacityleft — remove the dead `formatCapacityLeft` helper in `order.html` (~2110, defined, never called). Trivial, post-launch. Source: Pass B / B1. — open
- T-B3-orders-pizzas-rename — rename the legacy capacity column `orders.pizzas` (and `capacity_pizzas`) to a generic units name; touches `create-order`, `v_drop_capacity_usage`, and the order insert (logic is correct — clarity only; overlaps T5-B31). Post-launch. Source: Pass B / B3. — open
- T-C4-host-poster-session-isolation — `host-poster.html` createClient now passes `{ auth: { persistSession: false, autoRefreshToken: false } }` like `host-view.html`, so host-facing surfaces can't inherit a vendor session. ✓ COMPLETE 2026-06-15 (#376). Source: Pass C / C4.
- T-A6-vsummary-status-single-source — `v_drop_summary` re-derives `'closed'` in-view via a CASE on `closes_at`; now redundant with the stored `pg_cron` lifecycle engine and able to diverge (only knows `'closed'` not `'completed'`, ignores `delivery_end`, leads the engine by up to 15 min). Confirmed this session (2026-07-15): the view's CASE derivation and the `pg_cron` engine BOTH write the closed state, so a view reader and a stored-status reader can disagree by up to the 15-min cron interval. Collapse to project `d.status` directly after grep-confirming no surface relies on the instant live→closed flip (ordering closure is server-side, not off this label). Audit-first; small view migration; not pre-launch-blocking. Post-launch. Source: Pass C / C3 spillover. — open
- T-C-inline-createClient-host-pages — `host-profile.html`, `hosts.html`, `host-terms.html` instantiate `supabase.createClient()` inline rather than via the `_getHearthClient()` singleton; no mutation risk (writes go through `functions.invoke`); `host-terms.html` also creates an unused dead client to drop. Pattern-consistency cleanup (root cause T5-B17). Post-launch, low priority. Source: Pass C / C1 spillover. — open
- T-C-rm-onboarding-backup — delete `onboarding_backup.html` (untracked + gitignored, can't deploy) — the sole remaining copy of the deprecated direct-PostgREST-write onboarding pattern. Housekeeping. Source: Pass C / C1. — open
- T-D4-reveal-line-semantics — `reveal_line` is now the Activation poster-hook field (written by Card 4's `#act-posterHookInput` in activation.html, rendered as the hero by activation-poster.html); the T5-25 docs that described it as the deferred caption-generator seed are corrected in this PR. No functional bug (poster reads what Activation writes), but before T5-25 Part 1 (caption generator) is built the caption seed must get its OWN column rather than reusing reveal_line. Post-launch, low priority. Source: Pass D / D4. — open
- T-D5-vendor-name-fallback — customer-facing vendor-name slots fall back to the literal "Hearth" when a vendor has neither `display_name` nor `name`: activation-poster.html (`.poster-vendor-name`, ~:416) and send-order-confirmation/index.ts email subject (~:454) + From header (~:460). If triggered, frames "Hearth" over the (missing) vendor — the one place D5's "never frame over the vendor" could break. Blast radius ~nil (cosmetic if vendor name is mandatory at onboarding — worth confirming). Fix: neutral fallback (vendor slug or similar), not "Hearth". Post-launch, low priority. Source: Pass D / D5. — open
- T-E2-early-access-urgency — ✓ DONE 2026-06-16 (#379). "Don't hang about." removed from both the static + AI-composed early-access email in activation.html; honest capacity clause + signature kept. Source: Pass E / E2.
- T-E5-customize-spelling — ✓ DONE 2026-06-16 (#379). "Customize"→"Customise" ×4 on order.html (modal title, button, two aria-labels). Source: Pass E / E5.
- T-E1-scorecard-promotion-copy — ✓ DONE 2026-06-16 (#379). Both scorecard insight lines reworded off "promotion" → "a more focused message to your own customers". Source: Pass E / E1.
- T-E1-bundle-placeholder — ✓ DONE 2026-06-16 (#379). drop-menu.html bundle-name placeholder "Meal deal"→"Family feast" (×2). Source: Pass E / E1.
- T-E1-promotion-plan-rename — PARTIAL. Rendered heading fixed ("Promotion plan"→"Help fill this drop", #379); still OPEN: internal rename of the `reviewPromotionPlan` element id + the drop-manager.html ~:4192 "Promotion plan" code comment. Post-launch, code only. Source: Pass E / E1. — open
- T-E3-stale-nav-labels — PARTIAL. Dry-run-visible labels fixed (#379: home.html card titles, three drop-manager.html "Menu Library"→"Offer", brand-hearth.html error). Still OPEN, folded into T8-3-sub1: vendor-terms.html legal copy, order-entry.html legacy dev tool, home.html card icon glyphs 'ML'/'BH'. Source: Pass E / E3. — open
- T-E4-activation-accent — ✓ DONE 2026-06-16 (#380). Hearthfire (`var(--h-fire)`/`#c4511a`) is the canonical Hearth accent; `#8B6B3F` retired as a Hearth primary but RETAINED as the `--vendor-brand-primary` fallback (must NOT migrate there — brand-bleed). Activation operator-chrome refs migrated; vendor-colour slots held. Source: Pass E / E4.
- T-E4-activation-rgba-tints — finish the Activation Hearthfire convergence: `.act-channel-badge` (~:390) and `.act-social-toggle.is-on` (~:509) couple `#8B6B3F` with `rgba(139,107,63,…)` tints; `.actod-cta:hover` (~:125) uses `#75592f`. Held during #380 to avoid guessing tints. The brand playbook is now committed at `Hearth_Brand_Playbook.md` (§8) with the accent corrected to `#C4511A` / `--h-fire` as the platform accent and `#8B6B3F` recorded only as the vendor-brand fallback — so the "external playbook still names #8B6B3F primary" flag is resolved; the remaining work here is the CSS tint convergence only. Post-launch, low priority. Source: #380. — open
- Product options (menu modifiers) — feature ✓ COMPLETE (PRs #429–#434); see `docs/features/product-options.md` + operational learning #93. Deferred v1 scope (schema supports, UI does not yet write), all open post-launch: **T-opt-per-option-stock** (per-option stock limits); **T-opt-per-drop-override** (per-drop override of an option's `price_delta_pence`); **T-opt-on-bundles** (options on bundle lines — v1 is products-only, `create-order` rejects options on non-product lines); **T-opt-multiselect-groups** (multi-select / min-max groups — v1 writes fixed `1/1/required`). Full spec in BACKLOG.md. — open
- T-sb-bundle-selection-aggregates — bundle *choice selections* render on the Service Board kanban card (Stage 5) but the aggregate views still show bundles parent-only: the "All items" prep sheet and "All orders" compact table have no per-selection breakdown (Stage 6 added *option* counts to the prep sheet, not bundle selection counts). NOT T-sb-3 (the prep-sheet build itself, ✓ COMPLETE #277) — a distinct, previously-untracked gap. Low priority, display-only. See BACKLOG.md. — open

### Tier 6 — Production readiness
- T6-2 — Local development environment — open
- T6-3 — Staging environment — open
- T6-4 — Branch protection and PR review workflow — open
- T6-5 — Supabase Pro upgrade for point-in-time recovery — open (predecessor T-admins-table-migration-backfill ✓ COMPLETE 2026-06-29 / #419 — gate cleared)
- T6-6 — Transactional email via Resend / Postmark — partial (auth/onboarding wired; transactional triggers not built)
- T6-8 — Dev workflow tooling — Claude Code skills, MCP integrations, knowledge base — open
- T-base-ddl-backfill — Committed base-table schema dump. The tracked repo has no reliable machine-checkable dump: `SCHEMA.md` is tracked but documented-stale (learnings #54/#57), the structural JSON dump apparatus (`schema-snapshot/`) exists only as untracked local files (commit it first), and `prod-schema.sql` is an empty untracked placeholder. Then add a plain-SQL `CREATE TABLE` reconstruction. Post-launch; enables SQL-level schema audits. See BACKLOG.md. — open

### Tier 7 — Platform oversight (Phase 1, before ~10 vendors)
- T7-2 — Vendor profile page — open
- T7-3 — Vendor list view — open
- T7-4 — Drop oversight page — open
- T7-5 — Host management page — open
- T7-6 — Aggregate customer base view — open
- T7-7 — Admin event log / audit trail — open
- T7-followup-1 — Service Board order Details tab missing order date/time — open. Small UX gap.

### Tier 7 — Platform oversight (Phase 2, approaching ~100 vendors)
- T7-8 — At-risk vendor detection queue — open
- T7-9 — Cohort analytics — open
- T7-10 — Geographic map view — open
- T7-11 — Platform economics dashboard — open
- T7-12 — Moderation and intervention tooling — open
- T7-13: SUPERSEDED by T3-13 (closed 2026-05-13). Capacity driver multi-mode now in production.
- T7-15 — Admin write capability — open
- T7-17 — Vendor configuration inspector (post-launch) — open
- T7-18 — Vendor impersonation / "act as vendor" (post-launch) — open

### Tier 7 — Monitoring (Phase 1, build soon)
- T7-M1 — External uptime monitoring — open
- T7-M2 — /api/health endpoint — open
- T7-M3 — /admin/status page — open
- T7-M4 — Critical error alerting — open
- T7-M5 — Daily digest email — open
- T7-M6 — Scheduled health checks via cron — open

### Tier 7 — Monitoring (Phase 2, year 2+)
- T7-M7 — Structured logging pipeline — open
- T7-M8 — Error tracking (Sentry) — open
- T7-M9 — Synthetic transaction monitoring — open
- T7-M10 — Documented incident response runbooks — open
- T7-M11 — Public status page at status.lovehearth.co.uk — open

### Support & operations
- T-support-dryrun-checklist — Pre-drop dry-run checklist (document, not code) — open
- T-support-issue-log — Internal vendor issue log — open
- T-support-activation-ideas — manual onboarding runbook: curated per-vendor activation ideas (precursor to T5-C6) — open
- T-support-healthy-habits-env-cleanup — revert the Big Ballz Catering drop's fake live/public test state + clear stray comms_log / interest / order_confirmation test rows before the Healthy Habits vendor walkthrough; audit-first (shared live DB); also resolve the Southbury Farm keep-as-demo-seed vs clear decision — open

### Tier 8 — Platform audit and design system consolidation
- T8-1 — Brand and visual consistency audit — open
- T8-2 — Vendor journey experience audit — open
- T8-3 — ~~Language, copy and tone audit (all operator pages)~~ ✓ COMPLETE
- T8-3-sub1 — Operator pages: "menu" vs "offer" language consistency audit — open
- T8-4 — Design system consolidation — open (depends on T8-1 → T8-3)
- T8-5 — Per-vendor brand colour on generated social card scrims (reveal + capacity cards hardcode the warm-brown fallback instead of var(--vendor-brand-primary); keep html2canvas export faithful; #8B6B3F stays as the no-colour fallback per learning #85) — open

### Tier 9 — Agentic AI workstream
- T9-1 — Auto-draft drops from demand signals — open
- T9-2-positioning — Brand positioning AI from uploaded assets (tagline, about paragraph, target audience) — open.
- T9-2-visual — First-slice visual brand AI for the order page (logo palette extraction, primary_color suggestions, hero suitability, contrast checks) — open. Could land much earlier than T9-2-positioning.
- T9-3 — Proactive host identification — open
- T9-4 — Drop optimisation strategy — open
- T9-5 — Promotion copy generation — open
- T9-6 — At-risk customer flagging — open
- T9-7 — Capacity intelligence (predictive) — open
- T9-8 — Menu suggestion by context — open
- T9-9 — Drop success prediction: pre-publish confidence scoring — open
- T9-10 — Cross-vendor pattern intelligence: transferable archetype improvements — open
- T9-11 — Conversational drop creation: fast-path natural-language input for Drop Studio — open
- T9-12 — Conversational brand setup: fast-path natural-language input for Brand Hearth — open

## Recent updates

Append-only dated log of platform-level closures and rollouts. Older
entries live in the per-ticket BACKLOG.md narratives; this surface is
for quick chronological recall across the whole platform.

- 2026-05-21: Platform admin MVP complete and merged. `admins` table
  + 5 admin Edge Functions (admin-verify, admin-list-vendors,
  admin-get-vendor, admin-list-vendor-drops, admin-list-drop-orders)
  + 3 service-role views (v_admin_vendor_list, v_admin_vendor_drops,
  v_admin_drop_orders) + 2 pages (platform-admin.html,
  platform-admin-vendor.html). ADMIN_UID retired from admin.html,
  invite-vendor, create-vendor (T5-B26 closed). T7-1 cockpit MVP and
  T7-14 multi-admin enabler both closed in the same workstream. Next
  pre-launch item: T-customers-page-import-entry.

- 2026-05-23: T-intelligence-engine-import-recommendation complete and
  verified. Recommendation engine extended to thread
  `customer_data_posture` and `importedCount` through
  `generateRecommendations()`. Edge Function `get-vendor-customer-count`
  widened with optional `source` filter. Recommendation surfaces
  correctly across Home, Customers, and Insights for data-rich vendors
  with no imports yet; suppresses cleanly once the vendor imports 5+
  customers. Admin-aware routing also landed in auth-callback.html —
  admins and vendors share login.html as the platform's single entry
  point. Pre-launch sequence: four items complete, dry-run next.

- 2026-05-29: Activation surface shipped. New top-level operator
  surface for vendor-facing drop activation and communication.

  - Activation surface (activation.html) complete — top-level nav item
    between Service Board and Insights. Two views: cross-drop landing
    (drop cards with progress bar, next action, profile-filtered step
    count) and per-drop timeline (9 touchpoints, profile-filtered by
    drop type and host presence).

  - activation-poster.html — standalone print page accessed via Card 4
    "Print poster" button. Accepts ?drop=<slug>. Uses CSS zoom (not
    transform) for mobile scaling. Auto-triggers window.print() on load
    is not implemented — vendor prints manually via the "Print poster"
    button.

  - Activation visual asset pattern — three downloadable 540×540 PNG
    assets via html2canvas at scale:2: menu card (Card 1), orders-open
    (Card 4), capacity signal (Card 6). All use same image fallback
    chain: reveal product photo → vendor hero → solid brand colour.
    ResizeObserver pattern with disconnect-first guard on all three
    frames.

  - Activation message pattern — Cards 2, 4, 5 use state.messageDrafts
    and state.expandedMessageCards (three-state: collapsed preview /
    edit textarea / done). Both reset on drop switch in showDropView().
    Textarea values flushed into messageDrafts at top of
    renderDropView() to prevent loss on implicit re-renders.

  - Activation email pattern — Cards 3 and 9 use emailCard() with
    styled .act-email-mock showing vendor brand dot, subject, body, and
    sign-off. Live preview updates via delegated input listener on
    #activationContent — patches mock DOM directly without re-render.
    state.emailDrafts persists edits.

  - Drop profile filtering — getDropProfile(summary) returns {cards,
    optional} based on host_name (has host / no host) and drop_type
    (event = private, everything else = public). Four profiles:
    hosted+public (all 9), no-host+public (1,3,4,6,7,8,9),
    hosted+private (1 optional,2,5,7,8,9), no-host+private (1
    optional,7,8,9). Card 7 excluded from progress count (passive
    auto-card, never logs). actLog() stamps dropId:
    state.selectedDropId.

  - Activation progress — getDropProgress(summary) returns {completed,
    total, nextTitle} from state.activationLog filtered by dropId.
    Progress bar and next action line shown on cross-drop landing page
    cards. Progress is in-memory only — resets on page reload
    (consistent with existing log behaviour).

  - Reveal fields (reveal_line, reveal_product_id) owned by Activation
    Card 1. Drop Studio no longer reads or writes these fields.
    getDropPayload() in drop-manager.html does not include reveal_line
    or reveal_product_id.

- 2026-05-30: Pre-launch comms and review pane

  - send-early-access-email Edge Function — deployed. Sends to all
    consented customers (granted/imported) with a valid email for this
    vendor. Input: { vendor_id, drop_id }. Follows T5-11-minimum pattern
    (Resend HTTP, non-fatal per-recipient errors, structured JSON response).
    Deduplicates by lowercase email. Wired to Activation Card 3 "Confirm
    send" — vendor reviews the styled email mock, confirms, function sends.

  - send-post-drop-thankyou Edge Function — deployed. Sends to every
    customer who placed an order in the specific drop (reads from orders
    table by drop_id + customer_email IS NOT NULL). Includes next
    scheduled drop date and ordering link if one exists. Wired to
    Activation Card 9 "Confirm send".

  - Activation Cards 3 and 9 wired — confirm-email handler now maps
    thursday_early_access → send-early-access-email and saturday_thankyou
    → send-post-drop-thankyou. Shows "Sending…" state, logs
    email_confirmed with { sent, total } on success, shows inline retry
    note on failure. actLog() extended to accept optional meta object.
    emailCard done state appends "· N emails sent" when count is present.

  - Review pane promotion plan — informational section added to Drop
    Studio Review pane above "Go to Activation →". Shows two signals:
    (1) host assigned — only shown for hosted/community/event drops, never
    neighbourhood (adding a host to a neighbourhood drop is a model
    violation); (2) previous customers — shown for all drop types. Reuses
    existing readinessItem/pass/fail CSS (fail is amber #b45309, not red).
    Not a publish gate. getDropProfile() drop-type logic is the reference
    for the host/neighbourhood distinction.

- 2026-06-27: T5-A3 Priority 2 Half A complete (#413). Column-safe
  public views for the anon order path — `v_host_public` created
  (`id` / `name` / `host_type`), pre-existing 23-col PII-safe
  `v_vendor_public` reused; `order.html` re-pointed; customer-facing
  host PII (`contact_email` / `contact_phone` / `contact_name`,
  `notes_internal`) off the anon path. Half B (`get-current-vendor` EF
  + four session-identity re-points + `DROP POLICY vendors_select_all`
  capstone) remains — the vendor-data exposure is not yet closed.

- 2026-06-29: T5-A3 Priority 2 Half B complete (#415) — **T5-A3
  Priority 2 fully CLOSED, the vendor-data anon exposure is shut.**
  `get-current-vendor` EF built and deployed (`verify_jwt = false` at
  gateway, in-function `auth.getUser()` JWT verify, service-role read of
  the caller's own `vendors` row by `auth_user_id`; 401 no-JWT / 404
  no-row / 500 unexpected; full-row select by design). All four
  session-identity reads re-pointed onto `invoke('get-current-vendor')`:
  `hearth-vendor.js` `resolveVendor()` boot read (load-bearing),
  `activation-poster.html`, `auth-callback.html`, `set-password.html`.
  The boot read now splits 404→null (security-correct null-on-no-row, no
  `.limit(1)` fallback) from any-other-error→throw — STRICTER than the
  old code, which collapsed both into null; this hardened the
  load-bearing read. The localhost `?vendor=` dev override in
  `hearth-vendor.js` is left in place, intentionally inert post-REVOKE,
  marked with a known-broken comment; proper fix deferred to T6-2 (local
  dev env). CAPSTONE: `vendors_select_all` dropped — confirmed via
  `pg_policy` that only `Vendors: admin insert`, `Vendors: authenticated
  owner select` (inert defence-in-depth, intentionally left) and
  `Vendors: authenticated owner update` remain; no anon SELECT policy.
  Verified on live: every operator surface resolves identity through
  `get-current-vendor` (network tab shows the EF invoke, no direct
  `vendors` REST read); the customer `order.html` renders full vendor
  branding in an incognito/anon session post-REVOKE (`v_vendor_public`
  is a definer view, unaffected by the base-table policy drop). RESIDUAL
  (not blocking, carry forward): Catering Direct adversarial isolation —
  the empirical cross-vendor check is still outstanding (no fixture login
  available tonight). Structurally guaranteed by EF design (resolves
  strictly by the caller's own `auth_user_id`; there is no parameter to
  request another vendor's row). Run before the dry run once Catering
  Direct access is sorted (Robin may hold it).

- 2026-06-30: T-fulfilment-mode-publish-gate (COMPLETE 2026-06-30).
  `drops.fulfilment_mode` carried a
  column-level NOT NULL that contradicted its own CHECK (which permits
  NULL) and blocked `create-drop` — a fresh draft is created with no
  fulfilment_mode by design (the vendor sets it later in the Fulfilment
  section). The guarantee that a *live* drop must have a fulfilment_mode
  existed only client-side (greyed publish button in
  `getLiveReadiness()`) and in the column NOT NULL itself — the server
  gate `transition-drop-status` `evaluateLiveReadiness()` silently
  omitted it. Fix moves the guarantee up to the publish layer before the
  constraint is dropped: (a) added
  `if (!drop.fulfilment_mode) return { ready: false, reason: "Fulfilment
  mode is required" }` alongside the other basics checks (name / slug /
  drop_type) in `evaluateLiveReadiness()`, plus `fulfilment_mode?:
  string | null` on the typed `Drop` interface; (b) migration
  `20260630120000_drop_fulfilment_mode_not_null.sql` —
  `ALTER TABLE drops ALTER COLUMN fulfilment_mode DROP NOT NULL` (CHECK
  left intact). **Ed's order (atomic pair, operational learning #43):
  deploy `transition-drop-status` FIRST (so the publish gate enforces
  the rule), THEN apply the migration, THEN merge.** Deploying the
  function and dropping the NOT NULL in the wrong order would leave a
  window where a live drop could be published with a null
  fulfilment_mode (which 500s every checkout in `create-order`).

## Future architecture

### Frontend framework migration (post-validation)

Priority: Low. Trigger: 5–10 vendors live and model proven.

The current stack (static HTML/JS + Supabase + Netlify) is appropriate
for the validation phase but has a natural ceiling. As platform
complexity grows — more interactive UI, shared components, complex
state, Stripe webhooks, notification flows — raw HTML/JS becomes harder
to maintain and slower to build against.

Migration target: Next.js + Supabase + Netlify (or Vercel).

- Supabase layer (schema, RLS, views, Edge Functions) unchanged
- Frontend rebuilt as a component-based React app
- Netlify supports Next.js natively — no infrastructure change
- Claude Code prompt quality improves significantly on React/Next.js

Do not migrate prematurely — finish Stripe, SMTP, and first live drops
first. When the trigger is met, a short freelance engagement (2–4 weeks)
to scaffold the Next.js app and migrate core pages is the recommended
approach. Resume Claude Code iteration on the new foundations.

No code changes required at this stage. Documentation only.
