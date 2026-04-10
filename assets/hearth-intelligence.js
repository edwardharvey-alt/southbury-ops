/**
 * Hearth Intelligence Module
 * Shared analysis engine for Insights, Customers, and Home dashboard.
 * Extracted from insights.html (T4-28).
 *
 * Pure logic — no DOM dependencies. Exposes window.HearthIntelligence.
 */
(function () {
  'use strict';

  /* ================================================================
     Internal helpers — formatting and maths
     ================================================================ */

  const fmtGBP = (pence) => {
    const n = Number(pence || 0) / 100;
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      maximumFractionDigits: n % 1 === 0 ? 0 : 2
    }).format(n);
  };

  const fmtNum = (n) => new Intl.NumberFormat('en-GB').format(Number(n || 0));

  const fmtPct = (n) =>
    (n == null || Number.isNaN(Number(n))) ? '\u2014' : `${Number(n).toFixed(1)}%`;

  const sum = (arr, fn) =>
    arr.reduce((acc, x) => acc + Number(fn ? fn(x) : x || 0), 0);

  const avg = (arr, fn) => arr.length ? sum(arr, fn) / arr.length : 0;

  const daysBetween = (a, b) =>
    Math.round((+new Date(a) - +new Date(b)) / 86400000);

  const safe = (v, fallback = '\u2014') =>
    (v == null || v === '') ? fallback : v;

  const titleCase = (str) =>
    String(str || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

  /* ================================================================
     detectArchetype
     ================================================================ */

  /**
   * Classifies a vendor into an operating archetype based on onboarding
   * preferences. Returns an archetype object containing the type string,
   * descriptive label, and the raw goals / delivery model for downstream
   * recommendation generation.
   *
   * @param {Object} vendorPreferences — vendor row or subset with
   *   primary_goal (array), delivery_model (string), vendor_type (string)
   * @returns {{ type: string, label: string, goals: string[], deliveryModel: string, vendorType: string }}
   */
  function detectArchetype(vendorPreferences) {
    const goals = Array.isArray(vendorPreferences?.primary_goal)
      ? vendorPreferences.primary_goal
      : [];
    const deliveryModel = vendorPreferences?.delivery_model || '';
    const vendorType = vendorPreferences?.vendor_type || '';

    let type, label;

    if (goals.includes('reduce_aggregators') || deliveryModel === 'aggregator') {
      type = 'aggregator_dependent';
      label = 'Building independence from aggregators';
    } else if (goals.includes('grow_customer_base')) {
      type = 'growth_focused';
      label = 'Focused on growing a direct customer base';
    } else if (goals.includes('predictable_demand')) {
      type = 'demand_planner';
      label = 'Building predictable, plannable demand';
    } else if (goals.includes('new_areas')) {
      type = 'area_expander';
      label = 'Testing and expanding into new areas';
    } else if (goals.includes('weekly_rhythm')) {
      type = 'rhythm_builder';
      label = 'Establishing a regular operating rhythm';
    } else if (goals.includes('events')) {
      type = 'event_operator';
      label = 'Running planned food events and moments';
    } else if (!goals.length) {
      type = 'unconfigured';
      label = 'Setup not yet completed';
    } else {
      type = 'general';
      label = 'General operator';
    }

    return { type, label, goals, deliveryModel, vendorType };
  }

  /* ================================================================
     analyseCapacitySignals
     ================================================================ */

  /**
   * Analyses capacity fill-rate patterns across recent drops.
   *
   * @param {Object[]} dropStats — rows from v_hearth_drop_stats (or filtered subset)
   * @returns {{ avgUtilisation: number|null, status: string, narrative: string, shortNarrative: string, weakestDrop: Object|null, dropCount: number }}
   */
  function analyseCapacitySignals(dropStats) {
    const withCap = dropStats.filter(d => d.capacity_utilisation_pct != null);
    const avgUtilisation = withCap.length
      ? avg(withCap, d => d.capacity_utilisation_pct)
      : null;

    const weakestDrop = dropStats.length
      ? dropStats.slice()
          .sort((a, b) => Number(a.capacity_utilisation_pct || 0) - Number(b.capacity_utilisation_pct || 0))[0]
      : null;

    let status, narrative;

    if (!withCap.length) {
      status = 'no_signal';
      narrative = 'No clear capacity signal yet because capacity is not resolving on enough drops.';
    } else if (avgUtilisation >= 90) {
      status = 'very_full';
      narrative = `Average capacity utilisation is ${fmtPct(avgUtilisation)}. This suggests drops are running very full and may justify testing slightly more declared capacity in similar contexts.`;
    } else if (avgUtilisation >= 70) {
      status = 'healthy';
      narrative = `Average capacity utilisation is ${fmtPct(avgUtilisation)}. This looks healthy and suggests declared capacity is broadly in the right zone.`;
    } else {
      status = 'under_filled';
      narrative = `Average capacity utilisation is ${fmtPct(avgUtilisation)}. That may indicate under-filled drops or declared capacity set too high for some contexts.`;
    }

    /* Short-form narrative (used in overview KPI cards) */
    let shortNarrative;
    if (!avgUtilisation) {
      shortNarrative = 'Capacity signal still forming';
    } else if (avgUtilisation >= 85) {
      shortNarrative = 'Healthy fill pattern';
    } else if (avgUtilisation >= 65) {
      shortNarrative = 'Reasonable fill pattern';
    } else {
      shortNarrative = 'Opportunity to tighten demand or capacity';
    }

    return {
      avgUtilisation,
      status,
      narrative,
      shortNarrative,
      weakestDrop,
      dropCount: withCap.length
    };
  }

  /* ================================================================
     analyseRhythmSignals
     ================================================================ */

  /**
   * Analyses drop cadence and scheduling patterns.
   *
   * @param {Object[]} dropStats — rows from v_hearth_drop_stats (or filtered subset)
   * @returns {{ avgGapDays: number|null, status: string, narrative: string, gapNarrative: string }}
   */
  function analyseRhythmSignals(dropStats) {
    if (dropStats.length < 2) {
      return {
        avgGapDays: null,
        status: 'no_signal',
        narrative: 'More drops are needed before rhythm can be assessed properly.',
        gapNarrative: 'drop spacing not yet clear'
      };
    }

    const sorted = dropStats.slice()
      .sort((a, b) => new Date(a.delivery_start || 0) - new Date(b.delivery_start || 0));
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(daysBetween(sorted[i].delivery_start, sorted[i - 1].delivery_start));
    }
    const avgGap = avg(gaps);

    let status, narrative;
    if (avgGap <= 7) {
      status = 'strong';
      narrative = `Drops are happening roughly every ${Math.round(avgGap)} days, which suggests a strong repeatable rhythm.`;
    } else if (avgGap <= 14) {
      status = 'decent';
      narrative = `Drops are happening roughly every ${Math.round(avgGap)} days, showing a decent but improvable operating cadence.`;
    } else {
      status = 'sparse';
      narrative = `Drops are spaced roughly ${Math.round(avgGap)} days apart, so there may be room to build a more regular rhythm.`;
    }

    return {
      avgGapDays: Math.round(avgGap),
      status,
      narrative,
      gapNarrative: `${Math.round(avgGap)} day gap between drops`
    };
  }

  /* ================================================================
     analyseMenuSignals
     ================================================================ */

  /**
   * Analyses item-level performance.
   *
   * @param {Object[]} itemSales — rows from v_item_sales (or filtered subset)
   * @returns {{ topRevenueItem: Object|null, topVolumeItem: Object|null, bestEfficiencyItem: Object|null }}
   */
  function analyseMenuSignals(itemSales) {
    if (!itemSales || !itemSales.length) {
      return {
        topRevenueItem: null,
        topVolumeItem: null,
        bestEfficiencyItem: null
      };
    }

    const byRevenue = itemSales.slice()
      .sort((a, b) => Number(b.revenue_pence || 0) - Number(a.revenue_pence || 0));

    const topRevenueItem = byRevenue[0] || null;

    const topVolumeItem = itemSales.slice()
      .sort((a, b) => Number(b.units_sold || 0) - Number(a.units_sold || 0))[0] || null;

    const bestEfficiencyItem = itemSales
      .filter(i => i.revenue_per_capacity_unit_pence != null)
      .sort((a, b) => Number(b.revenue_per_capacity_unit_pence || 0) - Number(a.revenue_per_capacity_unit_pence || 0))[0] || null;

    return {
      topRevenueItem,
      topVolumeItem,
      bestEfficiencyItem
    };
  }

  /* ================================================================
     analyseGrowthSignals
     ================================================================ */

  /**
   * Analyses order growth and repeat customer trends.
   *
   * @param {Object[]} dropStats — rows from v_hearth_drop_stats (or filtered subset)
   * @param {Object[]|null} customerData — customer rows (reserved for future use)
   * @param {number[]|null} revenueValues — aggregated revenue time-series values
   *   (used to determine trend direction)
   * @returns {{ totalRevenue: number, avgRevenuePerDrop: number, dropCount: number, trendDirection: string, momentumNarrative: string, businessStatus: string, businessStatusMeta: string, strongestDrop: Object|null }}
   */
  function analyseGrowthSignals(dropStats, customerData, revenueValues) {
    const totalRevenue = sum(dropStats, d => d.revenue_pence);
    const dropCount = dropStats.length;
    const avgRevenuePerDrop = dropCount ? totalRevenue / dropCount : 0;
    const avgCap = avg(
      dropStats.filter(d => d.capacity_utilisation_pct != null),
      d => d.capacity_utilisation_pct
    );

    /* Business status (from hero summary) */
    let businessStatus = 'Getting started';
    let businessStatusMeta = 'Not enough data yet to infer a clear pattern';
    if (dropCount >= 8 && totalRevenue > 0) {
      businessStatus = 'Building momentum';
      businessStatusMeta = 'Enough signal to start seeing repeatable patterns';
    }
    if (dropCount >= 14 && avgCap >= 70) {
      businessStatus = 'Strong operating rhythm';
      businessStatusMeta = 'Frequent drops with healthy capacity usage';
    }

    /* Trend direction */
    const trendDirection =
      (revenueValues && revenueValues.length >= 2 &&
       revenueValues[revenueValues.length - 1] > revenueValues[0])
        ? 'improving'
        : 'still forming';

    /* Momentum narrative */
    const momentumNarrative = dropCount
      ? `Hearth has generated ${fmtGBP(totalRevenue)} across ${fmtNum(dropCount)} drops in this reporting lens. Average revenue per drop is ${fmtGBP(avgRevenuePerDrop)}, and the revenue pattern looks ${trendDirection}.`
      : 'No drops match this filter yet.';

    /* Strongest drop */
    const strongestDrop = dropStats.length
      ? dropStats.slice()
          .sort((a, b) => Number(b.revenue_pence || 0) - Number(a.revenue_pence || 0))[0]
      : null;

    return {
      totalRevenue,
      avgRevenuePerDrop,
      dropCount,
      trendDirection,
      momentumNarrative,
      businessStatus,
      businessStatusMeta,
      strongestDrop
    };
  }

  /* ================================================================
     generateRecommendations
     ================================================================ */

  /**
   * Takes archetype and all signals, returns an array of action card objects.
   *
   * @param {Object} archetype — return value of detectArchetype()
   * @param {Object} signals — { capacity, rhythm, menu, growth, hosts }
   *   capacity: return of analyseCapacitySignals()
   *   rhythm:   return of analyseRhythmSignals()
   *   menu:     return of analyseMenuSignals()
   *   growth:   return of analyseGrowthSignals()
   *   hosts:    { bestHost: Object|null }
   * @returns {Array<{ id: string, priority: number, title: string, body: string, cta: string, ctaTarget: string|null, label: string, tone: string }>}
   */
  function generateRecommendations(archetype, signals) {
    const actions = [];
    const capacity = signals.capacity || {};
    const menu = signals.menu || {};
    const hosts = signals.hosts || {};

    const avgCap = capacity.avgUtilisation;
    const bestHost = hosts.bestHost || null;
    const bestItem = menu.topRevenueItem || null;
    const weakestDrop = capacity.weakestDrop || null;

    let priority = 1;

    /* --- Capacity-based recommendation --- */
    if (avgCap != null && avgCap >= 90) {
      actions.push({
        id: 'capacity_increase',
        priority: priority++,
        title: 'Test a slightly larger declared capacity',
        body: `Recent drops are averaging ${fmtPct(avgCap)} capacity usage. Similar drops may be able to absorb a modest capacity increase without diluting demand.`,
        cta: 'Open Drop Studio',
        ctaTarget: 'drop-manager',
        label: 'Capacity',
        tone: 'good'
      });
    } else if (avgCap != null && avgCap > 0 && avgCap < 65) {
      actions.push({
        id: 'capacity_review',
        priority: priority++,
        title: 'Review capacity sizing or demand concentration',
        body: `Average capacity usage is ${fmtPct(avgCap)}. Consider whether some drops are oversized, or whether demand would perform better if concentrated into fewer, stronger moments.`,
        cta: 'Open Drop Studio',
        ctaTarget: 'drop-manager',
        label: 'Capacity',
        tone: 'warn'
      });
    } else {
      actions.push({
        id: 'capacity_monitor',
        priority: priority++,
        title: 'Keep monitoring declared capacity',
        body: 'Capacity usage currently looks broadly serviceable. Keep watching how it changes by host and drop type.',
        cta: 'View Insights',
        ctaTarget: 'insights',
        label: 'Capacity',
        tone: 'neutral'
      });
    }

    /* --- Host recommendation --- */
    if (bestHost) {
      actions.push({
        id: 'host_lean_in',
        priority: priority++,
        title: 'Lean into the strongest host context',
        body: `${safe(bestHost.host_name)} is currently your strongest host signal, averaging ${fmtGBP(bestHost.avg_revenue_per_drop_pence)} per drop. That context may deserve repeat activation.`,
        cta: 'Open Drop Studio',
        ctaTarget: 'drop-manager',
        label: 'Host',
        tone: 'good'
      });
    }

    /* --- Menu recommendation --- */
    if (bestItem) {
      actions.push({
        id: 'menu_protect',
        priority: priority++,
        title: 'Protect and amplify the strongest menu driver',
        body: `${safe(bestItem.product_name)} is your top revenue item in this lens. Use it as a commercial anchor, then test which adjacent items improve basket value without adding too much operational load.`,
        cta: 'Open Menu Library',
        ctaTarget: 'drop-menu',
        label: 'Menu',
        tone: 'good'
      });
    }

    /* --- Weak drop recommendation --- */
    if (weakestDrop && weakestDrop.capacity_utilisation_pct != null && weakestDrop.capacity_utilisation_pct < 50) {
      actions.push({
        id: 'weak_drop_review',
        priority: priority++,
        title: 'Review under-filled drop patterns',
        body: `${safe(weakestDrop.drop_name)} only reached ${fmtPct(weakestDrop.capacity_utilisation_pct)} of declared capacity. Compare its host, timing and promotion pattern against stronger drops.`,
        cta: 'View Insights',
        ctaTarget: 'insights',
        label: 'Attention',
        tone: 'warn'
      });
    }

    /* --- Padding when fewer than 3 data-driven actions --- */
    if (actions.length < 3) {
      actions.push({
        id: 'build_signal',
        priority: priority++,
        title: 'Build more signal through repeated drops',
        body: 'The more repeatable drops Hearth sees, the better it can identify timing, host and menu patterns that genuinely move the business.',
        cta: 'Open Drop Studio',
        ctaTarget: 'drop-manager',
        label: 'Data',
        tone: 'neutral'
      });
    }

    /* --- Archetype-aware recommendations from vendor onboarding --- */
    const goals = archetype?.goals || [];
    const deliveryModel = archetype?.deliveryModel || '';

    if (goals.includes('grow_customer_base') && actions.length < 6) {
      actions.push({
        id: 'archetype_grow_customer_base',
        priority: priority++,
        title: 'Every drop builds your owned customer asset',
        body: 'Unlike aggregator platforms, every Hearth order adds a consented customer record you own permanently. The more drops you run, the faster that asset compounds \u2014 independent of any platform.',
        cta: 'View Customers',
        ctaTarget: 'customers',
        label: 'Growth',
        tone: 'good'
      });
    }

    if ((goals.includes('reduce_aggregators') || deliveryModel === 'aggregator') && actions.length < 6) {
      actions.push({
        id: 'archetype_reduce_aggregators',
        priority: priority++,
        title: 'Hearth builds the asset that aggregators keep from you',
        body: 'Aggregators own your customer relationships. Each Hearth drop reclaims a piece of that \u2014 giving you direct reach, zero commission, and a customer list that compounds over time.',
        cta: 'View Customers',
        ctaTarget: 'customers',
        label: 'Independence',
        tone: 'good'
      });
    }

    if (goals.includes('predictable_demand') && actions.length < 6) {
      actions.push({
        id: 'archetype_predictable_demand',
        priority: priority++,
        title: 'Drops create predictable, plannable revenue moments',
        body: 'Each drop has a declared capacity and a fixed window \u2014 giving you clarity on demand before you commit to fulfilment. That predictability compounds as your drop rhythm becomes known to your customers.',
        cta: 'Open Drop Studio',
        ctaTarget: 'drop-manager',
        label: 'Demand',
        tone: 'good'
      });
    }

    if (goals.includes('new_areas') && actions.length < 6) {
      actions.push({
        id: 'archetype_new_areas',
        priority: priority++,
        title: 'Use host contexts to test new areas without fixed cost',
        body: 'A drop at a new host venue is a low-risk way to test demand in a location before committing to it. Strong drops become the evidence base for where to expand next.',
        cta: 'Open Drop Studio',
        ctaTarget: 'drop-manager',
        label: 'Expansion',
        tone: 'neutral'
      });
    }

    if (goals.includes('weekly_rhythm') && actions.length < 6) {
      actions.push({
        id: 'archetype_weekly_rhythm',
        priority: priority++,
        title: 'A recurring series locks in your operating cadence',
        body: 'Set up a recurring drop series in Drop Studio and your weekly rhythm runs itself. Customers learn when to expect you \u2014 and repeat orders follow naturally.',
        cta: 'Open Drop Studio',
        ctaTarget: 'drop-manager',
        label: 'Rhythm',
        tone: 'neutral'
      });
    }

    if (goals.includes('events') && actions.length < 6) {
      actions.push({
        id: 'archetype_events',
        priority: priority++,
        title: 'Hearth is purpose-built for planned food moments',
        body: 'Every drop is a designed event \u2014 fixed window, declared capacity, host context. That structure makes one-off and fundraising events as easy to run as a regular service.',
        cta: 'Open Drop Studio',
        ctaTarget: 'drop-manager',
        label: 'Events',
        tone: 'neutral'
      });
    }

    if ((!archetype || goals.length === 0) && actions.length < 6) {
      actions.push({
        id: 'archetype_unconfigured',
        priority: priority++,
        title: 'Complete your setup to unlock personalised recommendations',
        body: 'Visit Setup to tell Hearth about your goals and how you operate. Recommendations will personalise once your preferences are saved.',
        cta: 'Open Setup',
        ctaTarget: 'onboarding',
        label: 'Setup',
        tone: 'neutral'
      });
    }

    return actions.slice(0, 6);
  }

  /* ================================================================
     segmentCustomers
     ================================================================ */

  /**
   * Takes a customer array and returns three groups:
   *   loyalCore  — 3+ orders
   *   occasional — exactly 2 orders
   *   lapsed     — no order in 60+ days (regardless of order count)
   *
   * A customer can appear in lapsed AND one of the other groups if they
   * meet both criteria. The primary segmentation is by recency first:
   * if a customer is lapsed, they appear in lapsed. Otherwise they
   * appear in loyalCore or occasional based on order count.
   *
   * Expected customer object shape (flexible field names):
   *   order_count | orders_count  — number of orders
   *   last_order_date | last_order_at — ISO date string of most recent order
   *
   * @param {Object[]} customers
   * @returns {{ loyalCore: Object[], occasional: Object[], lapsed: Object[] }}
   */
  function segmentCustomers(customers) {
    if (!customers || !customers.length) {
      return { loyalCore: [], occasional: [], lapsed: [] };
    }

    const now = new Date();
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const loyalCore = [];
    const occasional = [];
    const lapsed = [];

    for (const customer of customers) {
      const orderCount = Number(
        customer.order_count ?? customer.orders_count ?? 0
      );
      const lastOrderRaw = customer.last_order_date || customer.last_order_at || null;
      const lastOrder = lastOrderRaw ? new Date(lastOrderRaw) : null;

      const isLapsed = lastOrder && lastOrder < sixtyDaysAgo;

      if (isLapsed) {
        lapsed.push(customer);
      } else if (orderCount >= 3) {
        loyalCore.push(customer);
      } else if (orderCount === 2) {
        occasional.push(customer);
      }
      /* Customers with 0 or 1 orders who are not lapsed fall outside
         all three segments — they are new / single-order customers and
         will gain a segment as their history grows. */
    }

    return { loyalCore, occasional, lapsed };
  }

  /* ================================================================
     Expose on window
     ================================================================ */

  window.HearthIntelligence = {
    detectArchetype,
    analyseCapacitySignals,
    analyseRhythmSignals,
    analyseMenuSignals,
    analyseGrowthSignals,
    generateRecommendations,
    segmentCustomers
  };

})();
