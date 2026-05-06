'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

const EPS = 0.1;
const close = (a, b, tol) => Math.abs(a - b) <= tol;

test('straight forward 100mm: y decreases by 100, x and heading unchanged', async () => {
  const sim = createSim();
  sim.isRunning = true;
  await sim._animateTank(1, 1, 100);
  assert.ok(close(sim.robot.x, 350, EPS),       `x=${sim.robot.x}`);
  assert.ok(close(sim.robot.y, 880, EPS),       `y=${sim.robot.y}`);
  assert.ok(close(sim.robot.heading, -90, EPS), `h=${sim.robot.heading}`);
});

test('straight backward 100mm: y increases by 100, x and heading unchanged', async () => {
  const sim = createSim();
  sim.isRunning = true;
  await sim._animateTank(-1, -1, 100);
  assert.ok(close(sim.robot.x, 350, EPS),       `x=${sim.robot.x}`);
  assert.ok(close(sim.robot.y, 1080, EPS),      `y=${sim.robot.y}`);
  assert.ok(close(sim.robot.heading, -90, EPS), `h=${sim.robot.heading}`);
});

test('pure right pivot (lv=1,rv=-1): position unchanged, heading increases', async () => {
  const sim = createSim();
  sim.isRunning = true;
  const hBefore = sim.robot.heading;
  await sim._animateTank(1, -1, 100);
  assert.ok(close(sim.robot.x, 350, EPS), `x=${sim.robot.x}`);
  assert.ok(close(sim.robot.y, 980, EPS), `y=${sim.robot.y}`);
  assert.ok(sim.robot.heading > hBefore, `heading should increase, got ${sim.robot.heading}`);
});

test('pure left pivot (lv=-1,rv=1): position unchanged, heading decreases', async () => {
  const sim = createSim();
  sim.isRunning = true;
  const hBefore = sim.robot.heading;
  await sim._animateTank(-1, 1, 100);
  assert.ok(close(sim.robot.x, 350, EPS), `x=${sim.robot.x}`);
  assert.ok(close(sim.robot.y, 980, EPS), `y=${sim.robot.y}`);
  assert.ok(sim.robot.heading < hBefore, `heading should decrease, got ${sim.robot.heading}`);
});

test('heading delta of 180° pivot matches arc-length formula', async () => {
  const refDist = Math.PI * 56;
  const sim = createSim();
  sim.isRunning = true;
  await sim._animateTank(1, -1, refDist);
  const delta = sim.robot.heading - (-90);
  assert.ok(close(delta, 180, 1.0), `heading delta=${delta}, expected ~180`);
});

test('zero distance returns early without mutating state', async () => {
  const sim = createSim();
  sim.isRunning = true;
  await sim._animateTank(1, 1, 0.05);
  assert.strictEqual(sim.robot.x, 350);
  assert.strictEqual(sim.robot.y, 980);
  assert.strictEqual(sim.robot.heading, -90);
});

test('right arc (lv > rv): x increases (turning toward east from north)', async () => {
  const sim = createSim();
  sim.isRunning = true;
  await sim._animateTank(0.75, 0.25, 100);
  assert.ok(sim.robot.x > 350, `x=${sim.robot.x}`);
  assert.ok(sim.robot.heading > -90, `heading=${sim.robot.heading}`);
});

test('trail is appended on each step', async () => {
  const sim = createSim();
  const trailBefore = sim.trail.length;
  sim.isRunning = true;
  await sim._animateTank(1, 1, 100);
  assert.ok(sim.trail.length > trailBefore, 'trail grew');
});

test('isRunning=false breaks the loop early', async () => {
  const sim = createSim();
  await sim._animateTank(1, 1, 100);
  assert.strictEqual(sim.robot.y, 980);
});
