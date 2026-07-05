import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// convert-catering-enquiry — authenticated operator action (Catering Phase 2C).
//
// Turns one of the vendor's OPEN catering enquiries into a DRAFT catering
// drop the vendor finishes in Drop Studio. This is the bridge between the
// Phase 1/2 enquiry spine and the existing drop lifecycle.
//
// Auth mirrors list-catering-enquiries / create-drop exactly: verify the
// caller via auth.getUser(), resolve vendor_id from vendors.auth_user_id,
// then act with a service-role client (which legitimately bypasses the
// deny-by-default RLS on catering_enquiries and drops).
//
// "Catering" is NOT its own drop type — it ships as an EVENT drop
// (drop_type="event" + expected_guests), so the drop is inserted with
// drop_type explicitly set to "event" (the drops table default is
// "neighbourhood", so this must be set, not left to the default).
//
// This function does NOT touch create-drop / update-drop. It inserts the
// draft row directly, because create-drop does no slug generation of its
// own (that lives client-side in drop-manager.html, reading in-memory
// state — not importable here) and does nothing beyond inserting one row
// into drops. See audit/findings-catering-convert.md, gates 1–3.
//
// Atomicity: the drop is inserted FIRST; only on success is the enquiry
// flipped to resolved/converted. If the insert fails, the enquiry is left
// untouched (status stays 'open') and nothing is written.

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Match drop-manager.html's slugify() exactly.
function slugify(text: string): string {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

// Short date like "26 Jul" from a plain 'YYYY-MM-DD' date string.
// Parsed by parts to avoid any timezone shift on a date-only value.
function shortDate(dateStr: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ""));
  if (!m) return null;
  const day = parseInt(m[3], 10);
  const monthIdx = parseInt(m[2], 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return null;
  return `${day} ${MONTHS_SHORT[monthIdx]}`;
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
    if (!authHeader) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    let body: { enquiry_id?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
    }

    const enquiryId = body.enquiry_id;
    if (!enquiryId) return jsonResponse({ ok: false, error: "enquiry_id is required" }, 400);

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Resolve the caller's vendor from the verified JWT. Vendor scope comes
    // ONLY from here, never from the request body.
    const { data: vendor, error: vendorError } = await serviceClient
      .from("vendors")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (vendorError) return jsonResponse({ ok: false, error: "Vendor lookup failed" }, 500);
    if (!vendor) return jsonResponse({ ok: false, error: "Vendor not found or not owned by user" }, 403);

    // Read the enquiry, scoped to this vendor. 404 if not theirs / not found.
    const { data: enquiry, error: enquiryError } = await serviceClient
      .from("catering_enquiries")
      .select(
        "id, vendor_id, status, contact_name, contact_email, contact_phone, event_date, guest_count, event_type, fulfilment, brief"
      )
      .eq("id", enquiryId)
      .eq("vendor_id", vendor.id)
      .maybeSingle();

    if (enquiryError) return jsonResponse({ ok: false, error: "Enquiry lookup failed" }, 500);
    if (!enquiry) return jsonResponse({ ok: false, error: "Enquiry not found" }, 404);
    if (enquiry.status !== "open") {
      return jsonResponse({ ok: false, error: "Enquiry is already resolved" }, 409);
    }

    // ── Compose the draft drop ──────────────────────────────────────────

    const contactName = (enquiry.contact_name || "").trim() || "catering enquiry";
    const dateLabel = enquiry.event_date ? shortDate(enquiry.event_date) : null;
    const name = dateLabel
      ? `Catering — ${contactName}, ${dateLabel}`
      : `Catering — ${contactName}`;

    // Unique slug generated server-side (create-drop does no slug work — the
    // client normally does, but that path isn't reachable here). Slugify the
    // name, then collision-check against this vendor's existing drop slugs,
    // appending -2, -3, … exactly like drop-manager.html's buildUniqueSlug.
    const baseSlug = slugify(name) || `catering-drop`;
    const { data: existingDrops, error: slugQueryError } = await serviceClient
      .from("drops")
      .select("slug")
      .eq("vendor_id", vendor.id);
    if (slugQueryError) return jsonResponse({ ok: false, error: "Slug check failed" }, 500);

    const taken = new Set(
      (existingDrops || [])
        .map((d) => slugify(d.slug || ""))
        .filter(Boolean)
    );
    let slug = baseSlug;
    if (taken.has(baseSlug)) {
      let i = 2;
      while (taken.has(`${baseSlug}-${i}`)) i += 1;
      slug = `${baseSlug}-${i}`;
    }

    // Internal note block: who the enquiry is for, plus the placeholder-time
    // reminder. The operator confirms the exact time in Drop Studio.
    const noteLines: string[] = ["From catering enquiry."];
    if (enquiry.contact_name) noteLines.push(`Contact: ${enquiry.contact_name}`);
    if (enquiry.contact_email) noteLines.push(`Email: ${enquiry.contact_email}`);
    if (enquiry.contact_phone) noteLines.push(`Phone: ${enquiry.contact_phone}`);
    if (enquiry.event_type) noteLines.push(`Event type: ${enquiry.event_type}`);
    if (enquiry.guest_count) noteLines.push(`Guests: ${enquiry.guest_count}`);
    if (enquiry.brief) noteLines.push(`Brief: ${enquiry.brief}`);
    if (enquiry.event_date) {
      noteLines.push(`Event date from enquiry: ${enquiry.event_date} — confirm exact time.`);
    }
    const notesInternal = noteLines.join("\n");

    // Build the insert. Only set what we need; the drops table defaults handle
    // the rest (status defaults to 'draft'). drop_type MUST be set to 'event'
    // (its default is 'neighbourhood').
    const insert: Record<string, unknown> = {
      vendor_id: vendor.id,
      name,
      slug,
      drop_type: "event",
      notes_internal: notesInternal,
    };
    // fulfilment maps 1:1 (collection|delivery). Only 'collection'/'delivery'
    // are ever stored on an enquiry, both valid drop fulfilment modes.
    if (enquiry.fulfilment === "collection" || enquiry.fulfilment === "delivery") {
      insert.fulfilment_mode = enquiry.fulfilment;
    }
    if (enquiry.guest_count) insert.expected_guests = enquiry.guest_count;
    if (enquiry.event_date) {
      // Draft placeholders on the enquiry's date — 12:00, +2h. The operator
      // confirms the real window before publishing.
      insert.delivery_start = `${enquiry.event_date}T12:00:00Z`;
      insert.delivery_end = `${enquiry.event_date}T14:00:00Z`;
    }

    // Insert the draft drop FIRST. Enquiry is only flipped on success.
    const { data: drop, error: dropError } = await serviceClient
      .from("drops")
      .insert(insert)
      .select("id")
      .maybeSingle();

    if (dropError) return jsonResponse({ ok: false, error: dropError.message }, 400);
    if (!drop) return jsonResponse({ ok: false, error: "Drop creation returned no row" }, 500);

    // Only now flip the enquiry. Re-assert status='open' in the WHERE clause
    // as an optimistic guard against a concurrent conversion.
    const { data: updated, error: flipError } = await serviceClient
      .from("catering_enquiries")
      .update({
        status: "resolved",
        resolution: "converted",
        converted_drop_id: drop.id,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", enquiry.id)
      .eq("vendor_id", vendor.id)
      .eq("status", "open")
      .select("id")
      .maybeSingle();

    if (flipError || !updated) {
      // The drop was created but the enquiry flip failed (e.g. a concurrent
      // conversion won the race). Surface the error; the operator's list will
      // reconcile on reload. We deliberately do not delete the drop — a draft
      // is harmless and recoverable, whereas a delete could race further.
      return jsonResponse(
        { ok: false, error: "Drop created but enquiry could not be updated. Reload and check Drop Studio." },
        500
      );
    }

    return jsonResponse({ ok: true, drop_id: drop.id }, 200);
  } catch (err) {
    return jsonResponse({ ok: false, error: (err as Error).message }, 500);
  }
});
