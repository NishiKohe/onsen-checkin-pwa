(() => {
  const BUILD = "v70.2";
  let installed = false;

  function addStyle(href, id) {
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function waitFor(test, timeoutMs = 10000, intervalMs = 50) {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      const tick = () => {
        let value = null;
        try { value = test(); } catch {}
        if (value) { resolve(value); return; }
        if (Date.now() - startedAt >= timeoutMs) { resolve(null); return; }
        setTimeout(tick, intervalMs);
      };
      tick();
    });
  }

  function loadScriptOnce(src, id) {
    return new Promise((resolve) => {
      const existing = document.getElementById(id);
      if (existing) {
        if (existing.dataset.loaded === "1") { resolve(true); return; }
        existing.addEventListener("load", () => resolve(true), { once: true });
        existing.addEventListener("error", () => resolve(false), { once: true });
        setTimeout(() => resolve(existing.dataset.loaded === "1"), 10000);
        return;
      }
      const script = document.createElement("script");
      script.id = id;
      script.src = src;
      script.async = true;
      script.addEventListener("load", () => { script.dataset.loaded = "1"; resolve(true); }, { once: true });
      script.addEventListener("error", () => { console.warn(`${src} load failed`); resolve(false); }, { once: true });
      document.head.appendChild(script);
    });
  }

  async function boot() {
    addStyle("./scenic-collection-ui-v70.css?v=70.2", "scenicCollectionStyleV70");

    const shellReady = await waitFor(() => document.querySelector("#collectionView .collection-shell"), 8000);
    if (!shellReady) {
      console.warn("v70.2 scenic bridge: collection shell not ready");
      return false;
    }

    if (!window.OnsenScenicRuntime) {
      const loaded = await loadScriptOnce("./scenic-runtime-v70.js?v=70.2", "scenicRuntimeV70");
      if (!loaded) return false;
    }
    const runtime = await waitFor(() => window.OnsenScenicRuntime, 12000);
    if (!runtime) {
      console.warn("v70.2 scenic bridge: runtime not ready");
      return false;
    }

    const collectionSwitcher = await waitFor(() => document.querySelector("#collectionView .collection-domain-switch"), 10000);
    if (!collectionSwitcher) {
      console.warn("v70.2 scenic bridge: collection domain switch not ready");
      return false;
    }

    if (!window.OnsenScenicCollectionUI) {
      const loaded = await loadScriptOnce("./scenic-collection-ui-v70.js?v=70.2", "scenicCollectionUiV70");
      if (!loaded) return false;
    }
    const ui = await waitFor(() => window.OnsenScenicCollectionUI, 10000);
    if (!ui) {
      console.warn("v70.2 scenic bridge: collection UI not ready");
      return false;
    }

    const achievements = await waitFor(() => window.OnsenAchievements && document.getElementById("achievementView"), 12000);
    if (achievements && !window.OnsenDomainAchievements) {
      await loadScriptOnce("./achievement-domain-v702.js?v=70.2", "achievementDomainV702Script");
    }

    window.dispatchEvent(new CustomEvent("onsen-scenic-v702-ready", { detail: { build: BUILD } }));
    return true;
  }

  function install() {
    if (installed) return;
    installed = true;
    boot().catch((error) => console.warn("v70.2 scenic bridge boot failed", error));
    window.OnsenScenicV70Bridge = { build: BUILD, boot };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();