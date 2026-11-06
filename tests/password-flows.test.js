const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const Flows = require("../www/js/password-flows.js");
const settingsApi = require("../www/js/settings.js");

const read = (relativePath) => fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");

test("password rules match Settings exactly", () => {
  const cases = [["", ""], ["short", "short"], ["long-password", "different"], ["long-password", "long-password"]];
  for (const [password, confirmation] of cases) {
    assert.equal(Flows.validatePassword(password, confirmation), settingsApi.validatePassword(password, confirmation));
  }
});

test("email normalisation and validation", () => {
  assert.equal(Flows.normalizeEmail("  Engineer@Example.COM "), "engineer@example.com");
  assert.equal(Flows.isPlausibleEmail("engineer@example.com"), true);
  assert.equal(Flows.isPlausibleEmail("engineer@"), false);
  assert.equal(Flows.isPlausibleEmail(""), false);
});

test("verification code accepts 6-10 digits, ignoring spaces", () => {
  assert.equal(Flows.isValidVerificationCode("123456"), true);
  assert.equal(Flows.isValidVerificationCode(" 123 456 "), true);
  assert.equal(Flows.normalizeVerificationCode(" 123 456 "), "123456");
  assert.equal(Flows.isValidVerificationCode("12345"), false);
  assert.equal(Flows.isValidVerificationCode("12345a"), false);
});

test("60-second resend cooldown", () => {
  const sent = 1_000_000;
  assert.equal(Flows.cooldownRemaining(0, sent), 0);
  assert.equal(Flows.cooldownRemaining(sent, sent), 60);
  assert.equal(Flows.cooldownRemaining(sent, sent + 59_001), 1);
  assert.equal(Flows.cooldownRemaining(sent, sent + 60_000), 0);
});

test("recovery link classification: valid, expired, invalid, missing", () => {
  const base = "http://localhost/reset-password.php";
  assert.equal(Flows.classifyRecoveryUrl(`${base}#access_token=abc&refresh_token=def&type=recovery`), "recovery");
  assert.equal(Flows.classifyRecoveryUrl(`${base}?code=pkce-code`), "recovery");
  assert.equal(
    Flows.classifyRecoveryUrl(`${base}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`),
    "expired",
  );
  assert.equal(Flows.classifyRecoveryUrl(`${base}?error=access_denied&error_code=bad_jwt`), "invalid");
  assert.equal(Flows.classifyRecoveryUrl(base), "missing");
  assert.equal(Flows.classifyRecoveryUrl("::not a url::"), "missing");
  assert.equal(Flows.recoveryAccessToken(`${base}#access_token=abc&type=recovery`), "abc");
});

test("reset redirect URL works from a sub-folder and from APP_BASE_URL", () => {
  assert.equal(
    Flows.buildResetRedirectUrl("http://localhost/ITP/www/forgot-password.php"),
    "http://localhost/ITP/www/reset-password.php",
  );
  assert.equal(
    Flows.buildResetRedirectUrl("http://localhost/x/forgot-password.php", "https://cpm.example.com/app"),
    "https://cpm.example.com/app/reset-password.php",
  );
});

test("auth errors become short user-facing messages", () => {
  assert.match(Flows.describeAuthError({ code: "same_password" }), /haven't used/);
  assert.match(Flows.describeAuthError({ code: "weak_password" }), /too weak/);
  assert.match(Flows.describeAuthError({ code: "reauthentication_not_valid" }), /verification code/);
  assert.match(Flows.describeAuthError({ status: 429, message: "x" }), /Too many/);
  assert.match(Flows.describeAuthError({ message: "Auth session missing!" }), /reset session has expired/);
  assert.equal(Flows.describeAuthError({ message: "SQL internal stack" }, "fallback"), "fallback");
});

test("forgot-password page: neutral message, cooldown, linked from login", () => {
  const page = read("www/forgot-password.php");
  const script = read("www/js/forgot-password.js");
  assert.match(page, /id="recoveryEmail"[^>]+type="email"/);
  assert.match(script, /NEUTRAL_RECOVERY_MESSAGE/);
  assert.match(script, /resetPasswordForEmail\(email, \{\s*redirectTo:/);
  assert.match(script, /startCooldown/);
  assert.match(read("www/index.php"), /href="forgot-password\.php"/);
  assert.doesNotMatch(read("www/index.php"), /href="#">Forgot password/);
});

test("reset-password page: all states, bootstrap runs before the Supabase client", () => {
  const page = read("www/reset-password.php");
  for (const state of ["checking", "form", "expired", "invalid"]) {
    assert.match(page, new RegExp(`data-reset-state="${state}"`));
  }
  assert.ok(page.indexOf("js/reset-password-bootstrap.js") < page.indexOf("js/supabaseClient.js"));
  assert.ok(page.indexOf("js/password-flows.js") < page.indexOf("js/reset-password-bootstrap.js"));
  assert.doesNotMatch(page, /header\('Location/, "reset page must not redirect signed-in users");
  const script = read("www/js/reset-password.js");
  assert.match(script, /PASSWORD_RECOVERY/);
  assert.match(script, /signOut\(\{ scope: "global" \}\)/);
  assert.match(script, /index\.php\?reset=1/);
});

test("settings password change always requires the emailed code", () => {
  const page = read("www/settings.php");
  const controller = read("www/js/settings.js");
  assert.match(page, /id="settingsSendCode"/);
  assert.match(page, /id="settingsVerificationCode"[^>]+autocomplete="one-time-code"/);
  assert.ok(page.indexOf("js/password-flows.js") < page.indexOf("js/settings.js"));
  assert.match(controller, /auth\.reauthenticate\(\)/);
  assert.match(controller, /auth\.updateUser\(\{ password, nonce \}\)/);
  assert.match(controller, /signOut\(\{ scope: "others" \}\)/);
});
