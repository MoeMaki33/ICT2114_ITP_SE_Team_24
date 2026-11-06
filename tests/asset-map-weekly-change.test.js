const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

const page = read("www/asset-map.php");
const controller = read("www/js/asset-map.js");
const navigation = read("www/js/navigation-controller.js");

assert.match(controller, /<th scope="col">Latest Reading<\/th>\s*<th scope="col">Change This Week<\/th>/);
assert.match(controller, /new window\.AppRepositories\.WeeklySummaryRepository/);
assert.match(controller, /getAvailableWeeks\(32\)/);
assert.match(controller, /getWeeklySummaries\(latestWeek\)/);
assert.match(controller, /String\(summary\.testPointUuid\)/, "weekly summaries must join by Test Point UUID");
assert.match(controller, /AppTrendPresentation\?\.renderTrendValue/);
assert.match(controller, /deltaMv: point\.changeFromStart/);
assert.match(controller, /semanticStatus: point\.statusChange/);
assert.match(controller, /context: "week"/);
assert.match(controller, /weekly changes could not be loaded[\s\S]*?return new Map\(\)/, "weekly failure must not block map data");
assert.match(page, /js\/trend-presentation\.js/);
assert.match(navigation, /"asset-map\.php": \[[^\]]*"js\/trend-presentation\.js", "js\/asset-map\.js"\]/);

console.log("asset-map-weekly-change: latest-week UUID join and shared trend presentation passed");
