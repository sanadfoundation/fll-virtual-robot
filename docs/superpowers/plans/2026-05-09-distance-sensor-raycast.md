# Distance Sensor Raycasting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the frozen `distanceMM = 300` stub with a real Box2D raycast against field walls + dynamic obstacles, draw a teal ray with mid-ray distance label on the canvas, and keep the existing `distance ≥ 9999 → -1` Python-bridge contract intact.

**Architecture:** A new generic `World2D.castRay(originMm, dirRad, maxMm, {excludeBody})` exposes Box2D `RayCast` behind an mm-space, b2-free interface. `simulator.js` adds `_distanceSensorMount` (front-center mount math), `_updateDistanceSensor` (calls `castRay`, writes to `robot.sensors`), and `_drawDistanceSensorRay` (canvas overlay). Two update sites: each `_animateTank` step (drives smooth overlay during motion) and `getDistanceSensorValue` / `getDistanceSensorPresence` (covers Blockly direct reads).

**Tech Stack:** Vanilla JS, Box2D-WASM 7 (already in tree via `js/world_2d.js`), `node:test` + `node:assert`. No build step. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-09-distance-sensor-raycast-design.md`

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `js/world_2d.js` | Modified | Adds `castRay(originMm, dirRad, maxMm, {excludeBody})` returning `{hit, distanceMm, point, normal}`. mm-space I/O, internal m-space conversion, allocation discipline matches the rest of the file. |
| `tests/js/physics/world_2d_castray.test.js` | New | Stub-driven boundary tests for `castRay`: mm→m conversion, fraction→mm conversion on return, `excludeBody` filtering by `.a` pointer, miss returns `maxDistMm`. |
| `js/simulator.js` | Modified | Adds two module constants (`DIST_SENSOR_MAX_MM`, `DIST_SENSOR_OOR_VALUE`); `makeRobotState` adds `distanceHit: null`, `distanceOrigin: null`; new `_distanceSensorMount`, `_updateDistanceSensor`, `_drawDistanceSensorRay`; one call to `_updateDistanceSensor` in `_animateTank`; one in each of the two distance getters; one call to `_drawDistanceSensorRay` in `_draw`. |
| `tests/js/sensors/distance_sensor_mount.test.js` | New | Pure-function test on `_distanceSensorMount` for the four cardinal headings. |
| `tests/js/sensors/distance_sensor.test.js` | New | Sim-level tests using stubbed `physics.castRay`: verifies update wiring, getter recompute, OOR sentinel, mount→castRay argument plumbing. |
| `tests/js/sensors/accessors.test.js` | Modified | Update two existing tests that read the `distanceMM = 300` default (now refreshed by an on-demand recompute through the getter). |
| `BACKLOG.md` | Modified | Strike the "Distance sensor never updates" bullet under Sensor stubs; trim the "Sensor footprint overlay" bullet to reference only the color sensor patch. |

---

## Testing approach (read this before Task 1)

The existing `tests/js/physics/world_2d_boundary.test.js` runs `World2D` against a hand-rolled **stub** Box2D module — it does not load the real WASM in Node. The new `castRay` tests follow the same pattern: extend the stub with `RayCast`, `JSRayCastCallback`, `wrapPointer`, and `b2Fixture` so we can assert the public-API contract (mm/m boundary conversion, exclude-body filtering, fraction-to-mm) without spinning up the engine.

End-to-end physics correctness ("a ray from the front of the robot toward a wall 200 mm away really returns 200 mm") is verified by a **manual browser smoke test** (Task 8). This is a deliberate scope choice: standing up real WASM in Node would require its own infra change and isn't on this plan.

The integration test for `simulator.js` injects a stubbed `physics.castRay` onto the sim instance, since the `vm.createContext`-based `createSim` helper sets `physics = null` (Node's vm context doesn't wire dynamic imports — see `simulator.js:163-171`).

---

## Task 1: Add `castRay` to `World2D`

**Files:**
- Modify: `js/world_2d.js`
- Create: `tests/js/physics/world_2d_castray.test.js`

- [ ] **Step 1.1: Create `tests/js/physics/world_2d_castray.test.js` with the full failing test suite**

The test file extends `makeStubBox2d` from the boundary test by adding RayCast plumbing. Note we duplicate the stub rather than importing — the boundary test's stub doesn't export and we want each test file to be self-contained.

```javascript
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

  let nextBodyId = 0;
  function makeBody(def) {
    const id = nextBodyId++;
    const body = {
      a: id,                        // emscripten-style raw pointer; identity key
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

  class b2World {
    constructor(gravity) { this.gravity = { x: gravity.x, y: gravity.y }; }
    CreateBody(def) { return makeBody(def); }
    Step() {}

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
          { _kind: 'fixture', bodyA: f.bodyA },
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
    b2Fixture, JSRayCastCallback,
    b2_kinematicBody: 'kinematic',
    b2_dynamicBody:   'dynamic',
    // wrapPointer for a fixture: hand back an object exposing GetBody() with
    // the planted .a. For points/normals we wrap them as b2Vec2-like objects.
    wrapPointer: (ptr, type) => {
      if (type === b2Fixture) {
        return { GetBody: () => ({ a: ptr.bodyA }) };
      }
      // b2Vec2-like
      return { get_x: () => ptr.x, get_y: () => ptr.y };
    },
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

test('castRay: direction π/2 (south) places far endpoint along +Y', async () => {
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
    { bodyA: 1, fraction: 0.25, point: { x: 0.5, y: 0 }, normal: { x: -1, y: 0 } },
  ]);
  const r = world.castRay({ x: 0, y: 0 }, 0, 2000);
  assert.strictEqual(r.hit, true);
  assert.strictEqual(r.distanceMm, 500);
});

test('castRay: hit point converted m → mm on the way out', async () => {
  const { world } = await makeWorld([
    { bodyA: 1, fraction: 0.5, point: { x: 1.234, y: 0.567 }, normal: { x: 0, y: 1 } },
  ]);
  const r = world.castRay({ x: 0, y: 0 }, 0, 2000);
  assert.ok(close(r.point.x, 1234, 1e-6));
  assert.ok(close(r.point.y,  567, 1e-6));
});

test('castRay: normal passes through unchanged (already unit, dimensionless)', async () => {
  const { world } = await makeWorld([
    { bodyA: 1, fraction: 0.5, point: { x: 0, y: 0 }, normal: { x: 0.6, y: -0.8 } },
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
    { bodyA: 1, fraction: 0.10, point: { x: 0.2, y: 0 }, normal: { x: -1, y: 0 } },
    { bodyA: 2, fraction: 0.50, point: { x: 1.0, y: 0 }, normal: { x: -1, y: 0 } },
  ]);
  const r = world.castRay({ x: 0, y: 0 }, 0, 2000);
  assert.strictEqual(r.distanceMm, 200);
  assert.ok(close(r.point.x, 200, 1e-6));
});

test('castRay: excludeBody filters by .a pointer (NOT object identity)', async () => {
  const { world } = await makeWorld([
    { bodyA: 7, fraction: 0.10, point: { x: 0.2, y: 0 }, normal: { x: -1, y: 0 } },
    { bodyA: 9, fraction: 0.50, point: { x: 1.0, y: 0 }, normal: { x: -1, y: 0 } },
  ]);
  // Pretend body 7 is the robot; we should hit body 9 instead.
  const r = world.castRay({ x: 0, y: 0 }, 0, 2000, { excludeBody: { a: 7 } });
  assert.strictEqual(r.distanceMm, 1000);
});

test('castRay: excludeBody only skips fixtures whose body matches', async () => {
  const { world } = await makeWorld([
    { bodyA: 7, fraction: 0.30, point: { x: 0.6, y: 0 }, normal: { x: -1, y: 0 } },
  ]);
  // Excluding a different body shouldn't filter our scripted hit.
  const r = world.castRay({ x: 0, y: 0 }, 0, 2000, { excludeBody: { a: 99 } });
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
```

- [ ] **Step 1.2: Run the new test file to confirm it fails (`castRay` doesn't exist yet)**

Run: `node --test tests/js/physics/world_2d_castray.test.js`
Expected: every test fails with `TypeError: world.castRay is not a function`.

- [ ] **Step 1.3: Add `castRay` to `js/world_2d.js`**

Insert the method on the `World2D` class, between `readPose` (currently around line 161-168) and `step` (currently around line 172). Place it right after `readPose`:

```javascript
  // mm-space ray cast against all fixtures in the world. Returns the closest
  // hit excluding the optional `excludeBody` (used to skip the robot itself
  // when casting from a sensor mounted on the robot).
  //
  // box2d-wasm note: comparing fixtures/bodies via `===` does NOT work — each
  // wrapPointer call returns a fresh JS wrapper. The canonical equality test
  // is the `.a` raw-pointer field. Per-call allocations (two b2Vec2, one
  // callback) are explicitly destroyed; at 60 Hz this is fine.
  castRay(originMm, directionRad, maxDistMm, { excludeBody = null } = {}) {
    const ox = originMm.x * M_PER_MM;
    const oy = originMm.y * M_PER_MM;
    const dx = Math.cos(directionRad);
    const dy = Math.sin(directionRad);
    const maxM = maxDistMm * M_PER_MM;

    const p1 = new box2d.b2Vec2(ox, oy);
    const p2 = new box2d.b2Vec2(ox + dx * maxM, oy + dy * maxM);

    let bestPoint = null;
    let bestNormal = null;
    let bestFrac = 1.0;

    const cb = new box2d.JSRayCastCallback();
    cb.ReportFixture = (fixturePtr, pointPtr, normalPtr, fraction) => {
      const fixture = box2d.wrapPointer(fixturePtr, box2d.b2Fixture);
      if (excludeBody && fixture.GetBody().a === excludeBody.a) return -1;

      const point  = box2d.wrapPointer(pointPtr,  box2d.b2Vec2);
      const normal = box2d.wrapPointer(normalPtr, box2d.b2Vec2);
      bestFrac   = fraction;
      bestPoint  = { x: point.get_x()  * MM_PER_M, y: point.get_y()  * MM_PER_M };
      bestNormal = { x: normal.get_x(),            y: normal.get_y() };
      return fraction;
    };

    this.world.RayCast(cb, p1, p2);

    box2d.destroy(p1);
    box2d.destroy(p2);
    box2d.destroy(cb);

    if (bestPoint) {
      return { hit: true,  distanceMm: bestFrac * maxDistMm, point: bestPoint, normal: bestNormal };
    }
    return   { hit: false, distanceMm: maxDistMm,            point: null,      normal: null };
  }
```

- [ ] **Step 1.4: Run the new test file — all green**

Run: `node --test tests/js/physics/world_2d_castray.test.js`
Expected: 10/10 pass.

- [ ] **Step 1.5: Run the full JS test suite to confirm no regressions**

Run: `find tests/js -name '*.test.js' -print0 | xargs -0 node --test`
Expected: same total as baseline (235) plus 10 new tests = 245 pass, 0 fail.

- [ ] **Step 1.6: Commit**

```bash
git add js/world_2d.js tests/js/physics/world_2d_castray.test.js
git commit -m "feat(world): add World2D.castRay (Box2D RayCast in mm-space)

Wraps Box2D's RayCast behind an mm-space, b2-free interface so future
sensors can ask 'what's in front' without learning Box2D types.
excludeBody compares via .a pointer (canonical box2d-wasm identity);
allocations explicitly destroyed.

Boundary tests via the existing stub-driven pattern."
```

---

## Task 2: Sensor-state defaults and new constants in `simulator.js`

**Files:**
- Modify: `js/simulator.js`
- Modify: `tests/js/sensors/accessors.test.js`

This task lays the groundwork — adds the new state slots and constants but does not yet wire raycasting in. Splitting it out keeps Task 4's diff focused.

- [ ] **Step 2.1: Update `tests/js/sensors/accessors.test.js` with two new test cases for the new state defaults**

Insert these two tests immediately after the existing `getDistanceSensorPresence` tests (currently lines 49-53):

```javascript
test('robot.sensors.distanceHit: defaults to null', () => {
  assert.strictEqual(createSim().robot.sensors.distanceHit, null);
});

test('robot.sensors.distanceOrigin: defaults to null', () => {
  assert.strictEqual(createSim().robot.sensors.distanceOrigin, null);
});
```

- [ ] **Step 2.2: Run the test file — the two new tests fail**

Run: `node --test tests/js/sensors/accessors.test.js`
Expected: 2 fails (`undefined !== null`), other tests pass.

- [ ] **Step 2.3: Add the two constants near the top of `js/simulator.js`**

Add immediately after `MM_PER_MS_100` (currently at line 31):

```javascript
const DIST_SENSOR_MAX_MM    = 2000;  // matches LEGO Spike hardware spec
const DIST_SENSOR_OOR_VALUE = 9999;  // wire sentinel; py/spike_bridge.py:308 maps ≥9999 → -1
```

- [ ] **Step 2.4: Add the two new fields to `makeRobotState`**

Modify `makeRobotState` (currently at line 103-115). The `sensors` object becomes:

```javascript
    sensors: {
      colorValue: 'none',
      distanceMM: 300,
      distanceHit:    null,
      distanceOrigin: null,
    },
```

- [ ] **Step 2.5: Re-run the accessors test — all green**

Run: `node --test tests/js/sensors/accessors.test.js`
Expected: all tests pass (the two new ones now succeed).

- [ ] **Step 2.6: Commit**

```bash
git add js/simulator.js tests/js/sensors/accessors.test.js
git commit -m "feat(sim): add distance-sensor state slots + range constants

distanceHit / distanceOrigin (default null) hold the raycast hit point
and ray origin, populated next task. DIST_SENSOR_MAX_MM=2000 matches
hardware; DIST_SENSOR_OOR_VALUE=9999 honors the existing bridge contract."
```

---

## Task 3: `_distanceSensorMount` (pure function)

**Files:**
- Modify: `js/simulator.js`
- Create: `tests/js/sensors/distance_sensor_mount.test.js`

- [ ] **Step 3.1: Create `tests/js/sensors/distance_sensor_mount.test.js` with the cardinal-heading cases**

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// 88 mm = ROBOT_BODY_H/2 - 12 = 100 - 12. The dot in _drawRobot is drawn at
// body-local (0, -bh/2 + 12) before the +90° canvas rotate; the mount is the
// world-space projection of that point given current heading.

test('_distanceSensorMount: heading 0° (east) → 88 mm east of center', () => {
  const sim = createSim();
  sim.robot.x = 1000; sim.robot.y = 500; sim.robot.heading = 0;
  const m = sim._distanceSensorMount(sim.robot);
  assert.ok(close(m.x, 1088, 1e-6), `m.x=${m.x}`);
  assert.ok(close(m.y, 500,  1e-6), `m.y=${m.y}`);
  assert.ok(close(m.angleRad, 0));
});

test('_distanceSensorMount: heading 90° (south) → 88 mm south of center', () => {
  const sim = createSim();
  sim.robot.x = 1000; sim.robot.y = 500; sim.robot.heading = 90;
  const m = sim._distanceSensorMount(sim.robot);
  assert.ok(close(m.x, 1000, 1e-6), `m.x=${m.x}`);
  assert.ok(close(m.y, 588,  1e-6), `m.y=${m.y}`);
  assert.ok(close(m.angleRad, Math.PI / 2));
});

test('_distanceSensorMount: heading -90° (north) → 88 mm north of center', () => {
  const sim = createSim();
  sim.robot.x = 1000; sim.robot.y = 500; sim.robot.heading = -90;
  const m = sim._distanceSensorMount(sim.robot);
  assert.ok(close(m.x, 1000, 1e-6), `m.x=${m.x}`);
  assert.ok(close(m.y, 412,  1e-6), `m.y=${m.y}`);
  assert.ok(close(m.angleRad, -Math.PI / 2));
});

test('_distanceSensorMount: heading 180° (west) → 88 mm west of center', () => {
  const sim = createSim();
  sim.robot.x = 1000; sim.robot.y = 500; sim.robot.heading = 180;
  const m = sim._distanceSensorMount(sim.robot);
  assert.ok(close(m.x, 912, 1e-6), `m.x=${m.x}`);
  assert.ok(close(m.y, 500, 1e-6), `m.y=${m.y}`);
  assert.ok(close(m.angleRad, Math.PI));
});

test('_distanceSensorMount: default spawn (350, 980) heading -90° → mount at (350, 892)', () => {
  // Sanity check against the spec's worked example.
  const sim = createSim();
  // Default heading is -90 from makeRobotState; default x=350, y=980.
  const m = sim._distanceSensorMount(sim.robot);
  assert.ok(close(m.x, 350, 1e-6));
  assert.ok(close(m.y, 892, 1e-6));
});
```

- [ ] **Step 3.2: Run the test file — fails because `_distanceSensorMount` doesn't exist**

Run: `node --test tests/js/sensors/distance_sensor_mount.test.js`
Expected: 5 fails (`sim._distanceSensorMount is not a function`).

- [ ] **Step 3.3: Add `_distanceSensorMount` to `js/simulator.js`**

Insert as a new method on `RobotSimulator`, immediately after the existing `_sensorPosition` (currently lines 815-822). Keep them adjacent — they're parallel utilities:

```javascript
  // Distance sensor world-space mount: front-center, 12 mm inset from the
  // front edge. Mirrors the dot drawn in _drawRobot at body-local
  // (0, -bh/2 + 12) before the +90° canvas-rotate offset.
  _distanceSensorMount(robot) {
    const localY = -(ROBOT_BODY_H / 2) + 12;
    const rotRad = (robot.heading + 90) * Math.PI / 180;
    return {
      x: robot.x - localY * Math.sin(rotRad),
      y: robot.y + localY * Math.cos(rotRad),
      angleRad: robot.heading * Math.PI / 180,
    };
  }
```

- [ ] **Step 3.4: Run the mount test — all green**

Run: `node --test tests/js/sensors/distance_sensor_mount.test.js`
Expected: 5/5 pass.

- [ ] **Step 3.5: Commit**

```bash
git add js/simulator.js tests/js/sensors/distance_sensor_mount.test.js
git commit -m "feat(sim): _distanceSensorMount — front-center sensor pose math

Pure function that projects the body-local mount point (0, -bh/2 + 12)
into world coordinates given current heading, and returns the heading
in radians as the ray direction. Mirrors _sensorPosition for color."
```

---

## Task 4: `_updateDistanceSensor` and integration tests

**Files:**
- Modify: `js/simulator.js`
- Create: `tests/js/sensors/distance_sensor.test.js`

- [ ] **Step 4.1: Create `tests/js/sensors/distance_sensor.test.js` with the update-method test suite**

```javascript
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

const HIT_AT_500 = {
  hit: true, distanceMm: 500,
  point: { x: 350, y: 480 }, normal: { x: 0, y: 1 },
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
  assert.strictEqual(sim.robot.sensors.distanceMM, 300);
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
  // Default spawn (350, 980) heading -90° → mount (350, 892), angleRad -π/2.
  const calls = withStubPhysics(sim, NO_HIT);
  sim._updateDistanceSensor();
  assert.strictEqual(calls.length, 1);
  const c = calls[0];
  assert.ok(close(c.originMm.x, 350, 1e-6));
  assert.ok(close(c.originMm.y, 892, 1e-6));
  assert.ok(close(c.directionRad, -Math.PI / 2));
  assert.strictEqual(c.maxDistMm, 2000);
  assert.strictEqual(c.opts.excludeBody, sim.robotBody);
});

test('_updateDistanceSensor: hit → sets distanceMM, distanceHit, distanceOrigin', () => {
  const sim = createSim();
  withStubPhysics(sim, HIT_AT_500);
  sim._updateDistanceSensor();
  assert.strictEqual(sim.robot.sensors.distanceMM, 500);
  assert.deepStrictEqual(sim.robot.sensors.distanceHit, { x: 350, y: 480 });
  assert.ok(close(sim.robot.sensors.distanceOrigin.x, 350, 1e-6));
  assert.ok(close(sim.robot.sensors.distanceOrigin.y, 892, 1e-6));
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

test('getDistanceSensorValue: works with physics=null (returns existing distanceMM)', () => {
  const sim = createSim();
  // No stub injection — physics stays null.
  assert.strictEqual(sim.getDistanceSensorValue(), 300);
});
```

- [ ] **Step 4.2: Run the new test file — fails because `_updateDistanceSensor` doesn't exist and the getters don't recompute**

Run: `node --test tests/js/sensors/distance_sensor.test.js`
Expected: failures across the suite (`sim._updateDistanceSensor is not a function`, the two getter recompute tests show `calls.length === 0`).

- [ ] **Step 4.3: Add `_updateDistanceSensor` to `js/simulator.js`**

Insert as a new method on `RobotSimulator`, immediately after `_distanceSensorMount` (added in Task 3):

```javascript
  // Cast a ray from the distance-sensor mount along heading and update
  // robot.sensors.{distanceMM, distanceHit, distanceOrigin}. No-op when
  // physics isn't ready (early startup or headless tests).
  _updateDistanceSensor() {
    if (!this.physics || !this.robotBody) return;
    const m = this._distanceSensorMount(this.robot);
    const r = this.physics.castRay(
      { x: m.x, y: m.y }, m.angleRad, DIST_SENSOR_MAX_MM,
      { excludeBody: this.robotBody },
    );
    this.robot.sensors.distanceMM     = r.hit ? r.distanceMm : DIST_SENSOR_OOR_VALUE;
    this.robot.sensors.distanceHit    = r.hit ? r.point : null;
    this.robot.sensors.distanceOrigin = { x: m.x, y: m.y };
  }
```

- [ ] **Step 4.4: Update the two getters to call `_updateDistanceSensor`**

Find (currently lines 897-898):

```javascript
  getDistanceSensorValue()    { return this.robot.sensors.distanceMM; }
  getDistanceSensorPresence() { return this.robot.sensors.distanceMM < 100; }
```

Replace with:

```javascript
  getDistanceSensorValue()    { this._updateDistanceSensor(); return this.robot.sensors.distanceMM; }
  getDistanceSensorPresence() { this._updateDistanceSensor(); return this.robot.sensors.distanceMM < 100; }
```

- [ ] **Step 4.5: Run the new test file — all green**

Run: `node --test tests/js/sensors/distance_sensor.test.js`
Expected: 9/9 pass.

- [ ] **Step 4.6: Run the full JS test suite**

Run: `find tests/js -name '*.test.js' -print0 | xargs -0 node --test`
Expected: all pass. The existing accessor test that read `getDistanceSensorValue()` returning `300` still works because when `physics` is null the method returns the unchanged `distanceMM`.

- [ ] **Step 4.7: Commit**

```bash
git add js/simulator.js tests/js/sensors/distance_sensor.test.js
git commit -m "feat(sim): _updateDistanceSensor + on-demand recompute in getters

_updateDistanceSensor casts the ray via World2D.castRay and writes
distanceMM/distanceHit/distanceOrigin. Hooked into the two distance
getters so Blockly direct reads (which bypass the worker) get a fresh
value each call. No-op when physics isn't ready."
```

---

## Task 5: Per-step update inside `_animateTank`

**Files:**
- Modify: `js/simulator.js`

`_animateTank` already updates `colorValue` per step (currently lines 750-751). The distance sensor should update at the same site so the snapshot returned to Python at command-end carries the final post-motion distance.

There's no good unit test seam here (the vm context's `physics` is null), so this task is verified by the manual smoke test in Task 8. Keep the diff small.

- [ ] **Step 5.1: Add the per-step call in `_animateTank`**

Find (currently lines 750-751 in `js/simulator.js`):

```javascript
      const sp = this._sensorPosition(this.robot);
      this.robot.sensors.colorValue = this._colorAtPosition(sp.x, sp.y);
```

Add immediately after, before `this._dirty = true`:

```javascript
      this._updateDistanceSensor();
```

So the block reads:

```javascript
      const sp = this._sensorPosition(this.robot);
      this.robot.sensors.colorValue = this._colorAtPosition(sp.x, sp.y);
      this._updateDistanceSensor();

      this._dirty = true;
```

- [ ] **Step 5.2: Run the full JS test suite**

Run: `find tests/js -name '*.test.js' -print0 | xargs -0 node --test`
Expected: all pass (no behavior change in headless tests since physics is null inside `_animateTank` too — the existing `if (!this.physics) return;` guard at the top of `_animateTank` short-circuits).

- [ ] **Step 5.3: Commit**

```bash
git add js/simulator.js
git commit -m "feat(sim): refresh distance sensor each _animateTank step

Mirrors the existing per-step colorValue update so the post-command
sensor snapshot returned by executeCommand carries the final distance
back to Python, and the canvas overlay tracks the robot during motion."
```

---

## Task 6: `_drawDistanceSensorRay` overlay

**Files:**
- Modify: `js/simulator.js`

Manual canvas-rendering tests in Node are awkward (we'd need a fake `ctx` recording calls), and the overlay's correctness is best judged visually. Add a couple of guard tests to make sure the method exists and doesn't throw in headless contexts, then verify the visuals in the browser smoke test (Task 8).

- [ ] **Step 6.1: Append a small "doesn't throw" guard test to `tests/js/sensors/distance_sensor.test.js`**

Add at the bottom of the file:

```javascript
// ── _drawDistanceSensorRay (rendering, light coverage) ─────────────────────

function fakeCtx() {
  const calls = [];
  const noop = (...args) => calls.push({ op: 'call', args });
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
  sim.robot.sensors.distanceMM     = 500;
  sim.robot.sensors.distanceHit    = { x: 350, y: 480 };
  sim.robot.sensors.distanceOrigin = { x: 350, y: 980 };
  const ctx = fakeCtx();
  sim._drawDistanceSensorRay(ctx, 1);
  // Stroke for the ray + arc for the hit dot + fill/stroke for the label.
  assert.ok(ctx.calls.some(c => c.op === 'stroke'),    'stroked the ray');
  assert.ok(ctx.calls.some(c => c.op === 'arc'),       'arced the hit dot');
  assert.ok(ctx.calls.some(c => c.op === 'fillText'  && /50\.0 cm/.test(c.args[0])),
            'rendered the cm label');
});

test('_drawDistanceSensorRay: out-of-range draws faint dashed ray, no label', () => {
  const sim = createSim();
  sim.robot.sensors.distanceMM     = 9999;
  sim.robot.sensors.distanceHit    = null;
  sim.robot.sensors.distanceOrigin = { x: 350, y: 980 };
  const ctx = fakeCtx();
  sim._drawDistanceSensorRay(ctx, 1);
  assert.ok(ctx.calls.some(c => c.op === 'stroke'), 'stroked the dashed ray');
  assert.ok(!ctx.calls.some(c => c.op === 'fillText'), 'no label out-of-range');
  assert.ok(!ctx.calls.some(c => c.op === 'arc'),      'no hit dot out-of-range');
});
```

- [ ] **Step 6.2: Run the test file — fails because `_drawDistanceSensorRay` doesn't exist**

Run: `node --test tests/js/sensors/distance_sensor.test.js`
Expected: 3 new fails (`sim._drawDistanceSensorRay is not a function`); other 9 still pass.

- [ ] **Step 6.3: Add `_drawDistanceSensorRay` to `js/simulator.js`**

Insert as a new method on `RobotSimulator`, immediately after `_drawRobot` (currently ends around line 498):

```javascript
  _drawDistanceSensorRay(ctx, s) {
    const sens = this.robot.sensors;
    if (!sens.distanceOrigin) return;
    const o = sens.distanceOrigin;
    const inRange = sens.distanceMM < DIST_SENSOR_OOR_VALUE;

    let endX, endY;
    if (inRange) {
      endX = sens.distanceHit.x;
      endY = sens.distanceHit.y;
    } else {
      const a = this.robot.heading * Math.PI / 180;
      endX = o.x + Math.cos(a) * DIST_SENSOR_MAX_MM;
      endY = o.y + Math.sin(a) * DIST_SENSOR_MAX_MM;
    }

    ctx.save();
    ctx.strokeStyle = inRange ? 'rgba(86,212,192,0.85)' : 'rgba(86,212,192,0.18)';
    ctx.lineWidth   = 1.5 * s;
    ctx.setLineDash(inRange ? [] : [4 * s, 4 * s]);
    ctx.beginPath();
    ctx.moveTo(o.x * s, o.y * s);
    ctx.lineTo(endX * s, endY * s);
    ctx.stroke();

    if (inRange) {
      ctx.fillStyle = 'rgba(86,212,192,0.95)';
      ctx.beginPath();
      ctx.arc(endX * s, endY * s, 3 * s, 0, Math.PI * 2);
      ctx.fill();

      // Mid-ray label, perpendicular-offset so the line doesn't run through it.
      const mx = (o.x + endX) / 2, my = (o.y + endY) / 2;
      const a  = this.robot.heading * Math.PI / 180;
      const px = -Math.sin(a) * 14, py = Math.cos(a) * 14;
      ctx.fillStyle    = '#1a1a1a';
      ctx.font         = `bold ${10 * s}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle  = 'rgba(255,255,255,0.85)';
      ctx.lineWidth    = 3 * s;
      const cm = (sens.distanceMM / 10).toFixed(1);
      ctx.strokeText(`${cm} cm`, (mx + px) * s, (my + py) * s);
      ctx.fillText  (`${cm} cm`, (mx + px) * s, (my + py) * s);
    }
    ctx.restore();
  }
```

- [ ] **Step 6.4: Wire `_drawDistanceSensorRay` into `_draw`**

Find (currently lines 237-249 in `js/simulator.js`):

```javascript
  _draw() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const s = this._scale;

    ctx.clearRect(0, 0, W, H);
    this._drawField(ctx, W, H, s);
    this._drawTrail(ctx);
    this._drawObstacles(ctx, s);
    this._drawRobot(ctx, s);
    this._updateSensorPanel();
  }
```

Add `this._drawDistanceSensorRay(ctx, s);` between `_drawRobot` and `_updateSensorPanel`:

```javascript
    this._drawRobot(ctx, s);
    this._drawDistanceSensorRay(ctx, s);
    this._updateSensorPanel();
```

- [ ] **Step 6.5: Run the full JS test suite**

Run: `find tests/js -name '*.test.js' -print0 | xargs -0 node --test`
Expected: all pass.

- [ ] **Step 6.6: Commit**

```bash
git add js/simulator.js tests/js/sensors/distance_sensor.test.js
git commit -m "feat(sim): on-canvas distance sensor ray + mid-ray cm label

Solid teal ray + hit dot + 'X.X cm' label with white halo when in range;
faint dashed ray, no label, when out-of-range. Drawn in world coords
right after _drawRobot in _draw."
```

---

## Task 7: BACKLOG cleanup

**Files:**
- Modify: `BACKLOG.md`

- [ ] **Step 7.1: Strike the "Distance sensor never updates" bullet**

Find this bullet under `### Sensor stubs that need real values` (currently around lines 28-31 of `BACKLOG.md`):

```markdown
- **Distance sensor never updates.** `robot.sensors.distanceMM` is initialized to 300 mm and never recomputed; the Hub panel reads `30.0 cm` constantly. Fix: cast a ray from the front-of-robot in the heading direction against field walls (and, when populated, mission AABBs); clamp to a max sensing range (~200 cm) and return `-1` beyond that.
```

Delete it entirely.

- [ ] **Step 7.2: Trim the "Sensor footprint overlay" bullet**

Find this bullet under `## Simulation Fidelity`:

```markdown
- **Sensor footprint overlay** — draw the color sensor patch and distance sensor ray on the canvas during playback.
```

Replace with (distance ray is now done; only the color sensor patch remains):

```markdown
- **Color sensor patch overlay** — draw the color sensor's read footprint on the canvas during playback so users can see what the sensor is reading.
```

- [ ] **Step 7.3: Commit**

```bash
git add BACKLOG.md
git commit -m "chore(backlog): close 'distance sensor never updates'; trim overlay item

Distance sensor now raycasts each frame and renders an on-canvas ray.
The remaining 'sensor footprint overlay' work is the color sensor patch
only; updated bullet to reflect that."
```

---

## Task 8: Manual browser smoke test

**Files:** none (verification only)

This is the only verification of end-to-end physics correctness — the unit tests stub `castRay` rather than running real WASM. Run all four scenarios. Report findings inline; do not commit screenshots unless the design has visual issues that need a follow-up.

- [ ] **Step 8.1: Start the dev server**

Run: `python3 -m http.server 8787`
Expected: `Serving HTTP on :: port 8787 (http://[::]:8787/) ...`

- [ ] **Step 8.2: Open `http://localhost:8787` in a browser. Confirm the canvas loads with the robot at the bottom-left**

Expected: robot rendered facing up (heading -90°). No console errors.

- [ ] **Step 8.3: Default-spawn distance reading**

Verify the Hub panel's port F reads near `89.2 cm` (default mount at `(350, 892)` → top wall at `y=0` → 892 mm). The on-canvas ray should be a teal solid line from the robot's nose to the top edge with `89.2 cm` (or close) labeled mid-ray.

- [ ] **Step 8.4: Distance reading shrinks during a forward drive**

Paste into the Python editor (note: `move_for_degrees` takes wheel degrees, not mm — wheel circumference ≈ 175.93 mm so 600° ≈ 293 mm):

```python
from hub import port
import distance_sensor, motor_pair, runloop

async def main():
    motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)
    await motor_pair.move_for_degrees(motor_pair.PAIR_1, 600)  # ≈ 293 mm forward
    print('distance now:', distance_sensor.distance(port.F))

runloop.run(main())
```

Run. Expected: robot drives forward; label on canvas shrinks live during motion (from ~89 cm down to ~60 cm); final printed distance ≈ `600` (892 − 293). Within ~10 mm tolerance.

- [ ] **Step 8.5: Drive into an obstacle and confirm the hit point lands on its edge**

Paste:

```python
from hub import port
import distance_sensor, motor_pair, runloop

async def main():
    motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)
    # Tank-turn in place ~180° (right tread forward, left back) so the
    # robot faces roughly east, then drive forward toward obstacle '1'.
    await motor_pair.move_tank_for_degrees(motor_pair.PAIR_1, 200, 360, -360)
    await motor_pair.move_for_degrees(motor_pair.PAIR_1, 2000)
    print('distance:', distance_sensor.distance(port.F))

runloop.run(main())
```

Run. Expected: robot rotates, then drives until its raycast hits an obstacle or wall. Hit dot on the canvas lands on the impacted surface; distance label shows the closing distance. Final printed distance reflects whatever's directly in front when motion stops. Steering values may need a nudge to land squarely in front of the purple "1" obstacle — the goal is to *see the ray hit something*, not to land precisely.

- [ ] **Step 8.6: Out-of-range visual (faint dashed ray, no label)**

Paste:

```python
from hub import port
import motor_pair, runloop

async def main():
    motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)
    # Tank-turn ~90° right (from heading -90° to 0°, facing east).
    await motor_pair.move_tank_for_degrees(motor_pair.PAIR_1, 100, 360, -360)

runloop.run(main())
```

Run. The robot should rotate to face roughly east. With the robot at `(350, ~980)` facing east, the right wall is ~2012 mm away, beyond the 2000 mm cap.

Expected on canvas: a faint dashed teal ray extending east from the robot's nose, no label, ending at the 2 m mark (well short of the right wall). If the rotation overshoots/undershoots and the robot ends up facing into something within range, tweak the tank-turn degrees and re-run.

To verify the Python-side `-1` sentinel, append this read:

```python
import distance_sensor
from hub import port
print('distance:', distance_sensor.distance(port.F))
```

Run that snippet *after* the rotation completes (separate run, since the bridge state is preserved between runs). Expected: prints `distance: -1`.

- [ ] **Step 8.7: Stop the dev server**

Press `Ctrl+C` in the terminal running `python3 -m http.server 8787`.

- [ ] **Step 8.8: If all four scenarios behaved as expected, no commit needed; report success.**

If a scenario failed, capture the exact behavior, add a follow-up task, and only then mark this plan complete.

---

## Self-review summary

Spec coverage check (each spec section maps to at least one task):

| Spec section | Task(s) |
|---|---|
| Goals — `distance(F)` returns mm | 1, 4, 5, 8 |
| Goals — OOR returns `-1` (via 9999 sentinel) | 2, 4, 8 |
| Goals — on-canvas overlay | 6, 8 |
| Goals — reusable primitive | 1 |
| `World2D.castRay` signature + impl | 1 |
| Sensor-side mount + update | 3, 4 |
| Two call sites (animate + getter) | 4, 5 |
| Bridge contract unchanged | (no task — verified by absence of py/ changes) |
| Overlay rendering | 6 |
| Edge cases (physics not ready, heading wrap) | 4 (no-op test), 3 (cardinal headings) |
| Test plan | 1, 3, 4, 6, 8 |
| BACKLOG hygiene | 7 |

No placeholders. Type and method names match spec. The spec's "real WASM" test plan is replaced with stub-driven unit tests + a manual browser smoke (documented in the **Testing approach** section above).
