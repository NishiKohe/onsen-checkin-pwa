(() => {
  const configs = [
    {
      collectionId: "national_recreation_spa",
      hierarchyEyebrow: "AREA TITLES",
      hierarchyTitle: "地方・都道府県の国民保養温泉地",
      hierarchyDescription: "地方・都道府県ごとの進捗を確認できます。県単位の実績は対象が複数ある地域を中心に扱います。",
      earnedLabel: "地域制覇",
      nationalLabel: "全国",
      noteSuffix: "地方・都道府県単位の進捗・称号に対応。",
      progressMode: "spots",
      makeCompletionTitle: (scopeName) => `${scopeName} 国民保養温泉地制覇`,
      regionRemainingLabel: (remaining) => `あと${remaining}湯で地方制覇`,
      itemCountSuffix: "湯",
      hideSourceTargets: false
    },
    {
      collectionId: "meito_hyakusen",
      hierarchyEyebrow: "AREA TITLES",
      hierarchyTitle: "地方・都道府県の名湯百選",
      hierarchyDescription: "名湯百選を地方・都道府県単位で追えます。地方制覇を旅の中期目標として扱います。",
      earnedLabel: "地域制覇",
      nationalLabel: "全国",
      noteSuffix: "地方・都道府県単位の進捗・称号に対応。",
      progressMode: "spots",
      makeCompletionTitle: (scopeName) => `${scopeName} 名湯百選制覇`,
      regionRemainingLabel: (remaining) => `あと${remaining}湯で地方制覇`,
      itemCountSuffix: "湯",
      hideSourceTargets: false
    }
  ];

  function install() {
    if (!window.CollectionAreaHierarchy?.register) return false;
    for (const config of configs) window.CollectionAreaHierarchy.register(config);
    return true;
  }

  let tries = 0;
  const timer = setInterval(() => {
    if (install() || ++tries > 200) clearInterval(timer);
  }, 50);
  install();
})();