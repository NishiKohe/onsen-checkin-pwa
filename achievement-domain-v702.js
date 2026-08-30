(() => {
  const BUILD = "v70.2";
  const STATE_KEY = "achievementStateV1";
  const RARITY_ORDER = { N: 0, R: 1, SR: 2, SSR: 3, LEGEND: 4 };
  let installed = false;
  let renderTimer = null;

  const DEFINITIONS = Object.freeze([
    { id: "domain:castle:050", category: "名城200", kind: "castle_total", required: 50, name: "五十城踏破", description: "日本100名城・続日本100名城から合計50城を訪問する", titleLabel: "五十城巡歴者", rarity: "R" },
    { id: "domain:castle:100", category: "名城200", kind: "castle_total", required: 100, name: "百城踏破", description: "日本100名城・続日本100名城から合計100城を訪問する", titleLabel: "百城巡礼者", rarity: "SR" },
    { id: "domain:castle:original100", category: "名城200", kind: "castle_original", required: 100, name: "日本100名城 制覇", description: "日本100名城を100城すべて訪問する", titleLabel: "日本100名城制覇者", rarity: "SSR" },
    { id: "domain:castle:continued100", category: "名城200", kind: "castle_continued", required: 100, name: "続日本100名城 制覇", description: "続日本100名城を100城すべて訪問する", titleLabel: "続日本100名城制覇者", rarity: "SSR" },
    { id: "domain:castle:200", category: "名城200", kind: "castle_total", required: 200, name: "名城二百踏破", description: "日本100名城・続日本100名城の計200城をすべて訪問する", titleLabel: "名城二百城制覇者", rarity: "LEGEND" },

    { id: "domain:scenic:010", category: "国指定名勝", kind: "scenic_total", required: 10, name: "十景巡歴", description: "国指定名勝を10件訪問する", titleLabel: "十景巡歴者", rarity: "R" },
    { id: "domain:scenic:050", category: "国指定名勝", kind: "scenic_total", required: 50, name: "五十景踏破", description: "国指定名勝を50件訪問する", titleLabel: "五十景踏破者", rarity: "SR" },
    { id: "domain:scenic:100", category: "国指定名勝", kind: "scenic_total", required: 100, name: "百景巡礼", description: "国指定名勝を100件訪問する", titleLabel: "百景巡礼者", rarity: "SSR" },
    { id: "domain:scenic:200", category: "国指定名勝", kind: "scenic_total", required: 200, name: "二百景行脚", description: "国指定名勝を200件訪問する", titleLabel: "二百景行脚人", rarity: "SSR" },
    { id: "domain:scenic:300", category: "国指定名勝", kind: "scenic_total", required: 300, name: "三百景踏破", description: "国指定名勝を300件訪問する", titleLabel: "列島景勝巡礼者", rarity: "LEGEND" },
    { id: "domain:scenic:433", category: "国指定名勝", kind: "scenic_total", required: 433, name: "国指定名勝 全制覇", description: "国指定名勝433件をすべて訪問する", titleLabel: "国指定名勝制覇者", rarity: "LEGEND" },
    { id: "domain:scenic:special10", category: "特別名勝", kind: "scenic_special", required: 10, name: "特別名勝 十景", description: "特別名勝を10件訪問する", titleLabel: "特別名勝巡歴者", rarity: "SR" },
    { id: "domain:scenic:special20", category: "特別名勝", kind: "scenic_special", required: 20, name: "特別名勝 二十景", description: "特別名勝を20件訪問する", titleLabel: "特別名勝行脚人", rarity: "SSR" },
    { id: "domain:scenic:special36", category: "特別名勝", kind: "scenic_special", required: 36, name: "特別名勝 全制覇", description: "特別名勝36件をすべて訪問する", titleLabel: "特別名勝制覇者", rarity: "LEGEND" }
  ].map((definition) => Object.freeze({ ...definition, titleId: `title:${definition.id}`, total: definition.required })));

  function safeParse(value, fallback) {
    try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
  }
  function readState() {
    const parsed = safeParse(localStorage.getItem(STATE_KEY), {});
    return {
      version: Number(parsed.version || 1),
      initializedAt: Number(parsed.initializedAt || 0) || null,
      updatedAt: Number(parsed.updatedAt || 0) || null,
      equippedTitleId: parsed.equippedTitleId || null,
      unlocks: parsed.unlocks && typeof parsed.unlocks === "object" ? { ...parsed.unlocks } : {},
      unreadIds: Array.isArray(parsed.unreadIds) ? [...new Set(parsed.unreadIds)] : []
    };
  }
  function writeState(state) {
    state.updatedAt = Date.now();
    state.unreadIds = [...new Set(state.unreadIds || [])];
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'\"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  }
  function formatDate(value) {
    const date = new Date(Number(value || 0));
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString("ja-JP", { year: "numeric", month: "numeric", day: "numeric" }) : "—";
  }

  function castleEntityMap() {
    return new Map((window.OnsenCastleDomain?.data?.entities || []).map((entry) => [String(entry.id), entry]));
  }
  function castleEvidence(kind) {
    const records = window.OnsenCastleVisits?.list?.() || [];
    const entities = castleEntityMap();
    const earliest = new Map();
    for (const record of records) {
      const id = String(record?.entityId || record?.spotId || "");
      if (!id) continue;
      const entity = entities.get(id);
      if (kind === "castle_original" && Number(entity?.japan100No || 0) > 100) continue;
      if (kind === "castle_continued" && Number(entity?.japan100No || 0) <= 100) continue;
      const at = Number(record.checkedAt || record.recordedAt || Date.now());
      if (!earliest.has(id) || at < earliest.get(id)) earliest.set(id, at);
    }
    return [...earliest.values()].sort((a, b) => a - b);
  }
  function scenicEvidence(specialOnly) {
    const runtime = window.OnsenScenicRuntime;
    const state = runtime?.loadState?.() || { visited: {} };
    const times = [];
    for (const [id, visit] of Object.entries(state.visited || {})) {
      if (specialOnly && runtime?.get?.(id)?.specialScenic !== true) continue;
      times.push(Number(visit?.visitedAt || Date.now()));
    }
    return times.sort((a, b) => a - b);
  }
  function evaluate(definition) {
    let evidence = [];
    if (definition.kind.startsWith("castle_")) evidence = castleEvidence(definition.kind);
    else if (definition.kind === "scenic_special") evidence = scenicEvidence(true);
    else if (definition.kind === "scenic_total") evidence = scenicEvidence(false);
    const done = Math.min(evidence.length, definition.required);
    const complete = evidence.length >= definition.required;
    return {
      done,
      total: definition.required,
      complete,
      completedAt: complete ? evidence[definition.required - 1] || Date.now() : null
    };
  }

  function reconcile() {
    const state = readState();
    let changed = false;
    const now = Date.now();
    for (const definition of DEFINITIONS) {
      const progress = evaluate(definition);
      if (!progress.complete || state.unlocks[definition.id]) continue;
      state.unlocks[definition.id] = {
        achievementId: definition.id,
        achievementName: definition.name,
        titleId: definition.titleId,
        titleLabel: definition.titleLabel,
        rarity: definition.rarity,
        unlockedAt: Number(progress.completedAt || now),
        recognizedAt: now,
        verification: "domain_visit"
      };
      if (state.initializedAt) state.unreadIds.push(definition.id);
      changed = true;
    }
    if (changed) {
      writeState(state);
      window.dispatchEvent(new CustomEvent("onsen-domain-achievements-changed", { detail: { build: BUILD, state } }));
    }
    return { state, progressById: new Map(DEFINITIONS.map((definition) => [definition.id, evaluate(definition)])) };
  }

  function currentFilter() {
    return document.querySelector('#achievementView .achievement-toolbar [data-achievement-filter].active')?.dataset.achievementFilter || "all";
  }
  function standardAchievementVisible() {
    const view = document.getElementById("achievementView");
    if (!view || view.hidden) return false;
    return view.dataset.achievementKindMode !== "onsite";
  }
  function ensureUi() {
    const view = document.getElementById("achievementView");
    const list = document.getElementById("achievementList");
    if (!view || !list) return null;
    let root = document.getElementById("achievementDomainV702");
    if (!root) {
      root = document.createElement("div");
      root.id = "achievementDomainV702";
      root.className = "achievement-domain-v702";
      list.insertAdjacentElement("beforebegin", root);
    }
    root.hidden = !standardAchievementVisible();
    return root;
  }
  function updateMetrics(state) {
    const base = window.OnsenAchievements?.getDefinitions?.() || [];
    const baseIds = new Set(base.map((item) => item.id));
    const domainIds = new Set(DEFINITIONS.map((item) => item.id));
    const unlocked = Object.keys(state.unlocks || {}).filter((id) => baseIds.has(id) || domainIds.has(id)).length;
    const metric = document.getElementById("achievementUnlockedMetric");
    if (metric) metric.textContent = `${unlocked}/${base.length + DEFINITIONS.length}`;
    const titles = document.getElementById("achievementTitlesMetric");
    if (titles) titles.textContent = String(Object.keys(state.unlocks || {}).length);
    const unread = document.getElementById("achievementUnreadMetric");
    if (unread) unread.textContent = String((state.unreadIds || []).length);
  }

  function render() {
    const root = ensureUi();
    const { state, progressById } = reconcile();
    updateMetrics(state);
    if (!root || !standardAchievementVisible()) return;

    const filter = currentFilter();
    const filtered = DEFINITIONS.filter((definition) => {
      const unlocked = !!state.unlocks?.[definition.id];
      if (filter === "unlocked" && !unlocked) return false;
      if (filter === "locked" && unlocked) return false;
      return true;
    }).sort((a, b) => {
      const au = state.unlocks?.[a.id] ? 1 : 0;
      const bu = state.unlocks?.[b.id] ? 1 : 0;
      if (au !== bu) return bu - au;
      const rarity = (RARITY_ORDER[b.rarity] || 0) - (RARITY_ORDER[a.rarity] || 0);
      if (rarity) return rarity;
      return a.required - b.required;
    });

    if (!filtered.length) {
      root.innerHTML = "";
      return;
    }

    const categories = [...new Set(filtered.map((item) => item.category))];
    root.innerHTML = "";
    for (const category of categories) {
      const section = document.createElement("section");
      section.className = "achievement-section achievement-domain-section-v702";
      const items = filtered.filter((item) => item.category === category);
      section.innerHTML = `<div class="achievement-section-heading"><h3>${escapeHtml(category)}</h3><span>${items.length}件</span></div>`;
      const grid = document.createElement("div");
      grid.className = "achievement-card-grid";

      for (const definition of items) {
        const progress = progressById.get(definition.id);
        const unlock = state.unlocks?.[definition.id];
        const percent = progress.total ? Math.round(progress.done / progress.total * 100) : 0;
        const card = document.createElement("article");
        card.className = `achievement-card ${unlock ? "unlocked" : "locked"}`;
        card.dataset.rarity = definition.rarity;
        card.innerHTML = `
          <div class="achievement-card-top"><span class="achievement-rarity">${definition.rarity}</span><span class="achievement-state">${unlock ? "ACHIEVED" : `${percent}%`}</span></div>
          <strong class="achievement-name">${escapeHtml(definition.name)}</strong>
          <p>${escapeHtml(definition.description)}</p>
          <div class="achievement-progress"><span style="width:${Math.min(100, percent)}%"></span></div>
          <div class="achievement-progress-text">${progress.done}/${progress.total}件</div>
          <div class="achievement-reward"><span>称号</span><b>「${escapeHtml(definition.titleLabel)}」</b></div>`;
        const footer = document.createElement("div");
        footer.className = "achievement-card-footer";
        const date = document.createElement("span");
        date.textContent = unlock ? `達成 ${formatDate(unlock.unlockedAt)}` : "未達成";
        footer.appendChild(date);
        if (unlock) {
          const button = document.createElement("button");
          button.type = "button";
          const equipped = state.equippedTitleId === definition.titleId;
          button.className = equipped ? "equipped" : "";
          button.textContent = equipped ? "装備中" : "肩書にする";
          button.disabled = equipped;
          button.addEventListener("click", () => {
            window.OnsenAchievements?.equipTitle?.(definition.titleId);
            scheduleRender();
          });
          footer.appendChild(button);
        }
        card.appendChild(footer);
        grid.appendChild(card);
      }
      section.appendChild(grid);
      root.appendChild(section);
    }
  }

  function scheduleRender(delay = 0) {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      try { render(); } catch (error) { console.warn("domain achievements render failed", error); }
    }, delay);
  }

  async function install() {
    if (installed) return;
    for (let i = 0; i < 300; i += 1) {
      if (window.OnsenAchievements && window.OnsenCastleVisits && window.OnsenScenicRuntime && document.getElementById("achievementView")) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (!window.OnsenAchievements || !window.OnsenCastleVisits || !window.OnsenScenicRuntime) throw new Error("domain achievement prerequisites not ready");
    installed = true;
    scheduleRender(0);

    for (const eventName of ["onsen-castle-visit-changed", "onsen-scenic-visit-changed", "onsen-castle-visits-ready", "onsen-scenic-runtime-ready"]) {
      window.addEventListener(eventName, () => scheduleRender(20));
    }
    window.addEventListener("onsen-app-tab-changed", (event) => {
      if (event.detail?.tab === "collection") scheduleRender(40);
    });
    window.addEventListener("pageshow", () => scheduleRender(30));
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("[data-achievement-filter],[data-collection-mode],[data-achievement-kind]") : null;
      if (target) scheduleRender(0);
    });

    window.OnsenDomainAchievements = {
      build: BUILD,
      definitions: () => DEFINITIONS.map((item) => ({ ...item })),
      evaluate,
      reconcile,
      render,
      refresh: () => scheduleRender(0)
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => install().catch((error) => console.warn("domain achievements v70.2 init failed", error)), { once: true });
  } else {
    install().catch((error) => console.warn("domain achievements v70.2 init failed", error));
  }
})();