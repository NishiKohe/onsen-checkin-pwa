"use strict";
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, geolocation: { latitude: 35.69, longitude: 139.70, accuracy: 25 }, permissions: ["geolocation"], serviceWorkers: "block" });
  const page = await context.newPage();
  page.on("console", msg => { if (["error", "warning"].includes(msg.type())) console.log("BROWSER", msg.type(), msg.text()); });
  page.on("pageerror", error => console.log("PAGEERROR", String(error)));
  await page.goto("https://nishikohe.github.io/onsen-checkin-pwa/?cluster-debug=738", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(12000);
  const status = await page.evaluate(() => {
    const m = typeof map !== "undefined" ? map : null;
    const all = window.OnsenMapDiscoveryV737?.catalog?.() || [];
    return {
      version: window.OnsenBuildInfo?.version,
      clusterScript: !!document.getElementById("mapClustersV738Script"),
      cluster: window.OnsenMapClustersV738?.diagnostics?.(),
      catalog: all.reduce((acc, item) => (acc[item.domain] = (acc[item.domain] || 0) + 1, acc), {}),
      discovery: window.OnsenMapDiscoveryV737?.diagnostics?.(),
      router: window.OnsenMapDomainV73?.diagnostics?.(),
      loaded: m?.loaded?.(), styleLoaded: m?.isStyleLoaded?.(), zoomRangeFunction: typeof m?.setLayerZoomRange,
      source: !!m?.getSource?.("map-v738-clusters"), clusterLayer: !!m?.getLayer?.("map-v738-cluster"), singleLayer: !!m?.getLayer?.("map-v738-single"),
      original: m?.getLayer?.("spots-symbol")?.minzoom,
      panel: !!document.getElementById("mapClusterPickerV738")
    };
  });
  console.log("CLUSTER DEBUG", JSON.stringify(status));
  await browser.close();
})().catch(e => { console.error("CLUSTER DEBUG FATAL", e.stack || e); process.exitCode = 1; });