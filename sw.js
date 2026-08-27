const CACHE_NAME = "onsen-checkin-v62";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./map-tools-toggle.css",
  "./collection-progress.css",
  "./collection-area-hierarchy.css",
  "./collection-navigation-ui.css",
  "./achievement-system.css",
  "./achievement-onsite.css",
  "./achievement-next-up.css",
  "./achievement-history.css",
  "./visit-log.css",
  "./profile-storage.css",
  "./trip-power-mode.css",
  "./app-shell.css",
  "./footer-navigation-v46.css",
  "./ui-compact-v54.css",
  "./ui-compact-v54-panels.css",
  "./ui-fixes-v55.css",
  "./trip-ui-v56.css",
  "./trip-ui-v56-fix.css",
  "./ui-polish-v57.css",
  "./game-ui-v58.css",
  "./game-ui-v59.css",
  "./game-ui-v60.css",
  "./game-hub-v61.css",
  "./encyclopedia-ui-v61.css",
  "./castle-collection-ui-v61.css",
  "./castle-map-v62.css",
  "./profile-storage.js",
  "./profile-game-extension-v61.js",
  "./visit-log-preload.js",
  "./trip-power-mode.js",
  "./visit-log-ui.js",
  "./photo-recovery-fallback.js",
  "./domain-model.js",
  "./domain-runtime-bridge.js",
  "./castle-domain-v61.js",
  "./castle-visit-runtime-v61.js",
  "./character-runtime-v61.js",
  "./map-tools-toggle.js",
  "./map-interaction-v50.js",
  "./collection-area-hierarchy.js",
  "./collection-area-hierarchy-onsen-musume.js",
  "./collection-area-hierarchy-selections.js",
  "./collection-navigation-ui.js",
  "./achievement-system.js",
  "./achievement-onsite.js",
  "./achievement-next-up.js",
  "./achievement-history.js",
  "./app-shell.js",
  "./build-info.js",
  "./footer-navigation-v46.js",
  "./ui-compact-v54.js",
  "./ui-fixes-v55.js",
  "./trip-ui-v56.js",
  "./ui-progress-badges-v61.js",
  "./game-runtime-v59.js",
  "./fishing-game-v60.js",
  "./encyclopedia-ui-v61.js",
  "./game-hub-v61.js",
  "./castle-collection-ui-v61.js",
  "./castle-map-v62.js",
  "./castle-v62-hardening.js",
  "./app.js",
  "./ui-enhancements.js",
  "./heritage-ui.js",
  "./fixed-selection-ui.js",
  "./collection-progress-ui.js",
  "./onsen.json",
  "./onsen-data-manifest.json",
  "./data/castles-japan100-v61.json",
  "./data/castle-checkin-zones-v62.json",
  "./data/castle-coordinates-v62.csv",
  "./data/fish-catalog-v61.json",
  "./data/characters/manifest-v62.json",
  "./data/characters/sengoku-core-v62-01.json",
  "./data/characters/sengoku-core-v62-02.json",
  "./data/characters/sengoku-core-v62-03.json",
  "./data/characters/sengoku-core-v62-04.json",
  "./data/characters/sengoku-core-v62-05.json",
  "./catalog/domain-model-schema.json",
  "./catalog/analysis-coverage-status.json",
  "./catalog/onsen-musume-area-master.json",
  "./catalog/onsen-regional-asset-master.json",
  "./catalog/group-definitions.json",
  "./catalog/group-definitions-hokkaido-tohoku.json",
  "./catalog/group-definitions-kanto.json",
  "./catalog/visit-record-schema.json",
  "./catalog/save-data-schema.json",
  "./catalog/travel-tracking-policy.json",
  "./catalog/ui-smoke-tests.json",
  "./catalog/collection-area-hierarchy-schema.json",
  "./catalog/achievement-schema.json",
  "./catalog/achievement-recommendation-policy.json",
  "./catalog/onsite-achievement-policy.json",
  "./catalog/minigame-runtime-policy.json",
  "./catalog/fishing-game-v59-spec.json",
  "./catalog/fishing-game-v60-spec.json",
  "./catalog/castle-character-minigame-policy-v61.json",
  "./catalog/castle-coordinate-policy-v62.json",
  "./catalog/endless-battle-spec-v62.json",
  "./catalog/character-model-schema-v62.json",
  "./catalog/character-seed-coverage-v62.json",
  "./data/fixed-selection-meito100.json",
  "./data/onsen-analysis-overrides-core.json",
  "./data/onsen-analysis-expansion.json",
  "./data/onsen-analysis-expansion-2.json",
  "./data/onsen-analysis-expansion-3.json",
  "./data/onsen-analysis-expansion-4.json",
  "./data/regional-group-spots.json",
  "./data/onsen-musume-hokkaido-tohoku.json",
  "./data/onsen-musume-kanto-simple.json",
  "./data/onsen-musume-kanto-areas.json",
  "./data/onsen-musume-kanto-chichibu.json",
  "./data/onsen-musume-koshinetsu-hokuriku-simple.json",
  "./data/onsen-musume-koshinetsu-hokuriku-areas.json",
  "./data/onsen-musume-tokai.json",
  "./data/onsen-musume-kinki.json",
  "./data/onsen-musume-chugoku-shikoku.json",
  "./data/onsen-musume-kyushu-okinawa.json",
  "./data/national-recreation-hokkaido-tohoku.json",
  "./data/national-recreation-kanto.json",
  "./data/national-recreation-koshinetsu-hokuriku.json",
  "./data/national-recreation-tokai.json",
  "./data/national-recreation-kinki.json",
  "./data/national-recreation-chugoku-shikoku.json",
  "./data/national-recreation-kyushu.json",
  "./data/national-recreation-overrides.json",
  "./data/national-recreation-overrides-koshinetsu-hokuriku.json",
  "./data/national-recreation-overrides-tokai.json",
  "./data/national-recreation-overrides-kinki.json",
  "./data/national-recreation-overrides-chugoku-shikoku.json",
  "./data/national-recreation-overrides-kyushu.json",
  "./data/onsen-heritage-new.json",
  "./data/onsen-heritage-overrides.json",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const networkFirst = [
    "/index.html", "/style.css", "/map-tools-toggle.css", "/collection-progress.css", "/collection-area-hierarchy.css", "/collection-navigation-ui.css",
    "/achievement-system.css", "/achievement-onsite.css", "/achievement-next-up.css", "/achievement-history.css", "/visit-log.css", "/profile-storage.css",
    "/trip-power-mode.css", "/app-shell.css", "/footer-navigation-v46.css", "/ui-compact-v54.css", "/ui-compact-v54-panels.css", "/ui-fixes-v55.css",
    "/trip-ui-v56.css", "/trip-ui-v56-fix.css", "/ui-polish-v57.css", "/game-ui-v58.css", "/game-ui-v59.css", "/game-ui-v60.css",
    "/game-hub-v61.css", "/encyclopedia-ui-v61.css", "/castle-collection-ui-v61.css", "/castle-map-v62.css",
    "/profile-storage.js", "/profile-game-extension-v61.js", "/visit-log-preload.js", "/trip-power-mode.js", "/visit-log-ui.js", "/photo-recovery-fallback.js",
    "/domain-model.js", "/domain-runtime-bridge.js", "/castle-domain-v61.js", "/castle-visit-runtime-v61.js", "/character-runtime-v61.js",
    "/map-tools-toggle.js", "/map-interaction-v50.js", "/collection-area-hierarchy.js", "/collection-area-hierarchy-onsen-musume.js", "/collection-area-hierarchy-selections.js",
    "/collection-navigation-ui.js", "/achievement-system.js", "/achievement-onsite.js", "/achievement-next-up.js", "/achievement-history.js", "/app-shell.js", "/build-info.js",
    "/footer-navigation-v46.js", "/ui-compact-v54.js", "/ui-fixes-v55.js", "/trip-ui-v56.js", "/ui-progress-badges-v61.js",
    "/game-runtime-v59.js", "/fishing-game-v60.js", "/encyclopedia-ui-v61.js", "/game-hub-v61.js", "/castle-collection-ui-v61.js", "/castle-map-v62.js", "/castle-v62-hardening.js",
    "/onsen.json", "/app.js", "/ui-enhancements.js", "/heritage-ui.js", "/fixed-selection-ui.js", "/collection-progress-ui.js", "/onsen-data-manifest.json",
    "/data/castles-japan100-v61.json", "/data/castle-checkin-zones-v62.json", "/data/castle-coordinates-v62.csv", "/data/fish-catalog-v61.json", "/data/characters/manifest-v62.json",
    "/data/characters/sengoku-core-v62-01.json", "/data/characters/sengoku-core-v62-02.json", "/data/characters/sengoku-core-v62-03.json", "/data/characters/sengoku-core-v62-04.json", "/data/characters/sengoku-core-v62-05.json",
    "/catalog/domain-model-schema.json", "/catalog/analysis-coverage-status.json", "/catalog/onsen-musume-area-master.json", "/catalog/onsen-regional-asset-master.json",
    "/catalog/visit-record-schema.json", "/catalog/save-data-schema.json", "/catalog/travel-tracking-policy.json", "/catalog/ui-smoke-tests.json", "/catalog/collection-area-hierarchy-schema.json",
    "/catalog/achievement-schema.json", "/catalog/achievement-recommendation-policy.json", "/catalog/onsite-achievement-policy.json", "/catalog/minigame-runtime-policy.json",
    "/catalog/fishing-game-v59-spec.json", "/catalog/fishing-game-v60-spec.json", "/catalog/castle-character-minigame-policy-v61.json", "/catalog/castle-coordinate-policy-v62.json", "/catalog/endless-battle-spec-v62.json",
    "/catalog/character-model-schema-v62.json", "/catalog/character-seed-coverage-v62.json", "/data/fixed-selection-meito100.json", "/data/onsen-analysis-overrides-core.json",
    "/data/onsen-analysis-expansion.json", "/data/onsen-analysis-expansion-2.json", "/data/onsen-analysis-expansion-3.json", "/data/onsen-analysis-expansion-4.json", "/data/regional-group-spots.json"
  ];

  const useNetworkFirst = event.request.mode === "navigate" ||
    networkFirst.some((suffix) => url.pathname.endsWith(suffix)) ||
    url.pathname.includes("/catalog/group-definitions") ||
    url.pathname.includes("/data/onsen-") ||
    url.pathname.includes("/data/national-recreation-");

  if (useNetworkFirst) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});