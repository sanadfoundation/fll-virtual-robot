'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions', 'mission_engine',
  ]).ctx;
}

const MISSION = {
  schema_version: 1, id: 'lc', title: 'LC', type: 'mission', difficulty_tier: 'beginner',
  field: {
    robot_start: { x: 0, y: 0, heading: 0 },
    zones:     [{ id: 'red', shape: 'rect', x: 100, y: 100, w: 50, h: 50, color: 'red' }],
    obstacles: [],
  },
  steps: [
    { id: 's1', title: 'Reach red', points: 10,
      condition: { kind: 'zone', subject: 'robot', zone: 'red' } },
  ],
  scoring: { kind: 'step_sum' },
};

function snap(opts = {}) {
  return {
    robot: opts.robot || { x: 0, y: 0, heading: 0 },
    obstacles: {}, sensors: {}, contacts: {},
    zones: { red: { id: 'red', shape: 'rect', x: 100, y: 100, w: 50, h: 50 } },
  };
}

test('engine: load() returns a progress object with no steps complete', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  const p = e.load(ctx.MISSIONS.loader.load(MISSION));
  assert.strictEqual(p.score, 0);
  assert.deepStrictEqual(p.stepResults, {});
  assert.strictEqual(p.finalized, false);
});

test('engine: tick before start() is a no-op', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(MISSION));
  const completed = e.tick(snap({ robot: { x: 120, y: 120, heading: 0 } }));
  assert.deepStrictEqual(completed, []);
  assert.strictEqual(e.progress.score, 0);
});

test('engine: start() sets startTimeMs and arms the tick loop', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(MISSION));
  e.start(1000);
  assert.strictEqual(e.startTimeMs, 1000);
});

test('engine: tick after start() completes a step whose condition fires true', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(MISSION));
  e.start(0);
  const completed = e.tick(snap({ robot: { x: 120, y: 120, heading: 0 } }));
  assert.deepStrictEqual(completed, ['s1']);
  assert.strictEqual(e.progress.score, 10);
  assert.strictEqual(e.progress.stepResults.s1.complete, true);
});

test('engine: completed steps do NOT re-fire on subsequent ticks', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(MISSION));
  e.start(0);
  e.tick(snap({ robot: { x: 120, y: 120, heading: 0 } }));
  const completed2 = e.tick(snap({ robot: { x: 120, y: 120, heading: 0 } }));
  assert.deepStrictEqual(completed2, []);
  assert.strictEqual(e.progress.score, 10);  // not 20
});

test('engine: reset() clears progress and timer back to fresh load state', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(MISSION));
  e.start(0);
  e.tick(snap({ robot: { x: 120, y: 120, heading: 0 } }));
  e.reset();
  assert.strictEqual(e.startTimeMs, null);
  assert.strictEqual(e.progress.score, 0);
  assert.deepStrictEqual(e.progress.stepResults, {});
});

test('engine: finalize() marks finalized=true and locks score', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(MISSION));
  e.start(0);
  e.tick(snap({ robot: { x: 120, y: 120, heading: 0 } }));
  const result = e.finalize(1500);
  assert.strictEqual(result.finalized, true);
  assert.strictEqual(result.score, 10);
  assert.strictEqual(result.elapsedMs, 1500);
});

test('engine: recordContact populates the contacts map (first-hit only)', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.recordContact('1', 100);
  e.recordContact('1', 200);  // ignored — already recorded
  assert.strictEqual(e.firstContact['1'], 100);
});

// ─── Time limit (optional, both mission types) ─────────────────────────────

const TIMED_MISSION = {
  schema_version: 1, id: 'tm', title: 'Timed', type: 'mission', difficulty_tier: 'beginner',
  field: {
    robot_start: { x: 0, y: 0, heading: 0 },
    zones: [{ id: 'red', shape: 'rect', x: 100, y: 100, w: 50, h: 50, color: 'red' }],
    obstacles: [],
  },
  steps: [{ id: 's1', title: 'noop', points: 5,
            condition: { kind: 'zone', subject: 'robot', zone: 'red' } }],
  scoring: { kind: 'step_sum', time_limit_s: 10 },
};

test('engine: getElapsedMs returns null before start', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(TIMED_MISSION));
  assert.strictEqual(e.getElapsedMs(0), null);
});

test('engine: getElapsedMs returns now - startTime after start()', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(TIMED_MISSION));
  e.start(1000);
  assert.strictEqual(e.getElapsedMs(3500), 2500);
});

test('engine: getTimeRemainingMs reflects time_limit_s minus elapsed', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(TIMED_MISSION));
  e.start(1000);
  // time_limit_s = 10 → 10000ms. At now=3000 elapsed = 2000, remaining = 8000.
  assert.strictEqual(e.getTimeRemainingMs(3000), 8000);
});

test('engine: getTimeRemainingMs returns null when no time_limit_s is set', () => {
  const ctx = env();
  const NO_LIMIT = { ...MISSION };
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(NO_LIMIT));
  e.start(0);
  assert.strictEqual(e.getTimeRemainingMs(500), null);
});

test('engine: tick(snap, nowMs) auto-finalizes when elapsed > time_limit_s and sets timedOut', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(TIMED_MISSION));
  e.start(1000);
  // limit is 10000ms; nowMs - startTime = 11000 > 10000 → finalize
  e.tick(snap(), 12000);
  assert.strictEqual(e.progress.finalized, true);
  assert.strictEqual(e.progress.timedOut, true);
});

test('engine: tick without time_limit_s does NOT auto-finalize regardless of nowMs', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(MISSION));
  e.start(0);
  e.tick(snap(), 999999999);
  assert.strictEqual(e.progress.finalized, false);
});

test('engine: getTimeRemainingMs clamps to 0 when elapsed exceeds limit', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(TIMED_MISSION));
  e.start(0);
  assert.strictEqual(e.getTimeRemainingMs(20000), 0);
});

test('engine: getElapsedMs freezes once finalize() runs (manual Stop)', () => {
  // When the user clicks Stop, finalize() runs and captures progress.elapsedMs.
  // Subsequent getElapsedMs(nowMs) calls must return that frozen value, not
  // a still-growing "now - startTime". Otherwise the timer in the UI keeps
  // ticking after the run ends.
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(TIMED_MISSION));
  e.start(1000);
  e.finalize(3500 - 1000);  // user stopped at nowMs=3500 → elapsed 2500
  // Time keeps moving, but the engine reports the frozen elapsed.
  assert.strictEqual(e.getElapsedMs(10000), 2500);
  assert.strictEqual(e.getElapsedMs(99999), 2500);
});

test('engine: getTimeRemainingMs freezes once finalize() runs', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(TIMED_MISSION));
  e.start(1000);
  // Elapsed = 2500, limit 10000 → remaining 7500
  e.finalize(2500);
  assert.strictEqual(e.getTimeRemainingMs(20000), 7500);
});

test('engine: reset() clears startTimeMs so the timer can re-start cleanly', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(TIMED_MISSION));
  e.start(1000);
  e.finalize(2500);
  e.reset();
  assert.strictEqual(e.startTimeMs, null);
  assert.strictEqual(e.getElapsedMs(5000), null);
  assert.strictEqual(e.getTimeRemainingMs(5000), null);
  assert.strictEqual(e.progress.finalized, false);
});
