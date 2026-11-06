<?php require __DIR__ . '/php/session-guard.php'; require_login(); ?>
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Points</title>
  <link rel="icon" type="image/png" href="<?php echo asset_v('img/application logo.png'); ?>">
  <link rel="stylesheet" href="<?php echo asset_v('css/style.css'); ?>">
</head>

<body>
  <aside class="sidebar"></aside>
  <main class="main">
    <header class="topbar"></header>
    <section class="content testpoints-page">
      <div class="testpoints-header-row">
        <div class="page-title testpoints-title-block">
          <h1>Test Point Management</h1>
          <p>Create, manage and organise corrosion monitoring Test Points across Locations.</p>
          <span class="testpoints-last-sync" id="testPointsLastSync">Last updated just now</span>
        </div>
        <div class="testpoints-header-actions">
          <button class="btn btn-light" type="button" id="exportTestPointsButton" data-admin-only>Export List</button>
          <button class="btn btn-light" type="button" id="openImportTestPointsModalButton" data-admin-only>
            <i class="fa-solid fa-file-import" aria-hidden="true"></i>Import Excel
          </button>
          <button class="btn btn-green" type="button" id="openAddTestPointModalButton" data-admin-only>
            <i class="fa-solid fa-plus" aria-hidden="true"></i>Add Test Point
          </button>
        </div>
      </div>

      <!-- Protection logic reference for developers:
           Values closer to 0 are unprotected, while more negative values are protected.
           Threshold example: -850 mV is the cutoff, -851 mV is protected, and -849 mV is unprotected. -->

      <section class="testpoints-stats-grid" id="testPointStatsGrid"></section>

      <section class="card standard-table-card app-table-card testpoints-table-card">
        <div class="testpoints-table-toolbar app-table-toolbar">
          <div class="testpoints-table-toolbar-left">
            <div class="testpoints-table-heading">
              <h3>Test Points</h3>
              <span class="testpoints-week-context" id="testPointsWeeklyContext">Weekly values: Loading reporting week…</span>
            </div>
            <div class="testpoints-search-wrap">
              <input id="searchInput" type="search" placeholder="Search by Test Point or Location…">
            </div>
            <button class="btn btn-light testpoints-filter-button" type="button" id="testPointsFiltersButton" aria-expanded="false">
              <i class="fa-solid fa-sliders" aria-hidden="true"></i>Filters <span class="filter-count" id="testPointsFilterCount" hidden>0</span>
            </button>
            <button class="btn btn-light" type="button" id="testPointsReset"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i>Reset</button>
          </div>
          <div class="testpoints-table-toolbar-right">
            <span id="testPointsCountLabel">0 results</span>
            <label class="history-rows-label">Rows:
              <select id="testPointsRowsPerPage">
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
            </label>
          </div>
        </div>
        <div class="history-filter-summary testpoints-filter-summary">
          <p id="testPointsResultMeta"></p>
          <div class="dashboard-filter-chips" id="testPointsFilterChips" aria-label="Active test point filters"></div>
        </div>
        <div class="history-advanced-filters testpoints-advanced-filters" id="testPointsAdvancedFilters" hidden>
          <label>Location <select id="testPointsLocationFilter"></select></label>
          <label>Protection Status <select id="testPointsStatusFilter"></select></label>
          <label>Coordinate Type <select id="testPointsCoordFilter"></select></label>
          <label>Assigned Engineer <select id="testPointsEngineerFilter"></select></label>
          <label>Active State <select id="testPointsActiveFilter"></select></label>
          <div class="testpoints-columns-panel">
            <div class="testpoints-columns-header">
              <strong>Visible Columns</strong>
              <span>Choose which table columns to show.</span>
            </div>
            <div class="testpoints-columns-grid" id="testPointsColumnVisibilityOptions" aria-label="Visible table columns"></div>
          </div>
        </div>

        <div class="table-scroll app-table-scroll">
          <table class="testpoint-management-table app-table">
            <thead class="app-table-header">
              <tr>
                <th data-testpoints-column="label" data-table-sort-key="label" data-table-sort-label="Test Point">Test Point</th>
                <th data-testpoints-column="locationName" data-table-sort-key="locationName" data-table-sort-label="Location">Location</th>
                <th data-testpoints-column="latestReadingValue" data-table-sort-key="latestReadingValue" data-table-sort-label="Latest Reading">Latest Reading</th>
                <th data-testpoints-column="weeklyAverage" data-table-sort-key="weeklyAverage" data-table-sort-label="Weekly Average">Weekly Average</th>
                <th data-testpoints-column="changeFromStart" data-table-sort-key="changeFromStart" data-table-sort-label="Change This Week">Change This Week</th>
                <th data-testpoints-column="status" data-table-sort-key="status" data-table-sort-label="Protection Status">Protection Status</th>
                <th data-testpoints-column="lastUpdated" data-table-sort-key="lastUpdated" data-table-sort-label="Last Updated">Last Updated</th>
                <th data-testpoints-column="type" data-table-sort-key="type" data-table-sort-label="Type">Type</th>
                <th data-testpoints-column="thresholdMv" data-table-sort-key="thresholdMv" data-table-sort-label="Threshold">Threshold</th>
                <th data-testpoints-column="pointNote" data-table-sort-key="pointNote" data-table-sort-label="Test Point Note">Test Point Note</th>
                <th data-testpoints-column="coordType" data-table-sort-key="coordType" data-table-sort-label="Coordinates">Coordinates</th>
                <th data-testpoints-column="assignedEngineer" data-table-sort-key="assignedEngineer" data-table-sort-label="Assigned Engineer">Assigned Engineer</th>
                <th data-testpoints-column="active" data-table-sort-key="active" data-table-sort-label="Active">Active</th>
                <th data-testpoints-column="actions">Actions</th>
              </tr>
            </thead>
            <tbody id="testPointTable"></tbody>
          </table>
          <div class="dashboard-table-empty app-table-empty" id="testPointsEmptyState" hidden>
            <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            <p>No test points match the current search and filters.</p>
            <button class="btn btn-light" id="testPointsClearEmpty" type="button">Clear Filters</button>
          </div>
        </div>
        <div class="table-footer app-table-footer">
          <span id="testPointsPageSummary">Showing 0-0 of 0</span>
          <div class="pagination" id="testPointsPagination"></div>
        </div>
      </section>

    </section>
  </main>

  <div class="modal" id="addTpModal">
    <div class="modal-card testpoint-modal-card">
      <button class="modal-close" id="closeTestPointModalButton" type="button" aria-label="Close">
        &times;
      </button>
      <h2 id="testPointModalTitle">Add Test Point</h2>

      <label for="tpLabelInput">Test Point Label</label>
      <input id="tpLabelInput" placeholder="TP-001">

      <label for="tpLocationInput">Location</label>
      <input id="tpLocationInput" placeholder="Pipeline A - North">

      <label for="tpTypeInput">Type</label>
      <select id="tpTypeInput">
        <option value="stationary">Stationary</option>
        <option value="variable">Variable</option>
      </select>

      <label>Protection Threshold</label>
      <p>-850 mV (fixed)</p>

      <label for="tpPointNoteInput">Test Point Note</label>
      <textarea id="tpPointNoteInput" placeholder="Point-specific notes for this test point"></textarea>

      <label for="tpEngineerInput">Assigned Engineer</label>
      <select id="tpEngineerInput">
        <option value="">Unassigned</option>
      </select>

      <label for="tpActiveInput">Active</label>
      <select id="tpActiveInput">
        <option value="true">Active</option>
        <option value="false">Inactive</option>
      </select>

      <button class="btn btn-green full" id="testPointSubmitButton" type="button">
        <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>Save Test Point
      </button>
    </div>
  </div>

  <div class="modal" id="importTestPointsModal">
    <div class="modal-card testpoint-modal-card testpoints-import-modal-card">
      <button class="modal-close" id="closeImportTestPointsModalButton" type="button" aria-label="Close">
        &times;
      </button>
      <h2>Import Test Points from Excel</h2>
      <p class="testpoints-import-intro">
        Upload an `.xlsx` file where each row represents one test point. Existing rows with the same
        <strong>Test Point Label</strong> and <strong>Location</strong> will be updated; new ones will be created.
      </p>

      <div class="testpoints-import-actions">
        <button class="btn btn-light" id="downloadTestPointsTemplateButton" type="button">
          <i class="fa-solid fa-download" aria-hidden="true"></i>Download Template
        </button>
      </div>

      <div class="testpoints-import-reference">
        <h3>Excel Column Reference</h3>
        <div class="table-scroll">
          <table class="testpoints-import-reference-table">
            <thead>
              <tr>
                <th>Column</th>
                <th>Required</th>
                <th>Example</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Test Point Label</td><td>Yes</td><td>TP-001</td></tr>
              <tr><td>Location</td><td>Yes</td><td>Pipeline A - North</td></tr>
              <tr><td>Type</td><td>Yes</td><td>stationary</td></tr>
              <tr><td>Test Point Note</td><td>No</td><td>Terminal box is behind the locked panel</td></tr>
              <tr><td>Assigned Engineer</td><td>No</td><td>Jane Tan</td></tr>
              <tr><td>Active</td><td>No</td><td>TRUE</td></tr>
            </tbody>
          </table>
        </div>
        <p class="muted">Use `stationary` or `variable` for Type. For Active, use `TRUE/FALSE`, `Yes/No`, or `Active/Inactive`.</p>
      </div>

      <label for="testPointsImportFileInput">Excel File</label>
      <input id="testPointsImportFileInput" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">

      <button class="btn btn-green full" id="submitImportTestPointsButton" type="button">
        <i class="fa-solid fa-file-arrow-up" aria-hidden="true"></i>Import Test Points
      </button>
    </div>
  </div>

  <?php require __DIR__ . '/php/test-point-position-modal.php'; ?>

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>
  <script src="<?php echo asset_v('js/auth-storage.js'); ?>"></script>
  <script src="<?php echo asset_v('js/config/supabase-config.js'); ?>"></script>
  <script src="<?php echo asset_v('js/config/app-settings.js'); ?>"></script>
  <script src="<?php echo asset_v('js/supabaseClient.js'); ?>"></script>
  <script src="<?php echo asset_v('js/app-config.js'); ?>"></script>
  <script src="<?php echo asset_v('js/app-config.local.js'); ?>"></script>
  <script src="<?php echo asset_v('js/services/status.js'); ?>"></script>
  <script src="<?php echo asset_v('js/repositories/supabase-repositories.js'); ?>"></script>
  <script src="<?php echo asset_v('js/google-maps-loader.js'); ?>"></script>
  <script src="<?php echo asset_v('js/asset-map-repository.js'); ?>"></script>
  <script src="<?php echo asset_v('js/test-point-position-map-picker.js'); ?>"></script>
  <script src="<?php echo asset_v('js/test-point-position-controller.js'); ?>"></script>
  <script src="<?php echo asset_v('js/app-preferences.js'); ?>"></script>
  <script src="<?php echo asset_v('js/common.js'); ?>"></script>
  <script src="<?php echo asset_v('js/toast.js'); ?>"></script>
  <script src="<?php echo asset_v('js/notifications.js'); ?>"></script>
  <script src="<?php echo asset_v('js/navigation-controller.js'); ?>"></script>
  <script src="<?php echo asset_v('js/table-sort-controller.js'); ?>"></script>
  <script src="<?php echo asset_v('js/trend-presentation.js'); ?>"></script>
  <script src="<?php echo asset_v('js/testpoints.js'); ?>"></script>
</body>

</html>
