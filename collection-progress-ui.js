const COLLECTION_ONSEN_MUSUME_MASTER_URL = "./catalog/onsen-musume-area-master.json";
const COLLECTION_REGIONAL_ASSET_MASTER_URL = "./catalog/onsen-regional-asset-master.json";
const COLLECTION_ANALYSIS_OVERRIDES_URL = "./data/onsen-analysis-overrides-core.json";

let collectionRegionalAssetFilterActive = false;
let collectionOnsenMusumeMaster = null;
let collectionRegionalAssetMaster = null;
let collectionAnalysisMaster = null;

waitForCollectionCore().then(initCollectionProgress).catch((err) => {
  console.warn("collection progress init failed", err);
});

async function waitForCollectionCore() {
  for (let i = 0; i < 240; i++) {
    if (
      typeof spots !== "undefined" &&
      Array.isArray(spots) &&
      spots.length > 0 &&
      typeof loadCheckins === "function" &&
      typeof applySpotFilters === "function" &&
      typeof renderEnhancedSpotDetails === "function"
    ) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("collection core was not ready");
}

async function initCollectionProgress() {
  const results = await Promise.allSettled([
    fetchCollectionJson(COLLECTION_ONSEN_MUSUME_MASTER_URL),
    fetchCollectionJson(COLLECTION_REGIONAL_ASSET_MASTER_URL),
    fetchCollectionJson(COLLECTION_ANALYSIS_OVERRIDES_URL)
  ]);

  if (results[0].status === "fulfilled") {
    collectionOnsenMusumeMaster = results[0].value;
    applyOnsenMusumeMaster(collectionOnsenMusumeMaster);
  } else {
    console.warn("onsen musume master load failed", results[0].reason);
  }

  if (results[1].status === "fulfilled") {
    collectionRegionalAssetMaster = results[1].value;
    applyRegionalAssetMaster(collectionRegionalAssetMaster);
  } else {
    console.warn("regional asset master load failed", results[1].reason);
  }

  if (results[2].status === "fulfilled") {
    collectionAnalysisMaster = results[2].value;
    applyAnalysisOverrides(collectionAnalysisMaster);
  } else {
    console.warn("analysis override load failed", results[2].reason);
  }

  installRegionalAssetFilter();
  wrapCollectionCoreFunctions();
  setupCollectionTabs();
  appendCollectionSearchSuggestions();

  if (typeof applySpotFilters === "function") applySpotFilters();
  if (typeof selectedSpot !== "undefined" && selectedSpot) {
    if (typeof renderEnhancedSpotDetails === "function") renderEnhancedSpotDetails(selectedSpot);
    if (typeof renderAnalysis === "function") renderAnalysis(selectedSpot);
  }
  renderCollectionProgress();

  // fixed-selection-ui.js is asynchronous too; re-render after its master has had time to attach.
  setTimeout(renderCollectionProgress, 700);
  setTimeout(renderCollectionProgress, 1800);

  console.info("onsen musume reconciled coverage", window.onsenMusumeReconciledCoverage);
  console.info("regional asset coverage", window.onsenRegionalAssetCoverage);
}

async function fetchCollectionJson(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${url} load failed: ${response.status}`);
  return response.json();
}

function normalizeCollectionName(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[・･\s　]/g, "")
    .replace(/[ヶケ]/g, "ヶ")
    .toLowerCase();
}

function findCollectionSpot(prefecture, names) {
  const aliases = [...new Set((names || []).filter(Boolean).map(normalizeCollectionName))];
  const samePrefecture = spots.filter((spot) => spot?.prefecture === prefecture);

  for (const spot of samePrefecture) {
    if (aliases.includes(normalizeCollectionName(spot.name))) {
      return { spot, mode: "spot_name" };
    }
  }

  for (const spot of samePrefecture) {
    const subAreas = (spot.subAreas || []).map(normalizeCollectionName);
    if (aliases.some((alias) => subAreas.includes(alias))) {
      return { spot, mode: "sub_area" };
    }
  }

  return null;
}

function pushUnique(target, values) {
  for (const value of values || []) {
    if (value !== undefined && value !== null && !target.includes(value)) target.push(value);
  }
}

function ensureArrayField(spot, field) {
  if (!Array.isArray(spot[field])) spot[field] = [];
  return spot[field];
}

function applyOnsenMusumeMaster(master) {
  const matched = [];
  const unmatched = [];

  for (const area of master?.areas || []) {
    const match = findCollectionSpot(area.prefecture, [area.name, ...(area.matchNames || [])]);
    if (!match) {
      unmatched.push({ prefecture: area.prefecture, name: area.name, characters: area.characters || [] });
      continue;
    }

    const spot = match.spot;
    const characters = ensureArrayField(spot, "onsenMusumeCharacters");
    pushUnique(characters, area.characters || []);
    pushUnique(ensureArrayField(spot, "badges"), ["onsen_musume"]);

    matched.push({
      prefecture: area.prefecture,
      name: area.name,
      spotId: spot.id,
      spotName: spot.name,
      characters: [...(area.characters || [])],
      matchMode: match.mode
    });
  }

  window.onsenMusumeReconciledCoverage = {
    officialAreaCount: master?.summary?.normalizedAreaCount ?? (master?.areas || []).length,
    officialCharacterCount: master?.summary?.charactersDomestic ?? null,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    matched,
    unmatched
  };
}

function applyRegionalAssetMaster(master) {
  const matched = [];
  const unmatched = [];
  const selection = master?.selection || {};

  for (const area of master?.areas || []) {
    const names = [area.officialAreaName, ...(area.matchNames || [])];
    const match = findCollectionSpot(area.prefecture, names);

    if (!match) {
      unmatched.push({
        prefecture: area.prefecture,
        officialAreaName: area.officialAreaName,
        assetCount: area.assetCount || 1
      });
      continue;
    }

    const spot = match.spot;
    spot.onsenRegionalAsset = true;

    if (!Array.isArray(spot.onsenRegionalAssetEntries)) spot.onsenRegionalAssetEntries = [];
    const key = `${area.prefecture}::${area.officialAreaName}`;
    if (!spot.onsenRegionalAssetEntries.some((item) => item.key === key)) {
      spot.onsenRegionalAssetEntries.push({
        key,
        officialAreaName: area.officialAreaName,
        assetCount: area.assetCount || 1,
        sourceVersion: selection.publicBaselineYear || 2004
      });
    }

    pushUnique(ensureArrayField(spot, "permanentBadges"), [selection.id || "onsen_regional_asset"]);

    matched.push({
      prefecture: area.prefecture,
      officialAreaName: area.officialAreaName,
      assetCount: area.assetCount || 1,
      spotId: spot.id,
      spotName: spot.name,
      matchMode: match.mode
    });
  }

  window.onsenRegionalAssetCoverage = {
    publicBaselineAssetCount: selection.publicBaselineAssetCount || null,
    latestPubliclyStatedSelectionCount: selection.latestPubliclyStatedSelectionCount || null,
    normalizedAreaCount: (master?.areas || []).length,
    matchedAreaRecords: matched.length,
    unmatchedAreaRecords: unmatched.length,
    matchedSpotCount: new Set(matched.map((item) => item.spotId)).size,
    matched,
    unmatched,
    nonSpotAssets: master?.nonSpotAssets || []
  };
}

function applyAnalysisOverrides(master) {
  const applied = [];
  const missing = [];

  for (const entry of master?.entries || []) {
    const spot = spots.find((item) => item.id === entry.id);
    if (!spot) {
      missing.push(entry.id);
      continue;
    }
    spot.analysis = { ...(spot.analysis || {}), ...(entry.analysis || {}) };
    applied.push(entry.id);
  }

  window.onsenAnalysisCoverage = {
    seedCount: (master?.entries || []).length,
    appliedCount: applied.length,
    missingCount: missing.length,
    applied,
    missing
  };
}

function installRegionalAssetFilter() {
  const row = document.querySelector(".filter-row");
  const reset = document.getElementById("btnResetFilters");
  if (!row || document.getElementById("btnRegionalAsset")) return;

  const button = document.createElement("button");
  button.id = "btnRegionalAsset";
  button.className = "filter-chip";
  button.type = "button";
  button.textContent = "地域資産";
  button.title = "日本温泉地域学会「日本温泉地域資産」で絞り込み";
  button.addEventListener("click", () => {
    collectionRegionalAssetFilterActive = !collectionRegionalAssetFilterActive;
    button.classList.toggle("active", collectionRegionalAssetFilterActive);
    if (typeof applySpotFilters === "function") applySpotFilters();
  });

  row.insertBefore(button, reset || null);
}

function isOnsenRegionalAssetSpot(spot) {
  return spot?.onsenRegionalAsset === true ||
    (spot?.permanentBadges || []).includes("onsen_regional_asset");
}

function getRegionalAssetEntries(spot) {
  return Array.isArray(spot?.onsenRegionalAssetEntries) ? spot.onsenRegionalAssetEntries : [];
}

function wrapCollectionCoreFunctions() {
  if (typeof getVisibleSpots === "function") {
    const collectionBaseGetVisibleSpots = getVisibleSpots;
    getVisibleSpots = function collectionGetVisibleSpots() {
      const visible = collectionBaseGetVisibleSpots();
      return collectionRegionalAssetFilterActive ? visible.filter(isOnsenRegionalAssetSpot) : visible;
    };
  }

  if (typeof resetAllFilters === "function") {
    const collectionBaseResetAllFilters = resetAllFilters;
    resetAllFilters = function collectionResetAllFilters() {
      collectionRegionalAssetFilterActive = false;
      document.getElementById("btnRegionalAsset")?.classList.remove("active");
      collectionBaseResetAllFilters();
    };
  }

  const resetButton = document.getElementById("btnResetFilters");
  if (resetButton) {
    resetButton.addEventListener("click", () => {
      collectionRegionalAssetFilterActive = false;
      document.getElementById("btnRegionalAsset")?.classList.remove("active");
      if (typeof applySpotFilters === "function") applySpotFilters();
    });
  }

  if (typeof getSpotSearchText === "function") {
    const collectionBaseGetSpotSearchText = getSpotSearchText;
    getSpotSearchText = function collectionGetSpotSearchText(spot) {
      const base = collectionBaseGetSpotSearchText(spot);
      const assetNames = getRegionalAssetEntries(spot)
        .map((item) => item.officialAreaName)
        .join(" ");
      return `${base}${normalizeSearchText(` 日本温泉地域資産 地域資産 ${assetNames}`)}`;
    };
  }

  if (typeof renderEnhancedSpotDetails === "function") {
    const collectionBaseRenderEnhancedSpotDetails = renderEnhancedSpotDetails;
    renderEnhancedSpotDetails = function collectionRenderEnhancedSpotDetails(spot) {
      collectionBaseRenderEnhancedSpotDetails(spot);
      if (!spot || !isOnsenRegionalAssetSpot(spot)) return;

      const tagContainer = document.getElementById("spotTags");
      if (!tagContainer) return;

      addSpotTag(tagContainer, "SR 日本温泉地域資産", "accent");

      const entries = getRegionalAssetEntries(spot);
      const assetCount = entries.reduce((sum, item) => sum + Number(item.assetCount || 0), 0);
      if (assetCount > 1) addSpotTag(tagContainer, `地域資産 ${assetCount}件`);
    };
  }

  if (typeof renderStats === "function") {
    const collectionBaseRenderStats = renderStats;
    renderStats = function collectionRenderStats() {
      collectionBaseRenderStats();
      renderCollectionProgress();
    };
  }

  if (typeof renderAnalysis === "function") {
    renderAnalysis = function collectionRenderAnalysis(spot) {
      renderNormalizedAnalysis(spot);
    };
  }
}

function formatCollectionValue(value) {
  if (value === undefined || value === null || value === "") return "—";
  return String(value);
}

function renderNormalizedAnalysis(spot) {
  const a = spot?.analysis || {};
  const hasData = [
    a.springType, a.sourceTempC, a.ph, a.dissolvedSolidsMgKg, a.flowLMin,
    a.totalFlowLMin, a.analysisDate, a.analyzer
  ].some((value) => value !== undefined && value !== null && value !== "");

  const status = a.verified === true ? "出典確認済み" : (hasData ? "暫定・一部登録" : "未登録");
  const scope = a.profileLabel ||
    (a.scope === "area_summary" ? "温泉地概況" :
      a.scope === "representative_source" ? "代表源泉" : "—");

  let flow = a.flowLMin;
  if ((flow === undefined || flow === null || flow === "") && a.totalFlowLMin !== undefined) {
    flow = `${a.totalFlowLMin}（温泉地総湧出量）`;
  }

  const rows = [
    ["データ状態", status],
    ["対象", scope],
    ["泉質", a.springType],
    ["源泉温度（℃）", a.sourceTempC],
    ["pH", a.ph],
    ["溶存物質（mg/kg）", a.dissolvedSolidsMgKg],
    ["湧出量（L/min）", flow],
    ["分析年月日", a.analysisDate],
    ["分析機関", a.analyzer]
  ];

  const grid = document.getElementById("analysisGrid");
  if (!grid) return;
  grid.innerHTML = "";

  for (const [key, value] of rows) {
    if (typeof makeCell === "function") grid.appendChild(makeCell(key, formatCollectionValue(value)));
  }

  const note = document.getElementById("analysisNote");
  if (!note) return;
  note.innerHTML = "";

  const text = document.createElement("span");
  text.textContent = hasData
    ? (a.referenceNote || "温泉地内で複数源泉がある場合は、温泉地概況または代表源泉として表示しています。")
    : "代表分析データは未登録です。源泉ごとの差が大きい温泉地では単一値を推測せず、公式の分析表・自治体資料を確認できたものから補完します。";
  note.appendChild(text);

  const sources = Array.isArray(a.sources) ? a.sources : [];
  if (sources.length) {
    const sourceWrap = document.createElement("span");
    sourceWrap.className = "analysis-sources";
    sourceWrap.appendChild(document.createTextNode(" 出典: "));

    sources.forEach((source, index) => {
      if (index > 0) sourceWrap.appendChild(document.createTextNode(" / "));
      if (source?.url) {
        const link = document.createElement("a");
        link.href = source.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = source.name || "資料";
        sourceWrap.appendChild(link);
      } else {
        sourceWrap.appendChild(document.createTextNode(source?.name || "資料"));
      }
    });
    note.appendChild(sourceWrap);
  }
}

function appendCollectionSearchSuggestions() {
  const datalist = document.getElementById("searchSuggestions");
  if (!datalist) return;

  const existing = new Set([...datalist.options].map((option) => option.value));
  const values = new Set();

  for (const spot of spots) {
    for (const character of (spot.onsenMusumeCharacters || [])) values.add(character);
    for (const entry of getRegionalAssetEntries(spot)) values.add(entry.officialAreaName);
  }

  for (const value of values) {
    if (!value || existing.has(value)) continue;
    const option = document.createElement("option");
    option.value = value;
    datalist.appendChild(option);
    existing.add(value);
  }
}

function setupCollectionTabs() {
  document.body.classList.add("has-app-tabs");
  const buttons = [...document.querySelectorAll("[data-app-tab]")];
  if (!buttons.length) return;

  for (const button of buttons) {
    button.addEventListener("click", () => setCollectionAppTab(button.dataset.appTab || "map"));
  }

  setCollectionAppTab("map");
}

function setCollectionAppTab(tab) {
  const showCollection = tab === "collection";
  const main = document.querySelector(".main");
  const collectionView = document.getElementById("collectionView");

  if (main) main.hidden = showCollection;
  if (collectionView) collectionView.hidden = !showCollection;

  for (const button of document.querySelectorAll("[data-app-tab]")) {
    const active = button.dataset.appTab === (showCollection ? "collection" : "map");
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  }

  if (showCollection) {
    renderCollectionProgress();
    collectionView?.scrollTo({ top: 0, behavior: "auto" });
  } else if (typeof map !== "undefined" && map) {
    setTimeout(() => map.resize(), 0);
  }
}

function findSpotByExactName(prefecture, name) {
  const normalized = normalizeCollectionName(name);
  return spots.find((spot) =>
    (!prefecture || spot.prefecture === prefecture) &&
    normalizeCollectionName(spot.name) === normalized
  ) || null;
}

function uniqueCollectionSpots(list) {
  const byId = new Map();
  for (const spot of list || []) {
    if (spot?.id) byId.set(spot.id, spot);
  }
  return [...byId.values()];
}

function getHistoricalGroup(names) {
  return uniqueCollectionSpots(names.map(([prefecture, name]) => findSpotByExactName(prefecture, name)).filter(Boolean));
}

function getCollectionDefinitions() {
  return [
    {
      id: "onsen_musume",
      name: "温泉むすめ",
      rarity: "R",
      note: collectionOnsenMusumeMaster?.summary?.normalizedAreaCount
        ? `公式キャラクター対応 ${collectionOnsenMusumeMaster.summary.normalizedAreaCount}温泉地`
        : "温泉むすめ公式キャラクター対応温泉地",
      spots: uniqueCollectionSpots(spots.filter((spot) =>
        (typeof isOnsenMusumeSpot === "function" && isOnsenMusumeSpot(spot)) ||
        (spot.onsenMusumeCharacters || []).length > 0
      ))
    },
    {
      id: "nihon_sankoto",
      name: "日本三古湯",
      rarity: "UR",
      note: "有馬・道後・白浜（いわゆる三古泉）",
      spots: getHistoricalGroup([
        ["兵庫県", "有馬温泉"],
        ["愛媛県", "道後温泉"],
        ["和歌山県", "白浜温泉"]
      ])
    },
    {
      id: "nihon_sanmeisen",
      name: "日本三名泉",
      rarity: "UR",
      note: "草津・有馬・下呂",
      spots: getHistoricalGroup([
        ["群馬県", "草津温泉"],
        ["兵庫県", "有馬温泉"],
        ["岐阜県", "下呂温泉"]
      ])
    },
    {
      id: "national_recreation_spa",
      name: "国民保養温泉地",
      rarity: "SR",
      note: "環境大臣指定",
      spots: uniqueCollectionSpots(spots.filter((spot) =>
        typeof isNationalRecreationSpot === "function" && isNationalRecreationSpot(spot)
      ))
    },
    {
      id: "onsen_heritage",
      name: "温泉遺産",
      rarity: "SR",
      note: "日本温泉遺産を守る会・現在アプリで確認済みの認定温泉地",
      spots: uniqueCollectionSpots(spots.filter((spot) =>
        typeof isOnsenHeritageSpot === "function" && isOnsenHeritageSpot(spot)
      ))
    },
    {
      id: "onsen_regional_asset",
      name: "日本温泉地域資産",
      rarity: "SR",
      note: "公開されている2004年第一次選定125資産を温泉地単位に正規化",
      spots: uniqueCollectionSpots(spots.filter(isOnsenRegionalAssetSpot))
    },
    {
      id: "meito_hyakusen",
      name: "名湯百選",
      rarity: "SR",
      note: "NPO法人 健康と温泉フォーラム",
      spots: uniqueCollectionSpots(spots.filter((spot) =>
        typeof isFixedSelectionSpot === "function" && isFixedSelectionSpot(spot)
      ))
    }
  ];
}

function renderCollectionProgress() {
  const grid = document.getElementById("collectionGrid");
  const summary = document.getElementById("collectionSummary");
  if (!grid || !summary || typeof loadCheckins !== "function") return;

  const visited = new Set(loadCheckins().map((item) => item.spotId));
  const definitions = getCollectionDefinitions();

  summary.textContent = `訪問 ${visited.size}温泉地 / 収録 ${spots.length}温泉地　・　主要タグ ${definitions.length}種`;
  grid.innerHTML = "";

  for (const definition of definitions) {
    const targets = definition.spots || [];
    const visitedTargets = targets.filter((spot) => visited.has(spot.id));
    const total = targets.length;
    const done = visitedTargets.length;
    const percent = total ? Math.round(done / total * 100) : 0;

    const card = document.createElement("details");
    card.className = "collection-card";

    const cardSummary = document.createElement("summary");
    cardSummary.className = "collection-card-summary";

    const heading = document.createElement("div");
    heading.className = "collection-card-heading";

    const title = document.createElement("div");
    title.className = "collection-card-title";

    const rarity = document.createElement("span");
    rarity.className = `collection-rarity rarity-${String(definition.rarity || "N").toLowerCase()}`;
    rarity.textContent = definition.rarity || "N";

    const name = document.createElement("strong");
    name.textContent = definition.name;
    title.append(rarity, name);

    const count = document.createElement("div");
    count.className = "collection-card-count";
    count.textContent = `${done} / ${total}　${percent}%`;

    heading.append(title, count);

    const progress = document.createElement("div");
    progress.className = "collection-progress";
    const bar = document.createElement("span");
    bar.style.width = `${percent}%`;
    progress.appendChild(bar);

    const note = document.createElement("div");
    note.className = "collection-card-note";
    note.textContent = definition.note || "";

    cardSummary.append(heading, progress, note);
    card.appendChild(cardSummary);

    const list = document.createElement("div");
    list.className = "collection-target-list";

    const sorted = [...targets].sort((a, b) => {
      const av = visited.has(a.id) ? 1 : 0;
      const bv = visited.has(b.id) ? 1 : 0;
      if (av !== bv) return av - bv;
      return String(a.prefecture).localeCompare(String(b.prefecture), "ja") ||
        String(a.name).localeCompare(String(b.name), "ja");
    });

    for (const spot of sorted) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = `collection-target ${visited.has(spot.id) ? "visited" : "unvisited"}`;
      row.dataset.spotId = spot.id;

      const mark = document.createElement("span");
      mark.className = "collection-target-mark";
      mark.textContent = visited.has(spot.id) ? "✓" : "○";

      const label = document.createElement("span");
      label.className = "collection-target-label";
      label.textContent = spot.name;

      const pref = document.createElement("span");
      pref.className = "collection-target-pref";
      pref.textContent = spot.prefecture || "";

      row.append(mark, label, pref);
      row.addEventListener("click", () => {
        setCollectionAppTab("map");
        if (typeof selectSpot === "function") selectSpot(spot.id);
        if (typeof map !== "undefined" && map) {
          map.flyTo({ center: [spot.lng, spot.lat], zoom: Math.max(map.getZoom(), 10) });
        }
      });
      list.appendChild(row);
    }

    if (!sorted.length) {
      const empty = document.createElement("div");
      empty.className = "collection-empty";
      empty.textContent = "現在の収録データでは対象温泉地を照合できていません。";
      list.appendChild(empty);
    }

    card.appendChild(list);
    grid.appendChild(card);
  }
}
