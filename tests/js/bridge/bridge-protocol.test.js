'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

test('executeCommand: read_sensors returns initial robot state', async () => {
  const sim = createSim();
  const result = await sim.executeCommand({ type: 'read_sensors' });

  assert.strictEqual(result.x,       350);
  assert.strictEqual(result.y,       163);
  assert.strictEqual(result.heading, 90);
  assert.strictEqual(result.stopped, false);
});

test('executeCommand: move command returns sensor snapshot with stopped:false', async () => {
  const sim = createSim();
  // Stub _animateTank so the bridge protocol can complete without a physics
  // engine present in the test harness — we're testing the bridge shape, not
  // the engine.
  sim._animateTank = async () => {};
  const result = await sim.executeCommand({
    type: 'move', pair_id: 0, steering: 0, speed: 1000, amount: 360, unit: 'degrees',
  });

  assert.strictEqual(result.stopped, false);
  assert.strictEqual(typeof result.x, 'number');
  assert.strictEqual(typeof result.y, 'number');
  assert.strictEqual(typeof result.heading, 'number');
});

test('executeCommand: sequential commands each resolve before the next', async () => {
  const sim = createSim();
  const order = [];
  sim._animateTank = async () => { order.push('move'); };

  const r1 = await sim.executeCommand({ type: 'read_sensors' });
  order.push('read_sensors');
  assert.strictEqual(r1.y, 163);

  const r2 = await sim.executeCommand({
    type: 'move', pair_id: 0, steering: 0, speed: 1000, amount: 360, unit: 'degrees',
  });
  assert.deepStrictEqual(order, ['read_sensors', 'move']);
  assert.strictEqual(r2.stopped, false);
});

test('executeCommand: stopped:true when _stopRequested is set', async () => {
  const sim = createSim();
  sim._stopRequested = true;

  const result = await sim.executeCommand({ type: 'read_sensors' });
  assert.strictEqual(result.stopped, true);
});
