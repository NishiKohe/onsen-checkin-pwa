(() => {
  const BUILD="v71";
  let installed=false;
  function addStyle(href,id){if(document.getElementById(id))return;const link=document.createElement("link");link.id=id;link.rel="stylesheet";link.href=href;document.head.appendChild(link);}
  function waitFor(test,timeoutMs=10000,intervalMs=50){return new Promise((resolve)=>{const startedAt=Date.now();const tick=()=>{let value=null;try{value=test();}catch{}if(value){resolve(value);return;}if(Date.now()-startedAt>=timeoutMs){resolve(null);return;}setTimeout(tick,intervalMs);};tick();});}
  function loadScriptOnce(src,id){return new Promise((resolve)=>{const existing=document.getElementById(id);if(existing){if(existing.dataset.loaded==="1"){resolve(true);return;}existing.addEventListener("load",()=>resolve(true),{once:true});existing.addEventListener("error",()=>resolve(false),{once:true});setTimeout(()=>resolve(existing.dataset.loaded==="1"),10000);return;}const script=document.createElement("script");script.id=id;script.src=src;script.async=true;script.addEventListener("load",()=>{script.dataset.loaded="1";resolve(true);},{once:true});script.addEventListener("error",()=>{console.warn(`${src} load failed`);resolve(false);},{once:true});document.head.appendChild(script);});}
  async function boot(){
    addStyle("./scenic-collection-ui-v70.css?v=71","scenicCollectionStyleV71");
    addStyle("./scenic-map-v71.css?v=71.5","scenicMapStyleV71");
    addStyle("./scenic-map-hotfix-v712.css?v=71.5","scenicMapHotfixStyleV712");
    if(!await waitFor(()=>document.querySelector("#collectionView .collection-shell"),8000)){console.warn("v71 scenic bridge: collection shell not ready");return false;}
    if(window.OnsenScenicRuntime?.build!==BUILD){if(!await loadScriptOnce("./scenic-runtime-v70.js?v=71.5","scenicRuntimeV71"))return false;}
    if(!await waitFor(()=>window.OnsenScenicRuntime?.build===BUILD,12000)){console.warn("v71 scenic bridge: runtime not ready");return false;}
    if(!await waitFor(()=>window.OnsenCastleCollectionUI&&document.querySelector("#collectionView .collection-domain-switch"),10000)){console.warn("v71 scenic bridge: canonical collection domain not ready");return false;}
    if(window.OnsenScenicCollectionUI?.build!==BUILD){if(!await loadScriptOnce("./scenic-collection-ui-v70.js?v=71.5","scenicCollectionUiV71"))return false;}
    if(!await waitFor(()=>window.OnsenScenicCollectionUI?.build===BUILD,10000)){console.warn("v71 scenic bridge: collection UI not ready");return false;}
    if(window.OnsenScenicMapV71?.build!==BUILD){await loadScriptOnce("./scenic-map-v71.js?v=71.5","scenicMapV71Script");}
    if(!await waitFor(()=>window.OnsenScenicMapV71?.build===BUILD,10000)){console.warn("v71 scenic bridge: map UI not ready");return false;}
    if(!window.OnsenScenicMapHotfixV712){await loadScriptOnce("./scenic-map-hotfix-v712.js?v=71.5","scenicMapHotfixV712Script");}
    const achievements=await waitFor(()=>window.OnsenAchievements&&document.getElementById("achievementView"),12000);
    if(achievements&&!window.OnsenDomainAchievements)await loadScriptOnce("./achievement-domain-v702.js?v=70.8","achievementDomainV702Script");
    window.OnsenScenicMapHotfixV712?.refresh?.();window.OnsenCastleCollectionUI?.refresh?.();window.OnsenScenicCollectionUI?.refresh?.();window.OnsenFooterNavigation?.refresh?.();
    window.dispatchEvent(new CustomEvent("onsen-scenic-v71-ready",{detail:{build:BUILD,hotfix:"v71.5",progress:window.OnsenScenicRuntime?.progress?.()||null}}));return true;
  }
  function install(){if(installed)return;installed=true;const api={build:BUILD,boot};window.OnsenScenicV71Bridge=api;window.OnsenScenicV70Bridge=api;boot().catch((error)=>console.warn("v71 scenic bridge boot failed",error));}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();
