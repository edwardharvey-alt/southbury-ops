// IMPORTANT: Requires ANTHROPIC_API_KEY in Supabase secrets.
// Ed to run: supabase secrets set ANTHROPIC_API_KEY=<key>
// before deploying this function.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

function buildSystemPrompt(tagline: string | null, websiteContent: string | null): string {
  let prompt = `You write short, warm copy for independent food businesses.
Output only the copy text — no preamble, explanation, or quotation marks around it.
Tone: calm, warm, local, proud. Never pushy or generic.
Avoid: "delicious", "amazing", "don't miss out", "selling fast", "limited time offer", "exciting".
Use the specific details provided. Plain, honest language.`;

  if (tagline) {
    prompt += `\n\nThe vendor's tagline is: "${tagline}" — let this inform the tone and style.`;
  }

  if (websiteContent) {
    prompt += `\n\nHere is how this vendor describes themselves on their own website. Write copy consistent with this voice:\n---\n${websiteContent}\n---`;
  }

  return prompt;
}

async function fetchWebsiteContent(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, {
      headers: { "User-Agent": "Hearth/1.0 (brand voice)" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return null;
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 800);
    return text.length > 50 ? text : null;
  } catch {
    return null; // always non-fatal
  }
}

interface CopyInput {
  touchpoint: string;
  vendor_name: string;
  drop_name: string;
  host_name: string | null;
  delivery_day: string;
  opens_day: string | null;
  opens_time: string | null;
  closes_time: string | null;
  capacity: number | null;
  ordering_url: string;
  tagline: string | null;       // new
  website_url: string | null;   // new
}

function buildPrompt(input: CopyInput): string {
  const {
    touchpoint, vendor_name, drop_name, host_name,
    delivery_day, opens_day, opens_time, closes_time,
    capacity, ordering_url
  } = input;

  const host = host_name || "their neighbourhood";
  const cap = capacity ? `${capacity} orders` : "limited orders";
  const opensWhen = opens_day && opens_time
    ? `${opens_day} at ${opens_time}`
    : opens_day || "soon";

  switch (touchpoint) {
    case "monday_reveal":
      return `Write a social media post for ${vendor_name} announcing their upcoming '${drop_name}' food drop at ${host} this ${delivery_day}. Ordering opens ${opensWhen} — do not include a link yet. Build warm anticipation. 2–3 sentences.`;

    case "tuesday_host":
      return `Write a WhatsApp message from ${host} to their members about ${vendor_name}'s '${drop_name}' food drop this ${delivery_day}. Written as the venue or club organiser — a trusted community heads-up, not a vendor promotion. Mention ordering opens ${opensWhen} and capacity is ${cap}. 3–4 short sentences, casual and warm.`;

    case "thursday_vendor":
      return `Write a short WhatsApp message from ${vendor_name} to their customers. Ordering is now open for '${drop_name}'. Include this ordering link: ${ordering_url}. Mention ${cap} available and orders close at ${closes_time || "tonight"}. Under 40 words. Direct but warm.`;

    case "thursday_host_link":
      return `Write a very short WhatsApp message from ${host} dropping the live ordering link in their group. Under 15 words. Mention ${cap} remaining and include this link: ${ordering_url}. Nothing else.`;

    case "friday_post_drop":
      return `Write a short social media post from ${vendor_name} after completing their '${drop_name}' food drop. Warm and grateful. Hint that the next one is coming. 2 sentences.`;

    case "early_access_email":
      return `Write the complete body of an early access email from ${vendor_name} to a previous customer.
The drop is '${drop_name}' at ${host} on ${delivery_day}. Orders close at ${closes_time || "tonight"} and capacity is ${cap}.
The ordering link is: ${ordering_url}

Write in this exact structure, with blank lines between sections:
"Hi,"
[1-2 warm sentences explaining they get early access before the public link goes live — do not invent any details not listed above]
"Order here: ${ordering_url}"
"Capacity is limited to ${cap} and closes at ${closes_time || "tonight"}."
"${vendor_name}"

Plain language. Warm but not gushing. Do not add a subject line.`;

    case "post_drop_thankyou":
      return `Write the complete body of a thank-you email from ${vendor_name} to a customer after their '${drop_name}' drop on ${delivery_day}.

Write in this exact structure, with blank lines between sections:
"Hi,"
[1-2 genuinely warm sentences thanking them for ordering — do not invent any specific details]
[1 sentence hinting the next drop is coming, without being specific about dates]
"${vendor_name}"

Plain language. Genuine warmth. Do not add a subject line. Do not invent details not given above.`;

    default:
      return `Write a short, warm social media post for ${vendor_name} about their '${drop_name}' food drop at ${host} this ${delivery_day}. 2 sentences.`;
  }
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
    let input: CopyInput;
    try {
      input = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    if (!input.touchpoint || !input.vendor_name || !input.drop_name) {
      return jsonResponse({ error: "touchpoint, vendor_name, and drop_name are required" }, 400);
    }

    // ---- Voice context ------------------------------------------
    const tagline = input.tagline || null;
    let websiteContent: string | null = null;
    if (input.website_url) {
      websiteContent = await fetchWebsiteContent(input.website_url);
      if (websiteContent) {
        console.log(`[generate-activation-copy] website content fetched (${websiteContent.length} chars)`);
      }
    }
    const systemPrompt = buildSystemPrompt(tagline, websiteContent);

    // ---- Generate ---------------------------------------------------
    const userPrompt = buildPrompt(input);

    const anthropicRes = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("[generate-activation-copy] Anthropic error:", errText);
      return jsonResponse({ error: "Copy generation failed" }, 502);
    }

    const anthropicData = await anthropicRes.json();
    const rawCopy = anthropicData?.content?.[0]?.text ?? "";

    // Strip surrounding quotes if the model adds them despite instructions
    const copy = rawCopy.trim().replace(/^["']|["']$/g, "").trim();

    console.log(`[generate-activation-copy] touchpoint=${input.touchpoint} vendor=${input.vendor_name} chars=${copy.length}`);
    return jsonResponse({ copy }, 200);

  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
