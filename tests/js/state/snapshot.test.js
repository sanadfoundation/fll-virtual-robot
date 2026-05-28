'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

test('getStateSnapshot: returns robot pose with x, y, heading', async () => {
  const sim = createSim();
  const snap = sim.getStateSnapshot();
  assert.strictEqual(typeof snap.robot.x, 'number');
  assert.strictEqual(typeof snap.robot.y, 'number');
  assert.strictEqual(typeof snap.robot.heading, 'number');
});

test('getStateSnapshot: includes obstacle map keyed by label', async () => {
  const sim = createSim();
  const snap = sim.getStateSnapshot();
  // Default OBSTACLES has labels '1' and '2'.
  assert.ok(snap.obstacles['1'], 'expected obstacle "1"');
  assert.ok(snap.obstacles['2'], 'expected obstacle "2"');
  assert.strictEqual(typeof snap.obstacles['1'].x, 'number');
  assert.strictEqual(typeof snap.obstacles['1'].y, 'number');
});

test('getStateSnapshot: sensors map keyed by port letter', async () => {
  const sim = createSim();
  const snap = sim.getStateSnapshot();
  assert.ok('C' in snap.sensors, 'expected color sensor on C');
  assert.ok('D' in snap.sensors, 'expected distance sensor on D');
  assert.ok('E' in snap.sensors, 'expected force sensor on E');
});
