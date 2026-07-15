# Findings — wiring a platform "Send" button to Card 4's Email tab

READ-ONLY audit. Goal: confirm how to add a platform **Send** button to Card 4's
Email tab in `activation.html`, wired to the existing confirm→send pipeline,
calling `send-drop-open-email` with the vendor's composed message.

**Headline:** The existing confirm→send pipeline (`confirm-email` handler) **can**
carry a composed body to a send EF — but it is shaped for the Card 3/9 `emailCard()`
path, which reads `state.emailDrafts[tp]` and passes `custom_subject`/`custom_body`.
Card 4 stores its composed text in a **different place** (`state.channelDrafts['vendor_open'].drafts.email`)
and `send-drop-open-email` expects **different param names** (`message_body` + `subject`,
not `custom_*`). So the pipeline needs a small, well-defined extension — it is **not**
a blocker, but Card 4 cannot reuse the existing `confirm-email` branch verbatim.

---

## 1. The confirm→send pipeline (`confirm-email` handler, activation.html:4324–4388)

The handler keys off `tp = confirmEmail.dataset.touchpoint` and maps it to an EF via
a local `fnMap` (lines 4339–4343):

```js
const fnMap = {
  early_access: 'send-early-access-email',
  thank_you:     'send-post-drop-thankyou',
};
const fnName = fnMap[tp];
if (!fnName) {            // no EF for this touchpoint:
  state.expandedEmailCards[tp] = false;
  actLog(tp, 'email_confirmed');   // just logs done-state, NO send
  return;
}
```

**Exact body passed to `sb.functions.invoke` (lines 4358–4365):**

```js
const { data, error } = await sb.functions.invoke(fnName, {
  body: {
    vendor_id: state.vendor.id,
    drop_id:   dropId,
    custom_subject: state.emailDrafts?.[tp]?.subject || null,
    custom_body:    state.emailDrafts?.[tp]?.body    || null,
  },
});
```

So **yes, a composed body IS passed today** — `custom_subject` + `custom_body`, read
from `state.emailDrafts[tp]` (the `emailCard()` store, which Card 3/9 populate via
their subject/body inputs at 4331–4336 / 2658–2661 / 2925–2930).

On success it reads `data.sent` / `data.total` and calls
`actLog(tp, 'email_confirmed', { sent, total })` (line 4375).

**Mismatch vs `send-drop-open-email`** — the target EF's contract (verified in
`supabase/functions/send-drop-open-email/index.ts:55–71`):

```ts
let body: { vendor_id?; drop_id?; message_body?: string | null; subject?: string | null };
const { vendor_id, drop_id, message_body, subject } = body;
if (!vendor_id)    return 400 "vendor_id is required";
if (!drop_id)      return 400 "drop_id is required";
if (!message_body || !String(message_body).trim()) return 400 "message_body is required";
```

It wants `message_body` (REQUIRED) and `subject` (optional) — **not** `custom_body`/
`custom_subject`. It also logs `comms_log` touchpoint `'vendor_open'` and excludes
anyone already emailed for this drop's open (`interest_open`/`vendor_open`) or who has
already ordered.

**Consequence:** if a Card 4 Send button simply emitted `data-act="confirm-email"
data-touchpoint="vendor_open"`, the existing handler would (a) find no `fnMap['vendor_open']`
→ fall into the no-send branch and only log; and even if `fnMap` were extended, (b) it
would read `state.emailDrafts['vendor_open']` (which Card 4 never populates — Card 4 uses
`channelDrafts`) and (c) pass `custom_*` names the EF rejects (missing `message_body` → 400).

---

## 2. Card 4 Email tab — channel state, composed text, Copy control, attach point

**Active channel tracking.** Card 4's channels live on
`state.channelDrafts['vendor_open']` (built at 3175–3181):

```js
state.channelDrafts['vendor_open'] = { active: 'whatsapp', drafts, generated:{}, socialOptions:{...} };
```

- `card4Channels = state.channelDrafts['vendor_open']` (3183)
- `card4Active = card4Channels.active` (3186) — the email tab is selected when **`card4Active === 'email'`**
- The Email pill exists only when `card4ShowSocial` and `'email'` is among the drop
  profile's channels (`drafts.email` is seeded at 3180 when `chans.includes('email')`).
- Channel switch handler at **3935–3943**: `data-act="switch-channel"` sets `cd.active = ch`
  (`cd = state.channelDrafts['vendor_open']`).

**Where the composed text lives.** The active channel's text is
`card4Channels.drafts[card4Active]` (3187), i.e. for email:
**`state.channelDrafts['vendor_open'].drafts.email`**. The live textarea
(`data-act="message-textarea" data-touchpoint="vendor_open" data-channel="${card4Active}"`,
3221–3223) is flushed back into `cd.drafts[active]` on every re-render (renderDropView
2779–2787) and inside the copy handler (3973–3976).

> Note: there is NO `state.emailDrafts['vendor_open']` — Card 4 is entirely on the
> `channelDrafts` path. A Send must read `state.channelDrafts['vendor_open'].drafts.email`.

**Current Copy control markup + handler.** Two render branches both emit the same Copy
button:
- expanded editor (3247–3249): `<button class="act-copy-btn primary" data-act="copy-message" data-touchpoint="vendor_open" data-action="message_copied">Copy</button>`
- collapsed preview (3275–3277): identical.

Handler `copy-message` at **3964–3985**: for `tp === 'vendor_open'` it saves the textarea
into `cd.drafts[cd.active]`, copies `cd.drafts[cd.active]` to clipboard, then
`actLog('vendor_open', 'message_copied')`.

**Exact attach point for a Send button (email-only gate).** The Send button belongs in
`card4MessageArea` (3211–3280), beside the Copy button in **both** the expanded
(`.act-message-edit-row`, 3237–3250) and collapsed (`.act-channel-row`, 3266–3278) rows,
rendered only when **`card4Active === 'email'`**. Because both rows already read
`card4Active`, the gate is a simple `${card4Active === 'email' ? '<button …>Send to customers</button>' : ''}`.
The text to send is `card4Channels.drafts.email` (= `card4Text` when `card4Active==='email'`).

---

## 3. Manual log done-state for Card 4 (`vendor_open`)

- The card's done/✓-Sent state is keyed on `card4Entry = getLogEntry('vendor_open')` (3163).
- `getLogEntry` (1761–1767) returns the first `state.activationLog` entry with
  `touchpoint==='vendor_open'` and `actor !== 'host'`.
- That entry is written today by the Copy action → `actLog('vendor_open', 'message_copied')`
  (3983). `actLog` (1788–1808) pushes `{touchpoint, action, dropId, timestamp, ...meta}`,
  re-renders, and persists via `activation-events` (`op:'log'`).
- The ✓ Sent render appears at 3215 (`✓ Sent · ${formatLogTime(card4Entry.timestamp)}`),
  but **only in the `card4Entry && !card4ShowSocial` branch** (3212). For multi-channel
  (`card4ShowSocial`) cards the area stays in editor/preview mode regardless of `card4Entry`
  — i.e. the existing done-state is not shown for the social-enabled profile.

**To mark the same done-state from a platform Send:** call
`actLog('vendor_open', 'email_confirmed', { sent, total })` (mirroring the confirm-email
success at 4375). This writes the same `vendor_open` entry `getLogEntry` reads, so any
done-state gated on `getLogEntry('vendor_open')` will fire. (Action string `'email_confirmed'`
vs `'message_copied'` is immaterial to `getLogEntry`, which matches on touchpoint only.)

---

## 4. Sent-line stacking — `act-sent-card-4` + `hydrateSentComms`

**The slot.** Card 4 renders a single sent-line div: `<div class="act-sent-line"
id="act-sent-card-4"></div>` (3369). `.act-sent-line:empty { display:none }` (687–692)
hides it until populated.

**hydrateSentComms (2744–2773)** calls `get-drop-comms` and, per returned touchpoint,
does `setSlot('act-sent-card-' + cardNum, parts.join(' · '))` where:

```js
const COMMS_CARD = { interest_open: 4, early_access: 3, post_drop_thankyou: 9 };
const LINE = {
  interest_open: 'Hearth emailed your interest list',
  early_access: 'Hearth sent early access',
  post_drop_thankyou: 'Hearth sent your thank-yous',
};
const setSlot = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
```

**`setSlot` OVERWRITES** (`el.textContent = text`). `get-drop-comms` aggregates *all*
`comms_log` rows for the drop (it has no fixed touchpoint allow-list —
`supabase/functions/get-drop-comms/index.ts:91–105` groups whatever rows exist), so once
`send-drop-open-email` writes `vendor_open` rows, `get-drop-comms` WILL return a
`vendor_open` entry. But today `vendor_open` is absent from both `COMMS_CARD` and `LINE`,
so it is silently dropped (the `if (!cardNum || !LINE[t.touchpoint]) return;` guard at 2767).

**The accumulation problem.** If you simply add `vendor_open: 4` to `COMMS_CARD` and a
`LINE['vendor_open']`, both `interest_open` and `vendor_open` map to `cardNum 4` and the
second `setSlot('act-sent-card-4', …)` **overwrites** the first — only one line survives.
Card 4 needs to show **two** lines (interest_open + vendor_open).

**Two viable changes (pick one):**
- **(a) Second slot element.** Add a distinct `<div class="act-sent-line"
  id="act-sent-card-4-vendor"></div>` under Card 4 (alongside 3369) and map `vendor_open`
  to that id (e.g. a `COMMS_SLOT` override keyed by touchpoint rather than card number).
  Cleanest — keeps `setSlot`'s overwrite semantics, each touchpoint owns its own slot.
- **(b) Append for card 4.** Make `setSlot` (or a card-4-specific path) append a child line
  instead of overwriting when the slot already has content. More invasive (changes shared
  `setSlot` semantics; must reset between hydrate runs to avoid duplication on re-render).

Recommend **(a)** — additive, no change to existing `setSlot` overwrite behaviour, and
matches the existing "one slot per line" model.

---

## Build-readiness summary

1. **Composed body through the pipeline.** The existing `confirm-email` handler is
   `emailDrafts`/`custom_*`-shaped and has no `vendor_open` → `send-drop-open-email`
   mapping, and the EF requires `message_body` (not `custom_body`). So the pipeline
   **must be extended**, not reused verbatim. Minimal extension, two options:
   - **Branch the existing handler** on `tp === 'vendor_open'`: read text from
     `state.channelDrafts['vendor_open'].drafts.email`, invoke `send-drop-open-email`
     with `{ vendor_id, drop_id, message_body: <that text>, subject: <optional> }`,
     then `actLog('vendor_open', 'email_confirmed', { sent, total })`. (Keeps one handler;
     add `vendor_open` to a per-touchpoint arg-builder so the body uses `message_body`/
     `subject` rather than `custom_*`.)
   - **Or a dedicated Send handler** (`data-act="send-open-email"`) that does the same
     three steps, leaving the Card 3/9 `confirm-email` path untouched. Cleaner separation;
     avoids special-casing `emailDrafts` vs `channelDrafts` inside one handler.
   Either way the EF call is:
   `sb.functions.invoke('send-drop-open-email', { body: { vendor_id: state.vendor.id, drop_id: state.selectedDropId, message_body: state.channelDrafts['vendor_open'].drafts.email, subject: <optional> } })`.

2. **Attach point + email-only gate.** In `card4MessageArea` (3211–3280), add the Send
   button beside Copy in both the expanded (3237–3250) and collapsed (3266–3278) rows,
   guarded by `card4Active === 'email'`. Send the current `card4Channels.drafts.email`
   (flush the live textarea into `cd.drafts[cd.active]` first, exactly as the copy handler
   does at 3973–3976).

3. **Manual-log mark.** On Send success call
   `actLog('vendor_open', 'email_confirmed', { sent, total })` — same touchpoint
   `getLogEntry('vendor_open')` reads (1766), so the card's done-state fires and the entry
   persists via `activation-events`. (If a ✓ Sent line is wanted on the social-enabled
   profile, note the current done-state render at 3212 is gated `!card4ShowSocial`, so a
   separate done indicator for the email channel may be needed.)

4. **Sent-line accumulation.** Add a `vendor_open` line for Card 4 without clobbering the
   existing `interest_open` line — recommend a **second slot** (`act-sent-card-4-vendor`)
   plus a `vendor_open` entry in `LINE` and a slot mapping, because `setSlot` overwrites by
   `textContent`. `get-drop-comms` already surfaces `vendor_open` once the EF logs it — no
   EF change needed for the read side.

**No blocker.** The pipeline CAN carry a composed body to the send EF; it just needs the
small extension in (1) because Card 4's text store (`channelDrafts`) and the EF's param
names (`message_body`/`subject`) differ from the Card 3/9 `emailDrafts` + `custom_*` path.
