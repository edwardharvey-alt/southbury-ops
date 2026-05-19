import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Operator-only read of drop_host_tokens.host_access_token, used by
// drop-manager.html's "Copy host link" handler. The direct PostgREST
// read failed silently in production because supabase-js does not
// attach the user session JWT to direct requests in this setup
// (publishable-key auth-attach bug — see Operational Learnings #12–#16
// in CLAUDE.md), and drop_host_tokens RLS has no anon SELECT policy.
//
// verify_jwt = false at the gateway. In-function auth.getUser()
// verifies the caller from the Authorization header (supabase-js
// DOES attach the session via functions.invoke), then a service-role
// client confirms the caller owns the drop's vendor before returning
// the token.
//
// Every failure returns the SAME generic 403 body. Callers learn only
// "you are not authorised", never which check failed — this is the
// guard token reads should have by default.

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const jsonResponse = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const notAuthorised = () => jsonResponse({ error: "not_authorised" }, 403);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return notAuthorised();

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) return notAuthorised();

    let body: { drop_id?: unknown };
    try {
      body = await req.json();
    } catch {
      return notAuthorised();
    }

    const dropId = body?.drop_id;
    if (typeof dropId !== "string" || !UUID_REGEX.test(dropId)) {
      return notAuthorised();
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: drop, error: dropError } = await serviceClient
      .from("drops")
      .select("vendor_id")
      .eq("id", dropId)
      .maybeSingle();
    if (dropError || !drop || !drop.vendor_id) return notAuthorised();

    const { data: vendor, error: vendorError } = await serviceClient
      .from("vendors")
      .select("id")
      .eq("id", drop.vendor_id)
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (vendorError || !vendor) return notAuthorised();

    const { data: tokenRow, error: tokenError } = await serviceClient
      .from("drop_host_tokens")
      .select("host_access_token")
      .eq("drop_id", dropId)
      .maybeSingle();
    if (tokenError || !tokenRow || !tokenRow.host_access_token) {
      return notAuthorised();
    }

    return jsonResponse({ host_access_token: tokenRow.host_access_token }, 200);
  } catch {
    return jsonResponse({ error: "not_authorised" }, 403);
  }
});
