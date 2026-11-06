/**
 * reset-password.php (#46): set a new password from the recovery email link.
 *
 * States: checking -> form | expired | invalid. After a successful change the
 * user is signed out everywhere (Supabase global sign-out + PHP session) and
 * sent to index.php?reset=1.
 */
(function () {
  const Flows = window.PasswordFlows;
  const WAIT_FOR_RECOVERY_MS = 10000;
  const byId = (id) => document.getElementById(id);
  let currentState = "checking";
  let waitTimer = null;

  function showState(state) {
    currentState = state;
    window.clearTimeout(waitTimer);
    document.querySelectorAll("[data-reset-state]").forEach((element) => {
      element.hidden = element.dataset.resetState !== state;
    });
    if (state === "form") byId("resetNewPassword")?.focus();
  }

  function setStatus(message, type = "") {
    const status = byId("resetPasswordStatus");
    if (!status) return;
    status.textContent = message;
    status.className = `auth-form-status${type ? ` is-${type}` : ""}`;
  }

  function setBusy(busy) {
    const button = byId("resetPasswordButton");
    if (!button) return;
    button.disabled = busy;
    const label = button.querySelector("span");
    if (label) label.textContent = busy ? "Updating…" : "Update Password";
  }

  async function finishAndSignOut() {
    try {
      await window.appSupabase.auth.signOut({ scope: "global" });
    } catch (error) {
      console.warn("Global sign-out after reset failed:", error);
    }
    try {
      await fetch("php/clear-session.php", {
        method: "POST",
        headers: { "X-CPM-Request": "1" },
        credentials: "same-origin",
      });
    } catch (error) {
      console.warn("Failed to clear server-side session:", error);
    }
    window.AppAuthStorage?.clearAuthSession?.();
    ["userRole", "userFullName", "userInitials"].forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        /* ignore */
      }
    });
    window.location.replace("index.php?reset=1");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (currentState !== "form") return;

    const passwordInput = byId("resetNewPassword");
    const confirmInput = byId("resetConfirmPassword");
    const password = passwordInput?.value || "";
    const confirmation = confirmInput?.value || "";
    const validationMessage = Flows.validatePassword(password, confirmation);
    if (validationMessage) {
      setStatus(validationMessage, "error");
      (password.length < Flows.MIN_PASSWORD_LENGTH ? passwordInput : confirmInput)?.focus();
      return;
    }

    setBusy(true);
    setStatus("");
    try {
      const { error } = await window.appSupabase.auth.updateUser({ password });
      if (error) throw error;
      setStatus("Password updated. Redirecting to sign in…", "success");
      await finishAndSignOut();
    } catch (error) {
      const message = Flows.describeAuthError(error, "Unable to update your password. Please try again.");
      if (/reset session has expired/.test(message)) {
        showState("expired");
        return;
      }
      setStatus(message, "error");
      setBusy(false);
    } finally {
      if (passwordInput) passwordInput.value = "";
      if (confirmInput) confirmInput.value = "";
    }
  }

  function bindShowPassword() {
    byId("resetShowPassword")?.addEventListener("change", (event) => {
      const type = event.target.checked ? "text" : "password";
      ["resetNewPassword", "resetConfirmPassword"].forEach((id) => {
        const input = byId(id);
        if (input) input.type = type;
      });
    });
  }

  function start() {
    byId("resetPasswordForm")?.addEventListener("submit", handleSubmit);
    bindShowPassword();

    const linkKind = Flows.classifyRecoveryUrl(window.CPM_RECOVERY_URL || window.location.href);
    if (linkKind === "expired" || linkKind === "invalid") {
      showState(linkKind);
      return;
    }
    if (linkKind === "missing" || !window.appSupabase) {
      showState("invalid");
      return;
    }

    // A recovery link: supabase-js verifies it and fires PASSWORD_RECOVERY.
    // INITIAL_SESSION is only accepted when it is the session from this link,
    // never a session that was already stored in the browser.
    const linkToken = Flows.recoveryAccessToken(window.CPM_RECOVERY_URL || "");
    window.appSupabase.auth.onAuthStateChange((event, session) => {
      if (currentState !== "checking") return;
      if (event === "PASSWORD_RECOVERY") {
        showState("form");
      } else if (event === "INITIAL_SESSION") {
        if (session && linkToken && session.access_token === linkToken) showState("form");
        else if (!session) showState("invalid");
      }
    });
    waitTimer = window.setTimeout(() => {
      if (currentState === "checking") showState("invalid");
    }, WAIT_FOR_RECOVERY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
