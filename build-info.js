(() => {
  const version = "v68.2";
  const preferredWorker = "./sw.js?v=68.2";
  window.OnsenBuildInfo = { version, updatedAt: "2026-08-29" };

  function ensureGameBridge() {
    if (window.OnsenGameV68Bridge || document.getElementById("gameV68BridgeScript")) return;
    const script = document.createElement("script");
    script.id = "gameV68BridgeScript";
    script.src = "./game-v68-bridge.js?v=68.2";
    script.async = true;
    script.addEventListener("error", () => console.warn("v68.2 game bridge load failed"), { once: true });
    document.head.appendChild(script);
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
    ensureGameBridge();
  }

  async function registerPreferredWorker() {
    if (!("serviceWorker" in navigator)) return null;
    try {
      const registration = await navigator.serviceWorker.register(preferredWorker);
      await registration?.update?.();
      return registration;
    } catch (err) {
      console.warn("v68.2 service worker update check skipped", err);
      return null;
    }
  }

  function patchServiceWorkerRegister() {
    if (!("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    if (sw.__onsenV682RegisterPatched) return;
    try {
      const originalRegister = sw.register.bind(sw);
      sw.register = (scriptURL, options) => {
        const raw = String(scriptURL || "");
        if (/(?:^|\/)sw\.js(?:\?|$)/.test(raw)) return originalRegister(preferredWorker, options);
        return originalRegister(scriptURL, options);
      };
      Object.defineProperty(sw, "__onsenV682RegisterPatched", { value: true, configurable: false });
    } catch (error) {
      console.warn("v68.2 service worker register patch skipped", error);
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
  ensureGameBridge();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply);
  else apply();
  window.addEventListener("load", apply);
  setTimeout(apply, 600);
  setTimeout(apply, 1600);
})();