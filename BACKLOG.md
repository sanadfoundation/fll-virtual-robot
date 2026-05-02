# Backlog

Features observed across comparable Spike Prime simulators, filtered to:
- Spike Prime robot only
- Python / block programming and its effects on robot movement and interaction

Items are grouped by theme and loosely prioritized within each group (top = highest value).

---

## 3D LDraw View *(blocked — requires execution model redesign first)*

Decisions already made in design session:
- 3D **replaces** the 2D canvas entirely (no toggle)
- Scene: LDraw robot model + FLL mat image texture + user-uploaded LDraw mission models
- Camera: preset angles only — Top, Iso, Follow (no free orbit)
- Robot model: self-contained `.ldr` bundled with app; mission models: user uploads via file picker
- Renderer: **Three.js r168+ + LDrawLoader** from CDN (importmap); no build step
- Collision & distance sensor: shadow robot does AABB collision + forward raycast against mission model geometry

Blocked until the step-interleaved execution model is in place so robot-model physics (collision, pushing) works correctly.

---

## Spike Prime API Completeness

### Motor control
- **Individual motor API** (`motor_a.run_for_degrees()`, `motor_a.run_for_rotations()`, `motor_a.start()`, `motor_a.stop()`) — motors on ports A–F independently, not just as a drive-pair. Needed for arm/attachment control in FLL missions.
- **Motor stop methods** — `brake`, `hold`, `coast` as distinct behaviours on `motor_pair.move()` and individual motors. Affects robot positioning accuracy in programs.
- **Motor acceleration** — `set_acceleration()` on individual motors and motor pair. Changes how smoothly the robot starts and stops.
- **`motor_pair.move_tank()`** — independent left/right speed inputs (separate from `move()` and `start_tank()`).

### Sensors
- **Force sensor** (`force_sensor.force()`, `force_sensor.is_pressed()`) — used in FLL for detecting contact with mission models.
- **Gyro / IMU** — `motion_sensor.get_yaw_angle()`, `motion_sensor.reset_yaw_angle()`. Enables heading-locked driving and turns, a common FLL technique.
- **Color sensor raw channels** — `color_sensor.get_rgb_intensity()`, `color_sensor.get_reflected_light_intensity()`. Used for line-following programs.

### Hub & display
- **Light matrix** — `hub.light_matrix.show_image()`, `hub.light_matrix.write()`, pixel-level control. Visual feedback that students include in their programs.
- **Center button light** — `hub.center_button.set_light()`. Minor, but students often use it to signal program state.
- **Hub button events** — `hub.left_button.was_pressed()`, `hub.right_button.was_pressed()` as readable state in Python. Useful for multi-run programs that branch on button press.

### Sound
- **`hub.speaker.beep()`** and **`hub.speaker.start_beep()`** — single-note beeps. Students add these as audio cues in Python programs.
- **`hub.speaker.play_sound()`** — named sound playback (e.g. `"Cat"`, `"Dog"`). Lower priority than beep but present in the real API.

---

## Simulation Fidelity

- **Collision detection with field objects** — robot stops or deflects when it hits a mission model or field wall, rather than passing through. Makes programs that rely on bumping into objects behave realistically.
- **Surface friction variation** — slight movement calibration difference between "smooth mat" and "rough mat" modes. Mirrors the real-world calibration challenge students face at competition.
- **Sensor footprint on field** — color sensor and distance sensor rays shown on the field canvas so students can see exactly what the sensor is reading during animation playback.

---

## Debugging & Observation

- **Live sensor dashboard** — panel showing current sensor values (color, distance, force, gyro) that updates frame-by-frame during animation playback. Helps students understand why their program behaves the way it does.
- **Step-through execution** — pause animation at each command boundary and advance one step at a time. Equivalent to a debugger breakpoint per API call.
- **Variable/state watch panel** — show the value of Python variables (e.g. loop counters, distances) at each animation frame, derived from the command queue metadata.

---

## Programming Experience

### Blockly blocks
- **Individual motor blocks** — run motor on port X for N rotations/degrees/seconds. Mirrors the Python motor API.
- **Force sensor block** — `is force sensor pressed?` boolean block and `force sensor force` numeric block.
- **Light matrix blocks** — show image, show text, set pixel brightness.
- **Beep / sound blocks** — beep for N seconds, play sound.
- **Hub button blocks** — `was left/right button pressed?` boolean for use in conditions.

### Python editor
- **Autocomplete for individual motor API** — `motor_a.`, `motor_b.` etc. dot-completion (currently only motor_pair and sensors are listed).
- **Autocomplete for motion_sensor** — `hub.motion_sensor.get_yaw_angle()` and friends.
- **Inline error highlighting** — underline the offending line in the editor when MicroPython raises an exception, rather than showing only a console message.

---

## Program Management

- **Load / save programs** — export the current Python or Blockly program to a local file and reload it in a future session. (alexandrehardy supports `.llsp3` format; a plain `.py` download/upload would also satisfy this.)
- **Example programs** — a dropdown of pre-written Python programs demonstrating common FLL techniques (straight drive, gyro turn, line following, arm control).

---

## Sources

| Simulator | URL |
|-----------|-----|
| alexandrehardy/lego-spike-simulator | https://github.com/alexandrehardy/lego-spike-simulator |
| CS2N Virtual SPIKE Prime | https://www.cs2n.org/u/mp/badge_pages/2054 |
| amchen82/Lego-First-league-simulator | https://github.com/amchen82/Lego-First-league-simulator |
