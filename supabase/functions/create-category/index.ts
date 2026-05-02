import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const ALLOWED_FIELDS = new Set([
  "name",
  "slug",
  "is_active",
  "sort_order",
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

    const insertPayload: Record<string, unknown> = { vendor_id: vendor.id };
    for (const key of Object.keys(fields)) {
      if (ALLOWED_FIELDS.has(key)) {
        insertPayload[key] = fields[key];
      }
    }

    if (typeof insertPayload.name !== "string" || !(insertPayload.name as string).trim()) {
      return jsonResponse({ error: "name is required" }, 400);
    }
    if (typeof insertPayload.slug !== "string" || !(insertPayload.slug as string).trim()) {
      return jsonResponse({ error: "slug is required" }, 400);
    }

    const { data, error } = await serviceClient
      .from("categories")
      .insert(insertPayload)
      .select()
      .maybeSingle();

    if (error) return jsonResponse({ error: error.message }, 400);
    return jsonResponse(data, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
