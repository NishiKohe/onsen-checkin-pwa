(() => {
  const BUILD = "v47";
  const FOOTER_ID = "footerAchievementsTab";
  let navObserver = null;
  let modeObserver = null;
  let syncTimer = null;

  function getNav() {
    return document.querySelector(".app-tabs");
  }

  function getAchievementView() {
    return document.getElementById("achievementView");
  }

  function isAchievementMode() {
    const collectionView = document.getElementById("collectionView");
    const achievementView = getAchievementView();
    return !!collectionView && !collectionView.hidden && !!achievementView && !achievementView.hidden;
  }

  function forceFourColumns() {
    document.documentElement.style.setProperty("--app-tab-count", "4");
  }

  function ensureAchievementButton() {
    const nav = getNav();
    if (!nav) return null;
    let button = document.getElementById(FOOTER_ID);
    if (!button) {
      button = document.createElement("button");
      button.id = FOOTER_ID;
      button.type = "button";
      button.className = "app-tab";
      button.dataset.appTab = "collection";
      button.dataset.footerTab = "achievements";
      button.setAttribute("aria-selected", "false");
      button.textContent = "実績";

      const trip = nav.querySelector('[data-app-tab="trip"]');
      if (trip) nav.insertBefore(button, trip);
      else nav.appendChild(button);
    } else if (!button.dataset.appTab) {
      button.dataset.appTab = "collection";
    }
    forceFourColumns();
    return button;
  }

  function hideNestedModeTabs() {
    const tabs = document.getElementById("collectionModeTabs");
    if (!tabs) return;
    if (!tabs.hidden) tabs.hidden = true;
    if (tabs.getAttribute("aria-hidden") !== "true") tabs.setAttribute("aria-hidden", "true");
  }

  function syncHeaderMode(achievementMode) {
    const header = document.querySelector("#collectionView .collection-header");
    if (!header) return;
    const eyebrow = header.querySelector(".collection-eyebrow");
    const title = header.querySelector("h2");
    const summary = document.getElementById("collectionSummary");
    const eyebrowText = achievementMode ? "ACHIEVEMENTS" : "COLLECTION";
    const titleText = achievementMode ? "実績・称号" : "コレクション";

    if (eyebrow && eyebrow.textContent !== eyebrowText) eyebrow.textContent = eyebrowText;
    if (title && title.textContent !== titleText) title.textContent = titleText;
    if (summary && summary.hidden !== achievementMode) summary.hidden = achievementMode;
  }

  function clickInternalMode(mode) {
    const button = document.querySelector(`[data-collection-mode="${mode}"]`);
    if (button) {
      button.click();
      return true;
    }
    return false;
  }

  function openAchievements() {
    hideNestedModeTabs();
    if (window.OnsenAchievements?.show) {
      window.OnsenAchievements.show();
    } else {
      window.OnsenAppShell?.show?.("collection");
      setTimeout(() => clickInternalMode("achievements"), 0);
    }
    scheduleSync();
  }

  function openCollections() {
    setTimeout(() => {
      hideNestedModeTabs();
      clickInternalMode("collection");
      scheduleSync();
    }, 0);
  }

  function syncActiveState() {
    syncTimer = null;
    const nav = getNav();
    const achievementButton = ensureAchievementButton();
    if (!nav || !achievementButton) return;
    hideNestedModeTabs();
    forceFourColumns();

    const shellTab = document.documentElement.dataset.appTab || "map";
    const achievementMode = shellTab === "collection" && isAchievementMode();
    syncHeaderMode(achievementMode);

    for (const button of nav.querySelectorAll(".app-tab")) {
      let active = false;
      if (button === achievementButton) active = achievementMode;
      else if (button.dataset.appTab === "collection") active = shellTab === "collection" && !achievementMode;
      else if (button.dataset.appTab) active = button.dataset.appTab === shellTab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    }
  }

  function scheduleSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncActiveState, 20);
  }

  function bindNavigationCapture() {
    document.addEventListener("click", (event) => {
      const nav = getNav();
      if (!nav) return;
      const target = event.target instanceof Element ? event.target.closest("button") : null;
      if (!target || !nav.contains(target)) return;

      if (target.id === FOOTER_ID) {
        event.preventDefault();
        event.stopPropagation();
        openAchievements();
        return;
      }

      if (target.dataset.appTab === "collection") openCollections();
    }, true);
  }

  function observeUi() {
    const nav = getNav();
    if (nav && !navObserver) {
      navObserver = new MutationObserver(() => {
        ensureAchievementButton();
        scheduleSync();
      });
      navObserver.observe(nav, { childList: true, subtree: true });
    }

    const shell = document.querySelector("#collectionView .collection-shell");
    if (shell && !modeObserver) {
      modeObserver = new MutationObserver(() => {
        hideNestedModeTabs();
        scheduleSync();
      });
      modeObserver.observe(shell, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    }
  }

  async function install() {
    for (let i = 0; i < 300; i++) {
      if (getNav() && window.OnsenAppShell) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    ensureAchievementButton();
    bindNavigationCapture();
    observeUi();
    hideNestedModeTabs();
    syncActiveState();

    window.addEventListener("onsen-app-tab-changed", scheduleSync);
    window.addEventListener("pageshow", scheduleSync);
    window.addEventListener("app-domain-synced", scheduleSync);

    let attempts = 0;
    const warmup = setInterval(() => {
      ensureAchievementButton();
      hideNestedModeTabs();
      observeUi();
      syncActiveState();
      attempts += 1;
      if (attempts >= 20) clearInterval(warmup);
    }, 400);

    window.OnsenFooterNavigation = {
      build: BUILD,
      openAchievements,
      openCollections,
      refresh: syncActiveState
    };
  }

  install().catch((err) => console.warn("footer navigation init failed", err));
})();
