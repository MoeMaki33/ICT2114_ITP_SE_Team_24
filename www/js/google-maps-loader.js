(function () {
  let mapsPromise = null;
  let clustererPromise = null;
  let callbackCounter = 0;

  function getConfig() {
    return window.APP_CONFIG || {};
  }

  function getApiKey() {
    return String(getConfig().googleMapsApiKey || "").trim();
  }

  function hasApiKey() {
    const key = getApiKey();
    return Boolean(key) && key !== "YOUR_RESTRICTED_GOOGLE_MAPS_API_KEY";
  }

  function loadScriptOnce({ src, test, id }) {
    if (test?.()) return Promise.resolve();

    const existing = id ? document.getElementById(id) : null;
    if (existing) {
      return new Promise((resolve, reject) => {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
      });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      if (id) script.id = id;
      script.src = src;
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Google Maps dependency failed to load."));
      document.head.appendChild(script);
    });
  }

  function loadMaps() {
    if (window.google?.maps) return Promise.resolve(window.google.maps);
    if (mapsPromise) return mapsPromise;
    if (!hasApiKey()) {
      return Promise.reject(new Error("GOOGLE_MAPS_API_KEY_MISSING"));
    }

    mapsPromise = new Promise((resolve, reject) => {
      const callbackName = `__assetMapGoogleMapsReady${++callbackCounter}`;
      const params = new URLSearchParams({
        key: getApiKey(),
        callback: callbackName,
        v: "weekly",
      });

      window[callbackName] = async () => {
        try {
          delete window[callbackName];
          if (getConfig().googleMapsMapId && window.google?.maps?.importLibrary) {
            await window.google.maps.importLibrary("marker");
          }
          resolve(window.google.maps);
        } catch (error) {
          reject(error);
        }
      };

      loadScriptOnce({
        id: "google-maps-js-api",
        src: `https://maps.googleapis.com/maps/api/js?${params.toString()}`,
        test: () => Boolean(window.google?.maps),
      }).catch((error) => {
        delete window[callbackName];
        reject(error);
      });
    }).catch((error) => {
      mapsPromise = null;
      throw error;
    });

    return mapsPromise;
  }

  function loadMarkerClusterer() {
    if (window.markerClusterer?.MarkerClusterer) return Promise.resolve(window.markerClusterer);
    if (clustererPromise) return clustererPromise;

    clustererPromise = loadScriptOnce({
      id: "google-marker-clusterer",
      src: "https://unpkg.com/@googlemaps/markerclusterer@2.6.2/dist/index.min.js",
      test: () => Boolean(window.markerClusterer?.MarkerClusterer),
    }).then(() => {
      if (!window.markerClusterer?.MarkerClusterer) {
        throw new Error("Marker clustering library is unavailable.");
      }
      return window.markerClusterer;
    }).catch((error) => {
      clustererPromise = null;
      throw error;
    });

    return clustererPromise;
  }

  window.GoogleMapsLoader = {
    hasApiKey,
    loadMaps,
    loadMarkerClusterer,
  };
})();
