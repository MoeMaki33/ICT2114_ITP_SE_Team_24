(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AppChartProtectionPresentation = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const DEFAULT_THRESHOLD_MV = -850;
  const PLUGIN_ID = "appProtectionPresentation";
  const COLORS = Object.freeze({
    protectedZone: "rgba(22, 163, 116, 0.10)",
    aboveZone: "rgba(218, 26, 53, 0.08)",
    protectedLine: "#087f68",
    aboveLine: "#c53f50",
    thresholdLine: "#9f3f4b",
    neutralLine: "#315f88",
    pointBorder: "#ffffff",
    transparent: "rgba(0, 0, 0, 0)",
  });

  function finiteNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function formatThreshold(thresholdMv) {
    const value = DEFAULT_THRESHOLD_MV;
    return `${Number.isInteger(value) ? value : Math.round(value * 10) / 10} mV`;
  }

  function resolveThresholdReference() {
    return { thresholdMv: DEFAULT_THRESHOLD_MV, definitive: true, source: "fixed", distinctThresholds: [DEFAULT_THRESHOLD_MV] };
  }

  function normalizeReference() {
    return resolveThresholdReference();
  }

  function isProtectedValue(valueMv, thresholdMv = DEFAULT_THRESHOLD_MV) {
    const value = finiteNumber(valueMv);
    const threshold = DEFAULT_THRESHOLD_MV;
    return value === null ? null : value <= threshold;
  }

  function getPointColor(valueMv, thresholdMv = DEFAULT_THRESHOLD_MV) {
    const protectedValue = isProtectedValue(valueMv, thresholdMv);
    if (protectedValue === null) return COLORS.transparent;
    return protectedValue ? COLORS.protectedLine : COLORS.aboveLine;
  }

  function getZoneLabels(reference) {
    const resolved = normalizeReference(reference);
    const threshold = formatThreshold(resolved.thresholdMv);
    if (resolved.definitive) {
      return {
        protected: `Protected zone ≤ ${threshold}`,
        above: `Above protection threshold > ${threshold}`,
        threshold: `Protection threshold: ${threshold}`,
        note: "Protection status still follows the application's existing Warning and Unprotected rules.",
      };
    }
    const mixed = resolved.source === "mixed";
    return {
      protected: `Baseline reference zone ≤ ${threshold}`,
      above: `Above baseline reference > ${threshold}`,
      threshold: `Baseline reference: ${threshold}`,
      note: mixed
        ? `Visible Test Points use different thresholds; these zones show the ${threshold} baseline for supporting interpretation only.`
        : `No shared Test Point threshold is available; these zones show the ${threshold} baseline for supporting interpretation only.`,
    };
  }

  function getPluginOptions(reference) {
    const resolved = normalizeReference(reference);
    return {
      thresholdMv: resolved.thresholdMv,
      definitive: resolved.definitive,
      protectedZoneColor: COLORS.protectedZone,
      aboveZoneColor: COLORS.aboveZone,
      thresholdLineColor: COLORS.thresholdLine,
    };
  }

  const zonePlugin = {
    id: PLUGIN_ID,
    beforeDraw(chart, _args, options = {}) {
      const chartArea = chart.chartArea;
      const scale = chart.scales?.[options.scaleId || "y"];
      const threshold = DEFAULT_THRESHOLD_MV;
      if (!chartArea || !scale || threshold === null) return;
      const thresholdPixel = scale.getPixelForValue(threshold);
      if (!Number.isFinite(thresholdPixel)) return;
      const split = Math.max(chartArea.top, Math.min(chartArea.bottom, thresholdPixel));
      chart.ctx.save();
      chart.ctx.fillStyle = options.aboveZoneColor || COLORS.aboveZone;
      chart.ctx.fillRect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, split - chartArea.top);
      chart.ctx.fillStyle = options.protectedZoneColor || COLORS.protectedZone;
      chart.ctx.fillRect(chartArea.left, split, chartArea.right - chartArea.left, chartArea.bottom - split);
      chart.ctx.restore();
    },
    afterDatasetsDraw(chart, _args, options = {}) {
      const chartArea = chart.chartArea;
      const scale = chart.scales?.[options.scaleId || "y"];
      const threshold = DEFAULT_THRESHOLD_MV;
      if (!chartArea || !scale || threshold === null) return;
      const thresholdPixel = scale.getPixelForValue(threshold);
      if (!Number.isFinite(thresholdPixel) || thresholdPixel < chartArea.top || thresholdPixel > chartArea.bottom) return;
      chart.ctx.save();
      chart.ctx.setLineDash([6, 5]);
      chart.ctx.strokeStyle = options.thresholdLineColor || COLORS.thresholdLine;
      chart.ctx.lineWidth = 2;
      chart.ctx.beginPath();
      chart.ctx.moveTo(chartArea.left, thresholdPixel);
      chart.ctx.lineTo(chartArea.right, thresholdPixel);
      chart.ctx.stroke();
      chart.ctx.restore();
    },
  };

  function createThresholdGradient(chart, thresholdMv = DEFAULT_THRESHOLD_MV) {
    const chartArea = chart?.chartArea;
    const scale = chart?.scales?.y;
    if (!chartArea || !scale || !chart?.ctx?.createLinearGradient) return COLORS.neutralLine;
    const thresholdPixel = scale.getPixelForValue(DEFAULT_THRESHOLD_MV);
    if (!Number.isFinite(thresholdPixel)) return COLORS.neutralLine;
    const height = Math.max(1, chartArea.bottom - chartArea.top);
    const stop = Math.max(0, Math.min(1, (thresholdPixel - chartArea.top) / height));
    const gradient = chart.ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, COLORS.aboveLine);
    gradient.addColorStop(stop, COLORS.aboveLine);
    gradient.addColorStop(stop, COLORS.protectedLine);
    gradient.addColorStop(1, COLORS.protectedLine);
    return gradient;
  }

  function getSegmentBorderColor(context, thresholdMv = DEFAULT_THRESHOLD_MV) {
    const first = finiteNumber(context?.p0?.parsed?.y);
    const second = finiteNumber(context?.p1?.parsed?.y);
    if (first === null || second === null) return COLORS.neutralLine;
    const firstProtected = isProtectedValue(first, thresholdMv);
    const secondProtected = isProtectedValue(second, thresholdMv);
    if (firstProtected === secondProtected) return firstProtected ? COLORS.protectedLine : COLORS.aboveLine;
    return createThresholdGradient(context.chart, thresholdMv);
  }

  function createSinglePointDatasetStyle(thresholdMv = DEFAULT_THRESHOLD_MV) {
    const threshold = DEFAULT_THRESHOLD_MV;
    return {
      borderColor: COLORS.protectedLine,
      backgroundColor: COLORS.transparent,
      fill: false,
      spanGaps: false,
      segment: {
        borderColor: (context) => getSegmentBorderColor(context, threshold),
      },
      pointBackgroundColor: (context) => getPointColor(context.raw, threshold),
      pointBorderColor: COLORS.pointBorder,
    };
  }

  function applyToChartConfig(config, reference) {
    if (!config) return config;
    config.plugins = [...(config.plugins || []).filter((plugin) => plugin?.id !== PLUGIN_ID), zonePlugin];
    config.options = config.options || {};
    config.options.plugins = config.options.plugins || {};
    config.options.plugins[PLUGIN_ID] = getPluginOptions(reference);
    return config;
  }

  function renderLegend(container, reference) {
    if (!container) return;
    const labels = getZoneLabels(reference);
    container.innerHTML = `
      <span><i class="chart-zone-swatch protected" aria-hidden="true"></i>${labels.protected}</span>
      <span><i class="chart-zone-swatch above" aria-hidden="true"></i>${labels.above}</span>
      <span><i class="chart-threshold-line-swatch" aria-hidden="true"></i>${labels.threshold}</span>
    `;
    container.setAttribute("aria-label", `${labels.protected}. ${labels.above}. ${labels.threshold}. ${labels.note}`);
  }

  return {
    DEFAULT_THRESHOLD_MV,
    PLUGIN_ID,
    COLORS,
    finiteNumber,
    resolveThresholdReference,
    isProtectedValue,
    getPointColor,
    getZoneLabels,
    getPluginOptions,
    zonePlugin,
    createThresholdGradient,
    getSegmentBorderColor,
    createSinglePointDatasetStyle,
    applyToChartConfig,
    renderLegend,
  };
});
