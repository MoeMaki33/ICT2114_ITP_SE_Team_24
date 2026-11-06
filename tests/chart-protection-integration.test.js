const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

const pages = ["dashboard", "weekly", "history", "testpoint-view"];

test("direct and SPA page loads place the shared protection helper before chart controllers", () => {
  const navigation = read("www/js/navigation-controller.js");
  pages.forEach((page) => {
    const pageSource = read(`www/${page}.php`);
    assert.match(pageSource, /chart-protection-presentation\.js/);
    const chartJsIndex = pageSource.indexOf("https://cdn.jsdelivr.net/npm/chart.js");
    const animationIndex = pageSource.indexOf("chart-animation.js");
    const protectionIndex = pageSource.indexOf("chart-protection-presentation.js");
    assert.ok(chartJsIndex >= 0 && animationIndex > chartJsIndex && protectionIndex > animationIndex, `${page}.php Chart.js and helper order should be stable`);

    const dependencies = navigation.match(new RegExp(`"${page.replace(".", "\\.")}\\.php": \\[(.*?)\\]`))?.[1] || "";
    assert.ok(dependencies.indexOf("chart-protection-presentation.js") >= 0, `${page}.php needs the helper during SPA navigation`);
  });
});

test("single-Test-Point chart uses threshold-aware segments and no blue area fill", () => {
  const source = read("www/js/testpoint-view.js");
  assert.match(source, /createSinglePointDatasetStyle/);
  assert.match(source, /applyToChartConfig/);
  assert.match(source, /AppStatus\?\.deriveProtectionStatus/);
  assert.doesNotMatch(source, /backgroundColor: "rgba\(0, 115, 188, 0\.10\)"/);
  assert.doesNotMatch(source, /label: `Protection threshold/);
});

test("aggregate potential charts receive supporting zones without recolouring their lines", () => {
  const weekly = read("www/js/weekly.js");
  const weeklyTrend = read("www/js/weekly-daily-trend.js");
  const dashboard = read("www/js/dashboard.js");
  const history = read("www/js/history.js");

  assert.match(weekly, /applyToChartConfig\?\.\(trendConfig, thresholdReference\)/);
  assert.match(weekly, /renderLegend\?\.\(/);
  assert.doesNotMatch(weekly, /weeklyTrendChartSummary|trendSummary/);
  assert.match(weeklyTrend, /borderColor: "#315f88"/);
  assert.match(weeklyTrend, /fill: false/);

  assert.match(dashboard, /borderColor: dashboardLocationColor\(index\)/);
  assert.match(dashboard, /applyToChartConfig\?\.\(trendConfig, thresholdReference\)/);
  assert.doesNotMatch(dashboard, /dashboardThresholdPlugin/);

  assert.match(history, /applyToChartConfig\?\.\(trendConfig, thresholdReference\)/);
  assert.match(history, /thresholdMvSnapshot/);
  assert.doesNotMatch(history, /historyThresholdPlugin/);
});

test("categorical and environmental charts remain outside protection-zone presentation", () => {
  const weekly = read("www/js/weekly.js");
  const dashboard = read("www/js/dashboard.js");
  const history = read("www/js/history.js");

  const weeklyStatusStart = weekly.indexOf("const statusCanvas = document.getElementById(\"assetStatusChart\")");
  const weeklyStatusEnd = weekly.indexOf("openTestPoint(testPointId)");
  assert.doesNotMatch(weekly.slice(weeklyStatusStart, weeklyStatusEnd), /applyToChartConfig/);

  const dashboardLocationStart = dashboard.indexOf("const locationCanvas");
  const dashboardLocationEnd = dashboard.indexOf("function dashboardTrendOptions");
  assert.doesNotMatch(dashboard.slice(dashboardLocationStart, dashboardLocationEnd), /applyToChartConfig/);

  const environmentStart = history.indexOf("function renderEnvironmentalChart");
  const historyMainStart = history.indexOf("function renderHistoryCharts");
  assert.doesNotMatch(history.slice(environmentStart, historyMainStart), /AppChartProtectionPresentation|applyToChartConfig/);
  assert.match(history.slice(environmentStart, historyMainStart), /historyPhReferencePlugin/);
});

test("potential chart legends communicate zones as text rather than colour alone", () => {
  const pageMarkup = pages.map((page) => read(`www/${page}.php`)).join("\n");
  assert.equal((pageMarkup.match(/chart-zone-legend/g) || []).length, 4);
  assert.match(read("www/css/style.css"), /\.chart-zone-swatch\.protected/);
  assert.match(read("www/css/style.css"), /\.chart-zone-swatch\.above/);
});
