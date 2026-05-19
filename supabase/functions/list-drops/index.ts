import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

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
      status?: string[];
      host_id?: string;
      window_group_id?: string;
      limit?: number;
    };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { status, host_id, window_group_id, limit } = body ?? {};

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

    let query = serviceClient
      .from("drops")
      .select("*")
      .eq("vendor_id", vendor.id);

    if (Array.isArray(status) && status.length > 0) {
      query = query.in("status", status);
    }
    if (host_id) {
      query = query.eq("host_id", host_id);
    }
    if (window_group_id) {
      query = query.eq("window_group_id", window_group_id);
    }
    if (typeof limit === "number" && limit > 0) {
      query = query.limit(limit);
    }

    query = query.order("delivery_start", { ascending: true });

    const { data, error } = await query;

    if (error) return jsonResponse({ error: error.message }, 500);

    // Additive: per-vendor v_drop_summary projection used by operator
    // LIST reads (service-board.html, drop-manager.html, hosts.html)
    // under the operator-read-auth track. Non-fatal — falls back to []
    // on error so the primary `drops` payload is unaffected.
    let drop_summaries: unknown[] = [];
    try {
      const { data: summaryRows, error: summaryError } = await serviceClient
        .from("v_drop_summary")
        .select("*")
        .eq("vendor_id", vendor.id)
        .order("delivery_start", { ascending: false });
      if (!summaryError && Array.isArray(summaryRows)) {
        drop_summaries = summaryRows;
      }
    } catch {
      drop_summaries = [];
    }

    return jsonResponse({ drops: data ?? [], drop_summaries }, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
