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

  const body = await req.json();
  const {
    name,
    host_type,
    postcode,
    slug,
    vendor_id,
    created_by_vendor_id,
    terms_accepted,
    terms_accepted_at,
  } = body;

  const { data: vendor, error: ownershipError } = await serviceClient
    .from("vendors")
    .select("id")
    .eq("id", vendor_id)
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (ownershipError) return jsonResponse({ error: "Ownership check failed" }, 500);
  if (!vendor) return jsonResponse({ error: "Vendor not found or not owned by user" }, 403);

  // terms_accepted and terms_accepted_at are optional for backwards
  // compatibility with the inline "+ New Host" flow in Drop Studio
  // (drop-manager.html:createHostInline), which does not yet capture
  // terms acceptance. hosts.html sends both. Backlog: add terms capture
  // to Drop Studio inline host creation and require both fields here.
  const insertPayload: Record<string, unknown> = {
    name,
    host_type,
    postcode,
    slug,
    vendor_id,
    created_by_vendor_id,
  };
  if (terms_accepted === true) {
    insertPayload.terms_accepted = true;
    insertPayload.terms_accepted_at = terms_accepted_at ?? new Date().toISOString();
  }

  const { data, error } = await serviceClient
    .from("hosts")
    .insert(insertPayload)
    .select()
    .single();

  if (error) return jsonResponse({ error: error.message }, 400);
  return jsonResponse(data, 200);
});
