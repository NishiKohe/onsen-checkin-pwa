(() => {
  const BUILD = "v73";
  const STORAGE_KEY = "mapDomainModeV73";
  const LEGACY_V72_KEY = "mapDomainModeV72";
  const LEGACY_CASTLE_KEY = "mapDomainModeV62";
  const LEGACY_SCENIC_KEY = "mapDomainModeV71";
  const DOMAINS = Object.freeze({
    onsen: Object.freeze({ id: "onsen", label: "温泉", icon: "♨" }),
    castle: Object.freeze({ id: "castle", label: "名城200", icon: "🏯" }),
    scenic: Object.freeze({ id: "scenic", label: "名勝", icon: "◇" })
  });
  const DOMAIN_IDS = Object.freeze(Object.keys(DOMAINS));
  const LAYERS = Object.freeze({
    onsen: Object.freeze({ markers: ["spots-symbol", "spots-labels"], zones: ["checkin-zone-fill", "checkin-zone-line"] }),
    castle: Object.freeze({ markers: ["castles-v62-symbol", "castles-v62-labels"], zones: ["castle-checkin-zone-v62-fill", "castle-checkin-zone-v62-line"] }),
    scenic: Object.freeze({ markers: ["scenic-v71-symbol", "scenic-v71-labels"], zones: ["scenic-v71-zone-fill", "scenic-v71-zone-line"] })
  });

  let installed = false;
  let mode = restoreMode();
  let boundSwitcher = null;
  let mapLifecycleBound = false;
  let globalLocateBound = false;

  function normalize(value) {
    const raw = String(value || "").toLowerCase();
    return DOMAIN_IDS.includes(raw) ? raw : "onsen";
  }

  function restoreMode() {
    for (const key of [STORAGE_KEY, LEGACY_V72_KEY]) {
      const value = sessionStorage.getItem(key);
      if (value) return normalize(value);
    }
    if (sessionStorage.getItem(LEGACY_SCENIC_KEY) === "scenic") return "scenic";
    if (sessionStorage.getItem(LEGACY_CASTLE_KEY) === "castle") return "castle";
    return "onsen";
  }

  function getMap() {
    try { return typeof map !== "undefined" ? map : null; } catch { return null; }
  }

  function persist(next) {
    sessionStorage.setItem(STORAGE_KEY, next);
    sessionStorage.setItem(LEGACY_V72_KEY, next);
    sessionStorage.setItem(LEGACY_CASTLE_KEY, next === "castle" ? "castle" : "onsen");
    if (next === "scenic") sessionStorage.setItem(LEGACY_SCENIC_KEY, "scenic");
    else sessionStorage.removeItem(LEGACY_SCENIC_KEY);
  }

  function setLayer(id, visible) {
    const m = getMap();
    if (!m?.getLayer?.(id)) return false;
    const desired = visible ? "visible" : "none";
    try {
      if (m.getLayoutProperty?.(id, "visibility") === desired) return false;
      m.setLayoutProperty(id, "visibility", desired);
      return true;
    } catch { return false; }
  }

  function selected(domain) {
    if (domain === "onsen") {
      try { return typeof selectedSpot !== "undefined" && !!selectedSpot; } catch { return false; }
    }
    if (domain === "castle") return !!window.OnsenCastleMap?.selectedCastleId?.();
    if (domain === "scenic") return !!window.OnsenScenicMapV71?.selectedId?.();
    return false;
  }

  function findPanels() {
    const main = document.querySelector(".main");
    return {
      onsen: main?.querySelector(":scope > .panel:not(.castle-map-panel-v62):not(.scenic-map-panel-v71)") || null,
      castle: document.getElementById("castleMapPanelV62"),
      scenic: document.getElementById("scenicMapPanelV71")
    };
  }

  function ensureSwitcher() {
    const shell = document.querySelector(".map-shell");
    if (!shell) return null;
    let root = document.getElementById("mapDomainSwitchV62");
    if (!root) {
      root = document.createElement("div");
      root.id = "mapDomainSwitchV62";
      root.className = "map-domain-switch-v62";
      root.setAttribute("aria-label", "地図カテゴリ切替");
      shell.appendChild(root);
    }
    for (const id of DOMAIN_IDS) {
      if (root.querySelector(`[data-map-domain="${id}"]`)) continue;
      const meta = DOMAINS[id];
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.mapDomain = id;
      button.innerHTML = `${meta.icon}<span>${meta.label}</span>`;
      root.appendChild(button);
    }
    if (boundSwitcher !== root) {
      boundSwitcher = root;
      if (root.dataset.mapDomainControllerV73 !== "1") {
        root.dataset.mapDomainControllerV73 = "1";
        root.addEventListener("click", (event) => {
          const button = event.target instanceof Element ? event.target.closest("[data-map-domain]") : null;
          if (!button || !root.contains(button)) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          setMode(button.dataset.mapDomain, { source: "switcher" });
        }, true);
      }
    }
    updateButtons();
    return root;
  }

  function updateButtons() {
    const root = document.getElementById("mapDomainSwitchV62");
    if (!root) return;
    for (const button of root.querySelectorAll("[data-map-domain]")) {
      const active = button.dataset.mapDomain === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  function syncDomainAdapters() {
    try { window.OnsenCastleMap?.setControllerActive?.(mode === "castle"); } catch (error) { console.warn("v73 castle adapter sync failed", error); }
    try { window.OnsenScenicMapV71?.setControllerActive?.(mode === "scenic"); } catch (error) { console.warn("v73 scenic adapter sync failed", error); }
  }

  function ensureDomainLayers() {
    try { window.OnsenCastleMap?.ensureLayers?.(); } catch (error) { console.warn("v73 castle layer ensure failed", error); }
    try { window.OnsenScenicMapV71?.ensureLayers?.(); } catch (error) { console.warn("v73 scenic layer ensure failed", error); }
  }

  function normalizeSharedUi() {
    ensureSwitcher();
    syncDomainAdapters();
    const panels = findPanels();
    let changed = false;
    for (const domain of DOMAIN_IDS) {
      const active = domain === mode;
      for (const id of LAYERS[domain].markers) changed = setLayer(id, active) || changed;
      const showZone = active && selected(domain);
      for (const id of LAYERS[domain].zones) changed = setLayer(id, showZone) || changed;
    }

    if (panels.onsen) panels.onsen.hidden = mode !== "onsen";
    if (panels.castle) panels.castle.hidden = mode !== "castle";
    if (panels.scenic) panels.scenic.hidden = mode !== "scenic";

    const shell = document.querySelector(".map-shell");
    shell?.classList.toggle("castle-map-mode-v62", mode === "castle");
    shell?.classList.toggle("scenic-map-mode-v71", mode === "scenic");

    const toolsToggle = document.getElementById("btnMapToolsToggle");
    const tools = document.getElementById("mapToolsPanel");
    if (toolsToggle) toolsToggle.hidden = mode !== "onsen";
    if (mode !== "onsen" && tools) {
      tools.hidden = true;
      tools.setAttribute("aria-hidden", "true");
    }

    if (mode === "onsen") {
      try {
        if (typeof selectedSpot !== "undefined" && selectedSpot && typeof renderCheckinZones === "function") renderCheckinZones(selectedSpot);
        if (typeof updateDistanceAndButton === "function") updateDistanceAndButton();
      } catch {}
    }
    updateButtons();
    if (changed) requestAnimationFrame(() => getMap()?.resize?.());
    return mode;
  }

  function setMode(next, options = {}) {
    const previous = mode;
    mode = normalize(next);
    persist(mode);
    normalizeSharedUi();
    if (previous !== mode || options.forceEvent) {
      window.dispatchEvent(new CustomEvent("onsen-map-domain-v73-changed", {
        detail: { build: BUILD, mode, previous, source: options.source || "api" }
      }));
      // Compatibility event for v72 consumers. This is emitted only after the final UI state is already applied.
      window.dispatchEvent(new CustomEvent("onsen-map-domain-v72-changed", {
        detail: { build: BUILD, mode, previous, source: options.source || "api" }
      }));
    }
    return mode;
  }

  function locateCurrent(options = {}) {
    const center = options.center !== false;
    if (mode === "castle") return window.OnsenCastleMap?.resolveCurrentPosition?.(center) ?? null;
    if (mode === "scenic") return window.OnsenScenicMapV71?.resolvePosition?.(center) ?? null;
    try { return typeof locateOnce === "function" ? locateOnce(center) : null; } catch { return null; }
  }

  function bindGlobalLocate() {
    if (globalLocateBound) return;
    globalLocateBound = true;
    document.addEventListener("click", (event) => {
      const button = event.target instanceof Element ? event.target.closest("#btnLocate") : null;
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      locateCurrent({ center: true, source: "header" });
    }, true);
  }

  function open(domain, id = null, options = {}) {
    const next = normalize(domain);
    const activate = () => {
      setMode(next, { source: options.source || "open" });
      if (!id) return;
      requestAnimationFrame(() => {
        if (next === "castle") window.OnsenCastleMap?.selectCastle?.(id, { fly: options.fly !== false });
        else if (next === "scenic") window.OnsenScenicMapV71?.select?.(id, { fly: options.fly !== false });
        normalizeSharedUi();
      });
    };
    window.OnsenAppShell?.show?.("map");
    if (document.documentElement.dataset.appTab && document.documentElement.dataset.appTab !== "map") setTimeout(activate, 40);
    else activate();
    return true;
  }

  function bindMapLifecycle() {
    const m = getMap();
    if (!m || mapLifecycleBound) return false;
    mapLifecycleBound = true;
    m.on?.("style.load", () => {
      ensureDomainLayers();
      requestAnimationFrame(normalizeSharedUi);
      setTimeout(normalizeSharedUi, 80);
    });
    return true;
  }

  function patchCompatibilityApis() {
    const castle = window.OnsenCastleMap;
    if (castle && castle.__mapControllerV73Patched !== true) {
      castle.setMode = (next) => setMode(next, { source: "castle-api" });
      castle.getMode = () => mode;
      castle.showCastle = (id) => open("castle", id, { source: "castle-api" });
      Object.defineProperty(castle, "__mapControllerV73Patched", { value: true, configurable: true });
    }
    const scenic = window.OnsenScenicMapV71;
    if (scenic && scenic.__mapControllerV73Patched !== true) {
      scenic.show = (id) => open("scenic", id, { source: "scenic-api" });
      scenic.showMode = () => setMode("scenic", { source: "scenic-api" });
      Object.defineProperty(scenic, "__mapControllerV73Patched", { value: true, configurable: true });
    }
  }

  function install() {
    if (installed) return;
    installed = true;
    persist(mode);
    ensureSwitcher();
    bindGlobalLocate();
    bindMapLifecycle();
    patchCompatibilityApis();
    syncDomainAdapters();

    for (const eventName of ["onsen-castle-map-ready", "onsen-scenic-map-ready", "onsen-castle-map-layers-ready", "onsen-scenic-map-layers-ready"]) {
      window.addEventListener(eventName, () => {
        patchCompatibilityApis();
        ensureDomainLayers();
        normalizeSharedUi();
      });
    }
    window.addEventListener("onsen-app-tab-changed", (event) => {
      if (event.detail?.tab === "map") {
        bindMapLifecycle();
        requestAnimationFrame(normalizeSharedUi);
      }
    });
    window.addEventListener("pageshow", () => requestAnimationFrame(normalizeSharedUi));

    let attempts = 0;
    const timer = setInterval(() => {
      bindMapLifecycle();
      patchCompatibilityApis();
      ensureDomainLayers();
      syncDomainAdapters();
      attempts += 1;
      if ((window.OnsenCastleMap && window.OnsenScenicMapV71) || attempts >= 100) {
        clearInterval(timer);
        normalizeSharedUi();
      }
    }, 100);

    const api = {
      build: BUILD,
      domains: DOMAINS,
      getMode: () => mode,
      setMode,
      open,
      locateCurrent,
      apply: normalizeSharedUi,
      refresh: () => { ensureDomainLayers(); patchCompatibilityApis(); return normalizeSharedUi(); },
      ensureSwitcher
    };
    window.OnsenMapDomainV73 = api;
    window.OnsenMapDomainV72 = api;
    normalizeSharedUi();
    window.dispatchEvent(new CustomEvent("onsen-map-domain-v73-ready", { detail: { build: BUILD, mode } }));
    window.dispatchEvent(new CustomEvent("onsen-map-domain-v72-ready", { detail: { build: BUILD, mode } }));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();