(() => {
  "use strict";
  const LABELS = { onsen: "温泉", castle: "城", scenic: "名勝" };
  const PAGE_SIZE = 50;
  const selected = new Set();
  let busy = false, limit = PAGE_SIZE, owner = null, mounted = false;
  const node = id => document.getElementById(id);
  const profile = () => window.OnsenUserStorage?.getCurrentProfileId?.() ?? null;
  const adapters = () => ({ legacy: window.OnsenVisitCandidates, domain: window.OnsenTravelDomainRecoveryV731 });
  function day(at) {
    const d = new Date(Number(at));
    if (!Number.isFinite(d.getTime()) || at == null) return "unknown";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function list() {
    return Object.entries(adapters()).flatMap(([store, api]) => (api?.pending?.() || []).map(c => ({
      ...c, store, key: JSON.stringify([store, c.id]), entityType: c.entityType || "onsen",
      onsite: ["verified_range", "photo_verified_range"].includes(c.strength), day: day(c.detectedAt)
    }))).filter(c => LABELS[c.entityType]).sort((a, b) => Number(b.detectedAt || 0) - Number(a.detectedAt || 0) || a.key.localeCompare(b.key));
  }
  function scoped() {
    const date = node("settlementDay")?.value || "all", domain = node("settlementDomain")?.value || "all";
    return list().filter(c => (date === "all" || date === c.day) && (domain === "all" || domain === c.entityType));
  }
  function resetOwner() {
    if (owner === profile()) return;
    owner = profile(); selected.clear(); limit = PAGE_SIZE;
    const status = node("settlementStatus"); if (status) status.textContent = "";
  }
  function syncControls() {
    const count = selected.size;
    const button = node("settlementConfirm");
    if (button) { button.textContent = busy ? "記録しています…" : `選んだ${count}件を記録`; button.disabled = busy || !count; }
    const countNode = node("settlementSelection"); if (countNode) countNode.textContent = `${count}件を選択中`;
    for (const input of node("tripSettlement")?.querySelectorAll("input, select, button") || []) {
      if (input.id !== "settlementConfirm") input.disabled = busy;
    }
  }
  function text(tag, value, className) {
    const el = document.createElement(tag); el.textContent = value; if (className) el.className = className; return el;
  }
  function render() {
    if (!mounted) return;
    resetOwner();
    const all = list(), available = new Set(all.map(c => c.key));
    for (const key of selected) if (!available.has(key)) selected.delete(key);
    const dateSelect = node("settlementDay"), previous = dateSelect.value || "all";
    dateSelect.replaceChildren();
    for (const value of ["all", ...new Set(all.map(c => c.day))]) {
      const option = text("option", value === "all" ? "すべての日" : value === "unknown" ? "日付不明" : value);
      option.value = value; dateSelect.appendChild(option);
    }
    dateSelect.value = [...dateSelect.options].some(o => o.value === previous) ? previous : "all";
    const rows = scoped(), shown = rows.slice(0, limit), root = node("settlementList"); root.replaceChildren();
    node("settlementSummary").textContent = rows.length ? `${rows.length}件の候補。訪れた場所を選んで記録できます。` : "未確認の候補はありません。旅の記録や写真から候補が見つかると、ここにまとまります。";
    for (const c of shown) {
      const row = document.createElement("article"); row.className = "settlement-row";
      const label = document.createElement("label"), checkbox = document.createElement("input"); checkbox.type = "checkbox";
      checkbox.checked = selected.has(c.key); checkbox.dataset.key = c.key; checkbox.setAttribute("aria-label", `${LABELS[c.entityType]} ${c.name || "名称不明"}を選択`);
      checkbox.addEventListener("change", () => { if (owner !== profile()) { render(); return; } checkbox.checked ? selected.add(c.key) : selected.delete(c.key); syncControls(); });
      label.append(checkbox, text("strong", `${LABELS[c.entityType]}　${c.name || "名称不明"}`)); row.appendChild(label);
      const source = String(c.source || "").startsWith("photo") ? "写真" : "GPS";
      const at = c.day === "unknown" ? "日時不明" : new Date(Number(c.detectedAt)).toLocaleString("ja-JP");
      row.appendChild(text("p", `${at}　${c.prefecture || ""}`, "settlement-meta"));
      row.appendChild(text("p", `${source}・${c.onsite ? "範囲内／現地確認として記録" : "付近／訪問記録として保存"}`, "settlement-evidence"));
      if (c.remainingM != null && Number.isFinite(Number(c.remainingM)) && Number(c.remainingM) > 0) row.appendChild(text("p", `取得範囲まで約${Math.round(Number(c.remainingM))}m。実際に訪れたか確認してください。`, "settlement-meta"));
      const actions = document.createElement("div"); actions.className = "settlement-row-actions";
      const map = text("button", "地図で確認"); map.type = "button";
      map.addEventListener("click", () => window.OnsenMapDomainV73?.open?.(c.entityType, c.entityId || c.spotId, { source: "trip-settlement" }));
      const dismiss = text("button", "候補から除外"); dismiss.type = "button";
      dismiss.addEventListener("click", () => {
        if (owner !== profile()) { render(); return; }
        try { adapters()[c.store]?.dismiss?.(c.id); selected.delete(c.key); node("settlementStatus").textContent = `${c.name || "候補"}を除外しました。`; }
        catch { node("settlementStatus").textContent = "除外を保存できませんでした。候補を残しています。"; }
        render();
      });
      actions.append(map, dismiss); row.appendChild(actions); root.appendChild(row);
    }
    node("settlementMore").hidden = rows.length <= limit;
    node("settlementMore").textContent = `さらに表示（残り${Math.max(0, rows.length - shown.length)}件）`;
    syncControls();
  }
  async function settle(keys) {
    if (busy) return null;
    const expected = owner;
    if (expected !== profile()) { resetOwner(); render(); return { cancelled: true }; }
    busy = true; syncControls();
    const result = { confirmed: [], failed: [], skipped: [], cancelled: false };
    try {
      for (const key of new Set(keys)) {
        if (profile() !== expected) { result.cancelled = true; break; }
        const candidate = list().find(c => c.key === key);
        if (!candidate) { result.skipped.push(key); selected.delete(key); continue; }
        try {
          const api = adapters()[candidate.store];
          if (!api?.confirm || api.confirm(candidate.id, { refresh: false }) !== true) throw new Error("save_failed");
          result.confirmed.push(key); selected.delete(key);
        } catch { result.failed.push(key); }
        // Give the UI and profile changes a chance to run between records.
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (profile() !== expected) result.cancelled = true;
      if (!result.cancelled) {
        try { adapters().legacy?.refresh?.(); adapters().domain?.refreshAll?.(); } catch { /* Saved visits stay saved even if a view fails. */ }
        const status = node("settlementStatus");
        if (status) status.textContent = `${result.confirmed.length}件を記録しました。${result.failed.length ? ` ${result.failed.length}件は保存できませんでした。未処理の候補を確認して再試行してください。` : ""}${result.skipped.length ? ` ${result.skipped.length}件は処理済みです。` : ""}`;
      }
    } finally { busy = false; resetOwner(); render(); }
    return result;
  }
  function install() {
    const shell = document.querySelector("#tripView .trip-shell");
    if (!shell || !adapters().legacy || !adapters().domain || !window.OnsenUserStorage) return false;
    const section = document.createElement("section"); section.id = "tripSettlement"; section.setAttribute("aria-labelledby", "settlementTitle");
    section.innerHTML = `<h3 id="settlementTitle">旅をまとめて記録</h3>
      <p id="settlementSummary"></p>
      <div class="settlement-filters"><label>訪問日<select id="settlementDay"></select></label><label>種類<select id="settlementDomain"><option value="all">すべて</option><option value="onsen">温泉</option><option value="castle">城</option><option value="scenic">名勝</option></select></label></div>
      <p class="settlement-meta">付近の候補も含まれます。選択は最初は空です。実際に訪れた場所だけを選んでください。</p>
      <div class="settlement-actions"><button type="button" id="settlementSelect">表示中をすべて選ぶ</button><button type="button" id="settlementClear">選択を解除</button><span id="settlementSelection"></span></div>
      <div id="settlementList"></div><button type="button" id="settlementMore">さらに表示</button>
      <div class="settlement-footer"><button type="button" id="settlementConfirm" disabled>選んだ0件を記録</button><p id="settlementStatus" role="status" aria-live="polite"></p></div>`;
    shell.querySelector(".trip-metrics")?.insertAdjacentElement("afterend", section) || shell.appendChild(section);
    mounted = true; owner = profile();
    for (const id of ["settlementDay", "settlementDomain"]) node(id).addEventListener("change", () => { selected.clear(); limit = PAGE_SIZE; render(); });
    node("settlementSelect").addEventListener("click", () => { scoped().slice(0, limit).forEach(c => selected.add(c.key)); render(); });
    node("settlementClear").addEventListener("click", () => { selected.clear(); render(); });
    node("settlementMore").addEventListener("click", () => { limit += PAGE_SIZE; render(); });
    node("settlementConfirm").addEventListener("click", () => { settle([...selected]); });
    for (const name of ["onsen-trip-recovery-input-changed", "onsen-app-tab-changed", "onsen-castle-visit-changed", "onsen-scenic-visit-changed", "onsen-location-sample", "storage"]) window.addEventListener(name, () => { setTimeout(() => { if (!busy) render(); }, 0); });
    const old = node("tripCandidateList")?.closest(".trip-card");
    if (old) { const note = text("p", "候補は上の「旅をまとめて記録」で一緒に確認できます。", "settlement-meta"); old.prepend(note); }
    render(); return true;
  }
  window.OnsenTripSettlement = { list, settle, refresh: render, diagnostics: () => ({ mounted, busy, selected: selected.size }) };
  const timer = setInterval(() => { if (mounted) { if (owner !== profile()) render(); return; } install(); }, 500);
  window.addEventListener("pagehide", () => clearInterval(timer), { once: true });
})();
