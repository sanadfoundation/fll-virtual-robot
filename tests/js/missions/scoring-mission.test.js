'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions', 'mission_engine',
  ]).ctx;
}

const M = {
  schema_version: 1, id: 'sc', title: 'SC', type: 'mission', difficulty_tier: 'beginner',
  field: {
    robot_start: { x: 0, y: 0, heading: 0 },
    zones: [
      { id: 'a', shape: 'rect', x: 0,   y: 0,   w: 10, h: 10, color: 'red' },
      { id: 'b', shape: 'rect', x: 100, y: 100, w: 10, h: 10, color: 'red' },
    ],
    obstacles: [],
  },
  steps: [
    { id: 'a', title: 'A', points: 10,
      condition: { kind: 'zone', subject: 'robot', zone: 'a' } },
    { id: 'b', title: 'B', points: 15,
      condition: { kind: 'zone', subject: 'robot', zone: 'b' } },
  ],
  scoring: { kind: 'step_sum' },
};

function snap(x, y) {
  return {
    robot: { x, y, heading: 0 }, obstacles: {}, sensors: {}, contacts: {},
    zones: {
      a: { id: 'a', shape: 'rect', x: 0,   y: 0,   w: 10, h: 10 },
      b: { id: 'b', shape: 'rect', x: 100, y: 100, w: 10, h: 10 },
    },
  };
}

test('maxScore: sum of all step points', () => {
  const ctx = env();
  const mission = ctx.MISSIONS.loader.load(M);
  assert.strictEqual(ctx.MISSIONS.engine.maxScore(mission), 25);
});

test('finalize: step_sum returns score (no penalties applied)', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(M));
  e.start(0);
  e.tick(snap(5, 5));        // a → +10
  e.tick(snap(105, 105));    // b → +15
  const final = e.finalize(5000);
  assert.strictEqual(final.score, 25);
  assert.strictEqual(final.maxScore, 25);
  assert.deepStrictEqual(final.breakdown, [
    { kind: 'step', stepId: 'a', title: 'A', points: 10 },
    { kind: 'step', stepId: 'b', title: 'B', points: 15 },
  ]);
});

test('starRating: 3 stars at ≥ 90% of max', () => {
  const ctx = env();
  assert.strictEqual(ctx.MISSIONS.engine.starRating(90, 100), 3);
  assert.strictEqual(ctx.MISSIONS.engine.starRating(89, 100), 2);
});

test('starRating: 2 stars at ≥ 60%', () => {
  const ctx = env();
  assert.strictEqual(ctx.MISSIONS.engine.starRating(60, 100), 2);
  assert.strictEqual(ctx.MISSIONS.engine.starRating(59, 100), 1);
});

test('starRating: 1 star for any positive score', () => {
  const ctx = env();
  assert.strictEqual(ctx.MISSIONS.engine.starRating(1,   100), 1);
  assert.strictEqual(ctx.MISSIONS.engine.starRating(0.5, 100), 1);
});

test('starRating: 0 stars at zero score', () => {
  const ctx = env();
  assert.strictEqual(ctx.MISSIONS.engine.starRating(0, 100), 0);
});

test('starRating: maxScore = 0 → 3 stars by convention (avoid divide-by-zero shame)', () => {
  const ctx = env();
  assert.strictEqual(ctx.MISSIONS.engine.starRating(0, 0), 3);
});
