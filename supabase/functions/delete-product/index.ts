import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// FK references that can block a products delete:
//   drop_menu_items.product_id, bundle_lines.product_id,
//   bundle_line_choice_products.product_id
// The page-side initiateDeleteProduct pre-checks drop_menu_items via
// checkDropUsage, but does not check bundle_lines or
// bundle_line_choice_products. Postgres surfaces FK violations from
// those tables here as PostgREST error code 23503 — translate to a
// readable message that names the blocking table.

const FK_BLOCKERS: Array<{ marker: string; label: string }> = [
  { marker: "drop_menu_items", label: "an active drop menu" },
  { marker: "bundle_line_choice_products", label: "a bundle choice option" },
  { marker: "bundle_lines", label: "a bundle included item" },
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

    let body: { vendor_id?: string; product_id?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { vendor_id, product_id } = body;
    if (!vendor_id) return jsonResponse({ error: "vendor_id is required" }, 400);
    if (!product_id) return jsonResponse({ error: "product_id is required" }, 400);

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

    // Tenancy belt: confirm the target product belongs to the resolved vendor
    // before deleting. Defence in depth against id-tampering.
    const { data: existingProduct, error: lookupError } = await serviceClient
      .from("products")
      .select("id, vendor_id")
      .eq("id", product_id)
      .maybeSingle();

    if (lookupError) return jsonResponse({ error: lookupError.message }, 400);
    if (!existingProduct) return jsonResponse({ error: "Product not found" }, 404);
    if (existingProduct.vendor_id !== vendor.id) {
      return jsonResponse({ error: "Product not owned by vendor" }, 403);
    }

    const { data, error } = await serviceClient
      .from("products")
      .delete()
      .eq("id", product_id)
      .eq("vendor_id", vendor.id)
      .select()
      .maybeSingle();

    if (error) {
      if ((error as { code?: string }).code === "23503") {
        const haystack = `${error.message} ${(error as { details?: string }).details ?? ""}`.toLowerCase();
        const hit = FK_BLOCKERS.find((blocker) => haystack.includes(blocker.marker));
        const friendly = hit
          ? `Cannot delete product: it is still referenced by ${hit.label}. Remove it from there first.`
          : `Cannot delete product: it is still referenced elsewhere. ${error.message}`;
        return jsonResponse({ error: friendly }, 400);
      }
      return jsonResponse({ error: error.message }, 400);
    }
    if (!data) return jsonResponse({ error: "Product not found" }, 404);

    return jsonResponse({ ok: true }, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
