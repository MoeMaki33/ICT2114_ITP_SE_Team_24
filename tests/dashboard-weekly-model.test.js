const assert = require("node:assert/strict");
const { WeeklyLocationAggregator } = require("../www/js/weekly-location-aggregator.js");
const DashboardWeeklyModel = require("../www/js/dashboard-weekly-model.js");

const points = [
  ["a", "LOC-TP-010", "North"],
  ["b", "LOC-TP-002", "North"],
  ["c", "LOC-TP-003", "North"],
  ["d", "LOC-TP-004", "North"],
  ["e", "SOUTH-TP-001", "South"],
  ["f", "SOUTH-TP-002", "South"],
].map(([id, displayId, siteName]) => ({ id, displayId, label: "Duplicate label", locationId: siteName.toLowerCase(), siteName, thresholdMv: -850 }));

function summary({ id, code, site, status, latest, average, first, count, trend = "Stable", crossings = 0 }) {
  return {
    testPointUuid: id,
    testPointId: code,
    locationId: site.toLowerCase(),
    testPoint: { site, testPointName: "Duplicate label" },
    latestReading: latest,
    weeklyAverage: average,
    startOfWeekReading: first,
    changeFromStart: latest === null || first === null ? null : latest - first,
    readingCount: count,
    displayStatus: status,
    statusChange: trend,
    thresholdCrossingCount: crossings,
    protectedPercentage: status === "Protected" ? 100 : status === "No Data" ? null : 0,
    latestReadingTs: count ? "2026-07-15T08:00:00+08:00" : null,
  };
}

const summaries = [
  summary({ id: "a", code: "LOC-TP-010", site: "North", status: "Protected", latest: -1000, average: -1000, first: -1002, count: 100 }),
  summary({ id: "b", code: "LOC-TP-002", site: "North", status: "Unprotected", latest: -700, average: -700, first: -720, count: 1, trend: "Worsened" }),
  summary({ id: "c", code: "LOC-TP-003", site: "North", status: "Warning", latest: -830, average: -830, first: -860, count: 1, trend: "Worsened" }),
  summary({ id: "e", code: "SOUTH-TP-001", site: "South", status: "Protected", latest: -870, average: -900, first: -960, count: 7, trend: "Worsened" }),
  summary({ id: "f", code: "SOUTH-TP-002", site: "South", status: "Protected", latest: -900, average: -880, first: -900, count: 7, crossings: 3 }),
];

const model = DashboardWeeklyModel.buildModel({
  snapshot: { points },
  weeklySummaries: summaries,
  dailySummaries: [],
  comparisons: [{ testPointId: "b", weekComparisonMv: 20 }],
  selectedWeek: "2026-07-13",
  comparisonWeek: "2026-07-06",
  aggregator: WeeklyLocationAggregator,
});

assert.equal(model.tableRows.length, 6);
assert.equal(model.weeklyByTestPoint.get("b").comparison.weekComparisonMv, 20, "comparison rows must join by UUID");
assert.equal(model.tableRows.find((row) => row.uuid === "a").latestReading, -1000);
assert.equal(model.tableRows.find((row) => row.uuid === "b").latestReading, -700, "duplicate display labels must not affect UUID joins");
assert.equal(model.tableRows.find((row) => row.uuid === "d").status, "No Data", "active points missing from the RPC result need a safe No Data row");

const north = model.locationSummaries.find((location) => location.siteName === "North");
assert.equal(north.condition, "Critical", "a safe-looking weighted average must not hide an Unprotected Test Point");
assert.deepEqual(north.counts, { total: 4, protected: 1, warning: 1, unprotected: 1, noData: 1 });
assert.ok(north.weightedWeeklyAverage < -990, "the supporting weighted average should remain separate from condition severity");
assert.deepEqual(model.priorityPoints.map((item) => item.testPointUuid), ["b", "c", "e", "f", "d"]);

const dailyTrend = DashboardWeeklyModel.buildLocationDailyTrend([
  { locationId: "north", siteName: "North", readingDate: "2026-07-13", dailyAverage: -1000, readingCount: 9 },
  { locationId: "north", siteName: "North", readingDate: "2026-07-13", dailyAverage: -700, readingCount: 1 },
], model.locationSummaries, "2026-07-13");
const northTrend = dailyTrend.datasets.find((dataset) => dataset.label === "North");
assert.equal(northTrend.data[0], -970, "Location daily values must be weighted by reading count");
assert.equal(northTrend.data[1], null, "missing days must remain gaps rather than zero");
assert.equal(dailyTrend.dates.length, 7);
const bounds = DashboardWeeklyModel.dynamicMvBounds(dailyTrend.datasets, -850);
assert.ok(bounds.min < -970 && bounds.max > -850, "dynamic bounds must include both readings and threshold");

assert.deepEqual(
  DashboardWeeklyModel.sortRows(model.tableRows, "id", "asc").slice(0, 2).map((row) => row.id),
  ["LOC-TP-002", "LOC-TP-003"],
  "ID sorting should be natural",
);
const latestDescending = DashboardWeeklyModel.sortRows(model.tableRows, "latestReading", "desc");
assert.equal(latestDescending.at(-1).uuid, "d", "missing numeric values must remain last when descending");

console.log("dashboard-weekly-model: UUID joins, shared severity, priority, weighted daily trends, gaps and sorting passed");
