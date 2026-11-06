const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const page = fs.readFileSync(path.join(__dirname, "../www/dashboard.php"), "utf8");
const controller = fs.readFileSync(path.join(__dirname, "../www/js/dashboard.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "../www/css/style.css"), "utf8");
const navigation = fs.readFileSync(path.join(__dirname, "../www/js/navigation-controller.js"), "utf8");
const chartAnimation = fs.readFileSync(path.join(__dirname, "../www/js/chart-animation.js"), "utf8");

assert.match(page, /7-day Location averages — mV over time/);
assert.match(page, /Location Protection Overview/);
assert.doesNotMatch(page, /id="pipelineCards"|id="weeklyMiniChart"|priority-filter-pills|Week range/);
assert.doesNotMatch(page, />Name<|>Site<|>Zone<|>Asset</);
for (const header of ["ID", "Location", "Latest Reading", "Weekly Average", "Change This Week", "Protection Status", "Last Updated", "Action"]) {
  assert.match(page, new RegExp(`>${header}<`), `${header} should appear in the compact Dashboard table`);
}
assert.match(page, /dashboard-weekly-model\.js/);
assert.match(page, /chart-animation\.js/);
assert.match(page, /table-sort-controller\.js/);
assert.match(page, /weekly-location-aggregator\.js/);
assert.match(page, /trend-presentation\.js/);
assert.doesNotMatch(page, /weeklyMiniMetrics|weekly-mini-/);
assert.match(page, /dashboard-weekly-group--locations/);
assert.match(page, /dashboard-weekly-group--points/);
assert.match(page, /fa-location-dot/);
assert.match(page, /Location-level operational condition/);
assert.match(page, /fa-bullseye/);
assert.match(page, /Individual monitoring points/);

assert.doesNotMatch(controller, /renderPipelineCards|getCurrentWeekRange|getWeeklySummariesFromRows|weeklyMiniChart|priority-pill|\bHigh\b|\bMedium\b|\bLow\b/);
assert.doesNotMatch(controller, /weeklyMiniMetrics|weekly-mini-/);
assert.match(controller, /new repositories\.WeeklySummaryRepository/);
assert.match(controller, /DashboardWeeklyModel\.buildModel/);
assert.match(controller, /WeeklyLocationAggregator/);
assert.match(controller, /AppTrendPresentation/);
assert.match(controller, /new window\.TableSortController/);
assert.match(controller, /testPointUuid/);
assert.match(controller, /position: "bottom"/);
assert.equal([...controller.matchAll(/align: "center"/g)].length, 2, "both Dashboard chart legends should be centred");
assert.equal([...controller.matchAll(/usePointStyle: false, useBorderRadius: true, borderRadius: 4, boxWidth: 8, boxHeight: 8/g)].length, 2, "both Dashboard chart legends should use compact circular dots");
assert.doesNotMatch(page, /dashboardTrendChartSummary|dashboardLocationOverviewSummary|dashboard-chart-summary/);
assert.doesNotMatch(controller, /dashboardTrendChartSummary|dashboardLocationOverviewSummary|renderLocationOverviewSummary/);
assert.match(controller, /spanGaps: false/);
assert.doesNotMatch(controller, /function getDashboardChartAnimation\(\)/);
assert.match(chartAnimation, /prefers-reduced-motion: reduce/);
assert.match(chartAnimation, /if \(prefersReducedMotion\(\)\) return false/);
assert.match(chartAnimation, /duration: 750/);
assert.match(chartAnimation, /easing: "easeOutQuart"/);
assert.equal([...controller.matchAll(/AppChartAnimation\?\.getEntranceAnimation/g)].length, 2, "both Dashboard charts should share the application entrance animation");
assert.match(controller, /resizeDashboardCharts[\s\S]*?chart\?\.resize\?\.\(\)/);
assert.match(controller, /Supporting weighted average/);
assert.match(controller, /weekly\.php\?week=/);
assert.match(controller, /View details for/);
assert.doesNotMatch(styles, /\.weekly-mini-/);
assert.match(styles, /\.dashboard-weekly-group--points\s*\{[\s\S]*?border-left:/);
assert.match(styles, /@media \(max-width: 767px\)[\s\S]*?\.dashboard-weekly-group--points\s*\{[\s\S]*?border-top:[\s\S]*?border-left: 0/);
assert.match(navigation, /"dashboard\.php": \["js\/chart-animation\.js", "js\/chart-protection-presentation\.js", "js\/table-sort-controller\.js", "js\/trend-presentation\.js", "js\/weekly-location-aggregator\.js", "js\/dashboard-weekly-model\.js"/);

console.log("dashboard-weekly-integration: shared repositories, aggregator, trends, charts, table and navigation markup passed");
