'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// Inject a stubbed physics + robotBody onto a sim. createSim leaves
// physics=null because the vm context can't dynamic-import world_2d.js
// (see simulator.js:163-171), so for these tests we stand in our own.
function withStubPhysics(sim, castRayResult) {
  const calls = [];
  sim.robotBody = { a: 42 };
  sim.physics = {
    castRay(originMm, directionRad, maxDistMm, opts) {
      calls.push({ originMm, directionRad, maxDistMm, opts });
      return castRayResult;
    },
  };
  return calls;
}

// Math y-up: from default mount (350, 251) heading 90° (north), 500 mm
// forward lands at (350, 751). Normal (0, -1) faces back toward the sensor.
const HIT_AT_500 = {
  hit: true, distanceMm: 500,
  point: { x: 350, y: 751 }, normal: { x: 0, y: -1 },
};
const NO_HIT = {
  hit: false, distanceMm: 2000, point: null, normal: null,
};

// ── _updateDistanceSensor ──────────────────────────────────────────────────

test('_updateDistanceSensor: no-op when physics is null', () => {
  const sim = createSim();
  // physics remains null (createSim couldn't load world_2d).
  sim._updateDistanceSensor();
  // distanceMM unchanged from default; no throw.
  assert.strictEqual(sim.robot.sensors.distanceMM, 9999);
  assert.strictEqual(sim.robot.sensors.distanceHit, null);
  assert.strictEqual(sim.robot.sensors.distanceOrigin, null);
});

test('_updateDistanceSensor: no-op when robotBody is null', () => {
  const sim = createSim();
  sim.physics = { castRay: () => { throw new Error('should not be called'); } };
  sim.robotBody = null;
  assert.doesNotThrow(() => sim._updateDistanceSensor());
});

test('_updateDistanceSensor: passes mount origin and heading-radians to castRay', () => {
  const sim = createSim();
  // Default spawn (350, 163) heading 90° (math y-up, north).
  // Mount = (350, 163 + 88) = (350, 251). angleRad = π/2.
  const calls = withStubPhysics(sim, NO_HIT);
  sim._updateDistanceSensor();
  assert.strictEqual(calls.length, 1);
  const c = calls[0];
  assert.ok(close(c.originMm.x, 350, 1e-6));
  assert.ok(close(c.originMm.y, 251, 1e-6));
  assert.ok(close(c.directionRad, Math.PI / 2));
  assert.strictEqual(c.maxDistMm, 2000);
  assert.strictEqual(c.opts.excludeBody, sim.robotBody);
});

test('_updateDistanceSensor: hit → sets distanceMM, distanceHit, distanceOrigin', () => {
  const sim = createSim();
  withStubPhysics(sim, HIT_AT_500);
  sim._updateDistanceSensor();
  assert.strictEqual(sim.robot.sensors.distanceMM, 500);
  assert.deepStrictEqual(sim.robot.sensors.distanceHit, { x: 350, y: 751 });
  assert.ok(close(sim.robot.sensors.distanceOrigin.x, 350, 1e-6));
  assert.ok(close(sim.robot.sensors.distanceOrigin.y, 251, 1e-6));
});

test('_updateDistanceSensor: miss → distanceMM = 9999, distanceHit = null', () => {
  const sim = createSim();
  withStubPhysics(sim, NO_HIT);
  sim._updateDistanceSensor();
  assert.strictEqual(sim.robot.sensors.distanceMM, 9999);
  assert.strictEqual(sim.robot.sensors.distanceHit, null);
  assert.ok(sim.robot.sensors.distanceOrigin); // origin still set so overlay can draw the dashed ray
});

// ── getter recompute ───────────────────────────────────────────────────────

test('getDistanceSensorValue: triggers _updateDistanceSensor on read', () => {
  const sim = createSim();
  const calls = withStubPhysics(sim, HIT_AT_500);
  const v = sim.getDistanceSensorValue();
  assert.strictEqual(v, 500);
  assert.strictEqual(calls.length, 1);
});

test('getDistanceSensorPresence: triggers _updateDistanceSensor on read', () => {
  const sim = createSim();
  const calls = withStubPhysics(sim, { hit: true, distanceMm: 50, point: { x: 0, y: 0 }, normal: { x: 0, y: 0 } });
  const p = sim.getDistanceSensorPresence();
  assert.strictEqual(p, true);            // 50 < 100
  assert.strictEqual(calls.length, 1);
});

test('getDistanceSensorPresence: false when OOR sentinel returned', () => {
  const sim = createSim();
  withStubPhysics(sim, NO_HIT);
  assert.strictEqual(sim.getDistanceSensorPresence(), false);
});

test('getDistanceSensorValue: works with physics=null (returns OOR sentinel)', () => {
  const sim = createSim();
  // No stub injection — physics stays null.
  assert.strictEqual(sim.getDistanceSensorValue(), 9999);
});

// ── _drawDistanceSensorRay (rendering, light coverage) ─────────────────────

function fakeCtx() {
  const calls = [];
  return new Proxy({ calls, save: () => calls.push({ op: 'save' }), restore: () => calls.push({ op: 'restore' }) }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      // Returning a function for any property covers fillStyle/strokeStyle as
      // assignable too — assignments hit the set trap instead.
      return (...args) => calls.push({ op: prop, args });
    },
    set(target, prop, value) {
      calls.push({ op: 'set:' + prop, value });
      return true;
    },
  });
}

test('_drawDistanceSensorRay: no-op when distanceOrigin is null', () => {
  const sim = createSim();
  const ctx = fakeCtx();
  sim._drawDistanceSensorRay(ctx, 1);
  assert.strictEqual(ctx.calls.length, 0);
});

test('_drawDistanceSensorRay: in-range draws line, hit dot, and label', () => {
  const sim = createSim();
  // Math y-up: robot facing north, sensor 251 mm up, hit 500 mm further up.
  sim.robot.sensors.distanceMM     = 500;
  sim.robot.sensors.distanceHit    = { x: 350, y: 751 };
  sim.robot.sensors.distanceOrigin = { x: 350, y: 251 };
  const ctx = fakeCtx();
  sim._drawDistanceSensorRay(ctx, 1);
  // Stroke for the ray + arc for the hit dot + fill/stroke for the label.
  assert.ok(ctx.calls.some(c => c.op === 'stroke'),    'stroked the ray');
  assert.ok(ctx.calls.some(c => c.op === 'arc'),       'arced the hit dot');
  assert.ok(ctx.calls.some(c => c.op === 'fillText'  && /500 mm/.test(c.args[0])),
            'rendered the mm label');
});

test('_drawDistanceSensorRay: out-of-range draws faint dashed ray, no label', () => {
  const sim = createSim();
  sim.robot.sensors.distanceMM     = 9999;
  sim.robot.sensors.distanceHit    = null;
  sim.robot.sensors.distanceOrigin = { x: 350, y: 251 };
  const ctx = fakeCtx();
  sim._drawDistanceSensorRay(ctx, 1);
  assert.ok(ctx.calls.some(c => c.op === 'stroke'), 'stroked the dashed ray');
  assert.ok(!ctx.calls.some(c => c.op === 'fillText'), 'no label out-of-range');
  assert.ok(!ctx.calls.some(c => c.op === 'arc'),      'no hit dot out-of-range');
});

test('_drawDistanceSensorRay: converts math y-up to canvas y-down at the boundary', () => {
  // Math (350, 251) → canvas (350, 1143-251) = (350, 892) for s=1.
  // Math (350, 751) → canvas (350, 1143-751) = (350, 392).
  const sim = createSim();
  sim.robot.sensors.distanceMM     = 500;
  sim.robot.sensors.distanceHit    = { x: 350, y: 751 };
  sim.robot.sensors.distanceOrigin = { x: 350, y: 251 };
  const ctx = fakeCtx();
  sim._drawDistanceSensorRay(ctx, 1);
  const moveTo = ctx.calls.find(c => c.op === 'moveTo');
  const lineTo = ctx.calls.find(c => c.op === 'lineTo');
  assert.strictEqual(moveTo.args[0], 350);
  assert.strictEqual(moveTo.args[1], 892);   // canvas y for math y=251
  assert.strictEqual(lineTo.args[0], 350);
  assert.strictEqual(lineTo.args[1], 392);   // canvas y for math y=751

  // Hit dot arc — same canvas-y as lineTo's endpoint.
  const arcCall = ctx.calls.find(c => c.op === 'arc');
  assert.strictEqual(arcCall.args[0], 350);
  assert.strictEqual(arcCall.args[1], 392);

  // Mid-ray label — perpendicular offset 20 mm to the west (heading north).
  // Math midpoint (350, 501); perp offset (-20, 0); label canvas-y = 1143 - 501 = 642.
  const textCall = ctx.calls.find(c => c.op === 'fillText');
  assert.strictEqual(textCall.args[1], 330);   // mx + px = 350 - 20
  assert.strictEqual(textCall.args[2], 642);   // canvas y for math y=501
});
