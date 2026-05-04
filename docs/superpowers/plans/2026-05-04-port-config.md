# Port Configuration Visibility & Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a canonical 6-port robot configuration that's both visible in the UI and enforced at runtime, replacing today's silently-ignored port arguments.

**Architecture:** Both runtimes (Python in `py/spike_bridge.py` and JavaScript in `js/simulator.js`) hold an identical hardcoded `PORT_CONFIG` map. A Python-side `_require(port, kind, op)` helper raises `RuntimeError` whenever an API call targets a port whose configured device kind doesn't match. The right-side panel is restructured into a Hub panel showing each port's device and live reading.

**Tech Stack:** MicroPython (PyScript worker), vanilla JavaScript, HTML/CSS, Blockly 10. Tests are CPython `unittest` (`tests/py/run.py`) and Node.js (`tests/js/run.js`).

**Spec:** [docs/superpowers/specs/2026-05-04-port-config-design.md](../specs/2026-05-04-port-config-design.md)

**Default port configuration (locked by spec):**
| Port | Device          | Notes              |
|------|-----------------|--------------------|
| A    | motor           | left drive wheel   |
| B    | motor           | right drive wheel  |
| C    | empty           |                    |
| D    | empty           |                    |
| E    | color sensor    |                    |
| F    | distance sensor |                    |

---

## File map

**Modify:**
- `py/spike_bridge.py` — add `_PORT_CONFIG` + `_require`, apply at every port-taking entry point
- `js/simulator.js` — add `PORT_CONFIG`, JS-side guard in `_execCmd`, rewrite `_updateSensorPanel`, drop unused `colorPort`/`distancePort` fields
- `js/blockly_config.js` — restrict motor port dropdown and pair selector to valid motor ports
- `index.html` — replace `#sensor-panel` block with Hub panel structure
- `css/style.css` — add port row styles, dimmed empty ports
- `tests/py/test_motor.py` — switch motor tests off ports C/D/E/F (now invalid) onto A/B
- `tests/py/run.py` — register the new `test_validation` module

**Create:**
- `tests/py/test_validation.py` — wrong-port `RuntimeError` cases
- `tests/js/state/port-config.test.js` — JS-side `_execCmd` guard test

---

## Task 1: Define `_PORT_CONFIG` and `_require` helper (Python)

Adds the configuration constant and validator helper without applying them yet. Pure additive change.

**Files:**
- Modify: `py/spike_bridge.py:67` (after `_COLOR_INT_MAP`, before `# ── Phase 3` block)
- Create: `tests/py/test_validation.py`
- Modify: `tests/py/run.py:17-25`

- [ ] **Step 1: Create `tests/py/test_validation.py` with the failing test for the helper**

```python
"""Tests for port configuration validation."""
import unittest
import mock_js
import spike_bridge as sb


class TestPortConfig(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_port_config_default(self):
        self.assertEqual(sb._PORT_CONFIG['A'], 'motor')
        self.assertEqual(sb._PORT_CONFIG['B'], 'motor')
        self.assertEqual(sb._PORT_CONFIG['C'], 'empty')
        self.assertEqual(sb._PORT_CONFIG['D'], 'empty')
        self.assertEqual(sb._PORT_CONFIG['E'], 'color_sensor')
        self.assertEqual(sb._PORT_CONFIG['F'], 'distance_sensor')

    def test_require_passes_for_matching_kind(self):
        self.assertEqual(sb._require('A', 'motor', 'motor.run'), 'A')
        self.assertEqual(sb._require(sb.port.E, 'color_sensor', 'color_sensor.color'), 'E')

    def test_require_raises_for_empty_port(self):
        with self.assertRaises(RuntimeError) as cx:
            sb._require('C', 'motor', 'motor.run')
        self.assertIn('port C has no motor', str(cx.exception))
        self.assertIn('configured: empty', str(cx.exception))

    def test_require_raises_for_wrong_kind(self):
        with self.assertRaises(RuntimeError) as cx:
            sb._require('F', 'color_sensor', 'color_sensor.color')
        self.assertIn('port F has no color sensor', str(cx.exception))
        self.assertIn('configured: distance_sensor', str(cx.exception))

    def test_require_accepts_int_port(self):
        # port.A = 0
        self.assertEqual(sb._require(0, 'motor', 'motor.run'), 'A')
        # port.E = 4
        with self.assertRaises(RuntimeError):
            sb._require(4, 'motor', 'motor.run')


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Register the new test module in `tests/py/run.py`**

Replace lines 17-26 with:

```python
import test_motor_pair
import test_motor
import test_hub
import test_wait
import test_print
import test_validation

loader = unittest.TestLoader()
suite  = unittest.TestSuite()
for mod in [test_motor_pair, test_motor, test_hub, test_wait, test_print, test_validation]:
    suite.addTests(loader.loadTestsFromModule(mod))
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `python3 tests/py/run.py`
Expected: 5 new test failures in `TestPortConfig`, all reporting `AttributeError: module 'spike_bridge' has no attribute '_PORT_CONFIG'` (or `_require`).

- [ ] **Step 4: Add `_PORT_CONFIG` and `_require` to `spike_bridge.py`**

Insert after `_COLOR_INT_MAP` definition (between `py/spike_bridge.py:67` and the `# ── Phase 3` comment, around line 69):

```python
# ── Port configuration ───────────────────────────────────────────────────────
# Canonical robot wiring. The simulator's drawn robot has 2 wheels (motors A/B)
# plus a color sensor and distance sensor; ports C and D are unwired in the
# default config. Customization will arrive as a separate feature.
_PORT_CONFIG = {
    'A': 'motor',
    'B': 'motor',
    'C': 'empty',
    'D': 'empty',
    'E': 'color_sensor',
    'F': 'distance_sensor',
}


def _require(port, expected_kind, op):
    """Validate that `port` has `expected_kind` plugged in. Raises RuntimeError otherwise.
    Returns the wire-letter form of the port for downstream use."""
    letter = _port_id(port)
    actual = _PORT_CONFIG.get(letter, 'empty')
    if actual != expected_kind:
        readable = expected_kind.replace('_', ' ')
        raise RuntimeError(
            "port " + letter + " has no " + readable +
            " (configured: " + (actual or 'empty') + ")"
        )
    return letter
```

(`_require` is defined *after* `_port_id` — `_port_id` is at `py/spike_bridge.py:93`, so place `_require` below it. If you placed `_PORT_CONFIG` before `_port_id`, that's fine — but `_require` must come after.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `python3 tests/py/run.py`
Expected: All `TestPortConfig` tests pass. Existing tests still pass (no enforcement applied yet).

- [ ] **Step 6: Commit**

```bash
git add py/spike_bridge.py tests/py/test_validation.py tests/py/run.py
git commit -m "feat: add _PORT_CONFIG and _require helper to spike_bridge"
```

---

## Task 2: Apply validation in `motor` module and migrate existing tests

Wraps every `motor.*` entry point with `_require(port, 'motor', ...)`. Existing tests use ports C/D/E/F for motor calls — those need to migrate to A/B before validation lands or they'll start failing.

**Files:**
- Modify: `tests/py/test_motor.py` (multiple lines — see step 1)
- Modify: `py/spike_bridge.py:123-169` (`motor` class)
- Modify: `tests/py/test_validation.py` (add motor wrong-port cases)

- [ ] **Step 1: Migrate ports in `tests/py/test_motor.py`**

The existing tests freely use ports C/D/E/F for motor commands; under the new config these are invalid. Update only the *port string*, not the test logic.

Edit `tests/py/test_motor.py`:

| Line(s) | Find | Replace |
|---------|------|---------|
| 23-25   | `sb.motor.run_for_time('C', 1000, velocity=300)` and `'port': 'C'` | `'A'` in both places |
| 29-30   | `sb.motor.run_for_time('D', 500)` | `'A'` |
| 33-35   | `sb.motor.run('E', velocity=750)` and `'port': 'E'` | `'A'` |
| 43-46   | `sb.motor.run_to_absolute_position('F', 90, ...)` and `'port': 'F'` | `'A'` |
| 79-80   | `sb.motor.run_for_degrees(2, 360)  # 2 == port.C` and `'port': 'C'` | port `1` and `'B'` (1 == port.B) — comment update too |

Do not change `test_velocity_returns_int`, `test_absolute_position_returns_int`, `test_relative_position_returns_int`, `test_reset_relative_position_no_command`, `test_int_port_constant_translates_to_letter`, `test_letter_port_passes_through`, `test_motor_constants`, `test_port_constants_are_ints`, `test_multiple_commands_accumulate` — they already use A or B.

- [ ] **Step 2: Run tests to verify they still pass before behaviour change**

Run: `python3 tests/py/run.py`
Expected: All tests pass — this was a pure rename of port strings; nothing changed semantically yet.

- [ ] **Step 3: Add failing wrong-port motor tests to `tests/py/test_validation.py`**

Append to `TestPortConfig` class:

```python
    def test_motor_run_for_degrees_on_empty_port_raises(self):
        with self.assertRaises(RuntimeError) as cx:
            sb.motor.run_for_degrees('C', 360)
        self.assertIn('port C has no motor', str(cx.exception))

    def test_motor_run_on_sensor_port_raises(self):
        with self.assertRaises(RuntimeError) as cx:
            sb.motor.run('E', velocity=500)
        self.assertIn('port E has no motor', str(cx.exception))
        self.assertIn('configured: color_sensor', str(cx.exception))

    def test_motor_stop_on_empty_port_raises(self):
        with self.assertRaises(RuntimeError):
            sb.motor.stop('D')

    def test_motor_run_for_time_on_distance_port_raises(self):
        with self.assertRaises(RuntimeError) as cx:
            sb.motor.run_for_time('F', 1000)
        self.assertIn('configured: distance_sensor', str(cx.exception))

    def test_motor_run_to_absolute_position_validates(self):
        with self.assertRaises(RuntimeError):
            sb.motor.run_to_absolute_position('C', 90)

    def test_motor_run_to_relative_position_validates(self):
        with self.assertRaises(RuntimeError):
            sb.motor.run_to_relative_position('E', 90)

    def test_motor_absolute_position_on_empty_port_raises(self):
        with self.assertRaises(RuntimeError):
            sb.motor.absolute_position('C')

    def test_motor_relative_position_on_sensor_port_raises(self):
        with self.assertRaises(RuntimeError):
            sb.motor.relative_position('E')

    def test_motor_velocity_on_empty_port_raises(self):
        with self.assertRaises(RuntimeError):
            sb.motor.velocity('D')

    def test_motor_reset_relative_position_validates(self):
        with self.assertRaises(RuntimeError):
            sb.motor.reset_relative_position('F', 0)

    def test_motor_set_duty_cycle_validates(self):
        with self.assertRaises(RuntimeError):
            sb.motor.set_duty_cycle('C', 50)

    def test_motor_get_duty_cycle_validates(self):
        with self.assertRaises(RuntimeError):
            sb.motor.get_duty_cycle('E')

    def test_motor_run_on_motor_port_succeeds(self):
        # Sanity check: valid calls still work.
        sb.motor.run_for_degrees('A', 360)
        sb.motor.run_for_degrees('B', 180)
        cmds = mock_js.bridge_mock.all()
        self.assertEqual(len(cmds), 2)
```

- [ ] **Step 4: Run tests to verify the new ones fail**

Run: `python3 tests/py/run.py`
Expected: 12 new failures — calls succeed instead of raising.

- [ ] **Step 5: Apply `_require` in the `motor` class**

Replace the `class motor:` body in `py/spike_bridge.py:102-169` so each method validates first. Replace each method as follows (constants block at top stays unchanged):

```python
    @staticmethod
    def run_for_degrees(port, degrees, velocity=360, *, stop=1, acceleration=1000, deceleration=1000):
        letter = _require(port, 'motor', 'motor.run_for_degrees')
        return _bridge_call({'type': 'motor_degrees', 'port': letter, 'degrees': degrees, 'velocity': velocity})

    @staticmethod
    def run_for_time(port, duration, velocity=360, *, stop=1, acceleration=1000, deceleration=1000):
        letter = _require(port, 'motor', 'motor.run_for_time')
        return _bridge_call({'type': 'motor_time', 'port': letter, 'time_ms': duration, 'velocity': velocity})

    @staticmethod
    def run_to_absolute_position(port, position, velocity=360, *, direction=2, stop=1, acceleration=1000, deceleration=1000):
        letter = _require(port, 'motor', 'motor.run_to_absolute_position')
        return _bridge_call({'type': 'motor_degrees', 'port': letter, 'degrees': int(position), 'velocity': velocity})

    @staticmethod
    def run_to_relative_position(port, position, velocity=360, *, stop=1, acceleration=1000, deceleration=1000):
        letter = _require(port, 'motor', 'motor.run_to_relative_position')
        return _bridge_call({'type': 'motor_degrees', 'port': letter, 'degrees': int(position), 'velocity': velocity})

    @staticmethod
    def run(port, velocity=360, *, acceleration=1000):
        letter = _require(port, 'motor', 'motor.run')
        return _bridge_call({'type': 'motor_run', 'port': letter, 'velocity': velocity})

    @staticmethod
    def stop(port, *, stop=1):
        letter = _require(port, 'motor', 'motor.stop')
        return _bridge_call({'type': 'motor_stop', 'port': letter})

    @staticmethod
    def velocity(port):
        _require(port, 'motor', 'motor.velocity')
        return 0

    @staticmethod
    def absolute_position(port):
        letter = _require(port, 'motor', 'motor.absolute_position')
        return int((_state.get('motors') or {}).get(letter, 0))

    @staticmethod
    def relative_position(port):
        letter = _require(port, 'motor', 'motor.relative_position')
        return int((_state.get('motors') or {}).get(letter, 0))

    @staticmethod
    def reset_relative_position(port, position=0):
        _require(port, 'motor', 'motor.reset_relative_position')
        return _NoopAwaitable()

    @staticmethod
    def get_duty_cycle(port):
        _require(port, 'motor', 'motor.get_duty_cycle')
        return 0

    @staticmethod
    def set_duty_cycle(port, pwm):
        _require(port, 'motor', 'motor.set_duty_cycle')
        return _NoopAwaitable()
```

- [ ] **Step 6: Run tests to verify all pass**

Run: `python3 tests/py/run.py`
Expected: All tests pass, including the 12 new validation cases.

- [ ] **Step 7: Commit**

```bash
git add py/spike_bridge.py tests/py/test_motor.py tests/py/test_validation.py
git commit -m "feat: enforce motor port wiring; migrate motor tests to A/B"
```

---

## Task 3: Apply validation in sensor modules

Adds `_require` to `color_sensor`, `distance_sensor`, and `force_sensor`.

**Files:**
- Modify: `py/spike_bridge.py:225-271` (`color_sensor`, `distance_sensor`, `force_sensor` classes)
- Modify: `tests/py/test_validation.py`

- [ ] **Step 1: Add failing sensor validation tests to `tests/py/test_validation.py`**

Append to `TestPortConfig`:

```python
    # ── Color sensor ────────────────────────────────────────────
    def test_color_sensor_color_on_motor_port_raises(self):
        with self.assertRaises(RuntimeError) as cx:
            sb.color_sensor.color('A')
        self.assertIn('port A has no color sensor', str(cx.exception))
        self.assertIn('configured: motor', str(cx.exception))

    def test_color_sensor_reflection_on_distance_port_raises(self):
        with self.assertRaises(RuntimeError):
            sb.color_sensor.reflection('F')

    def test_color_sensor_rgbi_on_empty_port_raises(self):
        with self.assertRaises(RuntimeError):
            sb.color_sensor.rgbi('C')

    def test_color_sensor_color_on_color_port_succeeds(self):
        sb._state['color'] = 'red'
        self.assertEqual(sb.color_sensor.color('E'), 9)  # red == 9 in _COLOR_INT_MAP

    # ── Distance sensor ─────────────────────────────────────────
    def test_distance_sensor_distance_on_color_port_raises(self):
        with self.assertRaises(RuntimeError) as cx:
            sb.distance_sensor.distance('E')
        self.assertIn('configured: color_sensor', str(cx.exception))

    def test_distance_sensor_distance_on_motor_port_raises(self):
        with self.assertRaises(RuntimeError):
            sb.distance_sensor.distance('B')

    def test_distance_sensor_distance_on_distance_port_succeeds(self):
        sb._state['distance_mm'] = 250
        self.assertEqual(sb.distance_sensor.distance('F'), 250)

    def test_distance_sensor_get_pixel_validates(self):
        with self.assertRaises(RuntimeError):
            sb.distance_sensor.get_pixel('A', 0, 0)

    def test_distance_sensor_set_pixel_validates(self):
        with self.assertRaises(RuntimeError):
            sb.distance_sensor.set_pixel('E', 0, 0, 50)

    def test_distance_sensor_show_validates(self):
        with self.assertRaises(RuntimeError):
            sb.distance_sensor.show('C', [0]*16)

    def test_distance_sensor_clear_validates(self):
        with self.assertRaises(RuntimeError):
            sb.distance_sensor.clear('A')

    # ── Force sensor (no force sensor in default config) ────────
    def test_force_sensor_force_always_raises(self):
        for p in ('A', 'B', 'C', 'D', 'E', 'F'):
            with self.assertRaises(RuntimeError):
                sb.force_sensor.force(p)

    def test_force_sensor_pressed_always_raises(self):
        with self.assertRaises(RuntimeError):
            sb.force_sensor.pressed('A')

    def test_force_sensor_raw_always_raises(self):
        with self.assertRaises(RuntimeError):
            sb.force_sensor.raw('B')
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `python3 tests/py/run.py`
Expected: 14 new failures (no exception raised; some `equals` assertions also fail).

- [ ] **Step 3: Apply `_require` in sensor classes**

Replace `class color_sensor:` body (`py/spike_bridge.py:225-237`):

```python
class color_sensor:
    @staticmethod
    def color(port):
        _require(port, 'color_sensor', 'color_sensor.color')
        return int(_COLOR_INT_MAP.get(str(_state.get('color', 'none')), -1))

    @staticmethod
    def reflection(port):
        _require(port, 'color_sensor', 'color_sensor.reflection')
        return int(_state.get('reflection', 50))

    @staticmethod
    def rgbi(port):
        _require(port, 'color_sensor', 'color_sensor.rgbi')
        raw = _state.get('rgb', [128, 128, 128])
        return (int(raw[0]), int(raw[1]), int(raw[2]), 0)
```

Replace `class distance_sensor:` body (`py/spike_bridge.py:240-260`):

```python
class distance_sensor:
    @staticmethod
    def distance(port):
        _require(port, 'distance_sensor', 'distance_sensor.distance')
        v = int(_state.get('distance_mm', 300))
        return v if v < 9999 else -1

    @staticmethod
    def clear(port):
        _require(port, 'distance_sensor', 'distance_sensor.clear')

    @staticmethod
    def get_pixel(port, x, y):
        _require(port, 'distance_sensor', 'distance_sensor.get_pixel')
        return 0

    @staticmethod
    def set_pixel(port, x, y, intensity):
        _require(port, 'distance_sensor', 'distance_sensor.set_pixel')

    @staticmethod
    def show(port, pixels):
        _require(port, 'distance_sensor', 'distance_sensor.show')
```

Replace `class force_sensor:` body (`py/spike_bridge.py:263-271`):

```python
class force_sensor:
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

- [ ] **Step 4: Run tests to verify all pass**

Run: `python3 tests/py/run.py`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add py/spike_bridge.py tests/py/test_validation.py
git commit -m "feat: enforce sensor port wiring (color, distance, force)"
```

---

## Task 4: Apply validation in `motor_pair`

Pairing must verify both `left` and `right` are motor ports.

**Files:**
- Modify: `py/spike_bridge.py:172-222` (`motor_pair` class — only the `pair` method changes)
- Modify: `tests/py/test_validation.py`

- [ ] **Step 1: Add failing pair validation tests**

Append to `tests/py/test_validation.py`:

```python
    # ── motor_pair ──────────────────────────────────────────────
    def test_motor_pair_pair_with_two_motors_succeeds(self):
        sb.motor_pair.pair(sb.motor_pair.PAIR_1, 'A', 'B')
        cmds = mock_js.bridge_mock.all()
        self.assertEqual(len(cmds), 1)
        self.assertEqual(cmds[0]['type'], 'pair')
        self.assertEqual(cmds[0]['left'], 'A')
        self.assertEqual(cmds[0]['right'], 'B')

    def test_motor_pair_pair_with_sensor_port_left_raises(self):
        with self.assertRaises(RuntimeError) as cx:
            sb.motor_pair.pair(sb.motor_pair.PAIR_1, 'E', 'B')
        self.assertIn('port E has no motor', str(cx.exception))

    def test_motor_pair_pair_with_sensor_port_right_raises(self):
        with self.assertRaises(RuntimeError) as cx:
            sb.motor_pair.pair(sb.motor_pair.PAIR_1, 'A', 'F')
        self.assertIn('port F has no motor', str(cx.exception))

    def test_motor_pair_pair_with_empty_port_raises(self):
        with self.assertRaises(RuntimeError):
            sb.motor_pair.pair(sb.motor_pair.PAIR_1, 'C', 'D')

    def test_motor_pair_pair_int_ports(self):
        # port.A=0, port.B=1
        sb.motor_pair.pair(sb.motor_pair.PAIR_1, 0, 1)
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['left'], 'A')
        self.assertEqual(cmd['right'], 'B')
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `python3 tests/py/run.py`
Expected: 3 new failures (tests where pair should raise but currently succeeds). The two success-path tests should already pass.

- [ ] **Step 3: Apply `_require` in `motor_pair.pair`**

Replace `motor_pair.pair` (`py/spike_bridge.py:175-178`):

```python
    @staticmethod
    def pair(pair, left_motor, right_motor):
        left_letter  = _require(left_motor,  'motor', 'motor_pair.pair (left)')
        right_letter = _require(right_motor, 'motor', 'motor_pair.pair (right)')
        return _bridge_call({'type': 'pair', 'pair_id': pair,
                             'left': left_letter, 'right': right_letter})
```

The `move`, `move_for_*`, `move_tank*`, `stop`, `unpair` methods take `pair_id` (an integer like `PAIR_1`), not port arguments — they don't need `_require` because the port check happens at `pair()` time.

- [ ] **Step 4: Run tests to verify all pass**

Run: `python3 tests/py/run.py`
Expected: All tests pass — including the existing `test_motor_pair.py` suite (which already uses A/B).

- [ ] **Step 5: Commit**

```bash
git add py/spike_bridge.py tests/py/test_validation.py
git commit -m "feat: enforce motor_pair.pair requires both ports to be motors"
```

---

## Task 5: Add `PORT_CONFIG` and JS-side guard in `_execCmd`

Mirrors the configuration in JavaScript and adds a defensive check for any motor command that lands in `_execCmd` (covers Blockly's direct calls into `window.sim`).

**Files:**
- Modify: `js/simulator.js:22-32` (constants block — add `PORT_CONFIG`)
- Modify: `js/simulator.js:433-529` (`_execCmd` method — add guard)
- Create: `tests/js/state/port-config.test.js`
- Modify: `tests/js/run.js:58-72` (register the new suite)

- [ ] **Step 1: Create `tests/js/state/port-config.test.js` with failing tests**

```javascript
'use strict';

module.exports = [
  {
    name: 'PORT_CONFIG is exposed and matches default wiring',
    fn: async (createSim, assert) => {
      const sim = createSim();
      const ctx = sim.constructor; // RobotSimulator class — but config is a const
      // PORT_CONFIG lives at module scope; expose via window or read via sim instance
      assert.strictEqual(sim._portConfig.A.kind, 'motor');
      assert.strictEqual(sim._portConfig.A.role, 'drive-left');
      assert.strictEqual(sim._portConfig.B.kind, 'motor');
      assert.strictEqual(sim._portConfig.B.role, 'drive-right');
      assert.strictEqual(sim._portConfig.C.kind, 'empty');
      assert.strictEqual(sim._portConfig.D.kind, 'empty');
      assert.strictEqual(sim._portConfig.E.kind, 'color_sensor');
      assert.strictEqual(sim._portConfig.F.kind, 'distance_sensor');
    },
  },
  {
    name: '_execCmd throws on motor command targeting empty port',
    fn: async (createSim, assert) => {
      const sim = createSim();
      sim.isRunning = true;
      let threw = null;
      try {
        await sim._execCmd({ type: 'motor_run', port: 'C', velocity: 360 });
      } catch (e) {
        threw = e;
      }
      assert.ok(threw, 'expected throw');
      assert.match(threw.message, /port C has no motor/);
      assert.match(threw.message, /configured: empty/);
    },
  },
  {
    name: '_execCmd throws on motor command targeting sensor port',
    fn: async (createSim, assert) => {
      const sim = createSim();
      sim.isRunning = true;
      let threw = null;
      try {
        await sim._execCmd({ type: 'motor_degrees', port: 'E', degrees: 360, velocity: 500 });
      } catch (e) {
        threw = e;
      }
      assert.ok(threw, 'expected throw');
      assert.match(threw.message, /port E has no motor/);
      assert.match(threw.message, /configured: color_sensor/);
    },
  },
  {
    name: '_execCmd succeeds on motor command targeting motor port A',
    fn: async (createSim, assert) => {
      const sim = createSim();
      sim.isRunning = true;
      // Pair A as left drive so _animateSingleMotor takes the tank path.
      await sim._execCmd({ type: 'pair', pair_id: 0, left: 'A', right: 'B' });
      // motor_degrees on A should not throw
      await sim._execCmd({ type: 'motor_degrees', port: 'A', degrees: 90, velocity: 500 });
      // No assertion on movement — we're verifying no throw.
    },
  },
  {
    name: '_execCmd does not validate non-port commands',
    fn: async (createSim, assert) => {
      const sim = createSim();
      sim.isRunning = true;
      // wait/print/hub_display etc. have no port — must not throw
      await sim._execCmd({ type: 'wait', ms: 0 });
      await sim._execCmd({ type: 'print', text: 'hi' });
    },
  },
];
```

(Tests use `sim._portConfig` so the simulator must expose the config on the instance — handled in step 3.)

- [ ] **Step 2: Register the new suite in `tests/js/run.js`**

Insert into `SUITES` array at `tests/js/run.js:65` (after `state/sensor-state`):

```javascript
    ['state/sensor-state',        './state/sensor-state.test.js'],
    ['state/port-config',         './state/port-config.test.js'],
    ['bridge/protocol',           './bridge/bridge-protocol.test.js'],
```

(`tests/js/mocks/window.js` already exposes `appendOutput` as a no-op, so the print-path branch in `_execCmd` is safe to exercise from tests.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `node tests/js/run.js`
Expected: All 5 new `state/port-config` tests fail — `_portConfig` undefined; throws missing.

- [ ] **Step 4: Add `PORT_CONFIG` constant in `js/simulator.js`**

Insert after the constants block at `js/simulator.js:32` (after `MM_PER_MS_100`):

```javascript
// ── Port configuration ──────────────────────────────────────────────────────
// Mirror of py/spike_bridge.py _PORT_CONFIG. Customization will replace this
// constant with mutable per-instance state and a config-update worker message.
const PORT_CONFIG = {
  A: { kind: 'motor',           role: 'drive-left'  },
  B: { kind: 'motor',           role: 'drive-right' },
  C: { kind: 'empty' },
  D: { kind: 'empty' },
  E: { kind: 'color_sensor' },
  F: { kind: 'distance_sensor' },
};

// Maps a command type to the port `kind` it requires. Only motor commands
// route through _execCmd; sensor reads are direct getters and validate Python-side.
const PORT_KIND_FOR_CMD = {
  motor_degrees: 'motor',
  motor_time:    'motor',
  motor_run:     'motor',
  motor_stop:    'motor',
};
```

- [ ] **Step 5: Expose `PORT_CONFIG` on the simulator instance**

Inside `RobotSimulator` constructor, after `this.pairMap = {};` at `js/simulator.js:98`:

```javascript
    this._portConfig = PORT_CONFIG;
```

- [ ] **Step 6: Add the guard inside `_execCmd`**

Insert at the very top of `async _execCmd(cmd) {` body (`js/simulator.js:434`, before the `switch`):

```javascript
    const requiredKind = PORT_KIND_FOR_CMD[cmd.type];
    if (requiredKind && cmd.port !== undefined) {
      const cfg = PORT_CONFIG[cmd.port];
      const actualKind = cfg ? cfg.kind : 'empty';
      if (actualKind !== requiredKind) {
        throw new Error(
          `port ${cmd.port} has no ${requiredKind} ` +
          `(configured: ${actualKind})`
        );
      }
    }
```

- [ ] **Step 7: Run tests to verify all pass**

Run: `node tests/js/run.js`
Expected: All `state/port-config` tests pass; existing suites unaffected.

- [ ] **Step 8: Commit**

```bash
git add js/simulator.js tests/js/state/port-config.test.js tests/js/run.js tests/js/mocks/window.js
git commit -m "feat: mirror port config in simulator.js and guard _execCmd"
```

---

## Task 6: Restructure HTML for Hub panel

Replace the existing sensor panel block with a Hub panel that contains a Pose section (X/Y/heading) and a Ports section (six rows).

**Files:**
- Modify: `index.html:88-111` (the `<div id="sensor-panel">` block)

- [ ] **Step 1: Replace the sensor panel block in `index.html`**

Find lines 88-111 (the `<div id="sensor-panel">…</div>` block) and replace with:

```html
      <!-- Hub panel: pose + per-port live state -->
      <div id="sensor-panel">
        <h3>Hub</h3>

        <div class="sensor-row">
          <span class="sensor-label">X</span>
          <span class="sensor-value" id="sp-x">—</span>
        </div>
        <div class="sensor-row">
          <span class="sensor-label">Y</span>
          <span class="sensor-value" id="sp-y">—</span>
        </div>
        <div class="sensor-row">
          <span class="sensor-label">Heading</span>
          <span class="sensor-value" id="sp-heading">—</span>
        </div>

        <h4 class="port-header">Ports</h4>
        <div class="port-row" id="port-row-A">
          <span class="port-letter">A</span>
          <span class="port-device">motor (L)</span>
          <span class="port-value" id="port-value-A">0°</span>
        </div>
        <div class="port-row" id="port-row-B">
          <span class="port-letter">B</span>
          <span class="port-device">motor (R)</span>
          <span class="port-value" id="port-value-B">0°</span>
        </div>
        <div class="port-row empty" id="port-row-C">
          <span class="port-letter">C</span>
          <span class="port-device">—</span>
          <span class="port-value" id="port-value-C"></span>
        </div>
        <div class="port-row empty" id="port-row-D">
          <span class="port-letter">D</span>
          <span class="port-device">—</span>
          <span class="port-value" id="port-value-D"></span>
        </div>
        <div class="port-row" id="port-row-E">
          <span class="port-letter">E</span>
          <span class="port-device">color</span>
          <span class="port-value" id="port-value-E">none</span>
          <span class="sensor-color-swatch" id="color-swatch"></span>
        </div>
        <div class="port-row" id="port-row-F">
          <span class="port-letter">F</span>
          <span class="port-device">distance</span>
          <span class="port-value" id="port-value-F">—</span>
        </div>
      </div>
```

The element IDs `sp-x`, `sp-y`, `sp-heading`, `color-swatch` are preserved from the old markup so unrelated code (e.g. tests on `_updateSensorPanel`) keeps reading them. The legacy `sp-color` and `sp-dist` IDs are removed because their values now live on `port-value-E` / `port-value-F`.

- [ ] **Step 2: Manual verification**

Start the dev server and load the page:

```bash
python3 -m http.server 8787
```

Open http://localhost:8787 — the right panel should now read "HUB" with X/Y/Heading rows on top, then a "Ports" header, then six `A B C D E F` rows. C and D should look like placeholders (next task adds the dimming).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: restructure sensor panel as Hub panel with ports section"
```

---

## Task 7: Implement Hub panel rendering in `simulator.js`

Updates `_updateSensorPanel` to populate the new port rows from robot state.

**Files:**
- Modify: `js/simulator.js:393-413` (`_updateSensorPanel` method)
- Modify: `js/simulator.js:71-85` (`makeRobotState` — drop `colorPort` / `distancePort`)

- [ ] **Step 1: Drop unused fields from `makeRobotState`**

Replace `js/simulator.js:71-85`:

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

(`colorPort` and `distancePort` removed — they were unread.)

- [ ] **Step 2: Rewrite `_updateSensorPanel`**

Replace the method at `js/simulator.js:393-413`:

```javascript
  _updateSensorPanel() {
    const r = this.robot;
    const s = r.sensors;
    const el = id => document.getElementById(id);
    const set = (elId, val) => { const e = el(elId); if (e) e.textContent = val; };

    if (!el('sensor-panel')) return;

    // Pose section
    const deg = (((r.heading % 360) + 360) % 360);
    set('sp-x',       (r.x / 10).toFixed(1) + ' cm');
    set('sp-y',       (r.y / 10).toFixed(1) + ' cm');
    set('sp-heading', deg.toFixed(0) + '°');

    // Port rows. PORT_CONFIG is module-scope; use this._portConfig.
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

    const swatch = el('color-swatch');
    if (swatch) {
      const c = COLOR_MAP[s.colorValue];
      swatch.style.background = c || 'transparent';
    }
  }
```

- [ ] **Step 3: Run JS tests to verify nothing regressed**

Run: `node tests/js/run.js`
Expected: All tests pass. (`sp-color` and `sp-dist` were only read inside `simulator.js`; no tests reference them, so removing those `set()` calls in the rewrite is safe.)

- [ ] **Step 4: Manual UI verification**

Run: `python3 -m http.server 8787`. Open http://localhost:8787. Run a sample tank-move program, e.g.:

```python
from hub import port
import motor_pair, motor, runloop

async def main():
    motor_pair.pair(motor_pair.PAIR_1, motor.A, motor.B)
    await motor_pair.move_for_degrees(motor_pair.PAIR_1, 720, 0, velocity=500)

runloop.run(main())
```

Confirm: `port-value-A` and `port-value-B` update during the run; `port-value-E` shows the colour name when the robot crosses a coloured zone; `port-value-F` updates as it approaches mission boxes.

Then run a deliberately-wrong-port program and confirm the console shows a `RuntimeError`:

```python
from hub import port
import motor

motor.run(port.C)
```

Expected console line: `RuntimeError: port C has no motor (configured: empty)`

- [ ] **Step 5: Commit**

```bash
git add js/simulator.js
git commit -m "feat: render Hub panel ports from PORT_CONFIG"
```

---

## Task 8: Style the Hub panel (CSS)

Adds rules for the Ports header, port rows, and the dimmed empty-port state.

**Files:**
- Modify: `css/style.css:540-601` (sensor panel block — extend, don't replace)

- [ ] **Step 1: Append port row styles after `.sensor-color-swatch` (around `css/style.css:601`)**

Add:

```css
/* ── Hub panel: ports section ──────────────────────────── */
.port-header {
  font-family: var(--font-ui);
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--cyan);
  margin: 10px 0 4px 0;
  padding-top: 8px;
  padding-bottom: 4px;
  border-top: 1px solid var(--border);
}

.port-row {
  display: grid;
  grid-template-columns: 18px 1fr auto auto;
  gap: 6px;
  align-items: center;
  padding: 2px 0;
}

.port-letter {
  font-family: var(--font-code);
  font-size: 10px;
  font-weight: 700;
  color: var(--text-dim);
  text-align: center;
}

.port-device {
  font-family: var(--font-ui);
  font-size: 10px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.port-value {
  font-family: var(--font-code);
  font-size: 11px;
  color: var(--amber);
  text-align: right;
}

.port-row.empty .port-letter,
.port-row.empty .port-device,
.port-row.empty .port-value {
  opacity: 0.35;
}
```

- [ ] **Step 2: Manual verification**

Reload http://localhost:8787. Confirm:
- "Ports" header is small and uppercase, separated from pose section by a divider line
- A/B/E/F rows are full-opacity
- C/D rows are visibly dimmed (~35% opacity)
- Color swatch on row E is right-aligned next to the value

- [ ] **Step 3: Commit**

```bash
git add css/style.css
git commit -m "style: dim empty-port rows in Hub panel"
```

---

## Task 9: Restrict Blockly motor port dropdown to A/B

The simulator now raises on motor commands targeting C/D/E/F. To prevent students from building Blockly programs that crash at the first run, restrict the motor dropdown.

**Files:**
- Modify: `js/blockly_config.js:25-26` (the port option lists)

- [ ] **Step 1: Replace `_PORTS_SINGLE` and `_PAIRS` constants**

Edit `js/blockly_config.js:25-26`:

Replace:
```javascript
const _PORTS_SINGLE = [['A','A'],['B','B'],['C','C'],['D','D'],['E','E'],['F','F']];
const _PORTS_MULTI  = _PORTS_SINGLE; // multi-port selectors collapse to single in standard Blockly
```

With:
```javascript
// Motor ports per the default port config. When customization arrives,
// these lists become a function of the live config.
const _PORTS_SINGLE = [['A','A'],['B','B']];
const _PORTS_MULTI  = _PORTS_SINGLE;
```

Then edit `js/blockly_config.js:40-45` — replace the `_PAIRS` constant:

```javascript
const _PAIRS = [
  _pairOpt('A+B','AB'),
];
```

Existing non-A/B pair option lines (`C+D`, `E+F`, `A+C`, etc.) are deleted.

> **Note (out of scope for this plan):** sensor-port dropdowns also use `_PORTS_MULTI` (the alias). Restricting per-sensor-type (color → E only, distance → F only) is a known follow-up; for now, sensor blocks emit any motor port and Python validation catches the error at run time.

- [ ] **Step 2: Manual verification**

Reload http://localhost:8787, open the Blocks tab. For motor blocks, the port dropdown should list only A and B. For movement-pair blocks, the only pair pill should be A+B.

Drop a motor-run-for-degrees block on port A, run it. Expect normal behaviour.

- [ ] **Step 3: Commit**

```bash
git add js/blockly_config.js
git commit -m "feat: restrict Blockly motor port dropdown to A and B"
```

---

## Task 10: Final verification

End-to-end check that the feature works as designed.

- [ ] **Step 1: Run the full test suites**

```bash
python3 tests/py/run.py
node tests/js/run.js
```

Expected: both green, no failures.

- [ ] **Step 2: Manual end-to-end checklist**

Run `python3 -m http.server 8787` and verify:

- Hub panel shows on load with all six port rows; C and D dimmed
- A typical Python program (`motor_pair.pair(...) → move_for_degrees`) updates A/B port values during execution
- `color_sensor.color(port.E)` reads update the E row as the robot crosses coloured zones; the swatch changes
- `distance_sensor.distance(port.F)` reading updates the F row
- A program calling `motor.run(port.C)` produces `RuntimeError: port C has no motor (configured: empty)` in the console
- A program calling `color_sensor.color(port.A)` produces `RuntimeError: port A has no color sensor (configured: motor)` in the console
- A Blockly program built only from valid options runs cleanly
- Blockly motor dropdowns only show A and B; pair selector only shows A+B

- [ ] **Step 3: Commit any final fixes**

If verification surfaced regressions, fix and commit. Otherwise nothing to do.

---

## Out of scope (deferred)

- Customization UI (swap a device on a port)
- Persisting port config in `localStorage`
- Worker `port_config` message for runtime config sync
- Visual port indicators on the rendered robot (port letters etched on wheels)
- Active-port pulse / animation
- Force sensor in default config (slot exists in validator; no row in panel)
- Restricting Blockly *sensor* port dropdowns per device type (Python validation already catches wrong-port sensor calls)
