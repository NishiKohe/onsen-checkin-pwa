(() => {
  const BUILD = "v45";
  let originalSaveCheckins = null;
  let syncTimer = null;
  let installed = false;

  function normalizeVisitFields(record) {
    if (!record || typeof record !== "object") return false;
    let changed = false;
    const categoryId = String(record.categoryId || record.entityType || "onsen");
    const entityId = String(record.entityId || record.spotId || "");
    if (!record.categoryId && categoryId) {
      record.categoryId = categoryId;
      changed = true;
    }
    if (!record.entityType && categoryId) {
      record.entityType = categoryId;
      changed = true;
    }
    if (!record.entityId && entityId) {
      record.entityId = entityId;
      changed = true;
    }
    if (!record.spotId && categoryId === "onsen" && entityId) {
      record.spotId = entityId;
      changed = true;
    }
    return changed;
  }

  function normalizeVisitList(list) {
    let changed = false;
    for (const record of list || []) changed = normalizeVisitFields(record) || changed;
    return changed;
  }

  function wrapSaveCheckins() {
    if (originalSaveCheckins || typeof saveCheckins !== "function") return false;
    originalSaveCheckins = saveCheckins;
    saveCheckins = function domainAwareSaveCheckins(list) {
      normalizeVisitList(list);
      const result = originalSaveCheckins(list);
      scheduleSync();
      return result;
    };
    return true;
  }

  function migrateExistingCheckins() {
    if (typeof loadCheckins !== "function" || typeof saveCheckins !== "function") return false;
    const list = loadCheckins();
    if (!Array.isArray(list) || !normalizeVisitList(list)) return false;
    saveCheckins(list);
    return true;
  }

  function syncEntities() {
    try {
      if (typeof spots !== "undefined" && Array.isArray(spots) && spots.length) {
        window.AppDomain?.entities?.syncLegacySpots?.(spots);
      }
    } catch (err) {
      console.warn("domain entity sync skipped", err);
    }
  }

  function syncCollections() {
    try {
      const getter = window.getCollectionDefinitions || (typeof getCollectionDefinitions === "function" ? getCollectionDefinitions : null);
      const definitions = getter?.() || [];
      if (Array.isArray(definitions) && definitions.length) {
        window.AppDomain?.collections?.replace?.(definitions, { source: "legacy-collection-runtime", clear: false });
      }
    } catch (err) {
      console.warn("domain collection sync skipped", err);
    }
  }

  function registerAchievements(list) {
    for (const definition of list || []) window.AppDomain?.achievements?.register?.(definition);
  }

  function syncAchievements() {
    try {
      const standard = window.OnsenAchievements?.getDefinitions?.() || [];
      const onsite = window.OnsenOnsiteAchievements?.getDefinitions?.() || [];
      if (Array.isArray(standard)) registerAchievements(standard);
      if (Array.isArray(onsite)) registerAchievements(onsite);
    } catch (err) {
      console.warn("domain achievement sync skipped", err);
    }
  }

  function installVisitCompatibilityExports() {
    if (!window.AppDomain?.visits || typeof loadCheckins !== "function") return;
    window.isSpotOnsiteVerified = (spotId) => loadCheckins().some((item) =>
      String(item.entityId || item.spotId || "") === String(spotId || "") && window.AppDomain.visits.isOnsite(item)
    );
    window.isGroupOnsiteComplete = (memberIds) => (memberIds || []).every((id) => window.isSpotOnsiteVerified(id));
    window.getVisitVerificationSummary = () => {
      const byEntity = new Map();
      for (const item of loadCheckins()) {
        const visit = window.AppDomain.visits.normalize(item);
        if (!visit) continue;
        const key = `${visit.categoryId}:${visit.entityId}`;
        const current = byEntity.get(key);
        const onsite = window.AppDomain.visits.isOnsite(item);
        if (!current || (onsite && !current.onsite)) byEntity.set(key, { onsite, visit });
      }
      const onsite = [...byEntity.values()].filter((entry) => entry.onsite).length;
      return { total: byEntity.size, onsite, recordedOnly: byEntity.size - onsite };
    };
  }

  function syncAll() {
    if (!window.AppDomain) return null;
    syncEntities();
    syncCollections();
    syncAchievements();
    installVisitCompatibilityExports();
    const snapshot = window.AppDomain.snapshot?.() || null;
    if (snapshot) {
      document.documentElement.dataset.domainModel = String(snapshot.modelVersion || 1);
      window.dispatchEvent(new CustomEvent("app-domain-synced", { detail: { ...snapshot, build: BUILD } }));
    }
    return snapshot;
  }

  function scheduleSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncAll, 80);
  }

  async function install() {
    if (installed) return;
    for (let i = 0; i < 300; i++) {
      const ready = !!window.AppDomain && typeof loadCheckins === "function" && typeof saveCheckins === "function";
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!window.AppDomain) throw new Error("AppDomain was not ready");
    installed = true;
    wrapSaveCheckins();
    migrateExistingCheckins();
    syncAll();

    let attempts = 0;
    const warmup = setInterval(() => {
      syncAll();
      attempts += 1;
      if (attempts >= 20) clearInterval(warmup);
    }, 500);

    window.addEventListener("storage", scheduleSync);
    window.addEventListener("pageshow", scheduleSync);
    window.addEventListener("onsen-app-tab-changed", scheduleSync);
    window.addEventListener("app-domain-request-sync", scheduleSync);

    window.AppDomainBridge = {
      build: BUILD,
      sync: syncAll,
      normalizeExistingVisits: migrateExistingCheckins,
      snapshot: () => window.AppDomain?.snapshot?.() || null
    };
  }

  install().catch((err) => console.warn("domain runtime bridge init failed", err));
})();
