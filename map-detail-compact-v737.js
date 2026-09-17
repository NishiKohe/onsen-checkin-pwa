(() => {
  "use strict";
  const BUILD = "v73.7";
  let installed = false;
  function main() { return document.querySelector(".main"); }
  function syncButtons() {
    const expanded = !!main()?.classList.contains("map-detail-expanded");
    for (const button of document.querySelectorAll(".main > .panel .map-detail-expand-v737")) {
      button.textContent = expanded ? "簡易表示に戻す" : "詳細を見る";
      button.setAttribute("aria-expanded", String(expanded));
    }
  }
  function expand(next) {
    if (!main()?.classList.contains("map-detail-open")) return;
    main().classList.toggle("map-detail-expanded", !!next);
    syncButtons();
  }
  function ensureControls() {
    for (const panel of main()?.querySelectorAll(":scope > .panel") || []) {
      if (panel.querySelector(".map-detail-expand-v737")) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "map-detail-expand-v737";
      button.setAttribute("aria-expanded", "false");
      button.textContent = "詳細を見る";
      button.addEventListener("click", () => expand(!main()?.classList.contains("map-detail-expanded")));
      const close = panel.querySelector(".map-detail-close-v736");
      if (close) close.insertAdjacentElement("afterend", button);
      else panel.prepend(button);
      const handle = panel.querySelector(".map-detail-handle-v736");
      if (handle) {
        let startY = null;
        handle.addEventListener("touchstart", e => { startY = e.touches?.[0]?.clientY ?? null; }, { passive: true });
        handle.addEventListener("touchend", e => {
          const delta = Number(e.changedTouches?.[0]?.clientY) - startY;
          if (startY != null && delta < -45) expand(true);
          startY = null;
        }, { passive: true });
        handle.addEventListener("click", () => expand(!main()?.classList.contains("map-detail-expanded")));
      }
    }
    syncButtons();
  }
  function install() {
    if (installed) return;
    installed = true;
    ensureControls();
    const root = main();
    if (root) new MutationObserver(ensureControls).observe(root, { childList: true });
    window.addEventListener("onsen-map-detail-v736-opened", () => { main()?.classList.remove("map-detail-expanded"); ensureControls(); });
    window.addEventListener("onsen-map-detail-v736-closed", () => { main()?.classList.remove("map-detail-expanded"); syncButtons(); });
    window.addEventListener("onsen-app-tab-changed", ensureControls);
    window.OnsenMapDetailCompactV737 = { build: BUILD, expand, diagnostics: () => ({ open: !!main()?.classList.contains("map-detail-open"), expanded: !!main()?.classList.contains("map-detail-expanded") }) };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();