import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

/* Vendor slugs are now public URLs: lovehearth.co.uk/{slug} serves the
   permanent vendor page, via the catch-all rewrite at the end of _redirects.
   That rewrite is non-forced, so a real file at the root always wins — which
   means a vendor whose slug matches one would be unreachable at their own
   address, silently, with no error anywhere. The only place to catch that is
   here, before the row exists.

   RESERVED_SLUGS is derived from what is actually served at the site root:
   every root-level .html file (bare name and .html form), every served
   top-level directory, and "landing", which the /landing.html rule above the
   catch-all still claims. Keep it in step with the repo root — adding a new
   root page means adding its name here.

   SLUG_PATTERN also does real work: by disallowing dots, underscores,
   uppercase and leading/trailing hyphens it rules out favicon.svg, _redirects
   and the root .md files without needing to list them. It is what lets
   vendor.html lowercase a path segment before lookup and trust the result. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MIN_LENGTH = 2;
const SLUG_MAX_LENGTH = 63;

const RESERVED_ROOT_PAGES = [
  "activation",
  "activation-poster",
  "admin",
  "auth-callback",
  "brand-hearth",
  "catering-enquiry",
  "customer-import",
  "customers",
  "drop-manager",
  "drop-menu",
  "enquiries",
  "home",
  "host-poster",
  "host-profile",
  "host-terms",
  "host-view",
  "hosts",
  "index",
  "insights",
  "landing",
  "login",
  "onboarding",
  "order",
  "order-confirmation",
  "order-entry",
  "platform-admin",
  "platform-admin-vendor",
  "privacy",
  "reset-password",
  "scorecard",
  "service-board",
  "set-password",
  "signup",
  "vendor",
  "vendor-terms",
  "why-hearth",
];

const RESERVED_DIRECTORIES = [
  "assets",
  "audit",
  "docs",
  "schema-snapshot",
  "supabase",
];

const RESERVED_SLUGS = new Set([
  ...RESERVED_ROOT_PAGES,
  ...RESERVED_ROOT_PAGES.map((name) => `${name}.html`),
  ...RESERVED_DIRECTORIES,
]);

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    const { name, slug, display_name, email } = await req.json();

    if (!name || typeof name !== "string") {
      return new Response(JSON.stringify({ error: "name is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!slug || typeof slug !== "string") {
      return new Response(JSON.stringify({ error: "slug is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing bearer token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: adminRow, error: adminErr } = await supabaseAdmin
      .from("admins")
      .select("id")
      .eq("auth_user_id", userData.user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (adminErr) {
      return new Response(JSON.stringify({ error: adminErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!adminRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();

    // Slug validation runs after the admin check, so an unauthenticated caller
    // cannot use the error messages to map the site's reserved paths.
    if (
      trimmedSlug.length < SLUG_MIN_LENGTH ||
      trimmedSlug.length > SLUG_MAX_LENGTH ||
      !SLUG_PATTERN.test(trimmedSlug)
    ) {
      return new Response(
        JSON.stringify({
          error:
            "Slug must be " + SLUG_MIN_LENGTH + "–" + SLUG_MAX_LENGTH +
            " characters, lowercase letters, numbers and single hyphens only, " +
            "not starting or ending with a hyphen.",
          code: "slug_invalid",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Never silently rewrite the vendor's choice — tell them and let them pick.
    if (RESERVED_SLUGS.has(trimmedSlug)) {
      return new Response(
        JSON.stringify({
          error:
            "“" + trimmedSlug + "” is reserved for a Hearth page, so it can’t be " +
            "used as a vendor address. Please choose another slug.",
          code: "slug_reserved",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const trimmedEmail = email.trim();
    const trimmedDisplay = (display_name && typeof display_name === "string" && display_name.trim()) || trimmedName;

    const { data, error } = await supabaseAdmin
      .from("vendors")
      .insert({
        name: trimmedName,
        slug: trimmedSlug,
        display_name: trimmedDisplay,
        email: trimmedEmail,
        onboarding_completed: false,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        const detail = ((error.details || "") + " " + (error.message || "")).toLowerCase();
        let conflictField = "slug";
        if (detail.includes("email")) conflictField = "email";
        return new Response(
          JSON.stringify({
            error: `A vendor with this ${conflictField} already exists.`,
            code: "23505",
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, id: data?.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
