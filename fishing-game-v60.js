(() => {
  const BUILD = "v65";
  const DEBUG_FORCE_KEY = "onsenDebugForceBigFishV60";
  let mount = null;
  let rafId = null;
  let round = null;
  let biteTimer = null;
  let escapeTimer = null;

  const FISH = {
    common_carp: { name: "コイ", rarity: "N", reward: 3, weight: 38, minCm: 22, maxCm: 72, fightScale: 1.12 },
    common_minnow: { name: "オイカワ", rarity: "N", reward: 3, weight: 34, minCm: 8, maxCm: 20, fightScale: 0.72 },
    crucian_carp: { name: "フナ", rarity: "N", reward: 4, weight: 30, minCm: 12, maxCm: 42, fightScale: 0.90 },
    ugui: { name: "ウグイ", rarity: "N", reward: 4, weight: 28, minCm: 14, maxCm: 48, fightScale: 0.92 },
    tanago: { name: "タナゴ", rarity: "N", reward: 4, weight: 22, minCm: 5, maxCm: 14, fightScale: 0.62 },
    donko: { name: "ドンコ", rarity: "N", reward: 4, weight: 21, minCm: 8, maxCm: 24, fightScale: 0.78 },
    rainbow_trout: { name: "ニジマス", rarity: "R", reward: 7, weight: 18, minCm: 20, maxCm: 62, fightScale: 1.02 },
    yamame: { name: "ヤマメ", rarity: "R", reward: 8, weight: 16, minCm: 15, maxCm: 40, fightScale: 0.98 },
    ayu: { name: "アユ", rarity: "R", reward: 8, weight: 17, minCm: 12, maxCm: 32, fightScale: 0.88 },
    wakasagi: { name: "ワカサギ", rarity: "R", reward: 7, weight: 18, minCm: 7, maxCm: 18, fightScale: 0.68 },
    catfish: { name: "ナマズ", rarity: "R", reward: 10, weight: 11, minCm: 25, maxCm: 80, fightScale: 1.28 },
    kajika: { name: "カジカ", rarity: "R", reward: 9, weight: 13, minCm: 10, maxCm: 35, fightScale: 0.92 },
    hasu: { name: "ハス", rarity: "R", reward: 10, weight: 10, minCm: 15, maxCm: 35, fightScale: 1.02 },
    gigi: { name: "ギギ", rarity: "R", reward: 10, weight: 10, minCm: 16, maxCm: 42, fightScale: 1.12 },
    iwana: { name: "イワナ", rarity: "SR", reward: 14, weight: 8, minCm: 18, maxCm: 58, fightScale: 1.06 },
    amago: { name: "アマゴ", rarity: "SR", reward: 15, weight: 7, minCm: 16, maxCm: 45, fightScale: 1.00 },
    eel: { name: "ウナギ", rarity: "SR", reward: 18, weight: 6, minCm: 35, maxCm: 100, fightScale: 1.35 },
    sakura_masu: { name: "サクラマス", rarity: "SR", reward: 20, weight: 5, minCm: 30, maxCm: 70, fightScale: 1.25 },
    himemasu: { name: "ヒメマス", rarity: "SR", reward: 17, weight: 6, minCm: 22, maxCm: 55, fightScale: 1.08 },
    nigorobuna: { name: "ニゴロブナ", rarity: "SR", reward: 18, weight: 5, minCm: 18, maxCm: 45, fightScale: 1.08 },
    huchen: { name: "イトウ", rarity: "SSR", reward: 34, weight: 2.4, minCm: 55, maxCm: 145, fightScale: 1.50 },
    giant_eel: { name: "オオウナギ", rarity: "SSR", reward: 36, weight: 2.3, minCm: 70, maxCm: 170, fightScale: 1.58 },
    biwa_trout: { name: "ビワマス", rarity: "SSR", reward: 32, weight: 2.6, minCm: 35, maxCm: 75, fightScale: 1.34 },
    giant_catfish: { name: "大ナマズ", rarity: "SSR", reward: 38, weight: 2.0, minCm: 80, maxCm: 155, fightScale: 1.65 },
    smoke_fish: { name: "湯けむりヌシ", rarity: "LEGEND", reward: 70, weight: 0.85, minCm: 110, maxCm: 230, fightScale: 1.90 }
  };

  const REGION_POOLS = {
    hokkaido_tohoku: ["wakasagi", "rainbow_trout", "iwana", "ugui", "kajika", "sakura_masu", "himemasu", "huchen"],
    kanto: ["common_carp", "common_minnow", "crucian_carp", "tanago", "ugui", "yamame", "rainbow_trout", "catfish", "giant_catfish"],
    koshinetsu_hokuriku: ["iwana", "yamame", "ayu", "rainbow_trout", "ugui", "kajika", "sakura_masu", "himemasu"],
    tokai: ["ayu", "amago", "eel", "rainbow_trout", "common_carp", "crucian_carp", "catfish"],
    kinki: ["ayu", "amago", "common_carp", "crucian_carp", "hasu", "nigorobuna", "biwa_trout", "catfish"],
    chugoku_shikoku: ["amago", "ayu", "eel", "common_minnow", "crucian_carp", "gigi", "donko"],
    kyushu_okinawa: ["eel", "giant_eel", "common_carp", "crucian_carp", "ayu", "gigi", "donko", "catfish"],
    unknown: ["common_carp", "common_minnow", "crucian_carp", "ugui", "rainbow_trout", "ayu", "catfish"]
  };

  const RARITY_ORDER = { N: 1, R: 2, SR: 3, SSR: 4, LEGEND: 5 };
  const DIFFICULTY = {
    N: { hookWidth: 0.27, hookSpeed: 0.52, distance: 18, pull: 0.052, fishSpeed: 0.20, reelDamage: 23, maxTime: 12, rewardBonus: 1.00 },
    R: { hookWidth: 0.21, hookSpeed: 0.68, distance: 29, pull: 0.072, fishSpeed: 0.27, reelDamage: 21, maxTime: 16, rewardBonus: 1.06 },
    SR: { hookWidth: 0.155, hookSpeed: 0.86, distance: 47, pull: 0.105, fishSpeed: 0.36, reelDamage: 19, maxTime: 21, rewardBonus: 1.16 },
    SSR: { hookWidth: 0.108, hookSpeed: 1.04, distance: 72, pull: 0.145, fishSpeed: 0.46, reelDamage: 17, maxTime: 27, rewardBonus: 1.28 },
    LEGEND: { hookWidth: 0.076, hookSpeed: 1.23, distance: 108, pull: 0.195, fishSpeed: 0.58, reelDamage: 15, maxTime: 34, rewardBonus: 1.45 }
  };

  const RODS = {
    bamboo: { name: "竹の延べ竿", cost: 0, note: "最初の一本。扱いやすいが大物を寄せる力は弱め。", targetScale: 1.12, cursorSpeed: 0.92, pullPower: 0.88, rareBonus: 0, safeBonus: 0.02, rewardMultiplier: 1.00 },
    traveler: { name: "旅人の万能竿", cost: 70, note: "癖がなく、アワセと巻き取りを少しずつ強化。", targetScale: 1.05, cursorSpeed: 0.96, pullPower: 1.08, rareBonus: 0.02, safeBonus: 0.025, rewardMultiplier: 1.02 },
    steady: { name: "ゆったり浮子竿", cost: 160, note: "バーが広くカーソルも遅い。レア狙いより安定重視。", targetScale: 1.34, cursorSpeed: 0.78, pullPower: 0.92, rareBonus: -0.02, safeBonus: 0.055, rewardMultiplier: 1.00 },
    power: { name: "剛力竿", cost: 320, note: "バーが狭く速い代わりに、一度に魚を強く引き寄せる。", targetScale: 0.84, cursorSpeed: 1.08, pullPower: 1.52, rareBonus: 0.07, safeBonus: 0.005, rewardMultiplier: 1.08 },
    hunter: { name: "名人の細針竿", cost: 620, note: "アワセは難しいがSR以上を狙いやすく、巻き取りも強力。", targetScale: 0.71, cursorSpeed: 1.18, pullPower: 1.82, rareBonus: 0.14, safeBonus: 0.01, rewardMultiplier: 1.15 },
    master: { name: "湯けむり名竿", cost: 1100, note: "最難関。極小バーと高速カーソルの代償に最高のレア補正と引き。", targetScale: 0.62, cursorSpeed: 1.28, pullPower: 2.18, rareBonus: 0.22, safeBonus: 0.015, rewardMultiplier: 1.25 }
  };

  function waitForRuntime() {
    return new Promise((resolve, reject) => {
      let tries = 0;
      const timer = setInterval(() => {
        tries += 1;
        if (window.OnsenGameRuntime) { clearInterval(timer); resolve(window.OnsenGameRuntime); }
        else if (tries >= 200) { clearInterval(timer); reject(new Error("game runtime not ready")); }
      }, 50);
    });
  }

  function fishingMeta(state = window.OnsenGameRuntime?.loadState?.() || {}) {
    const fishing = state.fishing || {};
    const owned = new Set(Array.isArray(fishing.rodsOwned) ? fishing.rodsOwned : []);
    owned.add("bamboo");
    const equipped = owned.has(fishing.equippedRod) && RODS[fishing.equippedRod] ? fishing.equippedRod : "bamboo";
    return { owned, equipped };
  }

  function equippedRod(state) {
    const meta = fishingMeta(state);
    return { id: meta.equipped, ...RODS[meta.equipped] };
  }

  function renderBase() {
    if (!mount) return;
    const runtime = window.OnsenGameRuntime;
    const state = runtime.loadState();
    const context = runtime.getTravelContext();
    const rod = equippedRod(state);
    const caughtKinds = Object.keys(state.fishing.collection || {}).filter((id) => Number(state.fishing.collection[id] || 0) > 0).length;
    mount.innerHTML = `
      <section class="fishing-game fishing-v59 fishing-v60 fishing-v65" data-build="${BUILD}">
        <div class="fishing-head"><div><span>OFFLINE MINI GAME</span><h3>旅釣り</h3><p>魚ごとにアワセ難度と残り距離が変化。竿を選んで大物を引き寄せよう。</p></div><div class="fishing-collection"><b id="fishingCaughtKinds">${caughtKinds}</b><span>種発見</span></div></div>
        <div class="fishing-location"><div><span>フィールド</span><b id="fishingRegion">${escapeHtml(context.regionLabel)}</b></div><div><span>装備竿</span><b id="fishingEquippedRod">${escapeHtml(rod.name)}</b></div><div><span>位置ボーナス</span><b id="fishingLocationBonus">${context.tripMode && context.fresh ? (context.nearOnsen ? "温泉地付近 +RARE" : "旅行GPS +RARE") : "なし"}</b></div></div>
        <details class="fishing-rod-panel" open><summary><span>釣り竿</span><b id="fishingRodWallet">${Number(state.wallet?.yusen || 0)} 湯銭</b></summary><div class="fishing-rod-help">湯銭で購入して装備。難しい竿ほどレア魚補正と巻き取り力が高くなります。</div><div id="fishingRodShop" class="fishing-rod-shop"></div></details>
        <div id="fishingScene" class="fishing-scene" aria-label="旅釣りゲーム画面">
          <div class="fishing-sky"><div class="fishing-sun"></div><div class="fishing-mountain mountain-back"></div><div class="fishing-mountain mountain-front"></div><div class="fishing-steam steam-a"></div><div class="fishing-steam steam-b"></div></div>
          <div class="fishing-bank"></div>
          <div class="fishing-angler" aria-hidden="true"><span class="angler-hat"></span><span class="angler-head"></span><span class="angler-body"></span><span class="angler-arm"></span><span class="angler-leg leg-a"></span><span class="angler-leg leg-b"></span><span class="angler-rod"></span><span class="angler-line"></span></div>
          <div class="fishing-water-scene"><div class="water-line line-a"></div><div class="water-line line-b"></div><div class="water-line line-c"></div><div class="fishing-ripple ripple-a"></div><div class="fishing-ripple ripple-b"></div><div class="fishing-bobber"><i></i></div><div class="fish-shadow fish-shadow-a"><i></i></div><div class="fish-shadow fish-shadow-b"><i></i></div><div class="fish-shadow fish-shadow-c"><i></i></div><div id="fightFishShadow" class="fight-fish-shadow"><i></i></div></div>
          <div id="fishingHitCallout" class="fishing-hit-callout">HIT!</div>
          <div id="fishingCatchFx" class="fishing-catch-fx" aria-live="polite"><div class="catch-rays"></div><div class="catch-splash"><i></i><i></i><i></i><i></i><i></i></div><div class="catch-fish"><span class="catch-fish-body"></span><span class="catch-fish-tail"></span></div><div class="catch-copy"><span id="catchQuality">GOOD</span><strong id="catchFishName">魚</strong><em id="catchRarity">R</em><b id="catchNew">NEW!</b></div></div>
          <div id="fishingFightHud" class="fishing-fight-hud" hidden><div class="fight-title"><span>FISH FIGHT</span><strong id="fightFishName">魚</strong><em id="fightRarity">R</em></div><div class="fight-fish-meta"><b id="fightFishSize">--cm</b><span id="fightRodName">竿</span></div><div class="fight-field-track"><span class="fight-track-safe"></span><i id="fightFishMarker"></i></div><div class="fight-meter-row"><div><span>テンション</span><div class="fight-meter tension"><i id="fightTensionBar"></i><b id="fightSafeZone" class="fight-safe-zone"></b></div></div><div><span>残り距離</span><div class="fight-meter stamina"><i id="fightStaminaBar"></i></div><small id="fightDistanceText">--m</small></div></div><div id="fightHint" class="fight-hint">巻くを長押し。適正テンション中だけ魚との距離が縮まります。</div><button id="fishingReelButton" class="fishing-reel-button" type="button">巻く（長押し）</button></div>
          <div class="fishing-stage-hud"><div id="fishingPrompt" class="fishing-prompt">竿を投げて魚を狙おう</div><div class="fishing-gauge" id="fishingGauge"><div class="fishing-target" id="fishingTarget"></div><div class="fishing-marker" id="fishingMarker"></div></div><div id="fishingDifficulty" class="fishing-difficulty"></div><button id="fishingAction" class="fishing-action" type="button">キャスト</button></div>
        </div>
        <div id="fishingResult" class="fishing-result" hidden></div><div id="fishingBook" class="fishing-book"></div>
      </section>`;
    mount.querySelector("#fishingAction")?.addEventListener("click", handleAction);
    mount.querySelector("#fishingRodShop")?.addEventListener("click", handleRodShopClick);
    bindFightControls(); renderRodShop(); renderBook();
  }

  function renderRodShop() {
    const root = mount?.querySelector("#fishingRodShop"); if (!root || !window.OnsenGameRuntime) return;
    const state = window.OnsenGameRuntime.loadState(); const meta = fishingMeta(state); const wallet = Number(state.wallet?.yusen || 0);
    setText("#fishingRodWallet", `${wallet} 湯銭`); setText("#fishingEquippedRod", RODS[meta.equipped]?.name || RODS.bamboo.name);
    root.innerHTML = Object.entries(RODS).map(([id, rod]) => {
      const owned = meta.owned.has(id); const equipped = meta.equipped === id; const canBuy = wallet >= rod.cost;
      const rareText = rod.rareBonus > 0 ? `RARE +${Math.round(rod.rareBonus * 100)}%` : rod.rareBonus < 0 ? `RARE ${Math.round(rod.rareBonus * 100)}%` : "RARE ±0";
      const difficulty = rod.targetScale >= 1.2 ? "安定" : rod.targetScale < 0.75 ? "極難" : rod.targetScale < 0.9 ? "難" : "標準";
      const action = equipped ? "装備中" : owned ? "装備" : `${rod.cost} 湯銭`;
      return `<article class="fishing-rod-card${equipped ? " equipped" : ""}" data-rod-id="${id}"><div><strong>${escapeHtml(rod.name)}</strong><em>${difficulty}</em></div><p>${escapeHtml(rod.note)}</p><div class="fishing-rod-stats"><span>バー ×${rod.targetScale.toFixed(2)}</span><span>速度 ×${rod.cursorSpeed.toFixed(2)}</span><span>引力 ×${rod.pullPower.toFixed(2)}</span><span>${rareText}</span></div><button type="button" data-rod-action="${owned ? "equip" : "buy"}" ${equipped || (!owned && !canBuy) ? "disabled" : ""}>${action}</button></article>`;
    }).join("");
  }

  function handleRodShopClick(event) {
    const button = event.target instanceof Element ? event.target.closest("[data-rod-action]") : null; if (!button || round) return;
    const card = button.closest("[data-rod-id]"); const rodId = card?.dataset.rodId; const rod = RODS[rodId]; if (!rod) return;
    const runtime = window.OnsenGameRuntime; const state = runtime.loadState(); const meta = fishingMeta(state);
    if (button.dataset.rodAction === "buy") {
      if (meta.owned.has(rodId)) return; const wallet = Number(state.wallet?.yusen || 0); if (wallet < rod.cost) return;
      state.wallet.yusen = wallet - rod.cost; state.fishing.rodsOwned = [...meta.owned, rodId]; state.fishing.equippedRod = rodId;
      runtime.saveState(state, "fishing_rod_purchase"); showRodMessage(`${rod.name}を${rod.cost}湯銭で購入して装備しました。`);
    } else {
      if (!meta.owned.has(rodId)) return; state.fishing.rodsOwned = [...meta.owned]; state.fishing.equippedRod = rodId;
      runtime.saveState(state, "fishing_rod_equip"); showRodMessage(`${rod.name}を装備しました。`);
    }
    renderRodShop(); window.dispatchEvent(new Event("onsen-game-ui-refresh"));
  }

  function showRodMessage(message) {
    const result = mount?.querySelector("#fishingResult"); if (!result) return;
    result.hidden = false; result.className = "fishing-result success"; result.innerHTML = `<strong>釣り竿更新</strong><span>${escapeHtml(message)}</span>`;
  }

  function bindFightControls() {
    const reel = mount?.querySelector("#fishingReelButton"); if (!reel) return;
    const setReeling = (value, event) => {
      if (!round || round.phase !== "fight") return; round.reeling = value;
      if (event?.pointerId !== undefined && value) { try { reel.setPointerCapture(event.pointerId); } catch {} }
      reel.classList.toggle("is-reeling", value); if (value) vibrate(10); event?.preventDefault?.();
    };
    reel.addEventListener("pointerdown", (event) => setReeling(true, event));
    for (const type of ["pointerup", "pointercancel", "lostpointercapture", "pointerleave"]) reel.addEventListener(type, (event) => setReeling(false, event));
  }

  function clearTimers() { if (rafId) cancelAnimationFrame(rafId); if (biteTimer) clearTimeout(biteTimer); if (escapeTimer) clearTimeout(escapeTimer); rafId = null; biteTimer = null; escapeTimer = null; }
  function scene() { return mount?.querySelector("#fishingScene") || null; }
  function resetSceneState() {
    const node = scene(); if (!node) return;
    node.classList.remove("is-casting", "is-waiting", "is-bite", "is-catch", "is-miss", "is-fight", "fight-danger-high", "fight-danger-low", "rarity-n", "rarity-r", "rarity-sr", "rarity-ssr", "rarity-legend");
    const hud = mount?.querySelector("#fishingFightHud"); if (hud) hud.hidden = true; const action = mount?.querySelector("#fishingAction"); if (action) action.hidden = false; setText("#fishingDifficulty", "");
  }
  function handleAction() { if (!round) startRound(); else if (round.phase === "bite") hookRound(); }

  function startRound() {
    const runtime = window.OnsenGameRuntime; const consume = runtime.consumeEnergy(1); const result = mount.querySelector("#fishingResult"); const action = mount.querySelector("#fishingAction"); const prompt = mount.querySelector("#fishingPrompt");
    if (!consume.ok) { if (result) { result.hidden = false; result.className = "fishing-result warning"; result.innerHTML = `<strong>旅力が足りない</strong><span>旅行モードONで移動すると750mごとに旅力が1回復します。</span>`; } return; }
    runtime.recordFishingCast(); clearTimers(); resetSceneState(); if (result) result.hidden = true;
    const context = runtime.getTravelContext(); const state = runtime.loadState(); const rod = equippedRod(state); const forced = sessionStorage.getItem(DEBUG_FORCE_KEY) === "1";
    const fishId = chooseFish(context, forced, rod); const fish = FISH[fishId] || FISH.common_carp; const diff = DIFFICULTY[fish.rarity] || DIFFICULTY.N; const sizeCm = randomFishSize(fish);
    const tripAssist = context.tripMode && context.fresh ? 1.04 : 1; const onsenAssist = context.nearOnsen ? 1.04 : 1;
    const targetWidth = clamp(diff.hookWidth * rod.targetScale * tripAssist * onsenAssist, 0.052, 0.34); const speed = diff.hookSpeed * rod.cursorSpeed * (0.94 + Math.random() * 0.12);
    round = { phase: "waiting", context, rod, fishId, fish, diff, sizeCm, forced, marker: 0.04, direction: 1, speed, targetCenter: 0.18 + Math.random() * 0.64, targetWidth, lastTickAt: performance.now() };
    const target = mount.querySelector("#fishingTarget"); if (target) { target.style.left = `${clamp(round.targetCenter - round.targetWidth / 2, 0, 1) * 100}%`; target.style.width = `${round.targetWidth * 100}%`; }
    const node = scene(); node?.classList.add("is-casting"); if (prompt) prompt.textContent = "キャスト！ 水面を見て待とう…"; if (action) { action.disabled = true; action.textContent = "待つ…"; }
    renderRodShop(); vibrate(18);
    setTimeout(() => { if (!round || round.phase !== "waiting") return; node?.classList.remove("is-casting"); node?.classList.add("is-waiting"); }, 420);
    biteTimer = setTimeout(beginBite, 800 + Math.random() * 1200); window.dispatchEvent(new Event("onsen-game-ui-refresh"));
  }

  function beginBite() {
    if (!round || round.phase !== "waiting") return; biteTimer = null; round.phase = "bite"; round.lastTickAt = performance.now();
    const node = scene(); node?.classList.remove("is-waiting"); node?.classList.add("is-bite", `rarity-${round.fish.rarity.toLowerCase()}`);
    const prompt = mount.querySelector("#fishingPrompt"); const action = mount.querySelector("#fishingAction"); const rarity = round.fish.rarity;
    const feel = rarity === "LEGEND" ? "竿が持っていかれる…！" : rarity === "SSR" ? "ものすごく重いアタリ！" : rarity === "SR" ? "強いアタリ！" : "魚がかかった！";
    if (prompt) prompt.textContent = `${feel} 緑の範囲でアワセる！`; setText("#fishingDifficulty", `${rarity} / バー${Math.round(round.targetWidth * 100)}% / 速度×${round.speed.toFixed(2)}`);
    if (action) { action.disabled = false; action.textContent = "アワセる！"; }
    vibrate(rarity === "LEGEND" ? [50,35,80,35,100] : rarity === "SSR" ? [45,35,75] : [35,40,55]); tickBite(performance.now());
    const reactionMs = rarity === "LEGEND" ? 2600 : rarity === "SSR" ? 2800 : rarity === "SR" ? 3000 : 3300;
    escapeTimer = setTimeout(() => failRound("遅かった…魚が離れた", "浮きが沈んだらアワセよう。レア魚ほど猶予も少し短くなります。"), reactionMs);
  }

  function tickBite(now) {
    if (!round || round.phase !== "bite") return; const dt = Math.min(0.05, Math.max(0, (now - round.lastTickAt) / 1000)); round.lastTickAt = now; round.marker += round.direction * round.speed * dt;
    if (round.marker >= 0.98) { round.marker = 0.98; round.direction = -1; } else if (round.marker <= 0.02) { round.marker = 0.02; round.direction = 1; }
    const marker = mount?.querySelector("#fishingMarker"); if (marker) marker.style.left = `${round.marker * 100}%`; rafId = requestAnimationFrame(tickBite);
  }

  function hookRound() {
    if (!round || round.phase !== "bite") return; if (rafId) cancelAnimationFrame(rafId); if (escapeTimer) clearTimeout(escapeTimer); rafId = null; escapeTimer = null;
    const current = round; const distance = Math.abs(current.marker - current.targetCenter); const half = current.targetWidth / 2; const success = distance <= half; const normalized = success ? Math.max(0, 1 - distance / half) : 0;
    const quality = normalized >= 0.84 ? "PERFECT" : normalized >= 0.54 ? "GREAT" : normalized > 0 ? "GOOD" : "MISS"; const qualityScore = Math.round(normalized * 100);
    if (!success) { round = null; failRound("アワセ失敗…！", `${current.fish.rarity}の魚を逃した。緑のゾーンにマーカーを合わせよう。`); return; }
    if (current.forced) sessionStorage.removeItem(DEBUG_FORCE_KEY);
    const qualityMultiplier = quality === "PERFECT" ? 1.7 : quality === "GREAT" ? 1.35 : 1; const rarityBonus = Math.max(0, (RARITY_ORDER[current.fish.rarity] || 1) - 1);
    const reward = Math.max(1, Math.round((current.fish.reward * qualityMultiplier + rarityBonus) * current.rod.rewardMultiplier)); startFight({ ...current, quality, qualityScore, reward });
  }

  function startFight(catchData) {
    const diff = catchData.diff || DIFFICULTY[catchData.fish.rarity] || DIFFICULTY.N; const fish = catchData.fish; const sizeNorm = clamp((catchData.sizeCm - fish.minCm) / Math.max(1, fish.maxCm - fish.minCm), 0, 1);
    const sizeMultiplier = 0.82 + sizeNorm * 0.62; const maxDistance = Math.max(8, diff.distance * Number(fish.fightScale || 1) * sizeMultiplier); const safeLow = clamp(0.28 - catchData.rod.safeBonus, 0.18, 0.32); const safeHigh = clamp(0.78 + catchData.rod.safeBonus, 0.72, 0.88);
    round = { phase: "fight", fishId: catchData.fishId, fish, context: catchData.context, rod: catchData.rod, quality: catchData.quality, qualityScore: catchData.qualityScore, reward: catchData.reward, sizeCm: catchData.sizeCm, diff, sizeNorm, tension: 0.48, distanceLeft: maxDistance, maxDistance, safeLow, safeHigh, fishPos: 0.50, fishDir: Math.random() < 0.5 ? -1 : 1, reeling: false, slackTime: 0, elapsed: 0, surgeTimer: 0.6 + Math.random() * 0.9, surge: 0, lastTickAt: performance.now() };
    const node = scene(); node?.classList.remove("is-bite"); node?.classList.add("is-fight", `rarity-${fish.rarity.toLowerCase()}`);
    const hud = mount.querySelector("#fishingFightHud"); const action = mount.querySelector("#fishingAction"); const prompt = mount.querySelector("#fishingPrompt"); if (hud) hud.hidden = false; if (action) action.hidden = true;
    setText("#fightFishName", fish.name); setText("#fightRarity", fish.rarity); setText("#fightFishSize", `${catchData.sizeCm.toFixed(1)}cm`); setText("#fightRodName", catchData.rod.name);
    if (prompt) prompt.textContent = `${fish.name} ${catchData.sizeCm.toFixed(1)}cm！ 残り距離を0mまで縮めろ！`;
    const safeNode = mount.querySelector("#fightSafeZone"); if (safeNode) { safeNode.style.left = `${round.safeLow * 100}%`; safeNode.style.width = `${(round.safeHigh - round.safeLow) * 100}%`; }
    const shadow = mount.querySelector("#fightFishShadow"); if (shadow) shadow.style.transform = `translateX(-50%) scale(${(0.80 + sizeNorm * 0.55).toFixed(2)})`;
    vibrate(fish.rarity === "LEGEND" ? [80,40,120] : [55,35,80]); updateFightHud(); rafId = requestAnimationFrame(tickFight);
  }

  function tickFight(now) {
    if (!round || round.phase !== "fight") return; const dt = Math.min(0.05, Math.max(0, (now - round.lastTickAt) / 1000)); round.lastTickAt = now; round.elapsed += dt; round.surgeTimer -= dt;
    if (round.surgeTimer <= 0) { round.surgeTimer = 0.60 + Math.random() * 1.05; round.surge = (0.08 + Math.random() * 0.12) * (1 + round.sizeNorm * 0.25); if (Math.random() < 0.72) round.fishDir *= -1; vibrate(14); }
    round.surge = Math.max(0, round.surge - dt * 0.18); const speed = round.diff.fishSpeed * (1 + round.sizeNorm * 0.24) + round.surge * 1.65; round.fishPos += round.fishDir * speed * dt;
    if (round.fishPos >= 0.96) { round.fishPos = 0.96; round.fishDir = -1; } if (round.fishPos <= 0.04) { round.fishPos = 0.04; round.fishDir = 1; }
    const edgePull = Math.abs(round.fishPos - 0.5) * 2; const fishPull = round.diff.pull * (1 + round.sizeNorm * 0.34) * (0.35 + edgePull * 0.85) + round.surge; const rodTension = 0.43 + Math.max(0, round.rod.pullPower - 1) * 0.035;
    round.tension += (round.reeling ? rodTension : -0.235) * dt + fishPull * dt; round.tension = clamp(round.tension, 0, 1.08);
    const safe = round.tension >= round.safeLow && round.tension <= round.safeHigh;
    if (round.reeling && safe) { const qualityAssist = 1 + round.qualityScore / 320; const haul = round.diff.reelDamage * round.rod.pullPower * qualityAssist * dt; round.distanceLeft = Math.max(0, round.distanceLeft - haul); }
    if (round.tension < 0.07) round.slackTime += dt; else round.slackTime = Math.max(0, round.slackTime - dt * 1.8);
    if (round.tension >= 1.0) { failFight("糸が切れた！", "テンションが高すぎました。強い竿ほど巻き取りは速い一方、張りすぎにも注意。"); return; }
    if (round.slackTime >= 0.95) { failFight("バレた！", "糸が緩みすぎました。巻くを長押ししてテンションを戻そう。"); return; }
    if (round.elapsed >= round.diff.maxTime) { failFight("魚に逃げ切られた…", "適正テンション中に巻くと残り距離が減ります。強い竿なら一度に大きく縮められます。"); return; }
    if (round.distanceLeft <= 0) {
      const caught = { fishId: round.fishId, fish: round.fish, quality: round.quality, qualityScore: round.qualityScore, reward: Math.round(round.reward * round.diff.rewardBonus), context: round.context, sizeCm: round.sizeCm, rodId: round.rod.id, rodName: round.rod.name };
      round = null; clearTimers(); hideFightHud(); finalizeCatch(caught); return;
    }
    updateFightHud(); rafId = requestAnimationFrame(tickFight);
  }

  function updateFightHud() {
    if (!round || round.phase !== "fight") return; const tension = mount.querySelector("#fightTensionBar"); const distanceBar = mount.querySelector("#fightStaminaBar"); const marker = mount.querySelector("#fightFishMarker"); const shadow = mount.querySelector("#fightFishShadow"); const hint = mount.querySelector("#fightHint"); const node = scene();
    if (tension) tension.style.width = `${Math.min(100, round.tension * 100)}%`; if (distanceBar) distanceBar.style.width = `${Math.max(0, round.distanceLeft / round.maxDistance * 100)}%`; setText("#fightDistanceText", `${round.distanceLeft.toFixed(1)}m`);
    if (marker) marker.style.left = `${round.fishPos * 100}%`; if (shadow) shadow.style.left = `${10 + round.fishPos * 70}%`;
    const high = round.tension > round.safeHigh + 0.05; const low = round.tension < Math.max(0.15, round.safeLow - 0.08); node?.classList.toggle("fight-danger-high", high); node?.classList.toggle("fight-danger-low", low);
    if (hint) hint.textContent = high ? "危険：張りすぎ！ 巻くのを離す" : low ? "危険：緩みすぎ！ 巻くを長押し" : round.reeling ? `適正！ ${round.rod.name}で一気に寄せろ！` : "魚の引きを見ながら巻く";
  }

  function failFight(title, message) {
    clearTimers(); round = null; hideFightHud(); const node = scene(); node?.classList.remove("is-fight", "fight-danger-high", "fight-danger-low"); node?.classList.add("is-miss");
    const action = mount.querySelector("#fishingAction"); const prompt = mount.querySelector("#fishingPrompt"); const result = mount.querySelector("#fishingResult");
    if (action) { action.hidden = false; action.disabled = false; action.textContent = "もう一度投げる"; } if (prompt) prompt.textContent = title;
    if (result) { result.hidden = false; result.className = "fishing-result miss"; result.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span>`; }
    vibrate([30,40,30]); setTimeout(() => node?.classList.remove("is-miss"), 700); renderRodShop(); window.dispatchEvent(new Event("onsen-game-ui-refresh"));
  }

  function hideFightHud() { const hud = mount?.querySelector("#fishingFightHud"); const reel = mount?.querySelector("#fishingReelButton"); if (hud) hud.hidden = true; if (reel) reel.classList.remove("is-reeling"); }
  function failRound(title, message) {
    clearTimers(); round = null; const node = scene(); node?.classList.remove("is-bite", "is-waiting", "is-casting"); node?.classList.add("is-miss"); const action = mount.querySelector("#fishingAction"); const prompt = mount.querySelector("#fishingPrompt"); const result = mount.querySelector("#fishingResult");
    if (action) { action.hidden = false; action.disabled = false; action.textContent = "もう一度投げる"; } if (prompt) prompt.textContent = title;
    if (result) { result.hidden = false; result.className = "fishing-result miss"; result.innerHTML = `<strong>MISS</strong><span>${escapeHtml(message)}</span>`; }
    vibrate(20); setTimeout(() => node?.classList.remove("is-miss"), 700); renderRodShop(); window.dispatchEvent(new Event("onsen-game-ui-refresh"));
  }

  function finalizeCatch(data) {
    const runtime = window.OnsenGameRuntime; const recorded = runtime.recordCatch({ fishId: data.fishId, fishName: data.fish.name, rarity: data.fish.rarity, quality: data.quality, qualityScore: data.qualityScore, rewardYusen: data.reward, sizeCm: Number(data.sizeCm.toFixed(1)), rodId: data.rodId, rodName: data.rodName, regionId: data.context.regionId, regionLabel: data.context.regionLabel, nearestSpotId: data.context.nearestSpotId, nearestSpotName: data.context.nearestSpotName, locationBonus: data.context.rareBonus });
    recordBestSize(data.fishId, data.sizeCm); const firstBonus = recorded.firstCatch ? 5 : 0; if (firstBonus) runtime.addYusen(firstBonus, "fishing_first_catch");
    showCatchCinematic({ fish: data.fish, quality: data.quality, reward: data.reward + firstBonus, firstCatch: recorded.firstCatch, sizeCm: data.sizeCm, rodName: data.rodName }); renderBook(); updateCaughtKinds(); renderRodShop(); window.dispatchEvent(new Event("onsen-game-ui-refresh"));
  }

  function recordBestSize(fishId, sizeCm) {
    const runtime = window.OnsenGameRuntime; const state = runtime.loadState(); state.fishing.bestSizeCm = { ...(state.fishing.bestSizeCm || {}) }; const previous = Number(state.fishing.bestSizeCm[fishId] || 0); if (sizeCm <= previous) return;
    state.fishing.bestSizeCm[fishId] = Number(sizeCm.toFixed(1)); runtime.saveState(state, "fishing_best_size");
  }

  function showCatchCinematic({ fish, quality, reward, firstCatch, sizeCm, rodName }) {
    const node = scene(); const rarityClass = `rarity-${fish.rarity.toLowerCase()}`; resetSceneState(); node?.classList.add("is-catch", rarityClass); setText("#catchQuality", quality); setText("#catchFishName", fish.name); setText("#catchRarity", fish.rarity);
    const newNode = mount.querySelector("#catchNew"); if (newNode) newNode.hidden = !firstCatch; const action = mount.querySelector("#fishingAction"); const prompt = mount.querySelector("#fishingPrompt"); const result = mount.querySelector("#fishingResult");
    if (action) { action.hidden = false; action.disabled = true; action.textContent = "釣り上げ！"; } if (prompt) prompt.textContent = `${quality}！ ${fish.name} ${sizeCm.toFixed(1)}cmを釣り上げた！`;
    if (result) { result.hidden = false; result.className = `fishing-result success ${rarityClass}`; result.innerHTML = `<span>${quality}</span><strong>${escapeHtml(fish.name)} <em>${fish.rarity}</em> ${sizeCm.toFixed(1)}cm</strong><b>+${reward} 湯銭${firstCatch ? " ・ NEW図鑑登録" : ""}</b><small>${escapeHtml(rodName)}で捕獲</small>`; }
    vibrate(fish.rarity === "LEGEND" ? [80,50,120,50,160] : fish.rarity === "SSR" ? [60,45,100] : [40,35,60]);
    setTimeout(() => { node?.classList.remove("is-catch", rarityClass); if (action) { action.disabled = false; action.textContent = "もう一度投げる"; } }, fish.rarity === "LEGEND" ? 2300 : 1800);
  }

  function chooseFish(context, forced = false, rod = RODS.bamboo) {
    const pool = [...(REGION_POOLS[context.regionId] || REGION_POOLS.unknown)]; if (context.nearOnsen) pool.push("smoke_fish"); const unique = [...new Set(pool)];
    if (forced) { if (context.nearOnsen) return "smoke_fish"; const rare = unique.filter((id) => (RARITY_ORDER[FISH[id]?.rarity] || 0) >= 3).sort((a,b) => (RARITY_ORDER[FISH[b]?.rarity] || 0) - (RARITY_ORDER[FISH[a]?.rarity] || 0)); return rare[0] || "iwana"; }
    const candidates = unique.map((id) => {
      const fish = FISH[id]; const rarity = RARITY_ORDER[fish.rarity] || 1; let weight = Number(fish.weight || 1);
      if (rarity === 1 && rod.rareBonus > 0) weight *= Math.max(0.68, 1 - rod.rareBonus * 1.25);
      if (rarity >= 2) weight *= Math.max(0.75, 1 + rod.rareBonus * (rarity - 1) * 2.4);
      if (rarity >= 3) weight *= 1 + Number(context.rareBonus || 0) * 2.8;
      if (id === "smoke_fish") weight *= context.nearOnsen ? (0.82 + Math.max(0, rod.rareBonus) * 4.5) : 0;
      return { id, weight: Math.max(0.01, weight) };
    });
    const total = candidates.reduce((sum,item) => sum + item.weight, 0); let roll = Math.random() * total; for (const item of candidates) { roll -= item.weight; if (roll <= 0) return item.id; }
    return candidates[candidates.length - 1]?.id || "common_carp";
  }

  function randomFishSize(fish) { const min = Number(fish.minCm || 10); const max = Math.max(min + 1, Number(fish.maxCm || min + 20)); const roll = (Math.random() + Math.random()) / 2; return Number((min + (max - min) * roll).toFixed(1)); }
  function renderBook() {
    const root = mount?.querySelector("#fishingBook"); if (!root) return; const state = window.OnsenGameRuntime.loadState(); const context = window.OnsenGameRuntime.getTravelContext(); const pool = [...(REGION_POOLS[context.regionId] || REGION_POOLS.unknown)]; if (context.nearOnsen) pool.push("smoke_fish");
    root.innerHTML = `<div class="fishing-book-title"><strong>${escapeHtml(context.regionLabel)}の釣り図鑑</strong><span>現在地で出会える魚 / 全${Object.keys(FISH).length}種</span></div>`; const grid = document.createElement("div"); grid.className = "fishing-book-grid";
    for (const id of [...new Set(pool)]) { const fish = FISH[id]; const count = Number(state.fishing.collection?.[id] || 0); const best = Number(state.fishing.bestSizeCm?.[id] || 0); const item = document.createElement("div"); item.className = `fishing-fish ${count ? "caught" : "unknown"}`; item.dataset.rarity = fish.rarity; item.innerHTML = `<span>${count ? escapeHtml(fish.name) : "？？？"}</span><b>${count ? `${fish.rarity} ×${count}` : fish.rarity}</b>${count && best ? `<small>最大 ${best.toFixed(1)}cm</small>` : ""}`; grid.appendChild(item); }
    root.appendChild(grid);
  }
  function updateCaughtKinds() { const state = window.OnsenGameRuntime.loadState(); const caughtKinds = Object.keys(state.fishing.collection || {}).filter((id) => Number(state.fishing.collection[id] || 0) > 0).length; const node = mount?.querySelector("#fishingCaughtKinds"); if (node) node.textContent = String(caughtKinds); }
  function refreshContext() { if (!mount || round) return; const context = window.OnsenGameRuntime?.getTravelContext?.(); if (!context) return; setText("#fishingRegion", context.regionLabel); setText("#fishingLocationBonus", context.tripMode && context.fresh ? (context.nearOnsen ? "温泉地付近 +RARE" : "旅行GPS +RARE") : "なし"); renderRodShop(); renderBook(); updateCaughtKinds(); }
  function resetFishingUi() { clearTimers(); round = null; resetSceneState(); hideFightHud(); const action = mount?.querySelector("#fishingAction"); const prompt = mount?.querySelector("#fishingPrompt"); const result = mount?.querySelector("#fishingResult"); if (action) { action.hidden = false; action.disabled = false; action.textContent = "キャスト"; } if (prompt) prompt.textContent = "竿を投げて魚を狙おう"; if (result) result.hidden = true; renderRodShop(); renderBook(); updateCaughtKinds(); }
  function setText(selector, value) { const node = mount?.querySelector(selector); if (node) node.textContent = String(value ?? ""); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value))); }
  function vibrate(pattern) { try { navigator.vibrate?.(pattern); } catch {} }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>'\"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char])); }

  async function install(target) {
    await waitForRuntime(); mount = target || document.getElementById("fishingGameMount"); if (!mount) return false; renderBase();
    window.addEventListener("onsen-game-state-changed", (event) => { if (event.detail?.reason === "debug_reset_fishing") resetFishingUi(); else refreshContext(); });
    window.addEventListener("onsen-location-sample", refreshContext); return true;
  }

  window.OnsenFishingGame = { build: BUILD, install, refresh: refreshContext, debugResetUi: resetFishingUi, fish: FISH, rods: RODS, difficulty: DIFFICULTY };
})();