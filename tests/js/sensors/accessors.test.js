'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

test('getColorSensorColor: returns robot.sensors.colorValue (default "none")', () => {
  const sim = createSim();
  assert.strictEqual(sim.getColorSensorColor(), 'none');
});

test('getColorSensorColor: reflects robot.sensors.colorValue', () => {
  const sim = createSim();
  sim.robot.sensors.colorValue = 'black';
  assert.strictEqual(sim.getColorSensorColor(), 'black');
});

test('getColorSensorReflection: returns 50 (hardcoded stub)', () => {
  assert.strictEqual(createSim().getColorSensorReflection(), 50);
});

test('getColorSensorAmbient: returns 30 (hardcoded stub)', () => {
  assert.strictEqual(createSim().getColorSensorAmbient(), 30);
});

test('getColorSensorRGB: returns [128, 128, 128]', () => {
  const rgb = createSim().getColorSensorRGB();
  assert.strictEqual(rgb[0], 128);
  assert.strictEqual(rgb[1], 128);
  assert.strictEqual(rgb[2], 128);
  assert.strictEqual(rgb.length, 3);
});

test('getDistanceSensorValue: returns robot.sensors.distanceMM (default 300)', () => {
  assert.strictEqual(createSim().getDistanceSensorValue(), 300);
});

test('getDistanceSensorValue: reflects updated distanceMM', () => {
  const sim = createSim();
  sim.robot.sensors.distanceMM = 50;
  assert.strictEqual(sim.getDistanceSensorValue(), 50);
});

test('getDistanceSensorPresence: false when distanceMM >= 100', () => {
  const sim = createSim();
  assert.strictEqual(sim.getDistanceSensorPresence(), false);
});

test('getDistanceSensorPresence: true when distanceMM < 100', () => {
  const sim = createSim();
  sim.robot.sensors.distanceMM = 99;
  assert.strictEqual(sim.getDistanceSensorPresence(), true);
});

test('robot.sensors.distanceHit: defaults to null', () => {
  assert.strictEqual(createSim().robot.sensors.distanceHit, null);
});

test('robot.sensors.distanceOrigin: defaults to null', () => {
  assert.strictEqual(createSim().robot.sensors.distanceOrigin, null);
});

test('getForceSensorValue: returns 0', () => {
  assert.strictEqual(createSim().getForceSensorValue(), 0);
});

test('getForceSensorPressed: returns false', () => {
  assert.strictEqual(createSim().getForceSensorPressed(), false);
});

test('getMotorSpeed: returns 0 for any port', () => {
  const sim = createSim();
  assert.strictEqual(sim.getMotorSpeed('A'), 0);
  assert.strictEqual(sim.getMotorSpeed('F'), 0);
});

test('getMotorPosition: returns 0 for unpaired port', () => {
  assert.strictEqual(createSim().getMotorPosition('A'), 0);
});

test('getColorSensorColorInt: returns -1 for "none" (default)', () => {
  assert.strictEqual(createSim().getColorSensorColorInt(), -1);
});

test('getColorSensorColorInt: returns 0 for "black"', () => {
  const sim = createSim();
  sim.robot.sensors.colorValue = 'black';
  assert.strictEqual(sim.getColorSensorColorInt(), 0);
});

test('getColorSensorColorInt: returns 9 for "red"', () => {
  const sim = createSim();
  sim.robot.sensors.colorValue = 'red';
  assert.strictEqual(sim.getColorSensorColorInt(), 9);
});

test('getColorSensorColorInt: returns 6 for "green"', () => {
  const sim = createSim();
  sim.robot.sensors.colorValue = 'green';
  assert.strictEqual(sim.getColorSensorColorInt(), 6);
});
