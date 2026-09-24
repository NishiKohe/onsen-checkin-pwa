"use strict";
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const BASE = "https://nishikohe.github.io/onsen-checkin-pwa/";

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    geolocation: { latitude: 35.69, longitude: 139.70, accuracy: 25 },
    permissions: ["geolocation"],
    serviceWorkers: "block"
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));

  try {
    await page.goto(BASE + "?qa=v739-aggregation", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() =>
      window.OnsenBuildInfo?.version === "v73.9" &&
      window.OnsenMapClustersV738?.diagnostics?.().build === "v73.9" &&
      window.OnsenMapClustersV738?.diagnostics?.().active &&
      window.OnsenScenicRendererV734?.featureCount?.() === 433 &&
      window.OnsenMapDiscoveryV737?.catalog?.().length >= 856 &&
      window.OnsenCastleMap && window.OnsenMapDomainV73,
      null, { timeout: 60000 }
    );

    const start = await page.evaluate(() => {
      const all = window.OnsenMapDiscoveryV737.catalog();
      return {
        catalog: all.reduce((acc, item) => (acc[item.domain] = (acc[item.domain] || 0) + 1, acc), {}),
        aggregation: window.OnsenMapClustersV738.diagnostics(),
        mapHeight: document.getElementById("map").getBoundingClientRect().height,
        mainHeight: document.querySelector(".main").getBoundingClientRect().height
      };
    });

    assert.equal(start.catalog.castle, 200);
    assert.equal(start.catalog.scenic, 433);
    assert.ok(start.catalog.onsen > 0);
    assert.equal(start.aggregation.featuresCount, start.catalog.onsen + 633);
    assert.ok(Math.abs(start.mapHeight - start.mainHeight) <= 2);
    console.log("PASS complete catalogs", JSON.stringify(start));

    await page.locator('[data-map-domain="all"]').click();
    await page.evaluate(() => map.jumpTo({ center: [139.70, 35.69], zoom: 6.5 }));

    await page.waitForFunction(() => {
      const d = window.OnsenMapClustersV738?.diagnostics?.();
      return d?.active && d.groupCount > 0 && d.renderedCount > 0;
    }, null, { timeout: 20000 });

    let overview = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      const found = await page.evaluate(() => {
        const rect = map.getCanvas().getBoundingClientRect();
        const box = [[0, 0], [rect.width, rect.height]];
        const groups = map.queryRenderedFeatures(box, { layers: ["map-v738-cluster"] });
        const singles = map.queryRenderedFeatures(box, { layers: ["map-v738-single"] });
        return {
          groups: groups.length,
          singles: singles.length,
          sample: groups.slice(0, 3).map(f => ({
            count: Number(f.properties.count),
            members: String(f.properties.members || "").split("\u001f").length
          }))
        };
      });
      if (found.groups > 0) { overview = found; break; }
      await page.waitForTimeout(500);
    }

    if (!overview) {
      const snapshot = await page.evaluate(() => {
        const source = map.getSource("map-v738-clusters");
        return {
          zoom: map.getZoom(),
          center: map.getCenter().toArray(),
          styleLoaded: map.isStyleLoaded(),
          sourceLoaded: map.isSourceLoaded("map-v738-clusters"),
          sourceDataSize: source?._data?.features?.length,
          diagnostics: window.OnsenMapClustersV738.diagnostics(),
          visibility: map.getLayoutProperty("map-v738-cluster", "visibility")
        };
      });
      throw new Error("aggregation layer drew zero groups: " + JSON.stringify(snapshot));
    }

    assert.equal(await page.evaluate(() => map.getLayer("spots-symbol")?.minzoom), 10);
    assert.equal(await page.evaluate(() => map.getLayer("map-v738-cluster")?.maxzoom), 10);
    assert.ok(overview.sample.every(x => x.count >= 2 && x.members === x.count), JSON.stringify(overview));
    console.log("PASS actual low zoom aggregation bubbles", JSON.stringify(overview));

    const bubble = await page.evaluate(() => {
      const rect = map.getCanvas().getBoundingClientRect();
      const groups = map.queryRenderedFeatures([[0,0],[rect.width,rect.height]], { layers: ["map-v738-cluster"] });
      const feature = groups.find(f => {
        const p = map.project(f.geometry.coordinates);
        return p.x > 45 && p.x < rect.width - 45 && p.y > 80 && p.y < rect.height - 80;
      }) || groups[0];
      if (!feature) return null;
      const p = map.project(feature.geometry.coordinates);
      return {
        x: rect.left + p.x,
        y: rect.top + p.y,
        count: Number(feature.properties.count),
        members: String(feature.properties.members || "").split("\u001f").length,
        zoom: map.getZoom()
      };
    });
    assert.ok(bubble && bubble.count >= 2, JSON.stringify(bubble));
    await page.mouse.click(bubble.x, bubble.y);
    await page.waitForFunction(before => map.getZoom() > before + 0.5, bubble.zoom, { timeout: 10000 });
    console.log("PASS aggregation bubble expands map", JSON.stringify(bubble));

    await page.evaluate(() => map.jumpTo({ center: [139.70, 35.69], zoom: 6.5 }));
    for (const [domain, expected] of [["castle", 200], ["scenic", 433], ["onsen", start.catalog.onsen], ["all", start.aggregation.featuresCount]]) {
      await page.locator('[data-map-domain="' + domain + '"]').click();
      await page.waitForFunction(count => window.OnsenMapClustersV738?.diagnostics?.().featuresCount === count, expected, { timeout: 20000 });
      const d = await page.evaluate(() => window.OnsenMapClustersV738.diagnostics());
      assert.equal(d.active, true);
      assert.ok(d.renderedCount > 0);
      console.log("PASS " + domain + " aggregation source", JSON.stringify(d));
    }

    await page.locator("#mapDiscoveryToggleV737").click();
    const sample = await page.evaluate(() => window.OnsenMapDiscoveryV737.catalog().find(item => item.domain === "scenic"));
    await page.locator("#mapDiscoveryQueryV737").fill(sample.name);
    await page.waitForFunction(() =>
      window.OnsenMapClustersV738.diagnostics().featuresCount === window.OnsenMapDiscoveryV737.diagnostics().results &&
      window.OnsenMapDiscoveryV737.diagnostics().results > 0
    );
    const matches = await page.evaluate(() => ({
      aggregate: window.OnsenMapClustersV738.diagnostics().featuresCount,
      search: window.OnsenMapDiscoveryV737.diagnostics().results
    }));
    assert.ok(matches.search > 0 && matches.search < start.aggregation.featuresCount);
    console.log("PASS search filters aggregation", JSON.stringify(matches));
    await page.locator("#mapDiscoveryResetV737").click();
    await page.locator("#mapDiscoveryToggleV737").click();

    await page.locator('[data-map-domain="scenic"]').click();
    await page.evaluate(item => map.jumpTo({ center: [item.lng, item.lat], zoom: 11.5 }), sample);
    let rendered = 0;
    for (let i = 0; i < 16; i++) {
      rendered = await page.evaluate(item =>
        map.queryRenderedFeatures(map.project([item.lng, item.lat]), { layers: ["scenic-v734-points"] }).length,
        sample
      );
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
    assert.ok(rendered > 0, "original scenic pins not displayed at zoom 11.5: " + JSON.stringify(detail));
    assert.equal(detail.selected, true);
    assert.equal(detail.checkinExists, true);
    console.log("PASS original scenic pin and check-in at high zoom", JSON.stringify(detail));

    await page.locator("#scenicMapPanelV71 .map-detail-close-v736").click();
    await page.locator('[data-map-domain="castle"]').click();
    assert.ok(await page.locator("#castleMapCheckinV62").count());
    await page.locator('[data-map-domain="onsen"]').click();
    assert.ok(await page.locator("#btnCheckin").count());
    assert.deepEqual(errors, [], "uncaught page errors: " + errors.join(" | "));
    console.log("All published v73.9 aggregation regressions passed");
  } catch (error) {
    console.error("v73.9 browser failure", error.stack || error);
    console.error("Page errors", errors.slice(0, 12).join(" | "));
    await page.screenshot({ path: "map-clusters-v738-failure.png", fullPage: true }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
