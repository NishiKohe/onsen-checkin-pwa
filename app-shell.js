(() => {
  const BUILD = "v56";
  const VALID_TABS = new Set(["map", "collection", "trip"]);
  const CARD_MOVE_THRESHOLD_PX = 12;
  const CARD_CLICK_SUPPRESS_MS = 900;

  let nav = null;
  let layoutScheduled = false;
  let pointerState = null;
  let lastPointerToggle = { summary: null, at: 0 };
  const openCollectionCards = new Set();

  function normalizeTab(tab) {
    const value = String(tab || "map");
    return VALID_TABS.has(value) ? value : "map";
  }

  function getViews() {
    return {
      map: document.querySelector(".main"),
      collection: document.getElementById("collectionView"),
      trip: document.getElementById("tripView")
    };
  }

  function resizeMap() {
    requestAnimationFrame(() => {
      try {
        if (typeof map !== "undefined" && map?.resize) map.resize();
      } catch (err) {
        console.warn("app shell map resize skipped", err);
      }
    });
  }

  function ownTabNavigation() {
    const current = document.querySelector(".app-tabs");
    if (!current) return null;
    if (current.dataset.appShellOwned === "1") return current;

    const clone = current.cloneNode(true);
    clone.dataset.appShellOwned = "1";
    current.replaceWith(clone);

    clone.addEventListener("click", (event) => {
      const button = event.target instanceof Element ? event.target.closest("[data-app-tab]") : null;
      if (!button || !clone.contains(button)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      showTab(button.dataset.appTab || "map", { source: "navigation" });
    }, true);

    return clone;
  }

  function syncTabCount() {
    if (!nav) return;
    const count = Math.max(1, nav.querySelectorAll("[data-app-tab]").length);
    document.documentElement.style.setProperty("--app-tab-count", String(count));
  }

  function setViewState(node, visible) {
    if (!node) return;
    node.hidden = !visible;
    node.setAttribute("aria-hidden", visible ? "false" : "true");
    node.style.removeProperty("display");
  }

  function showTab(tab, options = {}) {
    const normalized = normalizeTab(tab);
    const views = getViews();
    const available = normalized === "trip" ? !!views.trip : true;
    const target = available ? normalized : "map";

    document.documentElement.dataset.appTab = target;
    document.body?.classList.toggle("collection-tab-active", target === "collection");
    document.body?.classList.toggle("trip-tab-active", target === "trip");
    document.body?.classList.add("has-app-tabs");

    setViewState(views.map, target === "map");
    setViewState(views.collection, target === "collection");
    setViewState(views.trip, target === "trip");

    for (const button of document.querySelectorAll("[data-app-tab]")) {
      const active = button.dataset.appTab === target;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    }

    if (target === "collection" && typeof window.renderCollectionProgress === "function") {
      window.renderCollectionProgress();
      prepareCollectionCards();
      if (options.resetScroll === true) views.collection?.scrollTo({ top: 0, behavior: "auto" });
    }

    if (target === "trip") {
      window.dispatchEvent(new Event("storage"));
      window.OnsenTripPower?.render?.();
    }

    if (target === "map") resizeMap();

    scheduleLayout();
    window.dispatchEvent(new CustomEvent("onsen-app-tab-changed", {
      detail: { tab: target, source: options.source || "api", build: BUILD }
    }));
    return target;
  }

  function measureLayout() {
    layoutScheduled = false;
    const header = document.querySelector(".header");
    const tabs = document.querySelector(".app-tabs");
    if (!header || !tabs) return;

    const visual = window.visualViewport;
    const viewportH = Math.max(0, Math.floor(
      visual && Math.abs(Number(visual.scale || 1) - 1) < 0.01
        ? visual.height
        : window.innerHeight
    ));
    const headerH = Math.max(0, Math.ceil(header.getBoundingClientRect().height));
    const tabsH = Math.max(0, Math.ceil(tabs.getBoundingClientRect().height));
    const contentH = Math.max(220, viewportH - headerH - tabsH);

    const root = document.documentElement;
    root.style.setProperty("--app-viewport-h", `${viewportH}px`);
    root.style.setProperty("--app-header-h", `${headerH}px`);
    root.style.setProperty("--app-tabs-h", `${tabsH}px`);
    root.style.setProperty("--app-content-h", `${contentH}px`);
    document.body?.classList.add("measured-app-layout");

    if (root.dataset.appTab === "map") resizeMap();
  }

  function scheduleLayout() {
    if (layoutScheduled) return;
    layoutScheduled = true;
    requestAnimationFrame(measureLayout);
  }

  function cardKey(summary) {
    const card = summary?.closest("details.collection-card");
    if (!card) return null;
    if (card.dataset.collectionId) return card.dataset.collectionId;
    if (card.dataset.shellCardKey) return card.dataset.shellCardKey;
    const name = summary.querySelector(".collection-card-title strong")?.textContent?.trim() || "collection";
    card.dataset.shellCardKey = `title:${name}`;
    return card.dataset.shellCardKey;
  }

  function prepareCollectionCards() {
    const grid = document.getElementById("collectionGrid");
    if (!grid) return false;

    for (const summary of grid.querySelectorAll("summary.collection-card-summary")) {
      const details = summary.closest("details.collection-card");
      if (!details) continue;
      const key = cardKey(summary);
      if (key && openCollectionCards.has(key)) details.setAttribute("open", "");
      summary.setAttribute("role", "button");
      summary.setAttribute("tabindex", "0");
      summary.setAttribute("aria-expanded", details.hasAttribute("open") ? "true" : "false");
    }
    return true;
  }

  function summaryFromTarget(target) {
    if (!(target instanceof Element)) return null;
    const summary = target.closest("summary.collection-card-summary");
    const grid = document.getElementById("collectionGrid");
    return summary && grid?.contains(summary) ? summary : null;
  }

  function toggleCollectionSummary(summary) {
    const details = summary?.closest("details.collection-card");
    if (!details) return;
    const next = !details.hasAttribute("open");
    const key = cardKey(summary);

    if (next) {
      details.setAttribute("open", "");
      if (key) openCollectionCards.add(key);
    } else {
      details.removeAttribute("open");
      if (key) openCollectionCards.delete(key);
    }
    summary.setAttribute("aria-expanded", next ? "true" : "false");
  }

  function bindCollectionAccordion() {
    const grid = document.getElementById("collectionGrid");
    if (!grid || grid.dataset.appShellAccordion === "1") return;
    grid.dataset.appShellAccordion = "1";
    prepareCollectionCards();

    grid.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      const summary = summaryFromTarget(event.target);
      if (!summary) return;
      pointerState = {
        summary,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY
      };
    }, true);

    grid.addEventListener("pointerup", (event) => {
      const summary = summaryFromTarget(event.target);
      const start = pointerState;
      pointerState = null;
      if (!summary || !start || start.summary !== summary || start.pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > CARD_MOVE_THRESHOLD_PX) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      toggleCollectionSummary(summary);
      lastPointerToggle = { summary, at: Date.now() };
    }, true);

    grid.addEventListener("pointercancel", () => { pointerState = null; }, true);

    grid.addEventListener("click", (event) => {
      const summary = summaryFromTarget(event.target);
      if (!summary) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (lastPointerToggle.summary === summary && Date.now() - lastPointerToggle.at < CARD_CLICK_SUPPRESS_MS) return;
      toggleCollectionSummary(summary);
    }, true);

    grid.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const summary = summaryFromTarget(event.target);
      if (!summary) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleCollectionSummary(summary);
    }, true);

    const observer = new MutationObserver(() => {
      prepareCollectionCards();
      scheduleLayout();
    });
    observer.observe(grid, { childList: true, subtree: true });
  }

  function installBuildBadge() {
    const title = document.querySelector(".header h1");
    if (!title || document.getElementById("appBuildBadge")) return;
    const badge = document.createElement("span");
    badge.id = "appBuildBadge";
    badge.className = "app-build-badge";
    badge.textContent = BUILD;
    badge.title = `温泉チェックイン build ${BUILD}`;
    title.appendChild(badge);
  }

  function runDiagnostics() {
    const views = getViews();
    const buttons = [...document.querySelectorAll(".app-tabs [data-app-tab]")];
    const active = buttons.filter((button) => button.getAttribute("aria-selected") === "true");
    const contentH = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-content-h")) || 0;
    const cards = [...document.querySelectorAll("details.collection-card")];
    const domainSnapshot = window.AppDomainBridge?.snapshot?.() || window.AppDomain?.snapshot?.() || null;

    const checks = {
      singleActiveTab: active.length === 1,
      mapTabPresent: buttons.some((button) => button.dataset.appTab === "map"),
      collectionTabPresent: buttons.some((button) => button.dataset.appTab === "collection"),
      tripTabConsistent: !views.trip || buttons.some((button) => button.dataset.appTab === "trip"),
      viewportMeasured: contentH >= 220,
      mapToolsReady: !!window.OnsenMapTools && !!document.getElementById("btnMapToolsToggle"),
      collectionCardsStructured: cards.length === 0 || cards.every((card) =>
        !!card.querySelector(":scope > summary.collection-card-summary") && !!card.querySelector(":scope > .collection-target-list, :scope > .collection-area-hierarchy")
      ),
      collectionHierarchyReady: !!window.CollectionAreaHierarchy,
      profileStorageReady: !!window.OnsenUserStorage,
      domainModelReady: !!window.AppDomain,
      domainBridgeReady: !!window.AppDomainBridge,
      domainOnsenEntitiesReady: !domainSnapshot || Number(domainSnapshot.entityCounts?.onsen || 0) > 0,
      legacyUiShimsUnloaded: ![...document.scripts].some((script) => /(?:tab-display-fix|collection-details-fix|layout-viewport-fix|onsen-musume-collection-hierarchy)\.js/.test(script.src))
    };
    const ok = Object.values(checks).every(Boolean);
    const result = {
      build: BUILD,
      ok,
      activeTab: document.documentElement.dataset.appTab || "map",
      tabCount: buttons.length,
      contentHeightPx: contentH,
      collectionCardCount: cards.length,
      domain: domainSnapshot,
      checks
    };

    const badge = document.getElementById("appBuildBadge");
    if (badge) {
      badge.classList.toggle("warning", !ok);
      badge.title = ok
        ? `温泉チェックイン build ${BUILD} / runtime check OK`
        : `温泉チェックイン build ${BUILD} / runtime checkで要確認項目あり`;
    }
    console.info("onsen app shell diagnostics", result);
    return result;
  }

  function installServiceWorkerRefreshGuard() {
    if (!("serviceWorker" in navigator)) return;
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      const key = `onsenSwControllerReload:${BUILD}`;
      if (sessionStorage.getItem(key) === "1") return;
      refreshing = true;
      sessionStorage.setItem(key, "1");
      location.reload();
    });
  }

  function install() {
    document.body?.classList.add("has-app-tabs");
    installBuildBadge();
    nav = ownTabNavigation();
    if (!nav) return;

    syncTabCount();
    bindCollectionAccordion();
    installServiceWorkerRefreshGuard();

    const initial = document.querySelector('.app-tabs [aria-selected="true"]')?.dataset.appTab ||
      document.documentElement.dataset.appTab || "map";
    showTab(initial, { source: "startup" });

    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(scheduleLayout);
      const header = document.querySelector(".header");
      if (header) observer.observe(header);
      observer.observe(nav);
    }

    const navObserver = new MutationObserver(() => {
      syncTabCount();
      scheduleLayout();
      const current = document.documentElement.dataset.appTab || "map";
      for (const button of nav.querySelectorAll("[data-app-tab]")) {
        const active = button.dataset.appTab === current;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
      }
    });
    navObserver.observe(nav, { childList: true, subtree: true });

    window.addEventListener("resize", scheduleLayout, { passive: true });
    window.addEventListener("orientationchange", scheduleLayout, { passive: true });
    window.addEventListener("pageshow", () => {
      scheduleLayout();
      prepareCollectionCards();
    });
    window.visualViewport?.addEventListener("resize", scheduleLayout, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") scheduleLayout();
    });

    window.setCollectionAppTab = (tab) => showTab(tab, { source: "legacy-api" });
    window.openTripView = () => showTab("trip", { source: "trip-api" });

    window.OnsenAppShell = {
      build: BUILD,
      show: showTab,
      refresh: () => {
        syncTabCount();
        prepareCollectionCards();
        scheduleLayout();
      },
      diagnostics: runDiagnostics,
      getActiveTab: () => document.documentElement.dataset.appTab || "map"
    };

    scheduleLayout();
    setTimeout(runDiagnostics, 1800);
    setTimeout(runDiagnostics, 4500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();