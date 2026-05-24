'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv(['mission_schema', 'mission_conditions']).ctx;
}

function snapshotWith(opts) {
  return {
    robot: opts.robot || { x: 0, y: 0, heading: 0 },
    obstacles: opts.obstacles || {},
    sensors: opts.sensors || {},
    contacts: opts.contacts || {},
    zones: opts.zones || {},
  };
}

test('zone (rect): robot inside the rect returns true', () => {
  const ctx = env();
  const snap = snapshotWith({
    robot: { x: 110, y: 110, heading: 0 },
    zones: { red: { id: 'red', shape: 'rect', x: 100, y: 100, w: 50, h: 50 } },
  });
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate({ kind: 'zone', subject: 'robot', zone: 'red' }, snap),
    true,
  );
});

test('zone (rect): robot outside the rect returns false', () => {
  const ctx = env();
  const snap = snapshotWith({
    robot: { x: 200, y: 200, heading: 0 },
    zones: { red: { id: 'red', shape: 'rect', x: 100, y: 100, w: 50, h: 50 } },
  });
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate({ kind: 'zone', subject: 'robot', zone: 'red' }, snap),
    false,
  );
});

test('zone (rect): point exactly on the bottom-left corner is inside (inclusive)', () => {
  const ctx = env();
  const snap = snapshotWith({
    robot: { x: 100, y: 100, heading: 0 },
    zones: { red: { id: 'red', shape: 'rect', x: 100, y: 100, w: 50, h: 50 } },
  });
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate({ kind: 'zone', subject: 'robot', zone: 'red' }, snap),
    true,
  );
});

test('zone (rect): point exactly on the top-right corner is inside (inclusive)', () => {
  const ctx = env();
  const snap = snapshotWith({
    robot: { x: 150, y: 150, heading: 0 },
    zones: { red: { id: 'red', shape: 'rect', x: 100, y: 100, w: 50, h: 50 } },
  });
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate({ kind: 'zone', subject: 'robot', zone: 'red' }, snap),
    true,
  );
});

test('zone (circle): inside if Euclidean distance from centre <= r', () => {
  const ctx = env();
  const snap = snapshotWith({
    robot: { x: 103, y: 104, heading: 0 },  // dist = 5 from (100,100)
    zones: { goal: { id: 'goal', shape: 'circle', x: 100, y: 100, r: 5 } },
  });
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate({ kind: 'zone', subject: 'robot', zone: 'goal' }, snap),
    true,
  );
});

test('zone (circle): outside if distance > r', () => {
  const ctx = env();
  const snap = snapshotWith({
    robot: { x: 110, y: 100, heading: 0 },  // dist = 10
    zones: { goal: { id: 'goal', shape: 'circle', x: 100, y: 100, r: 5 } },
  });
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate({ kind: 'zone', subject: 'robot', zone: 'goal' }, snap),
    false,
  );
});

test('zone: subject "obstacle:1" uses the obstacle position', () => {
  const ctx = env();
  const snap = snapshotWith({
    obstacles: { '1': { x: 120, y: 120 } },
    zones:     { green: { id: 'green', shape: 'rect', x: 100, y: 100, w: 50, h: 50 } },
  });
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate({ kind: 'zone', subject: 'obstacle:1', zone: 'green' }, snap),
    true,
  );
});

test('zone: missing subject returns false (defensive — should not crash)', () => {
  const ctx = env();
  const snap = snapshotWith({
    obstacles: {},
    zones:     { green: { id: 'green', shape: 'rect', x: 100, y: 100, w: 50, h: 50 } },
  });
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate({ kind: 'zone', subject: 'obstacle:gone', zone: 'green' }, snap),
    false,
  );
});
