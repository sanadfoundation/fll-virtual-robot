'use strict';

// Simulator-unit behaviour tests for continuous-motion steering through real
// _animateTank with a kinematic-physics stub. The dispatch tests
// (dispatch-extra.test.js) cover the leftV/rightV math at the _execCmd
// boundary by stubbing _animateTank; these tests close the loop by letting
// the motion loop actually run and asserting on body pose afterward.
//
// Audit ref: 2026-05-13 §4.1 — _execCmd 'start' used to drop cmd.steering.

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');
const { installKinematicPhysics } = require('../kinematic-physics');

function freshSim() {
  const sim = createSim();
  installKinematicPhysics(sim);
  sim.isRunning = true;
  return sim;
}

test('start: positive steering rotates body CW (heading decreases, math-y-up)', async () => {
  const sim = freshSim();
  await sim._execCmd({ type: 'pair', pair_id: 0, left: 'A', right: 'B' });
  const startHeading = sim.robot.heading;
  await sim._execCmd({ type: 'start', pair_id: 0, speed: 500, steering: 50 });
  assert.ok(sim.robot.heading < startHeading,
    `right steering ⇒ CW; start=${startHeading}, end=${sim.robot.heading}`);
});

test('start: negative steering rotates body CCW', async () => {
  const sim = freshSim();
  await sim._execCmd({ type: 'pair', pair_id: 0, left: 'A', right: 'B' });
  const startHeading = sim.robot.heading;
  await sim._execCmd({ type: 'start', pair_id: 0, speed: 500, steering: -50 });
  assert.ok(sim.robot.heading > startHeading,
    `left steering ⇒ CCW; start=${startHeading}, end=${sim.robot.heading}`);
});

test('start: zero steering keeps heading constant', async () => {
  const sim = freshSim();
  await sim._execCmd({ type: 'pair', pair_id: 0, left: 'A', right: 'B' });
  const startHeading = sim.robot.heading;
  await sim._execCmd({ type: 'start', pair_id: 0, speed: 500, steering: 0 });
  assert.ok(Math.abs(sim.robot.heading - startHeading) < 0.5,
    `straight motion shouldn't rotate; Δheading=${sim.robot.heading - startHeading}`);
});
