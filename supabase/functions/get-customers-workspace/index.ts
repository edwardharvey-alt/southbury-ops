import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// get-customers-workspace — operator-read-auth Slice 4.
//
// Folds the five in-scope direct anon reads from customers.html's
// loadData() + renderRecommendations() into a single JWT-authenticated,
// vendor-scoped Edge Function. Mirrors get-home-dashboard's
// auth/vendor-resolution pattern exactly: verify the caller via
// auth.getUser(), resolve vendor_id from vendors.auth_user_id, then
// run each query with a service-role client (which legitimately
// bypasses RLS) using the resolved vendor_id. Rows are returned
// verbatim under one top-level key per source, mirroring
// get-home-dashboard's non-fatal style (a query error logs and
// returns [] for that key — never throws).
//
// Source-of-truth for query shape: customers.html lines 730-734
// (customer_relationships), 748 (orders), 830-832 (the three
// intelligence-view reads). The orders query mirrors
// get-home-dashboard's pattern of resolving vendorDropIds server-side
// from the drops table — same set, fetched once.
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

    // 1. customer_relationships — replicates customers.html:730-734
    //    Polymorphic owner_id + owner_type, NOT vendor_id (operational
    //    learning #6). Embedded customers fields verbatim
    //    (name, email, postcode, phone).
    const { data: customer_relationships, error: customerRelationshipsError } = await serviceClient
      .from("customer_relationships")
      .select("*, customers(name, email, postcode, phone)")
      .eq("owner_id", vendor.id)
      .eq("owner_type", "vendor");
    if (customerRelationshipsError) {
      console.error("customer_relationships lookup failed", customerRelationshipsError);
    }

    // 2. orders — replicates customers.html:742-748
    //    Client-side derived vendorDropIds via .from('drops').select('id'),
    //    then .from('orders').select('customer_email, created_at')
    //    .in('drop_id', vendorDropIds). Server-side equivalent: list
    //    the vendor's drop IDs once, then run the same orders filter.
    const { data: vendorDrops, error: vendorDropsError } = await serviceClient
      .from("drops")
      .select("id")
      .eq("vendor_id", vendor.id);
    if (vendorDropsError) {
      console.error("drops lookup (for orders) failed", vendorDropsError);
    }
    const vendorDropIds = (vendorDrops ?? []).map((d: { id: string }) => d.id);
    let orders: unknown[] = [];
    if (vendorDropIds.length > 0) {
      const { data: ordersData, error: ordersError } = await serviceClient
        .from("orders")
        .select("customer_email, created_at")
        .in("drop_id", vendorDropIds);
      if (ordersError) {
        console.error("orders lookup failed", ordersError);
      }
      orders = ordersData ?? [];
    }

    // 3. v_hearth_drop_stats — replicates customers.html:830
    //    sb.from('v_hearth_drop_stats').select('*').eq('vendor_id', vendorId)
    const { data: hearth_drop_stats, error: hearthDropStatsError } = await serviceClient
      .from("v_hearth_drop_stats")
      .select("*")
      .eq("vendor_id", vendor.id);
    if (hearthDropStatsError) {
      console.error("v_hearth_drop_stats lookup failed", hearthDropStatsError);
    }

    // 4. v_item_sales — replicates customers.html:831
    //    sb.from('v_item_sales').select('*').eq('vendor_id', vendorId)
    const { data: item_sales, error: itemSalesError } = await serviceClient
      .from("v_item_sales")
      .select("*")
      .eq("vendor_id", vendor.id);
    if (itemSalesError) {
      console.error("v_item_sales lookup failed", itemSalesError);
    }

    // 5. v_host_performance — replicates customers.html:832
    //    sb.from('v_host_performance').select('*').eq('vendor_id', vendorId)
    const { data: host_performance, error: hostPerformanceError } = await serviceClient
      .from("v_host_performance")
      .select("*")
      .eq("vendor_id", vendor.id);
    if (hostPerformanceError) {
      console.error("v_host_performance lookup failed", hostPerformanceError);
    }

    return jsonResponse({
      customer_relationships: customer_relationships ?? [],
      orders,
      hearth_drop_stats: hearth_drop_stats ?? [],
      item_sales: item_sales ?? [],
      host_performance: host_performance ?? [],
    }, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
