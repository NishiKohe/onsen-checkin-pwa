(() => {
  const BUILD = "v54";
  let scheduled = false;

  const ICONS = {
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6-5.1 6-11a6 6 0 1 0-12 0c0 5.9 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/></svg>',
    grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v4c0 3-1.8 5-4 5s-4-2-4-5V4Z"/><path d="M8 6H5v1c0 2 1.2 3.5 3.2 4M16 6h3v1c0 2-1.2 3.5-3.2 4M12 13v4M8.5 20h7M10 17h4"/></svg>',
    route: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M7.5 16.5c2.5-1.5 1.5-4 4-5.5s3.5.5 5-3.5"/></svg>',
    onsen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5c2 2-2 3 0 5M12 4c2 2-2 4 0 6M17 5c2 2-2 3 0 5"/><path d="M4 14c2.2 1.3 4.8 2 8 2s5.8-.7 8-2M5 18c2 .9 4.3 1.4 7 1.4s5-.5 7-1.4"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/></svg>',
    region: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5 9 3l6 2 5-2v15.5L15 21l-6-2-5 2V5.5Z"/><path d="M9 3v16M15 5v16"/></svg>',
    history: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M6 17h12M7 17V9h10v8M5 9h14L12 4 5 9Z"/><path d="M10 12h4"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.6 2.6L16.5 9"/></svg>'
  };

  function icon(kind, className = "v54-inline-icon") {
    const span = document.createElement("span");
    span.className = className;
    span.setAttribute("aria-hidden", "true");
    span.innerHTML = ICONS[kind] || ICONS.grid;
    return span;
  }

  function iconKindForText(text, fallback = "grid") {
    const value = String(text || "");
    if (/温泉むすめ|温泉|湯/.test(value)) return "onsen";
    if (/国民保養|名湯|選定|公式/.test(value)) return "star";
    if (/歴史|古湯|文化/.test(value)) return "history";
    if (/地方|地域|都道府県|制覇/.test(value)) return "region";
    if (/旅|訪問|軌跡/.test(value)) return "route";
    if (/実績|称号/.test(value)) return "trophy";
    return fallback;
  }

  function prependIcon(node, kind, className = "v54-inline-icon") {
    if (!node || node.querySelector(":scope > .v54-inline-icon, :scope > .v54-section-icon, :scope > .v54-card-icon")) return;
    node.prepend(icon(kind, className));
  }

  function enhanceMetrics() {
    for (const metric of document.querySelectorAll(".collection-metric, .achievement-metrics > div, .achievement-onsite-metrics > div")) {
      if (metric.dataset.v54Metric === "1") continue;
      metric.dataset.v54Metric = "1";
      const label = metric.querySelector("span")?.textContent || "";
      const kind = /訪問|GPS/.test(label) ? "pin" : /称号|解除|コンプリート/.test(label) ? "trophy" : "grid";
      metric.prepend(icon(kind));
    }
  }

  function enhanceCategoryTabs() {
    for (const button of document.querySelectorAll(".collection-category-tabs button")) {
      if (button.dataset.v54Icon === "1") continue;
      button.dataset.v54Icon = "1";
      prependIcon(button, iconKindForText(button.textContent, "grid"));
    }
    for (const button of document.querySelectorAll(".achievement-kind-tabs button")) {
      if (button.dataset.v54Icon === "1") continue;
      button.dataset.v54Icon = "1";
      const kind = button.dataset.achievementKind === "onsite" ? "pin" : "trophy";
      prependIcon(button, kind);
    }
  }

  function enhanceSectionHeadings() {
    for (const heading of document.querySelectorAll(".collection-section-heading h3, .achievement-section-heading h3, .achievement-onsite-section-head h3")) {
      if (heading.dataset.v54Icon === "1") continue;
      heading.dataset.v54Icon = "1";
      prependIcon(heading, iconKindForText(heading.textContent, "grid"), "v54-section-icon");
    }
  }

  function enhanceCollectionCards() {
    for (const card of document.querySelectorAll("details.collection-card")) {
      if (card.dataset.v54Enhanced === "1") continue;
      card.dataset.v54Enhanced = "1";
      const title = card.querySelector(".collection-card-title");
      const text = title?.querySelector("strong")?.textContent || title?.textContent || "";
      if (title) title.prepend(icon(iconKindForText(text, "grid"), "v54-card-icon"));
      card.addEventListener("toggle", () => {
        card.setAttribute("aria-expanded", card.open ? "true" : "false");
      });
      card.setAttribute("aria-expanded", card.open ? "true" : "false");
    }
  }

  function isInteractiveChild(target) {
    return !!(target instanceof Element && target.closest("button, a, input, select, textarea, summary"));
  }

  function toggleAchievementCard(card) {
    const expanded = !card.classList.contains("v54-expanded");
    card.classList.toggle("v54-expanded", expanded);
    card.setAttribute("aria-expanded", expanded ? "true" : "false");
  }

  function bindAchievementCard(card, kind) {
    if (card.dataset.v54Enhanced === "1") return;
    card.dataset.v54Enhanced = "1";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-expanded", "false");
    card.prepend(icon(kind, "v54-card-icon"));

    const hint = document.createElement("span");
    hint.className = "v54-expand-hint";
    hint.setAttribute("aria-hidden", "true");
    hint.textContent = "+";
    card.appendChild(hint);

    card.addEventListener("click", (event) => {
      if (isInteractiveChild(event.target)) return;
      toggleAchievementCard(card);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (isInteractiveChild(event.target) && event.target !== card) return;
      event.preventDefault();
      toggleAchievementCard(card);
    });
  }

  function enhanceAchievementCards() {
    for (const card of document.querySelectorAll(".achievement-card")) {
      const section = card.closest(".achievement-section");
      const category = section?.querySelector(".achievement-section-heading h3")?.textContent || "";
      bindAchievementCard(card, iconKindForText(category, "trophy"));
    }
    for (const card of document.querySelectorAll(".achievement-onsite-card")) {
      bindAchievementCard(card, "pin");
    }
  }

  function enhanceFooter() {
    const iconByLabel = {
      "地図": "pin",
      "コレクション": "grid",
      "実績": "trophy",
      "旅行": "route"
    };
    for (const button of document.querySelectorAll(".app-tabs .app-tab")) {
      if (button.dataset.v54Footer === "1") continue;
      const label = button.textContent.trim();
      const kind = iconByLabel[label] || (button.dataset.footerTab === "achievements" ? "trophy" : "grid");
      button.dataset.v54Footer = "1";
      button.textContent = "";
      button.appendChild(icon(kind, "v54-nav-icon"));
      const text = document.createElement("span");
      text.className = "v54-nav-label";
      text.textContent = label || "メニュー";
      button.appendChild(text);
    }
  }

  function enhanceHero() {
    const hero = document.querySelector(".achievement-hero");
    const equipped = hero?.querySelector(".achievement-equipped");
    if (equipped && equipped.dataset.v54Icon !== "1") {
      equipped.dataset.v54Icon = "1";
      equipped.style.position = "relative";
    }
  }

  function refresh() {
    scheduled = false;
    enhanceMetrics();
    enhanceCategoryTabs();
    enhanceSectionHeadings();
    enhanceCollectionCards();
    enhanceAchievementCards();
    enhanceFooter();
    enhanceHero();
    document.documentElement.dataset.compactUi = BUILD;
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(refresh);
  }

  function install() {
    refresh();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("onsen-app-tab-changed", schedule);
    window.addEventListener("app-domain-synced", schedule);
    window.addEventListener("pageshow", schedule);
    window.OnsenCompactUi = { build: BUILD, refresh: schedule };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
