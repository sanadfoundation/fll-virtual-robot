'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  if (!MISSIONS.loader) throw new Error('mission_library requires mission_loader');

  async function fetchManifest() {
    const res = await global.fetch('missions/manifest.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`mission library: failed to load manifest (HTTP ${res.status})`);
    return await res.json();
  }

  async function fetchMission(id) {
    const res = await global.fetch(`missions/${id}/mission.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`mission library: failed to load mission "${id}" (HTTP ${res.status})`);
    const raw = await res.json();
    return MISSIONS.loader.load(raw);
  }

  async function loadAllBundled() {
    const manifest = await fetchManifest();
    const out = [];
    for (const id of manifest.missions) {
      out.push(await fetchMission(id));
    }
    return out;
  }

  // localStorage keys for user-authored and imported missions.
  const USER_PREFIX     = 'fll-vr-mission/user/';
  const IMPORTED_PREFIX = 'fll-vr-mission/imported/';

  function _saveTo(storage, prefix, id, payload) {
    if (!storage || typeof storage.setItem !== 'function') return;
    storage.setItem(prefix + id, JSON.stringify(payload));
  }

  function _readAllFrom(storage, prefix) {
    if (!storage) return [];
    const out = [];
    const len = typeof storage.length === 'number' ? storage.length : 0;
    const collected = [];
    for (let i = 0; i < len; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(prefix)) collected.push(k);
    }
    for (const k of collected) {
      try {
        const raw = storage.getItem(k);
        if (!raw) continue;
        out.push(JSON.parse(raw));
      } catch (_e) { /* skip corrupt entries */ }
    }
    return out;
  }

  function saveUserMission(storage, mission, screenshotDataUrl) {
    _saveTo(storage, USER_PREFIX, mission.id, {
      mission,
      screenshot: screenshotDataUrl !== undefined ? screenshotDataUrl : null,
      savedAtMs:  Date.now(),
    });
  }

  function deleteUserMission(storage, id) {
    if (storage && typeof storage.removeItem === 'function') storage.removeItem(USER_PREFIX + id);
  }

  function readUserMissions(storage) {
    return _readAllFrom(storage, USER_PREFIX);
  }

  function saveImportedMission(storage, mission, screenshotDataUrl) {
    _saveTo(storage, IMPORTED_PREFIX, mission.id, {
      mission,
      screenshot: screenshotDataUrl !== undefined ? screenshotDataUrl : null,
      savedAtMs:  Date.now(),
    });
  }

  function deleteImportedMission(storage, id) {
    if (storage && typeof storage.removeItem === 'function') storage.removeItem(IMPORTED_PREFIX + id);
  }

  function readImportedMissions(storage) {
    return _readAllFrom(storage, IMPORTED_PREFIX);
  }

  MISSIONS.library = {
    fetchManifest, fetchMission, loadAllBundled,
    saveUserMission, deleteUserMission, readUserMissions,
    saveImportedMission, deleteImportedMission, readImportedMissions,
    USER_PREFIX, IMPORTED_PREFIX,
  };
})(typeof window !== 'undefined' ? window : globalThis);
