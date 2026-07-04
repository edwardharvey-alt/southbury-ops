import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { buildFromHeader, FROM_ORDERS } from "../_shared/email.ts";

// Sends the customer-facing order_confirmed email via Resend.
//
// Caller: stripe-webhook, after checkout.session.completed flips the
// order to placed/paid. Inter-Edge-Function authorization is by a
// shared INTERNAL_FUNCTION_SECRET passed in the X-Internal-Secret
// header (the canonical pattern for future internal-only Edge
// Function endpoints).
//
// verify_jwt = false at the gateway because Stripe webhook → Edge
// Function calls have no user JWT. The X-Internal-Secret check is the
// only auth — frontend code MUST NOT call this directly.
//
// Failure isolation: stripe-webhook treats every error from this
// function as non-fatal (try/catch + 200) so a Resend outage cannot
// cause Stripe to retry the webhook and double-place an order.

type Payload = { order_id: string };

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function escapeHtml(input: unknown): string {
  if (input === null || input === undefined) return "";
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(pence: number | null | undefined): string {
  const v = Number(pence ?? 0);
  return `£${(v / 100).toFixed(2)}`;
}

function shortOrderRef(orderId: string): string {
  return orderId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function firstName(fullName: string | null | undefined): string {
  const trimmed = String(fullName ?? "").trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}

const LONDON_TZ = "Europe/London";

function formatDeliveryWindow(start: string | null, end: string | null): string {
  if (!start) return "";
  const startD = new Date(start);
  const endD = end ? new Date(end) : null;
  const dateFmt = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: LONDON_TZ,
  });
  const timeFmt = new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: LONDON_TZ,
  });
  const dateStr = dateFmt.format(startD);
  const startStr = timeFmt.format(startD);
  if (!endD) return `${dateStr}, from ${startStr}`;
  const endStr = timeFmt.format(endD);
  return `${dateStr}, between ${startStr} and ${endStr}`;
}

type Selection = {
  bundle_line_label: string | null;
  selected_product_name: string | null;
  quantity: number;
};

type OptionSelection = {
  option_name_snapshot: string;
  price_delta_pence_snapshot: number;
};

type Item = {
  id: string;
  item_type: string;
  item_name_snapshot: string;
  qty: number;
  price_pence: number;
  bundle_id: string | null;
  selections: Selection[];
  options: OptionSelection[];
};

type Vendor = {
  display_name: string | null;
  name: string | null;
  email: string | null;
  tagline: string | null;
  brand_primary_color: string | null;
  brand_text_on_primary: string | null;
  powered_by_hearth_visible: boolean | null;
};

type Drop = {
  name: string | null;
  delivery_start: string | null;
  delivery_end: string | null;
  collection_point_description: string | null;
};

type Order = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_notes: string | null;
  delivery_address: string | null;
  fulfilment_mode: string | null;
  total_pence: number;
  discount_pence: number | null;
};

function renderHtml(order: Order, items: Item[], drop: Drop, vendor: Vendor): string {
  const accent = vendor.brand_primary_color || "#8B6B3F";
  const textOnAccent = vendor.brand_text_on_primary || "#FFFFFF";
  const bodyText = "#1F2937";
  const muted = "#6B7280";
  const border = "#E5E7EB";
  const bg = "#FAF8F4";

  const serifStack = "Georgia, 'Times New Roman', serif";
  const bodyStack = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

  const displayName = vendor.display_name || vendor.name || "Vendor";

  // Vendor header
  let vendorHeader =
    `<tr><td style="padding:32px 24px 0 24px;font-family:${serifStack};font-size:26px;color:${bodyText};line-height:1.2;">${escapeHtml(displayName)}</td></tr>`;
  if (vendor.tagline) {
    vendorHeader +=
      `<tr><td style="padding:6px 24px 0 24px;font-family:${bodyStack};font-size:14px;color:${muted};line-height:1.4;">${escapeHtml(vendor.tagline)}</td></tr>`;
  }
  vendorHeader +=
    `<tr><td style="padding:16px 24px 0 24px;"><div style="height:2px;background:${accent};font-size:0;line-height:0;">&nbsp;</div></td></tr>`;

  // Greeting + order ref
  const greeting =
    `<tr><td style="padding:24px 24px 0 24px;font-family:${bodyStack};font-size:16px;color:${bodyText};line-height:1.5;">Thanks ${escapeHtml(firstName(order.customer_name))} &mdash; your order is confirmed.</td></tr>` +
    `<tr><td style="padding:4px 24px 0 24px;font-family:${bodyStack};font-size:13px;color:${muted};line-height:1.5;">Order #${shortOrderRef(order.id)}</td></tr>`;

  // Order block
  const lineRows: string[] = [];
  for (const item of items) {
    lineRows.push(
      `<tr>` +
        `<td style="padding:8px 0;font-family:${bodyStack};font-size:14px;color:${bodyText};vertical-align:top;">${escapeHtml(item.item_name_snapshot)}</td>` +
        `<td style="padding:8px 0;font-family:${bodyStack};font-size:14px;color:${bodyText};text-align:center;vertical-align:top;white-space:nowrap;">&times;${escapeHtml(item.qty)}</td>` +
        `<td style="padding:8px 0;font-family:${bodyStack};font-size:14px;color:${bodyText};text-align:right;vertical-align:top;white-space:nowrap;">${formatMoney(item.price_pence)}</td>` +
        `</tr>`
    );
    if (item.item_type === "bundle" && item.selections.length > 0) {
      for (const sel of item.selections) {
        const label = sel.selected_product_name || sel.bundle_line_label || "Selection";
        lineRows.push(
          `<tr>` +
            `<td colspan="3" style="padding:2px 0 2px 16px;font-family:${bodyStack};font-size:13px;color:${muted};">+ ${escapeHtml(label)} &times;${escapeHtml(sel.quantity)}</td>` +
            `</tr>`
        );
      }
    }
    // Chosen product options (modifiers) as descriptive sub-rows — same
    // treatment as bundle selections. The line price above already includes
    // any option price delta, so the option is shown by name only, no charge.
    if (item.options.length > 0) {
      for (const opt of item.options) {
        lineRows.push(
          `<tr>` +
            `<td colspan="3" style="padding:2px 0 2px 16px;font-family:${bodyStack};font-size:13px;color:${muted};">+ ${escapeHtml(opt.option_name_snapshot)}</td>` +
            `</tr>`
        );
      }
    }
  }

  const discountRow =
    order.discount_pence && order.discount_pence > 0
      ? `<tr>` +
        `<td style="padding:8px 0 4px 0;font-family:${bodyStack};font-size:14px;color:${muted};">Discount</td>` +
        `<td></td>` +
        `<td style="padding:8px 0 4px 0;font-family:${bodyStack};font-size:14px;color:${muted};text-align:right;white-space:nowrap;">&minus;${formatMoney(order.discount_pence)}</td>` +
        `</tr>`
      : "";

  const totalRow =
    `<tr><td colspan="3" style="padding:8px 0 0 0;"><div style="height:1px;background:${border};font-size:0;line-height:0;">&nbsp;</div></td></tr>` +
    `<tr>` +
    `<td style="padding:12px 0 0 0;font-family:${bodyStack};font-size:18px;color:${bodyText};font-weight:bold;">Total</td>` +
    `<td></td>` +
    `<td style="padding:12px 0 0 0;font-family:${bodyStack};font-size:18px;color:${bodyText};text-align:right;font-weight:bold;white-space:nowrap;">${formatMoney(order.total_pence)}</td>` +
    `</tr>`;

  const orderBlock =
    `<tr><td style="padding:20px 24px 0 24px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">` +
    lineRows.join("") +
    discountRow +
    totalRow +
    `</table>` +
    `</td></tr>`;

  // Drop info
  const dropTimeStr = formatDeliveryWindow(drop.delivery_start, drop.delivery_end);
  const dropBlock =
    `<tr><td style="padding:28px 24px 0 24px;font-family:${bodyStack};font-size:12px;color:${muted};letter-spacing:0.5px;text-transform:uppercase;">Your drop</td></tr>` +
    `<tr><td style="padding:6px 24px 0 24px;font-family:${bodyStack};font-size:15px;color:${bodyText};font-weight:600;">${escapeHtml(drop.name || "Drop")}</td></tr>` +
    (dropTimeStr
      ? `<tr><td style="padding:2px 24px 0 24px;font-family:${bodyStack};font-size:14px;color:${bodyText};">${escapeHtml(dropTimeStr)}</td></tr>`
      : "");

  // Fulfilment block
  const isDelivery = String(order.fulfilment_mode || "").toLowerCase() === "delivery";
  const fulfilmentHeading = isDelivery ? "Delivery" : "Collection";
  const fulfilmentLeadLine = isDelivery ? "We'll deliver to" : "Pick up from";
  const fulfilmentDetail = isDelivery
    ? order.delivery_address || ""
    : drop.collection_point_description || "Pick up details to follow";
  const fulfilmentBlock =
    `<tr><td style="padding:20px 24px 0 24px;font-family:${bodyStack};font-size:12px;color:${muted};letter-spacing:0.5px;text-transform:uppercase;">${fulfilmentHeading}</td></tr>` +
    `<tr><td style="padding:6px 24px 0 24px;font-family:${bodyStack};font-size:14px;color:${bodyText};">${escapeHtml(fulfilmentLeadLine)}</td></tr>` +
    `<tr><td style="padding:2px 24px 0 24px;font-family:${bodyStack};font-size:14px;color:${bodyText};">${escapeHtml(fulfilmentDetail)}</td></tr>`;

  // Customer notes
  const notes = String(order.customer_notes || "").trim();
  const notesBlock = notes
    ? `<tr><td style="padding:20px 24px 0 24px;font-family:${bodyStack};font-size:12px;color:${muted};letter-spacing:0.5px;text-transform:uppercase;">Your notes</td></tr>` +
      `<tr><td style="padding:6px 24px 0 24px;font-family:${bodyStack};font-size:14px;color:${bodyText};white-space:pre-wrap;">${escapeHtml(notes)}</td></tr>`
    : "";

  // Footer: !== false (default-ON per platform convention)
  const showHearthFooter = vendor.powered_by_hearth_visible !== false;
  const footer = showHearthFooter
    ? `<tr><td style="padding:32px 24px 24px 24px;font-family:${bodyStack};font-size:11px;color:${muted};text-align:center;">Powered by Hearth</td></tr>`
    : `<tr><td style="padding:32px 24px 24px 24px;font-size:0;line-height:0;">&nbsp;</td></tr>`;

  return (
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Order confirmation</title></head>` +
    `<body style="margin:0;padding:0;background:${bg};">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${bg};">` +
    `<tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;background:#FFFFFF;border:1px solid ${border};">` +
    vendorHeader +
    greeting +
    orderBlock +
    dropBlock +
    fulfilmentBlock +
    notesBlock +
    footer +
    `</table>` +
    `</td></tr>` +
    `</table>` +
    `</body></html>`
  );
}

function renderText(order: Order, items: Item[], drop: Drop, vendor: Vendor): string {
  const displayName = vendor.display_name || vendor.name || "Vendor";
  const lines: string[] = [];

  lines.push(displayName);
  if (vendor.tagline) lines.push(vendor.tagline);
  lines.push("----");
  lines.push(`Thanks ${firstName(order.customer_name)} — your order is confirmed.`);
  lines.push(`Order #${shortOrderRef(order.id)}`);
  lines.push("----");

  for (const item of items) {
    lines.push(`${item.item_name_snapshot}  ×${item.qty}  ${formatMoney(item.price_pence)}`);
    if (item.item_type === "bundle" && item.selections.length > 0) {
      for (const sel of item.selections) {
        const label = sel.selected_product_name || sel.bundle_line_label || "Selection";
        lines.push(`  + ${label} ×${sel.quantity}`);
      }
    }
    if (item.options.length > 0) {
      for (const opt of item.options) {
        lines.push(`  + ${opt.option_name_snapshot}`);
      }
    }
  }
  if (order.discount_pence && order.discount_pence > 0) {
    lines.push(`Discount  −${formatMoney(order.discount_pence)}`);
  }
  lines.push(`Total  ${formatMoney(order.total_pence)}`);
  lines.push("----");

  lines.push("Your drop");
  lines.push(drop.name || "Drop");
  const dropTimeStr = formatDeliveryWindow(drop.delivery_start, drop.delivery_end);
  if (dropTimeStr) lines.push(dropTimeStr);
  lines.push("----");

  const isDelivery = String(order.fulfilment_mode || "").toLowerCase() === "delivery";
  lines.push(isDelivery ? "Delivery" : "Collection");
  lines.push(isDelivery ? "We'll deliver to" : "Pick up from");
  lines.push(
    isDelivery
      ? order.delivery_address || ""
      : drop.collection_point_description || "Pick up details to follow"
  );

  const notes = String(order.customer_notes || "").trim();
  if (notes) {
    lines.push("----");
    lines.push("Your notes");
    lines.push(notes);
  }

  lines.push("----");
  lines.push(`Reply to this email to contact ${displayName}.`);

  return lines.join("\n");
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
    // 1. Auth: shared internal secret.
    const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
    if (!internalSecret) {
      console.error("INTERNAL_FUNCTION_SECRET not configured");
      return jsonResponse({ error: "Internal function secret not configured" }, 500);
    }
    const presented = req.headers.get("x-internal-secret") || "";
    if (presented !== internalSecret) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // 2. Resend key.
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.error("RESEND_API_KEY not configured");
      return jsonResponse({ error: "RESEND_API_KEY not configured" }, 500);
    }

    // 3. Body parse.
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }
    if (!raw || typeof raw !== "object" || !isUuid((raw as Record<string, unknown>).order_id)) {
      return jsonResponse({ error: "order_id must be a uuid" }, 400);
    }
    const order_id = (raw as Payload).order_id;

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 4. Fetch order + drop + vendor via nested embed (one round-trip).
    const { data: orderRow, error: orderErr } = await serviceClient
      .from("orders")
      .select(
        "id, drop_id, customer_name, customer_email, customer_notes, delivery_address, fulfilment_mode, total_pence, discount_pence, drop:drop_id ( name, delivery_start, delivery_end, collection_point_description, vendor:vendor_id ( display_name, name, email, tagline, brand_primary_color, brand_text_on_primary, powered_by_hearth_visible ) )"
      )
      .eq("id", order_id)
      .maybeSingle();

    if (orderErr) {
      console.error("order lookup failed", orderErr);
      return jsonResponse({ error: "Order lookup failed" }, 500);
    }
    if (!orderRow) return jsonResponse({ error: "Order not found" }, 404);

    const dropRow = (orderRow as Record<string, unknown>).drop as Record<string, unknown> | null;
    if (!dropRow) {
      console.error("drop missing for order", order_id);
      return jsonResponse({ error: "Drop not found" }, 404);
    }
    const vendorRow = dropRow.vendor as Record<string, unknown> | null;
    if (!vendorRow) {
      console.error("vendor missing for order", order_id);
      return jsonResponse({ error: "Vendor not found" }, 404);
    }

    const order: Order = {
      id: orderRow.id as string,
      customer_name: (orderRow.customer_name as string | null) ?? null,
      customer_email: (orderRow.customer_email as string | null) ?? null,
      customer_notes: (orderRow.customer_notes as string | null) ?? null,
      delivery_address: (orderRow.delivery_address as string | null) ?? null,
      fulfilment_mode: (orderRow.fulfilment_mode as string | null) ?? null,
      total_pence: Number(orderRow.total_pence ?? 0),
      discount_pence: orderRow.discount_pence != null ? Number(orderRow.discount_pence) : null,
    };
    const drop_id = (orderRow.drop_id as string | null) ?? null;
    const drop: Drop = {
      name: (dropRow.name as string | null) ?? null,
      delivery_start: (dropRow.delivery_start as string | null) ?? null,
      delivery_end: (dropRow.delivery_end as string | null) ?? null,
      collection_point_description: (dropRow.collection_point_description as string | null) ?? null,
    };
    const vendor: Vendor = {
      display_name: (vendorRow.display_name as string | null) ?? null,
      name: (vendorRow.name as string | null) ?? null,
      email: (vendorRow.email as string | null) ?? null,
      tagline: (vendorRow.tagline as string | null) ?? null,
      brand_primary_color: (vendorRow.brand_primary_color as string | null) ?? null,
      brand_text_on_primary: (vendorRow.brand_text_on_primary as string | null) ?? null,
      powered_by_hearth_visible: (vendorRow.powered_by_hearth_visible as boolean | null) ?? null,
    };

    // 5. Email-skip short-circuit if no customer email captured.
    if (!order.customer_email) {
      console.warn(JSON.stringify({ event: "order_confirmation_skipped", order_id, reason: "no_email" }));
      return jsonResponse({ skipped: true, reason: "no_email" }, 200);
    }

    // 6. Fetch order_items with embedded selections (one round-trip).
    const { data: itemRows, error: itemsErr } = await serviceClient
      .from("order_items")
      .select(
        "id, item_type, item_name_snapshot, qty, price_pence, bundle_id, selections:order_item_selections ( quantity, bundle_line:bundle_line_id ( label ), product:selected_product_id ( name ) ), options:order_option_selections ( option_name_snapshot, price_delta_pence_snapshot )"
      )
      .eq("order_id", order_id)
      .order("id", { ascending: true });

    if (itemsErr) {
      console.error("order_items lookup failed", itemsErr);
      return jsonResponse({ error: "Order items lookup failed" }, 500);
    }

    const items: Item[] = (itemRows || []).map((row: Record<string, unknown>) => {
      const selectionRows = (row.selections as Record<string, unknown>[] | null) ?? [];
      const selections: Selection[] = selectionRows
        .map((s) => {
          const bundleLine = s.bundle_line as Record<string, unknown> | null;
          const product = s.product as Record<string, unknown> | null;
          return {
            bundle_line_label: bundleLine ? ((bundleLine.label as string | null) ?? null) : null,
            selected_product_name: product ? ((product.name as string | null) ?? null) : null,
            quantity: Number(s.quantity ?? 1),
          };
        })
        .sort((a, b) => (a.bundle_line_label || "").localeCompare(b.bundle_line_label || ""));
      const optionRows = (row.options as Record<string, unknown>[] | null) ?? [];
      const options: OptionSelection[] = optionRows.map((o) => ({
        option_name_snapshot: (o.option_name_snapshot as string) ?? "",
        price_delta_pence_snapshot: Number(o.price_delta_pence_snapshot ?? 0),
      }));
      return {
        id: row.id as string,
        item_type: (row.item_type as string) ?? "product",
        item_name_snapshot: (row.item_name_snapshot as string) ?? "Item",
        qty: Number(row.qty ?? 1),
        price_pence: Number(row.price_pence ?? 0),
        bundle_id: (row.bundle_id as string | null) ?? null,
        selections,
        options,
      };
    });

    // 7. Render bodies.
    const subject = `Your order from ${vendor.display_name || vendor.name || "Hearth"} — ${drop.name || "your drop"}`;
    const htmlBody = renderHtml(order, items, drop, vendor);
    const textBody = renderText(order, items, drop, vendor);

    // 8. Send via Resend.
    const resendPayload: Record<string, unknown> = {
      from: buildFromHeader(vendor.display_name || vendor.name || "Hearth", FROM_ORDERS),
      to: order.customer_email,
      subject,
      html: htmlBody,
      text: textBody,
      tags: [{ name: "trigger", value: "order_confirmed" }],
    };
    if (vendor.email) resendPayload.reply_to = vendor.email;

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
        JSON.stringify({
          event: "order_confirmation_resend_failure",
          order_id,
          status: resendResp.status,
          body: errBody,
        })
      );
      // Best-effort visibility logging — must never change the send result or response.
      try {
        const dedupeKey = `order_confirmation:${drop_id}:${order_id}`;
        await serviceClient.from("comms_log").upsert(
          {
            drop_id,
            customer_id: null,
            touchpoint: "order_confirmation",
            channel: "email",
            recipient: order.customer_email,
            dedupe_key: dedupeKey,
            status: "failed",
            error: String(errBody).slice(0, 2000),
          },
          { onConflict: "dedupe_key" }
        );
      } catch (_e) {
        /* logging must never block the confirmation path */
      }
      return jsonResponse({ error: "Resend API error", status: resendResp.status, detail: errBody }, 500);
    }

    let resendId: string | null = null;
    try {
      const parsed = await resendResp.json();
      resendId = (parsed && typeof parsed === "object" && (parsed as Record<string, unknown>).id) as string | null;
    } catch {
      // tolerate non-JSON response — Resend returns JSON in practice
    }

    console.log(
      JSON.stringify({
        event: "order_confirmation_sent",
        order_id,
        resend_id: resendId,
      })
    );

    // Best-effort visibility logging — must never change the send result or response.
    try {
      const dedupeKey = `order_confirmation:${drop_id}:${order_id}`;
      await serviceClient.from("comms_log").upsert(
        {
          drop_id,
          customer_id: null,
          touchpoint: "order_confirmation",
          channel: "email",
          recipient: order.customer_email,
          dedupe_key: dedupeKey,
          status: "sent",
          sent_at: new Date().toISOString(),
          meta: { resend_id: resendId },
        },
        { onConflict: "dedupe_key" }
      );
    } catch (_e) {
      /* logging must never block the confirmation path */
    }

    return jsonResponse({ ok: true, resend_id: resendId }, 200);
  } catch (err) {
    console.error("send-order-confirmation unexpected error", err);
    return jsonResponse({ error: (err as Error).message || "Internal error" }, 500);
  }
});
