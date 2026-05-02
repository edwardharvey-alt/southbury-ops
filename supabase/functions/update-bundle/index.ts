import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Whitelist of bundle columns that can be updated via this function.
// Anything outside this list is silently dropped from the payload.
//
// Intentionally excluded (must never be client-editable here):
//   id, vendor_id, created_at, updated_at
const ALLOWED_FIELDS = new Set([
  "name",
  "description",
  "category_id",
  "price_pence",
  "capacity_units",
  "sort_order",
  "is_active",
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

    let body: { vendor_id?: string; bundle_id?: string; fields?: Record<string, unknown> };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { vendor_id, bundle_id, fields } = body;
    if (!vendor_id) return jsonResponse({ error: "vendor_id is required" }, 400);
    if (!bundle_id) return jsonResponse({ error: "bundle_id is required" }, 400);
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

    // Tenancy belt: confirm the target bundle belongs to the resolved vendor
    // before applying the update. Defence in depth against id-tampering.
    const { data: existingBundle, error: lookupError } = await serviceClient
      .from("bundles")
      .select("id, vendor_id")
      .eq("id", bundle_id)
      .maybeSingle();

    if (lookupError) return jsonResponse({ error: lookupError.message }, 400);
    if (!existingBundle) return jsonResponse({ error: "Bundle not found" }, 404);
    if (existingBundle.vendor_id !== vendor.id) {
      return jsonResponse({ error: "Bundle not owned by vendor" }, 403);
    }

    const update: Record<string, unknown> = {};
    for (const key of Object.keys(fields)) {
      if (ALLOWED_FIELDS.has(key)) {
        update[key] = fields[key];
      }
    }

    if (Object.keys(update).length === 0) {
      return jsonResponse({ error: "No valid fields to update" }, 400);
    }

    const { data, error } = await serviceClient
      .from("bundles")
      .update(update)
      .eq("id", bundle_id)
      .eq("vendor_id", vendor.id)
      .select("*")
      .maybeSingle();

    if (error) return jsonResponse({ error: error.message }, 400);
    if (!data) return jsonResponse({ error: "Bundle not found" }, 404);

    return jsonResponse(data, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
