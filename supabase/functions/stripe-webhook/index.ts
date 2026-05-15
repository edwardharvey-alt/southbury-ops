import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

// Stripe webhook receiver. Verifies the signing secret, then transitions
// the matching order based on the event type.
//
// verify_jwt = false. Stripe sends no JWT — signature is the auth.
// No CORS — Stripe is the only caller.
//
// Subscribe in Stripe Dashboard:
//   checkout.session.completed
//   checkout.session.expired
//   checkout.session.async_payment_failed

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeSecret || !webhookSecret) {
    console.error("Stripe secrets not configured");
    return new Response("Stripe not configured", { status: 500 });
  }

  const stripe = new Stripe(stripeSecret, {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing stripe-signature", { status: 400 });

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider()
    );
  } catch (err) {
    console.error("stripe webhook signature verification failed", err);
    return new Response("Invalid signature", { status: 400 });
  }

  // Only three event types are interesting; everything else is acknowledged.
  const handled = new Set([
    "checkout.session.completed",
    "checkout.session.expired",
    "checkout.session.async_payment_failed",
  ]);
  if (!handled.has(event.type)) {
    return new Response(JSON.stringify({ received: true, ignored: event.type }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const sessionId = session.id;

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Look up the order by stripe_session_id. Idempotent: if the order
  // is already in the target state, return 200 without re-writing.
  const { data: order, error: orderErr } = await serviceClient
    .from("orders")
    .select("id, drop_id, status")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();

  if (orderErr) {
    console.error("order lookup failed for session", sessionId, orderErr);
    return new Response("Order lookup failed", { status: 500 });
  }
  if (!order) {
    // Unknown session — could be a stale or out-of-band test event.
    // Acknowledge so Stripe stops retrying.
    return new Response(JSON.stringify({ received: true, unknown_session: sessionId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    if (event.type === "checkout.session.completed") {
      if (order.status === "placed") {
        return new Response(JSON.stringify({ received: true, idempotent: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      const { error: updateErr } = await serviceClient
        .from("orders")
        .update({ status: "placed", stripe_payment_status: "paid" })
        .eq("id", order.id);
      if (updateErr) {
        console.error("order placed update failed", updateErr);
        return new Response("Order update failed", { status: 500 });
      }
      const { error: eventErr } = await serviceClient.from("order_status_events").insert({
        order_id: order.id,
        drop_id: order.drop_id,
        from_status: "pending_payment",
        to_status: "placed",
        event_type: "status_change",
        actor: "stripe-webhook",
        actor_type: "system",
      });
      if (eventErr) {
        console.error("order_status_events insert (placed) failed", eventErr);
      }

      // Fire-and-forget order_confirmed email. Failures NEVER propagate
      // to Stripe — a 5xx here would cause webhook retries that would
      // each attempt to re-place the order (idempotency above) and spam
      // duplicate emails on partial recovery. Try/catch + log instead.
      try {
        const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        if (!internalSecret || !supabaseUrl) {
          console.error(
            JSON.stringify({
              event: "order_confirmation_failed",
              order_id: order.id,
              error: "Missing INTERNAL_FUNCTION_SECRET or SUPABASE_URL",
            })
          );
        } else {
          const emailResp = await fetch(`${supabaseUrl}/functions/v1/send-order-confirmation`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Internal-Secret": internalSecret,
            },
            body: JSON.stringify({ order_id: order.id }),
          });
          if (!emailResp.ok) {
            const errBody = await emailResp.text().catch(() => "");
            console.error(
              JSON.stringify({
                event: "order_confirmation_failed",
                order_id: order.id,
                status: emailResp.status,
                error: errBody,
              })
            );
          }
        }
      } catch (emailErr) {
        console.error(
          JSON.stringify({
            event: "order_confirmation_failed",
            order_id: order.id,
            error: (emailErr as Error).message || "unknown",
          })
        );
      }
    } else if (
      event.type === "checkout.session.expired" ||
      event.type === "checkout.session.async_payment_failed"
    ) {
      // Only act if the order is still pending payment. Anything else
      // means a different lifecycle event has already moved it on.
      if (order.status !== "pending_payment") {
        return new Response(JSON.stringify({ received: true, idempotent: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      const stripePaymentStatus = event.type === "checkout.session.expired" ? "expired" : "failed";
      const { error: updateErr } = await serviceClient
        .from("orders")
        .update({ status: "cancelled", stripe_payment_status: stripePaymentStatus })
        .eq("id", order.id);
      if (updateErr) {
        console.error("order cancelled update failed", updateErr);
        return new Response("Order update failed", { status: 500 });
      }
      const { error: eventErr } = await serviceClient.from("order_status_events").insert({
        order_id: order.id,
        drop_id: order.drop_id,
        from_status: "pending_payment",
        to_status: "cancelled",
        event_type: "status_change",
        actor: "stripe-webhook",
        actor_type: "system",
      });
      if (eventErr) {
        console.error("order_status_events insert (cancelled) failed", eventErr);
      }
    }
  } catch (err) {
    console.error("stripe-webhook handler error", err);
    return new Response("Handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
