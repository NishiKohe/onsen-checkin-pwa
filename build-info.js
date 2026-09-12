(() => {
  const version="v73.4";
  const preferredWorker="./sw.js?v=73.4";
  window.OnsenBuildInfo={version,updatedAt:"2026-09-12"};

  const bridges=[
    ["OnsenGameV68Bridge","gameV68BridgeScript","./game-v68-bridge.js?v=68.2","v68.2 game bridge"],
    ["OnsenGameV69Bridge","gameV69BridgeScript","./game-v69-bridge.js?v=69.1","v69.1 mining bridge"],
    ["__onsenEquipmentBattleSyncV69","equipmentBattleSyncV69","./equipment-battle-sync-v69.js?v=69","v69 equipment battle sync"],
    ["OnsenUiRecoveryV701","uiRecoveryV701Script","./ui-recovery-v701.js?v=70.1","v70.1 UI recovery"],
    ["OnsenDomainAchievements","achievementDomainV702Script","./achievement-domain-v702.js?v=72.1","v72.1 domain achievements"],
    ["OnsenAchievementDomainV721","achievementDomainControllerV721Script","./achievement-domain-controller-v721.js?v=72.1","v72.1 achievement domain controller"],
    ["OnsenTravelDomainRecoveryV731","travelDomainRecoveryV731Script","./travel-domain-recovery-v728.js?v=73.1","v73.1 travel candidate runtime"],
    ["OnsenPhotoExifV731","photoExifV731Script","./photo-exif-runtime-v731.js?v=73.1","v73.1 photo EXIF runtime"],
    ["OnsenTripManualRecoveryV731","tripManualRecoveryV731Script","./trip-manual-recovery-v731.js?v=73.1","v73.1 manual trip recovery"],
    ["OnsenTripPhotoRecoveryV731","tripPhotoRecoveryV731Script","./trip-photo-recovery-v731.js?v=73.1","v73.1 photo trip recovery"]
  ];
  const styles=[
    ["scenicMapStyleV71","./scenic-map-v71.css?v=73.4"],
    ["collectionDomainStyleV732","./collection-domain-controller-v732.css?v=73.4"]
  ];

  function addBridge([globalName,id,src,label]){
    if(window[globalName]||document.getElementById(id))return;
    const script=document.createElement("script");script.id=id;script.src=src;script.async=true;
    script.addEventListener("error",()=>console.warn(`${label} load failed`),{once:true});document.head.appendChild(script);
  }
  function addStyle([id,href]){if(document.getElementById(id))return;const link=document.createElement("link");link.id=id;link.rel="stylesheet";link.href=href;document.head.appendChild(link);}
  function waitFor(test,timeoutMs=15000,intervalMs=50){return new Promise((resolve)=>{const start=Date.now();const tick=()=>{let value=null;try{value=test();}catch{}if(value){resolve(value);return;}if(Date.now()-start>=timeoutMs){resolve(null);return;}setTimeout(tick,intervalMs);};tick();});}
  function loadScriptOnce(src,id){return new Promise((resolve)=>{const existing=document.getElementById(id);if(existing){if(existing.dataset.loaded==="1"){resolve(true);return;}existing.addEventListener("load",()=>resolve(true),{once:true});existing.addEventListener("error",()=>resolve(false),{once:true});setTimeout(()=>resolve(existing.dataset.loaded==="1"),15000);return;}const script=document.createElement("script");script.id=id;script.src=src;script.async=false;script.addEventListener("load",()=>{script.dataset.loaded="1";resolve(true);},{once:true});script.addEventListener("error",()=>resolve(false),{once:true});document.head.appendChild(script);});}
  function ensureMapSwitch(){const shell=document.querySelector(".map-shell");if(!shell)return null;let root=document.getElementById("mapDomainSwitchV62");if(!root){root=document.createElement("div");root.id="mapDomainSwitchV62";root.className="map-domain-switch-v62";root.setAttribute("aria-label","地図カテゴリ切替");root.innerHTML='<button type="button" data-map-domain="onsen">♨<span>温泉</span></button><button type="button" data-map-domain="castle">🏯<span>名城200</span></button><button type="button" data-map-domain="scenic">◇<span>名勝</span></button>';shell.appendChild(root);}return root;}
  function ensureBridges(){bridges.forEach(addBridge);styles.forEach(addStyle);}

  async function ensureCastleAdapter(){
    let castle=await waitFor(()=>window.OnsenCastleMap,12000);if(castle)return castle;
    const prereq=await waitFor(()=>window.OnsenCastleDomain&&window.OnsenCastleVisits&&typeof map!=="undefined"&&map,8000);if(!prereq)return null;
    await loadScriptOnce("./castle-map-v62.js?v=73.4","castleMapRecoveryV734Script");
    return waitFor(()=>window.OnsenCastleMap,12000);
  }

  async function ensureScenicRuntime(){
    let rt=await waitFor(()=>window.OnsenScenicRuntime?.entries?.().length===433?window.OnsenScenicRuntime:null,2500);
    if(rt)return rt;
    await loadScriptOnce("./scenic-runtime-v70.js?v=73.4","scenicRuntimeV734Script");
    rt=await waitFor(()=>window.OnsenScenicRuntime?.entries?.().length===433?window.OnsenScenicRuntime:null,20000);
    if(!rt)console.warn("v73.4 scenic runtime 433 entries not ready");
    return rt;
  }

  async function ensureScenicAdapter(){
    const rt=await ensureScenicRuntime();if(!rt)return null;
    let scenic=await waitFor(()=>window.OnsenScenicMapV71,3000);if(scenic)return scenic;
    await loadScriptOnce("./scenic-map-v71.js?v=73.4","scenicMapV734Script");
    scenic=await waitFor(()=>window.OnsenScenicMapV71,15000);
    if(!scenic)console.warn("v73.4 scenic interaction adapter not ready");
    return scenic;
  }

  async function ensureScenicRenderer(){
    const rt=await ensureScenicRuntime();if(!rt)return null;
    await loadScriptOnce("./scenic-map-renderer-v734.js?v=73.4","scenicRendererV734Script");
    const renderer=await waitFor(()=>window.OnsenScenicRendererV734?.featureCount?.()===433?window.OnsenScenicRendererV734:null,15000);
    if(!renderer)console.warn("v73.4 scenic renderer did not reach 433 features",window.OnsenScenicRendererV734?.diagnostics?.());
    return renderer;
  }

  async function bootCritical(){
    ensureMapSwitch();
    await loadScriptOnce("./map-domain-controller-v733.js?v=73.4","mapDomainControllerV734Script");
    const router=await waitFor(()=>window.OnsenMapDomainV73?.build==="v73.3",15000);
    if(!router){console.warn("v73.4 map router not ready");return false;}
    const castle=await ensureCastleAdapter();if(!castle)console.warn("v73.4 castle adapter not ready");
    const scenic=await ensureScenicAdapter();
    const renderer=await ensureScenicRenderer();
    window.OnsenMapDomainV73?.refresh?.();
    renderer?.refresh?.();
    await loadScriptOnce("./collection-domain-controller-v732.js?v=73.4","collectionDomainV734Script");
    await waitFor(()=>window.OnsenCollectionDomainV732,12000);
    window.OnsenMapDomainV73?.refresh?.();renderer?.refresh?.();
    window.dispatchEvent(new CustomEvent("onsen-critical-bootstrap-v734-ready",{detail:{build:version,castle:!!castle,scenic:!!scenic,scenicFeatures:renderer?.featureCount?.()||0}}));
    return !!castle&&!!scenic&&renderer?.featureCount?.()===433;
  }

  function apply(){ensureMapSwitch();document.documentElement.dataset.appBuild=version;const badge=document.getElementById("appBuildBadge");if(badge){badge.textContent=version;badge.title=`温泉チェックイン build ${version}`;}if(window.OnsenAppShell)window.OnsenAppShell.build=version;ensureBridges();}
  async function registerPreferredWorker(){if(!("serviceWorker" in navigator))return null;try{const registration=await navigator.serviceWorker.register(preferredWorker);await registration?.update?.();return registration;}catch(err){console.warn("v73.4 service worker update check skipped",err);return null;}}
  function patchServiceWorkerRegister(){if(!("serviceWorker" in navigator))return;const sw=navigator.serviceWorker;if(sw.__onsenV734RegisterPatched)return;try{const originalRegister=sw.register.bind(sw);sw.register=(scriptURL,options)=>/(?:^|\/)sw\.js(?:\?|$)/.test(String(scriptURL||""))?originalRegister(preferredWorker,options):originalRegister(scriptURL,options);Object.defineProperty(sw,"__onsenV734RegisterPatched",{value:true});}catch(error){console.warn("v73.4 service worker register patch skipped",error);}}
  function installRefreshGuard(){if(!("serviceWorker" in navigator))return;let refreshing=false;navigator.serviceWorker.addEventListener("controllerchange",()=>{if(refreshing)return;const key=`onsenBuildControllerReload:${version}`;if(sessionStorage.getItem(key)==="1")return;refreshing=true;sessionStorage.setItem(key,"1");location.reload();});window.addEventListener("load",()=>{registerPreferredWorker();setTimeout(registerPreferredWorker,800);setTimeout(registerPreferredWorker,2200);});}

  patchServiceWorkerRegister();installRefreshGuard();ensureBridges();
  const start=()=>{apply();bootCritical().catch((error)=>console.warn("v73.4 critical bootstrap failed",error));};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
  window.addEventListener("load",()=>{apply();setTimeout(()=>{window.OnsenMapDomainV73?.refresh?.();window.OnsenScenicRendererV734?.refresh?.();},100);});
  setTimeout(apply,600);setTimeout(apply,1600);
})();