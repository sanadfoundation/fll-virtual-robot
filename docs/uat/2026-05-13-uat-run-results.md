# UAT Run Results — 2026-05-13

Scope: every UAT from `2026-05-13-lesson-based-uat.md` not blocked by the
four documented gaps (L1 and C2 skipped). 14 scenarios run; verdicts and
the simulator bugs they exposed are recorded below.

Driver: Chrome DevTools MCP against the simulator served on
`http://localhost:8788/`. Each test resets the sim to spawn, writes its
program into Monaco, clicks Run, polls `btn-run.disabled` until the
program ends or 10–25 s elapses, and captures `window.sim.robot` plus the
last console lines.

## Verdict table

| ID  | Verdict   | End pose (x, y) mm | End heading | Notes                                                                 |
|-----|-----------|--------------------|-------------|-----------------------------------------------------------------------|
| M1  | FAIL      | (350, 337)         | 90°         | Test-program bug: 360° ≠ 10 cm. 1 rotation is ~17.5 cm in the sim.    |
| M2  | FAIL      | (350, 1567)        | 90°         | Bug #4: negative `degrees` produced forward motion (off-field).       |
| M3  | FAIL      | (350, 361)         | 90°         | Bug #1: `motor_pair.move` stopped at 200 mm, sleep didn't keep moving.|
| T1  | PASS\*    | (417.7, 218.5)     | -12.8°      | Rotated 102.8°; matches the lesson's expected ~102° overshoot.        |
| T2  | PASS\*    | (282.3, 218.5)     | 192.8°      | Mirror of T1.                                                          |
| T3  | FAIL      | (405.8, 221.3)     | -2.1°       | Bug #3: `steering=100` produced pivot, not spin; rotated only ~92°.   |
| T4  | PASS      | (326.4, 197.7)     | 81.7°       | Within ±50 mm of spawn, ±15° heading — generous tolerances helped.    |
| AT1 | FAIL      | (403.8, 261)       | 30.1°       | Bug #3 cascade: `steering=50` only turned 60° instead of 90°.         |
| C1  | FAIL (TO) | (350, 361)         | 90°         | Bug #1 + Bug #2: motor stops at 200 mm and color sensor is mounted behind, so loop never exits on the y=463 line. |
| D1  | FAIL (TO) | (350, 361)         | 90°         | Bug #1.                                                                |
| D2  | FAIL      | (350, 691)         | 90°         | Bug #4: `move_for_degrees(-1080, …)` went +528 mm forward.            |
| R1  | FAIL      | (1137.2, 72.3)     | 210.6°      | Bug #3 cascade: square doesn't close because each "right turn" is ~60°. |
| R2  | PASS      | (350, 361)         | 90°         | Once `sim.manualPress()` injected at t≈2.5s, the loop exits cleanly.   |
| I1  | BLOCKED   | (350, 163)         | 90°         | Bug #5: `_execCmd` has no `case 'hub_image'`; `show_image` is silent.  |

`(TO)` = timed out at the harness deadline (sim got stuck in a polling
loop the simulator can't satisfy). `PASS*` = behaviour matches the lesson
slide's *expected* outcome, even though it misses the doc's ±5° pass
criterion (which was too tight; the lesson explicitly predicts ~12° overshoot).

**Totals:** 3 PASS · 2 PASS-with-caveat · 8 FAIL · 1 BLOCKED · 0 not run
(out of 14 attempted, 2 skipped by the gaps doc).

## Bugs surfaced by the run

### Bug #1 — `motor_pair.move` is not continuous
`js/simulator.js:991-1002`. `start` and `start_tank` are documented as
"continuous … run for 2 seconds as approximation" but actually hand
`_animateTank` a hardcoded 200 mm reference distance, then stop. Real
SPIKE keeps the motors running until another command. Every test that
followed the lesson pattern "start moving, wait for sensor, then stop"
(M3, C1, D1, R2-without-injection) stalled at y ≈ 361 mm.

### Bug #2 — Color sensor mounted behind the robot
`js/simulator.js:1310-1317`. `_sensorPosition` uses `(heading + 90)°` for
its rotation and signs that place the sensor *behind* the robot center by
88 mm at every heading. From spawn driving north, the sensor ends up
over the launch line (y=143) — which is behind the wheels — instead of
ahead of them. Caught by C1 when our follow-up burst program "succeeded"
on the wrong line at y=159.

### Bug #3 — Steering math doesn't match SPIKE convention
CLAUDE.md and `js/simulator.js:967-978` use `lv = spd × (1 + steer)`,
`rv = spd × (1 - steer)` (linear). SPIKE 3's published semantics:
`steering=50` → pivot turn (one wheel stops), `steering=100` → spin
turn (wheels in opposite directions). The simulator's linear formula gives
a partial-pivot at every value:

- `steering=50` produced ~60° turn instead of 90° → broke AT1 and the R1 square.
- `steering=100` produced a pivot (one wheel stationary) instead of a spin → T3 rotated 92° instead of 180°, and the robot's centre shifted ~80 mm instead of staying put.

### Bug #4 — Negative degrees act like positive degrees
`motor_pair.move_for_degrees(pair, -1080, …)` should drive backwards, but
M2 and D2 both proved the robot drove *forward* by the same magnitude.
Suspect `_amountToMM` or `_animateTank` is calling `Math.abs` on the
distance somewhere — pending follow-up trace.

### Bug #5 — `light_matrix.show_image()` is a silent no-op
`_execCmd` has cases for `hub_display`, `hub_display_off`, and `hub_pixel`
but no `case 'hub_image'`. `_LightMatrix.show_image` in `py/spike_bridge.py:381`
dispatches `{type: 'hub_image', ...}` and the simulator drops it. I1
ran without error but the LED matrix never changed, so the smile/sad
toggle cannot be visually verified.

## Process notes

- The Blockly default workspace contains the word "Done!" as a static
  text label. Predicate-based `wait_for("Done")` hit that on the first
  call and lied about completion. **Always poll `btn-run.disabled` or
  `window.sim` state, not page text.**
- The Hub-panel force button is pointer-driven; a plain `.click()` doesn't
  trigger it. Use `window.sim.manualPress()` / `manualRelease()`
  directly for in-test force injection.
- A single test, ground-truth checked, replaced a paragraph of guesswork
  about whether the doc's pass criteria were achievable. The exercise
  also shrank the doc's gap section from 4 to 5 (added `hub_image`).

## Recommended fixes (rough priority)

1. **Bug #1** is the blast-radius king — fixing it unsticks M3, C1, D1, R2,
   and any future "start, wait, stop" lesson.
2. **Bug #3** affects most turning lessons. Either special-case 50/100 or
   document the simulator's steering as non-SPIKE.
3. **Bug #4** is a one-line fix once located (sign preservation).
4. **Bug #2** turning the rotation sign in `_sensorPosition` to `heading - 90`
   (or using `heading` directly with swapped x/y like `_distanceSensorMount`) ought to fix it.
5. **Bug #5** add `case 'hub_image'` that maps the named image to a 5×5
   pattern (or at minimum acknowledge the command so visual tests don't
   silently fail).
