(() => {
  const BUILD = "v70";
  const DATA_URL = "./data/scenic-national-v70.json";
  const STATE_KEY = "scenicVisitStateV1";
  const DEFAULT_ACCURACY_M = 500;
  let catalog = null;
  let ready = false;

  function storage() { return window.OnsenUserStorage || null; }
  function readRaw() {
    const raw = storage()?.readUserItem?.(STATE_KEY);
    if (raw != null) { try { return JSON.parse(raw); } catch {} }
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || "null"); } catch { return null; }
  }
  function writeRaw(value) {
    const text = JSON.stringify(value);
    if (storage()?.writeUserItem) storage().writeUserItem(STATE_KEY, text);
    else localStorage.setItem(STATE_KEY, text);
  }
  function defaultState() {
    return { schemaVersion: 1, visited: {}, updatedAt: Date.now() };
  }
  function normalizeState(raw) {
    const base = defaultState(), state = raw && typeof raw === "object" ? raw : {};
    return { ...base, ...state, schemaVersion: 1, visited: { ...(state.visited || {}) } };
  }
  function loadState() { return normalizeState(readRaw()); }
  function saveState(state, reason = "update") {
    const next = normalizeState(state);
    next.updatedAt = Date.now();
    writeRaw(next);
    window.dispatchEvent(new CustomEvent("onsen-scenic-visit-changed", { detail: { build: BUILD, reason, state: next } }));
    return next;
  }

  async function loadCatalog() {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`${DATA_URL} load failed: ${response.status}`);
    catalog = await response.json();
    return catalog;
  }
  function entries() { return Array.isArray(catalog?.entries) ? catalog.entries : []; }
  function seedEntries() { return Array.isArray(catalog?.seedEntries) ? catalog.seedEntries : []; }
  function get(id) { return entries().find((entry) => entry.id === String(id || "")) || seedEntries().find((entry) => entry.id === String(id || "")) || null; }
  function auditedZones(entry) {
    if (!entry || entry.coordinateStatus !== "audited") return [];
    return (Array.isArray(entry.zones) ? entry.zones : []).map((zone, index) => ({
      label: zone?.label || `チェックイン地点${index + 1}`,
      lat: Number(zone?.lat),
      lng: Number(zone?.lng),
      radiusM: Math.max(500, Number(zone?.radiusM || catalog?.checkinPolicy?.defaultRadiusM || 750)),
      accuracyRequiredM: Math.max(DEFAULT_ACCURACY_M, Number(zone?.accuracyRequiredM || catalog?.checkinPolicy?.accuracyRequiredM || DEFAULT_ACCURACY_M))
    })).filter((zone) => Number.isFinite(zone.lat) && Number.isFinite(zone.lng));
  }
  function isVisited(id, state = loadState()) { return !!state.visited[String(id || "")]; }
  function listVisits() { const state = loadState(); return Object.entries(state.visited).map(([id, visit]) => ({ id, ...visit })); }
  function visitCount() { return Object.keys(loadState().visited).length; }
  function specialVisitCount() { return listVisits().filter((visit) => get(visit.id)?.specialScenic === true).length; }
  function progress() {
    return {
      visited: visitCount(),
      total: Number(catalog?.officialCount || 433),
      specialVisited: specialVisitCount(),
      specialTotal: Number(catalog?.specialCount || 36),
      catalogImported: entries().length,
      coordinateReady: entries().filter((entry) => auditedZones(entry).length > 0).length,
      ready
    };
  }
  function registerGpsVisit(id, fix = {}) {
    const entry = get(id), zones = auditedZones(entry);
    if (!entry) return { ok: false, reason: "unknown_scenic" };
    if (!zones.length) return { ok: false, reason: "coordinate_not_audited" };
    const state = loadState();
    const key = String(entry.id);
    if (state.visited[key]?.verificationType === "gps_scenic") return { ok: true, already: true, state };
    state.visited[key] = {
      visitedAt: Date.now(),
      verificationType: "gps_scenic",
      lat: Number(fix.lat),
      lng: Number(fix.lng),
      accuracyM: Number(fix.accuracyM || 0),
      zoneLabel: fix.zoneLabel || null,
      distanceM: Number(fix.distanceM || 0),
      source: DATA_URL,
      specialScenic: entry.specialScenic === true
    };
    return { ok: true, already: false, entry, state: saveState(state, "scenic_gps_visit") };
  }
  function registerPastVisit(id, metadata = {}) {
    const entry = get(id);
    if (!entry) return { ok: false, reason: "unknown_scenic" };
    const state = loadState(), key = String(entry.id);
    if (state.visited[key]) return { ok: true, already: true, state };
    state.visited[key] = {
      visitedAt: Number(metadata.visitedAt || Date.now()),
      verificationType: "past_self_report",
      source: metadata.source || "user",
      specialScenic: entry.specialScenic === true
    };
    return { ok: true, already: false, entry, state: saveState(state, "scenic_past_visit") };
  }
  function explorationStats() {
    return {
      scenicSites: visitCount(),
      nationalTreasures: Number(window.OnsenNationalTreasureProgress?.stats?.().visited || 0),
      sourceReady: ready
    };
  }
  function connectProgression() {
    const progression = window.OnsenProgressionRuntime;
    if (!progression?.registerExplorationProvider) return false;
    progression.registerExplorationProvider(() => explorationStats());
    return true;
  }

  async function install() {
    await loadCatalog();
    ready = true;
    connectProgression();
    window.addEventListener("onsen-progression-runtime-ready", connectProgression);
    window.OnsenScenicRuntime = {
      build: BUILD,
      dataUrl: DATA_URL,
      catalog: () => catalog,
      entries,
      seedEntries,
      get,
      auditedZones,
      loadState,
      saveState,
      isVisited,
      listVisits,
      progress,
      registerGpsVisit,
      registerPastVisit,
      explorationStats,
      connectProgression
    };
    window.dispatchEvent(new CustomEvent("onsen-scenic-runtime-ready", { detail: { build: BUILD, progress: progress() } }));
  }

  install().catch((error) => console.warn("scenic runtime v70 init failed", error));
})();
