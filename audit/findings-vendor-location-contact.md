# Findings — T-vendor-location-contact (Phase 0 audit)

Branch: `feature/vendor-location-contact`, cut from `origin/main` @ `088228f`.
Date: 2026-07-23.

**VERDICT: the Phase 0.1 STOP-GATE FIRES. No migration authored, no code
changed. `vendors.address` holds a FULL COMPOSED address (street + town +
postcode in one free-text string), so adding sibling `town` / `postcode`
columns and composing all three would double-render town and postcode for
every vendor who filled the field in.**

The `contact_email` half of the ticket is unaffected and clean — see §7 for
the split-PR option.

---

## 1. `address` — the existing field (STOP-GATE)

**A column `vendors.address` exists** and is actively written today.

**It expects a full composed address.** The evidence is unambiguous:

- `onboarding.html:1332` — the input's own placeholder:
  ```
  e.g. 14 High Street, Henley-on-Thames, RG9 2LU
  ```
  Street, town AND postcode, comma-separated, in one field.
- `onboarding.html:1330` — helper text: *"Your primary address — used to
  anchor your local area."* One address, not one line of one.
- `BACKLOG.md:4534` — **T5-B3 ✓ COMPLETE**: *"Stage 4 in onboarding captures
  a **free-text address**. Writes to `vendors.address`. Skippable."*
- `CLAUDE.md` vendors schema note: `address` (text, **physical address**).

**This is a live write path, independent of Brand.** `writeAddress()`
(`onboarding.html:1948`) invokes `update-vendor` with
`{ fields: { address: value } }` directly. Onboarding Stage 4 is skippable,
so the column is populated for some vendors and null for others.

### Why this blocks the ticket as specified

The ticket labels `address` **"Street address"** and composes the render as
`address, town, postcode`. For any vendor who onboarded through Stage 4 as
the placeholder instructs, that produces:

> 14 High Street, Henley-on-Thames, RG9 2LU, Henley-on-Thames, RG9 2LU

Town and postcode render twice. This is exactly the drift the stop-gate was
written to catch, and it is not cosmetic: the composed line is also what
Ticket 2a will lift into JSON-LD `addressLocality` / `postalCode`, so the
duplication would harden into structured data a search engine reads.

The damage is silent and vendor-specific — it appears only for vendors who
filled Stage 4 in, so it would pass any test against a vendor who skipped it.

**NEEDS-ED-VERIFY** — how many rows are actually affected, and in what shape:
```sql
select id, slug, address from public.vendors
where address is not null and btrim(address) <> '';
```
If every populated row is street-only in practice (vendors ignoring the
placeholder), the risk is lower but the *field's stated contract* is still
full-address, and onboarding would keep producing composed values for every
future vendor. The placeholder is the instruction; it would need changing
either way.

## 2. Brand editor: `address` is hidden, and T5-B4 is stale

`brand-hearth.html:1151` — `<input id="vendorAddress" type="hidden" />`,
sitting with the `vendorName` and `vendorOrderLabel` hidden inputs.

**No comment explains why.** It was hidden by commit `56924db` *"redesign:
brand-hearth.html — restructure, copy sweep, social collapsible"* — i.e. it
was swept up in a layout redesign, not a deliberate decision about the field.

It remains **fully wired through all five touchpoints**, so it silently
round-trips the stored value on every Brand save rather than clearing it:

| Touchpoint | Line |
|---|---|
| markup (hidden) | 1151 |
| `getFormData` trim | 1755 |
| `populateForm` | 1787 |
| `saveVendor` null-coercion | 2211 |
| `attachEvents` id array | 2924 |

Consequence worth flagging on its own: `BACKLOG.md:4538` records **T5-B4 ✓
COMPLETE — "Brand Identity section extended with a vendorAddress field"**.
The redesign hid the field that entry describes. **Today a vendor's address
is editable only during onboarding Stage 4** — a vendor who skipped it, or
who moves premises after onboarding, has no route to set or correct it. That
is a real gap independent of this ticket.

## 3. Phone — no duplication risk

- Column is **`vendors.contact_phone`**.
- It is **customer-facing**: `brand-hearth.html:1194–1196`, label "Phone
  number", helper *"Shown to customers if they need to reach you."*
- It is **whitelisted** in `update-vendor` (`index.ts:23`).
- It is **NOT** in `get-vendor-page`'s `VENDOR_COLUMNS`, **NOT** in
  `buildVendorBlock()`, and **NOT rendered anywhere on `vendor.html`**
  (grep for `contact_phone` / `mailto` across `vendor.html`: zero hits).

So the helper text promises something the public page does not currently
deliver. The new block would be phone's **first** public render — no
duplicate, and it closes an existing copy-vs-reality gap.

## 4. Collision check

No `town`, `city`, `postcode` or `contact_email` column is added to
`public.vendors` by any committed migration (checked every migration
containing `alter table public.vendors` for an `add column` of those names —
zero hits). The `postcode` hits in `20260717120100` are on
`public.customers`, not vendors. Clean, subject to Ed's live query.

**NEEDS-ED-VERIFY** (expect 0 rows):
```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='vendors'
  and column_name in ('town','postcode','contact_email');
```

## 5. `vendors.email` — the PII trap, confirmed

`vendors.email` is the **account/login email**: `invite-vendor/index.ts:99`
matches on `.eq("email", email)` to link `auth_user_id` after
`inviteUserByEmail`. It is **correctly absent** from `update-vendor`'s
`ALLOWED_FIELDS` and from `get-vendor-page`'s projection. The ticket's
insistence on a separate `contact_email` column is right.

## 6. Wiring points confirmed (for whoever builds this)

- **`get-vendor-page`, both places** — `VENDOR_COLUMNS` (`index.ts:59`) and
  the `buildVendorBlock()` re-projection (`index.ts:138`). Confirmed: a
  column fetched but not re-projected is silently dropped. Neither currently
  carries `address`, `contact_phone` or `website_url`.
- **`update-vendor`** — `ALLOWED_FIELDS` Set (`index.ts:17`). `address` and
  `contact_phone` already whitelisted; `offer_statement` (line ~57) is the
  pattern to mirror, including its "page sends `|| null`" note.
- **Brand editor** — five touchpoints as tabulated in §2.
- **`vendor.html` render** — `renderPage()` assembles `sections`, then
  `sections += faqHtml(vendor)` at :921. A block inserted immediately before
  that line lands above the FAQ in all four states. Quiet-text tokens to
  reuse: `var(--h-ink-soft)` (see `.undercta`, :151, and the muted-token
  comment at :248). **Do not reuse `.undercta`** — the T-catering-link-presence
  precedent at :256 records that it already owns the live-drop "Pre-order
  only…" line, so restyling it in place silently changes an unrelated line.

## 7. Options for Ed

The `contact_email` half has no dependency on the address question.

**Option A — split, ship the clean half now (recommended).** `contact_email`
alone: one nullable ADD, both `get-vendor-page` places, `update-vendor`
whitelist, one Brand field, and a "Find us" block rendering phone + email.
Delivers the *"how do I reach them?"* half of the ticket's stated job with no
drift risk, and gives phone its first public render. Location waits.

**Option B — decide the address split first, then build the whole ticket.**
The decision is genuinely open and is Ed's:

- **B1 — keep `address` composed.** Drop `town`/`postcode` entirely; render
  `address` as the single location line. Cheapest, zero migration risk, and
  honest to what the field already holds. Cost: Ticket 2a's JSON-LD gets no
  clean `addressLocality` / `postalCode` and would have to parse or omit them.
- **B2 — split `address` into street-only + new `town`/`postcode`.** Matches
  the ticket and serves 2a properly, but needs a **data migration** for
  existing composed rows (few enough to do by hand — see the §1 query) **and**
  a change to `onboarding.html` Stage 4, which would otherwise keep writing
  composed values into a street-only field. That is a second logical change,
  so it wants its own PR ahead of this one.

I did not pick between these: B1 vs B2 turns on how much Ticket 2a's
structured location matters, which isn't determinable from the repo.

## 8. Spillover (noted, not acted on)

1. **Brand editor cannot edit the address** (§2) — T5-B4 is recorded complete
   but the field is hidden. Post-onboarding vendors have no route to set or
   correct their address. Resolves naturally under Option B; needs its own
   ticket under Option A.
2. **`contact_phone` copy promises a public render that does not exist** (§3)
   — closed by either option's "Find us" block.
