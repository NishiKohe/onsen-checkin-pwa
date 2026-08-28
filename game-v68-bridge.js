(() => {
  const BUILD = "v68.1";
  const SYSTEM_NOTE = "旅行GPSで旅力、温泉収集で湯治力、日本100名城・続日本100名城（計200城）で武威、城訪問で人物候補が増えます。ゲームだけで訪問済みにはなりません。";
  let endlessInstalled = false;
  let hubPatched = false;
  let bootTimer = null;

  function loadStyle() {
    if (document.getElementById("endlessBattleStyleV68")) return;
    const link = document.createElement("link");
    link.id = "endlessBattleStyleV68";
    link.rel = "stylesheet";
    link.href = "./endless-battle-v68.css?v=68.1";
    document.head.appendChild(link);
  }

  function loadScript() {
    if (window.OnsenEndlessBattle) return Promise.resolve(true);
    const existing = document.getElementById("endlessBattleScriptV68");
    if (existing) {
      return new Promise((resolve, reject) => {
        if (window.OnsenEndlessBattle) return resolve(true);
        existing.addEventListener("load", () => resolve(true), { once: true });
        existing.addEventListener("error", () => reject(new Error("endless battle asset load failed")), { once: true });
      });
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.id = "endlessBattleScriptV68";
      script.src = "./endless-battle-v68.js?v=68.1";
      script.async = true;
      script.addEventListener("load", () => resolve(true), { once: true });
      script.addEventListener("error", () => reject(new Error("endless battle asset load failed")), { once: true });
      document.head.appendChild(script);
    });
  }

  const assetsReady = (() => {
    loadStyle();
    return loadScript().catch((error) => {
      console.warn("v68.1 endless asset load failed", error);
      return false;
    });
  })();

  function ensureMount() {
    const stage = document.getElementById("gameStage");
    if (!stage) return null;
    let mount = document.getElementById("endlessBattleMount");
    if (!mount) {
      mount = document.createElement("div");
      mount.id = "endlessBattleMount";
      mount.dataset.gamePanel = "endless";
      mount.hidden = true;
      stage.appendChild(mount);
    }
    return mount;
  }

  function replaceText(node, from, to) {
    if (!node) return false;
    const current = String(node.textContent || "");
    if (!current.includes(from)) return false;
    const next = current.replace(from, to);
    if (next === current) return false;
    node.textContent = next;
    return true;
  }

  function patchCopy() {
    const endlessButton = document.querySelector('#gameView [data-game-id="endless"]');
    if (endlessButton) {
      if (endlessButton.disabled) endlessButton.disabled = false;
      if (endlessButton.hasAttribute("disabled")) endlessButton.removeAttribute("disabled");
      const small = endlessButton.querySelector("small");
      if (small && small.textContent !== "PLAY") small.textContent = "PLAY";
      if (endlessButton.title !== "戦陣を開く") endlessButton.title = "戦陣を開く";
    }

    const characters = document.getElementById("gameCharacters");
    if (characters && /\/50$/.test(characters.textContent || "")) {
      characters.textContent = String(characters.textContent).replace(/\/50$/, "/100");
    }

    const systemNote = document.querySelector("#gameView .game-system-note p");
    if (systemNote && systemNote.textContent !== SYSTEM_NOTE) systemNote.textContent = SYSTEM_NOTE;

    const recruitNote = document.querySelector("#encyclopediaRecruit .recruit-panel span");
    replaceText(recruitNote, "100名城の訪問登録", "日本100名城・続日本100名城の訪問登録");

    const debugStatus = document.getElementById("gameDebugStatus");
    replaceText(debugStatus, "全50人", "全100人");
  }

  async function installEndless() {
    const loaded = await assetsReady;
    if (!loaded || !window.OnsenEndlessBattle) return false;
    const mount = ensureMount();
    if (!mount) return false;
    if (!endlessInstalled) endlessInstalled = !!(await window.OnsenEndlessBattle.install(mount));
    else window.OnsenEndlessBattle.refresh?.();
    return endlessInstalled;
  }

  async function showEndless() {
    const mount = ensureMount();
    if (!mount) return false;
    for (const button of document.querySelectorAll("#gameView [data-game-id]")) {
      button.classList.toggle("active", button.dataset.gameId === "endless");
    }
    for (const panel of document.querySelectorAll("#gameStage [data-game-panel]")) {
      panel.hidden = panel.dataset.gamePanel !== "endless";
    }
    await installEndless();
    window.OnsenEndlessBattle?.refresh?.();
    patchCopy();
    window.dispatchEvent(new CustomEvent("onsen-game-mode-changed", { detail: { build: BUILD, gameId: "endless" } }));
    return true;
  }

  function patchHubApi() {
    const hub = window.OnsenGameHub;
    if (!hub || hubPatched) return false;
    const originalShowGame = typeof hub.showGame === "function" ? hub.showGame.bind(hub) : null;
    hub.showGame = (id) => {
      if (id === "endless") {
        window.OnsenAppShell?.show?.("game");
        setTimeout(() => showEndless(), 0);
        return;
      }
      originalShowGame?.(id);
    };
    hub.showEndless = () => hub.showGame("endless");
    hub.endlessBuild = BUILD;
    hubPatched = true;
    return true;
  }

  function bindCapture() {
    if (document.documentElement.dataset.gameV681Bound === "1") return;
    document.documentElement.dataset.gameV681Bound = "1";
    document.addEventListener("click", (event) => {
      const endlessButton = event.target instanceof Element ? event.target.closest('#gameView [data-game-id="endless"]') : null;
      if (endlessButton) {
        event.preventDefault();
        event.stopPropagation();
        showEndless().catch((error) => console.warn("show endless failed", error));
        return;
      }
      if (event.target instanceof Element && event.target.closest("#debugUnlockCharacters")) setTimeout(patchCopy, 0);
    }, true);
  }

  function bootPass() {
    ensureMount();
    patchCopy();
    patchHubApi();
  }

  function install() {
    bindCapture();
    bootPass();

    window.addEventListener("onsen-character-runtime-ready", bootPass);
    window.addEventListener("onsen-character-state-changed", patchCopy);
    window.addEventListener("onsen-game-ui-refresh", patchCopy);
    window.addEventListener("onsen-app-tab-changed", (event) => {
      if (event.detail?.tab !== "game") return;
      setTimeout(() => {
        bootPass();
        const endlessActive = document.querySelector('#gameView [data-game-id="endless"]')?.classList.contains("active");
        if (endlessActive) window.OnsenEndlessBattle?.refresh?.();
      }, 30);
    });
    window.addEventListener("pageshow", () => setTimeout(bootPass, 0));

    let attempts = 0;
    bootTimer = setInterval(() => {
      bootPass();
      attempts += 1;
      if ((hubPatched && document.querySelector('#gameView [data-game-id="endless"]')) || attempts >= 60) {
        clearInterval(bootTimer);
        bootTimer = null;
      }
    }, 200);

    window.OnsenGameV68Bridge = { build: BUILD, showEndless, installEndless, patchCopy, ensureMount, bootPass };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
