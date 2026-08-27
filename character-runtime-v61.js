(() => {
  const BUILD = "v61";
  const STATE_KEY = "characterStateV1";
  const MANIFEST_URL = "./data/characters/manifest-v62.json";
  const RECRUIT_COST = 100;
  const DUPLICATE_BOND_POINTS = 3;
  const BOND_THRESHOLDS = [0, 3, 8, 15, 25, 40];
  let catalog = [];
  let byId = new Map();
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
    return {
      schemaVersion: 1,
      recruited: {},
      discovered: {},
      guaranteedCastleClaimed: {},
      recruitHistory: [],
      notifications: { newCharacters: 0, newCandidates: 0 },
      debug: { unlockAllCandidates: false },
      updatedAt: Date.now()
    };
  }
  function normalizeState(raw) {
    const base = defaultState();
    const state = raw && typeof raw === "object" ? raw : {};
    return {
      ...base,
      ...state,
      recruited: { ...(state.recruited || {}) },
      discovered: { ...(state.discovered || {}) },
      guaranteedCastleClaimed: { ...(state.guaranteedCastleClaimed || {}) },
      recruitHistory: Array.isArray(state.recruitHistory) ? state.recruitHistory.slice(-60) : [],
      notifications: { ...base.notifications, ...(state.notifications || {}) },
      debug: { ...base.debug, ...(state.debug || {}) }
    };
  }
  function loadState() { return normalizeState(readRaw()); }
  function saveState(state, reason = "update") {
    const next = normalizeState(state);
    next.updatedAt = Date.now();
    writeRaw(next);
    window.dispatchEvent(new CustomEvent("onsen-character-state-changed", { detail: { build: BUILD, reason, state: next } }));
    return next;
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`${url} load failed: ${response.status}`);
    return response.json();
  }
  async function loadCatalog() {
    const manifest = await fetchJson(MANIFEST_URL);
    const shards = await Promise.all((manifest.shards || []).map((path) => fetchJson(`./${String(path).replace(/^\.\//, "")}`)));
    catalog = shards.flatMap((data) => Array.isArray(data?.characters) ? data.characters : (Array.isArray(data?.entries) ? data.entries : []));
    if (catalog.length !== Number(manifest.characterCount || 50)) console.warn("character seed count mismatch", catalog.length, manifest.characterCount);
    byId = new Map(catalog.map((character) => [character.id, character]));
    return catalog;
  }

  function castleVisits() { return window.OnsenCastleVisits?.list?.() || []; }
  function visitedCastleIds() {
    return new Set(castleVisits().map((record) => String(record.entityId || record.spotId || "")).filter(Boolean));
  }
  function strictCastleIds() {
    return new Set(castleVisits().filter((record) => record.verificationLevel === "onsite" && String(record.verificationType || "").startsWith("gps_")).map((record) => String(record.entityId || record.spotId || "")).filter(Boolean));
  }
  function visitedRegions() {
    const ids = visitedCastleIds();
    const castles = window.OnsenCastleDomain?.data?.entities || [];
    return new Set(castles.filter((castle) => ids.has(castle.id)).map((castle) => castle.region).filter(Boolean));
  }

  function travelUnlockReason(character) {
    if (!character) return null;
    const castleIds = visitedCastleIds();
    const regions = visitedRegions();
    const recruitment = character.recruitment || {};
    const guaranteed = (recruitment.guaranteedCastleIds || []).find((id) => castleIds.has(id));
    if (guaranteed) return `castle:${guaranteed}`;
    const castle = (recruitment.unlockCastleIds || []).find((id) => castleIds.has(id));
    if (castle) return `castle:${castle}`;
    const region = (recruitment.unlockRegions || []).find((name) => regions.has(name));
    if (region) return `region:${region}`;
    return null;
  }

  function isCandidateUnlocked(character, state = loadState()) {
    if (!character) return false;
    if (state.debug.unlockAllCandidates) return true;
    if (state.recruited[character.id]) return true;
    if (state.discovered[character.id]) return true;
    return !!travelUnlockReason(character);
  }

  function syncDiscoveries({ notify = false } = {}) {
    if (!ready) return loadState();
    const state = loadState();
    let added = 0;
    for (const character of catalog) {
      const reason = travelUnlockReason(character);
      if (reason && !state.discovered[character.id]) {
        state.discovered[character.id] = { discoveredAt: Date.now(), source: "travel_unlock", reason };
        added += 1;
      }
    }
    if (!added) return state;
    if (notify) state.notifications.newCandidates = Number(state.notifications.newCandidates || 0) + added;
    return saveState(state, "character_candidates_unlocked");
  }

  function bondRankFor(points) {
    const value = Math.max(0, Number(points || 0));
    let rank = 0;
    for (let i = 1; i < BOND_THRESHOLDS.length; i += 1) if (value >= BOND_THRESHOLDS[i]) rank = i;
    return Math.min(5, rank);
  }

  function addRecruit(state, character, source, metadata = {}) {
    const existing = state.recruited[character.id];
    const now = Date.now();
    let duplicate = false;
    if (existing) {
      duplicate = true;
      const points = Number(existing.bondPoints || 0) + DUPLICATE_BOND_POINTS;
      state.recruited[character.id] = { ...existing, bondPoints: points, bondRank: bondRankFor(points), lastDuplicateAt: now };
    } else {
      state.recruited[character.id] = { recruitedAt: now, source, bondPoints: 0, bondRank: 0, ...metadata };
      state.notifications.newCharacters = Number(state.notifications.newCharacters || 0) + 1;
    }
    state.discovered[character.id] = state.discovered[character.id] || { discoveredAt: now, source };
    state.recruitHistory.push({ characterId: character.id, name: character.name, source, duplicate, at: now });
    state.recruitHistory = state.recruitHistory.slice(-60);
    return { duplicate, bondRank: state.recruited[character.id].bondRank };
  }

  function currentPool() {
    if (!ready) return [];
    const state = syncDiscoveries();
    return catalog.filter((character) => isCandidateUnlocked(character, state));
  }
  function weightedPick(pool, state) {
    const candidates = pool.map((character) => {
      let weight = Math.max(0.1, Number(character.recruitment?.yusenPoolWeight || 1));
      if (!state.recruited[character.id]) weight *= 1.7;
      return { character, weight };
    });
    const total = candidates.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * total;
    for (const item of candidates) { roll -= item.weight; if (roll <= 0) return item.character; }
    return candidates.at(-1)?.character || null;
  }

  function spendYusen(cost) {
    const runtime = window.OnsenGameRuntime;
    if (!runtime?.loadState || !runtime?.saveState) return { ok: false, reason: "runtime_not_ready" };
    const state = runtime.loadState();
    const amount = Math.max(0, Math.floor(Number(cost || 0)));
    if (Number(state.wallet?.yusen || 0) < amount) return { ok: false, reason: "not_enough_yusen", state };
    state.wallet.yusen = Number(state.wallet.yusen || 0) - amount;
    return { ok: true, state: runtime.saveState(state, "character_recruit_spend") };
  }

  function recruitWithYusen() {
    const pool = currentPool();
    if (!pool.length) return { ok: false, reason: "empty_pool", cost: RECRUIT_COST };
    const paid = spendYusen(RECRUIT_COST);
    if (!paid.ok) return { ok: false, reason: paid.reason, cost: RECRUIT_COST };
    const state = loadState();
    const character = weightedPick(pool, state);
    if (!character) return { ok: false, reason: "pick_failed", cost: RECRUIT_COST };
    const result = addRecruit(state, character, "yusen_recruit");
    const saved = saveState(state, result.duplicate ? "character_duplicate" : "character_recruited");
    return { ok: true, character, cost: RECRUIT_COST, duplicate: result.duplicate, bondRank: result.bondRank, state: saved };
  }

  function claimGuaranteedForCastle(castleId) {
    const id = String(castleId || "");
    if (!id || !strictCastleIds().has(id)) return { ok: false, reason: "strict_gps_required" };
    const state = loadState();
    if (state.guaranteedCastleClaimed[id]) return { ok: false, reason: "already_claimed" };
    const matches = catalog.filter((character) => (character.recruitment?.guaranteedCastleIds || []).includes(id));
    if (!matches.length) {
      state.guaranteedCastleClaimed[id] = { claimedAt: Date.now(), result: "no_seed_character" };
      saveState(state, "castle_guarantee_empty");
      return { ok: false, reason: "no_character" };
    }
    const character = matches.find((item) => !state.recruited[item.id]) || matches[0];
    const result = addRecruit(state, character, "castle_first_gps", { castleId: id });
    state.guaranteedCastleClaimed[id] = { claimedAt: Date.now(), characterId: character.id };
    const saved = saveState(state, "castle_guaranteed_recruit");
    return { ok: true, character, duplicate: result.duplicate, state: saved };
  }

  function markSeen() {
    const state = loadState();
    if (!Number(state.notifications.newCharacters || 0) && !Number(state.notifications.newCandidates || 0)) return state;
    state.notifications.newCharacters = 0;
    state.notifications.newCandidates = 0;
    return saveState(state, "characters_seen");
  }

  function toggleDebugUnlockAll(force) {
    const state = loadState();
    state.debug.unlockAllCandidates = typeof force === "boolean" ? force : !state.debug.unlockAllCandidates;
    return saveState(state, "debug_character_candidates");
  }

  function getStatus(characterId) {
    const state = loadState();
    const character = byId.get(characterId) || null;
    if (!character) return null;
    const recruited = state.recruited[characterId] || null;
    return { character, recruited, recruitedNow: !!recruited, discovered: !!state.discovered[characterId] || !!travelUnlockReason(character), candidate: isCandidateUnlocked(character, state) };
  }

  function candidatesForCastle(castleId) {
    const id = String(castleId || "");
    return catalog.filter((character) => {
      const recruitment = character.recruitment || {};
      return (recruitment.guaranteedCastleIds || []).includes(id) || (recruitment.unlockCastleIds || []).includes(id);
    });
  }

  function stats() {
    const state = loadState();
    const pool = currentPool();
    return {
      total: catalog.length,
      recruited: Object.keys(state.recruited).length,
      discovered: catalog.filter((character) => state.discovered[character.id] || !!travelUnlockReason(character)).length,
      recruitPool: pool.length,
      unread: Number(state.notifications.newCharacters || 0) + Number(state.notifications.newCandidates || 0),
      cost: RECRUIT_COST
    };
  }

  async function install() {
    for (let i = 0; i < 300; i += 1) {
      if (window.OnsenGameRuntime && window.OnsenCastleDomain && window.OnsenCastleVisits && window.OnsenUserStorage) break;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    await loadCatalog();
    ready = true;
    syncDiscoveries();
    for (const castleId of strictCastleIds()) claimGuaranteedForCastle(castleId);
    window.addEventListener("onsen-castle-visit-changed", (event) => {
      syncDiscoveries({ notify: true });
      if (event.detail?.strictGps) claimGuaranteedForCastle(event.detail.castleId);
    });
    window.OnsenCharacterRuntime = {
      build: BUILD,
      stateKey: STATE_KEY,
      catalog: () => catalog.slice(),
      get: (id) => byId.get(String(id || "")) || null,
      loadState,
      saveState,
      syncDiscoveries,
      getStatus,
      currentPool,
      candidatesForCastle,
      recruitWithYusen,
      claimGuaranteedForCastle,
      markSeen,
      stats,
      bondRankFor,
      toggleDebugUnlockAll,
      constants: { recruitCost: RECRUIT_COST, duplicateBondPoints: DUPLICATE_BOND_POINTS, bondThresholds: BOND_THRESHOLDS.slice() }
    };
    window.dispatchEvent(new CustomEvent("onsen-character-runtime-ready", { detail: { build: BUILD, count: catalog.length } }));
  }

  install().catch((error) => console.warn("character runtime v61 init failed", error));
})();