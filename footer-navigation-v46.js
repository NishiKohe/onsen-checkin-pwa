(() => {
  const BUILD="v70.3",FOOTER_ID="footerAchievementsTab";
  let installed=false,syncScheduled=false,achievementsWrapped=false;
  function getNav(){return document.querySelector(".app-tabs");}
  function getAchievementView(){return document.getElementById("achievementView");}
  function isAchievementMode(){const collectionView=document.getElementById("collectionView"),achievementView=getAchievementView();return !!collectionView&&!collectionView.hidden&&!!achievementView&&!achievementView.hidden;}
  function syncColumnCount(){const nav=getNav(),count=Math.max(1,nav?.querySelectorAll(".app-tab").length||1);document.documentElement.style.setProperty("--app-tab-count",String(count));}
  function ensureAchievementButton(){
    const nav=getNav();if(!nav)return null;let button=document.getElementById(FOOTER_ID);
    if(!button){button=document.createElement("button");button.id=FOOTER_ID;button.type="button";button.className="app-tab";button.dataset.appTab="collection";button.dataset.footerTab="achievements";button.setAttribute("aria-selected","false");button.textContent="実績";const trip=nav.querySelector('[data-app-tab="trip"]');if(trip)nav.insertBefore(button,trip);else nav.appendChild(button);}else{button.dataset.appTab="collection";button.dataset.footerTab="achievements";}
    syncColumnCount();return button;
  }
  function hideNestedModeTabs(){const tabs=document.getElementById("collectionModeTabs");if(!tabs)return;tabs.hidden=true;tabs.setAttribute("aria-hidden","true");}
  function syncHeaderMode(achievementMode){
    const header=document.querySelector("#collectionView .collection-header");if(!header)return;const eyebrow=header.querySelector(".collection-eyebrow"),title=header.querySelector("h2"),summary=document.getElementById("collectionSummary");
    const eyebrowText=achievementMode?"ACHIEVEMENTS":"COLLECTION",titleText=achievementMode?"実績・称号":"コレクション";
    if(eyebrow&&eyebrow.textContent!==eyebrowText)eyebrow.textContent=eyebrowText;if(title&&title.textContent!==titleText)title.textContent=titleText;if(summary)summary.hidden=achievementMode;
  }
  function emitCollectionMode(mode,source){window.dispatchEvent(new CustomEvent("onsen-collection-mode-changed",{detail:{build:BUILD,mode,source}}));}
  function clickInternalMode(mode){const button=document.querySelector(`[data-collection-mode="${mode}"]`);if(!button)return false;button.click();return true;}
  function refreshDomainViews(){window.OnsenCastleCollectionUI?.refresh?.();window.OnsenScenicCollectionUI?.refresh?.();window.OnsenDomainAchievements?.refresh?.();}
  function openAchievements(){
    hideNestedModeTabs();
    if(window.OnsenAchievements?.show)window.OnsenAchievements.show();else{window.OnsenAppShell?.show?.("collection");clickInternalMode("achievements");}
    emitCollectionMode("achievements","footer");requestAnimationFrame(()=>{syncActiveState();refreshDomainViews();});
  }
  function openCollections(){
    window.OnsenAppShell?.show?.("collection");hideNestedModeTabs();clickInternalMode("collection");emitCollectionMode("collection","footer");requestAnimationFrame(()=>{syncActiveState();refreshDomainViews();});
  }
  function syncActiveState(){
    syncScheduled=false;const nav=getNav(),achievementButton=ensureAchievementButton();if(!nav||!achievementButton)return;hideNestedModeTabs();syncColumnCount();
    const shellTab=document.documentElement.dataset.appTab||"map",achievementMode=shellTab==="collection"&&isAchievementMode();syncHeaderMode(achievementMode);
    for(const button of nav.querySelectorAll(".app-tab")){
      let active=false;if(button===achievementButton)active=achievementMode;else if(button.dataset.appTab==="collection")active=shellTab==="collection"&&!achievementMode;else if(button.dataset.appTab)active=button.dataset.appTab===shellTab;
      button.classList.toggle("active",active);button.setAttribute("aria-selected",active?"true":"false");
    }
  }
  function scheduleSync(){if(syncScheduled)return;syncScheduled=true;requestAnimationFrame(syncActiveState);}
  function bindNavigationCapture(){
    if(document.documentElement.dataset.footerNavV703Bound==="1")return;document.documentElement.dataset.footerNavV703Bound="1";
    document.addEventListener("click",(event)=>{const nav=getNav();if(!nav)return;const target=event.target instanceof Element?event.target.closest("button"):null;if(!target||!nav.contains(target))return;
      if(target.id===FOOTER_ID){event.preventDefault();event.stopImmediatePropagation();openAchievements();return;}
      if(target.dataset.appTab==="collection"){event.preventDefault();event.stopImmediatePropagation();openCollections();}
    },true);
  }
  function wrapAchievementShow(){
    if(achievementsWrapped||!window.OnsenAchievements?.show)return false;const original=window.OnsenAchievements.show.bind(window.OnsenAchievements);
    window.OnsenAchievements.show=(...args)=>{const result=original(...args);emitCollectionMode("achievements","api");requestAnimationFrame(()=>{syncActiveState();refreshDomainViews();});return result;};achievementsWrapped=true;return true;
  }
  async function install(){
    if(installed)return;for(let i=0;i<300;i+=1){if(getNav()&&window.OnsenAppShell&&window.OnsenAchievements)break;await new Promise((resolve)=>setTimeout(resolve,40));}
    if(!getNav()||!window.OnsenAppShell)throw new Error("footer navigation prerequisites not ready");installed=true;ensureAchievementButton();bindNavigationCapture();hideNestedModeTabs();wrapAchievementShow();syncActiveState();
    window.addEventListener("onsen-app-tab-changed",scheduleSync);window.addEventListener("onsen-collection-mode-changed",()=>{scheduleSync();requestAnimationFrame(refreshDomainViews);});window.addEventListener("onsen-collection-domain-changed",scheduleSync);window.addEventListener("pageshow",scheduleSync);window.addEventListener("onsen-scenic-v703-ready",scheduleSync);
    window.OnsenFooterNavigation={build:BUILD,openAchievements,openCollections,refresh:()=>{syncActiveState();refreshDomainViews();}};
    window.dispatchEvent(new CustomEvent("onsen-footer-navigation-ready",{detail:{build:BUILD}}));
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>install().catch((err)=>console.warn("footer navigation v70.3 init failed",err)),{once:true});else install().catch((err)=>console.warn("footer navigation v70.3 init failed",err));
})();