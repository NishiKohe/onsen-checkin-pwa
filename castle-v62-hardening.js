(() => {
  const BUILD = "v62";
  const ZONE_SOURCE = "data/castle-checkin-zones-v62.json";
  let checking = false;
  let characterPatched = false;

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
    setMessage("チェックイン確定のため、現在地をもう一度高精度で取得しています…");

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
    const radiusM = Number(zone.radiusM || 0);
    const accuracyRequiredM = Number(zone.accuracyRequiredM || 80);
    const accurate = Number.isFinite(position.accuracyM) && position.accuracyM <= accuracyRequiredM;
    const inRange = Number.isFinite(distanceM) && distanceM <= radiusM;
    setFreshMetrics(position, distanceM);

    if (!accurate) {
      checking = false;
      button.disabled = true;
      button.textContent = `位置精度不足（${Math.round(position.accuracyM)}m）`;
      setMessage(`チェックイン時のGPS精度が不足しています。${accuracyRequiredM}m以内が必要です。もう一度「現在地を確認」してください。`);
      return;
    }
    if (!inRange) {
      checking = false;
      const remain = Math.max(0, distanceM - radiusM);
      button.disabled = true;
      button.textContent = `範囲外（あと${formatDistance(remain)}）`;
      setMessage(`チェックイン直前の再測位では範囲外でした。城の判定範囲まであと${formatDistance(remain)}です。`);
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
      freshFix: true
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
    const noticeText = "日本100名城100城を地図・GPSチェックインに対応しました。過去訪問はコレクション・武威・登用候補解放に反映します。現地では各城の「地図」からGPSチェックインでき、代表人物設定済みの城は初回厳格GPSで人物が加入します。";
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
