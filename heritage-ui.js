// 温泉遺産UI拡張。ui-enhancements.js の汎用フィルタ基盤へ後付けする。
if (typeof uiFilterState !== "undefined") {
  uiFilterState.onsenHeritage = false;
}

if (typeof getVisibleSpots === "function") {
  const heritageBaseGetVisibleSpots = getVisibleSpots;
  getVisibleSpots = function heritageGetVisibleSpots() {
    const visible = heritageBaseGetVisibleSpots();
    if (!uiFilterState.onsenHeritage) return visible;
    return visible.filter(isOnsenHeritageSpot);
  };
}

if (typeof resetAllFilters === "function") {
  const heritageBaseResetAllFilters = resetAllFilters;
  resetAllFilters = function heritageResetAllFilters() {
    uiFilterState.onsenHeritage = false;
    heritageBaseResetAllFilters();
  };
}

if (typeof getSpotSearchText === "function") {
  const heritageBaseGetSpotSearchText = getSpotSearchText;
  getSpotSearchText = function heritageGetSpotSearchText(spot) {
    const base = heritageBaseGetSpotSearchText(spot);
    const facilities = getOnsenHeritageFacilities(spot).join(" ");
    return `${base}${normalizeSearchText(` 温泉遺産 ${facilities}`)}`;
  };
}

if (typeof renderEnhancedSpotDetails === "function") {
  const heritageBaseRenderEnhancedSpotDetails = renderEnhancedSpotDetails;
  renderEnhancedSpotDetails = function heritageRenderEnhancedSpotDetails(spot) {
    heritageBaseRenderEnhancedSpotDetails(spot);
    if (!spot || !isOnsenHeritageSpot(spot)) return;

    const tagContainer = document.getElementById("spotTags");
    if (!tagContainer) return;
    addSpotTag(tagContainer, "SR 温泉遺産", "accent");

    const facilities = getOnsenHeritageFacilities(spot);
    if (facilities.length) addSpotTag(tagContainer, `認定: ${facilities.join("・")}`);

    const statuses = spot.onsenHeritageFacilityStatuses || {};
    const suspended = facilities.filter((name) => ["suspended", "closed"].includes(statuses[name]));
    if (suspended.length) addSpotTag(tagContainer, `休館等: ${suspended.join("・")}`, "warning");
  };
}

function isOnsenHeritageSpot(spot) {
  return spot?.onsenHeritage === true ||
    spot?.onsenIsan === true ||
    (spot?.badges || []).includes("onsen_heritage") ||
    (spot?.heritageRelatedBadges || []).includes("onsen_heritage");
}

function getOnsenHeritageFacilities(spot) {
  if (Array.isArray(spot?.onsenHeritageFacilities)) return spot.onsenHeritageFacilities;
  if (Array.isArray(spot?.onsenIsanFacilities)) return spot.onsenIsanFacilities;
  return [];
}
