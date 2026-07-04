import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Product options (modifiers) — STAGE 2 read path. Returns every option
// group + its options for ALL of a vendor's products, shaped for easy
// client grouping by product_id.
//
// The product_option_groups / product_options tables are RLS-locked and
// REVOKE'd from anon (Stage 1 migration), so a direct browser read returns
// zero rows. This function reads with the service-role client after
// verifying the caller owns the vendor — the same pattern as get-host.
//
// Scoping chain: product_option_groups.product_id -> products.vendor_id.
// The tables carry no vendor_id, so we resolve the vendor's product ids
// first, then filter groups by .in("product_id", ...), then options by
// .in("group_id", ...) — mirroring loadBundleChildren in drop-menu.html.
//
// Input: { vendor_id }
// Output: { groups: [{ id, product_id, name, min_select, max_select,
//           is_required, sort_order, is_active, options: [{ id, group_id,
//           name, price_delta_pence, sort_order, is_active }] }] }

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

    let body: { vendor_id?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { vendor_id } = body;
    if (!vendor_id) return jsonResponse({ error: "vendor_id is required" }, 400);

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Vendor ownership: caller owns the vendor.
    const { data: vendor, error: ownershipError } = await serviceClient
      .from("vendors")
      .select("id")
      .eq("id", vendor_id)
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (ownershipError) {
      return jsonResponse({ error: "Ownership check failed" }, 500);
    }
    if (!vendor) {
      return jsonResponse({ error: "Vendor not found or not owned by user" }, 403);
    }

    // Resolve this vendor's product ids (the scope key for the groups).
    const { data: products, error: productsError } = await serviceClient
      .from("products")
      .select("id")
      .eq("vendor_id", vendor_id);
    if (productsError) return jsonResponse({ error: productsError.message }, 500);

    const productIds = (products || []).map((p) => p.id as string);
    if (productIds.length === 0) {
      return jsonResponse({ groups: [] }, 200);
    }

    const { data: groups, error: groupsError } = await serviceClient
      .from("product_option_groups")
      .select("id, product_id, name, min_select, max_select, is_required, sort_order, is_active")
      .in("product_id", productIds)
      .order("sort_order", { ascending: true });
    if (groupsError) return jsonResponse({ error: groupsError.message }, 500);

    const groupList = groups || [];
    const groupIds = groupList.map((g) => g.id as string);

    let optionsByGroup = new Map<string, Array<Record<string, unknown>>>();
    if (groupIds.length > 0) {
      const { data: options, error: optionsError } = await serviceClient
        .from("product_options")
        .select("id, group_id, name, price_delta_pence, sort_order, is_active")
        .in("group_id", groupIds)
        .order("sort_order", { ascending: true });
      if (optionsError) return jsonResponse({ error: optionsError.message }, 500);

      for (const o of options || []) {
        const key = o.group_id as string;
        if (!optionsByGroup.has(key)) optionsByGroup.set(key, []);
        optionsByGroup.get(key)!.push(o);
      }
    }

    const shaped = groupList.map((g) => ({
      ...g,
      options: optionsByGroup.get(g.id as string) || [],
    }));

    return jsonResponse({ groups: shaped }, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
