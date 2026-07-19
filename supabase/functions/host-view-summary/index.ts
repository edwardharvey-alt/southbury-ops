import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Anonymous, token-authenticated read for the host-view page.
// Authorization is the per-drop opaque host_access_token stored in
// drop_host_tokens. The host receives a link of the shape
// host-view.html?drop=<slug>&token=<uuid>; this function validates
// that the slug resolves to a drop whose drop_host_tokens row
// carries the matching token.
//
// verify_jwt = false. Host flow has no authenticated user; the
// (slug, token) pair is the only authorization signal.
//
// Every failure mode (bad input, unknown slug, missing token row,
// token mismatch) returns the same 403 body — the function deliberately
// does not reveal which check failed.
//
// Response surface is deliberately minimal — only the fields needed
// to render the host-view page. Raw share-mechanic fields
// (host_share_percentage, host_share_model, host_share_per_order_pence,
// host_share_fixed_pence, drop_gmv_pence) are read solely to build the
// human-readable host_share_descriptor server-side and are intentionally
// not returned. The fundraising mechanics
// (fundraising_model, fundraising_per_order_pence, fundraising_percentage)
// are read on the same terms, to build fundraising_descriptor.
//
// fundraising_cause_reference is OPERATOR-ONLY (charity number or
// remittance note) and is deliberately NOT selected and NOT returned.
// Do not add it. fundraising_cause_name is the public field.

type Payload = {
  slug: string;
  token: string;
};

const NOT_AUTHORISED = { error: "not_authorised" } as const;

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function validatePayload(body: unknown): { ok: true; data: Payload } | { ok: false } {
  if (!body || typeof body !== "object") return { ok: false };
  const b = body as Record<string, unknown>;
  if (typeof b.slug !== "string" || !b.slug.trim()) return { ok: false };
  if (!isUuid(b.token)) return { ok: false };
  return { ok: true, data: { slug: b.slug.trim(), token: b.token } };
}

function buildHostShareDescriptor(row: {
  host_share_enabled: unknown;
  host_share_model: unknown;
  host_share_percentage: unknown;
  host_share_per_order_pence: unknown;
  host_share_fixed_pence: unknown;
}): string | null {
  if (row.host_share_enabled !== true) return null;
  const model = String(row.host_share_model ?? "");
  if (model === "percentage") {
    return `You receive ${row.host_share_percentage}% of orders`;
  }
  if (model === "per_order") {
    const pence = Number(row.host_share_per_order_pence ?? 0);
    return `You receive £${(pence / 100).toFixed(2)} per order`;
  }
  if (model === "fixed") {
    const pence = Number(row.host_share_fixed_pence ?? 0);
    return `You receive £${(pence / 100).toFixed(2)} for this drop`;
  }
  return null;
}

// Human-readable fundraising line for the HOST audience, composed server-side
// exactly as buildHostShareDescriptor composes its sibling.
//
// MIRROR OF assets/hearth-fundraising.js (HearthFundraising.resolve, audience
// "host"), which is the single source of truth for these rules and is shared by
// order.html and drop-manager.html. Deno cannot import that file, so the rules
// are restated here. If you change one, change the other — the two differ ONLY
// in audience phrasing ("every order" here, "your order" for the customer).
//
// Rules, in order:
//   - fundraising off                    -> null
//   - fundraising_display_text set       -> the vendor's own words, verbatim
//                                           (it is an OPTIONAL OVERRIDE)
//   - otherwise compose from the fields, requiring a cause name and a positive
//     amount; anything less -> null.
//
// Returning null rather than a partial sentence is the point: before this
// descriptor existed the page rendered fundraising_display_text directly, so a
// drop saved with a blank message showed a fundraising figure with no
// explanation beneath it. A composed line closes that; a half-composed line
// would reopen it.
//
// Percentage shows the RATE, never a pound figure — the amount is settled
// net-of-discount server-side (operational learning #55).
function buildFundraisingDescriptor(row: {
  fundraising_enabled: unknown;
  fundraising_display_text: unknown;
  fundraising_model: unknown;
  fundraising_percentage: unknown;
  fundraising_per_order_pence: unknown;
  fundraising_cause_name: unknown;
}): string | null {
  if (row.fundraising_enabled !== true) return null;

  const override = String(row.fundraising_display_text ?? "").trim();
  if (override) return override;

  const cause = String(row.fundraising_cause_name ?? "").trim();
  if (!cause) return null;

  const model = String(row.fundraising_model ?? "");

  if (model === "per_order") {
    const pence = Number(row.fundraising_per_order_pence ?? 0);
    if (!(pence > 0)) return null;
    return `£${(pence / 100).toFixed(2)} from every order supports ${cause}`;
  }

  if (model === "percentage") {
    const pct = Number(row.fundraising_percentage ?? 0);
    if (!(pct > 0)) return null;
    // Trim a trailing .00 / .50 -> "5", "2.5"
    const pctText = String(Number(pct.toFixed(2)));
    return `${pctText}% of every order supports ${cause}`;
  }

  return null;
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
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonResponse(NOT_AUTHORISED, 403);
    }

    const parsed = validatePayload(raw);
    if (!parsed.ok) return jsonResponse(NOT_AUTHORISED, 403);
    const { slug, token } = parsed.data;

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: summary, error: summaryErr } = await serviceClient
      .from("v_drop_summary")
      .select(
        "drop_id, drop_name, vendor_name, host_name, status, opens_at, closes_at, delivery_start, delivery_end, capacity_units_total, capacity_units_used, capacity_units_remaining, order_count, host_share_enabled, host_share_total_pence, host_share_model, host_share_percentage, host_share_per_order_pence, host_share_fixed_pence, fundraising_enabled, fundraising_total_pence, fundraising_display_text, fundraising_model, fundraising_percentage, fundraising_per_order_pence, fundraising_cause_name"
      )
      .eq("slug", slug)
      .maybeSingle();

    if (summaryErr) {
      console.error("v_drop_summary lookup failed", summaryErr);
      return jsonResponse(NOT_AUTHORISED, 403);
    }
    if (!summary) return jsonResponse(NOT_AUTHORISED, 403);

    const { data: tokenRow, error: tokenErr } = await serviceClient
      .from("drop_host_tokens")
      .select("host_access_token")
      .eq("drop_id", summary.drop_id)
      .maybeSingle();

    if (tokenErr) {
      console.error("drop_host_tokens lookup failed", tokenErr);
      return jsonResponse(NOT_AUTHORISED, 403);
    }
    if (!tokenRow) return jsonResponse(NOT_AUTHORISED, 403);
    if (tokenRow.host_access_token !== token) return jsonResponse(NOT_AUTHORISED, 403);

    const host_share_descriptor = buildHostShareDescriptor(summary);
    const fundraising_descriptor = buildFundraisingDescriptor(summary);

    return jsonResponse(
      {
        drop_id: summary.drop_id,
        drop_name: summary.drop_name,
        vendor_name: summary.vendor_name,
        host_name: summary.host_name,
        status: summary.status,
        opens_at: summary.opens_at,
        closes_at: summary.closes_at,
        delivery_start: summary.delivery_start,
        delivery_end: summary.delivery_end,
        capacity_units_total: summary.capacity_units_total,
        capacity_units_used: summary.capacity_units_used,
        capacity_units_remaining: summary.capacity_units_remaining,
        order_count: summary.order_count,
        host_share_enabled: summary.host_share_enabled,
        host_share_total_pence: summary.host_share_total_pence,
        fundraising_enabled: summary.fundraising_enabled,
        fundraising_total_pence: summary.fundraising_total_pence,
        // Retained alongside fundraising_descriptor purely so this deploy is a
        // no-op for the currently-live host-view.html, which still reads it —
        // that is what makes deploy-before-merge safe here (critical rule #15).
        // The page stops reading it in the same PR; drop this field once merged.
        fundraising_display_text: summary.fundraising_display_text,
        host_share_descriptor,
        fundraising_descriptor,
      },
      200
    );
  } catch (err) {
    console.error("host-view-summary unexpected error", err);
    return jsonResponse(NOT_AUTHORISED, 403);
  }
});
