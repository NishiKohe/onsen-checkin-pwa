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
    let published = false;
    for (let i = 0; i < 30; i++) {
      await page.goto(`${BASE}?qa=73.8-${i}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1600);
      published = await page.evaluate(() => window.OnsenBuildInfo?.version === "v73.8");
      if (published) break;
      await page.waitForTimeout(2000);
    }
    assert.ok(published, "v73.8 not yet publicly deployed");
    await page.waitForFunction(() => window.OnsenMapClustersV738?.diagnostics?.().active &&
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
    console.log("PASS all three catalogs and cluster source", JSON.stringify(start));

    await page.locator('[data-map-domain="all"]').click();
    await page.evaluate(() => map.jumpTo({ center: [139.70, 35.69], zoom: 6.5 }));
    await page.waitForTimeout(1300);
    const overview = await page.evaluate(() => {
      const cluster = map.queryRenderedFeatures(undefined, { layers: ["map-v738-cluster"] });
      const singles = map.queryRenderedFeatures(undefined, { layers: ["map-v738-single"] });
      const original = map.getLayer("spots-symbol");
      return { clusterCount: cluster.length, singles: singles.length, originalMinZoom: original?.minzoom,
        clusterMaxZoom: map.getLayer("map-v738-cluster")?.maxzoom,
        counts: cluster.slice(0, 3).map(f => f.properties.point_count) };
    });
    assert.ok(overview.clusterCount > 0, `no clusters rendered near Tokyo: ${JSON.stringify(overview)}`);
    assert.equal(overview.originalMinZoom, 10);
    assert.equal(overview.clusterMaxZoom, 10);
    console.log("PASS low zoom shows count bubbles rather than original overlapping pins", JSON.stringify(overview));

    const clusterApi = await page.evaluate(async () => {
      const feature = map.queryRenderedFeatures(undefined, { layers: ["map-v738-cluster"] })
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
    console.log("PASS cluster expands and exposes selectable catalog leaves", JSON.stringify(clusterApi));

    for (const [domain, expected] of [["castle", 200], ["scenic", 433], ["onsen", start.catalog.onsen], ["all", start.cluster.featuresCount]]) {
      await page.locator(`[data-map-domain="${domain}"]`).click();
      await page.waitForFunction(count => window.OnsenMapClustersV738?.diagnostics?.().featuresCount === count, expected);
      assert.equal(await page.evaluate(() => window.OnsenMapClustersV738.diagnostics().active), true);
      console.log(`PASS ${domain} cluster input ${expected} features`);
    }

    await page.locator("#mapDiscoveryToggleV737").click();
    const sample = await page.evaluate(() => window.OnsenMapDiscoveryV737.catalog().find(item => item.domain === "scenic"));
    await page.locator("#mapDiscoveryQueryV737").fill(sample.name);
    await page.waitForFunction(() => window.OnsenMapClustersV738.diagnostics().featuresCount === window.OnsenMapDiscoveryV737.diagnostics().results &&
      window.OnsenMapDiscoveryV737.diagnostics().results > 0);
    const matches = await page.evaluate(() => ({ cluster: window.OnsenMapClustersV738.diagnostics().featuresCount,
      search: window.OnsenMapDiscoveryV737.diagnostics().results }));
    assert.ok(matches.search > 0 && matches.search < start.cluster.featuresCount);
    console.log("PASS search matches cluster contents", JSON.stringify(matches));
    await page.locator("#mapDiscoveryResetV737").click();
    await page.locator("#mapDiscoveryToggleV737").click();

    await page.locator('[data-map-domain="scenic"]').click();
    await page.evaluate(item => map.jumpTo({ center: [item.lng, item.lat], zoom: 11.5 }), sample);
    await page.waitForTimeout(1100);
    const detail = await page.evaluate(item => ({
      sourceCount: window.OnsenScenicRendererV734.featureCount(),
      originalMinZoom: map.getLayer("scenic-v734-points")?.minzoom,
      visible: map.getLayoutProperty("scenic-v734-points", "visibility"),
      rendered: map.queryRenderedFeatures(map.project([item.lng, item.lat]), { layers: ["scenic-v734-points"] }).length,
      selected: window.OnsenMapDetailV736.select("scenic", item.id) && window.OnsenMapDetailV736.present("scenic", item.id),
      checkinExists: !!document.getElementById("scenicMapCheckinV71")
    }), sample);
    assert.equal(detail.sourceCount, 433);
    assert.equal(detail.originalMinZoom, 10);
    assert.equal(detail.visible, "visible");
    assert.ok(detail.rendered > 0, `original scenic pins missing at close zoom: ${JSON.stringify(detail)}`);
    assert.equal(detail.selected, true);
    assert.equal(detail.checkinExists, true);
    console.log("PASS close zoom restores canonical scenic pins and detail/check-in", JSON.stringify(detail));

    await page.locator("#scenicMapPanelV71 .map-detail-close-v736").click();
    await page.locator('[data-map-domain="castle"]').click();
    assert.ok(await page.locator("#castleMapCheckinV62").count());
    await page.locator('[data-map-domain="onsen"]').click();
    assert.ok(await page.locator("#btnCheckin").count());
    assert.deepEqual(errors, [], `uncaught browser errors: ${errors.join(" | ")}`);
    console.log("All published v73.8 map cluster and check-in regressions passed");
  } catch (error) {
    console.error("v73.8 map cluster browser failure", error.stack || error);
    console.error("Page errors", errors.slice(0, 12).join(" | "));
    await page.screenshot({ path: "map-clusters-v738-failure.png", fullPage: true }).catch(() => {});
    process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });