const DEFAULT_CHECKIN_RADIUS_M = 750;
const REQUIRED_ACCURACY_M = 60;
const COOLDOWN_HOURS = 24;

const JAPAN_BOUNDS = [
  [122.0, 20.0],
  [154.0, 46.5]
];

let map, userMarker, userAccuracyM = null, userPos = null;
let spots = [];
let selectedSpot = null;

const el = (id) => document.getElementById(id);

init().catch((err) => {
  console.error(err);
  alert("アプリの初期化に失敗しました。ページを再読み込みしてください。");
});

async function init() {
  const response = await fetch("./onsen.json", { cache: "no-cache" });
  if (!response.ok) throw new Error(`onsen.json load failed: ${response.status}`);
  spots = await response.json();

  setupMap();
  renderStats();
  renderHistory();

  el("btnLocate").addEventListener("click", () => locateOnce(true));
  el("btnCheckin").addEventListener("click", onCheckin);

  locateOnce(false);
}

function setupMap() {
  map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/positron",
    center: [137.5, 36.2],
    zoom: 4.8,
    minZoom: 4.6,
    maxZoom: 18,
    maxBounds: JAPAN_BOUNDS,
    renderWorldCopies: false
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");

  map.on("load", () => {
    tuneBaseMap();
    addOnsenIcons();

    map.addSource("checkin-zone", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    });

    map.addLayer({
      id: "checkin-zone-fill",
      type: "fill",
      source: "checkin-zone",
      paint: {
        "fill-color": "#b64235",
        "fill-opacity": 0.11
      }
    });

    map.addLayer({
      id: "checkin-zone-line",
      type: "line",
      source: "checkin-zone",
      paint: {
        "line-color": "#9c352d",
        "line-width": 2,
        "line-opacity": 0.75
      }
    });

    map.addSource("spots", {
      type: "geojson",
      data: buildSpotGeoJSON()
    });

    map.addLayer({
      id: "spots-symbol",
      type: "symbol",
      source: "spots",
      layout: {
        "icon-image": [
          "case",
          ["==", ["get", "visited"], true],
          "onsen-visited",
          "onsen-unvisited"
        ],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 4.6, 0.44, 8, 0.56, 12, 0.72],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true
      }
    });

    map.addLayer({
      id: "spots-labels",
      type: "symbol",
      source: "spots",
      minzoom: 7.2,
      layout: {
        "text-field": ["get", "name"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 7.2, 11, 12, 14],
        "text-offset": [0, 1.8],
        "text-anchor": "top",
        "text-optional": true
      },
      paint: {
        "text-color": "#493f35",
        "text-halo-color": "#fffaf0",
        "text-halo-width": 1.5
      }
    });

    bindSpotInteractions("spots-symbol");
    bindSpotInteractions("spots-labels");
  });
}

function tuneBaseMap() {
  const layers = map.getStyle().layers || [];

  for (const layer of layers) {
    const id = layer.id.toLowerCase();

    // 温泉ピンを主役にするため、一般施設・交通POIはかなり抑える。
    if (layer.type === "symbol" && /(poi|amenity|shop|tourism|airport|aeroway|transit|station|bus|housenumber)/.test(id)) {
      try { map.setLayoutProperty(layer.id, "visibility", "none"); } catch {}
      continue;
    }

    // 道路は残すが主張を弱める。
    if (layer.type === "line" && /(road|street|highway|transportation)/.test(id)) {
      try { map.setPaintProperty(layer.id, "line-opacity", 0.42); } catch {}
    }

    // 紙地図っぽい淡い和色に寄せる。
    if (layer.type === "background") {
      try { map.setPaintProperty(layer.id, "background-color", "#f4f0e6"); } catch {}
    }
    if (layer.type === "fill" && /water/.test(id)) {
      try { map.setPaintProperty(layer.id, "fill-color", "#d9e9ec"); } catch {}
    }
    if (layer.type === "fill" && /(park|wood|forest|landcover|grass)/.test(id)) {
      try { map.setPaintProperty(layer.id, "fill-color", "#e5eadb"); } catch {}
      try { map.setPaintProperty(layer.id, "fill-opacity", 0.62); } catch {}
    }
  }
}

function addOnsenIcons() {
  if (!map.hasImage("onsen-unvisited")) {
    map.addImage("onsen-unvisited", createOnsenIcon("#b64235", "#fff9ee", "#8f3029"), { pixelRatio: 2 });
  }
  if (!map.hasImage("onsen-visited")) {
    map.addImage("onsen-visited", createOnsenIcon("#d1a43d", "#fffaf0", "#356859"), { pixelRatio: 2 });
  }
}

function createOnsenIcon(fill, steam, border) {
  const size = 96;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.beginPath();
  ctx.arc(48, 48, 38, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = border;
  ctx.stroke();

  ctx.strokeStyle = steam;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";

  for (const x of [34, 48, 62]) {
    ctx.beginPath();
    ctx.moveTo(x - 2, 23);
    ctx.bezierCurveTo(x + 7, 31, x - 8, 37, x + 1, 45);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(27, 56);
  ctx.quadraticCurveTo(48, 72, 69, 56);
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}

function bindSpotInteractions(layerId) {
  map.on("click", layerId, (e) => {
    const feature = e.features?.[0];
    if (!feature) return;
    selectSpot(feature.properties.id);
  });

  map.on("mouseenter", layerId, () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", layerId, () => {
    map.getCanvas().style.cursor = "";
  });
}

function buildSpotGeoJSON() {
  const visited = new Set(loadCheckins().map((x) => x.spotId));
  return {
    type: "FeatureCollection",
    features: spots.map((spot) => ({
      type: "Feature",
      id: spot.id,
      properties: {
        id: spot.id,
        name: spot.name,
        prefecture: spot.prefecture,
        visited: visited.has(spot.id),
        checkinRadiusM: getCheckinRadiusM(spot)
      },
      geometry: { type: "Point", coordinates: [spot.lng, spot.lat] }
    }))
  };
}

function refreshSpotSource() {
  const source = map?.getSource("spots");
  if (source) source.setData(buildSpotGeoJSON());
}

function selectSpot(id) {
  selectedSpot = spots.find((s) => s.id === id);
  if (!selectedSpot) return;

  const radius = getCheckinRadiusM(selectedSpot);
  el("spotTitle").textContent = selectedSpot.name;
  el("spotSub").textContent = `${selectedSpot.prefecture} / チェックイン範囲 約${formatDistanceKm(radius)}（暫定）`;

  renderCheckinZone(selectedSpot, radius);
  renderAnalysis(selectedSpot);
  updateDistanceAndButton();
}

function renderCheckinZone(spot, radiusM) {
  const source = map?.getSource("checkin-zone");
  if (!source) return;
  source.setData({
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { id: spot.id },
      geometry: createCirclePolygon(spot.lat, spot.lng, radiusM)
    }]
  });
}

function createCirclePolygon(lat, lng, radiusM, steps = 64) {
  const earthRadius = 6371000;
  const latRad = lat * Math.PI / 180;
  const latDelta = radiusM / earthRadius;
  const lngDelta = radiusM / (earthRadius * Math.cos(latRad));
  const coords = [];

  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const pointLat = lat + (latDelta * Math.sin(angle)) * 180 / Math.PI;
    const pointLng = lng + (lngDelta * Math.cos(angle)) * 180 / Math.PI;
    coords.push([pointLng, pointLat]);
  }

  return { type: "Polygon", coordinates: [coords] };
}

function getCheckinRadiusM(spot) {
  const radius = Number(spot?.checkinRadiusM);
  return Number.isFinite(radius) && radius > 0 ? radius : DEFAULT_CHECKIN_RADIUS_M;
}

function renderAnalysis(spot) {
  const a = spot.analysis || {};
  const rows = [
    ["泉質", a.springType],
    ["源泉温度（℃）", a.sourceTempC],
    ["pH", a.ph],
    ["溶存物質（mg/kg）", a.dissolvedSolidsMgKg],
    ["湧出量（L/min）", a.flowLMin],
    ["分析年月日", a.analysisDate],
    ["分析機関", a.analyzer]
  ];

  const grid = el("analysisGrid");
  grid.innerHTML = "";
  for (const [key, value] of rows) grid.appendChild(makeCell(key, value ?? "—"));
  el("analysisNote").textContent = spot.referenceNote || "";
}

function makeCell(key, value) {
  const div = document.createElement("div");
  div.className = "cell";

  const keyEl = document.createElement("div");
  keyEl.className = "k";
  keyEl.textContent = key;

  const valueEl = document.createElement("div");
  valueEl.className = "v";
  valueEl.textContent = String(value);

  div.append(keyEl, valueEl);
  return div;
}

function locateOnce(flyToUser) {
  if (!navigator.geolocation) {
    el("spotAcc").textContent = "非対応";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      userAccuracyM = Math.round(pos.coords.accuracy || 0);
      el("spotAcc").textContent = userAccuracyM ? `${userAccuracyM}m` : "—";

      if (!userMarker) {
        userMarker = new maplibregl.Marker({ color: "#356859" })
          .setLngLat([userPos.lng, userPos.lat])
          .addTo(map);
      } else {
        userMarker.setLngLat([userPos.lng, userPos.lat]);
      }

      if (flyToUser) map.flyTo({ center: [userPos.lng, userPos.lat], zoom: 13 });
      updateDistanceAndButton();
    },
    (err) => {
      console.warn("Geolocation error", err);
      el("spotAcc").textContent = "取得失敗";
      updateDistanceAndButton();
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
  );
}

function updateDistanceAndButton() {
  if (!selectedSpot) {
    el("spotDist").textContent = "-";
    el("btnCheckin").disabled = true;
    el("btnCheckin").textContent = "チェックイン";
    return;
  }

  if (!userPos) {
    el("spotDist").textContent = "現在地未取得";
    el("btnCheckin").disabled = true;
    el("btnCheckin").textContent = "現在地を取得してください";
    return;
  }

  const radius = getCheckinRadiusM(selectedSpot);
  const distance = distanceM(userPos.lat, userPos.lng, selectedSpot.lat, selectedSpot.lng);
  el("spotDist").textContent = formatDistanceKm(distance);

  const accurateEnough = userAccuracyM !== null && userAccuracyM <= REQUIRED_ACCURACY_M;
  const inRange = distance <= radius;
  const cooldownOk = !isCooldownActive(selectedSpot.id);
  el("btnCheckin").disabled = !(accurateEnough && inRange && cooldownOk);

  if (!accurateEnough) {
    el("btnCheckin").textContent = "位置精度が低いです（再取得）";
  } else if (!inRange) {
    const remaining = Math.max(0, distance - radius);
    el("btnCheckin").textContent = `範囲外（あと${formatDistanceKm(remaining)}）`;
  } else if (!cooldownOk) {
    el("btnCheckin").textContent = "チェックイン済（24時間以内）";
  } else {
    el("btnCheckin").textContent = "チェックイン";
  }
}

function formatDistanceKm(meters) {
  const km = Math.max(0, meters) / 1000;
  if (km < 1) return `${km.toFixed(2)}km`;
  if (km < 10) return `${km.toFixed(2)}km`;
  if (km < 100) return `${km.toFixed(1)}km`;
  return `${Math.round(km)}km`;
}

function distanceM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (x) => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function loadCheckins() {
  try {
    return JSON.parse(localStorage.getItem("checkins") || "[]");
  } catch {
    return [];
  }
}

function saveCheckins(list) {
  localStorage.setItem("checkins", JSON.stringify(list));
}

function isCooldownActive(spotId) {
  const latest = loadCheckins()
    .filter((x) => x.spotId === spotId)
    .sort((a, b) => b.checkedAt - a.checkedAt)[0];
  if (!latest) return false;
  return Date.now() - latest.checkedAt < COOLDOWN_HOURS * 60 * 60 * 1000;
}

function onCheckin() {
  if (!selectedSpot || !userPos) return;

  const list = loadCheckins();
  list.push({
    spotId: selectedSpot.id,
    name: selectedSpot.name,
    prefecture: selectedSpot.prefecture,
    checkedAt: Date.now(),
    accuracyM: userAccuracyM
  });
  saveCheckins(list);

  alert(`チェックイン成功！\n${selectedSpot.name}`);
  renderStats();
  renderHistory();
  refreshSpotSource();
  updateDistanceAndButton();
}

function renderStats() {
  const unique = new Set(loadCheckins().map((x) => x.spotId));
  el("statTotal").textContent = `訪問 ${unique.size}`;
}

function renderHistory() {
  const list = loadCheckins().sort((a, b) => b.checkedAt - a.checkedAt).slice(0, 50);
  const ul = el("historyList");
  ul.innerHTML = "";

  if (list.length === 0) {
    const li = document.createElement("li");
    li.textContent = "まだチェックイン履歴はありません。";
    ul.appendChild(li);
    return;
  }

  for (const item of list) {
    const li = document.createElement("li");
    const dt = new Date(item.checkedAt);
    li.textContent = `${dt.toLocaleString("ja-JP")}：${item.name}（精度 ${item.accuracyM ?? "—"}m）`;
    ul.appendChild(li);
  }
}
