# customer-import.html — pre-build investigation

**Date:** 2026-05-15
**Ticket:** T-ops-rls-customer-import
**Status of this document:** read-only investigation. No code changes. Feeds the design conversation for the `bulk-create-customers` Edge Function.
**Source files reviewed:**
- `customer-import.html` (full, 1788 lines)
- `SCHEMA.md` (full)
- `supabase/functions/create-order/index.ts` (full, 766 lines)
- `PR-RLS-FIXES-AUDIT.md` (prior audit covering RLS / JWT-attach bug — referenced for policy state)

**Environment limitation:** this Claude Code session has no Supabase CLI / DB credentials, so the live `pg_policies` dump asked for in Step 5 could not be re-run. The closest authoritative reference is the 30 April 2026 RLS dump preserved in `PR-RLS-FIXES-AUDIT.md`. Ed should re-run the canonical `SELECT polname, polcmd, polroles, pg_get_expr(polqual, ...), pg_get_expr(polwithcheck, ...) FROM pg_policy ...` query as a check before design freeze; flagged in §5 and §7.

---

## 1. End-to-end import flow

The page is a single five-step wizard. State lives in module-level `let` variables
(`currentStep`, `parsedRows`, `lawfulBasis`, `importResults`, `importConflictRows`,
`importVendorId`). Step navigation is centralised in `goToStep(step)`
(`customer-import.html:1194`), which swaps the active panel, updates the stepper
chrome, and conditionally triggers `renderPreview()` / `runImport()` /
`renderResults()` for steps 2, 4, 5.

### Stage 1 — Upload (`customer-import.html:925`–`1768`)

- **UI:** drop zone + Browse files button (`#dropzone`, `#fileInput`, `#browseBtn`).
- **User action:** drop a `.csv` file or click Browse.
- **Page action:** `handleFile(file)` (line 1742) wires `FileReader.readAsText`,
  calls `parseCSV(text)` (line 1105). The parser:
  - splits lines on `\r?\n`
  - lower-cases and strips quotes from headers
  - resolves a column index map against `COLUMN_MAP` (line 1096) which accepts
    case-insensitive variants for `name`, `email`, `phone`, `address`, `postcode`
  - requires `name` and `email` columns, returns an error otherwise
  - emits an array of trimmed row objects `{ name, email, phone, address, postcode }`
- **State change:** `parsedRows = result.rows` (line 1756) and `goToStep(2)`.
- **No DB call at this stage.**

### Stage 2 — Preview (`customer-import.html:944`–`980`, render at `:1226`)

- **UI:** summary tiles (total / valid / with issues), issues-list callout for
  invalid rows, table of first 10 rows, Back / Continue buttons.
- **Page action:** `renderPreview()` runs `validateRow(r)` (line 1174) over
  every row:
  - flags missing name, missing email, or `EMAIL_RE` (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`)
    mismatches
  - the "valid" count drives whether the Continue button is enabled (`disabled = valid === 0`)
- **State change:** none beyond the rendered DOM. `parsedRows` is unchanged at this stage.
- **No DB call at this stage.**

### Stage 3 — Confirm / GDPR (`customer-import.html:983`–`1017`, handler at `:1303`)

- **UI:** two-radio lawful basis group (`explicit_consent` vs `legitimate_interests`),
  plus a single required-confirm checkbox (`#gdprCheckbox`).
- **User action:** pick a radio, tick the checkbox, click Continue
  (`handleStep3Continue()`).
- **Page action:** validates both selections (with shake animation + inline error
  visibility on failure) and writes the radio value into `lawfulBasis` (module-level
  let). If valid → `goToStep(4)`.
- **State change:** `lawfulBasis` set to `'explicit_consent'` or `'legitimate_interests'`.
- **No DB call at this stage.**

### Stage 4 — Import (`customer-import.html:1020`–`1030`, work in `runImport()` at `:1505`)

This is the only stage that writes to the database. Two visual states: spinner
(`#importLoading`) or fatal-error fallback (`#importFatalError`) with a Try again
button that re-invokes `runImport()`. The error fallback is reached only by an
exception that escapes the top-level try block; per-row failures do not surface
here.

`runImport()` performs the following in sequence:

1. Resolve vendor via `window.HearthVendor.resolveVendor(sb)` (line 1523). On
   failure, throws — caught by the outer try/catch and surfaces the fatal-error
   panel.
2. **Read** `customer_relationships` for this vendor (line 1536) — only
   `customer_id` selected, scoped by `owner_type='vendor'` AND `owner_id=vendorId`.
3. **Read** `customers` — `select('id, email, phone, address')` with **no scope**
   (line 1545). This pulls **every customer row on the platform** for the
   in-memory dedup maps. See §3.
4. Build two lookup `Map`s (email → customer + has-rel flag, phone → customer +
   has-rel flag) and classify each valid CSV row into one of:
   - `createNewRows` — no email match, no phone match
   - `addRelationshipOnly` — email or phone matches an existing customer, no
     existing relationship to this vendor
   - `skippedRows` — match exists AND vendor already has a relationship
   - `conflictRows` — email matches customer A, phone matches customer B
     (different ids)
5. Iterate `createNewRows` and write per-row (one INSERT to `customers` + one to
   `customer_relationships` per row). See §2 / write site 1 + 2.
6. Iterate `addRelationshipOnly` and write per-row (one INSERT to
   `customer_relationships` per row, optional UPDATE to `customers.address` if
   the existing row's address is empty). See §2 / write site 3 + 4.
7. `importResults = counts;` (line 1730), then `goToStep(5)`.

### Stage 5 — Done (`customer-import.html:1033`–`1069`, render at `:1350`)

- **UI:** summary card with calm-toned added / skipped / conflict / failed
  counts, optional expandable conflicts list, then either a rich demand
  breakdown (≥ 10 customers with postcodes) or a thin-data placeholder, then a
  primary CTA to Drop Studio and a secondary CTA to Customers.
- **Page action:** `renderResults()` paints counts then calls
  `fetchDemandBreakdown()` (line 1410) which does **two further reads** —
  `customer_relationships` filtered to `source='import'` for this vendor, then
  `customers` filtered to the returned ids. These are also subject to the same
  RLS pattern as the writes in Stage 4 (see §5 and §7).

**Additional stages beyond the five named in the prompt:** no — there is no
explicit dedup-review step. Conflicts (email-vs-phone mismatch) are silently
detected during `runImport()` and surfaced only retroactively on the Done page.
Inline "View conflicted rows" expander on Step 5 is read-only — the operator
cannot edit or re-classify a conflict from the page.

---

## 2. The four direct write call sites

Note on terminology — the prompt refers to "four direct PostgREST mutations"
matching the T-ops-rls-audit finding. The four are:

1. `customers` INSERT (new customer rows for unmatched CSV rows)
2. `customer_relationships` INSERT — companion to write 1
3. `customer_relationships` INSERT — for already-existing customers without a
   relationship to this vendor
4. `customers` UPDATE (address backfill on existing customer rows)

All four sit inside the `runImport()` function and execute per-row (no batching).
Quoted below with full surrounding context.

### Write site 1 — `customers` INSERT (new customer)

**Lines 1651–1667.** Inside the `for (const row of createNewRows)` loop.

```js
        /* 3a. Create new customers + relationships */
        for (const row of createNewRows) {
          try {
            const customerPayload = { name: row.name, email: row.email };
            if (row.phone) customerPayload.phone = normalisePhone(row.phone);
            if (row.postcode) customerPayload.postcode = row.postcode;
            if (row.address) customerPayload.address = row.address;

            const { data: newCust, error: insertErr } = await sb
              .from('customers')
              .insert(customerPayload)
              .select('id')
              .single();

            if (insertErr) {
              if (insertErr.code === '23505') { counts.skipped++; } else { counts.failed++; }
              continue;
            }
```

- **Table:** `customers`
- **Operation:** INSERT (single row, returning id)
- **Payload fields:** `name` (always), `email` (always), `phone` (only if non-empty
  CSV phone, run through `normalisePhone`), `postcode` (only if non-empty),
  `address` (only if non-empty)
- **Batching:** per-row in a JS `for` loop; one round-trip per new customer
- **On error:**
  - if `code === '23505'` (unique constraint violation, most likely `customers.email`
    unique — see §5 schema), the row is bucketed as `counts.skipped++` and the
    loop `continue`s without writing the relationship
  - any other error → `counts.failed++`, no relationship written
  - no transactional rollback — if write 1 succeeds and write 2 fails, the
    `customers` row stays orphaned without a `customer_relationships` row for
    this vendor (see §3 — that orphan will be picked up by future imports as an
    "existing customer, add relationship only" case)
  - per-row try/catch (lines 1652 / 1686) also catches thrown exceptions and
    funnels them to `counts.failed++`
- **Success state:** `counts.newCustomers++` (only after write 2 succeeds too,
  line 1685)

### Write site 2 — `customer_relationships` INSERT (new customer's relationship)

**Lines 1669–1689.** Same `for (const row of createNewRows)` loop, executes after
write 1.

```js
            const { error: relInsertErr } = await sb
              .from('customer_relationships')
              .insert({
                customer_id: newCust.id,
                owner_type: 'vendor',
                owner_id: vendorId,
                consent_status: 'imported',
                source: 'import',
                lawful_basis: lawfulBasis
              });

            if (relInsertErr) {
              if (relInsertErr.code === '23505') { counts.skipped++; } else { counts.failed++; }
              continue;
            }

            counts.newCustomers++;
          } catch (e) {
            counts.failed++;
          }
        }
```

- **Table:** `customer_relationships`
- **Operation:** INSERT (single row, no returning)
- **Payload fields:** `customer_id` (from write 1's returned id), `owner_type`
  (`'vendor'`), `owner_id` (vendor id from `resolveVendor`), `consent_status`
  (`'imported'`), `source` (`'import'`), `lawful_basis` (the `lawfulBasis`
  module-level let, set in Stage 3 — `'explicit_consent'` or
  `'legitimate_interests'`)
- **Batching:** per-row
- **On error:**
  - `code === '23505'` → `counts.skipped++` (would indicate a unique constraint
    on `(customer_id, owner_id, owner_type)` or similar — unconfirmed; see §5
    schema gap)
  - any other error → `counts.failed++`
- **Success state:** `counts.newCustomers++`

### Write site 3 — `customer_relationships` INSERT (link existing customer to vendor)

**Lines 1692–1713.** Inside the `for (const item of addRelationshipOnly)` loop.

```js
        /* 3b. Add relationships only (+ address backfill) */
        for (const item of addRelationshipOnly) {
          try {
            const { error: relInsertErr } = await sb
              .from('customer_relationships')
              .insert({
                customer_id: item.customerId,
                owner_type: 'vendor',
                owner_id: vendorId,
                consent_status: 'imported',
                source: 'import',
                lawful_basis: lawfulBasis
              });

            if (relInsertErr) {
              /* Unique constraint violation = relationship already exists → skip, not fail */
              if (relInsertErr.code === '23505') {
                counts.skipped++;
              } else {
                counts.failed++;
              }
              continue;
            }
```

- **Table:** `customer_relationships`
- **Operation:** INSERT (single row)
- **Payload fields:** identical shape to write 2. `customer_id` comes from
  `item.customerId` (the already-existing customer matched on email or phone in
  the classification pass).
- **Batching:** per-row
- **On error:** `23505` → skip, anything else → fail; loop `continue`s without
  attempting the address backfill in write 4.
- **Success state:** falls through to write 4 conditional, then increments
  `counts.newRelationships++` (line 1723)

### Write site 4 — `customers` UPDATE (address backfill on existing customer)

**Lines 1716–1721.** Same `for (const item of addRelationshipOnly)` loop. Only
executes if write 3 succeeded.

```js
            /* Backfill address if import row has one and existing customer does not */
            if (item.importAddress && (!item.existingAddress || item.existingAddress.trim() === '')) {
              await sb
                .from('customers')
                .update({ address: item.importAddress })
                .eq('id', item.customerId);
            }

            counts.newRelationships++;
          } catch (e) {
            counts.failed++;
          }
        }
```

- **Table:** `customers`
- **Operation:** UPDATE (`address` only, by id)
- **Payload fields:** `address` set to `item.importAddress`
- **Predicate:** `.eq('id', item.customerId)` — no `vendor_id`, no scope
  whatsoever. (Correct, because `customers` is platform-wide and has no
  `vendor_id` column; but the implication is that any vendor can in principle
  overwrite any other vendor's customer's address. Belongs in §7 as a tenancy
  question.)
- **Batching:** per-row
- **On error:** **the result is not awaited or destructured** — the `await` is
  there but there is no `const { error }` capture. A silent RLS rejection here
  is invisible to the page; the outer `catch (e)` catches only thrown
  exceptions, not PostgREST 204 / 0-rows responses. So write 4 is the most
  failure-tolerant of the four, but also the most failure-invisible.
- **Success state:** none directly; `counts.newRelationships++` increments
  regardless of the address-backfill outcome.

### Cross-cutting properties of all four writes

- **Client construction:** the page builds its Supabase client inline at line
  1075 with `window.supabase.createClient(window.HEARTH_CONFIG.SUPABASE_URL,
  window.HEARTH_CONFIG.SUPABASE_ANON_KEY)`. This is the exact anti-pattern
  flagged in CLAUDE.md operational learnings #12, #13, #14 and confirmed in
  PR-RLS-FIXES-AUDIT.md §"Bug B-companion" (line 38) as causing JWT-attach
  failures on writes to RLS-protected tables. The page does **not** use
  `window._getHearthClient()`.
- **No `Authorization` header workaround:** the inline client does not benefit
  from the manual header-attach added to the singleton in
  `assets/config.js` (operational learning #14).
- **No batching:** all four writes are per-row. A 500-row CSV produces ≥ 500
  round-trips for `createNewRows` (2 per row) plus 1–2 per row for
  `addRelationshipOnly`. The Edge Function design should consider whether to
  preserve per-row semantics with a batched payload, or move to a bulk-insert
  with row-level error reporting.
- **No transactional boundary:** if write 2 fails after write 1 succeeds, the
  resulting `customers` row is orphaned (exists on the platform but has no
  relationship to this vendor). Future imports will pick it up as an
  "addRelationshipOnly" row and create the missing link — so the orphan is
  recoverable, not lost. But it is still an inconsistency that the function
  design could choose to eliminate (e.g. compound INSERT via RPC or rollback
  on failure).
- **Failure observability:** the audit (PR-RLS-FIXES-AUDIT.md:447–461) flagged
  that `code === '23505'` is the only error code checked; anything else
  (including `42501` RLS denial) goes to `counts.failed++` and is rendered to
  the operator as a generic "X rows could not be imported due to an error."
  No diagnostic detail is logged or surfaced.

---

## 3. Deduplication logic

Deduplication happens **before any write**, fully in JS, in the classification
pass at `customer-import.html:1535`–`1648`.

### Where dedup runs

After vendor resolution and after fetching `customer_relationships` + `customers`
(steps 1 and 2 of `runImport()`). The dedup is in-memory only; no per-row
queries.

### The two read queries that build the dedup state

**Read 1 — vendor's existing relationships** (lines 1536–1542):

```js
        const { data: rels, error: relErr } = await sb
          .from('customer_relationships')
          .select('customer_id')
          .eq('owner_type', 'vendor')
          .eq('owner_id', vendorId);

        if (relErr) throw relErr;
```

Returns every `customer_id` that already has a relationship to this vendor.
Used to set the `hasRelationship` flag on the lookup maps.

**Read 2 — every customer on the platform** (lines 1545–1549):

```js
        /* Fetch all customers for email/phone lookup */
        const { data: allCustomers, error: custErr } = await sb
          .from('customers')
          .select('id, email, phone, address');

        if (custErr) throw custErr;
```

Note: **no vendor scope, no `.in()` filter, no `.limit()`**. This fetches the
entire `customers` table on every import. At platform scale this is a real
concern (see open question OQ-7 below). At current scale (three real vendors)
it works fine, but the design conversation should decide whether the Edge
Function should preserve "load all customers" semantics or move to a
per-row lookup.

The dedup logic itself depends on this full-table read — to correctly identify
that an import row's email belongs to an existing customer who is currently
attached to **another** vendor, you have to be able to see that other vendor's
customer rows. The current frontend has implicit `SELECT (true)` on `customers`
under the temporary anon SELECT policies noted in CLAUDE.md operational
learning #6.

### Matching keys

Two keys, in this priority:

1. **Email (case-insensitive trim)** — `customer-import.html:1564`:
   ```js
   if (c.email) {
     emailToCustomer.set(c.email.toLowerCase().trim(), { ... });
   }
   ```
2. **Phone (normalised)** — `customer-import.html:1571`–`1581`:
   ```js
   if (c.phone) {
     const normPhone = normalisePhone(c.phone);
     if (normPhone) {
       phoneToCustomer.set(normPhone, { ... });
     }
   }
   ```
   `normalisePhone(phone)` (line 1183) strips spaces and hyphens, converts a
   leading `07` to `+447`, and a leading `00` to `+`. Anything else passes
   through unchanged (so e.g. `+44 7xxx` becomes `+447xxx`; a US `1xxx`
   passes through as-is; a bare `7xxx` without leading zero passes through as-is).

The dedup pass per CSV row (lines 1593–1642) reads:

```js
        for (const row of validRows) {
          const normEmail = row.email.toLowerCase().trim();
          const normPhone = row.phone ? normalisePhone(row.phone) : null;

          const emailMatch = emailToCustomer.get(normEmail) || null;
          const phoneMatch = normPhone ? (phoneToCustomer.get(normPhone) || null) : null;

          /* d. Conflict: email matches customer A, phone matches different customer B */
          if (emailMatch && phoneMatch && emailMatch.customerId !== phoneMatch.customerId) {
            conflictRows.push(row);
            continue;
          }

          /* e. Email matches an existing customer */
          if (emailMatch) {
            if (emailMatch.hasRelationship) {
              skippedRows.push(row);
            } else {
              addRelationshipOnly.push({ customerId: emailMatch.customerId, ... });
            }
            continue;
          }

          /* f. Phone matches an existing customer (email did not match) */
          if (phoneMatch) {
            if (phoneMatch.hasRelationship) {
              skippedRows.push(row);
            } else {
              addRelationshipOnly.push({ customerId: phoneMatch.customerId, ... });
            }
            continue;
          }

          /* g. No match — create new */
          createNewRows.push(row);
        }
```

### Conflict resolution table

| Case | Email match | Phone match | Same customer? | Action |
|---|---|---|---|---|
| Both match, same customer | ✓ | ✓ | yes | Follow "email match" branch (e) |
| Both match, different customers | ✓ | ✓ | no | **`conflictRows`** — skip, surface on Stage 5 |
| Email only | ✓ | – | – | Follow "email match" branch (e) |
| Phone only | – | ✓ | – | Follow "phone match" branch (f) |
| Neither | – | – | – | `createNewRows` — INSERT new customer |

The branches (e) and (f) sub-split on `hasRelationship`:
- existing relationship to this vendor → `skippedRows`
- no existing relationship → `addRelationshipOnly` (link this vendor to the
  pre-existing customer record)

### How this maps to the cross-vendor case

The cross-vendor linking described in CLAUDE.md and the ticket spec is exactly
the `addRelationshipOnly` branch. If a CSV row's email already exists on the
platform as another vendor's customer, that customer's row is reused and a
new `customer_relationships` row links it to the importing vendor. The
`customers` table row is **not** duplicated.

### Address backfill — write 4 conditional

The cross-vendor link path also has a single side-effect on `customers`: if the
import row supplies an address AND the existing customer row's address is empty
or whitespace-only (`!item.existingAddress || item.existingAddress.trim() === ''`),
the existing customer's address is overwritten with the import row's address.
This is the only place a vendor can mutate a platform-wide `customers` row;
write 4 is fired silently (no error capture, see §2 site 4).

---

## 4. GDPR lawful basis step

### Position in the flow

**Stage 3 (Confirm)** — `customer-import.html:983`–`1017`. The operator
cannot reach Stage 4 / write to the database without completing both the
radio choice and the confirm checkbox.

### Capture mechanism

Two separate UI affordances, both required by `handleStep3Continue()`:

1. **Lawful basis radio** (`#lawfulBasisGroup`, lines 995–1004). Two options:
   - `value="explicit_consent"` → "These customers have given me explicit
     permission to receive marketing communications from my business."
   - `value="legitimate_interests"` → "I have a legitimate interest basis…"
2. **GDPR confirm checkbox** (`#gdprCheckbox`, lines 1007–1010). "I confirm
   that I'm responsible for ensuring this data is handled in line with UK
   GDPR, and that Hearth may use it to help me run and promote drops to
   these customers."

`handleStep3Continue()` (line 1303) refuses navigation if either is missing
and runs a shake animation + inline error message.

### Where it lands on the database

`lawfulBasis` (the radio value) is written into the
`customer_relationships.lawful_basis` column on every relationship row created
during this import — both write site 2 (lines 1669–1678) and write site 3
(lines 1694–1703) set it.

The **checkbox** value is **not persisted**. It exists only as a gate; the
operator cannot proceed without ticking it, but no audit log records that they
did. Open question OQ-3.

### Granularity

**Per-import batch, not per-customer.** The same `lawfulBasis` is written into
every `customer_relationships` row produced by a given run. A mixed-source
list (some explicit-consent customers + some legitimate-interests customers in
the same CSV) cannot be represented today — the operator has to either pick a
single basis for the whole list or split the CSV and run two separate imports.
Open question OQ-4.

### Allowed values

The page only exposes:
- `'explicit_consent'`
- `'legitimate_interests'`

The schema column `customer_relationships.lawful_basis` is plain text with no
documented check constraint or enum (SCHEMA.md:316–321 describes it as
"populated for imported records (T4-14)" with no value list). The
`create-order` Edge Function does **not** set `lawful_basis` at all
(see §6) — order-path relationships have a NULL `lawful_basis`. The
`bulk-create-customers` design should confirm with Ed whether other values
(e.g. `'contract'`, `'consent'`) are reserved for future flows or whether the
column is open-ended.

---

## 5. Schemas for `customers` and `customer_relationships`

Sourced from `SCHEMA.md:301`–`331` plus the column-level details called out
elsewhere in the doc. The live `pg_policies` dump asked for in the prompt
could not be re-run from this environment; the closest authoritative reference
is the 30 April 2026 dump preserved in `PR-RLS-FIXES-AUDIT.md`, summarised
below with the caveat noted. **OQ-1: Ed should re-run the canonical
`pg_policy` query before design freeze to confirm the policy set is unchanged
since 30 April.**

### `customers` — columns

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | gen_random_uuid() | PK |
| `name` | text | **NOT NULL** | — | Caveat: a phone-only or email-only signup pathway needs to provide a placeholder (SCHEMA.md:559–560) |
| `email` | text | **NOT NULL** | — | `create-order` upserts on this column → there is a unique constraint on `email` (the `customers` insert at write site 1 catches `23505` as "skipped", confirming a unique constraint on at least one column — `email` is the candidate) |
| `phone` | text | nullable | — | normalised by `normalisePhone()` on read and on write |
| `address` | text | nullable | — | platform-wide field; mutated by vendors during import (see write site 4 + OQ-6) |
| `postcode` | text | nullable | — | used for postcode-area demand breakdown on Stage 5 |
| `created_at` | timestamptz | NOT NULL | now() | (implied — not explicitly called out in SCHEMA.md but matches the platform convention) |

**Foreign keys:** none on the customer side (this is the root of the
relationship). FKs *to* `customers` come from `customer_relationships.customer_id`
and `orders.customer_id`.

**Unique constraints / indexes:** SCHEMA.md does not enumerate these
explicitly. From application behaviour (`create-order` upserts on `email`,
write site 1 catches `23505` on `customers.email`) there is a unique
constraint on `email`. **OQ-2: confirm the exact set of unique constraints and
indexes on `customers` — most importantly whether `email` is the only unique
column.**

### `customer_relationships` — columns

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | gen_random_uuid() | PK |
| `customer_id` | uuid | FK → customers.id | — | |
| `owner_id` | uuid | NOT NULL | — | **No FK declared** — polymorphic. Today: `vendors.id`. Future: `hosts.id`, `communities.id`. |
| `owner_type` | text | NOT NULL | — | `'vendor'` today; `'host'` / `'community'` reserved (SCHEMA.md:315–316) |
| `consent_status` | text | nullable | `'pending'` | Values: `'pending'`, `'granted'`, `'imported'`, `'revoked'` (SCHEMA.md:317–318) |
| `source` | text | **NOT NULL** | — | Values: `'order'`, `'import'`, `'interest'` (T5-8), `'community_invite'` (T5-18 future) (SCHEMA.md:319–320) |
| `lawful_basis` | text | nullable | — | "populated for imported records (T4-14)" — no documented value set |
| `created_at` | timestamptz | NOT NULL | now() | (implied) |

**Foreign keys:**
- `customer_id` → `customers.id` (declared FK)
- `owner_id` → intentionally NOT a declared FK (polymorphic, SCHEMA.md:482–483)

**Unique constraints:** application behaviour at write sites 2 and 3 expects
`23505` to mean "relationship already exists for this customer / vendor pair"
and treats it as a skip rather than a failure. This implies a unique
constraint on `(customer_id, owner_id, owner_type)` or `(customer_id,
owner_id)`. `create-order` upserts with `onConflict: "customer_id,owner_id"`
(create-order/index.ts:542) — that is the authoritative key.
**OQ-2 (continued): confirm the exact unique key on `customer_relationships`
— is it `(customer_id, owner_id)` or `(customer_id, owner_id, owner_type)`?
Matters for the Edge Function's upsert strategy.**

### RLS policies — current state

The live policy state for these two tables could not be queried from this
session. The information available is:

**From CLAUDE.md operational learning #6 (still flagged as TODO):**
> RLS: `customer_relationships` and `customers` both have temporary anon
> SELECT policies (`USING (true)`) added as pre-auth measures. Both must
> be replaced with `auth.uid()`-based policies when T5-A lands.

So **reads** on both tables succeed for the anon role (open SELECT). This
matches the page's behaviour — the two dedup reads (`customer_relationships`
select on line 1536, `customers` select on line 1545) and the
`fetchDemandBreakdown` reads (lines 1416, 1433) all work in production today.

**From PR-RLS-FIXES-AUDIT.md (line 444):**
> The `customer_relationships` table has policy
> `customer_relationships_vendor_access` on `{authenticated}` only — there
> is no `public`-role fallback. So `customer_relationships` writes from
> this page WILL hit the JWT-attach bug under the same conditions that
> affect drop-menu.html.

So **writes** on `customer_relationships` go through a single
`{authenticated}`-role policy named `customer_relationships_vendor_access`. The
audit does not quote the policy's `using` / `with_check` expression in full,
but from context the expression resolves to something like
`EXISTS (SELECT 1 FROM vendors WHERE id = customer_relationships.owner_id AND
auth_user_id = auth.uid())` — i.e. the same vendor-ownership pattern used on
other vendor-scoped tables. **OQ-1 (re-stated): re-run the canonical pg_policy
query to confirm exact expression.**

**For `customers`:** no equivalent policy expression is quoted in any local
file. The likely shape is either:
- a single permissive ALL policy on `{authenticated}` (similar to
  `customer_relationships`), OR
- separate INSERT / UPDATE policies (or a public-role INSERT) — open question.

**OQ-1: this is the critical gap.** The Edge Function design needs to know
exactly which roles + expressions cover INSERT / UPDATE / SELECT on
`customers` and INSERT / UPDATE / SELECT on `customer_relationships`. The
authoritative answer comes from a fresh `SELECT polname, polcmd, polroles,
pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid) FROM
pg_policy WHERE polrelid IN ('public.customers'::regclass,
'public.customer_relationships'::regclass);` run by Ed before the design
conversation.

---

## 6. The existing `create-order` pattern for customer writes

`supabase/functions/create-order/index.ts:511`–`548`. Excerpted:

```ts
    // A. Customer upsert (only when email present). Failure here aborts
    //    the function — no order is created.
    let customerId: string | null = null;
    if (payload.customer.email) {
      const { data: customerRow, error: custErr } = await serviceClient
        .from("customers")
        .upsert(
          {
            name: payload.customer.name,
            email: payload.customer.email,
            phone: payload.customer.phone,
            postcode: payload.customer.postcode,
          },
          { onConflict: "email", ignoreDuplicates: false }
        )
        .select("id")
        .single();
      if (custErr || !customerRow) {
        console.error("customer upsert failed", custErr);
        return jsonResponse({ error: "Customer record write failed" }, 500);
      }
      customerId = customerRow.id;

      const { error: relErr } = await serviceClient
        .from("customer_relationships")
        .upsert(
          {
            customer_id: customerId,
            owner_id: vendorId,
            owner_type: "vendor",
            consent_status: payload.customer.contact_opt_in ? "granted" : "pending",
            source: "order",
          },
          { onConflict: "customer_id,owner_id", ignoreDuplicates: false }
        );
      if (relErr) {
        console.error("customer relationship upsert failed", relErr);
        return jsonResponse({ error: "Customer relationship write failed" }, 500);
      }
    }
```

### Key decisions in `create-order` that bear on the bulk function design

- **Upsert, not separate insert + lookup.** `customers` is upserted with
  `onConflict: "email"`. This is the inverse of customer-import.html's
  approach (read all, classify in-memory, then insert-or-link). For order
  flow it's fine — there is no need to detect "this customer already exists
  with a different identifier"; the email is the canonical lookup. For bulk
  import, the in-memory dedup approach catches the phone-only match case
  that an email-keyed upsert cannot. **Open question OQ-5: does the Edge
  Function need to preserve phone-match dedup, or is "email-only" acceptable
  for the bulk flow?**
- **Relationship upsert with conflict key `customer_id,owner_id`.** No
  `owner_type` in the conflict key. This is the canonical conflict key for
  this table; the bulk function should match it.
- **`source: "order"` vs `source: "import"`.** The current page uses
  `'import'` for all bulk inserts; this is correct and the Edge Function
  should preserve it. `'order'` is reserved for `create-order`.
- **`consent_status` differs by flow.** `create-order` sets `'granted'` if
  the customer ticked the marketing opt-in checkbox during checkout, else
  `'pending'`. customer-import.html unconditionally sets `'imported'`.
  Different vocabularies for different consent provenances — the Edge
  Function should keep the import-side value as `'imported'`.
- **`lawful_basis` is NOT set in `create-order`.** Order-path customers
  have a NULL `lawful_basis`. The import path is the only place this column
  is populated.
- **No address column** in `create-order`'s customers upsert. The order
  flow stores delivery addresses on the `orders` row, not on `customers`.
  Bulk import is the only writer to `customers.address` (write site 1
  payload + write site 4 backfill).
- **No `customer_id` deduplication for the cross-vendor case.** Because
  `create-order` upserts on email, an order from an existing customer
  attaches to the platform-wide row automatically — same effect as the
  bulk-import "addRelationshipOnly" branch, achieved through database
  conflict resolution rather than in-memory classification.
- **Order of operations:** `customers` upsert first, capture `customer_id`,
  then `customer_relationships` upsert using that id. Same order the bulk
  function should use.
- **No rollback on partial failure.** `create-order` aborts on the first
  failure with a 500 — there is no rollback of the customers upsert if the
  relationships upsert fails. The orphaned customer row is acceptable in
  the order flow because the next order attempt by the same customer will
  match and upsert into the same row. The bulk function has the same
  recovery property: an orphaned customer in batch 1 will be picked up by
  batch 2 as an addRelationshipOnly row.
- **Service-role client used throughout.** Both writes run against the
  `SUPABASE_SERVICE_ROLE_KEY` client (line 218–221), bypassing RLS
  entirely. This is the canonical pattern from operational learning #16
  and is what the bulk function should follow.
- **Tenancy belt:** the function does not let the client supply
  `owner_id` — it derives `vendorId` from the drop record server-side
  (line 278). The bulk function will derive `vendor_id` from the
  authenticated user's JWT, not from the client body.

### What the bulk-create-customers function can reuse vs. needs to diverge

| Concern | Reuse from create-order | Diverge |
|---|---|---|
| Customer upsert mechanic (onConflict: "email") | ✓ | Or replicate in-memory dedup if phone-match is required |
| Relationship upsert mechanic (onConflict: "customer_id,owner_id") | ✓ | — |
| Service-role client | ✓ | — |
| Server-derived `owner_id` (never trust client) | ✓ | Source is JWT vendor lookup, not drop lookup |
| `source` value | — | `'import'` not `'order'` |
| `consent_status` value | — | `'imported'` not `'granted'`/`'pending'` |
| `lawful_basis` | — | Set from request body (Stage 3 radio value) |
| `customers.address` write | — | Bulk path writes it; order path doesn't |
| Address backfill on existing customer | — | New mechanic specific to bulk path |
| Per-row vs batch error reporting | — | Return per-row success/skip/fail counts in response so Stage 5 of the UI can still render its summary |
| Rollback policy | — | Decide: abort on first failure (matches create-order) or continue-with-error-report (matches today's customer-import.html behaviour). OQ-8 |

---

## 7. Open questions

These need designer / Ed input before the Edge Function is written.

**OQ-1 — Authoritative RLS policy state.** The live `pg_policies` dump for
`customers` and `customer_relationships` could not be re-run from this
session. Quote: "RLS policies on each table (run the same pg_policy queries
we used in the head_start_dismissed investigation — output the policy names,
commands, roles, and using/with_check expressions)" (from the prompt). The
prior PR-RLS-FIXES-AUDIT.md (30 April 2026) names
`customer_relationships_vendor_access` as a `{authenticated}`-role policy
but does not quote its expression in full, and provides no policy quote for
`customers`. Ed should re-run the canonical `pg_policy` query before the
design conversation to confirm the policy set is unchanged. This is the
most consequential gap in this report.

**OQ-2 — Unique constraint set.** What unique constraints / unique indexes
exist on `customers` and `customer_relationships`? Application behaviour
implies `customers.email` is unique and `customer_relationships
(customer_id, owner_id)` is the conflict key (`create-order` upserts on
that pair). Confirm via `SELECT conname, pg_get_constraintdef(oid) FROM
pg_constraint WHERE conrelid IN (...);`. Matters because the Edge
Function's upsert mechanic depends on the conflict key.

**OQ-3 — Should the GDPR confirm checkbox be persisted?** Today the
checkbox is a gate (line 1322) but its `true` value is not written
anywhere. Should the Edge Function audit-log the fact that the operator
ticked it (e.g. an `import_audit` row, or a JSON blob on the
`customer_relationships` row)? Open or close as a deliberate decision.

**OQ-4 — Lawful basis: per-batch or per-customer?** Today every relationship
in an import gets the same `lawful_basis`. The ticket spec hints at
mixed-source lists ("what if both match but to different existing
customers"). Is it acceptable to keep per-batch semantics and require the
operator to split mixed lists into separate imports, or should the
function accept a per-row `lawful_basis` override?

**OQ-5 — Phone-match dedup: preserve or drop?** Today's classification
matches on email **and** phone, with phone as the fallback when email
doesn't match. `create-order` doesn't have this; it upserts on email
only. For the bulk function, should we:
- (a) preserve phone-match dedup (requires in-memory or query-based
  classification)
- (b) drop it (Edge Function does email-only upsert, phone-only matches
  produce duplicate customer rows on the platform)
- (c) something else, e.g. require both name+email or name+phone, with
  more aggressive dedup
Phone is the only fallback identifier today for customers who change
email addresses between a real order and an imported list — design call
on whether that case is worth handling.

**OQ-6 — Cross-vendor address overwrite (write site 4).** A vendor today
can overwrite another vendor's customer's address simply by importing a
CSV. This is bounded to the case where the existing address is empty, so
it's not actively destructive — but it does mean vendor B's import can
populate the address field on vendor A's customer record. Is this
acceptable? Alternatives:
- store address on `customer_relationships` instead of `customers`
  (per-vendor address)
- only allow address fill if this vendor "owns" the relationship
- drop address backfill from the bulk flow entirely (vendor maintains
  addresses through some other mechanism)

**OQ-7 — Full-table SELECT on `customers` for dedup.** Today the page
fetches every customer row on the platform to build the dedup maps. This
will not scale. The Edge Function can either:
- (a) replicate the full-table fetch using the service-role client
  (works regardless of scale, but every import is O(platform customer
  count))
- (b) do per-row lookups (`SELECT id, address FROM customers WHERE email
  = $1 OR phone = $2`) — O(import size × log(platform))
- (c) do batched lookups (`WHERE email = ANY(...) OR phone = ANY(...)`)
  — one or two round-trips regardless of platform size
Design call on which approach. Has implications for OQ-5 (phone match).

**OQ-8 — Failure semantics.** Should the Edge Function:
- (a) abort the whole import on first failure (matches `create-order`),
  or
- (b) attempt every row independently and return a per-row report
  (matches today's customer-import.html behaviour, which the operator-
  facing Stage 5 UI is designed around)
The Stage 5 UI today expects (b) — it renders counts of "added /
skipped / conflicts / failed". Switching to (a) would require Stage 5
UI changes too.

**OQ-9 — Address backfill — preserve silently-failing semantics?** Write
site 4 today does not capture errors. If the Edge Function adopts strict
error capture, what should happen if the backfill UPDATE fails? Options:
fail the whole row (downgrade the row to `failed`), fail just the
backfill silently (preserve today's behaviour), or always succeed
because the function is the only writer (service-role client bypasses
RLS).

**OQ-10 — JWT verification mechanism.** Standard pattern from operational
learning #16: `verify_jwt = false` in `supabase/config.toml`, then
`anonClient.auth.getUser()` inside the function, then look up the
vendor by `auth_user_id`. This gives the Edge Function the authoritative
`vendor_id` to write into `customer_relationships.owner_id`. The client
must not be allowed to supply `owner_id` in the body. Confirm this is
the intended pattern — should be a yes, but worth restating.

**OQ-11 — Email normalisation.** Today the page lowercases and trims
emails for the in-memory map only — the actual write to
`customers.email` uses `row.email` (untransformed). `create-order`
likewise passes `payload.customer.email` through unmodified. If two
import rows differ only in case, the second insert will succeed if
Postgres's collation treats them as distinct (default text equality is
case-sensitive). Should the Edge Function normalise `customers.email`
to lowercase on write, to align dedup with storage?

**OQ-12 — Phone normalisation.** `normalisePhone` (line 1183) handles
`07*` → `+447*` and `00*` → `+*`. International numbers, +44 already in
the input, US numbers, etc. pass through unchanged. The dedup map only
groups numbers that normalise to the same string. Is the current
normalisation good enough for the operator flow, or should the Edge
Function adopt a more robust e164 library? Probably fine as-is for the
foreseeable vendor population.

**OQ-13 — Conflict surfacing.** Conflict rows (email→A, phone→B) are
surfaced today only as a count + an expandable list on Stage 5. The
operator has no way to resolve a conflict from the page — they have to
fix the CSV and re-import. Acceptable for V1, or does the Edge Function
need a "resolve conflict" mode?

---

## Appendix — file pointers (for the build session)

- `customer-import.html:1075` — inline supabase client construction (the
  JWT-attach anti-pattern)
- `customer-import.html:1505` — `runImport()` start
- `customer-import.html:1536`, `:1545` — the two pre-write reads
- `customer-import.html:1593`–`1648` — classification / dedup logic
- `customer-import.html:1651`–`1689` — write sites 1 + 2 (new customer)
- `customer-import.html:1692`–`1727` — write sites 3 + 4 (existing customer)
- `customer-import.html:1410` — `fetchDemandBreakdown` (Stage 5 reads, same
  RLS pattern as the writes)
- `supabase/functions/create-order/index.ts:511`–`548` — customer + relationship
  upsert pattern to mirror
- `supabase/functions/create-order/index.ts:218`–`221` — service-role client
  init pattern
- `SCHEMA.md:301`–`331` — customers + customer_relationships schema reference
- `CLAUDE.md` operational learnings #6, #12, #14, #16 — the JWT-attach bug
  and the Edge Function migration pattern
- `PR-RLS-FIXES-AUDIT.md:36`–`38`, `:440`–`461` — the prior audit's findings
  on customer-import.html specifically

End of investigation.
