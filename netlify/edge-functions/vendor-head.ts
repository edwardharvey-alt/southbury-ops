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
// WHAT IS STATE-DEPENDENT AND WHAT IS NOT. The split runs through this whole
// file and is the reason the tags differ:
//   - <title> and description are STATE-INDEPENDENT. Crawlers index at
//     arbitrary moments, so a title naming whichever drop happened to be live
//     would be cached and stale within days. They carry the durable fact.
//   - og:* / twitter:* are STATE-DEPENDENT. They are read at the instant
//     someone shares or previews the link, so they say what is happening now.
//   - JSON-LD is STATE-INDEPENDENT. It describes the business, not the moment.
// PR2 added the share preview and the structured data without touching the
// first group — the title and description bytes are unchanged from PR1.

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

// A card with a real image gets the large format; a card without one must not
// claim it, or the preview renders as a large empty frame.
const TWITTER_CARD_WITH_IMAGE = "summary_large_image";
const TWITTER_CARD_TEXT_ONLY = "summary";

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

/* The share title — the ONE state-dependent string on the page.

   Unlike <title>, this is read at the moment of sharing, so it can name what
   is actually on. Every pattern states a fact and stops: no "selling fast",
   no "last chance", no exclamation marks. `full_drop` in particular reports
   that the drop is full and does not dramatise it — real capacity, plainly
   stated, is the whole point of the model.

   Each state falls back to a vendor-only phrasing when the drop has no name
   (`drops.name` is nullable). An unrecognised state falls back to the resting
   pattern, which is the same durable form <title> uses — the safe direction
   for a state this function has not been taught. */
function buildShareTitle(
  state: string | null,
  dropName: string | null,
  name: string | null,
  town: string | null,
): string | null {
  const resting = name ? (town ? name + TITLE_SEPARATOR + town : name) : null;

  switch (state) {
    case "live_drop":
      if (dropName) return `${dropName}${TITLE_SEPARATOR}ordering open`;
      return name ? `Ordering open${TITLE_SEPARATOR}${name}` : null;
    case "full_drop":
      if (dropName) return `${dropName}${TITLE_SEPARATOR}now full`;
      return name ? `${name}${TITLE_SEPARATOR}this drop is full` : null;
    case "announced_drop":
      if (dropName) return name ? `${dropName}${TITLE_SEPARATOR}${name}` : dropName;
      return name ? `${name}${TITLE_SEPARATOR}a drop is coming up` : null;
    default:
      return resting;
  }
}

// OG requires an ABSOLUTE url; a relative path yields no preview image at all,
// silently. The column is free text written by an upload flow, so the shape is
// tested rather than trusted — an absent image is honest, a broken one is
// worse than none.
function absoluteImageUrl(value: unknown): string | null {
  const raw = normaliseText(value);
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : null;
}

/* Structured data for the business — state-independent, so it names no drop.

   LocalBusiness deliberately, not FoodEstablishment: the more specific type
   mainly unlocks menu-related rich results we do not emit, and LocalBusiness
   stays accurate for a vendor with no premises at all (home bakers, trucks).
   Revisit FoodEstablishment if menu data is ever emitted here.

   Absent values are OMITTED, never nulled or placeholdered — a structured
   claim about a business must not assert a field the vendor has not filled
   in. The whole address object drops out when street, town and postcode are
   all absent; addressCountry is the one key always present when it is
   emitted at all, because every Hearth vendor is UK-based. */
function buildJsonLd(
  vendor: Record<string, unknown>,
  name: string | null,
  town: string | null,
  canonicalUrl: string | null,
  description: string | null,
  image: string | null,
): string | null {
  if (!name) return null;

  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name,
  };

  if (canonicalUrl) node.url = canonicalUrl;
  if (description) node.description = description;

  const street = normaliseText(vendor.address);
  const postcode = normaliseText(vendor.postcode);
  if (street || town || postcode) {
    const address: Record<string, unknown> = { "@type": "PostalAddress" };
    if (street) address.streetAddress = street;
    if (town) address.addressLocality = town;
    if (postcode) address.postalCode = postcode;
    address.addressCountry = "GB";
    node.address = address;
  }

  // The PUBLIC contact fields only. The vendor's private operational phone
  // and their account/login email are not in get-vendor-page's projection and
  // can never reach this function.
  const telephone = normaliseText(vendor.public_phone);
  if (telephone) node.telephone = telephone;
  const email = normaliseText(vendor.public_email);
  if (email) node.email = email;

  if (image) node.image = image;

  // JSON.stringify handles quotes, backslashes and control characters. The one
  // thing it does NOT handle is that we are embedding into a <script> element:
  // a literal "</script>" anywhere in vendor-authored text would close the
  // block early and spill the rest into the document. Replacing every "<" with
  // its unicode escape below is valid JSON, parses back to the identical
  // string, and closes that hole (and the "<!--" one) completely.
  return JSON.stringify(node).replace(/</g, "\\u003c");
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
    // not-found page must not claim to be the canonical anything. No share
    // preview and no structured data either — there is no business to
    // describe and nothing worth previewing.
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

  const canonicalUrl = slug ? `${CANONICAL_ORIGIN}/${encodeURIComponent(slug)}` : null;
  if (canonicalUrl) {
    lines.push(`<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`);
  }

  // ---- Share preview (state-dependent) ----
  //
  // Emitted for every resolved vendor, INCLUDING internal ones: a noindex page
  // can still be shared in a message, and the person receiving it deserves a
  // card that says what it is. Only vendor_not_found (handled above) gets none.
  const drop = data.drop && typeof data.drop === "object"
    ? (data.drop as Record<string, unknown>)
    : null;
  const state = typeof data.state === "string" ? data.state : null;
  const shareTitle = buildShareTitle(state, normaliseText(drop?.name), name, town);
  const image = absoluteImageUrl(vendor.hero_image_url);

  if (name) {
    lines.push('<meta property="og:type" content="website" />');
    if (canonicalUrl) {
      lines.push(`<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />`);
    }
    // The VENDOR's name, never "Hearth". The card belongs to the vendor's
    // page; Hearth is the quiet frame and stays out of what gets shared.
    lines.push(`<meta property="og:site_name" content="${escapeHtml(name)}" />`);

    if (shareTitle) {
      lines.push(`<meta property="og:title" content="${escapeHtml(shareTitle)}" />`);
    }
    // The SAME computed string as <meta name="description">, not a second
    // derivation — so the search snippet and the share card cannot drift.
    if (description) {
      lines.push(`<meta property="og:description" content="${escapeHtml(description)}" />`);
    }
    if (image) {
      lines.push(`<meta property="og:image" content="${escapeHtml(image)}" />`);
      lines.push(`<meta property="og:image:alt" content="${escapeHtml(name)}" />`);
    }

    lines.push(
      `<meta name="twitter:card" content="${image ? TWITTER_CARD_WITH_IMAGE : TWITTER_CARD_TEXT_ONLY}" />`,
    );
    if (shareTitle) {
      lines.push(`<meta name="twitter:title" content="${escapeHtml(shareTitle)}" />`);
    }
    if (description) {
      lines.push(`<meta name="twitter:description" content="${escapeHtml(description)}" />`);
    }
    // No twitter:image — Twitter falls back to og:image, so emitting it would
    // be a second copy of the same URL to keep in step.
  }

  // Hearth's own test vendor records are real public URLs and must never enter
  // search results. Strict === true so an unexpected value reads as "real":
  // the safe failure is indexing a test page, not de-indexing a real vendor's
  // storefront. vendor.html's client-side noIndex() carries an idempotence
  // guard, so it no-ops when this tag is already present and still fires when
  // this function has degraded.
  const noindex = vendor.is_internal === true;
  if (noindex) lines.push(ROBOTS_NOINDEX);

  // ---- Structured data (state-independent) ----
  //
  // Suppressed on any noindex page: structured data exists to shape a search
  // result, so describing a page we have just asked search engines not to
  // index is at best pointless and at worst a mixed signal.
  if (!noindex) {
    const jsonLd = buildJsonLd(vendor, name, town, canonicalUrl, description, image);
    if (jsonLd) {
      lines.push(`<script type="application/ld+json">${jsonLd}</script>`);
    }
  }

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
