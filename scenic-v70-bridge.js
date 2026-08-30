(() => {
  const BUILD = "v70";
  let installed = false;
  let bootTimer = null;
  function addStyle(href, id) {
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }
  function addScript(src, id) {
    if (document.getElementById(id)) return Promise.resolve(true);
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.id = id;
      script.src = src;
      script.async = true;
      script.addEventListener("load", () => resolve(true), { once: true });
      script.addEventListener("error", () => { console.warn(`${src} load failed`); resolve(false); }, { once: true });
      document.head.appendChild(script);
    });
  }
  async function bootPass() {
    addStyle("./scenic-collection-ui-v70.css?v=70", "scenicCollectionStyleV70");
    if (!window.OnsenScenicRuntime) {
      const ok = await addScript("./scenic-runtime-v70.js?v=70", "scenicRuntimeV70");
      if (!ok) return false;
    }
    if (!window.OnsenScenicRuntime) return false;
    if (!window.OnsenScenicCollectionUI) await addScript("./scenic-collection-ui-v70.js?v=70", "scenicCollectionUiV70");
    return !!window.OnsenScenicCollectionUI;
  }
  function install() {
    if (installed) return;
    installed = true;
    let attempts = 0;
    bootTimer = setInterval(async () => {
      const done = await bootPass();
      attempts += 1;
      if (done || attempts >= 40) {
        clearInterval(bootTimer);
        bootTimer = null;
      }
    }, 250);
    bootPass();
    window.OnsenScenicV70Bridge = { build: BUILD, bootPass };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
