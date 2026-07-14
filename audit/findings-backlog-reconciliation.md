# Backlog Reconciliation Audit — findings

Read-only reconciliation of BACKLOG.md / CLAUDE.md open-ticket index against
actual repo state at `origin/main` @ `00d4dac`. Evidence-first (grep-before-conclude).
No fixes applied.

**Method caveat (applies throughout):** the repo has NO `CREATE TABLE` migration
for the base tables `drops`, `orders`, `order_items`, `products`, `hosts`,
`vendors`, `drop_menu_items` (and several feature tables — `drop_signals`,
`activation_events` — were created out-of-band via the SQL editor, not a
committed migration). Any ticket resting on a DB object (column, policy, grant,
trigger, view DDL, table existence) that isn't in `supabase/migrations/` is
classed **NEEDS-ED-VERIFY** with the exact SQL, never inferred.

---

## Headline — tickets whose marked status is WRONG

**Believed OPEN but actually SHIPPED (→ mark complete):**
T2-2, T-ops-rls-cleanup-auth-callback, T5-8*, T5-22*, T5-B18, T5-B24, T5-B29,
T5-B30, T-notify-next-time, T7-16*, T-ACT-1*, T-ACT-4*, T-ACT-5.
(* = code shipped, one Ed DB/deploy check to seal.)

**Marked partial/open but MORE shipped than the index says (re-scope the residual):**
T3-8 (code done, only live-Stripe onboarding left), T5-11 (post-drop-thankyou +
early-access dispatchers also shipped, not just interest-open), T5-25 &
T5-C8 & T5-C4 & T-ACT-3 (delivered via the Activation surface), T6-6
(6 transactional EFs live).

**No OBSOLETE tickets found.** Everything still references live surfaces.

---

## Tier 2 / 3

### T2-2 — LIKELY-SHIPPED
Claim: Service Board — no scroll to reach Kanban; collapsible hero KPI section.
Evidence: `service-board.html:806` `#heroToggleBtn` "Hide summary"; `.heroCollapsible` on filter/exec/hero/capacity rows (`:821,847,863,890`); `renderHeroCollapseState()` (`:2919-2930`) wired at `:3484`; mobile Kanban tab bar (`:251,314-328`).
Assessment: Both remedies (collapsible hero + Kanban reachability) present and wired.
Suggested action: mark complete (Ed eyeball board-above-fold on load).

### T3-8 — PARTIAL (code done; operational residual)
Claim: Stripe Connect Express end-to-end; only remaining work = take Healthy Habits through live onboarding.
Evidence: `create-stripe-connect-link/`, `check-stripe-connect-status/`, `create-stripe-login-link/`, `reconcile-pending-orders/` all present; checkout live via create-order/stripe-webhook/fetch-order/cancel-order. BACKLOG:243 marks code "✓ COMPLETE".
Assessment: All code shipped; residual is live-mode conversion + a real onboarding run (not repo-closable).
Suggested action: keep open but re-scope to "operational: Stripe live-mode + Healthy Habits onboarding" — needs Ed.

### T-ops-rls-cleanup-auth-callback — LIKELY-SHIPPED
Claim: Delete dead direct `vendors.auth_user_id` write in auth-callback.html.
Evidence: no `auth_user_id`, no `.update/.insert/.upsert` on vendors anywhere in auth-callback.html; identity now via `get-current-vendor` EF (`auth-callback.html:437-439`).
Assessment: Dead write already gone (collateral of T5-A3 P2 Half B).
Suggested action: mark complete (confirm via `git log -p` it was removed, not never-committed).

### T-ops-rls-reads-audit — CONFIRMED-OPEN (candidate to retire)
Claim: Standalone SELECT-path audit on RLS tables; deferred to run at T5-A3 start.
Evidence: no reads-audit artefact for this ticket in `audit/`; T5-A3 + operator-read-auth both now COMPLETE (deferral trigger passed).
Assessment: Concern largely subsumed by the closed auth tracks, but no distinct deliverable produced.
Suggested action: needs Ed decision — retire as "subsumed" or produce the checklist.

### T3-12a-fu3 — NEEDS-ED-VERIFY
Claim: Drop dead `drops.is_radius_restricted` column.
Evidence: `is_radius_restricted` appears only in SCHEMA.md + BACKLOG.md — 0 code refs. No DROP migration; base `drops` DDL not in repo.
SQL: `SELECT column_name FROM information_schema.columns WHERE table_name='drops' AND column_name='is_radius_restricted';`
Suggested action: needs Ed — if present, `ALTER TABLE drops DROP COLUMN is_radius_restricted;` as a migration; else close as done.

### T3-12b — CONFIRMED-OPEN
Claim: Radius-mode delivery enforcement (Drop Studio UI, update-drop accept 'radius', order.html Haversine, create-order real validation).
Evidence: create-order still stubs `501 delivery_area_radius_not_supported` (`create-order/index.ts:303`); update-drop rejects radius (`:258`); order.html `checkDeliveryArea()` radius branch returns "can't be checked" fallback (`:4044-4046`).
Suggested action: keep open.

### T3-13-polish-2 — CONFIRMED-OPEN
Claim: Editor chips don't refresh after save (PR #253 fix didn't take).
Evidence: `applySavedRowToState` shallow-merges only `state.products/bundles` (`drop-menu.html:1615-1623`); "sold" chip reads separate `productAnalytics`/`bundleAnalytics` arrays (`:1566-1567`) never patched. No landed fix.
Suggested action: keep open (trace chip render → productAnalytics before editing).

### T3-13-polish-3 — CONFIRMED-OPEN
Claim: Drop Studio Capacity section oversized (design conversation).
Evidence: no committed compaction; ticket defers to design.
Suggested action: keep open (design-first).

---

## Tier 4 — all CONFIRMED-OPEN

### T4-29 — CONFIRMED-OPEN
Series performance view in Insights. Evidence: insights.html + get-insights have zero series-analytics; only a "create a series" nudge (`hearth-intelligence.js:512-513`). Keep open.

### T4-31b-fu1 — CONFIRMED-OPEN
Server-side HEIC fallback EF. Evidence: no convert-heic function in `supabase/functions/`. Keep open (gated on real vendor friction).

### T4-32 — CONFIRMED-OPEN
Order-page map for collection/delivery. Evidence: all `map` hits in order.html are `Array.map()`; no Leaflet/Google/Mapbox/iframe; no Drop Studio toggle. Keep open (depends on T3-12b).

### T4-33 — CONFIRMED-OPEN
GenAI brand copy in Brand Hearth. Evidence: brand-hearth.html has no generate CTA / anthropic / Haiku. Keep open.

### T4-33b — CONFIRMED-OPEN
AI drop copy (Drop Story). Evidence: `drop_intro` field exists (`drop-manager.html:1294,3691,4563`) but no AI generate CTA / anthropic. Keep open.

### T4-34 — CONFIRMED-OPEN
windowCount race on sibling naming. Evidence: `createEventWindow` still query-derives `Window ${windowCount+1}` (`drop-manager.html:5092-5123`); no positional counter. Keep open.

### T4-35 — CONFIRMED-OPEN
Multi-window Close Orders UX. Evidence: parent close fields unconditionally populated (`:3743-3744`), no hide/auto-derive. Keep open.

### T4-36 — CONFIRMED-OPEN
"Create windows" discoverability. Evidence: `#createEventWindowsBtn` manual click only (`:1485,6324-6326`); no auto-materialise. Keep open.

### T4-37b — CONFIRMED-OPEN
Host-direct terms via email. Evidence: no send-host-invite/confirm-host-terms EFs, no host-confirm.html, no `terms_confirmation_token` refs anywhere. Keep open.
(Optional Ed schema check: `SELECT column_name FROM information_schema.columns WHERE table_name='hosts' AND column_name IN ('terms_confirmation_token','host_contact_email');` → expect 0 rows.)

---

## Tier 5 — strategic

### T5-1 — CONFIRMED-OPEN. Route planning/batching. No route/cluster code. Keep open.
### T5-3 — CONFIRMED-OPEN. Host contact-list upload. Only vendor-side customer-import exists. Keep open.
### T5-4 — CONFIRMED-OPEN. Host↔vendor marketplace matching. No matching engine. Keep open.
### T5-6 — CONFIRMED-OPEN. Customer accounts. No account page; customer flow anonymous throughout. Keep open.

### T5-8 — LIKELY-SHIPPED (needs Ed table check)
Claim: Pre-open interest registration; vendor "Signals building" count.
Evidence: `order.html:1760` `#registerInterestBlock`, invokes `register-interest` with `kind='interest'` at preopen (`:2922,3039`); EF upserts `drop_signals` (`register-interest/index.ts`); vendor tile via `get-drop-signals` (`drop-manager.html:3360-3372`); "Signals building" pill (`home.html:1697`). Impl evolved to a `drop_signals(drop_id,customer_id,kind)` table (not `customer_relationships source=interest`).
Assessment: Full mechanic present in code; only the backing table isn't repo-confirmable (no migration).
SQL: `SELECT to_regclass('public.drop_signals');`
Suggested action: mark complete pending Ed confirming `drop_signals` exists in prod.

### T5-9 — CONFIRMED-OPEN. Matured recommendation engine (geo scoring, materialisation, affinity). None of the 3 locked pieces exist; no postcodes.io/demand_score/affinity. Keep open (gated on ≥2 real drops).

### T5-11 — PARTIAL (more shipped than indexed)
Claim: Comms engine V1 — full trigger set + ledger + consent + Haiku.
Evidence SHIPPED: `send-order-confirmation` (via stripe-webhook); `comms_log` migration `20260618120000`; `dispatch-interest-open` + `send-drop-open-email` (pinged by `.github/workflows/comms-dispatch.yml`); `dispatch-post-drop-thankyou` + `send-post-drop-thankyou`; `send-early-access-email`.
Evidence OPEN: no Twilio/SMS (order_ready); no drop_announced/drop_reminder/drop_closing_soon dispatchers; no Haiku body-copy layer; no frequency-cap/consent middleware; no WhatsApp.
Suggested action: keep open (partial) — but refresh the one-line index: post-drop-thankyou + early-access dispatchers also shipped (index credits only "interest-open").

### T5-12 — CONFIRMED-OPEN. Advanced POS/email/booking import connectors. Only CSV path exists. Keep open.
### T5-14 — CONFIRMED-OPEN. Home demand-orchestration dashboard. No demand-cluster/audience-size surface. Keep open (blocked on T5-9).
### T5-15 — CONFIRMED-OPEN. Insights demand/audience intelligence. No postcode-cluster/repeat-rate-over-time/strongest-area. Keep open.
### T5-16 — CONFIRMED-OPEN. `organisations` table. No migration/code refs. Keep open. (Ed: `SELECT to_regclass('public.organisations');` → NULL.)
### T5-17 — CONFIRMED-OPEN. Communities entity. None. Keep open (depends T5-16).
### T5-18 — CONFIRMED-OPEN. Community consent model. No `community_invite`. Keep open (depends T5-17).
### T5-19 — CONFIRMED-OPEN. Community discovery/matching. None. Keep open (depends T5-18).
### T5-20 — CONFIRMED-OPEN. Community-sourced drops. No community targeting in Drop Studio. Keep open.

### T5-21 — CONFIRMED-OPEN. Multi-vendor accounts / vendor picker. No picker; `resolveVendor()` single-row only. Keep open.

### T5-22 — LIKELY-SHIPPED (needs Ed deploy confirm)
Claim: Catering business flow (enquiries modelled as private drops).
Evidence: pages `catering-enquiry.html`, `enquiries.html`; EFs `submit-catering-enquiry`, `list-catering-enquiries`, `get-catering-context`, `convert-catering-enquiry`, `send-catering-confirm`; migrations `20260703120000_create_catering_enquiries.sql` + `20260706120000_comms_log_enquiry_scope.sql`; Activation confirm-send wiring (`activation.html:4701`).
Assessment: Full enquiry→context→convert→confirm stack present — far past the "spec-before-build" state the ticket line implies. Ticket index is stale.
Suggested action: needs Ed to confirm EFs+migrations deployed/merged, then mark complete (or split a named residual).

### T5-23 — CONFIRMED-OPEN. Multi-vendor event hub. `drop_type='event'` is single-vendor; no event-hub object/landing. Keep open.
### T5-24 — CONFIRMED-OPEN (Part 2). Part 1 (POS capture at onboarding) done (`onboarding.html:1525,2255-2256`); no integration write path. Keep open (Part 2 only).

### T5-25 — PARTIAL (delivered via Activation)
Claim: Drop promotion — (0) menu card, (1) AI social copy, (2) poster+QR.
Evidence: Part 0 shipped (PR #268). Part 1: `generate-activation-copy` (Sonnet) + social toggles/caption textareas in activation.html. Part 2: `activation-poster.html` (QR via `qrcode.min.js:13`, reveal_line hero, vendor+date).
Assessment: All three output types exist but delivered under the Activation workstream, not the Drop-Studio/Review-pane surfaces the ticket specced.
Suggested action: needs Ed — mark the deliverables complete with a note that Activation supersedes the original surface plan.

### T5-26 — CONFIRMED-OPEN. Host discovery outreach + "Draft introduction" AI. `relationship_status` stub predates ticket; no AI intro CTA. Keep open.
### T5-27 — CONFIRMED-OPEN. Host platform participation (host auth). No host `auth_user_id`/login/inbox. Keep open.
### T5-C2 — CONFIRMED-OPEN. WhatsApp activation system. No `whatsapp_opt_in`/`source_drop_id`/`wa.me`. Keep open. (Ed: `SELECT column_name FROM information_schema.columns WHERE table_name='customer_relationships' AND column_name IN ('whatsapp_opt_in','source_drop_id');` → 0 rows.)
### T5-C3 — CONFIRMED-OPEN. WhatsApp Business API/Meta. None; gated on C2. Keep open.

### T5-C4 — PARTIAL. Part 1 Review-pane promotion plan shipped (`drop-manager.html:4402`); Part 2 standalone `drop-activation-guide.html` absent. Keep open (Part 2 only).
### T5-C5 — PARTIAL. Only the series-as-default nudge landed (`drop-manager.html:2359` etc, tagged T5-C5); no drift/fill-rate/milestone/gap-alert. Keep open.
### T5-C6 — CONFIRMED-OPEN. Stored `activation_plan` at onboarding. No `activation_plan` refs. Keep open. (Ed: check `vendors` for `activation_plan` columns → 0 rows.)
### T5-C7 — CONFIRMED-OPEN. Early cadence support (drops 1-10). No drift/milestone code. Keep open (build with T5-C5).

### T5-C8 — PARTIAL (send path done; visual template open)
Claim: Platform-sent VISUAL branded email (dish image + Order button) from Activation Card 4.
Evidence: `send-drop-open-email` EF exists (touchpoint `vendor_open`, consent-scoped, `brand_primary_color`), wired to Card 4 (`activation.html:1904-1905,3087,3182`). BUT no `<img>`/hero/dish image in the EF or `_shared/email.ts` — it's text-in-branded-shell.
Suggested action: keep open, re-scoped to just the visual-template layer (send path is done).

### T-comms-automation — CONFIRMED-OPEN. Behaviour-triggered sends + plain-language nudges. Spine exists but drop-signal-driven, not behaviour-triggered; no nudge surface. Keep open.
### T-aggregator-savings-calculator — CONFIRMED-OPEN. why-hearth.html has static commission copy, no interactive calculator. Keep open.

### T-notify-next-time — LIKELY-SHIPPED
Claim: Sold-out waitlist / notify-next-time demand capture.
Evidence: `register-interest` supports `kind='waitlist'` for sold-out/closed (`register-interest/index.ts:5-6,15,45`); order.html demand-capture block tagged `T5-8 / T-notify-next-time` (`:1753-1760,2913`); `waitlist_count` on operator side (`drop-manager.html:3376-3377`).
Assessment: Implemented end-to-end (EF + order card + operator count).
Suggested action: mark complete (shares the `drop_signals` table check with T5-8).

### T-cart-hold-timer — CONFIRMED-OPEN. Visible per-customer cart-hold countdown. Hold exists server-side; order.html shows only static "30 minutes" line; `tickCountdown()` is drop-close, not cart-hold. Keep open.
### T-comms-order-timeline — CONFIRMED-OPEN. comms_log↔orders correlation view. Ledger exists; no join/timeline EF or Insights surface. Keep open.
### T-STRATEGY-1 — CONFIRMED-OPEN. Aggregator Evidence File. why-hearth.html lacks the sourced content (no 95%/CMA/Just Eat/settlement). Keep open (content artifact).
### T-CONTENT-1 — CONFIRMED-OPEN. Healthy Habits proof quote. index.html:1213 still placeholder, no attribution. Keep open (blocked on dry run).
### T-menu-import — CONFIRMED-OPEN. AI menu extract. No extraction EF; drop-menu.html hand-build only. Keep open.
### T-menu-restraint-layer — CONFIRMED-OPEN. Restraint copy at 3 moments. No such copy on Menu/Drop Studio. Keep open.

### T-drop-anticipation-window-default — LIKELY-SHIPPED (verified COMPLETE)
Evidence: `createNewDrop` opensAt = deliveryStart−24h (`drop-manager.html:4959`); `duplicateDrop` mirrors it with explicit comment (`:5025-5033`); `getOpenLeadMinutes()` default 1440 (`:2406`).
Suggested action: confirm the inline ✓ COMPLETE (#369) — verified against source.

---

## Tier 5-B + Build Coherence Audit residuals

### T5-B5 — NEEDS-ED-VERIFY. Schema cleanup (dual item_type, drop_products dedup, drop_capacity relkind, missing FKs, legacy NOT NULLs). No base-table DDL in repo. Ed: `SELECT relkind FROM pg_class WHERE relname='drop_capacity';` + column/FK introspection. Keep open.
### T5-B6 — CONFIRMED-OPEN. `invite-vendor/index.ts:78` still hardcodes `redirectTo: "https://lovehearth.co.uk/set-password.html"`. Keep open.
### T5-B7 — CONFIRMED-OPEN. `create-host/index.ts` has 0 `try` (no top-level catch); invite-vendor has one (`:113`). Keep open (last function of the partial).
### T5-B8 — CONFIRMED-OPEN. invite-vendor inlines cors headers at ~11 Response sites (lines 12,22,31,44,64,71,82,90,102,108,113); no jsonResponse helper. Keep open.
### T5-B9 — CONFIRMED-OPEN. host-profile.html:997 sends `status`; update-host omits it by design (`update-host/index.ts:10`). Dropdown still silently no-ops. Keep open.
### T5-B10 — PARTIAL. A2 addendum shipped (create-drop validates drop_type/audience_scope/fulfilment_mode, `:130-143`); no host_id/capacity_category_id ownership lookups or timing-coherence port. Keep open (broader validation).
### T5-B11 — CONFIRMED-OPEN. "Fulfilment mode set" row added, but capacity-model validity still folded into `basics_complete` (`drop-manager.html:2509-2517`); no distinct capacity readiness row. Keep open.
### T5-B14 — PARTIAL / NEEDS-ED-VERIFY. Write-side host ownership check done in update-drop; RLS-side defence-in-depth not confirmable (no drops/hosts policy DDL in repo). Ed: inspect `pg_policy` on drops/hosts. Keep open (RLS-side).
### T5-B17 — PARTIAL. Manual Authorization-header workaround present (`assets/config.js:~49`); underlying getSession hydration race unresolved (non-repo-verifiable). Keep open (root cause).

### T5-B18 — LIKELY-SHIPPED
Evidence: BACKLOG body says "✓ COMPLETE 2026-05-03, PR #221"; `home.html:1737 renderPaymentsCard` 4 states (`:1705-1747`); `create-stripe-login-link/` exists.
Suggested action: mark complete — remove from CLAUDE.md open index (doc drift only).

### T5-B19 — CONFIRMED-OPEN. CSP eval-blocked warning source not identified; drop-menu.html loads several libs (`:14-18`), no fix recorded. Keep open.
### T5-B21 — CONFIRMED-OPEN. Window-cancel-with-orders refunds. No Stripe refund path (cancel-order only frees capacity). Keep open (post-launch).

### T5-B24 — LIKELY-SHIPPED
Evidence: `reset-password.html:343-357` restores button + `showSent()` (`:321-325`) hides the form on success — stuck-"Sending…" resolved.
Suggested action: mark complete.

### T5-B25 — CONFIRMED-OPEN. admin.html creates vendor row (`:410`) before invite (`:448`); invite failure leaves orphan, no rollback (`:462-467`). Keep open.

### T5-B29 — LIKELY-SHIPPED
Evidence: `order.html:4231-4243` backstops null fulfilment mode with `showCheckoutNotice('Please choose collection or delivery before paying.','error')` before create-order. BACKLOG T5-B33 note: "T5-B29 separately resolved 2026-06-27 by the fulfilment mandate."
Suggested action: mark complete — remove from CLAUDE.md open index (doc drift).

### T5-B30 — LIKELY-SHIPPED
Evidence: `_shared/cors.ts` defines `PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]+--spiffy-tulumba-848684\.netlify\.app$/i` and `isAllowed` echoes matching previews; create-order imports getCorsHeaders (`:3,227`).
Assessment: allow-list defect fixed centrally (success/cancel URL hardcoding is the separate OL#20 concern).
Suggested action: mark complete (optional: sweep all EFs import getCorsHeaders to seal).

### T5-B31 — CONFIRMED-OPEN. Legacy pizzas/capacity_pizzas/max_orders cleanup. `create-order/index.ts:765` still writes `pizzas`; critical rule #8 still mandates it. Keep open.
### T5-B32 — NEEDS-ED-VERIFY. Duplicate anon SELECT policies on products. No policy DDL in repo. Ed: `SELECT policyname,cmd,roles,qual FROM pg_policies WHERE tablename='products';`. Keep open.
### T5-B36 — CONFIRMED-OPEN. duplicate-bundle rollback verification. `duplicate-bundle/index.ts:189-219` best-effort rollback, no post-verify/orphan-id/rpc. Keep open (low-priority hardening).
### T5-B37 — CONFIRMED-OPEN. save-bundle-line UPDATE-path partial failure. `:152-165` returns 400 with line already updated, no rollback (rollback only on INSERT path `:187-199`). Keep open.
### T5-B40 — NEEDS-ED-VERIFY. Audit v_*_enriched vs EF whitelists. View DDL not in repo (only whitelists are). Ed: diff `pg_get_viewdef` columns vs each EF ALLOWED_FIELDS. Keep open.
### T5-B44 — PARTIAL. Re-derivation present (`drop-manager.html:2430 deriveTimingFromDelivery`); publish-time `closes_at > now()` guard ABSENT in both `transition-drop-status/index.ts:105-119` and `getLiveReadiness` (`:2499-2545`). Keep open (the two-sided future-of-now guard).
### T-drop-capacity-anon-grants — NEEDS-ED-VERIFY. Residual non-SELECT anon grants on v_drop_summary/drop_capacity + relkind. No REVOKE/DDL in repo. Ed: `SELECT relkind FROM pg_class WHERE relname='drop_capacity';` + `SELECT grantee,privilege_type FROM information_schema.role_table_grants WHERE table_name IN ('v_drop_summary','drop_capacity') AND grantee='anon';`. Keep open.

### T-A3-host-type-source — CONFIRMED-OPEN. 3 divergent hardcoded host_type option lists (drop-manager.html:1860-1873, host-profile.html:561+, hosts.html:734); no shared constant. Keep open (drift-prevention).
### T-A1-window-gap — CONFIRMED-OPEN. `handleCreateEventWindows` hardcodes `opens_at: new Date().toISOString()` (`drop-manager.html:5271`); the `:null` fallback (`:5134`) is unreachable. Keep open (low priority; defensible).
### T-A4-merged-timing-validation — CONFIRMED-OPEN. `update-drop/index.ts:285-293` validates payload-only, short-circuits on null; partial closes_at update skips ordering check. Keep open (latent).
### T-dup-updated-at-trigger — NEEDS-ED-VERIFY. Two identical updated_at triggers on drops. No CREATE TRIGGER in repo. Ed: `SELECT tgname FROM pg_trigger WHERE tgrelid='drops'::regclass AND NOT tgisinternal;`. Keep open.
### T-schema-regen — CONFIRMED-OPEN / needs live DB. SCHEMA.md stale (repo confirms gaps: 13-value host_type, lifecycle engine migration, audience_scope). Keep open (post-launch).
### T-A6-lifecycle-timestamps — CONFIRMED-OPEN. Engine sets status only (`20260612061555`, no timestamp cols); cancel path unconditionally re-stamps `closed_at` (`transition-drop-status/index.ts:286`). Keep open.
### T-A6-lifecycle-scheduled-state — CONFIRMED-OPEN. No transition writes `status='scheduled'`. Keep open (deferred front half).
### T-B5-retire-delivery-scaffolding — CONFIRMED-OPEN. `getDeliveryChargePence()` (order.html:2285, used `:2327,4108`); create-order validates `delivery_pence` (`:80,175`). `orders.delivery_pence` column presence needs Ed: `SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='delivery_pence';`. Keep open.
### T-B1-landing-mockup — CONFIRMED-OPEN. index.html:993 "26 of 36 slots filled", :999 "10 remaining" fabricated. Keep open (low priority).
### T-B1-deadcode-capacityleft — CONFIRMED-OPEN. `formatCapacityLeft` defined once (order.html:2175), never called. Keep open (trivial).
### T-B3-orders-pizzas-rename — CONFIRMED-OPEN. `create-order/index.ts:765` still writes `pizzas`. Rename needs migration. Keep open (overlaps T5-B31).
### T-A6-vsummary-status-single-source — NEEDS-ED-VERIFY. v_drop_summary in-view 'closed' CASE. View DDL not in repo. Ed: `SELECT pg_get_viewdef('v_drop_summary'::regclass, true);`. Keep open.
### T-C-inline-createClient-host-pages — CONFIRMED-OPEN. Inline createClient in host-terms.html:192, host-profile.html:753, hosts.html:499. Keep open (low priority).
### T-C-rm-onboarding-backup — NEEDS-ED-VERIFY (no repo action). `onboarding_backup.html` absent from working tree, gitignored/untracked. Cannot delete from repo. Ed: confirm/delete on local machine.
### T-D4-reveal-line-semantics — CONFIRMED-OPEN. No dedicated caption column; reveal_line dual-purpose (activation.html writes `:5336,5029,2563`, activation-poster.html reads `:397`). Keep open (blocks T5-25 Part 1).
### T-D5-vendor-name-fallback — CONFIRMED-OPEN. "Hearth" fallbacks: activation-poster.html:419 (`display_name||'Hearth'`), send-order-confirmation/index.ts:484 subject + :490 From (body already `||"Vendor"`). Keep open (low priority).
### T-E1-promotion-plan-rename — CONFIRMED-OPEN (partial remainder). `id="reviewPromotionPlan"` (drop-manager.html:1808, refs :4351,4436) + comment `:4402` remain; only heading was fixed (#379). Keep open (code-only).
### T-E3-stale-nav-labels — CONFIRMED-OPEN (partial remainder). Concrete remainder = home.html icon glyphs `'ML'`/`'BH'` (`:1662,1673`); vendor-terms.html/order-entry.html already neutralised. Keep open (folded into T8-3-sub1).
### T-E4-activation-rgba-tints — CONFIRMED-OPEN. Residual brown: `.actod-cta:hover #75592f` (activation.html:133), `.act-channel-badge` rgba(139,107,63,.10) (`:398-399`), `.act-social-toggle.is-on #8B6B3F` (`:514-517`). Keep open (low priority); playbook update needs Ed.
### T-opt-per-option-stock — CONFIRMED-OPEN. No stock column on product_options (migration `20260704120000`); no stock in EFs. Keep open (needs schema).
### T-opt-per-drop-override — CONFIRMED-OPEN. No per-drop override; get-drop-product-options returns catalog price_delta verbatim (`:108`). Keep open (needs schema).
### T-opt-on-bundles — CONFIRMED-OPEN. create-order enforces products-only (`:550-553`); schema has no bundle-line option path. Keep open.
### T-opt-multiselect-groups — CONFIRMED-OPEN. Schema+EF support min/max/required (migration + save-product-options `:98-109`) but drop-menu.html hardcodes `1/1/required` (`:2903-2904`, comment `:2900`). Keep open (UI-only).
### T-sb-bundle-selection-aggregates — CONFIRMED-OPEN. Kanban shows per-order selections; Stage-6 added option aggregation (service-board.html:1961,2025) but no bundle-selection aggregate (`buildSelectionCounts` → 0 hits). Keep open (display-only).

---

## Tier 6

### T6-2 — CONFIRMED-OPEN. Local dev env. No localhost/env switch in assets/config.js; no prod-schema initial migration. Keep open.
### T6-3 — NEEDS-ED-VERIFY. Staging Netlify/Supabase/DNS. Pure infra, no repo artifact. Ed: confirm staging site/branch/project.
### T6-4 — NEEDS-ED-VERIFY. Branch protection on main. `.github/workflows/` has only comms-dispatch.yml; setting not in-repo. Ed: check repo Settings → Branches.
### T6-5 — NEEDS-ED-VERIFY. Supabase Pro + PITR. Predecessor admins table now committed (`20260629221021`); upgrade is dashboard/billing. Ed: confirm Pro + PITR.
### T6-6 — PARTIAL. 6 transactional EFs live (send-order-confirmation/early-access/post-drop-thankyou/drop-open-email/host-activation-email/catering-confirm); the "triggers not built" note is stale. Residual = auth SMTP domain config (infra). Ed for SMTP/DNS; update stale note.
### T6-8 — CONFIRMED-OPEN. Claude Code skills / MCP / KB. No `.claude/` in repo. Keep open.
### T-base-ddl-backfill — CONFIRMED-OPEN. No `schema-snapshot/`, no `prod-schema.sql`, no base-table CREATE TABLE. Keep open.

---

## Tier 7 — oversight

### T7-2 — PARTIAL. platform-admin-vendor.html has identity/onboarding/Stripe pills + drops table (`:279,518-523`); no revenue-trajectory chart / activity timeline / quick-action writes (needs T7-7). Keep open (MVP subset shipped).
### T7-3 — PARTIAL. platform-admin.html vendor list (T7-1 MVP) present; search/sort not confirmed. Ed/light re-scope. Keep open.
### T7-4 — PARTIAL. Per-vendor drops table exists; no cross-vendor platform-wide drop view. Keep open.
### T7-5 — CONFIRMED-OPEN. Platform host management. hosts.html is vendor-scoped; no admin host surface. Keep open.
### T7-6 — CONFIRMED-OPEN. Aggregate customer view. No unique/postcode/repeat/consent aggregate. Keep open.
### T7-7 — CONFIRMED-OPEN. Admin audit log. No table/EF/write actions. Keep open (blocks T7-15/18).
### T7-8..T7-12 — CONFIRMED-OPEN. At-risk queue / cohort analytics / geo map / economics dashboard / moderation tooling — none exist. Keep open (Phase 2).
### T7-15 — CONFIRMED-OPEN. Admin write capability. Read-only surfaces only. Keep open (depends T7-7).

### T7-16 — LIKELY-SHIPPED (needs Ed SQL)
Evidence: BACKLOG:5846 [2026-06-29] states robin@lovehearth.co.uk holds active `admins` row alongside Ed, "verified in the DB". Data row, not repo code.
Suggested action: mark complete pending `SELECT email,is_active FROM admins;` (expect Ed + Robin active).

### T7-17 — CONFIRMED-OPEN. Vendor config inspector. Drill-down shows drops/orders only. Keep open (deferred).
### T7-18 — CONFIRMED-OPEN. Vendor impersonation. None; depends T7-7. Keep open.
### T7-followup-1 — CONFIRMED-OPEN. SB Details tab missing order date/time. `detailsWrap` (service-board.html:2815-2820) has no date/time; created_at only in "All orders" table (`:1857`). Keep open.

## Tier 7 — monitoring
### T7-M1 — NEEDS-ED-VERIFY. External uptime monitor. Third-party; ping target /api/health (M2) missing. Ed: confirm monitor subscribed.
### T7-M2 — CONFIRMED-OPEN. /api/health endpoint. No health EF/Netlify function/route. Keep open.
### T7-M3 — CONFIRMED-OPEN. /admin/status page. None. Keep open.
### T7-M4 — CONFIRMED-OPEN. Critical error alerting. No alerting EF/workflow. Keep open.
### T7-M5 — CONFIRMED-OPEN. Daily digest email. No digest EF. Keep open.
### T7-M6 — CONFIRMED-OPEN. Scheduled health checks via cron. Cron pattern exists (comms-dispatch.yml) but no health-check EF. Keep open.
### T7-M7 — CONFIRMED-OPEN. Structured logging pipeline. None. Keep open.
### T7-M8 — NEEDS-ED-VERIFY. Sentry. No SDK/DSN in repo. Ed confirm (almost certainly not set up). Keep open.
### T7-M9 — CONFIRMED-OPEN. Synthetic transaction bot. None. Keep open.
### T7-M10 — CONFIRMED-OPEN. Incident runbooks. Only docs/features/product-options.md. Keep open.
### T7-M11 — NEEDS-ED-VERIFY. Public status page. External subdomain; deps M1/M3 open. Ed confirm. Keep open.

---

## Support & operations
### T-support-dryrun-checklist — CONFIRMED-OPEN. No docs/support/dryrun-checklist.md. Keep open.
### T-support-issue-log — CONFIRMED-OPEN / needs Ed. No repo file; spec allows a Google Doc (off-repo). Ed confirm location.
### T-support-activation-ideas — CONFIRMED-OPEN. No docs/support/. Keep open.
### T-support-healthy-habits-env-cleanup — NEEDS-ED-VERIFY. Pure prod-DB state. Ed: check Big Ballz drop status/audience_scope + stray comms_log/interest/order test rows + Southbury demo-seed decision. Keep open.

---

## Tier 8
### T8-1 — CONFIRMED-OPEN. Brand/visual audit. No output in audit/. Keep open.
### T8-2 — CONFIRMED-OPEN. Vendor journey audit. No output. Keep open.
### T8-3-sub1 — PARTIAL. Adjacent renames landed (#379); no platform-wide menu-vs-offer audit + vocabulary decision doc. Keep open.
### T8-4 — CONFIRMED-OPEN. Design system consolidation. No doc; depends T8-1/2. Keep open.
### T8-5 — CONFIRMED-OPEN. Per-vendor brand colour on reveal+capacity scrims (still `#8B6B3F` per BACKLOG:6264). Keep open.

---

## Tier 9 — agentic AI — all CONFIRMED-OPEN
### T9-1 — Auto-draft drops. Only generate-activation-copy uses Anthropic. Keep open.
### T9-2-positioning — Brand positioning AI. No brand-AI EF. Keep open.
### T9-2-visual — Visual brand AI (vision). None. Keep open.
### T9-3 — Proactive host identification. None. Keep open.
### T9-4 — Drop optimisation strategy panel. `get-demand-preview` is narrower; no strategy brief. Keep open.
### T9-5 — One-click promotion copy on publish. AI copy is on Activation, not a Drop-Studio-publish modal. Keep open (overlaps T-ACT-1).
### T9-6 — At-risk customer flagging (40-day). customers.html has lapsed (60-day) segmentation only. Keep open.
### T9-7 — Predictive capacity intelligence. demand-preview descriptive only. Keep open.
### T9-8 — Context-matched menu suggestions. None. Keep open.
### T9-9 — Pre-publish confidence scoring. `computeConfidenceSignal` (drop-manager.html:2901) is a deterministic non-LLM heuristic, not the fill-rate+Haiku Review-pane feature. Keep open.
### T9-10 — Cross-vendor pattern intelligence. None (gated ~20 vendors). Keep open.
### T9-11 — Conversational drop creation. None. Keep open.
### T9-12 — Conversational brand setup. None. Keep open.

---

## Activation (T-ACT)
### T-ACT-1 — LIKELY-SHIPPED. `generate-activation-copy` (claude-sonnet-4-6) invoked in activation.html (`:4784,4932,5021`); tpMap covers host_heads_up/vendor_open/host_link + poster/email (`:4878`). BACKLOG "still template-generated" note is stale. Mark complete pending Ed confirm `ANTHROPIC_API_KEY` set + EF deployed.
### T-ACT-2 — CONFIRMED-OPEN. Cross-drop "today's actions" strip. No actionsStrip/needsAttention. Keep open.
### T-ACT-3 — PARTIAL. Card 3 now gates on has-customers (`activation.html:3445`) but shows generic note, no numeric count (`:3455`). Keep open (count display).
### T-ACT-4 — LIKELY-SHIPPED. `activation-events` EF (sealed store) hydrates each drop's log (`activation.html:1864`), replacing in-memory-only. Caveat: no `activation_events` CREATE TABLE migration in repo. Mark complete pending Ed confirm table exists + EF deployed (consider migration backfill, cf T-base-ddl-backfill).
### T-ACT-5 — LIKELY-SHIPPED. Review pane restructured (drop-manager.html:1755-1825, reveal removed, prominent `#goToActivationBtn` "Share this drop →"). Mark complete (subjective polish).

---

## Summary table — ticket → current mark → suggested

| Ticket | Currently | Suggested |
|---|---|---|
| T2-2 | open | **mark complete** |
| T3-8 | open | keep open (re-scope: operational only) |
| T-ops-rls-cleanup-auth-callback | open | **mark complete** |
| T-ops-rls-reads-audit | open | needs Ed (retire as subsumed?) |
| T3-12a-fu3 | open | needs Ed (SQL) |
| T3-12b | open | keep open |
| T3-13-polish-2 | open | keep open |
| T3-13-polish-3 | open | keep open |
| T4-29 | open | keep open |
| T4-31b-fu1 | open | keep open |
| T4-32 | open | keep open |
| T4-33 | open | keep open |
| T4-33b | open | keep open |
| T4-34 | open | keep open |
| T4-35 | open | keep open |
| T4-36 | open | keep open |
| T4-37b | open | keep open |
| T5-1 | open | keep open |
| T5-3 | open | keep open |
| T5-4 | open | keep open |
| T5-6 | open | keep open |
| T5-8 | open | **mark complete** (Ed: drop_signals exists) |
| T5-9 | open | keep open |
| T5-11 | partial | keep open (refresh index: 2 more dispatchers shipped) |
| T5-12 | open | keep open |
| T5-14 | open | keep open |
| T5-15 | open | keep open |
| T5-16 | open | keep open |
| T5-17 | open | keep open |
| T5-18 | open | keep open |
| T5-19 | open | keep open |
| T5-20 | open | keep open |
| T5-21 | open | keep open |
| T5-22 | open | **mark complete** (Ed: confirm deploy/merge) |
| T5-23 | open | keep open |
| T5-24 | partial | keep open (Part 2) |
| T5-25 | open | **mark complete via Activation** (Ed reconcile) |
| T5-26 | open | keep open |
| T5-27 | open | keep open |
| T5-C2 | open | keep open (Ed: columns absent) |
| T5-C3 | open | keep open |
| T5-C4 | open | keep open (Part 2 only) |
| T5-C5 | open | keep open (series-nudge slice done) |
| T5-C6 | open | keep open (Ed: columns absent) |
| T5-C7 | open | keep open |
| T5-C8 | open | keep open (visual-template layer only; send done) |
| T-comms-automation | open | keep open |
| T-aggregator-savings-calculator | open | keep open |
| T-notify-next-time | open | **mark complete** (Ed: drop_signals exists) |
| T-cart-hold-timer | open | keep open |
| T-comms-order-timeline | open | keep open |
| T-STRATEGY-1 | open | keep open |
| T-CONTENT-1 | open | keep open |
| T-menu-import | open | keep open |
| T-menu-restraint-layer | open | keep open |
| T-drop-anticipation-window-default | complete(inline) | confirm complete |
| T5-B5 | open | needs Ed (SQL) |
| T5-B6 | open | keep open |
| T5-B7 | partial | keep open |
| T5-B8 | open | keep open |
| T5-B9 | open | keep open |
| T5-B10 | partial | keep open |
| T5-B11 | open | keep open |
| T5-B14 | partial | keep open + needs Ed (RLS) |
| T5-B17 | partial | keep open |
| T5-B18 | open | **mark complete** |
| T5-B19 | open | keep open |
| T5-B21 | open | keep open |
| T5-B24 | open | **mark complete** |
| T5-B25 | open | keep open |
| T5-B29 | open | **mark complete** |
| T5-B30 | open | **mark complete** |
| T5-B31 | open | keep open |
| T5-B32 | open | needs Ed (SQL) |
| T5-B36 | open | keep open |
| T5-B37 | open | keep open |
| T5-B40 | open | needs Ed (SQL) |
| T5-B44 | open | keep open (publish-time guard) |
| T-drop-capacity-anon-grants | open | needs Ed (SQL) |
| T-A3-host-type-source | open | keep open |
| T-A1-window-gap | open | keep open |
| T-A4-merged-timing-validation | open | keep open |
| T-dup-updated-at-trigger | open | needs Ed (SQL) |
| T-schema-regen | open | keep open (needs live DB) |
| T-A6-lifecycle-timestamps | open | keep open |
| T-A6-lifecycle-scheduled-state | open | keep open |
| T-B5-retire-delivery-scaffolding | open | keep open (Ed: delivery_pence col) |
| T-B1-landing-mockup | open | keep open |
| T-B1-deadcode-capacityleft | open | keep open |
| T-B3-orders-pizzas-rename | open | keep open |
| T-A6-vsummary-status-single-source | open | needs Ed (view DDL) |
| T-C-inline-createClient-host-pages | open | keep open |
| T-C-rm-onboarding-backup | open | needs Ed (local machine) |
| T-D4-reveal-line-semantics | open | keep open |
| T-D5-vendor-name-fallback | open | keep open |
| T-E1-promotion-plan-rename | partial | keep open (code-only) |
| T-E3-stale-nav-labels | partial | keep open (home.html glyphs) |
| T-E4-activation-rgba-tints | open | keep open |
| T-opt-per-option-stock | open | keep open |
| T-opt-per-drop-override | open | keep open |
| T-opt-on-bundles | open | keep open |
| T-opt-multiselect-groups | open | keep open (UI-only) |
| T-sb-bundle-selection-aggregates | open | keep open |
| T6-2 | open | keep open |
| T6-3 | open | needs Ed |
| T6-4 | open | needs Ed |
| T6-5 | open | needs Ed |
| T6-6 | partial | keep open (SMTP infra; update stale note) |
| T6-8 | open | keep open |
| T-base-ddl-backfill | open | keep open |
| T7-2 | open | keep open (MVP subset shipped) |
| T7-3 | open | keep open (MVP shipped; search/sort?) |
| T7-4 | open | keep open (per-vendor only) |
| T7-5 | open | keep open |
| T7-6 | open | keep open |
| T7-7 | open | keep open |
| T7-8 | open | keep open |
| T7-9 | open | keep open |
| T7-10 | open | keep open |
| T7-11 | open | keep open |
| T7-12 | open | keep open |
| T7-15 | open | keep open |
| T7-16 | open | **mark complete** (Ed: admins SQL) |
| T7-17 | open | keep open |
| T7-18 | open | keep open |
| T7-followup-1 | open | keep open |
| T7-M1 | open | needs Ed |
| T7-M2 | open | keep open |
| T7-M3 | open | keep open |
| T7-M4 | open | keep open |
| T7-M5 | open | keep open |
| T7-M6 | open | keep open |
| T7-M7 | open | keep open |
| T7-M8 | open | needs Ed |
| T7-M9 | open | keep open |
| T7-M10 | open | keep open |
| T7-M11 | open | needs Ed |
| T-support-dryrun-checklist | open | keep open |
| T-support-issue-log | open | needs Ed (off-repo?) |
| T-support-activation-ideas | open | keep open |
| T-support-healthy-habits-env-cleanup | open | needs Ed (prod DB) |
| T8-1 | open | keep open |
| T8-2 | open | keep open |
| T8-3-sub1 | open | keep open |
| T8-4 | open | keep open |
| T8-5 | open | keep open |
| T9-1..T9-12 | open | keep open (all) |
| T-ACT-1 | open | **mark complete** (Ed: API key + deploy) |
| T-ACT-2 | open | keep open |
| T-ACT-3 | open | keep open (count display) |
| T-ACT-4 | open | **mark complete** (Ed: activation_events table) |
| T-ACT-5 | open | **mark complete** |

**Consolidated NEEDS-ED-VERIFY SQL** (run in Supabase SQL editor):
```sql
-- shipped-code table existence
SELECT to_regclass('public.drop_signals');            -- T5-8 / T-notify-next-time
SELECT to_regclass('public.activation_events');       -- T-ACT-4
SELECT to_regclass('public.catering_enquiries');      -- T5-22 (migration exists; confirm applied)
SELECT email, is_active FROM admins;                  -- T7-16 (expect Ed + Robin)
-- dead-column / rename checks
SELECT column_name FROM information_schema.columns WHERE table_name='drops'  AND column_name='is_radius_restricted'; -- T3-12a-fu3
SELECT column_name FROM information_schema.columns WHERE table_name='orders' AND column_name='delivery_pence';       -- T-B5
SELECT column_name FROM information_schema.columns WHERE table_name IN ('orders','drops') AND column_name IN ('pizzas','capacity_pizzas'); -- T-B3/T5-B31
-- policies / grants / relkind
SELECT policyname,cmd,roles,qual FROM pg_policies WHERE tablename='products';                                        -- T5-B32
SELECT relkind FROM pg_class WHERE relname='drop_capacity';                                                          -- T5-B5 / T-drop-capacity-anon-grants
SELECT grantee,privilege_type FROM information_schema.role_table_grants WHERE table_name IN ('v_drop_summary','drop_capacity') AND grantee='anon'; -- T-drop-capacity-anon-grants
-- triggers / view DDL
SELECT tgname FROM pg_trigger WHERE tgrelid='drops'::regclass AND NOT tgisinternal;                                  -- T-dup-updated-at-trigger
SELECT pg_get_viewdef('v_drop_summary'::regclass, true);                                                             -- T-A6-vsummary-status-single-source
-- absence checks
SELECT column_name FROM information_schema.columns WHERE table_name='customer_relationships' AND column_name IN ('whatsapp_opt_in','source_drop_id'); -- T5-C2 (expect 0)
SELECT column_name FROM information_schema.columns WHERE table_name='vendors' AND column_name IN ('activation_plan','activation_plan_generated_at');    -- T5-C6 (expect 0)
```
