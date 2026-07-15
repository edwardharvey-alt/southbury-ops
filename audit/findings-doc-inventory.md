# Findings — Documentation Inventory (read-only audit)

**Purpose.** Inventory every documentation and strategy artefact in the repo to establish a clean documentation canon. Reports what exists, where, and whether anything already conflicts. Read-only — no files moved, edited, or created except this findings file.

**Repo state at audit time.** `git reset --hard origin/main` → `f0401db` ("fix: derive drop capacity from live holds in units, drop legacy pizzas (#467)").

**Method.** Searched the whole tree (excluding `node_modules`, `.git`, `.claude/worktrees`) for `.md`, `.pdf`, `.txt`, `.doc*`, `.rtf` files and any `docs/`/`documentation/` directory. Last-modified taken from `git log -1 --format=%ai`; files not in git are marked **UNTRACKED** (git has no date for them).

**Note on tracked vs untracked.** A large fraction of `audit/` and `docs/support/` is untracked working notes present on disk but never committed. They are inventoried here because the brief said "search the whole tree," but their canon status is weaker than tracked files — they can vanish on any clean checkout.

---

## 1. Full file list (path · size · git last-modified)

### Root
| Path | Size | Last-modified (git) |
|---|---|---|
| `CLAUDE.md` | 183,511 B | 2026-07-14 23:03 |
| `BACKLOG.md` | 391,859 B | 2026-07-14 23:03 |
| `SCHEMA.md` | 29,373 B | 2026-07-04 13:43 |
| `README.md` | 15 B | 2026-02-25 21:21 |
| `Hearth_Insights_Intelligence_Layer_Scope.md` | 10,344 B | 2026-07-06 17:44 |
| `Hearth_Repetition_Layer_Voice_Spec.md` | 8,597 B | 2026-06-03 18:26 |
| `PR-4B-AUDIT.md` | 148,602 B | 2026-04-29 19:23 |
| `PR-4B-BUILD.md` | 29,698 B | 2026-04-29 22:10 |
| `PR-RLS-FIXES-AUDIT.md` | 54,793 B | 2026-04-30 22:07 |
| `pr4-audit-partial.md.txt` | 33,484 B | **UNTRACKED** |

### `docs/`
| Path | Size | Last-modified (git) |
|---|---|---|
| `docs/features/product-options.md` | 8,731 B | 2026-07-04 23:52 |
| `docs/support/activation-ideas-runbook.md` | 25,924 B | **UNTRACKED** |
| `docs/support/activation-outputs-first-three-vendors.md` | 7,311 B | **UNTRACKED** |

### `schema-snapshot/`
| Path | Size | Last-modified (git) |
|---|---|---|
| `schema-snapshot/README.md` | 5,382 B | **UNTRACKED** |

### `audit/`
| Path | Size | Last-modified (git) |
|---|---|---|
| `audit/Hearth_Build_Coherence_Audit.md` | 8,618 B | 2026-06-25 18:30 |
| `audit/Hearth_Transaction_Integrity_Audit.md` | 7,954 B | 2026-07-09 00:05 |
| `audit/T5-A3-reads-audit-2026-05-17.md` | 45,514 B | 2026-06-29 22:43 |
| `audit/T5-A3-view-reads-2026-05-17.md` | 6,127 B | 2026-06-29 22:43 |
| `audit/T5-A14-v_drop_summary-reads-2026-05-19.md` | 19,149 B | 2026-06-29 22:43 |
| `audit/order-pipeline-reads-2026-05-19.md` | 22,155 B | 2026-05-19 18:14 |
| `audit/findings-P1.md` | 27,136 B | 2026-07-09 19:58 |
| `audit/findings-backlog-reconciliation.md` | 41,758 B | 2026-07-14 15:20 |
| `audit/findings-activation-mobile-width-sweep.md` | 10,576 B | 2026-06-22 19:06 |
| `audit/findings-artwork-inline-width.md` | 11,798 B | 2026-06-22 19:06 |
| `audit/findings-catering-confirm-send.md` | 6,284 B | 2026-07-05 22:16 |
| `audit/customer-import-investigation-2026-05-15.md` | 44,586 B | **UNTRACKED** |
| `audit/reconciliation-audit-2026-06-27.md` | 5,771 B | **UNTRACKED** |
| `audit/readback.txt` | 2,616 B | **UNTRACKED** |
| `audit/findings-activation-card-alignment.md` | 15,157 B | **UNTRACKED** |
| `audit/findings-activation-rename.md` | 10,428 B | **UNTRACKED** |
| `audit/findings-capacity-abandoned-checkout.md` | 13,411 B | **UNTRACKED** |
| `audit/findings-card-scrim-consistency.md` | 10,104 B | **UNTRACKED** |
| `audit/findings-card4-send-wiring.md` | 12,505 B | **UNTRACKED** |
| `audit/findings-catering-commercial-core.md` | 11,339 B | **UNTRACKED** |
| `audit/findings-catering-convert.md` | 11,274 B | **UNTRACKED** |
| `audit/findings-comms-finish-scope.md` | 11,128 B | **UNTRACKED** |
| `audit/findings-comms-log-shape.md` | 14,510 B | **UNTRACKED** |
| `audit/findings-dropstudio-fulfilment.md` | 10,054 B | **UNTRACKED** |
| `audit/findings-enquiries-comms-architecture.md` | 14,545 B | **UNTRACKED** |
| `audit/findings-holds-capacity.md` | 14,288 B | **UNTRACKED** |
| `audit/findings-hosted-lifecycle.md` | 12,691 B | **UNTRACKED** |
| `audit/findings-menu-options.md` | 16,467 B | **UNTRACKED** |
| `audit/findings-option-display.md` | 14,408 B | **UNTRACKED** |
| `audit/findings-order-flow.md` | 18,857 B | **UNTRACKED** |
| `audit/findings-order-fulfilment.md` | 10,512 B | **UNTRACKED** |
| `audit/findings-product-options-stage2.md` | 19,669 B | **UNTRACKED** |
| `audit/findings-product-options.md` | 20,956 B | **UNTRACKED** |
| `audit/findings-reconcile-prep.md` | 13,343 B | **UNTRACKED** |
| `audit/findings-timing-orderwindow-init.md` | 12,223 B | **UNTRACKED** |

**Totals.** 50 files. Tracked: 25. Untracked (on disk only): 25. No `.pdf`, `.doc`, `.docx`, or `.rtf` files exist anywhere in the tree. Only one `docs/`-style directory exists (`docs/`); no `documentation/` directory.

---

## 2. Strategy / reference shortlist (title / first heading)

Files whose name or first lines touch strategy, brand, playbook, positioning, commercial model, backlog, vision, handover, or spec:

| File | First heading / self-description |
|---|---|
| `CLAUDE.md` | *(project instructions — no top title; contains "Strategic principles", "Brand and tone", "Development backlog", "Future architecture" sections — see §3)* |
| `BACKLOG.md` | `# Hearth — Development Backlog` — plus an embedded `## Hearth AI Strategy` section (line 1710) with a `### Why AI is central to Hearth's competitive position` subsection |
| `Hearth_Insights_Intelligence_Layer_Scope.md` | `# Hearth — Insights Intelligence Layer: Scope & Primitives` — self-labelled *"Design reference, not a build spec. Scopes build priority 2 (Insights). Session output, July 2026. Draws on a capability review of Klaviyo."* Contains `## Positioning note (not a build item)` and `## The honesty gate`. |
| `Hearth_Repetition_Layer_Voice_Spec.md` | `# Hearth — Repetition Layer: Vendor-Facing Voice Spec` — self-labelled *"Design reference, not a build spec."* *"Canonical vendor-facing content and voice for the repetition layer."* Contains `## 1. Canonical overview — "The first ten drops"`. |
| `audit/Hearth_Build_Coherence_Audit.md` | `# Hearth — Build Coherence Audit` — *"Surface every place the build contradicts **the locked strategy**, or contradicts itself. This is the pre-launch de-risking pass… read-only."* |
| `audit/Hearth_Transaction_Integrity_Audit.md` | `# Hearth — Transaction Integrity Audit (Money & Capacity Path)` — adversarial hardening pass; read-only, findings → BACKLOG.md tickets. |
| `docs/features/product-options.md` | `# Hearth — Product Options (Menu Modifiers)` — post-ship feature reference. |
| `docs/support/activation-ideas-runbook.md` | `# Hearth — Vendor Activation Ideas: Manual Onboarding Runbook` — precursor to T5-C6; references *"Hearth's locked strategy."* |
| `docs/support/activation-outputs-first-three-vendors.md` | `# Activation outputs — first three vendors (draft for evaluation)` |
| `SCHEMA.md` | `# Hearth — Database Schema` — reference for the Postgres DB; documented-stale (per CLAUDE.md learnings #54/#57). |
| `schema-snapshot/README.md` | `# schema-snapshot/` — *"Live-DB ground-truth exports… **These files are the source of truth.** ../SCHEMA.md is rendered…"* (untracked). |
| `PR-4B-AUDIT.md` / `PR-4B-BUILD.md` | `# PR 4b — Audit` / `# PR 4b — Build Session Log` — dated 2026-04-29 session logs. |
| `PR-RLS-FIXES-AUDIT.md` | `# ⚠️ ARCHIVED — DIAGNOSIS WAS INCORRECT — DO NOT IMPLEMENT` (see §4). |
| `pr4-audit-partial.md.txt` | *(no heading — begins "I've read CLAUDE.md…"; a raw pasted session transcript, untracked)* |

**External reference not in repo:** several docs cite an external **"brand playbook"** as the naming/vocabulary authority (e.g. `audit/Hearth_Build_Coherence_Audit.md:124`, CLAUDE.md learning #85 says "the external brand playbook still names `#8B6B3F` primary and needs updating"). This playbook is authoritative-by-reference but **does not exist as a file in the repo.** Likewise a "Drop Communications Architecture (T5-C1 output)" is cited as locked strategy in `BACKLOG.md:3019` but has no corresponding document in the tree.

---

## 3. State of the two canon-critical files

### CLAUDE.md
- **Open-ticket index: YES.** The `## Development backlog` section (line 2141) is an explicit one-line index of *currently open tickets only*, organised by Tier (Tier 2 → Tier 9 plus "Support & operations"). Its own preamble states: *"Open tickets are tracked in `BACKLOG.md`… The list below is a one-line index of currently open tickets only — not started, partial, or in progress. When a ticket closes, mark it ✓ COMPLETE in BACKLOG.md and remove its line from this index."* Roughly **159** `- T…` index lines / **131** `— open` markers in that section.
- **Documentation-canon section: NO.** There is no section that enumerates the documentation set or declares a canon. The word "canon" appears only in the sense of "canonical pattern / canonical accent / canonical space" — never "documentation canon."
- **Rule about which document wins on conflict: NO explicit rule.** No "wins on conflict" / "source of truth precedence" statement exists. The closest implicit signals:
  - CLAUDE.md is *"loaded into every Claude Code session as standing context"* (stated in BACKLOG.md's preamble), making it the de-facto operative canon.
  - Critical rule #4: *"NEVER patch — always understand the full context before making changes."*
  - `schema-snapshot/README.md` unilaterally claims *"These files are the source of truth"* over `SCHEMA.md` — a precedence claim, but living in an untracked file, not in CLAUDE.md.
  - BACKLOG.md preamble: *"git log and the code are authoritative for the current state. Treat the narratives here as supplementary context, not source of truth."*
- **Embedded strategy inside CLAUDE.md:** `## Strategic principles (updated May 2026)` (positioning, commercial alignment, demand-side, key locked phrases) and `## Brand and tone` (locked vocabulary, banned words). These duplicate/parallel strategy that also lives in BACKLOG.md's `## Hearth AI Strategy` and in the two `Hearth_*` root specs — see §5.

### BACKLOG.md
- **Exists: YES.** `# Hearth — Development Backlog`, 391,859 B.
- **Structure:** One `## Development backlog` container, subdivided into `### Tier 1` … `### Tier 9` plus `### Support & operations` and `### Build Coherence Audit — Pass E`. Also contains a second top-level `## Hearth AI Strategy` section (line 1710) — a strategy narrative embedded in the backlog file, not a ticket list.
- **Open vs complete (rough):** **~144** `✓ COMPLETE`/`✓ DONE` markers; **7** `SUPERSEDED`/`RETIRED` markers. Open tickets are better counted from the CLAUDE.md index (~131 open lines) — BACKLOG.md's own `— open` string count (8) undercounts because completed and open entries share heading formats. Net: BACKLOG.md is overwhelmingly a **historical record of shipped work** (~144 complete) with the live open set mirrored in CLAUDE.md.
- Self-describes its relationship to CLAUDE.md (preamble quoted in §3 above): CLAUDE.md holds the open index; BACKLOG.md holds full specs + history; **code + git log are authoritative over both.**

---

## 4. Archive convention

- **No dedicated archive directory.** No `docs/archive/`, `archive/`, or `deprecated/` directory exists anywhere in the tree. The only doc-bearing directories are `docs/`, `audit/`, and `schema-snapshot/`.
- **Ad-hoc in-header archiving IS used** — three distinct markers, applied inline in file/section headers:
  - `PR-RLS-FIXES-AUDIT.md` — full-file banner: `> # ⚠️ ARCHIVED — DIAGNOSIS WAS INCORRECT — DO NOT IMPLEMENT` … *"preserved for historical reference only. Its core diagnosis is wrong and its proposed fixes have been rolled back."*
  - `audit/T5-A3-reads-audit-2026-05-17.md`, `audit/T5-A3-view-reads-2026-05-17.md`, `audit/T5-A14-v_drop_summary-reads-2026-05-19.md` — each opens with `> **SUPERSEDED — 2026-06-29.** …`
  - BACKLOG.md uses inline status tokens throughout: `✓ COMPLETE / ✓ PARTIAL / SUPERSEDED / RETIRED / RESOLVED / CLOSED`.
- **Convention is header-based, not directory-based, and applied inconsistently** — three different phrasings ("ARCHIVED", "SUPERSEDED", "DO NOT IMPLEMENT"), no standard template, and stale-but-live files (`SCHEMA.md`, `PR-4B-*`) carry no such marker despite being superseded in practice.

---

## 5. Conflict / multiple-authority flags

Listed, not resolved. These are the files/sections a reader (or a Claude session) could each reasonably treat as "the current plan":

1. **Strategy is spread across four+ surfaces with no declared precedence:**
   - CLAUDE.md `## Strategic principles (updated May 2026)` + `## Brand and tone` (locked phrases, positioning, commercial alignment).
   - BACKLOG.md `## Hearth AI Strategy` (line 1710) — a separate strategy narrative.
   - `Hearth_Insights_Intelligence_Layer_Scope.md` — Insights-layer scope + positioning notes.
   - `Hearth_Repetition_Layer_Voice_Spec.md` — "canonical" vendor-facing voice.
   - An external **brand playbook** (not in repo) cited as the vocabulary authority.
   No document says which of these wins if they disagree. Two already carry the disclaimer "Design reference, not a build spec," but nothing states what *is* the build spec.

2. **Backlog authority split (CLAUDE.md vs BACKLOG.md).** The open-ticket set lives in *both* — CLAUDE.md's index and BACKLOG.md's tier bodies. They are kept in sync by manual convention ("remove its line from the index when you close it"). Any drift between them is a live risk; `audit/findings-backlog-reconciliation.md` (dated 2026-07-14, tracked) exists precisely to reconcile them — evidence the two have drifted before.

3. **Schema authority triple.** `SCHEMA.md` (tracked, documented-stale), `schema-snapshot/README.md` + its exports (untracked, self-declared "source of truth"), and "git log + the code" (declared authoritative by BACKLOG.md's preamble) all claim or imply schema authority. The self-declared source of truth is **untracked**.

4. **Locked-strategy references with no anchor document.** Multiple files assert conflicts against "the locked strategy" / "the locked brand vocabulary" / "Drop Communications Architecture (T5-C1 output)" (`BACKLOG.md:3019`, `audit/Hearth_Build_Coherence_Audit.md:3,124`), but no single file in the repo *is* "the locked strategy." The authority is referenced but not located.

5. **Stale session logs presenting as audits.** `PR-4B-AUDIT.md`, `PR-4B-BUILD.md` (both 2026-04-29) and `pr4-audit-partial.md.txt` (untracked raw transcript) sit at repo root alongside live canon files with no archive marker — a reader could mistake them for current guidance. `PR-RLS-FIXES-AUDIT.md` is the only one of the PR-era root docs explicitly marked archived/wrong.

6. **25 untracked working-note documents** in `audit/` and `docs/support/` are on disk and readable but never committed. They present as findings/reference but have no canon standing and are invisible to anyone on a clean checkout — an authority ambiguity between "what's on this machine" and "what's in the repo."

---

*End of inventory. No conclusions drawn about what should change — this reports current state only.*
