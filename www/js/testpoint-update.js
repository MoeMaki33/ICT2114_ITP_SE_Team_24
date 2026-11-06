const TEST_POINTS_TABLE = "test_points";
const LOCATIONS_TABLE = "locations";
const READING_BATCHES_TABLE = "reading_batches";
const TEST_POINT_READINGS_TABLE = "test_point_readings";
const PROTECTED_THRESHOLD_MV = window.AppStatus.DEFAULT_PROTECTION_THRESHOLD_MV;

let currentTestPoint = null;
let currentEditingReading = null;
let testPointUpdateAbortController = null;

function hasSupabaseReady() {
  return Boolean(window.appSupabase && window.isSupabaseConfigured && window.isSupabaseConfigured());
}

function getSelectedId() {
  return normalizeUuid(new URLSearchParams(location.search).get("id"));
}

function getSelectedReadingId() {
  return normalizeUuid(new URLSearchParams(location.search).get("reading"));
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

function normalizeUuid(value) {
  const normalizedValue = String(value || "").trim();
  return looksLikeUuid(normalizedValue) ? normalizedValue : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setInputValue(id, value) {
  const input = document.getElementById(id);
  if (input) input.value = value || "";
}

function parseOptionalNumber(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const numericValue = Number(trimmed.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numericValue) ? numericValue : null;
}

async function fetchTestPointRow(pointId) {
  const { data, error } = await window.appSupabase
    .from(TEST_POINTS_TABLE)
    .select("id, location_id, label, type, threshold_mv, status, is_active, created_at")
    .eq("id", pointId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

function formatDateInputValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function parseDateInputValue(value) {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return null;
  return parsedDate.toISOString();
}

function formatExistingTimestamp(value) {
  if (!value) return formatDateInputValue();
  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? formatDateInputValue() : formatDateInputValue(parsedDate);
}

function makeReadOnly(id) {
  const input = document.getElementById(id);
  if (!input) return;
  input.readOnly = true;
  input.disabled = false;
}

function goBackToDetails() {
  const selectedId = getSelectedId();
  if (!selectedId) return;
  location.href = `testpoint-view.php?id=${encodeURIComponent(selectedId)}`;
}

function renderNotFound(message = "The selected test point could not be found.") {
  const updatePageTitle = document.getElementById("updatePageTitle");
  const updateCardTitle = document.getElementById("updateCardTitle");
  const updateForm = document.getElementById("updateForm");

  if (updatePageTitle) updatePageTitle.textContent = "Test Point Not Found";
  if (updateCardTitle) updateCardTitle.textContent = "No matching test point";
  if (updateForm) {
    updateForm.innerHTML = `<div class="field-group field-group-full"><label>Message</label><input value="${escapeHtml(message)}" readonly></div>`;
  }
}

async function ensureSessionUser() {
  if (!hasSupabaseReady()) {
    throw new Error("Supabase is not available.");
  }

  const {
    data: { user },
    error,
  } = await window.appSupabase.auth.getUser();

  if (error || !user) {
    throw new Error(error?.message || "No authenticated user found.");
  }

  return user;
}

async function fetchTestPointForUpdate(pointId) {
  const normalizedPointId = normalizeUuid(pointId);
  if (!normalizedPointId) {
    throw new Error("Test point not found.");
  }

  const pointRow = await fetchTestPointRow(normalizedPointId);
  if (!pointRow) {
    throw new Error("Test point not found.");
  }

  let locationRow = null;
  if (pointRow.location_id) {
    const { data, error } = await window.appSupabase
      .from(LOCATIONS_TABLE)
      .select("id, site_name, description")
      .eq("id", pointRow.location_id)
      .maybeSingle();

    if (error) throw error;
    locationRow = data;
  }

  return {
    id: pointRow.id,
    label: pointRow.label,
    type: pointRow.type,
    thresholdMv: PROTECTED_THRESHOLD_MV,
    locationId: pointRow.location_id,
    siteName: locationRow?.site_name || "",
  };
}

// Only "variable" (e.g. impressed-current) systems have a controllable power
// supply to track. "Stationary" (fixed/galvanic) systems have no power input,
// so the Power field is meaningless for them and should stay hidden.
function updatePowerFieldVisibility(testPointType) {
  const powerFieldGroup = document.getElementById("powerFieldGroup");
  if (!powerFieldGroup) return;
  powerFieldGroup.style.display = testPointType === "variable" ? "" : "none";
}

async function fetchLatestPointReading(pointId) {
  const { data: readingRow, error: readingError } = await window.appSupabase
    .from(TEST_POINT_READINGS_TABLE)
    .select("id, batch_id, value_mv, threshold_mv_snapshot, is_protected, created_at")
    .eq("test_point_id", pointId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (readingError) throw readingError;
  if (!readingRow) return null;

  let batchRow = null;
  if (readingRow.batch_id) {
    const { data, error } = await window.appSupabase
      .from(READING_BATCHES_TABLE)
      .select("id, reading_ts, temperature_c, medium_conductivity, ph, dissolved_oxygen, power_watts")
      .eq("id", readingRow.batch_id)
      .maybeSingle();

    if (error) throw error;
    batchRow = data;
  }

  return {
    id: readingRow.id,
    batchId: readingRow.batch_id || null,
    measuredAt: batchRow?.reading_ts || readingRow.created_at,
    latestReading: readingRow.value_mv == null ? "" : String(readingRow.value_mv),
    temperature: batchRow?.temperature_c == null ? "" : String(batchRow.temperature_c),
    mediumConductivity: batchRow?.medium_conductivity == null ? "" : String(batchRow.medium_conductivity),
    ph: batchRow?.ph == null ? "" : String(batchRow.ph),
    dissolvedOxygen: batchRow?.dissolved_oxygen == null ? "" : String(batchRow.dissolved_oxygen),
    power: batchRow?.power_watts == null ? "" : String(batchRow.power_watts),
  };
}

async function fetchReadingForEdit(readingId, pointId) {
  if (!looksLikeUuid(readingId)) {
    throw new Error("Reading not found.");
  }

  const { data: readingRow, error: readingError } = await window.appSupabase
    .from(TEST_POINT_READINGS_TABLE)
    .select("id, batch_id, test_point_id, value_mv, threshold_mv_snapshot, is_protected, created_at")
    .eq("id", readingId)
    .eq("test_point_id", pointId)
    .maybeSingle();

  if (readingError) throw readingError;
  if (!readingRow) throw new Error("Reading not found.");
  if (!readingRow.batch_id) {
    throw new Error("This reading cannot be edited.");
  }

  const { data: batchRow, error: batchError } = await window.appSupabase
    .from(READING_BATCHES_TABLE)
    .select("id, reading_ts, upload_method, temperature_c, medium_conductivity, ph, dissolved_oxygen, power_watts")
    .eq("id", readingRow.batch_id)
    .maybeSingle();

  if (batchError) throw batchError;
  if (!batchRow) throw new Error("Reading batch not found.");
  if (String(batchRow.upload_method || "").trim().toLowerCase() === "bulk") {
    throw new Error("Imported bulk readings cannot be edited here.");
  }

  return {
    id: readingRow.id,
    batchId: readingRow.batch_id,
    measuredAt: batchRow.reading_ts || readingRow.created_at,
    latestReading: readingRow.value_mv == null ? "" : String(readingRow.value_mv),
    temperature: batchRow.temperature_c == null ? "" : String(batchRow.temperature_c),
    mediumConductivity: batchRow.medium_conductivity == null ? "" : String(batchRow.medium_conductivity),
    ph: batchRow.ph == null ? "" : String(batchRow.ph),
    dissolvedOxygen: batchRow.dissolved_oxygen == null ? "" : String(batchRow.dissolved_oxygen),
    power: batchRow.power_watts == null ? "" : String(batchRow.power_watts),
  };
}

async function updateExistingReading(payload) {
  const rpcPayload = {
    p_reading_id: payload.readingId,
    p_batch_id: payload.batchId,
    p_test_point_id: payload.testPointId,
    p_reading_ts: payload.readingTimestamp,
    p_value_mv: Math.round(payload.valueMv),
    p_temperature_c: payload.temperatureC ?? null,
    p_medium_conductivity: payload.conductivity ?? null,
    p_ph: payload.ph ?? null,
    p_dissolved_oxygen: payload.dissolvedOxygen ?? null,
    p_power_watts: payload.powerWatts ?? null,
  };

  const { error: rpcError } = await window.appSupabase.rpc("update_manual_reading", rpcPayload);

  if (!rpcError) {
    return;
  }

  const rpcMessage = String(rpcError.message || rpcError || "");
  const rpcUnavailable =
    rpcMessage.includes("Could not find the function") ||
    rpcMessage.includes("update_manual_reading") ||
    rpcError.code === "PGRST202";

  if (!rpcUnavailable) {
    throw rpcError;
  }

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
    throw new Error("No changes were saved for the reading batch. Apply the latest Supabase migration or check Row Level Security update policies.");
  }

  const isProtected = Math.round(Number(payload.valueMv)) <= PROTECTED_THRESHOLD_MV;
  const { error: readingError, count: readingCount } = await window.appSupabase
    .from(TEST_POINT_READINGS_TABLE)
    .update({
      value_mv: Math.round(payload.valueMv),
      threshold_mv_snapshot: PROTECTED_THRESHOLD_MV,
      is_protected: isProtected,
    }, { count: "exact" })
    .eq("id", payload.readingId)
    .eq("test_point_id", payload.testPointId);

  if (readingError) throw readingError;
  if (!readingCount) {
    throw new Error("No changes were saved for this reading. Apply the latest Supabase migration or check Row Level Security update policies.");
  }
}

async function renderUpdateForm() {
  const selectedId = getSelectedId();
  const selectedReadingId = getSelectedReadingId();

  if (!selectedId) {
    renderNotFound();
    return;
  }

  try {
    await ensureSessionUser();
    currentTestPoint = await fetchTestPointForUpdate(selectedId);
    currentEditingReading = selectedReadingId
      ? await fetchReadingForEdit(selectedReadingId, currentTestPoint.id)
      : null;
    const latestReading = currentEditingReading || await fetchLatestPointReading(currentTestPoint.id);

    document.getElementById("updatePageTitle").textContent = currentEditingReading
      ? `Edit Reading for ${currentTestPoint.label}`
      : `Add Reading for ${currentTestPoint.label}`;
    document.getElementById("updateCardTitle").textContent = currentTestPoint.label;
    document.getElementById("saveUpdatedTestPointButton").textContent = currentEditingReading
      ? "Save Changes"
      : "Save Update";

    setInputValue("detailTestPointName", currentTestPoint.label);
    setInputValue("detailSite", currentTestPoint.siteName);
    setInputValue("detailTime", formatExistingTimestamp(latestReading?.measuredAt));
    setInputValue("detailLatestReading", latestReading?.latestReading || "");
    setInputValue("detailTemperature", latestReading?.temperature || "");
    setInputValue("detailMediumConductivity", latestReading?.mediumConductivity || "");
    setInputValue("detailPh", latestReading?.ph || "");
    setInputValue("detailDissolvedOxygen", latestReading?.dissolvedOxygen || "");
    setInputValue("detailPower", latestReading?.power || "");
    updatePowerFieldVisibility(currentTestPoint.type);

    ["detailTestPointName", "detailSite"].forEach(makeReadOnly);
  } catch (error) {
    renderNotFound(error.message || "Unable to load this test point.");
  }
}

async function saveUpdatedTestPoint() {
  if (!currentTestPoint) {
    window.notifyUser?.("Unable to load this test point.", "error");
    return;
  }

  try {
    await ensureSessionUser();
    const readingTs = parseDateInputValue(document.getElementById("detailTime").value);
    const valueMv = parseOptionalNumber(document.getElementById("detailLatestReading").value);
    const temperature = parseOptionalNumber(document.getElementById("detailTemperature").value);
    const conductivity = parseOptionalNumber(document.getElementById("detailMediumConductivity").value);
    const ph = parseOptionalNumber(document.getElementById("detailPh").value);
    const dissolvedOxygen = parseOptionalNumber(document.getElementById("detailDissolvedOxygen").value);
    // Stationary/fixed systems have no controllable power supply, so never record
    // a power value for them even if one was left over in the (hidden) field.
    const power = currentTestPoint.type === "variable" ? parseOptionalNumber(document.getElementById("detailPower").value) : null;

    if (!readingTs) {
      window.notifyUser?.("Please enter a valid date and time.", "warning");
      return;
    }

    if (valueMv === null) {
      window.notifyUser?.("Please enter a valid latest reading in mV.", "warning");
      return;
    }

    // Layer 2 — warn if a reading already exists within ±30 minutes of the submitted timestamp
    const submittedTime = new Date(readingTs).getTime();
    const windowFrom = new Date(submittedTime - 30 * 60 * 1000).toISOString();
    const windowTo   = new Date(submittedTime + 30 * 60 * 1000).toISOString();
    const { data: recentData, error: recentError } = await window.appSupabase
      .from("v_readings")
      .select("reading_ts, value_mv")
      .eq("test_point_id", currentTestPoint.id)
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
        `A reading of ${recentValue} was already recorded for ${currentTestPoint.label} at ${recentTime} (within 30 minutes).\n\nAdd another reading anyway?`
      );
      if (!confirmed) return;
    }

    if (!window.AppRepositories?.ReadingRepository) {
      throw new Error("Reading repository is not available.");
    }
    if (currentEditingReading?.id && currentEditingReading?.batchId) {
      await updateExistingReading({
        readingId: currentEditingReading.id,
        batchId: currentEditingReading.batchId,
        testPointId: currentTestPoint.id,
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
      await new window.AppRepositories.ReadingRepository().createManualReading({
        testPointId: currentTestPoint.id,
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
    location.assign(`testpoint-view.php?id=${encodeURIComponent(currentTestPoint.id)}`);
  } catch (error) {
    window.notifyUser?.(`Unable to save this reading: ${error.message || error}`, "error");
  }
}

function initTestPointUpdatePage() {
  testPointUpdateAbortController?.abort();
  testPointUpdateAbortController = new AbortController();
  document.getElementById("saveUpdatedTestPointButton")?.addEventListener("click", saveUpdatedTestPoint, { signal: testPointUpdateAbortController.signal });
  document.getElementById("cancelUpdateTestPointButton")?.addEventListener("click", goBackToDetails, { signal: testPointUpdateAbortController.signal });
  renderUpdateForm();
}

function destroyTestPointUpdatePage() {
  testPointUpdateAbortController?.abort();
  testPointUpdateAbortController = null;
  currentEditingReading = null;
}

window.TestPointUpdatePage = { init: initTestPointUpdatePage, destroy: destroyTestPointUpdatePage };

document.addEventListener("DOMContentLoaded", () => {
  const page = window.getCurrentPageName?.() || location.pathname.split("/").pop();
  if (page === "testpoint-update.php") initTestPointUpdatePage();
});
