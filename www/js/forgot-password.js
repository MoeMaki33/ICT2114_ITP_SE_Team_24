/**
 * forgot-password.php (#46): request a password reset email.
 * Always shows the same neutral message so the form can't reveal whether an
 * account exists. The button is disabled for 60 s after each request; the
 * timestamp is kept in localStorage so a page refresh doesn't skip the wait.
 */
(function () {
  const Flows = window.PasswordFlows;
  const LAST_SENT_KEY = "cpm.recoveryEmailSentAt";
  let countdownTimer = null;

  const byId = (id) => document.getElementById(id);

  function setStatus(message, type = "") {
    const status = byId("forgotPasswordStatus");
    if (!status) return;
    status.textContent = message;
    status.className = `auth-form-status${type ? ` is-${type}` : ""}`;
  }

  function readLastSent() {
    try {
      return Number(localStorage.getItem(LAST_SENT_KEY)) || 0;
    } catch (error) {
      return 0;
    }
  }

  function writeLastSent(value) {
    try {
      localStorage.setItem(LAST_SENT_KEY, String(value));
    } catch (error) {
      /* storage blocked: the in-page countdown still applies */
    }
  }

  function setButtonLabel(text) {
    const label = byId("sendResetLink")?.querySelector("span");
    if (label) label.textContent = text;
  }

  function startCooldown(lastSentAt) {
    const button = byId("sendResetLink");
    if (!button) return;
    window.clearInterval(countdownTimer);

    const tick = () => {
      const remaining = Flows.cooldownRemaining(lastSentAt, Date.now());
      if (remaining > 0) {
        button.disabled = true;
        setButtonLabel(`Resend available in ${remaining}s`);
        return;
      }
      window.clearInterval(countdownTimer);
      button.disabled = false;
      setButtonLabel("Send Reset Link");
    };
    tick();
    countdownTimer = window.setInterval(tick, 1000);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const input = byId("recoveryEmail");
    const email = Flows.normalizeEmail(input?.value);

    if (!Flows.isPlausibleEmail(email)) {
      setStatus("Enter a valid email address.", "error");
      input?.focus();
      return;
    }
    if (Flows.cooldownRemaining(readLastSent(), Date.now()) > 0) return;

    if (!window.appSupabase) {
      setStatus("Password reset is unavailable right now. Please try again later.", "error");
      return;
    }

    const button = byId("sendResetLink");
    button.disabled = true;
    setButtonLabel("Sending…");
    setStatus("");

    const sentAt = Date.now();
    writeLastSent(sentAt);
    try {
      const { error } = await window.appSupabase.auth.resetPasswordForEmail(email, {
        redirectTo: Flows.buildResetRedirectUrl(window.location.href, window.APP_BASE_URL),
      });
      // Supabase does not reveal unknown emails, but we also never show its
      // message unless it is a rate limit / delivery problem.
      if (error && (error.status === 429 || /rate limit/i.test(error.message || ""))) {
        setStatus(Flows.describeAuthError(error), "error");
      } else {
        if (error) console.warn("resetPasswordForEmail:", error.message);
        setStatus(Flows.NEUTRAL_RECOVERY_MESSAGE, "success");
        window.AppToast?.success?.("Check your email for the reset link.");
      }
    } catch (networkError) {
      console.warn("resetPasswordForEmail failed:", networkError);
      setStatus("Could not reach the server. Check your connection and try again.", "error");
    } finally {
      startCooldown(sentAt);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    byId("forgotPasswordForm")?.addEventListener("submit", handleSubmit);
    if (Flows.cooldownRemaining(readLastSent(), Date.now()) > 0) startCooldown(readLastSent());
  });
})();
