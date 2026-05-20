import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// get-demand-preview — operator-read-auth Slice 7b.
//
// Replaces drop-manager.html's two-step demand-preview client-side
// join (.from("customer_relationships") then .from("customers") with
// .in("id", customerIds) and a client-side outward-code filter).
// Collapses both reads into a single server-side aggregate: takes an
// outward_code, returns the integer count of the vendor's customers
// whose postcode resolves to that outward code. Zero PII over the
// wire — only the integer count crosses the boundary.
//
// Canonical auth pattern (JWT verification via auth.getUser, vendor
// resolution via vendors.auth_user_id, service-role reads after auth).
// Non-fatal: any error or missing/invalid outward_code returns
// { customer_count: 0, 200 } so the demand-preview chip degrades to
// "no signal" rather than erroring.

// MIRROR of drop-manager.html's extractOutwardCode (line 2801).
// If these implementations diverge, the demand-preview chip will
// show different numbers post-migration. Strict mirroring matters.
function extractOutwardCode(postcode: unknown): string | null {
  const raw = String(postcode || "").trim().toUpperCase();
  if (raw.length < 2) return null;
  const outward = raw.split(" ")[0];
  return outward || null;
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

    let body: { outward_code?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ customer_count: 0 }, 200);
    }

    const targetRaw = typeof body?.outward_code === "string" ? body.outward_code : "";
    const target = targetRaw.toUpperCase().trim();
    if (!target) return jsonResponse({ customer_count: 0 }, 200);

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: vendor, error: vendorError } = await serviceClient
      .from("vendors")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (vendorError) return jsonResponse({ customer_count: 0 }, 200);
    if (!vendor) return jsonResponse({ customer_count: 0 }, 200);

    const { data: rels, error: relsError } = await serviceClient
      .from("customer_relationships")
      .select("customer_id")
      .eq("owner_id", vendor.id)
      .eq("owner_type", "vendor");

    if (relsError) {
      console.error("customer_relationships lookup failed", relsError);
      return jsonResponse({ customer_count: 0 }, 200);
    }

    const customerIds = Array.from(
      new Set((rels ?? []).map((r: any) => r.customer_id).filter(Boolean))
    );
    if (customerIds.length === 0) return jsonResponse({ customer_count: 0 }, 200);

    const { data: customers, error: customersError } = await serviceClient
      .from("customers")
      .select("postcode")
      .in("id", customerIds);

    if (customersError) {
      console.error("customers lookup failed", customersError);
      return jsonResponse({ customer_count: 0 }, 200);
    }

    const customerCount = (customers ?? []).filter((c: any) => {
      const oc = extractOutwardCode(c?.postcode);
      return oc && oc === target;
    }).length;

    return jsonResponse({ customer_count: customerCount }, 200);
  } catch (err) {
    console.error("[get-demand-preview] threw:", err);
    return jsonResponse({ customer_count: 0 }, 200);
  }
});
