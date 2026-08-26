(() => {
  const BUILD = "v56";
  const MOVE_THRESHOLD_PX = 2;
  const MIN_ZOOM = 3.6;
  const MAX_ZOOM = 18;
  const JAPAN_BOUNDS = [
    [122.0, 20.0],
    [154.0, 46.5]
  ];

  let targetMap = null;
  let canvasContainer = null;
  let canvas = null;
  let touchFallbackEnabled = false;
  let lastTouches = [];
  let gestureMoved = false;
  let suppressClickUntil = 0;

  const counters = {
    touchstart: 0,
    touchmove: 0,
    touchend: 0,
    touchcancel: 0,
    pan: 0,
    pinch: 0
  };

  async function waitForMap() {
    for (let i = 0; i < 300; i++) {
      try {
        if (typeof map !== "undefined" && map) return map;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("MapLibre map was not ready");
  }

  function applyViewportConstraints() {
    if (!targetMap) return;
    try { targetMap.setMinZoom?.(MIN_ZOOM); } catch {}
    try { targetMap.setMaxZoom?.(MAX_ZOOM); } catch {}
    try { targetMap.setMaxBounds?.(JAPAN_BOUNDS); } catch {}
    try { targetMap.scrollZoom?.enable?.(); } catch {}
    try { targetMap.doubleClickZoom?.enable?.(); } catch {}
    try { targetMap.boxZoom?.enable?.(); } catch {}
    try { targetMap.keyboard?.enable?.(); } catch {}
    try { targetMap.resize?.(); } catch {}
  }

  function touchPoints(event) {
    if (!canvasContainer) return [];
    const rect = canvasContainer.getBoundingClientRect();
    return [...event.touches].map((touch) => ({
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top
    }));
  }

  function centroid(points) {
    if (!points.length) return { x: 0, y: 0 };
    let x = 0;
    let y = 0;
    for (const point of points) {
      x += point.x;
      y += point.y;
    }
    return { x: x / points.length, y: y / points.length };
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function panDirect(dx, dy) {
    if (!targetMap || (!dx && !dy)) return;
    try {
      const currentCenter = targetMap.getCenter();
      const centerPoint = targetMap.project(currentCenter);
      const nextCenter = targetMap.unproject([
        centerPoint.x - dx,
        centerPoint.y - dy
      ]);
      targetMap.jumpTo({ center: nextCenter });
      counters.pan += 1;
    } catch (err) {
      console.warn("direct touch pan skipped", err);
    }
  }

  function zoomDirect(zoomDelta, anchorPoint) {
    if (!targetMap || !Number.isFinite(zoomDelta) || Math.abs(zoomDelta) < 0.001) return;
    try {
      const currentZoom = Number(targetMap.getZoom?.() || 0);
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentZoom + zoomDelta));

      const anchor = targetMap.unproject([anchorPoint.x, anchorPoint.y]);
      targetMap.jumpTo({ zoom: nextZoom });
      const projectedAnchor = targetMap.project(anchor);
      panDirect(anchorPoint.x - projectedAnchor.x, anchorPoint.y - projectedAnchor.y);
      counters.pinch += 1;
    } catch (err) {
      console.warn("direct touch zoom skipped", err);
    }
  }

  function configureTouchFallback() {
    if (!targetMap) return;
    canvasContainer = targetMap.getCanvasContainer?.() || document.querySelector("#map .maplibregl-canvas-container");
    canvas = targetMap.getCanvas?.() || canvasContainer?.querySelector?.("canvas") || null;

    const touchCapable = Number(navigator.maxTouchPoints || 0) > 0 || "ontouchstart" in window;
    touchFallbackEnabled = !!touchCapable && !!canvasContainer;
    applyViewportConstraints();

    if (!touchFallbackEnabled) {
      try { targetMap.dragPan?.enable?.(); } catch {}
      try { targetMap.touchZoomRotate?.enable?.(); } catch {}
      document.documentElement.removeAttribute("data-map-touch-fallback");
      return;
    }

    try { targetMap.dragPan?.disable?.(); } catch {}
    try { targetMap.touchZoomRotate?.disable?.(); } catch {}
    try { targetMap.touchPitch?.disable?.(); } catch {}

    for (const node of [canvasContainer, canvas].filter(Boolean)) {
      node.style.touchAction = "none";
      node.style.overscrollBehavior = "none";
      node.style.userSelect = "none";
      node.style.webkitUserSelect = "none";
    }

    document.documentElement.dataset.mapTouchFallback = BUILD;
  }

  function onTouchStart(event) {
    if (!touchFallbackEnabled) return;
    counters.touchstart += 1;
    const points = touchPoints(event);
    if (!lastTouches.length) gestureMoved = false;
    lastTouches = points;
  }

  function onTouchMove(event) {
    if (!touchFallbackEnabled) return;
    counters.touchmove += 1;

    const points = touchPoints(event);
    if (!points.length) return;

    if (points.length === 1 && lastTouches.length === 1) {
      const dx = points[0].x - lastTouches[0].x;
      const dy = points[0].y - lastTouches[0].y;
      if (gestureMoved || Math.hypot(dx, dy) >= MOVE_THRESHOLD_PX) {
        gestureMoved = true;
        event.preventDefault();
        event.stopPropagation();
        panDirect(dx, dy);
      }
      lastTouches = points;
      return;
    }

    if (points.length >= 2 && lastTouches.length >= 2) {
      const previousPair = lastTouches.slice(0, 2);
      const nextPair = points.slice(0, 2);
      const previousCentroid = centroid(previousPair);
      const nextCentroid = centroid(nextPair);
      const dx = nextCentroid.x - previousCentroid.x;
      const dy = nextCentroid.y - previousCentroid.y;
      const previousDistance = Math.max(1, distance(previousPair[0], previousPair[1]));
      const nextDistance = Math.max(1, distance(nextPair[0], nextPair[1]));
      const zoomDelta = Math.log2(nextDistance / previousDistance);

      gestureMoved = true;
      event.preventDefault();
      event.stopPropagation();

      if (dx || dy) panDirect(dx, dy);
      zoomDirect(zoomDelta, nextCentroid);
      lastTouches = points;
      return;
    }

    lastTouches = points;
  }

  function finishTouch(event, canceled) {
    if (!touchFallbackEnabled) return;
    if (canceled) counters.touchcancel += 1;
    else counters.touchend += 1;

    const remaining = touchPoints(event);
    if (!remaining.length) {
      if (gestureMoved) suppressClickUntil = Date.now() + 350;
      gestureMoved = false;
    }
    lastTouches = remaining;
  }

  function onClickCapture(event) {
    if (Date.now() >= suppressClickUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function bindTouchRuntime() {
    if (!canvasContainer || canvasContainer.dataset.onsenTouchRuntime === BUILD) return;
    canvasContainer.dataset.onsenTouchRuntime = BUILD;

    canvasContainer.addEventListener("touchstart", onTouchStart, { capture: true, passive: false });
    canvasContainer.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    canvasContainer.addEventListener("touchend", (event) => finishTouch(event, false), { capture: true, passive: false });
    canvasContainer.addEventListener("touchcancel", (event) => finishTouch(event, true), { capture: true, passive: false });
    canvasContainer.addEventListener("click", onClickCapture, true);
  }

  function snapshot() {
    const rect = canvasContainer?.getBoundingClientRect?.();
    const bounds = targetMap?.getMaxBounds?.();
    return {
      build: BUILD,
      touchFallbackEnabled,
      maxTouchPoints: Number(navigator.maxTouchPoints || 0),
      touchAction: canvasContainer ? getComputedStyle(canvasContainer).touchAction : null,
      zoom: targetMap?.getZoom?.(),
      minZoom: targetMap?.getMinZoom?.(),
      maxZoom: targetMap?.getMaxZoom?.(),
      japanBoundsEnabled: !!bounds,
      nativeDragPanEnabled: targetMap?.dragPan?.isEnabled?.(),
      nativeTouchZoomEnabled: targetMap?.touchZoomRotate?.isEnabled?.(),
      counters: { ...counters },
      mapRect: rect ? { width: Math.round(rect.width), height: Math.round(rect.height) } : null
    };
  }

  async function install() {
    targetMap = await waitForMap();
    configureTouchFallback();
    bindTouchRuntime();

    window.addEventListener("onsen-app-tab-changed", (event) => {
      if (event.detail?.tab !== "map") return;
      requestAnimationFrame(() => {
        applyViewportConstraints();
        try { targetMap.resize?.(); } catch {}
      });
    });

    window.addEventListener("pageshow", () => requestAnimationFrame(() => {
      configureTouchFallback();
      bindTouchRuntime();
      try { targetMap.resize?.(); } catch {}
    }));

    window.OnsenMapInteraction = {
      build: BUILD,
      enable: () => {
        configureTouchFallback();
        bindTouchRuntime();
      },
      diagnostics: snapshot
    };

    console.info("onsen map direct touch runtime v56", snapshot());
  }

  install().catch((err) => console.warn("map direct touch runtime v56 init failed", err));
})();
