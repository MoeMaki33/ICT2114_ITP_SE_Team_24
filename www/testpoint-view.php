<?php require __DIR__ . '/php/session-guard.php'; require_login(); ?>
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Point Details</title>
  <link rel="icon" type="image/png" href="<?php echo asset_v('img/application logo.png'); ?>">
  <link rel="stylesheet" href="<?php echo asset_v('css/style.css'); ?>">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>

<body>
  <aside class="sidebar"></aside>
  <main class="main">
    <header class="topbar"></header>
    <section class="content detail-page">
      <div class="detail-page-heading">
        <button class="detail-back-link" id="testPointDetailBackButton" type="button" aria-label="Back to Test Points" title="Back to Test Points">
          <span aria-hidden="true">&larr;</span>
        </button>
        <div>
          <p class="detail-breadcrumb" id="detailBreadcrumb">Test Points / Loading...</p>
          <h1 id="detailPageTitle">Entry Monitoring Point</h1>
        </div>
      </div>

      <!-- Protection logic reference for developers:
           Values closer to 0 are unprotected, while more negative values are protected.
           Threshold example: -850 mV is the cutoff, -851 mV is protected, and -849 mV is unprotected. -->

      <section class="detail-hero" id="detailHero"></section>

      <section class="detail-trend-notes-layout">
        <article class="card detail-chart-card">
          <div class="detail-section-heading">
            <div>
              <h3>Protection Potential Trend</h3>
              <p id="detailChartSubtitle">Loading the selected reporting period…</p>
              <div class="chart-zone-legend" id="detailChartZoneLegend" aria-label="Protection-potential chart zones"></div>
            </div>
            <div class="detail-chart-pills" id="detailChartRangePills" role="group" aria-label="Protection potential chart range">
              <button type="button" data-range="day" aria-pressed="false">Day</button>
              <button type="button" class="active" data-range="week" aria-pressed="true">Week</button>
              <button type="button" data-range="month" aria-pressed="false">Month</button>
            </div>
          </div>
          <div class="detail-chart-frame" id="detailHistoryChart"></div>
          <p class="muted detail-chart-summary" id="detailHistoryChartSummary" aria-live="polite">Loading protection-potential data…</p>
        </article>
        <article class="card detail-notes-card" aria-labelledby="detailNotesTitle">
          <div class="detail-section-heading">
            <div>
              <h3 id="detailNotesTitle">Notes</h3>
              <p>Operational context recorded for this Location and Test Point.</p>
            </div>
          </div>
          <div class="detail-notes-body" id="detailNotesContent" aria-live="polite"></div>
        </article>
      </section>

      <section class="detail-position-summary-layout">
        <article class="card detail-environment-card" aria-labelledby="detailEnvironmentTitle">
          <div class="detail-section-heading">
            <div>
              <h3 id="detailEnvironmentTitle">Environmental Readings</h3>
              <p id="detailEnvironmentChartMeta">Latest environmental readings</p>
            </div>
          </div>
          <div class="detail-environment-grid" id="detailEnvironmentGrid"></div>
          <div class="detail-environment-chart-grid">
            <section class="detail-environment-chart-panel" aria-label="Conductivity trend">
              <div class="detail-environment-chart-heading">
                <h4>Conductivity</h4>
                <span>µS/cm</span>
              </div>
              <div class="detail-environment-chart-frame" id="detailConductivityChart"></div>
            </section>
            <section class="detail-environment-chart-panel" aria-label="pH trend">
              <div class="detail-environment-chart-heading">
                <h4>pH</h4>
                <span>0-14</span>
              </div>
              <div class="detail-environment-chart-frame" id="detailPhChart"></div>
            </section>
          </div>
        </article>

        <article class="card detail-position-card" id="detailPositionPanel" aria-labelledby="detailPositionTitle">
          <div class="detail-section-heading">
            <div>
              <h3 id="detailPositionTitle">Position / Map</h3>
              <p>Current mapped or relative position for this Test Point.</p>
            </div>
          </div>
          <div class="detail-position-layout">
            <div class="detail-position-details" id="detailPositionDetails"></div>
            <div class="detail-position-map-shell">
              <div class="detail-position-map" id="detailPositionMap" role="region" aria-label="Current Test Point position on Google Maps"></div>
              <div class="detail-position-map-state" id="detailPositionMapState" aria-live="polite"><span>Loading position…</span></div>
            </div>
            <div class="detail-position-actions" id="detailPositionActions"></div>
          </div>
        </article>
      </section>

      <section class="card detail-equipment-card">
        <div class="detail-section-heading detail-equipment-heading">
          <div>
            <h3>Equipment Tracking</h3>
            <p id="detailEquipmentMeta">Track replacements, upgrades, repairs, and calibration changes</p>
          </div>
          <button class="btn btn-green" type="button" id="openEquipmentChangeModalButton" hidden>
            <i class="fa-solid fa-screwdriver-wrench" aria-hidden="true"></i>Record Equipment Change
          </button>
        </div>
        <div id="detailEquipmentContent"></div>
      </section>

      <section class="card detail-history-card">
        <div class="detail-section-heading">
          <div>
            <h3>Reading History</h3>
            <p>Historical measurements for this Test Point, ordered from newest to oldest.</p>
          </div>
        </div>
        <div class="testpoints-table-toolbar detail-history-toolbar">
          <div class="testpoints-table-toolbar-left">
            <div class="testpoints-search-wrap search-wrap detail-history-search-wrap">
              <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
              <input id="detailHistorySearchInput" type="search" placeholder="Search by reading, date, user, or status...">
              <button class="search-clear-button" id="detailHistorySearchClear" type="button" aria-label="Clear history search" hidden>
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
            </div>
            <button class="btn btn-light" type="button" id="detailHistoryFiltersButton" aria-expanded="false">
              <i class="fa-solid fa-sliders" aria-hidden="true"></i>Filters <span class="filter-count" id="detailHistoryFilterCount" hidden>0</span>
            </button>
            <button class="btn btn-light" type="button" id="detailHistoryReset"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i>Reset</button>
          </div>
          <div class="testpoints-table-toolbar-right">
            <span id="detailHistoryCountLabel">0 results</span>
            <label class="history-rows-label">Rows:
              <select id="detailHistoryRowsPerPage">
                <option value="10">10</option>
                <option value="25" selected>25</option>
                <option value="50">50</option>
              </select>
            </label>
          </div>
        </div>
        <div class="history-filter-summary detail-history-filter-summary">
          <p id="detailHistoryResultMeta">0 results · Page 1 of 1</p>
          <div class="dashboard-filter-chips" id="detailHistoryFilterChips" aria-label="Active detail history filters"></div>
        </div>
        <div class="history-advanced-filters detail-history-advanced-filters" id="detailHistoryAdvancedFilters" hidden>
          <label>Status <select id="detailHistoryStatusFilter"></select></label>
          <label>Source <select id="detailHistorySourceFilter"></select></label>
          <label>Recorded By <select id="detailHistoryRecordedByFilter"></select></label>
        </div>
        <div class="table-scroll">
          <table class="detail-history-table" id="detailHistoryDataTable">
            <thead>
              <tr>
                <th data-table-sort-key="sortDate" data-table-sort-label="Date">Date</th>
                <th class="app-table-numeric" data-table-sort-key="readingValue" data-table-sort-label="Reading (mV)">Reading (mV)</th>
                <th data-table-sort-key="status" data-table-sort-label="Status">Status</th>
                <th class="app-table-numeric" data-table-sort-key="temperatureValue" data-table-sort-label="Temperature">Temp</th>
                <th class="app-table-numeric" data-table-sort-key="conductivityValue" data-table-sort-label="Conductivity">Conductivity</th>
                <th class="app-table-numeric" data-table-sort-key="phValue" data-table-sort-label="pH">pH</th>
                <th class="app-table-numeric" data-table-sort-key="dissolvedOxygenValue" data-table-sort-label="Dissolved oxygen">DO</th>
                <th class="app-table-numeric" id="historyPowerHeader" data-table-sort-key="powerValue" data-table-sort-label="Power">Power</th>
                <th data-table-sort-key="enteredBy" data-table-sort-label="Recorded By">Recorded By</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="detailHistoryTable"></tbody>
          </table>
        </div>
        <div class="table-footer">
          <span id="detailHistoryPageSummary">Showing 0-0 of 0</span>
          <div class="pagination" id="detailHistoryPagination"></div>
        </div>
      </section>

    </section>
  </main>

  <div class="modal" id="importDetailReadingsModal">
    <div class="modal-card testpoint-modal-card detail-import-modal-card">
      <button class="modal-close" id="closeImportDetailReadingsModalButton" type="button" aria-label="Close">
        &times;
      </button>
      <h2>Import Readings from Excel</h2>
      <p class="detail-import-intro">
        Upload an `.xlsx` file to add historical readings for
        <strong id="detailImportPointLabel">this test point</strong>.
      </p>
      <p class="detail-import-subtitle" id="detailImportPointSite">Each row should represent one reading timestamp for the selected test point.</p>

      <div class="detail-import-actions">
        <button class="btn btn-light" id="downloadDetailReadingsTemplateButton" type="button">
          <i class="fa-solid fa-download" aria-hidden="true"></i>Download Template
        </button>
      </div>

      <div class="detail-import-reference">
        <h3>Excel Column Reference</h3>
        <div class="table-scroll">
          <table class="detail-import-reference-table">
            <thead>
              <tr>
                <th>Column</th>
                <th>Required</th>
                <th>Example</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Time</td><td>Yes</td><td>03/07/2026 08:15</td></tr>
              <tr><td>Reading (mV)</td><td>Yes</td><td>-875</td></tr>
              <tr><td>Temperature (degree C)</td><td>No</td><td>28.4</td></tr>
              <tr><td>Medium Conductivity (µS/cm)</td><td>No</td><td>358</td></tr>
              <tr><td>pH</td><td>No</td><td>7.1</td></tr>
              <tr><td>Dissolved Oxygen (mg/L)</td><td>No</td><td>6.2</td></tr>
              <tr><td>Power (watts)</td><td>No</td><td>118</td></tr>
            </tbody>
          </table>
        </div>
        <p class="muted">Time supports Excel date cells or text like `DD/MM/YYYY HH:mm` and `DD/MM/YYYY, HH:mm`. Any value in `Power (watts)` is imported as watts. Older spreadsheets with a `Medium Conductivity (mS/cm)` column are still accepted; their values are imported unchanged.</p>
      </div>

      <label for="detailReadingsImportFileInput">Excel File</label>
      <input id="detailReadingsImportFileInput" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">

      <button class="btn btn-green full" id="submitDetailReadingsImportButton" type="button">
        <i class="fa-solid fa-file-arrow-up" aria-hidden="true"></i>Import Readings
      </button>
    </div>
  </div>

  <div class="modal" id="equipmentChangeModal">
    <div class="modal-card testpoint-modal-card detail-equipment-modal-card">
      <button class="modal-close" id="closeEquipmentChangeModalButton" type="button" aria-label="Close">
        &times;
      </button>
      <h2>Record Equipment Change</h2>
      <p class="detail-equipment-modal-intro" id="equipmentChangeModalSubtitle">Add an equipment history entry for this test point.</p>

      <label for="equipmentChangeTypeInput">Change Type</label>
      <select id="equipmentChangeTypeInput">
        <option value="initial_install">Initial Install</option>
        <option value="replacement">Replacement</option>
        <option value="upgrade">Upgrade</option>
        <option value="repair">Repair</option>
        <option value="calibration">Calibration</option>
      </select>

      <label for="equipmentInstalledAtInput">Installed Date</label>
      <input id="equipmentInstalledAtInput" type="datetime-local">

      <label for="equipmentReasonInput">Reason</label>
      <input id="equipmentReasonInput" type="text" maxlength="160" placeholder="e.g. Damaged terminal replaced during maintenance">

      <label for="equipmentNotesInput">Note</label>
      <textarea id="equipmentNotesInput" rows="4" maxlength="600" placeholder="Optional details for audit trail"></textarea>

      <p class="form-message muted" id="equipmentChangeMessage"></p>

      <div class="detail-equipment-modal-actions">
        <button class="btn btn-light" type="button" id="cancelEquipmentChangeButton">Cancel</button>
        <button class="btn btn-green" type="button" id="submitEquipmentChangeButton">
          <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>Save Change
        </button>
      </div>
    </div>
  </div>
  <?php require __DIR__ . '/php/test-point-position-modal.php'; ?>
  <div class="modal" id="addReadingModal">
    <div class="modal-card testpoint-modal-card reading-modal-card">
      <button class="modal-close" id="closeAddReadingModalButton" type="button" aria-label="Close">
        &times;
      </button>
      <h2 id="addReadingModalTitle">Add Reading</h2>

      <div class="reading-form-grid">
        <div class="field-group field-group-full">
          <label for="readingTimeInput">Date &amp; Time</label>
          <input id="readingTimeInput" type="datetime-local">
        </div>

        <div class="field-group">
          <label for="readingValueInput">Reading (mV)</label>
          <input id="readingValueInput" type="number" placeholder="-875">
        </div>

        <div class="field-group" id="readingPowerFieldGroup">
          <label for="readingPowerInput">Power (watts)</label>
          <input id="readingPowerInput" type="number" step="0.01" placeholder="118">
        </div>

        <div class="field-group">
          <label for="readingTemperatureInput">Temperature (Degree C)</label>
          <input id="readingTemperatureInput" type="number" step="0.1" placeholder="28.4">
        </div>

        <div class="field-group">
          <label for="readingConductivityInput">Medium Conductivity (µS/cm)</label>
          <input id="readingConductivityInput" type="number" step="0.1" placeholder="e.g. 358">
        </div>

        <div class="field-group">
          <label for="readingPhInput">pH</label>
          <input id="readingPhInput" type="number" step="0.1" placeholder="7.1">
        </div>

        <div class="field-group">
          <label for="readingDissolvedOxygenInput">Dissolved Oxygen (mg/L)</label>
          <input id="readingDissolvedOxygenInput" type="number" step="0.1" placeholder="6.2">
        </div>
      </div>

      <button class="btn btn-green full" id="saveReadingModalButton" type="button">
        <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>
        <span id="saveReadingModalButtonText">Save Reading</span>
      </button>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>
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
  <script src="<?php echo asset_v('js/app-config.js'); ?>"></script>
  <script src="<?php echo asset_v('js/app-config.local.js'); ?>"></script>
  <script src="<?php echo asset_v('js/google-maps-loader.js'); ?>"></script>
  <script src="<?php echo asset_v('js/asset-map-repository.js'); ?>"></script>
  <script src="<?php echo asset_v('js/test-point-position-map-picker.js'); ?>"></script>
  <script src="<?php echo asset_v('js/test-point-position-controller.js'); ?>"></script>
  <script src="<?php echo asset_v('js/table-sort-controller.js'); ?>"></script>
  <script src="<?php echo asset_v('js/trend-presentation.js'); ?>"></script>
  <script src="<?php echo asset_v('js/weekly-location-aggregator.js'); ?>"></script>
  <script src="<?php echo asset_v('js/weekly-daily-trend.js'); ?>"></script>
  <script src="<?php echo asset_v('js/test-point-weekly-view.js'); ?>"></script>
  <script src="<?php echo asset_v('js/test-point-location-view.js'); ?>"></script>
  <script src="<?php echo asset_v('js/testpoint-view.js'); ?>"></script>
</body>

</html>
