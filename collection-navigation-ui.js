(() => {
  const CATEGORY_DEFS = [
    { id: "all", label: "すべて" },
    { id: "official", label: "公式・選定" },
    { id: "broad", label: "広域・歴史" },
    { id: "local", label: "温泉郷・地域" }
  ];

  let currentCategory = "all";
  let gridObserver = null;
  let timer = null;

  function sectionCategory(section) {
    const name = section?.querySelector(".collection-section-heading h3")?.textContent?.trim() || "";
    if (name === "公式・選定コレクション") return "official";
    if (name === "全国・歴史称号" || name === "地域・歴史グループ") return "broad";
    if (name === "地域・温泉郷グループ") return "local";
    return "local";
  }

  function ensureCategoryTabs() {
    const shell = document.querySelector("#collectionView .collection-shell");
    if (!shell) return null;
    let root = document.getElementById("collectionCategoryTabs");
    if (root) return root;

    root = document.createElement("div");
    root.id = "collectionCategoryTabs";
    root.className = "collection-category-tabs";
    root.setAttribute("aria-label", "コレクションカテゴリ");

    for (const def of CATEGORY_DEFS) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.collectionCategory = def.id;
      button.textContent = def.label;
      button.classList.toggle("active", def.id === currentCategory);
      root.appendChild(button);
    }

    const modeTabs = document.getElementById("collectionModeTabs");
    if (modeTabs) modeTabs.insertAdjacentElement("afterend", root);
    else shell.querySelector(".collection-header")?.insertAdjacentElement("afterend", root);

    root.addEventListener("click", (event) => {
      const button = event.target.closest("[data-collection-category]");
      if (!button) return;
      currentCategory = button.dataset.collectionCategory || "all";
      applyCategoryFilter();
    });
    return root;
  }

  function categoryCounts() {
    const counts = { all: 0, official: 0, broad: 0, local: 0 };
    for (const section of document.querySelectorAll("#collectionGrid .collection-section")) {
      const cards = section.querySelectorAll("details.collection-card").length;
      const key = sectionCategory(section);
      counts.all += cards;
      counts[key] = (counts[key] || 0) + cards;
    }
    return counts;
  }

  function applyCategoryFilter() {
    const root = ensureCategoryTabs();
    if (!root) return;
    const achievementView = document.getElementById("achievementView");
    const achievementsVisible = achievementView && !achievementView.hidden;
    root.hidden = !!achievementsVisible;

    const counts = categoryCounts();
    for (const button of root.querySelectorAll("[data-collection-category]")) {
      const id = button.dataset.collectionCategory || "all";
      button.classList.toggle("active", id === currentCategory);
      const def = CATEGORY_DEFS.find((item) => item.id === id);
      button.textContent = `${def?.label || id} ${counts[id] || 0}`;
    }

    for (const section of document.querySelectorAll("#collectionGrid .collection-section")) {
      const visible = currentCategory === "all" || sectionCategory(section) === currentCategory;
      section.hidden = !visible;
    }
  }

  function sourceRows(card) {
    const itemRows = [...card.querySelectorAll(".collection-area-item-panel .collection-area-item-row")];
    if (itemRows.length) return { kind: "item", rows: itemRows };
    return { kind: "target", rows: [...card.querySelectorAll(":scope > .collection-target-list .collection-target")] };
  }

  function rowVisibleForIds(row, allowed) {
    const spotId = row.dataset.spotId || "";
    return !allowed || allowed.has(spotId);
  }

  function cloneRowForInline(source) {
    const clone = source.cloneNode(true);
    clone.removeAttribute("hidden");
    clone.classList.add("collection-inline-row");
    return clone;
  }

  function clickOriginal(card, clone, kind) {
    if (kind === "item") {
      const id = clone.dataset.itemId;
      const original = [...card.querySelectorAll(".collection-area-item-panel .collection-area-item-row")]
        .find((row) => row.dataset.itemId === id);
      original?.click();
      return;
    }
    const spotId = clone.dataset.spotId;
    const original = [...card.querySelectorAll(":scope > .collection-target-list .collection-target")]
      .find((row) => row.dataset.spotId === spotId);
    original?.click();
  }

  function removeInline(card) {
    card.querySelector(".collection-inline-scope")?.remove();
  }

  function renderInlineScope(card, button) {
    if (!card || !button) return;
    removeInline(card);

    const ids = String(button.dataset.scopeIds || "").split(",").filter(Boolean);
    const allowed = new Set(ids);
    const name = button.dataset.scopeName || "エリア";
    const { kind, rows } = sourceRows(card);
    const visibleRows = rows.filter((row) => rowVisibleForIds(row, allowed));

    const host = document.createElement("div");
    host.className = "collection-inline-scope";
    host.dataset.scopeName = name;
    host.innerHTML = `
      <div class="collection-inline-head">
        <div><span>SELECTED AREA</span><strong>${escapeHtml(name)}の対象</strong></div>
        <div class="collection-inline-actions"><b>${visibleRows.length}件</b><button type="button" aria-label="対象一覧を閉じる">×</button></div>
      </div>
      <div class="collection-inline-list"></div>`;

    const list = host.querySelector(".collection-inline-list");
    for (const row of visibleRows) list.appendChild(cloneRowForInline(row));
    if (!visibleRows.length) list.innerHTML = `<div class="collection-inline-empty">この範囲の対象はありません。</div>`;

    list.addEventListener("click", (event) => {
      const row = event.target.closest(".collection-inline-row");
      if (!row) return;
      event.preventDefault();
      event.stopPropagation();
      clickOriginal(card, row, kind);
    });

    host.querySelector(".collection-inline-actions button")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const reset = card.querySelector(".collection-area-scope-reset");
      reset?.click();
      removeInline(card);
    });

    if (button.classList.contains("collection-area-pref")) {
      const wrap = button.closest(".collection-area-pref-wrap");
      wrap?.insertAdjacentElement("afterend", host);
    } else {
      const top = button.closest(".collection-area-region-top");
      top?.insertAdjacentElement("afterend", host);
    }

    card.dataset.inlineScope = "1";
    requestAnimationFrame(() => {
      host.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    });
  }

  function bindHierarchyCard(card) {
    if (!card || card.dataset.collectionNavBound === "1") return;
    const hierarchy = card.querySelector(".collection-area-hierarchy");
    if (!hierarchy) return;
    card.dataset.collectionNavBound = "1";
    card.dataset.inlineScope = "1";

    for (const button of hierarchy.querySelectorAll(".collection-area-chip")) {
      button.addEventListener("click", () => {
        setTimeout(() => renderInlineScope(card, button), 0);
      });
    }

    hierarchy.querySelector(".collection-area-scope-reset")?.addEventListener("click", () => {
      setTimeout(() => {
        removeInline(card);
        hierarchy.querySelector(".collection-area-scope-bar")?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
      }, 0);
    });
  }

  function processCards() {
    for (const card of document.querySelectorAll("#collectionGrid details.collection-card")) bindHierarchyCard(card);
    applyCategoryFilter();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(processCards, 30);
  }

  function install() {
    ensureCategoryTabs();
    processCards();

    const grid = document.getElementById("collectionGrid");
    if (grid && !gridObserver) {
      gridObserver = new MutationObserver(schedule);
      gridObserver.observe(grid, { childList: true, subtree: true });
    }

    document.addEventListener("click", (event) => {
      if (event.target.closest?.("[data-collection-mode]")) setTimeout(applyCategoryFilter, 0);
    }, true);
    window.addEventListener("onsen-app-tab-changed", (event) => {
      if (event.detail?.tab === "collection") schedule();
    });
    window.addEventListener("pageshow", schedule);

    window.CollectionNavigationUi = {
      setCategory: (category) => {
        if (!CATEGORY_DEFS.some((item) => item.id === category)) return false;
        currentCategory = category;
        applyCategoryFilter();
        return true;
      },
      getCategory: () => currentCategory,
      refresh: schedule
    };
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'\"]/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[char]));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
