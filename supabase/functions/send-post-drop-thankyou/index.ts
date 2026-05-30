import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const RESEND_URL = "https://api.resend.com/emails";

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Europe/London",
  }).toLowerCase().replace(":00", "").replace(" ", "");
}

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
      .select("id, display_name, brand_primary_color")
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
        total: 0,
        errors: [],
        message: "No orders with a valid customer email found for this drop.",
      }, 200);
    }

    // ---- Email content ----------------------------------------------
    const vendorName  = vendor.display_name || "Hearth";
    const brandColour = vendor.brand_primary_color || "#8B6B3F";
    const dropDay     = drop.delivery_start ? fmtDay(drop.delivery_start) : "recently";

    // Next drop details — only included when a future drop exists
    const nextDropUrl = nextDrop
      ? `https://lovehearth.co.uk/order.html?drop=${nextDrop.slug}`
      : null;
    const nextDropDay = nextDrop?.delivery_start
      ? fmtDay(nextDrop.delivery_start)
      : null;
    const nextDropOpensTime = nextDrop?.opens_at
      ? fmtTime(nextDrop.opens_at)
      : null;

    const subject = custom_subject || `Thank you for your order — ${drop.name}`;

    // Wrap a plain-text body (greeting → sign-off, paragraphs separated by
    // blank lines) in the branded HTML shell. Same header, footer, and
    // brand colour whether the body is custom or default — only the body
    // content changes.
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

    // Default plain-text body, used when the caller supplies no custom_body.
    // Includes greeting, optional next-drop block, and sign-off so buildHtml
    // wraps the whole thing.
    const buildDefaultBody = (name: string) => {
      const greeting = name ? `Hi ${name.split(" ")[0]},` : "Hi,";
      const lines = [
        greeting,
        "",
        `Thank you for ordering from ${drop.name} ${dropDay}. We hope you enjoyed it.`,
      ];
      if (nextDrop && nextDropUrl && nextDropDay) {
        lines.push(
          "",
          "Coming up next",
          "",
          `${nextDrop.name} — ${nextDropDay}.${nextDropOpensTime ? ` Orders open ${nextDropOpensTime}.` : ""}`,
          "",
          `Order early: ${nextDropUrl}`,
        );
      }
      lines.push("", vendorName);
      return lines.join("\n");
    };

    // ---- Send -------------------------------------------------------
    let sent = 0;
    const errors: string[] = [];

    for (const recipient of recipients) {
      const text = custom_body || buildDefaultBody(recipient.name);
      const html = buildHtml(text);

      try {
        const res = await fetch(RESEND_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from:    "orders@lovehearth.co.uk",
            to:      recipient.email,
            subject,
            html,
            text,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          errors.push(`${recipient.email}: ${res.status} ${errText}`);
          console.error("[send-post-drop-thankyou] Resend error:", recipient.email, errText);
        } else {
          sent++;
        }
      } catch (err) {
        errors.push(`${recipient.email}: ${(err as Error).message}`);
        console.error("[send-post-drop-thankyou] Exception:", recipient.email, err);
      }
    }

    console.log(`[send-post-drop-thankyou] drop=${drop_id} total=${recipients.length} sent=${sent} errors=${errors.length}`);
    return jsonResponse({ sent, total: recipients.length, errors }, 200);

  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
