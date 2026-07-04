import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Product options (modifiers) — STAGE 2 write path. Saves the option
// groups + their options for ONE product. Modelled on save-bundle-line:
// same in-function auth, vendor-ownership check, parent-belongs-to-vendor
// tenancy belt, and delete-and-reinsert with rollback for child rows.
//
// This stores DEFINITIONS only. No money is charged here and nothing
// customer-facing reads it yet — the order page and checkout are later
// stages. The server sets every foreign key (product_id on groups,
// group_id on options); the client's `id?` fields are advisory and are
// NOT trusted (delete-and-reinsert regenerates ids), matching how
// save-bundle-line never preserves child ids.
//
// Save shape:
//   1. Validate the ENTIRE payload first, before any write. A malformed
//      payload therefore never destroys the product's existing groups.
//   2. Delete existing groups for the product (options cascade via the
//      product_options.group_id ON DELETE CASCADE FK).
//   3. Reinsert each group then its options.
//   4. On any reinsert failure, delete the groups created in THIS call
//      (cascade removes their options) and return the error.
//
// Input:
// {
//   vendor_id, product_id,
//   groups: [{
//     id?, name, min_select, max_select, is_required, sort_order, is_active,
//     options: [{ id?, name, price_delta_pence, sort_order, is_active }]
//   }]
// }
// An empty groups array is valid and means "clear all option groups".

type OptionInput = {
  name?: unknown;
  price_delta_pence?: unknown;
  sort_order?: unknown;
  is_active?: unknown;
};

type GroupInput = {
  name?: unknown;
  min_select?: unknown;
  max_select?: unknown;
  is_required?: unknown;
  sort_order?: unknown;
  is_active?: unknown;
  options?: unknown;
};

type ValidatedOption = {
  name: string;
  price_delta_pence: number;
  sort_order: number;
  is_active: boolean;
};

type ValidatedGroup = {
  name: string;
  min_select: number;
  max_select: number;
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
  options: ValidatedOption[];
};

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

// Validate + normalise the payload into clean rows. Returns an error string
// on the first problem (identifying which group/option), or the clean list.
function validateGroups(
  groups: unknown
): { ok: true; data: ValidatedGroup[] } | { ok: false; reason: string } {
  if (!Array.isArray(groups)) {
    return { ok: false, reason: "groups must be an array" };
  }

  const out: ValidatedGroup[] = [];

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi] as GroupInput;
    if (!g || typeof g !== "object") {
      return { ok: false, reason: `Choice group ${gi + 1} is malformed` };
    }

    const name = typeof g.name === "string" ? g.name.trim() : "";
    if (!name) {
      return { ok: false, reason: `Choice group ${gi + 1} needs a name` };
    }

    // v1: every group is "pick exactly one, required". The UI sends fixed
    // 1 / 1 / true; validate defensively without hard-coding so later
    // stages can widen the UI without a function change.
    const min_select = isInt(g.min_select) ? g.min_select : 1;
    const max_select = isInt(g.max_select) ? g.max_select : 1;
    if (min_select < 0) {
      return { ok: false, reason: `"${name}" has an invalid minimum` };
    }
    if (max_select < 1) {
      return { ok: false, reason: `"${name}" has an invalid maximum` };
    }
    if (max_select < min_select) {
      return { ok: false, reason: `"${name}" maximum is below its minimum` };
    }
    const is_required = typeof g.is_required === "boolean" ? g.is_required : true;
    const g_sort = isInt(g.sort_order) ? g.sort_order : (gi + 1) * 10;
    const g_active = typeof g.is_active === "boolean" ? g.is_active : true;

    if (!Array.isArray(g.options) || g.options.length === 0) {
      return { ok: false, reason: `"${name}" needs at least one option` };
    }

    const options: ValidatedOption[] = [];
    for (let oi = 0; oi < g.options.length; oi++) {
      const o = g.options[oi] as OptionInput;
      if (!o || typeof o !== "object") {
        return { ok: false, reason: `An option in "${name}" is malformed` };
      }
      const oname = typeof o.name === "string" ? o.name.trim() : "";
      if (!oname) {
        return { ok: false, reason: `Every option in "${name}" needs a name` };
      }
      // Price delta: integer pence, zero or positive. The client never sets
      // a charged amount — this is a definition. (Negative deltas / discounts
      // are out of scope for v1.)
      if (!isInt(o.price_delta_pence) || (o.price_delta_pence as number) < 0) {
        return {
          ok: false,
          reason: `"${oname}" in "${name}" needs a price of £0 or more`,
        };
      }
      options.push({
        name: oname,
        price_delta_pence: o.price_delta_pence as number,
        sort_order: isInt(o.sort_order) ? o.sort_order : (oi + 1) * 10,
        is_active: typeof o.is_active === "boolean" ? o.is_active : true,
      });
    }

    out.push({
      name,
      min_select,
      max_select,
      is_required,
      sort_order: g_sort,
      is_active: g_active,
      options,
    });
  }

  return { ok: true, data: out };
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

    let body: { vendor_id?: string; product_id?: string; groups?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { vendor_id, product_id, groups } = body;
    if (!vendor_id) return jsonResponse({ error: "vendor_id is required" }, 400);
    if (!product_id) return jsonResponse({ error: "product_id is required" }, 400);

    // Validate BEFORE any write so a malformed payload can never destroy the
    // product's existing option groups.
    const validated = validateGroups(groups);
    if (!validated.ok) return jsonResponse({ error: validated.reason }, 400);

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Vendor ownership: caller owns the vendor.
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

    // Tenancy belt: the parent product belongs to the resolved vendor.
    const { data: parentProduct, error: productLookupError } = await serviceClient
      .from("products")
      .select("id, vendor_id")
      .eq("id", product_id)
      .maybeSingle();

    if (productLookupError) return jsonResponse({ error: productLookupError.message }, 400);
    if (!parentProduct) return jsonResponse({ error: "Product not found" }, 404);
    if (parentProduct.vendor_id !== vendor.id) {
      return jsonResponse({ error: "Product not owned by vendor" }, 403);
    }

    // Delete-and-reinsert. Wipe the product's existing groups (options
    // cascade), then reinsert from the validated payload.
    const { error: deleteError } = await serviceClient
      .from("product_option_groups")
      .delete()
      .eq("product_id", product_id);
    if (deleteError) return jsonResponse({ error: deleteError.message }, 400);

    const insertedGroupIds: string[] = [];
    const savedGroups: Array<Record<string, unknown>> = [];

    // Roll back everything created in THIS call on any failure.
    const rollback = async () => {
      if (!insertedGroupIds.length) return;
      try {
        await serviceClient
          .from("product_option_groups")
          .delete()
          .in("id", insertedGroupIds);
      } catch (rollbackErr) {
        console.error("save-product-options rollback failed:", rollbackErr);
      }
    };

    for (const g of validated.data) {
      // Server sets product_id — never trusts the body for the parent FK.
      const { data: groupRow, error: groupErr } = await serviceClient
        .from("product_option_groups")
        .insert({
          product_id,
          name: g.name,
          min_select: g.min_select,
          max_select: g.max_select,
          is_required: g.is_required,
          sort_order: g.sort_order,
          is_active: g.is_active,
        })
        .select("*")
        .single();

      if (groupErr || !groupRow) {
        await rollback();
        return jsonResponse({ error: groupErr?.message || "Choice group write failed" }, 400);
      }
      insertedGroupIds.push(groupRow.id as string);

      let savedOptions: Array<Record<string, unknown>> = [];
      if (g.options.length) {
        const optionRows = g.options.map((o) => ({
          group_id: groupRow.id, // server-set parent FK
          name: o.name,
          price_delta_pence: o.price_delta_pence,
          sort_order: o.sort_order,
          is_active: o.is_active,
        }));
        const { data: optData, error: optErr } = await serviceClient
          .from("product_options")
          .insert(optionRows)
          .select("*");
        if (optErr) {
          await rollback();
          return jsonResponse({ error: optErr.message }, 400);
        }
        savedOptions = optData || [];
      }

      savedGroups.push({ ...groupRow, options: savedOptions });
    }

    return jsonResponse({ product_id, groups: savedGroups }, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
