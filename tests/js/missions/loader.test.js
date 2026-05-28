'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv(['mission_schema', 'mission_loader']).ctx;
}

const MINIMAL_MISSION = {
  schema_version: 1,
  id: 'm1',
  title: 'M1',
  type: 'mission',
  difficulty_tier: 'beginner',
  field: {
    robot_start: { x: 350, y: 163, heading: 90 },
    zones:     [{ id: 'red', shape: 'rect', x: 100, y: 100, w: 50, h: 50, color: 'red' }],
    obstacles: [{ id: '1',  shape: 'rect', x: 200, y: 200, w: 50, h: 50, label: '1' }],
  },
  steps: [
    {
      id: 'reach',
      title: 'Reach the red zone',
      points: 10,
      condition: { kind: 'zone', subject: 'robot', zone: 'red' },
    },
  ],
  scoring: { kind: 'step_sum' },
};

test('load: accepts a minimal valid mission and returns it', () => {
  const ctx = env();
  const mission = ctx.MISSIONS.loader.load(MINIMAL_MISSION);
  assert.strictEqual(mission.id, 'm1');
  assert.strictEqual(mission.steps.length, 1);
});

test('load: rejects when schema_version is missing or unknown', () => {
  const ctx = env();
  const bad = { ...MINIMAL_MISSION, schema_version: 99 };
  assert.throws(() => ctx.MISSIONS.loader.load(bad), /schema_version/);
});

test('load: rejects unknown challenge type', () => {
  const ctx = env();
  const bad = { ...MINIMAL_MISSION, type: 'unknown' };
  assert.throws(() => ctx.MISSIONS.loader.load(bad), /type/);
});

test('load: rejects unknown difficulty tier', () => {
  const ctx = env();
  const bad = { ...MINIMAL_MISSION, difficulty_tier: 'expert' };
  assert.throws(() => ctx.MISSIONS.loader.load(bad), /difficulty_tier/);
});

test('load: rejects a mission with no steps when type is "mission"', () => {
  const ctx = env();
  const bad = { ...MINIMAL_MISSION, steps: [] };
  assert.throws(() => ctx.MISSIONS.loader.load(bad), /at least one step/);
});

test('load: rejects a step whose condition references an unknown zone', () => {
  const ctx = env();
  const bad = JSON.parse(JSON.stringify(MINIMAL_MISSION));
  bad.steps[0].condition.zone = 'nonexistent';
  assert.throws(() => ctx.MISSIONS.loader.load(bad), /unknown zone "nonexistent"/);
});

test('load: rejects a step whose condition references an unknown obstacle', () => {
  const ctx = env();
  const bad = JSON.parse(JSON.stringify(MINIMAL_MISSION));
  bad.steps[0].condition = { kind: 'contact', obstacle: 'ghost' };
  assert.throws(() => ctx.MISSIONS.loader.load(bad), /unknown obstacle "ghost"/);
});

test('load: rejects requires that name a nonexistent step', () => {
  const ctx = env();
  const bad = JSON.parse(JSON.stringify(MINIMAL_MISSION));
  bad.steps[0].requires = ['missing'];
  assert.throws(() => ctx.MISSIONS.loader.load(bad), /requires unknown step "missing"/);
});

test('load: rejects a condition with an unknown kind', () => {
  const ctx = env();
  const bad = JSON.parse(JSON.stringify(MINIMAL_MISSION));
  bad.steps[0].condition = { kind: 'wishful', subject: 'robot' };
  assert.throws(() => ctx.MISSIONS.loader.load(bad), /unknown condition kind/);
});

test('load: validates nested conditions inside all_of / not', () => {
  const ctx = env();
  const bad = JSON.parse(JSON.stringify(MINIMAL_MISSION));
  bad.steps[0].condition = {
    kind: 'all_of',
    of: [
      { kind: 'zone', subject: 'robot', zone: 'red' },
      { kind: 'not', of: { kind: 'zone', subject: 'robot', zone: 'orange' } },
    ],
  };
  assert.throws(() => ctx.MISSIONS.loader.load(bad), /unknown zone "orange"/);
});

test('load: defaults modifiers to {available: [], defaults: {}} when omitted', () => {
  const ctx = env();
  const mission = ctx.MISSIONS.loader.load(MINIMAL_MISSION);
  assert.deepStrictEqual(mission.modifiers, { available: [], defaults: {} });
});

test('load: obstacle_course type requires scoring.kind = objective_minus_penalties', () => {
  const ctx = env();
  const bad = { ...MINIMAL_MISSION, type: 'obstacle_course' };
  assert.throws(() => ctx.MISSIONS.loader.load(bad), /obstacle_course.*objective_minus_penalties/);
});

test('load: rejects non-object input', () => {
  const ctx = env();
  assert.throws(() => ctx.MISSIONS.loader.load(null),      /expected an object/);
  assert.throws(() => ctx.MISSIONS.loader.load(undefined), /expected an object/);
  assert.throws(() => ctx.MISSIONS.loader.load(42),        /expected an object/);
  assert.throws(() => ctx.MISSIONS.loader.load('string'),  /expected an object/);
});

test('load: rejects when a required top-level field is missing', () => {
  const ctx = env();
  for (const field of ['id', 'title', 'type', 'difficulty_tier', 'field', 'steps', 'scoring']) {
    const bad = { ...MINIMAL_MISSION };
    delete bad[field];
    assert.throws(() => ctx.MISSIONS.loader.load(bad),
      new RegExp(`missing required field "${field}"`));
  }
});

test('load: rejects a step that is missing its own required fields', () => {
  const ctx = env();
  for (const field of ['id', 'title', 'points', 'condition']) {
    const bad = JSON.parse(JSON.stringify(MINIMAL_MISSION));
    delete bad.steps[0][field];
    assert.throws(() => ctx.MISSIONS.loader.load(bad),
      new RegExp(`missing "${field}"`));
  }
});

test('load: rejects a sensor condition missing port / op / value', () => {
  const ctx = env();
  for (const field of ['port', 'op', 'value']) {
    const bad = JSON.parse(JSON.stringify(MINIMAL_MISSION));
    bad.steps[0].condition = { kind: 'sensor', port: 'C', op: '==', value: 'red' };
    delete bad.steps[0].condition[field];
    assert.throws(() => ctx.MISSIONS.loader.load(bad),
      new RegExp(`sensor condition missing "${field}"`));
  }
});

test('load: rejects a zone condition naming an unknown obstacle subject', () => {
  const ctx = env();
  const bad = JSON.parse(JSON.stringify(MINIMAL_MISSION));
  bad.steps[0].condition = { kind: 'zone', subject: 'obstacle:ghost', zone: 'red' };
  assert.throws(() => ctx.MISSIONS.loader.load(bad), /unknown obstacle "ghost"/);
});

test('load: rejects a zone condition with a malformed subject string', () => {
  const ctx = env();
  const bad = JSON.parse(JSON.stringify(MINIMAL_MISSION));
  bad.steps[0].condition = { kind: 'zone', subject: 'banana', zone: 'red' };
  assert.throws(() => ctx.MISSIONS.loader.load(bad),
    /zone\.subject must be "robot" or "obstacle:<id>"/);
});

test('load: rejects all_of / any_of with an empty "of" array', () => {
  const ctx = env();
  for (const kind of ['all_of', 'any_of']) {
    const bad = JSON.parse(JSON.stringify(MINIMAL_MISSION));
    bad.steps[0].condition = { kind, of: [] };
    assert.throws(() => ctx.MISSIONS.loader.load(bad),
      new RegExp(`${kind} requires non-empty "of" array`));
  }
});

// ─── lines + walls validation (Chunk B TDD redo) ────────────────────────────

const MISSION_WITH_LINES_WALLS = {
  ...MINIMAL_MISSION,
  field: {
    ...MINIMAL_MISSION.field,
    lines: [{ id: 'l1', x1: 0, y1: 0, x2: 100, y2: 100, color: 'black', thickness: 4 }],
    walls: [{ id: 'w1', shape: 'rect', x: 200, y: 200, w: 100, h: 50 }],
  },
};

test('lines+walls: mission with empty lines and walls arrays loads successfully', () => {
  const ctx = env();
  const m = JSON.parse(JSON.stringify(MINIMAL_MISSION));
  m.field.lines = [];
  m.field.walls = [];
  const result = ctx.MISSIONS.loader.load(m);
  assert.strictEqual(result.id, 'm1');
});

test('lines+walls: mission with no lines/walls keys defaults them to [] and loads', () => {
  const ctx = env();
  const m = JSON.parse(JSON.stringify(MINIMAL_MISSION));
  delete m.field.lines;
  delete m.field.walls;
  const result = ctx.MISSIONS.loader.load(m);
  assert.strictEqual(result.id, 'm1');
  assert.deepStrictEqual(result.field.lines || [], []);
  assert.deepStrictEqual(result.field.walls || [], []);
});

test('lines+walls: a line missing x1 fails with a clear error message', () => {
  const ctx = env();
  const m = JSON.parse(JSON.stringify(MISSION_WITH_LINES_WALLS));
  delete m.field.lines[0].x1;
  assert.throws(() => ctx.MISSIONS.loader.load(m), /x1/);
});

test('lines+walls: a line with invalid color "purple" fails', () => {
  const ctx = env();
  const m = JSON.parse(JSON.stringify(MISSION_WITH_LINES_WALLS));
  m.field.lines[0].color = 'purple';
  assert.throws(() => ctx.MISSIONS.loader.load(m), /color/i);
});

test('lines+walls: a line with thickness 0 fails', () => {
  const ctx = env();
  const m = JSON.parse(JSON.stringify(MISSION_WITH_LINES_WALLS));
  m.field.lines[0].thickness = 0;
  assert.throws(() => ctx.MISSIONS.loader.load(m), /thickness/i);
});

test('lines+walls: a line with thickness 25 fails (out of 1–20)', () => {
  const ctx = env();
  const m = JSON.parse(JSON.stringify(MISSION_WITH_LINES_WALLS));
  m.field.lines[0].thickness = 25;
  assert.throws(() => ctx.MISSIONS.loader.load(m), /thickness/i);
});

test('lines+walls: a line with an empty id fails', () => {
  const ctx = env();
  const m = JSON.parse(JSON.stringify(MISSION_WITH_LINES_WALLS));
  m.field.lines[0].id = '';
  assert.throws(() => ctx.MISSIONS.loader.load(m), /id/i);
});

test('lines+walls: a wall with shape !== "rect" fails', () => {
  const ctx = env();
  const m = JSON.parse(JSON.stringify(MISSION_WITH_LINES_WALLS));
  m.field.walls[0].shape = 'circle';
  assert.throws(() => ctx.MISSIONS.loader.load(m), /shape/i);
});

test('lines+walls: a wall with w <= 0 fails', () => {
  const ctx = env();
  const m = JSON.parse(JSON.stringify(MISSION_WITH_LINES_WALLS));
  m.field.walls[0].w = 0;
  assert.throws(() => ctx.MISSIONS.loader.load(m), /w must be > 0/i);
});

test('lines+walls: a wall missing x fails with a clear error message', () => {
  const ctx = env();
  const m = JSON.parse(JSON.stringify(MISSION_WITH_LINES_WALLS));
  delete m.field.walls[0].x;
  assert.throws(() => ctx.MISSIONS.loader.load(m), /x/);
});

test('lines+walls: valid mixed-field missions (zones + obstacles + lines + walls) round-trip unchanged', () => {
  const ctx = env();
  const m = JSON.parse(JSON.stringify(MISSION_WITH_LINES_WALLS));
  const result = ctx.MISSIONS.loader.load(m);
  assert.strictEqual(result.field.lines.length, 1);
  assert.strictEqual(result.field.lines[0].id, 'l1');
  assert.strictEqual(result.field.walls.length, 1);
  assert.strictEqual(result.field.walls[0].id, 'w1');
  assert.strictEqual(result.field.zones.length, 1);
  assert.strictEqual(result.field.obstacles.length, 1);
});

// ─── scoring.time_limit_s (optional) ───────────────────────────────────────

test('load: scoring.time_limit_s = 30 is accepted (positive number)', () => {
  const ctx = env();
  const m = { ...MINIMAL_MISSION, scoring: { kind: 'step_sum', time_limit_s: 30 } };
  const result = ctx.MISSIONS.loader.load(m);
  assert.strictEqual(result.scoring.time_limit_s, 30);
});

test('load: missing scoring.time_limit_s is allowed (optional)', () => {
  const ctx = env();
  // MINIMAL_MISSION already has no time_limit_s.
  const result = ctx.MISSIONS.loader.load(MINIMAL_MISSION);
  assert.strictEqual(result.scoring.time_limit_s, undefined);
});

test('load: scoring.time_limit_s = 0 is rejected (must be positive)', () => {
  const ctx = env();
  const m = { ...MINIMAL_MISSION, scoring: { kind: 'step_sum', time_limit_s: 0 } };
  assert.throws(() => ctx.MISSIONS.loader.load(m), /time_limit_s/);
});

test('load: scoring.time_limit_s = -5 is rejected (must be positive)', () => {
  const ctx = env();
  const m = { ...MINIMAL_MISSION, scoring: { kind: 'step_sum', time_limit_s: -5 } };
  assert.throws(() => ctx.MISSIONS.loader.load(m), /time_limit_s/);
});

test('load: non-numeric scoring.time_limit_s is rejected', () => {
  const ctx = env();
  const m = { ...MINIMAL_MISSION, scoring: { kind: 'step_sum', time_limit_s: 'forever' } };
  assert.throws(() => ctx.MISSIONS.loader.load(m), /time_limit_s/);
});
