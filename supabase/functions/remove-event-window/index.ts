import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// PR 4b — remove-event-window.
//
// Deletes one drop from a window group, atomically clears
// window_group_id on the sole survivor when the group dissolves.
// Subsumes the renderExistingWindows confirm-remove click handler
// (drop-manager.html:4960–4980) and the parent-clear write inside
// renderExistingWindows itself (lines 4057–4070).
//
// Refusal model (audit Section 3.4):
//
//   1 missing Authorization                       401  Unauthorized
//   2 missing vendor_id                           400  vendor_id is required
//   3 missing drop_id                             400  drop_id is required
//   4 vendor not owned by user                    403  Vendor not found or not owned by user
//   5 drop_id does not belong to vendor           400  drop_id does not belong to this vendor
//   6 drop is not part of a window group          400  (with archive hint)
//   7 drop has any orders                         409  Cannot remove a window with existing orders
//
// Condition 7 is HARD — no force flag. PR-4B-AUDIT.md Section 5.2
// enumerates the three downstream corruption surfaces a cascade-
// delete on an order-bearing drop would silently destroy. The check
// is implemented in TypeScript, BEFORE the RPC fires, with an
// EXISTS-style probe (`select id ... limit 1`) — not count(*) —
// for sub-millisecond cost. See audit Section 3.7's last paragraph.
//
// Atomic post-delete coherence (delete + survivor-clear if the group
// drops to one member) is delegated to the remove_event_window RPC
// (security definer, search_path = public, pg_temp).

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

    let body: { vendor_id?: string; drop_id?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { vendor_id, drop_id } = body;
    if (!vendor_id) return jsonResponse({ error: "vendor_id is required" }, 400);
    if (!drop_id) return jsonResponse({ error: "drop_id is required" }, 400);

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Vendor ownership.
    const { data: vendor, error: ownershipError } = await serviceClient
      .from("vendors")
      .select("id")
      .eq("id", vendor_id)
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (ownershipError) return jsonResponse({ error: "Ownership check failed" }, 500);
    if (!vendor) return jsonResponse({ error: "Vendor not found or not owned by user" }, 403);

    // Drop ownership + window-group membership.
    const { data: drop, error: dropErr } = await serviceClient
      .from("drops")
      .select("id, vendor_id, window_group_id")
      .eq("id", drop_id)
      .eq("vendor_id", vendor_id)
      .maybeSingle();
    if (dropErr) return jsonResponse({ error: "Drop lookup failed" }, 500);
    if (!drop) {
      return jsonResponse({ error: "drop_id does not belong to this vendor" }, 400);
    }
    if (!drop.window_group_id) {
      return jsonResponse(
        {
          error:
            "Drop is not part of a window group. To delete a soloist drop, archive it via transition-drop-status (target_status: archived).",
        },
        400
      );
    }

    // Orders-presence refusal (audit Section 3.4 condition 7).
    // EXISTS-style probe — `select id from orders where drop_id = $1
    // limit 1`, not count(*). If any row exists, refuse with 409.
    const { data: orderRows, error: ordersErr } = await serviceClient
      .from("orders")
      .select("id")
      .eq("drop_id", drop_id)
      .limit(1);
    if (ordersErr) return jsonResponse({ error: "Orders lookup failed" }, 500);
    if (orderRows && orderRows.length > 0) {
      return jsonResponse(
        { error: "Cannot remove a window with existing orders" },
        409
      );
    }

    // Atomic delete + post-delete coherence via RPC.
    const { data: rpcRows, error: rpcErr } = await serviceClient.rpc(
      "remove_event_window",
      { p_drop_id: drop_id }
    );
    if (rpcErr) return jsonResponse({ error: rpcErr.message }, 400);
    if (!rpcRows || rpcRows.length === 0) {
      return jsonResponse({ error: "remove_event_window returned no rows" }, 500);
    }

    const result = rpcRows[0] as {
      deleted_drop_id: string;
      survivor_drop_id: string | null;
      cascaded_drop_menu_items: number;
      group_dissolved: boolean;
    };

    return jsonResponse(
      {
        deleted_drop_id: result.deleted_drop_id,
        group_dissolved: result.group_dissolved,
        survivor_drop_id: result.survivor_drop_id,
        cascaded_drop_menu_items: result.cascaded_drop_menu_items,
      },
      200
    );
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
