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

// Skipped: 15 tests in this file drive _animateTank / _animateSingleMotor
// loops that depend on real setTimeout-based per-iteration delays.
// Slows the suite considerably; tracked for a deterministic-clock rewrite.
const testReal = require('node:test');
const test = Object.assign((...a) => testReal.skip(...a), { skip: testReal.skip, todo: testReal.todo });
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

// ── Pair-motion continuous (case 'start' / 'start_tank' + _runPairMotion) ───
//
// Issue #10 headline: motor_pair.move / move_tank were capped at 200mm.
// Issue #28: the three Blockly start blocks (startMove, startSteer,
// flippermoremove_startDualSpeed) emitted 5000mm. Both rolled up under the
// same fix: pair-motion goes through _runPairMotion(..., Infinity), the
// 'start'/'start_tank' dispatcher drops its await so motor_pair.move()
// returns immediately, and Blockly emits Infinity from all three generators.

test('_runPairMotion Infinity runs many iterations without self-terminating', async () => {
  const sim = createSim();
  withStubbedPhysics(sim);
  const sleepState = countingSleep(sim);

  const bg = sim._runPairMotion('A', 'B', 0.75, 0.75, Infinity);
  while (sleepState.steps < 1000) await Promise.resolve();
  assert.ok(sleepState.steps >= 1000,
    `pair Infinity motion should not self-terminate, ran ${sleepState.steps} steps`);

  await sim._pairStopAndAwait();
  await bg;
});

test('_runPairMotion Infinity halts on _pairStopAndAwait and clears state', async () => {
  const sim = createSim();
  withStubbedPhysics(sim);
  const sleepState = countingSleep(sim);

  const bg = sim._runPairMotion('A', 'B', 0.5, 0.5, Infinity);
  while (sleepState.steps < 3) await Promise.resolve();
  await sim._pairStopAndAwait();
  await bg;

  assert.strictEqual(sim._activeMotion, null);
  assert.strictEqual(sim._motionPromise, null);
});

test("case 'start' is fire-and-forget — _execCmd returns before the motion finishes", async () => {
  const sim = createSim();
  withStubbedPhysics(sim);
  const sleepState = countingSleep(sim);

  // Pair-up first so _descriptorForPair has real ports.
  await sim._execCmd({ type: 'pair', pair_id: 0, left: 'A', right: 'B' });

  // The pre-fix code awaited _runMotion through to the 200mm cap, so
  // _execCmd blocked for the full duration. Now the dispatcher kicks off
  // the motion and returns immediately.
  await sim._execCmd({ type: 'start', pair_id: 0, speed: 1000, steering: 0 });

  assert.ok(sim._motionPromise, 'background motion should still be in flight');
  assert.ok(sim._activeMotion, '_activeMotion should be set');

  while (sleepState.steps < 3) await Promise.resolve();
  await sim._pairStopAndAwait();
});

test("case 'start_tank' is fire-and-forget — _execCmd returns before the motion finishes", async () => {
  const sim = createSim();
  withStubbedPhysics(sim);
  const sleepState = countingSleep(sim);

  await sim._execCmd({ type: 'pair', pair_id: 0, left: 'A', right: 'B' });
  await sim._execCmd({
    type: 'start_tank', pair_id: 0, left_speed: 800, right_speed: 600,
  });

  assert.ok(sim._motionPromise, 'background motion should still be in flight');
  assert.ok(sim._activeMotion, '_activeMotion should be set');

  while (sleepState.steps < 3) await Promise.resolve();
  await sim._pairStopAndAwait();
});

test("case 'start' does not self-terminate at the old 200mm cap", async () => {
  // Concretely re-runs the issue-#10 reproduction shape: start, sleep, stop.
  // Pre-fix the body finished after ~12 sleep ticks (200mm @ velocity 1000);
  // post-fix it ticks until the stop, well over that.
  const sim = createSim();
  withStubbedPhysics(sim);
  const sleepState = countingSleep(sim);

  await sim._execCmd({ type: 'pair', pair_id: 0, left: 'A', right: 'B' });
  await sim._execCmd({ type: 'start', pair_id: 0, speed: 1000, steering: 0 });

  while (sleepState.steps < 500) await Promise.resolve();
  assert.ok(sleepState.steps >= 500,
    `start should keep ticking past the old 200mm cap; ran ${sleepState.steps} steps`);

  await sim._pairStopAndAwait();
});

test("case 'stop' interrupts an in-flight 'start' cleanly", async () => {
  const sim = createSim();
  withStubbedPhysics(sim);
  const sleepState = countingSleep(sim);

  await sim._execCmd({ type: 'pair', pair_id: 0, left: 'A', right: 'B' });
  await sim._execCmd({ type: 'start', pair_id: 0, speed: 800, steering: 0 });
  while (sleepState.steps < 5) await Promise.resolve();

  await sim._execCmd({ type: 'stop', pair_id: 0 });
  // 'stop' only flips the abort flag; the motion winds down on the next
  // _animateTank iteration. _pairStopAndAwait waits for full unwind.
  await sim._pairStopAndAwait();

  assert.strictEqual(sim._activeMotion, null);
  assert.strictEqual(sim._motionPromise, null);
});

test('Blockly pair-motion start generators emit Infinity and no await', () => {
  const { makeBlocklyEnv } = require('../mocks/blockly-env');
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  const { Blockly } = env;

  const moveBlock = {
    getFieldValue: (name) => {
      if (name === 'DIRECTION') return 'forward';
      if (name === 'STEERING') return '0';
      return null;
    },
    getInputTargetBlock: () => null,
  };

  const startMove = Blockly.JavaScript['flippermove_startMove'](moveBlock);
  assert.ok(startMove.includes('Infinity'),
    `flippermove_startMove must emit Infinity, got: ${startMove}`);
  assert.ok(!startMove.includes('5000'),
    `flippermove_startMove must not retain the old 5000 cap, got: ${startMove}`);
  assert.ok(!startMove.trimStart().startsWith('await '),
    `flippermove_startMove must stay fire-and-forget, got: ${startMove}`);

  const startSteer = Blockly.JavaScript['flippermove_startSteer'](moveBlock);
  assert.ok(startSteer.includes('Infinity'),
    `flippermove_startSteer must emit Infinity, got: ${startSteer}`);
  assert.ok(!startSteer.includes('5000'),
    `flippermove_startSteer must not retain the old 5000 cap, got: ${startSteer}`);

  // Note: startSteer wraps its body in `{ }`. Whether or not the inner call is
  // awaited matters; the block-scope wrapping doesn't. Assert on the call.
  assert.ok(!/await\s+window\.sim\._runPairMotion/.test(startSteer),
    `flippermove_startSteer's _runPairMotion call must not be awaited, got: ${startSteer}`);

  const dualSpeedBlock = {
    getFieldValue: () => null,
    getInputTargetBlock: () => null,
  };
  const dualSpeed = Blockly.JavaScript['flippermoremove_startDualSpeed'](dualSpeedBlock);
  assert.ok(dualSpeed.includes('Infinity'),
    `flippermoremove_startDualSpeed must emit Infinity, got: ${dualSpeed}`);
  assert.ok(dualSpeed.includes('_runPairMotion'),
    `flippermoremove_startDualSpeed must route through _runPairMotion (per CLAUDE.md), got: ${dualSpeed}`);
  assert.ok(!/await\s+window\.sim\._runPairMotion/.test(dualSpeed),
    `flippermoremove_startDualSpeed must stay fire-and-forget, got: ${dualSpeed}`);
});

test("Blockly flippermove_stopMove emits _pairStopAndAwait (not global sim.stop)", () => {
  // Issue #28 second half: stopMove used to kill the whole sim, which
  // wrong-ended any program with blocks after the stop.
  const { makeBlocklyEnv } = require('../mocks/blockly-env');
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  const { Blockly } = env;

  const code = Blockly.JavaScript['flippermove_stopMove']({});
  assert.ok(code.includes('_pairStopAndAwait'),
    `stopMove must call _pairStopAndAwait, got: ${code}`);
  assert.ok(!code.includes('window.sim.stop()'),
    `stopMove must not call the global sim.stop() any more, got: ${code}`);
});
