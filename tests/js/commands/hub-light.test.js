'use strict';

// Simulator-unit tests for the centre power-button RGB LED.
// Drives _execCmd('hub_light') directly — same call site both Python
// (`hub.light.color(POWER, color.*)`) and Blockly (`flipperlight_centerButtonLight`)
// feed into.

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

test('hub_light: defaults to 0 (off) on a fresh sim', () => {
  const sim = createSim();
  assert.strictEqual(sim.robot.centreLight, 0);
});

test('hub_light: setting POWER to a color stores the int', async () => {
  const sim = createSim();
  await sim._execCmd({ type: 'hub_light', light: 0, color: 9 }); // RED
  assert.strictEqual(sim.robot.centreLight, 9);
});

test('hub_light: setting POWER to 0 turns it off', async () => {
  const sim = createSim();
  await sim._execCmd({ type: 'hub_light', light: 0, color: 6 });
  await sim._execCmd({ type: 'hub_light', light: 0, color: 0 });
  assert.strictEqual(sim.robot.centreLight, 0);
});

test('hub_light: out-of-range colors clamp to off (matches color.UNKNOWN)', async () => {
  const sim = createSim();
  await sim._execCmd({ type: 'hub_light', light: 0, color: 6 });
  await sim._execCmd({ type: 'hub_light', light: 0, color: -1 }); // UNKNOWN
  assert.strictEqual(sim.robot.centreLight, 0);
  await sim._execCmd({ type: 'hub_light', light: 0, color: 99 });
  assert.strictEqual(sim.robot.centreLight, 0);
});

test('hub_light: CONNECT (light=1) does not touch the power-button state', async () => {
  // CLAUDE.md: only POWER drives the visible centre button; CONNECT is the
  // Bluetooth pairing indicator and has no on-canvas representation, so it
  // must leave centreLight alone (no accidental coupling).
  const sim = createSim();
  await sim._execCmd({ type: 'hub_light', light: 0, color: 6 }); // GREEN
  await sim._execCmd({ type: 'hub_light', light: 1, color: 9 }); // CONNECT → RED
  assert.strictEqual(sim.robot.centreLight, 6);
});

test('hub_light: marks the sim dirty so the canvas re-renders', async () => {
  const sim = createSim();
  sim._dirty = false;
  await sim._execCmd({ type: 'hub_light', light: 0, color: 3 });
  assert.strictEqual(sim._dirty, true);
});
