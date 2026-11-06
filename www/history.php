<?php require __DIR__ . '/php/session-guard.php'; require_login(); ?>
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Data History</title>
  <link rel="icon" type="image/png" href="<?php echo asset_v('img/application logo.png'); ?>">
  <link rel="stylesheet" href="<?php echo asset_v('css/style.css'); ?>">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>

<body>
  <aside class="sidebar"></aside>
  <main class="main">
    <header class="topbar"></header>
    <section class="content history-page">
      <div class="history-page-header">
        <div class="page-title">
          <h1>Data History</h1>
          <p>View and filter historical corrosion protection readings</p>
          <span class="history-last-updated" id="historyLastUpdated"></span>
        </div>
        <div class="history-header-actions">
          <button class="btn btn-light" type="button" id="historyRefresh"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i>Refresh</button>
        </div>
      </div>

      <section class="history-metrics" id="historyMetrics" aria-label="Data history metrics"></section>

      <section class="card history-chart-card history-trend-card" aria-label="Historical trend chart">
        <div class="history-card-header">
          <div>
            <h3>Historical Reading Trend</h3>
            <p id="historyTrendSubtitle">Compare corrosion-protection readings over a selected period</p>
          </div>
          <div class="history-chart-actions">
            <div class="history-segmented" role="group" aria-label="Trend view">
              <button class="active" type="button" data-trend-granularity="raw">Raw</button>
              <button type="button" data-trend-granularity="daily">Daily</button>
              <button type="button" data-trend-granularity="weekly">Weekly</button>
            </div>
            <div class="history-dropdown">
              <button class="history-dropdown-button" id="historySiteToggle" type="button" data-history-dropdown-toggle="historySiteMenu" aria-expanded="false" aria-controls="historySiteMenu">
                <i class="fa-solid fa-map-location-dot" aria-hidden="true"></i><span id="historySiteLabel">All sites</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
              </button>
              <div class="history-dropdown-menu history-filter-menu" id="historySiteMenu" hidden>
                <div class="history-dropdown-heading">
                  <span>Site</span>
                  <button type="button" id="historyClearSiteFilter">Clear</button>
                </div>
                <select class="visually-hidden" id="historySiteFilter" tabindex="-1" aria-hidden="true"></select>
                <div class="history-checkbox-list history-site-options" id="historySiteOptions"></div>
              </div>
            </div>
            <div class="history-dropdown">
              <button class="history-dropdown-button" id="historyTrendTestPointToggle" type="button" data-history-dropdown-toggle="historyTrendTestPointMenu" aria-expanded="false" aria-controls="historyTrendTestPointMenu">
                <i class="fa-solid fa-location-dot" aria-hidden="true"></i><span id="historyTrendTestPointLabel">All test points</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
              </button>
              <div class="history-dropdown-menu history-testpoint-menu" id="historyTrendTestPointMenu" hidden>
                <div class="history-dropdown-heading">
                  <span>Compare Test Points</span>
                  <button type="button" id="historyClearTrendTestPoints">Clear</button>
                </div>
                <div class="history-checkbox-list" id="historyTrendTestPointOptions"></div>
              </div>
            </div>
            <div class="history-dropdown">
              <button class="history-dropdown-button" id="historyDateRangeToggle" type="button" data-history-dropdown-toggle="historyDateRangeMenu" aria-expanded="false" aria-controls="historyDateRangeMenu">
                <i class="fa-regular fa-calendar" aria-hidden="true"></i><span id="historyDateRangeLabel">All dates</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
              </button>
              <div class="history-dropdown-menu history-date-menu" id="historyDateRangeMenu" hidden>
                <input id="historyDateRange" type="hidden" value="">
                <div class="history-date-presets">
                  <button type="button" data-history-date-preset="">All dates</button>
                  <button type="button" data-history-date-preset="today">Today</button>
                  <button type="button" data-history-date-preset="last_week">Last week</button>
                  <button type="button" data-history-date-preset="last_month">Last month</button>
                  <button type="button" data-history-date-preset="last_3_months">Last 3 months</button>
                  <button type="button" data-history-date-preset="last_6_months">Last 6 months</button>
                  <button type="button" data-history-date-preset="last_12_months">Last 12 months</button>
                  <button type="button" data-history-date-preset="custom">Custom</button>
                </div>
                <div class="history-custom-range" id="historyCustomDateFields" hidden>
                  <label>From <input id="historyFromDate" type="date"></label>
                  <label>To <input id="historyToDate" type="date"></label>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="history-trend-meta" id="historyTrendMeta"></div>
        <div class="chart-zone-legend" id="historyProtectionZoneLegend" aria-label="Supporting protection-potential reference zones"></div>
        <div class="history-chart-frame"><canvas id="historyTrendChart" aria-label="Protection-potential history trend" aria-describedby="historyTrendMeta historyProtectionZoneLegend"></canvas></div>
      </section>

      <section class="card history-chart-card history-environment-card" aria-label="Environmental trend charts">
        <div class="history-card-header">
          <div>
            <h3>Environmental Trends</h3>
            <p>Track conductivity and pH changes over the selected period</p>
          </div>
        </div>
        <div class="history-trend-meta" id="historyEnvironmentalMeta"></div>
        <div class="history-environment-grid">
          <section class="history-environment-panel" aria-label="Conductivity trend">
            <div class="history-environment-heading">
              <h4>Electric Conductivity</h4>
              <span>µS/cm</span>
            </div>
            <div class="history-environment-frame"><canvas id="historyConductivityChart"></canvas></div>
          </section>
          <section class="history-environment-panel" aria-label="pH trend">
            <div class="history-environment-heading">
              <h4>pH</h4>
              <span>0-14 scale</span>
            </div>
            <div class="history-environment-frame"><canvas id="historyPhChart"></canvas></div>
          </section>
        </div>
      </section>

      <section class="card history-filter-card">
        <div class="history-filter-toolbar">
          <div class="search-wrap history-search-wrap">
            <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            <label class="visually-hidden" for="historySearch">Search records</label>
            <input id="historySearch" type="search" autocomplete="off" placeholder="Search test point ID, name, location, or engineer...">
            <button class="search-clear-button" id="historySearchClear" type="button" aria-label="Clear search" hidden><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
          </div>
          <button class="btn btn-light" type="button" id="historyFiltersButton" aria-expanded="false">
            <i class="fa-solid fa-sliders" aria-hidden="true"></i>Filters <span class="filter-count" id="historyFilterCount" hidden>0</span>
            <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
          </button>
          <button class="btn btn-light history-reset" type="button" id="historyReset"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i>Reset</button>
        </div>
        <div class="history-filter-summary">
          <p id="historyResultCount"></p>
          <div class="dashboard-filter-chips" id="historyFilterChips" aria-label="Active history filters"></div>
        </div>
        <div class="history-advanced-filters" id="historyAdvancedFilters" hidden>
          <label>Asset / Pipeline <select id="historyAssetFilter"></select></label>
          <label>Zone <select id="historyZoneFilter"></select></label>
          <label>Test Point <select id="historyTestPointFilter"></select></label>
          <label>Status <select id="historyStatusFilter"></select></label>
          <label>Coord Type <select id="historyCoordFilter"></select></label>
          <label>Data Source <select id="historySourceFilter"></select></label>
          <label>Engineer <select id="historyEngineerFilter"></select></label>
          <label>Min Reading (mV)<input id="historyMinReading" type="number" placeholder="e.g. -950"></label>
          <label>Max Reading (mV)<input id="historyMaxReading" type="number" placeholder="e.g. -750"></label>
          <label>High Conductivity (µS/cm) <input id="historyMinConductivity" type="number" min="0" placeholder="e.g. 350"></label>
          <label>pH Condition
            <select id="historyPhFilter">
              <option value="">All pH</option>
              <option value="outside-neutral">Outside 6.5-8.5</option>
              <option value="acidic">Acidic (&lt; 6.5)</option>
              <option value="alkaline">Alkaline (&gt; 8.5)</option>
            </select>
          </label>
        </div>
      </section>

      <section class="card history-table-card app-table-card">
        <div class="history-table-header app-table-toolbar">
          <div>
            <h3>Historical Records</h3>
            <p id="historyTableMeta"></p>
          </div>
          <div class="history-table-actions">
            <label class="history-rows-label">Rows:
              <select id="historyRowsPerPage">
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
            </label>
          </div>
        </div>
        <div class="table-scroll app-table-scroll history-table-scroll">
          <table class="history-table app-table">
            <thead class="app-table-header">
              <tr>
                <th scope="col" data-history-sort="timestamp">Timestamp</th>
                <th scope="col" data-history-sort="testPointId">TP ID</th>
                <th scope="col" data-history-sort="name">Name</th>
                <th scope="col" data-history-sort="assetPath">Location</th>
                <th scope="col" data-history-sort="reading">Reading</th>
                <th scope="col" data-history-sort="status">Status</th>
                <th scope="col" data-history-sort="temperature">Temp</th>
                <th scope="col" data-history-sort="conductivity">Conductivity</th>
                <th scope="col" data-history-sort="ph">pH</th>
                <th scope="col" data-history-sort="coordType">Coord Type</th>
                <th scope="col" data-history-sort="source">Source</th>
                <th scope="col" data-history-sort="engineer">Recorded By</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody id="historyTableBody"></tbody>
          </table>
          <div class="dashboard-table-empty app-table-empty" id="historyEmptyState" hidden>
            <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            <p>No historical records match the current search and filters.</p>
            <button class="btn btn-light" id="historyClearEmpty" type="button">Clear Filters</button>
          </div>
        </div>
        <div class="table-footer app-table-footer">
          <span id="historyShowingText"></span>
          <div class="pagination" id="historyPagination"></div>
        </div>
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
  <script src="<?php echo asset_v('js/history.js'); ?>"></script>
</body>

</html>
