const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { AppSettings, Z_MODES } = require("../www/js/config/app-settings.js");
const { SUPABASE_CONFIG, resolveAppBaseUrl } = require("../www/js/config/supabase-config.js");

const WWW = path.join(__dirname, "..", "www");

// Values match the decision register (IMPLEMENTATION_PLAN.md §3, client answers of 5 Oct).
assert.equal(AppSettings.measurements.potential.unit, "mV");
assert.equal(AppSettings.measurements.current.unit, "A");
assert.equal(AppSettings.measurements.voltage.unit, "V");
assert.equal(AppSettings.measurements.power.mode, "calculated");
assert.equal(AppSettings.measurements.conductivity.unit, "µS/cm");
assert.equal(AppSettings.measurements.dissolvedOxygen.unit, "mg/L");
assert.equal(AppSettings.environment.changeWindow, "day");
assert.equal(AppSettings.schematic.units, "m");
assert.equal(AppSettings.schematic.zMode, "hidden");
assert.ok(Z_MODES.includes(AppSettings.schematic.zMode));
assert.equal(AppSettings.features.notifications, false);
assert.equal(AppSettings.environment.conductivityChangeRatio, 0.2);
assert.equal(AppSettings.environment.phChangeDelta, 0.5);
assert.equal(AppSettings.import.defaultTimeZone, "Asia/Singapore");

// Pages cannot change settings at runtime.
assert.ok(Object.isFrozen(AppSettings.measurements.conductivity));
assert.throws(() => {
  "use strict";
  AppSettings.features.notifications = true;
}, TypeError);

// Only the public publishable key may be configured for the browser.
assert.match(SUPABASE_CONFIG.url, /^https:\/\/[a-z0-9]+\.supabase\.co$/);
assert.match(SUPABASE_CONFIG.publishableKey, /^sb_publishable_/);

// PHP fallbacks stay equal to the browser config.
const configPhp = fs.readFileSync(path.join(WWW, "php", "config.php"), "utf8");
const phpFallback = (name) => configPhp.match(new RegExp(`define\\('${name}', getenv\\('${name}'\\) \\?: '([^']+)'\\)`))?.[1];
assert.equal(phpFallback("SUPABASE_URL"), SUPABASE_CONFIG.url);
assert.equal(phpFallback("SUPABASE_PUBLISHABLE_KEY"), SUPABASE_CONFIG.publishableKey);

// No other web file repeats the project URL or key.
const allowed = new Set([path.join(WWW, "js", "config", "supabase-config.js"), path.join(WWW, "php", "config.php")]);
const projectRef = new URL(SUPABASE_CONFIG.url).hostname.split(".")[0];
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walk(full);
    return /\.(js|php)$/.test(entry.name) ? [full] : [];
  });
}
const duplicates = walk(WWW)
  .filter((file) => !allowed.has(file))
  .filter((file) => {
    const text = fs.readFileSync(file, "utf8");
    return text.includes(projectRef) || text.includes(SUPABASE_CONFIG.publishableKey);
  })
  .map((file) => path.relative(WWW, file));
assert.deepEqual(duplicates, [], "Supabase URL/key literals belong only in js/config/supabase-config.js and php/config.php");

// Every page that creates the Supabase client loads the config first.
const pages = fs.readdirSync(WWW).filter((name) => name.endsWith(".php"));
for (const page of pages) {
  const html = fs.readFileSync(path.join(WWW, page), "utf8");
  const clientAt = html.indexOf("js/supabaseClient.js");
  if (clientAt === -1) continue;
  const configAt = html.indexOf("js/config/supabase-config.js");
  const settingsAt = html.indexOf("js/config/app-settings.js");
  assert.ok(configAt !== -1 && configAt < clientAt, `${page} must load js/config/supabase-config.js before js/supabaseClient.js`);
  assert.ok(settingsAt !== -1, `${page} must load js/config/app-settings.js`);
}

// Auth redirect base URL: page folder by default, no trailing slash.
assert.equal(resolveAppBaseUrl({ appBaseUrl: null }, { href: "http://localhost:5500/dashboard.php?x=1" }), "http://localhost:5500");
assert.equal(
  resolveAppBaseUrl({ appBaseUrl: null }, { href: "http://localhost/ICT2114/www/settings.php" }),
  "http://localhost/ICT2114/www"
);
assert.equal(resolveAppBaseUrl({ appBaseUrl: "https://cpm.example.org/" }, { href: "http://ignored/" }), "https://cpm.example.org");

console.log("app-config: provisional defaults, single Supabase config and page load order passed");
