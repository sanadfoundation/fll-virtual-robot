'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

// Each canvas pixel is 1 mm wide in the mock (width=2362, FIELD_W_MM=2362, so
// scale=1). canvas y is from the top; sim's robot y is math y-up. Mock
// getBoundingClientRect returns {left:0, top:0} so client coords == canvas coords.
function clientForWorld(x_mm, y_mm) {
  // Convert math y-up world position to canvas client coords.
  const FIELD_H_MM = 1143;
  return { clientX: x_mm, clientY: FIELD_H_MM - y_mm };
}

function fire(canvas, type, x_mm, y_mm, pointerId = 1) {
  const { clientX, clientY } = clientForWorld(x_mm, y_mm);
  canvas.dispatchEvent({
    type, pointerId, clientX, clientY,
    preventDefault: () => {},
  });
}

test('drag: pointerdown outside robot footprint does not start a drag', async () => {
  const sim = createSim();
  fire(sim.canvas, 'pointerdown', 1500, 800);
  assert.strictEqual(sim._dragPointerId, null);
});

test('drag: pointerdown on robot starts a drag', async () => {
  const sim = createSim();
  fire(sim.canvas, 'pointerdown', 350, 163);
  assert.notStrictEqual(sim._dragPointerId, null);
});

test('drag: pointermove translates the robot center', async () => {
  const sim = createSim();
  fire(sim.canvas, 'pointerdown', 350, 163);
  fire(sim.canvas, 'pointermove', 500, 363);
  await new Promise(r => setImmediate(r));
  assert.ok(Math.abs(sim.robot.x - 500) < 1, `x=${sim.robot.x}`);
  assert.ok(Math.abs(sim.robot.y - 363) < 1, `y=${sim.robot.y}`);
});

test('drag: pointerup ends the drag and releases the pointer id', async () => {
  const sim = createSim();
  fire(sim.canvas, 'pointerdown', 350, 163);
  fire(sim.canvas, 'pointerup', 350, 163);
  assert.strictEqual(sim._dragPointerId, null);
});

test('drag: pointerdown is ignored while the sim is running', async () => {
  const sim = createSim();
  sim.isRunning = true;
  fire(sim.canvas, 'pointerdown', 350, 163);
  assert.strictEqual(sim._dragPointerId, null);
});

test('drag: pointermove from a non-drag pointer id is a no-op', async () => {
  const sim = createSim();
  fire(sim.canvas, 'pointerdown', 350, 163, 1);
  fire(sim.canvas, 'pointermove', 1000, 1000, 2);  // different pointer
  await new Promise(r => setImmediate(r));
  // Robot should still be at spawn since the move event was ignored.
  assert.strictEqual(sim.robot.x, 350);
  assert.strictEqual(sim.robot.y, 163);
});

test('drag: pointermove preserves the click offset on the body', async () => {
  // Click 50 mm forward and 30 mm right of robot center, then drag.
  // The robot center should follow with the same relative offset.
  const sim = createSim();
  fire(sim.canvas, 'pointerdown', 380, 213);  // (350+30, 163+50)
  fire(sim.canvas, 'pointermove', 880, 713);  // drop ~500 mm east and ~500 mm north
  await new Promise(r => setImmediate(r));
  assert.ok(Math.abs(sim.robot.x - 850) < 1, `x=${sim.robot.x}, expected ≈ 850`);
  assert.ok(Math.abs(sim.robot.y - 663) < 1, `y=${sim.robot.y}, expected ≈ 663`);
});
