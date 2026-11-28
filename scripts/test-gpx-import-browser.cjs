"use strict";
const assert = require("node:assert/strict"), { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  try {
    await page.goto(process.env.ONSEN_TEST_BASE_URL || "http://127.0.0.1:8765/");
    await page.waitForFunction(() => window.OnsenGpxImport?.ready() && document.getElementById("tripGpxInput"), null, { timeout: 90000 });
    const parser = await page.evaluate(() => {
      const api = window.OnsenGpxImport;
      const gpx = body => `<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>${body}</trkseg></trk></gpx>`;
      const point = '<trkpt lat="35" lon="139"><time>2026-11-20T12:00:00+09:00</time></trkpt>';
      const valid = api.parseGpx(gpx(point + '<trkpt lat="" lon="139"><time>2026-11-20T03:00:00Z</time></trkpt>'));
      const rejected = [];
      for (const xml of ['<bad>', '<gpx><rte><rtept lat="35" lon="139"/></rte></gpx>', gpx('<trkpt lat="35" lon="139"/>'), gpx(point.replace('2026-11-20T12:00:00+09:00', '2099-01-01T00:00:00Z')), '<!DOCTYPE gpx [<!ENTITY x "x">]><gpx/>', gpx(point.replace('2026-11-20T12:00:00+09:00', '2026-02-30T12:00:00Z'))]) {
        try { api.parseGpx(xml); rejected.push(false); } catch { rejected.push(true); }
      }
      return { valid, rejected };
    });
    assert.equal(parser.valid.points.length, 1); assert.equal(parser.valid.skipped, 1);
    assert.equal(parser.valid.points[0].time, Date.parse("2026-11-20T03:00:00Z"));
    assert(parser.rejected.every(Boolean));
    const xml = await page.evaluate(() => {
      window.openTripView();
      const positions = [getCheckinZones(spots[0])[0], window.OnsenCastleMap.zones().entries[0], window.OnsenScenicRuntime.auditedZones(window.OnsenScenicRuntime.entries()[0])[0]];
      const points = positions.map((p, i) => `<trkpt lat="${p.lat}" lon="${p.lng}"><time>2026-11-20T03:0${i}:00Z</time></trkpt>`).join('');
      return `<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>移動記録</name><trkseg>${points}</trkseg></trk></gpx>`;
    });
    await page.locator("#tripGpxInput").setInputFiles({ name: "watch-route.gpx", mimeType: "application/gpx+xml", buffer: Buffer.from(xml) });
    await page.waitForFunction(() => document.getElementById("tripGpxStatus").textContent.includes("追加・"));
    const candidates = await page.evaluate(() => window.OnsenTravelDomainRecoveryV731.pending());
    assert(candidates.length >= 3);
    assert.deepEqual([...new Set(candidates.map(x => x.entityType))].sort(), ["castle", "onsen", "scenic"]);
    assert(candidates.every(x => x.source === "gpx_import" && x.accuracyM === null));
    assert.equal(await page.evaluate(() => loadCheckins().length + window.OnsenCastleVisits.list().length + Object.keys(window.OnsenScenicRuntime.loadState().visited).length), 0, "import only creates candidates");
    const repeated = await page.evaluate(async xml => window.OnsenGpxImport.importFile(new File([xml], "watch-route.gpx")), xml);
    assert.equal(repeated.added, 0); assert.equal(repeated.updated, 0);
    assert.match(await page.locator("#settlementList").innerText(), /GPX・範囲内／訪問記録/);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      assert(await page.locator("#tripGpxImport").evaluate(el => el.scrollWidth <= el.clientWidth));
    }
    await page.locator("#tripGpxImport").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "gpx-import-mobile.png", fullPage: true });
    await page.locator("#settlementSelect").click();
    await page.locator("#settlementConfirm").click();
    await page.waitForFunction(() => !window.OnsenTripSettlement.diagnostics().busy);
    const records = await page.evaluate(() => [...loadCheckins(), ...window.OnsenCastleVisits.list(), ...Object.values(window.OnsenScenicRuntime.loadState().visited)]);
    assert(records.length >= 3); assert(records.every(x => x.verificationLevel === "recorded" && x.verificationType === "gpx_import"));
    const guard = await page.evaluate(async xml => {
      const store = window.OnsenUserStorage, first = store.getCurrentProfileId();
      let release;
      const task = window.OnsenGpxImport.importFile({ size: 20, text: () => new Promise(resolve => { release = resolve; }) });
      const second = store.createProfile("GPX 切替確認"); store.switchProfile(second, false);
      release(xml); const result = await task;
      const count = window.OnsenTravelDomainRecoveryV731.pending().length;
      store.switchProfile(first, false); return { result, count };
    }, xml);
    assert.equal(guard.result, null); assert.equal(guard.count, 0);
    const oversized = await page.evaluate(async () => {
      let read = false;
      const result = await window.OnsenGpxImport.importFile({ size: 11 * 1024 * 1024, text: async () => { read = true; return ""; } });
      return { result, read };
    });
    assert.equal(oversized.result, null); assert.equal(oversized.read, false);
    console.log("PASS GPX browser: namespace/XML, missing/future/invalid dates, file input, three real catalogs, idempotence, evidence preservation, mobile layouts, confirmation, profile switch and size limit");
  } catch (e) { await page.screenshot({ path: "gpx-import-failure.png", fullPage: true }); throw e; }
  finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
