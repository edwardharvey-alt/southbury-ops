# Findings — Enquiries / comms architecture audit

Read-only. No code changed. Verified against live source, not docs.
Date: 2026-07-05. Branch: feature/catering-convert-enquiry.

## TL;DR

The activation/comms model recognises exactly **two** audience axes —
**openness** (open/closed) and **host presence** (yes/no) — and every one of
the nine touchpoints is either a **broadcast** (Instagram/social + whole
customer-email-list) or a **host-relay** (vendor → host → host's group). There
is **no "direct / single-named-recipient" touchpoint anywhere in
activation.html**, and reachability is not represented as a first-class axis.

The single-recipient send *pattern already exists at the Edge Function layer*
(`submit-catering-enquiry` sends two: vendor notification + enquirer
acknowledgement), but it is invisible to the operator — nothing is logged to
`comms_log` and no surface reflects it.

The catering→drop handoff exposes the gap concretely: a converted catering
enquiry becomes `drop_type='event'`, no host, `audience_scope` unset, which
`getDropProfile` resolves to the **closed + no-host** profile → cards **[3, 7,
9]**. It correctly *drops* reveal(1)/capacity(6), but the two active cards it
*keeps* — Card 3 "early access email" and Card 9 "thank-you email" — are
**broadcasts to the vendor's entire consented customer list / all drop
customers**, which is wrong for a single-client booking.

---

## 1. Touchpoint selection model

**Axes read.** `getDropProfile(summary)` reads exactly two derived inputs
(`activation.html:1793-1815`):

- `hasHost = !!summary.host_name` — host presence (`activation.html:1794`)
- `openness = resolveOpenness(summary)` — open/closed (`activation.html:1795`)

`resolveOpenness(summary)` (`activation.html:1776-1785`) reads three fields, in
priority order:

```js
function resolveOpenness(summary) {
  if (summary.audience_scope === 'public') return 'open';      // 1778
  if (summary.audience_scope === 'community') return 'closed'; // 1779
  if (summary.drop_type === 'event') return 'closed';          // 1783
  return summary.host_name ? 'closed' : 'open';                // 1784
}
```

So the full input set is: **`audience_scope`**, **`drop_type`**,
**`host_name`**. Note: **`status` is NOT read** by `getDropProfile` /
`resolveOpenness`. (Status gates public-card *rendering* elsewhere — closed
drops drop the public Instagram cards per the header comment at
`activation.html:1790` and CLAUDE.md learning #82 — but it is not an input to
profile *selection*.)

**Profile branches** (`activation.html:1811-1814`):

```js
if (openness === 'open'   && hasHost)  return { …, cards: [1,2,3,4,5,6,7,8,9], optional: [] };
if (openness === 'open'   && !hasHost) return { …, cards: [1,3,4,6,7,8,9],     optional: [] };
if (openness === 'closed' && hasHost)  return { …, cards: [2,3,5,7,9],         optional: [] };
/* closed && !hasHost */                return { …, cards: [3,7,9],             optional: [] };
```

**Is reachability already encoded?** Only *implicitly and partially*, via the
host axis. `hasHost` decides whether the host-relay cards (2, 5) appear — that
is the "host-relayed" reachability mode. But "broadcast" vs "direct-single-
recipient" is **not represented at all**: every non-host card (1,3,4,6,8,9) is
hard-coded broadcast, and there is no branch, field, or card that means "send to
one named person." A drop with a real single client (catering) has no way to
express that in this model.

**Where a new reachability axis would slot in.** It is a third dimension
orthogonal to the existing two. `resolveOpenness` is the natural place to
*derive* it (it already special-cases `drop_type === 'event'` at line 1783 — the
same signal that identifies a catering/event booking), and `getDropProfile`
would need a `reachability` value (`broadcast | host-relayed | direct`) driving a
new card-set branch. Today the 2×2 (`openness` × `hasHost`) yields four
profiles; adding reachability makes it a 2×2×3 space, but in practice
`direct` collapses the others (a single-client booking wants neither broadcast
nor host cards — it wants a client-directed thread). The cleanest slot is a new
early branch in `getDropProfile`: if reachability is `direct`, return a bespoke
card set before the openness/host matrix is consulted.

---

## 2. Direct / single-recipient touchpoints

**In activation.html: none.** Enumerating the nine cards by audience
(keys/titles from the maps at `activation.html:1869-1891`, EF audiences
confirmed below):

| Card | key | title | audience mode |
|---|---|---|---|
| 1 | `menu_reveal` | Share reveal post | broadcast (Instagram) |
| 2 | `host_heads_up` | Send host WhatsApp | **host-relay** |
| 3 | `early_access` | Send early access email | broadcast (whole customer list) |
| 4 | `vendor_open` | Tell customers ordering is live | broadcast (whatsapp/social/email) |
| 5 | `host_link` | Send host ordering link | **host-relay** |
| 6 | `capacity_signal` | Share capacity signal | broadcast (Instagram) |
| 7 | — (passive) | Order ready notifications | per-customer transactional, auto |
| 8 | `post_drop` | Post drop content | broadcast (Instagram) |
| 9 | `thank_you` | Send thank-you email | broadcast (all drop customers) |

Card 7 is the only *per-recipient* card, but it is a **passive automated
transactional** notification (no touchpoint key, `cardKeyMap[7] = null`,
excluded from progress — `activation.html:1876`, CLAUDE.md learning #65), not a
vendor-composed message to a chosen person. So **every vendor-driven activation
touchpoint is broadcast-or-host — there is no single-named-recipient pattern to
reuse.**

**Direct sends DO exist, but only at the EF layer, unsurfaced.**
`submit-catering-enquiry` performs two single-recipient sends:

- vendor notification → `to: vendor.email`
  (`submit-catering-enquiry/index.ts:290`)
- enquirer acknowledgement → `to: contactEmail`, fronted *as the vendor*
  (`from: buildFromHeader(vendorDisplayName, …)`, `reply_to: vendor.email`)
  (`submit-catering-enquiry/index.ts:351-357`)

Also single-recipient elsewhere: `send-order-confirmation` (one customer),
`send-host-activation-email` (one host's `contact_email`, CLAUDE.md learning
#82). So the mechanics exist — catering booking-stage comms would be building on
a **proven EF send pattern but a brand-new activation/touchpoint pattern.**

---

## 3. Operator nav — adding "Enquiries"

**One source, all pages.** The nav item list is defined **once** as `NAV_ITEMS`
in `assets/vendor-nav.js` and rendered by `HearthNav.renderNav(target,
activeFile, opts)` (single `.innerHTML` build over `NAV_ITEMS.map(...)`). Every
operator page calls it inline with a `<nav class="nav" id="operatorNav">`
placeholder (e.g. `home.html:906-907`, `activation.html:1440-1441`). Adding
"Enquiries" is a **one-line change to the `NAV_ITEMS` array** (plus adding
`enquiries.html` to the `OPERATOR_PAGES` whitelist so its own inbound CTAs get
vendor-decorated) — no per-page edits.

**Current count.** `NAV_ITEMS` today = **8 primary** (Home, Brand, Menu, Drop
Studio, Service Board, Share, Insights, Customers) + 3 utility (Hosts, Setup,
Sign out) = 11 anchors. "Enquiries" makes **9 primary / 12 total.** (The prompt
said "8th item" — there are already 8 primary; this would be the 9th.)

**Layout behaviour — wraps cleanly, no horizontal-scroll strip exists.**
`.nav { display:flex; flex-wrap:wrap; justify-content:flex-end }`
(`assets/hearth.css:175-181`). There is **no media query anywhere that touches
`.nav`** (confirmed by scan) and **no `overflow-x` scroll strip** for the nav —
the "mobile horizontal-scroll strip" in the prompt does not exist for the nav;
it simply **flex-wraps to a second right-aligned row** at every viewport. No
fixed-height container clips it. So adding an item needs **no layout work** —
it wraps by construction. Caveat, not a blocker: the bar is already crowded (11
anchors), and a 12th pushing to a wrapped second line on mid-width viewports is
a *visual density* judgement, not a breakage.

---

## 4. Enquiry acknowledgement surfacing

**The vendor sees nothing about the acknowledgement.** `submit-catering-enquiry`
writes **only** the `catering_enquiries` row (`index.ts:220-222`); both emails
are **best-effort, console-logged only** — there is **no `comms_log` write** in
the function (grep-confirmed: the only `.from(...)` calls are `vendors` read and
`catering_enquiries` insert). So neither the vendor notification nor the enquirer
acknowledgement leaves any operator-visible trace.

**What any surface reflects about enquiry-stage comms today: nothing.** The only
enquiry surface is `renderCateringEnquiries` in `home.html:2195-2266`, fed by
`list-catering-enquiries`. It renders: contact name, event facts (date / guests
/ type / fulfilment), brief, contact email/phone as `mailto:`/`tel:` links,
received date, and the "Turn into catering drop" button + inline error span.
**No comms status, no "acknowledgement sent" indicator, no send history.** The
vendor cannot tell whether the enquirer was auto-acknowledged, and has no
in-app way to send the enquirer anything — the only affordance is the raw
`mailto:` link (leaves the platform entirely, unlogged).

This is the natural home for the first "direct" comms surface: an enquiry is
inherently a **single-named-recipient** thread (the enquirer), and it currently
has zero comms representation.

---

## 5. The catering→drop handoff for comms

**What convert produces.** `convert-catering-enquiry` inserts a drop with
`drop_type: "event"` (`index.ts:175`), `status` left to DB default `'draft'`,
`expected_guests`, `fulfilment_mode`, and placeholder `delivery_start/end`
(`index.ts:171-189`). It sets **no host** and **no `audience_scope`** — so
`host_name` is null and `audience_scope` is unset/null.

**Trace for `drop_type='event'`, no host, `audience_scope` null:**

- `resolveOpenness`: not `'public'`, not `'community'`, then
  `drop_type === 'event'` → **`'closed'`** (`activation.html:1783`). The
  `host_name` fallback at 1784 is never reached — event short-circuits it, so
  the result is deterministic regardless of the null audience_scope.
- `getDropProfile`: `openness='closed'`, `hasHost=false` → the
  `closed && !hasHost` branch → **`cards: [3, 7, 9]`**
  (`activation.html:1814`).

**Actual resulting card set for a converted catering booking: [3, 7, 9]** —
- Card 3 "Send early access email"
- Card 7 "Order ready notifications" (passive)
- Card 9 "Send thank-you email"

**Does it wrongly show reveal / capacity?** **No** — the closed profile *does*
correctly drop reveal(1) and capacity(6) (and 4, 8). So the specific hypothesis
in the prompt (that it shows broadcast reveal/capacity cards) is **not** what
happens. **But the gap is real and slightly different:** the two *active* cards
it keeps are **broadcast email cards aimed at the wrong audience**:

- Card 3 `early_access` → `send-early-access-email`, which sends to **all
  consented customers for the vendor** (`customer_relationships` where
  `consent_status IN ('granted','imported')`, deduped by email —
  `send-early-access-email/index.ts:104-122`).
- Card 9 `thank_you` → `send-post-drop-thankyou`, which sends to **every
  customer who ordered in the drop** (CLAUDE.md 2026-05-30 entry).

For a single-client catering booking, "email early access to your whole
customer list" and "thank everyone who ordered" are **semantically wrong** — the
recipient should be the one catering client. The model has no way to express
that, so it defaults the event drop into a mini-broadcast profile. **This is the
gap the reachability axis exists to close.**

(Also worth noting: because the drop stays `status='draft'` until the operator
finishes it in Drop Studio, the public/Instagram suppression is doubly assured —
but Cards 3/9 are email, not Instagram, so they are not suppressed by the closed
profile.)

---

## 6. Spillover — other striking things for an inbound/enquiries layer

- **`comms_log` is touchpoint-agnostic and ready for direct sends.** Per
  CLAUDE.md learning #88, `comms_log.customer_id` is nullable and `recipient`
  is the universal target, `dedupe_key = '{touchpoint}:{drop}:{recipient}'`.
  A catering enquiry has no drop yet — an enquiry-stage direct touchpoint would
  need a dedupe key not keyed on drop (e.g. `'{touchpoint}:{enquiry}:{recipient}'`),
  which the current shape allows but no existing dispatcher does. The catering
  acknowledgement is currently **not** logged there at all (finding #4) — first
  thing an enquiries comms layer should fix.

- **The activation model is drop-anchored; enquiries are pre-drop.** Every
  activation touchpoint is keyed to a `drop_id` (`actLog` stamps
  `state.selectedDropId`; `getDropLog` filters by `dropId`). An enquiry exists
  *before* any drop. So an "Enquiries" comms surface cannot simply reuse the
  activation card/log machinery unchanged — it needs an enquiry-scoped log
  identity, then a **handoff** so that once converted, the thread history
  carries into the drop's activation timeline (today the convert EF copies the
  enquiry facts into `notes_internal` — `convert-catering-enquiry/index.ts:154-166`
  — but no comms history).

- **`audience_scope` is the existing explicit reachability override** and is
  vendor-settable in Drop Studio (comment at `activation.html:1777`,
  values `'public'`/`'community'`). A `'direct'` value would be the schema-honest
  way to represent single-recipient reachability, but the convert EF currently
  sets none — so any reachability inference for converted catering drops would
  have to lean on `drop_type='event'` unless convert is taught to stamp an
  explicit scope. (Flagging only — not chasing.)

- **Naming collision risk:** the nav label "Share" *is* `activation.html`.
  An "Enquiries" surface is the inbound counterpart to that outbound surface;
  worth keeping the mental model "Enquiries (inbound) → convert → Share
  (outbound)" so the two don't blur.

---

## Guardrail note

Nothing built, nothing edited, nothing committed. All claims above cite live
source with file:line. Two prompt assumptions did not hold and are reported as
such rather than worked around: (a) there is no mobile horizontal-scroll nav
strip — the nav flex-wraps (finding #3); (b) the converted event drop does **not**
show reveal/capacity cards — it shows the closed+no-host set [3,7,9], whose gap
is broadcast *email* cards, not Instagram cards (finding #5).
