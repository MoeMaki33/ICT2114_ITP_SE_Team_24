(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SettingsPage = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  let abortController = null;
  let currentPageRoot = null;
  let currentProfile = null;
  let initPromise = null;

  function byId(id) {
    return root.document?.getElementById(id) || null;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatRole(role, isSuperAdmin = false) {
    if (role === "admin") return isSuperAdmin ? "Super Admin" : "Admin";
    if (role === "corrosion_engineer") return "Corrosion Engineer";
    return String(role || "User").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function formatDate(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric" }).format(date);
  }

  function initials(name, email) {
    const parts = String(name || email || "User").trim().split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0]?.slice(0, 2) || "??").toUpperCase();
  }

  function validatePassword(password, confirmation) {
    if (!password || !confirmation) return "Enter and confirm your new password.";
    if (password.length < 8) return "Your new password must contain at least 8 characters.";
    if (password !== confirmation) return "The passwords do not match.";
    return "";
  }

  function setButtonBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
      button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> ${escapeHtml(label)}`;
      return;
    }
    button.disabled = false;
    if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
  }

  function showPasswordStatus(message, type = "") {
    const status = byId("settingsPasswordStatus");
    if (!status) return;
    status.textContent = message;
    status.className = `settings-form-status${type ? ` is-${type}` : ""}`;
  }

  function setProfileFields(profile) {
    const values = {
      settingsFullName: profile.fullName || "—",
      settingsEmail: profile.email || "—",
      settingsRole: formatRole(profile.role, profile.isSuperAdmin),
      settingsAccountStatus: profile.isActive ? "Active" : "Inactive",
    };
    Object.entries(values).forEach(([id, value]) => {
      const input = byId(id);
      if (input) input.value = value;
    });
  }

  function renderAccountOverview(profile) {
    const overview = byId("settingsAccountOverview");
    if (!overview) return;
    overview.setAttribute("aria-busy", "false");
    overview.innerHTML = `
      <div class="settings-overview-identity">
        <span class="settings-overview-avatar" aria-hidden="true">${escapeHtml(initials(profile.fullName, profile.email))}</span>
        <div>
          <p class="settings-eyebrow">Account Overview</p>
          <h2>${escapeHtml(profile.fullName || "Unnamed user")}</h2>
          <p>${escapeHtml(profile.email || "No email available")}</p>
        </div>
      </div>
      <dl class="settings-overview-facts">
        <div><dt>Role</dt><dd>${escapeHtml(formatRole(profile.role, profile.isSuperAdmin))}</dd></div>
        <div><dt>Status</dt><dd><span class="settings-status-badge ${profile.isActive ? "is-active" : "is-inactive"}">${profile.isActive ? "Active" : "Inactive"}</span></dd></div>
        <div><dt>Member since</dt><dd>${escapeHtml(formatDate(profile.createdAt))}</dd></div>
      </dl>`;
  }

  function renderProfileError(error) {
    const overview = byId("settingsAccountOverview");
    if (!overview) return;
    overview.setAttribute("aria-busy", "false");
    overview.innerHTML = `<div class="settings-error-state"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><div><strong>Account details could not be loaded.</strong><p>${escapeHtml(error?.message || "Please refresh and try again.")}</p></div></div>`;
  }

  function applyPreferencesToForm(preferences) {
    const landing = byId("settingsLandingPage");
    const rows = byId("settingsTableRows");
    const motion = byId("settingsChartMotion");
    if (landing) landing.value = preferences.landingPage;
    if (rows) rows.value = String(preferences.tableRows);
    if (motion) motion.value = preferences.chartMotion;
  }

  async function loadProfile(pageRoot, signal) {
    try {
      const repository = new root.AppRepositories.UserRepository();
      const profile = await repository.getCurrentUserProfile();
      if (signal.aborted || currentPageRoot !== pageRoot) return;
      currentProfile = profile;
      root.AppPreferences?.setCurrentUserId?.(profile.id);
      setProfileFields(profile);
      renderAccountOverview(profile);
      applyPreferencesToForm(root.AppPreferences?.load?.(profile.id) || root.AppPreferences?.DEFAULTS || {});
    } catch (error) {
      if (signal.aborted || currentPageRoot !== pageRoot) return;
      console.error("Settings profile load failed:", error);
      renderProfileError(error);
      root.AppToast?.error?.("Unable to load your account settings.");
    }
  }

  function bindPasswordToggles(signal) {
    root.document?.querySelectorAll("[data-password-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = byId(button.dataset.passwordToggle);
        if (!input) return;
        const shouldShow = input.type === "password";
        input.type = shouldShow ? "text" : "password";
        button.setAttribute("aria-pressed", String(shouldShow));
        button.setAttribute("aria-label", `${shouldShow ? "Hide" : "Show"} ${button.dataset.passwordToggle === "settingsConfirmPassword" ? "confirmed" : "new"} password`);
        const icon = button.querySelector("i");
        icon?.classList.toggle("fa-eye", !shouldShow);
        icon?.classList.toggle("fa-eye-slash", shouldShow);
      }, { signal });
    });
  }

  // Password change (#46): always two steps. 1) reauthenticate() emails a
  // code; 2) code + new password -> updateUser({ password, nonce }), then the
  // user's other sessions are signed out.
  const PASSWORD_CODE_COOLDOWN_SECONDS = 60;
  let codeSentAt = 0;
  let resendTimer = null;

  function passwordFlows() {
    return root.PasswordFlows || null;
  }

  function codeCooldownRemaining() {
    const flows = passwordFlows();
    if (flows) return flows.cooldownRemaining(codeSentAt, Date.now(), PASSWORD_CODE_COOLDOWN_SECONDS);
    const remainingMs = codeSentAt + PASSWORD_CODE_COOLDOWN_SECONDS * 1000 - Date.now();
    return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
  }

  function showPasswordStep(step) {
    const request = byId("settingsPasswordStepRequest");
    const change = byId("settingsPasswordStepChange");
    const actions = byId("settingsPasswordActions");
    if (request) request.hidden = step !== "request";
    if (change) change.hidden = step !== "change";
    if (actions) actions.hidden = step !== "change";
  }

  function clearPasswordInputs() {
    ["settingsVerificationCode", "settingsNewPassword", "settingsConfirmPassword"].forEach((id) => {
      const input = byId(id);
      if (input) input.value = "";
    });
  }

  function updateResendButton() {
    const button = byId("settingsResendCode");
    if (!button) return;
    const remaining = codeCooldownRemaining();
    const label = button.querySelector("span");
    button.disabled = remaining > 0;
    if (label) label.textContent = remaining > 0 ? `Resend Code (${remaining}s)` : "Resend Code";
    if (remaining === 0) {
      root.clearInterval?.(resendTimer);
      resendTimer = null;
    }
  }

  function startResendCountdown() {
    root.clearInterval?.(resendTimer);
    updateResendButton();
    resendTimer = root.setInterval?.(updateResendButton, 1000) ?? null;
  }

  function resetPasswordChange() {
    clearPasswordInputs();
    showPasswordStep("request");
  }

  async function sendVerificationCode(button) {
    if (codeCooldownRemaining() > 0) return;
    setButtonBusy(button, true, "Sending…");
    showPasswordStatus("Sending a verification code to your email…");
    try {
      const { error } = await root.appSupabase.auth.reauthenticate();
      if (error) throw error;
      codeSentAt = Date.now();
      showPasswordStep("change");
      const email = currentProfile?.email ? ` to ${currentProfile.email}` : "";
      showPasswordStatus(`We've emailed a verification code${email}. Enter it below with your new password.`, "success");
      byId("settingsVerificationCode")?.focus();
    } catch (error) {
      const message = passwordFlows()?.describeAuthError(error, "Unable to send a verification code. Please try again.")
        || error?.message || "Unable to send a verification code.";
      showPasswordStatus(message, "error");
      root.AppToast?.error?.(message);
    } finally {
      setButtonBusy(button, false);
      if (codeSentAt) startResendCountdown();
    }
  }

  function bindPasswordForm(signal) {
    byId("settingsSendCode")?.addEventListener("click", () => sendVerificationCode(byId("settingsSendCode")), { signal });
    byId("settingsResendCode")?.addEventListener("click", () => sendVerificationCode(byId("settingsResendCode")), { signal });
    byId("settingsCancelPasswordChange")?.addEventListener("click", () => {
      resetPasswordChange();
      showPasswordStatus("");
    }, { signal });

    byId("settingsPasswordForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (byId("settingsPasswordStepChange")?.hidden) return;

      const codeInput = byId("settingsVerificationCode");
      const passwordInput = byId("settingsNewPassword");
      const confirmInput = byId("settingsConfirmPassword");
      const flows = passwordFlows();
      const nonce = flows ? flows.normalizeVerificationCode(codeInput?.value) : String(codeInput?.value || "").trim();
      const password = passwordInput?.value || "";
      const confirmation = confirmInput?.value || "";

      if (flows ? !flows.isValidVerificationCode(nonce) : !nonce) {
        showPasswordStatus("Enter the verification code from your email.", "error");
        codeInput?.focus();
        return;
      }
      const validationMessage = validatePassword(password, confirmation);
      if (validationMessage) {
        showPasswordStatus(validationMessage, "error");
        (password.length < 8 ? passwordInput : confirmInput)?.focus();
        return;
      }

      const button = byId("settingsChangePassword");
      setButtonBusy(button, true, "Changing…");
      showPasswordStatus("Updating your password…");
      try {
        const { error } = await root.appSupabase.auth.updateUser({ password, nonce });
        if (error) throw error;
        // Revokes the refresh tokens of the user's other sessions. Access
        // tokens already issued stay valid until they expire (see #46/#48).
        const { error: signOutError } = await root.appSupabase.auth.signOut({ scope: "others" });
        if (signOutError) console.warn("Signing out other sessions failed:", signOutError);
        resetPasswordChange();
        codeSentAt = 0;
        updateResendButton();
        showPasswordStatus("Password changed successfully. Other devices have been signed out.", "success");
        root.AppToast?.success?.("Password changed successfully.");
      } catch (error) {
        const message = flows?.describeAuthError(error, error?.message || "Unable to change your password.")
          || error?.message || "Unable to change your password.";
        showPasswordStatus(message, "error");
        root.AppToast?.error?.(message);
        if (passwordInput) passwordInput.value = "";
        if (confirmInput) confirmInput.value = "";
      } finally {
        setButtonBusy(button, false);
      }
    }, { signal });
  }

  function bindPreferenceActions(signal) {
    byId("settingsPreferencesForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const userId = currentProfile?.id || root.AppPreferences?.getCurrentUserId?.();
      const saved = root.AppPreferences?.save?.(userId, {
        landingPage: byId("settingsLandingPage")?.value,
        tableRows: Number(byId("settingsTableRows")?.value),
        chartMotion: byId("settingsChartMotion")?.value,
      });
      if (!saved) {
        root.AppToast?.error?.("Preferences could not be saved in this browser.");
        return;
      }
      applyPreferencesToForm(saved);
      root.AppToast?.success?.("Workspace preferences saved.");
    }, { signal });

    byId("settingsResetPreferences")?.addEventListener("click", () => {
      if (!root.confirm("Reset your interface preferences to their defaults?")) return;
      const userId = currentProfile?.id || root.AppPreferences?.getCurrentUserId?.();
      const defaults = root.AppPreferences?.reset?.(userId) || root.AppPreferences?.DEFAULTS;
      applyPreferencesToForm(defaults || {});
      root.AppToast?.success?.("Interface preferences reset.");
    }, { signal });
  }

  function bindDashboardReset(signal) {
    byId("settingsResetDashboard")?.addEventListener("click", async () => {
      if (!root.confirm("Reset your Dashboard card arrangement to the application default?")) return;
      const button = byId("settingsResetDashboard");
      setButtonBusy(button, true, "Resetting…");
      try {
        await new root.AppRepositories.DashboardLayoutRepository().resetLayout("main-dashboard");
        root.AppToast?.success?.("Dashboard layout reset. The default layout will appear the next time you open Dashboard.");
      } catch (error) {
        console.error("Dashboard layout reset failed:", error);
        root.AppToast?.error?.(error.message || "Unable to reset the Dashboard layout.");
      } finally {
        setButtonBusy(button, false);
      }
    }, { signal });
  }

  function bindSessionActions(signal) {
    byId("settingsSignOut")?.addEventListener("click", async () => {
      const button = byId("settingsSignOut");
      setButtonBusy(button, true, "Signing out…");
      try {
        await root.AppSession.signOut({ scope: "local" });
      } catch (error) {
        setButtonBusy(button, false);
        root.AppToast?.error?.(error.message || "Unable to sign out.");
      }
    }, { signal });

    byId("settingsSignOutAll")?.addEventListener("click", async () => {
      if (!root.confirm("Sign out on every device? You will need to sign in again everywhere.")) return;
      const button = byId("settingsSignOutAll");
      setButtonBusy(button, true, "Revoking sessions…");
      try {
        await root.AppSession.signOut({ scope: "global" });
      } catch (error) {
        setButtonBusy(button, false);
        root.AppToast?.error?.(error.message || "Unable to sign out on all devices.");
      }
    }, { signal });
  }

  function init() {
    const pageRoot = byId("settingsPage");
    if (!pageRoot) return Promise.resolve();
    if (currentPageRoot === pageRoot && abortController && !abortController.signal.aborted) return initPromise || Promise.resolve();

    destroy();
    currentPageRoot = pageRoot;
    abortController = new AbortController();
    const { signal } = abortController;
    bindPasswordToggles(signal);
    bindPasswordForm(signal);
    bindPreferenceActions(signal);
    bindDashboardReset(signal);
    bindSessionActions(signal);
    initPromise = loadProfile(pageRoot, signal);
    return initPromise;
  }

  function destroy() {
    clearPasswordInputs();
    root.clearInterval?.(resendTimer);
    resendTimer = null;
    abortController?.abort();
    abortController = null;
    currentPageRoot = null;
    currentProfile = null;
    initPromise = null;
  }

  const api = { init, destroy, validatePassword, formatRole, escapeHtml };

  if (root.document) {
    const initialiseDirectPage = () => {
      if ((root.location?.pathname?.split("/").pop() || "") === "settings.php") init();
    };
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", initialiseDirectPage, { once: true });
    else initialiseDirectPage();
  }

  return api;
});
