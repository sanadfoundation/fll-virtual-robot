# SPIKE 3 API Alignment + Monaco Editor

**Date:** 2026-05-03  
**Status:** Approved

## Problem

The current Python bridge (`py/spike_bridge.py`) implements a partial, non-standard SPIKE Prime v3 API:
- `color` constants are strings (`'black'`) instead of integers (`BLACK=0`)
- `motor_pair` has non-spec methods (`move_for_rotations`, `start_tank`, `start_at_power`) and wrong signatures
- `hub.motion` should be `hub.motion_sensor`
- `runloop` is missing `sleep_ms()` and `until()`
- Many official modules are absent (`app`, `color_matrix`, `device`, `orientation`)

The editor (CodeMirror 5) shows plain-text completion lists with no API documentation. Students must look up method signatures externally.

## Goal

1. Re-implement `spike_bridge.py` to match the official LEGO SPIKE Prime Python API exactly
2. Replace CodeMirror 5 with Monaco Editor for rich in-editor documentation
3. No build step — all dependencies loaded from CDN

## Reference API

Source: https://spike.legoeducation.com/prime/modal/help/lls-help-python

---

## Section 1: Python API Changes

### `color` module

**Change:** Integer constants replacing strings.

```python
class color:
    BLACK    = 0
    MAGENTA  = 1
    PURPLE   = 2
    BLUE     = 3
    AZURE    = 4
    TURQUOISE = 5
    GREEN    = 6
    YELLOW   = 7
    ORANGE   = 8
    RED      = 9
    WHITE    = 10
    UNKNOWN  = -1
```

### `motor` module

**Add constants:**
```python
READY=0, RUNNING=1, STALLED=2, CANCELLED=3, ERROR=4, DISCONNECTED=5
COAST=0, BRAKE=1, HOLD=2, CONTINUE=3, SMART_COAST=4, SMART_BRAKE=5
CLOCKWISE=0, COUNTERCLOCKWISE=1, SHORTEST_PATH=2, LONGEST_PATH=3
```

**Add methods:**
- `velocity(port) -> int` — current velocity in deg/sec
- `absolute_position(port) -> int` — absolute position (0–359)
- `relative_position(port) -> int` — relative position since last reset
- `reset_relative_position(port, position) -> None`
- `set_duty_cycle(port, pwm) -> None` — raw PWM (–10000 to 10000)
- `get_duty_cycle(port) -> int`

**Update default velocity:** `360` (was `500`)

**Existing methods stay:** `run_for_degrees`, `run_for_time`, `run_to_absolute_position`, `run_to_relative_position`, `run`, `stop`

### `motor_pair` module

**Updated signatures (all become spec-compliant):**
```python
move_for_time(pair, duration, steering, *, velocity=360, stop=motor.BRAKE, acceleration=1000, deceleration=1000)
move_for_degrees(pair, degrees, steering, *, velocity=360, stop=motor.BRAKE, acceleration=1000, deceleration=1000)
move_tank_for_time(pair, left_velocity, right_velocity, duration, *, stop=motor.BRAKE, acceleration=1000, deceleration=1000)
move(pair, steering, *, velocity=360, acceleration=1000)   # continuous
stop(pair, *, stop=motor.BRAKE)
pair(pair, left_motor, right_motor)
unpair(pair)
```

**Remove (non-spec):** `move_for_rotations`, `start`, `start_tank`, `start_at_power`, `get_default_speed`

**Keep as compat alias (not shown in completions):** `move_tank` → maps internally to `move_tank_for_time`-style dispatch so existing programs don't break

### `color_sensor` module

**Remove:** `ambient_light()`, `rgb()`  
**Keep:** `color(port) -> int`, `reflection(port) -> int`, `rgbi(port) -> tuple[int,int,int,int]`

`color()` now calls `window.getColorSensorColorInt()` and returns an integer matching `color.*` constants.

### `distance_sensor` module

**Remove:** `get_distance_cm()`, `get_distance_inches()`  
**Keep:** `distance(port) -> int` (returns –1 if no object detected)  
**Add (no-op stubs — no simulator equivalent):** `clear(port)`, `get_pixel(port, x, y)`, `set_pixel(port, x, y, intensity)`, `show(port, pixels)`

### `hub` module

**Rename:** `hub.motion` → `hub.motion_sensor`  
`hub.motion_sensor.reset_yaw_angle()` → `hub.motion_sensor.reset_yaw(angle=0)`  
`hub.motion_sensor.get_yaw_angle()` removed; `tilt_angles()` returns decidegrees tuple

**`hub.sound.beep` updated signature:**
```python
beep(freq=440, duration=500, volume=100, *, attack=0, decay=0, sustain=100, release=0, transition=10)
```

**Add `hub.light`** (stub):
```python
hub.light.color(light, color)  # no-op
```
Constants: `hub.light.POWER=0`, `hub.light.CONNECT=1`

**Add hub-level stubs:**
```python
hub.device_uuid() -> str      # returns 'simulator'
hub.hardware_id() -> str      # returns 'simulator'
hub.power_off() -> int        # no-op, returns 0
hub.temperature() -> int      # returns 250 (25.0°C)
```

**`hub.button.pressed(button)`** — now returns `int` (ms held) instead of `bool`. Return `0` as stub.

### `runloop` module

**Add:**
```python
runloop.sleep_ms(duration)  # queues a wait command
runloop.until(fn, timeout=0)  # stub no-op (returns _Awaitable)
```
`runloop.run(*functions)` — already works, no change needed.

### New stub modules

All modules below are injected into `sys.modules` so `import` succeeds. All methods are no-ops returning `None` or sensible defaults.

**`orientation`** — constants only: `UP=0`, `RIGHT=1`, `DOWN=2`, `LEFT=3`

**`device`**:
```python
device.data(port), device.id(port), device.ready(port),
device.get_duty_cycle(port), device.set_duty_cycle(port, dc)
```

**`color_matrix`**:
```python
color_matrix.clear(port), color_matrix.get_pixel(port, x, y),
color_matrix.set_pixel(port, x, y, pixel), color_matrix.show(port, pixels)
```

**`app`** — sub-module object with:
- `app.sound.play()`, `app.sound.stop()`, `app.sound.set_attributes()`
- `app.music.play_drum()`, `app.music.play_instrument()` + all DRUM_*/INSTRUMENT_* constants
- `app.display.show()`, `app.display.hide()`, `app.display.image()`, `app.display.text()` + IMAGE_* constants
- `app.bargraph.show()`, `app.bargraph.hide()`, `app.bargraph.set_value()`, `app.bargraph.get_value()`, `app.bargraph.change()`, `app.bargraph.clear_all()`
- `app.linegraph.show()`, `app.linegraph.hide()`, `app.linegraph.plot()`, `app.linegraph.clear()`, `app.linegraph.clear_all()`, `app.linegraph.get_last()`, `app.linegraph.get_average()`, `app.linegraph.get_min()`, `app.linegraph.get_max()`

---

## Section 2: Color System

The simulator stores color internally as CSS strings (e.g. `'black'`, `'magenta'`) for canvas rendering and Blockly. No change to internal representation.

**Add to `js/simulator.js`:**
```js
const COLOR_INT_MAP = {
  none: -1, black: 0, magenta: 1, purple: 2, blue: 3,
  azure: 4, turquoise: 5, green: 6, yellow: 7, orange: 8, red: 9, white: 10
};
// new method:
getColorSensorColorInt() { return COLOR_INT_MAP[this.getColorSensorColor()] ?? -1; }
```

**Add to `js/main.js`:**
```js
window.getColorSensorColorInt = () => sim?.getColorSensorColorInt() ?? -1;
```

**`py/spike_bridge.py`:** `color_sensor.color(port)` calls `window.getColorSensorColorInt()`.

**Blockly** (`blockly_config.js`): No change. Blockly's `_COLORS` stays string-based, and `getColorSensorColor()` still returns strings for Blockly comparisons.

**Sensor panel** (`index.html`): No change — already displays the string name from `getColorSensorColor()`.

---

## Section 3: Monaco Editor

### `index.html`

**Remove:**
```html
<link rel="stylesheet" href=".../codemirror.min.css">
<link rel="stylesheet" href=".../monokai.min.css">
<link rel="stylesheet" href=".../show-hint.min.css">
<script src=".../codemirror.min.js"></script>
<script src=".../python.min.js"></script>
<script src=".../show-hint.min.js"></script>
```

**Add:**
```html
<script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs/loader.js"></script>
```

**Replace:** `<textarea id="py-editor">` → `<div id="py-editor" style="height:100%"></div>`

### `js/main.js`

`initEditor()` wraps Monaco's AMD require:
```js
function initEditor() {
  require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs' } });
  require(['vs/editor/editor.main'], () => {
    window.registerSpikeCompletions(monaco);  // from monaco_config.js
    editor = monaco.editor.create(document.getElementById('py-editor'), {
      value: DEFAULT_PYTHON_CODE,
      language: 'python',
      theme: 'vs-dark',
      fontSize: 14,
      minimap: { enabled: false },
      automaticLayout: true,
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, handleRun);
  });
}
```

**API adaptations:**
- `editor.getValue()` — unchanged
- `editor.setValue(v)` → `editor.setValue(v)` — unchanged  
- `editor.refresh()` → `editor.layout()` (resize handle)
- Remove `editor.on('inputRead', ...)` — Monaco triggers completions automatically on `.`

### `js/autocomplete.js` → replaced by `js/monaco_config.js`

New file. Exports `window.registerSpikeCompletions(monaco)` which registers three providers on the `'python'` language.

---

## Section 4: Completion Data & Providers

### Data structure

```js
const SPIKE_API = {
  motor_pair: {
    doc: 'Synchronized dual-motor control.',
    members: {
      move_for_time: {
        sig: 'move_for_time(pair, duration, steering, *, velocity=360, stop=BRAKE, acceleration=1000, deceleration=1000)',
        doc: 'Move paired motors for `duration` milliseconds.\n\n**pair** `PAIR_1/2/3`\n**duration** ms\n**steering** –100 to 100\n**velocity** deg/sec',
        params: ['pair', 'duration', 'steering', 'velocity', 'stop', 'acceleration', 'deceleration'],
      },
      // ... all methods
    },
    constants: { PAIR_1: '0', PAIR_2: '1', PAIR_3: '2' },
  },
  // motor, color_sensor, distance_sensor, force_sensor,
  // hub, 'hub.light_matrix', 'hub.sound', 'hub.motion_sensor', 'hub.button', 'hub.light'
  // runloop, color, port, orientation, app, device, color_matrix
};
```

Sub-objects (`hub.light_matrix`, `hub.sound`, etc.) are keyed by dotted path and resolved by parsing the token before the cursor's `.`.

### `CompletionItemProvider`

Triggered on `.`. Parses the identifier path before the cursor (e.g. `hub.light_matrix`), looks up `SPIKE_API[path].members`, returns `CompletionItem[]` with:
- `label` — method/constant name
- `kind` — `Method` or `Constant`
- `detail` — full signature string
- `documentation` — `{ value: markdownDoc, isTrusted: true }`
- `insertText` — for methods, a snippet with `$1` placeholders for required params

Also provides global-level completions (module names, `wait`, `print`) when no dot context.

### `SignatureHelpProvider`

Triggered on `(` and `,`. Scans backward from cursor to find the function name, looks it up in `SPIKE_API`, returns `SignatureInformation` with `parameters` array. The active parameter index is determined by counting unbalanced commas.

### `HoverProvider`

On hover over a known identifier or dotted path, returns a `MarkedString` with the full signature and doc string.

---

## Files Changed

| File | Change |
|------|--------|
| `py/spike_bridge.py` | Full rewrite to spec |
| `js/main.js` | Replace `initEditor()` for Monaco, add `getColorSensorColorInt` bridge |
| `js/simulator.js` | Add `COLOR_INT_MAP` + `getColorSensorColorInt()` |
| `js/autocomplete.js` | Delete |
| `js/monaco_config.js` | New — completion data + three providers |
| `index.html` | Swap CDN tags, textarea→div for editor mount |
| `tests/py/*.py` | Update for new API signatures |

Blockly (`js/blockly_config.js`) and `css/style.css` are **not changed**.

---

## Non-Goals

- Implementing `app.*` visuals (bargraph, linegraph, display images) in the simulator canvas
- Blockly blocks for the new API methods
- Changing the Blockly color system to integers
