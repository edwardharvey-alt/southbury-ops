import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Product options (modifiers) — STAGE 3 customer read path. Anonymous.
//
// order.html is the customer surface: it has no authenticated user and no
// vendor ownership, so it cannot call get-product-options (which is
// owner-gated) and cannot read the option tables directly (they are
// RLS-locked and REVOKE'd from anon by the Stage 1 migration). This
// function is the anon-safe equivalent, mirroring v_drop_public's posture:
// anyone may read, but the surface is deliberately scoped and column-safe.
//
// verify_jwt = false. There is no auth signal — the drop_id is the only
// input. Confidentiality is bounded by what is returned (option NAMES and
// price DELTAS for products that are already publicly visible on this drop's
// menu) and by strict drop-scoping.
//
// Scoping (strict): drop_id -> drop_menu_items (product rows that are
// is_available on THIS drop) -> product_ids -> ACTIVE product_option_groups
// -> ACTIVE product_options. A customer therefore only ever sees option
// groups for products that appear on the drop they are ordering from —
// never options for the vendor's other products.
//
// This function does NOT price anything. price_delta_pence is returned for
// display only; create-order (the #427 pricing authority) re-derives every
// delta server-side in a later stage and must never trust a client value.
//
// Input:  { drop_id }
// Output: { groups: [{ id, product_id, name, min_select, max_select,
//           is_required, sort_order, options: [{ id, group_id, name,
//           price_delta_pence, sort_order }] }] }

function isUuid(v: unknown): v is string {
  return typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
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
    let body: { drop_id?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { drop_id } = body;
    if (!isUuid(drop_id)) {
      return jsonResponse({ error: "drop_id must be a uuid" }, 400);
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Products enabled on THIS drop — the scope key. Mirrors order.html's
    // own menu load (drop_menu_items, is_available, product rows).
    const { data: menuRows, error: menuError } = await serviceClient
      .from("drop_menu_items")
      .select("product_id")
      .eq("drop_id", drop_id)
      .eq("is_available", true)
      .eq("menu_item_type", "product");
    if (menuError) return jsonResponse({ error: menuError.message }, 500);

    const productIds = [
      ...new Set(
        (menuRows || [])
          .map((r) => r.product_id as string | null)
          .filter((id): id is string => Boolean(id))
      ),
    ];
    if (productIds.length === 0) {
      return jsonResponse({ groups: [] }, 200);
    }

    const { data: groups, error: groupsError } = await serviceClient
      .from("product_option_groups")
      .select("id, product_id, name, min_select, max_select, is_required, sort_order")
      .in("product_id", productIds)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (groupsError) return jsonResponse({ error: groupsError.message }, 500);

    const groupList = groups || [];
    const groupIds = groupList.map((g) => g.id as string);

    const optionsByGroup = new Map<string, Array<Record<string, unknown>>>();
    if (groupIds.length > 0) {
      const { data: options, error: optionsError } = await serviceClient
        .from("product_options")
        .select("id, group_id, name, price_delta_pence, sort_order")
        .in("group_id", groupIds)
        .eq("is_active", true)
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
