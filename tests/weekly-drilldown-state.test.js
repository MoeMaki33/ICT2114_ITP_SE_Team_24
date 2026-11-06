const assert = require("node:assert/strict");

global.window = {};
global.document = { readyState: "loading", addEventListener: () => {} };
global.location = { pathname: "/weekly.php", href: "http://127.0.0.1:5500/weekly.php", search: "" };
global.history = { state: {}, replaceState: () => {} };

require("../www/js/weekly.js");

const locationCardState = {
  week: "2026-07-13",
  search: "JBN",
  status: "Warning",
  decliningOnly: true,
  location: "",
  attentionOnly: false,
  drilldownMode: "all",
  drilldownSource: null,
  view: "overview",
  page: 4,
};

window.WeeklyDrilldownState.enterLocationDrilldown(locationCardState, "jalan-besar", true);
assert.equal(locationCardState.location, "jalan-besar");
assert.equal(locationCardState.attentionOnly, true);
assert.equal(locationCardState.drilldownMode, "attention");
assert.equal(locationCardState.drilldownSource, "location-card");

window.WeeklyDrilldownState.exitLocationDrilldownState(locationCardState);
assert.equal(locationCardState.view, "overview");
assert.equal(locationCardState.location, "");
assert.equal(locationCardState.attentionOnly, false);
assert.equal(locationCardState.page, 1);
assert.equal(locationCardState.week, "2026-07-13");
assert.equal(locationCardState.search, "JBN");
assert.equal(locationCardState.status, "Warning");
assert.equal(locationCardState.decliningOnly, true);

const manualState = { view: "testpoints", location: "jalan-ban", attentionOnly: true, drilldownMode: "attention", drilldownSource: "manual", page: 3 };
window.WeeklyDrilldownState.exitLocationDrilldownState(manualState);
assert.equal(manualState.location, "jalan-ban", "manual Location filters remain when leaving Test Point View");
assert.equal(manualState.attentionOnly, true, "manual attention filters remain when leaving Test Point View");

assert.equal(window.WeeklyWeekNavigation.previousWeekStart("2026-07-13"), "2026-07-06");
assert.equal(window.WeeklyWeekNavigation.previousWeekStart("2026-01-05"), "2025-12-29");

console.log("weekly-drilldown-state: card exit, manual filters and automatic previous-week calculation passed");
