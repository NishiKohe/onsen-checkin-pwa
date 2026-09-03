(() => {
  const BUILD = "v71.3";
  let boundRoot = null;
  let observer = null;
  let retryTimer = null;

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

  function forceScenicLayout() {
    if (!isScenicActive()) return;
    const main = document.querySelector(".main");
    const shell = document.querySelector(".map-shell");
    const scenicPanel = document.getElementById("scenicMapPanelV71");
    const root = getRoot();
    if (!main || !shell || !scenicPanel) return;

    for (const panel of main.querySelectorAll(":scope > .panel")) {
      panel.hidden = panel !== scenicPanel;
      panel.setAttribute("aria-hidden", panel === scenicPanel ? "false" : "true");
    }
    scenicPanel.hidden = false;
    scenicPanel.setAttribute("aria-hidden", "false");

    shell.classList.add("scenic-map-mode-v71");
    shell.classList.remove("castle-map-mode-v62");

    if (root) {
      for (const button of root.querySelectorAll("[data-map-domain]")) {
        const active = button.dataset.mapDomain === "scenic";
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      }
    }

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

  function applyScenic(api, id = null) {
    api.showMode(id);
    requestAnimationFrame(forceScenicLayout);
    setTimeout(forceScenicLayout, 40);
    setTimeout(forceScenicLayout, 180);
    return true;
  }

  function activateScenic(id = null) {
    const api = scenicApi();
    if (!api?.showMode) return false;

    // OnsenAppShell.show("map") dispatches onsen-app-tab-changed even when the
    // map is already visible. CastleMap listens to that event and schedules its
    // own applyMode() 20 ms later, which emits onsen-map-domain-changed and
    // immediately kicks ScenicMap back out of scenic mode. Do not re-show the
    // already-active map. When entering from another app tab, wait until the
    // legacy castle refresh has finished before enabling scenic mode.
    if (isMapViewActive()) return applyScenic(api, id);

    window.OnsenAppShell?.show?.("map");
    setTimeout(() => {
      const latest = scenicApi();
      if (latest?.showMode) applyScenic(latest, id);
    }, 60);
    return true;
  }

  function patchScenicApi() {
    const api = scenicApi();
    if (!api || api.__scenicHotfixV713 === true) return !!api;

    // Also protect links that call OnsenScenicMapV71.show(id) from collection
    // or achievement screens. The stock show() has the same app-shell race.
    api.show = (id) => activateScenic(id || null);
    Object.defineProperty(api, "__scenicHotfixV713", {
      value: true,
      configurable: false,
      enumerable: false
    });
    return true;
  }

  function bindRoot() {
    const root = getRoot();
    if (!root) return false;
    if (boundRoot === root && root.dataset.scenicHotfixV713 === "1") return true;

    boundRoot = root;
    root.dataset.scenicHotfixV713 = "1";
    root.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest('[data-map-domain="scenic"]') : null;
      if (!target || !root.contains(target)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      activateScenic();
    }, true);
    return true;
  }

  function ensure() {
    patchScenicApi();
    bindRoot();
    if (isScenicActive()) forceScenicLayout();
  }

  function install() {
    ensure();
    const shell = document.querySelector(".map-shell");
    if (shell && !observer) {
      observer = new MutationObserver(ensure);
      observer.observe(shell, { childList: true, subtree: true });
    }

    window.addEventListener("onsen-scenic-map-ready", ensure);
    window.addEventListener("onsen-scenic-map-domain-changed", () => {
      requestAnimationFrame(forceScenicLayout);
      setTimeout(forceScenicLayout, 80);
    });
    window.addEventListener("pageshow", ensure);

    clearInterval(retryTimer);
    let attempts = 0;
    retryTimer = setInterval(() => {
      ensure();
      attempts += 1;
      if (attempts >= 40 || (getRoot() && scenicApi())) clearInterval(retryTimer);
    }, 250);

    window.OnsenScenicMapHotfixV712 = {
      build: BUILD,
      activate: activateScenic,
      repair: forceScenicLayout,
      refresh: ensure
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
