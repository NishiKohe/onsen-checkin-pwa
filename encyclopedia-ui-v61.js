(() => {
  const BUILD = "v61";
  const FISH_URL = "./data/fish-catalog-v61.json";
  let mount = null;
  let fishCatalog = [];
  let activeTab = "characters";
  let query = "";
  let statusFilter = "all";

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'\"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char]));
  }
  function initialFor(name) { return String(name || "?").trim().slice(0, 1) || "?"; }

  async function waitForRuntime() {
    for (let i = 0; i < 300; i += 1) {
      if (window.OnsenCharacterRuntime && window.OnsenGameRuntime) return true;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw new Error("encyclopedia runtimes not ready");
  }
  async function loadFishCatalog() {
    const response = await fetch(FISH_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`fish catalog load failed: ${response.status}`);
    const data = await response.json();
    fishCatalog = Array.isArray(data?.entries) ? data.entries : [];
  }

  function renderShell() {
    if (!mount) return;
    mount.innerHTML = `
      <section class="encyclopedia-shell" data-build="${BUILD}">
        <div class="encyclopedia-head">
          <div><span>TRAVEL ENCYCLOPEDIA</span><h3>旅図鑑</h3><p>旅で出会った人物と魚を記録します。</p></div>
          <div class="encyclopedia-total"><b id="encyclopediaTotal">0/0</b><small id="encyclopediaTotalLabel">収集</small></div>
        </div>
        <div class="encyclopedia-tabs" role="tablist">
          <button type="button" data-encyclopedia-tab="characters" class="active">人物図鑑</button>
          <button type="button" data-encyclopedia-tab="fish">魚図鑑</button>
        </div>
        <div class="encyclopedia-toolbar">
          <input id="encyclopediaSearch" type="search" placeholder="人物名・特性で検索" autocomplete="off" />
          <select id="encyclopediaStatus" aria-label="図鑑状態">
            <option value="all">すべて</option>
            <option value="owned">獲得済</option>
            <option value="candidate">候補/発見済</option>
            <option value="locked">未発見</option>
          </select>
        </div>
        <div id="encyclopediaRecruit"></div>
        <div id="encyclopediaResult" class="recruit-result" hidden></div>
        <div id="encyclopediaGrid" class="encyclopedia-grid"></div>
      </section>
      <div id="encyclopediaRecruitFx" class="encyclopedia-recruit-cinematic" hidden>
        <div class="recruit-cinematic-card">
          <span id="recruitFxLabel">NEW RECRUIT</span>
          <strong id="recruitFxName">人物</strong>
          <b id="recruitFxTitle"></b>
          <button id="recruitFxClose" type="button">図鑑を見る</button>
        </div>
      </div>`;

    mount.addEventListener("click", (event) => {
      const tab = event.target instanceof Element ? event.target.closest("[data-encyclopedia-tab]") : null;
      if (tab) {
        activeTab = tab.dataset.encyclopediaTab || "characters";
        for (const button of mount.querySelectorAll("[data-encyclopedia-tab]")) button.classList.toggle("active", button === tab);
        query = "";
        const search = mount.querySelector("#encyclopediaSearch");
        if (search) search.value = "";
        render();
        if (activeTab === "characters") window.OnsenCharacterRuntime?.markSeen?.();
        return;
      }
      const recruit = event.target instanceof Element ? event.target.closest("#encyclopediaRecruitButton") : null;
      if (recruit) performRecruit();
    });

    mount.querySelector("#encyclopediaSearch")?.addEventListener("input", (event) => {
      query = String(event.target.value || "").trim().toLowerCase();
      renderGrid();
    });
    mount.querySelector("#encyclopediaStatus")?.addEventListener("change", (event) => {
      statusFilter = event.target.value || "all";
      renderGrid();
    });
    mount.querySelector("#recruitFxClose")?.addEventListener("click", () => {
      const fx = mount.querySelector("#encyclopediaRecruitFx");
      if (fx) fx.hidden = true;
    });
  }

  function characterState(character) {
    const status = window.OnsenCharacterRuntime.getStatus(character.id);
    if (status?.recruitedNow) return "owned";
    if (status?.discovered || status?.candidate) return "candidate";
    return "locked";
  }

  function matchesStatus(state) {
    if (statusFilter === "all") return true;
    return state === statusFilter;
  }

  function renderCharacters() {
    const runtime = window.OnsenCharacterRuntime;
    const stats = runtime.stats();
    const state = runtime.loadState();
    const total = mount.querySelector("#encyclopediaTotal");
    const label = mount.querySelector("#encyclopediaTotalLabel");
    if (total) total.textContent = `${stats.recruited}/${stats.total}`;
    if (label) label.textContent = `登用・発見${stats.discovered}`;

    const recruitRoot = mount.querySelector("#encyclopediaRecruit");
    if (recruitRoot) {
      const yusen = Number(window.OnsenGameRuntime.loadState().wallet?.yusen || 0);
      const disabled = stats.recruitPool <= 0 || yusen < stats.cost;
      recruitRoot.innerHTML = `
        <section class="recruit-panel">
          <div><strong>湯銭登用　${stats.cost}湯銭</strong><span>候補 ${stats.recruitPool}人 ・ 所持 ${yusen}湯銭。100名城の訪問登録で候補が増えます。</span></div>
          <button id="encyclopediaRecruitButton" type="button" ${disabled ? "disabled" : ""}>登用する</button>
        </section>`;
    }

    const grid = mount.querySelector("#encyclopediaGrid");
    if (!grid) return;
    grid.innerHTML = "";
    let shown = 0;
    for (const character of runtime.catalog()) {
      const stateName = characterState(character);
      if (!matchesStatus(stateName)) continue;
      const visibleName = stateName !== "locked";
      const searchable = visibleName ? [character.name, ...(character.traits || []), ...(character.affiliations || []), character.presentation?.shortTitle || ""].join(" ").toLowerCase() : "";
      if (query && !searchable.includes(query)) continue;
      const recruited = state.recruited[character.id] || null;
      const card = document.createElement("article");
      card.className = `encyclopedia-card ${stateName === "owned" ? "recruited" : stateName}`;
      card.dataset.rarity = character.rarity || "N";
      const title = visibleName ? character.name : "？？？";
      const shortTitle = stateName === "owned" ? (character.presentation?.shortTitle || character.characterType) : (stateName === "candidate" ? "登用候補" : "未発見");
      const tags = stateName === "owned" ? (character.traits || []).slice(0, 3) : [];
      card.innerHTML = `
        <div class="encyclopedia-card-top"><div class="encyclopedia-avatar">${visibleName ? escapeHtml(initialFor(character.name)) : "?"}</div><span class="encyclopedia-rarity">${visibleName ? escapeHtml(character.rarity || "") : "???"}</span></div>
        <h4>${escapeHtml(title)}</h4>
        <p>${escapeHtml(shortTitle)}</p>
        <div class="encyclopedia-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
        <span class="encyclopedia-status">${stateName === "owned" ? `縁 ${Number(recruited?.bondRank || 0)}/5` : stateName === "candidate" ? "未登用" : "LOCKED"}</span>`;
      grid.appendChild(card);
      shown += 1;
    }
    if (!shown) grid.innerHTML = `<div class="encyclopedia-empty">条件に一致する人物はいません。</div>`;
  }

  function fishState(entry, gameState) {
    const count = Number(gameState.fishing?.collection?.[entry.id] || 0);
    return count > 0 ? "owned" : "locked";
  }

  function renderFish() {
    const game = window.OnsenGameRuntime.loadState();
    const caughtKinds = fishCatalog.filter((entry) => Number(game.fishing?.collection?.[entry.id] || 0) > 0).length;
    const total = mount.querySelector("#encyclopediaTotal");
    const label = mount.querySelector("#encyclopediaTotalLabel");
    if (total) total.textContent = `${caughtKinds}/${fishCatalog.length}`;
    if (label) label.textContent = "魚種発見";
    const recruitRoot = mount.querySelector("#encyclopediaRecruit");
    if (recruitRoot) recruitRoot.innerHTML = "";

    const grid = mount.querySelector("#encyclopediaGrid");
    if (!grid) return;
    grid.innerHTML = "";
    let shown = 0;
    for (const entry of fishCatalog) {
      const stateName = fishState(entry, game);
      const mapped = stateName === "owned" ? "owned" : "locked";
      if (statusFilter !== "all" && statusFilter !== mapped) continue;
      const count = Number(game.fishing?.collection?.[entry.id] || 0);
      const visible = count > 0;
      const searchable = visible ? [entry.name, ...(entry.habitat || []), ...(entry.regions || [])].join(" ").toLowerCase() : "";
      if (query && !searchable.includes(query)) continue;
      const best = Number(game.fishing?.bestQuality?.[entry.id] || 0);
      const card = document.createElement("article");
      card.className = `encyclopedia-card ${visible ? "recruited" : "locked"}`;
      card.dataset.rarity = entry.rarity || "N";
      card.innerHTML = `
        <div class="encyclopedia-card-top"><div class="encyclopedia-avatar">${visible ? "魚" : "?"}</div><span class="encyclopedia-rarity">${visible ? escapeHtml(entry.rarity) : "???"}</span></div>
        <h4>${visible ? escapeHtml(entry.name) : "？？？"}</h4>
        <p>${visible ? escapeHtml((entry.habitat || []).join("・")) : "未発見"}</p>
        <div class="fish-count">${visible ? `×${count}` : "—"}</div>
        <div class="fish-best">${visible ? `BEST ${best}` : "旅釣りで発見"}</div>
        <span class="encyclopedia-status">${visible ? "登録済" : "LOCKED"}</span>`;
      grid.appendChild(card);
      shown += 1;
    }
    if (!shown) grid.innerHTML = `<div class="encyclopedia-empty">条件に一致する魚はいません。</div>`;
  }

  function renderGrid() {
    const search = mount?.querySelector("#encyclopediaSearch");
    if (search) search.placeholder = activeTab === "characters" ? "人物名・特性で検索" : "魚名・生息域で検索";
    const status = mount?.querySelector("#encyclopediaStatus");
    if (status) {
      const candidate = status.querySelector('option[value="candidate"]');
      if (candidate) candidate.hidden = activeTab === "fish";
      if (activeTab === "fish" && statusFilter === "candidate") { statusFilter = "all"; status.value = "all"; }
    }
    if (activeTab === "characters") renderCharacters();
    else renderFish();
  }

  function render() { if (mount) renderGrid(); }

  function performRecruit() {
    const resultNode = mount.querySelector("#encyclopediaResult");
    const result = window.OnsenCharacterRuntime.recruitWithYusen();
    if (!result.ok) {
      if (resultNode) {
        resultNode.hidden = false;
        resultNode.textContent = result.reason === "empty_pool" ? "登用候補がいません。100名城の訪問を登録すると候補が増えます。" : result.reason === "not_enough_yusen" ? "湯銭が足りません。旅釣りなどで湯銭を集めてください。" : "登用できませんでした。";
      }
      return;
    }
    if (resultNode) {
      resultNode.hidden = false;
      resultNode.innerHTML = result.duplicate ? `<strong>${escapeHtml(result.character.name)}</strong> が再び応じた。縁ランク ${result.bondRank}/5` : `<strong>${escapeHtml(result.character.name)}</strong> を登用しました。`;
    }
    const fx = mount.querySelector("#encyclopediaRecruitFx");
    const fxLabel = mount.querySelector("#recruitFxLabel");
    const fxName = mount.querySelector("#recruitFxName");
    const fxTitle = mount.querySelector("#recruitFxTitle");
    if (fxLabel) fxLabel.textContent = result.duplicate ? "BOND UP" : "NEW RECRUIT";
    if (fxName) fxName.textContent = result.character.name;
    if (fxTitle) fxTitle.textContent = result.character.presentation?.shortTitle || result.character.rarity || "";
    if (fx) fx.hidden = false;
    renderCharacters();
    window.dispatchEvent(new Event("onsen-game-ui-refresh"));
  }

  async function install(target) {
    await waitForRuntime();
    await loadFishCatalog();
    mount = target || document.getElementById("encyclopediaMount");
    if (!mount) return false;
    renderShell();
    render();
    window.addEventListener("onsen-character-state-changed", render);
    window.addEventListener("onsen-game-state-changed", render);
    window.addEventListener("onsen-castle-visit-changed", render);
    window.OnsenEncyclopediaUI = { build: BUILD, render, showCharacters: () => { activeTab = "characters"; render(); } };
    return true;
  }

  window.OnsenEncyclopediaInstall = install;
})();