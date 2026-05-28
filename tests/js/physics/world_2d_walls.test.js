'use strict';

// TDD tests for World2D.addWallBox and World2D.removeBody.
// Uses the same makeStubBox2d pattern as world_2d_bumper.test.js.

const test   = require('node:test');
const assert = require('node:assert');

const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

function makeStubBox2d() {
  const calls = [];
  const log = (entry) => calls.push(entry);

  // Pointer table: every JS object the stub hands out gets a unique int ptr.
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
    constructor(x, y) {
      this.x = x; this.y = y;
      this.get_x = () => x; this.get_y = () => y;
      log({ op: 'b2Vec2', x, y });
    }
  }
  class b2BodyDef {
    constructor() { this.props = {}; }
    set_type(t)            { this.props.type = t; log({ op: 'set_type', t }); }
    set_position(p)        { this.props.position = { x: p.x, y: p.y }; }
    set_angle(a)           { this.props.angle = a; }
    set_linearDamping(d)   { this.props.linearDamping = d; }
    set_angularDamping(d)  { this.props.angularDamping = d; }
  }
  class b2PolygonShape {
    SetAsBox(hx, hy, centre, angle) {
      this.hx = hx; this.hy = hy;
      this.cx = centre ? centre.x : undefined;
      this.cy = centre ? centre.y : undefined;
      this.angle = angle;
      log({ op: 'SetAsBox', hx, hy, cx: this.cx, cy: this.cy, angle });
    }
  }
  class b2FixtureDef {
    set_shape(s)       { this.shape = s; }
    set_density(d)     { this.density = d; log({ op: 'set_density', d }); }
    set_friction(f)    { this.friction = f; log({ op: 'set_friction', f }); }
    set_restitution(r) { this.restitution = r; log({ op: 'set_restitution', r }); }
  }
  let nextBodyId = 0;
  function makeBody(def) {
    const id = nextBodyId++;
    const fixtures = [];
    return track({
      id, def, fixtures,
      pos: makeVec2(def.props.position?.x || 0, def.props.position?.y || 0),
      angle: def.props.angle || 0,
      SetTransform()       {},
      SetLinearVelocity()  {},
      SetAngularVelocity() {},
      SetAwake()           {},
      GetPosition() { return this.pos; },
      GetAngle()    { return this.angle; },
      CreateFixture(fd) {
        const fixture = track({
          shape: fd.shape && { hx: fd.shape.hx, hy: fd.shape.hy,
                               cx: fd.shape.cx, cy: fd.shape.cy },
          friction:    fd.friction,
          restitution: fd.restitution,
          density:     fd.density,
        });
        fixtures.unshift(fixture);  // head = newest
        log({ op: 'CreateFixture', body: id,
              shape: fixture.shape,
              friction: fixture.friction,
              restitution: fixture.restitution,
              density: fixture.density });
      },
      GetFixtureList() { return fixtures[0] || null; },
    });
  }
  const destroyedObjs = [];
  class b2World {
    constructor() { this.bodies = []; this.destroyedBodies = []; }
    CreateBody(def) {
      const b = makeBody(def);
      this.bodies.push(b);
      return b;
    }
    Step() {}
    SetContactListener() {}
    DestroyBody(body) {
      log({ op: 'DestroyBody', body });
      this.destroyedBodies.push(body);
    }
  }
  class JSContactListener {}
  return {
    stub: {
      b2Vec2, b2BodyDef, b2PolygonShape, b2FixtureDef, b2World, JSContactListener,
      b2_kinematicBody: 'kinematic',
      b2_dynamicBody:   'dynamic',
      b2_staticBody:    'static',
      b2Contact:        'b2Contact',
      b2ContactImpulse: 'b2ContactImpulse',
      destroy: (obj) => { log({ op: 'destroy', obj }); destroyedObjs.push(obj); },
      wrapPointer: (ptr) => ptrToObj.get(ptr) || null,
      getPointer:  (obj) => obj ? (objToPtr.get(obj) || 0) : 0,
    },
    calls,
    destroyedObjs,
  };
}

async function makeWorld() {
  const { World2D } = await import('../../../js/world_2d.js');
  const { stub, calls, destroyedObjs } = makeStubBox2d();
  const world = new World2D();
  await world.init(stub);
  return { world, stub, calls, destroyedObjs };
}

// ── addWallBox ────────────────────────────────────────────────────────────────

test('addWallBox: returns a body created with b2_staticBody type', async () => {
  const { world, calls } = await makeWorld();
  calls.length = 0;  // clear init noise
  world.addWallBox(50, 30, { x: 100, y: 200 });
  const typeCall = calls.find(c => c.op === 'set_type');
  assert.ok(typeCall, 'set_type should have been called');
  assert.strictEqual(typeCall.t, 'static', 'body type must be b2_staticBody');
});

test('addWallBox: converts position_mm to metres (divides by 1000)', async () => {
  const { world, calls } = await makeWorld();
  calls.length = 0;
  world.addWallBox(50, 30, { x: 300, y: 600 });
  // b2Vec2 is called with position in metres
  const vecCalls = calls.filter(c => c.op === 'b2Vec2');
  // One of the b2Vec2 calls should be for the position
  const posVec = vecCalls.find(c => close(c.x, 0.3) && close(c.y, 0.6));
  assert.ok(posVec, `expected b2Vec2(0.3, 0.6) for position, got ${JSON.stringify(vecCalls)}`);
});

test('addWallBox: SetAsBox called with half-extents in metres', async () => {
  const { world, calls } = await makeWorld();
  calls.length = 0;
  world.addWallBox(60, 40, { x: 0, y: 0 });
  const sab = calls.find(c => c.op === 'SetAsBox');
  assert.ok(sab, 'SetAsBox must be called');
  assert.ok(close(sab.hx, 0.06), `hx expected 0.06 got ${sab.hx}`);
  assert.ok(close(sab.hy, 0.04), `hy expected 0.04 got ${sab.hy}`);
});

test('addWallBox: fixture has friction 0.5 and restitution 0.05 (no density for static)', async () => {
  const { world, calls } = await makeWorld();
  calls.length = 0;
  world.addWallBox(50, 30, { x: 0, y: 0 });
  const fix = calls.find(c => c.op === 'CreateFixture');
  assert.ok(fix, 'CreateFixture must be called');
  assert.ok(close(fix.friction, 0.5),    `friction expected 0.5 got ${fix.friction}`);
  assert.ok(close(fix.restitution, 0.05), `restitution expected 0.05 got ${fix.restitution}`);
  // Static body — no density set
  const densityCall = calls.find(c => c.op === 'set_density');
  assert.strictEqual(densityCall, undefined, 'set_density must NOT be called for a static wall');
});

test('addWallBox: intermediate b2 objects (BodyDef, b2Vec2, PolygonShape, FixtureDef) are destroyed', async () => {
  const { world, calls, destroyedObjs } = await makeWorld();
  calls.length = 0;
  destroyedObjs.length = 0;
  world.addWallBox(50, 30, { x: 100, y: 200 });
  const destroyCalls = calls.filter(c => c.op === 'destroy');
  // Expect at least 4 destroy calls: bd, pos, shape, fd
  assert.ok(destroyCalls.length >= 4,
    `expected at least 4 destroy calls, got ${destroyCalls.length}`);
});

// ── removeBody ────────────────────────────────────────────────────────────────

test('removeBody: calls world.DestroyBody with the given body', async () => {
  const { world, calls } = await makeWorld();
  const body = world.addWallBox(50, 30, { x: 0, y: 0 });
  calls.length = 0;
  world.removeBody(body);
  const dc = calls.find(c => c.op === 'DestroyBody');
  assert.ok(dc, 'DestroyBody must be called');
  assert.strictEqual(dc.body, body, 'DestroyBody must receive the exact body');
});

test('removeBody: is a no-op when body is null', async () => {
  const { world, calls } = await makeWorld();
  calls.length = 0;
  assert.doesNotThrow(() => world.removeBody(null));
  const dc = calls.find(c => c.op === 'DestroyBody');
  assert.strictEqual(dc, undefined, 'DestroyBody must NOT be called when body is null');
});

test('removeBody: is a no-op when body is undefined', async () => {
  const { world, calls } = await makeWorld();
  calls.length = 0;
  assert.doesNotThrow(() => world.removeBody(undefined));
  const dc = calls.find(c => c.op === 'DestroyBody');
  assert.strictEqual(dc, undefined, 'DestroyBody must NOT be called when body is undefined');
});

test('removeBody: is a no-op when this.world is null', async () => {
  const { world } = await makeWorld();
  const body = world.addWallBox(50, 30, { x: 0, y: 0 });
  const savedWorld = world.world;
  world.world = null;
  assert.doesNotThrow(() => world.removeBody(body));
  world.world = savedWorld;  // restore so the world can be GC'd cleanly
});
