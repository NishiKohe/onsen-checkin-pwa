(() => {
  const BUILD = "v68";
  const STATE_KEY = "castleVisitsV1";

  function storage() { return window.OnsenUserStorage || null; }
  function readRaw() {
    const raw = storage()?.readUserItem?.(STATE_KEY);
    if (raw != null) { try { return JSON.parse(raw); } catch {} }
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || "null"); } catch { return null; }
  }
  function writeRaw(value) {
    const text = JSON.stringify(value);
    if (storage()?.writeUserItem) storage().writeUserItem(STATE_KEY, text);
    else localStorage.setItem(STATE_KEY, text);
  }
  function defaultState() { return { schemaVersion: 2, records: [], updatedAt: Date.now() }; }
  function normalizeState(raw) {
    const base = defaultState();
    const state = raw && typeof raw === "object" ? raw : {};
    const records = Array.isArray(state.records) ? state.records.filter((record) => record?.entityId || record?.spotId) : [];
    return { ...base, ...state, schemaVersion: 2, records };
  }
  function loadState() { return normalizeState(readRaw()); }
  function saveState(state, reason = "update", detail = {}) {
    const next = normalizeState(state); next.updatedAt = Date.now(); writeRaw(next);
    window.dispatchEvent(new CustomEvent("onsen-castle-visit-changed", { detail: { build: BUILD, reason, ...detail, state: next } }));
    return next;
  }
  function list() { return loadState().records.slice(); }
  function recordsFor(castleId) { const id = String(castleId || ""); return list().filter((record) => String(record.entityId || record.spotId || "") === id); }
  function isStrictRecord(record) { return record?.verificationLevel === "onsite" && String(record?.verificationType || "").startsWith("gps_"); }
  function isVisited(castleId) { return recordsFor(castleId).length > 0; }
  function isStrictGps(castleId) { return recordsFor(castleId).some(isStrictRecord); }
  function uniqueVisitedIds() { return [...new Set(list().map((record) => String(record.entityId || record.spotId || "")).filter(Boolean))]; }
  function strictGpsIds() { return [...new Set(list().filter(isStrictRecord).map((record) => String(record.entityId || record.spotId || "")).filter(Boolean))]; }

  function registerPastVisit(castleId, occurredAt = Date.now()) {
    const id = String(castleId || ""); if (!id) return { ok: false, reason: "invalid_castle" };
    const state = loadState();
    if (state.records.some((record) => String(record.entityId || record.spotId || "") === id && record.recordSource === "castle_past_visit")) return { ok: true, already: true, state };
    const record = { categoryId:"castle", entityType:"castle", entityId:id, spotId:id, checkedAt:Number(occurredAt || Date.now()), verificationLevel:"recorded", verificationType:"self_report", recordSource:"castle_past_visit", evidence:[{ type:"manual_past_visit", recordedAt:Date.now() }] };
    state.records.push(record);
    return { ok:true, record, state:saveState(state,"past_visit_registered",{ castleId:id, strictGps:false }) };
  }

  function removePastVisit(castleId) {
    const id=String(castleId||""),state=loadState(),before=state.records.length;
    state.records=state.records.filter((record)=>!(String(record.entityId||record.spotId||"")===id&&record.recordSource==="castle_past_visit"));
    if(state.records.length===before)return {ok:false,reason:"not_found",state};
    return {ok:true,state:saveState(state,"past_visit_removed",{castleId:id,strictGps:isStrictGps(id)})};
  }

  function registerStrictGpsVisit(castleId,payload={}) {
    const id=String(castleId||"");if(!id)return {ok:false,reason:"invalid_castle"};if(isStrictGps(id))return {ok:true,already:true,state:loadState()};
    const state=loadState(),lat=Number.isFinite(Number(payload.lat))?Number(payload.lat):null,lng=Number.isFinite(Number(payload.lng))?Number(payload.lng):null,accuracyM=Number.isFinite(Number(payload.accuracyM))?Number(payload.accuracyM):null,distanceM=Number.isFinite(Number(payload.distanceM))?Math.max(0,Number(payload.distanceM)):null,radiusM=Number.isFinite(Number(payload.radiusM))?Math.max(0,Number(payload.radiusM)):null,coordinateSource=payload.coordinateSource?String(payload.coordinateSource):null,coordinateVerification=payload.coordinateVerification?String(payload.coordinateVerification):null;
    const record={categoryId:"castle",entityType:"castle",entityId:id,spotId:id,checkedAt:Number(payload.checkedAt||Date.now()),verificationLevel:"onsite",verificationType:"gps_manual",recordSource:"castle_checkin_button",lat,lng,accuracyM,distanceM,radiusM,coordinateSource,coordinateVerification,evidence:[{type:"gps",recordedAt:Date.now(),accuracyM,distanceM,radiusM,coordinateSource,coordinateVerification,freshFix:payload.freshFix===true}]};
    state.records.push(record);
    return {ok:true,record,state:saveState(state,"strict_gps_visit",{castleId:id,strictGps:true,accuracyM,distanceM,radiusM,freshFix:payload.freshFix===true})};
  }

  function knownCastleIds(){return new Set((window.OnsenCastleDomain?.data?.entities||[]).map((castle)=>String(castle.id)).filter(Boolean));}
  function validVisitedIds(){const known=knownCastleIds();return uniqueVisitedIds().filter((id)=>!known.size||known.has(id));}
  function validStrictIds(){const known=knownCastleIds();return strictGpsIds().filter((id)=>!known.size||known.has(id));}
  function progress() {
    const total=Math.max(100,Number(window.OnsenCastleDomain?.data?.entities?.length||0)||200);
    const visited=validVisitedIds().length,strict=validStrictIds().length;
    const attackBonus=Math.min(0.50,0.05*Math.sqrt(visited));
    const originalVisited=validVisitedIds().filter((id)=>Number(window.OnsenCastleDomain?.data?.entities?.find((c)=>c.id===id)?.japan100No||0)<=100).length;
    const continuedVisited=Math.max(0,visited-originalVisited);
    return {visited,total,strictGps:strict,attackBonus,originalVisited,continuedVisited,originalTotal:100,continuedTotal:Math.max(0,total-100)};
  }

  async function install(){for(let i=0;i<300;i+=1){if(window.OnsenUserStorage&&window.OnsenCastleDomain)break;await new Promise((resolve)=>setTimeout(resolve,30));}window.OnsenCastleVisits={build:BUILD,stateKey:STATE_KEY,loadState,saveState,list,recordsFor,isVisited,isStrictGps,uniqueVisitedIds,strictGpsIds,registerPastVisit,removePastVisit,registerStrictGpsVisit,progress};window.dispatchEvent(new CustomEvent("onsen-castle-visits-ready",{detail:{build:BUILD,progress:progress()}}));}
  install().catch((error)=>console.warn("castle visit runtime v68 init failed",error));
})();