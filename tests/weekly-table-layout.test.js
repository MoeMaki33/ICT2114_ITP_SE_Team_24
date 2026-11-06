const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const php = fs.readFileSync(path.join(__dirname, "../www/weekly.php"), "utf8");
const controller = fs.readFileSync(path.join(__dirname, "../www/js/weekly.js"), "utf8");
const mainHeader = php.match(/<table class="weekly-table app-table">[\s\S]*?<thead[^>]*><tr>([\s\S]*?)<\/tr><\/thead>/)?.[1] || "";
const attentionHeader = php.match(/<table class="weekly-attention-table app-table">[\s\S]*?<thead[^>]*><tr>([\s\S]*?)<\/tr><\/thead>/)?.[1] || "";

for (const removed of ["Name", "Reason", "Coordinate Type", "Start of Week", "Protected %", "Engineer", ">Trend<"]) {
  assert.doesNotMatch(mainHeader, new RegExp(removed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
for (const required of ["Test Point", "Location", "Latest", "Weekly Average", "Change This Week", "vs Previous Week", "Protection Status", "Threshold Crossings", "Last Updated", "Action"]) {
  assert.match(mainHeader, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.match(attentionHeader, /Reason/);
assert.match(attentionHeader, /Change This Week/);
assert.doesNotMatch(php, /comparisonWeekSelector/);
assert.match(php, /weeklyPreviousWeek/);
assert.match(php, /weeklyNextWeek/);
assert.match(php, /weeklyComparisonLabel/);
assert.doesNotMatch(php, /weeklyLoadStatus|refreshWeekly/);
assert.doesNotMatch(controller, /weeklyLoadStatus|refreshWeekly|elements\.refresh|elements\.loadStatus/);
assert.match(controller, /page:\s*document\.querySelector\("\.weekly-page"\)/);
assert.match(controller, /setLoading\(loading\)[\s\S]*?aria-busy/);
assert.doesNotMatch(php, /weeklyDrilldownReason|weekly-drilldown-reason/);
assert.doesNotMatch(controller, /drilldownReason|weeklyDrilldownReason/);
const drilldownMetricMarkup = controller.match(/this\.elements\.drilldownMetrics\.innerHTML = ([^;]+);/)?.[1] || "";
assert.match(drilldownMetricMarkup, /Supporting weighted average/);
for (const repeatedMetric of ["Visible", "Protected of known", "Crossings", "Declining", "No Data"]) {
  assert.doesNotMatch(drilldownMetricMarkup, new RegExp(repeatedMetric));
}

console.log("weekly-table-layout: simplified columns, compact weighted-average drill-down and automatic week controls passed");
