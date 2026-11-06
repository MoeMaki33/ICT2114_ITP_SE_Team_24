<?php
// Test-only router, outside DocumentRoot. Never deployed with the application.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path === '/index.php' || $path === '/php/set-session.php' || $path === '/php/clear-session.php') {
  require __DIR__ . '/../../www' . $path;
  return;
}
if ($path !== '/insecure') { $_SERVER['HTTPS'] = 'on'; }
if ($path === '/disabled') { putenv('CPM_INGESTION_ENABLED=0'); }
if ($path === '/misconfigured') { putenv('CPM_INGESTION_SCOPES=not-json'); }
if ($path === '/read-disabled') { putenv('CPM_READINGS_READ_ENABLED=0'); }
// The /api/readings alias (www/.htaccess rewrites it to www/api/readings.php on Apache).
if (in_array($path, ['/api/readings', '/api/readings/', '/api/readings.php'], true)) { require __DIR__ . '/../../www/api/readings.php'; return; }
require __DIR__ . '/../../www/api/v1/readings/index.php';
