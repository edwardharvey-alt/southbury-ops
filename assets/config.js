// assets/config.js
// Central config shared by all pages

window.HEARTH_CONFIG = {
  SUPABASE_URL: "https://tvqhhjvumgumyetvpgid.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_GftZ3Mw1M2-jb2bStjv80Q_gRDC9FzD",
  STRIPE_PUBLISHABLE_KEY: "pk_test_51TPHfyDdq1ydYXxzvZxiVzRARP46G6o1V72V8pVw9Jvfb3BbpG1xlGDXSUNydCpXTYb3Tc76J8hkM8Gufs4tnhhq00lwmuhtUC"
};

// Singleton Supabase client with manual Authorization header attachment.
//
// Background: supabase-js does not reliably attach the user session JWT
// to outbound PostgREST requests when the apikey is in the new publishable
// format (sb_publishable_...). Without this manual handling, authenticated
// mutations silently fail with HTTP 204 / zero rows changed.
//
// This singleton:
//   1. Creates the client with persistSession + autoRefreshToken
//   2. Reads any existing session from localStorage on startup
//   3. If a session exists, sets Authorization: Bearer <jwt> on the rest
//      client's headers
//   4. Listens to onAuthStateChange to keep the header in sync as the
//      session changes (signin, signout, token refresh)
//
// Pages that use this singleton get authenticated mutations working.
// Pages that still call createClient() inline do NOT benefit and will
// continue to silently fail until migrated.
window._getHearthClient = function () {
  if (window._hearthClientInstance) {
    return window._hearthClientInstance;
  }

  var url = window.HEARTH_CONFIG.SUPABASE_URL;
  var anonKey = window.HEARTH_CONFIG.SUPABASE_ANON_KEY;

  var client = window.supabase.createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });

  // Apply a session's JWT to all outbound REST requests, or remove the
  // override if there's no session (so the library falls back to the
  // apikey as Bearer, the documented unauthenticated behaviour).
  function applyAuthHeader(session) {
    if (!client.rest || !client.rest.headers) return;
    if (session && session.access_token) {
      client.rest.headers["Authorization"] = "Bearer " + session.access_token;
    } else {
      delete client.rest.headers["Authorization"];
    }
  }

  // On startup, check for an existing persisted session and apply it.
  client.auth.getSession().then(function (result) {
    var session = result && result.data ? result.data.session : null;
    applyAuthHeader(session);
  });

  // Keep the header in sync as the session changes.
  client.auth.onAuthStateChange(function (event, session) {
    applyAuthHeader(session);
  });

  window._hearthClientInstance = client;
  return client;
};
