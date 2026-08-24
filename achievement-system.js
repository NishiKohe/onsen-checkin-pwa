(() => {
  const STATE_KEY = "achievementStateV1";
  const STATE_VERSION = 1;
  const RARITY_ORDER = { N: 0, R: 1, SR: 2, SSR: 3, LEGEND: 4 };
  const VISIT_MILESTONES = [
    { count: 1, id: "visit_001", name: "はじめの一湯", title: "湯めぐり見習い", rarity: "N" },
    { count: 10, id: "visit_010", name: "十湯十色", title: "湯巡り人", rarity: "R" },
    { count: 25, id: "visit_025", name: "二十五湯紀行", title: "温泉行脚人", rarity: "R" },
    { count: 50, id: "visit_050", name: "五十湯踏破", title: "湯治場の旅人", rarity: "SR" },
    { count: 100, id: "visit_100", name: "百湯巡礼", title: "百湯巡礼者", rarity: "SSR" },
    { count: 200, id: "visit_200", name: "二百湯踏破", title: "列島湯巡り人", rarity: "LEGEND" }
  ];

  let initialized = false;
  let originalSaveCheckins = null;
  let currentMode = "collection";
  let currentFilter = "all";
  let evaluationTimer = null;
  let definitionCache = [];

  function safeJson(value, fallback) {
    try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
  }

  function loadState() {
    const raw = localStorage.getItem(STATE_KEY);
    const parsed = safeJson(raw, {});
    return {
      version: STATE_VERSION,
      initializedAt: Number(parsed.initializedAt || 0) || null,
      updatedAt: Number(parsed.updatedAt || 0) || null,
      equippedTitleId: parsed.equippedTitleId || null,
      unlocks: parsed.unlocks && typeof parsed.unlocks === "object" ? parsed.unlocks : {},
      unreadIds: Array.isArray(parsed.unreadIds) ? [...new Set(parsed.unreadIds)] : []
    };
  }

  function saveState(state) {
    state.version = STATE_VERSION;
    state.updatedAt = Date.now();
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  function uniqueCheckins(list, onsiteOnly = false) {
    const earliest = new Map();
    for (const item of list || []) {
      if (!item?.spotId) continue;
      if (onsiteOnly && item.verificationLevel !== "onsite") continue;
      const at = Number(item.checkedAt || item.verifiedAt || item.recordedAt || Date.now());
      const existing = earliest.get(item.spotId);
      if (!existing || at < existing.at) earliest.set(item.spotId, { item, at });
    }
    return earliest;
  }

  function normalizedRarity(value, fallback = "R") {
    const rarity = String(value || fallback).toUpperCase();
    return Object.prototype.hasOwnProperty.call(RARITY_ORDER, rarity) ? rarity : fallback;
  }

  function titleForCollection(definition) {
    if (definition.id === "onsen_musume") return "全国温泉むすめ巡礼者";
    const name = String(definition.name || "コレクション");
    if (/三湯|三名湯|七湯|八湯|十一湯|十七湯|五湯/.test(name)) return `${name}踏破者`;
    return `${name}制覇者`;
  }

  function compactPrefecture(name) {
    return String(name || "").replace(/[都道府県]$/, "");
  }

  function equipTitleForArea(scopeName, definition, level) {
    if (definition.id === "onsen_musume") {
      return level === "region"
        ? `${scopeName}温泉むすめ巡礼者`
        : `${compactPrefecture(scopeName)}・温泉むすめ巡礼者`;
    }
    return `${scopeName}${definition.name}制覇者`;
  }

  function buildAreaHierarchy(definition, config) {
    const api = window.CollectionAreaHierarchy;
    if (!api || !config) return [];
    const byRegion = new Map();
    for (const spot of definition.spots || []) {
      if (!spot?.id) continue;
      const pref = api.canonicalPrefecture(spot.prefecture);
      const region = api.getRegionForPrefecture(pref) || "その他";
      if (!byRegion.has(region)) byRegion.set(region, new Map());
      const byPref = byRegion.get(region);
      if (!byPref.has(pref)) byPref.set(pref, []);
      byPref.get(pref).push(spot);
    }

    const regionOrder = [...api.regions, ...[...byRegion.keys()].filter((name) => !api.regions.includes(name))];
    return regionOrder.filter((region) => byRegion.has(region)).map((region) => {
      const byPref = byRegion.get(region);
      const prefOrder = api.prefecturesByRegion[region] || [...byPref.keys()];
      const prefectures = [...prefOrder, ...[...byPref.keys()].filter((name) => !prefOrder.includes(name))]
        .filter((pref) => byPref.has(pref))
        .map((pref) => ({ name: pref, spots: uniqueSpots(byPref.get(pref)) }));
      return {
        name: region,
        spots: uniqueSpots(prefectures.flatMap((entry) => entry.spots)),
        prefectures
      };
    });
  }

  function uniqueSpots(list) {
    const byId = new Map();
    for (const spot of list || []) if (spot?.id) byId.set(spot.id, spot);
    return [...byId.values()];
  }

  function itemWeightForSpot(spot, config) {
    if (config?.progressMode !== "items" || typeof config.getItemsForSpot !== "function") return 1;
    const items = config.getItemsForSpot(spot);
    return Array.isArray(items) ? Math.max(0, items.length) : 0;
  }

  function totalRequirementForSpots(list, config) {
    return uniqueSpots(list).reduce((sum, spot) => sum + itemWeightForSpot(spot, config), 0);
  }

  function minimumPrefectureRequirement(definition) {
    return ["national_recreation_spa", "meito_hyakusen"].includes(definition?.id) ? 2 : 1;
  }

  function spotRequirementAchievement({ id, category, name, description, title, rarity, spots, config = null, verification = "any", kind = "collection", scope = null }) {
    const unique = uniqueSpots(spots);
    const weights = {};
    let total = 0;
    for (const spot of unique) {
      const weight = itemWeightForSpot(spot, config);
      weights[spot.id] = weight;
      total += weight;
    }
    return {
      id,
      category,
      kind,
      scope,
      name,
      description,
      titleId: `title:${id}`,
      titleLabel: title,
      rarity: normalizedRarity(rarity),
      verification,
      requiredSpotIds: unique.map((spot) => spot.id),
      weights,
      total
    };
  }

  function getCollectionDefinitionsSafe() {
    try {
      const list = window.getCollectionDefinitions?.() || (typeof getCollectionDefinitions === "function" ? getCollectionDefinitions() : []);
      return Array.isArray(list) ? list : [];
    } catch (err) {
      console.warn("achievement collection definition load failed", err);
      return [];
    }
  }

  function buildDefinitions() {
    const definitions = [];

    for (const milestone of VISIT_MILESTONES) {
      definitions.push({
        id: milestone.id,
        category: "旅の軌跡",
        kind: "visit_count",
        name: milestone.name,
        description: `異なる温泉地を${milestone.count}湯訪問する`,
        titleId: `title:${milestone.id}`,
        titleLabel: milestone.title,
        rarity: milestone.rarity,
        verification: "any",
        visitCount: milestone.count,
        total: milestone.count
      });
    }

    const collections = getCollectionDefinitionsSafe();
    for (const definition of collections) {
      const targets = uniqueSpots(definition.spots || []);
      if (targets.length < 2) continue;
      definitions.push(spotRequirementAchievement({
        id: `collection:${definition.id}`,
        category: "コレクション",
        kind: "collection",
        name: `${definition.name} コンプリート`,
        description: `${definition.name}の対象温泉地をすべて訪問する`,
        title: titleForCollection(definition),
        rarity: definition.rarity || "R",
        spots: targets,
        config: window.CollectionAreaHierarchy?.getConfig?.(definition.id) || null,
        scope: definition.id
      }));

      const config = window.CollectionAreaHierarchy?.getConfig?.(definition.id);
      if (!config) continue;
      const hierarchy = buildAreaHierarchy(definition, config);
      for (const region of hierarchy) {
        definitions.push(spotRequirementAchievement({
          id: `area:${definition.id}:region:${region.name}`,
          category: "地域制覇",
          kind: "area_region",
          name: `${region.name} ${definition.name}全制覇`,
          description: `${region.name}の${definition.name}対象をすべて達成する`,
          title: equipTitleForArea(region.name, definition, "region"),
          rarity: "SR",
          spots: region.spots,
          config,
          scope: { collectionId: definition.id, level: "region", name: region.name }
        }));
        for (const pref of region.prefectures) {
          if (totalRequirementForSpots(pref.spots, config) < minimumPrefectureRequirement(definition)) continue;
          definitions.push(spotRequirementAchievement({
            id: `area:${definition.id}:pref:${pref.name}`,
            category: "地域制覇",
            kind: "area_prefecture",
            name: `${pref.name} ${definition.name}全制覇`,
            description: `${pref.name}の${definition.name}対象をすべて達成する`,
            title: equipTitleForArea(pref.name, definition, "prefecture"),
            rarity: "R",
            spots: pref.spots,
            config,
            scope: { collectionId: definition.id, level: "prefecture", name: pref.name }
          }));
        }
      }
    }

    const byId = new Map();
    for (const item of definitions) if (item?.id) byId.set(item.id, item);
    return [...byId.values()];
  }

  function evaluateDefinition(definition, checkins) {
    const onsiteOnly = definition.verification === "onsite";
    const earliest = uniqueCheckins(checkins, onsiteOnly);

    if (definition.kind === "visit_count") {
      const times = [...earliest.values()].map((entry) => entry.at).sort((a, b) => a - b);
      const done = Math.min(times.length, definition.visitCount);
      return {
        done,
        total: definition.visitCount,
        complete: times.length >= definition.visitCount,
        completedAt: times.length >= definition.visitCount ? times[definition.visitCount - 1] : null
      };
    }

    let done = 0;
    let total = 0;
    let completedAt = 0;
    let complete = true;
    for (const spotId of definition.requiredSpotIds || []) {
      const weight = Math.max(0, Number(definition.weights?.[spotId] ?? 1));
      total += weight;
      const entry = earliest.get(spotId);
      if (entry) {
        done += weight;
        completedAt = Math.max(completedAt, entry.at);
      } else {
        complete = false;
      }
    }
    if (!total) complete = false;
    return { done, total, complete, completedAt: complete ? completedAt || Date.now() : null };
  }

  function reconcileUnlocks({ markUnread = true } = {}) {
    if (typeof loadCheckins !== "function") return null;
    const checkins = loadCheckins();
    const definitions = buildDefinitions();
    definitionCache = definitions;
    const state = loadState();
    const firstInitialization = !state.initializedAt;
    let changed = false;
    const now = Date.now();

    for (const definition of definitions) {
      const progress = evaluateDefinition(definition, checkins);
      if (!progress.complete || state.unlocks[definition.id]) continue;
      state.unlocks[definition.id] = {
        achievementId: definition.id,
        achievementName: definition.name,
        titleId: definition.titleId,
        titleLabel: definition.titleLabel,
        rarity: definition.rarity,
        unlockedAt: Number(progress.completedAt || now),
        recognizedAt: now,
        verification: definition.verification || "any"
      };
      if (!firstInitialization && markUnread) state.unreadIds.push(definition.id);
      changed = true;
    }

    if (firstInitialization) {
      state.initializedAt = now;
      state.unreadIds = [];
      changed = true;
    }
    state.unreadIds = [...new Set(state.unreadIds)].filter((id) => !!state.unlocks[id]);

    if (state.equippedTitleId) {
      const stillOwned = Object.values(state.unlocks).some((record) => record.titleId === state.equippedTitleId);
      if (!stillOwned) {
        state.equippedTitleId = null;
        changed = true;
      }
    }

    if (changed) saveState(state);
    syncTitleDisplay(state, definitions);
    return { state, definitions, checkins };
  }

  function findTitleRecord(titleId, state, definitions) {
    if (!titleId) return null;
    const definition = definitions.find((item) => item.titleId === titleId);
    if (definition) return {
      id: titleId,
      label: definition.titleLabel,
      rarity: definition.rarity,
      achievementId: definition.id
    };
    const record = Object.values(state.unlocks).find((item) => item.titleId === titleId);
    return record ? {
      id: titleId,
      label: record.titleLabel,
      rarity: record.rarity || "R",
      achievementId: record.achievementId
    } : null;
  }

  function syncTitleDisplay(state = loadState(), definitions = definitionCache) {
    const title = findTitleRecord(state.equippedTitleId, state, definitions || []);
    const profileButton = document.getElementById("btnProfile");
    if (profileButton) {
      profileButton.dataset.title = title?.label || "称号未装備";
      profileButton.dataset.titleRarity = title?.rarity || "none";
      profileButton.title = title ? `装備中称号：${title.label}` : "称号未装備";
    }

    const dialogCard = document.querySelector("#profileDialog .profile-dialog-card");
    if (dialogCard) {
      let block = document.getElementById("profileEquippedTitle");
      if (!block) {
        block = document.createElement("div");
        block.id = "profileEquippedTitle";
        block.className = "profile-equipped-title";
        const list = document.getElementById("profileList");
        if (list) list.insertAdjacentElement("beforebegin", block);
      }
      block.innerHTML = `
        <div><span>装備中称号</span><strong>${escapeHtml(title?.label || "称号未装備")}</strong></div>
        <button type="button" id="profileOpenAchievements">称号を見る</button>`;
      block.dataset.rarity = title?.rarity || "none";
      block.querySelector("#profileOpenAchievements")?.addEventListener("click", () => {
        document.getElementById("profileDialog")?.close?.();
        window.OnsenAppShell?.show?.("collection");
        setCollectionMode("achievements");
      });
    }
  }

  function installCollectionModeUi() {
    const shell = document.querySelector("#collectionView .collection-shell");
    const header = shell?.querySelector(".collection-header");
    if (!shell || !header || document.getElementById("collectionModeTabs")) return false;

    const tabs = document.createElement("div");
    tabs.id = "collectionModeTabs";
    tabs.className = "collection-mode-tabs";
    tabs.innerHTML = `
      <button type="button" class="active" data-collection-mode="collection">コレクション</button>
      <button type="button" data-collection-mode="achievements">実績・称号</button>`;
    header.insertAdjacentElement("afterend", tabs);

    const view = document.createElement("div");
    view.id = "achievementView";
    view.className = "achievement-view";
    view.hidden = true;
    view.innerHTML = `
      <section class="achievement-hero">
        <div class="achievement-equipped">
          <span>EQUIPPED TITLE</span>
          <strong id="achievementEquippedTitle">称号未装備</strong>
          <small id="achievementEquippedMeta">獲得した称号を肩書として装備できます。</small>
        </div>
        <button type="button" id="achievementUnequip">装備を外す</button>
      </section>
      <div class="achievement-metrics">
        <div><span>獲得実績</span><b id="achievementUnlockedMetric">0/0</b></div>
        <div><span>獲得称号</span><b id="achievementTitlesMetric">0</b></div>
        <div><span>新着</span><b id="achievementUnreadMetric">0</b></div>
      </div>
      <div class="achievement-toolbar">
        <button type="button" class="active" data-achievement-filter="all">すべて</button>
        <button type="button" data-achievement-filter="unlocked">獲得済</button>
        <button type="button" data-achievement-filter="locked">未達成</button>
      </div>
      <div id="achievementList" class="achievement-list"></div>`;
    shell.appendChild(view);

    tabs.addEventListener("click", (event) => {
      const button = event.target.closest("[data-collection-mode]");
      if (!button) return;
      setCollectionMode(button.dataset.collectionMode || "collection");
    });

    view.querySelector("#achievementUnequip")?.addEventListener("click", () => equipTitle(null));
    view.querySelector(".achievement-toolbar")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-achievement-filter]");
      if (!button) return;
      currentFilter = button.dataset.achievementFilter || "all";
      for (const other of view.querySelectorAll("[data-achievement-filter]")) other.classList.toggle("active", other === button);
      renderAchievementView();
    });
    return true;
  }

  function setCollectionMode(mode) {
    currentMode = mode === "achievements" ? "achievements" : "collection";
    installCollectionModeUi();
    const view = document.getElementById("achievementView");
    const overview = document.querySelector("#collectionView .collection-overview");
    const toolbar = document.querySelector("#collectionView .collection-toolbar");
    const grid = document.getElementById("collectionGrid");
    const tabs = document.getElementById("collectionModeTabs");

    for (const button of tabs?.querySelectorAll("[data-collection-mode]") || []) {
      button.classList.toggle("active", button.dataset.collectionMode === currentMode);
    }
    if (view) view.hidden = currentMode !== "achievements";
    if (overview) overview.hidden = currentMode === "achievements";
    if (toolbar) toolbar.hidden = currentMode === "achievements";
    if (grid) grid.hidden = currentMode === "achievements";

    if (currentMode === "achievements") {
      renderAchievementView();
    } else {
      try { renderCollectionProgress?.(); } catch {}
    }
    window.OnsenAppShell?.refresh?.();
  }

  function equipTitle(titleId) {
    const result = reconcileUnlocks({ markUnread: false });
    if (!result) return false;
    const { state, definitions } = result;
    if (titleId) {
      const owned = Object.values(state.unlocks).some((record) => record.titleId === titleId);
      if (!owned) return false;
    }
    state.equippedTitleId = titleId || null;
    saveState(state);
    syncTitleDisplay(state, definitions);
    renderAchievementView();
    return true;
  }

  function progressText(definition, progress) {
    if (definition.kind === "visit_count") return `${progress.done}/${progress.total}湯`;
    const suffix = definition.id.startsWith("area:onsen_musume") || definition.id === "collection:onsen_musume" ? "人" : "件";
    return `${progress.done}/${progress.total}${suffix}`;
  }

  function renderAchievementView() {
    installCollectionModeUi();
    const list = document.getElementById("achievementList");
    if (!list) return;
    const result = reconcileUnlocks({ markUnread: true });
    if (!result) return;
    const { state, definitions, checkins } = result;

    const equipped = findTitleRecord(state.equippedTitleId, state, definitions);
    const equippedName = document.getElementById("achievementEquippedTitle");
    const equippedMeta = document.getElementById("achievementEquippedMeta");
    if (equippedName) equippedName.textContent = equipped?.label || "称号未装備";
    if (equippedMeta) equippedMeta.textContent = equipped ? `${equipped.rarity} / 肩書として表示中` : "獲得した称号を肩書として装備できます。";
    const unequip = document.getElementById("achievementUnequip");
    if (unequip) unequip.disabled = !equipped;

    const unlockedCount = definitions.filter((definition) => !!state.unlocks[definition.id]).length;
    document.getElementById("achievementUnlockedMetric").textContent = `${unlockedCount}/${definitions.length}`;
    document.getElementById("achievementTitlesMetric").textContent = String(Object.keys(state.unlocks).length);
    document.getElementById("achievementUnreadMetric").textContent = String(state.unreadIds.length);

    const progressById = new Map(definitions.map((definition) => [definition.id, evaluateDefinition(definition, checkins)]));
    const filtered = definitions.filter((definition) => {
      const unlocked = !!state.unlocks[definition.id];
      if (currentFilter === "unlocked" && !unlocked) return false;
      if (currentFilter === "locked" && unlocked) return false;
      return true;
    });

    filtered.sort((a, b) => {
      const au = state.unlocks[a.id] ? 1 : 0;
      const bu = state.unlocks[b.id] ? 1 : 0;
      if (au !== bu) return bu - au;
      const rarity = (RARITY_ORDER[b.rarity] || 0) - (RARITY_ORDER[a.rarity] || 0);
      if (rarity) return rarity;
      return a.name.localeCompare(b.name, "ja");
    });

    list.innerHTML = "";
    const categories = [...new Set(filtered.map((item) => item.category))];
    for (const category of categories) {
      const section = document.createElement("section");
      section.className = "achievement-section";
      const heading = document.createElement("div");
      heading.className = "achievement-section-heading";
      const items = filtered.filter((item) => item.category === category);
      heading.innerHTML = `<h3>${escapeHtml(category)}</h3><span>${items.length}件</span>`;
      section.appendChild(heading);

      const grid = document.createElement("div");
      grid.className = "achievement-card-grid";
      for (const definition of items) {
        const unlock = state.unlocks[definition.id];
        const progress = progressById.get(definition.id);
        const card = document.createElement("article");
        card.className = `achievement-card ${unlock ? "unlocked" : "locked"}`;
        card.dataset.rarity = definition.rarity;
        const percent = progress.total ? Math.round(progress.done / progress.total * 100) : 0;
        card.innerHTML = `
          <div class="achievement-card-top">
            <span class="achievement-rarity">${escapeHtml(definition.rarity)}</span>
            <span class="achievement-state">${unlock ? "ACHIEVED" : `${percent}%`}</span>
          </div>
          <strong class="achievement-name">${escapeHtml(definition.name)}</strong>
          <p>${escapeHtml(definition.description)}</p>
          <div class="achievement-progress"><span style="width:${Math.min(100, percent)}%"></span></div>
          <div class="achievement-progress-text">${escapeHtml(progressText(definition, progress))}</div>
          <div class="achievement-reward"><span>称号</span><b>「${escapeHtml(definition.titleLabel)}」</b></div>`;

        const footer = document.createElement("div");
        footer.className = "achievement-card-footer";
        const date = document.createElement("span");
        date.textContent = unlock ? `達成 ${formatDate(unlock.unlockedAt)}` : "未達成";
        footer.appendChild(date);
        if (unlock) {
          const button = document.createElement("button");
          button.type = "button";
          const equippedThis = state.equippedTitleId === definition.titleId;
          button.className = equippedThis ? "equipped" : "";
          button.textContent = equippedThis ? "装備中" : "肩書にする";
          button.disabled = equippedThis;
          button.addEventListener("click", () => equipTitle(definition.titleId));
          footer.appendChild(button);
        }
        card.appendChild(footer);
        grid.appendChild(card);
      }
      section.appendChild(grid);
      list.appendChild(section);
    }

    if (!filtered.length) {
      list.innerHTML = `<div class="achievement-empty">条件に一致する実績はありません。</div>`;
    }

    if (currentMode === "achievements" && state.unreadIds.length) {
      state.unreadIds = [];
      saveState(state);
      const metric = document.getElementById("achievementUnreadMetric");
      if (metric) metric.textContent = "0";
    }
    syncTitleDisplay(state, definitions);
  }

  function formatDate(value) {
    const date = new Date(Number(value || 0));
    if (!Number.isFinite(date.getTime())) return "—";
    return date.toLocaleDateString("ja-JP", { year: "numeric", month: "numeric", day: "numeric" });
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'\"]/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[char]));
  }

  function wrapCheckinPersistence() {
    if (originalSaveCheckins || typeof saveCheckins !== "function") return;
    originalSaveCheckins = saveCheckins;
    saveCheckins = function achievementAwareSaveCheckins(list) {
      const result = originalSaveCheckins(list);
      scheduleEvaluation();
      return result;
    };
  }

  function scheduleEvaluation() {
    clearTimeout(evaluationTimer);
    evaluationTimer = setTimeout(() => {
      reconcileUnlocks({ markUnread: true });
      if (currentMode === "achievements") renderAchievementView();
    }, 50);
  }

  async function waitForCore() {
    for (let i = 0; i < 300; i++) {
      if (
        typeof loadCheckins === "function" && typeof saveCheckins === "function" &&
        window.OnsenUserStorage && window.CollectionAreaHierarchy &&
        typeof window.getCollectionDefinitions === "function"
      ) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("achievement core was not ready");
  }

  async function install() {
    if (initialized) return;
    await waitForCore();
    initialized = true;
    wrapCheckinPersistence();
    installCollectionModeUi();
    reconcileUnlocks({ markUnread: false });
    syncTitleDisplay();

    window.addEventListener("storage", (event) => {
      if (!event.key || event.key.includes(STATE_KEY) || event.key.includes("checkins")) scheduleEvaluation();
    });
    window.addEventListener("onsen-app-tab-changed", (event) => {
      if (event.detail?.tab === "collection") {
        installCollectionModeUi();
        if (currentMode === "achievements") setTimeout(renderAchievementView, 0);
      }
    });
    window.addEventListener("pageshow", scheduleEvaluation);

    window.OnsenAchievements = {
      stateKey: STATE_KEY,
      refresh: () => reconcileUnlocks({ markUnread: true }),
      render: renderAchievementView,
      show: () => {
        window.OnsenAppShell?.show?.("collection");
        setCollectionMode("achievements");
      },
      equipTitle,
      getDefinitions: () => [...definitionCache],
      getState: loadState
    };
  }

  install().catch((err) => console.warn("achievement system init failed", err));
})();