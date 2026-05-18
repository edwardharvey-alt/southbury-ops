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
// not returned.

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
        "drop_id, drop_name, host_name, status, opens_at, closes_at, delivery_start, delivery_end, capacity_units_total, capacity_units_used, capacity_units_remaining, order_count, host_share_enabled, host_share_total_pence, host_share_model, host_share_percentage, host_share_per_order_pence, host_share_fixed_pence, fundraising_enabled, fundraising_total_pence, fundraising_display_text"
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

    return jsonResponse(
      {
        drop_id: summary.drop_id,
        drop_name: summary.drop_name,
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
        fundraising_display_text: summary.fundraising_display_text,
        host_share_descriptor,
      },
      200
    );
  } catch (err) {
    console.error("host-view-summary unexpected error", err);
    return jsonResponse(NOT_AUTHORISED, 403);
  }
});
