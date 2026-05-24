'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions', 'mission_engine',
  ]).ctx;
}

const OC = {
  schema_version: 1, id: 'oc', title: 'OC', type: 'obstacle_course',
  difficulty_tier: 'intermediate',
  field: {
    robot_start: { x: 0, y: 0, heading: 0 },
    zones:     [{ id: 'finish', shape: 'rect', x: 100, y: 0, w: 50, h: 50, color: 'green' }],
    obstacles: [
      { id: 'p1', shape: 'rect', x: 30, y: 0, w: 5, h: 5, label: 'p1' },
      { id: 'p2', shape: 'rect', x: 60, y: 0, w: 5, h: 5, label: 'p2' },
    ],
  },
  steps: [],
  scoring: {
    kind: 'objective_minus_penalties',
    goal_zone: 'finish',
    collisions: { per_contact: 5, cap: 50 },
    time_budget_s: 10,
    per_second_over: 1,
  },
};

function snap(x, y) {
  return {
    robot: { x, y, heading: 0 }, obstacles: {}, sensors: {}, contacts: {},
    zones: { finish: { id: 'finish', shape: 'rect', x: 100, y: 0, w: 50, h: 50 } },
  };
}

test('OC: never reaches goal → 0', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(OC));
  e.start(0);
  e.tick(snap(50, 0));
  const r = e.finalize(8000);
  assert.strictEqual(r.score, 0);
  assert.strictEqual(r.maxScore, 100);
});

test('OC: reaches goal cleanly, on time → 100', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(OC));
  e.start(0);
  e.tick(snap(110, 10));
  const r = e.finalize(8000);
  assert.strictEqual(r.score, 100);
});

test('OC: collision penalty per distinct obstacle hit', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(OC));
  e.start(0);
  e.recordContact('p1', 100);
  e.recordContact('p2', 200);
  e.recordContact('p1', 300);  // re-hit, must not double-charge
  e.tick(snap(110, 10));
  const r = e.finalize(8000);
  assert.strictEqual(r.score, 100 - 10);  // two distinct obstacles × 5
});

test('OC: collision penalty caps at cap', () => {
  const ctx = env();
  const big = JSON.parse(JSON.stringify(OC));
  big.field.obstacles = [];
  for (let i = 0; i < 20; i++) big.field.obstacles.push(
    { id: `p${i}`, shape: 'rect', x: 10 + i*4, y: 0, w: 2, h: 2, label: `p${i}` });
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(big));
  e.start(0);
  for (let i = 0; i < 20; i++) e.recordContact(`p${i}`, i * 10);
  e.tick(snap(110, 10));
  const r = e.finalize(8000);
  assert.strictEqual(r.score, 100 - 50);  // capped
});

test('OC: time penalty kicks in only after target_time_s', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(OC));
  e.start(0);
  e.tick(snap(110, 10));
  const r = e.finalize(13_000);  // 13s, 3s over budget at 1/s → −3
  assert.strictEqual(r.score, 100 - 3);
});

test('OC: total cannot go below zero', () => {
  const ctx = env();
  const tight = JSON.parse(JSON.stringify(OC));
  tight.scoring.time_budget_s   = 1;
  tight.scoring.per_second_over = 200;  // contrived to overshoot
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(tight));
  e.start(0);
  e.tick(snap(110, 10));
  const r = e.finalize(60_000);
  assert.strictEqual(r.score, 0);
});

test('OC: breakdown lists base + collision + time rows', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(OC));
  e.start(0);
  e.recordContact('p1', 100);
  e.tick(snap(110, 10));
  const r = e.finalize(13_000);
  const kinds = r.breakdown.map(b => b.kind);
  assert.deepStrictEqual(kinds, ['base', 'collisions', 'time']);
});
