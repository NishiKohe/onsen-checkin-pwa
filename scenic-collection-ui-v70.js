(() => {
  const BUILD = "v70";
  let installed = false;
  let active = false;
  let query = "";
  let filter = "all";
  let specialOnly = false;

  const esc = (value) => String(value ?? "").replace(/[&<>'\"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  const norm = (value) => String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, "");
  function shell() { return document.querySelector("#collectionView .collection-shell"); }
  function switcher() { return shell()?.querySelector(".collection-domain-switch") || null; }
  function scenicEntries() { return window.OnsenScenicRuntime?.entries?.() || []; }
  function allScenicEntries() {
    const main = scenicEntries();
    const seed = window.OnsenScenicRuntime?.seedEntries?.() || [];
    const ids = new Set(main.map((entry) => entry.id));
    return [...main, ...seed.filter((entry) => !ids.has(entry.id))];
  }
  function onsenNodes() { return [document.querySelector("#collectionView .collection-overview"), document.querySelector("#collectionView .collection-toolbar"), document.getElementById("collectionGrid")].filter(Boolean); }

  function ensureUi() {
    const root = shell();
    const tabs = switcher();
    if (!root || !tabs) return null;
    let button = tabs.querySelector("[data-scenic-domain]");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.dataset.scenicDomain = "scenic";
      button.textContent = "名勝";
      tabs.appendChild(button);
    }
    let panel = document.getElementById("scenicCollectionPanelV70");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "scenicCollectionPanelV70";
      panel.className = "scenic-collection-panel-v70";
      panel.hidden = true;
      panel.innerHTML = `
        <div class="scenic-overview-v70">
          <div><span>名勝</span><b id="scenicVisitedMetricV70">0/433</b></div>
          <div><span>特別名勝</span><b id="scenicSpecialMetricV70">0/36</b></div>
          <div><span>データ整備</span><b id="scenicCatalogMetricV70">36/433</b></div>
        </div>
        <div class="scenic-notice-v70">国指定の名勝を収集します。特別名勝36件を先行収録し、通常名勝397件は順次追加中です。GPSチェックインは座標監査済みの地点だけ有効になります。</div>
        <div class="scenic-toolbar-v70">
          <input id="scenicSearchV70" type="search" placeholder="名勝名・都道府県で検索" autocomplete="off" />
          <div class="scenic-filter-row-v70">
            <button type="button" class="active" data-scenic-filter="all">すべて</button>
            <button type="button" data-scenic-filter="unvisited">未訪問</button>
            <button type="button" data-scenic-filter="visited">訪問済</button>
            <button type="button" data-scenic-special="1">特別名勝のみ</button>
          </div>
        </div>
        <div id="scenicListRootV70"></div>`;
      const anchor = document.getElementById("castleCollectionPanel") || root.querySelector(".collection-toolbar") || tabs;
      anchor.insertAdjacentElement("afterend", panel);
      panel.querySelector("#scenicSearchV70")?.addEventListener("input", (event) => { query = String(event.target.value || "").trim(); render(); });
      panel.addEventListener("click", handlePanelClick);
    }
    return panel;
  }

  function handlePanelClick(event) {
    const filterButton = event.target instanceof Element ? event.target.closest("[data-scenic-filter]") : null;
    if (filterButton) { filter = filterButton.dataset.scenicFilter || "all"; render(); return; }
    const specialButton = event.target instanceof Element ? event.target.closest("[data-scenic-special]") : null;
    if (specialButton) { specialOnly = !specialOnly; render(); return; }
    const visitButton = event.target instanceof Element ? event.target.closest("[data-scenic-visit-action]") : null;
    if (!visitButton || !window.OnsenScenicRuntime) return;
    const id = visitButton.dataset.scenicId;
    const action = visitButton.dataset.scenicVisitAction;
    if (!id) return;
    if (action === "add") window.OnsenScenicRuntime.registerPastVisit(id);
    if (action === "remove") {
      const state = window.OnsenScenicRuntime.loadState();
      delete state.visited[id];
      window.OnsenScenicRuntime.saveState(state, "scenic_past_visit_removed");
    }
    render();
  }

  function isGps(entry) { return window.OnsenScenicRuntime?.auditedZones?.(entry)?.length > 0; }
  function visitStatus(entry) {
    const state = window.OnsenScenicRuntime?.loadState?.() || { visited: {} };
    const record = state.visited?.[entry.id] || null;
    return { visited: !!record, gps: record?.verificationType === "gps_scenic", manual: record?.verificationType === "past_self_report" };
  }

  function setActive(next) {
    active = !!next;
    applyMode();
    if (active) render();
  }

  function applyMode() {
    const panel = ensureUi();
    const tabs = switcher();
    if (!panel || !tabs) return;
    panel.hidden = !active;
    if (active) {
      for (const node of onsenNodes()) node.hidden = true;
      const castlePanel = document.getElementById("castleCollectionPanel");
      if (castlePanel) castlePanel.hidden = true;
      const categoryTabs = document.getElementById("collectionCategoryTabs");
      if (categoryTabs) categoryTabs.hidden = true;
      for (const button of tabs.querySelectorAll("[data-collection-domain]")) button.classList.remove("active");
      tabs.querySelector("[data-scenic-domain]")?.classList.add("active");
    } else {
      tabs.querySelector("[data-scenic-domain]")?.classList.remove("active");
    }
  }

  function render() {
    if (!active) return;
    const runtime = window.OnsenScenicRuntime;
    const panel = ensureUi();
    if (!runtime || !panel) return;
    const progress = runtime.progress();
    document.getElementById("scenicVisitedMetricV70").textContent = `${progress.visited}/${progress.total}`;
    document.getElementById("scenicSpecialMetricV70").textContent = `${progress.specialVisited}/${progress.specialTotal}`;
    document.getElementById("scenicCatalogMetricV70").textContent = `${progress.catalogImported}/${progress.total}`;
    const summary = document.getElementById("collectionSummary");
    if (summary) summary.textContent = `国指定名勝 ${progress.visited}/${progress.total} ・ 特別名勝 ${progress.specialVisited}/${progress.specialTotal} ・ GPS整備 ${progress.coordinateReady}`;

    for (const button of panel.querySelectorAll("[data-scenic-filter]")) button.classList.toggle("active", button.dataset.scenicFilter === filter);
    panel.querySelector("[data-scenic-special]")?.classList.toggle("active", specialOnly);

    const q = norm(query);
    const entries = allScenicEntries().filter((entry) => {
      const status = visitStatus(entry);
      if (filter === "visited" && !status.visited) return false;
      if (filter === "unvisited" && status.visited) return false;
      if (specialOnly && !entry.specialScenic) return false;
      if (q && !norm(`${entry.name} ${(entry.prefectures || []).join(" ")} ${entry.designation}`).includes(q)) return false;
      return true;
    }).sort((a, b) => {
      if (a.specialScenic !== b.specialScenic) return a.specialScenic ? -1 : 1;
      return String((a.prefectures || [""])[0]).localeCompare(String((b.prefectures || [""])[0]), "ja") || String(a.name).localeCompare(String(b.name), "ja");
    });

    const root = document.getElementById("scenicListRootV70");
    if (!root) return;
    if (!entries.length) { root.innerHTML = `<div class="scenic-empty-v70">条件に一致する名勝はありません。</div>`; return; }
    root.innerHTML = entries.map((entry) => {
      const status = visitStatus(entry);
      const gpsReady = isGps(entry);
      const visitLabel = status.gps ? "GPS確認済" : status.visited ? "訪問登録済" : "未訪問";
      const action = status.gps ? "" : status.manual
        ? `<button type="button" class="remove" data-scenic-visit-action="remove" data-scenic-id="${esc(entry.id)}">登録解除</button>`
        : `<button type="button" data-scenic-visit-action="add" data-scenic-id="${esc(entry.id)}">過去訪問</button>`;
      return `<article class="scenic-row-v70${status.visited ? " visited" : ""}${entry.specialScenic ? " special" : ""}">
        <div class="scenic-badge-v70">${entry.specialScenic ? "特" : "名"}</div>
        <div class="scenic-main-v70"><strong>${esc(entry.name)}</strong><span>${esc((entry.prefectures || []).join("・"))} ・ ${esc(entry.designation)}</span><small>${gpsReady ? "GPSチェックイン対応" : "GPS座標監査待ち"}</small></div>
        <div class="scenic-actions-v70"><span>${visitLabel}</span>${action}</div>
      </article>`;
    }).join("");
  }

  async function install() {
    if (installed) return;
    installed = true;
    for (let i = 0; i < 200; i += 1) {
      if (shell() && switcher() && window.OnsenScenicRuntime) break;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    const tabs = switcher();
    if (!tabs || !window.OnsenScenicRuntime) return;
    ensureUi();
    tabs.addEventListener("click", (event) => {
      const scenicButton = event.target instanceof Element ? event.target.closest("[data-scenic-domain]") : null;
      if (scenicButton) { event.preventDefault(); setActive(true); return; }
      const existing = event.target instanceof Element ? event.target.closest("[data-collection-domain]") : null;
      if (existing && active) setActive(false);
    });
    window.addEventListener("onsen-scenic-visit-changed", render);
    window.addEventListener("onsen-app-tab-changed", (event) => {
      if (event.detail?.tab === "collection" && active) setTimeout(() => { applyMode(); render(); }, 30);
    });
    window.OnsenScenicCollectionUI = { build: BUILD, show: () => { window.OnsenAppShell?.show?.("collection"); setActive(true); }, render, isActive: () => active };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => install().catch(console.warn), { once: true });
  else install().catch((error) => console.warn("scenic collection v70 init failed", error));
})();
