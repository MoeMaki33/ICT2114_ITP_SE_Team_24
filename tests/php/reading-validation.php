<?php
require __DIR__ . '/../../www/php/reading-validation.php';
$valid = ['test_point_id' => '00000000-0000-4000-8000-000000000001', 'reading_ts' => '2026-10-24T12:00:00+08:00', 'value_mv' => -850];
// Fixed clock so future/past limits do not depend on when the test runs.
$now = (new DateTimeImmutable('2026-10-29T12:00:00Z'))->getTimestamp();
$count = 0;
function check_row($row, $expected) {
  global $count, $now;
  try { cpm_validate_reading($row, $now); $actual = true; } catch (InvalidArgumentException $e) { $actual = false; }
  if ($actual !== $expected) { throw new RuntimeException('Validation case failed: ' . json_encode($row)); }
  $count++;
}
check_row((object) $valid, true);
check_row((object) ($valid + ['ph' => 0, 'temperature_c' => -50, 'medium_conductivity' => 0]), true);
check_row((object) ($valid + ['ph' => 14, 'dissolved_oxygen' => null]), true);
check_row((object) ($valid + ['current_a' => 12.5, 'voltage_v' => 24]), true);
check_row((object) ($valid + ['current_a' => 0, 'voltage_v' => 0]), true);
check_row((object) ($valid + ['current_a' => 300, 'voltage_v' => 200]), true);
check_row([], false);
check_row((object) [], false);
foreach ([
  ['test_point_id', "' OR 1=1--"], ['test_point_id', '<script>alert(1)</script>'],
  ['reading_ts', '2026-10-24T12:00:00'], ['reading_ts', '2026-02-30T12:00:00Z'],
  ['reading_ts', '2026-10-24T25:00:00Z'], ['reading_ts', []],
  ['reading_ts', '2026-10-24T24:00:00Z'], ['reading_ts', '2026-10-24T23:60:00Z'],
  ['reading_ts', '2026-10-24T23:59:60Z'], ['reading_ts', '2026-13-24T12:00:00Z'],
  ['reading_ts', '2026-10-00T12:00:00Z'], ['reading_ts', '2026-02-29T12:00:00Z'],
  ['reading_ts', '2026-10-24T12:00:00+14:30'], ['reading_ts', '2026-10-24T12:00:00+15:00'],
  ['reading_ts', '2026-10-29T12:05:01Z'], ['reading_ts', '2099-01-01T00:00:00Z'],
  ['reading_ts', '1999-12-31T23:59:59Z'],
  ['value_mv', '-850'], ['value_mv', -850.5], ['value_mv', true], ['value_mv', null],
  ['value_mv', 5001], ['value_mv', -5001], ['value_mv', 2147483648],
  ['ph', -0.01], ['ph', 14.01], ['ph', '7'], ['temperature_c', -50.01], ['temperature_c', 150.01],
  ['dissolved_oxygen', -1], ['dissolved_oxygen', 25.01], ['medium_conductivity', INF],
  ['current_a', -0.1], ['current_a', 300.01], ['current_a', '5'], ['voltage_v', -1], ['voltage_v', 200.5],
  ['power_watts', 1], ['records', [$valid]], ['unknown', 'x']
] as [$field, $value]) { check_row((object) array_replace($valid, [$field => $value]), false); }
check_row((object) array_replace($valid, ['value_mv' => -5000]), true);
check_row((object) array_replace($valid, ['value_mv' => 5000]), true);
check_row((object) array_replace($valid, ['reading_ts' => '2024-02-29T23:59:59Z']), true);
check_row((object) array_replace($valid, ['reading_ts' => '2026-10-24T23:59:59.123456+08:00']), true);
check_row((object) array_replace($valid, ['reading_ts' => '2026-10-24T12:00:00+14:00']), true);
check_row((object) array_replace($valid, ['reading_ts' => '2026-10-29T12:05:00Z']), true);
check_row((object) array_replace($valid, ['reading_ts' => '2000-01-01T00:00:00Z']), true);
// Upper-case IDs are accepted and normalised so the scope check matches.
$normalized = cpm_validate_reading((object) array_replace($valid, ['test_point_id' => '0000000A-0000-4000-8000-00000000000B']), $now);
if ($normalized['test_point_id'] !== '0000000a-0000-4000-8000-00000000000b') { throw new RuntimeException('test_point_id not lower-cased'); }
$count++;
echo "$count PHP validation cases passed\n";
