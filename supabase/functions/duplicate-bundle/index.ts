import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Composite operation. Server-side mirror of the client-side cascade
// previously in drop-menu.html duplicateCurrentBundle:
//   1. Insert new bundle (copy of source, with " Copy" suffix and is_active=false)
//   2. For each source line, insert new bundle_line under the new bundle
//   3. For each choice_set line, insert the choice_products under the new line
//
// Steps 2/3 are wrapped in try/catch — on any failure we attempt to roll
// back by deleting the new bundle (manual cascade) before re-throwing
// the original error, so the catalogue is not left with a half-cloned
// bundle.

const BUNDLE_FIELDS = [
  "name",
  "description",
  "category_id",
  "price_pence",
  "capacity_units",
  "sort_order",
  "is_active",
] as const;

const LINE_FIELDS = [
  "bundle_id",
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
] as const;

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

    // Tenancy belt: source bundle must belong to this vendor.
    const { data: source, error: sourceError } = await serviceClient
      .from("bundles")
      .select("*")
      .eq("id", bundle_id)
      .maybeSingle();

    if (sourceError) return jsonResponse({ error: sourceError.message }, 400);
    if (!source) return jsonResponse({ error: "Bundle not found" }, 404);
    if (source.vendor_id !== vendor.id) {
      return jsonResponse({ error: "Bundle not owned by vendor" }, 403);
    }

    // Compute next sort_order across bundles in the same category.
    const sortQuery = serviceClient
      .from("bundles")
      .select("sort_order")
      .eq("vendor_id", vendor.id);
    const { data: peers, error: peersError } = source.category_id
      ? await sortQuery.eq("category_id", source.category_id)
      : await sortQuery.is("category_id", null);

    if (peersError) return jsonResponse({ error: peersError.message }, 400);

    const maxSort = (peers || []).reduce((max, row) => {
      const value = Number(row.sort_order || 0);
      return value > max ? value : max;
    }, 0);
    const nextSort = maxSort > 0 ? maxSort + 10 : 10;

    const newBundlePayload: Record<string, unknown> = { vendor_id: vendor.id };
    for (const key of BUNDLE_FIELDS) {
      if (key === "name") {
        newBundlePayload[key] = `${source.name} Copy`;
      } else if (key === "is_active") {
        newBundlePayload[key] = false;
      } else if (key === "sort_order") {
        newBundlePayload[key] = nextSort;
      } else {
        newBundlePayload[key] = source[key];
      }
    }

    const { data: newBundle, error: insertError } = await serviceClient
      .from("bundles")
      .insert(newBundlePayload)
      .select("*")
      .single();

    if (insertError) return jsonResponse({ error: insertError.message }, 400);

    try {
      const { data: sourceLines, error: linesError } = await serviceClient
        .from("bundle_lines")
        .select("*")
        .eq("bundle_id", source.id);
      if (linesError) throw linesError;

      for (const line of sourceLines || []) {
        const linePayload: Record<string, unknown> = { bundle_id: newBundle.id };
        for (const key of LINE_FIELDS) {
          if (key === "bundle_id") continue;
          linePayload[key] = line[key];
        }

        const { data: newLine, error: lineInsertError } = await serviceClient
          .from("bundle_lines")
          .insert(linePayload)
          .select("*")
          .single();
        if (lineInsertError) throw lineInsertError;

        if (line.line_type === "choice_set") {
          const { data: sourceChoices, error: choicesError } = await serviceClient
            .from("bundle_line_choice_products")
            .select("product_id, sort_order")
            .eq("bundle_line_id", line.id);
          if (choicesError) throw choicesError;

          if (sourceChoices && sourceChoices.length) {
            const rows = sourceChoices.map((opt) => ({
              bundle_line_id: newLine.id,
              product_id: opt.product_id,
              sort_order: opt.sort_order,
            }));
            const { error: choicesInsertError } = await serviceClient
              .from("bundle_line_choice_products")
              .insert(rows);
            if (choicesInsertError) throw choicesInsertError;
          }
        }
      }
    } catch (cloneError) {
      // Best-effort rollback: delete the new bundle and its descendants.
      try {
        const { data: rollbackLines } = await serviceClient
          .from("bundle_lines")
          .select("id")
          .eq("bundle_id", newBundle.id);
        for (const line of rollbackLines || []) {
          await serviceClient
            .from("bundle_line_choice_products")
            .delete()
            .eq("bundle_line_id", line.id);
        }
        await serviceClient
          .from("bundle_lines")
          .delete()
          .eq("bundle_id", newBundle.id);
        await serviceClient
          .from("bundles")
          .delete()
          .eq("id", newBundle.id)
          .eq("vendor_id", vendor.id);
      } catch (rollbackError) {
        console.error("duplicate-bundle rollback failed:", rollbackError);
      }
      const message = (cloneError as { message?: string })?.message ?? String(cloneError);
      return jsonResponse({ error: message }, 400);
    }

    return jsonResponse(newBundle, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
