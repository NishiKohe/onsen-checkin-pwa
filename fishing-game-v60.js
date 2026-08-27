(() => {
  const BUILD = "v60";
  const DEBUG_FORCE_KEY = "onsenDebugForceBigFishV60";
  let mount = null;
  let rafId = null;
  let round = null;
  let biteTimer = null;
  let escapeTimer = null;

  const FISH = {
    common_carp: { name: "コイ", rarity: "N", reward: 3, weight: 44 },
    common_minnow: { name: "オイカワ", rarity: "N", reward: 3, weight: 36 },
    rainbow_trout: { name: "ニジマス", rarity: "R", reward: 7, weight: 20 },
    yamame: { name: "ヤマメ", rarity: "R", reward: 8, weight: 18 },
    iwana: { name: "イワナ", rarity: "SR", reward: 14, weight: 10 },
    ayu: { name: "アユ", rarity: "R", reward: 8, weight: 18 },
    amago: { name: "アマゴ", rarity: "SR", reward: 15, weight: 9 },
    wakasagi: { name: "ワカサギ", rarity: "R", reward: 7, weight: 20 },
    huchen: { name: "イトウ", rarity: "SSR", reward: 34, weight: 3 },
    eel: { name: "ウナギ", rarity: "SR", reward: 18, weight: 7 },
    giant_eel: { name: "オオウナギ", rarity: "SSR", reward: 36, weight: 3 },
    biwa_trout: { name: "ビワマス", rarity: "SSR", reward: 32, weight: 3 },
    smoke_fish: { name: "湯けむりヌシ", rarity: "LEGEND", reward: 70, weight: 1 }
  };

  const REGION_POOLS = {
    hokkaido_tohoku: ["wakasagi", "rainbow_trout", "iwana", "huchen"],
    kanto: ["common_carp", "common_minnow", "yamame", "rainbow_trout"],
    koshinetsu_hokuriku: ["iwana", "yamame", "ayu", "rainbow_trout"],
    tokai: ["ayu", "amago", "eel", "rainbow_trout"],
    kinki: ["ayu", "amago", "common_carp", "biwa_trout"],
    chugoku_shikoku: ["amago", "ayu", "eel", "common_minnow"],
    kyushu_okinawa: ["eel", "giant_eel", "common_carp", "ayu"],
    unknown: ["common_carp", "common_minnow", "rainbow_trout", "ayu"]
  };

  const RARITY_ORDER = { N: 1, R: 2, SR: 3, SSR: 4, LEGEND: 5 };
  const FIGHT_PARAMS = {
    SR: { stamina: 44, pull: 0.10, fishSpeed: 0.34, reelDamage: 17, bonus: 1.15 },
    SSR: { stamina: 66, pull: 0.14, fishSpeed: 0.42, reelDamage: 15, bonus: 1.25 },
    LEGEND: { stamina: 92, pull: 0.18, fishSpeed: 0.52, reelDamage: 13, bonus: 1.40 }
  };

  function waitForRuntime() {
    return new Promise((resolve, reject) => {
      let tries = 0;
      const timer = setInterval(() => {
        tries += 1;
        if (window.OnsenGameRuntime) {
          clearInterval(timer);
          resolve(window.OnsenGameRuntime);
        } else if (tries >= 200) {
          clearInterval(timer);
          reject(new Error("game runtime not ready"));
        }
      }, 50);
    });
  }

  function renderBase() {
    if (!mount) return;
    const runtime = window.OnsenGameRuntime;
    const state = runtime.loadState();
    const context = runtime.getTravelContext();
    const caughtKinds = Object.keys(state.fishing.collection || {}).filter((id) => Number(state.fishing.collection[id] || 0) > 0).length;

    mount.innerHTML = `
      <section class="fishing-game fishing-v59 fishing-v60" data-build="${BUILD}">
        <div class="fishing-head">
          <div>
            <span>OFFLINE MINI GAME</span>
            <h3>旅釣り</h3>
            <p>大物はアワセた後が本番。糸のテンションを保って釣り上げよう。</p>
          </div>
          <div class="fishing-collection"><b id="fishingCaughtKinds">${caughtKinds}</b><span>種発見</span></div>
        </div>

        <div class="fishing-location">
          <div><span>フィールド</span><b id="fishingRegion">${escapeHtml(context.regionLabel)}</b></div>
          <div><span>位置ボーナス</span><b id="fishingLocationBonus">${context.tripMode && context.fresh ? (context.nearOnsen ? "温泉地付近 +RARE" : "旅行GPS +RARE") : "なし"}</b></div>
        </div>

        <div id="fishingScene" class="fishing-scene" aria-label="旅釣りゲーム画面">
          <div class="fishing-sky">
            <div class="fishing-sun"></div>
            <div class="fishing-mountain mountain-back"></div>
            <div class="fishing-mountain mountain-front"></div>
            <div class="fishing-steam steam-a"></div>
            <div class="fishing-steam steam-b"></div>
          </div>
          <div class="fishing-bank"></div>
          <div class="fishing-angler" aria-hidden="true">
            <span class="angler-hat"></span><span class="angler-head"></span><span class="angler-body"></span>
            <span class="angler-arm"></span><span class="angler-leg leg-a"></span><span class="angler-leg leg-b"></span>
            <span class="angler-rod"></span><span class="angler-line"></span>
          </div>
          <div class="fishing-water-scene">
            <div class="water-line line-a"></div><div class="water-line line-b"></div><div class="water-line line-c"></div>
            <div class="fishing-ripple ripple-a"></div><div class="fishing-ripple ripple-b"></div>
            <div class="fishing-bobber"><i></i></div>
            <div class="fish-shadow fish-shadow-a"><i></i></div><div class="fish-shadow fish-shadow-b"><i></i></div><div class="fish-shadow fish-shadow-c"><i></i></div>
            <div id="fightFishShadow" class="fight-fish-shadow"><i></i></div>
          </div>

          <div id="fishingHitCallout" class="fishing-hit-callout">HIT!</div>
          <div id="fishingCatchFx" class="fishing-catch-fx" aria-live="polite">
            <div class="catch-rays"></div>
            <div class="catch-splash"><i></i><i></i><i></i><i></i><i></i></div>
            <div class="catch-fish"><span class="catch-fish-body"></span><span class="catch-fish-tail"></span></div>
            <div class="catch-copy"><span id="catchQuality">GOOD</span><strong id="catchFishName">魚</strong><em id="catchRarity">R</em><b id="catchNew">NEW!</b></div>
          </div>

          <div id="fishingFightHud" class="fishing-fight-hud" hidden>
            <div class="fight-title"><span>BIG FISH FIGHT</span><strong id="fightFishName">大物</strong><em id="fightRarity">SR</em></div>
            <div class="fight-field-track"><span class="fight-track-safe"></span><i id="fightFishMarker"></i></div>
            <div class="fight-meter-row">
              <div><span>テンション</span><div class="fight-meter tension"><i id="fightTensionBar"></i><b class="fight-safe-zone"></b></div></div>
              <div><span>魚の体力</span><div class="fight-meter stamina"><i id="fightStaminaBar"></i></div></div>
            </div>
            <div id="fightHint" class="fight-hint">巻くを長押し。高すぎると糸切れ、低すぎるとバラします。</div>
            <button id="fishingReelButton" class="fishing-reel-button" type="button">巻く（長押し）</button>
          </div>

          <div class="fishing-stage-hud">
            <div id="fishingPrompt" class="fishing-prompt">竿を投げて魚を狙おう</div>
            <div class="fishing-gauge" id="fishingGauge"><div class="fishing-target" id="fishingTarget"></div><div class="fishing-marker" id="fishingMarker"></div></div>
            <button id="fishingAction" class="fishing-action" type="button">キャスト</button>
          </div>
        </div>

        <div id="fishingResult" class="fishing-result" hidden></div>
        <div id="fishingBook" class="fishing-book"></div>
      </section>`;

    mount.querySelector("#fishingAction")?.addEventListener("click", handleAction);
    bindFightControls();
    renderBook();
  }

  function bindFightControls() {
    const reel = mount?.querySelector("#fishingReelButton");
    if (!reel) return;
    const setReeling = (value, event) => {
      if (!round || round.phase !== "fight") return;
      round.reeling = value;
      if (event?.pointerId !== undefined && value) {
        try { reel.setPointerCapture(event.pointerId); } catch {}
      }
      reel.classList.toggle("is-reeling", value);
      if (value) vibrate(10);
      event?.preventDefault?.();
    };
    reel.addEventListener("pointerdown", (event) => setReeling(true, event));
    for (const type of ["pointerup", "pointercancel", "lostpointercapture", "pointerleave"]) {
      reel.addEventListener(type, (event) => setReeling(false, event));
    }
  }

  function clearTimers() {
    if (rafId) cancelAnimationFrame(rafId);
    if (biteTimer) clearTimeout(biteTimer);
    if (escapeTimer) clearTimeout(escapeTimer);
    rafId = null; biteTimer = null; escapeTimer = null;
  }

  function scene() { return mount?.querySelector("#fishingScene") || null; }

  function resetSceneState() {
    const node = scene();
    if (!node) return;
    node.classList.remove("is-casting", "is-waiting", "is-bite", "is-catch", "is-miss", "is-fight", "fight-danger-high", "fight-danger-low", "rarity-n", "rarity-r", "rarity-sr", "rarity-ssr", "rarity-legend");
    const fightHud = mount?.querySelector("#fishingFightHud");
    if (fightHud) fightHud.hidden = true;
    const action = mount?.querySelector("#fishingAction");
    if (action) action.hidden = false;
  }

  function handleAction() {
    if (!round) startRound();
    else if (round.phase === "bite") hookRound();
  }

  function startRound() {
    const runtime = window.OnsenGameRuntime;
    const consume = runtime.consumeEnergy(1);
    const result = mount.querySelector("#fishingResult");
    const action = mount.querySelector("#fishingAction");
    const prompt = mount.querySelector("#fishingPrompt");
    if (!consume.ok) {
      if (result) {
        result.hidden = false;
        result.className = "fishing-result warning";
        result.innerHTML = `<strong>旅力が足りない</strong><span>旅行モードONで移動すると750mごとに旅力が1回復します。</span>`;
      }
      return;
    }

    runtime.recordFishingCast();
    clearTimers(); resetSceneState();
    if (result) result.hidden = true;
    const context = runtime.getTravelContext();
    const baseWidth = 0.18 + (context.tripMode && context.fresh ? 0.025 : 0) + (context.nearOnsen ? 0.03 : 0);
    round = { phase: "waiting", context, marker: 0.04, direction: 1, speed: 0.48 + Math.random() * 0.22, targetCenter: 0.2 + Math.random() * 0.6, targetWidth: Math.min(0.28, baseWidth), lastTickAt: performance.now() };
    const target = mount.querySelector("#fishingTarget");
    if (target) { target.style.left = `${(round.targetCenter - round.targetWidth / 2) * 100}%`; target.style.width = `${round.targetWidth * 100}%`; }
    const node = scene();
    node?.classList.add("is-casting");
    if (prompt) prompt.textContent = "キャスト！ 水面を見て待とう…";
    if (action) { action.disabled = true; action.textContent = "待つ…"; }
    vibrate(18);
    setTimeout(() => {
      if (!round || round.phase !== "waiting") return;
      node?.classList.remove("is-casting"); node?.classList.add("is-waiting");
    }, 420);
    biteTimer = setTimeout(beginBite, 850 + Math.random() * 1150);
    window.dispatchEvent(new Event("onsen-game-ui-refresh"));
  }

  function beginBite() {
    if (!round || round.phase !== "waiting") return;
    biteTimer = null; round.phase = "bite"; round.lastTickAt = performance.now();
    const node = scene(); node?.classList.remove("is-waiting"); node?.classList.add("is-bite");
    const prompt = mount.querySelector("#fishingPrompt"); const action = mount.querySelector("#fishingAction");
    if (prompt) prompt.textContent = "魚がかかった！ 緑の範囲でアワセる！";
    if (action) { action.disabled = false; action.textContent = "アワセる！"; }
    vibrate([35, 40, 55]);
    tickBite(performance.now());
    escapeTimer = setTimeout(() => failRound("遅かった…魚が離れた", "次は浮きが沈んだ瞬間を狙おう。"), 3200);
  }

  function tickBite(now) {
    if (!round || round.phase !== "bite") return;
    const dt = Math.min(0.05, Math.max(0, (now - round.lastTickAt) / 1000));
    round.lastTickAt = now; round.marker += round.direction * round.speed * dt;
    if (round.marker >= 0.98) { round.marker = 0.98; round.direction = -1; }
    else if (round.marker <= 0.02) { round.marker = 0.02; round.direction = 1; }
    const marker = mount?.querySelector("#fishingMarker"); if (marker) marker.style.left = `${round.marker * 100}%`;
    rafId = requestAnimationFrame(tickBite);
  }

  function hookRound() {
    if (!round || round.phase !== "bite") return;
    if (rafId) cancelAnimationFrame(rafId); if (escapeTimer) clearTimeout(escapeTimer); rafId = null; escapeTimer = null;
    const current = round;
    const distance = Math.abs(current.marker - current.targetCenter); const half = current.targetWidth / 2;
    const success = distance <= half; const normalized = success ? Math.max(0, 1 - distance / half) : 0;
    const quality = normalized >= 0.82 ? "PERFECT" : normalized >= 0.52 ? "GREAT" : normalized > 0 ? "GOOD" : "MISS";
    const qualityScore = Math.round(normalized * 100);
    if (!success) { round = null; failRound("アワセ失敗…！", "緑のゾーンにマーカーを合わせよう。"); return; }

    const forced = consumeDebugForceBigFish();
    const fishId = chooseFish(current.context, normalized, forced);
    const fish = FISH[fishId];
    const qualityMultiplier = quality === "PERFECT" ? 1.7 : quality === "GREAT" ? 1.35 : 1;
    const rareMultiplier = Math.max(1, RARITY_ORDER[fish.rarity] || 1);
    const reward = Math.max(1, Math.round(fish.reward * qualityMultiplier + rareMultiplier - 1));
    const catchData = { fishId, fish, quality, qualityScore, reward, context: current.context };
    if (shouldFight(fish, forced)) startFight(catchData);
    else { round = null; finalizeCatch(catchData); }
  }

  function consumeDebugForceBigFish() {
    const forced = sessionStorage.getItem(DEBUG_FORCE_KEY) === "1";
    if (forced) sessionStorage.removeItem(DEBUG_FORCE_KEY);
    return forced;
  }

  function shouldFight(fish, forced) {
    if (forced) return true;
    if (fish.rarity === "SSR" || fish.rarity === "LEGEND") return true;
    if (fish.rarity === "SR") return Math.random() < 0.60;
    return false;
  }

  function startFight(catchData) {
    const params = FIGHT_PARAMS[catchData.fish.rarity] || FIGHT_PARAMS.SR;
    round = {
      phase: "fight", ...catchData, params,
      tension: 0.48, stamina: params.stamina, maxStamina: params.stamina,
      fishPos: 0.50, fishDir: Math.random() < 0.5 ? -1 : 1, reeling: false,
      slackTime: 0, elapsed: 0, surgeTimer: 0.6 + Math.random() * 0.9, surge: 0,
      lastTickAt: performance.now()
    };
    const node = scene();
    node?.classList.remove("is-bite"); node?.classList.add("is-fight", `rarity-${catchData.fish.rarity.toLowerCase()}`);
    const hud = mount.querySelector("#fishingFightHud"); const action = mount.querySelector("#fishingAction"); const prompt = mount.querySelector("#fishingPrompt");
    if (hud) hud.hidden = false; if (action) action.hidden = true;
    setText("#fightFishName", catchData.fish.name); setText("#fightRarity", catchData.fish.rarity);
    if (prompt) prompt.textContent = `大物 ${catchData.fish.name}！ テンションを保て！`;
    vibrate([55, 35, 80]);
    updateFightHud();
    rafId = requestAnimationFrame(tickFight);
  }

  function tickFight(now) {
    if (!round || round.phase !== "fight") return;
    const dt = Math.min(0.05, Math.max(0, (now - round.lastTickAt) / 1000));
    round.lastTickAt = now; round.elapsed += dt; round.surgeTimer -= dt;
    if (round.surgeTimer <= 0) {
      round.surgeTimer = 0.65 + Math.random() * 1.15;
      round.surge = 0.11 + Math.random() * 0.12;
      if (Math.random() < 0.72) round.fishDir *= -1;
      vibrate(14);
    }
    round.surge = Math.max(0, round.surge - dt * 0.18);
    const speed = round.params.fishSpeed + round.surge * 1.7;
    round.fishPos += round.fishDir * speed * dt;
    if (round.fishPos >= 0.96) { round.fishPos = 0.96; round.fishDir = -1; }
    if (round.fishPos <= 0.04) { round.fishPos = 0.04; round.fishDir = 1; }

    const edgePull = Math.abs(round.fishPos - 0.5) * 2;
    const fishPull = round.params.pull * (0.35 + edgePull * 0.85) + round.surge;
    round.tension += (round.reeling ? 0.44 : -0.23) * dt + fishPull * dt;
    round.tension = Math.max(0, Math.min(1.08, round.tension));

    const safe = round.tension >= 0.28 && round.tension <= 0.78;
    if (round.reeling && safe) {
      const qualityAssist = 1 + round.qualityScore / 350;
      round.stamina = Math.max(0, round.stamina - round.params.reelDamage * qualityAssist * dt);
    }

    if (round.tension < 0.07) round.slackTime += dt;
    else round.slackTime = Math.max(0, round.slackTime - dt * 1.8);

    if (round.tension >= 1.0) { failFight("糸が切れた！", "テンションが高すぎました。巻くのを離して耐えよう。"); return; }
    if (round.slackTime >= 0.9) { failFight("バレた！", "糸が緩みすぎました。巻くを長押ししてテンションを戻そう。"); return; }
    if (round.elapsed >= 24) { failFight("大物に逃げ切られた…", "適正テンション中に巻くと魚の体力を削れます。"); return; }
    if (round.stamina <= 0) {
      const caught = { fishId: round.fishId, fish: round.fish, quality: round.quality, qualityScore: round.qualityScore, reward: Math.round(round.reward * round.params.bonus), context: round.context };
      round = null; clearTimers(); hideFightHud(); finalizeCatch(caught); return;
    }

    updateFightHud();
    rafId = requestAnimationFrame(tickFight);
  }

  function updateFightHud() {
    if (!round || round.phase !== "fight") return;
    const tension = mount.querySelector("#fightTensionBar"); const stamina = mount.querySelector("#fightStaminaBar");
    const marker = mount.querySelector("#fightFishMarker"); const shadow = mount.querySelector("#fightFishShadow");
    const hint = mount.querySelector("#fightHint"); const node = scene();
    if (tension) tension.style.width = `${Math.min(100, round.tension * 100)}%`;
    if (stamina) stamina.style.width = `${Math.max(0, round.stamina / round.maxStamina * 100)}%`;
    if (marker) marker.style.left = `${round.fishPos * 100}%`;
    if (shadow) shadow.style.left = `${10 + round.fishPos * 70}%`;
    const high = round.tension > 0.82; const low = round.tension < 0.20;
    node?.classList.toggle("fight-danger-high", high); node?.classList.toggle("fight-danger-low", low);
    if (hint) hint.textContent = high ? "危険：張りすぎ！ 巻くのを離す" : low ? "危険：緩みすぎ！ 巻くを長押し" : round.reeling ? "適正！ そのまま巻け！" : "魚の引きを見ながら巻く";
  }

  function failFight(title, message) {
    clearTimers(); round = null; hideFightHud();
    const node = scene(); node?.classList.remove("is-fight", "fight-danger-high", "fight-danger-low"); node?.classList.add("is-miss");
    const action = mount.querySelector("#fishingAction"); const prompt = mount.querySelector("#fishingPrompt"); const result = mount.querySelector("#fishingResult");
    if (action) { action.hidden = false; action.disabled = false; action.textContent = "もう一度投げる"; }
    if (prompt) prompt.textContent = title;
    if (result) { result.hidden = false; result.className = "fishing-result miss"; result.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span>`; }
    vibrate([30, 40, 30]); setTimeout(() => node?.classList.remove("is-miss"), 700);
    window.dispatchEvent(new Event("onsen-game-ui-refresh"));
  }

  function hideFightHud() {
    const hud = mount?.querySelector("#fishingFightHud"); const reel = mount?.querySelector("#fishingReelButton");
    if (hud) hud.hidden = true; if (reel) reel.classList.remove("is-reeling");
  }

  function failRound(title, message) {
    clearTimers(); round = null;
    const node = scene(); node?.classList.remove("is-bite", "is-waiting", "is-casting"); node?.classList.add("is-miss");
    const action = mount.querySelector("#fishingAction"); const prompt = mount.querySelector("#fishingPrompt"); const result = mount.querySelector("#fishingResult");
    if (action) { action.hidden = false; action.disabled = false; action.textContent = "もう一度投げる"; }
    if (prompt) prompt.textContent = title;
    if (result) { result.hidden = false; result.className = "fishing-result miss"; result.innerHTML = `<strong>MISS</strong><span>${escapeHtml(message)}</span>`; }
    vibrate(20); setTimeout(() => node?.classList.remove("is-miss"), 700);
    window.dispatchEvent(new Event("onsen-game-ui-refresh"));
  }

  function finalizeCatch(data) {
    const recorded = window.OnsenGameRuntime.recordCatch({
      fishId: data.fishId, fishName: data.fish.name, rarity: data.fish.rarity,
      quality: data.quality, qualityScore: data.qualityScore, rewardYusen: data.reward,
      regionId: data.context.regionId, regionLabel: data.context.regionLabel,
      nearestSpotId: data.context.nearestSpotId, nearestSpotName: data.context.nearestSpotName,
      locationBonus: data.context.rareBonus
    });
    const firstBonus = recorded.firstCatch ? 5 : 0;
    if (firstBonus) window.OnsenGameRuntime.addYusen(firstBonus, "fishing_first_catch");
    showCatchCinematic({ fish: data.fish, quality: data.quality, reward: data.reward + firstBonus, firstCatch: recorded.firstCatch });
    renderBook(); updateCaughtKinds(); window.dispatchEvent(new Event("onsen-game-ui-refresh"));
  }

  function showCatchCinematic({ fish, quality, reward, firstCatch }) {
    const node = scene(); const rarityClass = `rarity-${fish.rarity.toLowerCase()}`;
    resetSceneState(); node?.classList.add("is-catch", rarityClass);
    setText("#catchQuality", quality); setText("#catchFishName", fish.name); setText("#catchRarity", fish.rarity);
    const newNode = mount.querySelector("#catchNew"); if (newNode) newNode.hidden = !firstCatch;
    const action = mount.querySelector("#fishingAction"); const prompt = mount.querySelector("#fishingPrompt"); const result = mount.querySelector("#fishingResult");
    if (action) { action.hidden = false; action.disabled = true; action.textContent = "釣り上げ！"; }
    if (prompt) prompt.textContent = `${quality}！ ${fish.name}を釣り上げた！`;
    if (result) { result.hidden = false; result.className = `fishing-result success ${rarityClass}`; result.innerHTML = `<span>${quality}</span><strong>${escapeHtml(fish.name)} <em>${fish.rarity}</em></strong><b>+${reward} 湯銭${firstCatch ? " ・ NEW図鑑登録" : ""}</b>`; }
    vibrate(fish.rarity === "LEGEND" ? [80,50,120,50,160] : fish.rarity === "SSR" ? [60,45,100] : [40,35,60]);
    setTimeout(() => { node?.classList.remove("is-catch", rarityClass); if (action) { action.disabled = false; action.textContent = "もう一度投げる"; } }, fish.rarity === "LEGEND" ? 2300 : 1800);
  }

  function chooseFish(context, qualityScore, forced = false) {
    const pool = [...(REGION_POOLS[context.regionId] || REGION_POOLS.unknown)];
    if (context.nearOnsen) pool.push("smoke_fish");
    if (forced) {
      if (context.nearOnsen) return "smoke_fish";
      const rare = [...new Set(pool)].filter((id) => (RARITY_ORDER[FISH[id]?.rarity] || 0) >= 3).sort((a, b) => (RARITY_ORDER[FISH[b].rarity] || 0) - (RARITY_ORDER[FISH[a].rarity] || 0));
      return rare[0] || "iwana";
    }
    const candidates = [...new Set(pool)].map((id) => {
      const fish = FISH[id]; const rarity = RARITY_ORDER[fish.rarity] || 1; let weight = fish.weight;
      if (rarity >= 3) weight *= 1 + Number(context.rareBonus || 0) * 3;
      if (rarity >= 4) weight *= 0.7 + qualityScore * 0.9;
      if (id === "smoke_fish") weight *= context.nearOnsen ? (0.7 + qualityScore * 1.8) : 0;
      return { id, weight: Math.max(0.01, weight) };
    });
    const total = candidates.reduce((sum, item) => sum + item.weight, 0); let roll = Math.random() * total;
    for (const item of candidates) { roll -= item.weight; if (roll <= 0) return item.id; }
    return candidates[candidates.length - 1]?.id || "common_carp";
  }

  function renderBook() {
    const root = mount?.querySelector("#fishingBook"); if (!root) return;
    const state = window.OnsenGameRuntime.loadState(); const context = window.OnsenGameRuntime.getTravelContext();
    const pool = [...(REGION_POOLS[context.regionId] || REGION_POOLS.unknown)]; if (context.nearOnsen) pool.push("smoke_fish");
    root.innerHTML = `<div class="fishing-book-title"><strong>${escapeHtml(context.regionLabel)}の釣り図鑑</strong><span>現在地で出会える魚</span></div>`;
    const grid = document.createElement("div"); grid.className = "fishing-book-grid";
    for (const id of [...new Set(pool)]) {
      const fish = FISH[id]; const count = Number(state.fishing.collection?.[id] || 0); const item = document.createElement("div");
      item.className = `fishing-fish ${count ? "caught" : "unknown"}`; item.dataset.rarity = fish.rarity;
      item.innerHTML = `<span>${count ? escapeHtml(fish.name) : "？？？"}</span><b>${count ? `${fish.rarity} ×${count}` : fish.rarity}</b>`; grid.appendChild(item);
    }
    root.appendChild(grid);
  }

  function updateCaughtKinds() {
    const state = window.OnsenGameRuntime.loadState();
    const caughtKinds = Object.keys(state.fishing.collection || {}).filter((id) => Number(state.fishing.collection[id] || 0) > 0).length;
    const node = mount?.querySelector("#fishingCaughtKinds"); if (node) node.textContent = String(caughtKinds);
  }

  function refreshContext() {
    if (!mount || round) return;
    const context = window.OnsenGameRuntime?.getTravelContext?.(); if (!context) return;
    setText("#fishingRegion", context.regionLabel);
    setText("#fishingLocationBonus", context.tripMode && context.fresh ? (context.nearOnsen ? "温泉地付近 +RARE" : "旅行GPS +RARE") : "なし");
    renderBook(); updateCaughtKinds();
  }

  function resetFishingUi() {
    clearTimers(); round = null; resetSceneState(); hideFightHud();
    const action = mount?.querySelector("#fishingAction"); const prompt = mount?.querySelector("#fishingPrompt"); const result = mount?.querySelector("#fishingResult");
    if (action) { action.hidden = false; action.disabled = false; action.textContent = "キャスト"; }
    if (prompt) prompt.textContent = "竿を投げて魚を狙おう"; if (result) result.hidden = true;
    renderBook(); updateCaughtKinds();
  }

  function setText(selector, value) { const node = mount?.querySelector(selector); if (node) node.textContent = String(value ?? ""); }
  function vibrate(pattern) { try { navigator.vibrate?.(pattern); } catch {} }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>'\"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char])); }

  async function install(target) {
    await waitForRuntime(); mount = target || document.getElementById("fishingGameMount"); if (!mount) return false;
    renderBase();
    window.addEventListener("onsen-game-state-changed", (event) => { if (event.detail?.reason === "debug_reset_fishing") resetFishingUi(); else refreshContext(); });
    window.addEventListener("onsen-location-sample", refreshContext);
    return true;
  }

  window.OnsenFishingGame = { build: BUILD, install, refresh: refreshContext, debugResetUi: resetFishingUi };
})();