import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Vendor-facing comms-log read (T5-11). For a single drop owned by the
// authenticated vendor, returns a per-touchpoint summary of comms_log rows
// recorded against that drop — the dispatch ledger written by the comms
// engine. Each entry aggregates one (touchpoint, channel) pair into sent /
// failed / pending tallies plus the most recent send timestamp.
//
// verify_jwt = false at the gateway + in-function supabase.auth.getUser(),
// mirroring get-drop-signals: the calling user is resolved to a vendor via
// vendors.auth_user_id, and drop ownership is asserted before any rows are
// returned. Rows are read with a service-role client so RLS on comms_log
// (service-role only, no policies) cannot silently zero the result.
//
// Body: { vendor_id, drop_id }
// Returns: { touchpoints: [{ touchpoint, channel, sent, failed, pending, last_sent_at }] }

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

    // ---- Comms summary: one service-role fetch of this drop's comms_log
    //      rows, aggregated in memory into one entry per (touchpoint, channel)
    //      pair. Scoped by drop_id (drop ownership already verified above) so
    //      only this drop's sends are summarised. ----
    const { data: rows, error: rowsErr } = await serviceClient
      .from("comms_log")
      .select("touchpoint, channel, status, sent_at")
      .eq("drop_id", drop_id);
    if (rowsErr) return jsonResponse({ error: "Read failed" }, 500);

    const byTouchpoint = new Map();
    for (const r of rows ?? []) {
      const key = `${r.touchpoint}|${r.channel}`;
      const e = byTouchpoint.get(key) ?? { touchpoint: r.touchpoint, channel: r.channel, sent: 0, failed: 0, pending: 0, last_sent_at: null };
      if (r.status === "sent") e.sent++;
      else if (r.status === "failed") e.failed++;
      else e.pending++;
      if (r.sent_at && (!e.last_sent_at || r.sent_at > e.last_sent_at)) e.last_sent_at = r.sent_at;
      byTouchpoint.set(key, e);
    }
    const touchpoints = [...byTouchpoint.values()].sort((a, b) => {
      if (a.last_sent_at && b.last_sent_at) return a.last_sent_at < b.last_sent_at ? 1 : -1;
      if (a.last_sent_at) return -1;
      if (b.last_sent_at) return 1;
      return 0;
    });
    return jsonResponse({ touchpoints }, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
