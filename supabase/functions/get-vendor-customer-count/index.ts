import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// get-vendor-customer-count — operator-read-auth Slice 7b.
//
// Replaces drop-manager.html's init-time direct anon read of
// customer_relationships (HEAD/exact-count). Returns a single integer
// used by renderFirstDropGuidance() to gate the "head start" CTA.
// Canonical auth pattern (JWT verification via auth.getUser, vendor
// resolution via vendors.auth_user_id, service-role read after auth).
// Non-fatal: any error returns { count: 0, 200 } so the consumer
// degrades to the cold-start CTA rather than erroring.
//
// Optional body: { source?: string }. When provided, the count is
// scoped to customer_relationships where source = <value> — used by
// insights.html to fetch the imported-only count for the engine's
// import-existing-customers recommendation gate
// (T-intelligence-engine-import-recommendation). Callers that pass
// no body get the unfiltered total count exactly as before
// (backward-compatible).
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

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: vendor, error: vendorError } = await serviceClient
      .from("vendors")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (vendorError) return jsonResponse({ count: 0 }, 200);
    if (!vendor) return jsonResponse({ count: 0 }, 200);

    // Optional body — backward-compatible with no-body callers.
    let source: string | null = null;
    try {
      const body = await req.json();
      if (body && typeof body.source === "string" && body.source) {
        source = body.source;
      }
    } catch (_) { /* no body — leave source unfiltered */ }

    let query = serviceClient
      .from("customer_relationships")
      .select("customer_id", { count: "exact", head: true })
      .eq("owner_id", vendor.id)
      .eq("owner_type", "vendor");

    if (source) query = query.eq("source", source);

    const { count, error } = await query;

    if (error) {
      console.error("customer_relationships count failed", error);
      return jsonResponse({ count: 0 }, 200);
    }

    return jsonResponse({ count: typeof count === "number" ? count : 0 }, 200);
  } catch (err) {
    console.error("[get-vendor-customer-count] threw:", err);
    return jsonResponse({ count: 0 }, 200);
  }
});
