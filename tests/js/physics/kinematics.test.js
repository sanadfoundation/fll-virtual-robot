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
// Sign-flip rule from CLAUDE.md: positive angVel ⇒ canvas heading INCREASES,
// which is the direction a right turn (left wheel faster) should rotate.

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

test('wheelsToBodyVelocity: pure right pivot ⇒ +angVel, zero linear', () => {
  const v = k.wheelsToBodyVelocity(1, -1, 0, SPEED, TRACK_W);
  assert.ok(close(v.vx, 0,    1e-9), `vx=${v.vx}`);
  assert.ok(close(v.vy, 0,    1e-9), `vy=${v.vy}`);
  assert.ok(v.angVel > 0, `right pivot must produce +angVel, got ${v.angVel}`);
  // Magnitude check: |angVel| = 2*SPEED / TRACK_W
  assert.ok(close(v.angVel, 2 * SPEED / TRACK_W), `angVel=${v.angVel}`);
});

test('wheelsToBodyVelocity: pure left pivot ⇒ -angVel, zero linear', () => {
  const v = k.wheelsToBodyVelocity(-1, 1, 0, SPEED, TRACK_W);
  assert.ok(close(v.vx, 0, 1e-9));
  assert.ok(close(v.vy, 0, 1e-9));
  assert.ok(v.angVel < 0, `left pivot must produce -angVel, got ${v.angVel}`);
  assert.ok(close(v.angVel, -2 * SPEED / TRACK_W));
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
  assert.ok(v.angVel > 0, 'right arc must spin body positively');
});

test('wheelsToBodyVelocity: heading -π/2 (north, canvas-Y-down) drives -y', () => {
  const v = k.wheelsToBodyVelocity(1, 1, -Math.PI / 2, SPEED, TRACK_W);
  assert.ok(close(v.vx, 0,      1e-9), `vx=${v.vx}`);
  assert.ok(close(v.vy, -SPEED, 1e-9), `vy=${v.vy}`);
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
