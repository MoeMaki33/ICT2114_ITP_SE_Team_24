(function () {
  const DESKTOP_COLUMNS = 6;
  const METRIC_IDS = [
    "total-points",
    "protected",
    "warning",
    "unprotected",
    "unknown",
    "average-reading",
  ];

  const DASHBOARD_WIDGET_REGISTRY = Object.freeze({
    "protection-reading-trends": {
      widgetType: "chart", chartType: "line", title: "Protection Reading Trends",
      minW: 2, maxW: 6, minH: 2, maxH: 4, resizable: true, fullWidth: false,
    },
    "average-reading-by-pipeline": {
      widgetType: "chart", chartType: "bar", title: "Location Protection Overview",
      minW: 2, maxW: 6, minH: 2, maxH: 4, resizable: true, fullWidth: false,
    },
    "weekly-protection-summary": {
      widgetType: "summary", chartType: null, title: "Weekly Protection Summary",
      minW: 6, maxW: 6, minH: 5, maxH: 5, resizable: false, fullWidth: true,
    },
    "test-points-table": {
      widgetType: "table", chartType: null, title: "Test Points Table",
      minW: 6, maxW: 6, minH: 4, maxH: 8, resizable: true, fullWidth: true,
    },
  });

  const DEFAULT_DASHBOARD_LAYOUT = Object.freeze({
    version: 1,
    columns: DESKTOP_COLUMNS,
    metricOrder: METRIC_IDS,
    widgets: [
      { widgetId: "protection-reading-trends", x: 0, y: 0, w: 3, h: 3 },
      { widgetId: "average-reading-by-pipeline", x: 3, y: 0, w: 3, h: 3 },
      { widgetId: "weekly-protection-summary", x: 0, y: 3, w: 6, h: 5 },
      { widgetId: "test-points-table", x: 0, y: 8, w: 6, h: 5 },
    ],
  });

  function cloneLayout(layout) {
    return JSON.parse(JSON.stringify(layout));
  }

  function widgetsOverlap(first, second) {
    return (
      first.x < second.x + second.w &&
      first.x + first.w > second.x &&
      first.y < second.y + second.h &&
      first.y + first.h > second.y
    );
  }

  function validateDashboardLayout(layout) {
    const errors = [];
    if (!layout || typeof layout !== "object") return { valid: false, errors: ["Layout is missing."] };
    if (layout.version !== 1) errors.push("Unsupported layout version.");
    if (layout.columns !== DESKTOP_COLUMNS) errors.push("Desktop layout must use six columns.");

    const metricOrder = Array.isArray(layout.metricOrder) ? layout.metricOrder : [];
    if (metricOrder.length !== METRIC_IDS.length || new Set(metricOrder).size !== METRIC_IDS.length) {
      errors.push("Metric order is incomplete or contains duplicates.");
    }
    if (metricOrder.some((id) => !METRIC_IDS.includes(id))) errors.push("Metric order contains an unknown ID.");

    const widgets = Array.isArray(layout.widgets) ? layout.widgets : [];
    const widgetIds = widgets.map((widget) => widget?.widgetId);
    if (widgets.length !== Object.keys(DASHBOARD_WIDGET_REGISTRY).length) {
      errors.push("Widget layout is incomplete.");
    }
    if (new Set(widgetIds).size !== widgetIds.length) errors.push("Widget IDs must be unique.");

    widgets.forEach((widget) => {
      const rules = DASHBOARD_WIDGET_REGISTRY[widget?.widgetId];
      if (!rules) {
        errors.push("Widget layout contains an unknown ID.");
        return;
      }
      ["x", "y", "w", "h"].forEach((property) => {
        if (!Number.isInteger(widget[property])) errors.push(`${widget.widgetId}.${property} must be an integer.`);
      });
      if (widget.x < 0 || widget.y < 0 || widget.w <= 0 || widget.h <= 0) {
        errors.push(`${widget.widgetId} has an invalid position or size.`);
      }
      if (widget.x + widget.w > DESKTOP_COLUMNS) errors.push(`${widget.widgetId} leaves the grid.`);
      if (widget.w < rules.minW || widget.w > rules.maxW || widget.h < rules.minH || widget.h > rules.maxH) {
        errors.push(`${widget.widgetId} is outside its supported size.`);
      }
      if (rules.fullWidth && (widget.x !== 0 || widget.w !== DESKTOP_COLUMNS)) {
        errors.push(`${widget.widgetId} must remain full-width.`);
      }
    });

    widgets.forEach((widget, index) => {
      widgets.slice(index + 1).forEach((other) => {
        if (widgetsOverlap(widget, other)) errors.push(`${widget.widgetId} overlaps ${other.widgetId}.`);
      });
    });

    return { valid: errors.length === 0, errors };
  }

  function sanitiseWidget(widget, fallback) {
    const rules = DASHBOARD_WIDGET_REGISTRY[widget.widgetId];
    if (!rules) return cloneLayout(fallback);
    return {
      widgetId: widget.widgetId,
      x: Number.isInteger(widget.x) ? widget.x : fallback.x,
      y: Number.isInteger(widget.y) ? widget.y : fallback.y,
      w: Math.max(rules.minW, Math.min(rules.maxW, Number.isInteger(widget.w) ? widget.w : fallback.w)),
      h: Math.max(rules.minH, Math.min(rules.maxH, Number.isInteger(widget.h) ? widget.h : fallback.h)),
    };
  }

  function migrateDashboardLayout(savedLayout) {
    if (!savedLayout || typeof savedLayout !== "object") return cloneLayout(DEFAULT_DASHBOARD_LAYOUT);
    if (savedLayout.version !== 1 || savedLayout.columns !== DESKTOP_COLUMNS) {
      return cloneLayout(DEFAULT_DASHBOARD_LAYOUT);
    }
    const savedWidgets = Array.isArray(savedLayout.widgets) ? savedLayout.widgets : [];
    const recognisedWidgetIds = savedWidgets
      .map((widget) => widget?.widgetId)
      .filter((widgetId) => DASHBOARD_WIDGET_REGISTRY[widgetId]);
    if (new Set(recognisedWidgetIds).size !== recognisedWidgetIds.length) {
      return cloneLayout(DEFAULT_DASHBOARD_LAYOUT);
    }
    const recognised = new Map(
      savedWidgets
        .filter((widget) => widget && DASHBOARD_WIDGET_REGISTRY[widget.widgetId])
        .map((widget) => [widget.widgetId, widget])
    );
    const widgets = DEFAULT_DASHBOARD_LAYOUT.widgets.map((fallback) => (
      sanitiseWidget(recognised.get(fallback.widgetId) || fallback, fallback)
    ));
    const savedWeekly = recognised.get("weekly-protection-summary");
    const savedTable = recognised.get("test-points-table");
    const weekly = widgets.find((widget) => widget.widgetId === "weekly-protection-summary");
    const table = widgets.find((widget) => widget.widgetId === "test-points-table");
    if (
      savedWeekly && savedTable && weekly && table &&
      savedTable.y === savedWeekly.y + savedWeekly.h &&
      table.x === weekly.x && table.w === weekly.w
    ) {
      table.y = weekly.y + weekly.h;
    }
    const savedMetricOrder = Array.isArray(savedLayout.metricOrder)
      ? savedLayout.metricOrder.filter((id) => METRIC_IDS.includes(id))
      : [];
    if (new Set(savedMetricOrder).size !== savedMetricOrder.length) {
      return cloneLayout(DEFAULT_DASHBOARD_LAYOUT);
    }
    const metricOrder = [...new Set(savedMetricOrder), ...METRIC_IDS.filter((id) => !savedMetricOrder.includes(id))];
    const migrated = compactDashboardLayout({ version: 1, columns: DESKTOP_COLUMNS, metricOrder, widgets });
    return validateDashboardLayout(migrated).valid ? migrated : cloneLayout(DEFAULT_DASHBOARD_LAYOUT);
  }

  function canPlace(candidate, placed, columns) {
    return (
      candidate.x >= 0 &&
      candidate.y >= 0 &&
      candidate.x + candidate.w <= columns &&
      !placed.some((widget) => widgetsOverlap(candidate, widget))
    );
  }

  function findFirstPosition(widget, placed, columns) {
    for (let y = 0; y < 200; y += 1) {
      for (let x = 0; x <= columns - widget.w; x += 1) {
        const candidate = { ...widget, x, y };
        if (canPlace(candidate, placed, columns)) return candidate;
      }
    }
    return { ...widget, x: 0, y: placed.reduce((max, item) => Math.max(max, item.y + item.h), 0) };
  }

  function compactWidgetsUp(widgets, columns = DESKTOP_COLUMNS) {
    const placed = [];
    [...widgets]
      .sort((first, second) => first.y - second.y || first.x - second.x)
      .forEach((widget) => {
        const compacted = { ...widget };
        compacted.x = Math.max(0, Math.min(columns - compacted.w, compacted.x));
        while (compacted.y > 0) {
          const candidate = { ...compacted, y: compacted.y - 1 };
          if (placed.some((item) => widgetsOverlap(candidate, item))) break;
          compacted.y -= 1;
        }
        placed.push(compacted);
      });

    const byId = new Map(placed.map((widget) => [widget.widgetId, widget]));
    return widgets.map((widget) => byId.get(widget.widgetId) || widget);
  }

  function compactDashboardLayout(layout, columns = layout?.columns || DESKTOP_COLUMNS) {
    const cloned = cloneLayout(layout);
    cloned.widgets = compactWidgetsUp(cloned.widgets || [], columns);
    return cloned;
  }

  function adaptLayoutToColumns(layout, targetColumnCount) {
    const columns = Math.max(1, Math.min(DESKTOP_COLUMNS, targetColumnCount));
    if (columns === DESKTOP_COLUMNS) return compactDashboardLayout(layout, DESKTOP_COLUMNS);

    const placed = [];
    [...layout.widgets]
      .sort((first, second) => first.y - second.y || first.x - second.x)
      .forEach((widget) => {
        const rules = DASHBOARD_WIDGET_REGISTRY[widget.widgetId];
        const scaledWidth = rules.fullWidth
          ? columns
          : Math.max(1, Math.min(columns, Math.ceil((widget.w / DESKTOP_COLUMNS) * columns)));
        placed.push(findFirstPosition({ ...widget, x: 0, y: 0, w: scaledWidth }, placed, columns));
      });

    return { ...cloneLayout(layout), columns, widgets: compactWidgetsUp(placed, columns) };
  }

  window.DashboardLayout = {
    DESKTOP_COLUMNS,
    METRIC_IDS,
    DASHBOARD_WIDGET_REGISTRY,
    DEFAULT_DASHBOARD_LAYOUT,
    cloneLayout,
    widgetsOverlap,
    validateDashboardLayout,
    migrateDashboardLayout,
    adaptLayoutToColumns,
    compactDashboardLayout,
  };
})();
