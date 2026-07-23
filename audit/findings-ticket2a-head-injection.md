# Findings — Ticket 2a PR1: per-vendor `<head>` injection

Audit run 2026-07-23 against `origin/main` @ `460b06e`, plus Netlify's live
documentation and read-only curl probes against the production
`get-vendor-page` Edge Function.

**Verdict: no stop. The mechanism is confirmed and the build can proceed.**
The one genuinely load-bearing unknown — whether a Netlify Edge Function
declared on `/{slug}` runs *before* the `_redirects` catch-all and can
therefore obtain the rewritten `vendor.html` response — is answered by
Netlify's documented request chain: **yes, edge functions run before
redirects, and `context.next()` walks the rest of the chain.**

---

## 1. The routing mechanism — the full `_redirects` rule set, in order

`_redirects` contains exactly two rules. Reproduced in full (comments elided):

| # | Source | Target | Status | Notes |
|---|--------|--------|--------|-------|
| 1 | `/landing.html` | `/` | 301 | Stale-bookmark catch for the pre-rename landing page. Cannot match a vendor slug — it is an exact, dotted, single path. |
| 2 | `/*` | `/vendor.html` | 200 | Non-forced rewrite. The documented catch-all. Must stay last. |

No other rule exists, and there is **no `netlify.toml` in the repo at all** —
build settings live in the Netlify UI. So the only rule that can match a
vendor slug path is rule 2.

Rule 2 is a **non-forced 200 rewrite** (no `!`). Netlify only reaches a
non-forced rule when nothing earlier in the chain has produced a response, so
every real file in the publish root (`order.html`, `brand-hearth.html`,
`assets/*`, `favicon.svg`, …) is served directly and rule 2 never fires for
them. This shadowing behaviour is what makes the catch-all safe today, and it
is the same property the edge function's path matching must respect.

The address bar is unchanged by a 200 rewrite, which is why `vendor.html`
reads its slug from `location.pathname`.

## 2. Edge function ↔ redirect interaction — **the critical unknown, resolved**

### Documented request chain

Netlify publishes the full order of operations
(`docs.netlify.com/resources/troubleshooting/request-chain`). Abridged to the
steps that matter here:

```
  …
  5.  Edge Functions (before cache)   ← our function runs HERE
  6.  Edge cache
  …
  10. Serverless functions
  11. Redirects / rewrites            ← _redirects is evaluated HERE
  12. Static files
  13. 404 handler
```

Edge functions sit at step 5; `_redirects` at step 11. **Edge functions run
before redirects.** The function therefore sees the request for `/{slug}`
exactly as the visitor made it — before the rewrite to `/vendor.html` — which
is precisely what is needed to read the slug from the path.

### How to obtain the origin HTML: `context.next()`

`context.next()` is documented as "invokes the next item in the request chain
and returns a `Promise` containing the `Response` from the origin". For a
request to `/gather` that means: continue past step 5 → the redirect engine at
step 11 matches the `/*` catch-all → the static `vendor.html` at step 12 is
served → that `Response` is handed back to the edge function.

So `await context.next()` yields the rewritten `vendor.html` HTML. This is the
mechanism, and it is the documented middleware pattern (Netlify's own example
is `const res = await next(); const text = await res.text(); return new
Response(text.toUpperCase(), res)`).

Three documented caveats, each checked against this design:

- *"If the edge function returns a response and terminates the request,
  redirects for that path do not occur."* — We never terminate. Every code
  path returns the response from `next()`, modified or not, so the redirect
  still happens.
- *"If you declare an edge function for the target path of a static routing
  rewrite, the page at the target path will be served but the edge function
  will not execute for rewritten requests."* — Our function is declared on
  `/{slug}`, **not** on `/vendor.html`, so this does not apply. (It is also
  the reason the function must not be declared on `/vendor.html`.)
- *"If the edge function uses `fetch()` or `URL()` for internal requests, a
  new request chain starts and matching edge functions run again."* — Our only
  `fetch()` is to `supabase.co`, an external host. No recursion is possible.

### Config mechanism: in-source `export const config`, **not** `netlify.toml`

Both mechanisms are supported. **In-source is the correct choice here**, for a
reason specific to this repo: there is no `netlify.toml`, so publish
directory, build command and all other build settings currently come from the
Netlify UI. Introducing a `netlify.toml` purely to declare an edge function
risks a config file that is *partially* specified silently taking precedence
over UI settings for the whole site — a large blast radius for a small
declaration. A file placed in the default `netlify/edge-functions/` directory
with an `export const config` block requires no repo-level build config at
all.

### The path pattern

Declared as:

```ts
export const config: Config = {
  path: ["/:slug", "/:slug/"],
  method: "GET",
  onError: "bypass",
};
```

`path` uses URLPattern syntax, where `:slug` matches **exactly one**
non-empty path segment and does not cross a `/`. Chosen over the regex
`pattern` option deliberately: the docs are inconsistent about whether
`pattern` takes a string or a `RegExp` and whether it is implicitly anchored,
and an unanchored pattern that matched a substring would intercept the whole
site. URLPattern's single-segment guarantee is unambiguous and needs no
anchoring.

What `path: "/:slug"` matches and does not match:

| Path | Matched by config? | Why |
|------|--------------------|-----|
| `/gather` | ✅ yes | one segment — the intended case |
| `/healthy-habits` | ✅ yes | one segment |
| `/gather/` | ✅ yes | covered by the second `"/:slug/"` entry |
| `/` | ❌ no | `:slug` requires a non-empty segment; the root is `index.html` |
| `/assets/hearth.css` | ❌ no | two segments |
| `/assets/vendors/…/logo.png` | ❌ no | multiple segments |
| `/.netlify/functions/…` | ❌ no | multiple segments |
| `/gather/menu` | ❌ no | two segments (and `vendor.html` already treats this as not-found) |
| `/order.html` | ⚠️ **yes — one segment** | see below |
| `/brand-hearth.html` | ⚠️ **yes — one segment** | see below |
| `/favicon.svg` | ⚠️ **yes — one segment** | see below |

URLPattern cannot express "one segment containing no dot", so every
root-level real file is still *matched by the declaration*. That residue is
closed in code rather than in config, by two independent guards, either of
which alone is sufficient:

1. **Dot rejection.** A slug containing `.` returns the origin response
   untouched before any work is done. Vendor slugs are created lowercase
   alphanumeric-plus-hyphen by `create-vendor`; none can contain a dot. This
   excludes every `*.html` page, `favicon.svg`, and `/vendor.html` itself.
2. **Marker check.** The function only rewrites a response whose body
   contains the exact literal `<title>Vendor</title>` — the served
   `vendor.html` head, verified to occur exactly once in the file. Any
   response that is not `vendor.html` is returned byte-identical, whatever the
   path. This also covers Netlify's extensionless resolution of
   `/order` → `order.html`, which the dot guard alone would miss.

The second guard is the important one: it makes "did the path pattern get it
right" non-load-bearing. The only page this function can alter is the page it
was built for.

`onError: "bypass"` is the platform-level backstop — documented as "skip the
erroring edge function and continue the request chain". If the function throws
in a way its own `try/catch` somehow misses, Netlify serves the origin page.

## 3. `get-vendor-page` — server-side callability

Source: `supabase/functions/get-vendor-page/index.ts`.
Config: `supabase/config.toml:211` → `verify_jwt = false`.

**Callable anonymously with no headers at all.** Verified by read-only curl
against production (no mutation — this is a pure read endpoint):

```
POST /functions/v1/get-vendor-page  {"slug":"gather"}   with apikey → 200
POST /functions/v1/get-vendor-page  {"slug":"gather"}   no headers   → 200
```

**No secrets are needed by the edge function.** The function will send the
publishable anon key anyway, for parity with the browser call path — it is the
same key already shipped in `assets/config.js` to every visitor and carries no
privilege. Nothing new needs to be set in Netlify's environment.

Request shape: `POST`, `Content-Type: application/json`, body `{ "slug": "…" }`
(the function also accepts `vendor_slug` or a uuid `vendor_id`).

Measured latency, production, three consecutive calls: **0.50s / 0.39s /
0.40s**. The build issues this call *concurrently* with `context.next()` rather
than serialised, so the added wall-clock is roughly
`max(origin, get-vendor-page) − origin`, not the sum.

### Response shape

States: `live_drop`, `full_drop`, `announced_drop`, `resting` (all HTTP 200,
all carrying a `vendor` block built by the same `buildVendorBlock`), and the
error case `{"error":"vendor_not_found"}` at HTTP 404. Note there is no
`state` key on the 404 — the error is signalled by `error`, which the build
maps to the spec's `vendor_not_found` case.

`vendor_not_found` covers both a missing vendor and an explicitly inactive one
— deliberately indistinguishable, so an anonymous caller cannot tell a
suspended vendor from one that never existed. The head injector inherits that
property for free by reading nothing else.

Fields available on the `vendor` block, of which PR1 needs five:

| Field | Present? | Used by PR1 |
|-------|----------|-------------|
| `display_name` | yes (falls back to `name` server-side) | ✅ title, description |
| `slug` | yes | ✅ canonical |
| `offer_statement` | yes, nullable | ✅ description, first precedence |
| `tagline` | yes, nullable | ✅ description, second precedence |
| `town` | yes, nullable | ✅ title, description fallback |
| `is_internal` | **yes** — `vendor.is_internal`, strict boolean | ✅ robots |
| `address`, `postcode`, `public_phone`, `public_email`, `logo_url`, `hero_image_url`, `brand`, `faq`, `catering_enabled`, `powered_by_hearth_visible` | yes | not used in PR1 (`hero_image_url` is PR2's `og:image`) |

`is_internal` exists and is exactly what the robots rule needs — no inference
required.

**PII:** the projection is already PII-safe by construction. `VENDOR_COLUMNS`
deliberately omits the account/login `email` and the private operational
`contact_phone`; the two contact fields it does carry are the explicitly
public `public_email` / `public_phone`, and PR1 reads neither. The edge
function touches no other data source — no Supabase table, no second endpoint.

Live probe of the two vendors named in the handoff:

```
gather          → resting, "Gather Cafe",   town "Southampton",
                  tagline set, offer_statement null, is_internal false
healthy-habits  → resting, "Healthy Habits", town "Broadstone",
                  tagline set, offer_statement null, is_internal false
nope-not-a-vendor → 404 {"error":"vendor_not_found"}
```

Both currently exercise the **tagline** description branch (no
`offer_statement` written yet), and both have a town, so both produce the
`{name} — {town}` title form.

> Note for Ed's deploy-preview check: the handoff predicts the title
> `Healthy Habits Cafe — Broadstone`, but the vendor's stored `display_name`
> is `Healthy Habits` (no "Cafe"). The served title will read
> **`Healthy Habits — Broadstone`**. The function renders what the vendor
> record says; the expectation is what needs correcting, not the code.

## 4. The existing `<head>`, verbatim

`vendor.html:1-13` as served today:

```html
<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Vendor</title>

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Figtree:wght@400;500;600&display=swap" />
  <script src="./assets/config.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

- The injection target is the exact literal `<title>Vendor</title>`, which
  occurs **exactly once** in the file (`grep -c` = 1, line 6). It is both the
  anchor and the marker, so no change to `vendor.html` is required — the file
  already contains a unique, stable string to key on.
- There is **no** description, canonical, robots, OG or Twitter tag to
  replace or preserve. PR1 adds; it removes nothing.
- Everything else in the head (charset, viewport, font preconnects,
  stylesheet, the two scripts) is left untouched.

### Two client-side behaviours the injection must compose with

Both already exist in `vendor.html` and both compose correctly — no change
needed to either:

- **`applyBrand()` (~:540)** runs `document.title = display_name` after the
  data loads. On a vendor with a town, the *served* title is
  `{name} — {town}` (what a crawler reads) while the *browser tab* settles to
  `{name}` once JS runs. Harmless, and arguably the nicer tab label. Flagged
  here rather than fixed: `vendor.html` is out of scope for this PR, and the
  crawler-facing string is the one this ticket exists to set.
- **`noIndex()` (~:556)** carries the guard
  `if (document.querySelector('meta[name="robots"]')) return;`. When the edge
  function has already injected the robots meta, the client-side call
  no-ops — the two paths do not duplicate the tag. When the edge function has
  degraded, the client-side path still fires. The client-side signal remains a
  real second line of defence for internal vendors.

## 5. Existing robots / SEO configuration

Reported, not built — this is Ticket 2d territory.

- **No `robots.txt`** at the repo root.
- **No `sitemap.xml`**, and no sitemap generation anywhere.
- **No `<link rel="canonical">`** on any page in the repo (grep across all
  `*.html`: zero hits).
- **No Open Graph or Twitter card tags** on any page (zero hits for `og:`
  outside an unrelated JS identifier in `activation.html`).
- The only `robots` reference in the codebase is the client-side
  `noIndex()` in `vendor.html` described above.

So PR1 introduces the platform's first canonical tag and its first
server-rendered robots directive, on one page only. Nothing pre-existing
conflicts with it.

---

## Build decisions locked by this audit

1. In-source `export const config` in `netlify/edge-functions/`; **no
   `netlify.toml`** (avoids the UI-settings precedence risk).
2. `path: ["/:slug", "/:slug/"]`, `method: "GET"`, `onError: "bypass"`.
3. Origin HTML via `await context.next()`.
4. Two in-code exclusion guards — dot rejection, then the
   `<title>Vendor</title>` marker check — so a path-pattern miss cannot alter
   any other page.
5. `get-vendor-page` called concurrently with `next()`, capped by an
   `AbortSignal` timeout, with every failure falling through to the unmodified
   origin response.
6. `vendor.html` unchanged: the marker it needs already exists.

---

# Addendum — PR2: Open Graph, Twitter card, JSON-LD

Audited 2026-07-23 against `origin/main` @ `0d124a9` (PR1 merged and live),
with read-only probes against the production `get-vendor-page`.

PR1's mechanism, guards and degrade path are unchanged and not re-derived
here. PR2 only adds tags to the block PR1 already injects.

## 1. Drop fields per state

Probed live. Only two of the four states have a production fixture right now
— `live_drop` and `resting`. The other two are read from
`supabase/functions/get-vendor-page/index.ts` directly, which is authoritative
for the response shape.

| State | Live fixture | `drop.name` present? |
|---|---|---|
| `live_drop` | `eds-creamy-nuts` → drop **"Nuts gallore"** | ✅ yes, confirmed live |
| `resting` | `gather`, `healthy-habits`, and four internal vendors | n/a — no `drop` block at all |
| `full_drop` | none in production | ✅ yes, per source (index.ts, the `consumed >= total` branch) |
| `announced_drop` | none in production | ✅ yes, per source (index.ts, Priority 2 branch) |

**A drop title is available in every drop-bearing state**, as `drop.name`. The
copy spec's "no drop title" fallbacks are therefore a defensive path, not the
common one — but they are still reachable (`name` is nullable on `drops`), so
they are implemented and covered in the local harness.

Full `live_drop` drop block as returned for `eds-creamy-nuts`:

```json
"drop": { "slug": "nuts-gallore", "name": "Nuts gallore", "drop_intro": null,
          "closes_at": "2026-07-26T16:00:00+00:00",
          "delivery_start": "2026-07-26T18:00:00+00:00",
          "fulfilment_mode": "collection" },
"capacity": { "total": 40, "remaining": 39 }
```

`announced_drop` carries `opens_at` in place of `closes_at`; `full_drop` is
shaped exactly like `live_drop` with `capacity.remaining: 0`. **None of these
timestamps or capacity figures are used by PR2** — no state's share title
quotes a time or a number, so there is nothing here that can go stale between
the scrape and the read, and no capacity figure is restated outside the page
where it is computed live.

## 2. `hero_image_url` — absolute, and one live vendor has none

**Absolute.** Every value is a fully-qualified Supabase Storage URL on the
`https` scheme:

| Vendor | `hero_image_url` |
|---|---|
| `gather` | `https://tvqhhjvumgumyetvpgid.supabase.co/storage/v1/object/public/vendor-assets/gather/hero?v=1784283079452` |
| `healthy-habits` | **`null`** |
| `eds-creamy-nuts` | `https://…/vendor-assets/eds-creamy-nuts/hero?v=1783719968497` |

The cache-busting `?v=` suffix is part of the stored value and is passed
through untouched — it is a legitimate part of an absolute URL.

The code still tests for `^https?://` rather than trusting the shape, because
the column is free text written by an upload flow and a relative path would
yield a silently broken preview card. `http` is accepted as well as `https`;
no stored value uses it today.

**So the two states Ed will check on the preview split cleanly:** `/gather`
exercises the image path (`og:image` + `twitter:card: summary_large_image`),
`/healthy-habits` exercises the no-image path (no `og:image` at all,
`twitter:card: summary`). Both cases are live without needing a fixture.

## 3. `is_internal` — returned, and the only live-drop fixture is internal

Confirmed present on every success state (PR1 already reads it for `robots`).

Values observed: `gather` false, `healthy-habits` false; `eds-creamy-nuts`,
`southbury-farm-pizza`, `test-11`, `test-12`, `catering-direct` all **true**.

> **Consequence worth stating plainly for the preview check:**
> `eds-creamy-nuts` is the only production vendor with a live drop, and it is
> internal. So it is the only place to see a state-dependent `og:title` — and
> it will correctly emit **no JSON-LD**, because the page is noindex. That is
> the specified behaviour, not a bug. JSON-LD can only be seen on `/gather`
> or `/healthy-habits`, both of which are `resting`.

`test-vendor` and `big-ballz-catering` return `vendor_not_found` — either
renamed or deactivated. Not relevant to PR2, noted only so a future session
does not treat them as fixtures.

## 4. Field availability for JSON-LD

| JSON-LD key | Source | `gather` | `healthy-habits` | `eds-creamy-nuts` |
|---|---|---|---|---|
| `name` | `display_name` | ✅ | ✅ | ✅ |
| `url` | canonical (PR1) | ✅ | ✅ | ✅ |
| `description` | computed (PR1) | ✅ | ✅ | ✅ |
| `streetAddress` | `address` | `121 Wallace Avenue` | `199 Lower Blandford Rd` | — |
| `addressLocality` | `town` | `Southampton` | `Broadstone` | — |
| `postalCode` | `postcode` | `SO32 2RQ` | `BH18 8DH` | — |
| `telephone` | `public_phone` | — | — | — |
| `email` | `public_email` | — | — | — |
| `image` | `hero_image_url` | ✅ | — | ✅ |

So the two indexable vendors both exercise a **fully-populated
`PostalAddress`** with all three parts, and both omit `telephone` and `email`
entirely — no vendor has yet written a public phone or email. The
"omit absent keys" rule is therefore exercised on the live path from day one,
not only in the harness.

`eds-creamy-nuts` has no address parts at all, which is the case that omits
the whole `address` object — though being internal, it emits no JSON-LD
anyway.

**PII unchanged from PR1.** `public_phone` / `public_email` are the
explicitly public contact fields; the account/login `email` and the private
operational `contact_phone` are not in `get-vendor-page`'s projection at all
and cannot reach this function. PR2 adds no data source.
