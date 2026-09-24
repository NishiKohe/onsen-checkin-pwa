"use strict";
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage"]
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      geolocation: { latitude: 35.69, longitude: 139.70, accuracy: 25 },
      permissions: ["geolocation"],
      serviceWorkers: "block"
    });

    const page = await context.newPage();
    const browserMessages = [];
    const pageErrors = [];

    page.on("console", msg => {
      if (["error", "warning"].includes(msg.type())) {
        browserMessages.push(msg.type() + ": " + msg.text());
      }
    });

    page.on("pageerror", error => {
      pageErrors.push(String(error));
    });

    await page.goto(
      "https://nishikohe.github.io/onsen-checkin-pwa/?aggregation-debug=7310",
      { waitUntil: "domcontentloaded", timeout: 60000 }
    );

    await page.waitForFunction(() =>
      window.OnsenBuildInfo?.version === "v73.10" &&
      !!window.OnsenMapClustersV738,
      null,
      { timeout: 60000 }
    );

    await page.waitForFunction(() =>
      window.OnsenMapClustersV738?.diagnostics?.().active,
      null,
      { timeout: 20000 }
    ).catch(() => {});

    await page.evaluate(() => {
      if (typeof map !== "undefined" && map) {
        map.jumpTo({ center: [139.7, 35.69], zoom: 6.5 });
      }
    });

    await page.waitForTimeout(2500);

    const status = await page.evaluate(() => {
      const m = typeof map !== "undefined" ? map : null;
      const overlay = document.getElementById("mapClusterOverlayV738");
      const markers = overlay
        ? [...overlay.querySelectorAll(".map-cluster-marker-v738")]
        : [];
      const groups = markers.filter(button =>
        button.classList.contains("is-group")
      );
      const catalog = window.OnsenMapDiscoveryV737?.catalog?.() || [];

      return {
        version: window.OnsenBuildInfo?.version || null,
        aggregation: window.OnsenMapClustersV738?.diagnostics?.() || null,
        catalog: catalog.reduce((acc, item) => {
          acc[item.domain] = (acc[item.domain] || 0) + 1;
          return acc;
        }, {}),
        mapReady: !!m,
        center: m?.getCenter?.().toArray?.() || null,
        zoom: m?.getZoom?.() ?? null,
        styleLoaded: m?.isStyleLoaded?.() ?? false,
        overlayExists: !!overlay,
        overlayHidden: overlay?.hidden ?? true,
        domMarkers: markers.length,
        domGroups: groups.length,
        domSingles: markers.length - groups.length,
        groupSamples: groups.slice(0, 5).map(button => ({
          count: Number(button.dataset.count),
          members: Number(button.dataset.memberCount),
          domain: button.dataset.domain
        })),
        originalMinZoom: m?.getLayer?.("spots-symbol")?.minzoom ?? null,
        scenicMinZoom: m?.getLayer?.("scenic-v734-points")?.minzoom ?? null
      };
    });

    status.browserMessages = browserMessages.slice(0, 20);
    status.pageErrors = pageErrors.slice(0, 20);

    console.log("DOM AGGREGATION DEBUG", JSON.stringify(status));

    const highZoom = await page.evaluate(async () => {
      const scenic = window.OnsenMapDiscoveryV737?.catalog?.()
        ?.filter(item => item.domain === "scenic") || [];
      const target = [139.70, 35.69];
      const sample = scenic
        .map(item => ({
          ...item,
          testDistance:
            Math.pow(item.lng - target[0], 2) +
            Math.pow(item.lat - target[1], 2)
        }))
        .sort((a, b) => a.testDistance - b.testDistance)[0];

      window.OnsenMapDomainV73?.setMode?.("scenic", {
        source: "v7310-debug"
      });
      map.jumpTo({
        center: [sample.lng, sample.lat],
        zoom: 11.5
      });

      await new Promise(resolve => setTimeout(resolve, 1200));

      const rect = map.getCanvas().getBoundingClientRect();
      const box = [[0, 0], [rect.width, rect.height]];
      const point = map.project([sample.lng, sample.lat]);
      const before = {
        sample: {
          id: sample.id,
          name: sample.name,
          lng: sample.lng,
          lat: sample.lat
        },
        center: map.getCenter().toArray(),
        zoom: map.getZoom(),
        projected: [point.x, point.y],
        pointLayerFilter: map.getFilter("scenic-v734-points"),
        labelLayerFilter: map.getFilter("scenic-v734-labels"),
        sourceFeatureCount:
          map.querySourceFeatures("scenic-v734-source").length,
        viewportRendered:
          map.queryRenderedFeatures(box, {
            layers: ["scenic-v734-points"]
          }).length,
        pointRendered:
          map.queryRenderedFeatures(point, {
            layers: ["scenic-v734-points"]
          }).length
      };

      const pointFilter = map.getFilter("scenic-v734-points");
      const labelFilter = map.getFilter("scenic-v734-labels");

      map.setFilter("scenic-v734-points", null);
      map.setFilter("scenic-v734-labels", null);
      await new Promise(resolve => setTimeout(resolve, 250));

      const after = {
        sourceFeatureCount:
          map.querySourceFeatures("scenic-v734-source").length,
        viewportRendered:
          map.queryRenderedFeatures(box, {
            layers: ["scenic-v734-points"]
          }).length,
        pointRendered:
          map.queryRenderedFeatures(point, {
            layers: ["scenic-v734-points"]
          }).length
      };

      map.setFilter("scenic-v734-points", pointFilter || null);
      map.setFilter("scenic-v734-labels", labelFilter || null);

      return { before, after };
    });

    console.log("HIGH ZOOM FILTER DEBUG", JSON.stringify(highZoom));

    if (!status.aggregation?.active) {
      throw new Error(
        "v73.10 aggregation did not become active: " +
        JSON.stringify(status)
      );
    }

    if (status.domGroups < 1 || status.domMarkers < 1) {
      throw new Error(
        "v73.10 aggregation rendered no DOM bubbles: " +
        JSON.stringify(status)
      );
    }
  } finally {
    await browser.close().catch(() => {});
  }
})().catch(error => {
  console.error(
    "DOM AGGREGATION DEBUG FATAL",
    error.stack || error
  );
  process.exitCode = 1;
});
