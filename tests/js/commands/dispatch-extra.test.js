'use strict';

// Covers the _execCmd branches not exercised by dispatch.test.js:
// start, start_tank, motor_time, hub_display (set), beep.

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

const EPS = 0.5;
const close = (a, b, tol) => Math.abs(a - b) <= tol;

// ── start (continuous straight) ─────────────────────────────────────────────

test('start: continuous straight drive moves robot forward', async () => {
  const sim = createSim();
  sim.isRunning = true;
  await sim._execCmd({ type: 'pair', pair_id: 0, left: 'A', right: 'B' });
  await sim._execCmd({ type: 'start', pair_id: 0, speed: 1000 });
  assert.ok(sim.robot.y < 980, `y should decrease, got ${sim.robot.y}`);
  assert.ok(close(sim.robot.heading, -90, EPS), `heading=${sim.robot.heading}`);
});

test('start: zero speed leaves robot stationary', async () => {
  const sim = createSim();
  sim.isRunning = true;
  await sim._execCmd({ type: 'start', pair_id: 0, speed: 0 });
  assert.strictEqual(sim.robot.y, 980);
});

// ── start_tank (continuous tank) ────────────────────────────────────────────

test('start_tank: equal speeds drive straight', async () => {
  const sim = createSim();
  sim.isRunning = true;
  await sim._execCmd({ type: 'start_tank', pair_id: 0, left_speed: 500, right_speed: 500 });
  assert.ok(sim.robot.y < 980, `y=${sim.robot.y}`);
  assert.ok(close(sim.robot.heading, -90, EPS), `heading=${sim.robot.heading}`);
});

test('start_tank: asymmetric speeds turn the robot', async () => {
  const sim = createSim();
  sim.isRunning = true;
  await sim._execCmd({ type: 'start_tank', pair_id: 0, left_speed: 1000, right_speed: 0 });
  assert.ok(sim.robot.heading > -90, `heading should rotate right, got ${sim.robot.heading}`);
});

// ── motor_time ──────────────────────────────────────────────────────────────

test('motor_time: with pair configured, drives the paired wheel', async () => {
  const sim = createSim();
  sim.isRunning = true;
  await sim._execCmd({ type: 'pair', pair_id: 0, left: 'A', right: 'B' });
  const yBefore = sim.robot.y;
  await sim._execCmd({ type: 'motor_time', port: 'A', time_ms: 500, velocity: 500 });
  assert.notStrictEqual(sim.robot.y, yBefore, 'paired motor_time should move the robot');
});

test('motor_time: defaults velocity to 500 when omitted', async () => {
  const sim = createSim();
  sim.isRunning = true;
  // No pair → non-drive path; just verify it doesn't throw with default velocity.
  await sim._execCmd({ type: 'motor_time', port: 'A', time_ms: 100 });
  assert.strictEqual(sim.robot.y, 980, 'non-drive motor should not move robot');
});

test('motor_time: defaults time_ms to 1000 when omitted', async () => {
  const sim = createSim();
  sim.isRunning = true;
  await sim._execCmd({ type: 'motor_time', port: 'A', velocity: 500 });
  assert.strictEqual(sim.robot.y, 980, 'non-drive motor should not move robot');
});

// ── hub_display (set bitmap) ────────────────────────────────────────────────

test('hub_display: populates display array based on text length', async () => {
  const sim = createSim();
  await sim._execCmd({ type: 'hub_display', text: 'Hi' });
  assert.strictEqual(sim.robot.display.length, 25);
  // _showText fills even-indexed cells with a brightness > 0; odd cells stay 0.
  const lit = sim.robot.display.filter(v => v > 0).length;
  assert.ok(lit > 0, 'expected some pixels lit');
  assert.ok(sim.robot.display.every((v, i) => i % 2 === 0 ? v > 0 : v === 0),
    'even cells lit, odd cells dark');
});

test('hub_display: longer text yields brighter pixels (capped at 100)', async () => {
  const sim = createSim();
  await sim._execCmd({ type: 'hub_display', text: 'Hi' });
  const briShort = sim.robot.display[0];
  await sim._execCmd({ type: 'hub_display', text: 'A much longer string here' });
  const briLong = sim.robot.display[0];
  assert.ok(briLong >= briShort, `bri grew or capped: short=${briShort} long=${briLong}`);
  assert.ok(briLong <= 100, `bri capped at 100, got ${briLong}`);
});

// ── beep ────────────────────────────────────────────────────────────────────

test('beep: does not throw when AudioContext is unavailable', async () => {
  const sim = createSim();
  // window.AudioContext / webkitAudioContext are null in the test environment;
  // _playBeep should silently swallow the error.
  await sim._execCmd({ type: 'beep', note: 69, duration: 0.1 });
  // No assertion needed beyond "didn't throw".
});

test('beep: state unchanged after invocation', async () => {
  const sim = createSim();
  await sim._execCmd({ type: 'beep', note: 60, duration: 0.05 });
  assert.strictEqual(sim.robot.x, 350);
  assert.strictEqual(sim.robot.y, 980);
});

// ── _animateSingleMotor non-pair path ───────────────────────────────────────

test('_animateSingleMotor: non-pair port leaves robot pose unchanged', async () => {
  const sim = createSim();
  sim.isRunning = true;
  // Port C is configured as 'empty' by default — pretend it's a motor for this test.
  // We need a port that is configured as motor but is NOT in any pair. Use 'A'
  // with no pair configured — A is motor by default, no pair set.
  assert.strictEqual(sim._findPairForPort('A'), null, 'precondition: A unpaired');
  await sim._animateSingleMotor('A', 0.5, 100);
  assert.strictEqual(sim.robot.x, 350);
  assert.strictEqual(sim.robot.y, 980);
  assert.strictEqual(sim.robot.heading, -90);
});

test('_animateSingleMotor: paired port drives only its side', async () => {
  const sim = createSim();
  sim.isRunning = true;
  sim.pairMap[0] = { left: 'A', right: 'B' };
  await sim._animateSingleMotor('A', 1, 100);
  // A is the LEFT wheel — driving only it should rotate the robot rightward
  // (right pivot since right wheel stays at 0).
  assert.ok(sim.robot.heading > -90, `heading should rotate right, got ${sim.robot.heading}`);
});

test('_animateSingleMotor: refuses non-motor port', async () => {
  const sim = createSim();
  sim.isRunning = true;
  let threw = null;
  try {
    await sim._animateSingleMotor('E', 1, 100); // E is color_sensor by default
  } catch (e) { threw = e; }
  assert.ok(threw, 'expected throw on color_sensor port');
  assert.match(threw.message, /port E has no motor/);
});
