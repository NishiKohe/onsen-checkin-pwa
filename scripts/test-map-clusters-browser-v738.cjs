"use strict";
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const BASE = "https://nishikohe.github.io/onsen-checkin-pwa/";

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage"]
  });

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
    await page.goto(BASE + "?qa=v7310-dom-aggregation", {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await page.waitForFunction(() =>
      window.OnsenBuildInfo?.version === "v73.10" &&
      window.OnsenMapClustersV738?.diagnostics?.().build === "v73.10" &&
      window.OnsenMapClustersV738?.diagnostics?.().active &&
      window.OnsenScenicRendererV734?.featureCount?.() === 433 &&
      window.OnsenMapDiscoveryV737?.catalog?.().length >= 856 &&
      window.OnsenCastleMap &&
      window.OnsenMapDomainV73,
      null,
      { timeout: 60000 }
    );

    const start = await page.evaluate(() => {
      const all = window.OnsenMapDiscoveryV737.catalog();

      return {
        catalog: all.reduce((acc, item) => {
          acc[item.domain] = (acc[item.domain] || 0) + 1;
          return acc;
        }, {}),
        aggregation: window.OnsenMapClustersV738.diagnostics(),
        mapHeight: document.getElementById("map").getBoundingClientRect().height,
        mainHeight: document.querySelector(".main").getBoundingClientRect().height
      };
    });

    assert.equal(start.catalog.castle, 200);
    assert.equal(start.catalog.scenic, 433);
    assert.ok(start.catalog.onsen > 0);
    assert.equal(start.aggregation.featuresCount, start.catalog.onsen + 633);
    assert.equal(start.aggregation.overlay, true);
    assert.ok(Math.abs(start.mapHeight - start.mainHeight) <= 2);

    console.log("PASS complete catalogs", JSON.stringify(start));

    await page.locator('[data-map-domain="all"]').click();
    await page.evaluate(() => {
      map.jumpTo({ center: [139.70, 35.69], zoom: 6.5 });
    });

    await page.waitForFunction(() => {
      const d = window.OnsenMapClustersV738?.diagnostics?.();
      const overlay = document.getElementById("mapClusterOverlayV738");

      return (
        d?.active &&
        d.renderedCount > 0 &&
        d.groupCount > 0 &&
        overlay &&
        !overlay.hidden &&
        overlay.querySelectorAll(".map-cluster-marker-v738").length === d.renderedCount
      );
    }, null, { timeout: 20000 });

    const overview = await page.evaluate(() => {
      const d = window.OnsenMapClustersV738.diagnostics();
      const overlay = document.getElementById("mapClusterOverlayV738");
      const groups = [...overlay.querySelectorAll(".map-cluster-marker-v738.is-group")];

      return {
        diagnostics: d,
        markers: overlay.querySelectorAll(".map-cluster-marker-v738").length,
        groups: groups.length,
        singles: overlay.querySelectorAll(".map-cluster-marker-v738.is-single").length,
        samples: groups.slice(0, 5).map(button => ({
          count: Number(button.dataset.count),
          members: Number(button.dataset.memberCount)
        }))
      };
    });

    assert.ok(overview.groups > 0, JSON.stringify(overview));
    assert.equal(
      overview.markers,
      overview.diagnostics.renderedCount,
      JSON.stringify(overview)
    );
    assert.ok(
      overview.samples.every(x => x.count >= 2 && x.members === x.count),
      JSON.stringify(overview)
    );

    assert.equal(
      await page.evaluate(() => map.getLayer("spots-symbol")?.minzoom),
      10
    );

    console.log(
      "PASS actual low zoom DOM aggregation",
      JSON.stringify(overview)
    );

    const clickable = await page.evaluate(() => {
      const canvasRect = map.getCanvas().getBoundingClientRect();
      const buttons = [
        ...document.querySelectorAll(
          "#mapClusterOverlayV738 .map-cluster-marker-v738.is-group"
        )
      ];

      const button =
        buttons.find(candidate => {
          const rect = candidate.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;

          return (
            x > canvasRect.left + 45 &&
            x < canvasRect.right - 45 &&
            y > canvasRect.top + 80 &&
            y < canvasRect.bottom - 80
          );
        }) || buttons[0];

      if (!button) return null;

      return {
        index: button.dataset.mapAggregateIndex,
        count: Number(button.dataset.count),
        beforeZoom: map.getZoom()
      };
    });

    assert.ok(clickable && clickable.count >= 2, JSON.stringify(clickable));

    await page.evaluate(index => {
      document
        .querySelector(
          '#mapClusterOverlayV738 [data-map-aggregate-index="' + index + '"]'
        )
        ?.click();
    }, clickable.index);

    await page.waitForFunction(
      before => map.getZoom() > before + 0.5,
      clickable.beforeZoom,
      { timeout: 10000 }
    );

    console.log(
      "PASS aggregation bubble expands map",
      JSON.stringify(clickable)
    );

    await page.evaluate(() => {
      map.jumpTo({ center: [139.70, 35.69], zoom: 6.5 });
    });

    for (const [domain, expected] of [
      ["castle", 200],
      ["scenic", 433],
      ["onsen", start.catalog.onsen],
      ["all", start.aggregation.featuresCount]
    ]) {
      await page.locator('[data-map-domain="' + domain + '"]').click();

      await page.waitForFunction(
        count => {
          const d = window.OnsenMapClustersV738?.diagnostics?.();
          return d?.featuresCount === count && d.active;
        },
        expected,
        { timeout: 20000 }
      );

      const d = await page.evaluate(() =>
        window.OnsenMapClustersV738.diagnostics()
      );

      assert.equal(d.active, true);
      assert.ok(d.renderedCount > 0, domain + ": " + JSON.stringify(d));

      console.log(
        "PASS " + domain + " DOM aggregation",
        JSON.stringify(d)
      );
    }

    await page.locator("#mapDiscoveryToggleV737").click();

    const sample = await page.evaluate(() =>
      window.OnsenMapDiscoveryV737
        .catalog()
        .find(item => item.domain === "scenic")
    );

    await page.locator("#mapDiscoveryQueryV737").fill(sample.name);

    await page.waitForFunction(() =>
      window.OnsenMapClustersV738.diagnostics().featuresCount ===
        window.OnsenMapDiscoveryV737.diagnostics().results &&
      window.OnsenMapDiscoveryV737.diagnostics().results > 0
    );

    const matches = await page.evaluate(() => ({
      aggregate: window.OnsenMapClustersV738.diagnostics().featuresCount,
      search: window.OnsenMapDiscoveryV737.diagnostics().results
    }));

    assert.ok(
      matches.search > 0 &&
      matches.search < start.aggregation.featuresCount
    );

    console.log(
      "PASS search filters DOM aggregation",
      JSON.stringify(matches)
    );

    await page.locator("#mapDiscoveryResetV737").click();
    await page.locator("#mapDiscoveryToggleV737").click();

    await page.locator('[data-map-domain="scenic"]').click();

    await page.evaluate(item => {
      map.jumpTo({ center: [item.lng, item.lat], zoom: 11.5 });
    }, sample);

    await page.waitForFunction(() => {
      const d = window.OnsenMapClustersV738?.diagnostics?.();
      return d && d.renderedCount === 0 && d.overlayHidden === true;
    }, null, { timeout: 10000 });

    let rendered = 0;

    for (let i = 0; i < 16; i++) {
      rendered = await page.evaluate(item =>
        map.queryRenderedFeatures(
          map.project([item.lng, item.lat]),
          { layers: ["scenic-v734-points"] }
        ).length,
        sample
      );

      if (rendered) break;
      await page.waitForTimeout(450);
    }

    const detail = await page.evaluate(item => ({
      sourceCount: window.OnsenScenicRendererV734.featureCount(),
      originalMinZoom: map.getLayer("scenic-v734-points")?.minzoom,
      visible: map.getLayoutProperty(
        "scenic-v734-points",
        "visibility"
      ),
      selected:
        window.OnsenMapDetailV736.select("scenic", item.id) &&
        window.OnsenMapDetailV736.present("scenic", item.id),
      checkinExists: !!document.getElementById("scenicMapCheckinV71")
    }), sample);

    assert.equal(detail.sourceCount, 433);
    assert.equal(detail.originalMinZoom, 10);
    assert.equal(detail.visible, "visible");
    assert.ok(
      rendered > 0,
      "original scenic pins not displayed at zoom 11.5: " +
        JSON.stringify(detail)
    );
    assert.equal(detail.selected, true);
    assert.equal(detail.checkinExists, true);

    console.log(
      "PASS original scenic pin and check-in at high zoom",
      JSON.stringify(detail)
    );

    await page
      .locator("#scenicMapPanelV71 .map-detail-close-v736")
      .click();

    await page.locator('[data-map-domain="castle"]').click();
    assert.ok(await page.locator("#castleMapCheckinV62").count());

    await page.locator('[data-map-domain="onsen"]').click();
    assert.ok(await page.locator("#btnCheckin").count());

    assert.deepEqual(
      errors,
      [],
      "uncaught page errors: " + errors.join(" | ")
    );

    console.log(
      "All published v73.10 DOM aggregation regressions passed"
    );
  } catch (error) {
    console.error(
      "v73.10 browser failure",
      error.stack || error
    );
    console.error(
      "Page errors",
      errors.slice(0, 12).join(" | ")
    );

    await page
      .screenshot({
        path: "map-clusters-v738-failure.png",
        fullPage: true
      })
      .catch(() => {});

    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
