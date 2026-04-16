// hearth-vendor.js — shared vendor resolution module
// Exposes window.HearthVendor.resolveVendor(_sb)
//
// Session-aware vendor resolution (T5-A5):
//   - Localhost: honours ?vendor=<slug> URL param for dev convenience.
//     If no param is provided, falls through to the session path.
//   - Production: reads the authenticated session via _sb.auth.getSession().
//     If no session exists, stores the current URL in sessionStorage and
//     redirects to login.html. If a session exists, resolves the vendor
//     row linked to auth_user_id.
//
// Returns null if no matching vendor is found. Callers must handle the
// null case with a clear "Vendor not found" error state.

(function () {
  async function resolveVendor(_sb) {
    var isLocal = window.location.hostname === 'localhost';

    // Localhost dev override — honour ?vendor= param
    if (isLocal) {
      var param = new URLSearchParams(window.location.search).get('vendor');
      if (param) {
        var { data, error } = await _sb
          .from('vendors')
          .select('*')
          .eq('slug', param)
          .maybeSingle();
        if (error || !data) return null;
        return data;
      }
    }

    // Production — resolve via session
    var { data: { session } } = await _sb.auth.getSession();
    if (!session) {
      sessionStorage.setItem('hearth:redirect', window.location.href);
      window.location.href = '/login.html';
      return null;
    }

    var { data, error } = await _sb
      .from('vendors')
      .select('*')
      .eq('auth_user_id', session.user.id)
      .maybeSingle();

    if (error || !data) return null;
    return data;
  }

  window.HearthVendor = { resolveVendor };
})();
