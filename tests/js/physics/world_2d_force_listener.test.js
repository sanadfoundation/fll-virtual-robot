'use strict';

// Drives a fake PostSolve through World2D's listener path. Stubs Box2D so
// SetContactListener captures the listener instance, then invokes its
// PostSolve directly — bypasses real Box2D but verifies the
// userData-filter / per-port accumulator / drain-on-step contract.

const test   = require('node:test');
const assert = require('node:assert');

const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

function makeStubBox2d() {
  let listenerInstance = null;

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
    set_userData(u) { this.userData = u; }
  }
  function makeBody() {
    return {
      fixtures: [],
      SetTransform() {}, SetLinearVelocity() {}, SetAngularVelocity() {},
      SetAwake() {}, GetPosition() { return makeVec2(); }, GetAngle() { return 0; },
      CreateFixture(fd) { this.fixtures.push(fd); },
    };
  }
  class b2World {
    constructor() {}
    CreateBody() { return makeBody(); }
    Step() {}
    SetContactListener(l) { listenerInstance = l; }
  }
  // box2d-wasm exposes JSContactListener as the JS-overridable subclass.
  // Construct one and let the World2D code Object.assign overrides on it.
  class JSContactListener {}

  return {
    stub: {
      b2Vec2, b2BodyDef, b2PolygonShape, b2FixtureDef, b2World, JSContactListener,
      b2_kinematicBody: 'kinematic', b2_dynamicBody: 'dynamic',
      destroy: () => {},
    },
    getListener: () => listenerInstance,
  };
}

// Shim a fake b2Contact + b2ContactImpulse around two given userData values
// and an array of per-manifold-point normal impulses.
function fakeContact(udA, udB, impulses) {
  return {
    contact: {
      GetFixtureA: () => ({ GetUserData: () => udA }),
      GetFixtureB: () => ({ GetUserData: () => udB }),
    },
    impulse: {
      get_normalImpulses: () => impulses,
      // Some box2d-wasm builds expose .normalImpulses() as a getter array;
      // accommodate both with a "raw" fallback in the listener.
      normalImpulses: impulses,
      get_count: () => impulses.length,
    },
  };
}

async function makeWorld() {
  const { World2D } = await import('../../../js/world_2d.js');
  const { stub, getListener } = makeStubBox2d();
  const world = new World2D();
  await world.init(stub);
  return { world, getListener };
}

test('init: attaches a contact listener to the world', async () => {
  const { getListener } = await makeWorld();
  assert.ok(getListener(), 'listener was registered via SetContactListener');
});

test('PostSolve: ignores contacts with no force-sensor userData', async () => {
  const { world, getListener } = await makeWorld();
  const L = getListener();
  const c = fakeContact(null, null, [3.0]);
  L.PostSolve(c.contact, c.impulse);
  const result = world.step(1 / 60);
  assert.deepStrictEqual(result.force_impulses, {});
});

test('PostSolve: accumulates impulses for the matching port', async () => {
  const { world, getListener } = await makeWorld();
  const L = getListener();
  const ud = { kind: 'force_sensor', port: 'C' };
  L.PostSolve(...Object.values(fakeContact(ud, null, [2.0, 0.5])));
  L.PostSolve(...Object.values(fakeContact(null, ud, [1.5])));
  const result = world.step(1 / 60);
  assert.ok(close(result.force_impulses.C, 4.0), `total=${result.force_impulses.C}`);
});

test('step: drains the accumulator each call', async () => {
  const { world, getListener } = await makeWorld();
  const L = getListener();
  const ud = { kind: 'force_sensor', port: 'C' };
  L.PostSolve(...Object.values(fakeContact(ud, null, [1.0])));
  const r1 = world.step(1 / 60);
  assert.ok(close(r1.force_impulses.C, 1.0));
  const r2 = world.step(1 / 60);
  assert.deepStrictEqual(r2.force_impulses, {}, 'accumulator drained after step');
});

test('step: handles non-force-sensor userData (e.g. unrelated tag) by ignoring', async () => {
  const { world, getListener } = await makeWorld();
  const L = getListener();
  L.PostSolve(...Object.values(fakeContact({ kind: 'other' }, null, [9.0])));
  const r = world.step(1 / 60);
  assert.deepStrictEqual(r.force_impulses, {});
});
