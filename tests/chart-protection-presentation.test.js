const test = require("node:test");
const assert = require("node:assert/strict");

const presentation = require("../www/js/chart-protection-presentation.js");

test("threshold equality and more-negative values belong to the protected zone", () => {
  assert.equal(presentation.isProtectedValue(-850, -850), true);
  assert.equal(presentation.isProtectedValue(-900, -850), true);
  assert.equal(presentation.getPointColor(-850, -850), presentation.COLORS.protectedLine);
  assert.equal(presentation.getPointColor(-900, -850), presentation.COLORS.protectedLine);
});

test("less-negative values belong to the above-threshold zone without being relabelled", () => {
  assert.equal(presentation.isProtectedValue(-800, -850), false);
  assert.equal(presentation.getPointColor(-800, -850), presentation.COLORS.aboveLine);
  const labels = presentation.getZoneLabels({ thresholdMv: -850, definitive: true });
  assert.match(labels.above, /Above protection threshold/);
  assert.doesNotMatch(labels.above, /Unprotected/);
});

test("custom Test Point thresholds cannot override points, datasets or labels", () => {
  const reference = presentation.resolveThresholdReference([-900]);
  const style = presentation.createSinglePointDatasetStyle(-900);
  assert.equal(reference.thresholdMv, -850);
  assert.equal(reference.definitive, true);
  assert.equal(style.spanGaps, false);
  assert.equal(style.fill, false);
  assert.equal(style.pointBackgroundColor({ raw: -900 }), presentation.COLORS.protectedLine);
  assert.equal(style.pointBackgroundColor({ raw: -899 }), presentation.COLORS.protectedLine);
  assert.equal(style.pointBackgroundColor({ raw: -849 }), presentation.COLORS.aboveLine);
  assert.match(presentation.getZoneLabels(reference).threshold, /-850 mV/);
});

test("null values remain transparent gaps", () => {
  const style = presentation.createSinglePointDatasetStyle(-850);
  assert.equal(presentation.isProtectedValue(null, -850), null);
  assert.equal(style.pointBackgroundColor({ raw: null }), presentation.COLORS.transparent);
  assert.equal(style.spanGaps, false);
});

test("crossing segments use a threshold-aligned gradient in both directions", () => {
  const stops = [];
  const gradient = { addColorStop: (offset, color) => stops.push([offset, color]) };
  const chart = {
    chartArea: { top: 0, bottom: 100 },
    scales: { y: { getPixelForValue: () => 50 } },
    ctx: { createLinearGradient: () => gradient },
  };
  const downward = presentation.getSegmentBorderColor({
    chart,
    p0: { parsed: { y: -800 } },
    p1: { parsed: { y: -900 } },
  }, -850);
  const upward = presentation.getSegmentBorderColor({
    chart,
    p0: { parsed: { y: -900 } },
    p1: { parsed: { y: -800 } },
  }, -850);
  assert.equal(downward, gradient);
  assert.equal(upward, gradient);
  assert.deepEqual(stops.slice(0, 4), [
    [0, presentation.COLORS.aboveLine],
    [0.5, presentation.COLORS.aboveLine],
    [0.5, presentation.COLORS.protectedLine],
    [1, presentation.COLORS.protectedLine],
  ]);
});

test("same-side segments remain solid", () => {
  assert.equal(presentation.getSegmentBorderColor({
    p0: { parsed: { y: -900 } }, p1: { parsed: { y: -875 } },
  }, -850), presentation.COLORS.protectedLine);
  assert.equal(presentation.getSegmentBorderColor({
    p0: { parsed: { y: -840 } }, p1: { parsed: { y: -800 } },
  }, -850), presentation.COLORS.aboveLine);
});

test("mixed historical thresholds use the fixed system threshold", () => {
  const reference = presentation.resolveThresholdReference([-850, -900, -850], -850);
  const labels = presentation.getZoneLabels(reference);
  assert.equal(reference.thresholdMv, -850);
  assert.equal(reference.definitive, true);
  assert.equal(reference.source, "fixed");
  assert.match(labels.protected, /Protected zone/);
  assert.doesNotMatch(labels.note, /different thresholds/);
});

test("chart configuration enforces the fixed threshold and only one shared plugin", () => {
  const config = { options: { plugins: {} }, plugins: [] };
  presentation.applyToChartConfig(config, { thresholdMv: -875, definitive: true });
  assert.equal(config.plugins.length, 1);
  assert.equal(config.plugins[0].id, presentation.PLUGIN_ID);
  assert.equal(config.options.plugins[presentation.PLUGIN_ID].thresholdMv, -850);
  presentation.applyToChartConfig(config, { thresholdMv: -900, definitive: true });
  assert.equal(config.plugins.length, 1);
  assert.equal(config.options.plugins[presentation.PLUGIN_ID].thresholdMv, -850);
});

test("zone plugin derives fresh threshold pixels on every draw", () => {
  let thresholdPixel = 35;
  const fills = [];
  const context = {
    save() {}, restore() {},
    fillRect(...args) { fills.push(args); },
  };
  const chart = {
    chartArea: { left: 10, right: 110, top: 5, bottom: 105 },
    scales: { y: { getPixelForValue: () => thresholdPixel } },
    ctx: context,
  };
  presentation.zonePlugin.beforeDraw(chart, {}, { thresholdMv: -850 });
  thresholdPixel = 65;
  presentation.zonePlugin.beforeDraw(chart, {}, { thresholdMv: -850 });
  assert.deepEqual(fills.map((fill) => fill.slice(1)), [
    [5, 100, 30], [35, 100, 70],
    [5, 100, 60], [65, 100, 40],
  ]);
});
