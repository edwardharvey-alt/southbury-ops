// Shared CORS helper for Hearth Edge Functions.
//
// Returns headers that echo the request's Origin back if it matches the
// allowlist (production URL, or this project's Netlify preview pattern).
//
// Unmatched origins get headers minus Allow-Origin; browser blocks the
// response, server stays simple.

const PRODUCTION_ORIGIN = "https://lovehearth.co.uk";
const PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]+--spiffy-tulumba-848684\.netlify\.app$/i;

const isAllowed = (origin: string): boolean =>
  origin === PRODUCTION_ORIGIN || PREVIEW_ORIGIN.test(origin);

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (isAllowed(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}
