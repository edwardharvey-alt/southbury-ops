import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Protected onboarding-completion writes.
//
// This function exists because some vendor columns must never be writable
// through the general-purpose update-vendor endpoint:
//   - onboarding_completed
//   - terms_accepted
//   - terms_accepted_at
//
// These columns gate downstream platform behaviour (drop publish gate,
// terms-of-participation enforcement, billing eligibility) and the
// timestamp must be authoritative — generated server-side, not trusted
// from the client.
//
// The auth model mirrors update-vendor exactly: in-function JWT
// verification via the anon client, vendor ownership check, then the
// actual write via the service-role client.

type Step = "preferences" | "terms";

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

  // 2. Parse the request body. Expect { vendor_id, step }.
  let body: { vendor_id?: string; step?: Step };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { vendor_id, step } = body;
  if (!vendor_id) return jsonResponse({ error: "vendor_id is required" }, 400);
  if (step !== "preferences" && step !== "terms") {
    return jsonResponse({ error: "step must be 'preferences' or 'terms'" }, 400);
  }

  // 3. Verify the user owns this vendor.
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

  // 4. Build the per-step update payload. Server-generated timestamps only.
  const update: Record<string, unknown> =
    step === "preferences"
      ? { onboarding_completed: true }
      : { terms_accepted: true, terms_accepted_at: new Date().toISOString() };

  // 5. Perform the update.
  const { error } = await serviceClient
    .from("vendors")
    .update(update)
    .eq("id", vendor_id);

  if (error) return jsonResponse({ error: error.message }, 400);
  return jsonResponse({ ok: true }, 200);
});
