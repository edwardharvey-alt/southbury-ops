import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { getCorsHeaders } from "../_shared/cors.ts";

// reconcile-pending-orders
// ========================
// Promotes or cancels stale `pending_payment` orders by asking Stripe for
// the truth, instead of waiting on a webhook that may never arrive. This is
// the backstop for a dropped/late `checkout.session.completed` (paid order
// stuck pending → customer charged but no confirmation) or a dropped
// `checkout.session.expired` (abandoned order stuck pending → capacity held
// forever). It exists specifically so that a paid-but-unreconciled order
// still gets its confirmation email — replicating stripe-webhook's
// `checkout.session.completed` branch in full, NOT just flipping status.
//
// Two run modes (POST):
//   - { order_id }   → on-demand: reconcile that one order only.
//   - {} / no body   → cron sweep: reconcile every pending_payment order past
//                      its hold window (bounded batch).
//
// AUTH / why this is safe without a user JWT
// ------------------------------------------
// This EF is called by (a) pg_cron internally and (b) order-confirmation.html
// as an anonymous customer page. `verify_jwt = false` at the gateway.
//
//   * Cron mode is gated by a shared secret: the caller MUST present
//     `X-Internal-Secret: <INTERNAL_RECONCILE_SECRET>`. Without it the sweep
//     is refused (403). Only pg_cron / trusted callers hold this secret, so an
//     anonymous browser cannot trigger an unbounded platform-wide sweep.
//
//   * On-demand mode needs NO secret and NO user JWT. The order is identified
//     by a single `order_id`, payment truth is verified directly against
//     Stripe, and the per-order logic ONLY ever transitions a row that is
//     still `status = 'pending_payment'` (a guard both in code and in every
//     UPDATE's WHERE clause). So the worst an anonymous caller can do is force
//     a Stripe truth-check on one order that is already pending — which is
//     exactly what we want order-confirmation.html to be able to do, and is
//     harmless: it can never touch placed/cancelled/any other order or state.
//
// Stripe pin matches create-order / stripe-webhook (code pin "2023-10-16",
// NOT the dashboard default). Service-role client for all writes. Top-level
// try/catch. CORS via getCorsHeaders.
//
// Does NOT create the cron schedule or the `orders.expires_at` column — those
// are applied by hand in SQL. Does NOT modify stripe-webhook, create-order,
// or fetch-order.

const STRIPE_API_VERSION = "2023-10-16";
// Hold window fallback when expires_at is null. Mirrors create-order's
// Stripe Checkout `expires_at` of now + 1800s (30 minutes).
const HOLD_WINDOW_MS = 30 * 60 * 1000;
// Upper bound on a single cron sweep so a run can never go unbounded.
const CRON_BATCH_LIMIT = 100;

type OrderRow = {
  id: string;
  drop_id: string | null;
  status: string;
  stripe_session_id: string | null;
  expires_at: string | null;
  created_at: string | null;
};

type ReconcileOutcome = "promoted" | "cancelled" | "skipped";

function isUuid(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

// True when the order's hold window has elapsed: expires_at < now, or
// (expires_at null) created_at + 30min < now. Used only on the cancel path.
function isPastHoldWindow(order: OrderRow, nowMs: number): boolean {
  if (order.expires_at) {
    const exp = Date.parse(order.expires_at);
    return Number.isFinite(exp) && exp < nowMs;
  }
  if (order.created_at) {
    const created = Date.parse(order.created_at);
    return Number.isFinite(created) && created + HOLD_WINDOW_MS < nowMs;
  }
  // No timing info at all — be conservative, treat as not-yet-expired.
  return false;
}

Deno.serve(async (req: Request) => {
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
    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecret) {
      console.error("STRIPE_SECRET_KEY not configured");
      return jsonResponse({ error: "Stripe not configured" }, 500);
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Supabase env not configured");
      return jsonResponse({ error: "Server not configured" }, 500);
    }

    // Parse body — tolerate empty/no body (cron mode sends {} or nothing).
    let body: Record<string, unknown> = {};
    try {
      const raw = await req.text();
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          body = parsed as Record<string, unknown>;
        }
      }
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const hasOrderId = body.order_id !== undefined && body.order_id !== null;
    const mode: "on_demand" | "cron" = hasOrderId ? "on_demand" : "cron";

    // Cron mode is privileged: require the shared secret. On-demand mode is
    // intentionally open (see header comment) and is NOT secret-gated.
    if (mode === "cron") {
      const cronSecret = Deno.env.get("INTERNAL_RECONCILE_SECRET");
      if (!cronSecret) {
        console.error("INTERNAL_RECONCILE_SECRET not configured");
        return jsonResponse({ error: "Server not configured" }, 500);
      }
      const presented = req.headers.get("x-internal-secret") || "";
      if (presented !== cronSecret) {
        return jsonResponse({ error: "not_authorised" }, 403);
      }
    }

    if (hasOrderId && !isUuid(body.order_id)) {
      return jsonResponse({ error: "order_id must be a uuid" }, 400);
    }

    const stripe = new Stripe(stripeSecret, {
      apiVersion: STRIPE_API_VERSION,
      httpClient: Stripe.createFetchHttpClient(),
    });

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    const ORDER_COLUMNS = "id, drop_id, status, stripe_session_id, expires_at, created_at";

    // ---- Per-order reconcile. Returns one of promoted/cancelled/skipped. ----
    const reconcileOne = async (order: OrderRow): Promise<ReconcileOutcome> => {
      // Step 1 — idempotency guard (mirrors webhook's early-return).
      if (order.status !== "pending_payment") return "skipped";
      if (!order.stripe_session_id) {
        console.error(
          JSON.stringify({
            event: "reconcile_skipped_no_session",
            order_id: order.id,
          })
        );
        return "skipped";
      }

      // Step 2 — ask Stripe for the truth.
      let session: Stripe.Checkout.Session;
      try {
        session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
      } catch (stripeErr) {
        console.error(
          JSON.stringify({
            event: "reconcile_stripe_retrieve_failed",
            order_id: order.id,
            error: (stripeErr as Error).message || "unknown",
          })
        );
        return "skipped";
      }

      // Step 3 — PAID: replicate stripe-webhook's checkout.session.completed
      // branch exactly (side effects A, B, C from
      // audit/findings-reconcile-prep.md).
      if (session.payment_status === "paid") {
        // A. Promote, race-safe: the status guard in the WHERE clause means
        //    only one writer (this or the webhook) ever wins.
        const { data: updated, error: updateErr } = await serviceClient
          .from("orders")
          .update({ status: "placed", stripe_payment_status: "paid" })
          .eq("id", order.id)
          .eq("status", "pending_payment")
          .select("id");
        if (updateErr) {
          console.error(
            JSON.stringify({
              event: "reconcile_placed_update_failed",
              order_id: order.id,
              error: updateErr.message,
            })
          );
          return "skipped";
        }
        // Lost the race (webhook already placed it). Don't double-fire B/C.
        if (!updated || updated.length === 0) return "skipped";

        // B. Audit row — non-fatal, own try/catch like the webhook.
        const { error: eventErr } = await serviceClient
          .from("order_status_events")
          .insert({
            order_id: order.id,
            drop_id: order.drop_id,
            from_status: "pending_payment",
            to_status: "placed",
            event_type: "status_change",
            actor: "reconcile",
            actor_type: "system",
          });
        if (eventErr) {
          console.error(
            JSON.stringify({
              event: "reconcile_status_event_insert_failed",
              order_id: order.id,
              error: eventErr.message,
            })
          );
        }

        // C. Fire-and-forget order_confirmed email. THIS IS THE STEP NOT TO
        //    DROP — a paid order reconciled without this email is the exact
        //    failure this function exists to prevent. Call shape copied
        //    verbatim from stripe-webhook (:138-145). Note it uses
        //    INTERNAL_FUNCTION_SECRET (what send-order-confirmation checks),
        //    NOT the cron secret. Failures never propagate.
        try {
          const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
          if (!internalSecret) {
            console.error(
              JSON.stringify({
                event: "order_confirmation_failed",
                order_id: order.id,
                error: "Missing INTERNAL_FUNCTION_SECRET",
              })
            );
          } else {
            const emailResp = await fetch(
              `${supabaseUrl}/functions/v1/send-order-confirmation`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Internal-Secret": internalSecret,
                },
                body: JSON.stringify({ order_id: order.id }),
              }
            );
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

        return "promoted";
      }

      // Step 4 — UNPAID and past the hold window: cancel. Backstop for a
      // dropped checkout.session.expired. No email.
      if (isPastHoldWindow(order, Date.now())) {
        const { data: cancelled, error: cancelErr } = await serviceClient
          .from("orders")
          .update({ status: "cancelled", stripe_payment_status: "expired" })
          .eq("id", order.id)
          .eq("status", "pending_payment")
          .select("id");
        if (cancelErr) {
          console.error(
            JSON.stringify({
              event: "reconcile_cancel_update_failed",
              order_id: order.id,
              error: cancelErr.message,
            })
          );
          return "skipped";
        }
        if (!cancelled || cancelled.length === 0) return "skipped";

        const { error: eventErr } = await serviceClient
          .from("order_status_events")
          .insert({
            order_id: order.id,
            drop_id: order.drop_id,
            from_status: "pending_payment",
            to_status: "cancelled",
            event_type: "status_change",
            actor: "reconcile",
            actor_type: "system",
            reason: "expired_unpaid",
          });
        if (eventErr) {
          console.error(
            JSON.stringify({
              event: "reconcile_status_event_insert_failed",
              order_id: order.id,
              error: eventErr.message,
            })
          );
        }

        return "cancelled";
      }

      // Step 5 — unpaid but still within window: leave pending, do nothing.
      return "skipped";
    };

    // ---------------------------- ON-DEMAND ----------------------------
    if (mode === "on_demand") {
      const orderId = body.order_id as string;
      const { data: order, error: orderErr } = await serviceClient
        .from("orders")
        .select(ORDER_COLUMNS)
        .eq("id", orderId)
        .maybeSingle();
      if (orderErr) {
        console.error("order lookup failed", orderErr);
        return jsonResponse({ error: "Order lookup failed" }, 500);
      }
      // Unknown order: 200 with skipped so an anon caller learns nothing about
      // existence beyond what they already supplied.
      if (!order) {
        return jsonResponse({ checked: 0, promoted: 0, cancelled: 0, skipped: 0 }, 200);
      }

      const outcome = await reconcileOne(order as OrderRow);
      return jsonResponse(
        {
          checked: 1,
          promoted: outcome === "promoted" ? 1 : 0,
          cancelled: outcome === "cancelled" ? 1 : 0,
          skipped: outcome === "skipped" ? 1 : 0,
          order_id: orderId,
          outcome,
        },
        200
      );
    }

    // ------------------------------- CRON ------------------------------
    // Select stale pendings: expires_at < now OR (expires_at null AND
    // created_at < now - 30min). Bounded by CRON_BATCH_LIMIT.
    const nowIso = new Date().toISOString();
    const cutoffIso = new Date(Date.now() - HOLD_WINDOW_MS).toISOString();
    const { data: orders, error: listErr } = await serviceClient
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("status", "pending_payment")
      .or(`expires_at.lt.${nowIso},and(expires_at.is.null,created_at.lt.${cutoffIso})`)
      .order("created_at", { ascending: true })
      .limit(CRON_BATCH_LIMIT);
    if (listErr) {
      console.error("pending order sweep query failed", listErr);
      return jsonResponse({ error: "Sweep query failed" }, 500);
    }

    const summary = { checked: 0, promoted: 0, cancelled: 0, skipped: 0 };
    for (const row of orders || []) {
      summary.checked += 1;
      let outcome: ReconcileOutcome;
      try {
        outcome = await reconcileOne(row as OrderRow);
      } catch (perOrderErr) {
        // One bad order must not abort the whole sweep.
        console.error(
          JSON.stringify({
            event: "reconcile_order_unexpected_error",
            order_id: (row as OrderRow).id,
            error: (perOrderErr as Error).message || "unknown",
          })
        );
        summary.skipped += 1;
        continue;
      }
      if (outcome === "promoted") summary.promoted += 1;
      else if (outcome === "cancelled") summary.cancelled += 1;
      else summary.skipped += 1;
    }

    return jsonResponse(
      { ...summary, batch_limit: CRON_BATCH_LIMIT, truncated: (orders || []).length === CRON_BATCH_LIMIT },
      200
    );
  } catch (err) {
    console.error("reconcile-pending-orders unexpected error", err);
    return jsonResponse({ error: (err as Error).message || "Internal error" }, 500);
  }
});
