"use strict";
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const BASE = "https://nishikohe.github.io/onsen-checkin-pwa/";
(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
    geolocation: { latitude: 35.69, longitude: 139.70, accuracy: 25 }, permissions: ["geolocation"], serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  try {
    await page.goto(`${BASE}?qa=v738-stable`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => window.OnsenBuildInfo?.version === "v73.8" &&
      typeof window.OnsenMapClustersV738?.diagnostics?.().sourceUpdates === "number" &&
      window.OnsenMapClustersV738?.diagnostics?.().active &&
      window.OnsenScenicRendererV734?.featureCount?.() === 433 &&
      window.OnsenMapDiscoveryV737?.catalog?.().length >= 856 &&
      window.OnsenCastleMap && window.OnsenMapDomainV73, null, { timeout: 60000 });
    const start = await page.evaluate(() => {
      const all = window.OnsenMapDiscoveryV737.catalog();
      return { catalog: all.reduce((acc, item) => (acc[item.domain] = (acc[item.domain] || 0) + 1, acc), {}),
        cluster: window.OnsenMapClustersV738.diagnostics(), mapHeight: document.getElementById("map").getBoundingClientRect().height,
        mainHeight: document.querySelector(".main").getBoundingClientRect().height };
    });
    assert.equal(start.catalog.castle, 200);
    assert.equal(start.catalog.scenic, 433);
    assert.ok(start.catalog.onsen > 0);
    assert.equal(start.cluster.featuresCount, start.catalog.onsen + 633);
    assert.ok(Math.abs(start.mapHeight - start.mainHeight) <= 2);
    console.log("PASS complete 856-place catalogs", JSON.stringify(start));

    await page.locator('[data-map-domain="all"]').click();
    await page.evaluate(() => map.jumpTo({ center: [139.70, 35.69], zoom: 6.5 }));
    let overview = null;
    for (let attempt = 0; attempt < 25; attempt++) {
      const found = await page.evaluate(() => {
        const rect = map.getCanvas().getBoundingClientRect();
        const box = [[0,0],[rect.width,rect.height]];
        const clusters = map.queryRenderedFeatures(box, { layers: ["map-v738-cluster"] });
        const singles = map.queryRenderedFeatures(box, { layers: ["map-v738-single"] });
        return { count: clusters.length, singles: singles.length, samples: clusters.slice(0, 3).map(f => f.properties.point_count) };
      });
      if (found.count) { overview = found; break; }
      await page.waitForTimeout(650);
    }
    if (!overview) {
      const snapshot = await page.evaluate(() => {
        const m = map, source = m.getSource("map-v738-clusters");
        return { zoom: m.getZoom(), center: m.getCenter().toArray(), loaded: m.loaded(), styleLoaded: m.isStyleLoaded(),
          sourceLoaded: m.isSourceLoaded("map-v738-clusters"),
          clusterVisibility: m.getLayoutProperty("map-v738-cluster", "visibility"),
          clusterDataSize: source?._data?.features?.length, diagnostics: window.OnsenMapClustersV738.diagnostics(),
          visibleAny: m.queryRenderedFeatures([[0,0],[390,700]]).slice(0,3).map(f => f.layer.id) };
      });
      throw new Error(`cluster layer drew zero features: ${JSON.stringify(snapshot)}`);
    }
    assert.equal(await page.evaluate(() => map.getLayer("spots-symbol")?.minzoom), 10);
    assert.equal(await page.evaluate(() => map.getLayer("map-v738-cluster")?.maxzoom), 10);
    console.log("PASS actual low zoom cluster bubbles", JSON.stringify(overview));

    const clusterApi = await page.evaluate(async () => {
      const r = map.getCanvas().getBoundingClientRect();
      const feature = map.queryRenderedFeatures([[0,0],[r.width,r.height]], { layers: ["map-v738-cluster"] })
        .find(f => Number(f.properties.point_count) >= 2);
      const source = map.getSource("map-v738-clusters");
      if (!feature || !source) return null;
      const id = Number(feature.properties.cluster_id);
      const zoom = await source.getClusterExpansionZoom(id);
      const leaves = await source.getClusterLeaves(id, 2, 0);
      return { count: Number(feature.properties.point_count), zoom, leaves: leaves.length, domain: leaves[0]?.properties?.domain };
    });
    assert.ok(clusterApi && clusterApi.count >= 2 && clusterApi.leaves > 0, JSON.stringify(clusterApi));
    assert.ok(["onsen", "castle", "scenic"].includes(clusterApi.domain));
    console.log("PASS expansion and cluster member lookup", JSON.stringify(clusterApi));

    for (const [domain, expected] of [["castle", 200], ["scenic", 433], ["onsen", start.catalog.onsen], ["all", start.cluster.featuresCount]]) {
      await page.locator(`[data-map-domain="${domain}"]`).click();
      await page.waitForFunction(count => window.OnsenMapClustersV738?.diagnostics?.().featuresCount === count, expected, { timeout: 20000 });
      assert.equal(await page.evaluate(() => window.OnsenMapClustersV738.diagnostics().active), true);
      console.log(`PASS ${domain} ${expected} clustered source features`);
    }
    await page.locator("#mapDiscoveryToggleV737").click();
    const sample = await page.evaluate(() => window.OnsenMapDiscoveryV737.catalog().find(item => item.domain === "scenic"));
    await page.locator("#mapDiscoveryQueryV737").fill(sample.name);
    await page.waitForFunction(() => window.OnsenMapClustersV738.diagnostics().featuresCount === window.OnsenMapDiscoveryV737.diagnostics().results &&
      window.OnsenMapDiscoveryV737.diagnostics().results > 0);
    const matches = await page.evaluate(() => ({ cluster: window.OnsenMapClustersV738.diagnostics().featuresCount,
      search: window.OnsenMapDiscoveryV737.diagnostics().results }));
    assert.ok(matches.search > 0 && matches.search < start.cluster.featuresCount);
    console.log("PASS search filters cluster source", JSON.stringify(matches));
    await page.locator("#mapDiscoveryResetV737").click();
    await page.locator("#mapDiscoveryToggleV737").click();

    await page.locator('[data-map-domain="scenic"]').click();
    await page.evaluate(item => map.jumpTo({ center: [item.lng, item.lat], zoom: 11.5 }), sample);
    let rendered = 0;
    for (let i = 0; i < 16; i++) {
      rendered = await page.evaluate(item => map.queryRenderedFeatures(map.project([item.lng, item.lat]), { layers: ["scenic-v734-points"] }).length, sample);
      if (rendered) break;
      await page.waitForTimeout(450);
    }
    const detail = await page.evaluate(item => ({
      sourceCount: window.OnsenScenicRendererV734.featureCount(),
      originalMinZoom: map.getLayer("scenic-v734-points")?.minzoom,
      visible: map.getLayoutProperty("scenic-v734-points", "visibility"),
      selected: window.OnsenMapDetailV736.select("scenic", item.id) && window.OnsenMapDetailV736.present("scenic", item.id),
      checkinExists: !!document.getElementById("scenicMapCheckinV71")
    }), sample);
    assert.equal(detail.sourceCount, 433);
    assert.equal(detail.originalMinZoom, 10);
    assert.equal(detail.visible, "visible");
    assert.ok(rendered > 0, `original scenic pins not displayed at zoom 11.5: ${JSON.stringify(detail)}`);
    assert.equal(detail.selected, true);
    assert.equal(detail.checkinExists, true);
    console.log("PASS original scenic pin and check-in at high zoom", JSON.stringify(detail));
    await page.locator("#scenicMapPanelV71 .map-detail-close-v736").click();
    await page.locator('[data-map-domain="castle"]').click();
    assert.ok(await page.locator("#castleMapCheckinV62").count());
    await page.locator('[data-map-domain="onsen"]').click();
    assert.ok(await page.locator("#btnCheckin").count());
    assert.deepEqual(errors, [], `uncaught page errors: ${errors.join(" | ")}`);
    console.log("All published v73.8 clustering regressions passed");
  } catch (error) {
    console.error("v73.8 browser failure", error.stack || error);
    console.error("Page errors", errors.slice(0, 12).join(" | "));
    await page.screenshot({ path: "map-clusters-v738-failure.png", fullPage: true }).catch(() => {});
    process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });