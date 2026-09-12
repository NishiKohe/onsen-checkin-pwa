(() => {
  const BUILD = "v73.3";
  const STORAGE_KEY = "mapDomainModeV73";
  const DOMAINS = ["onsen", "castle", "scenic"];
  const LAYERS = {
    onsen: { markers: ["spots-symbol", "spots-labels"], zones: ["checkin-zone-fill", "checkin-zone-line"] },
    castle: { markers: ["castles-v62-symbol", "castles-v62-labels"], zones: ["castle-checkin-zone-v62-fill", "castle-checkin-zone-v62-line"] },
    scenic: { markers: ["scenic-v71-symbol", "scenic-v71-labels"], zones: ["scenic-v71-zone-fill", "scenic-v71-zone-line"] }
  };
  const META = {
    onsen: ["♨", "温泉"],
    castle: ["🏯", "名城200"],
    scenic: ["◇", "名勝"]
  };

  let installed = false;
  let mode = restoreMode();
  let mapLifecycleBound = false;
  let locateBound = false;
  let switcherBound = null;
  let healTimer = null;

  function normalize(value) {
    const v = String(value || "").toLowerCase();
    return DOMAINS.includes(v) ? v : "onsen";
  }
  function restoreMode() {
    const current = sessionStorage.getItem(STORAGE_KEY) || sessionStorage.getItem("mapDomainModeV72");
    if (current) return normalize(current);
    if (sessionStorage.getItem("mapDomainModeV71") === "scenic") return "scenic";
    if (sessionStorage.getItem("mapDomainModeV62") === "castle") return "castle";
    return "onsen";
  }
  function persist() {
    sessionStorage.setItem(STORAGE_KEY, mode);
    sessionStorage.setItem("mapDomainModeV72", mode);
    sessionStorage.setItem("mapDomainModeV62", mode === "castle" ? "castle" : "onsen");
    if (mode === "scenic") sessionStorage.setItem("mapDomainModeV71", "scenic");
    else sessionStorage.removeItem("mapDomainModeV71");
  }
  function getMap() { try { return typeof map !== "undefined" ? map : null; } catch { return null; } }
  function layerExists(id) { return !!getMap()?.getLayer?.(id); }
  function domainLayerReady(domain) { return LAYERS[domain]?.markers?.some(layerExists) || false; }
  function setLayer(id, visible) {
    const m = getMap();
    if (!m?.getLayer?.(id)) return false;
    const desired = visible ? "visible" : "none";
    try {
      if (m.getLayoutProperty?.(id, "visibility") !== desired) m.setLayoutProperty(id, "visibility", desired);
      return true;
    } catch { return false; }
  }
  function selected(domain) {
    if (domain === "onsen") { try { return typeof selectedSpot !== "undefined" && !!selectedSpot; } catch { return false; } }
    if (domain === "castle") return !!window.OnsenCastleMap?.selectedCastleId?.();
    return !!window.OnsenScenicMapV71?.selectedId?.();
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
    for (const domain of DOMAINS) {
      if (root.querySelector(`[data-map-domain="${domain}"]`)) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.mapDomain = domain;
      button.innerHTML = `${META[domain][0]}<span>${META[domain][1]}</span>`;
      root.appendChild(button);
    }
    if (switcherBound !== root) {
      switcherBound = root;
      root.addEventListener("click", (event) => {
        const button = event.target instanceof Element ? event.target.closest("[data-map-domain]") : null;
        if (!button || !root.contains(button)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        setMode(button.dataset.mapDomain, { source: "switcher" });
      }, true);
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

  function syncAdapters() {
    try { window.OnsenCastleMap?.setControllerActive?.(mode === "castle"); } catch (e) { console.warn("castle adapter sync failed", e); }
    try { window.OnsenScenicMapV71?.setControllerActive?.(mode === "scenic"); } catch (e) { console.warn("scenic adapter sync failed", e); }
  }
  function ensureDomainLayers() {
    try { window.OnsenCastleMap?.ensureLayers?.(); } catch (e) { console.warn("castle layers ensure failed", e); }
    try { window.OnsenScenicMapV71?.ensureLayers?.(); } catch (e) { console.warn("scenic layers ensure failed", e); }
  }
  function panels() {
    const main = document.querySelector(".main");
    return {
      onsen: main?.querySelector(":scope > .panel:not(.castle-map-panel-v62):not(.scenic-map-panel-v71)") || null,
      castle: document.getElementById("castleMapPanelV62"),
      scenic: document.getElementById("scenicMapPanelV71")
    };
  }
  function apply() {
    ensureSwitcher();
    ensureDomainLayers();
    syncAdapters();
    for (const domain of DOMAINS) {
      const active = domain === mode;
      for (const id of LAYERS[domain].markers) setLayer(id, active);
      for (const id of LAYERS[domain].zones) setLayer(id, active && selected(domain));
    }
    const p = panels();
    if (p.onsen) p.onsen.hidden = mode !== "onsen";
    if (p.castle) p.castle.hidden = mode !== "castle";
    if (p.scenic) p.scenic.hidden = mode !== "scenic";
    const shell = document.querySelector(".map-shell");
    shell?.classList.toggle("castle-map-mode-v62", mode === "castle");
    shell?.classList.toggle("scenic-map-mode-v71", mode === "scenic");
    const toolsToggle = document.getElementById("btnMapToolsToggle");
    const tools = document.getElementById("mapToolsPanel");
    if (toolsToggle) toolsToggle.hidden = mode !== "onsen";
    if (mode !== "onsen" && tools) { tools.hidden = true; tools.setAttribute("aria-hidden", "true"); }
    if (mode === "onsen") {
      try { if (typeof selectedSpot !== "undefined" && selectedSpot && typeof renderCheckinZones === "function") renderCheckinZones(selectedSpot); } catch {}
      try { if (typeof updateDistanceAndButton === "function") updateDistanceAndButton(); } catch {}
    }
    updateButtons();
    return mode;
  }

  function scheduleHeal(reason = "heal") {
    clearTimeout(healTimer);
    let attempt = 0;
    const delays = [0, 40, 120, 300, 700, 1500, 3000];
    const run = () => {
      ensureDomainLayers();
      patchCompatibilityApis();
      apply();
      const targetReady = mode === "onsen" || domainLayerReady(mode);
      const bothReady = domainLayerReady("castle") && domainLayerReady("scenic");
      if ((targetReady && bothReady) || attempt >= delays.length - 1) return;
      attempt += 1;
      healTimer = setTimeout(run, delays[attempt]);
    };
    healTimer = setTimeout(run, delays[attempt]);
    window.dispatchEvent(new CustomEvent("onsen-map-domain-heal", { detail: { build: BUILD, mode, reason } }));
  }

  function setMode(next, options = {}) {
    const previous = mode;
    mode = normalize(next);
    persist();
    ensureDomainLayers();
    apply();
    scheduleHeal(options.source || "setMode");
    if (previous !== mode || options.forceEvent) {
      const detail = { build: BUILD, mode, previous, source: options.source || "api" };
      window.dispatchEvent(new CustomEvent("onsen-map-domain-v73-changed", { detail }));
      window.dispatchEvent(new CustomEvent("onsen-map-domain-v72-changed", { detail }));
    }
    return mode;
  }
  function locateCurrent(options = {}) {
    const center = options.center !== false;
    if (mode === "castle") return window.OnsenCastleMap?.resolveCurrentPosition?.(center) ?? null;
    if (mode === "scenic") return window.OnsenScenicMapV71?.resolvePosition?.(center) ?? null;
    try { return typeof locateOnce === "function" ? locateOnce(center) : null; } catch { return null; }
  }
  function bindLocate() {
    if (locateBound) return;
    locateBound = true;
    document.addEventListener("click", (event) => {
      const button = event.target instanceof Element ? event.target.closest("#btnLocate") : null;
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      locateCurrent({ center: true, source: "header" });
    }, true);
  }
  function open(domain, id = null, options = {}) {
    const target = normalize(domain);
    const activate = () => {
      setMode(target, { source: options.source || "open" });
      if (!id) return;
      setTimeout(() => {
        if (target === "castle") window.OnsenCastleMap?.selectCastle?.(id, { fly: options.fly !== false });
        else if (target === "scenic") window.OnsenScenicMapV71?.select?.(id, { fly: options.fly !== false });
        apply();
      }, 80);
    };
    window.OnsenAppShell?.show?.("map");
    if (document.documentElement.dataset.appTab && document.documentElement.dataset.appTab !== "map") setTimeout(activate, 60);
    else activate();
    return true;
  }

  function bindMapLifecycle() {
    const m = getMap();
    if (!m || mapLifecycleBound) return false;
    mapLifecycleBound = true;
    m.on?.("style.load", () => scheduleHeal("style.load"));
    m.on?.("idle", () => {
      if ((mode === "castle" || mode === "scenic") && !domainLayerReady(mode)) scheduleHeal("idle-missing-layer");
    });
    return true;
  }
  function patchCompatibilityApis() {
    const castle = window.OnsenCastleMap;
    if (castle && castle.__mapControllerV733Patched !== true) {
      castle.setMode = (next) => setMode(next, { source: "castle-api" });
      castle.getMode = () => mode;
      castle.showCastle = (id) => open("castle", id, { source: "castle-api" });
      Object.defineProperty(castle, "__mapControllerV733Patched", { value: true, configurable: true });
    }
    const scenic = window.OnsenScenicMapV71;
    if (scenic && scenic.__mapControllerV733Patched !== true) {
      scenic.show = (id) => open("scenic", id, { source: "scenic-api" });
      scenic.showMode = () => setMode("scenic", { source: "scenic-api" });
      Object.defineProperty(scenic, "__mapControllerV733Patched", { value: true, configurable: true });
    }
  }

  function diagnostics() {
    return {
      build: BUILD,
      mode,
      mapReady: !!getMap(),
      castleAdapter: !!window.OnsenCastleMap,
      scenicAdapter: !!window.OnsenScenicMapV71,
      castleLayer: domainLayerReady("castle"),
      scenicLayer: domainLayerReady("scenic")
    };
  }

  function install() {
    if (installed) return;
    installed = true;
    persist();
    ensureSwitcher();
    bindLocate();
    bindMapLifecycle();
    patchCompatibilityApis();
    apply();

    for (const eventName of ["onsen-castle-map-ready", "onsen-scenic-map-ready", "onsen-castle-map-layers-ready", "onsen-scenic-map-layers-ready", "onsen-scenic-v71-ready"]) {
      window.addEventListener(eventName, () => scheduleHeal(eventName));
    }
    window.addEventListener("onsen-app-tab-changed", (event) => {
      if (event.detail?.tab === "map") { bindMapLifecycle(); scheduleHeal("map-tab"); }
    });
    window.addEventListener("pageshow", () => scheduleHeal("pageshow"));

    let attempts = 0;
    const bootstrap = setInterval(() => {
      bindMapLifecycle();
      patchCompatibilityApis();
      ensureDomainLayers();
      apply();
      attempts += 1;
      if ((domainLayerReady("castle") && domainLayerReady("scenic")) || attempts >= 300) clearInterval(bootstrap);
    }, 100);

    const api = { build: BUILD, getMode: () => mode, setMode, open, locateCurrent, apply, refresh: () => { scheduleHeal("refresh"); return apply(); }, ensureSwitcher, diagnostics };
    window.OnsenMapDomainV73 = api;
    window.OnsenMapDomainV72 = api;
    window.dispatchEvent(new CustomEvent("onsen-map-domain-v73-ready", { detail: { build: BUILD, mode } }));
    scheduleHeal("install");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();