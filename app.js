const CHECKIN_RADIUS_M = 150;
const REQUIRED_ACCURACY_M = 60;
const COOLDOWN_HOURS = 24;

// 日本全域（沖縄〜北海道・離島を含む）を大きく囲う操作範囲。
// 「世界中まで地図を飛ばせてしまう」状態を防ぐための制限です。
const JAPAN_BOUNDS = [
  [122.0, 20.0], // southwest
  [154.0, 46.5]  // northeast
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
    // 淡色で温泉スポットを目立たせる背景地図。
    style: "https://tiles.openfreemap.org/styles/positron",
    center: [137.5, 36.2],
    zoom: 4.5,
    minZoom: 4,
    maxBounds: JAPAN_BOUNDS,
    renderWorldCopies: false
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

  map.on("load", () => {
    const geo = {
      type: "FeatureCollection",
      features: spots.map((s) => ({
        type: "Feature",
        id: s.id,
        properties: { id: s.id, name: s.name, prefecture: s.prefecture },
        geometry: { type: "Point", coordinates: [s.lng, s.lat] }
      }))
    };

    map.addSource("spots", { type: "geojson", data: geo });

    map.addLayer({
      id: "spots-layer",
      type: "circle",
      source: "spots",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 6, 8, 9, 13, 12],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
        "circle-color": [
          "case",
          ["boolean", ["feature-state", "visited"], false],
          "#1f9d68",
          "#2764c5"
        ]
      }
    });

    applyVisitedFeatureState();

    map.on("click", "spots-layer", (e) => {
      const feature = e.features?.[0];
      if (!feature) return;
      selectSpot(feature.properties.id);
    });

    map.on("mouseenter", "spots-layer", () => {
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", "spots-layer", () => {
      map.getCanvas().style.cursor = "";
    });
  });
}

function selectSpot(id) {
  selectedSpot = spots.find((s) => s.id === id);
  if (!selectedSpot) return;

  el("spotTitle").textContent = selectedSpot.name;
  el("spotSub").textContent = `${selectedSpot.prefecture} / チェックイン半径 ${CHECKIN_RADIUS_M}m`;
  renderAnalysis(selectedSpot);
  updateDistanceAndButton();
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

  for (const [key, value] of rows) {
    grid.appendChild(makeCell(key, value ?? "—"));
  }

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
      userPos = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      userAccuracyM = Math.round(pos.coords.accuracy || 0);

      el("spotAcc").textContent = userAccuracyM ? `${userAccuracyM}m` : "—";

      if (!userMarker) {
        userMarker = new maplibregl.Marker({ color: "#e7a928" })
          .setLngLat([userPos.lng, userPos.lat])
          .addTo(map);
      } else {
        userMarker.setLngLat([userPos.lng, userPos.lat]);
      }

      if (flyToUser) {
        map.flyTo({ center: [userPos.lng, userPos.lat], zoom: 13 });
      }

      updateDistanceAndButton();
    },
    (err) => {
      console.warn("Geolocation error", err);
      el("spotAcc").textContent = "取得失敗";
      updateDistanceAndButton();
    },
    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 5000
    }
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

  const distance = distanceM(userPos.lat, userPos.lng, selectedSpot.lat, selectedSpot.lng);
  el("spotDist").textContent = formatDistanceKm(distance);

  const accurateEnough = userAccuracyM !== null && userAccuracyM <= REQUIRED_ACCURACY_M;
  const inRange = distance <= CHECKIN_RADIUS_M;
  const cooldownOk = !isCooldownActive(selectedSpot.id);

  el("btnCheckin").disabled = !(accurateEnough && inRange && cooldownOk);

  if (!accurateEnough) {
    el("btnCheckin").textContent = "位置精度が低いです（再取得）";
  } else if (!inRange) {
    const remaining = Math.max(0, distance - CHECKIN_RADIUS_M);
    // チェックイン直前の誘導だけは実用性のためm表示を残す。
    el("btnCheckin").textContent = remaining < 1000
      ? `範囲外（あと${Math.round(remaining)}m）`
      : `範囲外（あと${formatDistanceKm(remaining)}）`;
  } else if (!cooldownOk) {
    el("btnCheckin").textContent = "チェックイン済（24時間以内）";
  } else {
    el("btnCheckin").textContent = "チェックイン";
  }
}

function formatDistanceKm(meters) {
  const km = meters / 1000;
  if (km < 10) return `${km.toFixed(2)}km`;
  if (km < 100) return `${km.toFixed(1)}km`;
  return `${Math.round(km)}km`;
}

function distanceM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (x) => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
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
  applyVisitedFeatureState();
  updateDistanceAndButton();
}

function renderStats() {
  const unique = new Set(loadCheckins().map((x) => x.spotId));
  el("statTotal").textContent = `訪問 ${unique.size}`;
}

function renderHistory() {
  const list = loadCheckins()
    .sort((a, b) => b.checkedAt - a.checkedAt)
    .slice(0, 50);

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

function applyVisitedFeatureState() {
  if (!map || !map.isStyleLoaded() || !map.getSource("spots")) return;

  const visited = new Set(loadCheckins().map((x) => x.spotId));
  for (const spot of spots) {
    map.setFeatureState(
      { source: "spots", id: spot.id },
      { visited: visited.has(spot.id) }
    );
  }
}
