(() => {
  const BUILD = "v70.6";

  const DEFINITIONS = Object.freeze([
    { id: "domain:castle:050", category: "名城200", kind: "castle_total", required: 50, name: "五十城踏破", description: "日本100名城・続日本100名城から合計50城を訪問する", titleLabel: "五十城巡歴者", rarity: "R" },
    { id: "domain:castle:100", category: "名城200", kind: "castle_total", required: 100, name: "百城踏破", description: "日本100名城・続日本100名城から合計100城を訪問する", titleLabel: "百城巡礼者", rarity: "SR" },
    { id: "domain:castle:original100", category: "名城200", kind: "castle_original", required: 100, name: "日本100名城 制覇", description: "日本100名城を100城すべて訪問する", titleLabel: "日本100名城制覇者", rarity: "SSR" },
    { id: "domain:castle:continued100", category: "名城200", kind: "castle_continued", required: 100, name: "続日本100名城 制覇", description: "続日本100名城を100城すべて訪問する", titleLabel: "続日本100名城制覇者", rarity: "SSR" },
    { id: "domain:castle:200", category: "名城200", kind: "castle_total", required: 200, name: "名城二百踏破", description: "日本100名城・続日本100名城の計200城をすべて訪問する", titleLabel: "名城二百城制覇者", rarity: "LEGEND" },

    { id: "domain:scenic:010", category: "国指定名勝", kind: "scenic_total", required: 10, name: "十景巡歴", description: "国指定名勝を10件訪問する", titleLabel: "十景巡歴者", rarity: "R" },
    { id: "domain:scenic:050", category: "国指定名勝", kind: "scenic_total", required: 50, name: "五十景踏破", description: "国指定名勝を50件訪問する", titleLabel: "五十景踏破者", rarity: "SR" },
    { id: "domain:scenic:100", category: "国指定名勝", kind: "scenic_total", required: 100, name: "百景巡礼", description: "国指定名勝を100件訪問する", titleLabel: "百景巡礼者", rarity: "SSR" },
    { id: "domain:scenic:200", category: "国指定名勝", kind: "scenic_total", required: 200, name: "二百景行脚", description: "国指定名勝を200件訪問する", titleLabel: "二百景行脚人", rarity: "SSR" },
    { id: "domain:scenic:300", category: "国指定名勝", kind: "scenic_total", required: 300, name: "三百景踏破", description: "国指定名勝を300件訪問する", titleLabel: "列島景勝巡礼者", rarity: "LEGEND" },
    { id: "domain:scenic:433", category: "国指定名勝", kind: "scenic_total", required: 433, name: "国指定名勝 全制覇", description: "国指定名勝433件をすべて訪問する", titleLabel: "国指定名勝制覇者", rarity: "LEGEND" },
    { id: "domain:scenic:special10", category: "特別名勝", kind: "scenic_special", required: 10, name: "特別名勝 十景", description: "特別名勝を10件訪問する", titleLabel: "特別名勝巡歴者", rarity: "SR" },
    { id: "domain:scenic:special20", category: "特別名勝", kind: "scenic_special", required: 20, name: "特別名勝 二十景", description: "特別名勝を20件訪問する", titleLabel: "特別名勝行脚人", rarity: "SSR" },
    { id: "domain:scenic:special36", category: "特別名勝", kind: "scenic_special", required: 36, name: "特別名勝 全制覇", description: "特別名勝36件をすべて訪問する", titleLabel: "特別名勝制覇者", rarity: "LEGEND" }
  ].map((definition) => Object.freeze({
    ...definition,
    titleId: `title:${definition.id}`,
    total: definition.required,
    verification: "domain_visit"
  })));

  function castleEntityMap() {
    return new Map((window.OnsenCastleDomain?.data?.entities || []).map((entry) => [String(entry.id), entry]));
  }

  function castleEvidence(kind) {
    const records = window.OnsenCastleVisits?.list?.() || [];
    const entities = castleEntityMap();
    const earliest = new Map();
    for (const record of records) {
      const id = String(record?.entityId || record?.spotId || "");
      if (!id) continue;
      const entity = entities.get(id);
      const no = Number(entity?.japan100No || 0);
      if (kind === "castle_original" && no > 100) continue;
      if (kind === "castle_continued" && no <= 100) continue;
      const at = Number(record.checkedAt || record.recordedAt || Date.now());
      if (!earliest.has(id) || at < earliest.get(id)) earliest.set(id, at);
    }
    return [...earliest.values()].sort((a, b) => a - b);
  }

  function scenicEvidence(specialOnly) {
    const runtime = window.OnsenScenicRuntime;
    const state = runtime?.loadState?.() || { visited: {} };
    const times = [];
    for (const [id, visit] of Object.entries(state.visited || {})) {
      if (specialOnly && runtime?.get?.(id)?.specialScenic !== true) continue;
      times.push(Number(visit?.visitedAt || Date.now()));
    }
    return times.sort((a, b) => a - b);
  }

  function evaluate(definition) {
    let evidence = [];
    const kind = String(definition?.kind || "");
    if (kind.startsWith("castle_")) evidence = castleEvidence(kind);
    else if (kind === "scenic_special") evidence = scenicEvidence(true);
    else if (kind === "scenic_total") evidence = scenicEvidence(false);
    const required = Math.max(0, Number(definition?.required || definition?.total || 0));
    const done = Math.min(evidence.length, required);
    const complete = required > 0 && evidence.length >= required;
    return {
      done,
      total: required,
      complete,
      completedAt: complete ? evidence[required - 1] || Date.now() : null
    };
  }

  function refreshBase() {
    try {
      window.OnsenAchievements?.refresh?.();
      const view = document.getElementById("achievementView");
      if (view && !view.hidden) window.OnsenAchievements?.render?.();
    } catch (error) {
      console.warn("domain achievement base refresh failed", error);
    }
  }

  function notify(reason) {
    window.dispatchEvent(new CustomEvent("onsen-domain-achievements-changed", {
      detail: { build: BUILD, reason }
    }));
    refreshBase();
  }

  window.OnsenDomainAchievements = {
    build: BUILD,
    definitions: () => DEFINITIONS.map((item) => ({ ...item })),
    evaluate,
    reconcile: () => window.OnsenAchievements?.refresh?.() || null,
    render: () => window.OnsenAchievements?.render?.(),
    refresh: refreshBase
  };

  document.getElementById("achievementDomainV702")?.remove();

  for (const eventName of [
    "onsen-castle-visit-changed",
    "onsen-scenic-visit-changed",
    "onsen-castle-visits-ready",
    "onsen-scenic-runtime-ready"
  ]) {
    window.addEventListener(eventName, () => notify(eventName));
  }

  window.addEventListener("pageshow", refreshBase);
  window.dispatchEvent(new CustomEvent("onsen-domain-achievements-ready", {
    detail: { build: BUILD, count: DEFINITIONS.length }
  }));
})();