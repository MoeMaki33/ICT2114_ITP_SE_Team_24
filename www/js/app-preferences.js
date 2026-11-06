(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AppPreferences = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  const STORAGE_PREFIX = "corrosion-monitor:preferences:v1:";
  const CURRENT_USER_KEY = "corrosion-monitor:current-user";
  const LANDING_PAGES = Object.freeze(["dashboard.php", "weekly.php", "testpoints.php"]);
  const TABLE_ROW_OPTIONS = Object.freeze([10, 25, 50]);
  const CHART_MOTION_OPTIONS = Object.freeze(["system", "reduced"]);
  const DEFAULTS = Object.freeze({
    landingPage: "dashboard.php",
    tableRows: 25,
    chartMotion: "system",
  });

  function getStorage(storage) {
    return storage || root?.localStorage || null;
  }

  function normalizeUserId(userId) {
    const normalized = String(userId || "").trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized) ? normalized : "";
  }

  function sanitize(value = {}) {
    const tableRows = Number(value.tableRows);
    return {
      landingPage: LANDING_PAGES.includes(value.landingPage) ? value.landingPage : DEFAULTS.landingPage,
      tableRows: TABLE_ROW_OPTIONS.includes(tableRows) ? tableRows : DEFAULTS.tableRows,
      chartMotion: CHART_MOTION_OPTIONS.includes(value.chartMotion) ? value.chartMotion : DEFAULTS.chartMotion,
    };
  }

  function storageKey(userId) {
    const normalized = normalizeUserId(userId);
    return normalized ? `${STORAGE_PREFIX}${normalized}` : "";
  }

  function load(userId, storage) {
    const target = getStorage(storage);
    const key = storageKey(userId);
    if (!target || !key) return { ...DEFAULTS };
    try {
      return sanitize(JSON.parse(target.getItem(key) || "{}"));
    } catch (_error) {
      return { ...DEFAULTS };
    }
  }

  function save(userId, changes, storage) {
    const target = getStorage(storage);
    const key = storageKey(userId);
    const preferences = sanitize({ ...load(userId, target), ...(changes || {}) });
    if (!target || !key) return preferences;
    try {
      target.setItem(key, JSON.stringify(preferences));
    } catch (_error) {
      // Browser privacy modes can deny storage; the validated in-memory result is still usable.
    }
    return preferences;
  }

  function reset(userId, storage) {
    const target = getStorage(storage);
    const key = storageKey(userId);
    try {
      if (target && key) target.removeItem(key);
    } catch (_error) {
      // Reset remains safe when browser storage is unavailable.
    }
    return { ...DEFAULTS };
  }

  function setCurrentUserId(userId, storage) {
    const target = getStorage(storage);
    const normalized = normalizeUserId(userId);
    try {
      if (!target) return normalized;
      if (normalized) target.setItem(CURRENT_USER_KEY, normalized);
      else target.removeItem(CURRENT_USER_KEY);
    } catch (_error) {
      // Authentication continues even if optional preference storage is unavailable.
    }
    return normalized;
  }

  function getCurrentUserId(storage) {
    const target = getStorage(storage);
    try {
      return normalizeUserId(target?.getItem(CURRENT_USER_KEY));
    } catch (_error) {
      return "";
    }
  }

  function getCurrent(storage) {
    return load(getCurrentUserId(storage), storage);
  }

  return {
    STORAGE_PREFIX,
    CURRENT_USER_KEY,
    LANDING_PAGES,
    TABLE_ROW_OPTIONS,
    CHART_MOTION_OPTIONS,
    DEFAULTS,
    normalizeUserId,
    sanitize,
    storageKey,
    load,
    save,
    reset,
    setCurrentUserId,
    getCurrentUserId,
    getCurrent,
  };
});
