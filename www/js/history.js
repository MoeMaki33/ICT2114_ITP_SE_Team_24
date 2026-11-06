const HISTORY_THRESHOLD_MV = -850;
const HISTORY_DEFAULT_RECORD_LIMIT = 500;
const HISTORY_FILTERED_RECORD_LIMIT = 20000;
const HISTORY_RECORD_PAGE_SIZE = 1000;
const HISTORY_MAX_COMPARED_TEST_POINTS = 4;
const HISTORY_CONDUCTIVITY_CHANGE_RATIO = 0.2;
const HISTORY_PH_JUMP_DELTA = 0.5;
const HISTORY_ENVIRONMENT_ANOMALY_GRANULARITY = "weekly";
const HISTORY_PH_NEUTRAL = 7;
const HISTORY_PH_LOW = 6.5;
const HISTORY_PH_HIGH = 8.5;
const HISTORY_TREND_COLORS = ["#0073bc", "#29b7ea", "#00857e", "#fdc82f", "#003a65", "#da1a35"];
const HISTORY_CONDUCTIVITY_UNIT = window.AppSettings.measurements.conductivity.unit;
const HISTORY_ENVIRONMENT_METRICS = {
  conductivity: { label: "Electric Conductivity", unit: HISTORY_CONDUCTIVITY_UNIT, color: "#0891b2", decimals: 0 },
  ph: { label: "pH", unit: "pH", color: "#7c3aed", decimals: 2 },
};
const HISTORY_PH_FILTER_LABELS = {
  "outside-neutral": "Outside 6.5-8.5",
  acidic: "Acidic (< 6.5)",
  alkaline: "Alkaline (> 8.5)",
};
const HISTORY_DATE_PRESETS = {
  today: "Today",
  last_week: "Last week",
  last_month: "Last month",
  last_3_months: "Last 3 months",
  last_6_months: "Last 6 months",
  last_12_months: "Last 12 months",
  custom: "Custom",
};
const historyRepository = {
  async listRecords({ from, to, limit = HISTORY_DEFAULT_RECORD_LIMIT } = {}) {
    if (!window.AppRepositories?.ReadingRepository) {
      throw new Error("Reading repository is not available.");
    }
    const repository = new window.AppRepositories.ReadingRepository();
    const readings = [];
    const cappedLimit = Math.max(1, Number(limit) || HISTORY_DEFAULT_RECORD_LIMIT);
    for (let offset = 0; offset < cappedLimit; offset += HISTORY_RECORD_PAGE_SIZE) {
      const pageLimit = Math.min(HISTORY_RECORD_PAGE_SIZE, cappedLimit - offset);
      const page = await repository.getHistoricalReadings({ from, to, limit: pageLimit, offset });
      readings.push(...page);
      if (page.length < pageLimit) break;
    }
    return readings.map((reading) => {
      const site = reading.siteName || "Not available";
      const asset = reading.location?.assetName || "—";
      const zone = reading.location?.zoneName || "—";
      const hasGps = Boolean(reading.position?.hasGps);
      const source = {
        manual: "Manual Entry",
        bulk: "CSV Upload",
        sensor: "Sensor Upload",
      }[reading.uploadMethod] || reading.uploadMethod || "Not available";
      const timestamp = reading.readingTimestamp || reading.createdAt;

      return {
        id: reading.id,
        batchId: reading.batchId,
        timestamp,
        timestampMs: new Date(timestamp).getTime(),
        testPointUuid: reading.testPointId,
        testPointId: reading.testPointDisplayId,
        name: reading.testPointLabel,
        asset,
        site,
        zone,
        reading: reading.valueMv,
        thresholdMvSnapshot: reading.thresholdMvSnapshot,
        temperature: reading.temperatureC,
        conductivity: reading.conductivity,
        ph: reading.ph,
        coordType: hasGps ? "GPS" : "Missing",
        source,
        uploadMethod: reading.uploadMethod,
        engineer: reading.enteredBy?.fullName || reading.enteredBy?.email || "Not available",
        assetPath: `${asset} / ${site} / ${zone}`,
        status: reading.status || deriveHistoryStatus(reading.valueMv, reading.thresholdMvSnapshot),
      };
    });
  },
};

const historyState = {
  records: [],
  processed: [],
  trendGranularity: "raw",
  selectedTrendTestPoints: [],
  trendMeta: "",
  page: 1,
  rowsPerPage: 25,
  sortKey: "timestamp",
  sortDirection: "desc",
  filters: { search: "", dateRange: "", fromDate: "", toDate: "", testPoint: "", asset: "", site: "", zone: "", status: "", coordType: "", source: "", engineer: "", min: "", max: "", minConductivity: "", phRange: "" },
  charts: {},
};
let historyAbortController = null;
let historyLoadRequestId = 0;
let historyDateInputTimer = null;

function deriveHistoryStatus(reading, thresholdMv = HISTORY_THRESHOLD_MV) {
  if (reading === null || reading === undefined || reading === "" || !Number.isFinite(Number(reading))) return "Missing";
  return window.AppStatus?.deriveProtectionStatus?.(reading, thresholdMv)?.displayStatus || "Unknown";
}

function uniqueSorted(records, key) {
  return [...new Set(records.map((record) => record[key]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

function escapeHistoryHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function fillSelect(id, values, label = "All", selectedValue = undefined) {
  const select = document.getElementById(id);
  if (!select) return "";
  const current = selectedValue ?? select.value;
  select.innerHTML = `<option value="">${escapeHistoryHtml(label)}</option>${values.map((value) => `<option value="${escapeHistoryHtml(value)}">${escapeHistoryHtml(value)}</option>`).join("")}`;
  select.value = values.includes(current) ? current : "";
  return select.value;
}

function getHistoryLocationScopedRecords(records = historyState.records) {
  const { asset, site, zone } = historyState.filters;
  return records.filter((record) => (
    (!asset || record.asset === asset) &&
    (!site || record.site === site) &&
    (!zone || record.zone === zone)
  ));
}

function syncHistoryLocationDependentFilters(changedKey) {
  if (changedKey === "asset") {
    historyState.filters.site = "";
    historyState.filters.zone = "";
  }
  if (changedKey === "site") historyState.filters.zone = "";
  if (["asset", "site", "zone"].includes(changedKey)) {
    historyState.filters.testPoint = "";
    historyState.selectedTrendTestPoints = [];
  }
}

function populateHistoryFilters() {
  const { records, filters } = historyState;
  filters.asset = fillSelect("historyAssetFilter", uniqueSorted(records, "asset"), "All assets", filters.asset);
  const siteRecords = filters.asset ? records.filter((record) => record.asset === filters.asset) : records;
  const siteOptions = uniqueSorted(siteRecords, "site");
  filters.site = fillSelect("historySiteFilter", siteOptions, "All sites", filters.site);
  fillHistorySiteOptions(siteOptions);
  const zoneRecords = siteRecords.filter((record) => !filters.site || record.site === filters.site);
  filters.zone = fillSelect("historyZoneFilter", uniqueSorted(zoneRecords, "zone"), "All zones", filters.zone);
  const scopedRecords = getHistoryLocationScopedRecords(records);
  filters.testPoint = fillSelect("historyTestPointFilter", uniqueSorted(scopedRecords, "testPointId"), "All test points", filters.testPoint);
  fillTrendTestPointOptions(scopedRecords);
  filters.status = fillSelect("historyStatusFilter", ["Protected", "Warning", "Unprotected", "Missing"], "All statuses", filters.status);
  filters.coordType = fillSelect("historyCoordFilter", uniqueSorted(records, "coordType"), "All coord types", filters.coordType);
  filters.source = fillSelect("historySourceFilter", uniqueSorted(records, "source"), "All sources", filters.source);
  filters.engineer = fillSelect("historyEngineerFilter", uniqueSorted(records, "engineer"), "All engineers", filters.engineer);
}

function fillHistorySiteOptions(values = []) {
  const container = document.getElementById("historySiteOptions");
  if (!container) return;
  const selected = historyState.filters.site;
  const options = [{ value: "", label: "All sites" }, ...values.map((value) => ({ value, label: value }))];
  container.innerHTML = options.length
    ? options.map((option) => `
      <button class="history-site-option ${option.value === selected ? "active" : ""}" type="button" data-history-site-option="${escapeHistoryHtml(option.value)}" aria-pressed="${option.value === selected ? "true" : "false"}">
        <span>${escapeHistoryHtml(option.label)}</span>
      </button>`).join("")
    : '<p class="history-dropdown-empty">No sites</p>';
}

function fillTrendTestPointOptions(records = getHistoryLocationScopedRecords()) {
  const container = document.getElementById("historyTrendTestPointOptions");
  if (!container) return;
  const options = historyState.filters.site ? uniqueSorted(records, "testPointId") : [];
  const optionSet = new Set(options);
  historyState.selectedTrendTestPoints = historyState.selectedTrendTestPoints.filter((value) => optionSet.has(value));
  const selected = new Set(historyState.selectedTrendTestPoints);
  container.innerHTML = options.length
    ? options.map((value) => `
      <label class="history-checkbox-option">
        <input type="checkbox" value="${escapeHistoryHtml(value)}" ${selected.has(value) ? "checked" : ""}>
        <span>${escapeHistoryHtml(value)}</span>
      </label>`).join("")
    : `<p class="history-dropdown-empty">${historyState.filters.site ? "No test points" : "Select a site first"}</p>`;
  updateHistoryDropdownLabels();
}

function matchesHistorySearch(record, term) {
  if (!term) return true;
  return [record.testPointId, record.name, record.asset, record.site, record.zone, record.engineer, record.source]
    .join(" ").toLowerCase().includes(term.toLowerCase());
}

function parseHistoryTimestamp(record) {
  const timestamp = Number.isFinite(record.timestampMs) ? record.timestampMs : new Date(record.timestamp).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isFiniteHistoryNumber(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function getHistoryDatasetBounds(records = historyState.records) {
  const timestamps = records.map(parseHistoryTimestamp).filter(Number.isFinite);
  if (!timestamps.length) return { start: null, end: null };
  return { start: Math.min(...timestamps), end: Math.max(...timestamps) };
}

function getDateInputStart(value) {
  if (!value) return null;
  const timestamp = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getDateInputEnd(value) {
  if (!value) return null;
  const timestamp = new Date(`${value}T23:59:59.999`).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function startOfHistoryDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfHistoryDay(value) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function getHistoryPresetBounds(dateRange) {
  const now = new Date();
  if (dateRange === "today") {
    return { start: startOfHistoryDay(now).getTime(), end: endOfHistoryDay(now).getTime() };
  }

  if (dateRange === "last_week") {
    const today = startOfHistoryDay(now);
    const weekday = today.getDay() || 7;
    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(today.getDate() - weekday + 1);
    const start = new Date(thisWeekStart);
    start.setDate(thisWeekStart.getDate() - 7);
    const end = new Date(thisWeekStart);
    end.setMilliseconds(-1);
    return { start: start.getTime(), end: end.getTime() };
  }

  const monthsByPreset = {
    last_month: 1,
    last_3_months: 3,
    last_6_months: 6,
    last_12_months: 12,
  };
  const months = monthsByPreset[dateRange];
  if (!months) return { start: null, end: null };

  const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  const start = new Date(end.getFullYear(), end.getMonth() - months + 1, 1, 0, 0, 0, 0);
  return { start: start.getTime(), end: end.getTime() };
}

function getActiveHistoryDateBounds() {
  const { dateRange, fromDate, toDate } = historyState.filters;
  const datasetBounds = getHistoryDatasetBounds();
  let start = null;
  let end = null;

  if (dateRange && HISTORY_DATE_PRESETS[dateRange] && dateRange !== "custom") {
    ({ start, end } = getHistoryPresetBounds(dateRange));
  } else if (dateRange && dateRange !== "custom" && datasetBounds.end !== null) {
    end = datasetBounds.end;
    start = end - Number(dateRange) * 24 * 60 * 60 * 1000;
  }

  if (dateRange === "custom" || fromDate || toDate) {
    start = getDateInputStart(fromDate);
    end = getDateInputEnd(toDate);
  }

  return { start, end };
}

function getHistoryFetchOptions() {
  const { start, end } = getActiveHistoryDateBounds();
  const hasDateFilter = start !== null || end !== null;
  return {
    from: start === null ? undefined : new Date(start).toISOString(),
    to: end === null ? undefined : new Date(end).toISOString(),
    limit: hasDateFilter ? HISTORY_FILTERED_RECORD_LIMIT : HISTORY_DEFAULT_RECORD_LIMIT,
    hasDateFilter,
  };
}

function setHistoryLoading(isLoading, message = "") {
  const lastUpdated = document.getElementById("historyLastUpdated");
  const refresh = document.getElementById("historyRefresh");
  if (lastUpdated && message) lastUpdated.textContent = message;
  if (refresh) {
    refresh.disabled = isLoading;
    refresh.classList.toggle("is-loading", isLoading);
  }
}

function inHistoryDateRange(record) {
  const { start, end } = getActiveHistoryDateBounds();
  if (start === null && end === null) return true;
  const timestamp = parseHistoryTimestamp(record);
  if (timestamp === null) return false;
  return (start === null || timestamp >= start) && (end === null || timestamp <= end);
}

function matchesHistoryPhFilter(record, filter) {
  if (!filter) return true;
  const value = Number(record.ph);
  if (!isFiniteHistoryNumber(record.ph)) return false;
  if (filter === "acidic") return value < HISTORY_PH_LOW;
  if (filter === "alkaline") return value > HISTORY_PH_HIGH;
  if (filter === "outside-neutral") return value < HISTORY_PH_LOW || value > HISTORY_PH_HIGH;
  return true;
}

function applyHistoryProcessing() {
  const f = historyState.filters;
  historyState.processed = historyState.records.filter((record) => (
    matchesHistorySearch(record, f.search) &&
    inHistoryDateRange(record) &&
    (!f.testPoint || record.testPointId === f.testPoint) &&
    (!f.asset || record.asset === f.asset) &&
    (!f.site || record.site === f.site) &&
    (!f.zone || record.zone === f.zone) &&
    (!f.status || record.status === f.status) &&
    (!f.coordType || record.coordType === f.coordType) &&
    (!f.source || record.source === f.source) &&
    (!f.engineer || record.engineer === f.engineer) &&
    (f.min === "" || Number(record.reading) >= Number(f.min)) &&
    (f.max === "" || Number(record.reading) <= Number(f.max)) &&
    (f.minConductivity === "" || (isFiniteHistoryNumber(record.conductivity) && Number(record.conductivity) >= Number(f.minConductivity))) &&
    matchesHistoryPhFilter(record, f.phRange)
  ));
  sortHistoryRecords();
  const maxPage = Math.max(1, Math.ceil(historyState.processed.length / historyState.rowsPerPage));
  historyState.page = Math.min(historyState.page, maxPage);
}

function statusClass(status) {
  return status === "Protected" ? "green-bg" : status === "Warning" ? "orange-bg" : status === "Unprotected" ? "red-bg" : "gray-bg";
}

function formatHistoryDate(value) {
  return new Date(value).toLocaleString("en-SG", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatHistoryNumeric(value, { decimals = null, unit = "" } = {}) {
  const number = Number(value);
  if (!isFiniteHistoryNumber(value)) return "N/A";
  const display = decimals === null ? String(value) : number.toFixed(decimals);
  return unit ? `${display} ${unit}` : display;
}

function formatHistoryDateInputLabel(value) {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" });
}

function getHistoryDateRangeLabel() {
  const { dateRange, fromDate, toDate } = historyState.filters;
  if (dateRange === "custom" || fromDate || toDate) {
    const fromLabel = formatHistoryDateInputLabel(fromDate);
    const toLabel = formatHistoryDateInputLabel(toDate);
    if (fromLabel && toLabel) return `${fromLabel} - ${toLabel}`;
    if (fromLabel) return `From ${fromLabel}`;
    if (toLabel) return `To ${toLabel}`;
    return "Custom";
  }
  return HISTORY_DATE_PRESETS[dateRange] || "All dates";
}

function getHistoryTrendTestPointLabel() {
  const selected = historyState.selectedTrendTestPoints;
  if (!selected.length) return historyState.filters.site ? "All site test points" : "All test points";
  if (selected.length === 1) return selected[0];
  return `${selected.length} test points`;
}

function getHistorySiteLabel() {
  return historyState.filters.site || "All sites";
}

function updateHistoryDropdownLabels() {
  const siteLabel = document.getElementById("historySiteLabel");
  const testPointLabel = document.getElementById("historyTrendTestPointLabel");
  const dateRangeLabel = document.getElementById("historyDateRangeLabel");
  const customDateFields = document.getElementById("historyCustomDateFields");
  if (siteLabel) siteLabel.textContent = getHistorySiteLabel();
  if (testPointLabel) testPointLabel.textContent = getHistoryTrendTestPointLabel();
  if (dateRangeLabel) dateRangeLabel.textContent = getHistoryDateRangeLabel();
  if (customDateFields) customDateFields.hidden = historyState.filters.dateRange !== "custom" && !historyState.filters.fromDate && !historyState.filters.toDate;
  document.querySelectorAll("[data-history-date-preset]").forEach((button) => {
    button.classList.toggle("active", button.dataset.historyDatePreset === historyState.filters.dateRange);
  });
}

function closeHistoryDropdowns(exceptId = "") {
  document.querySelectorAll(".history-dropdown-menu").forEach((menu) => {
    if (menu.id === exceptId) return;
    menu.hidden = true;
    document.querySelector(`[data-history-dropdown-toggle="${menu.id}"]`)?.setAttribute("aria-expanded", "false");
  });
}

function toggleHistoryDropdown(menuId) {
  const menu = document.getElementById(menuId);
  const toggle = document.querySelector(`[data-history-dropdown-toggle="${menuId}"]`);
  if (!menu || !toggle) return;
  const shouldOpen = menu.hidden;
  closeHistoryDropdowns(shouldOpen ? menuId : "");
  menu.hidden = !shouldOpen;
  toggle.setAttribute("aria-expanded", String(shouldOpen));
}

function sortHistoryRecords() {
  const order = { Protected: 0, Warning: 1, Unprotected: 2, Missing: 3 };
  const direction = historyState.sortDirection === "desc" ? -1 : 1;
  historyState.processed.sort((a, b) => {
    let av = a[historyState.sortKey];
    let bv = b[historyState.sortKey];
    const am = av === null || av === undefined || av === "";
    const bm = bv === null || bv === undefined || bv === "";
    if (am || bm) return am && bm ? 0 : am ? 1 : -1;
    if (historyState.sortKey === "timestamp") return (new Date(av) - new Date(bv)) * direction;
    if (["reading", "temperature", "conductivity", "ph"].includes(historyState.sortKey)) return (Number(av) - Number(bv)) * direction;
    if (historyState.sortKey === "status") return ((order[av] ?? 99) - (order[bv] ?? 99)) * direction;
    return String(av).localeCompare(String(bv), undefined, { sensitivity: "base", numeric: true }) * direction;
  });
}

function renderHistoryMetrics() {
  const records = historyState.processed;
  const valid = records.filter((record) => Number.isFinite(Number(record.reading)));
  const avg = valid.length ? Math.round(valid.reduce((sum, record) => sum + Number(record.reading), 0) / valid.length) : "—";
  const cards = [
    ["fa-bullseye", "blue", records.length, "Total Records", "In selected range"],
    ["fa-shield-halved", "green", records.filter((r) => r.status === "Protected").length, "Protected Readings", "≤ -850 mV"],
    ["fa-triangle-exclamation", "orange", records.filter((r) => r.status === "Warning").length, "Warning", "-800 to -850 mV"],
    ["fa-shield-virus", "red", records.filter((r) => r.status === "Unprotected").length, "Unprotected Readings", "> -800 mV"],
    ["fa-circle-question", "gray", records.filter((r) => r.status === "Missing").length, "Missing / Invalid", "No valid reading"],
    ["fa-arrow-trend-up", "orange", avg, "Average Reading", "mV across filtered"],
  ];
  document.getElementById("historyMetrics").innerHTML = cards.map(([icon, tone, value, label, caption]) => `
    <article class="dashboard-metric-card history-metric-card">
      <div class="stat-icon ${tone}"><i class="fa-solid ${icon}" aria-hidden="true"></i></div>
      <div><h2>${value}${Number.isFinite(value) && label === "Average Reading" ? " mV" : ""}</h2><p>${label}</p><span>${caption}</span></div>
    </article>`).join("");
}

function getTrendSourceRecords() {
  const selected = historyState.selectedTrendTestPoints;
  return historyState.processed
    .filter((record) => Number.isFinite(Number(record.reading)) && parseHistoryTimestamp(record) !== null)
    .filter((record) => !selected.length || selected.includes(record.testPointId))
    .sort((a, b) => parseHistoryTimestamp(a) - parseHistoryTimestamp(b));
}

function getTrendSeriesName(record) {
  return historyState.selectedTrendTestPoints.length ? record.testPointId : "Overall Average";
}

function getBucketStart(value, granularity) {
  const date = new Date(value);
  date.setSeconds(0, 0);
  if (granularity === "raw") return date;
  date.setHours(0, 0, 0, 0);
  if (granularity === "weekly") {
    const day = date.getDay() || 7;
    date.setDate(date.getDate() - day + 1);
  }
  return date;
}

function formatTrendDate(value, granularity, showYear = false) {
  const date = new Date(value);
  if (granularity === "raw") {
    return date.toLocaleString("en-SG", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return date.toLocaleDateString("en-SG", { day: "2-digit", month: "short", ...(showYear ? { year: "numeric" } : {}) });
}

function groupedTrend() {
  const records = getTrendSourceRecords();
  const granularity = historyState.trendGranularity;
  const years = new Set(records.map((record) => new Date(record.timestamp).getFullYear()).filter(Number.isFinite));
  const showYear = years.size > 1;
  const byBucket = new Map();
  const labelByBucket = new Map();
  const seriesNames = new Set();

  records.forEach((record) => {
    const bucketStart = getBucketStart(parseHistoryTimestamp(record), granularity);
    const bucketKey = bucketStart.toISOString();
    const seriesName = getTrendSeriesName(record);
    const key = `${bucketKey}|${seriesName}`;
    const group = byBucket.get(key) || { values: [], min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY, count: 0 };
    const value = Number(record.reading);
    group.values.push(value);
    group.min = Math.min(group.min, value);
    group.max = Math.max(group.max, value);
    group.count += 1;
    byBucket.set(key, group);
    labelByBucket.set(bucketKey, formatTrendDate(bucketStart, granularity, showYear));
    seriesNames.add(seriesName);
  });

  const bucketKeys = [...labelByBucket.keys()].sort((a, b) => new Date(a) - new Date(b));
  const sortedSeries = [...seriesNames].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const series = sortedSeries.map((name) => ({
    name,
    data: bucketKeys.map((bucketKey) => {
      const group = byBucket.get(`${bucketKey}|${name}`);
      if (!group?.values.length) return null;
      if (granularity === "raw" && historyState.selectedTrendTestPoints.length) return group.values[group.values.length - 1];
      return Math.round(group.values.reduce((sum, value) => sum + value, 0) / group.values.length);
    }),
    meta: bucketKeys.map((bucketKey) => byBucket.get(`${bucketKey}|${name}`) || null),
  }));

  const compared = historyState.selectedTrendTestPoints.length;
  historyState.trendMeta = records.length
    ? `${granularity === "raw" ? "Raw readings" : granularity === "daily" ? "Daily averages" : "Weekly averages"} · ${records.length} readings${compared ? ` · ${compared} test point${compared === 1 ? "" : "s"} compared` : " · overall average"}`
    : "No valid readings match the selected range.";

  return {
    labels: bucketKeys.map((key) => labelByBucket.get(key)),
    series,
    thresholdValues: records.map((record) => record.thresholdMvSnapshot),
  };
}

function getTrendYAxisBounds(trend, thresholdMv = HISTORY_THRESHOLD_MV) {
  const values = trend.series.flatMap((item) => item.data).filter((value) => Number.isFinite(Number(value)));
  values.push(Number(thresholdMv));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max(10, Math.ceil((max - min || 20) * 0.15));
  return {
    min: Math.floor((min - padding) / 10) * 10,
    max: Math.ceil((max + padding) / 10) * 10,
  };
}

function getEnvironmentalSourceRecords() {
  const seen = new Set();
  return historyState.processed
    .filter((record) => parseHistoryTimestamp(record) !== null)
    .filter((record) => isFiniteHistoryNumber(record.conductivity) || isFiniteHistoryNumber(record.ph))
    .filter((record) => {
      const key = [
        record.batchId || "",
        record.timestamp,
        record.site,
        record.conductivity ?? "",
        record.ph ?? "",
      ].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => parseHistoryTimestamp(a) - parseHistoryTimestamp(b));
}

function roundEnvironmentalValue(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function getEnvironmentalAnomaly(metricKey, previousValue, currentValue) {
  if (!isFiniteHistoryNumber(previousValue) || !isFiniteHistoryNumber(currentValue)) return null;
  const previous = Number(previousValue);
  const current = Number(currentValue);
  const delta = current - previous;

  if (metricKey === "conductivity") {
    const previousMagnitude = Math.abs(previous);
    if (!previousMagnitude || delta === 0) return null;
    const percentChange = (Math.abs(delta) / previousMagnitude) * 100;
    if (percentChange < HISTORY_CONDUCTIVITY_CHANGE_RATIO * 100) return null;
    return { direction: delta > 0 ? "spike" : "drop", previous, current, delta, percentChange };
  }

  if (metricKey === "ph" && Math.abs(delta) >= HISTORY_PH_JUMP_DELTA) {
    return { direction: delta > 0 ? "jump" : "drop", previous, current, delta, percentChange: null };
  }

  return null;
}

function groupedEnvironmentalTrend(metricKey) {
  const config = HISTORY_ENVIRONMENT_METRICS[metricKey];
  const records = getEnvironmentalSourceRecords()
    .filter((record) => isFiniteHistoryNumber(record[metricKey]));
  const granularity = historyState.trendGranularity;
  const years = new Set(records.map((record) => new Date(record.timestamp).getFullYear()).filter(Number.isFinite));
  const showYear = years.size > 1;
  const byBucket = new Map();
  const labelByBucket = new Map();

  records.forEach((record) => {
    const bucketStart = getBucketStart(parseHistoryTimestamp(record), granularity);
    const bucketKey = bucketStart.toISOString();
    const value = Number(record[metricKey]);
    const group = byBucket.get(bucketKey) || { values: [], min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY, count: 0 };
    group.values.push(value);
    group.min = Math.min(group.min, value);
    group.max = Math.max(group.max, value);
    group.count += 1;
    byBucket.set(bucketKey, group);
    labelByBucket.set(bucketKey, formatTrendDate(bucketStart, granularity, showYear));
  });

  const bucketKeys = [...labelByBucket.keys()].sort((a, b) => new Date(a) - new Date(b));
  const data = bucketKeys.map((bucketKey) => {
    const group = byBucket.get(bucketKey);
    if (!group?.values.length) return null;
    const average = group.values.reduce((sum, value) => sum + value, 0) / group.values.length;
    return roundEnvironmentalValue(average, config.decimals);
  });
  const detectAnomalies = granularity === HISTORY_ENVIRONMENT_ANOMALY_GRANULARITY;
  let previousValue = null;
  const anomalies = data.map((value) => {
    if (!detectAnomalies) return null;
    const anomaly = previousValue === null ? null : getEnvironmentalAnomaly(metricKey, previousValue, value);
    if (Number.isFinite(Number(value))) previousValue = value;
    return anomaly;
  });

  return {
    labels: bucketKeys.map((key) => labelByBucket.get(key)),
    data,
    meta: bucketKeys.map((bucketKey) => byBucket.get(bucketKey) || null),
    anomalies,
    anomalyCount: anomalies.filter(Boolean).length,
    sampleCount: records.length,
  };
}

function getEnvironmentalYAxisBounds(values, metricKey) {
  const finiteValues = values.filter(isFiniteHistoryNumber).map(Number);
  if (!finiteValues.length) {
    return metricKey === "ph" ? { min: 0, max: 14 } : { min: 0, max: 100 };
  }
  if (metricKey === "ph") finiteValues.push(HISTORY_PH_NEUTRAL);
  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);
  const padding = metricKey === "ph"
    ? Math.max(0.2, (max - min || 1) * 0.2)
    : Math.max(5, (max - min || 20) * 0.15);
  if (metricKey === "ph") {
    return {
      min: Math.max(0, Math.floor((min - padding) * 10) / 10),
      max: Math.min(14, Math.ceil((max + padding) * 10) / 10),
    };
  }
  return {
    min: Math.max(0, Math.floor((min - padding) / 10) * 10),
    max: Math.ceil((max + padding) / 10) * 10,
  };
}

const historyPhReferencePlugin = {
  id: "historyPhReferencePlugin",
  afterDraw(chart) {
    const y = chart.scales.y?.getPixelForValue(HISTORY_PH_NEUTRAL);
    if (!Number.isFinite(y)) return;
    const { ctx, chartArea } = chart;
    if (y < chartArea.top || y > chartArea.bottom) return;
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = "#64748b";
    ctx.beginPath();
    ctx.moveTo(chartArea.left, y);
    ctx.lineTo(chartArea.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#475569";
    ctx.font = "600 11px Poppins, Arial, sans-serif";
    ctx.fillText("pH 7 neutral", chartArea.left + 8, Math.max(chartArea.top + 14, y - 8));
    ctx.restore();
  },
};

function clearHistoryChartCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  const context = canvas?.getContext?.("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
}

function renderHistoryTrendSitePrompt() {
  clearHistoryChartCanvas("historyTrendChart");
  const trendMeta = document.getElementById("historyTrendMeta");
  const legend = document.getElementById("historyProtectionZoneLegend");
  if (trendMeta) {
    trendMeta.textContent = "Select a Site filter to view historical reading trends for a single location.";
  }
  if (legend) legend.innerHTML = "";
}

function renderEnvironmentalSitePrompt() {
  clearHistoryChartCanvas("historyConductivityChart");
  clearHistoryChartCanvas("historyPhChart");
  const environmentMeta = document.getElementById("historyEnvironmentalMeta");
  if (environmentMeta) {
    environmentMeta.textContent = "Select a Site filter to view conductivity and pH trends for a single location.";
  }
}

function renderEnvironmentalChart(chartKey, canvasId, metricKey) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  const config = HISTORY_ENVIRONMENT_METRICS[metricKey];
  const trend = groupedEnvironmentalTrend(metricKey);
  const yBounds = getEnvironmentalYAxisBounds(trend.data, metricKey);
  const rawView = historyState.trendGranularity === "raw";
  const pointRadius = rawView ? (trend.labels.length > 180 ? 0 : trend.labels.length > 70 ? 1 : 2) : 2;
  const pointRadii = trend.anomalies.map((anomaly) => anomaly ? 5 : pointRadius);
  const pointHoverRadii = trend.anomalies.map((anomaly) => anomaly ? 7 : 5);
  const pointBackgroundColors = trend.anomalies.map((anomaly) => anomaly ? "#dc2626" : config.color);
  const pointBorderColors = trend.anomalies.map((anomaly) => anomaly ? "#991b1b" : config.color);
  const pointBorderWidths = trend.anomalies.map((anomaly) => anomaly ? 2 : 1);

  historyState.charts[chartKey] = new Chart(canvas, {
    type: "line",
    data: {
      labels: trend.labels,
      datasets: [{
        label: config.label,
        data: trend.data,
        borderColor: config.color,
        backgroundColor: config.color,
        borderWidth: rawView ? 1.8 : 2.2,
        tension: rawView ? 0.15 : 0.3,
        pointRadius: pointRadii,
        pointHoverRadius: pointHoverRadii,
        pointBackgroundColor: pointBackgroundColors,
        pointBorderColor: pointBorderColors,
        pointBorderWidth: pointBorderWidths,
        spanGaps: true,
        meta: trend.meta,
        anomalies: trend.anomalies,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: window.AppChartAnimation?.getEntranceAnimation?.() ?? false,
      resizeDelay: 80,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(context) {
              const meta = context.dataset.meta?.[context.dataIndex];
              const anomaly = context.dataset.anomalies?.[context.dataIndex];
              const value = context.parsed.y;
              const suffix = historyState.trendGranularity === "raw" || !meta
                ? ""
                : ` (${meta.count} samples, ${roundEnvironmentalValue(meta.min, config.decimals)} to ${roundEnvironmentalValue(meta.max, config.decimals)} ${config.unit})`;
              const warning = anomaly && metricKey === "conductivity"
                ? ` - ${anomaly.direction} ${Math.round(anomaly.percentChange)}% vs previous week`
                : anomaly
                  ? ` - ${anomaly.direction} ${roundEnvironmentalValue(Math.abs(anomaly.delta), config.decimals)} ${config.unit} vs previous week`
                  : "";
              return `${config.label}: ${value} ${config.unit}${suffix}${warning}`;
            },
          },
        },
      },
      scales: {
        y: {
          min: yBounds.min,
          max: yBounds.max,
          ticks: { callback: (value) => metricKey === "ph" ? value : `${value}` },
          grid: { color: "#eef2f7" },
        },
        x: {
          grid: { color: "#f1f5f9" },
          ticks: {
            autoSkip: true,
            maxRotation: 0,
            maxTicksLimit: rawView ? 18 : 12,
          },
        },
      },
    },
    plugins: metricKey === "ph" ? [historyPhReferencePlugin] : [],
  });

  return trend;
}

function renderHistoryCharts() {
  Object.values(historyState.charts).forEach((chart) => chart.destroy());
  historyState.charts = {};
  if (!window.Chart) {
    const trendMeta = document.getElementById("historyTrendMeta");
    const environmentMeta = document.getElementById("historyEnvironmentalMeta");
    if (trendMeta) trendMeta.textContent = "Protection-potential history could not be displayed because the chart library is unavailable.";
    if (environmentMeta) environmentMeta.textContent = "Environmental charts could not be displayed because the chart library is unavailable.";
    return;
  }
  if (!historyState.filters.site) {
    renderHistoryTrendSitePrompt();
    renderEnvironmentalSitePrompt();
    return;
  }
  const trend = groupedTrend();
  const protectionPresentation = window.AppChartProtectionPresentation;
  const thresholdReference = protectionPresentation?.resolveThresholdReference?.(
    trend.thresholdValues,
    HISTORY_THRESHOLD_MV,
  ) || {
    thresholdMv: HISTORY_THRESHOLD_MV,
    definitive: false,
    source: "baseline",
  };
  const zoneLabels = protectionPresentation?.getZoneLabels?.(thresholdReference);
  const yBounds = getTrendYAxisBounds(trend, thresholdReference.thresholdMv);
  const rawView = historyState.trendGranularity === "raw";
  const densePointRadius = rawView ? (trend.labels.length > 220 ? 0 : trend.labels.length > 80 ? 1 : 2) : 2;
  const trendMeta = document.getElementById("historyTrendMeta");
  if (trendMeta) {
    trendMeta.textContent = `${historyState.trendMeta} ${zoneLabels
      ? `${zoneLabels.threshold}. ${zoneLabels.note}`
      : `Baseline reference: ${HISTORY_THRESHOLD_MV} mV.`}`;
  }
  protectionPresentation?.renderLegend?.(
    document.getElementById("historyProtectionZoneLegend"),
    thresholdReference,
  );
  const trendConfig = {
    type: "line",
    data: {
      labels: trend.labels,
      datasets: trend.series.map((item, index) => ({
        label: item.name,
        data: item.data,
        borderColor: HISTORY_TREND_COLORS[index % HISTORY_TREND_COLORS.length],
        backgroundColor: HISTORY_TREND_COLORS[index % HISTORY_TREND_COLORS.length],
        tension: historyState.trendGranularity === "raw" ? 0.15 : 0.3,
        borderWidth: rawView ? 1.8 : 2.2,
        pointRadius: densePointRadius,
        pointHoverRadius: 5,
        spanGaps: false,
        meta: item.meta,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: window.AppChartAnimation?.getEntranceAnimation?.() ?? false,
      resizeDelay: 80,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: trend.series.length > 1, position: "bottom" },
        tooltip: {
          callbacks: {
            label(context) {
              const meta = context.dataset.meta?.[context.dataIndex];
              const value = context.parsed.y;
              if (!meta) return `${context.dataset.label}: ${value} mV`;
              const suffix = historyState.trendGranularity === "raw" ? "" : ` (${meta.count} readings, ${meta.min} to ${meta.max} mV)`;
              return `${context.dataset.label}: ${value} mV${suffix}`;
            },
          },
        },
      },
      scales: {
        y: {
          min: yBounds.min,
          max: yBounds.max,
          ticks: { callback: (value) => `${value} mV` },
          grid: { color: "#eef2f7" },
        },
        x: {
          grid: { color: "#f1f5f9" },
          ticks: {
            autoSkip: true,
            maxRotation: 0,
            maxTicksLimit: rawView ? 22 : 14,
          },
        },
      },
    },
  };
  protectionPresentation?.applyToChartConfig?.(trendConfig, thresholdReference);
  historyState.charts.trend = new Chart(document.getElementById("historyTrendChart"), trendConfig);
  const conductivityTrend = renderEnvironmentalChart("conductivity", "historyConductivityChart", "conductivity");
  const phTrend = renderEnvironmentalChart("ph", "historyPhChart", "ph");
  const environmentMeta = document.getElementById("historyEnvironmentalMeta");
  if (environmentMeta) {
    const sampleCount = Math.max(conductivityTrend?.sampleCount || 0, phTrend?.sampleCount || 0);
    const anomalyCount = (conductivityTrend?.anomalyCount || 0) + (phTrend?.anomalyCount || 0);
    const granularity = historyState.trendGranularity === "raw" ? "Raw samples" : historyState.trendGranularity === "daily" ? "Daily averages" : "Weekly averages";
    const locationPrefix = `${historyState.filters.site} - `;
    const anomalySummary = historyState.trendGranularity === HISTORY_ENVIRONMENT_ANOMALY_GRANULARITY
      ? `${anomalyCount} significant week-to-week environmental change${anomalyCount === 1 ? "" : "s"} detected`
      : "Switch to Weekly to check significant week-to-week changes";
    environmentMeta.textContent = sampleCount
      ? `${locationPrefix}${granularity} - ${sampleCount} environmental samples - ${anomalySummary}`
      : "No conductivity or pH samples match the selected range.";
  }
  requestAnimationFrame(() => Object.values(historyState.charts).forEach((chart) => chart?.resize()));
}

function activeFilterCount() {
  return Object.entries(historyState.filters).filter(([key, value]) => key !== "search" && value !== "").length;
}

function formatHistoryFilterChipValue(key, value) {
  if (key === "dateRange") return HISTORY_DATE_PRESETS[value] || value;
  if (key === "fromDate" || key === "toDate") return formatHistoryDateInputLabel(value);
  if (key === "minConductivity") return `${value} ${HISTORY_CONDUCTIVITY_UNIT}`;
  if (key === "phRange") return HISTORY_PH_FILTER_LABELS[value] || value;
  return value;
}

function renderHistoryFiltersSummary() {
  document.getElementById("historyResultCount").textContent = `${historyState.processed.length} records · Page ${historyState.page} of ${Math.max(1, Math.ceil(historyState.processed.length / historyState.rowsPerPage))}`;
  const badge = document.getElementById("historyFilterCount");
  const count = activeFilterCount();
  badge.hidden = !count;
  badge.textContent = count;
  const labels = { dateRange: "Date", fromDate: "From", toDate: "To", testPoint: "Test Point", asset: "Asset", site: "Site", zone: "Zone", status: "Status", coordType: "Coord", source: "Source", engineer: "Engineer", min: "Min", max: "Max", minConductivity: "High Conductivity", phRange: "pH" };
  document.getElementById("historyFilterChips").innerHTML = Object.entries(historyState.filters)
    .filter(([key, value]) => key !== "search" && value !== "")
    .map(([key, value]) => `<button class="dashboard-filter-chip" type="button" data-history-remove-filter="${key}">${labels[key]}: ${escapeHistoryHtml(formatHistoryFilterChipValue(key, value))} <i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`)
    .join("");
  updateHistoryDropdownLabels();
}

function renderHistorySortHeaders() {
  document.querySelectorAll("[data-history-sort]").forEach((th) => {
    const active = th.dataset.historySort === historyState.sortKey;
    const label = th.dataset.historySortLabel || th.textContent.trim();
    const direction = historyState.sortDirection === "asc" ? "ascending" : "descending";
    const nextDirection = historyState.sortDirection === "asc" ? "descending" : "ascending";
    const accessibleLabel = active ? `Sorted ${direction} by ${label}. Activate to sort ${nextDirection}.` : `Sort by ${label}`;
    const indicator = active ? (historyState.sortDirection === "asc" ? "↑" : "↓") : "↕";
    th.dataset.historySortLabel = label;
    th.innerHTML = `<button type="button" class="table-sort-button" data-history-sort-button="${th.dataset.historySort}" aria-label="${escapeHistoryHtml(accessibleLabel)}" title="${escapeHistoryHtml(accessibleLabel)}"><span>${escapeHistoryHtml(label)}</span><span class="sort-indicator" aria-hidden="true">${indicator}</span></button>`;
    th.setAttribute("aria-sort", active ? direction : "none");
  });
}

function renderHistoryTable() {
  const start = (historyState.page - 1) * historyState.rowsPerPage;
  const pageRows = historyState.processed.slice(start, start + historyState.rowsPerPage);
  const tbody = document.getElementById("historyTableBody");
  document.getElementById("historyEmptyState").hidden = historyState.processed.length > 0;
  tbody.innerHTML = pageRows.map((record) => {
    return `<tr>
      <td>${escapeHistoryHtml(formatHistoryDate(record.timestamp))}</td><td><strong>${escapeHistoryHtml(record.testPointId)}</strong></td><td>${escapeHistoryHtml(record.name)}</td><td>${escapeHistoryHtml(record.assetPath)}</td>
      <td class="${record.status === "Protected" ? "green" : record.status === "Warning" ? "orange" : record.status === "Unprotected" ? "red" : "gray"}"><strong>${Number.isFinite(Number(record.reading)) ? `${record.reading} mV` : "—"}</strong></td>
      <td><span class="badge ${statusClass(record.status)}">${escapeHistoryHtml(record.status)}</span></td><td>${formatHistoryNumeric(record.temperature, { decimals: 1, unit: "C" })}</td><td>${formatHistoryNumeric(record.conductivity, { decimals: 0, unit: HISTORY_CONDUCTIVITY_UNIT })}</td><td>${formatHistoryNumeric(record.ph, { decimals: 2 })}</td>
      <td><span class="testpoint-inline-pill ${record.coordType === "GPS" ? "green" : "orange"}">${escapeHistoryHtml(record.coordType)}</span></td>
      <td><span class="testpoint-inline-pill ${record.source === "CSV Upload" ? "green" : record.source === "Manual Entry" ? "blue" : "orange"}">${escapeHistoryHtml(record.source)}</span></td>
      <td>${escapeHistoryHtml(record.engineer)}</td><td><button class="icon-button" type="button" aria-label="View actions">...</button></td>
    </tr>`;
  }).join("");
  const from = historyState.processed.length ? start + 1 : 0;
  const to = Math.min(start + historyState.rowsPerPage, historyState.processed.length);
  document.getElementById("historyShowingText").textContent = `Showing ${from}–${to} of ${historyState.processed.length}`;
  document.getElementById("historyTableMeta").textContent = `${historyState.processed.length} records · Page ${historyState.page} of ${Math.max(1, Math.ceil(historyState.processed.length / historyState.rowsPerPage))}`;
  renderHistoryPagination();
}

function renderHistoryPagination() {
  const pages = Math.max(1, Math.ceil(historyState.processed.length / historyState.rowsPerPage));
  const pageItems = getHistoryPaginationItems(historyState.page, pages);
  document.getElementById("historyPagination").innerHTML = `
    <button class="page-btn" data-history-page="${historyState.page - 1}" ${historyState.page === 1 ? "disabled" : ""}>‹</button>
    ${pageItems.map((item) => item === "ellipsis" ? `<span class="pagination-ellipsis" aria-hidden="true">…</span>` : `<button class="page-btn ${historyState.page === item ? "active" : ""}" data-history-page="${item}" aria-label="Page ${item}" ${historyState.page === item ? 'aria-current="page"' : ""}>${item}</button>`).join("")}
    <button class="page-btn" data-history-page="${historyState.page + 1}" ${historyState.page === pages ? "disabled" : ""}>›</button>`;
}

function getHistoryPaginationItems(currentPage, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  if (currentPage <= 4) [2, 3, 4, 5].forEach((page) => pages.add(page));
  if (currentPage >= totalPages - 3) [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1].forEach((page) => pages.add(page));
  const sorted = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  return sorted.flatMap((page, index) => {
    if (index === 0) return [page];
    return page - sorted[index - 1] > 1 ? ["ellipsis", page] : [page];
  });
}

function renderHistory() {
  applyHistoryProcessing();
  renderHistoryMetrics();
  renderHistoryCharts();
  renderHistoryFiltersSummary();
  renderHistorySortHeaders();
  renderHistoryTable();
}

function resetHistoryFilters() {
  historyState.filters = { search: "", dateRange: "", fromDate: "", toDate: "", testPoint: "", asset: "", site: "", zone: "", status: "", coordType: "", source: "", engineer: "", min: "", max: "", minConductivity: "", phRange: "" };
  historyState.selectedTrendTestPoints = [];
  ["historySearch", "historyDateRange", "historyFromDate", "historyToDate", "historyTestPointFilter", "historyAssetFilter", "historySiteFilter", "historyZoneFilter", "historyStatusFilter", "historyCoordFilter", "historySourceFilter", "historyEngineerFilter", "historyMinReading", "historyMaxReading", "historyMinConductivity", "historyPhFilter"].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ""; });
  document.querySelectorAll("#historyTrendTestPointOptions input").forEach((input) => { input.checked = false; });
  document.getElementById("historySearchClear").hidden = true;
  historyState.page = 1;
  populateHistoryFilters();
  loadHistoryRecords();
}

function bindHistoryEvents() {
  historyAbortController?.abort();
  historyAbortController = new AbortController();
  let searchTimer;
  document.getElementById("historySearch").addEventListener("input", (event) => {
    clearTimeout(searchTimer);
    document.getElementById("historySearchClear").hidden = !event.target.value;
    searchTimer = setTimeout(() => { historyState.filters.search = event.target.value.trim(); historyState.page = 1; renderHistory(); }, 275);
  });
  document.getElementById("historySearchClear").addEventListener("click", () => { document.getElementById("historySearch").value = ""; historyState.filters.search = ""; document.getElementById("historySearchClear").hidden = true; historyState.page = 1; renderHistory(); });
  document.getElementById("historyFiltersButton").addEventListener("click", () => {
    const panel = document.getElementById("historyAdvancedFilters");
    panel.hidden = !panel.hidden;
    document.getElementById("historyFiltersButton").setAttribute("aria-expanded", String(!panel.hidden));
  });
  document.getElementById("historyReset").addEventListener("click", resetHistoryFilters);
  document.getElementById("historyClearEmpty").addEventListener("click", resetHistoryFilters);
  document.querySelectorAll("[data-history-dropdown-toggle]").forEach((button) => {
    button.addEventListener("click", () => toggleHistoryDropdown(button.dataset.historyDropdownToggle));
  });
  document.querySelectorAll("[data-history-date-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      const preset = button.dataset.historyDatePreset;
      historyState.filters.dateRange = preset;
      document.getElementById("historyDateRange").value = preset;
      if (preset !== "custom") {
        historyState.filters.fromDate = "";
        historyState.filters.toDate = "";
        document.getElementById("historyFromDate").value = "";
        document.getElementById("historyToDate").value = "";
        closeHistoryDropdowns();
        historyState.page = 1;
        loadHistoryRecords();
        return;
      }
      historyState.page = 1;
      renderHistory();
    });
  });
  document.getElementById("historyClearTrendTestPoints").addEventListener("click", () => {
    historyState.selectedTrendTestPoints = [];
    document.querySelectorAll("#historyTrendTestPointOptions input").forEach((input) => { input.checked = false; });
    updateHistoryDropdownLabels();
    renderHistoryCharts();
  });
  document.getElementById("historyClearSiteFilter").addEventListener("click", () => {
    historyState.filters.site = "";
    syncHistoryLocationDependentFilters("site");
    historyState.page = 1;
    populateHistoryFilters();
    closeHistoryDropdowns();
    renderHistory();
  });
  document.getElementById("historySiteOptions").addEventListener("click", (event) => {
    const option = event.target.closest("[data-history-site-option]");
    if (!option) return;
    historyState.filters.site = option.dataset.historySiteOption || "";
    const siteFilter = document.getElementById("historySiteFilter");
    if (siteFilter) siteFilter.value = historyState.filters.site;
    syncHistoryLocationDependentFilters("site");
    historyState.page = 1;
    populateHistoryFilters();
    closeHistoryDropdowns();
    renderHistory();
  });
  document.getElementById("historyTrendTestPointOptions").addEventListener("change", (event) => {
    if (!event.target.matches("input[type='checkbox']")) return;
    const checked = Array.from(document.querySelectorAll("#historyTrendTestPointOptions input:checked")).map((input) => input.value);
    if (checked.length > HISTORY_MAX_COMPARED_TEST_POINTS) {
      event.target.checked = false;
      window.AppToast?.info?.(`Compare up to ${HISTORY_MAX_COMPARED_TEST_POINTS} test points at a time.`);
    }
    historyState.selectedTrendTestPoints = Array.from(document.querySelectorAll("#historyTrendTestPointOptions input:checked")).map((input) => input.value);
    updateHistoryDropdownLabels();
    renderHistoryCharts();
  });
  ["historyDateRange", "historyFromDate", "historyToDate", "historyTestPointFilter", "historyAssetFilter", "historySiteFilter", "historyZoneFilter", "historyStatusFilter", "historyCoordFilter", "historySourceFilter", "historyEngineerFilter", "historyMinReading", "historyMaxReading", "historyMinConductivity", "historyPhFilter"].forEach((id) => {
    document.getElementById(id).addEventListener("input", (event) => {
      const key = { historyDateRange: "dateRange", historyFromDate: "fromDate", historyToDate: "toDate", historyTestPointFilter: "testPoint", historyAssetFilter: "asset", historySiteFilter: "site", historyZoneFilter: "zone", historyStatusFilter: "status", historyCoordFilter: "coordType", historySourceFilter: "source", historyEngineerFilter: "engineer", historyMinReading: "min", historyMaxReading: "max", historyMinConductivity: "minConductivity", historyPhFilter: "phRange" }[id];
      historyState.filters[key] = event.target.value;
      if (key === "dateRange" && event.target.value !== "custom") {
        historyState.filters.fromDate = "";
        historyState.filters.toDate = "";
        document.getElementById("historyFromDate").value = "";
        document.getElementById("historyToDate").value = "";
      }
      if ((key === "fromDate" || key === "toDate") && event.target.value) {
        historyState.filters.dateRange = "custom";
        document.getElementById("historyDateRange").value = "custom";
      }
      if (key === "dateRange" || key === "fromDate" || key === "toDate") {
        clearTimeout(historyDateInputTimer);
        historyDateInputTimer = setTimeout(loadHistoryRecords, 250);
        return;
      }
      syncHistoryLocationDependentFilters(key);
      historyState.page = 1;
      populateHistoryFilters();
      if (key === "site") closeHistoryDropdowns();
      renderHistory();
    });
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".history-dropdown")) closeHistoryDropdowns();
    const sort = event.target.closest("[data-history-sort-button]");
    if (sort) {
      historyState.sortDirection = historyState.sortKey === sort.dataset.historySortButton && historyState.sortDirection === "asc" ? "desc" : "asc";
      historyState.sortKey = sort.dataset.historySortButton;
      historyState.page = 1;
      renderHistory();
    }
    const page = event.target.closest("[data-history-page]");
    if (page) { historyState.page = Number(page.dataset.historyPage); renderHistoryTable(); }
    const chip = event.target.closest("[data-history-remove-filter]");
    if (chip) {
      const removedFilter = chip.dataset.historyRemoveFilter;
      historyState.filters[removedFilter] = "";
      syncHistoryLocationDependentFilters(removedFilter);
      const filterInputIds = {
        dateRange: "historyDateRange",
        fromDate: "historyFromDate",
        toDate: "historyToDate",
        testPoint: "historyTestPointFilter",
        asset: "historyAssetFilter",
        site: "historySiteFilter",
        zone: "historyZoneFilter",
        status: "historyStatusFilter",
        coordType: "historyCoordFilter",
        source: "historySourceFilter",
        engineer: "historyEngineerFilter",
        min: "historyMinReading",
        max: "historyMaxReading",
        minConductivity: "historyMinConductivity",
        phRange: "historyPhFilter",
      };
      const filterInput = document.getElementById(filterInputIds[removedFilter]);
      if (filterInput) filterInput.value = "";
      populateHistoryFilters();
      if (["dateRange", "fromDate", "toDate"].includes(removedFilter)) {
        loadHistoryRecords();
      } else {
        renderHistory();
      }
    }
  }, { signal: historyAbortController.signal });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeHistoryDropdowns();
  }, { signal: historyAbortController.signal });
  document.getElementById("historyRowsPerPage").addEventListener("change", (event) => { historyState.rowsPerPage = Number(event.target.value); historyState.page = 1; renderHistory(); });
  document.querySelectorAll("[data-trend-granularity]").forEach((button) => button.addEventListener("click", () => {
    historyState.trendGranularity = button.dataset.trendGranularity;
    document.querySelectorAll("[data-trend-granularity]").forEach((item) => item.classList.toggle("active", item === button));
    renderHistoryCharts();
  }));
  document.getElementById("historyRefresh").addEventListener("click", loadHistoryRecords);
}

async function loadHistoryRecords() {
  const requestId = ++historyLoadRequestId;
  const options = getHistoryFetchOptions();
  const loadingLabel = options.hasDateFilter
    ? `Loading ${getHistoryDateRangeLabel()}...`
    : `Loading latest ${HISTORY_DEFAULT_RECORD_LIMIT} records...`;
  setHistoryLoading(true, loadingLabel);

  try {
    const records = await historyRepository.listRecords(options);
    if (requestId !== historyLoadRequestId) return;
    historyState.records = records;
    const loadedLabel = options.hasDateFilter
      ? `${records.length} records loaded for ${getHistoryDateRangeLabel()}`
      : `${records.length} latest records loaded`;
    document.getElementById("historyLastUpdated").textContent = `${loadedLabel} · ${formatHistoryDate(new Date().toISOString())}`;
  } catch (error) {
    if (requestId !== historyLoadRequestId) return;
    console.error("Unable to load Data History from Supabase:", error);
    historyState.records = [];
    document.getElementById("historyLastUpdated").textContent = "Unable to load Data History. Please try again.";
  } finally {
    if (requestId === historyLoadRequestId) setHistoryLoading(false);
  }
  if (requestId !== historyLoadRequestId) return;
  populateHistoryFilters();
  renderHistory();
}

async function initDataHistoryPage() {
  if (window.Chart) Chart.defaults.font.family = "Poppins, sans-serif";
  const preferredRows = Number(window.AppPreferences?.getCurrent?.().tableRows);
  historyState.rowsPerPage = [10, 25, 50].includes(preferredRows) ? preferredRows : 25;
  const rowsSelect = document.getElementById("historyRowsPerPage");
  if (rowsSelect) rowsSelect.value = String(historyState.rowsPerPage);
  bindHistoryEvents();
  await loadHistoryRecords();
}

function destroyDataHistoryPage() {
  historyAbortController?.abort();
  historyAbortController = null;
  clearTimeout(historyDateInputTimer);
  Object.values(historyState.charts).forEach((chart) => chart?.destroy());
  historyState.charts = {};
}

window.DataHistoryPage = { init: initDataHistoryPage, destroy: destroyDataHistoryPage };

document.addEventListener("DOMContentLoaded", async () => {
  const page = window.getCurrentPageName?.() || location.pathname.split("/").pop();
  if (page === "history.php") await initDataHistoryPage();
});

window.renderHistory = renderHistory;
