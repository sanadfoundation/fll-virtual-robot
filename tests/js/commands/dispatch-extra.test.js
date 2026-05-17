'use strict';

// Covers the _execCmd branches not exercised by dispatch.test.js:
// start, start_tank, motor_time, hub_display (set), beep.

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

function withTankStub(sim) {
  sim.isRunning = true;
  const calls = [];
  sim._animateTank = async (leftV, rightV, distMM) => {
    calls.push({ leftV, rightV, distMM });
  };
  return calls;
}

// ── start (continuous straight) ─────────────────────────────────────────────

test('start: routes speed to _animateTank with both wheels equal', async () => {
  const sim = createSim();
  const calls = withTankStub(sim);
  await sim._execCmd({ type: 'start', pair_id: 0, speed: 1000 });
  assert.strictEqual(calls.length, 1);
  assert.ok(close(calls[0].leftV, 1.0));
  assert.ok(close(calls[0].rightV, 1.0));
});

test('start: zero speed routes 0,0 — kinematic but stationary', async () => {
  const sim = createSim();
  const calls = withTankStub(sim);
  await sim._execCmd({ type: 'start', pair_id: 0, speed: 0 });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].leftV, 0);
  assert.strictEqual(calls[0].rightV, 0);
});

// Catches the bug enumerated in docs/audits/2026-05-13-test-coverage-fidelity.md
// §4.1: motor_pair.move(steering, velocity) is supposed to apply steering for
// the whole continuous run, but _execCmd 'start' read only cmd.speed and
// dropped cmd.steering, so the robot moved straight no matter what steering
// value Python sent.
test('start: positive steering produces unequal wheel velocities (right turn)', async () => {
  const sim = createSim();
  const calls = withTankStub(sim);
  await sim._execCmd({ type: 'start', pair_id: 0, speed: 1000, steering: 50 });
  assert.strictEqual(calls.length, 1);
  // CLAUDE.md: steering > 0 is a right turn = left wheel faster.
  // lv = spd × (1 + steer/100); rv = spd × (1 - steer/100).
  assert.ok(close(calls[0].leftV,  1.5), `expected leftV=1.5, got ${calls[0].leftV}`);
  assert.ok(close(calls[0].rightV, 0.5), `expected rightV=0.5, got ${calls[0].rightV}`);
});

test('start: negative steering produces unequal wheel velocities (left turn)', async () => {
  const sim = createSim();
  const calls = withTankStub(sim);
  await sim._execCmd({ type: 'start', pair_id: 0, speed: 1000, steering: -50 });
  assert.ok(close(calls[0].leftV,  0.5), `expected leftV=0.5, got ${calls[0].leftV}`);
  assert.ok(close(calls[0].rightV, 1.5), `expected rightV=1.5, got ${calls[0].rightV}`);
});

// ── start_tank (continuous tank) ────────────────────────────────────────────

test('start_tank: equal speeds normalised through dispatch', async () => {
  const sim = createSim();
  const calls = withTankStub(sim);
  await sim._execCmd({ type: 'start_tank', pair_id: 0, left_speed: 500, right_speed: 500 });
  assert.ok(close(calls[0].leftV, 0.5));
  assert.ok(close(calls[0].rightV, 0.5));
});

test('start_tank: asymmetric speeds passed through unchanged after /1000', async () => {
  const sim = createSim();
  const calls = withTankStub(sim);
  await sim._execCmd({ type: 'start_tank', pair_id: 0, left_speed: 1000, right_speed: 0 });
  assert.ok(close(calls[0].leftV, 1.0));
  assert.ok(close(calls[0].rightV, 0));
});

// ── motor_time ──────────────────────────────────────────────────────────────

test('motor_time: with pair configured, routes through _animateTank', async () => {
  const sim = createSim();
  const calls = withTankStub(sim);
  await sim._execCmd({ type: 'pair', pair_id: 0, left: 'A', right: 'B' });
  await sim._execCmd({ type: 'motor_time', port: 'A', time_ms: 500, velocity: 500 });
  assert.strictEqual(calls.length, 1, 'paired motor_time should reach _animateTank');
  // Port A is the LEFT wheel — only it gets the velocity.
  assert.ok(close(calls[0].leftV, 0.5),  `leftV=${calls[0].leftV}`);
  assert.strictEqual(calls[0].rightV, 0, `rightV=${calls[0].rightV}`);
});

test('motor_time: defaults velocity to 500 when omitted', async () => {
  const sim = createSim();
  const calls = withTankStub(sim);
  // Port A's drive-left role routes single-motor commands through _animateTank
  // even with no pair configured, so default velocity is observable there.
  await sim._execCmd({ type: 'motor_time', port: 'A', time_ms: 100 });
  assert.strictEqual(calls.length, 1);
  assert.ok(close(calls[0].leftV, 0.5), `leftV=${calls[0].leftV}`);
  assert.strictEqual(calls[0].rightV, 0);
});

test('motor_time: defaults time_ms to 1000 when omitted', async () => {
  const sim = createSim();
  const calls = withTankStub(sim);
  await sim._execCmd({ type: 'motor_time', port: 'A', velocity: 500 });
  assert.strictEqual(calls.length, 1);
  // 500/1000 normalized × MM_PER_MS_100 (0.9) × 1000 ms = 450 mm of wheel travel.
  assert.ok(close(calls[0].distMM, 450), `distMM=${calls[0].distMM}`);
});

// ── hub_display (set bitmap) ────────────────────────────────────────────────

test('hub_display: renders the first character as a glyph', async () => {
  // Tests for the old every-other-pixel fake renderer were here; per
  // audit 2026-05-13 §4.9 the renderer now uses a real 5x5 glyph font.
  // Detailed glyph-shape tests live in tests/js/commands/hub-display-glyphs.test.js.
  const sim = createSim();
  await sim._execCmd({ type: 'hub_display', text: 'Hi' });
  assert.strictEqual(sim.robot.display.length, 25);
  const lit = sim.robot.display.filter((v) => v > 0).length;
  assert.ok(lit > 0, 'expected some pixels lit for a glyph');
  // Each lit pixel is full brightness (100), not the proportional fade the
  // fake renderer used.
  assert.ok(sim.robot.display.every((v) => v === 0 || v === 100),
    'glyph pixels should be full-on (100) or full-off (0)');
});

test('hub_display: brightness independent of text length (glyph render, not proportional)', async () => {
  const sim = createSim();
  await sim._execCmd({ type: 'hub_display', text: 'H' });
  const shortLitCount = sim.robot.display.filter((v) => v > 0).length;
  await sim._execCmd({ type: 'hub_display', text: 'H is a much longer string' });
  const longLitCount = sim.robot.display.filter((v) => v > 0).length;
  // Glyph render: 'H' first character drawn either way, same pixels lit.
  assert.strictEqual(shortLitCount, longLitCount,
    'glyph render shows only the first character; length should not change lit count');
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
  assert.strictEqual(sim.robot.y, 163);
});

// ── _animateSingleMotor port-role fallback ──────────────────────────────────

test('_animateSingleMotor: unpaired drive-left port pivots around right wheel', async () => {
  // Real Spike: motor.run(port.A) with no motor_pair.pair() still spins the
  // physical motor; if A is wired to the left wheel, the robot pivots around
  // the stationary right wheel. PORT_CONFIG.A.role = 'drive-left' encodes that.
  const sim = createSim();
  const calls = withTankStub(sim);
  assert.strictEqual(sim._findPairForPort('A'), null, 'precondition: A unpaired');
  await sim._animateSingleMotor('A', 0.5, 100);
  assert.strictEqual(calls.length, 1);
  assert.ok(close(calls[0].leftV, 0.5));
  assert.strictEqual(calls[0].rightV, 0);
  assert.strictEqual(calls[0].distMM, 100);
});

test('_animateSingleMotor: unpaired drive-right port pivots around left wheel', async () => {
  const sim = createSim();
  const calls = withTankStub(sim);
  await sim._animateSingleMotor('B', -0.4, 80);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].leftV, 0);
  assert.ok(close(calls[0].rightV, -0.4));
  assert.strictEqual(calls[0].distMM, 80);
});

test('_animateSingleMotor: auxiliary motor (no drive role) leaves robot pose unchanged', async () => {
  const sim = createSim();
  const calls = withTankStub(sim);
  // Re-wire port C as a non-drive motor (e.g. an arm attachment).
  sim._portConfig.C = { kind: 'motor' };
  await sim._animateSingleMotor('C', 0.5, 100);
  assert.strictEqual(calls.length, 0, 'auxiliary motor should not reach _animateTank');
  assert.strictEqual(sim.robot.x, 350);
  assert.strictEqual(sim.robot.y, 163);
  assert.strictEqual(sim.robot.heading, 90);
});

test('_animateSingleMotor: pairMap overrides PORT_CONFIG role', async () => {
  // motor_pair.pair(PAIR_1, port.B, port.A) declares B=left, A=right — the
  // override should beat the default A=drive-left mapping.
  const sim = createSim();
  const calls = withTankStub(sim);
  sim.pairMap[0] = { left: 'B', right: 'A' };
  await sim._animateSingleMotor('A', 1, 100);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].leftV, 0, 'A is right wheel under override');
  assert.ok(close(calls[0].rightV, 1));
  assert.strictEqual(calls[0].distMM, 100);
});

test('_animateSingleMotor: paired port routes velocity to the matching wheel only', async () => {
  const sim = createSim();
  const calls = withTankStub(sim);
  sim.pairMap[0] = { left: 'A', right: 'B' };
  await sim._animateSingleMotor('A', 1, 100);
  assert.strictEqual(calls.length, 1);
  assert.ok(close(calls[0].leftV, 1));
  assert.strictEqual(calls[0].rightV, 0);
  assert.strictEqual(calls[0].distMM, 100);
});

test('_animateSingleMotor: paired right port routes velocity to the right wheel', async () => {
  const sim = createSim();
  const calls = withTankStub(sim);
  sim.pairMap[0] = { left: 'A', right: 'B' };
  await sim._animateSingleMotor('B', 0.7, 200);
  assert.strictEqual(calls[0].leftV, 0);
  assert.ok(close(calls[0].rightV, 0.7));
  assert.strictEqual(calls[0].distMM, 200);
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
