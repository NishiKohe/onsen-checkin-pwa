"use strict";
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, geolocation: { latitude: 35.69, longitude: 139.70, accuracy: 25 }, permissions: ["geolocation"], serviceWorkers: "block" });
  const page = await context.newPage();
  page.on("console", msg => { if (["error", "warning"].includes(msg.type())) console.log("BROWSER", msg.type(), msg.text()); });
  page.on("pageerror", error => console.log("PAGEERROR", String(error)));
  await page.goto("https://nishikohe.github.io/onsen-checkin-pwa/?cluster-debug=738-deep", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.OnsenMapClustersV738?.diagnostics?.().active, null, { timeout: 60000 });
  await page.evaluate(() => { map.on("error", ev => console.log("MAP ERROR", ev.error?.message || JSON.stringify(ev))); map.jumpTo({ center: [139.7, 35.69], zoom: 6.5 }); });
  await page.waitForTimeout(5000);
  const status = await page.evaluate(() => {
    const m = map, source = m.getSource("map-v738-clusters"), canvas = m.getCanvas().getBoundingClientRect();
    const box = [[0,0],[canvas.width,canvas.height]];
    const data = source?._data;
    let raw = data;
    if (typeof data === "string") { try { raw = JSON.parse(data); } catch {} }
    const coords = raw?.features?.slice(0,4).map(f => ({ domain:f.properties?.domain, xy:f.geometry?.coordinates })) || [];
    const sourceFeatures = m.querySourceFeatures("map-v738-clusters");
    const renderedClusters = m.queryRenderedFeatures(box, { layers:["map-v738-cluster"] });
    const renderedSingles = m.queryRenderedFeatures(box, { layers:["map-v738-single"] });
    const canonical = m.queryRenderedFeatures(box, { layers:["spots-symbol","scenic-v734-points"] });
    const layer = m.getLayer("map-v738-cluster");
    const style = m.getStyle();
    return { cluster: window.OnsenMapClustersV738.diagnostics(), center:m.getCenter().toArray(), zoom:m.getZoom(),
      loaded:m.loaded(), styleLoaded:m.isStyleLoaded(), sourceLoaded:m.isSourceLoaded("map-v738-clusters"), sourceType:source?.type,
      rawCount:raw?.features?.length, coords, sourceFeatureCount:sourceFeatures.length,
      sourceSamples:sourceFeatures.slice(0,3).map(f => ({props:f.properties,geometry:f.geometry})),
      renderedClusterCount:renderedClusters.length, renderedSingleCount:renderedSingles.length,
      renderedCanonical:canonical.length, layerFilter:layer?.filter, layerMin:layer?.minzoom, layerMax:layer?.maxzoom,
      sourceDefinition:style.sources?.["map-v738-clusters"], viewport:box,
      queryStyleCount:m.queryRenderedFeatures(box).length,
      layerVisibility:m.getLayoutProperty("map-v738-cluster","visibility"),
      sourceCache:m.style?._sourceCaches?.["map-v738-clusters"]?._tiles && Object.keys(m.style._sourceCaches["map-v738-clusters"]._tiles).slice(0,6)
    };
  });
  console.log("CLUSTER DEEP", JSON.stringify(status));
  await browser.close();
})().catch(e => { console.error("CLUSTER DEBUG FATAL", e.stack || e); process.exitCode = 1; });