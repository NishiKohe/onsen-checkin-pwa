(() => {
  const PROFILE_LIST_KEY = "onsenAppProfilesV1";
  const CURRENT_PROFILE_KEY = "onsenAppCurrentProfileV1";
  const MIGRATION_KEY = "onsenAppProfileMigrationV1";
  const PREFIX = "onsenApp:user:";
  const SAVE_SCHEMA_VERSION = 2;
  const USER_KEYS = new Set([
    "checkins",
    "visitCandidatesV1",
    "visitSessionsV1",
    "visitSettingsV1",
    "visitLogMigrationV1",
    "visitLocationSamplesV1"
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

  // 既存コードのlocalStorage APIを壊さず、ユーザーデータだけ透過的に名前空間化する。
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
        <p class="profile-note">訪問・達成状況・旅行ログはユーザーごとに別保存されます。現在は端末内保存です。</p>
      </form>`;
    document.body.appendChild(dialog);

    dialog.querySelector("#profileCreate")?.addEventListener("click", () => {
      const input = dialog.querySelector("#profileNewName");
      const id = createProfile(input?.value || "");
      if (input) input.value = "";
      switchProfile(id, true);
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
    readUserItem,
    writeUserItem,
    getScopedKey: scopedKey
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installProfileUi, { once: true });
  else installProfileUi();
})();