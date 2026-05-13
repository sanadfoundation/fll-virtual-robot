# Lesson-Based UAT — primelessons.org SPIKE 3 curriculum

UAT scenarios derived from the SPIKE 3 instructor slides at
https://primelessons.org/en/Lessons.html. Each scenario gives a student-style
program plus a concrete pass criterion observable in the simulator UI
(ruler, position panel, yaw, sensor panel, trail).

## Simulator baseline (taken as given for every test)

- Field 2362 × 1143 mm, origin bottom-left, math y-up.
- Robot spawns at `(350, 163)` heading `90°` (facing north / +y).
- Canonical port wiring: `A`, `B` = motors; `C` = force sensor;
  `E` = color sensor; `F` = distance sensor. *(Lesson slides use `A+E` for
  the drive pair on Droid Bot IV; the simulator's `E` is a colour sensor,
  so the programs below use `A+B`.)*
- Field landmarks usable by tests:
  - Black line spans the field at math-y `463` (sensor reads `black` there).
  - Black launch line at math-y `143`, x ∈ `[0, 680]`.
  - Colour zones: yellow `(900,843)+200×200`, green `(1600,843)+200×200`,
    red `(1900,243)+200×200`, HOME blue `(80,63)+600×300`.
  - Obstacles: purple box centred at `(1700, 943)`, orange box centred at
    `(2000, 343)`.

Every program follows the same shell:

```python
from hub import port
import motor_pair, runloop

async def main():
    motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)
    # … test-specific body …

runloop.run(main())
```

For brevity the shell is omitted below; only `main()`'s body is shown.

---

## Movement — `SP3MovingStraight.pdf`

### UAT-M1 — Move 10 cm forward (Challenge I)

```python
await motor_pair.move_for_degrees(motor_pair.PAIR_1, 360, 0, velocity=400)
# Tune the degree count for the simulator's wheel calibration if needed;
# the lesson uses "move forward for 10 cm" via the SPIKE distance helper.
```

**Pass:** robot moves straight north (heading stays at 90°), final y is
`163 + 100 ≈ 263 mm` (±10 mm tolerance), x unchanged at 350 mm. Trail is a
single straight vertical segment.

### UAT-M2 — Forward 40 cm then back 40 cm (Challenge II)

```python
await motor_pair.move_for_degrees(motor_pair.PAIR_1, 1440, 0, velocity=400)
await motor_pair.move_for_degrees(motor_pair.PAIR_1, -1440, 0, velocity=400)
```

**Pass:** robot reaches ≈ `(350, 563)`, then returns to `(350, 163)` ±15 mm
on both legs. Final pose ≈ spawn pose. Trail shows an out-and-back overlap
on the same line.

### UAT-M3 — Drive for 3 seconds using start/stop (Challenge III)

```python
motor_pair.move(motor_pair.PAIR_1, 0, velocity=400)
await runloop.sleep_ms(3000)
await motor_pair.stop(motor_pair.PAIR_1)
```

**Pass:** robot drives north for ~3 s, then halts; trail length matches
3 s × commanded velocity. After `stop()` the position panel stops changing.

---

## Turning — `SP3GyroTurning.pdf`

### UAT-T1 — Pivot turn right to 90° using yaw (Challenge I)

```python
from hub import motion_sensor
motion_sensor.reset_yaw(0)
await runloop.sleep_ms(50)              # SPIKE 3 yaw-reset bug workaround
motor_pair.move_tank(motor_pair.PAIR_1, 200, 0)   # right pivot, A wheel only
while motion_sensor.tilt_angles()[0] < 900:        # decidegrees
    await runloop.sleep_ms(10)
await motor_pair.stop(motor_pair.PAIR_1)
```

**Pass:** heading swings from 90° (north) to ≈ 0° (east), ±5°. x increases
slightly because the pivot is around the stationary wheel; y largely
unchanged.

### UAT-T2 — Left turn to −90° (Turning Right vs. Left slide)

Same as T1 but with `motor_pair.move_tank(..., 0, 200)` and exit condition
`yaw > -900` (i.e. `tilt_angles()[0] > -900` is False).

**Pass:** heading swings from 90° to ≈ 180° (west), ±5°.

### UAT-T3 — Spin turn 180° (Challenge 2 — return to first base)

```python
await motor_pair.move_for_degrees(motor_pair.PAIR_1, 360, 100, velocity=300)
# steering=100 → spin right; degrees tuned so robot rotates ~180°.
```

**Pass:** heading goes from 90° to ≈ 270° (south), ±5°. Robot's centre of
mass is approximately unchanged (spin turns rotate about the centre).

### UAT-T4 — Baseball diamond (Challenge 1, run-the-bases)

```python
for _ in range(4):
    await motor_pair.move_for_degrees(motor_pair.PAIR_1, 720, 0, velocity=400)
    await motor_pair.move_for_degrees(motor_pair.PAIR_1, 360, 100, velocity=300)
```

**Pass:** trail traces a closed quadrilateral; final pose returns within
±50 mm of spawn and ±15° of original heading. Demonstrates compound
move+turn sequencing without drift accumulating beyond tolerance.

---

## Accurate turns — `SP3AccurateTurning.pdf`

### UAT-AT1 — 90° pivot via duration (Challenge: use move blocks only)

```python
await motor_pair.move_for_degrees(motor_pair.PAIR_1, 360, 50, velocity=300)
# steering=50 → right pivot; one wheel turns 360° while the other holds.
```

**Pass:** robot heading rotates ≈ 90° right (90° → 0° ±5°). Demonstrates
that distance-based turns are repeatable (run twice → near-identical end
pose, while a yaw-`>90` open-loop turn over-shoots due to momentum).

---

## Colour sensor — `SP3ColorSensor.pdf`

### UAT-C1 — Drive forward until black line (Challenge 1)

```python
import color_sensor, color
motor_pair.move(motor_pair.PAIR_1, 0, velocity=300)
while color_sensor.color(port.E) != color.BLACK:
    await runloop.sleep_ms(20)
await motor_pair.stop(motor_pair.PAIR_1)
```

**Pass:** robot stops on the horizontal black line at math-y `463`. Final y
within `463 ± 20 mm` (sensor read latency window). The colour panel reads
`BLACK (0)` at the moment of stop.

### UAT-C2 — Stop on the yellow zone

Same as C1 with `color.YELLOW`. Course-correct heading or distance so the
straight-north path crosses the yellow rectangle: yellow zone is at x ∈
`[900, 1100]`, y ∈ `[843, 1043]`. So first pivot-turn to ~30°, drive ~1000 mm,
then expect the colour sensor to trigger on yellow.

**Pass:** position panel shows the robot stopped inside the yellow
rectangle; colour panel reads `YELLOW (7)`.

---

## Distance sensor — `SP3DistanceSensor.pdf`

### UAT-D1 — Approach wall and stop (Challenge: Away from the wall)

Spawn-relative target: drive north until the distance sensor reads < 200 mm.
The field walls are at math-y `1143`; from spawn at y=163 there is ~980 mm
of clear travel.

```python
import distance_sensor
motor_pair.move(motor_pair.PAIR_1, 0, velocity=400)
while distance_sensor.distance(port.F) > 200:
    await runloop.sleep_ms(20)
await motor_pair.stop(motor_pair.PAIR_1)
```

**Pass:** robot stops with the distance-sensor reading ≤ 200 mm.
Visually the robot has approached but not collided with the north wall (or
an obstacle, if one was placed in front).

### UAT-D2 — Extension: back up after wall, find gap

After D1, command 30 cm reverse and re-check distance > 1000 mm.

```python
await motor_pair.move_for_degrees(motor_pair.PAIR_1, -1080, 0, velocity=400)
assert distance_sensor.distance(port.F) > 800
```

**Pass:** robot reverses ~30 cm, final distance reading is greater than the
stop threshold, no collision occurred.

---

## Repeat blocks — `SP3RepeatBlocks.pdf`

### UAT-R1 — Around the box (Challenge: 20 cm × 4 sides)

```python
for _ in range(4):
    await motor_pair.move_for_degrees(motor_pair.PAIR_1, 720, 0, velocity=400)  # ~20 cm
    await motor_pair.move_for_degrees(motor_pair.PAIR_1, 360, 50, velocity=300) # ~90°
```

**Pass:** trail draws a (roughly) closed square; final pose within ±60 mm of
spawn and ±20° of original heading. Confirms the `repeat 4` loop produces a
visibly closed polygon.

### UAT-R2 — Repeat-until-sensor (force button stops the drive)

```python
import force_sensor
motor_pair.move(motor_pair.PAIR_1, 0, velocity=300)
while not force_sensor.pressed(port.C):
    await runloop.sleep_ms(20)
await motor_pair.stop(motor_pair.PAIR_1)
```

**Pass:** robot drives north continuously; when the tester clicks the Hub
force-sensor button in the UI, the robot stops within ~200 ms. (Manual
trigger — accepted in UAT.)

---

## If-Then blocks — `IfThenBlocks.pdf`

### UAT-I1 — Happy / Sad on force press

```python
from hub import light_matrix
while True:
    if force_sensor.pressed(port.C):
        await light_matrix.show_image(light_matrix.IMAGE_SMILE)
    else:
        await light_matrix.show_image(light_matrix.IMAGE_SAD)
    await runloop.sleep_ms(50)
```

**Pass:** hub LED panel toggles between smile and sad as the tester
presses / releases the force button. Demonstrates `if/else` driven by a
live sensor read inside a `forever` loop.

---

## Line follower — `SP3LineFollower.pdf`

### UAT-L1 — Follow right edge of black line (Challenge: Follow a line)

Manual pre-position: drag the robot (via the simulator's reset/manual-place
UI, if available) so it straddles the right edge of the y=463 black line,
heading east (`0°`). If manual placement isn't supported, the test runs
from spawn and the line is treated as a stop-condition for C1 only.

```python
import color_sensor, color
while True:
    if color_sensor.color(port.E) == color.BLACK:
        motor_pair.move_tank(motor_pair.PAIR_1, 200, 50)   # turn right
    else:
        motor_pair.move_tank(motor_pair.PAIR_1, 50, 200)   # turn left
    await runloop.sleep_ms(20)
```

**Pass:** robot oscillates along the y=463 line, progressing east. The
trail traces a zig-zag that hugs the line edge for at least 500 mm before
the test is stopped.

---

## Out-of-scope / gaps observed while writing this

- **Manual pre-placement.** L1, C2 and any "Droid-Bot-IV starts off the
  spawn pose" lesson need a way for the tester to set the robot's start
  pose. Verify the simulator exposes this in the UI — if not, file a
  follow-up.
- **Reflected-light mode** is mentioned in the line-follower slides. The
  simulator's `color_sensor.reflection()` returns a default of `50` and
  isn't driven by field colour today; reflected-light variants of L1 will
  not behave like the lesson until the simulator computes reflection from
  the field.
- **Gyro drift** lesson (`SP3GyroDrift.pdf`) was not fetched — the
  simulator's yaw has no drift model, so any drift-correction UAT would be
  vacuous and is intentionally omitted.
- **Variables / MyBlocks / Proportional / PID line followers** are
  programming-style lessons, not new robot behaviours; their UAT collapses
  into existing tests above (different program shape, same observable
  outcome).
