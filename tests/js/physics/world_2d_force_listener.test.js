'use strict';

// Drives a fake PostSolve through World2D's listener path. Stubs Box2D so
// SetContactListener captures the listener instance, then invokes its
// PostSolve directly — bypasses real Box2D but verifies the
// bumper-pointer / per-port accumulator / drain-on-step contract.
//
// The stub mirrors box2d-wasm 7.0.0 in one critical respect: PostSolve is
// called with emscripten POINTERS (integers), not JS objects. The stub
// exposes wrapPointer / getPointer so the listener (which dereferences
// pointers via the same module's wrapPointer) sees stable, round-tripping
// references in test the same way it does in production.

const test   = require('node:test');
const assert = require('node:assert');

const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

function makeStubBox2d() {
  let listenerInstance = null;

  // Pointer table: every JS object the stub hands out gets a unique int ptr
  // that round-trips through wrapPointer / getPointer.
  let nextPtr = 1000;
  const ptrToObj = new Map();
  const objToPtr = new WeakMap();
  function track(obj) {
    const ptr = nextPtr++;
    ptrToObj.set(ptr, obj);
    objToPtr.set(obj, ptr);
    return obj;
  }

  function makeVec2(x = 0, y = 0) {
    return { x, y, get_x: () => x, get_y: () => y };
  }
  class b2Vec2 {
    constructor(x, y) { this.x = x; this.y = y;
      this.get_x = () => x; this.get_y = () => y; }
  }
  class b2BodyDef { constructor() { this.props = {}; }
    set_type() {} set_position() {} set_angle() {}
    set_linearDamping() {} set_angularDamping() {} }
  class b2PolygonShape { SetAsBox() {} }
  class b2FixtureDef {
    set_shape() {} set_density() {} set_friction() {} set_restitution() {}
  }
  function makeBody() {
    return track({
      fixtures: [],
      SetTransform() {}, SetLinearVelocity() {}, SetAngularVelocity() {},
      SetAwake() {}, GetPosition() { return makeVec2(); }, GetAngle() { return 0; },
      CreateFixture() { /* not exercised in this file */ },
    });
  }
  class b2World {
    constructor() {}
    CreateBody() { return makeBody(); }
    Step() {}
    SetContactListener(l) { listenerInstance = l; }
  }
  class JSContactListener {}

  return {
    stub: {
      b2Vec2, b2BodyDef, b2PolygonShape, b2FixtureDef, b2World, JSContactListener,
      b2_kinematicBody: 'kinematic', b2_dynamicBody: 'dynamic',
      // Types passed to wrapPointer — the stub doesn't introspect them, but
      // production code expects them to exist.
      b2Contact:        'b2Contact',
      b2ContactImpulse: 'b2ContactImpulse',
      destroy: () => {},
      wrapPointer: (ptr /*, type */) => ptrToObj.get(ptr) || null,
      getPointer:  (obj) => obj ? (objToPtr.get(obj) || 0) : 0,
    },
    getListener: () => listenerInstance,
    track,
  };
}

// Builds a fake b2Contact + b2ContactImpulse, returns the integer pointers
// that PostSolve will receive. The contact references fixtures `fa` and `fb`
// (themselves already pointer-tracked by the caller).
function makeContact(track, getPointer, fa, fb, impulses) {
  const contact = track({
    GetFixtureA: () => fa,
    GetFixtureB: () => fb,
  });
  // box2d-wasm exposes get_normalImpulses(i) as an indexed getter, not as
  // an array returner. Match that signature here.
  const impulse = track({
    get_normalImpulses: (i) => impulses[i],
    get_count: () => impulses.length,
  });
  return { contactPtr: getPointer(contact), impulsePtr: getPointer(impulse) };
}

async function makeWorld() {
  const { World2D } = await import('../../../js/world_2d.js');
  const { stub, getListener, track } = makeStubBox2d();
  const world = new World2D();
  await world.init(stub);
  return { world, getListener, track, stub };
}

// Builds a fixture stub that's been pointer-tracked. If `port` is set, the
// fixture is registered as a bumper for that port on the world.
function makeFixture(world, track, getPointer, port) {
  const fixture = track({ /* opaque */ });
  if (port) {
    world._bumperPorts.set(getPointer(fixture), port);
  }
  return fixture;
}

test('init: attaches a contact listener to the world', async () => {
  const { getListener } = await makeWorld();
  assert.ok(getListener(), 'listener was registered via SetContactListener');
});

test('init: initialises an empty bumper-port map', async () => {
  const { world } = await makeWorld();
  assert.ok(world._bumperPorts instanceof Map, '_bumperPorts is a Map');
  assert.strictEqual(world._bumperPorts.size, 0);
});

test('PostSolve: ignores contacts with no bumper fixture', async () => {
  const { world, getListener, track, stub } = await makeWorld();
  const L = getListener();
  const fa = makeFixture(world, track, stub.getPointer, null);
  const fb = makeFixture(world, track, stub.getPointer, null);
  const { contactPtr, impulsePtr } = makeContact(track, stub.getPointer, fa, fb, [3.0]);
  L.PostSolve(contactPtr, impulsePtr);
  const result = world.step(1 / 60);
  assert.deepStrictEqual(result.force_impulses, {});
});

test('PostSolve: accumulates impulses when fixture A is the bumper', async () => {
  const { world, getListener, track, stub } = await makeWorld();
  const L = getListener();
  const bumper = makeFixture(world, track, stub.getPointer, 'C');
  const other  = makeFixture(world, track, stub.getPointer, null);
  const c = makeContact(track, stub.getPointer, bumper, other, [2.0, 0.5]);
  L.PostSolve(c.contactPtr, c.impulsePtr);
  const result = world.step(1 / 60);
  assert.ok(close(result.force_impulses.C, 2.5), `total=${result.force_impulses.C}`);
});

test('PostSolve: accumulates impulses when fixture B is the bumper', async () => {
  const { world, getListener, track, stub } = await makeWorld();
  const L = getListener();
  const other  = makeFixture(world, track, stub.getPointer, null);
  const bumper = makeFixture(world, track, stub.getPointer, 'C');
  const c = makeContact(track, stub.getPointer, other, bumper, [1.5]);
  L.PostSolve(c.contactPtr, c.impulsePtr);
  const result = world.step(1 / 60);
  assert.ok(close(result.force_impulses.C, 1.5), `total=${result.force_impulses.C}`);
});

test('PostSolve: sums across multiple contacts before draining', async () => {
  const { world, getListener, track, stub } = await makeWorld();
  const L = getListener();
  const bumper = makeFixture(world, track, stub.getPointer, 'C');
  const other  = makeFixture(world, track, stub.getPointer, null);
  const c1 = makeContact(track, stub.getPointer, bumper, other, [2.0, 0.5]);
  const c2 = makeContact(track, stub.getPointer, other, bumper, [1.5]);
  L.PostSolve(c1.contactPtr, c1.impulsePtr);
  L.PostSolve(c2.contactPtr, c2.impulsePtr);
  const result = world.step(1 / 60);
  assert.ok(close(result.force_impulses.C, 4.0), `total=${result.force_impulses.C}`);
});

test('step: drains the accumulator each call', async () => {
  const { world, getListener, track, stub } = await makeWorld();
  const L = getListener();
  const bumper = makeFixture(world, track, stub.getPointer, 'C');
  const other  = makeFixture(world, track, stub.getPointer, null);
  const c = makeContact(track, stub.getPointer, bumper, other, [1.0]);
  L.PostSolve(c.contactPtr, c.impulsePtr);
  const r1 = world.step(1 / 60);
  assert.ok(close(r1.force_impulses.C, 1.0));
  const r2 = world.step(1 / 60);
  assert.deepStrictEqual(r2.force_impulses, {}, 'accumulator drained after step');
});
