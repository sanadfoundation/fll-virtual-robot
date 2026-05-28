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

// MM_PER_MS_100 in the simulator derives from wheel geometry:
// π × 56 / 360 ≈ 0.4887 mm/ms ⇒ SPEED ≈ 488.69 mm/s. Recompute here so the
// test stays in lockstep with any future wheel-diameter change.
const SPEED   = (Math.PI * 56 / 360) * 1000;  // mm/s, matches MM_PER_MS_100 * 1000
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

const MM_PER_MS_100 = Math.PI * 56 / 360;  // ≈0.4887, matches simulator

test('computeMoveDuration: 200 mm at full speed, 1× ⇒ 200/MM_PER_MS_100 ms', () => {
  const d = k.computeMoveDuration(200, 1, 1, MM_PER_MS_100);
  assert.ok(close(d, 200 / MM_PER_MS_100, 1e-9), `d=${d}`);
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

test('clampRobotPose: with walls=[] behaves like no walls (no regression)', () => {
  const out = k.clampRobotPose({ x: 1000, y: 500, angle: 0 }, { ...GEOM, walls: [] });
  assert.strictEqual(out.x, 1000);
  assert.strictEqual(out.y, 500);
  assert.strictEqual(out.clamped, false);
});

test('clampRobotPose: wall to the east of the robot is not touched ⇒ unchanged', () => {
  // Robot at (500, 500) heading 0; wall at x=900 (far east). Robot AABB ends
  // at 500+110=610, wall starts at 900. No overlap.
  const walls = [{ x: 900, y: 400, w: 100, h: 200 }];
  const out = k.clampRobotPose({ x: 500, y: 500, angle: 0 }, { ...GEOM, walls });
  assert.strictEqual(out.x, 500);
  assert.strictEqual(out.y, 500);
  assert.strictEqual(out.clamped, false);
});

test('clampRobotPose: wall overlapping robot from the east ⇒ robot pushed west', () => {
  // Robot at (500, 500) heading 0. AABB extents: x in [400, 610], y in [420, 580].
  // Wall AABB: x in [600, 700], y in [400, 600]. Overlap: x = 10, y = ~160.
  // Min-axis push = X, so robot's max-X (610) should align to wall's min-X (600).
  // pose.x must drop by 10 → 490.
  const walls = [{ x: 600, y: 400, w: 100, h: 200 }];
  const out = k.clampRobotPose({ x: 500, y: 500, angle: 0 }, { ...GEOM, walls });
  assert.strictEqual(out.x, 490);
  assert.strictEqual(out.y, 500);
  assert.strictEqual(out.clamped, true);
});

test('clampRobotPose: wall overlapping robot from the west ⇒ robot pushed east', () => {
  // Robot at (500, 500); wall at x=380..420 (slightly west). Overlap: x = 20.
  // Robot's min-X (400) should align to wall's max-X (420). pose.x rises by 20 → 520.
  const walls = [{ x: 380, y: 400, w: 40, h: 200 }];
  const out = k.clampRobotPose({ x: 500, y: 500, angle: 0 }, { ...GEOM, walls });
  assert.strictEqual(out.x, 520);
  assert.strictEqual(out.clamped, true);
});

test('clampRobotPose: wall overlapping robot from the north ⇒ robot pushed south', () => {
  // Robot AABB y in [420, 580]. Wall at y in [560, 700]. Overlap y = 20, x ≈ 200.
  // Min-axis push = Y, robot top (580) → wall bottom (560). pose.y drops 20 → 480.
  const walls = [{ x: 400, y: 560, w: 200, h: 140 }];
  const out = k.clampRobotPose({ x: 500, y: 500, angle: 0 }, { ...GEOM, walls });
  assert.strictEqual(out.y, 480);
  assert.strictEqual(out.clamped, true);
});

test('clampRobotPose: multiple walls — robot is pushed out of each in turn', () => {
  // Two walls touching the robot from east AND north. Robot ends up shifted
  // in both axes. (The push-out is applied per-wall in sequence.)
  const walls = [
    { x: 600, y: 400, w: 100, h: 200 },   // overlaps east, push west by 10
    { x: 400, y: 540, w: 200, h: 140 },   // y overlap=40, x overlap=190 (after first wall pushed pose.x → 490; new x AABB 390..600, still overlaps wall2's 400..600). Push south by ~40
  ];
  const out = k.clampRobotPose({ x: 500, y: 500, angle: 0 }, { ...GEOM, walls });
  assert.strictEqual(out.clamped, true);
  // Final pose has been pushed west by the first wall and south by the second.
  assert.ok(out.x < 500, `expected pose.x < 500, got ${out.x}`);
  assert.ok(out.y < 500, `expected pose.y < 500, got ${out.y}`);
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
