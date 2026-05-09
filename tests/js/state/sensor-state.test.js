'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

test('_sensorState: returns correct initial values', () => {
  const sim   = createSim();
  const state = sim._sensorState();
  assert.strictEqual(state.x,           350);
  assert.strictEqual(state.y,           163);
  assert.strictEqual(state.heading,     90);
  assert.strictEqual(state.color,       'none');
  assert.strictEqual(state.distance_mm, 9999);
  assert.strictEqual(state.stopped,     false);
  for (const port of ['A', 'B', 'C', 'D', 'E', 'F']) {
    assert.strictEqual(state.motors[port], 0, `motors.${port}`);
  }
});

test('_sensorState: motors is a copy, not a reference', () => {
  const sim   = createSim();
  const state = sim._sensorState();
  state.motors.A = 999;
  assert.strictEqual(sim.robot.motors.A, 0);
});

test('_sensorState: reflects updated robot position', () => {
  const sim = createSim();
  sim.robot.x = 700;
  sim.robot.y = 500;
  sim.robot.heading = 45;
  const state = sim._sensorState();
  assert.strictEqual(state.x,       700);
  assert.strictEqual(state.y,       500);
  assert.strictEqual(state.heading, 45);
});
