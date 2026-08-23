const COLLECTION_ONSEN_MUSUME_MASTER_URL = "./catalog/onsen-musume-area-master.json";
const COLLECTION_REGIONAL_ASSET_MASTER_URL = "./catalog/onsen-regional-asset-master.json";
const COLLECTION_ANALYSIS_OVERRIDES_URL = "./data/onsen-analysis-overrides-core.json";
const COLLECTION_GROUP_MASTER_URLS = [
  "./catalog/group-definitions.json",
  "./catalog/group-definitions-hokkaido-tohoku.json",
  "./catalog/group-definitions-kanto.json"
];

let collectionRegionalAssetFilterActive = false;
let collectionOnsenMusumeMaster = null;
let collectionRegionalAssetMaster = null;
let collectionAnalysisMaster = null;
let collectionGroupMasters = [];
let collectionReadyGroups = [];
let collectionProgressFilter = "all";
let collectionProgressQuery = "";

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
  const urls = [
    COLLECTION_ONSEN_MUSUME_MASTER_URL,
    COLLECTION_REGIONAL_ASSET_MASTER_URL,
    COLLECTION_ANALYSIS_OVERRIDES_URL,
    ...COLLECTION_GROUP_MASTER_URLS
  ];
  const results = await Promise.allSettled(urls.map(fetchCollectionJson));

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

  collectionGroupMasters = results.slice(3)
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  applyCollectionGroupMasters(collectionGroupMasters);

  installRegionalAssetFilter();
  wrapCollectionCoreFunctions();
  setupCollectionTabs();
  setupCollectionControls();
  appendCollectionSearchSuggestions();

  if (typeof applySpotFilters === "function") applySpotFilters();
  if (typeof selectedSpot !== "undefined" && selectedSpot) {
    if (typeof renderEnhancedSpotDetails === "function") renderEnhancedSpotDetails(selectedSpot);
    if (typeof renderAnalysis === "function") renderAnalysis(selectedSpot);
  }
  renderCollectionProgress();

  setTimeout(renderCollectionProgress, 700);
  setTimeout(renderCollectionProgress, 1800);

  console.info("onsen musume reconciled coverage", window.onsenMusumeReconciledCoverage);
  console.info("regional asset coverage", window.onsenRegionalAssetCoverage);
  console.info("collection group coverage", window.collectionGroupCoverage);
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

function getGroupMemberIds(group) {
  if (Array.isArray(group?.members) && group.members.length) return group.members;
  if (Array.isArray(group?.canonicalMembers) && group.canonicalMembers.length) return group.canonicalMembers;
  return [];
}

function applyCollectionGroupMasters(masters) {
  const ready = [];
  const blocked = [];
  const seen = new Set();

  for (const master of masters || []) {
    for (const group of master?.groups || []) {
      if (!group?.id || seen.has(group.id)) continue;
      seen.add(group.id);

      const memberIds = getGroupMemberIds(group);
      if (memberIds.length < 2) {
        blocked.push({ id: group.id, name: group.name, reason: "no_direct_runtime_members" });
        continue;
      }
      if (group.status === "source_conflict") {
        blocked.push({ id: group.id, name: group.name, reason: "source_conflict" });
        continue;
      }

      const memberSpots = memberIds.map((id) => spots.find((spot) => spot.id === id) || null);
      const missingIds = memberIds.filter((id, index) => !memberSpots[index]);
      if (missingIds.length) {
        blocked.push({ id: group.id, name: group.name, reason: "missing_spots", missingIds });
        continue;
      }

      const runtimeGroup = {
        id: group.id,
        name: group.name,
        aliases: group.aliases || [],
        category: group.category || "regional_group",
        rarity: group.spotBadgeRarity || "R",
        completionBadge: group.completionBadge || null,
        note: group.note || "",
        evidenceLevel: group.evidenceLevel || "",
        sourceUrls: [group.sourceUrl, ...(group.sourceUrls || [])].filter(Boolean),
        memberIds: [...memberIds],
        memberSpots: memberSpots.filter(Boolean)
      };
      ready.push(runtimeGroup);

      for (const spot of runtimeGroup.memberSpots) {
        if (!Array.isArray(spot.collectionGroups)) spot.collectionGroups = [];
        if (!spot.collectionGroups.some((item) => item.id === runtimeGroup.id)) {
          spot.collectionGroups.push({
            id: runtimeGroup.id,
            name: runtimeGroup.name,
            aliases: runtimeGroup.aliases,
            rarity: runtimeGroup.rarity,
            category: runtimeGroup.category,
            completionBadge: runtimeGroup.completionBadge
          });
        }
        pushUnique(ensureArrayField(spot, "badges"), [runtimeGroup.id]);
      }
    }
  }

  collectionReadyGroups = ready;
  window.collectionGroupCoverage = {
    readyCount: ready.length,
    blockedCount: blocked.length,
    ready: ready.map((group) => ({
      id: group.id,
      name: group.name,
      members: group.memberSpots.map((spot) => spot.id)
    })),
    blocked
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

function getCollectionGroupsForSpot(spot) {
  return Array.isArray(spot?.collectionGroups) ? spot.collectionGroups : [];
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
      const groupNames = getCollectionGroupsForSpot(spot)
        .flatMap((item) => [item.name, ...(item.aliases || [])])
        .join(" ");
      return `${base}${normalizeSearchText(` 日本温泉地域資産 地域資産 ${assetNames} ${groupNames}`)}`;
    };
  }

  if (typeof renderEnhancedSpotDetails === "function") {
    const collectionBaseRenderEnhancedSpotDetails = renderEnhancedSpotDetails;
    renderEnhancedSpotDetails = function collectionRenderEnhancedSpotDetails(spot) {
      collectionBaseRenderEnhancedSpotDetails(spot);
      if (!spot) return;

      const tagContainer = document.getElementById("spotTags");
      if (!tagContainer) return;

      if (isOnsenRegionalAssetSpot(spot)) {
        addSpotTag(tagContainer, "SR 日本温泉地域資産", "accent");
        const entries = getRegionalAssetEntries(spot);
        const assetCount = entries.reduce((sum, item) => sum + Number(item.assetCount || 0), 0);
        if (assetCount > 1) addSpotTag(tagContainer, `地域資産 ${assetCount}件`);
      }

      const groups = getCollectionGroupsForSpot(spot);
      for (const group of groups.slice(0, 3)) {
        addSpotTag(tagContainer, `${group.rarity || "R"} ${group.name}`, "accent");
      }
      if (groups.length > 3) addSpotTag(tagContainer, `ほか ${groups.length - 3}称号`);
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
    for (const group of getCollectionGroupsForSpot(spot)) {
      values.add(group.name);
      for (const alias of group.aliases || []) values.add(alias);
    }
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

function setupCollectionControls() {
  const search = document.getElementById("collectionSearchInput");
  if (search) {
    search.addEventListener("input", () => {
      collectionProgressQuery = search.value.trim();
      renderCollectionProgress();
    });
  }

  for (const button of document.querySelectorAll("[data-collection-filter]")) {
    button.addEventListener("click", () => {
      collectionProgressFilter = button.dataset.collectionFilter || "all";
      for (const other of document.querySelectorAll("[data-collection-filter]")) {
        other.classList.toggle("active", other === button);
      }
      renderCollectionProgress();
    });
  }
}

function setCollectionAppTab(tab) {
  const showCollection = tab === "collection";
  const main = document.querySelector(".main");
  const collectionView = document.getElementById("collectionView");

  document.body.classList.toggle("collection-tab-active", showCollection);
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

function uniqueCollectionSpots(list) {
  const byId = new Map();
  for (const spot of list || []) {
    if (spot?.id) byId.set(spot.id, spot);
  }
  return [...byId.values()];
}

function getCollectionSectionForGroup(group) {
  const category = String(group?.category || "");
  if (category.includes("national")) return "全国・歴史称号";
  if (category.includes("historical")) return "地域・歴史グループ";
  return "地域・温泉郷グループ";
}

function getCollectionDefinitions() {
  const definitions = [
    {
      id: "onsen_musume",
      name: "温泉むすめ",
      rarity: "R",
      section: "公式・選定コレクション",
      note: collectionOnsenMusumeMaster?.summary?.normalizedAreaCount
        ? `公式キャラクター対応 ${collectionOnsenMusumeMaster.summary.normalizedAreaCount}温泉地`
        : "温泉むすめ公式キャラクター対応温泉地",
      spots: uniqueCollectionSpots(spots.filter((spot) =>
        (typeof isOnsenMusumeSpot === "function" && isOnsenMusumeSpot(spot)) ||
        (spot.onsenMusumeCharacters || []).length > 0
      ))
    },
    {
      id: "national_recreation_spa",
      name: "国民保養温泉地",
      rarity: "SR",
      section: "公式・選定コレクション",
      note: "環境大臣指定",
      spots: uniqueCollectionSpots(spots.filter((spot) =>
        typeof isNationalRecreationSpot === "function" && isNationalRecreationSpot(spot)
      ))
    },
    {
      id: "onsen_heritage",
      name: "温泉遺産",
      rarity: "SR",
      section: "公式・選定コレクション",
      note: "日本温泉遺産を守る会・現在アプリで確認済みの認定温泉地",
      spots: uniqueCollectionSpots(spots.filter((spot) =>
        typeof isOnsenHeritageSpot === "function" && isOnsenHeritageSpot(spot)
      ))
    },
    {
      id: "onsen_regional_asset",
      name: "日本温泉地域資産",
      rarity: "SR",
      section: "公式・選定コレクション",
      note: "公開されている2004年第一次選定125資産を温泉地単位に正規化",
      spots: uniqueCollectionSpots(spots.filter(isOnsenRegionalAssetSpot))
    },
    {
      id: "meito_hyakusen",
      name: "名湯百選",
      rarity: "SR",
      section: "公式・選定コレクション",
      note: "NPO法人 健康と温泉フォーラム",
      spots: uniqueCollectionSpots(spots.filter((spot) =>
        typeof isFixedSelectionSpot === "function" && isFixedSelectionSpot(spot)
      ))
    }
  ];

  for (const group of collectionReadyGroups) {
    definitions.push({
      id: group.id,
      name: group.name,
      rarity: group.rarity,
      section: getCollectionSectionForGroup(group),
      note: group.note || (group.completionBadge?.name ? `全湯で「${group.completionBadge.name}」` : "構成温泉を巡る地域・歴史コレクション"),
      completionRarity: group.completionBadge?.rarity || null,
      spots: uniqueCollectionSpots(group.memberSpots)
    });
  }

  return definitions;
}

function getDefinitionProgress(definition, visited) {
  const targets = definition.spots || [];
  const done = targets.filter((spot) => visited.has(spot.id)).length;
  const total = targets.length;
  const percent = total ? Math.round(done / total * 100) : 0;
  return { done, total, percent, complete: total > 0 && done === total };
}

function definitionMatchesCollectionQuery(definition) {
  if (!collectionProgressQuery) return true;
  const query = normalizeCollectionName(collectionProgressQuery);
  const haystack = normalizeCollectionName([
    definition.name,
    definition.note,
    ...(definition.spots || []).flatMap((spot) => [spot.name, spot.prefecture])
  ].join(" "));
  return haystack.includes(query);
}

function renderCollectionProgress() {
  const grid = document.getElementById("collectionGrid");
  const summary = document.getElementById("collectionSummary");
  if (!grid || !summary || typeof loadCheckins !== "function") return;

  const visited = new Set(loadCheckins().map((item) => item.spotId));
  const definitions = getCollectionDefinitions();
  const progressById = new Map(definitions.map((definition) => [definition.id, getDefinitionProgress(definition, visited)]));
  const completedDefinitions = definitions.filter((definition) => progressById.get(definition.id)?.complete).length;

  summary.textContent = `訪問 ${visited.size}温泉地 / 収録 ${spots.length}温泉地　・　有効コレクション ${definitions.length}種`;
  const visitedMetric = document.getElementById("collectionVisitedMetric");
  const completedMetric = document.getElementById("collectionCompletedMetric");
  const groupsMetric = document.getElementById("collectionGroupsMetric");
  if (visitedMetric) visitedMetric.textContent = String(visited.size);
  if (completedMetric) completedMetric.textContent = `${completedDefinitions}/${definitions.length}`;
  if (groupsMetric) groupsMetric.textContent = String(collectionReadyGroups.length);

  const filtered = definitions.filter((definition) => {
    if (!definitionMatchesCollectionQuery(definition)) return false;
    const progress = progressById.get(definition.id);
    if (collectionProgressFilter === "complete" && !progress?.complete) return false;
    if (collectionProgressFilter === "incomplete" && progress?.complete) return false;
    return true;
  });

  grid.innerHTML = "";
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "collection-empty-state";
    empty.textContent = "条件に一致するコレクションはありません。";
    grid.appendChild(empty);
    return;
  }

  const sectionOrder = [
    "公式・選定コレクション",
    "全国・歴史称号",
    "地域・歴史グループ",
    "地域・温泉郷グループ"
  ];
  const bySection = new Map();
  for (const definition of filtered) {
    const section = definition.section || "その他";
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section).push(definition);
  }

  for (const sectionName of [...sectionOrder, ...[...bySection.keys()].filter((name) => !sectionOrder.includes(name))]) {
    const sectionDefinitions = bySection.get(sectionName);
    if (!sectionDefinitions?.length) continue;

    const section = document.createElement("section");
    section.className = "collection-section";

    const heading = document.createElement("div");
    heading.className = "collection-section-heading";
    const title = document.createElement("h3");
    title.textContent = sectionName;
    const count = document.createElement("span");
    count.textContent = `${sectionDefinitions.length}種`;
    heading.append(title, count);
    section.appendChild(heading);

    const cards = document.createElement("div");
    cards.className = "collection-card-grid";
    for (const definition of sectionDefinitions) {
      cards.appendChild(buildCollectionCard(definition, visited, progressById.get(definition.id)));
    }
    section.appendChild(cards);
    grid.appendChild(section);
  }
}

function buildCollectionCard(definition, visited, progress) {
  const { done, total, percent, complete } = progress || getDefinitionProgress(definition, visited);
  const card = document.createElement("details");
  card.className = `collection-card${complete ? " complete" : ""}`;

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

  if (complete) {
    const completeMark = document.createElement("span");
    completeMark.className = "collection-complete-mark";
    completeMark.textContent = "COMPLETE";
    title.appendChild(completeMark);
  }

  const count = document.createElement("div");
  count.className = "collection-card-count";
  count.textContent = `${done} / ${total}　${percent}%`;

  heading.append(title, count);

  const progressBar = document.createElement("div");
  progressBar.className = "collection-progress";
  const bar = document.createElement("span");
  bar.style.width = `${percent}%`;
  progressBar.appendChild(bar);

  const note = document.createElement("div");
  note.className = "collection-card-note";
  note.textContent = definition.note || "";

  cardSummary.append(heading, progressBar, note);

  if (definition.completionRarity) {
    const reward = document.createElement("div");
    reward.className = "collection-card-reward";
    reward.textContent = `踏破称号 ${definition.completionRarity}`;
    cardSummary.appendChild(reward);
  }

  card.appendChild(cardSummary);

  const list = document.createElement("div");
  list.className = "collection-target-list";

  const sorted = [...(definition.spots || [])].sort((a, b) => {
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
  return card;
}
