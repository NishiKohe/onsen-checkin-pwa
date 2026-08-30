(() => {
  const BUILD = "v69";
  const STATE_KEY = "progressionStateV1";

  const MATERIALS = Object.freeze({
    stone: { id: "stone", name: "砕石", rarity: "N" },
    copper: { id: "copper", name: "銅鉱石", rarity: "N" },
    coal: { id: "coal", name: "石炭", rarity: "N" },
    iron: { id: "iron", name: "鉄鉱石", rarity: "R" },
    silver: { id: "silver", name: "銀鉱石", rarity: "SR" },
    gold: { id: "gold", name: "金鉱石", rarity: "SSR" },
    crystal: { id: "crystal", name: "湯晶石", rarity: "LEGEND" }
  });

  const RECIPES = Object.freeze({
    copper_tachi: { id: "copper_tachi", name: "銅打刀", slot: "weapon", rarity: "N", materials: { copper: 12, coal: 4 }, bonuses: { attackPct: 0.05 }, note: "扱いやすい初級武器。戦陣・RPGの攻撃力を上げる。" },
    iron_spear: { id: "iron_spear", name: "鉄槍", slot: "weapon", rarity: "R", materials: { iron: 15, coal: 6 }, bonuses: { attackPct: 0.09 }, note: "堅実な鉄製武器。攻撃力を大きく強化。" },
    gold_tachi: { id: "gold_tachi", name: "金剛打刀", slot: "weapon", rarity: "SSR", materials: { gold: 8, iron: 10, crystal: 2 }, bonuses: { attackPct: 0.16 }, note: "希少鉱石を使った上級武器。" },
    iron_kabuto: { id: "iron_kabuto", name: "鉄兜", slot: "helmet", rarity: "R", materials: { iron: 12, coal: 5 }, bonuses: { hpPct: 0.08 }, note: "部隊の耐久力を上げる基本兜。" },
    silver_kabuto: { id: "silver_kabuto", name: "銀飾兜", slot: "helmet", rarity: "SR", materials: { silver: 10, iron: 8 }, bonuses: { hpPct: 0.12, attackPct: 0.02 }, note: "防御と攻撃を同時に補う上級兜。" },
    iron_dou: { id: "iron_dou", name: "鉄胴", slot: "armor", rarity: "R", materials: { iron: 20, coal: 8 }, bonuses: { hpPct: 0.14 }, note: "戦陣の味方HPを大きく上げる。" },
    kongou_dou: { id: "kongou_dou", name: "金剛胴", slot: "armor", rarity: "SSR", materials: { gold: 10, iron: 16, crystal: 2 }, bonuses: { hpPct: 0.22, attackPct: 0.03 }, note: "希少素材製の重装。攻守を強化。" },
    silver_omamori: { id: "silver_omamori", name: "銀の御守", slot: "charm", rarity: "SR", materials: { silver: 8, crystal: 1 }, bonuses: { senkoPct: 0.10 }, note: "戦陣の獲得戦功を増やす。" },
    yushou_talisman: { id: "yushou_talisman", name: "湯晶の護符", slot: "charm", rarity: "LEGEND", materials: { crystal: 6, gold: 3 }, bonuses: { senkoPct: 0.18, miningRarePct: 0.06, attackPct: 0.03 }, note: "採掘レア率・戦功・攻撃をまとめて強化。" }
  });

  const SLOT_LABELS = Object.freeze({ weapon: "武器", helmet: "兜", armor: "胴", charm: "護符" });
  function storage() { return window.OnsenUserStorage || null; }
  function readRaw() { const raw = storage()?.readUserItem?.(STATE_KEY); if (raw != null) { try { return JSON.parse(raw); } catch {} } try { return JSON.parse(localStorage.getItem(STATE_KEY) || "null"); } catch { return null; } }
  function writeRaw(value) { const text = JSON.stringify(value); if (storage()?.writeUserItem) storage().writeUserItem(STATE_KEY, text); else localStorage.setItem(STATE_KEY, text); }
  function defaultState() { return { schemaVersion: 1, materials: Object.fromEntries(Object.keys(MATERIALS).map((id) => [id, 0])), crafted: {}, equipped: { weapon: null, helmet: null, armor: null, charm: null }, mining: { runs: 0, swings: 0, perfects: 0, goods: 0, misses: 0, totalItems: 0, lastYield: null }, updatedAt: Date.now() }; }
  function normalize(raw) {
    const base = defaultState(), state = raw && typeof raw === "object" ? raw : {}, materials = { ...base.materials };
    for (const id of Object.keys(materials)) materials[id] = Math.max(0, Math.floor(Number(state.materials?.[id] || 0)));
    const crafted = {}; for (const [id, count] of Object.entries(state.crafted || {})) if (RECIPES[id]) crafted[id] = Math.max(0, Math.floor(Number(count || 0)));
    const equipped = { ...base.equipped, ...(state.equipped || {}) };
    for (const slot of Object.keys(base.equipped)) { const recipeId = equipped[slot]; if (!recipeId || !RECIPES[recipeId] || RECIPES[recipeId].slot !== slot || !crafted[recipeId]) equipped[slot] = null; }
    return { ...base, ...state, schemaVersion: 1, materials, crafted, equipped, mining: { ...base.mining, ...(state.mining || {}) } };
  }
  function loadState() { return normalize(readRaw()); }
  function saveState(state, reason = "update") { const next = normalize(state); next.updatedAt = Date.now(); writeRaw(next); window.dispatchEvent(new CustomEvent("onsen-progression-state-changed", { detail: { build: BUILD, reason, state: next } })); return next; }
  function addMaterials(rewards, reason = "mining_reward") { const state = loadState(); let total = 0; for (const [id, amount] of Object.entries(rewards || {})) { if (!MATERIALS[id]) continue; const gain = Math.max(0, Math.floor(Number(amount || 0))); if (!gain) continue; state.materials[id] = Number(state.materials[id] || 0) + gain; total += gain; } if (!total) return state; state.mining.totalItems = Number(state.mining.totalItems || 0) + total; return saveState(state, reason); }
  function recordMiningRun(summary = {}) { const state = loadState(); state.mining.runs = Number(state.mining.runs || 0) + 1; state.mining.swings = Number(state.mining.swings || 0) + Math.max(0, Math.floor(Number(summary.swings || 0))); state.mining.perfects = Number(state.mining.perfects || 0) + Math.max(0, Math.floor(Number(summary.perfects || 0))); state.mining.goods = Number(state.mining.goods || 0) + Math.max(0, Math.floor(Number(summary.goods || 0))); state.mining.misses = Number(state.mining.misses || 0) + Math.max(0, Math.floor(Number(summary.misses || 0))); state.mining.lastYield = { ...(summary.yield || {}), recordedAt: Date.now(), regionId: summary.regionId || "unknown" }; return saveState(state, "mining_run_complete"); }
  function canCraft(recipeId, state = loadState()) { const recipe = RECIPES[String(recipeId || "")]; return !!recipe && Object.entries(recipe.materials).every(([id, need]) => Number(state.materials[id] || 0) >= Number(need)); }
  function craft(recipeId) { const id = String(recipeId || ""), recipe = RECIPES[id]; if (!recipe) return { ok: false, reason: "unknown_recipe", state: loadState() }; const state = loadState(); if (!canCraft(id, state)) return { ok: false, reason: "materials", state }; for (const [materialId, need] of Object.entries(recipe.materials)) state.materials[materialId] -= Number(need); state.crafted[id] = Number(state.crafted[id] || 0) + 1; let autoEquipped = false; if (!state.equipped[recipe.slot]) { state.equipped[recipe.slot] = id; autoEquipped = true; } const saved = saveState(state, "equipment_crafted"); return { ok: true, recipe, autoEquipped, state: saved }; }
  function equip(recipeId) { const id = String(recipeId || ""), recipe = RECIPES[id], state = loadState(); if (!recipe || !Number(state.crafted[id] || 0)) return { ok: false, reason: "not_owned", state }; state.equipped[recipe.slot] = id; const saved = saveState(state, "equipment_equipped"); return { ok: true, recipe, state: saved }; }
  function equippedItems(state = loadState()) { return Object.entries(state.equipped).map(([slot, id]) => ({ slot, item: id ? RECIPES[id] || null : null })).filter((entry) => entry.item); }
  function combatBonuses(state = loadState()) { const result = { attackPct: 0, hpPct: 0, senkoPct: 0, miningRarePct: 0 }; for (const { item } of equippedItems(state)) for (const key of Object.keys(result)) result[key] += Number(item.bonuses?.[key] || 0); return result; }
  function waveBaseSenko(wave) { const w = Math.max(1, Number(wave || 1)), major = w % 50 === 0, boss = w % 10 === 0; return Math.max(2, Math.round((3 + Math.pow(w, 0.62)) * (major ? 8 : boss ? 4 : 1))); }

  let catalogPatched = false, senkoBridgeBound = false, applyingSenkoBonus = false;
  function installCombatBridge() {
    const characters = window.OnsenCharacterRuntime;
    if (characters?.catalog && !catalogPatched) {
      const originalCatalog = characters.catalog.bind(characters);
      characters.catalog = () => { const bonus = combatBonuses(), hpMulti = Math.max(0.1, 1 + Number(bonus.hpPct || 0)), attackMulti = Math.max(0.1, 1 + Number(bonus.attackPct || 0)); return originalCatalog().map((character) => { const combat = character?.combat || {}, basePower = Number(combat.basePower || 100), attackIntervalMs = Math.max(1, Number(combat.attackIntervalMs || 1100)); return { ...character, combat: { ...combat, basePower: basePower * hpMulti, attackIntervalMs: attackIntervalMs * hpMulti / attackMulti } }; }); };
      catalogPatched = true; characters.equipmentBridgeBuild = BUILD;
    }
    if (!senkoBridgeBound) {
      senkoBridgeBound = true;
      window.addEventListener("onsen-endless-state-changed", (event) => {
        if (applyingSenkoBonus || event.detail?.reason !== "wave_clear") return;
        const pct = Number(combatBonuses().senkoPct || 0); if (pct <= 0 || !window.OnsenEndlessBattle?.loadState || !window.OnsenEndlessBattle?.saveState) return;
        const clearedWave = Math.max(1, Number(event.detail?.state?.currentWave || 2) - 1), extra = Math.max(0, Math.floor(waveBaseSenko(clearedWave) * pct)); if (!extra) return;
        applyingSenkoBonus = true; try { const state = window.OnsenEndlessBattle.loadState(); state.senko = Number(state.senko || 0) + extra; state.totalSenko = Number(state.totalSenko || 0) + extra; window.OnsenEndlessBattle.saveState(state, "equipment_senko_bonus"); } finally { applyingSenkoBonus = false; }
      });
    }
    return catalogPatched;
  }
  function decorateEndless() { const meta = document.querySelector("#endlessBattleMount .endless-meta"); if (!meta) return; let node = document.getElementById("endlessEquipmentV69"); if (!node) { node = document.createElement("div"); node.id = "endlessEquipmentV69"; node.className = "endless-equipment-v69"; meta.insertAdjacentElement("afterend", node); } const b = combatBonuses(); node.textContent = `装備補正　攻撃 +${Math.round(b.attackPct*100)}% / HP +${Math.round(b.hpPct*100)}% / 戦功 +${Math.round(b.senkoPct*100)}%`; }
  function snapshot() { const state = loadState(); return { build: BUILD, state, bonuses: combatBonuses(state), materials: MATERIALS, recipes: RECIPES }; }

  window.addEventListener("onsen-character-runtime-ready", () => installCombatBridge());
  window.addEventListener("onsen-game-mode-changed", (event) => { if (event.detail?.gameId === "endless") setTimeout(decorateEndless, 50); });
  window.addEventListener("onsen-progression-state-changed", () => { installCombatBridge(); setTimeout(decorateEndless, 0); });
  let bridgeAttempts = 0; const bridgeTimer = setInterval(() => { installCombatBridge(); bridgeAttempts += 1; if (catalogPatched || bridgeAttempts >= 60) clearInterval(bridgeTimer); }, 200);

  window.OnsenProgressionRuntime = { build: BUILD, stateKey: STATE_KEY, materials: MATERIALS, recipes: RECIPES, slotLabels: SLOT_LABELS, loadState, saveState, addMaterials, recordMiningRun, canCraft, craft, equip, equippedItems, combatBonuses, installCombatBridge, decorateEndless, snapshot };
  window.dispatchEvent(new CustomEvent("onsen-progression-runtime-ready", { detail: { build: BUILD } }));
})();
