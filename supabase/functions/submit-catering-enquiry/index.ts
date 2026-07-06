import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { buildFromHeader, FROM_HELLO } from "../_shared/email.ts";

// PUBLIC Edge Function — captures early catering interest from customers.
// Invoked with the anon key from the public catering-enquiry.html page,
// no user session. Deploys with JWT verification OFF (verify_jwt = false
// in supabase/config.toml). The payload shape is the only thing we trust;
// structure mirrors create-order (the platform's other public endpoint).
//
// Flow: honeypot → validate → flood-cap → service-role insert → best-effort
// vendor notification email. The database insert is the source of truth;
// the email is a courtesy and never fails or blocks the response.

const NAME_MAX = 120;
const BRIEF_MAX = 2000;
const TEXT_MAX = 255;

// Proportionate flood guard, not full rate-limiting: cap enquiries per
// vendor in a short window. If real spam appears, the escalation path is a
// Cloudflare Turnstile challenge on the form (client token verified here) —
// not tightening this number, which would start rejecting legitimate bursts.
const FLOOD_WINDOW_SECONDS = 60;
const FLOOD_MAX = 5;

function asTrimmedString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function isUuid(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

// Escape user-supplied text before placing it in the notification HTML.
// These fields come from a public, unauthenticated form, so we never trust
// them to be HTML-safe.
function escapeHtml(v: string | null): string {
  if (!v) return "";
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Format a validated ISO date (YYYY-MM-DD) as e.g. "26 July 2026" for the
// customer acknowledgement copy. Parsed as UTC so the day never drifts
// across timezones. eventDate is already regex-validated before this runs.
function formatEventDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
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
      return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
    }

    const body = (raw as Record<string, unknown> | null) ?? {};

    // 1. Honeypot — a non-empty `company` means a bot filled a hidden field.
    //    Return a silent success so we don't tip the bot off, and write nothing.
    const honeypot = asTrimmedString(body.company);
    if (honeypot) {
      return jsonResponse({ ok: true }, 200);
    }

    // 2. Validate.
    if (!isUuid(body.vendor_id)) {
      return jsonResponse({ ok: false, error: "A valid vendor is required." }, 400);
    }
    const vendorId = body.vendor_id as string;

    const contactName = asTrimmedString(body.contact_name);
    if (!contactName) {
      return jsonResponse({ ok: false, error: "Please tell us your name." }, 400);
    }
    if (contactName.length > NAME_MAX) {
      return jsonResponse({ ok: false, error: "That name is a little too long." }, 400);
    }

    const contactEmail = asTrimmedString(body.contact_email);
    const contactPhone = asTrimmedString(body.contact_phone);
    if (!contactEmail && !contactPhone) {
      return jsonResponse(
        { ok: false, error: "Please leave an email or a phone number so we can reply." },
        400
      );
    }
    if (contactEmail && contactEmail.length > TEXT_MAX) {
      return jsonResponse({ ok: false, error: "That email is a little too long." }, 400);
    }
    if (contactPhone && contactPhone.length > TEXT_MAX) {
      return jsonResponse({ ok: false, error: "That phone number is a little too long." }, 400);
    }

    if (body.consent !== true) {
      return jsonResponse(
        { ok: false, error: "Please confirm you're happy to be contacted about this enquiry." },
        400
      );
    }

    // Optional fields — validated only for type / bounds, never required.
    const eventType = asTrimmedString(body.event_type);
    if (eventType && eventType.length > TEXT_MAX) {
      return jsonResponse({ ok: false, error: "That event type is a little too long." }, 400);
    }

    let fulfilment: string | null = null;
    if (body.fulfilment !== undefined && body.fulfilment !== null && body.fulfilment !== "") {
      if (body.fulfilment !== "collection" && body.fulfilment !== "delivery") {
        return jsonResponse(
          { ok: false, error: "Fulfilment must be collection or delivery." },
          400
        );
      }
      fulfilment = body.fulfilment;
    }

    let eventDate: string | null = null;
    if (body.event_date !== undefined && body.event_date !== null && body.event_date !== "") {
      const d = asTrimmedString(body.event_date);
      // Accept an ISO date (YYYY-MM-DD); the column is a DATE. Anything else
      // is dropped rather than rejected — an unparseable date shouldn't lose
      // the whole enquiry.
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d))) {
        eventDate = d;
      }
    }

    let guestCount: number | null = null;
    if (body.guest_count !== undefined && body.guest_count !== null && body.guest_count !== "") {
      const n = Number(body.guest_count);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
        return jsonResponse({ ok: false, error: "Guest count must be a whole number." }, 400);
      }
      guestCount = n;
    }

    const brief = asTrimmedString(body.brief);
    if (brief && brief.length > BRIEF_MAX) {
      return jsonResponse(
        { ok: false, error: "That's a lot of detail — please shorten it a little." },
        400
      );
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 3. Vendor must exist. Also fetch the display name + email now so the
    //    notification step has what it needs without a second round trip.
    const { data: vendor, error: vendorErr } = await serviceClient
      .from("vendors")
      .select("id, display_name, name, email")
      .eq("id", vendorId)
      .maybeSingle();
    if (vendorErr) {
      console.error("[submit-catering-enquiry] vendor lookup failed", vendorErr.message);
      return jsonResponse({ ok: false, error: "Could not send your enquiry." }, 500);
    }
    if (!vendor) {
      return jsonResponse({ ok: false, error: "A valid vendor is required." }, 400);
    }

    // 4. Flood cap — count this vendor's enquiries in the last minute.
    const windowStart = new Date(Date.now() - FLOOD_WINDOW_SECONDS * 1000).toISOString();
    const { count: recentCount, error: countErr } = await serviceClient
      .from("catering_enquiries")
      .select("id", { count: "exact", head: true })
      .eq("vendor_id", vendorId)
      .gte("created_at", windowStart);
    if (countErr) {
      console.error("[submit-catering-enquiry] flood-cap count failed", countErr.message);
      return jsonResponse({ ok: false, error: "Could not send your enquiry." }, 500);
    }
    if ((recentCount ?? 0) > FLOOD_MAX) {
      return jsonResponse(
        { ok: false, error: "We've had a lot of enquiries just now — please try again in a minute." },
        429
      );
    }

    // 5. Insert the enquiry. status defaults to 'open', source to
    //    'enquiry_page'. Service-role write bypasses the no-policy RLS.
    const { data: enquiryRow, error: insertErr } = await serviceClient
      .from("catering_enquiries")
      .insert({
        vendor_id: vendorId,
        contact_name: contactName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        event_date: eventDate,
        guest_count: guestCount,
        event_type: eventType,
        fulfilment,
        brief,
        consent: true,
      })
      .select("id")
      .single();
    if (insertErr || !enquiryRow) {
      console.error("[submit-catering-enquiry] insert failed", insertErr?.message);
      return jsonResponse({ ok: false, error: "Could not send your enquiry." }, 500);
    }
    const enquiryId = enquiryRow.id as string;

    console.log(`[submit-catering-enquiry] received vendor=${vendorId}`);

    // 6. Best-effort vendor notification. Mirrors request-access: resolve the
    //    recipient (the vendor's own email), send FROM the platform address,
    //    set reply_to to the enquirer so the vendor can reply directly. Wrapped
    //    so nothing here can fail or delay the response — the saved enquiry is
    //    what matters.
    try {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (!resendKey) {
        console.warn("[submit-catering-enquiry] RESEND_API_KEY not set — notification skipped");
      } else if (!vendor.email) {
        console.warn("[submit-catering-enquiry] vendor has no email — notification skipped");
      } else {
        const vendorName = vendor.display_name || vendor.name || "there";

        const rows: Array<[string, string]> = [
          ["Name", escapeHtml(contactName)],
          ["Email", escapeHtml(contactEmail) || "—"],
          ["Phone", escapeHtml(contactPhone) || "—"],
          ["Event date", escapeHtml(eventDate) || "—"],
          ["Guests", guestCount !== null ? String(guestCount) : "—"],
          ["Event type", escapeHtml(eventType) || "—"],
          ["Collection / delivery", escapeHtml(fulfilment) || "—"],
        ];
        const rowsHtml = rows
          .map(
            ([label, value]) =>
              `<tr><td style="padding:4px 24px 4px 0; color:#6B7280;">${label}</td>` +
              `<td style="padding:4px 0;">${value}</td></tr>`
          )
          .join("");
        const briefHtml = brief ? escapeHtml(brief).replace(/\n/g, "<br>") : "—";

        const htmlBody =
          `<!doctype html><html><head><meta charset="utf-8">` +
          `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
          `<title>New catering enquiry</title></head>` +
          `<body style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color:#1F2937; line-height:1.5;">` +
          `<p>Hi ${escapeHtml(vendorName)},</p>` +
          `<p>Someone has been in touch about catering.</p>` +
          `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rowsHtml}` +
          `<tr><td style="padding:4px 24px 4px 0; color:#6B7280; vertical-align:top;">About the event</td>` +
          `<td style="padding:4px 0;">${briefHtml}</td></tr>` +
          `</table>` +
          `<p style="margin-top:20px;">You can pick this up in Hearth when you're ready.</p>` +
          `<p style="color:#6B7280; font-size:13px; margin-top:20px;">Reply to this email to reach them directly.</p>` +
          `</body></html>`;

        const resendPayload: Record<string, unknown> = {
          from: buildFromHeader("Hearth", FROM_HELLO),
          to: vendor.email,
          subject: "New catering enquiry",
          html: htmlBody,
          ...(contactEmail ? { reply_to: contactEmail } : {}),
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
            "[submit-catering-enquiry] notification email failed",
            resendResp.status,
            errBody
          );
        } else {
          console.log("[submit-catering-enquiry] notification email sent");
        }
      }
    } catch (mailErr) {
      console.error("[submit-catering-enquiry] notification email threw", mailErr);
    }

    // 7. Best-effort acknowledgement to the enquirer. Mirrors the vendor
    //    notification above (same helper, same non-blocking handling) but
    //    fronted AS the vendor: From presents the vendor's display name, and
    //    reply_to is the vendor's own email so a reply reaches them, not the
    //    platform. Only sent when the enquirer left an email; phone-only
    //    enquiries are skipped silently. Never fails or blocks the response.
    try {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (!resendKey) {
        console.warn("[submit-catering-enquiry] RESEND_API_KEY not set — acknowledgement skipped");
      } else if (!contactEmail) {
        // Phone-only enquiry — nothing to acknowledge to. Skip quietly.
      } else {
        const vendorDisplayName = vendor.display_name || vendor.name || "The team";

        const mainPara = eventDate
          ? `Thank you for your catering enquiry for ${escapeHtml(formatEventDate(eventDate))}. ` +
            `We've received your details and will be in touch shortly to talk through the menu and options.`
          : `Thank you for your catering enquiry. ` +
            `We've received your details and will be in touch shortly to talk through the menu and options.`;

        const htmlBody =
          `<!doctype html><html><head><meta charset="utf-8">` +
          `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
          `<title>Thanks for your enquiry</title></head>` +
          `<body style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color:#1F2937; line-height:1.5;">` +
          `<p>Hi ${escapeHtml(contactName)},</p>` +
          `<p>${mainPara}</p>` +
          `<p>${escapeHtml(vendorDisplayName)}</p>` +
          `</body></html>`;

        const ackPayload: Record<string, unknown> = {
          from: buildFromHeader(vendorDisplayName, FROM_HELLO),
          to: contactEmail,
          subject: `Thanks for your enquiry — ${vendorDisplayName}`,
          html: htmlBody,
          ...(vendor.email ? { reply_to: vendor.email } : {}),
        };

        // Claim a durable comms_log row for this acknowledgement BEFORE the
        // send (mirrors send-catering-confirm's claim-then-resolve pattern).
        // Enquiry-anchored: enquiry_id set, drop_id NULL (no drop exists at
        // enquiry time), customer_id NULL (a catering enquirer is not
        // necessarily a customers row — same precedent as send-catering-confirm).
        // Stable dedupe_key = one ack per enquiry, never re-sent. The claim is
        // wrapped in its own try so a ledger hiccup can never stop the courtesy
        // email going out — the whole block already lives inside the outer
        // best-effort try/catch, so nothing here can break the saved enquiry.
        let ackLogId: string | null = null;
        try {
          const { data: logRow, error: logErr } = await serviceClient
            .from("comms_log")
            .insert({
              enquiry_id: enquiryId,
              drop_id: null,
              customer_id: null,
              touchpoint: "catering_ack",
              channel: "email",
              recipient: contactEmail,
              dedupe_key: `catering_ack:${enquiryId}`,
              status: "pending",
            })
            .select("id")
            .single();
          if (logErr || !logRow) {
            console.error("[submit-catering-enquiry] ack comms_log claim failed", logErr?.message);
          } else {
            ackLogId = logRow.id as string;
          }
        } catch (logClaimErr) {
          console.error("[submit-catering-enquiry] ack comms_log claim threw", logClaimErr);
        }

        const ackResp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(ackPayload),
        });

        if (!ackResp.ok) {
          const errBody = await ackResp.text().catch(() => "");
          console.error(
            "[submit-catering-enquiry] acknowledgement email failed",
            ackResp.status,
            errBody
          );
          // Outcome-not-attempt: a failed send must never read back as 'sent'.
          if (ackLogId) {
            await serviceClient
              .from("comms_log")
              .update({ status: "failed", error: `${ackResp.status} ${errBody}`.slice(0, 2000) })
              .eq("id", ackLogId);
          }
        } else {
          console.log("[submit-catering-enquiry] acknowledgement email sent");
          // Record the acknowledgement as durably 'sent' only now the send has
          // actually succeeded.
          if (ackLogId) {
            let resendId: string | null = null;
            try {
              const json = await ackResp.json();
              resendId = json && typeof json.id === "string" ? json.id : null;
            } catch {
              // Response body wasn't JSON — leave resend_id null, still 'sent'.
            }
            await serviceClient
              .from("comms_log")
              .update({ status: "sent", sent_at: new Date().toISOString(), meta: { resend_id: resendId } })
              .eq("id", ackLogId);
          }
        }
      }
    } catch (ackErr) {
      console.error("[submit-catering-enquiry] acknowledgement email threw", ackErr);
    }

    return jsonResponse({ ok: true }, 200);
  } catch (err) {
    console.error("[submit-catering-enquiry] unexpected error", err);
    return jsonResponse({ ok: false, error: (err as Error).message || "Internal error" }, 500);
  }
});
