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
