(() => {
  const version = "v73.1";
  const preferredWorker = "./sw.js?v=73.1";
  window.OnsenBuildInfo = { version, updatedAt: "2026-09-11" };

  function addBridge({ globalName, id, src, label }) {
    if (window[globalName] || document.getElementById(id)) return;
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.addEventListener("error", () => console.warn(`${label} load failed`), { once: true });
    document.head.appendChild(script);
  }

  function addStyle({ id, href }) {
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function precreateMapDomainSwitch() {
    const shell = document.querySelector(".map-shell");
    if (!shell) return null;
    let root = document.getElementById("mapDomainSwitchV62");
    if (!root) {
      root = document.createElement("div");
      root.id = "mapDomainSwitchV62";
      root.className = "map-domain-switch-v62";
      root.setAttribute("aria-label", "地図カテゴリ切替");
      root.innerHTML = '<button type="button" data-map-domain="onsen">♨<span>温泉</span></button><button type="button" data-map-domain="castle">🏯<span>名城200</span></button><button type="button" data-map-domain="scenic">◇<span>名勝</span></button>';
      shell.appendChild(root);
    }
    return root;
  }

  function ensureBridges() {
    addBridge({ globalName: "OnsenGameV68Bridge", id: "gameV68BridgeScript", src: "./game-v68-bridge.js?v=68.2", label: "v68.2 game bridge" });
    addBridge({ globalName: "OnsenGameV69Bridge", id: "gameV69BridgeScript", src: "./game-v69-bridge.js?v=69.1", label: "v69.1 mining bridge" });
    addBridge({ globalName: "__onsenEquipmentBattleSyncV69", id: "equipmentBattleSyncV69", src: "./equipment-battle-sync-v69.js?v=69", label: "v69 equipment battle sync" });
    addBridge({ globalName: "OnsenUiRecoveryV701", id: "uiRecoveryV701Script", src: "./ui-recovery-v701.js?v=70.1", label: "v70.1 UI recovery" });
    addBridge({ globalName: "OnsenDomainAchievements", id: "achievementDomainV702Script", src: "./achievement-domain-v702.js?v=72.1", label: "v72.1 domain achievements" });
    addBridge({ globalName: "OnsenAchievementDomainV721", id: "achievementDomainControllerV721Script", src: "./achievement-domain-controller-v721.js?v=72.1", label: "v72.1 achievement domain controller" });
    addBridge({ globalName: "OnsenMapDomainV73", id: "mapDomainControllerV73Script", src: "./map-domain-controller-v72.js?v=73", label: "v73 map domain controller" });
    addBridge({ globalName: "OnsenScenicV71Bridge", id: "scenicV71BridgeScript", src: "./scenic-v70-bridge.js?v=73", label: "v73 scenic bridge" });
    addBridge({ globalName: "OnsenTravelDomainRecoveryV731", id: "travelDomainRecoveryV731Script", src: "./travel-domain-recovery-v728.js?v=73.1", label: "v73.1 travel candidate runtime" });
    addBridge({ globalName: "OnsenPhotoExifV731", id: "photoExifV731Script", src: "./photo-exif-runtime-v731.js?v=73.1", label: "v73.1 photo EXIF runtime" });
    addBridge({ globalName: "OnsenTripManualRecoveryV731", id: "tripManualRecoveryV731Script", src: "./trip-manual-recovery-v731.js?v=73.1", label: "v73.1 manual trip recovery" });
    addBridge({ globalName: "OnsenTripPhotoRecoveryV731", id: "tripPhotoRecoveryV731Script", src: "./trip-photo-recovery-v731.js?v=73.1", label: "v73.1 photo trip recovery" });
    addStyle({ id: "scenicMapStyleV71", href: "./scenic-map-v71.css?v=73" });
  }

  function apply() {
    precreateMapDomainSwitch();
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
      console.warn("v73.1 service worker update check skipped", err);
      return null;
    }
  }

  function patchServiceWorkerRegister() {
    if (!("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    if (sw.__onsenV731RegisterPatched) return;
    try {
      const originalRegister = sw.register.bind(sw);
      sw.register = (scriptURL, options) => {
        const raw = String(scriptURL || "");
        if (/(?:^|\/)sw\.js(?:\?|$)/.test(raw)) return originalRegister(preferredWorker, options);
        return originalRegister(scriptURL, options);
      };
      Object.defineProperty(sw, "__onsenV731RegisterPatched", { value: true, configurable: false });
    } catch (error) {
      console.warn("v73.1 service worker register patch skipped", error);
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
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      precreateMapDomainSwitch();
      apply();
    }, { once: true });
  } else apply();
  window.addEventListener("load", apply);
  setTimeout(apply, 600);
  setTimeout(apply, 1600);
})();