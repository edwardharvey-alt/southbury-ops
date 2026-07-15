# Findings — comms_log shape & enquiry-stage feasibility

Read-only audit. Goal: can `comms_log` durably record the catering enquiry
**acknowledgement** — a send that happens at ENQUIRY stage, before any drop exists?

**Bottom line: not as-is.** `comms_log.drop_id` is `NOT NULL` (with an FK to
`drops`), and an acknowledgement fires when there is no drop yet. The least-invasive
fix is to make `drop_id` nullable and add a nullable `enquiry_id uuid REFERENCES
catering_enquiries(id)` so one ledger holds both drop-keyed and enquiry-keyed rows.
Detail below.

---

## 1. The `comms_log` table

Single source of truth: `supabase/migrations/20260618120000_create_comms_log.sql`.
No later migration alters it (confirmed — grep of `supabase/migrations/*.sql` shows
only the create + the `ENABLE ROW LEVEL SECURITY` line in the same file).

Full schema (`create_comms_log.sql:20-34`):

| column | type | null? | default | notes |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `drop_id` | uuid | **NOT NULL** | — | `REFERENCES drops(id) ON DELETE CASCADE` — **the blocker** |
| `customer_id` | uuid | nullable | — | `REFERENCES customers(id) ON DELETE CASCADE`; null for host/vendor-directed sends |
| `touchpoint` | text | NOT NULL | — | free text; no CHECK/enum |
| `channel` | text | NOT NULL | — | free text; `'email'` in every current writer |
| `recipient` | text | NOT NULL | — | "the universal send target" (comment `:6-8`) |
| `dedupe_key` | text | NOT NULL | — | UNIQUE index (below) |
| `status` | text | NOT NULL | `'pending'` | `CHECK (status IN ('pending','sent','failed'))` (`:28-29`) |
| `sent_at` | timestamptz | nullable | — | stamped on success |
| `error` | text | nullable | — | stamped on failure |
| `meta` | jsonb | NOT NULL | `'{}'` | carries `resend_id` on success |
| `created_at` | timestamptz | NOT NULL | `now()` | |

Constraints / indexes:
- `PRIMARY KEY (id)`
- `CREATE UNIQUE INDEX idx_comms_log_dedupe_key ON comms_log (dedupe_key)` (`:37-38`) — the dedupe/claim key.
- `CREATE INDEX idx_comms_log_drop_touchpoint ON comms_log (drop_id, touchpoint)` (`:41-42`) — the "what's been sent for this drop" read path.
- RLS **enabled, no policies** (`:44-45`) — service-role only, no frontend path.

Answering the pointed questions:
- **`drop_id` present and NOT NULL?** Yes to both (`:22`). This is the crux.
- **touchpoint column?** Yes, `touchpoint text NOT NULL`, **free text, no enum**. Live values in the codebase: `'interest_open'`, `'vendor_open'`, `'post_drop_thankyou'`, `'catering_confirm'`. Adding a new value (e.g. `'catering_ack'`) needs no schema change.
- **recipient field?** Yes, `recipient text NOT NULL`.
- **status/outcome?** Yes, `status` with CHECK `pending|sent|failed`, plus `error` and `sent_at`.
- **timestamp?** `created_at` (row born) and `sent_at` (stamped only on successful send).

---

## 2. Who writes to it (attempt vs confirmed send)

Every writer follows the **same two-step "claim then resolve" pattern**: insert a
row at `status:'pending'` **before** the Resend call, then `UPDATE` it to `'sent'`
(with `sent_at` + `meta.resend_id`) or `'failed'` (with `error`) **after** the call
returns. So the row records an **attempt first**, and its final `status` records the
outcome. A `'pending'` row that never advances = an attempt that crashed mid-send.

- **`dispatch-interest-open`** (`index.ts:187-198` claim `touchpoint:'interest_open'`, `status:'pending'` via `.upsert(..., {onConflict:'dedupe_key', ignoreDuplicates:true})`; `:282-303` resolve `sent`/`failed` after `res.ok`).
- **`send-drop-open-email`** (`:216-227` claim `touchpoint:'vendor_open'`; `:260-281` resolve). Also **reads** comms_log first (see §3).
- **`send-post-drop-thankyou`** (`:146-157` claim `touchpoint:'post_drop_thankyou'`; `:199-220` resolve).
- **`dispatch-post-drop-thankyou`** (`:188-199` claim, byte-identical dedupe_key to the send- variant so the two race safely; `:240-261` resolve).
- **`send-catering-confirm`** (`:171-183` `.insert(...)` — plain insert, **not** upsert, `status:'pending'`; `:211-232` resolve). **This is the closest analog to what we want.** Notable details:
  - `dedupe_key` is **timestamp-suffixed**: `` `catering_confirm:${drop_id}:${recipientEmail}:${Date.now()}` `` (`:170`) — deliberately allows honest re-sends rather than hard-blocking on the unique index (header comment `:19-21`).
  - `customer_id: null` (`:175`) with the comment *"a catering client is not necessarily a customers row"* — precedent that a catering recipient need not be a `customers` FK.
  - Recipient resolved from the linked enquiry: `catering_enquiries WHERE converted_drop_id = drop_id AND vendor_id = caller` (`:113-118`).
  - If `logErr`, it **hard-fails the whole request 500** (`:185-188`) — the ledger row is treated as a precondition for sending.

- **Does NOT write comms_log:** `send-early-access-email` (confirmed — no `comms_log` reference in the file) and `submit-catering-enquiry` (the acknowledgement path — see §4).

---

## 3. Who reads it

- **`get-drop-comms`** (`supabase/functions/get-drop-comms/index.ts`) — the vendor-facing summary. JWT-auth + vendor/drop ownership check, then reads `comms_log.select('touchpoint, channel, status, sent_at').eq('drop_id', drop_id)` (`:89-92`) and aggregates in memory into per-`(touchpoint, channel)` `{sent, failed, pending, last_sent_at}` (`:95-104`). **Every read is scoped by `drop_id`** — there is no read path that isn't drop-keyed.
- **`activation.html`** consumes `get-drop-comms` (`:3044` `sb.functions.invoke('get-drop-comms', ...)`), maps `data.touchpoints` (`:3048`), and renders a "· sent DD Mon" marker from `t.last_sent_at` (`:3056-3057`). Card 10's "already sent" state keys on a touchpoint entry (`:3966` `e.touchpoint === 'catering_confirm' && e.action === 'confirm_sent'`).

**"Was X sent for this drop?" is answered today purely by `drop_id + touchpoint`**
(the `idx_comms_log_drop_touchpoint` index exists for exactly this). There is no
enquiry-keyed read anywhere. An enquiry-stage row would need its own read key
(`enquiry_id` or `recipient`), because at acknowledgement time there is no drop_id to
join on.

---

## 4. The acknowledgement send (and the absence of any record)

`submit-catering-enquiry/index.ts`, Step 7 (`:320-381`). Sequence:
1. Insert the enquiry row (`:220-233`) — the DB write is the source of truth.
2. Best-effort **vendor notification** email (Step 6, `:246-318`).
3. Best-effort **acknowledgement to the enquirer** (Step 7, `:326-381`): only if `RESEND_API_KEY` set **and** `contactEmail` present (phone-only enquiries skipped silently, `:330-331`); vendor-fronted (`from: buildFromHeader(vendorDisplayName, ...)`, `reply_to: vendor.email`, `:352,356`); POST to `https://api.resend.com/emails` (`:359-366`); on `!ackResp.ok` it only `console.error`s (`:368-374`), on success only `console.log`s (`:376`); the whole block is wrapped in `try/catch` that just `console.error`s (`:379-380`).

**Confirmed: best-effort, non-blocking, console-only. No durable record.** The
function writes nothing to `comms_log` and there is no `acknowledged_at` column on
`catering_enquiries` (schema `20260703120000_create_catering_enquiries.sql:6-33` —
no such column). `activation.html`'s own Card 13 comment says this outright
(`:3870-3874`): *"When the client first enquired, submit-catering-enquiry fired an
acknowledgement email automatically (best-effort, when they left an email). There is
no durable send record — no comms_log row, no acknowledged-at column — so we state
the honest DESIGN FACT ... never a fabricated [claim]."*

**Identifiers available at acknowledgement time** (all in scope inside Step 7):
- enquiry: the row was just inserted, but the current insert (`:220-233`) does **not** `.select()` the new `id` back — so the **enquiry `id` is not currently captured** in a variable. It would need `.select('id').single()` to be surfaced (trivial change).
- `vendorId` (`:103`), plus `vendor.email` / `vendor.display_name` / `vendor.name` (`:187-191`).
- `contactEmail` (the recipient, `:113`), `contactName` (`:105`).
- **No `drop_id`** — the drop does not exist at enquiry time (it may never exist, if the enquiry is archived). This is the structural mismatch with `comms_log` as it stands.

---

## 5. Enquiry-stage feasibility (the crux)

**Can `comms_log` hold an enquiry-with-no-drop row today? No.** `drop_id uuid NOT
NULL REFERENCES drops(id)` (`:22`) rejects both a NULL and a fabricated id (FK). There
is no drop to point at, and inventing a placeholder drop would be a model violation
(and would pollute every `drop_id`-scoped read in §3).

**Least-invasive accommodation that keeps one ledger and breaks nothing:**

```sql
ALTER TABLE comms_log ALTER COLUMN drop_id DROP NOT NULL;
ALTER TABLE comms_log
  ADD COLUMN enquiry_id uuid REFERENCES catering_enquiries(id) ON DELETE CASCADE;
-- integrity: exactly one of drop_id / enquiry_id must be set
ALTER TABLE comms_log
  ADD CONSTRAINT comms_log_scope_present
  CHECK ((drop_id IS NOT NULL) <> (enquiry_id IS NOT NULL));
```

Why this is the minimal safe option:
- **Existing drop-keyed rows are untouched** — they keep `drop_id` set and `enquiry_id NULL`; the new CHECK passes for every one of them.
- **Existing reads are untouched** — `get-drop-comms` filters `.eq('drop_id', drop_id)` (`:92`), which simply never matches an enquiry row (its `drop_id` is NULL). No drop-scoped read can accidentally surface enquiry rows.
- **`enquiry_id` FK cascade** mirrors the existing `drop_id`/`customer_id` cascades — an archived/deleted enquiry cleans up its own ledger rows.
- The `dedupe_key` unique index already handles the acknowledgement's key with no change: e.g. `` `catering_ack:${enquiryId}:${recipientEmail}` `` (single-shot; no timestamp suffix needed since an acknowledgement fires exactly once per enquiry).
- `touchpoint` is free text — a new `'catering_ack'` value needs no schema change; `recipient`, `channel`, `status`, `sent_at`, `error`, `meta` all already fit.
- `customer_id` stays NULL (an enquirer is not a `customers` row — same as `send-catering-confirm:175`).

Rejected alternatives:
- **A separate scope/`enum` column instead of `enquiry_id`** — loses the referential link to the enquiry and gives readers nothing to join on; you'd be storing the enquiry id in `meta` untyped. Weaker.
- **A separate `enquiry_comms_log` table** — a second ledger to read/dedupe/maintain; violates the "one touchpoint-agnostic ledger" intent stated in the table's own header comment (`:1-4`).
- **`acknowledged_at` on `catering_enquiries`** — records the fact but not as a comms send; doesn't unify with the ledger, can't carry `status:'failed'`/`error`, and would need bespoke read code. Only defensible if we explicitly decide the acknowledgement is an enquiry-lifecycle stamp, not a comms event. (See §6 — the whole value of using `comms_log` is honest success/failure.)

**Also needed regardless of the schema choice:** capture the enquiry `id` at insert
time (add `.select('id').single()` to the `:220-233` insert), since the
acknowledgement code currently has no handle on it.

---

## 6. Outcome vs attempt — write "acknowledged" only on a successful send

**Yes — only stamp a confirmed acknowledgement on a successful Resend send**, matching
every existing writer. The established pattern (§2) is: row born `pending` → `UPDATE`
to `sent` **only** inside the `res.ok` branch (e.g. `send-catering-confirm:219-226`),
`failed` otherwise. So "acknowledged" = a `comms_log` row that reached `status:'sent'`.
A failed or crashed send leaves `pending`/`failed` and must **never** be read back as
"acknowledged" — which is exactly the honesty the Card 13 copy is protecting today
(`activation.html:3870-3890`: it states the design fact that an ack *is sent
automatically*, and only claims one went out when the enquiry left an email).

To match the pattern precisely for the acknowledgement:
1. Claim/insert the ledger row `status:'pending'` **before** the Resend POST (mirror `send-catering-confirm:171-183`).
2. On `ackResp.ok`: `UPDATE ... status:'sent', sent_at: now(), meta:{resend_id}` (`:376` is where success is currently only logged).
3. On `!ackResp.ok` or throw: `UPDATE ... status:'failed', error: ...` (`:368-374`, `:379-380`).

One divergence to weigh: `submit-catering-enquiry` is a **public, best-effort,
never-block** endpoint — the acknowledgement "must never fail or block the response"
(`:13`, `:324-325`). `send-catering-confirm` by contrast **hard-500s** if the ledger
insert fails (`:185-188`). To preserve the enquiry endpoint's non-blocking contract,
the ledger write here should stay inside the existing best-effort `try/catch` and its
failure should degrade to a `console.error` (no durable ack, same as today) rather
than failing the enquiry submission. i.e. adopt the *resolve* pattern but keep the
*non-blocking* posture.

---

## Other notes relevant to enquiry-stage comms (not chased)

- **Enquiry id not currently surfaced** — the enquiry `insert` (`:220-233`) omits `.select()`, so any enquiry-keyed ledger row will need that added first. Small, but it's a real prerequisite.
- **Free-text `touchpoint` / `channel`** — no enum guard means a new `'catering_ack'` touchpoint is a code-only change, but also means nothing stops typos diverging from what readers expect. If `get-drop-comms` (or a future enquiry-comms read) is extended, keep the touchpoint string in one shared constant.
- **No enquiry-scoped read exists yet.** If the acknowledgement is logged, surfacing it (e.g. Card 13 showing a real "sent DD Mon" instead of the design-fact copy) needs a **new read path** keyed on `enquiry_id`/`recipient` — `get-drop-comms` is drop-only and won't return it. That's a follow-on, not part of the schema accommodation.
- **`drop_id ON DELETE CASCADE`** today means a deleted drop takes its ledger rows with it; an enquiry that later converts to a drop would keep the enquiry-keyed ack row under `enquiry_id` (independent lifecycle) — arguably correct (the ack genuinely happened at enquiry stage, not against the drop).
- **RLS service-role-only** — no change needed; the acknowledgement write already runs under a service-role client in `submit-catering-enquiry` (`:180-183`).

STOP — this is the audit. No schema/code written; the accommodation in §5 + the
writer changes in §6 are the proposed next step, not applied.
