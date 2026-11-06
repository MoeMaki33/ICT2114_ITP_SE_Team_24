const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { AppSettings } = require("../www/js/config/app-settings.js");

const ROOT = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

const UNIT = AppSettings.measurements.conductivity.unit;
const LEGACY_IMPORT_HEADER = "Medium Conductivity (mS/cm)";

// D-MEAS-3 (client, 5 Oct 2026): conductivity is microsiemens per centimetre.
// mS/cm was a thousand-fold error, so no page may state it as the live unit.
assert.equal(UNIT, "µS/cm");

// Controllers read the unit from the config module instead of repeating it.
const history = read("www/js/history.js");
assert.match(history, /const HISTORY_CONDUCTIVITY_UNIT = window\.AppSettings\.measurements\.conductivity\.unit;/);
assert.ok(!/"mS\/cm"/.test(history), "history.js must not hard-code a conductivity unit");
assert.ok(!/mS\/cm/.test(history), "history.js must not mention mS/cm");

const detail = read("www/js/testpoint-view.js");
assert.match(detail, /const DETAIL_CONDUCTIVITY_UNIT = window\.AppSettings\.measurements\.conductivity\.unit;/);
assert.match(
  detail,
  /const DETAIL_CONDUCTIVITY_IMPORT_HEADER = `Medium Conductivity \(\$\{DETAIL_CONDUCTIVITY_UNIT\}\)`;/,
  "the import header must follow the configured unit"
);

// Spreadsheets written before the decision still say mS/cm. Accepting that
// header is deliberate, and the legacy value is imported without conversion.
assert.match(detail, /const DETAIL_LEGACY_CONDUCTIVITY_IMPORT_HEADER = "Medium Conductivity \(mS\/cm\)";/);
assert.notEqual(
  `Medium Conductivity (${UNIT})`,
  LEGACY_IMPORT_HEADER,
  "the legacy alias must differ from the current header, or it aliases nothing"
);
// The legacy column feeds the same parse as the current one: no rescaling.
assert.match(
  detail,
  /hasOwnProperty\.call\(row, DETAIL_CONDUCTIVITY_IMPORT_HEADER\)\s*\n\s*\? row\[DETAIL_CONDUCTIVITY_IMPORT_HEADER\]\s*\n\s*: row\[DETAIL_LEGACY_CONDUCTIVITY_IMPORT_HEADER\];/,
  "the legacy header must fall through to the same value, unconverted"
);

// Markup states the unit in labels and captions, not in placeholders.
for (const page of ["www/history.php", "www/testpoint-view.php", "www/testpoint-update.php"]) {
  const source = read(page);
  assert.ok(source.includes(UNIT), `${page} should show the conductivity unit`);
  const liveMentions = source
    .split("\n")
    .filter((line) => line.includes("mS/cm") && !line.includes("Older spreadsheets"));
  assert.deepEqual(liveMentions, [], `${page} must not state mS/cm as the live unit`);
  assert.ok(
    !/placeholder="[^"]*(mS|µS)\/cm/.test(source),
    `${page} placeholders should be format hints, not units`
  );
}

console.log("conductivity-unit: µS/cm everywhere, mS/cm kept only as an import alias passed");
