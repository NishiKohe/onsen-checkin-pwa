(() => {
  const BUILD = "v49";
  let button = null;
  let panel = null;
  let installed = false;

  function setOpen(open) {
    if (!panel || !button) return;
    const next = !!open;
    panel.hidden = !next;
    panel.setAttribute("aria-hidden", next ? "false" : "true");
    button.setAttribute("aria-expanded", next ? "true" : "false");
    button.classList.toggle("active", next);
    const label = button.querySelector(".map-tools-toggle-label");
    if (label) label.textContent = next ? "検索を閉じる" : "検索・絞り込み";
    panel.closest(".map-shell")?.classList.toggle("map-tools-expanded", next);
  }

  function activeFilterCount() {
    if (!panel) return 0;
    let count = 0;
    const search = document.getElementById("searchInput");
    if (search?.value?.trim()) count += 1;
    const pref = document.getElementById("prefFilter");
    if (pref?.value) count += 1;
    if (panel.querySelector('[data-visit].active:not([data-visit="all"])')) count += 1;
    count += panel.querySelectorAll('[data-tag].active').length;
    const regionalAsset = document.getElementById("btnRegionalAsset");
    if (regionalAsset?.classList.contains("active")) count += 1;
    return count;
  }

  function refreshBadge() {
    if (!button) return;
    const count = activeFilterCount();
    const badge = button.querySelector(".map-tools-toggle-badge");
    if (!badge) return;
    badge.textContent = count ? String(count) : "";
    badge.hidden = count === 0;
    button.classList.toggle("has-filter", count > 0);
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
      button = document.getElementById("btnMapToolsToggle");
      panel = document.getElementById("mapToolsPanel") || document.querySelector(".map-shell .map-tools");
      if (button && panel) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!button || !panel) throw new Error("map tools UI was not found");
    installed = true;
    panel.id = "mapToolsPanel";
    button.addEventListener("click", () => setOpen(panel.hidden));
    bindFilterState();

    // A full page/app launch always starts with the search UI closed.
    setOpen(false);
    refreshBadge();

    window.addEventListener("pageshow", refreshBadge);
    window.addEventListener("onsen-app-tab-changed", (event) => {
      if (event.detail?.tab === "map") setTimeout(refreshBadge, 0);
    });

    window.OnsenMapTools = {
      build: BUILD,
      open: () => setOpen(true),
      close: () => setOpen(false),
      toggle: () => setOpen(panel.hidden),
      isOpen: () => !panel.hidden,
      refresh: refreshBadge
    };
  }

  install().catch((err) => console.warn("map tools toggle init failed", err));
})();
