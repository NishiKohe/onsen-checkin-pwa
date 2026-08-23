(() => {
  const TAB_STYLE_ID = "app-tab-hard-switch-style";

  function installHardSwitchStyle() {
    if (document.getElementById(TAB_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = TAB_STYLE_ID;
    style.textContent = `
      html[data-app-tab="collection"] body .main { display: none !important; }
      html[data-app-tab="collection"] body #collectionView { display: block !important; }
      html[data-app-tab="map"] body #collectionView { display: none !important; }
    `;
    document.head.appendChild(style);
  }

  function forceAppTab(tab) {
    const showCollection = tab === "collection";
    const main = document.querySelector(".main");
    const collectionView = document.getElementById("collectionView");

    installHardSwitchStyle();
    document.documentElement.dataset.appTab = showCollection ? "collection" : "map";
    document.body?.classList.toggle("collection-tab-active", showCollection);

    if (main) {
      main.hidden = showCollection;
      main.setAttribute("aria-hidden", showCollection ? "true" : "false");
      if (showCollection) {
        main.style.setProperty("display", "none", "important");
      } else {
        main.style.removeProperty("display");
      }
    }

    if (collectionView) {
      collectionView.hidden = !showCollection;
      collectionView.setAttribute("aria-hidden", showCollection ? "false" : "true");
      if (showCollection) {
        collectionView.style.setProperty("display", "block", "important");
      } else {
        collectionView.style.setProperty("display", "none", "important");
      }
    }

    for (const button of document.querySelectorAll("[data-app-tab]")) {
      const active = button.dataset.appTab === (showCollection ? "collection" : "map");
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    }

    if (showCollection) {
      if (typeof renderCollectionProgress === "function") renderCollectionProgress();
      collectionView?.scrollTo({ top: 0, behavior: "auto" });
    } else if (typeof map !== "undefined" && map) {
      setTimeout(() => map.resize?.(), 0);
    }
  }

  function bindHardSwitch() {
    installHardSwitchStyle();

    // collection-progress-ui.js の既存ハンドラも同じ実装へ寄せる。
    window.setCollectionAppTab = forceAppTab;
    try { setCollectionAppTab = forceAppTab; } catch {}

    for (const button of document.querySelectorAll("[data-app-tab]")) {
      if (button.dataset.hardSwitchBound === "1") continue;
      button.dataset.hardSwitchBound = "1";
      button.addEventListener("click", () => forceAppTab(button.dataset.appTab || "map"), true);
    }

    const selected = document.querySelector('[data-app-tab][aria-selected="true"]') ||
      document.querySelector("[data-app-tab].active");
    forceAppTab(selected?.dataset.appTab || "map");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindHardSwitch, { once: true });
  } else {
    bindHardSwitch();
  }

  window.addEventListener("pageshow", () => {
    const selected = document.querySelector('[data-app-tab][aria-selected="true"]') ||
      document.querySelector("[data-app-tab].active");
    forceAppTab(selected?.dataset.appTab || "map");
  });
})();
