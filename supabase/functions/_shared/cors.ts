// Shared CORS allowlist for Hearth Edge Functions.
//
// Production is locked to https://lovehearth.co.uk. Netlify deploy
// previews for the spiffy-tulumba-848684 site are also allowed so
// pre-merge verification can hit Edge Functions from the preview
// domain. Any other origin gets no Access-Control-Allow-Origin header
// back, which causes the browser to block the response.
//
// Any new Edge Function should import getCorsHeaders from here rather
// than hardcoding an origin.

const ALLOWED_ORIGINS: ReadonlyArray<string | RegExp> = [
  "https://lovehearth.co.uk",
  /^https:\/\/[a-z0-9-]+--spiffy-tulumba-848684\.netlify\.app$/i,
];

const STATIC_CORS_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
} as const;

function isAllowedOrigin(origin: string): boolean {
  for (const entry of ALLOWED_ORIGINS) {
    if (typeof entry === "string") {
      if (entry === origin) return true;
    } else if (entry.test(origin)) {
      return true;
    }
  }
  return false;
}

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  if (origin && isAllowedOrigin(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Vary": "Origin",
      ...STATIC_CORS_HEADERS,
    };
  }
  return { ...STATIC_CORS_HEADERS };
}
