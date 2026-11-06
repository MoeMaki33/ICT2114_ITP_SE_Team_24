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
    latestReading: -900,
    protectedPercentage: 100,
    readingCount: 10,
    thresholdCrossingCount: 0,
    changeFromStart: 0,
    ...overrides,
  };
}

const critical = WeeklyLocationAggregator.summarizeLocation([
  point({ testPointId: "TP-01", weeklyAverage: -1000, readingCount: 100 }),
  point({ testPointId: "TP-02", displayStatus: "Unprotected", latestReading: -750, weeklyAverage: -750 }),
]);
assert.equal(critical.condition, "Critical");
assert.match(critical.conditionReason, /Unprotected Test Point/);
assert.equal(critical.worstTestPoint.testPointId, "TP-02");

const separateSingleCrossings = WeeklyLocationAggregator.summarizeLocation([
  point({ testPointId: "TP-01", thresholdCrossingCount: 1 }),
  point({ testPointId: "TP-02", thresholdCrossingCount: 1 }),
  point({ testPointId: "TP-03", thresholdCrossingCount: 1 }),
]);
assert.equal(separateSingleCrossings.thresholdCrossingCount, 3);
assert.equal(separateSingleCrossings.repeatedCrossingPointCount, 0);
assert.equal(separateSingleCrossings.condition, "Protected", "three unrelated single crossings must not create a false Location alert");

const repeatedCrossings = WeeklyLocationAggregator.summarizeLocation([
  point({ testPointId: "TP-04", thresholdCrossingCount: 3 }),
]);
assert.equal(repeatedCrossings.condition, "Attention Required");
assert.match(repeatedCrossings.conditionReason, /repeated threshold crossings/);

const completeLocation = [
  point({ testPointId: "TP-01", displayStatus: "Protected" }),
  point({ testPointId: "TP-02", displayStatus: "Unprotected", latestReading: -750 }),
];
const protectedFilter = completeLocation.filter((summary) => summary.displayStatus === "Protected");
const filteredContext = WeeklyLocationAggregator.aggregateVisibleLocations(completeLocation, protectedFilter);
assert.equal(filteredContext.length, 1);
assert.equal(filteredContext[0].visibleCount, 1);
assert.equal(filteredContext[0].counts.total, 2);
assert.equal(filteredContext[0].condition, "Critical", "point filters must not rewrite the complete Location condition");
assert.match(filteredContext[0].conditionReason, /Unprotected Test Point/);
assert.equal(filteredContext[0].isFiltered, true);

assert.equal(
  WeeklyLocationAggregator.primaryAttentionReason(point({ displayStatus: "Warning" })),
  "Latest reading is in the Warning range",
);
assert.equal(
  WeeklyLocationAggregator.primaryAttentionReason(point({ statusChange: "Worsened" })),
  "Weekly trend is declining",
);

assert.deepEqual(
  WeeklyLocationAggregator.attentionReasons(point({ displayStatus: "Protected", statusChange: "Worsened", thresholdCrossingCount: 3 })),
  ["Weekly trend is declining", "3 threshold crossings were recorded"],
  "protection condition, trend and repeated crossings remain separate explanations",
);

console.log("weekly-user-flow-rules: condition reasons and drill-down priority rules passed");
