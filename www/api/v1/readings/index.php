<?php
require_once __DIR__ . '/../../../php/security-headers.php';
require_once __DIR__ . '/../../../php/supabase-http.php';
require_once __DIR__ . '/../../../php/reading-validation.php';

// Correlates the client's response with the server log line (no token or payload logged).
$requestId = bin2hex(random_bytes(8));
header('X-Request-Id: ' . $requestId);

function api_reply($status, $error, $id = null) {
  global $requestId;
  http_response_code($status);
  header('Content-Type: application/json');
  header('Cache-Control: no-store');
  // No token, reading values, raw errors, or personal identifiers in the audit event.
  error_log(json_encode(['event' => 'readings_api', 'request_id' => $requestId, 'status' => $status, 'outcome' => $error ?: 'created']));
  echo json_encode($error ? ['ok' => false, 'error' => $error] : ['ok' => true, 'reading_id' => $id]);
  exit;
}

/** Apache CGI/FPM and some rewrites hide Authorization from $_SERVER['HTTP_AUTHORIZATION']. */
function api_authorization_header() {
  foreach (['HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION'] as $key) {
    if (!empty($_SERVER[$key])) { return $_SERVER[$key]; }
  }
  if (function_exists('getallheaders')) {
    foreach (getallheaders() as $name => $value) {
      if (strcasecmp($name, 'Authorization') === 0) { return $value; }
    }
  }
  return '';
}

/** user id => lower-cased test point ids, or null when the server config is unusable. */
function api_ingestion_scopes() {
  $scopes = json_decode(getenv('CPM_INGESTION_SCOPES') ?: '', true);
  if (!is_array($scopes) || !$scopes) { return null; }
  $normalized = [];
  foreach ($scopes as $userId => $points) {
    if (!is_string($userId) || !is_array($points)) { return null; }
    $normalized[strtolower($userId)] = array_map(fn($point) => is_string($point) ? strtolower($point) : '', $points);
  }
  return $normalized;
}

/** GET replies use the client's {"message": ...} error shape; POST keeps {"ok": false, "error": ...}. */
function api_read_reply($status, $body, $outcome) {
  global $requestId;
  http_response_code($status);
  header('Content-Type: application/json');
  header('Cache-Control: no-store');
  // Same audit line as POST: no token, query values or reading values.
  error_log(json_encode(['event' => 'readings_api', 'method' => 'GET', 'request_id' => $requestId, 'status' => $status, 'outcome' => $outcome]));
  echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  exit;
}

function api_read_error($status, $message) { api_read_reply($status, ['message' => $message], $message); }

/**
 * Read-only retrieval (docs/week9/readings-api.md, "GET retrieval"): exact-instant match on
 * reading_batches.reading_ts, always a JSON array. Uses the caller's token, so RLS decides
 * what is visible; never calls ingest_reading_v1 or any other RPC.
 */
function api_handle_read() {
  if (getenv('CPM_READINGS_READ_ENABLED') !== '1') { api_read_error(503, 'Readings retrieval is disabled'); }
  if (empty($_SERVER['HTTPS']) || $_SERVER['HTTPS'] === 'off') { api_read_error(403, 'HTTPS required'); }
  if (!preg_match('/^Bearer ([A-Za-z0-9_.-]{1,4096})$/D', api_authorization_header(), $matches)) { api_read_error(401, 'Invalid or missing token'); }
  $token = $matches[1];
  try { $query = cpm_validate_read_query($_GET); } catch (InvalidArgumentException $e) { api_read_error(400, $e->getMessage()); }
  try {
    [$user, $err, $code] = cpm_supabase_get('/auth/v1/user', $token);
    if ($code === 0 || $code >= 500) { api_read_error(503, 'Service unavailable'); }
    if ($err || empty($user['id'])) { api_read_error(401, 'Invalid or missing token'); }
    // Same account rule as ingest_reading_v1: active admin or corrosion engineer (own profile is readable under RLS).
    [$profile, $err, $code] = cpm_supabase_get('/rest/v1/users?select=role,is_active&id=eq.' . rawurlencode($user['id']), $token);
    if ($code === 0 || $code >= 500) { api_read_error(503, 'Service unavailable'); }
    if ($code === 401) { api_read_error(401, 'Invalid or missing token'); }
    $account = is_array($profile) ? ($profile[0] ?? null) : null;
    if ($err || !is_array($account) || ($account['is_active'] ?? null) !== true ||
        !in_array($account['role'] ?? null, ['admin', 'corrosion_engineer'], true)) {
      api_read_error(403, 'Read denied');
    }
    [$column, $unit] = CPM_READ_FIELDS[$query['field']];
    $path = '/rest/v1/test_point_readings?select=id,test_point_id,value_mv,reading_batches!inner(reading_ts'
      . ($column === 'value_mv' ? '' : ",$column") . ')'
      . '&reading_batches.reading_ts=eq.' . rawurlencode($query['timestamp'])
      . ($query['test_point_id'] === null ? '' : '&test_point_id=eq.' . $query['test_point_id'])
      // A batch measurement that was never recorded is no reading, not a zero.
      . ($column === 'value_mv' ? '' : "&reading_batches.$column=not.is.null")
      // One extra row tells us whether another page exists.
      . '&order=test_point_id.asc,id.asc&limit=' . ($query['limit'] + 1) . '&offset=' . $query['offset'];
    [$rows, $err, $code] = cpm_supabase_get($path, $token);
    if ($code === 0 || $code >= 500) { api_read_error(503, 'Service unavailable'); }
    if ($code === 401) { api_read_error(401, 'Invalid or missing token'); }
    if ($err || !is_array($rows)) { api_read_error(500, 'Retrieval failed'); }
    if (count($rows) > $query['limit']) {
      array_pop($rows);
      // Fixed path per entry point, never the raw request URI, so nothing client-supplied reaches the header.
      $next = (defined('CPM_READINGS_GET_ONLY') ? '/api/readings' : '/api/v1/readings/') . '?' . http_build_query(array_filter([
        'timestamp' => $query['timestamp'], 'testPointId' => $query['test_point_id'], 'field' => $query['field'],
        'limit' => $query['limit'], 'offset' => $query['offset'] + $query['limit'],
      ], fn($value) => $value !== null), '', '&', PHP_QUERY_RFC3986);
      header('Link: <' . $next . '>; rel="next"');
    }
    $items = [];
    foreach ($rows as $row) {
      $value = $column === 'value_mv' ? ($row['value_mv'] ?? null) : ($row['reading_batches'][$column] ?? null);
      if (is_string($value) && is_numeric($value)) { $value = $value + 0; }
      if (!is_int($value) && !is_float($value)) { throw new UnexpectedValueException('Non-numeric stored value'); }
      $items[] = ['timestamp' => cpm_format_read_timestamp($row['reading_batches']['reading_ts']), 'value' => $value,
        'testPointId' => $row['test_point_id'], 'field' => $query['field'], 'unit' => $unit];
    }
    api_read_reply(200, $items, $items ? 'ok' : 'no_match');
  } catch (Throwable $e) { api_read_error(500, 'Internal error'); }
}

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method === 'GET') { api_handle_read(); }
// The /api/readings alias (www/api/readings.php) is retrieval only; ingestion stays on /api/v1/readings/.
if (defined('CPM_READINGS_GET_ONLY')) { header('Allow: GET'); api_read_error(405, 'Method not allowed'); }
if ($method !== 'POST') { header('Allow: GET, POST'); api_reply(405, 'method_not_allowed'); }
if (getenv('CPM_INGESTION_ENABLED') !== '1') { api_reply(503, 'ingestion_disabled'); }
$scopes = api_ingestion_scopes();
if ($scopes === null) { api_reply(503, 'ingestion_misconfigured'); }
// The trusted TLS terminator must set HTTPS=on; do not trust client forwarded headers.
if (empty($_SERVER['HTTPS']) || $_SERVER['HTTPS'] === 'off') { api_reply(403, 'https_required'); }
if (!preg_match('/^application\/json(?:\s*;\s*charset=utf-8)?$/iD', $_SERVER['CONTENT_TYPE'] ?? '')) { api_reply(415, 'json_required'); }
if (!preg_match('/^Bearer ([A-Za-z0-9_.-]{1,4096})$/D', api_authorization_header(), $matches)) { api_reply(401, 'invalid_token'); }
$token = $matches[1];
if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 16384) { api_reply(413, 'payload_too_large'); }
$raw = file_get_contents('php://input', false, null, 0, 16385);
if ($raw === false || strlen($raw) > 16384) { api_reply(413, 'payload_too_large'); }
$input = json_decode($raw);
if (json_last_error() !== JSON_ERROR_NONE) { api_reply(400, 'invalid_json'); }
try { $row = cpm_validate_reading($input); } catch (InvalidArgumentException $e) { api_reply(422, $e->getMessage()); }
try {
  [$user, $err, $code] = cpm_supabase_get('/auth/v1/user', $token);
  if ($code === 0 || $code >= 500) { api_reply(503, 'service_unavailable'); }
  if ($err || empty($user['id'])) { api_reply(401, 'invalid_token'); }
  // Explicit machine-account scope in server environment; no wildcard.
  $scope = $scopes[strtolower($user['id'])] ?? [];
  if (!in_array($row['test_point_id'], $scope, true)) { api_reply(403, 'scope_denied'); }
  $ch = curl_init(SUPABASE_URL . '/rest/v1/rpc/ingest_reading_v1');
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode(['p_reading' => $row]), CURLOPT_TIMEOUT => 20,
    CURLOPT_HTTPHEADER => ['apikey: ' . SUPABASE_PUBLISHABLE_KEY, 'Authorization: Bearer ' . $token, 'Content-Type: application/json']]);
  $body = curl_exec($ch);
  $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  $result = json_decode($body ?: '', true);
  if ($status >= 200 && $status < 300 && is_string($result)) { api_reply(201, null, $result); }
  $dbCode = is_array($result) ? ($result['code'] ?? '') : '';
  if ($dbCode === '23505') { api_reply(409, 'duplicate_reading'); }
  if ($dbCode === '42501') { api_reply(403, 'write_denied'); }
  if ($dbCode === '22023' || $dbCode === '23514' || $dbCode === '22003' || $dbCode === '22007' || $dbCode === '22008') { api_reply(422, 'invalid_reading'); }
  if ($dbCode === 'P0429') { header('Retry-After: 60'); api_reply(429, 'rate_limited'); }
  api_reply($status === 0 || $status >= 500 ? 503 : 500, 'ingestion_failed');
} catch (Throwable $e) { api_reply(500, 'internal_error'); }
