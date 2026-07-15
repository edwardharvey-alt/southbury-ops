# Audit — aligning automated comms sends onto the per-drop Activation timeline cards

**Scope:** read-only audit of `activation.html` (branch `feature/activation-sent-by-hearth`, which already carries the `#act-comms-sent` side card + `hydrateSentComms` from PR #395). Plus a cross-check of which `comms_log.touchpoint` values the Edge Functions actually write.

**Goal:** confirm how the timeline cards are built so each automated comms send can be aligned onto the card for *its* moment, retiring the standalone "Sent by Hearth" side card.

**Headline:** ✅ The timeline cards DO carry a stable identity (`cardNum` 1–9) and a `cardKeyMap`. Alignment is feasible. **BUT two distinct ledgers must not be conflated** (see §1) and **only three `comms_log.touchpoint` values are ever written today** (see §6). The mapping below is built on those facts, not on the optimistic `LABELS` table currently in `hydrateSentComms`.

---

## 1. How the timeline `cards` array is built — and the two-ledger trap

In `renderDropView(dropId)`, the timeline is an array assembled card-by-card (`activation.html:2941`):

```js
const cards = [];
// Card 1 …  if (inProfile(1)) { … cards.push(actTouchpointShell({ cardNum: 1, … })); }
// Card 2 …  if (inProfile(2)) { … cards.push(actTouchpointShell({ cardNum: 2, … })); }
// … through Card 9 …
```
rendered at `activation.html:3692`: `<div class="act-timeline">${cards.join('')}</div>`.

**Which cards appear** is driven by `getDropProfile(summary)` (`activation.html:1645`), keyed on openness × host presence:
```js
if (openness === 'open'   && hasHost)  return { …, cards: [1,2,3,4,5,6,7,8,9], optional: [] };
if (openness === 'open'   && !hasHost) return { …, cards: [1,3,4,6,7,8,9],     optional: [] };
if (openness === 'closed' && hasHost)  return { …, cards: [2,3,5,7,9],         optional: [] };
/* closed && !hasHost */                return { …, cards: [3,7,9],             optional: [] };
```
Each card body is `if (inProfile(N)) { … }`-gated; the card number `N` is the stable identity.

**Every card carries a stable `cardNum`.** All three builders (`actTouchpointShell` `:2604`, `tpCard` `:2633`, `emailCard` `:2660`) take `cardNum` and stamp it onto the toggle: `data-card="${opts.cardNum}"` (`:2615`) and `id="act-tp-body-${cardNum}"`. So cards are addressable both at build time (the push site) and in the DOM (`[data-card="N"]`, `#act-tp-body-N`).

**The stable per-card touchpoint key exists — `getDropProgress` `cardKeyMap` (`activation.html:1687`):**
```js
const cardKeyMap = {
  1: 'menu_reveal',  2: 'host_heads_up', 3: 'early_access', 4: 'vendor_open',
  5: 'host_link',    6: 'capacity_signal', 7: null, 8: 'post_drop', 9: 'thank_you'
};
```

### ⚠️ The trap: `cardKeyMap` keys are *activation-log* keys, NOT `comms_log.touchpoint` values

There are **two separate ledgers**, and they use **different key vocabularies**:

| Ledger | What it is | Source | Key examples |
|---|---|---|---|
| `state.activationLog` | The vendor's manual "I shared / I confirmed" progress log (drives the done-states, progress bar, "next action") | `actLog()` → in-memory + `op:'log'` | `vendor_open`, `early_access`, `thank_you`, `host_link`, … (the `cardKeyMap` values) |
| `comms_log` (DB) | The **automated send ledger** read by `get-drop-comms` | the `send-*` / `dispatch-*` EFs | `order_confirmation`, `interest_open`, `post_drop_thankyou` |

Cards reference the **activation-log** key inline (e.g. `getLogEntry('vendor_open')` on Card 4 at `:3168`; `getLogEntry('menu_reveal')` on Card 1 at `:2954`). The comms ledger uses **different strings** for the same moments (`vendor_open`'s automated counterpart is `interest_open`; `thank_you`'s is `post_drop_thankyou`). **Any alignment code must translate comms_log keys → cardNum via a NEW explicit map — it cannot reuse `cardKeyMap` directly.** Reusing `cardKeyMap` would silently match nothing.

This is the same class of mismatch already documented in CLAUDE.md (the activation host-origin progress exception `host_link`/`shared`, learning #80) — day-named / cross-ledger key variants do not line up by accident.

---

## 2. The "ordering opens" card (Card 4) — exact markup & where a muted "sent" line attaches

Card 4 is the **ordering-opens** moment, built via `actTouchpointShell` (`activation.html:3382`):
```js
cards.push(actTouchpointShell({
  classes: `act-touchpoint is-vendor${card4Entry ? ' is-done' : ''}`,
  cardNum: 4,
  label: labels[3],
  title: optionalTitle(4, 'Tell your customers ordering is live'),
  bodyHtml: card4Body,
  open: actCardOpen(4, !!card4Entry, false),
  bodyId: 'act-tp-body-4'
}));
```

`card4Body` template (`activation.html:3372`):
```js
const card4Body = `
    <p>Pick where you're posting — the card shows you exactly what to do for that channel.</p>
    ${card4PillBar}
    <div class="act-actions">
      ${card4SocialFlow
        ? `<div class="act-social-grid">${card4ImageZone}${card4MessageZone}</div>${card4PhotoControls}${card4SocialHelper}`
        : card4MessageZone}
      ${card4PosterZone}
    </div>
`;
```

The shell renders `title` as `.act-tp-title` inside the toggle (`:2619`), then `bodyHtml` inside `.act-tp-body` (`:2626–2627`). The first line of the body is the prompt `<p>Pick where you're posting…</p>`.

**Inject point for a quiet "sent" line:** insert a single muted node **immediately after that first `<p>`** (between line 3373's `<p>…</p>` and `${card4PillBar}`), e.g.:
```html
<p class="act-comms-sent-line">Interest list notified · N sent · 3 Jun</p>
```
This sits beneath the title/prompt and above the channel pills — exactly the "beneath its title/prompt" slot requested. (Card 4's existing internal done-state `✓ Sent · {time}` at `:3220` is the **vendor's manual** WhatsApp-copy confirmation — semantically different from the **automated** interest_open send, so the two should read as distinct lines.)

---

## 3. Service / order-ready card and thank-you (morning-after) card — do they exist?

**Both exist as fixed timeline cards.**

- **Card 7 — order-ready / service** (`activation.html:3560`), built via `tpCard`, `typeClass: 'is-auto'`:
  ```js
  cards.push(tpCard({
    typeClass: 'is-auto', cardNum: 7,
    title: optionalTitle(7, 'Order-ready notifications are automatic'),
    desc: "There's nothing to send from here. When you mark an order Ready on the Service Board … the platform notifies that customer automatically. …",
    actionHtml: `<a class="act-copy-btn" href="${HearthNav.withVendor('./service-board.html')}">Open Service Board</a>`
  }));
  ```
  Identified by `cardNum: 7`. It is the **passive auto-card** — `cardKeyMap[7] = null`, it never logs to the activation log, and is excluded from progress counting (CLAUDE.md learning #65). **No `comms_log` row exists for it** (see §6) — nothing writes an order-ready touchpoint today.

- **Card 9 — thank-you (morning-after)** (`activation.html:3624`), built via `emailCard`, `typeClass: 'is-auto'`, locked until the drop closes:
  ```js
  cards.push(emailCard({
    typeClass: 'is-auto', cardNum: 9,
    title: optionalTitle(9, 'Thank-you email to every customer'),
    channel: 'Email',
    desc: 'A warm, brief thank-you goes to everyone who ordered. Review and confirm before it sends.',
    subject: state.emailDrafts['thank_you'].subject,
    body: state.emailDrafts['thank_you'].body,
    note: `Sends to ${orderCount} customer${orderCount === 1 ? '' : 's'} who ordered from this drop.`,
    locked: status !== 'closed', lockedNote: 'This confirms once your drop closes.',
    touchpointKey: 'thank_you'
  }));
  ```
  Identified by `cardNum: 9`; activation-log key `thank_you`; its **automated comms_log counterpart is `post_drop_thankyou`** (written by both `send-post-drop-thankyou` and the morning-after `dispatch-post-drop-thankyou`).

(For completeness, **Card 3 — early access**, `emailCard` `cardNum:3`, activation key `early_access`, `:3145`. See §6 for why it has no comms_log row yet.)

---

## 4. asideHtml ORDERS PLACED block — home for `order_confirmation`

`asideHtml` stat card (`activation.html:3650`), the ORDERS PLACED block:
```js
const asideHtml = `
  <div class="act-stat-card">
    <p class="act-stat-eyebrow">This drop, live</p>
    <div class="act-stat-row">
      <p class="act-stat-label">Orders placed</p>
      <p class="act-stat-value">${orderCount}</p>
    </div>
    <div class="act-stat-divider"></div>
    <div class="act-capacity"> … capacity bar … </div>
    ${asideShowGmv ? `… Revenue row …` : ''}
  </div>
  …
`;
```

**Inject point for a quiet "Order confirmations · N" line:** inside the first `.act-stat-row` (Orders placed), **after the `<p class="act-stat-value">${orderCount}</p>`** but before the `.act-stat-divider` at `:3657`, e.g.:
```html
<p class="act-comms-subline">Order confirmations · N sent</p>
```
`order_confirmation` is per-order/transactional with no timeline moment of its own, so the orders-placed count is its natural home.

---

## 5. Current `#act-comms-sent` side card + `hydrateSentComms` (to be repurposed/removed)

**The standalone card** (appended to `asideHtml`, `activation.html:3678`):
```html
<div class="act-stat-card" id="act-comms-sent">
  <p class="act-stat-eyebrow">Sent by Hearth</p>
  <div class="act-comms-body">Loading…</div>
</div>
```
**Its hydrator call** (`activation.html:3698`, immediately after `content.innerHTML`): `hydrateSentComms(dropId);`

**`hydrateSentComms`** (`activation.html:2748`): authenticated `sb.functions.invoke('get-drop-comms', { body:{ vendor_id: state.vendor.id, drop_id: dropId } })`, checks both `error` and `data.error`, reads `data.touchpoints` (`[{ touchpoint, channel, sent, failed, pending, last_sent_at }]`), and renders one `.act-comms-row` per touchpoint using:
```js
const LABELS = {
  order_confirmation: 'Order confirmations',
  interest_open: 'Interest list notified',
  post_drop_thankyou: 'Thank-yous',
  early_access: 'Early access',   // ⚠ never appears — see §6
};
```
**CSS** added in PR #395 (`:687`): `.act-comms-body`, `.act-comms-row`, `.act-comms-row:first-child`.

**Repurpose plan:** keep the single `get-drop-comms` fetch, but instead of rendering all rows into one side card, **distribute each touchpoint to its card's inject point** (per the map in §7), then **delete** the `#act-comms-sent` card block (`:3678–3681`) and its `LABELS`-driven row rendering. The `.act-comms-*` CSS can be retired or repointed to the new inline `.act-comms-sent-line`/`.act-comms-subline` classes.

---

## 6. ⚠️ Ground truth — only THREE `comms_log.touchpoint` values are written today

Grep of `supabase/functions/` for what actually gets inserted into `comms_log`:

| `comms_log.touchpoint` | Written by | 
|---|---|
| `order_confirmation` | `send-order-confirmation/index.ts:496, :534` |
| `interest_open` | `dispatch-interest-open/index.ts:192` |
| `post_drop_thankyou` | `send-post-drop-thankyou/index.ts:151`, `dispatch-post-drop-thankyou/index.ts:193` |

Functions that insert into `comms_log` (complete list): `send-order-confirmation`, `dispatch-interest-open`, `send-post-drop-thankyou`, `dispatch-post-drop-thankyou` (+ `get-drop-comms` reads only).

**Two gaps to be explicit about:**
- **`early_access`** — `send-early-access-email/index.ts` does **NOT** write `comms_log`. So `early_access` can never appear in `get-drop-comms` output today. The `early_access` entry in the current `hydrateSentComms` `LABELS` is **dead/aspirational** — Card 3 will show nothing until that EF is taught to log.
- **order-ready** — no EF writes any `order_ready`/`order-ready` touchpoint at all. Card 7 will have nothing to show until an order-ready send path logs to `comms_log`.

So the live alignment surface today is exactly: **interest_open → Card 4, post_drop_thankyou → Card 9, order_confirmation → aside.** Card 3 and Card 7 are wired-for-future but currently empty.

---

## 7. Build-readiness note

### Touchpoint → card key mapping (NEW map — translate `comms_log.touchpoint` → cardNum; do NOT reuse `cardKeyMap`)

| `comms_log.touchpoint` | Target | cardNum | Live today? | Inject point |
|---|---|---|---|---|
| `interest_open` | Ordering-opens card | 4 | ✅ yes | after first `<p>` in `card4Body` (`:3373`) |
| `post_drop_thankyou` | Thank-you card | 9 | ✅ yes | `emailCard` desc area (see below) |
| `order_confirmation` | aside "Orders placed" | — | ✅ yes | inside `.act-stat-row` after `${orderCount}` (`:3655`) |
| `early_access` | Early-access card | 3 | ⛔ not logged yet | `emailCard` desc area (future) |
| *(order-ready)* | Order-ready card | 7 | ⛔ not logged yet | `tpCard` desc area (future) |

### Exact inject point per card
- **Card 4 (interest_open):** `card4Body` template, between `<p>Pick where you're posting…</p>` and `${card4PillBar}` (`activation.html:3373`). Direct string edit — Card 4 builds its own body.
- **Cards 3 & 9 (early_access / post_drop_thankyou):** these go through `emailCard → tpCard`, and `tpCard` composes the body as ``bodyHtml: `<p>${opts.desc}</p>\n<div class="act-actions">${res.html}</div>` `` (`activation.html:2647`). There is no per-card slot between the `<p>desc</p>` and the actions today. Cleanest options, in order of least churn:
  1. Pass a new optional field (e.g. `sentLine`) through `emailCard → tpCard` and render it as `<p class="act-comms-sent-line">${sentLine}</p>` right after `<p>${desc}</p>` in `tpCard` (`:2647`). One shared change covers Cards 3, 7, 8, 9.
  2. Or append to the existing `note` line (Card 9 already renders `note` at `emailCard:2729`).
- **Card 7 (order-ready, future):** same `tpCard` `sentLine` slot as above.
- **order_confirmation (aside):** `.act-stat-row` in `asideHtml` (`activation.html:3653–3656`).

### `order_confirmation`'s proposed home
The aside **"Orders placed"** stat row (`activation.html:3653`). It has no timeline moment (it's per-order, fired by `stripe-webhook` → `send-order-confirmation`), so a quiet subline under the orders count is the honest placement — not a timeline card.

### Recommended implementation shape
1. Keep the single authenticated `get-drop-comms` fetch from `hydrateSentComms`.
2. Build `const byTouchpoint = Object.fromEntries(items.map(t => [t.touchpoint, t]))` and a NEW `COMMS_TO_CARD` translation map.
3. After `content.innerHTML`, write each touchpoint's summary line into its card's inject node (`#act-tp-body-4` for interest_open, the aside row for order_confirmation, etc.) rather than into one side card.
4. Delete the `#act-comms-sent` side card (`:3678–3681`).
5. Degrade silently per touchpoint: a card with no matching comms row simply shows no extra line (no "Nothing sent yet." placeholder per card).

### No blocking ambiguity
The timeline cards carry stable identity (`cardNum`), the moments line up cleanly, and the alignment is buildable. The only real constraints are the cross-ledger key translation (§1) and the two not-yet-logged touchpoints (§6) — neither blocks the interest_open / post_drop_thankyou / order_confirmation alignment, which is the live surface.
