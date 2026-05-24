'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function envWithStorage(initial = {}) {
  const ctx = makeMissionsEnv(['mission_schema', 'mission_persistence']).ctx;
  const store = new Map(Object.entries(initial));
  ctx.localStorage = {
    getItem: k => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
  };
  return { ctx, store };
}

test('recordRun: writes best-score record and reads it back', () => {
  const { ctx, store } = envWithStorage();
  ctx.MISSIONS.persistence.recordRun(ctx.localStorage, 'red-zone-then-push', {
    score: 25, maxScore: 25, stars: 3, elapsedMs: 5400,
  });
  const r = ctx.MISSIONS.persistence.getBest(ctx.localStorage, 'red-zone-then-push');
  assert.strictEqual(r.score, 25);
  assert.strictEqual(r.stars, 3);
});

test('recordRun: does NOT downgrade an existing better score', () => {
  const { ctx } = envWithStorage();
  ctx.MISSIONS.persistence.recordRun(ctx.localStorage, 'm', {
    score: 25, maxScore: 25, stars: 3, elapsedMs: 5400,
  });
  ctx.MISSIONS.persistence.recordRun(ctx.localStorage, 'm', {
    score: 10, maxScore: 25, stars: 1, elapsedMs: 7000,
  });
  const r = ctx.MISSIONS.persistence.getBest(ctx.localStorage, 'm');
  assert.strictEqual(r.score, 25);
});

test('recordRun: updates last-played timestamp even when score is worse', () => {
  const { ctx } = envWithStorage();
  ctx.MISSIONS.persistence.recordRun(ctx.localStorage, 'm', {
    score: 25, maxScore: 25, stars: 3, elapsedMs: 5400,
  }, { now: 1000 });
  const firstPlayed = ctx.MISSIONS.persistence.getBest(ctx.localStorage, 'm').lastPlayedMs;
  ctx.MISSIONS.persistence.recordRun(ctx.localStorage, 'm', {
    score: 10, maxScore: 25, stars: 1, elapsedMs: 7000,
  }, { now: 2000 });
  const second = ctx.MISSIONS.persistence.getBest(ctx.localStorage, 'm');
  assert.notStrictEqual(second.lastPlayedMs, firstPlayed);
});

test('recordRun: storage key includes modifier_hash slot (defaults to "v0")', () => {
  const { ctx, store } = envWithStorage();
  ctx.MISSIONS.persistence.recordRun(ctx.localStorage, 'm', {
    score: 1, maxScore: 1, stars: 1, elapsedMs: 0,
  });
  const keys = [...store.keys()];
  assert.ok(keys.some(k => k.includes('m') && k.includes('v0')),
    `expected a key containing mission id and "v0"; got: ${keys.join(', ')}`);
});

test('getBest: missing record returns null', () => {
  const { ctx } = envWithStorage();
  assert.strictEqual(
    ctx.MISSIONS.persistence.getBest(ctx.localStorage, 'never-played'),
    null);
});
