(function(root){
'use strict';
const SOURCE='developer_history_override';
function plan(save,visits,catalog){
 if(save?.format!=='onsen-checkin-user-save'||!save.data||typeof save.data!=='object')throw Error('アプリのバックアップ形式ではありません');
 const next=JSON.parse(JSON.stringify(save)),known=new Map(catalog.map(r=>[`${r.domain}:${r.id}`,r])),unique=new Map();
 for(const v of visits){const k=`${v.domain}:${v.id}`;if(!known.has(k))throw Error(`未登録の地点: ${k}`);unique.set(k,known.get(k));}
 const now=Date.now(),d=next.data;d.checkins=d.checkins||[];d.castleVisitsV1=d.castleVisitsV1||{schemaVersion:2,records:[]};d.scenicVisitStateV1=d.scenicVisitStateV1||{schemaVersion:2,visited:{}};
 const changes=[];
 for(const r of unique.values()){
 const base={entityType:r.domain,categoryId:r.domain,entityId:r.id,spotId:r.id,name:r.name,prefecture:r.prefecture,checkedAt:now,recordedAt:now,visitDate:null,visitDateUnknown:true,verificationLevel:'onsite',verificationType:'gps_manual',recordSource:SOURCE,developerOverride:true,gpsMeasured:false,lat:null,lng:null,accuracyM:null,evidence:[{type:'developer_past_visit_override',recordedAt:now}]};
 if(r.domain==='onsen'){
 if(d.checkins.some(x=>String(x.spotId||x.entityId)===r.id&&['gps_manual','gps_legacy','gps_recovered'].includes(x.verificationType)))continue;
 d.checkins.push(base);
 }else if(r.domain==='castle'){
 if(d.castleVisitsV1.records.some(x=>String(x.entityId||x.spotId)===r.id&&x.verificationLevel==='onsite'&&String(x.verificationType).startsWith('gps_')))continue;
 d.castleVisitsV1.records.push(base);d.castleVisitsV1.updatedAt=now;
 }else{
 const prior=d.scenicVisitStateV1.visited[r.id];if(prior?.verificationType==='gps_scenic')continue;
 d.scenicVisitStateV1.visited[r.id]={...prior,...base,visitedAt:prior?.visitedAt||now,verificationType:'gps_scenic',specialScenic:r.specialScenic===true,source:SOURCE};d.scenicVisitStateV1.updatedAt=now;
 }
 changes.push(r);
 }
 return {save:next,changes};
}
function apply(win,visits,catalog){
 const store=win.OnsenUserStorage,before=store.exportCurrentUserData(),profile=store.getCurrentProfileId(),result=plan(before,visits,catalog);
 try{
 if(store.getCurrentProfileId()!==profile)throw Error('ユーザーが切り替わりました');
 if(result.changes.some(r=>r.domain==='onsen'))win.saveCheckins(result.save.data.checkins);
 for(const r of result.changes.filter(r=>r.domain==='castle')){const state=win.OnsenCastleVisits.loadState();state.records.push(result.save.data.castleVisitsV1.records.find(x=>x.entityId===r.id&&x.recordSource===SOURCE));win.OnsenCastleVisits.saveState(state,'developer_history_override',{castleId:r.id,strictGps:true});}
 if(result.changes.some(r=>r.domain==='scenic'))win.OnsenScenicRuntime.saveState(result.save.data.scenicVisitStateV1,'developer_history_override');
 return result;
 }catch(e){store.importCurrentUserData(before);throw e;}
}
const api={plan,apply,SOURCE};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DeveloperVisitOverride=api;
})(typeof window==='undefined'?globalThis:window);
