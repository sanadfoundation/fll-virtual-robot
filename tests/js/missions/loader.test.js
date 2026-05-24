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
