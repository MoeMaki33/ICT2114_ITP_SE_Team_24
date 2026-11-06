/**
 * Provisional, client-dependent values (docs/IMPLEMENTATION_PLAN.md §3).
 *
 * Pages read units, labels and feature flags from here instead of hard-coding
 * them, so when the client confirms a decision only this file changes.
 * Record each confirmation in docs/decisions.md and update the comment below.
 *
 * Server-side values (session timeouts) live in www/php/app-settings.php.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AppSettings = api.AppSettings;
})(typeof window !== "undefined" ? window : globalThis, function () {
  function deepFreeze(value) {
    Object.values(value).forEach((child) => {
      if (child && typeof child === "object") deepFreeze(child);
    });
    return Object.freeze(value);
  }

  const Z_MODES = Object.freeze(["hidden", "depth", "elevation"]);

  // decimals: null means "show the value as stored".
  // Units confirmed by the client on 5 Oct 2026 (docs/decisions.md).
  const AppSettings = deepFreeze({
    measurements: {
      potential: { label: "Potential", unit: "mV", decimals: 0, provisional: false },
      temperature: { label: "Temperature", unit: "°C", decimals: 1, provisional: false },
      conductivity: { label: "Conductivity", unit: "µS/cm", decimals: 0, provisional: false }, // D-MEAS-3
      ph: { label: "pH", unit: "", decimals: 2, provisional: false },
      dissolvedOxygen: { label: "Dissolved Oxygen", unit: "mg/L", decimals: 2, provisional: false },
      // D-MEAS-1: rectifier outputs, recorded once per reading time (like power).
      current: { label: "Current", unit: "A", decimals: null, source: "rectifier", provisional: false },
      voltage: { label: "Voltage", unit: "V", decimals: null, source: "rectifier", provisional: false },
      // D-MEAS-2: power is calculated as voltage x current, not entered.
      power: { label: "Power", unit: "W", decimals: null, mode: "calculated", provisional: false },
    },
    schematic: {
      units: "m", // D-XYZ-1: X right, Y up, metres from a per-location origin
      zMode: "hidden", // D-XYZ-2: one of Z_MODES; "hidden" shows "Z (unconfirmed)" in tooltips
    },
    features: {
      notifications: false, // D-NOTIF-1
    },
    environment: {
      // D-ENV-1: client (5 Oct) suggests alerts at 20% day-to-day. Which
      // parameters it covers is still open, so it stays labelled provisional.
      changeWindow: "day",
      conductivityChangeRatio: 0.2,
      phChangeDelta: 0.5,
      provisional: true,
    },
    import: {
      defaultTimeZone: "Asia/Singapore", // D-IMP-2: timestamps without an offset
    },
  });

  return { AppSettings, Z_MODES };
});
