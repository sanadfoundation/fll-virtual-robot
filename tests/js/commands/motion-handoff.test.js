'use strict';

// Issue #47: Blockly programs that mix a single-motor "start motor" (fire-and-
// forget) with a subsequent motor_pair "move" left the simulator in a state
// where the next motion silently no-op'd. Two design gaps caused it:
//
//   1. Blockly's `move`/`steer` generators called sim._animateTank() directly,
//      bypassing _runMotion. _motionAborted (set true by the prior motor_stop)
//      was never cleared, so _animateTank's loop broke on the first iteration.
//   2. The Blockly `stop motor` generator only signalled abort — it returned
//      before the background _animateSingleMotor had actually unwound. The
//      next motion could begin while the prior one was still mid-flight.
//
// Fix is in two pieces:
//   - _runPairMotion(): a simulator helper that wraps _animateTank in
//     _runMotion with a proper pair descriptor. Blockly move/steer generators
//     route through it so _motionAborted is reset and encoders accumulate on
//     both wheels.
//   - _motorStopAndAwait() / _pairStopAndAwait(): signal abort, then await
//     the in-flight motion's promise. _runMotion now tracks _motionPromise
//     for this purpose. Blockly stop generators route through these so the
//     program waits for actual termination before the next block runs.

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

function withStubbedPhysics(sim) {
  sim.physics = {
    setKinematicVelocity: () => {},
    setKinematicPose: () => {},
    step: () => ({ force_impulses: {} }),
    readPose: () => ({ x: sim.robot.x, y: sim.robot.y, angle: 0 }),
    castRay: () => ({ hit: false }),
  };
  sim.robotBody = { GetAngle: () => 0 };
  sim._physicsReady = Promise.resolve();
  sim.isRunning = true;
}

test('issue #47: motor_stop then pair-move runs the new motion', async () => {
  const sim = createSim();
  withStubbedPhysics(sim);
  sim._sleep = async () => {};

  // Blockly: "A start motor CCW" — fire-and-forget single-motor animation.
  const bg = sim._animateSingleMotor('A', 0.5, 5000);
  await Promise.resolve(); await Promise.resolve();

  // Blockly: "A stop motor" — must abort the background AND wait for unwind.
  await sim._motorStopAndAwait('A');

  assert.strictEqual(sim._activeMotion, null,
    'background motion should have fully unwound');
  assert.strictEqual(sim._motionPromise, null,
    'motion promise should be cleared');
  await bg; // confirm the dropped promise resolved cleanly

  // Blockly: "set movement motors to A+B" then "move ↑ for 2 rotations" —
  // _runPairMotion wraps _animateTank in _runMotion with a pair descriptor.
  let stepsExecuted = 0;
  sim._sleep = async () => { stepsExecuted += 1; };

  await sim._runPairMotion('A', 'B', 0.5, 0.5, 100);

  assert.ok(stepsExecuted > 0,
    `forward move should execute physics steps, ran ${stepsExecuted}`);
});

test('_runPairMotion accumulates encoders on both wheels', async () => {
  const sim = createSim();
  withStubbedPhysics(sim);
  sim._sleep = async () => {};

  await sim._runPairMotion('A', 'B', 0.5, 0.5, 100);

  assert.ok(Math.abs(sim.robot.motors['A']) > 0,
    'left wheel A encoder should accumulate');
  assert.ok(Math.abs(sim.robot.motors['B']) > 0,
    'right wheel B encoder should accumulate');
});

test('_motorStopAndAwait waits for the in-flight motion before returning', async () => {
  const sim = createSim();
  withStubbedPhysics(sim);

  // _sleep returns a promise we resolve manually so we can interleave.
  let resolveSleep;
  let sleepCount = 0;
  sim._sleep = () => {
    sleepCount += 1;
    return new Promise(r => { resolveSleep = r; });
  };

  const bg = sim._animateSingleMotor('A', 0.5, 5000);
  // Let _runMotion + _animateTank's prelude run until the first _sleep.
  while (sleepCount < 1) await Promise.resolve();

  let stopReturned = false;
  const stopP = sim._motorStopAndAwait('A').then(() => { stopReturned = true; });

  // Stop has set _motionAborted but bg is still mid-_sleep — stop must wait.
  await Promise.resolve(); await Promise.resolve();
  assert.strictEqual(stopReturned, false,
    'stop should still be waiting on the background motion');

  // Resolve the sleep; bg's loop sees the abort flag, breaks, unwinds.
  resolveSleep();

  await stopP;
  assert.strictEqual(stopReturned, true);
  assert.strictEqual(sim._activeMotion, null);
  assert.strictEqual(sim._motionPromise, null);
  await bg;
});

test('_motorStopAndAwait on a port not in active motion is a no-op', async () => {
  const sim = createSim();
  withStubbedPhysics(sim);
  sim._sleep = async () => {};

  // No active motion.
  await sim._motorStopAndAwait('A');
  assert.strictEqual(sim._motionAborted, false);
  assert.strictEqual(sim._activeMotion, null);
  assert.strictEqual(sim._motionPromise, null);
});

test('_pairStopAndAwait aborts and awaits the active pair motion', async () => {
  const sim = createSim();
  withStubbedPhysics(sim);

  let resolveSleep;
  let sleepCount = 0;
  sim._sleep = () => {
    sleepCount += 1;
    return new Promise(r => { resolveSleep = r; });
  };

  // Start a fire-and-forget pair motion (Blockly "start moving forward").
  const bg = sim._runPairMotion('A', 'B', 0.5, 0.5, 5000);
  while (sleepCount < 1) await Promise.resolve();

  let stopReturned = false;
  const stopP = sim._pairStopAndAwait().then(() => { stopReturned = true; });

  await Promise.resolve(); await Promise.resolve();
  assert.strictEqual(stopReturned, false);

  resolveSleep();
  await stopP;

  assert.strictEqual(stopReturned, true);
  assert.strictEqual(sim._activeMotion, null);
  assert.strictEqual(sim._motionPromise, null);
  await bg;
});

// Repeated fire-and-forget pair motions (Blockly's `start_dual_speed` /
// `start_move` / `start_steer` inside a forever loop) used to stack: each
// new call kicked off another `_animateTank` while the previous one was
// still iterating. Each animateTank steps physics on its own wallStepMs
// cadence, so N concurrent loops advanced the body N× per real tick — a
// .llsp3 with `forever: start_dual_speed(50-yaw, 50+yaw)` teleported the
// robot from spawn into the wall in under 200 ms.
//
// Contract: `_runMotion` must preempt any in-flight motion before starting
// the next one, so at most one `_animateTank` is alive at any time.
test('runaway-guard: repeated _runPairMotion preempts in-flight motion', async () => {
  const sim = createSim();
  withStubbedPhysics(sim);
  sim._sleep = () => Promise.resolve();

  let active = 0;
  let maxActive = 0;
  const realAnimateTank = sim._animateTank.bind(sim);
  sim._animateTank = async (lv, rv, distMM) => {
    active += 1;
    if (active > maxActive) maxActive = active;
    try {
      await realAnimateTank(lv, rv, distMM);
    } finally {
      active -= 1;
    }
  };

  // Fire-and-forget burst, mirroring `while(isRunning) { start_dual_speed(...); await sleep(0); }`.
  for (let i = 0; i < 20; i += 1) {
    sim._runPairMotion('A', 'B', 0.5, 0.5, 5000);
    await Promise.resolve();
  }
  await sim._pairStopAndAwait();

  assert.strictEqual(maxActive, 1,
    `_runMotion must preempt in-flight motion so only one _animateTank loop ` +
    `runs at a time (otherwise concurrent loops compound physics.step calls ` +
    `and the body teleports). Saw maxActive=${maxActive}.`);
});
