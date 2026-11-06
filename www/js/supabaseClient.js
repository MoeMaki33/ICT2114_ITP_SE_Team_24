(function () {
  const configured = window.SUPABASE_CONFIG || {};
  const SUPABASE_URL = configured.url || '';
  const SUPABASE_PUBLISHABLE_KEY = configured.publishableKey || configured.anonKey || '';

  function hasSupabaseConfig() {
    return (
      SUPABASE_URL.startsWith('https://') &&
      !SUPABASE_URL.includes('YOUR_PROJECT_REF') &&
      SUPABASE_PUBLISHABLE_KEY.length > 40 &&
      !SUPABASE_PUBLISHABLE_KEY.includes('YOUR_SUPABASE_PUBLISHABLE_KEY')
    );
  }

  window.isSupabaseConfigured = hasSupabaseConfig;

  if (!window.supabase) {
    console.warn('Supabase SDK was not loaded. Check the CDN script tag.');
    return;
  }

  if (!hasSupabaseConfig()) {
    console.warn('Supabase is not configured. Load js/config/supabase-config.js before js/supabaseClient.js.');
    return;
  }

  // Remember Me (#47): the auth session is stored through AppAuthStorage so
  // it follows the agreed policy (browser-session vs 14 days). See
  // js/auth-storage.js. auth-storage.js must be loaded before this file.
  const authOptions = { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true };
  if (window.AppAuthStorage) {
    authOptions.storage = window.AppAuthStorage.createStorageAdapter();
  } else {
    console.warn('js/auth-storage.js was not loaded before supabaseClient.js; Remember Me policy is not applied.');
  }

  window.appSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: authOptions });
})();
