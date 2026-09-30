(() => {
  "use strict";
  const BUILD = "v73.11";
  const LABELS = { onsen: "温泉", castle: "城", scenic: "名勝" };
  let busy = false, lastResult = null;
  const node = id => document.getElementById(id);
  function ready() {
    return typeof spots !== "undefined" && spots.length > 0 &&
      typeof getNearestZoneStatus === "function" && typeof saveCheckins === "function" &&
      !!window.OnsenCastleVisits?.registerStrictGpsVisit && !!window.OnsenCastleMap?.zones?.()?.entries?.length &&
      !!window.OnsenScenicRuntime?.entries?.()?.length && !!window.OnsenScenicRuntime?.registerGpsVisit;
  }
  function evaluate(fix) {
    if (!ready()) throw new Error("地点データを読み込み中です。少し待ってから押してください。");
    if (![fix.lat, fix.lng, fix.accuracyM, fix.sampledAt].every(Number.isFinite) ||
        Math.abs(fix.lat) > 90 || Math.abs(fix.lng) > 180 || fix.accuracyM < 0 ||
        Date.now() - fix.sampledAt > 120000 || fix.sampledAt > Date.now() + 10000) {
      throw new Error("新しい位置情報を取得できませんでした。もう一度お試しください。");
    }
    const matches = [], inaccurate = [];
    const add = (domain, item, zone, distanceM, limit) => {
      if (distanceM > zone.radiusM) return;
      const match = { domain, id: String(item.id), name: item.name, zone, distanceM };
      (fix.accuracyM <= limit ? matches : inaccurate).push(match);
    };
    const onsenLimit = Number(window.OnsenCheckinPolicy?.gpsAccuracyLimitM || 60);
    for (const item of spots) {
      const nearest = getNearestZoneStatus(item, fix);
      if (nearest?.inRange) add("onsen", item, nearest.zone, nearest.distanceToCenterM, onsenLimit);
    }
    const castles = new Map((window.OnsenCastleDomain?.data?.entities || []).map(item => [String(item.id), item]));
    for (const raw of window.OnsenCastleMap.zones().entries) {
      const item = castles.get(String(raw.castleId));
      if (!item || !Number.isFinite(Number(raw.lat)) || !Number.isFinite(Number(raw.lng))) continue;
      const zone = { ...raw, radiusM: Math.max(500, Number(raw.radiusM) || 750) };
      const meters = distanceM(fix.lat, fix.lng, Number(zone.lat), Number(zone.lng));
      add("castle", item, zone, meters, Math.max(500, Number(zone.accuracyRequiredM) || 500));
    }
    const scenic = window.OnsenScenicRuntime;
    // Evaluate each place once, even when more than one of its zones contains the fix.
    for (const item of scenic.entries()) {
      const evaluation = scenic.evaluatePosition(fix, item.id);
      if (evaluation.ok) {
        const best = evaluation.best;
        matches.push({ domain: "scenic", id: String(item.id), name: item.name, zone: best.zone, distanceM: best.distanceM });
      } else if ((scenic.auditedZones(item) || []).some(zone =>
        distanceM(fix.lat, fix.lng, zone.lat, zone.lng) <= zone.radiusM && fix.accuracyM > zone.accuracyRequiredM)) {
        inaccurate.push({ domain: "scenic", id: String(item.id), name: item.name });
      }
    }
    const unique = list => [...new Map(list.map(item => [`${item.domain}:${item.id}`, item])).values()];
    return { matches: unique(matches), inaccurate: unique(inaccurate) };
  }
  function collect(fix) {
    const { matches, inaccurate } = evaluate(fix);
    const result = { acquired: [], already: [], failed: [], inaccurate, accuracyM: fix.accuracyM, checkedAt: Date.now() };
    const onsen = matches.filter(item => item.domain === "onsen");
    const pending = [];
    for (const match of onsen) {
      (isCooldownActive(match.id) ? result.already : pending).push(match);
    }
    if (pending.length) {
      try {
        const records = loadCheckins();
        for (const item of pending) records.push({
          spotId: item.id, name: item.name, prefecture: spots.find(spot => String(spot.id) === item.id)?.prefecture,
          checkedAt: result.checkedAt, accuracyM: fix.accuracyM, lat: fix.lat, lng: fix.lng,
          sampledAt: fix.sampledAt, zoneLabel: item.zone.label || null,
          entityType: "onsen", verificationType: "gps_manual", verificationLevel: "onsite",
          recordSource: "unified_checkin_button", verifiedAt: result.checkedAt
        });
        saveCheckins(records);
        result.acquired.push(...pending);
      } catch (error) { console.warn("Unified onsen save failed", error); result.failed.push(...pending); }
    }
    for (const item of matches.filter(match => match.domain !== "onsen")) {
      try {
        const saved = item.domain === "castle"
          ? window.OnsenCastleVisits.registerStrictGpsVisit(item.id, {
            ...fix, checkedAt: result.checkedAt, distanceM: item.distanceM, radiusM: item.zone.radiusM,
            coordinateSource: item.zone.coordinateStatus || "castle_zone", coordinateVerification: "unified_gps",
            freshFix: true, recordSource: "unified_checkin_button"
          })
          : window.OnsenScenicRuntime.registerGpsVisit(item.id, fix);
        (saved?.ok ? saved.already ? result.already : result.acquired : result.failed).push(item);
      } catch (error) { console.warn("Unified place save failed", item.domain, item.id, error); result.failed.push(item); }
    }
    // Preserve existing persistence hooks and domain events so achievements and character rewards run normally.
    window.dispatchEvent(new CustomEvent("onsen-checkin-completed", { detail: { build: BUILD, ...result } }));
    return result;
  }
  function requestPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("この端末では位置情報を取得できません。"));
      const timeout = setTimeout(() => reject(new Error("位置情報の取得がタイムアウトしました。電波の届く場所で再度お試しください。")), 16000);
      navigator.geolocation.getCurrentPosition(position => {
        clearTimeout(timeout);
        resolve({ lat: position.coords.latitude, lng: position.coords.longitude, accuracyM: position.coords.accuracy, sampledAt: position.timestamp });
      }, error => {
        clearTimeout(timeout);
        reject(new Error(error.code === 1 ? "位置情報の利用を許可してから、もう一度押してください。" : "現在地を取得できませんでした。電波の届く場所で再度お試しください。"));
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
    });
  }
  function feedback(text) { const status = node("unifiedCheckinStatus"); if (status) status.textContent = text; }
  function showResult(result) {
    const d = node("unifiedCheckinResult"), body = node("unifiedCheckinResultBody");
    if (!d || !body) return;
    body.replaceChildren();
    const title = result.acquired.length ? `${result.acquired.length}件を取得しました` : result.failed.length ? "保存できなかった地点があります" : "新しい取得はありません";
    node("unifiedCheckinResultTitle").textContent = title;
    const summary = document.createElement("p");
    summary.textContent = `GPS精度 約${Math.round(result.accuracyM)}m。温泉・城・名勝をまとめて確認しました。`;
    body.append(summary);
    for (const [key, label] of [["acquired", "今回取得"], ["already", "取得済み"], ["inaccurate", "GPS精度不足"], ["failed", "保存失敗・再試行が必要"]]) {
      if (!result[key].length) continue;
      const section = document.createElement("section"), h = document.createElement("h3"), ul = document.createElement("ul");
      h.textContent = `${label}（${result[key].length}件）`;
      for (const item of result[key]) { const li = document.createElement("li"); li.textContent = `${LABELS[item.domain]} · ${item.name}`; ul.append(li); }
      section.append(h, ul); body.append(section);
    }
    const note = document.createElement("p");
    note.className = "unified-checkin-note";
    note.textContent = result.inaccurate.length ? "精度不足の地点は、空の開けた場所で再度お試しください。" : "温泉は24時間以内、城・名勝はGPS取得済みの地点を重複取得しません。";
    if (![result.acquired, result.already, result.inaccurate, result.failed].some(items => items.length)) {
      note.textContent = "現在地は登録されているチェックイン範囲外です。地点の「詳細を見る」で対象範囲を確認できます。";
    }
    body.append(note);
    if (!d.open && document.documentElement.dataset.appTab === "map") d.showModal();
    feedback(title);
  }
  function refreshMap() {
    // Rendering errors must never turn a successfully saved visit into a reported failure.
    for (const refresh of [
      () => { renderStats(); renderHistory(); refreshSpotSource(); },
      () => window.OnsenCastleMap?.refresh?.(),
      () => window.OnsenScenicMapV71?.refresh?.(),
      () => window.OnsenMapDetailCompactV737?.refresh?.()
    ]) { try { refresh(); } catch (error) { console.warn("Check-in display refresh failed", error); } }
  }
  async function run() {
    if (busy) return null;
    busy = true;
    const profileId = profile();
    const button = node("unifiedCheckinButton");
    if (button) { button.disabled = true; button.textContent = "現在地を確認しています…"; button.setAttribute("aria-busy", "true"); }
    feedback("この位置から取得できるすべての地点を確認します");
    try {
      if (!ready()) throw new Error("地点データを読み込み中です。少し待ってから押してください。");
      const fix = await requestPosition();
      // Keep the same user profile for the whole transaction; switching profiles cancels this fix.
      if (profileId !== profile()) throw new Error("プロフィールが切り替わりました。もう一度押してください。");
      lastResult = collect(fix);
      if (typeof userPos !== "undefined") { userPos = { lat: fix.lat, lng: fix.lng }; userAccuracyM = fix.accuracyM; }
      refreshMap(); showResult(lastResult);
      return lastResult;
    } catch (error) { feedback(error.message || "チェックインできませんでした。もう一度お試しください。"); return null; }
    finally { busy = false; if (button) { button.disabled = false; button.textContent = "まとめてチェックイン"; button.removeAttribute("aria-busy"); } }
  }
  function profile() { return window.OnsenUserStorage?.getCurrentProfileId?.() || null; }
  function install() {
    const button = node("unifiedCheckinButton"); if (!button) return;
    button.disabled = false; button.textContent = "まとめてチェックイン";
    button.addEventListener("click", run);
    node("unifiedCheckinResultClose")?.addEventListener("click", () => node("unifiedCheckinResult").close());
    node("unifiedCheckinResult")?.addEventListener("close", () => button.focus({ preventScroll: true }));
    window.addEventListener("onsen-app-tab-changed", event => { if (event.detail?.tab !== "map") node("unifiedCheckinResult")?.close(); });
  }
  window.OnsenUnifiedCheckin = { build: BUILD, evaluate, run, diagnostics: () => ({ ready: ready(), busy, lastResult }) };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true }); else install();
})();
