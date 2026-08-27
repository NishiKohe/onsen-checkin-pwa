(() => {
  const version = "v60";
  window.OnsenBuildInfo = { version, updatedAt: "2026-08-27" };

  function apply() {
    document.documentElement.dataset.appBuild = version;
    const badge = document.getElementById("appBuildBadge");
    if (badge) {
      badge.textContent = version;
      const diagnostic = badge.classList.contains("warning") ? " / runtime check要確認" : "";
      badge.title = `温泉チェックイン build ${version}${diagnostic}`;
    }
    if (window.OnsenAppShell) window.OnsenAppShell.build = version;
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

    window.addEventListener("load", async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        await registration?.update?.();
      } catch (err) {
        console.warn("service worker update check skipped", err);
      }
    });
  }

  installRefreshGuard();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply);
  else apply();
  window.addEventListener("load", apply);
  setTimeout(apply, 2200);
  setTimeout(apply, 5200);
})();
