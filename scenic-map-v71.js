(() => {
  const BUILD = "v71";
  const SOURCE = "scenic-v71";
  const SYMBOL = "scenic-v71-symbol";
  const LABELS = "scenic-v71-labels";
  const ZONE_SOURCE = "scenic-v71-zone";
  const ZONE_FILL = "scenic-v71-zone-fill";
  const ZONE_LINE = "scenic-v71-zone-line";
  const LOCATION_MAX_AGE_MS = 2 * 60 * 1000;
  let active = false;
  let installed = false;
  let selectedId = null;
  let position = null;
  let suppressBaseDomainEvent = false;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  function getMap() { try { return typeof map !== "undefined" ? map : null; } catch { return null; } }
  function runtime() { return window.OnsenScenicRuntime || null; }
  function scenicIntentActive() { return sessionStorage.getItem("mapDomainModeV71") === "scenic"; }
  function esc(value) { return String(value ?? "").replace(/[&<>'\"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
  function shortName(entry) { return String(entry?.name || "").split(/\r?\n/)[0].trim(); }
  function formatDistance(m) { const n=Number(m); if(!Number.isFinite(n)) return "—"; return n<1000?`${Math.round(n)}m`:`${(n/1000).toFixed(n<10000?1:0)}km`; }
  function haversineM(lat1,lng1,lat2,lng2){const R=6371000,rad=(v)=>v*Math.PI/180,dLat=rad(lat2-lat1),dLng=rad(lng2-lng1),a=Math.sin(dLat/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLng/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
  function circlePolygon(lat,lng,radiusM,steps=64){const R=6371000,latRad=lat*Math.PI/180,latDelta=radiusM/R,lngDelta=radiusM/(R*Math.max(.15,Math.cos(latRad))),coords=[];for(let i=0;i<=steps;i+=1){const a=i/steps*Math.PI*2;coords.push([lng+lngDelta*Math.cos(a)*180/Math.PI,lat+latDelta*Math.sin(a)*180/Math.PI]);}return {type:"Polygon",coordinates:[coords]};}
  function setLayer(id, visible){const m=getMap();if(!m?.getLayer(id))return;try{m.setLayoutProperty(id,"visibility",visible?"visible":"none");}catch{}}

  function createIcon(fill,border,special=false){
    const size=96,canvas=document.createElement("canvas");canvas.width=size;canvas.height=size;const ctx=canvas.getContext("2d");
    ctx.clearRect(0,0,size,size);ctx.beginPath();ctx.arc(48,48,38,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();ctx.lineWidth=7;ctx.strokeStyle=border;ctx.stroke();
    ctx.strokeStyle="#fff8e9";ctx.fillStyle="#fff8e9";ctx.lineWidth=5;ctx.lineJoin="round";
    ctx.beginPath();ctx.moveTo(20,62);ctx.lineTo(37,42);ctx.lineTo(47,52);ctx.lineTo(60,34);ctx.lineTo(77,62);ctx.stroke();
    ctx.beginPath();ctx.moveTo(21,66);ctx.quadraticCurveTo(48,58,75,66);ctx.stroke();
    if(special){ctx.fillStyle="#fff1a8";ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?5:10,x=73+Math.cos(a)*r,y=23+Math.sin(a)*r;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.closePath();ctx.fill();}
    return ctx.getImageData(0,0,size,size);
  }
  function ensureIcons(m){
    const icons={
      "scenic-v71-unvisited":createIcon("#55486e","#332a46",false),
      "scenic-v71-special":createIcon("#684965","#3f2c3d",true),
      "scenic-v71-visited":createIcon("#8d7134","#59451f",false),
      "scenic-v71-gps":createIcon("#43765a","#28503a",false)
    };
    for(const [id,img] of Object.entries(icons)) if(!m.hasImage(id)) m.addImage(id,img,{pixelRatio:2});
  }
  function visitStatus(entry){const record=runtime()?.loadState?.().visited?.[entry.id]||null;return {visited:!!record,gps:record?.verificationType==="gps_scenic"};}
  function buildGeoJson(){
    const rt=runtime(); if(!rt) return {type:"FeatureCollection",features:[]};
    const features=[];
    for(const entry of rt.entries()){
      const refs=rt.referenceZones(entry);if(!refs.length)continue;const point=refs[0],status=visitStatus(entry);
      features.push({type:"Feature",properties:{id:entry.id,name:shortName(entry),special:!!entry.specialScenic,visited:status.visited,gps:status.gps,gpsReady:rt.isGpsReady(entry),prefecture:(entry.prefectures||[]).join("・")},geometry:{type:"Point",coordinates:[point.lng,point.lat]}});
    }
    return {type:"FeatureCollection",features};
  }
  function refreshSource(){getMap()?.getSource(SOURCE)?.setData?.(buildGeoJson());}
  function installLayers(){
    const m=getMap(),rt=runtime();if(!m||!rt)return false;
    if(m.getSource(SOURCE)){refreshSource();applyMode();return true;}
    ensureIcons(m);
    m.addSource(SOURCE,{type:"geojson",data:buildGeoJson()});
    m.addLayer({id:SYMBOL,type:"symbol",source:SOURCE,layout:{visibility:"none","icon-image":["case",["==",["get","gps"],true],"scenic-v71-gps",["==",["get","visited"],true],"scenic-v71-visited",["==",["get","special"],true],"scenic-v71-special","scenic-v71-unvisited"],"icon-size":["interpolate",["linear"],["zoom"],4.6,.32,8,.48,12,.66],"icon-allow-overlap":true,"icon-ignore-placement":true}});
    m.addLayer({id:LABELS,type:"symbol",source:SOURCE,minzoom:7.2,layout:{visibility:"none","text-field":["get","name"],"text-size":["interpolate",["linear"],["zoom"],7.2,10,12,13],"text-offset":[0,1.8],"text-anchor":"top","text-optional":true},paint:{"text-color":"#55485d","text-halo-color":"#fffaf0","text-halo-width":1.5}});
    m.addSource(ZONE_SOURCE,{type:"geojson",data:{type:"FeatureCollection",features:[]}});
    m.addLayer({id:ZONE_FILL,type:"fill",source:ZONE_SOURCE,layout:{visibility:"none"},paint:{"fill-color":"#7d5a92","fill-opacity":.13}});
    m.addLayer({id:ZONE_LINE,type:"line",source:ZONE_SOURCE,layout:{visibility:"none"},paint:{"line-color":"#75528b","line-width":2,"line-opacity":.88}});
    const select=(event)=>{const feature=event.features?.[0];if(feature)selectScenic(feature.properties.id,{fly:false});};
    m.on("click",SYMBOL,select);m.on("click",LABELS,select);
    for(const id of [SYMBOL,LABELS]){m.on("mouseenter",id,()=>{m.getCanvas().style.cursor="pointer";});m.on("mouseleave",id,()=>{m.getCanvas().style.cursor="";});}
    applyMode();return true;
  }

  function ensureSwitchButton(){
    const root=document.getElementById("mapDomainSwitchV62");if(!root)return null;
    if(root.dataset.scenicIntentGuardV716!=="1"){
      root.dataset.scenicIntentGuardV716="1";
      root.addEventListener("click",(event)=>{
        const target=event.target instanceof Element?event.target.closest("[data-map-domain]"):null;
        if(!target||!root.contains(target))return;
        const domain=target.dataset.mapDomain||"onsen";
        if(domain!=="scenic")sessionStorage.removeItem("mapDomainModeV71");
      },true);
    }
    let button=root.querySelector('[data-map-domain="scenic"]');
    if(!button){button=document.createElement("button");button.type="button";button.dataset.mapDomain="scenic";button.innerHTML="◇<span>名勝</span>";button.addEventListener("click",(event)=>{event.preventDefault();event.stopPropagation();showScenicMode();});root.appendChild(button);}
    return button;
  }
  function ensurePanel(){
    const main=document.querySelector(".main"),castlePanel=document.getElementById("castleMapPanelV62"),onsenPanel=main?.querySelector(":scope > .panel:not(.castle-map-panel-v62):not(.scenic-map-panel-v71)");
    if(!main||!onsenPanel)return null;let panel=document.getElementById("scenicMapPanelV71");if(panel)return panel;
    panel=document.createElement("section");panel.id="scenicMapPanelV71";panel.className="panel scenic-map-panel-v71";panel.hidden=true;
    panel.innerHTML=`<div class="scenic-map-empty-v71" id="scenicMapEmptyV71"><span>NATIONAL PLACES OF SCENIC BEAUTY</span><h2>名勝を選択</h2><p>文化庁公式座標の名勝ピンをタップしてください。</p></div><div id="scenicMapDetailV71" hidden><div class="scenic-map-title-v71"><div><span id="scenicMapKindV71">名勝</span><h2 id="scenicMapNameV71">名勝</h2><p id="scenicMapPlaceV71"></p></div><b id="scenicMapStatusV71">未訪問</b></div><div class="scenic-map-metrics-v71"><div><span>距離</span><b id="scenicMapDistanceV71">現在地未取得</b></div><div><span>GPS精度</span><b id="scenicMapAccuracyV71">—</b></div><div><span>GPS判定</span><b id="scenicMapRadiusV71">—</b></div></div><div class="scenic-map-actions-v71"><button id="scenicMapLocateV71" type="button" class="secondary">現在地を確認</button><button id="scenicMapCheckinV71" type="button" disabled>名勝チェックイン</button></div><div id="scenicMapMessageV71" class="scenic-map-message-v71">庭園・橋など公式参照点で安全に判定できる地点からGPS対応しています。</div><details class="details"><summary>GPS判定について</summary><p class="note">判定半径は500m未満にしません。現在の自動対応地点は原則750mです。山・峡谷・海岸・湖・島などの広域名勝は、公式参照点を地図に表示しても複数チェックイン地点の監査が終わるまでGPS取得対象にしません。</p></details></div>`;
    (castlePanel||onsenPanel).insertAdjacentElement("afterend",panel);
    panel.querySelector("#scenicMapLocateV71")?.addEventListener("click",()=>resolvePosition(true));
    panel.querySelector("#scenicMapCheckinV71")?.addEventListener("click",performCheckin);
    return panel;
  }
  function basePanels(){const main=document.querySelector(".main");return {onsen:main?.querySelector(":scope > .panel:not(.castle-map-panel-v62):not(.scenic-map-panel-v71)"),castle:document.getElementById("castleMapPanelV62"),scenic:ensurePanel()};}
  function clearZone(){getMap()?.getSource(ZONE_SOURCE)?.setData?.({type:"FeatureCollection",features:[]});}
  function renderZone(id){
    const rt=runtime(),source=getMap()?.getSource(ZONE_SOURCE);if(!rt||!source)return;const zones=rt.auditedZones(id);
    source.setData({type:"FeatureCollection",features:zones.map((zone)=>({type:"Feature",properties:{id,zoneId:zone.id,radiusM:zone.radiusM},geometry:circlePolygon(zone.lat,zone.lng,zone.radiusM)}))});
  }
  function selectedReferenceDistance(){const refs=runtime()?.referenceZones(selectedId)||[];if(!position||!refs.length)return null;return Math.min(...refs.map((z)=>haversineM(position.lat,position.lng,z.lat,z.lng)));}
  function selectedEvaluation(){return selectedId&&position?runtime()?.evaluatePosition(position,selectedId)||null:null;}
  function updatePanel(){
    const rt=runtime(),panel=ensurePanel(),entry=rt?.get(selectedId),empty=document.getElementById("scenicMapEmptyV71"),detail=document.getElementById("scenicMapDetailV71");if(!panel||!empty||!detail)return;
    if(!entry){empty.hidden=false;detail.hidden=true;return;}empty.hidden=true;detail.hidden=false;
    const record=rt.loadState().visited?.[entry.id]||null,gpsReady=rt.isGpsReady(entry),refs=rt.referenceZones(entry),evaluation=selectedEvaluation(),refDistance=selectedReferenceDistance(),fresh=position&&Date.now()-Number(position.sampledAt||0)<=LOCATION_MAX_AGE_MS;
    document.getElementById("scenicMapKindV71").textContent=entry.specialScenic?"特別名勝":"国指定名勝";
    document.getElementById("scenicMapNameV71").textContent=shortName(entry);
    document.getElementById("scenicMapPlaceV71").textContent=`${(entry.prefectures||[]).join("・")}${entry.location?` ・ ${entry.location}`:""}`;
    const status=document.getElementById("scenicMapStatusV71");status.textContent=record?.verificationType==="gps_scenic"?"GPS確認済":record?"訪問登録済":"未訪問";status.className=record?.verificationType==="gps_scenic"?"strict":record?"visited":"";
    document.getElementById("scenicMapDistanceV71").textContent=refDistance==null?"現在地未取得":formatDistance(refDistance);
    document.getElementById("scenicMapAccuracyV71").textContent=fresh&&Number.isFinite(Number(position?.accuracyM))?`${Math.round(position.accuracyM)}m`:"—";
    const radius=document.getElementById("scenicMapRadiusV71");radius.textContent=gpsReady?formatDistance(rt.auditedZones(entry)[0]?.radiusM):refs.length?"監査待ち":"座標なし";
    const check=document.getElementById("scenicMapCheckinV71"),message=document.getElementById("scenicMapMessageV71");
    const gpsDone=record?.verificationType==="gps_scenic";check.disabled=gpsDone||!evaluation?.ok;check.textContent=gpsDone?"GPS確認済":"名勝チェックイン";
    if(gpsDone)message.innerHTML="<strong>GPS確認済みです。</strong> この名勝の現地訪問は記録されています。";
    else if(!refs.length)message.textContent="文化庁DBに緯度経度がないため、GPS判定地点を別途監査します。";
    else if(!gpsReady)message.textContent="公式参照点は地図表示済みです。広域・複合地点のため、複数zone監査が終わるまでGPSチェックインは無効です。";
    else if(!position)message.textContent="「現在地を確認」でGPSを取得するとチェックイン可否を判定します。";
    else if(evaluation?.reason==="accuracy_too_low")message.textContent=`GPS精度が不足しています（現在約${Math.round(position.accuracyM)}m / 許容500m）。`;
    else if(evaluation?.reason==="out_of_range")message.textContent=`判定範囲外です。公式参照点まで約${formatDistance(refDistance)}です。`;
    else if(evaluation?.reason==="position_stale")message.textContent="位置情報が古いため、現在地を再取得してください。";
    else if(evaluation?.ok)message.innerHTML=`<strong>チェックイン可能です。</strong> 判定地点まで約${formatDistance(evaluation.best.distanceM)}。`;
    else message.textContent="現在地を確認してください。";
  }
  async function resolvePosition(center=false){
    const message=document.getElementById("scenicMapMessageV71");if(!navigator.geolocation){if(message)message.textContent="この端末は位置情報取得に対応していません。";return null;}if(message)message.textContent="現在地を高精度で確認しています…";
    return new Promise((resolve)=>navigator.geolocation.getCurrentPosition((p)=>{position={lat:Number(p.coords.latitude),lng:Number(p.coords.longitude),accuracyM:Number(p.coords.accuracy||0),sampledAt:Number(p.timestamp||Date.now())};if(center)getMap()?.flyTo?.({center:[position.lng,position.lat],zoom:Math.max(12,getMap()?.getZoom?.()||12)});updatePanel();resolve(position);},(error)=>{console.warn("scenic geolocation failed",error);position=null;if(message)message.textContent="現在地を取得できませんでした。位置情報の権限とGPS状態を確認してください。";updatePanel();resolve(null);},{enableHighAccuracy:true,timeout:12000,maximumAge:3000}));
  }
  function performCheckin(){
    if(!selectedId||!position)return;const result=runtime()?.registerGpsVisit(selectedId,position);const message=document.getElementById("scenicMapMessageV71");if(!result?.ok){updatePanel();return;}refreshSource();updatePanel();if(message)message.innerHTML=result.already?"<strong>GPS確認済みです。</strong>":"<strong>チェックイン成功！</strong> 名勝のGPS訪問を記録しました。";try{navigator.vibrate?.([70,40,120]);}catch{}
  }
  function selectScenic(id,options={}){
    const entry=runtime()?.get(id),refs=runtime()?.referenceZones(id)||[];if(!entry)return false;selectedId=entry.id;renderZone(entry.id);updatePanel();if(options.fly!==false&&refs.length)getMap()?.flyTo?.({center:[refs[0].lng,refs[0].lat],zoom:Math.max(11,getMap()?.getZoom?.()||11)});return true;
  }

  function applyMode(){
    const m=getMap(),button=ensureSwitchButton(),panels=basePanels();setLayer(SYMBOL,active);setLayer(LABELS,active);setLayer(ZONE_FILL,active);setLayer(ZONE_LINE,active);
    if(button){button.classList.toggle("active",active);button.setAttribute("aria-pressed",active?"true":"false");}
    const root=document.getElementById("mapDomainSwitchV62");if(active&&root)for(const b of root.querySelectorAll('[data-map-domain]:not([data-map-domain="scenic"])')){b.classList.remove("active");b.setAttribute("aria-pressed","false");}
    if(active){for(const id of ["spots-symbol","spots-labels","checkin-zone-fill","checkin-zone-line","castles-v62-symbol","castles-v62-labels","castle-checkin-zone-v62-fill","castle-checkin-zone-v62-line"])setLayer(id,false);if(panels.onsen)panels.onsen.hidden=true;if(panels.castle)panels.castle.hidden=true;if(panels.scenic)panels.scenic.hidden=false;const toolsToggle=document.getElementById("btnMapToolsToggle"),tools=document.getElementById("mapToolsPanel");if(toolsToggle)toolsToggle.hidden=true;if(tools){tools.hidden=true;tools.setAttribute("aria-hidden","true");}if(selectedId)renderZone(selectedId);else clearZone();}
    else {if(panels.scenic)panels.scenic.hidden=true;clearZone();}
    document.querySelector(".map-shell")?.classList.toggle("scenic-map-mode-v71",active);requestAnimationFrame(()=>m?.resize?.());
  }
  function showScenicMode(id=null){
    const onsenButton=document.querySelector('#mapDomainSwitchV62 [data-map-domain="onsen"]');
    suppressBaseDomainEvent=true;try{onsenButton?.click?.();}finally{suppressBaseDomainEvent=false;}
    active=true;sessionStorage.setItem("mapDomainModeV71","scenic");applyMode();if(id)setTimeout(()=>selectScenic(id,{fly:true}),50);window.dispatchEvent(new CustomEvent("onsen-scenic-map-domain-changed",{detail:{build:BUILD,mode:"scenic"}}));
  }
  function leaveScenic(){if(!active)return;active=false;sessionStorage.removeItem("mapDomainModeV71");applyMode();}
  function showScenic(id){window.OnsenAppShell?.show?.("map");showScenicMode(id);}

  async function install(){
    if(installed)return;for(let i=0;i<240;i+=1){if(runtime()?.build===BUILD&&getMap()&&document.getElementById("mapDomainSwitchV62"))break;await sleep(50);}if(runtime()?.build!==BUILD||!getMap()){console.warn("scenic map v71 prerequisites not ready");return;}installed=true;ensureSwitchButton();ensurePanel();
    const m=getMap();if(m.loaded?.())installLayers();else m.once?.("load",installLayers);
    window.addEventListener("onsen-map-domain-changed",()=>{
      if(suppressBaseDomainEvent)return;
      if(active&&scenicIntentActive()){
        requestAnimationFrame(applyMode);
        return;
      }
      leaveScenic();
    });
    window.addEventListener("onsen-scenic-visit-changed",()=>{refreshSource();if(active)updatePanel();});
    window.addEventListener("pageshow",()=>{ensureSwitchButton();if(active)applyMode();});
    window.OnsenScenicMapV71={build:BUILD,show:showScenic,showMode:showScenicMode,select:selectScenic,refresh:()=>{refreshSource();updatePanel();},active:()=>active};
    if(sessionStorage.getItem("mapDomainModeV71")==="scenic")setTimeout(()=>showScenicMode(),80);
    window.dispatchEvent(new CustomEvent("onsen-scenic-map-ready",{detail:{build:BUILD}}));
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>install().catch((e)=>console.warn("scenic map v71 init failed",e)),{once:true});else install().catch((e)=>console.warn("scenic map v71 init failed",e));
})();
