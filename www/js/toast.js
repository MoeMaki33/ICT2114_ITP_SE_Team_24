(function () {
  const DEFAULT_TIMEOUT = 4200;
  let toastRoot = null;

  function ensureToastRoot() {
    if (toastRoot) return toastRoot;
    toastRoot = document.getElementById("appToastRegion");
    if (!toastRoot) {
      toastRoot = document.createElement("div");
      toastRoot.id = "appToastRegion";
      toastRoot.className = "toast-region";
      toastRoot.setAttribute("aria-live", "polite");
      toastRoot.setAttribute("aria-atomic", "false");
      document.body.appendChild(toastRoot);
    }
    return toastRoot;
  }

  function iconForType(type) {
    return {
      success: "fa-circle-check",
      error: "fa-circle-exclamation",
      warning: "fa-triangle-exclamation",
      info: "fa-circle-info",
    }[type] || "fa-circle-info";
  }

  function show(message, options = {}) {
    const type = options.type || "info";
    const timeout = Number.isFinite(options.timeout) ? options.timeout : DEFAULT_TIMEOUT;
    const root = ensureToastRoot();
    const toast = document.createElement("article");
    toast.className = `app-toast ${type}`;
    toast.setAttribute("role", type === "error" ? "alert" : "status");
    toast.innerHTML = `
      <i class="fa-solid ${iconForType(type)}" aria-hidden="true"></i>
      <div class="app-toast-message"></div>
      <button class="app-toast-close" type="button" aria-label="Dismiss notification">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
    `;
    // Messages carry database errors and stored labels: always plain text, never HTML.
    toast.querySelector(".app-toast-message").textContent = String(message ?? "");

    let timer = null;
    const dismiss = () => {
      window.clearTimeout(timer);
      toast.classList.add("is-exiting");
      toast.addEventListener("animationend", () => toast.remove(), { once: true });
    };
    const startTimer = () => {
      if (timeout > 0) timer = window.setTimeout(dismiss, timeout);
    };

    toast.querySelector(".app-toast-close")?.addEventListener("click", dismiss);
    toast.addEventListener("mouseenter", () => window.clearTimeout(timer));
    toast.addEventListener("mouseleave", startTimer);
    root.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    startTimer();
    return { dismiss, element: toast };
  }

  function success(message, options) { return show(message, { ...options, type: "success" }); }
  function error(message, options) { return show(message, { ...options, type: "error" }); }
  function warning(message, options) { return show(message, { ...options, type: "warning" }); }
  function info(message, options) { return show(message, { ...options, type: "info" }); }

  function withButtonLoading(button, label = "Loading...") {
    if (!button || button.dataset.loading === "true") return () => {};
    const previousHtml = button.innerHTML;
    const previousDisabled = button.disabled;
    button.dataset.loading = "true";
    button.disabled = true;
    button.classList.add("is-loading");
    button.innerHTML = `<span class="button-spinner" aria-hidden="true"></span><span>${label}</span>`;
    return () => {
      button.innerHTML = previousHtml;
      button.disabled = previousDisabled;
      button.dataset.loading = "false";
      button.classList.remove("is-loading");
    };
  }

  window.AppToast = { show, success, error, warning, info, withButtonLoading };
})();
