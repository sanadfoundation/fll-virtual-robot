'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

test('_sensorState includes yaw_dDeg = 0 right after reset', () => {
  const sim = createSim();
  sim.reset();
  const s = sim._sensorState();
  assert.strictEqual(s.yaw_dDeg, 0);
});

test('yaw_dDeg = -CCW * 10: heading rotates +30° (CCW) → yaw -300 dDeg', () => {
  const sim = createSim();
  sim.reset();   // capture spawn heading=90 as zero
  sim.robot.heading = 90 + 30;   // CCW 30° from spawn
  const s = sim._sensorState();
  assert.strictEqual(s.yaw_dDeg, -300);
});

test('yaw_dDeg wraps into [-1800, 1800]', () => {
  const sim = createSim();
  sim.reset();
  sim.robot.heading = 90 + 200;   // 200° CCW from zero
  const s = sim._sensorState();
  assert.ok(s.yaw_dDeg >= -1800 && s.yaw_dDeg <= 1800,
    `expected wrap to [-1800,1800], got ${s.yaw_dDeg}`);
  // 200° CCW heading delta → -2000 dDeg unwrapped → wraps to +1600 dDeg in LEGO frame
  assert.strictEqual(s.yaw_dDeg, 1600);
});
