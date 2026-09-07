(() => {
  const BUILD = "v72.8";
  const CANDIDATE_KEY = "visitDomainCandidatesV728";
  const LEGACY_CANDIDATE_KEY = "visitCandidatesV1";
  const SETTINGS_KEY = "visitSettingsV1";
  const MAX_PENDING = 250;
  const VERIFIED_ACCURACY_M = 150;
  const NEARBY_MARGIN_M = 300;
  const MERGE_MS = 30 * 60 * 1000;
  const SAMPLE_INTERVAL_MS = 60 * 1000;
  let sampleTimer = null;
  let installed = false;

  const readJson = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; }
    catch { return fallback; }
  };
  const writeJson = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const loadCandidates = () => readJson(CANDIDATE_KEY, []);
  const saveCandidates = (list) => writeJson(CANDIDATE_KEY, list.slice(-MAX_PENDING));
  const settings = () => ({ tripMode: false, activeSessionId: null, ...readJson(SETTINGS_KEY, {}) });
  const pending = () => loadCandidates().filter((x) => x?.status === "pending").sort((a,b) => Number(b.detectedAt||0)-Number(a.detectedAt||0));
  const rad = (v) => Number(v) * Math.PI / 180;
  function distanceM(aLat,aLng,bLat,bLng){const R=6371000,dLat=rad(bLat-aLat),dLng=rad(bLng-aLng),a=Math.sin(dLat/2)**2+Math.cos(rad(aLat))*Math.cos(rad(bLat))*Math.sin(dLng/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
  const shortName = (value) => String(value || "").split(/\r?\n/)[0].trim();
  const esc = (value) => String(value ?? "").replace(/[&<>'\"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  const dateText = (value) => new Date(Number(value||Date.now())).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});

  function candidateStrength(nearest, accuracyM) {
    if (nearest.inRange && accuracyM <= VERIFIED_ACCURACY_M) return "verified_range";
    if (nearest.remainingM <= NEARBY_MARGIN_M && accuracyM <= 500) return "nearby";
    return null;
  }

  function upsertCandidate(input) {
    const list = loadCandidates();
    const sampledAt = Number(input.detectedAt || Date.now());
    const recent = list.find((item) => item.status === "pending" && item.entityType === input.entityType && item.entityId === input.entityId && Math.abs(sampledAt - Number(item.detectedAt||0)) <= MERGE_MS);
    if (recent) {
      const better = input.strength === "verified_range" && recent.strength !== "verified_range" || Number(input.remainingM) < Number(recent.remainingM ?? Infinity) || Number(input.accuracyM) < Number(recent.accuracyM ?? Infinity);
      if (!better) return false;
      Object.assign(recent, input, { id: recent.id, status: "pending" });
    } else {
      list.push({ id:`domain-candidate-${input.entityType}-${input.entityId}-${sampledAt}`, status:"pending", ...input });
    }
    saveCandidates(list);
    return true;
  }

  function scanCastles(sample, accuracyM, sessionId) {
    const visits = window.OnsenCastleVisits;
    const domain = window.OnsenCastleDomain;
    const zoneEntries = window.OnsenCastleMap?.zones?.()?.entries;
    if (!visits || !Array.isArray(domain?.data?.entities) || !Array.isArray(zoneEntries)) return false;
    const entities = new Map(domain.data.entities.map((x)=>[String(x.id),x]));
    let changed = false;
    for (const raw of zoneEntries) {
      const id = String(raw?.castleId || "");
      if (!id || visits.isVisited?.(id)) continue;
      const lat=Number(raw.lat),lng=Number(raw.lng),radiusM=Math.max(500,Number(raw.radiusM)||750);
      if(!Number.isFinite(lat)||!Number.isFinite(lng))continue;
      const d=distanceM(sample.lat,sample.lng,lat,lng),remainingM=Math.max(0,d-radiusM),inRange=d<=radiusM;
      const strength=candidateStrength({inRange,remainingM},accuracyM);if(!strength)continue;
      const entity=entities.get(id)||{};
      changed = upsertCandidate({
        entityType:"castle",entityId:id,spotId:id,name:entity.name||raw.name||"城",prefecture:entity.prefecture||"",detectedAt:Number(sample.sampledAt||Date.now()),
        distanceM:Math.round(d),remainingM:Math.round(remainingM),radiusM,accuracyM,zoneLabel:raw.name||entity.name||"城域",zoneLat:lat,zoneLng:lng,
        strength,source:"geolocation",tripSessionId:sessionId||null,coordinateSource:raw.coordinateStatus||"castle_zone_v62",
        evidence:[{type:"gps",lat:sample.lat,lng:sample.lng,accuracyM,sampledAt:Number(sample.sampledAt||Date.now()),distanceToCenterM:Math.round(d),remainingM:Math.round(remainingM),radiusM,strength,sampleSource:sample.source||"geolocation"}]
      }) || changed;
    }
    return changed;
  }

  function scanScenic(sample, accuracyM, sessionId) {
    const rt = window.OnsenScenicRuntime;
    if (!rt?.entries || !rt?.auditedZones) return false;
    let changed = false;
    for (const entry of rt.entries()) {
      if (!entry?.id || rt.isVisited?.(entry.id)) continue;
      const zones = rt.auditedZones(entry);
      let nearest = null;
      for (const zone of zones) {
        const d=distanceM(sample.lat,sample.lng,Number(zone.lat),Number(zone.lng)),radiusM=Math.max(500,Number(zone.radiusM)||750),remainingM=Math.max(0,d-radiusM);
        const next={zone,d,radiusM,remainingM,inRange:d<=radiusM};
        if(!nearest||next.remainingM<nearest.remainingM||(next.remainingM===nearest.remainingM&&next.d<nearest.d))nearest=next;
      }
      if(!nearest)continue;
      const strength=candidateStrength(nearest,accuracyM);if(!strength)continue;
      changed = upsertCandidate({
        entityType:"scenic",entityId:String(entry.id),spotId:String(entry.id),name:shortName(entry.name),prefecture:(entry.prefectures||[]).join("・"),detectedAt:Number(sample.sampledAt||Date.now()),
        distanceM:Math.round(nearest.d),remainingM:Math.round(nearest.remainingM),radiusM:nearest.radiusM,accuracyM,zoneLabel:nearest.zone?.label||"名勝",zoneLat:Number(nearest.zone?.lat),zoneLng:Number(nearest.zone?.lng),
        strength,source:"geolocation",tripSessionId:sessionId||null,coordinateSource:nearest.zone?.source||"scenic_runtime",
        evidence:[{type:"gps",lat:sample.lat,lng:sample.lng,accuracyM,sampledAt:Number(sample.sampledAt||Date.now()),distanceToCenterM:Math.round(nearest.d),remainingM:Math.round(nearest.remainingM),radiusM:nearest.radiusM,zoneLabel:nearest.zone?.label||null,strength,sampleSource:sample.source||"geolocation"}]
      }) || changed;
    }
    return changed;
  }

  function scan(sample) {
    const cfg=settings();
    if(!cfg.tripMode||!Number.isFinite(Number(sample?.lat))||!Number.isFinite(Number(sample?.lng)))return false;
    const accuracyM=Number.isFinite(Number(sample?.accuracyM))?Number(sample.accuracyM):9999;if(accuracyM>1000)return false;
    const normalized={...sample,lat:Number(sample.lat),lng:Number(sample.lng),accuracyM};
    const changed=scanCastles(normalized,accuracyM,cfg.activeSessionId)||scanScenic(normalized,accuracyM,cfg.activeSessionId);
    if(changed)render();
    return changed;
  }

  function confirmCastle(candidate, onsite) {
    const visits=window.OnsenCastleVisits;if(!visits)return false;
    if(visits.isVisited?.(candidate.entityId))return true;
    const state=visits.loadState();
    state.records.push({categoryId:"castle",entityType:"castle",entityId:candidate.entityId,spotId:candidate.entityId,checkedAt:Number(candidate.detectedAt||Date.now()),verificationLevel:onsite?"onsite":"recorded",verificationType:onsite?"gps_recovered":"self_report_nearby",recordSource:"visit_candidate_confirmation",lat:candidate.evidence?.[0]?.lat??null,lng:candidate.evidence?.[0]?.lng??null,accuracyM:candidate.accuracyM??null,distanceM:candidate.distanceM??null,radiusM:candidate.radiusM??null,coordinateSource:candidate.coordinateSource||null,coordinateVerification:"travel_recovery_v728",evidence:candidate.evidence||[],recoveredAt:Date.now()});
    visits.saveState(state,"travel_candidate_recovered",{castleId:candidate.entityId,strictGps:onsite});
    return true;
  }

  function confirmScenic(candidate, onsite) {
    const rt=window.OnsenScenicRuntime;if(!rt)return false;
    if(rt.isVisited?.(candidate.entityId))return true;
    const state=rt.loadState(),entry=rt.get?.(candidate.entityId)||{};
    state.visited[String(candidate.entityId)]={visitedAt:Number(candidate.detectedAt||Date.now()),verificationType:onsite?"gps_scenic":"past_self_report",verificationLevel:onsite?"onsite":"recorded",recordSource:"visit_candidate_confirmation",source:"travel_domain_recovery_v728",lat:candidate.evidence?.[0]?.lat??null,lng:candidate.evidence?.[0]?.lng??null,accuracyM:candidate.accuracyM??null,zoneLabel:candidate.zoneLabel||null,distanceM:candidate.distanceM??null,radiusM:candidate.radiusM??null,specialScenic:entry.specialScenic===true,evidence:candidate.evidence||[],recoveredAt:Date.now()};
    rt.saveState(state,"scenic_travel_candidate_recovered");
    return true;
  }

  function confirm(id) {
    const list=loadCandidates(),candidate=list.find((x)=>x.id===id&&x.status==="pending");if(!candidate)return false;
    const onsite=candidate.strength==="verified_range";
    const ok=candidate.entityType==="castle"?confirmCastle(candidate,onsite):candidate.entityType==="scenic"?confirmScenic(candidate,onsite):false;
    if(!ok)return false;
    candidate.status="confirmed";candidate.resolvedAt=Date.now();saveCandidates(list);refreshAll();return true;
  }
  function dismiss(id){const list=loadCandidates(),c=list.find((x)=>x.id===id&&x.status==="pending");if(!c)return;c.status="dismissed";c.resolvedAt=Date.now();saveCandidates(list);render();}
  function showOnMap(id){const c=loadCandidates().find((x)=>x.id===id);if(!c)return;window.OnsenMapDomainV72?.open?.(c.entityType,c.entityId,{source:"travel-recovery"});}

  function aggregateMetrics() {
    const base=window.getVisitVerificationSummary?.()||{onsite:0,recordedOnly:0};
    const castleRecords=window.OnsenCastleVisits?.list?.()||[],castleBy=new Map();
    for(const r of castleRecords){const id=String(r.entityId||r.spotId||"");if(!id)continue;const onsite=r.verificationLevel==="onsite"&&String(r.verificationType||"").startsWith("gps_");const prev=castleBy.get(id);if(!prev||onsite)castleBy.set(id,{onsite});}
    const scenicValues=Object.values(window.OnsenScenicRuntime?.loadState?.().visited||{}),scenicOnsite=scenicValues.filter((r)=>r?.verificationType==="gps_scenic").length;
    const onsite=Number(base.onsite||0)+[...castleBy.values()].filter(x=>x.onsite).length+scenicOnsite;
    const recordedOnly=Number(base.recordedOnly||0)+[...castleBy.values()].filter(x=>!x.onsite).length+(scenicValues.length-scenicOnsite);
    return {onsite,recordedOnly};
  }

  function updateMetrics() {
    const legacyPending=readJson(LEGACY_CANDIDATE_KEY,[]).filter((x)=>x?.status==="pending").length,domainPending=pending().length,m=aggregateMetrics();
    const set=(id,value)=>{const n=document.getElementById(id);if(n)n.textContent=String(value);};
    set("tripCandidateMetric",legacyPending+domainPending);set("tripOnsiteMetric",m.onsite);set("tripRecordedMetric",m.recordedOnly);
  }

  function ensureRoot() {
    const legacy=document.getElementById("tripCandidateList");if(!legacy)return null;
    let root=document.getElementById("tripDomainCandidateListV728");
    if(!root){root=document.createElement("div");root.id="tripDomainCandidateListV728";root.className="trip-candidate-list";legacy.insertAdjacentElement("afterend",root);}
    return root;
  }
  function render() {
    const root=ensureRoot();if(!root)return;
    const items=pending();root.innerHTML="";
    const legacyEmpty=document.getElementById("tripCandidateList")?.querySelector(".trip-empty");if(legacyEmpty)legacyEmpty.hidden=items.length>0;
    for(const c of items.slice(0,80)){
      const row=document.createElement("div");row.className="trip-candidate";const verified=c.strength==="verified_range",domain=c.entityType==="castle"?"🏯 名城":"◇ 名勝",strength=verified?"GPS範囲内":"GPS付近";
      row.innerHTML=`<div class="trip-candidate-main"><div class="trip-candidate-title"><span class="trip-evidence ${verified?"verified":"nearby"}">${esc(strength)}</span><strong>${esc(domain)} ${esc(c.name)}</strong></div><div class="trip-candidate-meta">${esc(c.prefecture||"")} ・ ${dateText(c.detectedAt)} ・ ${Math.round(Number(c.distanceM)||0)}m${c.accuracyM?` ・ 精度${Math.round(Number(c.accuracyM))}m`:""}${c.zoneLabel?` ・ ${esc(c.zoneLabel)}`:""}</div></div><div class="trip-candidate-actions"><button type="button" data-a="map">地図</button><button type="button" data-a="dismiss">除外</button><button type="button" class="primary" data-a="confirm">取得</button></div>`;
      row.querySelector('[data-a="map"]').addEventListener("click",()=>showOnMap(c.id));row.querySelector('[data-a="dismiss"]').addEventListener("click",()=>dismiss(c.id));row.querySelector('[data-a="confirm"]').addEventListener("click",()=>confirm(c.id));root.appendChild(row);
    }
    setTimeout(updateMetrics,0);
  }
  function refreshAll(){window.OnsenCastleMap?.refresh?.();window.OnsenScenicMapV71?.refresh?.();window.OnsenCastleCollectionUI?.refresh?.();window.OnsenScenicCollectionUI?.refresh?.();window.OnsenDomainAchievements?.refresh?.();render();}

  function sampleNow() {
    if(!settings().tripMode||document.visibilityState!=="visible"||!navigator.geolocation)return;
    navigator.geolocation.getCurrentPosition((pos)=>scan({lat:pos.coords.latitude,lng:pos.coords.longitude,accuracyM:pos.coords.accuracy||0,sampledAt:pos.timestamp||Date.now(),source:"travel_domain_recovery_v728"}),()=>{}, {enableHighAccuracy:true,maximumAge:15000,timeout:15000});
  }
  function syncSampling(){const should=settings().tripMode&&document.visibilityState==="visible";if(should&&!sampleTimer){sampleNow();sampleTimer=setInterval(sampleNow,SAMPLE_INTERVAL_MS);}else if(!should&&sampleTimer){clearInterval(sampleTimer);sampleTimer=null;}}

  async function install() {
    if(installed)return;installed=true;
    for(let i=0;i<240;i+=1){if(window.OnsenCastleVisits&&window.OnsenCastleMap&&window.OnsenScenicRuntime)break;await new Promise(r=>setTimeout(r,50));}
    window.addEventListener("onsen-location-sample",(e)=>scan(e.detail||{}));
    for(const evt of ["onsen-castle-visit-changed","onsen-scenic-visit-changed","onsen-app-tab-changed","pageshow","storage"])window.addEventListener(evt,()=>setTimeout(render,0));
    document.addEventListener("visibilitychange",()=>{syncSampling();render();});
    document.addEventListener("click",(e)=>{if(e.target instanceof Element&&e.target.closest("#tripModeToggle"))setTimeout(()=>{syncSampling();render();},100);},true);
    setInterval(syncSampling,5000);syncSampling();render();
    window.OnsenTravelDomainRecoveryV728={build:BUILD,scan,pending,confirm,dismiss,render,sampleNow,diagnostics:()=>({build:BUILD,tripMode:settings().tripMode,pending:pending().length,castleReady:!!window.OnsenCastleVisits,scenicReady:!!window.OnsenScenicRuntime})};
    window.dispatchEvent(new CustomEvent("onsen-travel-domain-recovery-ready",{detail:{build:BUILD}}));
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>install().catch(console.warn),{once:true});else install().catch(console.warn);
})();