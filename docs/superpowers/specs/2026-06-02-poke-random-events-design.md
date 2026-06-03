# Poke & Friction Modifiers — Design

**Status:** Approved
**Issue:** [#45](https://github.com/sanadfoundation/fll-virtual-robot/issues/45)
**Cross-links:** [#44](https://github.com/sanadfoundation/fll-virtual-robot/issues/44) (missions), [#35](https://github.com/sanadfoundation/fll-virtual-robot/issues/35) (surface friction)

## 1. Goal

Layer environmental perturbations on top of any mission so programs that pass cleanly in a static world get exercised against the kind of disturbances real robots see. Two modifier types:

- **Poke** — a random impulse that shifts the robot's position and heading mid-run. Tests whether the program recovers on-course.
- **Friction** — a global speed multiplier that causes the robot to cover more or less distance than commanded. Tests whether the program overshoots or stops short.

Both are authored per-mission, locked in by the mission author, and invisible to the player until the mission loads (no player tuning).

## 2. Non-goals

- No button-driven / manual poke trigger in v1.
- No spatial friction patches (zone-bounded regions). Global multiplier only. Issue #35 covers per-region variation as a future follow-up.
- No player-adjustable severity. Author decides; difficulty badge communicates it.
- No speedMult-aware poke intervals. Poke timing is wall-clock; at high speedMult pokes feel less frequent relative to simulated distance. Acceptable for v1.

## 3. Schema

The `modifiers` placeholder in every mission file changes from:

```json
"modifiers": { "available": [], "defaults": {} }
```

to:

```json
"modifiers": {
  "poke": {
    "enabled": false,
    "interval_min_s": 8,
    "interval_max_s": 15,
    "severity": 0.4
  },
  "friction": {
    "enabled": false,
    "multiplier": 1.0
  }
}
```

### Field definitions

| Field | Type | Range | Meaning |
|---|---|---|---|
| `poke.enabled` | boolean | — | Whether pokes fire during this mission |
| `poke.interval_min_s` | number | 1–60 | Minimum seconds between pokes |
| `poke.interval_max_s` | number | 1–60, ≥ min | Maximum seconds between pokes |
| `poke.severity` | number | 0–1 | Scale factor: 0 = no effect, 1 = ±20° heading + ±30 mm lateral |
| `friction.enabled` | boolean | — | Whether friction multiplier applies |
| `friction.multiplier` | number | 0.3–1.5 | Speed scale: < 1.0 = sticky (robot undershoots), > 1.0 = slippery (overshoots) |

Both default to `enabled: false` so all existing missions behave identically with no file edits.

### Schema migration

`mission_loader.js` normalises the old `{ available: [], defaults: {} }` shape to the new shape on read. New-mission defaults in `mission_editor_state.js` are updated to emit the new shape. No existing bundled mission files need editing for correctness, though they will be updated to the new shape as a housekeeping pass.

## 4. Poke mechanics

A poke applies a combined lateral displacement and heading rotation:

```
perpAngle_rad = (robot.heading + 90) × π/180
sign_pos      = Math.random() < 0.5 ? 1 : -1
sign_hdg      = Math.random() < 0.5 ? 1 : -1

dx      = cos(perpAngle_rad) × sign_pos × severity × 30   (mm)
dy      = sin(perpAngle_rad) × sign_pos × severity × 30   (mm)
dHeading = sign_hdg × severity × 20                        (degrees)
```

Constants: `MAX_POKE_POS_MM = 30`, `MAX_POKE_HEADING_DEG = 20`. Position and heading signs are independently randomised so pokes vary between pure lateral, pure rotational, and diagonal.

The lateral direction is perpendicular to the robot's current heading at the moment the poke fires, not at run start.

## 5. Friction mechanics

`_frictionMultiplier` (default `1.0`) is read inside `_animateTank`'s per-step loop:

```js
physics.setKinematicVelocity(body,
  v.vx  * this._frictionMultiplier,
  v.vy  * this._frictionMultiplier,
  v.angVel * this._frictionMultiplier,
);
```

Encoder accumulation (`leftStepMM / rightStepMM`) is **not** scaled. The wheels spin at the commanded speed; the robot slips. A program that drives `until=500mm` by encoder will terminate at the full encoder count but the robot will have physically traveled `500 × multiplier` mm. This is the intended surprise.

Friction is constant for the entire run (set at mission load, cleared on reset). It applies to all motion — `_animateTank`, `_animateSingleMotor` reads `_frictionMultiplier` too.

## 6. Simulator API

Two new public methods on `RobotSimulator`:

### `applyPoke(dx, dy, dHeading)`

```
robot.x       += dx
robot.y       += dy
robot.heading += dHeading
```

- Result is clamped inside field bounds using `kinematics.clampRobotPose` (same call as in `_animateTank`).
- `physics.setKinematicPose(robotBody, clamped.x, clamped.y, robot.heading × π/180)` keeps Box2D in sync.
- Sets `_dirty = true` so the canvas redraws on the next frame.
- Sets `_pokeFlashUntilMs = Date.now() + 300` to trigger the canvas ring flash (§8).
- No-ops if `!this.isRunning`.

### `setFrictionMultiplier(f)`

Sets `this._frictionMultiplier = f`. Cleared to `1.0` in `reset()`.

## 7. Mission engine

### State

```js
_nextPokeMs = null;   // wall timestamp for next poke; null when inactive
```

### Lifecycle changes

**`load(mission)`**
- If `mods.friction.enabled`: call `sim.setFrictionMultiplier(mods.friction.multiplier)`.

**`start()`**
- If `mods.poke.enabled`: `_nextPokeMs = Date.now() + randomInterval()`.

**`tick(snap, now)`** (existing 60 Hz call)
- If `mods.poke.enabled && _nextPokeMs !== null && now >= _nextPokeMs`:
  - Compute `dx, dy, dHeading` from poke mechanics (§4) using `snap.robot.heading`.
  - Call `sim.applyPoke(dx, dy, dHeading)`.
  - `_nextPokeMs = now + randomInterval(mods.poke.interval_min_s, mods.poke.interval_max_s)`.

**`finalize()` / `reset()`**
- `_nextPokeMs = null`.
- `sim.setFrictionMultiplier(1.0)`.

### Helper

```js
function randomInterval(minS, maxS) {
  return (minS + Math.random() * (maxS - minS)) * 1000;  // ms
}
```

## 8. Play-mode UI

### Modifier badges

When a mission has `poke.enabled: true` or `friction.enabled: true`, small chips appear below the mission title in the Mission Map panel:

- Poke chip: `⚡ Poke · <severity>` (purple)
- Friction chip: `≈ Friction · <multiplier>×` (blue)

Rendered by `mission_ui.js` alongside the existing title/description. Hidden when both are disabled (no empty space).

### Poke flash

When `sim.applyPoke()` fires, the simulator sets a `_pokeFlashUntilMs` timestamp (`Date.now() + 300`). The draw loop (`_drawField` / `_drawRobot`) checks this each frame and, while active, draws a glowing ring around the robot centre using the existing canvas context:

```js
if (Date.now() < this._pokeFlashUntilMs) {
  ctx.save();
  ctx.strokeStyle = 'rgba(203, 166, 247, 0.85)';
  ctx.lineWidth   = 4;
  ctx.shadowColor = '#cba6f7';
  ctx.shadowBlur  = 12;
  ctx.beginPath();
  ctx.arc(canvasX, canvasY, ROBOT_BODY_H / 2 + 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
```

`_pokeFlashUntilMs` is initialised to `0` in the constructor. No separate `requestAnimationFrame` — the existing 60 Hz draw loop covers it.

## 9. Editor UI

### "Difficulty Modifiers" accordion

A new collapsible section inserted between the Metadata section and the Steps section in the mission editor's right panel. Collapsed by default.

**Header:** `⚡ Difficulty Modifiers ▾`

**Poke subsection (always visible when expanded):**
- Enabled toggle
- Min interval (s) — number input, min 1
- Max interval (s) — number input, min = interval_min_s value
- Severity slider — range 0–1, step 0.1, labelled "Barely noticeable → Clearly off-course"
- Min/max inputs and severity slider disabled (greyed) when toggle is off

**Friction subsection:**
- Enabled toggle
- Multiplier slider — range 0.3–1.5, step 0.05, labelled "Sticky (0.3) → Slippery (1.5)"
- Slider disabled when toggle is off

State lives in `mission_editor_state.js` under `state.modifiers`. Mutations go through the existing `patchState` / `markDirty` pattern. No new state module needed.

Implementation can be a new `js/mission_editor_modifiers.js` (render function + event wiring) following the existing pattern of `mission_editor_meta.js`.

## 10. Files changed

| File | Change |
|---|---|
| `js/mission_loader.js` | Normalise old `{available,defaults}` shape on read |
| `js/mission_editor_state.js` | New-mission default uses new shape; `patchState` covers `modifiers` |
| `js/mission_editor_modifiers.js` | New file — accordion render + event wiring |
| `js/mission_editor_meta.js` | Insert modifiers accordion into right-panel render order |
| `js/mission_engine.js` | Poke timer state + tick logic + lifecycle hooks |
| `js/simulator.js` | `applyPoke()`, `setFrictionMultiplier()`, `_frictionMultiplier` in constructor/reset, `_pokeFlashUntilMs` in draw loop, friction scale in `_animateSingleMotor` |
| `js/mission_ui.js` | Modifier badge chips in Mission Map panel |
| `css/` (existing mission styles) | Poke flash ring needs no new CSS — drawn on canvas |
| `missions/*/mission.json` (×5) | Housekeeping update to new schema shape (no behaviour change) |

## 11. Build order

1. **Schema + loader migration.** Update all mission JSON files and the loader normalisation. All existing missions still run unmodified.
2. **Simulator hooks.** `applyPoke`, `setFrictionMultiplier`, `_frictionMultiplier` in `_animateTank` and `_animateSingleMotor`. Unit-testable in isolation.
3. **Mission engine poke scheduling.** Wire into existing tick. Requires §2.
4. **Mission engine friction.** Wire `load()` / `reset()` hooks. Requires §2.
5. **Play-mode UI.** Modifier badges + poke flash ring. Requires §2 for the flash.
6. **Editor UI.** Modifiers accordion + wiring to state. Independent of §2–5 (pure UI state).
7. **Enable modifiers on at least one bundled mission** to validate end-to-end.

## 12. Open questions

- **`_animateSingleMotor` friction.** The design applies `_frictionMultiplier` there too, but single-motor moves are less common in FLL programs. Confirm during implementation that the same per-step velocity scaling is appropriate.
- **Poke while robot is stationary.** `applyPoke` no-ops if `!isRunning`. If the robot is stopped inside a `motor_pair.run` forever-loop, `isRunning` is true — the poke will fire and the robot will be displaced. This is correct behaviour but worth confirming in testing.
- **Max poke magnitude constants.** `MAX_POKE_POS_MM = 30` and `MAX_POKE_HEADING_DEG = 20` are educated guesses. Adjust after playtesting if severity 1.0 feels too extreme.
