'use strict';

// Walls authored in the editor get static Box2D bodies via the field-swap
// pipeline, but the simulator's draw loop only had _drawObstacles — there
// was no corresponding _drawWalls call, so authored walls were physical
// (you could collide with them) but invisible during Play / Playtest.

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

// A recording ctx — captures every operation in order so tests can assert
// against the draw sequence without a real canvas.
function makeRecordingCtx() {
  const ops = [];
  const proxy = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'ops')           return ops;
      if (prop === 'measureText')   return () => ({ width: 0 });
      if (prop === 'getContext')    return () => proxy;
      // Allow property reads / writes for fillStyle, strokeStyle, lineWidth, etc.
      if (typeof prop === 'symbol') return undefined;
      // Method: record name + args.
      return (...args) => { ops.push({ op: prop, args }); };
    },
    set(_t, prop, value) {
      ops.push({ op: 'set', prop, value });
      return true;
    },
  });
  return proxy;
}

test('_drawWalls: calls fillRect with each wall in canvas y-down coords', () => {
  const sim = createSim();
  sim._walls = [
    { cfg: { x: 100, y: 200, w: 50, h: 60 }, body: null },
  ];
  const ctx = makeRecordingCtx();
  sim._drawWalls(ctx, 1);

  // Find the fillRect call for the wall — math y-up to canvas y-down:
  // canvas top-left y = FIELD_H_MM - y - h = 1143 - 200 - 60 = 883
  const fill = ctx.ops.find(o => o.op === 'fillRect');
  assert.ok(fill, 'expected at least one fillRect call');
  const [x, cy, w, h] = fill.args;
  assert.strictEqual(x, 100);
  assert.strictEqual(cy, 1143 - 200 - 60);
  assert.strictEqual(w, 50);
  assert.strictEqual(h, 60);
});

test('_drawWalls: draws one fillRect per wall', () => {
  const sim = createSim();
  sim._walls = [
    { cfg: { x: 0,   y: 0,   w: 10, h: 10 }, body: null },
    { cfg: { x: 100, y: 100, w: 10, h: 10 }, body: null },
    { cfg: { x: 200, y: 200, w: 10, h: 10 }, body: null },
  ];
  const ctx = makeRecordingCtx();
  sim._drawWalls(ctx, 1);

  const fills = ctx.ops.filter(o => o.op === 'fillRect');
  assert.strictEqual(fills.length, 3);
});

test('_drawWalls: is a no-op when walls array is empty', () => {
  const sim = createSim();
  sim._walls = [];
  const ctx = makeRecordingCtx();
  sim._drawWalls(ctx, 1);
  const fills = ctx.ops.filter(o => o.op === 'fillRect');
  assert.strictEqual(fills.length, 0);
});

test('_drawWalls: scales coordinates by s', () => {
  const sim = createSim();
  sim._walls = [{ cfg: { x: 100, y: 200, w: 50, h: 60 }, body: null }];
  const ctx = makeRecordingCtx();
  sim._drawWalls(ctx, 0.5);
  const fill = ctx.ops.find(o => o.op === 'fillRect');
  assert.strictEqual(fill.args[0], 100 * 0.5);
  assert.strictEqual(fill.args[2], 50 * 0.5);
  assert.strictEqual(fill.args[3], 60 * 0.5);
});

test('_draw invokes _drawWalls (walls appear in the main render pipeline)', () => {
  const sim = createSim();
  sim._walls = [{ cfg: { x: 100, y: 200, w: 50, h: 60 }, body: null }];

  // Replace the canvas's 2D context with a recording one before calling _draw.
  const ctx = makeRecordingCtx();
  sim.ctx = ctx;

  sim._draw();

  const fill = ctx.ops.find(o => o.op === 'fillRect' &&
    o.args[0] === 100 && o.args[1] === 1143 - 200 - 60);
  assert.ok(fill, 'expected the wall to be drawn during _draw');
});
