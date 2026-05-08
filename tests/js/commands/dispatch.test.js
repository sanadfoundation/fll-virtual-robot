'use strict';

// _execCmd dispatch tests. We stub _animateTank with a recorder and assert
// that each command type routes to the right downstream call with the right
// transformed arguments — testing OUR dispatch logic, not the physics engine.

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// Returns a sim with _animateTank replaced by a recorder. The sim still has
// real `pairMap`, `robot`, etc. — we're only intercepting the physics call.
function createSimWithStub() {
  const sim = createSim();
  sim.isRunning = true;
  const tankCalls = [];
  sim._animateTank = async (leftV, rightV, distMM) => {
    tankCalls.push({ leftV, rightV, distMM });
  };
  return { sim, tankCalls };
}

// ── Non-physics commands ────────────────────────────────────────────────────

test('pair: stores port mapping in pairMap', async () => {
  const sim = createSim();
  await sim._execCmd({ type: 'pair', pair_id: 0, left: 'A', right: 'B' });
  assert.strictEqual(sim.pairMap[0].left,  'A');
  assert.strictEqual(sim.pairMap[0].right, 'B');
});

test('stop: no state change', async () => {
  const sim = createSim();
  await sim._execCmd({ type: 'stop', pair_id: 0 });
  assert.strictEqual(sim.robot.x, 350);
  assert.strictEqual(sim.robot.y, 980);
});

test('hub_display_off: sets all 25 pixels to 0', async () => {
  const sim = createSim();
  sim.robot.display = Array(25).fill(80);
  await sim._execCmd({ type: 'hub_display_off' });
  assert.strictEqual(sim.robot.display.length, 25);
  assert.ok(sim.robot.display.every(v => v === 0));
});

test('hub_pixel: sets correct display array index', async () => {
  const sim = createSim();
  await sim._execCmd({ type: 'hub_pixel', x: 2, y: 3, brightness: 80 });
  assert.strictEqual(sim.robot.display[17], 80);
});

test('hub_pixel: out-of-bounds x/y ignored', async () => {
  const sim = createSim();
  await sim._execCmd({ type: 'hub_pixel', x: 5, y: 0, brightness: 100 });
  assert.ok(sim.robot.display.every(v => v === 0));
});

test('motor_stop: no state change', async () => {
  const sim = createSim();
  await sim._execCmd({ type: 'motor_stop', port: 'A' });
  assert.strictEqual(sim.robot.y, 980);
});

test('print: calls window.appendOutput with cmd.text', async () => {
  const calls = [];
  const sim = createSim({ appendOutput: (text) => calls.push(text) });
  await sim._execCmd({ type: 'print', text: 'hello world' });
  assert.deepStrictEqual(calls, ['hello world']);
});

test('print: does not affect robot position', async () => {
  const sim = createSim();
  await sim._execCmd({ type: 'print', text: 'hello' });
  assert.strictEqual(sim.robot.x, 350);
  assert.strictEqual(sim.robot.y, 980);
});

// ── move (steering-based) ───────────────────────────────────────────────────

test('move: steering=0 routes equal speeds to _animateTank', async () => {
  const { sim, tankCalls } = createSimWithStub();
  await sim._execCmd({ type: 'move', pair_id: 0, steering: 0, speed: 1000, amount: 360, unit: 'degrees' });
  assert.strictEqual(tankCalls.length, 1);
  const c = tankCalls[0];
  assert.ok(close(c.leftV, 1.0),  `leftV=${c.leftV}`);
  assert.ok(close(c.rightV, 1.0), `rightV=${c.rightV}`);
});

test('move: positive steering produces left-faster wheels (right turn)', async () => {
  const { sim, tankCalls } = createSimWithStub();
  await sim._execCmd({ type: 'move', pair_id: 0, steering: 50, speed: 1000, amount: 360, unit: 'degrees' });
  // CLAUDE.md: steering > 0 = right turn = left wheel faster.
  // spd=1.0, steer=0.5 ⇒ leftV = 1.5, rightV = 0.5
  const c = tankCalls[0];
  assert.ok(close(c.leftV, 1.5),  `leftV=${c.leftV}`);
  assert.ok(close(c.rightV, 0.5), `rightV=${c.rightV}`);
  assert.ok(c.leftV > c.rightV,   'left wheel faster on a right turn');
});

test('move: negative steering produces right-faster wheels (left turn)', async () => {
  const { sim, tankCalls } = createSimWithStub();
  await sim._execCmd({ type: 'move', pair_id: 0, steering: -50, speed: 1000, amount: 360, unit: 'degrees' });
  const c = tankCalls[0];
  assert.ok(close(c.leftV, 0.5),  `leftV=${c.leftV}`);
  assert.ok(close(c.rightV, 1.5), `rightV=${c.rightV}`);
});

test('move: speed normalisation divides by 1000', async () => {
  const { sim, tankCalls } = createSimWithStub();
  await sim._execCmd({ type: 'move', pair_id: 0, steering: 0, speed: 720, amount: 360, unit: 'degrees' });
  const c = tankCalls[0];
  assert.ok(close(c.leftV, 0.72));
  assert.ok(close(c.rightV, 0.72));
});

test('move: unit conversion — 360 degrees = one wheel circumference', async () => {
  const { sim, tankCalls } = createSimWithStub();
  await sim._execCmd({ type: 'move', pair_id: 0, steering: 0, speed: 1000, amount: 360, unit: 'degrees' });
  const c = tankCalls[0];
  assert.ok(close(c.distMM, Math.PI * 56), `distMM=${c.distMM} should be wheel circumference`);
});

test('move: unit conversion — cm to mm', async () => {
  const { sim, tankCalls } = createSimWithStub();
  await sim._execCmd({ type: 'move', pair_id: 0, steering: 0, speed: 1000, amount: 50, unit: 'cm' });
  const c = tankCalls[0];
  assert.strictEqual(c.distMM, 500);
});

// ── move_tank ────────────────────────────────────────────────────────────────

test('move_tank: per-wheel speeds normalised by 1000', async () => {
  const { sim, tankCalls } = createSimWithStub();
  await sim._execCmd({ type: 'move_tank', pair_id: 0, left_speed: 500, right_speed: 500, amount: 360, unit: 'degrees' });
  const c = tankCalls[0];
  assert.ok(close(c.leftV, 0.5));
  assert.ok(close(c.rightV, 0.5));
});

test('move_tank: asymmetric speeds preserved through dispatch', async () => {
  const { sim, tankCalls } = createSimWithStub();
  await sim._execCmd({ type: 'move_tank', pair_id: 0, left_speed: 1000, right_speed: -360, amount: 180, unit: 'degrees' });
  const c = tankCalls[0];
  assert.ok(close(c.leftV, 1.0));
  assert.ok(close(c.rightV, -0.36));
});
