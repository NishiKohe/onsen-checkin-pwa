(() => {
  const geo = navigator.geolocation;
  if (!geo || geo.__onsenVisitLogWrapped) return;

  const emit = (pos, source) => {
    if (!pos?.coords) return;
    window.dispatchEvent(new CustomEvent("onsen-location-sample", {
      detail: {
        lat: Number(pos.coords.latitude),
        lng: Number(pos.coords.longitude),
        accuracyM: Number(pos.coords.accuracy || 0),
        altitudeM: Number.isFinite(pos.coords.altitude) ? Number(pos.coords.altitude) : null,
        speedMps: Number.isFinite(pos.coords.speed) ? Number(pos.coords.speed) : null,
        headingDeg: Number.isFinite(pos.coords.heading) ? Number(pos.coords.heading) : null,
        sampledAt: Number(pos.timestamp || Date.now()),
        source
      }
    }));
  };

  try {
    const originalGet = geo.getCurrentPosition.bind(geo);
    geo.getCurrentPosition = (success, error, options) => originalGet((pos) => {
      try { emit(pos, "getCurrentPosition"); } catch (err) { console.warn("visit sample emit failed", err); }
      success?.(pos);
    }, error, options);

    const originalWatch = geo.watchPosition.bind(geo);
    geo.watchPosition = (success, error, options) => originalWatch((pos) => {
      try { emit(pos, "watchPosition"); } catch (err) { console.warn("visit sample emit failed", err); }
      success?.(pos);
    }, error, options);

    Object.defineProperty(geo, "__onsenVisitLogWrapped", { value: true, configurable: false });
  } catch (err) {
    console.warn("visit geolocation preload could not wrap geolocation", err);
  }
})();
