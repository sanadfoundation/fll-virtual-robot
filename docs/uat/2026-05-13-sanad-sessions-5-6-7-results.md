# UAT — Sanad Robotics Sessions 5, 6, 7

12 new scenarios extracted from `Session 5.pdf`, `Session 6.pdf`,
`Session 7.pdf` and run against the simulator. Driver and harness same as
the earlier results doc (Chrome DevTools MCP, `window.__uat` poller).

The Sanad curriculum gives precise robot dimensions for Driving Base 1
(wheel diameter 5.6 cm, track width 11.2 cm) and several formulas that
let us check the simulator's calibration against documented expectations.

## Verdict table

| ID            | Verdict | End (x, y) mm  | Heading | Source slide                       | Notes |
|---------------|---------|----------------|---------|------------------------------------|-------|
| S5-Steer1     | PASS    | (350, 517)     | 90°     | S5 "Steering (degrees)" — value 0  | 720° at steering=0 → 354 mm straight north, x unchanged. |
| S5-Steer2     | FAIL    | (403.8, 261)   | 30.1°   | S5 "Steering (types)" — value 50   | Bug #3: only 60° pivot instead of the lesson's 90° pivot. |
| S5-Steer4     | FAIL    | (405.8, 221.3) | -2.1°   | S5 "Steering (types)" — value 100  | Bug #3: produced pivot (center moved 80 mm) instead of in-place spin. |
| S5-Loop1      | PASS    | (350, 163)     | 90°     | S5 "For Loop (Assignment 1)"       | Console exactly: `Current loop is 1..5 for sure`. |
| S5-Example    | PASS    | (406.1, 1684)  | -2.1°   | S5 "Await (example)"               | `light_matrix.write` + `move_for_degrees` + `motor.run` ran without errors. |
| S6-While1     | PASS    | (350, 163)     | 90°     | S6 "While Loop (examples)"         | Console exactly: 1, 2, 3, 4, 5. |
| S6-Rotation90 | FAIL    | (365.5, 204)   | 44°     | S6 "Rotation Degrees Formula"      | Formula `(11.2 / 5.6) × 90 = 180` is right, simulator track/wheel ratio matches; turned only 46° due to Bug #3. |
| S6-Path       | FAIL    | (35, 2470)     | 90°     | S6 "Moving the Robot" — 5s/45°/2s/-45°/5s | Forward legs match expected 2333 mm; Bug #3 turns drifted x from 350 → 35. Also drove ≈ 1300 mm past the top wall. |
| S7-50cm       | PASS    | (350, 661)     | 90°     | S7 "Competition Solution"          | 1023 motor degrees → 498 mm vs target 500 mm. Wheel diameter calibration matches 5.6 cm. |
| S7-Continue2  | PASS    | (350, 163)     | 90°     | S7 "While Loop Assignment"         | Console: `Are you 1, 2, 4, 5, 6, Wawo` (skipped 3 via `continue`). |
| S7-AccelMove  | PASS\*  | (350, 1138)    | 90°     | S7 "Acceleration Practice"         | 2 s × 1000 deg/s → 975 mm. `acceleration=5000` accepted; *effect on motion profile not verified* (see new gap). |
| S7-Hexagon    | PASS    | (352.7, 157.5) | 90.9°   | S7 "Hexagon Moving Path"           | Returned to spawn within 6 mm and 1°. **Coincidence**: with the lesson's `motor_degrees = (track/wheel) × angle × 2 = 240`, Bug #3's pivot produces 60° per step, which sums to 360° over 6 sides. |

**Totals:** 8 PASS · 1 PASS\* (limited verification) · 3 FAIL. Zero BLOCKED.
All 3 failures cascade from Bug #3 — no new simulator bugs surfaced.

## What the run confirms

- **Wheel diameter calibration matches the curriculum.** S7-50cm requested
  1023 motor degrees and got 498 mm of travel (0.4 % short of target).
  The simulator's underlying wheel circumference is the lesson's
  17.58 cm.
- **Track-width / wheel-diameter ratio matches.** S6-Rotation90 used
  180 motor degrees expecting a 90° spin; the simulator turned 46° via a
  pivot (motor degrees on one wheel). Run the same math with the simulator's
  pivot model: `arc = π × 5.6 × (180 / 360) = 8.79 cm`; `rotation = arc /
  track = 8.79 / 11.2 = 0.785 rad = 45°` — matches the 46° observation
  exactly. Geometry is right; steering semantics are wrong.
- **The Python runtime is solid.** Three pure-Python tests (`for`, `while`,
  `continue` with f-strings) printed exactly the expected output.
- **`light_matrix.write` works.** S5-Example's `write("Hi!")` dispatched
  cleanly through `hub_display`. (`show_image` is still the broken case —
  see prior results doc Bug #5.)

## New gap surfaced

**Acceleration / deceleration parameters are accepted but unobservable.**
S7-AccelMove with `velocity=1000, acceleration=5000` over 2 s produced
975 mm of travel — exactly what `duration × velocity / 360° × wheel_circ`
predicts for *constant* velocity. The bridge forwards the values but
`_animateTank` doesn't model ramp-up/ramp-down (`py/spike_bridge.py:259-262`
converts duration to a fixed degree count, and `_execCmd 'move'` /
`'move_tank'` pass it straight to `_animateTank` with no acceleration
field).

This becomes its own teaching gap: the Sanad Session 7 lesson explicitly
says "the lower the acceleration, the better acceleration can be observed"
and asks students to test `velocity=1000 | acceleration=50 |
deceleration=50`. In the simulator, the chosen acceleration has no visible
effect — students cannot complete the lesson's central exercise.

## Pattern observations

- 75 % pass rate on a fresh batch shows the pattern works when the
  underlying simulator is reasonably calibrated. The 25 % that fail all
  cascade from the same root bug (steering math).
- One test (S7-Hexagon) passes because Bug #3's per-turn error sums to a
  full rotation by coincidence. This is the kind of "false-PASS" the doc
  pattern surfaces — the hexagon closes, but for the wrong reason. A
  3-side or 5-side test would fail at the same root cause.
- Sanad's calibration numbers (5.6 cm wheel, 11.2 cm track) align with
  the simulator's physics constants. If a future student is following
  these slides, the *distance and turn-angle math is teachable today*
  once Bug #3 lands.

## Updated bug ledger

| # | Bug                                                           | New evidence from this batch                                              |
|---|---------------------------------------------------------------|---------------------------------------------------------------------------|
| 1 | `motor_pair.move` continuous capped at 200 mm                 | Not exercised in this batch.                                              |
| 2 | Color sensor mounted behind robot                             | S6-Rotation90 surfaced `color: black` mid-pivot — sensor passed over launch line behind the robot. |
| 3 | Steering math doesn't match SPIKE                             | Confirmed by S5-Steer2, S5-Steer4, S6-Rotation90, S6-Path. New angle: with the right motor-degree count, Bug #3's pivot can be made to *look* correct (S7-Hexagon). |
| 4 | Negative `move_for_degrees` goes forward                      | Not exercised.                                                            |
| 5 | `light_matrix.show_image` is silent                           | Not exercised. `light_matrix.write` works (S5-Example).                    |
| 6 | **NEW** — `acceleration` / `deceleration` parameters are no-ops | S7-AccelMove travelled `duration × velocity` exactly, indicating no ramp. |
