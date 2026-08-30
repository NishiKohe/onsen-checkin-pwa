(() => {
  const BUILD = "v69";
  if (window.__onsenEquipmentBattleSyncV69) return;
  window.__onsenEquipmentBattleSyncV69 = true;
  const EQUIPMENT_REASONS = new Set(["equipment_crafted", "equipment_equipped"]);
  window.addEventListener("onsen-progression-state-changed", (event) => {
    if (!EQUIPMENT_REASONS.has(String(event.detail?.reason || ""))) return;
    window.dispatchEvent(new CustomEvent("onsen-character-state-changed", {
      detail: { build: BUILD, reason: "equipment_stats_changed", equipment: true }
    }));
    setTimeout(() => window.OnsenProgressionRuntime?.decorateEndless?.(), 40);
  });
})();
