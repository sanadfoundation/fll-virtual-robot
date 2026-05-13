'use strict';

// Regression cover for issue #14: _sensorPosition used to compute a point
// 88 mm BEHIND the robot centre at every heading, so colour sensor reads
// triggered on whatever the wheels had just driven over. The corrected
// formula mirrors _distanceSensorMount: 88 mm forward along heading.

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

const OFFSET_MM = 88;  // ROBOT_BODY_H/2 - 12

function near(a, b, tol = 0.01) {
  return Math.abs(a - b) <= tol;
}

test('_sensorPosition: 88 mm forward of centre when heading north', () => {
  const sim = createSim();  // spawn (350, 163, 90°)
  const p = sim._sensorPosition(sim.robot);
  assert.ok(near(p.x, 350),               `x=${p.x}, expected ≈ 350`);
  assert.ok(near(p.y, 163 + OFFSET_MM),   `y=${p.y}, expected ≈ ${163 + OFFSET_MM}`);
});

test('_sensorPosition: 88 mm east of centre when heading east', () => {
  const sim = createSim();
  sim.robot.heading = 0;
  const p = sim._sensorPosition(sim.robot);
  assert.ok(near(p.x, 350 + OFFSET_MM), `x=${p.x}, expected ≈ ${350 + OFFSET_MM}`);
  assert.ok(near(p.y, 163),             `y=${p.y}, expected ≈ 163`);
});

test('_sensorPosition: 88 mm west of centre when heading west', () => {
  const sim = createSim();
  sim.robot.heading = 180;
  const p = sim._sensorPosition(sim.robot);
  assert.ok(near(p.x, 350 - OFFSET_MM), `x=${p.x}, expected ≈ ${350 - OFFSET_MM}`);
  assert.ok(near(p.y, 163),             `y=${p.y}, expected ≈ 163`);
});

test('_sensorPosition: 88 mm south of centre when heading south', () => {
  const sim = createSim();
  sim.robot.heading = 270;
  const p = sim._sensorPosition(sim.robot);
  assert.ok(near(p.x, 350),             `x=${p.x}, expected ≈ 350`);
  assert.ok(near(p.y, 163 - OFFSET_MM), `y=${p.y}, expected ≈ ${163 - OFFSET_MM}`);
});

test('_sensorPosition: matches _distanceSensorMount at every cardinal heading', () => {
  // Both mounts are 88 mm forward along heading; the colour-sensor function
  // returns just {x, y} while the distance-sensor function adds an angleRad.
  // After the fix, the (x, y) pair should agree exactly.
  const sim = createSim();
  for (const h of [0, 45, 90, 135, 180, 225, 270, 315]) {
    sim.robot.heading = h;
    const a = sim._sensorPosition(sim.robot);
    const b = sim._distanceSensorMount(sim.robot);
    assert.ok(near(a.x, b.x), `heading=${h}: x mismatch (color=${a.x}, dist=${b.x})`);
    assert.ok(near(a.y, b.y), `heading=${h}: y mismatch (color=${a.y}, dist=${b.y})`);
  }
});

test('_sensorPosition: heading 45° projects forward along the diagonal', () => {
  // sin(45°) ≈ cos(45°) ≈ 0.7071 → offset ≈ 88 × 0.7071 ≈ 62.23 on each axis.
  const sim = createSim();
  sim.robot.heading = 45;
  const p = sim._sensorPosition(sim.robot);
  const expected = OFFSET_MM * Math.SQRT1_2;  // ≈ 62.225
  assert.ok(near(p.x - 350, expected, 0.1), `Δx=${p.x - 350}, expected ≈ ${expected}`);
  assert.ok(near(p.y - 163, expected, 0.1), `Δy=${p.y - 163}, expected ≈ ${expected}`);
});
