const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class Storage {
  constructor() { this.items = new Map(); }
  getItem(key) { return this.items.get(String(key)) ?? null; }
  setItem(key, value) { this.items.set(String(key), String(value)); }
  removeItem(key) { this.items.delete(String(key)); }
}

const localStorage = new Storage();
localStorage.setItem("scenicVisitStateV1", JSON.stringify({ visited: { old: true } }));
const context = vm.createContext({
  Storage, localStorage,
  document: { readyState: "loading", addEventListener() {} },
  window: {}, crypto: require("node:crypto").webcrypto,
  Date, Math, JSON, setTimeout
});
vm.runInContext(fs.readFileSync("profile-storage.js", "utf8"), context);
const storage = context.window.OnsenUserStorage;
const first = storage.getCurrentProfileId();
assert.deepEqual(JSON.parse(storage.readUserItem("scenicVisitStateV1")), { visited: { old: true } });
const entries = {
  checkins: [{ spotId: "onsen_1" }],
  gameStateV1: { coins: 123 },
  characterStateV1: { recruited: ["a"] },
  castleVisitsV1: { records: ["castle_1"] },
  scenicVisitStateV1: { visited: { scenic_1: true } },
  progressionStateV1: { equipment: ["sword"] },
  visitDomainCandidatesV728: [{ entityId: "scenic_2" }]
};
for (const [key, value] of Object.entries(entries)) {
  storage.writeUserItem(key, JSON.stringify(value));
}
const backup = JSON.parse(JSON.stringify(storage.exportCurrentUserData()));
for (const [key, value] of Object.entries(entries)) {
  assert.deepEqual(backup.data[key], value, `${key} omitted from backup`);
}

const second = storage.createProfile("ユーザー2");
storage.switchProfile(second, false);
assert.equal(storage.readUserItem("scenicVisitStateV1"), null);
assert.equal(storage.readUserItem("progressionStateV1"), null);
storage.importCurrentUserData(backup);
for (const [key, value] of Object.entries(entries)) {
  assert.deepEqual(JSON.parse(storage.readUserItem(key)), value, `${key} did not restore`);
}
storage.writeUserItem("gameStateV1", JSON.stringify({ coins: 999 }));
assert.throws(() => storage.importCurrentUserData({ ...backup, data: { ...backup.data, unknown: 1 } }));
assert.deepEqual(JSON.parse(storage.readUserItem("gameStateV1")), { coins: 999 });
storage.switchProfile(first, false);
assert.deepEqual(JSON.parse(storage.readUserItem("gameStateV1")), { coins: 123 });
console.log("Profile backup, restore and user separation passed");
