// assets/config.js
// Central config shared by all pages

window.HEARTH_CONFIG = {
  SUPABASE_URL: "https://tvqhhjvumgumyetvpgid.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_GftZ3Mw1M2-jb2bStjv80Q_gRDC9FzD",
  STRIPE_PUBLISHABLE_KEY: "pk_test_51TPHfyDdq1ydYXxzvZxiVzRARP46G6o1V72V8pVw9Jvfb3BbpG1xlGDXSUNydCpXTYb3Tc76J8hkM8Gufs4tnhhq00lwmuhtUC"
};

window._getHearthClient = function () {
  if (!window._hearthClientInstance) {
    window._hearthClientInstance = window.supabase.createClient(
      window.HEARTH_CONFIG.SUPABASE_URL,
      window.HEARTH_CONFIG.SUPABASE_ANON_KEY,
      { auth: { persistSession: true, autoRefreshToken: true } }
    );
  }
  return window._hearthClientInstance;
};
