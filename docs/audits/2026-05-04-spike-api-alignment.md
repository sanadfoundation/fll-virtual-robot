# SPIKE Prime v3 API Alignment Audit — 2026-05-04

Compares three sources of truth:

1. **Docs** — official LEGO docs at <https://spike.legoeducation.com/prime/modal/help/lls-help-python> (scraped 2026-05-04).
2. **Bridge** — `py/spike_bridge.py` (the runtime API users `import` against).
3. **Editor** — `js/monaco_config.js` (`SPIKE_API` table; drives completions, signature help, hover).

Notation:
- ✓ aligned, ✗ missing, ⚠ drift.
- "kw=…" means keyword-only argument in the docs.

> CLAUDE.md is stale: it still describes `js/autocomplete.js` (CodeMirror 5). The actual editor is Monaco — the file is `js/monaco_config.js`. Worth fixing when this audit lands.

---

## 1. Module map

| Module | Docs | Bridge | Editor |
|---|---|---|---|
| `app` | ✓ | ✓ | ✓ |
| `app.bargraph` | ✓ | ✓ | ✓ |
| `app.display` | ✓ | ✓ | ✓ |
| `app.linegraph` | ✓ | ✓ | ✓ |
| `app.music` | ✓ | ✓ | ✓ |
| `app.sound` | ✓ | ✓ | ✓ |
| `color` | ✓ | ✓ | ✓ |
| `color_matrix` | ✓ | ✓ | ✓ |
| `color_sensor` | ✓ | ✓ | ✓ |
| `device` | ✓ | ✓ | ✓ |
| `distance_sensor` | ✓ | ✓ | ✓ |
| `force_sensor` | ✓ | ✓ | ✓ |
| `hub` (functions: `device_uuid`, `hardware_id`, `power_off`, `temperature`) | ✓ | ✓ | ✓ |
| `hub.button` | ✓ | ✓ | ✓ |
| `hub.light` | ✓ | ✓ | ✓ |
| `hub.light_matrix` | ✓ | ✓ | ✓ |
| `hub.motion_sensor` | ✓ | ✓ | ✓ |
| **`hub.port`** | ✓ | ✗ (only `port` at top level) | ✗ |
| **`hub.sound`** | ✓ | ⚠ (exposed as `hub.speaker` and `hub.sound` alias) | ✓ |
| `motor` | ✓ | ✓ | ✓ |
| `motor_pair` | ✓ | ✓ | ✓ |
| `orientation` | ✓ | ✓ | ✓ |
| `port` (top-level) | implied (used everywhere) | ✓ | ✓ |
| `runloop` | ✓ | ✓ | ✓ |

**Findings**

- **`hub.port`** — docs document a `Port` submodule under `Hub` with constants `A=0…F=5`. Neither the bridge's `_HubModule` nor Monaco exposes `hub.port`. (We expose `port` at the top level instead.) Either add `hub.port` for parity, or call this out as an intentional simplification.
- The bridge sets `hub.sound = hub.speaker` (alias). Docs only call this surface `hub.sound`; `speaker` is not in the docs. Bridge is forgiving but the alias drifts from the docs.

---

## 2. Functions per module

### 2.1 `motor`

| Function | Docs signature | Bridge | Editor |
|---|---|---|---|
| `absolute_position(port)` | ✓ | ✓ | ✓ |
| `relative_position(port)` | ✓ | ✓ | ✓ |
| `reset_relative_position(port, position)` | ✓ | ✓ | ✓ |
| `get_duty_cycle(port)` | ✓ | ✓ | ✓ |
| `set_duty_cycle(port, pwm)` | ✓ | ✓ | ✓ |
| `run(port, velocity, *, acceleration)` | ✓ | ✓ | ✓ |
| `run_for_degrees(port, degrees, velocity, *, stop, acceleration, deceleration)` | ✓ | ✓ | ✓ |
| `run_for_time(port, duration, velocity, *, stop, acceleration, deceleration)` | ✓ | ✓ | ✓ |
| `run_to_absolute_position(port, position, velocity, *, direction, stop, acceleration, deceleration)` | ✓ | ✓ | ✓ |
| `run_to_relative_position(port, position, velocity, *, stop, acceleration, deceleration)` | ✓ | ✓ | ✓ |
| `stop(port, *, stop)` | ✓ | ✓ | ✓ |
| `velocity(port)` | ✓ | ✓ (returns 0 stub) | ✓ |

Bridge default-velocity quirk: docs treat `velocity` as a **required positional**; bridge gives it a default `velocity=360`. Not breaking, just permissive. Editor signature shows it as positional with no default — matches docs.

### 2.2 `motor_pair`

| Function | Docs | Bridge | Editor |
|---|---|---|---|
| `pair(pair, left_motor, right_motor)` | ✓ | ✓ | ✓ |
| `unpair(pair)` | ✓ | ✓ (no-op) | ✓ |
| `move(pair, steering, *, velocity, acceleration)` | ✓ | ✓ | ✓ |
| `move_for_degrees(pair, degrees, steering, *, velocity, stop, acceleration, deceleration)` | ✓ | ✓ | ✓ |
| `move_for_time(pair, duration, steering, *, velocity, stop, acceleration, deceleration)` | ✓ | ✓ | ✓ |
| `move_tank(pair, left_velocity, right_velocity, *, acceleration)` | ✓ | ⚠ exists but as a positional **backward-compat alias** named `move_tank(pair_id, left_speed, right_speed, amount, unit, ...)` — wrong signature | ✗ |
| `move_tank_for_degrees(pair, degrees, left_velocity, right_velocity, *, stop, acceleration, deceleration)` | ✓ | ✗ | ✗ |
| `move_tank_for_time(pair, duration, left_velocity, right_velocity, *, stop, acceleration, deceleration)` | ✓ | ✓ | ✓ |
| `stop(pair, *, stop)` | ✓ | ✓ | ✓ |

**Findings**

- ✗ **`motor_pair.move_tank_for_degrees` is missing entirely.** Real student code that runs on a hub will fail in our simulator.
- ⚠ **`motor_pair.move_tank` exists in the bridge as a different function** — the legacy positional `(pair_id, left_speed, right_speed, amount, unit, …)` shape (intentionally hidden from completions per the comment `# Backward-compat aliases (positional, not in completions)`). Docs spec is `(pair, left_velocity, right_velocity, *, acceleration)` — i.e. a continuous-move command. Need a docs-shaped overload (or rename the legacy one and add the official one).
- Bridge parameter names don't match docs: bridge uses `left_speed`/`right_speed` in `move_tank_for_time`; docs use `left_velocity`/`right_velocity`. Editor matches docs.

### 2.3 `hub.motion_sensor`

| Function | Docs | Bridge | Editor |
|---|---|---|---|
| `acceleration(raw_unfiltered=False)` | ✓ | ✓ | ✓ |
| `angular_velocity(raw_unfiltered=False)` | ✓ | ✓ | ✓ |
| `gesture()` | ✓ | ✓ | ✓ |
| `reset_yaw(angle)` | ✓ | ✓ | ✓ |
| `stable()` | ✓ | ✓ | ✓ |
| `tilt_angles()` | ✓ | ✓ | ✓ |
| `up_face()` | ✓ | ✓ | ✓ |
| **`quaternion()`** | ✓ | ✓ | ✗ |
| **`tap_count()`** | ✓ | ✓ | ✗ |
| **`reset_tap_count()`** | ✓ | ✓ | ✗ |
| **`get_yaw_face()`** | ✓ | ✓ | ✗ |
| **`set_yaw_face(up)`** | ✓ | ✓ | ✗ |

**Finding** — five motion-sensor methods are runnable through the bridge but invisible to autocomplete/hover/signature help. Cheapest known gap to close.

### 2.4 `hub.sound`

| Function | Docs signature | Bridge | Editor |
|---|---|---|---|
| `beep(freq, duration, volume, *, attack, decay, sustain, release, transition, waveform, channel)` | ✓ | ⚠ missing kw `waveform`, `channel` | ⚠ missing `waveform`, `channel` |
| `stop()` | ✓ | ✓ | ✓ |
| `volume(volume)` | ✓ | ✓ (no-op) | ✓ |

Docs constants for `hub.sound`: `ANY = -2`, `DEFAULT = -1`, `WAVEFORM_SINE = 1`, `WAVEFORM_SQUARE = 2`, `WAVEFORM_SAWTOOTH = 3`, `WAVEFORM_TRIANGLE = 1`. **Bridge exposes none. Editor exposes none.** (Note: the docs page itself shows `WAVEFORM_SINE = 1` and `WAVEFORM_TRIANGLE = 1` — that looks like a docs typo, but we should still mirror what the docs publish.)

### 2.5 Other modules

All function signatures align between docs / bridge / editor for: `color_sensor`, `distance_sensor`, `force_sensor`, `device`, `color_matrix`, `app.bargraph`, `app.display`, `app.linegraph`, `app.music`, `app.sound`, `runloop`, `hub.button`, `hub.light`, `hub.light_matrix`.

`runloop.run` — docs spec `*functions: awaitable`. Bridge accepts `*funcs`. Editor signature shows `*functions`. ✓

---

## 3. Constants

### 3.1 `color`, `motor`, `motor_pair`, `orientation`, `hub.button`, `hub.light`, `hub.motion_sensor` (aligned)

All values match docs across bridge + editor. ✓

### 3.2 `port` — type drift

Docs declare `port` constants as `int` (`A=0` … `F=5`). Editor mirrors that.

**Bridge defines them as strings:** `port.A = 'A'`, `port.B = 'B'`, …. The bridge then calls `str(port)` everywhere internally. Functionally fine for our simulator, but:

- Hover/signature help tells the student `port.A = 0`, while `port.A == 0` is `False` at runtime.
- Any user code doing `if port.A == hub.port.A: …` would break, even if that's a contrived example.
- Worth either making bridge ports `int` to match docs or noting the simulator-specific choice in a tooltip.

### 3.3 `hub.light_matrix` IMAGE_* constants — missing

Docs publish **67** image constants (`IMAGE_HEART`, `IMAGE_HAPPY`, `IMAGE_HEART_SMALL`, `IMAGE_ARROW_N…NW`, `IMAGE_GO_RIGHT/LEFT/UP/DOWN`, `IMAGE_CLOCK1…12`, `IMAGE_TARGET`, `IMAGE_PACMAN`, etc.).

- **Bridge:** `_LightMatrix` exposes none of them. `show_image` will silently accept any value.
- **Editor:** `'hub.light_matrix'` block has no `constants` map.

This is the largest gap. Common student examples (`hub.light_matrix.show_image(hub.light_matrix.IMAGE_HAPPY)`) won't autocomplete and will pass `AttributeError` at runtime.

### 3.4 `app.display` IMAGE_* constants — value drift + missing

Docs (canonical):

```
IMAGE_ROBOT_1=1   IMAGE_ROBOT_2=2   IMAGE_ROBOT_3=3   IMAGE_ROBOT_4=4   IMAGE_ROBOT_5=5
IMAGE_HUB_1=6     IMAGE_HUB_2=7     IMAGE_HUB_3=8     IMAGE_HUB_4=9
IMAGE_AMUSEMENT_PARK=10  IMAGE_BEACH=11  IMAGE_HAUNTED_HOUSE=12  IMAGE_CARNIVAL=13
IMAGE_BOOKSHELF=14  IMAGE_PLAYGROUND=15  IMAGE_MOON=16  IMAGE_CAVE=17
IMAGE_OCEAN=18  IMAGE_POLAR_BEAR=19  IMAGE_PARK=20  IMAGE_RANDOM=21
```

Bridge `_AppDisplay`:

```
IMAGE_ROBOT_1..5     ✓ values match
IMAGE_AMUSEMENT_PARK = 6   ⚠ docs say 10
IMAGE_BEACH = 7            ⚠ docs say 11
IMAGE_HAUNTED_HOUSE = 8    ⚠ docs say 12
IMAGE_MOON = 9             ⚠ docs say 16
IMAGE_RAINBOW = 10         ⚠ NOT IN DOCS — bridge invented it
IMAGE_EMPTY = 11           ⚠ NOT IN DOCS
IMAGE_RANDOM = 21          ✓
Missing: IMAGE_HUB_1..4, IMAGE_CARNIVAL, IMAGE_BOOKSHELF, IMAGE_PLAYGROUND,
         IMAGE_CAVE, IMAGE_OCEAN, IMAGE_POLAR_BEAR, IMAGE_PARK
```

Editor `app.display.constants` mirrors the bridge's (wrong) subset.

### 3.5 `app.music` DRUM_* constants — values match, set incomplete

Docs publish 18 drums and 21 instruments. Bridge has 4 drums and all 21 instruments. Editor mirrors the bridge.

| Drum | Docs | Bridge / Editor |
|---|---|---|
| DRUM_SNARE=1 | ✓ | ✓ |
| DRUM_BASS=2 | ✓ | ✓ |
| DRUM_SIDE_STICK=3 | ✓ | ✓ |
| DRUM_CRASH_CYMBAL=4 | ✓ | ✓ |
| DRUM_OPEN_HI_HAT=5, DRUM_CLOSED_HI_HAT=6, DRUM_TAMBOURINE=7, DRUM_HAND_CLAP=8, DRUM_CLAVES=9, DRUM_WOOD_BLOCK=10, DRUM_COWBELL=11, DRUM_TRIANGLE=12, DRUM_BONGO=13, DRUM_CONGA=14, DRUM_CABASA=15, DRUM_GUIRO=16, DRUM_VIBRASLAP=17, DRUM_CUICA=18 | ✓ | ✗ (14 missing) |

Instruments: bridge complete, monaco only exposes 8 of 21.

| Instrument | Docs | Bridge | Editor |
|---|---|---|---|
| INSTRUMENT_PIANO..ELECTRIC_GUITAR..BASS (1–6) | ✓ | ✓ | ✓ |
| INSTRUMENT_FLUTE=12 | ✓ | ✓ | ✓ |
| INSTRUMENT_VIBRAPHONE=16 | ✓ | ✓ | ✓ |
| INSTRUMENT_SYNTH_LEAD=20 | ✓ | ✓ | ✓ |
| INSTRUMENT_PIZZICATO=7, CELLO=8, TROMBONE=9, CLARINET=10, SAXOPHONE=11, WOODEN_FLUTE=13, BASSOON=14, CHOIR=15, MUSIC_BOX=17, STEEL_DRUM=18, MARIMBA=19, SYNTH_PAD=21 | ✓ | ✓ | ✗ |

### 3.6 `hub.port` constants — missing entirely

Docs publish `hub.port.A=0 … F=5`. Bridge has no `hub.port`. Editor has no `hub.port`.

### 3.7 `hub.sound` constants — missing entirely

See 2.4 above.

---

## 4. Three-way summary

### Most impactful gaps (by "this user code will visibly break")

1. **`hub.light_matrix.IMAGE_*`** — 67 constants missing in bridge and editor. Highest student-facing surface.
2. **`motor_pair.move_tank_for_degrees`** — function missing in bridge and editor. Common dead-reckoning idiom.
3. **`motor_pair.move_tank`** — present in bridge as a legacy positional shape that doesn't match the docs' continuous-move signature; missing entirely from editor.
4. **`app.display` image-constant value drift** — bridge values for `IMAGE_AMUSEMENT_PARK / BEACH / HAUNTED_HOUSE / MOON` are wrong, and there are two invented constants (`IMAGE_RAINBOW`, `IMAGE_EMPTY`) that don't exist in the docs. Anyone copy-pasting docs example code will get the wrong picture.
5. **`hub.motion_sensor.{quaternion, tap_count, reset_tap_count, get_yaw_face, set_yaw_face}`** — runtime works, but invisible in completions. Quick monaco-only fix.

### Smaller drift to clean up

6. **`hub.sound.beep`** missing optional kwargs `waveform` and `channel`.
7. **`hub.sound`** waveform constants and `ANY` / `DEFAULT` missing.
8. **`app.music`** missing 14 drum constants (bridge + editor) and 12 instrument constants (editor only).
9. **`port.A..F`** typed as `str` in the bridge while docs say `int` — confusing for hover.
10. **`hub.port`** submodule absent; only top-level `port` exists.
11. Hub's `speaker` alias for `hub.sound` is a bridge-only invention not present in the docs.
12. Bridge `motor_pair.move_tank_for_time` uses parameter names `left_speed` / `right_speed`; docs and editor say `left_velocity` / `right_velocity` (signature help vs runtime keyword-arg names mismatch — `motor_pair.move_tank_for_time(0, 1000, left_velocity=…, right_velocity=…)` would actually fail at runtime against the bridge).
13. CLAUDE.md still references `js/autocomplete.js` (deleted) — needs rewrite to reference Monaco.

---

## 5. Recommended order of fixes

1. **One-liner monaco patches** (no behavior change): expose the five missing `hub.motion_sensor` methods; expose missing `app.music` instrument and drum constants in `SPIKE_API`.
2. **Fix bridge constants drift** (`app.display`, `app.music` drums, `hub.light_matrix` IMAGE_*) — these are pure data and trivially testable.
3. **Add `motor_pair.move_tank` (docs shape) and `motor_pair.move_tank_for_degrees`**, and rename the legacy `move_tank` to something internal like `_move_tank_legacy` if we still need to support the old block-generator output.
4. **Reconcile `hub.sound`**: add `waveform` and `channel` kwargs; add waveform constants; remove the `speaker` alias or keep it but add a deprecation comment.
5. **Decide on `port.A..F` typing.** Switching to `int` matches docs but requires updating the simulator command map. Alternative: keep strings and add a hover note.
6. **Add `hub.port` namespace** for parity (or document the omission).
7. **Refresh CLAUDE.md** to describe `js/monaco_config.js` instead of the removed CodeMirror autocomplete file.

Each item is independently shippable and independently testable against `tests/py/`.
