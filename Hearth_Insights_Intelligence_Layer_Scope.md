# Hearth — Insights Intelligence Layer: Scope & Primitives

Design reference, not a build spec. Scopes build priority 2 (Insights).
Session output, July 2026. Draws on a capability review of Klaviyo.

---

## Why this note exists

Insights is not a reporting dashboard. It is a demand-visibility and cadence-coaching
engine — the mechanism that turns "how did my drop perform?" into "where and how should I
run the next one, and who should hear about it?" The intelligence-engine spine already
exists. This note fixes *which* intelligence the Insights surface should express, and anchors
it to concrete, proven signal shapes so the build has a floor rather than an open brief.

Klaviyo — the most mature customer-intelligence platform in the B2C space — is the reference
for the primitives, and **only** the primitives. Its predictive models (next order date,
lifetime value, churn risk, recency-frequency scoring) are the clearest working expression of
the intelligence Hearth wants. But its architecture, economics, and voice are wrong for Hearth
in every particular. We borrow the proven signal shapes and reject everything around them. This
note records both halves deliberately, because the line is easy to lose once a build starts.

---

## The one discipline that governs everything here

**Klaviyo's unit is the individual reorder. Hearth's unit is the drop.**

Klaviyo's whole engine is built to answer "when will *this person* buy again, and how do I
catch them just before they do?" That is individual replenishment nudging, and it is the exact
always-on gravity Hearth exists to escape. Every primitive below is re-expressed at the level
of the **drop, the series, the vendor, and the geography** — never as a message aimed at
pushing one named customer to reorder on cue.

The test for any Insights signal: *does it help the vendor decide where and when to run, or
does it push an individual to buy?* The first is demand visibility. The second is the
aggregator reflex wearing a calmer coat. Build only the first.

---

## Primitives to build toward (in Hearth's voice)

Four. Each is stated as: what Klaviyo does → what Hearth takes → where it surfaces.

### 1. Cadence rhythm — from Expected Date of Next Order

**Klaviyo:** predicts the individual date each customer will next purchase, and fires a
replenishment reminder a few days before.

**Hearth takes:** the *rhythm* idea, lifted to the series level. Not "nudge Sarah on Thursday"
but "your customers have settled into a Friday rhythm — the next drop wants to land there." The
signal is about the vendor's cadence health and the customer base's collective expectation, not
any one person's clock.

**Where it surfaces:** Scorecard cadence line and the standing next-drop prompt (already
specced in the Repetition Layer). Insights holds the fuller view — days-between-drops trend,
whether the rhythm is holding or drifting.

### 2. Demand density & recency — from Recency-Frequency-Monetary scoring

**Klaviyo:** scores each contact on how recently, how often, and how much they've bought, to
sort them into value tiers for targeting.

**Hearth takes:** the recency and frequency dimensions, aggregated by **geography and drop
origin** rather than by individual. The question Hearth answers is the one from the strategy
docs: "*where* does known demand already exist?" — customer count by outward postcode, weighted
by recency and repeat rate, read against the vendor's capacity. This is the engine behind
"expand into areas where demand already exists," not "launch and hope."

**Where it surfaces:** Insights Layer 2 (how Hearth is growing the business) — a plain-English
read of where the vendor's customers cluster and which areas are warm enough to consider. Feeds
the future host/area matching, but that is downstream.

### 3. Drift & dormancy signals — from churn risk

**Klaviyo:** predicts probability an individual won't buy again, and fires a discount-led
win-back.

**Hearth takes:** the *early-drift* instinct, pointed at two things, neither of which is an
individual win-back:
- **Vendor cadence drift** — recent drops on different days. Already Scorecard state 7. This is
  the highest-leverage signal in the early window and the one the engine most exists to protect.
- **Customer-base dormancy** — a cohort from a past drop or area that hasn't been invited back.
  Surfaced to the vendor as an observation ("customers from your Broadstone drops haven't had a
  drop to come back to"), never as an automated discount chase.

**Where it surfaces:** Scorecard (drift) and Insights (dormancy). No discounts, ever — an honest
limit and a reliable rhythm are the retention mechanic here, not price cuts.

### 4. Insider early access — from VIP early-access

**Klaviyo:** gives high-value customers early access to drops/sales as a loyalty mechanic.

**Hearth takes:** this one is already ours — the insider mechanic in the Comms Architecture
(previous customers get the drop 24 hours before the public link). Klaviyo simply confirms the
mechanic works. This note's only job is to fix that the **eligibility signal lives in the
intelligence layer** (who counts as a previous customer of this vendor, scoped correctly via
`drop_id IN (vendor's drops)`), and the **send belongs to the comms engine**. Insights owns
*who*; comms owns *when and how*.

---

## What we consciously reject

Recorded so the build cannot quietly drift into them:

- **Individual replenishment nudging.** No signal whose purpose is to push a named person to
  reorder on a predicted date.
- **Discount-led win-backs.** Retention is rhythm and honest scarcity, not price cuts.
- **Growth-marketing vocabulary.** boost, convert, funnel, campaign, promotion, deal, optimise,
  leverage, maximise — banned in every Insights string, as everywhere.
- **Per-contact economics.** Klaviyo taxes the vendor per relationship as the list grows. That
  is the exact per-relationship charge Hearth positions against; the intelligence layer is not a
  metered add-on.
- **Single-tenant architecture.** Klaviyo is one-brand-per-account. Hearth's compounding
  intelligence is cross-vendor by design — the value that would be Klaviyo's is Hearth's to
  build, not rent.
- **Fabricated signal.** See the honesty gate below.

---

## The honesty gate (brand-critical, not cosmetic)

Klaviyo's predictions only switch on above a real data threshold — roughly 500 customers, 180
days of history, three-plus orders each. Below that it says "not enough data yet."

At go-live Hearth has one vendor and no history. The intelligence layer must **degrade
gracefully and say so plainly** — "not enough data yet to read a pattern" — rather than
manufacture a signal to look useful. This is not a UX nicety. A fabricated demand or scarcity
signal *is* manufactured urgency, which is a brand violation, not a rough edge. Hearth's scarcity
is always real; its intelligence must be too. An honest empty state is on-brand. A confident
wrong one is not.

Design consequence: every Insights signal needs an explicit, in-voice empty state, and the
thresholds at which a signal becomes trustworthy should be conservative. Quiet and honest beats
early and hollow.

---

## How this maps to the Insights surface

Two layers, consistent with the existing frame:

- **Layer 1 — how did my drop perform?** Fill vs capacity, orders, returning-customer count.
  Factual, per-drop. This is the reinforcement layer feeding the Scorecard's coaching line.
- **Layer 2 — how is Hearth growing my business?** The compounding read: demand density by area,
  cadence health over time, the growing owned customer base. This is where "we don't just fill
  drops, we build the demand that fills the next one" becomes visible.

Both layers speak in plain-English observations, in the calm, factual, warm register of the
Repetition Layer voice spec — the engine interprets, it does not just tabulate.

Two vendor pathways to hold in mind:
- **Data-light vendor** (Healthy Habits at launch): Layer 2 is mostly honest empty states that
  fill in over the first drops. The value early on is Layer 1 plus cadence coaching.
- **Data-rich vendor** (a future restaurant with an existing list): Layer 2 can light up fast on
  imported history — the demand-density read is immediately useful.

---

## Scope boundaries

**In scope for the Insights build:** the four primitives above, expressed as signals plus
plain-English observations, each with an honest empty state.

**Out of scope / deferred:**
- **T4-29 (series intelligence in Insights)** — data-gated; no real series history yet. Its
  observations should one day speak in this voice, but the copy waits for genuine series data.
- **Comms triggering** — the comms engine owns *send*. Insights owns *who* and surfaces *when it
  might matter*; it does not dispatch.
- **Cross-vendor pattern intelligence** — real, and the long-term moat, but it needs volume
  Hearth does not have. Note it as horizon, build nothing yet.

---

## Positioning note (not a build item)

Klaviyo is best understood as **downstream-compatible, not a competitor**. Because Hearth returns
the customer relationship to the vendor, a data-rich vendor who already runs Klaviyo can pipe
their Hearth-earned, owned list *into* their own Klaviyo if they choose. That is not a threat to
the model — it is a demonstration of it. Worth holding as a line for vendor conversations
("the customers you build here are yours — including to take elsewhere"), not as anything to build.

---

## Relationship to existing backlog tickets

This note is a governing design reference, not a new build ticket. Its primitives already
have ticket homes:
- Demand density & recency (primitive 2) — scoped by T5-15 (Insights: demand and audience
  intelligence layer), fed by the completed T4-3.
- Cadence rhythm and drift (primitives 1 and 3) — scoped by the Scorecard tickets
  T5-C5 / T5-C7.
- Insider early access (primitive 4) — the existing insider mechanic, owned by the comms
  engine.

This note governs the voice, drop-granularity discipline, and honesty gate those tickets
build to. It defers T4-29 (series intelligence — data-gated). Customer-base dormancy
(primitive 3, second half) folds into T5-15 unless the T5-15 design pass shows it needs its
own ticket.
