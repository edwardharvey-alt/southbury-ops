# Hearth — Build Coherence Audit

**Purpose.** Surface every place the build contradicts the locked strategy, or contradicts
itself. This is the pre-launch de-risking pass. It is read-only analysis — it produces
findings, never edits. Confirmed findings become BACKLOG.md tickets and are fixed one at a
time through the normal pipeline.

**Status:** COMPLETE 2026-06-16 — all five passes (A–E) run, triaged, and fixed or logged.
The per-pass findings and resulting tickets live in BACKLOG.md (the "Build Coherence Audit —
Pass A/B/C/D/E" sections) and the CLAUDE.md operational learnings.

---

## How a pass runs (protocol)

Each pass is a single Claude Code session, scoped to one domain below. The prompt opens
"Read CLAUDE.md first", then "Read Hearth_Build_Coherence_Audit.md", then runs only the
named pass. Grep-first, evidence-first, no edits.

**Hard rules for every pass**
- No file edits, no commits, no PRs. The only output is a findings file.
- Verify every assertion against the **live system**, not documentation — use the actual
  file contents, `pg_get_viewdef`, `information_schema`, EF source. Stale docs are not proof.
- If a check can't be confirmed from the repo (e.g. needs a DB query Ed must run), record it
  as **NEEDS-ED-VERIFY** with the exact query, rather than guessing.
- Stay inside the named pass. Note anything striking from another domain in a short
  "spillover" list at the end, but do not chase it.

**Output: one findings file per pass** at `audit/findings-pass-{A..E}.md`, each finding as:

```
[SEVERITY] short title
  Where:     path:line (and DB object if relevant)
  Invariant: which invariant below it breaks (ID)
  Evidence:  the actual code / value found
  Suggested: one-line fix direction + proposed ticket ID
```

**Severity**
- **CONTRADICTION** — build actively fights a locked strategic principle. Highest priority.
- **DRIFT** — build is internally inconsistent (same thing defined two ways, orphan values).
- **RISK** — known silent-failure pattern (auth, RLS, scoping) present or possible.
- **POLISH** — voice/brand/cosmetic; real but not launch-blocking.

Beyond the listed invariants, each pass should also flag any *other* contradiction with the
strategy docs it notices — the list is the floor, not the ceiling.

---

## Pass A — Drop lifecycle, timing & type

- **A1.** `opens_at` must create an announce→open gap, not open immediately on publish.
  The comms model treats the window between announce and ordering-open as "part of the
  product". *Known-suspect: drop-manager.html Timing pane defaults `opens_at` to immediate.*
- **A2.** `drop_type` must use one consistent value set across the picker, `create-drop`,
  and `update-drop`. *Known-suspect: picker writes `community` labelled "Hosted";
  `update-drop` validates a four-value set including an orphan `hosted` never written;
  `create-drop` validates nothing.*
- **A3.** The allowed host-type set must have a single source of truth. *Known-suspect:
  it lives in both the picker and a DB constraint with no link between them.*
- **A4.** `opens_at`/`closes_at` must re-derive coherently when the delivery date changes,
  not drift stale. *Relates to T5-B44.*
- **A5.** `audience_scope` ('public' | 'community') must be the explicit signal; `resolveOpenness`
  reads the explicit signal first and only derives on null. Confirm no surface re-derives
  openness while ignoring the stored value.
- **A6.** Status vocabulary (draft / scheduled / live / closed / complete) must be used
  consistently across DB, EFs, and UI — no surface inventing or mislabelling a state.

## Pass B — Capacity & honest scarcity

- **B1.** Scarcity is always real and capacity-based. No surface may manufacture urgency,
  fabricate "selling fast", or display a scarcity signal not backed by actual capacity state.
- **B2.** Capacity is declared in advance and respected absolutely; once reached, ordering
  closes. Confirm the close-on-full path exists and can't be bypassed.
- **B3.** Capacity is driven at category level (e.g. pizza = capacity driver, drinks = non-
  capacity). Confirm the model and checks reflect this, not a flat per-order count.
- **B4.** Capacity counts must derive from real order data, not a direct PostgREST count on an
  RLS-locked table (which silently returns 0). Confirm via in-memory state or a dedicated EF.
- **B5.** No-delivery-fee is structural. Confirm no surface presents delivery as a fee,
  discount, or promotional waiver.

## Pass C — Auth & data scoping

- **C1.** Every authenticated mutation goes via an Edge Function (service-role client,
  in-function `supabase.auth.getUser()` JWT verification). No mutation relies on PostgREST
  RLS-via-JWT, and no publishable-key path is depended on for auth.
- **C2.** EF pattern is `verify_jwt = false` at the gateway + in-function auth. Confirm no EF
  relies on gateway HS256 verification.
- **C3.** Vendor scoping on `orders` derives via `drop_id IN (vendor's drops)` — there is no
  `vendor_id` on `orders`. Flag any code assuming `orders.vendor_id`.
- **C4.** Host-view client must use `{ auth: { persistSession: false, autoRefreshToken: false } }`
  so it never inherits a vendor session. Confirm every host surface does this.
- **C5.** Activation `actor` must be carried through hydration and filtered (`actor !== 'host'`)
  so host-view events can't contaminate vendor card state.
- **C6.** Admin access must be data-driven (admins table) and support multiple admins
  including Robin — not a hardcoded UID. *Relates to T5-B26; confirm current state.*
- **C7.** Any direct read migrated to an EF must have its column references validated against
  `information_schema` — flag reads that may be silently broken.

## Pass D — Activation & communications surfaces

- **D1.** Reachability principle: each activation surface shows only actions whose owner can
  actually reach the audience. Flag any vendor-surface action that depends on reaching a
  host-owned audience, or vice versa.
- **D2.** Closed-drop outward activation belongs on the host surface, not the vendor surface
  (the §2 reframe). Confirm the split holds.
- **D3.** Host is an activator, not a distribution channel — host comms are templates in the
  host's own voice, copied/sent by the host, never auto-sent as a platform notification.
- **D4.** `activation-poster.html` must not read stale data. *Known-suspect: it reads
  `reveal_line`, which holds stale AI-generated hook text since that UI field was removed —
  decide the correct source.*
- **D5.** Where Hearth is acknowledged on customer-facing surfaces, it is subtle
  ("powered by Hearth") and never frames the experience over the vendor's identity.

## Pass E — Voice, vocabulary & brand

- **E1.** No banned word appears in any user-facing or vendor-facing string:
  *boost, convert, funnel, trending, campaign, promotion, deal, optimise, leverage, maximise.*
  Grep the codebase for each.
- **E2.** No marketplace / discovery / fake-urgency / aggregator language in UI copy
  (e.g. "popular near you", "limited-time offer", "selling fast", "listing").
- **E3.** Nav labels are current: **Brand** (not "Brand Hearth"), **Offer** (not "Menu Library").
  Flag any stale label.
- **E4.** Design tokens are consistent with the brand: primary `#8B6B3F`, `#CBB89D`,
  background `#FAF8F4`, text `#1F2937`; Cormorant Garamond (display) + Figtree (UI).
  Flag hardcoded off-palette colours or off-system fonts.
- **E5.** Tone is warm restraint, premium-not-luxury, UK spelling. Flag US spellings and
  hype/urgency phrasing in shipped copy.

---

## Known-suspect seeds (confirm and expand — do not assume true)

These are the drift items already on the radar. Each pass should confirm them against the
live code, correct any detail that's wrong, and find their siblings:
- `drop_type` multi-source drift (A2)
- host-type set duplicated picker + DB constraint (A3)
- `opens_at` defaults to immediate open (A1)
- `activation-poster.html` reads stale `reveal_line` (D4)
- admin hardcoded UID vs multi-admin (C6)

## Out of scope

- T4-29 series intelligence copy (data-gated; no real series history yet).
- New features or scope. This audit only finds contradictions; it builds nothing.
- The order/payment/fulfilment adversarial hardening (that's the separate #2 workstream —
  capacity *semantics* are in Pass B here, but race conditions and webhook failure modes
  belong to #2).
