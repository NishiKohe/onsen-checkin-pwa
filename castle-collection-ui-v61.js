(() => {
  const BUILD = "v61";
  const MODE_KEY = "collectionDomainModeV61";
  let mode = sessionStorage.getItem(MODE_KEY) === "castle" ? "castle" : "onsen";
  let query = "";
  let filter = "all";
  let region = "all";
  let installed = false;

  function normalize(value) { return String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, ""); }
  function getShell() { return document.querySelector("#collectionView .collection-shell"); }
  function achievementsVisible() {
    const view = document.getElementById("achievementView");
    return !!view && !view.hidden;
  }
  function onsenNodes() {
    return [document.querySelector("#collectionView .collection-overview"), document.querySelector("#collectionView .collection-toolbar"), document.getElementById("collectionGrid")].filter(Boolean);
  }

  function ensureUi() {
    const shell = getShell();
    if (!shell) return null;
    let switcher = shell.querySelector(".collection-domain-switch");
    if (!switcher) {
      switcher = document.createElement("div");
      switcher.className = "collection-domain-switch";
      switcher.innerHTML = `<button type="button" data-collection-domain="onsen">温泉</button><button type="button" data-collection-domain="castle">日本100名城</button>`;
      const header = shell.querySelector(".collection-header");
      header?.insertAdjacentElement("afterend", switcher);
      switcher.addEventListener("click", (event) => {
        const button = event.target instanceof Element ? event.target.closest("[data-collection-domain]") : null;
        if (!button) return;
        setMode(button.dataset.collectionDomain || "onsen");
      });
    }

    let panel = document.getElementById("castleCollectionPanel");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "castleCollectionPanel";
      panel.className = "castle-collection-panel";
      panel.hidden = true;
      panel.innerHTML = `
        <div class="castle-overview">
          <div class="castle-metric"><span>訪問</span><b id="castleVisitedMetric">0/100</b></div>
          <div class="castle-metric"><span>厳格GPS</span><b id="castleGpsMetric">0</b></div>
          <div class="castle-metric"><span>武威</span><b id="castleBuiMetric">+0%</b></div>
        </div>
        <div class="castle-notice">日本100名城を収録しました。現在は過去訪問登録が利用できます。過去訪問はコレクションと武威に反映し、武将の登用候補も解放します。城での確定加入は、座標検証後の厳格GPSチェックイン専用です。</div>
        <div class="castle-toolbar">
          <input id="castleSearch" type="search" placeholder="城名・都道府県で検索" autocomplete="off" />
          <div class="castle-filter-row">
            <button type="button" class="active" data-castle-filter="all">すべて</button>
            <button type="button" data-castle-filter="unvisited">未訪問</button>
            <button type="button" data-castle-filter="visited">訪問済</button>
          </div>
          <div id="castleRegionRow" class="castle-region-row"></div>
        </div>
        <div id="castleListRoot"></div>`;
      const anchor = shell.querySelector(".collection-toolbar") || switcher;
      anchor.insertAdjacentElement("afterend", panel);
      panel.querySelector("#castleSearch")?.addEventListener("input", (event) => { query = String(event.target.value || "").trim(); render(); });
      panel.addEventListener("click", handlePanelClick);
    }
    return panel;
  }

  function handlePanelClick(event) {
    const filterButton = event.target instanceof Element ? event.target.closest("[data-castle-filter]") : null;
    if (filterButton) { filter = filterButton.dataset.castleFilter || "all"; render(); return; }
    const regionButton = event.target instanceof Element ? event.target.closest("[data-castle-region]") : null;
    if (regionButton) { region = regionButton.dataset.castleRegion || "all"; render(); return; }
    const visitButton = event.target instanceof Element ? event.target.closest("[data-castle-visit-action]") : null;
    if (!visitButton) return;
    const castleId = visitButton.dataset.castleId;
    const action = visitButton.dataset.castleVisitAction;
    if (!castleId || !window.OnsenCastleVisits) return;
    if (action === "add") window.OnsenCastleVisits.registerPastVisit(castleId);
    if (action === "remove") window.OnsenCastleVisits.removePastVisit(castleId);
    render();
  }

  function setMode(next) {
    mode = next === "castle" ? "castle" : "onsen";
    sessionStorage.setItem(MODE_KEY, mode);
    applyMode();
    if (mode === "castle") render();
  }

  function applyMode() {
    const panel = ensureUi();
    const switcher = getShell()?.querySelector(".collection-domain-switch");
    if (!panel || !switcher) return;
    const achievementMode = achievementsVisible();
    switcher.hidden = achievementMode;
    if (achievementMode) {
      panel.hidden = true;
      return;
    }

    const castle = mode === "castle";
    for (const node of onsenNodes()) node.hidden = castle;
    panel.hidden = !castle;
    const categoryTabs = document.getElementById("collectionCategoryTabs");
    if (categoryTabs) categoryTabs.hidden = castle;
    for (const button of switcher.querySelectorAll("[data-collection-domain]")) button.classList.toggle("active", button.dataset.collectionDomain === mode);
    const summary = document.getElementById("collectionSummary");
    if (summary) {
      summary.hidden = false;
      if (castle) {
        const progress = window.OnsenCastleVisits?.progress?.() || { visited: 0 };
        summary.textContent = `日本100名城 ${progress.visited}/100 ・ 過去訪問登録対応`;
      } else if (typeof window.renderCollectionProgress === "function") {
        setTimeout(() => window.renderCollectionProgress(), 0);
        window.CollectionNavigationUi?.refresh?.();
      }
    }
  }

  function regionsFor(castles) {
    const order = ["北海道","東北","関東","甲信越","北陸","東海","近畿","中国","四国","九州・沖縄"];
    const values = new Set(castles.map((castle) => castle.region).filter(Boolean));
    return order.filter((name) => values.has(name));
  }
  function renderRegionButtons(castles) {
    const root = document.getElementById("castleRegionRow");
    if (!root) return;
    const values = regionsFor(castles);
    root.innerHTML = `<button type="button" data-castle-region="all">全国</button>${values.map((name) => `<button type="button" data-castle-region="${name}">${name}</button>`).join("")}`;
    for (const button of root.querySelectorAll("[data-castle-region]")) button.classList.toggle("active", button.dataset.castleRegion === region);
  }
  function statusFor(castleId) {
    const visits = window.OnsenCastleVisits;
    if (!visits) return { visited: false, strict: false, manual: false };
    const records = visits.recordsFor(castleId);
    return { visited: records.length > 0, strict: visits.isStrictGps(castleId), manual: records.some((record) => record.recordSource === "castle_past_visit") };
  }
  function candidateCount(castleId) {
    try { return window.OnsenCharacterRuntime?.candidatesForCastle?.(castleId)?.length || 0; } catch { return 0; }
  }

  function render() {
    if (mode !== "castle" || achievementsVisible()) return;
    const panel = ensureUi();
    const data = window.OnsenCastleDomain?.data;
    const visits = window.OnsenCastleVisits;
    if (!panel || !Array.isArray(data?.entities) || !visits) return;
    const castles = data.entities.slice().sort((a, b) => Number(a.japan100No || 0) - Number(b.japan100No || 0));
    renderRegionButtons(castles);
    for (const button of panel.querySelectorAll("[data-castle-filter]")) button.classList.toggle("active", button.dataset.castleFilter === filter);

    const progress = visits.progress();
    const visitedMetric = document.getElementById("castleVisitedMetric");
    const gpsMetric = document.getElementById("castleGpsMetric");
    const buiMetric = document.getElementById("castleBuiMetric");
    if (visitedMetric) visitedMetric.textContent = `${progress.visited}/100`;
    if (gpsMetric) gpsMetric.textContent = String(progress.strictGps);
    if (buiMetric) buiMetric.textContent = `+${Math.round(progress.attackBonus * 100)}%`;
    const summary = document.getElementById("collectionSummary");
    if (summary) summary.textContent = `日本100名城 ${progress.visited}/100 ・ 武威 +${Math.round(progress.attackBonus * 100)}%`;

    const normalizedQuery = normalize(query);
    const filtered = castles.filter((castle) => {
      const status = statusFor(castle.id);
      if (filter === "visited" && !status.visited) return false;
      if (filter === "unvisited" && status.visited) return false;
      if (region !== "all" && castle.region !== region) return false;
      if (normalizedQuery && !normalize(`${castle.name} ${castle.prefecture} ${castle.region} ${castle.japan100No}`).includes(normalizedQuery)) return false;
      return true;
    });

    const root = document.getElementById("castleListRoot");
    if (!root) return;
    root.innerHTML = "";
    if (!filtered.length) { root.innerHTML = `<div class="castle-empty">条件に一致する城はありません。</div>`; return; }
    const byRegion = new Map();
    for (const castle of filtered) {
      if (!byRegion.has(castle.region)) byRegion.set(castle.region, []);
      byRegion.get(castle.region).push(castle);
    }
    for (const regionName of regionsFor(filtered)) {
      const items = byRegion.get(regionName) || [];
      if (!items.length) continue;
      const section = document.createElement("section");
      section.className = "castle-region-section";
      section.innerHTML = `<div class="castle-region-heading"><h3>${regionName}</h3><span>${items.length}城</span></div><div class="castle-list"></div>`;
      const list = section.querySelector(".castle-list");
      for (const castle of items) {
        const status = statusFor(castle.id);
        const candidates = candidateCount(castle.id);
        const row = document.createElement("article");
        row.className = `castle-row${status.visited ? " visited" : ""}${status.strict ? " strict" : ""}`;
        const statusLabel = status.strict ? "GPS確認済" : status.visited ? "訪問登録済" : "未訪問";
        const button = status.strict ? "" : status.manual
          ? `<button class="castle-visit-button remove" type="button" data-castle-visit-action="remove" data-castle-id="${castle.id}">登録解除</button>`
          : `<button class="castle-visit-button" type="button" data-castle-visit-action="add" data-castle-id="${castle.id}">過去訪問</button>`;
        row.innerHTML = `<div class="castle-no">#${String(castle.japan100No).padStart(3, "0")}</div><div class="castle-main"><strong>${castle.name}</strong><span>${castle.prefecture} ・ ${castle.region}</span>${candidates ? `<small>人物候補 ${candidates}人</small>` : ""}</div><div class="castle-actions"><span class="castle-status">${statusLabel}</span>${button}</div>`;
        list.appendChild(row);
      }
      root.appendChild(section);
    }
  }

  async function install() {
    if (installed) return;
    installed = true;
    for (let i = 0; i < 360; i += 1) {
      if (getShell() && window.OnsenCastleDomain && window.OnsenCastleVisits) break;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    ensureUi();
    applyMode();
    if (mode === "castle") render();
    window.addEventListener("onsen-castle-visit-changed", render);
    window.addEventListener("onsen-character-state-changed", render);
    window.addEventListener("onsen-character-runtime-ready", render);
    window.addEventListener("onsen-app-tab-changed", (event) => { if (event.detail?.tab === "collection") setTimeout(() => { applyMode(); if (mode === "castle") render(); }, 35); });
    const achievementView = document.getElementById("achievementView");
    if (achievementView) new MutationObserver(() => setTimeout(applyMode, 0)).observe(achievementView, { attributes: true, attributeFilter: ["hidden"] });
    window.OnsenCastleCollectionUI = { build: BUILD, show: () => { window.OnsenAppShell?.show?.("collection"); setMode("castle"); }, showOnsen: () => setMode("onsen"), render, mode: () => mode };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => install().catch(console.warn), { once: true });
  else install().catch((error) => console.warn("castle collection ui v61 init failed", error));
})();