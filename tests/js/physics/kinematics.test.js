'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const k = require('../../../js/kinematics.js');

const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// ── steeringToWheels ─────────────────────────────────────────────────────────
//
// Spike `move` semantics: speed × (1 + steer) on the left wheel, speed ×
// (1 - steer) on the right. Positive steer = right turn = left wheel faster.

test('steeringToWheels: straight forward', () => {
  const { leftV, rightV } = k.steeringToWheels(1.0, 0);
  assert.strictEqual(leftV, 1);
  assert.strictEqual(rightV, 1);
});

test('steeringToWheels: full right turn drives left wheel double, right wheel zero', () => {
  const { leftV, rightV } = k.steeringToWheels(1.0, 1.0);
  assert.strictEqual(leftV, 2);
  assert.strictEqual(rightV, 0);
});

test('steeringToWheels: full left turn drives right wheel double, left wheel zero', () => {
  const { leftV, rightV } = k.steeringToWheels(1.0, -1.0);
  assert.strictEqual(leftV, 0);
  assert.strictEqual(rightV, 2);
});

test('steeringToWheels: straight reverse', () => {
  const { leftV, rightV } = k.steeringToWheels(-1.0, 0);
  assert.strictEqual(leftV, -1);
  assert.strictEqual(rightV, -1);
});

test('steeringToWheels: gentle right arc has both wheels positive, left faster', () => {
  const { leftV, rightV } = k.steeringToWheels(0.5, 0.5);
  assert.strictEqual(leftV, 0.75);
  assert.strictEqual(rightV, 0.25);
  assert.ok(leftV > rightV, 'left wheel faster on a right turn');
});

test('steeringToWheels: zero speed produces zero output regardless of steering', () => {
  const { leftV, rightV } = k.steeringToWheels(0, 1.0);
  assert.strictEqual(leftV, 0);
  assert.strictEqual(rightV, 0);
});

// ── wheelsToBodyVelocity ─────────────────────────────────────────────────────
//
// Outputs: vx, vy in mm/s along world axes; angVel in rad/s.
//
// Math y-up: positive angVel ⇒ heading INCREASES (CCW = left turn).
// Right turn (left wheel faster) ⇒ rightSpd-leftSpd < 0 ⇒ angVel < 0.

const SPEED   = 900;   // mm/s, matches MM_PER_MS_100 * 1000
const TRACK_W = 112;   // mm, matches simulator constant

test('wheelsToBodyVelocity: straight forward at heading 0 → +x only', () => {
  const v = k.wheelsToBodyVelocity(1, 1, 0, SPEED, TRACK_W);
  assert.ok(close(v.vx, SPEED),  `vx=${v.vx}`);
  assert.ok(close(v.vy, 0),      `vy=${v.vy}`);
  assert.ok(close(v.angVel, 0), `angVel=${v.angVel}`);
});

test('wheelsToBodyVelocity: straight forward at heading π/2 → +y only', () => {
  const v = k.wheelsToBodyVelocity(1, 1, Math.PI / 2, SPEED, TRACK_W);
  assert.ok(close(v.vx, 0,      1e-9), `vx=${v.vx}`);
  assert.ok(close(v.vy, SPEED,  1e-9), `vy=${v.vy}`);
  assert.ok(close(v.angVel, 0),        `angVel=${v.angVel}`);
});

test('wheelsToBodyVelocity: pure right pivot ⇒ -angVel, zero linear', () => {
  const v = k.wheelsToBodyVelocity(1, -1, 0, SPEED, TRACK_W);
  assert.ok(close(v.vx, 0,    1e-9), `vx=${v.vx}`);
  assert.ok(close(v.vy, 0,    1e-9), `vy=${v.vy}`);
  assert.ok(v.angVel < 0, `right pivot must produce -angVel (CW = math-negative), got ${v.angVel}`);
  // Magnitude check: |angVel| = 2*SPEED / TRACK_W
  assert.ok(close(v.angVel, -2 * SPEED / TRACK_W), `angVel=${v.angVel}`);
});

test('wheelsToBodyVelocity: pure left pivot ⇒ +angVel, zero linear', () => {
  const v = k.wheelsToBodyVelocity(-1, 1, 0, SPEED, TRACK_W);
  assert.ok(close(v.vx, 0, 1e-9));
  assert.ok(close(v.vy, 0, 1e-9));
  assert.ok(v.angVel > 0, `left pivot must produce +angVel (CCW = math-positive), got ${v.angVel}`);
  assert.ok(close(v.angVel, 2 * SPEED / TRACK_W));
});

test('wheelsToBodyVelocity: stationary inputs produce zero everything', () => {
  const v = k.wheelsToBodyVelocity(0, 0, 1.234, SPEED, TRACK_W);
  assert.ok(close(v.vx, 0),     `vx=${v.vx}`);
  assert.ok(close(v.vy, 0),     `vy=${v.vy}`);
  assert.ok(close(v.angVel, 0), `angVel=${v.angVel}`);
});

test('wheelsToBodyVelocity: linear speed is the average of left and right', () => {
  // Right arc (lv=1, rv=0.5) at heading 0 ⇒ vx = (1.0 + 0.5)/2 * SPEED = 675
  const v = k.wheelsToBodyVelocity(1.0, 0.5, 0, SPEED, TRACK_W);
  assert.ok(close(v.vx, 0.75 * SPEED, 1e-9), `vx=${v.vx}`);
  assert.ok(v.angVel < 0, 'right arc must spin body negatively (CW = math-negative)');
});

test('wheelsToBodyVelocity: heading π/2 (north, math-y-up) drives +y', () => {
  const v = k.wheelsToBodyVelocity(1, 1, Math.PI / 2, SPEED, TRACK_W);
  assert.ok(close(v.vx, 0,      1e-9), `vx=${v.vx}`);
  assert.ok(close(v.vy, SPEED,  1e-9), `vy=${v.vy}`);
});

// ── computeMoveDuration ──────────────────────────────────────────────────────

const MM_PER_MS_100 = 0.9;

test('computeMoveDuration: 200 mm at full speed, 1× ⇒ 222.22 ms', () => {
  const d = k.computeMoveDuration(200, 1, 1, MM_PER_MS_100);
  assert.ok(close(d, 200 / 0.9, 1e-9), `d=${d}`);
});

test('computeMoveDuration: speedMult 2 halves the duration', () => {
  const slow = k.computeMoveDuration(200, 1, 1, MM_PER_MS_100);
  const fast = k.computeMoveDuration(200, 1, 2, MM_PER_MS_100);
  assert.ok(close(fast, slow / 2, 1e-9), `slow=${slow}, fast=${fast}`);
});

test('computeMoveDuration: half-speed wheel doubles the duration', () => {
  const full = k.computeMoveDuration(200, 1.0, 1, MM_PER_MS_100);
  const half = k.computeMoveDuration(200, 0.5, 1, MM_PER_MS_100);
  assert.ok(close(half, full * 2, 1e-9));
});

test('computeMoveDuration: negative refDist treated as positive distance', () => {
  const a = k.computeMoveDuration( 200, 1, 1, MM_PER_MS_100);
  const b = k.computeMoveDuration(-200, 1, 1, MM_PER_MS_100);
  assert.strictEqual(a, b);
});

test('computeMoveDuration: zero distance ⇒ zero duration', () => {
  assert.strictEqual(k.computeMoveDuration(0, 1, 1, MM_PER_MS_100), 0);
});

// ── computeSubSteps ──────────────────────────────────────────────────────────

const MAX_STEP = 1 / 60;

test('computeSubSteps: dt at the cap ⇒ 1 step', () => {
  assert.strictEqual(k.computeSubSteps(1 / 60, MAX_STEP), 1);
});

test('computeSubSteps: dt below the cap ⇒ 1 step', () => {
  assert.strictEqual(k.computeSubSteps(1 / 120, MAX_STEP), 1);
});

test('computeSubSteps: dt = 4× the cap ⇒ 4 steps (e.g. speedMult=4)', () => {
  assert.strictEqual(k.computeSubSteps(4 / 60, MAX_STEP), 4);
});

test('computeSubSteps: dt = 2.5× the cap ⇒ ceiling to 3 steps', () => {
  assert.strictEqual(k.computeSubSteps(2.5 / 60, MAX_STEP), 3);
});

test('computeSubSteps: zero dt clamps to a minimum of 1 step', () => {
  assert.strictEqual(k.computeSubSteps(0, MAX_STEP), 1);
});

test('computeSubSteps: 50 ms with 16.67 ms cap ⇒ 3 sub-steps', () => {
  assert.strictEqual(k.computeSubSteps(0.05, MAX_STEP), 3);
});

// ── clampRobotPose ───────────────────────────────────────────────────────────
//
// Box2D v2.4 does not generate contacts between kinematic and static bodies
// (Dynamics manual: "A fixture on a kinematic body can only collide with a
// dynamic body"). Until/unless the robot becomes dynamic, the simulator
// clamps the robot pose to the field rectangle outside the engine.
//
// Body-local frame matches addRobot in world_2d.js: +X is forward, +Y is
// lateral. The bumper extends forward of the chassis in body-local +X only;
// the back, left, and right edges are flush with the chassis half-extents.

const FIELD = { fieldW: 2362, fieldH: 1143 };
const ROBOT = { bodyW: 160, bodyH: 200, bumperDepth: 10 };
const GEOM  = { ...ROBOT, ...FIELD };

test('clampRobotPose: centre of field, no rotation ⇒ unchanged, clamped=false', () => {
  const out = k.clampRobotPose({ x: 1000, y: 500, angle: 0 }, GEOM);
  assert.strictEqual(out.x, 1000);
  assert.strictEqual(out.y, 500);
  assert.strictEqual(out.clamped, false);
});

test('clampRobotPose: heading east, past right wall ⇒ chassis-front + bumper hugs wall', () => {
  // Body angle 0 ⇒ forward = world +X. Forward extent = bodyH/2 + bumperDepth
  // = 110. xMax = fieldW - 110 = 2252.
  const out = k.clampRobotPose({ x: 2400, y: 500, angle: 0 }, GEOM);
  assert.strictEqual(out.x, 2252);
  assert.strictEqual(out.y, 500);
  assert.strictEqual(out.clamped, true);
});

test('clampRobotPose: heading east, past left wall ⇒ chassis-back hugs wall (no bumper at back)', () => {
  // Body angle 0 ⇒ back = world -X. Back extent = bodyH/2 = 100. xMin = 100.
  const out = k.clampRobotPose({ x: 50, y: 500, angle: 0 }, GEOM);
  assert.strictEqual(out.x, 100);
  assert.strictEqual(out.clamped, true);
});

test('clampRobotPose: heading north, past top wall ⇒ chassis-front + bumper hugs top wall', () => {
  // Body angle π/2 ⇒ forward = world +Y. yMax = fieldH - 110 = 1033.
  const out = k.clampRobotPose({ x: 1000, y: 1200, angle: Math.PI / 2 }, GEOM);
  assert.ok(Math.abs(out.y - 1033) < 1e-9, `y=${out.y}`);
  assert.strictEqual(out.clamped, true);
});

test('clampRobotPose: heading north, past bottom wall ⇒ chassis-back hugs bottom wall', () => {
  // Body angle π/2 ⇒ back = world -Y. yMin = 100.
  const out = k.clampRobotPose({ x: 1000, y: 50, angle: Math.PI / 2 }, GEOM);
  assert.ok(Math.abs(out.y - 100) < 1e-9, `y=${out.y}`);
  assert.strictEqual(out.clamped, true);
});

test('clampRobotPose: heading south, past bottom wall ⇒ chassis-front + bumper hugs bottom wall', () => {
  // Body angle -π/2 ⇒ forward = world -Y. yMin = 110.
  const out = k.clampRobotPose({ x: 1000, y: 50, angle: -Math.PI / 2 }, GEOM);
  assert.ok(Math.abs(out.y - 110) < 1e-9, `y=${out.y}`);
  assert.strictEqual(out.clamped, true);
});

test('clampRobotPose: rotated 45° near corner ⇒ all four corners stay inside field', () => {
  const out = k.clampRobotPose({ x: 50, y: 50, angle: Math.PI / 4 }, GEOM);
  const halfH = ROBOT.bodyH / 2;
  const halfW = ROBOT.bodyW / 2;
  const corners = [
    [-halfH,                     -halfW],
    [-halfH,                     +halfW],
    [+halfH + ROBOT.bumperDepth, -halfW],
    [+halfH + ROBOT.bumperDepth, +halfW],
  ];
  const cos = Math.cos(Math.PI / 4);
  const sin = Math.sin(Math.PI / 4);
  for (const [lx, ly] of corners) {
    const cx = out.x + lx * cos - ly * sin;
    const cy = out.y + lx * sin + ly * cos;
    assert.ok(cx >= -1e-9, `corner x=${cx} below field`);
    assert.ok(cx <= FIELD.fieldW + 1e-9, `corner x=${cx} above field`);
    assert.ok(cy >= -1e-9, `corner y=${cy} below field`);
    assert.ok(cy <= FIELD.fieldH + 1e-9, `corner y=${cy} above field`);
  }
  assert.strictEqual(out.clamped, true);
});

test('clampRobotPose: default spawn (350, 163, 90°) is inside field ⇒ no clamp', () => {
  const out = k.clampRobotPose({ x: 350, y: 163, angle: Math.PI / 2 }, GEOM);
  assert.strictEqual(out.x, 350);
  assert.strictEqual(out.y, 163);
  assert.strictEqual(out.clamped, false);
});
