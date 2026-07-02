import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// PUBLIC Edge Function — part of the whitelist + self-serve vendor
// activation flow. Invoked with the anon key, no user session.
//
// Deploys with JWT verification OFF (verify_jwt = false in
// supabase/config.toml, deploy with --no-verify-jwt). There is no
// caller identity to gate on; possession of a valid emailed code is
// the proof of ownership. Brute force is bounded by the per-code
// attempts ceiling (5) and the 15-minute expiry.
//
// All privileged reads/writes use the service-role client. On a code
// match the function creates the auth user, links it to the pending
// vendor row by id (replacing invite-vendor's brittle
// .update().eq('email') with a primary-key + race-guarded update),
// and consumes the code.

const MIN_PASSWORD_LENGTH = 8; // matches set-password.html policy
const MAX_ATTEMPTS = 5;

function isValidEmail(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
    const emailInput = body.email;
    const codeInput = body.code;
    const passwordInput = body.password;

    if (!isValidEmail(emailInput)) {
      return jsonResponse({ error: "A valid email is required" }, 400);
    }
    const email = (emailInput as string).trim().toLowerCase();

    const code = typeof codeInput === "string" ? codeInput.trim() : "";
    if (!code) {
      return jsonResponse({ error: "A code is required" }, 400);
    }

    if (typeof passwordInput !== "string" || passwordInput.length < MIN_PASSWORD_LENGTH) {
      return jsonResponse(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        400
      );
    }
    const password = passwordInput;

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find the pending whitelisted vendor (no owner yet, exact email).
    // maybeSingle() errors on >1 row; treat any error/absence as invalid.
    const { data: vendor, error: vendorErr } = await serviceClient
      .from("vendors")
      .select("id")
      .is("auth_user_id", null)
      .eq("email", email)
      .maybeSingle();

    if (vendorErr || !vendor) {
      return jsonResponse({ error: "invalid" }, 400);
    }
    const vendorId = vendor.id as string;

    // Latest unconsumed, unexpired code for this vendor.
    const { data: codeRow, error: codeErr } = await serviceClient
      .from("vendor_activation_codes")
      .select("id, code_hash, attempts")
      .eq("vendor_id", vendorId)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (codeErr || !codeRow) {
      return jsonResponse({ error: "expired" }, 400);
    }

    const attempts = Number(codeRow.attempts ?? 0);
    if (attempts >= MAX_ATTEMPTS) {
      return jsonResponse({ error: "locked" }, 400);
    }

    const submittedHash = await sha256Hex(code);
    if (submittedHash !== codeRow.code_hash) {
      // Wrong code: burn an attempt against this code row.
      await serviceClient
        .from("vendor_activation_codes")
        .update({ attempts: attempts + 1 })
        .eq("id", codeRow.id);
      return jsonResponse({ error: "invalid_code" }, 400);
    }

    // Code matched. Create the auth user (email pre-confirmed).
    const { data: created, error: createErr } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createErr || !created?.user) {
      // Most likely cause: the email already has an auth user.
      const msg = (createErr?.message || "").toLowerCase();
      if (
        msg.includes("already") ||
        msg.includes("exist") ||
        msg.includes("registered") ||
        (createErr as { status?: number } | null)?.status === 422
      ) {
        return jsonResponse({ error: "exists" }, 409);
      }
      console.error("[verify-activation] createUser failed", createErr?.message);
      return jsonResponse({ error: "invalid" }, 400);
    }

    const newUserId = created.user.id;

    // Link by primary key with a race guard: only claim the row if it is
    // still unowned. This replaces invite-vendor's brittle
    // .update().eq('email') (which can match the wrong/multiple rows and
    // races a concurrent activation).
    const { data: linked, error: linkErr } = await serviceClient
      .from("vendors")
      .update({ auth_user_id: newUserId })
      .eq("id", vendorId)
      .is("auth_user_id", null)
      .select("id");

    if (linkErr || !linked || linked.length === 0) {
      // Lost the race (or the row was claimed/changed). Roll back the
      // just-created auth user so a retry can succeed cleanly.
      try {
        await serviceClient.auth.admin.deleteUser(newUserId);
      } catch (delErr) {
        console.error("[verify-activation] rollback deleteUser failed", delErr);
      }
      return jsonResponse({ error: "exists" }, 409);
    }

    // Consume the code so it cannot be reused.
    const { error: consumeErr } = await serviceClient
      .from("vendor_activation_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", codeRow.id);

    if (consumeErr) {
      // Non-fatal: the vendor is activated. Log and continue — the code
      // is single-use against an already-owned vendor, which now fails
      // the pending-vendor lookup anyway.
      console.error("[verify-activation] mark consumed failed", consumeErr.message);
    }

    console.log(`[verify-activation] activated vendor=${vendorId}`);
    return jsonResponse({ status: "activated" }, 200);
  } catch (err) {
    console.error("[verify-activation] unexpected error", err);
    return jsonResponse({ error: (err as Error).message || "Internal error" }, 500);
  }
});
