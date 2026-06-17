import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Anonymous customer demand-capture entry point (T5-8 + T-notify-next-time).
// A customer who lands on a drop that is not yet open (kind='interest') or
// that is sold out / closed (kind='waitlist') leaves their details so the
// vendor can let them know. Writes a customers row (deduped on lower(email),
// best-effort backfill of empty fields) and an idempotent
// customer_relationships row scoped to this drop.
//
// verify_jwt = false. Customer flow has no authenticated user; the only
// thing authorised is "this public drop exists", checked server-side. The
// vendor is derived from the drop row — never accepted from the client.

type Kind = "interest" | "waitlist";

type Payload = {
  drop_id: string;
  kind: Kind;
  name: string;
  email: string;
  phone: string;
  postcode: string | null;
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

    // 1. Drop must exist. Derive vendor_id server-side from the drop row —
    //    never trust a client-supplied vendor_id.
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
    const vendorId = drop.vendor_id as string;

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

    // 3. Idempotent relationship insert. A row scoped to this exact
    //    (customer, vendor, source, drop) is the dedupe key — a customer can
    //    legitimately hold an 'order' relationship AND an 'interest'/'waitlist'
    //    one for the same drop, so source + source_drop_id are part of the key.
    const { data: existingRel, error: relLookupErr } = await serviceClient
      .from("customer_relationships")
      .select("id")
      .eq("customer_id", customerId)
      .eq("owner_id", vendorId)
      .eq("source", payload.kind)
      .eq("source_drop_id", payload.drop_id)
      .maybeSingle();

    if (relLookupErr) {
      console.error("relationship lookup failed", relLookupErr);
      return jsonResponse({ error: "Relationship lookup failed" }, 500);
    }

    if (existingRel) {
      return jsonResponse({ ok: true, already_registered: true }, 200);
    }

    const { error: relErr } = await serviceClient
      .from("customer_relationships")
      .insert({
        customer_id: customerId,
        owner_type: "vendor",
        owner_id: vendorId,
        consent_status: "granted",
        source: payload.kind,
        source_drop_id: payload.drop_id,
        lawful_basis: "explicit_consent",
        created_at: new Date().toISOString(),
      });

    if (relErr) {
      console.error("relationship insert failed", relErr);
      return jsonResponse({ error: "Relationship write failed" }, 500);
    }

    return jsonResponse({ ok: true, already_registered: false }, 200);
  } catch (err) {
    console.error("register-interest unhandled error", err);
    return jsonResponse({ error: "Unexpected error" }, 500);
  }
});
