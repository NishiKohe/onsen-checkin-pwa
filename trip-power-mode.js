(() => {
  const geo = navigator.geolocation;
  if (!geo || geo.__onsenTripPowerWrapped) return;

  const wrappedGet = geo.getCurrentPosition.bind(geo);
  const wrappedWatch = geo.watchPosition.bind(geo);
  const wrappedClear = geo.clearWatch.bind(geo);
  const SETTINGS_KEY = "visitSettingsV1";
  const TRIP_WATCH_MAX_AGE = 30000;
  const TRIP_WATCH_TIMEOUT = 20000;
  const WARNING_GAP_MS = 30 * 60 * 1000;
  const PERSIST_INTERVAL_MS = 30 * 1000;
  const virtualWatches = new Map();
  let nextVirtualId = 810000000;
  let lastPersistAt = 0;
  let runtimeLast = null;
  let uiTimer = null;

  function readSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      return { tripMode: false, trackingMode: "eco", ...parsed };
    } catch {
      return { tripMode: false, trackingMode: "eco" };
    }
  }

  function writeSettings(patch) {
    const next = { ...readSettings(), ...patch };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    return next;
  }

  function isTripWatch(options) {
    return options?.enableHighAccuracy === true &&
      Number(options?.maximumAge) === TRIP_WATCH_MAX_AGE &&
      Number(options?.timeout) === TRIP_WATCH_TIMEOUT;
  }

  function clearInternal(state) {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    if (state.nativeWatchId !== null) {
      wrappedClear(state.nativeWatchId);
      state.nativeWatchId = null;
    }
  }

  function nearestUnvisitedRemainingM(pos) {
    try {
      if (typeof spots === "undefined" || !Array.isArray(spots) ||
          typeof loadCheckins !== "function" || typeof getNearestZoneStatus !== "function") return Infinity;
      const visited = new Set(loadCheckins().map((item) => item.spotId));
      let best = Infinity;
      const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      for (const spot of spots) {
        if (!spot?.id || visited.has(spot.id)) continue;
        const nearest = getNearestZoneStatus(spot, point);
        if (!nearest) continue;
        best = Math.min(best, Number(nearest.remainingM ?? Infinity));
      }
      return best;
    } catch {
      return Infinity;
    }
  }

  function chooseEcoPlan(pos) {
    const remainingM = nearestUnvisitedRemainingM(pos);
    const speedMps = Number.isFinite(pos.coords.speed) ? Number(pos.coords.speed) : 0;

    if (remainingM <= 500) {
      return { intervalMs: 30000, highAccuracy: true, label: "30秒", remainingM };
    }
    if (remainingM <= 2000) {
      return { intervalMs: 45000, highAccuracy: true, label: "45秒", remainingM };
    }
    if (remainingM <= 10000) {
      return { intervalMs: 90000, highAccuracy: false, label: "90秒", remainingM };
    }
    if (speedMps >= 8) {
      return { intervalMs: 90000, highAccuracy: false, label: "90秒", remainingM };
    }
    return { intervalMs: 180000, highAccuracy: false, label: "3分", remainingM };
  }

  function updateRuntimeFromPosition(pos, plan = null) {
    const now = Date.now();
    const nearestM = plan?.remainingM ?? nearestUnvisitedRemainingM(pos);
    runtimeLast = {
      sampledAt: Number(pos.timestamp || now),
      accuracyM: Math.round(Number(pos.coords.accuracy || 0)),
      lat: Number(pos.coords.latitude),
      lng: Number(pos.coords.longitude),
      nearestUnvisitedM: Number.isFinite(nearestM) ? Math.max(0, Math.round(nearestM)) : null,
      nextIntervalLabel: plan?.label || null
    };

    if (now - lastPersistAt >= PERSIST_INTERVAL_MS) {
      writeSettings({
        lastLocationSampleAt: runtimeLast.sampledAt,
        lastLocationAccuracyM: runtimeLast.accuracyM,
        lastNearestUnvisitedM: runtimeLast.nearestUnvisitedM,
        lastTrackingIntervalLabel: runtimeLast.nextIntervalLabel
      });
      lastPersistAt = now;
    }
    renderPowerStatus();
  }

  function scheduleEco(state, delayMs = 0, first = false) {
    if (state.stopped) return;
    clearInternal(state);
    state.timer = setTimeout(() => {
      state.timer = null;
      if (state.stopped) return;
      const settings = readSettings();
      if (settings.trackingMode === "precise") {
        reconfigureState(state);
        return;
      }

      const previous = runtimeLast;
      const initialHighAccuracy = first || previous?.nearestUnvisitedM <= 2000;
      wrappedGet((pos) => {
        if (state.stopped) return;
        const plan = chooseEcoPlan(pos);
        updateRuntimeFromPosition(pos, plan);
        state.success?.(pos);
        scheduleEco(state, plan.intervalMs, false);
      }, (err) => {
        if (state.stopped) return;
        state.error?.(err);
        writeSettings({ lastTrackingErrorAt: Date.now(), lastTrackingErrorCode: err?.code || null });
        renderPowerStatus();
        scheduleEco(state, 60000, false);
      }, {
        enableHighAccuracy: initialHighAccuracy,
        maximumAge: initialHighAccuracy ? 15000 : 60000,
        timeout: initialHighAccuracy ? 15000 : 12000
      });
    }, Math.max(0, delayMs));
  }

  function startPrecise(state) {
    clearInternal(state);
    state.nativeWatchId = wrappedWatch((pos) => {
      if (state.stopped) return;
      updateRuntimeFromPosition(pos, { label: "連続", remainingM: nearestUnvisitedRemainingM(pos) });
      state.success?.(pos);
    }, (err) => {
      if (state.stopped) return;
      state.error?.(err);
      writeSettings({ lastTrackingErrorAt: Date.now(), lastTrackingErrorCode: err?.code || null });
      renderPowerStatus();
    }, state.options);
  }

  function reconfigureState(state) {
    if (!state || state.stopped) return;
    clearInternal(state);
    if (readSettings().trackingMode === "precise") startPrecise(state);
    else scheduleEco(state, 0, true);
  }

  try {
    geo.watchPosition = (success, error, options) => {
      if (!isTripWatch(options)) return wrappedWatch(success, error, options);
      const id = nextVirtualId++;
      const state = {
        id,
        success,
        error,
        options,
        timer: null,
        nativeWatchId: null,
        stopped: false
      };
      virtualWatches.set(id, state);
      reconfigureState(state);
      return id;
    };

    geo.clearWatch = (id) => {
      const state = virtualWatches.get(id);
      if (!state) return wrappedClear(id);
      state.stopped = true;
      clearInternal(state);
      virtualWatches.delete(id);
    };

    Object.defineProperty(geo, "__onsenTripPowerWrapped", { value: true, configurable: false });
  } catch (err) {
    console.warn("trip power manager could not wrap geolocation", err);
  }

  function formatAgo(timestamp) {
    if (!timestamp) return "まだありません";
    const diff = Math.max(0, Date.now() - timestamp);
    if (diff < 60000) return "たった今";
    if (diff < 60 * 60000) return `${Math.floor(diff / 60000)}分前`;
    return `${Math.floor(diff / 3600000)}時間前`;
  }

  function formatDistance(meters) {
    if (!Number.isFinite(meters)) return "—";
    if (meters < 1000) return `${Math.round(meters)}m`;
    if (meters < 10000) return `${(meters / 1000).toFixed(1)}km`;
    return `${Math.round(meters / 1000)}km`;
  }

  function installPowerUi() {
    const metrics = document.querySelector("#tripView .trip-metrics");
    if (!metrics || document.getElementById("tripPowerCard")) return false;

    const card = document.createElement("section");
    card.id = "tripPowerCard";
    card.className = "trip-card trip-power-card";
    card.innerHTML = `
      <div class="trip-power-head">
        <div>
          <h3>位置記録</h3>
          <p>通常は省電力。未取得スポットが近い時だけ測位を細かくします。</p>
        </div>
        <div class="trip-power-switch" role="group" aria-label="位置記録モード">
          <button type="button" data-power-mode="eco">省電力</button>
          <button type="button" data-power-mode="precise">精密</button>
        </div>
      </div>
      <div class="trip-power-status-grid">
        <div><span>最終位置記録</span><b id="tripLastLocation">—</b></div>
        <div><span>測位間隔</span><b id="tripTrackingInterval">—</b></div>
        <div><span>最寄り未取得</span><b id="tripNearestUnvisited">—</b></div>
      </div>
      <div id="tripTrackingNotice" class="trip-tracking-notice"></div>`;
    metrics.insertAdjacentElement("afterend", card);

    card.querySelectorAll("[data-power-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.powerMode === "precise" ? "precise" : "eco";
        writeSettings({ trackingMode: mode });
        for (const state of virtualWatches.values()) reconfigureState(state);
        renderPowerStatus();
      });
    });
    return true;
  }

  function renderPowerStatus() {
    installPowerUi();
    if (!document.getElementById("tripPowerCard")) return;

    const settings = readSettings();
    const lastAt = runtimeLast?.sampledAt || Number(settings.lastLocationSampleAt || 0) || null;
    const accuracy = runtimeLast?.accuracyM ?? settings.lastLocationAccuracyM ?? null;
    const nearest = runtimeLast?.nearestUnvisitedM ?? settings.lastNearestUnvisitedM ?? null;
    const interval = settings.trackingMode === "precise"
      ? "連続"
      : (runtimeLast?.nextIntervalLabel || settings.lastTrackingIntervalLabel || "自動");

    const lastNode = document.getElementById("tripLastLocation");
    const intervalNode = document.getElementById("tripTrackingInterval");
    const nearestNode = document.getElementById("tripNearestUnvisited");
    const notice = document.getElementById("tripTrackingNotice");
    if (lastNode) lastNode.textContent = `${formatAgo(lastAt)}${accuracy ? ` / ±${Math.round(accuracy)}m` : ""}`;
    if (intervalNode) intervalNode.textContent = settings.trackingMode === "precise" ? "高精度・連続" : `自動・${interval}`;
    if (nearestNode) nearestNode.textContent = Number.isFinite(Number(nearest)) ? formatDistance(Number(nearest)) : "—";

    document.querySelectorAll("#tripPowerCard [data-power-mode]").forEach((button) => {
      button.classList.toggle("active", button.dataset.powerMode === settings.trackingMode);
    });

    if (!notice) return;
    notice.className = "trip-tracking-notice";
    if (!settings.tripMode) {
      notice.textContent = "旅行モードOFF。位置の継続記録は行いません。";
      return;
    }
    const gap = lastAt ? Date.now() - lastAt : Infinity;
    if (document.visibilityState !== "visible") {
      notice.classList.add("info");
      notice.textContent = "バックグラウンド・画面OFF中はPWAの制約で位置記録を停止し、アプリ復帰時に自動再開します。";
    } else if (gap > WARNING_GAP_MS) {
      notice.classList.add("warning");
      notice.textContent = "⚠ 30分以上、位置を記録できていません。位置情報権限や端末の省電力設定を確認してください。";
    } else if (settings.trackingMode === "precise") {
      notice.classList.add("warning-soft");
      notice.textContent = "精密モード：高精度GPSを継続利用します。取り逃しに強い代わりに電池消費が増えます。";
    } else {
      notice.classList.add("ok");
      notice.textContent = "省電力モード：距離と移動状況に応じて約30秒〜3分間隔で自動調整しています。";
    }
  }

  window.addEventListener("onsen-location-sample", (event) => {
    if (!readSettings().tripMode || !event.detail) return;
    const detail = event.detail;
    runtimeLast = {
      sampledAt: Number(detail.sampledAt || Date.now()),
      accuracyM: Math.round(Number(detail.accuracyM || 0)),
      lat: Number(detail.lat),
      lng: Number(detail.lng),
      nearestUnvisitedM: runtimeLast?.nearestUnvisitedM ?? null,
      nextIntervalLabel: runtimeLast?.nextIntervalLabel ?? null
    };
    renderPowerStatus();
  });

  document.addEventListener("visibilitychange", renderPowerStatus);
  window.addEventListener("pageshow", renderPowerStatus);
  window.addEventListener("storage", renderPowerStatus);

  const uiPoll = setInterval(() => {
    if (document.getElementById("tripPowerCard") || installPowerUi()) {
      clearInterval(uiPoll);
      renderPowerStatus();
      if (!uiTimer) uiTimer = setInterval(renderPowerStatus, 60000);
    }
  }, 100);

  window.OnsenTripPower = {
    getMode: () => readSettings().trackingMode,
    setMode: (mode) => {
      writeSettings({ trackingMode: mode === "precise" ? "precise" : "eco" });
      for (const state of virtualWatches.values()) reconfigureState(state);
      renderPowerStatus();
    },
    render: renderPowerStatus
  };
})();