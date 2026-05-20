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

    const { count, error } = await serviceClient
      .from("customer_relationships")
      .select("customer_id", { count: "exact", head: true })
      .eq("owner_id", vendor.id)
      .eq("owner_type", "vendor");

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
