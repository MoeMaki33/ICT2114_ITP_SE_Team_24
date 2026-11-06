(function () {
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    }[character]));
  }

  function finite(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function formatMv(value) {
    const number = finite(value);
    return number === null ? "—" : `${Math.round(number)} mV`;
  }

  function formatCount(value, singular, plural = `${singular}s`) {
    const count = Math.max(0, Number(value) || 0);
    return `${count.toLocaleString("en-SG")} ${count === 1 ? singular : plural}`;
  }

  function dateLabel(value) {
    const date = new Date(`${value}T00:00:00+08:00`);
    return Number.isNaN(date.getTime())
      ? String(value || "")
      : date.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
  }

  function addIsoDays(isoDate, days) {
    const [year, month, day] = String(isoDate || "").split("-").map(Number);
    if (![year, month, day].every(Number.isFinite)) return "";
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
  }

  function trendModel(deltaMv, semanticStatus = "", context = "week") {
    return window.AppTrendPresentation?.getTrendPresentation?.({ deltaMv, semanticStatus, context }) || {
      semantic: finite(deltaMv) === null ? "unknown" : Math.abs(Number(deltaMv)) <= 5 ? "stable" : Number(deltaMv) < 0 ? "improved" : "worsened",
      label: finite(deltaMv) === null ? "Insufficient data" : Math.abs(Number(deltaMv)) <= 5 ? "Stable" : Number(deltaMv) < 0 ? "Improved" : "Worsened",
      value: finite(deltaMv) === null ? "—" : `${Number(deltaMv) > 0 ? "+" : ""}${Math.round(Number(deltaMv))} mV`,
      iconClass: finite(deltaMv) === null ? "fa-circle-minus" : Math.abs(Number(deltaMv)) <= 5 ? "fa-minus" : Number(deltaMv) < 0 ? "fa-arrow-trend-up" : "fa-arrow-trend-down",
    };
  }

  function metric(label, value, note = "", className = "", iconClass = "") {
    return `<div class="detail-weekly-metric ${className}">
      <span>${escapeHtml(label)}</span>
      <div class="detail-weekly-metric-value">${iconClass ? `<i class="fa-solid ${escapeHtml(iconClass)}" aria-hidden="true"></i>` : ""}<strong>${escapeHtml(value)}</strong></div>
      ${note ? `<small>${escapeHtml(note)}</small>` : ""}
    </div>`;
  }

  function group(title, content) {
    return `<section class="detail-weekly-group"><h4>${escapeHtml(title)}</h4><div class="detail-weekly-group-grid">${content}</div></section>`;
  }

  class TestPointWeeklyView {
    constructor({ repository, onDataChanged, onLoading, onError } = {}) {
      this.repository = repository;
      this.onDataChanged = onDataChanged;
      this.onLoading = onLoading;
      this.onError = onError;
      this.pointId = null;
      this.point = null;
      this.week = "";
      this.comparison = "";
      this.weeks = [];
      this.currentData = null;
      this.destroyed = false;
      this.requestToken = 0;
      this.abortController = new AbortController();
      document.addEventListener("change", (event) => {
        const selector = event.target.closest("#detailWeekSelector");
        if (!selector) return;
        this.week = selector.value;
        this.comparison = addIsoDays(this.week, -7);
        this.syncUrlWeek();
        this.loadData();
      }, { signal: this.abortController.signal });
    }

    getInitialContext() {
      const direct = new URLSearchParams(location.search);
      const returnContext = window.AppNavigation?.getTestPointReturnContext?.();
      const origin = new URLSearchParams(String(returnContext?.search || "").replace(/^\?/, ""));
      return { week: direct.get("week") || origin.get("week") || "" };
    }

    renderWeekSelector() {
      const selector = document.getElementById("detailWeekSelector");
      if (!selector) return;
      selector.innerHTML = this.weeks.map((item) => `<option value="${escapeHtml(item.weekStartDate)}">Week of ${escapeHtml(dateLabel(item.weekStartDate))}</option>`).join("");
      selector.value = this.week;
      selector.disabled = !this.weeks.length;
    }

    syncUrlWeek() {
      const url = new URL(location.href);
      if (this.week) url.searchParams.set("week", this.week);
      else url.searchParams.delete("week");
      history.replaceState(history.state, "", `${url.pathname.split("/").pop()}${url.search}${url.hash}`);
    }

    async load(point) {
      const pointId = typeof point === "string" ? point : point?.id;
      this.pointId = pointId;
      this.point = typeof point === "object" ? point : null;
      this.destroyed = false;
      const context = this.getInitialContext();
      this.renderLoading();
      try {
        this.weeks = await this.repository.getAvailableWeeks(40);
        if (this.destroyed || this.pointId !== pointId) return;
        const available = new Set(this.weeks.map((item) => item.weekStartDate));
        this.week = available.has(this.week || context.week) ? (this.week || context.week) : this.weeks[0]?.weekStartDate || "";
        this.comparison = addIsoDays(this.week, -7);
        this.renderWeekSelector();
        if (!this.week) {
          this.render(null, [], null, null);
          return;
        }
        await this.loadData();
      } catch (error) {
        this.renderError(error);
      }
    }

    async loadData() {
      const pointId = this.pointId;
      const week = this.week;
      if (!pointId || !week) return;
      const token = ++this.requestToken;
      this.renderLoading();
      try {
        const [weeklyResult, dailyResult, comparisonResult] = await Promise.allSettled([
          this.repository.getWeeklySummaries(week, [pointId]),
          this.repository.getDailySummaries(week, [pointId]),
          this.comparison ? this.repository.compareWeeks(week, this.comparison) : Promise.resolve([]),
        ]);
        if (this.destroyed || token !== this.requestToken || this.pointId !== pointId || this.week !== week) return;
        if (weeklyResult.status === "rejected") throw weeklyResult.reason;
        const dailyError = dailyResult.status === "rejected" ? dailyResult.reason : null;
        if (dailyError) console.error("Unable to load focused Test Point daily summaries. Weekly metrics remain available.", dailyError);
        if (comparisonResult.status === "rejected") console.warn("Unable to load focused Test Point comparison. Selected-week metrics remain available.", comparisonResult.reason);
        const summary = (weeklyResult.value || []).find((item) => item.testPointId === pointId) || weeklyResult.value?.[0] || null;
        const daily = dailyResult.status === "fulfilled" ? (dailyResult.value || []).filter((item) => item.testPointId === pointId) : [];
        const comparison = comparisonResult.status === "fulfilled"
          ? (comparisonResult.value || []).find((item) => item.testPointId === pointId) || null
          : null;
        this.render(summary, daily, comparison, dailyError);
      } catch (error) {
        this.renderError(error);
      }
    }

    renderLoading() {
      const grid = document.getElementById("detailSummaryGrid");
      if (grid) grid.innerHTML = '<div class="detail-empty-state">Loading focused weekly summary…</div>';
      this.onLoading?.({ point: this.point, week: this.week, comparisonWeek: this.comparison, weeks: this.weeks });
    }

    render(summary, daily, comparison, dailyError = null) {
      const grid = document.getElementById("detailSummaryGrid");
      const data = {
        point: this.point,
        week: this.week,
        comparisonWeek: this.comparison,
        weeks: this.weeks.slice(),
        summary,
        daily,
        comparison,
        dailyError,
      };
      this.currentData = data;
      this.renderWeekSelector();

      if (!summary) {
        if (grid) grid.innerHTML = '<div class="detail-empty-state">No weekly summary is available for this Test Point.</div>';
        this.onDataChanged?.(data);
        return;
      }

      const weeklyTrend = trendModel(summary.changeFromStart ?? summary.deltaWeek, summary.statusChange, "week");
      const comparisonTrend = trendModel(comparison?.weekComparisonMv, comparison?.comparisonStatus, "comparison");
      const readingCount = Number(summary.readingCount) || 0;
      const protectedPercentage = finite(summary.protectedPercentage);
      const crossings = Number(summary.thresholdCrossingCount) || 0;
      const displayStatus = readingCount ? String(summary.displayStatus || "Unknown") : "No Data";
      const statusClass = `status-${displayStatus.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "") || "unknown"}`;
      const output = [
        group("Weekly Potential", [
          metric("First reading", formatMv(summary.startOfWeekReading), "First recorded value"),
          metric("Latest reading", formatMv(summary.latestReading), "Latest selected-week value"),
          metric("Weighted weekly average", formatMv(summary.weeklyAverage), "Weighted by reading count"),
          metric("Range", finite(summary.minimumReading) === null ? "—" : `${formatMv(summary.minimumReading)} to ${formatMv(summary.maximumReading)}`, "Minimum to maximum"),
        ].join("")),
        group("Protection Performance", [
          metric("Current protection status", displayStatus, formatCount(readingCount, "reading"), `detail-weekly-status ${statusClass}`),
          metric("Protected percentage", protectedPercentage === null ? "—" : `${Math.round(protectedPercentage)}%`, "Readings within the protection range"),
          metric("Threshold crossings", String(crossings), crossings === 1 ? "One crossing recorded" : "Crossings recorded"),
        ].join("")),
        group("Weekly Behaviour", [
          metric("Change this week", weeklyTrend.value, weeklyTrend.label, `app-trend-${weeklyTrend.semantic}`, weeklyTrend.iconClass),
          metric("Previous-week comparison", comparisonTrend.value, comparisonTrend.label, `app-trend-${comparisonTrend.semantic}`, comparisonTrend.iconClass),
        ].join("")),
      ].join("");
      if (grid) grid.innerHTML = output;
      this.onDataChanged?.(data);
    }

    renderError(error) {
      console.error("Unable to load focused Test Point weekly summary:", error);
      const grid = document.getElementById("detailSummaryGrid");
      if (grid) grid.innerHTML = '<div class="detail-empty-state">Weekly summary could not be loaded. Reading history remains available.</div>';
      const data = { point: this.point, week: this.week, comparisonWeek: this.comparison, weeks: this.weeks.slice(), summary: null, daily: [], comparison: null, dailyError: error, weeklyError: error };
      this.currentData = data;
      this.onError?.(error, data);
      this.onDataChanged?.(data);
    }

    destroy() {
      this.destroyed = true;
      this.requestToken += 1;
      this.abortController.abort();
      this.point = null;
      this.currentData = null;
      this.onDataChanged = null;
      this.onLoading = null;
      this.onError = null;
    }
  }

  window.TestPointWeeklyView = TestPointWeeklyView;
})();
