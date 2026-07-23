import type { Config, Context } from "@netlify/edge-functions";

// T-vendor-page-findability (Ticket 2a, PR1) — the per-vendor <head>.
//
// vendor.html is ONE static shell served for every vendor by the `_redirects`
// catch-all, so the head it ships with is generic: <title>Vendor</title>, no
// description, no canonical. Scrapers and crawlers do not run JavaScript, so
// nothing the page does client-side can fix that — the head has to be produced
// per request, server-side. This function is that.
//
// WHY AN EDGE FUNCTION (the two alternatives, and why each was rejected):
//   - Build-time prerender goes stale. A link shared while a drop is live
//     would preview the resting state, because the build ran days earlier.
//   - Client-side injection is invisible to the audience it exists for.
// Calling get-vendor-page server-side means the head and the body resolve from
// the same state, and the head inherits that function's public-visibility
// filter (and its PII-safe projection) for free.
//
// WHERE THIS RUNS IN THE CHAIN. Netlify's documented request order puts edge
// functions BEFORE redirects and static files, so this function sees the real
// request for /{slug} — before the `_redirects` rewrite to /vendor.html.
// `context.next()` then walks the rest of the chain (redirect engine → static
// file) and hands back the rewritten vendor.html response for us to modify.
// The function must therefore NEVER be declared on /vendor.html itself: an
// edge function declared on the TARGET of a rewrite does not run for rewritten
// requests, so it would silently do nothing.
//
// DEGRADING IS THE POINT. This sits on the path that serves every vendor page,
// so the human path must be untouchable. Every failure — upstream error,
// timeout, unexpected shape, unknown slug, anything thrown — returns the origin
// response and the page renders exactly as it does today, only with a generic
// head. It must never 500, never block, never serve an error page. Belt:
// `onError: "bypass"` tells Netlify to skip this function and continue the
// chain if it throws in a way the try/catch below somehow misses.
//
// SAME BYTES FOR EVERY REQUESTER. No user-agent branching anywhere: serving
// crawlers something different from humans is cloaking, and Google penalises
// it. What the crawler reads is what the visitor is served.
//
// PR1 is the essential head only — title, description, canonical, robots.
// Open Graph, Twitter cards and JSON-LD are PR2, deliberately held back until
// the mechanism has been proven in production.

// Same public endpoint and publishable key the browser already uses (see
// assets/config.js — this key ships to every visitor and carries no
// privilege). get-vendor-page is verify_jwt = false and answers with no auth
// headers at all; the key is sent purely so this call is shaped exactly like
// the page's own. No Netlify environment variable is required.
const SUPABASE_URL = "https://tvqhhjvumgumyetvpgid.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_GftZ3Mw1M2-jb2bStjv80Q_gRDC9FzD";

// The canonical host. Always https, never a preview domain: a canonical tag
// pointing at a deploy preview would invite Google to index the preview.
const CANONICAL_ORIGIN = "https://lovehearth.co.uk";

// Both the injection anchor and the identity check. This literal occurs
// exactly once in vendor.html, and in no other page — so a response that does
// not contain it is not vendor.html and is returned untouched, whatever path
// it arrived on. That is what makes a path-matching mistake harmless rather
// than site-wide: the only page this function can alter is the one it is for.
const HEAD_MARKER = "<title>Vendor</title>";

// A slow upstream must never hold up a page load. Measured production latency
// for get-vendor-page is ~0.4s; this is a generous ceiling, not a target.
const UPSTREAM_TIMEOUT_MS = 2500;

// Search engines truncate descriptions around here. We cut on a word boundary
// rather than let them cut mid-word, and add no ellipsis — a vendor's own
// sentence ending early reads better than one ending in "…".
const DESCRIPTION_MAX = 155;

const ROBOTS_NOINDEX = '<meta name="robots" content="noindex, nofollow" />';

// Spaced em dash, matching the platform's display convention.
const TITLE_SEPARATOR = " — ";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Vendor-authored copy can carry newlines and runs of whitespace; a meta
// attribute must be one clean line.
function normaliseText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > 0 ? collapsed : null;
}

// Cut on a word boundary, never mid-word, and never with an ellipsis. If the
// text has no space before the limit (one very long token) fall back to a hard
// cut — still better than an unbounded description.
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const clipped = text.slice(0, max);
  const lastSpace = clipped.lastIndexOf(" ");
  const cut = lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped;
  // Drop a dangling separator left by the cut ("… bread," → "… bread").
  return cut.replace(/[\s,;:\-–—]+$/, "");
}

/* Slug resolution — deliberately mirrors vendor.html's slugFromPath so the
   head and the body can never disagree about which vendor a URL names.

   Only a SINGLE path segment resolves; /gather/menu is not a vendor. A slug
   containing a dot is rejected outright: vendor slugs are created lowercase
   alphanumeric-plus-hyphen by create-vendor, so a dot means this is a real
   file at the site root (order.html, favicon.svg, vendor.html itself) that the
   URLPattern declaration cannot exclude on its own. */
function readSlug(pathname: string): string | null {
  let raw = String(pathname ?? "");
  if (raw.charAt(0) === "/") raw = raw.slice(1);
  if (raw.charAt(raw.length - 1) === "/") raw = raw.slice(0, -1);

  if (!raw) return null;
  if (raw.indexOf("/") !== -1) return null;
  if (raw.length > 200) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // A malformed escape sequence resolves to nothing, never a throw.
    return null;
  }

  decoded = decoded.trim();
  if (!decoded) return null;
  // Decoding can reveal a separator that was hidden as %2F.
  if (decoded.indexOf("/") !== -1) return null;
  if (decoded.indexOf(".") !== -1) return null;

  return decoded.toLowerCase();
}

// The ONLY data source this function reads. get-vendor-page returns a
// PII-safe projection — no account/login email, no private operational phone —
// and nothing here reaches for anything else.
//
// A 404 is a MEANINGFUL answer (vendor_not_found), not a failure, so it is
// returned to the caller rather than swallowed. Any other status, a transport
// error or a timeout returns null, which the caller reads as "change nothing".
async function fetchVendorPage(slug: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/get-vendor-page`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ slug }),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });

  if (res.status !== 200 && res.status !== 404) return null;

  const body = await res.json();
  return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
}

/* Description precedence deliberately matches the page's own descriptive line
   (offer_statement, then tagline), so the head and the body say the same
   thing. The platform fallback is the last resort for a vendor who has written
   neither — plain, honest, and never invented detail. */
function buildDescription(
  vendor: Record<string, unknown>,
  name: string | null,
  town: string | null,
): string | null {
  const authored = normaliseText(vendor.offer_statement) ?? normaliseText(vendor.tagline);
  if (authored) return truncate(authored, DESCRIPTION_MAX);

  if (!name) return null;
  return town ? `Order ahead from ${name} in ${town}.` : `Order ahead from ${name}.`;
}

/* Builds the replacement for HEAD_MARKER, or null to leave the head alone.

   The <title> is STATE-INDEPENDENT by design. Crawlers index at arbitrary
   moments, so a title naming the drop that happened to be live would be cached
   and go stale within days. The title carries the durable fact — who they are,
   where they are — and PR2's share preview carries the moment.

   Absent values render nothing: no empty content="", no "undefined", and no
   trailing separator on a vendor with no town. */
function buildHeadBlock(data: Record<string, unknown> | null): string | null {
  if (!data) return null;

  const vendor = data.vendor && typeof data.vendor === "object"
    ? (data.vendor as Record<string, unknown>)
    : null;

  if (!vendor) {
    // No vendor: the only honest signal is "do not index". The served title is
    // left exactly as it is — there is no name to write one from, and this
    // page is the site's de-facto 404 handler. No canonical either: a
    // not-found page must not claim to be the canonical anything.
    if (data.error === "vendor_not_found") return `${HEAD_MARKER}\n  ${ROBOTS_NOINDEX}`;
    // Any other unrecognised shape changes nothing.
    return null;
  }

  const name = normaliseText(vendor.display_name) ?? normaliseText(vendor.name);
  const town = normaliseText(vendor.town);
  const slug = normaliseText(vendor.slug);

  const lines: string[] = [];

  // A vendor with no name at all leaves the served title untouched rather than
  // rendering an empty one.
  lines.push(
    name
      ? `<title>${escapeHtml(town ? name + TITLE_SEPARATOR + town : name)}</title>`
      : HEAD_MARKER,
  );

  const description = buildDescription(vendor, name, town);
  if (description) {
    lines.push(`<meta name="description" content="${escapeHtml(description)}" />`);
  }

  if (slug) {
    const href = `${CANONICAL_ORIGIN}/${encodeURIComponent(slug)}`;
    lines.push(`<link rel="canonical" href="${escapeHtml(href)}" />`);
  }

  // Hearth's own test vendor records are real public URLs and must never enter
  // search results. Strict === true so an unexpected value reads as "real":
  // the safe failure is indexing a test page, not de-indexing a real vendor's
  // storefront. vendor.html's client-side noIndex() carries an idempotence
  // guard, so it no-ops when this tag is already present and still fires when
  // this function has degraded.
  if (vendor.is_internal === true) lines.push(ROBOTS_NOINDEX);

  return lines.join("\n  ");
}

// Rebuilds the response around a body we have already read. content-length and
// content-encoding are dropped because both describe the ORIGINAL bytes:
// carrying a stale length truncates the page, and carrying content-encoding
// tells the browser to gunzip text that is no longer compressed. Used on both
// the modified and the unmodified path so the two behave identically.
function htmlResponse(body: string, origin: Response): Response {
  const headers = new Headers(origin.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(body, {
    status: origin.status,
    statusText: origin.statusText,
    headers,
  });
}

export default async (request: Request, context: Context) => {
  // Start the upstream read BEFORE awaiting the origin so the two overlap:
  // added wall-clock is roughly the slower of the two, not their sum. The
  // rejection is captured here and never rethrown, so a failed upstream call
  // can never surface as an unhandled rejection.
  let slug: string | null = null;
  try {
    slug = readSlug(new URL(request.url).pathname);
  } catch {
    slug = null;
  }

  const settled: Promise<Record<string, unknown> | null> = slug
    ? fetchVendorPage(slug).catch((err) => {
      console.error("vendor-head: get-vendor-page unavailable", { slug, err: String(err) });
      return null;
    })
    : Promise.resolve(null);

  // If the origin itself fails there is no page to enrich; let it through to
  // Netlify's own handling (onError: "bypass").
  const origin = await context.next();

  if (!slug) {
    await settled;
    return origin;
  }

  const contentType = origin.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("text/html")) {
    await settled;
    return origin;
  }

  let html: string;
  try {
    html = await origin.text();
  } catch (err) {
    // The body could not be read, so it has not been consumed either.
    console.error("vendor-head: could not read origin body", { slug, err: String(err) });
    return origin;
  }

  // Past this point the origin body IS consumed, so every remaining path must
  // return a response rebuilt from `html`. `out` starts as the untouched
  // markup and is only replaced on full success — so the catch below, and the
  // no-marker case, both return byte-identical output.
  let out = html;
  try {
    const data = await settled;
    const headBlock = buildHeadBlock(data);
    if (headBlock && html.includes(HEAD_MARKER)) {
      out = html.replace(HEAD_MARKER, headBlock);
    }
  } catch (err) {
    console.error("vendor-head: head injection failed", { slug, err: String(err) });
    out = html;
  }

  return htmlResponse(out, origin);
};

/* URLPattern `:slug` matches exactly one non-empty path segment and never
   crosses a `/`, so multi-segment paths (/assets/hearth.css, /.netlify/…,
   /gather/menu) and the site root (/, which is index.html) are excluded
   structurally. Chosen over the regex `pattern` option deliberately: the docs
   are inconsistent about whether `pattern` is anchored, and an unanchored
   pattern that matched a substring would intercept the entire site.

   Root-level real files (/order.html, /favicon.svg) ARE single-segment and so
   still match this declaration — URLPattern cannot express "one segment
   containing no dot". They are excluded in code instead, by the dot rejection
   in readSlug() and then by the HEAD_MARKER check, either of which alone is
   sufficient.

   onError: "bypass" — if this function throws despite the handling above,
   Netlify skips it and continues the chain, serving the page unmodified. */
export const config: Config = {
  path: ["/:slug", "/:slug/"],
  method: "GET",
  onError: "bypass",
};
