(() => {
  const BUILD = "v73.6";
  const STORAGE_KEY = "mapDomainModeV73";
  const DOMAINS = ["all", "onsen", "castle", "scenic"];
  const CATEGORIES = ["onsen", "castle", "scenic"];
  const LAYERS = {
    onsen: { markers: ["spots-symbol", "spots-labels"], zones: ["checkin-zone-fill", "checkin-zone-line"] },
    castle: { markers: ["castles-v62-symbol", "castles-v62-labels"], zones: ["castle-checkin-zone-v62-fill", "castle-checkin-zone-v62-line"] },
    scenic: { markers: ["scenic-v71-symbol", "scenic-v71-labels", "scenic-v734-points", "scenic-v734-labels"], zones: ["scenic-v71-zone-fill", "scenic-v71-zone-line"] }
  };
  const META = { all: ["◎", "すべて"], onsen: ["♨", "温泉"], castle: ["🏯", "名城200"], scenic: ["◇", "名勝"] };
  let installed = false;
  let mode = restoreMode();
  let detailDomain = null;
  let boundMap = null;
  let locateBound = false;
  let switcherBound = null;
  let healTimer = null;

  function normalize(value) {
    const next = String(value || "").toLowerCase();
    return DOMAINS.includes(next) ? next : "onsen";
  }
  function restoreMode() {
    const current = sessionStorage.getItem(STORAGE_KEY) || sessionStorage.getItem("mapDomainModeV72");
    if (current) return normalize(current);
    if (sessionStorage.getItem("mapDomainModeV71") === "scenic") return "scenic";
    if (sessionStorage.getItem("mapDomainModeV62") === "castle") return "castle";
    return "all";
  }
  function persist() {
    sessionStorage.setItem(STORAGE_KEY, mode);
    sessionStorage.setItem("mapDomainModeV72", mode === "all" ? "onsen" : mode);
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
      let button = root.querySelector(`[data-map-domain="${domain}"]`);
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.dataset.mapDomain = domain;
        button.innerHTML = `${META[domain][0]}<span>${META[domain][1]}</span>`;
        if (domain === "all") root.prepend(button);
        else root.appendChild(button);
      }
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
  function ensureDomainLayers() {
    try { if (!domainLayerReady("castle") || !layerExists(LAYERS.castle.zones[0])) window.OnsenCastleMap?.ensureLayers?.(); } catch (error) { console.warn("castle layers ensure failed", error); }
    try { if (!domainLayerReady("scenic") || !layerExists(LAYERS.scenic.zones[0])) window.OnsenScenicMapV71?.ensureLayers?.(); } catch (error) { console.warn("scenic layers ensure failed", error); }
    try { if (window.OnsenScenicRendererV734 && !layerExists("scenic-v734-points")) window.OnsenScenicRendererV734.refresh?.(); } catch (error) { console.warn("scenic renderer ensure failed", error); }
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
    try { window.OnsenCastleMap?.setControllerActive?.(mode === "castle"); } catch (error) { console.warn("castle adapter sync failed", error); }
    try { window.OnsenScenicMapV71?.setControllerActive?.(mode === "scenic"); } catch (error) { console.warn("scenic adapter sync failed", error); }
    const canonicalScenic = layerExists("scenic-v734-points");
    for (const domain of CATEGORIES) {
      const active = mode === "all" || mode === domain;
      for (const id of LAYERS[domain].markers) {
        const oldScenic = domain === "scenic" && (id === "scenic-v71-symbol" || id === "scenic-v71-labels");
        setLayer(id, active && !(canonicalScenic && oldScenic));
      }
      const showZone = active && selected(domain) && (mode !== "all" || detailDomain === domain);
      for (const id of LAYERS[domain].zones) setLayer(id, showZone);
    }
    try { window.OnsenScenicRendererV734?.syncVisibility?.(); } catch {}
    const p = panels();
    for (const domain of CATEGORIES) if (p[domain]) p[domain].hidden = !(mode === domain || mode === "all" && detailDomain === domain);
    const shell = document.querySelector(".map-shell");
    shell?.classList.toggle("castle-map-mode-v62", mode === "castle");
    shell?.classList.toggle("scenic-map-mode-v71", mode === "scenic");
    const toolsToggle = document.getElementById("btnMapToolsToggle");
    const tools = document.getElementById("mapToolsPanel");
    if (toolsToggle) toolsToggle.hidden = mode !== "onsen" && mode !== "all";
    if (mode !== "onsen" && mode !== "all" && tools) { tools.hidden = true; tools.setAttribute("aria-hidden", "true"); }
    if (mode === "onsen" || mode === "all" && detailDomain === "onsen") {
      try { if (typeof selectedSpot !== "undefined" && selectedSpot && typeof renderCheckinZones === "function") renderCheckinZones(selectedSpot); } catch {}
      try { if (typeof updateDistanceAndButton === "function") updateDistanceAndButton(); } catch {}
    }
    updateButtons();
    return mode;
  }
  function setDetailDomain(domain) {
    detailDomain = CATEGORIES.includes(domain) ? domain : null;
    apply();
    return detailDomain;
  }
  function scheduleHeal(reason = "heal") {
    clearTimeout(healTimer);
    let attempt = 0;
    const delays = [0, 60, 160, 400, 900, 1800, 3500];
    const run = () => {
      patchCompatibilityApis();
      bindMapLifecycle();
      apply();
      const targetReady = mode === "all" ? CATEGORIES.every(domainLayerReady) : mode === "onsen" || domainLayerReady(mode);
      if (targetReady || attempt >= delays.length - 1) return;
      healTimer = setTimeout(run, delays[++attempt]);
    };
    healTimer = setTimeout(run, delays[attempt]);
    window.dispatchEvent(new CustomEvent("onsen-map-domain-heal", { detail: { build: BUILD, mode, reason } }));
  }
  function setMode(next, options = {}) {
    const previous = mode;
    mode = normalize(next);
    if (mode !== previous) detailDomain = null;
    persist();
    apply();
    scheduleHeal(options.source || "setMode");
    if (mode !== previous || options.forceEvent) {
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
    setMode(target, { source: options.source || "open" });
    window.OnsenAppShell?.show?.("map");
    if (!id) return true;
    const activate = () => {
      let didSelect = false;
      if (target === "castle") didSelect = !!window.OnsenCastleMap?.selectCastle?.(id, { fly: options.fly !== false });
      else if (target === "scenic") didSelect = !!window.OnsenScenicMapV71?.select?.(id, { fly: options.fly !== false });
      else if (target === "onsen") {
        try { if (typeof selectSpot === "function") { selectSpot(id); didSelect = true; } } catch {}
      }
      if (didSelect) window.OnsenMapDetailV736?.present?.(target, id);
      apply();
    };
    requestAnimationFrame(() => requestAnimationFrame(activate));
    return true;
  }
  function bindMapLifecycle() {
    const m = getMap();
    if (!m || boundMap === m) return false;
    boundMap = m;
    m.on?.("style.load", () => scheduleHeal("style.load"));
    m.on?.("idle", () => {
      const needed = mode === "all" ? CATEGORIES : mode === "onsen" ? [] : [mode];
      if (needed.some(domain => !domainLayerReady(domain))) scheduleHeal("idle-missing-layer");
    });
    return true;
  }
  function patchCompatibilityApis() {
    const castle = window.OnsenCastleMap;
    if (castle && castle.__mapControllerV736Patched !== true) {
      castle.setMode = (next) => setMode(next, { source: "castle-api" });
      castle.getMode = () => mode;
      castle.showCastle = (id) => open("castle", id, { source: "castle-api" });
      Object.defineProperty(castle, "__mapControllerV736Patched", { value: true, configurable: true });
    }
    const scenic = window.OnsenScenicMapV71;
    if (scenic && scenic.__mapControllerV736Patched !== true) {
      scenic.show = (id) => open("scenic", id, { source: "scenic-api" });
      scenic.showMode = () => setMode("scenic", { source: "scenic-api" });
      Object.defineProperty(scenic, "__mapControllerV736Patched", { value: true, configurable: true });
    }
  }
  function diagnostics() {
    return { build: BUILD, mode, detailDomain, mapReady: !!getMap(), onsenLayer: domainLayerReady("onsen"), castleAdapter: !!window.OnsenCastleMap, scenicAdapter: !!window.OnsenScenicMapV71, castleLayer: domainLayerReady("castle"), scenicLayer: domainLayerReady("scenic"), scenicRenderer: !!window.OnsenScenicRendererV734?.featureCount?.() };
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
    for (const eventName of ["onsen-castle-map-ready", "onsen-scenic-map-ready", "onsen-castle-map-layers-ready", "onsen-scenic-map-layers-ready", "onsen-scenic-v71-ready", "onsen-scenic-renderer-ready"]) {
      window.addEventListener(eventName, () => scheduleHeal(eventName));
    }
    window.addEventListener("onsen-app-tab-changed", (event) => { if (event.detail?.tab === "map") { bindMapLifecycle(); scheduleHeal("map-tab"); } });
    window.addEventListener("pageshow", () => scheduleHeal("pageshow"));
    let attempts = 0;
    const bootstrap = setInterval(() => {
      bindMapLifecycle();
      patchCompatibilityApis();
      apply();
      if (CATEGORIES.every(domainLayerReady) || ++attempts >= 300) clearInterval(bootstrap);
    }, 100);
    const api = { build: BUILD, getMode: () => mode, getDetailDomain: () => detailDomain, setMode, setDetailDomain, open, locateCurrent, apply, refresh: () => { scheduleHeal("refresh"); return apply(); }, ensureSwitcher, diagnostics };
    window.OnsenMapDomainV73 = api;
    window.OnsenMapDomainV72 = api;
    window.dispatchEvent(new CustomEvent("onsen-map-domain-v73-ready", { detail: { build: BUILD, mode } }));
    scheduleHeal("install");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();