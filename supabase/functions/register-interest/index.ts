import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Anonymous customer demand-capture entry point (T5-8 + T-notify-next-time).
// A customer who lands on a drop that is not yet open (kind='interest') or
// that is sold out / closed (kind='waitlist') leaves their details so the
// vendor can let them know. Writes a customers row (deduped on lower(email),
// best-effort backfill of empty fields) and an idempotent drop_signals row
// scoped to this (drop, customer, kind).
//
// verify_jwt = false. Customer flow has no authenticated user; the only
// thing authorised is "this public drop exists", checked server-side. The
// vendor is derived from the drop row — never accepted from the client.

type Kind = "interest" | "waitlist";

// Hand-mirrored from create-order's CAPTURE_SURFACES — KEEP IN SYNC with it
// (Deno EFs cannot share imports). `followup`/`reactivation` are reserved
// literals with no stamper yet (email surfaces unbuilt); listed so no future
// whitelist change is needed when those ship.
const CAPTURE_SURFACES = [
  "vendor_page",
  "drop_qr",
  "host_poster",
  "activation_poster",
  "followup",
  "reactivation",
];

// Whitelist-match, or NULL — never rejecting. Identical to create-order's
// normaliseCaptureSurface: `src` is a machine-supplied hint from the arrival
// URL, not part of the customer's submission, so an unknown/absent/misprinted
// value must NEVER fail a registration — it is dropped to NULL and the
// interest records anyway. Log the unrecognised value so a mis-stamped link
// is diagnosable.
function normaliseCaptureSurface(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const compact = v.trim().toLowerCase();
  if (!compact) return null;
  if (CAPTURE_SURFACES.includes(compact)) return compact;
  console.log(
    JSON.stringify({
      event: "capture_surface_unrecognised",
      value: compact.slice(0, 64),
    })
  );
  return null;
}

type Payload = {
  drop_id: string;
  kind: Kind;
  name: string;
  email: string;
  phone: string;
  postcode: string | null;
  capture_surface: string | null;
};

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// Basic email shape — mirrors the client-side check in order.html. Not a
// full RFC validator; just enough to reject obvious nonsense before a write.
function isEmailShape(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function validatePayload(body: unknown): { ok: true; data: Payload } | { ok: false; reason: string } {
  if (!body || typeof body !== "object") return { ok: false, reason: "Body must be a JSON object" };
  const b = body as Record<string, unknown>;

  if (!isUuid(b.drop_id)) return { ok: false, reason: "drop_id must be a valid UUID" };
  if (b.kind !== "interest" && b.kind !== "waitlist") {
    return { ok: false, reason: "kind must be exactly 'interest' or 'waitlist'" };
  }
  if (!nonEmptyString(b.name)) return { ok: false, reason: "name is required" };
  if (!nonEmptyString(b.phone)) return { ok: false, reason: "phone is required" };
  if (!isEmailShape(b.email)) return { ok: false, reason: "a valid email is required" };

  // postcode optional — accept a non-empty string, otherwise null.
  const postcode = nonEmptyString(b.postcode) ? (b.postcode as string).trim() : null;

  return {
    ok: true,
    data: {
      drop_id: b.drop_id,
      kind: b.kind,
      name: (b.name as string).trim(),
      email: (b.email as string).trim().toLowerCase(),
      phone: (b.phone as string).trim(),
      postcode,
      // `src` is optional and NEVER a validation failure — interest arriving
      // without a known surface is valid and common (a bare link, a shared
      // URL, word of mouth). Absent or unrecognised both normalise to null.
      capture_surface: normaliseCaptureSurface(b.src),
    },
  };
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
    const payload = parsed.data;

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Drop must exist. (vendor_id is selected only to reject orphan drops;
    //    no client-supplied vendor_id is ever trusted.)
    const { data: drop, error: dropErr } = await serviceClient
      .from("drops")
      .select("id, vendor_id")
      .eq("id", payload.drop_id)
      .maybeSingle();

    if (dropErr) {
      console.error("drop lookup failed", dropErr);
      return jsonResponse({ error: "Drop lookup failed" }, 500);
    }
    if (!drop || !drop.vendor_id) return jsonResponse({ error: "Drop not found" }, 404);

    // 2. Dedupe customer on lower(email). All write paths store email
    //    lowercased (create-order upsert, bulk-create-customers), so an
    //    equality match on the lowercased input is the effective lower(email)
    //    key. Reuse the existing row + best-effort backfill of empty fields;
    //    otherwise insert a new customers row.
    const { data: existingCustomer, error: custLookupErr } = await serviceClient
      .from("customers")
      .select("id, name, phone, postcode")
      .eq("email", payload.email)
      .maybeSingle();

    if (custLookupErr) {
      console.error("customer lookup failed", custLookupErr);
      return jsonResponse({ error: "Customer lookup failed" }, 500);
    }

    let customerId: string;
    if (existingCustomer) {
      customerId = existingCustomer.id as string;

      // Best-effort backfill: only fill fields that are currently empty.
      // Mirrors bulk-create-customers — failures are logged, never fatal.
      const backfill: Record<string, unknown> = {};
      if (!nonEmptyString(existingCustomer.name) && payload.name) backfill.name = payload.name;
      if (!nonEmptyString(existingCustomer.phone) && payload.phone) backfill.phone = payload.phone;
      if (!nonEmptyString(existingCustomer.postcode) && payload.postcode) backfill.postcode = payload.postcode;
      if (Object.keys(backfill).length > 0) {
        const { error: backfillErr } = await serviceClient
          .from("customers")
          .update(backfill)
          .eq("id", customerId);
        if (backfillErr) console.error("customer backfill failed", { customerId, backfillErr });
      }
    } else {
      const { data: inserted, error: insertErr } = await serviceClient
        .from("customers")
        .insert({
          name: payload.name,
          email: payload.email,
          phone: payload.phone,
          postcode: payload.postcode,
        })
        .select("id")
        .single();
      if (insertErr || !inserted) {
        console.error("customer insert failed", insertErr);
        return jsonResponse({ error: "Customer record write failed" }, 500);
      }
      customerId = inserted.id as string;
    }

    // 3. Idempotent demand-signal insert. The (drop_id, customer_id, kind)
    //    triple is the dedupe key — a customer can legitimately hold an
    //    'interest' AND a 'waitlist' signal for the same drop, so kind is
    //    part of the key. ON CONFLICT DO NOTHING via ignoreDuplicates; the
    //    .select() returns the inserted row on a real insert and nothing on
    //    a conflict, which is how we distinguish first-time vs already-on-list.
    const { data: signalRows, error: signalErr } = await serviceClient
      .from("drop_signals")
      .upsert(
        {
          drop_id: payload.drop_id,
          customer_id: customerId,
          kind: payload.kind,
          // Ticket 4 core — the surface this registration arrived through.
          // capture_placement is explicitly null: placement ("counter",
          // "table", "flyer") describes a physical artefact and belongs only
          // to the vendor-page follow path (register-vendor-interest). An
          // order-page registration has a surface but no placement object.
          // capture_state is deliberately untouched.
          capture_surface: payload.capture_surface,
          capture_placement: null,
        },
        { onConflict: "drop_id,customer_id,kind", ignoreDuplicates: true }
      )
      .select("id");

    if (signalErr) {
      console.error("signal insert failed", signalErr);
      return jsonResponse({ error: "Signal write failed" }, 500);
    }

    const alreadyRegistered = !signalRows || signalRows.length === 0;
    return jsonResponse({ ok: true, already_registered: alreadyRegistered }, 200);
  } catch (err) {
    console.error("register-interest unhandled error", err);
    return jsonResponse({ error: "Unexpected error" }, 500);
  }
});
