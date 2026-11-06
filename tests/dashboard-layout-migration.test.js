const assert = require("node:assert/strict");

global.window = {};
require("../www/js/dashboard-layout.js");
const layout = window.DashboardLayout;

const previousLayout = {
  version: 1,
  columns: 6,
  metricOrder: ["total-points", "protected", "warning", "unprotected", "unknown", "average-reading"],
  widgets: [
    { widgetId: "protection-reading-trends", x: 0, y: 0, w: 3, h: 3 },
    { widgetId: "average-reading-by-pipeline", x: 3, y: 0, w: 3, h: 3 },
    { widgetId: "weekly-protection-summary", x: 0, y: 3, w: 6, h: 4 },
    { widgetId: "test-points-table", x: 0, y: 7, w: 6, h: 5 },
  ],
};

const migrated = layout.migrateDashboardLayout(previousLayout);
assert.equal(layout.validateDashboardLayout(migrated).valid, true);
assert.equal(migrated.widgets.find((widget) => widget.widgetId === "weekly-protection-summary").h, 5);
assert.equal(migrated.widgets.find((widget) => widget.widgetId === "test-points-table").y, 8, "the table should remain directly below the expanded summary widget");

const tablet = layout.adaptLayoutToColumns(migrated, 1);
assert.equal(tablet.columns, 1);
assert.ok(tablet.widgets.every((widget) => widget.x === 0 && widget.w === 1));
tablet.widgets.forEach((widget, index) => {
  tablet.widgets.slice(index + 1).forEach((other) => assert.equal(layout.widgetsOverlap(widget, other), false));
});

console.log("dashboard-layout-migration: saved layout compatibility and stacked responsive adaptation passed");
