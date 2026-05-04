# Backlog

Spike Prime simulator features still to be built. Scope is restricted to:
- Spike Prime robot only
- Python / Blockly programming and its effect on robot movement and interaction

Grouped by theme; top of each group = highest value.

---

## Spike Prime API

Reference: [LEGO Spike Python help](https://spike.legoeducation.com/prime/modal/help/lls-help-python) and the [Tufts Spike 3 mirror](https://tuftsceeo.github.io/SPIKEPythonDocs/SPIKE3.html).

The individual motor API, `motor_pair.move_for_degrees` / `_for_time`, light matrix, beep, and the basic hub surface are in place. Remaining work, ordered by impact:

### Wrong / non-standard signatures
- **`hub.port` values are strings, not ints.** LEGO defines `port.A = 0 … port.F = 5`. We use `'A' … 'F'`. User code that compares `port.A == 0` fails silently.
- **`motor_pair.move_tank` signature is wrong.** Should be a steady-speed start: `move_tank(pair, left_velocity, right_velocity, *, acceleration)`. Ours takes `amount`/`unit` and acts like a finite move.
- **`motor_pair.move_tank_for_degrees` missing** — the canonical finite tank-drive call.
- **`hub.button.was_pressed` is non-standard.** LEGO only has `pressed(button) -> int` returning ms held. Drop our `was_pressed`, make `pressed` return a real duration.
- **`hub.speaker` is a non-standard alias.** Canonical name is `hub.sound`; align and drop the alias.
- **`hub.sound.beep` missing `waveform` and `channel` kwargs**, plus `WAVEFORM_SINE/SQUARE/SAWTOOTH/TRIANGLE` and `ANY`/`DEFAULT` constants.
- **`hub.light_matrix.show(pixels)` ignores its argument** — it always renders the `'CUSTOM'` glyph instead of the 25-pixel list.
- **Light matrix `IMAGE_*` constants missing** — LEGO defines 67 named images (`IMAGE_HEART`, `IMAGE_HAPPY`, …). We accept only raw strings.
- **`motor.run_to_absolute_position` ignores `direction`** (`CLOCKWISE` / `COUNTERCLOCKWISE` / `SHORTEST_PATH` / `LONGEST_PATH`).

### Sensor stubs that need real values
- **Motion sensor.** `tilt_angles()`, `acceleration()`, `angular_velocity()`, `quaternion()`, `up_face()`, `gesture()`, `tap_count()` all return frozen constants. Highest-value fix: drive `tilt_angles()` from the simulator heading so heading-locked driving works (this replaces the previously-listed `get_yaw_angle()` item, which doesn't exist in v3 — the canonical reader is `tilt_angles()`).
- **Force sensor.** `force()` / `pressed()` / `raw()` always return 0 / False / 0. Drive `pressed()` from on-screen / keyboard input so the existing Blockly blocks become functional.
- **Hub button.** `pressed(button)` always returns 0; needs real ms-held duration tied to keyboard or on-screen buttons.
- **Motor.** `velocity(port)` always returns 0; `absolute_position` and `relative_position` return the same counter; `reset_relative_position` is a no-op.
- **Color sensor.** `rgbi(port)` returns intensity = 0; should be the mean of R, G, B.

### Ignored kwargs
- `stop = BRAKE / HOLD / COAST / CONTINUE / SMART_*` — accepted everywhere, applied nowhere.
- `acceleration` / `deceleration` — accepted everywhere, applied nowhere; need ramps in `_animateTank` / `_animateSingleMotor`.

### Broken control flow
- **`runloop.until(fn, timeout)` is a no-op.** Any program that polls a condition exits immediately. Needs a real polling loop with timeout.

### Missing devices
- **Center button light** — `hub.light.color(POWER, …)` exists; the LED itself never updates in the renderer.
- **Named sound playback** — `app.sound.play("Cat" / "Dog" / …)` is a no-op. Lower priority than beep.

### Out-of-scope by design (document, don't fix)
- `app.display` / `app.bargraph` / `app.linegraph` / `app.music` — Spike App UI surfaces with no analogue here; leave as no-ops.
- `color_matrix` (3×3 LED attachment) — no plan to render.

### Cross-cutting
- **Inline autocomplete docs** — pull docstrings from the LEGO/Tufts reference into `monaco_config.js` so hover-help matches the canonical API.

---

## Programming Experience

### Blockly
- **Functional force-sensor blocks** — block UI exists but the underlying API is a stub (see "Force sensor" above).
- **Functional hub-button blocks** — same: UI exists, button state never changes.
- **Blockly-to-app parity** — match the Spike Prime App's block set exactly.

### Python editor
- **Inline error highlighting** — underline the offending line on MicroPython exceptions instead of console-only.
- **Motion sensor autocomplete** — surface the gyro methods once they exist.

---

## Simulation Fidelity

Collision against mission AABBs already stops the robot (`_robotOverlapsAABB`); field walls clamp position. Remaining:

- **Physics engine for collision** — replace the dead-stop AABB check with a 2D physics engine (Rapier / Planck / Matter) so the robot pushes, deflects, and is pushed by mission models the way a real bot would, and so mission pieces can slide / topple / stack. Also informs the 3D view's collision model.
- **Mission objects in the scene** — populate `_missionBoxes` (or the physics world) from a mission set so collision is actually exercised in default play.
- **Sensor footprint overlay** — draw the color sensor patch and distance sensor ray on the canvas during playback.
- **Surface friction variation** — "smooth mat" vs "rough mat" calibration modes that perturb travel distance slightly.

---

## Debugging & Observation

The live sensor panel (X / Y / heading / color / distance) already updates each frame. Remaining:

- **Step-through execution** — pause/step controls that advance one API call at a time.
- **Variable watch panel** — show user Python variables per frame, derived from command-queue metadata.

---

## Program Management

Code (Python + Blockly), theme, and speed already persist via localStorage. Remaining:

- **File import / export** — download the current program as `.py` (and Blockly as XML or `.llsp3`), and load one back from disk.
- **Example programs** — a dropdown of canonical FLL programs (straight drive, gyro turn, line follow, arm control).

---

## App Shell

- **New-release detection + reload nudge** — poll a deployed `version.json` (or hash an asset) and show a non-blocking banner offering to reload when a new build ships, so users on long-lived tabs don't keep running stale code.
- **"Support us" link** — header/footer link to the Sanad Foundation donation / sponsorship page so users have a clear path to contribute.

---

## 3D LDraw View

Now that the step-interleaved execution model is in place, the 3D view can be built. Design decisions:
- 3D **replaces** the 2D canvas (no toggle).
- Scene: bundled LDraw robot model + FLL mat texture + user-uploaded LDraw mission models.
- Camera presets only: Top, Iso, Follow (no free orbit).
- Renderer: Three.js r168+ with `LDrawLoader` via importmap; no build step.
- Collision / distance sensing: shadow robot does AABB + forward raycast against mission geometry.

---

## Appendix

| Simulator | URL |
|-----------|-----|
| alexandrehardy/lego-spike-simulator | <https://github.com/alexandrehardy/lego-spike-simulator> |
| CS2N Virtual SPIKE Prime | <https://www.cs2n.org/u/mp/badge_pages/2054> |
| amchen82/Lego-First-league-simulator | <https://github.com/amchen82/Lego-First-league-simulator> |
