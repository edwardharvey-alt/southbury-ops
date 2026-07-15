# Findings — Activation-vocabulary rename inventory

**Scope.** Read-only sweep for the words `activation` / `activate` / `activating`
(case-insensitive) across served `.html` / `.js` / `.ts` / `.css`. Classifies each
occurrence as FACING (vendor / host / customer copy) or INTERNAL (file names, ticket
IDs, doc titles, code identifiers, comments, EF names, the strategic "activate demand"
intelligence sense). Only FACING occurrences are findings. This is the vocabulary
inventory Pass E did not cover — **not** a Pass E re-run.

**Method.** `grep -rniE "activation|activate|activating"` over the code tree; every hit
inspected against live file contents. No edits made.

**Two distinct senses of the word surfaced in the codebase — kept separate below:**
1. **The drop-activation / share surface** (the `activation.html` feature + its nav label,
   the "Go to Activation" hand-offs, WhatsApp-activation helper copy, the Insights
   "repeat activation" nudge). This is the rename target.
2. **Unrelated standard verbs** that merely collide with the grep — the Menu Library
   item **Activate/Deactivate** toggle (enable/disable) and the signup **Activate your
   account** provisioning flow. These are legitimate plain English, *not* the strategic
   "activation" concept, so the "Share/invite" rename rules do not apply. Listed
   separately so they aren't mistaken for violations.

---

## 1. Rename table — FACING, drop-activation/share surface (the actual target)

Rule applied: FACING-VENDOR → **"Share" as a verb** ("Share your drop"), never a bare
noun page-label called "Share".

| path:line | current string | surface class | suggested replacement |
|---|---|---|---|
| assets/vendor-nav.js:61 | `label: "Activation"` (operator nav item, shown on every operator page) | FACING-VENDOR | verb label, e.g. **"Share your drop"** — must NOT become a bare noun "Share" (per rule). This is the anchor decision; the strings below inherit from it. |
| activation.html:9 | `<title>Hearth — Activation</title>` | FACING-VENDOR | `Hearth — Share your drop` |
| activation.html:1446 | `<h2 class="home-sectionTitle">Activation</h2>` (page heading) | FACING-VENDOR | `Share your drop` |
| activation.html:1437 | `<div ... id="actHeaderVendorSub">Activation</div>` (subtitle default, replaced by vendor name at runtime — visible as fallback) | FACING-VENDOR | `Share your drop` |
| activation.html:4061 | `... \|\| 'Activation';` (same subtitle fallback when no vendor name) | FACING-VENDOR | `'Share your drop'` |
| activation.html:1689 | `>Open activation →</a>` (cross-drop card CTA) | FACING-VENDOR | `Share your drop →` |
| activation.html:3987 | `Loading drop activation…` (loading state) | FACING-VENDOR | plain action, e.g. `Loading…` / `Loading your drop…` (drop the abstract noun) |
| activation-poster.html:280 | `← Back to Activation` (poster print page back link) | FACING-VENDOR | `← Back to Share your drop` (follows the nav rename) |
| drop-manager.html:1774 | `Go to Activation →` (Review-pane CTA button) | FACING-VENDOR | `Go to Share your drop →` |
| drop-manager.html:1780 | `Download your menu card and manage reveal content in Activation →` (Review-pane helper) | FACING-VENDOR | `… manage reveal content in Share your drop →` |
| drop-manager.html:4295 | `'Host assigned — WhatsApp activation available'` (readiness/status line) | FACING-VENDOR | verb rephrase, e.g. `Host assigned — you can share this drop on WhatsApp` |
| drop-manager.html:4296 | `'No host yet — adding one unlocks WhatsApp activation'` (readiness/status line) | FACING-VENDOR | `No host yet — adding one lets you share this drop on WhatsApp` |
| assets/hearth-intelligence.js:402 | `That context may deserve repeat activation.` (Insights host-signal recommendation body) | FACING-VENDOR | share-verb rephrase, e.g. `That context may be worth sharing another drop with.` |

No FACING-HOST or FACING-CUSTOMER occurrences of the word were found (see §3/§4).

---

## 2. FACING — different sense; NOT the activation-share surface (no rename under these rules)

These are facing strings but use the ordinary enable/provision meaning of "activate",
unrelated to the drop-activation/comms surface. The "Share"/"invite" rules produce
nonsense here ("Share your account", "Share a product"). Recommend **leave as-is**
(or, if a separate cleanup wants it, the item toggle could become Enable/Disable — but
that is out of scope for this rename and is not a violation).

**Menu Library item toggle (drop-menu.html) — enable/disable a catalogue item:**
- drop-menu.html:666 — `>Deactivate</button>` (category toggle button)
- drop-menu.html:718 — `>Deactivate</button>` (product toggle button)
- drop-menu.html:851 — `>Deactivate</button>` (bundle toggle button)
- drop-menu.html:2255 / 2268 — category button text `"Deactivate"` / `is_active ? "Deactivate" : "Activate"`
- drop-menu.html:2378 / 2395 — bundle button text `"Deactivate"` / `"Activate"`
- drop-menu.html:2715 / 2741 — product button text `"Deactivate"` / `"Activate"`
- drop-menu.html:3094 — toast `Category ${... "deactivated" : "activated"}`
- drop-menu.html:3110 — toast `Product ${... "deactivated" : "activated"}`
- drop-menu.html:3126 — toast `Bundle ${... "deactivated" : "activated"}`

**Signup account provisioning (signup.html) — set up / enable your account:**
- signup.html:406 — eyebrow `Activate your account`
- signup.html:444 — submit button `Activate account`
- signup.html:448 — terms line `By activating your account you agree to Hearth's vendor terms.`
- signup.html:640 — button busy state `"Activating…"` / `"Activate account"`

---

## 3. Special case — onboarding "first ten drops" essay: NEEDS-ED-VERIFY

The prompt's special case names an onboarding essay with the heading
**"What activation actually is"** and the line **"Activating a drop isn't marketing in
the usual sense"**, to be reworded to "What sharing a drop actually is" / "Sharing a
drop isn't marketing in the usual sense".

**Neither string — nor "first ten drops" / "ten drops" — appears anywhere in the
current `.html` / `.js` / `.ts` source.** `onboarding.html`'s only `activat` hit is a
code comment (line 1924, "phase re-activates"). The essay is not present in the repo as
described.

**NEEDS-ED-VERIFY.** Exact check Ed can run from repo root:
```
grep -rniE "what activation actually is|activating a drop|first ten drops" .
```
Expected under this finding: **zero hits** in served files. If it returns nothing, the
essay was removed/renamed or lives outside the repo (a stale seed — consistent with
other Build-Coherence-Audit seeds that drifted from live source). If Ed knows where the
essay actually lives (e.g. an external doc, a CMS, a not-yet-committed page), apply the
two rewordings there. No action possible from the repo alone.

## 4. FACING-HOST / FACING-CUSTOMER — none found

- **host-view.html** (the host surface): every `activat` hit is a CSS/JS comment, an
  Edge-Function invoke name (`activation-events`), or the `activation` region CSS class
  (lines 48, 682, 1052, 1057–1060). No word the host reads.
- **host-poster.html**: line 15 is a CSS comment only.
- **send-host-activation-email/index.ts** (email a host receives): `activat` appears
  only in the header comment, `console` logs, and the function name — **not** in the
  email subject or body. The host-facing copy does not contain the word.
- No customer-facing surface (`order.html`, `order-confirmation.html`, `host-view.html`
  order side) contains the word.

---

## 5. INTERNAL context list (not violations — reported for completeness)

None of the following are user-facing copy; no rename implied.

**activation.html** — the feature's own machinery:
- CSS class / comment tokens: `.activation-grid`, `actod = activation overview drop`,
  "Per-drop activation timeline", header/detail-view comments (lines 22, 42, 99, 104,
  267).
- Element ids / JS state: `id="activationContent"` and all `byId('activationContent')`
  reads (1448, 1697, 1702, 2987, 3987, 4070, 4075, 4813), `state.activationLog`,
  `_activationDropPhase`, `_activationDropPhase` phase logic, `getActivationLog`-style
  helpers (1468, 1480, 1539, 1621, 1635, 1689-region code, 1705, 1817–1853, 1955–1995,
  2653, 2756, 2774, 3008, 3273–3276, 3999–4031).
- Edge-Function invoke names + console tags: `activation-events` (1832, 1835, 1853,
  1991–1995, 4004–4031), `generate-activation-copy` (2653, 4295, 4440, 4529, 4548),
  `send-host-activation-email` (4709, 4747), `[activation]` log prefixes (4326, 4487,
  4548, 4671, 4747, 4803).
- URL / href: `./activation-poster.html?drop=…` (4134).
- `HearthNav.renderNav('operatorNav', 'activation.html', …)` (1441) — routing key.

**activation-poster.html** — `activation.html` href targets (411): URL, internal.

**drop-manager.html** — `id="goToActivationBtn"` + its listener + `HearthNav.withVendor('./activation.html')` (6178, 6181); reveal-ownership code comments (4401, 4403). Internal.

**host-view.html** — `activation`-region CSS class + comments + `activation-events`
invoke (48, 682, 1052, 1057–1060). Internal.

**assets/vendor-nav.js:81** — `"activation.html": true` active-file lookup map. Internal
(the *label* at line 61 is the facing one, in §1).

**onboarding.html:1924** — code comment "phase re-activates". Internal.

**platform-admin.html:808** — code comment "the vendor self-activates". Internal.

**host-poster.html:15** — CSS comment. Internal.

**Edge Functions** — `send-host-activation-email` (header comment, logs, fn name),
`activation-events` (comments + the `activation_events` table name), `generate-activation-copy`
(logs), `_shared/email.ts:8` (comment "relationship/activation mail"). All internal.

**Docs / tickets / schema** (INTERNAL by definition — file titles, ticket IDs, narrative):
`BACKLOG.md`, `CLAUDE.md`, `SCHEMA.md`, `Hearth_Repetition_Layer_Voice_Spec.md`,
`docs/support/activation-ideas-runbook.md`,
`docs/support/activation-outputs-first-three-vendors.md`, and the `audit/` findings files.

**Strategic "activate demand" sense** — the intelligence-layer meaning (CLAUDE.md
"activate demand", the recommendation engine's internal framing) is INTERNAL and out of
rename scope; the one place it surfaces as *rendered vendor copy* is
`hearth-intelligence.js:402`, captured as a finding in §1.
