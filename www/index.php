<?php
require __DIR__ . '/php/session-guard.php';
// ?signin=tab: a new tab without a Supabase session (Remember Me off, #47)
// must be able to show the form even though the PHP session is valid.
if (current_user_id() && !isset($_GET['signin'])) {
  header('Location: dashboard.php');
  exit;
}
?>
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login | Corrosion Protection</title>
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
      <h2>Sign In</h2>
      <p class="muted">Enter your credentials to access the dashboard</p>
      <p class="auth-form-status" id="loginNotice" role="status" aria-live="polite"></p>
      <label>Email</label>
      <div class="input-icon">
        <i class="fa-regular fa-envelope" aria-hidden="true"></i>
        <input id="email" type="email" placeholder="engineer@example.com">
      </div>
      <label>Password</label>
      <div class="input-icon">
        <i class="fa-solid fa-lock" aria-hidden="true"></i>
        <input id="password" type="password" placeholder="Password">
      </div>
      <div class="login-options">
        <label class="checkbox" for="rememberMe"><input type="checkbox" id="rememberMe" name="rememberMe"> Remember me</label>
        <a href="forgot-password.php">Forgot password?</a>
      </div>
      <button class="btn btn-green full" id="loginButton" type="button">
        <i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i>
        Sign In
      </button>
    </section>
  </main>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="<?php echo asset_v('js/auth-storage.js'); ?>"></script>
  <script src="<?php echo asset_v('js/config/supabase-config.js'); ?>"></script>
  <script src="<?php echo asset_v('js/config/app-settings.js'); ?>"></script>
  <script src="<?php echo asset_v('js/supabaseClient.js'); ?>"></script>
  <script src="<?php echo asset_v('js/app-preferences.js'); ?>"></script>
  <script src="<?php echo asset_v('js/login.js'); ?>"></script>
</body>

</html>
