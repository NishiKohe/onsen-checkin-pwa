(() => {
  const MODEL_VERSION = 1;
  const DEFAULT_CATEGORY_ID = "onsen";
  const VALID_VERIFICATION_LEVELS = new Set(["onsite", "recorded"]);
  const STRICT_GPS_TYPES = new Set(["gps_manual", "gps_legacy", "gps_recovered"]);
  const ONSITE_DEFAULT_TYPES = new Set(["gps_manual", "gps_legacy", "gps_recovered", "photo_exif"]);
  const RECORDED_DEFAULT_TYPES = new Set(["photo_manual", "self_report", "self_report_nearby"]);
  const VERIFIED_CANDIDATE_STRENGTHS = new Set(["verified_range", "photo_verified_range", "photo_time_verified_range"]);

  const REGION_BY_PREFECTURE = new Map(Object.entries({
    "北海道": "北海道",
    "青森県": "東北", "岩手県": "東北", "宮城県": "東北", "秋田県": "東北", "山形県": "東北", "福島県": "東北",
    "茨城県": "関東", "栃木県": "関東", "群馬県": "関東", "埼玉県": "関東", "千葉県": "関東", "東京都": "関東", "神奈川県": "関東",
    "新潟県": "甲信越", "山梨県": "甲信越", "長野県": "甲信越",
    "富山県": "北陸", "石川県": "北陸", "福井県": "北陸",
    "岐阜県": "東海", "静岡県": "東海", "愛知県": "東海", "三重県": "東海",
    "滋賀県": "近畿", "京都府": "近畿", "大阪府": "近畿", "兵庫県": "近畿", "奈良県": "近畿", "和歌山県": "近畿",
    "鳥取県": "中国", "島根県": "中国", "岡山県": "中国", "広島県": "中国", "山口県": "中国",
    "徳島県": "四国", "香川県": "四国", "愛媛県": "四国", "高知県": "四国",
    "福岡県": "九州・沖縄", "佐賀県": "九州・沖縄", "長崎県": "九州・沖縄", "熊本県": "九州・沖縄", "大分県": "九州・沖縄", "宮崎県": "九州・沖縄", "鹿児島県": "九州・沖縄", "沖縄県": "九州・沖縄"
  }));

  const categories = new Map();
  const entities = new Map();
  const collections = new Map();
  const achievements = new Map();

  function scopedKey(categoryId, entityId) {
    return `${String(categoryId || DEFAULT_CATEGORY_ID)}:${String(entityId || "")}`;
  }

  function canonicalPrefecture(value) {
    const raw = String(value || "").normalize("NFKC").trim();
    if (!raw) return "";
    if (REGION_BY_PREFECTURE.has(raw)) return raw;
    const suffixes = ["都", "道", "府", "県"];
    for (const suffix of suffixes) {
      const candidate = `${raw}${suffix}`;
      if (REGION_BY_PREFECTURE.has(candidate)) return candidate;
    }
    return raw;
  }

  function registerCategory(input) {
    if (!input?.id) throw new Error("domain category requires id");
    const category = {
      id: String(input.id),
      entityType: String(input.entityType || input.id),
      label: String(input.label || input.id),
      pluralLabel: String(input.pluralLabel || input.label || input.id),
      icon: input.icon || null,
      mapLayerId: input.mapLayerId || null,
      source: input.source || "runtime",
      checkinPolicy: input.checkinPolicy || null,
      metadata: input.metadata && typeof input.metadata === "object" ? { ...input.metadata } : {}
    };
    categories.set(category.id, category);
    return category;
  }

  function getCategory(id = DEFAULT_CATEGORY_ID) {
    return categories.get(String(id || DEFAULT_CATEGORY_ID)) || null;
  }

  function listCategories() {
    return [...categories.values()];
  }

  function normalizeEntity(raw, options = {}) {
    if (!raw?.id) return null;
    const categoryId = String(options.categoryId || raw.categoryId || raw.entityType || DEFAULT_CATEGORY_ID);
    const category = getCategory(categoryId) || registerCategory({ id: categoryId, entityType: raw.entityType || categoryId, label: categoryId });
    const prefecture = canonicalPrefecture(raw.prefecture || raw.region?.prefecture || "");
    const lat = Number(raw.lat ?? raw.location?.lat);
    const lng = Number(raw.lng ?? raw.location?.lng);
    const explicitRegion = typeof raw.region === "string" ? raw.region : (raw.region?.name || "");
    return {
      id: String(raw.id),
      entityId: String(raw.id),
      categoryId,
      entityType: String(raw.entityType || category.entityType || categoryId),
      name: String(raw.name || raw.id),
      prefecture,
      region: String(explicitRegion || REGION_BY_PREFECTURE.get(prefecture) || ""),
      location: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
      aliases: Array.isArray(raw.aliases) ? [...raw.aliases] : [],
      tags: Array.isArray(raw.tags) ? [...raw.tags] : [],
      checkin: {
        radiusM: Number(raw.checkinRadiusM || raw.radiusM || 0) || null,
        zones: Array.isArray(raw.checkinZones) ? raw.checkinZones : (Array.isArray(raw.zones) ? raw.zones : [])
      },
      source: options.source || raw.source || "runtime",
      raw
    };
  }

  function registerEntity(raw, options = {}) {
    const entity = normalizeEntity(raw, options);
    if (!entity) return null;
    entities.set(scopedKey(entity.categoryId, entity.id), entity);
    return entity;
  }

  function replaceCategoryEntities(categoryId, list, options = {}) {
    const category = String(categoryId || DEFAULT_CATEGORY_ID);
    for (const [key, entity] of [...entities.entries()]) {
      if (entity.categoryId === category) entities.delete(key);
    }
    for (const item of list || []) registerEntity(item, { ...options, categoryId: category });
    return listEntities({ categoryId: category });
  }

  function syncLegacySpots(list) {
    const source = Array.isArray(list) ? list : (() => {
      try { return typeof spots !== "undefined" && Array.isArray(spots) ? spots : []; } catch { return []; }
    })();
    if (!source.length) return [];
    return replaceCategoryEntities(DEFAULT_CATEGORY_ID, source, { source: "legacy:spots" });
  }

  function getEntity(entityId, categoryId = DEFAULT_CATEGORY_ID) {
    return entities.get(scopedKey(categoryId, entityId)) || null;
  }

  function listEntities(options = {}) {
    const categoryId = options.categoryId ? String(options.categoryId) : null;
    const ids = Array.isArray(options.ids) ? new Set(options.ids.map(String)) : null;
    return [...entities.values()].filter((entity) =>
      (!categoryId || entity.categoryId === categoryId) && (!ids || ids.has(entity.id))
    );
  }

  function normalizeCollection(definition, options = {}) {
    if (!definition?.id) return null;
    const categoryId = String(definition.categoryId || options.categoryId || DEFAULT_CATEGORY_ID);
    const rawTargets = definition.targetIds || definition.entityIds || definition.spots || [];
    const targetIds = [...new Set(rawTargets.map((target) => String(typeof target === "string" ? target : target?.id || "")).filter(Boolean))];
    return {
      id: String(definition.id),
      categoryId,
      name: String(definition.name || definition.id),
      rarity: String(definition.rarity || "N"),
      section: definition.section || null,
      targetIds,
      metadata: {
        note: definition.note || "",
        completionRarity: definition.completionRarity || null,
        source: options.source || definition.source || "runtime"
      },
      raw: definition
    };
  }

  function registerCollection(definition, options = {}) {
    const collection = normalizeCollection(definition, options);
    if (!collection) return null;
    collections.set(collection.id, collection);
    return collection;
  }

  function replaceCollections(list, options = {}) {
    if (options.clear !== false) collections.clear();
    for (const definition of list || []) registerCollection(definition, options);
    return listCollections();
  }

  function getCollection(id) {
    return collections.get(String(id || "")) || null;
  }

  function listCollections(options = {}) {
    const categoryId = options.categoryId ? String(options.categoryId) : null;
    return [...collections.values()].filter((collection) => !categoryId || collection.categoryId === categoryId);
  }

  function inferVerificationLevel(record) {
    if (VALID_VERIFICATION_LEVELS.has(record?.verificationLevel)) return record.verificationLevel;
    if (ONSITE_DEFAULT_TYPES.has(record?.verificationType)) return "onsite";
    if (RECORDED_DEFAULT_TYPES.has(record?.verificationType)) return "recorded";
    return "recorded";
  }

  function evidenceMethod(record) {
    const type = String(record?.verificationType || "");
    if (type.startsWith("gps_")) return "gps";
    if (type.startsWith("photo_time")) return "photo_trip_log";
    if (type.startsWith("photo_")) return "photo";
    if (type.startsWith("self_report")) return "manual";
    if (record?.recordSource === "checkin_button") return "gps";
    return "unknown";
  }

  function normalizeVisitRecord(record) {
    if (!record) return null;
    const categoryId = String(record.categoryId || record.entityType || DEFAULT_CATEGORY_ID);
    const entityId = String(record.entityId || record.spotId || "");
    if (!entityId) return null;
    const level = inferVerificationLevel(record);
    const method = evidenceMethod(record);
    const strictGps = STRICT_GPS_TYPES.has(record.verificationType) ||
      (level === "onsite" && method === "gps" && record.recordSource === "checkin_button");
    const occurredAt = Number(record.checkedAt || record.verifiedAt || record.recordedAt || record.recoveredAt || 0) || 0;
    return {
      categoryId,
      entityType: String(record.entityType || categoryId),
      entityId,
      spotId: record.spotId || entityId,
      occurredAt,
      verification: {
        level,
        type: record.verificationType || null,
        method,
        strictGps,
        source: record.recordSource || null
      },
      evidence: Array.isArray(record.evidence) ? record.evidence : [],
      raw: record
    };
  }

  function isOnsite(record) {
    return normalizeVisitRecord(record)?.verification.level === "onsite";
  }

  function isGpsVerified(record) {
    return normalizeVisitRecord(record)?.verification.strictGps === true;
  }

  function candidateVerification(candidate) {
    const onsite = VERIFIED_CANDIDATE_STRENGTHS.has(String(candidate?.strength || ""));
    const source = String(candidate?.source || "geolocation");
    let type;
    if (source === "photo_exif") type = "photo_exif";
    else if (source === "photo_time_triplog") type = "photo_time_triplog";
    else type = onsite ? "gps_recovered" : "self_report_nearby";
    return {
      verificationType: type,
      verificationLevel: onsite ? "onsite" : "recorded",
      strictGps: type === "gps_recovered",
      method: type === "gps_recovered" ? "gps" : (type === "photo_time_triplog" ? "photo_trip_log" : (type === "photo_exif" ? "photo" : "manual"))
    };
  }

  function verificationPredicate(mode) {
    if (mode === "gps_onsite") return isGpsVerified;
    if (mode === "onsite") return isOnsite;
    if (mode === "recorded") return (record) => normalizeVisitRecord(record)?.verification.level === "recorded";
    return () => true;
  }

  function uniqueVisits(list, options = {}) {
    const categoryId = String(options.categoryId || DEFAULT_CATEGORY_ID);
    const predicate = verificationPredicate(options.verification || "any");
    const earliest = new Map();
    for (const raw of list || []) {
      const normalized = normalizeVisitRecord(raw);
      if (!normalized || normalized.categoryId !== categoryId || !predicate(raw)) continue;
      const current = earliest.get(normalized.entityId);
      if (!current || (normalized.occurredAt && normalized.occurredAt < current.occurredAt)) earliest.set(normalized.entityId, normalized);
    }
    return earliest;
  }

  function conditionFromAchievement(definition) {
    if (!definition) return null;
    if (definition.condition?.type) return definition.condition;
    const categoryId = String(definition.categoryId || DEFAULT_CATEGORY_ID);
    if (definition.kind === "visit_count") {
      return { type: "visit_count", categoryId, count: Number(definition.visitCount || definition.total || 0) };
    }
    const entityIds = definition.requiredEntityIds || definition.requiredSpotIds;
    if (Array.isArray(entityIds)) {
      return { type: "all_entities", categoryId, entityIds: [...entityIds], weights: definition.weights || null };
    }
    if (definition.collectionId) {
      return { type: "collection_complete", categoryId, collectionId: definition.collectionId };
    }
    return null;
  }

  function evaluateCondition(condition, visits, options = {}) {
    if (!condition?.type) return null;
    const verification = options.verification || condition.verification || "any";
    const categoryId = String(condition.categoryId || options.categoryId || DEFAULT_CATEGORY_ID);
    const earliest = uniqueVisits(visits, { categoryId, verification });

    if (condition.type === "visit_count") {
      const count = Math.max(0, Number(condition.count || 0));
      const ordered = [...earliest.values()].sort((a, b) => a.occurredAt - b.occurredAt);
      const done = Math.min(ordered.length, count);
      const complete = count > 0 && ordered.length >= count;
      const completion = complete ? ordered[count - 1] : null;
      return {
        done,
        total: count,
        complete,
        completedAt: completion?.occurredAt || null,
        completionEntityId: completion?.entityId || null,
        missingEntityIds: []
      };
    }

    let entityIds = [];
    let weights = condition.weights || null;
    if (condition.type === "collection_complete") {
      const collection = getCollection(condition.collectionId);
      if (!collection) return { done: 0, total: 0, complete: false, completedAt: null, completionEntityId: null, missingEntityIds: [] };
      entityIds = collection.targetIds;
    } else if (condition.type === "all_entities") {
      entityIds = Array.isArray(condition.entityIds) ? condition.entityIds.map(String) : [];
    } else {
      return null;
    }

    let done = 0;
    let total = 0;
    let latest = null;
    const missingEntityIds = [];
    for (const entityId of entityIds) {
      const weight = Math.max(0, Number(weights?.[entityId] ?? 1));
      total += weight;
      const visit = earliest.get(entityId);
      if (visit) {
        done += weight;
        if (!latest || visit.occurredAt > latest.occurredAt) latest = visit;
      } else {
        missingEntityIds.push(entityId);
      }
    }
    const complete = total > 0 && missingEntityIds.length === 0;
    return {
      done,
      total,
      complete,
      completedAt: complete ? latest?.occurredAt || Date.now() : null,
      completionEntityId: complete ? latest?.entityId || null : null,
      missingEntityIds
    };
  }

  function normalizeAchievement(definition) {
    if (!definition?.id) return null;
    const condition = conditionFromAchievement(definition);
    return {
      id: String(definition.id),
      categoryId: String(definition.categoryId || DEFAULT_CATEGORY_ID),
      name: String(definition.name || definition.id),
      titleId: definition.titleId || `title:${definition.id}`,
      titleLabel: definition.titleLabel || definition.name || definition.id,
      rarity: definition.rarity || "N",
      verification: definition.verification || "any",
      condition,
      raw: definition
    };
  }

  function registerAchievement(definition) {
    const normalized = normalizeAchievement(definition);
    if (!normalized) return null;
    achievements.set(normalized.id, normalized);
    return normalized;
  }

  function replaceAchievements(list) {
    achievements.clear();
    for (const definition of list || []) registerAchievement(definition);
    return listAchievements();
  }

  function listAchievements(options = {}) {
    const categoryId = options.categoryId ? String(options.categoryId) : null;
    return [...achievements.values()].filter((achievement) => !categoryId || achievement.categoryId === categoryId);
  }

  function evaluateAchievementDefinition(definition, visits) {
    const normalized = normalizeAchievement(definition);
    if (!normalized?.condition) return null;
    return evaluateCondition(normalized.condition, visits, {
      categoryId: normalized.categoryId,
      verification: normalized.verification
    });
  }

  function snapshot() {
    return {
      modelVersion: MODEL_VERSION,
      categories: listCategories().map(({ id, entityType, label }) => ({ id, entityType, label })),
      entityCounts: Object.fromEntries(listCategories().map((category) => [category.id, listEntities({ categoryId: category.id }).length])),
      collectionCount: collections.size,
      achievementCount: achievements.size
    };
  }

  registerCategory({
    id: "onsen",
    entityType: "onsen",
    label: "温泉",
    pluralLabel: "温泉地",
    mapLayerId: "spots",
    source: "legacy-adapter",
    checkinPolicy: { mode: "distance_zone", defaultRadiusM: 750 }
  });

  window.AppDomain = {
    version: MODEL_VERSION,
    categories: { register: registerCategory, get: getCategory, list: listCategories },
    entities: { register: registerEntity, replaceCategory: replaceCategoryEntities, syncLegacySpots, get: getEntity, list: listEntities, canonicalPrefecture },
    collections: { register: registerCollection, replace: replaceCollections, get: getCollection, list: listCollections },
    visits: { normalize: normalizeVisitRecord, isOnsite, isGpsVerified, candidateVerification, unique: uniqueVisits },
    achievements: { register: registerAchievement, replace: replaceAchievements, list: listAchievements, conditionFromDefinition: conditionFromAchievement, evaluateCondition, evaluateDefinition: evaluateAchievementDefinition },
    snapshot
  };

  let attempts = 0;
  const timer = setInterval(() => {
    const synced = syncLegacySpots();
    if (synced.length || ++attempts > 240) clearInterval(timer);
  }, 50);
  syncLegacySpots();
})();