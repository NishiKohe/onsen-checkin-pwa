(() => {
  "use strict";
  const BUILD = "v73.7";
  let installed = false;
  let selection = null;
  let opener = null;
  let dockObserver = null;
  function main() { return document.querySelector(".main"); }
  function dialog() { return document.getElementById("mapPlaceDetailV737"); }
  function row(label, value) {
    if (value == null || value === "") return null;
    const item = document.createElement("div");
    item.className = "map-place-row-v737";
    const key = document.createElement("dt"), val = document.createElement("dd");
    key.textContent = label; val.textContent = String(value); item.append(key, val);
    return item;
  }
  function section(root, title, entries) {
    const content = entries.filter(Boolean);
    if (!content.length) return;
    const group = document.createElement("section");
    const heading = document.createElement("h3"); heading.textContent = title;
    const list = document.createElement("dl"); list.append(...content);
    group.append(heading, list); root.append(group);
  }
  function link(root, url, label) {
    if (!/^https?:\/\//i.test(String(url || ""))) return;
    const a = document.createElement("a"); a.href = url; a.target = "_blank";
    a.rel = "noopener noreferrer"; a.textContent = label; root.append(a);
  }
  function render() {
    const d = dialog(), body = d?.querySelector(".map-place-content-v737");
    selection = window.OnsenMapDetailV736?.diagnostics?.().currentSelection || selection;
    if (!body || !selection) return false;
    body.replaceChildren();
    const { domain, id } = selection;
    let item, title, subtitle;
    if (domain === "onsen") {
      item = typeof spots !== "undefined" ? spots.find(x => String(x.id) === id) : null;
      if (!item) return false;
      title = item.name; subtitle = item.prefecture;
      section(body, "温泉地について", [row("概要", item.summary), row("温泉むすめ", (item.onsenMusumeCharacters || item.onsenMusume?.characters || []).join("、")), row("構成する温泉", item.subAreas?.join("、"))]);
      const analysis = item.analysis || {};
      section(body, "泉質・分析情報", [row("泉質", analysis.springType), row("源泉温度", analysis.sourceTempC == null ? null : `${analysis.sourceTempC}℃`), row("pH", analysis.ph), row("溶存物質", analysis.dissolvedSolidsMgKg == null ? null : `${analysis.dissolvedSolidsMgKg} mg/kg`), row("湧出量", analysis.flowLMin == null ? null : `${analysis.flowLMin} L/min`), row("分析年月日", analysis.analysisDate), row("分析機関", analysis.analyzer)]);
      const zones = typeof getCheckinZones === "function" ? getCheckinZones(item) : [];
      section(body, "訪問と対象範囲", [row("訪問状況", typeof loadCheckins === "function" && loadCheckins().some(record => String(record.spotId) === id) ? "訪問記録あり" : "未訪問"), ...zones.map(z => row(z.label, `中心から約${Math.round(z.radiusM)}m`))]);
      section(body, "データの注記", [row("収録・範囲について", item.referenceNote)]);
      const urls = [item.officialUrl, ...(item.sourceUrls || [])].filter(Boolean);
      if (urls.length) { const sources = document.createElement("section"); const h = document.createElement("h3"); h.textContent = "関連リンク"; sources.append(h); urls.forEach((url, i) => link(sources, url, `参照先 ${i + 1} ↗`)); body.append(sources); }
    } else if (domain === "castle") {
      item = window.OnsenCastleDomain?.data?.entities?.find(x => String(x.id) === id);
      if (!item) return false;
      title = item.name; subtitle = `${item.prefecture || ""} ・ ${Number(item.japan100No) >= 101 ? "続日本100名城" : "日本100名城"} #${item.japan100No}`;
      section(body, "城の情報", [row("所在地", item.prefecture), row("地域", item.region), row("城郭の種類", item.castleType), row("分類番号", item.japan100No)]);
      const zone = window.OnsenCastleMap?.zones?.()?.entries?.find(x => String(x.castleId) === id);
      section(body, "訪問とチェックイン", [row("訪問状況", window.OnsenCastleVisits?.isStrictGps?.(id) ? "GPS確認済" : window.OnsenCastleVisits?.isVisited?.(id) ? "訪問登録済" : "未訪問"), row("判定地点", zone?.label || zone?.name), row("判定半径", zone?.radiusM ? `約${Math.round(zone.radiusM)}m` : null), row("GPS精度の基準", zone?.accuracyRequiredM ? `${Math.round(zone.accuracyRequiredM)}m以内` : null)]);
      const people = window.OnsenCharacterRuntime?.candidatesForCastle?.(id) || [];
      section(body, "人物との縁", [row("関連人物", people.map(x => x.name).join("、"))]);
    } else if (domain === "scenic") {
      const rt = window.OnsenScenicRuntime;
      item = rt?.get?.(id); if (!item) return false;
      title = item.name; subtitle = item.prefectures?.join("、") || item.location || "名勝";
      const date = String(item.designatedDate || "");
      section(body, "指定と所在地", [row("種別", item.specialScenic ? "特別名勝" : item.designation || "名勝"), row("所在地", item.location), row("都道府県", item.prefectures?.join("、")), row("指定日", /^\d{8}$/.test(date) ? `${date.slice(0, 4)}年${date.slice(4, 6)}月${date.slice(6)}日` : date), row("文化財管理ID", item.officialManageId)]);
      const coverage = rt?.coverageStatus?.(id), zones = rt?.referenceZones?.(id) || [];
      section(body, "訪問と対象範囲", [row("訪問状況", rt?.loadState?.()?.visited?.[id]?.verificationType === "gps_scenic" ? "GPS確認済" : rt?.isVisited?.(id) ? "訪問登録済" : "未訪問"), row("GPSチェックイン", coverage?.ready ? "対象" : "対象地点未設定"), row("登録地点数", zones.length ? `${zones.length}か所` : null), ...zones.map((z, i) => row(z.label || `地点${i + 1}`, z.radiusM ? `中心から約${Math.round(z.radiusM)}m` : "位置情報あり"))]);
      if (item.sourceUrl) { const sources = document.createElement("section"); const h = document.createElement("h3"); h.textContent = "出典"; sources.append(h); link(sources, item.sourceUrl, "文化財データを確認 ↗"); body.append(sources); }
    } else return false;
    d.querySelector(".map-place-category-v737").textContent = { onsen: "温泉", castle: "名城", scenic: "名勝" }[domain];
    d.querySelector(".map-place-title-v737").textContent = title;
    d.querySelector(".map-place-subtitle-v737").textContent = subtitle || "";
    return true;
  }
  function expand(next) {
    const d = dialog();
    if (!d) return;
    if (!next) { if (d.open) d.close(); return; }
    if (!main()?.classList.contains("map-detail-open") || !render()) return;
    opener = document.activeElement;
    if (!d.open) d.showModal();
    d.querySelector(".map-place-close-v737").focus();
  }
  function refreshSummary() {
    const current = window.OnsenMapDetailV736?.diagnostics?.().currentSelection;
    if (current?.domain !== "onsen" || typeof spots === "undefined") return;
    const item = spots.find(spot => String(spot.id) === current.id);
    if (!item) return;
    const visited = typeof loadCheckins === "function" && loadCheckins().some(record => String(record.spotId) === current.id);
    const subtitle = document.getElementById("spotSub");
    if (subtitle) subtitle.textContent = `${item.prefecture || "温泉"} ・ ${visited ? "訪問記録あり" : "未訪問"}`;
  }
  function syncDockSize() {
    const root = main();
    if (!root) return;
    const height = [...root.querySelectorAll(":scope > .panel, :scope > .unified-checkin-bar")]
      .reduce((sum, item) => sum + item.getBoundingClientRect().height, 0);
    root.style.setProperty("--map-dock-height", `${Math.ceil(height)}px`);
  }
  function ensureControls() {
    for (const item of main()?.querySelectorAll(":scope > .panel, :scope > .unified-checkin-bar") || []) dockObserver?.observe(item);
    syncDockSize();
    for (const panel of main()?.querySelectorAll(":scope > .panel") || []) {
      if (panel.querySelector(".map-detail-expand-v737")) continue;
      const button = document.createElement("button");
      button.type = "button"; button.className = "map-detail-expand-v737";
      button.textContent = "詳細を見る";
      button.addEventListener("click", event => { event.stopPropagation(); expand(true); });
      const close = panel.querySelector(".map-detail-close-v736");
      if (close) close.insertAdjacentElement("afterend", button);
      else panel.prepend(button);
    }
  }
  function install() {
    if (installed) return; installed = true;
    const d = document.createElement("dialog");
    d.id = "mapPlaceDetailV737"; d.className = "map-place-detail-v737";
    d.setAttribute("aria-labelledby", "mapPlaceTitleV737");
    d.innerHTML = '<div class="map-place-head-v737"><div><span class="map-place-category-v737"></span><h2 class="map-place-title-v737" id="mapPlaceTitleV737"></h2><p class="map-place-subtitle-v737"></p></div><button type="button" class="map-place-close-v737" aria-label="詳細を閉じる">×</button></div><div class="map-place-content-v737"></div>';
    document.body.append(d);
    d.querySelector(".map-place-close-v737").addEventListener("click", () => expand(false));
    d.addEventListener("keydown", event => { if (event.key === "Escape") event.stopPropagation(); });
    d.addEventListener("click", event => { if (event.target === d) expand(false); });
    d.addEventListener("close", () => { main()?.classList.remove("map-detail-expanded"); if (opener?.isConnected) opener.focus(); opener = null; });
    if (typeof ResizeObserver !== "undefined") dockObserver = new ResizeObserver(syncDockSize);
    ensureControls();
    window.addEventListener("resize", syncDockSize);
    if (main()) new MutationObserver(ensureControls).observe(main(), { childList: true });
    window.addEventListener("onsen-map-detail-v736-opened", event => { if (selection?.domain !== event.detail.domain || selection?.id !== event.detail.id) expand(false); selection = event.detail; ensureControls(); refreshSummary(); });
    window.addEventListener("onsen-map-detail-v736-closed", () => { expand(false); selection = null; });
    window.addEventListener("onsen-app-tab-changed", event => { if (event.detail?.tab !== "map") expand(false); ensureControls(); });
    window.OnsenMapDetailCompactV737 = { build: BUILD, expand, refresh: () => { refreshSummary(); if (d.open) render(); }, diagnostics: () => ({ open: !!main()?.classList.contains("map-detail-open"), expanded: !!d.open, selection }) };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
