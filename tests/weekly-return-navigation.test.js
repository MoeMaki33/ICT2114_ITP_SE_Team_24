const assert = require("node:assert/strict");

global.window = { addEventListener: () => {} };
global.location = {
  href: "http://127.0.0.1:5500/weekly.php?week=2026-03-23&location=abc&view=testpoints&drilldownMode=attention&drilldownSource=location-card&page=3&rowsPerPage=50&sortKey=latestReading&sortDirection=desc",
  origin: "http://127.0.0.1:5500",
  pathname: "/weekly.php",
  search: "?week=2026-03-23&location=abc&view=testpoints&drilldownMode=attention&drilldownSource=location-card&page=3&rowsPerPage=50&sortKey=latestReading&sortDirection=desc",
};
global.history = { state: { page: "weekly.php" }, replaceState: () => {}, length: 2 };
global.document = {
  readyState: "loading",
  addEventListener: () => {},
  querySelectorAll: () => [],
};

require("../www/js/navigation-controller.js");

const detailUrl = window.AppNavigation.buildTestPointDetailUrl("point-uuid", {
  returnTo: "weekly.php",
  returnSearch: location.search,
});
const detailParams = new URL(detailUrl, location.href).searchParams;
assert.equal(detailParams.get("returnTo"), "weekly.php");
assert.match(detailParams.get("returnSearch"), /drilldownMode=attention/);
assert.match(detailParams.get("returnSearch"), /drilldownSource=location-card/);
assert.match(detailParams.get("returnSearch"), /page=3/);
assert.match(detailParams.get("returnSearch"), /sortKey=latestReading/);

const returnContext = window.AppNavigation.getTestPointReturnContext(`?id=point-uuid&returnTo=weekly.php&returnSearch=${encodeURIComponent(detailParams.get("returnSearch"))}`);
assert.equal(returnContext.label, "Weekly Summary");
assert.match(returnContext.url, /^weekly\.php\?/);
assert.match(returnContext.url, /rowsPerPage=50/);

const rejected = window.AppNavigation.getTestPointReturnContext("?id=point-uuid&returnTo=https%3A%2F%2Fevil.example%2Fsteal");
assert.equal(rejected.url, "testpoints.php");

console.log("weekly-return-navigation: exact Weekly Summary return state and external-target rejection passed");
