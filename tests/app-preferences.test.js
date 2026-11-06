const assert = require("node:assert/strict");

const AppPreferences = require("../www/js/app-preferences.js");

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

const storage = createStorage();
const firstUser = "11111111-1111-4111-8111-111111111111";
const secondUser = "22222222-2222-4222-8222-222222222222";

assert.deepEqual(AppPreferences.load(firstUser, storage), AppPreferences.DEFAULTS);
assert.deepEqual(AppPreferences.save(firstUser, {
  landingPage: "weekly.php",
  tableRows: 50,
  chartMotion: "reduced",
}, storage), {
  landingPage: "weekly.php",
  tableRows: 50,
  chartMotion: "reduced",
});
assert.deepEqual(AppPreferences.load(secondUser, storage), AppPreferences.DEFAULTS, "preferences must be user scoped");

AppPreferences.setCurrentUserId(firstUser, storage);
assert.equal(AppPreferences.getCurrentUserId(storage), firstUser);
assert.deepEqual(AppPreferences.getCurrent(storage), {
  landingPage: "weekly.php",
  tableRows: 50,
  chartMotion: "reduced",
});

assert.deepEqual(AppPreferences.save(firstUser, {
  landingPage: "https://evil.example",
  tableRows: 999,
  chartMotion: "fast",
}, storage), AppPreferences.DEFAULTS, "invalid values must be replaced by safe defaults");
assert.deepEqual(AppPreferences.reset(firstUser, storage), AppPreferences.DEFAULTS);
assert.deepEqual(AppPreferences.load(firstUser, storage), AppPreferences.DEFAULTS);
assert.equal(AppPreferences.normalizeUserId("not-a-user"), "");

console.log("app-preferences: user scoping, sanitisation, defaults and reset passed");
