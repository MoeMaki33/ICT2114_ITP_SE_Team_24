const assert = require("node:assert/strict");
const {
  computeLayout,
  zoomAround,
  pickLocation,
  niceStep,
  niceTicks,
  worstStatus,
  MAX_ZOOM,
} = require("../www/js/schematic/schematic-layout.js");

function point(id, x, y, status = "Protected", extra = {}) {
  return { id, label: `TP-${id}`, relativeX: x, relativeY: y, displayStatus: status, ...extra };
}

function markerFor(layout, id) {
  return layout.markers.find((marker) => marker.points.some((item) => item.id === id));
}

const size = { width: 800, height: 520, padding: 48 };

// Nothing positioned: an empty layout, no NaN.
const empty = computeLayout([{ id: "a", label: "A", relativeX: null, relativeY: null }], size);
assert.equal(empty.empty, true);
assert.deepEqual(empty.markers, []);

// Points without relative X/Y are left out of the drawing.
const mixed = computeLayout([point("a", 0, 0), { id: "b", label: "B", relativeX: 5, relativeY: null }], size);
assert.equal(mixed.markers.length, 1);

// Equal aspect: 100 m east and 50 m north keep a 2:1 ratio on screen.
const aspect = computeLayout([point("o", 0, 0), point("e", 100, 0), point("n", 0, 50)], size);
const o = markerFor(aspect, "o");
const e = markerFor(aspect, "e");
const n = markerFor(aspect, "n");
const east = Math.hypot(e.px - o.px, e.py - o.py);
const north = Math.hypot(n.px - o.px, n.py - o.py);
assert.ok(Math.abs(east / north - 2) < 1e-9, `expected 2:1, got ${east / north}`);
assert.ok(east <= size.width - size.padding * 2 + 1e-9, "fits inside the padded width");

// Y points up: the northern point is drawn higher (smaller py).
assert.ok(n.py < o.py);
assert.ok(e.px > o.px);

// Origin is marked when (0, 0) is in view, and not when it is far outside.
assert.equal(aspect.origin.visible, true);
const farAway = computeLayout([point("a", 1000, 1000), point("b", 1010, 1005)], size);
assert.equal(farAway.origin.visible, false);

// A single point is centred, with a sensible default span.
const single = computeLayout([point("only", 42, -7)], size);
assert.equal(single.markers.length, 1);
assert.ok(Math.abs(single.markers[0].px - size.width / 2) < 1e-9);
assert.ok(Math.abs(single.markers[0].py - size.height / 2) < 1e-9);
assert.ok(Number.isFinite(single.scale) && single.scale > 0);

// Nice ticks: 1, 2 or 5 times a power of ten, and never "-0".
assert.equal(niceStep(0.7), 1);
assert.equal(niceStep(1.3), 2);
assert.equal(niceStep(3), 5);
assert.equal(niceStep(7), 10);
assert.equal(niceStep(23), 50);
assert.deepEqual(niceTicks(0, 100).values, [0, 20, 40, 60, 80, 100]);
assert.deepEqual(niceTicks(-1, 1).values, [-1, -0.5, 0, 0.5, 1]);
assert.ok(niceTicks(-1, 1).values.every((value) => !Object.is(value, -0)));
assert.ok(aspect.ticks.x.length >= 2 && aspect.ticks.y.length >= 2);

// Close points (0.5 m apart on a 100 m site) form a cluster at zoom 1 ...
const site = [point("a", 0, 0), point("b", 0.5, 0, "Unprotected"), point("far", 100, 40)];
const zoomedOut = computeLayout(site, size);
assert.equal(zoomedOut.markers.length, 2);
const cluster = zoomedOut.markers.find((marker) => marker.kind === "cluster");
assert.ok(cluster, "a and b are clustered");
assert.equal(cluster.points.length, 2);
assert.equal(cluster.status, "Unprotected", "a cluster shows its most severe status");
// ... and separate again once zoomed in, so each stays selectable.
const zoomedIn = computeLayout(site, { ...size, zoom: 6 });
assert.equal(zoomedIn.markers.filter((marker) => marker.kind === "point").length, 3);

// Severity order.
assert.equal(worstStatus([point("a", 0, 0, "Protected"), point("b", 0, 0, "Warning")]), "Warning");
assert.equal(worstStatus([point("a", 0, 0, "Unknown"), point("b", 0, 0, "Protected")]), "Unknown");

// Labels never overlap each other; any that can't fit are hidden, not stacked.
const line = Array.from({ length: 14 }, (_, index) => point(`p${index + 1}`, index * 8, index % 2 ? 1 : 0));
const lineLayout = computeLayout(line, size);
const shown = lineLayout.labels.filter((label) => !label.hidden);
assert.ok(shown.length > 0);
for (let i = 0; i < shown.length; i += 1) {
  for (let j = i + 1; j < shown.length; j += 1) {
    const a = shown[i].box;
    const b = shown[j].box;
    const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    assert.equal(overlap, false, `labels ${shown[i].text} and ${shown[j].text} overlap`);
  }
}
assert.ok(shown.every((label) => label.box.x >= 0 && label.box.x + label.box.width <= size.width));

// Zooming around a point keeps that point where it was on screen.
const before = computeLayout(site, size);
const target = markerFor(before, "far");
const next = zoomAround({ zoom: 1, pan: { x: 0, y: 0 } }, 3, { x: target.px, y: target.py }, size);
const after = computeLayout(site, { ...size, zoom: next.zoom, pan: next.pan });
const moved = markerFor(after, "far");
assert.ok(Math.abs(moved.px - target.px) < 1e-6 && Math.abs(moved.py - target.py) < 1e-6);

// Zoom is clamped.
assert.equal(computeLayout(site, { ...size, zoom: 10_000 }).zoom, MAX_ZOOM);

// Location choice: the filtered location wins; otherwise the most positioned one.
const atSites = [
  point("a1", 0, 0, "Protected", { locationId: "A", siteName: "Alpha" }),
  { id: "a2", label: "A2", locationId: "A", siteName: "Alpha", relativeX: null, relativeY: null },
  { id: "a3", label: "A3", locationId: "A", siteName: "Alpha", relativeX: null, relativeY: null },
  point("b1", 0, 0, "Protected", { locationId: "B", siteName: "Bravo" }),
  point("b2", 5, 5, "Protected", { locationId: "B", siteName: "Bravo" }),
];
const automatic = pickLocation(atSites, "");
assert.equal(automatic.locationName, "Bravo", "Bravo has more positioned points than Alpha");
assert.equal(automatic.autoSelected, true);
assert.equal(automatic.locationCount, 2);
const chosen = pickLocation(atSites, "A");
assert.equal(chosen.locationName, "Alpha");
assert.equal(chosen.points.length, 3);
assert.equal(chosen.autoSelected, false);
assert.deepEqual(pickLocation([], "").points, []);
assert.deepEqual(pickLocation(atSites, "missing").points, []);

console.log("schematic-layout: aspect, ticks, clustering, labels, zoom and location choice passed");
