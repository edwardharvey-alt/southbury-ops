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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const { vendor_id } = await req.json();

    if (!vendor_id || typeof vendor_id !== "string") {
      return jsonResponse({ error: "vendor_id is required" }, 400);
    }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return jsonResponse({ error: "Missing bearer token" }, 401);
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(token);
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "Invalid or expired token" }, 401);
    }

    const { data: vendor, error: vendorErr } = await supabaseAuth
      .from("vendors")
      .select("id, stripe_account_id, stripe_onboarding_complete")
      .eq("id", vendor_id)
      .maybeSingle();

    if (vendorErr) {
      console.error("vendor lookup failed", vendorErr);
      return jsonResponse({ error: "Vendor lookup failed" }, 500);
    }
    if (!vendor) {
      return jsonResponse({ error: "Vendor not found or access denied" }, 403);
    }

    if (!vendor.stripe_account_id) {
      return jsonResponse({ complete: false, reason: "not_started" }, 200);
    }

    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecret) {
      console.error("STRIPE_SECRET_KEY not configured");
      return jsonResponse({ error: "Stripe not configured" }, 500);
    }

    const acctResp = await fetch(
      `https://api.stripe.com/v1/accounts/${encodeURIComponent(vendor.stripe_account_id)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${stripeSecret}`,
        },
      }
    );

    const acctJson = await acctResp.json();
    if (!acctResp.ok) {
      console.error("Stripe account fetch failed", acctJson);
      return jsonResponse(
        { error: acctJson?.error?.message || "Stripe account fetch failed" },
        502
      );
    }

    const details_submitted = !!acctJson.details_submitted;
    const charges_enabled = !!acctJson.charges_enabled;
    const payouts_enabled = !!acctJson.payouts_enabled;
    const complete = details_submitted && charges_enabled && payouts_enabled;

    if (complete && !vendor.stripe_onboarding_complete) {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { error: updateErr } = await supabaseAdmin
        .from("vendors")
        .update({ stripe_onboarding_complete: true })
        .eq("id", vendor_id);

      if (updateErr) {
        console.error("vendor stripe_onboarding_complete update failed", updateErr);
      }
    }

    return jsonResponse(
      {
        complete,
        details_submitted,
        charges_enabled,
        payouts_enabled,
      },
      200
    );
  } catch (err) {
    console.error("check-stripe-connect-status unexpected error", err);
    return jsonResponse({ error: (err as Error).message || "Internal error" }, 500);
  }
});
