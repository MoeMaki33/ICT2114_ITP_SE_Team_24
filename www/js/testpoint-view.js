(() => {
  const TEST_POINTS_TABLE = "test_points";
  const LOCATIONS_TABLE = "locations";
  const TEST_POINT_READINGS_TABLE = "test_point_readings";
  const READING_BATCHES_TABLE = "reading_batches";
  const USERS_TABLE = "users";
  const TEST_POINT_EQUIPMENT_VERSIONS_TABLE = "test_point_equipment_versions";
  const PROTECTED_THRESHOLD_MV = window.AppStatus.DEFAULT_PROTECTION_THRESHOLD_MV;
  const TEST_POINT_STORAGE_KEY = "testPointsData";
  const DETAIL_HISTORY_LIMIT = 1000;
  const DETAIL_CHART_SOURCE_LIMIT = 1000;
  const DETAIL_HISTORY_DEFAULT_PAGE_SIZE = 25;
  const DETAIL_ENVIRONMENT_PERIOD_LIMIT = 3000;
  const DETAIL_PH_NEUTRAL = 7;
  const DETAIL_CONDUCTIVITY_UNIT = window.AppSettings.measurements.conductivity.unit;
  const DETAIL_CONDUCTIVITY_IMPORT_HEADER = `Medium Conductivity (${DETAIL_CONDUCTIVITY_UNIT})`;
  // Spreadsheets written before the 5 Oct unit decision still carry the mS/cm
  // header, so keep accepting it as an alias (values are not converted).
  const DETAIL_LEGACY_CONDUCTIVITY_IMPORT_HEADER = "Medium Conductivity (mS/cm)";
  const DETAIL_ENVIRONMENT_METRICS = {
    conductivity: {
      label: "Conductivity",
      valueKey: "conductivityValue",
      unit: DETAIL_CONDUCTIVITY_UNIT,
      color: "#0073bc",
      decimals: 0,
      chartId: "detailConductivityChart",
    },
    ph: {
      label: "pH",
      valueKey: "phValue",
      unit: "pH",
      color: "#7c3aed",
      decimals: 2,
      chartId: "detailPhChart",
    },
  };
  const DETAIL_IMPORT_HEADERS = [
    "Time",
    "Reading (mV)",
    "Temperature (degree C)",
    DETAIL_CONDUCTIVITY_IMPORT_HEADER,
    "pH",
    "Dissolved Oxygen (mg/L)",
    "Power (watts)",
  ];
  const DETAIL_IMPORT_WARNING_PREVIEW_LIMIT = 8;
  const EQUIPMENT_CHANGE_TYPE_LABELS = {
    initial_install: "Initial Install",
    replacement: "Replacement",
    upgrade: "Upgrade",
    repair: "Repair",
    calibration: "Calibration",
  };
  // Matches the 1-hour window in the "Users can edit their own recent ..."
  // Supabase RLS policies (supabase/migrations/allow_recent_manual_reading_edits.sql).
  // Admins aren't subject to this window at all — they can always edit.
  const READING_EDIT_WINDOW_MS = 60 * 60 * 1000;

  let currentChartRange = "week";
  let currentChartTestPoint = null;
  let currentChartEntries = [];
  let currentDetailHistoryChart = null;
  const currentDetailEnvironmentCharts = {};
  let detailEnvironmentRequestToken = 0;
  let currentDetailPointId = null;
  let currentDetailTestPoint = null;
  let currentEquipmentVersions = [];
  let currentDetailLatestEntry = null;
  let currentDetailWeeklyData = null;
  let detailWeeklyView = null;
  let detailLocationView = null;
  let detailPositionController = null;
  let detailAssetMapRepository = null;
  let currentUserId = null;
  let currentUserIsAdmin = false;
  let currentHistoryPage = 1;
  let currentHistoryEntries = [];
  let currentAllHistoryEntries = [];
  let detailHistorySearch = "";
  function getDetailHistoryDefaultPageSize() {
    const preferredRows = Number(window.AppPreferences?.getCurrent?.().tableRows);
    return [10, 25, 50].includes(preferredRows) ? preferredRows : DETAIL_HISTORY_DEFAULT_PAGE_SIZE;
  }

  let detailHistoryRowsPerPage = getDetailHistoryDefaultPageSize();
  const detailHistoryFilters = { status: "", source: "", recordedBy: "" };
  let detailHistorySortKey = "sortDate";
  let detailHistorySortDirection = "desc";
  let detailHistorySortController = null;
  let testPointViewAbortController = null;
  let detailChartRefreshTimer = null;
  let detailChartRetryTimer = null;
  let detailChartResizeObserver = null;

  function hasSupabaseReady() {
    return Boolean(window.appSupabase && window.isSupabaseConfigured && window.isSupabaseConfigured());
  }

  function canManageDetailHistoryActions() {
    return String(localStorage.getItem("userRole") || "").trim().toLowerCase() === "admin";
  }

  function ensureSharedLayoutVisible() {
    const sidebar = document.querySelector(".sidebar");
    const topbar = document.querySelector(".topbar");
    const sidebarEmpty = sidebar && !sidebar.children.length && !sidebar.textContent.trim();
    const topbarEmpty = topbar && !topbar.children.length && !topbar.textContent.trim();

    if ((sidebarEmpty || topbarEmpty) && typeof window.buildLayout === "function") {
      window.buildLayout();
    }
  }

  function getSelectedId() {
    return normalizeUuid(new URLSearchParams(location.search).get("id"));
  }

  function getDetailUserRole() {
    try {
      return String(localStorage.getItem("userRole") || "engineer").toLowerCase();
    } catch (_error) {
      return "engineer";
    }
  }

  function toDetailPositionControllerPoint(testPoint) {
    const position = testPoint?.position || {};
    return {
      id: testPoint.id,
      testPointId: testPoint.id,
      label: testPoint.label,
      displayId: testPoint.label,
      locationId: testPoint.locationId,
      siteName: testPoint.site,
      position: {
        ...position,
        coordinateMode: position.coordinateMode || position.coordinate_mode || "unmapped",
        relativeX: position.relativeX ?? position.relative_x_m,
        relativeY: position.relativeY ?? position.relative_y_m,
        relativeZ: position.relativeZ ?? position.relative_z_m,
        chainageM: position.chainageM ?? position.chainage_m,
        coordinateAccuracyM: position.coordinateAccuracyM ?? position.coordinate_accuracy_m,
        coordinateSource: position.coordinateSource ?? position.coordinate_source,
      },
    };
  }

  async function refreshDetailPosition(testPointId) {
    if (!testPointId || currentDetailPointId !== testPointId) return;
    const refreshed = await fetchTestPoint(testPointId);
    if (currentDetailPointId !== testPointId) return;
    const enriched = {
      ...refreshed,
      latestReading: parseNumericValue(currentDetailLatestEntry?.latestReading),
      displayStatus: currentDetailLatestEntry?.status || normalizePointStatus(refreshed.status) || "Unknown",
    };
    currentDetailTestPoint = enriched;
    await detailLocationView?.render(enriched);
  }

  function configureDetailReturnNavigation() {
    const button = document.getElementById("testPointDetailBackButton");
    if (!button) return;
    const returnContext = window.AppNavigation?.getTestPointReturnContext?.() || {
      url: "testpoints.php",
      label: "Test Points",
    };
    const accessibleLabel = `Back to ${returnContext.label}`;
    button.setAttribute("aria-label", accessibleLabel);
    button.title = accessibleLabel;
    button.dataset.returnTarget = returnContext.url;
    button.addEventListener("click", () => {
      if (window.AppNavigation?.navigateToReturn) {
        window.AppNavigation.navigateToReturn(returnContext.url);
        return;
      }
      location.href = returnContext.url;
    }, { signal: testPointViewAbortController.signal });
  }

  function goToEditReadingPage(readingId) {
    const selectedId = getSelectedId();
    if (!selectedId || !readingId) return;
    location.href = `testpoint-update.php?id=${encodeURIComponent(selectedId)}&reading=${encodeURIComponent(readingId)}`;
  }

  function handleEditReadingEntry(readingId) {
    if (!canManageDetailHistoryActions()) {
      window.AppToast?.error?.("You do not have permission to edit readings.");
      return;
    }

    if (!readingId || !looksLikeUuid(readingId)) {
      window.AppToast?.error?.("This reading cannot be edited.");
      return;
    }

    const selectedEntry = currentHistoryEntries.find((entry) => entry?.id === readingId) || null;
    if (!selectedEntry?.batchId) {
      window.AppToast?.error?.("This reading cannot be edited.");
      return;
    }

    if (selectedEntry.uploadMethod === "bulk") {
      window.AppToast?.error?.("Imported bulk readings cannot be edited here.");
      return;
    }

    goToEditReadingPage(readingId);
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

  function parseNumericValue(value) {
    const numericValue = Number.parseFloat(String(value || "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(numericValue) ? numericValue : null;
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

  async function fetchTestPointRow(pointId) {
    const baseFields = "id, location_id, label, type, threshold_mv, status, is_active, note, latitude, longitude, created_at";
    let { data, error } = await window.appSupabase
      .from(TEST_POINTS_TABLE)
      .select(`${baseFields}, current_equipment_version_id`)
      .eq("id", pointId)
      .maybeSingle();

    if (error && String(error.message || "").includes("current_equipment_version_id")) {
      const fallbackResult = await window.appSupabase
        .from(TEST_POINTS_TABLE)
        .select(baseFields)
        .eq("id", pointId)
        .maybeSingle();
      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) throw error;
    return data;
  }

  function normalizeMeasuredAt(value) {
    return String(value || "")
      .replace(/\s*min\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function formatDisplayDateTime(value) {
    if (!value) return "N/A";

    const normalizedValue = normalizeMeasuredAt(value);
    const parsedDate = new Date(normalizedValue);
    if (Number.isNaN(parsedDate.getTime())) {
      return normalizedValue || "N/A";
    }

    return formatDateTime(parsedDate);
  }

  function formatChartLabel(value, range = currentChartRange) {
    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
      return "Update";
    }

    // Day view shows time because multiple readings can happen on the same day.
    // Week/month views switch to calendar dates to make the broader trend easier to read.
    if (range === "day") {
      return parsedDate.toLocaleTimeString("en-SG", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }

    return parsedDate.toLocaleDateString("en-SG", {
      day: "2-digit",
      month: "short",
    });
  }

  function formatDateTime(value) {
    if (!value) return "N/A";

    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
      return "N/A";
    }

    return parsedDate.toLocaleString("en-SG", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatDateTimeInputValue(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const offsetMs = date.getTimezoneOffset() * 60 * 1000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
  }

  function parseDateTimeInputValue(value) {
    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) return null;
    return parsedDate.toISOString();
  }

  function formatEquipmentChangeType(value) {
    return EQUIPMENT_CHANGE_TYPE_LABELS[value] || String(value || "Change").replaceAll("_", " ");
  }

  function excelSerialToParts(serial) {
    const excelEpochMs = Date.UTC(1899, 11, 30);
    const roundedSerialMs = Math.round(Number(serial) * 86400000);
    const dateInfo = new Date(excelEpochMs + roundedSerialMs);

    return {
      year: dateInfo.getUTCFullYear(),
      month: dateInfo.getUTCMonth() + 1,
      day: dateInfo.getUTCDate(),
      hour: dateInfo.getUTCHours(),
      minute: dateInfo.getUTCMinutes(),
      second: dateInfo.getUTCSeconds(),
    };
  }

  function localPartsToIso({ year, month, day, hour, minute, second }) {
    return new Date(
      year,
      month - 1,
      day,
      hour,
      minute,
      second
    ).toISOString();
  }

  function parseImportTimestamp(value, rowNumber) {
    if (value instanceof Date) {
      return localPartsToIso({
        year: value.getFullYear(),
        month: value.getMonth() + 1,
        day: value.getDate(),
        hour: value.getHours(),
        minute: value.getMinutes(),
        second: value.getSeconds(),
      });
    }

    if (typeof value === "number") {
      return localPartsToIso(excelSerialToParts(value));
    }

    const text = String(value || "").trim();
    const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,)?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);

    if (!match) {
      throw new Error(`Invalid Time at import row ${rowNumber}. Use DD/MM/YYYY HH:mm or DD/MM/YYYY hh:mm:ss am/pm.`);
    }

    const [, day, month, year, rawHour, minute, second = "0", meridiem = ""] = match;
    let hour = Number(rawHour);
    const normalizedMeridiem = meridiem.toLowerCase();

    if (normalizedMeridiem) {
      if (hour < 1 || hour > 12) {
        throw new Error(`Invalid Time at import row ${rowNumber}. Hours must be between 1 and 12 when using am/pm.`);
      }
      if (normalizedMeridiem === "am") {
        hour = hour === 12 ? 0 : hour;
      } else {
        hour = hour === 12 ? 12 : hour + 12;
      }
    }

    return localPartsToIso({
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour,
      minute: Number(minute),
      second: Number(second),
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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

  function getStatusFromReading(reading, threshold = PROTECTED_THRESHOLD_MV) {
    const value = parseNumericValue(reading);
    if (value === null) return "Unknown";
    return value <= PROTECTED_THRESHOLD_MV ? "Protected" : "Unprotected";
  }

  function statusClass(status) {
    if (status === "Protected") return "green-bg";
    if (status === "Unprotected") return "red-bg";
    return "gray-bg";
  }

  function normalizePointStatus(status) {
    const normalized = String(status || "").trim().toLowerCase();
    if (normalized === "protected") return "Protected";
    if (normalized === "unprotected") return "Unprotected";
    if (normalized === "active") return "Active";
    if (normalized === "inactive") return "Inactive";
    return "Unknown";
  }

  function formatReading(reading) {
    if (reading === null || reading === undefined || reading === "" || reading === "No Data") return "No Data";
    return String(reading).includes("mV") ? String(reading) : `${reading}mV`;
  }

  function getEntryTimestamp(entry) {
    const value = entry?.sortDate || entry?.updatedAt || "";
    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  function getCalendarDateKey(value) {
    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
      return "";
    }

    const year = parsedDate.getFullYear();
    const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
    const day = String(parsedDate.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function createBucketedChartEntries(entries, bucketCount = 7, labelRange = "day") {
    const sourceEntries = (entries || []).filter((entry) => parseNumericValue(entry.latestReading) !== null);
    if (!sourceEntries.length) {
      return [];
    }

    const oldestToNewest = sourceEntries.slice().reverse();
    const actualBucketCount = Math.min(bucketCount, oldestToNewest.length);
    const bucketSize = Math.ceil(oldestToNewest.length / actualBucketCount);
    const bucketedEntries = [];

    for (let index = 0; index < actualBucketCount; index += 1) {
      const bucket = oldestToNewest.slice(index * bucketSize, (index + 1) * bucketSize);
      if (!bucket.length) continue;

      // Bucketed chart point formula:
      // representative value = sum(readings in bucket) / bucket size.
      const averageValue = Math.round(
        bucket.reduce((sum, entry) => sum + entry.readingValue, 0) / bucket.length
      );
      const representativeEntry = bucket[bucket.length - 1];

      bucketedEntries.push({
        ...representativeEntry,
        latestReading: formatReading(averageValue),
        readingValue: averageValue,
        status: getStatusFromReading(
          averageValue,
          representativeEntry.thresholdMv ?? PROTECTED_THRESHOLD_MV
        ),
        chartLabel: formatChartLabel(representativeEntry.updatedAt, labelRange),
      });
    }

    return bucketedEntries;
  }

  function loadCachedTestPoint(pointId, label) {
    const storedData = localStorage.getItem(TEST_POINT_STORAGE_KEY);
    if (!storedData) return null;

    try {
      const parsedData = JSON.parse(storedData);
      if (!Array.isArray(parsedData)) return null;

      return parsedData.find((entry) =>
        entry && (entry.id === pointId || (label && entry.label === label))
      ) || null;
    } catch (error) {
      return null;
    }
  }

  function createCachedLatestEntry(cachedPoint, testPoint) {
    if (!cachedPoint) return null;

    const latestReading = cachedPoint.latest_reading || cachedPoint.latestReading || "No Data";
    const readingValue = parseNumericValue(latestReading);

    return {
      id: cachedPoint.id || testPoint.id,
      batchId: null,
      canDelete: false,
      updatedAt: formatDateTime(testPoint.createdAt),
      latestReading,
      readingValue,
      thresholdMv: testPoint.thresholdMv,
      status: readingValue === null
        ? normalizePointStatus(testPoint.status)
        : getStatusFromReading(latestReading, testPoint.thresholdMv),
      temperature: "N/A",
      mediumConductivity: "N/A",
      ph: "N/A",
      dissolvedOxygen: "N/A",
      powerValue: null,
      power: "N/A",
      enteredBy: "System Import",
    };
  }

  function formatDetailEnvironmentValue(value, unit, decimals = null) {
    if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) {
      return "N/A";
    }
    const numericValue = Number(value);
    const displayValue = decimals === null ? numericValue : numericValue.toFixed(decimals);
    return `${displayValue} ${unit}`;
  }

  function mapRepositoryReadingToDetailEntry(reading) {
    if (!reading) return null;
    const thresholdMv = PROTECTED_THRESHOLD_MV;
    const sortDate = reading.readingTimestamp || reading.createdAt || "";
    const uploadMethod = String(reading.uploadMethod || "").trim().toLowerCase();
    const enteredById = normalizeUuid(reading.enteredById || reading.enteredBy?.id);
    const enteredByLabel = String(reading.enteredBy?.fullName || reading.enteredBy?.email || "").trim()
      || (uploadMethod === "manual" ? "Manual Entry" : "")
      || (uploadMethod ? "System Import" : "Imported Data");

    return {
      id: reading.id,
      batchId: reading.batchId || null,
      canDelete: true,
      canEdit: looksLikeUuid(reading.id) && Boolean(reading.batchId),
      updatedAt: formatDisplayDateTime(sortDate),
      sortDate,
      latestReading: formatReading(reading.valueMv),
      readingValue: reading.valueMv,
      thresholdMv,
      status: reading.status || getStatusFromReading(reading.valueMv, thresholdMv),
      temperatureValue: reading.temperatureC === null || reading.temperatureC === undefined ? null : Number(reading.temperatureC),
      temperature: formatDetailEnvironmentValue(reading.temperatureC, "deg C"),
      conductivityValue: reading.conductivity === null || reading.conductivity === undefined ? null : Number(reading.conductivity),
      mediumConductivity: formatDetailEnvironmentValue(reading.conductivity, DETAIL_CONDUCTIVITY_UNIT),
      phValue: reading.ph === null || reading.ph === undefined ? null : Number(reading.ph),
      ph: reading.ph === null || reading.ph === undefined ? "N/A" : String(reading.ph),
      dissolvedOxygenValue: reading.dissolvedOxygen === null || reading.dissolvedOxygen === undefined ? null : Number(reading.dissolvedOxygen),
      dissolvedOxygen: formatDetailEnvironmentValue(reading.dissolvedOxygen, "mg/L"),
      powerValue: reading.powerWatts === null || reading.powerWatts === undefined ? null : Number(reading.powerWatts),
      power: formatDetailEnvironmentValue(reading.powerWatts, "watts"),
      uploadMethod,
      enteredById,
      enteredBy: enteredByLabel || "Unknown User",
      createdAt: reading.createdAt || null,
    };
  }

  async function fetchRepositoryPointReadings(pointId, { limit = 20, offset = 0, from = null, to = null } = {}) {
    if (!window.AppRepositories?.ReadingRepository) {
      throw new Error("Reading repository is not available.");
    }
    const repository = new window.AppRepositories.ReadingRepository();
    const readings = await repository.getHistoricalReadings({
      testPointId: pointId,
      limit,
      offset,
      from,
      to,
    });
    return readings.map(mapRepositoryReadingToDetailEntry).filter(Boolean);
  }

  // -------------------------------------------------------------------------
  // NEW: chunked batch lookup helper to avoid oversized `.in()` URLs (400s)
  // -------------------------------------------------------------------------
  async function fetchBatchesByIds(batchIds, chunkSize = 50) {
    const uniqueIds = filterUuidList(batchIds);
    const results = [];

    for (let i = 0; i < uniqueIds.length; i += chunkSize) {
      const chunk = uniqueIds.slice(i, i + chunkSize);
      if (!chunk.length) continue;

      const { data, error } = await window.appSupabase
        .from(READING_BATCHES_TABLE)
        .select("id, reading_ts, entered_by, upload_method, temperature_c, medium_conductivity, ph, dissolved_oxygen, power_watts, created_at")
        .in("id", chunk);

      if (error) {
        throw new Error(error.message || "Unable to load reading batches.");
      }

      results.push(...(data || []));
    }

    return results;
  }

  async function fetchUsersByIds(userIds, chunkSize = 50) {
    const uniqueIds = filterUuidList(userIds);
    const results = [];

    for (let i = 0; i < uniqueIds.length; i += chunkSize) {
      const chunk = uniqueIds.slice(i, i + chunkSize);
      if (!chunk.length) continue;

      const { data, error } = await window.appSupabase
        .from(USERS_TABLE)
        .select("id, full_name")
        .in("id", chunk);

      if (error) {
        throw new Error(error.message || "Unable to load user names.");
      }

      results.push(...(data || []));
    }

    return new Map(
      results.map((row) => [
        row.id,
        String(row.full_name || row.email || row.id || "").trim(),
      ])
    );
  }

  function mapPointReadingRows(readingRows, batchById, userById = new Map()) {
    const entries = (readingRows || []).map((row) => {
      const batch = batchById.get(row.batch_id) || {};
      const thresholdMv = PROTECTED_THRESHOLD_MV;
      const sortDate = batch.reading_ts || row.created_at || batch.created_at || "";
      const uploadMethod = String(batch.upload_method || "").trim().toLowerCase();
      const enteredByName = String(userById.get(batch.entered_by) || "").trim();
      const enteredByLabel = enteredByName
        || (uploadMethod === "manual" ? "Manual Entry" : "")
        || (uploadMethod ? "System Import" : "Imported Data");

      return {
        id: row.id,
        batchId: row.batch_id || null,
        canDelete: true,
        canEdit: looksLikeUuid(row.id) && Boolean(row.batch_id),
        updatedAt: formatDisplayDateTime(sortDate),
        sortDate,
        latestReading: formatReading(row.value_mv),
        readingValue: row.value_mv,
        thresholdMv,
        status: getStatusFromReading(row.value_mv),
        temperatureValue: batch.temperature_c == null ? null : Number(batch.temperature_c),
        temperature: batch.temperature_c == null ? "N/A" : `${batch.temperature_c} deg C`,
        conductivityValue: batch.medium_conductivity == null ? null : Number(batch.medium_conductivity),
        mediumConductivity: batch.medium_conductivity == null ? "N/A" : `${batch.medium_conductivity} ${DETAIL_CONDUCTIVITY_UNIT}`,
        phValue: batch.ph == null ? null : Number(batch.ph),
        ph: batch.ph == null ? "N/A" : String(batch.ph),
        dissolvedOxygenValue: batch.dissolved_oxygen == null ? null : Number(batch.dissolved_oxygen),
        dissolvedOxygen: batch.dissolved_oxygen == null ? "N/A" : `${batch.dissolved_oxygen} mg/L`,
        powerValue: batch.power_watts == null ? null : Number(batch.power_watts),
        power: batch.power_watts == null ? "N/A" : `${batch.power_watts} watts`,
        uploadMethod,
        enteredById: normalizeUuid(batch.entered_by),
        enteredBy: enteredByLabel || "Unknown User",
        createdAt: batch.created_at || null,
      };
    });

    entries.sort((a, b) => {
      const dateA = new Date(a.sortDate).getTime();
      const dateB = new Date(b.sortDate).getTime();

      if (Number.isNaN(dateA) && Number.isNaN(dateB)) return 0;
      if (Number.isNaN(dateA)) return 1;
      if (Number.isNaN(dateB)) return -1;

      return dateB - dateA;
    });

    return entries;
  }

  async function resolveRecordedByLabels(entryGroups) {
    const entries = (entryGroups || []).flat().filter(Boolean);
    const userIds = filterUuidList(entries.map((entry) => entry.enteredById));
    if (!userIds.length) return;

    try {
      if (!window.AppRepositories?.UserRepository) throw new Error("User repository is unavailable.");
      const users = await new window.AppRepositories.UserRepository().getUsersByIds(userIds);
      const labels = new Map(users.map((user) => [
        user.id,
        String(user.fullName || user.email || "Unknown User").trim() || "Unknown User",
      ]));
      entries.forEach((entry) => {
        if (entry.enteredById) entry.enteredBy = labels.get(entry.enteredById) || "Unknown User";
      });
    } catch (error) {
      console.warn("Unable to resolve reading authors; using a safe fallback label:", error?.message || error);
    }
  }

  async function fetchRecentBatchesForLocation(locationId, fromIndex = 0, toIndex = 199) {
    const { data, error } = await window.appSupabase
      .from(READING_BATCHES_TABLE)
      .select("id, reading_ts, entered_by, upload_method, temperature_c, medium_conductivity, ph, dissolved_oxygen, power_watts, created_at")
      .eq("location_id", locationId)
      .order("reading_ts", { ascending: false })
      .range(fromIndex, toIndex);

    if (error) {
      throw new Error(error.message || "Unable to load recent reading batches.");
    }

    return data || [];
  }

  async function fetchPointReadingsForBatchIds(pointId, batchIds, requireValue = true, chunkSize = 100) {
    const normalizedPointId = normalizeUuid(pointId);
    const uniqueIds = filterUuidList(batchIds);
    if (!normalizedPointId || !uniqueIds.length) {
      return [];
    }
    const rows = [];

    for (let i = 0; i < uniqueIds.length; i += chunkSize) {
      const chunk = uniqueIds.slice(i, i + chunkSize);
      if (!chunk.length) continue;

      let query = window.appSupabase
        .from(TEST_POINT_READINGS_TABLE)
        .select("id, batch_id, test_point_id, value_mv, threshold_mv_snapshot, is_protected, created_at")
        .eq("test_point_id", normalizedPointId)
        .in("batch_id", chunk);

      if (requireValue) {
        query = query.not("value_mv", "is", null);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(error.message || "Unable to load test point readings.");
      }

      rows.push(...(data || []));
    }

    return rows;
  }

  async function fetchStrictRecentHistory(pointId, locationId, desiredCount = 20, batchWindowSize = 200, maxWindows = 12) {
    if (!locationId) {
      return [];
    }

    const collectedEntries = [];
    const seenIds = new Set();

    for (let windowIndex = 0; windowIndex < maxWindows && collectedEntries.length < desiredCount; windowIndex += 1) {
      const fromIndex = windowIndex * batchWindowSize;
      const toIndex = fromIndex + batchWindowSize - 1;
      const batchRows = await fetchRecentBatchesForLocation(locationId, fromIndex, toIndex);

      if (!batchRows.length) {
        break;
      }

      const batchById = new Map(batchRows.map((row) => [row.id, row]));
      const userById = await fetchUsersByIds(batchRows.map((row) => row.entered_by));
      const readingRows = await fetchPointReadingsForBatchIds(
        pointId,
        batchRows.map((row) => row.id),
        true
      );

      const mappedEntries = mapPointReadingRows(readingRows, batchById, userById);

      mappedEntries.forEach((entry) => {
        if (!seenIds.has(entry.id)) {
          seenIds.add(entry.id);
          collectedEntries.push(entry);
        }
      });

      if (batchRows.length < batchWindowSize) {
        break;
      }
    }

    collectedEntries.sort((a, b) => {
      const dateA = new Date(a.sortDate || a.updatedAt || 0).getTime();
      const dateB = new Date(b.sortDate || b.updatedAt || 0).getTime();
      return dateB - dateA;
    });

    return collectedEntries.slice(0, desiredCount);
  }

  async function ensureActiveUser() {
    if (!hasSupabaseReady()) {
      throw new Error("Supabase is not available.");
    }

    const {
      data: { session },
      error: sessionError,
    } = await window.appSupabase.auth.getSession();

    if (sessionError || !session?.user) {
      throw new Error(sessionError?.message || "No authenticated session found.");
    }

    return session.user;
  }

  async function fetchTestPoint(pointId) {
    const normalizedId = normalizeUuid(pointId);
    if (!normalizedId) {
      throw new Error("Test point not found.");
    }

    let pointRow = null;
    let pointError = null;

    try {
      pointRow = await fetchTestPointRow(normalizedId);
    } catch (error) {
      pointError = error;
    }

    if (!pointRow && !pointError) {
      const readingResult = await window.appSupabase
        .from(TEST_POINT_READINGS_TABLE)
        .select("test_point_id")
        .eq("id", normalizedId)
        .maybeSingle();

      if (readingResult?.data?.test_point_id) {
        try {
          pointRow = await fetchTestPointRow(readingResult.data.test_point_id);
        } catch (error) {
          pointError = pointError || error;
        }
      }
    }

    if (pointError || !pointRow) {
      throw new Error(pointError?.message || "Test point not found.");
    }

    let location = null;
    if (pointRow.location_id) {
      const { data: locationRow, error: locationError } = await window.appSupabase
        .from(LOCATIONS_TABLE)
        .select("id, site_name, description")
        .eq("id", pointRow.location_id)
        .maybeSingle();

      if (locationError) {
        console.warn("Unable to load test point location:", locationError.message || locationError);
      } else {
        location = locationRow;
      }
    }

    let position = null;
    const { data: positionRow, error: positionError } = await window.appSupabase
      .from("test_point_positions")
      .select("id, coordinate_mode, latitude, longitude, relative_x_m, relative_y_m, relative_z_m, chainage_m, coordinate_accuracy_m, coordinate_source, updated_at")
      .eq("test_point_id", pointRow.id)
      .eq("is_current", true)
      .maybeSingle();
    if (positionError) {
      console.warn("Unable to load current Test Point position:", positionError.message || positionError);
    } else if (positionRow) {
      const latitude = positionRow.latitude === null ? null : Number(positionRow.latitude);
      const longitude = positionRow.longitude === null ? null : Number(positionRow.longitude);
      const relativeX = positionRow.relative_x_m === null ? null : Number(positionRow.relative_x_m);
      const relativeY = positionRow.relative_y_m === null ? null : Number(positionRow.relative_y_m);
      position = {
        ...positionRow,
        coordinateMode: positionRow.coordinate_mode,
        latitude,
        longitude,
        relativeX,
        relativeY,
        hasGps: Number.isFinite(latitude) && Number.isFinite(longitude),
        hasRelative: Number.isFinite(relativeX) && Number.isFinite(relativeY),
      };
    }

    return {
      id: pointRow.id,
      label: pointRow.label,
      type: pointRow.type,
      thresholdMv: PROTECTED_THRESHOLD_MV,
      status: pointRow.status,
      isActive: pointRow.is_active,
      createdAt: pointRow.created_at,
      locationId: pointRow.location_id,
      site: location?.site_name || "Unknown Site",
      position,
      locationNote: location?.description || "",
      pointNote: pointRow.note || "",
      currentEquipmentVersionId: pointRow.current_equipment_version_id || null,
    };
  }

  function mapEquipmentVersionRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      testPointId: row.test_point_id,
      versionNo: Number(row.version_no),
      installedAt: row.installed_at,
      removedAt: row.removed_at,
      changeType: row.change_type,
      reason: row.reason || "",
      notes: row.notes || "",
      createdBy: row.created_by,
      createdAt: row.created_at,
    };
  }

  async function fetchEquipmentVersions(testPointId) {
    const normalizedId = normalizeUuid(testPointId);
    if (!normalizedId) return [];

    const { data, error } = await window.appSupabase
      .from(TEST_POINT_EQUIPMENT_VERSIONS_TABLE)
      .select("id, test_point_id, version_no, installed_at, removed_at, change_type, reason, notes, created_by, created_at")
      .eq("test_point_id", normalizedId)
      .order("version_no", { ascending: false })
      .order("installed_at", { ascending: false });

    if (error) {
      throw new Error(error.message || "Unable to load equipment history.");
    }

    return (data || []).map(mapEquipmentVersionRow).filter(Boolean);
  }

  async function fetchPointReadingEntries(pointId, locationId, limitCount = 20) {
    const normalizedLimit = Number.isFinite(limitCount) && limitCount > 0 ? limitCount : 20;
    try {
      return await fetchRepositoryPointReadings(pointId, { limit: normalizedLimit, offset: 0 });
    } catch (error) {
      console.warn("Falling back to legacy point history lookup:", error.message || error);
      return fetchStrictRecentHistory(pointId, locationId, normalizedLimit);
    }
  }

  async function fetchLatestReadingForPoint(pointId, locationId) {
    const entries = await fetchPointReadingEntries(pointId, locationId, 1);
    return entries[0] || null;
  }

  async function fetchHistoryWindow(pointId, locationId, fromIndex = 0, toIndex = 19) {
    const desiredCount = Math.max((toIndex - fromIndex) + 1, 1);
    try {
      return await fetchRepositoryPointReadings(pointId, { limit: desiredCount, offset: fromIndex });
    } catch (error) {
      console.warn("Falling back to legacy point history window lookup:", error.message || error);
      const entries = await fetchStrictRecentHistory(pointId, locationId, toIndex + 1);
      return entries.slice(fromIndex, fromIndex + desiredCount);
    }
  }

  function goToUpdatePage() {
    const selectedId = getSelectedId();
    if (!selectedId) return;
    location.href = `testpoint-update.php?id=${encodeURIComponent(selectedId)}`;
  }

  function clearDetailImportForm() {
    const fileInput = document.getElementById("detailReadingsImportFileInput");
    if (fileInput) fileInput.value = "";
  }

  function syncDetailImportCopy(testPoint = currentDetailTestPoint) {
    const label = document.getElementById("detailImportPointLabel");
    const site = document.getElementById("detailImportPointSite");
    if (label) label.textContent = testPoint?.label || "this test point";
    if (site) {
      site.textContent = testPoint?.site
        ? `Selected test point: ${testPoint.label} at ${testPoint.site}.`
        : "Each row should represent one reading timestamp for the selected test point.";
    }
  }

  function openDetailReadingsImportModal() {
    if (!currentDetailTestPoint) {
      window.notifyUser?.("Load a test point before importing readings.", "warning");
      return;
    }

    syncDetailImportCopy(currentDetailTestPoint);
    clearDetailImportForm();
    openModal("importDetailReadingsModal");
  }

  function closeDetailReadingsImportModal() {
    clearDetailImportForm();
    closeModal("importDetailReadingsModal");
  }

  // -------------------------------------------------------------------------
  // Add/Edit Reading modal (replaces the old separate testpoint-update.php
  // page navigation with an in-place popup, per team leader's UI request).
  // -------------------------------------------------------------------------
  let currentReadingModalTarget = null; // null = adding a new reading; {id, batchId} = editing an existing one

  function toDatetimeLocalValue(date = new Date()) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function parseDatetimeLocalValue(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return null;
    const parsedDate = new Date(trimmed);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString();
  }

  // Only "variable" (impressed-current) systems have a controllable power
  // supply to track, so the Power field stays hidden for "stationary"
  // (fixed/galvanic) test points, matching the reading history column rule.
  function updateReadingModalPowerVisibility(testPointType) {
    const powerFieldGroup = document.getElementById("readingPowerFieldGroup");
    if (!powerFieldGroup) return;
    powerFieldGroup.style.display = testPointType === "variable" ? "" : "none";
  }

  function setReadingModalValue(id, value) {
    const input = document.getElementById(id);
    if (input) input.value = value === null || value === undefined ? "" : value;
  }

  // The most recent existing reading for this test point (excluding whichever
  // reading is currently being edited, if any) — new/updated readings must not
  // be dated before this, since backdating before the latest recorded reading
  // would put the history out of chronological order.
  function getLatestOtherReadingSortDate(excludeReadingId = null) {
    const latestEntry = (currentAllHistoryEntries || []).find(
      (entry) => entry?.sortDate && entry.id !== excludeReadingId
    );
    return latestEntry ? latestEntry.sortDate : null;
  }

  // Used only when EDITING an existing reading. Finds the readings immediately
  // before and after it in chronological order (excluding itself), so an edit
  // can be constrained to its real neighbors rather than the single overall
  // latest reading. Comparing against the absolute latest (as the ADD flow
  // does) would wrongly block a legitimate correction to an older reading —
  // e.g. fixing a typo'd time on the oldest reading on file, which is earlier
  // than the newest reading but still a perfectly valid edit.
  function getReadingNeighborSortDates(excludeReadingId) {
    const sorted = (currentAllHistoryEntries || [])
      .filter((entry) => entry?.sortDate)
      .slice()
      .sort((a, b) => new Date(a.sortDate).getTime() - new Date(b.sortDate).getTime());

    const index = sorted.findIndex((entry) => entry.id === excludeReadingId);
    if (index === -1) {
      // Reading not found in the loaded history (shouldn't normally happen for
      // an edit) — fall back to no ordering bounds rather than guessing wrong.
      return { previousSortDate: null, nextSortDate: null };
    }

    const previous = index > 0 ? sorted[index - 1] : null;
    const next = index < sorted.length - 1 ? sorted[index + 1] : null;
    return {
      previousSortDate: previous ? previous.sortDate : null,
      nextSortDate: next ? next.sortDate : null,
    };
  }

  function formatReadingDisplayDateTime(sortDate) {
    return new Date(sortDate).toLocaleString("en-SG", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  // Describes the valid edit window using BOTH real neighbors at once (when
  // they exist), so a blocked save tells the user the full window they can
  // pick from, not just whichever single bound they happened to cross.
  function describeValidEditWindow(previousSortDate, nextSortDate) {
    const previousDisplay = previousSortDate ? formatReadingDisplayDateTime(previousSortDate) : null;
    const nextDisplay = nextSortDate ? formatReadingDisplayDateTime(nextSortDate) : null;
    if (previousDisplay && nextDisplay) {
      return `between the previous reading (${previousDisplay}) and the next reading (${nextDisplay})`;
    }
    if (previousDisplay) {
      return `after the previous reading (${previousDisplay})`;
    }
    if (nextDisplay) {
      return `before the next reading (${nextDisplay})`;
    }
    return null;
  }

  // Corrosion readings can't have been taken in the future. Beyond that, the
  // ordering constraint differs by whether we're adding or editing:
  //  - Adding: can't be dated before the latest reading already on record,
  //    which keeps newly-added readings in chronological order.
  //  - Editing: can't be dated outside the gap between this reading's real
  //    chronological neighbors, so a correction can move it anywhere sensible
  //    without letting it jump past (or before) an unrelated later reading.
  // This caps the native picker's max/min (recalculated each time the modal
  // opens) as a first line of defense, in addition to the hard checks in
  // saveReadingModal().
  function applyReadingModalTimeConstraint(excludeReadingId = null) {
    const input = document.getElementById("readingTimeInput");
    if (!input) return;

    const now = new Date();

    if (excludeReadingId) {
      const { previousSortDate, nextSortDate } = getReadingNeighborSortDates(excludeReadingId);
      const previousDate = previousSortDate ? new Date(previousSortDate) : null;
      const nextDate = nextSortDate ? new Date(nextSortDate) : null;

      let editMin = (previousDate && !Number.isNaN(previousDate.getTime()))
        // datetime-local's min/max are inclusive, so nudge by a minute to keep
        // this strictly "after", matching the picker's minute-level granularity.
        ? new Date(previousDate.getTime() + 60000)
        : null;

      const nextBoundDate = nextDate && !Number.isNaN(nextDate.getTime())
        ? new Date(nextDate.getTime() - 60000)
        : now;
      // Still can't be in the future even if the next neighbor is further out.
      const editMax = nextBoundDate.getTime() > now.getTime() ? now : nextBoundDate;

      // If the two real neighbors are less than 2 minutes apart, the nudged
      // min can end up after max — the same "inverted range makes the picker
      // unusable" failure as the bad-data case below, so fall back to no min
      // rather than presenting a range with nothing selectable in it.
      if (editMin && editMin.getTime() > editMax.getTime()) {
        editMin = null;
      }

      if (editMin) {
        input.min = toDatetimeLocalValue(editMin);
      } else {
        input.removeAttribute("min");
      }
      input.max = toDatetimeLocalValue(editMax);
      return;
    }

    input.max = toDatetimeLocalValue(now);

    const latestOtherSortDate = getLatestOtherReadingSortDate(null);
    const latestOtherDate = latestOtherSortDate ? new Date(latestOtherSortDate) : null;
    if (latestOtherDate && !Number.isNaN(latestOtherDate.getTime())) {
      // Guard against min ending up later than max (e.g. a bad/future-dated
      // reading already on record — possibly added through the old, unguarded
      // testpoint-update.php page). An inverted min/max range makes the native
      // date/time picker unusable (can't select any value at all), so clamp
      // the reference point to "now" instead of trusting the stored data blindly.
      const clampedMinDate = latestOtherDate.getTime() > now.getTime() ? now : latestOtherDate;
      input.min = toDatetimeLocalValue(clampedMinDate);
    } else {
      input.removeAttribute("min");
    }
  }

  function clearReadingModalForm() {
    // Date & Time is left blank on purpose (not defaulted to "now") so the engineer
    // must deliberately pick the actual reading time. Silently defaulting to today
    // makes it too easy to save a reading under the wrong date (e.g. logging a
    // reading taken on 19/7 while it quietly defaults to 20/7), which both misrepresents
    // when the reading was taken and can mask/create duplicate-timestamp readings.
    ["readingTimeInput", "readingValueInput", "readingPowerInput", "readingTemperatureInput", "readingConductivityInput", "readingPhInput", "readingDissolvedOxygenInput"].forEach((id) =>
      setReadingModalValue(id, "")
    );
  }

  // Mirrors the "Users can edit their own recent ..." RLS policies: admins can
  // always edit; everyone else can only edit their own manual reading, and only
  // within READING_EDIT_WINDOW_MS of when it was created. Used both to decide
  // whether to show the edit pencil at all, and re-checked before opening the
  // modal in case the window lapsed between page load and the click.
  function canCurrentUserEditReading(entry) {
    if (!entry?.canEdit || entry.uploadMethod === "bulk") return false;
    if (currentUserIsAdmin) return true;
    if (!currentUserId || !entry.enteredById || entry.enteredById !== currentUserId) return false;

    const createdAtTime = new Date(entry.createdAt).getTime();
    if (Number.isNaN(createdAtTime)) return false;

    return Date.now() - createdAtTime <= READING_EDIT_WINDOW_MS;
  }

  function openAddReadingModal() {
    if (!currentDetailTestPoint) {
      window.notifyUser?.("Load a test point before adding a reading.", "warning");
      return;
    }

    currentReadingModalTarget = null;
    clearReadingModalForm();
    applyReadingModalTimeConstraint();
    updateReadingModalPowerVisibility(currentDetailTestPoint.type);

    const title = document.getElementById("addReadingModalTitle");
    if (title) title.textContent = `Add Reading for ${currentDetailTestPoint.label}`;
    const buttonText = document.getElementById("saveReadingModalButtonText");
    if (buttonText) buttonText.textContent = "Save Reading";

    openModal("addReadingModal");
  }

  function openEditReadingModal(readingId) {
    if (!readingId || !looksLikeUuid(readingId)) {
      window.AppToast?.error?.("This reading cannot be edited.");
      return;
    }

    const selectedEntry = currentAllHistoryEntries.find((entry) => entry?.id === readingId) || null;
    if (!selectedEntry?.batchId) {
      window.AppToast?.error?.("This reading cannot be edited.");
      return;
    }

    if (selectedEntry.uploadMethod === "bulk") {
      window.AppToast?.error?.("Imported bulk readings cannot be edited here.");
      return;
    }

    // Re-check permission here (not just at render time) in case the 1-hour
    // edit window lapsed between page load and this click.
    if (!canCurrentUserEditReading(selectedEntry)) {
      window.AppToast?.error?.("You can no longer edit this reading yourself. Ask an admin to make the change.");
      return;
    }

    currentReadingModalTarget = { id: selectedEntry.id, batchId: selectedEntry.batchId };

    setReadingModalValue("readingTimeInput", selectedEntry.sortDate ? toDatetimeLocalValue(new Date(selectedEntry.sortDate)) : toDatetimeLocalValue());
    setReadingModalValue("readingValueInput", selectedEntry.readingValue);
    setReadingModalValue("readingPowerInput", selectedEntry.powerValue);
    setReadingModalValue("readingTemperatureInput", selectedEntry.temperatureValue);
    setReadingModalValue("readingConductivityInput", selectedEntry.conductivityValue);
    setReadingModalValue("readingPhInput", selectedEntry.phValue);
    setReadingModalValue("readingDissolvedOxygenInput", selectedEntry.dissolvedOxygenValue);
    applyReadingModalTimeConstraint(selectedEntry.id);
    updateReadingModalPowerVisibility(currentDetailTestPoint?.type);

    const title = document.getElementById("addReadingModalTitle");
    if (title) title.textContent = `Edit Reading for ${currentDetailTestPoint?.label || "Test Point"}`;
    const buttonText = document.getElementById("saveReadingModalButtonText");
    if (buttonText) buttonText.textContent = "Save Changes";

    openModal("addReadingModal");
  }

  function closeAddReadingModal() {
    currentReadingModalTarget = null;
    closeModal("addReadingModal");
  }

  async function updateExistingDetailReading(payload) {
    // Use an exact count instead of relying on a bare .update() so we can detect
    // "0 rows updated" (RLS silently blocked it — e.g. the 1-hour edit window
    // lapsed, or this isn't your own reading) without needing a SELECT policy
    // that lets us read the row back. Same fix as the earlier test_points save bug.
    const { error: batchError, count: batchCount } = await window.appSupabase
      .from(READING_BATCHES_TABLE)
      .update({
        reading_ts: payload.readingTimestamp,
        temperature_c: payload.temperatureC ?? null,
        medium_conductivity: payload.conductivity ?? null,
        ph: payload.ph ?? null,
        dissolved_oxygen: payload.dissolvedOxygen ?? null,
        power_watts: payload.powerWatts ?? null,
      }, { count: "exact" })
      .eq("id", payload.batchId);

    if (batchError) throw batchError;
    if (!batchCount) {
      throw new Error("No changes were saved. You may no longer have permission to edit this reading (edits are only allowed by an admin, or by the engineer who entered it within 1 hour).");
    }

    const { error: readingError, count: readingCount } = await window.appSupabase
      .from(TEST_POINT_READINGS_TABLE)
      .update({
        value_mv: Math.round(payload.valueMv),
      }, { count: "exact" })
      .eq("id", payload.readingId)
      .eq("test_point_id", payload.testPointId);

    if (readingError) throw readingError;
    if (!readingCount) {
      throw new Error("The reading value could not be updated. You may no longer have permission to edit this reading.");
    }
  }

  async function saveReadingModal() {
    if (!currentDetailTestPoint) {
      window.notifyUser?.("Unable to load this test point.", "error");
      return;
    }

    if (!hasSupabaseReady()) {
      window.notifyUser?.("Supabase is not available. This page needs the database connection to save readings.", "error");
      return;
    }

    const saveButton = document.getElementById("saveReadingModalButton");

    try {
      await ensureActiveUser();

      const readingTs = parseDatetimeLocalValue(document.getElementById("readingTimeInput").value);
      const valueMv = parseNumericValue(document.getElementById("readingValueInput").value);
      const temperature = parseNumericValue(document.getElementById("readingTemperatureInput").value);
      const conductivity = parseNumericValue(document.getElementById("readingConductivityInput").value);
      const ph = parseNumericValue(document.getElementById("readingPhInput").value);
      const dissolvedOxygen = parseNumericValue(document.getElementById("readingDissolvedOxygenInput").value);
      // Stationary/fixed systems have no controllable power supply, so never record
      // a power value for them even if one was left over in the (hidden) field.
      const power = currentDetailTestPoint.type === "variable"
        ? parseNumericValue(document.getElementById("readingPowerInput").value)
        : null;

      if (!readingTs) {
        window.notifyUser?.("Please choose a valid date and time.", "warning");
        return;
      }

      // A corrosion reading can't have been taken in the future — the `max` on the
      // picker already discourages this, but browsers don't enforce `max` on submit,
      // so re-check here as the real guard.
      if (new Date(readingTs).getTime() > Date.now()) {
        window.notifyUser?.("The reading time cannot be in the future.", "warning");
        return;
      }

      // Ordering check — `min`/`max` on the picker are only a hint (browsers
      // don't enforce them on submit), this is the actual guard. Adding and
      // editing use different rules:
      if (currentReadingModalTarget?.id) {
        // Editing: must fall strictly between this reading's real chronological
        // neighbors, not merely "not earlier than the single latest reading in
        // the whole table" — that broader rule would wrongly block a legitimate
        // correction to an older reading just because some unrelated, later
        // reading exists elsewhere in the history.
        const { previousSortDate, nextSortDate } = getReadingNeighborSortDates(currentReadingModalTarget.id);
        const newTime = new Date(readingTs).getTime();

        if (previousSortDate) {
          const previousTime = new Date(previousSortDate).getTime();
          if (!Number.isNaN(previousTime) && newTime <= previousTime) {
            window.notifyUser?.(`The reading time must be ${describeValidEditWindow(previousSortDate, nextSortDate)}.`, "warning");
            return;
          }
        }

        if (nextSortDate) {
          const nextTime = new Date(nextSortDate).getTime();
          if (!Number.isNaN(nextTime) && newTime >= nextTime) {
            window.notifyUser?.(`The reading time must be ${describeValidEditWindow(previousSortDate, nextSortDate)}.`, "warning");
            return;
          }
        }
      } else {
        // Adding: cannot be dated before the latest reading already on record,
        // keeping newly-added readings in chronological order.
        const latestOtherSortDate = getLatestOtherReadingSortDate(null);
        if (latestOtherSortDate) {
          const latestOtherTime = new Date(latestOtherSortDate).getTime();
          // If the "latest" reading on record is itself timestamped in the future
          // (bad data — e.g. entered through the old, unguarded testpoint-update.php
          // page — rather than a real future reading, which the check above already
          // blocks), don't let it hold every future save hostage. Clamp the
          // comparison point at "now" instead of trusting the stored value blindly.
          const effectiveLatestOtherTime = Math.min(latestOtherTime, Date.now());
          if (!Number.isNaN(latestOtherTime) && new Date(readingTs).getTime() < effectiveLatestOtherTime) {
            const latestOtherDisplay = new Date(latestOtherSortDate).toLocaleString("en-SG", {
              day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
            });
            window.notifyUser?.(`The reading time cannot be before the latest recorded reading (${latestOtherDisplay}).`, "warning");
            return;
          }
        }
      }

      if (valueMv === null) {
        window.notifyUser?.("Please enter a valid reading in mV.", "warning");
        return;
      }

      // Layer 2 — warn if a reading already exists within ±30 minutes of the submitted
      // timestamp. Only meaningful when adding a brand-new reading: when editing an
      // existing one, this same query would find the reading being edited itself
      // (its own timestamp is naturally "within 30 minutes" of itself) and wrongly
      // warn about a duplicate that's really just the record being saved.
      // v_readings doesn't expose a reading id to exclude, so the simplest correct
      // fix is to skip this check entirely while editing.
      if (!currentReadingModalTarget) {
        const submittedTime = new Date(readingTs).getTime();
        const windowFrom = new Date(submittedTime - 30 * 60 * 1000).toISOString();
        const windowTo = new Date(submittedTime + 30 * 60 * 1000).toISOString();
        const { data: recentData, error: recentError } = await window.appSupabase
          .from("v_readings")
          .select("reading_ts, value_mv")
          .eq("test_point_id", currentDetailTestPoint.id)
          .gte("reading_ts", windowFrom)
          .lte("reading_ts", windowTo)
          .limit(1);
        if (recentError) {
          console.warn("Duplicate check failed, proceeding:", recentError.message);
        } else if (recentData && recentData.length > 0) {
          const recent = recentData[0];
          const recentTime = new Date(recent.reading_ts).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" });
          const recentValue = Number.isFinite(Number(recent.value_mv)) ? `${recent.value_mv} mV` : "unknown mV";
          const confirmed = window.confirm(
            `A reading of ${recentValue} was already recorded for ${currentDetailTestPoint.label} at ${recentTime} (within 30 minutes).\n\nSave this reading anyway?`
          );
          if (!confirmed) return;
        }
      }

      if (saveButton) saveButton.disabled = true;

      if (currentReadingModalTarget?.id && currentReadingModalTarget?.batchId) {
        await updateExistingDetailReading({
          readingId: currentReadingModalTarget.id,
          batchId: currentReadingModalTarget.batchId,
          testPointId: currentDetailTestPoint.id,
          readingTimestamp: readingTs,
          valueMv,
          temperatureC: temperature,
          conductivity,
          ph,
          dissolvedOxygen,
          powerWatts: power,
        });
        window.AppToast?.success?.("Reading updated successfully.");
      } else {
        if (!window.AppRepositories?.ReadingRepository) {
          throw new Error("Reading repository is not available.");
        }
        await new window.AppRepositories.ReadingRepository().createManualReading({
          testPointId: currentDetailTestPoint.id,
          readingTimestamp: readingTs,
          valueMv: Math.round(valueMv),
          temperatureC: temperature,
          conductivity,
          ph,
          dissolvedOxygen,
          powerWatts: power,
        });
        window.AppToast?.success?.("Reading added successfully.");
      }

      closeAddReadingModal();
      await renderDetails();
    } catch (error) {
      window.notifyUser?.(`Unable to save this reading: ${error.message || error}`, "error");
    } finally {
      if (saveButton) saveButton.disabled = false;
    }
  }

  function buildDetailImportTemplateRows(testPoint = currentDetailTestPoint) {
    return [{
      Time: "03/07/2026 08:15",
      "Reading (mV)": -875,
      "Temperature (degree C)": 28.4,
      [DETAIL_CONDUCTIVITY_IMPORT_HEADER]: 358,
      pH: 7.1,
      "Dissolved Oxygen (mg/L)": 6.2,
      "Power (watts)": 118,
    }];
  }

  async function readImportRowsFromFile(file, workbookOptions = {}) {
    if (!window.XLSX) {
      throw new Error("Excel import is not available right now. Please refresh the page and try again.");
    }

    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: "array", ...workbookOptions });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    return window.XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: true });
  }

  function downloadDetailReadingsTemplate() {
    if (!window.XLSX) {
      const safeLabel = String(currentDetailTestPoint?.label || "test-point").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
      downloadSpreadsheetFallback(
        buildDetailImportTemplateRows().map(protectSpreadsheetRow),
        DETAIL_IMPORT_HEADERS,
        `${safeLabel || "test-point"}-reading-import-template.csv`
      );
      window.notifyUser?.("Excel library is unavailable, so we downloaded a CSV template instead.", "warning");
      return;
    }

    const worksheet = window.XLSX.utils.json_to_sheet(buildDetailImportTemplateRows().map(protectSpreadsheetRow), {
      header: DETAIL_IMPORT_HEADERS,
    });
    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, worksheet, "Reading Import");
    const safeLabel = String(currentDetailTestPoint?.label || "test-point").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
    window.XLSX.writeFile(workbook, `${safeLabel || "test-point"}-reading-import-template.xlsx`);
  }

  function parseOptionalImportNumber(value, fieldName, rowNumber) {
    if (value === null || value === undefined || value === "") return null;
    const numericValue = Number.parseFloat(String(value).replace(/[^0-9.-]/g, ""));
    if (!Number.isFinite(numericValue)) {
      throw new Error(`Invalid ${fieldName} at import row ${rowNumber}.`);
    }
    return numericValue;
  }

  function parseRequiredImportNumber(value, fieldName, rowNumber) {
    const numericValue = parseOptionalImportNumber(value, fieldName, rowNumber);
    if (numericValue === null) {
      throw new Error(`${fieldName} is required at import row ${rowNumber}.`);
    }
    return numericValue;
  }

  function buildDetailImportWarning(rowNumber, message) {
    return `Row ${rowNumber}: ${message}`;
  }

  function buildDetailImportWarningMessage(warnings) {
    if (!warnings.length) return "";

    const preview = warnings
      .slice(0, DETAIL_IMPORT_WARNING_PREVIEW_LIMIT)
      .map((warning) => `- ${warning}`)
      .join("\n");
    const remainingCount = warnings.length - Math.min(warnings.length, DETAIL_IMPORT_WARNING_PREVIEW_LIMIT);
    const extraLine = remainingCount > 0 ? `\n- ...and ${remainingCount} more warning${remainingCount === 1 ? "" : "s"}` : "";
    return `The import file contains readings that look unusual:\n\n${preview}${extraLine}\n\nImport these rows anyway?`;
  }

  function collectExtremeDetailImportWarnings(rowNumber, fields) {
    const warnings = [];

    if (fields.valueMv > 2000 || fields.valueMv < -20000) {
      warnings.push(buildDetailImportWarning(rowNumber, `Reading ${fields.valueMv} mV looks ridiculously high or low.`));
    }
    if (fields.temperatureC !== null && (fields.temperatureC < -100 || fields.temperatureC > 300)) {
      warnings.push(buildDetailImportWarning(rowNumber, `Temperature ${fields.temperatureC} deg C looks ridiculously high or low.`));
    }
    if (fields.conductivity !== null && fields.conductivity > 100000) {
      warnings.push(buildDetailImportWarning(rowNumber, `Medium Conductivity ${fields.conductivity} ${DETAIL_CONDUCTIVITY_UNIT} looks ridiculously high.`));
    }
    if (fields.dissolvedOxygen !== null && fields.dissolvedOxygen > 100) {
      warnings.push(buildDetailImportWarning(rowNumber, `Dissolved Oxygen ${fields.dissolvedOxygen} mg/L looks ridiculously high.`));
    }
    if (fields.powerWatts !== null && fields.powerWatts > 100000) {
      warnings.push(buildDetailImportWarning(rowNumber, `Power ${fields.powerWatts} watts looks ridiculously high.`));
    }

    return warnings;
  }

  function parseDetailReadingImportRows(rows) {
    if (!rows.length) {
      throw new Error("The selected import file does not contain any data rows.");
    }

    const firstRow = rows[0] || {};
    const requiredHeaders = ["Time", "Reading (mV)"];
    const missingHeaders = requiredHeaders.filter((header) => !(header in firstRow));
    if (missingHeaders.length) {
      throw new Error(`Missing required columns: ${missingHeaders.join(", ")}.`);
    }

    const seenTimestamps = new Set();
    const warnings = [];
    let hasPowerValues = false;
    const records = rows.map((row, index) => {
      const rowNumber = index + 2;
      const readingTimestamp = parseImportTimestamp(row.Time, rowNumber);
      const valueMv = Math.round(parseRequiredImportNumber(row["Reading (mV)"], "Reading (mV)", rowNumber));
      const temperatureC = parseOptionalImportNumber(row["Temperature (degree C)"], "Temperature (degree C)", rowNumber);
      const conductivitySource = Object.prototype.hasOwnProperty.call(row, DETAIL_CONDUCTIVITY_IMPORT_HEADER)
        ? row[DETAIL_CONDUCTIVITY_IMPORT_HEADER]
        : row[DETAIL_LEGACY_CONDUCTIVITY_IMPORT_HEADER];
      const conductivity = parseOptionalImportNumber(conductivitySource, DETAIL_CONDUCTIVITY_IMPORT_HEADER, rowNumber);
      const ph = parseOptionalImportNumber(row.pH, "pH", rowNumber);
      const dissolvedOxygen = parseOptionalImportNumber(row["Dissolved Oxygen (mg/L)"], "Dissolved Oxygen (mg/L)", rowNumber);
      const powerWatts = parseOptionalImportNumber(row["Power (watts)"], "Power (watts)", rowNumber);
      if (powerWatts !== null) hasPowerValues = true;

      if (seenTimestamps.has(readingTimestamp)) {
        throw new Error(`Duplicate Time found in import row ${rowNumber}.`);
      }
      seenTimestamps.add(readingTimestamp);

      const readingDate = new Date(readingTimestamp);
      const now = Date.now();
      if (readingDate.getTime() > now) {
        warnings.push(buildDetailImportWarning(rowNumber, "Time is in the future."));
      }
      if (readingDate.getFullYear() < 2000) {
        warnings.push(buildDetailImportWarning(rowNumber, `Time ${readingDate.toLocaleString("en-SG")} is unusually old.`));
      }
      if (valueMv > 0) {
        warnings.push(buildDetailImportWarning(rowNumber, `Reading ${valueMv} mV is positive, which is unusual for cathodic protection data.`));
      } else if (valueMv < -5000) {
        warnings.push(buildDetailImportWarning(rowNumber, `Reading ${valueMv} mV is far below the expected range.`));
      }
      if (temperatureC !== null && (temperatureC < -50 || temperatureC > 150)) {
        warnings.push(buildDetailImportWarning(rowNumber, `Temperature ${temperatureC} deg C is outside the usual operating range.`));
      }
      if (conductivity !== null && conductivity < 0) {
        warnings.push(buildDetailImportWarning(rowNumber, `Medium Conductivity ${conductivity} ${DETAIL_CONDUCTIVITY_UNIT} cannot be negative.`));
      }
      if (ph !== null && (ph < 0 || ph > 14)) {
        warnings.push(buildDetailImportWarning(rowNumber, `pH ${ph} is outside the valid 0-14 range.`));
      }
      if (dissolvedOxygen !== null && (dissolvedOxygen < 0 || dissolvedOxygen > 25)) {
        warnings.push(buildDetailImportWarning(rowNumber, `Dissolved Oxygen ${dissolvedOxygen} mg/L is outside the usual range.`));
      }
      if (powerWatts !== null && powerWatts < 0) {
        warnings.push(buildDetailImportWarning(rowNumber, `Power ${powerWatts} watts cannot be negative.`));
      }
      if (powerWatts !== null && currentDetailTestPoint?.type !== "variable") {
        warnings.push(buildDetailImportWarning(rowNumber, "Power was provided for a stationary test point and will still be imported."));
      }
      warnings.push(...collectExtremeDetailImportWarnings(rowNumber, {
        valueMv,
        temperatureC,
        conductivity,
        dissolvedOxygen,
        powerWatts,
      }));

      return {
        rowNumber,
        readingTimestamp,
        valueMv,
        temperatureC,
        conductivity,
        ph,
        dissolvedOxygen,
        powerWatts,
      };
    });

    if (hasPowerValues) {
      warnings.unshift("Power values in this import will be stored as watts.");
    }

    return { records, warnings };
  }

  async function insertImportedReading(testPoint, payload) {
    if (!window.AppRepositories?.ReadingRepository) {
      throw new Error("Reading repository is not available.");
    }

    await new window.AppRepositories.ReadingRepository().createManualReading({
      testPointId: testPoint.id,
      readingTimestamp: payload.readingTimestamp,
      valueMv: Math.round(payload.valueMv),
      temperatureC: payload.temperatureC,
      conductivity: payload.conductivity,
      ph: payload.ph,
      dissolvedOxygen: payload.dissolvedOxygen,
      powerWatts: payload.powerWatts,
    });
  }

  async function importDetailReadingsFromExcel() {
    if (!currentDetailTestPoint) {
      window.notifyUser?.("Load a test point before importing readings.", "warning");
      return;
    }

    if (!hasSupabaseReady()) {
      window.notifyUser?.("Supabase is not available. This page needs the database connection to import accurately.", "error");
      return;
    }

    const fileInput = document.getElementById("detailReadingsImportFileInput");
    const file = fileInput?.files?.[0];
    if (!file) {
      window.notifyUser?.("Choose an Excel file before importing.", "warning");
      return;
    }

    const submitButton = document.getElementById("submitDetailReadingsImportButton");
    if (submitButton) submitButton.disabled = true;

    try {
      await ensureActiveUser();
      // Keep Excel date cells as raw serial numbers so our import timestamp
      // normalization runs through the serial-based path consistently.
      const rawRows = await readImportRowsFromFile(file);
      const { records: rows, warnings } = parseDetailReadingImportRows(rawRows);

      if (warnings.length) {
        const confirmed = window.confirm(buildDetailImportWarningMessage(warnings));
        if (!confirmed) {
          window.notifyUser?.("Import cancelled so you can review the flagged rows.", "warning");
          return;
        }
      }

      for (const row of rows) {
        await insertImportedReading(currentDetailTestPoint, row);
      }

      closeDetailReadingsImportModal();
      await renderDetails();
      window.notifyUser?.(`Imported ${rows.length} reading${rows.length === 1 ? "" : "s"} for ${currentDetailTestPoint.label}.`, "success");
    } catch (error) {
      window.notifyUser?.(`Unable to import readings: ${error.message || error}`, "error");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }

  function renderNotFound(message = "The selected test point could not be found.") {
    const pageTitle = document.getElementById("detailPageTitle");
    const breadcrumb = document.getElementById("detailBreadcrumb");
    const hero = document.getElementById("detailHero");
    const notes = document.getElementById("detailNotesContent");
    const summaryGrid = document.getElementById("detailSummaryGrid");
    const environmentGrid = document.getElementById("detailEnvironmentGrid");
    const equipmentContent = document.getElementById("detailEquipmentContent");
    const historyTable = document.getElementById("detailHistoryTable");

    currentDetailHistoryChart?.destroy();
    currentDetailHistoryChart = null;
    destroyDetailEnvironmentCharts();
    currentDetailPointId = null;
    currentDetailTestPoint = null;
    currentEquipmentVersions = [];
    currentDetailLatestEntry = null;

    if (pageTitle) pageTitle.textContent = "Test Point Not Found";
    if (breadcrumb) breadcrumb.textContent = "Test Points / Missing";
    if (hero) hero.innerHTML = `<div class="detail-empty-state">${escapeHtml(message)}</div>`;
    if (notes) notes.innerHTML = "";
    if (summaryGrid) summaryGrid.innerHTML = "";
    if (environmentGrid) environmentGrid.innerHTML = "";
    if (equipmentContent) equipmentContent.innerHTML = "";
    if (historyTable) historyTable.innerHTML = '<tr><td colspan="9">No history available.</td></tr>';
  }

  function formatDetailWeekDate(value) {
    const date = new Date(`${value}T00:00:00+08:00`);
    return Number.isNaN(date.getTime())
      ? String(value || "")
      : date.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
  }

  function getDetailTrendModel(deltaMv, semanticStatus = "", context = "week") {
    const presentation = window.AppTrendPresentation?.getTrendPresentation?.({ deltaMv, semanticStatus, context });
    if (presentation) return presentation;
    const numericDelta = parseNumericValue(deltaMv);
    return {
      semantic: "unknown",
      label: numericDelta === null ? "Insufficient data" : "Trend unavailable",
      value: numericDelta === null ? "—" : `${numericDelta > 0 ? "+" : ""}${Math.round(numericDelta)} mV`,
      iconClass: "fa-circle-minus",
    };
  }

  function renderHeroTrend(label, model) {
    return `<div class="detail-hero-metric detail-hero-trend app-trend-${escapeHtml(model.semantic)}">
    <span>${escapeHtml(label)}</span>
    <div><i class="fa-solid ${escapeHtml(model.iconClass)}" aria-hidden="true"></i><strong>${escapeHtml(model.value)}</strong></div>
    <small>${escapeHtml(model.label)}</small>
  </div>`;
  }

  function getEntriesForDetailWeek(entries, weekStart) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(weekStart || ""))) return [];
    const weekEnd = addDetailIsoDays(weekStart, 6);
    return (entries || []).filter((entry) => {
      const dateKey = getCalendarDateKey(entry?.sortDate || entry?.updatedAt);
      return dateKey && dateKey >= weekStart && dateKey <= weekEnd;
    });
  }

  function buildDetailWeekHeroSnapshot(entries, weekStart, thresholdMv) {
    const weekEntries = getEntriesForDetailWeek(entries, weekStart)
      .filter((entry) => parseNumericValue(entry?.latestReading) !== null)
      .sort((left, right) => (getEntryTimestamp(left) || 0) - (getEntryTimestamp(right) || 0));
    if (!weekEntries.length) return null;

    const firstEntry = weekEntries[0];
    const latestEntry = weekEntries[weekEntries.length - 1];
    const startOfWeekReading = parseNumericValue(firstEntry.latestReading);
    const latestReading = parseNumericValue(latestEntry.latestReading);
    const changeFromStart = startOfWeekReading === null || latestReading === null
      ? null
      : latestReading - startOfWeekReading;
    const normalizedThreshold = PROTECTED_THRESHOLD_MV;

    return {
      latestReading,
      latestReadingTs: latestEntry.sortDate || latestEntry.updatedAt || null,
      startOfWeekReading,
      changeFromStart,
      readingCount: weekEntries.length,
      displayStatus: getStatusFromReading(latestReading, normalizedThreshold),
      statusChange: "",
      weekEndDate: addDetailIsoDays(weekStart, 6),
    };
  }

  function resolveHeroWeeklyData(weeklyData, historyEntries, testPoint) {
    if (!weeklyData?.week) return weeklyData;

    const selectedSnapshot = buildDetailWeekHeroSnapshot(historyEntries, weeklyData.week, testPoint?.thresholdMv);
    if (!selectedSnapshot) return weeklyData;

    const previousWeek = addDetailIsoDays(weeklyData.week, -7);
    const previousSnapshot = buildDetailWeekHeroSnapshot(historyEntries, previousWeek, testPoint?.thresholdMv);

    return {
      ...weeklyData,
      summary: {
        ...(weeklyData.summary || {}),
        ...selectedSnapshot,
      },
      comparison: previousSnapshot
        ? {
          ...(weeklyData.comparison || {}),
          weekComparisonMv: selectedSnapshot.latestReading - previousSnapshot.latestReading,
          comparisonStatus: "",
        }
        : weeklyData.comparison,
    };
  }

  function renderHero(testPoint, latestEntry, weeklyData = currentDetailWeeklyData, historyEntries = currentAllHistoryEntries) {
    const hero = document.getElementById("detailHero");
    if (!hero) return;

    const resolvedWeeklyData = resolveHeroWeeklyData(weeklyData, historyEntries, testPoint);
    const summary = resolvedWeeklyData?.summary || null;
    const hasWeeklyContext = Boolean(resolvedWeeklyData?.week);
    const summaryReading = parseNumericValue(summary?.latestReading);
    const numericReading = hasWeeklyContext ? summaryReading : parseNumericValue(latestEntry?.latestReading);
    const status = hasWeeklyContext
      ? (summary && Number(summary.readingCount) > 0 ? summary.displayStatus || getStatusFromReading(numericReading, testPoint.thresholdMv) : "No Data")
      : latestEntry?.status || normalizePointStatus(testPoint.status) || getStatusFromReading(numericReading, testPoint.thresholdMv);
    const weeklyTrend = getDetailTrendModel(summary?.changeFromStart, summary?.statusChange, "week");
    const comparisonTrend = getDetailTrendModel(resolvedWeeklyData?.comparison?.weekComparisonMv, resolvedWeeklyData?.comparison?.comparisonStatus, "comparison");
    const weeks = resolvedWeeklyData?.weeks || [];
    const selectedWeek = resolvedWeeklyData?.week || "";
    const weekEnd = summary?.weekEndDate || (selectedWeek ? new Date(new Date(`${selectedWeek}T00:00:00Z`).getTime() + 6 * 86400000).toISOString().slice(0, 10) : "");
    const latestDailyTimestamp = (resolvedWeeklyData?.daily || []).map((row) => row.latestReadingTs).filter(Boolean).sort().at(-1);
    const selectedWeekTimestamp = latestDailyTimestamp || summary?.latestReadingTs || summary?.lastUpdated || null;
    const lastUpdated = hasWeeklyContext
      ? (selectedWeekTimestamp ? formatDisplayDateTime(selectedWeekTimestamp) : "Not recorded")
      : latestEntry?.updatedAt || "Not recorded";
    const statusClass = String(status).toLowerCase() === "protected" ? "green" : String(status).toLowerCase() === "warning" ? "amber" : String(status).toLowerCase() === "unprotected" ? "red" : "gray";
    const readingLabel = numericReading === null ? "No Data" : `${Math.round(numericReading)} mV`;

    hero.innerHTML = `
    <div class="detail-hero-top">
      <div class="detail-hero-identity">
        <div class="detail-hero-badges">
          <span>Test Point</span>
          <span class="detail-status-text ${statusClass}">${escapeHtml(status)}</span>
        </div>
        <h2>${escapeHtml(testPoint.label)}</h2>
        <div class="detail-hero-identity-meta">
          <span><i class="fa-solid fa-location-dot" aria-hidden="true"></i>${escapeHtml(testPoint.site || "Unknown Location")}</span>
          <span><i class="fa-solid fa-tag" aria-hidden="true"></i>${escapeHtml(String(testPoint.type || "Unknown").replaceAll("_", " "))}</span>
        </div>
      </div>
      <div class="detail-hero-actions">
        <button class="btn btn-light" type="button" data-detail-import-readings>Import Excel</button>
        <button class="btn btn-green" type="button" data-detail-add-reading>+ Add Reading</button>
      </div>
    </div>
    <div class="detail-hero-overview">
      <div class="detail-hero-metrics-group">
        <div class="detail-hero-metric detail-hero-current">
          <span>Latest selected-week reading</span>
          <strong>${escapeHtml(readingLabel)}</strong>
          <small>Threshold ${escapeHtml(`${Math.round(Number(testPoint.thresholdMv) || PROTECTED_THRESHOLD_MV)} mV`)}</small>
        </div>
        ${renderHeroTrend("Change this week", weeklyTrend)}
        ${renderHeroTrend("Compared with previous week", comparisonTrend)}
      </div>
      <div class="detail-hero-period">
        <label class="detail-week-selector" for="detailWeekSelector">Reporting week
          <select id="detailWeekSelector" aria-label="Select reporting week for this Test Point" ${weeks.length ? "" : "disabled"}>
            ${weeks.map((item) => `<option value="${escapeHtml(item.weekStartDate)}" ${item.weekStartDate === selectedWeek ? "selected" : ""}>Week of ${escapeHtml(formatDetailWeekDate(item.weekStartDate))}</option>`).join("")}
          </select>
        </label>
        <p>${selectedWeek ? `${escapeHtml(formatDetailWeekDate(selectedWeek))} – ${escapeHtml(formatDetailWeekDate(weekEnd))}` : "No reporting week available"}</p>
        <span>${Number(summary?.readingCount || 0).toLocaleString("en-SG")} readings · Updated ${escapeHtml(lastUpdated)}</span>
      </div>
    </div>
  `;
  }

  function renderNotesCard(testPoint) {
    const notes = document.getElementById("detailNotesContent");
    if (!notes) return;
    const locationNote = String(testPoint?.locationNote || "").trim();
    const pointNote = String(testPoint?.pointNote || "").trim();
    const noteSection = (title, value, emptyText) => `<section class="detail-note-section">
    <h4>${escapeHtml(title)}</h4>
    ${value
        ? `<p>${escapeHtml(value)}</p>`
        : `<div class="detail-note-empty"><i class="fa-regular fa-note-sticky" aria-hidden="true"></i><span>${escapeHtml(emptyText)}</span></div>`}
  </section>`;
    notes.innerHTML = [
      noteSection("Location note", locationNote, "No Location note has been recorded."),
      noteSection("Test Point note", pointNote, "No Test Point note has been recorded."),
    ].join("");
  }

  function hasEnvironmentReading(entry) {
    return ["temperatureValue", "conductivityValue", "phValue", "dissolvedOxygenValue", "powerValue"]
      .some((key) => isFiniteDetailNumber(entry?.[key]));
  }

  function getLatestEnvironmentEntry(entries) {
    return (entries || []).find(hasEnvironmentReading) || null;
  }

  function renderEnvironmentGrid(latestEntry) {
    const environmentGrid = document.getElementById("detailEnvironmentGrid");
    if (!environmentGrid) return;
    const timestamp = document.getElementById("detailEnvironmentTimestamp");
    if (timestamp) timestamp.textContent = latestEntry?.updatedAt
      ? `Latest environment recorded: ${latestEntry.updatedAt}`
      : "Latest environment recorded: Not recorded";

    const cards = [
      { label: "Temperature", value: latestEntry?.temperature || "—", tint: "warm", icon: "fa-temperature-half" },
      { label: "Conductivity", value: latestEntry?.mediumConductivity || "—", tint: "cool", icon: "fa-wave-square" },
      { label: "pH", value: latestEntry?.ph || "—", tint: "violet", icon: "fa-flask" },
      { label: "Dissolved Oxygen", value: latestEntry?.dissolvedOxygen || "—", tint: "cyan", icon: "fa-droplet" },
    ];

    // Power (watts) only applies to "variable" (impressed-current) systems that
    // have a controllable power supply — "stationary" (fixed/galvanic) systems
    // have nothing to show here, so the tile is left out entirely rather than
    // shown as "Not recorded".
    if (currentDetailTestPoint?.type === "variable") {
      cards.push({ label: "Power", value: latestEntry?.power || "—", tint: "mint", icon: "fa-bolt" });
    }

    environmentGrid.innerHTML = cards
      .map(
        (card) => `
        <div class="detail-environment-tile ${card.tint}">
          <i class="fa-solid ${card.icon}" aria-hidden="true"></i>
          <strong>${escapeHtml(card.value)}</strong>
          <span>${escapeHtml(card.label)}</span>
          ${card.value === "—" || card.value === "N/A" ? "<small>Not recorded</small>" : ""}
        </div>
      `
      )
      .join("");
  }

  function isCurrentDetailUserAdmin() {
    return localStorage.getItem("userRole") === "admin";
  }

  function getEquipmentVersionLabel(version) {
    return `Version ${Number.isFinite(version?.versionNo) ? version.versionNo : "?"}`;
  }

  function renderEquipmentTracking(testPoint, versions = [], loadError = null) {
    const content = document.getElementById("detailEquipmentContent");
    const meta = document.getElementById("detailEquipmentMeta");
    const actionButton = document.getElementById("openEquipmentChangeModalButton");
    if (!content) return;

    const canManage = isCurrentDetailUserAdmin();
    if (actionButton) {
      actionButton.hidden = !canManage;
      actionButton.disabled = !testPoint;
    }

    if (loadError) {
      if (meta) meta.textContent = "Equipment tracking could not be loaded";
      content.innerHTML = `
      <div class="detail-equipment-empty">
        <strong>Equipment history unavailable</strong>
        <p>${escapeHtml(loadError.message || "Check the equipment table and RLS policies in Supabase.")}</p>
      </div>
    `;
      return;
    }

    const sortedVersions = versions.slice().sort((left, right) => {
      const leftVersion = Number.isFinite(left.versionNo) ? left.versionNo : 0;
      const rightVersion = Number.isFinite(right.versionNo) ? right.versionNo : 0;
      return rightVersion - leftVersion || new Date(right.installedAt).getTime() - new Date(left.installedAt).getTime();
    });
    const activeVersion = sortedVersions.find((version) => !version.removedAt) || sortedVersions[0] || null;

    if (meta) {
      meta.textContent = activeVersion
        ? `${getEquipmentVersionLabel(activeVersion)} active since ${formatDateTime(activeVersion.installedAt)}`
        : "No equipment history recorded yet";
    }

    if (!sortedVersions.length) {
      content.innerHTML = `
      <div class="detail-equipment-empty">
        <strong>No equipment history recorded yet.</strong>
        <p>${canManage ? "Record the initial install to start tracking changes." : "An admin can record the initial install for this test point."}</p>
      </div>
    `;
      return;
    }

    const currentMarkup = activeVersion ? `
    <div class="detail-equipment-current">
      <div>
        <span>Current Equipment</span>
        <strong>${escapeHtml(getEquipmentVersionLabel(activeVersion))}</strong>
      </div>
      <div>
        <span>Change Type</span>
        <strong>${escapeHtml(formatEquipmentChangeType(activeVersion.changeType))}</strong>
      </div>
      <div>
        <span>Installed</span>
        <strong>${escapeHtml(formatDateTime(activeVersion.installedAt))}</strong>
      </div>
      <div>
        <span>Reason</span>
        <strong>${escapeHtml(activeVersion.reason || "N/A")}</strong>
      </div>
    </div>
  ` : "";

    const timelineMarkup = sortedVersions.map((version) => `
    <article class="detail-equipment-timeline-item ${version.removedAt ? "" : "active"}">
      <div class="detail-equipment-timeline-marker" aria-hidden="true"></div>
      <div class="detail-equipment-timeline-body">
        <div class="detail-equipment-timeline-top">
          <strong>${escapeHtml(getEquipmentVersionLabel(version))}</strong>
          <span>${escapeHtml(formatEquipmentChangeType(version.changeType))}</span>
        </div>
        <p>${escapeHtml(formatDateTime(version.installedAt))} - ${escapeHtml(version.removedAt ? formatDateTime(version.removedAt) : "Present")}</p>
        ${version.reason ? `<small><b>Reason:</b> ${escapeHtml(version.reason)}</small>` : ""}
        ${version.notes ? `<small><b>Note:</b> ${escapeHtml(version.notes)}</small>` : ""}
      </div>
    </article>
  `).join("");

    content.innerHTML = `
    ${currentMarkup}
    <div class="detail-equipment-timeline">
      <h4>Equipment Timeline</h4>
      ${timelineMarkup}
    </div>
  `;
  }

  function setEquipmentChangeMessage(message = "", type = "muted") {
    const messageElement = document.getElementById("equipmentChangeMessage");
    if (!messageElement) return;
    messageElement.className = `form-message ${type}`;
    messageElement.textContent = message;
  }

  function clearEquipmentChangeForm() {
    const hasHistory = currentEquipmentVersions.length > 0;
    const changeTypeInput = document.getElementById("equipmentChangeTypeInput");
    const installedAtInput = document.getElementById("equipmentInstalledAtInput");
    const reasonInput = document.getElementById("equipmentReasonInput");
    const notesInput = document.getElementById("equipmentNotesInput");

    if (changeTypeInput) changeTypeInput.value = hasHistory ? "replacement" : "initial_install";
    if (installedAtInput) installedAtInput.value = formatDateTimeInputValue();
    if (reasonInput) reasonInput.value = "";
    if (notesInput) notesInput.value = "";
    setEquipmentChangeMessage("");
  }

  function openEquipmentChangeModal() {
    if (!currentDetailTestPoint) {
      window.notifyUser?.("Load a test point before recording equipment changes.", "warning");
      return;
    }

    if (!isCurrentDetailUserAdmin()) {
      window.notifyUser?.("Only admins can record equipment changes.", "warning");
      return;
    }

    const subtitle = document.getElementById("equipmentChangeModalSubtitle");
    const nextVersion = Math.max(0, ...currentEquipmentVersions.map((version) => Number(version.versionNo) || 0)) + 1;
    if (subtitle) {
      subtitle.textContent = `This will create Version ${nextVersion} for ${currentDetailTestPoint.label}. The current active version will end at the installed date.`;
    }

    clearEquipmentChangeForm();
    openModal("equipmentChangeModal");
  }

  function closeEquipmentChangeModal() {
    clearEquipmentChangeForm();
    closeModal("equipmentChangeModal");
  }

  async function submitEquipmentChange() {
    const submitButton = document.getElementById("submitEquipmentChangeButton");
    const testPoint = currentDetailTestPoint;
    if (!testPoint) {
      setEquipmentChangeMessage("Test point context is missing. Reload the page and try again.", "error");
      return;
    }

    if (!isCurrentDetailUserAdmin()) {
      setEquipmentChangeMessage("Only admins can record equipment changes.", "error");
      return;
    }

    const changeType = document.getElementById("equipmentChangeTypeInput")?.value || "replacement";
    const installedAt = parseDateTimeInputValue(document.getElementById("equipmentInstalledAtInput")?.value);
    const reason = document.getElementById("equipmentReasonInput")?.value.trim() || "";
    const notes = document.getElementById("equipmentNotesInput")?.value.trim() || "";

    if (!installedAt) {
      setEquipmentChangeMessage("Choose a valid installed date.", "error");
      return;
    }

    const restoreButton = window.AppToast?.withButtonLoading?.(submitButton, "Saving...");
    if (submitButton) submitButton.disabled = true;
    setEquipmentChangeMessage("Saving equipment change...", "muted");

    let closedActiveIds = [];

    try {
      const user = await ensureActiveUser();
      const versions = await fetchEquipmentVersions(testPoint.id);
      const activeVersions = versions.filter((version) => !version.removedAt);
      const installedTimestamp = new Date(installedAt).getTime();

      const invalidActiveVersion = activeVersions.find((version) => {
        const activeInstalledTimestamp = new Date(version.installedAt).getTime();
        return Number.isFinite(activeInstalledTimestamp) && installedTimestamp < activeInstalledTimestamp;
      });
      if (invalidActiveVersion) {
        throw new Error(`Installed date cannot be before ${getEquipmentVersionLabel(invalidActiveVersion)} was installed.`);
      }

      closedActiveIds = activeVersions.map((version) => version.id).filter(Boolean);
      if (closedActiveIds.length) {
        const { error: closeError } = await window.appSupabase
          .from(TEST_POINT_EQUIPMENT_VERSIONS_TABLE)
          .update({ removed_at: installedAt })
          .in("id", closedActiveIds);

        if (closeError) {
          throw new Error(closeError.message || "Unable to close the active equipment version.");
        }
      }

      const nextVersionNo = Math.max(0, ...versions.map((version) => Number(version.versionNo) || 0)) + 1;
      const { data: insertedVersion, error: insertError } = await window.appSupabase
        .from(TEST_POINT_EQUIPMENT_VERSIONS_TABLE)
        .insert({
          test_point_id: testPoint.id,
          version_no: nextVersionNo,
          installed_at: installedAt,
          change_type: changeType,
          reason: reason || null,
          notes: notes || null,
          created_by: user.id,
        })
        .select("id, test_point_id, version_no, installed_at, removed_at, change_type, reason, notes, created_by, created_at")
        .single();

      if (insertError) {
        if (closedActiveIds.length) {
          await window.appSupabase
            .from(TEST_POINT_EQUIPMENT_VERSIONS_TABLE)
            .update({ removed_at: null })
            .in("id", closedActiveIds);
        }
        throw new Error(insertError.message || "Unable to create the new equipment version.");
      }

      const { error: testPointUpdateError } = await window.appSupabase
        .from(TEST_POINTS_TABLE)
        .update({ current_equipment_version_id: insertedVersion.id })
        .eq("id", testPoint.id);

      if (testPointUpdateError) {
        console.warn("Unable to update current equipment pointer:", testPointUpdateError.message || testPointUpdateError);
      }

      window.AppToast?.success?.(`Equipment ${getEquipmentVersionLabel(mapEquipmentVersionRow(insertedVersion))} recorded.`);
      closeEquipmentChangeModal();
      await renderDetails();
    } catch (error) {
      console.error("Failed to record equipment change:", error);
      setEquipmentChangeMessage(error.message || "Unable to record equipment change.", "error");
    } finally {
      if (submitButton) submitButton.disabled = false;
      restoreButton?.();
    }
  }

  function buildDetailHistoryPages(totalPages, currentPage) {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const pages = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
    if (currentPage <= 3) {
      pages.add(2);
      pages.add(3);
      pages.add(4);
    }
    if (currentPage >= totalPages - 2) {
      pages.add(totalPages - 1);
      pages.add(totalPages - 2);
      pages.add(totalPages - 3);
    }

    const orderedPages = Array.from(pages)
      .filter((page) => page >= 1 && page <= totalPages)
      .sort((left, right) => left - right);

    return orderedPages.flatMap((page, index) => {
      if (index === 0) return [page];
      const previousPage = orderedPages[index - 1];
      return page - previousPage > 1 ? ["ellipsis", page] : [page];
    });
  }

  function compareDetailHistoryText(a, b) {
    return String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base", numeric: true });
  }

  function formatDetailHistorySource(entry) {
    const value = String(entry?.uploadMethod || "").trim();
    if (!value) return "Imported Data";
    if (value.toLowerCase() === "manual") return "Manual Entry";
    return value
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ") || "System Import";
  }

  function activeDetailHistoryFilterCount() {
    return Object.values(detailHistoryFilters).filter(Boolean).length;
  }

  function getDetailHistorySortValue(entry, key) {
    const valueMap = {
      status: entry?.status || "",
      readingValue: Number.isFinite(entry?.readingValue) ? entry.readingValue : null,
      sortDate: entry?.sortDate ? new Date(entry.sortDate).getTime() : null,
      enteredBy: entry?.enteredBy || "",
      temperatureValue: Number.isFinite(entry?.temperatureValue) ? entry.temperatureValue : null,
      conductivityValue: Number.isFinite(entry?.conductivityValue) ? entry.conductivityValue : null,
      phValue: Number.isFinite(entry?.phValue) ? entry.phValue : null,
      dissolvedOxygenValue: Number.isFinite(entry?.dissolvedOxygenValue) ? entry.dissolvedOxygenValue : null,
      powerValue: Number.isFinite(entry?.powerValue) ? entry.powerValue : null,
    };
    return valueMap[key];
  }

  function sortDetailHistoryEntries(entries) {
    const direction = detailHistorySortDirection === "desc" ? -1 : 1;
    const statusOrder = { Protected: 0, Warning: 1, Unprotected: 2, Unknown: 3 };

    return entries.slice().sort((left, right) => {
      const leftValue = getDetailHistorySortValue(left, detailHistorySortKey);
      const rightValue = getDetailHistorySortValue(right, detailHistorySortKey);
      const leftMissing = leftValue === null || leftValue === undefined || leftValue === "" || Number.isNaN(leftValue);
      const rightMissing = rightValue === null || rightValue === undefined || rightValue === "" || Number.isNaN(rightValue);

      if (leftMissing || rightMissing) {
        return leftMissing && rightMissing
          ? compareDetailHistoryText(left?.updatedAt, right?.updatedAt)
          : leftMissing
            ? 1
            : -1;
      }

      if (detailHistorySortKey === "status") {
        return ((statusOrder[leftValue] ?? 99) - (statusOrder[rightValue] ?? 99)) * direction;
      }

      if (["readingValue", "sortDate", "temperatureValue", "conductivityValue", "phValue", "dissolvedOxygenValue", "powerValue"].includes(detailHistorySortKey)) {
        return (Number(leftValue) - Number(rightValue)) * direction;
      }

      return compareDetailHistoryText(leftValue, rightValue) * direction || compareDetailHistoryText(left?.updatedAt, right?.updatedAt);
    });
  }

  function fillDetailHistorySelect(id, values, label) {
    const select = document.getElementById(id);
    if (!select) return;
    const previousValue = select.value;
    select.innerHTML = `<option value="">${escapeHtml(label)}</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
    select.value = values.includes(previousValue) ? previousValue : "";
  }

  function populateDetailHistoryFilters() {
    fillDetailHistorySelect("detailHistoryStatusFilter", [...new Set(currentAllHistoryEntries.map((entry) => entry.status).filter(Boolean))], "All statuses");
    fillDetailHistorySelect("detailHistorySourceFilter", [...new Set(currentAllHistoryEntries.map((entry) => formatDetailHistorySource(entry)).filter(Boolean))], "All sources");
    fillDetailHistorySelect("detailHistoryRecordedByFilter", [...new Set(currentAllHistoryEntries.map((entry) => entry.enteredBy).filter(Boolean))], "All recorded by");
  }

  function renderDetailHistoryFilterSummary(entries) {
    const totalPages = Math.max(1, Math.ceil(entries.length / detailHistoryRowsPerPage));
    const countLabel = document.getElementById("detailHistoryCountLabel");
    const resultMeta = document.getElementById("detailHistoryResultMeta");
    const badge = document.getElementById("detailHistoryFilterCount");
    const chips = document.getElementById("detailHistoryFilterChips");
    const count = activeDetailHistoryFilterCount();

    if (countLabel) countLabel.textContent = `${entries.length} results`;
    if (resultMeta) resultMeta.textContent = `${entries.length} results · Page ${Math.min(currentHistoryPage, totalPages)} of ${totalPages}`;
    if (badge) {
      badge.hidden = !count;
      badge.textContent = count;
    }
    if (chips) {
      const labels = { status: "Status", source: "Source", recordedBy: "Recorded By" };
      chips.innerHTML = Object.entries(detailHistoryFilters)
        .filter(([, value]) => value)
        .map(([key, value]) => `<button class="dashboard-filter-chip" type="button" data-detail-history-remove-filter="${key}">${labels[key]}: ${escapeHtml(value)} <i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`)
        .join("");
    }
  }

  function matchesDetailHistorySearch(entry, query) {
    if (!query) return true;

    const haystack = [
      entry?.status,
      entry?.latestReading,
      entry?.updatedAt,
      entry?.enteredBy,
      formatDetailHistorySource(entry),
      entry?.temperature,
      entry?.mediumConductivity,
      entry?.ph,
      entry?.dissolvedOxygen,
    ]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");

    return haystack.includes(query);
  }

  function getFilteredHistoryEntries(entries = currentAllHistoryEntries) {
    const query = String(detailHistorySearch || "").trim().toLowerCase();
    const filteredEntries = entries.filter((entry) => {
      const matchesSearch = !query || matchesDetailHistorySearch(entry, query);
      return matchesSearch
        && (!detailHistoryFilters.status || entry.status === detailHistoryFilters.status)
        && (!detailHistoryFilters.source || formatDetailHistorySource(entry) === detailHistoryFilters.source)
        && (!detailHistoryFilters.recordedBy || entry.enteredBy === detailHistoryFilters.recordedBy);
    });

    return sortDetailHistoryEntries(filteredEntries);
  }

  function syncDetailHistorySearchUi() {
    const searchInput = document.getElementById("detailHistorySearchInput");
    const clearButton = document.getElementById("detailHistorySearchClear");

    if (searchInput && searchInput.value !== detailHistorySearch) {
      searchInput.value = detailHistorySearch;
    }
    if (clearButton) {
      clearButton.hidden = !detailHistorySearch;
    }
  }

  function handleDetailHistorySearch(value) {
    detailHistorySearch = String(value || "").trim();
    currentHistoryPage = 1;
    syncDetailHistorySearchUi();
    renderHistoryTable(getFilteredHistoryEntries(), currentDetailTestPoint);
  }

  function resetDetailHistoryFilters() {
    detailHistorySearch = "";
    detailHistoryFilters.status = "";
    detailHistoryFilters.source = "";
    detailHistoryFilters.recordedBy = "";
    detailHistoryRowsPerPage = getDetailHistoryDefaultPageSize();
    detailHistorySortKey = "sortDate";
    detailHistorySortDirection = "desc";
    currentHistoryPage = 1;
    detailHistorySortController?.destroy();
    detailHistorySortController = createDetailHistorySortController();

    const rowsSelect = document.getElementById("detailHistoryRowsPerPage");
    if (rowsSelect) rowsSelect.value = String(detailHistoryRowsPerPage);
    ["detailHistoryStatusFilter", "detailHistorySourceFilter", "detailHistoryRecordedByFilter"].forEach((id) => {
      const element = document.getElementById(id);
      if (element) element.value = "";
    });

    renderHistoryTable(getFilteredHistoryEntries(), currentDetailTestPoint);
  }

  function renderHistoryTable(entries, testPoint = currentDetailTestPoint) {
    const historyTable = document.getElementById("detailHistoryTable");
    const historySummary = document.getElementById("detailHistoryPageSummary");
    const historyPagination = document.getElementById("detailHistoryPagination");
    if (!historyTable) return;
    const canManageActions = canManageDetailHistoryActions();

    // Power only applies to variable Test Points, so stationary points omit the
    // column instead of displaying a column of missing values.
    const showPower = testPoint?.type === "variable";
    const powerHeader = document.getElementById("historyPowerHeader");
    const actionHeader = document.getElementById("historyActionHeader");
    if (powerHeader) powerHeader.style.display = showPower ? "" : "none";
    const columnCount = showPower ? 10 : 9;

    currentHistoryEntries = entries.slice();
    syncDetailHistorySearchUi();
    renderDetailHistoryFilterSummary(entries);

    if (!entries.length) {
      historyTable.innerHTML = `<tr><td colspan="${columnCount}">${detailHistorySearch ? "No reading history matches your search." : "No reading history found for this Test Point."}</td></tr>`;
      if (historySummary) historySummary.textContent = "Showing 0-0 of 0";
      if (historyPagination) historyPagination.innerHTML = "";
      return;
    }

    const totalPages = Math.max(1, Math.ceil(entries.length / detailHistoryRowsPerPage));
    currentHistoryPage = Math.min(currentHistoryPage, totalPages);
    const startIndex = (currentHistoryPage - 1) * detailHistoryRowsPerPage;
    const pagedEntries = entries.slice(startIndex, startIndex + detailHistoryRowsPerPage);

    if (historySummary) {
      historySummary.textContent = `Showing ${startIndex + 1}-${Math.min(startIndex + detailHistoryRowsPerPage, entries.length)} of ${entries.length}`;
    }

    if (historyPagination) {
      if (totalPages <= 1) {
        historyPagination.innerHTML = "";
      } else {
        const visiblePages = buildDetailHistoryPages(totalPages, currentHistoryPage);
        historyPagination.innerHTML = `
        <button class="page-btn detail-history-page-btn detail-history-nav-btn" type="button" ${currentHistoryPage === 1 ? "disabled" : ""} data-detail-history-page="${currentHistoryPage - 1}" aria-label="Previous history page">&lt;</button>
        ${visiblePages.map((page) => {
          if (page === "ellipsis") {
            return '<span class="pagination-ellipsis" aria-hidden="true">...</span>';
          }
          return `<button class="page-btn detail-history-page-btn ${page === currentHistoryPage ? "active" : ""}" type="button" data-detail-history-page="${page}" aria-label="History page ${page}" ${page === currentHistoryPage ? 'aria-current="page"' : ""}>${page}</button>`;
        }).join("")}
        <button class="page-btn detail-history-page-btn detail-history-nav-btn" type="button" ${currentHistoryPage === totalPages ? "disabled" : ""} data-detail-history-page="${currentHistoryPage + 1}" aria-label="Next history page">&gt;</button>
      `;
      }
    }

    historyTable.innerHTML = pagedEntries
      .map((entry) => `
      <tr>
        <td>${escapeHtml(entry.updatedAt || "Unknown")}</td>
        <td class="app-table-numeric">${escapeHtml(entry.latestReading || "—")}</td>
        <td><span class="badge ${statusClass(entry.status)}">${escapeHtml(entry.status)}</span></td>
        <td class="app-table-numeric">${escapeHtml(entry.temperature === "N/A" ? "—" : entry.temperature || "—")}</td>
        <td class="app-table-numeric">${escapeHtml(entry.mediumConductivity === "N/A" ? "—" : entry.mediumConductivity || "—")}</td>
        <td class="app-table-numeric">${escapeHtml(entry.ph === "N/A" ? "—" : entry.ph || "—")}</td>
        <td class="app-table-numeric">${escapeHtml(entry.dissolvedOxygen === "N/A" ? "—" : entry.dissolvedOxygen || "—")}</td>
        ${showPower ? `<td class="app-table-numeric">${escapeHtml(entry.power === "N/A" ? "—" : entry.power || "—")}</td>` : ""}
        <td>${escapeHtml(entry.enteredBy || "Unknown User")}</td>
        <td>
          ${canCurrentUserEditReading(entry)
          ? `<button class="icon-button detail-history-action detail-history-action-edit" type="button" data-detail-edit-reading="${escapeHtml(entry.id)}" aria-label="Edit reading from ${escapeHtml(entry.updatedAt || "history")}">
                <i class="fa-solid fa-pen" aria-hidden="true"></i>
              </button>`
          : ""}
          ${currentUserIsAdmin && entry.canDelete && looksLikeUuid(entry.id)
          ? `<button class="icon-button detail-history-action detail-history-action-delete" type="button" data-detail-delete-reading="${escapeHtml(entry.id)}" aria-label="Remove reading from ${escapeHtml(entry.updatedAt || "history")}">
                <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
              </button>`
          : !canCurrentUserEditReading(entry)
            ? '<span class="detail-history-action-placeholder">-</span>'
            : ""}
        </td>
      </tr>
    `)
      .join("");
  }

  async function deleteReadingEntry(readingId, triggerButton) {
    if (!canManageDetailHistoryActions()) {
      window.AppToast?.error?.("You do not have permission to delete readings.");
      return;
    }

    const normalizedReadingId = normalizeUuid(readingId);
    if (!normalizedReadingId) {
      window.AppToast?.error?.("This reading cannot be removed.");
      return;
    }

    if (!currentDetailPointId) {
      window.AppToast?.error?.("Test point context is missing. Please reload the page.");
      return;
    }

    // Deleting is admin-only — there's no "own recent reading" exception here
    // like there is for editing (matches the "Admins can delete ..." RLS
    // policies, which have no equivalent engineer-level delete policy at all).
    if (!currentUserIsAdmin) {
      window.AppToast?.error?.("Only an admin can remove a reading.");
      return;
    }

    if (!window.confirm("Remove this reading? This action cannot be undone.")) return;

    const restoreButton = window.AppToast?.withButtonLoading?.(triggerButton, "Removing...");

    try {
      await ensureActiveUser();

      // Exact count instead of a bare .delete() so a permission-blocked delete
      // (0 rows affected, no error) surfaces as a real error rather than a
      // false "Reading removed" toast — same class of fix as the edit save path.
      const { error, count } = await window.appSupabase
        .from(TEST_POINT_READINGS_TABLE)
        .delete({ count: "exact" })
        .eq("id", normalizedReadingId)
        .eq("test_point_id", currentDetailPointId);

      if (error) {
        throw new Error(error.message || "Unable to remove the selected reading.");
      }
      if (!count) {
        throw new Error("No reading was removed. You may not have permission to remove this reading.");
      }

      window.AppToast?.success?.("Reading removed.");
      await renderDetails();
    } catch (error) {
      console.error("Failed to remove reading:", error);
      window.AppToast?.error?.(error.message || "Unable to remove the selected reading.");
    } finally {
      restoreButton?.();
    }
  }

  function getChartEntriesForRange(entries, range = currentChartRange) {
    const validEntries = (entries || []).filter((entry) => parseNumericValue(entry.latestReading) !== null);
    if (!validEntries.length) {
      return [];
    }

    const latestTimestamp = getEntryTimestamp(validEntries[0]);
    if (!latestTimestamp) {
      return validEntries.slice(0, 10).reverse();
    }

    const windowMs =
      range === "day"
        ? 24 * 60 * 60 * 1000
        : range === "month"
          ? 30 * 24 * 60 * 60 * 1000
          : 7 * 24 * 60 * 60 * 1000;
    const filteredEntries = validEntries.filter((entry) => {
      const timestamp = getEntryTimestamp(entry);
      return timestamp !== null && (latestTimestamp - timestamp) <= windowMs && (latestTimestamp - timestamp) >= 0;
    });

    const sourceEntries = filteredEntries.length ? filteredEntries : validEntries;

    if (range === "day") {
      return sourceEntries.slice(0, 24).reverse();
    }

    if (range === "month") {
      const groupedByDate = new Map();
      const newestToOldest = sourceEntries.slice();

      newestToOldest.forEach((entry) => {
        const dateKey = getCalendarDateKey(entry.sortDate || entry.updatedAt);
        if (!dateKey) return;

        const currentGroup = groupedByDate.get(dateKey) || {
          key: dateKey,
          sortDate: entry.sortDate || entry.updatedAt,
          updatedAt: entry.updatedAt,
          thresholdMv: entry.thresholdMv,
          values: [],
          latestEntry: entry,
        };

        currentGroup.values.push(entry.readingValue);

        const currentLatestTs = getEntryTimestamp(currentGroup.latestEntry) || 0;
        const entryTs = getEntryTimestamp(entry) || 0;
        if (entryTs > currentLatestTs) {
          currentGroup.latestEntry = entry;
          currentGroup.sortDate = entry.sortDate || entry.updatedAt;
          currentGroup.updatedAt = entry.updatedAt;
          currentGroup.thresholdMv = entry.thresholdMv;
        }

        groupedByDate.set(dateKey, currentGroup);
      });

      const groupedEntries = Array.from(groupedByDate.values())
        .sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime())
        .slice(0, 30)
        .map((group) => {
          const averageValue = Math.round(
            group.values.reduce((sum, value) => sum + value, 0) / group.values.length
          );
          const latestEntry = group.latestEntry;

          return {
            ...latestEntry,
            latestReading: formatReading(averageValue),
            readingValue: averageValue,
            status: getStatusFromReading(averageValue, group.thresholdMv ?? PROTECTED_THRESHOLD_MV),
            chartLabel: formatChartLabel(group.sortDate || latestEntry.updatedAt, "month"),
          };
        })
        .reverse();

      if (groupedEntries.length >= 3) {
        return groupedEntries;
      }

      return createBucketedChartEntries(sourceEntries.slice(0, 60), 10, "month");
    }

    const groupedByDate = new Map();
    const newestToOldest = sourceEntries.slice();

    newestToOldest.forEach((entry) => {
      const dateKey = getCalendarDateKey(entry.sortDate || entry.updatedAt);
      if (!dateKey) return;

      const currentGroup = groupedByDate.get(dateKey) || {
        key: dateKey,
        sortDate: entry.sortDate || entry.updatedAt,
        updatedAt: entry.updatedAt,
        thresholdMv: entry.thresholdMv,
        values: [],
        latestEntry: entry,
      };

      currentGroup.values.push(entry.readingValue);

      const currentLatestTs = getEntryTimestamp(currentGroup.latestEntry) || 0;
      const entryTs = getEntryTimestamp(entry) || 0;
      if (entryTs > currentLatestTs) {
        currentGroup.latestEntry = entry;
        currentGroup.sortDate = entry.sortDate || entry.updatedAt;
        currentGroup.updatedAt = entry.updatedAt;
        currentGroup.thresholdMv = entry.thresholdMv;
      }

      groupedByDate.set(dateKey, currentGroup);
    });

    const groupedEntries = Array.from(groupedByDate.values())
      .sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime())
      .slice(0, 7)
      .map((group) => {
        const averageValue = Math.round(
          group.values.reduce((sum, value) => sum + value, 0) / group.values.length
        );
        const latestEntry = group.latestEntry;

        return {
          ...latestEntry,
          latestReading: formatReading(averageValue),
          readingValue: averageValue,
          status: getStatusFromReading(averageValue, group.thresholdMv ?? PROTECTED_THRESHOLD_MV),
          chartLabel: formatChartLabel(group.sortDate || latestEntry.updatedAt, "week"),
        };
      })
      .reverse();

    if (groupedEntries.length >= 2) {
      return groupedEntries;
    }

    return createBucketedChartEntries(sourceEntries.slice(0, 28), 7, "week");
  }

  function updateChartRangePills() {
    const pillContainer = document.getElementById("detailChartRangePills");
    if (!pillContainer) return;

    Array.from(pillContainer.querySelectorAll("[data-range]")).forEach((pill) => {
      const isActive = pill.getAttribute("data-range") === currentChartRange;
      pill.classList.toggle("active", isActive);
      pill.setAttribute("aria-pressed", String(isActive));
    });
  }

  function setDetailChartRange(range) {
    currentChartRange = range === "day" || range === "month" ? range : "week";
    updateChartRangePills();

    if (currentChartTestPoint) {
      renderHistoryChart(currentChartTestPoint, currentChartEntries);
    }
  }

  function bindChartRangePills() {
    const pillContainer = document.getElementById("detailChartRangePills");
    if (!pillContainer || pillContainer.dataset.bound === "true") return;

    pillContainer.addEventListener("click", (event) => {
      const pill = event.target.closest("[data-range]");
      if (!pill) return;
      setDetailChartRange(pill.getAttribute("data-range"));
    }, { signal: testPointViewAbortController.signal });

    pillContainer.dataset.bound = "true";
  }

  function scheduleDetailChartRefresh(delay = 220) {
    window.clearTimeout(detailChartRefreshTimer);
    detailChartRefreshTimer = window.setTimeout(() => {
      if (currentChartTestPoint) {
        renderHistoryChart(currentChartTestPoint, currentChartEntries);
        return;
      }
      currentDetailHistoryChart?.resize();
      currentDetailHistoryChart?.update();
      resizeDetailEnvironmentCharts();
    }, delay);
  }

  function scheduleDetailChartRetry(delay = 180) {
    window.clearTimeout(detailChartRetryTimer);
    detailChartRetryTimer = window.setTimeout(() => {
      if (currentChartTestPoint) {
        renderHistoryChart(currentChartTestPoint, currentChartEntries);
      }
    }, delay);
  }

  function bindDetailChartResizeObserver() {
    if (!("ResizeObserver" in window) || detailChartResizeObserver) return;

    const chartContainer = document.getElementById("detailHistoryChart");
    if (!chartContainer) return;

    let previousWidth = 0;
    detailChartResizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      const nextWidth = Math.round(entry?.contentRect?.width || 0);
      if (!nextWidth || nextWidth === previousWidth) return;

      previousWidth = nextWidth;
      scheduleDetailChartRefresh(80);
    });

    detailChartResizeObserver.observe(chartContainer);
  }

  function getDetailChartContainerSize(chartContainer) {
    const rect = chartContainer?.getBoundingClientRect?.() || { width: 0, height: 0 };
    return {
      width: Math.max(Math.round(rect.width || chartContainer?.clientWidth || 0), 0),
      height: Math.max(Math.round(rect.height || chartContainer?.clientHeight || 300), 300),
    };
  }

  function setDetailHistoryPage(page) {
    const totalPages = Math.max(1, Math.ceil(currentHistoryEntries.length / detailHistoryRowsPerPage));
    currentHistoryPage = Math.min(Math.max(1, page), totalPages);
    renderHistoryTable(currentHistoryEntries, currentChartTestPoint);
  }

  function getDetailChartYAxisBounds(values, thresholdMv = PROTECTED_THRESHOLD_MV) {
    const threshold = PROTECTED_THRESHOLD_MV;
    const minValue = Math.min(...values, threshold);
    const maxValue = Math.max(...values, threshold);
    const padding = minValue === maxValue ? Math.max(Math.abs(maxValue) * 0.02, 8) : 15;
    return {
      min: Math.floor((minValue - padding) / 10) * 10,
      max: Math.ceil((maxValue + padding) / 10) * 10,
    };
  }

  function isFiniteDetailNumber(value) {
    return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  }

  function roundDetailEnvironmentValue(value, decimals = 0) {
    const factor = 10 ** decimals;
    return Math.round(Number(value) * factor) / factor;
  }

  function getDetailSelectedWeekStart() {
    const week = currentDetailWeeklyData?.week || detailWeeklyView?.week || "";
    return /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : "";
  }

  function getDetailPeriodBoundaryIso(isoDate, offsetDays = 0) {
    const targetDate = addDetailIsoDays(isoDate, offsetDays);
    const parsedDate = new Date(`${targetDate}T00:00:00+08:00`);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString();
  }

  function getDetailNextMonthStart(isoDate) {
    const [year, month] = String(isoDate || "").split("-").map(Number);
    if (![year, month].every(Number.isFinite)) return "";
    return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  }

  function getDetailEnvironmentPeriodWindow() {
    const selectedWeek = getDetailSelectedWeekStart();
    if (!selectedWeek) return null;

    if (currentChartRange === "month") {
      const monthStart = `${selectedWeek.slice(0, 7)}-01`;
      const nextMonthStart = getDetailNextMonthStart(monthStart);
      const from = getDetailPeriodBoundaryIso(monthStart, 0);
      const toBoundary = getDetailPeriodBoundaryIso(nextMonthStart, 0);
      return from && toBoundary
        ? { from, to: new Date(new Date(toBoundary).getTime() - 1).toISOString() }
        : null;
    }

    const from = getDetailPeriodBoundaryIso(selectedWeek, 0);
    const toBoundary = getDetailPeriodBoundaryIso(selectedWeek, 7);
    return from && toBoundary
      ? { from, to: new Date(new Date(toBoundary).getTime() - 1).toISOString() }
      : null;
  }

  function getDetailEnvironmentRangeLabel() {
    if (getDetailSelectedWeekStart()) {
      if (currentChartRange === "month") return "selected month";
      return "selected reporting week";
    }
    if (currentChartRange === "day") return "last 24 hours";
    if (currentChartRange === "month") return "last 30 days";
    return "last 7 days";
  }

  function getDetailEnvironmentPoints(entries, metricConfig, { useLoadedRange = false } = {}) {
    const validEntries = (entries || [])
      .filter((entry) => isFiniteDetailNumber(entry?.[metricConfig.valueKey]) && getEntryTimestamp(entry) !== null)
      .sort((left, right) => (getEntryTimestamp(right) || 0) - (getEntryTimestamp(left) || 0));

    if (!validEntries.length) return [];

    let rangeEntries = validEntries;
    if (useLoadedRange && currentChartRange === "day") {
      const latestDay = validEntries
        .map((entry) => getCalendarDateKey(entry.sortDate || entry.updatedAt))
        .filter(Boolean)
        .sort()
        .at(-1);
      rangeEntries = latestDay
        ? validEntries.filter((entry) => getCalendarDateKey(entry.sortDate || entry.updatedAt) === latestDay)
        : [];
    } else if (!useLoadedRange) {
      const latestTimestamp = getEntryTimestamp(validEntries[0]);
      const windowMs =
        currentChartRange === "day"
          ? 24 * 60 * 60 * 1000
          : currentChartRange === "month"
            ? 30 * 24 * 60 * 60 * 1000
            : 7 * 24 * 60 * 60 * 1000;
      const sourceEntries = validEntries.filter((entry) => {
        const timestamp = getEntryTimestamp(entry);
        return timestamp !== null && (latestTimestamp - timestamp) <= windowMs && (latestTimestamp - timestamp) >= 0;
      });
      rangeEntries = sourceEntries.length ? sourceEntries : validEntries;
    }

    if (!rangeEntries.length) return [];

    if (currentChartRange === "day") {
      return rangeEntries.slice(0, 24).reverse().map((entry) => {
        const value = Number(entry[metricConfig.valueKey]);
        return {
          label: formatChartLabel(entry.sortDate || entry.updatedAt, "day"),
          value: roundDetailEnvironmentValue(value, metricConfig.decimals),
          min: value,
          max: value,
          count: 1,
        };
      });
    }

    const groupedByDate = new Map();
    rangeEntries.forEach((entry) => {
      const dateKey = getCalendarDateKey(entry.sortDate || entry.updatedAt);
      if (!dateKey) return;
      const value = Number(entry[metricConfig.valueKey]);
      const group = groupedByDate.get(dateKey) || {
        key: dateKey,
        sortDate: entry.sortDate || entry.updatedAt,
        latestEntry: entry,
        values: [],
      };
      group.values.push(value);
      const currentLatestTs = getEntryTimestamp(group.latestEntry) || 0;
      const entryTs = getEntryTimestamp(entry) || 0;
      if (entryTs > currentLatestTs) {
        group.latestEntry = entry;
        group.sortDate = entry.sortDate || entry.updatedAt;
      }
      groupedByDate.set(dateKey, group);
    });

    const limit = currentChartRange === "month" ? (useLoadedRange ? 31 : 30) : 7;
    return Array.from(groupedByDate.values())
      .sort((left, right) => new Date(right.sortDate).getTime() - new Date(left.sortDate).getTime())
      .slice(0, limit)
      .map((group) => {
        const average = group.values.reduce((sum, value) => sum + value, 0) / group.values.length;
        return {
          label: formatChartLabel(group.sortDate || group.latestEntry.updatedAt, currentChartRange),
          value: roundDetailEnvironmentValue(average, metricConfig.decimals),
          min: Math.min(...group.values),
          max: Math.max(...group.values),
          count: group.values.length,
        };
      })
      .reverse();
  }

  function getDetailEnvironmentYAxisBounds(values, metricKey) {
    const finiteValues = values.filter(isFiniteDetailNumber).map(Number);
    if (metricKey === "ph") finiteValues.push(DETAIL_PH_NEUTRAL);

    if (!finiteValues.length) {
      return metricKey === "ph" ? { min: 0, max: 14 } : { min: 0, max: 100 };
    }

    const minValue = Math.min(...finiteValues);
    const maxValue = Math.max(...finiteValues);
    const padding = metricKey === "ph"
      ? Math.max(0.2, (maxValue - minValue || 1) * 0.2)
      : Math.max(5, (maxValue - minValue || 20) * 0.15);

    if (metricKey === "ph") {
      return {
        min: Math.max(0, Math.floor((minValue - padding) * 10) / 10),
        max: Math.min(14, Math.ceil((maxValue + padding) * 10) / 10),
      };
    }

    return {
      min: Math.max(0, Math.floor((minValue - padding) / 10) * 10),
      max: Math.ceil((maxValue + padding) / 10) * 10,
    };
  }

  const detailPhReferencePlugin = {
    id: "detailPhReferencePlugin",
    afterDraw(chart) {
      const y = chart.scales.y?.getPixelForValue(DETAIL_PH_NEUTRAL);
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
      ctx.fillText("pH 7", chartArea.left + 8, Math.max(chartArea.top + 14, y - 8));
      ctx.restore();
    },
  };

  function getDetailChartOptions(pointCount) {
    const isMobile = window.innerWidth < 768;
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: window.AppChartAnimation?.getEntranceAnimation?.() ?? false,
      interaction: {
        mode: "nearest",
        intersect: false,
      },
      elements: {
        line: {
          tension: 0.32,
          borderWidth: 3,
        },
        point: {
          radius: 3,
          hoverRadius: 7,
          hitRadius: 18,
          pointStyle: "rectRounded",
        },
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          displayColors: true,
          usePointStyle: true,
          backgroundColor: "#2f2f35",
          titleColor: "#ffffff",
          bodyColor: "#ffffff",
          borderColor: "rgba(255,255,255,0.08)",
          borderWidth: 1,
          padding: 12,
          cornerRadius: 10,
          caretSize: 6,
          boxPadding: 4,
          titleFont: {
            family: "Poppins, sans-serif",
            size: 12,
            weight: "700",
          },
          bodyFont: {
            family: "Poppins, sans-serif",
            size: 12,
            weight: "600",
          },
          callbacks: {
            title(items) {
              return items[0]?.label || "";
            },
            label(context) {
              return `Test: ${Math.round(context.parsed.y)} mV`;
            },
          },
        },
      },
      scales: {
        y: {
          grid: {
            color: "#eef2f7",
          },
          ticks: {
            color: "#9ca3af",
            font: {
              size: isMobile ? 9 : 12,
            },
          },
        },
        x: {
          grid: {
            color: "#f1f5f9",
          },
          ticks: {
            color: "#9ca3af",
            font: {
              size: isMobile ? 9 : 12,
            },
            maxTicksLimit: currentChartRange === "day" ? (isMobile ? 6 : 8) : pointCount,
            autoSkip: currentChartRange === "day",
            maxRotation: 0,
            minRotation: 0,
          },
        },
      },
    };
  }

  function getDetailEnvironmentChartOptions(pointCount, metricKey, metricConfig, values) {
    const isMobile = window.innerWidth < 768;
    const yBounds = getDetailEnvironmentYAxisBounds(values, metricKey);

    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: window.AppChartAnimation?.getEntranceAnimation?.() ?? false,
      interaction: {
        mode: "nearest",
        intersect: false,
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          displayColors: true,
          usePointStyle: true,
          backgroundColor: "#2f2f35",
          titleColor: "#ffffff",
          bodyColor: "#ffffff",
          borderColor: "rgba(255,255,255,0.08)",
          borderWidth: 1,
          padding: 12,
          cornerRadius: 10,
          caretSize: 6,
          boxPadding: 4,
          callbacks: {
            label(context) {
              const meta = context.dataset.environmentMeta?.[context.dataIndex];
              const value = context.parsed.y;
              const suffix = meta?.count > 1
                ? ` (${meta.count} samples, ${roundDetailEnvironmentValue(meta.min, metricConfig.decimals)} to ${roundDetailEnvironmentValue(meta.max, metricConfig.decimals)} ${metricConfig.unit})`
                : "";
              return `${metricConfig.label}: ${value} ${metricConfig.unit}${suffix}`;
            },
          },
        },
      },
      scales: {
        y: {
          min: yBounds.min,
          max: yBounds.max,
          grid: {
            color: "#eef2f7",
          },
          ticks: {
            color: "#9ca3af",
            font: {
              size: isMobile ? 9 : 12,
            },
          },
        },
        x: {
          grid: {
            color: "#f1f5f9",
          },
          ticks: {
            color: "#9ca3af",
            font: {
              size: isMobile ? 9 : 12,
            },
            maxTicksLimit: currentChartRange === "day" ? (isMobile ? 6 : 8) : pointCount,
            autoSkip: currentChartRange === "day",
            maxRotation: 0,
            minRotation: 0,
          },
        },
      },
    };
  }

  function destroyDetailEnvironmentCharts() {
    detailEnvironmentRequestToken += 1;
    Object.values(currentDetailEnvironmentCharts).forEach((chart) => chart?.destroy());
    Object.keys(currentDetailEnvironmentCharts).forEach((key) => {
      currentDetailEnvironmentCharts[key] = null;
    });
  }

  function resizeDetailEnvironmentCharts() {
    Object.values(currentDetailEnvironmentCharts).forEach((chart) => {
      chart?.resize();
      chart?.update();
    });
  }

  function renderDetailEnvironmentChart(metricKey, entries, options = {}) {
    const metricConfig = DETAIL_ENVIRONMENT_METRICS[metricKey];
    const chartContainer = document.getElementById(metricConfig.chartId);
    if (!chartContainer) return 0;

    currentDetailEnvironmentCharts[metricKey]?.destroy();
    currentDetailEnvironmentCharts[metricKey] = null;

    const points = getDetailEnvironmentPoints(entries, metricConfig, options);
    const values = points.map((point) => point.value);

    if (!values.length) {
      chartContainer.innerHTML = '<div class="chart-empty detail-environment-chart-empty">No trend data available yet.</div>';
      return 0;
    }

    chartContainer.innerHTML = `<canvas id="${metricConfig.chartId}Canvas" aria-label="${escapeHtml(metricConfig.label)} trend chart"></canvas>`;
    const chartCanvas = document.getElementById(`${metricConfig.chartId}Canvas`);
    if (!chartCanvas || !window.Chart) return points.length;

    window.Chart.defaults.font.family = "Poppins, sans-serif";

    currentDetailEnvironmentCharts[metricKey] = new Chart(chartCanvas, {
      type: "line",
      data: {
        labels: points.map((point) => point.label),
        datasets: [{
          label: metricConfig.label,
          data: values,
          borderColor: metricConfig.color,
          backgroundColor: metricConfig.color,
          pointBackgroundColor: metricConfig.color,
          pointBorderColor: metricConfig.color,
          pointHoverBackgroundColor: metricConfig.color,
          pointHoverBorderColor: metricConfig.color,
          spanGaps: true,
          showLine: true,
          borderWidth: 2.4,
          tension: 0.28,
          fill: false,
          environmentMeta: points,
        }],
      },
      options: getDetailEnvironmentChartOptions(points.length, metricKey, metricConfig, values),
      plugins: metricKey === "ph" ? [detailPhReferencePlugin] : [],
    });

    requestAnimationFrame(() => {
      currentDetailEnvironmentCharts[metricKey]?.resize();
      currentDetailEnvironmentCharts[metricKey]?.update();
    });

    return points.length;
  }

  function renderDetailEnvironmentCharts(entries, options = {}) {
    const meta = document.getElementById("detailEnvironmentChartMeta");
    const conductivityCount = renderDetailEnvironmentChart("conductivity", entries, options);
    const phCount = renderDetailEnvironmentChart("ph", entries, options);
    const sampleCount = Math.max(conductivityCount, phCount);

    if (meta) {
      meta.textContent = sampleCount
        ? `${sampleCount} environmental trend point${sampleCount === 1 ? "" : "s"} over the ${getDetailEnvironmentRangeLabel()}`
        : "Latest environmental readings";
    }
  }

  function renderDetailEnvironmentLoading() {
    const meta = document.getElementById("detailEnvironmentChartMeta");
    if (meta) meta.textContent = `Loading environmental trends for the ${getDetailEnvironmentRangeLabel()}...`;

    Object.entries(DETAIL_ENVIRONMENT_METRICS).forEach(([metricKey, metricConfig]) => {
      currentDetailEnvironmentCharts[metricKey]?.destroy();
      currentDetailEnvironmentCharts[metricKey] = null;
      const chartContainer = document.getElementById(metricConfig.chartId);
      if (chartContainer) {
        chartContainer.innerHTML = '<div class="chart-empty detail-environment-chart-empty">Loading trend data...</div>';
      }
    });
  }

  async function renderDetailEnvironmentForCurrentPeriod(entries) {
    const periodWindow = getDetailEnvironmentPeriodWindow();
    if (!periodWindow || !currentChartTestPoint?.id) {
      renderEnvironmentGrid(getLatestEnvironmentEntry(entries) || currentDetailLatestEntry);
      renderDetailEnvironmentCharts(entries);
      return;
    }

    const requestToken = ++detailEnvironmentRequestToken;
    renderDetailEnvironmentLoading();

    try {
      const periodEntries = await fetchRepositoryPointReadings(currentChartTestPoint.id, {
        from: periodWindow.from,
        to: periodWindow.to,
        limit: DETAIL_ENVIRONMENT_PERIOD_LIMIT,
        offset: 0,
      });
      if (requestToken !== detailEnvironmentRequestToken) return;
      renderEnvironmentGrid(getLatestEnvironmentEntry(periodEntries));
      renderDetailEnvironmentCharts(periodEntries, { useLoadedRange: true });
    } catch (error) {
      if (requestToken !== detailEnvironmentRequestToken) return;
      console.warn("Unable to load environmental readings for selected reporting period:", error.message || error);
      renderEnvironmentGrid(getLatestEnvironmentEntry(entries) || currentDetailLatestEntry);
      renderDetailEnvironmentCharts(entries);
    }
  }

  function addDetailIsoDays(isoDate, days) {
    const [year, month, day] = String(isoDate || "").split("-").map(Number);
    if (![year, month, day].every(Number.isFinite)) return "";
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
  }

  function formatDetailChartDateLabel(isoDate) {
    const date = new Date(`${isoDate}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return String(isoDate || "");
    return date.toLocaleDateString("en-SG", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  }

  function buildDetailChartModel(testPoint, entries) {
    const thresholdMv = PROTECTED_THRESHOLD_MV;
    const week = currentDetailWeeklyData?.week || "";
    if (currentChartRange === "week") {
      if (currentDetailWeeklyData?.dailyError) {
        return { error: true, emptyMessage: "Daily trend could not be loaded. Weekly summary metrics remain available." };
      }
      let model = window.WeeklyDailyTrend?.buildOverallDailyTrend?.({
        weekStart: week,
        dailySummaries: currentDetailWeeklyData?.daily || [],
        visibleTestPointIds: new Set([testPoint.id]),
        thresholdMv,
      });
      if (!model?.hasData && entries?.length) {
        model = window.WeeklyDailyTrend?.buildDailyTrendFromReadings?.({
          weekStart: week,
          readings: entries,
          thresholdMv,
          timezone: "Asia/Singapore",
        }) || model;
      }
      if (!model?.hasData) {
        return { emptyMessage: "No daily readings are available for the selected week." };
      }
      const dailyByDate = new Map((currentDetailWeeklyData?.daily || []).map((row) => [row.readingDate, row]));
      if (!dailyByDate.size && entries?.length) {
        model.dates.forEach((date) => {
          const matchingEntries = entries.filter((entry) => getCalendarDateKey(entry.sortDate || entry.updatedAt) === date);
          if (!matchingEntries.length) return;
          dailyByDate.set(date, {
            readingDate: date,
            readingCount: matchingEntries.length,
          });
        });
      }
      return {
        labels: model.dates.map(formatDetailChartDateLabel),
        values: model.values,
        meta: model.dates.map((date) => dailyByDate.get(date) || null),
        thresholdMv,
        yAxis: model.yAxis,
        periodLabel: `${formatDetailWeekDate(week)} – ${formatDetailWeekDate(addDetailIsoDays(week, 6))}`,
        summary: `${model.reportedDayCount} of 7 days contain readings; missing days remain gaps.`,
      };
    }

    const validEntries = (entries || []).filter((entry) => parseNumericValue(entry.latestReading) !== null && getCalendarDateKey(entry.sortDate || entry.updatedAt));
    const weekEnd = addDetailIsoDays(week, 6);
    if (currentChartRange === "day") {
      const selectedWeekEntries = validEntries.filter((entry) => {
        const dateKey = getCalendarDateKey(entry.sortDate || entry.updatedAt);
        return !week || (dateKey >= week && dateKey <= weekEnd);
      });
      const latestDay = selectedWeekEntries.map((entry) => getCalendarDateKey(entry.sortDate || entry.updatedAt)).sort().at(-1);
      const dayEntries = selectedWeekEntries.filter((entry) => getCalendarDateKey(entry.sortDate || entry.updatedAt) === latestDay)
        .sort((left, right) => (getEntryTimestamp(left) || 0) - (getEntryTimestamp(right) || 0));
      if (!dayEntries.length) return { emptyMessage: "No individual readings are available for a day in the selected week." };
      const values = dayEntries.map((entry) => parseNumericValue(entry.latestReading));
      return {
        labels: dayEntries.map((entry) => formatChartLabel(entry.sortDate || entry.updatedAt, "day")),
        values,
        meta: dayEntries,
        thresholdMv,
        yAxis: window.WeeklyDailyTrend?.calculateYAxisBounds?.(values, thresholdMv) || getDetailChartYAxisBounds(values, thresholdMv),
        periodLabel: formatDetailWeekDate(latestDay),
        summary: `${dayEntries.length} individual reading${dayEntries.length === 1 ? "" : "s"} on ${formatDetailWeekDate(latestDay)}.`,
      };
    }

    const monthKey = String(week || getCalendarDateKey(validEntries[0]?.sortDate || validEntries[0]?.updatedAt)).slice(0, 7);
    const monthEntries = validEntries.filter((entry) => getCalendarDateKey(entry.sortDate || entry.updatedAt).startsWith(monthKey));
    const groups = new Map();
    monthEntries.forEach((entry) => {
      const dateKey = getCalendarDateKey(entry.sortDate || entry.updatedAt);
      if (!groups.has(dateKey)) groups.set(dateKey, []);
      groups.get(dateKey).push(entry);
    }, { signal: testPointViewAbortController.signal });
    const dates = [...groups.keys()].sort();
    if (!dates.length) return { emptyMessage: "No daily readings are available for the selected month." };
    const values = dates.map((date) => {
      const numbers = groups.get(date).map((entry) => parseNumericValue(entry.latestReading)).filter((value) => value !== null);
      return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
    });
    return {
      labels: dates.map((date) => new Date(`${date}T00:00:00+08:00`).toLocaleDateString("en-SG", { day: "numeric", month: "short" })),
      values,
      meta: dates.map((date) => ({ readingDate: date, readingCount: groups.get(date).length })),
      thresholdMv,
      yAxis: window.WeeklyDailyTrend?.calculateYAxisBounds?.(values, thresholdMv) || getDetailChartYAxisBounds(values, thresholdMv),
      periodLabel: new Date(`${monthKey}-01T00:00:00+08:00`).toLocaleDateString("en-SG", { month: "long", year: "numeric" }),
      summary: `${dates.length} daily average${dates.length === 1 ? "" : "s"} in the selected month.`,
    };
  }

  function renderHistoryChart(testPoint, entries) {
    const chartContainer = document.getElementById("detailHistoryChart");
    const subtitle = document.getElementById("detailChartSubtitle");
    const summary = document.getElementById("detailHistoryChartSummary");
    if (!chartContainer) return;

    currentChartTestPoint = testPoint;
    currentChartEntries = entries.slice();
    updateChartRangePills();

    const chartEntries = getChartEntriesForRange(entries, currentChartRange);
    const labels = chartEntries.map((entry) =>
      entry.chartLabel || formatChartLabel(entry.sortDate || entry.updatedAt, currentChartRange)
    );
    const chartValues = chartEntries.map((entry) => parseNumericValue(entry.latestReading));
    const plottedValues = chartValues.filter((value) => value !== null);
    renderDetailEnvironmentForCurrentPeriod(entries);

    if (subtitle) {
      const low = plottedValues.length ? Math.min(...plottedValues) : "N/A";
      const high = plottedValues.length ? Math.max(...plottedValues) : "N/A";
      subtitle.textContent =
        currentChartRange === "day"
          ? `${low} / ${high} mV over the last 24 hours`
          : currentChartRange === "month"
            ? `${low} / ${high} mV over the last 30 days`
            : `${low} / ${high} mV over the last 7 days`;
    }

    currentDetailHistoryChart?.destroy();
    currentDetailHistoryChart = null;

    const model = buildDetailChartModel(testPoint, entries);
    const protectionPresentation = window.AppChartProtectionPresentation;
    const thresholdReference = protectionPresentation?.resolveThresholdReference?.([
      model.thresholdMv ?? testPoint?.thresholdMv ?? PROTECTED_THRESHOLD_MV,
    ]) || {
      thresholdMv: Number(model.thresholdMv ?? testPoint?.thresholdMv) || PROTECTED_THRESHOLD_MV,
      definitive: true,
      source: "shared",
    };
    const zoneLabels = protectionPresentation?.getZoneLabels?.(thresholdReference);
    protectionPresentation?.renderLegend?.(
      document.getElementById("detailChartZoneLegend"),
      thresholdReference,
    );
    if (model.emptyMessage) {
      chartContainer.innerHTML = `<div class="chart-empty ${model.error ? "chart-error" : ""}" role="status">${escapeHtml(model.emptyMessage)}</div>`;
      if (subtitle) subtitle.textContent = currentChartRange === "week" ? "Selected-week daily averages" : `Selected ${currentChartRange} readings`;
      if (summary) summary.textContent = model.emptyMessage;
      return;
    }
    if (!window.Chart) {
      console.error("Protection Potential Trend could not be rendered because Chart.js is unavailable.");
      chartContainer.innerHTML = '<div class="chart-empty chart-error" role="status">The chart library could not be loaded.</div>';
      if (summary) summary.textContent = "The chart library could not be loaded.";
      return;
    }

    if (subtitle) subtitle.textContent = `${model.periodLabel} · ${model.summary}`;
    if (summary) {
      summary.textContent = `${model.summary} ${zoneLabels
        ? `${zoneLabels.protected}. ${zoneLabels.above}.`
        : `Protection threshold: ${Math.round(model.thresholdMv)} mV.`}`;
    }
    chartContainer.innerHTML = '<canvas id="detailHistoryChartCanvas" aria-label="Protection potential trend" aria-describedby="detailHistoryChartSummary"></canvas>';
    const canvas = document.getElementById("detailHistoryChartCanvas");
    const pointRadius = model.values.filter((value) => value !== null).length === 1 ? 6 : 4;
    const options = getDetailChartOptions(model.labels.length);
    options.scales.y.min = model.yAxis.min;
    options.scales.y.max = model.yAxis.max;
    options.scales.y.title = { display: true, text: "mV" };
    options.plugins.tooltip.callbacks.label = (context) => {
      const value = context.parsed.y;
      const row = model.meta[context.dataIndex];
      const count = Number(row?.readingCount || 0);
      const status = window.AppStatus?.deriveProtectionStatus?.(value, model.thresholdMv)?.displayStatus;
      return [
        `Reading: ${Math.round(value)} mV`,
        status ? `Protection status: ${status}` : "",
        count ? `${count} source reading${count === 1 ? "" : "s"}` : "",
      ].filter(Boolean);
    };

    try {
      const chartConfig = {
        type: "line",
        data: {
          labels: model.labels,
          datasets: [{
            label: testPoint?.label || "Test Point",
            data: model.values,
            ...(protectionPresentation?.createSinglePointDatasetStyle?.(model.thresholdMv) || {
              borderColor: "#315f88",
              backgroundColor: "rgba(0,0,0,0)",
              fill: false,
              spanGaps: false,
            }),
            pointBorderWidth: 2,
            pointRadius,
            pointHoverRadius: pointRadius + 2,
            showLine: true,
            borderWidth: 3,
            tension: 0.25,
          }],
        },
        options,
      };
      protectionPresentation?.applyToChartConfig?.(chartConfig, thresholdReference);
      currentDetailHistoryChart = new window.Chart(canvas, chartConfig);
    } catch (error) {
      currentDetailHistoryChart = null;
      console.error("Protection Potential Trend chart creation failed:", error);
      chartContainer.innerHTML = '<div class="chart-empty chart-error" role="status">The chart library could not be loaded.</div>';
      if (summary) summary.textContent = "The chart library could not be loaded.";
    }
  }

  function handleDetailWeeklyDataChanged(data) {
    currentDetailWeeklyData = data || null;
    if (!currentDetailTestPoint) return;
    renderHero(currentDetailTestPoint, currentDetailLatestEntry, currentDetailWeeklyData);
    detailWeeklyView?.renderWeekSelector?.();
    renderHistoryChart(currentDetailTestPoint, currentChartEntries);
  }

  async function renderDetails() {
    ensureSharedLayoutVisible();

    const selectedId = getSelectedId();
    if (!selectedId) {
      renderNotFound();
      return;
    }

    try {
      const sessionUser = await ensureActiveUser();
      currentUserId = sessionUser?.id || null;
      currentUserIsAdmin = String(localStorage.getItem("userRole") || "").trim() === "admin";

      const testPoint = await fetchTestPoint(selectedId);
      currentDetailTestPoint = testPoint;
      currentDetailPointId = testPoint.id;
      currentDetailWeeklyData = null;
      const cachedPoint = loadCachedTestPoint(testPoint.id, testPoint.label);

      document.getElementById("detailPageTitle").textContent =
        testPoint.label || "Test Point Details";

      document.getElementById(
        "detailBreadcrumb"
      ).textContent = `Test Points / ${testPoint.label}`;

      renderHero(testPoint, null, currentDetailWeeklyData);
      renderNotesCard(testPoint);
      renderEnvironmentGrid(null);
      currentEquipmentVersions = [];
      renderEquipmentTracking(testPoint, []);
      renderHistoryTable([], testPoint);
      bindChartRangePills();
      renderHistoryChart(testPoint, []);
      detailWeeklyView?.load(testPoint);
      detailLocationView?.render(testPoint);

      let pointReadingEntries = [];
      let historyEntries = [];
      let chartEntries = [];
      let fallbackLatestEntry = null;
      let equipmentLoadError = null;
      currentHistoryPage = 1;
      currentAllHistoryEntries = [];

      try {
        currentEquipmentVersions = await fetchEquipmentVersions(testPoint.id);
      } catch (equipmentError) {
        console.warn("Unable to load equipment history:", equipmentError.message || equipmentError);
        currentEquipmentVersions = [];
        equipmentLoadError = equipmentError;
      }

      try {
        historyEntries = await fetchHistoryWindow(testPoint.id, testPoint.locationId, 0, DETAIL_HISTORY_LIMIT - 1);
        pointReadingEntries = historyEntries;
      } catch (historyError) {
        console.warn(
          "Unable to load recent 1000 reading history:",
          historyError.message || historyError
        );
      }

      if (!pointReadingEntries.length) {
        try {
          pointReadingEntries = await fetchPointReadingEntries(testPoint.id, testPoint.locationId, DETAIL_HISTORY_LIMIT);
          if (pointReadingEntries.length) {
            historyEntries = pointReadingEntries;
          }
        } catch (pointHistoryError) {
          console.warn(
            "Unable to load point reading entries fallback:",
            pointHistoryError.message || pointHistoryError
          );
        }
      }

      try {
        chartEntries = await fetchPointReadingEntries(
          testPoint.id,
          testPoint.locationId,
          DETAIL_CHART_SOURCE_LIMIT
        );
      } catch (chartError) {
        console.warn(
          "Unable to load extended chart history:",
          chartError.message || chartError
        );
      }

      if (!pointReadingEntries.length) {
        try {
          fallbackLatestEntry = await fetchLatestReadingForPoint(testPoint.id, testPoint.locationId);

          if (fallbackLatestEntry) {
            pointReadingEntries = [fallbackLatestEntry];
            historyEntries = [fallbackLatestEntry];
          }
        } catch (fallbackError) {
          console.warn(
            "Unable to load fallback latest point reading:",
            fallbackError.message || fallbackError
          );
        }
      }

      if (!pointReadingEntries.length) {
        const cachedLatestEntry = createCachedLatestEntry(cachedPoint, testPoint);
        if (cachedLatestEntry) {
          pointReadingEntries = [cachedLatestEntry];
          historyEntries = [cachedLatestEntry];
        }
      }

      await resolveRecordedByLabels([historyEntries, pointReadingEntries, chartEntries]);

      const latestEntry = historyEntries[0] || pointReadingEntries[0] || fallbackLatestEntry || null;
      currentDetailLatestEntry = latestEntry;
      const currentPointModel = currentDetailTestPoint?.id === testPoint.id ? currentDetailTestPoint : testPoint;
      const locationPoint = {
        ...currentPointModel,
        latestReading: parseNumericValue(latestEntry?.latestReading),
        displayStatus: latestEntry?.status || normalizePointStatus(currentPointModel.status) || "Unknown",
      };
      currentDetailTestPoint = locationPoint;
      detailLocationView?.render(locationPoint);

      const summaryEntries = historyEntries.length ? historyEntries : pointReadingEntries;
      const chartSourceEntries = chartEntries.length ? chartEntries : summaryEntries;
      currentAllHistoryEntries = summaryEntries.slice();

      renderHero(testPoint, latestEntry, currentDetailWeeklyData, summaryEntries);
      detailWeeklyView?.renderWeekSelector?.();
      renderNotesCard(testPoint);
      renderEnvironmentGrid(getLatestEnvironmentEntry(summaryEntries) || latestEntry);
      renderEquipmentTracking(testPoint, currentEquipmentVersions, equipmentLoadError);
      populateDetailHistoryFilters();
      renderHistoryTable(getFilteredHistoryEntries(), testPoint);
      bindChartRangePills();
      renderHistoryChart(testPoint, chartSourceEntries);
    } catch (error) {
      console.error("Failed to render test point view:", error);
      renderNotFound(error.message || "Unable to load this test point.");
    }
  }

  function initTestPointViewPage() {
    detailHistorySortController?.destroy();
    detailHistorySortController = null;
    detailWeeklyView?.destroy();
    detailLocationView?.destroy();
    detailPositionController?.destroy();
    detailChartResizeObserver?.disconnect?.();
    detailChartResizeObserver = null;
    window.clearTimeout(detailChartRefreshTimer);
    window.clearTimeout(detailChartRetryTimer);
    testPointViewAbortController?.abort();
    testPointViewAbortController = new AbortController();
    document.getElementById("detailChartRangePills")?.removeAttribute("data-bound");
    detailAssetMapRepository = window.AssetMapRepository ? new window.AssetMapRepository() : null;
    detailWeeklyView = window.TestPointWeeklyView && window.AppRepositories?.WeeklySummaryRepository
      ? new window.TestPointWeeklyView({
        repository: new window.AppRepositories.WeeklySummaryRepository(),
        onDataChanged: handleDetailWeeklyDataChanged,
      })
      : null;
    detailPositionController = detailAssetMapRepository && window.TestPointPositionController
      ? new window.TestPointPositionController({
        repository: detailAssetMapRepository,
        getUserRole: getDetailUserRole,
        onSaved: refreshDetailPosition,
      })
      : null;
    detailLocationView = window.TestPointLocationView
      ? new window.TestPointLocationView({
        onPositionRequested: (point, trigger) => detailPositionController?.open(toDetailPositionControllerPoint(point), { trigger }).catch((error) => {
          console.error("Unable to open Test Point position:", error);
          window.AppToast?.error?.(error?.message || "Unable to open the Test Point position.");
        }),
      })
      : null;
    detailHistorySearch = "";
    currentAllHistoryEntries = [];
    detailHistoryRowsPerPage = getDetailHistoryDefaultPageSize();
    detailHistoryFilters.status = "";
    detailHistoryFilters.source = "";
    detailHistoryFilters.recordedBy = "";
    detailHistorySortKey = "sortDate";
    detailHistorySortDirection = "desc";
    currentEquipmentVersions = [];
    bindDetailChartResizeObserver();
    detailHistorySortController = createDetailHistorySortController();
    configureDetailReturnNavigation();
    let detailHistorySearchTimer;
    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-detail-add-reading]")) openAddReadingModal();
      if (event.target.closest("[data-detail-import-readings]")) openDetailReadingsImportModal();

      const pageButton = event.target.closest("[data-detail-history-page]");
      if (pageButton) setDetailHistoryPage(Number(pageButton.dataset.detailHistoryPage));

      const filterChip = event.target.closest("[data-detail-history-remove-filter]");
      if (filterChip) {
        const key = filterChip.dataset.detailHistoryRemoveFilter;
        if (key && Object.prototype.hasOwnProperty.call(detailHistoryFilters, key)) {
          detailHistoryFilters[key] = "";
          const filterInput = document.getElementById(`detailHistory${key.charAt(0).toUpperCase()}${key.slice(1)}Filter`);
          if (filterInput) filterInput.value = "";
          currentHistoryPage = 1;
          renderHistoryTable(getFilteredHistoryEntries());
        }
      }

      const editButton = event.target.closest("[data-detail-edit-reading]");
      if (editButton) openEditReadingModal(editButton.dataset.detailEditReading);

      const deleteButton = event.target.closest("[data-detail-delete-reading]");
      if (deleteButton) deleteReadingEntry(deleteButton.dataset.detailDeleteReading, deleteButton);
    }, { signal: testPointViewAbortController.signal });
    document.getElementById("detailHistorySearchInput")?.addEventListener("input", (event) => {
      clearTimeout(detailHistorySearchTimer);
      detailHistorySearchTimer = setTimeout(() => {
        handleDetailHistorySearch(event.target.value);
      }, 275);
    }, { signal: testPointViewAbortController.signal });
    document.getElementById("detailHistorySearchClear")?.addEventListener("click", () => {
      handleDetailHistorySearch("");
    }, { signal: testPointViewAbortController.signal });
    document.getElementById("detailHistoryFiltersButton")?.addEventListener("click", () => {
      const panel = document.getElementById("detailHistoryAdvancedFilters");
      if (!panel) return;
      panel.hidden = !panel.hidden;
      document.getElementById("detailHistoryFiltersButton")?.setAttribute("aria-expanded", String(!panel.hidden));
    }, { signal: testPointViewAbortController.signal });
    document.getElementById("detailHistoryReset")?.addEventListener("click", resetDetailHistoryFilters, { signal: testPointViewAbortController.signal });
    document.getElementById("detailHistoryRowsPerPage")?.addEventListener("change", (event) => {
      detailHistoryRowsPerPage = Number(event.target.value) || getDetailHistoryDefaultPageSize();
      currentHistoryPage = 1;
      renderHistoryTable(getFilteredHistoryEntries());
    }, { signal: testPointViewAbortController.signal });
    [
      ["detailHistoryStatusFilter", "status"],
      ["detailHistorySourceFilter", "source"],
      ["detailHistoryRecordedByFilter", "recordedBy"],
    ].forEach(([id, key]) => {
      document.getElementById(id)?.addEventListener("change", (event) => {
        detailHistoryFilters[key] = String(event.target.value || "");
        currentHistoryPage = 1;
        renderHistoryTable(getFilteredHistoryEntries());
      }, { signal: testPointViewAbortController.signal });
    });
    document.getElementById("closeImportDetailReadingsModalButton")?.addEventListener("click", closeDetailReadingsImportModal, { signal: testPointViewAbortController.signal });
    document.getElementById("downloadDetailReadingsTemplateButton")?.addEventListener("click", downloadDetailReadingsTemplate, { signal: testPointViewAbortController.signal });
    document.getElementById("submitDetailReadingsImportButton")?.addEventListener("click", importDetailReadingsFromExcel, { signal: testPointViewAbortController.signal });
    document.getElementById("openEquipmentChangeModalButton")?.addEventListener("click", openEquipmentChangeModal, { signal: testPointViewAbortController.signal });
    document.getElementById("closeEquipmentChangeModalButton")?.addEventListener("click", closeEquipmentChangeModal, { signal: testPointViewAbortController.signal });
    document.getElementById("cancelEquipmentChangeButton")?.addEventListener("click", closeEquipmentChangeModal, { signal: testPointViewAbortController.signal });
    document.getElementById("submitEquipmentChangeButton")?.addEventListener("click", submitEquipmentChange, { signal: testPointViewAbortController.signal });
    document.getElementById("closeAddReadingModalButton")?.addEventListener("click", closeAddReadingModal, { signal: testPointViewAbortController.signal });
    document.getElementById("saveReadingModalButton")?.addEventListener("click", saveReadingModal, { signal: testPointViewAbortController.signal });
    window.addEventListener("resize", () => scheduleDetailChartRefresh(120), { signal: testPointViewAbortController.signal });
    renderDetails();
  }

  function destroyTestPointViewPage() {
    testPointViewAbortController?.abort();
    testPointViewAbortController = null;
    detailChartResizeObserver?.disconnect?.();
    detailChartResizeObserver = null;
    window.clearTimeout(detailChartRefreshTimer);
    window.clearTimeout(detailChartRetryTimer);
    detailChartRefreshTimer = null;
    detailChartRetryTimer = null;
    detailHistorySortController?.destroy();
    detailHistorySortController = null;
    currentDetailHistoryChart?.destroy();
    currentDetailHistoryChart = null;
    destroyDetailEnvironmentCharts();
    detailWeeklyView?.destroy();
    detailWeeklyView = null;
    detailLocationView?.destroy();
    detailLocationView = null;
    detailPositionController?.destroy();
    detailPositionController = null;
    detailAssetMapRepository = null;
    currentDetailPointId = null;
    currentAllHistoryEntries = [];
    currentHistoryEntries = [];
    detailHistorySearch = "";
    currentEquipmentVersions = [];
    currentDetailTestPoint = null;
    currentDetailLatestEntry = null;
    currentDetailWeeklyData = null;
    currentReadingModalTarget = null;
    currentUserId = null;
    currentUserIsAdmin = false;
  }

  function createDetailHistorySortController() {
    const root = document.getElementById("detailHistoryDataTable");
    if (!root || !window.TableSortController) return null;
    return new window.TableSortController({
      root,
      initialKey: detailHistorySortKey,
      initialDirection: detailHistorySortDirection,
      onSortChanged: ({ key, direction }) => {
        detailHistorySortKey = key;
        detailHistorySortDirection = direction;
        currentHistoryPage = 1;
        renderHistoryTable(getFilteredHistoryEntries(), currentDetailTestPoint);
      },
    });

  }

  window.TestPointViewPage = { init: initTestPointViewPage, destroy: destroyTestPointViewPage };

  document.addEventListener("DOMContentLoaded", () => {
    const page = window.getCurrentPageName?.() || location.pathname.split("/").pop();
    if (page === "testpoint-view.php") initTestPointViewPage();
  });
})();
