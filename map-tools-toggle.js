(() => {
  const BUILD = "v48";
  const SESSION_KEY = "onsenMapToolsOpenV1";
  let button = null;
  let panel = null;
  let installed = false;

  function isOpen() {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  }

  function ensureMapGestures() {
    requestAnimationFrame(() => {
      try {
        if (typeof map === "undefined" || !map) return;
        map.dragPan?.enable?.();
        map.touchZoomRotate?.enable?.();
        map.doubleClickZoom?.enable?.();
        map.scrollZoom?.enable?.();
        map.resize?.();
      } catch (err) {
        console.warn("map gesture restore skipped", err);
      }
    });
  }

  function setOpen(open, { persist = true } = {}) {
    if (!panel || !button) return;
    const next = !!open;
    panel.hidden = !next;
    panel.setAttribute("aria-hidden", next ? "false" : "true");
    panel.style.pointerEvents = next ? "auto" : "none";
    button.setAttribute("aria-expanded", next ? "true" : "false");
    button.classList.toggle("active", next);
    button.querySelector(".map-tools-toggle-label").textContent = next ? "検索を閉じる" : "検索・絞り込み";
    panel.closest(".map-shell")?.classList.toggle("map-tools-expanded", next);
    if (persist) sessionStorage.setItem(SESSION_KEY, next ? "1" : "0");
    ensureMapGestures();
  }

  function activeFilterCount() {
    if (!panel) return 0;
    let count = 0;
    const search = document.getElementById("searchInput");
    if (search?.value?.trim()) count += 1;
    const pref = document.getElementById("prefFilter");
    if (pref?.value) count += 1;
    const visit = panel.querySelector('[data-visit].active:not([data-visit="all"])');
    if (visit) count += 1;
    count += panel.querySelectorAll('[data-tag].active').length;
    const regionalAsset = document.getElementById("btnRegionalAsset");
    if (regionalAsset?.classList.contains("active")) count += 1;
    return count;
  }

  function refreshBadge() {
    if (!button) return;
    const count = activeFilterCount();
    let badge = button.querySelector(".map-tools-toggle-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "map-tools-toggle-badge";
      button.appendChild(badge);
    }
    badge.textContent = count ? String(count) : "";
    badge.hidden = count === 0;
    button.classList.toggle("has-filter", count > 0);
  }

  function makeButton() {
    const shell = document.querySelector(".map-shell");
    panel = shell?.querySelector(".map-tools") || null;
    if (!shell || !panel) return false;

    button = document.getElementById("btnMapToolsToggle");
    if (!button) {
      button = document.createElement("button");
      button.id = "btnMapToolsToggle";
      button.type = "button";
      button.className = "map-tools-toggle";
      button.setAttribute("aria-controls", "mapToolsPanel");
      button.innerHTML = `<span class="map-tools-toggle-icon" aria-hidden="true">⌕</span><span class="map-tools-toggle-label">検索・絞り込み</span>`;
      shell.appendChild(button);
    }
    panel.id = "mapToolsPanel";
    button.addEventListener("click", () => setOpen(panel.hidden));
    return true;
  }

  function bindFilterState() {
    if (!panel) return;
    panel.addEventListener("input", refreshBadge, true);
    panel.addEventListener("change", refreshBadge, true);
    panel.addEventListener("click", () => setTimeout(refreshBadge, 0), true);

    const observer = new MutationObserver(refreshBadge);
    observer.observe(panel, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  }

  async function install() {
    if (installed) return;
    for (let i = 0; i < 240; i++) {
      if (document.querySelector(".map-shell .map-tools")) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!makeButton()) throw new Error("map tools panel was not found");
    installed = true;
    bindFilterState();

    setOpen(isOpen(), { persist: false });
    refreshBadge();
    ensureMapGestures();

    window.addEventListener("pageshow", () => {
      setOpen(isOpen(), { persist: false });
      refreshBadge();
      ensureMapGestures();
    });
    window.addEventListener("onsen-app-tab-changed", (event) => {
      if (event.detail?.tab === "map") {
        setTimeout(refreshBadge, 0);
        setTimeout(ensureMapGestures, 0);
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && document.documentElement.dataset.appTab === "map") ensureMapGestures();
    });

    window.OnsenMapTools = {
      build: BUILD,
      open: () => setOpen(true),
      close: () => setOpen(false),
      toggle: () => setOpen(panel?.hidden),
      isOpen: () => !panel?.hidden,
      restoreMapGestures: ensureMapGestures,
      refresh: refreshBadge
    };
  }

  install().catch((err) => console.warn("map tools toggle init failed", err));
})();
