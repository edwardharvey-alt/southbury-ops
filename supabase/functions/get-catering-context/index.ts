import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// get-catering-context — authenticated operator read (Catering Phase 3-pre).
//
// Given a drop id, returns the structured catering-enquiry context for that
// drop — the single named client the drop was converted for — so Drop Studio
// can show "who this drop is for" without duplicating contact fields onto the
// drops table and without parsing notes_internal.
//
// Resolution is the existing back-link: catering_enquiries.converted_drop_id =
// drop.id (set by convert-catering-enquiry on success). Each conversion inserts
// a fresh drop and links exactly one enquiry to it, so the match is one-to-one
// in practice — read with .maybeSingle(). The read is scoped by BOTH
// converted_drop_id AND the caller's own vendor_id, so a vendor can only ever
// read the enquiry for their OWN drop; another vendor's drop id returns no row.
//
// Mirrors list-catering-enquiries' auth/vendor-resolution exactly: verify the
// caller via auth.getUser(), resolve vendor_id from vendors.auth_user_id, then
// read with a service-role client (which legitimately bypasses
// catering_enquiries' deny-by-default RLS — the table has no policies, so an
// Edge Function is its only read path).
//
// Null-safe: contact_email is nullable (a client may have given a phone only —
// the table constraint requires email OR phone), and a drop with no linked
// enquiry (any normal drop) is a clean { enquiry: null } result, never an error.
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

    let body: { drop_id?: string };
    try {
      body = await req.json();
    } catch (_) {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }
    const dropId = body.drop_id;
    if (!dropId) return jsonResponse({ error: "drop_id is required" }, 400);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dropId)) {
      return jsonResponse({ error: "drop_id must be a UUID" }, 400);
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: vendor, error: vendorError } = await serviceClient
      .from("vendors")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (vendorError) {
      return jsonResponse({ error: "Vendor lookup failed" }, 500);
    }
    if (!vendor) {
      return jsonResponse({ error: "Vendor not found or not owned by user" }, 403);
    }

    // Resolve the enquiry for THIS drop, scoped to the caller's vendor. The
    // dual filter (converted_drop_id + vendor_id) is the ownership boundary:
    // another vendor's drop id simply matches no row for this vendor.
    const { data: enquiry, error: enquiryError } = await serviceClient
      .from("catering_enquiries")
      .select(
        "contact_name, contact_email, contact_phone, event_type, event_date, guest_count, fulfilment, brief"
      )
      .eq("converted_drop_id", dropId)
      .eq("vendor_id", vendor.id)
      .maybeSingle();

    if (enquiryError) {
      console.error("catering_enquiries context lookup failed", enquiryError);
      return jsonResponse({ error: "Enquiry lookup failed" }, 500);
    }

    // No linked enquiry (any non-catering drop) is a clean, normal result.
    return jsonResponse({ enquiry: enquiry ?? null }, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
