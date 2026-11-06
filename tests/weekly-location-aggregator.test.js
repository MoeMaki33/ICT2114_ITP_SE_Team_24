const assert = require("node:assert/strict");
const { WeeklyLocationAggregator } = require("../www/js/weekly-location-aggregator.js");

function point(overrides = {}) {
  return {
    testPointUuid: overrides.testPointUuid || Math.random().toString(36),
    testPointId: overrides.testPointId || "TP",
    locationId: overrides.locationId || "location-a",
    testPoint: { site: overrides.site || "Location A", testPointName: overrides.testPointId || "TP" },
    displayStatus: "Protected",
    statusChange: "Stable",
    weeklyAverage: -900,
    readingCount: 10,
    thresholdCrossingCount: 0,
    changeFromStart: 0,
    ...overrides,
  };
}

const noData = WeeklyLocationAggregator.summarizeLocation([
  point({ displayStatus: "No Data", readingCount: 0, weeklyAverage: null }),
]);
assert.equal(noData.condition, "No Data");
assert.equal(noData.weightedWeeklyAverage, null);

const critical = WeeklyLocationAggregator.summarizeLocation([
  point({ weeklyAverage: -1100, readingCount: 100 }),
  point({ displayStatus: "Unprotected", weeklyAverage: -700, readingCount: 1 }),
]);
assert.equal(critical.condition, "Critical", "a safe-looking average must not hide one Unprotected point");

assert.equal(WeeklyLocationAggregator.summarizeLocation([
  point(), point({ displayStatus: "Warning" }),
]).condition, "Attention Required");

assert.equal(WeeklyLocationAggregator.summarizeLocation([
  point(), point({ statusChange: "Worsened" }),
]).condition, "Attention Required");

assert.equal(WeeklyLocationAggregator.summarizeLocation([
  point({ thresholdCrossingCount: 3 }),
]).condition, "Attention Required");

assert.equal(WeeklyLocationAggregator.summarizeLocation([
  point(), point({ displayStatus: "No Data", readingCount: 0, weeklyAverage: null }),
]).condition, "Attention Required");

const protectedLocation = WeeklyLocationAggregator.summarizeLocation([point(), point()]);
assert.equal(protectedLocation.condition, "Protected");
assert.equal(protectedLocation.protectedPercentage, 100);

const weighted = WeeklyLocationAggregator.summarizeLocation([
  point({ weeklyAverage: -1000, readingCount: 9 }),
  point({ weeklyAverage: -800, readingCount: 1 }),
]);
assert.equal(weighted.weightedWeeklyAverage, -980);

const knownPercentage = WeeklyLocationAggregator.summarizeLocation([
  point(), point({ displayStatus: "Warning" }), point({ displayStatus: "No Data", readingCount: 0, weeklyAverage: null }),
]);
assert.equal(knownPercentage.protectedPercentage, 50, "No Data is excluded from the known-status denominator");

const grouped = WeeklyLocationAggregator.aggregate([
  point({ locationId: "safe", site: "Safe Site" }),
  point({ locationId: "risk", site: "Risk Site", displayStatus: "Unprotected" }),
]);
assert.equal(grouped.length, 2);
assert.equal(grouped[0].condition, "Critical", "locations are ordered by worst condition");
const aggregatorInstance = new WeeklyLocationAggregator();
assert.equal(aggregatorInstance.findWorstTestPoint(grouped.flatMap((location) => location.points)).displayStatus, "Unprotected");

const attention = [
  point({ testPointId: "warning", displayStatus: "Warning" }),
  point({ testPointId: "critical", displayStatus: "Unprotected" }),
  point({ testPointId: "missing", displayStatus: "No Data", readingCount: 0, weeklyAverage: null }),
].sort(WeeklyLocationAggregator.compareAttention);
assert.deepEqual(attention.map((item) => item.testPointId), ["critical", "warning", "missing"]);

const protectedPriority = [
  point({ testPointId: "improved", statusChange: "Improved" }),
  point({ testPointId: "stable", statusChange: "Stable" }),
  point({ testPointId: "declining", statusChange: "Worsened" }),
].sort(WeeklyLocationAggregator.compareAttention);
assert.deepEqual(protectedPriority.map((item) => item.testPointId), ["declining", "stable", "improved"]);

const requestedAttentionOrder = [
  point({ testPointId: "missing", displayStatus: "No Data", readingCount: 0, weeklyAverage: null }),
  point({ testPointId: "crossing", thresholdCrossingCount: 3 }),
  point({ testPointId: "declining", statusChange: "Worsened" }),
  point({ testPointId: "warning", displayStatus: "Warning" }),
  point({ testPointId: "unprotected", displayStatus: "Unprotected" }),
].sort(WeeklyLocationAggregator.compareAttention);
assert.deepEqual(
  requestedAttentionOrder.map((item) => item.testPointId),
  ["unprotected", "warning", "declining", "crossing", "missing"],
  "No Data remains actionable but ranks below immediate protection and repeated-crossing concerns",
);

const tieBreak = [
  point({ testPointId: "higher-percentage", displayStatus: "Warning", protectedPercentage: 80, latestReading: -820 }),
  point({ testPointId: "lower-percentage", displayStatus: "Warning", protectedPercentage: 20, latestReading: -830 }),
].sort(WeeklyLocationAggregator.compareAttention);
assert.equal(tieBreak[0].testPointId, "lower-percentage");

const latestTieBreak = [
  point({ testPointId: "more-negative", displayStatus: "Warning", protectedPercentage: 20, latestReading: -830 }),
  point({ testPointId: "more-positive", displayStatus: "Warning", protectedPercentage: 20, latestReading: -810 }),
].sort(WeeklyLocationAggregator.compareAttention);
assert.equal(latestTieBreak[0].testPointId, "more-positive");

const crossingTieBreak = [
  point({ testPointId: "TP-10", displayStatus: "Warning", protectedPercentage: 20, latestReading: -810, changeFromStart: 20, thresholdCrossingCount: 1 }),
  point({ testPointId: "TP-2", displayStatus: "Warning", protectedPercentage: 20, latestReading: -810, changeFromStart: 20, thresholdCrossingCount: 2 }),
].sort(WeeklyLocationAggregator.compareAttention);
assert.equal(crossingTieBreak[0].testPointId, "TP-2");

const large = Array.from({ length: 125 }, (_, index) => point({
  testPointId: `TP-${String(index + 1).padStart(3, "0")}`,
  locationId: `location-${index % 5}`,
  site: `Location ${index % 5}`,
}));
const largeResult = WeeklyLocationAggregator.aggregate(large);
assert.equal(largeResult.length, 5);
assert.equal(largeResult.reduce((sum, location) => sum + location.counts.total, 0), 125);

assert.equal(WeeklyLocationAggregator.isWeekInProgress("2026-07-13", "2026-07-17"), true);
assert.equal(WeeklyLocationAggregator.isWeekInProgress("2026-07-13", "2026-07-20"), false);

console.log("weekly-location-aggregator: 13 scenarios passed");
