<?php
/**
 * Session bootstrap (#48): the one place that configures PHP sessions.
 * Included by session-guard.php before the session starts.
 *
 * Values are provisional (D-SESS-1) and live here until Alex's central
 * config (#135) exists; then they move to php/app-settings.php.
 */

require_once __DIR__ . '/security-headers.php';

const CPM_SESSION_NAME               = 'CPMSESSID';
const CPM_IDLE_TIMEOUT               = 30 * 60;        // 30 min without a request
const CPM_ABSOLUTE_TIMEOUT           = 12 * 3600;      // Remember Me off: 12 h
const CPM_REMEMBER_ABSOLUTE_TIMEOUT  = 14 * 86400;     // Remember Me on: 14 days
const CPM_ID_ROTATE_INTERVAL         = 15 * 60;        // new session ID every 15 min
const CPM_REVALIDATE_INTERVAL        = 5 * 60;         // re-check token + profile every 5 min
const CPM_REVALIDATE_GRACE           = 15 * 60;        // keep working this long if Supabase is unreachable

function cpm_is_https() {
  return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (getenv('CPM_TRUST_TLS_PROXY') === '1' && (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'));
}

/** Cookie settings shared by every place that (re)issues the session cookie. */
function cpm_cookie_params($lifetime = 0) {
  return [
    'lifetime' => $lifetime,         // 0 = browser-session cookie; Remember Me passes a positive value
    'path'     => '/',
    'domain'   => '',
    'secure'   => cpm_is_https(),
    'httponly' => true,
    'samesite' => 'Lax',
  ];
}

/** Starts the session with hardened settings. Safe to call more than once. */
function cpm_session_start() {
  if (session_status() !== PHP_SESSION_NONE) {
    return;
  }

  ini_set('session.use_strict_mode', '1');   // refuse session IDs the server didn't issue
  ini_set('session.use_only_cookies', '1');  // never accept an ID from the URL
  ini_set('session.use_trans_sid', '0');
  // Keep session files long enough for the longest allowed session. The
  // idle/absolute limits themselves are enforced in session-guard.php.
  ini_set('session.gc_maxlifetime', (string) (CPM_REMEMBER_ABSOLUTE_TIMEOUT + 3600));

  session_name(CPM_SESSION_NAME);
  session_set_cookie_params(cpm_cookie_params());
  session_start();
}
