import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// T-CAP-7 — anonymous "follow the vendor" entry point (the write path for the
// permanent vendor page's resting state). A person who lands on a vendor page
// when NO drop is live leaves their details + an explicit consent tick so the
// vendor can tell them what's next. Vendor-scoped, not drop-scoped: the signal
// is written with drop_id NULL (vendor_id set), so it can never contaminate a
// drop-scoped interest/waitlist count (those reads all qualify on drop_id).
//
// verify_jwt = false. Customer flow has no authenticated user; the only thing
// authorised is "this public vendor exists", checked server-side. All three
// writes happen inside register_vendor_interest_atomic (one transaction) — this
// function does no data work of its own beyond resolving the vendor.

type Payload = {
  vendor_id: string;
  name: string;
  email: string;
  phone: string | null;
  postcode: string | null;
  consent: boolean;
};

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// Basic email shape — mirrors register-interest / the client-side check in
// order.html. Not a full RFC validator; just enough to reject obvious nonsense.
function isEmailShape(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

// Postcode: the UK outward code ONLY (e.g. BH18, SW1A, M1). Uppercased and
// stripped of spaces on save; a full postcode is rejected (not truncated) and
// anything else unrecognised. This is the ENFORCEMENT point — the matching
// client-side check in vendor.html exists only for immediate feedback and is
// never trusted (operational learning #95: the client is never the boundary).
// Deliberately NOT mirrored into register_vendor_interest_atomic, which still
// treats postcode as optional — accepted asymmetry, tracked post-launch as
// T-follow-validation-rpc-parity.
function normaliseOutwardPostcode(
  v: unknown
): { ok: true; value: string } | { ok: false; reason: string } {
  if (!nonEmptyString(v)) {
    return { ok: false, reason: "the first part of your postcode is required" };
  }
  const compact = (v as string).trim().toUpperCase().replace(/\s+/g, "");
  const outward = /^[A-Z]{1,2}[0-9]{1,2}[A-Z]?$/;
  const full = /^[A-Z]{1,2}[0-9]{1,2}[A-Z]?[0-9][A-Z]{2}$/;
  if (full.test(compact)) {
    return { ok: false, reason: "Just the first part is enough — e.g. BH18" };
  }
  if (!outward.test(compact)) {
    return { ok: false, reason: "That doesn’t look like a UK postcode." };
  }
  return { ok: true, value: compact };
}

type ParsedBody = {
  vendor_id?: string;
  vendor_slug?: string;
  name: string;
  email: string;
  phone: string | null;
  postcode: string;
  consent: boolean;
};

function validateBody(body: unknown): { ok: true; data: ParsedBody } | { ok: false; reason: string } {
  if (!body || typeof body !== "object") return { ok: false, reason: "Body must be a JSON object" };
  const b = body as Record<string, unknown>;

  // Vendor may arrive as vendor_id (uuid), vendor_slug (string), or a generic
  // vendor field (auto-detected). At least one must be present.
  let vendor_id: string | undefined;
  let vendor_slug: string | undefined;
  if (isUuid(b.vendor_id)) vendor_id = b.vendor_id as string;
  else if (nonEmptyString(b.vendor_slug)) vendor_slug = (b.vendor_slug as string).trim();
  else if (isUuid(b.vendor)) vendor_id = b.vendor as string;
  else if (nonEmptyString(b.vendor)) vendor_slug = (b.vendor as string).trim();
  if (!vendor_id && !vendor_slug) return { ok: false, reason: "vendor_id or vendor_slug is required" };

  if (!nonEmptyString(b.name)) return { ok: false, reason: "name is required" };
  if (!isEmailShape(b.email)) return { ok: false, reason: "a valid email is required" };
  if (b.consent !== true) return { ok: false, reason: "consent is required to follow a vendor" };

  const postcodeResult = normaliseOutwardPostcode(b.postcode);
  if (!postcodeResult.ok) return { ok: false, reason: postcodeResult.reason };

  const phone = nonEmptyString(b.phone) ? (b.phone as string).trim() : null;

  return {
    ok: true,
    data: {
      vendor_id,
      vendor_slug,
      name: (b.name as string).trim(),
      email: (b.email as string).trim().toLowerCase(),
      phone,
      postcode: postcodeResult.value,
      consent: true,
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

    const parsed = validateBody(raw);
    if (!parsed.ok) return jsonResponse({ error: parsed.reason }, 400);
    const body = parsed.data;

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Resolve the vendor to its canonical id. A slug is resolved via the
    //    vendors table (mirrors the .eq("slug", ...) lookup used elsewhere);
    //    an id is confirmed to exist. The vendor is never trusted blindly —
    //    an unknown vendor is a clean 404, not an opaque DB error later.
    let vendorId: string;
    if (body.vendor_id) {
      const { data: vendor, error: vendorErr } = await serviceClient
        .from("vendors")
        .select("id")
        .eq("id", body.vendor_id)
        .maybeSingle();
      if (vendorErr) {
        console.error("vendor lookup (id) failed", vendorErr);
        return jsonResponse({ error: "Vendor lookup failed" }, 500);
      }
      if (!vendor) return jsonResponse({ error: "Vendor not found" }, 404);
      vendorId = vendor.id as string;
    } else {
      const { data: vendor, error: vendorErr } = await serviceClient
        .from("vendors")
        .select("id")
        .eq("slug", body.vendor_slug!)
        .maybeSingle();
      if (vendorErr) {
        console.error("vendor lookup (slug) failed", vendorErr);
        return jsonResponse({ error: "Vendor lookup failed" }, 500);
      }
      if (!vendor) return jsonResponse({ error: "Vendor not found" }, 404);
      vendorId = vendor.id as string;
    }

    // 2. All data work happens atomically inside the RPC — one call, one
    //    transaction. Returns one row: { out_customer_id, newly_following }.
    //    The id field is out_customer_id, not customer_id: a RETURNS TABLE
    //    column named customer_id would collide with the customer_id column
    //    referenced inside the function body. Keep this read in step with the
    //    output name in the migration.
    const { data: rpcData, error: rpcErr } = await serviceClient.rpc(
      "register_vendor_interest_atomic",
      {
        p_vendor_id: vendorId,
        p_name: body.name,
        p_email: body.email,
        p_postcode: body.postcode,
        p_phone: body.phone,
        p_consent: body.consent,
      }
    );

    if (rpcErr) {
      // The RPC's own guards (empty email / consent not true) raise
      // check_violation; the EF already validates those, so this is a
      // belt-and-braces 400. Anything else is a genuine 500.
      console.error("register_vendor_interest_atomic failed", rpcErr);
      if (rpcErr.code === "23514") {
        return jsonResponse({ error: "email and an explicit consent tick are required" }, 400);
      }
      return jsonResponse({ error: "Follow could not be recorded" }, 500);
    }

    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!row || !row.out_customer_id) {
      console.error("register_vendor_interest_atomic returned no row", rpcData);
      return jsonResponse({ error: "Follow could not be recorded" }, 500);
    }

    // newly_following = a fresh follow signal was inserted this call; false
    // means the person was already following this vendor (idempotent no-op).
    return jsonResponse(
      { ok: true, following: true, already_following: row.newly_following === false },
      200
    );
  } catch (err) {
    console.error("register-vendor-interest unhandled error", err);
    return jsonResponse({ error: "Unexpected error" }, 500);
  }
});
