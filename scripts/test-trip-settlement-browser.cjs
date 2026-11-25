"use strict";
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  try {
    await page.goto(process.env.ONSEN_TEST_BASE_URL || "http://127.0.0.1:8765/");
    await page.waitForFunction(() => window.OnsenTripSettlement?.diagnostics().mounted && window.OnsenScenicRuntime?.entries?.().length && window.OnsenCastleDomain?.data?.entities?.length, null, { timeout: 90000 });
    await page.evaluate(() => {
      window.openTripView();
      const at = new Date(2026, 10, 20, 12).getTime();
      const onsen = spots[0], castle = window.OnsenCastleDomain.data.entities[0], scenic = window.OnsenScenicRuntime.entries()[0];
      const row = (id, domain, entity, strength, offset = 0) => ({ id, entityType: domain, entityId: entity.id, spotId: entity.id, name: entity.name, detectedAt: at + offset, status: "pending", strength, source: "photo_exif" });
      localStorage.setItem("visitCandidatesV1", JSON.stringify([row("legacy", "onsen", onsen, "photo_nearby")]));
      window.OnsenTravelDomainRecoveryV731.saveCandidates([
        row("castle", "castle", castle, "photo_verified_range"),
        row("scenic", "scenic", scenic, "photo_nearby"),
        row("duplicate", "onsen", onsen, "photo_nearby")
      ]);
      window.OnsenTripSettlement.refresh();
    });
    await page.locator("#tripSettlement").scrollIntoViewIfNeeded();
    assert.equal(await page.locator("#settlementList input:checked").count(), 0);
    assert.equal(await page.locator("#settlementList article").count(), 4);
    assert(await page.locator("#settlementConfirm").isDisabled());
    await page.locator("#settlementDomain").selectOption("scenic");
    assert.equal(await page.locator("#settlementList article").count(), 1);
    assert.match(await page.locator("#settlementList").innerText(), /付近／訪問記録/);
    await page.locator("#settlementSelect").click();
    await page.locator("#settlementDomain").selectOption("all");
    assert.equal(await page.locator("#settlementList input:checked").count(), 0, "filter changes clear selection");
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      assert(await page.evaluate(() => document.getElementById("tripSettlement").getBoundingClientRect().right <= innerWidth));
      assert(await page.evaluate(() => document.getElementById("tripSettlement").scrollWidth <= document.getElementById("tripSettlement").clientWidth));
    }
    await page.screenshot({ path: "trip-settlement-mobile.png", fullPage: true });
    await page.locator("#settlementSelect").click();
    await page.locator("#settlementConfirm").click();
    await page.waitForFunction(() => !window.OnsenTripSettlement.diagnostics().busy);
    assert.match(await page.locator("#settlementStatus").innerText(), /4件を記録/);
    const records = await page.evaluate(() => ({
      onsen: loadCheckins().filter(x => String(x.spotId) === String(spots[0].id)),
      castle: window.OnsenCastleVisits.list(), scenic: Object.values(window.OnsenScenicRuntime.loadState().visited)
    }));
    assert.equal(records.onsen.length, 1, "duplicate candidates do not duplicate visits");
    assert.equal(records.onsen[0].verificationLevel, "recorded");
    assert.equal(records.castle[0].verificationType, "photo_exif");
    assert.equal(records.scenic[0].verificationLevel, "recorded");
    assert.equal(await page.locator("#settlementList article").count(), 0);
    // Large queues are paged, with no invisible candidates selected by select-all.
    await page.evaluate(() => {
      window.OnsenTravelDomainRecoveryV731.saveCandidates(Array.from({ length: 120 }, (_, i) => ({ id: "large-" + i, entityType: "scenic", entityId: "fake-" + i, name: "確認用候補 " + i, detectedAt: Date.now(), status: "pending", source: "photo_exif", strength: "photo_nearby" })));
      window.OnsenTripSettlement.refresh();
    });
    assert.equal(await page.locator("#settlementList article").count(), 50);
    await page.locator("#settlementSelect").click();
    assert.match(await page.locator("#settlementSelection").innerText(), /50件/);
    await page.locator("#settlementMore").click();
    assert.equal(await page.locator("#settlementList article").count(), 100);
    assert.equal(await page.locator("#settlementList input:checked").count(), 50);
    await page.locator("#settlementList button").filter({ hasText: "候補から除外" }).first().click();
    assert.equal(await page.locator("#settlementList input:checked").count(), 49);
    await page.evaluate(() => {
      const next = window.OnsenUserStorage.createProfile("切替確認");
      window.OnsenUserStorage.switchProfile(next, false);
      window.OnsenTripSettlement.refresh();
    });
    assert.equal(await page.locator("#settlementList article").count(), 0);
    assert.equal(await page.locator("#settlementList input:checked").count(), 0);
    console.log("PASS mobile settlement: real adapters, 3 catalogs, duplicate visits, evidence, filters, 320/390px, pagination, exclusion and user separation");
  } catch (e) { await page.screenshot({ path: "trip-settlement-failure.png", fullPage: true }); throw e; }
  finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
