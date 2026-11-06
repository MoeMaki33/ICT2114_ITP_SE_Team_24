const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

const page = read("www/testpoints.php");
const controller = read("www/js/testpoints.js");
const repository = read("www/js/repositories/supabase-repositories.js");

assert.match(page, /Create, manage and organise corrosion monitoring Test Points across Locations\./);
assert.match(page, /Search by Test Point or Location/);
assert.match(page, /<label>Location <select id="testPointsLocationFilter">/);
assert.match(page, /<label for="tpLocationInput">Location<\/label>/);
assert.match(page, /<strong>Test Point Label<\/strong> and <strong>Location<\/strong>/);
assert.doesNotMatch(page, /Asset \/ Site \/ Zone|Location Note|Location Description|tpSiteInput|tpLocationDescriptionInput/);

const compactHeaders = [
  "Test Point",
  "Location",
  "Latest Reading",
  "Weekly Average",
  "Change This Week",
  "Protection Status",
  "Last Updated",
  "Actions",
];
let previousHeaderIndex = -1;
for (const header of compactHeaders) {
  const index = page.indexOf(`>${header}</th>`);
  assert.ok(index > previousHeaderIndex, `${header} should appear in compact table order`);
  previousHeaderIndex = index;
}

for (const optionalColumn of ["Type", "Threshold", "Test Point Note", "Coordinates", "Assigned Engineer", "Active"]) {
  assert.match(controller, new RegExp(`label: "${optionalColumn}"`), `${optionalColumn} should remain available through column visibility`);
}

assert.doesNotMatch(controller, /function getAsset\(|function getSite\(|function getZone\(|function getLocationPath\(/);
assert.doesNotMatch(controller, /locationNote|zoneName|tpSiteInput|tpLocationDescriptionInput|TEST_POINT_READINGS_TABLE|READING_BATCHES_TABLE/);
assert.match(controller, /function getLocationName\(point\)/);
assert.match(controller, /TEST_POINT_VISIBLE_COLUMNS_STORAGE_KEY = "testPointsVisibleColumns:v5"/);
assert.match(controller, /const usesLocationColumn = "Location" in firstRow/);
assert.match(controller, /usesLocationColumn \? row\.Location : row\["Site Name"\]/);
assert.match(controller, /WeeklySummaryRepository/);
assert.match(controller, /getAvailableWeeks\(40\)/);
assert.match(controller, /getWeeklySummaries\(/);
assert.match(controller, /summary\.testPointUuid/);
assert.match(controller, /weeklyByPointId\.get\(String\(row\.id\)\)/);
assert.match(controller, /weeklyAverage: parseReadingValue/);
assert.match(controller, /changeFromStart: parseReadingValue/);
assert.match(controller, /AppTrendPresentation\?\.renderTrendValue/);
assert.match(controller, /\["thresholdMv", "latestReadingValue", "weeklyAverage", "changeFromStart", "lastUpdated"\]/);
assert.ok(controller.indexOf("sortTestPointRows(getFilteredTestPoints())") < controller.indexOf("filteredPoints.slice("), "sorting should happen before pagination");
assert.doesNotMatch(controller, /\.insert\(\{[\s\S]{0,160}description:/);

assert.match(repository, /class WeeklySummaryRepository/);
assert.match(repository, /async getAvailableWeeks/);
assert.match(repository, /async getWeeklySummaries/);
assert.ok(page.indexOf("js/trend-presentation.js") < page.indexOf("js/testpoints.js"), "trend presentation must load before the Test Points controller");

console.log("testpoints-management-refinement: terminology, weekly UUID join, compact table, import alias and sorting passed");
