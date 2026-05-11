'use strict';

// Boundary-conversion + body-local-offset tests for World2D.addBumper.
// Pumps a stub Box2D module through World2D and asserts the second fixture
// is welded to the robot body at the right body-local offset and recorded
// in the world's bumper-pointer map.
//
// The stub mirrors box2d-wasm 7.0.0 in two relevant respects: PostSolve
// would be called with emscripten pointers (not exercised here) and
// fixtures don't round-trip JS objects through set_userData — so the bumper
// is identified by pointer address via world._bumperPorts. The stub
// exposes wrapPointer / getPointer / GetFixtureList for that pattern.

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
    set_type(t)            { this.props.type = t; }
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
    set_density(d)     { this.density = d; }
    set_friction(f)    { this.friction = f; }
    set_restitution(r) { this.restitution = r; }
  }
  let nextBodyId = 0;
  function makeBody(def) {
    const id = nextBodyId++;
    // Fixtures are stored in insertion order; GetFixtureList returns the
    // most-recently-added (matching Box2D's linked-list "newest at head").
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
        });
        fixtures.unshift(fixture);  // head = newest
        log({ op: 'CreateFixture', body: id, shape: fixture.shape });
      },
      GetFixtureList() { return fixtures[0] || null; },
    });
  }
  class b2World {
    constructor() { this.bodies = []; }
    CreateBody(def) {
      const b = makeBody(def);
      this.bodies.push(b);
      return b;
    }
    Step() {}
    SetContactListener() {}
  }
  class JSContactListener {}
  return {
    stub: {
      b2Vec2, b2BodyDef, b2PolygonShape, b2FixtureDef, b2World, JSContactListener,
      b2_kinematicBody: 'kinematic', b2_dynamicBody: 'dynamic',
      b2Contact:        'b2Contact',
      b2ContactImpulse: 'b2ContactImpulse',
      destroy: () => {},
      wrapPointer: (ptr) => ptrToObj.get(ptr) || null,
      getPointer:  (obj) => obj ? (objToPtr.get(obj) || 0) : 0,
    },
    calls,
  };
}

async function makeWorld() {
  const { World2D } = await import('../../../js/world_2d.js');
  const { stub, calls } = makeStubBox2d();
  const world = new World2D();
  await world.init(stub);
  return { world, stub, calls };
}

test('addBumper: appends a CreateFixture call to the same body', async () => {
  const { world, calls } = await makeWorld();
  const body = world.addRobot(100, 80, { x: 350, y: 163 });
  const before = calls.filter(c => c.op === 'CreateFixture').length;
  world.addBumper(body, 5, 15, 105, 0, { kind: 'force_sensor', port: 'C' });
  const after = calls.filter(c => c.op === 'CreateFixture').length;
  assert.strictEqual(after, before + 1);
});

test('addBumper: half-extents converted mm → m', async () => {
  const { world, calls } = await makeWorld();
  const body = world.addRobot(100, 80, { x: 0, y: 0 });
  calls.length = 0;
  world.addBumper(body, 5, 15, 105, 0, { kind: 'force_sensor', port: 'C' });
  const fix = calls.find(c => c.op === 'CreateFixture');
  assert.ok(close(fix.shape.hx, 0.005), `hx=${fix.shape.hx}`);
  assert.ok(close(fix.shape.hy, 0.015), `hy=${fix.shape.hy}`);
});

test('addBumper: body-local offset converted mm → m via SetAsBox centre', async () => {
  const { world, calls } = await makeWorld();
  const body = world.addRobot(100, 80, { x: 0, y: 0 });
  calls.length = 0;
  world.addBumper(body, 5, 15, 105, 0, { kind: 'force_sensor', port: 'C' });
  const fix = calls.find(c => c.op === 'CreateFixture');
  assert.ok(close(fix.shape.cx, 0.105), `cx=${fix.shape.cx}`);
  assert.ok(close(fix.shape.cy, 0.000), `cy=${fix.shape.cy}`);
});

test('addBumper: records new fixture pointer in _bumperPorts keyed on userData.port', async () => {
  const { world, stub } = await makeWorld();
  const body = world.addRobot(100, 80, { x: 0, y: 0 });
  assert.strictEqual(world._bumperPorts.size, 0);
  world.addBumper(body, 5, 15, 105, 0, { kind: 'force_sensor', port: 'C' });
  assert.strictEqual(world._bumperPorts.size, 1);
  // The recorded pointer should resolve back to the head fixture of the body.
  const headFixture = body.GetFixtureList();
  const ptr = stub.getPointer(headFixture);
  assert.strictEqual(world._bumperPorts.get(ptr), 'C',
    'bumper fixture pointer maps to port C');
});

test('addBumper: skips recording when userData has no port', async () => {
  const { world } = await makeWorld();
  const body = world.addRobot(100, 80, { x: 0, y: 0 });
  world.addBumper(body, 5, 15, 105, 0, undefined);
  assert.strictEqual(world._bumperPorts.size, 0);
});
