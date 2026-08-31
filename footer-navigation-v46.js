(() => {
  const BUILD = "v70.6";
  const FOOTER_ID = "footerAchievementsTab";
  let installed = false;
  let achievementsWrapped = false;

  function getNav() { return document.querySelector(".app-tabs"); }
  function getAchievementView() { return document.getElementById("achievementView"); }
  function isAchievementMode() {
    const collectionView = document.getElementById("collectionView");
    const achievementView = getAchievementView();
    return !!collectionView && !collectionView.hidden && !!achievementView && !achievementView.hidden;
  }

  function syncColumnCount() {
    const nav = getNav();
    const count = Math.max(1, nav?.querySelectorAll(".app-tab").length || 1);
    document.documentElement.style.setProperty("--app-tab-count", String(count));
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
      button.dataset.appTab = "achievement_proxy";
      button.dataset.footerTab = "achievements";
      button.setAttribute("aria-selected", "false");
      button.textContent = "実績";
      const trip = nav.querySelector('[data-app-tab="trip"]');
      if (trip) nav.insertBefore(button, trip);
      else nav.appendChild(button);
    } else {
      button.dataset.appTab = "achievement_proxy";
      button.dataset.footerTab = "achievements";
    }
    syncColumnCount();
    return button;
  }

  function hideNestedModeTabs() {
    const tabs = document.getElementById("collectionModeTabs");
    if (!tabs) return;
    tabs.hidden = true;
    tabs.setAttribute("aria-hidden", "true");
  }

  function syncHeaderMode(achievementMode) {
    const header = document.querySelector("#collectionView .collection-header");
    if (!header) return;
    const eyebrow = header.querySelector(".collection-eyebrow");
    const title = header.querySelector("h2");
    const summary = document.getElementById("collectionSummary");
    if (eyebrow) eyebrow.textContent = achievementMode ? "ACHIEVEMENTS" : "COLLECTION";
    if (title) title.textContent = achievementMode ? "実績・称号" : "コレクション";
    if (summary) summary.hidden = achievementMode;
  }

  function forceNavTarget(target) {
    const nav = getNav();
    const achievementButton = ensureAchievementButton();
    if (!nav || !achievementButton) return;
    const achievementMode = target === "achievement_proxy";
    document.documentElement.dataset.appNavTab = target;
    document.body?.classList.toggle("achievement-tab-active", achievementMode);
    document.body?.classList.toggle("collection-tab-active", target === "collection");
    for (const button of nav.querySelectorAll(".app-tab")) {
      const active = achievementMode
        ? button === achievementButton
        : button.dataset.appTab === target;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    }
  }

  function syncActiveState() {
    const nav = getNav();
    const achievementButton = ensureAchievementButton();
    if (!nav || !achievementButton) return;
    hideNestedModeTabs();

    const shellTab = document.documentElement.dataset.appTab || "map";
    const achievementMode = shellTab === "collection" && isAchievementMode();
    const navTab = achievementMode ? "achievement_proxy" : shellTab;
    document.documentElement.dataset.appNavTab = navTab;

    document.body?.classList.toggle("collection-tab-active", shellTab === "collection" && !achievementMode);
    document.body?.classList.toggle("achievement-tab-active", achievementMode);
    syncHeaderMode(achievementMode);

    for (const button of nav.querySelectorAll(".app-tab")) {
      let active = false;
      if (button === achievementButton) active = achievementMode;
      else if (button.dataset.appTab === "collection") active = shellTab === "collection" && !achievementMode;
      else if (button.dataset.appTab && button.dataset.appTab !== "achievement_proxy") active = button.dataset.appTab === shellTab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    }
  }

  function stabilizeAchievementNav() {
    syncActiveState();
    queueMicrotask(syncActiveState);
    requestAnimationFrame(syncActiveState);
  }

  function emitCollectionMode(mode, source) {
    window.dispatchEvent(new CustomEvent("onsen-collection-mode-changed", { detail: { build: BUILD, mode, source } }));
  }

  function clickInternalMode(mode) {
    const button = document.querySelector(`[data-collection-mode="${mode}"]`);
    if (!button) return false;
    button.click();
    return true;
  }

  function refreshCollectionDomains() {
    window.OnsenCastleCollectionUI?.refresh?.();
    window.OnsenScenicCollectionUI?.refresh?.();
  }

  function openAchievements() {
    hideNestedModeTabs();
    forceNavTarget("achievement_proxy");
    if (window.OnsenAchievements?.show) {
      window.OnsenAchievements.show();
    } else {
      window.OnsenAppShell?.show?.("collection");
      clickInternalMode("achievements");
    }
    emitCollectionMode("achievements", "footer");
    stabilizeAchievementNav();
  }

  function openCollections() {
    forceNavTarget("collection");
    window.OnsenAppShell?.show?.("collection");
    hideNestedModeTabs();
    clickInternalMode("collection");
    emitCollectionMode("collection", "footer");
    refreshCollectionDomains();
    syncActiveState();
  }

  function bindNavigationCapture() {
    if (document.documentElement.dataset.footerNavV706Bound === "1") return;
    document.documentElement.dataset.footerNavV706Bound = "1";
    document.addEventListener("click", (event) => {
      const nav = getNav();
      if (!nav) return;
      const target = event.target instanceof Element ? event.target.closest("button") : null;
      if (!target || !nav.contains(target)) return;

      if (target.id === FOOTER_ID) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openAchievements();
        return;
      }
      if (target.dataset.appTab === "collection") {
        event.preventDefault();
        event.stopImmediatePropagation();
        openCollections();
      }
    }, true);
  }

  function wrapAchievementShow() {
    if (achievementsWrapped || !window.OnsenAchievements?.show) return false;
    const original = window.OnsenAchievements.show.bind(window.OnsenAchievements);
    window.OnsenAchievements.show = (...args) => {
      forceNavTarget("achievement_proxy");
      const result = original(...args);
      emitCollectionMode("achievements", "api");
      stabilizeAchievementNav();
      return result;
    };
    achievementsWrapped = true;
    return true;
  }

  async function install() {
    if (installed) return;
    for (let i = 0; i < 300; i += 1) {
      if (getNav() && window.OnsenAppShell && window.OnsenAchievements && window.OnsenDomainAchievements) break;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    if (!getNav() || !window.OnsenAppShell || !window.OnsenAchievements || !window.OnsenDomainAchievements) {
      throw new Error("footer navigation prerequisites not ready");
    }
    installed = true;
    ensureAchievementButton();
    bindNavigationCapture();
    hideNestedModeTabs();
    wrapAchievementShow();
    window.OnsenAchievements.refresh?.();
    syncActiveState();

    window.addEventListener("onsen-app-tab-changed", syncActiveState);
    window.addEventListener("onsen-collection-mode-changed", syncActiveState);
    window.addEventListener("onsen-collection-domain-changed", syncActiveState);
    window.addEventListener("pageshow", syncActiveState);
    window.addEventListener("onsen-domain-achievements-ready", () => {
      window.OnsenAchievements.refresh?.();
      syncActiveState();
    });
    window.addEventListener("onsen-scenic-v706-ready", syncActiveState);

    window.OnsenFooterNavigation = {
      build: BUILD,
      openAchievements,
      openCollections,
      refresh: () => { syncActiveState(); refreshCollectionDomains(); }
    };
    window.dispatchEvent(new CustomEvent("onsen-footer-navigation-ready", { detail: { build: BUILD } }));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => install().catch((err) => console.warn("footer navigation v70.6 init failed", err)), { once: true });
  } else {
    install().catch((err) => console.warn("footer navigation v70.6 init failed", err));
  }
})();