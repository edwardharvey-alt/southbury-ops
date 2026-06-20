import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { buildFromHeader, FROM_HELLO } from "../_shared/email.ts";
import { buildPostDropThankyouEmail } from "../_shared/postDropThankyouEmail.ts";

// T5-11 slice 2b — dispatch-post-drop-thankyou (automatic dispatcher).
//
// Sends the post-drop thank-you email to everyone who ordered from a drop,
// once that drop has completed. The manual operator EF
// (send-post-drop-thankyou) sends the same email on demand; this dispatcher
// sends it automatically the morning after a drop finishes. The two are
// mutually exclusive per (drop, customer): the dedupe_key is byte-identical
// across both
// (`post_drop_thankyou:${drop_id}:${lowercased_email}`), so whichever sends
// first claims the comms_log row and the other skips on conflict.
//
// Structure mirrors dispatch-interest-open verbatim: internal-secret auth
// (x-internal-secret vs INTERNAL_FUNCTION_SECRET, verify_jwt = false at the
// gateway), CORS/OPTIONS, a service-role client, the comms_log
// claim-then-send pattern, the Resend call, and the
// {processed, sent, failed, skipped} response. The email content is built by
// the shared buildPostDropThankyouEmail() so it is identical to the manual EF.
//
// Trigger: automated (GitHub Actions cron pings it with {}). The frontend
// never calls this endpoint.
//
// Morning-window gate: the dispatcher only sends between 08:00 and 11:00
// Europe/London so customers receive the thank-you at a civil hour the
// morning after the drop, regardless of when the cron actually fires. A
// {"force": true} body bypasses ONLY the window (manual-test hatch); the
// scheduled workflow always sends {}, so production stays gated.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const RESEND_URL = "https://api.resend.com/emails";

// Current hour in Europe/London (0–23). h23 hourCycle so midnight is 00, not
// 24. Same timezone the shared template formats with.
function londonHour(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(now);
  return Number(parts.find((p) => p.type === "hour")?.value ?? "0");
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

    // ---- force flag: bypasses ONLY the window gate (manual-test hatch) ----
    // The scheduled workflow sends {}, so force stays false in production.
    let force = false;
    try {
      const body = await req.json();
      force = body?.force === true;
    } catch {
      // No body / invalid JSON → not forced. The cron sends {}; both fine.
    }

    // ---- Morning-window gate (08:00–11:00 Europe/London) ----------------
    const now = new Date();
    const hour = londonHour(now);
    if (!force && (hour < 8 || hour >= 11)) {
      return jsonResponse({ processed: 0, sent: 0, failed: 0, skipped: 0, skipped_window: true }, 200);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const nowIso = now.toISOString();
    // Safety bound: scan the last ~3 days so a missed morning is still caught,
    // while the scan stays small. The lifecycle engine writes no completion
    // timestamp (see T-A6-lifecycle-timestamps), so delivery_end — the field
    // the engine completes a drop ON (delivery_end < now()) — is the
    // completion-time proxy.
    const threeDaysAgoIso = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

    // ---- 1. Recently-completed drops ------------------------------------
    const { data: completedDrops, error: dropsErr } = await sb
      .from("drops")
      .select("id, name, slug, delivery_start, delivery_end, vendor_id, status")
      .eq("status", "completed")
      .gte("delivery_end", threeDaysAgoIso);
    if (dropsErr) return jsonResponse({ error: `Drop scan failed: ${dropsErr.message}` }, 500);

    if (!completedDrops || completedDrops.length === 0) {
      return jsonResponse({ processed: 0, sent: 0, failed: 0, skipped: 0 }, 200);
    }

    // ---- 2. Vendors (same fields the manual EF resolves) ----------------
    const vendorIds = [...new Set(completedDrops.map((d) => d.vendor_id as string))];
    const { data: vendors, error: vendErr } = await sb
      .from("vendors")
      .select("id, display_name, name, email, brand_primary_color")
      .in("id", vendorIds);
    if (vendErr) return jsonResponse({ error: `Vendor fetch failed: ${vendErr.message}` }, 500);
    const vendorById = new Map((vendors || []).map((v) => [v.id as string, v]));

    let processed = 0;
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    // ---- 3. Process each completed drop ---------------------------------
    for (const drop of completedDrops) {
      const vendor = vendorById.get(drop.vendor_id as string);
      if (!vendor) continue; // no vendor → can't build the email

      // ---- Next scheduled drop (mirrors send-post-drop-thankyou) --------
      // Earliest future drop for this vendor that is live or scheduled —
      // gives customers a reason to come back. null if none.
      const { data: nextDrops } = await sb
        .from("drops")
        .select("id, name, slug, delivery_start, opens_at")
        .eq("vendor_id", drop.vendor_id)
        .in("status", ["live", "scheduled"])
        .neq("id", drop.id)
        .gt("delivery_start", nowIso)
        .order("delivery_start", { ascending: true })
        .limit(1);
      const nextDrop = nextDrops && nextDrops.length > 0 ? nextDrops[0] : null;

      // ---- Customers who ordered this drop -----------------------------
      // Read from orders — customer_email is captured at checkout.
      const { data: orders, error: ordersErr } = await sb
        .from("orders")
        .select("customer_name, customer_email")
        .eq("drop_id", drop.id)
        .not("customer_email", "is", null);
      if (ordersErr) {
        console.error("[dispatch-post-drop-thankyou] orders fetch failed", drop.id, ordersErr);
        continue;
      }

      // Deduplicate by lowercase + trimmed email (matches the manual EF).
      const seen = new Set<string>();
      const recipients: Array<{ name: string; email: string }> = [];
      for (const order of (orders || [])) {
        if (!order.customer_email) continue;
        const emailKey = order.customer_email.toLowerCase().trim();
        if (!emailKey || seen.has(emailKey)) continue;
        seen.add(emailKey);
        recipients.push({ name: order.customer_name || "", email: emailKey });
      }

      // ---- Per recipient: claim → build → send -------------------------
      for (const recipient of recipients) {
        processed++;

        // Byte-identical to send-post-drop-thankyou's dedupe_key so the
        // manual EF and this dispatcher are mutually exclusive.
        const dedupeKey = `post_drop_thankyou:${drop.id}:${recipient.email}`;

        const { data: claimRows, error: claimErr } = await sb
          .from("comms_log")
          .upsert(
            {
              drop_id: drop.id,
              customer_id: null,
              touchpoint: "post_drop_thankyou",
              channel: "email",
              recipient: recipient.email,
              dedupe_key: dedupeKey,
              status: "pending",
            },
            { onConflict: "dedupe_key", ignoreDuplicates: true }
          )
          .select("id");

        if (claimErr) {
          console.error("[dispatch-post-drop-thankyou] comms_log claim failed", dedupeKey, claimErr);
          failed++;
          continue;
        }
        if (!claimRows || claimRows.length === 0) {
          // Already claimed (by the manual EF or a prior run) — skip.
          skipped++;
          continue;
        }
        const logId = claimRows[0].id as string;

        const { subject, html, text } = buildPostDropThankyouEmail({
          recipientName: recipient.name,
          vendor,
          drop,
          nextDrop,
        });

        // ---- Send (non-fatal per recipient) ----------------------------
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
            console.error("[dispatch-post-drop-thankyou] Resend error:", recipient.email, errText);
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
          console.error("[dispatch-post-drop-thankyou] Exception:", recipient.email, err);
        }
      }
    }

    console.log(`[dispatch-post-drop-thankyou] processed=${processed} sent=${sent} failed=${failed} skipped=${skipped}`);
    return jsonResponse({ processed, sent, failed, skipped }, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
