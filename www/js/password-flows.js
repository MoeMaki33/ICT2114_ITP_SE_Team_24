/**
 * Shared, testable logic for the password screens (#46):
 * forgot-password.php, reset-password.php and Settings -> change password.
 *
 * UMD like weekly-location-aggregator.js: attaches to window.PasswordFlows in
 * the browser and is require()-able from tests/password-flows.test.js.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PasswordFlows = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const MIN_PASSWORD_LENGTH = 8;
  const RESEND_COOLDOWN_SECONDS = 60;

  // Shown whether or not the account exists, so the form cannot be used to
  // discover which emails are registered.
  const NEUTRAL_RECOVERY_MESSAGE =
    "If an account exists for that email, we've sent a password reset link. Check your inbox and spam folder.";

  /** Same rules and wording as Settings (settings.js validatePassword). */
  function validatePassword(password, confirmation) {
    if (!password || !confirmation) return "Enter and confirm your new password.";
    if (password.length < MIN_PASSWORD_LENGTH) return `Your new password must contain at least ${MIN_PASSWORD_LENGTH} characters.`;
    if (password !== confirmation) return "The passwords do not match.";
    return "";
  }

  function normalizeEmail(value) {
    return String(value ?? "").trim().toLowerCase();
  }

  function isPlausibleEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
  }

  /** Supabase reauthentication codes are numeric; length is configurable (6 by default). */
  function normalizeVerificationCode(value) {
    return String(value ?? "").replace(/\s+/g, "");
  }

  function isValidVerificationCode(value) {
    return /^\d{6,10}$/.test(normalizeVerificationCode(value));
  }

  /** Seconds left before another email may be requested (0 = allowed now). */
  function cooldownRemaining(lastSentAtMs, nowMs, seconds = RESEND_COOLDOWN_SECONDS) {
    const sent = Number(lastSentAtMs);
    if (!Number.isFinite(sent) || sent <= 0) return 0;
    const remainingMs = sent + seconds * 1000 - Number(nowMs);
    return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
  }

  function readUrlParams(href) {
    let url;
    try {
      url = new URL(String(href || ""), "http://localhost/");
    } catch (error) {
      return new Map();
    }
    const params = new Map();
    url.searchParams.forEach((value, key) => params.set(key, value));
    // Supabase (implicit flow) puts tokens and errors in the fragment.
    new URLSearchParams(url.hash.replace(/^#/, "")).forEach((value, key) => params.set(key, value));
    return params;
  }

  /**
   * Classifies the link the user arrived with on reset-password.php.
   *   "expired"  - Supabase reported the link as expired
   *   "invalid"  - any other Supabase error (used, malformed, denied)
   *   "recovery" - looks like a recovery link; wait for PASSWORD_RECOVERY
   *   "missing"  - no recovery data at all (page opened directly)
   */
  function classifyRecoveryUrl(href) {
    const params = readUrlParams(href);
    const errorCode = String(params.get("error_code") || "").toLowerCase();
    const error = String(params.get("error") || "").toLowerCase();
    const description = String(params.get("error_description") || "").toLowerCase();

    if (errorCode || error) {
      if (errorCode === "otp_expired" || /expired/.test(description)) return "expired";
      return "invalid";
    }
    if (params.get("type") === "recovery" || params.has("access_token") || params.has("code") || params.has("token_hash")) {
      return "recovery";
    }
    return "missing";
  }

  /** The access token carried by an implicit-flow recovery link, if any. */
  function recoveryAccessToken(href) {
    return readUrlParams(href).get("access_token") || "";
  }

  /** Builds the absolute redirect URL for resetPasswordForEmail (works under a sub-folder, e.g. XAMPP). */
  function buildResetRedirectUrl(currentHref, baseUrl) {
    const base = String(baseUrl || "").trim();
    if (base) return new URL("reset-password.php", base.endsWith("/") ? base : `${base}/`).href;
    return new URL("reset-password.php", currentHref).href;
  }

  /** Turns Supabase auth errors into short, user-facing text (no internals). */
  function describeAuthError(error, fallback = "Something went wrong. Please try again.") {
    const message = String(error?.message || "");
    const code = String(error?.code || "");
    const status = Number(error?.status);
    if (code === "same_password" || /different from the old/i.test(message)) return "Choose a password you haven't used for this account before.";
    if (code === "weak_password" || /weak|pwned|leaked/i.test(message)) return "That password is too weak. Choose a longer, less common password.";
    if (code === "reauthentication_not_valid" || /nonce|reauthentication/i.test(message)) return "The verification code is incorrect or has expired. Request a new code.";
    if (code === "over_email_send_rate_limit" || status === 429 || /rate limit/i.test(message)) return "Too many emails were requested. Wait a few minutes and try again.";
    if (code === "session_not_found" || code === "session_expired" || /session/i.test(message) && /missing|expired|not found/i.test(message)) {
      return "Your reset session has expired. Request a new link.";
    }
    return fallback;
  }

  return {
    MIN_PASSWORD_LENGTH,
    RESEND_COOLDOWN_SECONDS,
    NEUTRAL_RECOVERY_MESSAGE,
    validatePassword,
    normalizeEmail,
    isPlausibleEmail,
    normalizeVerificationCode,
    isValidVerificationCode,
    cooldownRemaining,
    classifyRecoveryUrl,
    recoveryAccessToken,
    buildResetRedirectUrl,
    describeAuthError,
  };
});
