# Findings — Ticket 1 PR1 (`T-vendor-offer-statement`)

Audit run 2026-07-22 against `origin/main` @ `40d86be`. Read-only except this file.

---

## 1. Collision — clean

`grep -rn "offer_statement"` across the repo returns **two hits, both prose in
`audit/findings-engine1-preconditions.md`** (the Engine 1 preconditions audit,
which recorded the column's absence). No code, no migration, no Edge Function,
no page references it. Nothing to rename, nothing to reconcile.

Live-DB confirmation is **NEEDS-ED-VERIFY** — see the handoff query in the PR
body. The column must not exist before the migration is applied.

## 2. `v_vendor_public` — definition NOT in the repo → NEEDS-ED-VERIFY

`v_vendor_public` **predates the migrations directory.** The only migration that
mentions it is `20260627194122_vendor_host_public_views.sql`, which explicitly
records it as pre-existing ("v_vendor_public pre-existed as a 23-column PII-safe
branding view; reused as-is. This migration creates only v_host_public") and
does nothing to it but an idempotent `GRANT SELECT ... TO anon, authenticated`.
No later migration touches it. There is no committed base-DDL dump
(`SCHEMA.md` and `prod-schema.sql` are absent from this tree;
`schema-snapshot/` holds only a README) — this is the gap tracked as
`T-base-ddl-backfill`.

**Consequence: the exact column list and ordering cannot be established from
the repo, and the view recreation cannot be authored blind.** Per the build
brief, the definition is captured via `pg_get_viewdef` before the migration's
view half is written. `offer_statement` is appended **last**; nothing else
changes; no `select *`; no `email`.

What the repo *does* prove about it:

| Consumer | Columns selected by name |
|---|---|
| `order.html:2668` | `id, display_name, name, tagline, logo_url, hero_image_url, website_url, brand_primary_color, brand_secondary_color, brand_text_on_primary, powered_by_hearth_visible` |
| `catering-enquiry.html:566` | `id, slug, display_name, name, logo_url, website_url, brand_primary_color, brand_secondary_color, brand_text_on_primary, powered_by_hearth_visible` |

Both callers select explicitly, so **appending a column cannot break either
one.** Neither reads `email` or any PII column, consistent with the view's
documented PII-safe character. `get-current-vendor/index.ts:14` records the
boundary in a comment: `v_vendor_public` is the anon customer path only.

## 3. `get-vendor-page` projection — explicit and PII-safe

`VENDOR_COLUMNS` (`supabase/functions/get-vendor-page/index.ts:59-75`) is an
explicit 15-entry array joined with `", "`, service-role-read against base
`vendors` (`:275`). It carries **no** `email`, `contact_phone`, `auth_user_id`,
`stripe_*` or onboarding-answer column. `offer_statement` slots in beside
`tagline` — the nearest sibling in kind.

**One thing the brief did not name, and it matters:** the projection is not the
whole read path. `buildVendorBlock()` (`:137-175`) re-projects the row into the
public response object field by field — a column present in `VENDOR_COLUMNS` but
absent from `buildVendorBlock` is fetched and then silently dropped, never
reaching the caller. `faq` (`:158`) and `catering_enabled` (`:165`) both had to
be added in both places by their own tickets. So PR1 adds `offer_statement` in
**both**, or the handoff check "confirm `get-vendor-page` returns
`offer_statement`" can never pass and PR2 would have nothing to render. This is
an addition of one line in each, not a restructure.

## 4. `update-vendor` write whitelist — an allow-list `Set`

`ALLOWED_FIELDS` (`supabase/functions/update-vendor/index.ts:16-63`) is a
`Set<string>`, grouped by comment heading, filtered at `:232`
(`if (!ALLOWED_FIELDS.has(key)) continue`). Anything outside it is **silently
dropped, not rejected** — so a Brand-page field without a whitelist entry
no-ops invisibly.

Three fields intercept before the generic passthrough (`faq`, `qr_card_line`,
`catering_enabled`) because each has a shape the whitelist alone cannot
guarantee. `offer_statement` needs none of that: it is nullable free text with
no DB constraint and no container type to guarantee. It joins the plain
passthrough, and the page sends `|| null` exactly as `tagline` and
`qr_card_line` do — so blank input stores `NULL`, not `""`.

## 5. Brand editor pattern — `brand-hearth.html`

The sibling to mirror is `tagline` / `brand_voice` (`:1133-1143`) — a `.field`
div wrapping `<label for>`, control, `.helperText`. `brand_voice` is the
existing **textarea** precedent (`rows="4"`, `:1142`).

Five touchpoints, confirmed on live source:

| # | Site | Line |
|---|---|---|
| 1 | markup — `.field` block | `:1133-1137` (tagline) |
| 2 | `getFormData()` — `.value.trim()` | `:1694` |
| 3 | `populateForm()` — `|| ""` | `:1725` |
| 4 | `attachEvents()` — id array for `markDirty` | `:2815` |
| 5 | `saveVendor()` — `fields` object, `|| null` | `:2113` |

The `qr_card_line` character counter (`renderQrCardLineCount`, `:2685`) is the
precedent for a soft counter; it uses a hard `maxlength="60"` on the input,
which is correct for a fixed-width printed card and **wrong here** — the brief
forbids a blocking `maxlength` on a paragraph field. A counter without a
`maxlength` is a new (simple) combination on this page.

## 6. Orphan-column guard — clean, nothing to avoid touching

`grep` for `brand_headline`, `brand_subheadline`, `logo_asset_url` across
`*.html`, `*.ts`, `*.js`: **zero hits.** The drift is DB-side only; no code
path could be repurposed by accident. The live columns in use are `tagline`,
`brand_primary_color`, `logo_url`. `offer_statement` is a clean ADD and this PR
does not go near the drift cleanup.

---

## Verdict

Repo agrees with the build brief on every checkable point. One correction and
one block:

- **Correction:** `get-vendor-page` needs `buildVendorBlock` widened as well as
  `VENDOR_COLUMNS` — one extra line, without which the read path does not
  actually expose the field.
- **Block:** the `v_vendor_public` definition is unobtainable from the repo.
  Migration authored in two parts: the `ALTER` + `COMMENT` (final), and the
  view recreation completed from Ed's `pg_get_viewdef` capture.
