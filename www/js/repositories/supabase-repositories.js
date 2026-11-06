(function () {
  const TABLES = Object.freeze({
    users: "users",
    locations: "locations",
    testPoints: "test_points",
    readingBatches: "reading_batches",
    readings: "test_point_readings",
    readingView: "v_readings",
    weeklySummaries: "weekly_summaries",
    dashboardLayouts: "dashboard_layouts",
  });
  const READING_VIEW_COLUMNS = `
    id,
    batch_id,
    test_point_id,
    test_point_label,
    location_id,
    site_name,
    value_mv,
    threshold_mv_snapshot,
    is_protected,
    reading_ts,
    upload_method,
    temperature_c,
    medium_conductivity,
    ph,
    dissolved_oxygen,
    power_watts,
    source_file,
    entered_by
  `;

  function getClient() {
    if (!window.appSupabase || !window.isSupabaseConfigured?.()) {
      throw new Error("Supabase is not configured.");
    }
    return window.appSupabase;
  }

  async function requireAuthenticatedUser() {
    const supabase = getClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) throw new Error(error?.message || "Authentication is required.");
    return user;
  }

  function mapUserRowToUserModel(row) {
    if (!row) return null;
    return {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      role: row.role,
      isActive: Boolean(row.is_active),
      isSuperAdmin: row.is_super_admin === true,
      createdAt: row.created_at,
      createdBy: row.created_by,
    };
  }

  function mapLocationRowToLocationModel(row) {
    if (!row) return null;
    return {
      id: row.id,
      siteName: row.site_name,
      latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
      longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
      description: row.description || "",
      createdAt: row.created_at,
      createdBy: row.created_by,
      updatedAt: row.updated_at,
    };
  }

  function toCoordinateNumber(value) {
    return value === null || value === undefined ? null : Number(value);
  }

  function mapPositionRowToPositionModel(row) {
    if (!row) return null;
    const latitude = toCoordinateNumber(row.latitude);
    const longitude = toCoordinateNumber(row.longitude);
    const relativeX = toCoordinateNumber(row.relative_x_m);
    const relativeY = toCoordinateNumber(row.relative_y_m);
    return {
      id: row.id,
      coordinateMode: row.coordinate_mode || "unmapped",
      latitude,
      longitude,
      relativeX,
      relativeY,
      relativeZ: toCoordinateNumber(row.relative_z_m),
      chainageM: toCoordinateNumber(row.chainage_m),
      coordinateAccuracyM: toCoordinateNumber(row.coordinate_accuracy_m),
      coordinateSource: row.coordinate_source || "",
      updatedAt: row.updated_at || null,
      hasGps: Number.isFinite(latitude) && Number.isFinite(longitude),
      hasRelative: Number.isFinite(relativeX) && Number.isFinite(relativeY),
    };
  }

  function getCurrentPosition(pointRow = {}) {
    const rows = Array.isArray(pointRow.positions) ? pointRow.positions : pointRow.positions ? [pointRow.positions] : [];
    return mapPositionRowToPositionModel(rows.find((row) => row.is_current !== false) || null);
  }

  async function getCurrentPositionsByTestPointIds(testPointIds) {
    const ids = [...new Set((testPointIds || []).filter(Boolean))];
    if (!ids.length) return new Map();
    const byTestPointId = new Map();
    for (let index = 0; index < ids.length; index += 200) {
      const { data, error } = await getClient()
        .from("test_point_positions")
        .select("id, test_point_id, coordinate_mode, latitude, longitude, relative_x_m, relative_y_m, relative_z_m, chainage_m, coordinate_accuracy_m, coordinate_source, is_current, updated_at")
        .in("test_point_id", ids.slice(index, index + 200))
        .eq("is_current", true);
      if (error) throw error;
      (data || []).forEach((row) => byTestPointId.set(row.test_point_id, mapPositionRowToPositionModel(row)));
    }
    return byTestPointId;
  }

  const TEST_POINT_FIELDS = `
          id,
          location_id,
          label,
          type,
          threshold_mv,
          status,
          is_active,
          created_at,
          positions:test_point_positions (
            id,
            coordinate_mode,
            latitude,
            longitude,
            relative_x_m,
            relative_y_m,
            relative_z_m,
            chainage_m,
            coordinate_accuracy_m,
            coordinate_source,
            is_current,
            updated_at
          )
  `;
  const LOCATION_RELATION_FIELDS = `
            id,
            site_name,
            latitude,
            longitude,
            description,
            created_at,
            created_by,
            updated_at
  `;

  function mapTestPointRowToTestPointModel(row) {
    if (!row) return null;
    const location = mapLocationRowToLocationModel(row.locations);
    const position = getCurrentPosition(row);
    return {
      id: row.id,
      displayId: row.test_point_code || row.label || row.id,
      label: row.label,
      type: row.type,
      thresholdMv: AppStatus.DEFAULT_PROTECTION_THRESHOLD_MV,
      storedStatus: row.status,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      locationId: row.location_id,
      location,
      position,
      latitude: position?.latitude ?? null,
      longitude: position?.longitude ?? null,
      siteName: location?.siteName || "Not available",
      assetPath: location?.siteName || "Not available",
    };
  }

  function mapReadingRowToReadingModel(row) {
    if (!row) return null;
    const batch = row.reading_batches || {};
    const point = row.test_points || {};
    const location = mapLocationRowToLocationModel(point.locations || batch.locations);
    const position = getCurrentPosition(point);
    const enteredBy = mapUserRowToUserModel(batch.users);
    const threshold = Number(row.threshold_mv_snapshot ?? point.threshold_mv ?? AppStatus.DEFAULT_PROTECTION_THRESHOLD_MV);
    const derived = AppStatus.deriveProtectionStatus(row.value_mv, threshold);
    return {
      id: row.id,
      batchId: row.batch_id,
      testPointId: row.test_point_id,
      testPointLabel: point.label || row.test_point_id,
      testPointDisplayId: point.test_point_code || point.label || row.test_point_id,
      locationId: batch.location_id || point.location_id,
      siteName: location?.siteName || "Not available",
      location,
      position,
      valueMv: Number(row.value_mv),
      thresholdMvSnapshot: threshold,
      status: derived.status,
      isProtected: derived.isProtected,
      readingTimestamp: batch.reading_ts,
      uploadMethod: batch.upload_method,
      enteredById: batch.entered_by || null,
      temperatureC: batch.temperature_c === null || batch.temperature_c === undefined ? null : Number(batch.temperature_c),
      conductivity: batch.medium_conductivity === null || batch.medium_conductivity === undefined ? null : Number(batch.medium_conductivity),
      ph: batch.ph === null || batch.ph === undefined ? null : Number(batch.ph),
      dissolvedOxygen: batch.dissolved_oxygen === null || batch.dissolved_oxygen === undefined ? null : Number(batch.dissolved_oxygen),
      powerWatts: batch.power_watts === null || batch.power_watts === undefined ? null : Number(batch.power_watts),
      sourceFile: batch.source_file,
      enteredBy,
      createdAt: row.created_at,
    };
  }

  function mapReadingViewRowToReadingModel(row) {
    if (!row) return null;
    const threshold = Number(row.threshold_mv_snapshot ?? AppStatus.DEFAULT_PROTECTION_THRESHOLD_MV);
    const derived = AppStatus.deriveProtectionStatus(row.value_mv, threshold);
    return {
      id: row.id,
      batchId: row.batch_id || null,
      testPointId: row.test_point_id,
      testPointLabel: row.test_point_label || row.test_point_id,
      testPointDisplayId: row.test_point_label || row.test_point_id,
      locationId: row.location_id,
      siteName: row.site_name || "Not available",
      location: {
        id: row.location_id,
        siteName: row.site_name || "Not available",
        latitude: null,
        longitude: null,
      },
      position: null,
      valueMv: Number(row.value_mv),
      thresholdMvSnapshot: threshold,
      status: derived.status,
      isProtected: derived.isProtected,
      readingTimestamp: row.reading_ts,
      uploadMethod: row.upload_method,
      enteredById: row.entered_by || null,
      temperatureC: row.temperature_c === null || row.temperature_c === undefined ? null : Number(row.temperature_c),
      conductivity: row.medium_conductivity === null || row.medium_conductivity === undefined ? null : Number(row.medium_conductivity),
      ph: row.ph === null || row.ph === undefined ? null : Number(row.ph),
      dissolvedOxygen: row.dissolved_oxygen === null || row.dissolved_oxygen === undefined ? null : Number(row.dissolved_oxygen),
      powerWatts: row.power_watts === null || row.power_watts === undefined ? null : Number(row.power_watts),
      sourceFile: row.source_file,
      enteredBy: null,
      createdAt: row.created_at || row.reading_ts,
    };
  }

  function mapWeeklySummaryRowToSummaryModel(row) {
    if (!row) return null;
    const point = mapTestPointRowToTestPointModel(row.test_points);
    return {
      id: row.id,
      testPointId: row.test_point_id,
      testPoint: point,
      weekStartDate: row.week_start_date,
      weekEndDate: row.week_end_date,
      latestReadingMv: row.latest_reading_mv,
      weeklyAverageMv: row.weekly_average_mv === null ? null : Number(row.weekly_average_mv),
      changeFromStartMv: row.change_from_start_mv,
      statusChange: row.status_change,
      generatedAt: row.generated_at,
    };
  }

  function toNumberOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function mapStatusChangeForUi(value) {
    return { improved: "Improved", declined: "Worsened", stable: "Stable", insufficient_data: "InsufficientData" }[value] || "InsufficientData";
  }

  function mapDailySummaryRow(row) {
    if (!row) return null;
    return {
      testPointId: row.test_point_id,
      testPointDisplayId: row.test_point_code || row.test_point_label || row.test_point_id,
      testPointName: row.test_point_label || row.test_point_id,
      locationId: row.location_id,
      siteName: row.site_name || "Not available",
      readingDate: row.reading_date,
      firstReading: toNumberOrNull(row.first_reading_mv),
      latestReading: toNumberOrNull(row.latest_reading_mv),
      dailyAverage: toNumberOrNull(row.daily_average_mv),
      minimumReading: toNumberOrNull(row.minimum_reading_mv),
      maximumReading: toNumberOrNull(row.maximum_reading_mv),
      readingCount: Number(row.reading_count || 0),
      protectedCount: Number(row.protected_count || 0),
      unprotectedCount: Number(row.unprotected_count || 0),
      protectedPercentage: toNumberOrNull(row.protected_percentage),
      thresholdCrossingCount: Number(row.threshold_crossing_count || 0),
      firstReadingTs: row.first_reading_ts || null,
      latestReadingTs: row.latest_reading_ts || null,
      averageTemperatureC: toNumberOrNull(row.average_temperature_c),
      averageConductivity: toNumberOrNull(row.average_conductivity),
    };
  }

  function mapWeeklySummaryRpcRow(row) {
    if (!row) return null;
    const latest = toNumberOrNull(row.latest_reading_mv);
    const threshold = AppStatus.DEFAULT_PROTECTION_THRESHOLD_MV;
    const derived = AppStatus.deriveProtectionStatus(latest, threshold);
    const displayStatus = derived.displayStatus;
    return {
      summaryId: `${row.test_point_id}-${row.week_start_date}`,
      testPointUuid: row.test_point_id,
      testPointId: row.test_point_code || row.test_point_label || row.test_point_id,
      locationId: row.location_id || null,
      weekStartDate: row.week_start_date,
      weekEndDate: row.week_end_date,
      testPoint: {
        uuid: row.test_point_id,
        testPointName: row.test_point_label || row.test_point_id,
        site: row.site_name || "Not available",
        coordType: row.coordinate_mode === "gps" || row.coordinate_mode === "gps_and_relative"
          ? "GPS"
          : row.coordinate_mode === "relative" ? "Relative" : "Missing",
        assignedEngineer: row.assigned_engineer || "-",
      },
      thresholdMv: threshold,
      latestReading: latest,
      startOfWeekReading: toNumberOrNull(row.first_reading_mv),
      weeklyAverage: toNumberOrNull(row.weekly_average_mv),
      minimumReading: toNumberOrNull(row.minimum_reading_mv),
      maximumReading: toNumberOrNull(row.maximum_reading_mv),
      changeFromStart: toNumberOrNull(row.change_from_start_mv),
      readingCount: Number(row.reading_count || 0),
      protectedCount: Number(row.protected_count || 0),
      unprotectedCount: Number(row.unprotected_count || 0),
      protectedPercentage: toNumberOrNull(row.protected_percentage),
      thresholdCrossingCount: Number(row.threshold_crossing_count || 0),
      firstReadingTs: row.first_reading_ts || null,
      latestReadingTs: row.latest_reading_ts || null,
      statusChange: mapStatusChangeForUi(row.status_change),
      currentDisplayStatus: displayStatus,
      protectionStatus: displayStatus === "Protected" ? "Protected" : displayStatus === "Unknown" ? "Unknown" : "Unprotected",
      displayStatus: displayStatus === "Unknown" ? "No Data" : displayStatus,
      lastUpdated: row.latest_reading_ts || null,
      dailySummaries: [],
    };
  }

  function mapWeeklySummaryWeekOptionRow(row) {
    if (!row) return null;
    return {
      weekStartDate: row.week_start_date,
      weekEndDate: row.week_end_date,
      readingCount: Number(row.reading_count || 0),
      firstReadingTs: row.first_reading_ts || null,
      latestReadingTs: row.latest_reading_ts || null,
    };
  }

  function mapWeeklyComparisonRow(row) {
    if (!row) return null;
    return {
      testPointId: row.test_point_id,
      selectedWeekStartDate: row.selected_week_start_date,
      comparisonWeekStartDate: row.comparison_week_start_date,
      selectedWeeklyAverageMv: toNumberOrNull(row.selected_weekly_average_mv),
      comparisonWeeklyAverageMv: toNumberOrNull(row.comparison_weekly_average_mv),
      weekComparisonMv: toNumberOrNull(row.week_comparison_mv),
      comparisonStatus: row.comparison_status || "no_comparison_data",
    };
  }

  function mapDashboardLayoutRowToLayoutModel(row) {
    if (!row) return null;
    return {
      id: row.id,
      pageKey: row.page_key,
      dashboardName: row.dashboard_name,
      layoutVersion: row.layout_version,
      layoutConfig: row.layout_config,
      updatedAt: row.updated_at,
    };
  }

  class UserRepository {
    async getCurrentUserProfile() {
      const user = await requireAuthenticatedUser();
      const { data, error } = await getClient()
        .from(TABLES.users)
        // "*" keeps sign-in working before and after the Super Admin migration
        // (is_super_admin only exists once 20261028100000_super_admin.sql is applied).
        .select("*")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return mapUserRowToUserModel(data);
    }

    async getUsersByIds(userIds = []) {
      const ids = [...new Set((userIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
      if (!ids.length) return [];
      const { data, error } = await getClient()
        .from(TABLES.users)
        .select("id, full_name, email, role, is_active, created_at, created_by")
        .in("id", ids);
      if (error) throw error;
      return (data || []).map(mapUserRowToUserModel);
    }
  }

  class LocationRepository {
    async getAllLocations() {
      const { data, error } = await getClient()
        .from(TABLES.locations)
        .select("id, site_name, latitude, longitude, description, created_at, created_by, updated_at")
        .order("site_name", { ascending: true });
      if (error) throw error;
      return (data || []).map(mapLocationRowToLocationModel);
    }
  }

  class TestPointRepository {
    async getAllTestPoints() {
      const { data, error } = await getClient()
        .from(TABLES.testPoints)
        .select(`
${TEST_POINT_FIELDS},
          locations:location_id (
${LOCATION_RELATION_FIELDS}
          )
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map(mapTestPointRowToTestPointModel);
    }

    async getTestPointById(testPointId) {
      const { data, error } = await getClient()
        .from(TABLES.testPoints)
        .select(`
${TEST_POINT_FIELDS},
          locations:location_id (
${LOCATION_RELATION_FIELDS}
          )
        `)
        .eq("id", testPointId)
        .maybeSingle();
      if (error) throw error;
      return mapTestPointRowToTestPointModel(data);
    }
  }

  class ReadingRepository {
    async getHistoricalReadings({ from, to, testPointId, limit = 200, offset = 0, useView = true } = {}) {
      if (useView) {
        try {
          return await this.getHistoricalReadingsFromView({ from, to, testPointId, limit, offset });
        } catch (error) {
          const message = String(error?.message || "").toLowerCase();
          if (!message.includes("v_readings") && !message.includes("permission denied") && !message.includes("could not find")) {
            throw error;
          }
          console.warn("Falling back to joined historical readings:", error.message || error);
        }
      }
      return this.getHistoricalReadingsFromTables({ from, to, testPointId, limit, offset });
    }

    async getHistoricalReadingsFromView({ from, to, testPointId, limit = 200, offset = 0 } = {}) {
      const fromRow = Math.max(0, Number(offset) || 0);
      const toRow = fromRow + Math.max(1, Number(limit) || 200) - 1;
      let query = getClient()
        .from(TABLES.readingView)
        .select(READING_VIEW_COLUMNS)
        .order("reading_ts", { ascending: false })
        .range(fromRow, toRow);

      if (testPointId) query = query.eq("test_point_id", testPointId);
      if (from) query = query.gte("reading_ts", from);
      if (to) query = query.lte("reading_ts", to);

      const { data, error } = await query;
      if (error) throw error;
      const readings = (data || []).map(mapReadingViewRowToReadingModel);
      const positionByTestPointId = await getCurrentPositionsByTestPointIds(readings.map((reading) => reading.testPointId));
      return readings.map((reading) => ({
        ...reading,
        position: positionByTestPointId.get(reading.testPointId) || null,
      }));
    }

    async getHistoricalReadingsFromTables({ from, to, testPointId, limit = 200, offset = 0 } = {}) {
      const fromRow = Math.max(0, Number(offset) || 0);
      const toRow = fromRow + Math.max(1, Number(limit) || 200) - 1;
      let query = getClient()
        .from(TABLES.readings)
        .select(`
          id,
          batch_id,
          test_point_id,
          value_mv,
          threshold_mv_snapshot,
          created_at,
          reading_batches:batch_id (
            id,
            location_id,
            reading_ts,
            entered_by,
            upload_method,
            temperature_c,
            medium_conductivity,
            ph,
            dissolved_oxygen,
            power_watts,
            source_file,
            created_at
          ),
          test_points:test_point_id (
${TEST_POINT_FIELDS},
            locations:location_id (
${LOCATION_RELATION_FIELDS}
            )
          )
        `)
        .order("created_at", { ascending: false })
        .range(fromRow, toRow);

      if (testPointId) query = query.eq("test_point_id", testPointId);
      if (from) query = query.gte("reading_batches.reading_ts", from);
      if (to) query = query.lte("reading_batches.reading_ts", to);

      const { data, error } = await query;
      if (error) throw error;
      return (data || [])
        .map(mapReadingRowToReadingModel)
        .sort((first, second) => new Date(second.readingTimestamp || second.createdAt) - new Date(first.readingTimestamp || first.createdAt));
    }

    async getReadingsForTestPoint(testPointId, limit = 100) {
      return this.getHistoricalReadings({ testPointId, limit });
    }

    async createManualReading(payload) {
      const { data, error } = await getClient().rpc("create_manual_reading", {
        p_test_point_id: payload.testPointId,
        p_reading_ts: payload.readingTimestamp,
        p_value_mv: payload.valueMv,
        p_temperature_c: payload.temperatureC ?? null,
        p_medium_conductivity: payload.conductivity ?? null,
        p_ph: payload.ph ?? null,
        p_dissolved_oxygen: payload.dissolvedOxygen ?? null,
        p_power_watts: payload.powerWatts ?? null,
      });
      if (error) throw error;
      return data;
    }
  }

  function mapLatestPointModel(testPoint, latestReading, readingHistory = []) {
    const thresholdMv = AppStatus.DEFAULT_PROTECTION_THRESHOLD_MV;
    const derived = AppStatus.deriveProtectionStatus(latestReading?.valueMv, thresholdMv);
    return {
      id: testPoint.id,
      testPointId: testPoint.id,
      displayId: testPoint.displayId,
      label: testPoint.label,
      name: testPoint.label,
      type: testPoint.type,
      thresholdMv,
      isActive: testPoint.isActive,
      createdAt: testPoint.createdAt,
      locationId: testPoint.locationId,
      location: testPoint.location,
      siteName: testPoint.location?.siteName || "Not available",
      asset: "—",
      site: testPoint.location?.siteName || "Not available",
      zone: "—",
      coordType: testPoint.position?.hasGps ? "GPS" : testPoint.position?.hasRelative ? "Relative" : "Missing",
      assignedEngineer: "—",
      reading: latestReading?.valueMv ?? null,
      latestReading: latestReading?.valueMv ?? null,
      latestReadingTimestamp: latestReading?.readingTimestamp || null,
      updatedAt: latestReading?.readingTimestamp ? new Date(latestReading.readingTimestamp).getTime() : null,
      updated: latestReading?.readingTimestamp || "—",
      status: derived.status,
      protectionStatus: derived.protectionStatus,
      displayStatus: derived.displayStatus,
      readings: readingHistory,
    };
  }

  class OperationalRepository {
    constructor() {
      this.testPointRepository = new TestPointRepository();
      this.readingRepository = new ReadingRepository();
    }

    async getLatestReadingsByTestPoint({ activeOnly = true, readingLimit = 5000 } = {}) {
      const [testPoints, readings] = await Promise.all([
        this.testPointRepository.getAllTestPoints(),
        this.readingRepository.getHistoricalReadings({ limit: readingLimit }),
      ]);
      const points = activeOnly ? testPoints.filter((point) => point.isActive) : testPoints;
      const readingsByPoint = new Map();
      readings.forEach((reading) => {
        const list = readingsByPoint.get(reading.testPointId) || [];
        list.push(reading);
        readingsByPoint.set(reading.testPointId, list);
      });
      return points.map((point) => {
        const history = (readingsByPoint.get(point.id) || [])
          .filter((reading) => Number.isFinite(Number(reading.valueMv)))
          .sort((first, second) => new Date(second.readingTimestamp || second.createdAt) - new Date(first.readingTimestamp || first.createdAt));
        return mapLatestPointModel(point, history[0] || null, history);
      });
    }

    async getDashboardSnapshot() {
      const points = await this.getLatestReadingsByTestPoint({ activeOnly: true });
      const validReadings = points.map((point) => point.reading).filter((value) => Number.isFinite(Number(value)));
      const counts = {
        total: points.length,
        protected: points.filter((point) => point.status === "Protected").length,
        warning: points.filter((point) => point.status === "Warning").length,
        unprotected: points.filter((point) => point.status === "Unprotected").length,
        unknown: points.filter((point) => point.status === "Unknown").length,
      };
      return {
        points,
        counts,
        averageReading: validReadings.length
          ? Math.round(validReadings.reduce((sum, value) => sum + Number(value), 0) / validReadings.length)
          : null,
      };
    }
  }

  class WeeklySummaryRepository {
    async getAvailableWeeks(limit = 32) {
      const { data, error } = await getClient().rpc("get_weekly_summary_available_weeks", {
        p_timezone: "Asia/Singapore",
        p_limit: limit,
      });
      if (error) throw error;
      return (data || []).map(mapWeeklySummaryWeekOptionRow);
    }

    async getDailySummaries(weekStart, testPointIds = []) {
      const { data, error } = await getClient().rpc("get_test_point_daily_summaries", {
        p_week_start: weekStart,
        p_timezone: "Asia/Singapore",
        p_test_point_ids: testPointIds.length ? testPointIds : null,
      });
      if (error) throw error;
      return (data || []).map(mapDailySummaryRow);
    }

    async getWeeklySummaries(weekStart, testPointIds = []) {
      const { data, error } = await getClient().rpc("get_test_point_weekly_summaries", {
        p_week_start: weekStart,
        p_timezone: "Asia/Singapore",
        p_stable_tolerance_mv: 5,
        p_test_point_ids: testPointIds.length ? testPointIds : null,
      });
      if (error) throw error;
      const summaries = (data || []).map(mapWeeklySummaryRpcRow);
      const positionByPoint = await getCurrentPositionsByTestPointIds(summaries.map((summary) => summary.testPointUuid));
      summaries.forEach((summary) => {
        const position = positionByPoint.get(summary.testPointUuid) || null;
        summary.testPoint.position = position;
        summary.testPoint.coordType = position?.hasGps ? "GPS" : position?.hasRelative ? "Relative" : "Missing";
      });
      return summaries;
    }

    async compareWeeks(selectedWeekStart, comparisonWeekStart) {
      if (!comparisonWeekStart || selectedWeekStart === comparisonWeekStart) return [];
      const { data, error } = await getClient().rpc("compare_weekly_summaries", {
        p_selected_week_start: selectedWeekStart,
        p_comparison_week_start: comparisonWeekStart,
        p_stable_tolerance_mv: 5,
      });
      if (error) throw error;
      return (data || []).map(mapWeeklyComparisonRow);
    }

    async getWeeklySummaryData(weekStart, comparisonWeekStart = null) {
      const weeklySummaries = await this.getWeeklySummaries(weekStart);
      let dailySummaries = [];
      let dailySummariesError = null;
      let comparisons = [];
      try {
        dailySummaries = await this.getDailySummaries(
          weekStart,
          weeklySummaries.map((summary) => summary.testPointUuid).filter(Boolean),
        );
      } catch (error) {
        dailySummariesError = error;
        console.error("Daily Weekly Summary aggregation failed. Weekly summaries remain available, but the daily trend cannot be rendered.", error);
      }
      try {
        comparisons = await this.compareWeeks(weekStart, comparisonWeekStart);
      } catch (error) {
        console.warn("Weekly comparison failed. Rendering selected week without comparison.", error);
      }
      return { weeklySummaries, dailySummaries, dailySummariesError, comparisons };
    }

    async getSummariesForWeek(startDate, endDate) {
      const { data, error } = await getClient()
        .from(TABLES.weeklySummaries)
        .select(`
          id,
          test_point_id,
          week_start_date,
          week_end_date,
          latest_reading_mv,
          weekly_average_mv,
          change_from_start_mv,
          status_change,
          generated_at,
          test_points:test_point_id (
${TEST_POINT_FIELDS},
            locations:location_id (
${LOCATION_RELATION_FIELDS}
            )
          )
        `)
        .eq("week_start_date", startDate)
        .eq("week_end_date", endDate)
        .order("test_point_id", { ascending: true });
      if (error) throw error;
      return (data || []).map(mapWeeklySummaryRowToSummaryModel);
    }
  }

  class DashboardLayoutRepository {
    async getLayout(pageKey = "main-dashboard") {
      const user = await requireAuthenticatedUser();
      const { data, error } = await getClient()
        .from(TABLES.dashboardLayouts)
        .select("id, page_key, dashboard_name, layout_version, layout_config, updated_at")
        .eq("user_id", user.id)
        .eq("page_key", pageKey)
        .maybeSingle();
      if (error) throw error;
      return mapDashboardLayoutRowToLayoutModel(data);
    }

    async saveLayout(layoutConfig, pageKey = "main-dashboard") {
      const user = await requireAuthenticatedUser();
      const payload = {
        user_id: user.id,
        page_key: pageKey,
        dashboard_name: "Main Dashboard",
        layout_version: layoutConfig.version || 1,
        layout_config: layoutConfig,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await getClient()
        .from(TABLES.dashboardLayouts)
        .upsert(payload, { onConflict: "user_id,page_key" })
        .select("id, page_key, dashboard_name, layout_version, layout_config, updated_at")
        .single();
      if (error) throw error;
      return mapDashboardLayoutRowToLayoutModel(data);
    }

    async resetLayout(pageKey = "main-dashboard") {
      const user = await requireAuthenticatedUser();
      const { error } = await getClient()
        .from(TABLES.dashboardLayouts)
        .delete()
        .eq("user_id", user.id)
        .eq("page_key", pageKey);
      if (error) throw error;
    }
  }

  window.AppRepositories = {
    TABLES,
    getClient,
    requireAuthenticatedUser,
    mapUserRowToUserModel,
    mapLocationRowToLocationModel,
    mapTestPointRowToTestPointModel,
    mapReadingRowToReadingModel,
    mapWeeklySummaryRowToSummaryModel,
    mapDailySummaryRow,
    mapWeeklySummaryRpcRow,
    mapWeeklySummaryWeekOptionRow,
    mapWeeklyComparisonRow,
    mapDashboardLayoutRowToLayoutModel,
    UserRepository,
    LocationRepository,
    TestPointRepository,
    ReadingRepository,
    WeeklySummaryRepository,
    DashboardLayoutRepository,
    OperationalRepository,
  };
})();
