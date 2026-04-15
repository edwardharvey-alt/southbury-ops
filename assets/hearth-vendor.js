// hearth-vendor.js — shared vendor resolution module
// Exposes window.HearthVendor.resolveVendor(_sb)
//
// Resolves the active vendor using the canonical Hearth precedence:
//   1. ?vendor_id= URL param, or window.HEARTH_VENDOR_ID
//   2. ?vendor= / ?vendor_slug= URL param (tries slug then vendor_slug column)
//   3. First vendor in the database (dev-only fallback, reached only when
//      no slug was provided at all).
//
// If a slug was provided but no row matches, this function returns null —
// it never falls back to another vendor silently. Callers must handle the
// null case with a clear "Vendor not found" error state.

(function () {
  function getUrlParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  async function resolveVendor(_sb) {
    const explicitVendorId = getUrlParam('vendor_id') || window.HEARTH_VENDOR_ID || null;
    const explicitSlug = getUrlParam('vendor') || getUrlParam('vendor_slug') || null;

    if (explicitVendorId) {
      const { data, error } = await _sb.from('vendors').select('*').eq('id', explicitVendorId).maybeSingle();
      if (!error && data) return data;
    }

    if (explicitSlug) {
      const slugFields = ['slug', 'vendor_slug'];
      for (const field of slugFields) {
        try {
          const { data, error } = await _sb.from('vendors').select('*').eq(field, explicitSlug).maybeSingle();
          if (!error && data) return data;
        } catch (e) {}
      }
      // Slug was provided but no match found — do not fall back to
      // another vendor. Returning null lets the caller show a clear
      // "Vendor not found" error instead of silently loading the wrong
      // vendor's data.
      return null;
    }

    // Only reached when no slug was provided at all — dev convenience
    // fallback so the page loads against the first vendor in the DB.
    const { data, error } = await _sb.from('vendors').select('*').limit(1);
    if (error) throw error;
    return (data && data[0]) || null;
  }

  window.HearthVendor = { resolveVendor };
})();
