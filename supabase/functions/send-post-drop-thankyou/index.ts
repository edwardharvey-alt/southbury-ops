import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { buildFromHeader, FROM_HELLO } from "../_shared/email.ts";
import { buildPostDropThankyouEmail } from "../_shared/postDropThankyouEmail.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const RESEND_URL = "https://api.resend.com/emails";

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
    const { data: drop, error: dropErr } = await sb
      .from("drops")
      .select("id, name, slug, delivery_start, status")
      .eq("id", drop_id)
      .eq("vendor_id", vendor_id)
      .maybeSingle();

    if (dropErr) return jsonResponse({ error: "Drop fetch failed" }, 500);
    if (!drop)   return jsonResponse({ error: "Drop not found" }, 404);

    // ---- Next scheduled drop ----------------------------------------
    // Find the earliest future drop for this vendor that is live or
    // scheduled — used to give customers a reason to come back.
    const now = new Date().toISOString();
    const { data: nextDrops } = await sb
      .from("drops")
      .select("id, name, slug, delivery_start, opens_at")
      .eq("vendor_id", vendor_id)
      .in("status", ["live", "scheduled"])
      .neq("id", drop_id)
      .gt("delivery_start", now)
      .order("delivery_start", { ascending: true })
      .limit(1);

    const nextDrop = nextDrops && nextDrops.length > 0 ? nextDrops[0] : null;

    // ---- Customers who ordered this drop ----------------------------
    // Read from orders table — customer_email is captured at checkout.
    const { data: orders, error: ordersErr } = await sb
      .from("orders")
      .select("customer_name, customer_email")
      .eq("drop_id", drop_id)
      .not("customer_email", "is", null);

    if (ordersErr) return jsonResponse({ error: "Orders fetch failed" }, 500);

    // Deduplicate by lowercase email
    const seen = new Set<string>();
    const recipients: Array<{ name: string; email: string }> = [];

    for (const order of (orders || [])) {
      if (!order.customer_email) continue;
      const emailKey = order.customer_email.toLowerCase().trim();
      if (seen.has(emailKey)) continue;
      seen.add(emailKey);
      recipients.push({
        name:  order.customer_name || "",
        email: emailKey,
      });
    }

    if (recipients.length === 0) {
      return jsonResponse({
        sent: 0,
        skipped: 0,
        total: 0,
        errors: [],
        message: "No orders with a valid customer email found for this drop.",
      }, 200);
    }

    // ---- Send -------------------------------------------------------
    // Each per-recipient send is claimed in comms_log via
    // INSERT ... ON CONFLICT (dedupe_key) DO NOTHING RETURNING id (the
    // .upsert ignoreDuplicates form), mirroring dispatch-interest-open. A
    // returned row means this invocation owns the send; a conflict (no row)
    // means a previous invocation already sent it — skip, don't double-send.
    // `sb` is the service-role client (comms_log is service-role-only).
    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const recipient of recipients) {
      // recipient.email is already lowercased + trimmed (dedupe set above).
      const dedupeKey = `post_drop_thankyou:${drop_id}:${recipient.email}`;

      const { data: claimRows, error: claimErr } = await sb
        .from("comms_log")
        .upsert(
          {
            drop_id,
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
        errors.push(`${recipient.email}: comms_log claim failed: ${claimErr.message}`);
        console.error("[send-post-drop-thankyou] comms_log claim failed:", dedupeKey, claimErr);
        continue;
      }
      if (!claimRows || claimRows.length === 0) {
        // Already sent on a prior invocation — skip.
        skipped++;
        continue;
      }
      const logId = claimRows[0].id as string;

      const { subject, html, text } = buildPostDropThankyouEmail({
        recipientName: recipient.name,
        vendor,
        drop,
        nextDrop,
        customSubject: custom_subject,
        customBody: custom_body,
      });

      try {
        const res = await fetch(RESEND_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from:    buildFromHeader(vendor.display_name || vendor.name, FROM_HELLO),
            ...(vendor.email ? { reply_to: vendor.email } : {}),
            to:      recipient.email,
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
          errors.push(`${recipient.email}: ${res.status} ${errText}`);
          console.error("[send-post-drop-thankyou] Resend error:", recipient.email, errText);
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
        errors.push(`${recipient.email}: ${(err as Error).message}`);
        console.error("[send-post-drop-thankyou] Exception:", recipient.email, err);
      }
    }

    console.log(`[send-post-drop-thankyou] drop=${drop_id} total=${recipients.length} sent=${sent} skipped=${skipped} errors=${errors.length}`);
    return jsonResponse({ sent, skipped, total: recipients.length, errors }, 200);

  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
