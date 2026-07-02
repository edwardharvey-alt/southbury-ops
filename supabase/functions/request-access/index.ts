import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { buildFromHeader, FROM_HELLO } from "../_shared/email.ts";

// PUBLIC Edge Function — part of the whitelist + self-serve vendor
// activation flow. Invoked with the anon key, no user session.
//
// Deploys with JWT verification OFF (verify_jwt = false in
// supabase/config.toml, deploy with --no-verify-jwt). It accepts an
// access request from a vendor who is not yet on the whitelist,
// records it in vendor_access_requests for an admin to review, and
// then sends a notification email to hello@lovehearth.co.uk so the
// request is seen rather than sitting silently in the table.
//
// The database insert is the source of truth. The notification email
// is a best-effort courtesy: if Resend is unavailable or the key is
// unset, the request is still recorded and the vendor still receives
// a "received" confirmation. An email failure never loses the request
// and is never surfaced to the vendor.

function isValidEmail(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function asTrimmedString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

// Escape user-supplied text before placing it in the notification
// HTML. These fields come from a public, unauthenticated form, so we
// never trust them to be HTML-safe.
function escapeHtml(v: string | null): string {
  if (!v) return "";
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

    if (!isValidEmail(body.email)) {
      return jsonResponse({ error: "A valid email is required" }, 400);
    }
    const email = (body.email as string).trim().toLowerCase();
    const businessName = asTrimmedString(body.business_name);
    const area = asTrimmedString(body.area);
    const note = asTrimmedString(body.note);

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Source of truth: record the request.
    const { error: insertErr } = await serviceClient
      .from("vendor_access_requests")
      .insert({
        business_name: businessName,
        email,
        area,
        note,
      });

    if (insertErr) {
      console.error("[request-access] insert failed", insertErr.message);
      return jsonResponse({ error: "Could not record your request" }, 500);
    }

    console.log(`[request-access] received email=${email}`);

    // 2. Best-effort notification to hello@lovehearth.co.uk.
    //    Wrapped so nothing here can fail the request or reach the vendor.
    try {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (!resendKey) {
        console.warn(
          "[request-access] RESEND_API_KEY not set — notification skipped"
        );
      } else {
        const displayBusiness = businessName || email;
        const subject = `New vendor access request — ${displayBusiness}`;

        const noteHtml = note
          ? escapeHtml(note).replace(/\n/g, "<br>")
          : "—";

        const htmlBody =
          `<!doctype html><html><head><meta charset="utf-8">` +
          `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
          `<title>New vendor access request</title></head>` +
          `<body style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color:#1F2937; line-height:1.5;">` +
          `<p>A vendor has requested access to Hearth.</p>` +
          `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">` +
          `<tr><td style="padding:4px 24px 4px 0; color:#6B7280;">Business</td><td style="padding:4px 0;">${escapeHtml(businessName) || "—"}</td></tr>` +
          `<tr><td style="padding:4px 24px 4px 0; color:#6B7280;">Email</td><td style="padding:4px 0;">${escapeHtml(email)}</td></tr>` +
          `<tr><td style="padding:4px 24px 4px 0; color:#6B7280;">Area</td><td style="padding:4px 0;">${escapeHtml(area) || "—"}</td></tr>` +
          `<tr><td style="padding:4px 24px 4px 0; color:#6B7280; vertical-align:top;">Note</td><td style="padding:4px 0;">${noteHtml}</td></tr>` +
          `</table>` +
          `<p style="color:#6B7280; font-size:13px; margin-top:20px;">Recorded in vendor_access_requests. Reply to this email to reach the vendor directly.</p>` +
          `</body></html>`;

        const resendPayload: Record<string, unknown> = {
          from: buildFromHeader("Hearth", FROM_HELLO),
          to: FROM_HELLO,
          subject,
          html: htmlBody,
          reply_to: email,
        };

        const resendResp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(resendPayload),
        });

        if (!resendResp.ok) {
          const errBody = await resendResp.text().catch(() => "");
          console.error(
            "[request-access] notification email failed",
            resendResp.status,
            errBody
          );
        } else {
          console.log("[request-access] notification email sent");
        }
      }
    } catch (mailErr) {
      console.error("[request-access] notification email threw", mailErr);
    }

    return jsonResponse({ status: "received" }, 200);
  } catch (err) {
    console.error("[request-access] unexpected error", err);
    return jsonResponse({ error: (err as Error).message || "Internal error" }, 500);
  }
});
