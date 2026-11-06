const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildOverallDailyTrend,
  buildDailyTrendFromReadings,
  calculateYAxisBounds,
  createOverallChartConfig,
} = require("../www/js/weekly-daily-trend.js");

const WEEK_START = "2026-07-13";
const POINT_A = "b52d15ee-ebdc-44ae-ac94-bfade73ed1fb";
const POINT_B = "135c1e2b-b724-4403-8907-c2b6e815ff3b";

function row(testPointId, readingDate, dailyAverage, readingCount = 3) {
  return { testPointId, readingDate, dailyAverage, readingCount };
}

test("daily trend renders all seven reading-count-weighted days", () => {
  const dailySummaries = Array.from({ length: 7 }, (_, day) => [
    row(POINT_A, `2026-07-${String(13 + day).padStart(2, "0")}`, -900 - day, 1),
    row(POINT_B, `2026-07-${String(13 + day).padStart(2, "0")}`, -930 - day, 3),
  ]).flat();
  const model = buildOverallDailyTrend({
    weekStart: WEEK_START,
    dailySummaries,
    visibleTestPointIds: new Set([POINT_A, POINT_B]),
  });
  assert.equal(model.reportedDayCount, 7);
  assert.equal(model.values[0], -922.5);
  assert.equal(model.values[6], -928.5);
});

test("one daily summary produces one visible point and six true gaps", () => {
  const model = buildOverallDailyTrend({
    weekStart: WEEK_START,
    dailySummaries: [row(POINT_A, WEEK_START, -879, 1)],
    visibleTestPointIds: new Set([POINT_A]),
  });
  assert.deepEqual(model.values, [-879, null, null, null, null, null, null]);
  assert.equal(model.reportedDayCount, 1);
  const config = createOverallChartConfig(model);
  assert.equal(config.data.datasets[0].pointRadius, 6);
  assert.equal(config.data.datasets[0].spanGaps, false);
});

test("missing days remain null and are never converted to zero", () => {
  const model = buildOverallDailyTrend({
    weekStart: WEEK_START,
    dailySummaries: [
      row(POINT_A, "2026-07-13", -900),
      row(POINT_A, "2026-07-15", -910),
      row(POINT_A, "2026-07-18", -920),
    ],
    visibleTestPointIds: new Set([POINT_A]),
  });
  assert.deepEqual(model.values, [-900, null, -910, null, null, -920, null]);
  assert.equal(model.values.includes(0), false);
});

test("valid empty results are represented as no data", () => {
  const model = buildOverallDailyTrend({ weekStart: WEEK_START, dailySummaries: [] });
  assert.equal(model.hasData, false);
  assert.equal(model.reportedDayCount, 0);
  assert.deepEqual(model.values, [null, null, null, null, null, null, null]);
});

test("daily and weekly data match by UUID rather than display label", () => {
  const model = buildOverallDailyTrend({
    weekStart: WEEK_START,
    dailySummaries: [
      { ...row(POINT_A, WEEK_START, -879, 1), testPointDisplayId: "DuplicateLabel" },
      { ...row(POINT_B, WEEK_START, -950, 5), testPointDisplayId: "DuplicateLabel" },
    ],
    visibleTestPointIds: new Set([POINT_A]),
  });
  assert.equal(model.matchedRowCount, 1);
  assert.equal(model.values[0], -879);
});

test("raw readings can backfill a weekly daily trend when daily summaries lag behind", () => {
  const model = buildDailyTrendFromReadings({
    weekStart: WEEK_START,
    readings: [
      { readingValue: -905, sortDate: "2026-07-13T00:15:00+08:00" },
      { readingValue: -895, sortDate: "2026-07-13T08:15:00+08:00" },
      { readingValue: -910, sortDate: "2026-07-15T11:45:00+08:00" },
      { readingValue: -999, sortDate: "2026-07-21T10:00:00+08:00" },
    ],
    thresholdMv: -850,
  });
  assert.deepEqual(model.values, [-900, null, -910, null, null, null, null]);
  assert.equal(model.reportedDayCount, 2);
  assert.equal(model.hasData, true);
});

test("negative millivolt bounds include the point and threshold with padding", () => {
  const bounds = calculateYAxisBounds([-879], -850, 40);
  assert.deepEqual(bounds, { min: -920, max: -810 });
  assert.ok(bounds.min < -879);
  assert.ok(bounds.max > -850);
});

test("chart configuration keeps the supporting average neutral and never spans gaps", () => {
  const model = buildOverallDailyTrend({
    weekStart: WEEK_START,
    dailySummaries: [row(POINT_A, WEEK_START, -879, 1)],
    visibleTestPointIds: new Set([POINT_A]),
    thresholdMv: -850,
  });
  const config = createOverallChartConfig(model);
  assert.equal(config.data.datasets.length, 1);
  assert.equal(config.data.datasets[0].borderColor, "#315f88");
  assert.equal(config.data.datasets[0].fill, false);
  assert.equal(config.data.datasets[0].spanGaps, false);
  assert.deepEqual(model.thresholdValues, [-850, -850, -850, -850, -850, -850, -850]);
  assert.deepEqual(config.options.scales.y, {
    min: -920,
    max: -810,
    title: { display: true, text: "mV" },
  });
});
