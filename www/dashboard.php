<?php require __DIR__ . '/php/session-guard.php'; require_login(); ?>
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard | Corrosion Protection</title>
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
    <section class="content dashboard-page">
      <section class="dashboard-hero">
        <div class="dashboard-hero-content">
          <div class="dashboard-hero-copy">
            <p class="dashboard-hero-welcome" id="dashboardHeroWelcome">Welcome back</p>
            <h1 class="dashboard-hero-title">Corrosion Protection Overview</h1>
            <p class="dashboard-hero-subtitle">Monitor and manage Test Points in real time.</p>
          </div>
          <div class="hero-actions dashboard-hero-actions">
            <button class="btn hero-btn" type="button" data-nav="testpoints.php"><i class="fa-solid fa-plus" aria-hidden="true"></i>Add Reading</button>
            <button class="btn hero-btn outline" type="button" data-nav="history.php"><i class="fa-solid fa-upload" aria-hidden="true"></i>Import CSV</button>
            <button class="btn hero-btn outline"><i class="fa-regular fa-file-lines" aria-hidden="true"></i>Export</button>
            <button class="btn hero-btn outline" id="customiseDashboardButton" type="button">
              <i class="fa-solid fa-pen" aria-hidden="true"></i>
              <span class="customise-label-full">Customise Dashboard</span>
              <span class="customise-label-short" aria-hidden="true">Customise</span>
            </button>
          </div>
        </div>
        <div class="hero-attention-summary dashboard-attention-card" aria-label="7 test points require attention: 5 warning and 2 unprotected">
          <span class="hero-attention-icon"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></span>
          <span class="hero-attention-copy">
            <strong id="heroAttentionCount">7</strong>
            <b>Require Attention</b>
            <small><span id="heroWarningCount">5 Warning</span><span id="heroUnprotectedCount">2 Unprotected</span></small>
          </span>
        </div>
      </section>

      <section class="dashboard-customise-bar" id="dashboardCustomiseBar" hidden>
        <div>
          <h2>Customising Dashboard</h2>
          <p>Drag metric cards and widget headers. Resize widgets from their bottom-right corner.</p>
        </div>
        <div class="dashboard-customise-actions">
          <button class="btn btn-light" id="resetDashboardLayoutButton" type="button">
            <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>Reset to Default
          </button>
          <button class="btn btn-light" id="cancelDashboardLayoutButton" type="button">Cancel</button>
          <button class="btn btn-green" id="saveDashboardLayoutButton" type="button">Save Layout</button>
        </div>
      </section>
      <div class="dashboard-layout-message" id="dashboardLayoutMessage" role="status" aria-live="polite"></div>

      <section class="dashboard-metrics" id="dashboardMetrics" aria-label="Dashboard metrics"></section>

      <section class="dashboard-widget-grid" id="dashboardWidgetGrid" aria-label="Dashboard widgets">
        <section class="dashboard-card dashboard-widget" data-widget-id="protection-reading-trends">
          <div class="card-header compact-header dashboard-widget-header">
            <div>
              <h3>Protection Reading Trends</h3>
              <p class="muted">7-day Location averages — mV over time</p>
            </div>
            <div class="chart-zone-legend compact" id="dashboardTrendZoneLegend" aria-label="Supporting protection-potential reference zones"></div>
          </div>
          <div class="dashboard-chart-frame large"><canvas id="dashboardTrendChart" aria-label="Seven-day Location protection-potential averages"></canvas></div>
        </section>

        <section class="dashboard-card dashboard-widget" data-widget-id="average-reading-by-pipeline">
          <div class="dashboard-widget-header">
            <h3>Location Protection Overview</h3>
            <p class="muted">Selected-week Test Point status counts by Location</p>
          </div>
          <div class="dashboard-chart-frame large"><canvas id="dashboardLocationChart" aria-label="Stacked protection-status counts for each Location"></canvas></div>
        </section>

        <section class="dashboard-card dashboard-widget weekly-dashboard-card" data-widget-id="weekly-protection-summary">
          <div class="weekly-dashboard-header dashboard-widget-header">
            <div>
              <h3>Weekly Protection Summary</h3>
              <p class="muted">Monday-to-Sunday protection performance from the shared weekly-summary pipeline</p>
              <p class="weekly-dashboard-period" id="dashboardWeeklyPeriod">Loading reporting week…</p>
              <p class="weekly-dashboard-comparison" id="dashboardWeeklyComparison"></p>
            </div>
          </div>
          <div class="dashboard-weekly-lists">
            <section class="dashboard-weekly-group dashboard-weekly-group--locations" aria-labelledby="dashboardAttentionLocationsTitle">
              <header class="dashboard-weekly-group-header">
                <span class="dashboard-weekly-group-icon" aria-hidden="true"><i class="fa-solid fa-location-dot"></i></span>
                <div class="dashboard-weekly-group-copy">
                  <h4 class="dashboard-section-label" id="dashboardAttentionLocationsTitle">Locations Requiring Attention</h4>
                  <p>Location-level operational condition</p>
                </div>
              </header>
              <div class="dashboard-weekly-list" id="dashboardAttentionLocations"></div>
            </section>
            <section class="dashboard-weekly-group dashboard-weekly-group--points" aria-labelledby="dashboardPriorityPointsTitle">
              <header class="dashboard-weekly-group-header">
                <span class="dashboard-weekly-group-icon" aria-hidden="true"><i class="fa-solid fa-bullseye"></i></span>
                <div class="dashboard-weekly-group-copy">
                  <h4 class="dashboard-section-label" id="dashboardPriorityPointsTitle">Priority Test Points</h4>
                  <p>Individual monitoring points</p>
                </div>
              </header>
              <div class="dashboard-weekly-list" id="dashboardPriorityPoints"></div>
            </section>
          </div>
          <div class="weekly-dashboard-footer">
            <button class="btn btn-green" id="dashboardWeeklySummaryLink" type="button" data-nav="weekly.php">View Full Weekly Summary <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
          </div>
        </section>

        <section class="dashboard-card dashboard-widget dashboard-table-widget" data-widget-id="test-points-table">
          <div class="card-header compact-header dashboard-widget-header">
            <div>
              <h3>Test Points</h3>
              <p class="muted" id="dashboardTableMeta">20 results · Page 1 of 2</p>
            </div>
            <button class="btn btn-light" id="refreshDashboardTableButton" type="button"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i>Refresh</button>
          </div>
          <div class="table-scroll app-table-scroll dashboard-table-scroll">
            <table class="dashboard-table app-table" id="dashboardTestPointsTable">
              <thead>
                <tr>
                  <th scope="col" data-table-sort-key="id" data-table-sort-label="ID">ID</th>
                  <th scope="col" data-table-sort-key="location" data-table-sort-label="Location">Location</th>
                  <th scope="col" class="app-table-numeric" data-table-sort-key="latestReading" data-table-sort-label="Latest Reading">Latest Reading</th>
                  <th scope="col" class="app-table-numeric" data-table-sort-key="weeklyAverage" data-table-sort-label="Weekly Average">Weekly Average</th>
                  <th scope="col" data-table-sort-key="changeFromStart" data-table-sort-label="Change This Week">Change This Week</th>
                  <th scope="col" data-table-sort-key="status" data-table-sort-label="Protection Status">Protection Status</th>
                  <th scope="col" data-table-sort-key="lastUpdatedSort" data-table-sort-label="Last Updated">Last Updated</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody id="dashboardTableBody"></tbody>
            </table>
          </div>
          <div class="table-footer">
            <span id="dashboardShowingText">Showing 1–10 of 20</span>
            <div class="pagination" id="dashboardPagination"></div>
          </div>
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
  <script src="<?php echo asset_v('js/dashboard-weekly-model.js'); ?>"></script>
  <script src="<?php echo asset_v('js/dashboard-layout.js'); ?>"></script>
  <script src="<?php echo asset_v('js/dashboard-repository.js'); ?>"></script>
  <script src="<?php echo asset_v('js/dashboard.js'); ?>"></script>
  <script src="<?php echo asset_v('js/dashboard-customisation.js'); ?>"></script>
</body>

</html>
