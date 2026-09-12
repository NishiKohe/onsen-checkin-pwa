(() => {
  const version="v73.2";
  const preferredWorker="./sw.js?v=73.2";
  window.OnsenBuildInfo={version,updatedAt:"2026-09-12"};

  const bridges=[
    ["OnsenGameV68Bridge","gameV68BridgeScript","./game-v68-bridge.js?v=68.2","v68.2 game bridge"],
    ["OnsenGameV69Bridge","gameV69BridgeScript","./game-v69-bridge.js?v=69.1","v69.1 mining bridge"],
    ["__onsenEquipmentBattleSyncV69","equipmentBattleSyncV69","./equipment-battle-sync-v69.js?v=69","v69 equipment battle sync"],
    ["OnsenUiRecoveryV701","uiRecoveryV701Script","./ui-recovery-v701.js?v=70.1","v70.1 UI recovery"],
    ["OnsenDomainAchievements","achievementDomainV702Script","./achievement-domain-v702.js?v=72.1","v72.1 domain achievements"],
    ["OnsenAchievementDomainV721","achievementDomainControllerV721Script","./achievement-domain-controller-v721.js?v=72.1","v72.1 achievement domain controller"],
    ["OnsenMapDomainV73","mapDomainControllerV73Script","./map-domain-controller-v72.js?v=73","v73 map domain controller"],
    ["OnsenScenicV71Bridge","scenicV71BridgeScript","./scenic-v70-bridge.js?v=73","v73 scenic bridge"],
    ["OnsenTravelDomainRecoveryV731","travelDomainRecoveryV731Script","./travel-domain-recovery-v728.js?v=73.1","v73.1 travel candidate runtime"],
    ["OnsenPhotoExifV731","photoExifV731Script","./photo-exif-runtime-v731.js?v=73.1","v73.1 photo EXIF runtime"],
    ["OnsenTripManualRecoveryV731","tripManualRecoveryV731Script","./trip-manual-recovery-v731.js?v=73.1","v73.1 manual trip recovery"],
    ["OnsenTripPhotoRecoveryV731","tripPhotoRecoveryV731Script","./trip-photo-recovery-v731.js?v=73.1","v73.1 photo trip recovery"],
    ["OnsenCollectionDomainV732","collectionDomainV732Script","./collection-domain-controller-v732.js?v=73.2","v73.2 collection domain controller"]
  ];
  const styles=[
    ["scenicMapStyleV71","./scenic-map-v71.css?v=73"],
    ["collectionDomainStyleV732","./collection-domain-controller-v732.css?v=73.2"]
  ];

  function addBridge([globalName,id,src,label]){
    if(window[globalName]||document.getElementById(id))return;
    const script=document.createElement("script");script.id=id;script.src=src;script.async=true;
    script.addEventListener("error",()=>console.warn(`${label} load failed`),{once:true});document.head.appendChild(script);
  }
  function addStyle([id,href]){if(document.getElementById(id))return;const link=document.createElement("link");link.id=id;link.rel="stylesheet";link.href=href;document.head.appendChild(link);}
  function ensureMapSwitch(){
    const shell=document.querySelector(".map-shell");if(!shell)return null;
    let root=document.getElementById("mapDomainSwitchV62");
    if(!root){root=document.createElement("div");root.id="mapDomainSwitchV62";root.className="map-domain-switch-v62";root.setAttribute("aria-label","地図カテゴリ切替");root.innerHTML='<button type="button" data-map-domain="onsen">♨<span>温泉</span></button><button type="button" data-map-domain="castle">🏯<span>名城200</span></button><button type="button" data-map-domain="scenic">◇<span>名勝</span></button>';shell.appendChild(root);}return root;
  }
  function ensureBridges(){bridges.forEach(addBridge);styles.forEach(addStyle);}
  function apply(){ensureMapSwitch();document.documentElement.dataset.appBuild=version;const badge=document.getElementById("appBuildBadge");if(badge){badge.textContent=version;badge.title=`温泉チェックイン build ${version}`;}if(window.OnsenAppShell)window.OnsenAppShell.build=version;ensureBridges();}

  async function registerPreferredWorker(){if(!("serviceWorker" in navigator))return null;try{const registration=await navigator.serviceWorker.register(preferredWorker);await registration?.update?.();return registration;}catch(err){console.warn("v73.2 service worker update check skipped",err);return null;}}
  function patchServiceWorkerRegister(){
    if(!("serviceWorker" in navigator))return;const sw=navigator.serviceWorker;if(sw.__onsenV732RegisterPatched)return;
    try{const originalRegister=sw.register.bind(sw);sw.register=(scriptURL,options)=>/(?:^|\/)sw\.js(?:\?|$)/.test(String(scriptURL||""))?originalRegister(preferredWorker,options):originalRegister(scriptURL,options);Object.defineProperty(sw,"__onsenV732RegisterPatched",{value:true});}catch(error){console.warn("v73.2 service worker register patch skipped",error);}
  }
  function installRefreshGuard(){
    if(!("serviceWorker" in navigator))return;let refreshing=false;
    navigator.serviceWorker.addEventListener("controllerchange",()=>{if(refreshing)return;const key=`onsenBuildControllerReload:${version}`;if(sessionStorage.getItem(key)==="1")return;refreshing=true;sessionStorage.setItem(key,"1");location.reload();});
    window.addEventListener("load",()=>{registerPreferredWorker();setTimeout(registerPreferredWorker,800);setTimeout(registerPreferredWorker,2200);});
  }

  patchServiceWorkerRegister();installRefreshGuard();ensureBridges();
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",apply,{once:true});else apply();
  window.addEventListener("load",apply);setTimeout(apply,600);setTimeout(apply,1600);
})();