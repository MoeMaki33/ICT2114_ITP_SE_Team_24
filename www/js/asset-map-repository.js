(function () {
  const SETUP_ERROR = "Asset Map database setup is incomplete. Please apply the Asset Map migrations.";

  function getClient() {
    if (window.AppRepositories?.getClient) return window.AppRepositories.getClient();
    if (!window.appSupabase || !window.isSupabaseConfigured?.()) {
      throw new Error("Supabase is not configured.");
    }
    return window.appSupabase;
  }

  function toNumberOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizeSetupError(error) {
    const message = String(error?.message || error || "");
    if (
      /get_asset_map_points/i.test(message) ||
      /test_point_positions/i.test(message) ||
      /schema cache/i.test(message) ||
      /could not find/i.test(message) ||
      /does not exist/i.test(message)
    ) {
      const setupError = new Error(SETUP_ERROR);
      setupError.cause = error;
      return setupError;
    }
    return error;
  }

  function mapAssetMapPointRow(row) {
    const latitude = toNumberOrNull(row.latitude);
    const longitude = toNumberOrNull(row.longitude);
    const relativeX = toNumberOrNull(row.relative_x_m);
    const relativeY = toNumberOrNull(row.relative_y_m);
    const latestReading = toNumberOrNull(row.latest_reading_mv);
    const derived = window.AppStatus.deriveProtectionStatus(latestReading);
    const coordinateMode = row.coordinate_mode || "unmapped";

    return {
      id: row.test_point_id,
      testPointId: row.test_point_id,
      displayId: row.display_id || row.label || row.test_point_id,
      label: row.label || "Unnamed test point",
      name: row.label || "Unnamed test point",
      type: row.type || "",
      thresholdMv: window.AppStatus.DEFAULT_PROTECTION_THRESHOLD_MV,
      locationId: row.location_id || null,
      siteName: row.site_name || "Not available",
      location: {
        id: row.location_id || null,
        siteName: row.site_name || "Not available",
        latitude: toNumberOrNull(row.location_latitude),
        longitude: toNumberOrNull(row.location_longitude),
      },
      positionId: row.position_id || null,
      coordinateMode,
      latitude,
      longitude,
      relativeX,
      relativeY,
      relativeZ: toNumberOrNull(row.relative_z_m),
      chainageM: toNumberOrNull(row.chainage_m),
      coordinateAccuracyM: toNumberOrNull(row.coordinate_accuracy_m),
      coordinateSource: row.coordinate_source || "",
      positionUpdatedAt: row.position_updated_at || null,
      latestReading,
      reading: latestReading,
      latestReadingTimestamp: row.latest_reading_ts || null,
      protectionStatus: derived.protectionStatus,
      displayStatus: derived.displayStatus,
      status: derived.displayStatus,
      assignedEngineerId: row.assigned_engineer_id || null,
      assignedEngineerName: row.assigned_engineer_name || "Unassigned",
      hasGps: Number.isFinite(latitude) && Number.isFinite(longitude),
      hasRelative: Number.isFinite(relativeX) && Number.isFinite(relativeY),
    };
  }

  class AssetMapRepository {
    async getAssetMapPoints(filters = {}) {
      try {
        const { data, error } = await getClient().rpc("get_asset_map_points");
        if (error) throw error;
        const points = (data || []).map(mapAssetMapPointRow);
        if (!filters || !Object.keys(filters).length) return points;
        return points.filter((point) => {
          if (filters.locationId && point.locationId !== filters.locationId) return false;
          if (filters.displayStatus && point.displayStatus !== filters.displayStatus) return false;
          return true;
        });
      } catch (error) {
        throw normalizeSetupError(error);
      }
    }

    async getTestPointPositionHistory(testPointId) {
      try {
        const { data, error } = await getClient().rpc("get_test_point_position_history", {
          p_test_point_id: testPointId,
        });
        if (error) throw error;
        return data || [];
      } catch (error) {
        throw normalizeSetupError(error);
      }
    }

    async setTestPointPosition(payload) {
      try {
        const { data, error } = await getClient().rpc("set_test_point_position", {
          p_test_point_id: payload.testPointId,
          p_coordinate_mode: payload.coordinateMode,
          p_latitude: payload.latitude,
          p_longitude: payload.longitude,
          p_relative_x_m: payload.relativeX,
          p_relative_y_m: payload.relativeY,
          p_relative_z_m: payload.relativeZ,
          p_chainage_m: payload.chainageM,
          p_coordinate_accuracy_m: payload.coordinateAccuracyM,
          p_coordinate_source: payload.coordinateSource,
        });
        if (error) throw error;
        return data;
      } catch (error) {
        throw normalizeSetupError(error);
      }
    }
  }

  window.AssetMapRepository = AssetMapRepository;
  window.AssetMapRepositoryErrors = { SETUP_ERROR };
})();
