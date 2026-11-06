/**
 * reset-password.php (#46): runs BEFORE supabaseClient.js.
 *
 * 1. Keeps a copy of the URL, because supabase-js removes the tokens/errors
 *    from the address bar once it has read them.
 * 2. Starts a browser-session (Remember Me off) policy for the short-lived
 *    recovery session, so auth-storage.js doesn't discard it on arrival.
 */
(function () {
  window.CPM_RECOVERY_URL = window.location.href;
  const kind = window.PasswordFlows?.classifyRecoveryUrl?.(window.CPM_RECOVERY_URL);
  if (kind === "recovery") window.AppAuthStorage?.beginSession?.(false);
})();
