# Force Sensor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Spike Prime force sensor on port C end-to-end — fed by Box2D contact impulses (a new front-bumper fixture) maxed with a manual press-button in the Hub panel, surfaced via the existing `force_sensor.force/pressed/raw` API.

**Architecture:** Add a pure-function logic module (`js/force_sensor_logic.js`) for EMA, manual ramp, max combination, and unit conversions. `World2D` grows an `addBumper` method and a `ForceSensorListener` that drains per-port impulse sums each `step()`. `RobotSimulator` runs the EMA pipeline inside `_animateTank` and a lightweight idle tick from `_drawLoop`, surfacing a single `forceN` field on `robot.sensors`. The Hub panel for port C becomes a `<button>` whose fill bar mirrors the live value; the canvas bumper tints the same colour ramp. The Python bridge reads three new keys (`force_dn`, `force_pressed`, `force_raw`) carried in the existing command-reply payload.

**Tech Stack:** Vanilla browser JS (no build step), Box2D-WASM 7.0.0, `node:test` for JS unit tests, Python `unittest` (`tests/py/run.py`) for bridge tests, MicroPython runtime in production.

**Reference spec:** [`docs/superpowers/specs/2026-05-09-force-sensor-design.md`](../specs/2026-05-09-force-sensor-design.md).

---

## File Structure

| File | New / Modified | Responsibility |
|---|---|---|
| `js/force_sensor_logic.js` | new | UMD pure-fn module: `emaStep`, `manualRamp`, `combine`, `forceToReadings`. No DOM/Box2D access. |
| `js/world_2d.js` | modify | New `addBumper(...)` method. New `ForceSensorListener` class. `init` attaches the listener. `step(dt)` returns `{ force_impulses }`. |
| `js/simulator.js` | modify | `PORT_CONFIG.C` flipped to `force_sensor`. `robot.sensors.forceN`, `manualStartMs`, `emaN`. Bumper fixture in `_initPhysics`. Per-step pipeline in `_animateTank`. New `_idleStepForceSensor` from `_drawLoop`. New `manualPress` / `manualRelease` API. Bumper drawn in `_drawRobot`. Widget driven from `_updateSensorPanel`. New `getForceSensorRaw`. `_sensorState` adds three keys. `reset()` clears state. |
| `js/main.js` | modify | Wire `pointerdown` / `pointerup` / `pointerleave` / `pointercancel` on the new `#port-force-C` button to `sim.manualPress` / `sim.manualRelease`. |
| `py/spike_bridge.py` | modify | `_PORT_CONFIG['C'] = 'force_sensor'`. `_state` adds `force_dn / force_pressed / force_raw`. `force_sensor.force/pressed/raw` read those keys. |
| `index.html` | modify | One `<script src="js/force_sensor_logic.js">` tag before `js/simulator.js`. Replace `#port-row-C` with the new button widget. |
| `css/style.css` | modify | `.port-row.force` + `.port-force-button` + `.port-force-fill` rules using existing theme variables. |
| `tests/js/sensors/force_sensor_logic.test.js` | new | Unit tests for the four helpers. |
| `tests/js/sensors/accessors.test.js` | modify | Replace the two stub-value tests; add `getForceSensorRaw` cases. |
| `tests/js/state/sensor_state.test.js` | new | `_sensorState` payload includes the three new keys with correct mapping. |
| `tests/js/physics/world_2d_bumper.test.js` | new | `addBumper` writes a second fixture with body-local offset and `userData`. |
| `tests/js/physics/world_2d_force_listener.test.js` | new | `ForceSensorListener.PostSolve` accumulates impulses; `step()` drains and returns per-port totals. |
| `tests/py/test_force_sensor.py` | new | `force_sensor.force/pressed/raw` reads from `_state`; raises on unconfigured port. |
| `tests/py/run.py` | modify | Register `test_force_sensor` in the runner. |
| `BACKLOG.md` | modify | Strike the "Force sensor" stubs line and the "Functional force-sensor blocks" Blockly line. |

---

## Task 1: Pure-fn helpers — skeleton + script tag

Create the UMD module and load it into the page. No logic yet — that comes via TDD in Task 2.

**Files:**
- Create: `js/force_sensor_logic.js`
- Modify: `index.html`

- [ ] **Step 1: Create the UMD skeleton**

Create `js/force_sensor_logic.js` with:

```javascript
'use strict';

// Pure-function force-sensor pipeline: EMA smoothing of physics impulses,
// time-based manual ramp, max-of combination, and Spike-API unit conversion.
// No DOM, no Box2D, no canvas — every function is referentially transparent
// and unit-testable. Loadable as a browser <script> (window.forceSensorLogic)
// and as a Node CommonJS module.

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.forceSensorLogic = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  function emaStep(/* prevEma, instantN, hadContact, alpha, decay */) {
    throw new Error('not implemented');
  }

  function manualRamp(/* startMs, nowMs, rampMs, maxN */) {
    throw new Error('not implemented');
  }

  function combine(/* emaN, manualN */) {
    throw new Error('not implemented');
  }

  function forceToReadings(/* forceN */) {
    throw new Error('not implemented');
  }

  return { emaStep, manualRamp, combine, forceToReadings };
});
```

- [ ] **Step 2: Add the `<script>` tag to `index.html`**

In `index.html`, locate the line that loads `js/kinematics.js` (search for `kinematics.js`) and add a new `<script>` tag immediately after it, *before* `js/simulator.js`:

```html
<script src="js/kinematics.js"></script>
<script src="js/force_sensor_logic.js"></script>
<script src="js/simulator.js"></script>
```

If `js/kinematics.js` is not loaded via a `<script>` tag, look at the order of `<script src="js/*.js">` tags near the bottom of `index.html` and place `force_sensor_logic.js` immediately before `simulator.js`.

- [ ] **Step 3: Smoke-load the page**

Run: `python3 -m http.server 8787` (kill with Ctrl-C after the check). Open `http://localhost:8787` in a browser. Open DevTools console and confirm no 404 for `force_sensor_logic.js`. Type `forceSensorLogic` in the console; it should print `{ emaStep, manualRamp, combine, forceToReadings }`.

- [ ] **Step 4: Commit**

```bash
git add js/force_sensor_logic.js index.html
git commit -m "feat(force-sensor): add pure-fn helper module skeleton"
```

---

## Task 2: TDD the four helpers

All four helpers are pure functions. Test-first, one helper per round; commit after each helper passes so each commit is a self-contained green step.

**Files:**
- Create: `tests/js/sensors/force_sensor_logic.test.js`
- Modify: `js/force_sensor_logic.js`

- [ ] **Step 1: Write the failing tests for `emaStep`**

Create `tests/js/sensors/force_sensor_logic.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { emaStep, manualRamp, combine, forceToReadings } =
  require('../../../js/force_sensor_logic');

const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// ── emaStep ────────────────────────────────────────────────────────────────

test('emaStep: first contact pulls EMA toward instantN by alpha', () => {
  // prevEma=0, instantN=5, alpha=0.4 → 0.4*5 + 0.6*0 = 2
  assert.ok(close(emaStep(0, 5, true, 0.4, 0.5), 2));
});

test('emaStep: steady contact blends prev EMA with instantN', () => {
  // prevEma=2, instantN=5, alpha=0.4 → 0.4*5 + 0.6*2 = 3.2
  assert.ok(close(emaStep(2, 5, true, 0.4, 0.5), 3.2));
});

test('emaStep: no-contact step bleeds prev EMA by decay factor', () => {
  // prevEma=4, hadContact=false, decay=0.5 → 4 * 0.5 = 2 (instantN ignored)
  assert.ok(close(emaStep(4, 999, false, 0.4, 0.5), 2));
});

test('emaStep: five no-contact ticks decay below 0.15 N from a 4 N start', () => {
  let ema = 4;
  for (let i = 0; i < 5; i++) ema = emaStep(ema, 0, false, 0.4, 0.5);
  assert.ok(ema < 0.15, `ema after 5 idle ticks = ${ema}`);
});

test('emaStep: zero prev + zero instant stays zero', () => {
  assert.strictEqual(emaStep(0, 0, true, 0.4, 0.5), 0);
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
node --test tests/js/sensors/force_sensor_logic.test.js
```

Expected: all five `emaStep` tests fail with `Error: not implemented`.

- [ ] **Step 3: Implement `emaStep`**

In `js/force_sensor_logic.js`, replace the `emaStep` stub with:

```javascript
function emaStep(prevEma, instantN, hadContact, alpha, decay) {
  if (!hadContact) return prevEma * decay;
  return alpha * instantN + (1 - alpha) * prevEma;
}
```

- [ ] **Step 4: Re-run, verify pass**

```bash
node --test tests/js/sensors/force_sensor_logic.test.js
```

Expected: 5 passing, the other three helpers' tests don't exist yet so the suite reports 5 pass / 0 fail / 0 skip.

- [ ] **Step 5: Append failing tests for `manualRamp`**

Append to `tests/js/sensors/force_sensor_logic.test.js`:

```javascript
// ── manualRamp ─────────────────────────────────────────────────────────────

test('manualRamp: null start returns 0', () => {
  assert.strictEqual(manualRamp(null, 1234, 1000, 10), 0);
});

test('manualRamp: zero elapsed returns 0', () => {
  assert.strictEqual(manualRamp(1000, 1000, 1000, 10), 0);
});

test('manualRamp: half-ramp returns half the max', () => {
  assert.strictEqual(manualRamp(1000, 1500, 1000, 10), 5);
});

test('manualRamp: past full ramp clamps to max', () => {
  assert.strictEqual(manualRamp(1000, 5000, 1000, 10), 10);
});

test('manualRamp: monotonic over a 1 s ramp', () => {
  let prev = -Infinity;
  for (let t = 0; t <= 1000; t += 100) {
    const v = manualRamp(0, t, 1000, 10);
    assert.ok(v >= prev, `non-monotonic at t=${t}: ${v} < ${prev}`);
    prev = v;
  }
});
```

- [ ] **Step 6: Run, verify the new tests fail**

```bash
node --test tests/js/sensors/force_sensor_logic.test.js
```

Expected: `manualRamp` tests fail with `Error: not implemented`; `emaStep` tests still pass.

- [ ] **Step 7: Implement `manualRamp`**

In `js/force_sensor_logic.js`:

```javascript
function manualRamp(startMs, nowMs, rampMs, maxN) {
  if (startMs == null) return 0;
  const t = nowMs - startMs;
  if (t <= 0) return 0;
  if (t >= rampMs) return maxN;
  return (t / rampMs) * maxN;
}
```

- [ ] **Step 8: Re-run, verify all pass so far**

```bash
node --test tests/js/sensors/force_sensor_logic.test.js
```

Expected: 10 passing (5 + 5).

- [ ] **Step 9: Append failing tests for `combine`**

Append to `tests/js/sensors/force_sensor_logic.test.js`:

```javascript
// ── combine ────────────────────────────────────────────────────────────────

test('combine: returns the larger of the two', () => {
  assert.strictEqual(combine(2, 5), 5);
  assert.strictEqual(combine(7, 3), 7);
});

test('combine: zeros yield zero', () => {
  assert.strictEqual(combine(0, 0), 0);
});

test('combine: negative inputs unsupported but return the max all the same', () => {
  // Defensive: physics impulse → Newton conversion is always >= 0, and the
  // ramp is bounded [0, maxN]. If a negative ever sneaks in, max-of still
  // surfaces the larger value rather than producing junk.
  assert.strictEqual(combine(-1, 0.5), 0.5);
});
```

- [ ] **Step 10: Run, verify the new tests fail**

```bash
node --test tests/js/sensors/force_sensor_logic.test.js
```

Expected: `combine` tests fail with `Error: not implemented`.

- [ ] **Step 11: Implement `combine`**

```javascript
function combine(emaN, manualN) {
  return Math.max(emaN, manualN);
}
```

- [ ] **Step 12: Re-run, verify all 13 pass**

```bash
node --test tests/js/sensors/force_sensor_logic.test.js
```

- [ ] **Step 13: Append failing tests for `forceToReadings`**

Append to `tests/js/sensors/force_sensor_logic.test.js`:

```javascript
// ── forceToReadings ────────────────────────────────────────────────────────

test('forceToReadings: zero force → all zero / false', () => {
  const r = forceToReadings(0);
  assert.strictEqual(r.dn, 0);
  assert.strictEqual(r.pressed, false);
  assert.strictEqual(r.hard, false);
  assert.strictEqual(r.raw, 0);
});

test('forceToReadings: 0.5 N → pressed threshold met, not hard', () => {
  const r = forceToReadings(0.5);
  assert.strictEqual(r.dn, 5);
  assert.strictEqual(r.pressed, true);
  assert.strictEqual(r.hard, false);
  assert.ok(r.raw >= 200 && r.raw <= 210, `raw=${r.raw} should round to ~205`);
});

test('forceToReadings: 7 N → hard-pressed threshold met', () => {
  const r = forceToReadings(7);
  assert.strictEqual(r.dn, 70);
  assert.strictEqual(r.pressed, true);
  assert.strictEqual(r.hard, true);
});

test('forceToReadings: just-under-pressed threshold (0.49 N) reports not pressed', () => {
  const r = forceToReadings(0.49);
  assert.strictEqual(r.pressed, false);
});

test('forceToReadings: 10 N saturates dn at 100 and raw at 4095', () => {
  const r = forceToReadings(10);
  assert.strictEqual(r.dn, 100);
  assert.strictEqual(r.raw, 4095);
});

test('forceToReadings: 12 N over-range still clamped to 100 / 4095', () => {
  const r = forceToReadings(12);
  assert.strictEqual(r.dn, 100);
  assert.strictEqual(r.raw, 4095);
  assert.strictEqual(r.pressed, true);
  assert.strictEqual(r.hard, true);
});
```

- [ ] **Step 14: Run, verify the new tests fail**

```bash
node --test tests/js/sensors/force_sensor_logic.test.js
```

- [ ] **Step 15: Implement `forceToReadings`**

```javascript
function forceToReadings(forceN) {
  const clamped = Math.max(0, Math.min(10, forceN));
  return {
    dn:      Math.round(clamped * 10),
    pressed: forceN >= 0.5,
    hard:    forceN >= 7,
    raw:     Math.min(4095, Math.round(clamped * 409.5)),
  };
}
```

- [ ] **Step 16: Re-run, verify all 19 pass**

```bash
node --test tests/js/sensors/force_sensor_logic.test.js
```

Expected: 19 passing, 0 failing.

- [ ] **Step 17: Commit**

```bash
git add js/force_sensor_logic.js tests/js/sensors/force_sensor_logic.test.js
git commit -m "feat(force-sensor): pure-fn helpers (emaStep / manualRamp / combine / forceToReadings)"
```

---

## Task 3: JS-side accessors + `forceN` field + JS `PORT_CONFIG.C` flip

Replace the stub force-sensor accessors with reads off `robot.sensors.forceN`, and flip port C's config so the existing Blockly `_assertSensorAvailable('force_sensor')` guard stops throwing.

**Files:**
- Modify: `js/simulator.js`
- Modify: `tests/js/sensors/accessors.test.js`

- [ ] **Step 1: Update the stub-value tests in `tests/js/sensors/accessors.test.js`**

The existing file (`tests/js/sensors/accessors.test.js`) has these two tests near line 55:

```javascript
test('getForceSensorValue: returns 0', () => {
  assert.strictEqual(createSim().getForceSensorValue(), 0);
});

test('getForceSensorPressed: returns false', () => {
  assert.strictEqual(createSim().getForceSensorPressed(), false);
});
```

Replace both with:

```javascript
test('getForceSensorValue: returns 0 when forceN is 0', () => {
  assert.strictEqual(createSim().getForceSensorValue(), 0);
});

test('getForceSensorValue: 5 N → 50 dN', () => {
  const sim = createSim();
  sim.robot.sensors.forceN = 5;
  assert.strictEqual(sim.getForceSensorValue(), 50);
});

test('getForceSensorValue: 12 N over-range clamps to 100 dN', () => {
  const sim = createSim();
  sim.robot.sensors.forceN = 12;
  assert.strictEqual(sim.getForceSensorValue(), 100);
});

test('getForceSensorPressed: false below 0.5 N', () => {
  const sim = createSim();
  sim.robot.sensors.forceN = 0.49;
  assert.strictEqual(sim.getForceSensorPressed(), false);
});

test('getForceSensorPressed: true at and above 0.5 N', () => {
  const sim = createSim();
  sim.robot.sensors.forceN = 0.5;
  assert.strictEqual(sim.getForceSensorPressed(), true);
});

test('getForceSensorRaw: 0 N → 0', () => {
  assert.strictEqual(createSim().getForceSensorRaw(), 0);
});

test('getForceSensorRaw: 10 N → 4095 (clamp)', () => {
  const sim = createSim();
  sim.robot.sensors.forceN = 10;
  assert.strictEqual(sim.getForceSensorRaw(), 4095);
});

test('getForceSensorRaw: 0.5 N → ~205', () => {
  const sim = createSim();
  sim.robot.sensors.forceN = 0.5;
  const raw = sim.getForceSensorRaw();
  assert.ok(raw >= 200 && raw <= 210, `raw=${raw}`);
});
```

- [ ] **Step 2: Make `tests/js/sim-helper.js` load the new logic module + provide `performance`**

The accessor implementation will reference `forceSensorLogic`, which must be in the vm context. Task 10 also adds an `_idleStepForceSensor` call from the constructor's `_drawLoop` invocation that uses `performance.now()`, so `performance` must be in the context too — add it now so a later task doesn't break this file.

Edit `tests/js/sim-helper.js`. Find:

```javascript
const KINEMATICS_CODE = fs.readFileSync(
  path.resolve(__dirname, '../../js/kinematics.js'), 'utf8',
);
const SIM_CODE = fs.readFileSync(
  path.resolve(__dirname, '../../js/simulator.js'), 'utf8',
);
```

Replace with:

```javascript
const KINEMATICS_CODE = fs.readFileSync(
  path.resolve(__dirname, '../../js/kinematics.js'), 'utf8',
);
const FORCE_SENSOR_LOGIC_CODE = fs.readFileSync(
  path.resolve(__dirname, '../../js/force_sensor_logic.js'), 'utf8',
);
const SIM_CODE = fs.readFileSync(
  path.resolve(__dirname, '../../js/simulator.js'), 'utf8',
);
```

Find the `vm.createContext({...})` call. Replace:

```javascript
const context = vm.createContext({
  window, document,
  requestAnimationFrame: () => 0,
  cancelAnimationFrame:  () => {},
  CanvasRenderingContext2D: { prototype: {} },
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  TextEncoder, TextDecoder,
});
```

With:

```javascript
const context = vm.createContext({
  window, document,
  requestAnimationFrame: () => 0,
  cancelAnimationFrame:  () => {},
  CanvasRenderingContext2D: { prototype: {} },
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  TextEncoder, TextDecoder,
  performance: { now: () => Date.now() },
});
```

After `vm.runInContext(KINEMATICS_CODE, context); context.window.kinematics = context.kinematics;`, add:

```javascript
vm.runInContext(KINEMATICS_CODE, context);
context.window.kinematics = context.kinematics;
vm.runInContext(FORCE_SENSOR_LOGIC_CODE, context);
context.window.forceSensorLogic = context.forceSensorLogic;
vm.runInContext(SIM_CODE, context);
```

- [ ] **Step 3: Run the tests, verify the new ones fail**

```bash
node --test tests/js/sensors/accessors.test.js
```

Expected: the three new `getForceSensorRaw` tests fail (`is not a function`); `getForceSensorValue: 5 N → 50 dN` fails (returns 0); `getForceSensorPressed: true at and above 0.5 N` fails. The other two new tests happen to pass against the current stub but that's coincidental.

- [ ] **Step 4: Add `forceN` to robot state**

In `js/simulator.js`, find `makeRobotState` (the math y-up rewrite landed in commit `86d59fb`; current values are spawn `(350, 163)` heading `90`). Update only the `sensors` block to include `forceN` — leave the spawn pose untouched:

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
      forceN:     0,
    },
    display: Array(25).fill(0),
  };
}
```

If the `x / y / heading` lines on disk diverge from the values shown above (e.g. someone tweaked the spawn), keep the on-disk values — we're only adding `forceN: 0` to the `sensors` block.

- [ ] **Step 5: Flip `PORT_CONFIG.C` to `force_sensor`**

In `js/simulator.js`, find `PORT_CONFIG` (around line 36-43). Change line `C: { kind: 'empty' },` to:

```javascript
const PORT_CONFIG = {
  A: { kind: 'motor',           role: 'drive-left'  },
  B: { kind: 'motor',           role: 'drive-right' },
  C: { kind: 'force_sensor',    mount: 'front'      },
  D: { kind: 'empty' },
  E: { kind: 'color_sensor' },
  F: { kind: 'distance_sensor' },
};
```

- [ ] **Step 6: Rewrite the three accessors**

In `js/simulator.js`, find the existing stubs (lines 899-900):

```javascript
getForceSensorValue()       { return 0; }
getForceSensorPressed()     { return false; }
```

Replace with three accessors that use the helper module:

```javascript
getForceSensorValue() {
  return window.forceSensorLogic.forceToReadings(this.robot.sensors.forceN).dn;
}
getForceSensorPressed() {
  return window.forceSensorLogic.forceToReadings(this.robot.sensors.forceN).pressed;
}
getForceSensorRaw() {
  return window.forceSensorLogic.forceToReadings(this.robot.sensors.forceN).raw;
}
```

- [ ] **Step 7: Run the accessor tests, verify all pass**

```bash
node --test tests/js/sensors/accessors.test.js
```

Expected: all force-sensor tests pass; existing color / distance / motor tests still pass.

- [ ] **Step 8: Sanity-check there are no other tests broken by the port-C config flip**

Run the full JS test suite (every `*.test.js`):

```bash
node --test 'tests/js/**/*.test.js'
```

Expected: all green. If any test referenced port C as `empty`, update the test (this should not happen, but the run will catch it).

- [ ] **Step 9: Commit**

```bash
git add js/simulator.js tests/js/sensors/accessors.test.js tests/js/sim-helper.js
git commit -m "feat(force-sensor): wire JS accessors + flip port C to force_sensor"
```

---

## Task 4: `_sensorState` payload carries the three new keys

The Python bridge reads sensor state from the `_state` dict on every command reply (`py/spike_bridge.py:_await_and_update`). Extend the JS-side payload so those keys exist.

**Files:**
- Modify: `js/simulator.js`
- Create: `tests/js/state/sensor_state.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/js/state/sensor_state.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

test('_sensorState: includes force_dn / force_pressed / force_raw', () => {
  const sim = createSim();
  const s = sim._sensorState();
  assert.ok('force_dn'      in s, 'force_dn key present');
  assert.ok('force_pressed' in s, 'force_pressed key present');
  assert.ok('force_raw'     in s, 'force_raw key present');
});

test('_sensorState: zero forceN → 0 / false / 0', () => {
  const s = createSim()._sensorState();
  assert.strictEqual(s.force_dn,      0);
  assert.strictEqual(s.force_pressed, false);
  assert.strictEqual(s.force_raw,     0);
});

test('_sensorState: 5 N → 50 / true / ~2047', () => {
  const sim = createSim();
  sim.robot.sensors.forceN = 5;
  const s = sim._sensorState();
  assert.strictEqual(s.force_dn,      50);
  assert.strictEqual(s.force_pressed, true);
  assert.ok(s.force_raw >= 2040 && s.force_raw <= 2055, `raw=${s.force_raw}`);
});
```

- [ ] **Step 2: Run, verify it fails**

```bash
node --test tests/js/state/sensor_state.test.js
```

Expected: all three fail (keys missing from `_sensorState`).

- [ ] **Step 3: Update `_sensorState` to emit the new keys**

In `js/simulator.js`, find `_sensorState` (around line 789-800):

```javascript
_sensorState() {
  const r = this.robot;
  return {
    x:           r.x,
    y:           r.y,
    heading:     r.heading,
    color:       r.sensors.colorValue,
    distance_mm: r.sensors.distanceMM,
    motors:      { ...r.motors },
    stopped:     false,
  };
}
```

Replace with:

```javascript
_sensorState() {
  const r = this.robot;
  const f = window.forceSensorLogic.forceToReadings(r.sensors.forceN);
  return {
    x:             r.x,
    y:             r.y,
    heading:       r.heading,
    color:         r.sensors.colorValue,
    distance_mm:   r.sensors.distanceMM,
    motors:        { ...r.motors },
    force_dn:      f.dn,
    force_pressed: f.pressed,
    force_raw:     f.raw,
    stopped:       false,
  };
}
```

- [ ] **Step 4: Re-run, verify pass**

```bash
node --test tests/js/state/sensor_state.test.js
```

Expected: 3 passing.

- [ ] **Step 5: Re-run the whole JS suite**

```bash
node --test 'tests/js/**/*.test.js'
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add js/simulator.js tests/js/state/sensor_state.test.js
git commit -m "feat(force-sensor): emit force_dn/pressed/raw in _sensorState payload"
```

---

## Task 5: Python bridge — `_state` keys, `_PORT_CONFIG.C`, `force_sensor.*` reads

Wire the Python side so `force_sensor.force/pressed/raw` read from `_state`, and so port C is treated as a configured force sensor.

**Files:**
- Modify: `py/spike_bridge.py`
- Create: `tests/py/test_force_sensor.py`
- Modify: `tests/py/run.py`

- [ ] **Step 1: Create the failing Python test file**

Create `tests/py/test_force_sensor.py`:

```python
"""Tests for force_sensor: port C is configured force_sensor in the canonical
wiring; force()/pressed()/raw() read live values from _state; calls on D
(empty) raise."""
import unittest
import mock_js
import spike_bridge as sb


class TestForceSensorReads(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()
        # Reset force keys so tests don't leak into each other.
        for k in ('force_dn', 'force_pressed', 'force_raw'):
            sb._state.pop(k, None)

    def test_port_c_is_configured_force_sensor(self):
        self.assertEqual(sb._PORT_CONFIG['C'], 'force_sensor')

    def test_force_default_is_zero(self):
        self.assertEqual(sb.force_sensor.force('C'), 0)

    def test_force_returns_int_from_state(self):
        sb._state['force_dn'] = 42
        self.assertEqual(sb.force_sensor.force('C'), 42)
        self.assertIsInstance(sb.force_sensor.force('C'), int)

    def test_pressed_default_is_false(self):
        self.assertFalse(sb.force_sensor.pressed('C'))

    def test_pressed_reads_state(self):
        sb._state['force_pressed'] = True
        self.assertTrue(sb.force_sensor.pressed('C'))

    def test_raw_default_is_zero(self):
        self.assertEqual(sb.force_sensor.raw('C'), 0)

    def test_raw_returns_int_from_state(self):
        sb._state['force_raw'] = 2048
        self.assertEqual(sb.force_sensor.raw('C'), 2048)
        self.assertIsInstance(sb.force_sensor.raw('C'), int)

    def test_force_on_unconfigured_port_d_raises(self):
        with self.assertRaises(RuntimeError) as cm:
            sb.force_sensor.force('D')
        self.assertIn('force sensor', str(cm.exception))

    def test_pressed_on_motor_port_a_raises(self):
        with self.assertRaises(RuntimeError):
            sb.force_sensor.pressed('A')

    def test_raw_on_color_sensor_port_e_raises(self):
        with self.assertRaises(RuntimeError):
            sb.force_sensor.raw('E')

    def test_int_port_constant_translates(self):
        # port.C = 2; bridge translates to letter 'C'.
        sb._state['force_dn'] = 10
        self.assertEqual(sb.force_sensor.force(sb.port.C), 10)


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Register the test module in `tests/py/run.py`**

In `tests/py/run.py`, add `test_force_sensor` to the imports and to the suite list:

```python
import test_motor_pair
import test_motor
import test_hub
import test_wait
import test_print
import test_validation
import test_gaps
import test_motor_sensor_gaps
import test_force_sensor

loader = unittest.TestLoader()
suite  = unittest.TestSuite()
for mod in [test_motor_pair, test_motor, test_hub, test_wait, test_print,
            test_validation, test_gaps, test_motor_sensor_gaps,
            test_force_sensor]:
    suite.addTests(loader.loadTestsFromModule(mod))
```

- [ ] **Step 3: Run the Python suite, verify the force-sensor tests fail**

```bash
python3 tests/py/run.py
```

Expected: `test_port_c_is_configured_force_sensor` fails (still 'empty'). `test_force_returns_int_from_state` fails (always 0). `test_pressed_reads_state` fails. Etc.

- [ ] **Step 4: Update `_state` initialization in `py/spike_bridge.py`**

Find the `_state = { ... }` block (around line 34-39). Add three new keys *before* the `'stopped': False,` line — leave the spawn-pose / motors / colour keys untouched, since the JS side overwrites them on every command reply via `_await_and_update`. Targeted edit (operates on whatever the file currently has):

Replace this exact line:

```python
    'stopped': False,
```

With:

```python
    'force_dn': 0, 'force_pressed': False, 'force_raw': 0,
    'stopped': False,
```

The block, post-edit, looks like:

```python
_state = {
    'x': 350, 'y': 163, 'heading': 90,            # math y-up; values may differ
    'color': 'none', 'distance_mm': 300,
    'motors': {'A': 0, 'B': 0, 'C': 0, 'D': 0, 'E': 0, 'F': 0},
    'force_dn': 0, 'force_pressed': False, 'force_raw': 0,
    'stopped': False,
}
```

(The pose and heading values may differ from what's shown — the math-y-up migration only updated `js/simulator.js`'s spawn and didn't touch `py/spike_bridge.py`'s init defaults, which become moot after the first command reply. Don't "fix" them as part of this task.)

- [ ] **Step 5: Flip `_PORT_CONFIG['C']` to `'force_sensor'`**

Find `_PORT_CONFIG` (around line 73-80):

```python
_PORT_CONFIG = {
    'A': 'motor',
    'B': 'motor',
    'C': 'empty',
    'D': 'empty',
    'E': 'color_sensor',
    'F': 'distance_sensor',
}
```

Change `'C': 'empty',` to `'C': 'force_sensor',`.

- [ ] **Step 6: Wire `force_sensor.force/pressed/raw` to read `_state`**

Find the `class force_sensor:` block (around line 328-345):

```python
class force_sensor:
    """Force sensor API. The default robot config has no force sensor, so every
    method here raises RuntimeError. Customization can later add one to a port."""

    @staticmethod
    def force(port):
        _require(port, 'force_sensor', 'force_sensor.force')
        return 0

    @staticmethod
    def pressed(port):
        _require(port, 'force_sensor', 'force_sensor.pressed')
        return False

    @staticmethod
    def raw(port):
        _require(port, 'force_sensor', 'force_sensor.raw')
        return 0
```

Replace with:

```python
class force_sensor:
    """Force sensor API. Port C is wired to 'force_sensor' in the canonical
    config; calls on other ports raise via _require()."""

    @staticmethod
    def force(port):
        _require(port, 'force_sensor', 'force_sensor.force')
        return int(_state.get('force_dn', 0))

    @staticmethod
    def pressed(port):
        _require(port, 'force_sensor', 'force_sensor.pressed')
        return bool(_state.get('force_pressed', False))

    @staticmethod
    def raw(port):
        _require(port, 'force_sensor', 'force_sensor.raw')
        return int(_state.get('force_raw', 0))
```

- [ ] **Step 7: Re-run the Python suite, verify all pass**

```bash
python3 tests/py/run.py
```

Expected: all force-sensor tests pass; pre-existing tests still green.

- [ ] **Step 8: Commit**

```bash
git add py/spike_bridge.py tests/py/test_force_sensor.py tests/py/run.py
git commit -m "feat(force-sensor): wire Python bridge — port C, _state keys, live reads"
```

---

## Task 6: `World2D.addBumper` method

Add a method that welds a second polygon fixture (the bumper) to an existing body, in body-local frame, with `userData` for the listener to identify.

**Files:**
- Modify: `js/world_2d.js`
- Create: `tests/js/physics/world_2d_bumper.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/js/physics/world_2d_bumper.test.js`:

```javascript
'use strict';

// Boundary-conversion + body-local-offset tests for World2D.addBumper.
// Pumps the same stub Box2D module through World2D as the existing
// world_2d_boundary tests; asserts the second fixture is welded to the robot
// body at the right body-local offset and tagged with userData.

const test   = require('node:test');
const assert = require('node:assert');

const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// Inline-copy of the stub from world_2d_boundary.test.js, extended with
// SetAsBox(centre, angle) capture (already present in the boundary stub) and
// userData tracking on fixtures.
function makeStubBox2d() {
  const calls = [];
  const log = (entry) => calls.push(entry);

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
    set_shape(s)         { this.shape = s; }
    set_density(d)       { this.density = d; }
    set_friction(f)      { this.friction = f; }
    set_restitution(r)   { this.restitution = r; }
    set_userData(u)      { this.userData = u; }
  }
  let nextBodyId = 0;
  function makeBody(def) {
    const id = nextBodyId++;
    return {
      id, def, fixtures: [],
      pos: makeVec2(def.props.position?.x || 0, def.props.position?.y || 0),
      angle: def.props.angle || 0,
      SetTransform()        {},
      SetLinearVelocity()   {},
      SetAngularVelocity()  {},
      SetAwake()            {},
      GetPosition() { return this.pos; },
      GetAngle()    { return this.angle; },
      CreateFixture(fd) {
        this.fixtures.push(fd);
        log({ op: 'CreateFixture', body: id,
              shape: fd.shape && { hx: fd.shape.hx, hy: fd.shape.hy,
                                   cx: fd.shape.cx, cy: fd.shape.cy },
              userData: fd.userData });
      },
    };
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
  return {
    stub: {
      b2Vec2, b2BodyDef, b2PolygonShape, b2FixtureDef, b2World,
      b2_kinematicBody: 'kinematic', b2_dynamicBody: 'dynamic',
      destroy: () => {},
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

test('addBumper: userData round-trips on the fixture', async () => {
  const { world, calls } = await makeWorld();
  const body = world.addRobot(100, 80, { x: 0, y: 0 });
  const ud = { kind: 'force_sensor', port: 'C' };
  world.addBumper(body, 5, 15, 105, 0, ud);
  const fix = calls.filter(c => c.op === 'CreateFixture').pop();
  assert.deepStrictEqual(fix.userData, ud);
});
```

- [ ] **Step 2: Run, verify it fails**

```bash
node --test tests/js/physics/world_2d_bumper.test.js
```

Expected: all four fail (`addBumper is not a function`).

- [ ] **Step 3: Implement `addBumper` in `js/world_2d.js`**

Open `js/world_2d.js`. After the `addObstacleBox` method (around the closing brace at line 129), add:

```javascript
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
```

- [ ] **Step 4: Re-run, verify pass**

```bash
node --test tests/js/physics/world_2d_bumper.test.js
```

Expected: 4 passing.

- [ ] **Step 5: Re-run the existing world_2d_boundary suite to check no regression**

```bash
node --test tests/js/physics/world_2d_boundary.test.js
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add js/world_2d.js tests/js/physics/world_2d_bumper.test.js
git commit -m "feat(force-sensor): World2D.addBumper — welded fixture w/ userData"
```

---

## Task 7: `ForceSensorListener` + `World2D.step` returns `force_impulses`

A `b2ContactListener.PostSolve` handler accumulates per-port normal impulses each Box2D step. `World2D.step(dt)` drains the accumulator and returns `{ force_impulses: { 'C': totalJ, ... } }`.

**Files:**
- Modify: `js/world_2d.js`
- Create: `tests/js/physics/world_2d_force_listener.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/js/physics/world_2d_force_listener.test.js`:

```javascript
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
```

- [ ] **Step 2: Run, verify it fails**

```bash
node --test tests/js/physics/world_2d_force_listener.test.js
```

Expected: tests fail because the listener is never wired and `step()` returns `undefined`.

- [ ] **Step 3: Implement the listener and wire it into `init` and `step`**

Open `js/world_2d.js`. At the top of the file (after the `MAX_PHYS_STEP_S` constant), add a placeholder for the listener instance on `World2D`. In the file:

a) **Inside the `init` method**, *after* `this.world = new box2d.b2World(gravity);` and the `box2d.destroy(gravity);` line, add:

```javascript
this._forceImpulses = {};
this._listener = Object.assign(new box2d.JSContactListener(), {
  PostSolve: (contact, impulse) => {
    const fa = contact.GetFixtureA();
    const fb = contact.GetFixtureB();
    const udA = fa && fa.GetUserData ? fa.GetUserData() : null;
    const udB = fb && fb.GetUserData ? fb.GetUserData() : null;
    const ud = (udA && udA.kind === 'force_sensor') ? udA
             : (udB && udB.kind === 'force_sensor') ? udB
             : null;
    if (!ud) return;
    // box2d-wasm exposes normalImpulses as either a method (.get_normalImpulses())
    // returning an array-like, or a property. Read whichever is available.
    const arr = (typeof impulse.get_normalImpulses === 'function')
      ? impulse.get_normalImpulses()
      : impulse.normalImpulses;
    const count = (typeof impulse.get_count === 'function')
      ? impulse.get_count()
      : (arr && arr.length) || 0;
    let sum = 0;
    for (let i = 0; i < count; i++) {
      sum += (typeof arr[i] === 'number') ? arr[i] : (arr.get && arr.get(i)) || 0;
    }
    this._forceImpulses[ud.port] = (this._forceImpulses[ud.port] || 0) + sum;
  },
  // Required no-op overrides — some box2d-wasm builds will assert on missing methods.
  BeginContact: () => {},
  EndContact:   () => {},
  PreSolve:     () => {},
});
this.world.SetContactListener(this._listener);
```

b) **Replace the `step` method** (currently at the bottom of the class):

```javascript
step(dt_s) {
  const subSteps = computeSubSteps(dt_s, MAX_PHYS_STEP_S);
  const sub = dt_s / subSteps;
  for (let i = 0; i < subSteps; i++) {
    this.world.Step(sub, 8, 3);
  }
  const force_impulses = this._forceImpulses || {};
  this._forceImpulses = {};
  return { force_impulses };
}
```

- [ ] **Step 4: Re-run the listener test, verify pass**

```bash
node --test tests/js/physics/world_2d_force_listener.test.js
```

Expected: 5 passing.

- [ ] **Step 5: Re-run the boundary + bumper tests to confirm no regression**

```bash
node --test tests/js/physics/world_2d_boundary.test.js tests/js/physics/world_2d_bumper.test.js
```

Expected: green. The boundary tests don't read `step()`'s return value, so the new return shape doesn't break them.

- [ ] **Step 6: Commit**

```bash
git add js/world_2d.js tests/js/physics/world_2d_force_listener.test.js
git commit -m "feat(force-sensor): ForceSensorListener PostSolve + World2D.step returns force_impulses"
```

---

## Task 8: Wire the bumper fixture into `_initPhysics`

Now that `addBumper` exists, build the actual port-C bumper when the simulator initializes.

**Files:**
- Modify: `js/simulator.js`

- [ ] **Step 1: Add the bumper geometry constants near the other body constants**

In `js/simulator.js`, find the constants block at the top (around line 22-31). After `ROBOT_BODY_H`, add:

```javascript
const ROBOT_BODY_W  = 160;
const ROBOT_BODY_H  = 200;
const BUMPER_DEPTH_MM = 10;   // front-to-back
const BUMPER_WIDTH_MM = 30;   // lateral
const MM_PER_MS_100 = 0.9;
```

- [ ] **Step 2: Add the bumper to `_initPhysics`**

Find `_initPhysics` (around line 163-192). After the `this.robotBody = this.physics.addRobot(...)` block, *before* the `this._obstacles = OBSTACLES.map(...)` block, add:

```javascript
// Front bumper for the force sensor on port C. Welded to the robot body in
// body-local frame: forward edge of the chassis is at +ROBOT_BODY_H/2 along
// body-local +X; bumper centre sits BUMPER_DEPTH_MM/2 ahead of that, so the
// bumper occupies [chassis-front, chassis-front + BUMPER_DEPTH_MM]. Keyed
// per-port so the listener can disambiguate when more sensors land later.
this.physics.addBumper(
  this.robotBody,
  BUMPER_DEPTH_MM / 2,
  BUMPER_WIDTH_MM / 2,
  ROBOT_BODY_H / 2 + BUMPER_DEPTH_MM / 2,
  0,
  { kind: 'force_sensor', port: 'C' },
);
```

- [ ] **Step 3: Smoke-test in the browser**

Run `python3 -m http.server 8787`, open the app, click Run on the default Python program. Confirm:
- The robot drives forward as before.
- No console errors related to `addBumper` or the contact listener.
- The robot still collides with the field walls (chassis fixture still present).

Stop the server (Ctrl-C). The Box2D init runs in the browser only — a Node-side test would need a real `box2d-wasm` import which the existing helper doesn't provide. The listener tests in Task 7 cover the non-browser path.

- [ ] **Step 4: Commit**

```bash
git add js/simulator.js
git commit -m "feat(force-sensor): build front bumper fixture on robot init (port C)"
```

---

## Task 9: Wire the force pipeline into `_animateTank`

Each physics tick inside `_animateTank` must consume `step()`'s `force_impulses`, run the EMA + manual ramp + max pipeline, and write `forceN` to `robot.sensors`.

**Files:**
- Modify: `js/simulator.js`

- [ ] **Step 1: Add force-sensor pipeline fields to the simulator**

Find the `RobotSimulator` constructor (around line 119-159). After `this._stopRequested = false;`, add:

```javascript
this._stopRequested  = false;

// Force-sensor pipeline state. emaN is the smoothed physics force in Newtons;
// manualStartMs is the timestamp the user pressed the Hub-panel button (null
// = released); the public combined value lives on robot.sensors.forceN.
this._emaN          = 0;
this._manualStartMs = null;
this._FORCE_ALPHA   = 0.4;
this._FORCE_DECAY   = 0.5;
this._FORCE_RAMP_MS = 1000;
this._FORCE_MAX_N   = 10;
```

- [ ] **Step 2: Add a `_applyForceImpulse(impulseJ, dt_s, hadContact)` helper**

In `js/simulator.js`, after `_findPairForPort` (around line 780-785), add:

```javascript
// Single tick of the force-sensor pipeline. impulseJ is the sum of normal
// impulses (kg·m/s) on the port-C bumper from this Box2D step; dt_s is the
// step length. hadContact = impulseJ > 0. Returns nothing; mutates
// _emaN and robot.sensors.forceN.
_applyForceImpulse(impulseJ, dt_s, hadContact) {
  const FSL = window.forceSensorLogic;
  const instantN = (dt_s > 0) ? (impulseJ / dt_s) : 0;
  this._emaN = FSL.emaStep(
    this._emaN, instantN, hadContact, this._FORCE_ALPHA, this._FORCE_DECAY,
  );
  const manualN = FSL.manualRamp(
    this._manualStartMs, performance.now(), this._FORCE_RAMP_MS, this._FORCE_MAX_N,
  );
  this.robot.sensors.forceN = FSL.combine(this._emaN, manualN);
}
```

Note: `performance.now()` is available in browsers and in Node 16+. The `vm` test harness also exposes it transparently via the host Node runtime.

- [ ] **Step 3: Update `_animateTank` to consume `force_impulses`**

Find `_animateTank` (around line 708-759). The current step call is:

```javascript
this.physics.step(physDt_s);
```

Change it to capture the return:

```javascript
const stepResult = this.physics.step(physDt_s);
const impulseJ   = (stepResult && stepResult.force_impulses && stepResult.force_impulses.C) || 0;
this._applyForceImpulse(impulseJ, physDt_s, impulseJ > 0);
```

After the `for` loop completes (right before `this.physics.setKinematicVelocity(this.robotBody, 0, 0, 0);`), the EMA naturally bleeds in the loop above; no extra cleanup required here.

- [ ] **Step 4: Smoke-test in the browser**

Run `python3 -m http.server 8787`. Use this test program in the Python editor:

```python
import motor_pair, runloop, force_sensor, port

async def main():
    motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)
    motor_pair.move(motor_pair.PAIR_1, 0, velocity=600)
    await runloop.sleep_ms(2500)
    print("force:", force_sensor.force(port.C))
    print("pressed:", force_sensor.pressed(port.C))
    motor_pair.stop(motor_pair.PAIR_1)

runloop.run(main())
```

Expected behaviour:
- Robot drives north into the top wall.
- After contact, `force_sensor.force(port.C)` prints a non-zero decinewton value (typically 5–60 dN, depending on speed and solver settings).
- `pressed` prints `True`.
- No console errors.

Stop the server.

- [ ] **Step 5: Commit**

```bash
git add js/simulator.js
git commit -m "feat(force-sensor): wire physics pipeline into _animateTank step loop"
```

---

## Task 10: Idle ticking from `_drawLoop`

The manual-press ramp must keep updating between commands. Add a lightweight tick that runs every `requestAnimationFrame`, updating `manualN` (and bleeding `emaN`) without doing a Box2D step.

**Files:**
- Modify: `js/simulator.js`

- [ ] **Step 1: Add the idle tick method**

In `js/simulator.js`, near `_applyForceImpulse` (Task 9, Step 2), add:

```javascript
// Idle tick: runs from _drawLoop on every frame, regardless of whether a
// motor command is in flight. Doesn't issue a physics step (manual force is
// independent of physics). Bleeds emaN by FORCE_DECAY each call so any
// residual physics force from a just-finished _animateTank decays back to
// zero within a few frames.
_idleStepForceSensor() {
  const FSL = window.forceSensorLogic;
  this._emaN = this._emaN * this._FORCE_DECAY;
  const manualN = FSL.manualRamp(
    this._manualStartMs, performance.now(), this._FORCE_RAMP_MS, this._FORCE_MAX_N,
  );
  this.robot.sensors.forceN = FSL.combine(this._emaN, manualN);
}
```

- [ ] **Step 2: Call it from `_drawLoop`**

Find `_drawLoop` (around line 229-235):

```javascript
_drawLoop() {
  if (this._dirty) {
    this._draw();
    this._dirty = false;
  }
  this._raf = requestAnimationFrame(() => this._drawLoop());
}
```

Update to:

```javascript
_drawLoop() {
  this._idleStepForceSensor();
  // Manual-press ramp + EMA bleed mutate forceN; mark dirty so the panel /
  // canvas redraw picks the change up. _animateTank already marks _dirty
  // when it's running, so this is a no-op contribution while a command runs.
  if (this._manualStartMs !== null || this._emaN > 0.001) {
    this._dirty = true;
  }
  if (this._dirty) {
    this._draw();
    this._dirty = false;
  }
  this._raf = requestAnimationFrame(() => this._drawLoop());
}
```

- [ ] **Step 3: Smoke-test (no manual UI yet, so just confirm no regression)**

Run `python3 -m http.server 8787`. Open the page. Confirm:
- The page loads without console errors.
- The robot still draws at idle (the existing canvas is rendered).
- A simple Run / Stop cycle still works.

The manual button doesn't exist yet — that's Task 11.

- [ ] **Step 4: Commit**

```bash
git add js/simulator.js
git commit -m "feat(force-sensor): idle tick from _drawLoop — manual ramp + emaN bleed"
```

---

## Task 11: Hub-panel widget (HTML + CSS)

Replace the static `#port-row-C` row with a `<button>` widget that contains a fill bar, a label, and a numeric value. JS wiring lands in Task 12.

**Files:**
- Modify: `index.html`
- Modify: `css/style.css`

- [ ] **Step 1: Replace `#port-row-C` markup**

In `index.html`, find the existing port-C row (around lines 150-154):

```html
<div class="port-row empty" id="port-row-C">
  <span class="port-letter">C</span>
  <span class="port-device">—</span>
  <span class="port-value" id="port-value-C"></span>
</div>
```

Replace with:

```html
<div class="port-row force" id="port-row-C">
  <span class="port-letter">C</span>
  <span class="port-device">force</span>
  <button class="port-force-button" id="port-force-C" type="button"
          aria-label="Press to apply force on the sensor at port C">
    <span class="port-force-fill" id="port-force-fill-C"></span>
    <span class="port-force-label">Press</span>
    <span class="port-force-value" id="port-force-value-C">0.0 N</span>
  </button>
</div>
```

- [ ] **Step 2: Add the widget CSS to `css/style.css`**

Append to `css/style.css` (at the end of the file, or near the existing `.port-row` rules around line 794-829):

```css
/* ── Force-sensor button widget (port-row.force) ─────────────────────── */

.port-row.force {
  /* Override the 4-column grid with a 3-col layout that lets the button
     spread across the value column. */
  grid-template-columns: 18px auto 1fr;
}

.port-force-button {
  position: relative;
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface2);
  overflow: hidden;
  cursor: pointer;
  display: flex;
  align-items: center;
  font-family: var(--font-code);
  font-size: 11px;
  color: var(--text);
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}

.port-force-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.port-force-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 0%;
  background: rgba(240, 168, 48, 0.55);  /* amber, matches mission yellow zone */
  transition: width 80ms linear, background-color 120ms linear;
}

.port-force-button[data-state="hard"] .port-force-fill {
  background: rgba(231, 76, 60, 0.65);   /* red, matches color-map red */
}

.port-force-label,
.port-force-value {
  position: relative;  /* sit above the fill */
  z-index: 1;
}

.port-force-label {
  flex: 1;
  text-align: left;
  font-weight: 600;
}

.port-force-value {
  margin-left: 8px;
  color: var(--amber);
  font-variant-numeric: tabular-nums;
}

.port-force-button:active {
  border-color: var(--accent);
}
```

If `--amber`, `--accent`, or `--surface2` are not defined in `css/style.css`, search the file for the closest equivalent (e.g. `--text-dim` for muted, `--surface` for background) and substitute. The colours `rgba(240, 168, 48, 0.55)` and `rgba(231, 76, 60, 0.65)` are baked literals to match the existing palette regardless of theme.

- [ ] **Step 3: Smoke-test the markup**

Run `python3 -m http.server 8787`. Open the page. Confirm:
- The Port C row now shows `C  force  [Press         0.0 N]` with the button visible.
- Clicking the button does nothing yet (no JS handler) — that's Task 12.
- No console errors.
- Themes (light/dark, if present) don't break the widget.

- [ ] **Step 4: Commit**

```bash
git add index.html css/style.css
git commit -m "feat(force-sensor): Hub-panel press-button widget for port C"
```

---

## Task 12: Pointer event wiring + simulator manual-press API

Hook `pointerdown` / `pointerup` / `pointerleave` / `pointercancel` to the simulator. The simulator exposes `manualPress()` and `manualRelease()` methods that mutate `_manualStartMs`.

**Files:**
- Modify: `js/simulator.js`
- Modify: `js/main.js`

- [ ] **Step 1: Add the public manual-press API to the simulator**

In `js/simulator.js`, near `_applyForceImpulse` and `_idleStepForceSensor`, add:

```javascript
// Public: called by the Hub-panel button on pointerdown. Idempotent — a
// duplicate press while already pressed leaves manualStartMs untouched.
manualPress() {
  if (this._manualStartMs == null) {
    this._manualStartMs = performance.now();
  }
}

// Public: called on pointerup / pointerleave / pointercancel. Snaps the
// manual contribution to zero immediately.
manualRelease() {
  this._manualStartMs = null;
  // Note: emaN is NOT cleared — a release while in physics contact should
  // still surface the physics force.
}
```

- [ ] **Step 2: Wire the button events in `main.js`**

In `js/main.js`, find a place where the simulator is initialized (search for `new RobotSimulator` or `sim = new`). After the simulator is constructed, add:

```javascript
// Wire the force-sensor press button to the simulator's manual-press API.
// pointerdown captures the pointer so a drag off the button still fires
// pointerup; pointerleave / pointercancel are belt-and-suspenders for cases
// where capture wasn't established (touch swipe, browser bug).
const forceBtn = document.getElementById('port-force-C');
if (forceBtn && sim) {
  forceBtn.addEventListener('pointerdown', (e) => {
    forceBtn.setPointerCapture && forceBtn.setPointerCapture(e.pointerId);
    sim.manualPress();
  });
  forceBtn.addEventListener('pointerup',     () => sim.manualRelease());
  forceBtn.addEventListener('pointerleave',  () => sim.manualRelease());
  forceBtn.addEventListener('pointercancel', () => sim.manualRelease());
}
```

If the simulator is initialized inside an async setup function, place this block immediately after `sim = new RobotSimulator(...)` inside that function so `sim` is in scope.

- [ ] **Step 3: Smoke-test**

Run `python3 -m http.server 8787`. Open the page. Press and hold the **Press** button. Open DevTools console and run:

```js
sim._manualStartMs   // should be a number while held, null when released
sim.robot.sensors.forceN  // should climb 0 → 10 over ~1 s while held
```

The widget itself doesn't visualize anything yet — Task 13 paints the fill bar.

- [ ] **Step 4: Commit**

```bash
git add js/simulator.js js/main.js
git commit -m "feat(force-sensor): pointer-event wiring + sim manualPress/manualRelease"
```

---

## Task 13: Drive the panel widget from `_updateSensorPanel`

Each frame, paint the fill bar, value text, and `data-state` based on `robot.sensors.forceN`.

**Files:**
- Modify: `js/simulator.js`

- [ ] **Step 1: Update `_updateSensorPanel` for the force-sensor row**

In `js/simulator.js`, find `_updateSensorPanel` (around line 500-536). Inside the per-port `for` loop, the current `force_sensor` branch doesn't exist — only `motor`, `color_sensor`, `distance_sensor`, and an `else` that wipes the cell. Find this block:

```javascript
for (const port of ['A', 'B', 'C', 'D', 'E', 'F']) {
  const cfg = this._portConfig[port];
  const valueEl = el('port-value-' + port);
  if (!valueEl) continue;

  if (cfg.kind === 'motor') {
    valueEl.textContent = (r.motors[port] || 0).toFixed(0) + '°';
  } else if (cfg.kind === 'color_sensor') {
    valueEl.textContent = s.colorValue || 'none';
  } else if (cfg.kind === 'distance_sensor') {
    valueEl.textContent = (s.distanceMM / 10).toFixed(1) + ' cm';
  } else {
    valueEl.textContent = '';
  }
}
```

The force-sensor row uses `id="port-force-value-C"` and `id="port-force-fill-C"` — different element IDs than the other rows. Add a dedicated branch *before* the per-port loop (or at its end), specifically targeting port C:

```javascript
for (const port of ['A', 'B', 'C', 'D', 'E', 'F']) {
  const cfg = this._portConfig[port];

  // Force sensor: dedicated widget on port C with fill bar + value label.
  if (cfg.kind === 'force_sensor') {
    this._paintForceSensorWidget(port);
    continue;
  }

  const valueEl = el('port-value-' + port);
  if (!valueEl) continue;

  if (cfg.kind === 'motor') {
    valueEl.textContent = (r.motors[port] || 0).toFixed(0) + '°';
  } else if (cfg.kind === 'color_sensor') {
    valueEl.textContent = s.colorValue || 'none';
  } else if (cfg.kind === 'distance_sensor') {
    valueEl.textContent = (s.distanceMM / 10).toFixed(1) + ' cm';
  } else {
    valueEl.textContent = '';
  }
}
```

Then add `_paintForceSensorWidget` as a new method on `RobotSimulator`:

```javascript
_paintForceSensorWidget(port) {
  const fillEl = document.getElementById('port-force-fill-' + port);
  const valEl  = document.getElementById('port-force-value-' + port);
  const btnEl  = document.getElementById('port-force-' + port);
  const f = this.robot.sensors.forceN || 0;
  const pct = Math.max(0, Math.min(100, (f / 10) * 100));
  if (fillEl) fillEl.style.width = pct.toFixed(1) + '%';
  if (valEl)  valEl.textContent  = f.toFixed(1) + ' N';
  if (btnEl) {
    const state = f >= 7 ? 'hard' : f >= 0.5 ? 'pressed' : 'idle';
    if (btnEl.dataset.state !== state) btnEl.dataset.state = state;
  }
}
```

- [ ] **Step 2: Smoke-test**

Run `python3 -m http.server 8787`. Confirm:
- Holding the **Press** button fills the bar from 0% to 100% over ~1 s; the numeric value climbs 0.0 N → 10.0 N.
- Past ~7 N, the bar tints red.
- Releasing snaps the bar to 0% and the value to "0.0 N".
- Pressing the button while a motor command is running still works (idle tick keeps running).
- Driving the robot into a wall fills the bar from physics impulses (combined max with manual = 0).

- [ ] **Step 3: Commit**

```bash
git add js/simulator.js
git commit -m "feat(force-sensor): paint widget fill / value / data-state each frame"
```

---

## Task 14: Canvas bumper drawing in `_drawRobot`

Draw a thin slab in front of the chassis with a colour ramp tied to `forceN`.

**Files:**
- Modify: `js/simulator.js`

- [ ] **Step 1: Add bumper drawing inside `_drawRobot`**

In `js/simulator.js`, find `_drawRobot` (around line 399-498). Locate the front-indicator triangle block (around lines 472-478):

```javascript
// Front indicator (red triangle pointing "forward")
ctx.fillStyle = '#ff4455';
ctx.beginPath();
ctx.moveTo(0,  -bh/2 - 8*s);
ctx.lineTo(-10*s, -bh/2 + 10*s);
ctx.lineTo( 10*s, -bh/2 + 10*s);
ctx.closePath();
ctx.fill();
```

*Before* that block (so the triangle stays visible on top of the bumper), add:

```javascript
// Force-sensor bumper (port C). Drawn forward of the chassis edge with a
// colour ramp tied to robot.sensors.forceN. Uses the same drawing transform
// as the chassis (+90° offset / heading), so body-local +X is "up" on screen.
{
  const f = this.robot.sensors.forceN || 0;
  const pct = Math.max(0, Math.min(1, f / 10));
  // idle: chassis-grey; pressed: amber; hard: red. Linear interp through
  // the two stops, mirroring the panel widget colour logic.
  const lerp = (a, b, t) => a + (b - a) * t;
  const idle  = [160, 160, 176];   // #a0a0b0
  const amber = [240, 168,  48];
  const red   = [231,  76,  60];
  let r, g, b;
  if (pct < 0.7) {
    const t = pct / 0.7;
    r = lerp(idle[0],  amber[0], t);
    g = lerp(idle[1],  amber[1], t);
    b = lerp(idle[2],  amber[2], t);
  } else {
    const t = (pct - 0.7) / 0.3;
    r = lerp(amber[0], red[0], t);
    g = lerp(amber[1], red[1], t);
    b = lerp(amber[2], red[2], t);
  }
  ctx.fillStyle = `rgb(${r|0}, ${g|0}, ${b|0})`;
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1 * s;
  if (f >= 7) {
    ctx.shadowColor   = 'rgba(231,76,60,0.8)';
    ctx.shadowBlur    = 8 * s;
    ctx.shadowOffsetY = 0;
  }
  // The chassis is drawn with body-local +Y = "down" on screen (the
  // ctx.rotate uses heading + 90°). Body-local +X (forward) maps to screen
  // -Y. So the bumper sits at y = -(bh/2 + bumperDepth/2).
  const bumperWpx = 30 * s;
  const bumperDpx = 10 * s;
  ctx.beginPath();
  ctx.roundRect(-bumperWpx/2, -bh/2 - bumperDpx, bumperWpx, bumperDpx, 2*s);
  ctx.fill();
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}
```

- [ ] **Step 2: Smoke-test**

Run `python3 -m http.server 8787`. Open the page. Confirm:
- The robot now has a small grey slab in front of its chassis at idle.
- Pressing the **Press** button tints the slab amber → red as the bar fills.
- Driving the robot into the top wall tints the slab to match the physics impulse.
- The front-indicator red triangle is still visible on top of the bumper.
- Reset returns the slab to grey.

- [ ] **Step 3: Commit**

```bash
git add js/simulator.js
git commit -m "feat(force-sensor): canvas bumper draw with colour ramp + glow at hard-press"
```

---

## Task 15: Reset clears force-sensor state

`reset()` rebuilds `this.robot` via `makeRobotState()` (forceN starts at 0 there), but `_emaN` and `_manualStartMs` live on the simulator instance and need explicit clearing.

**Files:**
- Modify: `js/simulator.js`

- [ ] **Step 1: Clear pipeline state in `reset()`**

In `js/simulator.js`, find `reset()` (around line 542-566). After `this._stopRequested = false;`, add:

```javascript
this._stopRequested = false;
this._emaN          = 0;
this._manualStartMs = null;
```

- [ ] **Step 2: Smoke-test**

Run `python3 -m http.server 8787`. Open the page. Hold the **Press** button while clicking **Reset**. Confirm:
- Reset clears the bar to 0% and the value to "0.0 N".
- The bumper on the canvas returns to grey.
- A subsequent press still ramps from 0 → 10 N over 1 s (no leftover state).

- [ ] **Step 3: Commit**

```bash
git add js/simulator.js
git commit -m "feat(force-sensor): reset clears emaN and manualStartMs"
```

---

## Task 16: Backlog cleanup + final integration smoke

Strike the now-complete backlog items, run the full test suite, do a manual end-to-end smoke test using a Blockly program.

**Files:**
- Modify: `BACKLOG.md`

- [ ] **Step 1: Strike the completed items**

In `BACKLOG.md`, find the "Force sensor" line under "Sensor stubs that need real values":

```markdown
- **Force sensor.** `force()` / `pressed()` / `raw()` always return 0 / False / 0. Drive `pressed()` from on-screen / keyboard input so the existing Blockly blocks become functional.
```

Delete this line.

Find the "Functional force-sensor blocks" line under "Programming Experience → Blockly":

```markdown
- **Functional force-sensor blocks** — block UI exists but the underlying API is a stub (see "Force sensor" above).
```

Delete this line.

- [ ] **Step 2: Run the full JS suite**

```bash
node --test 'tests/js/**/*.test.js'
```

Expected: all green (force_sensor_logic, accessors, sensor_state, world_2d_bumper, world_2d_force_listener, plus the pre-existing suites).

- [ ] **Step 3: Run the full Python suite**

```bash
python3 tests/py/run.py
```

Expected: all green, including `test_force_sensor`.

- [ ] **Step 4: Manual end-to-end smoke (Python)**

Run `python3 -m http.server 8787`. Paste this into the Python editor and Run:

```python
import motor_pair, runloop, force_sensor, port

async def main():
    motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)
    print("idle pressed:", force_sensor.pressed(port.C))
    motor_pair.move(motor_pair.PAIR_1, 0, velocity=600)
    await runloop.sleep_ms(2500)
    print("after wall hit:")
    print("  force(dN):", force_sensor.force(port.C))
    print("  pressed:",   force_sensor.pressed(port.C))
    print("  raw:",       force_sensor.raw(port.C))
    motor_pair.stop(motor_pair.PAIR_1)

runloop.run(main())
```

Confirm output shows `idle pressed: False`, then non-zero `force` and `pressed: True` after the wall hit.

- [ ] **Step 5: Manual end-to-end smoke (Blockly)**

Switch to the Blocks tab. Build:

- `when start` →
- `when force sensor on PORT_C is pressed` (event hat) →
- `play sound (beep)` (or `print` text)

Drive the robot forward into the wall via a separate program, *or* press and hold the **Press** button for ~700 ms. The hat fires; the beep plays / message prints.

- [ ] **Step 6: Manual UI checks**

- Hold the **Press** button on the Hub panel:
  - Bar fills 0% → 100% over ~1 s.
  - Numeric climbs 0.0 N → 10.0 N.
  - Bumper on the canvas tints amber → red.
  - Releasing snaps the bar / value / bumper back to idle.
- Drive the robot into a mission obstacle (the purple `1` box at math y-up `(1700, 943)`, on the green sensor zone):
  - Bar fills proportionally to the impulse.
  - Bumper tints.
  - Obstacle is shoved.
  - On stopping, bar bleeds back to 0 within a few hundred ms.
- Click **Reset** while pressing: bar empties; subsequent press still ramps from 0 → 10 N.
- Press the button while the robot is bumping a wall: bar shows the *larger* of the two values; release while still bumping → bar drops to the physics-only level (then bleeds out when the robot stops).
- Side-swipe an obstacle (drive sideways with one wheel): the bumper does *not* fire because only the chassis fixture contacts.

- [ ] **Step 7: Commit**

```bash
git add BACKLOG.md
git commit -m "docs(backlog): strike completed force-sensor items"
```

---

## Done

The Spike Prime force sensor on port C is fully wired:
- Pure-fn helpers under unit test.
- Box2D bumper fixture + contact listener under unit test (with stub).
- Python bridge under unit test.
- Hybrid `max(physics_EMA, manual_ramp)` pipeline driving Hub-panel widget, canvas bumper, and the existing Blockly + Monaco surfaces.
- Backlog updated.
