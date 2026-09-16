(() => {
  const BUILD = "v73.6";
  const CATEGORIES = ["onsen", "castle", "scenic"];
  const CAMERA_KEY = "onsenMapCameraV736";
  const FALLBACK = { lng: 139.70, lat: 35.69, zoom: 10 };
  let installed = false;
  let boundMap = null;
  let userMovedMap = false;
  let cameraInitialized = false;
  let currentSelection = null;

  function getMap() { try { return typeof map !== "undefined" ? map : null; } catch { return null; } }
  function getMode() { return window.OnsenMapDomainV73?.getMode?.() || "onsen"; }
  function mapVisible() { return document.documentElement.dataset.appTab === "map"; }
  function main() { return document.querySelector(".main"); }
  function isValidPoint(lng, lat) { return Number.isFinite(lng) && Number.isFinite(lat) && lng >= 122 && lng <= 154 && lat >= 20 && lat <= 46.5; }
  function savedCamera() {
    try {
      const v = JSON.parse(localStorage.getItem(CAMERA_KEY) || "null");
      return isValidPoint(Number(v?.lng), Number(v?.lat)) && Number.isFinite(Number(v?.zoom))
        ? { lng: Number(v.lng), lat: Number(v.lat), zoom: Math.max(8, Math.min(15, Number(v.zoom))) } : null;
    } catch { return null; }
  }
  function storeCamera() {
    const m = getMap();
    if (!m || !mapVisible()) return;
    try {
      const center = m.getCenter?.();
      const lng = Number(center?.lng), lat = Number(center?.lat);
      if (!isValidPoint(lng, lat)) return;
      localStorage.setItem(CAMERA_KEY, JSON.stringify({ lng: Math.round(lng * 1000) / 1000, lat: Math.round(lat * 1000) / 1000, zoom: Math.round(Number(m.getZoom?.() || 11) * 10) / 10 }));
    } catch {}
  }
  function focusCamera(position, zoom) {
    const m = getMap();
    if (!m || !isValidPoint(position.lng, position.lat)) return false;
    try { m.jumpTo?.({ center: [position.lng, position.lat], zoom }); storeCamera(); return true; } catch { return false; }
  }
  function initializeCamera() {
    const m = getMap();
    if (!m || cameraInitialized) return;
    cameraInitialized = true;
    const previous = savedCamera();
    focusCamera(previous || FALLBACK, previous ? Math.max(10, previous.zoom) : FALLBACK.zoom);
    // Geolocation is asynchronous: never block map interaction or override a user gesture.
    if (!navigator.geolocation?.getCurrentPosition) return;
    navigator.geolocation.getCurrentPosition((result) => {
      const coords = result?.coords;
      const point = { lng: Number(coords?.longitude), lat: Number(coords?.latitude) };
      if (userMovedMap || currentSelection || !isValidPoint(point.lng, point.lat)) return;
      focusCamera(point, 12);
    }, () => { /* A saved camera or regional fallback remains usable without permission. */ }, {
      enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 9000
    });
  }
  function ensureControls() {
    for (const panel of main()?.querySelectorAll(":scope > .panel") || []) {
      if (!panel.querySelector(".map-detail-handle-v736")) {
        const handle = document.createElement("div");
        handle.className = "map-detail-handle-v736";
        handle.setAttribute("aria-hidden", "true");
        panel.prepend(handle);
        let startY = null;
        handle.addEventListener("touchstart", (event) => { startY = event.touches?.[0]?.clientY ?? null; }, { passive: true });
        handle.addEventListener("touchend", (event) => {
          if (startY != null && Number(event.changedTouches?.[0]?.clientY) - startY > 70) close("swipe");
          startY = null;
        }, { passive: true });
      }
      if (!panel.querySelector(".map-detail-close-v736")) {
        const closeButton = document.createElement("button");
        closeButton.type = "button";
        closeButton.className = "map-detail-close-v736";
        closeButton.setAttribute("aria-label", "地点の詳細を閉じる");
        closeButton.textContent = "×";
        closeButton.addEventListener("click", () => close("button"));
        panel.insertBefore(closeButton, panel.firstChild?.nextSibling || null);
      }
      panel.setAttribute("role", "region");
      panel.setAttribute("aria-label", panel.classList.contains("castle-map-panel-v62") ? "城の詳細" : panel.classList.contains("scenic-map-panel-v71") ? "名勝の詳細" : "温泉の詳細");
    }
  }
  function close(reason = "close") {
    main()?.classList.remove("map-detail-open");
    currentSelection = null;
    window.OnsenMapDomainV73?.setDetailDomain?.(null);
    window.dispatchEvent(new CustomEvent("onsen-map-detail-v736-closed", { detail: { build: BUILD, reason } }));
  }
  function present(domain, id) {
    if (!CATEGORIES.includes(domain) || !id) return false;
    const router = window.OnsenMapDomainV73;
    const mode = getMode();
    if (mode !== "all" && mode !== domain) router?.setMode?.(domain, { source: "map-detail-v736" });
    ensureControls();
    router?.setDetailDomain?.(domain);
    const panel = domain === "castle" ? document.getElementById("castleMapPanelV62")
      : domain === "scenic" ? document.getElementById("scenicMapPanelV71")
      : main()?.querySelector(":scope > .panel:not(.castle-map-panel-v62):not(.scenic-map-panel-v71)");
    if (!panel) return false;
    panel.scrollTop = 0;
    currentSelection = { domain, id: String(id) };
    main()?.classList.add("map-detail-open");
    window.dispatchEvent(new CustomEvent("onsen-map-detail-v736-opened", { detail: { build: BUILD, domain, id: String(id) } }));
    return true;
  }
  function select(domain, id) {
    if (!id) return false;
    try {
      if (domain === "castle") return !!window.OnsenCastleMap?.selectCastle?.(id, { fly: false });
      if (domain === "scenic") return !!window.OnsenScenicMapV71?.select?.(id, { fly: false });
      if (typeof selectSpot !== "function") return false;
      selectSpot(id);
      return typeof selectedSpot !== "undefined" && String(selectedSpot?.id) === String(id);
    } catch (error) { console.warn("map detail selection failed", domain, error); return false; }
  }
  function hitAt(event) {
    const m = getMap(), mode = getMode();
    if (!m?.queryRenderedFeatures || !event?.point) return null;
    const defs = [
      ["onsen", ["spots-symbol", "spots-labels"]],
      ["castle", ["castles-v62-symbol", "castles-v62-labels"]],
      ["scenic", ["scenic-v734-points", "scenic-v734-labels", "scenic-v71-symbol", "scenic-v71-labels"]]
    ];
    const layers = defs.filter(([domain]) => mode === "all" || mode === domain)
      .flatMap(([, ids]) => ids.filter(id => !!m.getLayer?.(id) && m.getLayoutProperty?.(id, "visibility") !== "none"));
    if (!layers.length) return null;
    try {
      const found = m.queryRenderedFeatures(event.point, { layers }) || [];
      for (const feature of found) {
        const id = feature?.properties?.id;
        const layer = String(feature?.layer?.id || "");
        const domain = layer.startsWith("castles-") ? "castle" : layer.startsWith("scenic-") ? "scenic" : layer.startsWith("spots-") ? "onsen" : null;
        if (domain && id) return { domain, id: String(id) };
      }
    } catch (error) { console.warn("map detail feature query failed", error); }
    return null;
  }
  function onMapClick(event) {
    if (!mapVisible()) return;
    const target = event?.originalEvent?.target;
    if (target instanceof Element && target.closest("button, input, select, .map-tools, .map-domain-switch-v62, .panel")) return;
    const hit = hitAt(event);
    if (!hit) { if (currentSelection) close("map-background"); return; }
    if (!select(hit.domain, hit.id)) return;
    present(hit.domain, hit.id);
  }
  function bindMap() {
    const m = getMap();
    if (!m || boundMap === m) return;
    boundMap = m;
    const node = m.getCanvas?.();
    for (const eventName of ["pointerdown", "wheel", "touchstart"]) node?.addEventListener?.(eventName, () => { userMovedMap = true; }, { passive: true });
    m.on?.("click", onMapClick);
    m.on?.("moveend", storeCamera);
    m.on?.("load", initializeCamera);
    if (m.loaded?.() || m.isStyleLoaded?.()) initializeCamera();
  }
  function install() {
    if (installed) return;
    installed = true;
    ensureControls();
    bindMap();
    const observer = new MutationObserver(() => ensureControls());
    const root = main();
    if (root) observer.observe(root, { childList: true });
    window.addEventListener("onsen-map-domain-v73-changed", () => close("domain-change"));
    window.addEventListener("onsen-app-tab-changed", (event) => {
      if (event.detail?.tab !== "map") close("tab-change");
      else { ensureControls(); bindMap(); getMap()?.resize?.(); }
    });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && currentSelection) close("escape"); });
    window.addEventListener("pageshow", () => { bindMap(); ensureControls(); });
    window.OnsenMapDetailV736 = { build: BUILD, present, close, select, initializeCamera, diagnostics: () => ({ build: BUILD, currentSelection, cameraInitialized, userMovedMap }) };
    window.dispatchEvent(new CustomEvent("onsen-map-detail-v736-ready", { detail: { build: BUILD } }));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();