import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Anonymous customer-explicit cancellation. Called when Stripe redirects
// the customer back to order.html with ?checkout_cancelled=1. Frees
// capacity immediately rather than waiting for Stripe's 30-minute
// session expiry to flow through the webhook.
//
// Authorization is by matched pair: the request must provide both
// order_id and stripe_session_id, and they must point at the same
// orders row. Without the matching session_id (which only the order
// owner has via Stripe's redirect URL) the function returns a benign
// "not_found" — this prevents enumeration attacks where someone
// guesses order_ids to cancel arbitrary orders.
//
// verify_jwt = false. Customer flow has no authenticated user; the
// matched pair is the only authorization signal.
//
// Idempotent. Returns 200 in every non-error path so retries from
// flaky redirect timing don't surface as errors to the customer.

type Payload = {
  order_id: string;
  session_id: string;
};

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function validatePayload(body: unknown): { ok: true; data: Payload } | { ok: false; reason: string } {
  if (!body || typeof body !== "object") return { ok: false, reason: "Body must be a JSON object" };
  const b = body as Record<string, unknown>;
  if (!isUuid(b.order_id)) return { ok: false, reason: "order_id must be a uuid" };
  if (typeof b.session_id !== "string" || !b.session_id.trim()) {
    return { ok: false, reason: "session_id must be a non-empty string" };
  }
  return { ok: true, data: { order_id: b.order_id, session_id: b.session_id } };
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

    const parsed = validatePayload(raw);
    if (!parsed.ok) return jsonResponse({ error: parsed.reason }, 400);
    const { order_id, session_id } = parsed.data;

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Step 1 — order by matched pair. Service-role client skips RLS;
    // the matched pair on (id, stripe_session_id) is the only auth.
    const { data: order, error: orderErr } = await serviceClient
      .from("orders")
      .select("id, status")
      .eq("id", order_id)
      .eq("stripe_session_id", session_id)
      .maybeSingle();

    if (orderErr) {
      console.error("order lookup failed", orderErr);
      return jsonResponse({ error: "Order lookup failed" }, 500);
    }
    if (!order) {
      return jsonResponse({ cancelled: false, reason: "not_found" }, 200);
    }

    // Step 2 — only cancel if still pending payment. Anything else
    // (paid, already cancelled, expired, refunded) is a no-op.
    if (order.status !== "pending_payment") {
      return jsonResponse({ cancelled: false, reason: "wrong_status" }, 200);
    }

    // Step 3 — flip to cancelled.
    const { error: updateErr } = await serviceClient
      .from("orders")
      .update({ status: "cancelled", stripe_payment_status: "cancelled" })
      .eq("id", order_id);

    if (updateErr) {
      console.error("order update failed", updateErr);
      return jsonResponse({ error: "Order update failed" }, 500);
    }

    // Step 4 — audit trail.
    const { error: eventErr } = await serviceClient
      .from("order_status_events")
      .insert({
        order_id,
        from_status: "pending_payment",
        to_status: "cancelled",
        event_type: "status_change",
        actor: "cancel-order",
        actor_type: "system",
      });

    if (eventErr) {
      console.error("order_status_events insert failed", eventErr);
      // Order is already cancelled — surface the audit failure but
      // don't unwind the cancellation. Capacity has already been
      // freed by the orders update above.
      return jsonResponse({ error: "Order cancelled but audit log failed" }, 500);
    }

    return jsonResponse({ cancelled: true }, 200);
  } catch (err) {
    console.error("cancel-order unexpected error", err);
    return jsonResponse({ error: (err as Error).message || "Internal error" }, 500);
  }
});
