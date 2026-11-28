(function (root) {
  "use strict";
  const MAX_BYTES = 10 * 1024 * 1024, MAX_POINTS = 50000, MARGIN_M = 300;
  const rad = x => x * Math.PI / 180;
  const day = time => new Date(time).toISOString().slice(0, 10);
  const direct = (node, name) => [...node.children].find(c => c.localName === name);
  function parseGpx(xml, now = Date.now()) {
    if (typeof xml !== "string" || new TextEncoder().encode(xml).length > MAX_BYTES) throw Error("GPXは10MB以下のファイルを選んでください。");
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error("このGPX形式には対応していません。");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length || doc.documentElement?.localName !== "gpx") throw Error("GPXを読み取れませんでした。元のGPXファイルを選んでください。");
    const points = []; let total = 0, skipped = 0;
    for (const segment of doc.getElementsByTagNameNS("*", "trkseg")) {
      for (const p of segment.children) {
        if (p.localName !== "trkpt") continue;
        if (++total > MAX_POINTS) throw Error("記録点が5万件を超えています。日ごとなどに分けたGPXを選んでください。");
        const rawLat = p.getAttribute("lat"), rawLng = p.getAttribute("lon");
        const lat = Number(rawLat), lng = Number(rawLng), timeText = direct(p, "time")?.textContent?.trim() || "";
        const time = Date.parse(timeText);
        if (!rawLat?.trim() || !rawLng?.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(timeText) || !Number.isFinite(time) || time <= 0 || time > now + 600000) { skipped++; continue; }
        const date = timeText.slice(0, 10).split("-").map(Number);
        if (date[1] < 1 || date[1] > 12 || date[2] < 1 || date[2] > new Date(Date.UTC(date[0], date[1], 0)).getUTCDate()) { skipped++; continue; }
        points.push({ lat, lng, time });
      }
    }
    if (!points.length) throw Error("日時と位置を持つ実測の移動記録がありません。予定ルートや日時なしのGPXは訪問記録に使えません。");
    return { points, skipped, total };
  }
  function distance(a, b) {
    const dlat = rad(b.lat - a.lat), dlng = rad(b.lng - a.lng), q = Math.sin(dlat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dlng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(Math.max(0, 1 - q)));
  }
  function scan(points, entries, found = new Map()) {
    for (const p of points) for (const entry of entries) {
      for (const zone of entry.zones || []) {
        const zlat = Number(zone.lat), zlng = Number(zone.lng), radius = Number(zone.radiusM);
        if (!Number.isFinite(zlat) || !Number.isFinite(zlng) || !Number.isFinite(radius) || radius <= 0) continue;
        const reach = radius + MARGIN_M;
        if (Math.abs(p.lat - zlat) > reach / 110000) continue;
        const lngDelta = Math.abs(((p.lng - zlng + 540) % 360) - 180);
        if (lngDelta > Math.min(180, reach / (110000 * Math.max(.001, Math.cos(rad(zlat)))))) continue;
        const meters = distance(p, { lat: zlat, lng: zlng });
        if (meters > reach) continue;
        const key = JSON.stringify([entry.entityType, entry.entityId, day(p.time)]), prior = found.get(key);
        const remainingM = Math.max(0, meters - radius), inRange = meters <= radius;
        if (prior && (prior.remainingM < remainingM || prior.remainingM === remainingM && prior.distanceM <= meters)) continue;
        found.set(key, {
          id: `gpx-${entry.entityType}-${encodeURIComponent(entry.entityId)}-${day(p.time)}`,
          entityType: entry.entityType, entityId: String(entry.entityId), spotId: String(entry.entityId),
          name: entry.name, prefecture: entry.prefecture || "", detectedAt: p.time, status: "pending",
          strength: inRange ? "gpx_in_range" : "gpx_nearby", source: "gpx_import", accuracyM: null,
          distanceM: meters, remainingM, radiusM: radius, zoneLabel: zone.label || entry.name,
          evidence: [{ type: "gpx_import", lat: p.lat, lng: p.lng, sampledAt: p.time,
            distanceToCenterM: meters, remainingM, radiusM: radius, inRange, accuracyKnown: false }]
        });
      }
    }
    return found;
  }
  function matchPoints(points, entries) { return [...scan(points, entries).values()]; }
  function mergeCandidates(existing, additions) {
    const result = existing.slice(), byId = new Map(result.map((c, i) => [c.id, i]));
    let added = 0, updated = 0;
    for (const candidate of additions) {
      const index = byId.get(candidate.id);
      if (index == null) { byId.set(candidate.id, result.length); result.push(candidate); added++; continue; }
      const prior = result[index];
      if (prior.source !== "gpx_import" || prior.status !== "pending") continue;
      if (candidate.remainingM < prior.remainingM || candidate.remainingM === prior.remainingM && candidate.distanceM < prior.distanceM) {
        result[index] = candidate; updated++;
      }
    }
    return { candidates: result, added, updated };
  }
  const api = { parseGpx, matchPoints, mergeCandidates };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }
  root.OnsenGpxImport = api;
  let busy = false, mounted = false;
  const profile = () => root.OnsenUserStorage?.getCurrentProfileId?.();
  const status = message => { const el = document.getElementById("tripGpxStatus"); if (el) el.textContent = message; };
  function catalog() {
    const entries = [], visitedOnsen = new Set(loadCheckins().map(c => String(c.spotId)));
    for (const entry of spots) if (!visitedOnsen.has(String(entry.id))) entries.push({ entityType: "onsen", entityId: String(entry.id), name: entry.name, prefecture: entry.prefecture, zones: getCheckinZones(entry) });
    const castles = new Map((root.OnsenCastleDomain?.data?.entities || []).map(e => [String(e.id), e]));
    const byCastle = new Map();
    for (const zone of root.OnsenCastleMap?.zones?.()?.entries || []) {
      const id = String(zone.castleId), entry = castles.get(id);
      if (!entry || root.OnsenCastleVisits?.isVisited?.(id)) continue;
      if (!byCastle.has(id)) byCastle.set(id, { entityType: "castle", entityId: id, name: entry.name, prefecture: entry.prefecture, zones: [] });
      byCastle.get(id).zones.push({ ...zone, radiusM: Math.max(500, Number(zone.radiusM) || 750) });
    }
    entries.push(...byCastle.values());
    const scenic = root.OnsenScenicRuntime;
    for (const entry of scenic.entries()) if (!scenic.isVisited(entry.id)) entries.push({ entityType: "scenic", entityId: String(entry.id), name: String(entry.name).split(/\r?\n/)[0], prefecture: (entry.prefectures || []).join("・"), zones: scenic.auditedZones(entry) });
    return entries;
  }
  function ready() { return typeof spots !== "undefined" && spots.length && typeof getCheckinZones === "function" && root.OnsenCastleMap?.zones?.()?.entries?.length && root.OnsenScenicRuntime?.entries?.().length && root.OnsenTravelDomainRecoveryV731 && root.OnsenUserStorage; }
  async function importFile(file) {
    if (!file || busy) return null;
    if (!ready()) { status("地点データを準備中です。少し待ってからお試しください。"); return null; }
    const owner = profile();
    const guard = () => { if (profile() !== owner) throw Error("ユーザーが切り替わったため取り込みを中止しました。現在のユーザーで選び直してください。"); };
    busy = true; const input = document.getElementById("tripGpxInput"); if (input) input.disabled = true;
    try {
      if (file.size > MAX_BYTES) throw Error("GPXは10MB以下のファイルを選んでください。");
      status("GPXの位置と日時を読み込んでいます…");
      const parsed = parseGpx(await file.text()); guard();
      const entries = catalog(), found = new Map();
      for (let i = 0; i < parsed.points.length; i += 200) {
        guard(); scan(parsed.points.slice(i, i + 200), entries, found);
        status(`${Math.min(i + 200, parsed.points.length)}／${parsed.points.length}点を照合しています…`);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      guard();
      const recovery = root.OnsenTravelDomainRecoveryV731;
      const merged = mergeCandidates(recovery.loadCandidates(), [...found.values()]);
      if (merged.added || merged.updated) recovery.saveCandidates(merged.candidates);
      // Nothing is registered as visited until the user confirms the candidates.
      status(`${parsed.points.length}点を照合し、候補を${merged.added}件追加・${merged.updated}件更新しました。${parsed.skipped ? ` 日時・位置が不明な${parsed.skipped}点は除外しました。` : ""}「旅をまとめて記録」で確認してください。`);
      try { recovery.render?.(); root.OnsenTripSettlement?.refresh?.(); } catch { /* Persistence succeeded. */ }
      root.dispatchEvent(new CustomEvent("onsen-trip-recovery-input-changed", { detail: { type: "gpx", added: merged.added, updated: merged.updated } }));
      return { points: parsed.points.length, skipped: parsed.skipped, added: merged.added, updated: merged.updated };
    } catch (e) { status(e.name === "QuotaExceededError" ? "保存容量が不足し、候補を保存できませんでした。バックアップ後に保存容量を確認してください。" : e.message || "GPXを取り込めませんでした。"); return null; }
    finally { busy = false; if (input) input.disabled = false; }
  }
  api.importFile = importFile;
  api.ready = ready;
  const timer = setInterval(() => {
    const settlement = document.getElementById("tripSettlement");
    if (mounted || !settlement) return;
    const section = document.createElement("section"); section.id = "tripGpxImport"; section.className = "gpx-import";
    section.innerHTML = `<h3>移動経路から復元</h3><p>ウォッチやGPSアプリから書き出したGPXを選ぶと、温泉・城・名勝の候補を作ります。</p><label class="gpx-file">GPXファイルを選ぶ<input id="tripGpxInput" type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" /></label><p class="gpx-note">日時付きの実測ログに対応。予定ルートは対象外です。範囲内でも訪問記録として扱い、現地GPS限定実績には使いません。ファイルは端末内で照合し、経路全体は保存しません。</p><p id="tripGpxStatus" role="status" aria-live="polite"></p>`;
    settlement.insertAdjacentElement("beforebegin", section);
    document.getElementById("tripGpxInput").addEventListener("change", event => { const file = event.target.files?.[0]; event.target.value = ""; importFile(file); });
    mounted = true; clearInterval(timer);
  }, 500);
})(typeof window === "undefined" ? globalThis : window);
