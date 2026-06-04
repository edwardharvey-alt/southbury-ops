import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Dual-authenticated read/write for activation touchpoint events.
//
// activation_events is sealed to anon and authenticated, so all access
// goes through the service-role client here after the caller is
// authorised by one of two paths:
//
//   - Vendor path: an Authorization: Bearer <jwt> header. The JWT is
//     verified in-function via auth.getUser() (the gateway uses
//     verify_jwt = false because operator JWTs are ES256-signed and
//     because the host path below has no JWT at all — see CLAUDE.md
//     operational learning #18). The user is mapped to a vendor by
//     auth_user_id, and that vendor must own drop_id. actor = 'vendor'.
//     Mirrors get-drop's ownership check exactly.
//
//   - Host path: a host_token in the body. It is validated against
//     drop_host_tokens.host_access_token for THIS drop_id only, the
//     same comparison host-view-summary performs. A host token for one
//     drop can never authorise another drop's events. actor = 'host'.
//
// actor is always derived from whichever auth path succeeds — it is
// never read from the request body.

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = {
  op?: unknown;
  drop_id?: unknown;
  touchpoint?: unknown;
  action?: unknown;
  meta?: unknown;
  host_token?: unknown;
};

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
    let body: Body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const op = body.op;
    const drop_id = body.drop_id;

    if (op !== "log" && op !== "list") {
      return jsonResponse({ error: "op must be 'log' or 'list'" }, 400);
    }
    if (typeof drop_id !== "string" || !drop_id) {
      return jsonResponse({ error: "drop_id is required" }, 400);
    }
    if (!UUID_REGEX.test(drop_id)) {
      return jsonResponse({ error: "drop_id must be a UUID" }, 400);
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Resolve the caller. Same logic for both ops. actor is set only
    // from the auth path that succeeds, never from the request body.
    let actor: "vendor" | "host";

    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      // Vendor path — verify JWT, map user to vendor, confirm ownership.
      const anonClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!
      );
      const { data: { user }, error: authError } = await anonClient.auth.getUser(
        authHeader.replace("Bearer ", "")
      );
      if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

      const { data: vendor, error: vendorError } = await serviceClient
        .from("vendors")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (vendorError) return jsonResponse({ error: "Vendor lookup failed" }, 500);
      if (!vendor) {
        return jsonResponse({ error: "Vendor not found or not owned by user" }, 403);
      }

      const { data: drop, error: dropError } = await serviceClient
        .from("drops")
        .select("id")
        .eq("id", drop_id)
        .eq("vendor_id", vendor.id)
        .maybeSingle();
      if (dropError) return jsonResponse({ error: "Drop lookup failed" }, 500);
      if (!drop) return jsonResponse({ error: "Drop not found" }, 404);

      actor = "vendor";
    } else if (typeof body.host_token === "string" && body.host_token) {
      // Host path — validate the token against THIS drop's host token.
      const host_token = body.host_token;
      const { data: tokenRow, error: tokenError } = await serviceClient
        .from("drop_host_tokens")
        .select("host_access_token")
        .eq("drop_id", drop_id)
        .maybeSingle();
      if (tokenError) return jsonResponse({ error: "not_authorised" }, 403);
      if (!tokenRow) return jsonResponse({ error: "not_authorised" }, 403);
      if (tokenRow.host_access_token !== host_token) {
        return jsonResponse({ error: "not_authorised" }, 403);
      }

      actor = "host";
    } else {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    if (op === "log") {
      const { touchpoint, action, meta } = body;
      if (typeof touchpoint !== "string" || !touchpoint) {
        return jsonResponse({ error: "touchpoint is required" }, 400);
      }
      if (typeof action !== "string" || !action) {
        return jsonResponse({ error: "action is required" }, 400);
      }

      const { data: inserted, error: insertError } = await serviceClient
        .from("activation_events")
        .insert({
          drop_id,
          actor,
          touchpoint,
          action,
          meta: meta ?? null,
        })
        .select("*")
        .single();

      if (insertError) return jsonResponse({ error: insertError.message }, 500);
      return jsonResponse(inserted, 200);
    }

    // op === "list"
    const { data: events, error: listError } = await serviceClient
      .from("activation_events")
      .select("*")
      .eq("drop_id", drop_id)
      .order("created_at", { ascending: false });

    if (listError) return jsonResponse({ error: listError.message }, 500);
    return jsonResponse(events ?? [], 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
