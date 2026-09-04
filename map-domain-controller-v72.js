(() => {
  const BUILD = "v72";
  const STORAGE_KEY = "mapDomainModeV72";
  const LEGACY_CASTLE_KEY = "mapDomainModeV62";
  const LEGACY_SCENIC_KEY = "mapDomainModeV71";
  const DOMAINS = Object.freeze({
    onsen: Object.freeze({ id: "onsen", label: "温泉", icon: "♨" }),
    castle: Object.freeze({ id: "castle", label: "名城200", icon: "🏯" }),
    scenic: Object.freeze({ id: "scenic", label: "名勝", icon: "◇" })
  });
  const DOMAIN_IDS = Object.freeze(Object.keys(DOMAINS));
  const ONSEN_LAYERS = Object.freeze(["spots-symbol", "spots-labels", "checkin-zone-fill", "checkin-zone-line"]);
  const CASTLE_LAYERS = Object.freeze(["castles-v62-symbol", "castles-v62-labels", "castle-checkin-zone-v62-fill", "castle-checkin-zone-v62-line"]);
  const SCENIC_LAYERS = Object.freeze(["scenic-v71-symbol", "scenic-v71-labels", "scenic-v71-zone-fill", "scenic-v71-zone-line"]);

  let installed = false;
  let applying = false;
  let suppressLegacyAdoption = false;
  let boundRoot = null;
  let castleApi = null;
  let scenicApi = null;
  let castleOriginalSetMode = null;
  let castleOriginalShowCastle = null;
  let scenicOriginalShow = null;
  let scenicOriginalShowMode = null;

  function normalize(value) {
    const raw = String(value || "").toLowerCase();
    return DOMAIN_IDS.includes(raw) ? raw : "onsen";
  }

  function restoredMode() {
    const current = normalize(sessionStorage.getItem(STORAGE_KEY));
    if (sessionStorage.getItem(STORAGE_KEY)) return current;
    if (sessionStorage.getItem(LEGACY_SCENIC_KEY) === "scenic") return "scenic";
    if (sessionStorage.getItem(LEGACY_CASTLE_KEY) === "castle") return "castle";
    return "onsen";
  }

  let mode = restoredMode();

  function getMap() {
    try { return typeof map !== "undefined" ? map : null; } catch { return null; }
  }

  function setLayer(id, visible) {
    const targetMap = getMap();
    if (!targetMap?.getLayer?.(id)) return;
    try { targetMap.setLayoutProperty(id, "visibility", visible ? "visible" : "none"); } catch {}
  }

  function findPanels() {
    const main = document.querySelector(".main");
    return {
      main,
      onsen: main?.querySelector(":scope > .panel:not(.castle-map-panel-v62):not(.scenic-map-panel-v71)") || null,
      castle: document.getElementById("castleMapPanelV62"),
      scenic: document.getElementById("scenicMapPanelV71")
    };
  }

  function persist(next) {
    sessionStorage.setItem(STORAGE_KEY, next);
    sessionStorage.setItem(LEGACY_CASTLE_KEY, next === "castle" ? "castle" : "onsen");
    if (next === "scenic") sessionStorage.setItem(LEGACY_SCENIC_KEY, "scenic");
    else sessionStorage.removeItem(LEGACY_SCENIC_KEY);
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

    for (const domain of DOMAIN_IDS) {
      if (root.querySelector(`[data-map-domain="${domain}"]`)) continue;
      const meta = DOMAINS[domain];
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.mapDomain = domain;
      button.innerHTML = `${meta.icon}<span>${meta.label}</span>`;
      root.appendChild(button);
    }

    if (boundRoot !== root) {
      boundRoot = root;
      if (root.dataset.mapDomainControllerV72 !== "1") {
        root.dataset.mapDomainControllerV72 = "1";
        root.addEventListener("click", (event) => {
          const button = event.target instanceof Element ? event.target.closest("[data-map-domain]") : null;
          if (!button || !root.contains(button)) return;
          // Legacy scenic code programmatically clicks the onsen button while it prepares its layers.
          // That synthetic click must not become a real domain transition.
          if (event.isTrusted === false && applying) return;
          const next = normalize(button.dataset.mapDomain);
          event.preventDefault();
          event.stopImmediatePropagation();
          setMode(next, { source: "switcher", openMap: false });
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

  function patchCastleApi() {
    const api = window.OnsenCastleMap;
    if (!api) return false;
    if (castleApi === api) return true;
    castleApi = api;
    castleOriginalSetMode = typeof api.setMode === "function" ? api.setMode.bind(api) : null;
    castleOriginalShowCastle = typeof api.showCastle === "function" ? api.showCastle.bind(api) : null;
    api.setMode = (next) => setMode(next, { source: "castle-api" });
    api.getMode = () => mode;
    api.showCastle = (id) => open("castle", id, { source: "castle-api" });
    api.mapDomainControllerBuild = BUILD;
    return true;
  }

  function patchScenicApi() {
    const api = window.OnsenScenicMapV71;
    if (!api) return false;
    if (scenicApi === api) return true;
    scenicApi = api;
    scenicOriginalShow = typeof api.show === "function" ? api.show.bind(api) : null;
    scenicOriginalShowMode = typeof api.showMode === "function" ? api.showMode.bind(api) : null;
    api.show = (id) => open("scenic", id, { source: "scenic-api" });
    api.showMode = (id) => setMode("scenic", { source: "scenic-api", selectId: id || null });
    api.mapDomainControllerBuild = BUILD;
    return true;
  }

  function ensureAdapters() {
    patchCastleApi();
    patchScenicApi();
  }

  function callLegacyCastle(next) {
    if (!castleOriginalSetMode) return;
    suppressLegacyAdoption = true;
    try { castleOriginalSetMode(next === "castle" ? "castle" : "onsen"); }
    catch (error) { console.warn("v72 castle domain adapter failed", error); }
    finally { suppressLegacyAdoption = false; }
  }

  function callLegacyScenic(id = null) {
    if (!scenicOriginalShowMode) return;
    try { scenicOriginalShowMode(id || null); }
    catch (error) { console.warn("v72 scenic domain adapter failed", error); }
  }

  function normalizeSharedUi() {
    const onsenMode = mode === "onsen";
    const castleMode = mode === "castle";
    const scenicMode = mode === "scenic";
    const panels = findPanels();

    for (const id of ONSEN_LAYERS) setLayer(id, onsenMode);
    for (const id of CASTLE_LAYERS) setLayer(id, castleMode);
    for (const id of SCENIC_LAYERS) setLayer(id, scenicMode);

    if (panels.onsen) panels.onsen.hidden = !onsenMode;
    if (panels.castle) panels.castle.hidden = !castleMode;
    if (panels.scenic) panels.scenic.hidden = !scenicMode;

    const shell = document.querySelector(".map-shell");
    shell?.classList.toggle("castle-map-mode-v62", castleMode);
    shell?.classList.toggle("scenic-map-mode-v71", scenicMode);

    const toolsToggle = document.getElementById("btnMapToolsToggle");
    const tools = document.getElementById("mapToolsPanel");
    if (toolsToggle) toolsToggle.hidden = !onsenMode;
    if (!onsenMode && tools) {
      tools.hidden = true;
      tools.setAttribute("aria-hidden", "true");
    }

    if (onsenMode) {
      try {
        if (typeof selectedSpot !== "undefined" && selectedSpot && typeof renderCheckinZones === "function") renderCheckinZones(selectedSpot);
        if (typeof updateDistanceAndButton === "function") updateDistanceAndButton();
      } catch {}
    }

    updateButtons();
    requestAnimationFrame(() => getMap()?.resize?.());
  }

  function applyCurrent(options = {}) {
    if (applying) return mode;
    applying = true;
    try {
      ensureSwitcher();
      ensureAdapters();
      persist(mode);

      if (mode === "scenic") {
        // Put the legacy castle module into its neutral/onsen state first, then let scenic own its layers.
        callLegacyCastle("onsen");
        callLegacyScenic(options.selectId || null);
      } else {
        callLegacyCastle(mode);
        // Removing the scenic legacy intent before castle/onsen apply lets the v71 module cleanly deactivate itself.
        sessionStorage.removeItem(LEGACY_SCENIC_KEY);
      }
      normalizeSharedUi();
      requestAnimationFrame(normalizeSharedUi);
      setTimeout(normalizeSharedUi, 50);
    } finally {
      applying = false;
    }
    return mode;
  }

  function setMode(next, options = {}) {
    const normalized = normalize(next);
    const previous = mode;
    mode = normalized;
    persist(mode);
    applyCurrent(options);
    if (previous !== mode || options.forceEvent) {
      window.dispatchEvent(new CustomEvent("onsen-map-domain-v72-changed", {
        detail: { build: BUILD, mode, previous, source: options.source || "api" }
      }));
    }
    return mode;
  }

  function open(domain, id = null, options = {}) {
    const next = normalize(domain);
    const activate = () => {
      setMode(next, { source: options.source || "open", selectId: id || null });
      if (!id) return;
      setTimeout(() => {
        if (next === "castle") window.OnsenCastleMap?.selectCastle?.(id, { fly: true });
        else if (next === "scenic") window.OnsenScenicMapV71?.select?.(id, { fly: true });
      }, 70);
    };

    const currentTab = document.documentElement.dataset.appTab;
    if (currentTab && currentTab !== "map") {
      window.OnsenAppShell?.show?.("map");
      setTimeout(activate, 60);
    } else {
      window.OnsenAppShell?.show?.("map");
      activate();
    }
    return true;
  }

  function handleLegacyDomainEvent(event) {
    if (suppressLegacyAdoption || applying) return;
    const legacyMode = event.detail?.mode;
    // The only legacy transition we still need to adopt is the castle row's closed-over showCastle().
    // Onsen/scenic switcher clicks are owned exclusively by v72.
    if (legacyMode === "castle" && mode !== "castle") {
      mode = "castle";
      persist(mode);
      normalizeSharedUi();
      window.dispatchEvent(new CustomEvent("onsen-map-domain-v72-changed", {
        detail: { build: BUILD, mode, previous: null, source: "legacy-castle" }
      }));
    }
  }

  function install() {
    if (installed) return;
    installed = true;
    persist(mode);
    ensureSwitcher();
    ensureAdapters();

    window.addEventListener("onsen-map-domain-changed", handleLegacyDomainEvent);
    window.addEventListener("onsen-castle-map-ready", () => { patchCastleApi(); applyCurrent(); });
    window.addEventListener("onsen-scenic-map-ready", () => { patchScenicApi(); applyCurrent(); });
    window.addEventListener("onsen-app-tab-changed", (event) => {
      if (event.detail?.tab === "map") setTimeout(() => applyCurrent(), 60);
    });
    window.addEventListener("pageshow", () => setTimeout(() => applyCurrent(), 0));

    // Dynamic bridges can arrive after DOMContentLoaded, so retry only until both adapters exist.
    let attempts = 0;
    const timer = setInterval(() => {
      ensureSwitcher();
      ensureAdapters();
      attempts += 1;
      if ((castleApi && scenicApi) || attempts >= 80) {
        clearInterval(timer);
        applyCurrent();
      }
    }, 125);

    window.OnsenMapDomainV72 = {
      build: BUILD,
      domains: DOMAINS,
      getMode: () => mode,
      setMode,
      open,
      apply: applyCurrent,
      ensureSwitcher,
      refresh: () => { ensureAdapters(); return applyCurrent(); },
      legacy: {
        castleSetMode: () => castleOriginalSetMode,
        castleShow: () => castleOriginalShowCastle,
        scenicShow: () => scenicOriginalShow,
        scenicShowMode: () => scenicOriginalShowMode
      }
    };

    applyCurrent();
    window.dispatchEvent(new CustomEvent("onsen-map-domain-v72-ready", { detail: { build: BUILD, mode } }));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();