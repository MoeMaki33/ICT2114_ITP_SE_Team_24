(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DashboardWeeklyModel = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const STATUS_ORDER = Object.freeze({ Protected: 0, Warning: 1, Unprotected: 2, "No Data": 3 });

  function finiteNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function addIsoDays(isoDate, days) {
    const [year, month, day] = String(isoDate || "").split("-").map(Number);
    if (![year, month, day].every(Number.isFinite)) return "";
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
  }

  function missingSummaryFor(point, weekStart) {
    return {
      summaryId: `${point.id}-${weekStart || "no-week"}`,
      testPointUuid: point.id,
      testPointId: point.displayId || point.label || point.id,
      locationId: point.locationId || null,
      weekStartDate: weekStart || "",
      weekEndDate: weekStart ? addIsoDays(weekStart, 6) : "",
      testPoint: {
        uuid: point.id,
        testPointName: point.label || point.displayId || point.id,
        site: point.siteName || point.location?.siteName || "Not available",
      },
      thresholdMv: finiteNumber(point.thresholdMv) ?? -850,
      latestReading: null,
      startOfWeekReading: null,
      weeklyAverage: null,
      minimumReading: null,
      maximumReading: null,
      changeFromStart: null,
      readingCount: 0,
      protectedCount: 0,
      unprotectedCount: 0,
      protectedPercentage: null,
      thresholdCrossingCount: 0,
      firstReadingTs: null,
      latestReadingTs: null,
      statusChange: "InsufficientData",
      currentDisplayStatus: "No Data",
      displayStatus: "No Data",
      lastUpdated: null,
    };
  }

  function buildModel({
    snapshot = { points: [] },
    weeklySummaries = [],
    dailySummaries = [],
    comparisons = [],
    selectedWeek = "",
    comparisonWeek = "",
    aggregator,
  } = {}) {
    if (!aggregator?.aggregate || !aggregator?.summarizeOverall) {
      throw new Error("WeeklyLocationAggregator is required to build the Dashboard weekly model.");
    }

    const comparisonByPoint = new Map((comparisons || []).map((item) => [String(item.testPointId), item]));
    const completeSummaries = (weeklySummaries || []).map((summary) => ({
      ...summary,
      comparison: comparisonByPoint.get(String(summary.testPointUuid || summary.testPointId)) || null,
    }));
    const existingPointIds = new Set(completeSummaries.map((summary) => String(summary.testPointUuid || "")));
    (snapshot?.points || []).forEach((point) => {
      if (!existingPointIds.has(String(point.id))) completeSummaries.push(missingSummaryFor(point, selectedWeek));
    });

    const weeklyByTestPoint = new Map(completeSummaries.map((summary) => [String(summary.testPointUuid), summary]));
    const tableRows = (snapshot?.points || []).map((point) => {
      const summary = weeklyByTestPoint.get(String(point.id)) || missingSummaryFor(point, selectedWeek);
      return {
        id: summary.testPointId || point.displayId || point.label || point.id,
        uuid: point.id,
        location: summary.testPoint?.site || point.siteName || point.location?.siteName || "Not available",
        latestReading: finiteNumber(summary.latestReading),
        weeklyAverage: finiteNumber(summary.weeklyAverage),
        changeFromStart: finiteNumber(summary.changeFromStart),
        status: aggregator.statusForSummary(summary),
        statusChange: summary.statusChange || "InsufficientData",
        lastUpdated: summary.lastUpdated || summary.latestReadingTs || null,
        lastUpdatedSort: summary.lastUpdated || summary.latestReadingTs
          ? new Date(summary.lastUpdated || summary.latestReadingTs).getTime()
          : null,
        summary,
      };
    });
    const locationSummaries = aggregator.aggregate(completeSummaries);
    const overall = aggregator.summarizeOverall(completeSummaries);
    const priorityPoints = completeSummaries
      .filter((summary) => aggregator.needsAttention(summary))
      .slice()
      .sort(aggregator.compareAttention);

    return {
      selectedWeek,
      comparisonWeek,
      weeklySummaries: completeSummaries,
      dailySummaries: Array.isArray(dailySummaries) ? dailySummaries : [],
      comparisons: Array.isArray(comparisons) ? comparisons : [],
      weeklyByTestPoint,
      locationSummaries,
      priorityPoints,
      overall,
      tableRows,
    };
  }

  function buildLocationDailyTrend(dailySummaries, locationSummaries, weekStart) {
    const dates = Array.from({ length: 7 }, (_, index) => addIsoDays(weekStart, index));
    const dateIndex = new Map(dates.map((date, index) => [date, index]));
    const groups = new Map();

    (locationSummaries || []).forEach((location) => {
      groups.set(String(location.locationId), {
        name: location.siteName || "Not available",
        buckets: dates.map(() => ({ weightedTotal: 0, readingCount: 0 })),
      });
    });

    (dailySummaries || []).forEach((summary) => {
      const index = dateIndex.get(String(summary.readingDate || ""));
      const average = finiteNumber(summary.dailyAverage);
      const count = Math.max(0, Number(summary.readingCount || 0));
      if (index === undefined || average === null || count === 0) return;
      const key = String(summary.locationId || summary.siteName || "unassigned");
      if (!groups.has(key)) {
        groups.set(key, {
          name: summary.siteName || "Not available",
          buckets: dates.map(() => ({ weightedTotal: 0, readingCount: 0 })),
        });
      }
      const bucket = groups.get(key).buckets[index];
      bucket.weightedTotal += average * count;
      bucket.readingCount += count;
    });

    return {
      dates,
      datasets: [...groups.values()].map((group) => ({
        label: group.name,
        data: group.buckets.map((bucket) => bucket.readingCount
          ? bucket.weightedTotal / bucket.readingCount
          : null),
      })),
    };
  }

  function dynamicMvBounds(datasets, thresholdMv = -850) {
    const values = (datasets || []).flatMap((dataset) => dataset.data || []).map(finiteNumber).filter((value) => value !== null);
    values.push(Number(thresholdMv));
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const spread = Math.max(1, maximum - minimum);
    const padding = Math.max(25, Math.min(50, spread * 0.2));
    return {
      min: Math.floor((minimum - padding) / 10) * 10,
      max: Math.ceil((maximum + padding) / 10) * 10,
    };
  }

  function isMissing(value) {
    return value === null || value === undefined || value === "" || (typeof value === "number" && Number.isNaN(value));
  }

  function compareValues(first, second, key) {
    if (["latestReading", "weeklyAverage", "changeFromStart", "lastUpdatedSort"].includes(key)) {
      return Number(first) - Number(second);
    }
    if (key === "status") return (STATUS_ORDER[first] ?? 99) - (STATUS_ORDER[second] ?? 99);
    return String(first).localeCompare(String(second), undefined, { sensitivity: "base", numeric: true });
  }

  function sortRows(rows, key = "id", direction = "asc") {
    const multiplier = direction === "desc" ? -1 : 1;
    return (rows || []).map((row, index) => ({ row, index })).sort((firstItem, secondItem) => {
      const first = firstItem.row[key];
      const second = secondItem.row[key];
      const firstMissing = isMissing(first);
      const secondMissing = isMissing(second);
      if (firstMissing || secondMissing) {
        if (firstMissing && secondMissing) return firstItem.index - secondItem.index;
        return firstMissing ? 1 : -1;
      }
      const compared = compareValues(first, second, key) * multiplier;
      if (compared) return compared;
      const idCompared = String(firstItem.row.id).localeCompare(String(secondItem.row.id), undefined, { sensitivity: "base", numeric: true });
      return idCompared || firstItem.index - secondItem.index;
    }).map((item) => item.row);
  }

  return {
    STATUS_ORDER,
    addIsoDays,
    buildModel,
    buildLocationDailyTrend,
    dynamicMvBounds,
    sortRows,
  };
});
