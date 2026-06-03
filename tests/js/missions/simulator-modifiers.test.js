'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

function withStubbedPhysics(sim) {
  const poses = [];
  sim.physics = {
    setKinematicVelocity: () => {},
    setKinematicPose: (body, x, y, angle) => poses.push({ x, y, angle }),
    step: () => ({ force_impulses: {} }),
    readPose: () => ({ x: sim.robot.x, y: sim.robot.y, angle: sim.robot.heading * Math.PI / 180 }),
    castRay: () => ({ hit: false }),
  };
  sim.robotBody = { GetAngle: () => 0 };
  sim._physicsReady = Promise.resolve();
  sim.isRunning = true;
  return poses;
}

test('simulator: _frictionMultiplier defaults to 1.0', () => {
  const sim = createSim();
  assert.strictEqual(sim._frictionMultiplier, 1.0);
});

test('simulator: setFrictionMultiplier stores the value', () => {
  const sim = createSim();
  sim.setFrictionMultiplier(0.7);
  assert.strictEqual(sim._frictionMultiplier, 0.7);
});

test('simulator: setFrictionMultiplier ignores non-finite values', () => {
  const sim = createSim();
  sim.setFrictionMultiplier(NaN);
  assert.strictEqual(sim._frictionMultiplier, 1.0);
});

test('simulator: _pokeFlashUntilMs defaults to 0', () => {
  const sim = createSim();
  assert.strictEqual(sim._pokeFlashUntilMs, 0);
});

test('simulator: applyPoke shifts robot position and heading', () => {
  const sim = createSim();
  withStubbedPhysics(sim);
  sim.robot.x = 500; sim.robot.y = 500; sim.robot.heading = 0;
  sim.applyPoke(10, 20, 5);
  assert.strictEqual(sim.robot.x, 510);
  assert.strictEqual(sim.robot.y, 520);
  assert.strictEqual(sim.robot.heading, 5);
  assert.strictEqual(sim._dirty, true);
});

test('simulator: applyPoke sets _pokeFlashUntilMs ~300ms in the future', () => {
  const sim = createSim();
  withStubbedPhysics(sim);
  const before = Date.now();
  sim.applyPoke(0, 0, 0);
  assert.ok(sim._pokeFlashUntilMs >= before + 290, 'flash should expire ~300ms from now');
  assert.ok(sim._pokeFlashUntilMs <= before + 350, 'flash should not be too far in future');
});

test('simulator: applyPoke is a no-op when isRunning is false', () => {
  const sim = createSim();
  withStubbedPhysics(sim);
  sim.isRunning = false;
  sim.robot.x = 500;
  sim.applyPoke(10, 0, 0);
  assert.strictEqual(sim.robot.x, 500, 'position must not change when not running');
  assert.strictEqual(sim._pokeFlashUntilMs, 0, 'flash must not be set when not running');
});

test('simulator: applyPoke syncs Box2D pose', () => {
  const sim = createSim();
  const poses = withStubbedPhysics(sim);
  sim.robot.x = 500; sim.robot.y = 500; sim.robot.heading = 90;
  sim.applyPoke(10, 0, 0);
  assert.strictEqual(poses.length, 1, 'setKinematicPose should be called once');
  assert.strictEqual(poses[0].x, 510);
  assert.strictEqual(poses[0].y, 500);
});

test('simulator: reset clears _frictionMultiplier to 1.0', () => {
  const sim = createSim();
  withStubbedPhysics(sim);
  sim.setFrictionMultiplier(0.5);
  sim.reset();
  assert.strictEqual(sim._frictionMultiplier, 1.0);
});
