import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// get-current-vendor — returns the caller's OWN vendor row, resolved by the
// session JWT's auth_user_id. This is the JWT-authenticated replacement for
// the four session-identity reads that previously hit the `vendors` table
// directly under anon SELECT (T5-A3 Priority 2 Half B). Once those reads are
// re-pointed here, the anon `vendors_select_all` policy can be revoked
// (Ed's separate capstone, not in this PR).
//
// Scoping IS the auth_user_id match — there is no separate resource to fetch
// and no further ownership check. select('*') is deliberate: this returns the
// owner's own row to an authenticated owner, NOT a public projection.
// (v_vendor_public is the anon customer path; this is not that.)

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

    const { data: vendor, error } = await serviceClient
      .from("vendors")
      .select("*")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (error) return jsonResponse({ error: error.message }, 500);

    // Valid session, no vendor row — a legitimate state (e.g. an admin, or a
    // user mid-provisioning), NOT an error. 404 lets callers distinguish this
    // from a transient failure and preserve their existing null-on-no-row path.
    if (!vendor) return jsonResponse({ error: "no_vendor_for_user" }, 404);

    return jsonResponse(vendor, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
