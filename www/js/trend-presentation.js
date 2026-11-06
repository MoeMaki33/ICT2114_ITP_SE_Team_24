(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AppTrendPresentation = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const STABLE_TOLERANCE_MV = 5;

  function finiteNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizeSemantic(value) {
    const normalized = String(value || "").trim().toLocaleLowerCase().replace(/[\s_-]+/g, "");
    if (["improved", "improving"].includes(normalized)) return "improved";
    if (["worsened", "declined", "declining", "worsening"].includes(normalized)) return "worsened";
    if (normalized === "stable") return "stable";
    return "";
  }

  function formatDelta(deltaMv) {
    const number = finiteNumber(deltaMv);
    if (number === null) return "—";
    const rounded = Math.round(number);
    return `${rounded > 0 ? "+" : ""}${rounded} mV`;
  }

  function getTrendPresentation({
    deltaMv,
    semanticStatus = "",
    context = "comparison",
    stableToleranceMv = STABLE_TOLERANCE_MV,
  } = {}) {
    const number = finiteNumber(deltaMv);
    let semantic = normalizeSemantic(semanticStatus);
    if (number === null) semantic = "unknown";
    else if (!semantic) {
      if (Math.abs(number) <= Math.abs(Number(stableToleranceMv) || STABLE_TOLERANCE_MV)) semantic = "stable";
      else semantic = number < 0 ? "improved" : "worsened";
    }

    const definitions = {
      improved: { iconClass: "fa-arrow-trend-up", label: "Improved" },
      worsened: { iconClass: "fa-arrow-trend-down", label: "Worsened" },
      stable: { iconClass: "fa-minus", label: "Stable" },
      unknown: { iconClass: "fa-circle-minus", label: context === "week" ? "No weekly change" : "No comparison" },
    };
    const definition = definitions[semantic] || definitions.unknown;
    const value = formatDelta(number);
    return {
      semantic,
      iconClass: definition.iconClass,
      label: definition.label,
      className: `app-trend-${semantic}`,
      value,
      accessibleText: number === null ? definition.label : `${value}, ${definition.label}`,
    };
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    }[character]));
  }

  function renderTrendValue(options = {}) {
    const model = getTrendPresentation(options);
    return `<span class="app-trend ${model.className}" aria-label="${escapeHtml(model.accessibleText)}">
      <i class="fa-solid ${model.iconClass}" aria-hidden="true"></i>
      <span><strong>${escapeHtml(model.value)}</strong><small>${escapeHtml(model.label)}</small></span>
    </span>`;
  }

  return {
    STABLE_TOLERANCE_MV,
    formatDelta,
    getTrendPresentation,
    renderTrendValue,
  };
});
