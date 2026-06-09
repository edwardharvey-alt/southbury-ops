import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { buildFromHeader, FROM_HELLO } from "../_shared/email.ts";

// Host handoff email (Activation Card 2 — the host handoff).
//
// Sends ONE email to a drop's host with their host-view "share page"
// link (host-view.html?drop=<slug>&t=<token>). The host uses that page
// to tell their community about the drop in their own voice and to post
// the ordering link once it opens.
//
// Structure clones send-early-access-email exactly: in-function auth belt
// (getUser + vendor ownership), getCorsHeaders + OPTIONS 204, a
// service-role client for reads, and the same Resend fetch / "from"
// address. Differs only in recipient resolution (the host, not customers)
// and the fixed template.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const RESEND_URL = "https://api.resend.com/emails";

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/London",
  });
}

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
    // ---- Auth -------------------------------------------------------
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
    let body: { vendor_id?: string; drop_id?: string; variant?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { vendor_id, drop_id } = body;
    if (!vendor_id) return jsonResponse({ error: "vendor_id is required" }, 400);
    if (!drop_id)   return jsonResponse({ error: "drop_id is required" }, 400);

    // Which template to send. Any value other than 'reminder' (including
    // absent) resolves to 'handoff', so Card 2's existing call — which sends
    // no variant — is unchanged.
    const variant = body.variant === "reminder" ? "reminder" : "handoff";

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ---- Vendor ownership -------------------------------------------
    const { data: vendor, error: vendorErr } = await sb
      .from("vendors")
      .select("id, display_name, name, email, brand_primary_color")
      .eq("id", vendor_id)
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (vendorErr) return jsonResponse({ error: "Vendor lookup failed" }, 500);
    if (!vendor)   return jsonResponse({ error: "Vendor not found or not owned by user" }, 403);

    // ---- Drop -------------------------------------------------------
    // Scoped to the owning vendor — a drop that doesn't belong to
    // vendor_id resolves to null and is treated as not-authorised (403),
    // mirroring the ownership belt above.
    const { data: drop, error: dropErr } = await sb
      .from("drops")
      .select("id, name, slug, delivery_start, host_id, status")
      .eq("id", drop_id)
      .eq("vendor_id", vendor_id)
      .maybeSingle();

    if (dropErr) return jsonResponse({ error: "Drop fetch failed" }, 500);
    if (!drop)   return jsonResponse({ error: "Drop not found or not owned by vendor" }, 403);
    if (["cancelled", "archived"].includes(drop.status)) {
      return jsonResponse({ error: "Cannot send for a cancelled or archived drop" }, 400);
    }

    // ---- Host -------------------------------------------------------
    if (!drop.host_id) {
      return jsonResponse({ error: "no_host", message: "This drop has no host." }, 400);
    }

    const { data: host, error: hostErr } = await sb
      .from("hosts")
      .select("id, name, contact_name, contact_email")
      .eq("id", drop.host_id)
      .eq("vendor_id", vendor_id)
      .maybeSingle();

    if (hostErr) return jsonResponse({ error: "Host fetch failed" }, 500);
    if (!host)   return jsonResponse({ error: "host_not_found" }, 404);

    // No host email on file — not an error. A2 will offer a manual copy
    // fallback in the UI; report the skip so the caller can surface it.
    const hostEmail = (host.contact_email || "").trim();
    if (!hostEmail) {
      return jsonResponse({ sent: 0, total: 1, skipped: "no_host_email" }, 200);
    }

    // ---- Token ------------------------------------------------------
    // Defensive — every drop should have a host token row by the time it
    // reaches here. 422 if it's genuinely missing.
    const { data: tokenRow, error: tokenErr } = await sb
      .from("drop_host_tokens")
      .select("host_access_token")
      .eq("drop_id", drop.id)
      .maybeSingle();

    if (tokenErr) return jsonResponse({ error: "Token fetch failed" }, 500);
    if (!tokenRow || !tokenRow.host_access_token) {
      return jsonResponse({ error: "no_token" }, 422);
    }

    // ---- Email content ----------------------------------------------
    const link = `https://lovehearth.co.uk/host-view.html?drop=${encodeURIComponent(drop.slug)}&t=${encodeURIComponent(tokenRow.host_access_token)}`;
    const vendorName  = vendor.display_name || "Hearth";
    const brandColour = vendor.brand_primary_color || "#8B6B3F";
    const venue       = host.name || "your venue";
    const deliveryDate = drop.delivery_start ? fmtDay(drop.delivery_start) : "soon";
    const greetingName = (host.contact_name || "").trim() || "there";

    // Subject + body are the ONLY thing the variant changes. The reminder
    // (Card 5, Thursday) reuses greetingName / drop.name / venue / link and
    // deliberately omits deliveryDate. The handoff (else, Card 2, Tuesday)
    // copy is unchanged.
    let subject: string;
    let text: string;
    if (variant === "reminder") {
      subject = `Ordering's now open — ${drop.name}`;
      text = [
        `Hi ${greetingName},`,
        "",
        `Ordering for ${drop.name} at ${venue} is now open — the link on your share page is live and ready to post.`,
        "",
        link,
        "",
        "If you haven't shared it with your group yet, now's the moment — if you already have, thank you. No rush either way.",
        "",
        "Thanks again for having us.",
      ].join("\n");
    } else {
      subject = `Your share page for ${drop.name}`;
      text = [
        `Hi ${greetingName},`,
        "",
        `We're bringing ${drop.name} to ${venue} on ${deliveryDate}. Here's your share page — it has a short message to post to your group in your own words, and the ordering link to add once it opens.`,
        "",
        link,
        "",
        "No pressure at all — but a word from you reaches your group in a way nothing from us can, so even a quick post makes a real difference. The link stays live for the whole drop, so keep it to hand.",
        "",
        "Thanks for having us.",
      ].join("\n");
    }

    // Wrap the plain-text body in the same branded HTML shell the other
    // senders use — paragraphs split on blank lines, URLs auto-linked in
    // the vendor's brand colour.
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
    <span style="font-size:15px;font-weight:700;color:#3D3530;">${vendorName}</span>
    <span style="font-size:12px;color:#9CA3AF;margin-left:8px;">via Hearth</span>
  </div>
${paragraphs}
</div>`.trim();
    };

    const html = buildHtml(text);

    // ---- Send -------------------------------------------------------
    // Single recipient, but keep the { sent, total, errors } shape and
    // per-send error handling identical to send-early-access-email.
    let sent = 0;
    const errors: string[] = [];

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
          to:   hostEmail,
          subject,
          html,
          text,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        errors.push(`${hostEmail}: ${res.status} ${errText}`);
        console.error("[send-host-activation-email] Resend error:", hostEmail, errText);
      } else {
        sent++;
      }
    } catch (err) {
      errors.push(`${hostEmail}: ${(err as Error).message}`);
      console.error("[send-host-activation-email] Exception:", hostEmail, err);
    }

    console.log(`[send-host-activation-email] drop=${drop_id} host=${drop.host_id} sent=${sent} errors=${errors.length}`);
    return jsonResponse({ sent, total: 1, errors }, 200);

  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
