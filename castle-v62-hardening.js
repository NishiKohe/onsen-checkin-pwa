(() => {
  const BUILD = "v63";
  const ZONE_SOURCE = "data/castle-checkin-zones-v62.json";
  const MIN_CHECKIN_RADIUS_M = 500;
  const ONSEN_DEFAULT_RADIUS_M = 750;
  const GPS_ACCURACY_LIMIT_M = 500;
  let checking = false;
  let characterPatched = false;

  const CASTLE_RADIUS_OVERRIDES = Object.freeze({
    castle_001_nemuro_chashi: 2000,
    castle_022_hachioji: 1500,
    castle_032_kasugayama: 1500,
    castle_034_nanao: 2000,
    castle_037_ichijodani: 2000,
    castle_038_iwamura: 1500,
    castle_039_gifu: 1500,
    castle_049_odani: 2000,
    castle_052_kannonji: 2000,
    castle_055_chihaya: 2000,
    castle_056_takeda: 1500,
    castle_061_takatori: 2000,
    castle_063_tottori: 1500,
    castle_065_gassan_toda: 1500,
    castle_066_tsuwano: 1500,
    castle_068_bitchu_matsuyama: 1500,
    castle_069_ki_no_jo: 2000,
    castle_085_fukuoka: 1000,
    castle_086_onojo: 2000,
    castle_088_yoshinogari: 2000,
    castle_095_oka: 1500
  });

  function normalizeRadiusM(value, fallback = ONSEN_DEFAULT_RADIUS_M) {
    const parsed = Number(value);
    const base = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    return Math.max(MIN_CHECKIN_RADIUS_M, Math.round(base));
  }

  function castleRadiusFromLegacy(entry) {
    const override = CASTLE_RADIUS_OVERRIDES[String(entry?.castleId || "")];
    if (Number.isFinite(Number(override))) return Number(override);
    const raw = normalizeRadiusM(entry?.radiusM, MIN_CHECKIN_RADIUS_M);
    if (raw <= 500) return 500;
    if (raw <= 550) return 750;
    if (raw <= 650) return 1000;
    if (raw <= 750) return 1500;
    return 2000;
  }

  function installCastleZonePolicy() {
    const originalFetch = window.fetch?.bind(window);
    if (!originalFetch || window.__onsenCheckinFetchPolicyV63) return;
    window.__onsenCheckinFetchPolicyV63 = true;

    window.fetch = async function checkinPolicyFetch(input, init) {
      const response = await originalFetch(input, init);
      let url = "";
      try {
        url = typeof input === "string" ? input : input?.url || "";
      } catch {}
      if (!/castle-checkin-zones-v62\.json(?:$|[?#])/.test(url) || !response.ok) return response;

      try {
        const data = await response.clone().json();
        if (!Array.isArray(data?.entries)) return response;
        data.version = Math.max(2, Number(data.version || 0));
        data.adjustedIn = BUILD;
        data.policy = {
          ...(data.policy || {}),
          minimumRadiusM: MIN_CHECKIN_RADIUS_M,
          defaultAccuracyRequiredM: GPS_ACCURACY_LIMIT_M,
          radiusPolicy: "500mを最低保証値とし、市街地の城は500-1000m、山城・広域史跡・到達困難地点は1500-2000m。現地到達時にGPS判定で取りこぼさないことを優先する。",
          gpsPolicy: `GPS精度は${GPS_ACCURACY_LIMIT_M}m以内を許容し、現地での取りこぼしを抑える。`
        };
        data.entries = data.entries.map((entry) => ({
          ...entry,
          radiusM: castleRadiusFromLegacy(entry),
          accuracyRequiredM: GPS_ACCURACY_LIMIT_M,
          checkinZoneStatus: "v63_min500_accessibility_adjusted"
        }));
        return new Response(JSON.stringify(data), {
          status: response.status,
          statusText: response.statusText,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        });
      } catch (error) {
        console.warn("v63 castle zone policy transform failed", error);
        return response;
      }
    };
  }

  function installOnsenRadiusPolicy() {
    try {
      if (typeof getCheckinRadiusM === "function") {
        getCheckinRadiusM = function getCheckinRadiusMWithMinimum(spot) {
          return normalizeRadiusM(spot?.checkinRadiusM, ONSEN_DEFAULT_RADIUS_M);
        };
      }

      if (typeof getCheckinZones === "function") {
        getCheckinZones = function getCheckinZonesWithMinimum(spot) {
          if (Array.isArray(spot?.checkinZones)) {
            const zones = spot.checkinZones
              .map((zone, index) => ({
                label: zone?.label || `チェックイン地点${index + 1}`,
                lat: Number(zone?.lat),
                lng: Number(zone?.lng),
                radiusM: normalizeRadiusM(zone?.radiusM, ONSEN_DEFAULT_RADIUS_M)
              }))
              .filter((zone) => Number.isFinite(zone.lat) && Number.isFinite(zone.lng));
            if (zones.length > 0) return zones;
          }
          return [{
            label: spot?.name || "温泉地",
            lat: Number(spot?.lat),
            lng: Number(spot?.lng),
            radiusM: normalizeRadiusM(spot?.checkinRadiusM, ONSEN_DEFAULT_RADIUS_M)
          }].filter((zone) => Number.isFinite(zone.lat) && Number.isFinite(zone.lng));
        };
      }

      if (typeof updateDistanceAndButton === "function") {
        updateDistanceAndButton = function updateDistanceAndButtonV63() {
          if (!selectedSpot) {
            el("spotDist").textContent = "-";
            el("btnCheckin").disabled = true;
            el("btnCheckin").textContent = "チェックイン";
            return;
          }

          if (!userPos) {
            el("spotDist").textContent = "現在地未取得";
            el("btnCheckin").disabled = true;
            el("btnCheckin").textContent = "現在地を取得してください";
            return;
          }

          const nearest = getNearestZoneStatus(selectedSpot, userPos);
          if (!nearest) {
            el("spotDist").textContent = "判定地点なし";
            el("btnCheckin").disabled = true;
            el("btnCheckin").textContent = "チェックイン地点未設定";
            return;
          }

          el("spotDist").textContent = formatDistanceKm(nearest.distanceToCenterM);
          const accurateEnough = userAccuracyM !== null && Number.isFinite(Number(userAccuracyM)) && Number(userAccuracyM) <= GPS_ACCURACY_LIMIT_M;
          const cooldownOk = !isCooldownActive(selectedSpot.id);
          el("btnCheckin").disabled = !(accurateEnough && nearest.inRange && cooldownOk);

          if (!accurateEnough) {
            el("btnCheckin").textContent = `位置精度が低いです（${GPS_ACCURACY_LIMIT_M}m超）`;
          } else if (!nearest.inRange) {
            el("btnCheckin").textContent = nearest.remainingM < 1000
              ? `範囲外（あと${Math.round(nearest.remainingM)}m）`
              : `範囲外（あと${formatDistanceKm(nearest.remainingM)}）`;
          } else if (!cooldownOk) {
            el("btnCheckin").textContent = "チェックイン済（24時間以内）";
          } else {
            el("btnCheckin").textContent = nearest.zone.label
              ? `チェックイン（${nearest.zone.label}）`
              : "チェックイン";
          }
        };
      }
    } catch (error) {
      console.warn("v63 onsen radius policy install failed", error);
    }
  }

  installCastleZonePolicy();
  installOnsenRadiusPolicy();

  window.OnsenCheckinPolicy = {
    build: BUILD,
    minimumRadiusM: MIN_CHECKIN_RADIUS_M,
    onsenDefaultRadiusM: ONSEN_DEFAULT_RADIUS_M,
    gpsAccuracyLimitM: GPS_ACCURACY_LIMIT_M,
    normalizeRadiusM,
    castleRadiusFromLegacy,
    castleOverrides: CASTLE_RADIUS_OVERRIDES
  };
  window.dispatchEvent(new CustomEvent("onsen-checkin-policy-ready", { detail: window.OnsenCheckinPolicy }));

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>\"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
  }

  function formatDistance(meters) {
    const value = Number(meters);
    if (!Number.isFinite(value)) return "—";
    if (value < 1000) return `${Math.round(value)}m`;
    return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)}km`;
  }

  function haversineM(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (value) => value * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function messageNode() { return document.getElementById("castleMapMessageV62"); }
  function checkinButton() { return document.getElementById("castleMapCheckinV62"); }

  function setMessage(text, html = false) {
    const node = messageNode();
    if (!node) return;
    if (html) node.innerHTML = text;
    else node.textContent = text;
  }

  function setFreshMetrics(position, distanceM) {
    const distance = document.getElementById("castleMapDistanceV62");
    const accuracy = document.getElementById("castleMapAccuracyV62");
    if (distance) distance.textContent = formatDistance(distanceM);
    if (accuracy) accuracy.textContent = Number.isFinite(Number(position?.accuracyM)) ? `${Math.round(Number(position.accuracyM))}m` : "—";
  }

  function freshPosition() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ ok: false, reason: "unsupported" });
        return;
      }
      navigator.geolocation.getCurrentPosition((position) => {
        resolve({
          ok: true,
          position: {
            lat: Number(position.coords.latitude),
            lng: Number(position.coords.longitude),
            accuracyM: Math.max(0, Number(position.coords.accuracy || 0)),
            measuredAt: Date.now()
          }
        });
      }, (error) => {
        resolve({ ok: false, reason: error?.message || "geolocation_error" });
      }, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      });
    });
  }

  function selectedZone(castleId) {
    const data = window.OnsenCastleMap?.zones?.();
    return Array.isArray(data?.entries) ? data.entries.find((entry) => entry.castleId === castleId) || null : null;
  }

  async function performFreshCheckin() {
    if (checking) return;
    const castleMap = window.OnsenCastleMap;
    const visits = window.OnsenCastleVisits;
    const characters = window.OnsenCharacterRuntime;
    const castleId = castleMap?.selectedCastleId?.();
    const zone = selectedZone(castleId);
    const button = checkinButton();
    if (!castleId || !zone || !button || !visits) return;

    if (visits.isStrictGps?.(castleId)) {
      setMessage("この城はすでに厳格GPSチェックイン済みです。");
      castleMap.refresh?.();
      return;
    }

    checking = true;
    button.disabled = true;
    button.textContent = "GPS再確認中…";
    setMessage("チェックイン確定のため、現在地をもう一度取得しています…");

    const measured = await freshPosition();
    if (!measured.ok) {
      checking = false;
      button.disabled = true;
      button.textContent = "現在地を確認してください";
      setMessage(measured.reason === "unsupported" ? "この端末は位置情報取得に対応していません。" : "現在地を取得できませんでした。位置情報の権限とGPS状態を確認してください。");
      return;
    }

    const position = measured.position;
    const distanceM = haversineM(position.lat, position.lng, Number(zone.lat), Number(zone.lng));
    const radiusM = normalizeRadiusM(zone.radiusM, MIN_CHECKIN_RADIUS_M);
    const accuracyRequiredM = Math.max(GPS_ACCURACY_LIMIT_M, Number(zone.accuracyRequiredM || 0));
    const accurate = Number.isFinite(position.accuracyM) && position.accuracyM <= accuracyRequiredM;
    const inRange = Number.isFinite(distanceM) && distanceM <= radiusM;
    setFreshMetrics(position, distanceM);

    if (!accurate) {
      checking = false;
      button.disabled = true;
      button.textContent = `位置精度不足（${Math.round(position.accuracyM)}m）`;
      setMessage(`GPS精度が${accuracyRequiredM}mを超えています。現在地をもう一度取得してください。`);
      return;
    }
    if (!inRange) {
      checking = false;
      const remain = Math.max(0, distanceM - radiusM);
      button.disabled = true;
      button.textContent = `範囲外（あと${formatDistance(remain)}）`;
      setMessage(`城の判定範囲まであと${formatDistance(remain)}です。判定半径は最低500m、山城・広域史跡は最大2kmに調整しています。`);
      return;
    }

    const beforeState = characters?.loadState?.() || {};
    const beforeOwned = new Set(Object.keys(beforeState.recruited || {}));
    const result = visits.registerStrictGpsVisit(castleId, {
      lat: position.lat,
      lng: position.lng,
      accuracyM: position.accuracyM,
      distanceM: Math.round(distanceM),
      radiusM,
      coordinateSource: ZONE_SOURCE,
      coordinateVerification: zone.coordinateStatus || "secondary_reference_crosschecked",
      checkedAt: Date.now(),
      freshFix: true,
      checkinPolicyBuild: BUILD
    });

    checking = false;
    if (!result?.ok) {
      button.disabled = false;
      button.textContent = "城チェックイン";
      setMessage("城チェックインを保存できませんでした。");
      return;
    }

    characters?.claimGuaranteedForCastle?.(castleId);
    castleMap.refresh?.();
    const afterState = characters?.loadState?.() || {};
    const gainedId = Object.keys(afterState.recruited || {}).find((id) => !beforeOwned.has(id));
    const claimedId = afterState.guaranteedCastleClaimed?.[castleId]?.characterId || gainedId;
    const character = claimedId ? characters?.get?.(claimedId) : null;
    if (result.already) {
      setMessage("この城はすでに厳格GPSチェックイン済みです。");
    } else if (character) {
      setMessage(`<strong>チェックイン成功！</strong> ${escapeHtml(character.name)} が仲間になりました。`, true);
    } else {
      setMessage("チェックイン成功！ GPS訪問を保存しました。代表人物が後から追加された場合も、このGPS実績から加入判定できます。");
    }
    try { navigator.vibrate?.([70, 40, 120]); } catch {}
  }

  function patchCharacterClaims() {
    const runtime = window.OnsenCharacterRuntime;
    const visits = window.OnsenCastleVisits;
    if (!runtime?.claimGuaranteedForCastle || !runtime?.loadState || !runtime?.saveState || characterPatched) return false;

    const original = runtime.claimGuaranteedForCastle.bind(runtime);
    runtime.claimGuaranteedForCastle = function claimGuaranteedRetryable(castleId) {
      const id = String(castleId || "");
      let state = runtime.loadState();
      if (state.guaranteedCastleClaimed?.[id]?.result === "no_seed_character") {
        delete state.guaranteedCastleClaimed[id];
        runtime.saveState(state, "clear_retryable_empty_castle_claim");
      }
      const result = original(id);
      if (result?.reason === "no_character") {
        state = runtime.loadState();
        if (state.guaranteedCastleClaimed?.[id]?.result === "no_seed_character") {
          delete state.guaranteedCastleClaimed[id];
          runtime.saveState(state, "keep_empty_castle_claim_retryable");
        }
      }
      return result;
    };
    characterPatched = true;
    runtime.castleClaimHardeningBuild = BUILD;

    const state = runtime.loadState();
    let cleaned = false;
    for (const [castleId, claim] of Object.entries(state.guaranteedCastleClaimed || {})) {
      if (claim?.result !== "no_seed_character") continue;
      delete state.guaranteedCastleClaimed[castleId];
      cleaned = true;
    }
    if (cleaned) runtime.saveState(state, "remove_legacy_empty_castle_claims");
    for (const castleId of visits?.strictGpsIds?.() || []) runtime.claimGuaranteedForCastle(castleId);
    return true;
  }

  function syncCopy() {
    const castleSwitch = document.querySelector('#mapDomainSwitchV62 [data-map-domain="castle"]');
    if (castleSwitch && castleSwitch.dataset.copyV62 !== "1") {
      castleSwitch.dataset.copyV62 = "1";
      castleSwitch.innerHTML = `<span aria-hidden="true">🏯</span><span>100名城</span>`;
      castleSwitch.setAttribute("aria-label", "日本100名城の地図を表示");
    }

    const onsenSwitch = document.querySelector('#mapDomainSwitchV62 [data-map-domain="onsen"]');
    if (onsenSwitch) onsenSwitch.setAttribute("aria-label", "温泉地図を表示");

    const notice = document.querySelector("#castleCollectionPanel .castle-notice");
    const noticeText = "日本100名城100城を地図・GPSチェックインに対応。判定半径は500m以上を最低保証とし、山城・広域史跡は1〜2kmまで拡張して現地での取りこぼしを抑えています。過去訪問はコレクション・武威・登用候補解放に反映します。";
    if (notice && notice.textContent !== noticeText) notice.textContent = noticeText;
  }

  function bindFreshCheckinCapture() {
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("#castleMapCheckinV62") : null;
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      performFreshCheckin().catch((error) => {
        checking = false;
        console.warn("fresh castle checkin failed", error);
        setMessage("城チェックイン処理でエラーが発生しました。現在地を再確認してください。");
      });
    }, true);
  }

  function install() {
    bindFreshCheckinCapture();
    syncCopy();
    patchCharacterClaims();
    window.addEventListener("onsen-character-runtime-ready", patchCharacterClaims);
    window.addEventListener("onsen-castle-map-ready", syncCopy);
    window.addEventListener("onsen-app-tab-changed", () => setTimeout(syncCopy, 30));
    window.addEventListener("pageshow", () => { syncCopy(); patchCharacterClaims(); });
    const observer = new MutationObserver(() => syncCopy());
    observer.observe(document.body, { childList: true, subtree: true });

    let attempts = 0;
    const timer = setInterval(() => {
      syncCopy();
      patchCharacterClaims();
      attempts += 1;
      if (attempts >= 80 && characterPatched) clearInterval(timer);
    }, 150);

    window.OnsenCastleV62Hardening = {
      build: BUILD,
      freshCheckin: performFreshCheckin,
      patchCharacterClaims,
      syncCopy
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
