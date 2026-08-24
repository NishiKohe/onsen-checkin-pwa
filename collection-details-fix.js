(() => {
  const STYLE_ID = "collection-details-hard-fix-style";
  const MOVE_THRESHOLD_PX = 12;
  const CLICK_SUPPRESS_MS = 900;
  let pointerState = null;
  let lastPointerToggle = { summary: null, at: 0 };

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .collection-card-summary {
        position: relative;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
      }
      .collection-card-summary::after {
        content: "▾";
        position: absolute;
        right: 12px;
        bottom: 9px;
        color: #8096ad;
        font-size: 12px;
        line-height: 1;
        transition: transform .16s ease, color .16s ease;
        pointer-events: none;
      }
      details.collection-card[open] > .collection-card-summary::after {
        transform: rotate(180deg);
        color: #d1a43d;
      }
      details.collection-card[open] > .collection-card-summary {
        background: rgba(28, 40, 53, .72);
      }
    `;
    document.head.appendChild(style);
  }

  function getSummaryFromTarget(target) {
    if (!(target instanceof Element)) return null;
    const summary = target.closest("summary.collection-card-summary");
    if (!summary) return null;
    const grid = document.getElementById("collectionGrid");
    return grid?.contains(summary) ? summary : null;
  }

  function prepareCards() {
    const grid = document.getElementById("collectionGrid");
    if (!grid) return false;
    for (const summary of grid.querySelectorAll("summary.collection-card-summary")) {
      const details = summary.closest("details.collection-card");
      if (!details) continue;
      summary.setAttribute("role", "button");
      summary.setAttribute("tabindex", "0");
      summary.setAttribute("aria-expanded", details.open ? "true" : "false");
    }
    return true;
  }

  function toggleSummary(summary) {
    const details = summary?.closest("details.collection-card");
    if (!details) return;
    const next = !details.hasAttribute("open");
    if (next) details.setAttribute("open", "");
    else details.removeAttribute("open");
    summary.setAttribute("aria-expanded", next ? "true" : "false");
  }

  function bindHardAccordion() {
    installStyle();
    const grid = document.getElementById("collectionGrid");
    if (!grid || grid.dataset.hardAccordionBound === "1") return false;
    grid.dataset.hardAccordionBound = "1";
    prepareCards();

    // pointerup で先に明示開閉し、後続 click の native <details> トグルを必ず抑止する。
    grid.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      const summary = getSummaryFromTarget(event.target);
      if (!summary) return;
      pointerState = {
        summary,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY
      };
    }, true);

    grid.addEventListener("pointerup", (event) => {
      const summary = getSummaryFromTarget(event.target);
      const start = pointerState;
      pointerState = null;
      if (!summary || !start || start.summary !== summary || start.pointerId !== event.pointerId) return;
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (moved > MOVE_THRESHOLD_PX) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      toggleSummary(summary);
      lastPointerToggle = { summary, at: Date.now() };
    }, true);

    grid.addEventListener("pointercancel", () => {
      pointerState = null;
    }, true);

    grid.addEventListener("click", (event) => {
      const summary = getSummaryFromTarget(event.target);
      if (!summary) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      // touch/pointer 由来の click は pointerup ですでに1回だけ処理済み。
      if (lastPointerToggle.summary === summary && Date.now() - lastPointerToggle.at < CLICK_SUPPRESS_MS) return;

      // pointer event を出さない環境・アクセシビリティ click のフォールバック。
      toggleSummary(summary);
    }, true);

    grid.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const summary = getSummaryFromTarget(event.target);
      if (!summary) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleSummary(summary);
    }, true);

    const observer = new MutationObserver(() => prepareCards());
    observer.observe(grid, { childList: true, subtree: true });
    return true;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindHardAccordion, { once: true });
  } else {
    bindHardAccordion();
  }

  let tries = 0;
  const timer = setInterval(() => {
    if (bindHardAccordion() || document.getElementById("collectionGrid")?.dataset.hardAccordionBound === "1" || ++tries > 120) {
      clearInterval(timer);
    }
  }, 100);

  window.addEventListener("pageshow", prepareCards);
})();