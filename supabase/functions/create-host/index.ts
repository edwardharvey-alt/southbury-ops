import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!
  );
  const { data: { user }, error: authError } = await anonClient.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const body = await req.json();
  const { name, host_type, postcode, slug, vendor_id, created_by_vendor_id } = body;

  const { data: vendor } = await serviceClient
    .from("vendors")
    .select("id")
    .eq("id", vendor_id)
    .eq("auth_user_id", user.id)
    .single();

  if (!vendor) return new Response(JSON.stringify({ error: "Vendor not found or not owned by user" }), { status: 403 });

  const { data, error } = await serviceClient
    .from("hosts")
    .insert({ name, host_type, postcode, slug, vendor_id, created_by_vendor_id })
    .select()
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
});
