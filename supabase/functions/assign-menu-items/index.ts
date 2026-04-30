import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// PR 4b — assign-menu-items.
//
// Bulk-replace (or clone-from-source-drop) for drop_menu_items. Subsumes
// saveAssignments + the assignment portion of duplicateDrop / series
// sibling generation / createEventWindow on drop-manager.html.
//
// Request body (audit Section 2.1):
//   { vendor_id, drop_id, items[] }                  // bulk-replace mode
//   { vendor_id, drop_id, clone_from_drop_id }       // clone mode
// items[] and clone_from_drop_id are mutually exclusive.
//
// Per-item shape (audit Section 2.2):
//   { item_type, menu_item_type, product_id, bundle_id, is_available,
//     price_override_pence, stock_limit, sort_order }
//
// Both item_type and menu_item_type are written for now (T5-B5 dual-
// field redundancy preserved until the schema cleanup lands).
//
// The reconcile happens inside the assign_drop_menu_items RPC under one
// transaction. See PR-4B-AUDIT.md Section 5.2 for the safety property
// the RPC's SQL header enumerates — order_items decouples from
// drop_menu_items, so bulk-replace is non-destructive to order history.

const VALID_ITEM_TYPES = new Set(["product", "bundle"]);

type RawItem = Record<string, unknown>;

type NormalisedItem = {
  item_type: "product" | "bundle";
  menu_item_type: "product" | "bundle";
  product_id: string | null;
  bundle_id: string | null;
  is_available: boolean;
  price_override_pence: number | null;
  stock_limit: number | null;
  sort_order: number | null;
};

function isFiniteInt(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value);
}

function isUuid(value: unknown): value is string {
  // Cheap shape check — the database does the authoritative validation.
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
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

    let body: {
      vendor_id?: string;
      drop_id?: string;
      items?: unknown;
      clone_from_drop_id?: string;
    };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { vendor_id, drop_id, items, clone_from_drop_id } = body;
    if (!vendor_id) return jsonResponse({ error: "vendor_id is required" }, 400);
    if (!drop_id) return jsonResponse({ error: "drop_id is required" }, 400);

    const hasItems = items !== undefined;
    const hasClone = clone_from_drop_id !== undefined && clone_from_drop_id !== null;
    if (hasItems && hasClone) {
      return jsonResponse(
        { error: "Provide either items or clone_from_drop_id, not both" },
        400
      );
    }
    if (!hasItems && !hasClone) {
      return jsonResponse(
        { error: "items array or clone_from_drop_id is required" },
        400
      );
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Vendor ownership.
    const { data: vendor, error: ownershipError } = await serviceClient
      .from("vendors")
      .select("id")
      .eq("id", vendor_id)
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (ownershipError) return jsonResponse({ error: "Ownership check failed" }, 500);
    if (!vendor) return jsonResponse({ error: "Vendor not found or not owned by user" }, 403);

    // Target drop ownership.
    const { data: targetDrop, error: dropErr } = await serviceClient
      .from("drops")
      .select("id")
      .eq("id", drop_id)
      .eq("vendor_id", vendor_id)
      .maybeSingle();
    if (dropErr) return jsonResponse({ error: "Drop lookup failed" }, 500);
    if (!targetDrop) {
      return jsonResponse({ error: "drop_id does not belong to this vendor" }, 400);
    }

    // ---- Hydrate items[] from clone_from_drop_id, if applicable ----
    let normalised: NormalisedItem[];

    if (hasClone) {
      if (typeof clone_from_drop_id !== "string" || !isUuid(clone_from_drop_id)) {
        return jsonResponse({ error: "clone_from_drop_id must be a uuid" }, 400);
      }
      // Source drop ownership — same vendor.
      const { data: sourceDrop, error: sourceErr } = await serviceClient
        .from("drops")
        .select("id")
        .eq("id", clone_from_drop_id)
        .eq("vendor_id", vendor_id)
        .maybeSingle();
      if (sourceErr) return jsonResponse({ error: "Source drop lookup failed" }, 500);
      if (!sourceDrop) {
        return jsonResponse(
          { error: "clone_from_drop_id does not belong to this vendor" },
          400
        );
      }

      const { data: sourceRows, error: sourceFetchErr } = await serviceClient
        .from("drop_menu_items")
        .select(
          "item_type, menu_item_type, product_id, bundle_id, is_available, price_override_pence, stock_limit, sort_order"
        )
        .eq("drop_id", clone_from_drop_id);
      if (sourceFetchErr) return jsonResponse({ error: "Source assignments fetch failed" }, 500);

      normalised = (sourceRows || []).map((row) => ({
        item_type: row.item_type as "product" | "bundle",
        menu_item_type: row.menu_item_type as "product" | "bundle",
        product_id: row.product_id ?? null,
        bundle_id: row.bundle_id ?? null,
        is_available: row.is_available !== false,
        price_override_pence: row.price_override_pence ?? null,
        stock_limit: row.stock_limit ?? null,
        sort_order: row.sort_order ?? null,
      }));
    } else {
      // ---- Bulk-replace mode — validate items[] in place ----
      if (!Array.isArray(items)) {
        return jsonResponse({ error: "items must be an array" }, 400);
      }

      const rawItems = items as RawItem[];
      const collected: NormalisedItem[] = [];
      for (let i = 0; i < rawItems.length; i++) {
        const raw = rawItems[i];
        if (!raw || typeof raw !== "object") {
          return jsonResponse({ error: `Invalid item (item ${i})` }, 400);
        }

        const itemType = raw.item_type;
        if (!itemType) {
          return jsonResponse({ error: `item_type is required (item ${i})` }, 400);
        }
        if (typeof itemType !== "string" || !VALID_ITEM_TYPES.has(itemType)) {
          return jsonResponse({ error: `Invalid item_type (item ${i})` }, 400);
        }

        const menuItemType = raw.menu_item_type;
        if (menuItemType !== itemType) {
          return jsonResponse(
            { error: `item_type and menu_item_type must match (item ${i})` },
            400
          );
        }

        const productId = raw.product_id ?? null;
        const bundleId = raw.bundle_id ?? null;
        if (itemType === "product") {
          if (!productId) {
            return jsonResponse(
              { error: `product item missing product_id (item ${i})` },
              400
            );
          }
          if (!isUuid(productId)) {
            return jsonResponse({ error: `product_id must be a uuid (item ${i})` }, 400);
          }
          if (bundleId !== null) {
            return jsonResponse(
              { error: `product item must have null bundle_id (item ${i})` },
              400
            );
          }
        } else {
          if (!bundleId) {
            return jsonResponse(
              { error: `bundle item missing bundle_id (item ${i})` },
              400
            );
          }
          if (!isUuid(bundleId)) {
            return jsonResponse({ error: `bundle_id must be a uuid (item ${i})` }, 400);
          }
          if (productId !== null) {
            return jsonResponse(
              { error: `bundle item must have null product_id (item ${i})` },
              400
            );
          }
        }

        const priceOverride = raw.price_override_pence ?? null;
        if (priceOverride !== null) {
          if (!isFiniteInt(priceOverride) || priceOverride < 0) {
            return jsonResponse(
              { error: "price_override_pence must be a non-negative integer" },
              400
            );
          }
        }

        const stockLimit = raw.stock_limit ?? null;
        if (stockLimit !== null) {
          if (!isFiniteInt(stockLimit) || stockLimit < 0) {
            return jsonResponse(
              { error: "stock_limit must be a non-negative integer" },
              400
            );
          }
        }

        const sortOrder = raw.sort_order ?? null;
        if (sortOrder !== null && !isFiniteInt(sortOrder)) {
          return jsonResponse({ error: "sort_order must be an integer" }, 400);
        }

        const isAvailable = raw.is_available;
        const isAvailableBool = isAvailable === undefined ? true : Boolean(isAvailable);

        collected.push({
          item_type: itemType as "product" | "bundle",
          menu_item_type: itemType as "product" | "bundle",
          product_id: productId,
          bundle_id: bundleId,
          is_available: isAvailableBool,
          price_override_pence: priceOverride,
          stock_limit: stockLimit,
          sort_order: sortOrder,
        });
      }
      normalised = collected;
    }

    // ---- Per-item product/bundle ownership (defence-in-depth on
    //      clone-mode too — see audit Section 2.6 hydration step 2).
    const productIds = Array.from(
      new Set(
        normalised
          .filter((item) => item.item_type === "product" && item.product_id)
          .map((item) => item.product_id!)
      )
    );
    const bundleIds = Array.from(
      new Set(
        normalised
          .filter((item) => item.item_type === "bundle" && item.bundle_id)
          .map((item) => item.bundle_id!)
      )
    );

    if (productIds.length > 0) {
      const { data: ownedProducts, error: pErr } = await serviceClient
        .from("products")
        .select("id")
        .eq("vendor_id", vendor_id)
        .in("id", productIds);
      if (pErr) return jsonResponse({ error: "Product ownership check failed" }, 500);
      if ((ownedProducts || []).length !== productIds.length) {
        return jsonResponse(
          { error: "One or more product_ids do not belong to this vendor" },
          400
        );
      }
    }

    if (bundleIds.length > 0) {
      const { data: ownedBundles, error: bErr } = await serviceClient
        .from("bundles")
        .select("id")
        .eq("vendor_id", vendor_id)
        .in("id", bundleIds);
      if (bErr) return jsonResponse({ error: "Bundle ownership check failed" }, 500);
      if ((ownedBundles || []).length !== bundleIds.length) {
        return jsonResponse(
          { error: "One or more bundle_ids do not belong to this vendor" },
          400
        );
      }
    }

    // ---- Atomic reconcile via RPC ----
    // Pre-count for the informational summary.
    const { count: beforeCount, error: beforeErr } = await serviceClient
      .from("drop_menu_items")
      .select("id", { count: "exact", head: true })
      .eq("drop_id", drop_id);
    if (beforeErr) return jsonResponse({ error: "Pre-count failed" }, 500);

    const { data: rpcRows, error: rpcErr } = await serviceClient.rpc(
      "assign_drop_menu_items",
      {
        p_drop_id: drop_id,
        p_items: normalised,
      }
    );
    if (rpcErr) return jsonResponse({ error: rpcErr.message }, 400);

    const resultRows = rpcRows ?? [];
    const insertedOrUpdated = normalised.length;
    const deleted = Math.max(0, (beforeCount ?? 0) - resultRows.length);

    return jsonResponse(
      {
        drop_id,
        items: resultRows,
        summary: {
          inserted_or_updated: insertedOrUpdated,
          deleted,
        },
      },
      200
    );
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
