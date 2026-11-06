/**
 * The one browser-side place for the Supabase project URL and publishable key.
 *
 * The publishable key is public by design; access is enforced by RLS.
 * Never put a secret or service-role key here (or anywhere under www/).
 * www/php/config.php holds the same values as its fallback for server-side
 * calls; tests/app-config.test.js checks that the two match.
 *
 * appBaseUrl is the app's root URL, used for auth email redirects
 * (password recovery). Leave it null to use the folder of the current page,
 * which works for localhost, XAMPP sub-folders and production alike.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SUPABASE_CONFIG = api.SUPABASE_CONFIG;
  root.getAppBaseUrl = () => api.resolveAppBaseUrl(api.SUPABASE_CONFIG, root.location);
})(typeof window !== "undefined" ? window : globalThis, function () {
  const SUPABASE_CONFIG = Object.freeze({
    url: "https://pscwapylbjvulvsszdur.supabase.co",
    publishableKey: "sb_publishable_7UxNtTTNoHw27HfglZDy1w_2Q9hJTMV",
    appBaseUrl: null,
  });

  // Returns the base URL without a trailing slash, e.g. "http://localhost:5500",
  // so callers can append "/reset-password.php".
  function resolveAppBaseUrl(config, location) {
    const base = config && config.appBaseUrl ? config.appBaseUrl : new URL(".", location.href).href;
    return base.replace(/\/+$/, "");
  }

  return { SUPABASE_CONFIG, resolveAppBaseUrl };
});
