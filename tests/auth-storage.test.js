const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const AuthStorage = require("../www/js/auth-storage.js");

const AUTH_KEY = "sb-pscwapylbjvulvsszdur-auth-token";
const HOUR = 60 * 60 * 1000;

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

function makeEnv({ now = 1_000_000_000_000 } = {}) {
  const env = {
    localStorage: fakeStorage(),
    sessionStorage: fakeStorage(),
    clock: now,
    settings: {},
  };
  env.now = () => env.clock;
  return env;
}

// Closing the browser (or opening a new tab) gives an empty sessionStorage;
// localStorage is shared and survives.
function newBrowserSessionOrTab(env) {
  env.sessionStorage = fakeStorage();
}

test("Remember Me OFF stores the session in sessionStorage", () => {
  const env = makeEnv();
  const adapter = AuthStorage.createStorageAdapter(env);

  AuthStorage.beginSession(false, env);
  adapter.setItem(AUTH_KEY, "token");

  assert.equal(AuthStorage.isRememberMe(env), false);
  assert.equal(env.sessionStorage.getItem(AUTH_KEY), "token");
  assert.equal(env.localStorage.getItem(AUTH_KEY), null, "nothing persistent is written");
  assert.equal(adapter.getItem(AUTH_KEY), "token", "refresh in the same tab keeps the session");
});

test("Remember Me OFF: browser restart or new tab has no session", () => {
  const env = makeEnv();
  const adapter = AuthStorage.createStorageAdapter(env);
  AuthStorage.beginSession(false, env);
  adapter.setItem(AUTH_KEY, "token");

  newBrowserSessionOrTab(env);
  assert.equal(adapter.getItem(AUTH_KEY), null);
});

test("Remember Me ON stores the session in localStorage and survives a restart", () => {
  const env = makeEnv();
  const adapter = AuthStorage.createStorageAdapter(env);

  AuthStorage.beginSession(true, env);
  adapter.setItem(AUTH_KEY, "token");
  newBrowserSessionOrTab(env);

  assert.equal(AuthStorage.isRememberMe(env), true);
  assert.equal(env.localStorage.getItem(AUTH_KEY), "token");
  assert.equal(adapter.getItem(AUTH_KEY), "token");
});

test("absolute maximum: 12 h when off, 14 days when on", () => {
  const off = makeEnv();
  const offAdapter = AuthStorage.createStorageAdapter(off);
  AuthStorage.beginSession(false, off);
  offAdapter.setItem(AUTH_KEY, "token");
  off.clock += 12 * HOUR - 1;
  assert.equal(offAdapter.getItem(AUTH_KEY), "token");
  off.clock += 2;
  assert.equal(AuthStorage.expiryReason(off), "absolute-expired");
  assert.equal(offAdapter.getItem(AUTH_KEY), null);
  assert.equal(off.sessionStorage.getItem(AUTH_KEY), null, "expired token is removed, not just hidden");

  const on = makeEnv();
  const onAdapter = AuthStorage.createStorageAdapter(on);
  AuthStorage.beginSession(true, on);
  onAdapter.setItem(AUTH_KEY, "token");
  on.clock += 14 * 24 * HOUR - 1;
  assert.equal(onAdapter.getItem(AUTH_KEY), "token");
  on.clock += 2;
  assert.equal(onAdapter.getItem(AUTH_KEY), null);
});

test("limits can be overridden from AppSettings.session", () => {
  assert.equal(AuthStorage.maxLifetimeMs(false, { absoluteMaxHours: 1 }), HOUR);
  assert.equal(AuthStorage.maxLifetimeMs(true, { rememberMaxDays: 2 }), 48 * HOUR);
  assert.equal(AuthStorage.maxLifetimeMs(false, { absoluteMaxHours: "bad" }), 12 * HOUR);
});

test("a stored session with no recorded start time is discarded", () => {
  const env = makeEnv();
  env.localStorage.setItem(AuthStorage.REMEMBER_KEY, "1");
  env.localStorage.setItem(AUTH_KEY, "legacy-token");
  assert.equal(AuthStorage.createStorageAdapter(env).getItem(AUTH_KEY), null);
});

test("switching ON -> OFF removes the old persistent session", () => {
  const env = makeEnv();
  const adapter = AuthStorage.createStorageAdapter(env);
  AuthStorage.beginSession(true, env);
  adapter.setItem(AUTH_KEY, "persistent");

  AuthStorage.beginSession(false, env);
  assert.equal(env.localStorage.getItem(AUTH_KEY), null);
  assert.equal(AuthStorage.isRememberMe(env), false);
});

test("removeItem and clearAuthSession clear both storages", () => {
  const env = makeEnv();
  env.localStorage.setItem(AUTH_KEY, "a");
  env.sessionStorage.setItem(AUTH_KEY, "b");
  env.sessionStorage.setItem(`${AUTH_KEY}-code-verifier`, "c");
  env.localStorage.setItem("userPreferences", "keep");
  env.localStorage.setItem(AuthStorage.REMEMBER_KEY, "1");

  AuthStorage.createStorageAdapter(env).removeItem(AUTH_KEY);
  assert.equal(env.localStorage.getItem(AUTH_KEY), null);
  assert.equal(env.sessionStorage.getItem(AUTH_KEY), null);

  AuthStorage.clearAuthSession(env);
  assert.equal(env.sessionStorage.getItem(`${AUTH_KEY}-code-verifier`), null);
  assert.equal(env.localStorage.getItem("userPreferences"), "keep", "non-auth data is untouched");
  assert.equal(env.localStorage.getItem(AuthStorage.REMEMBER_KEY), "1", "preference is kept to pre-fill the checkbox");
});

test("storage that throws (private mode, blocked) does not break sign-in", () => {
  const throwing = {
    get length() {
      throw new Error("blocked");
    },
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  };
  const env = { localStorage: throwing, sessionStorage: throwing };
  assert.doesNotThrow(() => AuthStorage.beginSession(true, env));
  assert.doesNotThrow(() => AuthStorage.clearAuthSession(env));
  assert.equal(AuthStorage.createStorageAdapter(env).getItem(AUTH_KEY), null);
});

test("wiring: pages, login, logout and new-tab sign-in", () => {
  const www = path.join(__dirname, "..", "www");
  const pages = fs.readdirSync(www).filter((file) => file.endsWith(".php"));
  let checked = 0;
  for (const page of pages) {
    const source = fs.readFileSync(path.join(www, page), "utf8");
    const clientIndex = source.indexOf("js/supabaseClient.js");
    if (clientIndex === -1) continue;
    const storageIndex = source.indexOf(`<script src="<?php echo asset_v('js/auth-storage.js'); ?>"></script>`);
    assert.ok(storageIndex !== -1 && storageIndex < clientIndex, `${page} must load auth-storage.js before supabaseClient.js`);
    checked += 1;
  }
  assert.ok(checked > 0);

  const read = (file) => fs.readFileSync(path.join(www, file), "utf8");
  const index = read("index.php");
  assert.match(index, /id="rememberMe"/);
  assert.match(index, /current_user_id\(\) && !isset\(\$_GET\['signin'\]\)/);

  const login = read("js/login.js");
  assert.ok(login.indexOf("beginSession") < login.indexOf("signInWithPassword"), "preference is set before signing in");
  assert.match(login, /remember\s*\}/);
  assert.match(read("js/supabaseClient.js"), /createStorageAdapter\(\)/);

  const common = read("js/common.js");
  assert.match(common, /clearAuthSession/);
  assert.match(common, /index\.php\?signin=tab/, "a tab without a session must not destroy the PHP session");
});
