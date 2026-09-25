(() => {
  const PROFILE_LIST_KEY = "onsenAppProfilesV1";
  const CURRENT_PROFILE_KEY = "onsenAppCurrentProfileV1";
  const MIGRATION_KEY = "onsenAppProfileMigrationV1";
  const PREFIX = "onsenApp:user:";
  const SAVE_SCHEMA_VERSION = 6;
  const USER_KEYS = new Set([
    "checkins",
    "visitCandidatesV1",
    "visitSessionsV1",
    "visitSettingsV1",
    "visitLogMigrationV1",
    "visitLocationSamplesV1",
    "achievementStateV1",
    "uiProgressStateV1",
    "gameStateV1",
    "characterStateV1",
    "castleVisitsV1",
    "scenicVisitStateV1",
    "progressionStateV1",
    "visitDomainCandidatesV728"
  ]);

  const storageProto = Storage.prototype;
  const rawGetItem = storageProto.getItem;
  const rawSetItem = storageProto.setItem;
  const rawRemoveItem = storageProto.removeItem;

  const rawGet = (key) => rawGetItem.call(localStorage, key);
  const rawSet = (key, value) => rawSetItem.call(localStorage, key, String(value));

  function safeParse(value, fallback) {
    try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
  }

  function makeId() {
    if (globalThis.crypto?.randomUUID) return `local-${globalThis.crypto.randomUUID()}`;
    return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function loadProfilesRaw() {
    const list = safeParse(rawGet(PROFILE_LIST_KEY), []);
    return Array.isArray(list) ? list : [];
  }

  function saveProfilesRaw(list) {
    rawSet(PROFILE_LIST_KEY, JSON.stringify(list));
  }

  function ensureProfileState() {
    let profiles = loadProfilesRaw();
    let currentId = rawGet(CURRENT_PROFILE_KEY);

    if (!profiles.length) {
      const id = makeId();
      profiles = [{
        id,
        name: "ユーザー1",
        kind: "local",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        saveSchemaVersion: SAVE_SCHEMA_VERSION
      }];
      saveProfilesRaw(profiles);
      currentId = id;
      rawSet(CURRENT_PROFILE_KEY, id);
    }

    if (!profiles.some((profile) => profile.id === currentId)) {
      currentId = profiles[0].id;
      rawSet(CURRENT_PROFILE_KEY, currentId);
    }

    return { profiles, currentId };
  }

  let state = ensureProfileState();

  function scopedKey(key, profileId = state.currentId) {
    return `${PREFIX}${profileId}:${key}`;
  }

  function isUserKey(key) {
    return USER_KEYS.has(String(key));
  }

  function migrateLegacyData() {
    const migration = safeParse(rawGet(MIGRATION_KEY), null);
    if (migration?.status === "done") return;

    const profileId = state.currentId;
    const migrated = [];
    for (const key of USER_KEYS) {
      const legacy = rawGet(key);
      const targetKey = scopedKey(key, profileId);
      if (legacy !== null && rawGet(targetKey) === null) {
        rawSet(targetKey, legacy);
        migrated.push(key);
      }
    }
    rawSet(MIGRATION_KEY, JSON.stringify({
      status: "done",
      migratedAt: Date.now(),
      profileId,
      migratedKeys: migrated,
      note: "旧キーは安全のため残置。アプリ本体はユーザー名前空間を参照する。"
    }));
  }

  migrateLegacyData();

  // Keys added after the original migration also belong to the first profile.
  for (const key of ["gameStateV1", "characterStateV1", "castleVisitsV1",
    "scenicVisitStateV1", "progressionStateV1", "visitDomainCandidatesV728"]) {
    const legacy = rawGet(key);
    const firstId = state.profiles[0]?.id;
    if (legacy !== null && firstId && rawGet(scopedKey(key, firstId)) === null) {
      rawSet(scopedKey(key, firstId), legacy);
    }
  }

  storageProto.getItem = function patchedGetItem(key) {
    if (this === localStorage && isUserKey(key)) return rawGetItem.call(this, scopedKey(String(key)));
    return rawGetItem.call(this, key);
  };
  storageProto.setItem = function patchedSetItem(key, value) {
    if (this === localStorage && isUserKey(key)) {
      const result = rawSetItem.call(this, scopedKey(String(key)), value);
      touchCurrentProfile();
      return result;
    }
    return rawSetItem.call(this, key, value);
  };
  storageProto.removeItem = function patchedRemoveItem(key) {
    if (this === localStorage && isUserKey(key)) return rawRemoveItem.call(this, scopedKey(String(key)));
    return rawRemoveItem.call(this, key);
  };

  function touchCurrentProfile() {
    const profiles = loadProfilesRaw();
    const profile = profiles.find((item) => item.id === state.currentId);
    if (!profile) return;
    profile.updatedAt = Date.now();
    profile.saveSchemaVersion = SAVE_SCHEMA_VERSION;
    saveProfilesRaw(profiles);
    state.profiles = profiles;
  }

  function listProfiles() {
    state.profiles = loadProfilesRaw();
    return state.profiles.map((profile) => ({ ...profile }));
  }

  function currentProfile() {
    return listProfiles().find((profile) => profile.id === state.currentId) || null;
  }

  function createProfile(name) {
    const profiles = loadProfilesRaw();
    const id = makeId();
    const cleanName = String(name || "").trim() || `ユーザー${profiles.length + 1}`;
    profiles.push({
      id,
      name: cleanName.slice(0, 40),
      kind: "local",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      saveSchemaVersion: SAVE_SCHEMA_VERSION
    });
    saveProfilesRaw(profiles);
    return id;
  }

  function renameProfile(profileId, name) {
    const profiles = loadProfilesRaw();
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) return false;
    const cleanName = String(name || "").trim();
    if (!cleanName) return false;
    profile.name = cleanName.slice(0, 40);
    profile.updatedAt = Date.now();
    saveProfilesRaw(profiles);
    state.profiles = profiles;
    refreshProfileUi();
    return true;
  }

  function switchProfile(profileId, reload = true) {
    const profiles = loadProfilesRaw();
    if (!profiles.some((profile) => profile.id === profileId)) return false;
    rawSet(CURRENT_PROFILE_KEY, profileId);
    state.currentId = profileId;
    state.profiles = profiles;
    if (reload) location.reload();
    return true;
  }

  function exportCurrentUserData() {
    const profile = currentProfile();
    const data = {};
    for (const key of USER_KEYS) {
      const value = rawGet(scopedKey(key));
      if (value !== null) data[key] = safeParse(value, value);
    }
    return {
      format: "onsen-checkin-user-save",
      schemaVersion: SAVE_SCHEMA_VERSION,
      exportedAt: Date.now(),
      user: profile,
      data
    };
  }

  function importCurrentUserData(payload) {
    if (!payload || payload.format !== "onsen-checkin-user-save" ||
        !Number.isInteger(payload.schemaVersion) || payload.schemaVersion < 1 ||
        !payload.data || typeof payload.data !== "object" || Array.isArray(payload.data)) {
      throw new Error("バックアップの形式が正しくありません。");
    }
    const unknown = Object.keys(payload.data).filter((key) => !USER_KEYS.has(key));
    if (unknown.length) throw new Error("このアプリで扱えない保存項目が含まれています。");
    const entries = [...USER_KEYS].map((key) => [key,
      Object.hasOwn(payload.data, key) ? JSON.stringify(payload.data[key]) : null]);
    if (entries.some(([, value]) => value === undefined)) {
      throw new Error("バックアップに保存できない値が含まれています。");
    }
    const before = entries.map(([key]) => [key, rawGet(scopedKey(key))]);
    try {
      for (const [key, value] of entries) {
        if (value === null) rawRemoveItem.call(localStorage, scopedKey(key));
        else rawSet(scopedKey(key), value);
      }
    } catch (error) {
      for (const [key, value] of before) {
        try {
          if (value === null) rawRemoveItem.call(localStorage, scopedKey(key));
          else rawSet(scopedKey(key), value);
        } catch {}
      }
      throw error;
    }
    touchCurrentProfile();
    return entries.filter(([, value]) => value !== null).length;
  }

  function readUserItem(key, profileId = state.currentId) {
    return rawGet(scopedKey(key, profileId));
  }

  function writeUserItem(key, value, profileId = state.currentId) {
    rawSet(scopedKey(key, profileId), value);
    if (profileId === state.currentId) touchCurrentProfile();
  }

  function installProfileUi() {
    const stats = document.querySelector(".header .stats");
    if (!stats || document.getElementById("btnProfile")) return;

    const button = document.createElement("button");
    button.id = "btnProfile";
    button.className = "profile-button";
    button.type = "button";
    button.addEventListener("click", openProfileDialog);
    stats.insertBefore(button, stats.firstChild);

    const dialog = document.createElement("dialog");
    dialog.id = "profileDialog";
    dialog.className = "profile-dialog";
    dialog.innerHTML = `
      <form method="dialog" class="profile-dialog-card">
        <div class="profile-dialog-head">
          <div><span>LOCAL SAVE</span><h2>ユーザー</h2></div>
          <button type="submit" class="profile-close" value="cancel" aria-label="閉じる">×</button>
        </div>
        <div id="profileList" class="profile-list"></div>
        <div class="profile-create-row">
          <input id="profileNewName" type="text" maxlength="40" placeholder="新しいユーザー名" />
          <button id="profileCreate" type="button">追加</button>
        </div>
        <div class="profile-backup-row">
          <button id="profileExport" type="button">このユーザーをバックアップ</button>
          <button id="profileImport" type="button">バックアップから復元</button>
          <input id="profileImportFile" type="file" accept="application/json,.json" hidden />
        </div>
        <p id="profileBackupStatus" class="profile-note" role="status" aria-live="polite"></p>
        <p class="profile-note">訪問・達成状況・旅行ログ・実績・装備称号はユーザーごとに別保存されます。現在は端末内保存です。</p>
      </form>`;
    document.body.appendChild(dialog);

    dialog.querySelector("#profileCreate")?.addEventListener("click", () => {
      const input = dialog.querySelector("#profileNewName");
      const id = createProfile(input?.value || "");
      if (input) input.value = "";
      switchProfile(id, true);
    });

    const backupStatus = (message) => { dialog.querySelector("#profileBackupStatus").textContent = message; };
    dialog.querySelector("#profileExport")?.addEventListener("click", () => {
      try {
        const data = exportCurrentUserData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `onsen-checkin-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        backupStatus("バックアップをダウンロードしました。安全な場所に保管してください。");
      } catch (error) { backupStatus(`バックアップに失敗しました: ${error.message}`); }
    });
    const importFile = dialog.querySelector("#profileImportFile");
    dialog.querySelector("#profileImport")?.addEventListener("click", () => importFile.click());
    importFile?.addEventListener("change", async () => {
      const file = importFile.files?.[0];
      importFile.value = "";
      if (!file) return;
      try {
        if (file.size > 5 * 1024 * 1024) throw new Error("5MB以下のJSONを選んでください。");
        const payload = JSON.parse(await file.text());
        if (!payload || payload.format !== "onsen-checkin-user-save") throw new Error("バックアップの形式が正しくありません。");
        const name = currentProfile()?.name || "現在のユーザー";
        if (!confirm(`${name} の保存データを、このバックアップで置き換えます。続けますか？`)) return;
        const count = importCurrentUserData(payload);
        backupStatus(`${count}項目を復元しました。画面を更新します。`);
        location.reload();
      } catch (error) { backupStatus(`復元に失敗しました: ${error.message}`); }
    });

    refreshProfileUi();
  }

  function refreshProfileUi() {
    const profile = currentProfile();
    const button = document.getElementById("btnProfile");
    if (button) button.textContent = profile?.name || "ユーザー";

    const root = document.getElementById("profileList");
    if (!root) return;
    root.innerHTML = "";
    for (const item of listProfiles()) {
      const row = document.createElement("div");
      row.className = `profile-row${item.id === state.currentId ? " active" : ""}`;
      const main = document.createElement("button");
      main.type = "button";
      main.className = "profile-select";
      main.innerHTML = `<strong>${escapeHtml(item.name)}</strong><span>${item.id === state.currentId ? "使用中" : "切り替え"}</span>`;
      main.addEventListener("click", () => {
        if (item.id !== state.currentId) switchProfile(item.id, true);
      });
      const rename = document.createElement("button");
      rename.type = "button";
      rename.className = "profile-rename";
      rename.textContent = "名前変更";
      rename.addEventListener("click", () => {
        const next = prompt("ユーザー名", item.name);
        if (next) renameProfile(item.id, next);
      });
      row.append(main, rename);
      root.appendChild(row);
    }
  }

  function openProfileDialog() {
    refreshProfileUi();
    const dialog = document.getElementById("profileDialog");
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'\"]/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[char]));
  }

  window.OnsenUserStorage = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    userKeys: [...USER_KEYS],
    getCurrentProfileId: () => state.currentId,
    getCurrentProfile: currentProfile,
    listProfiles,
    createProfile,
    renameProfile,
    switchProfile,
    exportCurrentUserData,
    importCurrentUserData,
    readUserItem,
    writeUserItem,
    getScopedKey: scopedKey
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installProfileUi, { once: true });
  else installProfileUi();
})();
