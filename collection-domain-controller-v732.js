(() => {
  const BUILD = "v73.2";
  const STORAGE_KEY = "collectionDomainModeV732";
  const LEGACY_KEY = "collectionDomainModeV61";
  const DOMAINS = new Set(["onsen", "castle", "scenic"]);
  const PREF_ORDER = [
    "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
    "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
    "新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県",
    "三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県",
    "鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県",
    "福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"
  ];
  const ONSITE_TYPES = new Set(["gps_manual","gps_legacy","gps_recovered","photo_exif"]);
  let installed = false;
  let mode = restoreMode();
  let query = "";
  let statusFilter = "all";
  let prefectureFilter = "all";
  let scopeFilter = "all";
  let legacySetMode = null;
  let renderScheduled = false;

  function restoreMode() {
    const current = sessionStorage.getItem(STORAGE_KEY);
    if (DOMAINS.has(current)) return current;
    const legacy = sessionStorage.getItem(LEGACY_KEY);
    return DOMAINS.has(legacy) ? legacy : "onsen";
  }
  function persist() {
    sessionStorage.setItem(STORAGE_KEY, mode);
    sessionStorage.setItem(LEGACY_KEY, mode);
  }
  function shell() { return document.querySelector("#collectionView .collection-shell"); }
  function collectionVisible() { const view=document.getElementById("collectionView"); return !!view && !view.hidden; }
  function achievementsVisible() { const view=document.getElementById("achievementView"); return collectionVisible() && !!view && !view.hidden; }
  function norm(value) { return String(value||"").normalize("NFKC").toLowerCase().replace(/[・･\s　]/g,""); }
  function shortName(value) { return String(value||"").split(/\r?\n/)[0].trim(); }
  function percent(done,total) { return total ? Math.round(done/total*100) : 0; }
  function isOnsiteRecord(record) { return record?.verificationLevel === "onsite" || ONSITE_TYPES.has(String(record?.verificationType||"")); }

  function ensureSwitcher() {
    const root = shell();
    if (!root) return null;
    let switcher = root.querySelector(".collection-domain-switch");
    if (!switcher) {
      switcher = document.createElement("div");
      switcher.className = "collection-domain-switch";
      root.querySelector(".collection-header")?.insertAdjacentElement("afterend", switcher);
    }
    const defs = [["onsen","♨ 温泉"],["castle","🏯 名城200"],["scenic","◇ 名勝"]];
    for (const [id,label] of defs) {
      if (switcher.querySelector(`[data-collection-domain="${id}"]`)) continue;
      const button=document.createElement("button"); button.type="button"; button.dataset.collectionDomain=id; button.textContent=label; switcher.appendChild(button);
    }
    return switcher;
  }

  function ensureUi() {
    const root = shell(), switcher = ensureSwitcher();
    if (!root || !switcher) return null;
    let panel = document.getElementById("collectionCommonPanelV732");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "collectionCommonPanelV732";
      panel.className = "collection-common-v732";
      panel.innerHTML = `
        <div class="collection-common-overview-v732">
          <div><span>取得</span><b id="collectionCommonVisitedV732">0/0</b></div>
          <div><span>取得率</span><b id="collectionCommonRateV732">0%</b></div>
          <div><span>現地確認</span><b id="collectionCommonOnsiteV732">0</b></div>
        </div>
        <div class="collection-common-toolbar-v732">
          <input id="collectionCommonSearchV732" type="search" placeholder="名称・都道府県で検索" autocomplete="off" />
          <select id="collectionCommonPrefV732" aria-label="都道府県"><option value="all">全国</option></select>
          <div class="collection-common-filter-row-v732">
            <button type="button" class="active" data-common-status="all">すべて</button>
            <button type="button" data-common-status="unvisited">未取得</button>
            <button type="button" data-common-status="visited">取得済</button>
          </div>
          <div id="collectionCommonScopeV732" class="collection-common-filter-row-v732"></div>
        </div>
        <div id="collectionCommonResultV732" class="collection-common-result-v732"></div>
        <div id="collectionCommonListV732" class="collection-common-list-v732"></div>`;
      switcher.insertAdjacentElement("afterend", panel);
      panel.querySelector("#collectionCommonSearchV732")?.addEventListener("input",(event)=>{query=String(event.target.value||"").trim();render();});
      panel.querySelector("#collectionCommonPrefV732")?.addEventListener("change",(event)=>{prefectureFilter=String(event.target.value||"all");render();});
      panel.addEventListener("click", handlePanelClick);
    }
    let extra = document.getElementById("collectionOnsenExtrasHeadingV732");
    if (!extra) {
      extra=document.createElement("div"); extra.id="collectionOnsenExtrasHeadingV732"; extra.className="collection-onsen-extras-heading-v732";
      extra.innerHTML="<h3>温泉固有コレクション</h3><p>温泉むすめ・選定温泉・三古泉など、温泉だけの称号・グループ進捗です。</p>";
      document.getElementById("collectionGrid")?.insertAdjacentElement("beforebegin",extra);
    }
    return panel;
  }

  function handlePanelClick(event) {
    const status = event.target instanceof Element ? event.target.closest("[data-common-status]") : null;
    if (status) { statusFilter=status.dataset.commonStatus||"all"; render(); return; }
    const scope = event.target instanceof Element ? event.target.closest("[data-common-scope]") : null;
    if (scope) { scopeFilter=scope.dataset.commonScope||"all"; render(); return; }
    const mapButton = event.target instanceof Element ? event.target.closest("[data-common-map]") : null;
    if (mapButton) openOnMap(mapButton.dataset.commonDomain, mapButton.dataset.commonMap);
  }

  function patchLegacyApi() {
    const api=window.OnsenCastleCollectionUI;
    if (!api || api.__collectionControllerV732Patched) return;
    legacySetMode = typeof api.setMode === "function" ? api.setMode.bind(api) : null;
    api.setMode=(next,options={})=>setMode(next,options);
    api.mode=()=>mode;
    api.show=()=>{window.OnsenFooterNavigation?.openCollections?.();window.OnsenAppShell?.show?.("collection");setMode("castle",{source:"castle-api"});};
    api.showOnsen=()=>setMode("onsen",{source:"castle-api"});
    api.showScenic=()=>setMode("scenic",{source:"castle-api"});
    Object.defineProperty(api,"__collectionControllerV732Patched",{value:true,configurable:true});
    const scenic=window.OnsenScenicCollectionUI;
    if (scenic && scenic.__collectionControllerV732Patched !== true) {
      scenic.show=()=>{window.OnsenFooterNavigation?.openCollections?.();window.OnsenAppShell?.show?.("collection");setMode("scenic",{source:"scenic-api"});};
      Object.defineProperty(scenic,"__collectionControllerV732Patched",{value:true,configurable:true});
    }
  }

  function syncLegacyMode() {
    if (!legacySetMode) return;
    try { legacySetMode(mode,{source:"v732-sync",silent:true}); } catch {}
  }

  function setMode(next,{source="api",silent=false}={}) {
    const normalized=DOMAINS.has(String(next))?String(next):"onsen";
    const previous=mode;
    mode=normalized; query=""; statusFilter="all"; prefectureFilter="all"; scopeFilter="all"; persist();
    syncLegacyMode();
    render();
    if (!silent && previous!==mode) window.dispatchEvent(new CustomEvent("onsen-collection-domain-v732-changed",{detail:{build:BUILD,mode,previous,source}}));
    return mode;
  }

  function onsenItems() {
    if (typeof spots === "undefined" || !Array.isArray(spots) || typeof loadCheckins !== "function") return [];
    const byId=new Map();
    for (const record of loadCheckins()) {
      const id=String(record?.spotId||""); if(!id)continue;
      if(!byId.has(id))byId.set(id,[]); byId.get(id).push(record);
    }
    return spots.filter((spot)=>spot?.id).map((spot)=>{
      const records=byId.get(String(spot.id))||[];
      return {domain:"onsen",id:String(spot.id),name:String(spot.name||spot.id),prefectures:[spot.prefecture].filter(Boolean),primaryPref:spot.prefecture||"その他",visited:records.length>0,onsite:records.some(isOnsiteRecord),mapReady:Number.isFinite(Number(spot.lat))&&Number.isFinite(Number(spot.lng)),search:`${spot.name||""} ${spot.prefecture||""} ${(spot.onsenMusumeCharacters||[]).join(" ")}`,scope:{musume:(spot.onsenMusumeCharacters||[]).length>0,regional:spot.onsenRegionalAsset===true},meta:(spot.onsenMusumeCharacters||[]).length?`温泉むすめ ${(spot.onsenMusumeCharacters||[]).join("・")}`:"温泉地"};
    });
  }
  function castleItems() {
    const entities=window.OnsenCastleDomain?.data?.entities, visits=window.OnsenCastleVisits;
    if(!Array.isArray(entities)||!visits)return [];
    return entities.map((castle)=>{const records=visits.recordsFor?.(castle.id)||[],no=Number(castle.japan100No||0);return {domain:"castle",id:String(castle.id),name:String(castle.name||castle.id),prefectures:[castle.prefecture].filter(Boolean),primaryPref:castle.prefecture||"その他",visited:records.length>0,onsite:records.some(isOnsiteRecord),mapReady:true,search:`${castle.name||""} ${castle.prefecture||""} ${castle.region||""} ${no}`,scope:{original:no<=100,continued:no>100},meta:`#${String(no).padStart(3,"0")} ${no>100?"続日本100名城":"日本100名城"}${castle.region?` ・ ${castle.region}`:""}`};});
  }
  function scenicItems() {
    const runtime=window.OnsenScenicRuntime;if(!runtime?.entries)return [];
    const state=runtime.loadState?.()||{visited:{}};
    return runtime.entries().map((entry)=>{const record=state.visited?.[entry.id]||null,prefs=Array.isArray(entry.prefectures)?entry.prefectures.filter(Boolean):[];return {domain:"scenic",id:String(entry.id),name:shortName(entry.name),prefectures:prefs,primaryPref:prefs[0]||"その他",visited:!!record,onsite:!!record&&isOnsiteRecord(record),mapReady:(runtime.referenceZones?.(entry)||[]).length>0,search:`${entry.name||""} ${prefs.join(" ")} ${entry.designation||""} ${entry.location||""}`,scope:{special:entry.specialScenic===true},meta:`${entry.specialScenic?"特別名勝":"名勝"}${entry.designation?` ・ ${entry.designation}`:""}`};});
  }
  function itemsForMode() { return mode==="castle"?castleItems():mode==="scenic"?scenicItems():onsenItems(); }

  function scopeDefinitions() {
    if(mode==="castle")return [["all","200城"],["original","日本100名城"],["continued","続100名城"]];
    if(mode==="scenic")return [["all","全433件"],["special","特別名勝"]];
    return [["all","全温泉"],["musume","温泉むすめ"],["regional","地域資産"]];
  }
  function scopeMatches(item) {
    if(scopeFilter==="all")return true;
    return item.scope?.[scopeFilter]===true;
  }
  function filteredItems(all) {
    const q=norm(query);
    return all.filter((item)=>{
      if(statusFilter==="visited"&&!item.visited)return false;
      if(statusFilter==="unvisited"&&item.visited)return false;
      if(prefectureFilter!=="all"&&!item.prefectures.includes(prefectureFilter))return false;
      if(!scopeMatches(item))return false;
      if(q&&!norm(item.search).includes(q))return false;
      return true;
    });
  }

  function renderScopeButtons() {
    const root=document.getElementById("collectionCommonScopeV732");if(!root)return;
    root.innerHTML="";
    for(const [id,label] of scopeDefinitions()) { const button=document.createElement("button");button.type="button";button.dataset.commonScope=id;button.textContent=label;button.classList.toggle("active",scopeFilter===id);root.appendChild(button); }
  }
  function renderPrefectures(all) {
    const select=document.getElementById("collectionCommonPrefV732");if(!select)return;
    const values=new Set(all.flatMap((item)=>item.prefectures));
    const ordered=[...PREF_ORDER.filter((p)=>values.has(p)),...[...values].filter((p)=>!PREF_ORDER.includes(p)).sort((a,b)=>a.localeCompare(b,"ja"))];
    const current=prefectureFilter;
    select.innerHTML='<option value="all">全国</option>';
    for(const pref of ordered){const option=document.createElement("option");option.value=pref;option.textContent=pref;select.appendChild(option);}
    select.value=values.has(current)?current:"all";if(select.value!==current)prefectureFilter="all";
  }

  function renderList(all,filtered) {
    const root=document.getElementById("collectionCommonListV732");if(!root)return;root.innerHTML="";
    if(!filtered.length){root.innerHTML='<div class="collection-common-empty-v732">条件に一致する対象はありません。</div>';return;}
    const totals=new Map();for(const item of all){const key=item.primaryPref;const value=totals.get(key)||{total:0,visited:0};value.total++;if(item.visited)value.visited++;totals.set(key,value);}
    const groups=new Map();for(const item of filtered){const key=item.primaryPref;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
    const keys=[...PREF_ORDER.filter((p)=>groups.has(p)),...[...groups.keys()].filter((p)=>!PREF_ORDER.includes(p)).sort((a,b)=>a.localeCompare(b,"ja"))];
    for(const pref of keys){
      const items=groups.get(pref)||[],base=totals.get(pref)||{total:items.length,visited:items.filter((x)=>x.visited).length};
      const section=document.createElement("section");section.className="collection-common-pref-v732";
      const heading=document.createElement("div");heading.className="collection-common-pref-heading-v732";heading.innerHTML=`<h3>${pref}</h3><span>${base.visited}/${base.total} ・ ${percent(base.visited,base.total)}%</span>`;section.appendChild(heading);
      const list=document.createElement("div");list.className="collection-common-rows-v732";
      items.sort((a,b)=>Number(a.visited)-Number(b.visited)||a.name.localeCompare(b.name,"ja"));
      for(const item of items){
        const row=document.createElement("article");row.className=`collection-common-row-v732${item.visited?" visited":""}${item.onsite?" onsite":""}`;
        const mark=item.onsite?"✓":item.visited?"◇":"○",status=item.onsite?"現地確認済":item.visited?"訪問記録":"未取得";
        row.innerHTML=`<div class="collection-common-mark-v732">${mark}</div><div class="collection-common-main-v732"><strong></strong><span></span></div><div class="collection-common-actions-v732"><span>${status}</span>${item.mapReady?'<button type="button" data-common-map="" data-common-domain="">地図</button>':""}</div>`;
        row.querySelector("strong").textContent=item.name;row.querySelector(".collection-common-main-v732 span").textContent=item.meta;
        const button=row.querySelector("[data-common-map]");if(button){button.dataset.commonMap=item.id;button.dataset.commonDomain=item.domain;}
        list.appendChild(row);
      }
      section.appendChild(list);root.appendChild(section);
    }
  }

  function normalizeLegacyPanels() {
    const common=document.getElementById("collectionCommonPanelV732");
    const overview=document.querySelector("#collectionView .collection-overview"),toolbar=document.querySelector("#collectionView .collection-toolbar"),grid=document.getElementById("collectionGrid"),castle=document.getElementById("castleCollectionPanel"),scenic=document.getElementById("scenicCollectionPanelV70"),extra=document.getElementById("collectionOnsenExtrasHeadingV732");
    const active=collectionVisible()&&!achievementsVisible();
    if(common)common.hidden=!active;
    if(overview)overview.hidden=true;if(toolbar)toolbar.hidden=true;if(castle)castle.hidden=true;if(scenic)scenic.hidden=true;
    if(grid)grid.hidden=!active||mode!=="onsen";if(extra)extra.hidden=!active||mode!=="onsen";
    const switcher=ensureSwitcher();if(switcher&&!achievementsVisible()){for(const button of switcher.querySelectorAll("[data-collection-domain]")){const on=button.dataset.collectionDomain===mode;button.classList.toggle("active",on);button.setAttribute("aria-pressed",on?"true":"false");}}
  }

  function render() {
    if(renderScheduled)return;renderScheduled=true;
    queueMicrotask(()=>{
      renderScheduled=false;ensureUi();patchLegacyApi();normalizeLegacyPanels();
      if(!collectionVisible()||achievementsVisible())return;
      const all=itemsForMode(),visited=all.filter((item)=>item.visited).length,onsite=all.filter((item)=>item.onsite).length,filtered=filteredItems(all);
      const summary=document.getElementById("collectionSummary");if(summary){summary.hidden=false;summary.textContent=`${mode==="onsen"?"温泉":mode==="castle"?"名城200":"国指定名勝"} ${visited}/${all.length} ・ 取得率 ${percent(visited,all.length)}% ・ 現地確認 ${onsite}`;}
      const visitedNode=document.getElementById("collectionCommonVisitedV732"),rateNode=document.getElementById("collectionCommonRateV732"),onsiteNode=document.getElementById("collectionCommonOnsiteV732"),result=document.getElementById("collectionCommonResultV732");
      if(visitedNode)visitedNode.textContent=`${visited}/${all.length}`;if(rateNode)rateNode.textContent=`${percent(visited,all.length)}%`;if(onsiteNode)onsiteNode.textContent=String(onsite);if(result)result.textContent=`表示 ${filtered.length} / ${all.length}`;
      const search=document.getElementById("collectionCommonSearchV732");if(search&&search.value!==query)search.value=query;
      for(const button of document.querySelectorAll("#collectionCommonPanelV732 [data-common-status]"))button.classList.toggle("active",button.dataset.commonStatus===statusFilter);
      renderPrefectures(all);renderScopeButtons();renderList(all,filtered);normalizeLegacyPanels();
    });
  }

  function openOnMap(domain,id) {
    if(!domain||!id)return;
    if(domain==="onsen"){
      window.OnsenAppShell?.show?.("map");window.OnsenMapDomainV73?.setMode?.("onsen",{source:"collection-v732"});
      setTimeout(()=>{try{if(typeof selectSpot==="function")selectSpot(id);const spot=typeof spots!=="undefined"?spots.find((x)=>String(x.id)===String(id)):null;if(spot&&typeof map!=="undefined"&&map)map.flyTo?.({center:[Number(spot.lng),Number(spot.lat)],zoom:Math.max(Number(map.getZoom?.()||10),10)});}catch{}},50);
      return;
    }
    window.OnsenMapDomainV73?.open?.(domain,id,{source:"collection-v732"});
  }

  function handleDomainClick(event) {
    if(achievementsVisible())return;
    const switcher=ensureSwitcher();if(!switcher)return;
    const button=event.target instanceof Element?event.target.closest("[data-collection-domain]"):null;
    if(!button||!switcher.contains(button))return;
    event.preventDefault();event.stopImmediatePropagation();setMode(button.dataset.collectionDomain||"onsen",{source:"common-domain-tab"});
  }

  function wrapOnsenRender() {
    const original=window.renderCollectionProgress;if(typeof original!=="function"||original.__collectionV732Wrapped)return;
    function wrapped(...args){const result=original.apply(this,args);setTimeout(render,0);return result;}
    Object.defineProperty(wrapped,"__collectionV732Wrapped",{value:true});window.renderCollectionProgress=wrapped;
  }

  async function install() {
    if(installed)return;installed=true;
    for(let i=0;i<400;i++){if(shell()&&typeof spots!=="undefined"&&window.OnsenCastleDomain&&window.OnsenCastleVisits&&window.OnsenScenicRuntime&&window.OnsenCastleCollectionUI)break;await new Promise((resolve)=>setTimeout(resolve,25));}
    ensureUi();persist();patchLegacyApi();wrapOnsenRender();document.addEventListener("click",handleDomainClick,true);
    for(const eventName of ["onsen-castle-visit-changed","onsen-scenic-visit-changed","onsen-app-tab-changed","onsen-collection-mode-changed","pageshow","storage"])window.addEventListener(eventName,()=>{setTimeout(render,0);setTimeout(render,60);});
    window.addEventListener("onsen-scenic-collection-ready",()=>{patchLegacyApi();render();});
    window.OnsenCollectionDomainV732={build:BUILD,getMode:()=>mode,setMode,render,openOnMap,items:()=>itemsForMode()};
    render();window.dispatchEvent(new CustomEvent("onsen-collection-domain-v732-ready",{detail:{build:BUILD,mode}}));
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>install().catch((e)=>console.warn("collection domain v73.2 init failed",e)),{once:true});else install().catch((e)=>console.warn("collection domain v73.2 init failed",e));
})();