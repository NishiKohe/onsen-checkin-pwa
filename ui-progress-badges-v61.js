(() => {
  const BUILD = "v61";
  const STATE_KEY = "uiProgressStateV1";
  let timer = null;

  function readJson(key, fallback) {
    try { const parsed = JSON.parse(localStorage.getItem(key) || "null"); return parsed ?? fallback; } catch { return fallback; }
  }
  function writeJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function uniqueVisitedCount() {
    try { return typeof loadCheckins === "function" ? new Set((loadCheckins() || []).map((item) => item.spotId || item.entityId).filter(Boolean)).size : 0; } catch { return 0; }
  }
  function completedCollectionCount() {
    try {
      const definitions = typeof window.getCollectionDefinitions === "function" ? window.getCollectionDefinitions() : [];
      const visited = new Set((typeof loadCheckins === "function" ? loadCheckins() : []).map((item) => item.spotId || item.entityId).filter(Boolean));
      return (definitions || []).filter((definition) => (definition.spots || []).length && (definition.spots || []).every((spot) => visited.has(spot.id))).length;
    } catch { return 0; }
  }
  function castleVisitedCount() { try { return Number(window.OnsenCastleVisits?.progress?.().visited || 0); } catch { return 0; } }
  function achievementUnreadCount() {
    try { const state = window.OnsenAchievements?.getState?.() || readJson("achievementStateV1", {}); return Array.isArray(state?.unreadIds) ? state.unreadIds.length : 0; } catch { return 0; }
  }
  function gameUnreadCount() {
    try {
      const game = window.OnsenGameRuntime?.loadState?.() || {};
      const characters = window.OnsenCharacterRuntime?.loadState?.() || {};
      return Math.max(0, Number(game?.notifications?.newFish || 0)) + Math.max(0, Number(characters?.notifications?.newCharacters || 0)) + Math.max(0, Number(characters?.notifications?.newCandidates || 0));
    } catch { return 0; }
  }
  function pendingCandidateIds() {
    const list = readJson("visitCandidatesV1", []);
    return Array.isArray(list) ? list.filter((item) => item?.status === "pending" && item.id).map((item) => String(item.id)) : [];
  }
  function currentSnapshot() {
    return { visited: uniqueVisitedCount(), completed: completedCollectionCount(), castleVisited: castleVisitedCount(), achievementUnread: achievementUnreadCount(), gameUnread: gameUnreadCount(), pendingCandidateIds: pendingCandidateIds() };
  }
  function loadState(snapshot) {
    const saved = readJson(STATE_KEY, null);
    if (saved?.initialized) return { seenCastleVisited: snapshot.castleVisited, ...saved };
    const initial = { initialized: true, initializedAt: Date.now(), seenVisited: snapshot.visited, seenCompleted: snapshot.completed, seenCastleVisited: snapshot.castleVisited, seenCandidateIds: [...snapshot.pendingCandidateIds] };
    writeJson(STATE_KEY, initial);
    return initial;
  }
  function ensureBadge(button, key) {
    if (!button) return null;
    let badge = button.querySelector(`.v57-tab-badge[data-progress-badge="${key}"]`);
    if (!badge) {
      badge = document.createElement("span"); badge.className = "v57-tab-badge"; badge.dataset.progressBadge = key; badge.setAttribute("aria-hidden", "true"); button.appendChild(badge);
    }
    return badge;
  }
  function setBadge(button, key, count) {
    const badge = ensureBadge(button, key); if (!badge) return;
    const value = Math.max(0, Number(count || 0)); badge.hidden = value <= 0; badge.textContent = value > 99 ? "99+" : String(value); button.classList.toggle("has-progress-badge", value > 0);
  }
  function footerButtons() {
    const nav = document.querySelector(".app-tabs");
    return {
      collection: nav?.querySelector('.app-tab[data-app-tab="collection"]:not([data-footer-tab="achievements"])') || null,
      achievements: document.getElementById("footerAchievementsTab"),
      trip: nav?.querySelector('.app-tab[data-app-tab="trip"]') || null,
      game: nav?.querySelector('.app-tab[data-app-tab="game"]') || null
    };
  }
  function markCollectionSeen(snapshot = currentSnapshot()) {
    const state = loadState(snapshot); state.seenVisited = snapshot.visited; state.seenCompleted = snapshot.completed; state.seenCastleVisited = snapshot.castleVisited; state.collectionSeenAt = Date.now(); writeJson(STATE_KEY, state);
  }
  function markTripSeen(snapshot = currentSnapshot()) {
    const state = loadState(snapshot); state.seenCandidateIds = [...snapshot.pendingCandidateIds]; state.tripSeenAt = Date.now(); writeJson(STATE_KEY, state);
  }
  function markVisibleGameSeen() {
    window.OnsenGameRuntime?.markGameSeen?.();
    if (window.OnsenGameHub?.activeGame?.() === "encyclopedia") window.OnsenCharacterRuntime?.markSeen?.();
  }
  function acknowledgeVisibleProgress(snapshot) {
    const activeTab = document.documentElement.dataset.appTab || "map";
    if (activeTab === "trip") markTripSeen(snapshot);
    if (activeTab === "game" && snapshot.gameUnread > 0) markVisibleGameSeen();
    if (activeTab === "collection") {
      const achievementView = document.getElementById("achievementView");
      if (!achievementView || achievementView.hidden) markCollectionSeen(snapshot);
    }
  }
  function refresh() {
    let snapshot = currentSnapshot(); acknowledgeVisibleProgress(snapshot); snapshot = currentSnapshot();
    const state = loadState(snapshot); const buttons = footerButtons();
    const collectionGain = Math.max(0, snapshot.visited - Number(state.seenVisited || 0));
    const completeGain = Math.max(0, snapshot.completed - Number(state.seenCompleted || 0));
    const castleGain = Math.max(0, snapshot.castleVisited - Number(state.seenCastleVisited || 0));
    const seenCandidates = new Set(state.seenCandidateIds || []);
    const newCandidateCount = snapshot.pendingCandidateIds.filter((id) => !seenCandidates.has(id)).length;
    const collectionBadge = collectionGain + completeGain + castleGain;
    setBadge(buttons.collection, "collection", collectionBadge);
    setBadge(buttons.achievements, "achievements", snapshot.achievementUnread);
    setBadge(buttons.trip, "trip", newCandidateCount);
    setBadge(buttons.game, "game", snapshot.gameUnread);
    document.documentElement.dataset.progressBadges = BUILD;
    window.dispatchEvent(new CustomEvent("onsen-progress-badges-updated", { detail: { build: BUILD, collection: collectionBadge, achievements: snapshot.achievementUnread, trip: newCandidateCount, game: snapshot.gameUnread } }));
  }
  function handleTabChanged(event) {
    const tab = event.detail?.tab; const snapshot = currentSnapshot();
    if (tab === "trip") markTripSeen(snapshot);
    if (tab === "game") markVisibleGameSeen();
    if (tab === "collection") requestAnimationFrame(() => { const achievementView = document.getElementById("achievementView"); if (!achievementView || achievementView.hidden) markCollectionSeen(currentSnapshot()); });
    setTimeout(refresh, 30);
  }
  function bindFooterSeenActions() {
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest(".app-tab") : null; if (!target) return;
      if (target.id === "footerAchievementsTab") { setTimeout(refresh, 80); return; }
      if (target.dataset.appTab === "collection") markCollectionSeen(currentSnapshot());
      if (target.dataset.appTab === "trip") markTripSeen(currentSnapshot());
      if (target.dataset.appTab === "game") window.OnsenGameRuntime?.markGameSeen?.();
      setTimeout(refresh, 80);
    }, true);
  }
  function install() {
    refresh(); bindFooterSeenActions();
    window.addEventListener("onsen-app-tab-changed", handleTabChanged);
    window.addEventListener("onsen-game-state-changed", refresh);
    window.addEventListener("onsen-character-state-changed", refresh);
    window.addEventListener("onsen-castle-visit-changed", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("app-domain-synced", refresh);
    timer = setInterval(refresh, 1200);
    window.OnsenProgressBadges = { build: BUILD, refresh, markCollectionSeen, markTripSeen, snapshot: currentSnapshot };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true }); else install();
})();