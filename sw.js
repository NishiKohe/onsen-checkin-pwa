const CACHE_NAME = "onsen-checkin-v26";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./collection-progress.css",
  "./app.js",
  "./ui-enhancements.js",
  "./heritage-ui.js",
  "./fixed-selection-ui.js",
  "./collection-progress-ui.js",
  "./onsen.json",
  "./onsen-data-manifest.json",
  "./catalog/onsen-musume-area-master.json",
  "./catalog/onsen-regional-asset-master.json",
  "./catalog/group-definitions.json",
  "./catalog/group-definitions-hokkaido-tohoku.json",
  "./catalog/group-definitions-kanto.json",
  "./data/fixed-selection-meito100.json",
  "./data/onsen-analysis-overrides-core.json",
  "./data/onsen-analysis-expansion.json",
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
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const networkFirst = [
    "/onsen.json",
    "/app.js",
    "/ui-enhancements.js",
    "/heritage-ui.js",
    "/fixed-selection-ui.js",
    "/collection-progress-ui.js",
    "/collection-progress.css",
    "/onsen-data-manifest.json",
    "/catalog/onsen-musume-area-master.json",
    "/catalog/onsen-regional-asset-master.json",
    "/data/fixed-selection-meito100.json",
    "/data/onsen-analysis-overrides-core.json",
    "/data/onsen-analysis-expansion.json",
    "/data/regional-group-spots.json"
  ];
  if (
    networkFirst.some((suffix) => url.pathname.endsWith(suffix)) ||
    url.pathname.includes("/catalog/group-definitions") ||
    url.pathname.includes("/data/onsen-") ||
    url.pathname.includes("/data/national-recreation-")
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
