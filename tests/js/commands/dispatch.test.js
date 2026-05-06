'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

const EPS = 0.5;
const close = (a, b, tol) => Math.abs(a - b) <= tol;

test('pair: stores port mapping in pairMap', async () => {
  const sim = createSim();
  await sim._execCmd({ type: 'pair', pair_id: 0, left: 'A', right: 'B' });
  assert.strictEqual(sim.pairMap[0].left,  'A');
  assert.strictEqual(sim.pairMap[0].right, 'B');
});

test('move straight (steering=0): robot travels forward', async () => {
  const sim = createSim();
  sim.isRunning = true;
  await sim._execCmd({ type: 'move', pair_id: 0, steering: 0, speed: 1000, amount: 360, unit: 'degrees' });
  assert.ok(sim.robot.y < 980, `y should decrease from 980, got ${sim.robot.y}`);
  assert.ok(close(sim.robot.heading, -90, EPS), `heading=${sim.robot.heading}`);
});

test('move_tank equal speeds: robot travels straight', async () => {
  const sim = createSim();
  sim.isRunning = true;
  await sim._execCmd({ type: 'move_tank', pair_id: 0, left_speed: 500, right_speed: 500, amount: 360, unit: 'degrees' });
  assert.ok(close(sim.robot.heading, -90, EPS), `heading=${sim.robot.heading}`);
  assert.ok(sim.robot.y < 980);
});

test('move_tank unequal speeds: robot turns', async () => {
  const sim = createSim();
  sim.isRunning = true;
  await sim._execCmd({ type: 'move_tank', pair_id: 0, left_speed: 1000, right_speed: 0, amount: 360, unit: 'degrees' });
  assert.ok(sim.robot.heading > -90, `heading should increase (right turn), got ${sim.robot.heading}`);
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
  assert.ok(sim.robot.display.every(v => v === 0), `display=${JSON.stringify([...sim.robot.display])}`);
});

test('hub_pixel: sets correct display array index', async () => {
  const sim = createSim();
  await sim._execCmd({ type: 'hub_pixel', x: 2, y: 3, brightness: 80 });
  assert.strictEqual(sim.robot.display[17], 80);
});

test('hub_pixel: out-of-bounds x/y ignored', async () => {
  const sim = createSim();
  await sim._execCmd({ type: 'hub_pixel', x: 5, y: 0, brightness: 100 });
  assert.ok(sim.robot.display.every(v => v === 0), 'display should be unchanged');
});

test('motor_degrees: no pair configured → non-drive motor, no position change on robot', async () => {
  const sim = createSim();
  sim.isRunning = true;
  await sim._execCmd({ type: 'motor_degrees', port: 'A', degrees: 360, velocity: 500 });
  assert.strictEqual(sim.robot.x, 350);
  assert.strictEqual(sim.robot.y, 980);
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
