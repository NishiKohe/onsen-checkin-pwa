(() => {
  "use strict";
  const BUILD = "v73.9";
  const SOURCE = "map-v738-clusters";
  const GROUP = "map-v738-cluster";
  const COUNT = "map-v738-count";
  const SINGLE = "map-v738-single";
  const LABEL = "map-v738-label";
  const DETAIL_ZOOM = 10;
  const DOMAINS = ["onsen", "castle", "scenic"];
  const ORIGINAL = ["spots-symbol", "spots-labels", "castles-v62-symbol", "castles-v62-labels", "scenic-v734-points", "scenic-v734-labels", "scenic-v71-symbol", "scenic-v71-labels"];
  const NAMES = { onsen: "温泉", castle: "名城200", scenic: "名勝" };
  const EMPTY = { type: "FeatureCollection", features: [] };
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
  let lastSource = null;
  let lastDataSignature = "";
  let sourceUpdates = 0;
  const originalZoom = new Map();
  const $ = id => document.getElementById(id);

  function mapInstance() { try { return typeof map !== "undefined" ? map : null; } catch { return null; } }
  function domainMode() { return window.OnsenMapDomainV73?.getMode?.() || "all"; }
  function normalise(value) { return String(value || "").normalize("NFKC").toLowerCase().replace(/[\s　・･]/g, ""); }

  function filteredCatalog() {
    const all = window.OnsenMapDiscoveryV737?.catalog?.() || [];
    const counts = Object.fromEntries(DOMAINS.map(domain => [domain, all.filter(item => item.domain === domain).length]));
    if (counts.castle !== 200 || counts.scenic !== 433 || counts.onsen < 1) return null;
    const selectedMode = domainMode();
    const query = normalise($("mapDiscoveryQueryV737")?.value || "");
    const prefecture = $("mapDiscoveryPrefV737")?.value || "";
    const visit = $("mapDiscoveryStatusV737")?.value || "all";
    return all.filter(item => (selectedMode === "all" || item.domain === selectedMode) &&
      (!prefecture || item.pref?.includes(prefecture)) &&
      (visit === "all" || (visit === "visited") === !!item.visited) &&
      (!query || item.search?.includes(query)));
  }

  function sourceItem(item) {
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

  function aggregate(m, items) {
    const zoom = Number(m.getZoom?.() || 0);
    if (zoom >= DETAIL_ZOOM) return EMPTY;
    const cellSize = zoom < 5.5 ? 74 : zoom < 7.5 ? 66 : zoom < 9 ? 58 : 48;
    const cells = new Map();
    for (const item of items) {
      const p = sourceItem(item);
      if (!Number.isFinite(p.lng) || !Number.isFinite(p.lat)) continue;
      let point;
      try { point = m.project([p.lng, p.lat]); } catch { continue; }
      if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) continue;
      const key = `${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`;
      const bucket = cells.get(key) || [];
      bucket.push(p);
      cells.set(key, bucket);
    }
    const features = [];
    for (const bucket of cells.values()) {
      if (bucket.length === 1) {
        const item = bucket[0];
        features.push({
          type: "Feature",
          properties: { group: false, count: 1, domain: item.domain, id: item.id, name: item.name, prefecture: item.prefecture, visited: item.visited },
          geometry: { type: "Point", coordinates: [item.lng, item.lat] }
        });
        continue;
      }
      const lng = bucket.reduce((sum, item) => sum + item.lng, 0) / bucket.length;
      const lat = bucket.reduce((sum, item) => sum + item.lat, 0) / bucket.length;
      const domainCounts = Object.fromEntries(DOMAINS.map(domain => [domain, bucket.filter(item => item.domain === domain).length]));
      const members = bucket.map(item => `${item.domain}:${item.id}`).join("\u001f");
      features.push({
        type: "Feature",
        properties: {
          group: true,
          count: bucket.length,
          name: `${bucket.length}地点`,
          domain: bucket.every(item => item.domain === bucket[0].domain) ? bucket[0].domain : "mixed",
          onsenCount: domainCounts.onsen,
          castleCount: domainCounts.castle,
          scenicCount: domainCounts.scenic,
          members
        },
        geometry: { type: "Point", coordinates: [lng, lat] }
      });
    }
    return { type: "FeatureCollection", features };
  }

  function dataSignature(data) {
    return data.features.map(feature => {
      const p = feature.properties || {};
      const c = feature.geometry?.coordinates || [];
      return p.group ? `g:${p.members}:${c[0]?.toFixed?.(4)}:${c[1]?.toFixed?.(4)}` : `s:${p.domain}:${p.id}`;
    }).join("|");
  }

  function makeLayer(m, layer) { if (!m.getLayer(layer.id)) m.addLayer(layer); }

  function ensureUi() {
    const shell = document.querySelector(".map-shell");
    if (!shell) return;
    if (!$("mapClusterLegendV738")) {
      const legend = document.createElement("div");
      legend.id = "mapClusterLegendV738";
      legend.className = "map-cluster-legend-v738";
      legend.setAttribute("aria-label", "ピンの色の凡例");
      legend.innerHTML = '<span><i class="onsen"></i>温泉</span><span><i class="castle"></i>城</span><span><i class="scenic"></i>名勝</span><small>金の縁は取得済</small>';
      shell.appendChild(legend);
    }
    if (!$("mapClusterPickerV738")) {
      const panel = document.createElement("section");
      panel.id = "mapClusterPickerV738";
      panel.className = "map-cluster-picker-v738";
      panel.hidden = true;
      panel.setAttribute("aria-label", "重なった地点から選択");
      panel.innerHTML = '<header><strong id="mapClusterPickerTitleV738">近くの地点</strong><button type="button" id="mapClusterPickerCloseV738" aria-label="地点一覧を閉じる">×</button></header><div id="mapClusterPickerListV738"></div>';
      shell.appendChild(panel);
      $("mapClusterPickerCloseV738").addEventListener("click", closePicker);
      $("mapClusterPickerListV738").addEventListener("click", event => {
        const button = event.target instanceof Element ? event.target.closest("button[data-index]") : null;
        if (!button) return;
        const item = panel.items?.[Number(button.dataset.index)];
        if (!item) return;
        closePicker();
        if (window.OnsenMapDetailV736?.select?.(item.domain, item.id)) {
          const m = mapInstance();
          m?.flyTo?.({ center: [item.lng, item.lat], zoom: Math.max(DETAIL_ZOOM + 1, m.getZoom?.() || 0) });
          window.OnsenMapDetailV736?.present?.(item.domain, item.id);
        }
      });
    }
  }

  function closePicker() {
    pickerEpoch++;
    const panel = $("mapClusterPickerV738");
    if (panel) { panel.hidden = true; panel.items = []; }
  }

  function showPicker(items, label) {
    const panel = $("mapClusterPickerV738"), list = $("mapClusterPickerListV738");
    if (!panel || !list || !items.length) return false;
    closePicker();
    const unique = [...new Map(items.map(item => [`${item.domain}:${item.id}`, item])).values()];
    panel.items = unique;
    $("mapClusterPickerTitleV738").textContent = `${label}（${unique.length}件）`;
    list.replaceChildren();
    unique.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.index = String(index);
      const name = document.createElement("strong"); name.textContent = item.name;
      const meta = document.createElement("span"); meta.textContent = `${NAMES[item.domain]} ・ ${item.prefecture || "場所未設定"} ・ ${item.visited ? "取得済" : "未取得"}`;
      button.append(name, meta);
      list.appendChild(button);
    });
    panel.hidden = false;
    return true;
  }

  function restoreOriginal(m) {
    for (const id of ORIGINAL) {
      const range = originalZoom.get(id);
      if (range && m.getLayer?.(id)) {
        try { m.setLayerZoomRange(id, range.min, range.max); } catch {}
      }
    }
  }

  function restrictOriginal(m) {
    if (typeof m.setLayerZoomRange !== "function") return false;
    for (const id of ORIGINAL) {
      const layer = m.getLayer?.(id);
      if (!layer) continue;
      if (!originalZoom.has(id)) originalZoom.set(id, { min: Number.isFinite(layer.minzoom) ? layer.minzoom : 0, max: Number.isFinite(layer.maxzoom) ? layer.maxzoom : 24 });
      const range = originalZoom.get(id);
      try { m.setLayerZoomRange(id, Math.max(DETAIL_ZOOM, range.min), range.max); } catch { return false; }
    }
    return true;
  }

  function ensure() {
    const m = mapInstance();
    if (!m?.isStyleLoaded?.()) return false;
    const items = filteredCatalog();
    if (!items) {
      if (active) restoreOriginal(m);
      active = false;
      return false;
    }
    try {
      let source = m.getSource(SOURCE);
      if (!source) {
        m.addSource(SOURCE, { type: "geojson", data: EMPTY });
        source = m.getSource(SOURCE);
        lastSource = source;
        lastDataSignature = "";
      }
      makeLayer(m, { id: GROUP, type: "circle", source: SOURCE, maxzoom: DETAIL_ZOOM, filter: ["==", ["get", "group"], true], paint: {
        "circle-color": "#24394e", "circle-stroke-color": "#f3f7fb", "circle-stroke-width": 2,
        "circle-radius": ["interpolate", ["linear"], ["get", "count"], 2, 18, 20, 23, 100, 30], "circle-opacity": 0.94
      } });
      makeLayer(m, { id: COUNT, type: "symbol", source: SOURCE, maxzoom: DETAIL_ZOOM, filter: ["==", ["get", "group"], true], layout: {
        "text-field": ["to-string", ["get", "count"]], "text-size": 13, "text-allow-overlap": true, "text-ignore-placement": true
      }, paint: { "text-color": "#ffffff" } });
      makeLayer(m, { id: SINGLE, type: "circle", source: SOURCE, maxzoom: DETAIL_ZOOM, filter: ["==", ["get", "group"], false], paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4.6, 5.5, 9.9, 8.5],
        "circle-color": ["match", ["get", "domain"], "onsen", "#ae4c3f", "castle", "#3e7399", "scenic", "#765889", "#65778b"],
        "circle-stroke-color": ["case", ["==", ["get", "visited"], true], "#f0c25e", "#ffffff"], "circle-stroke-width": 2, "circle-opacity": 0.96
      } });
      makeLayer(m, { id: LABEL, type: "symbol", source: SOURCE, minzoom: 9.3, maxzoom: DETAIL_ZOOM, filter: ["==", ["get", "group"], false], layout: {
        "text-field": ["get", "name"], "text-size": 11, "text-offset": [0, 1.4], "text-anchor": "top", "text-optional": true
      }, paint: { "text-color": "#344253", "text-halo-color": "#fffaf0", "text-halo-width": 1.5 } });

      if (![GROUP, COUNT, SINGLE].every(id => !!m.getLayer(id)) || !restrictOriginal(m)) {
        restoreOriginal(m);
        active = false;
        return false;
      }

      const data = aggregate(m, items);
      const key = dataSignature(data);
      if (source !== lastSource || key !== lastDataSignature) {
        source.setData(data);
        lastSource = source;
        lastDataSignature = key;
        sourceUpdates++;
      }
      featuresCount = items.length;
      renderedCount = data.features.length;
      groupCount = data.features.filter(feature => feature.properties?.group === true).length;
      singleCount = renderedCount - groupCount;
      active = true;
      const legend = $("mapClusterLegendV738");
      if (legend) legend.hidden = domainMode() !== "all" || (m.getZoom?.() || 0) >= DETAIL_ZOOM;
      return true;
    } catch (error) {
      restoreOriginal(m);
      active = false;
      console.warn("v73.9 map aggregation skipped; original pins retained", error);
      return false;
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => { ensureUi(); ensure(); }, 80);
  }

  function catalogLookup() {
    const all = window.OnsenMapDiscoveryV737?.catalog?.() || [];
    return new Map(all.map(item => [`${item.domain}:${item.id}`, {
      domain: item.domain, id: String(item.id), name: item.name, prefecture: item.pref?.join("・") || "",
      visited: !!item.visited, lng: Number(item.lng), lat: Number(item.lat)
    }]));
  }

  function groupMembers(feature) {
    const raw = String(feature?.properties?.members || "");
    if (!raw) return [];
    const lookup = catalogLookup();
    return raw.split("\u001f").map(key => lookup.get(key)).filter(Boolean);
  }

  function openGroup(feature) {
    const m = mapInstance();
    if (!m) return;
    const count = Number(feature?.properties?.count || 0);
    const center = feature?.geometry?.coordinates;
    if (!Array.isArray(center)) return;
    const nextZoom = Math.min(DETAIL_ZOOM + 0.8, Math.max((m.getZoom?.() || 6) + 1.6, 7.2));
    m.easeTo?.({ center, zoom: nextZoom });
    if (count > 1 && count <= 24) {
      const epoch = ++pickerEpoch;
      const members = groupMembers(feature);
      if (epoch === pickerEpoch && members.length > 1) showPicker(members, "周辺の地点");
    } else closePicker();
  }

  function singleItem(feature) {
    const p = feature?.properties || {};
    const coords = feature?.geometry?.coordinates || [];
    if (!DOMAINS.includes(p.domain) || !p.id || !Number.isFinite(Number(coords[0])) || !Number.isFinite(Number(coords[1]))) return null;
    return { domain: p.domain, id: String(p.id), name: String(p.name || p.id), prefecture: String(p.prefecture || ""), visited: p.visited === true || p.visited === "true", lng: Number(coords[0]), lat: Number(coords[1]) };
  }

  function overlapCandidates(m, point) {
    const layers = ORIGINAL.filter(id => m.getLayer?.(id) && m.getLayoutProperty?.(id, "visibility") !== "none");
    if (!layers.length) return [];
    const box = [[point.x - 12, point.y - 12], [point.x + 12, point.y + 12]];
    try {
      const candidates = m.queryRenderedFeatures(box, { layers });
      const lookup = catalogLookup();
      const currentMode = domainMode();
      return [...new Map(candidates.map(feature => {
        const layer = String(feature?.layer?.id || "");
        const domain = layer.startsWith("spots-") ? "onsen" : layer.startsWith("castles-") ? "castle" : layer.startsWith("scenic-") ? "scenic" : null;
        const id = feature?.properties?.id;
        if (!domain || !id || currentMode !== "all" && currentMode !== domain) return null;
        const item = lookup.get(`${domain}:${id}`);
        return item ? [`${domain}:${id}`, item] : null;
      }).filter(Boolean)).values()];
    } catch { return []; }
  }

  function onClick(event) {
    if (document.documentElement.dataset.appTab !== "map" || !event?.point) return;
    const target = event.originalEvent?.target;
    if (target instanceof Element && target.closest("button, input, select, .map-domain-switch-v62, .panel, .map-cluster-picker-v738")) return;
    const m = mapInstance();
    if (!m) return;
    if (active && m.getZoom?.() < DETAIL_ZOOM) {
      let hit = [];
      try { hit = m.queryRenderedFeatures(event.point, { layers: [GROUP, SINGLE].filter(id => m.getLayer(id)) }); } catch {}
      const feature = hit[0];
      if (feature?.properties?.group === true || feature?.properties?.group === "true") {
        closePicker();
        openGroup(feature);
        return;
      }
      if (feature) {
        const item = singleItem(feature);
        closePicker();
        if (item && window.OnsenMapDetailV736?.select?.(item.domain, item.id)) window.OnsenMapDetailV736?.present?.(item.domain, item.id);
        return;
      }
    } else if (active) {
      const items = overlapCandidates(m, event.point);
      if (items.length > 1) {
        window.OnsenMapDetailV736?.close?.("overlap-picker");
        showPicker(items.slice(0, 24), "重なった地点");
        return;
      }
    }
    closePicker();
  }

  function bind() {
    const m = mapInstance();
    if (!m || m === boundMap) return;
    boundMap = m;
    m.on?.("click", onClick);
    m.on?.("style.load", () => {
      originalZoom.clear();
      lastSource = null;
      lastDataSignature = "";
      active = false;
      schedule();
    });
    m.on?.("moveend", schedule);
    m.on?.("zoomend", () => {
      schedule();
      const legend = $("mapClusterLegendV738");
      if (legend) legend.hidden = domainMode() !== "all" || m.getZoom?.() >= DETAIL_ZOOM || !active;
    });
  }

  function install() {
    if (installed) return;
    installed = true;
    ensureUi();
    bind();
    for (const name of ["onsen-map-domain-v73-changed", "onsen-castle-map-ready", "onsen-castle-map-layers-ready", "onsen-scenic-runtime-ready", "onsen-scenic-renderer-ready", "onsen-castle-visit-changed", "onsen-scenic-visit-changed", "onsen-checkin-completed", "onsen-app-tab-changed", "pageshow"]) {
      window.addEventListener(name, () => {
        if (name === "onsen-map-domain-v73-changed" || name === "onsen-app-tab-changed") closePicker();
        schedule();
      });
    }
    document.addEventListener("input", e => { if (e.target?.id === "mapDiscoveryQueryV737") schedule(); });
    document.addEventListener("change", e => { if (["mapDiscoveryPrefV737", "mapDiscoveryStatusV737"].includes(e.target?.id)) schedule(); });
    document.addEventListener("click", e => { if (e.target instanceof Element && e.target.closest("#mapDiscoveryResetV737, #mapDiscoveryClearV737")) schedule(); });
    window.addEventListener("onsen-map-detail-v736-opened", closePicker);
    const timerId = setInterval(() => { bind(); if (ensure() || ++retries >= 180) clearInterval(timerId); }, 250);
    window.OnsenMapClustersV738 = {
      build: BUILD,
      refresh: schedule,
      closePicker,
      diagnostics: () => ({
        build: BUILD, active, featuresCount, renderedCount, groupCount, singleCount, sourceUpdates,
        mode: domainMode(), clusterLayer: !!mapInstance()?.getLayer?.(GROUP),
        originalMinZoom: mapInstance()?.getLayer?.("spots-symbol")?.minzoom ?? null
      })
    };
    schedule();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();