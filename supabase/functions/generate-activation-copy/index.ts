// IMPORTANT: Requires ANTHROPIC_API_KEY in Supabase secrets.
// Ed to run: supabase secrets set ANTHROPIC_API_KEY=<key>
// before deploying this function.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

// Shared guardrail appended to EVERY touchpoint prompt (before any vendor
// guidance) so all cases inherit it from one place. Purely restrictive: it
// stops the invention we've seen (meal-type, frequency) without constraining
// good output. A case that lacks its signals simply stays conservative until
// a later prompt feeds them.
const COPY_FLOOR = `Rules for the line(s) you write: use only the facts given above. Never invent or guess — (a) how often this happens: do not say 'once', 'weekly', 'first time', 'regular', or imply any frequency, unless a cadence is provided; (b) the meal or service type: do not say 'breakfast', 'lunch', 'dinner' or 'dinner service' — describe only what the drop name and details tell you; (c) the fulfilment method: only mention collection or delivery if you are told which; (d) any number, count or price you were not given; (e) any menu item beyond a dish explicitly provided. Voice: warm, calm, confident, local — never hype, fake urgency, exclamation marks, or marketplace clichés like 'boost', 'trending', 'limited-time' or 'don't miss out'. Platform words: never use the word 'drop' to name the event, and never mention 'Hearth'. These are internal words the customer doesn't need — describe the occasion in plain terms (the food, the venue, the date).`;

function buildSystemPrompt(tagline: string | null, voiceSample: string | null): string {
  let prompt = `You write short, warm copy for independent food businesses.
Output only the copy text — no preamble, explanation, or quotation marks around it.
Tone: calm, warm, local, proud. Never pushy or generic.
Avoid: "delicious", "amazing", "don't miss out", "selling fast", "limited time offer", "exciting".
Use the specific details provided. Plain, honest language.`;

  if (tagline) {
    prompt += `\n\nThe vendor's tagline is: "${tagline}".`;
  }
  if (voiceSample) {
    prompt += `\n\nHere is how this vendor describes themselves, in their own words:\n---\n${voiceSample}\n---`;
  }
  if (tagline || voiceSample) {
    prompt += `\n\nUse the tagline and the description above only as a guide to the vendor's voice and tone — how they sound. They are NOT a source of facts about this particular service: do not carry over meal types, dishes, times, or anything they list into the copy. The facts for this service come only from the details in the task below.`;
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
  brand_voice?: string | null;
  guidance?: string | null;     // optional vendor steer for regeneration
  channel?: string | null;       // 'whatsapp' (default) | 'social' — vendor_open only
  // Signals assembled by actBuildDropContext on the frontend; read per case.
  fulfilment_mode?: string | null;
  reveal_dish?: string | null;
  cadence?: string | null;
  // Catering-confirm context (direct / catering drops only) — the single named
  // client the drop was converted for. Inert for every other touchpoint; read
  // solely by the catering_confirm case. event_date arrives pre-formatted as a
  // human string (the frontend formats it), so it is used verbatim.
  contact_name?: string | null;
  event_type?: string | null;
  event_date?: string | null;
  // Card 4 poster framing: 'till' (open/walk-up, default) | 'noticeboard'
  // (closed/pinned sheet). Read only by the poster_hook case.
  posterType?: string | null;
  // ADJUST mode: the draft currently on screen. When non-empty the function
  // revises this text (applying `guidance` as the change to make) instead of
  // generating fresh. Absent/empty → GENERATE exactly as before.
  currentText?: string | null;
  // Social formatting toggles — honoured only on the social branch
  // (channel 'social' / 'instagram'); ignored on whatsapp/email. Both keys
  // default false; an absent object adds nothing (backward compatible).
  socialOptions?: { hashtags?: boolean; emojis?: boolean } | null;
}

function buildPrompt(input: CopyInput): string {
  const {
    touchpoint, vendor_name, drop_name, host_name,
    delivery_day, opens_day, opens_time, closes_time,
    capacity, ordering_url, fulfilment_mode, reveal_dish, cadence, posterType, channel,
    contact_name, event_type, event_date
  } = input;

  const ch = (channel === 'social' || channel === 'email') ? channel : 'whatsapp';   // default/unknown → whatsapp

  const host = host_name || "their neighbourhood";
  const cap = capacity ? `${capacity} orders` : "limited orders";
  const opensWhen = opens_day && opens_time
    ? `${opens_day} at ${opens_time}`
    : opens_day || "soon";

  switch (touchpoint) {
    case "menu_reveal_hook":
      return `Write a single punchy hook line for a reveal post. Around 80 characters maximum.
Vendor: ${vendor_name}. Drop: '${drop_name}' at ${host} on ${delivery_day}.
One line only. No emojis. Warm and intriguing. Do not invent specific menu items — keep it to the type of food and occasion.
Output only the line, nothing else.`;

    case "menu_reveal":
      return `Write a social media post for ${vendor_name} announcing their upcoming '${drop_name}'${host_name ? ` at ${host_name}` : ''} this ${delivery_day}. Ordering opens ${opensWhen} — do not include a link yet. Build warm anticipation. 2–3 sentences. Do not invent specific food items or menu details — keep it to what you know from the context given.`;

    case "host_heads_up":
      return `Write a WhatsApp message from ${host} to their members about ${vendor_name}'s '${drop_name}' this ${delivery_day}. Written as the venue or club organiser — a trusted community heads-up, not a vendor promotion. Mention ordering opens ${opensWhen} and capacity is ${cap}. 3–4 short sentences, casual and warm.`;

    case "vendor_open":
      if (ch === 'social') {
        return `Write a short social caption announcing that ordering is NOW open for '${drop_name}'${host_name ? ` at ${host}` : ''}. This is a public post for the vendor's own social (Instagram or Facebook) — a standalone caption, NOT a direct message, so do not address it to "you" or "our customers". Warm, proud, and calm — 1–2 sentences. ${capacity ? `Capacity is limited to ${capacity}.` : ""} You may note it is pre-order only and places are limited if it reads naturally. Do not include the ordering link or closing time — these are added automatically.`;
      }
      if (ch === 'email') {
        return `Write a short email from ${vendor_name} to their customers announcing that ordering is NOW open for '${drop_name}'${host_name ? ` at ${host}` : ''} on ${delivery_day}. Begin with a subject line on its own first line, prefixed "Subject: ". Then 2–3 short sentences — warm, direct, the kind of email a customer is glad to receive. ${capacity ? `Capacity is limited to ${capacity}.` : ""} Do not include the ordering link or closing time — these are added automatically.`;
      }
      return `Write a short WhatsApp message from ${vendor_name} to their customers announcing that ordering is NOW open for '${drop_name}' at ${host} on ${delivery_day}. ${capacity ? `${capacity} slots available.` : ""} Direct and warm — 1–2 sentences only. Do not include the ordering link or closing time — these will be added automatically.`;

    case "host_link":
      return `Write a very short WhatsApp message from ${host} dropping the live ordering link in their group. Under 15 words. Mention ${cap} remaining and include this link: ${ordering_url}. Nothing else.`;

    case "post_drop":
      return `Write a short social media post from ${vendor_name} after completing their '${drop_name}'. Warm and grateful. Hint that the next one is coming. 2 sentences.`;

    case "early_access_email":
      return `Write 1–2 warm sentences for an early access email from ${vendor_name} to a previous customer.
They get to order '${drop_name}' at ${host} on ${delivery_day} before the public link goes live.
Only use facts given here — do not invent details. Plain, warm language. Output only the sentences, nothing else.`;

    case "post_drop_thankyou":
      return `Write 1–2 warm sentences thanking a customer for ordering from ${vendor_name}'s '${drop_name}' on ${delivery_day}.
Mention that more drops are coming. Do not invent specific details. Plain, warm language. Output only the sentences, nothing else.`;

    case "poster_hook":
      if (posterType === "noticeboard") {
        return `Task: Write a single calm line for a sheet pinned to a noticeboard, advertising ${vendor_name}'s food. A QR code sits directly beneath this line and carries the 'Scan to order' call to action.

Facts:
- What's available: ${reveal_dish || drop_name}${host_name ? `, at ${host_name}` : ""}
- When: ${delivery_day}
- This drop is: ${cadence || "standalone"}  (event = a one-off; series = part of a regular rhythm; standalone = a single planned occasion)

Rules: Write ONE line of 12 words or fewer, present tense. Name what's available and that it can be ordered ahead. The QR beneath carries the order CTA, so do NOT add an order instruction yourself. MUST NOT mention a till, a counter, walking up, walking in, or collecting at this spot — the reader is at a noticeboard, not at the vendor's counter. Hearth voice: warm and factual, no urgency, no hype. If a reveal dish is given you may lead with it. On frequency: if a series, you may hint at the regular rhythm; if an event, a one-off framing is fine; if standalone, say nothing about how often it happens. Do NOT use the word 'drop' or explain what one is. Do NOT include any number or count — the sheet is printed and cannot update. Return only the line — no quotation marks, no markdown, nothing else.`;
      }
      return `Task: Write a single short line for a printed poster beside the till in ${vendor_name}'s shop. Ordering is open now and a QR code sits directly beneath this line. Make a walk-in customer want to order ahead today.

Facts:
- What's offered: ${reveal_dish || drop_name}${host_name ? `, at ${host_name}` : ""}
- When: ${delivery_day}
- Fulfilment: ${fulfilment_mode || "not specified"}
- This drop is: ${cadence || "standalone"}  (event = a one-off; series = part of a regular rhythm; standalone = a single planned occasion)

Rules: Write ONE line of 12 words or fewer, present tense, that reads as an invitation to act now and sits naturally above 'Scan to order'. Use only the one or two facts that make the strongest short line — you don't need them all. If a reveal dish is given you may lead with it. Reflect fulfilment honestly: collection at a venue means they collect there; delivery means it's delivered; if not specified, say nothing about it. On frequency: if a series, you may hint at the regular rhythm; if an event, a one-off framing is fine; if standalone, say nothing about how often it happens. Do NOT use the word 'drop' or explain what one is. Do NOT include any number or count — the poster is printed and cannot update. Return only the line — no quotation marks, no markdown, nothing else.`;

    case "catering_confirm": {
      // Direct, one-to-one booking confirmation to a single named catering
      // client. Not a broadcast — address the client by name. Facts come only
      // from the linked catering enquiry; anything missing is simply omitted
      // (never invented, per COPY_FLOOR).
      const clientName = (contact_name || "").trim() || "there";
      const eventLabel = (event_type || "").trim() || "your event";
      const eventWhen = (event_date || "").trim();
      const whenClause = eventWhen ? ` on ${eventWhen}` : "";
      const byClause = eventWhen ? ` by ${eventWhen}` : " when you have a moment";
      return `Write a warm, personal booking-confirmation message from ${vendor_name} to a single catering client called ${clientName}. This is a direct one-to-one message (email or WhatsApp), NOT a public post or a broadcast — address ${clientName} by name and write as if speaking to just them.
Facts:
- Client: ${clientName}
- Occasion: ${eventLabel}${eventWhen ? `\n- Date: ${eventWhen}` : ""}
- Ordering link (they use this to confirm the order and pay): ${ordering_url}
Cover, in this order and in plain warm language: that you're looking forward to catering ${eventLabel}${whenClause}; that here is their link to confirm the order and pay — include it exactly: ${ordering_url}; a gentle ask to complete it${byClause} so everything is sorted; and an invitation to let you know if they'd like to change anything. 3 to 4 short sentences. Keep the ordering link exactly as given. Calm and warm — the tone of a message to someone you're glad to be working with. Output only the message, nothing else.`;
    }

    default:
      return `Write a short, warm social media post for ${vendor_name} about their '${drop_name}' food drop at ${host} this ${delivery_day}. 2 sentences.`;
  }
}

// (B) Format options block — hashtags + emojis on social, emojis on WhatsApp.
// Appended only when a socialOptions object is supplied (absent = unchanged
// behaviour) and the channel supports it; a no-op on email/unknown. Each key
// defaults false. These sit on top of COPY_FLOOR and the brand voice —
// restraint always wins, nothing here introduces hype.
function buildFormatOptions(channel: string, opts?: { hashtags?: boolean; emojis?: boolean } | null): string {
  if (!opts) return "";
  const isSocial = channel === "social" || channel === "instagram";
  const isWhatsapp = channel === "whatsapp";
  if (!isSocial && !isWhatsapp) return "";   // email / unknown: no format options

  const wantEmojis = opts.emojis === true;
  const emojiRule = wantEmojis
    ? "Emojis: a tasteful one or two are fine where they read naturally — never more, and never decorative rows."
    : "Emojis: do not use any emojis.";

  if (isSocial) {
    const wantHashtags = opts.hashtags === true;
    const hashtagRule = wantHashtags
      ? "Hashtags: you may add 1 to 3 relevant, restrained hashtags drawn from the place and the type of food — local and specific. No trend-chasing and no generic engagement tags (nothing like #foodie, #instafood, #yum); never more than three."
      : "Hashtags: do not use any hashtags.";
    return `\n\nSocial formatting (this is a public social caption): ${hashtagRule} ${emojiRule} These never override the rules above — keep the same calm, restrained voice.`;
  }

  // WhatsApp: emoji rule only — hashtags never belong in a personal message.
  return `\n\nWhatsApp formatting (this is a personal message to customers): ${emojiRule} This never overrides the rules above — keep the same calm, restrained voice.`;
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
    const tagline = input.tagline?.trim() || null;
    const brandVoice = input.brand_voice?.trim() || null;
    let voiceSample: string | null = brandVoice;
    if (!voiceSample && input.website_url) {
      voiceSample = await fetchWebsiteContent(input.website_url);
      if (voiceSample) {
        console.log(`[generate-activation-copy] website content fetched (${voiceSample.length} chars)`);
      }
    }
    const systemPrompt = buildSystemPrompt(tagline, voiceSample);

    // ---- Generate / Adjust -----------------------------------------
    // Append the shared guardrail floor to EVERY case here (before any vendor
    // guidance) so all touchpoints inherit it from one place.
    let userPrompt = `${buildPrompt(input)}\n\n${COPY_FLOOR}`;

    // (B) Format options — hashtags + emojis on social, emojis on WhatsApp;
    // a no-op on email and when socialOptions is absent.
    const isSocial = input.channel === "social" || input.channel === "instagram";
    const isWhatsapp = input.channel === "whatsapp";
    if ((isSocial || isWhatsapp) && input.socialOptions) {
      userPrompt += buildFormatOptions(input.channel, input.socialOptions);
    }

    // The vendor steer is standardised on the existing `guidance` field. In
    // GENERATE it is emphasis (unchanged behaviour); in ADJUST it is the change
    // to apply to the on-screen draft.
    const instruction = input.guidance?.trim() || "";
    const currentText = input.currentText?.trim() || "";

    let finalPrompt: string;
    if (currentText) {
      // (A) ADJUST — revise the existing draft rather than writing a new one.
      finalPrompt =
        `${userPrompt}\n\nYou are revising an existing message, not writing a new one. ` +
        `Here is the current version:\n---\n${currentText}\n---\n` +
        (instruction
          ? `Apply this change: "${instruction}". `
          : `Tighten and improve it lightly while keeping its meaning. `) +
        `Return the full revised message. Keep the ordering link and every key fact ` +
        `(such as capacity and closing time) exactly as they appear unless the change ` +
        `explicitly asks otherwise. Change only what is needed — do not rewrite it into ` +
        `a different message and do not invent new facts.`;
    } else {
      // GENERATE — unchanged behaviour. `guidance` acts as emphasis.
      finalPrompt = instruction
        ? `${userPrompt}\n\nAdditional instruction from the vendor: "${instruction}"`
        : userPrompt;
    }

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
        messages: [{ role: "user", content: finalPrompt }],
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
