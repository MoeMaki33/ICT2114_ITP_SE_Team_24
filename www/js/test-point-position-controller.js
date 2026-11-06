(function () {
  const MODES = {
    gps: { gps: true, relative: false },
    relative: { gps: false, relative: true },
    gps_and_relative: { gps: true, relative: true },
    unmapped: { gps: false, relative: false },
  };

  function optionalNumber(value) {
    const text = String(value ?? "").trim();
    if (!text) return null;
    const number = Number(text);
    if (!Number.isFinite(number)) throw new Error("Enter valid numeric coordinate values.");
    return number;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    }[character]));
  }

  function formatDate(value) {
    if (!value) return "Not available";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleString("en-SG");
  }

  class TestPointPositionController {
    constructor({ repository, getUserRole, onSaved }) {
      this.repository = repository;
      this.getUserRole = getUserRole;
      this.onSaved = onSaved;
      this.point = null;
      this.triggerElement = null;
      this.coordinateInputTimer = null;
      this.abortController = new AbortController();
      this.root = document.getElementById("testPointPositionModal");
      this.picker = new window.TestPointPositionMapPicker({
        root: this.root,
        repository: this.repository,
        onPositionChanged: (position, metadata) => this.applyPickedPosition(position, metadata),
      });
      this.bind();
    }

    bind() {
      const signal = this.abortController.signal;
      this.root?.querySelector("[data-close-position-modal]")?.addEventListener("click", () => this.close(), { signal });
      this.root?.querySelector("[data-save-test-point-position]")?.addEventListener("click", () => this.save(), { signal });
      this.root?.querySelector("[name='coordinateMode']")?.addEventListener("change", () => this.syncMode(), { signal });
      ["latitude", "longitude"].forEach((name) => {
        this.root?.querySelector(`[name='${name}']`)?.addEventListener("input", () => this.schedulePickerInputSync(), { signal });
      });
      this.root?.addEventListener("click", (event) => {
        if (event.target === this.root) this.close();
      }, { signal });
      document.addEventListener("keydown", (event) => {
        if (!this.root?.classList.contains("show")) return;
        if (event.key === "Escape") this.close();
        if (event.key === "Tab") this.trapFocus(event);
      }, { signal });
    }

    isAdmin() {
      return this.getUserRole?.() === "admin";
    }

    async open(point, { trigger = document.activeElement } = {}) {
      if (!this.root || !point) return;
      this.point = point;
      this.triggerElement = trigger instanceof HTMLElement ? trigger : null;
      this.root.classList.add("show");
      this.root.setAttribute("aria-hidden", "false");
      this.root.querySelector("[data-position-title]").textContent = `${this.isAdmin() ? "Edit" : "View"} Position — ${point.label}`;
      this.populate(point.position || {});
      this.setEditable(this.isAdmin());
      this.syncMode();
      const mode = this.root.querySelector("[name='coordinateMode']")?.value || "unmapped";
      const behaviour = MODES[mode] || MODES.unmapped;
      await Promise.all([
        this.renderHistory(),
        this.picker.initialise({
          selectedPoint: point,
          currentPosition: point.position || {},
          showAllPoints: false,
          editable: this.isAdmin(),
          enabled: behaviour.gps,
        }),
      ]);
      if (this.point?.id !== point.id) return;
      this.syncMode();
      const initialFocus = this.isAdmin()
        ? this.root.querySelector("[name='coordinateMode']")
        : this.root.querySelector("[data-close-position-modal]");
      initialFocus?.focus();
    }

    close({ restoreFocus = true } = {}) {
      const wasOpen = this.root?.classList.contains("show");
      this.root?.classList.remove("show");
      this.root?.setAttribute("aria-hidden", "true");
      window.clearTimeout(this.coordinateInputTimer);
      this.coordinateInputTimer = null;
      this.picker.close();
      this.point = null;
      if (restoreFocus && wasOpen) this.triggerElement?.focus?.();
      this.triggerElement = null;
    }

    trapFocus(event) {
      const focusable = [...this.root.querySelectorAll(
        "button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden]), select:not([disabled]):not([hidden]), textarea:not([disabled]):not([hidden]), a[href], [tabindex]:not([tabindex='-1'])"
      )].filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        this.root.focus?.({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!this.root.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    }

    populate(position) {
      const values = {
        coordinateMode: position.coordinateMode || position.coordinate_mode || "unmapped",
        latitude: position.latitude,
        longitude: position.longitude,
        relativeX: position.relativeX ?? position.relative_x_m,
        relativeY: position.relativeY ?? position.relative_y_m,
        relativeZ: position.relativeZ ?? position.relative_z_m,
        chainageM: position.chainageM ?? position.chainage_m,
        coordinateAccuracyM: position.coordinateAccuracyM ?? position.coordinate_accuracy_m,
        coordinateSource: position.coordinateSource ?? position.coordinate_source,
      };
      Object.entries(values).forEach(([name, value]) => {
        const field = this.root.querySelector(`[name='${name}']`);
        if (field) field.value = value ?? "";
      });
    }

    setEditable(editable) {
      this.root.querySelectorAll("input, select").forEach((field) => {
        if (field.matches("[data-position-show-all]") || field.matches("[data-position-place-search]")) return;
        field.disabled = !editable;
      });
      this.root.querySelectorAll("[data-position-edit-control]").forEach((control) => { control.disabled = !editable; });
      const saveButton = this.root.querySelector("[data-save-test-point-position]");
      if (saveButton) saveButton.hidden = !editable;
      const permission = this.root.querySelector("[data-position-permission]");
      if (permission) permission.textContent = editable
        ? "Saving creates a new current position and retains the previous row in history."
        : "Position history and map coordinates are read-only for Corrosion Engineers.";
    }

    syncMode() {
      const mode = this.root.querySelector("[name='coordinateMode']")?.value || "unmapped";
      const behaviour = MODES[mode] || MODES.unmapped;
      this.root.querySelectorAll("[data-position-group='gps']").forEach((element) => { element.hidden = !behaviour.gps; });
      this.root.querySelectorAll("[data-position-group='relative']").forEach((element) => { element.hidden = !behaviour.relative; });
      this.root.querySelectorAll("[data-position-group='metadata']").forEach((element) => { element.hidden = mode === "unmapped"; });

      const modeMessage = this.root.querySelector("[data-position-mode-message]");
      let message = "";
      if (mode === "relative") {
        message = "GPS position is not enabled for Relative mode. Select GPS or GPS and Relative to choose a map position.";
      } else if (mode === "unmapped") {
        message = "This Test Point will be recorded as unmapped.";
      }
      if (modeMessage) {
        modeMessage.hidden = !message;
        modeMessage.textContent = message;
      }
      this.root.querySelectorAll("[data-position-edit-control]").forEach((control) => {
        control.disabled = !this.isAdmin() || !behaviour.gps;
      });
      this.root.querySelectorAll("[data-position-view-control]").forEach((control) => {
        control.disabled = !behaviour.gps;
      });
      this.picker.setEnabled(behaviour.gps, { editable: this.isAdmin(), message });
    }

    applyPickedPosition(position, { origin = "map" } = {}) {
      const latitude = this.root.querySelector("[name='latitude']");
      const longitude = this.root.querySelector("[name='longitude']");
      if (!position) {
        if (latitude) latitude.value = "";
        if (longitude) longitude.value = "";
        return;
      }
      if (latitude) latitude.value = Number(position.latitude).toFixed(6);
      if (longitude) longitude.value = Number(position.longitude).toFixed(6);
      const shouldSetSource = ["map", "drag", "reference", "search"].includes(origin);
      const source = this.root.querySelector("[name='coordinateSource']");
      if (shouldSetSource && source && !source.value.trim()) source.value = "Google Maps picker";
    }

    schedulePickerInputSync() {
      window.clearTimeout(this.coordinateInputTimer);
      this.coordinateInputTimer = window.setTimeout(() => {
        const latitude = this.root.querySelector("[name='latitude']")?.value;
        const longitude = this.root.querySelector("[name='longitude']")?.value;
        this.picker.setProposedPosition(latitude, longitude, { notify: false, origin: "manual" });
      }, 300);
    }

    readPayload() {
      const value = (name) => this.root.querySelector(`[name='${name}']`)?.value;
      const payload = {
        testPointId: this.point.id,
        coordinateMode: value("coordinateMode"),
        latitude: optionalNumber(value("latitude")),
        longitude: optionalNumber(value("longitude")),
        relativeX: optionalNumber(value("relativeX")),
        relativeY: optionalNumber(value("relativeY")),
        relativeZ: optionalNumber(value("relativeZ")),
        chainageM: optionalNumber(value("chainageM")),
        coordinateAccuracyM: optionalNumber(value("coordinateAccuracyM")),
        coordinateSource: String(value("coordinateSource") || "").trim() || null,
      };
      const behaviour = MODES[payload.coordinateMode] || MODES.unmapped;
      if (behaviour.gps && (payload.latitude === null || payload.longitude === null)) {
        throw new Error("Please select a position on the map or enter valid coordinates.");
      }
      if (payload.latitude !== null && (payload.latitude < -90 || payload.latitude > 90)) {
        throw new Error("Latitude must be between -90 and 90.");
      }
      if (payload.longitude !== null && (payload.longitude < -180 || payload.longitude > 180)) {
        throw new Error("Longitude must be between -180 and 180.");
      }
      if (payload.coordinateAccuracyM !== null && payload.coordinateAccuracyM < 0) {
        throw new Error("Coordinate accuracy cannot be negative.");
      }
      if (behaviour.relative && (payload.relativeX === null || payload.relativeY === null)) {
        throw new Error("Enter both Relative X and Relative Y for this coordinate mode.");
      }
      return payload;
    }

    async save() {
      if (!this.point || !this.isAdmin()) return;
      const button = this.root.querySelector("[data-save-test-point-position]");
      try {
        button.disabled = true;
        const pointId = this.point.id;
        await this.repository.setTestPointPosition(this.readPayload());
        window.AppToast?.success?.("Test Point position updated successfully.");
        this.close();
        window.dispatchEvent(new CustomEvent("test-point-position-saved", { detail: { testPointId: pointId } }));
        try {
          await this.onSaved?.(pointId);
        } catch (refreshError) {
          console.error("Position saved, but the current page could not refresh:", refreshError);
          window.AppToast?.error?.("Position saved, but the current view could not refresh. Use Refresh to load it.");
        }
      } catch (error) {
        window.AppToast?.error?.(error.message || "Unable to update the Test Point position.");
      } finally {
        if (button?.isConnected) button.disabled = false;
      }
    }

    async renderHistory() {
      const root = this.root.querySelector("[data-position-history]");
      if (!root || !this.point) return;
      const pointId = this.point.id;
      root.innerHTML = "<p class='muted'>Loading position history…</p>";
      try {
        const rows = await this.repository.getTestPointPositionHistory(pointId);
        if (this.point?.id !== pointId) return;
        root.innerHTML = rows.length ? `
          <div class="position-history-list">
            ${rows.map((row) => `
              <article>
                <strong>${escapeHtml(String(row.coordinate_mode || "unmapped").replaceAll("_", " "))}${row.is_current ? " (current)" : ""}</strong>
                <span>${escapeHtml(formatDate(row.valid_from))} — ${row.valid_to ? escapeHtml(formatDate(row.valid_to)) : "Present"}</span>
                <small>${escapeHtml(row.coordinate_source || "Source not recorded")}</small>
              </article>`).join("")}
          </div>` : "<p class='muted'>No position history has been recorded.</p>";
      } catch (error) {
        if (this.point?.id !== pointId) return;
        root.innerHTML = `<p class="asset-map-panel-state error">${escapeHtml(error.message || "Unable to load position history.")}</p>`;
      }
    }

    destroy() {
      this.abortController.abort();
      this.close({ restoreFocus: false });
      this.picker.destroy();
    }
  }

  window.TestPointPositionController = TestPointPositionController;
})();
