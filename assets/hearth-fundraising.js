/* Hearth — fundraising contribution line.
 *
 * Single source of truth for the sentence a drop shows about what its orders
 * contribute. Loaded as a classic script by order.html (customer-facing) and
 * drop-manager.html (the vendor's "Customers will see: …" preview), so those two
 * surfaces cannot drift: the vendor is previewing the exact function the customer
 * page runs.
 *
 * THE RULES LIVE HERE, ONCE:
 *   - fundraising must be enabled
 *   - a cause name is required — no cause, no line
 *   - the amount must be positive for the drop's model
 *   - fundraising_display_text, when the vendor set it, is an OPTIONAL OVERRIDE
 *     that replaces the composed line verbatim
 *   - anything short of that returns null. A half-formed sentence about someone
 *     else's money is worse than silence (honest degradation — see the
 *     intelligence-layer invariants in CLAUDE.md).
 *
 * AUDIENCE PHRASING is the ONLY intended difference between surfaces:
 *   customer — "£3.00 from your order supports Southbury Food Bank."
 *              "5% of your order supports Southbury Food Bank."
 *   host     — "£3.00 from every order supports Southbury Food Bank"
 *              "5% of every order supports Southbury Food Bank"
 * The customer variant is prose in the page body and takes a full stop. The host
 * variant is a hint under a figure, sitting beside host_share_descriptor, and
 * matches that sibling's no-terminal-punctuation style.
 *
 * ONE EXCEPTION — per_item is audience-neutral: "£1.00 per item supports X" is
 * equally true of one basket and of every order, so both surfaces get the same
 * words and differ only in the full stop. See the note at that branch.
 *
 * PERCENTAGE shows the RATE, never a live pound figure. The exact amount depends
 * on the final basket and is settled net-of-discount server-side (operational
 * learning #55) — quoting a pound amount at basket time would be a number we
 * cannot honour.
 *
 * NEVER render fundraising_cause_reference. It is operator-only (charity number
 * or remittance note) and is absent from v_drop_public by design.
 *
 * MIRRORED IN (Deno cannot import this file, so each restates the rules against
 * the same strings — change one, change the other):
 *   - supabase/functions/host-view-summary/index.ts (buildFundraisingDescriptor)
 *     mirrors compose()/resolve(); the host phrasings above are the diff target.
 *   - supabase/functions/send-order-confirmation/index.ts (buildContributionLine)
 *     mirrors composeContribution()/resolveContribution() — the PAST-TENSE line,
 *     see the post-purchase block at the foot of this file.
 */
(function (global) {
  "use strict";

  var GBP = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  function defaultFormatMoneyPence(pence) {
    return GBP.format(Number(pence || 0) / 100);
  }

  /* "5.00" -> "5", "2.50" -> "2.5". Show the rate as a person would say it. */
  function formatPercentage(value) {
    return String(Number(Number(value).toFixed(2)));
  }

  /* Compose the line from the structured fields alone. Ignores the override and
     the enabled flag — resolve() handles those. Returns null when the fields do
     not yet say something true.

     opts.audience  — "customer" (default) | "host"
     opts.formatMoneyPence — optional; lets a page pass its own money formatter so
       the amount reads identically to every other price on that page. */
  function compose(fields, opts) {
    var options = opts || {};
    var audience = options.audience === "host" ? "host" : "customer";
    var formatMoney = typeof options.formatMoneyPence === "function"
      ? options.formatMoneyPence
      : defaultFormatMoneyPence;

    var cause = String((fields && fields.causeName) || "").trim();
    if (!cause) return null;

    var model = String((fields && fields.model) || "");
    var whose = audience === "host" ? "every order" : "your order";
    var stop = audience === "host" ? "" : ".";

    if (model === "per_order") {
      var pence = Number(fields.perOrderPence);
      if (!(pence > 0)) return null;
      return formatMoney(pence) + " from " + whose + " supports " + cause + stop;
    }

    if (model === "percentage") {
      var pct = Number(fields.percentage);
      if (!(pct > 0)) return null;
      return formatPercentage(pct) + "% of " + whose + " supports " + cause + stop;
    }

    /* per_item is the one model whose wording is AUDIENCE-NEUTRAL: "£1.00 per
       item" is already true for one customer's basket and for every order
       alike, so there is no "your order"/"every order" swap to make and `whose`
       is deliberately unused here. The only difference between the two surfaces
       is the terminal full stop, which is why `stop` still applies. This is the
       stated exception to the AUDIENCE PHRASING note at the top of this file —
       do not manufacture a host variant to make it look symmetrical. */
    if (model === "per_item") {
      var itemPence = Number(fields.perItemPence);
      if (!(itemPence > 0)) return null;
      return formatMoney(itemPence) + " per item supports " + cause + stop;
    }

    return null;
  }

  /* The whole decision for a drop row: off -> null, override -> the vendor's own
     words verbatim, otherwise the composed line (or null). This is what a page
     should call; compose() is for the Drop Studio preview, which needs to
     distinguish "using the override" from "using the composed line".

     `drop` takes the column names as they appear on v_drop_public and
     v_drop_summary, so a row from either view can be passed straight in. */
  function resolve(drop, opts) {
    if (!drop || drop.fundraising_enabled !== true) return null;

    var override = String(drop.fundraising_display_text || "").trim();
    if (override) return override;

    return compose({
      model: drop.fundraising_model,
      percentage: drop.fundraising_percentage,
      perOrderPence: drop.fundraising_per_order_pence,
      perItemPence: drop.fundraising_per_item_pence,
      causeName: drop.fundraising_cause_name
    }, opts);
  }

  /* ── Post-purchase ────────────────────────────────────────────────────────
     The confirmation line, past tense: "Your order contributed £3.00 to X."

     A SEPARATE sentence from compose(), not an audience variant of it, for three
     reasons that all point the same way:

     1. TENSE. Before the order it is a standing fact about the drop ("£3.00 from
        your order supports X"); after it, it is a fact about one order that has
        happened. Different sentence, not different phrasing of one sentence.

     2. PERCENTAGE RESOLVES TO POUNDS. compose() deliberately shows the RATE and
        never a pound figure, because mid-basket the final total is unknown and
        settles net-of-discount server-side (operational learning #55). At
        confirmation the total is known and charged, so the real amount is not
        only safe to show but is the more useful thing to say.

     3. THE OVERRIDE DOES NOT APPLY. fundraising_display_text is the vendor's own
        PRE-purchase message. Post-purchase we always want the specific
        "your order contributed" line, so resolveContribution() ignores the
        override where resolve() honours it. This asymmetry is intentional --
        do not "fix" it by routing the override through here.

     Unchanged from compose(): a cause name is required, the amount must be
     positive, and anything short of that returns null rather than a half-formed
     sentence about someone else's money. fundraising_cause_reference is never
     rendered -- it is operator-only.

     MIRRORED IN: supabase/functions/send-order-confirmation/index.ts
     (buildContributionLine). Deno cannot import this file, so the email restates
     these rules against the same strings. Change one, change the other. */

  /* opts.orderTotalPence -- the order's NET, post-discount total, i.e.
     orders.total_pence. Required for the percentage model, ignored by per_order.
     Passing a gross or pre-discount figure here would overstate the
     contribution, so read it from orders.total_pence and nowhere else.

     opts.itemCount -- the order's item count. Required for the per_item model,
     ignored by the other two.

     THE ITEM-COUNT RULE IS NOT OURS TO CHOOSE. It is fixed by the money view
     (migration 20260720120100_drop_fundraising_per_item_views.sql, which states
     it as a locked rule): an order's item count is SUM(order_items.qty) across
     ALL lines, product AND bundle, with NO descent into order_item_selections —
     a bundle counts as its own line quantity, not as the items inside it.
     Callers must sum exactly that line set and nothing else. Because the view,
     this page and the confirmation email all apply the same rule to the same
     rows, the running total a vendor and host see and the figure quoted to the
     customer agree by construction rather than by coincidence. Count a
     different set here and the customer is told one number while the drop
     totals another. */
  function composeContribution(fields, opts) {
    var options = opts || {};
    var formatMoney = typeof options.formatMoneyPence === "function"
      ? options.formatMoneyPence
      : defaultFormatMoneyPence;

    var cause = String((fields && fields.causeName) || "").trim();
    if (!cause) return null;

    var model = String((fields && fields.model) || "");
    var pence = null;

    if (model === "per_order") {
      pence = Number(fields.perOrderPence);
    } else if (model === "percentage") {
      var pct = Number(fields.percentage);
      var total = Number(fields.orderTotalPence);
      /* No total means we cannot say what this order gave. Silence beats a
         guess. */
      if (!(pct > 0) || !(total > 0)) return null;
      pence = Math.round((pct / 100) * total);
    } else if (model === "per_item") {
      var perItem = Number(fields.perItemPence);
      var count = Number(fields.itemCount);
      /* No count means we cannot say what this order gave -- same stance as a
         missing total above. Silence beats a guess. */
      if (!(perItem > 0) || !(count > 0)) return null;
      /* Integer pence x integer count is exact -- no rounding, and so no
         rounding to disagree with the view about. */
      pence = perItem * count;
    } else {
      return null;
    }

    /* Covers NaN, null, zero and a percentage of a tiny order that rounds down
       to nothing -- "contributed £0.00" is worse than saying nothing. */
    if (!(pence > 0)) return null;

    return "Your order contributed " + formatMoney(pence) + " to " + cause + ".";
  }

  /* The whole post-purchase decision for a drop row plus one order's net total.
     `drop` takes the same column names as resolve(). */
  function resolveContribution(drop, opts) {
    if (!drop || drop.fundraising_enabled !== true) return null;

    /* NOTE: fundraising_display_text is deliberately NOT consulted here. See
       reason 3 in the block comment above. */
    return composeContribution({
      model: drop.fundraising_model,
      percentage: drop.fundraising_percentage,
      perOrderPence: drop.fundraising_per_order_pence,
      perItemPence: drop.fundraising_per_item_pence,
      causeName: drop.fundraising_cause_name,
      orderTotalPence: (opts || {}).orderTotalPence,
      itemCount: (opts || {}).itemCount
    }, opts);
  }

  global.HearthFundraising = {
    compose: compose,
    resolve: resolve,
    composeContribution: composeContribution,
    resolveContribution: resolveContribution
  };
})(window);
