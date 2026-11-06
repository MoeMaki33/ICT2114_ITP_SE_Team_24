const ASSET_MAP_STATE_KEY = "assetMapPageState:v1";
const ASSET_MAP_STATE_TTL_MS = 4 * 60 * 60 * 1000;

class AssetMapFilterState {
  constructor(initialValues = {}) {
    this.values = {
      search: "",
      locationId: "",
      status: "",
      coordinateAvailability: "",
      coordinateMode: "",
      ...initialValues,
    };
  }

  update(values = {}) {
    this.values = { ...this.values, ...values };
  }

  apply(points) {
    return points.filter((point) => matchesFilters(point, this.values));
  }
}

class AssetMapPageController {
  constructor({ repository = new window.AssetMapRepository(), filterState = new AssetMapFilterState() } = {}) {
    this.repository = repository;
    this.weeklyRepository = window.AppRepositories?.WeeklySummaryRepository
      ? new window.AppRepositories.WeeklySummaryRepository()
      : null;
    this.filterState = filterState;
    this.restoredState = readAssetMapPageState();
    this.requestedPointId = normalizeRequestedPointId(new URLSearchParams(location.search).get("selectedPointId"));
    this.filterState.update(this.restoredState.filters);
    this.points = [];
    this.filteredPoints = [];
    this.locations = [];
    this.overlapGroups = new Map();
    this.filteredOverlapGroups = new Map();
    this.selectedPointId = this.requestedPointId || this.restoredState.selectedPointId || null;
    this.viewMode = this.restoredState.viewMode === "schematic" ? "schematic" : "map";
    this.abortController = null;
    this.searchTimer = null;
    this.elements = {};
    this.mapView = null;
    this.schematicView = null;
    this.summaryView = null;
    this.listController = null;
    this.markerPopup = null;
    this.positionController = null;
  }

  init() {
    this.destroy();
    this.abortController = new AbortController();
    this.cacheElements();
    this.restoreFilterControls();

    this.markerPopup = new AssetMapMarkerPopup({
      onClose: () => this.clearSelection({ closePopup: false }),
    });
    this.mapView = new GoogleMapView({
      canvas: this.elements.mapCanvas,
      state: this.elements.canvasState,
      popup: this.markerPopup,
      initialViewport: this.restoredState.viewport,
      onViewportChanged: () => this.persistState(),
      onSelect: (pointId) => this.selectPoint(pointId, { source: "marker", scrollTableRow: false }),
      onOverlapSelect: (pointId) => this.selectPoint(pointId, { source: "marker", scrollTableRow: false }),
    });
    if (window.AssetMapSchematicView && this.elements.schematic) {
      this.schematicView = new window.AssetMapSchematicView({
        root: this.elements.schematic,
        onSelect: (pointId) => this.selectPoint(pointId, { source: "schematic", scrollTableRow: false }),
        onOpenDetails: (pointId) => this.openDetails(pointId),
        canManagePositions: () => isAssetMapAdmin(),
      });
    }
    this.applyViewMode();
    this.summaryView = new AssetMapSummaryView(this.elements.counts);
    this.listController = new AssetMapTableView(this.elements.list, this.elements.tableSummary);
    this.listController.setPageSize(this.restoredState.pageSize, { resetPage: false });
    this.listController.setPage(this.restoredState.page);
    if (this.elements.pageSize) this.elements.pageSize.value = String(this.listController.pageSize);
    this.positionController = new window.TestPointPositionController({
      repository: this.repository,
      getUserRole: () => getAssetMapUserRole(),
      onSaved: (testPointId) => this.handlePositionSaved(testPointId),
    });

    this.bindEvents();
    this.load();
  }

  cacheElements() {
    this.elements = {
      summary: document.getElementById("assetMapSummary"),
      refreshButton: document.getElementById("refreshAssetMap"),
      filterButton: document.getElementById("assetMapFilterButton"),
      filters: document.getElementById("assetMapFilters"),
      search: document.getElementById("assetMapSearch"),
      location: document.getElementById("assetMapLocationFilter"),
      status: document.getElementById("assetMapStatusFilter"),
      coordinateAvailability: document.getElementById("assetMapCoordinateAvailabilityFilter"),
      coordinateMode: document.getElementById("assetMapCoordinateModeFilter"),
      mapCanvas: document.getElementById("assetMapGoogleCanvas"),
      canvasState: document.getElementById("assetMapCanvasState"),
      mapShell: document.querySelector(".asset-map-view-shell"),
      schematic: document.getElementById("assetMapSchematic"),
      viewButtons: [...document.querySelectorAll("[data-asset-map-view]")],
      counts: document.getElementById("assetMapCounts"),
      list: document.getElementById("assetMapList"),
      tableSummary: document.getElementById("assetMapTableSummary"),
      pageSize: document.getElementById("assetMapRowsPerPage"),
    };
  }

  restoreFilterControls() {
    const filters = this.filterState.values;
    if (this.elements.search) this.elements.search.value = filters.search || "";
    if (this.elements.status) this.elements.status.value = filters.status || "";
    if (this.elements.coordinateAvailability) this.elements.coordinateAvailability.value = filters.coordinateAvailability || "";
    if (this.elements.coordinateMode) this.elements.coordinateMode.value = filters.coordinateMode || "";
  }

  bindEvents() {
    const signal = this.abortController.signal;
    this.elements.refreshButton?.addEventListener("click", () => this.load(), { signal });
    this.elements.filterButton?.addEventListener("click", () => this.toggleFilters(), { signal });
    this.elements.viewButtons.forEach((button) => {
      button.addEventListener("click", () => this.setViewMode(button.dataset.assetMapView), { signal });
    });

    [this.elements.location, this.elements.status, this.elements.coordinateAvailability, this.elements.coordinateMode].forEach((element) => {
      element?.addEventListener("change", () => this.applyFilters({ resetPage: true }), { signal });
    });
    this.elements.search?.addEventListener("input", () => {
      window.clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(() => this.applyFilters({ resetPage: true }), 250);
    }, { signal });
    this.elements.pageSize?.addEventListener("change", () => {
      this.listController.setPageSize(Number(this.elements.pageSize.value));
      this.renderList();
      this.persistState();
    }, { signal });

    this.elements.list?.addEventListener("click", (event) => {
      if (event.target.closest("[data-asset-map-action]")) return;
      const target = event.target.closest("[data-select-point]");
      if (target) this.selectPoint(target.dataset.selectPoint, { source: "table", scrollTableRow: false });
      const pageButton = event.target.closest("[data-asset-map-page]");
      if (pageButton) {
        this.listController.setPage(Number(pageButton.dataset.assetMapPage));
        this.renderList();
        this.persistState();
      }
    }, { signal });

    document.addEventListener("click", (event) => {
      const action = event.target.closest("[data-asset-map-action]");
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      const pointId = action.dataset.testPointId;
      if (action.dataset.assetMapAction === "view-details") this.openDetails(pointId);
      if (action.dataset.assetMapAction === "position") this.openPosition(pointId, action);
    }, { signal });

    window.addEventListener("resize", () => this.mapView?.resize(), { signal });
  }

  destroy() {
    this.persistState();
    this.abortController?.abort();
    window.clearTimeout(this.searchTimer);
    this.abortController = null;
    this.mapView?.destroy();
    this.mapView = null;
    this.schematicView?.destroy();
    this.schematicView = null;
    this.positionController?.destroy();
    this.positionController = null;
    this.markerPopup?.destroy();
    this.markerPopup = null;
    this.summaryView = null;
    this.listController = null;
  }

  async load() {
    try {
      this.setLoading();
      const [assetMapPoints, weeklyChangeByPoint] = await Promise.all([
        this.repository.getAssetMapPoints(),
        this.loadLatestWeeklyChanges(),
      ]);
      this.points = assetMapPoints.map((point) => {
        const weekly = weeklyChangeByPoint.get(String(point.id));
        return {
          ...point,
          changeFromStart: weekly?.changeFromStart ?? null,
          statusChange: weekly?.statusChange || "",
        };
      });
      this.locations = getUniqueLocations(this.points);
      this.renderLocationFilter();
      this.ensureRequestedPointVisible();
      this.applyFilters();
      this.consumeRequestedPointParameter();
    } catch (error) {
      console.error("Asset map load failed:", error);
      this.setError(error.message || "Unable to load Asset Map data.");
    }
  }

  async loadLatestWeeklyChanges() {
    if (!this.weeklyRepository) return new Map();
    try {
      const weeks = (await this.weeklyRepository.getAvailableWeeks(32))
        .slice()
        .sort((first, second) => String(second.weekStartDate).localeCompare(String(first.weekStartDate)));
      const latestWeek = weeks[0]?.weekStartDate;
      if (!latestWeek) return new Map();
      const summaries = await this.weeklyRepository.getWeeklySummaries(latestWeek);
      return new Map(summaries.map((summary) => [
        String(summary.testPointUuid),
        {
          changeFromStart: summary.changeFromStart,
          statusChange: summary.statusChange,
        },
      ]));
    } catch (error) {
      console.warn("Asset Map weekly changes could not be loaded. Map data remains available.", error);
      return new Map();
    }
  }

  setLoading() {
    this.elements.summary.textContent = "Loading Asset Map...";
    this.mapView?.clear();
    showState(this.elements.canvasState, "Loading Asset Map...");
    this.summaryView?.setLoading();
    this.listController?.setLoading();
    this.markerPopup?.close({ notify: false });
  }

  setError(message) {
    this.elements.summary.textContent = "Unable to load Asset Map.";
    this.mapView?.clear();
    showState(this.elements.canvasState, escapeHtml(message), "error");
    this.summaryView?.setError();
    this.listController?.setError(message);
    this.markerPopup?.close({ notify: false });
  }

  renderLocationFilter() {
    const currentValue = this.elements.location.value || this.filterState.values.locationId;
    this.elements.location.innerHTML = `
      <option value="">All locations</option>
      ${this.locations.map((location) => `<option value="${escapeHtml(location.id)}">${escapeHtml(location.name)}</option>`).join("")}
    `;
    this.elements.location.value = this.locations.some((location) => location.id === currentValue) ? currentValue : "";
  }

  applyFilters({ resetPage = false } = {}) {
    this.overlapGroups = buildOverlapGroups(this.points);
    this.points.forEach((point) => {
      point.overlapKey = getOverlapKey(point);
      point.isOverlapping = point.hasGps && (this.overlapGroups.get(point.overlapKey)?.length || 0) > 1;
    });

    this.filterState.update(this.getFilters());
    this.filteredPoints = this.filterState.apply(this.points);
    this.filteredOverlapGroups = buildOverlapGroups(this.filteredPoints);
    if (resetPage) this.listController.setPage(1);

    if (this.selectedPointId && !this.filteredPoints.some((point) => point.id === this.selectedPointId)) {
      this.clearSelection();
    } else if (this.selectedPointId) {
      this.listController.ensurePointVisible(this.selectedPointId, this.filteredPoints);
    }

    this.render();
    this.persistState();
  }

  getFilters() {
    return {
      search: String(this.elements.search.value || "").trim().toLowerCase(),
      locationId: this.elements.location.value,
      status: this.elements.status.value,
      coordinateAvailability: this.elements.coordinateAvailability.value,
      coordinateMode: this.elements.coordinateMode.value,
    };
  }

  render() {
    const coordinateCounts = countStatuses(this.filteredPoints);
    this.elements.summary.textContent = `${coordinateCounts.total} visible Test Points | ${coordinateCounts.mapped} GPS mapped | ${coordinateCounts.relativeOnly} relative-only | ${coordinateCounts.unmapped} unmapped`;
    this.summaryView?.render(this.filteredPoints);

    this.renderList();
    if (this.viewMode === "schematic" && this.schematicView) {
      this.renderSchematic();
      return;
    }
    this.mapView.render({
      points: this.filteredPoints,
      selectedPointId: this.selectedPointId,
      overlapGroups: this.filteredOverlapGroups,
    });
  }

  // The schematic shows one location: the filtered one, or else the location
  // with the most positioned Test Points.
  renderSchematic() {
    const choice = window.SchematicLayout.pickLocation(this.filteredPoints, this.filterState.values.locationId);
    this.schematicView.render({
      points: choice.points,
      locationName: choice.locationName,
      autoSelectedLocation: choice.autoSelected,
      otherLocationCount: Math.max(0, choice.locationCount - 1),
      selectedPointId: this.selectedPointId,
    });
  }

  setViewMode(mode) {
    const next = mode === "schematic" && this.schematicView ? "schematic" : "map";
    if (next === this.viewMode) return;
    this.viewMode = next;
    this.markerPopup?.close({ notify: false });
    this.applyViewMode();
    this.render();
    if (next === "map") requestAnimationFrame(() => this.mapView?.resize());
    this.persistState();
  }

  applyViewMode() {
    const schematic = this.viewMode === "schematic" && Boolean(this.schematicView);
    if (this.elements.mapShell) this.elements.mapShell.hidden = schematic;
    if (this.elements.schematic) this.elements.schematic.hidden = !schematic;
    this.elements.viewButtons.forEach((button) => {
      const active = button.dataset.assetMapView === (schematic ? "schematic" : "map");
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  ensureRequestedPointVisible() {
    if (!this.requestedPointId || !this.points.some((point) => point.id === this.requestedPointId)) return;
    if (this.filterState.apply(this.points).some((point) => point.id === this.requestedPointId)) return;
    this.filterState.update({ search: "", locationId: "", status: "", coordinateAvailability: "", coordinateMode: "" });
    this.restoreFilterControls();
    if (this.elements.location) this.elements.location.value = "";
  }

  consumeRequestedPointParameter() {
    if (!this.requestedPointId) return;
    const url = new URL(location.href);
    url.searchParams.delete("selectedPointId");
    history.replaceState({ ...(history.state || {}), page: "asset-map.php" }, "", url);
    this.requestedPointId = null;
  }

  renderList() {
    this.listController.render({
      points: this.filteredPoints,
      selectedPointId: this.selectedPointId,
    });
  }

  toggleFilters() {
    const hidden = this.elements.filters.toggleAttribute("hidden");
    this.elements.filterButton.setAttribute("aria-expanded", String(!hidden));
  }

  selectPoint(testPointId, { source = "unknown", scrollTableRow = false } = {}) {
    const point = this.points.find((item) => item.id === testPointId);
    if (!point) return;

    this.selectedPointId = testPointId;
    this.listController.ensurePointVisible(testPointId, this.filteredPoints);
    this.renderList();

    if (this.viewMode === "schematic") this.schematicView?.setSelectedPoint(point.id);
    else if (point.hasGps) this.mapView.focusPoint(point.id, { openPopup: true });
    else this.markerPopup?.close({ notify: false });
    if (scrollTableRow) requestAnimationFrame(() => {
      const row = [...this.elements.list.querySelectorAll("tr[data-select-point]")]
        .find((element) => element.dataset.selectPoint === testPointId);
      row?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    this.persistState();
  }

  clearSelection({ closePopup = true } = {}) {
    this.selectedPointId = null;
    if (closePopup) this.markerPopup?.close({ notify: false });
    this.mapView?.setSelectedPoint(null);
    this.schematicView?.setSelectedPoint(null);
    this.listController?.render({ points: this.filteredPoints, selectedPointId: null });
    this.persistState();
  }

  openDetails(testPointId) {
    if (!this.points.some((point) => point.id === testPointId)) return;
    this.selectedPointId = testPointId;
    this.persistState();
    const target = window.AppNavigation?.buildTestPointDetailUrl?.(testPointId, {
      returnTo: "asset-map.php",
      returnSearch: location.search,
    }) || `testpoint-view.php?id=${encodeURIComponent(testPointId)}&returnTo=asset-map.php`;
    if (window.AppNavigation?.navigateToPage) window.AppNavigation.navigateToPage(target);
    else location.assign(target);
  }

  openPosition(testPointId, trigger) {
    const point = this.points.find((item) => item.id === testPointId);
    if (!point || !this.positionController) return;
    this.selectPoint(testPointId, { source: "position-action", scrollTableRow: false });
    this.positionController.open(toPositionControllerPoint(point), { trigger }).catch((error) => {
      console.error("Unable to open Test Point position:", error);
      window.AppToast?.error?.(error.message || "Unable to open the Test Point position.");
    });
  }

  async handlePositionSaved(testPointId) {
    const viewport = this.mapView?.getViewport();
    if (viewport) this.mapView?.setPendingViewport(viewport);
    this.selectedPointId = testPointId;
    await this.load();
  }

  persistState() {
    if (!this.listController) return;
    writeAssetMapPageState({
      filters: this.getFilters(),
      page: this.listController.page,
      pageSize: this.listController.pageSize,
      selectedPointId: this.selectedPointId,
      viewport: this.mapView?.getViewport() || this.restoredState.viewport,
      viewMode: this.viewMode,
    });
  }
}

class AssetMapMarkerPopup {
  constructor({ onClose } = {}) {
    this.onClose = onClose;
    this.infoWindow = null;
    this.closeListener = null;
    this.maps = null;
    this.selectedPointId = null;
  }

  open({ maps, map, marker, point }) {
    if (!maps || !map || !point?.hasGps) return;
    this.ensureInfoWindow(maps);
    this.close({ notify: false });
    this.selectedPointId = point.id;
    this.infoWindow.setOptions({
      content: this.render(point),
      ariaLabel: `${point.displayId || point.label || "Test Point"} details`,
      maxWidth: 360,
    });

    const visibleAnchor = marker?.getMap?.() ? marker : null;
    if (visibleAnchor) {
      this.infoWindow.open({ map, anchor: visibleAnchor, shouldFocus: false });
    } else {
      this.infoWindow.setPosition({ lat: Number(point.latitude), lng: Number(point.longitude) });
      this.infoWindow.open({ map, shouldFocus: false });
    }

    this.closeListener = this.infoWindow.addListener("closeclick", () => {
      this.closeListener?.remove?.();
      this.closeListener = null;
      this.selectedPointId = null;
      this.onClose?.();
    });
  }

  ensureInfoWindow(maps) {
    if (this.infoWindow && this.maps === maps) return;
    this.destroy();
    this.maps = maps;
    this.infoWindow = new maps.InfoWindow({ maxWidth: 360 });
  }

  render(point) {
    const updatedAt = point.latestReadingTimestamp || point.positionUpdatedAt;
    const positionLabel = isAssetMapAdmin() ? "Edit Position" : "View Position";
    const pointLabel = point.displayId || point.label || "Test Point";
    return `
      <article class="asset-map-marker-popup" aria-label="Selected Test Point details">
        <header>
          <span class="eyebrow">Selected Test Point</span>
          <h3>${escapeHtml(point.displayId)}</h3>
          <p>${escapeHtml(point.label)}</p>
        </header>
        <div class="asset-map-popup-reading">
          <div>
            <span>Latest reading</span>
            <strong>${escapeHtml(formatPopupMv(point.latestReading))}</strong>
          </div>
          ${statusBadge(point.displayStatus)}
        </div>
        <dl>
          ${popupDetailRow("Location", point.siteName || "Not available")}
          ${popupDetailRow("Type", formatTestPointType(point.type))}
          ${popupDetailRow("Display status", point.displayStatus || "Unknown")}
          ${popupDetailRow("Technical status", point.protectionStatus || "Unknown")}
          ${popupDetailRow("Threshold", formatPopupThreshold(point.thresholdMv))}
          ${popupDetailRow("GPS coordinates", formatPopupCoordinates(point))}
          ${popupDetailRow("Last updated", updatedAt ? formatRelativeDateTime(updatedAt) : "Not available")}
          ${popupDetailRow("Assigned engineer", point.assignedEngineerName || "Unassigned")}
        </dl>
        <div class="asset-map-popup-actions">
          <button class="btn btn-green" type="button" data-asset-map-action="view-details" data-test-point-id="${escapeHtml(point.id)}" aria-label="View details for ${escapeHtml(pointLabel)}">
            View Details
          </button>
          <button class="btn btn-light" type="button" data-asset-map-action="position" data-test-point-id="${escapeHtml(point.id)}" aria-label="${positionLabel} for ${escapeHtml(pointLabel)}">
            ${positionLabel}
          </button>
        </div>
      </article>`;
  }

  close({ notify = false } = {}) {
    const hadSelection = Boolean(this.selectedPointId);
    this.closeListener?.remove?.();
    this.closeListener = null;
    this.infoWindow?.close();
    this.selectedPointId = null;
    if (notify && hadSelection) this.onClose?.();
  }

  destroy() {
    this.close({ notify: false });
    this.infoWindow = null;
    this.maps = null;
  }
}

class GoogleMapView {
  constructor({ canvas, state, popup, initialViewport, onViewportChanged, onSelect, onOverlapSelect }) {
    this.canvas = canvas;
    this.state = state;
    this.popup = popup;
    this.onSelect = onSelect;
    this.onOverlapSelect = onOverlapSelect;
    this.onViewportChanged = onViewportChanged;
    this.map = null;
    this.clusterer = null;
    this.markers = new Map();
    this.listeners = [];
    this.overlapInfoWindow = null;
    this.selectedMarkerOverlay = null;
    this.pendingRender = null;
    this.currentPoints = [];
    this.currentOverlapGroups = new Map();
    this.selectedPointId = null;
    this.pendingViewport = normalizeMapViewport(initialViewport);
    this.resizeFrame = null;
  }

  async render({ points, selectedPointId, overlapGroups }) {
    this.currentPoints = points;
    this.currentOverlapGroups = overlapGroups;
    this.selectedPointId = selectedPointId;

    if (!window.GoogleMapsLoader?.hasApiKey?.()) {
      this.clear();
      showState(
        this.state,
        "Google Maps API key is not configured.<br>Please configure APP_CONFIG.googleMapsApiKey.",
        "warning"
      );
      return;
    }

    const mappedPoints = points.filter((point) => point.hasGps);
    if (!mappedPoints.length) {
      this.clear();
      showState(this.state, "No Test Points with GPS coordinates match the current filters.");
      return;
    }

    this.pendingRender = Symbol("asset-map-render");
    const renderToken = this.pendingRender;

    try {
      hideState(this.state);
      const maps = await window.GoogleMapsLoader.loadMaps();
      const clustererLibrary = await window.GoogleMapsLoader.loadMarkerClusterer();
      if (renderToken !== this.pendingRender) return;

      this.ensureMap(maps);
      this.renderMarkers({ maps, clustererLibrary, mappedPoints });
    } catch (error) {
      console.error("Google Maps load failed:", error);
      this.clear();
      const message = error?.message === "GOOGLE_MAPS_API_KEY_MISSING"
        ? "Google Maps API key is not configured.<br>Please configure APP_CONFIG.googleMapsApiKey."
        : "Unable to load Google Maps.<br>Please check the API key, billing, and referrer restrictions.";
      showState(this.state, message, "error");
    }
  }

  ensureMap(maps) {
    this.maps = maps;
    if (this.map) return;

    const config = window.APP_CONFIG || {};
    this.map = new maps.Map(this.canvas, {
      center: this.pendingViewport
        ? { lat: this.pendingViewport.lat, lng: this.pendingViewport.lng }
        : { lat: 1.3521, lng: 103.8198 },
      zoom: this.pendingViewport?.zoom || 11,
      mapId: config.googleMapsMapId || undefined,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
    });
    this.overlapInfoWindow = new maps.InfoWindow({ maxWidth: 330 });
  }

  renderMarkers({ maps, clustererLibrary, mappedPoints }) {
    this.popup?.close({ notify: false });
    this.clearMarkersOnly();

    const bounds = new maps.LatLngBounds();
    const showLabels = this.shouldShowMarkerLabels();
    mappedPoints.forEach((point) => {
      const marker = new maps.Marker({
        position: { lat: Number(point.latitude), lng: Number(point.longitude) },
        title: `${point.displayId} — ${point.status}`,
        icon: createMarkerIcon(maps, point.status, point.displayId, point.id === this.selectedPointId, showLabels),
        optimized: true,
        zIndex: point.id === this.selectedPointId ? Number(maps.Marker.MAX_ZINDEX) + 100 : undefined,
      });
      marker.assetMapPoint = point;
      bounds.extend(marker.getPosition());

      const listener = marker.addListener("click", () => this.handleMarkerClick(marker));
      this.listeners.push(listener);
      this.markers.set(point.id, marker);
    });

    const markers = [...this.markers.values()];
    this.clusterer = new clustererLibrary.MarkerClusterer({
      map: this.map,
      markers,
      renderer: {
        render: ({ count, position, markers: clusterMarkers }) => {
          const points = clusterMarkers.map((marker) => marker.assetMapPoint).filter(Boolean);
          const breakdown = countStatuses(points);
          const status = highestSeverityStatus(points);
          return new maps.Marker({
            position,
            label: { text: String(count), color: "#ffffff", fontSize: "13px", fontWeight: "800" },
            title: clusterTitle(count, breakdown),
            icon: createClusterIcon(maps, status),
            zIndex: Number(maps.Marker.MAX_ZINDEX) + count,
          });
        },
      },
      onClusterClick: (event, cluster, map) => {
        const points = (cluster.markers || []).map((marker) => marker.assetMapPoint).filter(Boolean);
        const uniqueOverlapKeys = new Set(points.map((point) => point.overlapKey).filter(Boolean));
        if (uniqueOverlapKeys.size === 1 && points.length > 1 && map.getZoom() >= 18) {
          this.openOverlapList(points, cluster.position);
          return;
        }
        if (cluster.bounds) map.fitBounds(cluster.bounds);
        else map.setZoom(Math.min((map.getZoom() || 12) + 2, 21));
      },
    });

    this.listeners.push(this.map.addListener("zoom_changed", () => this.updateMarkerIcons()));
    this.listeners.push(this.map.addListener("idle", () => this.onViewportChanged?.(this.getViewport())));

    const restoredViewport = this.pendingViewport;
    this.pendingViewport = null;
    if (restoredViewport) {
      this.map.setCenter({ lat: restoredViewport.lat, lng: restoredViewport.lng });
      this.map.setZoom(restoredViewport.zoom);
    } else if (markers.length === 1) {
      this.map.setCenter(markers[0].getPosition());
      this.map.setZoom(Math.max(this.map.getZoom() || 11, 16));
    } else {
      this.map.fitBounds(bounds, 60);
    }

    this.syncSelectedMarkerOverlay();
    if (this.selectedPointId) this.focusPoint(this.selectedPointId, { openPopup: true });
  }

  handleMarkerClick(marker) {
    const point = marker.assetMapPoint;
    const overlaps = this.currentOverlapGroups.get(point.overlapKey) || [];
    if (overlaps.length > 1) {
      this.openOverlapList(overlaps, marker.getPosition());
      return;
    }
    this.onSelect(point.id);
  }

  openOverlapList(points, position) {
    if (!this.overlapInfoWindow) return;
    this.popup?.close({ notify: true });
    const content = `
      <div class="asset-map-overlap-popup">
        <strong>${points.length} Test Points share this position</strong>
        <div>
          ${points.map((point) => `
            <button type="button" data-overlap-point="${escapeHtml(point.id)}">
              <span>${escapeHtml(point.displayId)}</span>
              <small>${escapeHtml(point.status)} | ${formatMv(point.latestReading)}</small>
            </button>
          `).join("")}
        </div>
      </div>`;

    this.overlapInfoWindow.setContent(content);
    this.overlapInfoWindow.setPosition(position);
    this.overlapInfoWindow.open(this.map);

    const listener = google.maps.event.addListenerOnce(this.overlapInfoWindow, "domready", () => {
      document.querySelectorAll("[data-overlap-point]").forEach((button) => {
        button.addEventListener("click", () => {
          this.overlapInfoWindow.close();
          this.onOverlapSelect(button.dataset.overlapPoint);
        }, { once: true });
      });
    });
    this.listeners.push(listener);
  }

  focusPoint(pointId, { openPopup = false } = {}) {
    this.setSelectedPoint(pointId);
    const marker = this.markers.get(pointId);
    if (!marker || !this.map) return;
    this.map.panTo(marker.getPosition());
    this.map.setZoom(Math.max(this.map.getZoom() || 16, 18));
    if (openPopup) this.openPointPopup(pointId);
  }

  getViewport() {
    const center = this.map?.getCenter?.();
    const viewport = center ? {
      lat: Number(center.lat()),
      lng: Number(center.lng()),
      zoom: Number(this.map.getZoom()),
    } : null;
    return normalizeMapViewport(viewport);
  }

  setPendingViewport(viewport) {
    this.pendingViewport = normalizeMapViewport(viewport);
  }

  resize() {
    if (!this.map || !this.maps || this.resizeFrame) return;
    const center = this.map.getCenter?.();
    this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = null;
      this.maps.event.trigger(this.map, "resize");
      if (center) this.map.setCenter(center);
    });
  }

  setSelectedPoint(pointId) {
    this.selectedPointId = pointId;
    this.updateMarkerIcons();
  }

  shouldShowMarkerLabels() {
    return (this.map?.getZoom?.() || 0) >= 15;
  }

  updateMarkerIcons() {
    if (!this.maps) return;
    const showLabels = this.shouldShowMarkerLabels();
    this.markers.forEach((marker, id) => {
      const selected = id === this.selectedPointId;
      marker.setIcon(createMarkerIcon(this.maps, marker.assetMapPoint.status, marker.assetMapPoint.displayId, selected, showLabels));
      marker.setZIndex(selected ? Number(this.maps.Marker.MAX_ZINDEX) + 100 : undefined);
    });
    this.syncSelectedMarkerOverlay();
  }

  syncSelectedMarkerOverlay() {
    if (!this.selectedPointId || !this.map || !this.maps) {
      this.selectedMarkerOverlay?.setMap(null);
      this.selectedMarkerOverlay = null;
      return;
    }
    const marker = this.markers.get(this.selectedPointId);
    const point = marker?.assetMapPoint;
    if (!marker || !point) {
      this.selectedMarkerOverlay?.setMap(null);
      this.selectedMarkerOverlay = null;
      return;
    }
    if (this.selectedMarkerOverlay) {
      this.selectedMarkerOverlay.setMap(this.map);
      this.selectedMarkerOverlay.setPosition(marker.getPosition());
      this.selectedMarkerOverlay.setIcon(createMarkerIcon(this.maps, point.status, point.displayId, true, true));
      this.selectedMarkerOverlay.setTitle(`${point.displayId} — selected`);
      return;
    }
    this.selectedMarkerOverlay = new this.maps.Marker({
      map: this.map,
      position: marker.getPosition(),
      title: `${point.displayId} — selected`,
      icon: createMarkerIcon(this.maps, point.status, point.displayId, true, true),
      clickable: false,
      optimized: true,
      zIndex: Number(this.maps.Marker.MAX_ZINDEX) + 1000,
    });
  }

  openPointPopup(pointId) {
    const marker = this.markers.get(pointId);
    const point = marker?.assetMapPoint;
    if (!marker || !point || !this.map || !this.maps) return;
    this.overlapInfoWindow?.close();
    this.syncSelectedMarkerOverlay();
    this.popup?.open({
      maps: this.maps,
      map: this.map,
      marker: this.selectedMarkerOverlay || marker,
      point,
    });
  }

  clear() {
    this.pendingRender = Symbol("asset-map-clear");
    this.popup?.close({ notify: false });
    this.clearMarkersOnly();
    this.overlapInfoWindow?.close();
  }

  clearMarkersOnly() {
    this.listeners.forEach((listener) => listener?.remove?.());
    this.listeners = [];
    this.clusterer?.clearMarkers?.();
    this.clusterer = null;
    this.selectedMarkerOverlay?.setMap(null);
    this.selectedMarkerOverlay = null;
    this.markers.forEach((marker) => marker.setMap(null));
    this.markers.clear();
  }

  hideState() {
    hideState(this.state);
  }

  destroy() {
    if (this.resizeFrame) cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = null;
    this.clear();
    this.map = null;
    this.maps = null;
    this.overlapInfoWindow = null;
    this.popup = null;
  }
}

class AssetMapSummaryView {
  constructor(root) {
    this.root = root;
  }

  setLoading() {
    if (this.root) this.root.innerHTML = `<div class="asset-map-panel-state">Loading summary…</div>`;
  }

  setError() {
    if (this.root) this.root.innerHTML = `<div class="asset-map-panel-state error">Summary unavailable.</div>`;
  }

  render(points) {
    if (!this.root) return;
    const counts = countStatuses(points);
    this.root.innerHTML = `
      <div class="asset-map-counts asset-map-primary-counts">
        <span><strong>${counts.total}</strong>Total</span>
        <span><strong>${counts.protected}</strong>Protected</span>
        <span><strong>${counts.warning}</strong>Warning</span>
        <span><strong>${counts.unprotected}</strong>Unprotected</span>
        <span><strong>${counts.unknown}</strong>Unknown</span>
        <span><strong>${counts.unmapped}</strong>Unmapped</span>
      </div>
      <div class="asset-map-summary-group technical">
        <span>Technical classification</span>
        <strong>${counts.technicallyUnprotected} Technically unprotected</strong>
        <small>Includes ${counts.technicalWarnings} Warning + ${counts.technicalUnprotected} Unprotected display statuses.</small>
      </div>`;
  }
}

class AssetMapTableView {
  constructor(root, summary) {
    this.root = root;
    this.summary = summary;
    this.page = 1;
    const preferredRows = Number(window.AppPreferences?.getCurrent?.().tableRows);
    this.pageSize = [10, 25, 50].includes(preferredRows) ? preferredRows : 25;
  }

  setPage(page) {
    this.page = Math.max(1, Number(page) || 1);
  }

  setPageSize(pageSize, { resetPage = true } = {}) {
    this.pageSize = [10, 25, 50, 100].includes(pageSize) ? pageSize : 25;
    if (resetPage) this.page = 1;
  }

  ensurePointVisible(pointId, points) {
    const index = points.findIndex((point) => point.id === pointId);
    if (index >= 0) this.page = Math.floor(index / this.pageSize) + 1;
  }

  setLoading() {
    if (this.summary) this.summary.textContent = "Loading Test Points…";
    this.root.innerHTML = `<div class="asset-map-panel-state">Loading Test Points…</div>`;
  }

  setError(message) {
    if (this.summary) this.summary.textContent = "Unable to load Test Point information.";
    this.root.innerHTML = `
      <div class="asset-map-panel-state error">
        <strong>Unable to load Test Point information.</strong>
        <span>${escapeHtml(message)}</span>
      </div>`;
  }

  render({ points, selectedPointId }) {
    const totalPages = Math.max(1, Math.ceil(points.length / this.pageSize));
    this.page = Math.min(this.page, totalPages);
    const start = (this.page - 1) * this.pageSize;
    const pagePoints = points.slice(start, start + this.pageSize);
    if (this.summary) this.summary.textContent = `${points.length} filtered Test Point${points.length === 1 ? "" : "s"}`;
    if (!points.length) {
      this.root.innerHTML = `<div class="asset-map-panel-state">No Test Points match the selected filters.</div>`;
      return;
    }

    this.root.innerHTML = `
      <div class="table-scroll app-table-scroll asset-map-table-scroll">
        <table class="asset-map-data-table app-table">
          <thead class="app-table-header">
            <tr>
              <th scope="col">Test Point</th>
              <th scope="col">Location</th>
              <th scope="col">Latest Reading</th>
              <th scope="col">Change This Week</th>
              <th scope="col">Display Status</th>
              <th scope="col">Technical Status</th>
              <th scope="col">Coordinate Mode</th>
              <th scope="col">Coordinates</th>
              <th scope="col">Assigned Engineer</th>
              <th scope="col">Last Reading</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            ${pagePoints.map((point) => this.renderRow(point, selectedPointId)).join("")}
          </tbody>
        </table>
      </div>
      ${this.renderPagination(points.length, totalPages, start)}`;
  }

  renderPagination(total, totalPages, start) {
    const end = Math.min(start + this.pageSize, total);
    return `
      <div class="asset-map-pagination app-table-footer" aria-label="Asset Map Test Point pages">
        <span>Showing ${start + 1}–${end} of ${total}</span>
        <button class="page-btn" type="button" data-asset-map-page="${this.page - 1}" ${this.page === 1 ? "disabled" : ""} aria-label="Previous page">&lt;</button>
        <span>Page ${this.page} of ${totalPages}</span>
        <button class="page-btn" type="button" data-asset-map-page="${this.page + 1}" ${this.page === totalPages ? "disabled" : ""} aria-label="Next page">&gt;</button>
      </div>`;
  }

  renderRow(point, selectedPointId) {
    const selected = point.id === selectedPointId;
    const positionLabel = isAssetMapAdmin() ? "Edit Position" : "View Position";
    const pointLabel = point.displayId || point.label || "Test Point";
    return `
      <tr class="${selected ? "active" : ""}" data-select-point="${escapeHtml(point.id)}" aria-selected="${selected}">
        <td>
          <button class="testpoint-link-button asset-map-table-point" type="button" data-select-point="${escapeHtml(point.id)}">
            ${selected ? `<i class="fa-solid fa-location-dot asset-map-row-selection" aria-hidden="true"></i><span class="visually-hidden">Selected Test Point. </span>` : ""}
            <strong>${escapeHtml(point.displayId)}</strong>
            <span>${escapeHtml(point.label)}${point.type ? ` · ${escapeHtml(point.type)}` : ""}</span>
          </button>
        </td>
        <td>${escapeHtml(point.siteName)}</td>
        <td><strong>${formatTableMv(point.latestReading)}</strong></td>
        <td>${renderAssetMapWeeklyChange(point)}</td>
        <td>${statusBadge(point.displayStatus)}</td>
        <td>${statusBadge(point.protectionStatus)}</td>
        <td>${escapeHtml(coordinateModeLabel(point.coordinateMode))}</td>
        <td><div class="asset-map-table-coordinate">${escapeHtml(formatTableCoordinates(point))}</div></td>
        <td>${escapeHtml(point.assignedEngineerName || "Unassigned")}</td>
        <td>${escapeHtml(formatTableDateTime(point.latestReadingTimestamp))}</td>
        <td>
          <div class="asset-map-table-actions">
            <button class="btn btn-light compact" type="button" data-asset-map-action="view-details" data-test-point-id="${escapeHtml(point.id)}" aria-label="View details for ${escapeHtml(pointLabel)}">View Details</button>
            <button class="btn btn-light compact" type="button" data-asset-map-action="position" data-test-point-id="${escapeHtml(point.id)}" aria-label="${positionLabel} for ${escapeHtml(pointLabel)}">${positionLabel}</button>
          </div>
        </td>
      </tr>`;
  }
}

function renderAssetMapWeeklyChange(point) {
  return window.AppTrendPresentation?.renderTrendValue?.({
    deltaMv: point.changeFromStart,
    semanticStatus: point.statusChange,
    context: "week",
  }) || '<span aria-label="No weekly change available">&mdash;</span>';
}

function matchesFilters(point, filters) {
  const searchable = [point.displayId, point.label, point.siteName, point.type, point.assignedEngineerName]
    .join(" ")
    .toLowerCase();

  if (filters.search && !searchable.includes(filters.search)) return false;
  if (filters.locationId && point.locationId !== filters.locationId) return false;
  if (filters.status && point.status !== filters.status) return false;
  if (filters.coordinateMode && point.coordinateMode !== filters.coordinateMode) return false;

  if (filters.coordinateAvailability === "gps" && !point.hasGps) return false;
  if (filters.coordinateAvailability === "relative" && (point.hasGps || !point.hasRelative)) return false;
  if (filters.coordinateAvailability === "missing" && (point.hasGps || point.hasRelative)) return false;
  if (filters.coordinateAvailability === "overlapping" && !point.isOverlapping) return false;

  return true;
}

function getUniqueLocations(points) {
  const locations = new Map();
  points.forEach((point) => {
    if (!point.locationId) return;
    locations.set(point.locationId, point.siteName || "Not available");
  });
  return [...locations.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((first, second) => first.name.localeCompare(second.name));
}

function buildOverlapGroups(points) {
  const groups = new Map();
  points.filter((point) => point.hasGps).forEach((point) => {
    const key = getOverlapKey(point);
    const group = groups.get(key) || [];
    group.push(point);
    groups.set(key, group);
  });
  return groups;
}

function getOverlapKey(point) {
  if (!point?.hasGps) return "";
  return `${Number(point.latitude).toFixed(5)},${Number(point.longitude).toFixed(5)}`;
}

function countStatuses(points) {
  return {
    total: points.length,
    protected: points.filter((point) => point.status === "Protected").length,
    warning: points.filter((point) => point.status === "Warning").length,
    unprotected: points.filter((point) => point.status === "Unprotected").length,
    unknown: points.filter((point) => point.status === "Unknown").length,
    technicallyUnprotected: points.filter((point) => point.protectionStatus === "Unprotected").length,
    technicalWarnings: points.filter((point) => point.protectionStatus === "Unprotected" && point.displayStatus === "Warning").length,
    technicalUnprotected: points.filter((point) => point.protectionStatus === "Unprotected" && point.displayStatus === "Unprotected").length,
    mapped: points.filter((point) => point.hasGps).length,
    relativeOnly: points.filter((point) => !point.hasGps && point.hasRelative).length,
    unmapped: points.filter((point) => !point.hasGps && !point.hasRelative).length,
  };
}

function highestSeverityStatus(points) {
  const severity = { Unprotected: 4, Warning: 3, Unknown: 2, Protected: 1 };
  return points.reduce((highest, point) => {
    return (severity[point.status] || 0) > (severity[highest] || 0) ? point.status : highest;
  }, "Protected");
}

function clusterTitle(count, counts) {
  return [
    `${count} Test Points`,
    `${counts.protected} Protected`,
    `${counts.warning} Warning`,
    `${counts.unprotected} Unprotected`,
    `${counts.unknown} Unknown`,
  ].join("\n");
}

function createMarkerIcon(maps, status, label, selected = false, showLabel = true) {
  const color = statusColor(status);
  if (!showLabel && !selected) {
    const size = 30;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="15" cy="15" r="11" fill="${color}" stroke="#ffffff" stroke-width="4"/>
        <circle cx="15" cy="15" r="3.5" fill="#ffffff"/>
      </svg>`;
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new maps.Size(size, size),
      anchor: new maps.Point(15, 15),
    };
  }

  const compactLabel = compactMarkerLabel(label);
  const width = Math.min(170, Math.max(86, 48 + compactLabel.length * 7));
  const height = selected ? 40 : 36;
  const centerY = height / 2;
  const stroke = selected ? "#0073bc" : "#d8e2ec";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <filter id="shadow" x="-15%" y="-25%" width="140%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#0f172a" flood-opacity="0.22"/>
        </filter>
      </defs>
      <g filter="url(#shadow)">
        <rect x="2" y="2" width="${width - 4}" height="${height - 4}" rx="9" fill="#ffffff" stroke="${stroke}" stroke-width="${selected ? 2.5 : 1.25}"/>
        <rect x="2" y="2" width="9" height="${height - 4}" rx="7" fill="${color}"/>
        <circle cx="17" cy="${centerY}" r="6" fill="${color}" stroke="#ffffff" stroke-width="2"/>
        <text x="30" y="${centerY + 4.5}" fill="#051435" font-family="Arial, sans-serif" font-size="12" font-weight="700">${escapeHtml(compactLabel)}</text>
      </g>
    </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new maps.Size(width, height),
    anchor: new maps.Point(17, centerY),
  };
}

function compactMarkerLabel(value) {
  const label = String(value || "Test Point").trim() || "Test Point";
  return label.length > 18 ? `${label.slice(0, 17)}…` : label;
}

function createClusterIcon(maps, status) {
  const color = statusColor(status);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="54" height="54" viewBox="0 0 54 54">
      <circle cx="27" cy="27" r="24" fill="#051435" fill-opacity="0.94" stroke="#ffffff" stroke-width="4"/>
      <circle cx="27" cy="27" r="18" fill="none" stroke="rgba(142,216,248,0.72)" stroke-width="2"/>
      <circle cx="39" cy="39" r="8" fill="${color}" stroke="#ffffff" stroke-width="2"/>
    </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new maps.Size(54, 54),
    anchor: new maps.Point(27, 27),
  };
}

function statusColor(status) {
  if (status === "Protected") return "#00857e";
  if (status === "Warning") return "#fdc82f";
  if (status === "Unprotected") return "#da1a35";
  return "#64748b";
}

function statusBadge(status) {
  const statusClass = window.AppStatus?.statusClass?.(status) || "gray-bg";
  return `<span class="badge ${statusClass}">${escapeHtml(status || "Unknown")}</span>`;
}

function formatTableMv(value) {
  if (value === null || value === undefined || value === "") return "—";
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value))} mV` : "—";
}

function formatTableCoordinates(point) {
  const gps = point.hasGps
    ? `${Number(point.latitude).toFixed(6)}, ${Number(point.longitude).toFixed(6)}`
    : "";
  const relative = point.hasRelative
    ? `X ${formatNumber(point.relativeX)}m, Y ${formatNumber(point.relativeY)}m${Number.isFinite(point.relativeZ) ? `, Z ${formatNumber(point.relativeZ)}m` : ""}`
    : "";
  if (gps && relative) return `${gps}; ${relative}`;
  return gps || relative || "Not configured";
}

function formatTableDateTime(value) {
  return value ? formatDateTime(value) : "—";
}

function isAssetMapAdmin() {
  return getAssetMapUserRole() === "admin";
}

function getAssetMapUserRole() {
  try {
    return localStorage.getItem("userRole") || "engineer";
  } catch (_error) {
    return "engineer";
  }
}

function toPositionControllerPoint(point) {
  return {
    ...point,
    position: {
      coordinateMode: point.coordinateMode,
      latitude: point.latitude,
      longitude: point.longitude,
      relativeX: point.relativeX,
      relativeY: point.relativeY,
      relativeZ: point.relativeZ,
      chainageM: point.chainageM,
      coordinateAccuracyM: point.coordinateAccuracyM,
      coordinateSource: point.coordinateSource,
      hasGps: point.hasGps,
      hasRelative: point.hasRelative,
    },
  };
}

function normalizeMapViewport(value) {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  const zoom = Number(value?.zoom);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return null;
  if (!Number.isFinite(zoom) || zoom < 2 || zoom > 22) return null;
  return { lat, lng, zoom };
}

function normalizeRequestedPointId(value) {
  const candidate = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : null;
}

function emptyAssetMapPageState() {
  const preferredRows = Number(window.AppPreferences?.getCurrent?.().tableRows);
  return {
    filters: {
      search: "",
      locationId: "",
      status: "",
      coordinateAvailability: "",
      coordinateMode: "",
    },
    page: 1,
    pageSize: [10, 25, 50].includes(preferredRows) ? preferredRows : 25,
    selectedPointId: null,
    viewport: null,
    viewMode: "map",
  };
}

function readAssetMapPageState() {
  const fallback = emptyAssetMapPageState();
  try {
    const stored = JSON.parse(sessionStorage.getItem(ASSET_MAP_STATE_KEY) || "null");
    const savedAt = Number(stored?.savedAt);
    if (!stored || !Number.isFinite(savedAt) || savedAt <= 0 || savedAt > Date.now() + 60000 || Date.now() - savedAt > ASSET_MAP_STATE_TTL_MS) {
      sessionStorage.removeItem(ASSET_MAP_STATE_KEY);
      return fallback;
    }
    const filters = stored.filters || {};
    const storedPage = Number(stored.page);
    return {
      filters: {
        search: String(filters.search || "").slice(0, 200),
        locationId: String(filters.locationId || "").slice(0, 100),
        status: ["Protected", "Warning", "Unprotected", "Unknown"].includes(filters.status) ? filters.status : "",
        coordinateAvailability: ["gps", "relative", "missing", "overlapping"].includes(filters.coordinateAvailability) ? filters.coordinateAvailability : "",
        coordinateMode: ["gps", "relative", "gps_and_relative", "unmapped"].includes(filters.coordinateMode) ? filters.coordinateMode : "",
      },
      page: Number.isInteger(storedPage) && storedPage > 0 ? storedPage : 1,
      pageSize: [10, 25, 50, 100].includes(Number(stored.pageSize)) ? Number(stored.pageSize) : fallback.pageSize,
      selectedPointId: stored.selectedPointId ? String(stored.selectedPointId).slice(0, 100) : null,
      viewport: normalizeMapViewport(stored.viewport),
      viewMode: stored.viewMode === "schematic" ? "schematic" : "map",
    };
  } catch (_error) {
    return fallback;
  }
}

function writeAssetMapPageState(state) {
  try {
    sessionStorage.setItem(ASSET_MAP_STATE_KEY, JSON.stringify({
      ...state,
      savedAt: Date.now(),
    }));
  } catch (_error) {
    // State persistence is an enhancement; the map remains usable without storage.
  }
}

function popupDetailRow(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "Not available")}</dd></div>`;
}

function formatTestPointType(value) {
  const type = String(value || "").trim().toLowerCase();
  if (["stationary", "fixed"].includes(type)) return "Fixed Test Point";
  if (["variable", "portable", "mobile"].includes(type)) return "Variable Test Point";
  if (!type) return "Not available";
  return `${type.charAt(0).toUpperCase()}${type.slice(1)} Test Point`;
}

function formatPopupMv(value) {
  if (value === null || value === undefined || value === "") return "No data";
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value))} mV` : "No data";
}

function formatPopupThreshold(value) {
  if (value === null || value === undefined || value === "") return "Not configured";
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value))} mV` : "Not configured";
}

function formatPopupCoordinates(point) {
  if (!point?.hasGps) return "Not configured";
  return `${Number(point.latitude).toFixed(6)}, ${Number(point.longitude).toFixed(6)}`;
}

function formatRelativeDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  const elapsedSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(elapsedSeconds);
  let unit = "second";
  let amount = elapsedSeconds;
  if (absoluteSeconds >= 86400) {
    unit = "day";
    amount = Math.round(elapsedSeconds / 86400);
  } else if (absoluteSeconds >= 3600) {
    unit = "hour";
    amount = Math.round(elapsedSeconds / 3600);
  } else if (absoluteSeconds >= 60) {
    unit = "minute";
    amount = Math.round(elapsedSeconds / 60);
  }
  const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(amount, unit);
  return `${relative} (${formatDateTime(value)})`;
}

function coordinateModeLabel(mode) {
  return {
    gps: "GPS",
    relative: "Relative",
    gps_and_relative: "GPS and relative",
    unmapped: "Unmapped",
  }[mode] || "Unmapped";
}

function formatMv(value) {
  if (value === null || value === undefined || value === "") return "No Data";
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value))} mV` : "No Data";
}

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(2).replace(/\.00$/, "") : "";
}

function formatDateTime(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function showState(element, html, type = "") {
  element.hidden = false;
  element.className = `asset-map-canvas-state ${type}`.trim();
  element.innerHTML = `<div class="map-state-card ${type}">${html}</div>`;
}

function hideState(element) {
  element.hidden = true;
  element.innerHTML = "";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

let activeAssetMapPage = null;

function initAssetMapPage() {
  activeAssetMapPage?.destroy();
  activeAssetMapPage = new AssetMapPageController();
  activeAssetMapPage.init();
}

function destroyAssetMapPage() {
  activeAssetMapPage?.destroy();
  activeAssetMapPage = null;
}

window.AssetMapPageLifecycle = { init: initAssetMapPage, destroy: destroyAssetMapPage };

document.addEventListener("DOMContentLoaded", () => {
  const page = window.getCurrentPageName?.() || location.pathname.split("/").pop();
  if (page === "asset-map.php") initAssetMapPage();
});
