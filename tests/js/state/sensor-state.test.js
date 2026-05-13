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
  assert.strictEqual(state.yaw_dDeg,    0);
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

test('_sensorState: includes force_dn / force_pressed / force_raw', () => {
  const sim = createSim();
  const s = sim._sensorState();
  assert.ok('force_dn'      in s, 'force_dn key present');
  assert.ok('force_pressed' in s, 'force_pressed key present');
  assert.ok('force_raw'     in s, 'force_raw key present');
});

test('_sensorState: zero forceN → 0 / false / 0', () => {
  const s = createSim()._sensorState();
  assert.strictEqual(s.force_dn,      0);
  assert.strictEqual(s.force_pressed, false);
  assert.strictEqual(s.force_raw,     0);
});

test('_sensorState: 5 N → 50 / true / ~2047', () => {
  const sim = createSim();
  sim.robot.sensors.forceN = 5;
  const s = sim._sensorState();
  assert.strictEqual(s.force_dn,      50);
  assert.strictEqual(s.force_pressed, true);
  assert.ok(s.force_raw >= 2040 && s.force_raw <= 2055, `raw=${s.force_raw}`);
});

test('_sensorState: includes reflection key (default colorValue=none → 50)', () => {
  const s = createSim()._sensorState();
  assert.strictEqual(s.reflection, 50);
});

test('_sensorState: reflection over black is 5', () => {
  const sim = createSim();
  sim.robot.sensors.colorValue = 'black';
  assert.strictEqual(sim._sensorState().reflection, 5);
});

test('_sensorState: reflection over white is 90', () => {
  const sim = createSim();
  sim.robot.sensors.colorValue = 'white';
  assert.strictEqual(sim._sensorState().reflection, 90);
});

test('_sensorState: reflection over yellow is 75', () => {
  const sim = createSim();
  sim.robot.sensors.colorValue = 'yellow';
  assert.strictEqual(sim._sensorState().reflection, 75);
});
