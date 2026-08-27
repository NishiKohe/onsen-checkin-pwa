(() => {
  const BUILD = "v61";
  const EXTRA_KEYS = ["gameStateV1", "characterStateV1", "castleVisitsV1"];
  function install() {
    const storage = window.OnsenUserStorage;
    if (!storage || storage.gameExtensionBuild === BUILD) return false;
    const baseExport = storage.exportCurrentUserData?.bind(storage);
    if (baseExport) {
      storage.exportCurrentUserData = function exportWithGameData() {
        const result = baseExport();
        result.data = result.data || {};
        for (const key of EXTRA_KEYS) {
          const raw = storage.readUserItem?.(key);
          if (raw == null) continue;
          try { result.data[key] = JSON.parse(raw); } catch { result.data[key] = raw; }
        }
        result.schemaVersion = Math.max(Number(result.schemaVersion || 0), 5);
        return result;
      };
    }
    storage.gameExtensionBuild = BUILD;
    storage.extraUserKeys = EXTRA_KEYS.slice();
    return true;
  }
  if (!install()) {
    const timer = setInterval(() => { if (install()) clearInterval(timer); }, 50);
    setTimeout(() => clearInterval(timer), 10000);
  }
})();