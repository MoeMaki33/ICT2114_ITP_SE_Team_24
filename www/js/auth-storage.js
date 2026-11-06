/**
 * Remember Me storage policy for the Supabase browser session (#47).
 *
 * Supabase keeps its session (access + refresh token) in whatever storage we
 * hand to createClient(). This module provides that storage adapter and
 * applies the agreed session policy (SPRINT_08.md §3.2, D-SESS-1):
 *
 *   Remember Me ON  -> localStorage: survives a browser restart, max 14 days.
 *   Remember Me OFF -> sessionStorage: ends when the browser closes, max 12 h.
 *
 * Known effect of sessionStorage: it is per tab, so a NEW tab (Ctrl/middle
 * click, typed URL) starts without a Supabase session and the user signs in
 * again in that tab. common.js sends that tab to index.php?signin=tab without
 * destroying the PHP session, so the user's other tabs keep working.
 *
 * The PHP session (set-session.php, #48) enforces the real limits on the
 * server; this module only keeps the browser side in step with it.
 *
 * Pure logic: browser globals are injectable so tests/auth-storage.test.js can
 * exercise it under node:test.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AppAuthStorage = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  // Preference flag: always in localStorage so the checkbox is remembered.
  const REMEMBER_KEY = "cpm.rememberMe";
  // Login time: kept in the same storage as the session it belongs to.
  const STARTED_AT_KEY = "cpm.sessionStartedAt";

  const HOUR_MS = 60 * 60 * 1000;
  // Provisional (D-SESS-1). Overridable from AppSettings.session once
  // www/js/config/app-settings.js exists (#135).
  const DEFAULTS = Object.freeze({
    absoluteMaxHours: 12,
    rememberMaxDays: 14,
  });

  function safe(fn, fallback) {
    try {
      return fn();
    } catch (error) {
      return fallback;
    }
  }

  function resolveEnv(env = {}) {
    return {
      local: env.localStorage !== undefined ? env.localStorage : safe(() => root.localStorage, null),
      session: env.sessionStorage !== undefined ? env.sessionStorage : safe(() => root.sessionStorage, null),
      now: env.now || (() => Date.now()),
      settings: env.settings || root.AppSettings?.session || {},
    };
  }

  function maxLifetimeMs(remember, settings = {}) {
    if (remember) {
      const days = Number(settings.rememberMaxDays) > 0 ? Number(settings.rememberMaxDays) : DEFAULTS.rememberMaxDays;
      return days * 24 * HOUR_MS;
    }
    const hours = Number(settings.absoluteMaxHours) > 0 ? Number(settings.absoluteMaxHours) : DEFAULTS.absoluteMaxHours;
    return hours * HOUR_MS;
  }

  function isRememberMe(env) {
    const { local } = resolveEnv(env);
    return safe(() => local?.getItem(REMEMBER_KEY), null) === "1";
  }

  /** The storage the Supabase session lives in under the current preference. */
  function activeStorage(env) {
    const resolved = resolveEnv(env);
    return isRememberMe(env) ? resolved.local : resolved.session;
  }

  function isSupabaseAuthKey(key) {
    return /^sb-.+-auth-token/.test(String(key || ""));
  }

  function keysOf(storage) {
    const keys = [];
    const length = safe(() => storage?.length, 0) || 0;
    for (let index = 0; index < length; index += 1) {
      const key = safe(() => storage.key(index), null);
      if (key) keys.push(key);
    }
    return keys;
  }

  function clearStorage(storage) {
    keysOf(storage)
      .filter(isSupabaseAuthKey)
      .forEach((key) => safe(() => storage.removeItem(key)));
    safe(() => storage?.removeItem(STARTED_AT_KEY));
  }

  /** Removes every Supabase auth entry from both storages (sign-out, expiry). */
  function clearAuthSession(env) {
    const resolved = resolveEnv(env);
    clearStorage(resolved.local);
    clearStorage(resolved.session);
  }

  /**
   * Call right before signInWithPassword(). Records the preference and the
   * login time, and removes any old session left in the other storage so a
   * stale token can't be picked up later.
   */
  function beginSession(remember, env) {
    const resolved = resolveEnv(env);
    clearStorage(remember ? resolved.session : resolved.local);
    safe(() => resolved.local?.setItem(REMEMBER_KEY, remember ? "1" : "0"));
    const target = remember ? resolved.local : resolved.session;
    safe(() => target?.setItem(STARTED_AT_KEY, String(resolved.now())));
  }

  /**
   * Returns a reason string when the stored Supabase session must be thrown
   * away under the policy, otherwise null.
   */
  function expiryReason(env) {
    const resolved = resolveEnv(env);
    const remember = isRememberMe(env);
    const storage = activeStorage(env);
    const startedAt = Number(safe(() => storage?.getItem(STARTED_AT_KEY), null));
    if (!Number.isFinite(startedAt) || startedAt <= 0) return "unknown-start";
    if (resolved.now() - startedAt > maxLifetimeMs(remember, resolved.settings)) return "absolute-expired";
    return null;
  }

  /**
   * Storage adapter for createClient({ auth: { storage } }).
   * Remember Me on -> localStorage, off -> sessionStorage. Reads return null
   * once the absolute limit has passed, so supabase-js treats the user as
   * signed out. removeItem clears both storages.
   */
  function createStorageAdapter(env) {
    return {
      getItem(key) {
        const storage = activeStorage(env);
        const value = safe(() => storage?.getItem(key), null);
        if (value !== null && isSupabaseAuthKey(key) && expiryReason(env)) {
          clearAuthSession(env);
          return null;
        }
        return value;
      },
      setItem(key, value) {
        const storage = activeStorage(env);
        safe(() => storage?.setItem(key, value));
      },
      removeItem(key) {
        const resolved = resolveEnv(env);
        safe(() => resolved.local?.removeItem(key));
        safe(() => resolved.session?.removeItem(key));
      },
    };
  }

  return {
    REMEMBER_KEY,
    STARTED_AT_KEY,
    DEFAULTS,
    maxLifetimeMs,
    isRememberMe,
    beginSession,
    expiryReason,
    clearAuthSession,
    createStorageAdapter,
    isSupabaseAuthKey,
  };
});
