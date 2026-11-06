(function () {
  const DEFAULT_ROWS = 25;
  const VALID_ROWS = new Set([10, 25, 50, 100]);
  const VALID_DRILLDOWN_MODES = new Set(["attention", "all"]);
  const VALID_DRILLDOWN_SOURCES = new Set(["location-card", "manual"]);
  const STATUS_ORDER = { Unprotected: 0, Warning: 1, "No Data": 2, Protected: 3 };
  const SORT_KEYS = new Set(["severity", "testPointId", "location", "latestReading", "weeklyAverage", "changeFromStart", "thresholdCrossings", "comparison", "status", "lastUpdated"]);

  function defaultRowsPerPage() {
    const preferredRows = Number(window.AppPreferences?.getCurrent?.().tableRows);
    return VALID_ROWS.has(preferredRows) && preferredRows <= 50 ? preferredRows : DEFAULT_ROWS;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    }[character]));
  }

  function finiteNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function formatMv(value) {
    const number = finiteNumber(value);
    return number === null ? "No Data" : `${Math.round(number)} mV`;
  }

  function formatDate(value, { dateOnly = false } = {}) {
    if (!value) return "No Data";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "No Data";
    return dateOnly
      ? date.toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" })
      : date.toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" });
  }

  function formatPercent(value) {
    const number = finiteNumber(value);
    return number === null ? "No Data" : `${Math.round(number)}%`;
  }

  function formatOptionalMv(value) {
    return finiteNumber(value) === null ? "—" : formatMv(value);
  }

  function formatOptionalPercent(value) {
    return finiteNumber(value) === null ? "—" : formatPercent(value);
  }

  function distinctPointName(summary) {
    const name = String(summary?.testPoint?.testPointName || "").trim();
    return name && name.toLocaleLowerCase() !== String(summary?.testPointId || "").trim().toLocaleLowerCase() ? name : "";
  }

  function statusClass(status) {
    return ({ Protected: "status-protected", Warning: "status-warning", Unprotected: "status-unprotected", "No Data": "status-unknown" })[status] || "status-unknown";
  }

  function conditionClass(condition) {
    return `condition-${String(condition || "No Data").toLowerCase().replaceAll(" ", "-")}`;
  }

  function comparisonValue(summary) {
    return finiteNumber(summary?.comparison?.weekComparisonMv);
  }

  function singaporeTodayIso() {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function sanitizeIsoDate(value) {
    const candidate = String(value || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return "";
    const date = new Date(`${candidate}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === candidate ? candidate : "";
  }

  function sanitizeLocation(value) {
    const candidate = String(value || "").slice(0, 100);
    return /^[A-Za-z0-9_-]+$/.test(candidate) ? candidate : "";
  }

  function addIsoDays(isoDate, days) {
    const candidate = sanitizeIsoDate(isoDate);
    if (!candidate) return "";
    const [year, month, day] = candidate.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + Number(days || 0))).toISOString().slice(0, 10);
  }

  function previousWeekStart(weekStart) {
    return addIsoDays(weekStart, -7);
  }

  function enterLocationDrilldown(state, locationId, hasAttention) {
    state.location = String(locationId || "");
    state.attentionOnly = Boolean(hasAttention);
    state.drilldownMode = hasAttention ? "attention" : "all";
    state.drilldownSource = "location-card";
    state.view = "testpoints";
    state.page = 1;
    return state;
  }

  function exitLocationDrilldownState(state) {
    state.view = "overview";
    state.page = 1;
    state.drilldownMode = "all";
    if (state.drilldownSource === "location-card") {
      state.location = "";
      state.attentionOnly = false;
    }
    state.drilldownSource = null;
    return state;
  }

  function positiveInteger(value, fallback = 1) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? Math.min(number, 100000) : fallback;
  }

  class WeeklyUrlState {
    static read(search = location.search) {
      const params = new URLSearchParams(search);
      const rows = Number(params.get("rowsPerPage") || params.get("rows"));
      const page = positiveInteger(params.get("page"));
      const view = params.get("view") === "testpoints" ? "testpoints" : "overview";
      const status = ["Protected", "Warning", "Unprotected", "No Data"].includes(params.get("status")) ? params.get("status") : "";
      const direction = params.get("direction") === "desc" ? "desc" : "asc";
      const requestedSort = String(params.get("sortKey") || params.get("sort") || "severity").slice(0, 40);
      const requestedMode = String(params.get("drilldownMode") || "all");
      const requestedSource = String(params.get("drilldownSource") || "");
      const locationFilter = sanitizeLocation(params.get("location"));
      return {
        week: sanitizeIsoDate(params.get("week")),
        view,
        drilldownMode: VALID_DRILLDOWN_MODES.has(requestedMode) ? requestedMode : "all",
        drilldownSource: view === "testpoints" && locationFilter && VALID_DRILLDOWN_SOURCES.has(requestedSource) ? requestedSource : null,
        search: String(params.get("search") || "").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 120),
        location: locationFilter,
        status,
        attentionOnly: (params.get("attentionOnly") || params.get("attention")) === "1",
        decliningOnly: (params.get("decliningOnly") || params.get("declining")) === "1",
        page,
        rows: VALID_ROWS.has(rows) ? rows : defaultRowsPerPage(),
        sort: SORT_KEYS.has(requestedSort) ? requestedSort : "severity",
        direction: (params.get("sortDirection") || params.get("direction")) === "desc" ? "desc" : direction,
      };
    }

    static write(state) {
      const url = new URL(location.href);
      const set = (key, value, fallback = "") => {
        if (value === fallback || value === "" || value === false || value === null || value === undefined) url.searchParams.delete(key);
        else url.searchParams.set(key, String(value));
      };
      set("week", state.week);
      set("view", state.view, "overview");
      set("drilldownMode", state.drilldownMode, "all");
      set("drilldownSource", state.drilldownSource);
      set("search", state.search);
      set("location", state.location);
      set("status", state.status);
      set("attentionOnly", state.attentionOnly ? "1" : "", "");
      set("decliningOnly", state.decliningOnly ? "1" : "", "");
      set("page", state.page, 1);
      set("rowsPerPage", state.rows, defaultRowsPerPage());
      set("sortKey", state.sort, "severity");
      set("sortDirection", state.direction, "asc");
      ["comparisonWeek", "comparison", "attention", "declining", "rows", "sort", "direction"].forEach((key) => url.searchParams.delete(key));
      history.replaceState({ ...(history.state || {}), page: "weekly.php" }, "", url);
    }
  }

  class WeeklySummaryPanel {
    constructor() {
      this.state = WeeklyUrlState.read();
      this.repository = new window.AppRepositories.WeeklySummaryRepository();
      this.aggregator = window.WeeklyLocationAggregator;
      this.summaries = [];
      this.dailySummaries = [];
      this.dailySummariesError = null;
      this.contextFilteredSummaries = [];
      this.filteredSummaries = [];
      this.locations = [];
      this.availableWeeks = [];
      this.comparisonWeek = "";
      this.completeLocationSummaries = [];
      this.visibleLocationSummaries = [];
      this.charts = {};
      this.sortController = null;
      this.abortController = null;
      this.searchTimer = null;
      this.requestToken = 0;
      this.destroyed = false;
      this.initialDrilldownResolved = false;
    }

    init() {
      this.destroy();
      this.destroyed = false;
      this.abortController = new AbortController();
      this.cacheElements();
      this.applyStateToControls();
      this.bindEvents();
      const sortableKeys = new Set([...this.elements.sortRoot?.querySelectorAll("[data-table-sort-key]") || []].map((header) => header.dataset.tableSortKey));
      this.sortController = new window.TableSortController({
        root: this.elements.sortRoot,
        initialKey: sortableKeys.has(this.state.sort) ? this.state.sort : "",
        initialDirection: this.state.direction,
        onSortChanged: ({ key, direction }) => {
          this.state.sort = key;
          this.state.direction = direction;
          this.state.page = 1;
          this.renderFromState();
        },
      });
      this.loadWeekOptionsAndRender();
    }

    cacheElements() {
      const byId = (id) => document.getElementById(id);
      this.elements = {
        page: document.querySelector(".weekly-page"),
        week: byId("weekSelector"), previousWeek: byId("weeklyPreviousWeek"), nextWeek: byId("weeklyNextWeek"),
        comparisonLabel: byId("weeklyComparisonLabel"), search: byId("weeklySearch"), searchClear: byId("weeklySearchClear"),
        location: byId("weeklyLocationFilter"), status: byId("statusFilter"), attention: byId("attentionOnly"),
        declining: byId("decliningOnly"), reset: byId("resetWeekly"), metrics: byId("weeklyMetrics"),
        resultCount: byId("weeklyFilterResultCount"), chips: byId("weeklyFilterChips"), locationCards: byId("weeklyLocationCards"),
        locationCount: byId("weeklyLocationCount"), attentionBody: byId("weeklyAttentionBody"), attentionEmpty: byId("weeklyAttentionEmpty"),
        attentionMeta: byId("weeklyAttentionMeta"), viewAllAttention: byId("viewAllAttention"), overview: byId("weeklyLocationOverview"),
        testPointView: byId("weeklyTestPointView"), viewTitle: byId("weeklyTestPointViewTitle"), viewContext: byId("weeklyTestPointContext"),
        drilldownMetrics: byId("weeklyDrilldownMetrics"), backOverview: byId("weeklyBackToOverview"), tableBody: byId("weeklyTableBody"),
        tableMeta: byId("weeklyTableMeta"), showing: byId("weeklyShowingText"), pagination: byId("weeklyPagination"),
        empty: byId("weeklyEmptyState"), rows: byId("rowsPerPage"), sortRoot: document.querySelector(".weekly-table thead"),
        trendFrame: byId("weeklyTrendChartFrame"), trendState: byId("weeklyTrendChartState"),
        statusSummary: byId("assetStatusChartSummary"),
      };
    }

    applyStateToControls() {
      if (this.elements.search) this.elements.search.value = this.state.search;
      if (this.elements.status) this.elements.status.value = this.state.status;
      if (this.elements.attention) this.elements.attention.checked = this.state.attentionOnly;
      if (this.elements.declining) this.elements.declining.checked = this.state.decliningOnly;
      if (this.elements.rows) this.elements.rows.value = String(this.state.rows);
      this.updateViewPanels();
      this.updateDrilldownControls();
    }

    bindEvents() {
      const signal = this.abortController.signal;
      this.elements.week?.addEventListener("change", () => {
        this.state.week = this.elements.week.value;
        this.state.page = 1;
        this.updateWeekNavigation();
        this.loadData();
      }, { signal });
      this.elements.previousWeek?.addEventListener("click", () => this.selectAdjacentWeek(1), { signal });
      this.elements.nextWeek?.addEventListener("click", () => this.selectAdjacentWeek(-1), { signal });
      this.elements.search?.addEventListener("input", () => {
        clearTimeout(this.searchTimer);
        this.elements.searchClear.hidden = !this.elements.search.value;
        this.searchTimer = setTimeout(() => {
          this.state.search = this.elements.search.value.trim();
          this.state.page = 1;
          this.renderFromState();
        }, 250);
      }, { signal });
      this.elements.searchClear?.addEventListener("click", () => {
        this.elements.search.value = "";
        this.elements.searchClear.hidden = true;
        this.state.search = "";
        this.state.page = 1;
        this.renderFromState();
        this.elements.search.focus();
      }, { signal });
      this.elements.location?.addEventListener("change", () => {
        this.state.location = this.elements.location.value;
        this.state.drilldownSource = this.state.location ? "manual" : null;
        this.state.page = 1;
        if (this.state.view === "testpoints" && this.state.location) this.chooseLocationDrilldownMode(this.state.location);
        this.renderFromState();
      }, { signal });
      this.elements.status?.addEventListener("change", () => {
        this.state.status = this.elements.status.value;
        this.state.page = 1;
        this.renderFromState();
      }, { signal });
      this.elements.attention?.addEventListener("change", () => {
        this.state.attentionOnly = this.elements.attention.checked;
        this.state.page = 1;
        this.renderFromState();
      }, { signal });
      this.elements.declining?.addEventListener("change", () => {
        this.state.decliningOnly = this.elements.declining.checked;
        this.state.page = 1;
        this.renderFromState();
      }, { signal });
      this.elements.rows?.addEventListener("change", () => {
        this.state.rows = VALID_ROWS.has(Number(this.elements.rows.value)) ? Number(this.elements.rows.value) : DEFAULT_ROWS;
        this.state.page = 1;
        this.renderFromState();
      }, { signal });
      this.elements.reset?.addEventListener("click", () => this.resetFilters(), { signal });
      this.elements.backOverview?.addEventListener("click", () => this.exitLocationDrilldown(), { signal });
      this.elements.viewAllAttention?.addEventListener("click", () => {
        this.state.drilldownMode = "attention";
        this.state.drilldownSource = this.state.location ? "manual" : null;
        this.setView("testpoints");
      }, { signal });
      document.addEventListener("click", (event) => this.handleDocumentClick(event), { signal });
    }

    handleDocumentClick(event) {
      const viewButton = event.target.closest("[data-weekly-view]");
      if (viewButton) {
        if (viewButton.dataset.weeklyView === "overview") this.exitLocationDrilldown();
        else this.setView("testpoints");
      }

      const locationButton = event.target.closest("[data-weekly-location]");
      if (locationButton) {
        const locationId = locationButton.dataset.weeklyLocation;
        const locationSummary = this.completeLocationSummaries.find((item) => String(item.locationId) === String(locationId));
        enterLocationDrilldown(this.state, locationId, Number(locationSummary?.attentionCount || 0) > 0);
        if (this.elements.location) this.elements.location.value = this.state.location;
        this.renderFromState();
      }

      const modeButton = event.target.closest("[data-weekly-drilldown-mode]");
      if (modeButton) {
        const mode = modeButton.dataset.weeklyDrilldownMode;
        if (VALID_DRILLDOWN_MODES.has(mode)) {
          this.state.drilldownMode = mode;
          this.state.page = 1;
          this.renderFromState();
        }
      }

      const detailButton = event.target.closest("[data-weekly-test-point]");
      if (detailButton) this.openTestPoint(detailButton.dataset.weeklyTestPoint);

      const pageButton = event.target.closest("[data-weekly-page]");
      if (pageButton && !pageButton.disabled) {
        this.state.page = Math.max(1, Number(pageButton.dataset.weeklyPage) || 1);
        this.renderFromState();
      }

      const chip = event.target.closest("[data-weekly-remove-filter]");
      if (chip) this.removeFilter(chip.dataset.weeklyRemoveFilter);
    }

    async loadWeekOptionsAndRender() {
      this.setLoading(true, "Loading reporting weeks…");
      try {
        const weeks = await this.repository.getAvailableWeeks(40);
        if (this.destroyed) return;
        if (!weeks.length) throw new Error("No reporting weeks are available yet.");
        this.availableWeeks = weeks.slice().sort((first, second) => String(second.weekStartDate).localeCompare(String(first.weekStartDate)));
        const validWeeks = new Set(this.availableWeeks.map((week) => week.weekStartDate));
        if (!validWeeks.has(this.state.week)) this.state.week = this.availableWeeks[0].weekStartDate;
        this.renderWeekOptions(this.availableWeeks);
        await this.loadData();
      } catch (error) {
        this.renderError(error);
      }
    }

    renderWeekOptions(weeks) {
      this.elements.week.innerHTML = weeks.map((week) => `<option value="${escapeHtml(week.weekStartDate)}">Week of ${escapeHtml(formatDate(week.weekStartDate, { dateOnly: true }))} (${week.readingCount} readings)</option>`).join("");
      this.elements.week.value = this.state.week;
      this.updateWeekNavigation();
    }

    updateWeekNavigation() {
      this.comparisonWeek = previousWeekStart(this.state.week);
      const selectedIndex = this.availableWeeks.findIndex((week) => week.weekStartDate === this.state.week);
      if (this.elements.previousWeek) this.elements.previousWeek.disabled = selectedIndex < 0 || selectedIndex >= this.availableWeeks.length - 1;
      if (this.elements.nextWeek) this.elements.nextWeek.disabled = selectedIndex <= 0;
      if (this.elements.comparisonLabel) {
        this.elements.comparisonLabel.textContent = this.comparisonWeek
          ? `Compared with week of ${formatDate(this.comparisonWeek, { dateOnly: true })}`
          : "No previous-week comparison is available";
      }
    }

    selectAdjacentWeek(indexOffset) {
      const selectedIndex = this.availableWeeks.findIndex((week) => week.weekStartDate === this.state.week);
      const target = this.availableWeeks[selectedIndex + indexOffset];
      if (!target) return;
      this.state.week = target.weekStartDate;
      this.state.page = 1;
      if (this.elements.week) this.elements.week.value = this.state.week;
      this.updateWeekNavigation();
      this.loadData();
    }

    async loadData() {
      const token = ++this.requestToken;
      this.comparisonWeek = previousWeekStart(this.state.week);
      this.updateWeekNavigation();
      this.setLoading(true, "Loading weekly summaries…");
      try {
        const result = await this.repository.getWeeklySummaryData(this.state.week, this.comparisonWeek || null);
        if (this.destroyed || token !== this.requestToken) return;
        const dailyByPoint = new Map();
        const dailySummaries = result.dailySummaries || [];
        dailySummaries.forEach((daily) => {
          if (!dailyByPoint.has(daily.testPointId)) dailyByPoint.set(daily.testPointId, []);
          dailyByPoint.get(daily.testPointId).push(daily);
        });
        const comparisonByPoint = new Map(result.comparisons.map((comparison) => [comparison.testPointId, comparison]));
        this.summaries = result.weeklySummaries.map((summary) => ({
          ...summary,
          dailySummaries: (dailyByPoint.get(summary.testPointUuid) || []).slice().sort((first, second) => String(first.readingDate).localeCompare(String(second.readingDate))),
          comparison: comparisonByPoint.get(summary.testPointUuid) || null,
        }));
        this.dailySummaries = dailySummaries;
        this.dailySummariesError = result.dailySummariesError || null;
        this.populateLocations();
        this.isWeekInProgress = this.aggregator.isWeekInProgress(this.state.week, singaporeTodayIso());
        this.setLoading(false);
        this.renderFromState();
      } catch (error) {
        if (token === this.requestToken) this.renderError(error);
      }
    }

    populateLocations() {
      const byLocation = new Map();
      this.summaries.forEach((summary) => byLocation.set(summary.locationId || summary.testPoint.site, summary.testPoint.site));
      this.locations = [...byLocation.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
      if (this.state.location && !byLocation.has(this.state.location)) this.state.location = "";
      this.elements.location.innerHTML = `<option value="">All locations</option>${this.locations.map((location) => `<option value="${escapeHtml(location.id)}">${escapeHtml(location.name)}</option>`).join("")}`;
      this.elements.location.value = this.state.location;
    }

    chooseLocationDrilldownMode(locationId) {
      const locationSummary = this.completeLocationSummaries.find((item) => String(item.locationId) === String(locationId));
      this.state.drilldownMode = locationSummary?.attentionCount > 0 ? "attention" : "all";
    }

    applyFilters({ includeDrilldown = false } = {}) {
      const query = this.state.search.toLocaleLowerCase();
      return this.summaries.filter((summary) => {
        const status = this.aggregator.statusForSummary(summary);
        const searchText = `${summary.testPointId} ${summary.testPoint.testPointName} ${summary.testPoint.site}`.toLocaleLowerCase();
        if (query && !searchText.includes(query)) return false;
        if (this.state.location && (summary.locationId || summary.testPoint.site) !== this.state.location) return false;
        if (this.state.status && status !== this.state.status) return false;
        if (this.state.attentionOnly && !this.aggregator.needsAttention(summary)) return false;
        if (this.state.decliningOnly && !this.aggregator.isDeclining(summary)) return false;
        if (includeDrilldown && this.state.drilldownMode === "attention" && !this.aggregator.needsAttention(summary)) return false;
        return true;
      });
    }

    sortSummaries(rows) {
      const key = this.state.sort;
      const direction = this.state.direction === "desc" ? -1 : 1;
      const valueFor = (summary) => ({
        testPointId: summary.testPointId,
        location: summary.testPoint.site,
        latestReading: summary.latestReading,
        weeklyAverage: summary.weeklyAverage,
        changeFromStart: summary.changeFromStart,
        thresholdCrossings: summary.thresholdCrossingCount,
        comparison: comparisonValue(summary),
        status: STATUS_ORDER[this.aggregator.statusForSummary(summary)],
        lastUpdated: summary.lastUpdated ? new Date(summary.lastUpdated).getTime() : null,
      })[key];
      return rows.map((row, index) => ({ row, index })).sort((first, second) => {
        if (key === "severity") {
          const compared = this.aggregator.compareAttention(first.row, second.row);
          return compared || first.index - second.index;
        }
        const a = valueFor(first.row);
        const b = valueFor(second.row);
        const aMissing = a === null || a === undefined || a === "";
        const bMissing = b === null || b === undefined || b === "";
        if (aMissing || bMissing) return aMissing === bMissing ? first.index - second.index : aMissing ? 1 : -1;
        const compared = typeof a === "number" && typeof b === "number"
          ? a - b
          : String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true });
        return compared ? compared * direction : first.index - second.index;
      }).map(({ row }) => row);
    }

    renderFromState() {
      this.completeLocationSummaries = this.aggregator.aggregate(this.summaries);
      if (!this.initialDrilldownResolved) {
        if (this.state.view === "testpoints" && this.state.location && !new URLSearchParams(location.search).has("drilldownMode")) {
          this.chooseLocationDrilldownMode(this.state.location);
        }
        if (this.state.view === "testpoints" && this.state.location && !this.state.drilldownSource) {
          this.state.drilldownSource = "manual";
        }
        this.initialDrilldownResolved = true;
      }
      this.contextFilteredSummaries = this.applyFilters();
      this.filteredSummaries = this.sortSummaries(this.applyFilters({ includeDrilldown: this.state.view === "testpoints" }));
      this.visibleLocationSummaries = this.aggregator.aggregateVisibleLocations(this.summaries, this.contextFilteredSummaries);
      const totalPages = Math.max(1, Math.ceil(this.filteredSummaries.length / this.state.rows));
      this.state.page = Math.min(Math.max(1, this.state.page), totalPages);
      this.updateViewPanels();
      this.renderMetrics();
      this.renderFilters();
      this.renderLocations();
      this.renderAttention();
      this.renderTable();
      this.updateDrilldownControls();
      WeeklyUrlState.write(this.state);
      if (this.state.view === "overview") requestAnimationFrame(() => this.renderCharts());
    }

    updateViewPanels() {
      const overview = this.state.view !== "testpoints";
      if (this.elements?.overview) this.elements.overview.hidden = !overview;
      if (this.elements?.testPointView) this.elements.testPointView.hidden = overview;
      document.querySelectorAll("[data-weekly-view]").forEach((button) => {
        const active = button.dataset.weeklyView === this.state.view;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
    }

    setView(view) {
      this.state.view = view === "testpoints" ? "testpoints" : "overview";
      this.state.page = 1;
      this.renderFromState();
    }

    exitLocationDrilldown() {
      exitLocationDrilldownState(this.state);
      this.applyStateToControls();
      if (this.elements.location) this.elements.location.value = this.state.location;
      this.renderFromState();
    }

    updateDrilldownControls() {
      document.querySelectorAll("[data-weekly-drilldown-mode]").forEach((button) => {
        const active = button.dataset.weeklyDrilldownMode === this.state.drilldownMode;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
    }

    renderMetrics() {
      const overall = this.aggregator.summarizeOverall(this.contextFilteredSummaries);
      const drilldown = this.aggregator.summarizeOverall(this.filteredSummaries);
      const metrics = [
        ["Total Test Points", overall.counts.total, "fa-location-crosshairs", "blue"],
        ["Protected", overall.counts.protected, "fa-shield-halved", "green"],
        ["Warning", overall.counts.warning, "fa-triangle-exclamation", "orange"],
        ["Unprotected", overall.counts.unprotected, "fa-circle-exclamation", "red"],
        ["No Data", overall.counts.noData, "fa-circle-question", "gray"],
        ["Declining", overall.decliningCount, "fa-arrow-trend-down", "purple"],
      ];
      this.elements.metrics.innerHTML = metrics.map(([label, value, icon, tone]) => `
        <article class="weekly-metric-card ${tone}"><span class="weekly-metric-icon"><i class="fa-solid ${icon}" aria-hidden="true"></i></span><div><h2>${value}</h2><p>${label}</p></div></article>`).join("");

      const location = this.locations.find((item) => item.id === this.state.location);
      const modeLabel = this.state.drilldownMode === "attention" ? "Needs Attention" : "All Test Points";
      this.elements.viewTitle.textContent = location ? `${location.name} — ${modeLabel}` : modeLabel;
      const inProgress = this.aggregator.isWeekInProgress(this.state.week, singaporeTodayIso());
      this.elements.viewContext.textContent = `${this.filteredSummaries.length} Test Points for week of ${formatDate(this.state.week, { dateOnly: true })}${this.comparisonWeek ? `, compared with the previous week of ${formatDate(this.comparisonWeek, { dateOnly: true })}` : ""}${inProgress ? " · Week in progress" : ""}.`;
      this.elements.drilldownMetrics.innerHTML = `<span><strong>${escapeHtml(formatMv(drilldown.weightedWeeklyAverage))}</strong> Supporting weighted average</span>`;
    }

    renderLocations() {
      const locations = this.visibleLocationSummaries;
      this.elements.locationCount.textContent = `${locations.length} location${locations.length === 1 ? "" : "s"}`;
      this.elements.locationCards.innerHTML = locations.length ? locations.map((location) => {
        const filteredContext = location.isFiltered
          ? `<p class="weekly-location-filter-context"><strong>${location.visibleCount} of ${location.counts.total}</strong> Test Points match the current filters. The condition and counts above still use all active Test Points at this Location.</p>`
          : "";
        const actionLabel = location.attentionCount ? "Review Priority Test Points" : "View All Test Points";
        return `
        <article class="weekly-location-card ${conditionClass(location.condition)}">
          <header><div><span class="weekly-condition-badge">${escapeHtml(location.condition)}</span><h3>${escapeHtml(location.siteName)}</h3></div><strong>${location.counts.total}<small>Test Points</small></strong></header>
          <div class="weekly-condition-reason"><strong>Reason for condition</strong><span>${escapeHtml(location.conditionReason)}</span></div>
          <div class="weekly-location-statuses" aria-label="Status counts">
            <span><i class="status-dot protected"></i>${location.counts.protected} Protected</span>
            <span><i class="status-dot warning"></i>${location.counts.warning} Warning</span>
            <span><i class="status-dot unprotected"></i>${location.counts.unprotected} Unprotected</span>
            <span><i class="status-dot unknown"></i>${location.counts.noData} No Data</span>
          </div>
          <dl>
            <div><dt>Protected of known</dt><dd>${escapeHtml(formatOptionalPercent(location.protectedPercentage))}</dd></div>
            <div><dt>Supporting Location-wide weighted average</dt><dd>${escapeHtml(formatOptionalMv(location.weightedWeeklyAverage))}</dd></div>
            <div><dt>Needs attention</dt><dd>${location.attentionCount}</dd></div>
            <div><dt>Declining points</dt><dd>${location.decliningCount}</dd></div>
            <div><dt>Threshold crossings</dt><dd>${location.thresholdCrossingCount}</dd></div>
            <div><dt>Worst Test Point</dt><dd>${escapeHtml(location.worstTestPoint?.testPointId || "—")}</dd></div>
            <div><dt>Worst latest reading</dt><dd>${escapeHtml(formatOptionalMv(location.worstTestPoint?.latestReading))}</dd></div>
          </dl>
          <p class="weekly-average-disclaimer">This value supports comparison only and never determines the Location condition.</p>
          ${filteredContext}
          <button type="button" class="btn btn-light full" data-weekly-location="${escapeHtml(location.locationId)}" aria-label="${escapeHtml(actionLabel)} at ${escapeHtml(location.siteName)}">${escapeHtml(actionLabel)}</button>
        </article>`;
      }).join("") : `<div class="empty-state weekly-location-empty">${this.summaries.length ? "No locations match the current filters." : "No active Locations are available."}</div>`;
    }

    renderAttention() {
      const rows = this.filteredSummaries.filter((summary) => this.aggregator.needsAttention(summary)).slice().sort((a, b) => this.aggregator.compareAttention(a, b));
      const visible = rows.slice(0, 15);
      this.elements.attentionMeta.textContent = `${rows.length} Test Point${rows.length === 1 ? "" : "s"} require attention; showing the highest-priority ${visible.length}.`;
      this.elements.viewAllAttention.hidden = rows.length === 0;
      this.elements.attentionEmpty.hidden = rows.length !== 0;
      this.elements.attentionBody.innerHTML = visible.map((summary, index) => {
        const status = this.aggregator.statusForSummary(summary);
        const pointName = distinctPointName(summary);
        const weeklyTrend = window.AppTrendPresentation.renderTrendValue({
          deltaMv: summary.changeFromStart,
          semanticStatus: summary.statusChange,
          context: "week",
        });
        return `<tr>
          <td><span class="weekly-priority-number">${index + 1}</span></td>
          <td><strong>${escapeHtml(summary.testPointId)}</strong>${pointName ? `<small>${escapeHtml(pointName)}</small>` : ""}</td>
          <td>${escapeHtml(summary.testPoint.site)}</td>
          <td class="weekly-attention-reason">${escapeHtml(this.aggregator.primaryAttentionReason(summary))}</td>
          <td class="app-table-status"><span class="badge app-status-badge ${statusClass(status)}">${escapeHtml(status)}</span></td>
          <td class="app-table-numeric">${escapeHtml(formatOptionalMv(summary.latestReading))}</td>
          <td class="app-table-numeric">${weeklyTrend}</td>
          <td class="app-table-numeric">${summary.thresholdCrossingCount}</td>
          <td class="app-table-action"><button type="button" class="btn btn-light compact" data-weekly-test-point="${escapeHtml(summary.testPointUuid)}" aria-label="View details for ${escapeHtml(summary.testPointId)}">View Details</button></td>
        </tr>`;
      }).join("");
    }

    renderFilters() {
      const active = [];
      if (this.state.search) active.push(["search", `Search: ${this.state.search}`]);
      if (this.state.location) active.push(["location", `Location: ${this.locations.find((item) => item.id === this.state.location)?.name || "Selected"}`]);
      if (this.state.status) active.push(["status", `Status: ${this.state.status}`]);
      if (this.state.attentionOnly) active.push(["attention", "Needs attention"]);
      if (this.state.decliningOnly) active.push(["declining", "Declining only"]);
      this.elements.resultCount.textContent = `Showing ${this.filteredSummaries.length} of ${this.summaries.length} Test Points`;
      this.elements.searchClear.hidden = !this.state.search;
      this.elements.chips.innerHTML = active.map(([key, label]) => `<button type="button" class="dashboard-filter-chip" data-weekly-remove-filter="${key}" aria-label="Remove ${escapeHtml(label)} filter">${escapeHtml(label)} <i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`).join("");
    }

    removeFilter(key) {
      if (key === "search") { this.state.search = ""; this.elements.search.value = ""; }
      if (key === "location") { this.state.location = ""; this.state.drilldownSource = null; this.elements.location.value = ""; }
      if (key === "status") { this.state.status = ""; this.elements.status.value = ""; }
      if (key === "attention") { this.state.attentionOnly = false; this.elements.attention.checked = false; }
      if (key === "declining") { this.state.decliningOnly = false; this.elements.declining.checked = false; }
      this.state.page = 1;
      this.renderFromState();
    }

    resetFilters() {
      Object.assign(this.state, { search: "", location: "", status: "", attentionOnly: false, decliningOnly: false, drilldownMode: "all", drilldownSource: null, page: 1, sort: "severity", direction: "asc" });
      this.applyStateToControls();
      if (this.elements.location) this.elements.location.value = "";
      this.sortController?.destroy();
      this.sortController = new window.TableSortController({ root: this.elements.sortRoot, onSortChanged: ({ key, direction }) => {
        this.state.sort = key; this.state.direction = direction; this.state.page = 1; this.renderFromState();
      }});
      this.renderFromState();
    }

    renderTable() {
      const total = this.filteredSummaries.length;
      const totalPages = Math.max(1, Math.ceil(total / this.state.rows));
      const start = (this.state.page - 1) * this.state.rows;
      const pageRows = this.filteredSummaries.slice(start, start + this.state.rows);
      const singleLocation = Boolean(this.state.location);
      document.querySelectorAll("[data-weekly-location-column]").forEach((cell) => { cell.hidden = singleLocation; });
      document.querySelector(".weekly-table")?.classList.toggle("weekly-table-single-location", singleLocation);
      this.elements.empty.hidden = total !== 0;
      this.elements.tableMeta.textContent = `${total} Test Point${total === 1 ? "" : "s"} in ${this.state.drilldownMode === "attention" ? "Needs Attention" : "All Test Points"}; the full filtered dataset is sorted before pagination.`;
      this.elements.tableBody.innerHTML = pageRows.map((summary) => {
        const status = this.aggregator.statusForSummary(summary);
        const weeklyTrend = window.AppTrendPresentation.renderTrendValue({
          deltaMv: summary.changeFromStart,
          semanticStatus: summary.statusChange,
          context: "week",
        });
        const comparisonTrend = window.AppTrendPresentation.renderTrendValue({
          deltaMv: comparisonValue(summary),
          context: "comparison",
        });
        return `<tr>
          <td><strong>${escapeHtml(summary.testPointId)}</strong></td>
          <td data-weekly-location-column ${singleLocation ? "hidden" : ""}>${escapeHtml(summary.testPoint.site)}</td>
          <td class="app-table-numeric">${escapeHtml(formatOptionalMv(summary.latestReading))}</td>
          <td class="app-table-numeric">${escapeHtml(formatOptionalMv(summary.weeklyAverage))}</td>
          <td class="app-table-numeric">${weeklyTrend}</td>
          <td class="app-table-numeric">${comparisonTrend}</td>
          <td class="app-table-status"><span class="badge app-status-badge ${statusClass(status)}">${escapeHtml(status)}</span></td>
          <td class="app-table-numeric">${summary.thresholdCrossingCount}</td>
          <td>${escapeHtml(summary.lastUpdated ? formatDate(summary.lastUpdated) : "—")}</td>
          <td class="app-table-action"><button type="button" class="btn btn-light compact" data-weekly-test-point="${escapeHtml(summary.testPointUuid)}" aria-label="View details for ${escapeHtml(summary.testPointId)}">View Details</button></td>
        </tr>`;
      }).join("");
      this.elements.showing.textContent = total ? `Showing ${start + 1}-${Math.min(start + this.state.rows, total)} of ${total}` : "Showing 0-0 of 0";
      this.elements.pagination.innerHTML = this.paginationMarkup(totalPages);
    }

    paginationMarkup(totalPages) {
      if (totalPages <= 1) return "";
      const pages = new Set([1, totalPages, this.state.page - 1, this.state.page, this.state.page + 1]);
      const ordered = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
      const parts = [`<button type="button" class="page-btn" data-weekly-page="${this.state.page - 1}" ${this.state.page === 1 ? "disabled" : ""} aria-label="Previous page">‹</button>`];
      ordered.forEach((page, index) => {
        if (index && page - ordered[index - 1] > 1) parts.push(`<span class="pagination-ellipsis" aria-hidden="true">…</span>`);
        parts.push(`<button type="button" class="page-btn ${page === this.state.page ? "active" : ""}" data-weekly-page="${page}" ${page === this.state.page ? 'aria-current="page"' : ""} aria-label="Page ${page}">${page}</button>`);
      });
      parts.push(`<button type="button" class="page-btn" data-weekly-page="${this.state.page + 1}" ${this.state.page === totalPages ? "disabled" : ""} aria-label="Next page">›</button>`);
      return parts.join("");
    }

    renderCharts() {
      if (this.destroyed || this.state.view !== "overview") return;
      if (typeof Chart === "undefined") {
        if (this.elements.trendFrame) this.elements.trendFrame.hidden = true;
        if (this.elements.trendState) {
          this.elements.trendState.hidden = false;
          this.elements.trendState.textContent = "Charts could not be loaded because the chart library is unavailable.";
        }
        return;
      }
      Object.values(this.charts).forEach((chart) => chart?.destroy());
      this.charts = {};
      const visibleIds = new Set(this.filteredSummaries.map((summary) => summary.testPointUuid));
      const thresholdValues = [...new Set(this.filteredSummaries
        .map((summary) => finiteNumber(summary.thresholdMv))
        .filter((value) => value !== null))];
      const protectionPresentation = window.AppChartProtectionPresentation;
      const thresholdReference = protectionPresentation?.resolveThresholdReference?.(thresholdValues, -850) || {
        thresholdMv: thresholdValues.length === 1 ? thresholdValues[0] : -850,
        definitive: thresholdValues.length === 1,
        source: thresholdValues.length > 1 ? "mixed" : "baseline",
      };
      const thresholdMv = thresholdReference.thresholdMv;
      protectionPresentation?.renderLegend?.(
        document.getElementById("weeklyTrendZoneLegend"),
        thresholdReference,
      );
      const trendModel = window.WeeklyDailyTrend.buildOverallDailyTrend({
        weekStart: this.state.week,
        dailySummaries: this.dailySummaries,
        visibleTestPointIds: visibleIds,
        thresholdMv,
      });
      const trendCanvas = document.getElementById("weeklyTrendChart");
      const showTrendState = (message) => {
        if (this.elements.trendFrame) this.elements.trendFrame.hidden = true;
        if (this.elements.trendState) {
          this.elements.trendState.hidden = false;
          this.elements.trendState.textContent = message;
        }
      };
      if (this.dailySummariesError) {
        showTrendState("Daily trend could not be loaded. Weekly summary metrics remain available.");
      } else if (!trendModel.hasData) {
        const filtersRemovedData = this.dailySummaries.length > 0;
        showTrendState(filtersRemovedData
          ? "No daily readings match the current filters. Clear filters to view the selected-week trend."
          : "No daily readings are available for the selected week and filters.");
      } else {
        if (this.elements.trendFrame) this.elements.trendFrame.hidden = false;
        if (this.elements.trendState) this.elements.trendState.hidden = true;
        if (trendCanvas) {
          const trendConfig = window.WeeklyDailyTrend.createOverallChartConfig(trendModel);
          trendConfig.options.animation = window.AppChartAnimation?.getEntranceAnimation?.() ?? false;
          protectionPresentation?.applyToChartConfig?.(trendConfig, thresholdReference);
          this.charts.trend = new Chart(trendCanvas, trendConfig);
        }
      }

      const locations = this.visibleLocationSummaries;
      const statusCanvas = document.getElementById("assetStatusChart");
      if (statusCanvas?.parentElement) statusCanvas.parentElement.style.minHeight = `${Math.max(300, locations.length * 38)}px`;
      if (statusCanvas) this.charts.status = new Chart(statusCanvas, {
        type: "bar",
        data: { labels: locations.map((location) => location.siteName), datasets: [
          { label: "Protected", data: locations.map((location) => location.counts.protected), backgroundColor: "#1f9d7a" },
          { label: "Warning", data: locations.map((location) => location.counts.warning), backgroundColor: "#e1a62b" },
          { label: "Unprotected", data: locations.map((location) => location.counts.unprotected), backgroundColor: "#c94a4a" },
          { label: "No Data", data: locations.map((location) => location.counts.noData), backgroundColor: "#8b95a5" },
        ] },
        options: { responsive: true, maintainAspectRatio: false, animation: window.AppChartAnimation?.getEntranceAnimation?.() ?? false, indexAxis: locations.length > 6 ? "y" : "x", plugins: { legend: { position: "bottom" } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } },
      });
      this.elements.statusSummary.textContent = locations.map((location) => `${location.siteName}: ${location.condition}. ${location.conditionReason} ${location.counts.protected} Protected, ${location.counts.warning} Warning, ${location.counts.unprotected} Unprotected and ${location.counts.noData} No Data.`).join(" ");
    }

    openTestPoint(testPointId) {
      if (!testPointId) return;
      WeeklyUrlState.write(this.state);
      const target = window.AppNavigation?.buildTestPointDetailUrl?.(testPointId, { returnTo: "weekly.php", returnSearch: location.search })
        || `testpoint-view.php?id=${encodeURIComponent(testPointId)}&returnTo=weekly.php&returnSearch=${encodeURIComponent(location.search)}`;
      if (window.AppNavigation?.navigateToPage) window.AppNavigation.navigateToPage(target);
      else location.assign(target);
    }

    setLoading(loading) {
      this.elements?.page?.setAttribute("aria-busy", String(Boolean(loading)));
    }

    renderError(error) {
      console.error("Unable to load Weekly Summary:", error);
      this.setLoading(false);
      if (this.elements?.locationCards) this.elements.locationCards.innerHTML = `<div class="empty-state weekly-location-empty">${escapeHtml(error?.message || "Unable to load Weekly Summary data.")}</div>`;
      window.AppToast?.error?.(error?.message || "Unable to load Weekly Summary data.");
    }

    destroy() {
      this.destroyed = true;
      this.requestToken += 1;
      clearTimeout(this.searchTimer);
      this.abortController?.abort();
      this.abortController = null;
      this.sortController?.destroy();
      this.sortController = null;
      Object.values(this.charts || {}).forEach((chart) => chart?.destroy());
      this.charts = {};
    }
  }

  let controller = null;
  function init() {
    controller?.destroy();
    controller = new WeeklySummaryPanel();
    controller.init();
  }
  function destroy() {
    controller?.destroy();
    controller = null;
  }

  window.WeeklyUrlState = WeeklyUrlState;
  window.WeeklyWeekNavigation = { addIsoDays, previousWeekStart };
  window.WeeklyDrilldownState = { enterLocationDrilldown, exitLocationDrilldownState };
  window.WeeklyPage = { init, destroy };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => {
    if ((location.pathname.split("/").pop() || "") === "weekly.php") init();
  }, { once: true });
  else if ((location.pathname.split("/").pop() || "") === "weekly.php") init();
})();
