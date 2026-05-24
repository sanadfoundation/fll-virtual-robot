'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('fs');
const path   = require('path');
const { makeMissionsEnv, REPO_ROOT } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions', 'mission_engine',
  ]).ctx;
}

const MISSION_PATH = path.join(REPO_ROOT, 'missions/red-zone-then-push/mission.json');

test('bundled red-zone mission loads without errors', () => {
  const ctx = env();
  const raw = JSON.parse(fs.readFileSync(MISSION_PATH, 'utf8'));
  const mission = ctx.MISSIONS.loader.load(raw);
  assert.strictEqual(mission.id, 'red-zone-then-push');
  assert.strictEqual(mission.type, 'mission');
  assert.strictEqual(mission.steps.length, 2);
});

test('bundled red-zone mission max score is 25 (10 + 15)', () => {
  const ctx = env();
  const raw = JSON.parse(fs.readFileSync(MISSION_PATH, 'utf8'));
  const mission = ctx.MISSIONS.loader.load(raw);
  assert.strictEqual(ctx.MISSIONS.engine.maxScore(mission), 25);
});

test('bundled red-zone mission: step 1 completes when robot enters the red zone', () => {
  const ctx = env();
  const raw = JSON.parse(fs.readFileSync(MISSION_PATH, 'utf8'));
  const mission = ctx.MISSIONS.loader.load(raw);
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(mission);
  e.start(0);
  // Place robot inside the red zone (the spec's example: red rect at x=1900, y=243, 200×200).
  const completed = e.tick({
    robot: { x: 2000, y: 343, heading: 90 },
    obstacles: { '1': { x: 1700, y: 943 } },
    sensors: {},
  });
  assert.ok(completed.includes('reach-red'), `expected reach-red, got ${completed}`);
});

test('bundled red-zone mission: step 2 requires step 1 first', () => {
  const ctx = env();
  const raw = JSON.parse(fs.readFileSync(MISSION_PATH, 'utf8'));
  const mission = ctx.MISSIONS.loader.load(raw);
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(mission);
  e.start(0);
  // Push obstacle 1 off green (move it elsewhere), but don't reach red yet.
  const completed = e.tick({
    robot: { x: 0, y: 0, heading: 90 },
    obstacles: { '1': { x: 50, y: 50 } },   // away from green
    sensors: {},
  });
  assert.deepStrictEqual(completed, []);  // step 2 is gated
});
