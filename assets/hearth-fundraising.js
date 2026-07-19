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
 * PERCENTAGE shows the RATE, never a live pound figure. The exact amount depends
 * on the final basket and is settled net-of-discount server-side (operational
 * learning #55) — quoting a pound amount at basket time would be a number we
 * cannot honour.
 *
 * NEVER render fundraising_cause_reference. It is operator-only (charity number
 * or remittance note) and is absent from v_drop_public by design.
 *
 * MIRRORED IN: supabase/functions/host-view-summary/index.ts
 * (buildFundraisingDescriptor). Deno cannot import this file, so the host
 * descriptor is composed there against the same rules and the same strings.
 * Change one, change the other — the host phrasings above are the diff target.
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
      causeName: drop.fundraising_cause_name
    }, opts);
  }

  global.HearthFundraising = {
    compose: compose,
    resolve: resolve
  };
})(window);
