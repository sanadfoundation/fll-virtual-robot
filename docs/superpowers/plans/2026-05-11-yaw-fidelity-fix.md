# Yaw Fidelity Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix [issue #9](https://github.com/sanadfoundation/fll-virtual-robot/issues/9) — make Blockly's *set yaw angle to 0* and *hub yaw angle* (and their Python counterparts `motion_sensor.reset_yaw` / `tilt_angles`) behave to LEGO Spike spec: yaw is a *signed delta from the last reset*, CW-positive, wrapped to ±180°.

**Architecture:** The simulator owns the yaw baseline (`_yawZeroHeading_deg`) and exposes one public method per concern: `resetYaw(degrees)`, `getYaw()` (degrees, for JS/Blockly), and `_yawDeciDeg()` (deci-degrees, for the Python sensor snapshot). Blockly generators and the Python bridge both delegate to those — neither writes raw `robot.heading` directly anymore. `robot.heading` remains a math-y-up pose attribute (0=east, 90=north, CCW+); the yaw API derives a LEGO-shaped value from it.

**Tech Stack:** Vanilla JS (`js/simulator.js`, `js/blockly_config.js`, `js/monaco_config.js`), MicroPython (`py/spike_bridge.py`), Node's built-in test runner (`node --test`), Python `unittest` via `tests/py/run.py`.

**Context for the implementer:**
- A prior, never-merged branch (`feature/noise-events`) contains commits `72f15fe` and `5d79c7e` that implement the sim and Python halves. The code below matches those commits in shape and naming so a future rebase is conflict-free; you do **not** need to cherry-pick — the plan reproduces the relevant deltas directly. The Blockly rewiring (the actual user-visible fix) is **new** to this plan and not in those commits.
- The simulator's heading frame: math y-up, 0=east, 90=north, CCW-positive. Spawn heading is `90` (`js/simulator.js:122`).
- LEGO yaw frame (target): CW-positive (right turn = positive), range `-180..180`, relative to the most recent `reset_yaw()`. Spike v3 `motion_sensor.tilt_angles()` returns `(yaw, pitch, roll)` in deci-degrees.
- Blockly's "hub yaw angle" reporter is documented as *degrees* (tooltip at `js/blockly_config.js:862`). Python's `tilt_angles` returns deci-degrees. Same underlying value, different units at the boundary.
- CLAUDE.md constraint: **Blockly bypasses the Python worker.** Blockly generators call `window.sim.*` methods directly, not `_execCmd(...)`. Python goes through `_execCmd`. Both must converge on the same yaw state.

---

## Files

**Modify:**
- `js/simulator.js` — add `_yawZeroHeading_deg` field; `resetYaw()`, `getYaw()`, `_yawDeciDeg()` methods; `_execCmd` `'reset_yaw'` case; `yaw_dDeg` in `_sensorState()`; rebaseline yaw inside `reset()`.
- `js/blockly_config.js` — rewire `flippersensors_resetYaw` and `flippersensors_orientationAxis` generators to call the sim's public yaw API.
- `js/monaco_config.js` — refresh `tilt_angles` and `reset_yaw` hover docs.
- `py/spike_bridge.py` — real `reset_yaw(angle=0)` (bridges with `angle_dDeg`); `tilt_angles()` reads `_state['yaw_dDeg']`; seed `yaw_dDeg: 0` in `_state`; fix stale `heading: -90` → `90` to match the y-up convention used everywhere else.
- `tests/js/state/sensor-state.test.js` — assert initial `yaw_dDeg = 0`.
- `tests/py/mock_js.py` — seed `yaw_dDeg: 0` in the mock's default state; fix stale `heading: -90` → `90`.
- `tests/py/test_hub.py` — replace the (incorrect) `test_reset_yaw_no_command` with a check that `reset_yaw` *does* now emit a bridge command.
- `tests/py/run.py` — register `test_motion_sensor`.

**Create:**
- `tests/js/sensors/gyro.test.js` — unit tests for the sim's yaw API.
- `tests/js/blockly/yaw-generators.test.js` — pin the Blockly emissions for the yaw reset and yaw read.
- `tests/py/test_motion_sensor.py` — Python tests for `tilt_angles` reading state and `reset_yaw` bridging.

**Delete (cleanup):**
- `repro-issue-9.html` — the temporary staging page created during reproduction.

---

## Task 1: Sim — yaw state, `_yawDeciDeg()`, and sensor snapshot field

**Files:**
- Modify: `js/simulator.js`
- Modify: `tests/js/state/sensor-state.test.js`
- Create: `tests/js/sensors/gyro.test.js`

- [ ] **Step 1.1: Write the failing tests (gyro.test.js)**

Create `tests/js/sensors/gyro.test.js` with:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

test('_sensorState includes yaw_dDeg = 0 right after reset', () => {
  const sim = createSim();
  sim.reset();
  const s = sim._sensorState();
  assert.strictEqual(s.yaw_dDeg, 0);
});

test('yaw_dDeg = -CCW * 10: heading rotates +30° (CCW) → yaw -300 dDeg', () => {
  const sim = createSim();
  sim.reset();   // capture spawn heading=90 as zero
  sim.robot.heading = 90 + 30;   // CCW 30° from spawn
  const s = sim._sensorState();
  assert.strictEqual(s.yaw_dDeg, -300);
});

test('yaw_dDeg wraps into [-1800, 1800]', () => {
  const sim = createSim();
  sim.reset();
  sim.robot.heading = 90 + 200;   // 200° CCW from zero
  const s = sim._sensorState();
  assert.ok(s.yaw_dDeg >= -1800 && s.yaw_dDeg <= 1800,
    `expected wrap to [-1800,1800], got ${s.yaw_dDeg}`);
  // 200° CCW heading delta → -2000 dDeg unwrapped → wraps to +1600 dDeg in LEGO frame
  assert.strictEqual(s.yaw_dDeg, 1600);
});
```

- [ ] **Step 1.2: Extend `tests/js/state/sensor-state.test.js`**

Add this assertion to the existing `_sensorState: returns correct initial values` test (after the `state.heading` assertion at line 12):

```javascript
  assert.strictEqual(state.yaw_dDeg,    0);
```

- [ ] **Step 1.3: Run tests, confirm failure**

Run: `node --test tests/js/sensors/gyro.test.js tests/js/state/sensor-state.test.js`

Expected: 4 failures with messages like `expected 0, got undefined` (the field doesn't exist yet) and `cannot read property of undefined`.

- [ ] **Step 1.4: Add the yaw state field**

In `js/simulator.js`, find the constructor block ending around line 150 (right after `this._portConfig = PORT_CONFIG;`). Insert:

```javascript
    this._stopRequested  = false;
    this._yawZeroHeading_deg = this.robot.heading;
```

(The `_stopRequested` line already exists — the new line goes immediately after it.)

- [ ] **Step 1.5: Add the `_yawDeciDeg()` method and snapshot field**

In `js/simulator.js`, find the `_sensorState()` method (around line 1050). Add a sibling helper method just above it:

```javascript
  _yawDeciDeg() {
    // LEGO yaw is CW-positive; sim heading is CCW-positive. Negate, scale by 10.
    let d = -(this.robot.heading - this._yawZeroHeading_deg) * 10;
    // Wrap to [-1800, +1800].
    d = ((d + 1800) % 3600 + 3600) % 3600 - 1800;
    return d;
  }
```

Then add `yaw_dDeg: this._yawDeciDeg(),` inside the `_sensorState()` return object, immediately after the `heading:` field:

```javascript
  _sensorState() {
    const r = this.robot;
    return {
      x:           r.x,
      y:           r.y,
      heading:     r.heading,
      yaw_dDeg:    this._yawDeciDeg(),
      color:       r.sensors.colorValue,
      distance_mm: r.sensors.distanceMM,
      motors:      { ...r.motors },
      stopped:     false,
    };
  }
```

- [ ] **Step 1.6: Rebaseline yaw inside `reset()`**

In `js/simulator.js`, find the `reset()` method (around line 780–795). Find the line that resets `_stopRequested` (around line 787) and add the yaw rebaseline immediately after:

```javascript
    this._stopRequested = false;
    this._yawZeroHeading_deg = this.robot.heading;
```

- [ ] **Step 1.7: Run tests, confirm pass**

Run: `node --test tests/js/sensors/gyro.test.js tests/js/state/sensor-state.test.js`

Expected: all 4 tests pass.

- [ ] **Step 1.8: Run the full JS test suite to verify no regressions**

Run: `node --test tests/js/**/*.test.js`

Expected: zero failures.

- [ ] **Step 1.9: Commit**

```bash
git add js/simulator.js tests/js/sensors/gyro.test.js tests/js/state/sensor-state.test.js
git commit -m "feat(motion-sensor): emit yaw_dDeg in sensor snapshot

Snapshot exposes yaw as deci-degrees, LEGO convention (CW-positive,
wrapped to ±1800). Sim heading stays math-y-up; the conversion lives
in _yawDeciDeg(). Re-baselines on sim.reset() so a fresh program run
starts at yaw 0."
```

---

## Task 2: Sim — `resetYaw()`, `getYaw()`, and the `_execCmd` `reset_yaw` case

**Files:**
- Modify: `js/simulator.js`
- Modify: `tests/js/sensors/gyro.test.js`

- [ ] **Step 2.1: Write the failing tests**

Append to `tests/js/sensors/gyro.test.js`:

```javascript
test('resetYaw(): zeroes yaw at the current heading without rotating the robot', () => {
  const sim = createSim();
  sim.robot.heading = 45;             // some random heading
  sim.resetYaw();
  assert.strictEqual(sim.getYaw(), 0);
  assert.strictEqual(sim.robot.heading, 45, 'reset must not physically rotate');
});

test('getYaw(): returns degrees (CW positive), range -180..180', () => {
  const sim = createSim();
  sim.robot.heading = 90;
  sim.resetYaw();

  sim.robot.heading = 90 - 30;        // 30° CW from zero → +30
  assert.strictEqual(sim.getYaw(), 30);

  sim.robot.heading = 90 + 30;        // 30° CCW → -30
  assert.strictEqual(sim.getYaw(), -30);

  sim.robot.heading = 90 + 200;       // 200° CCW unwrapped → -200 → wraps to +160
  assert.strictEqual(sim.getYaw(), 160);
});

test('resetYaw(degrees): sets yaw to the supplied value without rotating', () => {
  const sim = createSim();
  sim.robot.heading = 90;
  sim.resetYaw(45);                   // declare "yaw is now 45° here"
  assert.strictEqual(sim.getYaw(), 45);
  assert.strictEqual(sim.robot.heading, 90, 'reset must not physically rotate');
});

test('_execCmd({type:reset_yaw}) routes through resetYaw', async () => {
  const sim = createSim();
  sim.robot.heading = 90;
  await sim._execCmd({ type: 'reset_yaw', angle_dDeg: 0 });
  let s = sim._sensorState();
  assert.strictEqual(s.yaw_dDeg, 0);

  sim.robot.heading = 120;             // CCW 30°
  s = sim._sensorState();
  assert.strictEqual(s.yaw_dDeg, -300);

  await sim._execCmd({ type: 'reset_yaw', angle_dDeg: 900 });   // 90°
  s = sim._sensorState();
  assert.strictEqual(s.yaw_dDeg, 900);
});
```

- [ ] **Step 2.2: Run tests, confirm failure**

Run: `node --test tests/js/sensors/gyro.test.js`

Expected: 4 new failures (`sim.resetYaw is not a function`, `sim.getYaw is not a function`, and the `_execCmd` case is unhandled).

- [ ] **Step 2.3: Add `resetYaw()` and `getYaw()` methods**

In `js/simulator.js`, place these two methods adjacent to `_yawDeciDeg()` (just above `_sensorState()`):

```javascript
  resetYaw(degrees = 0) {
    // Record the current heading as the new yaw baseline. `degrees` lets the
    // caller declare "yaw is N here" without physically rotating the robot.
    this._yawZeroHeading_deg = this.robot.heading + degrees;
  }

  getYaw() {
    // LEGO yaw, in degrees: CW-positive, signed, wrapped to (-180, 180].
    let d = -(this.robot.heading - this._yawZeroHeading_deg);
    d = ((d + 180) % 360 + 360) % 360 - 180;
    return d;
  }
```

Refactor `_yawDeciDeg()` to delegate (replace the existing body):

```javascript
  _yawDeciDeg() {
    return Math.round(this.getYaw() * 10);
  }
```

- [ ] **Step 2.4: Add the `_execCmd` `reset_yaw` case**

In `js/simulator.js`, find the `_execCmd(cmd)` switch (around line 845–905). Add a new case just after `case 'read_sensors':` (around line 933):

```javascript
      case 'reset_yaw':
        // angle_dDeg lets the program declare "yaw should read N here" without
        // physically rotating the robot. Default 0 = zero current heading.
        this.resetYaw((cmd.angle_dDeg || 0) / 10);
        break;
```

- [ ] **Step 2.5: Run tests, confirm pass**

Run: `node --test tests/js/sensors/gyro.test.js`

Expected: all 7 gyro tests pass.

- [ ] **Step 2.6: Run the full JS test suite to verify no regressions**

Run: `node --test tests/js/**/*.test.js`

Expected: zero failures.

- [ ] **Step 2.7: Commit**

```bash
git add js/simulator.js tests/js/sensors/gyro.test.js
git commit -m "feat(motion-sensor): resetYaw/getYaw + reset_yaw _execCmd case

Public sim API: resetYaw(degrees) sets a yaw baseline without
physically rotating the robot; getYaw() returns LEGO-shaped yaw
(degrees, CW positive, wrapped to ±180). _execCmd routes the Python
worker's reset_yaw command into the same path."
```

---

## Task 3: Blockly — rewire `set yaw angle to 0` to call `sim.resetYaw()`

**Files:**
- Modify: `js/blockly_config.js`
- Create: `tests/js/blockly/yaw-generators.test.js`

- [ ] **Step 3.1: Write the failing test**

Create `tests/js/blockly/yaw-generators.test.js`:

```javascript
'use strict';

// Pins the Blockly emissions for the yaw API. After issue #9, the resetYaw
// block must delegate to sim.resetYaw() and the orientationAxis('yaw')
// reporter must read sim.getYaw() — neither may touch robot.heading directly.

const test   = require('node:test');
const assert = require('node:assert');
const { makeBlocklyEnv } = require('../mocks/blockly-env');

function setupGenerators() {
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  return env;
}

function makeBlock(overrides = {}) {
  return {
    getFieldValue(name) {
      if (name in overrides) return overrides[name];
      return 'A';
    },
    getInputTargetBlock() { return null; },
  };
}

test('flippersensors_resetYaw emits sim.resetYaw() (not robot.heading slam)', () => {
  const { Blockly } = setupGenerators();
  const code = Blockly.JavaScript['flippersensors_resetYaw'](makeBlock());
  const codeStr = Array.isArray(code) ? code[0] : code;
  assert.ok(codeStr.includes('window.sim.resetYaw()'),
    `expected window.sim.resetYaw(), got: ${codeStr}`);
  assert.ok(!codeStr.includes('robot.heading'),
    `must not write robot.heading, got: ${codeStr}`);
});

test('flippersensors_orientationAxis(yaw) emits sim.getYaw()', () => {
  const { Blockly } = setupGenerators();
  const result = Blockly.JavaScript['flippersensors_orientationAxis'](makeBlock({ AXIS: 'yaw' }));
  const codeStr = Array.isArray(result) ? result[0] : result;
  assert.ok(codeStr.includes('window.sim.getYaw()'),
    `expected window.sim.getYaw(), got: ${codeStr}`);
  assert.ok(!codeStr.includes('robot.heading'),
    `must not read robot.heading directly, got: ${codeStr}`);
});

test('flippersensors_orientationAxis(pitch) still returns 0 (sim is 2D)', () => {
  const { Blockly } = setupGenerators();
  const result = Blockly.JavaScript['flippersensors_orientationAxis'](makeBlock({ AXIS: 'pitch' }));
  const codeStr = Array.isArray(result) ? result[0] : result;
  assert.strictEqual(codeStr, '0');
});
```

- [ ] **Step 3.2: Run test, confirm failure**

Run: `node --test tests/js/blockly/yaw-generators.test.js`

Expected: 2 failures (resetYaw and orientationAxis(yaw) still emit the old `robot.heading` code).

- [ ] **Step 3.3: Rewire `flippersensors_resetYaw`**

In `js/blockly_config.js`, replace line 1535:

```javascript
  js['flippersensors_resetYaw'] = (_b) => `window.sim.robot.heading = -90;\n`;
```

with:

```javascript
  js['flippersensors_resetYaw'] = (_b) => `window.sim.resetYaw();\n`;
```

- [ ] **Step 3.4: Rewire `flippersensors_orientationAxis`**

In `js/blockly_config.js`, replace the `flippersensors_orientationAxis` generator at line 1529–1533:

```javascript
  js['flippersensors_orientationAxis'] = (block) => {
    const axis = block.getFieldValue('AXIS');
    if (axis === 'yaw') return [`(((window.sim.robot.heading % 360) + 360) % 360)`, ORDER_ATOMIC];
    return [`0`, ORDER_ATOMIC];
  };
```

with:

```javascript
  js['flippersensors_orientationAxis'] = (block) => {
    const axis = block.getFieldValue('AXIS');
    if (axis === 'yaw') return [`window.sim.getYaw()`, ORDER_ATOMIC];
    // Top-down sim has no pitch/roll axis — always 0, matching LEGO docs for
    // a flat-on-table hub.
    return [`0`, ORDER_ATOMIC];
  };
```

- [ ] **Step 3.5: Run tests, confirm pass**

Run: `node --test tests/js/blockly/yaw-generators.test.js`

Expected: all 3 tests pass.

- [ ] **Step 3.6: Run the full JS test suite to verify no regressions**

Run: `node --test tests/js/**/*.test.js`

Expected: zero failures. (The existing `generators-smoke.test.js` should still pass; the smoke test only checks that emissions are non-empty.)

- [ ] **Step 3.7: Commit**

```bash
git add js/blockly_config.js tests/js/blockly/yaw-generators.test.js
git commit -m "fix(blockly): yaw reset/read route through sim public API (issue #9)

set yaw angle to 0 → sim.resetYaw() (was: slammed robot.heading=-90,
which left the yaw reader at 270, not 0).

hub yaw angle → sim.getYaw() (was: normalized raw heading to [0,360),
which has no reset baseline, wrong rotational sign, and wrong range).

Behavior now matches LEGO Spike's motion_sensor: yaw is a signed delta
from the last reset, CW positive, wrapped to ±180."
```

---

## Task 4: Python — `tilt_angles` reads state, `reset_yaw` bridges, state seeds

**Files:**
- Modify: `py/spike_bridge.py`
- Modify: `tests/py/mock_js.py`
- Modify: `tests/py/test_hub.py`
- Modify: `tests/py/run.py`
- Create: `tests/py/test_motion_sensor.py`

- [ ] **Step 4.1: Write the failing test (test_motion_sensor.py)**

Create `tests/py/test_motion_sensor.py`:

```python
"""Tests for hub.motion_sensor.tilt_angles and reset_yaw."""
import unittest
import mock_js
import spike_bridge as sb


class TestMotionSensor(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_tilt_angles_returns_yaw_pitch_roll_tuple(self):
        result = sb.hub.motion_sensor.tilt_angles()
        self.assertEqual(len(result), 3)

    def test_tilt_angles_yaw_reads_from_state(self):
        sb._state['yaw_dDeg'] = 450
        yaw, pitch, roll = sb.hub.motion_sensor.tilt_angles()
        self.assertEqual(yaw, 450)
        self.assertEqual(pitch, 0)
        self.assertEqual(roll, 0)

    def test_tilt_angles_yaw_negative(self):
        sb._state['yaw_dDeg'] = -300
        yaw, _, _ = sb.hub.motion_sensor.tilt_angles()
        self.assertEqual(yaw, -300)

    def test_reset_yaw_default_sends_zero(self):
        sb.hub.motion_sensor.reset_yaw()
        cmd = mock_js.bridge_mock.last()
        self.assertEqual(cmd, {'type': 'reset_yaw', 'angle_dDeg': 0})

    def test_reset_yaw_with_angle(self):
        sb.hub.motion_sensor.reset_yaw(90)
        cmd = mock_js.bridge_mock.last()
        # LEGO API takes degrees; bridge command carries decidegrees (90° → 900 dDeg).
        self.assertEqual(cmd, {'type': 'reset_yaw', 'angle_dDeg': 900})


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 4.2: Update the existing `test_reset_yaw_no_command` test**

In `tests/py/test_hub.py`, replace lines 91–93:

```python
    def test_reset_yaw_no_command(self):
        sb.hub.motion_sensor.reset_yaw()
        self.assertEqual(mock_js.bridge_mock.all(), [])
```

with:

```python
    def test_reset_yaw_sends_reset_yaw_command(self):
        sb.hub.motion_sensor.reset_yaw()
        self.assertEqual(mock_js.bridge_mock.last(), {'type': 'reset_yaw', 'angle_dDeg': 0})
```

- [ ] **Step 4.3: Register the new test module**

In `tests/py/run.py`, add the import and list entry. Replace:

```python
import test_motor_sensor_gaps

loader = unittest.TestLoader()
suite  = unittest.TestSuite()
for mod in [test_motor_pair, test_motor, test_hub, test_wait, test_print,
            test_validation, test_gaps, test_motor_sensor_gaps]:
    suite.addTests(loader.loadTestsFromModule(mod))
```

with:

```python
import test_motor_sensor_gaps
import test_motion_sensor

loader = unittest.TestLoader()
suite  = unittest.TestSuite()
for mod in [test_motor_pair, test_motor, test_hub, test_wait, test_print,
            test_validation, test_gaps, test_motor_sensor_gaps, test_motion_sensor]:
    suite.addTests(loader.loadTestsFromModule(mod))
```

- [ ] **Step 4.4: Run tests, confirm failure**

Run: `python3 tests/py/run.py`

Expected: failures in `test_motion_sensor.py` (`reset_yaw` returns `_NoopAwaitable`, no bridge call captured; `tilt_angles` returns hard-coded `(0,0,0)`) and the updated `test_hub.test_reset_yaw_sends_reset_yaw_command`.

- [ ] **Step 4.5: Update `_state` seed in spike_bridge.py**

In `py/spike_bridge.py`, replace the `_state` dictionary at lines 34–39:

```python
_state = {
    'x': 350, 'y': 980, 'heading': -90,
    'color': 'none', 'distance_mm': 300,
    'motors': {'A': 0, 'B': 0, 'C': 0, 'D': 0, 'E': 0, 'F': 0},
    'stopped': False,
}
```

with:

```python
_state = {
    'x': 350, 'y': 163, 'heading': 90,
    'color': 'none', 'distance_mm': 300,
    'yaw_dDeg': 0,
    'motors': {'A': 0, 'B': 0, 'C': 0, 'D': 0, 'E': 0, 'F': 0},
    'stopped': False,
}
```

(The `x`/`y`/`heading` change aligns the Python seed with the y-up coordinate system the JS sim already uses since commit `86d59fb`. Without it, `tilt_angles()` and other state reads return stale values before the first bridge round-trip.)

- [ ] **Step 4.6: Implement `tilt_angles` and `reset_yaw` in spike_bridge.py**

In `py/spike_bridge.py`, replace lines 430 and 433 in the `_MotionSensor` class:

```python
    def tilt_angles(self):                            return (0, 0, 0)
    def angular_velocity(self, raw_unfiltered=False): return (0, 0, 0)
    def acceleration(self, raw_unfiltered=False):     return (0, 0, 981)
    def reset_yaw(self, angle=0):                     return _NoopAwaitable()
```

with:

```python
    def tilt_angles(self):
        # Returns (yaw, pitch, roll) in decidegrees per LEGO convention.
        # Top-down sim has no third axis, so pitch and roll are always 0.
        return (_state.get('yaw_dDeg', 0), 0, 0)
    def angular_velocity(self, raw_unfiltered=False): return (0, 0, 0)
    def acceleration(self, raw_unfiltered=False):     return (0, 0, 981)
    def reset_yaw(self, angle=0):
        # angle is in degrees per LEGO docs; the bridge command carries decidegrees.
        return _bridge_call({'type': 'reset_yaw', 'angle_dDeg': int(angle * 10)})
```

- [ ] **Step 4.7: Update mock_js seed**

In `tests/py/mock_js.py`, replace lines 70–73 (inside `BridgeMock.install`):

```python
        sb._state.update({
            'x': 350, 'y': 980, 'heading': -90,
            'color': 'none', 'distance_mm': 300,
            'motors': {'A': 0, 'B': 0, 'C': 0, 'D': 0, 'E': 0, 'F': 0},
            'stopped': False,
        })
```

with:

```python
        sb._state.update({
            'x': 350, 'y': 163, 'heading': 90,
            'color': 'none', 'distance_mm': 300,
            'yaw_dDeg': 0,
            'motors': {'A': 0, 'B': 0, 'C': 0, 'D': 0, 'E': 0, 'F': 0},
            'stopped': False,
        })
```

- [ ] **Step 4.8: Run tests, confirm pass**

Run: `python3 tests/py/run.py`

Expected: full suite passes, including the 5 new `test_motion_sensor` tests and the updated `test_reset_yaw_sends_reset_yaw_command`.

- [ ] **Step 4.9: Commit**

```bash
git add py/spike_bridge.py tests/py/test_motion_sensor.py tests/py/test_hub.py tests/py/run.py tests/py/mock_js.py
git commit -m "feat(motion-sensor): tilt_angles reads sim yaw; reset_yaw bridges

Python motion_sensor.tilt_angles() now returns (yaw, 0, 0) from the
sensor snapshot's yaw_dDeg field instead of constant (0,0,0).
motion_sensor.reset_yaw(angle) bridges a 'reset_yaw' command with
angle_dDeg payload instead of being a no-op.

Also fixes a stale _state seed left over from pre-y-up coordinates:
default heading is 90 (north), default position (350, 163), matching
js/simulator.js and the y-up commits."
```

---

## Task 5: Monaco — refresh `tilt_angles` and `reset_yaw` hover docs

**Files:**
- Modify: `js/monaco_config.js`

- [ ] **Step 5.1: Update the `tilt_angles` doc**

In `js/monaco_config.js`, find the `tilt_angles` entry inside `motion_sensor.members` (around line 328–332). Replace:

```javascript
        tilt_angles: {
          sig: 'hub.motion_sensor.tilt_angles() -> tuple[int, int, int]',
          doc: 'Return (yaw, pitch, roll) in decidegrees.',
          params: [],
        },
```

with:

```javascript
        tilt_angles: {
          sig: 'hub.motion_sensor.tilt_angles() -> tuple[int, int, int]',
          doc: 'Return (yaw, pitch, roll) in decidegrees. Yaw is driven from the simulator heading; pitch and roll are always 0 in the top-down sim.',
          params: [],
        },
```

- [ ] **Step 5.2: Update the `reset_yaw` doc**

In `js/monaco_config.js`, find the `reset_yaw` entry (around line 343–347). Replace:

```javascript
        reset_yaw: {
          sig: 'hub.motion_sensor.reset_yaw(angle=0) -> None',
          doc: 'Reset the yaw angle to the given value.',
          params: ['angle'],
        },
```

with:

```javascript
        reset_yaw: {
          sig: 'hub.motion_sensor.reset_yaw(angle=0) -> None',
          doc: 'Record the current heading as yaw zero (or as `angle` degrees if supplied).\n\n**angle** — degrees; subsequent `tilt_angles()` calls report yaw relative to this offset.',
          params: ['angle'],
        },
```

- [ ] **Step 5.3: Run JS tests to confirm Monaco completion tests (if any) still pass**

Run: `node --test tests/js/monaco/*.test.js`

Expected: zero failures. (If the suite is empty or the directory doesn't exist, this is a no-op; doc strings have no tests of their own.)

- [ ] **Step 5.4: Commit**

```bash
git add js/monaco_config.js
git commit -m "docs(monaco): tilt_angles/reset_yaw hover docs match new behavior"
```

---

## Task 6: End-to-end — issue #9's exact program runs correctly

**Files:**
- Create: `tests/js/blockly/yaw-program-issue-9.test.js`

This is the integration test that proves the fix actually resolves the user's bug. It compiles the four-block program through Blockly's code generator and runs the emitted JS against a real `sim` instance (with motor animation stubbed so the test is deterministic).

- [ ] **Step 6.1: Write the integration test**

Create `tests/js/blockly/yaw-program-issue-9.test.js`:

```javascript
'use strict';

// End-to-end: the exact four-block program from issue #9 must
//   - block (not return immediately) on `wait until yaw > 90`,
//   - exit the wait_until after the robot has actually rotated 90° CW.

const test   = require('node:test');
const assert = require('node:assert');
const { makeBlocklyEnv } = require('../mocks/blockly-env');
const { createSim } = require('../sim-helper');

const PROGRAM_XML = `
<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="flipperevents_whenProgramStarts" x="80" y="80">
    <next>
      <block type="flippersensors_resetYaw">
        <next>
          <block type="flippermotor_motorStartDirection">
            <field name="PORT">A</field>
            <field name="DIRECTION">counterclockwise</field>
            <next>
              <block type="control_wait_until">
                <value name="CONDITION">
                  <block type="operator_gt">
                    <value name="OPERAND1">
                      <block type="flippersensors_orientationAxis">
                        <field name="AXIS">yaw</field>
                      </block>
                    </value>
                    <value name="OPERAND2">
                      <shadow type="math_number"><field name="NUM">90</field></shadow>
                    </value>
                  </block>
                </value>
              </block>
            </next>
          </block>
        </next>
      </block>
    </next>
  </block>
</xml>`.trim();

test('issue #9: wait_until does not exit immediately after resetYaw', async () => {
  const env = makeBlocklyEnv();
  const Blockly = env.window.Blockly;
  const workspace = env.window.initBlockly('blockly-div', 'light');

  Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(PROGRAM_XML), workspace);

  const code = env.window.generateBlocklyJS(workspace);

  // Run the emitted code against a real sim. Stub motor animation: instead of
  // physically rotating, we drive heading manually on a timer so the wait_until
  // and the (fire-and-forget) motor call interleave deterministically.
  const sim = createSim();
  env.window.sim = sim;
  sim.isRunning = true;

  // Replace _animateSingleMotor with one that simulates a CW pivot at known rate.
  sim._animateSingleMotor = async (port, velocity, distMM) => {
    // Treat A (drive-left) + positive velocity as a CW pivot in math-y-up
    // (left wheel forward, right wheel held → robot turns right = CW = heading
    // decreases). Step heading down by 5° every awaited tick until isRunning
    // goes false or distMM "exhausted".
    let stepsLeft = 200;
    while (sim.isRunning && stepsLeft-- > 0) {
      sim.robot.heading -= 5;
      await new Promise(r => setImmediate(r));
    }
  };

  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const fn = new AsyncFunction(code);

  const startHeading = sim.robot.heading;

  // Race the program against a watchdog. If wait_until exits immediately
  // (the bug), the AsyncFunction completes within a few ticks with the robot
  // having barely moved — that's the failure mode we're guarding against.
  await fn();

  const totalCWturn = startHeading - sim.robot.heading;   // CW in math-y-up = positive
  assert.ok(totalCWturn >= 90,
    `expected at least 90° CW rotation before wait_until released, got ${totalCWturn}°`);
});
```

- [ ] **Step 6.2: Run the integration test, confirm pass**

Run: `node --test tests/js/blockly/yaw-program-issue-9.test.js`

Expected: pass. The wait_until blocks while the stubbed `_animateSingleMotor` ticks heading down by 5° per setImmediate; after ~19 ticks the yaw crosses +90 and the loop releases.

If this test passes but the manual repro in Task 7 still misbehaves, the bug is somewhere this test isn't covering — usually a real-physics interaction. Don't soften the assertion; investigate.

- [ ] **Step 6.3: Run the full JS test suite**

Run: `node --test tests/js/**/*.test.js`

Expected: zero failures across the full suite.

- [ ] **Step 6.4: Commit**

```bash
git add tests/js/blockly/yaw-program-issue-9.test.js
git commit -m "test(blockly): pin issue #9 four-block program runs to completion"
```

---

## Task 7: Manual browser verification

**Prerequisite:** A dev server is running at the repo root. From the project root: `python3 -m http.server 8787`. (If port 8787 is taken, pick another and adjust URLs below.)

- [ ] **Step 7.1: Confirm `repro-issue-9.html` exists at the repo root**

```bash
ls repro-issue-9.html
```

If the file is missing (e.g. a fresh checkout), reproduce it from the conversation that generated this plan — it stages the four-block XML into `localStorage['fll-vr-blockly-xml']`, then redirects to `index.html`.

- [ ] **Step 7.2: Open in Chrome**

```bash
open -a "Google Chrome" "http://localhost:8787/repro-issue-9.html"
```

- [ ] **Step 7.3: Click "Stage repro & open app"**

The page should redirect to `/` (the main app) with the Blocks tab open and the four-block program loaded.

- [ ] **Step 7.4: Press Run**

Expected (after fix): robot pivots **right** (CW from above, math-y-up), and after rotating roughly 90° the motor stops because the wait_until releases and the program ends.

Pre-fix (for contrast): robot moves a frame or two and stops.

- [ ] **Step 7.5: If the manual verification fails**

Don't soften the integration test. Diagnose:
- Is `sim.getYaw()` being called from the wait condition? (Open DevTools, set a breakpoint in `getYaw`.)
- Does motor A's PORT_CONFIG role still resolve to `drive-left`? (`js/simulator.js:39` — should still be `{ kind: 'motor', role: 'drive-left' }`.)
- Did the heading sign convention silently flip? Re-read CLAUDE.md's "Internal coords are math y-up" section.

Return to Phase 1 of `superpowers:systematic-debugging` if needed.

---

## Task 8: Cleanup — remove the temporary repro staging page

**Files:**
- Delete: `repro-issue-9.html`

- [ ] **Step 8.1: Verify the staging page is no longer needed**

The page exists at the repo root only as a reproduction aid for this issue. It is not committed and should not survive the fix.

- [ ] **Step 8.2: Delete it**

```bash
rm repro-issue-9.html
```

- [ ] **Step 8.3: Confirm `git status` shows a clean tree (apart from this plan and any unrelated WIP)**

```bash
git status --short
```

Expected: no entry for `repro-issue-9.html`. The file was never tracked.

(No commit needed — nothing tracked was changed.)

---

## Self-review notes

- **Spec coverage:** All three Blockly surfaces (resetYaw block, yaw read), both Python surfaces (`reset_yaw`, `tilt_angles`), the sim's yaw plumbing (state, public methods, snapshot field, _execCmd case, reset hook), and Monaco hover docs are touched. Pitch/roll legitimately stay zero (sim is 2D) and are pinned by the Task 3 test. The "set yaw axis" stub (`flippermoresensors_setOrientation` at `js/blockly_config.js:1642`) is intentionally **not** in scope — it requires a "yaw face" 3D concept the 2D sim doesn't model, and it isn't implicated by issue #9.
- **Placeholders:** None — every step has explicit file paths, exact code, and exact commands.
- **Type consistency:** Yaw lives in two units. Internal JS API (`getYaw`, `resetYaw`) is degrees, floats. Sensor snapshot (`yaw_dDeg`) is integer deci-degrees, rounded. Python `tilt_angles` returns deci-degrees (matching LEGO docs). Python `reset_yaw(angle)` takes degrees (matching LEGO docs) and converts to deci-degrees at the bridge boundary. The two LEGO surfaces (Python and Blockly) agree on the source of truth (`_yawZeroHeading_deg`) even though they read it through different scales.
- **Test/impl alignment:** The seed values in `tests/js/sensors/gyro.test.js` assume `createSim()` returns a sim with `robot.heading === 90` at construction time (matches `js/simulator.js:122`). The first test calls `sim.reset()` to lock that in explicitly; subsequent tests assume `_yawZeroHeading_deg` was captured by the constructor and equals 90.
