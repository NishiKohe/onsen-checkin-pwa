(() => {
  const BUILD = "v50";

  async function waitForMap() {
    for (let i = 0; i < 300; i++) {
      try {
        if (typeof map !== "undefined" && map) return map;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("MapLibre map was not ready");
  }

  function enableInteractions(targetMap) {
    // v50 diagnostic/fix: remove the old Japan viewport lock while preserving
    // the application's own spot/check-in logic.
    try { targetMap.setMinZoom?.(2.5); } catch {}
    try { targetMap.setMaxZoom?.(18); } catch {}
    try { targetMap.setMaxBounds?.(null); } catch {}

    try { targetMap.dragPan?.enable?.(); } catch {}
    try { targetMap.touchZoomRotate?.enable?.(); } catch {}
    try { targetMap.scrollZoom?.enable?.(); } catch {}
    try { targetMap.doubleClickZoom?.enable?.(); } catch {}
    try { targetMap.boxZoom?.enable?.(); } catch {}
    try { targetMap.keyboard?.enable?.(); } catch {}

    // Keep accidental phone rotation out of the gesture, but retain pinch zoom.
    try { targetMap.touchZoomRotate?.disableRotation?.(); } catch {}
    try { targetMap.resize?.(); } catch {}
  }

  function snapshot(targetMap) {
    const canvas = targetMap?.getCanvas?.();
    const rect = canvas?.getBoundingClientRect?.();
    return {
      build: BUILD,
      zoom: targetMap?.getZoom?.(),
      minZoom: targetMap?.getMinZoom?.(),
      maxZoom: targetMap?.getMaxZoom?.(),
      maxBounds: targetMap?.getMaxBounds?.() || null,
      dragPanEnabled: targetMap?.dragPan?.isEnabled?.(),
      touchZoomRotateEnabled: targetMap?.touchZoomRotate?.isEnabled?.(),
      scrollZoomEnabled: targetMap?.scrollZoom?.isEnabled?.(),
      canvasRect: rect ? { width: Math.round(rect.width), height: Math.round(rect.height) } : null
    };
  }

  async function install() {
    const targetMap = await waitForMap();
    enableInteractions(targetMap);

    // Re-apply only after layout/tab transitions. This does not alter CSS or
    // intercept pointer/touch events.
    window.addEventListener("onsen-app-tab-changed", (event) => {
      if (event.detail?.tab === "map") requestAnimationFrame(() => enableInteractions(targetMap));
    });
    window.addEventListener("pageshow", () => requestAnimationFrame(() => enableInteractions(targetMap)));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") requestAnimationFrame(() => enableInteractions(targetMap));
    });

    window.OnsenMapInteraction = {
      build: BUILD,
      enable: () => enableInteractions(targetMap),
      diagnostics: () => snapshot(targetMap)
    };

    console.info("onsen map interaction v50", snapshot(targetMap));
  }

  install().catch((err) => console.warn("map interaction v50 init failed", err));
})();
