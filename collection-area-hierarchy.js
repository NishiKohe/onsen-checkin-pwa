(() => {
  const REGION_ORDER = [
    "北海道", "東北", "関東", "甲信越", "北陸", "東海", "近畿", "中国", "四国", "九州・沖縄"
  ];

  const PREFECTURES_BY_REGION = {
    "北海道": ["北海道"],
    "東北": ["青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"],
    "関東": ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"],
    "甲信越": ["新潟県", "山梨県", "長野県"],
    "北陸": ["富山県", "石川県", "福井県"],
    "東海": ["岐阜県", "静岡県", "愛知県", "三重県"],
    "近畿": ["滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"],
    "中国": ["鳥取県", "島根県", "岡山県", "広島県", "山口県"],
    "四国": ["徳島県", "香川県", "愛媛県", "高知県"],
    "九州・沖縄": ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"]
  };

  const PREF_TO_REGION = new Map();
  const PREF_ALIAS = new Map();
  const registry = new Map();
  let originalGetCollectionDefinitions = null;
  let originalBuildCollectionCard = null;
  let patched = false;

  for (const [region, prefs] of Object.entries(PREFECTURES_BY_REGION)) {
    for (const pref of prefs) {
      PREF_TO_REGION.set(pref, region);
      PREF_ALIAS.set(pref, pref);
      PREF_ALIAS.set(pref.replace(/[都道府県]$/, ""), pref);
    }
  }

  function canonicalPrefecture(value) {
    const raw = String(value || "").normalize("NFKC").trim();
    if (!raw) return "その他";
    return PREF_ALIAS.get(raw) || raw;
  }

  function uniqueSpots(list) {
    const byId = new Map();
    for (const spot of list || []) {
      if (spot?.id) byId.set(spot.id, spot);
    }
    return [...byId.values()];
  }

  function normalizeConfig(config) {
    if (!config?.collectionId) throw new Error("collection hierarchy config requires collectionId");
    return {
      collectionId: String(config.collectionId),
      hierarchyEyebrow: config.hierarchyEyebrow || "AREA TITLES",
      hierarchyTitle: config.hierarchyTitle || "地方・都道府県の制覇",
      hierarchyDescription: config.hierarchyDescription || "地方または都道府県を選ぶと、その範囲だけ表示します。",
      earnedLabel: config.earnedLabel || "獲得称号",
      nationalLabel: config.nationalLabel || "全国",
      noteSuffix: config.noteSuffix || "地方・都道府県単位の制覇称号あり。",
      regionRemainingLabel: config.regionRemainingLabel || ((remaining) => `あと${remaining}件で地方制覇`),
      makeCompletionTitle: config.makeCompletionTitle || ((scopeName, definition) => `${scopeName} ${definition.name}全制覇`),
      progressMode: config.progressMode === "items" ? "items" : "spots",
      getItemsForSpot: typeof config.getItemsForSpot === "function" ? config.getItemsForSpot : null,
      itemEyebrow: config.itemEyebrow || "TARGETS",
      itemTitle: config.itemTitle || "個別対象",
      itemDescription: config.itemDescription || "対象をタップすると対応地点を地図で開きます。",
      itemCountSuffix: config.itemCountSuffix || "件",
      hideSourceTargets: config.hideSourceTargets === true
    };
  }

  function getConfig(collectionId) {
    return registry.get(String(collectionId || "")) || null;
  }

  function itemsForSpot(spot, config) {
    if (!config?.getItemsForSpot) return [];
    const raw = config.getItemsForSpot(spot);
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item, index) => {
        if (typeof item === "string") {
          const label = item.trim();
          return label ? {
            id: `${spot.id}:${label}`,
            spotId: spot.id,
            primary: label,
            secondary: spot.name,
            prefecture: canonicalPrefecture(spot.prefecture)
          } : null;
        }
        if (!item || typeof item !== "object") return null;
        return {
          id: String(item.id || `${spot.id}:item:${index}`),
          spotId: spot.id,
          primary: String(item.primary || item.name || spot.name || "対象"),
          secondary: String(item.secondary || spot.name || ""),
          prefecture: String(item.prefecture || canonicalPrefecture(spot.prefecture))
        };
      })
      .filter(Boolean);
  }

  function progressForSpots(spotsForScope, visited, config) {
    const scopeSpots = uniqueSpots(spotsForScope);
    if (config?.progressMode === "items" && config.getItemsForSpot) {
      let total = 0;
      let done = 0;
      for (const spot of scopeSpots) {
        const count = itemsForSpot(spot, config).length;
        total += count;
        if (visited.has(spot.id)) done += count;
      }
      return {
        total,
        done,
        percent: total ? Math.round(done / total * 100) : 0,
        complete: total > 0 && done === total
      };
    }

    const total = scopeSpots.length;
    const done = scopeSpots.filter((spot) => visited.has(spot.id)).length;
    return {
      total,
      done,
      percent: total ? Math.round(done / total * 100) : 0,
      complete: total > 0 && done === total
    };
  }

  function makeHierarchy(definition, config) {
    const byRegion = new Map();
    for (const spot of uniqueSpots(definition.spots || [])) {
      const pref = canonicalPrefecture(spot.prefecture);
      const region = PREF_TO_REGION.get(pref) || "その他";
      if (!byRegion.has(region)) byRegion.set(region, new Map());
      const byPref = byRegion.get(region);
      if (!byPref.has(pref)) byPref.set(pref, []);
      byPref.get(pref).push(spot);
    }

    const order = [...REGION_ORDER, ...[...byRegion.keys()].filter((name) => !REGION_ORDER.includes(name))];
    return order
      .filter((region) => byRegion.has(region))
      .map((region) => {
        const byPref = byRegion.get(region);
        const prefOrder = PREFECTURES_BY_REGION[region] || [...byPref.keys()];
        const prefectures = [...prefOrder, ...[...byPref.keys()].filter((name) => !prefOrder.includes(name))]
          .filter((pref) => byPref.has(pref))
          .map((pref) => ({
            id: `${definition.id}:pref:${pref}`,
            name: pref,
            title: config.makeCompletionTitle(pref, definition, "prefecture"),
            spots: uniqueSpots(byPref.get(pref))
          }));

        return {
          id: `${definition.id}:region:${region}`,
          name: region,
          title: config.makeCompletionTitle(region, definition, "region"),
          spots: uniqueSpots(prefectures.flatMap((item) => item.spots)),
          prefectures
        };
      });
  }

  function enhanceDefinition(definition) {
    const config = getConfig(definition?.id);
    if (!config) return definition;
    definition.areaHierarchyConfig = config;
    definition.areaHierarchy = makeHierarchy(definition, config);
    if (config.noteSuffix && !String(definition.note || "").includes(config.noteSuffix)) {
      definition.note = `${definition.note || ""}${definition.note ? "。" : ""}${config.noteSuffix}`;
    }
    return definition;
  }

  function buildAreaButton(group, definition, visited, config, kind) {
    const progress = progressForSpots(group.spots, visited, config);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `collection-area-chip collection-area-${kind}${progress.complete ? " complete" : ""}`;
    button.dataset.scopeIds = (group.spots || []).map((spot) => spot.id).join(",");
    button.dataset.scopeName = group.name;
    button.dataset.scopeTitle = group.title;

    const label = document.createElement("span");
    label.className = "collection-area-chip-label";
    label.textContent = group.name;

    const count = document.createElement("strong");
    count.textContent = `${progress.done}/${progress.total}`;

    const state = document.createElement("em");
    state.textContent = progress.complete ? "COMPLETE" : `${progress.percent}%`;

    button.append(label, count, state);
    button.setAttribute(
      "aria-label",
      progress.complete
        ? `${group.title} 達成済み。${progress.done}/${progress.total}`
        : `${group.name} ${progress.done}/${progress.total}`
    );
    return button;
  }

  function openSpotOnMap(spot) {
    if (!spot) return;
    if (window.OnsenAppShell?.show) window.OnsenAppShell.show("map");
    else if (typeof setCollectionAppTab === "function") setCollectionAppTab("map");

    try {
      if (typeof selectSpot === "function") selectSpot(spot.id);
    } catch {}
    try {
      if (typeof map !== "undefined" && map && Number.isFinite(spot.lng) && Number.isFinite(spot.lat)) {
        map.flyTo({ center: [spot.lng, spot.lat], zoom: Math.max(map.getZoom?.() || 10, 10) });
      }
    } catch {}
  }

  function buildItemPanel(definition, visited, config) {
    if (!config.getItemsForSpot) return null;

    const panel = document.createElement("div");
    panel.className = "collection-area-item-panel";

    const heading = document.createElement("div");
    heading.className = "collection-area-item-heading";
    const headingText = document.createElement("div");
    const allItems = (definition.spots || []).flatMap((spot) => itemsForSpot(spot, config));
    headingText.innerHTML = `<span>${escapeHtml(config.itemEyebrow)}</span><strong>${escapeHtml(config.itemTitle)}</strong><p>${escapeHtml(config.itemDescription)}</p>`;
    const count = document.createElement("b");
    count.className = "collection-area-item-count";
    count.textContent = `${allItems.length}${config.itemCountSuffix}`;
    heading.append(headingText, count);
    panel.appendChild(heading);

    const list = document.createElement("div");
    list.className = "collection-area-item-list";

    const sortedSpots = [...(definition.spots || [])].sort((a, b) => {
      const ap = canonicalPrefecture(a.prefecture);
      const bp = canonicalPrefecture(b.prefecture);
      return ap.localeCompare(bp, "ja") || String(a.name).localeCompare(String(b.name), "ja");
    });

    for (const spot of sortedSpots) {
      for (const item of itemsForSpot(spot, config)) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = `collection-area-item-row ${visited.has(spot.id) ? "visited" : "unvisited"}`;
        row.dataset.spotId = spot.id;
        row.dataset.itemId = item.id;

        const mark = document.createElement("span");
        mark.className = "collection-area-item-mark";
        mark.textContent = visited.has(spot.id) ? "✓" : "○";

        const main = document.createElement("span");
        main.className = "collection-area-item-main";
        const primary = document.createElement("strong");
        primary.textContent = item.primary;
        const secondary = document.createElement("small");
        secondary.textContent = item.secondary;
        main.append(primary, secondary);

        const pref = document.createElement("span");
        pref.className = "collection-area-item-pref";
        pref.textContent = item.prefecture;

        row.append(mark, main, pref);
        row.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          openSpotOnMap(spot);
        });
        list.appendChild(row);
      }
    }

    panel.appendChild(list);
    return {
      panel,
      rows: [...list.querySelectorAll(".collection-area-item-row")],
      count,
      allItems
    };
  }

  function enhanceCard(card, definition, visited) {
    const config = definition?.areaHierarchyConfig || getConfig(definition?.id);
    const hierarchy = definition?.areaHierarchy || (config ? makeHierarchy(definition, config) : []);
    if (!card || !config || !hierarchy.length || card.dataset.areaHierarchyReady === "1") return card;

    const targetList = card.querySelector(".collection-target-list");
    if (!targetList) return card;
    card.dataset.areaHierarchyReady = "1";
    card.dataset.collectionId = definition.id;

    const panel = document.createElement("div");
    panel.className = "collection-area-hierarchy";
    panel.dataset.collectionId = definition.id;

    const head = document.createElement("div");
    head.className = "collection-area-head";
    const headText = document.createElement("div");
    headText.innerHTML = `<span>${escapeHtml(config.hierarchyEyebrow)}</span><strong>${escapeHtml(config.hierarchyTitle)}</strong><p>${escapeHtml(config.hierarchyDescription)}</p>`;
    const earned = document.createElement("div");
    earned.className = "collection-area-earned-count";

    const allGroups = hierarchy.flatMap((region) => [region, ...region.prefectures]);
    const completeGroups = allGroups.filter((group) => progressForSpots(group.spots, visited, config).complete);
    earned.innerHTML = `<span>${escapeHtml(config.earnedLabel)}</span><b>${completeGroups.length}/${allGroups.length}</b>`;
    head.append(headText, earned);
    panel.appendChild(head);

    const scopeBar = document.createElement("div");
    scopeBar.className = "collection-area-scope-bar";
    const scopeLabel = document.createElement("span");
    scopeLabel.textContent = "表示範囲";
    const scopeValue = document.createElement("strong");
    const nationalProgress = progressForSpots(definition.spots, visited, config);
    scopeValue.textContent = `${config.nationalLabel} ${nationalProgress.done}/${nationalProgress.total}`;
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "collection-area-scope-reset active";
    reset.textContent = config.nationalLabel;
    scopeBar.append(scopeLabel, scopeValue, reset);
    panel.appendChild(scopeBar);

    const regionList = document.createElement("div");
    regionList.className = "collection-area-region-list";

    for (const region of hierarchy) {
      const regionProgress = progressForSpots(region.spots, visited, config);
      const regionBox = document.createElement("section");
      regionBox.className = `collection-area-region-box${regionProgress.complete ? " complete" : ""}`;

      const regionTop = document.createElement("div");
      regionTop.className = "collection-area-region-top";
      const regionButton = buildAreaButton(region, definition, visited, config, "region");
      const title = document.createElement("div");
      title.className = "collection-area-title-state";
      title.textContent = regionProgress.complete
        ? `🏆 ${region.title}`
        : config.regionRemainingLabel(regionProgress.total - regionProgress.done, region, definition);
      regionTop.append(regionButton, title);
      regionBox.appendChild(regionTop);

      if (!(region.name === "北海道" && region.prefectures.length === 1 && region.prefectures[0].name === "北海道")) {
        const prefs = document.createElement("div");
        prefs.className = "collection-area-pref-grid";
        for (const pref of region.prefectures) {
          const prefWrap = document.createElement("div");
          prefWrap.className = "collection-area-pref-wrap";
          const prefButton = buildAreaButton(pref, definition, visited, config, "pref");
          const prefProgress = progressForSpots(pref.spots, visited, config);
          prefWrap.appendChild(prefButton);
          if (prefProgress.complete) {
            const badge = document.createElement("span");
            badge.className = "collection-area-pref-title";
            badge.textContent = `称号獲得：${pref.title}`;
            prefWrap.appendChild(badge);
          }
          prefs.appendChild(prefWrap);
        }
        regionBox.appendChild(prefs);
      }
      regionList.appendChild(regionBox);
    }

    panel.appendChild(regionList);
    const itemUi = buildItemPanel(definition, visited, config);
    if (itemUi) panel.appendChild(itemUi.panel);
    targetList.insertAdjacentElement("beforebegin", panel);

    const targetRows = [...targetList.querySelectorAll(".collection-target[data-spot-id]")];
    if (config.hideSourceTargets && itemUi?.rows.length) targetList.classList.add("collection-area-source-target-list");
    const allScopeButtons = () => [...panel.querySelectorAll(".collection-area-chip"), reset];

    function applyScope(ids, name, scrollToTargets = false) {
      const allowed = ids ? new Set(ids) : null;
      for (const row of targetRows) row.hidden = !!allowed && !allowed.has(row.dataset.spotId);
      for (const row of itemUi?.rows || []) row.hidden = !!allowed && !allowed.has(row.dataset.spotId);
      for (const button of allScopeButtons()) button.classList.remove("active");
      if (!allowed) reset.classList.add("active");

      const scopeSpots = allowed
        ? (definition.spots || []).filter((spot) => allowed.has(spot.id))
        : definition.spots || [];
      const progress = progressForSpots(scopeSpots, visited, config);
      scopeValue.textContent = `${allowed ? name : config.nationalLabel} ${progress.done}/${progress.total}`;

      if (itemUi) {
        const visible = itemUi.rows.filter((row) => !row.hidden).length;
        itemUi.count.textContent = `${visible}${config.itemCountSuffix}`;
      }

      if (scrollToTargets) {
        const destination = itemUi?.panel || targetList;
        setTimeout(() => destination.scrollIntoView?.({ behavior: "smooth", block: "nearest" }), 0);
      }
    }

    reset.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      applyScope(null, config.nationalLabel, true);
    });

    for (const button of panel.querySelectorAll(".collection-area-chip")) {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const ids = String(button.dataset.scopeIds || "").split(",").filter(Boolean);
        applyScope(ids, button.dataset.scopeName || "エリア", true);
        for (const other of allScopeButtons()) other.classList.remove("active");
        button.classList.add("active");
      });
    }

    return card;
  }

  function specializedProgress(definition, visited, fallbackProgress) {
    const config = definition?.areaHierarchyConfig || getConfig(definition?.id);
    if (!config || config.progressMode !== "items") return fallbackProgress;
    return progressForSpots(definition.spots, visited, config);
  }

  function installPatch() {
    if (patched) return true;
    if (typeof getCollectionDefinitions !== "function" || typeof buildCollectionCard !== "function") return false;

    originalGetCollectionDefinitions = getCollectionDefinitions;
    originalBuildCollectionCard = buildCollectionCard;

    const enhancedGetDefinitions = function enhancedGetDefinitions() {
      return originalGetCollectionDefinitions().map(enhanceDefinition);
    };

    const enhancedBuildCard = function enhancedBuildCard(definition, visited, progress) {
      const effectiveProgress = specializedProgress(definition, visited, progress);
      const card = originalBuildCollectionCard(definition, visited, effectiveProgress);
      if (getConfig(definition?.id)) enhanceCard(card, definition, visited);
      return card;
    };

    try { getCollectionDefinitions = enhancedGetDefinitions; } catch {}
    try { buildCollectionCard = enhancedBuildCard; } catch {}
    window.getCollectionDefinitions = enhancedGetDefinitions;
    window.buildCollectionCard = enhancedBuildCard;
    patched = true;
    return true;
  }

  function refreshCollection() {
    if (!installPatch()) return;
    try { renderCollectionProgress?.(); } catch {}
    try { window.OnsenAppShell?.refresh?.(); } catch {}
  }

  function register(config) {
    const normalized = normalizeConfig(config);
    registry.set(normalized.collectionId, normalized);
    refreshCollection();
    return normalized;
  }

  window.CollectionAreaHierarchy = {
    register,
    getConfig,
    canonicalPrefecture,
    getRegionForPrefecture: (pref) => PREF_TO_REGION.get(canonicalPrefecture(pref)) || "その他",
    regions: [...REGION_ORDER],
    prefecturesByRegion: JSON.parse(JSON.stringify(PREFECTURES_BY_REGION)),
    refresh: refreshCollection
  };

  let tries = 0;
  const timer = setInterval(() => {
    if (installPatch() || ++tries > 200) clearInterval(timer);
  }, 50);
  installPatch();
})();

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'\"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  }[char]));
}
