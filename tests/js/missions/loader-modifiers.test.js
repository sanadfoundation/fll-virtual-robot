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

test('modifiers: old stub shape normalises to defaults', () => {
  const ctx = env();
  const mission = ctx.MISSIONS.loader.load({
    ...MINIMAL_MISSION,
    modifiers: { available: [], defaults: {} },
  });
  assert.deepStrictEqual(mission.modifiers, {
    poke: {
      enabled: false,
      interval_min_s: 8,
      interval_max_s: 15,
      severity: 0.4,
    },
    friction: {
      enabled: false,
      multiplier: 1.0,
    },
  });
});

test('modifiers: full new shape is preserved', () => {
  const ctx = env();
  const mission = ctx.MISSIONS.loader.load({
    ...MINIMAL_MISSION,
    modifiers: {
      poke: {
        enabled: true,
        interval_min_s: 5,
        interval_max_s: 12,
        severity: 0.7,
      },
      friction: {
        enabled: true,
        multiplier: 0.8,
      },
    },
  });
  assert.deepStrictEqual(mission.modifiers, {
    poke: {
      enabled: true,
      interval_min_s: 5,
      interval_max_s: 12,
      severity: 0.7,
    },
    friction: {
      enabled: true,
      multiplier: 0.8,
    },
  });
});

test('modifiers: missing/null modifiers normalise to defaults', () => {
  const ctx = env();
  // Test 1: modifiers key completely omitted
  const mission1 = ctx.MISSIONS.loader.load(MINIMAL_MISSION);
  assert.deepStrictEqual(mission1.modifiers, {
    poke: {
      enabled: false,
      interval_min_s: 8,
      interval_max_s: 15,
      severity: 0.4,
    },
    friction: {
      enabled: false,
      multiplier: 1.0,
    },
  });

  // Test 2: modifiers is null
  const mission2 = ctx.MISSIONS.loader.load({
    ...MINIMAL_MISSION,
    modifiers: null,
  });
  assert.deepStrictEqual(mission2.modifiers, {
    poke: {
      enabled: false,
      interval_min_s: 8,
      interval_max_s: 15,
      severity: 0.4,
    },
    friction: {
      enabled: false,
      multiplier: 1.0,
    },
  });

  // Test 3: modifiers is undefined
  const mission3 = ctx.MISSIONS.loader.load({
    ...MINIMAL_MISSION,
    modifiers: undefined,
  });
  assert.deepStrictEqual(mission3.modifiers, {
    poke: {
      enabled: false,
      interval_min_s: 8,
      interval_max_s: 15,
      severity: 0.4,
    },
    friction: {
      enabled: false,
      multiplier: 1.0,
    },
  });
});
