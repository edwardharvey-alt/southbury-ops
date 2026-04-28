import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Drop lifecycle transitions, server-gated so the publish gate cannot
// be bypassed via browser dev tools or direct PostgREST.
//
// Allowed transitions:
//   draft -> live          (publish — full readiness gate + Stripe gate)
//   live  -> cancelled     (cancel a live drop)
//   *     -> archived      (archive a non-live drop)
//
// Body: { vendor_id, drop_id, target_status }
//
// Lifecycle timestamps stamped server-side:
//   draft -> live:       published_at = now()
//   live  -> cancelled:  closed_at    = now()  (no cancelled_at column)
//   *     -> archived:   archived_at  = now()

const VALID_TARGET_STATUSES = new Set(["live", "cancelled", "archived"]);
const ARCHIVE_SOURCE_STATUSES = new Set(["draft", "cancelled", "closed"]);
const VALID_FUNDRAISING_MODELS = new Set(["percentage", "per_order"]);
const VALID_HOST_SHARE_MODELS = new Set(["percentage", "per_order", "fixed"]);

type Drop = Record<string, unknown> & {
  id: string;
  vendor_id: string;
  status: string | null;
  drop_type: string | null;
  name: string | null;
  slug: string | null;
  capacity_category_id: string | null;
  capacity_category: string | null;
  capacity_units_total: number | null;
  host_id: string | null;
  delivery_start: string | null;
  delivery_end: string | null;
  closes_at: string | null;
  opens_at: string | null;
  fundraising_enabled: boolean | null;
  fundraising_model: string | null;
  fundraising_percentage: number | null;
  fundraising_per_order_pence: number | null;
  fundraising_display_text: string | null;
  host_share_enabled: boolean | null;
  host_share_model: string | null;
  host_share_percentage: number | null;
  host_share_per_order_pence: number | null;
  host_share_fixed_pence: number | null;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

// Server-side port of getLiveReadiness() in drop-manager.html. Returns
// either { ready: true } or { ready: false, reason: string }.
async function evaluateLiveReadiness(
  serviceClient: ReturnType<typeof createClient>,
  drop: Drop
): Promise<{ ready: true } | { ready: false, reason: string }> {
  // ---- basics_complete ----
  if (!drop.name) return { ready: false, reason: "Drop name is required" };
  if (!drop.slug) return { ready: false, reason: "Drop slug is required" };
  if (!drop.drop_type) return { ready: false, reason: "Drop type is required" };
  if (!drop.capacity_category_id) return { ready: false, reason: "Capacity category is required" };
  if (!drop.capacity_category) return { ready: false, reason: "Capacity category slug is required" };
  if (!isFiniteNumber(drop.capacity_units_total) || drop.capacity_units_total <= 0) {
    return { ready: false, reason: "Capacity units total must be greater than zero" };
  }
  if (drop.drop_type === "community" && !drop.host_id) {
    return { ready: false, reason: "Community drops require a host" };
  }

  // ---- timing_complete ----
  const ds = parseTimestamp(drop.delivery_start);
  const de = parseTimestamp(drop.delivery_end);
  const ca = parseTimestamp(drop.closes_at);
  const oa = parseTimestamp(drop.opens_at);
  if (ds === null) return { ready: false, reason: "Delivery start is required" };
  if (de === null) return { ready: false, reason: "Delivery end is required" };
  if (ca === null) return { ready: false, reason: "Orders close time is required" };
  if (de <= ds) return { ready: false, reason: "Delivery end must be after delivery start" };
  if (ca > ds) return { ready: false, reason: "Orders must close on or before delivery start" };
  // If opens_at is set (scheduled-open pattern), enforce opens_at < closes_at.
  // If opens_at is null, the drop opens immediately — no order check needed.
  if (oa !== null && oa >= ca) {
    return { ready: false, reason: "Orders open time must be before close time" };
  }

  // ---- menu_complete + capacity_product_present ----
  const { data: menuItems, error: menuErr } = await serviceClient
    .from("drop_menu_items")
    .select("product_id, bundle_id, is_available")
    .eq("drop_id", drop.id)
    .eq("is_available", true);
  if (menuErr) {
    return { ready: false, reason: `Menu lookup failed: ${menuErr.message}` };
  }
  if (!menuItems || menuItems.length === 0) {
    return { ready: false, reason: "At least one menu item must be enabled" };
  }

  const productIds = Array.from(
    new Set(menuItems.map((row) => row.product_id).filter((v): v is string => !!v))
  );
  const bundleIds = Array.from(
    new Set(menuItems.map((row) => row.bundle_id).filter((v): v is string => !!v))
  );

  let hasCapacityItem = false;
  if (productIds.length > 0) {
    const { data: products, error: pErr } = await serviceClient
      .from("products")
      .select("id, capacity_units")
      .in("id", productIds);
    if (pErr) return { ready: false, reason: `Product lookup failed: ${pErr.message}` };
    if ((products || []).some((p) => Number(p.capacity_units || 0) > 0)) {
      hasCapacityItem = true;
    }
  }
  if (!hasCapacityItem && bundleIds.length > 0) {
    const { data: bundles, error: bErr } = await serviceClient
      .from("bundles")
      .select("id, capacity_units")
      .in("id", bundleIds);
    if (bErr) return { ready: false, reason: `Bundle lookup failed: ${bErr.message}` };
    if ((bundles || []).some((b) => Number(b.capacity_units || 0) > 0)) {
      hasCapacityItem = true;
    }
  }
  if (!hasCapacityItem) {
    return { ready: false, reason: "At least one enabled menu item must consume capacity units" };
  }

  // ---- commercials_valid ----
  if (drop.fundraising_enabled === true) {
    const model = drop.fundraising_model;
    if (typeof model !== "string" || !VALID_FUNDRAISING_MODELS.has(model)) {
      return { ready: false, reason: "Fundraising model is required when fundraising is enabled" };
    }
    if (model === "percentage" && !(isFiniteNumber(drop.fundraising_percentage) && drop.fundraising_percentage > 0)) {
      return { ready: false, reason: "Fundraising percentage must be greater than zero" };
    }
    if (model === "per_order" && !(isFiniteNumber(drop.fundraising_per_order_pence) && drop.fundraising_per_order_pence > 0)) {
      return { ready: false, reason: "Fundraising per-order amount must be greater than zero" };
    }
    if (typeof drop.fundraising_display_text !== "string" || !drop.fundraising_display_text) {
      return { ready: false, reason: "Fundraising display text is required when fundraising is enabled" };
    }
  }

  if (drop.host_share_enabled === true) {
    const model = drop.host_share_model;
    if (typeof model !== "string" || !VALID_HOST_SHARE_MODELS.has(model)) {
      return { ready: false, reason: "Host share model is required when host share is enabled" };
    }
    if (model === "percentage" && !(isFiniteNumber(drop.host_share_percentage) && drop.host_share_percentage > 0)) {
      return { ready: false, reason: "Host share percentage must be greater than zero" };
    }
    if (model === "per_order" && !(isFiniteNumber(drop.host_share_per_order_pence) && drop.host_share_per_order_pence > 0)) {
      return { ready: false, reason: "Host share per-order amount must be greater than zero" };
    }
    if (model === "fixed" && !(isFiniteNumber(drop.host_share_fixed_pence) && drop.host_share_fixed_pence > 0)) {
      return { ready: false, reason: "Host share fixed amount must be greater than zero" };
    }
  }

  return { ready: true };
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

    let body: { vendor_id?: string; drop_id?: string; target_status?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { vendor_id, drop_id, target_status } = body;
    if (!vendor_id) return jsonResponse({ error: "vendor_id is required" }, 400);
    if (!drop_id) return jsonResponse({ error: "drop_id is required" }, 400);
    if (!target_status || !VALID_TARGET_STATUSES.has(target_status)) {
      return jsonResponse({ error: "target_status must be one of live, cancelled, archived" }, 400);
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Vendor ownership check.
    const { data: vendor, error: ownershipError } = await serviceClient
      .from("vendors")
      .select("id, stripe_onboarding_complete")
      .eq("id", vendor_id)
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (ownershipError) return jsonResponse({ error: "Ownership check failed" }, 500);
    if (!vendor) return jsonResponse({ error: "Vendor not found or not owned by user" }, 403);

    // Drop ownership check.
    const { data: drop, error: dropErr } = await serviceClient
      .from("drops")
      .select("*")
      .eq("id", drop_id)
      .eq("vendor_id", vendor_id)
      .maybeSingle();
    if (dropErr) return jsonResponse({ error: "Drop lookup failed" }, 500);
    if (!drop) return jsonResponse({ error: "Drop not found" }, 404);

    const sourceStatus = (drop as Drop).status || "draft";
    const update: Record<string, unknown> = { status: target_status };

    if (target_status === "live") {
      if (sourceStatus !== "draft") {
        return jsonResponse({ error: `Cannot publish from status '${sourceStatus}'` }, 400);
      }
      if (!vendor.stripe_onboarding_complete) {
        return jsonResponse({ error: "Stripe onboarding must be complete before publishing" }, 400);
      }
      const readiness = await evaluateLiveReadiness(serviceClient, drop as Drop);
      if (!readiness.ready) {
        return jsonResponse({ error: readiness.reason }, 400);
      }
      update.published_at = new Date().toISOString();
    } else if (target_status === "cancelled") {
      if (sourceStatus !== "live") {
        return jsonResponse({ error: `Cannot cancel from status '${sourceStatus}'` }, 400);
      }
      // No cancelled_at column — closed_at is the lifecycle timestamp.
      update.closed_at = new Date().toISOString();
    } else if (target_status === "archived") {
      if (!ARCHIVE_SOURCE_STATUSES.has(sourceStatus)) {
        return jsonResponse({ error: `Cannot archive from status '${sourceStatus}'` }, 400);
      }
      update.archived_at = new Date().toISOString();
    }

    // Service-role write, double-filtered on id + vendor_id.
    const { data, error } = await serviceClient
      .from("drops")
      .update(update)
      .eq("id", drop_id)
      .eq("vendor_id", vendor_id)
      .select()
      .maybeSingle();

    if (error) return jsonResponse({ error: error.message }, 400);
    if (!data) return jsonResponse({ error: "Drop not found on write" }, 404);

    return jsonResponse(data, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
