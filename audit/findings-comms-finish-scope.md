# Audit — "finish comms" scope survey

**Type:** read-only inventory (grep-first, confirm-only). No source edits.
**Base:** `origin/main` @ `2756326` (#397 merged).
**Goal:** establish current state of three comms areas so the build is designed against reality.

All surfaces were found where expected — no stop-and-report condition hit.

---

## AREA 1 — Confirm-to-send (platform sends on vendor confirm)

### 1a. Card 4 ("ordering opens" / `vendor_open`) — EMAIL tab is compose-and-Copy only

Card 4 carries three channels in `state.channelDrafts['vendor_open']` — `whatsapp`, `social`, `email` (`activation.html:3175-3181`), drafts seeded from `templates['vendor_open' | 'vendor_open_social' | 'vendor_open_email']` (`:2876-2882`). The active channel is switched via a pill bar (`data-act="switch-channel"`, `:3193`).

**The message area (`card4MessageArea`, `:3211-3280`) is channel-agnostic** — the primary action is **Copy** in every channel, never Send:
```html
<button class="act-copy-btn primary" type="button"
  data-act="copy-message" data-touchpoint="vendor_open"
  data-action="message_copied">Copy</button>        <!-- :3247-3249 and :3275-3277 -->
```
The done-state `✓ Sent · {time}` (`:3215`) is **the vendor's own manual log after copying**, not a platform send. So the EMAIL tab has **no send path** — it just hands the vendor a draft to paste into their own email tool.

**Where a platform "Send" would attach:** inside `card4MessageArea`, in the `.act-message-edit-row` (`:3237`) / `.act-channel-row` (`:3266`) button cluster, **gated on `card4Active === 'email'`**, as a new primary button distinct from Copy — wired to the existing `confirm-email`-style flow (see below).

**Important — the confirm-to-send mechanism already exists, just not for Card 4.** The `confirm-email` handler (`:4324-4388`) is a complete platform-send-on-confirm pipeline already used by the *email cards*: it saves edits, maps touchpoint → EF via `fnMap` (`:4339-4342`), invokes the EF with `{ vendor_id, drop_id, custom_subject, custom_body }`, and logs `email_confirmed {sent,total}` into the card's done-state. Card 4 simply isn't plumbed into it (it uses the copy-message path instead).

### 1b. Host-directed comms + host contact — both exist

**Composers / hand-off surfaces:**
- **Card 2 (`host_heads_up`, Tuesday "host awareness"):** primary `Email share page to {host}` (`data-act="email-host-share"`, `:3104`) → `send-host-activation-email` EF (handler at `:4390`), with a `Copy link` fallback (`data-act="copy-host-link"`).
- **Card 5 (`host_link`, Thursday "host link"):** host-link share nudge (`getHostShareSignal('host_link')`, `:3398`).

**Host CONTACT capture — yes:**
- `host-profile.html` collects `contact_name` / `contact_email` / `contact_phone` (fields `:815-817`, saved `:1002-1004`).
- `update-host` EF whitelists all three (`ALLOWED_FIELDS`, `update-host/index.ts:19-21`).
- `create-host` captures `name` only (minimal — no contact fields at inline creation; CLAUDE.md T4-37 territory).
- `send-host-activation-email` reads `hosts.contact_email` (`:117, :127`); when absent returns `{ sent:0, skipped:"no_host_email" }` (`:128-129`) — not an error, A2 falls back to manual copy.

**Note:** `send-host-activation-email` does **not** write `comms_log`.

### 1c. On-demand customer/list email EFs (beyond send-order-confirmation + dispatchers)

Three exist, all sharing the Resend HTTP pattern (`POST https://api.resend.com/emails`), `{ vendor_id, drop_id, custom_subject, custom_body }` body, per-recipient send loop, `{sent,total,errors}` response:

| EF | Audience |
|---|---|
| `send-early-access-email` | `customer_relationships` where `consent_status IN ('granted','imported')` — previous + imported customers |
| `send-post-drop-thankyou` | customers who ordered in the drop |
| `send-host-activation-email` | the drop's single host |

**Reuse vs net-new for a Card 4 email-on-confirm:** the **infrastructure is fully reusable** (recipient resolution + Resend loop + confirm-email handler). What's net-new is the **audience semantics**: `interest_open` is *already auto-sent* to interest registrants by `dispatch-interest-open` when ordering opens, so a vendor-confirmed Card 4 email would be aimed at a *different* list (e.g. all customers / interest list manually) and needs its own recipient query + EF. Cheapest path: clone `send-early-access-email`'s shape with the Card 4 audience.

---

## AREA 2 — Early access

### 2a. `send-early-access-email` — exists, sends, manual trigger, no comms_log

- **Exists.** Sends to `customer_relationships` with `consent_status IN ('granted','imported')` for the vendor (`send-early-access-email/index.ts:108-112`), building `{name,email}` recipients (`:117-125`), one Resend send each (`:200-223`), supports `custom_subject`/`custom_body`, returns `{ sent, total, errors }` (`:235`). Empty-recipient short-circuit at `:128`.
- **Trigger:** manual — **Card 3 "Confirm send"** → `confirm-email` handler `fnMap.early_access = 'send-early-access-email'` (`activation.html:4340`).
- **comms_log:** does **NOT** write it (no `comms_log` reference in the EF). So `early_access` never appears in `get-drop-comms` → the Card 3 sent-line slot built in #396 stays empty until this EF is taught to log. (Matches the "lights up later" expectation.)

### 2b. Early-access WINDOW mechanic — DOES NOT EXIST

- **Schema:** `drops` Timing columns are exactly `opens_at`, `closes_at`, `cutoff_time`, `delivery_start`, `delivery_end` (`SCHEMA.md:233-234`). **No** `early_access_opens_at`, no public-vs-early open-time distinction.
- **drop-manager.html Timing pane:** no early-access / public-open / preview fields (grep hits were unrelated demand-preview CSS only).
- **order.html:** **no** early-access, previous-customer, or members-only ordering gate anywhere (zero matches).

So "early access" today = a *send* ("you're first to know"), **not** a gated ordering state. Everyone orders through the same public `opens_at`/`closes_at` window.

### 2c. Card 3 ("Early access") action

Built via `emailCard` (`:3147-3152`, `touchpointKey: 'early_access'`): editable subject + body, AI **Generate body** (`generate-activation-copy` case `early_access_email`, `:4040/:4076`), and a real **Confirm send** (platform send via the EF above). Locked when the vendor has no previous customers, with an explanatory note.

---

## AREA 3 — Social prep

### 3a. Auto-generated Monday-reveal menu-card image — YES (T5-25 Part 0)

- **Card 1 reveal:** `actPopulateMenuCard()` (`:1848`) renders a 540×540 `.menuCardArtwork` (photo + drop-name/date lockup + scrim); `Download menu card` exports it via **html2canvas scale:2 → 1080×1080** (`:1862`, lib loaded `:18`).
- **Standalone `activation-poster.html`** exists (printable till / noticeboard poster, also html2canvas).
- **Image fallback chain** (shared across reveal/capacity/orders-open): selected reveal-product photo → `vendor.hero_image_url` → solid brand-colour block.

### 3b. Capacity signal (Friday, Card 6) — YES, threshold-gated

- **Lock/threshold:** unlocked when `status === 'live'` **OR** `orderCount >= 0.5 * capTotal` (`:3476-3477`); locked otherwise with a "appears when live or approaching capacity" note.
- **Story-text surface:** pick-one honest `capacityVariants` wordings (sold-out aware, `:2894-2907`), rendered as selectable `.act-capacity-wording` options.
- **Image:** a 540×540 capacity artwork with `Download image`, plus `Copy capacity post`.

### 3c. Social composer infrastructure already built

- **Caption generation —** `generate-activation-copy` EF with **9 touchpoint cases**: `menu_reveal_hook`, `menu_reveal`, `host_heads_up`, `vendor_open`, `host_link`, `post_drop`, `early_access_email`, `post_drop_thankyou`, `poster_hook`. Per-card Generate/Regenerate, one-tap adjustment chips, and free-text guidance steer.
- **Image/poster generation —** html2canvas-based downloads for the menu card (Card 1), capacity card (Card 6), and orders-open card (Card 4); plus the standalone printable `activation-poster.html` (till/noticeboard).
- **Image assets —** shared reveal-product image options + per-drop social image with the fallback chain, and an upload component for vendor-supplied photos.
- **Poster hook —** the till/noticeboard line (`reveal_line`) is generated via the `poster_hook` touchpoint and editable inline (`#act-posterHookInput`, `:3335-3338`).

---

## Build-readiness notes

### Area 1 — confirm-to-send
- **Card 4 EMAIL "Send" hooks in** at `card4MessageArea` (`activation.html:3211-3280`), gated on `card4Active === 'email'`, reusing the existing `confirm-email` pipeline (`:4324-4388`) + `fnMap`. The button is the only UI change; the wiring already exists.
- **Host comms + host contact both exist** (Card 2/5 composers; `contact_email/phone/name` captured via host-profile + update-host; read by `send-host-activation-email`). No new capture surface needed for host email.
- **Send EF: reuse, not net-new infra.** A Card 4 customer-email send clones `send-early-access-email`'s Resend + recipient pattern; only the audience query is new (and beware overlap with the already-automatic `dispatch-interest-open` to interest registrants).
- Gap to note: none of `send-early-access-email`, `send-host-activation-email` write `comms_log` today — if "sent" lines should reflect them, logging must be added.

### Area 2 — early access: explicit fork
- **Lighter path (ships now):** "notify previous customers first" is **already built** — `send-early-access-email` + Card 3 Confirm send. The only missing piece to make it visible in get-drop-comms is **adding a `comms_log` write** (touchpoint `early_access`) to the EF. This is a small, self-contained EF change; no Drop Studio / order.html work.
- **Heavier path (net-new):** an early-access *ordering window* (previous-customers-only state, gated public-open time) **does not exist at all** — no schema column, no Timing-pane UI, no order.html gate. This is Drop Studio + order.html + schema territory (new `drops` timing column + access check in `create-order`/`order.html`). Significantly larger.
- **Recommendation to decide:** if "early access" means *a head-start email*, it's nearly done (add logging). If it means *a real ordering window*, it's a multi-surface build. These are different products — pick before building.

### Area 3 — social prep: built vs missing
- **Already built:** Monday reveal menu-card image (auto-generated, 1080×1080), capacity-signal image + threshold prompt, orders-open card image, printable poster page, a 9-touchpoint AI caption generator, adjustment chips/guidance, image fallback chain + upload.
- **Genuinely missing:** essentially nothing in the *composer/asset* layer — social prep is the most complete of the three areas. The only adjacent gaps are (a) no direct-to-social *publishing* (by design — vendor posts via their own Instagram), and (b) the documented `reveal_line` semantics drift (T-D4) when the T5-25 Part 1 caption composer is eventually built. No core social-prep capability is absent.
