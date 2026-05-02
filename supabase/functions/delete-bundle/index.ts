import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// FK references that can block a bundles delete after the manual cascade
// of bundle_lines / bundle_line_choice_products has run. The most common
// blocker is drop_menu_items pointing at this bundle_id; the page-side
// initiateDeleteBundle pre-checks that, but defence in depth here too.

const FK_BLOCKERS: Array<{ marker: string; label: string }> = [
  { marker: "drop_menu_items", label: "an active drop menu" },
];

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

    let body: { vendor_id?: string; bundle_id?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { vendor_id, bundle_id } = body;
    if (!vendor_id) return jsonResponse({ error: "vendor_id is required" }, 400);
    if (!bundle_id) return jsonResponse({ error: "bundle_id is required" }, 400);

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
    // before deleting. Defence in depth against id-tampering.
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

    // Manual cascade — works whether the DB has ON DELETE CASCADE or not.
    const { data: lines, error: linesLookupError } = await serviceClient
      .from("bundle_lines")
      .select("id")
      .eq("bundle_id", bundle_id);

    if (linesLookupError) {
      return jsonResponse({ error: linesLookupError.message }, 400);
    }

    for (const line of lines || []) {
      const { error: choicesError } = await serviceClient
        .from("bundle_line_choice_products")
        .delete()
        .eq("bundle_line_id", line.id);
      if (choicesError) return jsonResponse({ error: choicesError.message }, 400);
    }

    const { error: linesDeleteError } = await serviceClient
      .from("bundle_lines")
      .delete()
      .eq("bundle_id", bundle_id);
    if (linesDeleteError) return jsonResponse({ error: linesDeleteError.message }, 400);

    const { data, error } = await serviceClient
      .from("bundles")
      .delete()
      .eq("id", bundle_id)
      .eq("vendor_id", vendor.id)
      .select()
      .maybeSingle();

    if (error) {
      if ((error as { code?: string }).code === "23503") {
        const haystack = `${error.message} ${(error as { details?: string }).details ?? ""}`.toLowerCase();
        const hit = FK_BLOCKERS.find((blocker) => haystack.includes(blocker.marker));
        const friendly = hit
          ? `Cannot delete bundle: it is still referenced by ${hit.label}. Remove it from there first.`
          : `Cannot delete bundle: it is still referenced elsewhere. ${error.message}`;
        return jsonResponse({ error: friendly }, 400);
      }
      return jsonResponse({ error: error.message }, 400);
    }
    if (!data) return jsonResponse({ error: "Bundle not found" }, 404);

    return jsonResponse({ deleted: true, id: bundle_id }, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
