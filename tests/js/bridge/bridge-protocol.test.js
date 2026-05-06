'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

test('executeCommand: read_sensors returns initial robot state', async () => {
  const sim = createSim();
  const result = await sim.executeCommand({ type: 'read_sensors' });

  assert.strictEqual(result.x,       350);
  assert.strictEqual(result.y,       980);
  assert.strictEqual(result.heading, -90);
  assert.strictEqual(result.stopped, false);
});

test('executeCommand: move command updates robot position', async () => {
  const sim = createSim();
  const result = await sim.executeCommand({
    type: 'move', pair_id: 0, steering: 0, speed: 1000, amount: 360, unit: 'degrees',
  });

  assert.ok(result.y < 980, `y=${result.y} should be < 980 after moving north`);
  assert.strictEqual(result.stopped, false);
});

test('executeCommand: sequential commands processed in order', async () => {
  const sim = createSim();

  const r1 = await sim.executeCommand({ type: 'read_sensors' });
  assert.strictEqual(r1.y, 980);

  const r2 = await sim.executeCommand({
    type: 'move', pair_id: 0, steering: 0, speed: 1000, amount: 360, unit: 'degrees',
  });
  assert.ok(r2.y < 980, `y=${r2.y} should decrease after move`);
});

test('executeCommand: stopped:true when _stopRequested is set', async () => {
  const sim = createSim();
  sim._stopRequested = true;

  const result = await sim.executeCommand({ type: 'read_sensors' });
  assert.strictEqual(result.stopped, true);
});
