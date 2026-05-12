# SPIKE Prime API fidelity audit — 2026-05-10

Compares the **behavior** of the simulator against LEGO Education SPIKE Prime documentation:

- Python API — <https://spike.legoeducation.com/prime/modal/help/lls-help-python>
- Word Blocks — <https://spike.legoeducation.com/prime/help/lls-help-word-blocks>

This is not a signature-shape audit (signatures were checked in `2026-05-04-spike-api-alignment.md` and are still tight). It judges whether each call **does what LEGO promises it does** by tracing the bridge → simulator handler → state mutation path.

Severity legend:

- **OK** — implementation faithfully matches docs (within sim scope)
- **PARTIAL** — works for the common path but ignores documented parameters/edge cases
- **STUB** — accepts the call, returns a constant; no real behavior
- **BROKEN** — produces wrong behavior relative to docs (worse than a stub because student code can't tell)
- **MISSING** — not exposed at all

Source references are `file:line` against `main` (commit `525f5b3`).

---

## Movement & motors — Python (`py/spike_bridge.py` → `js/simulator.js::_execCmd`)

| API | Severity | Behavior |
|---|---|---|
| `motor_pair.pair(pair, left, right)` | **OK** | Stores in `pairMap`; `_findPairForPort` overrides static drive roles correctly (`js/simulator.js:1041`). |
| `motor_pair.move_for_degrees(pair, degrees, steering, …)` | **OK** | Routes through `case 'move'` which applies steering via `kinematics.steeringToWheels` (`js/simulator.js:849`). |
| `motor_pair.move_for_time(pair, duration, steering, …)` | **OK** | Bridge converts to degrees by `velocity × duration/1000` (`py/spike_bridge.py:255`); same `'move'` path applies steering. |
| `motor_pair.move(pair, steering, …)` | **BROKEN** | Bridge sends `'start'` with steering, but `_execCmd 'start'` sets `leftV = rightV = cmd.speed/1000` and **ignores `cmd.steering`** (`js/simulator.js:867-875`). Also "continuous" → only 200 mm of motion. Calling `motor_pair.move(0, 50)` drives straight, not in an arc. |
| `motor_pair.move_tank_for_degrees(pair, degrees, lv, rv, …)` | **OK** | Routes through `case 'move_tank'` which applies independent wheel speeds (`js/simulator.js:859`). |
| `motor_pair.move_tank_for_time(pair, lv, rv, duration, …)` | **OK** | Bridge converts duration → degrees using `max(|lv|,|rv|)` (`py/spike_bridge.py:274`); pair-trap signature order is correct. |
| `motor_pair.move_tank(pair, lv, rv, …)` | **PARTIAL** | Applies independent wheel speeds (`_animateTank(lv/1000, rv/1000, 200)`) but only for 200 mm, not continuous. Pivot arc is visible but truncated. |
| `motor_pair.stop(pair, …)` | **BROKEN** | `_execCmd 'stop': break;` — does nothing (`js/simulator.js:877`). Since `move`/`move_tank` already self-terminate after a fixed distance, `stop()` has nothing left to interrupt either — a "wait until X then stop" pattern doesn't work. |
| `motor_pair.unpair(pair)` | **STUB** | Bridge returns `_NoopAwaitable`; `pairMap` is never cleared (`py/spike_bridge.py:241`). |
| `motor.run_for_degrees(port, degrees, velocity, …)` | **OK** | Routes through `_animateSingleMotor` which dispatches by port role (drive-left → `_animateTank(v, 0, …)`, drive-right → `_animateTank(0, v, …)`, otherwise time-only sleep). Correctly respects `pairMap` overrides. |
| `motor.run_for_time(port, duration, velocity, …)` | **OK** | Bridge sends `motor_time`; `_execCmd` converts to distance via `|v| × MM_PER_MS_100 × ms` then routes through `_animateSingleMotor`. |
| `motor.run_to_absolute_position(port, position, …)` | **BROKEN** | Treats `position` as a **delta in degrees**, not an absolute target (`js/simulator.js:880`). Since `motor.absolute_position()` also always returns 0 (see below), the absolute-position contract is entirely unfulfilled. The block also ignores the `direction` kw-arg, even though the bridge forwards it (`py/spike_bridge.py:178`). |
| `motor.run_to_relative_position(port, position, …)` | **BROKEN** | Same as `run_to_absolute_position` — rotates by `position` degrees from wherever, but the encoder is never tracked so "relative" has no anchor. |
| `motor.run(port, velocity, …)` | **PARTIAL** | LEGO docs say "Run motor continuously"; sim runs for 180 mm and returns. Useful for a quick spin, not for "drive until button pressed". |
| `motor.stop(port, …)` | **BROKEN** | `_execCmd 'motor_stop': break;` — no-op (`js/simulator.js:901`). |
| `motor.velocity(port)` | **OK (best-effort)** | Bridge returns `_motor_velocities[letter]` which is **last-commanded** velocity, not actual (`py/spike_bridge.py:200`). Documented in the bridge comment as the honest answer for a sim without dynamics. |
| `motor.absolute_position(port)` | **BROKEN** | Reads `_state['motors'][letter]`, but `js/simulator.js:123` initialises every encoder to `0` and `_animateTank` never updates `this.robot.motors`. Always returns 0. |
| `motor.relative_position(port)` | **BROKEN** | Same path as `absolute_position`; always 0. |
| `motor.reset_relative_position(port, position)` | **STUB** | `_NoopAwaitable`. Consistent with the broken encoder — nothing to reset. |
| `motor.get_duty_cycle(port)` | **STUB** | Bridge returns 0 (`py/spike_bridge.py:222`). |
| `motor.set_duty_cycle(port, pwm)` | **STUB** | `_NoopAwaitable`. |

### Same surface — Blockly

| Block | Severity | Behavior |
|---|---|---|
| `flippermotor_motorTurnForDirection` (run for ⟨unit⟩) | **OK** | `_animateSingleMotor(port, _motorSpeed/100*dir, distMM)`; unit conversion handles rotations/degrees/seconds (`js/blockly_config.js:1211`). |
| `flippermotor_motorGoDirectionToPosition` | **PARTIAL** | "shortest path" arm computes signed delta against `getMotorPosition`, but `getMotorPosition` always returns 0 so the sign is meaningless. Cw/ccw arms work. |
| `flippermotor_motorStartDirection` | **PARTIAL** | Runs for 5000 mm (`js/blockly_config.js:1237`) instead of continuously; will stop on its own well before "until stopped". |
| `flippermotor_motorStop` | **PARTIAL** | Calls `window.sim.stop()` — which sets `_stopRequested = true`, halting **the whole simulation**, not a single motor. Has the right idea but wrong granularity. |
| `flippermotor_motorSetSpeed` | **OK** | Just writes `_motorSpeed`; read by every subsequent motor block. |
| `flippermotor_absolutePosition` | **BROKEN** | Reads `getMotorPosition()` (always 0) mod 360. Always 0. |
| `flippermotor_speed` | **BROKEN** | `getMotorSpeed(port)` is hardcoded `return 0` (`js/simulator.js:1190`). Always 0. |
| `flippermove_move` (move forward/back) | **OK** | Routes through `_animateTank` with both wheels equal; unit conversion correct for cm/inches/rotations/degrees/seconds. |
| `flippermove_steer` (move with steering) | **OK** | Applies steering via `(1+s)/(1-s)` left/right ratio (`js/blockly_config.js:1285`). Matches CLAUDE.md convention. |
| `flippermove_startMove`, `flippermove_startSteer` | **PARTIAL** | 5000 mm cap; not actually continuous. |
| `flippermove_stopMove` | **PARTIAL** | Same `window.sim.stop()` blast — stops everything. |
| `flippermove_movementSpeed` | **OK** | Writes `_moveSpeed`. |
| `flippermove_setMovementPair` | **OK** | Writes `_movePairL/R` strings used by subsequent generators. |
| `flippermove_setDistance` | **OK** | Updates `_moveRotMM` for rotations/degrees → mm conversion. |
| `flippermoremove_startDualSpeed` (More Movement) | **PARTIAL** | 5000 mm cap. |
| `flippermoremove_movementSetStopMethod`, `flippermoremove_movementSetAcceleration` | **STUB** | Write to `_stopMethod` / `_moveAccel` but no generator reads them. |
| `flippermoremotor_motorGoToRelativePosition` | **PARTIAL** | Same delta-not-absolute issue as Python's relative position. |
| `flippermoremotor_motorStartPower` | **PARTIAL** | 5000 mm cap. |
| `flippermoremotor_motorSetStopMethod`, `motorSetAcceleration` | **STUB** | Write to `_motorStop/_motorAccel` dicts; no generator reads them. |
| `flippermoremotor_motorSetDegreeCounted` | **OK-ish** | Stores an offset in `_motorRelOffset`; `flippermoremotor_position` subtracts it. But since `getMotorPosition` is always 0, the result is also always `-(_motorRelOffset[port] ?? 0)` → always 0 in practice. |
| `flippermoremotor_power`, `flippermoremotor_position` | **BROKEN** | Read `getMotorSpeed` / `getMotorPosition` (both hardcoded 0). |

---

## Sensors

### Color sensor

| API | Severity | Behavior |
|---|---|---|
| Python `color_sensor.color(port)` | **OK** | Reads `_state['color']` populated by `_sensorState()` from `r.sensors.colorValue`, which `_animateTank` updates every step via `_colorAtPosition(sp.x, sp.y)` at the simulated sensor's world position. |
| Python `color_sensor.reflection(port)` | **BROKEN** | Returns `_state.get('reflection', 50)` — but `_sensorState()` (`js/simulator.js:1050`) **never sends `reflection`**. Always returns 50. |
| Python `color_sensor.rgbi(port)` | **BROKEN** | Reads `_state.get('rgb', …)` — same problem; `_sensorState()` doesn't send `rgb`. Always `(128, 128, 128, 0)`. |
| Blockly `flippersensors_color` | **PARTIAL** | Calls `getColorSensorColor()` (real) and maps token→int via a small dict. Dict is missing `purple/azure/turquoise/orange` — see Color-token gap below. |
| Blockly `flippersensors_isColor` | **PARTIAL** | Same dict gap. |
| Blockly `flippersensors_reflectivity`, `isReflectivity` | **OK** | `getColorSensorReflection()` uses a per-color `reflMap` (`js/simulator.js:1163`) — covers white/yellow/cyan/orange/green/magenta/red/blue/black/none. Returns realistic %. |
| Blockly `flippermoresensors_rawColor` | **PARTIAL** | Reads `getColorSensorRGB()` which decodes the hex of `r.sensors.colorValue`. Works, but with the same name-token gap as `isColor`. |

**Color-token gap:**

- `js/simulator.js:58` `COLOR_MAP` uses sim tokens: `black, red, green, yellow, blue, white, cyan, magenta, orange, none`.
- `py/spike_bridge.py:63` `_COLOR_INT_MAP` uses LEGO doc names: includes `azure, turquoise, purple`, but **lacks `cyan`**.
- Field zones in `FIELD_OBJECTS` currently use `yellow / green / red / black` → all four are in `_COLOR_INT_MAP` (✓).
- The moment someone authors a `sensorColor: 'cyan'` zone, `color_sensor.color()` returns `-1` (UNKNOWN), while Blockly's `flippersensors_color` returns `4` (AZURE) — Python and Blockly **disagree** on the same sensor read.

Fix: add `'cyan': 4` to `_COLOR_INT_MAP` (alias for AZURE), or rename sim's token to `'azure'`.

### Distance sensor

| API | Severity | Behavior |
|---|---|---|
| Python `distance_sensor.distance(port)` | **OK** | Bridge maps ≥9999 → -1; `_sensorState()` sends `distance_mm` from a real Box2D raycast (`js/simulator.js:1101`). |
| Python `distance_sensor.clear`, `get_pixel`, `set_pixel`, `show` (face LEDs) | **STUB** | All no-op or return 0. Sim has no face-LED rendering. |
| Blockly `flippersensors_distance` / `isDistance` | **OK** | Calls real `getDistanceSensorValue()`. Unit conversion: cm/inches accurate; `%` uses `/20` (max 100), which is rough — 100% = 2000 mm ÷ 20 = 100, fine, but not calibrated to LEGO's actual % curve. **PARTIAL** on `%` unit. |

### Force sensor

| API | Severity | Behavior |
|---|---|---|
| Python `force_sensor.force/pressed/raw(port)` | **PARTIAL** | All call `_require(port, 'force_sensor', …)` which raises `RuntimeError` because the canonical port config has no force sensor. Per-call behavior on a configured port is hardcoded 0/False/0 — `getForceSensorValue/Pressed` are stubs (`js/simulator.js:1188-1189`). Faithful to "no sensor wired" but unwired regardless of config. |
| Blockly `flippersensors_isPressed/force` | **PARTIAL** | `_assertSensorAvailable('force_sensor')` raises same as Python. Hard-pressed threshold `>70` will never trip since `getForceSensorValue` is 0. |

### Motion sensor / IMU (`hub.motion_sensor`)

| API | Severity | Behavior |
|---|---|---|
| `hub.motion_sensor.tilt_angles()` | **STUB** | Returns `(0, 0, 0)` regardless of robot heading (`py/spike_bridge.py:430`). |
| `hub.motion_sensor.angular_velocity(raw_unfiltered)` | **STUB** | Returns `(0, 0, 0)`. |
| `hub.motion_sensor.acceleration(raw_unfiltered)` | **STUB** | Returns `(0, 0, 981)` (gravity only). |
| `hub.motion_sensor.reset_yaw(angle)` | **STUB** | `_NoopAwaitable`. |
| `hub.motion_sensor.gesture()` | **STUB** | Returns `UNKNOWN`. |
| `hub.motion_sensor.stable()` | **STUB** | Returns True. |
| `hub.motion_sensor.up_face()`, `get_yaw_face()`, `set_yaw_face()` | **STUB** | Static `TOP`. |
| `hub.motion_sensor.quaternion()` | **STUB** | Identity. |
| `hub.motion_sensor.tap_count()`, `reset_tap_count()` | **STUB** | 0 / no-op. |
| Blockly `flippersensors_orientationAxis` (Hub Pitch/Roll/Yaw Angle) | **PARTIAL** | Yaw arm returns `((heading % 360) + 360) % 360` — actually reflects the real robot heading. Pitch and roll arms return 0. |
| Blockly `flippersensors_resetYaw` | **PARTIAL** | Resets `robot.heading = -90`, which conflicts with the new spawn convention (CLAUDE.md says `heading 90°` north; this generator hardcodes the pre-flip value). |
| Blockly `flippersensors_isTilted`, `isorientation`, `ismotion`, `buttonIsPressed` | **STUB** | All return `false`. |
| Blockly `flippermoresensors_acceleration`, `angularVelocity`, `orientation`, `motion`, `setOrientation` | **STUB** | All return 0 / no-op. |

**Divergence:** Python `hub.motion_sensor.tilt_angles()[0]` always returns 0, but Blockly's "Hub yaw angle" block returns actual heading. Same conceptual reading, two different answers.

### Hub buttons

| API | Severity | Behavior |
|---|---|---|
| `hub.button.pressed(button)` | **STUB** | Returns 0 (`py/spike_bridge.py:448`). Sim has no virtual hub UI to press. |
| `hub.button.was_pressed(button)` | **STUB** + **non-canonical** | Sim-only invention; not in LEGO docs at all. |
| Blockly `flipperevents_whenButton` | **STUB** | Hat block fires only at program start (generator returns empty string `js/blockly_config.js:1392-1397`); button events never fire. |

---

## Runloop & control flow

| API | Severity | Behavior |
|---|---|---|
| `runloop.run(*functions)` | **PARTIAL** | Single-function case is correct. Multi-function case **runs sequentially, not in parallel** — the wrapper coroutine is `async def _all(): for c in funcs: await c` (`py/spike_bridge.py:509-512`), so each coroutine runs to completion before the next starts. Real Spike scheduler runs them as concurrent tasks; patterns like `runloop.run(drive(), watch_sensor())` will not interleave here. Test-mode path (`_test_intercept`) is also sequential by `coro.send(None)`. |
| `runloop.sleep_ms(duration)` | **OK** | Bridge sends `'wait'`; `_execCmd 'wait'` does `await this._sleep(cmd.ms / speedMult)`. |
| `runloop.until(function, timeout=0)` | **BROKEN** | Returns `_NoopAwaitable` — the predicate is never polled (`py/spike_bridge.py:512`). `await runloop.until(lambda: distance_sensor.distance(port.F) < 200)` returns immediately. |
| top-level `wait(ms)` | **OK** (sim-only convenience) | Same `'wait'` path. Not in LEGO docs. |
| Blockly `control_wait` | **OK** | `await window.sim._sleep((sec) * 1000 / speedMult)`. |
| Blockly `control_wait_until` | **OK** | Polls the boolean condition every 50 ms (`js/blockly_config.js:1442`). |
| Blockly `control_repeat`, `control_forever`, `control_if`, `control_if_else`, `control_repeat_until` | **OK** | Direct translation to JS. |
| Blockly `flippercontrol_stop` (`all`/`program`/`this`) | **PARTIAL** | All three options call `window.sim.stop(); return;` — `this stack` should kill the current generator only, not the whole sim. |
| Blockly `flippercontrol_stopOtherStacks` | **STUB** | Comment-only generator. There's only one stack in our flat compile anyway. |
| Blockly Events (`flipperevents_*` except `whenProgramStarts`) | **STUB** | All hat-block generators return `''`. Only programs starting with "when program starts" actually run; conditional hats are decoration. |
| Blockly `event_whenbroadcastreceived` / `event_broadcast` / `…andwait` | **STUB** | Broadcast emits a log line; receive hats never fire. |

---

## Light & sound

### Light matrix (5×5)

| API | Severity | Behavior |
|---|---|---|
| Python `hub.light_matrix.write(text, intensity, time_per_character)` | **BROKEN** | Bridge sends `'hub_display'` with `text`; `_execCmd` calls `_showText` which **does not render characters** — it lights every other dot proportional to text length (`js/simulator.js:1140`). Calling `write("Hello")` and `write("Hi")` show different patterns but neither resembles glyphs. Also ignores `intensity` and `time_per_character`. |
| Python `hub.light_matrix.show(pixels)` | **BROKEN** | Bridge sends `'hub_image'` with `image: 'CUSTOM'`; **`_execCmd` has no `hub_image` case** — silently no-op. The actual 25-pixel array is discarded by the bridge before even sending. |
| Python `hub.light_matrix.show_image(image)` | **BROKEN** | Same as `show` — no `hub_image` case. |
| Python `hub.light_matrix.set_pixel(x, y, intensity)` | **OK** | `'hub_pixel'` case validates 0 ≤ x,y < 5 and writes `robot.display[y*5+x] = brightness`. 0-indexed, matches LEGO docs. |
| Python `hub.light_matrix.get_pixel(x, y)` | **STUB** | Bridge returns 0 (`py/spike_bridge.py:382`). |
| Python `hub.light_matrix.clear()` / `off()` | **OK** | `'hub_display_off'` → `display = Array(25).fill(0)`. |
| Python `hub.light_matrix.get_orientation()`, `set_orientation()` | **STUB** | Static 0 / 0 (`py/spike_bridge.py:391-395`). |
| Blockly `flipperlight_lightDisplayImageOnForTime` / `…ImageOn` | **OK-ish** | Parses a 25-char "9909999099000009000909990"-style pattern (Spike-Word-Blocks format) into `robot.display[]` with each digit × 11. Doesn't go through the `hub_image` case — bypasses the broken path. |
| Blockly `flipperlight_lightDisplayText` | **BROKEN** | Calls `_showText(text)` which has the same fake renderer. |
| Blockly `flipperlight_lightDisplayOff` | **OK** | Clears display directly. |
| Blockly `flipperlight_lightDisplaySetBrightness` | **OK** | Re-scales currently lit pixels. |
| Blockly `flipperlight_lightDisplaySetPixel` | **OK** | 1-indexed coords (matches LEGO Blockly UX); writes into the right slot. |
| Blockly `flipperlight_lightDisplayRotate`, `lightDisplaySetOrientation`, `centerButtonLight`, `ultrasonicLightUp` | **STUB** | Comment-only generators (`js/blockly_config.js:1345-1348`). |

### Sound

| API | Severity | Behavior |
|---|---|---|
| Python `hub.sound.beep(freq, duration, volume, *, waveform, channel, …)` | **PARTIAL** | Bridge converts Hz → MIDI; `_playBeep` plays an exponentially-decaying sine via WebAudio. **Ignores `volume`, `waveform`, `attack/decay/sustain/release/transition`, `channel`** (`py/spike_bridge.py:407` + `js/simulator.js:1195`). |
| Python `hub.sound.stop()`, `volume(v)` | **STUB** | `_NoopAwaitable`. No running tones to stop. |
| Blockly `flippersound_beepForTime`, `flippersound_beep`, `flippersound_playSound*` | **PARTIAL** | Same sine-only oscillator path. |
| Blockly `flippersound_stopSound`, `sound_changeeffectby`, `sound_seteffectto`, `sound_cleareffects` | **STUB** | Comment-only generators (`js/blockly_config.js:1373-1376`). |
| Blockly `sound_changevolumeby`, `sound_setvolumeto`, `sound_volume` | **BROKEN** | Read/write `window._blkVolume`, but `_playBeep` never reads it. Gauge tracks; output doesn't. |

### Hub light (power LED) — Python `hub.light.color(light, color)`

**STUB** — bridge `pass`, no command emitted. No sim UI for the hub's status LED.

---

## App panel & accessories — Python no-ops, Blockly missing

These are all faithfully stubbed in the bridge (they exist with the right signatures so import-from-LEGO-tutorial doesn't crash) and absent from the Blockly toolbox. Severity is **STUB** across the board; flagging as a category-level coverage gap rather than per-symbol bugs.

| Namespace | Functions | Status |
|---|---|---|
| `app.sound` | `play`, `stop`, `set_attributes` | Python stub, no Blockly blocks |
| `app.music` | `play_drum`, `play_instrument` + constants | Python stub, no Blockly blocks (Music word-block category missing entirely) |
| `app.display` | `show`, `hide`, `image`, `text` + IMAGE_* | Python stub, no Blockly blocks |
| `app.bargraph` | `show`, `hide`, `set_value`, `change`, `get_value`, `clear_all` | Python stub, no Blockly blocks |
| `app.linegraph` | `show`, `hide`, `plot`, `clear`, `clear_all`, `get_last`, `get_average`, `get_min`, `get_max` | Python stub, no Blockly blocks |
| `color_matrix` | `clear`, `get_pixel`, `set_pixel`, `show` | Python stub, no Blockly blocks (3×3 Color Matrix word-block category missing) |
| `device` | `data`, `id`, `ready`, `get_duty_cycle`, `set_duty_cycle` | Python stub, no Blockly equivalent in LEGO docs either |
| Weather blocks (word-blocks only) | 12 blocks | Missing entirely |
| Variable **List** blocks | 9 blocks (Add Item / Delete / Insert / etc.) | Missing — toolbox uses `custom="VARIABLE"` which omits lists |

---

## Sim-only inventions (not in LEGO docs)

| Symbol | Source | Note |
|---|---|---|
| `hub.button.was_pressed(button)` | `py/spike_bridge.py:449`, `js/monaco_config.js:404` | LEGO has only `pressed`. |
| `hub.light_matrix.off()` | `py/spike_bridge.py:388`, `js/monaco_config.js:282` | Sim-only alias for `clear()`. |
| top-level `wait(ms)` | `py/spike_bridge.py:516`, `js/monaco_config.js` `SPIKE_GLOBALS` | LEGO has only `runloop.sleep_ms`. |
| top-level `port` global | `py/spike_bridge.py:97`, monaco completions | Not registered in `sys.modules`; canonical is `from hub import port`. Monaco over-promises by listing it as a top-level identifier. |
| `hub.speaker` alias | `py/spike_bridge.py:466` | Aliases `hub.sound`. Commented as legacy support. |

Recommend marking these "(sim-only)" in monaco hover text, or dropping them.

---

## Word-block UX divergences (cosmetic but visible to students)

- **"set centre button light to …"** vs official **"set Power Button light to …"** — `js/blockly_config.js:485`. Wording.
- **"colour"** everywhere in our labels & tooltips vs **"color"** in LEGO IDE. Educational parity issue.
- **Distance unit `%`** scales as `value/20` (`js/blockly_config.js:1514, 1522`). LEGO's `%` curve isn't linear over 2000 mm; this is rough. **PARTIAL**.
- **Sound names** — sim has 5 collapsed entries (Cat Meow, Dog Bark, Tada, Motor Start, Beep); LEGO catalog uses numbered variants (Cat Meow 1, etc.). Cosmetic.
- **Port dropdown now A–F** (commit `7a9e79c`) — matches LEGO. Drive ports still hardcoded to A/B at simulator level (`PORT_CONFIG`); a student picking C–F for a drive command currently goes through `_animateSingleMotor`'s "auxiliary motor" branch, which only sleeps for the elapsed time and doesn't move the robot. Worth surfacing as a config UI when port customization lands.

---

## Severity tally

| Severity | Python | Blockly | Notes |
|---|---|---|---|
| BROKEN | 12 | 4 | Position getters, run_to_*, motor.stop, motor_pair.move (steering ignored), runloop.until, light_matrix.write/show/show_image, color_sensor.reflection/rgbi, volume blocks |
| PARTIAL | 5 | 11 | continuous motions truncated to 200/5000 mm, sound effects ignored, hub yaw vs motion_sensor split, color-token gap, % distance unit, `runloop.run` multi-fn sequential |
| STUB | ~20 | ~15 | hub IMU, hub buttons, app.*, color_matrix, face LEDs, hat blocks other than whenProgramStarts |
| OK | ~25 | ~30 | All core movement-with-steering, sleep, sensor color/distance, branch/loop, set_pixel, clear, basic beep |

---

## Highest-leverage fixes (if we want behavior parity, not just signatures)

1. **Track motor encoders.** In `_animateTank`, accumulate degrees travelled on each wheel into `this.robot.motors[A/B]` (and the auxiliary motor's port for `_animateSingleMotor`). That single fix unlocks: `motor.absolute_position`, `motor.relative_position`, `getMotorPosition`, `flippermotor_absolutePosition`, `flippermoremotor_position`, "shortest path" arc routing, and true `run_to_absolute_position`/`run_to_relative_position`.
2. **Send richer sensor state.** Add `reflection`, `rgb`, and per-motor `velocity` to `_sensorState()` (`js/simulator.js:1050`). Fixes Python `color_sensor.reflection/rgbi` and aligns Python `motor.velocity` with the real wheel speed.
3. **Stop = stop.** Make `_execCmd 'stop' / 'motor_stop'` actually halt the in-flight `_animateTank` loop (an `AbortController` or a per-command flag). This makes `motor.stop()`, `motor_pair.stop()`, and the corresponding Blockly blocks meaningful, and unlocks "wait until X then stop" patterns.
4. **Implement `runloop.until`.** Bridge-side poll loop that calls the predicate and awaits a short `'wait'` between checks. This is the canonical FLL pattern.
5. **Wire steering on `motor_pair.move`.** Either send `'move'` instead of `'start'` for continuous motion, or fix `case 'start'` to apply steering before dispatching to `_animateTank`. Either way, also length the run (or replace 200 mm with a true continuous loop tied to a stop flag).
6. **Fix `_showText`.** A minimal 5×5 font for `hub.light_matrix.write` + the missing `'hub_image'` case for `show` / `show_image` would make text-and-image output actually work in tutorials.
7. **Align color tokens.** Add `'cyan': 4` to `_COLOR_INT_MAP` (or rename the sim token to `'azure'`) so Python and Blockly agree on every sensor read.
8. **Honor `_motorStop` / `_motorAccel` / `_moveAccel` / `_stopMethod`.** Today Blockly writes them; no generator reads them. Either delete the blocks or have `_animateTank` apply a ramp at start/end based on `_moveAccel`.
9. **Parallelize `runloop.run(*funcs)`.** Replace the sequential `for c in funcs: await c` wrapper with `await asyncio.gather(*funcs)` (asyncio is already imported at `py/spike_bridge.py:705-708`; `asyncio.gather` is available in MicroPython's asyncio). Two caveats to design through before flipping it: (a) `_test_intercept` drives coroutines synchronously via `.send(None)` with no event loop, so tests would need a small round-robin stepper to preserve parallel semantics there; (b) `_bridge_call` is a postMessage round-trip and `_execCmd` currently assumes one in-flight motion command — two coroutines issuing concurrent `motor.run(...)` would race, so the JS side needs a story for interleaved commands (queue per port, or last-write-wins) before parallel Python tasks are safe.
