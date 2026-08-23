(() => {
  const KEYS = {
    candidates: "visitCandidatesV1",
    sessions: "visitSessionsV1",
    settings: "visitSettingsV1",
    migration: "visitLogMigrationV1"
  };
  const MAX_PENDING = 250;
  const VERIFIED_ACCURACY_M = 150;
  const NEARBY_MARGIN_M = 300;
  const PHOTO_NEARBY_MARGIN_M = 1000;
  const CANDIDATE_MERGE_MS = 30 * 60 * 1000;
  const bufferedSamples = [];
  let coreReady = false;
  let foregroundWatchId = null;
  let renderTimer = null;

  window.addEventListener("onsen-location-sample", (event) => {
    const sample = event.detail;
    if (!sample) return;
    if (!coreReady) {
      bufferedSamples.push(sample);
      if (bufferedSamples.length > 20) bufferedSamples.shift();
      return;
    }
    scanLocationSample(sample);
  });

  waitForVisitCore().then(initVisitLog).catch((err) => {
    console.warn("visit log init failed", err);
  });

  async function waitForVisitCore() {
    for (let i = 0; i < 300; i++) {
      if (
        typeof spots !== "undefined" && Array.isArray(spots) && spots.length > 0 &&
        typeof getNearestZoneStatus === "function" &&
        typeof loadCheckins === "function" && typeof saveCheckins === "function"
      ) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("visit log core was not ready");
  }

  function initVisitLog() {
    migrateLegacyCheckins();
    wrapCheckinPersistence();
    installLocationFallback();
    installTripView();
    bindTripTabSwitch();
    bindTripControls();
    coreReady = true;
    for (const sample of bufferedSamples.splice(0)) scanLocationSample(sample);
    syncForegroundWatch();
    renderTripView();
    window.addEventListener("storage", renderTripView);
    document.addEventListener("visibilitychange", syncForegroundWatch);
    window.addEventListener("pageshow", () => {
      syncForegroundWatch();
      renderTripView();
    });

    window.isSpotOnsiteVerified = isSpotOnsiteVerified;
    window.isGroupOnsiteComplete = (memberIds) => (memberIds || []).every(isSpotOnsiteVerified);
    window.getVisitVerificationSummary = getVerificationSummary;
    window.openTripView = () => forceThreeWayTab("trip");
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

  function loadCandidates() {
    return readJson(KEYS.candidates, []);
  }

  function saveCandidates(list) {
    writeJson(KEYS.candidates, list.slice(-MAX_PENDING));
  }

  function loadSessions() {
    return readJson(KEYS.sessions, []);
  }

  function saveSessions(list) {
    writeJson(KEYS.sessions, list.slice(-100));
  }

  function loadSettings() {
    return { tripMode: false, activeSessionId: null, ...readJson(KEYS.settings, {}) };
  }

  function saveSettings(settings) {
    writeJson(KEYS.settings, settings);
  }

  function migrateLegacyCheckins() {
    if (localStorage.getItem(KEYS.migration) === "done") return;
    const list = loadCheckins();
    let changed = false;
    for (const item of list) {
      if (!item.verificationType) {
        item.verificationType = "gps_legacy";
        item.verificationLevel = "onsite";
        item.recordSource = "legacy_checkin";
        item.entityType = item.entityType || "onsen";
        changed = true;
      }
    }
    if (changed) saveCheckins(list);
    localStorage.setItem(KEYS.migration, "done");
  }

  function wrapCheckinPersistence() {
    const originalSave = saveCheckins;
    saveCheckins = function visitAwareSaveCheckins(list) {
      const now = Date.now();
      for (const item of list || []) {
        if (!item.entityType) item.entityType = "onsen";
        if (!item.verificationType) {
          item.verificationType = "gps_manual";
          item.verificationLevel = "onsite";
          item.recordSource = "checkin_button";
          item.verifiedAt = item.checkedAt || now;
        }
      }
      originalSave(list);
      scheduleVisitRender();
    };
  }

  function installLocationFallback() {
    if (navigator.geolocation?.__onsenVisitLogWrapped || typeof locateOnce !== "function") return;
    const originalLocateOnce = locateOnce;
    locateOnce = function visitAwareLocateOnce(flyToUser) {
      originalLocateOnce(flyToUser);
      navigator.geolocation.getCurrentPosition(
        (pos) => scanLocationSample({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy || 0,
          sampledAt: pos.timestamp || Date.now(),
          source: "visit_fallback"
        }),
        () => {},
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
      );
    };
  }

  function activeSession() {
    const settings = loadSettings();
    if (!settings.activeSessionId) return null;
    return loadSessions().find((session) => session.id === settings.activeSessionId && !session.endedAt) || null;
  }

  function scanLocationSample(sample) {
    if (!Number.isFinite(sample.lat) || !Number.isFinite(sample.lng)) return;
    const accuracyM = Number.isFinite(sample.accuracyM) ? sample.accuracyM : 9999;
    if (accuracyM > 1000) return;

    const visited = new Set(loadCheckins().map((item) => item.spotId));
    const settings = loadSettings();
    const session = settings.tripMode ? activeSession() : null;
    const candidates = loadCandidates();
    let changed = false;

    for (const spot of spots) {
      if (!spot?.id || visited.has(spot.id)) continue;
      const nearest = getNearestZoneStatus(spot, sample);
      if (!nearest) continue;

      let strength = null;
      if (nearest.inRange && accuracyM <= VERIFIED_ACCURACY_M) {
        strength = "verified_range";
      } else if (nearest.remainingM <= NEARBY_MARGIN_M && accuracyM <= 500) {
        strength = "nearby";
      }
      if (!strength) continue;

      const sampledAt = Number(sample.sampledAt || Date.now());
      const recent = candidates.find((item) =>
        item.spotId === spot.id && item.status === "pending" &&
        Math.abs(sampledAt - item.detectedAt) <= CANDIDATE_MERGE_MS
      );

      const evidence = {
        type: "gps",
        lat: sample.lat,
        lng: sample.lng,
        accuracyM,
        sampledAt,
        distanceToCenterM: Math.round(nearest.distanceToCenterM),
        remainingM: Math.round(nearest.remainingM),
        zoneLabel: nearest.zone?.label || null,
        strength,
        sampleSource: sample.source || "geolocation"
      };

      if (recent) {
        const isBetter = strength === "verified_range" && recent.strength !== "verified_range" ||
          evidence.remainingM < Number(recent.remainingM ?? Infinity) ||
          accuracyM < Number(recent.accuracyM ?? Infinity);
        if (isBetter) {
          recent.detectedAt = sampledAt;
          recent.distanceM = evidence.distanceToCenterM;
          recent.remainingM = evidence.remainingM;
          recent.accuracyM = accuracyM;
          recent.zoneLabel = evidence.zoneLabel;
          recent.strength = strength;
          recent.evidence = [evidence];
          recent.tripSessionId = session?.id || recent.tripSessionId || null;
          changed = true;
        }
        continue;
      }

      candidates.push({
        id: `candidate-${spot.id}-${sampledAt}`,
        entityType: "onsen",
        spotId: spot.id,
        name: spot.name,
        prefecture: spot.prefecture,
        detectedAt: sampledAt,
        distanceM: evidence.distanceToCenterM,
        remainingM: evidence.remainingM,
        accuracyM,
        zoneLabel: evidence.zoneLabel,
        strength,
        source: "geolocation",
        status: "pending",
        tripSessionId: session?.id || null,
        evidence: [evidence]
      });
      changed = true;
    }

    if (changed) {
      saveCandidates(candidates);
      scheduleVisitRender();
    }
  }

  function installTripView() {
    if (document.getElementById("tripView")) return;
    const nav = document.querySelector(".app-tabs");
    if (!nav) return;

    const section = document.createElement("section");
    section.id = "tripView";
    section.className = "trip-view";
    section.hidden = true;
    section.setAttribute("aria-label", "旅行と取り逃し候補");
    section.innerHTML = `
      <div class="trip-shell">
        <div class="trip-header">
          <div>
            <span class="trip-eyebrow">JOURNEY LOG</span>
            <h2>旅行・取り逃し</h2>
            <p>現地で押し忘れても、位置・写真・自己申告で訪問を復元できます。</p>
          </div>
          <button id="tripModeToggle" class="trip-mode-toggle" type="button">旅行モード OFF</button>
        </div>

        <div class="trip-metrics">
          <div><span>現地確認済</span><b id="tripOnsiteMetric">0</b></div>
          <div><span>訪問記録</span><b id="tripRecordedMetric">0</b></div>
          <div><span>取り逃し候補</span><b id="tripCandidateMetric">0</b></div>
        </div>

        <section class="trip-card">
          <div class="trip-card-heading">
            <div><h3>取り逃しBOX</h3><p>GPS範囲内は現地確認として復元。付近検出は訪問記録として残します。</p></div>
            <button id="tripLocateNow" class="trip-secondary" type="button">現在地を再確認</button>
          </div>
          <div id="tripCandidateList" class="trip-candidate-list"></div>
        </section>

        <section class="trip-card">
          <div class="trip-card-heading">
            <div><h3>写真から復元</h3><p>JPEGのGPS EXIFが残っていれば、撮影地点から候補を作れます。</p></div>
            <label class="trip-secondary trip-file-button">写真を選ぶ<input id="tripPhotoInput" type="file" accept="image/jpeg,image/jpg" /></label>
          </div>
          <div id="tripPhotoStatus" class="trip-inline-note">写真は端末内で解析し、画像そのものは保存しません。</div>
        </section>

        <section class="trip-card">
          <div class="trip-card-heading"><div><h3>過去訪問を登録</h3><p>昔の旅行も通常コンプリート率には含め、現地確認済とは区別します。</p></div></div>
          <div class="trip-manual-form">
            <input id="tripManualSpot" type="search" list="tripSpotSuggestions" placeholder="温泉名を入力" autocomplete="off" />
            <datalist id="tripSpotSuggestions"></datalist>
            <input id="tripManualDate" type="date" />
            <button id="tripManualSave" type="button">訪問記録に追加</button>
          </div>
          <div id="tripManualStatus" class="trip-inline-note"></div>
        </section>

        <section class="trip-card">
          <div class="trip-card-heading"><div><h3>最近の旅行</h3><p>旅行モードON中の候補・チェックインを日単位で振り返れます。</p></div></div>
          <div id="tripSessionList" class="trip-session-list"></div>
        </section>

        <section class="trip-card trip-legend">
          <h3>訪問状態</h3>
          <p><b>✓ 現地確認済</b>：GPSチェックイン、GPS取り逃し復元、範囲内GPS写真。</p>
          <p><b>◇ 訪問記録</b>：自己申告、範囲外の付近検出など。通常コレクションには含まれます。</p>
          <p>将来の「現地踏破」称号は ✓ のみを条件にできます。</p>
        </section>
      </div>`;

    nav.parentNode.insertBefore(section, nav);

    const tripButton = document.createElement("button");
    tripButton.type = "button";
    tripButton.className = "app-tab";
    tripButton.dataset.appTab = "trip";
    tripButton.setAttribute("aria-selected", "false");
    tripButton.textContent = "旅行";
    nav.appendChild(tripButton);

    const datalist = section.querySelector("#tripSpotSuggestions");
    for (const spot of [...spots].sort((a, b) => String(a.name).localeCompare(String(b.name), "ja"))) {
      const option = document.createElement("option");
      option.value = spot.name;
      option.label = spot.prefecture || "";
      datalist.appendChild(option);
    }
    const dateInput = section.querySelector("#tripManualDate");
    dateInput.value = formatLocalDate(Date.now());
  }

  function bindTripTabSwitch() {
    const nav = document.querySelector(".app-tabs");
    if (!nav || nav.dataset.threeWayBound === "1") return;
    nav.dataset.threeWayBound = "1";
    nav.addEventListener("click", (event) => {
      const button = event.target.closest("[data-app-tab]");
      if (!button || !nav.contains(button)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      forceThreeWayTab(button.dataset.appTab || "map");
    }, true);
  }

  function forceThreeWayTab(tab) {
    const normalized = ["map", "collection", "trip"].includes(tab) ? tab : "map";
    const main = document.querySelector(".main");
    const collectionView = document.getElementById("collectionView");
    const tripView = document.getElementById("tripView");
    const showMap = normalized === "map";
    const showCollection = normalized === "collection";
    const showTrip = normalized === "trip";

    document.documentElement.dataset.appTab = normalized;
    document.body.classList.toggle("collection-tab-active", showCollection);
    document.body.classList.toggle("trip-tab-active", showTrip);

    setViewDisplay(main, showMap, "grid");
    setViewDisplay(collectionView, showCollection, "block");
    setViewDisplay(tripView, showTrip, "block");

    for (const button of document.querySelectorAll("[data-app-tab]")) {
      const active = button.dataset.appTab === normalized;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    }

    if (showCollection && typeof renderCollectionProgress === "function") renderCollectionProgress();
    if (showTrip) renderTripView();
    if (showMap && typeof map !== "undefined" && map) setTimeout(() => map.resize?.(), 0);
  }

  function setViewDisplay(node, visible, display) {
    if (!node) return;
    node.hidden = !visible;
    node.setAttribute("aria-hidden", visible ? "false" : "true");
    node.style.setProperty("display", visible ? display : "none", "important");
  }

  function bindTripControls() {
    document.getElementById("tripModeToggle")?.addEventListener("click", toggleTripMode);
    document.getElementById("tripLocateNow")?.addEventListener("click", () => {
      if (typeof locateOnce === "function") locateOnce(false);
    });
    document.getElementById("tripManualSave")?.addEventListener("click", saveManualVisit);
    document.getElementById("tripPhotoInput")?.addEventListener("change", handlePhotoSelection);
  }

  function toggleTripMode() {
    const settings = loadSettings();
    const sessions = loadSessions();
    if (!settings.tripMode) {
      const session = {
        id: `trip-${Date.now()}`,
        entityType: "journey",
        startedAt: Date.now(),
        endedAt: null
      };
      sessions.push(session);
      settings.tripMode = true;
      settings.activeSessionId = session.id;
    } else {
      const session = sessions.find((item) => item.id === settings.activeSessionId && !item.endedAt);
      if (session) session.endedAt = Date.now();
      settings.tripMode = false;
      settings.activeSessionId = null;
    }
    saveSessions(sessions);
    saveSettings(settings);
    syncForegroundWatch();
    renderTripView();
  }

  function syncForegroundWatch() {
    const shouldWatch = loadSettings().tripMode && document.visibilityState === "visible" && navigator.geolocation;
    if (shouldWatch && foregroundWatchId === null) {
      foregroundWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (!navigator.geolocation?.__onsenVisitLogWrapped) {
            scanLocationSample({
              lat: pos.coords.latitude, lng: pos.coords.longitude,
              accuracyM: pos.coords.accuracy || 0, sampledAt: pos.timestamp || Date.now(),
              source: "trip_watch_fallback"
            });
          }
        },
        (err) => console.warn("trip foreground watch error", err),
        { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 }
      );
    } else if (!shouldWatch && foregroundWatchId !== null) {
      navigator.geolocation.clearWatch(foregroundWatchId);
      foregroundWatchId = null;
    }
  }

  function pendingCandidates() {
    return loadCandidates().filter((item) => item.status === "pending").sort((a, b) => b.detectedAt - a.detectedAt);
  }

  function confirmCandidate(candidateId) {
    const candidates = loadCandidates();
    const candidate = candidates.find((item) => item.id === candidateId && item.status === "pending");
    if (!candidate) return;
    const already = loadCheckins().some((item) => item.spotId === candidate.spotId);
    if (!already) {
      const onsite = candidate.strength === "verified_range" || candidate.strength === "photo_verified_range";
      const list = loadCheckins();
      list.push({
        spotId: candidate.spotId,
        name: candidate.name,
        prefecture: candidate.prefecture,
        checkedAt: candidate.detectedAt,
        accuracyM: candidate.accuracyM ?? null,
        zoneLabel: candidate.zoneLabel || null,
        entityType: candidate.entityType || "onsen",
        verificationType: candidate.source === "photo_exif" ? "photo_exif" : (onsite ? "gps_recovered" : "self_report_nearby"),
        verificationLevel: onsite ? "onsite" : "recorded",
        recordSource: "visit_candidate_confirmation",
        recoveredAt: Date.now(),
        evidence: candidate.evidence || []
      });
      saveCheckins(list);
    }
    candidate.status = "confirmed";
    candidate.resolvedAt = Date.now();
    saveCandidates(candidates);
    refreshVisitDependentUi();
  }

  function dismissCandidate(candidateId) {
    const candidates = loadCandidates();
    const candidate = candidates.find((item) => item.id === candidateId && item.status === "pending");
    if (!candidate) return;
    candidate.status = "dismissed";
    candidate.resolvedAt = Date.now();
    saveCandidates(candidates);
    renderTripView();
  }

  function showCandidateOnMap(candidateId) {
    const candidate = loadCandidates().find((item) => item.id === candidateId);
    if (!candidate) return;
    forceThreeWayTab("map");
    if (typeof selectSpot === "function") selectSpot(candidate.spotId);
    const spot = spots.find((item) => item.id === candidate.spotId);
    if (spot && typeof map !== "undefined" && map) {
      map.flyTo({ center: [spot.lng, spot.lat], zoom: Math.max(map.getZoom?.() || 10, 11) });
    }
  }

  function saveManualVisit() {
    const nameInput = document.getElementById("tripManualSpot");
    const dateInput = document.getElementById("tripManualDate");
    const status = document.getElementById("tripManualStatus");
    const normalized = normalizeName(nameInput?.value || "");
    const spot = spots.find((item) => normalizeName(item.name) === normalized);
    if (!spot) {
      status.textContent = "候補から温泉名を選んでください。";
      return;
    }
    if (loadCheckins().some((item) => item.spotId === spot.id)) {
      status.textContent = `${spot.name} はすでに訪問済みです。`;
      return;
    }
    const checkedAt = parseLocalDateNoon(dateInput?.value) || Date.now();
    const list = loadCheckins();
    list.push({
      spotId: spot.id,
      name: spot.name,
      prefecture: spot.prefecture,
      checkedAt,
      accuracyM: null,
      zoneLabel: null,
      entityType: "onsen",
      verificationType: "self_report",
      verificationLevel: "recorded",
      recordSource: "past_visit_manual",
      recordedAt: Date.now(),
      evidence: []
    });
    saveCheckins(list);
    nameInput.value = "";
    status.textContent = `${spot.name} を「訪問記録」として追加しました。`;
    refreshVisitDependentUi();
  }

  async function handlePhotoSelection(event) {
    const file = event.target.files?.[0];
    const status = document.getElementById("tripPhotoStatus");
    event.target.value = "";
    if (!file) return;
    status.textContent = "写真の位置情報を確認中…";
    try {
      const exif = await readJpegExifGps(file);
      if (!exif?.lat || !exif?.lng) {
        status.textContent = "GPS位置情報が見つかりませんでした。カメラ設定や共有時の位置情報削除をご確認ください。";
        return;
      }
      const photoAt = exif.takenAt || file.lastModified || Date.now();
      const match = findNearestSpotForPoint(exif.lat, exif.lng);
      if (!match || match.remainingM > PHOTO_NEARBY_MARGIN_M) {
        status.textContent = "写真のGPS位置に近い収録温泉が見つかりませんでした。";
        return;
      }
      const candidates = loadCandidates();
      const existing = candidates.find((item) => item.status === "pending" && item.spotId === match.spot.id && item.source === "photo_exif");
      const strength = match.inRange ? "photo_verified_range" : "photo_nearby";
      const record = existing || {
        id: `candidate-photo-${match.spot.id}-${Date.now()}`,
        entityType: "onsen",
        spotId: match.spot.id,
        name: match.spot.name,
        prefecture: match.spot.prefecture,
        status: "pending",
        source: "photo_exif",
        tripSessionId: activeSession()?.id || null,
        evidence: []
      };
      record.detectedAt = photoAt;
      record.distanceM = Math.round(match.distanceToCenterM);
      record.remainingM = Math.round(match.remainingM);
      record.accuracyM = null;
      record.zoneLabel = match.zone?.label || null;
      record.strength = strength;
      record.evidence = [{
        type: "photo_exif",
        lat: exif.lat,
        lng: exif.lng,
        takenAt: photoAt,
        originalDateText: exif.originalDateText || null,
        distanceToCenterM: record.distanceM,
        remainingM: record.remainingM,
        zoneLabel: record.zoneLabel,
        strength
      }];
      if (!existing) candidates.push(record);
      saveCandidates(candidates);
      status.textContent = `${match.spot.name} の${match.inRange ? "チェックイン範囲内" : "付近"}で撮影された写真として候補に追加しました。`;
      renderTripView();
    } catch (err) {
      console.warn("photo exif parse failed", err);
      status.textContent = "この写真のEXIFを読み取れませんでした。JPEG原本でお試しください。";
    }
  }

  function findNearestSpotForPoint(lat, lng) {
    let best = null;
    for (const spot of spots) {
      const nearest = getNearestZoneStatus(spot, { lat, lng });
      if (!nearest) continue;
      if (!best || nearest.remainingM < best.remainingM ||
        (nearest.remainingM === best.remainingM && nearest.distanceToCenterM < best.distanceToCenterM)) {
        best = { spot, ...nearest };
      }
    }
    return best;
  }

  function refreshVisitDependentUi() {
    if (typeof renderStats === "function") renderStats();
    if (typeof renderHistory === "function") renderHistory();
    if (typeof refreshSpotSource === "function") refreshSpotSource();
    if (typeof renderCollectionProgress === "function") renderCollectionProgress();
    renderTripView();
  }

  function getVerificationSummary() {
    const bySpot = new Map();
    for (const item of loadCheckins()) {
      if (!item?.spotId) continue;
      const current = bySpot.get(item.spotId);
      const onsite = item.verificationLevel === "onsite" || ["gps_manual", "gps_legacy", "gps_recovered", "photo_exif"].includes(item.verificationType);
      if (!current || (onsite && !current.onsite)) bySpot.set(item.spotId, { onsite, item });
    }
    const onsite = [...bySpot.values()].filter((value) => value.onsite).length;
    return { total: bySpot.size, onsite, recordedOnly: bySpot.size - onsite };
  }

  function isSpotOnsiteVerified(spotId) {
    return loadCheckins().some((item) => item.spotId === spotId &&
      (item.verificationLevel === "onsite" || ["gps_manual", "gps_legacy", "gps_recovered", "photo_exif"].includes(item.verificationType)));
  }

  function renderTripView() {
    const view = document.getElementById("tripView");
    if (!view) return;
    const settings = loadSettings();
    const summary = getVerificationSummary();
    const pending = pendingCandidates();
    const toggle = document.getElementById("tripModeToggle");
    if (toggle) {
      toggle.textContent = settings.tripMode ? "旅行モード ON" : "旅行モード OFF";
      toggle.classList.toggle("active", settings.tripMode);
    }
    setText("tripOnsiteMetric", summary.onsite);
    setText("tripRecordedMetric", summary.recordedOnly);
    setText("tripCandidateMetric", pending.length);
    renderCandidateList(pending);
    renderSessions();
  }

  function renderCandidateList(pending) {
    const root = document.getElementById("tripCandidateList");
    if (!root) return;
    root.innerHTML = "";
    if (!pending.length) {
      root.innerHTML = '<div class="trip-empty">取り逃し候補はありません。現在地取得時に近くの未訪問スポットを自動記録します。</div>';
      return;
    }
    for (const candidate of pending.slice(0, 80)) {
      const row = document.createElement("div");
      row.className = "trip-candidate";
      const strength = candidate.strength === "verified_range" ? "GPS範囲内" :
        candidate.strength === "photo_verified_range" ? "写真・範囲内" :
        candidate.source === "photo_exif" ? "写真・付近" : "GPS付近";
      const verified = ["verified_range", "photo_verified_range"].includes(candidate.strength);
      row.innerHTML = `
        <div class="trip-candidate-main">
          <div class="trip-candidate-title"><span class="trip-evidence ${verified ? "verified" : "nearby"}">${escapeHtml(strength)}</span><strong>${escapeHtml(candidate.name)}</strong></div>
          <div class="trip-candidate-meta">${escapeHtml(candidate.prefecture || "")} ・ ${formatDateTime(candidate.detectedAt)} ・ ${Math.round(candidate.distanceM || 0)}m${candidate.accuracyM ? ` ・ 精度${Math.round(candidate.accuracyM)}m` : ""}</div>
        </div>
        <div class="trip-candidate-actions">
          <button type="button" data-action="map">地図</button>
          <button type="button" data-action="dismiss">除外</button>
          <button type="button" class="primary" data-action="confirm">取得</button>
        </div>`;
      row.querySelector('[data-action="map"]').addEventListener("click", () => showCandidateOnMap(candidate.id));
      row.querySelector('[data-action="dismiss"]').addEventListener("click", () => dismissCandidate(candidate.id));
      row.querySelector('[data-action="confirm"]').addEventListener("click", () => confirmCandidate(candidate.id));
      root.appendChild(row);
    }
  }

  function renderSessions() {
    const root = document.getElementById("tripSessionList");
    if (!root) return;
    const sessions = loadSessions().slice().sort((a, b) => b.startedAt - a.startedAt).slice(0, 12);
    const candidates = loadCandidates();
    const checkins = loadCheckins();
    root.innerHTML = "";
    if (!sessions.length) {
      root.innerHTML = '<div class="trip-empty">旅行モードをONにすると、ここに旅行ログが残ります。</div>';
      return;
    }
    for (const session of sessions) {
      const end = session.endedAt || Date.now();
      const candidateCount = candidates.filter((item) => item.tripSessionId === session.id).length;
      const visits = new Set(checkins.filter((item) => item.checkedAt >= session.startedAt && item.checkedAt <= end).map((item) => item.spotId));
      const div = document.createElement("div");
      div.className = "trip-session";
      div.innerHTML = `<strong>${formatLocalDate(session.startedAt)}${session.endedAt ? "" : " ・ 進行中"}</strong><span>訪問 ${visits.size} / 候補 ${candidateCount}</span>`;
      root.appendChild(div);
    }
  }

  function scheduleVisitRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderTripView, 80);
  }

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = String(value);
  }

  function normalizeName(value) {
    return String(value || "").normalize("NFKC").replace(/[・･\s　]/g, "").toLowerCase();
  }

  function formatLocalDate(value) {
    const date = new Date(value);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function formatDateTime(value) {
    return new Date(value).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function parseLocalDateNoon(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0).getTime();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[char]));
  }

  async function readJpegExifGps(file) {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) throw new Error("not jpeg");
    let offset = 2;
    while (offset + 4 < view.byteLength) {
      if (view.getUint8(offset) !== 0xff) { offset++; continue; }
      const marker = view.getUint8(offset + 1);
      if (marker === 0xda || marker === 0xd9) break;
      const length = view.getUint16(offset + 2, false);
      if (marker === 0xe1 && length >= 8 && ascii(view, offset + 4, 6) === "Exif\u0000\u0000") {
        return parseTiffExif(view, offset + 10);
      }
      offset += 2 + length;
    }
    return null;
  }

  function parseTiffExif(view, tiffStart) {
    const order = ascii(view, tiffStart, 2);
    const little = order === "II";
    if (!little && order !== "MM") throw new Error("bad tiff order");
    const u16 = (o) => view.getUint16(tiffStart + o, little);
    const u32 = (o) => view.getUint32(tiffStart + o, little);
    if (u16(2) !== 42) throw new Error("bad tiff magic");
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
      takenAt = parseExifDate(originalDateText);
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
    const size = typeSize(entry.type) * entry.components;
    return size <= 4 ? entry.entry + 8 : tiffStart + entry.valueOffset;
  }

  function valueAsUint(entry, view, tiffStart, little) {
    if (!entry) return null;
    const pos = valuePosition(entry, tiffStart);
    if (pos === null) return null;
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

  function parseExifDate(value) {
    const match = /^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/.exec(value || "");
    if (!match) return null;
    const [, y, m, d, hh, mm, ss] = match.map(Number);
    const time = new Date(y, m - 1, d, hh, mm, ss).getTime();
    return Number.isFinite(time) ? time : null;
  }
})();
