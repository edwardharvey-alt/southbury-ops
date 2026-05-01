import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { getCorsHeaders } from "../_shared/cors.ts";

// Anonymous customer order entry point. Replaces the direct PostgREST
// inserts in order.html's persistOrder(). Validates the basket against
// the live drop, writes orders / order_items / order_item_selections /
// order_status_events as a sequence with cleanup on failure, then
// creates a Stripe Checkout session and returns its URL.
//
// verify_jwt = false. Customer flow has no authenticated user; payload
// shape is the only thing we trust.

const ORDERABLE_STATUSES = new Set(["live", "scheduled"]);

type BasketSelection = {
  bundle_line_id: string;
  selected_product_id: string;
  quantity: number;
  drives_capacity?: boolean;
};

type BasketItem = {
  type: "product" | "bundle";
  product_id: string | null;
  bundle_id: string | null;
  name: string;
  unit_price_pence: number;
  quantity: number;
  capacity_units: number;
  selections?: BasketSelection[];
};

type Payload = {
  drop_id: string;
  customer: {
    name: string;
    phone: string;
    email: string | null;
    postcode: string;
    notes: string | null;
    contact_opt_in: boolean;
    contact_opt_in_scope: "both" | null;
  };
  fulfilment: {
    mode: "delivery" | "collection";
    address: string | null;
    table_number: string | null;
    table_notes: string | null;
  };
  totals: {
    subtotal_pence: number;
    delivery_pence: number;
    total_pence: number;
    capacity_units: number;
  };
  basket: BasketItem[];
};

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function validatePayload(body: unknown): { ok: true; data: Payload } | { ok: false; reason: string } {
  if (!body || typeof body !== "object") return { ok: false, reason: "Body must be a JSON object" };
  const b = body as Record<string, unknown>;

  if (!isUuid(b.drop_id)) return { ok: false, reason: "drop_id must be a uuid" };

  const c = b.customer as Record<string, unknown> | undefined;
  if (!c || typeof c !== "object") return { ok: false, reason: "customer is required" };
  if (typeof c.name !== "string" || !c.name.trim()) return { ok: false, reason: "customer.name is required" };
  if (typeof c.phone !== "string" || !c.phone.trim()) return { ok: false, reason: "customer.phone is required" };
  if (typeof c.postcode !== "string" || !c.postcode.trim()) return { ok: false, reason: "customer.postcode is required" };
  if (c.email !== null && typeof c.email !== "string") return { ok: false, reason: "customer.email must be string or null" };
  if (c.notes !== null && typeof c.notes !== "string") return { ok: false, reason: "customer.notes must be string or null" };
  if (typeof c.contact_opt_in !== "boolean") return { ok: false, reason: "customer.contact_opt_in must be boolean" };
  if (c.contact_opt_in_scope !== null && c.contact_opt_in_scope !== "both") {
    return { ok: false, reason: "customer.contact_opt_in_scope must be 'both' or null" };
  }

  const f = b.fulfilment as Record<string, unknown> | undefined;
  if (!f || typeof f !== "object") return { ok: false, reason: "fulfilment is required" };
  if (f.mode !== "delivery" && f.mode !== "collection") {
    return { ok: false, reason: "fulfilment.mode must be 'delivery' or 'collection'" };
  }
  if (f.address !== null && typeof f.address !== "string") return { ok: false, reason: "fulfilment.address must be string or null" };
  if (f.table_number !== null && typeof f.table_number !== "string") return { ok: false, reason: "fulfilment.table_number must be string or null" };
  if (f.table_notes !== null && typeof f.table_notes !== "string") return { ok: false, reason: "fulfilment.table_notes must be string or null" };

  const t = b.totals as Record<string, unknown> | undefined;
  if (!t || typeof t !== "object") return { ok: false, reason: "totals is required" };
  if (!isFiniteNumber(t.subtotal_pence) || t.subtotal_pence < 0) return { ok: false, reason: "totals.subtotal_pence must be a non-negative number" };
  if (!isFiniteNumber(t.delivery_pence) || t.delivery_pence < 0) return { ok: false, reason: "totals.delivery_pence must be a non-negative number" };
  if (!isFiniteNumber(t.total_pence) || t.total_pence < 0) return { ok: false, reason: "totals.total_pence must be a non-negative number" };
  if (!isFiniteNumber(t.capacity_units) || t.capacity_units < 0) return { ok: false, reason: "totals.capacity_units must be a non-negative number" };

  if (!Array.isArray(b.basket) || b.basket.length === 0) return { ok: false, reason: "basket must be a non-empty array" };
  for (let i = 0; i < b.basket.length; i++) {
    const item = b.basket[i] as Record<string, unknown>;
    if (item.type !== "product" && item.type !== "bundle") {
      return { ok: false, reason: `basket[${i}].type must be 'product' or 'bundle'` };
    }
    if (item.type === "product" && !isUuid(item.product_id)) {
      return { ok: false, reason: `basket[${i}].product_id must be a uuid for product items` };
    }
    if (item.type === "bundle" && !isUuid(item.bundle_id)) {
      return { ok: false, reason: `basket[${i}].bundle_id must be a uuid for bundle items` };
    }
    if (typeof item.name !== "string" || !item.name) return { ok: false, reason: `basket[${i}].name is required` };
    if (!isFiniteNumber(item.unit_price_pence) || item.unit_price_pence < 0) {
      return { ok: false, reason: `basket[${i}].unit_price_pence must be a non-negative number` };
    }
    if (!isFiniteNumber(item.quantity) || item.quantity < 1 || !Number.isInteger(item.quantity)) {
      return { ok: false, reason: `basket[${i}].quantity must be a positive integer` };
    }
    if (!isFiniteNumber(item.capacity_units) || item.capacity_units < 0) {
      return { ok: false, reason: `basket[${i}].capacity_units must be a non-negative number` };
    }
    if (item.selections !== undefined && !Array.isArray(item.selections)) {
      return { ok: false, reason: `basket[${i}].selections must be an array if present` };
    }
    for (const s of (item.selections as BasketSelection[] | undefined) || []) {
      if (!isUuid(s.bundle_line_id)) return { ok: false, reason: `basket[${i}] selection bundle_line_id must be a uuid` };
      if (!isUuid(s.selected_product_id)) return { ok: false, reason: `basket[${i}] selection selected_product_id must be a uuid` };
      if (!isFiniteNumber(s.quantity) || s.quantity < 1 || !Number.isInteger(s.quantity)) {
        return { ok: false, reason: `basket[${i}] selection quantity must be a positive integer` };
      }
    }
  }

  return { ok: true, data: body as Payload };
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
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    // Step 1 — schema validation.
    const parsed = validatePayload(raw);
    if (!parsed.ok) return jsonResponse({ error: parsed.reason }, 400);
    const payload = parsed.data;

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Step 2 — drop exists, status orderable. Use v_drop_summary so
    // closed-by-time gets caught regardless of raw drops.status.
    const { data: dropSummary, error: dropErr } = await serviceClient
      .from("v_drop_summary")
      .select("drop_id, vendor_id, slug, status, opens_at, closes_at, capacity_units_total, capacity_units_remaining")
      .eq("drop_id", payload.drop_id)
      .maybeSingle();

    if (dropErr) return jsonResponse({ error: "Drop lookup failed" }, 500);
    if (!dropSummary) return jsonResponse({ error: "Drop not found" }, 404);

    if (!ORDERABLE_STATUSES.has(String(dropSummary.status))) {
      return jsonResponse({ error: "This drop is not currently open for orders" }, 400);
    }

    // Step 3 — within ordering window.
    const now = Date.now();
    const opensAt = dropSummary.opens_at ? Date.parse(dropSummary.opens_at) : null;
    const closesAt = dropSummary.closes_at ? Date.parse(dropSummary.closes_at) : null;
    if (opensAt !== null && now < opensAt) {
      return jsonResponse({ error: "This drop has not opened yet" }, 400);
    }
    if (closesAt !== null && now > closesAt) {
      return jsonResponse({ error: "Ordering for this drop has closed" }, 400);
    }

    const vendorId = String(dropSummary.vendor_id);

    // Step 4 — vendor Stripe-ready. Defence in depth even though the
    // publish gate already prevents going live without this.
    const { data: vendor, error: vendorErr } = await serviceClient
      .from("vendors")
      .select("id, stripe_account_id, stripe_onboarding_complete, platform_fee_pct")
      .eq("id", vendorId)
      .maybeSingle();
    if (vendorErr) return jsonResponse({ error: "Vendor lookup failed" }, 500);
    if (!vendor) return jsonResponse({ error: "Vendor not found" }, 404);
    if (!vendor.stripe_account_id || vendor.stripe_onboarding_complete !== true) {
      return jsonResponse({ error: "This vendor is not yet set up to accept payment" }, 400);
    }

    // Step 5 — every product / bundle in the basket belongs to this vendor.
    const productIds = payload.basket
      .filter((i) => i.type === "product")
      .map((i) => i.product_id as string);
    const bundleIds = payload.basket
      .filter((i) => i.type === "bundle")
      .map((i) => i.bundle_id as string);

    if (productIds.length > 0) {
      const { data: products, error: prodErr } = await serviceClient
        .from("products")
        .select("id, vendor_id")
        .in("id", productIds);
      if (prodErr) return jsonResponse({ error: "Product lookup failed" }, 500);
      const found = new Set((products || []).map((p) => p.id));
      for (const id of productIds) {
        if (!found.has(id)) return jsonResponse({ error: "Basket contains an unknown product" }, 400);
      }
      if ((products || []).some((p) => p.vendor_id !== vendorId)) {
        return jsonResponse({ error: "Basket contains a product that does not belong to this vendor" }, 400);
      }
    }

    if (bundleIds.length > 0) {
      const { data: bundles, error: bunErr } = await serviceClient
        .from("bundles")
        .select("id, vendor_id")
        .in("id", bundleIds);
      if (bunErr) return jsonResponse({ error: "Bundle lookup failed" }, 500);
      const found = new Set((bundles || []).map((b) => b.id));
      for (const id of bundleIds) {
        if (!found.has(id)) return jsonResponse({ error: "Basket contains an unknown bundle" }, 400);
      }
      if ((bundles || []).some((b) => b.vendor_id !== vendorId)) {
        return jsonResponse({ error: "Basket contains a bundle that does not belong to this vendor" }, 400);
      }
    }

    // Step 6 — bundle selections reference valid choice products for the right bundle.
    for (const item of payload.basket) {
      if (item.type !== "bundle" || !item.selections || item.selections.length === 0) continue;

      const bundleLineIds = Array.from(new Set(item.selections.map((s) => s.bundle_line_id)));
      const { data: lines, error: linesErr } = await serviceClient
        .from("bundle_lines")
        .select("id, bundle_id")
        .in("id", bundleLineIds);
      if (linesErr) return jsonResponse({ error: "Bundle line lookup failed" }, 500);
      if ((lines || []).length !== bundleLineIds.length) {
        return jsonResponse({ error: "Bundle selection references an unknown line" }, 400);
      }
      if ((lines || []).some((l) => l.bundle_id !== item.bundle_id)) {
        return jsonResponse({ error: "Bundle selection references a line from a different bundle" }, 400);
      }

      const { data: choices, error: choicesErr } = await serviceClient
        .from("bundle_line_choice_products")
        .select("bundle_line_id, product_id")
        .in("bundle_line_id", bundleLineIds);
      if (choicesErr) return jsonResponse({ error: "Bundle choice lookup failed" }, 500);
      const validChoices = new Set(
        (choices || []).map((c) => `${c.bundle_line_id}:${c.product_id}`)
      );
      for (const s of item.selections) {
        if (!validChoices.has(`${s.bundle_line_id}:${s.selected_product_id}`)) {
          return jsonResponse({ error: "Bundle selection references an invalid product choice" }, 400);
        }
      }
    }

    // Step 7 — totals match basket. Guards against client-side tampering.
    const computedTotal = payload.basket.reduce(
      (sum, item) => sum + item.unit_price_pence * item.quantity,
      0
    );
    if (computedTotal !== payload.totals.total_pence) {
      return jsonResponse(
        { error: "Total does not match basket — please refresh and try again" },
        400
      );
    }

    // Step 8 — capacity available.
    const remaining = Number(dropSummary.capacity_units_remaining ?? 0);
    if (payload.totals.capacity_units > remaining) {
      return jsonResponse(
        { error: "Not enough capacity remaining for this order — please refresh and try again" },
        400
      );
    }

    // Stripe SDK init (verify secret present before any DB writes so we
    // fail fast — no orphan orders if Stripe is misconfigured).
    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecret) return jsonResponse({ error: "Stripe not configured" }, 500);
    const stripe = new Stripe(stripeSecret, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const platformFeePct = Number(vendor.platform_fee_pct ?? 0);
    const platformFeePence = Math.floor((payload.totals.total_pence * platformFeePct) / 100);
    const capacityUnitsConsumed = Math.max(1, payload.totals.capacity_units);

    // Database writes — sequence with cleanup. No transactions over
    // PostgREST, so on any failure after the orders row is created we
    // mark it cancelled with a status event noting the cause; the
    // customer retries to get a fresh order.

    // A. Customer upsert (only when email present). Failure here aborts
    //    the function — no order is created.
    let customerId: string | null = null;
    if (payload.customer.email) {
      const { data: customerRow, error: custErr } = await serviceClient
        .from("customers")
        .upsert(
          {
            name: payload.customer.name,
            email: payload.customer.email,
            phone: payload.customer.phone,
            postcode: payload.customer.postcode,
          },
          { onConflict: "email", ignoreDuplicates: false }
        )
        .select("id")
        .single();
      if (custErr || !customerRow) {
        console.error("customer upsert failed", custErr);
        return jsonResponse({ error: "Customer record write failed" }, 500);
      }
      customerId = customerRow.id;

      const { error: relErr } = await serviceClient
        .from("customer_relationships")
        .upsert(
          {
            customer_id: customerId,
            owner_id: vendorId,
            owner_type: "vendor",
            consent_status: payload.customer.contact_opt_in ? "granted" : "pending",
            source: "order",
          },
          { onConflict: "customer_id,owner_id", ignoreDuplicates: false }
        );
      if (relErr) {
        console.error("customer relationship upsert failed", relErr);
        return jsonResponse({ error: "Customer relationship write failed" }, 500);
      }
    }

    // B. Insert orders row.
    const orderInsert: Record<string, unknown> = {
      drop_id: payload.drop_id,
      customer_name: payload.customer.name,
      customer_phone: payload.customer.phone,
      customer_email: payload.customer.email,
      customer_notes: payload.customer.notes,
      customer_postcode: payload.customer.postcode,
      customer_id: customerId,
      fulfilment_mode: payload.fulfilment.mode,
      delivery_address: payload.fulfilment.address,
      contact_opt_in: payload.customer.contact_opt_in,
      contact_opt_in_scope: payload.customer.contact_opt_in_scope,
      total_pence: payload.totals.total_pence,
      status: "pending_payment",
      stripe_payment_status: "pending",
      platform_fee_pence: platformFeePence,
      // Legacy NOT NULL >= 1 column (see SCHEMA.md). Populate with
      // capacity units consumed, minimum 1, until formally migrated away.
      pizzas: capacityUnitsConsumed,
    };

    const { data: orderRow, error: orderErr } = await serviceClient
      .from("orders")
      .insert(orderInsert)
      .select("id")
      .single();
    if (orderErr || !orderRow) {
      console.error("order insert failed", orderErr);
      return jsonResponse({ error: "Order write failed" }, 500);
    }
    const orderId = orderRow.id as string;

    // markCancelled — best-effort cleanup if a downstream step fails.
    // Customer sees the error and can retry; retry creates a fresh order.
    const markCancelled = async (note: string) => {
      try {
        await serviceClient
          .from("orders")
          .update({ status: "cancelled", stripe_payment_status: "failed" })
          .eq("id", orderId);
        await serviceClient.from("order_status_events").insert({
          order_id: orderId,
          drop_id: payload.drop_id,
          from_status: "pending_payment",
          to_status: "cancelled",
          event_type: "status_change",
          actor: `create-order:${note}`,
          actor_type: "system",
        });
      } catch (cleanupErr) {
        console.error("cleanup after order failure failed", cleanupErr);
      }
    };

    // C. Insert order_items. Capture each id for D.
    const insertedItemIds: { id: string; selections: BasketSelection[] }[] = [];
    for (const item of payload.basket) {
      const { data: itemRow, error: itemErr } = await serviceClient
        .from("order_items")
        .insert({
          order_id: orderId,
          item_type: item.type,
          product_id: item.type === "product" ? item.product_id : null,
          bundle_id: item.type === "bundle" ? item.bundle_id : null,
          item_name_snapshot: item.name,
          qty: item.quantity,
          price_pence: item.unit_price_pence,
          capacity_units_snapshot: item.capacity_units,
        })
        .select("id")
        .single();
      if (itemErr || !itemRow) {
        console.error("order_items insert failed", itemErr);
        await markCancelled("order_items_insert_failed");
        return jsonResponse({ error: "Order item write failed" }, 500);
      }
      insertedItemIds.push({ id: itemRow.id as string, selections: item.selections || [] });
    }

    // D. Insert order_item_selections for bundle items.
    for (const { id: orderItemId, selections } of insertedItemIds) {
      if (!selections.length) continue;
      const { error: selErr } = await serviceClient
        .from("order_item_selections")
        .insert(
          selections.map((s) => ({
            order_item_id: orderItemId,
            bundle_line_id: s.bundle_line_id,
            selected_product_id: s.selected_product_id,
            quantity: s.quantity,
          }))
        );
      if (selErr) {
        console.error("order_item_selections insert failed", selErr);
        await markCancelled("order_item_selections_insert_failed");
        return jsonResponse({ error: "Order selection write failed" }, 500);
      }
    }

    // E. Insert order_status_events row recording the initial state.
    const { error: eventErr } = await serviceClient.from("order_status_events").insert({
      order_id: orderId,
      drop_id: payload.drop_id,
      from_status: null,
      to_status: "pending_payment",
      event_type: "status_change",
      actor: "create-order",
      actor_type: "system",
    });
    if (eventErr) {
      console.error("order_status_events insert failed", eventErr);
      await markCancelled("status_event_insert_failed");
      return jsonResponse({ error: "Order status event write failed" }, 500);
    }

    // Stripe Checkout session.
    const dropSlug = String(dropSummary.slug || "");
    const successUrl =
      `https://lovehearth.co.uk/order-confirmation.html?order_id=${encodeURIComponent(orderId)}` +
      `&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl =
      `https://lovehearth.co.uk/order.html?drop=${encodeURIComponent(dropSlug)}` +
      `&checkout_cancelled=1&order_id=${encodeURIComponent(orderId)}`;

    let session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        // Stripe's documented minimum for expires_at is 1800 seconds
        // (30 minutes) from Checkout Session creation. Below 1800 the
        // API rejects with an invalid_request_error.
        expires_at: Math.floor(Date.now() / 1000) + 1800,
        customer_email: payload.customer.email || undefined,
        billing_address_collection: "auto",
        line_items: payload.basket.map((item) => ({
          price_data: {
            currency: "gbp",
            product_data: { name: item.name },
            unit_amount: item.unit_price_pence,
          },
          quantity: item.quantity,
        })),
        payment_intent_data: {
          application_fee_amount: platformFeePence,
          transfer_data: { destination: vendor.stripe_account_id! },
          metadata: {
            order_id: orderId,
            drop_id: payload.drop_id,
            vendor_id: vendorId,
          },
        },
        metadata: {
          order_id: orderId,
          drop_id: payload.drop_id,
          vendor_id: vendorId,
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
    } catch (stripeErr) {
      console.error("stripe checkout session create failed", stripeErr);
      await markCancelled("stripe_session_create_failed");
      return jsonResponse({ error: "Could not start payment — please try again" }, 502);
    }

    // Final write — stamp the order with the session id so the webhook
    // can find it later. If this fails, the session is live but
    // unrecoverable — mark the order cancelled and ask the customer to retry.
    const { error: stampErr } = await serviceClient
      .from("orders")
      .update({ stripe_session_id: session.id })
      .eq("id", orderId);
    if (stampErr) {
      console.error("orders.stripe_session_id stamp failed", stampErr);
      await markCancelled("session_id_stamp_failed");
      return jsonResponse({ error: "Could not link order to payment — please try again" }, 500);
    }

    return jsonResponse({ order_id: orderId, checkout_url: session.url }, 200);
  } catch (err) {
    console.error("create-order unexpected error", err);
    return jsonResponse({ error: (err as Error).message || "Internal error" }, 500);
  }
});
