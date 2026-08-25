(() => {
  const STATE_KEY = "achievementStateV1";
  const MAX_HISTORY = 12;
  const POLL_MS = 900;
  let knownUnlockIds = new Set();
  let initialized = false;
  let toastQueue = [];
  let toastBusy = false;

  function safeParse(value, fallback) {
    try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
  }

  function state() {
    if (window.OnsenAchievements?.getState) return window.OnsenAchievements.getState();
    return safeParse(localStorage.getItem(STATE_KEY), { unlocks: {} });
  }

  function definitions() {
    return window.OnsenAchievements?.getDefinitions?.() || [];
  }

  function checkins() {
    try { return typeof loadCheckins === "function" ? loadCheckins() : []; } catch { return []; }
  }

  function checkinTime(item) {
    return Number(item?.checkedAt || item?.verifiedAt || item?.recordedAt || 0) || 0;
  }

  function earliestBySpot() {
    const map = new Map();
    for (const item of checkins()) {
      if (!item?.spotId) continue;
      const at = checkinTime(item);
      const prev = map.get(item.spotId);
      if (!prev || (at && at < prev.at)) map.set(item.spotId, { item, at });
    }
    return map;
  }

  function completionEvidence(definition, unlock) {
    const bySpot = earliestBySpot();
    if (!definition) return { at: Number(unlock?.unlockedAt || 0) || 0, spotId: null };

    if (definition.kind === "visit_count") {
      const ordered = [...bySpot.entries()]
        .map(([spotId, entry]) => ({ spotId, ...entry }))
        .sort((a, b) => a.at - b.at);
      const index = Math.max(0, Number(definition.visitCount || 1) - 1);
      const entry = ordered[index];
      return entry ? { at: entry.at, spotId: entry.spotId } : { at: Number(unlock?.unlockedAt || 0) || 0, spotId: null };
    }

    let latest = null;
    for (const spotId of definition.requiredSpotIds || []) {
      const entry = bySpot.get(spotId);
      if (!entry) continue;
      if (!latest || entry.at > latest.at) latest = { at: entry.at, spotId };
    }
    return latest || { at: Number(unlock?.unlockedAt || 0) || 0, spotId: null };
  }

  function spotName(spotId) {
    if (!spotId) return "—";
    try { return (spots || []).find((spot) => spot.id === spotId)?.name || spotId; } catch { return spotId; }
  }

  function formatDate(value) {
    const date = new Date(Number(value || 0));
    if (!Number.isFinite(date.getTime())) return "—";
    return date.toLocaleDateString("ja-JP", { year: "numeric", month: "numeric", day: "numeric" });
  }

  function ensureHistoryPanel() {
    const view = document.getElementById("achievementView");
    if (!view) return null;
    let panel = document.getElementById("achievementHistory");
    if (panel) return panel;

    panel = document.createElement("section");
    panel.id = "achievementHistory";
    panel.className = "achievement-history";
    panel.innerHTML = `
      <div class="achievement-history-head">
        <div><span>HISTORY</span><strong>最近の実績解除</strong><p>最後の条件になった温泉と達成日を記録します。</p></div>
        <b id="achievementHistoryCount">0件</b>
      </div>
      <div id="achievementHistoryList" class="achievement-history-list"></div>`;

    const toolbar = view.querySelector(".achievement-toolbar");
    if (toolbar) toolbar.insertAdjacentElement("beforebegin", panel);
    else view.appendChild(panel);
    return panel;
  }

  function renderHistory() {
    const panel = ensureHistoryPanel();
    if (!panel) return;
    const current = state();
    const defs = new Map(definitions().map((item) => [item.id, item]));
    const records = Object.values(current.unlocks || {})
      .map((unlock) => {
        const definition = defs.get(unlock.achievementId);
        const evidence = completionEvidence(definition, unlock);
        return { unlock, definition, evidence };
      })
      .sort((a, b) => Number(b.unlock.unlockedAt || b.evidence.at || 0) - Number(a.unlock.unlockedAt || a.evidence.at || 0));

    const count = document.getElementById("achievementHistoryCount");
    if (count) count.textContent = `${records.length}件`;
    const list = document.getElementById("achievementHistoryList");
    if (!list) return;
    list.innerHTML = "";

    for (const entry of records.slice(0, MAX_HISTORY)) {
      const row = document.createElement("article");
      row.className = "achievement-history-row";
      row.dataset.rarity = entry.unlock.rarity || entry.definition?.rarity || "R";
      const title = entry.unlock.titleLabel || entry.definition?.titleLabel || "称号";
      const name = entry.unlock.achievementName || entry.definition?.name || entry.unlock.achievementId;
      const place = spotName(entry.evidence.spotId);
      row.innerHTML = `
        <span class="achievement-history-rarity">${escapeHtml(entry.unlock.rarity || entry.definition?.rarity || "R")}</span>
        <div class="achievement-history-main">
          <strong>${escapeHtml(name)}</strong>
          <span>称号「${escapeHtml(title)}」</span>
          <small>${escapeHtml(place)} ・ ${escapeHtml(formatDate(entry.unlock.unlockedAt || entry.evidence.at))}</small>
        </div>`;
      list.appendChild(row);
    }

    if (!records.length) list.innerHTML = `<div class="achievement-history-empty">まだ解除実績はありません。</div>`;
  }

  function ensureToastRoot() {
    let root = document.getElementById("achievementToastRoot");
    if (root) return root;
    root = document.createElement("div");
    root.id = "achievementToastRoot";
    root.className = "achievement-toast-root";
    root.setAttribute("aria-live", "polite");
    document.body.appendChild(root);
    return root;
  }

  function enqueueToast(unlock) {
    toastQueue.push(unlock);
    runToastQueue();
  }

  function runToastQueue() {
    if (toastBusy || !toastQueue.length) return;
    toastBusy = true;
    const unlock = toastQueue.shift();
    const root = ensureToastRoot();
    const toast = document.createElement("button");
    toast.type = "button";
    toast.className = "achievement-unlock-toast";
    toast.dataset.rarity = unlock.rarity || "R";
    toast.innerHTML = `
      <span>ACHIEVEMENT UNLOCKED</span>
      <strong>${escapeHtml(unlock.achievementName || "実績解除")}</strong>
      <small>称号「${escapeHtml(unlock.titleLabel || "称号獲得") }」</small>`;
    toast.addEventListener("click", () => {
      window.OnsenAchievements?.show?.();
      setTimeout(() => document.getElementById("achievementHistory")?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 80);
      toast.remove();
      toastBusy = false;
      runToastQueue();
    });
    root.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => toast.classList.remove("show"), 3600);
    setTimeout(() => {
      toast.remove();
      toastBusy = false;
      runToastQueue();
    }, 4050);
  }

  function scanUnlocks({ allowToast = true } = {}) {
    const current = state();
    const ids = Object.keys(current.unlocks || {});
    if (!initialized) {
      knownUnlockIds = new Set(ids);
      initialized = true;
      renderHistory();
      return;
    }

    for (const id of ids) {
      if (knownUnlockIds.has(id)) continue;
      knownUnlockIds.add(id);
      if (allowToast) enqueueToast(current.unlocks[id]);
    }
    for (const id of [...knownUnlockIds]) if (!ids.includes(id)) knownUnlockIds.delete(id);
    renderHistory();
  }

  async function install() {
    for (let i = 0; i < 300; i++) {
      if (window.OnsenAchievements?.getState && document.getElementById("collectionView")) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await new Promise((resolve) => setTimeout(resolve, 450));
    scanUnlocks({ allowToast: false });

    window.setInterval(() => {
      if (document.visibilityState === "visible") scanUnlocks({ allowToast: true });
    }, POLL_MS);
    window.addEventListener("onsen-app-tab-changed", (event) => {
      if (event.detail?.tab === "collection") setTimeout(renderHistory, 60);
    });
    window.addEventListener("pageshow", () => scanUnlocks({ allowToast: false }));
    document.addEventListener("click", (event) => {
      if (event.target.closest?.("[data-collection-mode='achievements']")) setTimeout(renderHistory, 80);
    }, true);

    window.OnsenAchievementHistory = { render: renderHistory, refresh: scanUnlocks };
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'\"]/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[char]));
  }

  install().catch((err) => console.warn("achievement history init failed", err));
})();
