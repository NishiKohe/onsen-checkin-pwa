(() => {
  function bindCollectionDetailsFix() {
    const grid = document.getElementById("collectionGrid");
    if (!grid || grid.dataset.detailsFixBound === "1") return;
    grid.dataset.detailsFixBound = "1";

    grid.addEventListener("click", (event) => {
      const summary = event.target.closest(".collection-card-summary");
      if (!summary || !grid.contains(summary)) return;
      const details = summary.closest("details.collection-card");
      if (!details) return;

      // Android PWAでnative details開閉が止まるケースを避け、明示的に制御する。
      event.preventDefault();
      details.open = !details.open;
      details.setAttribute("aria-expanded", details.open ? "true" : "false");
    }, true);

    grid.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const summary = event.target.closest(".collection-card-summary");
      if (!summary || !grid.contains(summary)) return;
      const details = summary.closest("details.collection-card");
      if (!details) return;
      event.preventDefault();
      details.open = !details.open;
      details.setAttribute("aria-expanded", details.open ? "true" : "false");
    }, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindCollectionDetailsFix, { once: true });
  } else {
    bindCollectionDetailsFix();
  }

  // collection-progress-ui.jsの初期化待ちにも対応。
  let tries = 0;
  const timer = setInterval(() => {
    bindCollectionDetailsFix();
    if (document.getElementById("collectionGrid")?.dataset.detailsFixBound === "1" || ++tries > 100) clearInterval(timer);
  }, 100);
})();
