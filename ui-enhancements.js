const PREFECTURE_GEOJSON_URL = "https://raw.githubusercontent.com/geolonia/prefecture-tiles/master/prefectures.geojson";

const PREFECTURES = [
  ["01", "北海道", 43.40, 142.80], ["02", "青森県", 40.82, 140.74], ["03", "岩手県", 39.70, 141.15],
  ["04", "宮城県", 38.27, 140.87], ["05", "秋田県", 39.72, 140.10], ["06", "山形県", 38.24, 140.36],
  ["07", "福島県", 37.75, 140.47], ["08", "茨城県", 36.34, 140.45], ["09", "栃木県", 36.57, 139.88],
  ["10", "群馬県", 36.39, 139.06], ["11", "埼玉県", 35.86, 139.65], ["12", "千葉県", 35.60, 140.12],
  ["13", "東京都", 35.68, 139.69], ["14", "神奈川県", 35.45, 139.64], ["15", "新潟県", 37.90, 139.02],
  ["16", "富山県", 36.70, 137.21], ["17", "石川県", 36.59, 136.63], ["18", "福井県", 36.07, 136.22],
  ["19", "山梨県", 35.66, 138.57], ["20", "長野県", 36.65, 138.18], ["21", "岐阜県", 35.39, 136.72],
  ["22", "静岡県", 34.98, 138.38], ["23", "愛知県", 35.18, 136.91], ["24", "三重県", 34.73, 136.51],
  ["25", "滋賀県", 35.00, 135.87], ["26", "京都府", 35.02, 135.76], ["27", "大阪府", 34.69, 135.50],
  ["28", "兵庫県", 34.69, 135.18], ["29", "奈良県", 34.69, 135.83], ["30", "和歌山県", 34.23, 135.17],
  ["31", "鳥取県", 35.50, 134.24], ["32", "島根県", 35.47, 133.05], ["33", "岡山県", 34.66, 133.93],
  ["34", "広島県", 34.40, 132.46], ["35", "山口県", 34.19, 131.47], ["36", "徳島県", 34.07, 134.56],
  ["37", "香川県", 34.34, 134.04], ["38", "愛媛県", 33.84, 132.77], ["39", "高知県", 33.56, 133.53],
  ["40", "福岡県", 33.59, 130.40], ["41", "佐賀県", 33.25, 130.30], ["42", "長崎県", 32.75, 129.87],
  ["43", "熊本県", 32.80, 130.71], ["44", "大分県", 33.24, 131.61], ["45", "宮崎県", 31.91, 131.42],
  ["46", "鹿児島県", 31.56, 130.56], ["47", "沖縄県", 26.33, 127.80]
];

const uiFilterState = {
  query: "",
  prefecture: "",
  visit: "all",
  onsenMusume: false,
  nationalRecreation: false,
  onsenArea: false,
  legacy: false
};

let uiActivePrefectureCode = null;
let uiCoreSelectSpot = null;

waitForCoreApp().then(initUiEnhancements).catch((err) => {
  console.warn("UI enhancements init failed", err);
});

async function waitForCoreApp() {
  for (let i = 0; i < 200; i++) {
    if (typeof map !== "undefined" && map && typeof spots !== "undefined" && Array.isArray(spots) && spots.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("core app was not ready");
}

function initUiEnhancements() {
  setupPrefectureSelect();
  setupSearchSuggestions();
  setupFilterEvents();
  wrapCoreUiFunctions();

  if (map.loaded()) addPrefectureOverlay();
  else map.once("load", addPrefectureOverlay);

  applySpotFilters();
}

function setupPrefectureSelect() {
  const select = document.getElementById("prefFilter");
  for (const [, name] of PREFECTURES) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  }
}

function setupSearchSuggestions() {
  const datalist = document.getElementById("searchSuggestions");
  const values = new Set();
  for (const spot of spots) {
    if (spot?.name) values.add(spot.name);
    for (const character of getOnsenMusumeCharacters(spot)) values.add(character);
  }
  for (const value of [...values].sort((a, b) => a.localeCompare(b, "ja"))) {
    const option = document.createElement("option");
    option.value = value;
    datalist.appendChild(option);
  }
}

function setupFilterEvents() {
  const search = document.getElementById("searchInput");
  const pref = document.getElementById("prefFilter");

  search.addEventListener("input", () => {
    uiFilterState.query = search.value.trim();
    applySpotFilters();
  });

  search.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      focusBestSearchMatch();
    }
  });

  document.getElementById("btnClearSearch").addEventListener("click", () => {
    search.value = "";
    uiFilterState.query = "";
    applySpotFilters();
    search.focus();
  });

  pref.addEventListener("change", () => {
    setPrefectureFilter(pref.value, true);
  });

  for (const button of document.querySelectorAll("[data-visit]")) {
    button.addEventListener("click", () => {
      uiFilterState.visit = button.dataset.visit || "all";
      for (const other of document.querySelectorAll("[data-visit]")) {
        other.classList.toggle("active", other === button);
      }
      applySpotFilters();
    });
  }

  for (const button of document.querySelectorAll("[data-tag]")) {
    button.addEventListener("click", () => {
      const tag = button.dataset.tag;
      if (!(tag in uiFilterState)) return;
      uiFilterState[tag] = !uiFilterState[tag];
      button.classList.toggle("active", uiFilterState[tag]);
      applySpotFilters();
    });
  }

  document.getElementById("btnResetFilters").addEventListener("click", resetAllFilters);
}

function wrapCoreUiFunctions() {
  if (typeof selectSpot === "function") {
    uiCoreSelectSpot = selectSpot;
    selectSpot = function enhancedSelectSpot(id) {
      uiCoreSelectSpot(id);
      renderEnhancedSpotDetails(selectedSpot);
    };
  }

  if (typeof refreshSpotSource === "function") {
    refreshSpotSource = function enhancedRefreshSpotSource() {
      applySpotFilters();
    };
  }
}

function resetAllFilters() {
  uiFilterState.query = "";
  uiFilterState.prefecture = "";
  uiFilterState.visit = "all";
  uiFilterState.onsenMusume = false;
  uiFilterState.nationalRecreation = false;
  uiFilterState.onsenArea = false;
  uiFilterState.legacy = false;

  document.getElementById("searchInput").value = "";
  document.getElementById("prefFilter").value = "";

  for (const button of document.querySelectorAll("[data-visit]")) {
    button.classList.toggle("active", button.dataset.visit === "all");
  }
  for (const button of document.querySelectorAll("[data-tag]")) button.classList.remove("active");

  setActivePrefectureHighlight("");
  applySpotFilters();
}

function setPrefectureFilter(prefectureName, moveMap) {
  uiFilterState.prefecture = prefectureName || "";
  document.getElementById("prefFilter").value = uiFilterState.prefecture;
  setActivePrefectureHighlight(uiFilterState.prefecture);
  applySpotFilters();

  if (moveMap && uiFilterState.prefecture) {
    const pref = PREFECTURES.find(([, name]) => name === uiFilterState.prefecture);
    if (pref) map.flyTo({ center: [pref[3], pref[2]], zoom: Math.max(map.getZoom(), 6.5) });
  }
}

function getVisibleSpots() {
  const visited = new Set(loadCheckins().map((item) => item.spotId));
  const query = normalizeSearchText(uiFilterState.query);

  return spots.filter((spot) => {
    if (uiFilterState.prefecture && spot.prefecture !== uiFilterState.prefecture) return false;
    if (uiFilterState.visit === "visited" && !visited.has(spot.id)) return false;
    if (uiFilterState.visit === "unvisited" && visited.has(spot.id)) return false;
    if (uiFilterState.onsenMusume && !isOnsenMusumeSpot(spot)) return false;
    if (uiFilterState.nationalRecreation && !isNationalRecreationSpot(spot)) return false;
    if (uiFilterState.onsenArea && !isOnsenAreaSpot(spot)) return false;
    if (uiFilterState.legacy && !isLegacySpot(spot)) return false;
    if (query && !getSpotSearchText(spot).includes(query)) return false;
    return true;
  });
}

function applySpotFilters() {
  const visible = getVisibleSpots();
  const source = map?.getSource("spots");
  if (source) source.setData(buildFilteredSpotGeoJSON(visible));

  const count = document.getElementById("filterCount");
  if (count) count.textContent = `表示 ${visible.length} / ${spots.length}`;
}

function buildFilteredSpotGeoJSON(list) {
  const visited = new Set(loadCheckins().map((item) => item.spotId));
  return {
    type: "FeatureCollection",
    features: list.map((spot) => ({
      type: "Feature",
      id: spot.id,
      properties: {
        id: spot.id,
        name: spot.name,
        prefecture: spot.prefecture,
        visited: visited.has(spot.id),
        zoneCount: getCheckinZones(spot).length
      },
      geometry: { type: "Point", coordinates: [spot.lng, spot.lat] }
    }))
  };
}

function focusBestSearchMatch() {
  const visible = getVisibleSpots();
  if (!visible.length) return;

  const query = normalizeSearchText(uiFilterState.query);
  const ranked = [...visible].sort((a, b) => searchRank(a, query) - searchRank(b, query));
  const best = ranked[0];
  if (!best) return;

  selectSpot(best.id);
  map.flyTo({ center: [best.lng, best.lat], zoom: Math.max(map.getZoom(), 10) });
}

function searchRank(spot, query) {
  if (!query) return 10;
  const name = normalizeSearchText(spot.name || "");
  const chars = getOnsenMusumeCharacters(spot).map(normalizeSearchText);
  if (name === query) return 0;
  if (chars.includes(query)) return 1;
  if (name.startsWith(query)) return 2;
  if (name.includes(query)) return 3;
  if (chars.some((characterName) => characterName.includes(query))) return 4;
  return 10;
}

function getSpotSearchText(spot) {
  return normalizeSearchText([
    spot.name,
    spot.prefecture,
    spot.summary,
    ...getOnsenMusumeCharacters(spot),
    ...(spot.subAreas || []),
    ...(spot.tags || []),
    ...(spot.badges || [])
  ].filter(Boolean).join(" "));
}

function normalizeSearchText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}

function getOnsenMusumeCharacters(spot) {
  if (Array.isArray(spot?.onsenMusumeCharacters)) return spot.onsenMusumeCharacters;
  if (Array.isArray(spot?.onsenMusume?.characters)) return spot.onsenMusume.characters;
  return [];
}

function isOnsenMusumeSpot(spot) {
  return getOnsenMusumeCharacters(spot).length > 0 || (spot?.badges || []).includes("onsen_musume");
}

function isNationalRecreationSpot(spot) {
  return spot?.nationalRecreationSpa === true || (spot?.badges || []).includes("national_recreation_spa");
}

function isOnsenAreaSpot(spot) {
  return String(spot?.name || "").includes("温泉郷") ||
    String(spot?.displayModel || "").startsWith("parent_") ||
    (Array.isArray(spot?.subAreas) && spot.subAreas.length >= 2);
}

function isLegacySpot(spot) {
  return spot?.displayModel === "legacy_required" ||
    String(spot?.operatingStatus || "").includes("closed") ||
    String(spot?.collectionPolicy || "").includes("legacy");
}

function renderEnhancedSpotDetails(spot) {
  const tagContainer = document.getElementById("spotTags");
  const details = document.getElementById("subAreasDetails");
  const list = document.getElementById("subAreasList");
  if (!tagContainer || !details || !list) return;

  tagContainer.innerHTML = "";
  list.innerHTML = "";

  if (!spot) {
    details.hidden = true;
    return;
  }

  addSpotTag(tagContainer, spot.prefecture);
  const characters = getOnsenMusumeCharacters(spot);
  if (characters.length) addSpotTag(tagContainer, `温泉むすめ: ${characters.join("・")}`, "accent");
  if (isNationalRecreationSpot(spot)) addSpotTag(tagContainer, "SR 国民保養温泉地", "accent");
  if (isOnsenAreaSpot(spot)) addSpotTag(tagContainer, "温泉郷・複数エリア");
  if (isLegacySpot(spot)) addSpotTag(tagContainer, "レガシー温泉地", "warning");

  const subAreas = Array.isArray(spot.subAreas) ? spot.subAreas : [];
  const zones = getCheckinZones(spot);
  const labels = subAreas.length ? subAreas : (zones.length > 1 ? zones.map((zone) => zone.label) : []);

  details.hidden = labels.length === 0;
  for (const label of labels) {
    const li = document.createElement("li");
    li.textContent = label;
    list.appendChild(li);
  }
}

function addSpotTag(container, text, className = "") {
  const span = document.createElement("span");
  span.className = `spot-tag${className ? ` ${className}` : ""}`;
  span.textContent = text;
  container.appendChild(span);
}

function addPrefectureOverlay() {
  if (!map.getSource("prefecture-boundaries")) {
    map.addSource("prefecture-boundaries", {
      type: "geojson",
      data: PREFECTURE_GEOJSON_URL,
      promoteId: "code"
    });
  }

  const beforeId = map.getLayer("spots-symbol") ? "spots-symbol" : undefined;

  if (!map.getLayer("prefecture-fill")) {
    map.addLayer({
      id: "prefecture-fill",
      type: "fill",
      source: "prefecture-boundaries",
      maxzoom: 9,
      paint: {
        "fill-color": "#d7b96e",
        "fill-opacity": ["case", ["boolean", ["feature-state", "active"], false], 0.16, 0.018]
      }
    }, beforeId);
  }

  if (!map.getLayer("prefecture-lines")) {
    map.addLayer({
      id: "prefecture-lines",
      type: "line",
      source: "prefecture-boundaries",
      maxzoom: 9,
      paint: {
        "line-color": ["case", ["boolean", ["feature-state", "active"], false], "#8a6920", "#766e62"],
        "line-width": ["case", ["boolean", ["feature-state", "active"], false], 2.2, 0.9],
        "line-opacity": 0.75
      }
    }, beforeId);
  }

  if (!map.getSource("prefecture-label-points")) {
    map.addSource("prefecture-label-points", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: PREFECTURES.map(([code, name, lat, lng]) => ({
          type: "Feature",
          properties: { code, name },
          geometry: { type: "Point", coordinates: [lng, lat] }
        }))
      }
    });
  }

  if (!map.getLayer("prefecture-labels")) {
    map.addLayer({
      id: "prefecture-labels",
      type: "symbol",
      source: "prefecture-label-points",
      minzoom: 4.6,
      maxzoom: 8.2,
      layout: {
        "text-field": ["get", "name"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 4.6, 8.5, 6.5, 11.5],
        "text-allow-overlap": true,
        "text-ignore-placement": true
      },
      paint: {
        "text-color": "#5b5145",
        "text-halo-color": "#fffaf0",
        "text-halo-width": 1.4,
        "text-opacity": 0.9
      }
    }, beforeId);

    map.on("click", "prefecture-labels", (event) => {
      const feature = event.features?.[0];
      const name = feature?.properties?.name;
      if (name) setPrefectureFilter(name, true);
    });
    map.on("mouseenter", "prefecture-labels", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "prefecture-labels", () => { map.getCanvas().style.cursor = ""; });
  }
}

function setActivePrefectureHighlight(prefectureName) {
  if (!map?.getSource("prefecture-boundaries")) return;

  if (uiActivePrefectureCode) {
    try {
      map.setFeatureState({ source: "prefecture-boundaries", id: uiActivePrefectureCode }, { active: false });
    } catch {}
  }

  const pref = PREFECTURES.find(([, name]) => name === prefectureName);
  uiActivePrefectureCode = pref?.[0] || null;

  if (uiActivePrefectureCode) {
    try {
      map.setFeatureState({ source: "prefecture-boundaries", id: uiActivePrefectureCode }, { active: true });
    } catch {}
  }
}
