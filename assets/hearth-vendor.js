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
      var { data, error } = await _sb
        .from('vendors')
        .select('*')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      if (error || !data) return null;
      return data;
    }

    // No session — localhost dev override by slug param.
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

  window.HearthVendor = { resolveVendor };
})();
