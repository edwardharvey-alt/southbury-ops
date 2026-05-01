import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Anonymous read for the customer's own order. Authorization is by
// matched pair: the request must provide both order_id and session_id,
// and they must point at the same orders row. Without the matching
// session_id (which only the order owner has via Stripe's redirect
// URL) the function returns 404 — this prevents enumeration attacks
// where someone guesses order_ids.
//
// verify_jwt = false. Customer flow has no authenticated user; the
// matched pair is the only authorization signal.
//
// Response surface is deliberately minimal — only the fields needed
// to render the order-confirmation page. customer_email,
// customer_phone, customer_id, contact_opt_in, platform_fee_pence and
// other internals are intentionally not returned.

type Payload = {
  order_id: string;
  session_id: string;
};

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function validatePayload(body: unknown): { ok: true; data: Payload } | { ok: false; reason: string } {
  if (!body || typeof body !== "object") return { ok: false, reason: "Body must be a JSON object" };
  const b = body as Record<string, unknown>;
  if (!isUuid(b.order_id)) return { ok: false, reason: "order_id must be a uuid" };
  if (typeof b.session_id !== "string" || !b.session_id.trim()) {
    return { ok: false, reason: "session_id must be a non-empty string" };
  }
  return { ok: true, data: { order_id: b.order_id, session_id: b.session_id } };
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

    const parsed = validatePayload(raw);
    if (!parsed.ok) return jsonResponse({ error: parsed.reason }, 400);
    const { order_id, session_id } = parsed.data;

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Step 1 — order by matched pair. Service-role client skips RLS;
    // the matched pair on (id, stripe_session_id) is the only auth.
    const { data: order, error: orderErr } = await serviceClient
      .from("orders")
      .select(
        "id, status, stripe_payment_status, customer_name, customer_postcode, fulfilment_mode, delivery_address, total_pence, created_at, drop_id"
      )
      .eq("id", order_id)
      .eq("stripe_session_id", session_id)
      .maybeSingle();

    if (orderErr) {
      console.error("order lookup failed", orderErr);
      return jsonResponse({ error: "Order lookup failed" }, 500);
    }
    if (!order) return jsonResponse({ error: "Order not found" }, 404);

    // Step 2 — order_items.
    const { data: items, error: itemsErr } = await serviceClient
      .from("order_items")
      .select("id, item_name_snapshot, qty, price_pence, item_type, capacity_units_snapshot")
      .eq("order_id", order_id)
      .order("created_at", { ascending: true });
    if (itemsErr) {
      console.error("order_items lookup failed", itemsErr);
      return jsonResponse({ error: "Order items lookup failed" }, 500);
    }

    // Step 3 — selections for bundle items, joined to products for the
    // selected product name (avoids a second round-trip on the client).
    const itemIds = (items || []).map((i) => i.id as string);
    let selectionsByItemId: Record<string, Array<{ bundle_line_id: string; selected_product_name: string | null; quantity: number }>> = {};
    if (itemIds.length > 0) {
      const { data: selections, error: selErr } = await serviceClient
        .from("order_item_selections")
        .select("order_item_id, bundle_line_id, quantity, selected_product_id, products:selected_product_id ( name )")
        .in("order_item_id", itemIds);
      if (selErr) {
        console.error("order_item_selections lookup failed", selErr);
        return jsonResponse({ error: "Order selections lookup failed" }, 500);
      }
      for (const s of selections || []) {
        const oid = s.order_item_id as string;
        if (!selectionsByItemId[oid]) selectionsByItemId[oid] = [];
        const productName =
          s.products && typeof s.products === "object" && !Array.isArray(s.products)
            ? ((s.products as { name?: string }).name ?? null)
            : null;
        selectionsByItemId[oid].push({
          bundle_line_id: s.bundle_line_id as string,
          selected_product_name: productName,
          quantity: Number(s.quantity ?? 1),
        });
      }
    }

    // Step 4 — drop.
    const { data: drop, error: dropErr } = await serviceClient
      .from("drops")
      .select(
        "id, slug, name, opens_at, closes_at, fulfilment_mode, collection_point_description, delivery_area_description, vendor_id, host_id"
      )
      .eq("id", order.drop_id)
      .maybeSingle();
    if (dropErr) {
      console.error("drop lookup failed", dropErr);
      return jsonResponse({ error: "Drop lookup failed" }, 500);
    }
    if (!drop) return jsonResponse({ error: "Drop not found" }, 404);

    // Step 5 — vendor (customer-visible fields only).
    const { data: vendor, error: vendorErr } = await serviceClient
      .from("vendors")
      .select("id, name, display_name, website_url, powered_by_hearth_visible")
      .eq("id", drop.vendor_id)
      .maybeSingle();
    if (vendorErr) {
      console.error("vendor lookup failed", vendorErr);
      return jsonResponse({ error: "Vendor lookup failed" }, 500);
    }
    if (!vendor) return jsonResponse({ error: "Vendor not found" }, 404);

    // Step 6 — host (optional).
    let host: { id: string; name: string } | null = null;
    if (drop.host_id) {
      const { data: hostRow, error: hostErr } = await serviceClient
        .from("hosts")
        .select("id, name")
        .eq("id", drop.host_id)
        .maybeSingle();
      if (hostErr) {
        console.error("host lookup failed", hostErr);
        return jsonResponse({ error: "Host lookup failed" }, 500);
      }
      if (hostRow) host = { id: hostRow.id as string, name: hostRow.name as string };
    }

    return jsonResponse(
      {
        order: {
          id: order.id,
          status: order.status,
          stripe_payment_status: order.stripe_payment_status,
          customer_name: order.customer_name,
          customer_postcode: order.customer_postcode,
          fulfilment_mode: order.fulfilment_mode,
          delivery_address: order.delivery_address,
          total_pence: order.total_pence,
          created_at: order.created_at,
        },
        items: (items || []).map((item) => ({
          id: item.id,
          item_name_snapshot: item.item_name_snapshot,
          qty: item.qty,
          price_pence: item.price_pence,
          item_type: item.item_type,
          capacity_units_snapshot: item.capacity_units_snapshot,
          selections: selectionsByItemId[item.id as string] || [],
        })),
        drop: {
          id: drop.id,
          slug: drop.slug,
          name: drop.name,
          opens_at: drop.opens_at,
          closes_at: drop.closes_at,
          fulfilment_mode: drop.fulfilment_mode,
          collection_point_description: drop.collection_point_description,
          delivery_area_description: drop.delivery_area_description,
        },
        vendor: {
          id: vendor.id,
          name: vendor.name,
          display_name: vendor.display_name,
          website_url: vendor.website_url,
          powered_by_hearth_visible: vendor.powered_by_hearth_visible,
        },
        host,
      },
      200
    );
  } catch (err) {
    console.error("fetch-order unexpected error", err);
    return jsonResponse({ error: (err as Error).message || "Internal error" }, 500);
  }
});
