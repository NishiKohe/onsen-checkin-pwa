"use strict";
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
    geolocation: { latitude: 35.69, longitude: 139.70, accuracy: 25 },
    permissions: ["geolocation"], serviceWorkers: "block"
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  try {
    await page.goto("https://nishikohe.github.io/onsen-checkin-pwa/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => window.OnsenMapDetailV736?.build === "v73.6" &&
      window.OnsenScenicRendererV734?.featureCount?.() === 433 &&
      window.OnsenCastleMap && window.OnsenMapDomainV73?.diagnostics?.().castleLayer,
      { timeout: 90000 });
    const metrics = await page.evaluate(() => {
      const root = document.querySelector(".main").getBoundingClientRect();
      const canvas = document.getElementById("map").getBoundingClientRect();
      const panels = [...document.querySelectorAll(".main > .panel")].map(panel => getComputedStyle(panel).display);
      return { build: window.OnsenBuildInfo.version, root: { width: root.width, height: root.height },
        canvas: { width: canvas.width, height: canvas.height }, panels,
        zoom: map.getZoom(), center: map.getCenter(), tabs: [...document.querySelectorAll("[data-map-domain]")].map(x => x.dataset.mapDomain) };
    });
    assert.equal(metrics.build, "v73.6");
    assert.deepEqual(metrics.tabs, ["all", "onsen", "castle", "scenic"]);
    assert.ok(Math.abs(metrics.root.width - metrics.canvas.width) <= 2, "map uses full content width");
    assert.ok(Math.abs(metrics.root.height - metrics.canvas.height) <= 2, "map uses full content height");
    assert.ok(metrics.panels.every(value => value === "none"), "no detail is open before a pin tap");
    await page.waitForFunction(() => map.getZoom() >= 10.5, { timeout: 13000 });
    console.log("PASS mobile full-viewport layout, four tabs and local startup camera", JSON.stringify(metrics));

    await page.locator('[data-map-domain="all"]').click();
    await page.waitForFunction(() => window.OnsenMapDomainV73.getMode() === "all" &&
      map.getLayoutProperty("spots-symbol", "visibility") === "visible" &&
      map.getLayoutProperty("castles-v62-symbol", "visibility") === "visible" &&
      map.getLayoutProperty("scenic-v734-points", "visibility") === "visible");
    const scenic = await page.evaluate(() => {
      const feature = map.getSource("scenic-v734-source")._data.features[0];
      map.jumpTo({ center: feature.geometry.coordinates, zoom: 12 });
      return { id: feature.properties.id, coords: feature.geometry.coordinates };
    });
    await page.waitForTimeout(900);
    const point = await page.evaluate(coords => {
      const p = map.project(coords), rect = map.getCanvas().getBoundingClientRect();
      return { x: rect.left + p.x, y: rect.top + p.y };
    }, scenic.coords);
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(id => {
      const panel = document.getElementById("scenicMapPanelV71");
      return window.OnsenMapDetailV736?.diagnostics?.().currentSelection?.id === id &&
        panel && getComputedStyle(panel).display !== "none";
    }, scenic.id, { timeout: 12000 });
    assert.equal(await page.locator("#scenicMapNameV71").isVisible(), true);
    await page.locator("#scenicMapPanelV71 .map-detail-close-v736").click();
    assert.equal(await page.locator("#scenicMapPanelV71").isVisible(), false);
    console.log("PASS combined-mode scenic pin opens and closes correct detail sheet");

    await page.locator('[data-map-domain="castle"]').click();
    await page.waitForFunction(() => window.OnsenMapDomainV73.getMode() === "castle");
    const castle = await page.evaluate(() => {
      const data = map.getSource("castles-v62")._data.features[0];
      map.jumpTo({ center: data.geometry.coordinates, zoom: 12 });
      return { id: data.properties.id, coords: data.geometry.coordinates };
    });
    await page.waitForTimeout(900);
    const castlePoint = await page.evaluate(coords => {
      const p = map.project(coords), rect = map.getCanvas().getBoundingClientRect();
      return { x: rect.left + p.x, y: rect.top + p.y };
    }, castle.coords);
    await page.mouse.click(castlePoint.x, castlePoint.y);
    await page.waitForFunction(id => window.OnsenMapDetailV736?.diagnostics?.().currentSelection?.id === id &&
      getComputedStyle(document.getElementById("castleMapPanelV62")).display !== "none", castle.id, { timeout: 12000 });
    assert.equal(await page.locator("#scenicMapPanelV71").isVisible(), false);
    console.log("PASS castle pin opens castle details only");
    if (errors.length) console.log("Browser warnings:", errors.slice(0, 8).join(" | "));
    console.log("All v73.6 published mobile browser assertions passed");
  } catch (error) {
    console.error("Browser assertion failed:", error.stack || error);
    console.error("Page warnings:", errors.slice(0, 15).join(" | "));
    await page.screenshot({ path: "map-immersive-browser-failure.png", fullPage: true }).catch(() => {});
    process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });