import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// T-CAP-1 (PR2a) — the permanent vendor page's READ path.
//
// Resolves a vendor slug to (a) its public brand identity and (b) whatever is
// currently on: a live drop, a full drop, an announced drop, or nothing at all.
// The "nothing on" state (resting) is NOT an empty state — it is the capture
// surface, which is why follow.enabled is true in every non-error state.
//
// State resolution is by PRIORITY, never by a single cross-state sort:
//   1. anything orderable now  -> live_drop (capacity left) | full_drop (full)
//   2. else anything announced -> announced_drop
//   3. else                    -> resting
// A live moment must never be hidden behind a future one, so an orderable drop
// outranks an announced drop however soon the announced one closes; a sold-out
// drop still outranks it and leads with capture, which is more honest than
// concealing that a drop happened today. closes_at / opens_at are tiebreaks
// WITHIN a state only (soonest to close; soonest to open).
//
// verify_jwt = false. This is a public, anonymous read: there is no user to
// authenticate. The only authorisation is "this vendor exists and is not
// explicitly inactive", checked server-side.
//
// WHY SERVICE-ROLE (this is the whole point of the function):
// Consumed capacity comes from public.drop_capacity_consumed(uuid), a plain
// `language sql stable` function with NO security definer — it therefore runs
// with the CALLER's privileges. The anon role has no SELECT policy on `orders`,
// so an anon caller doesn't get an error from it: it gets
// coalesce(sum(...), 0) = 0 — a silently WRONG zero, which would render a
// sold-out drop as wide open. v_drop_summary / drop_capacity are additionally
// REVOKEd from anon (operator-read-auth capstone, 20 May 2026). So the capacity
// read must happen under the service-role client, server-side, and the vendor
// page must never reach for capacity over anon PostgREST.
// See T-drop-capacity-anon-grants and operational learnings #52, #53.

// Vendors are gated by a DENY-list, not an allow-list: `status` is NOT NULL
// DEFAULT 'active' on the live schema, but a fail-safe gate must never hide a
// live vendor because of an unexpected value. Only an explicitly inactive
// vendor is hidden; anything else (including null or an unrecognised value)
// renders the page.
const INACTIVE_VENDOR_STATUSES = new Set([
  "suspended",
  "inactive",
  "archived",
  "disabled",
]);

// Brand fallbacks. #8B6B3F is the neutral vendor-brand default for a vendor who
// has set no colour — it is deliberately NOT Hearthfire. Rendering a colourless
// vendor's own surface in Hearth's accent would be brand-bleed (learning #85).
const BRAND_PRIMARY_FALLBACK = "#8B6B3F";
const BRAND_SECONDARY_FALLBACK = "#CBB89D";
const BRAND_TEXT_ON_PRIMARY_FALLBACK = "#ffffff";

// Every column below is confirmed present on the live information_schema.
// An unknown column hard-400s the ENTIRE query (operational learning #54), so
// never widen these lists without re-checking the live schema first.
const VENDOR_COLUMNS = [
  "id",
  "slug",
  "name",
  "display_name",
  "tagline",
  "logo_url",
  "hero_image_url",
  "brand_primary_color",
  "brand_secondary_color",
  "brand_text_on_primary",
  "powered_by_hearth_visible",
  "faq",
  "status",
].join(", ");

const DROP_COLUMNS = [
  "id",
  "slug",
  "name",
  "status",
  "drop_type",
  "host_id",
  "audience_scope",
  "opens_at",
  "closes_at",
  "delivery_start",
  "drop_intro",
  "fulfilment_mode",
  "capacity_units_total",
].join(", ");

// Recent-drops projection. DELIBERATELY separate from DROP_COLUMNS: it carries
// social_image_url (the thumbnail source), which is NOT on DROP_COLUMNS, and a
// single unknown column hard-400s the ENTIRE query (operational learning #54).
// Keeping this list distinct means the state-resolution query can never be
// widened by accident. Every column below is written by create-drop /
// update-drop (their ALLOWED_FIELDS), so all are confirmed on the live schema.
const RECENT_DROP_COLUMNS = [
  "slug",
  "name",
  "drop_intro",
  "closes_at",
  "delivery_start",
  "fulfilment_mode",
  "social_image_url",
].join(", ");

function isUuid(v: unknown): v is string {
  return typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function parseTime(v: unknown): number | null {
  if (!v || typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

// Soonest-first, nulls last: a drop with no close date is never the "soonest to
// close", so it must not sort ahead of one that does close.
function compareSoonest(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

type VendorRow = Record<string, unknown>;
// deno-lint-ignore no-explicit-any
type DropRow = Record<string, any>;

function buildVendorBlock(vendor: VendorRow) {
  return {
    slug: vendor.slug ?? null,
    display_name: vendor.display_name ?? vendor.name ?? null,
    tagline: vendor.tagline ?? null,
    logo_url: vendor.logo_url ?? null,
    hero_image_url: vendor.hero_image_url ?? null,
    brand: {
      primary: vendor.brand_primary_color ?? BRAND_PRIMARY_FALLBACK,
      secondary: vendor.brand_secondary_color ?? BRAND_SECONDARY_FALLBACK,
      text_on_primary: vendor.brand_text_on_primary ?? BRAND_TEXT_ON_PRIMARY_FALLBACK,
    },
    // Nullable boolean; null means visible, matching the platform-wide
    // `!== false` convention used by order.html / send-order-confirmation.
    powered_by_hearth_visible: vendor.powered_by_hearth_visible !== false,
    // Vendor-authored FAQ (T-CAP-1 PR4). Returned AS STORED — update-vendor is
    // the sole write path and has already trimmed, capped and dropped
    // half-filled entries, so there is nothing to re-derive here. Defaults to
    // [] for any unexpected shape, which the page reads as "no FAQ" and hides
    // the whole section. Present on every successful state because
    // buildVendorBlock backs all four.
    faq: Array.isArray(vendor.faq) ? vendor.faq : [],
  };
}

// Recently-completed public drops for the vendor — the page's "Recent drops"
// rhythm list. Uses the SAME strict public filter as state resolution
// (audience_scope IS NULL, drop_type <> 'community', host_id IS NULL) but with
// status = 'completed', newest-first, at most three. The currently-featured
// drop is excluded so it can't appear both as the headline and in the list
// (belt-and-braces: a featured drop is 'live'/announced, not 'completed', so an
// overlap is already structurally unlikely). A read error is non-fatal: the
// recent-drops strip is decoration, so it degrades to an empty array (the page
// hides the section) rather than failing the whole page.
async function fetchRecentDrops(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  vendorId: string,
  excludeSlug: string | null,
): Promise<Array<Record<string, unknown>>> {
  let query = serviceClient
    .from("drops")
    .select(RECENT_DROP_COLUMNS)
    .eq("vendor_id", vendorId)
    .eq("status", "completed")
    .is("audience_scope", null)
    .neq("drop_type", "community")
    .is("host_id", null)
    .order("closes_at", { ascending: false, nullsFirst: false })
    .limit(3);
  if (excludeSlug) query = query.neq("slug", excludeSlug);

  const { data, error } = await query;
  if (error) {
    console.error("recent drops lookup failed", error);
    return [];
  }
  const rows: DropRow[] = Array.isArray(data) ? data : [];
  return rows.map((d) => ({
    slug: d.slug ?? null,
    name: d.name ?? null,
    drop_intro: d.drop_intro ?? null,
    closes_at: d.closes_at ?? null,
    delivery_start: d.delivery_start ?? null,
    fulfilment_mode: d.fulfilment_mode ?? null,
    social_image_url: d.social_image_url ?? null,
  }));
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const jsonResponse = (body: unknown, status: number, cacheControl: string) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": cacheControl,
      },
    });

  // Capacity moves, so anything carrying a live number must never be cached.
  // Resting/announced carry no capacity and tolerate a short cache.
  const NO_STORE = "no-store";
  const SHORT_CACHE = "public, max-age=30";

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, NO_STORE);
  }

  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400, NO_STORE);
    }

    if (!raw || typeof raw !== "object") {
      return jsonResponse({ error: "Body must be a JSON object" }, 400, NO_STORE);
    }
    const b = raw as Record<string, unknown>;

    // Mirrors register-vendor-interest's resolution: vendor_id (uuid) or slug.
    let vendorId: string | undefined;
    let vendorSlug: string | undefined;
    if (isUuid(b.vendor_id)) vendorId = b.vendor_id as string;
    else if (nonEmptyString(b.slug)) vendorSlug = (b.slug as string).trim();
    else if (nonEmptyString(b.vendor_slug)) vendorSlug = (b.vendor_slug as string).trim();
    if (!vendorId && !vendorSlug) {
      return jsonResponse({ error: "slug or vendor_id is required" }, 400, NO_STORE);
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Resolve the vendor.
    const vendorQuery = serviceClient.from("vendors").select(VENDOR_COLUMNS);
    const { data: vendor, error: vendorErr } = await (
      vendorId ? vendorQuery.eq("id", vendorId) : vendorQuery.eq("slug", vendorSlug!)
    ).maybeSingle();

    if (vendorErr) {
      console.error("vendor lookup failed", vendorErr);
      return jsonResponse({ error: "Vendor lookup failed" }, 500, NO_STORE);
    }

    // A missing vendor and an explicitly inactive vendor are the SAME response:
    // an anonymous caller must not be able to tell a suspended vendor from one
    // that never existed.
    if (!vendor) {
      return jsonResponse({ error: "vendor_not_found" }, 404, NO_STORE);
    }
    const vendorStatus = vendor.status;
    if (
      typeof vendorStatus === "string" &&
      INACTIVE_VENDOR_STATUSES.has(vendorStatus.trim().toLowerCase())
    ) {
      return jsonResponse({ error: "vendor_not_found" }, 404, NO_STORE);
    }

    const vendorBlock = buildVendorBlock(vendor as VendorRow);

    // 2. Candidate drops. Every state except `resting` requires status='live',
    //    so the status filter is applied server-side.
    //
    //    Public-visible means ALL THREE of: audience_scope IS NULL (not
    //    early-access/private), drop_type <> 'community', host_id IS NULL.
    //    The host_id and drop_type conditions are deliberately belt-and-braces:
    //    a drop with a stale-null audience_scope that is structurally a host
    //    drop must not surface on the vendor's own public page. Community and
    //    host drops belong to the host's audience, not the open internet.
    const { data: drops, error: dropsErr } = await serviceClient
      .from("drops")
      .select(DROP_COLUMNS)
      .eq("vendor_id", vendor.id as string)
      .eq("status", "live")
      .is("audience_scope", null)
      .neq("drop_type", "community")
      .is("host_id", null)
      // Not authoritative — only a deterministic base order so that drops
      // sharing a timestamp resolve consistently under the stable sorts below.
      // State priority and the within-state tiebreaks are applied in code.
      .order("closes_at", { ascending: true, nullsFirst: false });

    if (dropsErr) {
      console.error("drops lookup failed", dropsErr);
      return jsonResponse({ error: "Drop lookup failed" }, 500, NO_STORE);
    }

    const now = Date.now();
    const candidates = Array.isArray(drops) ? drops : [];

    // 3. Resolve by STATE PRIORITY, not by a single cross-state sort.
    //
    //    A live moment must never be hidden behind a future one: an orderable
    //    drop (even a sold-out one) always outranks an announced drop, however
    //    soon the announced one closes. A full drop leads with capture, which is
    //    more honest than concealing that a drop happened today.
    //
    //    opens_at / closes_at are tiebreaks WITHIN a state only.
    const orderableNow: Array<{ drop: DropRow; closesAt: number | null }> = [];
    const announced: Array<{ drop: DropRow; opensAt: number }> = [];

    for (const drop of candidates as DropRow[]) {
      const opensAt = parseTime(drop.opens_at);
      const closesAt = parseTime(drop.closes_at);

      // A null opens_at means "already open"; a null closes_at means "no close".
      const hasOpened = opensAt === null || opensAt <= now;
      const notClosed = closesAt === null || closesAt > now;

      if (hasOpened && notClosed) {
        orderableNow.push({ drop, closesAt });
      } else if (opensAt !== null && opensAt > now) {
        announced.push({ drop, opensAt });
      }
      // else: live-status but already past its close — not a public state.
    }

    // Priority 1 — orderable now. Soonest to close wins; a drop with no close
    // date isn't "soonest", so nulls sort last.
    if (orderableNow.length > 0) {
      orderableNow.sort((a, b) => compareSoonest(a.closesAt, b.closesAt));
      const drop = orderableNow[0].drop;

      const { data: consumedRaw, error: rpcErr } = await serviceClient.rpc(
        "drop_capacity_consumed",
        { p_drop_id: drop.id },
      );
      if (rpcErr) {
        // Never guess capacity. A drop whose real capacity can't be read is
        // not rendered as open — showing a fabricated number here would be
        // manufactured scarcity in either direction.
        console.error("drop_capacity_consumed failed", { drop_id: drop.id, rpcErr });
        return jsonResponse({ error: "Capacity lookup failed" }, 500, NO_STORE);
      }

      const consumed = Number(consumedRaw ?? 0);
      const total = Number(drop.capacity_units_total);
      const hasRealTotal = Number.isFinite(total) && total > 0;

      // No declared capacity => nothing honest to show. Render the drop as
      // orderable with a null capacity block; the page hides the chip rather
      // than inventing a number.
      if (!hasRealTotal) {
        return jsonResponse({
          state: "live_drop",
          vendor: vendorBlock,
          drop: {
            slug: drop.slug,
            name: drop.name,
            drop_intro: drop.drop_intro ?? null,
            closes_at: drop.closes_at ?? null,
            delivery_start: drop.delivery_start ?? null,
            fulfilment_mode: drop.fulfilment_mode ?? null,
          },
          capacity: { total: null, remaining: null },
          follow: { enabled: true },
          recent_drops: await fetchRecentDrops(serviceClient, vendor.id as string, drop.slug ?? null),
        }, 200, NO_STORE);
      }

      const remaining = Math.max(total - consumed, 0);

      if (consumed < total) {
        return jsonResponse({
          state: "live_drop",
          vendor: vendorBlock,
          drop: {
            slug: drop.slug,
            name: drop.name,
            drop_intro: drop.drop_intro ?? null,
            closes_at: drop.closes_at ?? null,
            delivery_start: drop.delivery_start ?? null,
            fulfilment_mode: drop.fulfilment_mode ?? null,
          },
          capacity: { total, remaining },
          follow: { enabled: true },
          recent_drops: await fetchRecentDrops(serviceClient, vendor.id as string, drop.slug ?? null),
        }, 200, NO_STORE);
      }

      // Full, but still within its window — capture leads on the page. Hiding a
      // sold-out drop behind a future one would conceal that a drop happened.
      return jsonResponse({
        state: "full_drop",
        vendor: vendorBlock,
        drop: {
          slug: drop.slug,
          name: drop.name,
          // Carried for shape parity with live_drop / announced_drop. NOTE:
          // vendor.html deliberately does NOT render it in this state — the
          // full_drop hero substitutes the capacity sentence ("All N places
          // have been taken") as its lede, because being full outranks the
          // drop's intro copy. Present for completeness, not for that reader.
          drop_intro: drop.drop_intro ?? null,
          closes_at: drop.closes_at ?? null,
          delivery_start: drop.delivery_start ?? null,
          fulfilment_mode: drop.fulfilment_mode ?? null,
        },
        capacity: { total, remaining: 0 },
        follow: { enabled: true },
        recent_drops: await fetchRecentDrops(serviceClient, vendor.id as string, drop.slug ?? null),
      }, 200, NO_STORE);
    }

    // Priority 2 — nothing orderable, but something is announced. Soonest to
    // OPEN wins: the next drop to go live is the one worth anticipating.
    // (opensAt is non-null by construction here.)
    if (announced.length > 0) {
      announced.sort((a, b) => a.opensAt - b.opensAt);
      const drop = announced[0].drop;

      return jsonResponse({
        state: "announced_drop",
        vendor: vendorBlock,
        drop: {
          slug: drop.slug,
          name: drop.name,
          drop_intro: drop.drop_intro ?? null,
          opens_at: drop.opens_at,
          delivery_start: drop.delivery_start ?? null,
          fulfilment_mode: drop.fulfilment_mode ?? null,
        },
        follow: { enabled: true },
        recent_drops: await fetchRecentDrops(serviceClient, vendor.id as string, drop.slug ?? null),
      }, 200, SHORT_CACHE);
    }

    // Priority 3 — nothing on. The resting capture surface, not an empty state.
    return jsonResponse({
      state: "resting",
      vendor: vendorBlock,
      follow: { enabled: true },
      recent_drops: await fetchRecentDrops(serviceClient, vendor.id as string, null),
    }, 200, SHORT_CACHE);
  } catch (err) {
    console.error("get-vendor-page unhandled error", err);
    return jsonResponse({ error: "Unexpected error" }, 500, NO_STORE);
  }
});
