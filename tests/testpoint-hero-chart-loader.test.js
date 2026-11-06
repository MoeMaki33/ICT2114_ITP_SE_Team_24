const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

const page = read("www/testpoint-view.php");
const controller = read("www/js/testpoint-view.js");
const navigation = read("www/js/navigation-controller.js");
const styles = read("www/css/style.css");

assert.match(page, /<section class="detail-hero" id="detailHero"><\/section>/);
for (const heroContent of ["Latest selected-week reading", "Change this week", "Compared with previous week", "Reporting week"]) {
  assert.match(controller, new RegExp(heroContent));
}
assert.match(controller, /hero\.innerHTML = `[\s\S]*detail-hero-top[\s\S]*detail-hero-overview/);
assert.doesNotMatch(controller, /function renderDetailHeroSection/);
assert.match(styles, /\.detail-page \.detail-hero\s*\{[\s\S]*?display:\s*block;[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;/);
assert.match(styles, /\.detail-page \.detail-hero-top\s*\{[\s\S]*?margin-bottom:\s*20px;/);
assert.match(styles, /\.detail-page \.detail-hero-top\s*\{[\s\S]*?justify-content:\s*space-between;/);
assert.match(styles, /\.detail-page \.detail-hero-actions\s*\{[\s\S]*?margin-left:\s*auto;/);
assert.match(controller, /detail-hero-overview[\s\S]*detail-hero-metrics-group[\s\S]*Latest selected-week reading[\s\S]*Change this week[\s\S]*Compared with previous week[\s\S]*detail-hero-period/);
assert.match(styles, /\.detail-hero-overview\s*\{[\s\S]*?display:\s*flex;[\s\S]*?justify-content:\s*space-between;/);
assert.match(styles, /\.detail-hero-metrics-group\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
assert.match(styles, /\.detail-hero-period\s*\{[\s\S]*?flex:\s*0 1 34%;[\s\S]*?min-width:\s*280px/);
assert.match(styles, /\.detail-hero-metric strong\s*\{[\s\S]*?white-space:\s*nowrap;/);
assert.match(styles, /@media \(max-width: 1120px\)[\s\S]*?\.detail-hero-overview\s*\{\s*flex-direction:\s*column/);
assert.match(styles, /@media \(max-width: 768px\)[\s\S]*?\.detail-page \.detail-hero-top\s*\{[\s\S]*?flex-direction:\s*column/);
assert.match(styles, /@media \(max-width: 700px\)[\s\S]*?\.detail-hero-metrics-group\s*\{\s*grid-template-columns:\s*1fr/);
assert.match(styles, /@media \(max-width: 430px\)[\s\S]*?\.detail-page \.detail-hero-actions\s*\{[^}]*grid-template-columns:\s*1fr/);

assert.match(navigation, /CHART_JS_CDN_SRC = "https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js"/);
for (const chartPage of ["dashboard.php", "weekly.php", "history.php"]) {
  assert.match(navigation, new RegExp(`"${chartPage.replace(".", "\\.")}": \\[CHART_JS_DEPENDENCY\\]`));
}
assert.match(navigation, /XLSX_CDN_SRC = "https:\/\/cdn\.sheetjs\.com\/xlsx-0\.20\.3\/package\/dist\/xlsx\.full\.min\.js"/);
assert.match(navigation, /"testpoints\.php": \[XLSX_DEPENDENCY\]/);
assert.match(navigation, /"testpoint-view\.php": \[CHART_JS_DEPENDENCY, XLSX_DEPENDENCY\]/);
assert.match(navigation, /isReady:\s*\(\) => typeof window\.Chart === "function"/);
assert.match(navigation, /isReady:\s*\(\) => typeof window\.XLSX\?\.read === "function" && typeof window\.XLSX\?\.utils\?\.sheet_to_json === "function"/);
assert.match(navigation, /scriptUrl\.origin === targetUrl\.origin && scriptUrl\.pathname === targetUrl\.pathname/);
assert.match(navigation, /script\.onload = \(\) => \{[\s\S]*?isReady && !isReady\(\)/);
assert.match(navigation, /scriptLoadPromises\.has\(scriptIdentity\)/);
assert.match(navigation, /async function ensurePageScripts\(page\) \{\s*await ensurePageDependencies\(page\);/);
assert.ok(
  navigation.indexOf("await ensurePageScripts(page)") < navigation.indexOf("PAGE_LIFECYCLES[page]?.init?.()"),
  "external and local dependencies must load before page lifecycle initialisation",
);
assert.match(navigation, /src\.endsWith\("app-config\.local\.js"\)/);

assert.match(page, /https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js/);
assert.match(controller, /currentDetailHistoryChart\?\.destroy\(\)[\s\S]*?new window\.Chart/);
assert.match(controller, /Protection Potential Trend could not be rendered because Chart\.js is unavailable/);
assert.match(controller, /try \{[\s\S]*?const chartConfig = \{/);
assert.match(controller, /currentDetailHistoryChart = new window\.Chart\(canvas, chartConfig\)/);
assert.match(controller, /Protection Potential Trend chart creation failed:/);
assert.match(controller, /AppChartAnimation\?\.getEntranceAnimation/);
assert.match(controller, /spanGaps:\s*false/);
assert.match(controller, /labels:\s*model\.dates\.map\(formatDetailChartDateLabel\)/);
assert.match(controller, /formatDetailChartDateLabel[\s\S]*?day:\s*"numeric"[\s\S]*?month:\s*"short"/);

console.log("testpoint-hero-chart-loader: full-width responsive hero and ordered one-time Chart.js dependency loading passed");
