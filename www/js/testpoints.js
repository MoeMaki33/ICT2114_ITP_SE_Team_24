(() => {
// Test Points page is wrapped in an IIFE so its constants and helpers do not
// collide with other page scripts when the app navigates without a full reload.
const TEST_POINT_STORAGE_KEY = "testPointsData";
// Bumped to v5 so everyone's saved column preference resets and picks up
// "Type" being back in the default visible set (re-added after the UI
// revamp dropped it), instead of staying hidden for anyone who already
// saved a v4 preference before this fix.
const TEST_POINT_VISIBLE_COLUMNS_STORAGE_KEY = "testPointsVisibleColumns:v5";
const TEST_POINTS_TABLE = "test_points";
const LOCATIONS_TABLE = "locations";
const TEST_POINT_POSITIONS_TABLE = "test_point_positions";
const PROTECTED_THRESHOLD_MV = window.AppStatus.DEFAULT_PROTECTION_THRESHOLD_MV;
const TEST_POINT_IMPORT_HEADERS = [
  "Test Point Label",
  "Location",
  "Type",
  "Test Point Note",
  "Assigned Engineer",
  "Active",
];
const TEST_POINT_IMPORT_TEMPLATE_ROWS = [
  {
    "Test Point Label": "TP-001",
    Location: "Pipeline A - North",
    Type: "stationary",
    "Test Point Note": "Terminal box is behind the locked panel",
    "Assigned Engineer": "Jane Tan",
    Active: true,
  },
];
const TEST_POINT_COLUMN_DEFINITIONS = [
  { key: "label", label: "Test Point", required: true },
  { key: "locationName", label: "Location" },
  { key: "latestReadingValue", label: "Latest Reading" },
  { key: "weeklyAverage", label: "Weekly Average" },
  { key: "changeFromStart", label: "Change This Week" },
  { key: "status", label: "Protection Status", required: true },
  { key: "lastUpdated", label: "Last Updated" },
  { key: "type", label: "Type" },
  { key: "thresholdMv", label: "Threshold" },
  { key: "pointNote", label: "Test Point Note" },
  { key: "coordType", label: "Coordinates" },
  { key: "assignedEngineer", label: "Assigned Engineer" },
  { key: "active", label: "Active" },
  { key: "actions", label: "Actions", required: true },
];
const TEST_POINT_DEFAULT_VISIBLE_COLUMNS = Object.freeze([
  "label",
  "locationName",
  "type",
  "latestReadingValue",
  "weeklyAverage",
  "changeFromStart",
  "status",
  "lastUpdated",
  "actions",
]);
let TEST_POINTS_PAGE_SIZE = 25;

let testPoints = [];
let assignableEngineers = [];
let engineerNameById = new Map();
let editingTestPointId = "";
let testPointLoadWarning = "";
let testPointsSelectedWeek = "";
let testPointsSelectedWeekEnd = "";
let currentTestPointsPage = 1;
let testPointsAbortController = null;
let assignedEngineerSupported = true;
let currentTestPointsUserId = "";
let currentTestPointsUserRole = "";
let testPointPositionController = null;
let testPointsSortController = null;
// This object holds the current UI state for the table so search, sort,
// pagination, and filters can all be recomputed from the same source of truth.
const testPointsState = {
  search: "",
  sortKey: "",
  sortDirection: null,
  filters: { location: "", status: "", coordType: "", engineer: "", active: "" },
  visibleColumns: [...TEST_POINT_DEFAULT_VISIBLE_COLUMNS],
};

function hasSupabaseReady() {
  return Boolean(window.appSupabase && window.isSupabaseConfigured && window.isSupabaseConfigured());
}

function parseReadingValue(reading) {
  if (reading === null || reading === undefined || reading === "") return null;
  const numericValue = Number.parseFloat(String(reading).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numericValue) ? numericValue : null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

function normalizeUuid(value) {
  const normalizedValue = String(value || "").trim();
  return looksLikeUuid(normalizedValue) ? normalizedValue : "";
}

function filterUuidList(values) {
  return [...new Set((values || []).map((value) => normalizeUuid(value)).filter(Boolean))];
}

function protectSpreadsheetCell(value) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function protectSpreadsheetRow(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      typeof value === "string" ? protectSpreadsheetCell(value) : value,
    ])
  );
}

function getRequiredTestPointColumns() {
  return TEST_POINT_COLUMN_DEFINITIONS.filter((column) => column.required).map((column) => column.key);
}

function getDefaultVisibleTestPointColumns() {
  return [...TEST_POINT_DEFAULT_VISIBLE_COLUMNS];
}

function sanitizeVisibleTestPointColumns(columns) {
  const allowedColumns = new Set(TEST_POINT_COLUMN_DEFINITIONS.map((column) => column.key));
  const requestedColumns = Array.isArray(columns) ? columns.filter((column) => allowedColumns.has(column)) : [];
  const mergedColumns = [...new Set([...requestedColumns, ...getRequiredTestPointColumns()])];
  return TEST_POINT_COLUMN_DEFINITIONS.map((column) => column.key).filter((key) => mergedColumns.includes(key));
}

function loadVisibleTestPointColumns() {
  try {
    const savedColumns = localStorage.getItem(TEST_POINT_VISIBLE_COLUMNS_STORAGE_KEY);
    if (!savedColumns) return getDefaultVisibleTestPointColumns();
    const parsedColumns = JSON.parse(savedColumns);
    if (!Array.isArray(parsedColumns) || !parsedColumns.length) {
      return getDefaultVisibleTestPointColumns();
    }
    return sanitizeVisibleTestPointColumns(parsedColumns);
  } catch {
    return getDefaultVisibleTestPointColumns();
  }
}

function persistVisibleTestPointColumns() {
  localStorage.setItem(TEST_POINT_VISIBLE_COLUMNS_STORAGE_KEY, JSON.stringify(testPointsState.visibleColumns));
}

function isTestPointColumnVisible(key) {
  return testPointsState.visibleColumns.includes(key);
}

function getVisibleTestPointColumnCount() {
  return TEST_POINT_COLUMN_DEFINITIONS.filter((column) => isTestPointColumnVisible(column.key)).length;
}

function downloadSpreadsheetFallback(rows, headers, fileName) {
  const csv = [headers, ...rows.map((row) => headers.map((header) => row?.[header] ?? ""))]
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

function statusClass(status) {
  return window.AppStatus?.statusClass?.(status) || "gray-bg";
}

function deriveStatus(point) {
  if (!Number(point.weeklyReadingCount || 0)) return "No Data";
  const normalized = String(point.weeklyStatus || "").trim().toLowerCase();
  if (normalized === "protected") return "Protected";
  if (normalized === "warning") return "Warning";
  if (normalized === "unprotected") return "Unprotected";
  return "No Data";
}

function getCoordinates(point) {
  if (point.position?.hasGps) return `${point.position.latitude}, ${point.position.longitude}`;
  if (point.position?.hasRelative) return "Relative position available";
  return "Not mapped";
}

function getCoordType(point) {
  const mode = point.position?.coordinateMode || "unmapped";
  return ({ gps: "GPS", relative: "Relative", gps_and_relative: "GPS and Relative", unmapped: "Missing" })[mode] || "Missing";
}

function getLocationName(point) {
  return String(point?.locationName || "").trim() || "—";
}

function getAssignedEngineer(point) {
  return point.assignedEngineer || "Unassigned";
}

function getPointNote(point) {
  return String(point?.pointNote || "").trim() || "None";
}

function isTestPointsAdmin() {
  const cachedRole = String(localStorage.getItem("userRole") || "").trim().toLowerCase();
  return cachedRole === "admin" || currentTestPointsUserRole === "admin";
}

function getRoleVisibleTestPoints(points = testPoints) {
  if (isTestPointsAdmin()) return points.slice();
  if (currentTestPointsUserRole === "corrosion_engineer") {
    return points.filter((point) => String(point.assignedEngineerId || "").trim() === currentTestPointsUserId);
  }
  return [];
}

function getActivityState(point) {
  return point.isActive ? "Active" : "Inactive";
}

function formatMv(value) {
  const number = parseReadingValue(value);
  return number === null ? "—" : `${Math.round(number)} mV`;
}

function formatReading(point) {
  return formatMv(point.latestReadingValue);
}

function formatDateTime(value) {
  if (!value) return "N/A";
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return "N/A";
  return parsedDate.toLocaleString("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatReportingWeek(startDate, endDate) {
  if (!startDate) return "Unavailable";
  const format = (value, options) => new Date(`${value}T00:00:00Z`).toLocaleDateString("en-SG", {
    ...options,
    timeZone: "UTC",
  });
  const resolvedEnd = endDate || new Date(`${startDate}T00:00:00Z`);
  const endIso = typeof resolvedEnd === "string"
    ? resolvedEnd
    : new Date(resolvedEnd.getTime() + (6 * 86400000)).toISOString().slice(0, 10);
  const startMonth = format(startDate, { month: "long" });
  const endMonth = format(endIso, { month: "long" });
  const startYear = format(startDate, { year: "numeric" });
  const endYear = format(endIso, { year: "numeric" });
  const startDay = format(startDate, { day: "numeric" });
  const endDay = format(endIso, { day: "numeric" });
  if (startMonth === endMonth && startYear === endYear) return `${startDay}–${endDay} ${endMonth} ${endYear}`;
  if (startYear === endYear) return `${startDay} ${startMonth}–${endDay} ${endMonth} ${endYear}`;
  return `${startDay} ${startMonth} ${startYear}–${endDay} ${endMonth} ${endYear}`;
}

function renderTestPointsWeeklyContext() {
  const context = document.getElementById("testPointsWeeklyContext");
  if (!context) return;
  context.textContent = testPointsSelectedWeek
    ? `Weekly values: ${formatReportingWeek(testPointsSelectedWeek, testPointsSelectedWeekEnd)}`
    : "Weekly values: No reporting week available";
}

function getStatIconMarkup(tone, label) {
  const icons = {
    "Total Test Points": `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5" width="16" height="14" rx="3"></rect>
        <path d="M8 9h8M8 13h5"></path>
      </svg>
    `,
    Active: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 21c4.971 0 9-4.029 9-9s-4.029-9-9-9-9 4.029-9 9 4.029 9 9 9Z"></path>
        <path d="m9.5 12 1.8 1.8 3.7-4.1"></path>
      </svg>
    `,
    Protected: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 6 5v5c0 4.2 2.4 8.1 6 9.9 3.6-1.8 6-5.7 6-9.9V5l-6-2Z"></path>
        <path d="m9.5 12 1.7 1.7 3.3-3.7"></path>
      </svg>
    `,
    Unprotected: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 6 5v5c0 4.2 2.4 8.1 6 9.9 3.6-1.8 6-5.7 6-9.9V5l-6-2Z"></path>
        <path d="m9 9 6 6M15 9l-6 6"></path>
      </svg>
    `,
    Warning: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 2.8 20h18.4L12 3Z"></path>
        <path d="M12 9v5M12 17h.01"></path>
      </svg>
    `,
    "No Data": `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9"></circle>
        <path d="M9.5 9.5a2.7 2.7 0 1 1 4.4 2.1c-.9.7-1.4 1.2-1.4 2.4"></path>
        <path d="M12 17h.01"></path>
      </svg>
    `,
  };

  return `<div class="testpoints-stat-icon ${tone}">${icons[label] || ""}</div>`;
}

function getFilteredTestPoints() {
  const visiblePoints = getRoleVisibleTestPoints(testPoints);
  const query = testPointsState.search.toLowerCase();
  const f = testPointsState.filters;

  // Filtering happens entirely client-side after the page has loaded the
  // normalized test point records from Supabase.
  return visiblePoints.filter((point) => {
    const status = deriveStatus(point);
    const coordType = getCoordType(point);
    const activity = getActivityState(point);
    const matchesSearch = [
      point.label,
      getLocationName(point),
    ].join(" ").toLowerCase().includes(query);

    return matchesSearch &&
      (!f.location || getLocationName(point) === f.location) &&
      (!f.status || status === f.status) &&
      (!f.coordType || coordType === f.coordType) &&
      (!f.engineer || getAssignedEngineer(point) === f.engineer) &&
      (!f.active || activity === f.active);
  });
}

function persistLocalCache() {
  const flatCache = testPoints.map((point) => ({
    id: point.id,
    label: point.label,
    site_name: point.locationName,
    coordinate_mode: point.position?.coordinateMode || "unmapped",
    latest_reading: formatReading(point),
  }));
  localStorage.setItem(TEST_POINT_STORAGE_KEY, JSON.stringify(flatCache));
}

function normalizeLocationRow(row) {
  return {
    id: row.id,
    locationName: row.site_name,
    latitude: row.latitude === null || row.latitude === undefined ? "" : String(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined ? "" : String(row.longitude),
  };
}

function normalizePositionRow(row = {}) {
  const latitude = row.latitude === null || row.latitude === undefined ? null : Number(row.latitude);
  const longitude = row.longitude === null || row.longitude === undefined ? null : Number(row.longitude);
  const relativeX = row.relative_x_m === null || row.relative_x_m === undefined ? null : Number(row.relative_x_m);
  const relativeY = row.relative_y_m === null || row.relative_y_m === undefined ? null : Number(row.relative_y_m);
  return {
    id: row.id || null,
    coordinateMode: row.coordinate_mode || "unmapped",
    latitude,
    longitude,
    relativeX,
    relativeY,
    relativeZ: row.relative_z_m === null || row.relative_z_m === undefined ? null : Number(row.relative_z_m),
    chainageM: row.chainage_m === null || row.chainage_m === undefined ? null : Number(row.chainage_m),
    coordinateAccuracyM: row.coordinate_accuracy_m === null || row.coordinate_accuracy_m === undefined ? null : Number(row.coordinate_accuracy_m),
    coordinateSource: row.coordinate_source || "",
    updatedAt: row.updated_at || null,
    hasGps: Number.isFinite(latitude) && Number.isFinite(longitude),
    hasRelative: Number.isFinite(relativeX) && Number.isFinite(relativeY),
  };
}

function normalizeTestPointRow(pointRow, location, position, weeklySummary) {
  const assignedEngineerId = pointRow.assigned_engineer_id || pointRow.assignedEngineerId || "";
  // This is the single place where raw database rows are converted into the
  // flat shape the table renderer expects.
  return {
    id: pointRow.id,
    label: pointRow.label,
    type: pointRow.type,
    thresholdMv: PROTECTED_THRESHOLD_MV,
    databaseStatus: pointRow.status,
    isActive: pointRow.is_active,
    createdAt: pointRow.created_at,
    locationId: pointRow.location_id,
    locationName: location?.locationName || "—",
    assignedEngineerId,
    assignedEngineer: engineerNameById.get(assignedEngineerId) || "Unassigned",
    position: normalizePositionRow(position),
    pointNote: pointRow.note || "",
    latestReadingValue: parseReadingValue(weeklySummary?.latestReading),
    weeklyAverage: parseReadingValue(weeklySummary?.weeklyAverage),
    changeFromStart: parseReadingValue(weeklySummary?.changeFromStart),
    statusChange: weeklySummary?.statusChange || "InsufficientData",
    weeklyStatus: weeklySummary?.displayStatus || weeklySummary?.currentDisplayStatus || "No Data",
    weeklyReadingCount: Number(weeklySummary?.readingCount || 0),
    weekStartDate: weeklySummary?.weekStartDate || testPointsSelectedWeek,
    weekEndDate: weeklySummary?.weekEndDate || testPointsSelectedWeekEnd,
    lastUpdated: weeklySummary?.lastUpdated || weeklySummary?.latestReadingTs || null,
  };
}

function uniqueTestPointValues(points, getter) {
  return [...new Set(points.map(getter).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

function fillTestPointSelect(id, values, label) {
  const select = document.getElementById(id);
  if (!select) return;
  const previous = select.value;
  select.innerHTML = `<option value="">${escapeHtml(label)}</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
  select.value = values.includes(previous) ? previous : "";
}

function populateAssignedEngineerOptions(selectedValue = "") {
  const select = document.getElementById("tpEngineerInput");
  if (!select) return;

  // The dropdown stores user IDs, while the UI shows human-readable names.
  const values = assignableEngineers.slice();
  if (selectedValue && !values.some((engineer) => engineer.id === selectedValue)) {
    const fullName = engineerNameById.get(selectedValue) || "Unknown Engineer";
    values.push({ id: selectedValue, fullName });
    values.sort((a, b) => String(a.fullName).localeCompare(String(b.fullName), undefined, { sensitivity: "base", numeric: true }));
  }

  select.innerHTML = `<option value="">Unassigned</option>${values.map((engineer) => `<option value="${escapeHtml(engineer.id)}">${escapeHtml(engineer.fullName)}</option>`).join("")}`;
  select.value = selectedValue || "";
  select.disabled = !assignedEngineerSupported;
  select.title = assignedEngineerSupported
    ? ""
    : "Assigned engineer is unavailable until the Supabase test_points.assigned_engineer_id column is added.";
}

function populateTestPointFilters() {
  fillTestPointSelect("testPointsLocationFilter", uniqueTestPointValues(testPoints, getLocationName), "All Locations");
  fillTestPointSelect("testPointsStatusFilter", ["Protected", "Warning", "Unprotected", "No Data"], "All statuses");
  fillTestPointSelect("testPointsCoordFilter", uniqueTestPointValues(testPoints, getCoordType), "All coordinate types");
  fillTestPointSelect("testPointsEngineerFilter", uniqueTestPointValues(testPoints, getAssignedEngineer), "All engineers");
  fillTestPointSelect("testPointsActiveFilter", ["Active", "Inactive"], "All states");
}

function applyTestPointPermissions() {
  const canManage = isTestPointsAdmin();
  document.querySelectorAll("[data-admin-only]").forEach((element) => {
    element.hidden = !canManage;
    element.style.display = canManage ? "" : "none";
  });
  const addButton = document.getElementById("openAddTestPointModalButton");
  const importButton = document.getElementById("openImportTestPointsModalButton");
  const exportButton = document.getElementById("exportTestPointsButton");
  if (addButton) addButton.hidden = !canManage;
  if (importButton) importButton.hidden = !canManage;
  if (exportButton) exportButton.hidden = !canManage;
  if (addButton) addButton.style.display = canManage ? "" : "none";
  if (importButton) importButton.style.display = canManage ? "" : "none";
  if (exportButton) exportButton.style.display = canManage ? "" : "none";
}

function getTestPointSortValue(point, key) {
  const map = {
    label: point.label,
    locationName: getLocationName(point),
    type: point.type,
    thresholdMv: point.thresholdMv,
    latestReadingValue: parseReadingValue(point.latestReadingValue),
    weeklyAverage: parseReadingValue(point.weeklyAverage),
    changeFromStart: parseReadingValue(point.changeFromStart),
    status: deriveStatus(point),
    pointNote: getPointNote(point),
    coordType: getCoordType(point),
    assignedEngineer: getAssignedEngineer(point),
    lastUpdated: point.lastUpdated ? new Date(point.lastUpdated).getTime() : null,
    active: getActivityState(point),
  };
  return map[key];
}

function compareTestPointLabels(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base", numeric: true });
}

function sortTestPointRows(points) {
  if (!testPointsState.sortKey) return points.slice();
  const statusOrder = { Protected: 0, Warning: 1, Unprotected: 2, "No Data": 3 };
  const direction = testPointsState.sortDirection === "desc" ? -1 : 1;
  return points.map((point, index) => ({ point, index })).sort((first, second) => {
    const a = first.point;
    const b = second.point;
    const av = getTestPointSortValue(a, testPointsState.sortKey);
    const bv = getTestPointSortValue(b, testPointsState.sortKey);
    const am = av === null || av === undefined || av === "" || Number.isNaN(av);
    const bm = bv === null || bv === undefined || bv === "" || Number.isNaN(bv);
    if (am || bm) return am && bm ? first.index - second.index : am ? 1 : -1;
    let comparison = 0;
    if (testPointsState.sortKey === "status") comparison = (statusOrder[av] ?? 99) - (statusOrder[bv] ?? 99);
    else if (["thresholdMv", "latestReadingValue", "weeklyAverage", "changeFromStart", "lastUpdated"].includes(testPointsState.sortKey)) comparison = Number(av) - Number(bv);
    else comparison = compareTestPointLabels(av, bv);
    return comparison * direction || first.index - second.index;
  }).map(({ point }) => point);
}

function renderTestPointSortHeaders() {
  testPointsSortController?.updateIndicators();
}

function activeTestPointFilterCount() {
  return Object.values(testPointsState.filters).filter(Boolean).length;
}

function renderTestPointColumnVisibilityOptions() {
  const container = document.getElementById("testPointsColumnVisibilityOptions");
  if (!container) return;

  container.innerHTML = TEST_POINT_COLUMN_DEFINITIONS.map((column) => `
    <label class="testpoints-column-toggle ${column.required ? "disabled" : ""}">
      <input
        type="checkbox"
        value="${escapeHtml(column.key)}"
        ${isTestPointColumnVisible(column.key) ? "checked" : ""}
        ${column.required ? "disabled" : ""}
      >
      <span>${escapeHtml(column.label)}</span>
    </label>
  `).join("");
}

function applyTestPointColumnVisibility() {
  document.querySelectorAll("[data-testpoints-column]").forEach((cell) => {
    cell.hidden = !isTestPointColumnVisible(cell.dataset.testpointsColumn);
  });
}

function renderTestPointFilterSummary(filteredPoints) {
  const pages = Math.max(1, Math.ceil(filteredPoints.length / TEST_POINTS_PAGE_SIZE));
  const countLabel = document.getElementById("testPointsCountLabel");
  const resultMeta = document.getElementById("testPointsResultMeta");
  const badge = document.getElementById("testPointsFilterCount");
  const chips = document.getElementById("testPointsFilterChips");
  if (countLabel) countLabel.textContent = `${filteredPoints.length} results`;
  if (resultMeta) resultMeta.textContent = `${filteredPoints.length} results · Page ${currentTestPointsPage} of ${pages}`;
  const count = activeTestPointFilterCount();
  if (badge) {
    badge.hidden = !count;
    badge.textContent = count;
  }
  if (chips) {
    const labels = { location: "Location", status: "Status", coordType: "Coord", engineer: "Engineer", active: "State" };
    chips.innerHTML = Object.entries(testPointsState.filters)
      .filter(([, value]) => value)
      .map(([key, value]) => `<button class="dashboard-filter-chip" type="button" data-testpoints-remove-filter="${key}">${labels[key]}: ${escapeHtml(value)} <i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`)
      .join("");
  }
}

async function fetchLocationsByIds(locationIds) {
  const safeLocationIds = filterUuidList(locationIds);
  if (!safeLocationIds.length) return new Map();

  const { data, error } = await window.appSupabase
    .from(LOCATIONS_TABLE)
    .select("id, site_name, latitude, longitude")
    .in("id", safeLocationIds);

  if (error) throw error;

  return new Map((data || []).map((row) => [row.id, normalizeLocationRow(row)]));
}

async function fetchCurrentPositionsByPointIds(pointIds) {
  const ids = filterUuidList(pointIds);
  const byPointId = new Map();
  for (let index = 0; index < ids.length; index += 200) {
    const { data, error } = await window.appSupabase
      .from(TEST_POINT_POSITIONS_TABLE)
      .select("id, test_point_id, coordinate_mode, latitude, longitude, relative_x_m, relative_y_m, relative_z_m, chainage_m, coordinate_accuracy_m, coordinate_source, is_current, updated_at")
      .in("test_point_id", ids.slice(index, index + 200))
      .eq("is_current", true);
    if (error) throw error;
    (data || []).forEach((row) => byPointId.set(row.test_point_id, row));
  }
  return byPointId;
}

async function loadAssignableEngineers() {
  if (!hasSupabaseReady()) {
    assignableEngineers = [];
    populateAssignedEngineerOptions();
    return;
  }

  try {
    // Engineers are loaded once for the modal and for mapping
    // `assigned_engineer_id -> full_name` in the table.
    const { data, error } = await window.appSupabase
      .from("users")
      .select("id, full_name, role, is_active")
      .eq("is_active", true)
      .eq("role", "corrosion_engineer")
      .order("full_name", { ascending: true });

    if (error) throw error;

    assignableEngineers = (data || [])
      .map((row) => ({
        id: row.id,
        fullName: String(row.full_name || "").trim(),
      }))
      .filter((engineer) => engineer.id && engineer.fullName);
    engineerNameById = new Map(assignableEngineers.map((engineer) => [engineer.id, engineer.fullName]));
  } catch (error) {
    console.warn("Assignable engineers could not be loaded:", error.message || error);
    assignableEngineers = [];
    engineerNameById = new Map();
  }

  populateAssignedEngineerOptions();
}

async function loadLatestWeeklySummariesByPointId(pointIds) {
  testPointsSelectedWeek = "";
  testPointsSelectedWeekEnd = "";
  const Repository = window.AppRepositories?.WeeklySummaryRepository;
  if (!Repository) throw new Error("Weekly Summary repository is unavailable.");

  const repository = new Repository();
  const weeks = (await repository.getAvailableWeeks(40))
    .filter((week) => week?.weekStartDate)
    .sort((first, second) => String(second.weekStartDate).localeCompare(String(first.weekStartDate)));
  if (!weeks.length) return new Map();

  const latestWeek = weeks[0];
  testPointsSelectedWeek = latestWeek.weekStartDate;
  testPointsSelectedWeekEnd = latestWeek.weekEndDate || "";
  const safePointIds = filterUuidList(pointIds);
  if (!safePointIds.length) return new Map();
  const summaries = await repository.getWeeklySummaries(
    testPointsSelectedWeek,
    safePointIds,
  );
  return new Map((summaries || []).map((summary) => [String(summary.testPointUuid), summary]));
}

async function loadTestPoints() {
  testPointLoadWarning = "";
  assignedEngineerSupported = true;
  testPointsSelectedWeek = "";
  testPointsSelectedWeekEnd = "";

  if (!hasSupabaseReady()) {
    testPoints = [];
    testPointLoadWarning = "Supabase is not available. No database data could be loaded.";
    return;
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await window.appSupabase.auth.getUser();

    if (userError || !user) {
      throw new Error(userError?.message || "No authenticated user found.");
    }

    const { data: profile, error: profileError } = await window.appSupabase
      .from("users")
      .select("role, full_name, is_active")
      .eq("id", user.id)
      .single();

    if (profileError) {
      throw new Error(profileError.message || "Could not load user profile.");
    }

    if (!profile.is_active) {
      throw new Error("Your account is inactive.");
    }

    currentTestPointsUserId = user.id;
    currentTestPointsUserRole = String(profile.role || "").trim();

    // We first try the schema with `assigned_engineer_id`. If the column does
    // not exist yet, we retry with the older shape so the page still works.
    let pointRows = [];
    let pointError = null;

    const pointSelectAttempts = [
      {
        query: "id, location_id, label, type, threshold_mv, status, is_active, assigned_engineer_id, note, created_at",
        assignedEngineer: true,
      },
      {
        query: "id, location_id, label, type, threshold_mv, status, is_active, note, created_at",
        assignedEngineer: false,
      },
    ];

    for (const attempt of pointSelectAttempts) {
      ({
        data: pointRows,
        error: pointError,
      } = await window.appSupabase
        .from(TEST_POINTS_TABLE)
        .select(attempt.query)
        .order("created_at", { ascending: false }));

      if (!pointError) {
        assignedEngineerSupported = attempt.assignedEngineer;
        break;
      }

      const message = String(pointError.message || "").toLowerCase();
      const missingAssignedEngineer = message.includes("assigned_engineer_id");
      if (!missingAssignedEngineer) {
        break;
      }
    }

    if (!assignedEngineerSupported) {
      testPointLoadWarning = "Assigned engineer is disabled until the Supabase test_points.assigned_engineer_id column is added.";
      populateAssignedEngineerOptions();
    }

    if (pointError) throw pointError;

    if (currentTestPointsUserRole === "corrosion_engineer") {
      if (assignedEngineerSupported) {
        pointRows = (pointRows || []).filter((row) => {
          const assignedEngineerId = row.assigned_engineer_id || row.assignedEngineerId || "";
          return assignedEngineerId === currentTestPointsUserId;
        });
      } else {
        pointRows = [];
        testPointLoadWarning = "Assigned engineer filtering requires the Supabase test_points.assigned_engineer_id column.";
      }
    }

    const locationIds = [...new Set((pointRows || []).map((row) => row.location_id).filter(Boolean))];

    let locationsById = new Map();
    try {
      locationsById = await fetchLocationsByIds(locationIds);
    } catch (locationError) {
      console.warn("Locations could not be loaded:", locationError.message || locationError);
      testPointLoadWarning = "Locations could not be loaded from Supabase. Showing test points with limited location details.";
    }

    let positionByPointId = new Map();
    let weeklyByPointId = new Map();
    try {
      positionByPointId = await fetchCurrentPositionsByPointIds((pointRows || []).map((row) => row.id));
    } catch (positionError) {
      console.warn("Current positions could not be loaded:", positionError.message || positionError);
      testPointLoadWarning = testPointLoadWarning
        ? `${testPointLoadWarning} Current positions are also unavailable.`
        : "Current positions could not be loaded. Apply the Sprint 5 position migration.";
    }
    try {
      weeklyByPointId = await loadLatestWeeklySummariesByPointId((pointRows || []).map((row) => row.id));
    } catch (weeklyError) {
      console.warn("Latest Weekly Summary could not be loaded:", weeklyError.message || weeklyError);
      testPointLoadWarning = testPointLoadWarning
        ? `${testPointLoadWarning} Weekly values are also unavailable.`
        : "Weekly values could not be loaded. Test Point management remains available.";
    }

    testPoints = (pointRows || []).map((row) =>
      normalizeTestPointRow(
        row,
        locationsById.get(row.location_id),
        positionByPointId.get(row.id),
        weeklyByPointId.get(String(row.id))
      )
    );

    persistLocalCache();
  } catch (error) {
    console.warn("Supabase test point load failed:", error.message || error);
    testPoints = [];
    testPointLoadWarning = `Supabase test point load failed${error?.message ? `: ${error.message}` : "."}`;
  }
}

function renderStats(filteredPoints = getRoleVisibleTestPoints(testPoints)) {
  const statsGrid = document.getElementById("testPointStatsGrid");
  const lastSync = document.getElementById("testPointsLastSync");
  if (!statsGrid) return;

  const protectedCount = filteredPoints.filter((point) => deriveStatus(point) === "Protected").length;
  const warningCount = filteredPoints.filter((point) => deriveStatus(point) === "Warning").length;
  const unprotectedCount = filteredPoints.filter((point) => deriveStatus(point) === "Unprotected").length;
  const noDataCount = filteredPoints.filter((point) => deriveStatus(point) === "No Data").length;
  const activeCount = filteredPoints.filter((point) => point.isActive).length;

  const cards = [
    { value: filteredPoints.length, label: "Total Test Points", tone: "blue" },
    { value: activeCount, label: "Active", tone: "green" },
    { value: protectedCount, label: "Protected", tone: "green" },
    { value: warningCount, label: "Warning", tone: "orange" },
    { value: unprotectedCount, label: "Unprotected", tone: "red" },
    { value: noDataCount, label: "No Data", tone: "gray" },
  ];

  statsGrid.innerHTML = cards
    .map(
      (card) => `
        <article class="testpoints-stat-card ${card.tone}">
          ${getStatIconMarkup(card.tone, card.label)}
          <div>
            <strong>${card.value}</strong>
            <span>${card.label}</span>
          </div>
        </article>
      `
    )
    .join("");

  if (lastSync) {
    lastSync.textContent = testPointLoadWarning || `Last updated ${formatDateTime(new Date().toISOString())} SGT`;
  }
}

function renderPagination(totalRows, totalPages) {
  const pageSummary = document.getElementById("testPointsPageSummary");
  const pagination = document.getElementById("testPointsPagination");

  if (pageSummary) {
    if (!totalRows) {
      pageSummary.textContent = "Showing 0-0 of 0";
    } else {
      // Pagination math:
      // start = (page - 1) * pageSize + 1
      // end   = min(start + pageSize - 1, totalRows)
      const start = (currentTestPointsPage - 1) * TEST_POINTS_PAGE_SIZE + 1;
      const end = Math.min(start + TEST_POINTS_PAGE_SIZE - 1, totalRows);
      pageSummary.textContent = `Showing ${start}-${end} of ${totalRows}`;
    }
  }

  if (!pagination) return;

  if (totalPages <= 1) {
    pagination.innerHTML = "";
    return;
  }

  pagination.innerHTML = `
    <button class="page-btn" type="button" ${currentTestPointsPage === 1 ? "disabled" : ""} data-testpoints-page="${currentTestPointsPage - 1}">&lt;</button>
    ${Array.from({ length: totalPages }, (_, index) => {
      const page = index + 1;
      return `<button class="page-btn ${page === currentTestPointsPage ? "active" : ""}" type="button" data-testpoints-page="${page}">${page}</button>`;
    }).join("")}
    <button class="page-btn" type="button" ${currentTestPointsPage === totalPages ? "disabled" : ""} data-testpoints-page="${currentTestPointsPage + 1}">&gt;</button>
  `;
}

function renderTestPointWeeklyTrend(point) {
  return window.AppTrendPresentation?.renderTrendValue?.({
    deltaMv: point.changeFromStart,
    semanticStatus: point.statusChange,
    context: "week",
  }) || '<span aria-label="No weekly change">—</span>';
}

function renderTestPoints() {
  const tableBody = document.getElementById("testPointTable");
  if (!tableBody) return;

  // Render order is:
  // 1. filter rows
  // 2. sort rows
  // 3. slice the current page
  // 4. paint stats, summary, pagination, and table body
  const filteredPoints = sortTestPointRows(getFilteredTestPoints());
  const totalPages = Math.max(1, Math.ceil(filteredPoints.length / TEST_POINTS_PAGE_SIZE));
  currentTestPointsPage = Math.min(currentTestPointsPage, totalPages);
  const startIndex = (currentTestPointsPage - 1) * TEST_POINTS_PAGE_SIZE;
  const pagedPoints = filteredPoints.slice(startIndex, startIndex + TEST_POINTS_PAGE_SIZE);

  renderStats(filteredPoints);
  renderTestPointFilterSummary(filteredPoints);
  renderTestPointsWeeklyContext();
  renderTestPointColumnVisibilityOptions();
  renderTestPointSortHeaders();
  applyTestPointColumnVisibility();
  renderPagination(filteredPoints.length, totalPages);

  if (!filteredPoints.length) {
    document.getElementById("testPointsEmptyState").hidden = false;
    tableBody.innerHTML = `
      <tr>
        <td colspan="${getVisibleTestPointColumnCount()}">
          ${escapeHtml(testPointLoadWarning || "No test points match the current search and filters.")}
        </td>
      </tr>
    `;
    return;
  }
  document.getElementById("testPointsEmptyState").hidden = true;

  tableBody.innerHTML = pagedPoints
    .map((point) => {
      const status = deriveStatus(point);
      const latestReading = formatReading(point);
      const coordType = getCoordType(point);
      const activity = getActivityState(point);
      const cells = [];

      if (isTestPointColumnVisible("label")) {
        cells.push(`
          <td>
            <button class="testpoint-link-button testpoint-primary-cell" type="button" data-testpoint-view="${escapeHtml(point.id)}" aria-label="View details for ${escapeHtml(point.label)}">
              <strong>${escapeHtml(point.label)}</strong>
            </button>
          </td>
        `);
      }

      if (isTestPointColumnVisible("locationName")) {
        cells.push(`<td><strong>${escapeHtml(getLocationName(point))}</strong></td>`);
      }

      if (isTestPointColumnVisible("latestReadingValue")) {
        const readingTone = status === "Protected" ? "green" : status === "Warning" ? "orange" : status === "Unprotected" ? "red" : "gray";
        cells.push(`<td class="testpoint-reading-cell ${readingTone}">${escapeHtml(latestReading)}</td>`);
      }

      if (isTestPointColumnVisible("weeklyAverage")) {
        cells.push(`<td class="testpoint-reading-cell">${escapeHtml(formatMv(point.weeklyAverage))}</td>`);
      }

      if (isTestPointColumnVisible("changeFromStart")) {
        cells.push(`<td>${renderTestPointWeeklyTrend(point)}</td>`);
      }

      if (isTestPointColumnVisible("status")) {
        cells.push(`<td><span class="badge ${statusClass(status)}">${escapeHtml(status)}</span></td>`);
      }

      if (isTestPointColumnVisible("lastUpdated")) {
        cells.push(`<td>${point.lastUpdated ? escapeHtml(formatDateTime(point.lastUpdated)) : "—"}</td>`);
      }

      if (isTestPointColumnVisible("type")) {
        cells.push(`<td><span class="testpoint-inline-pill gray">${escapeHtml(point.type)}</span></td>`);
      }

      if (isTestPointColumnVisible("thresholdMv")) {
        cells.push(`<td>${escapeHtml(formatMv(point.thresholdMv))}</td>`);
      }

      if (isTestPointColumnVisible("pointNote")) {
        cells.push(`<td>${escapeHtml(getPointNote(point))}</td>`);
      }

      if (isTestPointColumnVisible("coordType")) {
        cells.push(`
          <td>
            <div class="testpoint-secondary-cell">
              <strong>${escapeHtml(coordType)}</strong>
              <span>${escapeHtml(getCoordinates(point))}</span>
            </div>
          </td>
        `);
      }

      if (isTestPointColumnVisible("assignedEngineer")) {
        cells.push(`<td>${escapeHtml(getAssignedEngineer(point))}</td>`);
      }

      if (isTestPointColumnVisible("active")) {
        cells.push(`<td><span class="testpoint-inline-pill ${activity === "Active" ? "green" : "gray"}">${escapeHtml(activity)}</span></td>`);
      }

      if (isTestPointColumnVisible("actions")) {
        cells.push(`
          <td class="actions testpoint-actions">
            <button class="btn btn-light" type="button" data-testpoint-view="${escapeHtml(point.id)}">View</button>
            ${isTestPointsAdmin()
              ? `<button class="btn btn-light" type="button" data-testpoint-edit="${escapeHtml(point.id)}">Edit</button>
            <button class="btn btn-light" type="button" data-testpoint-position="${escapeHtml(point.id)}">Edit Position</button>
            <button class="btn btn-light" type="button" data-testpoint-toggle="${escapeHtml(point.id)}">${point.isActive ? "Deactivate" : "Activate"}</button>`
              : `<button class="btn btn-light" type="button" data-testpoint-position="${escapeHtml(point.id)}">View Position</button>`}
          </td>
        `);
      }

      return `
        <tr>
          ${cells.join("")}
        </tr>
      `;
    })
    .join("");
}

function setTestPointsPage(page) {
  currentTestPointsPage = Math.max(1, page);
  renderTestPoints();
}

function resetTestPointFilters() {
  testPointsState.search = "";
  testPointsState.filters = { location: "", status: "", coordType: "", engineer: "", active: "" };
  currentTestPointsPage = 1;
  const search = document.getElementById("searchInput");
  if (search) search.value = "";
  populateTestPointFilters();
  renderTestPoints();
}

function handleTestPointsSearch(value) {
  testPointsState.search = String(value || "").trim();
  currentTestPointsPage = 1;
  const searchInput = document.getElementById("searchInput");
  if (searchInput && searchInput.value !== testPointsState.search) {
    searchInput.value = testPointsState.search;
  }
  renderTestPoints();
}

function exportTestPointsTable() {
  if (!isTestPointsAdmin()) return;

  if (!window.XLSX) {
    alert("Excel export is not available right now. Please refresh the page and try again.");
    return;
  }

  const filteredPoints = getFilteredTestPoints();

  if (!filteredPoints.length) {
    alert("There are no test points to export.");
    return;
  }

  const rows = filteredPoints.map((point) => {
    const status = deriveStatus(point);
    // Export only the visible business fields and intentionally leave out the
    // action buttons used by the interactive table.
    return protectSpreadsheetRow({
      "Test Point": point.label,
      Location: getLocationName(point),
      Type: point.type,
      "Threshold (mV)": PROTECTED_THRESHOLD_MV,
      "Latest Reading": formatReading(point),
      "Weekly Average": formatMv(point.weeklyAverage),
      "Change This Week": window.AppTrendPresentation?.formatDelta?.(point.changeFromStart) || "—",
      "Protection Status": status,
      "Test Point Note": point.pointNote || "",
      Coordinates: getCoordinates(point),
      "Assigned Engineer": getAssignedEngineer(point),
      "Last Updated": formatDateTime(point.lastUpdated),
      Active: getActivityState(point),
    });
  });

  const worksheet = window.XLSX.utils.json_to_sheet(rows);
  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, worksheet, "Test Points");

  const exportedAt = new Date().toISOString().slice(0, 10);
  window.XLSX.writeFile(workbook, `test-points-${exportedAt}.xlsx`);
}

function bindTestPointListControls() {
  const signal = testPointsAbortController?.signal;
  const filtersButton = document.getElementById("testPointsFiltersButton");
  const filtersPanel = document.getElementById("testPointsAdvancedFilters");
  // All listeners are attached with an AbortController so revisiting the page
  // does not stack duplicate handlers on top of old ones.
  let searchTimer;
  document.getElementById("searchInput")?.addEventListener("input", (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      handleTestPointsSearch(event.target.value);
    }, 275);
  }, { signal });

  filtersButton?.addEventListener("click", () => {
    if (!filtersPanel) return;
    filtersPanel.hidden = !filtersPanel.hidden;
    filtersButton.setAttribute("aria-expanded", String(!filtersPanel.hidden));
  }, { signal });

  document.getElementById("testPointsReset")?.addEventListener("click", resetTestPointFilters, { signal });
  document.getElementById("testPointsClearEmpty")?.addEventListener("click", resetTestPointFilters, { signal });
  document.getElementById("testPointsRowsPerPage")?.addEventListener("change", (event) => {
    TEST_POINTS_PAGE_SIZE = Number(event.target.value);
    currentTestPointsPage = 1;
    renderTestPoints();
  }, { signal });

  const map = {
    testPointsLocationFilter: "location",
    testPointsStatusFilter: "status",
    testPointsCoordFilter: "coordType",
    testPointsEngineerFilter: "engineer",
    testPointsActiveFilter: "active",
  };

  Object.entries(map).forEach(([id, key]) => {
    document.getElementById(id)?.addEventListener("change", (event) => {
      testPointsState.filters[key] = event.target.value;
      currentTestPointsPage = 1;
      populateTestPointFilters();
      renderTestPoints();
    }, { signal });
  });

  document.getElementById("testPointsFilterChips")?.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-testpoints-remove-filter]");
    if (!chip) return;
    testPointsState.filters[chip.dataset.testpointsRemoveFilter] = "";
    populateTestPointFilters();
    renderTestPoints();
  }, { signal });

  document.getElementById("testPointsColumnVisibilityOptions")?.addEventListener("change", (event) => {
    const input = event.target.closest('input[type="checkbox"]');
    if (!input) return;
    const selectedColumns = [...document.querySelectorAll('#testPointsColumnVisibilityOptions input[type="checkbox"]:checked')]
      .map((checkbox) => checkbox.value);
    testPointsState.visibleColumns = sanitizeVisibleTestPointColumns(selectedColumns);
    persistVisibleTestPointColumns();
    renderTestPoints();
  }, { signal });

  document.getElementById("openAddTestPointModalButton")?.addEventListener("click", openAddTestPointModal, { signal });
  document.getElementById("openImportTestPointsModalButton")?.addEventListener("click", openImportTestPointsModal, { signal });
  document.getElementById("exportTestPointsButton")?.addEventListener("click", exportTestPointsTable, { signal });
  document.getElementById("closeTestPointModalButton")?.addEventListener("click", closeTestPointModal, { signal });
  document.getElementById("closeImportTestPointsModalButton")?.addEventListener("click", closeImportTestPointsModal, { signal });
  document.getElementById("downloadTestPointsTemplateButton")?.addEventListener("click", downloadTestPointsTemplate, { signal });
  document.getElementById("testPointSubmitButton")?.addEventListener("click", saveTestPoint, { signal });
  document.getElementById("submitImportTestPointsButton")?.addEventListener("click", importTestPointsFromExcel, { signal });
  document.getElementById("testPointsPagination")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-testpoints-page]");
    if (button) setTestPointsPage(Number(button.dataset.testpointsPage));
  }, { signal });
  document.getElementById("testPointTable")?.addEventListener("click", (event) => {
    const viewButton = event.target.closest("[data-testpoint-view]");
    if (viewButton) viewTestPoint(viewButton.dataset.testpointView);

    const editButton = event.target.closest("[data-testpoint-edit]");
    if (editButton) openEditTestPointModal(editButton.dataset.testpointEdit);

    const positionButton = event.target.closest("[data-testpoint-position]");
    if (positionButton) {
      const point = testPoints.find((entry) => entry.id === positionButton.dataset.testpointPosition);
      testPointPositionController?.open(point, { trigger: positionButton });
    }

    const toggleButton = event.target.closest("[data-testpoint-toggle]");
    if (toggleButton) toggleTestPointActive(toggleButton.dataset.testpointToggle);
  }, { signal });
}

function clearTestPointForm() {
  editingTestPointId = "";
  document.getElementById("testPointModalTitle").textContent = "Add Test Point";
  document.getElementById("testPointSubmitButton").textContent = "Save Test Point";
  document.getElementById("tpLabelInput").value = "";
  document.getElementById("tpLocationInput").value = "";
  document.getElementById("tpTypeInput").value = "stationary";
  document.getElementById("tpPointNoteInput").value = "";
  populateAssignedEngineerOptions();
  document.getElementById("tpActiveInput").value = "true";
}

function openAddTestPointModal() {
  if (!isTestPointsAdmin()) return;
  clearTestPointForm();
  openModal("addTpModal");
}

function openEditTestPointModal(id) {
  if (!isTestPointsAdmin()) return;
  const point = testPoints.find((entry) => entry.id === id);
  if (!point) return;

  editingTestPointId = id;
  document.getElementById("testPointModalTitle").textContent = `Edit ${point.label}`;
  document.getElementById("testPointSubmitButton").textContent = "Save Changes";
  document.getElementById("tpLabelInput").value = point.label;
  document.getElementById("tpLocationInput").value = point.locationName;
  document.getElementById("tpTypeInput").value = point.type || "stationary";
  document.getElementById("tpPointNoteInput").value = point.pointNote || "";
  populateAssignedEngineerOptions(point.assignedEngineerId || "");
  document.getElementById("tpActiveInput").value = point.isActive ? "true" : "false";
  openModal("addTpModal");
}

function closeTestPointModal() {
  clearTestPointForm();
  closeModal("addTpModal");
}

function clearImportTestPointsForm() {
  const input = document.getElementById("testPointsImportFileInput");
  if (input) input.value = "";
}

function openImportTestPointsModal() {
  if (!isTestPointsAdmin()) return;
  clearImportTestPointsForm();
  openModal("importTestPointsModal");
}

function closeImportTestPointsModal() {
  clearImportTestPointsForm();
  closeModal("importTestPointsModal");
}

async function readImportRowsFromFile(file) {
  if (!window.XLSX) {
    throw new Error("Excel import is not available right now. Please refresh the page and try again.");
  }

  const buffer = await file.arrayBuffer();
  const workbook = window.XLSX.read(buffer, { type: "array" });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  return window.XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: true });
}

function downloadTestPointsTemplate() {
  if (!window.XLSX) {
    downloadSpreadsheetFallback(
      TEST_POINT_IMPORT_TEMPLATE_ROWS.map(protectSpreadsheetRow),
      TEST_POINT_IMPORT_HEADERS,
      "test-points-import-template.csv"
    );
    window.notifyUser?.("Excel library is unavailable, so we downloaded a CSV template instead.", "warning");
    return;
  }

  const worksheet = window.XLSX.utils.json_to_sheet(
    TEST_POINT_IMPORT_TEMPLATE_ROWS.map(protectSpreadsheetRow),
    { header: TEST_POINT_IMPORT_HEADERS }
  );
  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, worksheet, "Test Points Import");
  window.XLSX.writeFile(workbook, "test-points-import-template.xlsx");
}

function parseImportType(value, rowNumber) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  if (!normalizedValue) {
    throw new Error(`Type is required at import row ${rowNumber}.`);
  }
  if (!["stationary", "variable"].includes(normalizedValue)) {
    throw new Error(`Type must be "stationary" or "variable" at import row ${rowNumber}.`);
  }
  return normalizedValue;
}

function parseImportActiveValue(value) {
  if (value === null || value === undefined || value === "") return true;
  const normalizedValue = String(value).trim().toLowerCase();
  if (["true", "yes", "y", "1", "active"].includes(normalizedValue)) return true;
  if (["false", "no", "n", "0", "inactive"].includes(normalizedValue)) return false;
  throw new Error(`Active must be TRUE/FALSE, Yes/No, or Active/Inactive.`);
}

function resolveAssignedEngineerIdForImport(name, rowNumber) {
  const normalizedName = String(name || "").trim();
  if (!normalizedName) return "";
  if (!assignedEngineerSupported) {
    throw new Error(`Assigned Engineer cannot be imported until the test_points.assigned_engineer_id column is available (import row ${rowNumber}).`);
  }

  const match = assignableEngineers.find((engineer) => engineer.fullName.localeCompare(normalizedName, undefined, { sensitivity: "base" }) === 0);
  if (!match) {
    throw new Error(`Assigned Engineer "${normalizedName}" was not found for import row ${rowNumber}.`);
  }
  return match.id;
}

function parseTestPointImportRows(rows) {
  if (!rows.length) {
    throw new Error("The selected import file does not contain any data rows.");
  }

  const firstRow = rows[0] || {};
  const usesLocationColumn = "Location" in firstRow;
  const missingHeaders = ["Test Point Label", "Type"]
    .filter((header) => !(header in firstRow));
  if (!usesLocationColumn && !("Site Name" in firstRow)) missingHeaders.push("Location");
  if (missingHeaders.length) {
    throw new Error(`Missing required columns: ${missingHeaders.join(", ")}.`);
  }

  const seenRows = new Set();
  return rows.map((row, index) => {
    const rowNumber = index + 2;
    const label = String(row["Test Point Label"] || "").trim();
    // The legacy Site Name heading remains an import-only alias. When both
    // headings exist, Location is authoritative, including its validation.
    const locationName = String(usesLocationColumn ? row.Location : row["Site Name"] || "").trim();
    const type = parseImportType(row.Type, rowNumber);
    // Legacy threshold columns are accepted but ignored.
    const thresholdMv = PROTECTED_THRESHOLD_MV;
    const pointNote = String(row["Test Point Note"] || "").trim();
    const assignedEngineerId = resolveAssignedEngineerIdForImport(row["Assigned Engineer"], rowNumber);
    let isActive = true;

    if (!label || !locationName) {
      throw new Error(`Test Point Label and Location are required at Excel row ${rowNumber}.`);
    }

    try {
      isActive = parseImportActiveValue(row.Active);
    } catch (error) {
      throw new Error(`${error.message} (import row ${rowNumber})`);
    }

    const duplicateKey = `${locationName.toLowerCase()}::${label.toLowerCase()}`;
    if (seenRows.has(duplicateKey)) {
      throw new Error(`Duplicate Test Point Label and Location found in Excel row ${rowNumber}.`);
    }
    seenRows.add(duplicateKey);

    return {
      label,
      locationName,
      type,
      thresholdMv,
      pointNote,
      assignedEngineerId,
      isActive,
    };
  });
}

function buildTestPointPayload(record, locationId, currentPoint = null) {
  const storedStatus = currentPoint ? String(currentPoint.databaseStatus || "unknown").toLowerCase() : "unknown";
  const payload = {
    location_id: locationId,
    label: record.label,
    type: record.type,
    status: storedStatus,
    is_active: record.isActive,
    note: record.pointNote || null,
  };

  if (!currentPoint) payload.threshold_mv = PROTECTED_THRESHOLD_MV;

  if (assignedEngineerSupported) {
    payload.assigned_engineer_id = record.assignedEngineerId || null;
  }
  return payload;
}

async function upsertTestPointRecord(record) {
  const locationId = await resolveLocationForSave(record.locationName);
  const existingPoint = await findDuplicateTestPoint(record.label, locationId);
  const currentPoint = existingPoint ? testPoints.find((point) => point.id === existingPoint.id) || null : null;
  const payload = buildTestPointPayload(record, locationId, currentPoint || existingPoint);

  if (existingPoint) {
    const { error } = await window.appSupabase
      .from(TEST_POINTS_TABLE)
      .update(payload)
      .eq("id", existingPoint.id);

    if (error) throw error;
    return "updated";
  }

  await createTestPointInDatabase(payload);
  return "created";
}

async function importTestPointsFromExcel() {
  if (!isTestPointsAdmin()) {
    window.notifyUser?.("Only admins can import test points.", "warning");
    return;
  }

  if (!hasSupabaseReady()) {
    window.notifyUser?.("Supabase is not available. This page needs the database connection to import accurately.", "error");
    return;
  }

  const fileInput = document.getElementById("testPointsImportFileInput");
  const file = fileInput?.files?.[0];
  if (!file) {
    window.notifyUser?.("Choose an Excel file before importing.", "warning");
    return;
  }

  const importButton = document.getElementById("submitImportTestPointsButton");
  if (importButton) importButton.disabled = true;

  try {
    const rawRows = await readImportRowsFromFile(file);
    const rows = parseTestPointImportRows(rawRows);

    let createdCount = 0;
    let updatedCount = 0;

    for (const row of rows) {
      const action = await upsertTestPointRecord(row);
      if (action === "created") createdCount += 1;
      if (action === "updated") updatedCount += 1;
    }

    closeImportTestPointsModal();
    await loadTestPoints();
    populateTestPointFilters();
    renderTestPoints();
    window.notifyUser?.(`Import complete. ${createdCount} created, ${updatedCount} updated.`, "success");
  } catch (error) {
    window.notifyUser?.(`Unable to import test points: ${error.message || error}`, "error");
  } finally {
    if (importButton) importButton.disabled = false;
  }
}

async function findLocationByName(locationName) {
  const { data, error } = await window.appSupabase
    .from(LOCATIONS_TABLE)
    .select("id, site_name, latitude, longitude")
    .eq("site_name", locationName)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function resolveLocationForSave(locationName) {
  const {
    data: { user },
  } = await window.appSupabase.auth.getUser();

  const existingLocation = await findLocationByName(locationName);

  if (existingLocation) {
    return existingLocation.id;
  }

  const { data, error } = await window.appSupabase
    .from(LOCATIONS_TABLE)
    .insert({
      site_name: locationName,
      created_by: user?.id || null,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function createTestPointInDatabase(payload) {
  const { data, error } = await window.appSupabase
    .from(TEST_POINTS_TABLE)
    .insert(payload)
    .select("id, label, location_id, type, threshold_mv, status, is_active, note, created_at")
    .single();

  if (error) throw error;
  return data;
}

async function findDuplicateTestPoint(label, locationId, excludeId = "") {
  let query = window.appSupabase
    .from(TEST_POINTS_TABLE)
    .select("id, label")
    .eq("label", label)
    .eq("location_id", locationId);

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

async function saveTestPoint() {
  if (!isTestPointsAdmin()) {
    window.notifyUser?.("Only admins can manage test points.", "warning");
    return;
  }

  const label = document.getElementById("tpLabelInput").value.trim();
  const locationName = document.getElementById("tpLocationInput").value.trim();
  const type = document.getElementById("tpTypeInput").value;
  const thresholdMv = PROTECTED_THRESHOLD_MV;
  const pointNote = document.getElementById("tpPointNoteInput").value.trim();
  const assignedEngineerId = document.getElementById("tpEngineerInput").value.trim();
  const isActive = document.getElementById("tpActiveInput").value === "true";

  if (!label || !locationName) {
    window.notifyUser?.("Please enter the Test Point label and Location.", "warning");
    return;
  }

  if (!hasSupabaseReady()) {
    window.notifyUser?.("Supabase is not available. This page needs the database connection to save accurately.", "error");
    return;
  }

  try {
    const locationId = await resolveLocationForSave(locationName);
    const duplicatePoint = await findDuplicateTestPoint(label, locationId, editingTestPointId);

    if (duplicatePoint) {
      window.notifyUser?.(`A test point named "${label}" already exists for this location.`, "warning");
      return;
    }

    const currentPoint = testPoints.find((point) => point.id === editingTestPointId) || null;
    const payload = buildTestPointPayload({
      label,
      locationName,
      type,
      thresholdMv,
      pointNote,
      isActive,
      assignedEngineerId,
    }, locationId, currentPoint);

    if (editingTestPointId) {
      // Use an exact count instead of .select().single() so we can detect
      // "0 rows updated" (e.g. blocked by RLS) without needing a SELECT
      // policy that lets us read the row back.
      const { error, count } = await window.appSupabase
        .from(TEST_POINTS_TABLE)
        .update(payload, { count: "exact" })
        .eq("id", editingTestPointId);

      if (error) throw error;
      if (!count) {
        throw new Error(
          "No changes were saved. You may not have permission to edit this test point (check Supabase Row Level Security policies for updates on test_points)."
        );
      }
    } else {
      await createTestPointInDatabase(payload);
    }

    closeTestPointModal();
    window.notifyUser?.("Test point saved successfully.", "success");
    await loadTestPoints();
    populateTestPointFilters();
    renderTestPoints();
  } catch (error) {
    if (error?.code === "23505") {
      window.notifyUser?.("A test point with this label already exists for the selected location.", "warning");
      return;
    }

    window.notifyUser?.(`Unable to save this test point: ${error.message || error}`, "error");
  }
}

async function toggleTestPointActive(id) {
  const normalizedId = normalizeUuid(id);
  if (!isTestPointsAdmin()) {
    window.notifyUser?.("Only admins can manage test points.", "warning");
    return;
  }

  if (!normalizedId) {
    window.notifyUser?.("This test point cannot be updated.", "warning");
    return;
  }

  const point = testPoints.find((entry) => entry.id === normalizedId);
  if (!point) return;

  if (!hasSupabaseReady()) {
    window.notifyUser?.("Supabase is not available. This page needs the database connection to update active state.", "error");
    return;
  }

  try {
    const { error } = await window.appSupabase
      .from(TEST_POINTS_TABLE)
      .update({ is_active: !point.isActive })
      .eq("id", normalizedId);

    if (error) throw error;
    await loadTestPoints();
    renderTestPoints();
  } catch (error) {
    window.notifyUser?.(`Unable to update active state: ${error.message || error}`, "error");
  }
}

function viewTestPoint(id) {
  const normalizedId = normalizeUuid(id);
  if (!normalizedId) {
    window.notifyUser?.("This test point cannot be opened.", "warning");
    return;
  }

  // Prefer internal navigation so the shared layout stays mounted and the app
  // does not do a full browser refresh.
  const target = window.AppNavigation?.buildTestPointDetailUrl?.(normalizedId, {
    returnTo: "testpoints.php",
    returnSearch: location.search,
  }) || `testpoint-view.php?id=${encodeURIComponent(normalizedId)}&returnTo=testpoints.php`;
  if (window.AppNavigation?.navigateToPage) {
    window.AppNavigation.navigateToPage(target);
    return;
  }
  location.href = target;
}

async function initTestPointsPage() {
  // Initialization order matters:
  // 1. reset page listeners
  // 2. bind controls so the toolbar works even while data is still loading
  // 3. load engineers for the modal/name mapping
  // 4. load test points and readings
  // 5. render the table
  testPointsAbortController?.abort();
  testPointsAbortController = new AbortController();
  const preferredRows = Number(window.AppPreferences?.getCurrent?.().tableRows);
  TEST_POINTS_PAGE_SIZE = [10, 25, 50].includes(preferredRows) ? preferredRows : 25;
  const rowsPerPageSelect = document.getElementById("testPointsRowsPerPage");
  if (rowsPerPageSelect) rowsPerPageSelect.value = String(TEST_POINTS_PAGE_SIZE);
  testPoints = [];
  currentTestPointsPage = 1;
  testPointLoadWarning = "";
  testPointsSelectedWeek = "";
  testPointsSelectedWeekEnd = "";
  testPointsState.sortKey = "";
  testPointsState.sortDirection = null;
  testPointsState.visibleColumns = loadVisibleTestPointColumns();
  testPointsSortController?.destroy();
  testPointsSortController = new window.TableSortController({
    root: document.querySelector(".testpoint-management-table thead"),
    onSortChanged: ({ key, direction }) => {
      testPointsState.sortKey = key;
      testPointsState.sortDirection = direction;
      currentTestPointsPage = 1;
      renderTestPoints();
    },
  });
  bindTestPointListControls();
  await loadAssignableEngineers();
  await loadTestPoints();
  testPointPositionController?.destroy();
  testPointPositionController = new window.TestPointPositionController({
    repository: new window.AssetMapRepository(),
    getUserRole: () => currentTestPointsUserRole,
    onSaved: async () => {
      await loadTestPoints();
      populateTestPointFilters();
      renderTestPoints();
    },
  });
  applyTestPointPermissions();
  populateTestPointFilters();
  renderTestPoints();

  const requestedPositionId = new URLSearchParams(location.search).get("position");
  const requestedPoint = requestedPositionId
    ? testPoints.find((point) => point.id === requestedPositionId)
    : null;
  if (requestedPoint) {
    const cleanUrl = new URL(location.href);
    cleanUrl.searchParams.delete("position");
    history.replaceState(history.state, "", cleanUrl);
    await testPointPositionController.open(requestedPoint, { trigger: null });
  }
}

function destroyTestPointsPage() {
  editingTestPointId = "";
  testPoints = [];
  assignableEngineers = [];
  engineerNameById = new Map();
  currentTestPointsPage = 1;
  testPointLoadWarning = "";
  testPointsSelectedWeek = "";
  testPointsSelectedWeekEnd = "";
  currentTestPointsUserId = "";
  currentTestPointsUserRole = "";
  testPointPositionController?.destroy();
  testPointPositionController = null;
  testPointsSortController?.destroy();
  testPointsSortController = null;
  testPointsAbortController?.abort();
  testPointsAbortController = null;
}

window.TestPointsPage = { init: initTestPointsPage, destroy: destroyTestPointsPage };

document.addEventListener("DOMContentLoaded", async () => {
  const page = window.getCurrentPageName?.() || location.pathname.split("/").pop();
  if (page === "testpoints.php") await initTestPointsPage();
});
window.addEventListener("pageshow", async (event) => {
  const page = window.getCurrentPageName?.() || location.pathname.split("/").pop();
  if (page === "testpoints.php" && event.persisted) {
    await initTestPointsPage();
  }
});
window.setTestPointsPage = setTestPointsPage;
window.handleTestPointsSearch = handleTestPointsSearch;
window.exportTestPointsTable = exportTestPointsTable;
})();
