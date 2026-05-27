'use strict';

// Simulator-unit behaviour tests for continuous-motion steering through real
// _animateTank with a kinematic-physics stub. The dispatch tests
// (dispatch-extra.test.js) cover the leftV/rightV math at the _execCmd
// boundary by stubbing _animateTank; these tests close the loop by letting
// the motion loop actually run and asserting on body pose afterward.
//
// Audit ref: 2026-05-13 §4.1 — _execCmd 'start' used to drop cmd.steering.
//
// `case 'start'` is fire-and-forget Infinity (#10), so the dispatcher returns
// immediately and the motion ticks in the background. We pump a fixed number
// of integrator steps via a counting-sleep stub, then stop and assert. This
// is deterministic and replaces the old "wait for the 200mm cap to finish"
// timing.

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');
const { installKinematicPhysics } = require('../kinematic-physics');

// Steps to pump before stopping — enough for the integrator to accumulate a
// measurable heading change at speed=500. Each step advances physDt_s ≈ 16ms
// of simulated time; angVel for speed=500/steering=±50 is about 1.1 rad/s, so
// 30 steps ≈ 30°.
const STEPS_TO_PUMP = 30;

function freshSim() {
  const sim = createSim();
  installKinematicPhysics(sim);
  sim.isRunning = true;
  return sim;
}

// Stub _sleep with a counter so _animateTank's per-iteration await resolves
// instantly. Tests pump the microtask queue until enough iterations have run.
function countingSleep(sim) {
  const state = { steps: 0 };
  sim._sleep = async () => { state.steps += 1; };
  return state;
}

async function pumpAndStop(sim, sleepState, n = STEPS_TO_PUMP) {
  while (sleepState.steps < n) await Promise.resolve();
  await sim._execCmd({ type: 'stop', pair_id: 0 });
  if (sim._motionPromise) {
    try { await sim._motionPromise; } catch (_) { /* swallow */ }
  }
}

test('start: positive steering rotates body CW (heading decreases, math-y-up)', async () => {
  const sim = freshSim();
  const sleepState = countingSleep(sim);
  await sim._execCmd({ type: 'pair', pair_id: 0, left: 'A', right: 'B' });
  const startHeading = sim.robot.heading;
  await sim._execCmd({ type: 'start', pair_id: 0, speed: 500, steering: 50 });
  await pumpAndStop(sim, sleepState);
  assert.ok(sim.robot.heading < startHeading,
    `right steering ⇒ CW; start=${startHeading}, end=${sim.robot.heading}`);
});

test('start: negative steering rotates body CCW', async () => {
  const sim = freshSim();
  const sleepState = countingSleep(sim);
  await sim._execCmd({ type: 'pair', pair_id: 0, left: 'A', right: 'B' });
  const startHeading = sim.robot.heading;
  await sim._execCmd({ type: 'start', pair_id: 0, speed: 500, steering: -50 });
  await pumpAndStop(sim, sleepState);
  assert.ok(sim.robot.heading > startHeading,
    `left steering ⇒ CCW; start=${startHeading}, end=${sim.robot.heading}`);
});

test('start: zero steering keeps heading constant', async () => {
  const sim = freshSim();
  const sleepState = countingSleep(sim);
  await sim._execCmd({ type: 'pair', pair_id: 0, left: 'A', right: 'B' });
  const startHeading = sim.robot.heading;
  await sim._execCmd({ type: 'start', pair_id: 0, speed: 500, steering: 0 });
  await pumpAndStop(sim, sleepState);
  assert.ok(Math.abs(sim.robot.heading - startHeading) < 0.5,
    `straight motion shouldn't rotate; Δheading=${sim.robot.heading - startHeading}`);
});
