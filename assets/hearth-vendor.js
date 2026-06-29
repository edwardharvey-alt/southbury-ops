// hearth-vendor.js — shared vendor resolution module
// Exposes window.HearthVendor.resolveVendor(_sb)
//
// Session-aware vendor resolution (T5-A5):
//   - Session is the primary source of identity. If a session exists,
//     the resolved vendor MUST match session.user.id via auth_user_id.
//     If no such vendor row exists, return null — never fall back to
//     another vendor by slug or by .limit(1). Silent wrong-vendor
//     loading is a data exposure risk.
//   - Localhost dev override: if no session exists AND a ?vendor=<slug>
//     URL param is provided, resolve by slug. This keeps the dev
//     workflow intact without weakening the production guarantee.
//   - Production: if no session exists, store the current URL in
//     sessionStorage and redirect to login.html.
//
// Returns null if no matching vendor is found. Callers must handle the
// null case with a clear "Vendor not found" error state.
//
// No .limit(1) fallback exists anywhere in this module. A failed
// auth-to-vendor link must surface as a clear error rather than silently
// loading someone else's vendor workspace.

(function () {
  async function resolveVendor(_sb) {
    var isLocal = window.location.hostname === 'localhost';
    var slugParam = new URLSearchParams(window.location.search).get('vendor');

    // Session first — session identity wins over any URL param.
    var { data: { session } } = await _sb.auth.getSession();

    if (session) {
      // T5-A3 P2 Half B: resolve the caller's own vendor row server-side via
      // the JWT-authenticated get-current-vendor EF instead of a direct anon
      // SELECT on vendors. Identity travels in the JWT (empty body).
      //   - 404  → valid session, no vendor row → return null (the
      //            security-correct null-on-no-row; NO .limit(1) / impersonation
      //            fallback). Callers handle null as "Vendor not found".
      //   - any other error → transient/unexpected; propagate rather than
      //            silently blanking as "not found".
      var { data, error } = await _sb.functions.invoke('get-current-vendor', { body: {} });
      if (error) {
        var status = error.context && error.context.status;
        if (status === 404) return null;
        throw error;
      }
      return data;
    }

    // No session — localhost dev override by slug param.
    // Known-broken after vendors_select_all REVOKE (T5-A3 P2): relies on
    // anon SELECT on vendors. Dev-only localhost path; real-login covers
    // the common case. Proper fix deferred to T6-2 (local dev env).
    if (isLocal && slugParam) {
      var { data: slugData, error: slugError } = await _sb
        .from('vendors')
        .select('*')
        .eq('slug', slugParam)
        .maybeSingle();
      if (slugError || !slugData) return null;
      return slugData;
    }

    // No session and no dev fallback — redirect to login.
    sessionStorage.setItem('hearth:redirect', window.location.href);
    window.location.href = '/login.html';
    return null;
  }

  // Postcode prefix helpers (T3-12a). Pure functions — used by Drop Studio
  // chip-input normalisation and order.html delivery-area validation. The
  // server-side equivalent lives inline in supabase/functions/create-order;
  // keep both implementations byte-identical to avoid drift.

  function normalisePostcodePrefix(input) {
    return (input || '').toUpperCase().replace(/\s+/g, ' ').trim();
  }

  function matchesAllowedPrefix(customerPostcode, allowedPrefixes) {
    if (!allowedPrefixes || allowedPrefixes.length === 0) return true;
    var normalised = (customerPostcode || '').toUpperCase().replace(/\s+/g, '');
    if (!normalised) return false;
    return allowedPrefixes.some(function (p) {
      var prefixNorm = (p || '').toUpperCase().replace(/\s+/g, '');
      return prefixNorm && normalised.startsWith(prefixNorm);
    });
  }

  window.HearthVendor = { resolveVendor: resolveVendor, normalisePostcodePrefix: normalisePostcodePrefix, matchesAllowedPrefix: matchesAllowedPrefix };
})();
