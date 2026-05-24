'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  if (!MISSIONS.loader) throw new Error('mission_library requires mission_loader');

  async function fetchManifest() {
    const res = await global.fetch('missions/manifest.json');
    if (!res.ok) throw new Error(`mission library: failed to load manifest (HTTP ${res.status})`);
    return await res.json();
  }

  async function fetchMission(id) {
    const res = await global.fetch(`missions/${id}/mission.json`);
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

  MISSIONS.library = { fetchManifest, fetchMission, loadAllBundled };
})(typeof window !== 'undefined' ? window : globalThis);
