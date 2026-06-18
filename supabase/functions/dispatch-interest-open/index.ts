import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { buildFromHeader, FROM_HELLO } from "../_shared/email.ts";

// T5-11 slice 1 — dispatch-interest-open.
//
// Emails interest-registrants when their drop's ordering has opened. A
// customer who left an 'interest' signal on a pre-open drop (register-interest,
// kind='interest') gets a single "ordering is now open" email once the drop is
// actually open.
//
// Trigger: automated (cron / internal caller), never a user. Auth is the
// shared internal-secret pattern (mirrors send-order-confirmation):
// verify_jwt = false at the gateway + an x-internal-secret header compared to
// INTERNAL_FUNCTION_SECRET. The frontend never calls this endpoint.
//
// Dedupe: each (drop, customer) send is claimed in comms_log via
// INSERT ... ON CONFLICT (dedupe_key) DO NOTHING RETURNING id. A returned row
// means this run owns the send; no row means it was already handled — skip.
// So repeated cron runs over the drop's open window never double-send.
//
// Resend send shape (per-recipient loop, _shared/email.ts buildFromHeader +
// FROM_HELLO, reply_to = vendor.email when set, branded HTML shell,
// per-recipient try/catch that is non-fatal) mirrors send-early-access-email.
// Drop naming (drop.name) and the order-page link
// (https://lovehearth.co.uk/order.html?drop=<slug>) are reused verbatim from
// send-early-access-email; the delivery summary mirrors order.html's
// formatDateTimeRange, pinned to Europe/London for server-side correctness.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const RESEND_URL = "https://api.resend.com/emails";

// Reused verbatim from send-early-access-email.
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Europe/London",
  }).toLowerCase().replace(":00", "").replace(" ", "");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Delivery summary as the order page shows it (order.html formatDateTimeRange):
// "Saturday 21 June • 17:00–19:00". Pinned to Europe/London because
// the Edge Function runtime is UTC, unlike the customer's browser.
function formatDeliveryRange(startValue: string | null, endValue: string | null): string {
  if (!startValue || !endValue) return "timing to be confirmed";
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "timing to be confirmed";

  const datePart = start.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/London",
  });
  const startTime = start.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
  const endTime = end.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
  return `${datePart} • ${startTime}–${endTime}`;
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
    // ---- Auth: shared internal secret (mirrors send-order-confirmation) ----
    const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
    if (!internalSecret) {
      console.error("INTERNAL_FUNCTION_SECRET not configured");
      return jsonResponse({ error: "Internal function secret not configured" }, 500);
    }
    const presented = req.headers.get("x-internal-secret") || "";
    if (presented !== internalSecret) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return jsonResponse({ error: "RESEND_API_KEY not configured" }, 500);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const nowIso = new Date().toISOString();

    // ---- 1. Currently-open drops --------------------------------------
    // live AND opens_at <= now AND closes_at > now. (A null opens_at means
    // "open immediately" — such drops never had a pre-open interest-capture
    // window, so excluding them via .lte is correct, not a gap.)
    const { data: openDrops, error: dropsErr } = await sb
      .from("drops")
      .select("id, name, slug, delivery_start, delivery_end, vendor_id, opens_at, closes_at, status")
      .eq("status", "live")
      .lte("opens_at", nowIso)
      .gt("closes_at", nowIso);
    if (dropsErr) return jsonResponse({ error: `Drop scan failed: ${dropsErr.message}` }, 500);

    if (!openDrops || openDrops.length === 0) {
      return jsonResponse({ processed: 0, sent: 0, failed: 0, skipped: 0 }, 200);
    }

    const dropById = new Map(openDrops.map((d) => [d.id as string, d]));
    const dropIds = openDrops.map((d) => d.id as string);

    // ---- 2. Interest signals on those drops ----------------------------
    const { data: signals, error: sigErr } = await sb
      .from("drop_signals")
      .select("drop_id, customer_id")
      .eq("kind", "interest")
      .in("drop_id", dropIds);
    if (sigErr) return jsonResponse({ error: `Signal scan failed: ${sigErr.message}` }, 500);

    if (!signals || signals.length === 0) {
      return jsonResponse({ processed: 0, sent: 0, failed: 0, skipped: 0 }, 200);
    }

    // ---- 3. Customers (id, name, email) --------------------------------
    const customerIds = [...new Set(signals.map((s) => s.customer_id as string))];
    const { data: customers, error: custErr } = await sb
      .from("customers")
      .select("id, name, email")
      .in("id", customerIds);
    if (custErr) return jsonResponse({ error: `Customer fetch failed: ${custErr.message}` }, 500);
    const customerById = new Map((customers || []).map((c) => [c.id as string, c]));

    // ---- 4. Vendors (same fields send-early-access-email resolves) ------
    const vendorIds = [...new Set(openDrops.map((d) => d.vendor_id as string))];
    const { data: vendors, error: vendErr } = await sb
      .from("vendors")
      .select("id, display_name, name, email, brand_primary_color")
      .in("id", vendorIds);
    if (vendErr) return jsonResponse({ error: `Vendor fetch failed: ${vendErr.message}` }, 500);
    const vendorById = new Map((vendors || []).map((v) => [v.id as string, v]));

    // ---- 5. Process each (drop, customer) candidate --------------------
    let processed = 0;
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const signal of signals) {
      processed++;
      const drop = dropById.get(signal.drop_id as string);
      const customer = customerById.get(signal.customer_id as string);
      const vendor = drop ? vendorById.get(drop.vendor_id as string) : null;

      // Can't contact without a drop, a vendor, or a customer email — skip.
      if (!drop || !vendor || !customer?.email) {
        skipped++;
        continue;
      }

      const dedupeKey = `interest_open:${drop.id}:${customer.id}`;

      // Claim-by-insert. A returned row = this run owns the send; a conflict
      // (no row) = already handled on a previous run — skip.
      const { data: claimRows, error: claimErr } = await sb
        .from("comms_log")
        .upsert(
          {
            drop_id: drop.id,
            customer_id: customer.id,
            touchpoint: "interest_open",
            channel: "email",
            recipient: customer.email,
            dedupe_key: dedupeKey,
            status: "pending",
          },
          { onConflict: "dedupe_key", ignoreDuplicates: true }
        )
        .select("id");

      if (claimErr) {
        console.error("[dispatch-interest-open] comms_log claim failed", dedupeKey, claimErr);
        failed++;
        continue;
      }
      if (!claimRows || claimRows.length === 0) {
        skipped++;
        continue;
      }
      const logId = claimRows[0].id as string;

      // ---- Email content ----------------------------------------------
      const vendorName = vendor.display_name || vendor.name || "Hearth";
      const brandColour = vendor.brand_primary_color || "#8B6B3F";
      // Drop naming + order link reused verbatim from send-early-access-email.
      const orderingUrl = `https://lovehearth.co.uk/order.html?drop=${drop.slug}`;
      const dropName = (drop.name && String(drop.name).trim())
        ? String(drop.name).trim()
        : `your ${vendorName} drop`;
      const deliverySummary = formatDeliveryRange(drop.delivery_start, drop.delivery_end);
      const firstName = customer.name ? String(customer.name).split(" ")[0] : "";

      const subject = `Ordering is now open — ${dropName}`;

      const text = [
        firstName ? `Hi ${firstName},` : "Hi,",
        "",
        `You asked us to let you know when ordering opened for ${dropName} — it's open now.`,
        "",
        `${vendorName}, ${deliverySummary}.`,
        "",
        `Order here: ${orderingUrl}`,
        "",
        "Thanks for waiting — we'll see you at the drop.",
        "",
        vendorName,
      ].join("\n");

      // Branded HTML shell (mirrors send-early-access-email buildHtml):
      // greeting → sign-off, paragraphs split on blank lines, links in the
      // vendor brand colour, vendor name + "via Hearth" header.
      const paragraphs = text
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

      const html = `
<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1F2937;background:#ffffff;">
  <div style="margin-bottom:24px;">
    <span style="font-size:15px;font-weight:700;color:#3D3530;">${escapeHtml(vendorName)}</span>
    <span style="font-size:12px;color:#9CA3AF;margin-left:8px;">via Hearth</span>
  </div>
${paragraphs}
</div>`.trim();

      // ---- Send (non-fatal per recipient) -----------------------------
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
            to: customer.email,
            subject,
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
          console.error("[dispatch-interest-open] Resend error:", customer.email, errText);
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
        console.error("[dispatch-interest-open] Exception:", customer.email, err);
      }
    }

    console.log(`[dispatch-interest-open] processed=${processed} sent=${sent} failed=${failed} skipped=${skipped}`);
    return jsonResponse({ processed, sent, failed, skipped }, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
