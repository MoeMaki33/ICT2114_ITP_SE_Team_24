<?php require __DIR__ . '/php/session-guard.php'; require_login(); ?>
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Weekly Summary</title>
  <link rel="icon" type="image/png" href="<?php echo asset_v('img/application logo.png'); ?>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="<?php echo asset_v('css/style.css'); ?>">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>

<body>
  <aside class="sidebar"></aside>
  <main class="main">
    <header class="topbar"></header>
    <section class="content weekly-page">
      <div class="weekly-heading">
        <div>
          <h1>Weekly Summary</h1>
          <p>Location-first monitoring for protection condition, emerging risks and Test Point drill-down.</p>
        </div>
        <div class="weekly-actions">
          <div class="weekly-week-picker">
            <div class="weekly-week-navigation" role="group" aria-label="Reporting week navigation">
              <button class="weekly-week-arrow" id="weeklyPreviousWeek" type="button" aria-label="Select previous available week" title="Previous week">
                <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
              </button>
              <label class="visually-hidden" for="weekSelector">Reporting week</label>
              <select id="weekSelector" aria-label="Select reporting week"></select>
              <button class="weekly-week-arrow" id="weeklyNextWeek" type="button" aria-label="Select next available week" title="Next week">
                <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
              </button>
            </div>
            <span class="weekly-comparison-label" id="weeklyComparisonLabel">Compared with the previous calendar week</span>
          </div>
        </div>
      </div>

      <div class="weekly-view-switch" role="group" aria-label="Weekly Summary view">
        <button type="button" class="weekly-view-button active" data-weekly-view="overview" aria-pressed="true">
          <i class="fa-solid fa-location-dot" aria-hidden="true"></i>Location Overview
        </button>
        <button type="button" class="weekly-view-button" data-weekly-view="testpoints" aria-pressed="false">
          <i class="fa-solid fa-list" aria-hidden="true"></i>Test Point View
        </button>
      </div>

      <section class="card weekly-filter-card dashboard-filter-card" aria-labelledby="weeklyFiltersTitle">
        <h2 class="visually-hidden" id="weeklyFiltersTitle">Weekly Summary filters</h2>
        <div class="weekly-filters">
          <div class="search-wrap">
            <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            <label class="visually-hidden" for="weeklySearch">Search Test Points</label>
            <input id="weeklySearch" type="search" autocomplete="off" placeholder="Search Test Point ID or name…">
            <button class="search-clear-button" id="weeklySearchClear" type="button" aria-label="Clear search" hidden><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
          </div>
          <label class="visually-hidden" for="weeklyLocationFilter">Location</label>
          <select id="weeklyLocationFilter" aria-label="Filter by location"><option value="">All locations</option></select>
          <label class="visually-hidden" for="statusFilter">Protection status</label>
          <select id="statusFilter" aria-label="Filter by protection status">
            <option value="">All statuses</option>
            <option value="Protected">Protected</option>
            <option value="Warning">Warning</option>
            <option value="Unprotected">Unprotected</option>
            <option value="No Data">No Data</option>
          </select>
          <label class="toggle-label"><input type="checkbox" id="attentionOnly"><span></span>Needs attention</label>
          <label class="toggle-label"><input type="checkbox" id="decliningOnly"><span></span>Declining only</label>
          <button class="btn btn-light" id="resetWeekly" type="button"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i>Reset</button>
        </div>
        <div class="dashboard-filter-summary weekly-filter-summary">
          <p id="weeklyFilterResultCount" aria-live="polite">Loading Test Points…</p>
          <div class="dashboard-filter-chips" id="weeklyFilterChips" aria-label="Active Weekly Summary filters"></div>
        </div>
      </section>

      <div class="weekly-metrics" id="weeklyMetrics" aria-live="polite"></div>

      <section id="weeklyLocationOverview" data-weekly-view-panel="overview">
        <div class="weekly-chart-grid weekly-overview-chart-grid">
          <section class="card weekly-card">
            <h3>Overall Daily Trend</h3>
            <p class="muted">Reading-count weighted daily average across the visible Test Points.</p>
            <div class="chart-zone-legend" id="weeklyTrendZoneLegend" aria-label="Supporting protection-potential reference zones"></div>
            <div class="chart-frame" id="weeklyTrendChartFrame"><canvas id="weeklyTrendChart" aria-label="Overall daily protection-potential trend"></canvas></div>
            <div class="weekly-chart-state" id="weeklyTrendChartState" role="status" hidden></div>
          </section>
          <section class="card weekly-card">
            <h3>Location Condition Comparison</h3>
            <p class="muted">Full Location status counts are used so filtered averages cannot hide an affected Test Point.</p>
            <div class="chart-frame"><canvas id="assetStatusChart" aria-label="Protection status counts by location" aria-describedby="assetStatusChartSummary"></canvas></div>
            <div class="visually-hidden" id="assetStatusChartSummary"></div>
          </section>
        </div>

        <section class="weekly-location-section" aria-labelledby="weeklyLocationsTitle">
          <div class="weekly-section-heading">
            <div>
              <h2 id="weeklyLocationsTitle">Locations</h2>
              <p class="muted">Identify the Location containing Test Points that require attention, then drill down to the affected point.</p>
            </div>
            <span class="weekly-result-badge" id="weeklyLocationCount">0 locations</span>
          </div>
          <div class="weekly-location-grid" id="weeklyLocationCards"></div>
        </section>

        <section class="card standard-table-card app-table-card weekly-attention-card" aria-labelledby="weeklyAttentionTitle">
          <div class="card-header app-table-toolbar">
            <div>
              <h3 id="weeklyAttentionTitle">Recommended Attention</h3>
              <p class="muted" id="weeklyAttentionMeta">Highest-risk Test Points across visible locations.</p>
            </div>
            <button type="button" class="btn btn-light" id="viewAllAttention">View all attention points</button>
          </div>
          <div class="table-scroll app-table-scroll">
            <table class="weekly-attention-table app-table">
              <thead class="app-table-header"><tr>
                <th scope="col">Priority</th><th scope="col">Test Point</th><th scope="col">Location</th>
                <th scope="col">Reason</th><th scope="col">Protection Status</th><th scope="col" class="app-table-numeric">Latest</th>
                <th scope="col" class="app-table-numeric" title="Latest reading minus the first reading recorded during the selected week.">Change This Week</th>
                <th scope="col" class="app-table-numeric">Crossings</th><th scope="col">Action</th>
              </tr></thead>
              <tbody id="weeklyAttentionBody"></tbody>
            </table>
          </div>
          <div class="empty-state app-table-empty" id="weeklyAttentionEmpty" hidden>No visible Test Points currently require attention.</div>
        </section>
      </section>

      <section id="weeklyTestPointView" data-weekly-view-panel="testpoints" hidden>
        <div class="weekly-drilldown-heading">
          <div>
            <button type="button" class="weekly-back-overview" id="weeklyBackToOverview"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i>Location Overview</button>
            <h2 id="weeklyTestPointViewTitle">All Test Points</h2>
            <p class="muted" id="weeklyTestPointContext">Full filtered dataset for the selected week.</p>
          </div>
          <div>
            <div class="weekly-drilldown-mode" role="group" aria-label="Test Point drill-down mode">
              <button type="button" class="weekly-mode-button" data-weekly-drilldown-mode="attention" aria-pressed="false">Needs Attention</button>
              <button type="button" class="weekly-mode-button active" data-weekly-drilldown-mode="all" aria-pressed="true">All Test Points</button>
            </div>
            <div class="weekly-drilldown-metrics" id="weeklyDrilldownMetrics"></div>
          </div>
        </div>

        <section class="card standard-table-card app-table-card weekly-table-card">
          <div class="card-header app-table-toolbar">
            <div><h3>Test Point Weekly Summary</h3><p class="muted" id="weeklyTableMeta">Loading…</p></div>
            <label class="rows-select">Rows per page:
              <select id="rowsPerPage">
                <option value="10">10</option><option value="25" selected>25</option>
                <option value="50">50</option><option value="100">100</option>
              </select>
            </label>
          </div>
          <div class="table-scroll app-table-scroll">
            <table class="weekly-table app-table">
              <thead class="app-table-header"><tr>
                <th scope="col" data-table-sort-key="testPointId" data-table-sort-label="Test Point">Test Point</th>
                <th scope="col" data-weekly-location-column data-table-sort-key="location" data-table-sort-label="Location">Location</th>
                <th scope="col" class="app-table-numeric" data-table-sort-key="latestReading" data-table-sort-label="Latest">Latest</th>
                <th scope="col" class="app-table-numeric" data-table-sort-key="weeklyAverage" data-table-sort-label="Weekly Average">Weekly Average</th>
                <th scope="col" class="app-table-numeric" title="Latest reading minus the first reading recorded during the selected week." data-table-sort-key="changeFromStart" data-table-sort-label="Change This Week">Change This Week</th>
                <th scope="col" class="app-table-numeric" title="Selected-week average minus the immediately preceding week's average." data-table-sort-key="comparison" data-table-sort-label="vs Previous Week">vs Previous Week</th>
                <th scope="col" data-table-sort-key="status" data-table-sort-label="Protection Status">Protection Status</th>
                <th scope="col" class="app-table-numeric" data-table-sort-key="thresholdCrossings" data-table-sort-label="Threshold Crossings">Threshold Crossings</th>
                <th scope="col" data-table-sort-key="lastUpdated" data-table-sort-label="Last Updated">Last Updated</th>
                <th scope="col">Action</th>
              </tr></thead>
              <tbody id="weeklyTableBody"></tbody>
            </table>
            <div class="empty-state app-table-empty" id="weeklyEmptyState" hidden>No Test Points match the current filters.</div>
          </div>
          <div class="table-footer app-table-footer"><span id="weeklyShowingText">Showing 0-0 of 0</span><div class="pagination" id="weeklyPagination"></div></div>
        </section>
      </section>
    </section>
  </main>

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="<?php echo asset_v('js/auth-storage.js'); ?>"></script>
  <script src="<?php echo asset_v('js/config/supabase-config.js'); ?>"></script>
  <script src="<?php echo asset_v('js/config/app-settings.js'); ?>"></script>
  <script src="<?php echo asset_v('js/supabaseClient.js'); ?>"></script>
  <script src="<?php echo asset_v('js/services/status.js'); ?>"></script>
  <script src="<?php echo asset_v('js/repositories/supabase-repositories.js'); ?>"></script>
  <script src="<?php echo asset_v('js/app-preferences.js'); ?>"></script>
  <script src="<?php echo asset_v('js/common.js'); ?>"></script>
  <script src="<?php echo asset_v('js/toast.js'); ?>"></script>
  <script src="<?php echo asset_v('js/notifications.js'); ?>"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="<?php echo asset_v('js/navigation-controller.js'); ?>"></script>
  <script src="<?php echo asset_v('js/chart-animation.js'); ?>"></script>
  <script src="<?php echo asset_v('js/chart-protection-presentation.js'); ?>"></script>
  <script src="<?php echo asset_v('js/table-sort-controller.js'); ?>"></script>
  <script src="<?php echo asset_v('js/trend-presentation.js'); ?>"></script>
  <script src="<?php echo asset_v('js/weekly-location-aggregator.js'); ?>"></script>
  <script src="<?php echo asset_v('js/weekly-daily-trend.js'); ?>"></script>
  <script src="<?php echo asset_v('js/weekly.js'); ?>"></script>
</body>
</html>
