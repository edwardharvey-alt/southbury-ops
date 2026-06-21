import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { buildFromHeader, FROM_HELLO } from "../_shared/email.ts";

// send-drop-open-email — emails the vendor's COMPOSED "ordering is open"
// message to their opted-in customers.
//
// Clones the plumbing of send-early-access-email (auth, vendor/drop
// resolution, the consent-granted customer audience, the branded HTML
// shell, the Resend call). It differs in exactly three ways:
//   1. Audience exclusions — drop anyone already emailed for THIS drop's
//      open (comms_log touchpoint IN ('interest_open','vendor_open'),
//      status='sent') and anyone who has already ordered on this drop
//      (orders.customer_email). early_access recipients are NOT excluded.
//   2. Body — the vendor's composed message_body is sent verbatim (wrapped
//      in the shared shell), not a template.
//   3. comms_log touchpoint — 'vendor_open' (the ordering-opens touchpoint),
//      claimed + finalised via the dispatch-interest-open idiom.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const RESEND_URL = "https://api.resend.com/emails";

// Reused verbatim from send-early-access-email.
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
    // ---- Auth (cloned from send-early-access-email) -----------------
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
      message_body?: string | null;
      subject?: string | null;
    };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { vendor_id, drop_id, message_body, subject } = body;
    if (!vendor_id) return jsonResponse({ error: "vendor_id is required" }, 400);
    if (!drop_id)   return jsonResponse({ error: "drop_id is required" }, 400);
    if (!message_body || !String(message_body).trim()) {
      return jsonResponse({ error: "message_body is required" }, 400);
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

    // ---- Drop (cloned) ----------------------------------------------
    const { data: drop, error: dropErr } = await sb
      .from("drops")
      .select("id, name, slug, delivery_start, closes_at, status, capacity_units_total")
      .eq("id", drop_id)
      .eq("vendor_id", vendor_id)
      .maybeSingle();

    if (dropErr)  return jsonResponse({ error: "Drop fetch failed" }, 500);
    if (!drop)    return jsonResponse({ error: "Drop not found" }, 404);
    if (["cancelled", "archived"].includes(drop.status)) {
      return jsonResponse({ error: "Cannot send for a cancelled or archived drop" }, 400);
    }

    // ---- Base audience (cloned exactly from send-early-access-email) -
    // All consented customers for this vendor with a valid email,
    // deduplicated by lowercase email.
    const { data: rels, error: relsErr } = await sb
      .from("customer_relationships")
      .select("customer_id, customers(id, name, email)")
      .eq("owner_type", "vendor")
      .eq("owner_id", vendor_id)
      .in("consent_status", ["granted", "imported"]);

    if (relsErr) return jsonResponse({ error: "Customer fetch failed" }, 500);

    const seen = new Set<string>();
    const recipients: Array<{ id: string; name: string; email: string }> = [];

    for (const rel of (rels || [])) {
      const c = rel.customers as { id: string; name: string; email: string } | null;
      if (!c?.email) continue;
      const emailKey = c.email.toLowerCase().trim();
      if (seen.has(emailKey)) continue;
      seen.add(emailKey);
      recipients.push({ id: c.id, name: c.name || "", email: emailKey });
    }

    const total = recipients.length;
    if (total === 0) {
      return jsonResponse({ sent: 0, skipped: 0, failed: 0, total: 0 }, 200);
    }

    // ---- Exclusions -------------------------------------------------
    // (a) Anyone already emailed for THIS drop's open — interest_open
    //     (auto-dispatched) or a prior vendor_open send. early_access is
    //     deliberately NOT excluded.
    const { data: priorSends, error: priorErr } = await sb
      .from("comms_log")
      .select("recipient")
      .eq("drop_id", drop_id)
      .in("touchpoint", ["interest_open", "vendor_open"])
      .eq("status", "sent");
    if (priorErr) return jsonResponse({ error: "Prior-send lookup failed" }, 500);

    const alreadyEmailed = new Set<string>();
    for (const row of (priorSends || [])) {
      const r = (row.recipient as string | null);
      if (r) alreadyEmailed.add(r.toLowerCase().trim());
    }

    // (b) Anyone who has already ordered on this drop, by customer_email.
    const { data: orderRows, error: ordersErr } = await sb
      .from("orders")
      .select("customer_email")
      .eq("drop_id", drop_id);
    if (ordersErr) return jsonResponse({ error: "Orders lookup failed" }, 500);

    const alreadyOrdered = new Set<string>();
    for (const row of (orderRows || [])) {
      const e = (row.customer_email as string | null);
      if (e) alreadyOrdered.add(e.toLowerCase().trim());
    }

    // ---- Email content ----------------------------------------------
    const vendorName  = vendor.display_name || vendor.name || "Hearth";
    const brandColour = vendor.brand_primary_color || "#8B6B3F";
    const finalSubject = (subject && String(subject).trim())
      ? String(subject).trim()
      : "Ordering is now open";

    // Branded HTML shell — same header, footer, and brand colour as
    // send-early-access-email's buildHtml. Only the (composed) body changes.
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

    const text = String(message_body);
    const html = buildHtml(text);

    // ---- Send -------------------------------------------------------
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const recipient of recipients) {
      // Exclusions — already emailed for this open, or already ordered.
      if (alreadyEmailed.has(recipient.email) || alreadyOrdered.has(recipient.email)) {
        skipped++;
        continue;
      }

      const dedupeKey = `vendor_open:${drop_id}:${recipient.email}`;

      // Claim-by-insert (dispatch-interest-open idiom). A returned row =
      // this run owns the send; a conflict (no row) = already claimed — skip.
      const { data: claimRows, error: claimErr } = await sb
        .from("comms_log")
        .upsert(
          {
            drop_id: drop_id,
            customer_id: recipient.id,
            touchpoint: "vendor_open",
            channel: "email",
            recipient: recipient.email,
            dedupe_key: dedupeKey,
            status: "pending",
          },
          { onConflict: "dedupe_key", ignoreDuplicates: true }
        )
        .select("id");

      if (claimErr) {
        console.error("[send-drop-open-email] comms_log claim failed", dedupeKey, claimErr);
        failed++;
        continue;
      }
      if (!claimRows || claimRows.length === 0) {
        skipped++;
        continue;
      }
      const logId = claimRows[0].id as string;

      // ---- Send (non-fatal per recipient) ---------------------------
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
            to: recipient.email,
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
          console.error("[send-drop-open-email] Resend error:", recipient.email, errText);
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
        console.error("[send-drop-open-email] Exception:", recipient.email, err);
      }
    }

    console.log(`[send-drop-open-email] drop=${drop_id} total=${total} sent=${sent} skipped=${skipped} failed=${failed}`);
    return jsonResponse({ sent, skipped, failed, total }, 200);

  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
