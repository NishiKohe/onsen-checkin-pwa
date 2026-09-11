(() => {
  const BUILD = "v73.1";
  let installed = false;

  const normalizeName = (value) => String(value || "").normalize("NFKC").replace(/[・･\s　]/g, "").toLowerCase();
  const shortName = (value) => String(value || "").split(/\r?\n/)[0].trim();
  const parseDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return Date.now();
    const [y,m,d] = value.split("-").map(Number);
    return new Date(y,m-1,d,12,0,0).getTime();
  };

  function catalogs() {
    return {
      onsen: (typeof spots !== "undefined" && Array.isArray(spots) ? spots : []).map((x)=>({id:String(x.id),name:String(x.name||""),prefecture:String(x.prefecture||"")})),
      castle: (window.OnsenCastleDomain?.data?.entities || []).map((x)=>({id:String(x.id),name:String(x.name||""),prefecture:String(x.prefecture||"")})),
      scenic: (window.OnsenScenicRuntime?.entries?.() || []).map((x)=>({id:String(x.id),name:shortName(x.name),prefecture:(x.prefectures||[]).join("・")}))
    };
  }

  function selectedDomain() { return document.getElementById("tripManualDomainV731")?.value || "onsen"; }
  function status(message) { const node=document.getElementById("tripManualStatus"); if(node) node.textContent=message; }

  function rebuildSuggestions() {
    const input=document.getElementById("tripManualSpot"), list=document.getElementById("tripSpotSuggestions");
    if(!input||!list)return;
    const domain=selectedDomain();
    const labels={onsen:"温泉名を入力",castle:"城名を入力",scenic:"名勝名を入力"};
    input.placeholder=labels[domain];input.value="";list.innerHTML="";
    const rows=(catalogs()[domain]||[]).slice().sort((a,b)=>a.name.localeCompare(b.name,"ja"));
    for(const row of rows){const option=document.createElement("option");option.value=row.name;option.label=row.prefecture;list.appendChild(option);}
    status("");
  }

  function findSelected() {
    const value=normalizeName(document.getElementById("tripManualSpot")?.value||"");
    if(!value)return null;
    return (catalogs()[selectedDomain()]||[]).find((x)=>normalizeName(x.name)===value)||null;
  }

  function saveOnsen(entity, checkedAt) {
    if(typeof loadCheckins!=="function"||typeof saveCheckins!=="function")return {ok:false,reason:"runtime_not_ready"};
    if(loadCheckins().some((x)=>String(x.spotId||"")===entity.id))return {ok:true,already:true};
    const list=loadCheckins();list.push({spotId:entity.id,name:entity.name,prefecture:entity.prefecture,checkedAt,accuracyM:null,zoneLabel:null,entityType:"onsen",verificationType:"self_report",verificationLevel:"recorded",recordSource:"past_visit_manual_v731",recordedAt:Date.now(),evidence:[]});saveCheckins(list);return {ok:true};
  }
  function saveCastle(entity, checkedAt) {
    const rt=window.OnsenCastleVisits;if(!rt)return {ok:false,reason:"runtime_not_ready"};
    if(rt.isVisited?.(entity.id))return {ok:true,already:true};
    return rt.registerPastVisit?.(entity.id,checkedAt)||{ok:false};
  }
  function saveScenic(entity, checkedAt) {
    const rt=window.OnsenScenicRuntime;if(!rt)return {ok:false,reason:"runtime_not_ready"};
    if(rt.isVisited?.(entity.id))return {ok:true,already:true};
    return rt.registerPastVisit?.(entity.id,{visitedAt:checkedAt,source:"trip_manual_v731"})||{ok:false};
  }

  function refresh() {
    if(typeof renderStats==="function")renderStats();if(typeof renderHistory==="function")renderHistory();if(typeof refreshSpotSource==="function")refreshSpotSource();
    window.OnsenCastleMap?.refresh?.();window.OnsenScenicMapV71?.refresh?.();window.OnsenCastleCollectionUI?.refresh?.();window.OnsenScenicCollectionUI?.refresh?.();window.OnsenDomainAchievements?.refresh?.();window.OnsenTravelDomainRecoveryV728?.render?.();
    window.dispatchEvent(new CustomEvent("onsen-trip-recovery-input-changed",{detail:{build:BUILD,type:"manual"}}));
  }

  function saveManual() {
    const entity=findSelected();if(!entity){status("候補から対象を選んでください。");return;}
    const checkedAt=parseDate(document.getElementById("tripManualDate")?.value);
    const domain=selectedDomain();
    const result=domain==="onsen"?saveOnsen(entity,checkedAt):domain==="castle"?saveCastle(entity,checkedAt):saveScenic(entity,checkedAt);
    if(!result?.ok){status("訪問記録を保存できませんでした。");return;}
    if(result.already){status(`${entity.name} はすでに訪問済みです。`);return;}
    const input=document.getElementById("tripManualSpot");if(input)input.value="";
    status(`${entity.name} を「訪問記録」として追加しました。`);refresh();
  }

  function ensureUi() {
    const input=document.getElementById("tripManualSpot");if(!input)return false;
    if(!document.getElementById("tripManualDomainV731")){
      const select=document.createElement("select");select.id="tripManualDomainV731";select.setAttribute("aria-label","過去訪問カテゴリ");select.innerHTML='<option value="onsen">♨ 温泉</option><option value="castle">🏯 名城200</option><option value="scenic">◇ 名勝</option>';input.insertAdjacentElement("beforebegin",select);select.addEventListener("change",rebuildSuggestions);
    }
    rebuildSuggestions();return true;
  }

  async function install() {
    if(installed)return;installed=true;
    for(let i=0;i<240;i+=1){if(document.getElementById("tripManualSpot")&&window.OnsenCastleVisits&&window.OnsenScenicRuntime)break;await new Promise(r=>setTimeout(r,50));}
    if(!ensureUi())return;
    document.addEventListener("click",(event)=>{const target=event.target instanceof Element?event.target.closest("#tripManualSave"):null;if(!target)return;event.preventDefault();event.stopImmediatePropagation();saveManual();},true);
    window.OnsenTripManualRecoveryV731={build:BUILD,rebuildSuggestions,saveManual,catalogs};
    window.dispatchEvent(new CustomEvent("onsen-trip-manual-recovery-ready",{detail:{build:BUILD}}));
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>install().catch(console.warn),{once:true});else install().catch(console.warn);
})();