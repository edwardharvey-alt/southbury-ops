import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { buildFromHeader, FROM_HELLO } from "../_shared/email.ts";

// send-catering-confirm — emails the vendor's COMPOSED booking-confirmation
// message to the SINGLE named catering client of a converted (direct) drop.
// The send action behind Activation Card 10 (T-comms-direct step 3a-ii).
//
// This is NOT a broadcast. It clones the plumbing of send-drop-open-email
// (auth, vendor/drop resolution, the branded HTML shell, the Resend call, the
// comms_log ledger) but differs in exactly three deliberate ways:
//   1. Recipient — resolved server-side from the ONE linked catering enquiry
//      (catering_enquiries.converted_drop_id = drop.id AND vendor_id = caller),
//      exactly as get-catering-context (3-pre) resolves it. Never the drop's
//      customer audience. contact_email is nullable (a client may have given a
//      phone only): no email → send nothing, return a clean no-recipient result.
//   2. Body — the vendor's composed message (custom_body) is sent verbatim,
//      wrapped in the shared shell; subject defaults to a vendor-fronted line.
//   3. Dedupe — a single client may legitimately need a re-send ("didn't get
//      it"), so the dedupe_key is timestamp-suffixed (one honest ledger row per
//      send) rather than a claim-gate that would hard-block re-sends.
//
// Vendor-fronted: from = the vendor's display name on hello@lovehearth.co.uk,
// reply_to = the vendor's own email. Never a silent auto-send — the vendor has
// already seen and edited the draft in the card and explicitly clicked Send.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const RESEND_URL = "https://api.resend.com/emails";

// Reused verbatim from send-drop-open-email.
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

  try {
    // ---- Auth (cloned from send-drop-open-email) --------------------
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

    // ---- Body -------------------------------------------------------
    let body: {
      vendor_id?: string;
      drop_id?: string;
      custom_subject?: string | null;
      custom_body?: string | null;
    };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { vendor_id, drop_id, custom_subject, custom_body } = body;
    if (!vendor_id) return jsonResponse({ error: "vendor_id is required" }, 400);
    if (!drop_id)   return jsonResponse({ error: "drop_id is required" }, 400);
    if (!custom_body || !String(custom_body).trim()) {
      return jsonResponse({ error: "custom_body is required" }, 400);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ---- Vendor ownership (cloned) ----------------------------------
    const { data: vendor, error: vendorErr } = await sb
      .from("vendors")
      .select("id, display_name, name, email, brand_primary_color")
      .eq("id", vendor_id)
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (vendorErr) return jsonResponse({ error: "Vendor lookup failed" }, 500);
    if (!vendor)   return jsonResponse({ error: "Vendor not found or not owned by user" }, 403);

    // ---- Drop (scoped to the caller's vendor) -----------------------
    const { data: drop, error: dropErr } = await sb
      .from("drops")
      .select("id, name, slug, status")
      .eq("id", drop_id)
      .eq("vendor_id", vendor_id)
      .maybeSingle();

    if (dropErr) return jsonResponse({ error: "Drop fetch failed" }, 500);
    if (!drop)   return jsonResponse({ error: "Drop not found" }, 404);
    if (["cancelled", "archived"].includes(drop.status)) {
      return jsonResponse({ error: "Cannot send for a cancelled or archived drop" }, 400);
    }

    // ---- Single-client recipient (Gate 2 — same back-link as
    //      get-catering-context: converted_drop_id + vendor_id) --------
    const { data: enquiry, error: enquiryErr } = await sb
      .from("catering_enquiries")
      .select("contact_name, contact_email")
      .eq("converted_drop_id", drop_id)
      .eq("vendor_id", vendor_id)
      .maybeSingle();

    if (enquiryErr) return jsonResponse({ error: "Enquiry lookup failed" }, 500);

    const recipientEmail = (enquiry?.contact_email || "").trim().toLowerCase();
    const recipientName  = (enquiry?.contact_name || "").trim();

    // No email on file (phone-only client, or no linked enquiry). Send nothing;
    // return a clean no-recipient result. The vendor copies + sends their way.
    if (!recipientEmail) {
      return jsonResponse(
        { sent: 0, skipped: 1, failed: 0, total: 0, skipped_reason: "no_email_recipient" },
        200
      );
    }

    // ---- Email content ----------------------------------------------
    const vendorName  = vendor.display_name || vendor.name || "Vendor";
    const brandColour = vendor.brand_primary_color || "#8B6B3F";
    const finalSubject = (custom_subject && String(custom_subject).trim())
      ? String(custom_subject).trim()
      : `Your catering order — ${vendorName}`;

    // Branded HTML shell — identical to send-drop-open-email's buildHtml.
    const buildHtml = (bodyText: string) => {
      const paragraphs = bodyText
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .map((p) => {
          const safe = escapeHtml(p)
            .replace(/(https?:\/\/[^\s]+)/g, `<a href="$1" style="color:${brandColour};">$1</a>`)
            .replace(/\n/g, "<br>");
          return `  <p style="margin:0 0 16px;font-size:15px;line-height:1.65;">${safe}</p>`;
        })
        .join("\n");

      return `
<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1F2937;background:#ffffff;">
  <div style="margin-bottom:24px;">
    <span style="font-size:15px;font-weight:700;color:#3D3530;">${escapeHtml(vendorName)}</span>
    <span style="font-size:12px;color:#9CA3AF;margin-left:8px;">via Hearth</span>
  </div>
${paragraphs}
</div>`.trim();
    };

    const text = String(custom_body);
    const html = buildHtml(text);

    // ---- comms_log ledger row (Gate 6 — timestamp-suffixed key so a
    //      re-send is never DB-blocked; one honest row per send) --------
    const dedupeKey = `catering_confirm:${drop_id}:${recipientEmail}:${Date.now()}`;
    const { data: logRow, error: logErr } = await sb
      .from("comms_log")
      .insert({
        drop_id: drop_id,
        customer_id: null, // a catering client is not necessarily a customers row
        touchpoint: "catering_confirm",
        channel: "email",
        recipient: recipientEmail,
        dedupe_key: dedupeKey,
        status: "pending",
      })
      .select("id")
      .single();

    if (logErr || !logRow) {
      console.error("[send-catering-confirm] comms_log insert failed", dedupeKey, logErr);
      return jsonResponse({ error: "comms_log insert failed" }, 500);
    }
    const logId = logRow.id as string;

    // ---- Send ONE email (vendor-fronted) ----------------------------
    let sent = 0;
    let failed = 0;
    try {
      const res = await fetch(RESEND_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: buildFromHeader(vendor.display_name || vendor.name, FROM_HELLO),
          ...(vendor.email ? { reply_to: vendor.email } : {}),
          to: recipientEmail,
          subject: finalSubject,
          html,
          text,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        await sb.from("comms_log")
          .update({ status: "failed", error: `${res.status} ${errText}`.slice(0, 2000) })
          .eq("id", logId);
        failed++;
        console.error("[send-catering-confirm] Resend error:", recipientEmail, errText);
      } else {
        let resendId: string | null = null;
        try {
          const json = await res.json();
          resendId = (json && typeof json.id === "string") ? json.id : null;
        } catch { /* body parse is best-effort */ }
        await sb.from("comms_log")
          .update({ status: "sent", sent_at: new Date().toISOString(), meta: { resend_id: resendId } })
          .eq("id", logId);
        sent++;
      }
    } catch (err) {
      await sb.from("comms_log")
        .update({ status: "failed", error: ((err as Error).message || "send exception").slice(0, 2000) })
        .eq("id", logId);
      failed++;
      console.error("[send-catering-confirm] Exception:", recipientEmail, err);
    }

    if (failed > 0 && sent === 0) {
      return jsonResponse({ error: "Email send failed", sent, failed, total: 1 }, 502);
    }

    console.log(`[send-catering-confirm] drop=${drop_id} recipient=${recipientEmail} sent=${sent} failed=${failed}`);
    return jsonResponse({ sent, skipped: 0, failed, total: 1, recipient_name: recipientName }, 200);

  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
