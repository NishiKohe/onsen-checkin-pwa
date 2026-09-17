"use strict";
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const BASE = "https://nishikohe.github.io/onsen-checkin-pwa/";
(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
    geolocation: { latitude: 35.69, longitude: 139.70, accuracy: 25 }, permissions: ["geolocation"], serviceWorkers: "block" });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(String(error)));
  try {
    let published = false;
    for (let i = 0; i < 24; i++) {
      await page.goto(`${BASE}?qa=73.7-${i}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1800);
      published = await page.evaluate(() => window.OnsenBuildInfo?.version === "v73.7");
      if (published) break;
      await page.waitForTimeout(2200);
    }
    assert.ok(published, "v73.7 was not published within the deployment window");
    await page.waitForFunction(() => window.OnsenMapDiscoveryV737?.build === "v73.7" &&
      window.OnsenMapDetailCompactV737?.build === "v73.7" &&
      window.OnsenCollectionPrefFoldV737?.build === "v73.7" &&
      window.OnsenScenicRendererV734?.featureCount?.() === 433 &&
      window.OnsenCastleMap && window.OnsenMapDomainV73?.diagnostics?.().castleLayer, null, { timeout: 60000 });
    const overview = await page.evaluate(() => ({
      build: window.OnsenBuildInfo.version, mode: window.OnsenMapDomainV73.getMode(),
      scenic: window.OnsenScenicRendererV734.featureCount(),
      castle: window.OnsenCastleDomain.data.entities.length,
      catalog: window.OnsenMapDiscoveryV737.catalog().reduce((acc, item) => (acc[item.domain] = (acc[item.domain] || 0) + 1, acc), {}),
      map: document.getElementById("map").getBoundingClientRect().height,
      main: document.querySelector(".main").getBoundingClientRect().height,
      legacySearchVisible: getComputedStyle(document.getElementById("btnMapToolsToggle")).display
    }));
    assert.equal(overview.scenic, 433);
    assert.equal(overview.castle, 200);
    assert.ok(overview.catalog.onsen > 0 && overview.catalog.castle === 200 && overview.catalog.scenic === 433, JSON.stringify(overview.catalog));
    assert.ok(Math.abs(overview.map - overview.main) <= 2);
    assert.equal(overview.legacySearchVisible, "none");
    console.log("PASS full map, all three catalogs and single discovery entry", JSON.stringify(overview));

    await page.locator('[data-map-domain="all"]').click();
    await page.locator("#mapDiscoveryToggleV737").click();
    const samples = await page.evaluate(() => {
      const items = window.OnsenMapDiscoveryV737.catalog();
      return ["onsen", "castle", "scenic"].map(domain => items.find(item => item.domain === domain)).map(item => ({ domain: item.domain, id: item.id, name: item.name }));
    });
    for (const sample of samples) {
      await page.locator("#mapDiscoveryQueryV737").fill(sample.name);
      await page.waitForFunction(id => window.OnsenMapDiscoveryV737.diagnostics().results > 0 &&
        [...document.querySelectorAll("#mapDiscoveryResultsV737 button")].some(button => button.querySelector("strong")?.textContent), sample.id);
      const matching = await page.locator("#mapDiscoveryResultsV737 button").filter({ hasText: sample.name }).count();
      assert.ok(matching >= 1, `search failed for ${sample.domain}: ${sample.name}`);
      console.log(`PASS shared search ${sample.domain}: ${sample.name}`);
    }
    await page.locator("#mapDiscoveryQueryV737").fill(samples[2].name);
    await page.locator("#mapDiscoveryResultsV737 button").filter({ hasText: samples[2].name }).first().click();
    await page.waitForFunction(id => window.OnsenMapDetailV736.diagnostics().currentSelection?.id === id, samples[2].id);
    assert.equal(await page.evaluate(() => window.OnsenMapDomainV73.getMode()), "all", "search must preserve combined mode");
    let compact = await page.evaluate(() => ({ expanded: window.OnsenMapDetailCompactV737.diagnostics().expanded,
      height: document.getElementById("scenicMapPanelV71").getBoundingClientRect().height,
      limit: window.innerHeight * .47 }));
    assert.equal(compact.expanded, false);
    assert.ok(compact.height <= compact.limit, JSON.stringify(compact));
    await page.locator("#scenicMapPanelV71 .map-detail-expand-v737").click();
    assert.equal(await page.evaluate(() => window.OnsenMapDetailCompactV737.diagnostics().expanded), true);
    await page.locator("#scenicMapPanelV71 .map-detail-close-v736").click();
    assert.equal(await page.locator("#scenicMapPanelV71").isVisible(), false);
    console.log("PASS combined search opens compact scenic sheet and expands/collapses");

    await page.locator('[data-map-domain="castle"]').click();
    await page.locator("#mapDiscoveryToggleV737").click();
    await page.locator("#mapDiscoveryQueryV737").fill(samples[1].name);
    await page.locator("#mapDiscoveryResultsV737 button").filter({ hasText: samples[1].name }).first().click();
    await page.waitForFunction(id => window.OnsenMapDetailV736.diagnostics().currentSelection?.id === id, samples[1].id);
    assert.equal(await page.locator("#castleMapCheckinV62").count(), 1, "existing castle check-in remains wired");
    await page.locator("#castleMapPanelV62 .map-detail-close-v736").click();
    console.log("PASS castle filter + original check-in control");

    await page.locator('[data-app-tab="collection"]').first().click();
    await page.waitForFunction(() => !!window.OnsenCollectionPrefFoldV737?.diagnostics?.().sections &&
      !document.getElementById("collectionCommonPanelV732").hidden, null, { timeout: 20000 });
    const first = page.locator("#collectionCommonListV732 .collection-pref-trigger-v737").first();
    assert.equal(await first.getAttribute("aria-expanded"), "false", "prefecture rows start collapsed");
    await first.click();
    assert.equal(await first.getAttribute("aria-expanded"), "true");
    await page.locator("#collectionPrefToolbarV737 button").filter({ hasText: "閉じる" }).click();
    assert.equal(await first.getAttribute("aria-expanded"), "false");
    console.log("PASS collection prefecture-first navigation and expand/collapse");
    assert.deepEqual(pageErrors, [], `uncaught page errors: ${pageErrors.join(" | ")}`);
    console.log("All published v73.7 mobile UX tests passed");
  } catch (error) {
    console.error("v73.7 browser failure", error.stack || error);
    console.error("Page errors", pageErrors.slice(0, 12).join(" | "));
    await page.screenshot({ path: "map-ux-v737-failure.png", fullPage: true }).catch(() => {});
    process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });