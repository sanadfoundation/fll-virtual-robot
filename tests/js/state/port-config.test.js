'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

test('PORT_CONFIG is exposed and matches default wiring', () => {
  const sim = createSim();
  assert.strictEqual(sim._portConfig.A.kind, 'motor');
  assert.strictEqual(sim._portConfig.A.role, 'drive-left');
  assert.strictEqual(sim._portConfig.B.kind, 'motor');
  assert.strictEqual(sim._portConfig.B.role, 'drive-right');
  assert.strictEqual(sim._portConfig.C.kind, 'color_sensor');
  assert.strictEqual(sim._portConfig.D.kind, 'distance_sensor');
  assert.strictEqual(sim._portConfig.E.kind, 'force_sensor');
  assert.strictEqual(sim._portConfig.E.mount, 'front');
  assert.strictEqual(sim._portConfig.F.kind, 'empty');
});

test('_execCmd throws on motor command targeting empty port', async () => {
  const sim = createSim();
  sim.isRunning = true;
  let threw = null;
  try {
    await sim._execCmd({ type: 'motor_run', port: 'F', velocity: 360 });
  } catch (e) {
    threw = e;
  }
  assert.ok(threw, 'expected throw');
  assert.match(threw.message, /port F has no motor/);
  assert.match(threw.message, /configured: empty/);
});

test('_execCmd throws on motor command targeting sensor port', async () => {
  const sim = createSim();
  sim.isRunning = true;
  let threw = null;
  try {
    await sim._execCmd({ type: 'motor_degrees', port: 'C', degrees: 360, velocity: 500 });
  } catch (e) {
    threw = e;
  }
  assert.ok(threw, 'expected throw');
  assert.match(threw.message, /port C has no motor/);
  assert.match(threw.message, /configured: color_sensor/);
});

test('_execCmd succeeds on motor command targeting motor port A', async () => {
  const sim = createSim();
  sim.isRunning = true;
  await sim._execCmd({ type: 'pair', pair_id: 0, left: 'A', right: 'B' });
  await sim._execCmd({ type: 'motor_degrees', port: 'A', degrees: 90, velocity: 500 });
});

test('_execCmd does not validate non-port commands', async () => {
  const sim = createSim();
  sim.isRunning = true;
  await sim._execCmd({ type: 'wait', ms: 0 });
  await sim._execCmd({ type: 'print', text: 'hi' });
});
