import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// PUBLIC Edge Function — part of the whitelist + self-serve vendor
// activation flow. Invoked with the anon key, no user session.
//
// Deploys with JWT verification OFF (verify_jwt = false in
// supabase/config.toml, deploy with --no-verify-jwt). There is no
// caller identity to gate on — anyone can request a sign-in code for
// any email. The function only ever emits a code to an email that
// matches a pending (auth_user_id IS NULL) whitelisted vendor row, so
// it leaks nothing to non-approved addresses (it returns the same
// shape regardless of whether a vendor exists — see "not_approved").
//
// All privileged reads/writes use the service-role client.

const RESEND_URL = "https://api.resend.com/emails";

// Reuse the proven verified sending address (send-order-confirmation /
// send-early-access-email both send from lovehearth.co.uk).
const FROM_HEADER = '"Hearth" <orders@lovehearth.co.uk>';

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const RATE_WINDOW_MS = 60 * 1000; // 60 seconds

function isValidEmail(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

// SHA-256 hex digest of the plain code.
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Random 6-digit numeric code, zero-padded, from the CSPRNG.
function generateCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return n.toString().padStart(6, "0");
}

function buildCodeEmailHtml(code: string): string {
  return `
<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1F2937;background:#ffffff;">
  <p style="margin:0 0 16px;font-size:15px;line-height:1.65;">Here is your sign-in code:</p>
  <p style="margin:0 0 16px;font-size:32px;font-weight:700;letter-spacing:6px;color:#3D3530;">${code}</p>
  <p style="margin:0 0 16px;font-size:15px;line-height:1.65;">Enter it on the Hearth sign-up page to finish setting up your account. The code lasts 15 minutes.</p>
  <p style="margin:0;font-size:13px;line-height:1.6;color:#9CA3AF;">If you didn't ask for this, you can ignore this email.</p>
</div>`.trim();
}

function buildCodeEmailText(code: string): string {
  return [
    "Here is your sign-in code:",
    "",
    code,
    "",
    "Enter it on the Hearth sign-up page to finish setting up your account. The code lasts 15 minutes.",
    "",
    "If you didn't ask for this, you can ignore this email.",
  ].join("\n");
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

    const emailInput = (raw as Record<string, unknown> | null)?.email;
    if (!isValidEmail(emailInput)) {
      return jsonResponse({ error: "A valid email is required" }, 400);
    }
    const email = (emailInput as string).trim().toLowerCase();

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find the pending whitelisted vendor: a row with no owner yet whose
    // email matches exactly (lowercased). maybeSingle() errors on >1 row;
    // we treat any error as "not found" so a duplicate-email data quirk
    // never leaks a code or a distinguishable response.
    const { data: vendor, error: vendorErr } = await serviceClient
      .from("vendors")
      .select("id")
      .is("auth_user_id", null)
      .eq("email", email)
      .maybeSingle();

    if (vendorErr || !vendor) {
      return jsonResponse({ status: "not_approved" }, 200);
    }

    const vendorId = vendor.id as string;
    const nowMs = Date.now();

    // Rate guard: if an unconsumed, unexpired code for this vendor was
    // created less than 60s ago, do not generate another — just report
    // that a code is on its way. Keeps the inbox and the table clean and
    // throttles enumeration / spam.
    const { data: recentCode } = await serviceClient
      .from("vendor_activation_codes")
      .select("id, created_at")
      .eq("vendor_id", vendorId)
      .is("consumed_at", null)
      .gt("expires_at", new Date(nowMs).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentCode?.created_at) {
      const ageMs = nowMs - new Date(recentCode.created_at as string).getTime();
      if (ageMs >= 0 && ageMs < RATE_WINDOW_MS) {
        return jsonResponse({ status: "code_sent" }, 200);
      }
    }

    // Generate + hash a fresh code.
    const code = generateCode();
    const codeHash = await sha256Hex(code);

    // Mark any prior unconsumed codes for this vendor consumed, so only
    // the newest code is ever live.
    const { error: invalidateErr } = await serviceClient
      .from("vendor_activation_codes")
      .update({ consumed_at: new Date(nowMs).toISOString() })
      .eq("vendor_id", vendorId)
      .is("consumed_at", null);

    if (invalidateErr) {
      console.error("[request-activation] invalidate prior codes failed", invalidateErr.message);
      return jsonResponse({ error: "Could not issue a code" }, 500);
    }

    const { error: insertErr } = await serviceClient
      .from("vendor_activation_codes")
      .insert({
        vendor_id: vendorId,
        code_hash: codeHash,
        expires_at: new Date(nowMs + CODE_TTL_MS).toISOString(),
        attempts: 0,
      });

    if (insertErr) {
      console.error("[request-activation] insert code failed", insertErr.message);
      return jsonResponse({ error: "Could not issue a code" }, 500);
    }

    // Email the plain code via Resend.
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.error("[request-activation] RESEND_API_KEY not configured");
      return jsonResponse({ error: "Email is not configured" }, 500);
    }

    const resendResp = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_HEADER,
        to: email,
        subject: "Your Hearth sign-in code",
        html: buildCodeEmailHtml(code),
        text: buildCodeEmailText(code),
        tags: [{ name: "trigger", value: "activation_code" }],
      }),
    });

    if (!resendResp.ok) {
      const errBody = await resendResp.text().catch(() => "");
      console.error("[request-activation] Resend error", resendResp.status, errBody);
      return jsonResponse({ error: "Could not send the code" }, 500);
    }

    console.log(`[request-activation] code sent vendor=${vendorId}`);
    return jsonResponse({ status: "code_sent" }, 200);
  } catch (err) {
    console.error("[request-activation] unexpected error", err);
    return jsonResponse({ error: (err as Error).message || "Internal error" }, 500);
  }
});
