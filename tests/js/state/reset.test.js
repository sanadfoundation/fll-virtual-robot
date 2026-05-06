'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

test('initial state: x=350, y=980, heading=-90', () => {
  const sim = createSim();
  assert.strictEqual(sim.robot.x, 350);
  assert.strictEqual(sim.robot.y, 980);
  assert.strictEqual(sim.robot.heading, -90);
});

test('initial state: all 25 display pixels are 0', () => {
  const display = createSim().robot.display;
  assert.strictEqual(display.length, 25);
  assert.ok(display.every(v => v === 0));
});

test('initial state: all motor positions are 0', () => {
  const motors = createSim().robot.motors;
  for (const port of ['A', 'B', 'C', 'D', 'E', 'F']) {
    assert.strictEqual(motors[port], 0, `motors.${port}`);
  }
});

test('reset(): restores position, heading, trail, and pairMap', () => {
  const sim = createSim();
  sim.robot.x = 1000;
  sim.robot.y = 500;
  sim.robot.heading = 45;
  sim.pairMap  = { 0: { left: 'A', right: 'B' } };
  sim.trail.push({ x: 1000, y: 500 });

  sim.reset();

  assert.strictEqual(sim.robot.x, 350);
  assert.strictEqual(sim.robot.y, 980);
  assert.strictEqual(sim.robot.heading, -90);
  assert.strictEqual(Object.keys(sim.pairMap).length, 0);
  assert.strictEqual(sim.trail.length, 1);
});

test('reset(): isRunning set to false', () => {
  const sim = createSim();
  sim.isRunning = true;
  sim.reset();
  assert.strictEqual(sim.isRunning, false);
});

test('_clampRobot: x clamped to [0, 2362]', () => {
  const sim = createSim();
  sim.robot.x = -10;
  sim._clampRobot();
  assert.strictEqual(sim.robot.x, 0);

  sim.robot.x = 9999;
  sim._clampRobot();
  assert.strictEqual(sim.robot.x, 2362);
});

test('_clampRobot: y clamped to [0, 1143]', () => {
  const sim = createSim();
  sim.robot.y = -5;
  sim._clampRobot();
  assert.strictEqual(sim.robot.y, 0);

  sim.robot.y = 9999;
  sim._clampRobot();
  assert.strictEqual(sim.robot.y, 1143);
});

test('_clampRobot: in-bounds values are unchanged', () => {
  const sim = createSim();
  sim.robot.x = 1181;
  sim.robot.y = 571;
  sim._clampRobot();
  assert.strictEqual(sim.robot.x, 1181);
  assert.strictEqual(sim.robot.y, 571);
});
