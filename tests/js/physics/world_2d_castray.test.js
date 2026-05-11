'use strict';

// Boundary tests for World2D.castRay. Like world_2d_boundary.test.js, this
// drives a stub Box2D module — we verify mm/m conversion at the public API
// and that the RayCastCallback wiring is correct, without booting real WASM.

const test   = require('node:test');
const assert = require('node:assert');

const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// Build a stub box2d module that records castRay-relevant calls and lets the
// test script the fixtures the world's RayCast iterates over.
function makeStubBox2dForCastRay(scriptedFixtures = []) {
  const calls = [];
  const log = (entry) => calls.push(entry);

  class b2Vec2 {
    constructor(x = 0, y = 0) {
      this.x = x; this.y = y;
      this.get_x = () => this.x;
      this.get_y = () => this.y;
      log({ op: 'b2Vec2', x, y });
    }
  }

  class b2BodyDef {
    constructor() { this.props = {}; }
    set_type(t)            { this.props.type = t; }
    set_position(p)        { this.props.position = { x: p.x, y: p.y }; }
    set_angle(a)           { this.props.angle = a; }
    set_linearDamping(d)   { this.props.linearDamping = d; }
    set_angularDamping(d)  { this.props.angularDamping = d; }
  }

  class b2PolygonShape {
    SetAsBox(hx, hy) { this.hx = hx; this.hy = hy; }
  }

  class b2FixtureDef {
    set_shape(s)         { this.shape = s; }
    set_density(d)       { this.density = d; }
    set_friction(f)      { this.friction = f; }
    set_restitution(r)   { this.restitution = r; }
  }

  // b2Fixture is a marker class — wrapPointer hands one back when given a
  // pre-built fixture pointer.
  class b2Fixture {}

  let nextBodyId = 1;             // start from 1; getPointer(null) returns 0
  function makeBody(def) {
    const id = nextBodyId++;
    const body = {
      _ptr: id,                     // stub stand-in for the Emscripten raw pointer
      pos:    new b2Vec2(def.props.position?.x || 0, def.props.position?.y || 0),
      angle:  def.props.angle || 0,
      SetTransform()        {},
      SetLinearVelocity()   {},
      SetAngularVelocity()  {},
      SetAwake()            {},
      GetPosition() { return this.pos; },
      GetAngle()    { return this.angle; },
      CreateFixture() {},
    };
    return body;
  }

  // JSRayCastCallback is a no-op base class in real box2d-wasm; tests drive
  // ReportFixture by setting it from World2D.castRay.
  class JSRayCastCallback {}
  // JSContactListener is the JS-overridable contact listener — the force
  // sensor's PostSolve override hangs off this. The castRay tests don't fire
  // contacts, so a no-op subclass is enough.
  class JSContactListener {}

  class b2World {
    constructor(gravity) { this.gravity = { x: gravity.x, y: gravity.y }; }
    CreateBody(def) { return makeBody(def); }
    Step() {}
    SetContactListener() {}

    // Replay scripted fixtures against the callback. Each entry has:
    //   { bodyA, fraction, point: {x, y}, normal: {x, y} }
    // bodyA is the value we'll plant into fixture.GetBody().a so the
    // exclude-body filter can be exercised. fraction is metres-space.
    RayCast(cb, p1, p2) {
      log({ op: 'RayCast', p1: { x: p1.x, y: p1.y }, p2: { x: p2.x, y: p2.y } });
      let bestFrac = 1.0;
      for (const f of scriptedFixtures) {
        if (f.fraction > bestFrac) continue;
        const ret = cb.ReportFixture(
          { _kind: 'fixture', bodyPtr: f.bodyPtr },
          { x: f.point.x,  y: f.point.y  },
          { x: f.normal.x, y: f.normal.y },
          f.fraction,
        );
        if (ret >= 0 && ret < bestFrac) bestFrac = ret;
      }
    }
  }

  const stub = {
    b2Vec2, b2BodyDef, b2PolygonShape, b2FixtureDef, b2World,
    b2Fixture, JSRayCastCallback, JSContactListener,
    b2Contact:        'b2Contact',
    b2ContactImpulse: 'b2ContactImpulse',
    b2_kinematicBody: 'kinematic',
    b2_dynamicBody:   'dynamic',
    // wrapPointer for a fixture: hand back an object whose GetBody() returns a
    // body wrapper carrying its identity in `_ptr`. For points/normals we wrap
    // them as b2Vec2-like objects.
    wrapPointer: (ptr, type) => {
      if (type === b2Fixture) {
        return { GetBody: () => ({ _ptr: ptr.bodyPtr }) };
      }
      // b2Vec2-like
      return { get_x: () => ptr.x, get_y: () => ptr.y };
    },
    // box2d-wasm exposes getPointer(obj) → raw Emscripten pointer (Number).
    // The stub stores identity in `_ptr` on body wrappers. For real bodies
    // created via CreateBody we tag them with `_ptr = id` (see makeBody).
    getPointer: (obj) => (obj && obj._ptr) | 0,
    destroy: () => {},
  };
  return { stub, calls };
}

async function makeWorld(scriptedFixtures) {
  const { World2D } = await import('../../../js/world_2d.js');
  const { stub, calls } = makeStubBox2dForCastRay(scriptedFixtures);
  const world = new World2D();
  await world.init(stub);
  return { world, stub, calls };
}

// ── castRay ─────────────────────────────────────────────────────────────────

test('castRay: empty world returns hit=false at maxDistMm', async () => {
  const { world } = await makeWorld([]);
  const r = world.castRay({ x: 100, y: 200 }, 0, 2000);
  assert.strictEqual(r.hit, false);
  assert.strictEqual(r.distanceMm, 2000);
  assert.strictEqual(r.point, null);
  assert.strictEqual(r.normal, null);
});

test('castRay: origin and far endpoint are converted mm → m before world.RayCast', async () => {
  const { world, calls } = await makeWorld([]);
  // 0° direction = +X; 1000 mm origin, 2000 mm range → far end at 3 m on X.
  world.castRay({ x: 1000, y: 500 }, 0, 2000);
  const ray = calls.find(c => c.op === 'RayCast');
  assert.ok(close(ray.p1.x, 1.000), `p1.x=${ray.p1.x}`);
  assert.ok(close(ray.p1.y, 0.500), `p1.y=${ray.p1.y}`);
  assert.ok(close(ray.p2.x, 3.000), `p2.x=${ray.p2.x}`);
  assert.ok(close(ray.p2.y, 0.500), `p2.y=${ray.p2.y}`);
});

test('castRay: direction π/2 (north in math y-up) places far endpoint along +Y', async () => {
  const { world, calls } = await makeWorld([]);
  world.castRay({ x: 0, y: 0 }, Math.PI / 2, 1000);
  const ray = calls.find(c => c.op === 'RayCast');
  assert.ok(close(ray.p1.x, 0));
  assert.ok(close(ray.p1.y, 0));
  assert.ok(close(ray.p2.x, 0,    1e-12));
  assert.ok(close(ray.p2.y, 1.0,  1e-12));
});

test('castRay: hit fraction 0.25 with maxDist 2000 → distanceMm 500', async () => {
  const { world } = await makeWorld([
    { bodyPtr: 1, fraction: 0.25, point: { x: 0.5, y: 0 }, normal: { x: -1, y: 0 } },
  ]);
  const r = world.castRay({ x: 0, y: 0 }, 0, 2000);
  assert.strictEqual(r.hit, true);
  assert.strictEqual(r.distanceMm, 500);
});

test('castRay: hit point converted m → mm on the way out', async () => {
  const { world } = await makeWorld([
    { bodyPtr: 1, fraction: 0.5, point: { x: 1.234, y: 0.567 }, normal: { x: 0, y: 1 } },
  ]);
  const r = world.castRay({ x: 0, y: 0 }, 0, 2000);
  assert.ok(close(r.point.x, 1234, 1e-6));
  assert.ok(close(r.point.y,  567, 1e-6));
});

test('castRay: normal passes through unchanged (already unit, dimensionless)', async () => {
  const { world } = await makeWorld([
    { bodyPtr: 1, fraction: 0.5, point: { x: 0, y: 0 }, normal: { x: 0.6, y: -0.8 } },
  ]);
  const r = world.castRay({ x: 0, y: 0 }, 0, 2000);
  assert.ok(close(r.normal.x,  0.6));
  assert.ok(close(r.normal.y, -0.8));
});

test('castRay: returns the closest fixture when multiple report', async () => {
  // Box2D's "find closest" recipe relies on the callback returning the fraction
  // to clamp; the stub's RayCast skips later entries past the current bestFrac.
  // We list the closer one first so it sets the clamp before the farther one.
  const { world } = await makeWorld([
    { bodyPtr: 1, fraction: 0.10, point: { x: 0.2, y: 0 }, normal: { x: -1, y: 0 } },
    { bodyPtr: 2, fraction: 0.50, point: { x: 1.0, y: 0 }, normal: { x: -1, y: 0 } },
  ]);
  const r = world.castRay({ x: 0, y: 0 }, 0, 2000);
  assert.strictEqual(r.distanceMm, 200);
  assert.ok(close(r.point.x, 200, 1e-6));
});

test('castRay: excludeBody filters by .a pointer (NOT object identity)', async () => {
  const { world } = await makeWorld([
    { bodyPtr: 7, fraction: 0.10, point: { x: 0.2, y: 0 }, normal: { x: -1, y: 0 } },
    { bodyPtr: 9, fraction: 0.50, point: { x: 1.0, y: 0 }, normal: { x: -1, y: 0 } },
  ]);
  // Pretend body 7 is the robot; we should hit body 9 instead.
  const r = world.castRay({ x: 0, y: 0 }, 0, 2000, { excludeBody: { _ptr: 7 } });
  assert.strictEqual(r.distanceMm, 1000);
});

test('castRay: excludeBody only skips fixtures whose body matches', async () => {
  const { world } = await makeWorld([
    { bodyPtr: 7, fraction: 0.30, point: { x: 0.6, y: 0 }, normal: { x: -1, y: 0 } },
  ]);
  // Excluding a different body shouldn't filter our scripted hit.
  const r = world.castRay({ x: 0, y: 0 }, 0, 2000, { excludeBody: { _ptr: 99 } });
  assert.strictEqual(r.distanceMm, 600);
});

test('castRay: cleans up b2Vec2 allocations after each call', async () => {
  const { world, stub } = await makeWorld([]);
  let destroyed = 0;
  stub.destroy = () => { destroyed++; };
  world.castRay({ x: 0, y: 0 }, 0, 1000);
  // Two b2Vec2 (p1, p2) + one JSRayCastCallback ⇒ 3 destroys per call.
  assert.strictEqual(destroyed, 3);
});
