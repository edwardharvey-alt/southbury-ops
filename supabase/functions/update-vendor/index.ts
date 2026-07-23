import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Whitelist of vendor columns that can be updated via this function.
// Anything outside this list is silently dropped from the payload.
//
// Intentionally excluded (must never be client-editable):
//   id, auth_user_id, slug, created_at,
//   stripe_account_id, stripe_onboarding_complete,
//   terms_accepted, terms_accepted_at,
//   onboarding_completed (changed only by onboarding flow's final step)
//
// If you need to add a new editable column, add it here. Anything not
// in this list is ignored, not rejected — so adding new fields to the
// client form without updating this list will silently no-op.
const ALLOWED_FIELDS = new Set([
  // Identity
  "name",
  "display_name",
  "tagline",
  "brand_voice",
  "order_label",
  "contact_phone",
  "website_url",
  "address",
  // T-vendor-location-contact. Public location + contact. Plain nullable text,
  // no interceptor needed below — the Brand page sends `|| null`, which is what
  // makes blank input store NULL rather than "" (same as offer_statement).
  // contact_email is DISTINCT from `email` (the account/login address), which
  // is intentionally NOT in this whitelist and must never become editable here.
  "town",
  "postcode",
  "contact_email",
  "social_handles",

  // Brand
  "logo_url",
  "hero_image_url",
  "brand_primary_color",
  "brand_secondary_color",
  "brand_text_on_primary",

  // Onboarding answers (covers future onboarding migration without code change)
  "vendor_type",
  "drop_format",
  "data_posture",
  "delivery_model",
  "customer_data_posture",
  "customer_geography",
  "primary_goal",
  "typical_capacity_range",
  "preferred_fulfilment",
  "preferred_cadence",
  "existing_host_contexts",
  "existing_host_details",
  "pos_platform",
  "pos_platform_other",

  // Public vendor page
  "faq",

  // Customer-facing description of what the vendor offers, in their own words
  // (T-vendor-offer-statement). Plain nullable text with no DB constraint, so
  // it needs no validation interceptor below — the page sends `|| null`, which
  // is what makes blank input store NULL rather than "".
  "offer_statement",

  // Durable vendor QR card — an optional line the vendor writes in their own
  // words, printed on the card (T-CAP-2b).
  "qr_card_line",

  // Service declaration — vendor declares they offer catering, which surfaces a
  // catering enquiry link on their public page (get-vendor-page / vendor.html).
  "catering_enabled",

  // UI dismissals
  "head_start_dismissed",
]);

// T-CAP-1 (PR4) — vendor-authored FAQ.
//
// `faq` is the ONLY whitelisted field that is validated rather than passed
// through, because it is free text the vendor writes here and Hearth renders on
// a public page. The whitelist alone would let any jsonb shape through, and the
// column CHECK only guarantees "is an array" — so the entry shape, the caps,
// and the empty-row rule are enforced here.
const FAQ_MAX_ENTRIES = 8;
const FAQ_MAX_Q = 200;
const FAQ_MAX_A = 1000;

// Returns the cleaned array on success, or an error string for the 400 body.
// Entries where q or a is empty after trimming are DROPPED, not rejected: the
// Brand page seeds three prompt questions with blank answers, and a vendor who
// answers one of three must be able to save without the other two reaching the
// public page. Over-length is rejected rather than truncated — silently cutting
// a vendor's own words mid-sentence and publishing the remainder is worse than
// telling them.
function validateFaq(
  value: unknown,
): { ok: true; value: Array<{ q: string; a: string }> } | { ok: false; error: string } {
  if (!Array.isArray(value)) {
    return { ok: false, error: "faq must be an array" };
  }
  if (value.length > FAQ_MAX_ENTRIES) {
    return { ok: false, error: `faq cannot have more than ${FAQ_MAX_ENTRIES} entries` };
  }

  const cleaned: Array<{ q: string; a: string }> = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { ok: false, error: "each faq entry must be an object" };
    }
    const e = entry as Record<string, unknown>;

    // Reject anything beyond q and a, so an unexpected key can never be
    // persisted and surface later on the public page.
    const extra = Object.keys(e).filter((k) => k !== "q" && k !== "a");
    if (extra.length > 0) {
      return { ok: false, error: `faq entries may only contain q and a (found: ${extra.join(", ")})` };
    }
    if (typeof e.q !== "string" || typeof e.a !== "string") {
      return { ok: false, error: "each faq entry must have a string q and a string a" };
    }

    const q = e.q.trim();
    const a = e.a.trim();
    if (q.length > FAQ_MAX_Q) {
      return { ok: false, error: `faq questions cannot be longer than ${FAQ_MAX_Q} characters` };
    }
    if (a.length > FAQ_MAX_A) {
      return { ok: false, error: `faq answers cannot be longer than ${FAQ_MAX_A} characters` };
    }

    // A half-filled row is a prompt the vendor hasn't answered yet. Drop it.
    if (!q || !a) continue;

    cleaned.push({ q, a });
  }

  return { ok: true, value: cleaned };
}

// T-CAP-2b (PR1) — the line printed on the durable vendor QR card.
//
// Validated here rather than passed through for the same reason as `faq`: it is
// free text the vendor writes, and it ends up printed on a physical artefact
// that lives for months. The whitelist alone would let any type through, and
// the column CHECK only guarantees the 1..60 range — so the type, the trim, and
// the empty-means-null rule are enforced here.
//
// This is the real guard, not a duplicate of the input's maxlength: that
// attribute is a soft UI stop on the Brand page, and this function is callable
// outside it.
const QR_CARD_LINE_MAX = 60;

// Returns the value to store on success, or an error string for the 400 body.
// An empty or whitespace-only value becomes null, not "": the card is designed
// to read correctly without the line, so "nothing written" is a supported end
// state and must have exactly one representation in the column. Over-length is
// rejected rather than truncated — silently cutting a vendor's own words and
// then printing the remainder on a card they cannot easily reprint is worse
// than telling them.
function validateQrCardLine(
  value: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string") {
    return { ok: false, error: "qr_card_line must be a string or null" };
  }

  const line = value.trim();
  if (!line) return { ok: true, value: null };

  if (line.length > QR_CARD_LINE_MAX) {
    return {
      ok: false,
      error: `qr_card_line cannot be longer than ${QR_CARD_LINE_MAX} characters`,
    };
  }

  return { ok: true, value: line };
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

  // 1. Identify the user via the JWT they sent.
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

  // 2. Parse the request body. Expect { vendor_id, fields: { ... } }.
  let body: { vendor_id?: string; fields?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { vendor_id, fields } = body;
  if (!vendor_id) return jsonResponse({ error: "vendor_id is required" }, 400);
  if (!fields || typeof fields !== "object") {
    return jsonResponse({ error: "fields object is required" }, 400);
  }

  // 3. Verify the user owns this vendor. This is the security check.
  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: vendor, error: ownershipError } = await serviceClient
    .from("vendors")
    .select("id")
    .eq("id", vendor_id)
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (ownershipError) {
    return jsonResponse({ error: "Ownership check failed" }, 500);
  }
  if (!vendor) {
    return jsonResponse({ error: "Vendor not found or not owned by user" }, 403);
  }

  // 4. Filter the payload through the whitelist.
  const update: Record<string, unknown> = {};
  for (const key of Object.keys(fields)) {
    if (!ALLOWED_FIELDS.has(key)) continue;

    if (key === "faq") {
      const result = validateFaq(fields[key]);
      if (!result.ok) return jsonResponse({ error: result.error }, 400);
      update[key] = result.value;
      continue;
    }

    if (key === "qr_card_line") {
      const result = validateQrCardLine(fields[key]);
      if (!result.ok) return jsonResponse({ error: result.error }, 400);
      update[key] = result.value;
      continue;
    }

    // catering_enabled is a service declaration the vendor toggles, and the
    // column is a strict NOT NULL boolean — so validate the type here rather
    // than pass an arbitrary shape through and let the DB reject it opaquely.
    if (key === "catering_enabled") {
      if (typeof fields[key] !== "boolean") {
        return jsonResponse({ error: "catering_enabled must be true or false" }, 400);
      }
      update[key] = fields[key];
      continue;
    }

    update[key] = fields[key];
  }

  if (Object.keys(update).length === 0) {
    return jsonResponse({ error: "No valid fields to update" }, 400);
  }

  // 5. Perform the update.
  const { data, error } = await serviceClient
    .from("vendors")
    .update(update)
    .eq("id", vendor_id)
    .select()
    .single();

  if (error) return jsonResponse({ error: error.message }, 400);
  return jsonResponse(data, 200);
});
