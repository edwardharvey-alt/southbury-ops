// assets/config.js
// Central config shared by all pages

window.HEARTH_CONFIG = {
  SUPABASE_URL: "https://tvqhhjvumgumyetvpgid.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_GftZ3Mw1M2-jb2bStjv80Q_gRDC9FzD",
  STRIPE_PUBLISHABLE_KEY: "pk_test_51TPHfyDdq1ydYXxzvZxiVzRARP46G6o1V72V8pVw9Jvfb3BbpG1xlGDXSUNydCpXTYb3Tc76J8hkM8Gufs4tnhhq00lwmuhtUC"
};

// Singleton Supabase client with per-request session JWT injection.
//
// Background: supabase-js does not reliably attach the user session JWT
// to outbound PostgREST requests when the apikey is in the new
// publishable format (sb_publishable_...). The prior workaround set the
// header asynchronously via auth.getSession().then(...), but this
// raced with the first batch of page queries — initial reads went out
// as anon and RLS silently denied any non-public data.
//
// This version injects the session JWT per-request via a global.fetch
// wrapper. Every PostgREST call reads the current session at fetch
// time and attaches Authorization: Bearer <jwt> if a session exists.
// Auth (/auth/v1/) and Storage requests are left untouched. Edge
// Functions (/functions/v1/) handle their own JWT attachment via
// supabase-js's invoke() and don't need help here.
window._getHearthClient = function () {
  if (window._hearthClientInstance) {
    return window._hearthClientInstance;
  }
  var url = window.HEARTH_CONFIG.SUPABASE_URL;
  var anonKey = window.HEARTH_CONFIG.SUPABASE_ANON_KEY;

  var client;

  client = window.supabase.createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    },
    global: {
      fetch: async function (input, init) {
        var requestUrl = typeof input === "string" ? input : (input && input.url) || "";
        if (requestUrl.indexOf("/rest/v1/") !== -1) {
          try {
            var result = await client.auth.getSession();
            var session = result && result.data ? result.data.session : null;
            if (session && session.access_token) {
              init = init || {};
              init.headers = new Headers(init.headers || {});
              init.headers.set("Authorization", "Bearer " + session.access_token);
            }
          } catch (e) { /* fall through with default headers */ }
        }
        return fetch(input, init);
      }
    }
  });

  window._hearthClientInstance = client;
  return client;
};
