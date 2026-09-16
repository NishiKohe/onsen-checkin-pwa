"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "collection-map-navigation-v735.js"), "utf8");

function createHarness(initialMode = "onsen") {
  const windowListeners = new Map();
  const documentListeners = new Map();
  const frames = [];
  const timers = new Map();
  const events = [];
  const selections = [];
  let timerId = 0;
  let mode = initialMode;
  let tab = "collection";

  class FakeElement {
    constructor(domain, id) {
      this.dataset = { commonDomain: domain, commonMap: id };
    }
    closest(selector) {
      return selector === "#collectionCommonPanelV732 [data-common-map]" ? this : null;
    }
  }
  class FakeCustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
  }
  const dispatch = (type, detail) => {
    for (const callback of windowListeners.get(type) || []) callback(new FakeCustomEvent(type, { detail }));
  };
  const router = {
    setMode(next, options = {}) { mode = next; events.push(["mode", next, options.source]); return mode; },
    getMode() { return mode; },
    apply() { events.push(["apply", mode]); }
  };
  const shell = {
    show(next) {
      tab = next;
      events.push(["show", next]);
      dispatch("onsen-app-tab-changed", { tab: next });
      return next;
    }
  };
  const window = {
    OnsenMapDomainV73: router,
    OnsenAppShell: shell,
    OnsenScenicRendererV734: { refresh() { events.push(["scenic-refresh"]); } },
    OnsenCastleMap: { selectCastle(id, options) { selections.push(["castle", id, options.fly]); return true; } },
    OnsenScenicMapV71: { select(id, options) { selections.push(["scenic", id, options.fly]); return true; } },
    OnsenCollectionDomainV732: { openOnMap() { throw Error("Legacy collection navigation ran"); } },
    addEventListener(type, callback) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(callback);
    },
    dispatchEvent(event) { dispatch(event.type, event.detail); }
  };
  const document = {
    readyState: "complete",
    addEventListener(type, callback, capture) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push({ callback, capture });
    }
  };

  // Simulate an older map-tab listener restoring the wrong domain during navigation.
  window.addEventListener("onsen-app-tab-changed", (event) => {
    if (event.detail?.tab === "map") router.setMode("onsen", { source: "legacy-map-tab" });
  });

  const context = {
    window, document, Element: FakeElement, CustomEvent: FakeCustomEvent,
    spots: [{ id: "onsen-1", lat: 35.75, lng: 139.65 }],
    selectSpot(id) { selections.push(["onsen", id, true]); },
    map: { getZoom: () => 8, flyTo(options) { events.push(["fly", options.center, options.zoom]); } },
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
    setTimeout(callback, ms) { const id = ++timerId; timers.set(id, { callback, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    console
  };
  vm.runInNewContext(source, context, { filename: "collection-map-navigation-v735.js" });
  const api = window.OnsenCollectionMapNavigationV735;
  assert.ok(api, "Navigation module installed");
  assert.equal(api.build, "v73.5");

  function flush() {
    while (frames.length) frames.shift()();
    for (const [id, timer] of [...timers]) {
      timers.delete(id);
      timer.callback();
    }
  }
  return {
    api, window, events, selections, flush,
    mode: () => mode,
    tab: () => tab,
    click(domain, id) {
      const event = {
        target: new FakeElement(domain, id),
        prevented: false, stopped: false,
        preventDefault() { this.prevented = true; },
        stopImmediatePropagation() { this.stopped = true; }
      };
      for (const listener of documentListeners.get("click") || []) listener.callback(event);
      return event;
    }
  };
}

for (const [domain, id, startingMode] of [
  ["onsen", "onsen-1", "scenic"],
  ["castle", "castle-1", "scenic"],
  ["scenic", "scenic-1", "castle"]
]) {
  const test = createHarness(startingMode);
  assert.equal(test.api.open(domain, id), true);
  test.flush();
  assert.equal(test.tab(), "map", `${domain}: map app tab selected`);
  assert.equal(test.mode(), domain, `${domain}: requested map domain persists after legacy event`);
  assert.ok(test.selections.some(([kind, selectedId]) => kind === domain && selectedId === id), `${domain}: target selected`);
  assert.ok(test.events.findIndex(([name, next]) => name === "mode" && next === domain) < test.events.findIndex(([name]) => name === "show"), `${domain}: category selected before tab opens`);
  assert.equal(test.window.OnsenCollectionDomainV732.openOnMap, test.api.open, `${domain}: shared collection API patched`);
  if (domain === "onsen") {
    assert.ok(test.events.some(([name, coords]) => name === "fly" && coords[0] === 139.65), "onsen: map centers on target");
  }
  console.log(`PASS ${domain}: correct map tab and target despite legacy tab reset`);
}

{
  const test = createHarness("onsen");
  const event = test.click("castle", "castle-2");
  test.flush();
  assert.equal(event.prevented, true, "Button default prevented");
  assert.equal(event.stopped, true, "Legacy click handler blocked");
  assert.equal(test.mode(), "castle", "Click selects corresponding domain");
  assert.ok(test.selections.some(([kind, id]) => kind === "castle" && id === "castle-2"));
  assert.equal(test.api.open("scenic", ""), false, "Missing target rejected");
  console.log("PASS delegated collection button click and invalid-target guard");
}

console.log("All collection map navigation v73.5 behavior tests passed");