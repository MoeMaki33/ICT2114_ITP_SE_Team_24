const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

const page = read("www/settings.php");
const controller = read("www/js/settings.js");
const common = read("www/js/common.js");
const login = read("www/js/login.js");
const styles = read("www/css/style.css");
const repositories = read("www/js/repositories/supabase-repositories.js");
const settingsApi = require("../www/js/settings.js");

assert.match(page, /Account and Application Settings/);
assert.match(page, /id="settingsAccountOverview"[^>]+aria-live="polite"/);
for (const heading of ["Profile", "Security", "Workspace Preferences", "Dashboard Layout", "Operational Reference", "Account Actions"]) {
  assert.match(page, new RegExp(`>${heading}<`));
}
assert.doesNotMatch(page, /Notification Email|Alert Frequency|Save Settings|Protected if reading is above/);
assert.match(page, /id="settingsFullName"[^>]+readonly/);
assert.match(page, /Profile details are managed by an administrator/);
assert.match(page, /autocomplete="new-password"/);
assert.match(page, /Sign Out All Devices/);

assert.equal(settingsApi.validatePassword("", ""), "Enter and confirm your new password.");
assert.match(settingsApi.validatePassword("short", "short"), /at least 8/);
assert.match(settingsApi.validatePassword("long-password", "different-password"), /do not match/);
assert.equal(settingsApi.validatePassword("long-password", "long-password"), "");

assert.match(controller, /new root\.AppRepositories\.UserRepository\(\)/);
assert.match(controller, /auth\.updateUser\(\{ password, nonce \}\)/);
assert.match(controller, /clearPasswordInputs\(\)/);
assert.match(controller, /DashboardLayoutRepository\(\)\.resetLayout\("main-dashboard"\)/);
assert.match(controller, /scope: "local"/);
assert.match(controller, /scope: "global"/);
assert.match(controller, /new AbortController\(\)/);
assert.match(controller, /currentPageRoot === pageRoot/);
assert.match(controller, /AppPreferences\?\.save/);

assert.match(common, /signOut\(\{ scope \}\)/);
assert.match(common, /options\.scope \|\| "local"/);
assert.match(login, /getCurrent\?\.\(\)\.landingPage/);
assert.match(repositories, /class DashboardLayoutRepository/);
assert.match(styles, /grid-template-columns: minmax\(0, 3fr\) minmax\(320px, 2fr\)/);
assert.match(styles, /grid-template-areas:\s*"profile"\s*"security"\s*"workspace"\s*"dashboard"\s*"operational"\s*"actions"/);

console.log("settings-page: account, security, preferences, dashboard reset, sessions and responsive order passed");
