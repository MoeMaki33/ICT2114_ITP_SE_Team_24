const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const page = fs.readFileSync(path.join(__dirname, "../www/testpoint-view.php"), "utf8");
const controller = fs.readFileSync(path.join(__dirname, "../www/js/testpoint-view.js"), "utf8");
const weeklyView = fs.readFileSync(path.join(__dirname, "../www/js/test-point-weekly-view.js"), "utf8");
const locationView = fs.readFileSync(path.join(__dirname, "../www/js/test-point-location-view.js"), "utf8");
const repositories = fs.readFileSync(path.join(__dirname, "../www/js/repositories/supabase-repositories.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "../www/css/style.css"), "utf8");

const heroIndex = page.indexOf('id="detailHero"');
const trendNotesIndex = page.indexOf('class="detail-trend-notes-layout"');
const chartIndex = page.indexOf('class="card detail-chart-card"');
const notesIndex = page.indexOf('class="card detail-notes-card"');
const positionSummaryIndex = page.indexOf('class="detail-position-summary-layout"');
const environmentIndex = page.indexOf('class="card detail-environment-card"');
const positionIndex = page.indexOf('id="detailPositionPanel"');
const equipmentIndex = page.indexOf('class="card detail-equipment-card"');
const historyIndex = page.indexOf('id="detailHistoryDataTable"');
assert.ok(heroIndex < trendNotesIndex && trendNotesIndex < chartIndex && chartIndex < notesIndex);
assert.ok(notesIndex < positionSummaryIndex && positionSummaryIndex < environmentIndex && environmentIndex < positionIndex);
assert.ok(positionIndex < equipmentIndex && equipmentIndex < historyIndex);

assert.doesNotMatch(page, /detailWeeklyDailyChart|detail-weekly-trend-card/);
assert.doesNotMatch(page, /detailInfoCard|detail-summary-card/);
assert.equal((page.match(/id="detailHistoryChart"/g) || []).length, 1, "Protection Potential Trend chart ID must be unique");
assert.equal((page.match(/id="detailEnvironmentGrid"/g) || []).length, 1, "Environmental readings grid ID must be unique");
assert.match(page, /<article class="card detail-position-card"[\s\S]*?<\/article>\s*<\/section>/);
assert.doesNotMatch(weeklyView, /new (?:window\.)?Chart|this\.chart/);
assert.match(controller, /buildOverallDailyTrend/);
assert.match(controller, /spanGaps:\s*false/);
assert.match(controller, /Protection threshold/);
assert.doesNotMatch(controller, /readImportRowsFromFile\(file, \{ cellDates: true \}\)/);
assert.doesNotMatch(controller, /addImportMinuteOffset/);
assert.doesNotMatch(controller, /addImportSecondOffset/);
assert.doesNotMatch(controller, /23 seconds/);
assert.match(controller, /currentDetailWeeklyData/);
assert.match(controller, /resolveHeroWeeklyData/);
assert.match(controller, /buildDetailWeekHeroSnapshot/);
assert.match(controller, /historyEntries = currentAllHistoryEntries/);
assert.match(controller, /Latest selected-week reading/);
assert.match(controller, /Change this week/);
assert.match(controller, /Compared with previous week/);
assert.match(controller, /Reporting week/);
assert.match(controller, /summary\?\.readingCount/);
assert.match(controller, /selectedWeekTimestamp/);
assert.match(controller, /AppTrendPresentation\?\.getTrendPresentation/);
assert.doesNotMatch(controller, /function renderDetailHeroSection/);
assert.match(controller, /detailHistoryChartSummary/);
assert.match(controller, /pointRadius = model\.values\.filter/);

assert.match(weeklyView, /Weekly Potential/);
assert.match(weeklyView, /Protection Performance/);
assert.match(weeklyView, /Weekly Behaviour/);
assert.match(weeklyView, /Current protection status/);
assert.match(weeklyView, /iconClass/);
assert.match(weeklyView, /addIsoDays\(this\.week, -7\)/);
assert.match(weeklyView, /history\.replaceState/);

assert.match(controller, /UserRepository\(\)\.getUsersByIds/);
assert.match(repositories, /async getUsersByIds/);
assert.match(repositories, /full_name, email/);
assert.match(controller, /Manual Entry/);
assert.match(controller, /System Import/);
assert.match(controller, /Unknown User/);
assert.match(controller, /testPoint\?\.type === "variable"/);
assert.match(controller, /detailHistorySortKey = "sortDate"/);
assert.match(controller, /detailHistorySortDirection = "desc"/);
assert.match(controller, /powerValue/);

const expectedHeaders = ["Date", "Reading (mV)", "Status", "Temp", "Conductivity", "pH", "DO", "Power", "Recorded By", "Action"];
let previousHeaderIndex = -1;
expectedHeaders.forEach((header) => {
  const nextIndex = page.indexOf(`>${header}</th>`, previousHeaderIndex + 1);
  assert.ok(nextIndex > previousHeaderIndex, `${header} should follow the requested Reading History order`);
  previousHeaderIndex = nextIndex;
});

assert.match(locationView, /data-detail-position-view="gps"/);
assert.match(locationView, /data-detail-position-view="relative"/);
assert.match(locationView, /detail-relative-metrics/);
assert.match(locationView, /Position Not Configured/);
assert.doesNotMatch(locationView, /<dl>|Accuracy|Source/);
assert.ok(page.indexOf('id="detailPositionActions"') > page.indexOf('id="detailPositionMapState"'));

assert.match(controller, /Location note/);
assert.match(controller, /Test Point note/);
assert.match(controller, /fa-temperature-half/);
assert.match(controller, /fa-wave-square/);
assert.match(controller, /fa-flask/);
assert.match(controller, /fa-droplet/);
assert.match(styles, /grid-template-columns:\s*minmax\(0, 2fr\) minmax\(280px, \.75fr\)/);
assert.match(styles, /\.detail-position-summary-layout\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);[\s\S]*?align-items:\s*start/);
assert.match(styles, /@media \(max-width: 1120px\)[\s\S]*?\.detail-position-summary-layout\s*\{\s*grid-template-columns:\s*1fr/);
assert.match(styles, /@media \(max-width: 430px\)[\s\S]*?\.detail-page \.detail-environment-grid\s*\{\s*grid-template-columns:\s*1fr/);
assert.match(styles, /\.detail-notes-body[\s\S]*overflow-y:\s*auto/);

console.log("testpoint-detail-redesign: restored hero, environment/map hierarchy, unique chart IDs, history, equipment, notes and position modes passed");
