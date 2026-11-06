<?php
/**
 * Creates or refreshes the PHP session from a Supabase access token.
 *
 *   mode "login"   (js/login.js, right after Supabase sign-in)
 *                  verifies the token, loads the profile, starts a new session.
 *   mode "refresh" (js/common.js, on Supabase TOKEN_REFRESHED)
 *                  keeps the stored token fresh; never extends idle time.
 *
 * The browser's "remember" flag is only a preference: the lifetimes are
 * decided and capped by the constants in session-bootstrap.php.
 */

require __DIR__ . '/session-guard.php';

cpm_require_trusted_post();

$raw = file_get_contents('php://input', false, null, 0, 16385);
if ($raw === false || strlen($raw) > 16384) {
  cpm_respond(413, ['ok' => false, 'error' => 'Payload too large']);
}
$input = json_decode($raw ?: '', true);
$mode = is_array($input) ? ($input['mode'] ?? '') : '';
$accessToken = is_array($input) ? ($input['access_token'] ?? '') : '';

if (!in_array($mode, ['login', 'refresh'], true)
    || array_diff(array_keys($input), ['mode', 'access_token', 'remember'])
    || (isset($input['remember']) && !is_bool($input['remember']))
    || !is_string($accessToken) || $accessToken === '' || strlen($accessToken) > 4096) {
  cpm_respond(400, ['ok' => false, 'error' => 'Invalid request']);
}

// 1. Verify the token and find out who the user is.
[$user, $err, $code] = cpm_supabase_get('/auth/v1/user', $accessToken);
if ($code === 0) {
  cpm_respond(503, ['ok' => false, 'error' => 'Service unavailable']);
}
if ($err || empty($user['id'])) {
  if ($mode === 'refresh') { cpm_destroy_session(); }
  cpm_respond(401, ['ok' => false, 'error' => 'Invalid session']);
}
$userId = $user['id'];

// 2. Load the profile row (RLS restricts this to the user's own row).
$query = '/rest/v1/users?id=eq.' . rawurlencode($userId) . '&select=role,full_name,is_active';
[$rows, $err, $code] = cpm_supabase_get($query, $accessToken);
if ($code === 0) {
  cpm_respond(503, ['ok' => false, 'error' => 'Service unavailable']);
}
if ($err || !is_array($rows) || count($rows) === 0 || empty($rows[0]['is_active'])) {
  if ($mode === 'refresh') { cpm_destroy_session(); }
  cpm_respond(403, ['ok' => false, 'error' => 'Account not available']);
}
$profile = $rows[0];
$now = time();

if ($mode === 'login') {
  $remember = filter_var($input['remember'] ?? false, FILTER_VALIDATE_BOOLEAN);

  // New session ID with the right cookie lifetime (params can't change while active).
  session_write_close();
  session_set_cookie_params(cpm_cookie_params($remember ? CPM_REMEMBER_ABSOLUTE_TIMEOUT : 0));
  session_start();
  session_regenerate_id(true);

  $_SESSION = [
    'user_id'       => $userId,
    'role'          => $profile['role'],
    'full_name'     => $profile['full_name'],
    'remember'      => $remember,
    'access_token'  => $accessToken,
    'created_at'    => $now,
    'last_activity' => $now,
    'rotated_at'    => $now,
    'validated_at'  => $now,
  ];
  cpm_respond(200, ['ok' => true, 'role' => $profile['role'], 'full_name' => $profile['full_name']]);
}

// mode === 'refresh'
if (cpm_session_expiry_reason($now) !== null || $_SESSION['user_id'] !== $userId) {
  cpm_destroy_session();
  cpm_respond(401, ['ok' => false, 'error' => 'Session expired']);
}
$_SESSION['access_token'] = $accessToken;
$_SESSION['role'] = $profile['role'];
$_SESSION['full_name'] = $profile['full_name'];
$_SESSION['validated_at'] = $now;   // deliberately NOT last_activity
cpm_respond(200, ['ok' => true]);
