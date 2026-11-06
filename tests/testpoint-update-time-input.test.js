const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const page = fs.readFileSync(path.join(__dirname, "../www/testpoint-update.php"), "utf8");
const controller = fs.readFileSync(path.join(__dirname, "../www/js/testpoint-update.js"), "utf8");

assert.match(page, /<input id="detailTime" type="datetime-local">/);
assert.doesNotMatch(page, /Time \(dd\/mm\/yyyy, HH:MM\)/);
assert.match(controller, /return new Date\(date\.getTime\(\) - offsetMs\)\.toISOString\(\)\.slice\(0, 16\);/);
assert.match(controller, /const parsedDate = new Date\(value\);/);
assert.match(controller, /return parsedDate\.toISOString\(\);/);
assert.doesNotMatch(controller, /DD\/MM\/YYYY HH:mm/);

console.log("testpoint-update-time-input: legacy update page uses local-safe datetime-local timestamps");
