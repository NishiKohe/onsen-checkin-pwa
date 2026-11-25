"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

async function harness() {
  const data = new Map(), nodes = new Map();
  const element = () => ({
    innerHTML: "", textContent: "", hidden: false,
    appendChild() {}, insertAdjacentElement() {},
    querySelector() { return { addEventListener() {} }; },
    addEventListener() {}
  });
  for (const id of ["tripCandidateList", "tripDomainCandidateListV728",
    "tripCandidateMetric", "tripOnsiteMetric", "tripRecordedMetric"]) nodes.set(id, element());
  let scenic = { visited: {} }, failWrites = false;
  const window = {
    addEventListener() {}, dispatchEvent() {},
    OnsenCastleVisits: { list: () => [] },
    OnsenCastleDomain: {},
    OnsenScenicRuntime: {
      loadState: () => scenic, isVisited: id => !!scenic.visited[id],
      get: () => ({}), saveState: value => { scenic = value; }
    }
  };
  const context = vm.createContext({
    window, document: {
      readyState: "complete", visibilityState: "visible",
      getElementById: id => nodes.get(id) || null,
      createElement: element, addEventListener() {}
    },
    localStorage: {
      getItem: key => data.get(key) ?? null,
      setItem: (key, value) => { if (failWrites) throw new Error("quota exceeded"); data.set(key, value); }
    },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    navigator: {}, console, Date, Math, JSON, Map, Set, Number, String, Array,
    setTimeout: fn => { fn(); return 1; }, setInterval: () => 1, clearInterval() {}
  });
  vm.runInContext(fs.readFileSync("travel-domain-recovery-v728.js", "utf8"), context);
  await Promise.resolve();
  return { api: window.OnsenTravelDomainRecoveryV731, data, nodes,
    setScenic: visited => { scenic = { visited }; }, failWrites: value => { failWrites = value; } };
}

async function main() {
  const h = await harness();
  assert(h.api, "runtime installs");
  const candidate = (i, status = "pending") => ({
    id: "candidate-" + i, entityType: "scenic", entityId: "scenic-" + i,
    detectedAt: 1000 + i, status, source: "photo_exif", strength: "photo_nearby"
  });
  // Large imports retain the first pending item, even across resolved history.
  const pending = Array.from({ length: 650 }, (_, i) => candidate(i));
  const resolved = Array.from({ length: 450 }, (_, i) =>
    candidate(1000 + i, i % 2 ? "confirmed" : "dismissed"));
  const mixed = [...pending.slice(0, 325), ...resolved, ...pending.slice(325)];
  h.api.saveCandidates(mixed);
  const retained = JSON.parse(JSON.stringify(h.api.loadCandidates()));
  assert.deepEqual(retained.filter(x => x.status === "pending"), pending);
  assert.deepEqual(retained.filter(x => x.status !== "pending"), resolved.slice(-300));
  assert.deepEqual(mixed.filter(x => x.status !== "pending"), resolved, "input unchanged");
  const next = candidate(700); delete next.status;
  h.api.upsertCandidate(next);
  assert.equal(h.api.pending().length, 651);
  assert(h.api.pending().some(x => x.id === "candidate-0"));
  // Explicit levels win; legacy saves retain their existing interpretation.
  h.setScenic({
    nearby: { verificationType: "photo_exif", verificationLevel: "recorded" },
    inside: { verificationType: "photo_exif", verificationLevel: "onsite" },
    gps: { verificationType: "gps_scenic", verificationLevel: "onsite" },
    past: { verificationType: "past_self_report", verificationLevel: "recorded" },
    legacyPhoto: { verificationType: "photo_exif" },
    legacyGps: { verificationType: "gps_scenic" }
  });
  h.api.render();
  assert.equal(h.nodes.get("tripOnsiteMetric").textContent, "4");
  assert.equal(h.nodes.get("tripRecordedMetric").textContent, "2");
  // Exercise the actual confirmation path, including rendering and persisted status.
  h.setScenic({});
  h.api.saveCandidates([candidate(1)]);
  assert.equal(h.api.confirm("candidate-1"), true);
  assert.equal(h.nodes.get("tripOnsiteMetric").textContent, "0");
  assert.equal(h.nodes.get("tripRecordedMetric").textContent, "1");
  assert.equal(h.api.loadCandidates()[0].status, "confirmed");
  const insideCandidate = { ...candidate(2), strength: "photo_verified_range" };
  h.api.saveCandidates([insideCandidate]);
  assert.equal(h.api.confirm("candidate-2"), true);
  assert.equal(h.nodes.get("tripOnsiteMetric").textContent, "1");
  assert.equal(h.nodes.get("tripRecordedMetric").textContent, "1");
  // Storage failure propagates without overwriting the previous saved candidates.
  const before = h.data.get(h.api.candidateKey);
  h.failWrites(true);
  assert.throws(() => h.api.saveCandidates([candidate(999)]), /quota exceeded/);
  h.failWrites(false);
  assert.equal(h.data.get(h.api.candidateKey), before);
  console.log("PASS recovery: 650 pending retained, resolved history capped, upsert, explicit/legacy levels and real photo confirmation");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
