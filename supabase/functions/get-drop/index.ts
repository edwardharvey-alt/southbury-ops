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

    // Stage 5 (product options display): line-level order items for the
    // Service Board's per-order kitchen ticket. The existing item source above
    // (v_order_item_detail_expanded, returned as `order_items`) is EXPLODED
    // (one row per product, bundles flattened) and carries no order_item_id, so
    // a chosen product option cannot be reliably attached to it — order_id +
    // product_id is ambiguous when a customer orders two of the same product
    // with different options. This ADDITIVE projection returns base order_items
    // (carrying id), enriched with the category_id/capacity_units the board's
    // classifier needs, plus each line's chosen options and bundle selections
    // keyed by order_item_id. The exploded source above is untouched — the
    // production/prep aggregates keep reading it, so bundle-component counts are
    // preserved exactly. Non-fatal throughout: on any failure this stays [] and
    // the board falls back to its existing (exploded, option-less) behaviour.
    let orderItemLines: unknown[] = [];
    try {
      const orderIds = (dropOrders as Array<{ id?: string }>)
        .map((o) => o.id)
        .filter((id): id is string => Boolean(id));

      if (orderIds.length > 0) {
        const { data: baseItems, error: baseErr } = await serviceClient
          .from("order_items")
          .select(
            "id, order_id, item_type, product_id, bundle_id, item_name_snapshot, qty, capacity_units_snapshot, created_at"
          )
          .in("order_id", orderIds)
          .order("created_at", { ascending: true });

        if (baseErr) {
          console.error("order_items (line-level) lookup failed", baseErr);
        } else {
          const lines = baseItems ?? [];
          const lineIds = lines.map((r: Record<string, unknown>) => r.id as string);

          // Enrich product lines with category_id + capacity_units so the
          // board's isCapacityItem() classifies line-level rows exactly as it
          // does the enriched exploded rows (mirrors the client-side
          // enrichItemDetailsWithProductData, done server-side here). Bundle
          // lines have no product_id and fall back to capacity_units_snapshot.
          const productIds = [
            ...new Set(
              lines
                .filter((r: Record<string, unknown>) => r.product_id)
                .map((r: Record<string, unknown>) => String(r.product_id))
            ),
          ];
          const productMap = new Map<
            string,
            { category_id: string | null; capacity_units: number | null }
          >();
          if (productIds.length > 0) {
            const { data: prods, error: prodErr } = await serviceClient
              .from("products")
              .select("id, category_id, capacity_units")
              .in("id", productIds);
            if (prodErr) console.error("products enrich lookup failed", prodErr);
            for (const p of prods ?? []) {
              const row = p as Record<string, unknown>;
              productMap.set(String(row.id), {
                category_id: (row.category_id as string | null) ?? null,
                capacity_units: (row.capacity_units as number | null) ?? null,
              });
            }
          }

          // Chosen product options (modifiers) per line — snapshot name only.
          const optionsByItem: Record<string, Array<{ option_name_snapshot: string }>> = {};
          // Bundle choice selections per line — mirrors fetch-order's join.
          const selectionsByItem: Record<
            string,
            Array<{
              bundle_line_label: string | null;
              selected_product_name: string | null;
              quantity: number;
            }>
          > = {};

          if (lineIds.length > 0) {
            const { data: optRows, error: optErr } = await serviceClient
              .from("order_option_selections")
              .select("order_item_id, option_name_snapshot")
              .in("order_item_id", lineIds);
            if (optErr) console.error("order_option_selections (board) lookup failed", optErr);
            for (const o of optRows ?? []) {
              const row = o as Record<string, unknown>;
              const oid = row.order_item_id as string;
              (optionsByItem[oid] ||= []).push({
                option_name_snapshot: (row.option_name_snapshot as string) ?? "",
              });
            }

            const { data: selRows, error: selErr } = await serviceClient
              .from("order_item_selections")
              .select(
                "order_item_id, quantity, products:selected_product_id ( name ), bundle_lines:bundle_line_id ( label )"
              )
              .in("order_item_id", lineIds);
            if (selErr) console.error("order_item_selections (board) lookup failed", selErr);
            for (const s of selRows ?? []) {
              const row = s as Record<string, unknown>;
              const oid = row.order_item_id as string;
              const prod = row.products;
              const bl = row.bundle_lines;
              (selectionsByItem[oid] ||= []).push({
                bundle_line_label:
                  bl && typeof bl === "object" && !Array.isArray(bl)
                    ? ((bl as { label?: string }).label ?? null)
                    : null,
                selected_product_name:
                  prod && typeof prod === "object" && !Array.isArray(prod)
                    ? ((prod as { name?: string }).name ?? null)
                    : null,
                quantity: Number((row.quantity as number) ?? 1),
              });
            }
          }

          orderItemLines = lines.map((r: Record<string, unknown>) => {
            const enrich = r.product_id ? productMap.get(String(r.product_id)) : null;
            const id = r.id as string;
            return {
              order_item_id: id,
              order_id: r.order_id,
              item_type: r.item_type,
              product_id: r.product_id ?? null,
              bundle_id: r.bundle_id ?? null,
              item_name: r.item_name_snapshot,
              qty: r.qty,
              capacity_units_snapshot: r.capacity_units_snapshot ?? null,
              category_id: enrich ? enrich.category_id : null,
              capacity_units: enrich ? enrich.capacity_units : null,
              options: optionsByItem[id] || [],
              selections: selectionsByItem[id] || [],
            };
          });
        }
      }
    } catch (e) {
      console.error("order_item_lines build threw", e);
    }

    // Operator-read-auth Slice 7b: additively compute new-vs-returning
    // customer counts for the Scorecard's audience section. Server-side
    // compute means zero customer emails leave the EF — strict PII
    // tightening vs the previous direct vendor-wide orders read on
    // scorecard.html. Non-fatal on failure: counts default to 0 and
    // customer_data_available stays false so consumers degrade quietly.
    //
    // Vendor's other drop IDs — orders has no vendor_id column, so vendor
    // scope must come through drops. This mirrors get-customers-workspace
    // and get-home-dashboard's pattern.
    let otherDropIds: string[] = [];
    try {
      const { data: vendorDrops, error: dropsErr } = await serviceClient
        .from("drops")
        .select("id")
        .eq("vendor_id", vendor.id)
        .neq("id", drop_id);
      if (!dropsErr && Array.isArray(vendorDrops)) {
        otherDropIds = vendorDrops.map((d: any) => d.id);
      } else if (dropsErr) {
        console.error("[get-drop] vendor drops fetch failed:", dropsErr);
      }
    } catch (e) {
      console.error("[get-drop] vendor drops fetch threw:", e);
    }

    let newCustomers = 0;
    let returningCustomers = 0;
    let customerDataAvailable = false;
    try {
      let priorSet = new Set<string>();
      if (otherDropIds.length > 0) {
        const { data: otherEmails, error: otherErr } = await serviceClient
          .from("orders")
          .select("customer_email")
          .in("drop_id", otherDropIds);
        if (!otherErr && Array.isArray(otherEmails)) {
          priorSet = new Set(
            otherEmails.map((r: any) => r.customer_email).filter(Boolean)
          );
        } else if (otherErr) {
          console.error("prior-customers lookup failed", otherErr);
        }
      }
      const thisEmails = new Set(
        (dropOrders as any[]).map((o: any) => o.customer_email).filter(Boolean)
      );
      customerDataAvailable = thisEmails.size > 0;
      for (const email of thisEmails) {
        if (priorSet.has(email)) returningCustomers++;
        else newCustomers++;
      }
    } catch (e) {
      console.error("[get-drop] prior-customers compute threw:", e);
    }

    return jsonResponse({
      ...data,
      summary: summary ?? null,
      orders_summary: ordersSummary ?? [],
      order_items: orderItems ?? [],
      order_items_source: orderItemsSource ?? null,
      order_item_lines: orderItemLines,
      item_sales: itemSales,
      drop_orders: dropOrders,
      new_customers: newCustomers,
      returning_customers: returningCustomers,
      customer_data_available: customerDataAvailable,
    }, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
