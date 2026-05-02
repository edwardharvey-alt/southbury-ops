import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Composite operation. Replaces the client-side saveBundleLine +
// syncChoiceSetOptions pair. Handles both insert and update of a
// bundle_lines row plus the bundle_line_choice_products children for
// choice_set lines.

const ALLOWED_FIELDS = new Set([
  "label",
  "line_type",
  "product_id",
  "category_id",
  "quantity",
  "min_choices",
  "max_choices",
  "is_required",
  "drives_capacity",
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

    let body: {
      vendor_id?: string;
      bundle_id?: string;
      bundle_line_id?: string | null;
      fields?: Record<string, unknown>;
      choice_product_ids?: string[];
    };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { vendor_id, bundle_id, bundle_line_id, fields, choice_product_ids } = body;
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

    // Tenancy belt: parent bundle belongs to the resolved vendor.
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

    // Build whitelisted payload. Server sets bundle_id, never trusts the
    // body's bundle_id field for the row payload (that's only used for
    // the assertion above).
    const payload: Record<string, unknown> = { bundle_id };
    for (const key of Object.keys(fields)) {
      if (ALLOWED_FIELDS.has(key)) {
        payload[key] = fields[key];
      }
    }

    const lineType = payload.line_type;
    const choiceIds = Array.isArray(choice_product_ids) ? choice_product_ids : [];

    if (bundle_line_id) {
      // UPDATE existing line. First confirm it belongs to this bundle.
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

      const { data: updatedLine, error: updateError } = await serviceClient
        .from("bundle_lines")
        .update(payload)
        .eq("id", bundle_line_id)
        .select("*")
        .maybeSingle();

      if (updateError) return jsonResponse({ error: updateError.message }, 400);
      if (!updatedLine) return jsonResponse({ error: "Bundle line not found" }, 404);

      // Reconcile choice_products. On update we mirror the previous
      // client behaviour: if line is choice_set, replace the children.
      // Otherwise wipe them (in case the line was previously a choice_set).
      if (lineType === "choice_set") {
        const { error: deleteError } = await serviceClient
          .from("bundle_line_choice_products")
          .delete()
          .eq("bundle_line_id", bundle_line_id);
        if (deleteError) return jsonResponse({ error: deleteError.message }, 400);

        if (choiceIds.length) {
          const rows = choiceIds.map((productId, index) => ({
            bundle_line_id,
            product_id: productId,
            sort_order: (index + 1) * 10,
          }));
          const { error: insertError } = await serviceClient
            .from("bundle_line_choice_products")
            .insert(rows);
          if (insertError) return jsonResponse({ error: insertError.message }, 400);
        }
      } else {
        const { error: cleanupError } = await serviceClient
          .from("bundle_line_choice_products")
          .delete()
          .eq("bundle_line_id", bundle_line_id);
        if (cleanupError) return jsonResponse({ error: cleanupError.message }, 400);
      }

      return jsonResponse({ id: updatedLine.id, line: updatedLine }, 200);
    }

    // INSERT new line.
    const { data: newLine, error: insertError } = await serviceClient
      .from("bundle_lines")
      .insert(payload)
      .select("*")
      .single();

    if (insertError) return jsonResponse({ error: insertError.message }, 400);

    if (lineType === "choice_set" && choiceIds.length) {
      const rows = choiceIds.map((productId, index) => ({
        bundle_line_id: newLine.id,
        product_id: productId,
        sort_order: (index + 1) * 10,
      }));
      const { error: choicesError } = await serviceClient
        .from("bundle_line_choice_products")
        .insert(rows);

      if (choicesError) {
        // Roll back the new line so we don't leave an orphaned choice_set
        // line with no options.
        try {
          await serviceClient
            .from("bundle_lines")
            .delete()
            .eq("id", newLine.id);
        } catch (rollbackError) {
          console.error("save-bundle-line rollback failed:", rollbackError);
        }
        return jsonResponse({ error: choicesError.message }, 400);
      }
    }

    return jsonResponse({ id: newLine.id, line: newLine }, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
