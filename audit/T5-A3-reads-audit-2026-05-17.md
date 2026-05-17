# T5-A3 reads audit — 2026-05-17

**Ticket:** T5-A3 — RLS rewrite: server-side vendor scoping (reads-audit step,
the audit T-ops-rls-reads-audit is the bounded sub-task being executed here).

**Date:** 2026-05-17.

**Status:** READ-ONLY. No code edits. No HTML / JS / config changes. No
Supabase policy changes. No Edge Function changes. No remediation
attempted. Output is this file plus a SQL block (Section D) for Ed to
run in the Supabase SQL editor.

**Hard prerequisite for any T5-A3 remediation:** the policy SQL drafted
for T5-A3 (removing permissive `anon USING (true)` SELECT policies on
`drops`, `products`, `bundles`, `categories`, `drop_menu_items`,
`vendors`) MUST NOT be run until every RED queue entry in Section C
below has been remediated (migrated to an Edge Function, or relaxed
to a genuinely-public read of a scoped view, or explicitly accepted
because it sits behind a properly-authenticated path). Per CLAUDE.md
operational learnings #12 / #14 / #16 the permissive anon policies
are currently the only thing keeping a large slice of operator-page
reads functional — removing them before the RED queue is closed will
silently empty those reads (Variant 3 of operational learning #14)
and the symptom will read as "page suddenly has no data" rather than
as a failed request.

---

## Section A — Prerequisite verification (handover vs source)

### A.1 — BACKLOG.md T5-A3 entry (verbatim)

```
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
```

### A.2 — BACKLOG.md T-ops-rls-reads-audit entry (verbatim)

```
T-ops-rls-reads-audit — silent SELECT filtering audit

**Status:** Open. Tier 3. Deferred — addressable during T5-A auth migration.

**Problem:** T-ops-rls-audit covered direct PostgREST *writes* against
RLS-protected tables. It did not cover *reads*. The Variant 3 failure
mode in operational learning #14 is RLS silently returning zero rows
on reads when the JWT isn't attached. The bug presents as "empty
data" rather than "failed write" — pages look like they have nothing
to show rather than failing visibly, which makes it harder to detect.

**Scope:** a separate audit of SELECT paths on RLS-protected tables,
identifying every read path that depends on the JWT being attached.
Each finding triages into: (a) migrate to Edge Function, (b) relax
SELECT policy (only where the data is genuinely public, e.g. live
drops on host-view), or (c) accept current state because the read
happens through an authenticated path that does correctly attach.

**Why deferred:** T5-A1 through T5-A7 are the vendor auth workstream
— they replace URL-param vendor resolution with session-based
identity and rewrite RLS to use `auth.uid()` properly. Most read-path
silent filtering will be resolved as a side-effect of T5-A3 (RLS
rewrite). Running this audit before T5-A3 risks producing findings
that the auth rewrite then makes obsolete.

**Trigger to revisit:** start of T5-A3 build. The audit becomes a
checklist for the rewrite rather than a standalone workstream.

**Cross-reference:** T5-A3 (RLS rewrite, dependency), operational
learning #14 (auth-not-attached symptom, Variant 3 silent SELECT
filtering).
```

### A.3 — CLAUDE.md "Production mutation/read status" (verbatim)

```
## Production mutation/read status

Snapshot of which read/write paths are working in production and
which are known broken. Update whenever a PR confirms or breaks a
path. Last updated 2026-05-16 after T5-11-minimum shipped (PR #266)
— order_confirmed transactional email is the first application-level
Resend send in production.

- Customer order placement (orders, order_items, order_item_selections,
  customers, customer_relationships) — WORKING via `create-order` Edge
  Function. Atomic write of all five tables, Stripe Connect destination
  charge created, order starts at `status='pending_payment'` and flips
  to `'placed'` on webhook receipt. Capacity is reserved during the
  pending_payment window (Stripe expires_at = 1800s).
- Stripe webhook handling — WORKING via `stripe-webhook` Edge Function.
  [...]
- Order confirmation email (order_confirmed transactional trigger) —
  WORKING via `send-order-confirmation` Edge Function as of 2026-05-16
  (PR #266). [...]
- Order read on confirmation page — WORKING via `fetch-order` Edge
  Function. Anonymous, matched-pair authorization (order_id + session_id).
  Returns order, items (including bundle line selections), drop, vendor,
  host. Customer-visible fields only — no email, phone, customer_id,
  contact_opt_in, or platform_fee_pence in response.
- Order cancel-on-return — WORKING via `cancel-order` Edge Function. [...]
- Service Board order status transitions (`orders.status` UPDATE and
  `order_status_events` INSERT) — WORKING via `transition-order-status`
  Edge Function as of 2026-05-15. [...]
- Host listing — WORKING via `list-hosts` Edge Function.
- Single-host fetch — WORKING via `get-host` Edge Function.
- Host creation from `hosts.html` — WORKING via `create-host` Edge Function.
- Host creation from Drop Studio inline ("+ New Host" modal) — WORKING
  via `create-host`, BUT does NOT capture terms acceptance (T4-37).
- Brand Hearth preview-drop host fetch — WORKING via `get-host`.
- Hosts UPDATE (host-profile.html save) — WORKING via `update-host`.
- Drops INSERT / UPDATE / status transitions — WORKING via `create-drop`,
  `update-drop`, `transition-drop-status`, `assign-menu-items`,
  `create-host`, and `remove-event-window`.
- Onboarding writes (vendors, host context, terms acceptance) — WORKING
  via `update-vendor` and `complete-onboarding`.
- Vendor hero image upload — WORKING via `update-vendor` + direct
  storage.from('vendor-assets').upload(...).
- Categories INSERT / UPDATE / DELETE — WORKING via `create-category`,
  `update-category`, `delete-category` (T5-B16 batch 1).
- Products INSERT / UPDATE / DELETE — WORKING via `create-product`,
  `update-product`, `delete-product` (T5-B16 batch 2).
- Bundles INSERT / UPDATE / DELETE — WORKING via `create-bundle`,
  `update-bundle`, `delete-bundle`, `duplicate-bundle`,
  `save-bundle-line`, `delete-bundle-line` (T5-B16 batch 3).
- customer-import.html writes — WORKING via `bulk-create-customers`
  (T-ops-rls-customer-import closed 2026-05-15).
- Category creation on a fresh vendor — WORKING end-to-end as of
  2026-05-03 (closes T5-B23).
```

The CLAUDE.md section is overwhelmingly a *write*-path inventory. It
does not enumerate read paths — that is precisely the gap T-ops-rls-
reads-audit was logged to close, and is the scope of this report.

### A.4 — Reconciliation table (handover claims vs source)

| Handover claim                                              | Source check                                                                                          | Confirmed? |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------- |
| T5-A2 (Link vendors to auth users) ✓ COMPLETE               | BACKLOG.md line 2466: `T5-A2: Link vendors to auth users ✓ COMPLETE`                                  | YES        |
| T5-A4 (Login page) ✓ COMPLETE                               | BACKLOG.md line 2514: `T5-A4: Login page ✓ COMPLETE`                                                  | YES        |
| T5-A5 (Session-aware `resolveVendor()`) ✓ COMPLETE          | BACKLOG.md line 2521: `T5-A5: Session-aware ...resolveVendor() ✓ COMPLETE`                            | YES        |
| T5-A6 (Vendor provisioning) ✓ COMPLETE                      | BACKLOG.md line 2532: `T5-A6: Vendor provisioning ✓ COMPLETE`                                         | YES        |
| T5-A7 (Logout) ✓ COMPLETE                                   | BACKLOG.md line 2546: `T5-A7: Logout ✓ COMPLETE`                                                      | YES        |
| T5-B16 (Catalog writes migration) ✓ COMPLETE                | CLAUDE.md status block: Categories / Products / Bundles all WORKING via Edge Functions (PRs #209/211/212) | YES    |
| T5-B34 (saveSortOrderBatch migration) ✓ COMPLETE            | BACKLOG.md line 3153: `T5-B34: ...✓ COMPLETE 2026-05-03. Shipped via PR #214`                         | YES        |
| T5-B42 (drops table reads migration) ✓ COMPLETE             | BACKLOG.md line 3552: `### T5-B42 ... ✓ COMPLETE` shipped across PRs #244 / #246 / #247                | YES        |
| T5-B39 (orders permissive anon SELECT/UPDATE removed) ✓ COMPLETE | BACKLOG.md line 3457: `T5-B39: Orders RLS audit ... ✓ COMPLETE 2026-05-03`                       | YES        |
| T-ops-rls-fix (transition-order-status Edge Function) ✓ COMPLETE | CLAUDE.md line 1247: `T-ops-rls-fix closed 2026-05-15`                                            | YES        |
| T-ops-rls-customer-import (bulk-create-customers EF) ✓ COMPLETE  | CLAUDE.md line 1249: `T-ops-rls-customer-import closed 2026-05-15`                                | YES        |

**No mismatches surfaced.** Every handover claim of COMPLETE is
confirmed in either BACKLOG.md or CLAUDE.md (most in both). The
27-April RLS audit referenced in the T5-A3 extension block is the
canonical input to the policy SQL that ships later — that audit's
findings stand: `drops`, `products`, `bundles`, `categories`,
`drop_menu_items`, `vendors` all still carry permissive `anon USING
(true)` SELECT policies in production until the T5-A3 cleanup runs
(which is what this audit is gating).

### A.5 — Prior 14-May audit file

The audit/ directory did not exist before this commit. **The prior
14-May audit file referenced by the handover (`audit/*rls*2026-05-14*`)
was not found in source.** `cat audit/*rls*2026-05-14*` returned the
"no such file" sentinel. CLAUDE.md does reference a "T-ops-rls-audit
(2026-05-15)" in passing (line 1247, the T-ops-rls-fix closure block,
which calls out the audit as "produced the inventory that bounded
this fix and surfaced T-ops-rls-customer-import,
T-ops-rls-cleanup-auth-callback, T-ops-rls-reads-audit"). That
inventory was a *writes* audit per the T-ops-rls-reads-audit ticket
body in A.2. **No standalone reads-audit file from 14-May or 15-May
exists in the repo.** This 2026-05-17 file is the first reads-audit
artefact.

---

## Section B — Reads inventory

Direct PostgREST / RPC / REST references discovered by the audit grep.
Storage operations (`storage.from(...)` upload / remove / getPublicUrl)
are noted separately at the bottom — they are not the subject of this
audit but are listed for completeness so future readers don't have to
re-grep.

Conventions:
- **Surface = operator**: page is behind the vendor session, uses
  `vendor-nav.js`, expects `resolveVendor()` to return a logged-in
  vendor. **Surface = post-auth**: page is part of the auth handshake
  (set-password.html / auth-callback.html) — runs under a fresh
  session that is technically authenticated but very specific in
  shape. **Surface = customer-public**: page is the customer ordering
  surface (order.html) or the host-facing read-only view
  (host-view.html) — no login. **Surface = dev-tool**: legacy /
  developer-only.
- **Op = read** unless the row body shows `.insert/.update/.delete/
  .upsert`, in which case the row is marked **write** and tagged
  **OUT OF SCOPE** (writes are not the subject of this audit; see
  CLAUDE.md "Production mutation/read status" for the writes
  inventory).
- **Category**: GREEN / AMBER / RED per the prompt definition.
  Provisional pending Section D SQL output. Section E lists rows
  whose final category depends on the SQL output.

| File                          | Line | Table / view                              | Op    | Surface           | Cat   | Notes |
| ----------------------------- | ---- | ----------------------------------------- | ----- | ----------------- | ----- | ----- |
| set-password.html             | 443  | vendors                                   | read  | post-auth         | AMBER | Reads only `slug, onboarding_completed` filtered by `auth_user_id = userId`. Sits behind a fresh password-set session. If the publishable-key auth-attach bug fires this returns zero rows — but the set-password flow is exactly where the user *just* set up their session, so the JWT attachment should be the most reliable case. Provisional AMBER. |
| auth-callback.html            | 400  | vendors                                   | read  | post-auth         | AMBER | Reads `id, onboarding_completed` filtered by `auth_user_id`. Same shape as above. Plus auth-callback.html is also listed by T-ops-rls-cleanup-auth-callback as containing dead-code backstop writes (separate ticket, out of scope for this audit). |
| assets/hearth-vendor.js       | 33   | vendors                                   | read  | operator (shared) | RED   | `resolveVendor()` session-based path: `.from('vendors').select('*').eq('auth_user_id', session.user.id)`. This is the read every operator page depends on at boot. The `vendors` table still has permissive `anon USING (true)` SELECT (per the 27-April audit) which is what's keeping this working today — the publishable-key JWT is silently not attached but the anon policy returns the row anyway, with the page-side `.eq('auth_user_id', ...)` doing the actual scoping. After the T5-A3 cleanup removes the anon SELECT this will hard-break unless the user JWT is properly attached or this read is moved into an Edge Function (`get-current-vendor`). MIGRATE-TO-EDGE-FUNCTION. |
| assets/hearth-vendor.js       | 44   | vendors                                   | read  | operator (localhost dev override) | AMBER | Only fires on `localhost` per the gated dev override. Not a production surface. |
| home.html                     | 1214 | products                                  | read  | operator          | RED   | `.eq('vendor_id', vendorId)`. Table has permissive anon SELECT. Vendor scoping is currently page-side only. |
| home.html                     | 1215 | bundles                                   | read  | operator          | RED   | Same shape as products. |
| home.html                     | 1216 | v_hearth_summary                          | read  | operator          | RED?  | View — final category depends on whether the view carries `security_invoker` (Section D query 3). Frontend filters on `vendor_id` only. |
| home.html                     | 1217 | v_hearth_drop_stats                       | read  | operator          | RED?  | Same as above. |
| home.html                     | 1218 | customer_relationships (join customers)   | read  | operator          | RED   | `.eq('owner_id', vendorId).eq('owner_type', 'vendor')` joining customers(name, email, postcode, phone). CLAUDE.md operational learning #6 confirms `customer_relationships` is `ALL operations, authenticated role only` and `customers` is `SELECT-only, authenticated role only`. Under the publishable-key auth-attach bug authenticated requests get treated as anon → silent empty result. **Symptom matches Variant 3 of operational learning #14** — page renders "no customers" rather than failing visibly. Customer PII (email, phone, postcode) sits behind this read. |
| home.html                     | 1219 | orders                                    | read  | operator          | RED   | `.select('customer_email, created_at').in('drop_id', vendorDropIds)`. Customer email PII. After T5-B39 closed (2026-05-03) the orders permissive anon SELECT is removed — this read should be silently failing in production today under the publishable-key auth-attach bug. Either currently broken or only working because of a still-present overlapping policy (Section D query 1 confirms). MIGRATE-TO-EDGE-FUNCTION. |
| home.html                     | 1220 | v_item_sales                              | read  | operator          | RED?  | View — Section D query 3 informs. |
| home.html                     | 1221 | v_host_performance                        | read  | operator          | RED?  | Same. |
| insights.html                 | 1083 | v_hearth_drop_stats                       | read  | operator          | RED?  | Same view-categorisation dependency. |
| insights.html                 | 1084 | v_hearth_revenue_over_time                | read  | operator          | RED?  | Same. |
| insights.html                 | 1085 | v_item_sales                              | read  | operator          | RED?  | Same. |
| insights.html                 | 1086 | v_host_performance                        | read  | operator          | RED?  | Same. |
| insights.html                 | 1099 | orders                                    | read  | operator          | RED   | `.select('id, drop_id, created_at').in('drop_id', dropIds)`. Same orders-RLS issue as home.html:1219. MIGRATE-TO-EDGE-FUNCTION. |
| service-board.html            | 1713 | v_drop_summary                            | read  | operator          | RED?  | List read filtered `.eq('vendor_id', state.vendorId)`. CLAUDE.md operational learning #1 calls out that `v_drop_summary` has *no RLS safety net*. After T5-A3 the view needs either RLS or security_invoker, or this read needs migrating. |
| service-board.html            | 1752 | products                                  | read  | operator          | RED   | `.select('id, category_id, capacity_units').in('id', missingIds)`. Permissive anon SELECT keeps it working today. |
| service-board.html            | 1780 | v_order_item_detail_expanded              | read  | operator          | RED?  | View read filtered by `drop_id`. Final category Section D query 3 dependent. Carries order detail (likely PII / order body). |
| service-board.html            | 1792 | v_order_item_detail_v2                    | read  | operator          | RED?  | Same. |
| service-board.html            | 1804 | v_order_item_detail                       | read  | operator          | RED?  | Same. |
| service-board.html            | 1824 | v_drop_summary                            | read  | operator          | RED?  | `.eq('drop_id', state.selectedDropId).single()` — single-row. Same RLS-on-view concern. |
| service-board.html            | 1825 | v_drop_orders_summary                     | read  | operator          | RED?  | Order-list view by drop. Almost certainly carries customer contact fields. Section D query 3 plus a manual inspection of the view definition later will confirm. |
| scorecard.html                | 665  | v_drop_summary                            | read  | operator          | RED?  | `.eq('drop_id', dropId)`. View RLS dependency. CLAUDE.md operational learning #1 (cross-vendor assertion required after fetch). |
| scorecard.html                | 685  | v_item_sales                              | read  | operator          | RED?  | Same view-categorisation dependency. |
| scorecard.html                | 686  | orders                                    | read  | operator          | RED   | `.select('customer_email, drop_id').eq('drop_id', dropId)`. Customer PII. Same orders-RLS issue. |
| scorecard.html                | 687  | orders                                    | read  | operator          | RED   | `.select('customer_email, drop_id').eq('vendor_id', state.vendorId)`. Customer PII. Same orders-RLS issue. |
| hosts.html                    | 558  | v_drop_summary                            | read  | operator          | RED?  | Vendor-scoped drop aggregation. View RLS dependency. |
| order-entry.html              | 142  | (REST passthrough wrapper)                | read  | dev-tool          | AMBER | Legacy file marked in CLAUDE.md as "Dev tool for test order entry (legacy, needs rebuild)". Out of mainline. |
| order-entry.html              | 150  | (REST passthrough wrapper)                | write | dev-tool          | AMBER | OUT OF SCOPE — write. Same legacy-dev-tool framing. |
| customers.html                | 731  | customer_relationships (join customers)   | read  | operator          | RED   | Same shape as home.html:1218. Customer PII. RLS authenticated-only per operational learning #6. Currently silently failing or partially-failing depending on overlapping policies. |
| customers.html                | 743  | drops                                     | read  | operator          | RED   | `.select('id').eq('vendor_id', state.vendorId)`. After T5-B42 closed (2026-05-12) most drops reads moved to Edge Functions — but this one in customers.html is not in the T5-B42 inventory and is still on direct PostgREST. Permissive anon SELECT (status = 'live'/'scheduled'/'completed') keeps draft drops invisible — symptom for a vendor with only draft drops would be undercounted customers. |
| customers.html                | 748  | orders                                    | read  | operator          | RED   | Same shape as home.html:1219. Customer PII. |
| customers.html                | 830  | v_hearth_drop_stats                       | read  | operator          | RED?  | View dependency. |
| customers.html                | 831  | v_item_sales                              | read  | operator          | RED?  | Same. |
| customers.html                | 832  | v_host_performance                        | read  | operator          | RED?  | Same. |
| drop-menu.html                | 1520 | categories                                | read  | operator          | RED   | `.eq('vendor_id', state.vendorId)`. Permissive anon SELECT on categories — frontend-only scoping. |
| drop-menu.html                | 1521 | v_products_enriched                       | read  | operator          | RED?  | View dependency. |
| drop-menu.html                | 1522 | v_bundles_enriched                        | read  | operator          | RED?  | Same. |
| drop-menu.html                | 1523 | v_menu_library_items                      | read  | operator          | RED?  | Same. |
| drop-menu.html                | 1524 | v_product_analytics                       | read  | operator          | RED?  | Same. |
| drop-menu.html                | 1525 | v_bundle_analytics                        | read  | operator          | RED?  | Same. |
| drop-menu.html                | 1557 | v_bundle_lines_enriched                   | read  | operator          | RED?  | Same. |
| drop-menu.html                | 1572 | v_bundle_line_choice_products_enriched    | read  | operator          | RED?  | Same. |
| drop-menu.html                | 3220 | drop_menu_items                           | read  | operator          | RED   | `.select('drop_id, drops(name)').eq(col, itemId)`. Foreign-table join into `drops`. Permissive anon SELECT on `drop_menu_items` and on `drops` keeps it working today. |
| host-view.html                | 413  | v_drop_summary                            | read  | customer-public   | AMBER | Host-facing read-only page. No login. The view is *meant* to be publicly readable for hosts sharing their drop link. Provisional AMBER pending confirmation that the view exposes no PII (vendor contact, customer fields) — Section D query 3 informs. RELAX-ONLY-IF-TRULY-PUBLIC. |
| host-view.html                | 444  | v_drop_summary                            | read  | customer-public   | AMBER | Same. |
| drop-manager.html             | 2722 | customer_relationships                    | read  | operator          | RED   | `.select('customer_id', { count: 'exact', head: true }).eq('owner_id', state.vendorId)`. Same auth-only RLS as customers.html:731. |
| drop-manager.html             | 2745 | categories                                | read  | operator          | RED   | Same shape as drop-menu.html:1520. |
| drop-manager.html             | 2757 | products                                  | read  | operator          | RED   | Same shape as service-board.html:1752 but for the full vendor catalogue. |
| drop-manager.html             | 2769 | bundles                                   | read  | operator          | RED   | Same. |
| drop-manager.html             | 2781 | v_drop_summary                            | read  | operator          | RED?  | View dependency. |
| drop-manager.html             | 2947 | customer_relationships                    | read  | operator          | RED   | Same auth-only RLS concern. |
| drop-manager.html             | 2960 | customers                                 | read  | operator          | RED   | `.select('id, postcode').in('id', customerIds)`. Customer-table read. Postcode is mild PII. Same auth-only RLS concern per operational learning #6. |
| drop-manager.html             | 3057 | v_drop_summary                            | read  | operator          | RED?  | View dependency. |
| drop-manager.html             | 3058 | v_drop_readiness_v2                       | read  | operator          | RED?  | View dependency. |
| drop-manager.html             | 3059 | drop_menu_items                           | read  | operator          | RED   | Same shape as drop-menu.html:3220. |
| drop-manager.html             | 3060 | v_drop_menu_item_stock                    | read  | operator          | RED?  | View dependency. |
| brand-hearth.html             | 1555 | drops                                     | read  | operator          | RED   | `.eq('vendor_id', vendorId)`. Same shape as customers.html:743 — not covered by T5-B42's drops-read migration (T5-B42 inventory was Drop Studio / Service Board / Scorecard / Home; Brand Hearth's preview-drop fetch was rewired in T5-B42 PR #246 to `list-drops` for the **list** path, but these two lines look like a separate preview lookup). Section D query 1 will confirm whether the permissive anon SELECT still covers it. |
| brand-hearth.html             | 1566 | drops                                     | read  | operator          | RED   | Same. |
| order.html                    | 2368 | drops                                     | read  | customer-public   | AMBER | Order page is by design public. The current anon SELECT on `drops` is what makes this work and a public drop order page is the legitimate use case. RELAX-ONLY-IF-TRULY-PUBLIC: the cleanup should *keep* a `status IN ('live','scheduled','completed')` anon SELECT policy on drops; what gets removed is the `USING (true)` over-broad version. |
| order.html                    | 2377 | v_drop_summary                            | read  | customer-public   | AMBER | Same shape as host-view.html. |
| order.html                    | 2386 | vendors                                   | read  | customer-public   | RED   | **PII exposure risk.** `.select('*').eq('id', state.drop.vendor_id)` pulls every column of the vendor row including `contact_phone`, `address`, `social_handles`, `stripe_account_id`, `auth_user_id`. The T5-A3 extension spec calls this out explicitly: "Tightens vendor SELECT to expose only public-readable columns via a dedicated view, removing direct public access to contact_phone, address, social_handles, etc." RELAX-ONLY-IF-TRULY-PUBLIC — but the relaxation must be via a tight `v_vendor_public` view, not via the raw `vendors` table. The current `order.html` `.select('*')` must be narrowed at the same time. |
| order.html                    | 2396 | hosts                                     | read  | customer-public   | RED   | **PII exposure risk.** `.select('*').eq('id', state.drop.host_id)` pulls host `contact_email`, `contact_phone`, `notes_internal`, etc. Same shape as the vendor read above. Needs a `v_host_public` view (or a tightened SELECT clause plus a column-scoped policy). |
| order.html                    | 2407 | categories                                | read  | customer-public   | AMBER | Public catalog read. Legitimately public. RELAX-ONLY-IF-TRULY-PUBLIC. |
| order.html                    | 2417 | drop_menu_items                           | read  | customer-public   | AMBER | Same. |
| order.html                    | 2432 | products                                  | read  | customer-public   | AMBER | Same — but the `.select('*')` should be reviewed against the products schema (T5-A3 extension same logic — public should not see vendor-internal flags). Provisional AMBER, Section E flag. |
| order.html                    | 2444 | bundles                                   | read  | customer-public   | AMBER | Same as products. |
| order.html                    | 2452 | bundle_lines                              | read  | customer-public   | AMBER | Same. |
| order.html                    | 2464 | bundle_line_choice_products               | read  | customer-public   | AMBER | Same. |
| order.html                    | 2478 | products                                  | read  | customer-public   | AMBER | Same — fallback fetch for products referenced from bundle choices. |
| order.html                    | 2511 | drops                                     | read  | customer-public   | RED   | `.select('id, slug, name, opens_at, delivery_start').eq('vendor_id', state.drop.vendor_id)` — fetches the vendor's other drops for cross-promotion. This is anon reaching *every* drop the vendor owns, not just the current one. With the current `USING (true)` plus the `status IN ('live','scheduled','completed')` filter it's bounded to public-state drops, but the cleanup needs to ensure the new tightened anon SELECT still bounds this read sensibly. AMBER becomes RED only if the cleanup accidentally widens visibility (e.g. lets the vendor-other-drops list show drafts). Worth a deliberate decision. |
| order.html                    | 3738 | v_drop_summary                            | read  | customer-public   | AMBER | Same. |
| order.html                    | 4029 | drops                                     | read  | customer-public   | AMBER | `.eq('window_group_id', groupId)`. Sibling-window lookup for multi-window drops. Public anon SELECT is the legitimate path. |
| order.html                    | 4050 | v_drop_summary                            | read  | customer-public   | AMBER | Same. |
| host-profile.html             | 1057 | v_drop_summary                            | read  | operator          | RED?  | `.eq('vendor_id', state.vendorId)`. View RLS dependency. |

**Storage operations (out of scope of this audit, listed for completeness):**

| File                              | Line  | Bucket / op                                         | Notes |
| --------------------------------- | ----- | --------------------------------------------------- | ----- |
| drop-menu.html                    | 2539  | storage.from('vendor-assets').remove([path])        | Fire-and-forget delete after Edge Function returns. Bucket-level RLS handles this, not table RLS. |
| drop-menu.html                    | 2641  | storage.from('vendor-assets').remove([path])        | Same. |
| brand-hearth.html                 | 1359  | storage.from('vendor-assets').upload                | Direct upload — referenced by operational learning #35 as the canonical pattern. |
| brand-hearth.html                 | 1365  | storage.from('vendor-assets').getPublicUrl          | Public URL builder, not a request. |
| assets/hearth-photo-upload.js     | 893   | storage.from('vendor-assets').upload                | Shared photo upload component. Same pattern. |
| assets/hearth-photo-upload.js     | 897   | storage.from('vendor-assets').getPublicUrl          | Same. |

**assets/config.js:42** — string-match on `/rest/v1/` inside the
client-side `global.fetch` wrapper that attaches the Authorization
header (per operational learning #14). Not an actual read; flagged
so future audits know to skip it.

**Counts:**

- Total raw reference lines surfaced by the grep: 79 (read + write +
  storage + the config.js fetch wrapper, before deduping).
- Read rows in the inventory table above: 60 (excluding the storage
  block and the 2 write rows in `order-entry.html`).
- Provisional categories among the 60 reads:
  - **GREEN: 0**
  - **AMBER: 17** (2× post-auth vendors lookup; 1× localhost-only
    vendors fallback; 2× host-view; 12× order.html public catalog
    reads).
  - **RED: 43** (every operator-page direct table read where the
    only thing scoping the read today is a frontend `.eq('vendor_id',
    ...)` plus a permissive anon SELECT; plus the two PII-leaking
    `vendors.*` / `hosts.*` `SELECT *` reads on the public order page;
    plus the orders reads on home/insights/customers/scorecard that
    are likely already silently broken after T5-B39).
  - `RED?` rows (provisional RED, pending Section D query 3 view
    metadata): 22 of the 43 RED rows. These are view reads where
    `security_invoker` status determines whether the view inherits
    the caller's RLS context or runs as the view owner — the answer
    drives whether the view read needs migrating, or whether the
    underlying table RLS is enough.

---

## Section C — RED remediation queue

Each RED entry below maps to a one-line provisional triage tag.
Sequencing belongs to the T5-A3 build conversation; this report does
not propose sequencing.

1. **assets/hearth-vendor.js:33 — vendors (operator session boot read)**
   — **MIGRATE-TO-EDGE-FUNCTION** (`get-current-vendor`). This is
   the read every operator page depends on. Cannot be relaxed (the
   reader is the authenticated vendor session itself) and cannot be
   accepted as currently authenticated (publishable-key auth-attach
   bug means JWT is silently not honoured).

2. **home.html:1214 — products** — **MIGRATE-TO-EDGE-FUNCTION**
   (`list-products` for current vendor). Vendor-scoped catalog read.

3. **home.html:1215 — bundles** — **MIGRATE-TO-EDGE-FUNCTION**
   (`list-bundles` for current vendor). Same shape.

4. **home.html:1218 — customer_relationships join customers** —
   **MIGRATE-TO-EDGE-FUNCTION** (`list-vendor-customers`).
   Customer PII (email, phone, postcode) behind authenticated-only
   RLS. Highest urgency among the operator reads.

5. **home.html:1219 — orders** — **MIGRATE-TO-EDGE-FUNCTION**
   (`list-vendor-orders` or a narrower `list-vendor-customer-emails`).
   Customer PII. Possibly already silently failing in production
   post-T5-B39.

6. **insights.html:1099 — orders** — **MIGRATE-TO-EDGE-FUNCTION**.
   Same shape as home.html:1219.

7. **service-board.html:1752 — products (capacity-units lookup)** —
   **MIGRATE-TO-EDGE-FUNCTION** (fold into the existing Service Board
   load Edge Function bundle, or a new `get-products-by-id` if none
   exists). Vendor-scoped catalog read.

8. **scorecard.html:686 — orders** — **MIGRATE-TO-EDGE-FUNCTION**.
   Customer PII. Same as home.html:1219.

9. **scorecard.html:687 — orders** — **MIGRATE-TO-EDGE-FUNCTION**.
   Same.

10. **customers.html:731 — customer_relationships join customers** —
    **MIGRATE-TO-EDGE-FUNCTION**. Same shape as home.html:1218 and
    the most-data-rich version of this read (full customer record).

11. **customers.html:743 — drops** — **MIGRATE-TO-EDGE-FUNCTION**
    (existing `list-drops` from T5-B42 likely fits). Read was not
    covered by T5-B42's inventory.

12. **customers.html:748 — orders** — **MIGRATE-TO-EDGE-FUNCTION**.
    Customer PII.

13. **drop-menu.html:1520 — categories** —
    **MIGRATE-TO-EDGE-FUNCTION** (`list-categories`). Vendor-scoped
    catalog read.

14. **drop-menu.html:3220 — drop_menu_items (join drops)** —
    **MIGRATE-TO-EDGE-FUNCTION**. Used by the "where is this item
    used" safety check on delete. Vendor-scoped.

15. **drop-manager.html:2722 — customer_relationships (count)** —
    **MIGRATE-TO-EDGE-FUNCTION**. Authenticated-only RLS.

16. **drop-manager.html:2745 — categories** —
    **MIGRATE-TO-EDGE-FUNCTION**. Same shape as drop-menu.html:1520.

17. **drop-manager.html:2757 — products** —
    **MIGRATE-TO-EDGE-FUNCTION**. Vendor-scoped catalog read.

18. **drop-manager.html:2769 — bundles** —
    **MIGRATE-TO-EDGE-FUNCTION**. Same.

19. **drop-manager.html:2947 — customer_relationships (id list)** —
    **MIGRATE-TO-EDGE-FUNCTION**.

20. **drop-manager.html:2960 — customers (id, postcode)** —
    **MIGRATE-TO-EDGE-FUNCTION**. Mild PII (postcode).

21. **drop-manager.html:3059 — drop_menu_items** —
    **MIGRATE-TO-EDGE-FUNCTION** (likely fold into `get-drop`).

22. **brand-hearth.html:1555 — drops** —
    **MIGRATE-TO-EDGE-FUNCTION** (existing `list-drops` or
    `get-drop`).

23. **brand-hearth.html:1566 — drops** —
    **MIGRATE-TO-EDGE-FUNCTION**. Same.

24. **order.html:2386 — vendors `.select('*')`** —
    **RELAX-ONLY-IF-TRULY-PUBLIC**: introduce a
    `v_vendor_public` view exposing only customer-visible columns
    (display_name, name, primary_color, hero_image_url, logo_url,
    address-or-area-label, public-social fields). Tighten the
    `order.html` SELECT to that view. The wide `SELECT *` against the
    raw `vendors` table from anon is the platform's largest
    customer-facing PII exposure today.

25. **order.html:2396 — hosts `.select('*')`** —
    **RELAX-ONLY-IF-TRULY-PUBLIC**: same pattern. Introduce a
    `v_host_public` view (name, host_type, postcode-or-area-label,
    public social fields). Tighten the SELECT.

26. **order.html:2511 — drops (vendor's other drops cross-promo)** —
    **ACCEPT-PROPERLY-AUTHENTICATED** (where "authenticated" here
    means "via the post-cleanup anon SELECT policy on drops scoped
    to public statuses"). Confirm the cleanup's drops anon SELECT
    policy still scopes to `status IN ('live','scheduled','completed')`
    so this cross-promo list cannot leak drafts.

The 22 RED? view-read rows (home, insights, customers, scorecard,
service-board, drop-manager, drop-menu, host-profile, hosts) are not
expanded above because their triage tag depends on Section D query 3
output. They are likely all **MIGRATE-TO-EDGE-FUNCTION** (since most
of the underlying tables are operator-only) but the existence or
absence of `security_invoker` on each view changes the picture — a
view without `security_invoker` runs as its owner and inherits zero
RLS from the caller, so the only safe pattern is to gate the view
behind an Edge Function (or migrate the view to `security_invoker
= true` and depend on the underlying-table RLS that T5-A3 is about
to put in place). Section E lists these.

---

## Section D — SQL for Ed to run (Supabase SQL editor, read-only)

Paste back the output of all three queries into chat. Sections B / C
provisional categories are finalised once these results are in.

```sql
-- T5-A3 reads audit — LIVE policy state. Read-only. Paste output back into chat.

-- 1. All RLS policies on vendor-scoped tables
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'vendors','drops','products','bundles','categories',
    'drop_menu_items','orders','order_items','order_item_selections'
  )
order by tablename, cmd, policyname;

-- 2. RLS enabled / forced per table
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'vendors','drops','products','bundles','categories',
    'drop_menu_items','orders','order_items','order_item_selections'
  )
order by c.relname;

-- 3. Diagnostic only — informs later step 3, no action implied:
--    which public views carry security_invoker.
select c.relname as view_name, c.reloptions as view_options
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v' and c.relname like 'v_%'
order by c.relname;
```

---

## Section E — Blocked on Ed's SQL

The following inventory rows cannot be finally categorised until the
live policy output from Section D is back. They are RED?-tagged
above; this section is the consolidated list of "what does the SQL
output need to disambiguate".

1. **All 22 `v_*` view-read rows** in Section B (home.html:1216, 1217,
   1220, 1221; insights.html:1083–1086; service-board.html:1780, 1792,
   1804, 1824, 1825; scorecard.html:665, 685; hosts.html:558;
   customers.html:830–832; drop-menu.html:1521–1525, 1557, 1572;
   drop-manager.html:2781, 3057, 3058, 3060; host-profile.html:1057;
   order.html:2377, 3738, 4050; host-view.html:413, 444; brand-
   hearth.html — none in this set, brand-hearth direct-table reads
   only). **Blocking question: which of these views carry
   `security_invoker = true`?** A view *with* `security_invoker`
   inherits the caller's RLS context — if the underlying table is RLS
   protected, the view read is too. A view *without* `security_invoker`
   runs as its owner (typically a superuser-equivalent) and exposes
   every underlying row to anyone with SELECT on the view. Section D
   query 3 returns `reloptions` per view including `security_invoker`
   when set.

2. **CLAUDE.md operational learning #1 vs reality on `v_drop_summary`** —
   the learning calls out that `v_drop_summary` has no RLS safety net
   and the frontend filter is the only thing scoping it. Section D
   query 3 confirms whether `security_invoker` was added since the
   learning was logged.

3. **Are the permissive `anon USING (true)` SELECT policies still in
   place on `drops`, `products`, `bundles`, `categories`,
   `drop_menu_items`, `vendors`?** The 27-April audit found them; no
   subsequent BACKLOG.md ticket records their removal. Section D
   query 1 confirms. If any are gone, the corresponding RED rows
   above are probably already silently broken in production today
   (the symptom would be "page suddenly empty") — worth a deliberate
   check on the matching pages before remediation prioritises
   anything else.

4. **Confirmation that T5-B39 cleanup is reflected in pg_policies** —
   the orders permissive anon SELECT / UPDATE should be gone per the
   2026-05-03 closure. Section D query 1 confirms. If gone, the
   home.html:1219, insights.html:1099, customers.html:748,
   scorecard.html:686 and scorecard.html:687 reads are the highest-
   priority MIGRATE-TO-EDGE-FUNCTION items because they may be
   silently broken right now.

5. **Confirmation that `customer_relationships` and `customers` retain
   the SELECT-authenticated-only policies recorded by operational
   learning #6** — Section D query 1 covers the orders set but not
   these two tables. A follow-up query (not in this report's block to
   keep it tight) can extend the table list if Ed wants. The
   provisional RED categorisation above assumes learning #6's wording
   is still accurate; the inventory does not depend on this in
   structure, only in the read-failure assertions.

6. **`vendors` table column inventory for the `v_vendor_public` view
   work in C.24** — not a categorisation blocker, but the column
   list (current as of any recent migration) determines the public
   view's column set. SCHEMA.md is the canonical source.

---

End of report. No further action taken in this session; awaiting
Section D output and T5-A3 build-session prioritisation.
