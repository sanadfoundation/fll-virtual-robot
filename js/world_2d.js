// Box2D-WASM 2D physics world for the simulator. Public API is in millimetres
// and radians; the engine runs in metres so its tolerances (b2_linearSlop = 5
// mm, b2_maxTranslation = 2 m / step, sleep thresholds, etc.) operate in the
// units they were calibrated for.

const PKG = 'https://cdn.jsdelivr.net/npm/box2d-wasm@7.0.0';
const ENTRY_URL = `${PKG}/dist/es/entry.js`;

const M_PER_MM = 0.001;
const MM_PER_M = 1000;

const MAX_PHYS_STEP_S = 1 / 60; // sub-step beyond this for stability under speedMult.

let box2d = null;
let initPromise = null;

function ensureInit() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const mod = await import(ENTRY_URL);
    const factory = mod.default || mod.Box2DFactory;
    box2d = await factory({
      locateFile: (path) => `${PKG}/dist/es/${path}`,
    });
  })();
  return initPromise;
}

export class World2D {
  // `injectedBox2d` lets tests pass a stub module; production leaves it
  // undefined and the CDN dynamic import runs as normal.
  async init(injectedBox2d) {
    if (injectedBox2d) {
      box2d = injectedBox2d;
    } else {
      await ensureInit();
    }
    // Top-down: zero gravity. Bodies move only when the kinematic robot
    // pushes them; damping settles them after release.
    const gravity = new box2d.b2Vec2(0, 0);
    this.world = new box2d.b2World(gravity);
    box2d.destroy(gravity);
  }

  // Static perimeter so dynamic bodies (and the robot, on contact) can't
  // escape the field. Walls sit just outside the field rectangle.
  addWalls(width_mm, height_mm) {
    const W = width_mm  * M_PER_MM;
    const H = height_mm * M_PER_MM;
    const T = 0.05; // 50 mm wall thickness

    const make = (cx, cy, hx, hy) => {
      const bd = new box2d.b2BodyDef();
      const pos = new box2d.b2Vec2(cx, cy);
      bd.set_position(pos);
      const body = this.world.CreateBody(bd);
      box2d.destroy(bd);
      box2d.destroy(pos);

      const shape = new box2d.b2PolygonShape();
      shape.SetAsBox(hx, hy);
      const fd = new box2d.b2FixtureDef();
      fd.set_shape(shape);
      fd.set_friction(0.3);
      body.CreateFixture(fd);
      box2d.destroy(shape);
      box2d.destroy(fd);
    };

    // top, bottom, left, right
    make(W / 2,     -T / 2,         W / 2 + T, T / 2);
    make(W / 2,     H + T / 2,      W / 2 + T, T / 2);
    make(-T / 2,    H / 2,          T / 2,     H / 2 + T);
    make(W + T / 2, H / 2,          T / 2,     H / 2 + T);
  }

  // Robot: kinematic body, velocity-driven. Box collider in body-local frame
  // with hx along forward (body-local +X) and hy along lateral (+Y). Body angle
  // 0 ⇒ forward = world +X, matching the simulator's heading=0 convention.
  addRobot(hx_mm, hy_mm, position_mm, angle = 0) {
    const bd = new box2d.b2BodyDef();
    bd.set_type(box2d.b2_kinematicBody);
    const pos = new box2d.b2Vec2(position_mm.x * M_PER_MM, position_mm.y * M_PER_MM);
    bd.set_position(pos);
    bd.set_angle(angle);
    const body = this.world.CreateBody(bd);
    box2d.destroy(bd);
    box2d.destroy(pos);

    const shape = new box2d.b2PolygonShape();
    shape.SetAsBox(hx_mm * M_PER_MM, hy_mm * M_PER_MM);
    const fd = new box2d.b2FixtureDef();
    fd.set_shape(shape);
    fd.set_density(1);
    fd.set_friction(0.5);
    body.CreateFixture(fd);
    box2d.destroy(shape);
    box2d.destroy(fd);

    return body;
  }

  // Obstacle: dynamic body. Density in kg/m² (Box2D 2D convention) — 50 gives
  // an 80 mm × 80 mm × 80 mm-equivalent brick a mass of ~0.32 kg, in the right
  // ballpark for a 3D-printed mission piece.
  addObstacleBox(hx_mm, hy_mm, position_mm) {
    const bd = new box2d.b2BodyDef();
    bd.set_type(box2d.b2_dynamicBody);
    bd.set_linearDamping(2.5);
    bd.set_angularDamping(3.0);
    const pos = new box2d.b2Vec2(position_mm.x * M_PER_MM, position_mm.y * M_PER_MM);
    bd.set_position(pos);
    const body = this.world.CreateBody(bd);
    box2d.destroy(bd);
    box2d.destroy(pos);

    const shape = new box2d.b2PolygonShape();
    shape.SetAsBox(hx_mm * M_PER_MM, hy_mm * M_PER_MM);
    const fd = new box2d.b2FixtureDef();
    fd.set_shape(shape);
    fd.set_density(50);
    fd.set_friction(0.5);
    fd.set_restitution(0.05);
    body.CreateFixture(fd);
    box2d.destroy(shape);
    box2d.destroy(fd);

    return body;
  }

  // Welds a second collider to an existing body in body-local frame. Used to
  // attach the force-sensor bumper to the robot body. offset_mm is the centre
  // of the bumper rectangle in body-local mm. userData (anything) is attached
  // to the FixtureDef so the contact listener can identify the bumper at
  // runtime via fixture.GetUserData().
  addBumper(robotBody, hx_mm, hy_mm, offsetX_mm, offsetY_mm, userData) {
    const shape = new box2d.b2PolygonShape();
    const centre = new box2d.b2Vec2(offsetX_mm * M_PER_MM, offsetY_mm * M_PER_MM);
    shape.SetAsBox(hx_mm * M_PER_MM, hy_mm * M_PER_MM, centre, 0);

    const fd = new box2d.b2FixtureDef();
    fd.set_shape(shape);
    fd.set_density(1);
    fd.set_friction(0.5);
    if (userData !== undefined) fd.set_userData(userData);
    robotBody.CreateFixture(fd);

    box2d.destroy(shape);
    box2d.destroy(centre);
    box2d.destroy(fd);
  }

  // Public-API methods take/return millimetres.

  setKinematicPose(body, x_mm, y_mm, angle) {
    const pos = new box2d.b2Vec2(x_mm * M_PER_MM, y_mm * M_PER_MM);
    body.SetTransform(pos, angle);
    box2d.destroy(pos);
  }

  // Kinematic motion in Box2D MUST go through velocity (not SetTransform) for
  // the contact solver to impart impulses on dynamic bodies. SetTransform
  // teleports without contact response.
  setKinematicVelocity(body, vx_mm_s, vy_mm_s, omega) {
    const v = new box2d.b2Vec2(vx_mm_s * M_PER_MM, vy_mm_s * M_PER_MM);
    body.SetLinearVelocity(v);
    body.SetAngularVelocity(omega);
    box2d.destroy(v);
  }

  // Teleport a dynamic body and clear residual motion (used for reset).
  setDynamicPose(body, x_mm, y_mm, angle) {
    const pos = new box2d.b2Vec2(x_mm * M_PER_MM, y_mm * M_PER_MM);
    body.SetTransform(pos, angle);
    const zero = new box2d.b2Vec2(0, 0);
    body.SetLinearVelocity(zero);
    body.SetAngularVelocity(0);
    body.SetAwake(true);
    box2d.destroy(pos);
    box2d.destroy(zero);
  }

  readPose(body) {
    const p = body.GetPosition();
    return {
      x: p.get_x() * MM_PER_M,
      y: p.get_y() * MM_PER_M,
      angle: body.GetAngle(),
    };
  }

  // mm-space ray cast against all fixtures in the world. Returns the closest
  // hit excluding the optional `excludeBody` (used to skip the robot itself
  // when casting from a sensor mounted on the robot).
  //
  // box2d-wasm note: comparing fixtures/bodies via `===` does NOT work — each
  // wrapPointer call returns a fresh JS wrapper. The canonical equality test
  // is `box2d.getPointer(obj)`, which returns the underlying Emscripten raw
  // pointer (the property name on the wrapper itself is bundle-specific and
  // minified). Per-call allocations (two b2Vec2, one callback) are explicitly
  // destroyed; at 60 Hz this is fine.
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

    const excludePtr = excludeBody ? box2d.getPointer(excludeBody) : 0;

    const cb = new box2d.JSRayCastCallback();
    cb.ReportFixture = (fixturePtr, pointPtr, normalPtr, fraction) => {
      const fixture = box2d.wrapPointer(fixturePtr, box2d.b2Fixture);
      if (excludePtr && box2d.getPointer(fixture.GetBody()) === excludePtr) return -1;

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

  // Box2D becomes unstable above ~16 ms per step. Sub-step when the caller
  // hands us a larger dt (which happens at speedMult > 1).
  step(dt_s) {
    const subSteps = computeSubSteps(dt_s, MAX_PHYS_STEP_S);
    const sub = dt_s / subSteps;
    for (let i = 0; i < subSteps; i++) {
      this.world.Step(sub, 8, 3);
    }
  }
}

// Inlined here so world_2d.js stays a single ES module loadable from CDN-style
// dynamic import; the browser also gets the same function via window.kinematics
// for the rest of the simulator.
function computeSubSteps(dtSeconds, maxStepSeconds) {
  return Math.max(1, Math.ceil(dtSeconds / maxStepSeconds));
}
