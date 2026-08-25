(() => {
  const STATE_KEY = "achievementStateV1";
  const GPS_TYPES = new Set(["gps_manual", "gps_legacy", "gps_recovered"]);
  const RARITY_ORDER = ["N", "R", "SR", "SSR", "LEGEND"];
  const VISIT_TITLE_MAP = new Map([
    [10, "現地十湯踏破者"],
    [25, "現地温泉行脚人"],
    [50, "現地五十湯踏破者"],
    [100, "現地百湯巡礼者"],
    [200, "現地列島湯巡り人"]
  ]);

  let initialized = false;
  let currentFilter = "all";
  let wrappedSave = null;
  let evaluationTimer = null;

  function safeParse(value, fallback) {
    try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
  }

  function readState() {
    return safeParse(localStorage.getItem(STATE_KEY), {
      version: 1,
      initializedAt: null,
      updatedAt: null,
      equippedTitleId: null,
      unlocks: {},
      unreadIds: []
    });
  }

  function writeState(state) {
    state.version = Number(state.version || 1);
    state.updatedAt = Date.now();
    if (!state.unlocks || typeof state.unlocks !== "object") state.unlocks = {};
    if (!Array.isArray(state.unreadIds)) state.unreadIds = [];
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  function isGpsVerified(item) {
    if (window.AppDomain?.visits?.isGpsVerified) return window.AppDomain.visits.isGpsVerified(item);
    if (!item?.spotId && !item?.entityId) return false;
    if (GPS_TYPES.has(item.verificationType)) return true;
    return item.verificationLevel === "onsite" && item.recordSource === "checkin_button";
  }

  function gpsEvidenceBySpot() {
    const bySpot = new Map();
    let list = [];
    try { list = typeof loadCheckins === "function" ? loadCheckins() : []; } catch {}
    for (const item of list) {
      if (!isGpsVerified(item)) continue;
      const entityId = String(item.entityId || item.spotId || "");
      if (!entityId) continue;
      const at = Number(item.checkedAt || item.verifiedAt || item.recordedAt || 0) || 0;
      const current = bySpot.get(entityId);
      if (!current || (at && at < current.at)) bySpot.set(entityId, { item, at });
    }
    return bySpot;
  }

  function bumpRarity(value) {
    const current = Math.max(0, RARITY_ORDER.indexOf(String(value || "R").toUpperCase()));
    return RARITY_ORDER[Math.min(RARITY_ORDER.length - 1, current + 1)];
  }

  function strictTitle(base) {
    if (base.kind === "visit_count") {
      return VISIT_TITLE_MAP.get(Number(base.visitCount || 0)) || `現地${base.titleLabel || base.name}`;
    }
    return `現地・${base.titleLabel || base.name}`;
  }

  function strictDefinition(base) {
    return {
      ...base,
      id: `onsite:${base.id}`,
      baseAchievementId: base.id,
      category: base.kind === "visit_count" ? "現地GPS・旅の軌跡" : "現地GPS・踏破実績",
      name: `現地GPS｜${base.name}`,
      description: `${base.description}。端末GPSで現地確認された訪問のみ有効。写真・自己申告・付近記録は対象外。`,
      titleId: `title:onsite:${base.id}`,
      titleLabel: strictTitle(base),
      rarity: bumpRarity(base.rarity),
      verification: "gps_onsite"
    };
  }

  function isStrictBase(base) {
    if (!base || base.verification === "onsite" || String(base.id || "").startsWith("onsite:")) return false;
    if (base.kind === "visit_count") return Number(base.visitCount || 0) >= 10;
    if (base.kind === "collection") return true;
    if (base.kind === "area_region") return true;
    return false;
  }

  function getStrictDefinitions() {
    const base = window.OnsenAchievements?.getDefinitions?.() || [];
    return base.filter(isStrictBase).map(strictDefinition);
  }

  function evaluate(definition, evidence = gpsEvidenceBySpot()) {
    if (definition.kind === "visit_count") {
      const ordered = [...evidence.entries()]
        .map(([spotId, entry]) => ({ spotId, ...entry }))
        .sort((a, b) => a.at - b.at);
      const total = Number(definition.visitCount || definition.total || 0);
      const done = Math.min(ordered.length, total);
      const complete = total > 0 && ordered.length >= total;
      const last = complete ? ordered[total - 1] : null;
      return {
        done,
        total,
        complete,
        completedAt: last?.at || null,
        completionSpotId: last?.spotId || null,
        missingSpotIds: []
      };
    }

    let done = 0;
    let total = 0;
    let latest = null;
    const missingSpotIds = [];
    for (const spotId of definition.requiredSpotIds || []) {
      const weight = Math.max(0, Number(definition.weights?.[spotId] ?? 1));
      total += weight;
      const entry = evidence.get(spotId);
      if (entry) {
        done += weight;
        if (!latest || entry.at > latest.at) latest = { spotId, ...entry };
      } else {
        missingSpotIds.push(spotId);
      }
    }
    const complete = total > 0 && missingSpotIds.length === 0;
    return {
      done,
      total,
      complete,
      completedAt: complete ? latest?.at || Date.now() : null,
      completionSpotId: complete ? latest?.spotId || null : null,
      missingSpotIds
    };
  }

  function reconcile() {
    const definitions = getStrictDefinitions();
    const evidence = gpsEvidenceBySpot();
    const state = readState();
    if (!state.unlocks || typeof state.unlocks !== "object") state.unlocks = {};
    let changed = false;
    const now = Date.now();

    for (const definition of definitions) {
      const progress = evaluate(definition, evidence);
      if (!progress.complete || state.unlocks[definition.id]) continue;
      state.unlocks[definition.id] = {
        achievementId: definition.id,
        achievementName: definition.name,
        titleId: definition.titleId,
        titleLabel: definition.titleLabel,
        rarity: definition.rarity,
        unlockedAt: Number(progress.completedAt || now),
        recognizedAt: now,
        verification: "gps_onsite",
        completionSpotId: progress.completionSpotId || null,
        completionVisitAt: Number(progress.completedAt || now)
      };
      changed = true;
    }

    if (changed) writeState(state);
    return { definitions, evidence, state };
  }

  function ensureUi() {
    const view = document.getElementById("achievementView");
    if (!view) return null;

    let tabs = document.getElementById("achievementKindTabs");
    if (!tabs) {
      tabs = document.createElement("div");
      tabs.id = "achievementKindTabs";
      tabs.className = "achievement-kind-tabs";
      tabs.innerHTML = `
        <button type="button" class="active" data-achievement-kind="standard">通常実績</button>
        <button type="button" data-achievement-kind="onsite">現地GPS</button>`;
      const hero = view.querySelector(".achievement-hero");
      hero?.insertAdjacentElement("afterend", tabs);
      tabs.addEventListener("click", (event) => {
        const button = event.target.closest("[data-achievement-kind]");
        if (!button) return;
        setKind(button.dataset.achievementKind || "standard");
      });
    }

    let onsite = document.getElementById("achievementOnsiteView");
    if (!onsite) {
      onsite = document.createElement("section");
      onsite.id = "achievementOnsiteView";
      onsite.className = "achievement-onsite-view";
      onsite.hidden = true;
      onsite.innerHTML = `
        <div class="achievement-onsite-note">
          <div><span>GPS VERIFIED</span><strong>現地GPS踏破</strong></div>
          <p>チェックインボタン、またはGPS範囲内の取り逃し復元だけを証拠にします。写真EXIF・自己申告・付近検出は通常達成には使えても、ここでは無効です。</p>
        </div>
        <div class="achievement-onsite-metrics">
          <div><span>GPS現地確認</span><b id="onsiteVisitedMetric">0湯</b></div>
          <div><span>解除</span><b id="onsiteUnlockedMetric">0/0</b></div>
          <div><span>最短</span><b id="onsiteNearestMetric">—</b></div>
        </div>
        <div class="achievement-onsite-toolbar">
          <button type="button" class="active" data-onsite-filter="all">すべて</button>
          <button type="button" data-onsite-filter="unlocked">獲得済</button>
          <button type="button" data-onsite-filter="locked">未達成</button>
        </div>
        <div id="achievementOnsiteList" class="achievement-onsite-list"></div>`;
      tabs.insertAdjacentElement("afterend", onsite);
      onsite.querySelector(".achievement-onsite-toolbar")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-onsite-filter]");
        if (!button) return;
        currentFilter = button.dataset.onsiteFilter || "all";
        for (const other of onsite.querySelectorAll("[data-onsite-filter]")) other.classList.toggle("active", other === button);
        render();
      });
    }
    return onsite;
  }

  function setKind(kind) {
    const view = document.getElementById("achievementView");
    if (!view) return;
    const onsiteMode = kind === "onsite";
    view.dataset.achievementKindMode = onsiteMode ? "onsite" : "standard";
    for (const button of view.querySelectorAll("[data-achievement-kind]")) {
      button.classList.toggle("active", button.dataset.achievementKind === (onsiteMode ? "onsite" : "standard"));
    }
    const standardNodes = [
      view.querySelector(".achievement-metrics"),
      view.querySelector(".achievement-toolbar"),
      document.getElementById("achievementList"),
      document.getElementById("achievementNextUp"),
      document.getElementById("achievementHistory")
    ].filter(Boolean);
    for (const node of standardNodes) node.hidden = onsiteMode;
    const onsite = ensureUi();
    if (onsite) onsite.hidden = !onsiteMode;
    if (onsiteMode) render();
  }

  function spotName(id) {
    const entity = window.AppDomain?.entities?.get?.(id, "onsen");
    if (entity?.name) return entity.name;
    try { return (spots || []).find((spot) => spot.id === id)?.name || id; } catch { return id; }
  }

  function progressText(definition, progress) {
    if (definition.kind === "visit_count") return `${progress.done}/${progress.total}湯`;
    const unit = String(definition.baseAchievementId || "").includes("onsen_musume") ? "人" : "件";
    return `${progress.done}/${progress.total}${unit}`;
  }

  function render() {
    const onsite = ensureUi();
    if (!onsite) return;
    const { definitions, evidence, state } = reconcile();
    const list = document.getElementById("achievementOnsiteList");
    if (!list) return;

    const progressById = new Map(definitions.map((definition) => [definition.id, evaluate(definition, evidence)]));
    const unlockedCount = definitions.filter((definition) => !!state.unlocks?.[definition.id]).length;
    const nearest = definitions
      .filter((definition) => !state.unlocks?.[definition.id])
      .map((definition) => ({ definition, progress: progressById.get(definition.id) }))
      .filter((entry) => entry.progress.total > 0)
      .sort((a, b) => (a.progress.total - a.progress.done) - (b.progress.total - b.progress.done))[0];

    const visitedMetric = document.getElementById("onsiteVisitedMetric");
    const unlockedMetric = document.getElementById("onsiteUnlockedMetric");
    const nearestMetric = document.getElementById("onsiteNearestMetric");
    if (visitedMetric) visitedMetric.textContent = `${evidence.size}湯`;
    if (unlockedMetric) unlockedMetric.textContent = `${unlockedCount}/${definitions.length}`;
    if (nearestMetric) nearestMetric.textContent = nearest ? `あと${Math.max(0, nearest.progress.total - nearest.progress.done)}` : "全解除";

    const filtered = definitions.filter((definition) => {
      const unlocked = !!state.unlocks?.[definition.id];
      if (currentFilter === "unlocked" && !unlocked) return false;
      if (currentFilter === "locked" && unlocked) return false;
      return true;
    }).sort((a, b) => {
      const au = state.unlocks?.[a.id] ? 1 : 0;
      const bu = state.unlocks?.[b.id] ? 1 : 0;
      if (au !== bu) return bu - au;
      const ar = RARITY_ORDER.indexOf(a.rarity);
      const br = RARITY_ORDER.indexOf(b.rarity);
      if (ar !== br) return br - ar;
      return a.name.localeCompare(b.name, "ja");
    });

    list.innerHTML = "";
    const categories = [...new Set(filtered.map((item) => item.category))];
    for (const category of categories) {
      const section = document.createElement("section");
      section.className = "achievement-onsite-section";
      const items = filtered.filter((item) => item.category === category);
      section.innerHTML = `<div class="achievement-onsite-section-head"><h3>${escapeHtml(category)}</h3><span>${items.length}件</span></div>`;
      const grid = document.createElement("div");
      grid.className = "achievement-onsite-grid";

      for (const definition of items) {
        const progress = progressById.get(definition.id);
        const unlock = state.unlocks?.[definition.id];
        const remaining = Math.max(0, progress.total - progress.done);
        const missing = (progress.missingSpotIds || []).slice(0, 3).map(spotName);
        const percent = progress.total ? Math.round(progress.done / progress.total * 100) : 0;
        const card = document.createElement("article");
        card.className = `achievement-onsite-card ${unlock ? "unlocked" : "locked"}`;
        card.dataset.rarity = definition.rarity;
        card.innerHTML = `
          <div class="achievement-onsite-card-top"><span>${escapeHtml(definition.rarity)}</span><b>${unlock ? "GPS VERIFIED" : `${percent}%`}</b></div>
          <strong>${escapeHtml(definition.name)}</strong>
          <p>${missing.length && !unlock ? `未確認：${escapeHtml(missing.join(" / "))}` : escapeHtml(definition.description)}</p>
          <div class="achievement-onsite-progress"><span style="width:${Math.min(100, percent)}%"></span></div>
          <small>${escapeHtml(progressText(definition, progress))}${unlock ? " ・ 現地GPS達成" : ` ・ あと${remaining}`}</small>
          <div class="achievement-onsite-reward"><span>現地踏破称号</span><b>「${escapeHtml(definition.titleLabel)}」</b></div>`;

        const footer = document.createElement("div");
        footer.className = "achievement-onsite-footer";
        const status = document.createElement("span");
        status.textContent = unlock ? `達成 ${formatDate(unlock.unlockedAt)}` : "未達成";
        footer.appendChild(status);
        if (unlock) {
          const button = document.createElement("button");
          button.type = "button";
          const equipped = state.equippedTitleId === definition.titleId;
          button.textContent = equipped ? "装備中" : "肩書にする";
          button.disabled = equipped;
          button.classList.toggle("equipped", equipped);
          button.addEventListener("click", () => {
            window.OnsenAchievements?.equipTitle?.(definition.titleId);
            setTimeout(render, 0);
          });
          footer.appendChild(button);
        }
        card.appendChild(footer);
        grid.appendChild(card);
      }
      section.appendChild(grid);
      list.appendChild(section);
    }

    if (!filtered.length) list.innerHTML = `<div class="achievement-onsite-empty">条件に一致する現地GPS実績はありません。</div>`;
  }

  function schedule() {
    clearTimeout(evaluationTimer);
    evaluationTimer = setTimeout(() => {
      reconcile();
      if (document.getElementById("achievementView")?.dataset.achievementKindMode === "onsite") render();
    }, 80);
  }

  function wrapSaveCheckins() {
    if (wrappedSave || typeof saveCheckins !== "function") return;
    wrappedSave = saveCheckins;
    saveCheckins = function onsiteAchievementAwareSave(list) {
      const result = wrappedSave(list);
      schedule();
      return result;
    };
  }

  async function install() {
    if (initialized) return;
    for (let i = 0; i < 300; i++) {
      if (window.OnsenAchievements?.getDefinitions && typeof loadCheckins === "function" && typeof saveCheckins === "function") break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    initialized = true;
    wrapSaveCheckins();
    reconcile();
    ensureUi();
    setKind("standard");

    window.addEventListener("onsen-app-tab-changed", (event) => {
      if (event.detail?.tab === "collection") setTimeout(() => { ensureUi(); schedule(); }, 50);
    });
    window.addEventListener("pageshow", schedule);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") schedule();
    });

    window.OnsenOnsiteAchievements = {
      render,
      refresh: reconcile,
      show: () => {
        window.OnsenAchievements?.show?.();
        setTimeout(() => setKind("onsite"), 50);
      },
      getDefinitions: getStrictDefinitions,
      isGpsVerified
    };
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

  install().catch((err) => console.warn("onsite achievement init failed", err));
})();