# T-comms-direct-3a-ii — audit findings (catering confirmation SEND)

Audit-first, per the ticket. All seven gates resolved against live source before any code.
Archetype doc `Hearth_Enquiries_Surface_and_Direct_Comms_Archetype.md` is NOT present in the
repo (only stale branch refs reference it) — proceeded from CLAUDE.md + shipped 3a-i source.

## Gate 1 — existing send path (the pattern to mirror)
Confirmed end-to-end:
- **Card handler** `activation.html` ~4684 (`data-act="confirm-email"` / `send-vendor-open`).
  Flushes final edits into `state.emailDrafts[tp]`, maps touchpoint → EF via `fnMap`
  (`early_access → send-early-access-email`, `thank_you → send-post-drop-thankyou`,
  `vendor_open → send-drop-open-email`), then `sb.functions.invoke(fnName, { body })` where
  body = `{ vendor_id, drop_id, custom_subject, custom_body }` (Cards 3/9) or
  `{ vendor_id, drop_id, message_body, subject }` (Card 4). Shows a "Sending…" disabled state,
  checks BOTH `error` (transport) and `data.error` (function), logs `email_confirmed` with
  `{ sent, total }`, surfaces a calm green (`#166534`) result note for vendor_open.
- **Reference EF** `send-drop-open-email/index.ts`: auth via `anonClient.auth.getUser(jwt)`;
  vendor ownership (`vendors` where `id = vendor_id AND auth_user_id = user.id`, 403 otherwise);
  drop fetch scoped by `vendor_id`; recipient audience from `customer_relationships`
  (consent granted/imported); **comms_log claim-by-upsert** (`dedupe_key` unique,
  `onConflict: dedupe_key, ignoreDuplicates`) → row returned = this run owns the send, conflict
  = skip; Resend `POST https://api.resend.com/emails` with
  `from: buildFromHeader(display_name||name, FROM_HELLO)`, `reply_to: vendor.email`;
  per-recipient non-fatal try/catch; finalises `comms_log.status` to sent/failed.
  `verify_jwt = false` in config.toml.
**Mirror all of this EXCEPT recipient resolution (Gate 2) and dedupe (Gate 6).**

## Gate 2 — single-client recipient resolution
Resolve exactly as `get-catering-context` (3-pre) does: `catering_enquiries` where
`converted_drop_id = drop_id AND vendor_id = vendor.id`, `.maybeSingle()` (one-to-one back-link
set by `convert-catering-enquiry`). Read `contact_name, contact_email`. Service-role read
(the table has deny-by-default RLS, EF is its only path). **`contact_email` IS nullable** — the
table constraint requires email OR phone, so phone-only clients exist (documented in
get-catering-context header). NOT the drop's customer audience — a single named client.

## Gate 3 — subject
The 3a-i confirmation card produces a **body only** (`state.messageDrafts['catering_confirm']`,
a plain message draft — no subject field, unlike the Card 3/9 emailCards). So the send EF uses a
sensible vendor-fronted **default subject**: `Your catering order — {vendor display name}`
(falls back to `name`). `custom_subject` is accepted but the card sends it null in v1.

## Gate 4 — the card's send UI
3a-i Card 10 (`activation.html` ~3802) renders compose + regen chips + guidance + Generate/
Regenerate + Copy (`copyBtn('Copy message', 'catering_confirm', ...)` → `data-act="copy"`), and
passes `touchpointKey: 'catering_confirm'` to `tpCard`. Add a primary **"Send to client"**
button (`data-act="send-catering-confirm"`) in the same `.act-message-edit-row`, consistent with
the existing `send-vendor-open` primary button. The card already loads `get-catering-context`
into `state.cateringContextById[dropId]` in `showDropView` (awaited before first render), so the
render knows whether a client email exists.

**One necessary behavioural change to the 3a-i card:** drop `touchpointKey` from Card 10's
`tpCard` call. `actActionArea` collapses a card with a logged touchpointKey to a bare
"✓ Done" state, **removing the whole action area** — which would hard-block re-send (Gate 6).
Card 4 (vendor_open), the existing send-capable message card, deliberately does NOT
done-collapse; it stays a persistent compose/send card. Card 10 now mirrors that: it stays
open, renders its own persistent inline "✓ Sent to your client · {time}" marker from the log,
and keeps the Send button live for re-send. Progress counting is unaffected — `getDropProgress`
reads `state.activationLog` directly (any `catering_confirm` entry counts), independent of the
card's visual done-state. Direct-only card, so this changes no non-direct behaviour.

## Gate 5 — null-email handling
Detection: `state.cateringContextById[dropId]?.contact_email`. When absent (phone-only client),
the card shows **Copy only + a calm note** ("This client gave a phone number only — copy the
message and send it your way.") and **no Send button**. The EF is also belt-and-braces: if it
resolves no email it sends nothing and returns `{ sent: 0, skipped_reason: 'no_email_recipient' }`.

## Gate 6 — dedupe / re-send
`comms_log.dedupe_key` is `UNIQUE NOT NULL`; the broadcast pattern encodes
`{touchpoint}:{drop}:{recipient}` and skips on conflict (prevents double-emailing a list). For a
SINGLE client a legitimate re-send must NOT be hard-blocked. Approach: the catering send inserts
a **timestamp-suffixed** dedupe_key `catering_confirm:{drop}:{email}:{ms}` so every send is its
own honest ledger row and the DB never blocks a re-send. Client-side adds a **soft**
`window.confirm("You've already sent this confirmation… Send it again?")` on a subsequent send
(driven off the persisted log) — a soft confirm, never a hard block. `customer_id` is left null
(a catering client is not necessarily a `customers` row; `recipient` is the universal target).

## Gate 7 — non-direct unaffected
The change adds a send only to the direct catering-confirm card (Card 10, rendered solely under
`summary.audience_scope === 'direct'`, ~1826). No change to `getDropProfile` non-direct branches,
`resolveOpenness`, the broadcast send EFs, or any other card. New EF is additive.

## Build summary
- New EF `send-catering-confirm` + `[functions.send-catering-confirm] verify_jwt = false`.
- `activation.html`: Card 10 gains a Send button (email-present only) + persistent sent marker;
  new `send-catering-confirm` click handler; `touchpointKey` dropped from Card 10's `tpCard`.
- Deploy-before-merge: Ed deploys `send-catering-confirm` before merge.
