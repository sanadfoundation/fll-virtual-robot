'use strict';

// Regression: "start motor" blocks (and Python motor.run) used to terminate
// after a fixed distance — 5000mm for the Blockly generators
// (flippermotor_motorStartDirection, flippermoremotor_motorStartPower) and
// 180mm for the Python motor.run case in _execCmd. Both stops were visible
// to the user: the motor would spin for a few seconds, then halt on its own
// even with no stop block / motor.stop() call.
//
// The fix: pass refDistMM = Infinity. _animateTank's for-loop iterates while
// `i < Infinity` and only breaks on `!isRunning` or `_motionAborted`. The
// aux-motor branch in _animateSingleMotor (non-drive port) gets a parallel
// continuous loop that ticks encoders per step instead of crediting one
// finite chunk up front.

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

function countingSleep(sim) {
  const state = { steps: 0 };
  sim._sleep = async () => { state.steps += 1; };
  return state;
}

// ── Drive-motor continuous (routes through _animateTank) ────────────────────

test('drive-motor Infinity runs many iterations without self-terminating', async () => {
  // The pre-fix 5000mm hack ran ~614 steps and stopped. Infinity should run
  // indefinitely; we cap with a manual abort to keep the test finite.
  const sim = createSim();
  withStubbedPhysics(sim);
  const sleepState = countingSleep(sim);

  const bg = sim._animateSingleMotor('A', 0.75, Infinity);

  // Pump the microtask queue until we've observed a lot more iterations than
  // the old fixed-distance bound would have allowed.
  while (sleepState.steps < 1000) await Promise.resolve();
  assert.ok(sleepState.steps >= 1000,
    `Infinity motion should not self-terminate, ran ${sleepState.steps} steps`);

  // Clean up so the test process can exit.
  await sim._motorStopAndAwait('A');
  await bg;
});

test('drive-motor Infinity terminates promptly when isRunning flips false', async () => {
  const sim = createSim();
  withStubbedPhysics(sim);
  const sleepState = countingSleep(sim);

  const bg = sim._animateSingleMotor('A', 0.75, Infinity);
  while (sleepState.steps < 3) await Promise.resolve();

  sim.isRunning = false;
  await bg;

  // The loop breaks at the top of the iteration after isRunning flipped,
  // so steps stays at the count it reached when we set the flag.
  assert.ok(sleepState.steps >= 3 && sleepState.steps < 20,
    `should break shortly after isRunning=false, ran ${sleepState.steps} steps`);
});

test('drive-motor Infinity terminates on _motorStopAndAwait of the matching port', async () => {
  const sim = createSim();
  withStubbedPhysics(sim);
  const sleepState = countingSleep(sim);

  const bg = sim._animateSingleMotor('A', 0.75, Infinity);
  while (sleepState.steps < 3) await Promise.resolve();

  await sim._motorStopAndAwait('A');
  await bg;

  assert.strictEqual(sim._activeMotion, null);
  assert.strictEqual(sim._motionPromise, null);
});

// ── Aux-motor continuous (no _animateTank — manual sleep loop) ──────────────

test('aux-motor Infinity ticks encoders per step instead of one finite chunk', async () => {
  // Pre-fix aux-motor branch credited (distMM / WHEEL_CIRC_MM) * 360 ° up
  // front — with Infinity that would write Infinity to robot.motors[port].
  // New branch accumulates a finite per-step amount each iteration.
  const sim = createSim();
  withStubbedPhysics(sim);
  sim._portConfig.C = { kind: 'motor' };  // re-wire C as an aux motor
  const sleepState = countingSleep(sim);

  const bg = sim._animateSingleMotor('C', 0.5, Infinity);
  while (sleepState.steps < 5) await Promise.resolve();

  const enc = sim.robot.motors.C || 0;
  assert.ok(Number.isFinite(enc), `aux encoder must stay finite, got ${enc}`);
  assert.ok(enc > 0, `aux encoder should accumulate, got ${enc}`);

  await sim._motorStopAndAwait('C');
  await bg;
});

test('aux-motor Infinity halts on _motorStopAndAwait', async () => {
  const sim = createSim();
  withStubbedPhysics(sim);
  sim._portConfig.C = { kind: 'motor' };
  const sleepState = countingSleep(sim);

  const bg = sim._animateSingleMotor('C', 0.5, Infinity);
  while (sleepState.steps < 3) await Promise.resolve();
  await sim._motorStopAndAwait('C');
  await bg;

  assert.strictEqual(sim._activeMotion, null);
  assert.strictEqual(sim._motionPromise, null);
  // Velocity readout clears after the loop exits — motor.velocity() should
  // read 0 at rest.
  assert.strictEqual(sim.robot.motors_velocity.C, 0);
});

// ── Python motor_run case (fire-and-forget Infinity) ────────────────────────

test("case 'motor_run' is fire-and-forget — _execCmd returns before the motion finishes", async () => {
  const sim = createSim();
  withStubbedPhysics(sim);
  const sleepState = countingSleep(sim);

  // _execCmd resolves once the case body finishes; with fire-and-forget the
  // body sets up _activeMotion / _motionPromise synchronously and returns.
  await sim._execCmd({ type: 'motor_run', port: 'A', velocity: 1000 });

  assert.ok(sim._motionPromise, 'background motion should still be in flight');
  assert.ok(sim._activeMotion, '_activeMotion should be set');

  // Let it tick, then stop.
  while (sleepState.steps < 3) await Promise.resolve();
  await sim._motorStopAndAwait('A');
});

// ── Blockly generator emits Infinity, not a fixed distance ──────────────────

test('Blockly motorStartDirection / motorStartPower generators emit Infinity', () => {
  // Locking the generator output prevents a future "looks more readable"
  // change from re-introducing the fixed-distance hack.
  const { makeBlocklyEnv } = require('../mocks/blockly-env');
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  const { Blockly } = env;

  const block = {
    getFieldValue: (name) => {
      if (name === 'PORT') return 'A';
      if (name === 'DIRECTION') return 'counterclockwise';
      if (name === 'POWER') return null;
      return null;
    },
    getInputTargetBlock: () => null,
  };

  const direction = Blockly.JavaScript['flippermotor_motorStartDirection'](block);
  assert.ok(direction.includes('Infinity'),
    `motorStartDirection must emit Infinity, got: ${direction}`);
  assert.ok(!direction.trimStart().startsWith('await '),
    `motorStartDirection must stay fire-and-forget (no leading await), got: ${direction}`);

  const power = Blockly.JavaScript['flippermoremotor_motorStartPower'](block);
  assert.ok(power.includes('Infinity'),
    `motorStartPower must emit Infinity, got: ${power}`);
  assert.ok(!power.trimStart().startsWith('await '),
    `motorStartPower must stay fire-and-forget (no leading await), got: ${power}`);
});
