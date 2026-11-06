const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const php = process.env.PHP_BINARY || (process.platform === 'win32' && fs.existsSync('C:/xampp/php/php.exe') ? 'C:/xampp/php/php.exe' : 'php');
const available = !spawnSync(php, ['--version']).error;
const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261029090000_ingest_reading_v1_electrical_and_limits.sql'), 'utf8');
if (process.env.CI && !available) throw new Error('PHP is required in CI; API tests must not silently skip');

test('API plausibility limits are identical in PHP settings and ingest_reading_v1', { skip: !available }, () => {
  const result = spawnSync(php, ['-r', "require 'www/php/app-settings.php'; echo json_encode(APP_SETTINGS['ingestion']);"], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const settings = JSON.parse(result.stdout);

  const [mvMin, mvMax] = settings.ranges.value_mv;
  assert.match(migration, new RegExp(`v_value < ${mvMin} or v_value > ${mvMax}`));
  for (const [field, [min, max]] of Object.entries(settings.ranges)) {
    if (field === 'value_mv') continue;
    assert.match(migration, new RegExp(`\\('${field}', ${min}(::numeric)?, ${max}(::numeric)?\\)`), field);
  }
  assert.match(migration, new RegExp(`interval '${settings.max_future_seconds / 60} minutes'`));
  assert.match(migration, new RegExp(`timestamptz '${settings.earliest_reading_ts.slice(0, 10)} 00:00:00\\+00'`));
  for (const field of settings.electrical_fields) {
    assert.match(migration, new RegExp(`p_reading \\? '${field}'`), `${field} limited to variable points`);
  }
});

test('ingest_reading_v1 migration requires #134 and never accepts power', () => {
  assert.match(migration, /to_regprocedure\('public\.create_manual_reading\(uuid, timestamptz, integer, numeric, numeric, numeric, numeric, numeric, numeric, numeric\)'\)/);
  assert.doesNotMatch(migration, /'power_watts'/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /revoke all on function public\.ingest_reading_v1\(jsonb\) from public, anon;/);
  assert.match(migration, /v_point\.type::text is distinct from 'variable'/);
});
