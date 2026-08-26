(() => {
  const BUILD = "v58";
  let mount = null;
  let rafId = null;
  let round = null;

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
      <section class="fishing-game" data-build="${BUILD}">
        <div class="fishing-head">
          <div>
            <span>OFFLINE MINI GAME</span>
            <h3>旅釣り</h3>
            <p>旅力を1消費してキャスト。タイミングよくアワセて魚と湯銭を獲得。</p>
          </div>
          <div class="fishing-collection"><b>${caughtKinds}</b><span>種発見</span></div>
        </div>

        <div class="fishing-location">
          <div><span>フィールド</span><b id="fishingRegion">${escapeHtml(context.regionLabel)}</b></div>
          <div><span>位置ボーナス</span><b id="fishingLocationBonus">${context.tripMode && context.fresh ? (context.nearOnsen ? "温泉地付近 +RARE" : "旅行GPS +RARE") : "なし"}</b></div>
        </div>

        <div class="fishing-stage">
          <div class="fishing-water" aria-hidden="true"><span></span><span></span><span></span></div>
          <div class="fishing-gauge" id="fishingGauge">
            <div class="fishing-target" id="fishingTarget"></div>
            <div class="fishing-marker" id="fishingMarker"></div>
          </div>
          <div id="fishingPrompt" class="fishing-prompt">キャストして魚の気配を探そう</div>
          <button id="fishingAction" class="fishing-action" type="button">釣りを始める</button>
        </div>

        <div id="fishingResult" class="fishing-result" hidden></div>
        <div id="fishingBook" class="fishing-book"></div>
      </section>`;

    mount.querySelector("#fishingAction")?.addEventListener("click", handleAction);
    renderBook();
  }

  function renderBook() {
    const root = mount?.querySelector("#fishingBook");
    if (!root) return;
    const runtime = window.OnsenGameRuntime;
    const state = runtime.loadState();
    const context = runtime.getTravelContext();
    const pool = [...(REGION_POOLS[context.regionId] || REGION_POOLS.unknown)];
    if (context.nearOnsen) pool.push("smoke_fish");
    root.innerHTML = `<div class="fishing-book-title"><strong>${escapeHtml(context.regionLabel)}の釣り図鑑</strong><span>現在地で出会える魚</span></div>`;
    const grid = document.createElement("div");
    grid.className = "fishing-book-grid";
    for (const id of [...new Set(pool)]) {
      const fish = FISH[id];
      const count = Number(state.fishing.collection?.[id] || 0);
      const item = document.createElement("div");
      item.className = `fishing-fish ${count ? "caught" : "unknown"}`;
      item.dataset.rarity = fish.rarity;
      item.innerHTML = `<span>${count ? escapeHtml(fish.name) : "？？？"}</span><b>${count ? `${fish.rarity} ×${count}` : fish.rarity}</b>`;
      grid.appendChild(item);
    }
    root.appendChild(grid);
  }

  function handleAction() {
    if (!round) startRound();
    else hookRound();
  }

  function startRound() {
    const runtime = window.OnsenGameRuntime;
    const consume = runtime.consumeEnergy(1);
    const result = mount.querySelector("#fishingResult");
    if (!consume.ok) {
      if (result) {
        result.hidden = false;
        result.className = "fishing-result warning";
        result.innerHTML = `<strong>旅力が足りない</strong><span>旅行モードONで位置記録しながら移動すると、750mごとに旅力が1回復します。</span>`;
      }
      return;
    }

    runtime.recordFishingCast();
    const context = runtime.getTravelContext();
    const baseWidth = 0.18 + (context.tripMode && context.fresh ? 0.025 : 0) + (context.nearOnsen ? 0.03 : 0);
    round = {
      startedAt: performance.now(),
      marker: 0.04,
      direction: 1,
      speed: 0.48 + Math.random() * 0.22,
      targetCenter: 0.2 + Math.random() * 0.6,
      targetWidth: Math.min(0.28, baseWidth),
      context
    };

    const target = mount.querySelector("#fishingTarget");
    if (target) {
      target.style.left = `${(round.targetCenter - round.targetWidth / 2) * 100}%`;
      target.style.width = `${round.targetWidth * 100}%`;
    }
    const prompt = mount.querySelector("#fishingPrompt");
    if (prompt) prompt.textContent = "魚がかかった！ 緑の範囲でアワセる";
    const action = mount.querySelector("#fishingAction");
    if (action) action.textContent = "アワセる！";
    if (result) result.hidden = true;
    tick(performance.now());
    window.dispatchEvent(new Event("onsen-game-ui-refresh"));
  }

  function tick(now) {
    if (!round) return;
    const dt = Math.min(0.05, Math.max(0, (now - round.startedAt) / 1000));
    round.startedAt = now;
    round.marker += round.direction * round.speed * dt;
    if (round.marker >= 0.98) {
      round.marker = 0.98;
      round.direction = -1;
    } else if (round.marker <= 0.02) {
      round.marker = 0.02;
      round.direction = 1;
    }
    const marker = mount?.querySelector("#fishingMarker");
    if (marker) marker.style.left = `${round.marker * 100}%`;
    rafId = requestAnimationFrame(tick);
  }

  function hookRound() {
    if (!round) return;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    const current = round;
    round = null;

    const distance = Math.abs(current.marker - current.targetCenter);
    const half = current.targetWidth / 2;
    const success = distance <= half;
    const normalized = success ? Math.max(0, 1 - distance / half) : 0;
    const quality = normalized >= 0.82 ? "PERFECT" : normalized >= 0.52 ? "GREAT" : normalized > 0 ? "GOOD" : "MISS";
    const qualityScore = Math.round(normalized * 100);

    const action = mount.querySelector("#fishingAction");
    if (action) action.textContent = "もう一度釣る";
    const prompt = mount.querySelector("#fishingPrompt");
    if (prompt) prompt.textContent = success ? `${quality}！` : "逃げられた…";
    const result = mount.querySelector("#fishingResult");

    if (!success) {
      if (result) {
        result.hidden = false;
        result.className = "fishing-result miss";
        result.innerHTML = `<strong>MISS</strong><span>緑の範囲でアワセると釣り上げられます。</span>`;
      }
      window.dispatchEvent(new Event("onsen-game-ui-refresh"));
      return;
    }

    const fishId = chooseFish(current.context, normalized);
    const fish = FISH[fishId];
    const qualityMultiplier = quality === "PERFECT" ? 1.7 : quality === "GREAT" ? 1.35 : 1;
    const rareMultiplier = Math.max(1, RARITY_ORDER[fish.rarity] || 1);
    const reward = Math.max(1, Math.round(fish.reward * qualityMultiplier + rareMultiplier - 1));
    const recorded = window.OnsenGameRuntime.recordCatch({
      fishId,
      fishName: fish.name,
      rarity: fish.rarity,
      quality,
      qualityScore,
      rewardYusen: reward,
      regionId: current.context.regionId,
      regionLabel: current.context.regionLabel,
      nearestSpotId: current.context.nearestSpotId,
      nearestSpotName: current.context.nearestSpotName,
      locationBonus: current.context.rareBonus
    });

    const firstBonus = recorded.firstCatch ? 5 : 0;
    if (firstBonus) window.OnsenGameRuntime.addYusen(firstBonus, "fishing_first_catch");
    if (result) {
      result.hidden = false;
      result.className = `fishing-result success rarity-${fish.rarity.toLowerCase()}`;
      result.innerHTML = `
        <span>${quality}</span>
        <strong>${escapeHtml(fish.name)} <em>${fish.rarity}</em></strong>
        <b>+${reward + firstBonus} 湯銭${recorded.firstCatch ? " ・ NEW +5" : ""}</b>`;
    }
    renderBook();
    window.dispatchEvent(new Event("onsen-game-ui-refresh"));
  }

  function chooseFish(context, qualityScore) {
    const pool = [...(REGION_POOLS[context.regionId] || REGION_POOLS.unknown)];
    if (context.nearOnsen) pool.push("smoke_fish");
    const candidates = [...new Set(pool)].map((id) => {
      const fish = FISH[id];
      const rarity = RARITY_ORDER[fish.rarity] || 1;
      let weight = fish.weight;
      if (rarity >= 3) weight *= 1 + Number(context.rareBonus || 0) * 3;
      if (rarity >= 4) weight *= 0.7 + qualityScore * 0.9;
      if (id === "smoke_fish") weight *= context.nearOnsen ? (0.7 + qualityScore * 1.8) : 0;
      return { id, weight: Math.max(0.01, weight) };
    });
    const total = candidates.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * total;
    for (const item of candidates) {
      roll -= item.weight;
      if (roll <= 0) return item.id;
    }
    return candidates[candidates.length - 1]?.id || "common_carp";
  }

  function refreshContext() {
    if (!mount || round) return;
    const context = window.OnsenGameRuntime?.getTravelContext?.();
    if (!context) return;
    const region = mount.querySelector("#fishingRegion");
    const bonus = mount.querySelector("#fishingLocationBonus");
    if (region) region.textContent = context.regionLabel;
    if (bonus) bonus.textContent = context.tripMode && context.fresh ? (context.nearOnsen ? "温泉地付近 +RARE" : "旅行GPS +RARE") : "なし";
  }

  async function install(target) {
    await waitForRuntime();
    mount = target || document.getElementById("fishingGameMount");
    if (!mount) return false;
    renderBase();
    window.addEventListener("onsen-game-state-changed", refreshContext);
    window.addEventListener("onsen-location-sample", refreshContext);
    return true;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'\"]/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[char]));
  }

  window.OnsenFishingGame = { build: BUILD, install, refresh: refreshContext };
})();
