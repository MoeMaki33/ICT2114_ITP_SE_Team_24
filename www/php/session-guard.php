<?php
/**
 * Server-side auth gate (#48 hardened).
 *
 * Include as the very first line of every protected .php page:
 *
 *     <?php require __DIR__ . '/php/session-guard.php'; require_login(); ?>
 *
 * For admin-only pages, also call require_role('admin').
 *
 * Enforced here: idle timeout, absolute timeout (Remember Me aware),
 * session-ID rotation, and periodic re-validation of the Supabase token and
 * the user's profile (deactivation / role change take effect within minutes).
 */

require_once __DIR__ . '/asset-version.php';
require_once __DIR__ . '/session-bootstrap.php';
require_once __DIR__ . '/supabase-http.php';

cpm_session_start();

function cpm_respond($status, $payload) {
  http_response_code($status);
  header('Content-Type: application/json');
  header('Cache-Control: no-store');
  echo json_encode($payload);
  exit;
}

/** Why the current session is no longer valid, or null if it still is. */
function cpm_session_expiry_reason($now) {
  if (empty($_SESSION['user_id']) || empty($_SESSION['created_at']) || empty($_SESSION['last_activity'])) {
    return 'invalid';
  }
  $limit = !empty($_SESSION['remember']) ? CPM_REMEMBER_ABSOLUTE_TIMEOUT : CPM_ABSOLUTE_TIMEOUT;
  if ($now - (int) $_SESSION['created_at'] > $limit) {
    return 'absolute';
  }
  if ($now - (int) $_SESSION['last_activity'] > CPM_IDLE_TIMEOUT) {
    return 'idle';
  }
  return null;
}

function current_user_id() {
  // An expired session must not count as logged in (index.php relies on this).
  if (cpm_session_expiry_reason(time()) !== null) {
    return null;
  }
  return $_SESSION['user_id'] ?? null;
}

function current_user_role() {
  return current_user_id() ? ($_SESSION['role'] ?? null) : null;
}

function cpm_destroy_session() {
  $_SESSION = [];
  if (session_status() === PHP_SESSION_ACTIVE) {
    if (ini_get('session.use_cookies')) {
      $p = cpm_cookie_params();
      setcookie(session_name(), '', [
        'expires'  => time() - 42000,
        'path'     => $p['path'],
        'domain'   => $p['domain'],
        'secure'   => $p['secure'],
        'httponly' => $p['httponly'],
        'samesite' => $p['samesite'],
      ]);
    }
    session_destroy();
  }
}

/**
 * Re-checks the stored token and the profile with Supabase.
 * Unreachable Supabase is tolerated for CPM_REVALIDATE_GRACE.
 */
function cpm_revalidate_user($now) {
  $token = $_SESSION['access_token'] ?? '';
  $withinGrace = ($now - (int) ($_SESSION['validated_at'] ?? 0)) <= CPM_REVALIDATE_GRACE;
  if ($token === '') {
    return false;
  }

  [$user, $err, $code] = cpm_supabase_get('/auth/v1/user', $token);
  if ($code === 0) {
    return $withinGrace;
  }
  if ($err || empty($user['id']) || $user['id'] !== $_SESSION['user_id']) {
    return false;
  }

  $query = '/rest/v1/users?id=eq.' . rawurlencode($user['id']) . '&select=role,full_name,is_active';
  [$rows, $err, $code] = cpm_supabase_get($query, $token);
  if ($code === 0) {
    return $withinGrace;
  }
  if ($err || !is_array($rows) || count($rows) === 0 || empty($rows[0]['is_active'])) {
    return false;
  }

  $_SESSION['role'] = $rows[0]['role'];
  $_SESSION['full_name'] = $rows[0]['full_name'];
  $_SESSION['validated_at'] = $now;
  return true;
}

/** Ends the session and answers: 401 JSON for fetch callers, redirect for pages. */
function cpm_deny($expired) {
  cpm_destroy_session();
  $wantsJson = !empty($_SERVER['HTTP_X_CPM_REQUEST'])
    || strpos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') !== false;
  if ($wantsJson) {
    cpm_respond(401, ['ok' => false, 'error' => $expired ? 'Session expired' : 'Not signed in']);
  }
  header('Location: index.php' . ($expired ? '?expired=1' : ''));
  exit;
}

/**
 * Re-issues the session ID. The cookie lifetime of an active session cannot be
 * changed, so close, set the params, reopen, then regenerate.
 */
function cpm_rotate_session_id() {
  $remember = !empty($_SESSION['remember']);
  session_write_close();
  session_set_cookie_params(cpm_cookie_params($remember ? CPM_REMEMBER_ABSOLUTE_TIMEOUT : 0));
  session_start();
  session_regenerate_id(true);
}

function require_login() {
  if (empty($_SESSION['user_id'])) {
    cpm_deny(false);
  }

  $now = time();
  if (cpm_session_expiry_reason($now) !== null) {
    cpm_deny(true);
  }

  if ($now - (int) ($_SESSION['rotated_at'] ?? 0) >= CPM_ID_ROTATE_INTERVAL) {
    cpm_rotate_session_id();
    $_SESSION['rotated_at'] = $now;
  }

  if ($now - (int) ($_SESSION['validated_at'] ?? 0) >= CPM_REVALIDATE_INTERVAL) {
    if (!cpm_revalidate_user($now)) {
      cpm_deny(true);
    }
  }

  $_SESSION['last_activity'] = $now;
}

function require_role($role) {
  require_login();
  if (($_SESSION['role'] ?? null) !== $role) {
    header('Location: dashboard.php');
    exit;
  }
}

/**
 * CSRF defence for the session endpoints: POST only, same-origin, and a custom
 * header that a cross-site page cannot send without a CORS preflight (we never
 * send CORS headers).
 */
function cpm_require_trusted_post() {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    cpm_respond(405, ['ok' => false, 'error' => 'Method not allowed']);
  }
  if (($_SERVER['HTTP_X_CPM_REQUEST'] ?? '') !== '1') {
    cpm_respond(403, ['ok' => false, 'error' => 'Forbidden']);
  }
  $site = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? '';
  if ($site !== '' && $site !== 'same-origin') {
    cpm_respond(403, ['ok' => false, 'error' => 'Forbidden']);
  }
  $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
  if ($origin !== '') {
    $parts = parse_url($origin);
    $originHost = ($parts['host'] ?? '') . (isset($parts['port']) ? ':' . $parts['port'] : '');
    if ($originHost === '' || strcasecmp($originHost, $_SERVER['HTTP_HOST'] ?? '') !== 0) {
      cpm_respond(403, ['ok' => false, 'error' => 'Forbidden']);
    }
  }
}
