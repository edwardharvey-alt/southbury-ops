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
    error response). Migration is in progress: `update-vendor` and
    `create-host` are done; `onboarding.html`, `drop-manager.html`
    drops CRUD, `drop-menu.html` products/bundles/categories,
    `customer-import.html`, and `update-host` are still on the
    direct PostgREST path and silently fail. RLS reads on tables
    without permissive `anon USING (true)` SELECT policies are also
    broken silently (`hosts`, `customer_relationships`, `customers`,
    `drop_series`, `drop_series_schedule`, `order_items`,
    `order_item_selections`, `order_status_events`) — those need
    either `list-X` Edge Functions or relaxed SELECT policies as
    part of the same workstream. See session handover dated 27
    April 2026 for the full migration plan and priority order.

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

## Production mutation/read status

Snapshot of which read/write paths are working in production and which are known broken. Update whenever a PR confirms or breaks a path. Last updated 2026-05-02 after T5-B28 production verification.

- Customer order placement (orders, order_items, order_item_selections, customers, customer_relationships) — WORKING via `create-order` Edge Function. Atomic write of all five tables, Stripe Connect destination charge created, order starts at `status='pending_payment'` and flips to `'placed'` on webhook receipt. Capacity is reserved during the pending_payment window (Stripe expires_at = 1800s).
- Stripe webhook handling — WORKING via `stripe-webhook` Edge Function. Handles `checkout.session.completed` (→ placed/paid), `checkout.session.expired` (→ cancelled/expired), `checkout.session.async_payment_failed` (→ cancelled/failed). Endpoint configured at https://tvqhhjvumgumyetvpgid.supabase.co/functions/v1/stripe-webhook (Stripe Dashboard endpoint name: "brilliant-rhythm").
- Order read on confirmation page — WORKING via `fetch-order` Edge Function. Anonymous, matched-pair authorization (order_id + session_id). Returns order, items (including bundle line selections), drop, vendor, host. Customer-visible fields only — no email, phone, customer_id, contact_opt_in, or platform_fee_pence in response.
- Order cancel-on-return — WORKING via `cancel-order` Edge Function. Idempotent, only flips pending_payment → cancelled. Frees capacity immediately when the customer hits Cancel on Stripe Checkout rather than waiting for Stripe's 30-minute session expiry. Does NOT call Stripe — relies on Stripe's own session expiry to clean up the unused Checkout session.
- Host listing — WORKING via `list-hosts` Edge Function.
- Single-host fetch — WORKING via `get-host` Edge Function.
- Host creation from `hosts.html` — WORKING via `create-host` Edge Function. Sends `terms_accepted: true` and `terms_accepted_at`.
- Host creation from Drop Studio inline ("+ New Host" modal) — WORKING via `create-host`, BUT does NOT capture terms acceptance. Tracked as T4-37.
- Brand Hearth preview-drop host fetch — WORKING via `get-host`.
- Hosts UPDATE (host-profile.html save) — WORKING via `update-host` Edge Function. Whitelisted field updates with vendor-scoped tenancy belt (id + vendor_id) and service-role write. Verified end-to-end in production 2 May 2026.
- Drops INSERT — STILL BROKEN. Tracked as T5-B (drops Edge Function migration). No change in this session's work.
- Categories INSERT (drop-menu.html) — STILL BROKEN. Tracked as T5-B16 / T5-B23. RLS rejects on fresh-vendor inserts.

## Development backlog

Open tickets are tracked in `BACKLOG.md` — see that file when working a specific
ticket. The full historical record (every ✓ COMPLETE entry with its implementation
narrative, every unbuilt-ticket spec) lives there. The list below is a one-line
index of currently open tickets only — not started, partial, or in progress. When
a ticket closes, mark it ✓ COMPLETE in BACKLOG.md and remove its line from this
index.

### Tier 1 — Must work before first real drop
- T1-3 — Home page: fix vendor resolution error (`.catch` on `maybeSingle`) — open

### Tier 2 — Must work before showing anyone
- T2-1 — Global navigation: add all pages to every header — open
- T2-2 — Service Board: remove need to scroll to reach Kanban — open
- T2-8 — Replace hardcoded vendor slug across operator pages — open

### Tier 3 — Should be done before regular use
- T3-8 — Stripe integration: customer checkout Edge Function — partial (Connect Express scaffold complete; checkout not wired)
- T3-12 — Order page: neighbourhood radius enforcement — open

### Tier 4 — Enhancements that will impress
- T4-29 — Series intelligence in Insights — open
- T4-31 — Order page visual polish pass (per-item photography, premium feel) — open
- T4-32 — Order page: map display for collection point and delivery area — open
- T4-33 — Brand Hearth: GenAI copy generation + customisation review — open
- T4-34 — Multiple windows: windowCount race condition on sibling naming — open
- T4-35 — Multiple windows + Close Orders: duplicative timing UX — open
- T4-36 — Multiple windows: discoverability of Create windows action — open
- T4-37 — Drop Studio inline host creation: capture terms acceptance — open

### Tier 5 — Strategic platform features
- T5-1 — Delivery optimisation (route planning) — open
- T5-2 — Demand generation: SMS alerts — open
- T5-3 — Host onboarding: contact list upload — open
- T5-4 — Marketplace evolution: host-to-vendor matching — open
- T5-6 — Customer accounts (order history, saved addresses) — open
- T5-8 — Interest registration: signals mechanic — open
- T5-9 — Recommendation engine: matured intelligence — open
- T5-11 — Comms engine V1 (transactional + demand generation email) — open
- T5-12 — Vendor customer data import: advanced (POS / email / booking integrations) — open
- T5-14 — Home page: demand orchestration dashboard — open
- T5-15 — Insights: demand and audience intelligence layer — open
- T5-16 — Organisations: shared entity for hosts and communities — open
- T5-17 — Communities: first-class entity — open
- T5-18 — Community consent and permissions model — open
- T5-19 — Community-to-vendor matching and discovery — open
- T5-20 — Community-sourced drops — open
- T5-21 — Multi-vendor accounts — open
- T5-22 — Catering business flow — open
- T5-23 — Multi-vendor events — open
- T5-24 — POS integration: full integration — partial (Part 1 complete; Part 2 deferred until live vendor friction confirms)
- T5-25 — Drop promotion: marketing copy + print assets — open
- T5-26 — Host discovery outreach (V1 vendor-mediated, V2 platform-mediated) — open
- T5-27 — Host platform participation (six phases) — open

GenAI shared principles (model choice, hard rules, cost framing) live in
BACKLOG.md alongside the ticket specs that depend on them — read there before
building any T4-33, T5-9, T5-11, T5-25 or T5-26 work.

### Tier 5-A — Auth workstream
- T5-A3 — RLS rewrite: server-side vendor scoping — open

### Tier 5-B — Platform improvements
- T5-B5 — Schema cleanup: legacy artefacts and missing constraints — open
- T5-B6 — invite-vendor: hardcoded production redirect URL — open
- T5-B7 — Edge Functions missing top-level try/catch — partial (create-host remaining)
- T5-B8 — invite-vendor: doesn't use jsonResponse helper — open
- T5-B9 — host-profile.html: host-status-field no-ops after update-host migration — open
- T5-B10 — Server-side payload validation on create-drop / update-drop — partial (create-drop remaining)
- T5-B11 — Drop Studio readiness checklist: surface capacity row explicitly — open
- T5-B14 — Cross-vendor host-poisoning: defence-in-depth on RLS — partial (write-side closed; RLS-side outstanding)
- T5-B16 — drop-menu.html: category INSERT blocked by RLS — open
- T5-B17 — Underlying auth-not-attached client bug — partial (header workaround in place; root cause not resolved)
- T5-B18 — Stripe status visibility surface — open
- T5-B19 — drop-menu.html: CSP eval-blocked warning — open
- T5-B21 — Window cancellation with existing orders (refunds + audit trail) — open
- T5-B22 — Customer-flow: order_items RLS insert fails (orphan orders rows) — ✓ COMPLETE 2026-05-01. Resolved by full migration to Edge Functions across three phases: Phase 1 schema migration (pending_payment status, vendor.platform_fee_pct, orders.platform_fee_pence, view updates for capacity reservation); Phase 2 create-order + stripe-webhook with Stripe Connect destination charges (PR #204); Phase 3 fetch-order + cancel-order + order.html and order-confirmation.html rewire (merged 2026-05-01). End-to-end verified with real Stripe test card on production.
- T5-B29 — Multi-window parent drop fulfilment.mode bug — open. When ordering against a drop with `window_group_id` set and `fulfilment_mode = null` (the multi-window parent pattern), `buildCheckoutPayload()` in order.html sends `fulfilment.mode: null` and create-order rejects with 400. Either: (a) order.html's window-selection step in init() should route customers to a child drop before allowing basket entry, or (b) `buildCheckoutPayload` should read `fulfilment_mode` from the selected child window rather than `state.drop`. Also: `validateCheckout()` should refuse to submit when `fulfilment.mode` is null, surfacing a user-friendly error instead of relying on the server's 400. Discovered during Phase 3 manual testing on 2026-05-01.
- T5-B30 — Edge Function CORS allow-list excludes Netlify deploy previews — open. All current Edge Functions hardcode `ALLOWED_ORIGIN = 'https://lovehearth.co.uk'`, which means deploy previews on `*.netlify.app` cannot exercise the customer flow. Phase 3 testing had to be completed against production after merge rather than against the deploy preview. Widen the allow-list to include the Netlify preview domain pattern, or accept the limitation and document it in the PR template (deploy preview testing requires merge-to-prod for final visual confirmation).
- T5-B31 — Legacy capacity columns cleanup — open. `orders.pizzas` (NOT NULL CHECK >= 1), `drops.capacity_pizzas`, `drops.max_orders` are still being populated as `Math.max(1, capacity_units)`. Audit all read sites for these columns; remove those reads; then drop the columns. Currently written-only by the create-order Edge Function (line marked with `// LEGACY: see SCHEMA.md — orders.pizzas column slated for removal`). Bounded one-session piece of work.
- T5-B23 — categories RLS violation on fresh-vendor inserts — open, blocks production
- T5-B24 — Password reset page: button stuck on "Sending..." — open (cosmetic)
- T5-B25 — admin.html: vendor creation is not atomic — open
- T5-B26 — ADMIN_UID hardcoded in two places — open

### Tier 6 — Production readiness
- T6-2 — Local development environment — open
- T6-3 — Staging environment — open
- T6-4 — Branch protection and PR review workflow — open
- T6-5 — Supabase Pro upgrade for point-in-time recovery — open
- T6-6 — Transactional email via Resend / Postmark — partial (auth/onboarding wired; transactional triggers not built)

### Tier 7 — Platform oversight (Phase 1, before ~10 vendors)
- T7-1 — Platform health cockpit — open
- T7-2 — Vendor profile page — open
- T7-3 — Vendor list view — open
- T7-4 — Drop oversight page — open
- T7-5 — Host management page — open
- T7-6 — Aggregate customer base view — open
- T7-7 — Admin event log / audit trail — open

### Tier 7 — Platform oversight (Phase 2, approaching ~100 vendors)
- T7-8 — At-risk vendor detection queue — open
- T7-9 — Cohort analytics — open
- T7-10 — Geographic map view — open
- T7-11 — Platform economics dashboard — open
- T7-12 — Moderation and intervention tooling — open
- T7-13 — Capacity driver concept and modelling — open
- T7-14 — Multi-admin access (admins table) — open
- T7-15 — Admin write capability — open
- T7-16 — Business partner admin access — open

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

### Tier 8 — Platform audit and design system consolidation
- T8-1 — Brand and visual consistency audit — open
- T8-2 — Vendor journey experience audit — open
- T8-3 — Language, copy, and tone audit — open
- T8-4 — Design system consolidation — open (depends on T8-1 → T8-3)

### Tier 9 — Agentic AI workstream
- T9-1 — Auto-draft drops from demand signals — open
- T9-2 — Brand configuration AI — open
- T9-3 — Proactive host identification — open
- T9-4 — Drop optimisation strategy — open
- T9-5 — Promotion copy generation — open
- T9-6 — At-risk customer flagging — open
- T9-7 — Capacity intelligence (predictive) — open
- T9-8 — Menu suggestion by context — open

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
