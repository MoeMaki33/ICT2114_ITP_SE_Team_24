const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sharedController = fs.readFileSync(path.join(__dirname, "../www/js/table-sort-controller.js"), "utf8");
const historyController = fs.readFileSync(path.join(__dirname, "../www/js/history.js"), "utf8");
const detailController = fs.readFileSync(path.join(__dirname, "../www/js/testpoint-view.js"), "utf8");
const detailPage = fs.readFileSync(path.join(__dirname, "../www/testpoint-view.php"), "utf8");

for (const indicator of ["↕", "↑", "↓"]) {
  assert.match(sharedController, new RegExp(indicator));
  assert.match(historyController, new RegExp(indicator));
}
assert.doesNotMatch(sharedController, /fa-sort(?:-up|-down)?/);
assert.doesNotMatch(historyController, /fa-sort(?:-up|-down)?/);
assert.match(sharedController, /setAttribute\("aria-sort"/);
assert.match(sharedController, /Sorted \$\{directionLabel\} by/);
assert.match(historyController, /setAttribute\("aria-sort"/);
assert.match(detailPage, /id="detailHistoryDataTable"/);
assert.match(detailPage, /data-table-sort-key="sortDate"/);
assert.match(detailController, /new window\.TableSortController/);
assert.match(detailController, /initialKey:\s*detailHistorySortKey/);
assert.match(detailController, /detailHistorySortDirection = "desc"/);

console.log("table-sort-icons: shared arrow states, accessible metadata and detail-history adoption passed");
