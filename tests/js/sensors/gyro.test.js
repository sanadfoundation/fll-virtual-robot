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

test('resetYaw(): zeroes yaw at the current heading without rotating the robot', () => {
  const sim = createSim();
  sim.robot.heading = 45;             // some random heading
  sim.resetYaw();
  assert.strictEqual(sim.getYaw(), 0);
  assert.strictEqual(sim.robot.heading, 45, 'reset must not physically rotate');
});

test('getYaw(): returns degrees (CW positive), range -180..180', () => {
  const sim = createSim();
  sim.robot.heading = 90;
  sim.resetYaw();

  sim.robot.heading = 90 - 30;        // 30° CW from zero → +30
  assert.strictEqual(sim.getYaw(), 30);

  sim.robot.heading = 90 + 30;        // 30° CCW → -30
  assert.strictEqual(sim.getYaw(), -30);

  sim.robot.heading = 90 + 200;       // 200° CCW unwrapped → -200 → wraps to +160
  assert.strictEqual(sim.getYaw(), 160);
});

test('resetYaw(degrees): sets yaw to the supplied value without rotating', () => {
  const sim = createSim();
  sim.robot.heading = 90;
  sim.resetYaw(45);                   // declare "yaw is now 45° here"
  assert.strictEqual(sim.getYaw(), 45);
  assert.strictEqual(sim.robot.heading, 90, 'reset must not physically rotate');
});

test('_execCmd({type:reset_yaw}) routes through resetYaw', async () => {
  const sim = createSim();
  sim.robot.heading = 90;
  await sim._execCmd({ type: 'reset_yaw', angle_dDeg: 0 });
  let s = sim._sensorState();
  assert.strictEqual(s.yaw_dDeg, 0);

  sim.robot.heading = 120;             // CCW 30°
  s = sim._sensorState();
  assert.strictEqual(s.yaw_dDeg, -300);

  await sim._execCmd({ type: 'reset_yaw', angle_dDeg: 900 });   // 90°
  s = sim._sensorState();
  assert.strictEqual(s.yaw_dDeg, 900);
});
