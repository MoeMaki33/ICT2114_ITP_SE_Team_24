const assert = require("node:assert/strict");

global.window = {};
global.document = { readyState: "loading", addEventListener: () => {} };
global.location = {
  pathname: "/weekly.php",
  href: "http://127.0.0.1:5500/weekly.php",
  search: "",
};
let writtenUrl = "";
global.history = {
  state: { page: "weekly.php" },
  replaceState: (_state, _title, url) => { writtenUrl = String(url); },
};

require("../www/js/weekly.js");
const WeeklyUrlState = window.WeeklyUrlState;

const parsed = WeeklyUrlState.read("?week=2026-03-23&comparisonWeek=2026-03-02&location=abc&status=Warning&search=TP-1&view=testpoints&drilldownMode=attention&drilldownSource=location-card&page=3&rowsPerPage=50&sortKey=latestReading&sortDirection=desc&attentionOnly=1&decliningOnly=1");
assert.deepEqual(parsed, {
  week: "2026-03-23",
  view: "testpoints",
  drilldownMode: "attention",
  drilldownSource: "location-card",
  search: "TP-1",
  location: "abc",
  status: "Warning",
  attentionOnly: true,
  decliningOnly: true,
  page: 3,
  rows: 50,
  sort: "latestReading",
  direction: "desc",
});

const sanitized = WeeklyUrlState.read("?week=2026-02-31&comparisonWeek=not-a-date&location=https%3A%2F%2Fevil.example&view=bad&drilldownMode=bad&drilldownSource=bad&status=bad&page=-4&rowsPerPage=999&sortKey=__bad__&sortDirection=bad");
assert.equal(sanitized.week, "");
assert.equal(sanitized.location, "");
assert.equal(sanitized.view, "overview");
assert.equal(sanitized.drilldownMode, "all");
assert.equal(sanitized.drilldownSource, null);
assert.equal(sanitized.status, "");
assert.equal(sanitized.page, 1);
assert.equal(sanitized.rows, 25);
assert.equal(sanitized.sort, "severity");
assert.equal(sanitized.direction, "asc");

WeeklyUrlState.write(parsed);
assert.doesNotMatch(writtenUrl, /comparisonWeek|comparison=/);
assert.match(writtenUrl, /rowsPerPage=50/);
assert.match(writtenUrl, /sortKey=latestReading/);
assert.match(writtenUrl, /drilldownMode=attention/);
assert.match(writtenUrl, /drilldownSource=location-card/);
assert.match(writtenUrl, /attentionOnly=1/);
assert.doesNotMatch(writtenUrl, /[?&]rows=/);

console.log("weekly-url-state: parsing, sanitisation and round-trip parameter names passed");
