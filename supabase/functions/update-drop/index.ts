import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Whitelist of drops columns that can be updated via this function.
// Anything outside this list is silently dropped from the payload.
//
// Intentionally excluded (must never be client-editable here):
//   id, vendor_id (identity — never reassign a drop)
//   slug (server-controlled identity post-creation; vendors cannot
//     rename drops via this surface — see PR 4a build prompt)
//   status (lifecycle — handled by transition-drop-status)
//   series_id, series_position, window_group_id (clone-mode shape —
//     stamped on creation only via create-drop's widened whitelist)
//   created_at, updated_at, published_at, closed_at, archived_at
//     (lifecycle timestamps — server-managed)
//   capacity_pizzas, max_orders (legacy NOT NULL — T5-B5 cleanup)
const ALLOWED_FIELDS = new Set([
  "name",
  "drop_type",
  "host_id",
  "notes_internal",
  "fulfilment_mode",
  "collection_point_description",
  "delivery_area_description",
  "customer_notes_enabled",
  "centre_postcode",
  "radius_km",
  "capacity_category_id",
  "capacity_category",
  "capacity_units_total",
  "opens_at",
  "closes_at",
  "delivery_start",
  "delivery_end",
  "fundraising_enabled",
  "fundraising_model",
  "fundraising_percentage",
  "fundraising_per_order_pence",
  "fundraising_display_text",
  "host_share_enabled",
  "host_share_model",
  "host_share_percentage",
  "host_share_per_order_pence",
  "host_share_fixed_pence",
  "host_share_customer_visible",
]);

const VALID_DROP_TYPES = new Set(["neighbourhood", "hosted", "community", "event"]);
const VALID_FUNDRAISING_MODELS = new Set(["percentage", "per_order"]);
const VALID_HOST_SHARE_MODELS = new Set(["percentage", "per_order", "fixed"]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
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

    let body: { vendor_id?: string; drop_id?: string; fields?: Record<string, unknown> };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { vendor_id, drop_id, fields } = body;
    if (!vendor_id) return jsonResponse({ error: "vendor_id is required" }, 400);
    if (!drop_id) return jsonResponse({ error: "drop_id is required" }, 400);
    if (!fields || typeof fields !== "object") {
      return jsonResponse({ error: "fields object is required" }, 400);
    }

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

    // Whitelist filter — null is a meaningful clear (e.g. clearing
    // host_id, opens_at) so we keep nulls and only drop undefined.
    const update: Record<string, unknown> = {};
    for (const key of Object.keys(fields)) {
      if (ALLOWED_FIELDS.has(key) && fields[key] !== undefined) {
        update[key] = fields[key];
      }
    }

    if (Object.keys(update).length === 0) {
      return jsonResponse({ error: "No valid fields to update" }, 400);
    }

    // ---- Save-time invariants (Audit A hybrid) ----
    if (Object.prototype.hasOwnProperty.call(update, "drop_type")) {
      const dt = update.drop_type;
      if (dt !== null && (typeof dt !== "string" || !VALID_DROP_TYPES.has(dt))) {
        return jsonResponse({ error: "Invalid drop_type" }, 400);
      }
    }

    if (Object.prototype.hasOwnProperty.call(update, "capacity_units_total")) {
      const cap = update.capacity_units_total;
      if (cap !== null) {
        if (!isFiniteNumber(cap) || cap < 0) {
          return jsonResponse({ error: "capacity_units_total must be >= 0" }, 400);
        }
      }
    }

    if (Object.prototype.hasOwnProperty.call(update, "radius_km")) {
      const r = update.radius_km;
      if (r !== null) {
        if (!isFiniteNumber(r) || r < 0) {
          return jsonResponse({ error: "radius_km must be >= 0" }, 400);
        }
      }
    }

    const ds = parseTimestamp(update.delivery_start);
    const de = parseTimestamp(update.delivery_end);
    const ca = parseTimestamp(update.closes_at);
    if (ds !== null && de !== null && de <= ds) {
      return jsonResponse({ error: "delivery_end must be after delivery_start" }, 400);
    }
    if (ca !== null && ds !== null && ca > ds) {
      return jsonResponse({ error: "closes_at must be on or before delivery_start" }, 400);
    }

    // host_id ownership — closes the cross-vendor host-poisoning gap.
    if (Object.prototype.hasOwnProperty.call(update, "host_id")) {
      const hostId = update.host_id;
      if (hostId !== null && hostId !== undefined) {
        if (typeof hostId !== "string") {
          return jsonResponse({ error: "host_id must be a uuid string" }, 400);
        }
        const { data: host, error: hostErr } = await serviceClient
          .from("hosts")
          .select("id")
          .eq("id", hostId)
          .eq("vendor_id", vendor_id)
          .maybeSingle();
        if (hostErr) return jsonResponse({ error: "Host lookup failed" }, 500);
        if (!host) {
          return jsonResponse({ error: "host_id does not belong to this vendor" }, 400);
        }
      }
    }

    // capacity_category_id ownership + reconcile slug from categories.
    if (Object.prototype.hasOwnProperty.call(update, "capacity_category_id")) {
      const catId = update.capacity_category_id;
      if (catId !== null && catId !== undefined) {
        if (typeof catId !== "string") {
          return jsonResponse({ error: "capacity_category_id must be a uuid string" }, 400);
        }
        const { data: category, error: catErr } = await serviceClient
          .from("categories")
          .select("id, slug")
          .eq("id", catId)
          .eq("vendor_id", vendor_id)
          .maybeSingle();
        if (catErr) return jsonResponse({ error: "Category lookup failed" }, 500);
        if (!category) {
          return jsonResponse({ error: "capacity_category_id does not belong to this vendor" }, 400);
        }
        // Server-derive the text slug (Audit B reconciliation).
        // Whatever the client sent for capacity_category is overwritten.
        update.capacity_category = category.slug;
      } else {
        // Client cleared the FK — clear the text slug too so the pair
        // stays consistent.
        update.capacity_category = null;
      }
    }

    // Fundraising coherence — only enforce when the client is enabling.
    if (update.fundraising_enabled === true) {
      const model = update.fundraising_model;
      if (typeof model !== "string" || !VALID_FUNDRAISING_MODELS.has(model)) {
        return jsonResponse({ error: "fundraising_model is required when fundraising is enabled" }, 400);
      }
      if (model === "percentage") {
        const pct = update.fundraising_percentage;
        if (!isFiniteNumber(pct) || pct <= 0) {
          return jsonResponse({ error: "fundraising_percentage must be > 0" }, 400);
        }
      }
      if (model === "per_order") {
        const pence = update.fundraising_per_order_pence;
        if (!isFiniteNumber(pence) || pence <= 0) {
          return jsonResponse({ error: "fundraising_per_order_pence must be > 0" }, 400);
        }
      }
      if (typeof update.fundraising_display_text !== "string" || !update.fundraising_display_text) {
        return jsonResponse({ error: "fundraising_display_text is required when fundraising is enabled" }, 400);
      }
    }

    // Host share coherence — only enforce when the client is enabling.
    if (update.host_share_enabled === true) {
      const model = update.host_share_model;
      if (typeof model !== "string" || !VALID_HOST_SHARE_MODELS.has(model)) {
        return jsonResponse({ error: "host_share_model is required when host share is enabled" }, 400);
      }
      if (model === "percentage") {
        const pct = update.host_share_percentage;
        if (!isFiniteNumber(pct) || pct <= 0) {
          return jsonResponse({ error: "host_share_percentage must be > 0" }, 400);
        }
      }
      if (model === "per_order") {
        const pence = update.host_share_per_order_pence;
        if (!isFiniteNumber(pence) || pence <= 0) {
          return jsonResponse({ error: "host_share_per_order_pence must be > 0" }, 400);
        }
      }
      if (model === "fixed") {
        const pence = update.host_share_fixed_pence;
        if (!isFiniteNumber(pence) || pence <= 0) {
          return jsonResponse({ error: "host_share_fixed_pence must be > 0" }, 400);
        }
      }
    }

    // ---- Service-role write, double-filtered on id + vendor_id ----
    const { data, error } = await serviceClient
      .from("drops")
      .update(update)
      .eq("id", drop_id)
      .eq("vendor_id", vendor_id)
      .select()
      .maybeSingle();

    if (error) return jsonResponse({ error: error.message }, 400);
    if (!data) return jsonResponse({ error: "Drop not found" }, 404);

    return jsonResponse(data, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
