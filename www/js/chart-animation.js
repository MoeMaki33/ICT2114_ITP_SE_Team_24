(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AppChartAnimation = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

  function prefersReducedMotion() {
    const applicationPreference = root?.AppPreferences?.getCurrent?.().chartMotion;
    return applicationPreference === "reduced"
      || Boolean(root?.matchMedia?.(REDUCED_MOTION_QUERY).matches);
  }

  function getEntranceAnimation() {
    if (prefersReducedMotion()) return false;
    return {
      duration: 750,
      easing: "easeOutQuart",
    };
  }

  return {
    REDUCED_MOTION_QUERY,
    prefersReducedMotion,
    getEntranceAnimation,
  };
});
