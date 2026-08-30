(() => {
  const BUILD = "v70.1";
  const BOUND_KEY = "v701SearchRecoveryBound";

  function directSetOpen(open) {
    const button = document.getElementById("btnMapToolsToggle");
    const panel = document.getElementById("mapToolsPanel") || document.querySelector(".map-shell .map-tools");
    if (!button || !panel) return false;
    const next = !!open;
    panel.hidden = !next;
    panel.setAttribute("aria-hidden", next ? "false" : "true");
    button.setAttribute("aria-expanded", next ? "true" : "false");
    button.classList.toggle("active", next);
    const label = button.querySelector(".map-tools-toggle-label");
    if (label) label.textContent = next ? "検索を閉じる" : "検索・絞り込み";
    panel.closest(".map-shell")?.classList.toggle("map-tools-expanded", next);
    return true;
  }

  function install() {
    if (document.documentElement.dataset[BOUND_KEY] === "1") return;
    document.documentElement.dataset[BOUND_KEY] = "1";

    document.addEventListener("click", (event) => {
      const button = event.target instanceof Element ? event.target.closest("#btnMapToolsToggle") : null;
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const panel = document.getElementById("mapToolsPanel") || document.querySelector(".map-shell .map-tools");
      if (!panel) return;
      directSetOpen(panel.hidden);
    }, true);

    window.OnsenUiRecoveryV701 = {
      build: BUILD,
      openSearch: () => directSetOpen(true),
      closeSearch: () => directSetOpen(false),
      toggleSearch: () => {
        const panel = document.getElementById("mapToolsPanel") || document.querySelector(".map-shell .map-tools");
        return panel ? directSetOpen(panel.hidden) : false;
      }
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
