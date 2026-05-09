# Random Poke Events + Line-Follow Demo

**Date:** 2026-05-09
**Status:** Design
**Backlog item:** Simulation Fidelity → "Random Noise Events" (poke variant)

## Summary

Inject randomized "poke" events that push the robot laterally during program execution, so a student program has to detect and recover from a disturbance. Bundle the BACKLOG'd `tilt_angles()` gyro fix and ship one Python + one Blockly line-follower example so the recovery loop is demonstrable out of the box.

## Goals

- A random "poke" briefly translates the robot perpendicular to its heading, with no impulse on the heading itself.
- Three trigger modes: **off**, **manual** (button), **auto** (random interval). User picks via a small panel.
- Three strength presets (light / medium / strong) shared by manual and auto.
- `motion_sensor.tilt_angles()` returns real yaw driven from the simulator heading, with correct LEGO sign convention.
- Two ready-to-run example programs (Python + Blockly) implement a P-controller line follower demonstrating recovery.

## Non-Goals

- Heading-rotation pokes. Pokes are pure translation per the user's choice during brainstorming.
- Continuous reflected-light values for the color sensor. The discrete table stays as-is; a continuous-reflection upgrade is a separate spec (BACKLOG: "Color sensor: `rgbi()` should return mean of R, G, B").
- A library of canonical FLL example programs. The Examples dropdown UI ships here with one entry (the line follower); broader content (straight drive, gyro turn, multiple line-follow variants) is a follow-up spec (BACKLOG: "Example programs").
- Friction-variation noise. Listed in BACKLOG alongside pokes; out of scope for this spec.

## Conventions in this document

The simulator's internal coordinates are math y-up: origin bottom-left, `+y` = north, headings CCW-positive (`0° = east, 90° = north, 180° = west, 270° = south`). LEGO's yaw convention is the inverse — CW-positive — which surfaces only in the `tilt_angles()` mapping.

---

## Architecture

Three components, all convention-agnostic:

### `js/noise_events.js` (new)

`NoiseController` class. Owns:

- `mode`: `'off' | 'manual' | 'auto'`
- `strength`: `'light' | 'medium' | 'strong'`
- `autoMean_s`: mean interval between auto-mode pokes, default `5` s. Each auto-mode interval is sampled uniformly from `[autoMean_s * 0.5, autoMean_s * 1.5]`.
- `activePoke`: `{ side: +1 | -1, vPerpMag_mm_s: number, msRemaining: number } | null`. `side = +1` pushes toward the robot's left (perp heading = `headingRad + π/2`); `side = -1` toward the right.
- `nextPokeAt_ms`: counter for auto-mode scheduling

Exposes:

- `pokeNow(side?)` — start a poke; if `side` omitted, picks `±1` uniformly.
- `update(dt_ms)` — advance auto-mode timer and decrement `activePoke.msRemaining`.
- `getPerturbation(headingRad) → { vx, vy }` — returns the perpendicular velocity vector to add this step, or `(0, 0)` if no poke is active.
- `setMode(mode)`, `setStrength(strength)`, `setAutoMean(seconds)` — settings, persisted by the UI layer.
- `reset()` — clears `activePoke` and resets the auto-mode timer (called from `RobotSimulator.reset()`).

The controller knows nothing about Box2D, the canvas, or the editor.

### `js/simulator.js` patch

`_animateTank` queries `noiseController.getPerturbation(headingRad)` after the wheel-derived `(vx, vy, ω)` and adds the perp vector to `(vx, vy)` before the existing `setKinematicVelocity` call. The heading-update path is untouched. `_animateTank` calls `noiseController.update(wallStepMs)` once per step so auto-mode timing advances while a program drives.

`reset()` (currently at `simulator.js:695–722`) calls `noiseController.reset()` alongside the existing `pairMap`/trail/velocity clearing, so pressing Stop mid-poke and re-running starts cleanly.

The renderer adds a brief arrow overlay (an inwards-pointing chevron on the poked side, ~200 ms fade) so a poke is visible even when the robot is barely moving.

### `index.html` + `js/main.js`

A "Noise" panel near the speed/theme controls:

- Mode dropdown (Off / Manual / Auto)
- Strength dropdown (Light / Medium / Strong)
- Auto-mean slider (visible only when mode = Auto), labeled "average seconds between pokes", value range `[2, 12]` s, sets `autoMean_s`. Actual interval is sampled per-poke from `[autoMean_s * 0.5, autoMean_s * 1.5]`.
- "Poke" button (visible only when mode = Manual), wired to `noiseController.pokeNow()`.

Settings persist in `localStorage` alongside the existing speed and theme.

A single watcher on `sim.isRunning` transitions starts/stops the auto-mode timer — both Python and Blockly entry points already set `isRunning = true` before driving `_animateTank`, so one hook covers both modes (CLAUDE.md: "Blockly bypasses the worker").

The three modules stay decoupled: controller knows nothing about Box2D or canvas; simulator only knows it can ask for a perpendicular velocity each step; UI only knows it can call setters.

---

## Data Flow

```
User clicks "Poke" (or auto-timer fires)
  └─ NoiseController.pokeNow()
       ├─ side = random ±1
       ├─ displacement_mm = preset:  light=25, medium=50, strong=80
       ├─ duration_ms     = 150 (fixed)
       ├─ vPerpMag_mm_s   = displacement_mm / (duration_ms / 1000)
       └─ activePoke = { side, vPerpMag_mm_s, msRemaining: 150 }

Each _animateTank step (≈16 ms wall):
  ├─ wheel-derived (vx, vy, ω)  ← existing kinematics, unchanged
  ├─ noiseController.update(wallStepMs)
  ├─ perp = noiseController.getPerturbation(headingRad)
  │     if activePoke and msRemaining > 0:
  │         perpHeadingRad = headingRad + side * π/2     ← CCW math
  │         vx_perp = vPerpMag_mm_s * cos(perpHeadingRad)
  │         vy_perp = vPerpMag_mm_s * sin(perpHeadingRad) ← +y is north
  │         msRemaining -= wallStepMs
  │     else perp = (0, 0)
  ├─ setKinematicVelocity(vx + vx_perp, vy + vy_perp, ω)
  └─ physics.step → readPose → write robot.{x,y,heading}
```

Heading is untouched, so trail / sensor pipeline / Box2D contact response keep working unchanged. The perp vector cancels as soon as `msRemaining` hits 0, returning the robot to pure wheel-derived motion. `_animateTank` stays convention-agnostic — no flips introduced, per the CLAUDE.md constraint.

Auto-mode scheduling: `update(dt_ms)` decrements `nextPokeAt_ms`. When it hits zero, if no poke is active it fires `pokeNow()`; if a poke is already active (only possible if `update` is called while `activePoke.msRemaining > 0`, e.g. high-speed multiplier compresses time), it skips this firing. Either way, `nextPokeAt_ms` is reseeded from a uniform draw in `[autoMean_s * 500, autoMean_s * 1500]` ms — i.e., the timer doesn't stall waiting for a missed slot. While idle (no program running), a fallback `setInterval` in the UI layer drives `update()` so manual pokes still advance.

---

## Gyro Fix (`tilt_angles()`)

LEGO yaw is **CW-positive**; sim heading is **CCW-positive**. The bridge needs a sign flip.

### Spike API surface (`py/spike_bridge.py`)

`motion_sensor.tilt_angles()` returns `(yaw_dDeg, 0, 0)` — decidegrees per LEGO convention. Pitch and roll stay 0 (top-down sim has no third axis).

### Sign mapping

```
yaw_dDeg = normalizeWrap(-(heading_now_deg − heading_at_last_reset_deg) × 10)
```

Normalized to `[-1800, +1800]`. The negation is the CCW → CW flip.

### `reset_yaw(angle=0)`

Stops being a no-op; records `heading_at_last_reset_deg = heading_now_deg + (-angle / 10)`, so `tilt_angles()[0]` reads `angle` immediately after the call. A non-zero `angle` argument lets a program declare "I want yaw to read N here."

### Bridge wiring

`yaw_dDeg` joins the per-step sensor snapshot pushed back to MicroPython (the same path that already carries `x`, `y`, `heading`, `color`, `distance_mm`). `tilt_angles()` reads from the freshest snapshot rather than round-tripping a fresh bridge call, matching the existing pattern.

This is orthogonal to the poke (heading is unchanged by pokes) — gyro is a tool for the example programs and future headed-drive work, not the recovery channel for *this* poke.

---

## Example Programs (Blockly + Python)

Black east-west line at math `y = 463` spans the full field width (`x: 0..2362`, `lw: 4`). Spawn `(350, 163)` heading `90°` north; line is 300 mm directly ahead.

Three-phase program:

1. **Acquire** — drive north until `color_sensor.reflection(E) < 30`. The 88 mm forward sensor offset means the sensor crosses `y = 463` while the robot's center is still at `y ≈ 375`; the `< 30` threshold catches the discrete drop from `none` (50) to `black` (5).
2. **Align** — pivot in place 90° CW (LEGO yaw `+900` dDeg) using `motor_pair.move_for_degrees(PAIR1, …, steering=100)` so the robot now heads east (sim heading `0°`).
3. **Follow** — P-controller:

   ```python
   target = 27               # midpoint of black=5 and none=50 (discrete reflMap)
   Kp     = 1.2
   while True:
       error    = await color_sensor.reflection(port.E) - target
       steering = clamp(int(Kp * error), -100, 100)
       await motor_pair.move(motor_pair.PAIR_1, steering, velocity=400)
   ```

Pokes are now lateral (north/south) since the robot is heading east; the P loop steers back.

### Sensor-fidelity caveat

`_colorAtPosition` returns discrete colors, so `getColorSensorReflection()` is a step function (5 on the line, 50 off it). A P controller against a step input oscillates around the edge rather than smoothly gliding — this is acceptable for a teaching demo (the wobble *is* the lesson on gain tuning), but worth documenting so we don't promise a smooth glide we can't deliver. A continuous-reflection upgrade is a separate spec.

### Files

- `static/examples/line_follow_p.py`
- `static/examples/line_follow_p.llsp3` — single-project file consumable by the existing `.llsp3` loader, so users can Open it directly. Keeps the loader path used everywhere else; no new format.

A new "Examples" dropdown sits next to the Open/Save buttons in the header. Selecting an example calls the existing load path with the bundled file (with a confirm prompt if the editor is dirty).

---

## Testing

### Unit — `tests/noise_controller.test.mjs`

- `pokeNow()` sets `activePoke` with the correct `vPerpMag_mm_s` per strength preset (25, 50, 80 mm displacement / 0.150 s).
- `getPerturbation(headingRad)` returns `(0, 0)` before a poke, the expected perpendicular vector during, and `(0, 0)` after `msRemaining` exhausts.
- Math-CCW assertion: `heading = π/2` (north), `side = +1` → perp heading `π` (west) → `(vx, vy) ≈ (-vPerpMag, 0)`.
- Auto mode: with a fixed seed, `update(dt)` fires pokes inside the configured interval window. A poke firing while `activePoke` is non-null is skipped (no overlap), but the timer reseed still happens.
- Side selection is approximately 50/50 over many pokes (statistical, fixed seed for determinism).

### Integration — `tests/poke_integration.test.mjs`

Reuses the `World2D.init(injectedBox2d)` stub-injection seam (already in `world_2d.js:32-37`). Constructs a `RobotSimulator` instance, drives `_animateTank` from spawn `(350, 163)` heading `90°` for ~2 s with a scripted poke fired at `t = 500 ms`. Asserts:

- Lateral displacement (along ±x, since heading is north) ≈ preset displacement within ±5 mm tolerance.
- Heading is unchanged within ±1° (poke is pure translation).
- `reset()` mid-poke clears `activePoke` and the next step has no perturbation.

### Bridge — `tests/spike_bridge_yaw.test.mjs`

- Sim heading rotated CCW by 30° from a freshly-reset zero → `tilt_angles()[0]` reads `-300` dDeg.
- After `reset_yaw(900)` at sim heading `90°`, subsequent `tilt_angles()[0]` reads `900`.
- Wraparound: sim heading rotated to a delta of `−190°` → normalized result is `+1700` dDeg (or symmetrically wrapped per LEGO convention; pick one and assert it).

### Manual smoke test (added to `CLAUDE.md`)

> Load `line_follow_p.py` from Examples. Run. Set noise to Auto / Medium. Watch acquire → pivot → follow → recover from periodic pokes.

---

## Open questions

None — all brainstorming choices are locked. (Scope C, trigger model C, effect type A, magnitude model B, examples B.)

## Risks

- **PID wobble on discrete reflection** is louder than expected once the `target = 27` math meets a real running program. Mitigation already in scope: document the bang-bang behavior in the example's comments and in the manual smoke test description.
- **Auto-mode poke during a phase transition** (e.g., during the Align pivot) could nudge the pivot mid-rotation in a way that's confusing to debug. Acceptable: the controller is *meant* to be unpredictable; if it turns out to be too disruptive in practice the auto-rate slider gives the user the lever.
- **Box2D contact response during a poke into a wall** — the poke adds velocity; if the robot is already against a wall, the perp velocity gets absorbed by the contact solver. Acceptable and physically realistic; the kinematic body's velocity write means no impulse leaks into the wall.
