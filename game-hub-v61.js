(() => {
  const BUILD = "v61";
  const GAME_TAB_ID = "footerGameTab";
  const DEBUG_FORCE_KEY = "onsenDebugForceBigFishV60";
  let installed = false;
  let activeGame = "fishing";

  const GAME_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8h10a4 4 0 0 1 3.7 5.5l-1.2 3a2 2 0 0 1-3.2.8L14.5 16h-5l-1.8 1.3a2 2 0 0 1-3.2-.8l-1.2-3A4 4 0 0 1 7 8Z"/><path d="M8 11v4M6 13h4M16.5 12h.01M18.5 14h.01"/></svg>';

  function getNav() { return document.querySelector(".app-tabs"); }
  function ensureGameView() {
    let view = document.getElementById("gameView");
    if (view) return view;
    const nav = getNav();
    if (!nav) return null;
    view = document.createElement("section");
    view.id = "gameView";
    view.className = "game-view";
    view.hidden = true;
    view.setAttribute("aria-hidden", "true");
    view.innerHTML = `
      <div class="game-shell">
        <header class="game-header">
          <div><span>TRAVEL PLAYGROUND</span><h2>旅あそび</h2><p>旅で集め、オフラインでも遊ぶ。</p></div>
          <div class="game-wallet">
            <div><span>湯銭</span><b id="gameYusen">0</b></div>
            <div><span>旅力</span><b id="gameEnergy">0/12</b></div>
            <div><span>人物</span><b id="gameCharacters">0/50</b></div>
          </div>
        </header>
        <section class="game-location-card">
          <div><span>現在のフィールド</span><strong id="gameLocationLabel">位置情報待ち</strong><small id="gameLocationMeta">旅行GPSと連動</small></div>
          <div id="gameTravelBonus" class="game-location-bonus">通常</div>
        </section>
        <div class="game-selector" aria-label="ミニゲーム選択">
          <button type="button" class="active" data-game-id="fishing"><span>🎣</span><strong>旅釣り</strong><small>PLAY</small></button>
          <button type="button" data-game-id="encyclopedia"><span>冊</span><strong>図鑑</strong><small>人物・魚</small></button>
          <button type="button" data-game-id="endless" disabled><span>⚔</span><strong>戦陣</strong><small>NEXT</small></button>
        </div>
        <div id="gameStage" class="game-stage">
          <div id="fishingGameMount" data-game-panel="fishing"></div>
          <div id="encyclopediaMount" data-game-panel="encyclopedia" hidden></div>
        </div>
        <section class="game-system-note">
          <strong>旅との連動</strong>
          <p>旅行GPSで旅力、温泉収集で将来の湯治力、100名城で武威、城訪問で人物候補が増えます。ゲームだけで訪問済みにはなりません。</p>
        </section>
        <details class="game-debug-panel" id="gameDebugPanel">
          <summary>DEBUG / 開発用</summary>
          <div class="game-debug-body">
            <button id="debugRefillEnergy" type="button">旅力をMAXにする</button>
            <button id="debugForceBigFish" type="button">次を大物ファイトにする</button>
            <button id="debugUnlockCharacters" type="button">全人物を登用候補にする</button>
            <button id="debugResetFishing" class="danger" type="button">釣り進捗をリセット</button>
            <div id="gameDebugStatus" class="game-debug-status">訪問記録・実績はデバッグ操作の対象外です。</div>
          </div>
        </details>
      </div>`;
    nav.parentNode.insertBefore(view, nav);
    return view;
  }

  function ensureGameTab() {
    const nav = getNav();
    if (!nav) return null;
    let button = document.getElementById(GAME_TAB_ID);
    if (!button) {
      button = document.createElement("button");
      button.id = GAME_TAB_ID;
      button.type = "button";
      button.className = "app-tab";
      button.dataset.appTab = "game";
      button.setAttribute("aria-selected", "false");
      button.textContent = "ゲーム";
      nav.appendChild(button);
    } else if (nav.lastElementChild !== button) nav.appendChild(button);
    document.documentElement.style.setProperty("--app-tab-count", "5");
    return button;
  }

  function decorateGameTab() {
    const button = ensureGameTab();
    if (!button || button.dataset.gameDecorated === "1") return;
    button.dataset.gameDecorated = "1";
    button.dataset.v54Footer = "1";
    button.textContent = "";
    const icon = document.createElement("span");
    icon.className = "v54-nav-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = GAME_ICON;
    const label = document.createElement("span");
    label.className = "v54-nav-label";
    label.textContent = "ゲーム";
    button.append(icon, label);
  }

  function renderStatus() {
    if (!window.OnsenGameRuntime) return;
    const state = window.OnsenGameRuntime.loadState();
    const context = window.OnsenGameRuntime.getTravelContext();
    const charStats = window.OnsenCharacterRuntime?.stats?.() || { recruited: 0, total: 50 };
    const yusen = document.getElementById("gameYusen");
    const energy = document.getElementById("gameEnergy");
    const characters = document.getElementById("gameCharacters");
    const label = document.getElementById("gameLocationLabel");
    const meta = document.getElementById("gameLocationMeta");
    const bonus = document.getElementById("gameTravelBonus");
    if (yusen) yusen.textContent = String(state.wallet.yusen || 0);
    if (energy) energy.textContent = `${state.energy.value}/${state.energy.max}`;
    if (characters) characters.textContent = `${charStats.recruited}/${charStats.total}`;
    if (label) label.textContent = context.nearestSpotName ? `${context.nearestSpotName}付近` : context.regionLabel;
    if (meta) {
      if (!context.tripMode) meta.textContent = "旅行モードOFF";
      else if (!context.fresh) meta.textContent = "GPS更新待ち";
      else if (Number.isFinite(context.nearestDistanceM)) meta.textContent = `${context.regionLabel} ・ 最寄り${formatDistance(context.nearestDistanceM)}`;
      else meta.textContent = `${context.regionLabel} ・ GPS連動中`;
    }
    if (bonus) {
      bonus.className = `game-location-bonus${context.tripMode && context.fresh ? " active" : ""}`;
      bonus.textContent = context.tripMode && context.fresh ? (context.nearOnsen ? "温泉地BONUS" : "旅行GPS BONUS") : "通常";
    }
    syncDebugButtons();
  }

  function formatDistance(m) {
    const n = Number(m);
    if (!Number.isFinite(n)) return "—";
    if (n < 1000) return `${Math.round(n)}m`;
    return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}km`;
  }

  function switchGame(gameId) {
    if (!gameId || gameId === "endless") return;
    activeGame = gameId;
    for (const button of document.querySelectorAll("#gameView [data-game-id]")) button.classList.toggle("active", button.dataset.gameId === activeGame);
    for (const panel of document.querySelectorAll("#gameStage [data-game-panel]")) panel.hidden = panel.dataset.gamePanel !== activeGame;
    if (activeGame === "encyclopedia") {
      window.OnsenCharacterRuntime?.markSeen?.();
      window.OnsenEncyclopediaUI?.render?.();
    } else {
      window.OnsenFishingGame?.refresh?.();
    }
    renderStatus();
  }

  function bindSelector() {
    const root = document.querySelector("#gameView .game-selector");
    if (!root || root.dataset.bound === "1") return;
    root.dataset.bound = "1";
    root.addEventListener("click", (event) => {
      const button = event.target instanceof Element ? event.target.closest("[data-game-id]") : null;
      if (!button || button.disabled) return;
      switchGame(button.dataset.gameId || "fishing");
    });
  }

  function setDebugStatus(message) {
    const node = document.getElementById("gameDebugStatus");
    if (node) node.textContent = message;
  }
  function syncDebugButtons() {
    const big = document.getElementById("debugForceBigFish");
    if (big) {
      const armed = sessionStorage.getItem(DEBUG_FORCE_KEY) === "1";
      big.classList.toggle("armed", armed);
      big.textContent = armed ? "大物ファイト予約済み" : "次を大物ファイトにする";
    }
    const chars = document.getElementById("debugUnlockCharacters");
    if (chars && window.OnsenCharacterRuntime) {
      const armed = !!window.OnsenCharacterRuntime.loadState().debug?.unlockAllCandidates;
      chars.classList.toggle("armed", armed);
      chars.textContent = armed ? "全人物候補を元に戻す" : "全人物を登用候補にする";
    }
  }

  function bindDebug() {
    const refill = document.getElementById("debugRefillEnergy");
    const force = document.getElementById("debugForceBigFish");
    const unlockCharacters = document.getElementById("debugUnlockCharacters");
    const reset = document.getElementById("debugResetFishing");
    if (!refill || refill.dataset.bound === "1") return;
    refill.dataset.bound = "1";
    refill.addEventListener("click", () => {
      const state = window.OnsenGameRuntime?.debugRefillEnergy?.();
      setDebugStatus(state ? `旅力を ${state.energy.value}/${state.energy.max} にしました。` : "旅力回復に失敗しました。");
      renderStatus();
    });
    force?.addEventListener("click", () => {
      sessionStorage.setItem(DEBUG_FORCE_KEY, "1");
      syncDebugButtons();
      setDebugStatus("次のアワセ成功時に大物ファイトへ移行します。");
    });
    unlockCharacters?.addEventListener("click", () => {
      const current = !!window.OnsenCharacterRuntime?.loadState?.().debug?.unlockAllCandidates;
      window.OnsenCharacterRuntime?.toggleDebugUnlockAll?.(!current);
      syncDebugButtons();
      window.OnsenEncyclopediaUI?.render?.();
      setDebugStatus(!current ? "全50人を登用候補として仮解放しました。" : "人物の仮解放を解除し、訪問実績ベースへ戻しました。");
    });
    reset?.addEventListener("click", () => {
      const ok = confirm("釣りの回数・魚図鑑・ベスト品質・最終釣果をリセットします。湯銭や訪問記録は残します。実行しますか？");
      if (!ok) return;
      sessionStorage.removeItem(DEBUG_FORCE_KEY);
      window.OnsenGameRuntime?.debugResetFishing?.();
      window.OnsenFishingGame?.debugResetUi?.();
      window.OnsenEncyclopediaUI?.render?.();
      setDebugStatus("釣り進捗を初期状態へ戻しました。人物・湯銭・訪問記録は維持されています。");
      renderStatus();
    });
  }

  async function installFishing() {
    if (!window.OnsenFishingGame) return;
    const target = document.getElementById("fishingGameMount");
    if (target && !target.dataset.gameInstalled) {
      target.dataset.gameInstalled = "1";
      await window.OnsenFishingGame.install(target);
    }
  }
  async function installEncyclopedia() {
    const target = document.getElementById("encyclopediaMount");
    if (!target || target.dataset.gameInstalled || !window.OnsenEncyclopediaInstall) return;
    target.dataset.gameInstalled = "1";
    await window.OnsenEncyclopediaInstall(target);
  }

  function markGameSeen() {
    window.OnsenGameRuntime?.markGameSeen?.();
    if (activeGame === "encyclopedia") window.OnsenCharacterRuntime?.markSeen?.();
  }
  function onTabChanged(event) {
    if (event.detail?.tab !== "game") return;
    markGameSeen();
    renderStatus();
    if (activeGame === "encyclopedia") window.OnsenEncyclopediaUI?.render?.();
    else window.OnsenFishingGame?.refresh?.();
  }

  async function install() {
    if (installed) return;
    installed = true;
    for (let i = 0; i < 360; i += 1) {
      if (getNav() && window.OnsenGameRuntime && window.OnsenAppShell && window.OnsenCharacterRuntime) break;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    ensureGameView();
    ensureGameTab();
    decorateGameTab();
    bindSelector();
    bindDebug();
    await installFishing();
    await installEncyclopedia();
    switchGame(activeGame);
    renderStatus();

    window.addEventListener("onsen-game-state-changed", renderStatus);
    window.addEventListener("onsen-character-state-changed", renderStatus);
    window.addEventListener("onsen-location-sample", renderStatus);
    window.addEventListener("onsen-game-ui-refresh", renderStatus);
    window.addEventListener("onsen-app-tab-changed", onTabChanged);
    window.addEventListener("pageshow", renderStatus);

    const nav = getNav();
    if (nav) new MutationObserver(() => {
      ensureGameTab();
      document.documentElement.style.setProperty("--app-tab-count", "5");
    }).observe(nav, { childList: true, subtree: true });

    window.OnsenGameHub = {
      build: BUILD,
      show: () => window.OnsenAppShell?.show?.("game"),
      showGame: (id) => { window.OnsenAppShell?.show?.("game"); setTimeout(() => switchGame(id), 0); },
      refresh: renderStatus,
      activeGame: () => activeGame
    };
  }

  install().catch((error) => console.warn("game hub v61 init failed", error));
})();