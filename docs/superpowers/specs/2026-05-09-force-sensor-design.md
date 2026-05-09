# Force Sensor — Design

**Date:** 2026-05-09
**Backlog item:** `BACKLOG.md` → Spike Prime API → Sensor stubs → "Force sensor"; Programming Experience → Blockly → "Functional force-sensor blocks"

## Problem

The Spike Prime force-sensor API exists end-to-end in this project — `force_sensor.force/pressed/raw` in `py/spike_bridge.py:328-345`, the matching JS-side accessors `getForceSensorValue` / `getForceSensorPressed` in `js/simulator.js:899-900`, three Blockly blocks (`flipperevents_whenPressed`, `flippersensors_isPressed`, `flippersensors_force`) in `js/blockly_config.js:600-815`, and Monaco completion entries in `js/monaco_config.js:186-200` — but every read path returns `0`/`False`. No port is wired as a force sensor in the canonical config either, so the Python guard raises before the stub even gets a chance.

The Box2D world that landed in `feature/box2d-physics` (commit `6d4c49c`) opens up a more honest answer than the original "drive it from a keyboard key" plan in BACKLOG.md: the simulator can now read real contact impulses on collision and convert them into a Newton reading. We still want a manual press path for the case students don't have an obstacle to bump into — but the physics-driven path is the natural primary source now that we have one.

## Goals

- Wire **port C** as a `force_sensor` in the canonical config so the existing Blockly blocks and Python API become live without any code change in user programs.
- Drive `force_sensor.force(port)` from **two combined sources**:
  - **Physics:** a bumper fixture welded to the front of the robot reads contact impulses from Box2D each step.
  - **Manual:** a Hub-panel press-button that ramps a synthetic force from 0 → 10 N over 1 s while held.
- Combine via **max-of**, so the API always reports whichever source is currently dominant.
- Match the real Spike Prime contract: `force()` returns 0–100 decinewtons, `pressed()` returns true at ≥0.5 N, hard-pressed at ≥7 N, `raw()` returns roughly 0–4095 ADC counts.
- Surface the sensor's live value visibly in two places: the Hub-panel button doubles as the manual input *and* as a fill-bar readout; the canvas bumper tints amber→red while the sensor is reading non-zero.
- Add unit-test coverage for: physics impulse → Newton conversion, manual ramp timing, max-of combination, threshold cutoffs, raw scaling.

## Non-goals

- **Multiple force sensors** on different ports. Default config places one on C; D stays empty. The API is already port-keyed, so a future config-customization feature can wire a second sensor without revisiting this design.
- **Configurable bumper geometry / mount position.** Front-only, fixed size and offset. A swing-arm or rear bumper is a separate feature.
- **Keyboard binding.** The Hub-panel button is the only manual affordance. A key (`F`) was considered and dropped; it can be added later in ~10 lines if needed.
- **Calibration / noise-floor configuration.** EMA smoothing factor and impulse-to-Newton scaling are baked constants in this design. They're tuned once for box2d-wasm 7.0.0 default density (50 kg/m²) and exposed as named constants for adjustment.
- **`force_sensor.pressed()`-driven Blockly events** (`flipperevents_whenPressed`). Already wired in Blockly to poll `getForceSensorPressed()` each tick — no changes here.
- **Touch / pointer support beyond the standard Pointer Events API.** Mouse and touch both go through `pointerdown`/`pointerup`/`pointerleave`; no per-input branches.

## Background: how force shows up in Box2D

box2d-wasm exposes `b2ContactListener` with four overridable hooks: `BeginContact`, `EndContact`, `PreSolve`, `PostSolve`. The one we need is **PostSolve** — it fires after the constraint solver has computed contact impulses for the current step, and hands you a `b2ContactImpulse` whose `normalImpulses` array contains the per-manifold-point impulses (units: kg·m/s).

Three relevant facts:

1. **Kinematic-vs-static and kinematic-vs-dynamic contacts both fire PostSolve.** The robot is kinematic (`js/world_2d.js:80-101`); walls are static, mission obstacles are dynamic. Both contact types are visible to the listener.
2. **Force in Newtons is `sum_impulse / dt`**, where `dt` is the sub-step size we passed to `world.Step(dt, 8, 3)`. Sub-stepping in `World2D.step` (`js/world_2d.js:172-178`) keeps `dt ≤ 1/60 s` even at high `speedMult`, so the conversion stays well-behaved.
3. **Impulse magnitudes are per-step, not per-frame, and spike on first contact.** A single hot frame doesn't translate to the smooth "X Newtons of pressure" reading a real ADC produces. We low-pass with EMA on the JS side.

Real Spike Prime force sensor: 0–10 N range, ~0.5 N pressed threshold, ~7 N hard-pressed threshold, raw readout is a 12-bit ADC (0–4095). Decinewton = `force_N × 10`, clamped 0–100.

## Architecture

Three pieces, two new and one extended.

### 1. Bumper fixture + `b2ContactListener` (`js/world_2d.js`)

`World2D.addRobot` already builds the robot's chassis fixture (`js/world_2d.js:90-98`). A new method **`addBumper(robotBody, hx_mm, hy_mm, offsetX_mm, offsetY_mm, userData)`** appends a second polygon fixture to the same body, in body-local frame. For port C the call site passes:

| Param | Value |
|---|---|
| `hx_mm` | 5 (10 mm front-to-back) |
| `hy_mm` | 15 (30 mm wide) |
| `offsetX_mm` | `ROBOT_BODY_H / 2 + 5` = 105 (forward of body centre) |
| `offsetY_mm` | 0 (centred laterally) |
| `userData` | `{ kind: 'force_sensor', port: 'C' }` |

Body-local +X is forward in the simulator's convention (`js/world_2d.js:78-79`), so `offsetX_mm = +105` puts the bumper *in front of* the chassis. The fixture is a real collider (not `isSensor`) so the robot still can't drive through walls, and the chassis fixture does its existing job.

**`ForceSensorListener`** is a new class wrapping `b2ContactListener`:

```
class ForceSensorListener:
  on PostSolve(contact, impulse):
    - read userData on both fixtures
    - if either has kind == 'force_sensor':
        port = that fixture's userData.port
        sum = sum(impulse.normalImpulses[0..pointCount-1])
        accumulators[port] += sum
  drainStep(dt_s):
    - returns { port: sum_impulse_per_port }, then resets
```

The listener is attached on `World2D.init` (right after the world is created). `World2D.step` calls `drainStep(dt_s)` after `world.Step(...)` and exposes the result back to the simulator: `World2D.step(dt) → { force_impulses: { 'C': totalJ, ... } }`.

box2d-wasm's listener overrides require `Object.assign(listener, { PostSolve: fn })` against an instance of `b2ContactListener`. Allocations are kept per-step bounded by reusing the accumulator object.

### 2. Force computation pipeline (`js/simulator.js`)

A new `ForceSensorState` per configured port (currently `C`) holds:

```
{
  emaN:           0,    // smoothed Newton reading from physics
  manualStartMs:  null, // when the Hub-panel button was pressed; null = released
  manualN:        0,    // current manual ramp value (0..10)
  forceN:         0,    // max(emaN, manualN); the public value
}
```

Every `world.Step` (called from `_animateTank` per tick, plus a new idle tick when no command is running — see "Idle ticking" below) runs:

```
instantN = impulses[port] / dt_s              // physics
emaN     = α * instantN + (1 - α) * emaN      // α = 0.4
emaN    *= 0.5  if no contact this step       // bleed when contact ends
manualN  = (manualStartMs == null)
            ? 0
            : min(10, (now - manualStartMs) / 100)   // 1000 ms → 10 N
forceN   = max(emaN, manualN)
robot.sensors.forceN = forceN
```

The `× 0.5` bleed on no-contact frames is what makes the EMA decay back to zero in ~3 frames after the robot stops touching anything. Without it the EMA would hold the last value indefinitely once contact ends.

α and the bleed factor are exported as named constants `FORCE_EMA_ALPHA` / `FORCE_EMA_DECAY` so they're trivially adjustable.

**Idle ticking.** Today, physics steps only happen inside `_animateTank` while a motor command is running. For the manual button to ramp visibly while the robot is parked, the simulator needs to step the world (or at least the force-sensor pipeline) every animation frame. The minimal addition: when no command is running, call a new `_idleStepForceSensor(dt_s)` from the existing `_drawLoop` that updates `manualN` (no Box2D step needed; manual force is independent of physics) and recomputes `forceN`. This keeps the panel readout responsive without burning physics ticks while idle.

### 3. Hub-panel widget (`js/main.js` + new CSS)

The existing port-row renderer in `simulator._updateSensorPanel` (`js/simulator.js:514-528`) writes raw text into `#port-value-C`. For the force sensor we replace that single element with a **press-button widget**:

```html
<button id="port-force-C" class="port-force" type="button">
  <span class="port-force-fill"></span>
  <span class="port-force-label">Force</span>
  <span class="port-force-value">0.0 N</span>
</button>
```

Wiring:

- **`pointerdown`** → set `manualStartMs = performance.now()`. Capture pointer with `setPointerCapture` so a drag-off-button release still fires `pointerup`.
- **`pointerup` / `pointerleave` / `pointercancel`** → set `manualStartMs = null`, `manualN = 0`.
- **Per frame** (`_updateSensorPanel`): set `port-force-fill`'s `width = (forceN / 10) × 100%`, set the value text to `forceN.toFixed(1) + ' N'`. Switch the button's `data-state` to `pressed` (≥0.5 N) or `hard` (≥7 N) for CSS-driven colour ramps.

CSS lives in `css/style.css`, scoped with `.port-force` / `.port-force-fill[data-state]`. Colours: chassis-grey idle, amber `#f0a830` (matches the existing yellow mission zone) at pressed, red `#e74c3c` (matches the existing `red` color-map entry) at hard-pressed. The fill bar transitions `width` with `transition: width 80ms linear` so the bar feels responsive but not jittery on EMA noise.

The widget shows the **combined** force value, not just the manual contribution. A wall-bump from physics fills the bar exactly the same way the button does.

### 4. Canvas bumper drawing (`js/simulator.js:_drawRobot`)

After the existing wheels and chassis (`js/simulator.js:418-440`), draw the bumper as a thin rounded slab:

- Position: forward edge of chassis, centred. Body-local rect at `(0, -bh/2 - 10*s)` with size `30*s × 10*s`.
- Idle fill: `#a0a0b0` (slightly darker than chassis to read as a separate piece).
- Pressed fill: linearly interpolate idle → amber → red as a function of `forceN / 10`. Same colour stops as the panel.
- Outline: 1 px `#555` always; at hard-pressed (`forceN ≥ 7`) add a `8 * s`-radius red `shadowBlur` for a glow.
- Drawn under the front-indicator triangle (`js/simulator.js:472-478`), so the triangle stays visible.

### 5. Bridge wiring (`py/spike_bridge.py` + JS sensor accessors)

`_state` in `py/spike_bridge.py:34-39` gains three keys:

```python
'force_dn':      0,
'force_pressed': False,
'force_raw':     0,
```

Populated each command reply by `simulator._sensorState()`. The Python class becomes:

```python
class force_sensor:
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

`_PORT_CONFIG` (`py/spike_bridge.py:73-80`) flips `'C': 'empty'` to `'C': 'force_sensor'`.

JS-side accessors (`js/simulator.js:899-900`) become:

```js
getForceSensorValue()    { return Math.round(this.robot.sensors.forceN * 10); }   // decinewtons
getForceSensorPressed()  { return this.robot.sensors.forceN >= 0.5; }
getForceSensorRaw()      { return Math.round(this.robot.sensors.forceN * 409.5); } // ~0..4095
```

`PORT_CONFIG.C` (`js/simulator.js:36-43`) flips to `{ kind: 'force_sensor', mount: 'front' }`. The two configs (Python and JS) stay in sync per the existing convention.

`_sensorState` (`js/simulator.js:789-800`) gains `force_dn`, `force_pressed`, `force_raw`.

## Data flow

```
[Hub-panel button] --pointerdown--> simulator.manualStartMs := now
                                               |
                                               v
[box2d world step]  PostSolve impulses --> simulator.emaN
                                               |
                                               v
each tick:  forceN = max(emaN, manualN)  --> robot.sensors.forceN
                                               |
                                       /-------+-------\
                                       v               v
                          [_updateSensorPanel]   [_drawRobot]
                                fill bar             bumper tint
                                value text
                                       |
                                       v (on command reply)
                              [_sensorState payload] -> Python `_state`
                                       |
                                       v
                          force_sensor.{force,pressed,raw}(port)
```

No new persistence, no new worker messages, no localStorage.

## Edge cases

| Case | Behavior |
|---|---|
| Robot drives into a static wall | `PostSolve` fires; `instantN > 0`; EMA climbs over ~3 frames; bar fills; tint shows. On stop, robot still in contact: instant impulse drops to ~0 each step (no relative velocity), so the EMA bleeds out via `× 0.5`. |
| Robot pushes a dynamic obstacle | Same as above; the impulse the obstacle absorbs *is* the impulse on the robot side, which is what `normalImpulses` reports. |
| Robot side-swipes an obstacle | Side of chassis hits, *not* bumper fixture. Listener filters on `userData.kind`, so no force is reported. (This is intentional — a real Spike force sensor doesn't sense via the chassis.) |
| Manual press while physics force is also non-zero | `forceN = max(...)`; whichever is larger wins. Bar shows the larger value. |
| User holds the button > 1 s | `manualN` clamps at 10 N; bar stays full. |
| User drags off the button mid-press | `setPointerCapture` keeps the press alive while pointer is down; release outside still fires `pointerup`, which clears state. `pointerleave` is a fallback for cases where capture wasn't established (e.g. touch + swipe). |
| Reset button pressed | `simulator.reset()` clears `manualStartMs`, `manualN`, `emaN`. Bumper redraws idle. |
| `speedMult > 1` | World sub-steps to keep dt small (existing behaviour). The force pipeline runs once per simulator tick, not per sub-step — `instantN` averages across the sub-stepped impulses, which is what we want. |
| Headless test harness (no Box2D) | `_initPhysics` swallows the dynamic-import error today (`js/simulator.js:163-171`); the new bumper/listener code lives behind the same guard. Manual press path still works in tests via direct `pointerdown` / `pointerup` simulation. |
| Browser without Pointer Events | Vanishingly rare in 2026; we don't add fallback to mouse-only events. |

## Testing

### Unit (`tests/js/sensors/force_sensor.test.js` — new)

The force pipeline is two independent computations (physics EMA, manual ramp) and a max. Each is testable as a pure function exported from a small helper file `js/force_sensor_logic.js` (UMD pattern matching `js/kinematics.js`):

- **`emaStep(prevEma, instantN, hadContact, alpha, decay) → number`** — single EMA tick. Tests:
  - First contact: `prevEma=0, instantN=5, hadContact=true → 0.4 * 5 = 2`.
  - Steady contact: `prevEma=2, instantN=5 → 0.4 * 5 + 0.6 * 2 = 3.2`.
  - No contact: `prevEma=4, instantN=0, hadContact=false → 4 * 0.5 = 2`.
  - Decay continues without floor: after 5 no-contact ticks, EMA < 0.15 N.
- **`manualRamp(startMs, nowMs, rampMs, maxN) → number`** — current manual force given a press-start timestamp. Tests:
  - `startMs = null → 0`.
  - `nowMs - startMs = 0 → 0`.
  - `nowMs - startMs = 500, rampMs = 1000, maxN = 10 → 5`.
  - `nowMs - startMs = 1500 → 10` (clamped).
- **`combine(emaN, manualN) → forceN`** — max-of. Tests trivial sanity cases.
- **`forceToReadings(forceN) → { dn, pressed, hard, raw }`** — unit conversions. Tests:
  - `0 → { dn: 0, pressed: false, hard: false, raw: 0 }`.
  - `0.5 → { dn: 5, pressed: true, hard: false, raw: ~205 }`.
  - `7 → { dn: 70, pressed: true, hard: true, raw: ~2867 }`.
  - `10 → { dn: 100, pressed: true, hard: true, raw: 4095 }` (clamped).
  - `12 → { dn: 100, ... }` (clamped over-range).

### Integration (`tests/js/physics/force_contact.test.js` — new)

Box2D-WASM is loaded in `tests/js/physics/world_2d_boundary.test.js` already; this test reuses that init pattern.

- Build a `World2D`, walls at field dims, robot at spawn pose, attach `ForceSensorListener`, attach a bumper fixture on port C.
- Drive the kinematic robot forward at 0.5 m/s for 0.5 s. Confirm:
  - No contact yet → `drainStep()` returns `{ C: 0 }`.
  - Robot now in contact with top wall → next `drainStep()` returns `C > 0`.
  - Convert to Newtons via `J / dt`. Expect a value in the 0.5–5 N range (kinematic body resisting against a static wall at the configured velocity and Box2D's default solver iterations). Test asserts a non-trivial bound, not an exact value, since Box2D's iterative solver doesn't promise determinism across versions.
- Stop the robot in place. After ~5 steps the listener returns `{ C: 0 }`.
- Drive the robot *backwards* into a wall (front bumper not in contact). Confirm `C` stays 0 — only the chassis touches.

### Bridge (`tests/js/sensors/accessors.test.js` — extend existing file)

- Add `getForceSensorValue` / `getForceSensorPressed` / `getForceSensorRaw` cases:
  - `forceN = 0` → `0 / false / 0`.
  - `forceN = 0.5` → `5 / true / ~205`.
  - `forceN = 7` → `70 / true / ~2867`.
  - `forceN = 12` → `100 / true / 4095` (over-range clamp).

### Python (`tests/py/test_force_sensor.py` — new, mirrors per-topic split in `tests/py/`)

Following the pattern of `tests/py/test_motor.py`, `test_hub.py`, etc., a new file scoped to the force sensor.

- `force_sensor.force(port.C)` returns the int from `_state['force_dn']`.
- `force_sensor.pressed(port.C)` returns the bool from `_state['force_pressed']`.
- `force_sensor.raw(port.C)` returns the int from `_state['force_raw']`.
- Calling any of the three on `port.D` raises `RuntimeError` with the expected "no force sensor" message.

### Manual smoke

1. `python3 -m http.server 8787` and load the page. Confirm port C row in the Hub panel renders the new "Force" press-button with an empty fill bar and "0.0 N".
2. Press and hold the button. Bar fills smoothly over 1 s; numeric climbs from 0.0 to 10.0 N; canvas bumper transitions grey → amber → red. Release: bar empties instantly.
3. Drive the robot forward into the top wall (`motor_pair.move(50, 'cm')` from spawn). On contact, bar fills, bumper tints, `force_sensor.force(port.C)` (printed in user code) returns a non-zero decinewton value. After the robot stops, bar bleeds back to 0 within ~50 ms.
4. Drive the robot into mission obstacle 1 (the purple box at `(1700, 200)`) — same behaviour, plus the obstacle gets shoved.
5. Hold the manual button while the robot is also bumping a wall. Bar tracks the larger of the two; release the button while still bumping → bar drops to the physics-only level.
6. Click *Reset*. Bar clears, button releases (visually), bumper returns to idle grey.
7. Run a Blockly program with the `when force sensor on PORT C is hard-pressed` hat. Hold the button > 700 ms — the hat fires.

## Open questions resolved during brainstorming

- **Force source** — three options considered: physics-only (realistic but untestable without obstacles), manual-only (always testable but ignores the new physics engine), hybrid (max of both). Chose **hybrid**.
- **Default port** — three options: C only, C+D (left+right bumper), neither (require user config). Chose **C only**; keeps the API surface minimal and lets user-config land later without a redesign.
- **Mount location** — front-only for v1; configurable mount is a separate feature.
- **Manual press semantics** — instant max, ramped while held, two-key tiers, hold + scroll. Chose **ramped over 1 s while held**, snap to 0 on release. Exercises the full force / pressed / hard-pressed surface from a single affordance.
- **Manual input affordance** — keyboard key vs. Hub-panel button. Chose **Hub-panel button** with an integrated fill-bar indicator. Discoverability comes for free from the on-screen widget; keyboard binding deferred.
- **Visual feedback location** — panel only vs. panel + canvas. Chose **both**, since the canvas tint costs <10 lines and gives a clear "yes, this collision triggered the sensor" signal.
- **Smoothing** — none (raw-spike-y bar) vs. EMA. Chose **EMA α=0.4 with no-contact bleed × 0.5**, baked as named constants.
- **Bumper as collider vs. sensor fixture** — chose **collider**. A sensor fixture would not generate `normalImpulses`; the whole pipeline depends on real contact response.

## File touch list

- **New:** `js/force_sensor_logic.js` — UMD module exporting `emaStep`, `manualRamp`, `combine`, `forceToReadings`. No DOM / Box2D access; pure functions only.
- **New:** `tests/js/sensors/force_sensor.test.js` — unit tests for the four helpers.
- **New:** `tests/js/physics/force_contact.test.js` — integration test for `ForceSensorListener` + bumper fixture against Box2D.
- **Modified:** `js/world_2d.js` — `addBumper(...)` method; `ForceSensorListener` class; `World2D.step` returns `{ force_impulses }`; `init` attaches the listener.
- **Modified:** `js/simulator.js` —
  - `PORT_CONFIG.C` flipped to `{ kind: 'force_sensor', mount: 'front' }`.
  - `robot.sensors.forceN` initialized to 0.
  - `_initPhysics` calls `physics.addBumper(...)` after `addRobot`.
  - `_animateTank` consumes `world.Step`'s force-impulse return and runs the EMA + max pipeline (or delegates to a new `_updateForceSensor(dt, hadContact)` helper).
  - New `_idleStepForceSensor(dt)` called from `_drawLoop` while no command is running, to keep the manual ramp ticking.
  - `_drawRobot` draws the bumper slab with state-driven tint.
  - `_updateSensorPanel` renders the press-button widget for port C and updates fill / value / `data-state`.
  - `_sensorState` includes `force_dn`, `force_pressed`, `force_raw`.
  - `getForceSensorValue` / `getForceSensorPressed` rewired; new `getForceSensorRaw`.
  - `reset()` clears `manualStartMs`, `manualN`, `emaN`.
- **Modified:** `js/main.js` — pointer-event wiring for `#port-force-C` (or pushed into a small helper called from `_updateSensorPanel`).
- **Modified:** `py/spike_bridge.py` —
  - `_PORT_CONFIG['C']` flipped to `'force_sensor'`.
  - `_state` adds `force_dn`, `force_pressed`, `force_raw`.
  - `force_sensor.force` / `pressed` / `raw` read the new keys.
- **Modified:** `index.html` — `<script src="js/force_sensor_logic.js">` immediately before `<script src="js/simulator.js">` (matches `kinematics.js` placement).
- **Modified:** `css/style.css` — `.port-force` / `.port-force-fill` / `.port-force[data-state="pressed"|"hard"]` rules using existing theme variables and the established colour palette.
- **Modified:** `tests/js/sensors/accessors.test.js` — extend with force-sensor accessor cases.
- **New:** `tests/py/test_force_sensor.py` — `force_sensor.force/pressed/raw` cases on configured port C and unconfigured port D.
- **Modified:** `BACKLOG.md` — strike "Force sensor" from Sensor Stubs and "Functional force-sensor blocks" from Programming Experience → Blockly.
