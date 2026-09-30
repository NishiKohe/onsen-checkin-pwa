"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const script = fs.readFileSync(require("node:path").join(__dirname, "../unified-checkin-v7311.js"), "utf8");
function fixture() {
  const events = [], records = [], castleSaved = new Set(), scenicSaved = new Set();
  let success, failure, calls = 0, saveFails = false, currentProfile = "a";
  const window = {
    OnsenCheckinPolicy: { gpsAccuracyLimitM: 500 },
    OnsenUserStorage: { getCurrentProfileId: () => currentProfile },
    OnsenCastleDomain: { data: { entities: [{ id: "c1", name: "城1" }, { id: "c2", name: "城2" }] } },
    OnsenCastleMap: { zones: () => ({ entries: ["c1", "c1", "c2"].map(castleId => ({ castleId, lat: 1, lng: 1, radiusM: 750, accuracyRequiredM: 500 })) }) },
    OnsenCastleVisits: { registerStrictGpsVisit(id, payload) {
      assert.equal(payload.freshFix, true); assert.ok(payload.distanceM <= payload.radiusM);
      const already = castleSaved.has(id); castleSaved.add(id); return { ok: true, already };
    } },
    OnsenScenicRuntime: {
      entries: () => [{ id: "s1", name: "名勝1" }, { id: "s2", name: "名勝2" }],
      auditedZones: () => [{ lat: 1, lng: 1, radiusM: 500, accuracyRequiredM: 100 }],
      evaluatePosition: fix => ({ ok: fix.lat === 1 && fix.accuracyM <= 100, best: { zone: { radiusM: 500 }, distanceM: 0 } }),
      registerGpsVisit(id) { const already = scenicSaved.has(id); scenicSaved.add(id); return { ok: true, already }; }
    },
    dispatchEvent: event => events.push(event), addEventListener() {}
  };
  const context = vm.createContext({ window,
    document: { readyState: "loading", getElementById: () => null, addEventListener() {} },
    navigator: { geolocation: { getCurrentPosition(ok, fail, options) { calls++; success = ok; failure = fail; assert.equal(options.maximumAge, 0); } } },
    spots: [{ id: "o1", name: "温泉1" }, { id: "o2", name: "温泉2" }],
    getNearestZoneStatus: (item, fix) => ({ inRange: fix.lat === 1, zone: { radiusM: 500, label: "zone" }, distanceToCenterM: 0 }),
    distanceM: (lat, lng, lat2) => lat === lat2 ? 0 : 100000,
    loadCheckins: () => records.slice(), isCooldownActive: id => records.some(r => r.spotId === id),
    saveCheckins: list => { if (saveFails) throw new Error("quota"); records.splice(0, records.length, ...list); },
    renderStats() {}, renderHistory() {}, refreshSpotSource() {},
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    Date, Number, Map, Set, Promise, setTimeout, clearTimeout, console: { warn() {} }
  });
  vm.runInContext(script, context);
  return { api: window.OnsenUnifiedCheckin, records, events, castleSaved, scenicSaved, calls: () => calls,
    fix: (lat = 1, accuracy = 25, timestamp = Date.now()) => success({ coords: { latitude: lat, longitude: 1, accuracy }, timestamp }),
    deny: () => failure({ code: 1 }), failSave: () => { saveFails = true; }, switchProfile: () => { currentProfile = "b"; } };
}
(async () => {
  let f = fixture();
  let p = f.api.run();
  assert.equal(await f.api.run(), null); assert.equal(f.calls(), 1, "rapid repeat must not request another fix");
  f.fix(); let r = await p;
  assert.equal(r.acquired.length, 6, "all matching places in all three domains are acquired once");
  assert.equal(f.records.length, 2); assert.equal(f.castleSaved.size, 2); assert.equal(f.scenicSaved.size, 2);
  assert.equal(f.records[0].verificationLevel, "onsite");
  assert.equal(f.events.filter(e => e.type === "onsen-checkin-completed").length, 1);
  p = f.api.run(); f.fix(); r = await p;
  assert.equal(r.acquired.length, 0); assert.equal(r.already.length, 6); assert.equal(f.records.length, 2);
  f = fixture(); p = f.api.run(); f.fix(1, 200); r = await p;
  assert.equal(r.acquired.length, 4); assert.equal(r.inaccurate.length, 2, "each domain keeps its accuracy policy");
  f = fixture(); p = f.api.run(); f.fix(1, 1000); r = await p;
  assert.equal(r.acquired.length, 0); assert.equal(r.inaccurate.length, 6);
  f = fixture(); p = f.api.run(); f.fix(20); r = await p;
  assert.equal(r.acquired.length, 0); assert.equal(f.records.length, 0);
  f = fixture(); p = f.api.run(); f.fix(1, 25, Date.now() - 180000); assert.equal(await p, null); assert.equal(f.records.length, 0);
  f = fixture(); p = f.api.run(); f.deny(); assert.equal(await p, null); assert.equal(f.api.diagnostics().busy, false);
  f = fixture(); f.failSave(); p = f.api.run(); f.fix(); r = await p;
  assert.equal(r.failed.length, 2); assert.equal(r.acquired.length, 4, "a storage failure must not report unsaved places as acquired or stop other domains");
  f = fixture(); p = f.api.run(); f.switchProfile(); f.fix(); assert.equal(await p, null); assert.equal(f.records.length, 0);
  console.log("PASS unified check-in: all matches, deduplication, rapid repeat, accuracy, range, stale fix, permission failure, partial save, profile switch");
})().catch(error => { console.error(error); process.exitCode = 1; });
