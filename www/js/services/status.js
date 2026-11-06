(function () {
  const DEFAULT_PROTECTION_THRESHOLD_MV = -850;

  function parseMv(value) {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number.parseFloat(String(value).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(numeric) ? numeric : null;
  }

  function deriveProtectionStatus(valueMv, thresholdMv = DEFAULT_PROTECTION_THRESHOLD_MV) {
    const reading = parseMv(valueMv);
    // Keep the legacy argument for callers; stored/audit thresholds cannot
    // override the system-wide protection criterion.
    const threshold = DEFAULT_PROTECTION_THRESHOLD_MV;
    if (reading === null) {
      return { status: "Unknown", protectionStatus: "Unknown", displayStatus: "Unknown", isProtected: null };
    }
    if (reading <= threshold) {
      return { status: "Protected", protectionStatus: "Protected", displayStatus: "Protected", isProtected: true };
    }
    if (reading <= -800) {
      return { status: "Warning", protectionStatus: "Unprotected", displayStatus: "Warning", isProtected: false };
    }
    return { status: "Unprotected", protectionStatus: "Unprotected", displayStatus: "Unprotected", isProtected: false };
  }

  function statusClass(status) {
    if (status === "Protected") return "green-bg";
    if (status === "Warning") return "orange-bg";
    if (status === "Unprotected") return "red-bg";
    return "gray-bg";
  }

  const api = {
    DEFAULT_PROTECTION_THRESHOLD_MV,
    parseMv,
    deriveProtectionStatus,
    statusClass,
  };
  if (typeof window !== "undefined") window.AppStatus = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})();
