(() => {
  "use strict";

  const BUILD = "v73.10";
  const DETAIL_ZOOM = 10;
  const DOMAINS = ["onsen", "castle", "scenic"];
  const ORIGINAL = [
    "spots-symbol", "spots-labels",
    "castles-v62-symbol", "castles-v62-labels",
    "scenic-v734-points", "scenic-v734-labels",
    "scenic-v71-symbol", "scenic-v71-labels"
  ];
  const LEGACY_DYNAMIC_LAYERS = [
    "map-v738-cluster",
    "map-v738-count",
    "map-v738-single",
    "map-v738-label"
  ];
  const LEGACY_DYNAMIC_SOURCES = [
    "map-v738-clusters",
    "map-v738-groups",
    "map-v738-singles"
  ];
  const NAMES = { onsen: "温泉", castle: "名城200", scenic: "名勝" };
  const SYMBOLS = { onsen: "♨", castle: "🏯", scenic: "◇" };

  let boundMap = null;
  let installed = false;
  let active = false;
  let featuresCount = 0;
  let renderedCount = 0;
  let groupCount = 0;
  let singleCount = 0;
  let timer = null;
  let retries = 0;
  let pickerEpoch = 0;
  let renderEpoch = 0;
  const originalZoom = new Map();
  const $ = id => document.getElementById(id);

  function mapInstance() {
    try { return typeof map !== "undefined" ? map : null; }
    catch { return null; }
  }

  function domainMode() {
    return window.OnsenMapDomainV73?.getMode?.() || "all";
  }

  function normalise(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\s　・･]/g, "");
  }

  function filteredCatalog() {
    const all = window.OnsenMapDiscoveryV737?.catalog?.() || [];
    const counts = Object.fromEntries(
      DOMAINS.map(domain => [
        domain,
        all.filter(item => item.domain === domain).length
      ])
    );

    if (counts.castle !== 200 || counts.scenic !== 433 || counts.onsen < 1) {
      return null;
    }

    const selectedMode = domainMode();
    const query = normalise($("mapDiscoveryQueryV737")?.value || "");
    const prefecture = $("mapDiscoveryPrefV737")?.value || "";
    const visit = $("mapDiscoveryStatusV737")?.value || "all";

    return all.filter(item =>
      (selectedMode === "all" || item.domain === selectedMode) &&
      (!prefecture || item.pref?.includes(prefecture)) &&
      (visit === "all" || (visit === "visited") === !!item.visited) &&
      (!query || item.search?.includes(query))
    );
  }

  function normalizeItem(item) {
    return {
      domain: item.domain,
      id: String(item.id),
      name: String(item.name || item.id),
      prefecture: item.pref?.join("・") || "",
      visited: !!item.visited,
      lng: Number(item.lng),
      lat: Number(item.lat)
    };
  }

  function ensureUi() {
    const shell = document.querySelector(".map-shell");
    if (!shell) return null;

    let overlay = $("mapClusterOverlayV738");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "mapClusterOverlayV738";
      overlay.className = "map-cluster-overlay-v738";
      overlay.setAttribute("aria-label", "広域地点表示");
      shell.appendChild(overlay);

      overlay.addEventListener("click", event => {
        const button = event.target instanceof Element
          ? event.target.closest("button[data-map-aggregate-index]")
          : null;
        if (!button || !overlay.contains(button)) return;

        event.preventDefault();
        event.stopPropagation();

        const marker = overlay.items?.[Number(button.dataset.mapAggregateIndex)];
        if (!marker) return;

        if (marker.kind === "group") {
          openGroup(marker);
          return;
        }

        openSingle(marker.item);
      });
    }

    if (!$("mapClusterLegendV738")) {
      const legend = document.createElement("div");
      legend.id = "mapClusterLegendV738";
      legend.className = "map-cluster-legend-v738";
      legend.setAttribute("aria-label", "ピンの色の凡例");
      legend.innerHTML =
        '<span><i class="onsen"></i>温泉</span>' +
        '<span><i class="castle"></i>城</span>' +
        '<span><i class="scenic"></i>名勝</span>' +
        '<small>金の縁は取得済</small>';
      shell.appendChild(legend);
    }

    if (!$("mapClusterPickerV738")) {
      const panel = document.createElement("section");
      panel.id = "mapClusterPickerV738";
      panel.className = "map-cluster-picker-v738";
      panel.hidden = true;
      panel.setAttribute("aria-label", "重なった地点から選択");
      panel.innerHTML =
        '<header><strong id="mapClusterPickerTitleV738">近くの地点</strong>' +
        '<button type="button" id="mapClusterPickerCloseV738" aria-label="地点一覧を閉じる">×</button></header>' +
        '<div id="mapClusterPickerListV738"></div>';
      shell.appendChild(panel);

      $("mapClusterPickerCloseV738").addEventListener("click", closePicker);
      $("mapClusterPickerListV738").addEventListener("click", event => {
        const button = event.target instanceof Element
          ? event.target.closest("button[data-index]")
          : null;
        if (!button) return;

        const item = panel.items?.[Number(button.dataset.index)];
        if (!item) return;

        closePicker();

        if (window.OnsenMapDetailV736?.select?.(item.domain, item.id)) {
          const m = mapInstance();
          m?.flyTo?.({
            center: [item.lng, item.lat],
            zoom: Math.max(DETAIL_ZOOM + 1, m.getZoom?.() || 0)
          });
          window.OnsenMapDetailV736?.present?.(item.domain, item.id);
        }
      });
    }

    return overlay;
  }

  function closePicker() {
    pickerEpoch += 1;
    const panel = $("mapClusterPickerV738");
    if (panel) {
      panel.hidden = true;
      panel.items = [];
    }
  }

  function showPicker(items, label) {
    const panel = $("mapClusterPickerV738");
    const list = $("mapClusterPickerListV738");
    if (!panel || !list || !items.length) return false;

    closePicker();

    const unique = [...new Map(
      items.map(item => [item.domain + ":" + item.id, item])
    ).values()];

    panel.items = unique;
    $("mapClusterPickerTitleV738").textContent =
      label + "（" + unique.length + "件）";
    list.replaceChildren();

    unique.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.index = String(index);

      const name = document.createElement("strong");
      name.textContent = item.name;

      const meta = document.createElement("span");
      meta.textContent =
        NAMES[item.domain] + " ・ " +
        (item.prefecture || "場所未設定") + " ・ " +
        (item.visited ? "取得済" : "未取得");

      button.append(name, meta);
      list.appendChild(button);
    });

    panel.hidden = false;
    return true;
  }

  function cleanupLegacyDynamicMapLayers(m) {
    for (const id of LEGACY_DYNAMIC_LAYERS) {
      if (!m.getLayer?.(id)) continue;
      try { m.removeLayer(id); }
      catch {}
    }

    for (const id of LEGACY_DYNAMIC_SOURCES) {
      if (!m.getSource?.(id)) continue;
      try { m.removeSource(id); }
      catch {}
    }
  }

  function restoreOriginal(m) {
    for (const id of ORIGINAL) {
      const range = originalZoom.get(id);
      if (range && m.getLayer?.(id)) {
        try { m.setLayerZoomRange(id, range.min, range.max); }
        catch {}
      }
    }
  }

  function restrictOriginal(m) {
    if (typeof m.setLayerZoomRange !== "function") return false;

    for (const id of ORIGINAL) {
      const layer = m.getLayer?.(id);
      if (!layer) continue;

      if (!originalZoom.has(id)) {
        originalZoom.set(id, {
          min: Number.isFinite(layer.minzoom) ? layer.minzoom : 0,
          max: Number.isFinite(layer.maxzoom) ? layer.maxzoom : 24
        });
      }

      const range = originalZoom.get(id);

      try {
        m.setLayerZoomRange(
          id,
          Math.max(DETAIL_ZOOM, range.min),
          range.max
        );
      } catch {
        return false;
      }
    }

    return true;
  }

  function viewportInfo(m) {
    const shell = document.querySelector(".map-shell");
    const canvas = m.getCanvas?.();
    if (!shell || !canvas) return null;

    const shellRect = shell.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    return {
      shell,
      shellRect,
      canvasRect,
      width: canvasRect.width,
      height: canvasRect.height,
      offsetX: canvasRect.left - shellRect.left,
      offsetY: canvasRect.top - shellRect.top
    };
  }

  function aggregate(m, items) {
    const zoom = Number(m.getZoom?.() || 0);
    const view = viewportInfo(m);

    if (!view || zoom >= DETAIL_ZOOM) return [];

    const cellSize =
      zoom < 5.5 ? 78 :
      zoom < 7.5 ? 68 :
      zoom < 9 ? 58 :
      48;

    const margin = cellSize;
    const cells = new Map();

    for (const raw of items) {
      const item = normalizeItem(raw);

      if (!Number.isFinite(item.lng) || !Number.isFinite(item.lat)) continue;

      let point;
      try { point = m.project([item.lng, item.lat]); }
      catch { continue; }

      if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) continue;

      if (
        point.x < -margin ||
        point.x > view.width + margin ||
        point.y < -margin ||
        point.y > view.height + margin
      ) {
        continue;
      }

      const key =
        Math.floor(point.x / cellSize) + ":" +
        Math.floor(point.y / cellSize);

      const bucket = cells.get(key) || [];
      bucket.push({ item, x: point.x, y: point.y });
      cells.set(key, bucket);
    }

    const markers = [];

    for (const bucket of cells.values()) {
      if (bucket.length === 1) {
        const only = bucket[0];

        markers.push({
          kind: "single",
          item: only.item,
          x: only.x,
          y: only.y,
          lng: only.item.lng,
          lat: only.item.lat
        });
        continue;
      }

      const x = bucket.reduce((sum, entry) => sum + entry.x, 0) / bucket.length;
      const y = bucket.reduce((sum, entry) => sum + entry.y, 0) / bucket.length;
      const lng = bucket.reduce((sum, entry) => sum + entry.item.lng, 0) / bucket.length;
      const lat = bucket.reduce((sum, entry) => sum + entry.item.lat, 0) / bucket.length;
      const memberItems = bucket.map(entry => entry.item);

      markers.push({
        kind: "group",
        items: memberItems,
        count: memberItems.length,
        x,
        y,
        lng,
        lat,
        domain: memberItems.every(item => item.domain === memberItems[0].domain)
          ? memberItems[0].domain
          : "mixed"
      });
    }

    return markers;
  }

  function markerButton(marker, index, view) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.mapAggregateIndex = String(index);
    button.style.left = (view.offsetX + marker.x) + "px";
    button.style.top = (view.offsetY + marker.y) + "px";

    if (marker.kind === "group") {
      button.className = "map-cluster-marker-v738 is-group";
      button.dataset.count = String(marker.count);
      button.dataset.memberCount = String(marker.items.length);
      button.dataset.domain = marker.domain;
      button.textContent = String(marker.count);
      button.setAttribute(
        "aria-label",
        marker.count + "件の地点。タップして拡大"
      );
      return button;
    }

    const item = marker.item;
    button.className =
      "map-cluster-marker-v738 is-single domain-" + item.domain +
      (item.visited ? " is-visited" : "");
    button.dataset.domain = item.domain;
    button.dataset.id = item.id;
    button.textContent = SYMBOLS[item.domain] || "•";
    button.setAttribute(
      "aria-label",
      NAMES[item.domain] + " " + item.name +
      (item.visited ? " 取得済" : " 未取得")
    );

    return button;
  }

  function renderOverlay(m, items) {
    const overlay = ensureUi();
    const view = viewportInfo(m);
    if (!overlay || !view) return false;

    const epoch = ++renderEpoch;
    const zoom = Number(m.getZoom?.() || 0);

    if (zoom >= DETAIL_ZOOM) {
      overlay.replaceChildren();
      overlay.items = [];
      overlay.hidden = true;
      renderedCount = 0;
      groupCount = 0;
      singleCount = 0;
      return true;
    }

    const markers = aggregate(m, items);
    if (epoch !== renderEpoch) return false;

    const fragment = document.createDocumentFragment();

    markers.forEach((marker, index) => {
      fragment.appendChild(markerButton(marker, index, view));
    });

    overlay.replaceChildren(fragment);
    overlay.items = markers;
    overlay.hidden = false;
    overlay.classList.remove("is-moving");

    renderedCount = markers.length;
    groupCount = markers.filter(marker => marker.kind === "group").length;
    singleCount = renderedCount - groupCount;

    return true;
  }

  function ensure() {
    const m = mapInstance();
    if (!m?.isStyleLoaded?.()) return false;

    const items = filteredCatalog();

    if (!items) {
      if (active) restoreOriginal(m);

      const overlay = ensureUi();
      if (overlay) {
        overlay.replaceChildren();
        overlay.items = [];
        overlay.hidden = true;
      }

      active = false;
      featuresCount = 0;
      renderedCount = 0;
      groupCount = 0;
      singleCount = 0;
      return false;
    }

    cleanupLegacyDynamicMapLayers(m);

    if (!restrictOriginal(m)) {
      restoreOriginal(m);
      active = false;
      return false;
    }

    featuresCount = items.length;
    renderOverlay(m, items);
    active = true;

    const legend = $("mapClusterLegendV738");
    if (legend) {
      legend.hidden =
        domainMode() !== "all" ||
        (m.getZoom?.() || 0) >= DETAIL_ZOOM ||
        renderedCount === 0;
    }

    return true;
  }

  function schedule(delay = 70) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      ensureUi();
      ensure();
    }, delay);
  }

  function openSingle(item) {
    if (!item) return false;

    closePicker();

    if (window.OnsenMapDetailV736?.select?.(item.domain, item.id)) {
      window.OnsenMapDetailV736?.present?.(item.domain, item.id);
      return true;
    }

    return false;
  }

  function openGroup(marker) {
    const m = mapInstance();
    if (!m || !marker) return;

    const nextZoom = Math.min(
      DETAIL_ZOOM + 0.8,
      Math.max((m.getZoom?.() || 6) + 1.6, 7.2)
    );

    if (marker.count > 1 && marker.count <= 24) {
      showPicker(marker.items, "周辺の地点");
    } else {
      closePicker();
    }

    m.easeTo?.({
      center: [marker.lng, marker.lat],
      zoom: nextZoom
    });
  }

  function catalogLookup() {
    const all = window.OnsenMapDiscoveryV737?.catalog?.() || [];

    return new Map(all.map(item => [
      item.domain + ":" + item.id,
      normalizeItem(item)
    ]));
  }

  function overlapCandidates(m, point) {
    const layers = ORIGINAL.filter(id =>
      m.getLayer?.(id) &&
      m.getLayoutProperty?.(id, "visibility") !== "none"
    );

    if (!layers.length) return [];

    const box = [
      [point.x - 12, point.y - 12],
      [point.x + 12, point.y + 12]
    ];

    try {
      const candidates = m.queryRenderedFeatures(box, { layers });
      const lookup = catalogLookup();
      const currentMode = domainMode();

      return [...new Map(
        candidates.map(feature => {
          const layer = String(feature?.layer?.id || "");

          const domain =
            layer.startsWith("spots-") ? "onsen" :
            layer.startsWith("castles-") ? "castle" :
            layer.startsWith("scenic-") ? "scenic" :
            null;

          const id = feature?.properties?.id;

          if (
            !domain ||
            !id ||
            (currentMode !== "all" && currentMode !== domain)
          ) {
            return null;
          }

          const item = lookup.get(domain + ":" + id);
          return item ? [domain + ":" + id, item] : null;
        }).filter(Boolean)
      ).values()];
    } catch {
      return [];
    }
  }

  function onMapClick(event) {
    if (
      document.documentElement.dataset.appTab !== "map" ||
      !event?.point ||
      !active ||
      (mapInstance()?.getZoom?.() || 0) < DETAIL_ZOOM
    ) {
      return;
    }

    const target = event.originalEvent?.target;

    if (
      target instanceof Element &&
      target.closest(
        "button, input, select, .map-domain-switch-v62, .panel, .map-cluster-picker-v738"
      )
    ) {
      return;
    }

    const m = mapInstance();
    if (!m) return;

    const items = overlapCandidates(m, event.point);

    if (items.length > 1) {
      window.OnsenMapDetailV736?.close?.("overlap-picker");
      showPicker(items.slice(0, 24), "重なった地点");
      return;
    }

    closePicker();
  }

  function markMoving() {
    const overlay = $("mapClusterOverlayV738");
    if (overlay && !overlay.hidden) overlay.classList.add("is-moving");
  }

  function bind() {
    const m = mapInstance();
    if (!m || m === boundMap) return;

    boundMap = m;

    m.on?.("click", onMapClick);

    m.on?.("style.load", () => {
      originalZoom.clear();
      active = false;
      schedule(0);
    });

    m.on?.("movestart", markMoving);
    m.on?.("zoomstart", markMoving);
    m.on?.("moveend", () => schedule(0));
    m.on?.("zoomend", () => schedule(0));
  }

  function install() {
    if (installed) return;
    installed = true;

    ensureUi();
    bind();

    for (const name of [
      "onsen-map-domain-v73-changed",
      "onsen-castle-map-ready",
      "onsen-castle-map-layers-ready",
      "onsen-scenic-runtime-ready",
      "onsen-scenic-renderer-ready",
      "onsen-castle-visit-changed",
      "onsen-scenic-visit-changed",
      "onsen-checkin-completed",
      "onsen-app-tab-changed",
      "pageshow"
    ]) {
      window.addEventListener(name, () => {
        if (
          name === "onsen-map-domain-v73-changed" ||
          name === "onsen-app-tab-changed"
        ) {
          closePicker();
        }

        schedule();
      });
    }

    document.addEventListener("input", event => {
      if (event.target?.id === "mapDiscoveryQueryV737") schedule();
    });

    document.addEventListener("change", event => {
      if (
        ["mapDiscoveryPrefV737", "mapDiscoveryStatusV737"]
          .includes(event.target?.id)
      ) {
        schedule();
      }
    });

    document.addEventListener("click", event => {
      if (
        event.target instanceof Element &&
        event.target.closest(
          "#mapDiscoveryResetV737, #mapDiscoveryClearV737"
        )
      ) {
        schedule();
      }
    });

    window.addEventListener("onsen-map-detail-v736-opened", closePicker);

    const timerId = setInterval(() => {
      bind();
      if (ensure() || ++retries >= 180) clearInterval(timerId);
    }, 250);

    window.OnsenMapClustersV738 = {
      build: BUILD,
      refresh: schedule,
      closePicker,
      diagnostics: () => ({
        build: BUILD,
        active,
        featuresCount,
        renderedCount,
        groupCount,
        singleCount,
        mode: domainMode(),
        overlay: !!$("mapClusterOverlayV738"),
        overlayHidden: $("mapClusterOverlayV738")?.hidden ?? true,
        originalMinZoom:
          mapInstance()?.getLayer?.("spots-symbol")?.minzoom ?? null
      })
    };

    schedule();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();