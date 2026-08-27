(() => {
  const BUILD = "v62";
  const ZONE_URL = "./data/castle-checkin-zones-v62.json";
  const MODE_KEY = "mapDomainModeV62";
  const CASTLE_SOURCE = "castles-v62";
  const CASTLE_SYMBOL = "castles-v62-symbol";
  const CASTLE_LABELS = "castles-v62-labels";
  const ZONE_SOURCE = "castle-checkin-zone-v62";
  const ZONE_FILL = "castle-checkin-zone-v62-fill";
  const ZONE_LINE = "castle-checkin-zone-v62-line";
  const LOCATION_MAX_AGE_MS = 2 * 60 * 1000;

  let mode = sessionStorage.getItem(MODE_KEY) === "castle" ? "castle" : "onsen";
  let zoneData = null;
  let zonesById = new Map();
  let selectedCastleId = null;
  let castlePosition = null;
  let mapLinksObserver = null;
  let installed = false;

  function getMap() {
    try { return typeof map !== "undefined" ? map : null; } catch { return null; }
  }

  function castleData() {
    return Array.isArray(window.OnsenCastleDomain?.data?.entities) ? window.OnsenCastleDomain.data.entities : [];
  }

  function castleById(id) {
    return castleData().find((castle) => castle.id === id) || null;
  }

  function zoneFor(id) {
    return zonesById.get(String(id || "")) || null;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'\"]/g, (char) => ({
      "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;"
    }[char]));
  }

  function formatDistance(meters) {
    const value = Number(meters);
    if (!Number.isFinite(value)) return "—";
    if (value < 1000) return `${Math.round(value)}m`;
    return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)}km`;
  }

  function haversineM(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (value) => value * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function circlePolygon(lat, lng, radiusM, steps = 64) {
    const earthRadius = 6371000;
    const latRad = lat * Math.PI / 180;
    const latDelta = radiusM / earthRadius;
    const lngDelta = radiusM / (earthRadius * Math.max(0.15, Math.cos(latRad)));
    const coords = [];
    for (let i = 0; i <= steps; i += 1) {
      const angle = (i / steps) * Math.PI * 2;
      coords.push([
        lng + (lngDelta * Math.cos(angle)) * 180 / Math.PI,
        lat + (latDelta * Math.sin(angle)) * 180 / Math.PI
      ]);
    }
    return { type: "Polygon", coordinates: [coords] };
  }

  async function fetchZones() {
    const response = await fetch(ZONE_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`castle zone load failed: ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data?.entries) || data.entries.length !== 100) throw new Error(`castle zone count must be 100; got ${data?.entries?.length ?? 0}`);
    zoneData = data;
    zonesById = new Map(data.entries.map((entry) => [entry.castleId, entry]));

    for (const castle of castleData()) {
      const zone = zonesById.get(castle.id);
      if (!zone) continue;
      castle.lat = Number(zone.lat);
      castle.lng = Number(zone.lng);
      castle.checkinRadiusM = Number(zone.radiusM);
      castle.accuracyRequiredM = Number(zone.accuracyRequiredM || data.policy?.defaultAccuracyRequiredM || 80);
      castle.coordinateStatus = zone.coordinateStatus;
    }
    return data;
  }

  function createCastleIcon(fill, border, flag) {
    const size = 96;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, size, size);

    ctx.beginPath();
    ctx.arc(48, 48, 38, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = border;
    ctx.stroke();

    ctx.fillStyle = "#fff8e9";
    ctx.fillRect(29, 49, 38, 21);
    ctx.fillRect(34, 40, 28, 12);
    ctx.fillRect(40, 31, 16, 12);
    ctx.beginPath();
    ctx.moveTo(36, 40); ctx.lineTo(48, 27); ctx.lineTo(60, 40); ctx.closePath(); ctx.fill();
    ctx.fillStyle = border;
    ctx.fillRect(44, 56, 8, 14);
    ctx.fillRect(34, 53, 6, 6);
    ctx.fillRect(56, 53, 6, 6);

    if (flag) {
      ctx.strokeStyle = "#fff8e9";
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(63, 26); ctx.lineTo(63, 45); ctx.stroke();
      ctx.fillStyle = "#fff8e9";
      ctx.beginPath(); ctx.moveTo(64, 27); ctx.lineTo(78, 32); ctx.lineTo(64, 37); ctx.closePath(); ctx.fill();
    }
    return ctx.getImageData(0, 0, size, size);
  }

  function addIcons(targetMap) {
    if (!targetMap.hasImage("castle-v62-unvisited")) targetMap.addImage("castle-v62-unvisited", createCastleIcon("#35566f", "#20394e", false), { pixelRatio: 2 });
    if (!targetMap.hasImage("castle-v62-visited")) targetMap.addImage("castle-v62-visited", createCastleIcon("#8f6e31", "#59451f", false), { pixelRatio: 2 });
    if (!targetMap.hasImage("castle-v62-strict")) targetMap.addImage("castle-v62-strict", createCastleIcon("#467c55", "#285334", true), { pixelRatio: 2 });
  }

  function buildGeoJson() {
    const visits = window.OnsenCastleVisits;
    return {
      type: "FeatureCollection",
      features: castleData().map((castle) => {
        const zone = zoneFor(castle.id);
        if (!zone) return null;
        const strict = !!visits?.isStrictGps?.(castle.id);
        const visited = !!visits?.isVisited?.(castle.id);
        return {
          type: "Feature",
          id: castle.id,
          properties: {
            id: castle.id,
            name: castle.name,
            prefecture: castle.prefecture,
            japan100No: Number(castle.japan100No),
            visited,
            strict
          },
          geometry: { type: "Point", coordinates: [Number(zone.lng), Number(zone.lat)] }
        };
      }).filter(Boolean)
    };
  }

  function installLayers() {
    const targetMap = getMap();
    if (!targetMap || !zoneData) return false;
    if (targetMap.getSource(CASTLE_SOURCE)) {
      refreshSource();
      applyMode();
      return true;
    }
    addIcons(targetMap);
    targetMap.addSource(CASTLE_SOURCE, { type: "geojson", data: buildGeoJson() });
    targetMap.addLayer({
      id: CASTLE_SYMBOL,
      type: "symbol",
      source: CASTLE_SOURCE,
      layout: {
        "visibility": mode === "castle" ? "visible" : "none",
        "icon-image": ["case", ["==", ["get", "strict"], true], "castle-v62-strict", ["==", ["get", "visited"], true], "castle-v62-visited", "castle-v62-unvisited"],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 3.6, 0.38, 8, 0.54, 12, 0.70],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true
      }
    });
    targetMap.addLayer({
      id: CASTLE_LABELS,
      type: "symbol",
      source: CASTLE_SOURCE,
      minzoom: 7.4,
      layout: {
        "visibility": mode === "castle" ? "visible" : "none",
        "text-field": ["concat", "#", ["to-string", ["get", "japan100No"]], " ", ["get", "name"]],
        "text-size": ["interpolate", ["linear"], ["zoom"], 7.4, 10, 12, 13],
        "text-offset": [0, 1.8],
        "text-anchor": "top",
        "text-optional": true
      },
      paint: { "text-color": "#3f493d", "text-halo-color": "#fffaf0", "text-halo-width": 1.5 }
    });
    targetMap.addSource(ZONE_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    targetMap.addLayer({ id: ZONE_FILL, type: "fill", source: ZONE_SOURCE, layout: { visibility: mode === "castle" ? "visible" : "none" }, paint: { "fill-color": "#477d55", "fill-opacity": 0.13 } });
    targetMap.addLayer({ id: ZONE_LINE, type: "line", source: ZONE_SOURCE, layout: { visibility: mode === "castle" ? "visible" : "none" }, paint: { "line-color": "#3f714d", "line-width": 2, "line-opacity": 0.85 } });

    const selectFeature = (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      selectCastle(feature.properties.id, { fly: false });
    };
    targetMap.on("click", CASTLE_SYMBOL, selectFeature);
    targetMap.on("click", CASTLE_LABELS, selectFeature);
    for (const layerId of [CASTLE_SYMBOL, CASTLE_LABELS]) {
      targetMap.on("mouseenter", layerId, () => { targetMap.getCanvas().style.cursor = "pointer"; });
      targetMap.on("mouseleave", layerId, () => { targetMap.getCanvas().style.cursor = ""; });
    }
    applyMode();
    return true;
  }

  function refreshSource() {
    const source = getMap()?.getSource(CASTLE_SOURCE);
    if (source) source.setData(buildGeoJson());
  }

  function setLayerVisibility(layerId, visible) {
    const targetMap = getMap();
    if (!targetMap?.getLayer(layerId)) return;
    try { targetMap.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none"); } catch {}
  }

  function clearCastleZone() {
    const source = getMap()?.getSource(ZONE_SOURCE);
    source?.setData?.({ type: "FeatureCollection", features: [] });
  }

  function renderCastleZone(castleId) {
    const source = getMap()?.getSource(ZONE_SOURCE);
    const zone = zoneFor(castleId);
    if (!source || !zone) return;
    source.setData({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: { castleId, radiusM: zone.radiusM },
        geometry: circlePolygon(Number(zone.lat), Number(zone.lng), Number(zone.radiusM))
      }]
    });
  }

  function ensureModeSwitch() {
    const shell = document.querySelector(".map-shell");
    if (!shell) return null;
    let root = document.getElementById("mapDomainSwitchV62");
    if (root) return root;
    root = document.createElement("div");
    root.id = "mapDomainSwitchV62";
    root.className = "map-domain-switch-v62";
    root.setAttribute("aria-label", "地図カテゴリ切替");
    root.innerHTML = `<button type="button" data-map-domain="onsen">♨<span>温泉</span></button><button type="button" data-map-domain="castle">城<span>城</span></button>`;
    root.addEventListener("click", (event) => {
      const button = event.target instanceof Element ? event.target.closest("[data-map-domain]") : null;
      if (!button) return;
      setMode(button.dataset.mapDomain || "onsen");
    });
    shell.appendChild(root);
    return root;
  }

  function ensureCastlePanel() {
    const main = document.querySelector(".main");
    const onsenPanel = main?.querySelector(":scope > .panel");
    if (!main || !onsenPanel) return null;
    let panel = document.getElementById("castleMapPanelV62");
    if (panel) return panel;
    panel = document.createElement("section");
    panel.id = "castleMapPanelV62";
    panel.className = "panel castle-map-panel-v62";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="castle-map-empty-v62" id="castleMapEmptyV62">
        <span>JAPAN 100 CASTLES</span>
        <h2>城を選択</h2>
        <p>地図の城ピンをタップしてください。</p>
      </div>
      <div id="castleMapDetailV62" hidden>
        <div class="castle-map-title-v62"><div><span id="castleMapNoV62">#---</span><h2 id="castleMapNameV62">城</h2><p id="castleMapPlaceV62"></p></div><b id="castleMapStatusV62">未訪問</b></div>
        <div class="castle-map-metrics-v62">
          <div><span>距離</span><b id="castleMapDistanceV62">現在地未取得</b></div>
          <div><span>GPS精度</span><b id="castleMapAccuracyV62">—</b></div>
          <div><span>判定半径</span><b id="castleMapRadiusV62">—</b></div>
        </div>
        <div class="castle-map-actions-v62">
          <button id="castleMapLocateV62" type="button" class="secondary">現在地を確認</button>
          <button id="castleMapCheckinV62" type="button" disabled>城チェックイン</button>
        </div>
        <div id="castleMapMessageV62" class="castle-map-message-v62">GPSチェックインは、自己申告の過去訪問とは別に記録します。</div>
        <details class="details" open><summary>人物との縁</summary><div id="castleMapCharactersV62" class="castle-map-characters-v62"></div></details>
        <details class="details"><summary>GPS判定について</summary><p class="note">日本城郭協会の日本100名城一覧で名称・所在地を照合し、公開参照座標を初期GPS判定点に使用しています。山城・広域史跡は判定半径を広げています。実機確認に応じて調整します。</p></details>
      </div>`;
    onsenPanel.insertAdjacentElement("afterend", panel);
    panel.querySelector("#castleMapLocateV62")?.addEventListener("click", () => resolveCurrentPosition(true));
    panel.querySelector("#castleMapCheckinV62")?.addEventListener("click", performCheckin);
    return panel;
  }

  function candidateMarkup(castleId) {
    const candidates = window.OnsenCharacterRuntime?.candidatesForCastle?.(castleId) || [];
    if (!candidates.length) return `<div class="castle-map-no-character-v62">この城に直接紐づく初期人物は未設定です。GPS訪問自体は記録されます。</div>`;
    return candidates.map((character) => {
      const guaranteed = (character.recruitment?.guaranteedCastleIds || []).includes(castleId);
      const owned = !!window.OnsenCharacterRuntime?.getStatus?.(character.id)?.recruitedNow;
      return `<div class="castle-character-chip-v62${guaranteed ? " guaranteed" : ""}${owned ? " owned" : ""}"><strong>${escapeHtml(character.name)}</strong><span>${owned ? "登用済" : guaranteed ? "初回GPS加入" : "登用候補"}</span></div>`;
    }).join("");
  }

  function statusFor(castleId) {
    const visits = window.OnsenCastleVisits;
    const strict = !!visits?.isStrictGps?.(castleId);
    const visited = !!visits?.isVisited?.(castleId);
    return { strict, visited, label: strict ? "GPS確認済" : visited ? "訪問登録済" : "未訪問" };
  }

  function selectedDistance() {
    const zone = zoneFor(selectedCastleId);
    if (!zone || !castlePosition) return null;
    return haversineM(castlePosition.lat, castlePosition.lng, Number(zone.lat), Number(zone.lng));
  }

  function positionFresh() {
    return !!castlePosition && Date.now() - Number(castlePosition.sampledAt || 0) <= LOCATION_MAX_AGE_MS;
  }

  function updatePanel() {
    const panel = ensureCastlePanel();
    const castle = castleById(selectedCastleId);
    const zone = zoneFor(selectedCastleId);
    const empty = document.getElementById("castleMapEmptyV62");
    const detail = document.getElementById("castleMapDetailV62");
    if (!panel || !empty || !detail) return;
    if (!castle || !zone) {
      empty.hidden = false;
      detail.hidden = true;
      return;
    }
    empty.hidden = true;
    detail.hidden = false;

    const status = statusFor(castle.id);
    const distance = selectedDistance();
    const accuracy = castlePosition?.accuracyM;
    const fresh = positionFresh();
    const accurate = fresh && Number.isFinite(Number(accuracy)) && Number(accuracy) <= Number(zone.accuracyRequiredM || 80);
    const inRange = Number.isFinite(distance) && distance <= Number(zone.radiusM);

    document.getElementById("castleMapNoV62").textContent = `#${String(castle.japan100No).padStart(3, "0")}`;
    document.getElementById("castleMapNameV62").textContent = castle.name;
    document.getElementById("castleMapPlaceV62").textContent = `${castle.prefecture} ・ ${castle.region}`;
    const statusNode = document.getElementById("castleMapStatusV62");
    statusNode.textContent = status.label;
    statusNode.className = status.strict ? "strict" : status.visited ? "visited" : "";
    document.getElementById("castleMapDistanceV62").textContent = distance == null ? "現在地未取得" : formatDistance(distance);
    document.getElementById("castleMapAccuracyV62").textContent = fresh && Number.isFinite(Number(accuracy)) ? `${Math.round(Number(accuracy))}m` : "—";
    document.getElementById("castleMapRadiusV62").textContent = `${Number(zone.radiusM)}m`;
    document.getElementById("castleMapCharactersV62").innerHTML = candidateMarkup(castle.id);

    const button = document.getElementById("castleMapCheckinV62");
    const message = document.getElementById("castleMapMessageV62");
    if (status.strict) {
      button.disabled = true;
      button.textContent = "GPSチェックイン済";
      message.textContent = "この城は厳格GPS訪問済みです。";
    } else if (!fresh) {
      button.disabled = true;
      button.textContent = "現在地を確認してください";
      message.textContent = "「現在地を確認」で新しいGPS位置を取得してください。";
    } else if (!accurate) {
      button.disabled = true;
      button.textContent = `位置精度不足（${Math.round(Number(accuracy || 0))}m）`;
      message.textContent = `GPS精度 ${Number(zone.accuracyRequiredM || 80)}m以内が必要です。もう一度現在地を確認してください。`;
    } else if (!inRange) {
      button.disabled = true;
      const remain = Math.max(0, Number(distance) - Number(zone.radiusM));
      button.textContent = `範囲外（あと${formatDistance(remain)}）`;
      message.textContent = `城の判定範囲まであと${formatDistance(remain)}です。`;
    } else {
      button.disabled = false;
      button.textContent = "城チェックイン";
      message.textContent = status.visited ? "過去訪問登録済みですが、現地GPS確認を追加できます。" : "GPS条件を満たしています。初回現地確認として記録できます。";
    }
  }

  async function resolveCurrentPosition(centerMap = false) {
    const message = document.getElementById("castleMapMessageV62");
    if (!navigator.geolocation) {
      if (message) message.textContent = "この端末は位置情報取得に対応していません。";
      return null;
    }
    if (message) message.textContent = "現在地を高精度で確認しています…";
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition((position) => {
        castlePosition = {
          lat: Number(position.coords.latitude),
          lng: Number(position.coords.longitude),
          accuracyM: Math.round(Number(position.coords.accuracy || 0)),
          sampledAt: Date.now()
        };
        if (centerMap) getMap()?.flyTo?.({ center: [castlePosition.lng, castlePosition.lat], zoom: Math.max(12, getMap()?.getZoom?.() || 12) });
        updatePanel();
        resolve(castlePosition);
      }, (error) => {
        console.warn("castle geolocation failed", error);
        if (message) message.textContent = "現在地を取得できませんでした。位置情報の権限とGPS状態を確認してください。";
        castlePosition = null;
        updatePanel();
        resolve(null);
      }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 3000 });
    });
  }

  function performCheckin() {
    const castle = castleById(selectedCastleId);
    const zone = zoneFor(selectedCastleId);
    if (!castle || !zone || !castlePosition) return;
    const distance = selectedDistance();
    const fresh = positionFresh();
    const accurate = fresh && Number(castlePosition.accuracyM) <= Number(zone.accuracyRequiredM || 80);
    const inRange = Number.isFinite(distance) && distance <= Number(zone.radiusM);
    if (!fresh || !accurate || !inRange) {
      updatePanel();
      return;
    }

    const beforeState = window.OnsenCharacterRuntime?.loadState?.() || {};
    const beforeOwned = new Set(Object.keys(beforeState.recruited || {}));
    const result = window.OnsenCastleVisits?.registerStrictGpsVisit?.(castle.id, {
      lat: castlePosition.lat,
      lng: castlePosition.lng,
      accuracyM: castlePosition.accuracyM,
      checkedAt: Date.now()
    });
    if (!result?.ok) {
      const message = document.getElementById("castleMapMessageV62");
      if (message) message.textContent = "城チェックインを保存できませんでした。";
      return;
    }

    refreshSource();
    updatePanel();
    const afterState = window.OnsenCharacterRuntime?.loadState?.() || {};
    const gainedId = Object.keys(afterState.recruited || {}).find((id) => !beforeOwned.has(id));
    const claimedId = afterState.guaranteedCastleClaimed?.[castle.id]?.characterId || gainedId;
    const character = claimedId ? window.OnsenCharacterRuntime?.get?.(claimedId) : null;
    const message = document.getElementById("castleMapMessageV62");
    if (message) {
      message.innerHTML = character
        ? `<strong>チェックイン成功！</strong> ${escapeHtml(character.name)} が仲間になりました。`
        : `<strong>チェックイン成功！</strong> GPS訪問を記録しました。${(window.OnsenCharacterRuntime?.candidatesForCastle?.(castle.id) || []).length ? "人物図鑑も更新されます。" : "この城の代表人物は今後の人物追加で対応予定です。"}`;
    }
    try { navigator.vibrate?.([70, 40, 120]); } catch {}
  }

  function selectCastle(castleId, options = {}) {
    const castle = castleById(castleId);
    const zone = zoneFor(castleId);
    if (!castle || !zone) return false;
    selectedCastleId = castle.id;
    renderCastleZone(castle.id);
    updatePanel();
    if (options.fly !== false) getMap()?.flyTo?.({ center: [Number(zone.lng), Number(zone.lat)], zoom: Math.max(11, getMap()?.getZoom?.() || 11) });
    return true;
  }

  function setMode(next) {
    mode = next === "castle" ? "castle" : "onsen";
    sessionStorage.setItem(MODE_KEY, mode);
    applyMode();
    return mode;
  }

  function applyMode() {
    const targetMap = getMap();
    const castleMode = mode === "castle";
    const switcher = ensureModeSwitch();
    const castlePanel = ensureCastlePanel();
    const main = document.querySelector(".main");
    const onsenPanel = main?.querySelector(":scope > .panel:not(.castle-map-panel-v62)");
    if (switcher) {
      for (const button of switcher.querySelectorAll("[data-map-domain]")) {
        const active = button.dataset.mapDomain === mode;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      }
    }

    for (const id of [CASTLE_SYMBOL, CASTLE_LABELS, ZONE_FILL, ZONE_LINE]) setLayerVisibility(id, castleMode);
    for (const id of ["spots-symbol", "spots-labels", "checkin-zone-fill", "checkin-zone-line"]) setLayerVisibility(id, !castleMode);

    const toolsToggle = document.getElementById("btnMapToolsToggle");
    const tools = document.getElementById("mapToolsPanel");
    if (toolsToggle) toolsToggle.hidden = castleMode;
    if (castleMode && tools) { tools.hidden = true; tools.setAttribute("aria-hidden", "true"); }
    document.querySelector(".map-shell")?.classList.toggle("castle-map-mode-v62", castleMode);
    if (onsenPanel) onsenPanel.hidden = castleMode;
    if (castlePanel) castlePanel.hidden = !castleMode;

    if (castleMode) {
      if (selectedCastleId) { renderCastleZone(selectedCastleId); updatePanel(); }
      else clearCastleZone();
    } else {
      clearCastleZone();
      try {
        if (typeof selectedSpot !== "undefined" && selectedSpot && typeof renderCheckinZones === "function") renderCheckinZones(selectedSpot);
        if (typeof updateDistanceAndButton === "function") updateDistanceAndButton();
      } catch {}
    }
    requestAnimationFrame(() => targetMap?.resize?.());
    window.dispatchEvent(new CustomEvent("onsen-map-domain-changed", { detail: { build: BUILD, mode } }));
  }

  function showCastle(castleId) {
    window.OnsenAppShell?.show?.("map");
    setMode("castle");
    setTimeout(() => selectCastle(castleId, { fly: true }), 60);
  }

  function decorateCastleRows() {
    const root = document.getElementById("castleListRoot");
    if (!root) return false;
    for (const row of root.querySelectorAll(".castle-row")) {
      if (row.querySelector("[data-castle-map-v62]")) continue;
      const visitButton = row.querySelector("[data-castle-id]");
      const castleId = visitButton?.dataset.castleId;
      if (!castleId || !zoneFor(castleId)) continue;
      const actions = row.querySelector(".castle-actions");
      if (!actions) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "castle-map-link-v62";
      button.dataset.castleMapV62 = castleId;
      button.textContent = "地図";
      actions.insertBefore(button, actions.firstChild);
    }
    if (!root.dataset.castleMapBoundV62) {
      root.dataset.castleMapBoundV62 = "1";
      root.addEventListener("click", (event) => {
        const button = event.target instanceof Element ? event.target.closest("[data-castle-map-v62]") : null;
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        showCastle(button.dataset.castleMapV62);
      }, true);
    }
    if (!mapLinksObserver) {
      mapLinksObserver = new MutationObserver(() => requestAnimationFrame(decorateCastleRows));
      mapLinksObserver.observe(root, { childList: true, subtree: true });
    }
    return true;
  }

  async function install() {
    if (installed) return;
    installed = true;
    for (let i = 0; i < 400; i += 1) {
      if (getMap() && window.OnsenCastleDomain && window.OnsenCastleVisits) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    await fetchZones();
    ensureModeSwitch();
    ensureCastlePanel();

    const targetMap = getMap();
    if (targetMap?.isStyleLoaded?.()) installLayers();
    else targetMap?.once?.("load", installLayers);

    window.addEventListener("onsen-castle-visit-changed", () => { refreshSource(); updatePanel(); requestAnimationFrame(decorateCastleRows); });
    window.addEventListener("onsen-character-state-changed", updatePanel);
    window.addEventListener("onsen-character-runtime-ready", updatePanel);
    window.addEventListener("onsen-app-tab-changed", (event) => {
      if (event.detail?.tab === "map") setTimeout(applyMode, 20);
      if (event.detail?.tab === "collection") setTimeout(decorateCastleRows, 80);
    });
    window.addEventListener("pageshow", () => { refreshSource(); updatePanel(); });
    document.getElementById("btnLocate")?.addEventListener("click", () => { if (mode === "castle") setTimeout(() => resolveCurrentPosition(false), 80); });

    let attempts = 0;
    const rowTimer = setInterval(() => {
      decorateCastleRows();
      attempts += 1;
      if (attempts >= 30 || mapLinksObserver) clearInterval(rowTimer);
    }, 300);

    window.OnsenCastleMap = {
      build: BUILD,
      setMode,
      getMode: () => mode,
      showCastle,
      selectCastle,
      refresh: () => { refreshSource(); updatePanel(); },
      resolveCurrentPosition,
      zones: () => zoneData,
      selectedCastleId: () => selectedCastleId
    };
    applyMode();
    window.dispatchEvent(new CustomEvent("onsen-castle-map-ready", { detail: { build: BUILD, entries: zoneData.entries.length } }));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => install().catch((error) => console.warn("castle map v62 init failed", error)), { once: true });
  else install().catch((error) => console.warn("castle map v62 init failed", error));
})();
