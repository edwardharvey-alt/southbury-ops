import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const jsonResponse = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse(401, { error: "Unauthorized" });

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) return jsonResponse(401, { error: "Unauthorized" });

    let body: { vendor_id?: unknown; ordered_ids?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, { error: "Invalid JSON body" });
    }

    const { vendor_id, ordered_ids } = body;
    if (typeof vendor_id !== "string" || vendor_id.length === 0) {
      return jsonResponse(400, { error: "vendor_id is required" });
    }
    if (!Array.isArray(ordered_ids) || ordered_ids.length === 0) {
      return jsonResponse(400, { error: "ordered_ids must be a non-empty array" });
    }
    for (const id of ordered_ids) {
      if (typeof id !== "string" || id.length === 0) {
        return jsonResponse(400, { error: "ordered_ids must contain non-empty strings" });
      }
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: vendor, error: ownershipError } = await serviceClient
      .from("vendors")
      .select("id")
      .eq("id", vendor_id)
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (ownershipError) {
      return jsonResponse(500, { error: "Ownership check failed" });
    }
    if (!vendor) {
      return jsonResponse(403, { error: "Vendor not found or not owned by user" });
    }

    const { data: ownedRows, error: ownedError } = await serviceClient
      .from("products")
      .select("id")
      .in("id", ordered_ids)
      .eq("vendor_id", vendor_id);

    if (ownedError) return jsonResponse(400, { error: ownedError.message });
    if (!ownedRows || ownedRows.length !== ordered_ids.length) {
      return jsonResponse(403, { error: "ownership_violation" });
    }

    const rows = ordered_ids.map((id, i) => ({ id, sort_order: (i + 1) * 10 }));

    for (const row of rows) {
      const { error: updateError } = await serviceClient
        .from("products")
        .update({ sort_order: row.sort_order })
        .eq("id", row.id)
        .eq("vendor_id", vendor_id);

      if (updateError) {
        return jsonResponse(400, { error: updateError.message });
      }
    }

    return jsonResponse(200, { ok: true, count: rows.length });
  } catch (err) {
    return jsonResponse(500, { error: (err as Error).message });
  }
});
