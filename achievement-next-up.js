(() => {
  const BUILD = "v70.8";
  const MAX_REMAINING = 3;
  const MAX_ITEMS = 6;
  const RARITY_SCORE = { N: 0, R: 1, SR: 2, SSR: 3, LEGEND: 4 };
  let timer = null;

  function uniqueVisited() {
    const visited = new Set();
    try { for (const item of loadCheckins?.() || []) if (item?.spotId) visited.add(item.spotId); } catch {}
    return visited;
  }

  function allDefinitions() {
    const base = window.OnsenAchievements?.getDefinitions?.() || [];
    const domain = window.OnsenDomainAchievements?.definitions?.() || [];
    const byId = new Map();
    for (const item of [...base, ...domain]) if (item?.id) byId.set(item.id, item);
    const list = [...byId.values()];
    const matches = window.OnsenDomainAchievements?.matchesDefinition;
    return typeof matches === "function" ? list.filter((item) => matches(item)) : list;
  }

  function progressFor(definition, visited) {
    if (String(definition?.id || "").startsWith("domain:") && window.OnsenDomainAchievements?.evaluate) {
      const progress = window.OnsenDomainAchievements.evaluate(definition);
      return { ...progress, remaining: Math.max(0, Number(progress.total || 0) - Number(progress.done || 0)), missingSpotIds: [] };
    }
    if (definition.kind === "visit_count") {
      const done = Math.min(visited.size, Number(definition.visitCount || definition.total || 0));
      const total = Number(definition.visitCount || definition.total || 0);
      return { done, total, remaining: Math.max(0, total - done), missingSpotIds: [] };
    }
    let done = 0;
    let total = 0;
    const missingSpotIds = [];
    for (const spotId of definition.requiredSpotIds || []) {
      const weight = Math.max(0, Number(definition.weights?.[spotId] ?? 1));
      total += weight;
      if (visited.has(spotId)) done += weight;
      else missingSpotIds.push(spotId);
    }
    return { done, total, remaining: Math.max(0, total - done), missingSpotIds };
  }

  function spotName(id) {
    try { return (spots || []).find((spot) => spot.id === id)?.name || id; } catch { return id; }
  }

  function ensurePanel() {
    const view = document.getElementById("achievementView");
    if (!view) return null;
    let panel = document.getElementById("achievementNextUp");
    if (panel) return panel;
    panel = document.createElement("section");
    panel.id = "achievementNextUp";
    panel.className = "achievement-next-up";
    const toolbar = view.querySelector(".achievement-toolbar");
    if (toolbar) toolbar.insertAdjacentElement("beforebegin", panel);
    else view.appendChild(panel);
    return panel;
  }

  function render() {
    if (!window.OnsenAchievements?.getDefinitions || !window.OnsenAchievements?.getState) return;
    const panel = ensurePanel();
    if (!panel) return;
    const definitions = allDefinitions();
    const state = window.OnsenAchievements.getState();
    const visited = uniqueVisited();
    const candidates = [];

    for (const definition of definitions) {
      if (state.unlocks?.[definition.id]) continue;
      const progress = progressFor(definition, visited);
      if (progress.remaining < 1 || progress.remaining > MAX_REMAINING || progress.total <= 1) continue;
      candidates.push({ definition, progress });
    }

    candidates.sort((a, b) =>
      a.progress.remaining - b.progress.remaining ||
      (RARITY_SCORE[b.definition.rarity] || 0) - (RARITY_SCORE[a.definition.rarity] || 0) ||
      (b.progress.done / Math.max(1, b.progress.total)) - (a.progress.done / Math.max(1, a.progress.total)) ||
      a.definition.name.localeCompare(b.definition.name, "ja")
    );

    const visible = candidates.slice(0, MAX_ITEMS);
    panel.innerHTML = `
      <div class="achievement-next-head">
        <div><span>NEXT TARGETS</span><strong>あと少しで解除</strong><p>選択中カテゴリの次の旅先候補を表示します。</p></div>
        <b>${candidates.length}件</b>
      </div>
      <div class="achievement-next-list"></div>`;

    const list = panel.querySelector(".achievement-next-list");
    if (!visible.length) {
      list.innerHTML = `<div class="achievement-next-empty">このカテゴリに、あと1〜3で解除できる実績はありません。</div>`;
      return;
    }

    for (const { definition, progress } of visible) {
      const card = document.createElement("article");
      card.className = "achievement-next-card";
      card.dataset.rarity = definition.rarity || "R";
      const domain = String(definition.id || "").startsWith("domain:");
      const unit = domain ? "件" : definition.id.startsWith("area:onsen_musume") || definition.id === "collection:onsen_musume" ? "人" : "湯";
      const missing = (progress.missingSpotIds || []).slice(0, 3).map(spotName);
      card.innerHTML = `
        <div class="achievement-next-main">
          <span>${escapeHtml(definition.rarity || "R")}</span>
          <strong>${escapeHtml(definition.name)}</strong>
          <p>${missing.length ? `未訪問：${escapeHtml(missing.join(" / "))}` : escapeHtml(definition.description || "")}</p>
        </div>
        <div class="achievement-next-count"><b>あと${progress.remaining}</b><span>${unit}</span></div>`;
      list.appendChild(card);
    }
  }

  function schedule(delay = 60) {
    clearTimeout(timer);
    timer = setTimeout(render, delay);
  }

  async function install() {
    for (let i = 0; i < 300; i++) {
      if (window.OnsenAchievements?.getDefinitions && document.getElementById("collectionView")) {
        schedule(0);
        window.addEventListener("onsen-app-tab-changed", (event) => { if (event.detail?.tab === "collection") schedule(); });
        window.addEventListener("onsen-collection-domain-changed", () => schedule(0));
        window.addEventListener("storage", schedule);
        window.addEventListener("pageshow", schedule);
        for (const eventName of ["onsen-castle-visit-changed", "onsen-scenic-visit-changed", "onsen-domain-achievements-changed", "onsen-scenic-v702-ready"]) window.addEventListener(eventName, schedule);
        document.addEventListener("click", (event) => {
          if (event.target.closest?.("[data-collection-mode='achievements'], .achievement-card-footer button")) schedule();
        }, true);
        window.OnsenAchievementNextUp = { build: BUILD, render, refresh: schedule };
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'\"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  }

  install().catch((err) => console.warn("achievement next-up v70.8 init failed", err));
})();