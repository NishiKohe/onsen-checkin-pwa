const CACHE_NAME = "onsen-checkin-v70.4";
const CORE_ASSETS = [
  "./", "./index.html", "./manifest.webmanifest", "./style.css", "./app-shell.css",
  "./game-ui-v60.css", "./game-hub-v61.css", "./encyclopedia-ui-v61.css", "./mining-game-v69.css", "./mining-pickaxe-v691.css",
  "./castle-collection-ui-v61.css", "./castle-map-v62.css", "./endless-battle-v68.css", "./scenic-collection-ui-v70.css",
  "./profile-storage.js", "./profile-game-extension-v61.js", "./visit-log-preload.js",
  "./trip-power-mode.js", "./app.js", "./castle-v62-hardening.js", "./domain-model.js",
  "./castle-domain-v61.js", "./app-shell.js", "./build-info.js", "./game-runtime-v59.js",
  "./castle-visit-runtime-v61.js", "./character-runtime-v61.js", "./fishing-game-v60.js",
  "./encyclopedia-ui-v61.js", "./game-hub-v61.js", "./game-v68-bridge.js", "./game-v69-bridge.js",
  "./progression-runtime-v69.js", "./equipment-battle-sync-v69.js", "./mining-game-v69.js", "./endless-battle-v68.js",
  "./castle-collection-ui-v61.js", "./castle-map-v62.js", "./ui-recovery-v701.js", "./scenic-v70-bridge.js", "./scenic-runtime-v70.js", "./scenic-collection-ui-v70.js", "./achievement-domain-v702.js",
  "./data/castles-japan100-v61.json", "./data/castle-checkin-zones-v62.json",
  "./data/castles-zoku100-v68.csv", "./data/scenic-national-v70.json", "./data/fish-catalog-v61.json",
  "./data/characters/manifest-v62.json", "./data/characters/sengoku-core-v62-01.json",
  "./data/characters/sengoku-core-v62-02.json", "./data/characters/sengoku-core-v62-03.json",
  "./data/characters/sengoku-core-v62-04.json", "./data/characters/sengoku-core-v62-05.json",
  "./data/characters/sengoku-core-v68-06.json", "./data/characters/sengoku-core-v68-07.json",
  "./data/characters/sengoku-core-v68-08.json", "./data/characters/sengoku-core-v68-09.json",
  "./data/characters/sengoku-core-v68-10.json", "./catalog/endless-battle-spec-v62.json",
  "./catalog/character-model-schema-v62.json", "./icons/icon-192.png", "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.allSettled(CORE_ASSETS.map((asset) => cache.add(asset))))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

function normalizedRequest(url) {
  return new Request(`${url.origin}${url.pathname}`, { method: "GET" });
}

async function findCached(request, url) {
  return (await caches.match(request)) || (await caches.match(normalizedRequest(url))) || null;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const dataLike = /\.(?:html|css|js|json|csv|webmanifest)$/i.test(url.pathname);
  const networkFirst = event.request.mode === "navigate" || dataLike;

  if (networkFirst) {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      } catch {
        const cached = await findCached(event.request, url);
        if (cached) return cached;
        if (event.request.mode === "navigate") return (await caches.match("./index.html")) || Response.error();
        return Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    } catch {
      return Response.error();
    }
  })());
});