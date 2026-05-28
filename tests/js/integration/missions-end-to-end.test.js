'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('fs');
const path   = require('path');
const { makeMissionsEnv, REPO_ROOT } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_persistence',
  ]).ctx;
}

const MISSION_PATH = path.join(REPO_ROOT, 'missions/red-zone-then-push/mission.json');

test('end-to-end: load mission → drive both steps → finalize at 25/25/3★ → persist', () => {
  const ctx = env();
  const raw = JSON.parse(fs.readFileSync(MISSION_PATH, 'utf8'));
  const mission = ctx.MISSIONS.loader.load(raw);
  const engine  = new ctx.MISSIONS.engine.ChallengeEngine();
  engine.load(mission);
  engine.start(0);

  // Tick 1: robot drives into red zone.
  let c = engine.tick({
    robot: { x: 2000, y: 343, heading: 90 },
    obstacles: { '1': { x: 1700, y: 943 } },  // still on green
    sensors: { C: 'red', D: 200, E: 0 },
  });
  assert.deepStrictEqual(c, ['reach-red']);
  assert.strictEqual(engine.progress.score, 10);

  // Tick 2: robot turns north, obstacle 1 has been pushed off green.
  c = engine.tick({
    robot: { x: 1700, y: 700, heading: 0 },
    obstacles: { '1': { x: 1300, y: 943 } },  // off green now
    sensors: { C: 'green', D: 200, E: 5 },
  });
  assert.deepStrictEqual(c, ['push-obstacle-1']);
  assert.strictEqual(engine.progress.score, 25);

  // Finalize.
  const result = engine.finalize(12_000);
  assert.strictEqual(result.score, 25);
  assert.strictEqual(result.maxScore, 25);
  assert.strictEqual(result.finalized, true);

  // Persist + read back.
  const store = new Map();
  const ls = {
    getItem: k => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => { store.set(k, v); },
    removeItem: k => { store.delete(k); },
  };
  ctx.MISSIONS.persistence.recordRun(ls, mission.id, {
    score: result.score, maxScore: result.maxScore,
    stars: ctx.MISSIONS.engine.starRating(result.score, result.maxScore),
    elapsedMs: result.elapsedMs,
  });
  const best = ctx.MISSIONS.persistence.getBest(ls, mission.id);
  assert.strictEqual(best.score, 25);
  assert.strictEqual(best.stars, 3);
});
