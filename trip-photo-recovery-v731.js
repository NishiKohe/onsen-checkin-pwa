(() => {
  const BUILD = "v73.1";
  const PHOTO_NEARBY_MARGIN_M = 1000;
  const MAX_MATCHES = 12;
  let installed = false;

  const rad=(v)=>Number(v)*Math.PI/180;
  function distanceM(aLat,aLng,bLat,bLng){const R=6371000,dLat=rad(bLat-aLat),dLng=rad(bLng-aLng),a=Math.sin(dLat/2)**2+Math.cos(rad(aLat))*Math.cos(rad(bLat))*Math.sin(dLng/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
  const shortName=(v)=>String(v||"").split(/\r?\n/)[0].trim();
  const settings=()=>{try{return {tripMode:false,activeSessionId:null,...JSON.parse(localStorage.getItem("visitSettingsV1")||"{}")};}catch{return {tripMode:false,activeSessionId:null};}};
  function setStatus(text){const node=document.getElementById("tripPhotoStatus");if(node)node.textContent=text;}

  function nearestOnsen(lat,lng){
    if(typeof spots==="undefined"||!Array.isArray(spots)||typeof getNearestZoneStatus!=="function")return [];
    const visited=new Set(typeof loadCheckins==="function"?loadCheckins().map((x)=>String(x.spotId||"")):[]),out=[];
    for(const spot of spots){if(!spot?.id||visited.has(String(spot.id)))continue;const n=getNearestZoneStatus(spot,{lat,lng});if(!n||n.remainingM>PHOTO_NEARBY_MARGIN_M)continue;out.push({entityType:"onsen",entityId:String(spot.id),name:spot.name,prefecture:spot.prefecture||"",distanceM:n.distanceToCenterM,remainingM:n.remainingM,radiusM:n.zone?.radiusM||null,inRange:n.inRange,zoneLabel:n.zone?.label||spot.name,zoneLat:n.zone?.lat,zoneLng:n.zone?.lng,coordinateSource:"onsen_catalog"});}
    return out;
  }

  function nearestCastles(lat,lng){
    const domain=window.OnsenCastleDomain,visits=window.OnsenCastleVisits,zones=domain?.data?.zoneData?.entries,entities=domain?.data?.entities;
    if(!Array.isArray(zones)||!Array.isArray(entities))return [];
    const byId=new Map(entities.map((x)=>[String(x.id),x])),out=[];
    for(const z of zones){const id=String(z?.castleId||"");if(!id||visits?.isVisited?.(id))continue;const zlat=Number(z.lat),zlng=Number(z.lng),radiusM=Math.max(500,Number(z.radiusM)||750);if(!Number.isFinite(zlat)||!Number.isFinite(zlng))continue;const d=distanceM(lat,lng,zlat,zlng),remainingM=Math.max(0,d-radiusM);if(remainingM>PHOTO_NEARBY_MARGIN_M)continue;const e=byId.get(id)||{};out.push({entityType:"castle",entityId:id,name:e.name||z.name||"城",prefecture:e.prefecture||"",distanceM:d,remainingM,radiusM,inRange:d<=radiusM,zoneLabel:z.name||e.name||"城域",zoneLat:zlat,zoneLng:zlng,coordinateSource:z.coordinateStatus||"castle_zone"});}
    return out;
  }

  function nearestScenic(lat,lng){
    const rt=window.OnsenScenicRuntime;if(!rt?.entries||!rt?.auditedZones)return [];
    const out=[];
    for(const entry of rt.entries()){if(!entry?.id||rt.isVisited?.(entry.id))continue;let best=null;for(const z of rt.auditedZones(entry)){const zlat=Number(z.lat),zlng=Number(z.lng),radiusM=Math.max(500,Number(z.radiusM)||750);if(!Number.isFinite(zlat)||!Number.isFinite(zlng))continue;const d=distanceM(lat,lng,zlat,zlng),remainingM=Math.max(0,d-radiusM),next={z,d,remainingM,radiusM,inRange:d<=radiusM};if(!best||next.remainingM<best.remainingM||(next.remainingM===best.remainingM&&next.d<best.d))best=next;}if(!best||best.remainingM>PHOTO_NEARBY_MARGIN_M)continue;out.push({entityType:"scenic",entityId:String(entry.id),name:shortName(entry.name),prefecture:(entry.prefectures||[]).join("・"),distanceM:best.d,remainingM:best.remainingM,radiusM:best.radiusM,inRange:best.inRange,zoneLabel:best.z?.label||"名勝",zoneLat:Number(best.z?.lat),zoneLng:Number(best.z?.lng),coordinateSource:best.z?.source||"scenic_runtime"});}
    return out;
  }

  function chooseMatches(rows){
    const selected=[];
    for(const domain of ["onsen","castle","scenic"]){const list=rows.filter((x)=>x.entityType===domain).sort((a,b)=>a.remainingM-b.remainingM||a.distanceM-b.distanceM);const inside=list.filter((x)=>x.inRange);if(inside.length)selected.push(...inside.slice(0,5));else if(list[0])selected.push(list[0]);}
    return selected.sort((a,b)=>Number(b.inRange)-Number(a.inRange)||a.remainingM-b.remainingM||a.distanceM-b.distanceM).slice(0,MAX_MATCHES);
  }

  async function handlePhoto(file){
    if(!file)return;setStatus("写真の位置情報を確認中…");
    const exifRuntime=window.OnsenPhotoExifV731,recovery=window.OnsenTravelDomainRecoveryV731||window.OnsenTravelDomainRecoveryV728;
    if(!exifRuntime?.readGps||!recovery?.upsertCandidate){setStatus("写真復元Runtimeの準備が完了していません。アプリを再起動してください。");return;}
    try{
      const exif=await exifRuntime.readGps(file);
      if(!Number.isFinite(Number(exif?.lat))||!Number.isFinite(Number(exif?.lng))){setStatus("GPS位置情報が見つかりませんでした。JPEG原本の位置情報をご確認ください。");return;}
      const lat=Number(exif.lat),lng=Number(exif.lng),photoAt=Number(exif.takenAt||file.lastModified||Date.now());
      const matches=chooseMatches([...nearestOnsen(lat,lng),...nearestCastles(lat,lng),...nearestScenic(lat,lng)]);
      if(!matches.length){setStatus("写真のGPS位置から1km以内に未訪問の温泉・名城・名勝が見つかりませんでした。");return;}
      const sessionId=settings().activeSessionId||null;let added=0;
      for(const match of matches){const strength=match.inRange?"photo_verified_range":"photo_nearby";const ok=recovery.upsertCandidate({entityType:match.entityType,entityId:match.entityId,name:match.name,prefecture:match.prefecture,detectedAt:photoAt,distanceM:Math.round(match.distanceM),remainingM:Math.round(match.remainingM),radiusM:match.radiusM,accuracyM:null,zoneLabel:match.zoneLabel,zoneLat:match.zoneLat,zoneLng:match.zoneLng,strength,source:"photo_exif",tripSessionId:sessionId,coordinateSource:match.coordinateSource,evidence:[{type:"photo_exif",lat,lng,takenAt:photoAt,originalDateText:exif.originalDateText||null,distanceToCenterM:Math.round(match.distanceM),remainingM:Math.round(match.remainingM),radiusM:match.radiusM,zoneLabel:match.zoneLabel,strength}]});if(ok)added+=1;}
      recovery.render?.();window.dispatchEvent(new CustomEvent("onsen-trip-recovery-input-changed",{detail:{build:BUILD,type:"photo",matches:matches.length}}));
      const labels=[...new Set(matches.map((x)=>x.entityType==="onsen"?"温泉":x.entityType==="castle"?"名城":"名勝"))].join("・");
      setStatus(`${labels}から${matches.length}件を照合し、${added || matches.length}件を取り逃し候補に追加/更新しました。`);
    }catch(error){console.warn("v73.1 photo recovery failed",error);setStatus("この写真のEXIFを読み取れませんでした。JPEG原本でお試しください。");}
  }

  function ensureCopy(){const input=document.getElementById("tripPhotoInput");if(!input)return false;const card=input.closest(".trip-card");const p=card?.querySelector(".trip-card-heading p");if(p)p.textContent="JPEGのGPS EXIFを温泉・名城200・名勝へ同時照合し、範囲内/付近の候補を作ります。";setStatus("写真は端末内で解析し、画像そのものは保存しません。");return true;}

  async function install(){
    if(installed)return;installed=true;
    for(let i=0;i<240;i+=1){if(document.getElementById("tripPhotoInput")&&window.OnsenPhotoExifV731&&(window.OnsenTravelDomainRecoveryV731||window.OnsenTravelDomainRecoveryV728)&&window.OnsenScenicRuntime)break;await new Promise(r=>setTimeout(r,50));}
    if(!ensureCopy())return;
    document.addEventListener("change",(event)=>{const input=event.target instanceof Element&&event.target.matches("#tripPhotoInput")?event.target:null;if(!input)return;const file=input.files?.[0]||null;event.preventDefault();event.stopImmediatePropagation();input.value="";handlePhoto(file);},true);
    window.OnsenTripPhotoRecoveryV731={build:BUILD,handlePhoto,chooseMatches};window.dispatchEvent(new CustomEvent("onsen-trip-photo-recovery-ready",{detail:{build:BUILD}}));
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>install().catch(console.warn),{once:true});else install().catch(console.warn);
})();