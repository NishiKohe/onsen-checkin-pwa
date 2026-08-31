(() => {
  const version = "v70.12";
  const preferredWorker = "./sw.js?v=70.12";
  window.OnsenBuildInfo = { version, updatedAt: "2026-08-31" };

  function addBridge({ globalName, id, src, label }) {
    if (window[globalName] || document.getElementById(id)) return;
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.addEventListener("error", () => console.warn(`${label} load failed`), { once: true });
    document.head.appendChild(script);
  }

  function ensureBridges() {
    addBridge({ globalName: "OnsenGameV68Bridge", id: "gameV68BridgeScript", src: "./game-v68-bridge.js?v=68.2", label: "v68.2 game bridge" });
    addBridge({ globalName: "OnsenGameV69Bridge", id: "gameV69BridgeScript", src: "./game-v69-bridge.js?v=69.1", label: "v69.1 mining bridge" });
    addBridge({ globalName: "__onsenEquipmentBattleSyncV69", id: "equipmentBattleSyncV69", src: "./equipment-battle-sync-v69.js?v=69", label: "v69 equipment battle sync" });
    addBridge({ globalName: "OnsenUiRecoveryV701", id: "uiRecoveryV701Script", src: "./ui-recovery-v701.js?v=70.1", label: "v70.1 UI recovery" });
    addBridge({ globalName: "OnsenDomainAchievements", id: "achievementDomainV702Script", src: "./achievement-domain-v702.js?v=70.8", label: "v70.8 domain achievements" });
    addBridge({ globalName: "OnsenScenicV70Bridge", id: "scenicV70BridgeScript", src: "./scenic-v70-bridge.js?v=70.10", label: "v70.10 scenic bridge" });
  }

  function apply() {
    document.documentElement.dataset.appBuild = version;
    const badge = document.getElementById("appBuildBadge");
    if (badge) {
      badge.textContent = version;
      const diagnostic = badge.classList.contains("warning") ? " / runtime check要確認" : "";
      badge.title = `温泉チェックイン build ${version}${diagnostic}`;
    }
    if (window.OnsenAppShell) window.OnsenAppShell.build = version;
    ensureBridges();
  }

  async function registerPreferredWorker() {
    if (!("serviceWorker" in navigator)) return null;
    try {
      const registration = await navigator.serviceWorker.register(preferredWorker);
      await registration?.update?.();
      return registration;
    } catch (err) {
      console.warn("v70.12 service worker update check skipped", err);
      return null;
    }
  }

  function patchServiceWorkerRegister() {
    if (!("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    if (sw.__onsenV7012RegisterPatched) return;
    try {
      const originalRegister = sw.register.bind(sw);
      sw.register = (scriptURL, options) => {
        const raw = String(scriptURL || "");
        if (/(?:^|\/)sw\.js(?:\?|$)/.test(raw)) return originalRegister(preferredWorker, options);
        return originalRegister(scriptURL, options);
      };
      Object.defineProperty(sw, "__onsenV7012RegisterPatched", { value: true, configurable: false });
    } catch (error) {
      console.warn("v70.12 service worker register patch skipped", error);
    }
  }

  function installRefreshGuard() {
    if (!("serviceWorker" in navigator)) return;
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      const key = `onsenBuildControllerReload:${version}`;
      if (sessionStorage.getItem(key) === "1") return;
      refreshing = true;
      sessionStorage.setItem(key, "1");
      location.reload();
    });
    window.addEventListener("load", () => {
      registerPreferredWorker();
      setTimeout(registerPreferredWorker, 800);
      setTimeout(registerPreferredWorker, 2200);
    });
  }

  patchServiceWorkerRegister();
  installRefreshGuard();
  ensureBridges();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply);
  else apply();
  window.addEventListener("load", apply);
  setTimeout(apply, 600);
  setTimeout(apply, 1600);
})();