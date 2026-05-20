import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    let body: { drop_id?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { drop_id } = body;
    if (!drop_id) return jsonResponse({ error: "drop_id is required" }, 400);
    if (!UUID_REGEX.test(drop_id)) {
      return jsonResponse({ error: "drop_id must be a UUID" }, 400);
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: vendor, error: vendorError } = await serviceClient
      .from("vendors")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (vendorError) {
      return jsonResponse({ error: "Vendor lookup failed" }, 500);
    }
    if (!vendor) {
      return jsonResponse({ error: "Vendor not found or not owned by user" }, 403);
    }

    const { data, error } = await serviceClient
      .from("drops")
      .select("*")
      .eq("id", drop_id)
      .eq("vendor_id", vendor.id)
      .maybeSingle();

    if (error) return jsonResponse({ error: error.message }, 500);
    if (!data) return jsonResponse({ error: "Drop not found" }, 404);

    // T5-A14: additively return the drop's v_drop_summary row,
    // scoped by the drop_id already resolved and ownership-verified
    // above. Operator pages currently read v_drop_summary directly
    // via the anon-effective client (operational learning #52); this
    // is the secured-read replacement. Full row, not a hand-picked
    // subset, because all three single-drop callers use select('*')
    // and a subset risks missing-column regressions. Failures here
    // are non-fatal — summary becomes null and existing consumers
    // are unaffected.
    const { data: summary, error: summaryError } = await serviceClient
      .from("v_drop_summary")
      .select("*")
      .eq("drop_id", drop_id)
      .maybeSingle();
    if (summaryError) {
      console.error("v_drop_summary lookup failed", summaryError);
    }

    // Operator-read-auth Slice 1: additively return the owned drop's
    // order pipeline using the same service-role client and the same
    // resolved, ownership-verified drop_id. Mirrors the v_drop_summary
    // pattern above — non-fatal on query error so existing consumers
    // are unaffected.
    const { data: ordersSummary, error: ordersSummaryError } = await serviceClient
      .from("v_drop_orders_summary")
      .select("*")
      .eq("drop_id", drop_id)
      .order("created_at", { ascending: true });
    if (ordersSummaryError) {
      console.error("v_drop_orders_summary lookup failed", ordersSummaryError);
    }

    // Replicate the Service Board fallback chain
    // (v_order_item_detail_expanded -> v_order_item_detail_v2 ->
    // v_order_item_detail). Use whichever succeeds. All failures
    // non-fatal: order_items becomes [] and order_items_source null.
    let orderItems: unknown[] | null = null;
    let orderItemsSource: "expanded" | "v2" | "legacy" | null = null;

    const expanded = await serviceClient
      .from("v_order_item_detail_expanded")
      .select("*")
      .eq("drop_id", drop_id)
      .order("created_at", { ascending: true });
    if (!expanded.error) {
      orderItems = expanded.data ?? [];
      orderItemsSource = "expanded";
    } else {
      console.error("v_order_item_detail_expanded lookup failed", expanded.error);
      const v2 = await serviceClient
        .from("v_order_item_detail_v2")
        .select("*")
        .eq("drop_id", drop_id)
        .order("created_at", { ascending: true });
      if (!v2.error) {
        orderItems = v2.data ?? [];
        orderItemsSource = "v2";
      } else {
        console.error("v_order_item_detail_v2 lookup failed", v2.error);
        const legacy = await serviceClient
          .from("v_order_item_detail")
          .select("*")
          .eq("drop_id", drop_id)
          .order("created_at", { ascending: true });
        if (!legacy.error) {
          orderItems = legacy.data ?? [];
          orderItemsSource = "legacy";
        } else {
          console.error("v_order_item_detail lookup failed", legacy.error);
        }
      }
    }

    // Operator-read-auth Slice 7a: additively return the owned drop's
    // item sales and drop-scoped orders for the Scorecard. Same
    // service-role client and same resolved, ownership-verified
    // drop_id. Non-fatal on query error so existing consumers are
    // unaffected.
    let itemSales: unknown[] = [];
    try {
      const { data: itemSalesData, error: itemSalesError } = await serviceClient
        .from("v_item_sales")
        .select("*")
        .eq("drop_id", drop_id);
      if (!itemSalesError && Array.isArray(itemSalesData)) itemSales = itemSalesData;
      if (itemSalesError) console.error("v_item_sales lookup failed", itemSalesError);
    } catch (e) {
      console.error("v_item_sales threw", e);
    }

    let dropOrders: unknown[] = [];
    try {
      const { data: dropOrdersData, error: dropOrdersError } = await serviceClient
        .from("orders")
        .select("*")
        .eq("drop_id", drop_id);
      if (!dropOrdersError && Array.isArray(dropOrdersData)) dropOrders = dropOrdersData;
      if (dropOrdersError) console.error("orders by drop_id lookup failed", dropOrdersError);
    } catch (e) {
      console.error("orders by drop_id threw", e);
    }

    return jsonResponse({
      ...data,
      summary: summary ?? null,
      orders_summary: ordersSummary ?? [],
      order_items: orderItems ?? [],
      order_items_source: orderItemsSource ?? null,
      item_sales: itemSales,
      drop_orders: dropOrders,
    }, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
