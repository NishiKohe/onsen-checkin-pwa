"use strict";
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage"]
  });

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: 35.69, longitude: 139.70, accuracy: 25 },
    permissions: ["geolocation"],
    serviceWorkers: "block"
  });

  const page = await context.newPage();

  page.on("console", msg => {
    if (["error", "warning"].includes(msg.type())) {
      console.log("BROWSER", msg.type(), msg.text());
    }
  });

  page.on("pageerror", error =>
    console.log("PAGEERROR", String(error))
  );

  await page.goto(
    "https://nishikohe.github.io/onsen-checkin-pwa/?aggregation-debug=7310",
    { waitUntil: "domcontentloaded", timeout: 60000 }
  );

  await page.waitForFunction(() =>
    window.OnsenBuildInfo?.version === "v73.10" &&
    window.OnsenMapClustersV738?.diagnostics?.().build === "v73.10" &&
    window.OnsenMapClustersV738?.diagnostics?.().active,
    null,
    { timeout: 60000 }
  );

  await page.evaluate(() => {
    map.jumpTo({ center: [139.7, 35.69], zoom: 6.5 });
  });

  await page.waitForFunction(() => {
    const d = window.OnsenMapClustersV738?.diagnostics?.();
    return d?.groupCount > 0 && d.renderedCount > 0;
  }, null, { timeout: 20000 });

  const status = await page.evaluate(() => {
    const d = window.OnsenMapClustersV738.diagnostics();
    const overlay = document.getElementById("mapClusterOverlayV738");
    const markers = [
      ...overlay.querySelectorAll(".map-cluster-marker-v738")
    ];
    const groups = markers.filter(button =>
      button.classList.contains("is-group")
    );

    return {
      version: window.OnsenBuildInfo?.version,
      aggregation: d,
      catalog: window.OnsenMapDiscoveryV737
        .catalog()
        .reduce((acc, item) => {
          acc[item.domain] = (acc[item.domain] || 0) + 1;
          return acc;
        }, {}),
      center: map.getCenter().toArray(),
      zoom: map.getZoom(),
      styleLoaded: map.isStyleLoaded(),
      overlayHidden: overlay.hidden,
      domMarkers: markers.length,
      domGroups: groups.length,
      domSingles: markers.length - groups.length,
      groupSamples: groups.slice(0, 5).map(button => ({
        count: Number(button.dataset.count),
        members: Number(button.dataset.memberCount),
        domain: button.dataset.domain
      })),
      originalMinZoom: map.getLayer("spots-symbol")?.minzoom,
      scenicMinZoom: map.getLayer("scenic-v734-points")?.minzoom
    };
  });

  console.log("DOM AGGREGATION DEBUG", JSON.stringify(status));

  await browser.close();
})().catch(error => {
  console.error(
    "DOM AGGREGATION DEBUG FATAL",
    error.stack || error
  );
  process.exitCode = 1;
});
