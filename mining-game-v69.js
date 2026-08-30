(() => {
  const BUILD = "v69.1", SWINGS_PER_RUN = 6, BASE_SPEED = 0.82;
  let mount = null, rafId = null, activeTab = "mine", run = null, lastFrame = 0;
  const MATERIAL_ORDER = ["stone","copper","coal","iron","silver","gold","crystal"];
  const MATERIAL_WEIGHTS = { stone: 42, copper: 31, coal: 23, iron: 12, silver: 4.6, gold: 1.35, crystal: 0.24 };
  const RARITY_MULT = { stone: 0.8, copper: 0.85, coal: 0.85, iron: 2.0, silver: 4.0, gold: 7.0, crystal: 11.0 };
  const runtime = () => window.OnsenProgressionRuntime, gameRuntime = () => window.OnsenGameRuntime;
  const esc = (value) => String(value ?? "").replace(/[&<>'\"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  const clamp = (v,min,max) => Math.max(min,Math.min(max,v));

  async function waitForRuntimes(){for(let i=0;i<200;i+=1){if(runtime()&&gameRuntime())return true;await new Promise((r)=>setTimeout(r,30));}throw new Error("mining runtimes not ready");}
  function materialName(id){return runtime()?.materials?.[id]?.name||id;}
  function rarity(id){return runtime()?.materials?.[id]?.rarity||"N";}
  function stateSummary(){const state=runtime().loadState();return MATERIAL_ORDER.map((id)=>({id,count:Number(state.materials?.[id]||0)}));}
  function selectedPickaxeId(){const state=runtime().loadState();return runtime().pickaxes?.[state.mining?.selectedPickaxeId]?state.mining.selectedPickaxeId:"wooden";}
  function selectedPickaxe(){return runtime().effectivePickaxe(selectedPickaxeId());}
  function exploration(){return runtime().explorationProgress?.()||{nationalTreasures:0,scenicSites:0,level:0,rarePct:0,deepMaterialPct:0,sourceReady:false};}
  function comboRarePct(combo,pickaxe){const c=Math.max(0,Number(combo||0));if(c<2)return 0;const table=[0,0,.035,.075,.13,.20,.29];return Number(table[Math.min(6,c)]||.29)*Number(pickaxe?.comboPower||1);}
  function currentRareBonus(pickaxe=selectedPickaxe(),combo=0,quality=null){const context=gameRuntime().getTravelContext(),equip=runtime().combatBonuses();let bonus=Number(context.rareBonus||0)+Number(equip.miningRarePct||0)+Number(pickaxe?.rarePct||0)+comboRarePct(combo,pickaxe);if(quality==="perfect")bonus+=.18;else if(quality==="good")bonus+=.05;return clamp(bonus,0,.95);}

  function pickMaterial(quality,combo,pickaxe){
    const context=gameRuntime().getTravelContext(),growth=exploration(),bonus=currentRareBonus(pickaxe,combo,quality);
    const pool=MATERIAL_ORDER.map((id)=>{
      const material=runtime().materials?.[id]||{},depth=Number(material.depth||0);
      let weight=MATERIAL_WEIGHTS[id],mult=RARITY_MULT[id]||1;
      if(mult>1)weight*=1+bonus*mult;else weight*=Math.max(.25,1-bonus*(1-mult));
      if(depth>=2)weight*=1+Number(growth.deepMaterialPct||0)*(depth-1)*.42;
      if(id==="crystal"&&context.nearOnsen)weight*=1.8;
      if(id==="silver"&&context.regionId==="koshinetsu_hokuriku")weight*=1.25;
      if(id==="gold"&&context.regionId==="kyushu_okinawa")weight*=1.18;
      return{id,weight};
    });
    const total=pool.reduce((s,i)=>s+i.weight,0);let roll=Math.random()*total;
    for(const item of pool){roll-=item.weight;if(roll<=0)return item.id;}return"stone";
  }
  function rollYield(quality,combo,pickaxe){
    if(quality==="miss")return Math.random()<.28?{stone:1}:{};
    let rolls=quality==="perfect"?2:1;
    if(combo>=3&&Math.random()<Math.min(.80,.24+combo*.07))rolls+=1;
    if(combo>=5)rolls+=1;
    if(Math.random()<Number(pickaxe?.extraRollPct||0))rolls+=1;
    const result={};
    for(let i=0;i<rolls;i+=1){const id=pickMaterial(quality,combo,pickaxe);let qty=1;if(quality==="perfect"&&Math.random()<.28)qty+=1;if(combo>=4&&Math.random()<Math.min(.55,.08*combo))qty+=1;result[id]=Number(result[id]||0)+qty;}
    return result;
  }
  function addYield(target,gain){for(const[id,amount]of Object.entries(gain||{}))target[id]=Number(target[id]||0)+Number(amount||0);}
  function targetForSwing(index,pickaxe){const base=clamp(.28-index*.022,.16,.28),width=clamp(base*Number(pickaxe?.targetScale||1),.15,.38),center=width/2+.04+Math.random()*Math.max(.08,.92-width);return{center,width};}

  function startRun(){
    const pickaxeId=selectedPickaxeId(),purchase=runtime().purchasePickaxe(pickaxeId);
    if(!purchase?.ok){showMessage(purchase?.reason==="not_enough_yusen"?`湯銭が足りません。${purchase.cost||0}湯銭必要です。`:"つるはしを購入できません。","warn");return;}
    const pickaxe=purchase.pickaxe,target=targetForSwing(0,pickaxe);
    run={swingsLeft:SWINGS_PER_RUN,swingIndex:0,cursor:.06,dir:1,speed:BASE_SPEED*Number(pickaxe.speedScale||1),targetCenter:target.center,targetWidth:target.width,yield:{},perfects:0,goods:0,misses:0,combo:0,maxCombo:0,lastResult:null,pickaxeId,pickaxe,startedAt:Date.now(),completed:false};
    activeTab="mine";render();startLoop();
  }
  function startLoop(){stopLoop();lastFrame=performance.now();const frame=(now)=>{if(!run||run.completed)return;const dt=Math.min(.05,Math.max(0,(now-lastFrame)/1000));lastFrame=now;run.cursor+=run.dir*run.speed*dt;if(run.cursor>=.98){run.cursor=.98;run.dir=-1;}if(run.cursor<=.02){run.cursor=.02;run.dir=1;}renderCursor();rafId=requestAnimationFrame(frame);};rafId=requestAnimationFrame(frame);}
  function stopLoop(){if(rafId)cancelAnimationFrame(rafId);rafId=null;}
  function strike(){
    if(!run){startRun();return;}
    const distance=Math.abs(run.cursor-run.targetCenter),half=run.targetWidth/2,ratio=half>0?distance/half:2,quality=ratio<=.26?"perfect":ratio<=1?"good":"miss";
    if(quality==="miss")run.combo=0;else run.combo+=1;
    run.maxCombo=Math.max(run.maxCombo,run.combo);
    const gain=rollYield(quality,run.combo,run.pickaxe);runtime().addMaterials(gain,`mining_${quality}`);addYield(run.yield,gain);
    if(quality==="perfect")run.perfects+=1;else if(quality==="good")run.goods+=1;else run.misses+=1;
    run.lastResult={quality,gain,combo:run.combo};run.swingsLeft-=1;run.swingIndex+=1;
    try{navigator.vibrate?.(quality==="perfect"?[35,20,60]:quality==="good"?25:12);}catch{}
    if(run.swingsLeft<=0){const summary={swings:SWINGS_PER_RUN,perfects:run.perfects,goods:run.goods,misses:run.misses,yield:{...run.yield},regionId:gameRuntime().getTravelContext().regionId,pickaxeId:run.pickaxeId,maxCombo:run.maxCombo};runtime().recordMiningRun(summary);stopLoop();run.completed=true;render();return;}
    const target=targetForSwing(run.swingIndex,run.pickaxe);run.targetCenter=target.center;run.targetWidth=target.width;run.speed=(BASE_SPEED+run.swingIndex*.055)*Number(run.pickaxe.speedScale||1);render();
  }

  function qualityLabel(result){if(!result)return"狙いを定めてタップ";const text=result.quality==="perfect"?"PERFECT!":result.quality==="good"?"GOOD":"MISS",combo=result.combo>=2?`　${result.combo} COMBO!`:"",gain=Object.entries(result.gain||{}).map(([id,qty])=>`${materialName(id)} ×${qty}`).join(" / ");return gain?`${text}${combo}　${gain}`:`${text}${combo}　空振り`;}
  function materialChips(){return stateSummary().map(({id,count})=>`<div class="mining-material" data-rarity="${rarity(id)}"><span>${esc(materialName(id))}</span><b>${count}</b></div>`).join("");}
  function pickaxeCards(){
    const rt=runtime(),selected=selectedPickaxeId(),wallet=Number(gameRuntime().loadState().wallet?.yusen||0),locked=!!run&&!run.completed;
    return Object.values(rt.pickaxes).map((base)=>{const p=rt.effectivePickaxe(base.id),isSelected=selected===base.id,affordable=wallet>=base.costYusen;return `<button type="button" class="mining-pickaxe-card ${isSelected?"selected":""}" data-pickaxe-id="${esc(base.id)}" ${locked?"disabled":""}><span>GRADE ${base.grade}</span><strong>${esc(base.name)}</strong><small>${base.costYusen} 湯銭 / 1 RUN</small><em>成功 ${Math.round((p.targetScale-1)*100)>=0?"+":""}${Math.round((p.targetScale-1)*100)}% ・ RARE +${Math.round(p.rarePct*100)}%</em><i>${locked?"使用中":isSelected?(affordable?"選択中":"湯銭不足"):"選ぶ"}</i></button>`;}).join("");
  }
  function renderMine(){
    const context=gameRuntime().getTravelContext(),gameState=gameRuntime().loadState(),growth=exploration(),pickaxe=run?.pickaxe||selectedPickaxe(),rare=Math.round(currentRareBonus(pickaxe,run?.combo||0)*100),last=run?.lastResult||null,runStatus=!run?"READY":run.completed?"BROKEN":`${SWINGS_PER_RUN-run.swingsLeft+1}/${SWINGS_PER_RUN}`,targetLeft=run?(run.targetCenter-run.targetWidth/2)*100:36,targetWidth=run?run.targetWidth*100:24,cursorLeft=run?run.cursor*100:8,resultClass=last?.quality||"",combo=run?.combo||0;
    return `<section class="mining-panel"><div class="mining-status-row mining-status-v691"><div><span>湯銭</span><b>${Number(gameState.wallet?.yusen||0)}</b></div><div><span>COMBO</span><b>${combo?`×${combo}`:"—"}</b></div><div><span>RARE補正</span><b>+${rare}%</b></div><div><span>探索格</span><b>Lv.${growth.level}</b></div></div><div class="mining-exploration-note"><span>国宝 ${growth.nationalTreasures} / 景勝地 ${growth.scenicSites}</span><b>${growth.sourceReady?"チェックイン成長中":"将来の国宝・景勝地チェックインと連動予定"}</b></div><div class="mining-pickaxe-shop"><div class="mining-pickaxe-title"><strong>使い切りつるはし</strong><span>採掘1回で破損</span></div><div class="mining-pickaxe-grid">${pickaxeCards()}</div></div><div class="mining-scene ${run?.completed?"complete":""}"><div class="mining-cave-back"></div><div class="mining-rock"><i></i><i></i><i></i></div><div class="mining-run-label"><span>${esc(run?.pickaxe?.name||pickaxe.name)}</span><b>${runStatus}</b></div>${combo>=2?`<div class="mining-combo-badge">×${combo}<small>COMBO</small></div>`:""}<div class="mining-timing"><div class="mining-target" style="left:${targetLeft}%;width:${targetWidth}%"></div><div id="miningCursor" class="mining-cursor" style="left:${cursorLeft}%"></div></div><div class="mining-callout ${resultClass}">${esc(qualityLabel(last))}</div>${run?.completed?`<div class="mining-run-result"><strong>採掘完了</strong><span>${Object.entries(run.yield).map(([id,qty])=>`${esc(materialName(id))}×${qty}`).join(" ・ ")||"採掘物なし"}</span><small>${esc(run.pickaxe.name)}は壊れた / 最大 ${run.maxCombo} COMBO</small></div>`:""}</div><button id="miningStrikeButton" class="mining-main-button" type="button">${!run||run.completed?`${pickaxe.costYusen}湯銭で ${esc(pickaxe.name)} を購入して開始`:"つるはしを振る"}</button><p class="mining-help">GOOD/PERFECTを連続させるとコンボ上昇。3コンボから追加抽選、5コンボ以上で追加ドロップが強化されます。MISSでコンボは途切れます。</p><div class="mining-material-grid">${materialChips()}</div></section>`;
  }

  function bonusText(b={}){const parts=[];if(b.attackPct)parts.push(`攻撃 +${Math.round(b.attackPct*100)}%`);if(b.hpPct)parts.push(`HP +${Math.round(b.hpPct*100)}%`);if(b.senkoPct)parts.push(`戦功 +${Math.round(b.senkoPct*100)}%`);if(b.miningRarePct)parts.push(`採掘RARE +${Math.round(b.miningRarePct*100)}%`);return parts.join(" / ")||"効果なし";}
  function costMarkup(recipe,state){return Object.entries(recipe.materials).map(([id,need])=>{const have=Number(state.materials?.[id]||0);return`<span class="${have>=need?"ok":"short"}">${esc(materialName(id))} ${have}/${need}</span>`;}).join("");}
  function renderForge(){const rt=runtime(),state=rt.loadState(),slots=["weapon","helmet","armor","charm"],equipped=slots.map((slot)=>{const id=state.equipped?.[slot],item=id?rt.recipes[id]:null;return`<div class="forge-slot"><span>${esc(rt.slotLabels[slot])}</span><b>${item?esc(item.name):"未装備"}</b><small>${item?esc(bonusText(item.bonuses)):"—"}</small></div>`;}).join(""),recipes=Object.values(rt.recipes).map((recipe)=>{const owned=Number(state.crafted?.[recipe.id]||0)>0,equippedNow=state.equipped?.[recipe.slot]===recipe.id,craftable=rt.canCraft(recipe.id,state);return`<article class="forge-recipe" data-rarity="${esc(recipe.rarity)}" data-recipe-id="${esc(recipe.id)}"><div class="forge-recipe-head"><div><span>${esc(rt.slotLabels[recipe.slot])}</span><strong>${esc(recipe.name)}</strong></div><b>${esc(recipe.rarity)}</b></div><p>${esc(recipe.note)}</p><div class="forge-bonus">${esc(bonusText(recipe.bonuses))}</div><div class="forge-cost">${costMarkup(recipe,state)}</div><div class="forge-actions"><button type="button" data-forge-action="craft" ${craftable?"":"disabled"}>鍛造${owned?"（追加）":""}</button><button type="button" data-forge-action="equip" ${owned&&!equippedNow?"":"disabled"}>${equippedNow?"装備中":"装備"}</button></div></article>`;}).join(""),total=rt.combatBonuses(state);return`<section class="forge-panel"><div class="forge-total"><span>装備総効果</span><strong>${esc(bonusText(total))}</strong></div><div class="forge-slots">${equipped}</div><div class="mining-material-grid forge-materials">${materialChips()}</div><div class="forge-recipes">${recipes}</div><p class="mining-help">装備効果は戦陣へ即時反映。RogueRPGも同じ装備ランタイムを使用します。</p></section>`;}
  function render(){if(!mount)return;mount.innerHTML=`<section class="mining-game" data-build="${BUILD}"><header class="mining-head"><div><span>TRAVEL MINING & FORGE</span><h3>旅採掘</h3><p>湯銭でつるはしを買い、コンボで希少鉱石を掘り当てる。</p></div><div class="mining-head-stat"><span>採掘</span><b>${Number(runtime().loadState().mining?.runs||0)}</b><small>回</small></div></header><div class="mining-tabs"><button type="button" data-mining-tab="mine" class="${activeTab==="mine"?"active":""}">⛏ 採掘場</button><button type="button" data-mining-tab="forge" class="${activeTab==="forge"?"active":""}">⚒ 鍛冶場</button></div><div id="miningMessage" class="mining-message" hidden></div><div id="miningContent">${activeTab==="mine"?renderMine():renderForge()}</div></section>`;bindLocal();if(run&&!run.completed)startLoop();}
  function renderCursor(){const cursor=mount?.querySelector("#miningCursor");if(cursor&&run)cursor.style.left=`${run.cursor*100}%`;}
  function showMessage(text,kind=""){const node=mount?.querySelector("#miningMessage");if(!node)return;node.hidden=false;node.className=`mining-message ${kind}`;node.textContent=text;clearTimeout(showMessage._timer);showMessage._timer=setTimeout(()=>{if(node)node.hidden=true;},1800);}
  function bindLocal(){
    mount?.querySelectorAll("[data-mining-tab]").forEach((button)=>button.addEventListener("click",()=>{activeTab=button.dataset.miningTab||"mine";render();}));
    mount?.querySelectorAll("[data-pickaxe-id]").forEach((button)=>button.addEventListener("click",()=>{if(run&&!run.completed)return;const result=runtime().selectPickaxe(button.dataset.pickaxeId);if(result?.ok){run=null;render();}}));
    mount?.querySelector("#miningStrikeButton")?.addEventListener("click",()=>{if(!run||run.completed){run=null;startRun();}else strike();});
    mount?.querySelectorAll("[data-forge-action]").forEach((button)=>button.addEventListener("click",()=>{const card=button.closest("[data-recipe-id]"),recipeId=card?.dataset.recipeId;if(!recipeId)return;const action=button.dataset.forgeAction,result=action==="craft"?runtime().craft(recipeId):runtime().equip(recipeId);if(!result?.ok){showMessage(result?.reason==="materials"?"素材が足りません。":"操作できません。","warn");return;}render();showMessage(action==="craft"?`${result.recipe.name}を鍛造しました。`:`${result.recipe.name}を装備しました。`,"ok");}));
  }
  async function install(target){await waitForRuntimes();mount=target||document.getElementById("miningGameMount");if(!mount)return false;render();window.addEventListener("onsen-progression-state-changed",()=>{if(!mount||mount.hidden)return;if(run&&!run.completed&&activeTab==="mine")return;render();});window.addEventListener("onsen-game-state-changed",()=>{if(mount&&!mount.hidden&&activeTab==="mine"&&(!run||run.completed))render();});window.addEventListener("onsen-mining-exploration-changed",()=>{if(mount&&!mount.hidden&&(!run||run.completed))render();});return true;}
  function refresh(){if(mount)render();}
  function stop(){stopLoop();}
  window.OnsenMiningGame={build:BUILD,install,refresh,stop,startRun};
})();
