// Shared post-drop thank-you email builder (T5-11, comms thank-you slice 2a).
//
// Pure move of the subject/HTML/text construction that previously lived
// inline in send-post-drop-thankyou. Extracted verbatim so the rendered
// email is byte-identical to what the Edge Function produced before — no
// copy changes. The Edge Function now imports buildPostDropThankyouEmail
// and uses its { subject, html, text } per recipient.
//
// buildFromHeader / reply_to / the Resend call itself stay in the EF — this
// module only builds the message content.

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

export interface PostDropThankyouVendor {
  display_name: string | null;
  brand_primary_color: string | null;
}

export interface PostDropThankyouDrop {
  name: string;
  delivery_start: string | null;
}

export interface PostDropThankyouNextDrop {
  name: string;
  slug: string;
  delivery_start: string | null;
  opens_at: string | null;
}

export interface PostDropThankyouEmailInput {
  recipientName: string;
  vendor: PostDropThankyouVendor;
  drop: PostDropThankyouDrop;
  nextDrop: PostDropThankyouNextDrop | null;
  customSubject?: string | null;
  customBody?: string | null;
}

export interface PostDropThankyouEmail {
  subject: string;
  html: string;
  text: string;
}

export function buildPostDropThankyouEmail(
  input: PostDropThankyouEmailInput,
): PostDropThankyouEmail {
  const { recipientName, vendor, drop, nextDrop, customSubject, customBody } = input;

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

  const subject = customSubject || `Thank you for your order — ${drop.name}`;

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

  const text = customBody || buildDefaultBody(recipientName);
  const html = buildHtml(text);

  return { subject, html, text };
}
