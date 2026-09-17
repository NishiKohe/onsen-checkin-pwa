(() => {
  "use strict";
  const BUILD = "v73.7";
  const DOMAINS = ["onsen", "castle", "scenic"];
  const DEFS = {
    onsen: { label: "温泉", layers: ["spots-symbol", "spots-labels"] },
    castle: { label: "名城200", layers: ["castles-v62-symbol", "castles-v62-labels"] },
    scenic: { label: "名勝", layers: ["scenic-v734-points", "scenic-v734-labels"] }
  };
  let installed = false;
  let mapBound = null;
  let open = false;
  let state = { query: "", prefecture: "", status: "all" };
  let results = [];
  const $ = (id) => document.getElementById(id);
  function getMap() { try { return typeof map !== "undefined" ? map : null; } catch { return null; } }
  function mode() { return window.OnsenMapDomainV73?.getMode?.() || "all"; }
  function norm(text) { return String(text ?? "").normalize("NFKC").toLowerCase().replace(/[\s　・･]/g, ""); }
  function visibleDomains() { return mode() === "all" ? DOMAINS : [mode()].filter(d => DOMAINS.includes(d)); }
  function validPoint(lng, lat) { return Number.isFinite(Number(lng)) && Number.isFinite(Number(lat)) && Number(lng) >= 122 && Number(lng) <= 154 && Number(lat) >= 20 && Number(lat) <= 46.5; }
  function catalog() {
    const out = [];
    const onsenVisits = new Set((typeof loadCheckins === "function" ? loadCheckins() : []).map(v => String(v.spotId)));
    if (typeof spots !== "undefined" && Array.isArray(spots)) for (const s of spots) {
      if (!s?.id || !validPoint(s.lng, s.lat)) continue;
      const chars = Array.isArray(s.onsenMusumeCharacters) ? s.onsenMusumeCharacters : (s.onsenMusume?.characters || []);
      out.push({ domain: "onsen", id: String(s.id), name: String(s.name || s.id), pref: [s.prefecture].filter(Boolean), visited: onsenVisits.has(String(s.id)), lng: Number(s.lng), lat: Number(s.lat), search: norm([s.name, s.prefecture, ...(Array.isArray(chars) ? chars : [])].join(" ")) });
    }
    const castleVisits = window.OnsenCastleVisits;
    for (const c of window.OnsenCastleDomain?.data?.entities || []) {
      const zone = window.OnsenCastleDomain?.data?.zoneData?.entries?.find(z => String(z.castleId) === String(c.id));
      const lng = Number(zone?.lng ?? c.lng), lat = Number(zone?.lat ?? c.lat);
      if (!c?.id || !validPoint(lng, lat)) continue;
      out.push({ domain: "castle", id: String(c.id), name: String(c.name || c.id), pref: [c.prefecture].filter(Boolean), visited: !!castleVisits?.isVisited?.(c.id), lng, lat, search: norm([c.name, c.prefecture, c.region, c.japan100No].join(" ")) });
    }
    const rt = window.OnsenScenicRuntime;
    const scenicVisits = rt?.loadState?.()?.visited || {};
    for (const s of rt?.entries?.() || []) {
      const zone = rt?.referenceZones?.(s)?.find(z => validPoint(z.lng, z.lat));
      if (!s?.id || !zone) continue;
      const pref = Array.isArray(s.prefectures) ? s.prefectures : [];
      out.push({ domain: "scenic", id: String(s.id), name: String(s.name || s.id).split(/\r?\n/)[0], pref, visited: !!scenicVisits[s.id], lng: Number(zone.lng), lat: Number(zone.lat), search: norm([s.name, ...pref, s.designation, s.location, s.specialScenic ? "特別名勝" : ""].join(" ")) });
    }
    return out;
  }
  function matches(item) {
    if (!visibleDomains().includes(item.domain)) return false;
    if (state.prefecture && !item.pref.includes(state.prefecture)) return false;
    if (state.status === "visited" && !item.visited) return false;
    if (state.status === "unvisited" && item.visited) return false;
    return !state.query || item.search.includes(norm(state.query));
  }
  function ensureUi() {
    const shell = document.querySelector(".map-shell");
    if (!shell) return null;
    let root = $("mapDiscoveryV737");
    if (root) return root;
    root = document.createElement("div");
    root.id = "mapDiscoveryV737";
    root.className = "map-discovery-v737";
    root.innerHTML = `<button id="mapDiscoveryToggleV737" type="button" aria-controls="mapDiscoveryPanelV737" aria-expanded="false">⌕ 検索・絞り込み</button><section id="mapDiscoveryPanelV737" hidden aria-label="地点を探す"><div class="map-discovery-search-v737"><input id="mapDiscoveryQueryV737" type="search" placeholder="温泉・城・名勝を検索" aria-label="地点名や都道府県で検索" autocomplete="off"><button id="mapDiscoveryClearV737" type="button" aria-label="検索を消去">×</button></div><div class="map-discovery-filters-v737"><select id="mapDiscoveryPrefV737" aria-label="都道府県"><option value="">全国</option></select><select id="mapDiscoveryStatusV737" aria-label="取得状態"><option value="all">すべて</option><option value="unvisited">未取得</option><option value="visited">取得済</option></select><button id="mapDiscoveryResetV737" type="button">条件をクリア</button></div><p id="mapDiscoveryCountV737" role="status" aria-live="polite"></p><div id="mapDiscoveryResultsV737" class="map-discovery-results-v737"></div></section>`;
    shell.appendChild(root);
    $("mapDiscoveryToggleV737").addEventListener("click", () => show(!open));
    $("mapDiscoveryQueryV737").addEventListener("input", e => { state.query = e.target.value.trim(); refresh(); });
    $("mapDiscoveryQueryV737").addEventListener("keydown", e => { if (e.key === "Enter" && results.length) { e.preventDefault(); go(results[0]); } });
    $("mapDiscoveryClearV737").addEventListener("click", () => { state.query = ""; $("mapDiscoveryQueryV737").value = ""; refresh(); $("mapDiscoveryQueryV737").focus(); });
    $("mapDiscoveryPrefV737").addEventListener("change", e => { state.prefecture = e.target.value; refresh(); });
    $("mapDiscoveryStatusV737").addEventListener("change", e => { state.status = e.target.value; refresh(); });
    $("mapDiscoveryResetV737").addEventListener("click", () => { state = { query: "", prefecture: "", status: "all" }; $("mapDiscoveryQueryV737").value = ""; $("mapDiscoveryPrefV737").value = ""; $("mapDiscoveryStatusV737").value = "all"; refresh(); });
    $("mapDiscoveryResultsV737").addEventListener("click", e => { const button = e.target instanceof Element ? e.target.closest("[data-discovery-index]") : null; if (button) go(results[Number(button.dataset.discoveryIndex)]); });
    return root;
  }
  function show(next) {
    ensureUi(); open = !!next;
    $("mapDiscoveryPanelV737").hidden = !open;
    $("mapDiscoveryToggleV737").setAttribute("aria-expanded", String(open));
    if (open) { refresh(); $("mapDiscoveryQueryV737").focus(); }
  }
  function updatePrefs(all) {
    const select = $("mapDiscoveryPrefV737");
    if (!select) return;
    const pref = [...new Set(all.filter(item => visibleDomains().includes(item.domain)).flatMap(item => item.pref))].sort((a, b) => a.localeCompare(b, "ja"));
    if (pref.join("|") === select.dataset.options) return;
    select.dataset.options = pref.join("|");
    select.replaceChildren(new Option("全国", ""), ...pref.map(p => new Option(p, p)));
    if (!pref.includes(state.prefecture)) state.prefecture = "";
    select.value = state.prefecture;
  }
  function applyLayers(all) {
    const m = getMap();
    if (!m?.setFilter || !m?.isStyleLoaded?.()) return;
    for (const domain of DOMAINS) {
      const matched = all.filter(item => item.domain === domain && matches(item)).map(item => item.id);
      const expression = ["in", ["to-string", ["get", "id"]], ["literal", matched]];
      for (const id of DEFS[domain].layers) {
        if (!m.getLayer?.(id)) continue;
        try { m.setFilter(id, expression); } catch (error) { console.warn("discovery layer filter failed", id, error); }
      }
    }
  }
  function refresh() {
    ensureUi();
    const all = catalog();
    updatePrefs(all);
    results = all.filter(matches);
    const count = $("mapDiscoveryCountV737");
    if (count) count.textContent = `表示 ${results.length} 件（${visibleDomains().map(d => DEFS[d].label).join("・")}）`;
    const list = $("mapDiscoveryResultsV737");
    if (list) {
      list.replaceChildren();
      for (const [index, item] of results.slice(0, 30).entries()) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.discoveryIndex = String(index);
        const name = document.createElement("strong"); name.textContent = item.name;
        const subtitle = document.createElement("span"); subtitle.textContent = `${DEFS[item.domain].label} ・ ${item.pref.join("・") || "都道府県未設定"} ・ ${item.visited ? "取得済" : "未取得"}`;
        button.append(name, subtitle); list.appendChild(button);
      }
      if (results.length > 30) { const note = document.createElement("p"); note.textContent = `先頭30件を表示中。名称・県で絞り込んでください。`; list.appendChild(note); }
      else if (!results.length) { const note = document.createElement("p"); note.textContent = "該当する地点はありません。"; list.appendChild(note); }
    }
    applyLayers(all);
    return results.length;
  }
  function go(item) {
    if (!item) return false;
    show(false);
    const m = getMap();
    if (m) m.flyTo?.({ center: [item.lng, item.lat], zoom: Math.max(11, m.getZoom?.() || 11) });
    // Keep the combined tab selected; only the detail domain changes.
    const selection = window.OnsenMapDetailV736?.select?.(item.domain, item.id);
    if (selection) window.OnsenMapDetailV736?.present?.(item.domain, item.id);
    return !!selection;
  }
  function bindMap() {
    const m = getMap();
    if (!m || mapBound === m) return;
    mapBound = m;
    m.on?.("style.load", () => setTimeout(refresh, 0));
  }
  function install() {
    if (installed) return;
    installed = true;
    ensureUi();
    // The legacy search only filters hot springs; show one truthful shared search instead.
    if (typeof resetAllFilters === "function") resetAllFilters();
    bindMap();
    refresh();
    window.addEventListener("onsen-map-domain-v73-changed", () => { show(false); refresh(); });
    window.addEventListener("onsen-castle-map-ready", refresh);
    window.addEventListener("onsen-scenic-runtime-ready", refresh);
    window.addEventListener("onsen-scenic-renderer-ready", () => { bindMap(); refresh(); });
    for (const event of ["onsen-castle-visit-changed", "onsen-scenic-visit-changed", "onsen-checkin-completed", "onsen-app-tab-changed", "pageshow"]) window.addEventListener(event, () => { bindMap(); refresh(); });
    window.OnsenMapDiscoveryV737 = { build: BUILD, catalog, refresh, show, diagnostics: () => ({ mode: mode(), open, results: results.length, catalog: catalog().length }) };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();