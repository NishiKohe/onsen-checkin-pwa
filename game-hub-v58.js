(() => {
  const BUILD = "v58";
  const GAME_TAB_ID = "footerGameTab";
  let installed = false;

  const GAME_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8h10a4 4 0 0 1 3.7 5.5l-1.2 3a2 2 0 0 1-3.2.8L14.5 16h-5l-1.8 1.3a2 2 0 0 1-3.2-.8l-1.2-3A4 4 0 0 1 7 8Z"/><path d="M8 11v4M6 13h4M16.5 12h.01M18.5 14h.01"/></svg>';

  function getNav() {
    return document.querySelector(".app-tabs");
  }

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
          <div><span>TRAVEL PLAYGROUND</span><h2>旅あそび</h2><p>旅行モードと位置記録で旅力を補充。通信なしでも遊べます。</p></div>
          <div class="game-wallet">
            <div><span>湯銭</span><b id="gameYusen">0</b></div>
            <div><span>旅力</span><b id="gameEnergy">0/12</b></div>
          </div>
        </header>

        <section class="game-location-card">
          <div><span>現在のフィールド</span><strong id="gameLocationLabel">位置情報待ち</strong><small id="gameLocationMeta">旅行GPSと連動</small></div>
          <div id="gameTravelBonus" class="game-location-bonus">通常</div>
        </section>

        <div class="game-selector" aria-label="ミニゲーム選択">
          <button type="button" class="active" data-game-id="fishing"><span>🎣</span><strong>旅釣り</strong><small>PLAYABLE</small></button>
          <button type="button" data-game-id="rogue" disabled><span>⚔</span><strong>旅Rogue</strong><small>NEXT</small></button>
        </div>

        <div id="gameStage" class="game-stage">
          <div id="fishingGameMount"></div>
        </div>

        <section class="game-system-note">
          <strong>位置登録との連動</strong>
          <p>旅行モードON中、GPS移動750mごとに旅力+1。温泉地5km以内では釣りのレア出現率が上がります。ゲーム報酬だけで訪問済みにはなりません。</p>
        </section>
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
    }
    document.documentElement.style.setProperty("--app-tab-count", "5");
    return button;
  }

  function decorateGameTab() {
    const button = ensureGameTab();
    if (!button) return;
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
    const yusen = document.getElementById("gameYusen");
    const energy = document.getElementById("gameEnergy");
    const label = document.getElementById("gameLocationLabel");
    const meta = document.getElementById("gameLocationMeta");
    const bonus = document.getElementById("gameTravelBonus");
    if (yusen) yusen.textContent = String(state.wallet.yusen || 0);
    if (energy) energy.textContent = `${state.energy.value}/${state.energy.max}`;
    if (label) label.textContent = context.nearestSpotName ? `${context.nearestSpotName}付近` : context.regionLabel;
    if (meta) {
      if (!context.tripMode) meta.textContent = "旅行モードOFF";
      else if (!context.fresh) meta.textContent = "GPS更新待ち";
      else if (Number.isFinite(context.nearestDistanceM)) meta.textContent = `${context.regionLabel} ・ 最寄り${formatDistance(context.nearestDistanceM)}`;
      else meta.textContent = `${context.regionLabel} ・ GPS連動中`;
    }
    if (bonus) {
      bonus.className = `game-location-bonus${context.tripMode && context.fresh ? " active" : ""}`;
      bonus.textContent = context.tripMode && context.fresh
        ? (context.nearOnsen ? "温泉地BONUS" : "旅行GPS BONUS")
        : "通常";
    }
  }

  function formatDistance(m) {
    const n = Number(m);
    if (!Number.isFinite(n)) return "—";
    if (n < 1000) return `${Math.round(n)}m`;
    return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}km`;
  }

  function bindSelector() {
    const root = document.querySelector("#gameView .game-selector");
    if (!root || root.dataset.bound === "1") return;
    root.dataset.bound = "1";
    root.addEventListener("click", (event) => {
      const button = event.target instanceof Element ? event.target.closest("[data-game-id]") : null;
      if (!button || button.disabled) return;
      for (const other of root.querySelectorAll("[data-game-id]")) other.classList.toggle("active", other === button);
    });
  }

  async function installFishing() {
    if (!window.OnsenFishingGame) return;
    const mount = document.getElementById("fishingGameMount");
    if (mount && !mount.dataset.gameInstalled) {
      mount.dataset.gameInstalled = "1";
      await window.OnsenFishingGame.install(mount);
    }
  }

  function onTabChanged(event) {
    if (event.detail?.tab !== "game") return;
    window.OnsenGameRuntime?.markGameSeen?.();
    renderStatus();
    window.OnsenFishingGame?.refresh?.();
  }

  async function install() {
    if (installed) return;
    installed = true;
    for (let i = 0; i < 300; i++) {
      if (getNav() && window.OnsenGameRuntime && window.OnsenAppShell) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    ensureGameView();
    ensureGameTab();
    decorateGameTab();
    bindSelector();
    await installFishing();
    renderStatus();

    window.addEventListener("onsen-game-state-changed", renderStatus);
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
      refresh: renderStatus
    };
  }

  install().catch((err) => console.warn("game hub v58 init failed", err));
})();
