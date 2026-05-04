# Port Configuration Visibility & Enforcement

**Date:** 2026-05-04
**Status:** Draft

## Problem

The simulator's port wiring is implicit and unenforced:

- `color_sensor.color(port)` and `distance_sensor.distance(port)` ignore the port argument — every port returns the same value (`py/spike_bridge.py:227`, `py/spike_bridge.py:243`).
- `motor.run(port.C)` silently does nothing if `C` isn't paired (`js/simulator.js:596` — `_animateSingleMotor` waits but moves nothing visible).
- The simulator's robot state declares `colorPort: 'E'` and `distancePort: 'F'` (`js/simulator.js:78-82`) but neither field is read anywhere.
- The right-side panel labelled "Robot State" surfaces only X/Y/heading and the two sensor readings — nothing tells the student which port produces which reading, or that ports `C`/`D` are unwired.

Result: students paste tutorial code that uses arbitrary ports, it appears to work, and the bug surfaces only when they move to physical hardware. The implicit configuration is invisible *and* a lie.

## Goal

1. Establish a single canonical port configuration shared by Python and JavaScript.
2. Make the configuration **visible** in the UI — students can see what's plugged into each port and the live reading from each.
3. Make the configuration **load-bearing** — wrong-port calls raise `RuntimeError` instead of silently succeeding.
4. Defer customization (swapping devices on ports) to a follow-up.

## Canonical default configuration

| Port | Device          | Notes              |
|------|-----------------|--------------------|
| A    | motor           | left drive wheel   |
| B    | motor           | right drive wheel  |
| C    | empty           |                    |
| D    | empty           |                    |
| E    | color sensor    |                    |
| F    | distance sensor |                    |

Two motors and two sensors — matches what's drawn on the canvas. `C` and `D` are reserved for the deferred customization feature; today they raise on any access.

`A = left, B = right` matches FLL convention and the existing `motor_pair.pair(PAIR_1, motor.A, motor.B)` example code.

---

## Section 1: Configuration source of truth

Both runtimes hold an identical hardcoded map. No runtime sync — when customization arrives it'll add a `port_config` worker message; for now both sides ship the same literal.

### Python (`py/spike_bridge.py`)

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

### JavaScript (`js/simulator.js`)

```js
const PORT_CONFIG = {
  A: { kind: 'motor',           role: 'drive-left'  },
  B: { kind: 'motor',           role: 'drive-right' },
  C: { kind: 'empty' },
  D: { kind: 'empty' },
  E: { kind: 'color_sensor' },
  F: { kind: 'distance_sensor' },
};
```

The JS map carries the extra `role` field used by the UI (left/right drive labels). The Python side doesn't need it.

The existing `robot.sensors.colorPort` / `distancePort` fields in `makeRobotState()` are removed — `PORT_CONFIG` is the only declaration.

---

## Section 2: Validation layer

### Python-side `_require`

A small helper raises before sending any command to the bridge:

```python
def _require(port, expected_kind, op):
    """Raise if the port doesn't have the expected device. Returns the wire letter."""
    letter = _port_id(port)
    actual = _PORT_CONFIG.get(letter, 'empty')
    if actual != expected_kind:
        readable = expected_kind.replace('_', ' ')
        raise RuntimeError(
            f"port {letter} has no {readable} (configured: {actual or 'empty'})"
        )
    return letter
```

Applied at every API entry point that takes a `port`:

| Entry point                                       | Check                       |
|---------------------------------------------------|-----------------------------|
| `motor.run_for_degrees / run_for_time / run / stop / run_to_*` | `_require(port, 'motor', ...)` |
| `motor.absolute_position / relative_position / velocity / get_duty_cycle / set_duty_cycle / reset_relative_position` | `_require(port, 'motor', ...)` |
| `color_sensor.*`                                  | `_require(port, 'color_sensor', ...)` |
| `distance_sensor.*`                               | `_require(port, 'distance_sensor', ...)` |
| `force_sensor.*`                                  | `_require(port, 'force_sensor', ...)` — always raises today (no force sensor in default config) |
| `motor_pair.pair(pair, left, right)`              | `_require(left, 'motor', ...)` and `_require(right, 'motor', ...)` |

Error message format:

```
RuntimeError: port C has no motor (configured: empty)
RuntimeError: port F has no color sensor (configured: distance_sensor)
RuntimeError: port A has no distance sensor (configured: motor)
```

Per `CLAUDE.md`, MicroPython surfaces this as `RuntimeError: port C has no motor (configured: empty)` in the simulator console — no traceback module needed.

### JS-side defensive check

`_execCmd` adds a single guard at the top for any command carrying a `port` field, mirroring the Python check. This protects:
- Blockly-generated code that bypasses the worker (`window.sim._animateSingleMotor` calls)
- Future direct-from-JS tooling

```js
const PORT_KIND_FOR_CMD = {
  motor_degrees: 'motor', motor_time: 'motor', motor_run: 'motor', motor_stop: 'motor',
  // sensor reads don't go through _execCmd today (synchronous via getters)
};
// in _execCmd, before the switch:
if (cmd.port && PORT_KIND_FOR_CMD[cmd.type]) {
  const cfg = PORT_CONFIG[cmd.port];
  if (!cfg || cfg.kind !== PORT_KIND_FOR_CMD[cmd.type]) {
    throw new Error(
      `port ${cmd.port} has no ${PORT_KIND_FOR_CMD[cmd.type]} ` +
      `(configured: ${cfg ? cfg.kind : 'empty'})`
    );
  }
}
```

The thrown error reaches the worker via the existing `_handle_run` exception path, surfacing in the console identically.

---

## Section 3: UI — Hub panel

Replace the existing `#sensor-panel` "Robot State" block (`index.html:88-111`) with a two-section **Hub** panel.

### Layout

```
HUB
─────────────────────────
 X         35.0 cm
 Y         98.0 cm
 Heading   270°
─────────────────────────
PORTS
 A  motor (L drive)   357°
 B  motor (R drive)   342°
 C  —                 (dimmed)
 D  —                 (dimmed)
 E  color sensor      red ●
 F  distance sensor   30.0 cm
─────────────────────────
```

### Behaviour

- **Pose section**: identical to today's X/Y/heading — kept verbatim.
- **Port rows**: rendered for all six ports A–F.
  - Empty ports show `—` and use a dimmed text colour.
  - Motor rows show absolute position from `robot.motors[port]` with a `°` suffix.
  - Color sensor row shows the colour name plus the existing swatch (`#color-swatch`), only on the `E` row.
  - Distance sensor row shows the `cm` reading.
  - Force sensor row would show Newtons — not present in default config.
- **No active-port pulse / animation** in v1. Polish later.
- Panel re-renders inside the existing `_updateSensorPanel()` call site (`js/simulator.js:393`). One pass per frame, only when `_dirty` is set.

### DOM

The panel becomes table-shaped; existing IDs (`sp-x`, `sp-y`, `sp-heading`, `color-swatch`) are preserved. New IDs:
- `port-row-{A..F}` for each row
- `port-value-{A..F}` for the live-reading cell

CSS lives in `css/style.css` (existing file). Dimmed empty rows use a single `.port-row.empty` class.

---

## Section 4: Blockly impact

Blockly's drive blocks call `window.sim._animateTank(...)` directly with no port argument — drive ports are hardcoded to A/B inside the simulator. Unaffected.

Blockly's single-motor blocks emit port letters (`'A'`, `'C'`, etc.) and route through `_animateSingleMotor`. With C and D empty in the default config, dropping the `C`/`D` options from the motor-port dropdown in `SPIKE_BLOCKS` (`js/blockly_config.js`) avoids hand-rolled "valid" Blockly programs that crash. The block dropdown stays as `A` / `B` only until customization adds more.

---

## Section 5: Testing

### Python bridge tests

Extend the existing test suite (`tests/`) with cases per `_require` path:

- `motor.run(port.A)` → succeeds (A is a motor)
- `motor.run(port.E)` → `RuntimeError` (E is a color sensor)
- `motor.run(port.C)` → `RuntimeError` (C is empty)
- `color_sensor.color(port.E)` → succeeds
- `color_sensor.color(port.A)` → `RuntimeError`
- `distance_sensor.distance(port.F)` → succeeds
- `distance_sensor.distance(port.E)` → `RuntimeError`
- `motor_pair.pair(motor_pair.PAIR_1, motor.A, motor.B)` → succeeds
- `motor_pair.pair(motor_pair.PAIR_1, motor.A, motor.E)` → `RuntimeError`
- `motor.absolute_position(port.A)` → returns int (0)
- `motor.absolute_position(port.E)` → `RuntimeError`

Tests use the existing `_test_intercept` mechanism (`py/spike_bridge.py:42`).

### Manual UI verification

- Hub panel renders 6 port rows on load
- Empty rows (C, D) appear dimmed with `—`
- Run a tank movement program; A and B position values update
- Run a `color_sensor.color(port.E)` loop; E row updates as robot crosses coloured zones
- Distance reading on F updates as robot approaches mission boxes
- Run a deliberately-wrong-port program; a `RuntimeError` line appears in the console output

---

## Out of scope (deferred to follow-ups)

- Customization UI — picking which device is on which port
- Persisting port config in `localStorage`
- Pushing config updates from main thread to worker
- Visual port indicators on the rendered robot (port letters on wheels, sensor placement)
- Active-port pulse / animation when a port is being read or driven
- Force sensor support (no entry in default config; would need a render update)

## Files touched

- `py/spike_bridge.py` — add `_PORT_CONFIG`, `_require`, apply at every port entry point
- `js/simulator.js` — add `PORT_CONFIG`, JS-side guard in `_execCmd`, rewrite `_updateSensorPanel`, drop unused `colorPort`/`distancePort` from `makeRobotState`
- `js/blockly_config.js` — restrict motor-port dropdown to `A` / `B`
- `index.html` — restructure `#sensor-panel` block into the Hub panel
- `css/style.css` — Hub panel styles, dimmed empty-port rows
- `tests/` — new bridge validation cases
