# Backlog

Spike Prime simulator features still to be built. Scope is restricted to:

- Spike Prime robot only
- Python / Blockly programming and its effect on robot movement and interaction

Grouped by theme; within each group, top = highest impact.

---

## Spike Prime API

Reference: [LEGO Spike Python help](https://spike.legoeducation.com/prime/modal/help/lls-help-python) and the [Tufts Spike 3 mirror](https://tuftsceeo.github.io/SPIKEPythonDocs/SPIKE3.html).

The individual motor API, `motor_pair.move_for_degrees` / `_for_time`, light matrix, beep, and the basic hub surface are in place.

### Wrong / non-standard signatures

- **`hub.button.was_pressed` is non-standard.** LEGO only has `pressed(button) -> int` returning ms held. Drop our `was_pressed`, make `pressed` return a real duration.
- **`hub.speaker` is a non-standard alias.** Canonical name is `hub.sound`; align and drop the alias.
- **`hub.light_matrix.show(pixels)` ignores its argument** — always renders the `'CUSTOM'` glyph instead of the 25-pixel list.
- **`motor.run_to_absolute_position` / `motor.run_to_relative_position` use distance, not position.** Both route through `_animateSingleMotor` with `distMM = (|target| / 360) × WHEEL_CIRC_MM`, so `run_to_absolute_position(port.A, 90)` drives 90° of wheel rotation instead of rotating to absolute 90°. The `direction` arg (`CLOCKWISE` / `COUNTERCLOCKWISE` / `SHORTEST_PATH` / `LONGEST_PATH`) is plumbed through Python but the simulator picks the same path regardless. SHORTEST / LONGEST additionally need the angle counter (see *Motor state stubs* below).

### Motor state stubs

These cascade — fixing the counter unblocks the four reporters and the relative-position offset.

- **Motor angle counter never increments.** `_animateTank` and `_animateSingleMotor` advance the robot pose but never tick `robot.motors[port]`. The Hub panel surfaces this — A and B both read `0°` no matter how far the robot drives. Fix: increment per-port degrees from wheel mm-per-step (drive ports in `_animateTank`, unpaired motors in `_animateSingleMotor`).
- **`absolute_position` / `relative_position` reporters** return the same counter; `reset_relative_position` is a no-op. (`velocity(port)` now returns the last commanded value via `_motor_velocities`.)
- **`getMotorSpeed(port)` always returns 0** — hardcoded stub backing the `motor X speed` / `motor X power` Blockly reporters.

### Sensor stubs that need real values

- **Motion sensor.** `tilt_angles()`, `acceleration()`, `angular_velocity()`, `quaternion()`, `up_face()`, `gesture()`, `tap_count()` all return frozen constants. Highest-value fix: drive `tilt_angles()` from the simulator heading so heading-locked driving works (this replaces the previously-listed `get_yaw_angle()` item, which doesn't exist in v3 — the canonical reader is `tilt_angles()`).
- **Hub button.** `pressed(button)` always returns 0; needs real ms-held duration tied to keyboard or on-screen buttons.
- **Color sensor.** `rgbi(port)` returns intensity = 0; should be the mean of R, G, B.

### Ignored kwargs

- **`stop = BRAKE / HOLD / COAST / CONTINUE / SMART_*`** — accepted everywhere, applied nowhere. `_animateTank` snaps velocity to 0 at the end regardless of mode; coast in particular needs momentum to carry forward, hold should resist external pushes.
- **`acceleration` / `deceleration`** — accepted everywhere, applied nowhere. Python kwargs (deg/s², default 1000) are dropped before the bridge payload is built in `py/spike_bridge.py`; `_animateTank` runs constant velocity for the full duration. Fix: forward the kwargs into the bridge payload, then implement a trapezoidal profile in `_animateTank` / `_animateSingleMotor` — convert deg/s² → mm/s² via `WHEEL_CIRC_MM/360`, ramp up to cruise, ramp down. When `t_accel + t_decel` would exceed total duration, fall back to a triangular profile with peak `v = sqrt(2·a·d·dist/(a+d))`. Per-step `maxV` feeds the existing `wheelsToBodyVelocity` call; no other physics changes needed.

### Broken control flow

- **`runloop.until(fn, timeout)` is a no-op.** Any program that polls a condition exits immediately. Needs a real polling loop with timeout.

### Missing devices

- **Center button light** — `hub.light.color(POWER, …)` exists; the LED itself never updates in the renderer.
- **Named sound playback** — `app.sound.play("Cat" / "Dog" / …)` is a no-op. Lower priority than beep.

### Out-of-scope by design (document, don't fix)

- `app.display` / `app.bargraph` / `app.linegraph` / `app.music` — Spike App UI surfaces with no analogue here; leave as no-ops.
- `color_matrix` (3×3 LED attachment) — no plan to render.

---

## Programming Experience

### Blockly

Motor-block gaps (grouped together for easier scanning):

- **Acceleration / stop-method setter blocks are no-ops.** `set movement acceleration to slow/medium/fast`, `set motor … acceleration`, `set movement motors … at stop` and `set motor … at stop` assign to `_moveAccel` / `_motorAccel` / `_stopMethod` / `_motorStop` globals (declared in `js/blockly_config.js` ~line 2268) but the move generators (`flippermoremove_startDualSpeed`, `flippermoremotor_motorGoToRelativePosition`, etc.) never read them. Once `_animateTank` honours accel/decel/stop (see *Ignored kwargs*), wire the setter values through and map `slow/medium/fast` to concrete deg/s² values (verify against current LEGO firmware; rough order of magnitude ~250 / 1000 / 2000).
- **Single-motor blue blocks: stop scope and continuous-run cap.** `flippermotor_motorStop` halts the whole program (`window.sim.stop()`) instead of stopping just one motor. `flippermotor_motorStartDirection` and `flippermoremotor_motorStartPower` emit a 5000 mm fire-and-forget — they should run until explicitly stopped. Needs per-port stop in the simulator and a continuous-run mode (e.g. `Infinity` distance or a separate command type).

Sensor-block gaps (block UI exists but the underlying API is stubbed):

- **Functional hub-button blocks** — see *Hub button* above. The `when button pressed` event hat is wired but emits a stub-warn until the underlying `hub.button.pressed()` API returns real values.

Other:

- **Blockly-to-app parity** — match the Spike Prime App's block set exactly.

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
