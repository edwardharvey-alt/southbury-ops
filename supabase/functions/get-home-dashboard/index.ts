import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// get-home-dashboard — operator-read-auth Slice 2.
//
// Folds the six in-scope direct anon reads from home.html's dashboard
// load Promise.all into a single JWT-authenticated, vendor-scoped Edge
// Function. Mirrors list-drops' auth/vendor-resolution pattern
// exactly: verify the caller via auth.getUser(), resolve vendor_id
// from vendors.auth_user_id, then run each query with a service-role
// client (which legitimately bypasses RLS) using the resolved
// vendor_id. Rows are returned verbatim under one top-level key per
// source, mirroring get-drop's non-fatal style (a query error logs
// and returns [] or null for that key — never throws).
//
// Source-of-truth for query shape: home.html lines 1216-1221 (the
// six direct anon reads). The orders query replicates the
// client-side pattern of deriving vendorDropIds from the vendor's
// drops list, then filtering orders by drop_id — same shape, just
// resolved once server-side instead of via a nested list-drops
// invoke.
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

    // 1. v_hearth_summary — replicates home.html:1216
    //    .from('v_hearth_summary').select('*').eq('vendor_id', vendorId).maybeSingle()
    const { data: hearth_summary, error: hearthSummaryError } = await serviceClient
      .from("v_hearth_summary")
      .select("*")
      .eq("vendor_id", vendor.id)
      .maybeSingle();
    if (hearthSummaryError) {
      console.error("v_hearth_summary lookup failed", hearthSummaryError);
    }

    // 2. v_hearth_drop_stats — replicates home.html:1217
    //    .from('v_hearth_drop_stats').select('*').eq('vendor_id', vendorId)
    //    .order('delivery_start', { ascending: false })
    const { data: hearth_drop_stats, error: hearthDropStatsError } = await serviceClient
      .from("v_hearth_drop_stats")
      .select("*")
      .eq("vendor_id", vendor.id)
      .order("delivery_start", { ascending: false });
    if (hearthDropStatsError) {
      console.error("v_hearth_drop_stats lookup failed", hearthDropStatsError);
    }

    // 3. customer_relationships — replicates home.html:1218
    //    Polymorphic owner_id + owner_type, NOT vendor_id (operational
    //    learning #6). Embedded customers fields verbatim.
    const { data: customer_relationships, error: customerRelationshipsError } = await serviceClient
      .from("customer_relationships")
      .select("*, customers(name, email, postcode, phone)")
      .eq("owner_id", vendor.id)
      .eq("owner_type", "vendor");
    if (customerRelationshipsError) {
      console.error("customer_relationships lookup failed", customerRelationshipsError);
    }

    // 4. orders — replicates home.html:1219
    //    Client-side derived vendorDropIds via a nested list-drops invoke,
    //    then .in('drop_id', vendorDropIds). Server-side equivalent: list
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

    // 5. v_item_sales — replicates home.html:1220
    //    .from('v_item_sales').select('*').eq('vendor_id', vendorId)
    const { data: item_sales, error: itemSalesError } = await serviceClient
      .from("v_item_sales")
      .select("*")
      .eq("vendor_id", vendor.id);
    if (itemSalesError) {
      console.error("v_item_sales lookup failed", itemSalesError);
    }

    // 6. v_host_performance — replicates home.html:1221
    //    .from('v_host_performance').select('*').eq('vendor_id', vendorId)
    const { data: host_performance, error: hostPerformanceError } = await serviceClient
      .from("v_host_performance")
      .select("*")
      .eq("vendor_id", vendor.id);
    if (hostPerformanceError) {
      console.error("v_host_performance lookup failed", hostPerformanceError);
    }

    return jsonResponse({
      hearth_summary: hearth_summary ?? null,
      hearth_drop_stats: hearth_drop_stats ?? [],
      customer_relationships: customer_relationships ?? [],
      orders,
      item_sales: item_sales ?? [],
      host_performance: host_performance ?? [],
    }, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
