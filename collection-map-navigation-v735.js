(() => {
  const BUILD = "v73.5";
  const DOMAINS = new Set(["onsen", "castle", "scenic"]);
  let installed = false;
  let pending = null;
  let finalizeTimer = null;

  function normalizeDomain(value) {
    const domain = String(value || "").toLowerCase();
    return DOMAINS.has(domain) ? domain : "onsen";
  }

  function getSpot(id) {
    try {
      return typeof spots !== "undefined" && Array.isArray(spots)
        ? spots.find((spot) => String(spot?.id) === String(id)) || null
        : null;
    } catch { return null; }
  }

  function selectTarget(domain, id) {
    if (!id) return false;
    if (domain === "castle") return !!window.OnsenCastleMap?.selectCastle?.(id, { fly: true });
    if (domain === "scenic") return !!window.OnsenScenicMapV71?.select?.(id, { fly: true });
    try {
      const spot = getSpot(id);
      if (!spot) return false;
      if (typeof selectSpot === "function") selectSpot(id);
      if (typeof map !== "undefined" && map) {
        map.flyTo?.({
          center: [Number(spot.lng), Number(spot.lat)],
          zoom: Math.max(Number(map.getZoom?.() || 10), 10)
        });
      }
      return true;
    } catch { return false; }
  }

  function applyPending(reason = "apply") {
    if (!pending) return false;
    const request = pending;
    const router = window.OnsenMapDomainV73;
    if (!router?.setMode) return false;
    router.setMode(request.domain, { source: `collection-map-v735:${reason}` });
    router.apply?.();
    if (request.domain === "scenic") window.OnsenScenicRendererV734?.syncVisibility?.();
    const selected = selectTarget(request.domain, request.id);
    if (selected) window.OnsenMapDetailV736?.present?.(request.domain, request.id);
    router.apply?.();
    return router.getMode?.() === request.domain && selected;
  }

  function open(domain, id) {
    const target = normalizeDomain(domain);
    if (!id) return false;
    pending = { domain: target, id: String(id), startedAt: Date.now() };

    // Choose the map category before showing the map, never expose the previous tab.
    window.OnsenMapDomainV73?.setMode?.(target, { source: "collection-map-v735:preopen" });
    window.OnsenAppShell?.show?.("map");

    requestAnimationFrame(() => requestAnimationFrame(() => applyPending("raf")));
    clearTimeout(finalizeTimer);
    finalizeTimer = setTimeout(() => {
      applyPending("settle");
      pending = null;
    }, 140);
    return true;
  }

  function handleClick(event) {
    const button = event.target instanceof Element
      ? event.target.closest("#collectionCommonPanelV732 [data-common-map]")
      : null;
    if (!button) return;
    const domain = button.dataset.commonDomain;
    const id = button.dataset.commonMap;
    if (!domain || !id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    open(domain, id);
  }

  function install() {
    if (installed) return;
    installed = true;
    document.addEventListener("click", handleClick, true);
    window.addEventListener("onsen-app-tab-changed", (event) => {
      if (event.detail?.tab === "map" && pending) applyPending("map-tab");
    });
    window.OnsenCollectionMapNavigationV735 = { build: BUILD, open, applyPending };
    if (window.OnsenCollectionDomainV732) window.OnsenCollectionDomainV732.openOnMap = open;
    window.addEventListener("onsen-collection-domain-v732-ready", () => {
      if (window.OnsenCollectionDomainV732) window.OnsenCollectionDomainV732.openOnMap = open;
    });
    window.dispatchEvent(new CustomEvent("onsen-collection-map-navigation-v735-ready", { detail: { build: BUILD } }));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();