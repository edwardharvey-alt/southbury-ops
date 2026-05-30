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
    let body: { vendor_id?: string; drop_id?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { vendor_id, drop_id } = body;
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
      .select("id, name, slug, delivery_start, closes_at, status, capacity_units_total")
      .eq("id", drop_id)
      .eq("vendor_id", vendor_id)
      .maybeSingle();

    if (dropErr)  return jsonResponse({ error: "Drop fetch failed" }, 500);
    if (!drop)    return jsonResponse({ error: "Drop not found" }, 404);
    if (["cancelled", "archived"].includes(drop.status)) {
      return jsonResponse({ error: "Cannot send for a cancelled or archived drop" }, 400);
    }

    // ---- Customers --------------------------------------------------
    // Fetch all consented customers for this vendor with a valid email.
    // Deduplicate by lowercase email — a customer may have multiple
    // relationship rows (ordered several times, plus imported).
    const { data: rels, error: relsErr } = await sb
      .from("customer_relationships")
      .select("customer_id, customers(id, name, email)")
      .eq("owner_type", "vendor")
      .eq("owner_id", vendor_id)
      .in("consent_status", ["granted", "imported"]);

    if (relsErr) return jsonResponse({ error: "Customer fetch failed" }, 500);

    const seen = new Set<string>();
    const recipients: Array<{ name: string; email: string }> = [];

    for (const rel of (rels || [])) {
      const c = rel.customers as { id: string; name: string; email: string } | null;
      if (!c?.email) continue;
      const emailKey = c.email.toLowerCase().trim();
      if (seen.has(emailKey)) continue;
      seen.add(emailKey);
      recipients.push({ name: c.name || "", email: emailKey });
    }

    if (recipients.length === 0) {
      return jsonResponse({
        sent: 0,
        total: 0,
        errors: [],
        message: "No eligible customers found — no previous customers with a valid email and consent."
      }, 200);
    }

    // ---- Email content ----------------------------------------------
    const orderingUrl = `https://lovehearth.co.uk/order.html?drop=${drop.slug}`;
    const dropDay      = drop.delivery_start ? fmtDay(drop.delivery_start) : "soon";
    const closesTime   = drop.closes_at      ? fmtTime(drop.closes_at)     : null;
    const capacity     = drop.capacity_units_total;
    const vendorName   = vendor.display_name || "Hearth";
    const brandColour  = vendor.brand_primary_color || "#8B6B3F";

    const subject = `${drop.name} — orders open early for you`;

    const buildEmail = (name: string) => {
      const greeting      = name ? `Hi ${name.split(" ")[0]},` : "Hi,";
      const capacityLine  = capacity
        ? `Capacity is limited to ${capacity} orders — worth ordering early.`
        : "Capacity is limited — worth ordering early.";
      const closesLine    = closesTime ? `Orders close at ${closesTime}.` : "";

      const html = `
<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1F2937;background:#ffffff;">
  <div style="margin-bottom:24px;">
    <span style="font-size:15px;font-weight:700;color:#3D3530;">${vendorName}</span>
    <span style="font-size:12px;color:#9CA3AF;margin-left:8px;">via Hearth</span>
  </div>
  <p style="margin:0 0 16px;font-size:15px;line-height:1.65;">${greeting}</p>
  <p style="margin:0 0 16px;font-size:15px;line-height:1.65;">
    <strong>${drop.name}</strong> is coming ${dropDay}. As a previous customer, you get access to order before the link goes public.
  </p>
  <p style="margin:24px 0;">
    <a href="${orderingUrl}"
       style="display:inline-block;background:${brandColour};color:#ffffff;padding:13px 26px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
      Order now →
    </a>
  </p>
  <p style="margin:0 0 6px;font-size:14px;color:#6B7280;line-height:1.6;">${capacityLine}</p>
  ${closesLine ? `<p style="margin:0 0 16px;font-size:14px;color:#6B7280;">${closesLine}</p>` : ""}
  <hr style="border:none;border-top:1px solid #E5E7EB;margin:28px 0 20px;" />
  <p style="margin:0;font-size:13px;color:#9CA3AF;">${vendorName}</p>
</div>`.trim();

      const text = [
        greeting,
        "",
        `${drop.name} is coming ${dropDay}. As a previous customer, you get access to order before the link goes public.`,
        "",
        `Order here: ${orderingUrl}`,
        "",
        capacityLine,
        closesLine,
        "",
        vendorName,
      ].filter(line => line !== undefined).join("\n");

      return { html, text };
    };

    // ---- Send -------------------------------------------------------
    let sent   = 0;
    const errors: string[] = [];

    for (const recipient of recipients) {
      const { html, text } = buildEmail(recipient.name);

      try {
        const res = await fetch(RESEND_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "orders@lovehearth.co.uk",
            to:   recipient.email,
            subject,
            html,
            text,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          errors.push(`${recipient.email}: ${res.status} ${errText}`);
          console.error("[send-early-access-email] Resend error:", recipient.email, errText);
        } else {
          sent++;
        }
      } catch (err) {
        errors.push(`${recipient.email}: ${(err as Error).message}`);
        console.error("[send-early-access-email] Exception:", recipient.email, err);
      }
    }

    console.log(`[send-early-access-email] drop=${drop_id} total=${recipients.length} sent=${sent} errors=${errors.length}`);
    return jsonResponse({ sent, total: recipients.length, errors }, 200);

  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
