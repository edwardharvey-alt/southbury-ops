import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Anonymous Service Board status transition entry point. Replaces the
// direct PostgREST UPDATE in service-board.html's commitPending(),
// which silently failed in production because the orders RLS policies
// require auth.uid() to match vendors.auth_user_id and the Service
// Board has no vendor session today (T-ops-rls-fix).
//
// verify_jwt = false. Auth posture mirrors create-order: no JWT check,
// server-side validation is the only thing we trust. T5-A will add
// in-function auth.getUser() later without architectural rework.

const STATUS_ORDER = ["placed", "confirmed", "baking", "ready", "delivered"] as const;
type OperatorStatus = (typeof STATUS_ORDER)[number];
const VALID_TO_STATUSES = new Set<string>(STATUS_ORDER);

function isUuid(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
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
    let body: { order_id?: unknown; to_status?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const orderId = body.order_id;
    const toStatus = body.to_status;

    if (!isUuid(orderId)) {
      return jsonResponse({ error: "order_id must be a uuid" }, 400);
    }
    if (typeof toStatus !== "string" || !VALID_TO_STATUSES.has(toStatus)) {
      return jsonResponse(
        { error: "to_status must be one of placed | confirmed | baking | ready | delivered" },
        400
      );
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: order, error: lookupErr } = await serviceClient
      .from("orders")
      .select("id, drop_id, status")
      .eq("id", orderId)
      .maybeSingle();

    if (lookupErr) {
      console.error("order lookup failed", lookupErr);
      return jsonResponse({ error: "Order lookup failed" }, 500);
    }
    if (!order) return jsonResponse({ error: "Order not found" }, 404);

    const currentStatus = String(order.status);

    if (currentStatus === "pending_payment" || currentStatus === "cancelled") {
      return jsonResponse({ error: "Order is not in the operator workflow" }, 400);
    }
    if (!VALID_TO_STATUSES.has(currentStatus)) {
      return jsonResponse({ error: "Order status cannot be transitioned" }, 400);
    }
    if (toStatus === currentStatus) {
      return jsonResponse({ error: "No-op transition" }, 400);
    }

    const fromIdx = STATUS_ORDER.indexOf(currentStatus as OperatorStatus);
    const toIdx = STATUS_ORDER.indexOf(toStatus as OperatorStatus);
    if (Math.abs(fromIdx - toIdx) !== 1) {
      return jsonResponse(
        { error: `Invalid transition from ${currentStatus} to ${toStatus}` },
        400
      );
    }

    // Optimistic-concurrency guard: the .eq("status", currentStatus)
    // filter ensures double-clicks and concurrent-operator races affect
    // zero rows on the loser, surfacing as a clear 409 instead of a
    // silent overwrite.
    const { data: updated, error: updateErr } = await serviceClient
      .from("orders")
      .update({ status: toStatus })
      .eq("id", orderId)
      .eq("status", currentStatus)
      .select("id")
      .maybeSingle();

    if (updateErr) {
      console.error("order update failed", updateErr);
      return jsonResponse({ error: updateErr.message }, 500);
    }
    if (!updated) {
      return jsonResponse(
        { error: "Order status changed concurrently — refresh and try again" },
        409
      );
    }

    const { error: eventErr } = await serviceClient
      .from("order_status_events")
      .insert({
        order_id: orderId,
        drop_id: order.drop_id,
        from_status: currentStatus,
        to_status: toStatus,
        event_type: "status_change",
        actor: "service_board",
        actor_type: "operator",
      });

    if (eventErr) {
      // Orders row is already updated. Audit trail has the gap; the
      // user-visible status is correct. Better than rolling back the
      // status change.
      console.error("order_status_events insert failed", eventErr);
      return jsonResponse({ error: "Audit event write failed" }, 500);
    }

    return jsonResponse(
      {
        ok: true,
        order_id: orderId,
        from_status: currentStatus,
        to_status: toStatus,
      },
      200
    );
  } catch (err) {
    console.error("transition-order-status unexpected error", err);
    return jsonResponse({ error: (err as Error).message || "Internal error" }, 500);
  }
});
