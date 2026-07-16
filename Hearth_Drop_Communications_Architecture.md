# Hearth — Drop Communications Architecture

**Design brief · Version 1.0 · May 2026**
**Status:** Live canon — strategic reference informing T5-11, T5-C2, T5-C3, T5-C4.
This is a design brief, not a build specification. Build specifications live in BACKLOG.md; this document is the strategic rationale they draw from.

---

## 1. The strategic communication problem

Hearth's model depends on drops filling consistently. An underfilled drop damages vendor confidence, breaks habit formation, and produces weak data. A filled drop validates the model, builds the vendor's owned customer asset, and makes the next drop easier to fill.

Communication is the mechanism that converts a published drop into a filled one — and the primary instrument for making customers feel like **participants** in a local food moment rather than **users** of a delivery platform. That distinction is the strategic intent behind everything here.

---

## 2. The foundational insight: anticipation is part of the product

Research consistently shows consumers derive a large share of total product enjoyment from the anticipation phase — before they receive what they ordered. Every other delivery platform races to eliminate the wait. Hearth should architect it deliberately.

The window between "drop announced" and "order collected" is not dead time to be minimised — it is value to be designed around. Four implications:

1. **The menu should be visible before ordering opens.** The reveal is a moment in its own right.
2. **Real scarcity should be visible and honest.** A sold-out drop is social proof; low capacity creates legitimate urgency. Hearth's scarcity is always real — a competitive advantage.
3. **The wait between ordering and collection should be actively managed.** A warm, timely "your order is ready" makes the customer feel part of a professionally run operation.
4. **The drop has a narrative arc:** announced → building → open → closing → fulfilled → complete. Each stage is a legitimate communication moment.

---

## 3. Channel roles and hierarchy

Use each channel for what it does best; do not treat them as interchangeable.

**Social — broadcast, anticipation, social proof.** Ambient awareness; reaches people who aren't yet customers. Right for the menu reveal, capacity/sell-out signals, and post-drop content. Wrong for conversion and personal relationship-building.

**WhatsApp — activation, conversion, community.** ~98% open rate, most read within minutes. Two distinct dynamics:
- **Host WhatsApp** operates on *community authority* — a message from the club secretary or PTA coordinator is received as a trusted recommendation from within the community. Structurally impossible for Hearth to replicate directly.
- **Vendor WhatsApp** operates on *permission and expectation* — customers who ordered before and opted in expect to hear about drops. Every message must pass: "can I explain in one sentence why this specific person should get this specific message?"

**Email — owned relationship, nurture, compounding asset.** Belongs to the vendor and compounds over time. Right for early-access to previous customers, order confirmation, and the post-drop thank-you carrying the next drop date. The most durable commercial asset a vendor builds.

**SMS — universal, transactional, guaranteed delivery.** Not a marketing channel. The guarantee that the one message where non-delivery genuinely matters — "your order is ready" — always gets through.

---

## 4. The weekly rhythm (illustrative — a Friday drop)

| Day | Channel | Sender | Purpose |
|---|---|---|---|
| Monday | Social | Vendor | Menu reveal — anticipation |
| Tuesday | WhatsApp | Host | Community awareness |
| Thursday AM | Email | Platform | Early access for previous customers |
| Thursday 5pm | WhatsApp | Vendor | Ordering open — conversion |
| Thursday eve | WhatsApp | Host | Live link to community |
| Friday AM | Social | Vendor | Capacity / sold-out signal |
| Friday service | SMS | Platform | Order-ready notification |
| Friday eve | Social | Vendor | Post-drop moment, UGC prompt |
| Saturday AM | Email | Platform | Thank-you + next drop date |

Nine touchpoints, five days, three channels. None feel like marketing because each delivers genuine value at the right moment through the right voice.

**The insider mechanic:** previous customers hear about a drop 24 hours before the public link — the Thursday-morning early-access email. This rewards loyalty with priority, not discounts, and seeds early orders that create social proof. Over time, customers come to expect it — and that expectation is the habit.

**The highest-leverage message** is the Saturday-morning thank-you: the customer is at peak receptivity, and the next drop date in that email is the single most effective repeat-purchase mechanic available.

---

## 5. WhatsApp activation model

**Phase 1 — Business App broadcast lists (now).** Up to 256 contacts, messages from the vendor's own number, free, no API. Appropriate for the first 6–12 months. Requires recipients to save the vendor's number. Segment by the drop/location the customer came from: Broadstone customers hear about Broadstone drops.

**Phase 2 — Business API via Meta Embedded Signup (future).** When lists outgrow 256 or send-triggering needs automating. UK constraint: WhatsApp Coexistence is not yet available in the UK, so Phase 2 needs a dedicated number. Build only when there is genuine operational need, not as a technology ambition.

**Consent.** WhatsApp opt-in is captured separately from email opt-in, with clear expectation-setting: "Get WhatsApp updates about upcoming drops from [Vendor] near you."

---

## 6. Customer segmentation

Every customer is tagged at order with two data points: the drop they ordered from, and their outward postcode. From the drop reference the platform derives vendor, host, area, and drop type; from the postcode it groups geographically.

**The targeting rule:** for any drop, the most relevant customers are those who have ordered from the same vendor in the same or adjacent area. The platform surfaces the segment; the vendor owns the decision to send.

---

## 7. Habit formation

Habits form when the same contextual cues repeat consistently — same day, same time, same vendor. Every deviation weakens the loop. **Vendor cadence discipline is therefore a communication requirement, not merely operational.** It typically takes 8–10 consistent, high-quality drops before the habit embeds.

---

## 8. Key principles

- Use each channel for what it does best.
- The host is an **activator**, not a distribution channel — they send in their own voice, into channels they own. Hearth makes that effortless; it does not replace it.
- Anticipation is part of the product.
- Real scarcity is honest.
- Cadence builds the habit.
- Every drop should make the next one easier to fill.
- The owned customer asset compounds — every opted-in contact is more valuable than an aggregator equivalent, because Hearth returns the relationship to the vendor.

---

*This brief captures a strategic design session. It is a living reference, updated as the model is validated through real drops.*
