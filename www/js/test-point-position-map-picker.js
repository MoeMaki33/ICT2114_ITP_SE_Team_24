(function () {
  const DEFAULT_CENTER = { lat: 1.3521, lng: 103.8198 };

  function numberOrNull(value) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizePosition(latitude, longitude) {
    const lat = numberOrNull(latitude);
    const lng = numberOrNull(longitude);
    if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    }[character]));
  }

  function formatMv(value) {
    if (value === null || value === undefined || value === "") return "—";
    return Number.isFinite(Number(value)) ? `${Math.round(Number(value))} mV` : "—";
  }

  function statusColor(status) {
    if (status === "Protected") return "#00857e";
    if (status === "Warning") return "#fdc82f";
    if (status === "Unprotected") return "#da1a35";
    return "#64748b";
  }

  function markerIcon(maps, type, color = "#64748b") {
    const specifications = {
      existing: { size: 18, fill: color, stroke: "#ffffff", strokeWidth: 3, radius: 6 },
      current: { size: 42, fill: "rgba(0,115,188,0.16)", stroke: "#0073bc", strokeWidth: 4, radius: 16 },
      proposed: { size: 26, fill: "#da1a35", stroke: "#ffffff", strokeWidth: 4, radius: 9 },
    }[type];
    const { size, fill, stroke, strokeWidth, radius } = specifications;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/></svg>`;
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new maps.Size(size, size),
      anchor: new maps.Point(size / 2, size / 2),
    };
  }

  class TestPointPositionMapPicker {
    constructor({ root, repository, onPositionChanged }) {
      this.root = root;
      this.repository = repository;
      this.onPositionChanged = onPositionChanged;
      this.canvas = root?.querySelector("[data-position-picker-canvas]");
      this.state = root?.querySelector("[data-position-picker-state]");
      this.instruction = root?.querySelector("[data-position-picker-instruction]");
      this.preview = root?.querySelector("[data-position-preview]");
      this.searchWrap = root?.querySelector("[data-position-search-wrap]");
      this.searchInput = root?.querySelector("[data-position-place-search]");
      this.showAllInput = root?.querySelector("[data-position-show-all]");
      this.abortController = new AbortController();
      this.map = null;
      this.maps = null;
      this.clusterer = null;
      this.infoWindow = null;
      this.referenceMarkers = [];
      this.currentMarker = null;
      this.proposedMarker = null;
      this.mapListeners = [];
      this.referenceListeners = [];
      this.allPoints = [];
      this.selectedPoint = null;
      this.currentPosition = null;
      this.proposedPosition = null;
      this.loadToken = null;
      this.enabled = false;
      this.editable = false;
      this.showAllPoints = false;
      this.mapReady = false;
      this.fatalMessage = "";
      this.bindControls();
      this.renderPreview();
    }

    bindControls() {
      const signal = this.abortController.signal;
      this.root?.querySelector("[data-position-reset-saved]")?.addEventListener("click", () => this.resetToSavedPosition(), { signal });
      this.root?.querySelector("[data-position-clear-proposed]")?.addEventListener("click", () => this.clearProposedPosition(), { signal });
      this.root?.querySelector("[data-position-fit-markers]")?.addEventListener("click", () => this.fitReferenceMarkers(), { signal });
      this.showAllInput?.addEventListener("change", () => {
        this.showAllPoints = this.showAllInput.checked;
        this.renderReferenceMarkers();
        this.fitRelevantMarkers();
      }, { signal });
    }

    async initialise({ selectedPoint, currentPosition, showAllPoints = false, editable, enabled }) {
      if (!this.canvas) return;
      this.clearSession();
      this.selectedPoint = selectedPoint;
      this.currentPosition = normalizePosition(currentPosition?.latitude, currentPosition?.longitude);
      this.proposedPosition = this.currentPosition ? { ...this.currentPosition } : null;
      this.editable = Boolean(editable);
      this.enabled = Boolean(enabled);
      this.showAllPoints = Boolean(showAllPoints);
      if (this.showAllInput) this.showAllInput.checked = this.showAllPoints;
      this.renderPreview();

      const token = Symbol("position-picker-load");
      this.loadToken = token;
      if (!window.GoogleMapsLoader?.hasApiKey?.()) {
        this.fatalMessage = "Google Maps API key is not configured. Coordinates may still be entered manually.";
        this.showState(this.fatalMessage, "error");
        this.updateInstruction();
        return;
      }

      this.showState("Loading position map…");
      try {
        const [maps, pointResult, clustererLibrary] = await Promise.all([
          window.GoogleMapsLoader.loadMaps(),
          this.repository.getAssetMapPoints()
            .then((points) => ({ points, error: null }))
            .catch((error) => ({ points: [], error })),
          window.GoogleMapsLoader.loadMarkerClusterer().catch(() => null),
        ]);
        if (this.loadToken !== token) return;

        this.maps = maps;
        this.allPoints = pointResult.points;
        if (pointResult.error) console.warn("Reference Test Points could not be loaded:", pointResult.error);
        this.clustererLibrary = clustererLibrary;
        this.createMap();
        this.renderReferenceMarkers();
        this.renderCurrentMarker();
        this.setProposedPosition(this.proposedPosition?.lat, this.proposedPosition?.lng, { notify: false, pan: false });
        this.bindMapClick();
        this.fitRelevantMarkers();
        this.mapReady = true;
        this.updateModeState();
        this.updateInstruction(Boolean(pointResult.error));
        this.initialisePlaceSearch(token);
        requestAnimationFrame(() => {
          if (this.map && this.maps) this.maps.event.trigger(this.map, "resize");
        });
      } catch (error) {
        if (this.loadToken !== token) return;
        console.error("Position map failed:", error);
        this.fatalMessage = "Unable to load the position map. You may still enter latitude and longitude manually.";
        this.showState(this.fatalMessage, "error");
        this.updateInstruction();
      }
    }

    createMap() {
      const config = window.APP_CONFIG || {};
      this.canvas.innerHTML = "";
      this.map = new this.maps.Map(this.canvas, {
        center: DEFAULT_CENTER,
        zoom: 11,
        mapId: config.googleMapsMapId || undefined,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        clickableIcons: false,
      });
      this.infoWindow = new this.maps.InfoWindow();
    }

    bindMapClick() {
      const listener = this.map.addListener("click", (event) => {
        if (!this.enabled || !this.editable) return;
        this.setProposedPosition(event.latLng.lat(), event.latLng.lng(), { origin: "map" });
      });
      this.mapListeners.push(listener);
    }

    getVisibleReferencePoints() {
      const mapped = this.allPoints.filter((point) => point.hasGps && point.id !== this.selectedPoint?.id);
      if (this.showAllPoints) return mapped;
      if (!this.selectedPoint?.locationId) return [];
      return mapped.filter((point) => point.locationId === this.selectedPoint.locationId);
    }

    renderReferenceMarkers() {
      if (!this.map || !this.maps) return;
      this.clearReferenceMarkers();
      const points = this.getVisibleReferencePoints();
      this.referenceMarkers = points.map((point) => {
        const marker = new this.maps.Marker({
          position: { lat: Number(point.latitude), lng: Number(point.longitude) },
          title: `${point.displayId}: ${point.displayStatus}`,
          icon: markerIcon(this.maps, "existing", statusColor(point.displayStatus)),
          optimized: true,
        });
        marker.assetMapPoint = point;
        this.referenceListeners.push(marker.addListener("click", () => this.openReferenceInfo(marker, point)));
        return marker;
      });

      if (this.clustererLibrary?.MarkerClusterer && this.referenceMarkers.length) {
        this.clusterer = new this.clustererLibrary.MarkerClusterer({ map: this.map, markers: this.referenceMarkers });
      } else {
        this.referenceMarkers.forEach((marker) => marker.setMap(this.map));
      }
      this.updateInstruction();
    }

    openReferenceInfo(marker, point) {
      if (!this.infoWindow) return;
      const canUseCoordinate = this.editable && this.enabled;
      this.infoWindow.setContent(`
        <div class="position-reference-popup">
          <strong>${escapeHtml(point.displayId)}</strong>
          <span>${escapeHtml(point.label)}</span>
          <small>${escapeHtml(point.siteName)} · ${escapeHtml(point.displayStatus)}</small>
          <small>${escapeHtml(formatMv(point.latestReading))}</small>
          <small>${Number(point.latitude).toFixed(6)}, ${Number(point.longitude).toFixed(6)}</small>
          ${canUseCoordinate ? `<button type="button" data-use-reference-coordinate="${escapeHtml(point.id)}">Use this coordinate</button>` : ""}
        </div>`);
      this.infoWindow.open({ map: this.map, anchor: marker });
      if (!canUseCoordinate) return;

      const listener = this.maps.event.addListenerOnce(this.infoWindow, "domready", () => {
        document.querySelector(`[data-use-reference-coordinate="${point.id}"]`)?.addEventListener("click", () => {
          this.setProposedPosition(Number(point.latitude), Number(point.longitude), { origin: "reference" });
          this.infoWindow?.close();
        }, { once: true });
      });
      this.referenceListeners.push(listener);
    }

    renderCurrentMarker() {
      if (!this.currentPosition || !this.map) return;
      this.currentMarker = new this.maps.Marker({
        map: this.map,
        position: this.currentPosition,
        title: "Current saved position",
        icon: markerIcon(this.maps, "current"),
        zIndex: Number(this.maps.Marker.MAX_ZINDEX) + 1,
      });
    }

    setProposedPosition(latitude, longitude, { notify = true, pan = true, origin = "manual" } = {}) {
      const position = normalizePosition(latitude, longitude);
      if (!position) {
        this.clearProposedPosition({ notify: false });
        return false;
      }
      this.proposedPosition = position;
      this.renderPreview();
      if (this.map && this.maps) {
        if (!this.proposedMarker) {
          this.proposedMarker = new this.maps.Marker({
            map: this.map,
            position,
            title: "Proposed new position",
            icon: markerIcon(this.maps, "proposed"),
            zIndex: Number(this.maps.Marker.MAX_ZINDEX) + 2,
          });
          this.mapListeners.push(this.proposedMarker.addListener("dragend", (event) => {
            this.setProposedPosition(event.latLng.lat(), event.latLng.lng(), { origin: "drag" });
          }));
        } else {
          this.proposedMarker.setPosition(position);
          this.proposedMarker.setMap(this.map);
        }
        this.proposedMarker.setDraggable(this.editable && this.enabled);
        if (pan) this.map.panTo(position);
      }
      if (notify) this.onPositionChanged?.({ latitude: position.lat, longitude: position.lng }, { origin });
      return true;
    }

    clearProposedPosition({ notify = true } = {}) {
      this.proposedPosition = null;
      this.proposedMarker?.setMap(null);
      this.proposedMarker = null;
      this.renderPreview();
      if (notify) this.onPositionChanged?.(null, { origin: "clear" });
    }

    resetToSavedPosition() {
      if (!this.currentPosition) {
        this.clearProposedPosition();
        return;
      }
      this.setProposedPosition(this.currentPosition.lat, this.currentPosition.lng, { origin: "reset" });
    }

    setEnabled(enabled, { editable = this.editable, message = "" } = {}) {
      this.enabled = Boolean(enabled);
      this.editable = Boolean(editable);
      this.disabledMessage = message;
      this.proposedMarker?.setDraggable(this.enabled && this.editable);
      this.canvas?.classList.toggle("selection-disabled", !this.enabled || !this.editable);
      this.updateModeState();
      this.updateInstruction();
    }

    updateModeState() {
      if (this.fatalMessage) {
        this.showState(this.fatalMessage, "error");
        return;
      }
      if (!this.enabled) {
        this.showState(this.disabledMessage || "GPS position selection is disabled for this coordinate mode.", "mode");
        return;
      }
      if (this.mapReady) this.hideState();
    }

    updateInstruction(referenceLoadFailed = false) {
      if (!this.instruction) return;
      if (!this.enabled) {
        this.instruction.textContent = this.disabledMessage || "Select GPS or GPS and Relative to choose a map position.";
        return;
      }
      if (!this.editable) {
        this.instruction.textContent = "Map positions are read-only for Corrosion Engineers.";
        return;
      }
      const referenceCount = this.getVisibleReferencePoints().length;
      if (!referenceCount) {
        this.instruction.textContent = "No other mapped Test Points are available for reference. Click the map to select a position.";
      } else {
        this.instruction.textContent = "Click the map, drag the proposed marker, or inspect a reference marker.";
      }
      if (referenceLoadFailed) this.instruction.textContent += " Reference markers could not be loaded.";
    }

    renderPreview() {
      if (!this.preview) return;
      if (!this.proposedPosition) {
        this.preview.innerHTML = `<strong>Selected position</strong><span>No proposed position selected.</span>`;
        return;
      }
      this.preview.innerHTML = `
        <strong>Selected position</strong>
        <span>Latitude: ${this.proposedPosition.lat.toFixed(6)}</span>
        <span>Longitude: ${this.proposedPosition.lng.toFixed(6)}</span>`;
    }

    fitReferenceMarkers() {
      this.fitRelevantMarkers({ referencesOnly: true });
    }

    fitRelevantMarkers({ referencesOnly = false } = {}) {
      if (!this.map || !this.maps) return;
      const positions = this.getVisibleReferencePoints().map((point) => ({ lat: Number(point.latitude), lng: Number(point.longitude) }));
      if (!referencesOnly) {
        if (this.currentPosition) positions.push(this.currentPosition);
        if (this.proposedPosition) positions.push(this.proposedPosition);
      }
      if (positions.length === 1) {
        this.map.setCenter(positions[0]);
        this.map.setZoom(16);
        return;
      }
      if (positions.length > 1) {
        const bounds = new this.maps.LatLngBounds();
        positions.forEach((position) => bounds.extend(position));
        this.map.fitBounds(bounds, 48);
        return;
      }

      const selectedRecord = this.allPoints.find((point) => point.id === this.selectedPoint?.id);
      const locationPosition = normalizePosition(selectedRecord?.location?.latitude, selectedRecord?.location?.longitude);
      this.map.setCenter(locationPosition || DEFAULT_CENTER);
      this.map.setZoom(locationPosition ? 14 : 11);
    }

    async initialisePlaceSearch(token) {
      if (!this.searchWrap || !this.searchInput || !window.APP_CONFIG?.googleMapsPlacesEnabled) return;
      try {
        const places = await this.maps.importLibrary?.("places");
        if (this.loadToken !== token || !places?.Autocomplete) return;
        this.searchWrap.hidden = false;
        const autocomplete = new places.Autocomplete(this.searchInput, {
          fields: ["geometry", "name", "formatted_address"],
        });
        const listener = autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          const location = place?.geometry?.location;
          if (!location || !this.enabled || !this.editable) return;
          this.setProposedPosition(location.lat(), location.lng(), { origin: "search" });
        });
        this.mapListeners.push(listener);
      } catch (error) {
        console.info("Google Places search is unavailable; map selection remains enabled.", error);
        this.searchWrap.hidden = true;
      }
    }

    showState(message, type = "") {
      if (!this.state) return;
      this.state.hidden = false;
      this.state.className = `position-picker-state ${type}`.trim();
      this.state.innerHTML = `<span>${escapeHtml(message)}</span>`;
    }

    hideState() {
      if (!this.state) return;
      this.state.hidden = true;
      this.state.innerHTML = "";
    }

    clearReferenceMarkers() {
      this.referenceListeners.forEach((listener) => listener?.remove?.());
      this.referenceListeners = [];
      this.clusterer?.clearMarkers?.();
      this.clusterer = null;
      this.referenceMarkers.forEach((marker) => marker.setMap(null));
      this.referenceMarkers = [];
      this.infoWindow?.close?.();
    }

    clearSession() {
      this.loadToken = Symbol("position-picker-cleared");
      this.mapListeners.forEach((listener) => listener?.remove?.());
      this.mapListeners = [];
      this.clearReferenceMarkers();
      this.currentMarker?.setMap(null);
      this.currentMarker = null;
      this.proposedMarker?.setMap(null);
      this.proposedMarker = null;
      this.infoWindow?.close?.();
      this.infoWindow = null;
      this.map = null;
      this.maps = null;
      this.mapReady = false;
      this.fatalMessage = "";
      this.allPoints = [];
      if (this.canvas) this.canvas.innerHTML = "";
      if (this.searchWrap) this.searchWrap.hidden = true;
      if (this.searchInput) this.searchInput.value = "";
    }

    close() {
      this.clearSession();
      this.selectedPoint = null;
      this.currentPosition = null;
      this.proposedPosition = null;
      this.renderPreview();
    }

    destroy() {
      this.close();
      this.abortController.abort();
    }
  }

  window.TestPointPositionMapPicker = TestPointPositionMapPicker;
})();
