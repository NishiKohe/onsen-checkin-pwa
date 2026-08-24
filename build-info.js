(() => {
  const version = "v42";
  window.OnsenBuildInfo = { version, updatedAt: "2026-08-24" };

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

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply);
  else apply();
  window.addEventListener("load", apply);
  setTimeout(apply, 2200);
  setTimeout(apply, 5200);
})();