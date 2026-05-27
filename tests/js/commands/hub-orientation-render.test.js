'use strict';

// Verifies that robot.orientation actually rotates the painted 5×5 matrix
// at render time — orientation is a draw-time transform, not a write-time
// mutation of robot.display.

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

// Capture every (mx, my, fillStyle) tuple that _drawRobot uses for the
// 5×5 LED dots. The dot draw loop calls ctx.arc(mx, my, dotR, …) — we hook
// arc to log alpha-bearing fills only (lit cells have rgba(255,230,60,α)).
function captureLitDots(sim) {
  const ctx = sim.ctx;
  const lit = [];
  let currentFill = '';
  Object.defineProperty(ctx, 'fillStyle', {
    configurable: true,
    get() { return currentFill; },
    set(v) { currentFill = v; },
  });
  const origArc = ctx.arc;
  ctx.arc = function (x, y, r) {
    if (typeof currentFill === 'string' && currentFill.startsWith('rgba(255,230,60')) {
      lit.push({ x, y });
    }
    return origArc.apply(this, arguments);
  };
  return lit;
}

// Use a deliberately asymmetric pattern so each 90° step lands a lit pixel
// in a distinct visual position. A single lit dot at row=0, col=0 (top-left
// of the UP frame) is the cleanest sentinel — it travels around the corners
// as orientation walks UP → RIGHT → DOWN → LEFT.
function singlePixelTopLeft() {
  const arr = new Array(25).fill(0);
  arr[0] = 100;
  return arr;
}

test('orientation UP: top-left source pixel paints in the top-left visual slot', () => {
  const sim = createSim();
  sim.robot.display = singlePixelTopLeft();
  sim.robot.orientation = 0;
  const lit = captureLitDots(sim);
  sim._drawRobot(sim.ctx, 1);
  assert.strictEqual(lit.length, 1);
  // Body-local frame: (col-2, row-2) * dotGap. row=0, col=0 → (-2, -2)*dotGap.
  // We don't assert exact pixel values (dotGap is a render constant), just
  // that x<0 and y<0 (top-left quadrant in canvas body-local).
  assert.ok(lit[0].x < 0 && lit[0].y < 0,
    `UP: expected top-left lit dot; got ${JSON.stringify(lit[0])}`);
});

test('orientation RIGHT (1): the same source pixel paints in the top-right slot', () => {
  const sim = createSim();
  sim.robot.display = singlePixelTopLeft();
  sim.robot.orientation = 1;
  const lit = captureLitDots(sim);
  sim._drawRobot(sim.ctx, 1);
  assert.strictEqual(lit.length, 1);
  // 90° CW rotation: what was (row=0, col=0) appears at (row=0, col=4) on
  // screen — top-right quadrant: x>0, y<0.
  assert.ok(lit[0].x > 0 && lit[0].y < 0,
    `RIGHT: expected top-right lit dot; got ${JSON.stringify(lit[0])}`);
});

test('orientation DOWN (2): the same source pixel paints in the bottom-right slot', () => {
  const sim = createSim();
  sim.robot.display = singlePixelTopLeft();
  sim.robot.orientation = 2;
  const lit = captureLitDots(sim);
  sim._drawRobot(sim.ctx, 1);
  assert.strictEqual(lit.length, 1);
  // 180° rotation: (0, 0) → (4, 4). Bottom-right: x>0, y>0.
  assert.ok(lit[0].x > 0 && lit[0].y > 0,
    `DOWN: expected bottom-right lit dot; got ${JSON.stringify(lit[0])}`);
});

test('orientation LEFT (3): the same source pixel paints in the bottom-left slot', () => {
  const sim = createSim();
  sim.robot.display = singlePixelTopLeft();
  sim.robot.orientation = 3;
  const lit = captureLitDots(sim);
  sim._drawRobot(sim.ctx, 1);
  assert.strictEqual(lit.length, 1);
  // 90° CCW: (0, 0) → (4, 0). Bottom-left: x<0, y>0.
  assert.ok(lit[0].x < 0 && lit[0].y > 0,
    `LEFT: expected bottom-left lit dot; got ${JSON.stringify(lit[0])}`);
});
