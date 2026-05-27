'use strict';

// _execCmd('hub_orientation') dispatch tests. Two modes:
//   { mode: 'set',    top: 0..3 }
//   { mode: 'rotate', direction: 'clockwise' | 'counterclockwise' }
// Both update robot.orientation (0=UP, 1=RIGHT, 2=DOWN, 3=LEFT) and mark
// the sim dirty so _drawRobot repaints the matrix with the new transform.

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

test('hub_orientation: defaults to 0 (UP) on a fresh sim', () => {
  const sim = createSim();
  assert.strictEqual(sim.robot.orientation, 0);
});

test('hub_orientation set: assigns the requested top value', async () => {
  const sim = createSim();
  await sim._execCmd({ type: 'hub_orientation', mode: 'set', top: 1 });
  assert.strictEqual(sim.robot.orientation, 1);
  await sim._execCmd({ type: 'hub_orientation', mode: 'set', top: 3 });
  assert.strictEqual(sim.robot.orientation, 3);
});

test('hub_orientation set: wraps out-of-range top into 0..3', async () => {
  const sim = createSim();
  await sim._execCmd({ type: 'hub_orientation', mode: 'set', top: 5 });
  assert.strictEqual(sim.robot.orientation, 1);
  await sim._execCmd({ type: 'hub_orientation', mode: 'set', top: -1 });
  assert.strictEqual(sim.robot.orientation, 3);
});

test('hub_orientation rotate: clockwise advances UP→RIGHT→DOWN→LEFT→UP', async () => {
  const sim = createSim();
  const seq = [];
  for (let i = 0; i < 5; i++) {
    seq.push(sim.robot.orientation);
    await sim._execCmd({ type: 'hub_orientation', mode: 'rotate', direction: 'clockwise' });
  }
  assert.deepStrictEqual(seq, [0, 1, 2, 3, 0]);
});

test('hub_orientation rotate: counterclockwise walks the cycle the other way', async () => {
  const sim = createSim();
  const seq = [];
  for (let i = 0; i < 5; i++) {
    seq.push(sim.robot.orientation);
    await sim._execCmd({ type: 'hub_orientation', mode: 'rotate', direction: 'counterclockwise' });
  }
  assert.deepStrictEqual(seq, [0, 3, 2, 1, 0]);
});

test('hub_orientation: marks the sim dirty', async () => {
  const sim = createSim();
  sim._dirty = false;
  await sim._execCmd({ type: 'hub_orientation', mode: 'set', top: 2 });
  assert.strictEqual(sim._dirty, true);
  sim._dirty = false;
  await sim._execCmd({ type: 'hub_orientation', mode: 'rotate', direction: 'clockwise' });
  assert.strictEqual(sim._dirty, true);
});

test('hub_orientation: does not mutate robot.display', async () => {
  // Orientation is a render-time transform; the raw pattern in robot.display
  // must remain untouched so subsequent rotations re-rotate from the
  // original bitmap, not a previously-rotated one.
  const sim = createSim();
  await sim._execCmd({ type: 'hub_image', image: 'HAPPY' });
  const happy = Array.from(sim.robot.display);
  await sim._execCmd({ type: 'hub_orientation', mode: 'set', top: 1 });
  // `createSim` runs the sim in a vm context with its own Array global, so
  // deepStrictEqual on the live display vs. a test-process snapshot fails on
  // prototype check; normalize both sides via Array.from.
  assert.deepStrictEqual(Array.from(sim.robot.display), happy);
});
