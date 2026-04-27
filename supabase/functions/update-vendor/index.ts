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

// Whitelist of vendor columns that can be updated via this function.
// Anything outside this list is silently dropped from the payload.
//
// Intentionally excluded (must never be client-editable):
//   id, auth_user_id, slug, created_at,
//   stripe_account_id, stripe_onboarding_complete,
//   terms_accepted, terms_accepted_at,
//   onboarding_completed (changed only by onboarding flow's final step)
//
// If you need to add a new editable column, add it here. Anything not
// in this list is ignored, not rejected — so adding new fields to the
// client form without updating this list will silently no-op.
const ALLOWED_FIELDS = new Set([
  // Identity
  "name",
  "display_name",
  "tagline",
  "order_label",
  "contact_phone",
  "website_url",
  "address",
  "social_handles",

  // Brand
  "logo_url",
  "hero_image_url",
  "brand_primary_color",
  "brand_secondary_color",
  "brand_text_on_primary",

  // Onboarding answers (covers future onboarding migration without code change)
  "vendor_type",
  "data_posture",
  "delivery_model",
  "customer_data_posture",
  "customer_geography",
  "primary_goal",
  "typical_capacity_range",
  "preferred_fulfilment",
  "preferred_cadence",
  "existing_host_contexts",
  "existing_host_details",
  "pos_platform",
  "pos_platform_other",

  // UI dismissals
  "head_start_dismissed",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // 1. Identify the user via the JWT they sent.
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

  // 2. Parse the request body. Expect { vendor_id, fields: { ... } }.
  let body: { vendor_id?: string; fields?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { vendor_id, fields } = body;
  if (!vendor_id) return jsonResponse({ error: "vendor_id is required" }, 400);
  if (!fields || typeof fields !== "object") {
    return jsonResponse({ error: "fields object is required" }, 400);
  }

  // 3. Verify the user owns this vendor. This is the security check.
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

  // 4. Filter the payload through the whitelist.
  const update: Record<string, unknown> = {};
  for (const key of Object.keys(fields)) {
    if (ALLOWED_FIELDS.has(key)) {
      update[key] = fields[key];
    }
  }

  if (Object.keys(update).length === 0) {
    return jsonResponse({ error: "No valid fields to update" }, 400);
  }

  // 5. Perform the update.
  const { data, error } = await serviceClient
    .from("vendors")
    .update(update)
    .eq("id", vendor_id)
    .select()
    .single();

  if (error) return jsonResponse({ error: error.message }, 400);
  return jsonResponse(data, 200);
});
