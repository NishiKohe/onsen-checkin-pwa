(() => {
  "use strict";
  const BUILD = "v73.7";
  const opened = new Set();
  const closed = new Set();
  let installed = false;
  function root() { return document.getElementById("collectionCommonListV732"); }
  function hasFilter() {
    const panel = document.getElementById("collectionCommonPanelV732");
    if (!panel) return false;
    return !!panel.querySelector("#collectionCommonSearchV732")?.value.trim() ||
      !!panel.querySelector('[data-common-status].active:not([data-common-status="all"])') ||
      !!panel.querySelector('[data-common-scope].active:not([data-common-scope="all"])') ||
      (panel.querySelector("#collectionCommonPrefV732")?.value || "all") !== "all";
  }
  function setSection(section, expanded) {
    const rows = section.querySelector(".collection-common-rows-v732");
    const button = section.querySelector(".collection-pref-trigger-v737");
    if (!rows || !button) return;
    rows.hidden = !expanded;
    button.setAttribute("aria-expanded", String(expanded));
    button.querySelector(".collection-pref-chevron-v737").textContent = expanded ? "⌃" : "⌄";
  }
  function sync() {
    const list = root();
    if (!list) return;
    const filtered = hasFilter();
    for (const [i, section] of [...list.querySelectorAll(":scope > .collection-common-pref-v732")].entries()) {
      const heading = section.querySelector(".collection-common-pref-heading-v732");
      const rows = section.querySelector(".collection-common-rows-v732");
      if (!heading || !rows) continue;
      const prefecture = heading.querySelector("h3")?.textContent?.trim();
      if (!prefecture) continue;
      section.dataset.collectionPref = prefecture;
      let trigger = heading.querySelector(".collection-pref-trigger-v737");
      if (!trigger) {
        trigger = document.createElement("button");
        trigger.type = "button";
        trigger.className = "collection-pref-trigger-v737";
        const name = heading.querySelector("h3");
        const progress = heading.querySelector("span");
        const chevron = document.createElement("b");
        chevron.className = "collection-pref-chevron-v737";
        chevron.setAttribute("aria-hidden", "true");
        trigger.append(name, progress, chevron);
        heading.appendChild(trigger);
      }
      rows.id = `collectionPrefRowsV737_${i}`;
      trigger.setAttribute("aria-controls", rows.id);
      setSection(section, opened.has(prefecture) || filtered && !closed.has(prefecture));
    }
  }
  function setAll(expanded) {
    const list = root();
    if (!list) return;
    for (const section of list.querySelectorAll(":scope > .collection-common-pref-v732")) {
      const pref = section.dataset.collectionPref;
      if (!pref) continue;
      if (expanded) { opened.add(pref); closed.delete(pref); }
      else { opened.delete(pref); closed.add(pref); }
      setSection(section, expanded);
    }
  }
  function ensureToolbar() {
    const panel = document.getElementById("collectionCommonPanelV732");
    const list = root();
    if (!panel || !list || panel.querySelector("#collectionPrefToolbarV737")) return;
    const bar = document.createElement("div");
    bar.id = "collectionPrefToolbarV737";
    bar.className = "collection-pref-toolbar-v737";
    const label = document.createElement("span");
    label.textContent = "都道府県を選んで地点を見る";
    const expand = document.createElement("button"); expand.type = "button"; expand.textContent = "すべて開く";
    const collapse = document.createElement("button"); collapse.type = "button"; collapse.textContent = "閉じる";
    expand.addEventListener("click", () => setAll(true));
    collapse.addEventListener("click", () => setAll(false));
    bar.append(label, expand, collapse);
    list.insertAdjacentElement("beforebegin", bar);
  }
  function install() {
    if (installed) return;
    const list = root();
    if (!list) { setTimeout(install, 150); return; }
    installed = true;
    ensureToolbar();
    list.addEventListener("click", event => {
      const button = event.target instanceof Element ? event.target.closest(".collection-pref-trigger-v737") : null;
      if (!button) return;
      const section = button.closest(".collection-common-pref-v732");
      const pref = section?.dataset.collectionPref;
      if (!pref) return;
      const expand = button.getAttribute("aria-expanded") !== "true";
      if (expand) { opened.add(pref); closed.delete(pref); }
      else { opened.delete(pref); closed.add(pref); }
      setSection(section, expand);
    });
    new MutationObserver(sync).observe(list, { childList: true });
    window.addEventListener("onsen-collection-domain-v732-changed", () => { opened.clear(); closed.clear(); queueMicrotask(sync); });
    window.addEventListener("onsen-app-tab-changed", () => { ensureToolbar(); queueMicrotask(sync); });
    sync();
    window.OnsenCollectionPrefFoldV737 = { build: BUILD, sync, setAll, diagnostics: () => ({ sections: root()?.querySelectorAll(":scope > .collection-common-pref-v732").length || 0, open: root()?.querySelectorAll(".collection-pref-trigger-v737[aria-expanded='true']").length || 0 }) };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();