import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Bulk customer import for customer-import.html. Replaces the four
// silent-failure direct PostgREST writes (two on `customers`, two on
// `customer_relationships`) that broke under RLS for authenticated
// vendor sessions due to the supabase-js publishable-key auth-attach
// bug (CLAUDE.md operational learnings #12 / #14 / #16).
//
// Anonymous gateway (verify_jwt = false in supabase/config.toml). The
// function verifies the caller's JWT in-line via auth.getUser(), resolves
// the owning vendor from vendors.auth_user_id, then writes through a
// service-role client so RLS is bypassed cleanly.
//
// Per-row errors do NOT abort the request — every row is bucketed into
// one of five outcomes (added / linked / skipped / conflict / failed)
// and a per-row response is returned. Stage 5 of customer-import.html
// renders its summary from that response.
//
// See `audit/customer-import-investigation-2026-05-15.md` for the full
// investigation that informed this design.

const MAX_ROWS = 1000;
const ALLOWED_LAWFUL_BASIS = new Set(["explicit_consent", "legitimate_interests"]);

type InputRow = {
  row_index: number;
  name: string;
  email: string;
  phone?: string;
  postcode?: string;
  address?: string;
};

type RequestBody = {
  rows: InputRow[];
  lawful_basis: "explicit_consent" | "legitimate_interests";
};

type Outcome = "added" | "linked" | "skipped" | "conflict" | "failed";

type ResultRow = {
  row_index: number;
  outcome: Outcome;
  customer_id?: string;
  reason?: string;
  error_code?: string;
};

type NormalisedRow = {
  row_index: number;
  name: string;
  email: string;        // lowercased + trimmed
  phone: string | null; // normalised, or null
  postcode: string | null;
  address: string | null;
};

// Mirror of customer-import.html:1183 — strip spaces and hyphens, convert
// leading 07 to +447, leading 00 to +. Anything else passes through.
// Returns empty string for empty input; caller should treat empty as null.
function normalisePhone(phone: string): string {
  let p = phone.replace(/[\s\-]/g, "");
  if (p.startsWith("07")) {
    p = "+447" + p.slice(2);
  } else if (p.startsWith("00")) {
    p = "+" + p.slice(2);
  }
  return p;
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
    // 1. JWT verification.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Unauthenticated" }, 401);

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) return jsonResponse({ error: "Unauthenticated" }, 401);

    // 2. Vendor resolution via service-role.
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: vendor, error: vendorErr } = await serviceClient
      .from("vendors")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (vendorErr) return jsonResponse({ error: "Vendor lookup failed" }, 500);
    if (!vendor) return jsonResponse({ error: "No vendor found for this user" }, 403);
    const vendorId = String(vendor.id);

    // 3. Body validation.
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }
    if (!raw || typeof raw !== "object") {
      return jsonResponse({ error: "Body must be a JSON object" }, 400);
    }
    const body = raw as Partial<RequestBody>;

    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      return jsonResponse({ error: "rows must be a non-empty array" }, 400);
    }
    if (body.rows.length > MAX_ROWS) {
      return jsonResponse({ error: `rows length exceeds ${MAX_ROWS}` }, 400);
    }
    if (typeof body.lawful_basis !== "string" || !ALLOWED_LAWFUL_BASIS.has(body.lawful_basis)) {
      return jsonResponse(
        { error: "lawful_basis must be 'explicit_consent' or 'legitimate_interests'" },
        400,
      );
    }
    const lawfulBasis = body.lawful_basis;

    // 4. Per-row validation + normalisation. Validation failures are
    //    bucketed directly as `failed` with error_code='validation' and
    //    do NOT abort the request.
    const results: ResultRow[] = [];
    const normalised: NormalisedRow[] = [];

    for (let i = 0; i < body.rows.length; i++) {
      const row = body.rows[i] as Partial<InputRow> | undefined;
      const rowIndex = row && typeof row.row_index === "number" ? row.row_index : i;

      if (!row || typeof row !== "object") {
        results.push({
          row_index: rowIndex,
          outcome: "failed",
          error_code: "validation",
          reason: "row must be an object",
        });
        continue;
      }
      if (typeof row.row_index !== "number") {
        results.push({
          row_index: rowIndex,
          outcome: "failed",
          error_code: "validation",
          reason: "row_index must be a number",
        });
        continue;
      }
      if (typeof row.name !== "string" || !row.name.trim()) {
        results.push({
          row_index: row.row_index,
          outcome: "failed",
          error_code: "validation",
          reason: "missing required field",
        });
        continue;
      }
      if (typeof row.email !== "string" || !row.email.trim()) {
        results.push({
          row_index: row.row_index,
          outcome: "failed",
          error_code: "validation",
          reason: "missing required field",
        });
        continue;
      }

      const phoneRaw = typeof row.phone === "string" ? row.phone : "";
      const phoneNorm = phoneRaw ? normalisePhone(phoneRaw) : "";
      const postcodeStr = typeof row.postcode === "string" ? row.postcode.trim() : "";
      const addressStr = typeof row.address === "string" ? row.address.trim() : "";

      normalised.push({
        row_index: row.row_index,
        name: row.name.trim(),
        email: row.email.toLowerCase().trim(),
        phone: phoneNorm || null,
        postcode: postcodeStr || null,
        address: addressStr || null,
      });
    }

    // 5. Batched lookup: existing customers matching any candidate email
    //    or phone. PostgREST .or() with .in() per side.
    const emailToCustomer = new Map<string, { customerId: string; address: string | null }>();
    const phoneToCustomer = new Map<string, { customerId: string; address: string | null }>();

    const candidateEmails = Array.from(
      new Set(normalised.map((r) => r.email).filter((e) => e.length > 0)),
    );
    const candidatePhones = Array.from(
      new Set(
        normalised
          .map((r) => r.phone)
          .filter((p): p is string => typeof p === "string" && p.length > 0),
      ),
    );

    let existingCustomers: Array<{ id: string; email: string | null; phone: string | null; address: string | null }> = [];
    if (candidateEmails.length > 0 || candidatePhones.length > 0) {
      const orParts: string[] = [];
      if (candidateEmails.length > 0) {
        orParts.push(`email.in.(${candidateEmails.map(quoteForOrList).join(",")})`);
      }
      if (candidatePhones.length > 0) {
        orParts.push(`phone.in.(${candidatePhones.map(quoteForOrList).join(",")})`);
      }
      const { data: existing, error: lookupErr } = await serviceClient
        .from("customers")
        .select("id, email, phone, address")
        .or(orParts.join(","));
      if (lookupErr) {
        return jsonResponse({ error: "Customer lookup failed" }, 500);
      }
      existingCustomers = (existing || []) as typeof existingCustomers;
    }

    for (const c of existingCustomers) {
      if (c.email) {
        const key = c.email.toLowerCase().trim();
        if (key) emailToCustomer.set(key, { customerId: c.id, address: c.address ?? null });
      }
      if (c.phone) {
        const normKey = normalisePhone(c.phone);
        if (normKey) phoneToCustomer.set(normKey, { customerId: c.id, address: c.address ?? null });
      }
    }

    // 6. Batched lookup: this vendor's existing relationships, scoped to
    //    the candidate customer ids.
    const candidateIds = Array.from(
      new Set([
        ...Array.from(emailToCustomer.values()).map((v) => v.customerId),
        ...Array.from(phoneToCustomer.values()).map((v) => v.customerId),
      ]),
    );

    const existingRelSet = new Set<string>();
    if (candidateIds.length > 0) {
      const { data: rels, error: relErr } = await serviceClient
        .from("customer_relationships")
        .select("customer_id")
        .eq("owner_id", vendorId)
        .eq("owner_type", "vendor")
        .in("customer_id", candidateIds);
      if (relErr) {
        return jsonResponse({ error: "Relationship lookup failed" }, 500);
      }
      for (const r of rels || []) {
        if (r.customer_id) existingRelSet.add(String(r.customer_id));
      }
    }

    // 7. Classification.
    type CreateNew = { row: NormalisedRow };
    type LinkExisting = { row: NormalisedRow; customerId: string; existingAddress: string | null };
    const createNew: CreateNew[] = [];
    const linkExisting: LinkExisting[] = [];

    for (const row of normalised) {
      const emailMatch = emailToCustomer.get(row.email) || null;
      const phoneMatch = row.phone ? phoneToCustomer.get(row.phone) || null : null;

      if (emailMatch && phoneMatch && emailMatch.customerId !== phoneMatch.customerId) {
        results.push({
          row_index: row.row_index,
          outcome: "conflict",
          reason: "email and phone match different existing customers",
        });
        continue;
      }

      if (emailMatch) {
        if (existingRelSet.has(emailMatch.customerId)) {
          results.push({
            row_index: row.row_index,
            outcome: "skipped",
            customer_id: emailMatch.customerId,
            reason: "relationship_exists",
          });
        } else {
          linkExisting.push({
            row,
            customerId: emailMatch.customerId,
            existingAddress: emailMatch.address,
          });
        }
        continue;
      }

      if (phoneMatch) {
        if (existingRelSet.has(phoneMatch.customerId)) {
          results.push({
            row_index: row.row_index,
            outcome: "skipped",
            customer_id: phoneMatch.customerId,
            reason: "relationship_exists",
          });
        } else {
          linkExisting.push({
            row,
            customerId: phoneMatch.customerId,
            existingAddress: phoneMatch.address,
          });
        }
        continue;
      }

      createNew.push({ row });
    }

    // 8. Write phase — createNew. Sequential per-row inserts; one
    //    customers row + one customer_relationships row per CSV row.
    //    On customers insert failure: bucket failed, continue.
    //    On relationship insert failure after customers succeeded: bucket
    //    failed; the orphaned customers row is recoverable on a subsequent
    //    import via the linkExisting path (matches create-order semantics).
    for (const item of createNew) {
      const r = item.row;
      const customerPayload: Record<string, unknown> = {
        name: r.name,
        email: r.email,
        phone: r.phone,
        postcode: r.postcode,
        address: r.address,
      };

      const { data: inserted, error: insertErr } = await serviceClient
        .from("customers")
        .insert(customerPayload)
        .select("id")
        .single();

      if (insertErr || !inserted) {
        results.push({
          row_index: r.row_index,
          outcome: "failed",
          error_code: insertErr?.code || "insert_failed",
          reason: insertErr?.message || "customer insert failed",
        });
        continue;
      }
      const newCustomerId = String(inserted.id);

      const { error: relErr } = await serviceClient
        .from("customer_relationships")
        .insert({
          customer_id: newCustomerId,
          owner_id: vendorId,
          owner_type: "vendor",
          consent_status: "imported",
          source: "import",
          lawful_basis: lawfulBasis,
        });

      if (relErr) {
        results.push({
          row_index: r.row_index,
          outcome: "failed",
          error_code: relErr.code || "insert_failed",
          reason: relErr.message || "relationship insert failed",
        });
        continue;
      }

      results.push({
        row_index: r.row_index,
        outcome: "added",
        customer_id: newCustomerId,
      });
    }

    // 9. Write phase — linkExisting. INSERT relationship; on 23505 bucket
    //    as skipped (race with concurrent vendor creating same relationship);
    //    on success, best-effort address backfill if the existing customer
    //    has no address.
    for (const item of linkExisting) {
      const r = item.row;

      const { error: relErr } = await serviceClient
        .from("customer_relationships")
        .insert({
          customer_id: item.customerId,
          owner_id: vendorId,
          owner_type: "vendor",
          consent_status: "imported",
          source: "import",
          lawful_basis: lawfulBasis,
        });

      if (relErr) {
        if (relErr.code === "23505") {
          results.push({
            row_index: r.row_index,
            outcome: "skipped",
            customer_id: item.customerId,
            reason: "relationship_exists",
          });
        } else {
          results.push({
            row_index: r.row_index,
            outcome: "failed",
            error_code: relErr.code || "insert_failed",
            reason: relErr.message || "relationship insert failed",
          });
        }
        continue;
      }

      // Best-effort address backfill. Failures are logged but do not
      // downgrade the outcome — relationship write is the success signal.
      const existing = item.existingAddress;
      const isEmpty = !existing || existing.trim() === "";
      if (r.address && isEmpty) {
        const { error: addrErr } = await serviceClient
          .from("customers")
          .update({ address: r.address })
          .eq("id", item.customerId);
        if (addrErr) {
          console.error("address backfill failed", { customerId: item.customerId, addrErr });
        }
      }

      results.push({
        row_index: r.row_index,
        outcome: "linked",
        customer_id: item.customerId,
      });
    }

    // 10. Summary.
    const summary = {
      added: 0,
      linked: 0,
      skipped: 0,
      conflicts: 0,
      failed: 0,
      total: results.length,
    };
    for (const r of results) {
      if (r.outcome === "added") summary.added++;
      else if (r.outcome === "linked") summary.linked++;
      else if (r.outcome === "skipped") summary.skipped++;
      else if (r.outcome === "conflict") summary.conflicts++;
      else if (r.outcome === "failed") summary.failed++;
    }

    // 11. Demand breakdown — all of this vendor's import-source relationships,
    //     grouped by outward postcode code, top 10.
    let customersWithPostcodeCount = 0;
    let topAreas: Array<{ outward_code: string; customer_count: number }> = [];

    const { data: demandRows, error: demandErr } = await serviceClient
      .from("customer_relationships")
      .select("customer_id, customers!inner(postcode)")
      .eq("owner_id", vendorId)
      .eq("owner_type", "vendor")
      .eq("source", "import");

    if (demandErr) {
      console.error("demand breakdown query failed", demandErr);
    } else {
      const byArea = new Map<string, number>();
      for (const row of demandRows || []) {
        const cust = (row as { customers: { postcode: string | null } | { postcode: string | null }[] | null }).customers;
        const postcode = Array.isArray(cust)
          ? cust[0]?.postcode ?? null
          : cust?.postcode ?? null;
        if (!postcode || !postcode.trim()) continue;
        const outward = postcode.trim().split(/\s+/)[0]?.toUpperCase();
        if (!outward) continue;
        byArea.set(outward, (byArea.get(outward) || 0) + 1);
        customersWithPostcodeCount++;
      }
      topAreas = Array.from(byArea.entries())
        .map(([outward_code, customer_count]) => ({ outward_code, customer_count }))
        .sort((a, b) => b.customer_count - a.customer_count)
        .slice(0, 10);
    }

    // 12. Response.
    return jsonResponse(
      {
        results,
        summary,
        demand_breakdown: {
          customers_with_postcode_count: customersWithPostcodeCount,
          top_areas: topAreas,
        },
      },
      200,
    );
  } catch (err) {
    console.error("bulk-create-customers unexpected error", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal error" }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      },
    );
  }
});

// PostgREST .or() takes a comma-separated list of filter expressions. The
// argument to email.in.(...) must be a comma-separated list of quoted
// values. Embed-safe quoting: wrap each value in double quotes, escape any
// embedded double-quote by doubling it. Emails and normalised phones never
// contain commas in practice, but we still quote defensively.
function quoteForOrList(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
