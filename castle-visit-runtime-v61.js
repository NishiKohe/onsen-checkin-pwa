(() => {
  const BUILD = "v61";
  const STATE_KEY = "castleVisitsV1";

  function storage() { return window.OnsenUserStorage || null; }
  function readRaw() {
    const raw = storage()?.readUserItem?.(STATE_KEY);
    if (raw != null) {
      try { return JSON.parse(raw); } catch {}
    }
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || "null"); } catch { return null; }
  }
  function writeRaw(value) {
    const text = JSON.stringify(value);
    if (storage()?.writeUserItem) storage().writeUserItem(STATE_KEY, text);
    else localStorage.setItem(STATE_KEY, text);
  }
  function defaultState() {
    return { schemaVersion: 1, records: [], updatedAt: Date.now() };
  }
  function normalizeState(raw) {
    const base = defaultState();
    const state = raw && typeof raw === "object" ? raw : {};
    const records = Array.isArray(state.records) ? state.records.filter((record) => record?.entityId || record?.spotId) : [];
    return { ...base, ...state, records };
  }
  function loadState() { return normalizeState(readRaw()); }
  function saveState(state, reason = "update", detail = {}) {
    const next = normalizeState(state);
    next.updatedAt = Date.now();
    writeRaw(next);
    window.dispatchEvent(new CustomEvent("onsen-castle-visit-changed", { detail: { build: BUILD, reason, ...detail, state: next } }));
    return next;
  }
  function list() { return loadState().records.slice(); }
  function recordsFor(castleId) {
    const id = String(castleId || "");
    return list().filter((record) => String(record.entityId || record.spotId || "") === id);
  }
  function isStrictRecord(record) {
    return record?.verificationLevel === "onsite" && String(record?.verificationType || "").startsWith("gps_");
  }
  function isVisited(castleId) { return recordsFor(castleId).length > 0; }
  function isStrictGps(castleId) { return recordsFor(castleId).some(isStrictRecord); }
  function uniqueVisitedIds() { return [...new Set(list().map((record) => String(record.entityId || record.spotId || "")).filter(Boolean))]; }
  function strictGpsIds() { return [...new Set(list().filter(isStrictRecord).map((record) => String(record.entityId || record.spotId || "")).filter(Boolean))]; }

  function registerPastVisit(castleId, occurredAt = Date.now()) {
    const id = String(castleId || "");
    if (!id) return { ok: false, reason: "invalid_castle" };
    const state = loadState();
    const alreadyManual = state.records.some((record) => String(record.entityId || record.spotId || "") === id && record.recordSource === "castle_past_visit");
    if (alreadyManual) return { ok: true, already: true, state };
    const record = {
      categoryId: "castle",
      entityType: "castle",
      entityId: id,
      spotId: id,
      checkedAt: Number(occurredAt || Date.now()),
      verificationLevel: "recorded",
      verificationType: "self_report",
      recordSource: "castle_past_visit",
      evidence: [{ type: "manual_past_visit", recordedAt: Date.now() }]
    };
    state.records.push(record);
    return { ok: true, record, state: saveState(state, "past_visit_registered", { castleId: id, strictGps: false }) };
  }

  function removePastVisit(castleId) {
    const id = String(castleId || "");
    const state = loadState();
    const before = state.records.length;
    state.records = state.records.filter((record) => !(String(record.entityId || record.spotId || "") === id && record.recordSource === "castle_past_visit"));
    if (state.records.length === before) return { ok: false, reason: "not_found", state };
    return { ok: true, state: saveState(state, "past_visit_removed", { castleId: id, strictGps: isStrictGps(id) }) };
  }

  function registerStrictGpsVisit(castleId, payload = {}) {
    const id = String(castleId || "");
    if (!id) return { ok: false, reason: "invalid_castle" };
    if (isStrictGps(id)) return { ok: true, already: true, state: loadState() };
    const state = loadState();
    const record = {
      categoryId: "castle",
      entityType: "castle",
      entityId: id,
      spotId: id,
      checkedAt: Number(payload.checkedAt || Date.now()),
      verificationLevel: "onsite",
      verificationType: "gps_manual",
      recordSource: "castle_checkin_button",
      lat: Number.isFinite(Number(payload.lat)) ? Number(payload.lat) : null,
      lng: Number.isFinite(Number(payload.lng)) ? Number(payload.lng) : null,
      accuracyM: Number.isFinite(Number(payload.accuracyM)) ? Number(payload.accuracyM) : null,
      evidence: [{ type: "gps", recordedAt: Date.now(), accuracyM: payload.accuracyM ?? null }]
    };
    state.records.push(record);
    return { ok: true, record, state: saveState(state, "strict_gps_visit", { castleId: id, strictGps: true }) };
  }

  function progress() {
    const visited = uniqueVisitedIds().length;
    const strict = strictGpsIds().length;
    const attackBonus = Math.min(0.50, 0.05 * Math.sqrt(visited));
    return { visited, total: 100, strictGps: strict, attackBonus };
  }

  async function install() {
    for (let i = 0; i < 300; i += 1) {
      if (window.OnsenUserStorage && window.OnsenCastleDomain) break;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    window.OnsenCastleVisits = {
      build: BUILD,
      stateKey: STATE_KEY,
      loadState,
      saveState,
      list,
      recordsFor,
      isVisited,
      isStrictGps,
      uniqueVisitedIds,
      strictGpsIds,
      registerPastVisit,
      removePastVisit,
      registerStrictGpsVisit,
      progress
    };
    window.dispatchEvent(new CustomEvent("onsen-castle-visits-ready", { detail: { build: BUILD, progress: progress() } }));
  }

  install().catch((error) => console.warn("castle visit runtime v61 init failed", error));
})();