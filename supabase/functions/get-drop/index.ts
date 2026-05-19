import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    let body: { drop_id?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { drop_id } = body;
    if (!drop_id) return jsonResponse({ error: "drop_id is required" }, 400);
    if (!UUID_REGEX.test(drop_id)) {
      return jsonResponse({ error: "drop_id must be a UUID" }, 400);
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: vendor, error: vendorError } = await serviceClient
      .from("vendors")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (vendorError) {
      return jsonResponse({ error: "Vendor lookup failed" }, 500);
    }
    if (!vendor) {
      return jsonResponse({ error: "Vendor not found or not owned by user" }, 403);
    }

    const { data, error } = await serviceClient
      .from("drops")
      .select("*")
      .eq("id", drop_id)
      .eq("vendor_id", vendor.id)
      .maybeSingle();

    if (error) return jsonResponse({ error: error.message }, 500);
    if (!data) return jsonResponse({ error: "Drop not found" }, 404);

    // T5-A14: additively return the drop's v_drop_summary row,
    // scoped by the drop_id already resolved and ownership-verified
    // above. Operator pages currently read v_drop_summary directly
    // via the anon-effective client (operational learning #52); this
    // is the secured-read replacement. Full row, not a hand-picked
    // subset, because all three single-drop callers use select('*')
    // and a subset risks missing-column regressions. Failures here
    // are non-fatal — summary becomes null and existing consumers
    // are unaffected.
    const { data: summary, error: summaryError } = await serviceClient
      .from("v_drop_summary")
      .select("*")
      .eq("drop_id", drop_id)
      .maybeSingle();
    if (summaryError) {
      console.error("v_drop_summary lookup failed", summaryError);
    }

    return jsonResponse({ ...data, summary: summary ?? null }, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
