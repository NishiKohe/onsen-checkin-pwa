(() => {
  const BUILD="v72.9";
  const SOURCE="scenic-v71",SYMBOL="scenic-v71-symbol",LABELS="scenic-v71-labels",ZONE_SOURCE="scenic-v71-zone",ZONE_FILL="scenic-v71-zone-fill",ZONE_LINE="scenic-v71-zone-line";
  let installed=false,scheduled=false,syncing=false,lastHealth=null;
  function getMap(){try{return typeof map!=="undefined"?map:null;}catch{return null;}}
  function rt(){return window.OnsenScenicRuntime||null;}
  function router(){return window.OnsenMapDomainV72||null;}
  function scenicApi(){return window.OnsenScenicMapV71||null;}
  function scenicActive(){return router()?.getMode?.()==="scenic";}
  function shortName(entry){return String(entry?.name||"").split(/\r?\n/)[0].trim();}
  function createIcon(fill,border,special=false){const size=96,c=document.createElement("canvas");c.width=size;c.height=size;const x=c.getContext("2d");x.clearRect(0,0,size,size);x.beginPath();x.arc(48,48,38,0,Math.PI*2);x.fillStyle=fill;x.fill();x.lineWidth=7;x.strokeStyle=border;x.stroke();x.strokeStyle="#fff8e9";x.fillStyle="#fff8e9";x.lineWidth=5;x.lineJoin="round";x.beginPath();x.moveTo(20,62);x.lineTo(37,42);x.lineTo(47,52);x.lineTo(60,34);x.lineTo(77,62);x.stroke();x.beginPath();x.moveTo(21,66);x.quadraticCurveTo(48,58,75,66);x.stroke();if(special){x.fillStyle="#fff1a8";x.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?5:10,px=73+Math.cos(a)*r,py=23+Math.sin(a)*r;i===0?x.moveTo(px,py):x.lineTo(px,py);}x.closePath();x.fill();}return x.getImageData(0,0,size,size);}
  function ensureIcons(m){let changed=false;const icons={"scenic-v71-unvisited":createIcon("#55486e","#332a46"),"scenic-v71-special":createIcon("#684965","#3f2c3d",true),"scenic-v71-visited":createIcon("#8d7134","#59451f"),"scenic-v71-gps":createIcon("#43765a","#28503a")};for(const [id,img] of Object.entries(icons)){try{if(!m.hasImage(id)){m.addImage(id,img,{pixelRatio:2});changed=true;}}catch{}}return changed;}
  function buildGeoJson(){const runtime=rt();if(!runtime)return {type:"FeatureCollection",features:[]};const state=runtime.loadState?.()||{visited:{}};const features=[];for(const entry of runtime.entries?.()||[]){const refs=runtime.referenceZones?.(entry)||[];if(!refs.length)continue;const p=refs[0],record=state.visited?.[entry.id]||null;features.push({type:"Feature",properties:{id:entry.id,name:shortName(entry),special:entry.specialScenic===true,visited:!!record,gps:record?.verificationType==="gps_scenic",gpsReady:!!runtime.isGpsReady?.(entry),prefecture:(entry.prefectures||[]).join("・")},geometry:{type:"Point",coordinates:[Number(p.lng),Number(p.lat)]}});}return {type:"FeatureCollection",features};}
  function layerVisible(m,id,visible){if(!m.getLayer(id))return false;const desired=visible?"visible":"none";try{if(m.getLayoutProperty?.(id,"visibility")===desired)return false;m.setLayoutProperty(id,"visibility",desired);return true;}catch{return false;}}

  function ensureSourceAndLayers(refreshData=false){
    const m=getMap(),runtime=rt();if(!m||!runtime||!m.isStyleLoaded?.())return {ok:false,recreatedPins:false,recreatedZone:false,changed:false};
    let changed=ensureIcons(m),recreatedPins=false,recreatedZone=false;
    try{if(!m.getSource(SOURCE)){m.addSource(SOURCE,{type:"geojson",data:buildGeoJson()});changed=true;recreatedPins=true;}else if(refreshData){m.getSource(SOURCE)?.setData?.(buildGeoJson());changed=true;}}catch(e){console.warn("v72.9 scenic source recovery skipped",e);return {ok:false,recreatedPins,recreatedZone,changed};}
    try{if(!m.getLayer(SYMBOL)){m.addLayer({id:SYMBOL,type:"symbol",source:SOURCE,layout:{visibility:"none","icon-image":["case",["==",["get","gps"],true],"scenic-v71-gps",["==",["get","visited"],true],"scenic-v71-visited",["==",["get","special"],true],"scenic-v71-special","scenic-v71-unvisited"],"icon-size":["interpolate",["linear"],["zoom"],4.6,.32,8,.48,12,.66],"icon-allow-overlap":true,"icon-ignore-placement":true}});changed=true;recreatedPins=true;}}catch(e){console.warn("v72.9 scenic symbol recovery skipped",e);}
    try{if(!m.getLayer(LABELS)){m.addLayer({id:LABELS,type:"symbol",source:SOURCE,minzoom:7.2,layout:{visibility:"none","text-field":["get","name"],"text-size":["interpolate",["linear"],["zoom"],7.2,10,12,13],"text-offset":[0,1.8],"text-anchor":"top","text-optional":true},paint:{"text-color":"#55485d","text-halo-color":"#fffaf0","text-halo-width":1.5}});changed=true;recreatedPins=true;}}catch(e){console.warn("v72.9 scenic labels recovery skipped",e);}
    try{if(!m.getSource(ZONE_SOURCE)){m.addSource(ZONE_SOURCE,{type:"geojson",data:{type:"FeatureCollection",features:[]}});changed=true;recreatedZone=true;}}catch{}
    try{if(!m.getLayer(ZONE_FILL)){m.addLayer({id:ZONE_FILL,type:"fill",source:ZONE_SOURCE,layout:{visibility:"none"},paint:{"fill-color":"#7d5a92","fill-opacity":.13}});changed=true;recreatedZone=true;}}catch{}
    try{if(!m.getLayer(ZONE_LINE)){m.addLayer({id:ZONE_LINE,type:"line",source:ZONE_SOURCE,layout:{visibility:"none"},paint:{"line-color":"#75528b","line-width":2,"line-opacity":.88}});changed=true;recreatedZone=true;}}catch{}
    return {ok:true,recreatedPins,recreatedZone,changed};
  }

  function syncLegacyActive(){const r=router(),api=scenicApi();if(!r||!api||!scenicActive()||api.active?.()===true||syncing)return false;syncing=true;try{r.setMode?.("scenic",{source:"scenic-stability-v729"});return true;}catch(e){console.warn("v72.9 scenic legacy sync skipped",e);return false;}finally{syncing=false;}}
  function normalizeUi(){
    const m=getMap(),active=scenicActive();if(!m)return false;let changed=false;
    for(const id of [SYMBOL,LABELS])changed=layerVisible(m,id,active)||changed;
    if(active){
      sessionStorage.setItem("mapDomainModeV71","scenic");
      for(const id of ["spots-symbol","spots-labels","checkin-zone-fill","checkin-zone-line","castles-v62-symbol","castles-v62-labels","castle-checkin-zone-v62-fill","castle-checkin-zone-v62-line"])changed=layerVisible(m,id,false)||changed;
      const main=document.querySelector(".main"),scenic=document.getElementById("scenicMapPanelV71"),castle=document.getElementById("castleMapPanelV62"),onsen=main?.querySelector(":scope > .panel:not(.castle-map-panel-v62):not(.scenic-map-panel-v71)");
      if(scenic?.hidden){scenic.hidden=false;changed=true;}if(castle&&!castle.hidden){castle.hidden=true;changed=true;}if(onsen&&!onsen.hidden){onsen.hidden=true;changed=true;}
      const shell=document.querySelector(".map-shell");if(shell&&!shell.classList.contains("scenic-map-mode-v71")){shell.classList.add("scenic-map-mode-v71");changed=true;}
    }else{
      const shell=document.querySelector(".map-shell");if(shell?.classList.contains("scenic-map-mode-v71")){shell.classList.remove("scenic-map-mode-v71");changed=true;}
    }
    const root=document.getElementById("mapDomainSwitchV62");if(root&&active){for(const b of root.querySelectorAll("[data-map-domain]")){const on=b.dataset.mapDomain==="scenic";if(b.classList.contains("active")!==on){b.classList.toggle("active",on);changed=true;}if(b.getAttribute("aria-pressed")!==(on?"true":"false")){b.setAttribute("aria-pressed",on?"true":"false");changed=true;}}}
    if(changed)requestAnimationFrame(()=>m.resize?.());return changed;
  }

  function restoreSelectedZoneIfNeeded(layerState){
    if(!scenicActive()||!layerState.recreatedZone)return false;
    const api=scenicApi(),id=api?.selectedId?.();
    if(!id){layerVisible(getMap(),ZONE_FILL,false);layerVisible(getMap(),ZONE_LINE,false);return false;}
    try{return api.renderSelectedZone?.()===true;}catch(e){console.warn("v72.9 scenic selected zone restore skipped",e);return false;}
  }

  function ensure(reason="refresh"){
    scheduled=false;
    const legacySynced=syncLegacyActive();
    const refreshData=reason.includes("visit")||reason.includes("runtime")||reason==="install";
    const layerState=ensureSourceAndLayers(refreshData);
    const zoneRestored=restoreSelectedZoneIfNeeded(layerState);
    const uiChanged=normalizeUi();
    const m=getMap(),selectedId=scenicApi()?.selectedId?.()||null;
    lastHealth={build:BUILD,reason,mode:router()?.getMode?.()||null,source:!!m?.getSource?.(SOURCE),symbol:!!m?.getLayer?.(SYMBOL),labels:!!m?.getLayer?.(LABELS),zoneFill:!!m?.getLayer?.(ZONE_FILL),zoneLine:!!m?.getLayer?.(ZONE_LINE),selectedId,legacyActive:scenicApi()?.active?.()===true,recreatedPins:layerState.recreatedPins,recreatedZone:layerState.recreatedZone,changed:layerState.changed||uiChanged||legacySynced||zoneRestored};
    return lastHealth;
  }
  function schedule(reason="event",delay=0){if(delay){setTimeout(()=>schedule(reason,0),delay);return;}if(scheduled)return;scheduled=true;requestAnimationFrame(()=>ensure(reason));}
  function bindMap(){const m=getMap();if(!m||m.__scenicStabilityV729Bound)return false;Object.defineProperty(m,"__scenicStabilityV729Bound",{value:true,configurable:true});m.on?.("style.load",()=>{schedule("style.load",0);schedule("style.load-late",120);});m.on?.("styledata",()=>{if(scenicActive())schedule("styledata",40);});m.on?.("idle",()=>{if(scenicActive())schedule("idle");});return true;}
  async function install(){
    if(installed)return;installed=true;
    for(let i=0;i<300;i++){if(getMap()&&router()&&rt()&&scenicApi())break;await new Promise(r=>setTimeout(r,40));}
    bindMap();
    for(const evt of ["onsen-map-domain-v72-changed","onsen-map-domain-changed","onsen-scenic-map-ready","onsen-scenic-runtime-ready","onsen-scenic-visit-changed","pageshow"])window.addEventListener(evt,()=>{schedule(evt,0);if(scenicActive())schedule(`${evt}-late`,120);});
    window.addEventListener("onsen-app-tab-changed",(e)=>{if(e.detail?.tab==="map"){schedule("map-tab",0);schedule("map-tab-late",120);}});
    window.addEventListener("onsen-scenic-selection-changed",()=>schedule("selection",0));
    setInterval(()=>{bindMap();if(scenicActive())ensure("health-tick");},5000);
    ensure("install");
    window.OnsenScenicMapStabilityV728={build:BUILD,ensure,diagnostics:()=>lastHealth||ensure("diagnostics")};
    window.dispatchEvent(new CustomEvent("onsen-scenic-map-stability-ready",{detail:{build:BUILD,health:lastHealth}}));
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>install().catch(console.warn),{once:true});else install().catch(console.warn);
})();