(() => {
  const BUILD = "v56";
  let installed = false;
  let scheduled = false;
  let toolsRoot = null;

  const ICONS = {
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6-5.1 6-11a6 6 0 1 0-12 0c0 5.9 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/></svg>',
    record: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
    alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/></svg>',
    target: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
    camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h4l1.5-2h5L16 8h4v11H4z"/><circle cx="12" cy="13" r="3"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
    route: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M7.5 16.5c2.5-1.5 1.5-4 4-5.5s3.5.5 5-3.5"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9 5 5 5-5"/></svg>'
  };

  function icon(kind, className) {
    const span = document.createElement("span");
    span.className = className;
    span.setAttribute("aria-hidden", "true");
    span.innerHTML = ICONS[kind] || ICONS.info;
    return span;
  }

  function waitForTripUi() {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const timer = setInterval(() => {
        attempts += 1;
        const view = document.getElementById("tripView");
        const shell = view?.querySelector(".trip-shell");
        const power = document.getElementById("tripPowerCard");
        if (view && shell && power) {
          clearInterval(timer);
          resolve({ view, shell, power });
          return;
        }
        if (attempts >= 300) {
          clearInterval(timer);
          reject(new Error("trip UI was not ready"));
        }
      }, 50);
    });
  }

  function decorateMetrics(shell) {
    const mapping = ["pin", "record", "alert"];
    shell.querySelectorAll(".trip-metrics > div").forEach((metric, index) => {
      if (metric.dataset.v56Icon === "1") return;
      metric.dataset.v56Icon = "1";
      metric.prepend(icon(mapping[index] || "record", "v56-trip-metric-icon"));
    });
  }

  function cardKind(card) {
    if (card.querySelector("#tripCandidateList")) return "target";
    if (card.querySelector("#tripPhotoInput")) return "camera";
    if (card.querySelector("#tripManualSpot")) return "plus";
    if (card.querySelector("#tripSessionList")) return "route";
    if (card.classList.contains("trip-legend")) return "info";
    return "info";
  }

  function ensureLegendHeading(card) {
    let head = card.querySelector(":scope > .v56-trip-synthetic-head");
    if (head) return head;

    const oldHeading = card.querySelector(":scope > h3");
    const title = oldHeading?.textContent?.trim() || "訪問状態";
    if (oldHeading) oldHeading.remove();

    head = document.createElement("div");
    head.className = "v56-trip-synthetic-head";
    head.innerHTML = `<div><h3>${title}</h3><p>現地確認と訪問記録の違い</p></div>`;
    card.prepend(head);
    return head;
  }

  function enhanceHeading(card) {
    if (card.dataset.v56Enhanced === "1") return;
    card.dataset.v56Enhanced = "1";

    const head = card.classList.contains("trip-legend")
      ? ensureLegendHeading(card)
      : card.querySelector(":scope > .trip-card-heading");
    if (!head) return;

    head.setAttribute("role", "button");
    head.setAttribute("tabindex", "0");
    head.setAttribute("aria-expanded", "false");

    const main = head.querySelector(":scope > div:first-of-type") || head.firstElementChild;
    if (main && !head.querySelector(":scope > .v56-trip-card-icon")) {
      head.insertBefore(icon(cardKind(card), "v56-trip-card-icon"), main);
    }

    if (!head.querySelector(":scope > .v56-trip-chevron")) {
      head.appendChild(icon("chevron", "v56-trip-chevron"));
    }
  }

  function createToolsShell(shell, power) {
    if (shell.querySelector(":scope > .v56-trip-tools")) {
      toolsRoot = shell.querySelector(":scope > .v56-trip-tools");
      return;
    }

    const label = document.createElement("div");
    label.className = "v56-trip-tools-label";
    label.innerHTML = "<strong>旅行ツール</strong><span>必要な項目だけ開く</span>";

    toolsRoot = document.createElement("div");
    toolsRoot.className = "v56-trip-tools";

    power.insertAdjacentElement("afterend", label);
    label.insertAdjacentElement("afterend", toolsRoot);

    const cards = [...shell.querySelectorAll(":scope > .trip-card")].filter((card) => card !== power);
    for (const card of cards) {
      enhanceHeading(card);
      toolsRoot.appendChild(card);
    }
  }

  function setExpanded(card, expanded) {
    if (!card) return;
    if (expanded && toolsRoot) {
      for (const other of toolsRoot.querySelectorAll(":scope > .trip-card.v56-trip-expanded")) {
        if (other === card) continue;
        other.classList.remove("v56-trip-expanded");
        const otherHead = other.querySelector(":scope > .trip-card-heading, :scope > .v56-trip-synthetic-head");
        otherHead?.setAttribute("aria-expanded", "false");
      }
    }

    card.classList.toggle("v56-trip-expanded", expanded);
    const head = card.querySelector(":scope > .trip-card-heading, :scope > .v56-trip-synthetic-head");
    head?.setAttribute("aria-expanded", expanded ? "true" : "false");

    if (expanded) {
      requestAnimationFrame(() => card.scrollIntoView({ block: "nearest", behavior: "auto" }));
    }
  }

  function isActionTarget(target) {
    return !!(target instanceof Element && target.closest("button, a, input, label, select, textarea"));
  }

  function bindTools() {
    if (!toolsRoot || toolsRoot.dataset.v56Bound === "1") return;
    toolsRoot.dataset.v56Bound = "1";

    toolsRoot.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || isActionTarget(target)) return;
      const head = target.closest(".trip-card-heading, .v56-trip-synthetic-head");
      if (!head || !toolsRoot.contains(head)) return;
      const card = head.closest(".trip-card");
      if (!card) return;
      setExpanded(card, !card.classList.contains("v56-trip-expanded"));
    });

    toolsRoot.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.matches(".trip-card-heading, .v56-trip-synthetic-head")) return;
      event.preventDefault();
      const card = target.closest(".trip-card");
      if (!card) return;
      setExpanded(card, !card.classList.contains("v56-trip-expanded"));
    });
  }

  function syncCandidateAttention() {
    const card = document.getElementById("tripCandidateList")?.closest(".trip-card");
    if (!card) return;
    const count = Number(document.getElementById("tripCandidateMetric")?.textContent || 0);
    card.classList.toggle("v56-trip-attention", count > 0);

    const headMain = card.querySelector(".trip-card-heading > div:first-of-type");
    let badge = headMain?.querySelector(".v56-trip-card-badge");
    if (count > 0 && headMain) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "v56-trip-card-badge";
        headMain.querySelector("h3")?.appendChild(badge);
      }
      const nextText = String(count);
      if (badge.textContent !== nextText) badge.textContent = nextText;
    } else {
      badge?.remove();
    }
  }

  function enhancePowerCard(power) {
    if (power.dataset.v56Enhanced === "1") return;
    power.dataset.v56Enhanced = "1";
    const title = power.querySelector(".trip-power-head h3");
    if (title && title.textContent !== "GPS記録") title.textContent = "GPS記録";
  }

  function refresh() {
    scheduled = false;
    const shell = document.querySelector("#tripView .trip-shell");
    const power = document.getElementById("tripPowerCard");
    if (!shell || !power) return;

    shell.classList.add("v56-trip-ui");
    decorateMetrics(shell);
    enhancePowerCard(power);
    createToolsShell(shell, power);

    for (const card of toolsRoot?.querySelectorAll(":scope > .trip-card") || []) enhanceHeading(card);
    bindTools();
    syncCandidateAttention();
    document.documentElement.dataset.tripUi = BUILD;
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(refresh);
  }

  async function install() {
    if (installed) return;
    installed = true;
    await waitForTripUi();
    refresh();

    const tripView = document.getElementById("tripView");
    const observer = new MutationObserver(schedule);
    observer.observe(tripView, { childList: true, subtree: true, characterData: true });

    window.addEventListener("onsen-app-tab-changed", (event) => {
      if (event.detail?.tab === "trip") schedule();
    });
    window.addEventListener("pageshow", schedule);
    window.addEventListener("storage", schedule);

    window.OnsenTripUi = {
      build: BUILD,
      refresh: schedule,
      open: (kind) => {
        schedule();
        requestAnimationFrame(() => {
          const selector = {
            candidates: "#tripCandidateList",
            photo: "#tripPhotoInput",
            manual: "#tripManualSpot",
            history: "#tripSessionList"
          }[kind];
          const card = selector ? document.querySelector(selector)?.closest(".trip-card") : null;
          if (card) setExpanded(card, true);
        });
      }
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => install().catch(console.warn), { once: true });
  else install().catch((err) => console.warn("trip UI v56 init failed", err));
})();
