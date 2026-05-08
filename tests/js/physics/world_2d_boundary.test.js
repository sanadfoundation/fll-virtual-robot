'use strict';

// Boundary-conversion tests for World2D. Doesn't run Box2D — pumps a stub
// module through World2D.init() and asserts that mm/radian inputs at the
// public API arrive at the underlying engine in metres/radians.
//
// These tests catch regressions like "I forgot to multiply by M_PER_MM in
// setKinematicVelocity" — the exact failure mode that caused the 60-mm/s
// velocity-cap bug during prototype development.

const test   = require('node:test');
const assert = require('node:assert');

const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// Stub Box2D module — captures every constructor / method call into the
// shared `calls` array, exposes minimal surface for World2D to drive.
function makeStubBox2d() {
  const calls = [];
  const log = (entry) => calls.push(entry);

  function makeVec2(x = 0, y = 0) {
    return {
      x, y,
      get_x: () => x,
      get_y: () => y,
    };
  }

  class b2Vec2 {
    constructor(x, y) {
      this.x = x; this.y = y;
      this.get_x = () => x;
      this.get_y = () => y;
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
    set_shape(s)         { this.shape = s; }
    set_density(d)       { this.density = d; }
    set_friction(f)      { this.friction = f; }
    set_restitution(r)   { this.restitution = r; }
  }

  let nextBodyId = 0;
  function makeBody(def) {
    const id = nextBodyId++;
    const body = {
      id,
      def,
      pos:     makeVec2(def.props.position?.x || 0, def.props.position?.y || 0),
      angle:   def.props.angle || 0,
      linVel:  { x: 0, y: 0 },
      angVel:  0,
      fixtures: [],
      SetTransform(p, a) {
        this.pos = makeVec2(p.x, p.y);
        this.angle = a;
        log({ op: 'SetTransform', body: id, x: p.x, y: p.y, a });
      },
      SetLinearVelocity(v) {
        this.linVel = { x: v.x, y: v.y };
        log({ op: 'SetLinearVelocity', body: id, x: v.x, y: v.y });
      },
      SetAngularVelocity(w) {
        this.angVel = w;
        log({ op: 'SetAngularVelocity', body: id, w });
      },
      SetAwake(b) { log({ op: 'SetAwake', body: id, b }); },
      GetPosition() { return this.pos; },
      GetAngle()    { return this.angle; },
      CreateFixture(fd) {
        this.fixtures.push(fd);
        log({ op: 'CreateFixture', body: id,
              density: fd.density, friction: fd.friction, restitution: fd.restitution,
              shape: fd.shape && { hx: fd.shape.hx, hy: fd.shape.hy, cx: fd.shape.cx, cy: fd.shape.cy }
        });
      },
    };
    return body;
  }

  class b2World {
    constructor(gravity) {
      this.gravity = { x: gravity.x, y: gravity.y };
      this.bodies = [];
      log({ op: 'b2World', gx: gravity.x, gy: gravity.y });
    }
    CreateBody(def) {
      const b = makeBody(def);
      this.bodies.push(b);
      log({ op: 'CreateBody', body: b.id, type: def.props.type,
            x: def.props.position?.x, y: def.props.position?.y, angle: def.props.angle,
            linDamp: def.props.linearDamping, angDamp: def.props.angularDamping });
      return b;
    }
    Step(dt, vIters, pIters) {
      log({ op: 'Step', dt, vIters, pIters });
    }
  }

  const stub = {
    b2Vec2, b2BodyDef, b2PolygonShape, b2FixtureDef, b2World,
    b2_kinematicBody: 'kinematic',
    b2_dynamicBody:   'dynamic',
    destroy: (_obj) => { /* WASM cleanup; irrelevant for stub */ },
  };

  return { stub, calls };
}

async function makeWorld() {
  const { World2D } = await import('../../../js/world_2d.js');
  const { stub, calls } = makeStubBox2d();
  const world = new World2D();
  await world.init(stub);
  return { world, stub, calls };
}

// ── World construction ──────────────────────────────────────────────────────

test('init: zero gravity in a 2D top-down world', async () => {
  const { calls } = await makeWorld();
  const grav = calls.find(c => c.op === 'b2World');
  assert.ok(grav, 'b2World was constructed');
  assert.strictEqual(grav.gx, 0);
  assert.strictEqual(grav.gy, 0);
});

test('addWalls: builds four perimeter bodies sized in metres', async () => {
  const { world, calls } = await makeWorld();
  calls.length = 0;
  world.addWalls(2362, 1143);

  const created = calls.filter(c => c.op === 'CreateBody');
  assert.strictEqual(created.length, 4, 'four walls (top, bottom, left, right)');

  // Walls should be positioned just OUTSIDE the field rectangle (in metres).
  const xs = created.map(c => +c.x.toFixed(3)).sort((a, b) => a - b);
  const ys = created.map(c => +c.y.toFixed(3)).sort((a, b) => a - b);
  // Two walls on each X side, two on each Y side
  assert.ok(xs[0] < 0,    `leftmost wall x=${xs[0]} must be < 0`);
  assert.ok(xs[3] > 2.36, `rightmost wall x=${xs[3]} must be just past field width`);
  assert.ok(ys[0] < 0,    `topmost wall y=${ys[0]} must be < 0`);
  assert.ok(ys[3] > 1.14, `bottommost wall y=${ys[3]} must be just past field height`);
});

// ── Robot creation ──────────────────────────────────────────────────────────

test('addRobot: spawn position converted mm → m', async () => {
  const { world, calls } = await makeWorld();
  calls.length = 0;
  world.addRobot(100, 80, { x: 350, y: 980 }, -Math.PI / 2);
  const created = calls.find(c => c.op === 'CreateBody');
  assert.ok(close(created.x, 0.350), `body x=${created.x} should be 0.35 m`);
  assert.ok(close(created.y, 0.980), `body y=${created.y} should be 0.98 m`);
  assert.ok(close(created.angle, -Math.PI / 2), `angle=${created.angle}`);
  assert.strictEqual(created.type, 'kinematic');
});

test('addRobot: collider half-extents converted mm → m', async () => {
  const { world, calls } = await makeWorld();
  calls.length = 0;
  world.addRobot(100, 80, { x: 0, y: 0 });
  const fixture = calls.find(c => c.op === 'CreateFixture');
  assert.ok(close(fixture.shape.hx, 0.100), `hx=${fixture.shape.hx} should be 0.1 m`);
  assert.ok(close(fixture.shape.hy, 0.080), `hy=${fixture.shape.hy} should be 0.08 m`);
});

// ── Obstacle creation ──────────────────────────────────────────────────────

test('addObstacleBox: dynamic body type with damping', async () => {
  const { world, calls } = await makeWorld();
  calls.length = 0;
  world.addObstacleBox(50, 50, { x: 1700, y: 200 });
  const created = calls.find(c => c.op === 'CreateBody');
  assert.strictEqual(created.type, 'dynamic');
  assert.strictEqual(created.linDamp, 2.5);
  assert.strictEqual(created.angDamp, 3.0);
});

test('addObstacleBox: position and half-extents converted mm → m', async () => {
  const { world, calls } = await makeWorld();
  calls.length = 0;
  world.addObstacleBox(50, 50, { x: 1700, y: 200 });
  const created = calls.find(c => c.op === 'CreateBody');
  assert.ok(close(created.x, 1.700), `body x=${created.x}`);
  assert.ok(close(created.y, 0.200), `body y=${created.y}`);
  const fixture = calls.find(c => c.op === 'CreateFixture');
  assert.ok(close(fixture.shape.hx, 0.050), `hx=${fixture.shape.hx}`);
  assert.ok(close(fixture.shape.hy, 0.050), `hy=${fixture.shape.hy}`);
});

// ── Pose / velocity setters ─────────────────────────────────────────────────

test('setKinematicPose: position converted mm → m', async () => {
  const { world, calls } = await makeWorld();
  const body = world.addRobot(100, 80, { x: 0, y: 0 });
  calls.length = 0;
  world.setKinematicPose(body, 350, 980, Math.PI / 4);
  const t = calls.find(c => c.op === 'SetTransform');
  assert.ok(close(t.x, 0.350), `x=${t.x}`);
  assert.ok(close(t.y, 0.980), `y=${t.y}`);
  assert.ok(close(t.a, Math.PI / 4));
});

test('setKinematicVelocity: velocity converted mm/s → m/s', async () => {
  const { world, calls } = await makeWorld();
  const body = world.addRobot(100, 80, { x: 0, y: 0 });
  calls.length = 0;
  world.setKinematicVelocity(body, 600, -300, 1.5);
  const lin = calls.find(c => c.op === 'SetLinearVelocity');
  assert.ok(close(lin.x,  0.600), `vx=${lin.x}`);
  assert.ok(close(lin.y, -0.300), `vy=${lin.y}`);
  const ang = calls.find(c => c.op === 'SetAngularVelocity');
  assert.strictEqual(ang.w, 1.5, 'angular velocity passes through unchanged');
});

test('setKinematicVelocity: zero velocity passes zero metres/sec through', async () => {
  const { world, calls } = await makeWorld();
  const body = world.addRobot(100, 80, { x: 0, y: 0 });
  calls.length = 0;
  world.setKinematicVelocity(body, 0, 0, 0);
  const lin = calls.find(c => c.op === 'SetLinearVelocity');
  assert.strictEqual(lin.x, 0);
  assert.strictEqual(lin.y, 0);
});

test('setDynamicPose: teleports + clears linear and angular velocity + wakes', async () => {
  const { world, calls } = await makeWorld();
  const body = world.addObstacleBox(50, 50, { x: 1000, y: 500 });
  calls.length = 0;
  world.setDynamicPose(body, 1700, 200, 0);

  const t = calls.find(c => c.op === 'SetTransform');
  assert.ok(close(t.x, 1.700));
  assert.ok(close(t.y, 0.200));
  assert.strictEqual(t.a, 0);

  const lin = calls.find(c => c.op === 'SetLinearVelocity');
  assert.strictEqual(lin.x, 0);
  assert.strictEqual(lin.y, 0);

  const ang = calls.find(c => c.op === 'SetAngularVelocity');
  assert.strictEqual(ang.w, 0);

  const awake = calls.find(c => c.op === 'SetAwake');
  assert.strictEqual(awake.b, true, 'must wake the body so it integrates the new pose');
});

// ── Pose readback ──────────────────────────────────────────────────────────

test('readPose: position converted m → mm on the way out', async () => {
  const { world } = await makeWorld();
  const body = world.addRobot(100, 80, { x: 350, y: 980 }, 1.234);
  const pose = world.readPose(body);
  assert.ok(close(pose.x, 350), `pose.x=${pose.x}`);
  assert.ok(close(pose.y, 980), `pose.y=${pose.y}`);
  assert.strictEqual(pose.angle, 1.234);
});

test('readPose: round-trip through setKinematicPose preserves mm scale', async () => {
  const { world } = await makeWorld();
  const body = world.addRobot(100, 80, { x: 0, y: 0 });
  world.setKinematicPose(body, 1234.5, 678.9, 0.42);
  const pose = world.readPose(body);
  assert.ok(close(pose.x, 1234.5, 1e-6));
  assert.ok(close(pose.y,  678.9, 1e-6));
  assert.ok(close(pose.angle, 0.42));
});

// ── Step ────────────────────────────────────────────────────────────────────

test('step: 16.67 ms dt (1 / 60 s) issues a single Box2D step', async () => {
  const { world, calls } = await makeWorld();
  calls.length = 0;
  world.step(1 / 60);
  const steps = calls.filter(c => c.op === 'Step');
  assert.strictEqual(steps.length, 1);
});

test('step: 4× the cap sub-steps four times for stability', async () => {
  const { world, calls } = await makeWorld();
  calls.length = 0;
  world.step(4 / 60);
  const steps = calls.filter(c => c.op === 'Step');
  assert.strictEqual(steps.length, 4);
  // Each sub-step should be 1/60 s.
  for (const s of steps) {
    assert.ok(close(s.dt, 1 / 60, 1e-9), `sub-step dt=${s.dt}`);
  }
});

test('step: zero dt still issues at least one step', async () => {
  const { world, calls } = await makeWorld();
  calls.length = 0;
  world.step(0);
  const steps = calls.filter(c => c.op === 'Step');
  assert.strictEqual(steps.length, 1);
});
