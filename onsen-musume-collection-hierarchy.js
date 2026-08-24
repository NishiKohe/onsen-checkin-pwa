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
  for (const [region, prefs] of Object.entries(PREFECTURES_BY_REGION)) {
    for (const pref of prefs) {
      PREF_TO_REGION.set(pref, region);
      PREF_ALIAS.set(pref, pref);
      PREF_ALIAS.set(pref.replace(/[都道府県]$/, ""), pref);
    }
  }

  let originalGetCollectionDefinitions = null;
  let originalBuildCollectionCard = null;
  let patched = false;

  function canonicalPrefecture(value) {
    const raw = String(value || "").normalize("NFKC").trim();
    if (!raw) return "その他";
    return PREF_ALIAS.get(raw) || raw;
  }

  function uniqueSpots(list) {
    const map = new Map();
    for (const spot of list || []) {
      if (spot?.id) map.set(spot.id, spot);
    }
    return [...map.values()];
  }

  function characterNamesForSpot(spot) {
    return [...new Set((spot?.onsenMusumeCharacters || []).filter(Boolean).map((name) => String(name).trim()))];
  }

  function makeHierarchy(spotsForDefinition) {
    const byRegion = new Map();
    for (const spot of uniqueSpots(spotsForDefinition)) {
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
            id: `onsen_musume_pref_${pref}`,
            name: pref,
            title: `${pref} 温泉むすめ全制覇`,
            spots: uniqueSpots(byPref.get(pref))
          }));
        return {
          id: `onsen_musume_region_${region}`,
          name: region,
          title: `${region} 温泉むすめ全制覇`,
          spots: uniqueSpots(prefectures.flatMap((item) => item.spots)),
          prefectures
        };
      });
  }

  function progressFor(group, visited) {
    const total = group?.spots?.length || 0;
    const done = (group?.spots || []).filter((spot) => visited.has(spot.id)).length;
    return {
      total,
      done,
      percent: total ? Math.round(done / total * 100) : 0,
      complete: total > 0 && done === total
    };
  }

  function enhanceDefinition(definition) {
    if (definition?.id !== "onsen_musume") return definition;
    definition.onsenMusumeHierarchy = makeHierarchy(definition.spots || []);
    definition.note = `${definition.note || "温泉むすめ公式キャラクター対応温泉地"}。地方・都道府県単位の制覇称号あり。`;
    return definition;
  }

  function buildAreaButton(group, visited, kind) {
    const progress = progressFor(group, visited);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `musume-area-chip musume-${kind}${progress.complete ? " complete" : ""}`;
    button.dataset.scopeIds = (group.spots || []).map((spot) => spot.id).join(",");
    button.dataset.scopeName = group.name;
    button.dataset.scopeTitle = group.title;

    const label = document.createElement("span");
    label.className = "musume-area-chip-label";
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

  function buildCharacterPanel(definition, visited, targetList) {
    const panel = document.createElement("div");
    panel.className = "musume-character-panel";

    const heading = document.createElement("div");
    heading.className = "musume-character-heading";
    const headingText = document.createElement("div");
    const allCharacters = (definition.spots || []).flatMap(characterNamesForSpot);
    headingText.innerHTML = `<span>CHARACTERS</span><strong>個別温泉むすめ</strong><p>キャラをタップすると対応する温泉地を地図で開きます。</p>`;
    const count = document.createElement("b");
    count.className = "musume-character-count";
    count.textContent = `${allCharacters.length}人`;
    heading.append(headingText, count);
    panel.appendChild(heading);

    const list = document.createElement("div");
    list.className = "musume-character-list";

    const sortedSpots = [...(definition.spots || [])].sort((a, b) => {
      const ap = canonicalPrefecture(a.prefecture);
      const bp = canonicalPrefecture(b.prefecture);
      return ap.localeCompare(bp, "ja") || String(a.name).localeCompare(String(b.name), "ja");
    });

    for (const spot of sortedSpots) {
      const characters = characterNamesForSpot(spot);
      for (const character of characters) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = `musume-character-row ${visited.has(spot.id) ? "visited" : "unvisited"}`;
        row.dataset.spotId = spot.id;

        const mark = document.createElement("span");
        mark.className = "musume-character-mark";
        mark.textContent = visited.has(spot.id) ? "✓" : "○";

        const main = document.createElement("span");
        main.className = "musume-character-main";
        const name = document.createElement("strong");
        name.textContent = character;
        const place = document.createElement("small");
        place.textContent = spot.name;
        main.append(name, place);

        const pref = document.createElement("span");
        pref.className = "musume-character-pref";
        pref.textContent = canonicalPrefecture(spot.prefecture);

        row.append(mark, main, pref);
        row.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const sourceRow = targetList.querySelector(`.collection-target[data-spot-id="${CSS.escape(spot.id)}"]`);
          if (sourceRow) {
            sourceRow.click();
            return;
          }
          if (typeof setCollectionAppTab === "function") setCollectionAppTab("map");
          if (typeof selectSpot === "function") selectSpot(spot.id);
          if (typeof map !== "undefined" && map && Number.isFinite(spot.lng) && Number.isFinite(spot.lat)) {
            map.flyTo({ center: [spot.lng, spot.lat], zoom: Math.max(map.getZoom(), 10) });
          }
        });
        list.appendChild(row);
      }
    }

    panel.appendChild(list);
    return { panel, rows: [...list.querySelectorAll(".musume-character-row")], count };
  }

  function enhanceOnsenMusumeCard(card, definition, visited) {
    if (!card || card.dataset.musumeHierarchyReady === "1") return card;
    const hierarchy = definition.onsenMusumeHierarchy || makeHierarchy(definition.spots || []);
    const targetList = card.querySelector(".collection-target-list");
    if (!targetList || !hierarchy.length) return card;

    card.dataset.musumeHierarchyReady = "1";

    const panel = document.createElement("div");
    panel.className = "musume-hierarchy";

    const head = document.createElement("div");
    head.className = "musume-hierarchy-head";
    const headText = document.createElement("div");
    headText.innerHTML = `<span>AREA TITLES</span><strong>地方・都道府県の制覇</strong><p>地方または都道府県を選ぶと、個別温泉むすめをその範囲だけ表示します。</p>`;
    const earned = document.createElement("div");
    earned.className = "musume-earned-count";

    const allGroups = hierarchy.flatMap((region) => [region, ...region.prefectures]);
    const completeGroups = allGroups.filter((group) => progressFor(group, visited).complete);
    earned.innerHTML = `<span>獲得称号</span><b>${completeGroups.length}/${allGroups.length}</b>`;
    head.append(headText, earned);
    panel.appendChild(head);

    const scopeBar = document.createElement("div");
    scopeBar.className = "musume-scope-bar";
    const scopeLabel = document.createElement("span");
    scopeLabel.textContent = "表示範囲";
    const scopeValue = document.createElement("strong");
    scopeValue.textContent = `全国 ${progressFor({ spots: definition.spots }, visited).done}/${definition.spots.length}`;
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "musume-scope-reset active";
    reset.textContent = "全国";
    scopeBar.append(scopeLabel, scopeValue, reset);
    panel.appendChild(scopeBar);

    const regionList = document.createElement("div");
    regionList.className = "musume-region-list";

    for (const region of hierarchy) {
      const regionProgress = progressFor(region, visited);
      const regionBox = document.createElement("section");
      regionBox.className = `musume-region-box${regionProgress.complete ? " complete" : ""}`;

      const regionTop = document.createElement("div");
      regionTop.className = "musume-region-top";
      const regionButton = buildAreaButton(region, visited, "region");
      const title = document.createElement("div");
      title.className = "musume-title-state";
      title.textContent = regionProgress.complete ? `🏆 ${region.title}` : `あと${regionProgress.total - regionProgress.done}湯で地方制覇`;
      regionTop.append(regionButton, title);
      regionBox.appendChild(regionTop);

      if (!(region.name === "北海道" && region.prefectures.length === 1 && region.prefectures[0].name === "北海道")) {
        const prefs = document.createElement("div");
        prefs.className = "musume-pref-grid";
        for (const pref of region.prefectures) {
          const prefWrap = document.createElement("div");
          prefWrap.className = "musume-pref-wrap";
          const prefButton = buildAreaButton(pref, visited, "pref");
          const prefProgress = progressFor(pref, visited);
          prefWrap.appendChild(prefButton);
          if (prefProgress.complete) {
            const badge = document.createElement("span");
            badge.className = "musume-pref-title";
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

    const characterUi = buildCharacterPanel(definition, visited, targetList);
    panel.appendChild(characterUi.panel);
    targetList.insertAdjacentElement("beforebegin", panel);

    const rows = [...targetList.querySelectorAll(".collection-target[data-spot-id]")];
    if (characterUi.rows.length) targetList.classList.add("musume-source-target-list");
    const allScopeButtons = () => [...panel.querySelectorAll(".musume-area-chip"), reset];

    function applyScope(ids, name, scrollToCharacters = false) {
      const allowed = ids ? new Set(ids) : null;
      for (const row of rows) row.hidden = !!allowed && !allowed.has(row.dataset.spotId);
      for (const row of characterUi.rows) row.hidden = !!allowed && !allowed.has(row.dataset.spotId);
      for (const button of allScopeButtons()) button.classList.remove("active");
      if (!allowed) reset.classList.add("active");

      if (!allowed) {
        const p = progressFor({ spots: definition.spots }, visited);
        scopeValue.textContent = `全国 ${p.done}/${p.total}`;
      } else {
        const scopeSpots = definition.spots.filter((spot) => allowed.has(spot.id));
        const p = progressFor({ spots: scopeSpots }, visited);
        scopeValue.textContent = `${name} ${p.done}/${p.total}`;
      }

      const visibleCharacters = characterUi.rows.filter((row) => !row.hidden).length;
      characterUi.count.textContent = `${visibleCharacters}人`;
      if (scrollToCharacters) {
        setTimeout(() => characterUi.panel.scrollIntoView({ behavior: "smooth", block: "nearest" }), 0);
      }
    }

    reset.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      applyScope(null, "全国", true);
    });

    for (const button of panel.querySelectorAll(".musume-area-chip")) {
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

  function installPatch() {
    if (patched) return true;
    if (typeof getCollectionDefinitions !== "function" || typeof buildCollectionCard !== "function") return false;

    originalGetCollectionDefinitions = getCollectionDefinitions;
    originalBuildCollectionCard = buildCollectionCard;

    const enhancedGetDefinitions = function enhancedGetDefinitions() {
      return originalGetCollectionDefinitions().map(enhanceDefinition);
    };

    const enhancedBuildCard = function enhancedBuildCard(definition, visited, progress) {
      const card = originalBuildCollectionCard(definition, visited, progress);
      if (definition?.id === "onsen_musume") enhanceOnsenMusumeCard(card, definition, visited);
      return card;
    };

    try { getCollectionDefinitions = enhancedGetDefinitions; } catch {}
    try { buildCollectionCard = enhancedBuildCard; } catch {}
    window.getCollectionDefinitions = enhancedGetDefinitions;
    window.buildCollectionCard = enhancedBuildCard;
    patched = true;

    if (typeof renderCollectionProgress === "function") renderCollectionProgress();
    return true;
  }

  let tries = 0;
  const timer = setInterval(() => {
    if (installPatch() || ++tries > 200) clearInterval(timer);
  }, 50);
  installPatch();
})();
