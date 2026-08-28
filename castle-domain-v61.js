(() => {
  const BUILD = "v68";
  const DATA_URL = "./data/castles-japan100-v61.json";
  const ZONE_URL = "./data/castle-checkin-zones-v62.json";
  const ZOKU_URL = "./data/castles-zoku100-v68.csv";
  const CATEGORY_ID = "castle";
  const REGIONS = ["北海道","東北","関東","甲信越","北陸","東海","近畿","中国","四国","九州・沖縄"];

  async function waitForDomain() {
    for (let i = 0; i < 300; i += 1) {
      if (window.AppDomain?.categories?.register && window.AppDomain?.entities?.register) return window.AppDomain;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw new Error("AppDomain was not ready");
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`${url} load failed: ${response.status}`);
    return response.json();
  }

  async function fetchText(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`${url} load failed: ${response.status}`);
    return response.text();
  }

  function parseZokuCsv(text) {
    const lines = String(text || "").trim().split(/\r?\n/).slice(1).filter(Boolean);
    return lines.map((line) => {
      const [no, slug, name, prefecture, region, lat, lng, castleType, radiusM] = line.split(",");
      const japan100No = Number(no);
      const id = `castle_${String(japan100No).padStart(3, "0")}_${slug}`;
      const zone = {
        castleId: id,
        japan100No,
        name,
        lat: Number(lat),
        lng: Number(lng),
        radiusM: Math.max(500, Number(radiusM) || 750),
        accuracyRequiredM: 500,
        coordinateStatus: "v68_public_reference_seed",
        checkinZoneStatus: "v68_accessibility_first"
      };
      const entity = {
        id,
        japan100No,
        selectionId: "castle_zoku100",
        selectionName: "続日本100名城",
        name,
        prefecture,
        region,
        castleType,
        tags: ["続日本100名城"],
        characterUnlock: {
          guaranteedRecruitOnFirstGpsVisit: 1,
          discoverCandidatesOnVisit: true,
          mappingStatus: "v68_seed"
        }
      };
      return { entity, zone };
    });
  }

  async function loadData() {
    const [baseData, baseZoneData, zokuText] = await Promise.all([
      fetchJson(DATA_URL),
      fetchJson(ZONE_URL),
      fetchText(ZOKU_URL)
    ]);
    if (!Array.isArray(baseData?.entities) || baseData.entities.length !== 100) {
      throw new Error(`Japan 100 dataset must contain 100 entities; got ${baseData?.entities?.length ?? 0}`);
    }
    if (!Array.isArray(baseZoneData?.entries) || baseZoneData.entries.length !== 100) {
      throw new Error(`Japan 100 zone dataset must contain 100 entries; got ${baseZoneData?.entries?.length ?? 0}`);
    }
    const zoku = parseZokuCsv(zokuText);
    if (zoku.length !== 100) throw new Error(`Continued Japan 100 dataset must contain 100 entries; got ${zoku.length}`);

    const originalEntities = baseData.entities.map((entity) => ({
      ...entity,
      selectionId: entity.selectionId || "castle_japan100",
      selectionName: entity.selectionName || "日本100名城",
      tags: [...new Set([...(entity.tags || []), "日本100名城"])]
    }));
    const entities = [...originalEntities, ...zoku.map((item) => item.entity)].sort((a, b) => Number(a.japan100No) - Number(b.japan100No));
    const entries = [...baseZoneData.entries, ...zoku.map((item) => item.zone)];
    if (entities.length !== 200 || entries.length !== 200) throw new Error("combined castle dataset must contain 200 castles and 200 zones");

    const zoneData = {
      ...baseZoneData,
      version: 2,
      introducedIn: "v68",
      policy: {
        ...(baseZoneData.policy || {}),
        defaultAccuracyRequiredM: 500,
        minimumRadiusM: 500,
        radiusPolicy: "日本100名城はv63ランタイム補正、続日本100名城は都市750m・平山1000m・山城1500m・広域2000-2500mを基本とする。偽陰性回避を優先。"
      },
      entries
    };
    const zonesById = new Map(entries.map((entry) => [entry.castleId, entry]));
    const mergedEntities = entities.map((raw) => {
      const zone = zonesById.get(raw.id);
      return zone ? {
        ...raw,
        lat: Number(zone.lat),
        lng: Number(zone.lng),
        checkinRadiusM: Math.max(500, Number(zone.radiusM) || 750),
        accuracyRequiredM: Number(zone.accuracyRequiredM || 500),
        coordinateStatus: zone.coordinateStatus || "reference_seed",
        checkinZoneStatus: zone.checkinZoneStatus || "v68"
      } : raw;
    });
    return {
      ...baseData,
      version: 2,
      introducedIn: "v68",
      collectionId: "castle_all200",
      name: "日本100名城・続日本100名城",
      entities: mergedEntities,
      zoneData,
      dataStatus: {
        ...(baseData.dataStatus || {}),
        selection: "official_200",
        coordinates: "v68_200_ready",
        checkinZones: "v68_accessibility_first",
        characterMappings: "v68_expanding"
      }
    };
  }

  function registerCollection(domain, id, name, targetIds, section = "official_selection", rarity = "LEGEND") {
    domain.collections.register({ id, categoryId: CATEGORY_ID, name, rarity, section, targetIds, note: `${name} ${targetIds.length}城` }, { source: id === "castle_zoku100" ? ZOKU_URL : DATA_URL });
  }

  function registerCollections(domain, data) {
    const all = data.entities;
    registerCollection(domain, "castle_all200", "日本100名城・続日本100名城", all.map((entity) => entity.id));
    registerCollection(domain, "castle_japan100", "日本100名城", all.filter((entity) => Number(entity.japan100No) <= 100).map((entity) => entity.id));
    registerCollection(domain, "castle_zoku100", "続日本100名城", all.filter((entity) => Number(entity.japan100No) >= 101).map((entity) => entity.id));
    for (const region of REGIONS) {
      const targetIds = all.filter((entity) => entity.region === region).map((entity) => entity.id);
      registerCollection(domain, `castle_all200_${region}`, `名城200・${region}`, targetIds, "region", targetIds.length >= 20 ? "SSR" : "SR");
    }
  }

  function registerData(domain, data) {
    domain.categories.register({
      id: CATEGORY_ID,
      entityType: "castle",
      label: "城",
      pluralLabel: "城郭",
      icon: "castle",
      mapLayerId: "castles-v62",
      source: DATA_URL,
      checkinPolicy: {
        mode: "distance_zone",
        defaultRadiusM: 750,
        defaultAccuracyRequiredM: 500,
        zoneSource: `${ZONE_URL} + ${ZOKU_URL}`,
        strictGpsForCharacterUnlock: true
      },
      metadata: {
        activeSelection: "japan_100_and_continued_100",
        totalCastles: 200,
        coordinatesReady: true,
        coordinateStatus: "v68_200_seed",
        pastVisitRegistrationReady: true,
        characterSystemReady: true,
        strictGpsUiReady: true,
        mapLayerReady: true
      }
    });

    for (const raw of data.entities) {
      domain.entities.register({
        ...raw,
        categoryId: CATEGORY_ID,
        entityType: "castle",
        aliases: raw.aliases || [],
        tags: [...new Set([...(raw.tags || []), "castle"])]
      }, { categoryId: CATEGORY_ID, source: Number(raw.japan100No) >= 101 ? ZOKU_URL : ZONE_URL });
    }
    registerCollections(domain, data);
  }

  async function install() {
    const domain = await waitForDomain();
    const data = await loadData();
    registerData(domain, data);
    const snapshot = {
      build: BUILD,
      category: domain.categories.get(CATEGORY_ID),
      entityCount: data.entities.length,
      locatedEntityCount: data.entities.filter((entity) => Number.isFinite(entity.lat) && Number.isFinite(entity.lng)).length,
      collections: domain.collections.list({ categoryId: CATEGORY_ID }).map((collection) => ({ id: collection.id, name: collection.name, total: collection.targetIds.length })),
      dataStatus: data.dataStatus,
      zoneSource: `${ZONE_URL} + ${ZOKU_URL}`
    };
    window.OnsenCastleDomain = { build: BUILD, data, snapshot: () => snapshot };
    window.dispatchEvent(new CustomEvent("onsen-castle-domain-ready", { detail: snapshot }));
    console.info("castle domain v68 ready", snapshot);
  }

  install().catch((error) => console.warn("castle domain v68 init failed", error));
})();
