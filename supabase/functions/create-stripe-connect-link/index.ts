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
    const { vendor_id, return_url, refresh_url } = await req.json();

    if (!vendor_id || typeof vendor_id !== "string") {
      return jsonResponse({ error: "vendor_id is required" }, 400);
    }
    if (!return_url || typeof return_url !== "string") {
      return jsonResponse({ error: "return_url is required" }, 400);
    }
    if (!refresh_url || typeof refresh_url !== "string") {
      return jsonResponse({ error: "refresh_url is required" }, 400);
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
      .select("id, contact_email, email, stripe_account_id")
      .eq("id", vendor_id)
      .maybeSingle();

    if (vendorErr) {
      console.error("vendor lookup failed", vendorErr);
      return jsonResponse({ error: "Vendor lookup failed" }, 500);
    }
    if (!vendor) {
      return jsonResponse({ error: "Vendor not found or access denied" }, 403);
    }

    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecret) {
      console.error("STRIPE_SECRET_KEY not configured");
      return jsonResponse({ error: "Stripe not configured" }, 500);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let stripeAccountId: string | null = vendor.stripe_account_id ?? null;

    if (!stripeAccountId) {
      const email = vendor.contact_email || vendor.email || userData.user.email || "";

      const accountForm = new URLSearchParams();
      accountForm.set("type", "express");
      accountForm.set("country", "GB");
      if (email) accountForm.set("email", email);
      accountForm.set("capabilities[card_payments][requested]", "true");
      accountForm.set("capabilities[transfers][requested]", "true");
      accountForm.set("business_type", "individual");

      const accountResp = await fetch("https://api.stripe.com/v1/accounts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecret}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: accountForm.toString(),
      });

      const accountJson = await accountResp.json();
      if (!accountResp.ok) {
        console.error("Stripe account create failed", accountJson);
        return jsonResponse(
          { error: accountJson?.error?.message || "Stripe account creation failed" },
          502
        );
      }

      stripeAccountId = accountJson.id as string;

      const { error: updateErr } = await supabaseAdmin
        .from("vendors")
        .update({ stripe_account_id: stripeAccountId })
        .eq("id", vendor_id);

      if (updateErr) {
        console.error("vendor stripe_account_id update failed", updateErr);
        return jsonResponse(
          { error: "Stripe account created but vendor link failed" },
          500
        );
      }
    }

    const linkForm = new URLSearchParams();
    linkForm.set("account", stripeAccountId!);
    linkForm.set("refresh_url", refresh_url);
    linkForm.set("return_url", return_url);
    linkForm.set("type", "account_onboarding");

    const linkResp = await fetch("https://api.stripe.com/v1/account_links", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: linkForm.toString(),
    });

    const linkJson = await linkResp.json();
    if (!linkResp.ok) {
      console.error("Stripe account_links create failed", linkJson);
      return jsonResponse(
        { error: linkJson?.error?.message || "Stripe link creation failed" },
        502
      );
    }

    return jsonResponse({ url: linkJson.url }, 200);
  } catch (err) {
    console.error("create-stripe-connect-link unexpected error", err);
    return jsonResponse({ error: (err as Error).message || "Internal error" }, 500);
  }
});
