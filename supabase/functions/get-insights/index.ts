import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// get-insights — operator-read-auth Slice 3.
//
// Folds the five in-scope direct anon reads from insights.html's
// loadData() Promise.all (and the subsequent orders read derived from
// dropIds) into a single JWT-authenticated, vendor-scoped Edge
// Function. Mirrors get-home-dashboard's auth/vendor-resolution pattern
// exactly: verify the caller via auth.getUser(), resolve vendor_id
// from vendors.auth_user_id, then run each query with a service-role
// client (which legitimately bypasses RLS) using the resolved
// vendor_id. Rows are returned verbatim under one top-level key per
// source, mirroring get-home-dashboard's non-fatal style (a query
// error logs and returns [] for that key — never throws).
//
// Source-of-truth for query shape: insights.html lines 1083-1086 (the
// four Promise.all reads) and lines 1097-1104 (the orders read). The
// page wraps each read in fetchAllPages() which loops .range() in
// 1000-row chunks until a short page is seen; that loop is replicated
// server-side so the full set is returned in one response, preserving
// existing page behaviour. The orders query mirrors
// get-home-dashboard's pattern of resolving vendorDropIds server-side
// from the drops table rather than relying on the client-side
// v_hearth_drop_stats.drop_id list — same set, fetched once.

const PAGE_SIZE = 1000;

async function fetchAllPages<T>(
  queryFactory: () => { range: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }> }
): Promise<{ data: T[]; error: unknown }> {
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await queryFactory().range(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows, error };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { data: rows, error: null };
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

    // 1. v_hearth_drop_stats — replicates insights.html:1083
    //    fetchAllPages(() => sb.from('v_hearth_drop_stats').select('*')
    //      .eq('vendor_id', vendorId).order('delivery_start', { ascending:false }))
    const { data: hearth_drop_stats, error: hearthDropStatsError } = await fetchAllPages(() =>
      serviceClient
        .from("v_hearth_drop_stats")
        .select("*")
        .eq("vendor_id", vendor.id)
        .order("delivery_start", { ascending: false })
    );
    if (hearthDropStatsError) {
      console.error("v_hearth_drop_stats lookup failed", hearthDropStatsError);
    }

    // 2. v_hearth_revenue_over_time — replicates insights.html:1084
    //    fetchAllPages(() => sb.from('v_hearth_revenue_over_time').select('*')
    //      .eq('vendor_id', vendorId).order('order_date', { ascending:true }))
    const { data: hearth_revenue_over_time, error: hearthRevenueError } = await fetchAllPages(() =>
      serviceClient
        .from("v_hearth_revenue_over_time")
        .select("*")
        .eq("vendor_id", vendor.id)
        .order("order_date", { ascending: true })
    );
    if (hearthRevenueError) {
      console.error("v_hearth_revenue_over_time lookup failed", hearthRevenueError);
    }

    // 3. v_item_sales — replicates insights.html:1085
    //    fetchAllPages(() => sb.from('v_item_sales').select('*')
    //      .eq('vendor_id', vendorId))
    const { data: item_sales, error: itemSalesError } = await fetchAllPages(() =>
      serviceClient
        .from("v_item_sales")
        .select("*")
        .eq("vendor_id", vendor.id)
    );
    if (itemSalesError) {
      console.error("v_item_sales lookup failed", itemSalesError);
    }

    // 4. v_host_performance — replicates insights.html:1086
    //    fetchAllPages(() => sb.from('v_host_performance').select('*')
    //      .eq('vendor_id', vendorId))
    const { data: host_performance, error: hostPerformanceError } = await fetchAllPages(() =>
      serviceClient
        .from("v_host_performance")
        .select("*")
        .eq("vendor_id", vendor.id)
    );
    if (hostPerformanceError) {
      console.error("v_host_performance lookup failed", hostPerformanceError);
    }

    // 5. orders — replicates insights.html:1097-1104
    //    Client-side derived dropIds from v_hearth_drop_stats.drop_id, then
    //    .select('id, drop_id, created_at').in('drop_id', dropIds)
    //    .order('created_at', { ascending:true }). Server-side equivalent:
    //    resolve vendor drop ids once from the drops table (mirrors
    //    get-home-dashboard), then run the same orders filter.
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
      const { data: ordersData, error: ordersError } = await fetchAllPages(() =>
        serviceClient
          .from("orders")
          .select("id, drop_id, created_at")
          .in("drop_id", vendorDropIds)
          .order("created_at", { ascending: true })
      );
      if (ordersError) {
        console.error("orders lookup failed", ordersError);
      }
      orders = ordersData ?? [];
    }

    return jsonResponse({
      hearth_drop_stats: hearth_drop_stats ?? [],
      hearth_revenue_over_time: hearth_revenue_over_time ?? [],
      item_sales: item_sales ?? [],
      host_performance: host_performance ?? [],
      orders,
    }, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
