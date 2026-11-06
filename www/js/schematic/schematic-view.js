/**
 * Relative site schematic view for the Asset Map (plan Phase 4, #84).
 *
 * Draws one location's Test Points by relative X/Y (metres) as an inline SVG
 * using window.SchematicLayout. Everything is built with DOM methods and
 * textContent, so labels from the database can't inject markup.
 *
 * Buttons carrying data-asset-map-action ("view-details" / "position") are
 * handled by AssetMapPageController's document click listener.
 */
(function () {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const STAGE_HEIGHT_PX = 520;
  const PADDING_PX = 48;
  const ZOOM_STEP = 1.5;
  const WHEEL_STEP = 1.2;
  const PAN_STEP_PX = 60;
  const STATUS_CLASS = { Protected: "protected", Warning: "warning", Unprotected: "unprotected" };
  const MODE_LABELS = { gps: "GPS only", relative: "Relative", gps_and_relative: "GPS and relative", unmapped: "Unmapped" };

  function html(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = text;
    return element;
  }

  function svg(tag, attributes = {}, text) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
    if (text !== undefined && text !== null) element.textContent = text;
    return element;
  }

  function iconButton(icon, label, className = "btn btn-light") {
    const button = html("button", className);
    button.type = "button";
    button.setAttribute("aria-label", label);
    button.title = label;
    const glyph = html("i", `fa-solid ${icon}`);
    glyph.setAttribute("aria-hidden", "true");
    button.append(glyph);
    return button;
  }

  function statusClass(status) {
    return STATUS_CLASS[status] || "unknown";
  }

  function formatMetres(value, unit) {
    if (!Number.isFinite(value)) return "Not set";
    return `${Number(value.toFixed(2))} ${unit}`;
  }

  function formatMv(value) {
    return Number.isFinite(value) ? `${Math.round(value)} mV` : "No data";
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("en-SG", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function zLabel(zMode) {
    if (zMode === "depth") return "Depth";
    if (zMode === "elevation") return "Elevation";
    return "Z (unconfirmed)";
  }

  class AssetMapSchematicView {
    constructor({ root, onSelect, onOpenDetails, canManagePositions } = {}) {
      this.root = root;
      this.onSelect = onSelect || (() => {});
      this.onOpenDetails = onOpenDetails || (() => {});
      this.canManagePositions = canManagePositions || (() => false);
      this.view = { zoom: 1, pan: { x: 0, y: 0 } };
      this.points = [];
      this.positioned = [];
      this.layout = null;
      this.locationKey = null;
      this.selectedPointId = null;
      this.pinnedPointId = null;
      this.drag = null;
      this.frame = 0;
      this.abortController = new AbortController();
      this.build();
    }

    get settings() {
      const schematic = window.AppSettings?.schematic || {};
      return { unit: schematic.units || "m", zMode: schematic.zMode || "hidden" };
    }

    build() {
      const { signal } = this.abortController;
      this.root.replaceChildren();

      const header = html("div", "asset-map-schematic-header");
      const titles = html("div");
      this.titleElement = html("h4", "asset-map-schematic-title", "Site schematic");
      this.hintElement = html("p", "muted asset-map-schematic-hint");
      titles.append(this.titleElement, this.hintElement);
      const controls = html("div", "asset-map-schematic-controls");
      controls.setAttribute("role", "group");
      controls.setAttribute("aria-label", "Schematic zoom");
      const zoomIn = iconButton("fa-magnifying-glass-plus", "Zoom in");
      const zoomOut = iconButton("fa-magnifying-glass-minus", "Zoom out");
      const reset = iconButton("fa-expand", "Reset view");
      controls.append(zoomIn, zoomOut, reset);
      header.append(titles, controls);

      this.stage = html("div", "asset-map-schematic-stage");
      this.svgElement = svg("svg", { class: "asset-map-schematic-svg", tabindex: 0, role: "group", height: STAGE_HEIGHT_PX });
      this.tooltip = html("div", "asset-map-schematic-tooltip");
      this.tooltip.setAttribute("role", "tooltip");
      this.tooltip.hidden = true;
      this.card = html("div", "asset-map-schematic-card");
      this.card.hidden = true;
      this.stage.append(this.svgElement, this.tooltip, this.card);

      const note = html("p", "muted asset-map-schematic-note");
      this.noteElement = note;

      this.unpositionedElement = html("section", "asset-map-schematic-unpositioned");
      this.root.append(header, this.stage, note, this.unpositionedElement);

      zoomIn.addEventListener("click", () => this.zoomBy(ZOOM_STEP), { signal });
      zoomOut.addEventListener("click", () => this.zoomBy(1 / ZOOM_STEP), { signal });
      reset.addEventListener("click", () => this.resetView(), { signal });

      this.svgElement.addEventListener("wheel", (event) => {
        if (!this.layout || this.layout.empty) return;
        event.preventDefault();
        this.zoomBy(event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP, this.pointerPosition(event));
      }, { signal, passive: false });

      this.svgElement.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || event.target.closest("[data-marker-id]")) return;
        this.drag = { x: event.clientX, y: event.clientY, pan: { ...this.view.pan }, pointerId: event.pointerId };
        this.svgElement.setPointerCapture(event.pointerId);
        this.svgElement.classList.add("is-dragging");
      }, { signal });
      this.svgElement.addEventListener("pointermove", (event) => {
        if (!this.drag) return;
        this.view.pan = { x: this.drag.pan.x + event.clientX - this.drag.x, y: this.drag.pan.y + event.clientY - this.drag.y };
        this.scheduleDraw();
      }, { signal });
      const endDrag = () => {
        if (!this.drag) return;
        this.svgElement.releasePointerCapture?.(this.drag.pointerId);
        this.drag = null;
        this.svgElement.classList.remove("is-dragging");
      };
      this.svgElement.addEventListener("pointerup", endDrag, { signal });
      this.svgElement.addEventListener("pointercancel", endDrag, { signal });

      this.svgElement.addEventListener("click", (event) => {
        const marker = event.target.closest("[data-marker-id]");
        if (!marker) {
          this.closeCard();
          return;
        }
        this.activateMarker(marker.dataset.markerId, { open: false });
      }, { signal });

      this.svgElement.addEventListener("keydown", (event) => this.handleKeydown(event), { signal });
      this.svgElement.addEventListener("pointerover", (event) => this.showTooltipFor(event.target.closest("[data-marker-id]")), { signal });
      this.svgElement.addEventListener("pointerout", (event) => {
        if (!event.relatedTarget || !event.relatedTarget.closest?.("[data-marker-id]")) this.hideTooltip();
      }, { signal });
      this.svgElement.addEventListener("focusin", (event) => this.showTooltipFor(event.target.closest("[data-marker-id]")), { signal });
      this.svgElement.addEventListener("focusout", () => this.hideTooltip(), { signal });

      this.card.addEventListener("click", (event) => {
        const selectButton = event.target.closest("[data-schematic-select]");
        if (selectButton) {
          this.selectPoint(selectButton.dataset.schematicSelect);
          return;
        }
        const zoomButton = event.target.closest("[data-schematic-zoom-cluster]");
        if (zoomButton) this.zoomIntoMarker(zoomButton.dataset.schematicZoomCluster);
        if (event.target.closest("[data-schematic-close]")) this.closeCard();
      }, { signal });

      if (typeof ResizeObserver === "function") {
        this.resizeObserver = new ResizeObserver(() => this.scheduleDraw());
        this.resizeObserver.observe(this.stage);
      }
    }

    render({ points = [], locationName = "", autoSelectedLocation = false, otherLocationCount = 0, selectedPointId = null } = {}) {
      const key = String(locationName);
      if (key !== this.locationKey) {
        this.locationKey = key;
        this.view = { zoom: 1, pan: { x: 0, y: 0 } };
        this.pinnedPointId = null;
      }
      this.points = points;
      this.positioned = points.filter((point) => window.SchematicLayout.hasRelativePosition(point));
      this.selectedPointId = selectedPointId;
      if (this.pinnedPointId && !this.positioned.some((point) => String(point.id) === this.pinnedPointId)) this.pinnedPointId = null;

      this.titleElement.textContent = locationName ? `Site schematic: ${locationName}` : "Site schematic";
      this.hintElement.textContent = autoSelectedLocation && otherLocationCount > 0
        ? "Showing the location with the most positioned Test Points. Choose a location in Filters to switch."
        : `${this.positioned.length} of ${points.length} Test Points positioned`;
      const { unit } = this.settings;
      this.noteElement.textContent = `X points east and Y points north, in ${unit === "m" ? "metres" : unit} from the location's origin. Schematic, not to survey precision. Drag to pan; scroll or use the buttons to zoom.`;
      this.svgElement.setAttribute("aria-label", `Site schematic${locationName ? ` of ${locationName}` : ""}: ${this.positioned.length} positioned Test Points. Use arrow keys to pan and plus or minus to zoom.`);

      this.renderUnpositioned();
      this.draw();
    }

    setSelectedPoint(pointId) {
      this.selectedPointId = pointId ? String(pointId) : null;
      if (!this.selectedPointId) this.pinnedPointId = null;
      this.draw();
    }

    resetView() {
      this.view = { zoom: 1, pan: { x: 0, y: 0 } };
      this.closeCard();
      this.draw();
    }

    destroy() {
      cancelAnimationFrame(this.frame);
      this.resizeObserver?.disconnect();
      this.abortController.abort();
      this.root.replaceChildren();
    }

    size() {
      return { width: Math.max(320, Math.round(this.stage.clientWidth || 800)), height: STAGE_HEIGHT_PX };
    }

    pointerPosition(event) {
      const rect = this.svgElement.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    zoomBy(factor, anchor) {
      const size = this.size();
      const centre = anchor || { x: size.width / 2, y: size.height / 2 };
      this.view = window.SchematicLayout.zoomAround(this.view, this.view.zoom * factor, centre, size);
      this.scheduleDraw();
    }

    zoomIntoMarker(markerId) {
      const marker = this.layout?.markers.find((item) => item.id === markerId);
      if (!marker) return;
      this.closeCard();
      this.zoomBy(3, { x: marker.px, y: marker.py });
    }

    handleKeydown(event) {
      const marker = event.target.closest?.("[data-marker-id]");
      if (marker && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        this.activateMarker(marker.dataset.markerId, { open: true });
        return;
      }
      const pans = { ArrowLeft: [PAN_STEP_PX, 0], ArrowRight: [-PAN_STEP_PX, 0], ArrowUp: [0, PAN_STEP_PX], ArrowDown: [0, -PAN_STEP_PX] };
      if (pans[event.key] && !marker) {
        event.preventDefault();
        this.view.pan = { x: this.view.pan.x + pans[event.key][0], y: this.view.pan.y + pans[event.key][1] };
        this.scheduleDraw();
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        this.zoomBy(ZOOM_STEP);
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        this.zoomBy(1 / ZOOM_STEP);
      } else if (event.key === "0") {
        event.preventDefault();
        this.resetView();
      } else if (event.key === "Escape") {
        this.closeCard();
      }
    }

    activateMarker(markerId, { open }) {
      const marker = this.layout?.markers.find((item) => item.id === markerId);
      if (!marker) return;
      this.hideTooltip();
      if (marker.kind === "cluster") {
        this.showClusterCard(marker);
        return;
      }
      const pointId = String(marker.points[0].id);
      if (open) {
        this.onOpenDetails(pointId);
        return;
      }
      this.selectPoint(pointId);
    }

    selectPoint(pointId) {
      this.pinnedPointId = String(pointId);
      this.selectedPointId = String(pointId);
      this.onSelect(String(pointId));
      this.draw();
    }

    scheduleDraw() {
      cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame(() => this.draw());
    }

    draw() {
      const size = this.size();
      this.layout = window.SchematicLayout.computeLayout(this.positioned, { ...size, padding: PADDING_PX, zoom: this.view.zoom, pan: this.view.pan });
      this.view = { zoom: this.layout.zoom, pan: this.layout.pan };
      this.svgElement.setAttribute("viewBox", `0 0 ${size.width} ${size.height}`);
      this.svgElement.replaceChildren();

      if (this.layout.empty) {
        this.svgElement.append(svg("text", { x: size.width / 2, y: size.height / 2, "text-anchor": "middle", class: "asset-map-schematic-empty" },
          this.points.length ? "No Test Points at this location have relative X/Y coordinates yet." : "No Test Points match the current filters."));
        this.closeCard();
        return;
      }

      this.drawGrid(size);
      this.drawOrigin();
      this.drawMarkers();
      this.drawLabels();
      this.updateCard();
    }

    drawGrid(size) {
      const { unit } = this.settings;
      const grid = svg("g", { class: "asset-map-schematic-grid", "aria-hidden": "true" });
      const top = PADDING_PX;
      const bottom = size.height - PADDING_PX;
      const left = PADDING_PX;
      const right = size.width - PADDING_PX;
      this.layout.ticks.x.forEach(({ value, px }) => {
        grid.append(svg("line", { x1: px, y1: top, x2: px, y2: bottom }));
        grid.append(svg("text", { x: px, y: bottom + 18, "text-anchor": "middle" }, `${value} ${unit}`));
      });
      this.layout.ticks.y.forEach(({ value, py }) => {
        grid.append(svg("line", { x1: left, y1: py, x2: right, y2: py }));
        grid.append(svg("text", { x: left - 6, y: py + 4, "text-anchor": "end" }, `${value}`));
      });
      grid.append(svg("rect", { x: left, y: top, width: right - left, height: bottom - top, class: "asset-map-schematic-frame" }));
      grid.append(svg("text", { x: right, y: top - 10, "text-anchor": "end", class: "asset-map-schematic-axis" }, `X east (${unit}) →`));
      grid.append(svg("text", { x: left, y: top - 10, "text-anchor": "start", class: "asset-map-schematic-axis" }, `↑ Y north (${unit})`));
      this.svgElement.append(grid);
    }

    drawOrigin() {
      const { origin } = this.layout;
      if (!origin?.visible) return;
      const group = svg("g", { class: "asset-map-schematic-origin", "aria-hidden": "true" });
      group.append(
        svg("line", { x1: origin.px - 10, y1: origin.py, x2: origin.px + 10, y2: origin.py }),
        svg("line", { x1: origin.px, y1: origin.py - 10, x2: origin.px, y2: origin.py + 10 }),
        svg("text", { x: origin.px + 6, y: origin.py + 18 }, "Origin (0, 0)"),
      );
      this.svgElement.append(group);
    }

    drawMarkers() {
      const radius = window.SchematicLayout.MARKER_RADIUS_PX;
      const group = svg("g", { class: "asset-map-schematic-markers" });
      this.layout.markers.forEach((marker) => {
        const element = svg("g", {
          class: `asset-map-schematic-marker ${statusClass(marker.status)}${marker.kind === "cluster" ? " is-cluster" : ""}`,
          tabindex: 0,
          role: "button",
          "data-marker-id": marker.id,
          transform: `translate(${marker.px} ${marker.py})`,
        });
        if (marker.kind === "cluster") {
          element.setAttribute("aria-label", `${marker.points.length} Test Points close together: ${marker.points.map((point) => point.label).join(", ")}. Press Enter to list them.`);
          element.append(svg("circle", { r: radius + 5 }), svg("text", { "text-anchor": "middle", dy: "0.35em" }, String(marker.points.length)));
        } else {
          const point = marker.points[0];
          const selected = String(point.id) === String(this.selectedPointId);
          element.classList.toggle("is-selected", selected);
          element.setAttribute("aria-label", `${point.label}, ${marker.status}, ${formatMv(point.latestReading)}. Press Enter to open details.`);
          if (selected) element.setAttribute("aria-pressed", "true");
          if (selected) element.append(svg("circle", { r: radius + 5, class: "asset-map-schematic-ring" }));
          element.append(svg("circle", { r: radius }));
        }
        group.append(element);
      });
      this.svgElement.append(group);
    }

    drawLabels() {
      const group = svg("g", { class: "asset-map-schematic-labels", "aria-hidden": "true" });
      this.layout.labels.filter((label) => !label.hidden).forEach((label) => {
        group.append(svg("text", { x: label.x, y: label.y, "text-anchor": label.anchor }, label.text));
      });
      this.svgElement.append(group);
    }

    pointDetails(point) {
      const { unit, zMode } = this.settings;
      const list = html("dl", "asset-map-schematic-details");
      const rows = [
        ["Status", point.displayStatus || "Unknown"],
        ["Latest", `${formatMv(point.latestReading)}${point.latestReadingTimestamp ? ` · ${formatDateTime(point.latestReadingTimestamp)}` : ""}`],
        ["X / Y", `${formatMetres(point.relativeX, unit)} / ${formatMetres(point.relativeY, unit)}`],
      ];
      if (Number.isFinite(point.relativeZ)) rows.push([zLabel(zMode), formatMetres(point.relativeZ, unit)]);
      rows.forEach(([term, value]) => {
        const row = html("div");
        row.append(html("dt", "", term), html("dd", "", value));
        list.append(row);
      });
      return list;
    }

    showTooltipFor(markerElement) {
      if (!markerElement || !this.layout) return;
      const marker = this.layout.markers.find((item) => item.id === markerElement.dataset.markerId);
      if (!marker || (marker.kind === "point" && String(marker.points[0].id) === this.pinnedPointId)) return;
      this.tooltip.replaceChildren();
      if (marker.kind === "cluster") {
        this.tooltip.append(html("strong", "", `${marker.points.length} Test Points here`), html("p", "", "Click to list them, or zoom in."));
      } else {
        this.tooltip.append(html("strong", "", marker.points[0].label), this.pointDetails(marker.points[0]));
      }
      this.placeFloating(this.tooltip, marker);
      this.tooltip.hidden = false;
    }

    hideTooltip() {
      this.tooltip.hidden = true;
    }

    placeFloating(element, marker) {
      const size = this.size();
      element.hidden = false;
      const width = element.offsetWidth || 240;
      const height = element.offsetHeight || 120;
      const left = marker.px + 16 + width > size.width ? marker.px - 16 - width : marker.px + 16;
      const top = Math.min(Math.max(8, marker.py - height / 2), size.height - height - 8);
      element.style.left = `${Math.max(8, left)}px`;
      element.style.top = `${top}px`;
    }

    updateCard() {
      if (!this.pinnedPointId) {
        const cluster = this.card.dataset.cluster && this.layout.markers.find((item) => item.id === this.card.dataset.cluster);
        // A cluster card follows its cluster, and closes once zooming splits it.
        if (cluster) this.placeFloating(this.card, cluster);
        else this.closeCard();
        return;
      }
      const marker = this.layout.markers.find((item) => item.kind === "point" && String(item.points[0].id) === this.pinnedPointId);
      if (!marker) {
        this.card.hidden = true;
        return;
      }
      const point = marker.points[0];
      this.card.replaceChildren();
      delete this.card.dataset.cluster;
      const head = html("div", "asset-map-schematic-card-head");
      head.append(html("strong", "", point.label), this.closeButton());
      const actions = html("div", "asset-map-schematic-card-actions");
      actions.append(this.actionButton("view-details", point.id, "View details", "btn btn-green"));
      if (this.canManagePositions()) actions.append(this.actionButton("position", point.id, "Position", "btn btn-light"));
      this.card.append(head, this.pointDetails(point), actions);
      this.placeFloating(this.card, marker);
    }

    showClusterCard(marker) {
      this.pinnedPointId = null;
      this.card.replaceChildren();
      this.card.dataset.cluster = marker.id;
      const head = html("div", "asset-map-schematic-card-head");
      head.append(html("strong", "", `${marker.points.length} Test Points here`), this.closeButton());
      const list = html("ul", "asset-map-schematic-cluster-list");
      marker.points.forEach((point) => {
        const item = html("li");
        const button = html("button", `asset-map-schematic-cluster-item ${statusClass(point.displayStatus)}`);
        button.type = "button";
        button.dataset.schematicSelect = String(point.id);
        button.append(html("span", "asset-map-schematic-dot"), html("span", "", point.label), html("span", "muted", formatMv(point.latestReading)));
        item.append(button);
        list.append(item);
      });
      const zoom = html("button", "btn btn-light", "Zoom in here");
      zoom.type = "button";
      zoom.dataset.schematicZoomCluster = marker.id;
      this.card.append(head, list, zoom);
      this.placeFloating(this.card, marker);
      list.querySelector("button")?.focus();
    }

    closeCard() {
      this.pinnedPointId = null;
      delete this.card.dataset.cluster;
      this.card.hidden = true;
    }

    closeButton() {
      const button = iconButton("fa-xmark", "Close", "asset-map-schematic-close");
      button.dataset.schematicClose = "true";
      return button;
    }

    actionButton(action, pointId, label, className) {
      const button = html("button", className, label);
      button.type = "button";
      button.dataset.assetMapAction = action;
      button.dataset.testPointId = String(pointId);
      return button;
    }

    renderUnpositioned() {
      const missing = this.points.filter((point) => !window.SchematicLayout.hasRelativePosition(point));
      this.unpositionedElement.replaceChildren();
      this.unpositionedElement.hidden = missing.length === 0;
      if (!missing.length) return;
      this.unpositionedElement.append(
        html("h4", "", `Not positioned (${missing.length})`),
        html("p", "muted", "These Test Points have no relative X/Y yet, so they aren't drawn on the schematic."),
      );
      const list = html("ul", "asset-map-schematic-unpositioned-list");
      missing.forEach((point) => {
        const item = html("li");
        const name = html("span", "asset-map-schematic-unpositioned-name");
        name.append(html("span", `asset-map-schematic-dot ${statusClass(point.displayStatus)}`), html("span", "", point.label));
        item.append(name, html("span", "muted", MODE_LABELS[point.coordinateMode] || "Unmapped"));
        const actions = html("span", "asset-map-schematic-unpositioned-actions");
        actions.append(this.actionButton("view-details", point.id, "View details", "btn btn-light"));
        if (this.canManagePositions()) actions.append(this.actionButton("position", point.id, "Set position", "btn btn-light"));
        item.append(actions);
        list.append(item);
      });
      this.unpositionedElement.append(list);
    }
  }

  window.AssetMapSchematicView = AssetMapSchematicView;
})();
