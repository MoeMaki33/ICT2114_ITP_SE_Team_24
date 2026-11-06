<?php require __DIR__ . '/php/session-guard.php'; require_login(); ?>
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Asset Map</title>
  <link rel="icon" type="image/png" href="<?php echo asset_v('img/application logo.png'); ?>">
  <link rel="stylesheet" href="<?php echo asset_v('css/style.css'); ?>">
</head>

<body>
  <aside class="sidebar"></aside>
  <main class="main">
    <header class="topbar"></header>
    <section class="content">
      <div class="page-title">
        <h1>Asset Map</h1>
        <p>Visualise test point locations and protection status</p>
      </div>

      <section class="card asset-map-card">
        <div class="asset-map-toolbar">
          <div>
            <h3>Asset Map</h3>
            <p class="muted" id="assetMapSummary">Loading Asset Map...</p>
          </div>

          <div class="asset-map-toolbar-actions" role="group" aria-label="Asset Map actions">
            <div class="asset-map-view-switch" role="group" aria-label="Asset Map view">
              <button type="button" class="asset-map-view-button active" data-asset-map-view="map" aria-pressed="true">
                <i class="fa-solid fa-map-location-dot" aria-hidden="true"></i>Map
              </button>
              <button type="button" class="asset-map-view-button" data-asset-map-view="schematic" aria-pressed="false">
                <i class="fa-solid fa-diagram-project" aria-hidden="true"></i>Site schematic
              </button>
            </div>
            <button class="btn btn-light" id="assetMapFilterButton" type="button" aria-expanded="true" aria-controls="assetMapFilters">
              <i class="fa-solid fa-filter" aria-hidden="true"></i>Filters
            </button>
            <button class="btn btn-light" id="refreshAssetMap" type="button">
              <i class="fa-solid fa-rotate-right" aria-hidden="true"></i>Refresh
            </button>
          </div>
        </div>

        <div class="asset-map-filters" id="assetMapFilters">
          <label>
            <span>Search</span>
            <input id="assetMapSearch" type="search" autocomplete="off" placeholder="Search Test Point or location">
          </label>
          <label>
            <span>Location</span>
            <select id="assetMapLocationFilter">
              <option value="">All locations</option>
            </select>
          </label>
          <label>
            <span>Status</span>
            <select id="assetMapStatusFilter">
              <option value="">All statuses</option>
              <option value="Protected">Protected</option>
              <option value="Warning">Warning</option>
              <option value="Unprotected">Unprotected</option>
              <option value="Unknown">Unknown</option>
            </select>
          </label>
          <label>
            <span>Coordinates</span>
            <select id="assetMapCoordinateAvailabilityFilter">
              <option value="">All</option>
              <option value="gps">GPS available</option>
              <option value="relative">Relative only</option>
              <option value="missing">Missing coordinates</option>
              <option value="overlapping">Overlapping coordinates</option>
            </select>
          </label>
          <label>
            <span>Mode</span>
            <select id="assetMapCoordinateModeFilter">
              <option value="">All modes</option>
              <option value="gps">GPS</option>
              <option value="relative">Relative</option>
              <option value="gps_and_relative">GPS and relative</option>
              <option value="unmapped">Unmapped</option>
            </select>
          </label>
        </div>

        <div class="asset-map-layout">
          <div class="asset-map-view-shell">
            <div class="asset-map-google-canvas" id="assetMapGoogleCanvas" aria-label="Google Map of Test Point positions"></div>
            <div class="asset-map-canvas-state" id="assetMapCanvasState" hidden></div>
          </div>
          <div class="asset-map-schematic" id="assetMapSchematic" hidden></div>

          <aside class="asset-map-panel" id="assetMapPanel">
            <h3>Map Details</h3>
            <div class="asset-map-legend" aria-label="Protection status legend">
              <span><i class="legend-dot green"></i>Protected</span>
              <span><i class="legend-dot orange"></i>Warning</span>
              <span><i class="legend-dot red"></i>Unprotected</span>
              <span><i class="legend-dot gray"></i>Unknown</span>
            </div>
            <div id="assetMapCounts"></div>
          </aside>
        </div>
      </section>

      <section class="card standard-table-card app-table-card asset-map-table-card" aria-labelledby="assetMapTableTitle">
        <div class="asset-map-table-heading app-table-toolbar">
          <div>
            <h3 id="assetMapTableTitle">Test Points</h3>
            <p id="assetMapTableSummary">Loading Test Points…</p>
          </div>
          <div class="asset-map-table-controls">
            <label>Rows per page
              <select id="assetMapRowsPerPage">
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </label>
          </div>
        </div>
        <div id="assetMapList" class="asset-map-table-region"></div>
      </section>
    </section>
  </main>

  <?php require __DIR__ . '/php/test-point-position-modal.php'; ?>

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
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
  <script src="<?php echo asset_v('js/trend-presentation.js'); ?>"></script>
  <script src="<?php echo asset_v('js/schematic/schematic-layout.js'); ?>"></script>
  <script src="<?php echo asset_v('js/schematic/schematic-view.js'); ?>"></script>
  <script src="<?php echo asset_v('js/asset-map.js'); ?>"></script>
</body>

</html>
