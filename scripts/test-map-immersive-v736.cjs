"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

class Element {
  constructor() { this.dataset = {}; this.buttons = []; this.classList = { toggle() {}, add() {}, remove() {} }; this.hidden = false; }
  querySelector(selector) {
    const match = selector.match(/data-map-domain="([^"]+)"/);
    return match ? this.buttons.find(b => b.dataset.mapDomain === match[1]) || null : null;
  }
  querySelectorAll(selector) { return selector === "[data-map-domain]" ? this.buttons : []; }
  prepend(button) { this.buttons.unshift(button); }
  appendChild(button) { this.buttons.push(button); }
  addEventListener() {}
  setAttribute() {}
  contains(button) { return this.buttons.includes(button); }
}
const switcher = new Element();
const shell = new Element();
const onsenPanel = new Element();
const castlePanel = new Element();
const scenicPanel = new Element();
const main = new Element();
main.querySelector = selector => selector.includes(".panel:not") ? onsenPanel : null;
const layerIds = [
  "spots-symbol", "spots-labels", "checkin-zone-fill", "checkin-zone-line",
  "castles-v62-symbol", "castles-v62-labels", "castle-checkin-zone-v62-fill", "castle-checkin-zone-v62-line",
  "scenic-v71-symbol", "scenic-v71-labels", "scenic-v734-points", "scenic-v734-labels",
  "scenic-v71-zone-fill", "scenic-v71-zone-line"
];
const layers = new Map(layerIds.map(id => [id, "none"]));
const adapterState = { castle: null, scenic: null };
const events = [];
const map = {
  getLayer(id) { return layers.has(id) ? { id } : null; },
  getLayoutProperty(id) { return layers.get(id); },
  setLayoutProperty(id, key, value) { assert.equal(key, "visibility"); layers.set(id, value); },
  on() {}
};
const storage = new Map();
const sessionStorage = {
  getItem(key) { return storage.get(key) || null; },
  setItem(key, value) { storage.set(key, value); },
  removeItem(key) { storage.delete(key); }
};
const document = {
  readyState: "complete",
  querySelector(selector) { return selector === ".map-shell" ? shell : selector === ".main" ? main : null; },
  getElementById(id) { return ({ mapDomainSwitchV62: switcher, castleMapPanelV62: castlePanel, scenicMapPanelV71: scenicPanel })[id] || null; },
  createElement() { return new Element(); },
  addEventListener() {}
};
const window = {
  OnsenCastleMap: {
    ensureLayers() {}, selectedCastleId() { return "castle-1"; },
    setControllerActive(active) { adapterState.castle = active; }
  },
  OnsenScenicMapV71: {
    ensureLayers() {}, selectedId() { return "scenic-1"; },
    setControllerActive(active) { adapterState.scenic = active; }
  },
  OnsenScenicRendererV734: { syncVisibility() {}, featureCount() { return 433; } },
  addEventListener() {}, dispatchEvent(event) { events.push(event.type); }
};
const context = {
  map, document, window, sessionStorage, Element,
  CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
  requestAnimationFrame(callback) { callback(); }, console
};
vm.runInNewContext(read("map-domain-controller-v736.js"), context, { filename: "map-domain-controller-v736.js" });
const router = window.OnsenMapDomainV73;
assert.equal(router?.build, "v73.6");
assert.equal(switcher.buttons.length, 4, "four category buttons installed");
assert.equal(switcher.buttons[0].dataset.mapDomain, "all");

router.setMode("all");
assert.equal(router.getMode(), "all");
for (const id of ["spots-symbol", "castles-v62-symbol", "scenic-v734-points"]) {
  assert.equal(layers.get(id), "visible", `combined map retains ${id}`);
}
assert.equal(layers.get("scenic-v71-symbol"), "none", "legacy scenic icon cannot cover canonical renderer");
assert.equal(adapterState.castle, false, "combined map delegates castle clicks to one shared handler");
assert.equal(adapterState.scenic, false, "combined map delegates scenic clicks to one shared handler");
for (const id of ["checkin-zone-fill", "castle-checkin-zone-v62-fill", "scenic-v71-zone-fill"]) assert.equal(layers.get(id), "none", `no unrelated circle shown: ${id}`);
router.setDetailDomain("castle");
assert.equal(layers.get("castle-checkin-zone-v62-fill"), "visible");
assert.equal(layers.get("scenic-v71-zone-fill"), "none");
assert.equal(layers.get("checkin-zone-fill"), "none");
router.setDetailDomain("scenic");
assert.equal(layers.get("castle-checkin-zone-v62-fill"), "none");
assert.equal(layers.get("scenic-v71-zone-fill"), "visible");
router.setDetailDomain(null);
assert.equal(layers.get("scenic-v71-zone-fill"), "none");
console.log("PASS combined map layers, canonical scenic pins, and single selected check-in zone");

router.setMode("onsen");
assert.equal(layers.get("spots-symbol"), "visible");
assert.equal(layers.get("castles-v62-symbol"), "none");
assert.equal(layers.get("scenic-v734-points"), "none");
router.setMode("castle");
assert.equal(layers.get("castles-v62-symbol"), "visible");
assert.equal(adapterState.castle, true);
assert.equal(layers.get("spots-symbol"), "none");
router.setMode("scenic");
assert.equal(layers.get("scenic-v734-points"), "visible");
assert.equal(adapterState.scenic, true);
assert.equal(layers.get("castles-v62-symbol"), "none");
console.log("PASS exclusive onsen, castle and scenic tabs without domain bleed");

const layout = read("map-immersive-v736.css");
const detail = read("map-immersive-v736.js");
const renderer = read("scenic-map-renderer-v734.js");
for (const term of ["grid-template-columns: none !important", ".main:not(.map-detail-open) > .panel", ".main.map-detail-open > .panel:not([hidden])", "repeat(4, minmax(0, 1fr))"]) assert.ok(layout.includes(term), `layout: ${term}`);
for (const term of ["navigator.geolocation.getCurrentPosition", "userMovedMap", "savedCamera()", "map-detail-close-v736", "function hitAt(event)", "function onMapClick(event)", "router?.setDetailDomain?.(domain)", "touchend", "Escape"]) assert.ok(detail.includes(term), `detail: ${term}`);
assert.ok(renderer.includes('mode() === "scenic" || mode() === "all"'));
assert.ok(renderer.includes('if (mode() !== "scenic") return;'));
console.log("PASS full-viewport detail sheet, local camera, combined-mode tap ownership guards");
console.log("All immersive map v73.6 tests passed");