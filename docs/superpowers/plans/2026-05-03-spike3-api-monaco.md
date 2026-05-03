# SPIKE 3 API Alignment + Monaco Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-implement `spike_bridge.py` to match the official LEGO SPIKE Prime v3 Python API and replace CodeMirror 5 with Monaco Editor for rich in-editor documentation.

**Architecture:** Three independent phases: (1) Add `getColorSensorColorInt()` to the JS simulator so Python can return integer color constants; (2) Rewrite `spike_bridge.py` to match the official API and update its tests; (3) Swap CodeMirror for Monaco and wire up a full completion/signature-help/hover provider.

**Tech Stack:** MicroPython via PyScript, Monaco Editor 0.52 (AMD CDN), vanilla JS, Python `unittest`

**Spec:** `docs/superpowers/specs/2026-05-03-spike3-api-monaco-design.md`

---

## File Map

| File | Action |
|------|--------|
| `js/simulator.js` | Add `COLOR_INT_MAP` + `getColorSensorColorInt()` method |
| `js/main.js` | Add `window.getColorSensorColorInt` bridge; replace `initEditor()` for Monaco; update `DEFAULT_PYTHON_CODE` |
| `tests/py/mock_js.py` | Add `getColorSensorColorInt()` stub |
| `py/spike_bridge.py` | Full rewrite to SPIKE 3 spec |
| `tests/py/test_motor.py` | Update default-velocity + new method tests |
| `tests/py/test_motor_pair.py` | Remove deleted methods; add `move_for_time`, `move_tank_for_time`, `move` tests |
| `tests/py/test_hub.py` | Update color constants to ints; update beep signature |
| `js/autocomplete.js` | Delete |
| `js/monaco_config.js` | New — SPIKE_API data + CompletionItemProvider + SignatureHelpProvider + HoverProvider |
| `index.html` | Swap CDN tags; `<textarea>` → `<div>` |

---

## Task 1: Create git worktree

**Files:** none (setup only)

- [ ] **Step 1: Create branch and worktree**

```bash
git worktree add .worktrees/spike3-monaco -b feature/spike3-api-monaco
```

- [ ] **Step 2: Verify worktree exists**

```bash
git worktree list
```
Expected output includes `.worktrees/spike3-monaco` on branch `feature/spike3-api-monaco`.

- [ ] **Step 3: All subsequent work happens inside the worktree**

```bash
cd .worktrees/spike3-monaco
```

---

## Task 2: Add color-int support to simulator.js and main.js

**Files:**
- Modify: `js/simulator.js` (around line 35 and line 742)
- Modify: `js/main.js` (around line 50)
- Modify: `tests/js/sensors/accessors.test.js`

- [ ] **Step 1: Add `COLOR_INT_MAP` and `getColorSensorColorInt()` to simulator.js**

After the existing `COLOR_MAP` block (line ~46), insert:

```js
const COLOR_INT_MAP = {
  none: -1, black: 0, magenta: 1, purple: 2, blue: 3,
  azure: 4, turquoise: 5, green: 6, yellow: 7, orange: 8, red: 9, white: 10,
};
```

After `getColorSensorColor()` (line ~742), insert:

```js
getColorSensorColorInt() {
  const v = this.shadowRobot.sensors.colorValue;
  return COLOR_INT_MAP[v] ?? -1;
}
```

- [ ] **Step 2: Expose it on `window` in main.js**

After `window.getColorSensorColor` (line ~46), insert:

```js
window.getColorSensorColorInt = () => sim?.getColorSensorColorInt() ?? -1;
```

- [ ] **Step 3: Add JS tests for getColorSensorColorInt**

Append to `tests/js/sensors/accessors.test.js` (before the closing `];`):

```js
  {
    name: 'getColorSensorColorInt: returns -1 for "none" (default)',
    fn(createSim, assert) {
      assert.strictEqual(createSim().getColorSensorColorInt(), -1);
    },
  },
  {
    name: 'getColorSensorColorInt: returns 0 for "black"',
    fn(createSim, assert) {
      const sim = createSim();
      sim.shadowRobot.sensors.colorValue = 'black';
      assert.strictEqual(sim.getColorSensorColorInt(), 0);
    },
  },
  {
    name: 'getColorSensorColorInt: returns 9 for "red"',
    fn(createSim, assert) {
      const sim = createSim();
      sim.shadowRobot.sensors.colorValue = 'red';
      assert.strictEqual(sim.getColorSensorColorInt(), 9);
    },
  },
  {
    name: 'getColorSensorColorInt: returns 6 for "green"',
    fn(createSim, assert) {
      const sim = createSim();
      sim.shadowRobot.sensors.colorValue = 'green';
      assert.strictEqual(sim.getColorSensorColorInt(), 6);
    },
  },
```

- [ ] **Step 4: Run JS tests**

```bash
node tests/js/run.js
```

Expected: all tests pass including the 4 new ones.

- [ ] **Step 5: Commit**

```bash
git add js/simulator.js js/main.js tests/js/sensors/accessors.test.js
git commit -m "feat: add getColorSensorColorInt() for SPIKE3 integer color constants"
```

---

## Task 3: Update mock_js.py

**Files:**
- Modify: `tests/py/mock_js.py`

- [ ] **Step 1: Add `getColorSensorColorInt` to `_Window`**

After `getColorSensorColor` in `_Window`:

```python
def getColorSensorColorInt(self):
    color_int_map = {
        'none': -1, 'black': 0, 'magenta': 1, 'purple': 2, 'blue': 3,
        'azure': 4, 'turquoise': 5, 'green': 6, 'yellow': 7,
        'orange': 8, 'red': 9, 'white': 10,
    }
    return color_int_map.get(self.getColorSensorColor(), -1)
```

- [ ] **Step 2: Verify existing Python tests still pass (bridge unchanged so far)**

```bash
python3 tests/py/run.py
```

Expected: all existing tests pass.

---

## Task 4: Rewrite spike_bridge.py

**Files:**
- Modify: `py/spike_bridge.py` (full rewrite)

- [ ] **Step 1: Replace the entire file**

```python
from js import window
import json
import builtins
import sys
import math

# ── _Awaitable ─────────────────────────────────────────────────────────────────

_cmds = []

class _Awaitable:
    def __init__(self, cmd=None):
        if cmd is not None:
            _cmds.append(cmd)
    def __iter__(self):  return self
    def __next__(self):  raise StopIteration(None)
    def __await__(self): return self

def _q(cmd):
    _cmds.append(cmd)
    window.shadowCmd(json.dumps(cmd))
    return _Awaitable(None)

# ── color ──────────────────────────────────────────────────────────────────────

class color:
    BLACK     = 0
    MAGENTA   = 1
    PURPLE    = 2
    BLUE      = 3
    AZURE     = 4
    TURQUOISE = 5
    GREEN     = 6
    YELLOW    = 7
    ORANGE    = 8
    RED       = 9
    WHITE     = 10
    UNKNOWN   = -1

# ── port ──────────────────────────────────────────────────────────────────────

class port:
    A = 'A'; B = 'B'; C = 'C'; D = 'D'; E = 'E'; F = 'F'

Port = port

# ── motor ──────────────────────────────────────────────────────────────────────

class motor:
    # Stop-mode constants
    COAST       = 0
    BRAKE       = 1
    HOLD        = 2
    CONTINUE    = 3
    SMART_COAST = 4
    SMART_BRAKE = 5
    # Direction constants
    CLOCKWISE        = 0
    COUNTERCLOCKWISE = 1
    SHORTEST_PATH    = 2
    LONGEST_PATH     = 3
    # Status constants
    READY        = 0
    RUNNING      = 1
    STALLED      = 2
    CANCELLED    = 3
    ERROR        = 4
    DISCONNECTED = 5

    @staticmethod
    def run_for_degrees(port, degrees, velocity=360, *, stop=1, acceleration=1000, deceleration=1000):
        return _q({'type': 'motor_degrees', 'port': str(port), 'degrees': degrees, 'velocity': velocity})

    @staticmethod
    def run_for_time(port, duration, velocity=360, *, stop=1, acceleration=1000, deceleration=1000):
        return _q({'type': 'motor_time', 'port': str(port), 'time_ms': duration, 'velocity': velocity})

    @staticmethod
    def run_to_absolute_position(port, position, velocity=360, *, direction=2, stop=1, acceleration=1000, deceleration=1000):
        return _q({'type': 'motor_degrees', 'port': str(port), 'degrees': int(position), 'velocity': velocity})

    @staticmethod
    def run_to_relative_position(port, position, velocity=360, *, stop=1, acceleration=1000, deceleration=1000):
        return _q({'type': 'motor_degrees', 'port': str(port), 'degrees': int(position), 'velocity': velocity})

    @staticmethod
    def run(port, velocity=360, *, acceleration=1000):
        return _q({'type': 'motor_run', 'port': str(port), 'velocity': velocity})

    @staticmethod
    def stop(port, *, stop=1):
        return _q({'type': 'motor_stop', 'port': str(port)})

    @staticmethod
    def velocity(port):
        return int(window.getMotorSpeed(str(port)))

    @staticmethod
    def absolute_position(port):
        return int(window.getMotorPosition(str(port)))

    @staticmethod
    def relative_position(port):
        return int(window.getMotorPosition(str(port)))

    @staticmethod
    def reset_relative_position(port, position=0):
        return _Awaitable()

    @staticmethod
    def get_duty_cycle(port):
        return 0

    @staticmethod
    def set_duty_cycle(port, pwm):
        return _Awaitable()

# ── motor_pair ─────────────────────────────────────────────────────────────────

class motor_pair:
    PAIR_1 = 0; PAIR_2 = 1; PAIR_3 = 2

    @staticmethod
    def pair(pair, left_motor, right_motor):
        return _q({'type': 'pair', 'pair_id': pair,
                   'left': str(left_motor), 'right': str(right_motor)})

    @staticmethod
    def unpair(pair):
        return _Awaitable()

    @staticmethod
    def move(pair, steering, *, velocity=360, acceleration=1000):
        return _q({'type': 'start', 'pair_id': pair, 'steering': steering, 'speed': velocity})

    @staticmethod
    def move_for_degrees(pair, degrees, steering=0, *, velocity=360, stop=1, acceleration=1000, deceleration=1000):
        return _q({'type': 'move', 'pair_id': pair, 'steering': steering,
                   'speed': velocity, 'amount': degrees, 'unit': 'degrees'})

    @staticmethod
    def move_for_time(pair, duration, steering=0, *, velocity=360, stop=1, acceleration=1000, deceleration=1000):
        degrees = velocity * (duration / 1000.0)
        return _q({'type': 'move', 'pair_id': pair, 'steering': steering,
                   'speed': velocity, 'amount': degrees, 'unit': 'degrees'})

    @staticmethod
    def move_tank_for_time(pair, left_velocity, right_velocity, duration, *, stop=1, acceleration=1000, deceleration=1000):
        max_v = max(abs(left_velocity), abs(right_velocity), 1)
        degrees = max_v * (duration / 1000.0)
        return _q({'type': 'move_tank', 'pair_id': pair,
                   'left_speed': left_velocity, 'right_speed': right_velocity,
                   'amount': degrees, 'unit': 'degrees'})

    @staticmethod
    def stop(pair, *, stop=1):
        return _q({'type': 'stop', 'pair_id': pair})

    # ── Backward-compat aliases (not in completions) ───────────────────────────

    @staticmethod
    def move_tank(pair_id, left_speed, right_speed, amount=0, unit='degrees',
                  acceleration=100, deceleration=100):
        return _q({'type': 'move_tank', 'pair_id': pair_id,
                   'left_speed': left_speed, 'right_speed': right_speed,
                   'amount': amount, 'unit': unit})

# ── color_sensor ───────────────────────────────────────────────────────────────

class color_sensor:
    @staticmethod
    def color(port):
        return int(window.getColorSensorColorInt())

    @staticmethod
    def reflection(port):
        return int(window.getColorSensorReflection())

    @staticmethod
    def rgbi(port):
        raw = window.getColorSensorRGB()
        return (int(raw[0]), int(raw[1]), int(raw[2]), 0)

# ── distance_sensor ────────────────────────────────────────────────────────────

class distance_sensor:
    @staticmethod
    def distance(port):
        v = int(window.getDistanceSensorValue())
        return v if v < 9999 else -1

    @staticmethod
    def clear(port):
        pass

    @staticmethod
    def get_pixel(port, x, y):
        return 0

    @staticmethod
    def set_pixel(port, x, y, intensity):
        pass

    @staticmethod
    def show(port, pixels):
        pass

# ── force_sensor ───────────────────────────────────────────────────────────────

class force_sensor:
    @staticmethod
    def force(port):
        return int(window.getForceSensorValue())

    @staticmethod
    def pressed(port):
        return bool(window.getForceSensorPressed())

    @staticmethod
    def raw(port):
        return int(window.getForceSensorValue())

# ── Hub ────────────────────────────────────────────────────────────────────────

class _LightMatrix:
    def write(self, text, intensity=100, time_per_character=500):
        return _q({'type': 'hub_display', 'text': str(text)})

    def show(self, pixels):
        return _q({'type': 'hub_image', 'image': 'CUSTOM'})

    def show_image(self, image):
        return _q({'type': 'hub_image', 'image': str(image)})

    def set_pixel(self, x, y, intensity=100):
        return _q({'type': 'hub_pixel', 'x': x, 'y': y, 'brightness': intensity})

    def get_pixel(self, x, y):
        return 0

    def clear(self):
        return _q({'type': 'hub_display_off'})

    def off(self):
        return _q({'type': 'hub_display_off'})

    def get_orientation(self):
        return 0

    def set_orientation(self, top):
        return 0


class _Speaker:
    def beep(self, freq=440, duration=500, volume=100, *,
             attack=0, decay=0, sustain=100, release=0, transition=10):
        # Convert Hz → MIDI note for the simulator's audio engine
        note = round(69 + 12 * math.log2(freq / 440)) if freq > 0 else 69
        return _q({'type': 'beep', 'note': note, 'duration': duration / 1000.0})

    def stop(self):
        return _Awaitable()

    def volume(self, volume):
        return _Awaitable()


class _MotionSensor:
    TAPPED       = 0
    DOUBLE_TAPPED = 1
    SHAKEN       = 2
    FALLING      = 3
    UNKNOWN      = -1
    TOP    = 0; FRONT  = 1; RIGHT  = 2
    BOTTOM = 3; BACK   = 4; LEFT   = 5

    def tilt_angles(self):         return (0, 0, 0)
    def angular_velocity(self, raw_unfiltered=False): return (0, 0, 0)
    def acceleration(self, raw_unfiltered=False):     return (0, 0, 981)
    def reset_yaw(self, angle=0):  return _Awaitable()
    def gesture(self):             return self.UNKNOWN
    def stable(self):              return True
    def up_face(self):             return self.TOP
    def quaternion(self):          return (1.0, 0.0, 0.0, 0.0)
    def tap_count(self):           return 0
    def reset_tap_count(self):     pass
    def get_yaw_face(self):        return self.TOP
    def set_yaw_face(self, up):    return True


class _Button:
    LEFT  = 1
    RIGHT = 2

    def pressed(self, button):     return 0
    def was_pressed(self, button): return False


class _Light:
    POWER   = 0
    CONNECT = 1

    def color(self, light, c): pass


class _Hub:
    def __init__(self):
        self.light_matrix  = _LightMatrix()
        self.speaker       = _Speaker()
        self.sound         = self.speaker   # alias
        self.motion_sensor = _MotionSensor()
        self.button        = _Button()
        self.light         = _Light()

    def device_uuid(self): return 'simulator'
    def hardware_id(self): return 'simulator'
    def power_off(self):   return 0
    def temperature(self): return 250


hub = _Hub()

# ── runloop ────────────────────────────────────────────────────────────────────

class runloop:
    @staticmethod
    def run(*funcs):
        for coro in funcs:
            try:
                while True:
                    coro.send(None)
            except StopIteration:
                pass

    @staticmethod
    def sleep_ms(duration):
        return _q({'type': 'wait', 'ms': int(duration)})

    @staticmethod
    def until(function, timeout=0):
        return _Awaitable()

# ── wait ───────────────────────────────────────────────────────────────────────

def wait(ms):
    return _q({'type': 'wait', 'ms': int(ms)})

# ── print override ─────────────────────────────────────────────────────────────

_orig_print = builtins.print

def _py_print(*args, **kwargs):
    text = kwargs.get('sep', ' ').join(str(a) for a in args)
    _q({'type': 'print', 'text': text})
    _orig_print(*args, **kwargs)

builtins.print = _py_print

# ── Stub modules ───────────────────────────────────────────────────────────────

class orientation:
    UP = 0; RIGHT = 1; DOWN = 2; LEFT = 3


class device:
    @staticmethod
    def data(port):            return ()
    @staticmethod
    def id(port):              return 0
    @staticmethod
    def ready(port):           return False
    @staticmethod
    def get_duty_cycle(port):  return 0
    @staticmethod
    def set_duty_cycle(port, duty_cycle): pass


class color_matrix:
    @staticmethod
    def clear(port):                      pass
    @staticmethod
    def get_pixel(port, x, y):            return (0, 0)
    @staticmethod
    def set_pixel(port, x, y, pixel):     pass
    @staticmethod
    def show(port, pixels):               pass


class _AppSound:
    @staticmethod
    def play(sound_name, volume=100, pitch=0, pan=0): return _Awaitable()
    @staticmethod
    def stop():                                        return _Awaitable()
    @staticmethod
    def set_attributes(volume, pitch, pan):            pass


class _AppMusic:
    DRUM_SNARE=1; DRUM_BASS=2; DRUM_SIDE_STICK=3; DRUM_CRASH_CYMBAL=4
    INSTRUMENT_PIANO=1; INSTRUMENT_ELECTRIC_PIANO=2; INSTRUMENT_ORGAN=3
    INSTRUMENT_GUITAR=4; INSTRUMENT_ELECTRIC_GUITAR=5; INSTRUMENT_BASS=6
    INSTRUMENT_PIZZICATO=7; INSTRUMENT_CELLO=8; INSTRUMENT_TROMBONE=9
    INSTRUMENT_CLARINET=10; INSTRUMENT_SAXOPHONE=11; INSTRUMENT_FLUTE=12
    INSTRUMENT_WOODEN_FLUTE=13; INSTRUMENT_BASSOON=14; INSTRUMENT_CHOIR=15
    INSTRUMENT_VIBRAPHONE=16; INSTRUMENT_MUSIC_BOX=17; INSTRUMENT_STEEL_DRUM=18
    INSTRUMENT_MARIMBA=19; INSTRUMENT_SYNTH_LEAD=20; INSTRUMENT_SYNTH_PAD=21

    @staticmethod
    def play_drum(drum):                          pass
    @staticmethod
    def play_instrument(instrument, note, duration): pass


class _AppDisplay:
    IMAGE_ROBOT_1=1; IMAGE_ROBOT_2=2; IMAGE_ROBOT_3=3; IMAGE_ROBOT_4=4
    IMAGE_ROBOT_5=5; IMAGE_AMUSEMENT_PARK=6; IMAGE_BEACH=7
    IMAGE_HAUNTED_HOUSE=8; IMAGE_MOON=9; IMAGE_RAINBOW=10
    IMAGE_EMPTY=11; IMAGE_RANDOM=21

    @staticmethod
    def show(fullscreen=False): pass
    @staticmethod
    def hide():                 pass
    @staticmethod
    def image(image):           pass
    @staticmethod
    def text(text):             pass


class _AppBarGraph:
    @staticmethod
    def show(fullscreen=False):         pass
    @staticmethod
    def hide():                         pass
    @staticmethod
    def set_value(color, value):        pass
    @staticmethod
    def change(color, value):           pass
    @staticmethod
    def get_value(color):               return _Awaitable()
    @staticmethod
    def clear_all():                    pass


class _AppLineGraph:
    @staticmethod
    def show(fullscreen=False):         pass
    @staticmethod
    def hide():                         pass
    @staticmethod
    def plot(color, x, y):              pass
    @staticmethod
    def clear(color):                   pass
    @staticmethod
    def clear_all():                    pass
    @staticmethod
    def get_last(color):                return _Awaitable()
    @staticmethod
    def get_average(color):             return _Awaitable()
    @staticmethod
    def get_min(color):                 return _Awaitable()
    @staticmethod
    def get_max(color):                 return _Awaitable()


class _App:
    sound     = _AppSound()
    music     = _AppMusic()
    display   = _AppDisplay()
    bargraph  = _AppBarGraph()
    linegraph = _AppLineGraph()


app = _App()

# ── Module injection ───────────────────────────────────────────────────────────

class _HubModule:
    light_matrix  = hub.light_matrix
    speaker       = hub.speaker
    sound         = hub.speaker
    motion_sensor = hub.motion_sensor
    button        = hub.button
    light         = hub.light
    port          = port

    def device_uuid(self): return hub.device_uuid()
    def hardware_id(self):  return hub.hardware_id()
    def power_off(self):    return hub.power_off()
    def temperature(self):  return hub.temperature()


sys.modules['hub']           = _HubModule()
sys.modules['app']           = app
sys.modules['motor']         = motor
sys.modules['motor_pair']    = motor_pair
sys.modules['runloop']       = runloop
sys.modules['color_sensor']  = color_sensor
sys.modules['distance_sensor'] = distance_sensor
sys.modules['force_sensor']  = force_sensor
sys.modules['color']         = color
sys.modules['orientation']   = orientation
sys.modules['device']        = device
sys.modules['color_matrix']  = color_matrix

# ── User code runner ───────────────────────────────────────────────────────────

def run_user_code(code):
    global _cmds
    _cmds = []

    ns = {
        '__name__':        '__main__',
        'motor':           motor,
        'motor_pair':      motor_pair,
        'color_sensor':    color_sensor,
        'distance_sensor': distance_sensor,
        'force_sensor':    force_sensor,
        'hub':             hub,
        'color':           color,
        'Port':            Port,
        'port':            port,
        'wait':            wait,
        'runloop':         runloop,
        'orientation':     orientation,
        'device':          device,
        'color_matrix':    color_matrix,
        'app':             app,
        'print':           _py_print,
    }

    try:
        window.resetShadow()
        exec(compile(str(code), '<user>', 'exec'), ns)
        window.receiveCommands(json.dumps(_cmds))
    except Exception as exc:
        window.appendOutput('[Error] ' + str(type(exc).__name__) + ': ' + str(exc))
    finally:
        _cmds = []


window.pyRunCode = run_user_code
window.onPyReady()
```

- [ ] **Step 2: Commit (tests will fail — fix in next task)**

```bash
git add py/spike_bridge.py tests/py/mock_js.py
git commit -m "feat: rewrite spike_bridge.py to SPIKE3 spec"
```

---

## Task 5: Update Python tests

**Files:**
- Modify: `tests/py/test_motor.py`
- Modify: `tests/py/test_motor_pair.py`
- Modify: `tests/py/test_hub.py`

- [ ] **Step 1: Replace test_motor.py**

```python
"""Tests for motor (single-port) command dict schemas."""
import unittest
import spike_bridge as sb


class TestMotorCommands(unittest.TestCase):

    def setUp(self):
        sb._cmds = []

    def test_run_for_degrees(self):
        sb.motor.run_for_degrees('A', 360, velocity=500)
        self.assertEqual(sb._cmds, [
            {'type': 'motor_degrees', 'port': 'A', 'degrees': 360, 'velocity': 500},
        ])

    def test_run_for_degrees_default_velocity(self):
        sb.motor.run_for_degrees('B', 180)
        self.assertEqual(sb._cmds[0]['velocity'], 360)

    def test_run_for_time(self):
        sb.motor.run_for_time('C', 1000, velocity=300)
        self.assertEqual(sb._cmds, [
            {'type': 'motor_time', 'port': 'C', 'time_ms': 1000, 'velocity': 300},
        ])

    def test_run_for_time_default_velocity(self):
        sb.motor.run_for_time('D', 500)
        self.assertEqual(sb._cmds[0]['velocity'], 360)

    def test_run(self):
        sb.motor.run('E', velocity=750)
        self.assertEqual(sb._cmds, [
            {'type': 'motor_run', 'port': 'E', 'velocity': 750},
        ])

    def test_stop(self):
        sb.motor.stop('A')
        cmd = sb._cmds[0]
        self.assertEqual(cmd['type'], 'motor_stop')
        self.assertEqual(cmd['port'], 'A')

    def test_run_to_absolute_position(self):
        sb.motor.run_to_absolute_position('F', 90, velocity=400)
        cmd = sb._cmds[0]
        self.assertEqual(cmd['type'],     'motor_degrees')
        self.assertEqual(cmd['port'],     'F')
        self.assertEqual(cmd['degrees'],  90)
        self.assertEqual(cmd['velocity'], 400)

    def test_run_to_relative_position(self):
        sb.motor.run_to_relative_position('B', -180, velocity=600)
        cmd = sb._cmds[0]
        self.assertEqual(cmd['type'],    'motor_degrees')
        self.assertEqual(cmd['degrees'], -180)

    def test_velocity_returns_int(self):
        result = sb.motor.velocity('A')
        self.assertIsInstance(result, int)

    def test_absolute_position_returns_int(self):
        result = sb.motor.absolute_position('A')
        self.assertIsInstance(result, int)

    def test_relative_position_returns_int(self):
        result = sb.motor.relative_position('B')
        self.assertIsInstance(result, int)

    def test_reset_relative_position_no_command(self):
        sb.motor.reset_relative_position('A', 0)
        self.assertEqual(sb._cmds, [])

    def test_port_object_converted_to_str(self):
        sb.motor.run_for_degrees(sb.port.A, 360)
        self.assertIsInstance(sb._cmds[0]['port'], str)
        self.assertEqual(sb._cmds[0]['port'], 'A')

    def test_motor_constants(self):
        self.assertEqual(sb.motor.BRAKE,            1)
        self.assertEqual(sb.motor.COAST,            0)
        self.assertEqual(sb.motor.HOLD,             2)
        self.assertEqual(sb.motor.CLOCKWISE,        0)
        self.assertEqual(sb.motor.COUNTERCLOCKWISE, 1)
        self.assertEqual(sb.motor.SHORTEST_PATH,    2)

    def test_multiple_commands_accumulate(self):
        sb.motor.run_for_degrees('A', 90)
        sb.motor.run_for_degrees('B', 180)
        sb.motor.stop('A')
        self.assertEqual(len(sb._cmds), 3)
        self.assertEqual(sb._cmds[0]['port'],    'A')
        self.assertEqual(sb._cmds[1]['degrees'], 180)
        self.assertEqual(sb._cmds[2]['type'],    'motor_stop')
```

- [ ] **Step 2: Replace test_motor_pair.py**

```python
"""Tests for motor_pair command dict schemas (SPIKE3 spec)."""
import unittest
import spike_bridge as sb


class TestMotorPairPair(unittest.TestCase):

    def setUp(self):
        sb._cmds = []

    def test_pair_basic(self):
        sb.motor_pair.pair(0, 'A', 'B')
        self.assertEqual(sb._cmds, [
            {'type': 'pair', 'pair_id': 0, 'left': 'A', 'right': 'B'},
        ])

    def test_pair_id_1(self):
        sb.motor_pair.pair(1, 'C', 'D')
        self.assertEqual(sb._cmds[0]['pair_id'], 1)
        self.assertEqual(sb._cmds[0]['left'],    'C')
        self.assertEqual(sb._cmds[0]['right'],   'D')

    def test_pair_port_objects_converted_to_str(self):
        sb.motor_pair.pair(0, sb.port.A, sb.port.B)
        self.assertIsInstance(sb._cmds[0]['left'],  str)
        self.assertIsInstance(sb._cmds[0]['right'], str)


class TestMotorPairMoveForDegrees(unittest.TestCase):

    def setUp(self):
        sb._cmds = []

    def test_move_for_degrees(self):
        sb.motor_pair.move_for_degrees(0, 720, steering=0, velocity=1000)
        cmd = sb._cmds[0]
        self.assertEqual(cmd['type'],   'move')
        self.assertEqual(cmd['amount'], 720)
        self.assertEqual(cmd['unit'],   'degrees')
        self.assertEqual(cmd['speed'],  1000)

    def test_move_for_degrees_default_velocity(self):
        sb.motor_pair.move_for_degrees(0, 360, 0)
        self.assertEqual(sb._cmds[0]['speed'], 360)

    def test_move_for_degrees_with_steering(self):
        sb.motor_pair.move_for_degrees(0, 360, steering=50)
        self.assertEqual(sb._cmds[0]['steering'], 50)


class TestMotorPairMoveForTime(unittest.TestCase):

    def setUp(self):
        sb._cmds = []

    def test_move_for_time_converts_to_degrees(self):
        sb.motor_pair.move_for_time(0, 2000, 0, velocity=360)
        cmd = sb._cmds[0]
        self.assertEqual(cmd['type'],  'move')
        self.assertEqual(cmd['unit'],  'degrees')
        self.assertAlmostEqual(cmd['amount'], 720.0)  # 360 deg/s * 2s
        self.assertEqual(cmd['speed'], 360)

    def test_move_for_time_default_velocity(self):
        sb.motor_pair.move_for_time(0, 1000, 0)
        cmd = sb._cmds[0]
        self.assertEqual(cmd['speed'], 360)
        self.assertAlmostEqual(cmd['amount'], 360.0)  # 360 * 1s

    def test_move_for_time_with_steering(self):
        sb.motor_pair.move_for_time(0, 1000, 50, velocity=360)
        self.assertEqual(sb._cmds[0]['steering'], 50)

    def test_move_for_time_negative_velocity(self):
        sb.motor_pair.move_for_time(0, 1000, 0, velocity=-360)
        cmd = sb._cmds[0]
        self.assertEqual(cmd['speed'], -360)
        self.assertAlmostEqual(cmd['amount'], -360.0)


class TestMotorPairMoveForTankTime(unittest.TestCase):

    def setUp(self):
        sb._cmds = []

    def test_move_tank_for_time(self):
        sb.motor_pair.move_tank_for_time(0, 500, -500, 1000)
        cmd = sb._cmds[0]
        self.assertEqual(cmd['type'],        'move_tank')
        self.assertEqual(cmd['pair_id'],     0)
        self.assertEqual(cmd['left_speed'],  500)
        self.assertEqual(cmd['right_speed'], -500)
        self.assertEqual(cmd['unit'],        'degrees')
        self.assertAlmostEqual(cmd['amount'], 500.0)  # max(500,500) * 1s

    def test_move_tank_for_time_uses_max_velocity(self):
        sb.motor_pair.move_tank_for_time(0, 200, 800, 1000)
        # max_v = 800, degrees = 800 * 1.0 = 800
        self.assertAlmostEqual(sb._cmds[0]['amount'], 800.0)


class TestMotorPairMoveContinuous(unittest.TestCase):

    def setUp(self):
        sb._cmds = []

    def test_move_continuous(self):
        sb.motor_pair.move(0, 0, velocity=360)
        cmd = sb._cmds[0]
        self.assertEqual(cmd['type'],     'start')
        self.assertEqual(cmd['pair_id'],  0)
        self.assertEqual(cmd['steering'], 0)
        self.assertEqual(cmd['speed'],    360)

    def test_move_continuous_with_steering(self):
        sb.motor_pair.move(0, 50, velocity=500)
        self.assertEqual(sb._cmds[0]['steering'], 50)


class TestMotorPairStop(unittest.TestCase):

    def setUp(self):
        sb._cmds = []

    def test_stop(self):
        sb.motor_pair.stop(0)
        self.assertEqual(sb._cmds, [{'type': 'stop', 'pair_id': 0}])


class TestMotorPairBackwardCompat(unittest.TestCase):
    """move_tank still works (compat alias)."""

    def setUp(self):
        sb._cmds = []

    def test_move_tank_alias(self):
        sb.motor_pair.move_tank(0, 500, 300, amount=360, unit='degrees')
        cmd = sb._cmds[0]
        self.assertEqual(cmd['type'],        'move_tank')
        self.assertEqual(cmd['left_speed'],  500)
        self.assertEqual(cmd['right_speed'], 300)
        self.assertEqual(cmd['amount'],      360)


class TestMotorPairConstants(unittest.TestCase):

    def test_pair_id_constants(self):
        self.assertEqual(sb.motor_pair.PAIR_1, 0)
        self.assertEqual(sb.motor_pair.PAIR_2, 1)
        self.assertEqual(sb.motor_pair.PAIR_3, 2)
```

- [ ] **Step 3: Replace test_hub.py**

```python
"""Tests for hub, speaker, light_matrix, and color constants (SPIKE3 spec)."""
import unittest
import spike_bridge as sb


class TestLightMatrix(unittest.TestCase):

    def setUp(self):
        sb._cmds = []

    def test_write(self):
        sb.hub.light_matrix.write('Hello')
        self.assertEqual(sb._cmds, [{'type': 'hub_display', 'text': 'Hello'}])

    def test_write_converts_to_str(self):
        sb.hub.light_matrix.write(42)
        self.assertEqual(sb._cmds[0]['text'], '42')
        self.assertIsInstance(sb._cmds[0]['text'], str)

    def test_clear(self):
        sb.hub.light_matrix.clear()
        self.assertEqual(sb._cmds, [{'type': 'hub_display_off'}])

    def test_off_alias(self):
        sb.hub.light_matrix.off()
        self.assertEqual(sb._cmds, [{'type': 'hub_display_off'}])

    def test_set_pixel(self):
        sb.hub.light_matrix.set_pixel(2, 3, 80)
        self.assertEqual(sb._cmds, [
            {'type': 'hub_pixel', 'x': 2, 'y': 3, 'brightness': 80},
        ])

    def test_set_pixel_default_intensity(self):
        sb.hub.light_matrix.set_pixel(0, 0)
        self.assertEqual(sb._cmds[0]['brightness'], 100)

    def test_show_image(self):
        sb.hub.light_matrix.show_image('HAPPY')
        self.assertEqual(sb._cmds[0], {'type': 'hub_image', 'image': 'HAPPY'})

    def test_write_then_clear(self):
        sb.hub.light_matrix.write('Hi')
        sb.hub.light_matrix.clear()
        self.assertEqual(len(sb._cmds), 2)
        self.assertEqual(sb._cmds[0]['type'], 'hub_display')
        self.assertEqual(sb._cmds[1]['type'], 'hub_display_off')


class TestSpeaker(unittest.TestCase):

    def setUp(self):
        sb._cmds = []

    def test_beep_default_queues_command(self):
        sb.hub.speaker.beep()
        self.assertEqual(len(sb._cmds), 1)
        cmd = sb._cmds[0]
        self.assertEqual(cmd['type'], 'beep')
        # freq=440 Hz → MIDI note 69
        self.assertEqual(cmd['note'], 69)
        # duration=500ms → 0.5s
        self.assertAlmostEqual(cmd['duration'], 0.5)

    def test_beep_custom_freq(self):
        sb.hub.speaker.beep(freq=880, duration=1000)
        cmd = sb._cmds[0]
        # 880 Hz = A5 = MIDI 81
        self.assertEqual(cmd['note'], 81)
        self.assertAlmostEqual(cmd['duration'], 1.0)

    def test_beep_220hz(self):
        sb.hub.speaker.beep(freq=220)
        # 220 Hz = A3 = MIDI 57
        self.assertEqual(sb._cmds[0]['note'], 57)


class TestMotionSensor(unittest.TestCase):

    def test_motion_sensor_attribute_exists(self):
        self.assertTrue(hasattr(sb.hub, 'motion_sensor'))

    def test_tilt_angles_returns_tuple(self):
        result = sb.hub.motion_sensor.tilt_angles()
        self.assertIsInstance(result, tuple)
        self.assertEqual(len(result), 3)

    def test_reset_yaw_no_command(self):
        sb._cmds = []
        sb.hub.motion_sensor.reset_yaw()
        self.assertEqual(sb._cmds, [])


class TestHubButton(unittest.TestCase):

    def test_pressed_returns_int(self):
        result = sb.hub.button.pressed(sb.hub.button.LEFT)
        self.assertIsInstance(result, int)
        self.assertEqual(result, 0)

    def test_button_constants(self):
        self.assertEqual(sb.hub.button.LEFT,  1)
        self.assertEqual(sb.hub.button.RIGHT, 2)


class TestColorConstants(unittest.TestCase):

    def test_color_integers(self):
        self.assertEqual(sb.color.BLACK,     0)
        self.assertEqual(sb.color.MAGENTA,   1)
        self.assertEqual(sb.color.PURPLE,    2)
        self.assertEqual(sb.color.BLUE,      3)
        self.assertEqual(sb.color.AZURE,     4)
        self.assertEqual(sb.color.TURQUOISE, 5)
        self.assertEqual(sb.color.GREEN,     6)
        self.assertEqual(sb.color.YELLOW,    7)
        self.assertEqual(sb.color.ORANGE,    8)
        self.assertEqual(sb.color.RED,       9)
        self.assertEqual(sb.color.WHITE,     10)
        self.assertEqual(sb.color.UNKNOWN,   -1)

    def test_color_sensor_returns_int(self):
        result = sb.color_sensor.color('E')
        self.assertIsInstance(result, int)
        self.assertEqual(result, -1)  # mock returns 'none' → -1


class TestPortConstants(unittest.TestCase):

    def test_port_strings(self):
        for p in ['A', 'B', 'C', 'D', 'E', 'F']:
            self.assertEqual(getattr(sb.port, p), p)


class TestStubModules(unittest.TestCase):

    def test_import_orientation(self):
        import orientation as o
        self.assertEqual(o.UP, 0)
        self.assertEqual(o.RIGHT, 1)
        self.assertEqual(o.DOWN, 2)
        self.assertEqual(o.LEFT, 3)

    def test_import_app_sound(self):
        import app as a
        a.sound.play('test')  # verify no exception; returns _Awaitable, not None

    def test_import_color_matrix(self):
        import color_matrix as cm
        cm.clear('A')  # no exception

    def test_import_device(self):
        import device as d
        self.assertEqual(d.id('A'), 0)
        self.assertFalse(d.ready('A'))
```

- [ ] **Step 4: Update test_wait.py — fix old motor_pair.move positional call**

`motor_pair.move`'s `velocity` is now keyword-only. Replace the old call in `TestRunloop.test_runloop_drives_simple_coroutine`:

```python
def test_runloop_drives_simple_coroutine(self):
    async def main():
        sb.wait(100)
        sb.motor_pair.move(0, 0, velocity=500)   # steering-only; velocity=kw
        sb.wait(200)

    sb.runloop.run(main())
    self.assertEqual(len(sb._cmds), 3)
    self.assertEqual(sb._cmds[0], {'type': 'wait', 'ms': 100})
    self.assertEqual(sb._cmds[1]['type'], 'start')
    self.assertEqual(sb._cmds[2], {'type': 'wait', 'ms': 200})
```

- [ ] **Step 5: Run the full test suite**

```bash
python3 tests/py/run.py
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add tests/py/test_motor.py tests/py/test_motor_pair.py tests/py/test_hub.py tests/py/test_wait.py
git commit -m "test: update Python tests for SPIKE3 API"
```

---

## Task 6: Swap Monaco into index.html

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Replace the CodeMirror CDN block and editor textarea**

Remove these lines:
```html
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/monokai.min.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/hint/show-hint.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/python/python.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/hint/show-hint.min.js"></script>
```

Add in their place:
```html
  <!-- Monaco Editor -->
  <script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs/loader.js"></script>
```

- [ ] **Step 2: Replace the textarea with a div**

Replace:
```html
        <textarea id="py-editor"></textarea>
```

With:
```html
        <div id="py-editor" style="height:100%"></div>
```

- [ ] **Step 3: Replace the autocomplete.js script tag**

Replace:
```html
<script src="js/autocomplete.js"></script>
```

With:
```html
<script src="js/monaco_config.js"></script>
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: swap CodeMirror for Monaco Editor CDN"
```

---

## Task 7: Update main.js for Monaco

**Files:**
- Modify: `js/main.js`

- [ ] **Step 1: Replace initEditor() and update the resize handler and DEFAULT_PYTHON_CODE**

Replace the entire `initEditor()` function (lines 59–85):

```js
function initEditor() {
  require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs' } });
  require(['vs/editor/editor.main'], () => {
    window.registerSpikeCompletions(monaco);
    editor = monaco.editor.create(document.getElementById('py-editor'), {
      value: DEFAULT_PYTHON_CODE,
      language: 'python',
      theme: 'vs-dark',
      fontSize: 14,
      minimap: { enabled: false },
      automaticLayout: true,
      tabSize: 4,
      insertSpaces: true,
      scrollBeyondLastLine: false,
      wordWrap: 'off',
    });
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      handleRun
    );
  });
}
```

- [ ] **Step 2: Update the resize handle mousemove handler**

Replace `if (editor) editor.refresh();` with `if (editor) editor.layout();` (two occurrences — one in the mousemove handler, one in `switchMode`).

- [ ] **Step 3: Update DEFAULT_PYTHON_CODE to use spec-correct API**

Replace the `DEFAULT_PYTHON_CODE` constant:

```js
const DEFAULT_PYTHON_CODE = `# FLL Virtual Robot — SPIKE Prime v3 Python API
from hub import port
import motor_pair, runloop

async def main():
    # Pair the drive motors (left = port.A, right = port.B)
    motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)

    # Move forward for 2 seconds at 360 deg/sec
    await motor_pair.move_for_time(motor_pair.PAIR_1, 2000, 0, velocity=360)

    # Turn right (left wheel forward, right wheel back)
    await motor_pair.move_tank_for_time(motor_pair.PAIR_1, 360, -360, 800)

    # Move forward again
    await motor_pair.move_for_time(motor_pair.PAIR_1, 1000, 0, velocity=360)

    print('Mission complete!')

runloop.run(main())
`;
```

- [ ] **Step 4: Commit**

```bash
git add js/main.js
git commit -m "feat: wire Monaco editor into main.js"
```

---

## Task 8: Create js/monaco_config.js

**Files:**
- Create: `js/monaco_config.js`
- Delete: `js/autocomplete.js`

- [ ] **Step 1: Create js/monaco_config.js**

```js
'use strict';

window.registerSpikeCompletions = function(monaco) {

  // ── API data ──────────────────────────────────────────────────────────────

  const SPIKE_API = {
    motor: {
      doc: 'Control individual motors on specified ports.',
      members: {
        run_for_degrees: {
          sig: 'motor.run_for_degrees(port, degrees, velocity, *, stop=BRAKE, acceleration=1000, deceleration=1000)',
          doc: 'Run motor for the given number of degrees.\n\n**port** — `port.A`–`port.F`\n**degrees** — rotation in degrees (negative = reverse)\n**velocity** — speed in deg/sec\n**stop** — `motor.BRAKE`, `motor.COAST`, `motor.HOLD`',
          params: ['port', 'degrees', 'velocity', 'stop', 'acceleration', 'deceleration'],
        },
        run_for_time: {
          sig: 'motor.run_for_time(port, duration, velocity, *, stop=BRAKE, acceleration=1000, deceleration=1000)',
          doc: 'Run motor for the given duration.\n\n**port** — `port.A`–`port.F`\n**duration** — time in ms\n**velocity** — speed in deg/sec (negative = reverse)',
          params: ['port', 'duration', 'velocity', 'stop', 'acceleration', 'deceleration'],
        },
        run_to_absolute_position: {
          sig: 'motor.run_to_absolute_position(port, position, velocity, *, direction=SHORTEST_PATH, stop=BRAKE, acceleration=1000, deceleration=1000)',
          doc: 'Run motor to an absolute position (0–359 degrees).\n\n**position** — target angle 0–359\n**direction** — `motor.CLOCKWISE`, `COUNTERCLOCKWISE`, or `SHORTEST_PATH`',
          params: ['port', 'position', 'velocity', 'direction', 'stop', 'acceleration', 'deceleration'],
        },
        run_to_relative_position: {
          sig: 'motor.run_to_relative_position(port, position, velocity, *, stop=BRAKE, acceleration=1000, deceleration=1000)',
          doc: 'Run motor to a position relative to the current position.\n\n**position** — degrees relative to current\n**velocity** — speed in deg/sec',
          params: ['port', 'position', 'velocity', 'stop', 'acceleration', 'deceleration'],
        },
        run: {
          sig: 'motor.run(port, velocity, *, acceleration=1000)',
          doc: 'Run motor continuously.\n\n**velocity** — speed in deg/sec (negative = reverse)',
          params: ['port', 'velocity', 'acceleration'],
        },
        stop: {
          sig: 'motor.stop(port, *, stop=BRAKE)',
          doc: 'Stop the motor.\n\n**stop** — `motor.COAST`, `motor.BRAKE`, or `motor.HOLD`',
          params: ['port', 'stop'],
        },
        velocity: {
          sig: 'motor.velocity(port) -> int',
          doc: 'Return the current velocity of the motor in deg/sec.',
          params: ['port'],
        },
        absolute_position: {
          sig: 'motor.absolute_position(port) -> int',
          doc: 'Return the absolute position of the motor (0–359 degrees).',
          params: ['port'],
        },
        relative_position: {
          sig: 'motor.relative_position(port) -> int',
          doc: 'Return the motor position relative to the last reset.',
          params: ['port'],
        },
        reset_relative_position: {
          sig: 'motor.reset_relative_position(port, position) -> None',
          doc: 'Reset the relative position counter.',
          params: ['port', 'position'],
        },
        get_duty_cycle: {
          sig: 'motor.get_duty_cycle(port) -> int',
          doc: 'Return the current PWM duty cycle (–10000 to 10000).',
          params: ['port'],
        },
        set_duty_cycle: {
          sig: 'motor.set_duty_cycle(port, pwm) -> None',
          doc: 'Set the motor PWM duty cycle.\n\n**pwm** — –10000 to 10000',
          params: ['port', 'pwm'],
        },
      },
      constants: {
        COAST: '0', BRAKE: '1', HOLD: '2', CONTINUE: '3',
        SMART_COAST: '4', SMART_BRAKE: '5',
        CLOCKWISE: '0', COUNTERCLOCKWISE: '1',
        SHORTEST_PATH: '2', LONGEST_PATH: '3',
        READY: '0', RUNNING: '1', STALLED: '2',
        CANCELLED: '3', ERROR: '4', DISCONNECTED: '5',
      },
    },

    motor_pair: {
      doc: 'Synchronized control for two motors moving a robot.',
      members: {
        pair: {
          sig: 'motor_pair.pair(pair, left_motor, right_motor) -> None',
          doc: 'Assign two motors to a pair.\n\n**pair** — `PAIR_1`, `PAIR_2`, or `PAIR_3`\n**left_motor** — port constant for the left wheel\n**right_motor** — port constant for the right wheel',
          params: ['pair', 'left_motor', 'right_motor'],
        },
        unpair: {
          sig: 'motor_pair.unpair(pair) -> None',
          doc: 'Remove the motor assignment from a pair.',
          params: ['pair'],
        },
        move: {
          sig: 'motor_pair.move(pair, steering, *, velocity=360, acceleration=1000) -> None',
          doc: 'Move continuously with the given steering.\n\n**steering** — –100 (full left) to 100 (full right), 0 = straight\n**velocity** — speed in deg/sec',
          params: ['pair', 'steering', 'velocity', 'acceleration'],
        },
        move_for_degrees: {
          sig: 'motor_pair.move_for_degrees(pair, degrees, steering, *, velocity=360, stop=motor.BRAKE, acceleration=1000, deceleration=1000)',
          doc: 'Move until motors rotate by the given degrees.\n\n**degrees** — wheel rotation\n**steering** — –100 to 100\n**velocity** — deg/sec',
          params: ['pair', 'degrees', 'steering', 'velocity', 'stop', 'acceleration', 'deceleration'],
        },
        move_for_time: {
          sig: 'motor_pair.move_for_time(pair, duration, steering, *, velocity=360, stop=motor.BRAKE, acceleration=1000, deceleration=1000)',
          doc: 'Move for the given duration.\n\n**duration** — time in ms\n**steering** — –100 to 100\n**velocity** — deg/sec',
          params: ['pair', 'duration', 'steering', 'velocity', 'stop', 'acceleration', 'deceleration'],
        },
        move_tank_for_time: {
          sig: 'motor_pair.move_tank_for_time(pair, left_velocity, right_velocity, duration, *, stop=motor.BRAKE, acceleration=1000, deceleration=1000)',
          doc: 'Move with independent wheel speeds for a duration.\n\n**left_velocity** — left wheel deg/sec\n**right_velocity** — right wheel deg/sec\n**duration** — ms',
          params: ['pair', 'left_velocity', 'right_velocity', 'duration', 'stop', 'acceleration', 'deceleration'],
        },
        stop: {
          sig: 'motor_pair.stop(pair, *, stop=motor.BRAKE) -> None',
          doc: 'Stop both motors in the pair.\n\n**stop** — `motor.COAST`, `motor.BRAKE`, or `motor.HOLD`',
          params: ['pair', 'stop'],
        },
      },
      constants: { PAIR_1: '0', PAIR_2: '1', PAIR_3: '2' },
    },

    color_sensor: {
      doc: 'Read color, reflection, and RGBI from the Color Sensor.',
      members: {
        color: {
          sig: 'color_sensor.color(port) -> int',
          doc: 'Return the detected color as a `color.*` constant.\n\nReturns `color.UNKNOWN` (-1) if no color is detected.',
          params: ['port'],
        },
        reflection: {
          sig: 'color_sensor.reflection(port) -> int',
          doc: 'Return the reflected light intensity (0–100).',
          params: ['port'],
        },
        rgbi: {
          sig: 'color_sensor.rgbi(port) -> tuple[int, int, int, int]',
          doc: 'Return (red, green, blue, intensity) values (0–1024 each).',
          params: ['port'],
        },
      },
    },

    distance_sensor: {
      doc: 'Measure distance and control the sensor face LEDs.',
      members: {
        distance: {
          sig: 'distance_sensor.distance(port) -> int',
          doc: 'Return distance to nearest object in mm. Returns –1 if no object detected.',
          params: ['port'],
        },
        clear: {
          sig: 'distance_sensor.clear(port) -> None',
          doc: 'Turn off all face LEDs.',
          params: ['port'],
        },
        get_pixel: {
          sig: 'distance_sensor.get_pixel(port, x, y) -> int',
          doc: 'Get brightness of a face LED (x and y: 0–4).',
          params: ['port', 'x', 'y'],
        },
        set_pixel: {
          sig: 'distance_sensor.set_pixel(port, x, y, intensity) -> None',
          doc: 'Set brightness of a face LED.\n\n**x**, **y** — 0–4\n**intensity** — 0–100',
          params: ['port', 'x', 'y', 'intensity'],
        },
        show: {
          sig: 'distance_sensor.show(port, pixels) -> None',
          doc: 'Set all 4 face LEDs at once.\n\n**pixels** — list of 4 intensity values (0–100)',
          params: ['port', 'pixels'],
        },
      },
    },

    force_sensor: {
      doc: 'Detect force and button presses.',
      members: {
        force: {
          sig: 'force_sensor.force(port) -> int',
          doc: 'Return force in decinewtons (0–100).',
          params: ['port'],
        },
        pressed: {
          sig: 'force_sensor.pressed(port) -> bool',
          doc: 'Return True if the button is pressed.',
          params: ['port'],
        },
        raw: {
          sig: 'force_sensor.raw(port) -> int',
          doc: 'Return the raw sensor value.',
          params: ['port'],
        },
      },
    },

    color: {
      doc: 'Color constants (integers) used with color_sensor and comparisons.',
      members: {},
      constants: {
        BLACK: '0', MAGENTA: '1', PURPLE: '2', BLUE: '3', AZURE: '4',
        TURQUOISE: '5', GREEN: '6', YELLOW: '7', ORANGE: '8',
        RED: '9', WHITE: '10', UNKNOWN: '-1',
      },
    },

    hub: {
      doc: 'Access hub hardware: light_matrix, sound, motion_sensor, button, light.',
      members: {
        device_uuid: { sig: 'hub.device_uuid() -> str', doc: 'Return the hub device UUID.', params: [] },
        hardware_id: { sig: 'hub.hardware_id() -> str', doc: 'Return the hardware ID string.', params: [] },
        temperature:  { sig: 'hub.temperature() -> int', doc: 'Return hub temperature in decidegrees Celsius.', params: [] },
        power_off:    { sig: 'hub.power_off() -> int', doc: 'Power off the hub.', params: [] },
      },
      constants: {},
    },

    'hub.light_matrix': {
      doc: '5×5 LED matrix on the hub.',
      members: {
        write: {
          sig: 'hub.light_matrix.write(text, intensity=100, time_per_character=500) -> Awaitable',
          doc: 'Scroll text across the display.\n\n**text** — string\n**intensity** — brightness 0–100\n**time_per_character** — ms per character',
          params: ['text', 'intensity', 'time_per_character'],
        },
        show: {
          sig: 'hub.light_matrix.show(pixels) -> None',
          doc: 'Set all 25 pixels at once.\n\n**pixels** — list of 25 intensity values (0–100)',
          params: ['pixels'],
        },
        show_image: {
          sig: 'hub.light_matrix.show_image(image) -> None',
          doc: 'Display a built-in image (e.g. `hub.light_matrix.IMAGE_HAPPY`).',
          params: ['image'],
        },
        set_pixel: {
          sig: 'hub.light_matrix.set_pixel(x, y, intensity=100) -> None',
          doc: 'Set a single pixel brightness.\n\n**x**, **y** — 0–4 (x=0 left, y=0 top)',
          params: ['x', 'y', 'intensity'],
        },
        get_pixel: {
          sig: 'hub.light_matrix.get_pixel(x, y) -> int',
          doc: 'Return brightness of a pixel (0–100).',
          params: ['x', 'y'],
        },
        clear: {
          sig: 'hub.light_matrix.clear() -> None',
          doc: 'Turn off all pixels.',
          params: [],
        },
        off: {
          sig: 'hub.light_matrix.off() -> None',
          doc: 'Turn off all pixels (alias for clear).',
          params: [],
        },
        get_orientation: {
          sig: 'hub.light_matrix.get_orientation() -> int',
          doc: 'Return the current display orientation constant.',
          params: [],
        },
        set_orientation: {
          sig: 'hub.light_matrix.set_orientation(top) -> int',
          doc: 'Set the display orientation.\n\n**top** — `orientation.UP`, `DOWN`, `LEFT`, or `RIGHT`',
          params: ['top'],
        },
      },
    },

    'hub.sound': {
      doc: 'Play sounds through the hub speaker.',
      members: {
        beep: {
          sig: 'hub.sound.beep(freq=440, duration=500, volume=100, *, attack=0, decay=0, sustain=100, release=0, transition=10)',
          doc: 'Play a beep.\n\n**freq** — frequency in Hz (440 = A4)\n**duration** — ms\n**volume** — 0–100',
          params: ['freq', 'duration', 'volume', 'attack', 'decay', 'sustain', 'release', 'transition'],
        },
        stop: {
          sig: 'hub.sound.stop() -> None',
          doc: 'Stop any currently playing sound.',
          params: [],
        },
        volume: {
          sig: 'hub.sound.volume(volume) -> None',
          doc: 'Set the speaker volume (0–100).',
          params: ['volume'],
        },
      },
    },

    'hub.motion_sensor': {
      doc: 'Inertial measurement unit (IMU) on the hub.',
      members: {
        tilt_angles: {
          sig: 'hub.motion_sensor.tilt_angles() -> tuple[int, int, int]',
          doc: 'Return (yaw, pitch, roll) in decidegrees.',
          params: [],
        },
        angular_velocity: {
          sig: 'hub.motion_sensor.angular_velocity(raw_unfiltered=False) -> tuple[int, int, int]',
          doc: 'Return angular velocity in decideg/sec around (x, y, z).',
          params: ['raw_unfiltered'],
        },
        acceleration: {
          sig: 'hub.motion_sensor.acceleration(raw_unfiltered=False) -> tuple[int, int, int]',
          doc: 'Return acceleration in milli-G on (x, y, z).',
          params: ['raw_unfiltered'],
        },
        reset_yaw: {
          sig: 'hub.motion_sensor.reset_yaw(angle=0) -> None',
          doc: 'Reset the yaw angle to the given value.',
          params: ['angle'],
        },
        gesture: {
          sig: 'hub.motion_sensor.gesture() -> int',
          doc: 'Return the most recent gesture: `TAPPED`, `DOUBLE_TAPPED`, `SHAKEN`, `FALLING`, or `UNKNOWN`.',
          params: [],
        },
        stable: {
          sig: 'hub.motion_sensor.stable() -> bool',
          doc: 'Return True if the hub is stationary.',
          params: [],
        },
        up_face: {
          sig: 'hub.motion_sensor.up_face() -> int',
          doc: 'Return which hub face points up.',
          params: [],
        },
      },
      constants: {
        TAPPED: '0', DOUBLE_TAPPED: '1', SHAKEN: '2', FALLING: '3', UNKNOWN: '-1',
        TOP: '0', FRONT: '1', RIGHT: '2', BOTTOM: '3', BACK: '4', LEFT: '5',
      },
    },

    'hub.button': {
      doc: 'Read the hub left and right buttons.',
      members: {
        pressed: {
          sig: 'hub.button.pressed(button) -> int',
          doc: 'Return ms the button has been held, or 0 if not pressed.\n\n**button** — `hub.button.LEFT` or `hub.button.RIGHT`',
          params: ['button'],
        },
        was_pressed: {
          sig: 'hub.button.was_pressed(button) -> bool',
          doc: 'Return True if button was pressed since last call.',
          params: ['button'],
        },
      },
      constants: { LEFT: '1', RIGHT: '2' },
    },

    'hub.light': {
      doc: 'Control hub indicator lights.',
      members: {
        color: {
          sig: 'hub.light.color(light, color) -> None',
          doc: 'Set the color of an indicator light.\n\n**light** — `hub.light.POWER` or `hub.light.CONNECT`\n**color** — a `color.*` constant',
          params: ['light', 'color'],
        },
      },
      constants: { POWER: '0', CONNECT: '1' },
    },

    runloop: {
      doc: 'Asynchronous event loop for running coroutines.',
      members: {
        run: {
          sig: 'runloop.run(*functions) -> None',
          doc: 'Run one or more async functions to completion.\n\n**Usage:** `runloop.run(main())`',
          params: ['functions'],
        },
        sleep_ms: {
          sig: 'runloop.sleep_ms(duration) -> Awaitable',
          doc: 'Pause for the given duration.\n\n**duration** — ms\n\n**Usage:** `await runloop.sleep_ms(500)`',
          params: ['duration'],
        },
        until: {
          sig: 'runloop.until(function, timeout=0) -> Awaitable',
          doc: 'Pause until `function()` returns True.\n\n**function** — callable returning bool\n**timeout** — ms (0 = no timeout)',
          params: ['function', 'timeout'],
        },
      },
    },

    port: {
      doc: 'Port constants for connecting sensors and motors.',
      members: {},
      constants: { A: '0', B: '1', C: '2', D: '3', E: '4', F: '5' },
    },

    orientation: {
      doc: 'Display orientation constants for hub.light_matrix.set_orientation().',
      members: {},
      constants: { UP: '0', RIGHT: '1', DOWN: '2', LEFT: '3' },
    },

    device: {
      doc: 'Low-level device access for connected sensors and motors.',
      members: {
        id:            { sig: 'device.id(port) -> int',            doc: 'Return the device type ID.', params: ['port'] },
        data:          { sig: 'device.data(port) -> tuple[int]',   doc: 'Return raw sensor data.', params: ['port'] },
        ready:         { sig: 'device.ready(port) -> bool',        doc: 'Return True if device is ready.', params: ['port'] },
        get_duty_cycle:{ sig: 'device.get_duty_cycle(port) -> int',doc: 'Return the PWM duty cycle.', params: ['port'] },
        set_duty_cycle:{ sig: 'device.set_duty_cycle(port, duty_cycle) -> None', doc: 'Set the PWM duty cycle.', params: ['port', 'duty_cycle'] },
      },
    },

    color_matrix: {
      doc: 'Control the 3×3 Color Matrix accessory.',
      members: {
        clear:     { sig: 'color_matrix.clear(port) -> None',                       doc: 'Turn off all pixels.', params: ['port'] },
        get_pixel: { sig: 'color_matrix.get_pixel(port, x, y) -> tuple[int, int]',  doc: 'Return (color, intensity) of a pixel.', params: ['port', 'x', 'y'] },
        set_pixel: { sig: 'color_matrix.set_pixel(port, x, y, pixel) -> None',      doc: 'Set a pixel. **pixel** = (color, intensity).', params: ['port', 'x', 'y', 'pixel'] },
        show:      { sig: 'color_matrix.show(port, pixels) -> None',                doc: 'Set all 9 pixels. **pixels** = list of (color, intensity) tuples.', params: ['port', 'pixels'] },
      },
    },

    app: {
      doc: 'Communicate with the SPIKE App (stubs — no-op in simulator).',
      members: {},
    },

    'app.sound': {
      doc: 'Play sounds through the app (no-op in simulator).',
      members: {
        play:           { sig: 'app.sound.play(sound_name, volume=100, pitch=0, pan=0) -> Awaitable', doc: 'Play a sound by name.', params: ['sound_name', 'volume', 'pitch', 'pan'] },
        stop:           { sig: 'app.sound.stop() -> None',                                            doc: 'Stop app sounds.', params: [] },
        set_attributes: { sig: 'app.sound.set_attributes(volume, pitch, pan) -> None',                doc: 'Set default playback attributes.', params: ['volume', 'pitch', 'pan'] },
      },
    },

    'app.music': {
      doc: 'Play instruments and drums through the app (no-op in simulator).',
      members: {
        play_drum:       { sig: 'app.music.play_drum(drum) -> None',                        doc: 'Play a drum. Use `app.music.DRUM_*` constants.', params: ['drum'] },
        play_instrument: { sig: 'app.music.play_instrument(instrument, note, duration) -> None', doc: 'Play an instrument note.\n\n**instrument** — `app.music.INSTRUMENT_*`\n**note** — MIDI 0–127\n**duration** — ms', params: ['instrument', 'note', 'duration'] },
      },
      constants: {
        DRUM_SNARE: '1', DRUM_BASS: '2', DRUM_SIDE_STICK: '3', DRUM_CRASH_CYMBAL: '4',
        INSTRUMENT_PIANO: '1', INSTRUMENT_ELECTRIC_PIANO: '2', INSTRUMENT_ORGAN: '3',
        INSTRUMENT_GUITAR: '4', INSTRUMENT_ELECTRIC_GUITAR: '5', INSTRUMENT_BASS: '6',
        INSTRUMENT_FLUTE: '12', INSTRUMENT_VIBRAPHONE: '16', INSTRUMENT_SYNTH_LEAD: '20',
      },
    },

    'app.display': {
      doc: 'Show images on the app display (no-op in simulator).',
      members: {
        show:  { sig: 'app.display.show(fullscreen=False) -> None', doc: 'Show the display panel.', params: ['fullscreen'] },
        hide:  { sig: 'app.display.hide() -> None',                 doc: 'Hide the display panel.', params: [] },
        image: { sig: 'app.display.image(image) -> None',           doc: 'Show a built-in image.', params: ['image'] },
        text:  { sig: 'app.display.text(text) -> None',             doc: 'Display a text string.', params: ['text'] },
      },
      constants: {
        IMAGE_ROBOT_1: '1', IMAGE_ROBOT_2: '2', IMAGE_ROBOT_3: '3',
        IMAGE_BEACH: '7', IMAGE_MOON: '9', IMAGE_RAINBOW: '10', IMAGE_RANDOM: '21',
      },
    },

    'app.bargraph': {
      doc: 'Show bar graph data in the app (no-op in simulator).',
      members: {
        show:      { sig: 'app.bargraph.show(fullscreen=False) -> None',  doc: 'Show the bar graph.',          params: ['fullscreen'] },
        hide:      { sig: 'app.bargraph.hide() -> None',                  doc: 'Hide the bar graph.',          params: [] },
        set_value: { sig: 'app.bargraph.set_value(color, value) -> None', doc: 'Set a bar value.',             params: ['color', 'value'] },
        change:    { sig: 'app.bargraph.change(color, value) -> None',    doc: 'Change a bar value.',          params: ['color', 'value'] },
        get_value: { sig: 'app.bargraph.get_value(color) -> Awaitable',   doc: 'Get the current bar value.',   params: ['color'] },
        clear_all: { sig: 'app.bargraph.clear_all() -> None',             doc: 'Clear all bars.',              params: [] },
      },
    },

    'app.linegraph': {
      doc: 'Show line graph data in the app (no-op in simulator).',
      members: {
        show:        { sig: 'app.linegraph.show(fullscreen=False) -> None',   doc: 'Show the line graph.',          params: ['fullscreen'] },
        hide:        { sig: 'app.linegraph.hide() -> None',                   doc: 'Hide the line graph.',          params: [] },
        plot:        { sig: 'app.linegraph.plot(color, x, y) -> None',        doc: 'Add a data point.',             params: ['color', 'x', 'y'] },
        clear:       { sig: 'app.linegraph.clear(color) -> None',             doc: 'Clear a specific line.',        params: ['color'] },
        clear_all:   { sig: 'app.linegraph.clear_all() -> None',              doc: 'Clear all lines.',              params: [] },
        get_last:    { sig: 'app.linegraph.get_last(color) -> Awaitable',     doc: 'Get the last plotted value.',   params: ['color'] },
        get_average: { sig: 'app.linegraph.get_average(color) -> Awaitable',  doc: 'Get the average value.',        params: ['color'] },
        get_min:     { sig: 'app.linegraph.get_min(color) -> Awaitable',      doc: 'Get the minimum value.',        params: ['color'] },
        get_max:     { sig: 'app.linegraph.get_max(color) -> Awaitable',      doc: 'Get the maximum value.',        params: ['color'] },
      },
    },
  };

  // Top-level global names (shown before a dot)
  const SPIKE_GLOBALS = [
    'motor', 'motor_pair', 'color_sensor', 'distance_sensor', 'force_sensor',
    'hub', 'color', 'port', 'wait', 'runloop', 'orientation',
    'device', 'color_matrix', 'app',
  ];

  const MICROPYTHON_BUILTINS = [
    'abs', 'all', 'any', 'bin', 'bool', 'bytearray', 'bytes', 'callable',
    'chr', 'dict', 'dir', 'divmod', 'enumerate', 'filter', 'float',
    'format', 'getattr', 'globals', 'hasattr', 'hex', 'id', 'int',
    'isinstance', 'issubclass', 'iter', 'len', 'list', 'map', 'max',
    'min', 'next', 'object', 'oct', 'ord', 'pow', 'print', 'range',
    'repr', 'reversed', 'round', 'set', 'setattr', 'sorted', 'str',
    'sum', 'super', 'tuple', 'type', 'zip',
    'True', 'False', 'None',
    'async', 'await', 'def', 'class', 'if', 'else', 'elif', 'for',
    'while', 'return', 'import', 'from', 'pass', 'break', 'continue',
    'try', 'except', 'finally', 'raise', 'with', 'lambda', 'yield',
    'and', 'or', 'not', 'in', 'is',
  ];

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function resolveApi(path) {
    return SPIKE_API[path] || null;
  }

  function makeRange(model, position, partialLen) {
    return {
      startLineNumber: position.lineNumber,
      endLineNumber:   position.lineNumber,
      startColumn:     position.column - partialLen,
      endColumn:       position.column,
    };
  }

  // ── CompletionItemProvider ───────────────────────────────────────────────────

  monaco.languages.registerCompletionItemProvider('python', {
    triggerCharacters: ['.'],

    provideCompletionItems(model, position) {
      const line   = model.getLineContent(position.lineNumber);
      const before = line.slice(0, position.column - 1);

      // Dot completion — match the object path before the dot
      const dotMatch = before.match(/([a-zA-Z_][a-zA-Z0-9_.]*)\.([\w]*)$/);
      if (dotMatch) {
        const path    = dotMatch[1];
        const partial = dotMatch[2];
        const node    = resolveApi(path);
        if (!node) return { suggestions: [] };

        const range       = makeRange(model, position, partial.length);
        const suggestions = [];

        for (const [name, info] of Object.entries(node.members || {})) {
          if (!name.startsWith(partial)) continue;
          suggestions.push({
            label:             name,
            kind:              monaco.languages.CompletionItemKind.Method,
            detail:            info.sig,
            documentation:     { value: info.doc, isTrusted: true },
            insertText:        name + '($0)',
            insertTextRules:   monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
          });
        }

        for (const [name, value] of Object.entries(node.constants || {})) {
          if (!name.startsWith(partial)) continue;
          suggestions.push({
            label:         name,
            kind:          monaco.languages.CompletionItemKind.Constant,
            detail:        `= ${value}`,
            documentation: { value: `**${path}.${name}** = \`${value}\`` },
            insertText:    name,
            range,
          });
        }

        return { suggestions };
      }

      // Global completion
      const wordMatch = before.match(/([a-zA-Z_][a-zA-Z0-9_]*)$/);
      const partial2  = wordMatch ? wordMatch[1] : '';
      if (!partial2) return { suggestions: [] };

      const range2      = makeRange(model, position, partial2.length);
      const suggestions = [];

      for (const name of SPIKE_GLOBALS) {
        if (!name.startsWith(partial2)) continue;
        const node = SPIKE_API[name];
        suggestions.push({
          label:         name,
          kind:          monaco.languages.CompletionItemKind.Module,
          detail:        node?.doc || '',
          documentation: { value: node?.doc || '' },
          insertText:    name,
          range:         range2,
        });
      }

      for (const w of MICROPYTHON_BUILTINS) {
        if (!w.startsWith(partial2)) continue;
        suggestions.push({
          label:      w,
          kind:       monaco.languages.CompletionItemKind.Keyword,
          insertText: w,
          range:      range2,
        });
      }

      return { suggestions };
    },
  });

  // ── SignatureHelpProvider ────────────────────────────────────────────────────

  monaco.languages.registerSignatureHelpProvider('python', {
    signatureHelpTriggerCharacters:    ['(', ','],
    signatureHelpRetriggerCharacters:  [','],

    provideSignatureHelp(model, position) {
      const line   = model.getLineContent(position.lineNumber);
      const before = line.slice(0, position.column - 1);

      // Walk backward to find the innermost unclosed '('
      let depth = 0, callStart = -1;
      for (let i = before.length - 1; i >= 0; i--) {
        if (before[i] === ')') { depth++; }
        else if (before[i] === '(') {
          if (depth === 0) { callStart = i; break; }
          depth--;
        }
      }
      if (callStart === -1) return null;

      // Extract the function/method path before '('
      const funcMatch = before.slice(0, callStart).match(/([a-zA-Z_][a-zA-Z0-9_.]+)$/);
      if (!funcMatch) return null;

      const fullPath   = funcMatch[1];
      const lastDot    = fullPath.lastIndexOf('.');
      if (lastDot === -1) return null;

      const objPath    = fullPath.slice(0, lastDot);
      const methodName = fullPath.slice(lastDot + 1);
      const node       = resolveApi(objPath);
      if (!node?.members?.[methodName]) return null;

      const info         = node.members[methodName];
      const argsText     = before.slice(callStart + 1);
      const activeParam  = (argsText.match(/,/g) || []).length;

      return {
        value: {
          signatures: [{
            label:         info.sig,
            documentation: { value: info.doc },
            parameters:    (info.params || []).map(p => ({ label: p })),
          }],
          activeSignature: 0,
          activeParameter: Math.min(activeParam, (info.params || []).length - 1),
        },
        dispose() {},
      };
    },
  });

  // ── HoverProvider ────────────────────────────────────────────────────────────

  monaco.languages.registerHoverProvider('python', {
    provideHover(model, position) {
      const line  = model.getLineContent(position.lineNumber);
      const col   = position.column - 1;

      // Expand selection left and right to capture dotted identifier
      let start = col, end = col;
      while (start > 0 && /[\w.]/.test(line[start - 1])) start--;
      while (end < line.length && /[\w.]/.test(line[end])) end++;
      const fullWord = line.slice(start, end);

      // Try dotted path (e.g. hub.light_matrix.write)
      const lastDot = fullWord.lastIndexOf('.');
      if (lastDot !== -1) {
        const objPath    = fullWord.slice(0, lastDot);
        const memberName = fullWord.slice(lastDot + 1);
        const node       = resolveApi(objPath);
        if (node?.members?.[memberName]) {
          const info = node.members[memberName];
          return {
            contents: [
              { value: '```python\n' + info.sig + '\n```' },
              { value: info.doc },
            ],
          };
        }
        // Hover on the object itself
        const objNode = resolveApi(objPath);
        if (objNode?.doc) {
          return { contents: [{ value: `**${objPath}** — ${objNode.doc}` }] };
        }
      }

      // Top-level module hover
      const node = resolveApi(fullWord);
      if (node?.doc) {
        return { contents: [{ value: `**${fullWord}** — ${node.doc}` }] };
      }

      return null;
    },
  });
};
```

- [ ] **Step 2: Delete js/autocomplete.js**

```bash
git rm js/autocomplete.js
```

- [ ] **Step 3: Commit**

```bash
git add js/monaco_config.js
git commit -m "feat: add Monaco completion/signature/hover providers for SPIKE3 API"
```

---

## Task 9: Final verification

**Files:** none (manual tests)

- [ ] **Step 1: Run JS tests**

```bash
node tests/js/run.js
```

Expected: all pass.

- [ ] **Step 2: Run Python tests**

```bash
python3 tests/py/run.py
```

Expected: all pass.

- [ ] **Step 3: Start the dev server and verify in browser**

```bash
python3 -m http.server 8787
```

Open http://localhost:8787 and verify:
- Page loads without JS errors in console
- Monaco editor renders with the default Python code
- Typing `motor_pair.` triggers a completion dropdown with method signatures
- Typing `motor_pair.move_for_time(` shows a signature help bar with parameter names highlighted
- Hovering over `motor_pair` shows a tooltip with the module description
- Ctrl+Enter runs the code and animates the robot
- Speed slider, Stop, and Reset buttons work

- [ ] **Step 4: Push the branch**

```bash
git push -u origin feature/spike3-api-monaco
```
