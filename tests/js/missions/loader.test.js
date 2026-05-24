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
