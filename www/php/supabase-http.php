<?php
/**
 * Minimal server-to-server GET against Supabase using the caller's own
 * access token (publishable key only; no secret keys).
 *
 * Returns [decodedBody|null, errorMessage|null, httpCode].
 * httpCode 0 means Supabase could not be reached at all.
 */

require_once __DIR__ . '/config.php';

function cpm_supabase_get($path, $accessToken) {
  $ch = curl_init(SUPABASE_URL . $path);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
      'apikey: ' . SUPABASE_PUBLISHABLE_KEY,
      'Authorization: Bearer ' . $accessToken,
      'Accept: application/json',
    ],
    CURLOPT_TIMEOUT => 10,
  ]);
  $body = curl_exec($ch);
  $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $err = curl_error($ch);
  curl_close($ch);

  if ($body === false) {
    return [null, $err ?: 'Request to Supabase failed', 0];
  }
  $decoded = json_decode($body, true);
  if ($httpCode < 200 || $httpCode >= 300) {
    return [null, is_array($decoded) ? ($decoded['message'] ?? $body) : $body, $httpCode];
  }
  return [$decoded, null, $httpCode];
}
