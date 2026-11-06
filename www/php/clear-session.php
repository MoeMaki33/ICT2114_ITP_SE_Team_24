<?php
/**
 * Called by js/common.js (sign-out, expiry) and js/reset-password.js so the
 * server-side session is destroyed at the same time the client session is.
 */

require __DIR__ . '/session-guard.php';

cpm_require_trusted_post();
cpm_destroy_session();
cpm_respond(200, ['ok' => true]);
