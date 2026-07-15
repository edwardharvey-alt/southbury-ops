# Findings — Catering commercial core: does the customer journey work end-to-end on a *converted* catering drop? (read-only audit)

Date: 2026-07-05 · Read-only · No edits, no commit, no build.

## Verdict

The Variant-A single-payer journey **works end-to-end for a converted catering drop — with one real gap and one naming-model correction.**

- **Correction (the premise's field names don't exist):** `discount_pct`, `capacity_suppressed`, and `catering_mode` **do not exist** on `drops` (or anywhere). What shipped (T3-13b) is `drops.discount_tiers` (jsonb, subtotal-threshold tiers), `drops.expected_guests` (int), and *behavioural* capacity suppression keyed on `drop_type='event'`. There is no `drop_type='catering'` and no `catering_mode` — catering **is** an event drop. So there is **no `drop_type='catering'` drift to miss**: everything keys on `'event'`, and the convert EF sets `drop_type:'event'` correctly, so all event behaviour engages.
- **The one real gap (Q2 + Q6):** the convert EF **does not seed `discount_tiers`**, and **nothing in the publish gate requires or prompts a discount**. A vendor can publish a converted catering drop and send the client an order link with **no bulk discount set** — the client then pays full list price. The menu *is* enforced at publish; the agreed discount is *not*. This is the commercial risk the audit was looking for.

Everything else the customer needs (quantities per dish, suppressed capacity bar, a **visible** subtotal→discount→total deduction before payment, single server-re-derived charge) is present and correct.

---

## Q1 — Which commercial fields actually exist on `drops`?

Grep for `discount_pct|capacity_suppressed|catering_mode|single_payer` across `*.sql *.ts *.html` returns **zero hits**. Those fields do not exist.

What exists (SCHEMA.md:282–284, "Event / catering"):
- **`expected_guests`** (integer, nullable) — planning-only; not part of readiness.
- **`discount_tiers`** (jsonb, nullable) — the bulk-discount mechanism. Each tier is `{ threshold_pence, discount_type: 'percentage'|'amount', discount_value }` (shape confirmed in `create-order/index.ts:113–140` and `order.html:2296–2314`). Matched on **basket subtotal**, not on guest count or quantity.
- **Capacity "suppression" is not a column** — it's behaviour gated on `drop_type==='event'`:
  - Customer capacity chip hidden: `order.html:2852–2854`.
  - Readiness capacity check bypassed: `drop-manager.html:2475–2478` (`capacityValid = drop_type==='event' ? true : …`) and server `transition-drop-status/index.ts:85` (`if (drop.drop_type !== 'event')`).
  - `create-order` skips capacity reservation for events (T3-13b; the event branch comment at `create-order/index.ts:668`).

**Settable by:** `discount_tiers` + `expected_guests` are written by Drop Studio's Commercials/Basics steps via `update-drop` (`drop-manager.html:4519–4520`, `4573–4574`) and read back in `populateForm` (`:3688–3691`). `create-drop` and `update-drop` carry both in their `ALLOWED_FIELDS` (per T3-13b closure + SCHEMA.md).

---

## Q2 — Does `convert-catering-enquiry` produce a drop that carries these?

**No — it seeds none of the commercial fields.** The insert (`convert-catering-enquiry/index.ts:166–190`) sets exactly:

```
vendor_id, name, slug,
drop_type: "event",              // :170
audience_scope: "direct",        // :177
fulfilment_mode  (if collection|delivery)   // :181–183
expected_guests  (if guest_count present)   // :184
delivery_start / delivery_end  (placeholder 12:00–14:00 on event_date)  // :185–190
```

- **`discount_tiers`: NOT set** → the converted drop has **no bulk discount**. The vendor must add it in Drop Studio, and nothing forces them to (see Q6).
- **`capacity_suppressed`: n/a** — suppression is automatic because `drop_type='event'` is set. ✅ works by construction.
- **`catering_mode`: n/a** — doesn't exist; single-payer is just how an event drop behaves.

So: capacity suppression and the guest count carry over automatically, but **the agreed discount does not exist on a converted drop until the vendor manually creates it.** ⚠️ **FLAG.**

---

## Q3 — The vendor's build surface (converted event+direct drop) in Drop Studio

**(a) Menu — YES, works.** The Menu step and its `assign-menu-items` write path are **not gated by `drop_type`**. The converted drop is created with no menu items; the vendor loads it (via `get-drop`) and assigns catalogue products/bundles (with per-item `price_override_pence` available) exactly as for any drop. No catering-specific curation surface exists, but the generic menu builder covers "dishes + per-item prices".

**(b) Discount (`discount_tiers`) — YES, available and NOT gated to a dead type.** `#discountTiersSection` (`drop-manager.html:1702`) has **no `hidden` class** and is **not toggled by `isEvent`** in `renderConditionalFields()` (`:4014–4047` toggles only `capacitySection`/`expectedGuestsSection`, never the discount section). So the bulk-discount tier editor is visible/usable on the converted event drop (in fact on all drop types — it is never gated to a `drop_type='catering'` that no longer exists). `renderDiscountTiers()` paints from `state.discountTiers` (`:4104`), validated/saved via `:4157–4188` → `update-drop`. ✅ The vendor *can* set the agreed discount — the problem (Q6) is only that they are not required or prompted to.

**(c) Timing/publish — works (noted only).** Publish gate requires name/slug/drop_type/fulfilment_mode + timing; capacity checks bypassed for events (`transition-drop-status/index.ts:76–118`, `:85`). The convert EF's placeholder timing (`:185–190`) is a draft the operator confirms before publishing.

---

## Q4 — The customer order page (converted catering drop)

**(a) Agreed menu + quantities per dish — YES.** The menu renders from the drop's assigned items; each product shows a `−/count/+` stepper (`order.html:3258–3265` compact, `3280–3287` large). The `+` button's `disabled` state is `item.is_sold_out || isDropClosed()` (`:3255`, `:3273`) — **not** capacity-gated — so on an event drop quantities are **not** wrongly capped by capacity. Client picks any quantity per dish. ✅

**(b) Public capacity bar suppressed — YES.** For `drop_type==='event'` the hero capacity chip is hidden and blanked (`order.html:2852–2854`). ✅

**(c) Discount rendered as a VISIBLE deduction before payment — YES.** The basket totals block is subtotal → discount → total (`order.html:1811–1820`): `#basketSubtotal`, a `#basketDiscountLine` labelled **"Volume discount"** showing `−£x.xx`, then the grand total. `renderBasketSheet()` computes `getDiscountPence()` and unhides the line when `> 0` (`:3531–3540`). `calculateDiscountPence()` (`:2292–2314`) matches the highest tier whose `threshold_pence ≤ subtotal` and applies percentage or amount. **The customer sees the deduction in-page before paying — it is not a hidden Stripe coupon.** (The Stripe coupon in create-order is a *parallel* receipt-side mechanism that preserves line-item itemisation per learning #44; the in-page line is the customer-facing deduction.) ✅

**(d) Server re-derives the discounted total and charges once — YES.** `create-order` recomputes the subtotal from DB prices, then `findMatchingTier(computedSubtotal, dropAreaRow.discount_tiers)` (`create-order/index.ts:600`, matcher `:109–142`) applies the same tier server-side; the Step 7 total guard rejects any client/server divergence (learning #93), one Stripe Checkout Session is created. Client-declared discount is never trusted. ✅

---

## Q5 — `drop_type='catering'` vs `'event'` drift

**No `'catering'` keying exists to miss.** `VALID_DROP_TYPES = {neighbourhood, community, event}` (`create-drop/index.ts:49`, update-drop, and the `#dropType` control `drop-manager.html:1238–1242`). Every commercial/menu/order branch keys on **`'event'`** (capacity skip, guest section, capacity chip hide, discount matcher runs for any drop). The convert EF stamps `drop_type:'event'` (`:170`), so a converted drop **is** an event drop and hits all of it. `audience_scope:'direct'` (`:177`) is a new comms-only marker that, by its own comment (`:174–176`), does **not** change order or commercial logic today.

The **only** thing a converted drop "misses" relative to a hand-built event drop is a value the convert EF simply never sets: **`discount_tiers`** (Q2). That is a *seed* gap, not a `drop_type` drift.

---

## Q6 — Signposting: is the vendor guided to set menu + discount before publishing?

- **Menu: ENFORCED.** Publish is blocked unless ≥1 enabled menu item exists (`transition-drop-status/index.ts:130–131`; client mirror `drop-manager.html:2528`, `:2541`). Additionally ≥1 enabled item must have `capacity_units > 0` (`:141–164` server, `:2467/:2535/:2542` client) — **note:** this "must consume capacity units" check is *not* gated off for event drops, but it is benign in practice because `products.capacity_units` is `NOT NULL DEFAULT 1` (SCHEMA.md:185), so a normal catering menu passes. It would only block publish if *every* dish were explicitly set to `capacity_units = 0` — worth being aware of, but not a live blocker.
- **Discount: NOT ENFORCED, NOT PROMPTED.** `evaluateLiveReadiness()` (`transition-drop-status/index.ts:74–185`) and `getLiveReadiness()` (`drop-manager.html:2464–2544`) have **no reference to `discount_tiers`**. `commercials_valid` covers only fundraising + host-share (`:2511–2527`). So a vendor can publish a converted catering drop and hand the client an order link with **no bulk discount applied** — the client pays full price. Nothing in the flow surfaces "you agreed a discount; set it before you send the link." ⚠️ **This is the core signposting gap.**

**Net:** it is fully possible to publish and share a converted catering drop with a menu but **no discount**, silently charging the client list price instead of the agreed bulk rate.

---

## Other risky-nearby items (noted, not chased)

- **Discount tiers are subtotal-threshold based, not guest/quantity based.** Fine for Variant A (subtotal rises with quantity), but if a vendor thinks in "% off for 40+ guests" they must translate that to a `threshold_pence`. Mild UX/mental-model friction, not a bug.
- **No Variant B (per-guest split / multiple payers).** Single-payer is the only shape; `expected_guests` is planning metadata only. Consistent with scope, flagged for completeness.
- **Convert EF placeholder timing is a Stripe-less draft** (`:185–190`); if a vendor publishes without confirming the window they'd expose the 12:00–14:00 placeholder. Timing publish gate catches empties but not "wrong-but-present" placeholder times.
- **`audience_scope:'direct'`** is set but per its own comment does not yet change card profile/openness — latent, not active.

## STOP — next step is a build, not this session

The actionable gap (convert seeds no discount + no publish-time discount prompt) is a change, not a finding to fix here. Recommend the follow-up decide between: (a) seed a default/placeholder discount tier at convert time, and/or (b) add a non-blocking "discount not set" prompt to the Commercials/Review step for event drops. Not implemented in this read-only pass.
