# Y-Up Coordinate System Flip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip the simulator's internal coordinate system from canvas-y-down (origin at top-left, `robot.y=980` near the team) to math-y-up (origin at bottom-left, `robot.y=163` near the team). All rendering converts math → canvas at the boundary.

**Architecture:** One sign flip in `js/kinematics.js` (the `angVel` formula) plus per-render-site `(FIELD_H_MM - mathY)` conversions in `js/simulator.js`. `_animateTank`, `_sensorPosition`, `_colorAtPosition`, the Box2D physics layer, and the Spike Prime API are all convention-agnostic when y and heading are consistent — they don't change. Tests that hardcode `980` / `-90` get updated alongside.

**Tech Stack:** Vanilla JS, Box2D-WASM via dynamic import, `node:test` + `node:assert`. No build step, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-09-y-up-coordinates-design.md`

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `js/kinematics.js` | Modified | Drop the leading minus on `angVel` so right-turn = CW = negative (math convention). |
| `tests/js/physics/kinematics.test.js` | Modified | Flip three assertion signs and one test's heading input/expected vy. |
| `js/simulator.js` | Modified | Spawn coords; FIELD_OBJECTS / OBSTACLES y values; render-side y-flip in `_drawField`, `_drawRobot`, `_drawTrail` family, `_drawRuler`; cursor y-flip in `_handleHover`; rotation sign flip in `_drawRobot`. |
| `tests/js/state/reset.test.js` | Modified | Spawn assertions: 980 → 163, -90 → 90. |
| `tests/js/state/sensor-state.test.js` | Modified | Spawn assertions. |
| `tests/js/bridge/bridge-protocol.test.js` | Modified | Spawn heading assertion. |
| `tests/js/commands/dispatch.test.js` | Modified | Five "no movement" assertions: 980 → 163, -90 → 90. |
| `tests/js/commands/dispatch-extra.test.js` | Modified | Five "no movement" assertions. |
| `tests/js/physics/world_2d_boundary.test.js` | Modified | Spawn-position cosmetic update so test values match the new convention. (Functionally these tests verify mm-to-m conversion; the values are just examples, but staying in sync prevents reader confusion.) |
| `CLAUDE.md` | Modified | Field section (spawn + heading convention); replace "Canvas Y increases downward… don't fix it" constraint with "Internal coords are math-y-up; rendering converts at the boundary." |

---

## Constants used throughout

These are already defined and don't need to be redeclared:

- `FIELD_W_MM = 2362`, `FIELD_H_MM = 1143` (`js/simulator.js:24-25`)
- `ROBOT_BODY_W = 160`, `ROBOT_BODY_H = 200` (`js/simulator.js:30-31`)
- `TRACK_W_MM = 112` (`js/simulator.js:29`)

---

## Task 1: Flip the kinematics angVel sign

**Files:**
- Modify: `js/kinematics.js`
- Modify: `tests/js/physics/kinematics.test.js`

This task changes the convention by which `wheelsToBodyVelocity` returns angular velocity. The sign flip is one character; the four test assertions change to match the new sign.

- [ ] **Step 1.1: Update the kinematics test assertions to expect math-convention signs**

In `tests/js/physics/kinematics.test.js`, replace the comment block at lines 51-56:

```javascript
// ── wheelsToBodyVelocity ─────────────────────────────────────────────────────
//
// Outputs: vx, vy in mm/s along world axes; angVel in rad/s.
//
// Sign-flip rule from CLAUDE.md: positive angVel ⇒ canvas heading INCREASES,
// which is the direction a right turn (left wheel faster) should rotate.
```

with:

```javascript
// ── wheelsToBodyVelocity ─────────────────────────────────────────────────────
//
// Outputs: vx, vy in mm/s along world axes; angVel in rad/s.
//
// Math y-up: positive angVel ⇒ heading INCREASES (CCW = left turn).
// Right turn (left wheel faster) ⇒ rightSpd-leftSpd < 0 ⇒ angVel < 0.
```

Then update the four assertions:

In the test `'wheelsToBodyVelocity: pure right pivot ⇒ +angVel, zero linear'` (around line 75), replace:

```javascript
test('wheelsToBodyVelocity: pure right pivot ⇒ +angVel, zero linear', () => {
  const v = k.wheelsToBodyVelocity(1, -1, 0, SPEED, TRACK_W);
  assert.ok(close(v.vx, 0,    1e-9), `vx=${v.vx}`);
  assert.ok(close(v.vy, 0,    1e-9), `vy=${v.vy}`);
  assert.ok(v.angVel > 0, `right pivot must produce +angVel, got ${v.angVel}`);
  // Magnitude check: |angVel| = 2*SPEED / TRACK_W
  assert.ok(close(v.angVel, 2 * SPEED / TRACK_W), `angVel=${v.angVel}`);
});
```

with:

```javascript
test('wheelsToBodyVelocity: pure right pivot ⇒ -angVel, zero linear', () => {
  const v = k.wheelsToBodyVelocity(1, -1, 0, SPEED, TRACK_W);
  assert.ok(close(v.vx, 0,    1e-9), `vx=${v.vx}`);
  assert.ok(close(v.vy, 0,    1e-9), `vy=${v.vy}`);
  assert.ok(v.angVel < 0, `right pivot must produce -angVel (CW = math-negative), got ${v.angVel}`);
  // Magnitude check: |angVel| = 2*SPEED / TRACK_W
  assert.ok(close(v.angVel, -2 * SPEED / TRACK_W), `angVel=${v.angVel}`);
});
```

In the test `'wheelsToBodyVelocity: pure left pivot ⇒ -angVel, zero linear'` (around line 84), replace:

```javascript
test('wheelsToBodyVelocity: pure left pivot ⇒ -angVel, zero linear', () => {
  const v = k.wheelsToBodyVelocity(-1, 1, 0, SPEED, TRACK_W);
  assert.ok(close(v.vx, 0, 1e-9));
  assert.ok(close(v.vy, 0, 1e-9));
  assert.ok(v.angVel < 0, `left pivot must produce -angVel, got ${v.angVel}`);
  assert.ok(close(v.angVel, -2 * SPEED / TRACK_W));
});
```

with:

```javascript
test('wheelsToBodyVelocity: pure left pivot ⇒ +angVel, zero linear', () => {
  const v = k.wheelsToBodyVelocity(-1, 1, 0, SPEED, TRACK_W);
  assert.ok(close(v.vx, 0, 1e-9));
  assert.ok(close(v.vy, 0, 1e-9));
  assert.ok(v.angVel > 0, `left pivot must produce +angVel (CCW = math-positive), got ${v.angVel}`);
  assert.ok(close(v.angVel, 2 * SPEED / TRACK_W));
});
```

In the test `'wheelsToBodyVelocity: linear speed is the average of left and right'` (around line 99), replace:

```javascript
test('wheelsToBodyVelocity: linear speed is the average of left and right', () => {
  // Right arc (lv=1, rv=0.5) at heading 0 ⇒ vx = (1.0 + 0.5)/2 * SPEED = 675
  const v = k.wheelsToBodyVelocity(1.0, 0.5, 0, SPEED, TRACK_W);
  assert.ok(close(v.vx, 0.75 * SPEED, 1e-9), `vx=${v.vx}`);
  assert.ok(v.angVel > 0, 'right arc must spin body positively');
});
```

with:

```javascript
test('wheelsToBodyVelocity: linear speed is the average of left and right', () => {
  // Right arc (lv=1, rv=0.5) at heading 0 ⇒ vx = (1.0 + 0.5)/2 * SPEED = 675
  const v = k.wheelsToBodyVelocity(1.0, 0.5, 0, SPEED, TRACK_W);
  assert.ok(close(v.vx, 0.75 * SPEED, 1e-9), `vx=${v.vx}`);
  assert.ok(v.angVel < 0, 'right arc must spin body negatively (CW = math-negative)');
});
```

In the test `'wheelsToBodyVelocity: heading -π/2 (north, canvas-Y-down) drives -y'` (around line 106), replace:

```javascript
test('wheelsToBodyVelocity: heading -π/2 (north, canvas-Y-down) drives -y', () => {
  const v = k.wheelsToBodyVelocity(1, 1, -Math.PI / 2, SPEED, TRACK_W);
  assert.ok(close(v.vx, 0,      1e-9), `vx=${v.vx}`);
  assert.ok(close(v.vy, -SPEED, 1e-9), `vy=${v.vy}`);
});
```

with:

```javascript
test('wheelsToBodyVelocity: heading π/2 (north, math-y-up) drives +y', () => {
  const v = k.wheelsToBodyVelocity(1, 1, Math.PI / 2, SPEED, TRACK_W);
  assert.ok(close(v.vx, 0,      1e-9), `vx=${v.vx}`);
  assert.ok(close(v.vy, SPEED,  1e-9), `vy=${v.vy}`);
});
```

- [ ] **Step 1.2: Run the kinematics tests, confirm three of them now fail**

Run: `node --test tests/js/physics/kinematics.test.js`

Expected: failures on the three pivot-direction assertions and the heading-π/2 test. Other tests still pass. (The π/2 test currently checks `(1, 1, π/2, …)` and expects vy=SPEED, which already passes with the unflipped kinematics — but its inputs and expected behavior are now correct for math convention, so it stays green either way. The flipped-version of the same test, expecting `vy=-SPEED at heading=-π/2`, is the one we replaced.)

- [ ] **Step 1.3: Flip the angVel sign in `js/kinematics.js`**

Replace the body of `wheelsToBodyVelocity` and its preceding comment (lines 30-46):

```javascript
  // Per-frame command shape sent to the kinematic robot body. Returns the
  // world-frame linear velocity (mm/s) and angular velocity (rad/s) given
  // current normalised wheel speeds and the body's current heading.
  //
  // Sign convention preserved from the canvas-Y-down legacy integrator:
  // right-turn = left wheel faster ⇒ rightSpd-leftSpd < 0 ⇒ +angVel ⇒ body
  // angle increases ⇒ canvas heading increases. Don't "fix" the leading minus.
  function wheelsToBodyVelocity(leftV, rightV, headingRad, speedMmPerS, trackWidthMm) {
    const leftSpd  = leftV  * speedMmPerS;
    const rightSpd = rightV * speedMmPerS;
    const linSpd   = (leftSpd + rightSpd) / 2;
    return {
      vx:     Math.cos(headingRad) * linSpd,
      vy:     Math.sin(headingRad) * linSpd,
      angVel: -(rightSpd - leftSpd) / trackWidthMm,
    };
  }
```

with:

```javascript
  // Per-frame command shape sent to the kinematic robot body. Returns the
  // world-frame linear velocity (mm/s) and angular velocity (rad/s) given
  // current normalised wheel speeds and the body's current heading.
  //
  // Math y-up convention: right turn = left wheel faster ⇒ rightSpd-leftSpd < 0
  // ⇒ angVel < 0 ⇒ heading decreases (CW = math-negative). vx/vy use cos/sin
  // of heading directly; the trig works in either y convention as long as
  // heading sign agrees with y direction (it does, in both conventions).
  function wheelsToBodyVelocity(leftV, rightV, headingRad, speedMmPerS, trackWidthMm) {
    const leftSpd  = leftV  * speedMmPerS;
    const rightSpd = rightV * speedMmPerS;
    const linSpd   = (leftSpd + rightSpd) / 2;
    return {
      vx:     Math.cos(headingRad) * linSpd,
      vy:     Math.sin(headingRad) * linSpd,
      angVel: (rightSpd - leftSpd) / trackWidthMm,
    };
  }
```

- [ ] **Step 1.4: Run all tests, confirm green**

Run: `node --test 'tests/js/**/*.test.js'`

Expected: 211 pass, 0 fail. (No other test asserts on the sign of angVel.)

- [ ] **Step 1.5: Commit**

```bash
git add js/kinematics.js tests/js/physics/kinematics.test.js
git commit -m "refactor(kinematics): flip angVel sign for math y-up convention"
```

---

## Task 2: Update spawn coordinates and the tests that hardcode them

**Files:**
- Modify: `js/simulator.js` (`makeRobotState`)
- Modify: `tests/js/state/reset.test.js`
- Modify: `tests/js/state/sensor-state.test.js`
- Modify: `tests/js/bridge/bridge-protocol.test.js`
- Modify: `tests/js/commands/dispatch.test.js`
- Modify: `tests/js/commands/dispatch-extra.test.js`

This task moves the spawn from `(350, 980)` heading `-90` to `(350, 163)` heading `90`, and updates every test that asserts on those values.

- [ ] **Step 2.1: Update test assertions to the new spawn**

In `tests/js/state/reset.test.js`, replace:

```javascript
test('initial state: x=350, y=980, heading=-90', () => {
  const sim = createSim();
  assert.strictEqual(sim.robot.x, 350);
  assert.strictEqual(sim.robot.y, 980);
  assert.strictEqual(sim.robot.heading, -90);
});
```

with:

```javascript
test('initial state: x=350, y=163, heading=90 (math y-up)', () => {
  const sim = createSim();
  assert.strictEqual(sim.robot.x, 350);
  assert.strictEqual(sim.robot.y, 163);
  assert.strictEqual(sim.robot.heading, 90);
});
```

And in the `'reset(): restores position, heading, trail, and pairMap'` test (around line 27), replace the post-reset assertions:

```javascript
  assert.strictEqual(sim.robot.x, 350);
  assert.strictEqual(sim.robot.y, 980);
  assert.strictEqual(sim.robot.heading, -90);
```

with:

```javascript
  assert.strictEqual(sim.robot.x, 350);
  assert.strictEqual(sim.robot.y, 163);
  assert.strictEqual(sim.robot.heading, 90);
```

In `tests/js/state/sensor-state.test.js`, in the `'_sensorState: returns correct initial values'` test (around line 7), replace:

```javascript
  assert.strictEqual(state.x,           350);
  assert.strictEqual(state.y,           980);
  assert.strictEqual(state.heading,     -90);
```

with:

```javascript
  assert.strictEqual(state.x,           350);
  assert.strictEqual(state.y,           163);
  assert.strictEqual(state.heading,     90);
```

In `tests/js/bridge/bridge-protocol.test.js`, in `'executeCommand: read_sensors returns initial robot state'` (around line 7), replace:

```javascript
  assert.strictEqual(result.x,       350);
  assert.strictEqual(result.y,       980);
  assert.strictEqual(result.heading, -90);
```

with:

```javascript
  assert.strictEqual(result.x,       350);
  assert.strictEqual(result.y,       163);
  assert.strictEqual(result.heading, 90);
```

And in `'executeCommand: sequential commands each resolve before the next'` (around line 33), replace:

```javascript
  assert.strictEqual(r1.y, 980);
```

with:

```javascript
  assert.strictEqual(r1.y, 163);
```

In `tests/js/commands/dispatch.test.js`, replace **every** `assert.strictEqual(sim.robot.y, 980)` with `assert.strictEqual(sim.robot.y, 163)`. There are two occurrences (around lines 38 and 64). Use:

```bash
grep -n "sim.robot.y, 980" tests/js/commands/dispatch.test.js
```

to find them. After the edit, that grep should return zero results and `grep -n "sim.robot.y, 163" tests/js/commands/dispatch.test.js` should return two.

In `tests/js/commands/dispatch-extra.test.js`, the same pattern: replace `sim.robot.y, 980` (four occurrences around lines 77, 84, 124, 138) with `sim.robot.y, 163`. Also replace the single `assert.strictEqual(sim.robot.heading, -90);` (around line 139) with `assert.strictEqual(sim.robot.heading, 90);`.

- [ ] **Step 2.2: Run tests; confirm the spawn-related ones now fail**

Run: `node --test 'tests/js/**/*.test.js'`

Expected: ~13 failures clustered in `state/reset.test.js`, `state/sensor-state.test.js`, `bridge/bridge-protocol.test.js`, `commands/dispatch.test.js`, `commands/dispatch-extra.test.js`. The failure messages should all be about `163`-vs-`980` or `90`-vs-`-90` mismatches. Any failure outside these five files is unexpected — investigate before proceeding.

- [ ] **Step 2.3: Update the spawn in `js/simulator.js`**

Replace the `makeRobotState()` body (around line 103):

```javascript
function makeRobotState() {
  return {
    x: 350,          // mm from left edge
    y: 980,          // mm from top edge
    heading: -90,    // degrees, -90 = facing up (north)
    motors: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 },
    sensors: {
      colorValue: 'none',
      distanceMM: 300,
    },
    display: Array(25).fill(0), // 5×5 matrix brightness
  };
}
```

with:

```javascript
function makeRobotState() {
  return {
    x: 350,          // mm from left edge
    y: 163,          // mm from bottom edge (math y-up)
    heading: 90,     // degrees: 0=east, 90=north, 180=west, 270=south
    motors: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 },
    sensors: {
      colorValue: 'none',
      distanceMM: 300,
    },
    display: Array(25).fill(0), // 5×5 matrix brightness
  };
}
```

- [ ] **Step 2.4: Run tests, confirm all pass**

Run: `node --test 'tests/js/**/*.test.js'`

Expected: 211 pass, 0 fail.

- [ ] **Step 2.5: Commit**

```bash
git add js/simulator.js tests/js/state/reset.test.js tests/js/state/sensor-state.test.js tests/js/bridge/bridge-protocol.test.js tests/js/commands/dispatch.test.js tests/js/commands/dispatch-extra.test.js
git commit -m "refactor(simulator): spawn at (350, 163) heading 90 (math y-up)"
```

---

## Task 3: Flip FIELD_OBJECTS / OBSTACLES y values and `_drawField` rendering

**Files:**
- Modify: `js/simulator.js`

This task converts every `y` in `FIELD_OBJECTS` and `OBSTACLES` to math convention, and updates `_drawField` to render those math-y values via `(FIELD_H_MM - mathY)` for points/lines and `(FIELD_H_MM - mathY - h)` for rectangles (since their (x, y) was canvas-top-left and is now math-bottom-left).

After this commit, the field renders correctly in the browser; before it, the field is broken visually but tests pass (tests don't verify rendering).

- [ ] **Step 3.1: Replace `FIELD_OBJECTS`**

In `js/simulator.js`, replace the `FIELD_OBJECTS` block (lines 76-88):

```javascript
const FIELD_OBJECTS = [
  // Home area
  { type: 'rect', x: 80, y: 780, w: 600, h: 300, fill: 'rgba(100,160,255,0.18)', stroke: '#4488ff', lw: 3, label: 'HOME' },
  // Mission areas — sensorColor defines what the color sensor reads inside each zone
  { type: 'rect', x: 900,  y: 100,  w: 200, h: 200, fill: 'rgba(255,200,100,0.2)', stroke: '#f0a830', lw: 2, sensorColor: 'yellow' },
  { type: 'rect', x: 1600, y: 100,  w: 200, h: 200, fill: 'rgba(100,220,150,0.2)', stroke: '#30c060', lw: 2, sensorColor: 'green'  },
  { type: 'rect', x: 1900, y: 700,  w: 200, h: 200, fill: 'rgba(220,100,100,0.2)', stroke: '#cc4444', lw: 2, sensorColor: 'red'    },
  // Colored lines on the mat
  { type: 'line', x1: 0,    y1: 680, x2: 2362, y2: 680, stroke: '#222', lw: 4, sensorColor: 'black' },
  { type: 'circle', x: 1181, y: 571, r: 80, fill: 'rgba(200,200,200,0.2)', stroke: '#888', lw: 2 },
  // Launch line
  { type: 'line', x1: 0,    y1: 1000, x2: 680, y2: 1000, stroke: '#222', lw: 3, sensorColor: 'black' },
];
```

with:

```javascript
// All `y` values are math y-up (origin bottom-left). For rectangles, (x, y) is
// the bottom-left corner. Conversions from the old canvas-top-left values:
//   rect:   newY = FIELD_H_MM - oldY - h
//   line:   newY = FIELD_H_MM - oldY
//   circle: newY = FIELD_H_MM - oldY
const FIELD_OBJECTS = [
  // Home area (was canvas y=780, h=300 ⇒ math y = 1143-780-300 = 63)
  { type: 'rect', x: 80, y: 63, w: 600, h: 300, fill: 'rgba(100,160,255,0.18)', stroke: '#4488ff', lw: 3, label: 'HOME' },
  // Mission areas — sensorColor defines what the color sensor reads inside each zone
  // (was canvas y=100, h=200 ⇒ math y = 1143-100-200 = 843)
  { type: 'rect', x: 900,  y: 843, w: 200, h: 200, fill: 'rgba(255,200,100,0.2)', stroke: '#f0a830', lw: 2, sensorColor: 'yellow' },
  { type: 'rect', x: 1600, y: 843, w: 200, h: 200, fill: 'rgba(100,220,150,0.2)', stroke: '#30c060', lw: 2, sensorColor: 'green'  },
  // (was canvas y=700, h=200 ⇒ math y = 1143-700-200 = 243)
  { type: 'rect', x: 1900, y: 243, w: 200, h: 200, fill: 'rgba(220,100,100,0.2)', stroke: '#cc4444', lw: 2, sensorColor: 'red'    },
  // Colored lines on the mat (was canvas y=680 ⇒ math y = 1143-680 = 463)
  { type: 'line', x1: 0,    y1: 463, x2: 2362, y2: 463, stroke: '#222', lw: 4, sensorColor: 'black' },
  // Centre circle (was canvas y=571 ⇒ math y = 1143-571 = 572)
  { type: 'circle', x: 1181, y: 572, r: 80, fill: 'rgba(200,200,200,0.2)', stroke: '#888', lw: 2 },
  // Launch line (was canvas y=1000 ⇒ math y = 1143-1000 = 143)
  { type: 'line', x1: 0,    y1: 143, x2: 680, y2: 143, stroke: '#222', lw: 3, sensorColor: 'black' },
];
```

- [ ] **Step 3.2: Replace `OBSTACLES`**

In `js/simulator.js`, replace the `OBSTACLES` block (lines 96-99):

```javascript
const OBSTACLES = [
  { x: 1700, y: 200, w: 100, h: 100, fill: '#9b59b6', stroke: '#5e2c79', label: '1' },
  { x: 2000, y: 800, w: 120, h: 120, fill: '#e67e22', stroke: '#a04d10', label: '2' },
];
```

with:

```javascript
// `(x, y)` is the bottom-left corner in math y-up. Spawn coordinates picked to
// centre each obstacle on the matching coloured mission zone in FIELD_OBJECTS:
// '1' on the green sensor zone, '2' on the red.
//   was canvas y=200, h=100 ⇒ math y = 1143-200-100 = 843
//   was canvas y=800, h=120 ⇒ math y = 1143-800-120 = 223
const OBSTACLES = [
  { x: 1700, y: 843, w: 100, h: 100, fill: '#9b59b6', stroke: '#5e2c79', label: '1' },
  { x: 2000, y: 223, w: 120, h: 120, fill: '#e67e22', stroke: '#a04d10', label: '2' },
];
```

- [ ] **Step 3.3: Update `_drawField` to render math-y values via canvas-y conversion**

In `js/simulator.js`, find the `_drawField` body (around line 294). The grid loops at lines 302-307 stay unchanged (the grid is symmetric, so canvas-y vs math-y produces identical visuals).

Replace the field-objects loop (lines 309-344):

```javascript
    // Field objects
    for (const obj of FIELD_OBJECTS) {
      ctx.save();
      if (obj.type === 'rect') {
        ctx.fillStyle   = obj.fill   || 'transparent';
        ctx.strokeStyle = obj.stroke || 'transparent';
        ctx.lineWidth   = (obj.lw || 1) * s;
        ctx.beginPath();
        ctx.roundRect(obj.x*s, obj.y*s, obj.w*s, obj.h*s, 4*s);
        if (obj.fill)   ctx.fill();
        if (obj.stroke) ctx.stroke();
        if (obj.label) {
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.font = `bold ${11*s}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(obj.label, (obj.x + obj.w/2)*s, (obj.y + obj.h/2)*s);
        }
      } else if (obj.type === 'line') {
        ctx.strokeStyle = obj.stroke;
        ctx.lineWidth   = (obj.lw || 1) * s;
        ctx.beginPath();
        ctx.moveTo(obj.x1*s, obj.y1*s);
        ctx.lineTo(obj.x2*s, obj.y2*s);
        ctx.stroke();
      } else if (obj.type === 'circle') {
        ctx.fillStyle   = obj.fill   || 'transparent';
        ctx.strokeStyle = obj.stroke || 'transparent';
        ctx.lineWidth   = (obj.lw || 1) * s;
        ctx.beginPath();
        ctx.arc(obj.x*s, obj.y*s, obj.r*s, 0, Math.PI*2);
        if (obj.fill)   ctx.fill();
        if (obj.stroke) ctx.stroke();
      }
      ctx.restore();
    }
```

with:

```javascript
    // Field objects. FIELD_OBJECTS uses math y-up; convert to canvas y here.
    // Rectangles: math (x, y) is bottom-left ⇒ canvas top-left = (x, FIELD_H_MM - y - h).
    // Lines / circles: math y ⇒ canvas y = FIELD_H_MM - y.
    for (const obj of FIELD_OBJECTS) {
      ctx.save();
      if (obj.type === 'rect') {
        const canvasY = (FIELD_H_MM - obj.y - obj.h) * s;
        ctx.fillStyle   = obj.fill   || 'transparent';
        ctx.strokeStyle = obj.stroke || 'transparent';
        ctx.lineWidth   = (obj.lw || 1) * s;
        ctx.beginPath();
        ctx.roundRect(obj.x*s, canvasY, obj.w*s, obj.h*s, 4*s);
        if (obj.fill)   ctx.fill();
        if (obj.stroke) ctx.stroke();
        if (obj.label) {
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.font = `bold ${11*s}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          // Label centre: x is unchanged; canvas-y centre = (FIELD_H_MM - y - h/2) * s.
          ctx.fillText(obj.label, (obj.x + obj.w/2)*s, (FIELD_H_MM - obj.y - obj.h/2)*s);
        }
      } else if (obj.type === 'line') {
        const canvasY1 = (FIELD_H_MM - obj.y1) * s;
        const canvasY2 = (FIELD_H_MM - obj.y2) * s;
        ctx.strokeStyle = obj.stroke;
        ctx.lineWidth   = (obj.lw || 1) * s;
        ctx.beginPath();
        ctx.moveTo(obj.x1*s, canvasY1);
        ctx.lineTo(obj.x2*s, canvasY2);
        ctx.stroke();
      } else if (obj.type === 'circle') {
        const canvasY = (FIELD_H_MM - obj.y) * s;
        ctx.fillStyle   = obj.fill   || 'transparent';
        ctx.strokeStyle = obj.stroke || 'transparent';
        ctx.lineWidth   = (obj.lw || 1) * s;
        ctx.beginPath();
        ctx.arc(obj.x*s, canvasY, obj.r*s, 0, Math.PI*2);
        if (obj.fill)   ctx.fill();
        if (obj.stroke) ctx.stroke();
      }
      ctx.restore();
    }
```

- [ ] **Step 3.4: Run all tests, confirm green**

Run: `node --test 'tests/js/**/*.test.js'`

Expected: 211 pass, 0 fail. Tests don't verify rendering visuals, so this is purely a "didn't break anything" check.

- [ ] **Step 3.5: Commit**

```bash
git add js/simulator.js
git commit -m "refactor(simulator): FIELD_OBJECTS / OBSTACLES in math y; convert at render"
```

---

## Task 4: Flip `_drawRobot` y and rotation

**Files:**
- Modify: `js/simulator.js`

The robot is drawn by translating to its position, then rotating by `(heading + 90)` to align local "front-up" with the heading direction. With math y-up:

- Position: `r.y` is in math; canvas y = `FIELD_H_MM - r.y`.
- Rotation: in canvas convention, `(heading + 90)` produced "front faces canvas-y direction matching heading". In math convention, `(90 - heading)` produces the same visual result because the rotation sense is inverted (canvas `ctx.rotate` is visually CW; math heading increase is CCW).

Verification by spot check:
- Math heading=90 (north): rotation = 90-90 = 0. Local -y (front) points at canvas -y = up the screen. ✓
- Math heading=0 (east): rotation = 90-0 = 90° (canvas CW). Local -y rotates 90° CW → canvas +x. Robot points right. ✓
- Math heading=180 (west): rotation = 90-180 = -90° → canvas CCW 90°. Local -y → canvas -x. Robot points left. ✓

- [ ] **Step 4.1: Update `_drawRobot`'s translate and rotate**

In `js/simulator.js`, replace the start of `_drawRobot` (around line 495):

```javascript
  _drawRobot(ctx, s) {
    const r = this.robot;
    ctx.save();
    ctx.translate(r.x * s, r.y * s);
    // +90° offset: robot is drawn with "forward" pointing along local -Y (up),
    // but heading=0 in our system means "right" (+X). Adding 90° aligns them.
    ctx.rotate((r.heading + 90) * Math.PI / 180);
```

with:

```javascript
  _drawRobot(ctx, s) {
    const r = this.robot;
    ctx.save();
    // r.y is math y-up; canvas y = FIELD_H_MM - r.y.
    ctx.translate(r.x * s, (FIELD_H_MM - r.y) * s);
    // Math heading: 0=east, 90=north. Robot is drawn with forward = local -Y.
    // ctx.rotate is visually CW (angle increases visually CW), but math heading
    // is CCW (angle increases CCW), so we negate: rotation = 90 - heading.
    // heading=90 (north) ⇒ rotation=0 ⇒ front points canvas-up (north). ✓
    // heading=0  (east)  ⇒ rotation=90° CW ⇒ front points canvas-right (east). ✓
    ctx.rotate((90 - r.heading) * Math.PI / 180);
```

(The rest of `_drawRobot`'s body — wheels, body, hub, LED matrix, sensors — stays unchanged. Those draw in the local frame after the rotate, so they're convention-agnostic.)

- [ ] **Step 4.2: Run all tests, confirm green**

Run: `node --test 'tests/js/**/*.test.js'`

Expected: 211 pass, 0 fail.

- [ ] **Step 4.3: Commit**

```bash
git add js/simulator.js
git commit -m "refactor(simulator): _drawRobot translates and rotates from math y-up"
```

---

## Task 5: Flip the trail rendering

**Files:**
- Modify: `js/simulator.js`

Trail points are stored in `this.trail` as `{x, y}` math-y values (because they come from `r.x, r.y` which are now math). Three functions render them and need the y-flip on draw:

- `_redrawTrailCanvas` — full re-render on resize / reset.
- `_appendTrailSegment` — incremental segment append per-frame.
- The arc-length math also includes a `dy` calculation that uses canvas-pixel space; the magnitude is unaffected by sign, so `dy` stays as `(p2.y - p1.y) * s` even though those y values are now math-y. (Length, not direction, drives the dash continuity.)

- [ ] **Step 5.1: Update `_redrawTrailCanvas`**

In `js/simulator.js`, replace the `_redrawTrailCanvas` body (around line 456):

```javascript
  _redrawTrailCanvas() {
    const tctx = this._trailCtx;
    const s = this._scale;
    tctx.clearRect(0, 0, this._trailCanvas.width, this._trailCanvas.height);
    this._trailArc = 0;
    if (this.trail.length < 2) return;
    tctx.save();
    this._trailStrokeStyle(tctx, s);
    tctx.beginPath();
    tctx.moveTo(this.trail[0].x * s, this.trail[0].y * s);
    for (let i = 1; i < this.trail.length; i++) {
      tctx.lineTo(this.trail[i].x * s, this.trail[i].y * s);
      const dx = (this.trail[i].x - this.trail[i-1].x) * s;
      const dy = (this.trail[i].y - this.trail[i-1].y) * s;
      this._trailArc += Math.hypot(dx, dy);
    }
    tctx.stroke();
    tctx.restore();
  }
```

with:

```javascript
  _redrawTrailCanvas() {
    const tctx = this._trailCtx;
    const s = this._scale;
    tctx.clearRect(0, 0, this._trailCanvas.width, this._trailCanvas.height);
    this._trailArc = 0;
    if (this.trail.length < 2) return;
    tctx.save();
    this._trailStrokeStyle(tctx, s);
    tctx.beginPath();
    // trail.{x,y} are math; canvas y = FIELD_H_MM - y.
    tctx.moveTo(this.trail[0].x * s, (FIELD_H_MM - this.trail[0].y) * s);
    for (let i = 1; i < this.trail.length; i++) {
      tctx.lineTo(this.trail[i].x * s, (FIELD_H_MM - this.trail[i].y) * s);
      const dx = (this.trail[i].x - this.trail[i-1].x) * s;
      const dy = (this.trail[i].y - this.trail[i-1].y) * s;
      this._trailArc += Math.hypot(dx, dy);
    }
    tctx.stroke();
    tctx.restore();
  }
```

- [ ] **Step 5.2: Update `_appendTrailSegment`**

Replace `_appendTrailSegment`'s body (around line 479):

```javascript
  _appendTrailSegment(prevX, prevY, x, y) {
    const tctx = this._trailCtx;
    const s = this._scale;
    tctx.save();
    this._trailStrokeStyle(tctx, s);
    tctx.lineDashOffset = -this._trailArc;
    tctx.beginPath();
    tctx.moveTo(prevX * s, prevY * s);
    tctx.lineTo(x * s, y * s);
    tctx.stroke();
    tctx.restore();
    const dx = (x - prevX) * s;
    const dy = (y - prevY) * s;
    this._trailArc += Math.hypot(dx, dy);
  }
```

with:

```javascript
  _appendTrailSegment(prevX, prevY, x, y) {
    const tctx = this._trailCtx;
    const s = this._scale;
    tctx.save();
    this._trailStrokeStyle(tctx, s);
    tctx.lineDashOffset = -this._trailArc;
    tctx.beginPath();
    // (prevX, prevY) and (x, y) are math; canvas y = FIELD_H_MM - y.
    tctx.moveTo(prevX * s, (FIELD_H_MM - prevY) * s);
    tctx.lineTo(x * s, (FIELD_H_MM - y) * s);
    tctx.stroke();
    tctx.restore();
    const dx = (x - prevX) * s;
    const dy = (y - prevY) * s;
    this._trailArc += Math.hypot(dx, dy);
  }
```

- [ ] **Step 5.3: Run all tests, confirm green**

Run: `node --test 'tests/js/**/*.test.js'`

Expected: 211 pass, 0 fail.

- [ ] **Step 5.4: Commit**

```bash
git add js/simulator.js
git commit -m "refactor(simulator): trail render converts math y to canvas y"
```

---

## Task 6: Flip `_drawRuler` — origin at bottom-left, X labels at bottom edge

**Files:**
- Modify: `js/simulator.js`

The ruler currently draws X ticks/labels at the top edge, Y ticks/labels at the left edge, origin at top-left. Math convention puts origin at bottom-left and the Y-axis labels reading upward. For full math-convention symmetry the X-axis labels also move to the bottom edge.

Specifically:

- Y-axis ticks: still drawn at the left edge of the canvas (x: 0..9). The mm value of each tick is the math-y value; canvas y for the tick = `(FIELD_H_MM - mm) * s`.
- Y-axis labels: positioned just inside the left edge, at canvas y matching the tick. Label text is `String(mm)` (the math-y value).
- X-axis ticks: move to the bottom edge of the canvas (canvas y from `H-9` to `H`).
- X-axis labels: just above the bottom edge.
- Origin marker `0,0 mm`: bottom-left corner (canvas y near `H`).

- [ ] **Step 6.1: Replace `_drawRuler` body**

In `js/simulator.js`, replace the entire `_drawRuler` method body (around line 354 to ~440 — the whole method between the `_drawRuler(ctx, s) {` line and the closing `}`):

```javascript
  // Ruler: ticks along the top and left inside edges of the field. Labels
  // and origin marker live in the same method (added in the next task).
  _drawRuler(ctx, s) {
    const ruler = window.ruler;
    const xTicks = ruler.tickPositions(FIELD_W_MM, 200, 100);
    const yTicks = ruler.tickPositions(FIELD_H_MM, 200, 100);

    ctx.save();
    ctx.lineWidth = 1;

    // Top edge — minors first (so majors paint over any overlap), then majors
    ctx.strokeStyle = '#555';
    for (const mm of xTicks.minor) {
      const px = mm * s;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, 5);
      ctx.stroke();
    }
    ctx.strokeStyle = '#333';
    for (const mm of xTicks.major) {
      const px = mm * s;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, 9);
      ctx.stroke();
    }

    // Left edge
    ctx.strokeStyle = '#555';
    for (const mm of yTicks.minor) {
      const px = mm * s;
      ctx.beginPath();
      ctx.moveTo(0, px);
      ctx.lineTo(5, px);
      ctx.stroke();
    }
    ctx.strokeStyle = '#333';
    for (const mm of yTicks.major) {
      const px = mm * s;
      ctx.beginPath();
      ctx.moveTo(0, px);
      ctx.lineTo(9, px);
      ctx.stroke();
    }

    // Major-tick labels. Skip 0 (covered by the origin marker below).
    ctx.font = '9px ui-monospace, monospace';
    ctx.textBaseline = 'middle';

    // Top labels (centered on each major tick, ~11 px below the edge)
    ctx.textAlign = 'center';
    for (const mm of xTicks.major) {
      if (mm === 0) continue;
      const px = mm * s;
      const text = String(mm);
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(240,232,208,0.85)';
      ctx.fillRect(px - tw / 2 - 2, 5, tw + 4, 12);
      ctx.fillStyle = '#333';
      ctx.fillText(text, px, 11);
    }

    // Left labels (~11 px right of the edge, vertically centered on each tick)
    ctx.textAlign = 'left';
    for (const mm of yTicks.major) {
      if (mm === 0) continue;
      const px = mm * s;
      const text = String(mm);
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(240,232,208,0.85)';
      ctx.fillRect(9, px - 6, tw + 4, 12);
      ctx.fillStyle = '#333';
      ctx.fillText(text, 11, px);
    }

    // Origin marker — anchors the unit (mm) once so per-tick labels stay numeric
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const originText = '0,0 mm';
    const otw = ctx.measureText(originText).width;
    ctx.fillStyle = 'rgba(240,232,208,0.85)';
    ctx.fillRect(4, 4, otw + 4, 11);
    ctx.fillStyle = '#333';
    ctx.fillText(originText, 6, 5);

    ctx.restore();
  }
```

with:

```javascript
  // Ruler. Math y-up convention:
  //   • Y-axis ticks at the left edge, labels read 0 at bottom up to ~1100 at top.
  //   • X-axis ticks and labels at the BOTTOM edge (so both axes meet at the
  //     bottom-left origin — full math-convention symmetry).
  //   • Origin marker `0,0 mm` in the bottom-left corner.
  // For each math-y tick, canvas y = (FIELD_H_MM - mm) * s.
  _drawRuler(ctx, s) {
    const ruler = window.ruler;
    const xTicks = ruler.tickPositions(FIELD_W_MM, 200, 100);
    const yTicks = ruler.tickPositions(FIELD_H_MM, 200, 100);
    const H = FIELD_H_MM * s;

    ctx.save();
    ctx.lineWidth = 1;

    // Bottom edge X-axis — minors first, then majors paint over any overlap.
    ctx.strokeStyle = '#555';
    for (const mm of xTicks.minor) {
      const px = mm * s;
      ctx.beginPath();
      ctx.moveTo(px, H);
      ctx.lineTo(px, H - 5);
      ctx.stroke();
    }
    ctx.strokeStyle = '#333';
    for (const mm of xTicks.major) {
      const px = mm * s;
      ctx.beginPath();
      ctx.moveTo(px, H);
      ctx.lineTo(px, H - 9);
      ctx.stroke();
    }

    // Left edge Y-axis. Math-y mm ⇒ canvas y = (FIELD_H_MM - mm) * s.
    ctx.strokeStyle = '#555';
    for (const mm of yTicks.minor) {
      const py = (FIELD_H_MM - mm) * s;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(5, py);
      ctx.stroke();
    }
    ctx.strokeStyle = '#333';
    for (const mm of yTicks.major) {
      const py = (FIELD_H_MM - mm) * s;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(9, py);
      ctx.stroke();
    }

    // Major-tick labels. Skip 0 (covered by the origin marker below).
    ctx.font = '9px ui-monospace, monospace';
    ctx.textBaseline = 'middle';

    // Bottom labels (centered on each major tick, ~11 px above the edge)
    ctx.textAlign = 'center';
    for (const mm of xTicks.major) {
      if (mm === 0) continue;
      const px = mm * s;
      const text = String(mm);
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(240,232,208,0.85)';
      ctx.fillRect(px - tw / 2 - 2, H - 17, tw + 4, 12);
      ctx.fillStyle = '#333';
      ctx.fillText(text, px, H - 11);
    }

    // Left labels (~11 px right of the edge, vertically centered on each tick)
    ctx.textAlign = 'left';
    for (const mm of yTicks.major) {
      if (mm === 0) continue;
      const py = (FIELD_H_MM - mm) * s;
      const text = String(mm);
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(240,232,208,0.85)';
      ctx.fillRect(9, py - 6, tw + 4, 12);
      ctx.fillStyle = '#333';
      ctx.fillText(text, 11, py);
    }

    // Origin marker — bottom-left in math convention.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const originText = '0,0 mm';
    const otw = ctx.measureText(originText).width;
    ctx.fillStyle = 'rgba(240,232,208,0.85)';
    ctx.fillRect(4, H - 15, otw + 4, 11);
    ctx.fillStyle = '#333';
    ctx.fillText(originText, 6, H - 5);

    ctx.restore();
  }
```

- [ ] **Step 6.2: Run all tests, confirm green**

Run: `node --test 'tests/js/**/*.test.js'`

Expected: 211 pass, 0 fail.

- [ ] **Step 6.3: Commit**

```bash
git add js/simulator.js
git commit -m "refactor(simulator): ruler in math y-up — origin bottom-left, X at bottom"
```

---

## Task 7: Flip `_handleHover` y for display

**Files:**
- Modify: `js/simulator.js`

`window.ruler.clientToMM` returns canvas-relative mm (its contract is unchanged). `_handleHover` flips y locally so the readout shows math-y.

- [ ] **Step 7.1: Update `_handleHover`**

In `js/simulator.js`, replace the relevant part of `_handleHover` (around line 634):

```javascript
  _handleHover(event) {
    const rect = this.canvas.getBoundingClientRect();
    const { x, y } = window.ruler.clientToMM(event.clientX, event.clientY, rect, this._scale);
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;

    this._hoverEl.textContent = `x=${Math.round(x)} mm  y=${Math.round(y)} mm`;
    this._hoverEl.hidden = false;
```

with:

```javascript
  _handleHover(event) {
    const rect = this.canvas.getBoundingClientRect();
    const canvasMm = window.ruler.clientToMM(event.clientX, event.clientY, rect, this._scale);
    // canvasMm.y is canvas-relative; convert to math y for display.
    const x = canvasMm.x;
    const y = FIELD_H_MM - canvasMm.y;
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;

    this._hoverEl.textContent = `x=${Math.round(x)} mm  y=${Math.round(y)} mm`;
    this._hoverEl.hidden = false;
```

The rest of `_handleHover` (overlay positioning logic) is convention-independent and stays unchanged.

- [ ] **Step 7.2: Run all tests, confirm green**

Run: `node --test 'tests/js/**/*.test.js'`

Expected: 211 pass, 0 fail.

- [ ] **Step 7.3: Commit**

```bash
git add js/simulator.js
git commit -m "refactor(simulator): hover overlay reads math y"
```

---

## Task 8: Update `world_2d_boundary.test.js` cosmetic spawn values + CLAUDE.md

**Files:**
- Modify: `tests/js/physics/world_2d_boundary.test.js`
- Modify: `CLAUDE.md`

`world_2d_boundary.test.js` doesn't test convention — it tests mm-to-meter scaling at the Box2D boundary. The hardcoded `(350, 980)` and `-Math.PI / 2` in two test cases are example values, but updating them keeps the test file in sync with the new spec so future readers don't trip over the old values.

- [ ] **Step 8.1: Update `world_2d_boundary.test.js`**

In `tests/js/physics/world_2d_boundary.test.js`, in the test `'addRobot: spawn position converted mm → m'` (around line 170), replace:

```javascript
  world.addRobot(100, 80, { x: 350, y: 980 }, -Math.PI / 2);
  const created = calls.find(c => c.op === 'CreateBody');
  assert.ok(close(created.x, 0.350), `body x=${created.x} should be 0.35 m`);
  assert.ok(close(created.y, 0.980), `body y=${created.y} should be 0.98 m`);
  assert.ok(close(created.angle, -Math.PI / 2), `angle=${created.angle}`);
```

with:

```javascript
  world.addRobot(100, 80, { x: 350, y: 163 }, Math.PI / 2);
  const created = calls.find(c => c.op === 'CreateBody');
  assert.ok(close(created.x, 0.350), `body x=${created.x} should be 0.35 m`);
  assert.ok(close(created.y, 0.163), `body y=${created.y} should be 0.163 m`);
  assert.ok(close(created.angle, Math.PI / 2), `angle=${created.angle}`);
```

In the test `'setKinematicPose: position converted mm → m'` (around line 216), replace:

```javascript
  world.setKinematicPose(body, 350, 980, Math.PI / 4);
  const t = calls.find(c => c.op === 'SetTransform');
  assert.ok(close(t.x, 0.350), `x=${t.x}`);
  assert.ok(close(t.y, 0.980), `y=${t.y}`);
```

with:

```javascript
  world.setKinematicPose(body, 350, 163, Math.PI / 4);
  const t = calls.find(c => c.op === 'SetTransform');
  assert.ok(close(t.x, 0.350), `x=${t.x}`);
  assert.ok(close(t.y, 0.163), `y=${t.y}`);
```

In the test `'readPose: position converted m → mm on the way out'` (around line 273), replace:

```javascript
  const body = world.addRobot(100, 80, { x: 350, y: 980 }, 1.234);
  const pose = world.readPose(body);
  assert.ok(close(pose.x, 350), `pose.x=${pose.x}`);
  assert.ok(close(pose.y, 980), `pose.y=${pose.y}`);
```

with:

```javascript
  const body = world.addRobot(100, 80, { x: 350, y: 163 }, 1.234);
  const pose = world.readPose(body);
  assert.ok(close(pose.x, 350), `pose.x=${pose.x}`);
  assert.ok(close(pose.y, 163), `pose.y=${pose.y}`);
```

- [ ] **Step 8.2: Update `CLAUDE.md`**

Replace the `## Field` section (currently):

```markdown
## Field

2362 × 1143 mm. Robot spawn `(350, 980)` heading `-90°` (north). Heading: `0° = east`, `90° = south`.
```

with:

```markdown
## Field

2362 × 1143 mm. Origin bottom-left (math y-up). Robot spawn `(350, 163)` heading `90°` (north). Heading: `0° = east`, `90° = north`, `180° = west`, `270° = south`.
```

And replace the constraint bullet (currently):

```markdown
- **Canvas Y increases downward**, so `_animateTank` has a sign flip on the heading update. Don't "fix" it.
```

with:

```markdown
- **Internal coords are math y-up.** Origin bottom-left, y increases upward, headings are math (CCW positive). Canvas rendering converts math → canvas at the boundary in `_drawField`, `_drawRobot`, `_drawTrail` family, `_drawRuler`, `_handleHover` (`canvasY = FIELD_H_MM - mathY` for points/lines/circles; `(FIELD_H_MM - y - h)` for rectangle top-left). `_animateTank` and `_sensorPosition` are convention-agnostic — don't introduce flips there.
```

- [ ] **Step 8.3: Run all tests, confirm green**

Run: `node --test 'tests/js/**/*.test.js'`

Expected: 211 pass, 0 fail.

- [ ] **Step 8.4: Commit**

```bash
git add tests/js/physics/world_2d_boundary.test.js CLAUDE.md
git commit -m "docs: update CLAUDE.md and world_2d test fixtures for math y-up"
```

---

## Task 9: Final full-suite verification

**Files:** none.

A last guard against accumulated drift across the eight commits.

- [ ] **Step 9.1: Run the full test suite**

Run: `node --test 'tests/js/**/*.test.js'`

Expected: `tests 211, pass 211, fail 0`.

- [ ] **Step 9.2: Confirm no leftover canvas-y-down hardcoded values**

Run:

```bash
grep -nE "y[: ]\s*980|heading[: ,]\s*-90" js/ tests/js/ -r
grep -nE "canvas[- ]y[- ]down|Canvas Y increases downward" js/ tests/js/ CLAUDE.md
```

Expected: zero matches in both. Any match indicates a missed update — investigate and fix before declaring done.

- [ ] **Step 9.3: Stage handoff for residual smoke**

The browser smoke (Task-9 manual checks below) requires interaction the agent can't do. Report back to the controller with a residual-smoke checklist:

1. `python3 -m http.server 8787`. Open the page.
2. Hub panel reads `Y: 16.3 cm`, `Heading: 90°`. (Was 98.0 cm, 270°.)
3. Run `motor_pair.move(1, 'rotations')` from spawn. Robot drives toward the far end of the mat. After ~176 mm, Hub-panel `Y` reads ~`33.9 cm`.
4. Run a right-turn program (`motor_pair.move(360, 'degrees', steering=100)`). Heading decreases from 90° toward 0° (CW visually).
5. Color sensor still detects the launch line, HOME zone, and mission rects at the same physical mat positions.
6. Ruler Y-axis labels read `0` at bottom, increasing upward to ~`1100`.
7. Ruler X-axis labels and origin marker at the bottom edge of the canvas; origin marker at bottom-left.
8. Hover overlay y matches the ruler at every cursor position.

Do not commit anything in this step.

---

## Self-review notes

**Spec coverage:**
- Internal `robot.x/y/heading` math y-up + spawn `(350, 163)` heading `90` → Task 2.
- `kinematics.angVel` sign flip → Task 1.
- `_animateTank` / `_sensorPosition` / `_colorAtPosition` unchanged → confirmed by Tasks 1-7 not touching them.
- FIELD_OBJECTS / OBSTACLES y in math, `_drawField` converts → Task 3.
- `_drawRobot` translate + rotate flip → Task 4.
- Trail rendering (3 sites) y-flip → Task 5.
- `_drawRuler` y-axis labels in math, X labels at bottom, origin at bottom-left → Task 6.
- `_handleHover` y-flip → Task 7.
- 7 test files updated → Tasks 1, 2, 8.
- CLAUDE.md → Task 8.

**Placeholder scan:** Every code step contains the actual code an engineer would paste. No "TBD" / "TODO" / "similar to Task N." Test commands are exact and have explicit expected outputs.

**Type / signature consistency:** `_drawRuler(ctx, s)`, `_drawRobot(ctx, s)`, `_drawTrail(ctx)`, `_handleHover(event)` signatures unchanged. `wheelsToBodyVelocity(leftV, rightV, headingRad, speedMmPerS, trackWidthMm) → { vx, vy, angVel }` signature unchanged; only the sign of `angVel` changes.

**Test ordering:** Tasks 1, 2, 8 update tests *before* implementation in the same task (RED → GREEN). Tasks 3-7 are render-side changes that the existing tests don't directly verify; they ride on the Task-2 tests staying green and on the residual smoke for visual correctness.
