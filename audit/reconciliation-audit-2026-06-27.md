# Reconciliation audit — 2026-06-27

Read-only. No edits, commits, or PRs made. Five checks run exactly as
specified; actual command output recorded verbatim; PASS/FAIL stated
against the expectation.

---

## Check 1 — operator-read-auth EFs exist on disk

**Command:**
```
ls supabase/functions/ | grep -E 'get-drop|get-home-dashboard|get-insights|get-customers-workspace|get-vendor-customer-count|get-demand-preview'
```

**Actual output:**
```
get-customers-workspace
get-demand-preview
get-drop
get-drop-comms
get-drop-host-token
get-drop-signals
get-home-dashboard
get-insights
get-vendor-customer-count
```

**Result: PASS.** All six expected EFs are present:

| EF | Present? |
| --- | --- |
| get-drop | ✓ |
| get-home-dashboard | ✓ |
| get-insights | ✓ |
| get-customers-workspace | ✓ |
| get-vendor-customer-count | ✓ |
| get-demand-preview | ✓ |

(Three additional `get-drop-*` functions — `get-drop-comms`,
`get-drop-host-token`, `get-drop-signals` — also matched the `get-drop`
substring. They are not part of the six and are noted only for
completeness; not a finding.)

---

## Check 2 — no direct anon reads of the revoked views on the slice pages

**Command:**
```
grep -nE "from\(['\"]v_drop_summary|from\(['\"]drop_capacity|from\(['\"]v_hearth_drop_stats|from\(['\"]v_item_sales|from\(['\"]v_host_performance|from\(['\"]v_hearth_revenue_over_time" home.html scorecard.html insights.html customers.html hosts.html host-profile.html drop-manager.html service-board.html
```

**Actual output:** (no matches; grep exit status 1)

**Result: PASS.** Zero direct anon reads of any of the six revoked /
RLS-sensitive views remain across all eight slice pages. Reads route via
`functions.invoke` as expected.

---

## Check 3 — T5-B30 / T5-B31 ticket bodies in BACKLOG.md

**Command:**
```
grep -nE '^T5-B30|^T5-B31|^### T5-B30|^### T5-B31' BACKLOG.md
```

**Actual output:** (no matches; grep exit status 1)

**Result: FAIL (against the expectation of dedicated bodies existing).**

| Ticket | Dedicated body in BACKLOG.md? |
| --- | --- |
| T5-B30 | ABSENT |
| T5-B31 | ABSENT |

Neither ticket has a dedicated body section in BACKLOG.md. Both exist
only as CLAUDE.md index lines. This is consistent with the still-open
ticket **T5-B33** ("Restore missing T5-B29 / T5-B30 / T5-B31 ticket
bodies in BACKLOG.md") — the restoration has not been done for B30/B31.
(B29 now has a body / index entry; B30 and B31 remain unrestored.)

---

## Check 4 — T5-C2 stale pre-launch tag

**Command:**
```
grep -n 'Should land before Healthy Habits' BACKLOG.md
```

**Actual output:**
```
1986:**Status:** Open. Tier 5. Should land before Healthy Habits Cafe's
```

**Result: PASS (located).** Stale status string is at **BACKLOG.md:1986**,
within the **T5-C2** ticket body ("WhatsApp activation system"). Full line
in context:

```
**Status:** Open. Tier 5. Should land before Healthy Habits Cafe's
first drop — the template system and phone number capture with WhatsApp
consent are required before vendors can execute the communications
architecture described in Hearth_Drop_Communications_Architecture.md.
```

This is the exact line to edit later. (No edit made.)

---

## Check 5 — T2-1 / T4-22 nav state sanity

**Command:**
```
grep -rn 'renderNav' --include=*.html . | wc -l
```
(Note: the unquoted `--include=*.html` is glob-expanded by zsh and
returns 0 / "no matches found". Re-run with the glob quoted —
`--include='*.html'` — gives the real result, recorded below.)

**Actual output (quoted glob):**
```
14
```

**renderNav call sites (all are `HearthNav.renderNav`):**
```
activation.html:1441
brand-hearth.html:783
customer-import.html:886
customers.html:587
drop-manager.html:1091
drop-menu.html:496
home.html:875
host-profile.html:514
hosts.html:389
insights.html:674
onboarding.html:842
scorecard.html:478
service-board.html:768
why-hearth.html:435
```

**Result: PASS.** Every operator page builds its nav via
`HearthNav.renderNav('operatorNav', …)`. All 13 standard operator pages
are present:

service-board, drop-manager, drop-menu, brand-hearth, insights,
customers, customer-import, onboarding, home, scorecard, hosts,
host-profile, activation.

No operator page is missing the call. (`why-hearth.html` also calls it,
targeting `'whNav'` rather than `'operatorNav'` — a marketing page, not a
finding.) Admin surfaces — `admin.html`, `platform-admin.html`,
`platform-admin-vendor.html` — correctly do **not** call `renderNav`
(URL-only, not linked from operator nav). Customer/host-facing pages
(`order.html`, `order-confirmation.html`, `host-view.html`,
`host-poster.html`) likewise do not, by design.

This confirms T4-22's nav sweep holds, so T2-1 is safely subsumed.

---

## Summary

| Check | Expectation | Result |
| --- | --- | --- |
| 1. operator-read-auth EFs on disk | all six present | PASS |
| 2. no anon reads of revoked views | zero matches | PASS |
| 3. T5-B30/B31 ticket bodies | bodies exist | FAIL — both ABSENT (matches open T5-B33) |
| 4. T5-C2 stale tag located | line found | PASS — BACKLOG.md:1986 |
| 5. operator nav via renderNav | every operator page | PASS |

---

## Spillover (observations outside the five checks — recorded, not acted on)

- The unquoted `--include=*.html` form in Check 5's specified command
  silently returns 0 under zsh (glob expansion). Anyone re-running the
  audit should quote the glob.
- Check 3's FAIL is already tracked: **T5-B33** is the open ticket
  covering restoration of the T5-B30 / T5-B31 bodies. No new ticket
  needed.
- Check 1's `get-drop` pattern incidentally surfaced three sibling EFs
  (`get-drop-comms`, `get-drop-host-token`, `get-drop-signals`) not in
  the audited set — noted only so the count isn't mistaken for six.
