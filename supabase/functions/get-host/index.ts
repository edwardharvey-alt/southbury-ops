import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = "https://lovehearth.co.uk";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Explicit column whitelist — never use select('*') here.
//
// Deliberate divergence from list-hosts: this whitelist INCLUDES
// notes_internal. list-hosts hydrates a directory view (multiple hosts
// surfaced in a list, lower-trust render path) and excludes
// notes_internal by convention. get-host is an owner-scoped single-row
// fetch — the authenticated vendor reading their own host record. The
// host-profile editor needs notes_internal to populate its "Internal
// notes" textarea; without it, the field would load empty and a save
// would clobber the prior value with null. Different threat model,
// different whitelist. Do not "align" this with list-hosts without
// understanding the editor consequences.
const HOST_COLUMNS = [
  "id",
  "name",
  "slug",
  "host_type",
  "status",
  "relationship_status",
  "onboarding_completed",
  "postcode",
  "address_summary",
  "contact_name",
  "contact_email",
  "contact_phone",
  "website_url",
  "social_handles",
  "audience_description",
  "estimated_audience_size",
  "audience_tags",
  "service_windows",
  "comms_channels",
  "notes_internal",
  "terms_accepted",
  "terms_accepted_at",
  "vendor_id",
  "created_by_vendor_id",
  "created_at",
].join(", ");

Deno.serve(async (req) => {
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

    let body: { vendor_id?: string; host_id?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { vendor_id, host_id } = body;
    if (!vendor_id) return jsonResponse({ error: "vendor_id is required" }, 400);
    if (!host_id) return jsonResponse({ error: "host_id is required" }, 400);

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: vendor, error: ownershipError } = await serviceClient
      .from("vendors")
      .select("id")
      .eq("id", vendor_id)
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (ownershipError) {
      return jsonResponse({ error: "Ownership check failed" }, 500);
    }
    if (!vendor) {
      return jsonResponse({ error: "Vendor not found or not owned by user" }, 403);
    }

    const { data, error } = await serviceClient
      .from("hosts")
      .select(HOST_COLUMNS)
      .eq("vendor_id", vendor_id)
      .eq("id", host_id)
      .maybeSingle();

    if (error) return jsonResponse({ error: error.message }, 500);
    if (!data) return jsonResponse({ error: "Host not found" }, 404);

    return jsonResponse(data, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
