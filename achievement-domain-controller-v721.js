(() => {
  const BUILD = "v72.1";
  const STORAGE_KEY = "achievementDomainModeV721";
  const VALID_DOMAINS = new Set(["onsen", "castle", "scenic"]);
  let installed = false;

  function normalize(value) {
    const raw = String(value || "");
    return VALID_DOMAINS.has(raw) ? raw : "onsen";
  }

  function achievementVisible() {
    const collection = document.getElementById("collectionView");
    const view = document.getElementById("achievementView");
    return !!collection && !collection.hidden && !!view && !view.hidden;
  }

  function fallbackDomain() {
    const runtime = window.OnsenCastleCollectionUI?.mode?.();
    const stored = sessionStorage.getItem("collectionDomainModeV61");
    if (VALID_DOMAINS.has(runtime)) return runtime;
    if (VALID_DOMAINS.has(stored)) return stored;
    return "onsen";
  }

  function getMode() {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return VALID_DOMAINS.has(stored) ? stored : fallbackDomain();
  }

  function ensureStoredMode() {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (VALID_DOMAINS.has(stored)) return stored;
    const initial = fallbackDomain();
    sessionStorage.setItem(STORAGE_KEY, initial);
    return initial;
  }

  function switcher() {
    return document.querySelector("#collectionView .collection-domain-switch");
  }

  function syncButtons() {
    if (!achievementVisible()) return;
    const root = switcher();
    if (!root) return;
    const mode = getMode();
    root.dataset.achievementDomainOwner = BUILD;
    for (const button of root.querySelectorAll("[data-collection-domain]")) {
      const active = button.dataset.collectionDomain === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  function setMode(next, { source = "api" } = {}) {
    const normalized = normalize(next);
    const previous = getMode();
    sessionStorage.setItem(STORAGE_KEY, normalized);
    syncButtons();

    const api = window.OnsenDomainAchievements;
    if (api?.setDomain) {
      api.setDomain(normalized, { source, silentEvent: true });
    } else {
      api?.refresh?.();
    }

    window.dispatchEvent(new CustomEvent("onsen-achievement-domain-changed", {
      detail: { build: BUILD, mode: normalized, previous, source }
    }));
    requestAnimationFrame(syncButtons);
    setTimeout(syncButtons, 40);
    return normalized;
  }

  function handleDomainClick(event) {
    if (!achievementVisible()) return;
    const root = switcher();
    if (!root) return;
    const button = event.target instanceof Element ? event.target.closest("[data-collection-domain]") : null;
    if (!button || !root.contains(button)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setMode(button.dataset.collectionDomain || "onsen", { source: "achievement_domain_tab" });
  }

  function refresh() {
    if (!achievementVisible()) return;
    ensureStoredMode();
    syncButtons();
    window.OnsenDomainAchievements?.refresh?.();
    requestAnimationFrame(syncButtons);
  }

  async function install() {
    if (installed) return;
    installed = true;
    for (let i = 0; i < 300; i += 1) {
      if (document.getElementById("achievementView") && switcher() && window.OnsenDomainAchievements) break;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }

    document.addEventListener("click", handleDomainClick, true);
    window.addEventListener("onsen-collection-mode-changed", () => setTimeout(refresh, 0));
    window.addEventListener("onsen-app-tab-changed", (event) => {
      if (event.detail?.tab === "collection") setTimeout(refresh, 0);
    });
    window.addEventListener("onsen-domain-achievements-ready", () => setTimeout(refresh, 0));
    window.addEventListener("pageshow", () => setTimeout(refresh, 0));

    window.OnsenAchievementDomainV721 = {
      build: BUILD,
      getMode,
      setMode,
      refresh,
      active: achievementVisible
    };

    if (achievementVisible()) refresh();
    window.dispatchEvent(new CustomEvent("onsen-achievement-domain-controller-ready", {
      detail: { build: BUILD, mode: getMode() }
    }));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => install().catch((error) => console.warn("achievement domain v72.1 init failed", error)), { once: true });
  } else install().catch((error) => console.warn("achievement domain v72.1 init failed", error));
})();