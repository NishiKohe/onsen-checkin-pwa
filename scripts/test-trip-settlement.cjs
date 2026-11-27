"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
function harness() {
  let current = null, fail = false, switched = false, duplicate = false;
  const rows = [
    { id: "a", entityType: "onsen", detectedAt: 100, strength: "photo_nearby" },
    { id: "b", entityType: "castle", detectedAt: 200, strength: "verified_range" },
    { id: "c", entityType: "scenic", detectedAt: 300, strength: "photo_verified_range" }
  ];
  const saved = new Set(), calls = [];
  const adapter = {
    pending: () => rows.filter(x => !saved.has(x.id)),
    confirm: id => { calls.push(id); if (id === "b" && fail) throw Error("quota"); saved.add(id); if (switched) current = "other"; return true; },
    refreshAll() {}
  };
  const context = vm.createContext({
    window: { OnsenUserStorage: { getCurrentProfileId: () => current },
      OnsenTravelDomainRecoveryV731: adapter,
      OnsenVisitCandidates: { pending: () => duplicate ? [rows[0]] : [], confirm: adapter.confirm }, addEventListener() {} },
    document: { getElementById: () => null, querySelector: () => null },
    setTimeout, setInterval: () => 1, clearInterval() {}, Date, JSON, Set
  });
  vm.runInContext(fs.readFileSync("trip-settlement.js", "utf8"), context);
  return { api: context.window.OnsenTripSettlement, rows, saved, calls,
    fail: value => { fail = value; }, switchDuringSave: () => { switched = true; },
    duplicate: () => { duplicate = true; } };
}
function testOnsenEvidence() {
  const source = fs.readFileSync("visit-log-ui.js", "utf8");
  const end = source.lastIndexOf("})();");
  const context = vm.createContext({
    window: { addEventListener() {} }, setTimeout() {}, console,
    loadCheckins: () => [
      { spotId: "near", verificationType: "photo_exif", verificationLevel: "recorded" },
      { spotId: "in", verificationType: "photo_exif", verificationLevel: "onsite" },
      { spotId: "old", verificationType: "gps_legacy" }
    ]
  });
  vm.runInContext(source.slice(0, end) + "window.summary = getVerificationSummary;window.onsite = isSpotOnsiteVerified;" + source.slice(end), context);
  assert.equal(context.window.summary().onsite, 2);
  assert.equal(context.window.summary().recordedOnly, 1);
  assert.equal(context.window.onsite("near"), false);
  assert.equal(context.window.onsite("in"), true);
}
(async () => {
  testOnsenEvidence();
  const h = harness(), all = h.api.list();
  assert.equal(all.length, 3); assert.equal(all[2].onsite, false); assert.equal(all[0].onsite, true);
  h.fail(true);
  const first = await h.api.settle(all.map(x => x.key));
  assert.equal(first.confirmed.length, 2); assert.equal(first.failed.length, 1);
  assert.equal(h.api.list().length, 1);
  h.fail(false);
  const retry = await h.api.settle(all.map(x => x.key));
  assert.equal(retry.confirmed.length, 1); assert.equal(retry.skipped.length, 2);
  assert.equal(h.saved.size, 3);
  const d = harness(); d.duplicate();
  assert.equal(new Set(d.api.list().map(x => x.key)).size, 4, "identical ids across stores are distinct candidates");
  const reentrant = harness(), keys = reentrant.api.list().map(x => x.key);
  const saving = reentrant.api.settle([...keys, keys[0]]);
  assert.equal(await reentrant.api.settle(keys), null);
  assert.equal((await saving).confirmed.length, 3); assert.equal(reentrant.calls.length, 3);
  const p = harness(); p.switchDuringSave();
  const changed = await p.api.settle(p.api.list().map(x => x.key));
  assert.equal(changed.cancelled, true); assert.equal(p.calls.length, 1, "stop on user change");
  console.log("PASS settlement: all domains, evidence labels, partial failure/retry, duplicate keys, reentrancy and profile changes");
})().catch(e => { console.error(e); process.exitCode = 1; });
