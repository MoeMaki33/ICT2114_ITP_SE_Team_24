const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

for (const page of ["www/weekly.php", "www/testpoints.php", "www/history.php", "www/admin.php"]) {
  const markup = read(page);
  assert.match(markup, /app-table-card/, `${page} should use the shared table card primitive`);
  assert.match(markup, /app-table-scroll/, `${page} should use the shared scroll primitive`);
  assert.match(markup, /app-table/, `${page} should use the shared table primitive`);
}

assert.match(read("www/asset-map.php"), /app-table-card/);
assert.match(read("www/js/asset-map.js"), /asset-map-data-table app-table/);
assert.match(read("www/css/style.css"), /\.app-table-numeric/);
assert.match(read("www/css/style.css"), /\.app-status-badge\.status-protected/);
assert.match(read("www/css/style.css"), /\.app-trend-improved/);

console.log("shared-table-markup: initial cross-page table primitives and shared states passed");
