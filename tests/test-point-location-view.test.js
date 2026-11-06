const assert = require("node:assert/strict");

global.window = {};
global.document = { getElementById: () => null };
require("../www/js/test-point-location-view.js");
const build = window.TestPointLocationView.buildPositionState;

const gps = build({ position: { coordinateMode: "gps", latitude: 1.35, longitude: 103.82 } }, "admin");
assert.equal(gps.hasGps, true);
assert.equal(gps.hasRelative, false);
assert.equal(gps.actionLabel, "Edit Position");

const relative = build({ position: { coordinateMode: "relative", relativeX: 20, relativeY: 4, relativeZ: -1.5 } }, "engineer");
assert.equal(relative.hasGps, false);
assert.equal(relative.hasRelative, true);
assert.equal(relative.actionLabel, "View Position");

const combined = build({ position: { coordinateMode: "gps_and_relative", latitude: 1.4, longitude: 103.9, relativeX: 1, relativeY: 2 } }, "admin");
assert.equal(combined.hasGps, true);
assert.equal(combined.hasRelative, true);

const unmappedAdmin = build({ position: null }, "admin");
assert.equal(unmappedAdmin.actionLabel, "Add Position");
assert.equal(unmappedAdmin.showPositionAction, true);

const unmappedEngineer = build({ position: null }, "engineer");
assert.equal(unmappedEngineer.showPositionAction, false);

const invalid = build({ position: { coordinateMode: "gps", latitude: 91, longitude: 181 } }, "admin");
assert.equal(invalid.hasGps, false, "out-of-range coordinates must not create a marker");

console.log("test-point-location-view: GPS, relative, combined, unmapped, role and invalid-coordinate states passed");
