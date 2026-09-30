"use strict";
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const BASE = process.env.ONSEN_TEST_BASE_URL || "https://nishikohe.github.io/onsen-checkin-pwa/";
(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, geolocation: { latitude: 35.69, longitude: 139.7, accuracy: 25 }, permissions: ["geolocation"], serviceWorkers: "block" });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.OnsenUnifiedCheckin?.diagnostics().ready && window.OnsenMapClustersV738?.diagnostics().active, null, { timeout: 60000 });
    assert.equal(await page.locator("#unifiedCheckinButton").isVisible(), true);
    const target = await page.evaluate(() => {
      const points = [...spots.flatMap(getCheckinZones), ...window.OnsenCastleMap.zones().entries];
      let best = null;
      for (const point of points) {
        const fix = { lat: Number(point.lat), lng: Number(point.lng), accuracyM: 25, sampledAt: Date.now() };
        const matches = window.OnsenUnifiedCheckin.evaluate(fix).matches;
        const domains = new Set(matches.map(item => item.domain)).size;
        if (!best || domains > best.domains || domains === best.domains && matches.length > best.matches.length) best = { ...fix, domains, matches };
      }
      return best;
    });
    assert.ok(target.domains >= 2, "exercise overlapping categories using real catalog coordinates");
    // A restrictive map category and unrelated selected place must not restrict acquisition.
    await page.locator('[data-map-domain="onsen"]').click();
    await page.evaluate(() => { window.OnsenMapDetailV736.select("onsen", spots[0].id); window.OnsenMapDetailV736.present("onsen", spots[0].id); });
    assert.equal(await page.locator("#btnCheckin").isVisible(), false);
    const bounds = await page.evaluate(() => {
      const p = document.querySelector('.main > .panel:not([hidden])').getBoundingClientRect();
      const b = document.getElementById("unifiedCheckinButton").getBoundingClientRect();
      return { panelBottom: p.bottom, buttonTop: b.top, buttonBottom: b.bottom, viewport: innerHeight };
    });
    assert.ok(bounds.panelBottom <= bounds.buttonTop && bounds.buttonBottom <= bounds.viewport, JSON.stringify(bounds));
    await page.screenshot({ path: "unified-checkin-mobile.png" });
    await context.setGeolocation({ latitude: target.lat, longitude: target.lng, accuracy: 25 });
    await page.locator("#unifiedCheckinButton").click();
    await page.waitForFunction(() => document.getElementById("unifiedCheckinResult").open);
    const first = await page.evaluate(() => window.OnsenUnifiedCheckin.diagnostics().lastResult);
    assert.equal(first.failed.length, 0);
    assert.deepEqual(first.acquired.map(x => `${x.domain}:${x.id}`).sort(), target.matches.map(x => `${x.domain}:${x.id}`).sort());
    await page.screenshot({ path: "unified-checkin-result.png" });
    assert.equal(await page.evaluate(() => window.OnsenMapDomainV73.getMode()), "onsen");
    const persisted = await page.evaluate(matches => matches.every(item => item.domain === "onsen" ? loadCheckins().some(r => r.spotId === item.id && r.verificationType === "gps_manual") : item.domain === "castle" ? window.OnsenCastleVisits.isStrictGps(item.id) : window.OnsenScenicRuntime.loadState().visited[item.id]?.verificationType === "gps_scenic"), target.matches);
    assert.ok(persisted, "each match must be persisted through its domain runtime");
    await page.locator("#unifiedCheckinResultClose").click();
    await page.locator("#unifiedCheckinButton").click();
    await page.waitForFunction(() => document.getElementById("unifiedCheckinResult").open);
    const repeat = await page.evaluate(() => window.OnsenUnifiedCheckin.diagnostics().lastResult);
    assert.equal(repeat.acquired.length, 0); assert.equal(repeat.already.length, target.matches.length);
    await page.locator("#unifiedCheckinResultClose").click();
    for (const domain of ["onsen", "castle", "scenic"]) {
      const sample = await page.evaluate(domain => {
        const id = domain === "onsen" ? spots[0].id : domain === "castle" ? window.OnsenCastleDomain.data.entities[0].id : window.OnsenScenicRuntime.entries()[0].id;
        window.OnsenMapDetailV736.select(domain, id); window.OnsenMapDetailV736.present(domain, id);
        return id;
      }, domain);
      const panel = page.locator('.main > .panel:not([hidden])');
      assert.equal(await panel.locator('button:visible').count(), 2, "only close and detail remain in each place sheet");
      await panel.locator(".map-detail-expand-v737").click();
      await page.waitForFunction(() => document.getElementById("mapPlaceDetailV737").open);
      assert.ok(await page.locator("#mapPlaceDetailV737 section").count() >= 2, `rich detail for ${domain}:${sample}`);
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#mapPlaceDetailV737").isVisible(), false);
      assert.equal(await panel.isVisible(), true, "Escape closes detail and keeps the place sheet");
    }
    assert.equal(errors.length, 0, errors.join("\n"));
    console.log("PASS real catalog multi-category acquisition + persistence + repeat + map filter independence + all detail dialogs", JSON.stringify({ domains: target.domains, acquired: first.acquired.map(x => `${x.domain}:${x.name}`) }));
  } catch (error) {
    await page.screenshot({ path: "unified-checkin-failure.png", fullPage: true }).catch(() => {});
    console.error("Unified browser failure", error, errors);
    console.error("Details", await page.evaluate(() => ({ compact: window.OnsenMapDetailCompactV737?.diagnostics(), unified: window.OnsenUnifiedCheckin?.diagnostics() })).catch(() => null));
    process.exitCode = 1;
  } finally { await browser.close(); }
})();
