(() => {
  const BUILD = "v73.4";
  const SOURCE = "scenic-v734-source";
  const POINTS = "scenic-v734-points";
  const LABELS = "scenic-v734-labels";
  const LEGACY_POINTS = ["scenic-v71-symbol", "scenic-v71-labels"];
  let installed = false;
  let boundMap = null;
  let lastFeatureCount = 0;

  function getMap() { try { return typeof map !== "undefined" ? map : null; } catch { return null; } }
  function runtime() { return window.OnsenScenicRuntime || null; }
  function mode() { return window.OnsenMapDomainV73?.getMode?.() || sessionStorage.getItem("mapDomainModeV73") || "onsen"; }
  function visible() { return mode() === "scenic"; }
  function shortName(value) { return String(value || "").split(/\r?\n/)[0].trim(); }
  function setVisibility(id, show) {
    const m = getMap();
    if (!m?.getLayer?.(id)) return false;
    try { m.setLayoutProperty(id, "visibility", show ? "visible" : "none"); return true; } catch { return false; }
  }

  function buildGeoJson() {
    const rt = runtime();
    const features = [];
    if (!rt?.entries || !rt?.referenceZones) return { type: "FeatureCollection", features };
    const state = rt.loadState?.() || { visited: {} };
    for (const entry of rt.entries()) {
      if (!entry?.id) continue;
      const refs = rt.referenceZones(entry) || [];
      const point = refs.find((z) => Number.isFinite(Number(z?.lat)) && Number.isFinite(Number(z?.lng)));
      if (!point) continue;
      const record = state.visited?.[entry.id] || null;
      features.push({
        type: "Feature",
        properties: {
          id: String(entry.id),
          name: shortName(entry.name),
          prefecture: (entry.prefectures || []).join("・"),
          special: entry.specialScenic === true,
          visited: !!record,
          gps: record?.verificationType === "gps_scenic"
        },
        geometry: { type: "Point", coordinates: [Number(point.lng), Number(point.lat)] }
      });
    }
    lastFeatureCount = features.length;
    return { type: "FeatureCollection", features };
  }

  function ensureLayers() {
    const m = getMap(), rt = runtime();
    if (!m || !rt || !m.isStyleLoaded?.()) return false;
    const data = buildGeoJson();
    if (!data.features.length) {
      console.warn("v73.4 scenic renderer has zero features", { runtime: !!rt, entries: rt.entries?.().length || 0 });
      return false;
    }
    try {
      const source = m.getSource(SOURCE);
      if (source?.setData) source.setData(data);
      else m.addSource(SOURCE, { type: "geojson", data });
    } catch (error) {
      console.warn("v73.4 scenic source install failed", error);
      return false;
    }
    try {
      if (!m.getLayer(POINTS)) m.addLayer({
        id: POINTS,
        type: "circle",
        source: SOURCE,
        layout: { visibility: visible() ? "visible" : "none" },
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4.2, 8, 6.2, 12, 8.2],
          "circle-color": ["case",
            ["==", ["get", "gps"], true], "#3f7f5b",
            ["==", ["get", "visited"], true], "#9a7b36",
            ["==", ["get", "special"], true], "#754f79",
            "#5d5178"
          ],
          "circle-stroke-color": "#fffaf0",
          "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 4, 1.4, 12, 2.2],
          "circle-opacity": 0.96
        }
      });
    } catch (error) { console.warn("v73.4 scenic point layer install failed", error); }
    try {
      if (!m.getLayer(LABELS)) m.addLayer({
        id: LABELS,
        type: "symbol",
        source: SOURCE,
        minzoom: 7.4,
        layout: {
          visibility: visible() ? "visible" : "none",
          "text-field": ["get", "name"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 7.4, 10, 12, 13],
          "text-offset": [0, 1.25],
          "text-anchor": "top",
          "text-optional": true
        },
        paint: { "text-color": "#55485d", "text-halo-color": "#fffaf0", "text-halo-width": 1.5 }
      });
    } catch (error) { console.warn("v73.4 scenic label layer install failed", error); }
    syncVisibility();
    bindMap();
    window.dispatchEvent(new CustomEvent("onsen-scenic-renderer-ready", { detail: { build: BUILD, featureCount: lastFeatureCount } }));
    return true;
  }

  function syncVisibility() {
    const show = visible();
    setVisibility(POINTS, show);
    setVisibility(LABELS, show);
    for (const id of LEGACY_POINTS) setVisibility(id, false);
    return show;
  }

  function chooseFeature(event) {
    const m = getMap();
    if (!m?.getLayer?.(POINTS)) return null;
    try {
      const features = m.queryRenderedFeatures(event.point, { layers: [POINTS] });
      return features?.[0] || null;
    } catch { return null; }
  }

  function bindMap() {
    const m = getMap();
    if (!m || boundMap === m) return;
    boundMap = m;
    m.on?.("click", (event) => {
      if (!visible()) return;
      const feature = chooseFeature(event);
      const id = feature?.properties?.id;
      if (id) window.OnsenScenicMapV71?.select?.(id, { fly: false });
    });
    m.on?.("mousemove", (event) => {
      if (!visible()) return;
      const hit = chooseFeature(event);
      try { m.getCanvas().style.cursor = hit ? "pointer" : ""; } catch {}
    });
    m.on?.("style.load", () => setTimeout(ensureLayers, 0));
  }

  function refresh() {
    const ok = ensureLayers();
    syncVisibility();
    return ok;
  }

  function install() {
    if (installed) return;
    installed = true;
    bindMap();
    for (const eventName of [
      "onsen-scenic-runtime-ready",
      "onsen-map-domain-v73-changed",
      "onsen-map-domain-v72-changed",
      "onsen-scenic-visit-changed",
      "onsen-app-tab-changed",
      "pageshow"
    ]) window.addEventListener(eventName, () => setTimeout(refresh, 0));

    let attempts = 0;
    const timer = setInterval(() => {
      refresh();
      attempts += 1;
      if (lastFeatureCount === 433 || attempts >= 240) clearInterval(timer);
    }, 250);

    window.OnsenScenicRendererV734 = {
      build: BUILD,
      sourceId: SOURCE,
      pointLayerId: POINTS,
      labelLayerId: LABELS,
      ensureLayers,
      refresh,
      featureCount: () => lastFeatureCount,
      diagnostics: () => ({ build: BUILD, mode: mode(), visible: visible(), featureCount: lastFeatureCount, source: !!getMap()?.getSource?.(SOURCE), points: !!getMap()?.getLayer?.(POINTS), labels: !!getMap()?.getLayer?.(LABELS) })
    };
    refresh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();