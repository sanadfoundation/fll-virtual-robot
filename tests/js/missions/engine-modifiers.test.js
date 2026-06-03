'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions', 'mission_engine',
  ]).ctx;
}

const BASE = {
  schema_version: 1, id: 'pm', title: 'PM', type: 'mission', difficulty_tier: 'beginner',
  field: {
    robot_start: { x: 0, y: 0, heading: 0 },
    zones:     [{ id: 'red', shape: 'rect', x: 100, y: 100, w: 50, h: 50, color: 'red' }],
    obstacles: [],
  },
  steps: [{ id: 's1', title: 'S1', points: 10,
    condition: { kind: 'zone', subject: 'robot', zone: 'red' } }],
  scoring: { kind: 'step_sum' },
};

function snap(opts) {
  return {
    robot: (opts && opts.robot) || { x: 0, y: 0, heading: 90 },
    obstacles: {}, sensors: {}, contacts: {},
    zones: { red: { id: 'red', shape: 'rect', x: 100, y: 100, w: 50, h: 50 } },
  };
}

test('engine: _nextPokeMs is null after load when poke disabled', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(BASE));
  assert.strictEqual(e._nextPokeMs, null);
});

test('engine: start schedules first poke when poke.enabled is true', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load({
    ...BASE,
    modifiers: { poke: { enabled: true, interval_min_s: 5, interval_max_s: 10, severity: 0.5 },
                 friction: { enabled: false, multiplier: 1.0 } },
  }));
  e.start(1000);
  assert.ok(e._nextPokeMs >= 1000 + 5000, 'next poke must be >= min interval after start');
  assert.ok(e._nextPokeMs <= 1000 + 10000, 'next poke must be <= max interval after start');
});

test('engine: tick does not call applyPoke before _nextPokeMs', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load({
    ...BASE,
    modifiers: { poke: { enabled: true, interval_min_s: 5, interval_max_s: 5, severity: 0.5 },
                 friction: { enabled: false, multiplier: 1.0 } },
  }));
  e.start(0);
  const pokes = [];
  const mockSim = { applyPoke: (dx, dy, dH) => pokes.push({ dx, dy, dH }) };
  e.tick(snap(), 4999, mockSim);
  assert.strictEqual(pokes.length, 0);
});

test('engine: tick calls applyPoke when nowMs >= _nextPokeMs', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load({
    ...BASE,
    modifiers: { poke: { enabled: true, interval_min_s: 5, interval_max_s: 5, severity: 0.5 },
                 friction: { enabled: false, multiplier: 1.0 } },
  }));
  e.start(0);
  const pokes = [];
  const mockSim = { applyPoke: (dx, dy, dH) => pokes.push({ dx, dy, dH }) };
  e.tick(snap(), 5000, mockSim);
  assert.strictEqual(pokes.length, 1);
  const p = pokes[0];
  assert.ok(Number.isFinite(p.dx), 'dx must be a finite number');
  assert.ok(Number.isFinite(p.dy), 'dy must be a finite number');
  assert.ok(Number.isFinite(p.dH), 'dH must be a finite number');
});

test('engine: tick re-arms _nextPokeMs after firing', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load({
    ...BASE,
    modifiers: { poke: { enabled: true, interval_min_s: 5, interval_max_s: 5, severity: 0.5 },
                 friction: { enabled: false, multiplier: 1.0 } },
  }));
  e.start(0);
  const mockSim = { applyPoke: () => {} };
  e.tick(snap(), 5000, mockSim);
  assert.ok(e._nextPokeMs > 5000, 'next poke should be rescheduled past fire time');
});

test('engine: reset clears _nextPokeMs', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load({
    ...BASE,
    modifiers: { poke: { enabled: true, interval_min_s: 5, interval_max_s: 10, severity: 0.5 },
                 friction: { enabled: false, multiplier: 1.0 } },
  }));
  e.start(0);
  assert.ok(e._nextPokeMs !== null);
  e.reset();
  assert.strictEqual(e._nextPokeMs, null);
});

test('engine: poke dx/dy are perpendicular to robot heading', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load({
    ...BASE,
    modifiers: { poke: { enabled: true, interval_min_s: 5, interval_max_s: 5, severity: 1.0 },
                 friction: { enabled: false, multiplier: 1.0 } },
  }));
  e.start(0);
  const pokes = [];
  const mockSim = { applyPoke: (dx, dy, dH) => pokes.push({ dx, dy, dH }) };
  // Robot heading 0 (east): perpendicular is 90 (north), so dx ~= 0, dy = ±30.
  e.tick(snap({ robot: { x: 0, y: 0, heading: 0 } }), 5000, mockSim);
  assert.ok(Math.abs(pokes[0].dx) < 0.001, 'dx should be ~0 when heading is east');
  assert.ok(Math.abs(Math.abs(pokes[0].dy) - 30) < 0.001, 'dy magnitude should be 30 at severity 1.0');
});
