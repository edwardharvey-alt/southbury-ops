import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Deletes a single bundle_lines row, cascading bundle_line_choice_products
// children defensively (works whether the DB has ON DELETE CASCADE or not).

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

    let body: { vendor_id?: string; bundle_id?: string; bundle_line_id?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { vendor_id, bundle_id, bundle_line_id } = body;
    if (!vendor_id) return jsonResponse({ error: "vendor_id is required" }, 400);
    if (!bundle_id) return jsonResponse({ error: "bundle_id is required" }, 400);
    if (!bundle_line_id) return jsonResponse({ error: "bundle_line_id is required" }, 400);

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

    // Tenancy belt: parent bundle belongs to the resolved vendor, and the
    // line belongs to the bundle.
    const { data: parentBundle, error: bundleLookupError } = await serviceClient
      .from("bundles")
      .select("id, vendor_id")
      .eq("id", bundle_id)
      .maybeSingle();

    if (bundleLookupError) return jsonResponse({ error: bundleLookupError.message }, 400);
    if (!parentBundle) return jsonResponse({ error: "Bundle not found" }, 404);
    if (parentBundle.vendor_id !== vendor.id) {
      return jsonResponse({ error: "Bundle not owned by vendor" }, 403);
    }

    const { data: existingLine, error: lineLookupError } = await serviceClient
      .from("bundle_lines")
      .select("id, bundle_id")
      .eq("id", bundle_line_id)
      .maybeSingle();

    if (lineLookupError) return jsonResponse({ error: lineLookupError.message }, 400);
    if (!existingLine) return jsonResponse({ error: "Bundle line not found" }, 404);
    if (existingLine.bundle_id !== bundle_id) {
      return jsonResponse({ error: "Bundle line does not belong to bundle" }, 403);
    }

    const { error: choicesError } = await serviceClient
      .from("bundle_line_choice_products")
      .delete()
      .eq("bundle_line_id", bundle_line_id);
    if (choicesError) return jsonResponse({ error: choicesError.message }, 400);

    const { data, error } = await serviceClient
      .from("bundle_lines")
      .delete()
      .eq("id", bundle_line_id)
      .select()
      .maybeSingle();

    if (error) return jsonResponse({ error: error.message }, 400);
    if (!data) return jsonResponse({ error: "Bundle line not found" }, 404);

    return jsonResponse({ deleted: true, id: bundle_line_id }, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
