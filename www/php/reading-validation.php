<?php
require_once __DIR__ . '/app-settings.php';

// Shared by POST reading_ts and GET timestamp. Offsets run from -12:00 to +14:00;
// anything past ±14:00 is not a real zone.
const CPM_RFC3339_PATTERN = '/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/D';

// GET field => [stored column, unit]. field is required (client, 4 Nov). potential is the
// only per-test-point value; the rest are batch measurements (reading_batches).
const CPM_READ_FIELDS = [
  'potential'        => ['value_mv', 'mV'],
  'voltage'          => ['voltage_v', 'V'],
  'current'          => ['current_a', 'A'],
  'power'            => ['power_watts', 'W'],
  'temperature'      => ['temperature_c', '°C'],
  'conductivity'     => ['medium_conductivity', 'µS/cm'],
  'ph'               => ['ph', 'pH'],
  'dissolved_oxygen' => ['dissolved_oxygen', 'mg/L'],
];

/**
 * GET /api/v1/readings/ query parameters. Throws InvalidArgumentException with the
 * client-facing message. Returns ['timestamp' => UTC instant with microseconds,
 * 'test_point_id' => lower-case UUID or null, 'field' => key of CPM_READ_FIELDS,
 * 'limit' => page size, 'offset' => rows to skip].
 */
function cpm_validate_read_query($params) {
  $allowed = ['timestamp', 'testPointId', 'field', 'limit', 'offset'];
  if (array_diff(array_keys($params), $allowed)) { throw new InvalidArgumentException('Unexpected query parameter'); }
  $ts = $params['timestamp'] ?? null;
  // An unencoded "+08:00" offset arrives as " 08:00" after query-string decoding.
  if (is_string($ts)) { $ts = preg_replace('/ (\d{2}:\d{2})$/D', '+$1', $ts); }
  if (!is_string($ts) || strlen($ts) > 35 || !preg_match(CPM_RFC3339_PATTERN, $ts)
      || !checkdate((int) substr($ts, 5, 2), (int) substr($ts, 8, 2), (int) substr($ts, 0, 4))
      || substr($ts, 0, 4) === '0000') {
    throw new InvalidArgumentException('Invalid or missing timestamp');
  }
  try { $when = new DateTimeImmutable($ts); } catch (\Throwable $e) { throw new InvalidArgumentException('Invalid or missing timestamp', 0, $e); }
  $testPointId = $params['testPointId'] ?? null;
  if ($testPointId !== null && (!is_string($testPointId) ||
      !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iD', $testPointId))) {
    throw new InvalidArgumentException('Invalid testPointId');
  }
  $field = $params['field'] ?? null;
  if (!is_string($field) || !array_key_exists($field, CPM_READ_FIELDS)) { throw new InvalidArgumentException('Invalid or missing field'); }
  $maxPage = APP_SETTINGS['retrieval']['max_page_size'];
  $limit = $params['limit'] ?? (string) $maxPage;
  if (!is_string($limit) || !preg_match('/^[1-9]\d{0,3}$/D', $limit) || (int) $limit > $maxPage) {
    throw new InvalidArgumentException("Invalid limit (1 to $maxPage)");
  }
  $offset = $params['offset'] ?? '0';
  if (!is_string($offset) || !preg_match('/^(?:0|[1-9]\d{0,6})$/D', $offset)) { throw new InvalidArgumentException('Invalid offset'); }
  return [
    'timestamp' => $when->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.u\Z'),
    'test_point_id' => $testPointId === null ? null : strtolower($testPointId),
    'field' => $field,
    'limit' => (int) $limit,
    'offset' => (int) $offset,
  ];
}

/** Stored timestamptz => ISO 8601 UTC with "Z"; fractional seconds only when non-zero. */
function cpm_format_read_timestamp($stored) {
  $utc = (new DateTimeImmutable($stored))->setTimezone(new DateTimeZone('UTC'));
  $micro = rtrim($utc->format('u'), '0');
  return $utc->format('Y-m-d\TH:i:s') . ($micro === '' ? '' : ".$micro") . 'Z';
}

/**
 * API v1 deliberately supports one record, not a partially committed batch.
 * Limits come from APP_SETTINGS['ingestion']; ingest_reading_v1 repeats them in SQL.
 * Returns the row with test_point_id lower-cased.
 */
function cpm_validate_reading($input, $now = null) {
  $settings = APP_SETTINGS['ingestion'];
  if (!is_object($input)) { throw new InvalidArgumentException('Expected a JSON object'); }
  $row = get_object_vars($input);
  $allowed = ['test_point_id', 'reading_ts', 'value_mv', 'temperature_c', 'medium_conductivity', 'ph', 'dissolved_oxygen', 'current_a', 'voltage_v'];
  if (array_diff(array_keys($row), $allowed)) { throw new InvalidArgumentException('Unexpected field'); }
  if (!isset($row['test_point_id']) || !is_string($row['test_point_id']) ||
      !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iD', $row['test_point_id'])) {
    throw new InvalidArgumentException('Invalid test_point_id');
  }
  $row['test_point_id'] = strtolower($row['test_point_id']);
  $ts = $row['reading_ts'] ?? null;
  if (!is_string($ts) || strlen($ts) > 35 || !preg_match(CPM_RFC3339_PATTERN, $ts)) {
    throw new InvalidArgumentException('reading_ts requires an RFC3339 timezone');
  }
  // Reject impossible calendar dates before PHP can normalize or throw on them.
  if (!checkdate((int) substr($ts, 5, 2), (int) substr($ts, 8, 2), (int) substr($ts, 0, 4))) {
    throw new InvalidArgumentException('Invalid reading_ts');
  }
  try { $when = new DateTimeImmutable($ts); } catch (\Throwable $e) { throw new InvalidArgumentException('Invalid reading_ts', 0, $e); }
  $errors = DateTimeImmutable::getLastErrors();
  if (($errors && ($errors['warning_count'] || $errors['error_count'])) || substr($ts, 0, 4) === '0000') {
    throw new InvalidArgumentException('Invalid reading_ts');
  }
  $nowTs = $now ?? time();
  if ($when->getTimestamp() > $nowTs + $settings['max_future_seconds']) {
    throw new InvalidArgumentException('reading_ts is in the future');
  }
  if ($when < new DateTimeImmutable($settings['earliest_reading_ts'])) {
    throw new InvalidArgumentException('reading_ts is too old');
  }
  [$mvMin, $mvMax] = $settings['ranges']['value_mv'];
  if (!isset($row['value_mv']) || !is_int($row['value_mv']) || $row['value_mv'] < $mvMin || $row['value_mv'] > $mvMax) {
    throw new InvalidArgumentException("value_mv must be an integer from $mvMin to $mvMax");
  }
  foreach ($settings['ranges'] as $key => $range) {
    if ($key === 'value_mv' || !array_key_exists($key, $row) || $row[$key] === null) { continue; }
    $value = $row[$key];
    if ((!is_int($value) && !is_float($value)) || !is_finite((float) $value) || $value < $range[0] || $value > $range[1]) {
      throw new InvalidArgumentException("Invalid $key (allowed {$range[0]} to {$range[1]})");
    }
  }
  return $row;
}
