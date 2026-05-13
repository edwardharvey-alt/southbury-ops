import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Whitelist of product columns that can be set via this function.
// Anything outside this list is silently dropped from the payload.
//
// Intentionally excluded (must never be client-editable here):
//   id, vendor_id, created_at, updated_at
//
// `category` is the legacy text column. The page still writes it
// (set to the category name or 'uncategorised'); pass through as-is.
const ALLOWED_FIELDS = new Set([
  "name",
  "description",
  "image_url",
  "category_id",
  "category",
  "price_pence",
  "capacity_units",
  "counts_toward_capacity",
  "capacity_weight",
  "sort_order",
  "is_active",
  "travels_well",
  "suitable_for_collection",
  "prep_complexity",
  "allergens",
  "dietary_flags",
]);

// Caller may optionally supply a UUID for the new row's primary key.
// Required when the frontend uploads an asset to a path keyed by
// product id before the row is saved (T4-31b-products). The id is
// handled at the top level of the request body — NOT inside `fields`
// — so it is not subject to ALLOWED_FIELDS filtering.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    let body: {
      vendor_id?: string;
      id?: unknown;
      fields?: Record<string, unknown>;
    };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { vendor_id, id: suppliedId, fields } = body;
    if (!vendor_id) return jsonResponse({ error: "vendor_id is required" }, 400);
    if (!fields || typeof fields !== "object") {
      return jsonResponse({ error: "fields object is required" }, 400);
    }

    let validatedId: string | null = null;
    if (suppliedId !== undefined && suppliedId !== null) {
      if (typeof suppliedId !== "string" || !UUID_RE.test(suppliedId)) {
        return jsonResponse(
          { error: "Invalid id: must be a valid UUID" },
          400
        );
      }
      validatedId = suppliedId;
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

    const insertPayload: Record<string, unknown> = { vendor_id: vendor.id };
    if (validatedId) insertPayload.id = validatedId;
    for (const key of Object.keys(fields)) {
      if (ALLOWED_FIELDS.has(key)) {
        insertPayload[key] = fields[key];
      }
    }

    if (!("allergens" in insertPayload)) insertPayload.allergens = [];
    if (!("dietary_flags" in insertPayload)) insertPayload.dietary_flags = [];

    if (typeof insertPayload.name !== "string" || !(insertPayload.name as string).trim()) {
      return jsonResponse({ error: "name is required" }, 400);
    }

    const { data, error } = await serviceClient
      .from("products")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) {
      const errCode = (error as { code?: string }).code;
      const errMsg = (error.message || "").toLowerCase();
      if (errCode === "23505" || errMsg.includes("duplicate key")) {
        return jsonResponse(
          { error: "Product with this id already exists" },
          409
        );
      }
      return jsonResponse({ error: error.message }, 400);
    }
    return jsonResponse(data, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
