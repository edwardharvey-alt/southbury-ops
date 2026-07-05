import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// list-catering-enquiries — authenticated operator read (Catering Phase 2A).
//
// Returns the logged-in vendor's OPEN catering enquiries for the read-only
// "Catering enquiries" section on Home. Mirrors get-home-dashboard's
// auth/vendor-resolution exactly: verify the caller via auth.getUser(),
// resolve vendor_id from vendors.auth_user_id, then read with a service-role
// client (which legitimately bypasses catering_enquiries' deny-by-default
// RLS — the table has no policies, so this EF is its only read path).
//
// Vendor scope comes ONLY from the verified JWT, never from a client-supplied
// vendor id — another vendor's enquiries can never be returned. An empty list
// is a clean, normal result.
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

    const { data: enquiries, error: enquiriesError } = await serviceClient
      .from("catering_enquiries")
      .select(
        "id, contact_name, contact_email, contact_phone, event_date, guest_count, event_type, fulfilment, brief, created_at"
      )
      .eq("vendor_id", vendor.id)
      .eq("status", "open")
      .order("created_at", { ascending: false });

    if (enquiriesError) {
      console.error("catering_enquiries lookup failed", enquiriesError);
      return jsonResponse({ error: "Enquiries lookup failed" }, 500);
    }

    return jsonResponse({ enquiries: enquiries ?? [] }, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
