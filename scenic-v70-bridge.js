(() => {
  const BUILD="v70.9";
  let installed=false;
  function addStyle(href,id){if(document.getElementById(id))return;const link=document.createElement("link");link.id=id;link.rel="stylesheet";link.href=href;document.head.appendChild(link);}
  function waitFor(test,timeoutMs=10000,intervalMs=50){return new Promise((resolve)=>{const startedAt=Date.now();const tick=()=>{let value=null;try{value=test();}catch{}if(value){resolve(value);return;}if(Date.now()-startedAt>=timeoutMs){resolve(null);return;}setTimeout(tick,intervalMs);};tick();});}
  function loadScriptOnce(src,id){return new Promise((resolve)=>{const existing=document.getElementById(id);if(existing){if(existing.dataset.loaded==="1"){resolve(true);return;}existing.addEventListener("load",()=>resolve(true),{once:true});existing.addEventListener("error",()=>resolve(false),{once:true});setTimeout(()=>resolve(existing.dataset.loaded==="1"),10000);return;}const script=document.createElement("script");script.id=id;script.src=src;script.async=true;script.addEventListener("load",()=>{script.dataset.loaded="1";resolve(true);},{once:true});script.addEventListener("error",()=>{console.warn(`${src} load failed`);resolve(false);},{once:true});document.head.appendChild(script);});}
  async function boot(){
    addStyle("./scenic-collection-ui-v70.css?v=70.9","scenicCollectionStyleV70");
    if(!await waitFor(()=>document.querySelector("#collectionView .collection-shell"),8000)){console.warn("v70.9 scenic bridge: collection shell not ready");return false;}
    if(!window.OnsenScenicRuntime||window.OnsenScenicRuntime.build!==BUILD){
      if(!await loadScriptOnce("./scenic-runtime-v70.js?v=70.9","scenicRuntimeV709"))return false;
    }
    if(!await waitFor(()=>window.OnsenScenicRuntime?.build===BUILD,12000)){console.warn("v70.9 scenic bridge: runtime not ready");return false;}
    if(!await waitFor(()=>window.OnsenCastleCollectionUI&&document.querySelector("#collectionView .collection-domain-switch"),10000)){console.warn("v70.9 scenic bridge: canonical collection domain not ready");return false;}
    if(!window.OnsenScenicCollectionUI){if(!await loadScriptOnce("./scenic-collection-ui-v70.js?v=70.9","scenicCollectionUiV70"))return false;}
    if(!await waitFor(()=>window.OnsenScenicCollectionUI,10000)){console.warn("v70.9 scenic bridge: collection UI not ready");return false;}
    const achievements=await waitFor(()=>window.OnsenAchievements&&document.getElementById("achievementView"),12000);
    if(achievements&&!window.OnsenDomainAchievements)await loadScriptOnce("./achievement-domain-v702.js?v=70.9","achievementDomainV702Script");
    window.OnsenCastleCollectionUI?.refresh?.();window.OnsenScenicCollectionUI?.refresh?.();window.OnsenFooterNavigation?.refresh?.();
    window.dispatchEvent(new CustomEvent("onsen-scenic-v709-ready",{detail:{build:BUILD,progress:window.OnsenScenicRuntime?.progress?.()||null}}));return true;
  }
  function install(){if(installed)return;installed=true;boot().catch((error)=>console.warn("v70.9 scenic bridge boot failed",error));window.OnsenScenicV70Bridge={build:BUILD,boot};}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();