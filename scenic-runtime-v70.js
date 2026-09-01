(() => {
  const BUILD = "v71";
  const DATA_URL = "./data/scenic-official-v71.json";
  const ZONE_URL = "./data/scenic-checkin-zones-v71.json";
  const STATE_KEY = "scenicVisitStateV1";
  const DEFAULT_ACCURACY_M = 500;
  const LOCATION_MAX_AGE_MS = 2 * 60 * 1000;
  let catalog = null;
  let zoneCatalog = null;
  let byId = new Map();
  let zonesById = new Map();
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
  function defaultState() { return { schemaVersion: 2, visited: {}, updatedAt: Date.now() }; }
  function normalizeState(raw) {
    const base = defaultState(), state = raw && typeof raw === "object" ? raw : {};
    return { ...base, ...state, schemaVersion: 2, visited: { ...(state.visited || {}) } };
  }
  function loadState() { return normalizeState(readRaw()); }
  function saveState(state, reason = "update") {
    const next = normalizeState(state);
    next.updatedAt = Date.now();
    writeRaw(next);
    window.dispatchEvent(new CustomEvent("onsen-scenic-visit-changed", { detail: { build: BUILD, reason, state: next } }));
    window.dispatchEvent(new CustomEvent("onsen-heritage-progress-changed", { detail: { build: BUILD, reason, scenicSites: visitCount(next) } }));
    return next;
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`${url} load failed: ${response.status}`);
    return response.json();
  }
  function normalizeZone(zone, index = 0) {
    const lat = Number(zone?.lat), lng = Number(zone?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      id: String(zone?.id || `zone_${index + 1}`),
      label: String(zone?.label || `チェックイン地点${index + 1}`),
      lat,
      lng,
      radiusM: Math.max(500, Number(zone?.radiusM) || 750),
      accuracyRequiredM: Math.max(DEFAULT_ACCURACY_M, Number(zone?.accuracyRequiredM) || DEFAULT_ACCURACY_M),
      source: zone?.source || null,
      sourceUrl: zone?.sourceUrl || null
    };
  }
  async function loadCatalog() {
    const [master, zones] = await Promise.all([fetchJson(DATA_URL), fetchJson(ZONE_URL)]);
    const entries = Array.isArray(master?.entries) ? master.entries : [];
    const zoneEntries = Array.isArray(zones?.entries) ? zones.entries : [];
    if (entries.length !== 433 || new Set(entries.map((entry) => entry?.id).filter(Boolean)).size !== 433) {
      throw new Error(`official scenic master must contain 433 unique entries; got ${entries.length}`);
    }
    if (zoneEntries.length !== 433) throw new Error(`scenic zone catalog must contain 433 entries; got ${zoneEntries.length}`);
    catalog = master;
    zoneCatalog = zones;
    byId = new Map(entries.filter((entry) => entry?.id).map((entry) => [String(entry.id), entry]));
    zonesById = new Map(zoneEntries.filter((entry) => entry?.scenicId).map((entry) => [String(entry.scenicId), entry]));
    return catalog;
  }
  function entries() { return Array.isArray(catalog?.entries) ? catalog.entries.slice() : []; }
  function seedEntries() { return []; }
  function get(id) { return byId.get(String(id || "")) || null; }
  function zoneRecord(idOrEntry) {
    const id = typeof idOrEntry === "string" ? idOrEntry : idOrEntry?.id;
    return zonesById.get(String(id || "")) || null;
  }
  function referenceZones(idOrEntry) {
    const record = zoneRecord(idOrEntry);
    return (Array.isArray(record?.zones) ? record.zones : []).map(normalizeZone).filter(Boolean);
  }
  function auditedZones(idOrEntry) {
    const record = zoneRecord(idOrEntry);
    if (!record?.checkinEnabled) return [];
    return referenceZones(idOrEntry);
  }
  function isGpsReady(idOrEntry) { return auditedZones(idOrEntry).length > 0; }
  function isVisited(id, state = loadState()) { return !!state.visited[String(id || "")]; }
  function listVisits(state = loadState()) {
    return Object.entries(state.visited || {}).filter(([id]) => byId.has(String(id))).map(([id, visit]) => ({ id, ...visit }));
  }
  function visitCount(state = loadState()) { return listVisits(state).length; }
  function specialVisitCount(state = loadState()) { return listVisits(state).filter((visit) => get(visit.id)?.specialScenic === true).length; }
  function progress() {
    const imported = entries();
    return {
      visited: visitCount(),
      total: Number(catalog?.counts?.total || 433),
      specialVisited: specialVisitCount(),
      specialTotal: Number(catalog?.counts?.special || 36),
      catalogImported: imported.length,
      ordinaryImported: Number(catalog?.counts?.ordinary || imported.filter((entry) => entry.specialScenic !== true).length),
      specialImported: Number(catalog?.counts?.special || imported.filter((entry) => entry.specialScenic === true).length),
      coordinateReference: Number(zoneCatalog?.counts?.officialCoordinates || imported.filter((entry) => Number.isFinite(Number(entry.lat)) && Number.isFinite(Number(entry.lng))).length),
      coordinateReady: Number(zoneCatalog?.counts?.gpsEnabled || imported.filter(isGpsReady).length),
      pendingCoordinateAudit: Number(zoneCatalog?.counts?.pendingMultiZoneOrAudit || 0),
      ready
    };
  }

  function haversineM(lat1, lng1, lat2, lng2) {
    const R = 6371000, rad = (v) => v * Math.PI / 180;
    const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  function normalizeFix(fix = {}) {
    const lat = Number(fix.lat ?? fix.latitude), lng = Number(fix.lng ?? fix.longitude);
    const accuracyM = Number(fix.accuracyM ?? fix.accuracy);
    const sampledAt = Number(fix.sampledAt ?? fix.timestamp ?? Date.now());
    return { lat, lng, accuracyM, sampledAt };
  }
  function evaluatePosition(fix = {}, scenicId = null) {
    const position = normalizeFix(fix);
    if (!Number.isFinite(position.lat) || !Number.isFinite(position.lng)) return { ok: false, reason: "invalid_position", position, matches: [] };
    if (!Number.isFinite(position.accuracyM) || position.accuracyM < 0) return { ok: false, reason: "invalid_accuracy", position, matches: [] };
    if (!Number.isFinite(position.sampledAt) || Date.now() - position.sampledAt > LOCATION_MAX_AGE_MS) return { ok: false, reason: "position_stale", position, matches: [] };

    const targets = scenicId ? [get(scenicId)].filter(Boolean) : entries();
    if (scenicId && !targets.length) return { ok: false, reason: "unknown_scenic", position, matches: [] };
    const matches = [], nearest = [];
    let hasEnabledZone = false, hasAccurateZone = false;
    for (const entry of targets) {
      const zones = auditedZones(entry);
      if (!zones.length) continue;
      hasEnabledZone = true;
      for (const zone of zones) {
        const distanceM = haversineM(position.lat, position.lng, zone.lat, zone.lng);
        const accuracyOk = position.accuracyM <= zone.accuracyRequiredM;
        if (accuracyOk) hasAccurateZone = true;
        const result = { scenicId: entry.id, entry, zone, distanceM, radiusM: zone.radiusM, accuracyOk, inRange: distanceM <= zone.radiusM };
        nearest.push(result);
        if (accuracyOk && result.inRange) matches.push(result);
      }
    }
    matches.sort((a, b) => a.distanceM - b.distanceM);
    nearest.sort((a, b) => a.distanceM - b.distanceM);
    if (matches.length) return { ok: true, reason: "matched", position, matches, best: matches[0] };
    if (scenicId && !hasEnabledZone) return { ok: false, reason: "coordinate_not_audited", position, matches: [], nearest: null };
    if (hasEnabledZone && !hasAccurateZone) return { ok: false, reason: "accuracy_too_low", position, matches: [], nearest: nearest[0] || null };
    return { ok: false, reason: scenicId ? "out_of_range" : "no_match", position, matches: [], nearest: nearest[0] || null };
  }

  function registerGpsVisit(id, fix = {}) {
    const entry = get(id);
    if (!entry) return { ok: false, reason: "unknown_scenic" };
    const evaluation = evaluatePosition(fix, entry.id);
    if (!evaluation.ok) return { ...evaluation, entry };
    const match = evaluation.best;
    const state = loadState(), key = String(entry.id), prior = state.visited[key];
    if (prior?.verificationType === "gps_scenic") return { ok: true, already: true, entry, evaluation, state };
    state.visited[key] = {
      ...(prior || {}),
      visitedAt: Date.now(),
      verificationType: "gps_scenic",
      lat: evaluation.position.lat,
      lng: evaluation.position.lng,
      accuracyM: evaluation.position.accuracyM,
      sampledAt: evaluation.position.sampledAt,
      zoneId: match.zone.id,
      zoneLabel: match.zone.label,
      distanceM: Math.round(match.distanceM),
      radiusM: match.zone.radiusM,
      coordinateSource: match.zone.source || "国指定文化財等データベースCSV",
      source: DATA_URL,
      specialScenic: entry.specialScenic === true
    };
    return { ok: true, already: false, entry, evaluation, state: saveState(state, "scenic_gps_visit") };
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
    window.OnsenScenicRuntime = {
      build: BUILD,
      dataUrl: DATA_URL,
      zoneUrl: ZONE_URL,
      catalog: () => catalog,
      zoneCatalog: () => zoneCatalog,
      entries,
      seedEntries,
      get,
      zoneRecord,
      referenceZones,
      auditedZones,
      isGpsReady,
      evaluatePosition,
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
    connectProgression();
    window.addEventListener("onsen-progression-runtime-ready", connectProgression);
    window.dispatchEvent(new CustomEvent("onsen-scenic-runtime-ready", { detail: { build: BUILD, progress: progress() } }));
  }

  install().catch((error) => console.warn("scenic runtime v71 init failed", error));
})();
