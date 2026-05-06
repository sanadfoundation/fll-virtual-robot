'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

test('_robotOverlapsAABB: robot center inside box → true', () => {
  const sim = createSim();
  assert.strictEqual(
    sim._robotOverlapsAABB({ x: 500, y: 500 }, { x: 400, y: 400, w: 200, h: 200 }),
    true,
  );
});

test('_robotOverlapsAABB: robot far away → false', () => {
  const sim = createSim();
  assert.strictEqual(
    sim._robotOverlapsAABB({ x: 100, y: 100 }, { x: 400, y: 400, w: 200, h: 200 }),
    false,
  );
});

test('_robotOverlapsAABB: robot 85mm from box edge → true (radius 90mm)', () => {
  const sim = createSim();
  assert.strictEqual(
    sim._robotOverlapsAABB({ x: 550, y: 415 }, { x: 500, y: 500, w: 100, h: 100 }),
    true,
  );
});

test('_robotOverlapsAABB: robot 95mm from box edge → false (radius 90mm)', () => {
  const sim = createSim();
  assert.strictEqual(
    sim._robotOverlapsAABB({ x: 550, y: 405 }, { x: 500, y: 500, w: 100, h: 100 }),
    false,
  );
});

test('_robotOverlapsAABB: robot within 90mm of corner → true', () => {
  const sim = createSim();
  const dx = 63, dy = 63;
  assert.ok(Math.sqrt(dx*dx + dy*dy) < 90, 'test setup: robot is within radius');
  assert.strictEqual(
    sim._robotOverlapsAABB({ x: 500 - dx, y: 500 - dy }, { x: 500, y: 500, w: 100, h: 100 }),
    true,
  );
});
