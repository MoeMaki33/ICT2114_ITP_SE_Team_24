(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WeeklyDailyTrend = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const DEFAULT_THRESHOLD_MV = -850;
  const DEFAULT_PADDING_MV = 40;

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

  function getTimezoneDateKey(value, timezone = "Asia/Singapore") {
    const parsedDate = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsedDate.getTime())) return "";
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(parsedDate);
  }

  function buildTrendModelFromDateGroups({
    weekStart,
    groups = new Map(),
    thresholdMv = DEFAULT_THRESHOLD_MV,
    paddingMv = DEFAULT_PADDING_MV,
  } = {}) {
    const dates = WEEK_DAYS.map((_, index) => addIsoDays(weekStart, index));
    const values = dates.map((date) => {
      const group = groups.get(date);
      return group?.readingCount ? group.weightedTotal / group.readingCount : null;
    });
    const threshold = finiteNumber(thresholdMv) ?? DEFAULT_THRESHOLD_MV;
    const reportedDayCount = values.filter((value) => value !== null).length;
    const matchedRowCount = [...groups.values()].reduce((sum, group) => sum + Number(group?.sourceCount || 0), 0);
    return {
      labels: [...WEEK_DAYS],
      dates,
      values,
      thresholdMv: threshold,
      thresholdValues: WEEK_DAYS.map(() => threshold),
      matchedRowCount,
      reportedDayCount,
      hasData: reportedDayCount > 0,
      yAxis: calculateYAxisBounds(values, threshold, paddingMv),
    };
  }

  function calculateYAxisBounds(values, thresholdMv = DEFAULT_THRESHOLD_MV, paddingMv = DEFAULT_PADDING_MV) {
    const numbers = (values || []).map(finiteNumber).filter((value) => value !== null);
    const threshold = finiteNumber(thresholdMv) ?? DEFAULT_THRESHOLD_MV;
    const padding = Math.max(25, Math.min(50, finiteNumber(paddingMv) ?? DEFAULT_PADDING_MV));
    numbers.push(threshold);
    const minimum = Math.min(...numbers);
    const maximum = Math.max(...numbers);
    const lower = Math.floor((minimum - padding) / 10) * 10;
    const upper = Math.ceil((maximum + padding) / 10) * 10;
    return lower === upper ? { min: lower - padding, max: upper + padding } : { min: lower, max: upper };
  }

  function buildOverallDailyTrend({
    weekStart,
    dailySummaries = [],
    visibleTestPointIds = null,
    thresholdMv = DEFAULT_THRESHOLD_MV,
    paddingMv = DEFAULT_PADDING_MV,
    } = {}) {
    const visibleIds = visibleTestPointIds === null
      ? null
      : new Set([...visibleTestPointIds].map((id) => String(id)));
    const matchingRows = (dailySummaries || []).filter((row) => {
      if (!row || !row.testPointId) return false;
      return visibleIds === null || visibleIds.has(String(row.testPointId));
    });
    const groups = new Map();
    matchingRows.forEach((row) => {
      const average = finiteNumber(row.dailyAverage);
      const count = Number(row.readingCount || 0);
      if (!row.readingDate || average === null || !Number.isFinite(count) || count <= 0) return;
      if (!groups.has(row.readingDate)) groups.set(row.readingDate, { weightedTotal: 0, readingCount: 0, sourceCount: 0 });
      const group = groups.get(row.readingDate);
      group.weightedTotal += average * count;
      group.readingCount += count;
      group.sourceCount += 1;
    });
    const model = buildTrendModelFromDateGroups({ weekStart, groups, thresholdMv, paddingMv });
    model.matchedRowCount = matchingRows.length;
    return model;
  }

  function buildDailyTrendFromReadings({
    weekStart,
    readings = [],
    thresholdMv = DEFAULT_THRESHOLD_MV,
    paddingMv = DEFAULT_PADDING_MV,
    timezone = "Asia/Singapore",
  } = {}) {
    const weekEnd = addIsoDays(weekStart, 6);
    const groups = new Map();
    (readings || []).forEach((reading) => {
      const value = finiteNumber(reading?.readingValue ?? reading?.latestReading ?? reading?.valueMv ?? null);
      const dateKey = getTimezoneDateKey(reading?.sortDate || reading?.updatedAt || reading?.readingTimestamp || reading?.createdAt, timezone);
      if (value === null || !dateKey || (weekStart && dateKey < weekStart) || (weekEnd && dateKey > weekEnd)) return;
      if (!groups.has(dateKey)) groups.set(dateKey, { weightedTotal: 0, readingCount: 0, sourceCount: 0 });
      const group = groups.get(dateKey);
      group.weightedTotal += value;
      group.readingCount += 1;
      group.sourceCount += 1;
    });
    return buildTrendModelFromDateGroups({ weekStart, groups, thresholdMv, paddingMv });
  }

  function createOverallChartConfig(model) {
    const pointRadius = model.reportedDayCount === 1 ? 6 : 4;
    return {
      type: "line",
      data: {
        labels: model.labels,
        datasets: [
          {
            label: "Weighted average (mV)",
            data: model.values,
            borderColor: "#315f88",
            backgroundColor: "rgba(0,0,0,0)",
            fill: false,
            tension: 0.25,
            spanGaps: false,
            pointRadius,
            pointHoverRadius: pointRadius + 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        scales: {
          y: {
            min: model.yAxis.min,
            max: model.yAxis.max,
            title: { display: true, text: "mV" },
          },
        },
      },
    };
  }

  return {
    WEEK_DAYS,
    DEFAULT_THRESHOLD_MV,
    addIsoDays,
    getTimezoneDateKey,
    finiteNumber,
    calculateYAxisBounds,
    buildDailyTrendFromReadings,
    buildOverallDailyTrend,
    createOverallChartConfig,
  };
});
