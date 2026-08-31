(() => {
  const BUILD="v70.8",MODE_KEY="collectionDomainModeV61";
  const VALID_MODES=new Set(["onsen","castle","scenic"]);
  let stored=sessionStorage.getItem(MODE_KEY);
  let mode=VALID_MODES.has(stored)?stored:"onsen",query="",filter="all",region="all",series="all",installed=false;
  const REGION_ORDER=["北海道","東北","関東","甲信越","北陸","東海","近畿","中国","四国","九州・沖縄"];
  function normalize(value){return String(value||"").normalize("NFKC").toLowerCase().replace(/\s+/g,"");}
  function getShell(){return document.querySelector("#collectionView .collection-shell");}
  function achievementsVisible(){const view=document.getElementById("achievementView");return !!view&&!view.hidden;}
  function onsenNodes(){return [document.querySelector("#collectionView .collection-overview"),document.querySelector("#collectionView .collection-toolbar"),document.getElementById("collectionGrid")].filter(Boolean);}

  function ensureUi(){
    const shell=getShell();if(!shell)return null;
    let switcher=shell.querySelector(".collection-domain-switch");
    if(!switcher){
      switcher=document.createElement("div");switcher.className="collection-domain-switch";
      switcher.innerHTML=`<button type="button" data-collection-domain="onsen">温泉</button><button type="button" data-collection-domain="castle">名城200</button><button type="button" data-collection-domain="scenic">名勝</button>`;
      shell.querySelector(".collection-header")?.insertAdjacentElement("afterend",switcher);
    }else if(!switcher.querySelector('[data-collection-domain="scenic"]')){
      const button=document.createElement("button");button.type="button";button.dataset.collectionDomain="scenic";button.textContent="名勝";switcher.appendChild(button);
    }
    if(switcher.dataset.domainV708Bound!=="1"){
      switcher.dataset.domainV708Bound="1";
      switcher.addEventListener("click",(event)=>{
        const button=event.target instanceof Element?event.target.closest("[data-collection-domain]"):null;
        if(!button||!switcher.contains(button))return;
        const next=button.dataset.collectionDomain||"onsen";
        if(!VALID_MODES.has(next))return;
        event.preventDefault();
        setMode(next,{source:achievementsVisible()?"achievement_domain_tab":"domain_tab"});
      });
    }
    let panel=document.getElementById("castleCollectionPanel");
    if(!panel){
      panel=document.createElement("section");panel.id="castleCollectionPanel";panel.className="castle-collection-panel";panel.hidden=true;
      panel.innerHTML=`<div class="castle-overview"><div class="castle-metric"><span>訪問</span><b id="castleVisitedMetric">0/200</b></div><div class="castle-metric"><span>厳格GPS</span><b id="castleGpsMetric">0</b></div><div class="castle-metric"><span>武威</span><b id="castleBuiMetric">+0%</b></div></div><div class="castle-notice">日本100名城＋続日本100名城の計200城。過去訪問はコレクション・武威・武将候補解放に反映し、現地GPS確認では城に紐づく武将の確定加入判定も行います。</div><div class="castle-toolbar"><input id="castleSearch" type="search" placeholder="城名・都道府県・番号で検索" autocomplete="off"/><div class="castle-filter-row"><button type="button" class="active" data-castle-filter="all">すべて</button><button type="button" data-castle-filter="unvisited">未訪問</button><button type="button" data-castle-filter="visited">訪問済</button></div><div class="castle-filter-row castle-series-row"><button type="button" class="active" data-castle-series="all">200城</button><button type="button" data-castle-series="original">日本100名城</button><button type="button" data-castle-series="continued">続100名城</button></div><div id="castleRegionRow" class="castle-region-row"></div></div><div id="castleListRoot"></div>`;
      const anchor=shell.querySelector(".collection-toolbar")||switcher;anchor.insertAdjacentElement("afterend",panel);
      panel.querySelector("#castleSearch")?.addEventListener("input",(event)=>{query=String(event.target.value||"").trim();render();});
      panel.addEventListener("click",handlePanelClick);
    }
    return panel;
  }
  function handlePanelClick(event){
    const filterButton=event.target instanceof Element?event.target.closest("[data-castle-filter]"):null;if(filterButton){filter=filterButton.dataset.castleFilter||"all";render();return;}
    const seriesButton=event.target instanceof Element?event.target.closest("[data-castle-series]"):null;if(seriesButton){series=seriesButton.dataset.castleSeries||"all";render();return;}
    const regionButton=event.target instanceof Element?event.target.closest("[data-castle-region]"):null;if(regionButton){region=regionButton.dataset.castleRegion||"all";render();return;}
    const visitButton=event.target instanceof Element?event.target.closest("[data-castle-visit-action]"):null;if(!visitButton)return;
    const castleId=visitButton.dataset.castleId,action=visitButton.dataset.castleVisitAction;if(!castleId||!window.OnsenCastleVisits)return;
    if(action==="add")window.OnsenCastleVisits.registerPastVisit(castleId);if(action==="remove")window.OnsenCastleVisits.removePastVisit(castleId);render();
  }
  function setMode(next,{source="api",silent=false}={}){
    const normalized=VALID_MODES.has(next)?next:"onsen";
    const changed=mode!==normalized;mode=normalized;sessionStorage.setItem(MODE_KEY,mode);applyMode();if(mode==="castle"&&!achievementsVisible())render();
    if((changed||!silent))window.dispatchEvent(new CustomEvent("onsen-collection-domain-changed",{detail:{build:BUILD,mode,source}}));
    return mode;
  }
  function applyMode(){
    const panel=ensureUi(),switcher=getShell()?.querySelector(".collection-domain-switch");if(!panel||!switcher)return;
    const achievementMode=achievementsVisible();
    switcher.hidden=false;
    for(const button of switcher.querySelectorAll("[data-collection-domain]"))button.classList.toggle("active",button.dataset.collectionDomain===mode);
    if(achievementMode){
      panel.hidden=true;
      const categoryTabs=document.getElementById("collectionCategoryTabs");if(categoryTabs)categoryTabs.hidden=true;
      return;
    }
    const castle=mode==="castle",scenic=mode==="scenic";
    for(const node of onsenNodes())node.hidden=castle||scenic;
    panel.hidden=!castle;
    const categoryTabs=document.getElementById("collectionCategoryTabs");if(categoryTabs)categoryTabs.hidden=castle||scenic;
    const summary=document.getElementById("collectionSummary");
    if(summary){summary.hidden=false;if(castle){const p=window.OnsenCastleVisits?.progress?.()||{visited:0,total:200};summary.textContent=`名城200 ${p.visited}/${p.total} ・ 日本100 ${p.originalVisited||0}/100 ・ 続100 ${p.continuedVisited||0}/100`;}else if(mode==="onsen"&&typeof window.renderCollectionProgress==="function"){setTimeout(()=>window.renderCollectionProgress(),0);window.CollectionNavigationUi?.refresh?.();}}
  }
  function regionsFor(castles){const values=new Set(castles.map((castle)=>castle.region).filter(Boolean));return REGION_ORDER.filter((name)=>values.has(name));}
  function renderRegionButtons(castles){const root=document.getElementById("castleRegionRow");if(!root)return;const values=regionsFor(castles);root.innerHTML=`<button type="button" data-castle-region="all">全国</button>${values.map((name)=>`<button type="button" data-castle-region="${name}">${name}</button>`).join("")}`;for(const button of root.querySelectorAll("[data-castle-region]"))button.classList.toggle("active",button.dataset.castleRegion===region);}
  function statusFor(castleId){const visits=window.OnsenCastleVisits;if(!visits)return {visited:false,strict:false,manual:false};const records=visits.recordsFor(castleId);return {visited:records.length>0,strict:visits.isStrictGps(castleId),manual:records.some((record)=>record.recordSource==="castle_past_visit")};}
  function candidateCount(castleId){try{return window.OnsenCharacterRuntime?.candidatesForCastle?.(castleId)?.length||0;}catch{return 0;}}
  function render(){
    if(mode!=="castle"||achievementsVisible())return;const panel=ensureUi(),data=window.OnsenCastleDomain?.data,visits=window.OnsenCastleVisits;if(!panel||!Array.isArray(data?.entities)||!visits)return;
    const castles=data.entities.slice().sort((a,b)=>Number(a.japan100No||0)-Number(b.japan100No||0));renderRegionButtons(castles);
    for(const button of panel.querySelectorAll("[data-castle-filter]"))button.classList.toggle("active",button.dataset.castleFilter===filter);for(const button of panel.querySelectorAll("[data-castle-series]"))button.classList.toggle("active",button.dataset.castleSeries===series);
    const progress=visits.progress(),visitedMetric=document.getElementById("castleVisitedMetric"),gpsMetric=document.getElementById("castleGpsMetric"),buiMetric=document.getElementById("castleBuiMetric");if(visitedMetric)visitedMetric.textContent=`${progress.visited}/${progress.total}`;if(gpsMetric)gpsMetric.textContent=String(progress.strictGps);if(buiMetric)buiMetric.textContent=`+${Math.round(progress.attackBonus*100)}%`;
    const summary=document.getElementById("collectionSummary");if(summary)summary.textContent=`名城200 ${progress.visited}/${progress.total} ・ 日本100 ${progress.originalVisited}/100 ・ 続100 ${progress.continuedVisited}/100 ・ 武威 +${Math.round(progress.attackBonus*100)}%`;
    const normalizedQuery=normalize(query);const filtered=castles.filter((castle)=>{const status=statusFor(castle.id),no=Number(castle.japan100No||0);if(filter==="visited"&&!status.visited)return false;if(filter==="unvisited"&&status.visited)return false;if(series==="original"&&no>100)return false;if(series==="continued"&&no<=100)return false;if(region!=="all"&&castle.region!==region)return false;if(normalizedQuery&&!normalize(`${castle.name} ${castle.prefecture} ${castle.region} ${no} ${castle.selectionName||""}`).includes(normalizedQuery))return false;return true;});
    const root=document.getElementById("castleListRoot");if(!root)return;root.innerHTML="";if(!filtered.length){root.innerHTML=`<div class="castle-empty">条件に一致する城はありません。</div>`;return;}
    const byRegion=new Map();for(const castle of filtered){if(!byRegion.has(castle.region))byRegion.set(castle.region,[]);byRegion.get(castle.region).push(castle);}
    for(const regionName of regionsFor(filtered)){const items=byRegion.get(regionName)||[];if(!items.length)continue;const section=document.createElement("section");section.className="castle-region-section";section.innerHTML=`<div class="castle-region-heading"><h3>${regionName}</h3><span>${items.length}城</span></div><div class="castle-list"></div>`;const list=section.querySelector(".castle-list");for(const castle of items){const status=statusFor(castle.id),candidates=candidateCount(castle.id),row=document.createElement("article"),continued=Number(castle.japan100No)>100;row.className=`castle-row${status.visited?" visited":""}${status.strict?" strict":""}${continued?" continued":""}`;const statusLabel=status.strict?"GPS確認済":status.visited?"訪問登録済":"未訪問",button=status.strict?"":status.manual?`<button class="castle-visit-button remove" type="button" data-castle-visit-action="remove" data-castle-id="${castle.id}">登録解除</button>`:`<button class="castle-visit-button" type="button" data-castle-visit-action="add" data-castle-id="${castle.id}">過去訪問</button>`;row.innerHTML=`<div class="castle-no">#${String(castle.japan100No).padStart(3,"0")}</div><div class="castle-main"><strong>${castle.name}</strong><span>${continued?"続100 ・ ":"100名城 ・ "}${castle.prefecture} ・ ${castle.region}</span>${candidates?`<small>人物候補 ${candidates}人</small>`:""}</div><div class="castle-actions"><span class="castle-status">${statusLabel}</span>${button}</div>`;list.appendChild(row);}root.appendChild(section);}
  }
  function refresh(){applyMode();if(mode==="castle"&&!achievementsVisible())render();}
  async function install(){
    if(installed)return;installed=true;for(let i=0;i<360;i+=1){if(getShell()&&window.OnsenCastleDomain&&window.OnsenCastleVisits)break;await new Promise((resolve)=>setTimeout(resolve,30));}
    ensureUi();applyMode();if(mode==="castle"&&!achievementsVisible())render();
    window.addEventListener("onsen-castle-visit-changed",()=>{if(mode==="castle"&&!achievementsVisible())render();});window.addEventListener("onsen-character-state-changed",()=>{if(mode==="castle"&&!achievementsVisible())render();});window.addEventListener("onsen-character-runtime-ready",()=>{if(mode==="castle"&&!achievementsVisible())render();});
    window.addEventListener("onsen-app-tab-changed",(event)=>{if(event.detail?.tab==="collection")requestAnimationFrame(refresh);});
    window.addEventListener("onsen-collection-mode-changed",()=>requestAnimationFrame(refresh));
    window.OnsenCastleCollectionUI={build:BUILD,show:()=>{window.OnsenFooterNavigation?.openCollections?.();window.OnsenAppShell?.show?.("collection");setMode("castle",{source:"api"});},showOnsen:()=>setMode("onsen",{source:"api"}),showScenic:()=>setMode("scenic",{source:"api"}),setMode,render,refresh,mode:()=>mode};
    window.dispatchEvent(new CustomEvent("onsen-collection-domain-ready",{detail:{build:BUILD,mode}}));
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>install().catch(console.warn),{once:true});else install().catch((error)=>console.warn("castle collection ui v70.8 init failed",error));
})();