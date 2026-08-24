(() => {
  function uniqueCharacters(spot) {
    return [...new Set((spot?.onsenMusumeCharacters || [])
      .filter(Boolean)
      .map((name) => String(name).trim())
      .filter(Boolean))];
  }

  function install() {
    if (!window.CollectionAreaHierarchy?.register) return false;

    window.CollectionAreaHierarchy.register({
      collectionId: "onsen_musume",
      hierarchyEyebrow: "AREA TITLES",
      hierarchyTitle: "地方・都道府県の制覇",
      hierarchyDescription: "地方または都道府県を選ぶと、個別温泉むすめをその範囲だけ表示します。",
      earnedLabel: "獲得称号",
      nationalLabel: "全国",
      noteSuffix: "地方・都道府県単位の制覇称号あり。",
      progressMode: "items",
      makeCompletionTitle: (scopeName) => `${scopeName} 温泉むすめ全制覇`,
      regionRemainingLabel: (remaining) => `あと${remaining}人で地方制覇`,
      itemEyebrow: "CHARACTERS",
      itemTitle: "個別温泉むすめ",
      itemDescription: "キャラをタップすると対応する温泉地を地図で開きます。",
      itemCountSuffix: "人",
      hideSourceTargets: true,
      getItemsForSpot: (spot) => uniqueCharacters(spot).map((name) => ({
        id: `${spot.id}:${name}`,
        primary: name,
        secondary: spot.name,
        prefecture: window.CollectionAreaHierarchy.canonicalPrefecture(spot.prefecture)
      }))
    });
    return true;
  }

  let tries = 0;
  const timer = setInterval(() => {
    if (install() || ++tries > 200) clearInterval(timer);
  }, 50);
  install();
})();
