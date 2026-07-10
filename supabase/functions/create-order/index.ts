import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { getCorsHeaders } from "../_shared/cors.ts";

// Anonymous customer order entry point. Replaces the direct PostgREST
// inserts in order.html's persistOrder(). Validates the basket against
// the live drop, writes orders / order_items / order_item_selections /
// order_status_events as a sequence with cleanup on failure, then
// creates a Stripe Checkout session and returns its URL.
//
// verify_jwt = false. Customer flow has no authenticated user; payload
// shape is the only thing we trust.

const ORDERABLE_STATUSES = new Set(["live", "scheduled"]);

// Capacity-hold / Stripe Checkout window, single-sourced so the order row's
// expires_at and the Stripe session deadline can't drift apart. Stripe's
// documented minimum for a session's expires_at is 1800 seconds (30 minutes)
// from session creation; the reserved capacity is held for the same window.
const HOLD_WINDOW_SECONDS = 1800;

type BasketSelection = {
  bundle_line_id: string;
  selected_product_id: string;
  quantity: number;
  drives_capacity?: boolean;
};

// Stage 4 product options (modifiers). The client sends only WHICH option was
// chosen (group_id + option_id). option_name and price_delta_pence ride along
// for the customer's own display but are NEVER trusted server-side — the
// server re-derives both from product_options at charge time.
type OptionSelection = {
  group_id: string;
  option_id: string;
  option_name?: string;
  price_delta_pence?: number;
};

// Server-derived option snapshot: the values actually charged and recorded,
// resolved from product_options, not from the client payload.
type ResolvedOption = {
  option_id: string;
  group_id: string;
  option_name: string;
  price_delta_pence: number;
};

type BasketItem = {
  type: "product" | "bundle";
  product_id: string | null;
  bundle_id: string | null;
  name: string;
  unit_price_pence: number;
  quantity: number;
  capacity_units: number;
  selections?: BasketSelection[];
  option_selections?: OptionSelection[];
};

type Payload = {
  drop_id: string;
  customer: {
    name: string;
    phone: string;
    email: string | null;
    postcode: string;
    notes: string | null;
    contact_opt_in: boolean;
    contact_opt_in_scope: "both" | null;
  };
  fulfilment: {
    mode: "delivery" | "collection";
    address: string | null;
    table_number: string | null;
    table_notes: string | null;
  };
  totals: {
    subtotal_pence: number;
    delivery_pence: number;
    total_pence: number;
    capacity_units: number;
  };
  basket: BasketItem[];
};

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// T3-12a — Postcode prefix matcher. Kept byte-identical to the
// hearth-vendor.js browser implementation (assets/hearth-vendor.js)
// so server and client never disagree about what counts as "inside"
// a delivery area.
function matchesAllowedPrefix(customerPostcode: unknown, allowedPrefixes: unknown): boolean {
  if (!allowedPrefixes || (allowedPrefixes as string[]).length === 0) return true;
  var normalised = (customerPostcode as string || '').toUpperCase().replace(/\s+/g, '');
  if (!normalised) return false;
  return (allowedPrefixes as string[]).some(function (p) {
    var prefixNorm = (p || '').toUpperCase().replace(/\s+/g, '');
    return prefixNorm !== '' && normalised.startsWith(prefixNorm);
  });
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// T3-13b — bulk discount tier matcher. Mirrors the client-side helpers
// in order.html (prompt 2) so server and customer compute the same
// number. The matched tier is the highest tier whose threshold_pence
// is <= the basket subtotal; nothing matches below the lowest threshold.
type DiscountTier = {
  threshold_pence: number;
  discount_type: "percentage" | "amount";
  discount_value: number;
};

function findMatchingTier(subtotalPence: number, tiers: unknown): DiscountTier | null {
  if (!Array.isArray(tiers) || tiers.length === 0) return null;
  if (!isFiniteNumber(subtotalPence) || subtotalPence <= 0) return null;
  const sorted = (tiers as DiscountTier[])
    .filter((t) => t && Number.isFinite(Number(t?.threshold_pence)))
    .sort((a, b) => Number(a.threshold_pence) - Number(b.threshold_pence));
  let matched: DiscountTier | null = null;
  for (const tier of sorted) {
    if (Number(tier.threshold_pence) <= subtotalPence) matched = tier;
    else break;
  }
  return matched;
}

function calculateDiscountPence(subtotalPence: number, matchedTier: DiscountTier | null): number {
  if (!matchedTier) return 0;
  if (matchedTier.discount_type === "percentage") {
    const pct = Math.max(0, Math.min(100, Number(matchedTier.discount_value) || 0));
    return Math.round(subtotalPence * (pct / 100));
  }
  if (matchedTier.discount_type === "amount") {
    return Math.max(0, Math.round(Number(matchedTier.discount_value) || 0));
  }
  return 0;
}

function validatePayload(body: unknown): { ok: true; data: Payload } | { ok: false; reason: string } {
  if (!body || typeof body !== "object") return { ok: false, reason: "Body must be a JSON object" };
  const b = body as Record<string, unknown>;

  if (!isUuid(b.drop_id)) return { ok: false, reason: "drop_id must be a uuid" };

  const c = b.customer as Record<string, unknown> | undefined;
  if (!c || typeof c !== "object") return { ok: false, reason: "customer is required" };
  if (typeof c.name !== "string" || !c.name.trim()) return { ok: false, reason: "customer.name is required" };
  if (typeof c.phone !== "string" || !c.phone.trim()) return { ok: false, reason: "customer.phone is required" };
  if (typeof c.postcode !== "string" || !c.postcode.trim()) return { ok: false, reason: "customer.postcode is required" };
  if (c.email !== null && typeof c.email !== "string") return { ok: false, reason: "customer.email must be string or null" };
  if (c.notes !== null && typeof c.notes !== "string") return { ok: false, reason: "customer.notes must be string or null" };
  if (typeof c.contact_opt_in !== "boolean") return { ok: false, reason: "customer.contact_opt_in must be boolean" };
  if (c.contact_opt_in_scope !== null && c.contact_opt_in_scope !== "both") {
    return { ok: false, reason: "customer.contact_opt_in_scope must be 'both' or null" };
  }

  const f = b.fulfilment as Record<string, unknown> | undefined;
  if (!f || typeof f !== "object") return { ok: false, reason: "fulfilment is required" };
  if (f.mode !== "delivery" && f.mode !== "collection") {
    return { ok: false, reason: "fulfilment.mode must be 'delivery' or 'collection'" };
  }
  if (f.address !== null && typeof f.address !== "string") return { ok: false, reason: "fulfilment.address must be string or null" };
  if (f.table_number !== null && typeof f.table_number !== "string") return { ok: false, reason: "fulfilment.table_number must be string or null" };
  if (f.table_notes !== null && typeof f.table_notes !== "string") return { ok: false, reason: "fulfilment.table_notes must be string or null" };

  const t = b.totals as Record<string, unknown> | undefined;
  if (!t || typeof t !== "object") return { ok: false, reason: "totals is required" };
  if (!isFiniteNumber(t.subtotal_pence) || t.subtotal_pence < 0) return { ok: false, reason: "totals.subtotal_pence must be a non-negative number" };
  if (!isFiniteNumber(t.delivery_pence) || t.delivery_pence < 0) return { ok: false, reason: "totals.delivery_pence must be a non-negative number" };
  if (!isFiniteNumber(t.total_pence) || t.total_pence < 0) return { ok: false, reason: "totals.total_pence must be a non-negative number" };
  if (!isFiniteNumber(t.capacity_units) || t.capacity_units < 0) return { ok: false, reason: "totals.capacity_units must be a non-negative number" };

  if (!Array.isArray(b.basket) || b.basket.length === 0) return { ok: false, reason: "basket must be a non-empty array" };
  for (let i = 0; i < b.basket.length; i++) {
    const item = b.basket[i] as Record<string, unknown>;
    if (item.type !== "product" && item.type !== "bundle") {
      return { ok: false, reason: `basket[${i}].type must be 'product' or 'bundle'` };
    }
    if (item.type === "product" && !isUuid(item.product_id)) {
      return { ok: false, reason: `basket[${i}].product_id must be a uuid for product items` };
    }
    if (item.type === "bundle" && !isUuid(item.bundle_id)) {
      return { ok: false, reason: `basket[${i}].bundle_id must be a uuid for bundle items` };
    }
    if (typeof item.name !== "string" || !item.name) return { ok: false, reason: `basket[${i}].name is required` };
    if (!isFiniteNumber(item.unit_price_pence) || item.unit_price_pence < 0) {
      return { ok: false, reason: `basket[${i}].unit_price_pence must be a non-negative number` };
    }
    if (!isFiniteNumber(item.quantity) || item.quantity < 1 || !Number.isInteger(item.quantity)) {
      return { ok: false, reason: `basket[${i}].quantity must be a positive integer` };
    }
    if (!isFiniteNumber(item.capacity_units) || item.capacity_units < 0) {
      return { ok: false, reason: `basket[${i}].capacity_units must be a non-negative number` };
    }
    if (item.selections !== undefined && !Array.isArray(item.selections)) {
      return { ok: false, reason: `basket[${i}].selections must be an array if present` };
    }
    for (const s of (item.selections as BasketSelection[] | undefined) || []) {
      if (!isUuid(s.bundle_line_id)) return { ok: false, reason: `basket[${i}] selection bundle_line_id must be a uuid` };
      if (!isUuid(s.selected_product_id)) return { ok: false, reason: `basket[${i}] selection selected_product_id must be a uuid` };
      if (!isFiniteNumber(s.quantity) || s.quantity < 1 || !Number.isInteger(s.quantity)) {
        return { ok: false, reason: `basket[${i}] selection quantity must be a positive integer` };
      }
    }
    // Stage 4 product options. Only the two identifiers are validated and
    // trusted; option_name / price_delta_pence are display-only and ignored.
    if (item.option_selections !== undefined && !Array.isArray(item.option_selections)) {
      return { ok: false, reason: `basket[${i}].option_selections must be an array if present` };
    }
    for (const o of (item.option_selections as OptionSelection[] | undefined) || []) {
      if (!o || typeof o !== "object") return { ok: false, reason: `basket[${i}] option_selection must be an object` };
      if (!isUuid(o.group_id)) return { ok: false, reason: `basket[${i}] option_selection group_id must be a uuid` };
      if (!isUuid(o.option_id)) return { ok: false, reason: `basket[${i}] option_selection option_id must be a uuid` };
    }
  }

  return { ok: true, data: body as Payload };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const jsonResponse = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    // Step 1 — schema validation.
    const parsed = validatePayload(raw);
    if (!parsed.ok) return jsonResponse({ error: parsed.reason }, 400);
    const payload = parsed.data;

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Step 2 — drop exists, status orderable. Use v_drop_summary so
    // closed-by-time gets caught regardless of raw drops.status.
    const { data: dropSummary, error: dropErr } = await serviceClient
      .from("v_drop_summary")
      .select("drop_id, vendor_id, slug, status, opens_at, closes_at, capacity_units_total")
      .eq("drop_id", payload.drop_id)
      .maybeSingle();

    if (dropErr) return jsonResponse({ error: "Drop lookup failed" }, 500);
    if (!dropSummary) return jsonResponse({ error: "Drop not found" }, 404);

    if (!ORDERABLE_STATUSES.has(String(dropSummary.status))) {
      return jsonResponse({ error: "This drop is not currently open for orders" }, 400);
    }

    // Step 3 — within ordering window.
    const now = Date.now();
    const opensAt = dropSummary.opens_at ? Date.parse(dropSummary.opens_at) : null;
    const closesAt = dropSummary.closes_at ? Date.parse(dropSummary.closes_at) : null;
    if (opensAt !== null && now < opensAt) {
      return jsonResponse({ error: "This drop has not opened yet" }, 400);
    }
    if (closesAt !== null && now > closesAt) {
      return jsonResponse({ error: "Ordering for this drop has closed" }, 400);
    }

    // Step 3.5 — T3-12a delivery area enforcement.
    // v_drop_summary is not guaranteed to expose the new columns, so
    // read them directly from the drops table. delivery_area_type IS
    // NULL → no restriction (pass through). 'postcode_prefix' →
    // validate the customer postcode against allowed_postcode_prefixes.
    // 'radius' → reject 501 until T3-12b ships, so a half-built radius
    // config can't accidentally let all orders through.
    const { data: dropAreaRow, error: dropAreaErr } = await serviceClient
      .from("drops")
      .select("delivery_area_type, allowed_postcode_prefixes, capacity_driver, capacity_categories, drop_type, discount_tiers")
      .eq("id", payload.drop_id)
      .maybeSingle();
    if (dropAreaErr) return jsonResponse({ error: "Drop area lookup failed" }, 500);
    if (!dropAreaRow) return jsonResponse({ error: "Drop not found" }, 404);

    const areaType = dropAreaRow.delivery_area_type;
    if (areaType === "radius") {
      return jsonResponse({ ok: false, reason: "delivery_area_radius_not_supported" }, 501);
    }
    if (areaType === "postcode_prefix") {
      const allowed = dropAreaRow.allowed_postcode_prefixes;
      if (!Array.isArray(allowed) || allowed.length === 0) {
        return jsonResponse({ ok: false, reason: "delivery_area_misconfigured" }, 500);
      }
      if (!matchesAllowedPrefix(payload.customer.postcode, allowed)) {
        return jsonResponse({ ok: false, reason: "delivery_area_excluded" }, 400);
      }
    }

    const vendorId = String(dropSummary.vendor_id);

    // Step 4 — vendor Stripe-ready. Defence in depth even though the
    // publish gate already prevents going live without this.
    const { data: vendor, error: vendorErr } = await serviceClient
      .from("vendors")
      .select("id, stripe_account_id, stripe_onboarding_complete, platform_fee_pct, platform_fee_fixed_pence")
      .eq("id", vendorId)
      .maybeSingle();
    if (vendorErr) return jsonResponse({ error: "Vendor lookup failed" }, 500);
    if (!vendor) return jsonResponse({ error: "Vendor not found" }, 404);
    if (!vendor.stripe_account_id || vendor.stripe_onboarding_complete !== true) {
      return jsonResponse({ error: "This vendor is not yet set up to accept payment" }, 400);
    }

    // Step 5 — every product / bundle in the basket belongs to this vendor.
    // The capacity-relevant fields fetched here are reused in Step 7.5 to
    // compute server-authoritative capacity contributions, so we promote
    // the rows into lookup maps keyed by id.
    type CapacityLookup = {
      category_id: string | null;
      counts_toward_capacity: boolean;
      capacity_weight: number;
      // Catalog list price. Used in Step 6.5 as the fallback when the drop's
      // drop_menu_items row carries no price_override_pence for this item.
      price_pence: number | null;
    };
    const productMap = new Map<string, CapacityLookup>();
    const bundleMap = new Map<string, CapacityLookup>();

    const productIds = payload.basket
      .filter((i) => i.type === "product")
      .map((i) => i.product_id as string);
    const bundleIds = payload.basket
      .filter((i) => i.type === "bundle")
      .map((i) => i.bundle_id as string);

    if (productIds.length > 0) {
      const { data: products, error: prodErr } = await serviceClient
        .from("products")
        .select("id, vendor_id, category_id, counts_toward_capacity, capacity_weight, price_pence")
        .in("id", productIds);
      if (prodErr) return jsonResponse({ error: "Product lookup failed" }, 500);
      const found = new Set((products || []).map((p) => p.id));
      for (const id of productIds) {
        if (!found.has(id)) return jsonResponse({ error: "Basket contains an unknown product" }, 400);
      }
      if ((products || []).some((p) => p.vendor_id !== vendorId)) {
        return jsonResponse({ error: "Basket contains a product that does not belong to this vendor" }, 400);
      }
      for (const p of products || []) {
        productMap.set(p.id as string, {
          category_id: (p.category_id as string | null) ?? null,
          counts_toward_capacity: Boolean(p.counts_toward_capacity),
          capacity_weight: Number(p.capacity_weight ?? 1),
          price_pence: p.price_pence == null ? null : Number(p.price_pence),
        });
      }
    }

    if (bundleIds.length > 0) {
      const { data: bundles, error: bunErr } = await serviceClient
        .from("bundles")
        .select("id, vendor_id, category_id, counts_toward_capacity, capacity_weight, price_pence")
        .in("id", bundleIds);
      if (bunErr) return jsonResponse({ error: "Bundle lookup failed" }, 500);
      const found = new Set((bundles || []).map((b) => b.id));
      for (const id of bundleIds) {
        if (!found.has(id)) return jsonResponse({ error: "Basket contains an unknown bundle" }, 400);
      }
      if ((bundles || []).some((b) => b.vendor_id !== vendorId)) {
        return jsonResponse({ error: "Basket contains a bundle that does not belong to this vendor" }, 400);
      }
      for (const b of bundles || []) {
        bundleMap.set(b.id as string, {
          category_id: (b.category_id as string | null) ?? null,
          counts_toward_capacity: Boolean(b.counts_toward_capacity),
          capacity_weight: Number(b.capacity_weight ?? 1),
          price_pence: b.price_pence == null ? null : Number(b.price_pence),
        });
      }
    }

    // Step 6 — bundle selections reference valid choice products for the right bundle.
    for (const item of payload.basket) {
      if (item.type !== "bundle" || !item.selections || item.selections.length === 0) continue;

      const bundleLineIds = Array.from(new Set(item.selections.map((s) => s.bundle_line_id)));
      const { data: lines, error: linesErr } = await serviceClient
        .from("bundle_lines")
        .select("id, bundle_id")
        .in("id", bundleLineIds);
      if (linesErr) return jsonResponse({ error: "Bundle line lookup failed" }, 500);
      if ((lines || []).length !== bundleLineIds.length) {
        return jsonResponse({ error: "Bundle selection references an unknown line" }, 400);
      }
      if ((lines || []).some((l) => l.bundle_id !== item.bundle_id)) {
        return jsonResponse({ error: "Bundle selection references a line from a different bundle" }, 400);
      }

      const { data: choices, error: choicesErr } = await serviceClient
        .from("bundle_line_choice_products")
        .select("bundle_line_id, product_id")
        .in("bundle_line_id", bundleLineIds);
      if (choicesErr) return jsonResponse({ error: "Bundle choice lookup failed" }, 500);
      const validChoices = new Set(
        (choices || []).map((c) => `${c.bundle_line_id}:${c.product_id}`)
      );
      for (const s of item.selections) {
        if (!validChoices.has(`${s.bundle_line_id}:${s.selected_product_id}`)) {
          return jsonResponse({ error: "Bundle selection references an invalid product choice" }, 400);
        }
      }
    }

    // Step 6.5 — server-authoritative effective price. The server, not the
    // client, is the pricing authority. For each basket item we re-derive the
    // unit price from the database using the SAME override-then-catalog logic
    // the order page displays from:
    //   effective price = drop_menu_items.price_override_pence (this drop)
    //                     ?? products/bundles.price_pence (catalog)
    //                     ?? 0
    // (mirrors order.html getDropMenuItems(): base_price_pence =
    //  row.price_override_pence ?? catalog.price_pence ?? 0). Bundle prices are
    // fixed at the bundle's effective price — choice selections never upcharge,
    // matching the client. payload.basket[*].unit_price_pence is now display-only
    // and is NEVER read for any charge calculation below.
    //
    // Overrides are keyed by the drop's is_available menu rows, exactly the set
    // the order page renders from, so an item the customer could not have seen
    // contributes no override and falls back to catalog price.
    const productOverride = new Map<string, number>();
    const bundleOverride = new Map<string, number>();
    {
      const { data: menuRows, error: menuErr } = await serviceClient
        .from("drop_menu_items")
        .select("menu_item_type, product_id, bundle_id, price_override_pence")
        .eq("drop_id", payload.drop_id)
        .eq("is_available", true);
      if (menuErr) return jsonResponse({ error: "Menu lookup failed" }, 500);
      for (const row of menuRows || []) {
        if (row.price_override_pence == null) continue; // null → use catalog price
        const override = Number(row.price_override_pence);
        if (!Number.isFinite(override) || override < 0) continue;
        if (row.menu_item_type === "product" && typeof row.product_id === "string") {
          productOverride.set(row.product_id, override);
        } else if (row.menu_item_type === "bundle" && typeof row.bundle_id === "string") {
          bundleOverride.set(row.bundle_id, override);
        }
      }
    }

    const effectivePriceFor = (item: BasketItem): number => {
      if (item.type === "product") {
        const ov = productOverride.get(item.product_id as string);
        if (ov !== undefined) return ov;
        return productMap.get(item.product_id as string)?.price_pence ?? 0;
      }
      const ov = bundleOverride.get(item.bundle_id as string);
      if (ov !== undefined) return ov;
      return bundleMap.get(item.bundle_id as string)?.price_pence ?? 0;
    };

    // Per-item server unit price, indexed to payload.basket. Reused for the
    // subtotal, the Stripe line items, and the order_items price snapshot so
    // all three are guaranteed to agree.
    const serverUnitPrice: number[] = payload.basket.map(effectivePriceFor);

    // Step 6.6 — product options (modifiers). The client sends only WHICH
    // option was chosen (group_id + option_id); the server alone decides HOW
    // MUCH each option costs, re-deriving the delta from
    // product_options.price_delta_pence and ignoring the display-only
    // price_delta_pence in the payload entirely. Each chosen option is checked
    // for tenancy (option -> group -> product) against THIS line's product, so
    // a customer cannot attach another product's — or another vendor's —
    // option to their line. The resolved delta is folded into
    // serverUnitPrice[i] BEFORE the subtotal is summed, so the subtotal, the
    // Step 7 total guard, the Stripe amount, the platform fee, and the
    // order_items price snapshot all inherit it automatically. Lines with no
    // option_selections are untouched (regression-safe).
    //
    // serverOptionSelections[i] holds the server-derived snapshot rows to
    // write into order_option_selections once each order_items id exists.
    const serverOptionSelections: ResolvedOption[][] = payload.basket.map(() => []);
    {
      const allOptionIds = Array.from(
        new Set(
          payload.basket.flatMap((item) =>
            (item.option_selections || []).map((o) => o.option_id)
          )
        )
      );
      if (allOptionIds.length > 0) {
        const { data: optionRows, error: optErr } = await serviceClient
          .from("product_options")
          .select("id, name, price_delta_pence, is_active, group_id")
          .in("id", allOptionIds);
        if (optErr) return jsonResponse({ error: "Option lookup failed" }, 500);

        const optionById = new Map<
          string,
          { name: string; price_delta_pence: number; is_active: boolean; group_id: string }
        >();
        for (const r of optionRows || []) {
          optionById.set(r.id as string, {
            name: String(r.name ?? ""),
            price_delta_pence: Number(r.price_delta_pence ?? 0),
            is_active: Boolean(r.is_active),
            group_id: String(r.group_id),
          });
        }

        const groupIds = Array.from(
          new Set(Array.from(optionById.values()).map((o) => o.group_id))
        );
        const groupById = new Map<string, { product_id: string; is_active: boolean }>();
        if (groupIds.length > 0) {
          const { data: groupRows, error: grpErr } = await serviceClient
            .from("product_option_groups")
            .select("id, product_id, is_active")
            .in("id", groupIds);
          if (grpErr) return jsonResponse({ error: "Option group lookup failed" }, 500);
          for (const g of groupRows || []) {
            groupById.set(g.id as string, {
              product_id: String(g.product_id),
              is_active: Boolean(g.is_active),
            });
          }
        }

        for (let i = 0; i < payload.basket.length; i++) {
          const item = payload.basket[i];
          const chosen = item.option_selections || [];
          if (chosen.length === 0) continue;

          // Options attach to products only. A non-product line carrying
          // option_selections is malformed — reject rather than silently drop.
          if (item.type !== "product" || !item.product_id) {
            return jsonResponse({ error: "Options can only be added to product items" }, 400);
          }

          let lineDelta = 0;
          for (const sel of chosen) {
            const option = optionById.get(sel.option_id);
            // Unknown or retired option — not resolvable, reject the order.
            if (!option || !option.is_active) {
              return jsonResponse({ error: "Basket contains an unknown or unavailable option" }, 400);
            }
            const group = groupById.get(option.group_id);
            if (!group || !group.is_active) {
              return jsonResponse({ error: "Basket contains an option from an unavailable group" }, 400);
            }
            // Tenancy: option -> group -> product must be THIS line's product.
            if (group.product_id !== item.product_id) {
              return jsonResponse({ error: "An option does not belong to the chosen product" }, 400);
            }
            // Integrity cross-check: the client's declared group_id must agree
            // with the option's real group. Never used for pricing.
            if (sel.group_id !== option.group_id) {
              return jsonResponse({ error: "An option does not match its declared group" }, 400);
            }

            // Server value only — the client's price_delta_pence is ignored.
            lineDelta += option.price_delta_pence;
            serverOptionSelections[i].push({
              option_id: sel.option_id,
              group_id: option.group_id,
              option_name: option.name,
              price_delta_pence: option.price_delta_pence,
            });
          }
          serverUnitPrice[i] += lineDelta;
        }
      }
    }

    // Step 7 — server total is the charge authority; the client's declared
    // total is only cross-checked against it. T3-13b — apply the matched
    // bulk-discount tier to the server-computed subtotal before comparing.
    // matchedTier and computedDiscount remain in scope for Step B (orders
    // insert) so the values can be persisted and forwarded to Stripe in 3.3.
    const computedSubtotal = payload.basket.reduce(
      (sum, item, i) => sum + serverUnitPrice[i] * item.quantity,
      0
    );
    const matchedTier = findMatchingTier(computedSubtotal, dropAreaRow?.discount_tiers ?? null);
    const computedDiscount = calculateDiscountPence(computedSubtotal, matchedTier);
    const deliveryPence = 0;  // matches client; delivery pricing not shipped
    const computedTotal = Math.max(0, computedSubtotal - computedDiscount + deliveryPence);

    if (computedTotal !== payload.totals.total_pence) {
      return jsonResponse(
        { error: "Total does not match basket — please refresh and try again" },
        400
      );
    }

    // Step 7.5 — T3-13 server-authoritative capacity computation.
    // Walk the basket in order, compute each item's capacity contribution
    // from the row data fetched in Step 5, and sum them according to the
    // drop's capacity_driver. From this point on, payload.totals.capacity_units
    // and per-item capacity_units are ignored — the schema validator still
    // accepts them for backward compatibility but they are not trusted.
    const capacityDriver = String(dropAreaRow.capacity_driver || "");
    const capacityCategorySet = new Set<string>(
      Array.isArray(dropAreaRow.capacity_categories)
        ? (dropAreaRow.capacity_categories as unknown[]).filter(
            (v): v is string => typeof v === "string"
          )
        : []
    );

    const serverItemCapacity: number[] = new Array(payload.basket.length).fill(0);
    for (let i = 0; i < payload.basket.length; i++) {
      const item = payload.basket[i];
      const row =
        item.type === "product"
          ? productMap.get(item.product_id as string)
          : bundleMap.get(item.bundle_id as string);
      if (!row || !row.counts_toward_capacity) {
        serverItemCapacity[i] = 0;
        continue;
      }
      if (capacityDriver === "by_order") {
        // Order contributes a single unit once, computed at total level below.
        serverItemCapacity[i] = 0;
        continue;
      }
      if (capacityDriver === "by_category") {
        if (!row.category_id || !capacityCategorySet.has(row.category_id)) {
          serverItemCapacity[i] = 0;
          continue;
        }
        serverItemCapacity[i] = row.capacity_weight * item.quantity;
        continue;
      }
      // Unknown driver — fall through as zero contribution. drops.capacity_driver
      // is NOT NULL with a constrained value set, so this branch should be unreachable.
      serverItemCapacity[i] = 0;
    }

    const totalOrderConsumption =
      capacityDriver === "by_order"
        ? 1
        : serverItemCapacity.reduce((sum, n) => sum + n, 0);

    // Step 8 — capacity enforcement now happens atomically inside the
    // create_order_atomic RPC (Section B below), which checks and reserves
    // capacity under a drop-row lock. The previous in-EF pre-check read
    // orders.pizzas non-atomically and could not prevent two customers
    // racing for the same last slot — that race is closed by the RPC.
    // totalOrderConsumption (Step 7.5, above) is passed into the RPC as the
    // incoming consumption for that check.

    // Stripe SDK init (verify secret present before any DB writes so we
    // fail fast — no orphan orders if Stripe is misconfigured).
    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecret) return jsonResponse({ error: "Stripe not configured" }, 500);
    const stripe = new Stripe(stripeSecret, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Hearth's take is computed from the server-derived total (which equals the
    // client total here — the Step 7 guard rejected any mismatch), never the
    // client's declared figure.
    const platformFeePct   = Number(vendor.platform_fee_pct ?? 0);
    const platformFeeFixed = Number(vendor.platform_fee_fixed_pence ?? 0);
    const rawFee = Math.round((computedTotal * platformFeePct) / 100) + platformFeeFixed;
    const platformFeePence = rawFee > 0 ? Math.min(rawFee, computedTotal - 1) : 0;   // Stripe requires fee < amount; 0 stays 0
    const capacityUnitsConsumed = Math.max(1, totalOrderConsumption);

    // Database writes — sequence with cleanup. No transactions over
    // PostgREST, so on any failure after the orders row is created we
    // mark it cancelled with a status event noting the cause; the
    // customer retries to get a fresh order.

    // A. Customer upsert (only when email present). Failure here aborts
    //    the function — no order is created.
    let customerId: string | null = null;
    if (payload.customer.email) {
      const { data: customerRow, error: custErr } = await serviceClient
        .from("customers")
        .upsert(
          {
            name: payload.customer.name,
            email: payload.customer.email,
            phone: payload.customer.phone,
            postcode: payload.customer.postcode,
          },
          { onConflict: "email", ignoreDuplicates: false }
        )
        .select("id")
        .single();
      if (custErr || !customerRow) {
        console.error("customer upsert failed", custErr);
        return jsonResponse({ error: "Customer record write failed" }, 500);
      }
      customerId = customerRow.id;

      const { error: relErr } = await serviceClient
        .from("customer_relationships")
        .upsert(
          {
            customer_id: customerId,
            owner_id: vendorId,
            owner_type: "vendor",
            consent_status: payload.customer.contact_opt_in ? "granted" : "pending",
            source: "order",
          },
          { onConflict: "customer_id,owner_id", ignoreDuplicates: false }
        );
      if (relErr) {
        console.error("customer relationship upsert failed", relErr);
        return jsonResponse({ error: "Customer relationship write failed" }, 500);
      }
    }

    // B. Insert orders row.
    const orderInsert: Record<string, unknown> = {
      drop_id: payload.drop_id,
      customer_name: payload.customer.name,
      customer_phone: payload.customer.phone,
      customer_email: payload.customer.email,
      customer_notes: payload.customer.notes,
      customer_postcode: payload.customer.postcode,
      customer_id: customerId,
      fulfilment_mode: payload.fulfilment.mode,
      delivery_address: payload.fulfilment.address,
      contact_opt_in: payload.customer.contact_opt_in,
      contact_opt_in_scope: payload.customer.contact_opt_in_scope,
      // Server-derived total (post-discount), not the client's declared value.
      total_pence: computedTotal,
      status: "pending_payment",
      stripe_payment_status: "pending",
      // Capacity hold deadline — matches the Stripe session expires_at below
      // (both from HOLD_WINDOW_SECONDS). After this, the reserved capacity is
      // reclaimed and the order is reconciled/expired.
      expires_at: new Date(Date.now() + HOLD_WINDOW_SECONDS * 1000).toISOString(),
      platform_fee_pence: platformFeePence,
      discount_pence: computedDiscount,
      discount_breakdown: matchedTier
        ? {
            threshold_pence: matchedTier.threshold_pence,
            discount_type: matchedTier.discount_type,
            discount_value: matchedTier.discount_value,
          }
        : null,
      // Legacy NOT NULL >= 1 column (see SCHEMA.md). Populate with
      // capacity units consumed, minimum 1, until formally migrated away.
      pizzas: capacityUnitsConsumed,
    };

    const { data: rpcResult, error: rpcErr } = await serviceClient.rpc(
      "create_order_atomic",
      {
        p_order: orderInsert,
        p_incoming_consumption: totalOrderConsumption,
      }
    );
    if (rpcErr) {
      console.error("create_order_atomic failed", rpcErr);
      return jsonResponse({ error: "Could not create order — please try again" }, 500);
    }
    if (!rpcResult?.ok) {
      if (rpcResult?.error === "capacity") {
        return jsonResponse(
          { error: "Not enough capacity remaining for this order — please refresh and try again" },
          400
        );
      }
      if (rpcResult?.error === "drop_not_found") {
        return jsonResponse({ error: "Drop not found" }, 404);
      }
      return jsonResponse({ error: "Could not create order — please try again" }, 400);
    }
    const orderId = rpcResult.order_id as string;

    // markCancelled — best-effort cleanup if a downstream step fails.
    // Customer sees the error and can retry; retry creates a fresh order.
    const markCancelled = async (note: string) => {
      try {
        await serviceClient
          .from("orders")
          .update({ status: "cancelled", stripe_payment_status: "failed" })
          .eq("id", orderId);
        await serviceClient.from("order_status_events").insert({
          order_id: orderId,
          drop_id: payload.drop_id,
          from_status: "pending_payment",
          to_status: "cancelled",
          event_type: "status_change",
          actor: `create-order:${note}`,
          actor_type: "system",
        });
      } catch (cleanupErr) {
        console.error("cleanup after order failure failed", cleanupErr);
      }
    };

    // C. Insert order_items. Capture each id for D and D.5.
    const insertedItemIds: {
      id: string;
      selections: BasketSelection[];
      optionSelections: ResolvedOption[];
    }[] = [];
    for (let i = 0; i < payload.basket.length; i++) {
      const item = payload.basket[i];
      const { data: itemRow, error: itemErr } = await serviceClient
        .from("order_items")
        .insert({
          order_id: orderId,
          item_type: item.type,
          product_id: item.type === "product" ? item.product_id : null,
          bundle_id: item.type === "bundle" ? item.bundle_id : null,
          item_name_snapshot: item.name,
          qty: item.quantity,
          // Server-derived effective price, not the client's declared value.
          price_pence: serverUnitPrice[i],
          capacity_units_snapshot: serverItemCapacity[i],
        })
        .select("id")
        .single();
      if (itemErr || !itemRow) {
        console.error("order_items insert failed", itemErr);
        await markCancelled("order_items_insert_failed");
        return jsonResponse({ error: "Order item write failed" }, 500);
      }
      insertedItemIds.push({
        id: itemRow.id as string,
        selections: item.selections || [],
        optionSelections: serverOptionSelections[i],
      });
    }

    // D. Insert order_item_selections for bundle items.
    for (const { id: orderItemId, selections } of insertedItemIds) {
      if (!selections.length) continue;
      const { error: selErr } = await serviceClient
        .from("order_item_selections")
        .insert(
          selections.map((s) => ({
            order_item_id: orderItemId,
            bundle_line_id: s.bundle_line_id,
            selected_product_id: s.selected_product_id,
            quantity: s.quantity,
          }))
        );
      if (selErr) {
        console.error("order_item_selections insert failed", selErr);
        await markCancelled("order_item_selections_insert_failed");
        return jsonResponse({ error: "Order selection write failed" }, 500);
      }
    }

    // D.5 — Insert order_option_selections for chosen product options. The
    // snapshot columns record the SERVER-derived name and delta at charge time
    // (product_options.name / price_delta_pence), never the client's display
    // values — the same snapshot discipline as order_items.price_pence.
    for (const { id: orderItemId, optionSelections } of insertedItemIds) {
      if (!optionSelections.length) continue;
      const { error: optSelErr } = await serviceClient
        .from("order_option_selections")
        .insert(
          optionSelections.map((o) => ({
            order_item_id: orderItemId,
            option_id: o.option_id,
            group_id: o.group_id,
            option_name_snapshot: o.option_name,
            price_delta_pence_snapshot: o.price_delta_pence,
          }))
        );
      if (optSelErr) {
        console.error("order_option_selections insert failed", optSelErr);
        await markCancelled("order_option_selections_insert_failed");
        return jsonResponse({ error: "Order option write failed" }, 500);
      }
    }

    // E. Insert order_status_events row recording the initial state.
    const { error: eventErr } = await serviceClient.from("order_status_events").insert({
      order_id: orderId,
      drop_id: payload.drop_id,
      from_status: null,
      to_status: "pending_payment",
      event_type: "status_change",
      actor: "create-order",
      actor_type: "system",
    });
    if (eventErr) {
      console.error("order_status_events insert failed", eventErr);
      await markCancelled("status_event_insert_failed");
      return jsonResponse({ error: "Order status event write failed" }, 500);
    }

    // Stripe Checkout session.
    const dropSlug = String(dropSummary.slug || "");
    const successUrl =
      `https://lovehearth.co.uk/order-confirmation.html?order_id=${encodeURIComponent(orderId)}` +
      `&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl =
      `https://lovehearth.co.uk/order.html?drop=${encodeURIComponent(dropSlug)}` +
      `&checkout_cancelled=1&order_id=${encodeURIComponent(orderId)}` +
      `&session_id={CHECKOUT_SESSION_ID}`;

    // T3-13b — create a one-off Stripe coupon when a discount was matched.
    // Stripe applies the discount on its side, preserving the line-item
    // breakdown. application_fee_amount is unchanged because total_pence
    // is already post-discount (Step 7 guard).
    let coupon: Stripe.Coupon | null = null;
    if (computedDiscount > 0) {
      try {
        coupon = await stripe.coupons.create({
          amount_off: computedDiscount,
          currency: "gbp",
          duration: "once",
          max_redemptions: 1,
          name: "Volume discount",
        });
      } catch (couponErr) {
        console.error("stripe coupon create failed", couponErr);
        await markCancelled("stripe_coupon_create_failed");
        return jsonResponse({ error: "Could not apply discount — please try again" }, 502);
      }
    }

    let session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        // Stripe's documented minimum for expires_at is 1800 seconds
        // (30 minutes) from Checkout Session creation. Below 1800 the
        // API rejects with an invalid_request_error. HOLD_WINDOW_SECONDS
        // single-sources this with the order row's expires_at above.
        expires_at: Math.floor(Date.now() / 1000) + HOLD_WINDOW_SECONDS,
        customer_email: payload.customer.email || undefined,
        billing_address_collection: "auto",
        line_items: payload.basket.map((item, i) => ({
          price_data: {
            currency: "gbp",
            product_data: { name: item.name },
            // Server-derived effective price, not the client's declared value.
            unit_amount: serverUnitPrice[i],
          },
          quantity: item.quantity,
        })),
        discounts: coupon ? [{ coupon: coupon.id }] : undefined,
        payment_intent_data: {
          application_fee_amount: platformFeePence,
          transfer_data: { destination: vendor.stripe_account_id! },
          metadata: {
            order_id: orderId,
            drop_id: payload.drop_id,
            vendor_id: vendorId,
          },
        },
        metadata: {
          order_id: orderId,
          drop_id: payload.drop_id,
          vendor_id: vendorId,
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
    } catch (stripeErr) {
      console.error("stripe checkout session create failed", stripeErr);
      await markCancelled("stripe_session_create_failed");
      return jsonResponse({ error: "Could not start payment — please try again" }, 502);
    }

    // Final write — stamp the order with the session id so the webhook
    // can find it later. If this fails, the session is live but
    // unrecoverable — mark the order cancelled and ask the customer to retry.
    const { error: stampErr } = await serviceClient
      .from("orders")
      .update({ stripe_session_id: session.id })
      .eq("id", orderId);
    if (stampErr) {
      console.error("orders.stripe_session_id stamp failed", stampErr);
      await markCancelled("session_id_stamp_failed");
      return jsonResponse({ error: "Could not link order to payment — please try again" }, 500);
    }

    return jsonResponse({ order_id: orderId, checkout_url: session.url }, 200);
  } catch (err) {
    console.error("create-order unexpected error", err);
    return jsonResponse({ error: (err as Error).message || "Internal error" }, 500);
  }
});
