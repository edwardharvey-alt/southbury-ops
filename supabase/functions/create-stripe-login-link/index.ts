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
      .select("id, stripe_account_id")
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
      return jsonResponse({ error: "No Stripe account connected" }, 400);
    }

    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecret) {
      console.error("STRIPE_SECRET_KEY not configured");
      return jsonResponse({ error: "Stripe not configured" }, 500);
    }

    const loginResp = await fetch(
      `https://api.stripe.com/v1/accounts/${encodeURIComponent(vendor.stripe_account_id)}/login_links`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecret}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const loginJson = await loginResp.json();
    if (!loginResp.ok) {
      console.error("Stripe login_links create failed", loginJson);
      return jsonResponse(
        { error: loginJson?.error?.message || "Stripe login link creation failed" },
        502
      );
    }

    return jsonResponse({ url: loginJson.url }, 200);
  } catch (err) {
    console.error("create-stripe-login-link unexpected error", err);
    return jsonResponse({ error: (err as Error).message || "Internal error" }, 500);
  }
});
