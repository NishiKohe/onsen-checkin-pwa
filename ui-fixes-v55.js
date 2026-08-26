(() => {
  const BUILD = "v55";
  let scheduled = false;
  let activeCollectionCard = null;

  function isActionTarget(target) {
    return !!(target instanceof Element && target.closest("button, a, input, select, textarea"));
  }

  function syncCollectionFocus(preferred = null) {
    const grid = document.getElementById("collectionGrid");
    if (!grid) return;

    let openCard = preferred?.open ? preferred : grid.querySelector("details.collection-card[open]");
    if (openCard && !grid.contains(openCard)) openCard = null;

    for (const card of grid.querySelectorAll("details.collection-card")) {
      const active = card === openCard;
      card.classList.toggle("v55-active-card", active);
      if (!active && openCard && card.open) card.open = false;
    }

    for (const section of grid.querySelectorAll(".collection-section")) {
      section.classList.toggle("v55-active-section", !!openCard && section.contains(openCard));
    }

    grid.classList.toggle("v55-collection-focus", !!openCard);
    activeCollectionCard = openCard || null;
  }

  function bindCollectionCard(card) {
    if (!(card instanceof HTMLDetailsElement) || card.dataset.v55FocusBound === "1") return;
    card.dataset.v55FocusBound = "1";
    card.addEventListener("toggle", () => {
      if (card.open) {
        syncCollectionFocus(card);
        requestAnimationFrame(() => {
          card.scrollIntoView({ block: "nearest", behavior: "auto" });
        });
      } else if (activeCollectionCard === card) {
        syncCollectionFocus(null);
      }
    });
  }

  function enhanceCollectionCards() {
    const grid = document.getElementById("collectionGrid");
    if (!grid) return;
    for (const card of grid.querySelectorAll("details.collection-card")) bindCollectionCard(card);
    syncCollectionFocus(activeCollectionCard);
  }

  function toggleAchievementCard(card) {
    const expanded = !card.classList.contains("v54-expanded");
    const grid = card.parentElement;
    if (expanded && grid) {
      for (const other of grid.querySelectorAll(":scope > .achievement-card.v54-expanded, :scope > .achievement-onsite-card.v54-expanded")) {
        if (other === card) continue;
        other.classList.remove("v54-expanded");
        other.setAttribute("aria-expanded", "false");
      }
    }
    card.classList.toggle("v54-expanded", expanded);
    card.setAttribute("aria-expanded", expanded ? "true" : "false");
    const hint = card.querySelector(":scope > .v54-expand-hint");
    if (hint) hint.textContent = expanded ? "×" : "+";
  }

  function onAchievementClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    const card = target?.closest?.(".achievement-card, .achievement-onsite-card");
    if (!card) return;
    const view = card.closest("#achievementView, .achievement-onsite-view");
    if (!view) return;
    if (isActionTarget(target)) return;

    // Capture before v54 per-card listeners so a rerendered card toggles exactly once.
    event.preventDefault();
    event.stopPropagation();
    toggleAchievementCard(card);
  }

  function onAchievementKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target instanceof Element ? event.target : null;
    const card = target?.closest?.(".achievement-card, .achievement-onsite-card");
    if (!card || target !== card) return;
    event.preventDefault();
    event.stopPropagation();
    toggleAchievementCard(card);
  }

  function markAchievementCards() {
    for (const card of document.querySelectorAll(".achievement-card, .achievement-onsite-card")) {
      if (!card.hasAttribute("tabindex")) card.tabIndex = 0;
      card.setAttribute("role", "button");
      if (!card.hasAttribute("aria-expanded")) card.setAttribute("aria-expanded", "false");
    }
  }

  function refresh() {
    scheduled = false;
    enhanceCollectionCards();
    markAchievementCards();
    document.documentElement.dataset.uiFixes = BUILD;
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(refresh);
  }

  function install() {
    document.addEventListener("click", onAchievementClick, true);
    document.addEventListener("keydown", onAchievementKeydown, true);
    refresh();

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("onsen-app-tab-changed", schedule);
    window.addEventListener("pageshow", schedule);

    window.OnsenUiFixes = {
      build: BUILD,
      refresh: schedule,
      closeCollectionDetail: () => {
        if (activeCollectionCard) activeCollectionCard.open = false;
        syncCollectionFocus(null);
      }
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
