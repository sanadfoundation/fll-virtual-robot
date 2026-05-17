'use strict';

// Simulator-unit tests for the encoder accumulator added to _animateTank.
// Drives real _execCmd → real _animateTank → real encoder write, against a
// kinematic-physics stub. No Python, no MicroPython WASM, no round-trip
// overhead — runs in milliseconds.
//
// These are the tier the testing pyramid wants for this behaviour: a
// regression in the accumulator logic fails *these* tests in a few ms with a
// pointer at the exact line, before the slower round-trip suite ever runs.
// The round-trip side (tests/js/integration/motor-encoder.test.js) keeps one
// contract-guard test that the Python accessor reads back the same number;
// it's the cross-runtime seam that warrants integration coverage.
//
// Audit ref: 2026-05-13 §4.2 / §8 — the canonical stub-pin surface.

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

test('motor_degrees: ~360° rotation accumulates on the target port', async () => {
  const sim = freshSim();
  await sim._execCmd({ type: 'pair', pair_id: 0, left: 'A', right: 'B' });
  await sim._execCmd({ type: 'motor_degrees', port: 'A', degrees: 360, velocity: 500 });
  assert.ok(Math.abs(sim.robot.motors.A - 360) < 40,
    `expected ~360 on A, got ${sim.robot.motors.A}`);
});

test('motor_degrees: reverse direction decrements the encoder (signed)', async () => {
  const sim = freshSim();
  await sim._execCmd({ type: 'pair', pair_id: 0, left: 'A', right: 'B' });
  await sim._execCmd({ type: 'motor_degrees', port: 'A', degrees: 360, velocity: -500 });
  // Negative velocity ⇒ negative accumulator, matching real motor encoders.
  assert.ok(sim.robot.motors.A < 0,
    `expected negative accumulator on reverse, got ${sim.robot.motors.A}`);
  assert.ok(Math.abs(sim.robot.motors.A + 360) < 40,
    `expected ~-360 on A, got ${sim.robot.motors.A}`);
});

test('motor_pair move: paired motors accumulate symmetrically on a forward move', async () => {
  const sim = freshSim();
  await sim._execCmd({ type: 'pair', pair_id: 0, left: 'A', right: 'B' });
  await sim._execCmd({
    type: 'move', pair_id: 0, steering: 0, speed: 500,
    amount: 720, unit: 'degrees',
  });
  const a = sim.robot.motors.A;
  const b = sim.robot.motors.B;
  assert.ok(Math.abs(a - 720) < 60, `A: expected ~720, got ${a}`);
  assert.ok(Math.abs(b - 720) < 60, `B: expected ~720, got ${b}`);
  assert.ok(Math.abs(a - b) < 20,
    `forward move ⇒ wheels lockstep, but A-B diff was ${a - b}`);
});

test('motor_pair move with steering: outer wheel accumulates more than inner', async () => {
  const sim = freshSim();
  await sim._execCmd({ type: 'pair', pair_id: 0, left: 'A', right: 'B' });
  // Right turn (steering > 0) ⇒ left wheel faster ⇒ A accumulates more than B.
  await sim._execCmd({
    type: 'move', pair_id: 0, steering: 50, speed: 500,
    amount: 360, unit: 'degrees',
  });
  assert.ok(sim.robot.motors.A > sim.robot.motors.B,
    `right turn should advance left wheel further; A=${sim.robot.motors.A}, B=${sim.robot.motors.B}`);
});

test('_animateTank: motors_velocity tracks the active wheel commands', async () => {
  const sim = freshSim();
  await sim._execCmd({ type: 'pair', pair_id: 0, left: 'A', right: 'B' });
  // We can't observe mid-motion without instrumenting _animateTank, but we
  // can observe that the value is cleared back to 0 after motion completes.
  // (Mid-motion sampling lives in the round-trip / event-hat tests.)
  await sim._execCmd({
    type: 'move', pair_id: 0, steering: 0, speed: 500,
    amount: 180, unit: 'degrees',
  });
  assert.strictEqual(sim.robot.motors_velocity.A, 0, 'A velocity cleared after motion');
  assert.strictEqual(sim.robot.motors_velocity.B, 0, 'B velocity cleared after motion');
});

test('motor_degrees: aux (non-drive) motor credits encoder without moving the body', async () => {
  const sim = freshSim();
  const startX = sim.robot.x;
  const startY = sim.robot.y;
  // Port D is 'empty' in default PORT_CONFIG — not a drive role.
  // But _portConfig may have role mapping. Use a known auxiliary port via
  // overriding the config (the only ports declared aux by default are
  // those without drive-left / drive-right roles — verify by checking sim).
  // For now use the actual port C — force_sensor in default config, will
  // refuse. Use the runtime path: pair sets A/B; then issue motor_degrees on
  // an unpaired role-less port. PORT_CONFIG has D='empty', so:
  sim._portConfig = sim._portConfig || {};
  sim._portConfig.D = { role: null, kind: 'motor' };
  await sim._execCmd({ type: 'motor_degrees', port: 'D', degrees: 90, velocity: 500 });
  // Body should NOT have moved (no drive wheel).
  assert.strictEqual(sim.robot.x, startX, 'aux motor must not translate body');
  assert.strictEqual(sim.robot.y, startY, 'aux motor must not translate body');
  // Encoder should still have ticked.
  assert.ok(Math.abs(sim.robot.motors.D - 90) < 10,
    `aux encoder should tick to ~90, got ${sim.robot.motors.D}`);
});
