(() => {
  const BUILD = "v51";
  const MOVE_THRESHOLD_PX = 4;
  const pointers = new Map();
  const counters = { down: 0, move: 0, up: 0, cancel: 0, pan: 0, pinch: 0 };
  let root = null;
  let targetMap = null;
  let gestureMoved = false;
  let singleStart = null;
  let lastCentroid = null;
  let lastDistance = 0;
  let suppressClickUntil = 0;
  let fallbackEnabled = false;

  async function waitForMap() {
    for (let i = 0; i < 300; i++) {
      try {
        if (typeof map !== "undefined" && map) return map;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("MapLibre map was not ready");
  }

  function pointFromEvent(event) {
    return { x: Number(event.clientX), y: Number(event.clientY) };
  }

  function currentPoints() {
    return [...pointers.values()];
  }

  function centroid(points) {
    const total = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: total.x / points.length, y: total.y / points.length };
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function isUiTarget(event) {
    const node = event.target instanceof Element ? event.target : null;
    return !!node?.closest?.(".map-tools-toggle, .map-tools, .maplibregl-ctrl");
  }

  function relaxViewport() {
    if (!targetMap) return;
    try { targetMap.setMinZoom?.(2.5); } catch {}
    try { targetMap.setMaxZoom?.(18); } catch {}
    try { targetMap.setMaxBounds?.(null); } catch {}
    try { targetMap.scrollZoom?.enable?.(); } catch {}
    try { targetMap.doubleClickZoom?.enable?.(); } catch {}
    try { targetMap.boxZoom?.enable?.(); } catch {}
    try { targetMap.keyboard?.enable?.(); } catch {}
    try { targetMap.resize?.(); } catch {}
  }

  function configureFallback() {
    if (!targetMap || !root) return;
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches || Number(navigator.maxTouchPoints || 0) > 0;
    fallbackEnabled = !!coarse;

    relaxViewport();

    if (!fallbackEnabled) {
      try { targetMap.dragPan?.enable?.(); } catch {}
      try { targetMap.touchZoomRotate?.enable?.(); } catch {}
      return;
    }

    // Android/PWA fallback: MapLibre click stays active, but continuous touch
    // motion is owned here so pan and pinch do not depend on its native handler.
    try { targetMap.dragPan?.disable?.(); } catch {}
    try { targetMap.touchZoomRotate?.disable?.(); } catch {}
    try { targetMap.touchPitch?.disable?.(); } catch {}
    root.style.touchAction = "none";
    root.style.overscrollBehavior = "none";
    document.documentElement.dataset.mapTouchFallback = "1";
  }

  function resetGestureReference() {
    const pts = currentPoints();
    if (pts.length === 1) {
      singleStart = { ...pts[0] };
      lastCentroid = { ...pts[0] };
      lastDistance = 0;
    } else if (pts.length >= 2) {
      lastCentroid = centroid(pts.slice(0, 2));
      lastDistance = distance(pts[0], pts[1]);
      singleStart = null;
    } else {
      singleStart = null;
      lastCentroid = null;
      lastDistance = 0;
    }
  }

  function onPointerDown(event) {
    if (!fallbackEnabled || event.pointerType === "mouse" || isUiTarget(event)) return;
    counters.down += 1;
    pointers.set(event.pointerId, pointFromEvent(event));
    if (pointers.size === 1) gestureMoved = false;
    resetGestureReference();
    try { root.setPointerCapture?.(event.pointerId); } catch {}
  }

  function onPointerMove(event) {
    if (!fallbackEnabled || !pointers.has(event.pointerId)) return;
    counters.move += 1;
    pointers.set(event.pointerId, pointFromEvent(event));
    const pts = currentPoints();

    if (pts.length === 1) {
      const p = pts[0];
      if (!singleStart) singleStart = { ...p };
      if (!lastCentroid) lastCentroid = { ...p };
      const dx = p.x - lastCentroid.x;
      const dy = p.y - lastCentroid.y;
      if (!gestureMoved && Math.hypot(p.x - singleStart.x, p.y - singleStart.y) >= MOVE_THRESHOLD_PX) gestureMoved = true;
      lastCentroid = { ...p };
      if (!gestureMoved || (!dx && !dy)) return;

      event.preventDefault();
      event.stopPropagation();
      counters.pan += 1;
      try { targetMap.panBy?.([-dx, -dy], { duration: 0 }); } catch {}
      return;
    }

    if (pts.length >= 2) {
      const pair = pts.slice(0, 2);
      const nextCentroid = centroid(pair);
      const nextDistance = Math.max(1, distance(pair[0], pair[1]));
      if (!lastCentroid) lastCentroid = nextCentroid;
      if (!lastDistance) lastDistance = nextDistance;

      const dx = nextCentroid.x - lastCentroid.x;
      const dy = nextCentroid.y - lastCentroid.y;
      const zoomDelta = Math.log2(nextDistance / lastDistance);
      gestureMoved = gestureMoved || Math.abs(dx) + Math.abs(dy) > 1 || Math.abs(zoomDelta) > 0.01;

      event.preventDefault();
      event.stopPropagation();

      if (dx || dy) {
        counters.pan += 1;
        try { targetMap.panBy?.([-dx, -dy], { duration: 0 }); } catch {}
      }
      if (Number.isFinite(zoomDelta) && Math.abs(zoomDelta) > 0.001) {
        counters.pinch += 1;
        const rect = root.getBoundingClientRect();
        const point = [nextCentroid.x - rect.left, nextCentroid.y - rect.top];
        let around = null;
        try { around = targetMap.unproject?.(point); } catch {}
        const minZoom = Number(targetMap.getMinZoom?.() ?? 2.5);
        const maxZoom = Number(targetMap.getMaxZoom?.() ?? 18);
        const nextZoom = Math.min(maxZoom, Math.max(minZoom, Number(targetMap.getZoom?.() || 0) + zoomDelta));
        try { targetMap.zoomTo?.(nextZoom, { duration: 0, ...(around ? { around } : {}) }); } catch {}
      }

      lastCentroid = nextCentroid;
      lastDistance = nextDistance;
    }
  }

  function finishPointer(event, canceled = false) {
    if (!pointers.has(event.pointerId)) return;
    if (canceled) counters.cancel += 1;
    else counters.up += 1;
    pointers.delete(event.pointerId);
    try { root.releasePointerCapture?.(event.pointerId); } catch {}

    if (pointers.size === 0) {
      if (gestureMoved) suppressClickUntil = Date.now() + 350;
      gestureMoved = false;
    }
    resetGestureReference();
  }

  function onClickCapture(event) {
    if (Date.now() >= suppressClickUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function snapshot() {
    const rect = root?.getBoundingClientRect?.();
    return {
      build: BUILD,
      fallbackEnabled,
      maxTouchPoints: Number(navigator.maxTouchPoints || 0),
      touchAction: root ? getComputedStyle(root).touchAction : null,
      zoom: targetMap?.getZoom?.(),
      minZoom: targetMap?.getMinZoom?.(),
      maxZoom: targetMap?.getMaxZoom?.(),
      nativeDragPanEnabled: targetMap?.dragPan?.isEnabled?.(),
      nativeTouchZoomEnabled: targetMap?.touchZoomRotate?.isEnabled?.(),
      pointerCount: pointers.size,
      counters: { ...counters },
      mapRect: rect ? { width: Math.round(rect.width), height: Math.round(rect.height) } : null
    };
  }

  async function install() {
    targetMap = await waitForMap();
    root = document.getElementById("map");
    if (!root) throw new Error("map container was not found");

    configureFallback();
    root.addEventListener("pointerdown", onPointerDown, { capture: true, passive: false });
    root.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
    root.addEventListener("pointerup", (event) => finishPointer(event, false), { capture: true, passive: false });
    root.addEventListener("pointercancel", (event) => finishPointer(event, true), { capture: true, passive: false });
    root.addEventListener("click", onClickCapture, true);

    window.addEventListener("onsen-app-tab-changed", (event) => {
      if (event.detail?.tab === "map") requestAnimationFrame(() => {
        relaxViewport();
        try { targetMap.resize?.(); } catch {}
      });
    });
    window.addEventListener("pageshow", () => requestAnimationFrame(() => {
      configureFallback();
      try { targetMap.resize?.(); } catch {}
    }));

    window.OnsenMapInteraction = {
      build: BUILD,
      enable: configureFallback,
      diagnostics: snapshot
    };

    console.info("onsen map touch fallback v51", snapshot());
  }

  install().catch((err) => console.warn("map touch fallback v51 init failed", err));
})();
