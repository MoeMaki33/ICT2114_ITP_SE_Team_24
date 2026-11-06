const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

const originalMatchMedia = globalThis.matchMedia;
const originalPreferences = globalThis.AppPreferences;
try {
  globalThis.matchMedia = () => ({ matches: false });
  delete require.cache[require.resolve("../www/js/chart-animation.js")];
  const AppChartAnimation = require("../www/js/chart-animation.js");
  assert.deepEqual(AppChartAnimation.getEntranceAnimation(), {
    duration: 750,
    easing: "easeOutQuart",
  });

  globalThis.matchMedia = () => ({ matches: true });
  assert.equal(AppChartAnimation.prefersReducedMotion(), true);
  assert.equal(AppChartAnimation.getEntranceAnimation(), false);

  globalThis.matchMedia = () => ({ matches: false });
  globalThis.AppPreferences = { getCurrent: () => ({ chartMotion: "reduced" }) };
  assert.equal(AppChartAnimation.prefersReducedMotion(), true);
  assert.equal(AppChartAnimation.getEntranceAnimation(), false, "the application preference should disable chart motion");
} finally {
  if (originalMatchMedia === undefined) delete globalThis.matchMedia;
  else globalThis.matchMedia = originalMatchMedia;
  if (originalPreferences === undefined) delete globalThis.AppPreferences;
  else globalThis.AppPreferences = originalPreferences;
}

const chartFiles = [
  ["www/js/dashboard.js", 2],
  ["www/js/weekly.js", 2],
  ["www/js/history.js", 2],
  ["www/js/testpoint-view.js", 2],
];

for (const [file, expectedCreationPaths] of chartFiles) {
  const source = read(file);
  const chartCreations = [...source.matchAll(/new (?:window\.)?Chart\s*\(/g)].length;
  const sharedAnimations = [...source.matchAll(/AppChartAnimation\?\.getEntranceAnimation/g)].length;
  assert.equal(chartCreations, expectedCreationPaths, `${file} Chart.js creation paths should remain accounted for`);
  assert.equal(sharedAnimations, expectedCreationPaths, `${file} should apply shared animation to every Chart.js creation path`);
}

for (const page of ["dashboard", "weekly", "history", "testpoint-view"]) {
  const pageSource = read(`www/${page}.php`);
  assert.match(pageSource, /js\/chart-animation\.js/, `${page}.php should load the shared animation helper`);
  assert.match(pageSource, /js\/chart-protection-presentation\.js/, `${page}.php should load the shared protection helper`);
}

const navigation = read("www/js/navigation-controller.js");
for (const page of ["dashboard.php", "weekly.php", "history.php", "testpoint-view.php"]) {
  const dependencies = navigation.match(new RegExp(`"${page.replace(".", "\\.")}": \\[(.*?)\\]`))?.[1] || "";
  assert.match(dependencies, /js\/chart-animation\.js/, `${page} SPA dependencies should load the shared helper`);
  assert.match(dependencies, /js\/chart-protection-presentation\.js/, `${page} SPA dependencies should load the shared protection helper`);
}

console.log("chart-animation: shared entrance animation, reduced motion and all Chart.js creation paths passed");
