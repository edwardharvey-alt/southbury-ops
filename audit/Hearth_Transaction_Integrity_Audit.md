# Hearth — Transaction Integrity Audit (Money & Capacity Path)

**Purpose.** Surface every place the order, payment, and capacity path can lose money, double-charge, oversell, or silently corrupt state under concurrency or failure. This is the adversarial hardening pass the Build Coherence Audit explicitly deferred (the "#2 workstream"). Where the coherence audit asked "does the build match the strategy," this asks "does the money path survive contention and failure."

It is read-only analysis — it produces findings, never edits. Confirmed findings become BACKLOG.md tickets and are fixed one at a time through the normal pipeline.

Status: v1 — for Ed's review before any pass is run.

## How a pass runs (protocol)

Each pass is a single Claude Code session, scoped to one of the two passes below. The prompt opens "Read CLAUDE.md first", then "Read audit/Hearth_Transaction_Integrity_Audit.md", then runs only the named pass. Evidence-first, no edits.

### Hard rules for every pass
- No file edits, no commits, no PRs. The only output is a findings file at audit/findings-{P1,P2}.md.
- Verify every assertion against the live system — actual EF source, migration SQL, information_schema, the real create-order and webhook handlers. Stale docs are not proof.
- Reason about the LIVE payment path even though the platform is currently in Stripe test mode. Flag anything that is safe in test but bites in live — test mode masks some race and config failures.
- If a check can't be confirmed from the repo (live webhook config, Stripe retry behaviour, live secrets, actual DB constraints), record it as NEEDS-ED-VERIFY with the exact Stripe-dashboard step or SQL query, rather than guessing.
- Stay inside the named pass. Note anything striking from the other pass in a short "spillover" list at the end, but do not chase it.

### Output — every finding carries a reproducible proof
Unlike the coherence audit, a finding here is not complete until it can be demonstrated. A race or a webhook failure cannot be seen by reading a deploy preview. So each finding records:

[SEVERITY] short title
 Where: path:line (and DB object / EF / Stripe surface if relevant)
 Invariant: which invariant below it breaks (ID)
 Evidence: the actual code / value / SQL found
 Proof: a concrete ordered sequence, curl/SQL script, or step list that demonstrates the failure — or, if it holds, the sequence that confirms it holds
 Suggested: one-line fix direction + proposed ticket ID

### Severity
- CRITICAL — money lost, customer double-charged, or capacity silently broken (oversell / phantom sellout). Highest priority.
- HIGH — state corruption recoverable only by manual intervention; failure with no alert.
- MEDIUM — degraded correctness under specific timing; edge-case only.
- NEEDS-ED-VERIFY — cannot be settled from the repo; exact check specified for Ed to run.

Beyond the listed invariants, each pass should flag any other money- or capacity-integrity failure it notices — the list is the floor, not the ceiling.

## Pass P1 — Capacity & concurrency integrity (the create-order path)

C1. Last-slot race. Two concurrent orders at the capacity boundary must not both succeed. Determine whether the capacity check is atomic with the order insert (single transaction with row lock / conditional insert / SELECT ... FOR UPDATE / atomic decrement), or a read-then-write with a window between check and insert. A gap is a CRITICAL oversell.

C2. Capacity source of truth. Counts must derive from real order data through the service-role path, never a direct PostgREST count on an RLS-locked table — that silently returns 0 (the auth-attach bug), which reads as unlimited capacity. Confirm exactly what the live create-order path reads to compute remaining capacity.

C3. Category-level driver. Capacity is enforced at the driving category level (e.g. pizza), not collapsed to a flat per-order count. Non-driving categories (e.g. drinks) must not consume capacity. Confirm the check reflects the category model, not a per-order or per-item flat count.

C4. Slot-holding semantics. Establish whether a slot is held at order creation or only on payment success — and confirm the choice is coherent and free of its failure mode. Held-at-creation risks abandoned checkouts locking capacity that never releases; held-at-payment risks two payers both passing the check before either clears. Whichever model is in place, confirm it is intentional and the corresponding failure is handled.

C5. Close-window race (new surface). create-order must reject orders once the drop is past closes_at or in closed/completed status — server-side, in the same guarded path, not only hidden in the UI. This interaction is new: the pg_cron live→closed→completed lifecycle engine did not exist when the Build Coherence Audit ran, so create-order's behaviour against a just-closed drop has never been examined. Check the race between the cron transition and an in-flight order.

## Pass P2 — Payment lifecycle integrity (Stripe)

P1. Webhook idempotency. Stripe delivers duplicate events on retry. The handler must not double-fulfil, double-decrement capacity, or double-send email on redelivery. Confirm event-ID deduplication (processed-events table or equivalent) exists and covers every side effect.

P2. Out-of-order / late events. A stale event arriving after newer state must not overwrite it. Confirm state transitions are guarded (status precedence / timestamp check), not blind last-write-wins.

P3. Webhook-before-order race. A payment-succeeded event can arrive before the order row is committed. Confirm this is handled (retry, buffer, or reconcile) rather than silently dropped.

P4. Money-taken-no-order. If payment succeeds but order creation fails, confirm the reconcile path (INTERNAL_RECONCILE_SECRET) actually detects and surfaces the orphaned payment. Confirm it runs on a schedule or trigger, not only manually.

P5. Amount integrity end-to-end. The amount sent to Stripe must equal the server-re-derived order total (never a client value), and the webhook must verify the paid amount against the order total before fulfilling. Confirm both ends.

P6. Signature verification. The webhook must verify the Stripe signature against the correct STRIPE_WEBHOOK_SECRET before trusting any event. Directly relevant to the T3-8 secret swap — confirm the verification exists and reads the secret from EF secrets, not a hardcoded or stale value.

P7. Refund / cancellation to capacity release. A refunded or cancelled order must free its slot cleanly, with no phantom consumption and no double-release. Confirm the path exists and is idempotent.

P8. Connect / fee correctness. The destination charge / application fee (Hearth's 10%) must be correct, handled correctly on refund, and rounded correctly. Confirm the 10% and any discount-tier maths round to whole pence server-side and reconcile with what Stripe records.

## Known-suspect seeds (confirm and expand — do not assume true)
These are items already on the radar. Each pass should confirm them against the live code, correct any detail that's wrong, and find their siblings:
- Capacity check may be read-then-write rather than atomic (C1).
- Direct PostgREST counts silently return 0 under the auth-attach bug (C2).
- create-order vs pg_cron close transition is an unexamined interaction (C5).
- Webhook idempotency / dedupe presence unconfirmed (P1).
- Reconcile path exists (INTERNAL_RECONCILE_SECRET) but its coverage and trigger cadence are unconfirmed (P4).

## Out of scope
- Everything the Build Coherence Audit already covered (lifecycle coherence, capacity semantics, auth architecture, activation surfaces, voice) — that pass is complete; this one assumes its findings.
- New features or scope. This audit only finds integrity failures; it builds nothing.
- Non-payment email/comms reliability beyond the double-send check in P1.
- Frontend/mobile polish.
