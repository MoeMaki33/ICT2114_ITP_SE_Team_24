<?php
require __DIR__ . '/php/session-guard.php';
if (current_user_id()) {
  header('Location: dashboard.php');
  exit;
}
?>
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Forgot Password | Corrosion Protection</title>
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

    <section class="login-card">
      <h2>Forgot Password</h2>
      <p class="muted">Enter the email you sign in with and we'll send you a link to choose a new password.</p>
      <form id="forgotPasswordForm" novalidate>
        <label for="recoveryEmail">Email</label>
        <div class="input-icon">
          <i class="fa-regular fa-envelope" aria-hidden="true"></i>
          <input id="recoveryEmail" name="email" type="email" autocomplete="email" placeholder="engineer@example.com" required>
        </div>
        <p class="auth-form-status" id="forgotPasswordStatus" role="status" aria-live="polite"></p>
        <button class="btn btn-green full" id="sendResetLink" type="submit">
          <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
          <span>Send Reset Link</span>
        </button>
      </form>
      <p class="auth-back-link"><a href="index.php"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Back to sign in</a></p>
    </section>
  </main>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="<?php echo asset_v('js/auth-storage.js'); ?>"></script>
  <script src="<?php echo asset_v('js/config/supabase-config.js'); ?>"></script>
  <script src="<?php echo asset_v('js/config/app-settings.js'); ?>"></script>
  <script src="<?php echo asset_v('js/supabaseClient.js'); ?>"></script>
  <script src="<?php echo asset_v('js/toast.js'); ?>"></script>
  <script src="<?php echo asset_v('js/password-flows.js'); ?>"></script>
  <script src="<?php echo asset_v('js/forgot-password.js'); ?>"></script>
</body>

</html>
