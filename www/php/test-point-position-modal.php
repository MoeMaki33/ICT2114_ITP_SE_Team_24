<div class="modal" id="testPointPositionModal" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="testPointPositionTitle" tabindex="-1">
  <div class="modal-card testpoint-modal-card position-modal-card">
    <button class="modal-close" type="button" data-close-position-modal aria-label="Close position modal">&times;</button>
    <h2 id="testPointPositionTitle" data-position-title>Test Point Position</h2>
    <p class="muted" data-position-permission></p>

    <div class="position-editor-layout test-point-position-layout">
      <div class="position-form-panel test-point-position-form">
        <div class="position-form-grid">
          <label>Coordinate Mode
            <select name="coordinateMode">
              <option value="gps">GPS</option>
              <option value="relative">Relative</option>
              <option value="gps_and_relative">GPS and Relative</option>
              <option value="unmapped">Unmapped</option>
            </select>
          </label>
          <label data-position-group="gps">Latitude <input name="latitude" type="number" step="any" min="-90" max="90"></label>
          <label data-position-group="gps">Longitude <input name="longitude" type="number" step="any" min="-180" max="180"></label>
          <label data-position-group="relative">Relative X (m) <input name="relativeX" type="number" step="any"></label>
          <label data-position-group="relative">Relative Y (m) <input name="relativeY" type="number" step="any"></label>
          <label data-position-group="relative">Relative Z (m) <input name="relativeZ" type="number" step="any"></label>
          <label data-position-group="relative">Chainage (m) <input name="chainageM" type="number" step="any"></label>
          <label data-position-group="metadata">Coordinate Accuracy (m) <input name="coordinateAccuracyM" type="number" step="any" min="0"></label>
          <label data-position-group="metadata">Coordinate Source <input name="coordinateSource" maxlength="200" placeholder="GPS survey, as-built drawing…"></label>
        </div>
        <p class="position-mode-message" data-position-mode-message hidden></p>
      </div>

      <section class="position-picker-panel test-point-position-map-section" aria-labelledby="positionPickerTitle">
        <div class="position-picker-heading">
          <div>
            <h3 id="positionPickerTitle">Google Map position picker</h3>
            <p data-position-picker-instruction>Click the map or drag the proposed marker to select coordinates.</p>
          </div>
        </div>
        <div class="position-map-toolbar">
          <label class="position-place-search" data-position-search-wrap hidden>
            <span class="visually-hidden">Search place or address</span>
            <input type="search" placeholder="Search place or address" autocomplete="off" data-position-place-search data-position-edit-control>
          </label>
          <div class="position-map-actions" role="group" aria-label="Position map controls">
            <button class="btn btn-light compact" type="button" data-position-reset-saved data-position-edit-control>Reset to Saved Position</button>
            <button class="btn btn-light compact" type="button" data-position-clear-proposed data-position-edit-control>Clear Proposed Position</button>
            <button class="btn btn-light compact" type="button" data-position-fit-markers data-position-view-control>Fit Reference Markers</button>
            <label class="position-show-all-control">
              <input type="checkbox" data-position-show-all data-position-view-control>
              <span>Show All Test Points</span>
            </label>
          </div>
        </div>
        <div class="position-picker-shell">
          <div class="position-picker-canvas" id="testPointPositionPickerMap" data-position-picker-canvas role="application" aria-label="Choose the Test Point GPS position on Google Maps"></div>
          <div class="position-picker-state" id="testPointPositionMapState" data-position-picker-state aria-live="polite">
            <span>Loading Google Map…</span>
          </div>
        </div>
        <div class="position-picker-legend" aria-label="Position marker legend">
          <span><i class="position-picker-dot existing"></i>Existing Test Points</span>
          <span><i class="position-picker-dot current"></i>Current saved position</span>
          <span><i class="position-picker-dot proposed"></i>Proposed position</span>
        </div>
        <div class="position-coordinate-preview" id="testPointPositionPreview" data-position-preview aria-live="polite"></div>
      </section>
    </div>

    <section class="position-history-section">
      <h3>Position History</h3>
      <div data-position-history></div>
    </section>
    <button class="btn btn-green full" type="button" data-save-test-point-position>Save New Position</button>
  </div>
</div>
