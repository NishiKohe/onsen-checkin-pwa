(() => {
  const BUILD = "v58";
  const STATE_KEY = "gameStateV1";
  const MAX_ENERGY = 12;
  const START_ENERGY = 5;
  const MOVE_PER_ENERGY_M = 750;
  const MAX_CREDIT_PER_SAMPLE_M = 10000;
  const FRESH_LOCATION_MS = 30 * 60 * 1000;

  const REGION_PREFS = {
    hokkaido_tohoku: ["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県"],
    kanto: ["茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県"],
    koshinetsu_hokuriku: ["新潟県","富山県","石川県","福井県","山梨県","長野県"],
    tokai: ["岐阜県","静岡県","愛知県","三重県"],
    kinki: ["滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県"],
    chugoku_shikoku: ["鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県"],
    kyushu_okinawa: ["福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"]
  };

  const REGION_LABELS = {
    hokkaido_tohoku: "北海道・東北",
    kanto: "関東",
    koshinetsu_hokuriku: "甲信越・北陸",
    tokai: "東海",
    kinki: "近畿",
    chugoku_shikoku: "中国・四国",
    kyushu_okinawa: "九州・沖縄",
    unknown: "全国"
  };

  function defaultState() {
    return {
      schemaVersion: 1,
      wallet: { yusen: 0 },
      energy: {
        value: START_ENERGY,
        max: MAX_ENERGY,
        distanceBankM: 0,
        lastLat: null,
        lastLng: null,
        lastSampleAt: null,
        totalCreditedM: 0,
        earnedFromTravel: 0
      },
      fishing: {
        casts: 0,
        catches: 0,
        collection: {},
        bestQuality: {},
        lastCatch: null
      },
      unlocks: { fishing: true, rogue: false },
      notifications: { newFish: 0 },
      updatedAt: Date.now()
    };
  }

  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "null");
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  function normalizeState(raw) {
    const base = defaultState();
    const state = raw && typeof raw === "object" ? raw : {};
    return {
      ...base,
      ...state,
      wallet: { ...base.wallet, ...(state.wallet || {}) },
      energy: { ...base.energy, ...(state.energy || {}) },
      fishing: {
        ...base.fishing,
        ...(state.fishing || {}),
        collection: { ...(state.fishing?.collection || {}) },
        bestQuality: { ...(state.fishing?.bestQuality || {}) }
      },
      unlocks: { ...base.unlocks, ...(state.unlocks || {}) },
      notifications: { ...base.notifications, ...(state.notifications || {}) }
    };
  }

  function loadState() {
    return normalizeState(readJson(STATE_KEY, null));
  }

  function saveState(state, reason = "update") {
    const next = normalizeState(state);
    next.updatedAt = Date.now();
    localStorage.setItem(STATE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("onsen-game-state-changed", {
      detail: { build: BUILD, reason, state: next }
    }));
    return next;
  }

  function tripSettings() {
    return { tripMode: false, ...(readJson("visitSettingsV1", {}) || {}) };
  }

  function latestLocationSample() {
    const list = readJson("visitLocationSamplesV1", []);
    if (!Array.isArray(list) || !list.length) return null;
    const sample = list[list.length - 1];
    return Number.isFinite(Number(sample?.lat)) && Number.isFinite(Number(sample?.lng)) ? sample : null;
  }

  function haversineM(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (x) => x * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function regionForPrefecture(prefecture) {
    const pref = String(prefecture || "");
    for (const [id, list] of Object.entries(REGION_PREFS)) {
      if (list.includes(pref)) return id;
    }
    return "unknown";
  }

  function nearestSpotFor(lat, lng) {
    try {
      if (typeof spots === "undefined" || !Array.isArray(spots) || !spots.length) return null;
      let best = null;
      for (const spot of spots) {
        if (!Number.isFinite(Number(spot?.lat)) || !Number.isFinite(Number(spot?.lng))) continue;
        const distanceM = haversineM(lat, lng, Number(spot.lat), Number(spot.lng));
        if (!best || distanceM < best.distanceM) best = { spot, distanceM };
      }
      return best;
    } catch {
      return null;
    }
  }

  function getTravelContext() {
    const settings = tripSettings();
    const sample = latestLocationSample();
    const sampledAt = Number(sample?.sampledAt || 0);
    const fresh = !!sample && sampledAt > 0 && Date.now() - sampledAt <= FRESH_LOCATION_MS;
    const nearest = sample ? nearestSpotFor(Number(sample.lat), Number(sample.lng)) : null;
    const regionId = regionForPrefecture(nearest?.spot?.prefecture);
    const nearOnsen = !!nearest && nearest.distanceM <= 5000;
    return {
      tripMode: settings.tripMode === true,
      fresh,
      sampledAt: sampledAt || null,
      lat: sample ? Number(sample.lat) : null,
      lng: sample ? Number(sample.lng) : null,
      accuracyM: sample ? Number(sample.accuracyM || 0) : null,
      regionId,
      regionLabel: REGION_LABELS[regionId] || REGION_LABELS.unknown,
      nearestSpotId: nearest?.spot?.id || null,
      nearestSpotName: nearest?.spot?.name || null,
      nearestPrefecture: nearest?.spot?.prefecture || null,
      nearestDistanceM: nearest ? Math.round(nearest.distanceM) : null,
      nearOnsen,
      rareBonus: settings.tripMode === true && fresh && nearOnsen ? 0.18 : settings.tripMode === true && fresh ? 0.08 : 0
    };
  }

  function processLocationSample(detail) {
    const settings = tripSettings();
    if (!settings.tripMode || !detail) return loadState();
    const lat = Number(detail.lat);
    const lng = Number(detail.lng);
    const accuracyM = Number(detail.accuracyM || 0);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || accuracyM > 500) return loadState();

    const state = loadState();
    const energy = state.energy;
    let creditedM = 0;
    if (Number.isFinite(Number(energy.lastLat)) && Number.isFinite(Number(energy.lastLng))) {
      const rawDistance = haversineM(Number(energy.lastLat), Number(energy.lastLng), lat, lng);
      if (Number.isFinite(rawDistance)) creditedM = Math.min(MAX_CREDIT_PER_SAMPLE_M, Math.max(0, rawDistance));
    }

    energy.lastLat = lat;
    energy.lastLng = lng;
    energy.lastSampleAt = Number(detail.sampledAt || Date.now());
    energy.distanceBankM = Number(energy.distanceBankM || 0) + creditedM;
    energy.totalCreditedM = Number(energy.totalCreditedM || 0) + creditedM;

    const earnable = Math.floor(energy.distanceBankM / MOVE_PER_ENERGY_M);
    if (earnable > 0 && energy.value < energy.max) {
      const gained = Math.min(earnable, energy.max - energy.value);
      energy.value += gained;
      energy.earnedFromTravel = Number(energy.earnedFromTravel || 0) + gained;
      energy.distanceBankM = Math.max(0, energy.distanceBankM - gained * MOVE_PER_ENERGY_M);
      return saveState(state, "travel_energy");
    }
    return saveState(state, "location_sample");
  }

  function consumeEnergy(amount = 1) {
    const state = loadState();
    const cost = Math.max(0, Math.floor(Number(amount || 0)));
    if (state.energy.value < cost) return { ok: false, state };
    state.energy.value -= cost;
    return { ok: true, state: saveState(state, "consume_energy") };
  }

  function addYusen(amount, reason = "reward") {
    const state = loadState();
    const gain = Math.max(0, Math.floor(Number(amount || 0)));
    state.wallet.yusen = Math.max(0, Number(state.wallet.yusen || 0) + gain);
    return saveState(state, reason);
  }

  function recordFishingCast() {
    const state = loadState();
    state.fishing.casts = Number(state.fishing.casts || 0) + 1;
    return saveState(state, "fishing_cast");
  }

  function recordCatch(result) {
    const state = loadState();
    const fishId = String(result?.fishId || "unknown");
    const previous = Number(state.fishing.collection[fishId] || 0);
    const firstCatch = previous === 0;
    state.fishing.catches = Number(state.fishing.catches || 0) + 1;
    state.fishing.collection[fishId] = previous + 1;
    const qualityScore = Number(result?.qualityScore || 0);
    state.fishing.bestQuality[fishId] = Math.max(Number(state.fishing.bestQuality[fishId] || 0), qualityScore);
    state.fishing.lastCatch = { ...result, firstCatch, caughtAt: Date.now() };
    if (firstCatch) state.notifications.newFish = Number(state.notifications.newFish || 0) + 1;
    state.wallet.yusen = Math.max(0, Number(state.wallet.yusen || 0) + Math.max(0, Math.floor(Number(result?.rewardYusen || 0))));
    return { firstCatch, state: saveState(state, "fishing_catch") };
  }

  function markGameSeen() {
    const state = loadState();
    if (Number(state.notifications.newFish || 0) <= 0) return state;
    state.notifications.newFish = 0;
    return saveState(state, "game_seen");
  }

  function snapshot() {
    const state = loadState();
    return { build: BUILD, state, context: getTravelContext() };
  }

  window.addEventListener("onsen-location-sample", (event) => processLocationSample(event.detail));

  window.OnsenGameRuntime = {
    build: BUILD,
    stateKey: STATE_KEY,
    loadState,
    saveState,
    getTravelContext,
    processLocationSample,
    consumeEnergy,
    addYusen,
    recordFishingCast,
    recordCatch,
    markGameSeen,
    snapshot,
    constants: { maxEnergy: MAX_ENERGY, movePerEnergyM: MOVE_PER_ENERGY_M }
  };
})();
