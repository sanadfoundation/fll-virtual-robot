# SPIKE Prime API/Blockly audit — gap report

**Worktree:** `.worktrees/api-audit` (branch `chore/api-audit`, rebased onto `c041d74`)
**Doc inventory:** `docs/audit/python-api-spec.md` (556 lines, captures every documented Python module/method/constant)
**Test baseline:** Python **188/188** pass; JS **163/163** pass via `node --test`.

Sources:
- Python API: <https://spike.legoeducation.com/prime/modal/help/lls-help-python>
  (fresh full-prose JSON re-scrape lives at the run-result file referenced in
  the verification log; signatures cross-checked against `python-api-spec.md`)
- Word Blocks: <https://spike.legoeducation.com/prime/help/lls-help-word-blocks>
  (fresh per-block prose at `docs/audit/_scrape/word-blocks-prose.json` —
  covers 7 documented categories: Movement, Motor, Light, Sound, Events,
  Sensors, More Sensors. The other doc categories — Music, Bar Graph, Line
  Graph, Display, Weather, Operators, Control, Variables, More Movement,
  More Motors — were not in this scrape pass; their absence from the impl is
  verified directly against `js/blockly_config.js`.)

> **Note on the rebase.** Main added a 94-test "cover the gaps from the coverage-eval report" commit (`b2aa966`) that closes a substantial part of what would otherwise be Bucket 3. Several of those new tests **pin the current no-op behavior as the contract**, which is flagged below — they prevent regression but also lock in divergence from the LEGO docs.

Gaps split into five buckets. Items in **Bucket 1 are bugs** — the code disagrees with the docs. Items in 2–4 are coverage gaps. Bucket 5 is the inverse — code without a doc anchor.

---

## Verification log

Factual changes made during this verification pass against the fresh docs and
source. Items not listed were re-checked and confirmed unchanged.

- **Header**: corrected `python-api-spec.md` line count (487 → 556), and
  added pointer to the fresh prose scrapes that backed this audit.
- **Bucket 1.1**: confirmed the impl color table is wrong from value 3
  onward; clarified that Python's `color` enum (BLACK=0, MAGENTA=1, BLUE=3,
  AZURE=4, GREEN=6, YELLOW=7, RED=9, WHITE=10) **already matches** the
  word-block enum if you map "Magenta"↔"Violet" and "Azure"↔"Light Blue" —
  so `simulator.js` `COLOR_INT_MAP` and `spike_bridge.py` `_COLOR_INT_MAP`
  are correct. Only `js/blockly_config.js` (`_COLORS` and
  `_COLOR_INDEX_TO_NAME`) is wrong, plus `flippersensors_color`'s embedded
  inverse mapping. Doc text quoted exactly: `(0) Black (1) Violet (3) Blue
  (4) Light Blue (6) Green (7) Yellow (9) Red (10) White (-1) no color`.
- **Bucket 1.3**: Python preamble line was `:2143` but actual is `:2142`;
  fixed line ref. Doc default `velocity=360` confirmed from fresh scrape.
- **Bucket 1.4**: confirmed `set_pixel(x,y,intensity)` ranges `(0-4, 0-4)`
  in fresh docs; Blockly subtracts 1 to compensate for a 1-based label.
- **Bucket 1.5**: doc default `direction = motor.SHORTEST_PATH` confirmed
  verbatim from fresh scrape signature line.
- **Bucket 1.6**: doc prose "Get the velocity (deg/sec) of a Motor" confirmed
  verbatim; corrected the report's quoted prose accordingly.
- **Bucket 1.7**: confirmed force_sensor methods raise via `_require()` (no
  port has `'force_sensor'` configured in `_PORT_CONFIG`). The Python tests
  `test_force_raises_on_motor_port`, `_on_empty_port`, `test_pressed_raises`,
  `test_raw_raises` already pin the raise behavior — added that note.
- **Bucket 1.8**: fresh doc prose for `hub.button.pressed` confirmed
  ("Returns press duration in milliseconds"); claim unchanged.
- **Bucket 1.9**: doc signature `show(pixels: list[int])` and prose "list
  containing light intensity values for all 25 pixels" confirmed verbatim.
  Python impl emits `'CUSTOM'` regardless of `pixels` — confirmed.
- **Bucket 2 (force_sensor)**: removed misleading `force_sensor` row — these
  belong in Bucket 1.7 (already noted) and *do* now have raise-tests, so
  they aren't silent no-ops.
- **Bucket 2 (`hub.button.was_pressed`)**: moved to Bucket 5 — `was_pressed`
  is **not in the LEGO docs** at all (only `pressed` is documented for
  `hub.button`). The pinned-default test still applies but it pins
  undocumented behavior, not a doc gap.
- **Bucket 4 category count**: corrected — toolbox actually ships **13**
  categories (10 base + 3 extension), not 11. Base list: MOTORS, MOVEMENT,
  LIGHT, SOUND, EVENTS, CONTROL, SENSORS, OPERATORS, VARIABLES, MY BLOCKS.
- **Bucket 4 (Light/3x3 Color Matrix)**: fresh word-blocks JSON enumerates
  the 3x3 sub-blocks: `Turn On 3x3 Color Matrix [for Seconds]`, `Turn off
  3x3 Color Matrix`, `Set 3x3 Color Matrix Brightness`, `Set Pixel Brightness
  on 3x3 Color Matrix`, `Rotate Orientation of 3x3 Color Matrix`, `Set
  Orientation of 3x3 Color Matrix` — **7 sub-blocks**, matching the report.
- **Bucket 4 (Sound)**: fresh JSON confirms `Change Pitch Effect By` and
  `Set Pitch Effect By` are listed as separate documented blocks; the impl
  has only the generic Scratch `sound_changeeffectby` / `sound_seteffectto`
  (which are no-op comments). Corrected.
- **Bucket 4 (Events)**: fresh JSON confirms `When Hub Tilted`, `When Hub
  Orientation Is Up`, `When Hub Shaken`, `When Hub Button Pressed` are
  documented hat blocks; impl emits empty string for all (verified
  `js/blockly_config.js:1387–1394`).
- **Bucket 4 line refs**: corrected several stale line numbers that drifted
  during the rebase: `flipperevents_when*` empty-string registration is at
  `:1387–1394`, not `:1387`.

**Round 2 (2026-05-06 fixes pass):**

- **Test baseline updated**: Python 157→**188** (`+31` from
  `tests/py/test_motor_sensor_gaps.py`), JS 150→**163** (`+7` from
  `tests/js/blockly/color-and-force-parity.test.js`, `+6` from
  `tests/js/state/sensor-availability.test.js`). Verified locally with
  `python3 tests/py/run.py` and `node --test $(find tests/js -name '*.test.js')`.
- **Bucket 1.1 marked FIXED**: `_COLORS` now lists the eight documented
  values (`js/blockly_config.js:92–102`); `_COLOR_INDEX_TO_NAME` rewritten
  (`:1182–1192`); `flippersensors_color` reporter rewritten (`:1471–1474`).
  Asserted by `tests/js/blockly/color-and-force-parity.test.js`.
- **Bucket 1.2 marked FIXED**: `_PORTS_MULTI` removed; `_PORTS_SINGLE`
  collapsed to `[['A','A'],['B','B']]` (`js/blockly_config.js:31`) and
  every motor block now uses it uniformly (lines 291, 303, 314, 323, 331,
  340, 347).
- **Bucket 1.5 marked FIXED (partial)**: `motor.run_to_absolute_position`
  now forwards `direction` in the bridge command (`py/spike_bridge.py:171–179`).
  Sim's `_execCmd('motor_degrees')` (`js/simulator.js:539–544`) still ignores
  the field — value is on the wire but unused. Asserted by
  `TestRunToAbsolutePositionDirection`.
- **Bucket 1.6 marked FIXED**: per-port `_motor_velocities` tracker added
  (`py/spike_bridge.py:104–110`); every motor command updates it
  (`run_for_degrees:161, run_for_time:167, run_to_absolute_position:173,
  run_to_relative_position:184, run:190`); `motor.stop` resets to 0 (`:194–197`);
  `motor.velocity` reads it back (`:199–202`). Asserted by
  `TestMotorVelocityTracking`.
- **Bucket 1.7 marked FIXED**: simulator gained
  `_assertSensorAvailable(kind)` method (`js/simulator.js:486–492`); both
  `flippersensors_isPressed` (`js/blockly_config.js:1485–1493`) and
  `flippersensors_force` (`:1495–1499`) now emit the guard. Asserted by
  `tests/js/state/sensor-availability.test.js` (6 tests) and the parity tests.
- **Bucket 3 promotions**: `motor.run_to_absolute_position` /
  `_to_relative_position` / `run` continuous, `motor.velocity`,
  `motor_pair.stop(stop=)` kwarg pass-through, `motor_pair.move` default
  velocity, color-sensor return-value contracts, distance-sensor
  return-value contract & `-1` no-reading branch — all now COVERED-DEEP via
  `tests/py/test_motor_sensor_gaps.py`. Per-doc check: light_matrix
  `set_pixel` ranges `(0–4, 0–4)` confirmed verbatim in fresh prose; the
  similarly-named distance_sensor `set_pixel` ranges are `(0–3, 0–3)` per
  the docs, but the impl emits no command for it (no-op), so neither range
  is observable from outside.
- **Cross-check sweep on unchanged claims**:
  - 1.3 (`motor_pair.move` default velocity 360): **doc reconfirmed**
    verbatim `velocity: int = 360`. Python preamble line is `:2151`
    (drifted from `:2142` after the source edits this round) — fixed.
  - 1.4 (set_pixel range mismatch): doc reconfirmed `range (0 - 4)` for
    light_matrix; Blockly tooltip and toolbox shadows still encode 1–5.
    Line refs: block def now at `js/blockly_config.js:459–468`, generator
    at `:1338–1343`, shadows at `:1721–1722`. Refreshed.
  - 1.8 (`button.pressed` ms semantics): doc reconfirmed; example loop
    quoted explicitly. Impl line still `py/spike_bridge.py:448`. Refreshed.
  - 1.9 (`light_matrix.show(pixels)` ignores arg): doc reconfirmed; impl
    line still `py/spike_bridge.py:373–374`. Refreshed.
  - Bucket 2 line refs refreshed where they drifted (`force_sensor` class
    moved to `:328`, `_LightMatrix` to `:348`, `_Speaker` to `:398`,
    `_MotionSensor` to `:421`, `_Button.pressed` to `:448`, `_Light` to
    `:452`, `runloop.until` to `:506`, `device` to `:536`, `color_matrix`
    to `:549`, `app.*` to `:561–633`).
  - Bucket 4 line refs refreshed: `flipperevents_when*` empty-string
    registration is now `:1392–1399`; the for-loop iteration moved by 5
    lines. `flippermoremotor_motorSetStopMethod` def `:1085`,
    `flippermoremotor_motorSetDegreeCounted` def `:1105`. Sound effect
    no-op generators `:1373–1376`. Sensor `false`-returning generators
    `:1520–1532`. More-sensor `0`-returning generators `:1644–1647`.

---

## Bucket 1 — Implementation contradicts the docs (real bugs)

### 1.1 Blockly color enum is wrong from value 3 onward

Docs ("When Color Is" / "Is color?", verbatim from fresh word-blocks scrape):
`(0) Black (1) Violet (3) Blue (4) Light Blue (6) Green (7) Yellow (9) Red
(10) White (-1) no color`. Note that the LEGO docs use the names "Violet"
and "Light Blue" while the Python `color` module spells the same constants
`MAGENTA` (=1) and `AZURE` (=4) — those are aliases, the integer values
agree.

`js/blockly_config.js:89` `_COLORS` instead has:

| value | docs label    | impl label              |
| ----: | ------------- | ----------------------- |
|     1 | Violet        | magenta (alias OK)      |
|     3 | Blue          | **violet** ❌            |
|     4 | Light Blue    | **blue**   ❌            |
|     5 | (not exposed) | **cyan** (extra)        ❌ |
|     6 | Green         | (missing)               ❌ |
|     7 | Yellow        | **green**  ❌            |
|     9 | Red           | **yellow** ❌            |

The companion `_COLOR_INDEX_TO_NAME` (`js/blockly_config.js:1177`) and the
`flippersensors_color` reporter (`js/blockly_config.js:1466`) use the same
wrong table, so a Blockly program comparing `Color == 7` thinks 7 is green
when the rest of the system says 7 is yellow. It is internally consistent
with itself but inconsistent with `js/simulator.js:69` (`COLOR_INT_MAP`,
which is correct) and with `py/spike_bridge.py:63` (`_COLOR_INT_MAP`, also
correct).

**Concrete failure mode:** picking "magenta" in a `flippersensors_isColor`
block emits `getColorSensorColor() === 'violet'` (`js/blockly_config.js:1462`);
the simulator only ever returns `'magenta'`, so the predicate never triggers.

**Test status:** `tests/js/blockly/generators-smoke.test.js` pins generators
emit non-empty code but does **not** validate the color-index → color-name
mapping, so the bug ships green.

**[FIXED 2026-05-06]** `_COLORS` rewritten to the eight documented values
(`js/blockly_config.js:92–102`); `_COLOR_INDEX_TO_NAME` rewritten
(`:1182–1192`) so 7→'yellow' and 9→'red'; `flippersensors_color` reporter's
inline inverse mapping rewritten (`:1471–1474`). Both `simulator.js`'s
`COLOR_INT_MAP` and `spike_bridge.py`'s `_COLOR_INT_MAP` were already
correct, so all three sides now agree on the LEGO doc enum. Asserted by
`tests/js/blockly/color-and-force-parity.test.js` (5 tests covering the
positive mapping for every documented index, the two pre-fix bug values
7 and 9, and absence of the wrong inverse pairs).

### 1.2 Motor port dropdown doesn't match docs

Docs ("Run Motor for Duration" et al.) show ports A–F as the documented
choices. `js/blockly_config.js:27` restricts the port-single dropdown to
`['A','B']`. The CLAUDE.md note explains this is intentional under the
canonical wiring, **but** the same file used `_PORTS_MULTI` (A–F) for
`flippermotor_motorTurnForDirection`, `_motorGoDirectionToPosition`,
`_motorStartDirection`, `_motorStop`, `_motorSetSpeed`, so the
constraint was applied inconsistently. Either restrict everywhere or expose
all six and rely on runtime port-kind validation.

**[FIXED 2026-05-06]** `_PORTS_MULTI` removed; `_PORTS_SINGLE` collapsed to
`[['A','A'],['B','B']]` (`js/blockly_config.js:31`). All seven motor
blocks (`flippermotor_motorTurnForDirection:291`,
`_motorGoDirectionToPosition:303`, `_motorStartDirection:314`,
`_motorStop:323`, `_motorSetSpeed:331`, `_absolutePosition:340`,
`_speed:347`) now use the same `A,B` dropdown. The "more motor" subset
(`flippermoremotor_*`) was already on `_PORTS_SINGLE`. No new test
explicitly asserts the dropdown contents but `generators-smoke` exercises
each motor generator with port `A` so a regression that breaks the
generator key would surface. Per-instance port customization remains a
follow-up.

### 1.3 `motor_pair.move` defaults documented `velocity=360`, but Blockly motors set their own implicit speed

Docs (verified verbatim from fresh scrape):
`motor_pair.move(pair, steering, *, velocity: int = 360, acceleration: int = 1000) -> None`.
Python impl matches (`py/spike_bridge.py:245`). Blockly's `flippermove_steer`
generator (`js/blockly_config.js:1277`) ignores velocity and uses the global
`_moveSpeed` (preamble default 50, `js/blockly_config.js:2151`). That's fine
for Blockly UX, but the doc-aligned default of 360 deg/sec is *only* implicit
in Python — Round 2 added `TestMotorPairMoveDefaults::test_move_continuous_default_velocity_is_360`
which pins the Python wire shape; Blockly's divergent UX path still has no test.

### 1.4 Light-matrix `pixel` parameter ranges differ from docs

Docs `set_pixel` (light_matrix): `x` and `y` range **0–4**, intensity 0–100
(verbatim "x: int The X value, range (0 - 4)"). Python impl forwards as-is
and the simulator clamps `0 ≤ x,y < 5` — correct. **Blockly disagrees**:
`flipperlight_lightDisplaySetPixel` (`js/blockly_config.js:459–468`) labels
itself "set pixel at X, Y", the tooltip says "1..5, 1..5", and the
generator subtracts 1 (`js/blockly_config.js:1338–1343`), implying a 1–5
range. Toolbox shadows default `X=1, Y=1` (`:1721–1722`). Either the block
label/range is wrong, or this is a deliberate Scratch-style 1-based
convention; it isn't documented. (Note: the docs do specify a different
4-pixel `set_pixel` on `distance_sensor` with range `(0–3, 0–3)`, but the
impl is a port-validated no-op so its range is unobservable.)

### 1.5 `motor.run_to_absolute_position` direction default is documented `SHORTEST_PATH` (=2)

Docs (verbatim): `direction: int = motor.SHORTEST_PATH`. Python impl:
`direction=2` (`py/spike_bridge.py:171`) ✓. **But** the simulator
(`js/simulator.js:539–544`, `case 'motor_degrees'`) only branches on
`degrees` and `velocity` — it ignores `direction`, so even when user code
passes `motor.CLOCKWISE` / `COUNTERCLOCKWISE` / `LONGEST_PATH`, the
simulation always animates degrees the same way.

**[FIXED 2026-05-06 (partial)]** Python now forwards `direction` on the
bridge command (`py/spike_bridge.py:171–179` — explicit comment cites the
sim-side gap). Asserted by `TestRunToAbsolutePositionDirection` (4 tests:
default 2, CLOCKWISE 0, COUNTERCLOCKWISE 1, LONGEST_PATH 3). **Still open:
the simulator's `_execCmd('motor_degrees')` doesn't branch on `direction`,
so behavior identical regardless of value.** Fix would be a `case`-level
branch in `js/simulator.js` that, for SHORTEST/LONGEST_PATH, computes the
delta from current absolute position before calling `_animateSingleMotor`.

### 1.6 Python `motor.velocity()` returns a constant 0

Docs (verbatim): `velocity(port: int) -> int — Get the velocity (deg/sec)
of a Motor`. Pre-fix impl: hard-coded `return 0`. Python users querying
motor velocity always got 0 even mid-motion.

**[FIXED 2026-05-06]** A module-level `_motor_velocities` dict keyed by
port letter tracks the last-commanded velocity (`py/spike_bridge.py:104–110`).
Every motor command updates it: `run_for_degrees:161`, `run_for_time:167`,
`run_to_absolute_position:173`, `run_to_relative_position:184`, `run:190`.
`motor.stop` resets the tracker to 0 (`:194–197`). `motor.velocity` reads
it back as `int` (`:199–202`). This is "last-commanded" semantics, not
true dynamics — adequate without a physics model. Asserted by
`TestMotorVelocityTracking` (10 tests covering pre-command zero, every
update path, per-port isolation, signed values, stop-reset, and port
validation).

### 1.7 `force_sensor.*` docs imply working sensor; Python impl raises but Blockly silently returns 0

Docs document `force(port: int) -> int` (decinewtons 0–100),
`pressed(port: int) -> bool`, `raw(port: int) -> int` returning real values.
The Python impl signatures themselves return `0`/`False`/`0`, **but** every
method calls `_require(port, 'force_sensor', ...)` which raises
`RuntimeError("port X has no force sensor (configured: ...)")` because
`_PORT_CONFIG` (`py/spike_bridge.py:73`) doesn't assign any port to
`'force_sensor'` in the canonical config. Tests
`test_force_raises_on_motor_port` / `_on_empty_port` /
`test_pressed_raises` / `test_raw_raises` (`tests/py/test_gaps.py:134–149`)
pin the raise behavior. So Python is fail-loud, which matches the
"deliberate design decision" comment in the docstring (`:312`).

**Gap (pre-fix):** there was no Blockly side mirror — `flippersensors_isPressed`
/ `flippersensors_force` silently called `getForceSensorValue()` /
`getForceSensorPressed()` which return `0` / `false` (`js/simulator.js:816–817`),
so Blockly programs read "False / 0 N" forever instead of raising.

**[FIXED 2026-05-06]** Simulator gained `_assertSensorAvailable(kind)`
(`js/simulator.js:486–492`) that walks `_portConfig` and throws
`Error('no <kind> configured on any port')` if no port is wired for the
kind. Both `flippersensors_isPressed` (`js/blockly_config.js:1485–1493`)
and `flippersensors_force` (`:1495–1499`) now emit
`window.sim._assertSensorAvailable('force_sensor')` as a comma-operator
guard so the boolean/numeric value is preserved on the truthy path.
Asserted by `tests/js/state/sensor-availability.test.js` (6 tests: positive
for color/distance/motor under default wiring; throws for force_sensor;
passes once a port is reconfigured to force_sensor; human-readable error
message) and the two parity tests in `color-and-force-parity.test.js`
that verify the guard appears across all `OPTION` and `UNIT` enum values.

### 1.8 `hub.button.pressed` semantics

Docs (verbatim from fresh scrape): the example loop
`while button.pressed(button.LEFT): left_button_press_duration =
button.pressed(button.LEFT)` — i.e. `pressed()` returns the **press
duration in milliseconds**, with `0` when not pressed. Impl: returns `0`
always (`py/spike_bridge.py:448`). `tests/py/test_gaps.py::
test_pressed_left_returns_zero` (line 156) now pins the wrong behavior as
the contract.

### 1.9 `hub.light_matrix.show(pixels)` ignores its argument

Docs (verbatim from fresh scrape): `show(pixels: list[int]) -> None — Change
all the lights at the same time. … pixels: Iterable A list containing light
intensity values for all 25 pixels.` Impl emits
`{'type': 'hub_image', 'image': 'CUSTOM'}` no matter what list you pass
(`py/spike_bridge.py:373–374`). The test `tests/py/test_gaps.py::
test_show_emits_hub_image` (line 262) acknowledges this with a code comment
("Note: BACKLOG flags this as wrong") but pins the buggy `'CUSTOM'` string
as the contract. Real fix: forward `pixels` to a new bridge command and
have `js/simulator.js` paint them into `robot.display`.

---

## Bucket 2 — Documented APIs implemented as silent no-ops

These all import and parse, but accept any input and update no state. A
student program will appear to run yet the simulator does nothing. The docs
do not say "no-op", so this is a UX trap. Test status now matters: when
`test_gaps.py` pins the no-op as the contract, future "real" implementations
will trip the test.

| Documented API                                                  | File:line                | Behavior in impl                                                                | Test status                                                                       |
| --------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `motor.set_duty_cycle`, `get_duty_cycle`                        | `py/spike_bridge.py:219–227` | returns 0 / no-op                                                           | **pinned no-op** (`test_gaps.py::test_get_duty_cycle_returns_int`, `test_set_duty_cycle_no_command`) |
| `motor.reset_relative_position`                                 | `py/spike_bridge.py:214–217` | no-op                                                                       | **pinned no-op** (`test_reset_relative_position_default`)                         |
| `motor.relative_position`                                       | `py/spike_bridge.py:209–212` | returns abs position; doesn't track resets                                  | uncovered — no test asserts that calling `reset_relative_position` actually changes the value |
| `motor_pair.unpair`                                             | `py/spike_bridge.py:240–242` | no-op (pair entry never removed)                                            | **pinned no-op** (`test_unpair_no_command`, `test_unpair_after_pair_does_not_clear_bridge_history`) |
| `motor_pair.stop` (`stop=` kwarg)                               | `py/spike_bridge.py:280–282` | ignores `stop` mode                                                         | **pinned wire-shape** (`test_motor_sensor_gaps.py::TestMotorPairStopKwarg::test_stop_default_keyword_accepted`) |
| `color_sensor.rgbi`                                             | `py/spike_bridge.py:296–300` | reads `_state['rgb']`; intensity hard-coded to 0                            | **pinned default** (`test_rgbi_default`); also covered by `test_motor_sensor_gaps.py::TestColorSensorContracts` |
| `distance_sensor.clear / get_pixel / set_pixel / show`          | `py/spike_bridge.py:310–325` | all no-op                                                                   | **pinned no-op** (`test_motor_sensor_gaps.py::TestDistanceSensorContracts` — clear/get_pixel/set_pixel/show all assert empty bridge command list) |
| `hub.light_matrix.get_pixel / get_orientation / set_orientation` | `py/spike_bridge.py:382–395` | return 0 / no-op                                                            | **pinned defaults** (`test_get_pixel_returns_zero`, `test_get_orientation_returns_zero`, `test_set_orientation_returns_zero`) |
| `hub.sound.beep` waveform/channel/ADSR                          | `py/spike_bridge.py:407–412` | only frequency+duration honored                                             | uncovered                                                                         |
| `hub.sound.stop / volume`                                       | `py/spike_bridge.py:414–418` | no-op                                                                       | **pinned no-op** (`test_stop_no_command`, `test_volume_no_command`)               |
| `hub.motion_sensor.*` (every method)                            | `py/spike_bridge.py:421–441` | constant returns: `(0,0,0)`, `(1,0,0,0)`, etc.                              | **pinned defaults** across `TestMotionSensorExpansion`                            |
| `hub.light.color`                                               | `py/spike_bridge.py:452–456` | no-op                                                                       | uncovered                                                                         |
| `runloop.until`                                                 | `py/spike_bridge.py:506+`   | returns immediately, ignores predicate + timeout (the docs guarantee it pauses until the predicate is true) | **pinned no-op** (`test_until_no_command`) — comment explicitly calls this a known gap |
| Whole `device` module                                           | `py/spike_bridge.py:536+`   | every member returns 0/False/no-op                                          | uncovered                                                                         |
| Whole `color_matrix` module                                     | `py/spike_bridge.py:549+`   | every member no-op                                                          | uncovered                                                                         |
| Whole `app.*` module tree                                       | `py/spike_bridge.py:561–633` | every member no-op                                                          | uncovered                                                                         |

(Removed from this bucket: `force_sensor.*` belongs in Bucket 1.7 — it raises
loudly, and the raise behavior is now pinned by tests. `hub.button.was_pressed`
moved to Bucket 5 — it isn't in the LEGO docs.)

For each row above the question is: *should the simulator implement it*,
*should it raise NotImplementedError*, or *should it be documented as an
intentional no-op*? Every "pinned no-op" row also requires a test rewrite
when the call is made real.

---

## Bucket 3 — Documented APIs the test suite still doesn't exercise

After the rebase + Round 2 fixes pass, this list is much shorter. Items
removed in earlier rounds: motor duty cycle, reset_relative_position
(return shape), color_sensor.{reflection, rgbi} defaults, all motion_sensor
methods (defaults), hub.button defaults, hub.sound stop/volume, runloop.until
(no-op pinned), all generators-smoke and monaco-API consistency tests, every
`_execCmd` branch (start, start_tank, motor_time, hub_display, beep), and
the `_animateSingleMotor` paired/non-paired/non-motor-port branches.

**Promoted to COVERED-DEEP in Round 2** (now exercised by
`tests/py/test_motor_sensor_gaps.py` and the two new JS test files):

- `motor.run_to_absolute_position`, `motor.run_to_relative_position`,
  `motor.run` (continuous) — bridge wire shape, default `velocity=360`,
  per-port velocity tracking, `direction` forwarding (4 enum values).
  Covered by `TestRunToAbsolutePositionDirection`, `TestMotorVelocityTracking`,
  `TestMotorRunDefaults`.
- `motor.velocity` — see Bucket 1.6 fix. `TestMotorVelocityTracking`
  covers the full update / reset / per-port / signed / port-validation
  matrix.
- `motor_pair.stop` (`stop=` kwarg) — `TestMotorPairStopKwarg` pins the
  current wire shape (kwarg accepted, all four `stop` modes produce
  identical `{type:'stop', pair_id:0}`).
- `motor_pair.move` default `velocity=360` —
  `TestMotorPairMoveDefaults::test_move_continuous_default_velocity_is_360`.
- `color_sensor` return-value contracts — every doc enum value
  (BLACK..WHITE plus PURPLE/TURQUOISE/ORANGE) round-trips via
  `_state['color']`; `reflection` bounds (0/50/100); `rgbi` returns four
  ints.
- `distance_sensor.distance` `-1` no-reading branch (`9999`/`12345` →
  `-1`); int return type; `clear/get_pixel/set_pixel/show` no-op
  acceptance under documented signature.
- Blockly color-index → color-name mapping (Bucket 1.1) —
  `tests/js/blockly/color-and-force-parity.test.js` (5 tests).
- `_assertSensorAvailable` / Blockly force-sensor parity (Bucket 1.7) —
  `tests/js/state/sensor-availability.test.js` (6 tests).

Genuinely **still untested**:

- **`motor.run` continuous payload contract** — `TestMotorRunDefaults`
  covers the velocity default; the underlying `motor_run` `_execCmd`
  branch (`js/simulator.js:554–558`) uses a hard-coded 180-degree distance
  approximation that no test asserts.
- **`motor_pair.move_tank` (continuous, no amount)** — entirely untested.
- **`hub.light_matrix.show` true-pixel forwarding** — see bug 1.9; the test
  pins the buggy `'CUSTOM'` constant. A real test would assert the
  25-element array reaches the simulator.
- **`hub.light_matrix.set_pixel` / `clear` / `off`** — no behavior test for
  default brightness, off-by-one (Bucket 1.4), or clear-after-set.
- **`hub.light.color`** — no test.
- **`runloop.run(*funcs)` multi-coroutine variant** — only single-coroutine
  tested.
- **`motor.relative_position` post-`reset_relative_position`** — no test
  asserts that calling reset actually changes what relative_position
  returns. Currently it doesn't (Bucket 2 row).
- **Whole `device` module, `color_matrix` module, all four `app.*`
  sub-modules** — completely untested.
- **Hat-block events firing semantics** — `generators-smoke` correctly
  *pins* `flipperevents_when{Tilted,Orientation,Gesture,Button}` to
  empty-string output, but there's no test that asserts the simulator ever
  *triggers* those events at runtime (because nothing currently does — see
  Bucket 4).

---

## Bucket 4 — Documented Blockly categories absent from the toolbox

The current toolbox (`js/blockly_config.js:1661`) ships **13 categories**
(10 base + 3 extension): MOTORS, MOVEMENT, LIGHT, SOUND, EVENTS, CONTROL,
SENSORS, OPERATORS, VARIABLES, MY BLOCKS, plus extensions MORE-MOVEMENT,
MORE-MOTORS, MORE-SENSORS. The fresh word-blocks scrape (in `_scrape/`) only
covers 7 of the documented categories; the categories listed below as
"missing entirely" were verified by direct grep against `js/blockly_config.js`
finding no matching block definitions.

| Doc category                                                                                                                                                                                  | Blocks documented | Status in impl                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Music** (`Play Drum`, `Rest`, `Play Note`, `Set Instrument`, `Set Tempo`, `Change Tempo`, `Tempo`)                                                                                          |                 7 | **missing entirely** — no blocks, no toolbox category. (`app.music.play_*` Python no-ops exist.)                                                     |
| **Bar Graph** (`Change Bar Value by`, `Set Bar Value to`, `Bar Value`, `Clear Bar Graph`, `Show … Fullscreen`, `Hide …`)                                                                      |                 6 | **missing entirely**. (`app.bargraph` Python no-ops exist.)                                                                                          |
| **Log and Visualize Data Over Time** / line graph (`Plot Value on Line`, `Line Value`, `Clear Line`, `Clear Line Graph`, `Line Graph Timer`, `Reset Line Graph Timer`, `Show … Fullscreen`, `Hide …`) |                 8 | **missing entirely**. (`app.linegraph` Python no-ops exist.)                                                                                         |
| **Display** (`Write on Display for Seconds`, `Write on Display`, `Set Image on Display for Seconds`, `Set Image on Display`, `Next Image`, `Show Display Fullscreen/Window`, `Hide Display`) |                 7 | **missing entirely**. (`app.display` Python no-ops exist.)                                                                                           |
| **Weather** (12 forecast blocks)                                                                                                                                                              |                12 | **missing entirely**. No backing API exists, but docs document them.                                                                                 |
| **Light → 3×3 Color Matrix** (Turn-on, Turn-on-for-seconds, Turn-off, Set-brightness, Set-pixel, Rotate, Set-orientation — verified against fresh `word-blocks-prose.json`)                   |                 7 | **missing**. Only the 5×5 light-matrix half of the Light category is implemented. (`color_matrix` Python no-ops exist.)                              |
| **Variables → Lists & My Block** (`List`, `Add Item`, `Delete Item`, `Delete All`, `Insert Item at Index`, `Replace Item at Index`, `Value of Item at Index`, `Index Value of Item`, `Length of List`, `List contains?`, `Define Block`, `My Block`) |                12 | **missing**. The toolbox uses Blockly's built-in `VARIABLE` / `PROCEDURE` categories (`js/blockly_config.js:1889`) which give variables and custom blocks but **no list operations and no Scratch-style "Define Block" hat**. |
| **Sound → Set Pitch Effect** (`Set Pitch Effect By` and `Change Pitch Effect By` are documented as separate blocks; verified in fresh `word-blocks-prose.json`)                               |                 2 | the impl has only the generic `sound_changeeffectby` / `sound_seteffectto` Scratch blocks (no pitch-specific block); both impl generators are no-op comments (`js/blockly_config.js:1374–1375`). |
| **Events → When Hub Tilted / When Hub Orientation Up / When Hub Shaken / When Hub Button Pressed**                                                                                            |                 4 | blocks **defined** (`flipperevents_when{Tilted,Orientation,Gesture,Button}`) but **generators emit `''`** via the for-loop at `js/blockly_config.js:1392–1399`. Hat blocks are valid empty bodies in Scratch, but here it means the runtime never actually fires when the event happens — the simulator has no event loop wiring. |
| **More Motor → Set Relative Motor Position to 0** (separate block per docs)                                                                                                                   |                 1 | impl combines this into `flippermoremotor_motorSetDegreeCounted` with a numeric input (`js/blockly_config.js:1105`). The "set to 0" zero-input variant doesn't exist as its own block. |
| **More Motor → Stop and Coast Motors** (a stop-method picker that applies on next stop)                                                                                                       |                 1 | impl has `flippermoremotor_motorSetStopMethod` (`js/blockly_config.js:1085`); blocking question is just whether semantics match doc text.            |

Within the categories that *are* implemented, several blocks compile to comments only (this is now confirmed by `tests/js/blockly/generators-smoke.test.js`, which lists each one in its "intentionally empty" set):

- `flipperlight_lightDisplayRotate` → `// rotate light display\n` (`js/blockly_config.js:1345`)
- `flipperlight_lightDisplaySetOrientation` → `// set light orientation\n` (`:1346`)
- `flipperlight_centerButtonLight` → `// centre button → ${COLOR}\n` (`:1347`)
- `flipperlight_ultrasonicLightUp` → `// distance sensor LEDs\n` (`:1348`) (the "Light up Distance Sensor" doc block)
- `flippersound_stopSound`, `sound_changeeffectby`, `sound_seteffectto`, `sound_cleareffects` → comments (`:1373–1376`)
- `flippermoresensors_setOrientation` → comment (`:1637`)
- `flippercontrol_stopOtherStacks` → comment (`:1453`)
- All `flipperevents_when*` hat blocks → empty string (no runtime registration) (`:1392–1399`)
- `flippersensors_isTilted`, `_isorientation`, `_ismotion`, `_buttonIsPressed` → return `false` (`js/blockly_config.js:1520–1532`)
- `flippermoresensors_acceleration`, `_angularVelocity`, `_orientation`, `_motion` → return `0` (`js/blockly_config.js:1644–1647`)

---

## Bucket 5 — Implementation surface with no doc anchor

Found while cross-checking; flagged so we don't add tests for non-public behavior.

- **`hub.speaker` alias** — `py/spike_bridge.py:465` keeps `hub.speaker` as a sim-only alias for `hub.sound`. Comment says it's for older student code; no doc anchor. Decide: keep, deprecate, or remove.
- **`hub.button.was_pressed`** — `py/spike_bridge.py:449` exposes a `was_pressed(button)` method that always returns `False`, pinned by `tests/py/test_gaps.py::test_was_pressed_returns_false` (line 165). The fresh Python doc scrape (`H4:Button` / `H4:Button Constants`) lists only `pressed` as a function — `was_pressed` is **not in the LEGO docs**. Decide: drop, document as sim-only, or remove the test.
- **`port.A..F = 0..5` integer convention** — documented in the LEGO docs and CLAUDE.md, **but** the docs don't document accepting `'A'..'F'` strings, and `_port_id()` (`py/spike_bridge.py:112`) accepts both. Tests rely on this (`tests/py/test_motor.py:78,82`). Decision: this is a deliberate ergonomic extension; document it in the audit spec rather than treat as a gap.
- **Sim color tokens** — the simulator emits color names like `'cyan'`, `'orange'`, `'magenta'` from `_colorAtPosition` (`js/simulator.js:741`) and `COLOR_MAP` (`:56`), but docs only enumerate the eight (Black/Violet/Blue/Light Blue/Green/Yellow/Red/White). The mapping back to int is correct in `simulator.js` and now in `blockly_config.js` after the Round 2 fix (Bucket 1.1). The remaining sim-only tokens (`purple`, `turquoise`, `orange`) emitted by `_colorAtPosition` map to integer values (2, 5, 8) that are **not documented** in word-blocks but **are** in the Python `color` enum.
- **`steering > 0 = right turn` convention** — documented in CLAUDE.md and matches the LEGO docs description ("Higher steering values… sharper. 100 = pivot"); no gap.
- **Field / spawn / robot dimensions** — FLL-mat-specific; no LEGO docs cover this.

---

## Where to take this next

To turn this into a "full suite that covers the expectation as stated in the api docs" we need to decide, **per Bucket 2 row** and **per Bucket 4 row**, whether we want:

- **Implement** — write a real simulation (e.g. `motor.relative_position` honoring `reset_relative_position`, `runloop.until` actually polling the predicate, the four hub-event hat blocks actually firing). Some of these are small; others are big.
- **NotImplementedError / RuntimeError** — fail loud. Honest, but breaks any student program that imports the module.
- **Documented stub** — keep no-op but add a project-level "supported subset" doc and surface a one-time console warning per family. **In this case, the existing pinned-no-op tests need a comment that explicitly cites the supported-subset decision** so a future contributor doesn't read them as the LEGO contract.

For Bucket 1 every entry should be fixed (or, if intentionally diverging, captured in CLAUDE.md the way the port-config rationale already is). After Round 2, 1.1, 1.2, 1.6, 1.7 are done; 1.5 is partial (sim-side branching still needed). The remaining live bugs are 1.3 (Blockly velocity UX), 1.4 (set_pixel 1-vs-0 indexing), 1.5-sim, 1.8 (button.pressed ms semantics), and 1.9 (light_matrix.show pixel forwarding) — 1.4 and 1.9 remain good small-blast-radius targets.
