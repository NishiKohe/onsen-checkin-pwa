(() => {
  const SAMPLE_KEY = "visitLocationSamplesV1";
  const CANDIDATE_KEY = "visitCandidatesV1";
  const SETTINGS_KEY = "visitSettingsV1";
  const MAX_SAMPLES = 400;
  const SAMPLE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
  const SAMPLE_MIN_INTERVAL_MS = 60 * 1000;
  const PHOTO_SAMPLE_MAX_GAP_MS = 90 * 60 * 1000;
  const PHOTO_SAMPLE_ONSITE_GAP_MS = 30 * 60 * 1000;
  const PHOTO_NEARBY_MARGIN_M = 1500;

  window.addEventListener("onsen-location-sample", (event) => {
    const sample = event.detail;
    if (!sample || !Number.isFinite(sample.lat) || !Number.isFinite(sample.lng)) return;
    rememberLocationSample(sample);
  });

  waitForPhotoRecoveryUi().then(bindPhotoRecoveryFallback).catch((err) => {
    console.warn("photo recovery fallback init failed", err);
  });

  async function waitForPhotoRecoveryUi() {
    for (let i = 0; i < 300; i++) {
      if (
        document.getElementById("tripPhotoInput") &&
        typeof spots !== "undefined" && Array.isArray(spots) && spots.length > 0 &&
        typeof getNearestZoneStatus === "function" &&
        typeof loadCheckins === "function" && typeof saveCheckins === "function"
      ) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("photo recovery UI was not ready");
  }

  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "null");
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function rememberLocationSample(sample) {
    const now = Date.now();
    const sampledAt = Number(sample.sampledAt || now);
    if (now - sampledAt > 5 * 60 * 1000) return;
    const accuracyM = Number(sample.accuracyM || 0);
    if (!Number.isFinite(accuracyM) || accuracyM > 1000) return;

    const settings = readJson(SETTINGS_KEY, {});
    const list = readJson(SAMPLE_KEY, [])
      .filter((item) => now - Number(item.sampledAt || 0) <= SAMPLE_RETENTION_MS);
    const last = list[list.length - 1];
    if (last && sampledAt - Number(last.sampledAt || 0) < SAMPLE_MIN_INTERVAL_MS) {
      const moved = haversineM(last.lat, last.lng, sample.lat, sample.lng);
      if (moved < 100 && accuracyM >= Number(last.accuracyM || Infinity)) return;
      list.pop();
    }

    list.push({
      lat: Number(sample.lat),
      lng: Number(sample.lng),
      accuracyM,
      sampledAt,
      source: sample.source || "geolocation",
      tripMode: settings.tripMode === true,
      tripSessionId: settings.activeSessionId || null
    });
    writeJson(SAMPLE_KEY, list.slice(-MAX_SAMPLES));
  }

  function bindPhotoRecoveryFallback() {
    const input = document.getElementById("tripPhotoInput");
    if (!input || input.dataset.photoRecoveryFallbackBound === "1") return;
    input.dataset.photoRecoveryFallbackBound = "1";
    input.addEventListener("change", handlePhotoSelectionFallback, true);

    const status = document.getElementById("tripPhotoStatus");
    if (status) {
      status.textContent = "写真は端末内で解析します。Androidでは写真ピッカーがGPSを伏せる場合があるため、撮影日時＋旅行ログでも復元します。";
    }
  }

  async function handlePhotoSelectionFallback(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    // visit-log-ui.js の旧JPEG-GPS専用処理より先に、こちらで一括処理する。
    event.stopImmediatePropagation();
    const status = document.getElementById("tripPhotoStatus");
    clearPhotoFallbackForm();
    if (status) status.textContent = "写真のGPS・撮影日時・旅行ログを確認中…";

    try {
      const meta = await readPhotoMetadata(file);
      const takenAt = meta.takenAt || plausibleFileModified(file.lastModified) || null;

      if (Number.isFinite(meta.lat) && Number.isFinite(meta.lng)) {
        const match = findNearestSpotForPoint(meta.lat, meta.lng);
        if (!match || match.remainingM > PHOTO_NEARBY_MARGIN_M) {
          setStatus("写真のGPSは取得できましたが、近くに収録温泉が見つかりませんでした。");
          return;
        }
        savePhotoCandidate({
          match,
          detectedAt: takenAt || Date.now(),
          source: "photo_exif",
          strength: match.inRange ? "photo_verified_range" : "photo_nearby",
          evidence: {
            type: "photo_exif",
            lat: meta.lat,
            lng: meta.lng,
            takenAt,
            originalDateText: meta.originalDateText || null,
            metadataSource: meta.source || "jpeg_exif"
          }
        });
        setStatus(`${match.spot.name} を写真GPSから取り逃し候補に追加しました。`);
        refreshUi();
        return;
      }

      if (takenAt) {
        const sampleMatch = findClosestLocationSample(takenAt);
        if (sampleMatch && sampleMatch.timeGapMs <= PHOTO_SAMPLE_MAX_GAP_MS) {
          const match = findNearestSpotForPoint(sampleMatch.sample.lat, sampleMatch.sample.lng);
          if (match && match.remainingM <= PHOTO_NEARBY_MARGIN_M) {
            const onsite = match.inRange &&
              Number(sampleMatch.sample.accuracyM || Infinity) <= 150 &&
              sampleMatch.timeGapMs <= PHOTO_SAMPLE_ONSITE_GAP_MS;
            savePhotoCandidate({
              match,
              detectedAt: takenAt,
              source: "photo_time_triplog",
              strength: onsite ? "photo_time_verified_range" : "photo_time_nearby",
              evidence: {
                type: "photo_time_triplog",
                takenAt,
                photoOriginalDateText: meta.originalDateText || null,
                sampleLat: sampleMatch.sample.lat,
                sampleLng: sampleMatch.sample.lng,
                sampleAccuracyM: sampleMatch.sample.accuracyM,
                sampleAt: sampleMatch.sample.sampledAt,
                timeGapMs: sampleMatch.timeGapMs
              }
            });
            const gapMin = Math.round(sampleMatch.timeGapMs / 60000);
            setStatus(`写真GPSはAndroid側で非共有でしたが、撮影時刻と${gapMin}分差の旅行GPSログから ${match.spot.name} を候補にしました。`);
            refreshUi();
            return;
          }
        }

        setStatus(`写真GPSはブラウザへ渡されていません。撮影日時 ${formatDateTime(takenAt)} は取得できたので、場所だけ指定して訪問記録にできます。`);
        showManualPhotoFallback(takenAt, meta.originalDateText || null);
        return;
      }

      setStatus("写真GPSはAndroid側で非共有になっており、撮影日時も取得できませんでした。場所を指定して訪問記録にできます。");
      showManualPhotoFallback(null, null);
    } catch (err) {
      console.warn("photo recovery fallback failed", err);
      setStatus("この写真から位置情報を直接取得できませんでした。場所を指定して訪問記録にできます。");
      showManualPhotoFallback(plausibleFileModified(file.lastModified), null);
    } finally {
      event.target.value = "";
    }
  }

  function plausibleFileModified(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n) || n <= 0) return null;
    const age = Math.abs(Date.now() - n);
    return age < 20 * 365 * 24 * 60 * 60 * 1000 ? n : null;
  }

  function findClosestLocationSample(takenAt) {
    const list = readJson(SAMPLE_KEY, []);
    let best = null;
    for (const sample of list) {
      if (!Number.isFinite(sample.lat) || !Number.isFinite(sample.lng)) continue;
      const timeGapMs = Math.abs(Number(sample.sampledAt || 0) - takenAt);
      if (!best || timeGapMs < best.timeGapMs) best = { sample, timeGapMs };
    }
    return best;
  }

  function findNearestSpotForPoint(lat, lng) {
    let best = null;
    const point = { lat, lng };
    for (const spot of spots) {
      const nearest = getNearestZoneStatus(spot, point);
      if (!nearest) continue;
      const candidate = { spot, ...nearest };
      if (!best || candidate.remainingM < best.remainingM ||
        (candidate.remainingM === best.remainingM && candidate.distanceToCenterM < best.distanceToCenterM)) {
        best = candidate;
      }
    }
    return best;
  }

  function savePhotoCandidate({ match, detectedAt, source, strength, evidence }) {
    const candidates = readJson(CANDIDATE_KEY, []);
    const existing = candidates.find((item) => item.status === "pending" && item.spotId === match.spot.id && item.source === source);
    const record = existing || {
      id: `candidate-${source}-${match.spot.id}-${Date.now()}`,
      entityType: "onsen",
      spotId: match.spot.id,
      name: match.spot.name,
      prefecture: match.spot.prefecture,
      status: "pending",
      source,
      tripSessionId: readJson(SETTINGS_KEY, {}).activeSessionId || null,
      evidence: []
    };
    record.detectedAt = detectedAt || Date.now();
    record.distanceM = Math.round(match.distanceToCenterM);
    record.remainingM = Math.round(match.remainingM);
    record.accuracyM = evidence.sampleAccuracyM ?? null;
    record.zoneLabel = match.zone?.label || null;
    record.strength = strength;
    record.evidence = [{
      ...evidence,
      distanceToCenterM: record.distanceM,
      remainingM: record.remainingM,
      zoneLabel: record.zoneLabel,
      strength
    }];
    if (!existing) candidates.push(record);
    writeJson(CANDIDATE_KEY, candidates.slice(-250));
  }

  function clearPhotoFallbackForm() {
    document.getElementById("tripPhotoFallbackForm")?.remove();
  }

  function showManualPhotoFallback(takenAt, originalDateText) {
    const status = document.getElementById("tripPhotoStatus");
    if (!status) return;
    const form = document.createElement("div");
    form.id = "tripPhotoFallbackForm";
    form.className = "trip-manual-form";
    form.style.marginTop = "10px";
    form.innerHTML = `
      <input id="tripPhotoFallbackSpot" type="search" list="tripSpotSuggestions" placeholder="写真の場所の温泉名" autocomplete="off" />
      <button id="tripPhotoFallbackSave" type="button">写真の訪問記録に追加</button>`;
    status.insertAdjacentElement("afterend", form);
    form.querySelector("#tripPhotoFallbackSave")?.addEventListener("click", () => {
      const input = form.querySelector("#tripPhotoFallbackSpot");
      const spot = spots.find((item) => normalizeName(item.name) === normalizeName(input?.value || ""));
      if (!spot) {
        setStatus("候補から温泉名を選んでください。");
        return;
      }
      if (loadCheckins().some((item) => item.spotId === spot.id)) {
        setStatus(`${spot.name} はすでに訪問済みです。`);
        return;
      }
      const list = loadCheckins();
      list.push({
        spotId: spot.id,
        name: spot.name,
        prefecture: spot.prefecture,
        checkedAt: takenAt || Date.now(),
        accuracyM: null,
        zoneLabel: null,
        entityType: "onsen",
        verificationType: "photo_manual",
        verificationLevel: "recorded",
        recordSource: "photo_manual_fallback",
        recordedAt: Date.now(),
        evidence: [{ type: "photo_timestamp_manual_place", takenAt: takenAt || null, originalDateText: originalDateText || null }]
      });
      saveCheckins(list);
      clearPhotoFallbackForm();
      setStatus(`${spot.name} を写真の撮影日付き「訪問記録」として追加しました。`);
      refreshUi();
    });
  }

  function refreshUi() {
    try { renderStats?.(); } catch {}
    try { renderHistory?.(); } catch {}
    try { refreshSpotSource?.(); } catch {}
    try { renderCollectionProgress?.(); } catch {}
    window.dispatchEvent(new Event("storage"));
  }

  function setStatus(text) {
    const node = document.getElementById("tripPhotoStatus");
    if (node) node.textContent = text;
  }

  function normalizeName(value) {
    return String(value || "").normalize("NFKC").replace(/[・･\s　]/g, "").toLowerCase();
  }

  function formatDateTime(value) {
    return new Date(value).toLocaleString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function haversineM(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (x) => x * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async function readPhotoMetadata(file) {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);
    let exif = null;
    if (view.byteLength >= 4 && view.getUint16(0, false) === 0xffd8) {
      exif = readJpegExif(view);
      const xmp = readJpegXmp(view);
      if (xmp) exif = mergeMetadata(exif, xmp);
    }
    return exif || { lat: null, lng: null, takenAt: null, originalDateText: null, source: null };
  }

  function mergeMetadata(a, b) {
    return {
      lat: Number.isFinite(a?.lat) ? a.lat : b?.lat ?? null,
      lng: Number.isFinite(a?.lng) ? a.lng : b?.lng ?? null,
      takenAt: a?.takenAt || b?.takenAt || null,
      originalDateText: a?.originalDateText || b?.originalDateText || null,
      source: Number.isFinite(a?.lat) && Number.isFinite(a?.lng) ? (a.source || "jpeg_exif") : (b?.source || a?.source || null)
    };
  }

  function readJpegExif(view) {
    let offset = 2;
    let metadata = null;
    while (offset + 4 < view.byteLength) {
      if (view.getUint8(offset) !== 0xff) { offset++; continue; }
      const marker = view.getUint8(offset + 1);
      if (marker === 0xda || marker === 0xd9) break;
      if (offset + 4 > view.byteLength) break;
      const length = view.getUint16(offset + 2, false);
      if (!length || offset + 2 + length > view.byteLength) break;
      if (marker === 0xe1 && length >= 8 && ascii(view, offset + 4, 6) === "Exif\u0000\u0000") {
        metadata = parseTiffExif(view, offset + 10);
        if (metadata) metadata.source = "jpeg_exif";
      }
      offset += 2 + length;
    }
    return metadata;
  }

  function readJpegXmp(view) {
    const max = Math.min(view.byteLength, 2 * 1024 * 1024);
    let text = "";
    for (let i = 0; i < max; i++) {
      const code = view.getUint8(i);
      text += code >= 32 && code <= 126 ? String.fromCharCode(code) : " ";
    }
    const latText = firstMatch(text, [
      /exif:GPSLatitude=["']([^"']+)["']/i,
      /<exif:GPSLatitude>([^<]+)<\/exif:GPSLatitude>/i
    ]);
    const lngText = firstMatch(text, [
      /exif:GPSLongitude=["']([^"']+)["']/i,
      /<exif:GPSLongitude>([^<]+)<\/exif:GPSLongitude>/i
    ]);
    const dateText = firstMatch(text, [
      /exif:DateTimeOriginal=["']([^"']+)["']/i,
      /<exif:DateTimeOriginal>([^<]+)<\/exif:DateTimeOriginal>/i,
      /xmp:CreateDate=["']([^"']+)["']/i
    ]);
    const lat = parseCoordinateText(latText, true);
    const lng = parseCoordinateText(lngText, false);
    const takenAt = parseFlexibleDate(dateText);
    if (!Number.isFinite(lat) && !Number.isFinite(lng) && !takenAt) return null;
    return { lat, lng, takenAt, originalDateText: dateText || null, source: "jpeg_xmp" };
  }

  function firstMatch(text, patterns) {
    for (const pattern of patterns) {
      const match = pattern.exec(text);
      if (match?.[1]) return match[1].trim();
    }
    return null;
  }

  function parseCoordinateText(value, latitude) {
    if (!value) return null;
    const raw = String(value).trim();
    const direction = /[SW]$/i.test(raw) ? -1 : 1;
    const cleaned = raw.replace(/[NSEW]/ig, "").trim();
    const decimal = Number(cleaned);
    if (Number.isFinite(decimal)) return direction * decimal;
    const parts = cleaned.split(/[ ,]+/).map(Number).filter(Number.isFinite);
    if (!parts.length) return null;
    let out = Math.abs(parts[0]);
    if (parts.length > 1) out += parts[1] / 60;
    if (parts.length > 2) out += parts[2] / 3600;
    if (parts[0] < 0) out *= -1;
    else out *= direction;
    const limit = latitude ? 90 : 180;
    return Math.abs(out) <= limit ? out : null;
  }

  function parseTiffExif(view, tiffStart) {
    const order = ascii(view, tiffStart, 2);
    const little = order === "II";
    if (!little && order !== "MM") return null;
    const u16 = (o) => view.getUint16(tiffStart + o, little);
    const u32 = (o) => view.getUint32(tiffStart + o, little);
    if (u16(2) !== 42) return null;
    const ifd0 = readIfd(view, tiffStart, u32(4), little);
    const gpsOffset = valueAsUint(ifd0.get(0x8825), view, tiffStart, little);
    const exifOffset = valueAsUint(ifd0.get(0x8769), view, tiffStart, little);
    let lat = null, lng = null, takenAt = null, originalDateText = null;

    if (gpsOffset) {
      const gps = readIfd(view, tiffStart, gpsOffset, little);
      const latRef = valueAsAscii(gps.get(0x0001), view, tiffStart, little);
      const lonRef = valueAsAscii(gps.get(0x0003), view, tiffStart, little);
      const latVals = valueAsRationals(gps.get(0x0002), view, tiffStart, little);
      const lonVals = valueAsRationals(gps.get(0x0004), view, tiffStart, little);
      if (latVals?.length >= 3 && lonVals?.length >= 3) {
        lat = latVals[0] + latVals[1] / 60 + latVals[2] / 3600;
        lng = lonVals[0] + lonVals[1] / 60 + lonVals[2] / 3600;
        if (latRef?.toUpperCase() === "S") lat *= -1;
        if (lonRef?.toUpperCase() === "W") lng *= -1;
      }
    }

    if (exifOffset) {
      const exif = readIfd(view, tiffStart, exifOffset, little);
      originalDateText = valueAsAscii(exif.get(0x9003), view, tiffStart, little) || valueAsAscii(exif.get(0x9004), view, tiffStart, little);
      takenAt = parseFlexibleDate(originalDateText);
    }
    if (!takenAt) {
      originalDateText = originalDateText || valueAsAscii(ifd0.get(0x0132), view, tiffStart, little);
      takenAt = parseFlexibleDate(originalDateText);
    }
    return { lat, lng, takenAt, originalDateText };
  }

  function readIfd(view, tiffStart, offset, little) {
    const map = new Map();
    const base = tiffStart + offset;
    if (base < 0 || base + 2 > view.byteLength) return map;
    const count = view.getUint16(base, little);
    for (let i = 0; i < count; i++) {
      const entry = base + 2 + i * 12;
      if (entry + 12 > view.byteLength) break;
      const tag = view.getUint16(entry, little);
      const type = view.getUint16(entry + 2, little);
      const components = view.getUint32(entry + 4, little);
      const valueOffset = view.getUint32(entry + 8, little);
      map.set(tag, { entry, type, components, valueOffset });
    }
    return map;
  }

  function typeSize(type) {
    return ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 })[type] || 1;
  }

  function valuePosition(entry, tiffStart) {
    if (!entry) return null;
    return typeSize(entry.type) * entry.components <= 4 ? entry.entry + 8 : tiffStart + entry.valueOffset;
  }

  function valueAsUint(entry, view, tiffStart, little) {
    if (!entry) return null;
    const pos = valuePosition(entry, tiffStart);
    if (pos === null || pos + 4 > view.byteLength) return null;
    if (entry.type === 3) return view.getUint16(pos, little);
    if (entry.type === 4) return view.getUint32(pos, little);
    return entry.valueOffset || null;
  }

  function valueAsAscii(entry, view, tiffStart) {
    if (!entry || entry.type !== 2) return null;
    const pos = valuePosition(entry, tiffStart);
    if (pos === null || pos + entry.components > view.byteLength) return null;
    return ascii(view, pos, entry.components).replace(/\u0000+$/g, "").trim();
  }

  function valueAsRationals(entry, view, tiffStart, little) {
    if (!entry || entry.type !== 5) return null;
    const pos = valuePosition(entry, tiffStart);
    if (pos === null || pos + entry.components * 8 > view.byteLength) return null;
    const values = [];
    for (let i = 0; i < entry.components; i++) {
      const numerator = view.getUint32(pos + i * 8, little);
      const denominator = view.getUint32(pos + i * 8 + 4, little);
      values.push(denominator ? numerator / denominator : 0);
    }
    return values;
  }

  function ascii(view, start, length) {
    let out = "";
    const end = Math.min(view.byteLength, start + length);
    for (let i = start; i < end; i++) out += String.fromCharCode(view.getUint8(i));
    return out;
  }

  function parseFlexibleDate(value) {
    if (!value) return null;
    const exif = /^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/.exec(value);
    if (exif) {
      const [, y, m, d, hh, mm, ss] = exif.map(Number);
      const time = new Date(y, m - 1, d, hh, mm, ss).getTime();
      return Number.isFinite(time) ? time : null;
    }
    const iso = Date.parse(value);
    return Number.isFinite(iso) ? iso : null;
  }
})();
