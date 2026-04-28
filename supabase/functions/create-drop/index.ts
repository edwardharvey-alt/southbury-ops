import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Whitelist of drops columns settable on creation via this function.
// Anything outside this list is silently dropped from the payload.
//
// Scoped to the fields drop-manager.html's createNewDrop() actually
// sends today. PR 4 (update-drop, duplicate, series, event windows)
// will widen this against the surfaces that need it.
//
// Intentionally excluded (must never be client-settable here):
//   id (server-generated)
//   vendor_id (taken from ownership check, not request body)
//   created_at, updated_at, published_at, closed_at, archived_at
//     (lifecycle and DB defaults)
//   capacity_pizzas, max_orders (legacy NOT NULL DEFAULT 40 — DB fills
//     in; T5-B5 cleanup)
const ALLOWED_FIELDS = new Set([
  "name",
  "slug",
  "drop_type",
  "status",
  "fulfilment_mode",
  "centre_postcode",
  "radius_km",
  "capacity_category_id",
  "capacity_category",
  "capacity_units_total",
  "opens_at",
  "closes_at",
  "delivery_start",
  "delivery_end",
  "fundraising_enabled",
  "host_share_enabled",
]);

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

    let body: { vendor_id?: string; fields?: Record<string, unknown> };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { vendor_id, fields } = body;
    if (!vendor_id) return jsonResponse({ error: "vendor_id is required" }, 400);
    if (!fields || typeof fields !== "object") {
      return jsonResponse({ error: "fields object is required" }, 400);
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
      return jsonResponse({ error: "Ownership check failed" }, 500);
    }
    if (!vendor) {
      return jsonResponse({ error: "Vendor not found or not owned by user" }, 403);
    }

    const insert: Record<string, unknown> = { vendor_id };
    for (const key of Object.keys(fields)) {
      if (ALLOWED_FIELDS.has(key)) {
        insert[key] = fields[key];
      }
    }

    if (!insert.name || !insert.slug) {
      return jsonResponse({ error: "name and slug are required" }, 400);
    }

    const { data, error } = await serviceClient
      .from("drops")
      .insert(insert)
      .select()
      .maybeSingle();

    if (error) return jsonResponse({ error: error.message }, 400);
    if (!data) return jsonResponse({ error: "Drop creation returned no row" }, 500);

    return jsonResponse(data, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
