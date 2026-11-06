(function () {
  const PAGE_SCRIPT_MAP = {
    "dashboard.php": ["js/chart-animation.js", "js/chart-protection-presentation.js", "js/table-sort-controller.js", "js/trend-presentation.js", "js/weekly-location-aggregator.js", "js/dashboard-weekly-model.js", "js/dashboard-layout.js", "js/dashboard-repository.js", "js/dashboard.js", "js/dashboard-customisation.js"],
    "testpoints.php": ["js/app-config.js", "js/app-config.local.js", "js/google-maps-loader.js", "js/asset-map-repository.js", "js/test-point-position-map-picker.js", "js/test-point-position-controller.js", "js/table-sort-controller.js", "js/trend-presentation.js", "js/testpoints.js"],
    "weekly.php": ["js/chart-animation.js", "js/chart-protection-presentation.js", "js/table-sort-controller.js", "js/trend-presentation.js", "js/weekly-location-aggregator.js", "js/weekly-daily-trend.js", "js/weekly.js"],
    "asset-map.php": ["js/app-config.js", "js/app-config.local.js", "js/google-maps-loader.js", "js/asset-map-repository.js", "js/test-point-position-map-picker.js", "js/test-point-position-controller.js", "js/schematic/schematic-layout.js", "js/schematic/schematic-view.js", "js/trend-presentation.js", "js/asset-map.js"],
    "history.php": ["js/chart-animation.js", "js/chart-protection-presentation.js", "js/history.js"],
    "settings.php": ["js/settings.js"],
    "admin.php": ["js/admin.js"],
    "testpoint-view.php": ["js/chart-animation.js", "js/chart-protection-presentation.js", "js/app-config.js", "js/app-config.local.js", "js/google-maps-loader.js", "js/asset-map-repository.js", "js/test-point-position-map-picker.js", "js/test-point-position-controller.js", "js/table-sort-controller.js", "js/trend-presentation.js", "js/weekly-location-aggregator.js", "js/weekly-daily-trend.js", "js/test-point-weekly-view.js", "js/test-point-location-view.js", "js/testpoint-view.js?v=20260720-003"],
    "testpoint-update.php": ["js/testpoint-update.js"],
  };
  const CHART_JS_CDN_SRC = "https://cdn.jsdelivr.net/npm/chart.js";
  const XLSX_CDN_SRC = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
  const CHART_JS_DEPENDENCY = {
    src: CHART_JS_CDN_SRC,
    name: "Chart.js",
    isReady: () => typeof window.Chart === "function",
  };
  const XLSX_DEPENDENCY = {
    src: XLSX_CDN_SRC,
    name: "XLSX",
    isReady: () => typeof window.XLSX?.read === "function" && typeof window.XLSX?.utils?.sheet_to_json === "function",
  };
  const PAGE_EXTERNAL_SCRIPT_MAP = {
    "dashboard.php": [CHART_JS_DEPENDENCY],
    "testpoints.php": [XLSX_DEPENDENCY],
    "weekly.php": [CHART_JS_DEPENDENCY],
    "history.php": [CHART_JS_DEPENDENCY],
    "testpoint-view.php": [CHART_JS_DEPENDENCY, XLSX_DEPENDENCY],
  };

  const PAGE_LIFECYCLES = {
    "dashboard.php": {
      init: () => {
        window.DashboardPage?.init?.();
        window.DashboardCustomisationPage?.init?.();
      },
      destroy: () => {
        window.DashboardCustomisationPage?.destroy?.();
        window.DashboardPage?.destroy?.();
      },
    },
    "testpoints.php": { init: () => window.TestPointsPage?.init?.(), destroy: () => window.TestPointsPage?.destroy?.() },
    "weekly.php": { init: () => window.WeeklyPage?.init?.(), destroy: () => window.WeeklyPage?.destroy?.() },
    "asset-map.php": { init: () => window.AssetMapPageLifecycle?.init?.(), destroy: () => window.AssetMapPageLifecycle?.destroy?.() },
    "history.php": { init: () => window.DataHistoryPage?.init?.(), destroy: () => window.DataHistoryPage?.destroy?.() },
    "settings.php": { init: () => window.SettingsPage?.init?.(), destroy: () => window.SettingsPage?.destroy?.() },
    "admin.php": { init: () => window.AdminPage?.init?.(), destroy: () => window.AdminPage?.destroy?.() },
    "testpoint-view.php": { init: () => window.TestPointViewPage?.init?.(), destroy: () => window.TestPointViewPage?.destroy?.() },
    "testpoint-update.php": { init: () => window.TestPointUpdatePage?.init?.(), destroy: () => window.TestPointUpdatePage?.destroy?.() },
  };
  const ALLOWED_RETURN_PAGES = new Map([
    ["asset-map.php", "Asset Map"],
    ["testpoints.php", "Test Points"],
    ["weekly.php", "Weekly Summary"],
    ["history.php", "Data History"],
    ["dashboard.php", "Dashboard"],
  ]);

  let isNavigating = false;
  let loadingTimer = null;
  let currentPage = getPageName(location.href);
  const scriptLoadPromises = new Map();

  function getPageName(url) {
    const parsed = new URL(url, location.href);
    return parsed.pathname.split("/").pop() || "index.php";
  }

  function normalizeReturnPage(value) {
    try {
      const raw = String(value || "").trim();
      if (!raw) return null;
      const url = new URL(raw, location.href);
      if (url.origin !== location.origin) return null;
      const page = getPageName(url.href);
      const expectedPath = new URL(page, new URL(".", location.href)).pathname;
      if (url.pathname !== expectedPath || !ALLOWED_RETURN_PAGES.has(page)) return null;
      return page;
    } catch (_error) {
      return null;
    }
  }

  function normalizeReturnSearch(value) {
    const raw = String(value || "").trim();
    if (!raw || raw.length > 2000) return "";
    const parameters = new URLSearchParams(raw.replace(/^\?/, ""));
    parameters.delete("returnTo");
    parameters.delete("returnSearch");
    const normalized = parameters.toString();
    return normalized ? `?${normalized}` : "";
  }

  function buildReturnUrl(returnTo, returnSearch = "") {
    const page = normalizeReturnPage(returnTo) || "testpoints.php";
    return `${page}${normalizeReturnSearch(returnSearch)}`;
  }

  function normalizeReturnTarget(target) {
    try {
      const url = new URL(String(target || ""), location.href);
      const page = normalizeReturnPage(url.href);
      return page ? buildReturnUrl(page, url.search) : null;
    } catch (_error) {
      return null;
    }
  }

  function getCurrentNavigationUrl() {
    return `${getPageName(location.href)}${normalizeReturnSearch(location.search)}`;
  }

  function createNextHistoryState(nextPage, options = {}) {
    if (options.preserveHistoryState) {
      return { ...(options.historyState || history.state || {}), page: nextPage };
    }
    return { page: nextPage, originUrl: getCurrentNavigationUrl() };
  }

  function buildTestPointDetailUrl(testPointId, { returnTo = getPageName(location.href), returnSearch = location.search } = {}) {
    const parameters = new URLSearchParams({
      id: String(testPointId || ""),
      returnTo: normalizeReturnPage(returnTo) || "testpoints.php",
    });
    const normalizedSearch = normalizeReturnSearch(returnSearch);
    if (normalizedSearch) parameters.set("returnSearch", normalizedSearch);
    return `testpoint-view.php?${parameters.toString()}`;
  }

  function getTestPointReturnContext(search = location.search) {
    const parameters = new URLSearchParams(search);
    const page = normalizeReturnPage(parameters.get("returnTo")) || "testpoints.php";
    const returnSearch = normalizeReturnSearch(parameters.get("returnSearch"));
    return {
      page,
      label: ALLOWED_RETURN_PAGES.get(page) || "Test Points",
      search: returnSearch,
      url: `${page}${returnSearch}`,
    };
  }

  function isInternalPageLink(anchor) {
    if (!anchor || anchor.target || anchor.hasAttribute("download") || anchor.dataset.noPjax === "true") return false;
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return false;
    const url = new URL(href, location.href);
    if (url.origin !== location.origin) return false;
    return Object.prototype.hasOwnProperty.call(PAGE_SCRIPT_MAP, getPageName(url.href));
  }

  function getContentRoot() {
    return document.querySelector(".main .content");
  }

  function markCurrentExtras() {
    document.querySelectorAll("body > *").forEach((element) => {
      if (["SCRIPT", "STYLE", "ASIDE", "MAIN"].includes(element.tagName)) return;
      element.classList.add("pjax-extra");
    });
  }

  function removeCurrentExtras() {
    document.querySelectorAll(".pjax-extra").forEach((element) => element.remove());
  }

  function extractPageParts(html) {
    const documentClone = new DOMParser().parseFromString(html, "text/html");
    const content = documentClone.querySelector(".main .content");
    const extras = [...documentClone.body.children].filter((element) =>
      !["SCRIPT", "STYLE", "ASIDE", "MAIN"].includes(element.tagName)
    );
    return {
      title: documentClone.querySelector("title")?.textContent || document.title,
      content,
      extras,
    };
  }

  function showPageLoadingState() {
    window.clearTimeout(loadingTimer);
    document.body.classList.add("is-page-navigating");
    loadingTimer = window.setTimeout(() => document.body.classList.add("show-page-loader"), 180);
  }

  function hidePageLoadingState() {
    window.clearTimeout(loadingTimer);
    document.body.classList.remove("is-page-navigating", "show-page-loader");
  }

  function updateActiveNavigation(url = location.href) {
    const page = getPageName(url);
    document.querySelectorAll(".sidebar-nav-link").forEach((link) => {
      const isActive = getPageName(link.href) === page;
      link.classList.toggle("active", isActive);
      if (isActive) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function focusNewContent() {
    const target = document.querySelector(".main .content h1, .main .content [tabindex], .main .content");
    if (!target) return;
    const previousTabIndex = target.getAttribute("tabindex");
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    if (previousTabIndex === null) target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
  }

  function hasUnsavedChanges() {
    if (window.AppNavigation?.hasUnsavedChanges) return window.AppNavigation.hasUnsavedChanges();
    if (window.dashboardController?.state?.isCustomising && window.dashboardController?.state?.isDirty) return true;
    return document.body.dataset.unsavedChanges === "true";
  }

  function confirmLeavingIfNeeded() {
    if (!hasUnsavedChanges()) return true;
    return window.confirm("You have unsaved changes. Leave this page?");
  }

  function getScriptIdentity(src) {
    const url = new URL(src, location.href);
    return `${url.origin}${url.pathname}`;
  }

  async function loadScriptOnce(src, { isReady = null, name = src } = {}) {
    if (isReady?.()) return;
    const targetUrl = new URL(src, location.href);
    const scriptIdentity = getScriptIdentity(targetUrl.href);
    if (scriptLoadPromises.has(scriptIdentity)) {
      await scriptLoadPromises.get(scriptIdentity);
      if (isReady && !isReady()) throw new Error(`${name} loaded but did not initialise.`);
      return;
    }

    const alreadyLoaded = [...document.scripts].some((script) => {
      if (!script.src) return false;
      const scriptUrl = new URL(script.src, location.href);
      return scriptUrl.origin === targetUrl.origin && scriptUrl.pathname === targetUrl.pathname;
    });
    if (alreadyLoaded) {
      if (!isReady || isReady()) return;
      throw new Error(`${name} is present but did not initialise.`);
    }

    const loadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = targetUrl.href;
      script.dataset.appScriptIdentity = scriptIdentity;
      script.onload = () => {
        if (isReady && !isReady()) {
          reject(new Error(`${name} loaded but did not initialise.`));
          return;
        }
        resolve();
      };
      script.onerror = () => {
        if (src.endsWith("app-config.local.js")) {
          console.warn(`${src} was not found. Continuing with default APP_CONFIG.`);
          resolve();
          return;
        }
        reject(new Error(`Unable to load ${src}`));
      };
      document.body.appendChild(script);
    });
    scriptLoadPromises.set(scriptIdentity, loadPromise);
    try {
      await loadPromise;
    } finally {
      scriptLoadPromises.delete(scriptIdentity);
    }
  }

  async function ensurePageDependencies(page) {
    const dependencies = PAGE_EXTERNAL_SCRIPT_MAP[page] || [];
    for (const dependency of dependencies) await loadScriptOnce(dependency.src, dependency);
  }

  async function ensurePageScripts(page) {
    await ensurePageDependencies(page);
    const scripts = PAGE_SCRIPT_MAP[page] || [];
    for (const script of scripts) await loadScriptOnce(script);
  }

  async function initialiseCurrentPage(page) {
    await ensurePageScripts(page);
    await PAGE_LIFECYCLES[page]?.init?.();
  }

  async function destroyCurrentPage(page = currentPage) {
    await PAGE_LIFECYCLES[page]?.destroy?.();
  }

  async function navigateToPage(target, options = {}) {
    const url = new URL(target, location.href);
    const nextPage = getPageName(url.href);
    if (!Object.prototype.hasOwnProperty.call(PAGE_SCRIPT_MAP, nextPage)) {
      location.href = url.href;
      return;
    }
    if (isNavigating) return;
    if (!confirmLeavingIfNeeded()) return;

    const contentRoot = getContentRoot();
    if (!contentRoot) {
      location.href = url.href;
      return;
    }

    isNavigating = true;
    showPageLoadingState();
    contentRoot.classList.add("is-leaving");

    try {
      await destroyCurrentPage();
      const response = await fetch(url.href, { credentials: "same-origin" });
      // The server redirected (session expired -> index.php?expired=1, or a
      // role redirect). Follow it with a real navigation so the destination
      // and its query string are kept.
      if (response.redirected) {
        location.assign(response.url);
        return;
      }
      if (!response.ok) throw new Error(`Page request failed (${response.status}).`);
      const { title, content, extras } = extractPageParts(await response.text());
      if (!content) throw new Error("Destination page content was not found.");

      content.classList.add("is-entering");
      contentRoot.replaceWith(content);
      removeCurrentExtras();
      extras.forEach((element) => {
        element.classList.add("pjax-extra");
        document.body.appendChild(element);
      });

      document.title = title;
      const nextState = createNextHistoryState(nextPage, options);
      if (options.replace) history.replaceState(nextState, "", url.href);
      else history.pushState(nextState, "", url.href);
      currentPage = nextPage;
      document.body.dataset.unsavedChanges = "false";
      window.buildLayout?.();
      updateActiveNavigation(url.href);
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      await initialiseCurrentPage(nextPage);
      requestAnimationFrame(() => {
        content.classList.remove("is-entering");
        content.classList.add("is-ready");
      });
      focusNewContent();
    } catch (error) {
      console.error("Internal navigation failed:", error);
      window.AppToast?.error?.("Unable to load that page. Opening it normally...");
      location.assign(url.href);
    } finally {
      hidePageLoadingState();
      isNavigating = false;
    }
  }

  function navigateToReturn(target) {
    const normalizedTarget = normalizeReturnTarget(target) || "testpoints.php";
    const normalizedOrigin = normalizeReturnTarget(history.state?.originUrl);
    if (normalizedOrigin === normalizedTarget && history.length > 1) {
      history.back();
      return;
    }
    navigateToPage(normalizedTarget, { replace: true });
  }

  function bindEvents() {
    if (document.body.dataset.pjaxNavigationBound === "true") return;
    document.body.dataset.pjaxNavigationBound = "true";
    markCurrentExtras();

    document.addEventListener("click", (event) => {
      const anchor = event.target.closest("a[href]");
      if (!isInternalPageLink(anchor)) return;
      event.preventDefault();
      window.closeMobileNavigation?.({ restoreFocus: false });
      navigateToPage(anchor.href);
    });

    window.addEventListener("popstate", (event) => navigateToPage(location.href, {
      replace: true,
      preserveHistoryState: true,
      historyState: event.state,
    }));
    window.addEventListener("beforeunload", (event) => {
      if (!hasUnsavedChanges()) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  function init() {
    currentPage = getPageName(location.href);
    history.replaceState({ ...(history.state || {}), page: currentPage }, "", location.href);
    updateActiveNavigation();
    bindEvents();
  }

  window.AppNavigation = {
    init,
    navigateToPage,
    navigateToReturn,
    buildTestPointDetailUrl,
    getTestPointReturnContext,
    buildReturnUrl,
    normalizeReturnPage,
    updateActiveNavigation,
    registerLifecycle(page, lifecycle) {
      PAGE_LIFECYCLES[page] = lifecycle;
    },
    setUnsavedChanges(value) {
      document.body.dataset.unsavedChanges = String(Boolean(value));
    },
    hasUnsavedChanges: null,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
