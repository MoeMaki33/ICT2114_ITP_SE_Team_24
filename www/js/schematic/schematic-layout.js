/**
 * Pure layout maths for the relative site schematic (plan Phase 4, #84).
 *
 * Takes Test Points with relative X/Y in metres (X east, Y north, D-XYZ-1)
 * and returns pixel positions for an SVG of a given size: equal-aspect scale,
 * "nice" axis ticks, an origin marker, clusters for points closer than a few
 * pixels, and label positions that avoid overlapping each other.
 * No DOM access, so tests/schematic-layout.test.js can require() it.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SchematicLayout = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const STATUS_SEVERITY = ["Unprotected", "Warning", "Unknown", "Protected"];
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 40;
  const DEFAULT_SPAN_M = 10;
  const MARKER_RADIUS_PX = 8;
  const LABEL_CHAR_PX = 7;
  const LABEL_HEIGHT_PX = 14;
  const LABEL_GAP_PX = 4;

  function hasRelativePosition(point) {
    return Number.isFinite(point?.relativeX) && Number.isFinite(point?.relativeY);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function clampZoom(zoom) {
    return clamp(Number.isFinite(zoom) ? zoom : 1, MIN_ZOOM, MAX_ZOOM);
  }

  function severityRank(status) {
    const rank = STATUS_SEVERITY.indexOf(status);
    return rank === -1 ? STATUS_SEVERITY.indexOf("Unknown") : rank;
  }

  function pointStatus(point) {
    return point?.displayStatus || point?.status || "Unknown";
  }

  function worstStatus(points) {
    return points
      .map(pointStatus)
      .reduce((worst, status) => (severityRank(status) < severityRank(worst) ? status : worst), "Protected");
  }

  // Rounds to the precision of the step and avoids "-0".
  function roundToStep(value, step) {
    const decimals = Math.max(0, -Math.floor(Math.log10(step)));
    const rounded = Number(value.toFixed(Math.min(decimals, 10)));
    return Object.is(rounded, -0) ? 0 : rounded;
  }

  // 1, 2 or 5 times a power of ten, so axis labels read 0, 5, 10 or 0, 20, 40.
  function niceStep(rawStep) {
    if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
    const base = 10 ** Math.floor(Math.log10(rawStep));
    const fraction = rawStep / base;
    const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
    return nice * base;
  }

  function niceTicks(min, max, targetCount = 6) {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return { step: 1, values: [] };
    const step = niceStep((max - min) / Math.max(1, targetCount - 1));
    const values = [];
    for (let value = Math.ceil(min / step) * step; value <= max + step * 1e-9 && values.length < 200; value += step) {
      values.push(roundToStep(value, step));
    }
    return { step, values };
  }

  function dataBounds(points) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    points.forEach((point) => {
      minX = Math.min(minX, point.relativeX);
      maxX = Math.max(maxX, point.relativeX);
      minY = Math.min(minY, point.relativeY);
      maxY = Math.max(maxY, point.relativeY);
    });
    // A single point (or a straight line) still needs a sensible span on both axes.
    const span = Math.max(maxX - minX, maxY - minY, DEFAULT_SPAN_M);
    if (maxX - minX < span * 0.05) {
      minX -= span / 2;
      maxX += span / 2;
    }
    if (maxY - minY < span * 0.05) {
      minY -= span / 2;
      maxY += span / 2;
    }
    return { minX, maxX, minY, maxY };
  }

  function createProjection({ bounds, width, height, padding, zoom, pan }) {
    const innerWidth = Math.max(1, width - padding * 2);
    const innerHeight = Math.max(1, height - padding * 2);
    const baseScale = Math.min(innerWidth / (bounds.maxX - bounds.minX), innerHeight / (bounds.maxY - bounds.minY));
    const scale = baseScale * zoom;
    const centreX = (bounds.minX + bounds.maxX) / 2;
    const centreY = (bounds.minY + bounds.maxY) / 2;
    return {
      scale,
      toPixel: (x, y) => ({
        px: width / 2 + (x - centreX) * scale + pan.x,
        py: height / 2 - (y - centreY) * scale + pan.y,
      }),
      toWorld: (px, py) => ({
        x: centreX + (px - width / 2 - pan.x) / scale,
        y: centreY - (py - height / 2 - pan.y) / scale,
      }),
    };
  }

  // Greedy grouping: a point joins the first group whose centre is within the radius.
  function clusterNodes(nodes, radiusPx) {
    const groups = [];
    nodes.forEach((node) => {
      const group = groups.find((candidate) => Math.hypot(candidate.px - node.px, candidate.py - node.py) < radiusPx);
      if (!group) {
        groups.push({ px: node.px, py: node.py, nodes: [node] });
        return;
      }
      group.nodes.push(node);
      group.px = group.nodes.reduce((sum, item) => sum + item.px, 0) / group.nodes.length;
      group.py = group.nodes.reduce((sum, item) => sum + item.py, 0) / group.nodes.length;
    });
    return groups.map((group) => {
      const points = group.nodes.map((node) => node.point);
      if (points.length === 1) {
        return { kind: "point", id: String(points[0].id), px: group.px, py: group.py, status: pointStatus(points[0]), points };
      }
      return {
        kind: "cluster",
        id: `cluster:${points.map((point) => point.id).join(",")}`,
        px: group.px,
        py: group.py,
        status: worstStatus(points),
        points,
      };
    });
  }

  function boxesOverlap(a, b) {
    return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  }

  function labelCandidates(marker, textWidth) {
    const r = MARKER_RADIUS_PX + LABEL_GAP_PX;
    const h = LABEL_HEIGHT_PX;
    const { px, py } = marker;
    return [
      { x: px + r, y: py - h / 2, anchor: "start" },
      { x: px - r - textWidth, y: py - h / 2, anchor: "end" },
      { x: px - textWidth / 2, y: py - r - h, anchor: "middle" },
      { x: px - textWidth / 2, y: py + r, anchor: "middle" },
      { x: px + r * 0.7, y: py - r * 0.7 - h, anchor: "start" },
      { x: px + r * 0.7, y: py + r * 0.7, anchor: "start" },
      { x: px - r * 0.7 - textWidth, y: py - r * 0.7 - h, anchor: "end" },
      { x: px - r * 0.7 - textWidth, y: py + r * 0.7, anchor: "end" },
    ].map((candidate) => ({ ...candidate, width: textWidth, height: h }));
  }

  // Places one label per single-point marker. A label that can't be placed
  // without overlapping is hidden (the point's tooltip and aria-label still name it).
  function placeLabels(markers, width, height) {
    const markerBoxes = markers.map((marker) => ({
      id: marker.id,
      x: marker.px - MARKER_RADIUS_PX,
      y: marker.py - MARKER_RADIUS_PX,
      width: MARKER_RADIUS_PX * 2,
      height: MARKER_RADIUS_PX * 2,
    }));
    const placed = [];
    return markers.filter((marker) => marker.kind === "point").map((marker) => {
      const text = String(marker.points[0].label || "");
      const textWidth = text.length * LABEL_CHAR_PX + 4;
      const choice = labelCandidates(marker, textWidth).find((box) =>
        box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height &&
        !placed.some((other) => boxesOverlap(box, other)) &&
        !markerBoxes.some((other) => other.id !== marker.id && boxesOverlap(box, other)));
      if (!choice) return { id: marker.id, text, hidden: true };
      placed.push(choice);
      const textX = choice.anchor === "start" ? choice.x : choice.anchor === "end" ? choice.x + choice.width : choice.x + choice.width / 2;
      return { id: marker.id, text, hidden: false, x: textX, y: choice.y + choice.height - 3, anchor: choice.anchor, box: choice };
    });
  }

  /**
   * points: [{ id, label, relativeX, relativeY, relativeZ, displayStatus }]
   * options: { width, height, padding, zoom, pan: { x, y }, clusterRadiusPx }
   */
  function computeLayout(points, options = {}) {
    const width = options.width ?? 800;
    const height = options.height ?? 520;
    const padding = options.padding ?? 48;
    const zoom = clampZoom(options.zoom ?? 1);
    const pan = { x: options.pan?.x ?? 0, y: options.pan?.y ?? 0 };
    const clusterRadiusPx = options.clusterRadiusPx ?? 12;
    const positioned = (points || []).filter(hasRelativePosition);

    if (!positioned.length) {
      return { empty: true, width, height, zoom, pan, scale: null, bounds: null, origin: null, ticks: { x: [], y: [] }, markers: [], labels: [] };
    }

    const bounds = dataBounds(positioned);
    const projection = createProjection({ bounds, width, height, padding, zoom, pan });
    const nodes = positioned.map((point) => ({ point, ...projection.toPixel(point.relativeX, point.relativeY) }));
    const markers = clusterNodes(nodes, clusterRadiusPx);

    const topLeft = projection.toWorld(padding, padding);
    const bottomRight = projection.toWorld(width - padding, height - padding);
    const ticks = {
      x: niceTicks(topLeft.x, bottomRight.x).values.map((value) => ({ value, px: projection.toPixel(value, 0).px })),
      y: niceTicks(bottomRight.y, topLeft.y).values.map((value) => ({ value, py: projection.toPixel(0, value).py })),
    };

    const originPixel = projection.toPixel(0, 0);
    const origin = {
      ...originPixel,
      visible: originPixel.px >= padding && originPixel.px <= width - padding && originPixel.py >= padding && originPixel.py <= height - padding,
    };

    return {
      empty: false,
      width,
      height,
      padding,
      zoom,
      pan,
      scale: projection.scale,
      bounds,
      origin,
      ticks,
      markers,
      labels: placeLabels(markers, width, height),
    };
  }

  /**
   * The schematic draws one location at a time. Uses the filtered location when
   * there is one; otherwise picks the location with the most positioned Test
   * Points (then the most Test Points, then by name) and flags it as automatic.
   */
  function pickLocation(points, preferredLocationId) {
    const groups = new Map();
    (points || []).forEach((point) => {
      const key = String(point.locationId ?? "");
      if (!groups.has(key)) {
        groups.set(key, { locationId: point.locationId ?? null, locationName: point.siteName || "Unknown location", points: [] });
      }
      groups.get(key).points.push(point);
    });
    const locationCount = groups.size;
    if (preferredLocationId) {
      const chosen = groups.get(String(preferredLocationId));
      return chosen
        ? { ...chosen, autoSelected: false, locationCount }
        : { locationId: preferredLocationId, locationName: "", points: [], autoSelected: false, locationCount };
    }
    if (!locationCount) return { locationId: null, locationName: "", points: [], autoSelected: false, locationCount: 0 };
    const positionedCount = (group) => group.points.filter(hasRelativePosition).length;
    const best = [...groups.values()].sort((a, b) =>
      positionedCount(b) - positionedCount(a) ||
      b.points.length - a.points.length ||
      String(a.locationName).localeCompare(String(b.locationName)))[0];
    return { ...best, autoSelected: true, locationCount };
  }

  // New zoom and pan that keep the world point under `anchor` (pixels) fixed.
  function zoomAround({ zoom, pan }, nextZoom, anchor, size) {
    const current = clampZoom(zoom);
    const next = clampZoom(nextZoom);
    const ratio = next / current;
    const cx = size.width / 2;
    const cy = size.height / 2;
    return {
      zoom: next,
      pan: {
        x: anchor.x - cx - (anchor.x - cx - pan.x) * ratio,
        y: anchor.y - cy - (anchor.y - cy - pan.y) * ratio,
      },
    };
  }

  return {
    computeLayout,
    zoomAround,
    pickLocation,
    niceStep,
    niceTicks,
    hasRelativePosition,
    worstStatus,
    severityRank,
    MIN_ZOOM,
    MAX_ZOOM,
    MARKER_RADIUS_PX,
  };
});
