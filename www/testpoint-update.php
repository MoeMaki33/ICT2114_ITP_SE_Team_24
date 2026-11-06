<?php require __DIR__ . '/php/session-guard.php'; require_login(); ?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Add or Edit Reading</title>
  <link rel="icon" type="image/png" href="<?php echo asset_v('img/application logo.png'); ?>">
  <link rel="stylesheet" href="<?php echo asset_v('css/style.css'); ?>">
</head>
<body>
  <aside class="sidebar"></aside>
  <main class="main">
    <header class="topbar"></header>
    <section class="content testpoint-update-page">
      <div class="page-title">
        <h1 id="updatePageTitle">Add Reading</h1>
        <p>Record monitoring measurements for the selected Test Point</p>
      </div>

      <!-- Protection logic reference for developers:
           Values closer to 0 are unprotected, while more negative values are protected.
           Threshold example: -850 mV is the cutoff, -851 mV is protected, and -849 mV is unprotected. -->

      <section class="card testpoint-update-card">
        <div class="card-header">
          <h3 id="updateCardTitle">Loading test point...</h3>
          <div class="detail-actions">
            <button class="btn btn-green" id="saveUpdatedTestPointButton" type="button">Save Update</button>
            <button class="btn btn-light" id="cancelUpdateTestPointButton" type="button">Cancel</button>
          </div>
        </div>

        <div class="detail-form-grid" id="updateForm">
          <div class="field-group"><label>Time</label><input id="detailTime" type="datetime-local"></div>
          <div class="field-group"><label>Test Point</label><input id="detailTestPointName" placeholder="TestPoint1"></div>
          <div class="field-group"><label>Site</label><input id="detailSite" placeholder="Site A - North"></div>
          <div class="field-group"><label>Temperature (degree C)</label><input id="detailTemperature" placeholder="28.4 deg C"></div>
          <div class="field-group"><label>Medium Conductivity (µS/cm)</label><input id="detailMediumConductivity" placeholder="e.g. 358"></div>
          <div class="field-group"><label>pH</label><input id="detailPh" placeholder="7.1"></div>
          <div class="field-group"><label>Dissolved Oxygen (mg/L)</label><input id="detailDissolvedOxygen" placeholder="6.2 mg/L"></div>
          <div class="field-group" id="powerFieldGroup"><label>Power (watts)</label><input id="detailPower" placeholder="118 watts"></div>
          <div class="field-group"><label>Latest Reading</label><input id="detailLatestReading" placeholder="-875mV"></div>
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
  <script src="<?php echo asset_v('js/navigation-controller.js'); ?>"></script>
  <script src="<?php echo asset_v('js/testpoint-update.js'); ?>"></script>
</body>
</html>
