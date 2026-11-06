(function () {
  const {
    DASHBOARD_WIDGET_REGISTRY,
    DEFAULT_DASHBOARD_LAYOUT,
    cloneLayout,
    widgetsOverlap,
    validateDashboardLayout,
    migrateDashboardLayout,
    adaptLayoutToColumns,
    compactDashboardLayout,
  } = DashboardLayout;

  class DashboardCustomisationState {
    constructor() {
      this.savedDashboardLayout = cloneLayout(DEFAULT_DASHBOARD_LAYOUT);
      this.draftDashboardLayout = null;
      this.isDashboardCustomising = false;
      this.hasUnsavedDashboardChanges = false;
    }

    get activeLayout() {
      return this.isDashboardCustomising ? this.draftDashboardLayout : this.savedDashboardLayout;
    }

    begin() {
      this.draftDashboardLayout = cloneLayout(this.savedDashboardLayout);
      this.isDashboardCustomising = true;
      this.hasUnsavedDashboardChanges = false;
      window.AppNavigation?.setUnsavedChanges?.(false);
    }

    markChanged() {
      this.hasUnsavedDashboardChanges = true;
      window.AppNavigation?.setUnsavedChanges?.(true);
    }

    commit() {
      this.savedDashboardLayout = cloneLayout(this.draftDashboardLayout);
      this.draftDashboardLayout = null;
      this.isDashboardCustomising = false;
      this.hasUnsavedDashboardChanges = false;
      window.AppNavigation?.setUnsavedChanges?.(false);
    }

    discard() {
      this.draftDashboardLayout = null;
      this.isDashboardCustomising = false;
      this.hasUnsavedDashboardChanges = false;
      window.AppNavigation?.setUnsavedChanges?.(false);
    }
  }

  class DashboardGridRenderer {
    constructor(state) {
      this.state = state;
      this.grid = document.getElementById("dashboardWidgetGrid");
      this.metrics = document.getElementById("dashboardMetrics");
    }

    getColumnCount() {
      if (window.innerWidth >= 1280) return 6;
      if (window.innerWidth >= 1100) return 4;
      return 1;
    }

    render() {
      const sourceLayout = this.state.activeLayout;
      const columns = this.getColumnCount();
      const displayLayout = adaptLayoutToColumns(sourceLayout, columns);
      this.grid.style.setProperty("--dashboard-columns", columns);
      this.grid.dataset.columns = String(columns);

      displayLayout.widgets.forEach((layoutItem) => {
        const element = this.grid.querySelector(`[data-widget-id="${layoutItem.widgetId}"]`);
        if (!element) return;
        element.style.gridColumn = `${layoutItem.x + 1} / span ${layoutItem.w}`;
        element.style.gridRow = `${layoutItem.y + 1} / span ${layoutItem.h}`;
        const sizeLabel = element.querySelector(".dashboard-widget-size");
        if (sizeLabel) sizeLabel.textContent = `${layoutItem.w} × ${layoutItem.h}`;
      });

      sourceLayout.metricOrder.forEach((metricId) => {
        const metric = this.metrics.querySelector(`[data-metric-id="${metricId}"]`);
        if (metric) this.metrics.appendChild(metric);
      });

      document.body.classList.toggle("dashboard-customising", this.state.isDashboardCustomising);
      const customiseButton = document.getElementById("customiseDashboardButton");
      const mobileEditingUnavailable = window.innerWidth < 768;
      customiseButton?.setAttribute("aria-disabled", String(mobileEditingUnavailable));
      if (customiseButton) {
        customiseButton.disabled = mobileEditingUnavailable;
        customiseButton.title = mobileEditingUnavailable
          ? "Dashboard layout editing is available on larger screens."
          : "";
      }
      this.grid.setAttribute("aria-label", this.state.isDashboardCustomising ? "Dashboard widgets, editing" : "Dashboard widgets");
      this.grid.querySelectorAll(".dashboard-widget").forEach((widget) => {
        widget.querySelectorAll("button, select, input, a").forEach((control) => {
          if (!control.classList.contains("widget-drag-handle") && !control.classList.contains("widget-resize-handle")) {
            control.toggleAttribute("inert", this.state.isDashboardCustomising);
          }
        });
      });
      this.metrics.querySelectorAll(".dashboard-metric-card").forEach((card) => {
        card.draggable = this.state.isDashboardCustomising && window.innerWidth >= 768;
        card.setAttribute("aria-grabbed", "false");
      });
    }
  }

  class DashboardController {
    constructor(repository, state, renderer) {
      this.repository = repository;
      this.state = state;
      this.renderer = renderer;
      this.operation = null;
      this.draggedMetricId = null;
      this.resizeTimer = null;
      this.abortController = null;
    }

    async loadDashboard() {
      try {
        const storedLayout = await this.repository.getDashboardLayout();
        this.state.savedDashboardLayout = migrateDashboardLayout(storedLayout);
      } catch (error) {
        console.warn("Dashboard layout load failed; using the default layout.", error);
        this.state.savedDashboardLayout = cloneLayout(DEFAULT_DASHBOARD_LAYOUT);
        this.showMessage("Saved layout could not be loaded. The default layout is shown.", "error");
      }
      this.ensureEditingControls();
      this.bindEvents();
      this.renderer.render();
      this.refreshVisualisation();
    }

    async customiseDashboard(dashboard) {
      const compacted = compactDashboardLayout(dashboard);
      const result = validateDashboardLayout(compacted);
      if (!result.valid) throw new Error(result.errors[0] || "Dashboard layout is invalid.");
      await this.repository.saveDashboardLayout(compacted);
      this.state.draftDashboardLayout = compacted;
    }

    refreshVisualisation() {
      window.requestAnimationFrame(() => {
        if (typeof window.resizeDashboardCharts === "function") window.resizeDashboardCharts();
      });
    }

    ensureEditingControls() {
      this.renderer.grid.querySelectorAll(".dashboard-widget").forEach((widget) => {
        const header = widget.querySelector(".dashboard-widget-header");
        if (!header.querySelector(".widget-drag-handle")) {
          const dragHandle = document.createElement("button");
          dragHandle.className = "widget-drag-handle";
          dragHandle.type = "button";
          dragHandle.setAttribute("aria-label", `Move ${widget.dataset.widgetId} widget`);
          dragHandle.innerHTML = '<i class="fa-solid fa-grip" aria-hidden="true"></i>';
          header.appendChild(dragHandle);
        }
        if (!widget.querySelector(".dashboard-widget-size")) {
          const size = document.createElement("span");
          size.className = "dashboard-widget-size";
          widget.appendChild(size);
        }
        const rules = DASHBOARD_WIDGET_REGISTRY[widget.dataset.widgetId];
        if (rules?.resizable && !widget.querySelector(".widget-resize-handle")) {
          const resizeHandle = document.createElement("button");
          resizeHandle.className = "widget-resize-handle";
          resizeHandle.type = "button";
          resizeHandle.setAttribute("aria-label", `Resize ${widget.dataset.widgetId} widget`);
          resizeHandle.innerHTML = '<i class="fa-solid fa-up-right-and-down-left-from-center" aria-hidden="true"></i>';
          widget.appendChild(resizeHandle);
        }
      });
    }

    bindEvents() {
      this.abortController?.abort();
      this.abortController = new AbortController();
      const listenerOptions = { signal: this.abortController.signal };
      document.getElementById("customiseDashboardButton").addEventListener("click", () => this.enterCustomisation(), listenerOptions);
      document.getElementById("saveDashboardLayoutButton").addEventListener("click", () => this.saveLayout(), listenerOptions);
      document.getElementById("cancelDashboardLayoutButton").addEventListener("click", () => this.cancelCustomisation(), listenerOptions);
      document.getElementById("resetDashboardLayoutButton").addEventListener("click", () => this.resetToDefault(), listenerOptions);

      this.renderer.grid.addEventListener("pointerdown", (event) => this.startPointerOperation(event), listenerOptions);
      window.addEventListener("pointermove", (event) => this.updatePointerOperation(event), listenerOptions);
      window.addEventListener("pointerup", () => this.finishPointerOperation(), listenerOptions);
      window.addEventListener("pointercancel", () => this.finishPointerOperation(), listenerOptions);

      this.renderer.metrics.addEventListener("dragstart", (event) => this.startMetricDrag(event), listenerOptions);
      this.renderer.metrics.addEventListener("dragover", (event) => this.updateMetricDrag(event), listenerOptions);
      this.renderer.metrics.addEventListener("dragend", () => this.finishMetricDrag(), listenerOptions);

      window.addEventListener("resize", () => {
        clearTimeout(this.resizeTimer);
        this.resizeTimer = setTimeout(() => {
          this.renderer.render();
          if (this.state.isDashboardCustomising && window.innerWidth < 768) {
            this.showMessage("Layout editing is paused below 768px. Save or cancel when ready.", "info");
          }
          this.refreshVisualisation();
        }, 120);
      }, listenerOptions);

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && this.state.isDashboardCustomising) this.cancelCustomisation();
      }, listenerOptions);
    }

    destroy() {
      this.abortController?.abort();
      this.abortController = null;
      clearTimeout(this.resizeTimer);
      clearTimeout(this.messageTimer);
      this.operation = null;
      this.draggedMetricId = null;
      document.body.classList.remove("dashboard-customising");
    }

    enterCustomisation() {
      if (window.innerWidth < 768) {
        this.showMessage("Dashboard layout editing is available on screens 768px and wider.", "info");
        return;
      }
      this.state.begin();
      document.getElementById("dashboardCustomiseBar").hidden = false;
      document.getElementById("customiseDashboardButton").hidden = true;
      this.renderer.render();
      document.getElementById("resetDashboardLayoutButton").focus();
    }

    async saveLayout() {
      const button = document.getElementById("saveDashboardLayoutButton");
      if (button.disabled) return;
      const validation = validateDashboardLayout(this.state.draftDashboardLayout);
      if (!validation.valid) {
        this.showMessage(validation.errors[0], "error");
        return;
      }
      const restoreButton = window.AppToast?.withButtonLoading?.(button, "Saving...") || (() => {
        button.disabled = true;
        button.textContent = "Saving...";
        return () => {
          button.disabled = false;
          button.textContent = "Save Layout";
        };
      })();
      try {
        await this.customiseDashboard(this.state.draftDashboardLayout);
        this.state.commit();
        this.exitCustomisationUi();
        this.renderer.render();
        this.refreshVisualisation();
        this.showMessage("Dashboard layout saved successfully.", "success");
      } catch (error) {
        console.error(error);
        this.showMessage("Unable to save the dashboard layout. Your changes have not been lost.", "error");
      } finally {
        restoreButton();
      }
    }

    cancelCustomisation() {
      if (this.state.hasUnsavedDashboardChanges && !window.confirm("Discard your unsaved dashboard changes?")) return;
      this.state.discard();
      this.exitCustomisationUi();
      this.renderer.render();
      this.refreshVisualisation();
    }

    resetToDefault() {
      if (!window.confirm("Reset the dashboard draft to its default layout?")) return;
      this.state.draftDashboardLayout = cloneLayout(DEFAULT_DASHBOARD_LAYOUT);
      this.state.markChanged();
      this.renderer.render();
      this.refreshVisualisation();
      this.showMessage("Default layout loaded. Select Save Layout to keep it.", "info");
    }

    exitCustomisationUi() {
      document.getElementById("dashboardCustomiseBar").hidden = true;
      document.getElementById("customiseDashboardButton").hidden = false;
    }

    showMessage(message, type) {
      const element = document.getElementById("dashboardLayoutMessage");
      element.textContent = message;
      element.className = `dashboard-layout-message ${type || ""}`;
      clearTimeout(this.messageTimer);
      this.messageTimer = setTimeout(() => {
        element.textContent = "";
        element.className = "dashboard-layout-message";
      }, 5000);
    }

    startMetricDrag(event) {
      const card = event.target.closest(".dashboard-metric-card");
      if (!card || !this.state.isDashboardCustomising || window.innerWidth < 768) return;
      this.draggedMetricId = card.dataset.metricId;
      card.classList.add("is-dragging");
      card.setAttribute("aria-grabbed", "true");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", this.draggedMetricId);
    }

    updateMetricDrag(event) {
      if (!this.draggedMetricId) return;
      event.preventDefault();
      const target = event.target.closest(".dashboard-metric-card");
      if (!target || target.dataset.metricId === this.draggedMetricId) return;
      const order = this.state.draftDashboardLayout.metricOrder;
      const fromIndex = order.indexOf(this.draggedMetricId);
      const targetIndex = order.indexOf(target.dataset.metricId);
      order.splice(fromIndex, 1);
      order.splice(targetIndex, 0, this.draggedMetricId);
      this.state.markChanged();
      this.renderer.render();
    }

    finishMetricDrag() {
      this.renderer.metrics.querySelectorAll(".dashboard-metric-card").forEach((card) => {
        card.classList.remove("is-dragging");
        card.setAttribute("aria-grabbed", "false");
      });
      this.draggedMetricId = null;
    }

    startPointerOperation(event) {
      if (!this.state.isDashboardCustomising || window.innerWidth < 768) return;
      const dragHandle = event.target.closest(".widget-drag-handle");
      const resizeHandle = event.target.closest(".widget-resize-handle");
      if (!dragHandle && !resizeHandle) return;
      const widgetElement = event.target.closest(".dashboard-widget");
      const widgetId = widgetElement.dataset.widgetId;
      if (resizeHandle && !DASHBOARD_WIDGET_REGISTRY[widgetId]?.resizable) return;
      const baseLayout = cloneLayout(this.state.draftDashboardLayout);
      const item = baseLayout.widgets.find((widget) => widget.widgetId === widgetId);
      this.operation = {
        type: resizeHandle ? "resize" : "move",
        widgetId,
        startX: event.clientX,
        startY: event.clientY,
        item,
        baseLayout,
        changed: false,
      };
      widgetElement.classList.add(this.operation.type === "move" ? "is-moving" : "is-resizing");
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    }

    updatePointerOperation(event) {
      if (!this.operation) return;
      const gridRect = this.renderer.grid.getBoundingClientRect();
      const columnWidth = (gridRect.width - 16 * 5) / 6;
      const rowHeight = Number.parseFloat(getComputedStyle(this.renderer.grid).gridAutoRows) || 120;
      const columnDelta = Math.round((event.clientX - this.operation.startX) / (columnWidth + 16));
      const rowDelta = Math.round((event.clientY - this.operation.startY) / (rowHeight + 16));
      const rules = DASHBOARD_WIDGET_REGISTRY[this.operation.widgetId];
      const candidate = { ...this.operation.item };

      if (this.operation.type === "move") {
        candidate.x = rules.fullWidth
          ? 0
          : Math.max(0, Math.min(6 - candidate.w, this.operation.item.x + columnDelta));
        candidate.y = Math.max(0, this.operation.item.y + rowDelta);
      } else {
        candidate.w = rules.fullWidth
          ? 6
          : Math.max(rules.minW, Math.min(rules.maxW, this.operation.item.w + columnDelta));
        candidate.h = Math.max(rules.minH, Math.min(rules.maxH, this.operation.item.h + rowDelta));
      }

      const nextLayout = this.placeCandidate(this.operation.baseLayout, candidate, this.operation.type);
      if (!nextLayout) return;
      this.state.draftDashboardLayout = nextLayout;
      this.operation.changed = JSON.stringify(nextLayout) !== JSON.stringify(this.operation.baseLayout);
      this.renderer.render();
      this.refreshVisualisation();
    }

    placeCandidate(baseLayout, candidate, operationType) {
      const movingIndex = baseLayout.widgets.findIndex((widget) => widget.widgetId === candidate.widgetId);
      const others = baseLayout.widgets.filter((widget) => widget.widgetId !== candidate.widgetId);
      const directCollisions = others.filter((widget) => widgetsOverlap(candidate, widget));

      if (operationType === "move" && directCollisions.length === 1) {
        const collision = directCollisions[0];
        if (collision.w === candidate.w && collision.h === candidate.h) {
          const swapped = { ...collision, x: this.operation.item.x, y: this.operation.item.y };
          const remaining = others.filter((widget) => widget.widgetId !== collision.widgetId);
          if (!remaining.some((widget) => widgetsOverlap(swapped, widget))) {
            const widgets = cloneLayout(baseLayout.widgets);
            widgets[movingIndex] = candidate;
            widgets[widgets.findIndex((widget) => widget.widgetId === collision.widgetId)] = swapped;
            const next = compactDashboardLayout({ ...cloneLayout(baseLayout), widgets });
            return validateDashboardLayout(next).valid ? next : null;
          }
        }
      }

      const placed = [candidate];
      others
        .sort((first, second) => first.y - second.y || first.x - second.x)
        .forEach((widget) => {
          const shifted = { ...widget };
          let collisions = placed.filter((item) => widgetsOverlap(shifted, item));
          while (collisions.length) {
            shifted.y = Math.max(...collisions.map((item) => item.y + item.h));
            collisions = placed.filter((item) => widgetsOverlap(shifted, item));
          }
          placed.push(shifted);
        });

      const byId = new Map(placed.map((widget) => [widget.widgetId, widget]));
      const next = compactDashboardLayout({
        ...cloneLayout(baseLayout),
        widgets: baseLayout.widgets.map((widget) => byId.get(widget.widgetId)),
      });
      return validateDashboardLayout(next).valid ? next : null;
    }

    finishPointerOperation() {
      if (!this.operation) return;
      this.renderer.grid.querySelectorAll(".dashboard-widget").forEach((widget) => {
        widget.classList.remove("is-moving", "is-resizing");
      });
      if (this.operation.changed) this.state.markChanged();
      this.operation = null;
      this.refreshVisualisation();
    }
  }

  async function initDashboardCustomisationPage() {
    const repository = await DashboardRepositories.createDashboardRepository();
    const state = new DashboardCustomisationState();
    const renderer = new DashboardGridRenderer(state);
    const controller = new DashboardController(repository, state, renderer);
    window.dashboardController = controller;
    await controller.loadDashboard();
  }

  function destroyDashboardCustomisationPage() {
    window.dashboardController?.destroy?.();
    window.dashboardController = null;
  }

  window.DashboardCustomisationPage = {
    init: initDashboardCustomisationPage,
    destroy: destroyDashboardCustomisationPage,
  };

  document.addEventListener("DOMContentLoaded", async () => {
    const page = window.getCurrentPageName?.() || location.pathname.split("/").pop();
    if (page === "dashboard.php") await initDashboardCustomisationPage();
  });
})();
