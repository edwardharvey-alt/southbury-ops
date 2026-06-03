# Hearth — Repetition Layer: Vendor-Facing Voice Spec

*Design reference, not a build spec.*

Canonical vendor-facing content and voice for the repetition layer — the
surfaces that teach and reinforce why consistent, repeated drops build a
customer habit. Authored once here; drawn down by:
- Onboarding activation plan — T5-C6
- Scorecard / early cadence coaching — T5-C5, T5-C7
- Drop Studio series nudge — T5-C5 mechanic 2

Surfaces stay distinct (coaching the vendor's behaviour is a different job
from showing analytical evidence). The voice is shared.

Out of scope, by decision: T4-29 (Series intelligence in Insights). Its
plain-English observations should one day speak in this voice, but the copy
is gated on real series data and held as a later, data-gated extension.

## Voice and rules
- Tone: calm, factual, warm. Confident through restraint, never hype.
- Facts come from data (drop number, fill vs capacity, returning-customer
  count, days between drops). Framing is fixed templates. Selection is
  deterministic. Nothing here is AI-generated — it sits outside the
  AI-approval requirement.
- Banned: boost, convert, funnel, trending, campaign, promotion, deal,
  optimise, leverage, maximise.
- Use: drop, capacity, rhythm, fill, your customers, the host's group,
  before ordering opens, the morning after.

## 1. Canonical overview — "The first ten drops"
Anchor piece. Full version lives at onboarding (before drop 1); lighter
slices are drawn from it at the surfaces below.

> **The first ten drops**
>
> A single drop is a good night. A run of drops is a customer base. The
> difference between the two is repetition — and it's worth understanding
> why before you start.
>
> **What activation actually is**
>
> Activating a drop isn't marketing in the usual sense. You're not chasing
> strangers or competing for attention. You're letting people who already
> value your food know it's available — at a specific time they can plan
> around. That's a quieter, more honest kind of reach, and it's the whole
> basis of how Hearth works.
>
> **Why repetition is the point**
>
> People build habits around things they can rely on. A drop that happens
> on the same day, at the same rhythm, becomes something customers can
> anticipate — and eventually plan their week around. That anticipation is
> most of the value. It's also fragile early on, because the pattern
> doesn't exist yet.
>
> In practice, it usually takes around eight to ten consistent drops before
> the habit takes hold. The first few may be quieter than you'd hope. That
> isn't the model failing — it's the pattern still forming. The vendors who
> hold their nerve through this period are the ones who build something
> durable.
>
> **What consistency means**
>
> Same day. Same rhythm. A drop you can sustain matters far more than an
> ambitious one you can't. Every time a drop moves or a week gets skipped,
> customers lose the thing they were planning around, and the habit starts
> again from scratch. Cadence isn't an operational preference — it's the
> mechanism that makes each drop easier to fill than the last.
>
> **What you're building**
>
> Every customer who orders through a drop is yours — a named, local person
> who has chosen your food and can be invited back. That list compounds.
> Each drop adds to it, and a larger, warmer list makes every future drop
> easier. Over time you're not running isolated events; you're growing
> something that belongs to you.
>
> **What we'll do**
>
> Hearth will show you what's working after each drop, help you keep your
> rhythm, and be honest about what's normal in the early weeks. We only grow
> when you do — so getting you through these first drops is the whole job.

## 2. Scorecard coaching variants
Architecture: a standing next-drop CTA on every scorecard ("Your next drop:
{day}. Keep the rhythm.") plus one situational coaching line above it that
changes by state. The variants interpret the result; they do not re-list the
numbers shown elsewhere on the screen. Slots ({n}, {repeat_count}, {day})
are filled from data.

1 · First drop complete (drop 1, any outcome)
> That's your first drop complete. Whatever the numbers, treat this as your
> starting point, not a verdict — habits form across a run of drops, never a
> single one. The most valuable thing you can do now is line up your next
> drop on the same day.

2 · Quiet early drop (drops 2–7, underfilled — the one that matters most)
> A quieter drop this time — and at this stage, that's normal. This is drop
> {n} of your first run, and the pattern customers plan around hasn't formed
> yet. It's the point where it's tempting to move the day or pause. Don't —
> holding your rhythm now is what makes the next drops fill.

3 · Building drop (drops 2–7, solid fill)
> A solid drop — the pattern's beginning to take. This is drop {n} of your
> first run, and every one adds known customers to a list that's yours to
> invite back. Keep your day steady; consistency is what turns these into
> something people plan around.

4 · Returning customers (repeat-customer count notable)
> {repeat_count} of tonight's orders came from people who've ordered before
> — that's the habit starting to form. This is what compounding looks like:
> each drop makes the next one easier to fill.

5 · Approaching the threshold (drops 8–10)
> You're on drop {n} — close to the point where a drop stops being an event
> and becomes part of how people eat their week. This is the stretch most
> vendors never reach. Keep the rhythm exactly as it is; you're almost
> through the hardest part.

6 · Habit embedded (past ~10 consistent drops)
> Ten consistent drops in — the habit's formed. From here the work changes:
> less about holding your nerve, more about looking after the customer base
> you've built and choosing where to grow next. This is the asset you came
> here to build.

7 · Cadence drift (recent drops on different days — different trigger type)
> Your last few drops have run on different days. It's worth knowing why
> this matters: customers build a habit around a reliable cue — same day,
> same rhythm. When the day moves, there's nothing to plan around, and the
> habit resets. Settling on one day you can sustain will do more for your
> fill rate than anything else.

8 · Filled completely (sold out / near-full)
> Tonight's drop filled completely — a real signal the rhythm's working.
> Resist the urge to chase it by stretching capacity; an honest, sustainable
> limit is part of what makes drops trustworthy. The most valuable move now
> is simply to run the next one, same day.

### Selection cascade (first match wins)
1. Drop 1 → state 1
2. Cadence has drifted → state 7
3. Drop > 10 and consistent → state 6
4. Drop 8–10 → state 5
5. Drops 2–7, by outcome: filled → 8; notable returning customers → 4;
   solid → 3; quiet → 2

### Two locked judgement calls
- Drift (state 7) sits second in the cascade — above even a strong result.
  In the fragile early window cadence is the highest-leverage thing to fix,
  and the observational tone reads as a useful nudge, not a telling-off.
- State 8 deliberately does not celebrate the way a marketplace would. A
  sellout is the moment a vendor is most tempted to inflate capacity and
  chase volume — the exact behaviour Hearth exists to avoid. It validates
  the rhythm and protects the honest limit in the same breath.

## 3. Placement
Author once; surface in the right moments, heavier at the start.
- Onboarding — the anchor (full overview). Inoculation before the first
  underfilled drop. Aligns with T5-C6's activation plan.
- Scorecard / early cadence coaching — the reinforcement. The eight variants
  above, drawn down per drop. (T5-C5 + T5-C7.)
- Activation surface — a light anchor only. One principle line plus a link
  to the full overview. Coordinate with T5-C4 territory.
- Reference / help page — storage for the full text.

## 4. Drop Studio series nudge (T5-C5 mechanic 2)
First question on drop creation is "recurring or one-off?", recurring
encouraged, one-off still available (nudge, don't force). Copy:

> Most vendors who build a customer habit start with a recurring series. A
> one-off is right for events — but your regular drops work best as something
> your customers can expect, same day, same rhythm.

The Drop Studio anticipation-window default (publish = announce; opens_at =
ordering live; the gap is the product) is specced separately as ticket
T-drop-anticipation-window-default in BACKLOG.md.
