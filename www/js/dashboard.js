const DASHBOARD_THRESHOLD_MV = -850;
const DASHBOARD_ROWS_PER_PAGE = 10;
const dashboardTableSort = { key: "id", direction: "asc" };

let dashboardPage = 1;
let dashboardRows = [];
let filteredDashboardRows = [];
let dashboardSnapshot = { points: [] };
let dashboardWeeklySummaries = [];
let dashboardDailySummaries = [];
let dashboardLocationSummaries = [];
let dashboardWeeklyByTestPoint = new Map();
let dashboardSelectedWeek = "";
let dashboardComparisonWeek = "";
let dashboardWeeklyModel = null;
let dashboardCharts = {};
let dashboardAbortController = null;
let dashboardSortController = null;
let dashboardChartResizeTimer = null;
let dashboardRequestToken = 0;

function escapeDashboardHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[character]));
}

function setDashboardLoading(message = "Loading Dashboard data…") {
  const metrics = document.getElementById("dashboardMetrics");
  const attentionLocations = document.getElementById("dashboardAttentionLocations");
  const priorityPoints = document.getElementById("dashboardPriorityPoints");
  const tableBody = document.getElementById("dashboardTableBody");
  if (metrics) metrics.innerHTML = `<div class="dashboard-state-card">${escapeDashboardHtml(message)}</div>`;
  if (attentionLocations) attentionLocations.innerHTML = '<p class="widget-inline-empty">Loading Location conditions…</p>';
  if (priorityPoints) priorityPoints.innerHTML = '<p class="widget-inline-empty">Loading priority Test Points…</p>';
  if (tableBody) tableBody.innerHTML = `<tr><td colspan="8">${escapeDashboardHtml(message)}</td></tr>`;
}

function setDashboardError(message) {
  const metrics = document.getElementById("dashboardMetrics");
  if (!metrics) return;
  metrics.innerHTML = `
    <div class="dashboard-state-card error">
      <strong>Unable to load Dashboard data.</strong>
      <span>${escapeDashboardHtml(message)}</span>
      <button class="btn btn-light" type="button" id="retryDashboardLoad">Retry</button>
    </div>`;
  const attentionLocations = document.getElementById("dashboardAttentionLocations");
  const priorityPoints = document.getElementById("dashboardPriorityPoints");
  const period = document.getElementById("dashboardWeeklyPeriod");
  const comparison = document.getElementById("dashboardWeeklyComparison");
  if (attentionLocations) attentionLocations.innerHTML = '<p class="widget-inline-empty">Location conditions are unavailable.</p>';
  if (priorityPoints) priorityPoints.innerHTML = '<p class="widget-inline-empty">Priority Test Points are unavailable.</p>';
  if (period) period.textContent = "Reporting week unavailable";
  if (comparison) comparison.textContent = "";
  document.getElementById("retryDashboardLoad")?.addEventListener("click", loadDashboardData, { once: true });
}

async function loadDashboardData() {
  const requestToken = ++dashboardRequestToken;
  try {
    setDashboardLoading();
    const repositories = window.AppRepositories;
    if (!repositories?.OperationalRepository || !repositories?.WeeklySummaryRepository) {
      throw new Error("Dashboard repositories are not available.");
    }
    if (!window.WeeklyLocationAggregator || !window.DashboardWeeklyModel) {
      throw new Error("Shared weekly-summary logic is not available.");
    }

    const operationalRepository = new repositories.OperationalRepository();
    const weeklyRepository = new repositories.WeeklySummaryRepository();
    const weeks = (await weeklyRepository.getAvailableWeeks(40))
      .slice()
      .sort((first, second) => String(second.weekStartDate).localeCompare(String(first.weekStartDate)));
    if (!weeks.length) throw new Error("No reporting weeks are available yet.");

    dashboardSelectedWeek = weeks[0].weekStartDate;
    dashboardComparisonWeek = window.DashboardWeeklyModel.addIsoDays(dashboardSelectedWeek, -7);
    const pointIdsPromise = weeklyRepository.getWeeklySummaries(dashboardSelectedWeek);
    const dailyPromise = weeklyRepository.getDailySummaries(dashboardSelectedWeek).catch((error) => {
      console.error("Dashboard Location trend could not be loaded. Weekly metrics remain available.", error);
      return [];
    });
    const comparisonPromise = weeklyRepository.compareWeeks(dashboardSelectedWeek, dashboardComparisonWeek).catch((error) => {
      console.warn("Dashboard previous-week comparison could not be loaded.", error);
      return [];
    });

    const [snapshot, weeklySummaries, dailySummaries, comparisons] = await Promise.all([
      operationalRepository.getDashboardSnapshot(),
      pointIdsPromise,
      dailyPromise,
      comparisonPromise,
    ]);
    if (requestToken !== dashboardRequestToken) return;

    dashboardSnapshot = snapshot;
    dashboardWeeklyModel = window.DashboardWeeklyModel.buildModel({
      snapshot,
      weeklySummaries,
      dailySummaries,
      comparisons,
      selectedWeek: dashboardSelectedWeek,
      comparisonWeek: dashboardComparisonWeek,
      aggregator: window.WeeklyLocationAggregator,
    });
    dashboardWeeklySummaries = dashboardWeeklyModel.weeklySummaries;
    dashboardDailySummaries = dashboardWeeklyModel.dailySummaries;
    dashboardLocationSummaries = dashboardWeeklyModel.locationSummaries;
    dashboardWeeklyByTestPoint = dashboardWeeklyModel.weeklyByTestPoint;
    dashboardRows = dashboardWeeklyModel.tableRows;
    dashboardPage = 1;
    renderDashboard();
  } catch (error) {
    if (requestToken !== dashboardRequestToken) return;
    console.error("Dashboard data load failed:", error);
    dashboardRows = [];
    filteredDashboardRows = [];
    dashboardWeeklySummaries = [];
    dashboardDailySummaries = [];
    dashboardLocationSummaries = [];
    dashboardWeeklyByTestPoint = new Map();
    dashboardWeeklyModel = null;
    setDashboardError(error?.message || "Please try again.");
    applyDashboardSortAndPagination();
    renderDashboardCharts();
  }
}

function renderDashboard() {
  if (window.Chart) Chart.defaults.font.family = "Poppins, sans-serif";
  renderDashboardMetrics();
  renderWeeklySummaryWidget();
  applyDashboardSortAndPagination();
  renderDashboardCharts();
  if (window.dashboardController?.renderer) {
    window.dashboardController.renderer.render();
    window.dashboardController.refreshVisualisation?.();
  }
}

function renderDashboardMetrics() {
  const overall = dashboardWeeklyModel?.overall || {
    counts: { total: 0, protected: 0, warning: 0, unprotected: 0, noData: 0 },
    decliningCount: 0,
    attentionCount: 0,
  };
  const counts = overall.counts;
  const metrics = [
    ["fa-bullseye", "blue", counts.total, "Total Points", "Selected reporting week", "total-points"],
    ["fa-shield-halved", "green", counts.protected, "Protected", "Latest weekly status", "protected"],
    ["fa-triangle-exclamation", "orange", counts.warning, "Warning", "Latest weekly status", "warning"],
    ["fa-shield-virus", "red", counts.unprotected, "Unprotected", "Latest weekly status", "unprotected"],
    ["fa-circle-question", "gray", counts.noData, "No Data", "No selected-week readings", "unknown"],
    ["fa-arrow-trend-down", "orange", overall.decliningCount, "Declining", "More positive this week", "average-reading"],
  ];
  const container = document.getElementById("dashboardMetrics");
  if (container) container.innerHTML = metrics.map(([iconName, colorClass, value, label, caption, metricId]) => `
    <div class="dashboard-metric-card" data-metric-id="${metricId}">
      <span class="metric-drag-handle" aria-hidden="true"><i class="fa-solid fa-grip-vertical"></i></span>
      <div class="stat-icon ${colorClass}"><i class="fa-solid ${iconName}" aria-hidden="true"></i></div>
      <div><h2>${Number(value || 0).toLocaleString("en-SG")}</h2><p>${escapeDashboardHtml(label)}</p><span>${escapeDashboardHtml(caption)}</span></div>
    </div>`).join("");

  const otherAttention = Math.max(0, overall.attentionCount - counts.warning - counts.unprotected);
  const attentionCard = document.querySelector(".dashboard-attention-card");
  const attentionCount = document.getElementById("heroAttentionCount");
  const warningCount = document.getElementById("heroWarningCount");
  const unprotectedCount = document.getElementById("heroUnprotectedCount");
  if (attentionCount) attentionCount.textContent = overall.attentionCount;
  if (warningCount) warningCount.textContent = `${counts.warning} Warning`;
  if (unprotectedCount) unprotectedCount.textContent = `${counts.unprotected} Unprotected${otherAttention ? ` · ${otherAttention} other` : ""}`;
  attentionCard?.setAttribute("aria-label", `${overall.attentionCount} Test Points require attention: ${counts.warning} Warning, ${counts.unprotected} Unprotected and ${otherAttention} other weekly concerns`);
}

function formatIsoDate(isoDate, options) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? String(isoDate || "") : date.toLocaleDateString("en-SG", { ...options, timeZone: "UTC" });
}

function formatWeekRange(weekStart) {
  if (!weekStart) return "No reporting week";
  const weekEnd = window.DashboardWeeklyModel.addIsoDays(weekStart, 6);
  const startMonth = formatIsoDate(weekStart, { month: "long" });
  const endMonth = formatIsoDate(weekEnd, { month: "long" });
  const startYear = formatIsoDate(weekStart, { year: "numeric" });
  const endYear = formatIsoDate(weekEnd, { year: "numeric" });
  const startDay = formatIsoDate(weekStart, { day: "numeric" });
  const endDay = formatIsoDate(weekEnd, { day: "numeric" });
  if (startMonth === endMonth && startYear === endYear) return `${startDay}–${endDay} ${endMonth} ${endYear}`;
  if (startYear === endYear) return `${startDay} ${startMonth}–${endDay} ${endMonth} ${endYear}`;
  return `${startDay} ${startMonth} ${startYear}–${endDay} ${endMonth} ${endYear}`;
}

function renderWeeklySummaryWidget() {
  const model = dashboardWeeklyModel;
  if (!model) return;
  const period = document.getElementById("dashboardWeeklyPeriod");
  const comparison = document.getElementById("dashboardWeeklyComparison");
  if (period) period.textContent = formatWeekRange(dashboardSelectedWeek);
  if (comparison) comparison.textContent = `Compared with ${formatWeekRange(dashboardComparisonWeek)}`;

  const attentionLocations = dashboardLocationSummaries.filter((location) => location.condition !== "Protected").slice(0, 3);
  const locationContainer = document.getElementById("dashboardAttentionLocations");
  if (locationContainer) locationContainer.innerHTML = attentionLocations.length
    ? attentionLocations.map((location) => `
      <article class="dashboard-weekly-item">
        <div><strong>${escapeDashboardHtml(location.siteName)}</strong><span>${escapeDashboardHtml(location.conditionReason)}</span></div>
        <span class="dashboard-condition-badge condition-${escapeDashboardHtml(location.condition.toLowerCase().replaceAll(" ", "-"))}">${escapeDashboardHtml(location.condition)}</span>
      </article>`).join("")
    : '<p class="widget-inline-empty">No Location requires weekly attention.</p>';

  const priorityPoints = model.priorityPoints.slice(0, 5);
  const pointContainer = document.getElementById("dashboardPriorityPoints");
  if (pointContainer) pointContainer.innerHTML = priorityPoints.length
    ? priorityPoints.map((summary) => {
      const pointId = summary.testPointId || summary.testPoint?.testPointName || "Test Point";
      const status = window.WeeklyLocationAggregator.statusForSummary(summary);
      const reason = window.WeeklyLocationAggregator.primaryAttentionReason(summary);
      return `<button class="dashboard-weekly-item dashboard-weekly-point" type="button" data-nav="${escapeDashboardHtml(buildDashboardDetailUrl(summary.testPointUuid))}" aria-label="View details for ${escapeDashboardHtml(pointId)}">
        <div><strong>${escapeDashboardHtml(pointId)}</strong><span>${escapeDashboardHtml(reason)}</span></div>
        ${statusBadge(status)}
      </button>`;
    }).join("")
    : '<p class="widget-inline-empty">No priority Test Points for this week.</p>';

  const fullSummary = document.getElementById("dashboardWeeklySummaryLink");
  if (fullSummary) fullSummary.dataset.nav = `weekly.php?week=${encodeURIComponent(dashboardSelectedWeek)}`;
}

function buildDashboardDetailUrl(testPointUuid) {
  const fallback = `testpoint-view.php?id=${encodeURIComponent(testPointUuid)}&returnTo=dashboard.php`;
  const target = window.AppNavigation?.buildTestPointDetailUrl?.(testPointUuid, {
    returnTo: "dashboard.php",
    returnSearch: location.search,
  }) || fallback;
  const url = new URL(target, location.href);
  if (dashboardSelectedWeek) url.searchParams.set("week", dashboardSelectedWeek);
  return `${url.pathname.split("/").pop()}${url.search}${url.hash}`;
}

function applyDashboardSortAndPagination() {
  filteredDashboardRows = window.DashboardWeeklyModel
    ? window.DashboardWeeklyModel.sortRows(dashboardRows, dashboardTableSort.key, dashboardTableSort.direction)
    : [];
  const totalPages = Math.max(1, Math.ceil(filteredDashboardRows.length / DASHBOARD_ROWS_PER_PAGE));
  dashboardPage = Math.min(Math.max(1, dashboardPage), totalPages);
  renderDashboardTable();
}

function renderDashboardTrend(row) {
  if (row.changeFromStart === null) return '<span class="dashboard-table-missing" aria-label="No weekly change available">—</span>';
  return window.AppTrendPresentation?.renderTrendValue?.({
    deltaMv: row.changeFromStart,
    semanticStatus: row.statusChange,
    context: "week",
  }) || escapeDashboardHtml(`${Math.round(row.changeFromStart)} mV`);
}

function renderDashboardTable() {
  const start = (dashboardPage - 1) * DASHBOARD_ROWS_PER_PAGE;
  const rows = filteredDashboardRows.slice(start, start + DASHBOARD_ROWS_PER_PAGE);
  const body = document.getElementById("dashboardTableBody");
  if (!body) return;
  body.innerHTML = rows.length ? rows.map((row) => `
    <tr>
      <td><strong>${escapeDashboardHtml(row.id)}</strong></td>
      <td>${escapeDashboardHtml(row.location)}</td>
      <td class="app-table-numeric">${formatDashboardMv(row.latestReading)}</td>
      <td class="app-table-numeric">${formatDashboardMv(row.weeklyAverage)}</td>
      <td>${renderDashboardTrend(row)}</td>
      <td>${statusBadge(row.status)}</td>
      <td>${row.lastUpdated ? `<i class="fa-regular fa-clock" aria-hidden="true"></i> ${escapeDashboardHtml(formatDashboardDate(row.lastUpdated))}` : "—"}</td>
      <td><button class="btn btn-light compact" type="button" data-nav="${escapeDashboardHtml(buildDashboardDetailUrl(row.uuid))}" aria-label="View details for ${escapeDashboardHtml(row.id)}">View</button></td>
    </tr>`).join("") : '<tr><td colspan="8">No active Test Points are available for the selected reporting week.</td></tr>';
  renderDashboardPagination();
}

function renderDashboardPagination() {
  const totalPages = Math.max(1, Math.ceil(filteredDashboardRows.length / DASHBOARD_ROWS_PER_PAGE));
  const from = filteredDashboardRows.length ? (dashboardPage - 1) * DASHBOARD_ROWS_PER_PAGE + 1 : 0;
  const to = Math.min(dashboardPage * DASHBOARD_ROWS_PER_PAGE, filteredDashboardRows.length);
  const meta = document.getElementById("dashboardTableMeta");
  const showing = document.getElementById("dashboardShowingText");
  const pagination = document.getElementById("dashboardPagination");
  if (meta) meta.textContent = `${filteredDashboardRows.length} results · Page ${dashboardPage} of ${totalPages}`;
  if (showing) showing.textContent = `Showing ${from}–${to} of ${filteredDashboardRows.length}`;
  if (!pagination) return;
  pagination.innerHTML = `
    <button class="page-btn" type="button" ${dashboardPage === 1 ? "disabled" : ""} data-dashboard-page="${dashboardPage - 1}" aria-label="Previous Test Point page"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
    ${Array.from({ length: totalPages }, (_, index) => `<button class="page-btn ${dashboardPage === index + 1 ? "active" : ""}" type="button" data-dashboard-page="${index + 1}" aria-label="Test Point page ${index + 1}" ${dashboardPage === index + 1 ? 'aria-current="page"' : ""}>${index + 1}</button>`).join("")}
    <button class="page-btn" type="button" ${dashboardPage === totalPages ? "disabled" : ""} data-dashboard-page="${dashboardPage + 1}" aria-label="Next Test Point page"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>`;
}

function renderDashboardCharts() {
  Object.values(dashboardCharts).forEach((chart) => chart?.destroy?.());
  dashboardCharts = {};
  if (!window.Chart) return;
  if (!dashboardWeeklyModel) return;
  const protectionPresentation = window.AppChartProtectionPresentation;
  const thresholdReference = protectionPresentation?.resolveThresholdReference?.(
    dashboardWeeklySummaries.map((summary) => summary.thresholdMv),
    DASHBOARD_THRESHOLD_MV,
  ) || {
    thresholdMv: DASHBOARD_THRESHOLD_MV,
    definitive: false,
    source: "baseline",
  };
  protectionPresentation?.renderLegend?.(
    document.getElementById("dashboardTrendZoneLegend"),
    thresholdReference,
  );
  const trend = window.DashboardWeeklyModel.buildLocationDailyTrend(
    dashboardDailySummaries,
    dashboardLocationSummaries,
    dashboardSelectedWeek,
  );
  const trendDatasets = trend.datasets.map((dataset, index) => ({
    ...dataset,
    borderColor: dashboardLocationColor(index),
    backgroundColor: dashboardLocationColor(index),
    pointStyle: "circle",
    pointRadius: 3,
    pointHoverRadius: 5,
    borderWidth: 2,
    tension: 0.28,
    spanGaps: false,
  }));
  const bounds = window.DashboardWeeklyModel.dynamicMvBounds(trendDatasets, thresholdReference.thresholdMv);
  const trendCanvas = document.getElementById("dashboardTrendChart");
  if (trendCanvas) {
    const trendConfig = {
      type: "line",
      data: {
        labels: trend.dates.map((date) => formatIsoDate(date, { weekday: "short", day: "numeric", month: "short" })),
        datasets: trendDatasets,
      },
      options: dashboardTrendOptions(bounds),
    };
    protectionPresentation?.applyToChartConfig?.(trendConfig, thresholdReference);
    dashboardCharts.trend = new Chart(trendCanvas, trendConfig);
  }
  const locationCanvas = document.getElementById("dashboardLocationChart");
  if (locationCanvas) dashboardCharts.location = new Chart(locationCanvas, {
    type: "bar",
    data: {
      labels: dashboardLocationSummaries.map((location) => location.siteName),
      datasets: [
        { label: "Protected", data: dashboardLocationSummaries.map((location) => location.counts.protected), backgroundColor: "#00857e", borderRadius: 4 },
        { label: "Warning", data: dashboardLocationSummaries.map((location) => location.counts.warning), backgroundColor: "#fdc82f", borderRadius: 4 },
        { label: "Unprotected", data: dashboardLocationSummaries.map((location) => location.counts.unprotected), backgroundColor: "#da1a35", borderRadius: 4 },
        { label: "No Data", data: dashboardLocationSummaries.map((location) => location.counts.noData), backgroundColor: "#8b95a5", borderRadius: 4 },
      ],
    },
    options: dashboardLocationOptions(),
  });
}

function dashboardTrendOptions(bounds) {
  const mobile = window.innerWidth < 768;
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: window.AppChartAnimation?.getEntranceAnimation?.() ?? false,
    interaction: { mode: "nearest", intersect: false },
    plugins: {
      legend: {
        display: true,
        position: "bottom",
        align: "center",
        labels: { usePointStyle: false, useBorderRadius: true, borderRadius: 4, boxWidth: 8, boxHeight: 8, padding: 16, font: { size: mobile ? 9 : 11 } },
      },
      tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${Math.round(context.parsed.y)} mV` } },
    },
    scales: {
      y: { min: bounds.min, max: bounds.max, grid: { color: "#eef2f7" }, title: { display: true, text: "mV" }, ticks: { color: "#718095", font: { size: mobile ? 9 : 11 } } },
      x: { grid: { color: "#f1f5f9" }, ticks: { color: "#718095", font: { size: mobile ? 8 : 10 }, maxTicksLimit: mobile ? 4 : 7 } },
    },
  };
}

function dashboardLocationOptions() {
  const mobile = window.innerWidth < 768;
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: window.AppChartAnimation?.getEntranceAnimation?.() ?? false,
    indexAxis: "y",
    plugins: {
      legend: {
        display: true,
        position: "bottom",
        align: "center",
        labels: { usePointStyle: false, useBorderRadius: true, borderRadius: 4, boxWidth: 8, boxHeight: 8, padding: 16, font: { size: mobile ? 9 : 11 } },
      },
      tooltip: {
        callbacks: {
          afterBody(items) {
            const location = dashboardLocationSummaries[items[0]?.dataIndex];
            if (!location) return [];
            return [
              `Condition: ${location.condition}`,
              `Reason: ${location.conditionReason}`,
              `Supporting weighted average: ${formatDashboardMv(location.weightedWeeklyAverage)}`,
            ];
          },
        },
      },
    },
    scales: {
      x: { stacked: true, beginAtZero: true, grid: { color: "#eef2f7" }, ticks: { precision: 0, color: "#718095", font: { size: mobile ? 9 : 11 } } },
      y: { stacked: true, grid: { display: false }, ticks: { color: "#203e54", font: { size: mobile ? 9 : 11 } } },
    },
  };
}

function statusBadge(status) {
  const className = status === "Protected" ? "green-bg" : status === "Warning" ? "orange-bg" : status === "Unprotected" ? "red-bg" : "gray-bg";
  return `<span class="badge ${className}">${escapeDashboardHtml(status || "No Data")}</span>`;
}

function formatDashboardMv(value) {
  return Number.isFinite(Number(value)) && value !== null && value !== "" ? `${Math.round(Number(value))} mV` : "—";
}

function formatDashboardDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-SG", {
    day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(date);
}

function dashboardLocationColor(index) {
  return ["#0073bc", "#29b7ea", "#00857e", "#d78b20", "#003a65", "#da1a35", "#7c3aed", "#64748b"][index % 8];
}

window.resizeDashboardCharts = function resizeDashboardCharts() {
  Object.values(dashboardCharts).forEach((chart) => chart?.resize?.());
};

function initDashboardPage() {
  dashboardAbortController?.abort();
  dashboardSortController?.destroy();
  dashboardAbortController = new AbortController();
  dashboardTableSort.key = "id";
  dashboardTableSort.direction = "asc";
  dashboardPage = 1;
  const signal = dashboardAbortController.signal;
  const welcome = document.getElementById("dashboardHeroWelcome");
  const fullName = String(localStorage.getItem("userFullName") || "").trim();
  if (welcome) welcome.textContent = fullName ? `Welcome back, ${fullName}` : "Welcome back";

  dashboardSortController = new window.TableSortController({
    root: document.getElementById("dashboardTestPointsTable"),
    initialKey: dashboardTableSort.key,
    initialDirection: dashboardTableSort.direction,
    onSortChanged: ({ key, direction }) => {
      dashboardTableSort.key = key;
      dashboardTableSort.direction = direction;
      dashboardPage = 1;
      applyDashboardSortAndPagination();
    },
  });

  document.getElementById("dashboardPagination")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-dashboard-page]");
    if (!button || button.disabled) return;
    dashboardPage = Number(button.dataset.dashboardPage) || 1;
    renderDashboardTable();
  }, { signal });
  document.getElementById("refreshDashboardTableButton")?.addEventListener("click", loadDashboardData, { signal });
  window.addEventListener("resize", () => {
    clearTimeout(dashboardChartResizeTimer);
    dashboardChartResizeTimer = setTimeout(() => window.resizeDashboardCharts(), 120);
  }, { signal });
  loadDashboardData();
}

function destroyDashboardPage() {
  dashboardAbortController?.abort();
  dashboardAbortController = null;
  dashboardSortController?.destroy();
  dashboardSortController = null;
  dashboardRequestToken += 1;
  clearTimeout(dashboardChartResizeTimer);
  Object.values(dashboardCharts).forEach((chart) => chart?.destroy?.());
  dashboardCharts = {};
}

window.DashboardPage = { init: initDashboardPage, destroy: destroyDashboardPage };

document.addEventListener("DOMContentLoaded", () => {
  if ((window.getCurrentPageName?.() || location.pathname.split("/").pop()) === "dashboard.php") initDashboardPage();
});
