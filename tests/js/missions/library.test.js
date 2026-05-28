'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function envWithFetch(fetchImpl) {
  const ctx = makeMissionsEnv(['mission_schema', 'mission_loader', 'mission_library']).ctx;
  ctx.fetch = fetchImpl;
  return ctx;
}

const MANIFEST = { schema_version: 1, missions: ['m1', 'm2'] };
const M1 = {
  schema_version: 1, id: 'm1', title: 'M1', type: 'mission', difficulty_tier: 'beginner',
  field: { robot_start: { x: 0, y: 0, heading: 0 }, zones: [], obstacles: [] },
  steps: [{ id: 'a', title: 'a', points: 1, condition: { kind: 'contact', obstacle: '__never__' } }],
  scoring: { kind: 'step_sum' },
};
const M2 = { ...M1, id: 'm2', title: 'M2' };

function jsonResponse(obj) {
  return { ok: true, json: async () => obj };
}

test('library: fetchManifest pulls and parses missions/manifest.json', async () => {
  const ctx = envWithFetch(async (url) => {
    assert.strictEqual(url, 'missions/manifest.json');
    return jsonResponse(MANIFEST);
  });
  const m = await ctx.MISSIONS.library.fetchManifest();
  assert.deepStrictEqual(m.missions, ['m1', 'm2']);
});

test('library: fetchMission fetches and validates a single mission', async () => {
  // Patch: M1's step condition referenced an obstacle that doesn't exist,
  // which the validator would catch. Use a self-consistent mission instead.
  const ok = JSON.parse(JSON.stringify(M1));
  ok.steps[0].condition = { kind: 'zone', subject: 'robot', zone: '__never__' };
  ok.field.zones = [{ id: '__never__', shape: 'rect', x: -1, y: -1, w: 1, h: 1, color: 'red' }];
  const ctx = envWithFetch(async (url) => {
    assert.strictEqual(url, 'missions/m1/mission.json');
    return jsonResponse(ok);
  });
  const mission = await ctx.MISSIONS.library.fetchMission('m1');
  assert.strictEqual(mission.id, 'm1');
});

test('library: loadAllBundled returns array of validated missions in manifest order', async () => {
  const fetches = {};
  fetches['missions/manifest.json'] = jsonResponse(MANIFEST);
  const okM1 = JSON.parse(JSON.stringify(M1));
  okM1.steps[0].condition = { kind: 'zone', subject: 'robot', zone: 'z' };
  okM1.field.zones = [{ id: 'z', shape: 'rect', x: -1, y: -1, w: 1, h: 1, color: 'red' }];
  const okM2 = { ...okM1, id: 'm2', title: 'M2' };
  fetches['missions/m1/mission.json'] = jsonResponse(okM1);
  fetches['missions/m2/mission.json'] = jsonResponse(okM2);

  const ctx = envWithFetch(async (url) => fetches[url]);
  const all = await ctx.MISSIONS.library.loadAllBundled();
  assert.deepStrictEqual(all.map(m => m.id), ['m1', 'm2']);
});

test('library: fetchManifest rejects on non-OK response', async () => {
  const ctx = envWithFetch(async () => ({ ok: false, status: 404 }));
  await assert.rejects(
    () => ctx.MISSIONS.library.fetchManifest(),
    /manifest/i);
});

// ─── localStorage helpers (Chunk C TDD redo) ────────────────────────────────

function makeStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key(i) { return Array.from(map.keys())[i] ?? null; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    _raw: map,
  };
}

function envNoFetch() {
  return makeMissionsEnv(['mission_schema', 'mission_loader', 'mission_library']).ctx;
}

const SAMPLE_MISSION = {
  schema_version: 1, id: 'u1', title: 'Test', type: 'mission', difficulty_tier: 'beginner',
  field: { robot_start: { x: 350, y: 163, heading: 90 }, zones: [], obstacles: [] },
  steps: [],
  scoring: { kind: 'step_sum' },
};

test('storage: saveUserMission writes under "fll-vr-mission/user/<id>" with expected payload shape', () => {
  const ctx = envNoFetch();
  const storage = makeStorage();
  ctx.MISSIONS.library.saveUserMission(storage, SAMPLE_MISSION, 'data:image/png;base64,abc');
  const key = 'fll-vr-mission/user/u1';
  assert.ok(storage._raw.has(key), `expected key "${key}" in storage`);
  const payload = JSON.parse(storage.getItem(key));
  assert.deepStrictEqual(payload.mission, SAMPLE_MISSION);
  assert.strictEqual(payload.screenshot, 'data:image/png;base64,abc');
  assert.strictEqual(typeof payload.savedAtMs, 'number');
});

test('storage: saveUserMission with null screenshot stores screenshot: null', () => {
  const ctx = envNoFetch();
  const storage = makeStorage();
  ctx.MISSIONS.library.saveUserMission(storage, SAMPLE_MISSION, null);
  const payload = JSON.parse(storage.getItem('fll-vr-mission/user/u1'));
  assert.strictEqual(payload.screenshot, null);
});

test('storage: readUserMissions returns empty array on empty storage', () => {
  const ctx = envNoFetch();
  const storage = makeStorage();
  const result = ctx.MISSIONS.library.readUserMissions(storage);
  assert.deepStrictEqual(result, []);
});

test('storage: readUserMissions returns all saved user missions and ignores imported/unrelated keys', () => {
  const ctx = envNoFetch();
  const storage = makeStorage();
  const m2 = { ...SAMPLE_MISSION, id: 'u2' };
  ctx.MISSIONS.library.saveUserMission(storage, SAMPLE_MISSION, null);
  ctx.MISSIONS.library.saveUserMission(storage, m2, null);
  // Add an imported and an unrelated key
  storage.setItem('fll-vr-mission/imported/x1', JSON.stringify({ mission: { id: 'x1' }, screenshot: null, savedAtMs: 1 }));
  storage.setItem('some-other-key', 'irrelevant');
  const result = ctx.MISSIONS.library.readUserMissions(storage);
  assert.strictEqual(result.length, 2);
  const ids = result.map(r => r.mission.id).sort();
  assert.deepStrictEqual(ids, ['u1', 'u2']);
});

test('storage: readUserMissions skips corrupt JSON entries instead of throwing', () => {
  const ctx = envNoFetch();
  const storage = makeStorage();
  ctx.MISSIONS.library.saveUserMission(storage, SAMPLE_MISSION, null);
  // Inject a corrupt entry with the user prefix
  storage.setItem('fll-vr-mission/user/corrupt', 'not-valid-json{{{');
  assert.doesNotThrow(() => {
    const result = ctx.MISSIONS.library.readUserMissions(storage);
    assert.strictEqual(result.length, 1, 'corrupt entry should be skipped');
  });
});

test('storage: deleteUserMission removes only the named id', () => {
  const ctx = envNoFetch();
  const storage = makeStorage();
  const m2 = { ...SAMPLE_MISSION, id: 'u2' };
  ctx.MISSIONS.library.saveUserMission(storage, SAMPLE_MISSION, null);
  ctx.MISSIONS.library.saveUserMission(storage, m2, null);
  ctx.MISSIONS.library.deleteUserMission(storage, 'u1');
  const result = ctx.MISSIONS.library.readUserMissions(storage);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].mission.id, 'u2');
});

test('storage: saving the same user mission id twice overwrites the prior entry', () => {
  const ctx = envNoFetch();
  const storage = makeStorage();
  ctx.MISSIONS.library.saveUserMission(storage, SAMPLE_MISSION, 'old-screenshot');
  ctx.MISSIONS.library.saveUserMission(storage, SAMPLE_MISSION, 'new-screenshot');
  const result = ctx.MISSIONS.library.readUserMissions(storage);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].screenshot, 'new-screenshot');
});

// ─── Imported mission helpers (mirror of user helpers) ──────────────────────

test('storage: saveImportedMission writes under "fll-vr-mission/imported/<id>" with expected payload shape', () => {
  const ctx = envNoFetch();
  const storage = makeStorage();
  ctx.MISSIONS.library.saveImportedMission(storage, SAMPLE_MISSION, 'data:image/png;base64,xyz');
  const key = 'fll-vr-mission/imported/u1';
  assert.ok(storage._raw.has(key), `expected key "${key}" in storage`);
  const payload = JSON.parse(storage.getItem(key));
  assert.deepStrictEqual(payload.mission, SAMPLE_MISSION);
  assert.strictEqual(payload.screenshot, 'data:image/png;base64,xyz');
  assert.strictEqual(typeof payload.savedAtMs, 'number');
});

test('storage: saveImportedMission with null screenshot stores screenshot: null', () => {
  const ctx = envNoFetch();
  const storage = makeStorage();
  ctx.MISSIONS.library.saveImportedMission(storage, SAMPLE_MISSION, null);
  const payload = JSON.parse(storage.getItem('fll-vr-mission/imported/u1'));
  assert.strictEqual(payload.screenshot, null);
});

test('storage: readImportedMissions returns empty array on empty storage', () => {
  const ctx = envNoFetch();
  const storage = makeStorage();
  const result = ctx.MISSIONS.library.readImportedMissions(storage);
  assert.deepStrictEqual(result, []);
});

test('storage: readImportedMissions returns all saved imported missions and ignores user/unrelated keys', () => {
  const ctx = envNoFetch();
  const storage = makeStorage();
  const m2 = { ...SAMPLE_MISSION, id: 'i2' };
  const im1 = { ...SAMPLE_MISSION, id: 'i1' };
  ctx.MISSIONS.library.saveImportedMission(storage, im1, null);
  ctx.MISSIONS.library.saveImportedMission(storage, m2, null);
  ctx.MISSIONS.library.saveUserMission(storage, SAMPLE_MISSION, null); // user key — must not appear
  storage.setItem('random-key', 'data');
  const result = ctx.MISSIONS.library.readImportedMissions(storage);
  assert.strictEqual(result.length, 2);
  const ids = result.map(r => r.mission.id).sort();
  assert.deepStrictEqual(ids, ['i1', 'i2']);
});

test('storage: readImportedMissions skips corrupt JSON entries instead of throwing', () => {
  const ctx = envNoFetch();
  const storage = makeStorage();
  ctx.MISSIONS.library.saveImportedMission(storage, SAMPLE_MISSION, null);
  storage.setItem('fll-vr-mission/imported/corrupt', '{bad json');
  assert.doesNotThrow(() => {
    const result = ctx.MISSIONS.library.readImportedMissions(storage);
    assert.strictEqual(result.length, 1, 'corrupt entry should be skipped');
  });
});

test('storage: deleteImportedMission removes only the named id', () => {
  const ctx = envNoFetch();
  const storage = makeStorage();
  const im2 = { ...SAMPLE_MISSION, id: 'i2' };
  const im1 = { ...SAMPLE_MISSION, id: 'i1' };
  ctx.MISSIONS.library.saveImportedMission(storage, im1, null);
  ctx.MISSIONS.library.saveImportedMission(storage, im2, null);
  ctx.MISSIONS.library.deleteImportedMission(storage, 'i1');
  const result = ctx.MISSIONS.library.readImportedMissions(storage);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].mission.id, 'i2');
});

test('storage: saving the same imported mission id twice overwrites the prior entry', () => {
  const ctx = envNoFetch();
  const storage = makeStorage();
  const im1 = { ...SAMPLE_MISSION, id: 'i1' };
  ctx.MISSIONS.library.saveImportedMission(storage, im1, 'screenshot-v1');
  ctx.MISSIONS.library.saveImportedMission(storage, im1, 'screenshot-v2');
  const result = ctx.MISSIONS.library.readImportedMissions(storage);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].screenshot, 'screenshot-v2');
});
