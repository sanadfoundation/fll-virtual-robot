# Backlog

Spike Prime simulator features still to be built. Scope is restricted to:

- Spike Prime robot only
- Python / Blockly programming and its effect on robot movement and interaction

Grouped by theme; within each group, top = highest impact.

---

## Spike Prime API

Reference: [LEGO Spike Python help](https://spike.legoeducation.com/prime/modal/help/lls-help-python) and the [Tufts Spike 3 mirror](https://tuftsceeo.github.io/SPIKEPythonDocs/SPIKE3.html).

The individual motor API, `motor_pair.move_for_degrees` / `_for_time`, light-matrix `write` (real 5×5 glyph font for A–Z + 0–9), beep, and the basic hub surface are in place. Per-port motor encoders and wheel velocity now feed `absolute_position` / `relative_position` / `velocity` / `getMotorSpeed` / `getMotorPosition`. `motor.run_to_absolute_position` lands at the target, `reset_relative_position` works (anchor mechanism), `hub.button.pressed()` returns real ms-held, `color_sensor.reflection()` is wired through `_sensorState`, and `motor_pair.move(steering)` now applies steering to the wheels (though the continuous-motion cap remains — see *Motion command bugs* below).

### Wrong / non-standard signatures

- **`hub.button.was_pressed` is non-standard.** LEGO only has `pressed(button) -> int` returning ms held (now real). Drop `was_pressed`.
- **`hub.speaker` is a non-standard alias.** Canonical name is `hub.sound`; align and drop the alias (`py/spike_bridge.py:509-511`).
- **`hub.light_matrix.show(pixels)` discards the 25-pixel list.** `py/spike_bridge.py:401-402` always sends `{'type': 'hub_image', 'image': 'CUSTOM'}` regardless of input; the simulator's `_imageToDisplay` only has bitmaps for HAPPY / SAD / HEART / ARROW_N, so the other 63 LEGO `IMAGE_*` constants (and any user pixel grid) render blank. Fix: pass the pixel grid in the payload and let `_imageToDisplay` render arbitrary 25-cell brightness arrays.
- **`motor.run_to_absolute_position` `direction` kwarg is ignored by the simulator.** `py/spike_bridge.py:196` plumbs `direction` (CLOCKWISE / COUNTERCLOCKWISE / SHORTEST_PATH / LONGEST_PATH) onto the wire payload, but `_execCmd` in `js/simulator.js` picks the same path regardless. Now that the encoder counter is real and the move lands at the target, SHORTEST / LONGEST are tractable.

### Sensor stubs that need real values

- **Motion sensor (other than yaw).** `acceleration()`, `angular_velocity()`, `quaternion()`, `up_face()`, `gesture()`, `tap_count()` all return frozen constants. `tilt_angles()` pitch and roll are always 0 and are documented as a 2D-sim limitation; yaw now drives from the real heading.
- **Color sensor `rgbi()`.** Returns frozen `(128,128,128,0)` because `_sensorState()` never includes an `rgb` key. Wire the per-color map; intensity should be the mean of R/G/B. Currently `@unittest.expectedFailure`.

### Motion command bugs

Ordered by program-breaking impact.

- **`motor_pair.move` / `motor.run` continuous motion is capped.** `_execCmd 'start' / 'start_tank'` now applies steering (good), but still hands `_animateTank` a hardcoded 200 mm distance (`js/simulator.js:1158`); `motor_run` is capped at 180 mm (`js/simulator.js:1186`); the Blockly single-motor start blocks emit a 5000 mm fire-and-forget. Real SPIKE keeps motors running until another command — programs that follow "start moving, wait for sensor, then stop" still stall mid-mat. Replace the caps with a continuous-run mode (e.g., `Infinity` distance) tied to the existing `_motionAborted` flag.
- **Steering convention doesn't match SPIKE.** Sim uses linear `lv = spd × (1+steer)`, `rv = spd × (1-steer)`. SPIKE 3's semantics: `steering=50` → pivot (inner wheel stops), `steering=100` → spin (wheels counter-rotate around the centre). The linear formula gives a partial-pivot at every value: `steering=50` produces ~60° instead of 90°, `steering=100` produces a pivot rather than a centre-spin (broke UAT T3, AT1, R1). CLAUDE.md and the Blockly generators both document the linear convention — if we keep it for Blockly steering inputs, we still need a separate code path for `motor_pair.move`-style steering that matches the hub.
- **Negative `degrees` are treated as positive.** `motor_pair.move_for_degrees(pair, -1080, …)` drives forward by 1080° instead of backwards (broke UAT M2, D2). Suspect `Math.abs` in the Blockly unit conversion (`js/blockly_config.js:1248-1249, 1263, 1890`) is leaking into the Python path or the bridge's degrees→mm conversion. Trace pending.

### Ignored kwargs

- **`stop = BRAKE / HOLD / COAST / CONTINUE / SMART_*`** — accepted everywhere, applied nowhere. `_animateTank` snaps velocity to 0 at the end regardless of mode; coast in particular needs momentum to carry forward, hold should resist external pushes.
- **`acceleration` / `deceleration`** — accepted everywhere, applied nowhere. Python kwargs (deg/s², default 1000) are dropped before the bridge payload is built in `py/spike_bridge.py`; `_animateTank` runs constant velocity for the full duration. Currently `@unittest.expectedFailure`. Fix: forward the kwargs into the bridge payload, then implement a trapezoidal profile in `_animateTank` / `_animateSingleMotor` — convert deg/s² → mm/s² via `WHEEL_CIRC_MM/360`, ramp up to cruise, ramp down. When `t_accel + t_decel` would exceed total duration, fall back to a triangular profile with peak `v = sqrt(2·a·d·dist/(a+d))`. Per-step `maxV` feeds the existing `wheelsToBodyVelocity` call; no other physics changes needed. Blockly's `_ACCEL` dropdown now stores Spike's wire form (`"1000 1000"` / `"3000 3000"` / `"10000 10000"`) per commit `c6f4b7a`, so the slow/medium/fast → deg/s² mapping is settled — but no move generator reads the values yet.

### Broken control flow

- **`runloop.until(fn, timeout)` is a no-op.** Any program that polls a condition exits immediately (`py/spike_bridge.py:560` returns `_NoopAwaitable()`). Currently `@unittest.expectedFailure`. Needs a real polling loop with timeout.

### Missing devices

- **Center button light** — `hub.light.color(POWER, …)` exists; the LED itself never updates in the renderer.
- **Named sound playback** — `app.sound.play("Cat" / "Dog" / …)` is a no-op. Lower priority than beep.

### Out-of-scope by design (document, don't fix)

- `app.display` / `app.bargraph` / `app.linegraph` / `app.music` — Spike App UI surfaces with no analogue here; leave as no-ops.
- `color_matrix` (3×3 LED attachment) — no plan to render.
- Motion sensor pitch / roll / accel / gyro / gesture — top-down 2D sim has no third axis; documented as a sim limitation.

---

## Programming Experience

### Blockly

Motor-block gaps (grouped together for easier scanning):

- **Acceleration / stop-method setter blocks are no-ops.** `set movement acceleration to slow/medium/fast`, `set motor … acceleration`, `set movement motors … at stop` and `set motor … at stop` assign to `_moveAccel` / `_motorAccel` / `_stopMethod` / `_motorStop` globals (declared in `js/blockly_config.js` ~line 3456) but the move generators (`flippermoremove_startDualSpeed`, `flippermoremotor_motorGoToRelativePosition`, etc.) never read them. Once `_animateTank` honours accel/decel/stop (see *Ignored kwargs*), thread these globals through.
- **Single-motor blue blocks: continuous-run cap.** `flippermotor_motorStartDirection`, `flippermoremotor_motorStartPower`, and `flippermove_startMove` / `flippermove_startSteer` emit a 5000 mm fire-and-forget (`js/blockly_config.js:1312, 1328`) — they should run until explicitly stopped. The same whole-sim-stop granularity bug remains on `flippermove_stopMove`; the per-port version (`flippermotor_motorStop`) is fixed. Needs a continuous-run mode (e.g. `Infinity` distance or a separate command type) plus a per-pair stop wired into `_motionAborted`.

Other:

- **Blockly-to-app parity** — match the Spike Prime App's block set exactly. Recent Spike-style widget work (port-grid picker, 5×5 LED matrix, rotation-wheel popup, ultrasonic LED, angle dial, color strip, sound JSON values — commits `57514f6` through `e66bb85`) closes the UI side; block-set parity is the remaining surface (event hats, lists, music/weather categories, etc.). The fixture-driven behaviour runner now exists (`tests/js/blockly/program-fixtures.test.js`) — each remaining block category is one fixture row away from a behaviour test.

### Python editor

- **Inline error highlighting** — underline the offending line on MicroPython exceptions instead of console-only.
- **Motion sensor autocomplete** — surface the gyro methods once they exist.

---

## Simulation Fidelity

Box2D-WASM drives the robot and field walls; two seeded mission obstacles exercise collision. Remaining:

- **Robot passes through field walls.** The kinematic robot body is unconstrained by static walls — Box2D's solver applies zero impulse to either body when both are immovable. Symptom: driving forward more than ~1 m without an obstacle in the way takes the robot off the canvas (e.g. `motor_pair.move_for_degrees(pair, 3000)` from spawn ends near math y ≈ 1828, well past the top wall at y = 1168). The force sensor also reads 0 on wall hits for the same reason — `b2ContactImpulse.normalImpulses` is 0 for kinematic-vs-static contacts.
  - **Fix sketch.** Add a position clamp in `js/simulator.js:_animateTank` after `physics.readPose(this.robotBody)`: compute the robot's AABB in world coords from `ROBOT_BODY_W / ROBOT_BODY_H / BUMPER_DEPTH_MM` plus the heading, clamp the centre so the AABB stays inside `[0, FIELD_W_MM] × [0, FIELD_H_MM]`, then write the clamped pose back via `physics.setKinematicPose` before the next velocity setter. Skip the clamp when no contact is happening (cheap check via `world.GetContactList()` or just always-on — clamp is a no-op away from edges).
  - **Force-sensor consequence.** Once the clamp lands, the bumper-against-wall case still won't generate impulses (Box2D won't help us). If a wall press should register force, the bumper logic will need a separate "is this fixture inside / coincident with a wall AABB?" check that synthesises a force value when the robot is being driven into the clamp. Treat that as a follow-up to the clamp itself.
  - **Pre-dates this branch.** Introduced by the box2d-physics merge (`6d4c49c`); the closed-form integrator that preceded it apparently clamped position in-line. Surfaced when the force-sensor feature gave students a reason to drive long distances.
- **Mission set authoring** — load a real FLL mission layout into the Box2D world (more than the two seeded obstacles) so collision and scoring are exercised in default play.
- **Color sensor patch overlay** — draw the color sensor's read footprint on the canvas during playback so users can see what the sensor is reading.
- **Surface friction variation** — "smooth mat" vs "rough mat" calibration modes that perturb travel distance slightly.

---

## Debugging & Observation

The Hub panel (X / Y / heading + per-port live readings for A–F) already updates each frame. Remaining:

- **Step-through execution** — pause/step controls that advance one API call at a time.
- **Variable watch panel** — show user Python variables per frame, derived from command-queue metadata.

---

## Test Coverage

The 2026-05-13 test-coverage audit (`docs/audits/2026-05-13-test-coverage-fidelity.md`) found ~21 documented bugs where the test suite had a test pointing at the same surface that **passed against the bug**. The 2026-05-16 / 2026-05-17 uplifts (`docs/audits/2026-05-16-test-fidelity-by-layer.md`, `2026-05-17-test-suite-re-evaluation.md`) built the round-trip harness, fixture-driven Blockly runner, flipped all stub-pins to `@expectedFailure` (or fixed the bug), and added behaviour-grade coverage for 11 of 21 named surfaces (2 more paired with round-trip companions; 3 tracked-failing). Remaining structural work, in priority order:

- **Fixture rows in `tests/js/blockly/program-fixtures.test.js`** for each block category that matters (movement, motor, control flow, sensors, hub display, hub sound). Each row covers ~10-15 generators of the ~85 still on generator-smoke alone.
- **Sim-side companions for stranded payload-shape Python tests.** The high-impact subset (`motor.run_to_*` `direction` branches, `move_for_time`, `move_tank_for_degrees`, `color_sensor.color`, `distance_sensor.distance`, etc.) — maybe 15-20 tests cover the user-visible surface.
- **Targeted regression test still missing**: **negative degrees → backward motion** — `move_for_degrees(pair, -1080, …)` should end up south of spawn, not north. (The continuous-`'start'`-with-steering companion landed; the continuous-motion cap is the remaining half of that gap, tracked under *Motion command bugs*.)

### Unify Python tests under Node (MicroPython-WASM-in-Node runner)

Today's split: `tests/py/*.py` run under CPython via `python3 tests/py/run.py`; everything else runs under Node. Two interpreters means CPython-only API usage in `spike_bridge.py` (e.g., `traceback`, exception classes, stdlib gaps) passes CI and breaks the browser — exactly the divergence the CLAUDE.md "MicroPython has no `traceback` module" note exists for.

**Design.** A JS test file discovers `tests/py/test_*.py` at boot, loads each into MicroPython-WASM (the same `@micropython/micropython-webassembly-pyscript` build the browser ships), runs each `test_*` method as its own `node:test`. Python files unchanged: same `unittest.TestCase` classes, same `setUp` calling `mock_js.bridge_mock.install()`. Verified facts that make this viable: MicroPython-WASM ships `unittest` and `inspect`; `mock_js.py` is pure-Python with zero CPython-only features and runs unchanged.

**Mechanism.**
- Per file: load MicroPython, `FS.writeFile` `mock_js.py` + `spike_bridge.py` + the test file, set `sys.modules['js'] = mock_js`, discover `test_*` methods via `inspect`, emit one `test()` per method.
- One wrinkle: `node:test` requires synchronous test declaration but discovery is async. Solve with a build-time regex pre-scan of `tests/py/test_*.py` (`/^class (\w+)\([\w.]*TestCase\)[\s\S]*?def (test_\w+)/`) declared at module load, then validate the static match against `inspect` at runtime.
- The MicroPython-WASM loader and the custom-`js`-module registration pattern needed for this also serve the round-trip harness (see the structural-moves bullet above). One implementation, two consumers.

**Tradeoffs.**
- *Gains:* single `npm test` command and single reporter; CPython/MicroPython divergence caught at test time; `expectedFailure` semantics survive intact; Node test-concurrency becomes available.
- *Losses:* speed — Python side goes from ~18 ms to ~3–4 s (~50 ms × N files of MicroPython init + ~2 ms × ~217 tests); Python tracebacks come through as Python error strings inside JS assertion messages rather than native unittest output; one more layer of test infrastructure to maintain.
- *Neutral:* Python test files unchanged; `tests/py/run.py` can stay as a CPython fallback entry point or be removed.

**Trigger conditions for doing it.** A real CPython/MicroPython divergence ships through CI undetected; CI consolidates onto a single command; or "remember to run `python3 tests/py/run.py` too" becomes material friction. None is biting today — this is a documented option, not an active backlog item.

**Estimated work.** ~150 LoC across `tests/js/python/loader.js` and `tests/js/python/run-py-tests.test.js`, plus the static-pre-discovery regex. The MicroPython-WASM loader + `js`-module-registration pattern need to land first (or in parallel) as part of the round-trip harness work.

---

## Program Management

Code (Python + Blockly), theme, speed, and active tab already persist via localStorage. `.llsp3` Open/Save round-trips both editor modes. Remaining:

- **Example programs** — a dropdown of canonical FLL programs (straight drive, gyro turn, line follow, arm control).
- **Plain `.py` export** — quicker hand-off than `.llsp3` for users who just want the script.

---

## App Shell

- **"Support us" link** — header/footer link to the Sanad Foundation donation / sponsorship page so users have a clear path to contribute.

---

## 3D LDraw View

Now that the step-interleaved execution model is in place, the 3D view can be built. Design decisions:

- 3D **replaces** the 2D canvas (no toggle).
- Scene: bundled LDraw robot model + FLL mat texture + user-uploaded LDraw mission models.
- Camera presets only: Top, Iso, Follow (no free orbit).
- Renderer: Three.js r168+ with `LDrawLoader` via importmap; no build step.
- Collision / distance sensing: reuse the existing Box2D world for footprint collisions plus a forward raycast against mission geometry for the distance sensor.

---

## Obstacle Courses

- Leveraging a physics engine, we're able to model collisions.
- Able to change canvas maps, where each map has a start-to-finish goal but obstacles to avoid in-between.
- Possibility of random map generation if feasible.

---

## Random Noise Events

- Poking the robot away from its course and having it get back on track.
- Canvas friction increase or decrease in certain areas.

---

## Appendix

| Simulator | URL |
|-----------|-----|
| alexandrehardy/lego-spike-simulator | <https://github.com/alexandrehardy/lego-spike-simulator> |
| CS2N Virtual SPIKE Prime | <https://www.cs2n.org/u/mp/badge_pages/2054> |
| amchen82/Lego-First-league-simulator | <https://github.com/amchen82/Lego-First-league-simulator> |
