'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// 88 mm = ROBOT_BODY_H/2 - 12 = 100 - 12. Math y-up: heading 0=east, 90=north,
// 180=west, 270=south. Mount = robot + 88 × (cos(heading), sin(heading)).

test('_distanceSensorMount: heading 0° (east) → 88 mm east of center', () => {
  const sim = createSim();
  sim.robot.x = 1000; sim.robot.y = 500; sim.robot.heading = 0;
  const m = sim._distanceSensorMount(sim.robot);
  assert.ok(close(m.x, 1088, 1e-6), `m.x=${m.x}`);
  assert.ok(close(m.y, 500,  1e-6), `m.y=${m.y}`);
  assert.ok(close(m.angleRad, 0));
});

test('_distanceSensorMount: heading 90° (north) → 88 mm north of center', () => {
  const sim = createSim();
  sim.robot.x = 1000; sim.robot.y = 500; sim.robot.heading = 90;
  const m = sim._distanceSensorMount(sim.robot);
  assert.ok(close(m.x, 1000, 1e-6), `m.x=${m.x}`);
  assert.ok(close(m.y, 588,  1e-6), `m.y=${m.y}`);
  assert.ok(close(m.angleRad, Math.PI / 2));
});

test('_distanceSensorMount: heading 180° (west) → 88 mm west of center', () => {
  const sim = createSim();
  sim.robot.x = 1000; sim.robot.y = 500; sim.robot.heading = 180;
  const m = sim._distanceSensorMount(sim.robot);
  assert.ok(close(m.x, 912, 1e-6), `m.x=${m.x}`);
  assert.ok(close(m.y, 500, 1e-6), `m.y=${m.y}`);
  assert.ok(close(m.angleRad, Math.PI));
});

test('_distanceSensorMount: heading 270° (south) → 88 mm south of center', () => {
  const sim = createSim();
  sim.robot.x = 1000; sim.robot.y = 500; sim.robot.heading = 270;
  const m = sim._distanceSensorMount(sim.robot);
  assert.ok(close(m.x, 1000, 1e-6), `m.x=${m.x}`);
  assert.ok(close(m.y, 412,  1e-6), `m.y=${m.y}`);
  assert.ok(close(m.angleRad, 3 * Math.PI / 2));
});

test('_distanceSensorMount: default spawn (350, 163) heading 90° → mount at (350, 251)', () => {
  // Sanity check against the spec's worked example.
  // Default heading is 90 (north) from makeRobotState; default x=350, y=163.
  const sim = createSim();
  const m = sim._distanceSensorMount(sim.robot);
  assert.ok(close(m.x, 350, 1e-6));
  assert.ok(close(m.y, 251, 1e-6));
});
