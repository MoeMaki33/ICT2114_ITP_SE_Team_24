(function () {
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    }[character]));
  }

  function finite(value) {
    const number = Number(value);
    return value !== null && value !== undefined && value !== "" && Number.isFinite(number) ? number : null;
  }

  function formatNumber(value, digits = 2) {
    const number = finite(value);
    return number === null ? "Not recorded" : number.toLocaleString("en-SG", { maximumFractionDigits: digits });
  }

  function formatMv(value) {
    const number = finite(value);
    return number === null ? "No Data" : `${Math.round(number)} mV`;
  }

  function coordinateModeLabel(mode) {
    return ({
      gps: "GPS",
      relative: "Relative",
      gps_and_relative: "GPS and Relative",
      unmapped: "Unmapped",
    })[String(mode || "").toLowerCase()] || "Unmapped";
  }

  function role() {
    try { return localStorage.getItem("userRole") || "engineer"; }
    catch (_error) { return "engineer"; }
  }

  function buildPositionState(point, userRole = role()) {
    const position = point?.position || null;
    const mode = position?.coordinateMode || position?.coordinate_mode || "unmapped";
    const latitude = finite(position?.latitude);
    const longitude = finite(position?.longitude);
    const hasGps = latitude !== null && latitude >= -90 && latitude <= 90
      && longitude !== null && longitude >= -180 && longitude <= 180;
    const relativeX = finite(position?.relativeX ?? position?.relative_x_m);
    const relativeY = finite(position?.relativeY ?? position?.relative_y_m);
    const hasRelative = relativeX !== null && relativeY !== null;
    const isAdmin = String(userRole).toLowerCase() === "admin";
    const hasConfiguredPosition = Boolean(position && (hasGps || hasRelative || mode !== "unmapped"));
    return {
      position, mode, latitude, longitude, relativeX, relativeY, hasGps, hasRelative, isAdmin,
      hasConfiguredPosition,
      actionLabel: isAdmin ? (hasConfiguredPosition ? "Edit Position" : "Add Position") : "View Position",
      showPositionAction: isAdmin || hasConfiguredPosition,
    };
  }

  class TestPointLocationView {
    constructor({ onPositionRequested } = {}) {
      this.onPositionRequested = onPositionRequested;
      this.point = null;
      this.map = null;
      this.marker = null;
      this.infoWindow = null;
      this.maps = null;
      this.positionView = "gps";
      this.gpsStateHtml = "";
      this.destroyed = false;
      this.renderToken = 0;
      this.abortController = new AbortController();
      document.getElementById("detailPositionPanel")?.addEventListener("click", (event) => {
        const positionButton = event.target.closest("[data-detail-position-action]");
        if (positionButton && this.point) this.onPositionRequested?.(this.point, positionButton);
        const assetMapButton = event.target.closest("[data-detail-open-asset-map]");
        if (assetMapButton && this.point) this.openAssetMap();
        const viewButton = event.target.closest("[data-detail-position-view]");
        if (viewButton && this.point) this.setPositionView(viewButton.dataset.detailPositionView);
      }, { signal: this.abortController.signal });
    }

    async render(point) {
      this.point = point;
      this.destroyed = false;
      const token = ++this.renderToken;
      const { position, mode, latitude, longitude, relativeX, relativeY, hasGps, hasRelative, isAdmin,
        actionLabel, showPositionAction } = buildPositionState(point);
      this.positionView = hasGps ? "gps" : hasRelative ? "relative" : "unmapped";
      const details = document.getElementById("detailPositionDetails");
      const actions = document.getElementById("detailPositionActions");
      const status = document.getElementById("detailPositionMapState");
      const canvas = document.getElementById("detailPositionMap");
      const mapShell = canvas?.closest(".detail-position-map-shell");
      if (canvas) {
        canvas.hidden = !hasGps;
        canvas.setAttribute("aria-label", hasGps ? `${point.label || "Test Point"} current GPS position` : "No GPS position is configured");
      }
      mapShell?.classList.toggle("is-non-map", !hasGps);
      if (details) details.innerHTML = `
        <div class="detail-position-context">
          <div><span>Location</span><strong>${escapeHtml(point.site || "Unknown Location")}</strong></div>
          <div><span>Position mode</span><strong>${escapeHtml(coordinateModeLabel(mode))}</strong></div>
        </div>
        <div class="detail-position-view-switch" role="group" aria-label="Position representation">
          <button type="button" class="${hasGps ? "active" : ""}" data-detail-position-view="gps" aria-pressed="${hasGps ? "true" : "false"}" ${hasGps ? "" : "disabled"}>GPS Map</button>
          <button type="button" class="${!hasGps && hasRelative ? "active" : ""}" data-detail-position-view="relative" aria-pressed="${!hasGps && hasRelative ? "true" : "false"}" ${hasRelative ? "" : "disabled"}>Relative Position</button>
        </div>`;
      if (actions) actions.innerHTML = `
        ${showPositionAction ? `<button type="button" class="btn ${isAdmin ? "btn-green" : "btn-light"}" data-detail-position-action>${escapeHtml(actionLabel)}</button>` : ""}
        <button type="button" class="btn btn-light" data-detail-open-asset-map>Open in Asset Map</button>`;

      this.clearMap();
      if (!hasGps) {
        if (status) {
          status.hidden = false;
          status.innerHTML = hasRelative
            ? this.relativePositionMarkup(position, relativeX, relativeY)
            : `<div><i class="fa-solid fa-location-dot" aria-hidden="true"></i><strong>Position Not Configured</strong><span>${isAdmin ? "Use Add Position to record GPS or relative coordinates." : "No GPS or relative position has been recorded."}</span></div>`;
        }
        return;
      }

      this.gpsStateHtml = "<span>Loading Google Map…</span>";
      if (status) { status.hidden = false; status.innerHTML = this.gpsStateHtml; }
      try {
        if (!window.GoogleMapsLoader?.hasApiKey?.()) throw new Error("GOOGLE_MAPS_API_KEY_MISSING");
        const maps = await window.GoogleMapsLoader.loadMaps();
        if (this.destroyed || token !== this.renderToken) return;
        this.maps = maps;
        this.map = new maps.Map(canvas, { center: { lat: latitude, lng: longitude }, zoom: 17, mapTypeControl: false, streetViewControl: false, fullscreenControl: true });
        const displayStatus = String(point.displayStatus || point.status || "Unknown");
        const colour = displayStatus.toLowerCase() === "unprotected" ? "#c93f3f" : displayStatus.toLowerCase() === "warning" ? "#d99a16" : displayStatus.toLowerCase() === "protected" ? "#08795f" : "#7d8998";
        this.marker = new maps.Marker({ map: this.map, position: { lat: latitude, lng: longitude }, title: point.label || "Test Point", icon: {
          path: maps.SymbolPath.CIRCLE, scale: 10, fillColor: colour, fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 3,
        }});
        this.infoWindow = new maps.InfoWindow({ content: `<article class="detail-position-popup"><strong>${escapeHtml(point.label || "Test Point")}</strong><span>${escapeHtml(point.site || "Not available")}</span><span>${escapeHtml(displayStatus)}</span><span>Latest: ${escapeHtml(formatMv(point.latestReading))}</span></article>`, ariaLabel: `${point.label || "Test Point"} position details`, maxWidth: 240 });
        this.marker.addListener("click", () => this.infoWindow?.open({ map: this.map, anchor: this.marker, shouldFocus: false }));
        this.gpsStateHtml = "";
        if (status) status.hidden = true;
      } catch (error) {
        if (this.destroyed || token !== this.renderToken) return;
        if (status) {
          status.hidden = false;
          const missing = String(error?.message || error) === "GOOGLE_MAPS_API_KEY_MISSING";
          this.gpsStateHtml = `<div><i class="fa-solid fa-map" aria-hidden="true"></i><strong>${missing ? "Google Maps is not configured" : "Map unavailable"}</strong><span>${missing ? "Configure APP_CONFIG.googleMapsApiKey to show the saved GPS position." : escapeHtml(error?.message || "Unable to load Google Maps.")}</span></div>`;
          status.innerHTML = this.gpsStateHtml;
        }
      }
    }

    relativePositionMarkup(position, relativeX, relativeY) {
      const relativeZ = finite(position?.relativeZ ?? position?.relative_z_m);
      const chainage = finite(position?.chainageM ?? position?.chainage_m);
      return `<div class="detail-relative-position-state">
        <i class="fa-solid fa-ruler-combined" aria-hidden="true"></i>
        <strong>Relative position</strong>
        <span>Local coordinates recorded without changing the saved position.</span>
        <div class="detail-relative-metrics">
          <span><small>X</small><b>${escapeHtml(formatNumber(relativeX))} m</b></span>
          <span><small>Y</small><b>${escapeHtml(formatNumber(relativeY))} m</b></span>
          <span><small>Z</small><b>${relativeZ === null ? "—" : `${escapeHtml(formatNumber(relativeZ))} m`}</b></span>
          <span><small>Chainage</small><b>${chainage === null ? "—" : `${escapeHtml(formatNumber(chainage))} m`}</b></span>
        </div>
      </div>`;
    }

    setPositionView(view) {
      const state = buildPositionState(this.point);
      if (view === "relative" && !state.hasRelative) return;
      if (view === "gps" && !state.hasGps) return;
      this.positionView = view;
      const canvas = document.getElementById("detailPositionMap");
      const status = document.getElementById("detailPositionMapState");
      const mapShell = canvas?.closest(".detail-position-map-shell");
      document.querySelectorAll("[data-detail-position-view]").forEach((button) => {
        const active = button.dataset.detailPositionView === view;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      if (view === "relative") {
        if (canvas) canvas.hidden = true;
        mapShell?.classList.add("is-non-map");
        if (status) {
          status.hidden = false;
          status.innerHTML = this.relativePositionMarkup(state.position, state.relativeX, state.relativeY);
        }
        return;
      }
      if (canvas) canvas.hidden = false;
      mapShell?.classList.remove("is-non-map");
      if (status) {
        status.hidden = Boolean(this.map);
        if (!this.map) status.innerHTML = this.gpsStateHtml || "<span>Loading Google Map…</span>";
      }
      window.setTimeout(() => {
        this.maps?.event?.trigger?.(this.map, "resize");
        if (state.latitude !== null && state.longitude !== null) this.map?.setCenter?.({ lat: state.latitude, lng: state.longitude });
      }, 0);
    }

    openAssetMap() {
      const target = `asset-map.php?selectedPointId=${encodeURIComponent(this.point.id)}`;
      if (window.AppNavigation?.navigateToPage) window.AppNavigation.navigateToPage(target);
      else location.assign(target);
    }

    clearMap() {
      this.marker?.setMap?.(null);
      this.infoWindow?.close?.();
      if (this.maps && this.map) this.maps.event?.clearInstanceListeners?.(this.map);
      this.marker = null;
      this.infoWindow = null;
      this.map = null;
      this.maps = null;
      this.gpsStateHtml = "";
    }

    destroy() {
      this.destroyed = true;
      this.renderToken += 1;
      this.abortController.abort();
      this.clearMap();
      this.point = null;
      this.onPositionRequested = null;
    }
  }

  TestPointLocationView.buildPositionState = buildPositionState;

  window.TestPointLocationView = TestPointLocationView;
})();
