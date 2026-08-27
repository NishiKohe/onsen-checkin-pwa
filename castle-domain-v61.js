(() => {
  const BUILD = "v61";
  const DATA_URL = "./data/castles-japan100-v61.json";
  const CATEGORY_ID = "castle";

  const REGION_COLLECTIONS = [
    ["北海道", "castle_japan100_hokkaido", "日本100名城・北海道"],
    ["東北", "castle_japan100_tohoku", "日本100名城・東北"],
    ["関東", "castle_japan100_kanto", "日本100名城・関東"],
    ["甲信越", "castle_japan100_koshinetsu", "日本100名城・甲信越"],
    ["北陸", "castle_japan100_hokuriku", "日本100名城・北陸"],
    ["東海", "castle_japan100_tokai", "日本100名城・東海"],
    ["近畿", "castle_japan100_kinki", "日本100名城・近畿"],
    ["中国", "castle_japan100_chugoku", "日本100名城・中国"],
    ["四国", "castle_japan100_shikoku", "日本100名城・四国"],
    ["九州・沖縄", "castle_japan100_kyushu_okinawa", "日本100名城・九州沖縄"]
  ];

  async function waitForDomain() {
    for (let i = 0; i < 300; i += 1) {
      if (window.AppDomain?.categories?.register && window.AppDomain?.entities?.register) return window.AppDomain;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw new Error("AppDomain was not ready");
  }

  async function loadData() {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`castle data fetch failed: ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data?.entities) || data.entities.length !== 100) {
      throw new Error(`Japan 100 castle dataset must contain 100 entities; got ${data?.entities?.length ?? 0}`);
    }
    return data;
  }

  function registerCollections(domain, data) {
    const allIds = data.entities.map((entity) => entity.id);
    domain.collections.register({
      id: data.collectionId || "castle_japan100",
      categoryId: CATEGORY_ID,
      name: data.name || "日本100名城",
      rarity: "LEGEND",
      section: "official_selection",
      targetIds: allIds,
      note: "日本100名城の100城。過去訪問登録と、将来の厳格GPSチェックインを同じcastle Entityで扱う。"
    }, { source: DATA_URL });

    for (const [region, id, name] of REGION_COLLECTIONS) {
      const targetIds = data.entities.filter((entity) => entity.region === region).map((entity) => entity.id);
      domain.collections.register({
        id,
        categoryId: CATEGORY_ID,
        name,
        rarity: targetIds.length >= 10 ? "SSR" : "SR",
        section: "region",
        targetIds,
        note: `${region}の日本100名城 ${targetIds.length}城`
      }, { source: DATA_URL });
    }
  }

  function registerData(domain, data) {
    domain.categories.register({
      id: CATEGORY_ID,
      entityType: "castle",
      label: "城",
      pluralLabel: "城郭",
      icon: "castle",
      mapLayerId: "castles",
      source: DATA_URL,
      checkinPolicy: {
        mode: "distance_zone",
        defaultRadiusM: 300,
        strictGpsForCharacterUnlock: true
      },
      metadata: {
        activeSelection: "japan_100_castles",
        coordinatesReady: false,
        pastVisitRegistrationReady: true,
        characterSystemReady: true,
        strictGpsUiReady: false
      }
    });

    for (const raw of data.entities) {
      domain.entities.register({
        ...raw,
        categoryId: CATEGORY_ID,
        entityType: "castle",
        aliases: raw.aliases || [],
        tags: [...new Set([...(raw.tags || []), "castle"])]
      }, { categoryId: CATEGORY_ID, source: DATA_URL });
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
      entityCount: domain.entities.list({ categoryId: CATEGORY_ID }).length,
      collections: domain.collections.list({ categoryId: CATEGORY_ID }).map((collection) => ({
        id: collection.id,
        name: collection.name,
        total: collection.targetIds.length
      })),
      dataStatus: data.dataStatus || null
    };
    window.OnsenCastleDomain = {
      build: BUILD,
      data,
      snapshot: () => snapshot
    };
    window.dispatchEvent(new CustomEvent("onsen-castle-domain-ready", { detail: snapshot }));
    console.info("castle domain ready", snapshot);
  }

  install().catch((error) => console.warn("castle domain v61 init failed", error));
})();