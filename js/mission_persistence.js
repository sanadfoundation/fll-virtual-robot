'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});

  const KEY_PREFIX = 'fll-vr-mission/run/';
  const DEFAULT_MODIFIER_HASH = 'v0';

  function keyFor(missionId, modifierHash) {
    return `${KEY_PREFIX}${missionId}/${modifierHash || DEFAULT_MODIFIER_HASH}`;
  }

  function recordRun(storage, missionId, result, opts = {}) {
    const key = keyFor(missionId, opts.modifierHash);
    const prior = readJson(storage, key);
    const now = (typeof opts.now === 'number') ? opts.now : Date.now();
    const next = {
      score:        prior && prior.score >= result.score ? prior.score : result.score,
      maxScore:     result.maxScore,
      stars:        prior && prior.stars >= result.stars ? prior.stars : result.stars,
      elapsedMs:    result.elapsedMs,
      lastPlayedMs: now,
    };
    storage.setItem(key, JSON.stringify(next));
    return next;
  }

  function getBest(storage, missionId, opts = {}) {
    return readJson(storage, keyFor(missionId, opts.modifierHash));
  }

  function readJson(storage, key) {
    const raw = storage.getItem(key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_e) { return null; }
  }

  MISSIONS.persistence = { recordRun, getBest, keyFor, KEY_PREFIX };
})(typeof window !== 'undefined' ? window : globalThis);
