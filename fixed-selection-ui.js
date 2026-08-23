const FIXED_SELECTION_MEITO100_URL = "./data/fixed-selection-meito100.json";

let fixedSelectionFilterActive = false;
let fixedSelectionMaster = null;

waitForFixedSelectionCore().then(initFixedSelections).catch((err) => {
  console.warn("fixed selection init failed", err);
});

async function waitForFixedSelectionCore() {
  for (let i = 0; i < 200; i++) {
    if (
      typeof spots !== "undefined" &&
      Array.isArray(spots) &&
      spots.length > 0 &&
      typeof applySpotFilters === "function" &&
      typeof renderEnhancedSpotDetails === "function"
    ) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("core UI was not ready");
}

async function initFixedSelections() {
  const response = await fetch(FIXED_SELECTION_MEITO100_URL, { cache: "no-cache" });
  if (!response.ok) throw new Error(`fixed selection master load failed: ${response.status}`);
  fixedSelectionMaster = await response.json();

  applyFixedSelectionMaster(fixedSelectionMaster);
  installFixedSelectionFilter();
  wrapFixedSelectionUi();

  if (typeof setupSearchSuggestions === "function") {
    const datalist = document.getElementById("searchSuggestions");
    if (datalist) {
      const existing = new Set([...datalist.options].map((option) => option.value));
      for (const area of fixedSelectionMaster.areas || []) {
        if (!existing.has(area.officialName)) {
          const option = document.createElement("option");
          option.value = area.officialName;
          datalist.appendChild(option);
        }
      }
    }
  }

  applySpotFilters();
  console.info("fixed selection coverage", window.fixedSelectionCoverage);
}

function normalizeFixedName(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[・･\s　]/g, "")
    .replace(/[ヶケ]/g, "ヶ")
    .toLowerCase();
}

function findFixedSelectionSpot(area) {
  const aliases = (area.matchNames || [area.officialName]).map(normalizeFixedName);
  const samePrefecture = spots.filter((spot) => spot?.prefecture === area.prefecture);

  for (const spot of samePrefecture) {
    const name = normalizeFixedName(spot.name);
    if (aliases.includes(name)) return { spot, mode: "spot_name" };
  }
  for (const spot of samePrefecture) {
    const subAreas = (spot.subAreas || []).map(normalizeFixedName);
    if (aliases.some((alias) => subAreas.includes(alias))) return { spot, mode: "sub_area" };
  }
  return null;
}

function applyFixedSelectionMaster(master) {
  const matched = [];
  const unmatched = [];
  const selection = master.selection || {};

  for (const area of master.areas || []) {
    const match = findFixedSelectionSpot(area);
    if (!match) {
      unmatched.push({ prefecture: area.prefecture, officialName: area.officialName });
      continue;
    }

    const spot = match.spot;
    if (!Array.isArray(spot.fixedSelections)) spot.fixedSelections = [];
    const existing = spot.fixedSelections.find((item) =>
      item.id === selection.id && item.officialName === area.officialName
    );
    if (!existing) {
      spot.fixedSelections.push({
        id: selection.id,
        name: selection.name,
        officialName: area.officialName,
        issuer: selection.issuer,
        rarity: selection.rarity || "SR",
        lifecycle: selection.lifecycle || "permanent_core",
        sourceUrl: selection.sourceUrl,
        matchMode: match.mode
      });
    }

    if (!Array.isArray(spot.permanentBadges)) spot.permanentBadges = [];
    if (!spot.permanentBadges.includes(selection.id)) spot.permanentBadges.push(selection.id);

    matched.push({
      prefecture: area.prefecture,
      officialName: area.officialName,
      spotId: spot.id,
      spotName: spot.name,
      matchMode: match.mode
    });
  }

  window.fixedSelectionCoverage = {
    selectionId: selection.id,
    officialCount: (master.areas || []).length,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    matched,
    unmatched
  };
}

function installFixedSelectionFilter() {
  const row = document.querySelector(".filter-row");
  const reset = document.getElementById("btnResetFilters");
  if (!row || document.getElementById("btnFixedSelection")) return;

  const button = document.createElement("button");
  button.id = "btnFixedSelection";
  button.className = "filter-chip";
  button.type = "button";
  button.textContent = "固定百選";
  button.title = "年次更新を必要としない固定選定で絞り込み";
  button.addEventListener("click", () => {
    fixedSelectionFilterActive = !fixedSelectionFilterActive;
    button.classList.toggle("active", fixedSelectionFilterActive);
    applySpotFilters();
  });

  row.insertBefore(button, reset || null);
}

function isFixedSelectionSpot(spot) {
  return Array.isArray(spot?.fixedSelections) && spot.fixedSelections.length > 0;
}

function wrapFixedSelectionUi() {
  if (typeof getVisibleSpots === "function") {
    const baseGetVisibleSpots = getVisibleSpots;
    getVisibleSpots = function fixedSelectionGetVisibleSpots() {
      const visible = baseGetVisibleSpots();
      return fixedSelectionFilterActive ? visible.filter(isFixedSelectionSpot) : visible;
    };
  }

  if (typeof resetAllFilters === "function") {
    const baseResetAllFilters = resetAllFilters;
    resetAllFilters = function fixedSelectionResetAllFilters() {
      fixedSelectionFilterActive = false;
      document.getElementById("btnFixedSelection")?.classList.remove("active");
      baseResetAllFilters();
    };
  }

  if (typeof getSpotSearchText === "function") {
    const baseGetSpotSearchText = getSpotSearchText;
    getSpotSearchText = function fixedSelectionSearchText(spot) {
      const base = baseGetSpotSearchText(spot);
      const selections = (spot.fixedSelections || [])
        .flatMap((item) => [item.name, item.officialName, item.issuer])
        .join(" ");
      return `${base}${normalizeSearchText(` 固定選定 ${selections}`)}`;
    };
  }

  if (typeof renderEnhancedSpotDetails === "function") {
    const baseRenderEnhancedSpotDetails = renderEnhancedSpotDetails;
    renderEnhancedSpotDetails = function fixedSelectionRenderDetails(spot) {
      baseRenderEnhancedSpotDetails(spot);
      if (!spot || !isFixedSelectionSpot(spot)) return;

      const tagContainer = document.getElementById("spotTags");
      if (!tagContainer) return;

      const bySelection = new Map();
      for (const item of spot.fixedSelections) {
        if (!bySelection.has(item.id)) bySelection.set(item.id, []);
        bySelection.get(item.id).push(item);
      }

      for (const [, items] of bySelection) {
        const first = items[0];
        addSpotTag(tagContainer, `${first.rarity || "SR"} ${first.name}`, "accent");
        const names = [...new Set(items.map((item) => item.officialName).filter(Boolean))];
        if (names.length && !(names.length === 1 && names[0] === spot.name)) {
          addSpotTag(tagContainer, `選定名: ${names.join("・")}`);
        }
      }
    };
  }
}
