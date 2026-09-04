(() => {
  const BUILD = "v71.6";
  let boundRoot = null;
  let observer = null;
  let retryTimer = null;
  let scenicIntent = sessionStorage.getItem("mapDomainModeV71") === "scenic";
  let patchedApi = null;
  let originalShow = null;

  function getRoot() {
    return document.getElementById("mapDomainSwitchV62");
  }

  function scenicApi() {
    return window.OnsenScenicMapV71 || null;
  }

  function isScenicActive() {
    try { return scenicApi()?.active?.() === true; } catch { return false; }
  }

  function isMapViewActive() {
    const main = document.querySelector(".main");
    if (!main || main.hidden) return false;
    const current = document.documentElement.dataset.appTab;
    return !current || current === "map";
  }

  function setLayer(id, visible) {
    try {
      const targetMap = typeof map !== "undefined" ? map : null;
      if (!targetMap?.getLayer?.(id)) return;
      targetMap.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    } catch {}
  }

  function forceScenicLayout() {
    if (!scenicIntent) return;
    const main = document.querySelector(".main");
    const shell = document.querySelector(".map-shell");
    const scenicPanel = document.getElementById("scenicMapPanelV71");
    const root = getRoot();
    if (!main || !shell || !scenicPanel) return;

    for (const panel of main.querySelectorAll(":scope > .panel")) {
      const visible = panel === scenicPanel;
      panel.hidden = !visible;
      panel.setAttribute("aria-hidden", visible ? "false" : "true");
    }

    shell.classList.add("scenic-map-mode-v71");
    shell.classList.remove("castle-map-mode-v62");

    if (root) {
      for (const button of root.querySelectorAll("[data-map-domain]")) {
        const active = button.dataset.mapDomain === "scenic";
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      }
    }

    for (const id of [
      "spots-symbol", "spots-labels", "checkin-zone-fill", "checkin-zone-line",
      "castles-v62-symbol", "castles-v62-labels",
      "castle-checkin-zone-v62-fill", "castle-checkin-zone-v62-line"
    ]) setLayer(id, false);

    for (const id of [
      "scenic-v71-symbol", "scenic-v71-labels",
      "scenic-v71-zone-fill", "scenic-v71-zone-line"
    ]) setLayer(id, true);

    const toolsToggle = document.getElementById("btnMapToolsToggle");
    const tools = document.getElementById("mapToolsPanel");
    if (toolsToggle) toolsToggle.hidden = true;
    if (tools) {
      tools.hidden = true;
      tools.setAttribute("aria-hidden", "true");
    }

    try {
      const targetMap = typeof map !== "undefined" ? map : null;
      requestAnimationFrame(() => targetMap?.resize?.());
    } catch {}
  }

  function applyScenic(id = null) {
    scenicIntent = true;
    sessionStorage.setItem("mapDomainModeV71", "scenic");

    const api = scenicApi();
    if (!api?.showMode) {
      forceScenicLayout();
      return false;
    }

    try { api.showMode(id); } catch (error) { console.warn("scenic v71.6 showMode failed", error); }
    forceScenicLayout();
    requestAnimationFrame(forceScenicLayout);
    setTimeout(forceScenicLayout, 40);
    setTimeout(forceScenicLayout, 120);
    setTimeout(() => {
      if (!scenicIntent) return;
      if (!isScenicActive()) {
        try { scenicApi()?.showMode?.(id); } catch {}
      }
      forceScenicLayout();
    }, 260);
    return true;
  }

  function activateScenic(id = null) {
    scenicIntent = true;
    sessionStorage.setItem("mapDomainModeV71", "scenic");

    if (isMapViewActive()) return applyScenic(id);

    window.OnsenAppShell?.show?.("map");
    setTimeout(() => {
      if (scenicIntent) applyScenic(id);
    }, 80);
    return true;
  }

  function patchScenicApi() {
    const api = scenicApi();
    if (!api) return false;
    if (patchedApi === api) return true;

    patchedApi = api;
    originalShow = typeof api.show === "function" ? api.show.bind(api) : null;
    api.show = (id) => activateScenic(id || null);
    api.showScenicStable = (id) => activateScenic(id || null);
    api.hotfixBuild = BUILD;
    return true;
  }

  function bindRoot() {
    const root = getRoot();
    if (!root) return false;
    if (boundRoot === root && root.dataset.scenicHotfixV716 === "1") return true;

    boundRoot = root;
    root.dataset.scenicHotfixV716 = "1";
    root.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("[data-map-domain]") : null;
      if (!target || !root.contains(target)) return;

      const domain = target.dataset.mapDomain || "onsen";
      if (domain === "scenic") {
        event.preventDefault();
        event.stopImmediatePropagation();
        activateScenic();
        return;
      }

      scenicIntent = false;
      sessionStorage.removeItem("mapDomainModeV71");
    }, true);
    return true;
  }

  function protectScenicIntent(event) {
    if (!scenicIntent) return;
    event.stopImmediatePropagation();
    requestAnimationFrame(forceScenicLayout);
    setTimeout(forceScenicLayout, 30);
  }

  function ensure() {
    patchScenicApi();
    bindRoot();
    if (scenicIntent) {
      if (!isScenicActive() && scenicApi()?.showMode && isMapViewActive()) {
        try { scenicApi().showMode(); } catch {}
      }
      forceScenicLayout();
    }
  }

  function install() {
    window.addEventListener("onsen-map-domain-changed", protectScenicIntent, true);

    ensure();
    const shell = document.querySelector(".map-shell");
    if (shell && !observer) {
      observer = new MutationObserver(ensure);
      observer.observe(shell, { childList: true, subtree: true });
    }

    window.addEventListener("onsen-scenic-map-ready", () => {
      patchScenicApi();
      if (scenicIntent) setTimeout(() => applyScenic(), 0);
    });
    window.addEventListener("onsen-scenic-map-domain-changed", () => {
      if (!scenicIntent) return;
      requestAnimationFrame(forceScenicLayout);
      setTimeout(forceScenicLayout, 80);
    });
    window.addEventListener("onsen-app-tab-changed", (event) => {
      if (event.detail?.tab === "map" && scenicIntent) setTimeout(() => applyScenic(), 70);
    });
    window.addEventListener("pageshow", ensure);

    clearInterval(retryTimer);
    let attempts = 0;
    retryTimer = setInterval(() => {
      ensure();
      attempts += 1;
      if (attempts >= 80 || (getRoot() && scenicApi())) clearInterval(retryTimer);
    }, 250);

    window.OnsenScenicMapHotfixV712 = {
      build: BUILD,
      activate: activateScenic,
      repair: forceScenicLayout,
      refresh: ensure,
      intended: () => scenicIntent,
      originalShow: () => originalShow
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
