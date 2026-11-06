<?php
// GET /api/v1/readings/ query validation (cpm_validate_read_query) and response timestamps.
require __DIR__ . '/../../www/php/reading-validation.php';
$point = '00000000-0000-4000-8000-000000000001';
$count = 0;
function check_query($params, $expectedMessage) {
  global $count;
  try { cpm_validate_read_query($params); $actual = null; } catch (InvalidArgumentException $e) { $actual = $e->getMessage(); }
  if ($actual !== $expectedMessage) { throw new RuntimeException('Read query case failed: ' . json_encode($params) . ' gave ' . json_encode($actual)); }
  $count++;
}
function check_equal($actual, $expected, $label) {
  global $count;
  if ($actual !== $expected) { throw new RuntimeException("$label: expected " . json_encode($expected) . ', got ' . json_encode($actual)); }
  $count++;
}
$bad = 'Invalid or missing timestamp';
foreach ([
  [], ['timestamp' => ''], ['timestamp' => ['2026-11-02T10:00:00Z']], ['timestamp' => 'yesterday'],
  ['timestamp' => '2026-11-02'], ['timestamp' => '2026-11-02T10:00Z'], ['timestamp' => '2026-11-02T10:00:00'],
  ['timestamp' => '2026-11-02 10:00:00Z'], ['timestamp' => '2026-02-30T10:00:00Z'], ['timestamp' => '2026-02-29T10:00:00Z'],
  ['timestamp' => '2026-13-02T10:00:00Z'], ['timestamp' => '2026-11-00T10:00:00Z'], ['timestamp' => '2026-11-02T24:00:00Z'],
  ['timestamp' => '2026-11-02T10:60:00Z'], ['timestamp' => '2026-11-02T10:00:60Z'], ['timestamp' => '0000-01-01T00:00:00Z'],
  ['timestamp' => '2026-11-02T10:00:00+14:30'], ['timestamp' => '2026-11-02T10:00:00+15:00'], ['timestamp' => '2026-11-02T10:00:00+0800'],
  ['timestamp' => '2026-11-02T10:00:00.1234567Z'], ['timestamp' => "2026-11-02T10:00:00Z' OR 1=1--"], ['timestamp' => "2026-11-02T10:00:00Z\n"],
  ['testPointId' => $point],
] as $params) { check_query($params, $bad); }
$ts = '2026-11-02T10:00:00Z';
$f = ['field' => 'potential'];
foreach ([
  [['timestamp' => $ts] + $f, null], [['timestamp' => $ts, 'testPointId' => $point] + $f, null],
  [['timestamp' => $ts, 'field' => 'voltage'], null], [['timestamp' => '2024-02-29T23:59:59.5-12:00'] + $f, null],
  [['timestamp' => '2026-11-02T18:00:00 08:00'] + $f, null],      // unencoded "+" decoded to a space
  [['timestamp' => $ts, 'testPointId' => 'TP-001'] + $f, 'Invalid testPointId'],
  [['timestamp' => $ts, 'testPointId' => "' OR 1=1--"] + $f, 'Invalid testPointId'],
  [['timestamp' => $ts, 'testPointId' => [$point]] + $f, 'Invalid testPointId'],
  [['timestamp' => $ts, 'testPointId' => "$point&select=*"] + $f, 'Invalid testPointId'],
  // field is required (client, 4 Nov): missing, empty, unknown or array is rejected.
  [['timestamp' => $ts], 'Invalid or missing field'],
  [['timestamp' => $ts, 'testPointId' => $point], 'Invalid or missing field'],
  [['timestamp' => $ts, 'field' => ''], 'Invalid or missing field'],
  [['timestamp' => $ts, 'field' => ['voltage']], 'Invalid or missing field'],
  [['timestamp' => $ts, 'field' => 'value_mv'], 'Invalid or missing field'],
  [['timestamp' => $ts, 'field' => 'Voltage'], 'Invalid or missing field'],
  [['timestamp' => $ts, 'field' => '__proto__'], 'Invalid or missing field'],
  [['timestamp' => $ts, 'select' => '*'] + $f, 'Unexpected query parameter'],
  // Paging: limit 1..1000 (default 1000), offset 0..9999999, plain decimal digits only.
  [['timestamp' => $ts, 'limit' => '1', 'offset' => '0'] + $f, null],
  [['timestamp' => $ts, 'limit' => '1000', 'offset' => '9999999'] + $f, null],
  [['timestamp' => $ts, 'limit' => '0'] + $f, 'Invalid limit (1 to 1000)'],
  [['timestamp' => $ts, 'limit' => '1001'] + $f, 'Invalid limit (1 to 1000)'],
  [['timestamp' => $ts, 'limit' => '-1'] + $f, 'Invalid limit (1 to 1000)'],
  [['timestamp' => $ts, 'limit' => '01'] + $f, 'Invalid limit (1 to 1000)'],
  [['timestamp' => $ts, 'limit' => '10.5'] + $f, 'Invalid limit (1 to 1000)'],
  [['timestamp' => $ts, 'limit' => ''] + $f, 'Invalid limit (1 to 1000)'],
  [['timestamp' => $ts, 'limit' => ['5']] + $f, 'Invalid limit (1 to 1000)'],
  [['timestamp' => $ts, 'offset' => '-1'] + $f, 'Invalid offset'],
  [['timestamp' => $ts, 'offset' => '10000000'] + $f, 'Invalid offset'],
  [['timestamp' => $ts, 'offset' => '1e3'] + $f, 'Invalid offset'],
  [['timestamp' => $ts, 'offset' => '00'] + $f, 'Invalid offset'],
  [['timestamp' => $ts, 'offset' => '5&limit=1'] + $f, 'Invalid offset'],
] as [$params, $message]) { check_query($params, $message); }
// Normalisation: offsets become the same UTC instant; IDs are lower-cased; paging defaults.
$q = cpm_validate_read_query(['timestamp' => '2026-11-02T18:00:00+08:00', 'testPointId' => strtoupper($point)] + $f);
check_equal($q['timestamp'], '2026-11-02T10:00:00.000000Z', 'offset normalised to UTC');
check_equal($q['test_point_id'], $point, 'testPointId lower-cased');
check_equal($q['field'], 'potential', 'field kept');
check_equal([$q['limit'], $q['offset']], [1000, 0], 'default page');
$q = cpm_validate_read_query(['timestamp' => $ts, 'field' => 'voltage', 'limit' => '25', 'offset' => '50']);
check_equal([$q['field'], $q['limit'], $q['offset']], ['voltage', 25, 50], 'paging parsed as integers');
check_equal(cpm_validate_read_query(['timestamp' => '2026-11-02T18:00:00 08:00'] + $f)['timestamp'], '2026-11-02T10:00:00.000000Z', 'space offset');
check_equal(cpm_validate_read_query(['timestamp' => '2026-11-02T10:00:00.123456Z'] + $f)['timestamp'], '2026-11-02T10:00:00.123456Z', 'microseconds kept');
check_equal(CPM_READ_FIELDS['potential'], ['value_mv', 'mV'], 'potential stays in mV');
check_equal(CPM_READ_FIELDS['voltage'], ['voltage_v', 'V'], 'voltage is the rectifier output in V');
check_equal(cpm_format_read_timestamp('2026-11-02T10:00:00+00:00'), '2026-11-02T10:00:00Z', 'UTC Z output');
check_equal(cpm_format_read_timestamp('2026-11-02T18:00:00+08:00'), '2026-11-02T10:00:00Z', 'offset output normalised');
check_equal(cpm_format_read_timestamp('2026-11-02T10:00:00.25+00:00'), '2026-11-02T10:00:00.25Z', 'fraction kept, zeros trimmed');
echo "$count PHP read query cases passed\n";
