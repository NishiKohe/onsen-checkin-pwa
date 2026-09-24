"use strict";
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: 35.69, longitude: 139.70, accuracy: 25 },
    permissions: ["geolocation"],
    serviceWorkers: "block"
  });
  const page = await context.newPage();
  page.on("console", msg => { if (["error", "warning"].includes(msg.type())) console.log("BROWSER", msg.type(), msg.text()); });
  page.on("pageerror", error => console.log("PAGEERROR", String(error)));

  await page.goto("https://nishikohe.github.io/onsen-checkin-pwa/?aggregation-debug=739", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() =>
    window.OnsenBuildInfo?.version === "v73.9" &&
    window.OnsenMapClustersV738?.diagnostics?.().build === "v73.9" &&
    window.OnsenMapClustersV738?.diagnostics?.().active,
    null, { timeout: 60000 }
  );
  await page.evaluate(() => map.jumpTo({ center: [139.7, 35.69], zoom: 6.5 }));
  await page.waitForTimeout(3000);

  const status = await page.evaluate(() => {
    const m = map;
    const rect = m.getCanvas().getBoundingClientRect();
    const box = [[0, 0], [rect.width, rect.height]];
    const source = m.getSource("map-v738-clusters");
    const groups = m.queryRenderedFeatures(box, { layers: ["map-v738-cluster"] });
    const singles = m.queryRenderedFeatures(box, { layers: ["map-v738-single"] });
    const all = window.OnsenMapDiscoveryV737?.catalog?.() || [];
    return {
      version: window.OnsenBuildInfo?.version,
      aggregation: window.OnsenMapClustersV738?.diagnostics?.(),
      catalog: all.reduce((acc, item) => (acc[item.domain] = (acc[item.domain] || 0) + 1, acc), {}),
      center: m.getCenter().toArray(),
      zoom: m.getZoom(),
      styleLoaded: m.isStyleLoaded(),
      sourceLoaded: m.isSourceLoaded("map-v738-clusters"),
      sourceDataSize: source?._data?.features?.length,
      renderedGroups: groups.length,
      renderedSingles: singles.length,
      groupSamples: groups.slice(0, 5).map(f => ({
        count: Number(f.properties.count),
        domain: f.properties.domain,
        members: String(f.properties.members || "").split("\u001f").length,
        coordinates: f.geometry.coordinates
      })),
      originalMinZoom: m.getLayer("spots-symbol")?.minzoom,
      scenicMinZoom: m.getLayer("scenic-v734-points")?.minzoom
    };
  });

  console.log("AGGREGATION DEBUG", JSON.stringify(status));
  await browser.close();
})().catch(error => {
  console.error("AGGREGATION DEBUG FATAL", error.stack || error);
  process.exitCode = 1;
});
