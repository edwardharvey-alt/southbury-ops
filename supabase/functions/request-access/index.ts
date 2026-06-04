import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// PUBLIC Edge Function — part of the whitelist + self-serve vendor
// activation flow. Invoked with the anon key, no user session.
//
// Deploys with JWT verification OFF (verify_jwt = false in
// supabase/config.toml, deploy with --no-verify-jwt). It accepts an
// access request from a vendor who is not yet on the whitelist and
// records it in vendor_access_requests for an admin to review. No
// caller identity to gate on; the only write is an append to the
// requests table via the service-role client.

function isValidEmail(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function asTrimmedString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

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
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const body = (raw as Record<string, unknown> | null) ?? {};

    if (!isValidEmail(body.email)) {
      return jsonResponse({ error: "A valid email is required" }, 400);
    }
    const email = (body.email as string).trim().toLowerCase();

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error: insertErr } = await serviceClient
      .from("vendor_access_requests")
      .insert({
        business_name: asTrimmedString(body.business_name),
        email,
        area: asTrimmedString(body.area),
        note: asTrimmedString(body.note),
      });

    if (insertErr) {
      console.error("[request-access] insert failed", insertErr.message);
      return jsonResponse({ error: "Could not record your request" }, 500);
    }

    console.log(`[request-access] received email=${email}`);
    return jsonResponse({ status: "received" }, 200);
  } catch (err) {
    console.error("[request-access] unexpected error", err);
    return jsonResponse({ error: (err as Error).message || "Internal error" }, 500);
  }
});
