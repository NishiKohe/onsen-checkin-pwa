(() => {
  const SELECTION_IDS = new Set(["national_recreation_spa", "meito_hyakusen"]);
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

  function countFromChip(button) {
    const text = button?.querySelector("strong")?.textContent || "";
    const match = /(\d+)\s*\/\s*(\d+)/.exec(text);
    return match ? { done: Number(match[1]), total: Number(match[2]) } : { done: 0, total: 0 };
  }

  function applyDensity(card) {
    if (!card || !SELECTION_IDS.has(card.dataset.collectionId || "")) return;
    let eligible = 0;
    let complete = 0;

    for (const regionButton of card.querySelectorAll(".collection-area-region")) {
      const progress = countFromChip(regionButton);
      if (!progress.total) continue;
      eligible += 1;
      if (regionButton.classList.contains("complete")) complete += 1;
    }

    for (const wrap of card.querySelectorAll(".collection-area-pref-wrap")) {
      const button = wrap.querySelector(".collection-area-pref");
      const progress = countFromChip(button);
      const title = wrap.querySelector(".collection-area-pref-title");
      if (progress.total < 2) {
        wrap.dataset.singleTargetPrefecture = "1";
        wrap.style.opacity = ".56";
        if (title) title.remove();
        if (button) button.title = "対象1件のため県称号は設定せず、地方制覇の進捗として扱います。";
        continue;
      }
      wrap.dataset.singleTargetPrefecture = "0";
      wrap.style.removeProperty("opacity");
      eligible += 1;
      if (button?.classList.contains("complete")) complete += 1;
    }

    const earned = card.querySelector(".collection-area-earned-count b");
    if (earned && eligible) earned.textContent = `${complete}/${eligible}`;
  }

  function processCards() {
    for (const card of document.querySelectorAll("details.collection-card[data-collection-id]")) applyDensity(card);
  }

  function install() {
    if (!window.CollectionAreaHierarchy?.register) return false;
    for (const config of configs) window.CollectionAreaHierarchy.register(config);
    setTimeout(processCards, 0);
    setTimeout(processCards, 300);
    return true;
  }

  const grid = document.getElementById("collectionGrid");
  if (grid) {
    new MutationObserver(() => setTimeout(processCards, 0)).observe(grid, { childList: true, subtree: true });
  }
  window.addEventListener("storage", () => setTimeout(processCards, 0));
  window.addEventListener("onsen-app-tab-changed", (event) => {
    if (event.detail?.tab === "collection") setTimeout(processCards, 0);
  });

  let tries = 0;
  const timer = setInterval(() => {
    if (install() || ++tries > 200) clearInterval(timer);
  }, 50);
  install();
})();