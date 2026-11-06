<?php
// Public page: opened from the password reset email. It deliberately does NOT
// redirect signed-in users, so the link works even if a session exists.
require __DIR__ . '/php/session-guard.php';
?>
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="referrer" content="no-referrer">
  <title>Reset Password | Corrosion Protection</title>
  <link rel="icon" type="image/png" href="<?php echo asset_v('img/application logo.png'); ?>">
  <link rel="stylesheet" href="<?php echo asset_v('css/style.css'); ?>">
  <script src="https://kit.fontawesome.com/b68c73c6bb.js" crossorigin="anonymous"></script>
</head>

<body class="login-body">
  <main class="login-wrapper">
    <section class="login-header">
      <img src="assets/brand/newcastle-logo.svg" alt="Newcastle University" class="login-brand-logo">
      <h1>Corrosion Protection Monitoring System</h1>
      <p>Advanced monitoring and management for corrosion engineers</p>
    </section>

    <section class="login-card" id="resetPasswordCard" aria-live="polite">
      <div data-reset-state="checking">
        <h2>Reset Password</h2>
        <p class="muted"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Checking your reset link…</p>
      </div>

      <form id="resetPasswordForm" data-reset-state="form" novalidate hidden>
        <h2>Choose a New Password</h2>
        <p class="muted">Use at least 8 characters. You'll be asked to sign in again afterwards.</p>
        <label for="resetNewPassword">New password</label>
        <div class="input-icon">
          <i class="fa-solid fa-lock" aria-hidden="true"></i>
          <input id="resetNewPassword" type="password" minlength="8" autocomplete="new-password" required>
        </div>
        <label for="resetConfirmPassword">Confirm new password</label>
        <div class="input-icon">
          <i class="fa-solid fa-lock" aria-hidden="true"></i>
          <input id="resetConfirmPassword" type="password" minlength="8" autocomplete="new-password" required>
        </div>
        <label class="checkbox auth-show-password" for="resetShowPassword"><input type="checkbox" id="resetShowPassword"> Show passwords</label>
        <p class="auth-form-status" id="resetPasswordStatus" role="status" aria-live="polite"></p>
        <button class="btn btn-green full" id="resetPasswordButton" type="submit">
          <i class="fa-solid fa-key" aria-hidden="true"></i>
          <span>Update Password</span>
        </button>
      </form>

      <div data-reset-state="expired" hidden>
        <h2>Link Expired</h2>
        <p class="auth-state-message"><i class="fa-solid fa-clock" aria-hidden="true"></i> This password reset link has expired. Reset links can only be used for a limited time.</p>
        <a class="btn btn-green full" href="forgot-password.php"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Request a New Link</a>
      </div>

      <div data-reset-state="invalid" hidden>
        <h2>Invalid Link</h2>
        <p class="auth-state-message"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> This password reset link is invalid or has already been used. Open the latest link from your email, or request a new one.</p>
        <a class="btn btn-green full" href="forgot-password.php"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Request a New Link</a>
      </div>

      <p class="auth-back-link"><a href="index.php"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Back to sign in</a></p>
    </section>
  </main>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="<?php echo asset_v('js/auth-storage.js'); ?>"></script>
  <script src="<?php echo asset_v('js/password-flows.js'); ?>"></script>
  <!-- Must run before supabaseClient.js: captures the link before supabase-js reads and clears it. -->
  <script src="<?php echo asset_v('js/reset-password-bootstrap.js'); ?>"></script>
  <script src="<?php echo asset_v('js/config/supabase-config.js'); ?>"></script>
  <script src="<?php echo asset_v('js/config/app-settings.js'); ?>"></script>
  <script src="<?php echo asset_v('js/supabaseClient.js'); ?>"></script>
  <script src="<?php echo asset_v('js/toast.js'); ?>"></script>
  <script src="<?php echo asset_v('js/reset-password.js'); ?>"></script>
</body>

</html>
