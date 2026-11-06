const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const status = require('../www/js/services/status.js');
const presentation = require('../www/js/chart-protection-presentation.js');

function controllerApi(file, exports) {
  let source = fs.readFileSync(file, 'utf8');
  const end = source.lastIndexOf('})();');
  source = source.slice(0, end) + `window.testApi = { ${exports} };\n` + source.slice(end);
  const context = { AppStatus: status, window: { AppStatus: status, addEventListener() {} }, document: { addEventListener() {} }, console };
  vm.runInNewContext(source, context);
  return { api: context.window.testApi, context };
}

test('boundary and custom thresholds cannot override protection; Warning remains unprotected', () => {
  for (const [value, protectedValue] of [[-850, true], [-851, true], [-849, false], [-1000, true], [-700, false]]) {
    for (const staleThreshold of [-700, -720, -800, -900, null]) {
      assert.equal(status.deriveProtectionStatus(value, staleThreshold).isProtected, protectedValue);
      assert.equal(presentation.isProtectedValue(value, staleThreshold), protectedValue);
    }
  }
  assert.equal(status.deriveProtectionStatus(-849).protectionStatus, 'Unprotected');
  assert.equal(status.deriveProtectionStatus(-849).displayStatus, 'Warning');
  assert.equal(status.deriveProtectionStatus(-800).displayStatus, 'Warning');
  assert.equal(status.deriveProtectionStatus(-799).displayStatus, 'Unprotected');
  for (const value of [null, undefined, '', 'invalid']) assert.equal(status.deriveProtectionStatus(value).isProtected, null);
});

test('create payload ignores caller threshold; edit payload never writes it', () => {
  const { api } = controllerApi('www/js/testpoints.js', 'buildTestPointPayload, parseTestPointImportRows');
  const record = { label: 'Synthetic TP', type: 'stationary', thresholdMv: -700, isActive: true };
  assert.equal(api.buildTestPointPayload(record, 'location').threshold_mv, -850);
  const edited = api.buildTestPointPayload(record, 'location', { databaseStatus: 'unknown', thresholdMv: -850 });
  assert.equal(Object.hasOwn(edited, 'threshold_mv'), false);
  for (const threshold of [-700, -900, undefined]) {
    const imported = api.parseTestPointImportRows([{ 'Test Point Label': 'Synthetic TP', Location: 'Synthetic location', Type: 'stationary', ...(threshold === undefined ? {} : { 'Threshold (mV)': threshold }) }])[0];
    assert.equal(imported.thresholdMv, -850);
    assert.equal(api.buildTestPointPayload(imported, 'location').threshold_mv, -850);
  }
  assert.doesNotMatch(fs.readFileSync('www/testpoints.php', 'utf8'), /tpThresholdInput/);
});

test('manual reading fallback writes fixed snapshot and classification despite stale point', async () => {
  const source = fs.readFileSync('www/js/testpoint-update.js', 'utf8');
  const writes = [];
  const context = { window: { AppStatus: status, addEventListener() {}, appSupabase: {
    rpc: async () => ({ error: { code: 'PGRST202' } }),
    from: table => ({ update: payload => { writes.push({ table, payload }); return { eq() { return this; }, then(resolve) { resolve({ count: 1 }); } }; } }),
  } }, document: { addEventListener() {} } };
  vm.runInNewContext(source + '\ncurrentTestPoint = { thresholdMv: -700 }; window.testSave = updateExistingReading;', context);
  await context.window.testSave({ valueMv: -849, readingId: 'reading', batchId: 'batch', testPointId: 'point' });
  const reading = writes.find(write => write.table === 'test_point_readings').payload;
  assert.equal(reading.threshold_mv_snapshot, -850);
  assert.equal(reading.is_protected, false);
});

test('repository preserves audit snapshot but ignores stale threshold and server status', () => {
  const { api } = controllerApi('www/js/repositories/supabase-repositories.js', 'mapReadingRowToReadingModel, mapWeeklySummaryRpcRow, mapTestPointRowToTestPointModel');
  const reading = api.mapReadingRowToReadingModel({ value_mv: -849, threshold_mv_snapshot: -700, test_points: { threshold_mv: -700 }, reading_batches: {} });
  assert.equal(reading.thresholdMvSnapshot, -700);
  assert.equal(reading.isProtected, false);
  assert.equal(reading.status, 'Warning');
  const summary = api.mapWeeklySummaryRpcRow({ latest_reading_mv: -849, threshold_mv: -700, current_display_status: 'Protected' });
  assert.equal(summary.thresholdMv, -850);
  assert.equal(summary.protectionStatus, 'Unprotected');
  assert.equal(summary.displayStatus, 'Warning');
  assert.equal(api.mapTestPointRowToTestPointModel({ threshold_mv: -700 }).thresholdMv, -850);
});

test('asset map derives classification from value even when RPC flags are stale', () => {
  const { api } = controllerApi('www/js/asset-map-repository.js', 'mapAssetMapPointRow');
  const point = api.mapAssetMapPointRow({ latest_reading_mv: -849, threshold_mv: -700, protection_status: 'Protected', display_status: 'Protected' });
  assert.equal(point.thresholdMv, -850);
  assert.equal(point.protectionStatus, 'Unprotected');
  assert.equal(point.displayStatus, 'Warning');
  assert.equal(api.mapAssetMapPointRow({ latest_reading_mv: null, display_status: 'Protected' }).displayStatus, 'Unknown');
});
