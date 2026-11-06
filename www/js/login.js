async function login() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();

  if (!email || !password) {
    alert('Please enter email and password');
    return;
  }

  if (!window.appSupabase || !window.isSupabaseConfigured()) {
    alert('Supabase is not configured yet. Add your project URL and anon public key in js/supabaseClient.js.');
    return;
  }

  // Remember Me (#47): record the preference BEFORE signing in, so the
  // session Supabase stores is governed by the right policy from the start.
  const remember = Boolean(document.getElementById('rememberMe')?.checked);
  window.AppAuthStorage?.beginSession?.(remember);

  const { error } = await window.appSupabase.auth.signInWithPassword({ email, password });

  if (error) {
    alert(error.message);
    return;
  }

  const { data: { session } } = await window.appSupabase.auth.getSession();

  // Hand the access token to the server so it can verify it directly with
  // Supabase and start a PHP session. Every .php page checks that server
  // session before rendering, instead of trusting the browser alone.
  let sessionResult;
  try {
    const response = await fetch('php/set-session.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CPM-Request': '1' },
      // `remember` is only a preference: set-session.php decides the actual
      // PHP cookie lifetime and caps it (#48).
      body: JSON.stringify({ mode: 'login', access_token: session?.access_token, remember }),
    });
    sessionResult = await response.json();
  } catch (networkError) {
    await window.appSupabase.auth.signOut({ scope: 'local' });
    alert('Could not reach the server to complete sign-in.');
    return;
  }

  if (!sessionResult?.ok) {
    await window.appSupabase.auth.signOut({ scope: 'local' });
    alert(sessionResult?.error || 'Could not load user profile');
    return;
  }

  localStorage.setItem('userRole', sessionResult.role);
  localStorage.setItem('userFullName', sessionResult.full_name || '');
  localStorage.setItem('userInitials', (sessionResult.full_name || email).slice(0, 2).toUpperCase());
  window.AppPreferences?.setCurrentUserId?.(session?.user?.id);

  const landingPage = window.AppPreferences?.getCurrent?.().landingPage || 'dashboard.php';
  location.href = ['dashboard.php', 'weekly.php', 'testpoints.php'].includes(landingPage)
    ? landingPage
    : 'dashboard.php';
}

// Messages for redirects back to the login page (new-tab sign-in #47,
// password reset #46, session expiry #48).
function showLoginNotice() {
  const notice = document.getElementById('loginNotice');
  if (!notice) return;
  const params = new URLSearchParams(window.location.search);
  let message = '';
  let type = '';
  if (params.get('reset') === '1') {
    message = 'Your password has been updated. Sign in with your new password.';
    type = 'success';
  } else if (params.get('expired') === '1') {
    message = 'Your session has expired. Please sign in again.';
    type = 'error';
  } else if (params.get('signin') === 'tab') {
    message = 'Please sign in to continue in this tab.';
  }
  notice.textContent = message;
  notice.className = `auth-form-status${type ? ` is-${type}` : ''}`;
}

document.addEventListener('DOMContentLoaded', () => {
  showLoginNotice();
  const rememberMe = document.getElementById('rememberMe');
  if (rememberMe && window.AppAuthStorage) rememberMe.checked = window.AppAuthStorage.isRememberMe();
  document.getElementById('loginButton')?.addEventListener('click', login);
  document.getElementById('password')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') login();
  });
});
