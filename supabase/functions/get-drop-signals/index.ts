import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Vendor-facing demand-signal read (T5-8). For a single drop owned by the
// authenticated vendor, returns the count of drop_signals rows registered
// against that drop by kind: 'interest' (pre-open registrations) and
// 'waitlist' (post-fill registrations) — the demand captured by the
// anonymous register-interest flow.
//
// verify_jwt = false at the gateway + in-function supabase.auth.getUser(),
// mirroring transition-drop-status: the calling user is resolved to a vendor
// via vendors.auth_user_id, and drop ownership is asserted before any count is
// returned. Counts are taken with a service-role client so RLS on
// drop_signals cannot silently zero the result.
//
// Body: { vendor_id, drop_id }
// Returns: { interest_count, waitlist_count }

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

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    // ---- Auth: in-function JWT verification (mirrors transition-drop-status) ----
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

    let body: { vendor_id?: string; drop_id?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { vendor_id, drop_id } = body;
    if (!vendor_id) return jsonResponse({ error: "vendor_id is required" }, 400);
    if (!drop_id) return jsonResponse({ error: "drop_id is required" }, 400);

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ---- Vendor ownership check ----
    const { data: vendor, error: ownershipError } = await serviceClient
      .from("vendors")
      .select("id")
      .eq("id", vendor_id)
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (ownershipError) return jsonResponse({ error: "Ownership check failed" }, 500);
    if (!vendor) return jsonResponse({ error: "Vendor not found or not owned by user" }, 403);

    // ---- Drop ownership check ----
    const { data: drop, error: dropErr } = await serviceClient
      .from("drops")
      .select("id")
      .eq("id", drop_id)
      .eq("vendor_id", vendor_id)
      .maybeSingle();
    if (dropErr) return jsonResponse({ error: "Drop lookup failed" }, 500);
    if (!drop) return jsonResponse({ error: "Drop not found" }, 404);

    // ---- Counts: one service-role fetch of (kind) for this drop, tallied
    //      in memory. Scoped by drop_id (the drop ownership already verified
    //      above) so only this drop's demand signals are counted. ----
    const { data: signals, error: signalsErr } = await serviceClient
      .from("drop_signals")
      .select("kind")
      .eq("drop_id", drop_id);
    if (signalsErr) return jsonResponse({ error: "Signal lookup failed" }, 500);

    let interest_count = 0;
    let waitlist_count = 0;
    for (const row of signals || []) {
      if (row.kind === "interest") interest_count++;
      else if (row.kind === "waitlist") waitlist_count++;
    }

    return jsonResponse({ interest_count, waitlist_count }, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
