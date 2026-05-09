# Internal Coordinate System Flip — Math Convention (y-up) — Design

**Date:** 2026-05-09
**Builds on:** `feature/canvas-ruler` (HEAD: `b623e28`)
**Replaces non-goal in:** `docs/superpowers/specs/2026-05-08-canvas-ruler-design.md` (the y-axis ran top-to-bottom because the simulator's whole stack used canvas-Y-down). The canvas-ruler feature ships unchanged in user-facing behavior; this spec changes the internal convention so the eventual ruler labels and Hub Y read in math convention without a display-time flip.

## Problem

The simulator's internal coordinate system is canvas-Y-down: `robot.y = 980` means "near the bottom of the screen" (= near the team's launch end), and `robot.heading = -90` means "facing up the screen" (north). That's correct for raw canvas rendering, but it means every consumer of the pose — Hub panel, ruler labels, hover overlay, the inevitable distance-measure tool, anyone reasoning about a Spike program in a debugger — has to mentally invert. The cognitive load compounds: every time you see `robot.y` in code, you ask "is this canvas-y or math-y?", and the answer depends on context.

The fix is to flip the internal convention to math y-up, with rendering converting at the boundary. Internal pose now matches what students learn in math class (origin at bottom-left, y increases upward, angles increase counter-clockwise from east). Rendering takes math-y in and emits canvas-y out — a one-line conversion at every drawing site.

The test suite (211 tests) is the safety net: ~30 of those tests are convention-independent and stay green throughout the change; the ~7 that hardcode `980` / `-90` get updated to match the new convention.

## Goals

- Internal `robot.x`, `robot.y`, `robot.heading` use math convention: origin bottom-left, y up, angles `0=east 90=north 180=west 270=south`.
- Spawn: `(350, 163)` heading `90°`.
- Rendering layer (canvas + DOM) converts math → canvas at the boundary; nothing else converts.
- Spike API behavior (commands, sensor reads) is unchanged from the user's perspective. `motor_pair.move(1, 'rotations')` from spawn moves the robot toward the far end of the mat in both conventions.
- Box2D physics layer is unchanged; the convention is established by callers.
- All 211 existing tests either pass unchanged (convention-independent) or get a single-value update (hardcoded spawn / heading).
- Steering convention stays: `> 0` is a right turn = left wheel faster.

## Non-goals

- Changing the Spike Prime Python API or its tests. The Spike hub doesn't expose global X/Y; tests on commands and sensors are convention-independent.
- Changing Box2D's internal conventions. Box2D is just numbers; we control what we feed in and read out.
- Adding a y-down toggle or backwards-compatibility shim. The convention is internal; one chosen direction.
- Refactoring `_animateTank`, `_sensorPosition`, or `_colorAtPosition`. The trig is already convention-agnostic when y and heading are consistent.
- Touching the Spike Prime API mock in `py/spike_bridge.py`.

## Architecture

### Internal model (changes)

| State | Old (canvas-y-down) | New (math y-up) |
|---|---|---|
| `robot.y` | 0 (top) … 1143 (bottom) | 0 (bottom) … 1143 (top) |
| `robot.heading` | 0=east, 90=south, -90=north | 0=east, 90=north, 180=west, 270=south |
| Spawn | `(350, 980)` heading `-90` | `(350, 163)` heading `90` |
| Right turn → angular velocity | positive (CW = +Δheading on canvas) | negative (CW = −Δheading in math) |

### Why the same trig works in both conventions

`wheelsToBodyVelocity` returns `(vx, vy, angVel)` in world frame:

```
vx = cos(heading) * linSpeed
vy = sin(heading) * linSpeed
angVel = ±(rightSpd - leftSpd) / trackWidth   // sign depends on convention
```

The `vx` / `vy` formula is convention-agnostic: if `heading=90` means north *and* `+y` means north (math convention), `cos(90)=0, sin(90)=1` correctly produces `(0, +linSpeed)`. If `heading=-90` means north *and* `-y` means north (canvas convention), `cos(-90)=0, sin(-90)=-1` correctly produces `(0, -linSpeed)`. Same equations, different convention triggers different signs in the right places.

The `angVel` sign is the only thing that depends on convention. Currently:

```javascript
angVel: -(rightSpd - leftSpd) / trackWidthMm,
```

The leading minus exists *because* canvas-y-down inverts the rotational sense. For math y-up, drop the minus:

```javascript
angVel: (rightSpd - leftSpd) / trackWidthMm,
```

That's the entire kinematics change.

### `_sensorPosition` is also unchanged

```javascript
const rotRad = (robot.heading + 90) * Math.PI / 180;
return {
  x: robot.x - localY * Math.sin(rotRad),
  y: robot.y + localY * Math.cos(rotRad),
};
```

At canvas heading `-90` (north): `rotRad=0`, sensor at `(robot.x, robot.y + 88)` — south of robot in canvas convention (i.e. behind the north-facing robot). At math heading `90` (north): `rotRad=180°`, sensor at `(robot.x, robot.y - 88)` — south of robot in math convention (also behind). Same physical location, same formula, different inputs.

### Rendering boundary

The rendering layer converts math-y → canvas-y using `canvasY = FIELD_H_MM - mathY` (with `- h` adjustment for rectangles, since their `(x, y)` corner in math is bottom-left but canvas needs top-left).

Touchpoints in `js/simulator.js`:

| Function | Change |
|---|---|
| `makeRobotState()` | Spawn `y: 163`, `heading: 90` (currently `y: 980`, `heading: -90`). |
| `FIELD_OBJECTS` | Every `y` recomputed in math convention (see "Field-object value table" below). |
| `OBSTACLES` | Same. |
| `_drawField` | For each rect: canvas top-left = `(obj.x, FIELD_H_MM - obj.y - obj.h) * s`. For each line: `y → FIELD_H_MM - y`. For each circle: `y → FIELD_H_MM - y`. Grid lines: drawn canvas-y, no change (visual symmetry — labels for the grid are on the ruler, not here). |
| `_drawRobot` | `ctx.translate(r.x * s, (FIELD_H_MM - r.y) * s);` — invert y. `ctx.rotate((90 - r.heading) * Math.PI / 180);` — invert rotation sense (was `r.heading + 90`). |
| `_drawTrail` / `_redrawTrailCanvas` / `_appendTrailSegment` | Trail points are stored in math y; canvas-draw converts: `(p.x * s, (FIELD_H_MM - p.y) * s)`. |
| `_drawRuler` | Y-axis tick: drawn at canvas y = `(FIELD_H_MM - mathY) * s`. Tick label is the math-y value. **Origin marker** moves from top-left to bottom-left of the canvas. **X-axis labels** move from top edge to bottom edge (so both axes meet at the bottom-left origin — full math-convention symmetry). |
| `_handleHover` | Flip cursor y for display: `mathCursorY = FIELD_H_MM - canvasCursorY` after `clientToMM`. |
| `_updateSensorPanel` | No change. `r.y` and `r.heading` are now math values, which is what we want to display. The existing `(((r.heading % 360) + 360) % 360)` produces the right math-degree result. The `(r.y / 10).toFixed(1) + ' cm'` formula reads correctly with math y. |

### `js/world_2d.js`

Zero changes. Box2D is convention-agnostic — `addRobot`/`setKinematicVelocity`/`readPose` take and return whatever numbers the caller gives them. The convention is established by what `_animateTank` puts in (math heading, math velocities) and reads out (math pose).

### `js/ruler.js`

Zero changes for now. `clientToMM` keeps returning canvas-mm; `_handleHover` does the y-flip locally. (An alternative — making `clientToMM` itself math-aware by adding a `fieldH` parameter — is plausible but adds coupling for one call site. Defer.)

### `js/kinematics.js`

One line in `wheelsToBodyVelocity`: drop the leading minus on `angVel`. Update the inline comment from "Sign convention preserved from the canvas-Y-down legacy integrator" to "Math y-up: right-turn = left wheel faster ⇒ rightSpd-leftSpd < 0 ⇒ angVel < 0 ⇒ body angle decreases (CW in math convention)."

### Field-object value table

`FIELD_OBJECTS` (rectangles defined as `{x, y, w, h}` where (x, y) is the corner anchor):

| Object | Old (canvas top-left) | New (math bottom-left) |
|---|---|---|
| HOME zone (`y=780, h=300`) | y=780 | y=`1143-780-300 = 63` |
| Mission yellow (`y=100, h=200`) | y=100 | y=`1143-100-200 = 843` |
| Mission green (`y=100, h=200`) | y=100 | y=843 |
| Mission red (`y=700, h=200`) | y=700 | y=`1143-700-200 = 243` |
| Black line at canvas y=680 | y=680 | y=`1143-680 = 463` |
| Circle (1181, 571), r=80 | y=571 | y=`1143-571 = 572` |
| Black line at canvas y=1000 (launch) | y=1000 | y=`1143-1000 = 143` |

`OBSTACLES` (rectangles same convention):

| Object | Old | New |
|---|---|---|
| Mission obstacle 1 (`y=200, h=100`) | y=200 | y=`1143-200-100 = 843` |
| Mission obstacle 2 (`y=800, h=120`) | y=800 | y=`1143-800-120 = 223` |

(Math: HOME ends up near the bottom — y=63..363 — which is "near the launch end / team side." Far-end missions move to y=843 — the upper part of the math-coord field. This matches physical intuition: HOME is near the team, far missions are far.)

## Data flow

```
Spike command (e.g. motor_pair.move) →
  _animateTank →
    kinematics.wheelsToBodyVelocity(leftV, rightV, headingRad, …) →
      // Same vx/vy formula; angVel sign no longer negated.
      { vx, vy, angVel } in math convention
    physics.setKinematicVelocity(body, vx, vy, angVel) →
      // Box2D doesn't know what convention is in play — it just integrates.
    physics.readPose(body) →
      { x, y, angle } in math convention
    robot.{x,y,heading} ← pose

Render frame:
  _drawField(ctx, …) →
    // Reads FIELD_OBJECTS in math convention.
    canvas top-left = (obj.x, FIELD_H_MM - obj.y - obj.h) * scale
  _drawRuler(ctx, s) →
    // tickPositions returns math-y values; canvas y = (FIELD_H_MM - mathY) * s.
  _drawRobot(ctx, s) →
    // canvas (r.x, FIELD_H_MM - r.y) * s, rotation = (90 - r.heading)
  _drawTrail(ctx) →
    // trail points stored in math; canvas-y converted at draw time.

Hover:
  mousemove → clientToMM (canvas-mm) → _handleHover flips y → display math-y
```

One conversion site per rendering surface; no duplication.

## Edge cases

| Case | Behavior |
|---|---|
| Robot drives "forward" (motor_pair.move with positive speed, no steering) from spawn | `r.y` increases (north = +y in math). Eventually clamps at field top. |
| Right turn from spawn (steering > 0) | `angVel < 0` → `r.heading` decreases. From 90° → 80° → 70° (heading rotates from "north" toward "east" — visually CW). |
| Color sensor on launch line | Launch line moves to math y=143; sensor reads `'black'` at robot poses near that y. Test in `tests/js/sensors/` should remain green because it doesn't hardcode 1000 vs 143; it just exercises the read path. (Verify during implementation.) |
| Trail dash continuity | Trail rendering already keeps `_trailArc` in pixel space; flipping math→canvas inside the segment write doesn't affect arc length. Should remain visually identical. |
| Existing localStorage state from before this change (none — branch is unmerged) | Not an issue; no persisted pose. |
| External tools / Linear / Slack / docs that reference "spawn at y=980" | Not applicable; this branch isn't shipped. |

## Testing

### Tests that change (7 files)

| File | Change |
|---|---|
| `tests/js/state/reset.test.js` | `robot.y === 980` → `163`; `robot.heading === -90` → `90`. Two assertions in two test cases. |
| `tests/js/state/sensor-state.test.js` | `state.heading === -90` → `90`. One assertion. |
| `tests/js/bridge/bridge-protocol.test.js` | `result.heading === -90` → `90`. One assertion. |
| `tests/js/commands/dispatch.test.js` | `sim.robot.y === 980` → `163`. Two assertions. |
| `tests/js/commands/dispatch-extra.test.js` | `sim.robot.y === 980` → `163`; `sim.robot.heading === -90` → `90`. Four assertions. |
| `tests/js/physics/world_2d_boundary.test.js` | `world.addRobot(…, { x: 350, y: 980 }, -Math.PI / 2)` → `(…, { x: 350, y: 163 }, Math.PI / 2)`. Two test cases. |
| `tests/js/physics/kinematics.test.js` | `wheelsToBodyVelocity` angVel sign: a "right turn → +angVel" assertion becomes "right turn → -angVel". Plus the analogous "left turn → -angVel" → "+angVel". Test names updated to reflect the new convention. |

### Tests that stay unchanged (~30 files, ~200 assertions)

- `tests/js/blockly/*` — generators emit pose-independent JS; no hardcoded positions.
- `tests/js/commands/dispatch.test.js` (most cases — only the two y-asserting cases change).
- `tests/js/main/run-pipeline.test.js` — execution flow, no pose.
- `tests/js/monaco/spike-api.test.js` — API surface.
- `tests/js/persistence/*` — theme/speed/tab.
- `tests/js/ruler/ruler.test.js` — pure helpers, no pose.
- `tests/js/sensors/accessors.test.js` — sensor accessor wiring; no pose.
- `tests/js/state/port-config.test.js` — port wiring.
- `tests/js/state/sensor-availability.test.js` — sensor availability.
- `tests/js/version_check/*` — version detection.
- `tests/js/physics/conversions.test.js` — mm/m conversion math.
- `tests/js/physics/world_2d_boundary.test.js` (most cases).
- `tests/js/physics/kinematics.test.js` (most cases — only the two angVel-sign cases change).
- `tests/py/*` — Python-side Spike API tests; convention-independent.

These ~200 assertions are the safety net: they confirm that the change is *internal* and doesn't leak into user-visible API behavior.

### Manual smoke

(After implementation, before merge.)

1. `python3 -m http.server 8787`. Open the page.
2. Hub panel reads `Y: 16.3 cm` (was 98.0 cm), `Heading: 90°` (was 270°). Spawn behavior unchanged visually.
3. Run `motor_pair.move(1, 'rotations')` from spawn. Robot drives toward the far end of the mat. After ~176 mm of travel, Hub panel `Y` reads `16.3 + 17.6 = 33.9 cm` (or close — physics may differ slightly).
4. Run a right-turn program. Watch heading. Should decrease (90 → 80 → 70 → …). The robot rotates CW visually, same as before.
5. Color sensor still detects HOME zone, mission rects, and black lines at the same physical mat positions.
6. Ruler shows y-axis labels reading `0` at bottom and increasing upward to ~`100` (cm) at top.
7. Origin marker reads `0,0 cm` and sits at the bottom-left of the canvas.
8. Hover overlay y-coordinate matches the ruler at every cursor position.

## Open questions resolved during brainstorming

- **Display-only flip vs full internal flip** — chose **full internal flip**. The user explicitly cited the cognitive load of mental conversion when reading code. Display-only would have left the same problem in the codebase.
- **X-axis label placement** — bottom edge (full math-convention symmetry). Asymmetric (x at top, y at left going up) would have been a lesser commitment.
- **Trail / robot rotation direction** — flipping the rotation in `_drawRobot` (`(90 - heading)` instead of `(heading + 90)`) keeps the visual rotation matching the math heading. Right turn = CW rotation visually = `heading--` in math.
- **Branch strategy** — built off `feature/canvas-ruler` HEAD because the flip naturally subsumes the ruler's y-axis labels and origin position. The two features ship together.
- **Units selector spec compatibility** — the just-committed `2026-05-08-units-selector-design.md` remains valid because its `formatPosition(r.y, units)` operates on whatever `r.y` is — math-y in the new world, the same call shape as before. No re-spec needed.

## File touch list

- **Modified:** `js/kinematics.js` — sign flip on `angVel`; comment update.
- **Modified:** `tests/js/physics/kinematics.test.js` — flip the two angVel-sign assertions.
- **Modified:** `js/simulator.js` — spawn coords; FIELD_OBJECTS y values; OBSTACLES y values; rendering boundary in `_drawField`/`_drawRobot`/`_drawTrail`/`_drawRuler`; hover y-flip in `_handleHover`. **No change** to `_animateTank`'s integration loop, `_sensorPosition`, `_colorAtPosition`, `_amountToMM`, command-dispatch logic.
- **Modified:** `tests/js/state/reset.test.js`, `tests/js/state/sensor-state.test.js`, `tests/js/bridge/bridge-protocol.test.js`, `tests/js/commands/dispatch.test.js`, `tests/js/commands/dispatch-extra.test.js`, `tests/js/physics/world_2d_boundary.test.js` — flip hardcoded position/heading values.
- **Modified:** `CLAUDE.md` — Field section (spawn + heading convention); replace the "Canvas Y increases downward" constraint with "Internal coords are math-y-up; rendering converts at the boundary."
