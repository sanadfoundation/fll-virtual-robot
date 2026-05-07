# SPIKE Prime Python v3 API — Documented Inventory

Source: LEGO Education SPIKE App Python documentation
(<https://spike.legoeducation.com/prime/modal/help/lls-help-python>), scraped
via Chrome DevTools MCP. Sections that the initial scrape truncated (`app.display`,
`app.music`, `hub.light_matrix`, `hub.motion_sensor`) were re-fetched with a
targeted scrape and merged into the entries below.

Signatures below are the rendered code-block signature lines from the docs
(recorded verbatim, not reordered from the parameter description list). Defaults,
return types, and any documented exceptions are recorded as written. The docs
do not document `Raises ...` clauses for any function on the scraped page.

---

## app

`app` is a namespace module re-exporting sub-modules: `bargraph`, `display`,
`linegraph`, `music`, `sound`. The H3 `App` page has no functions or constants
of its own.

---

## app.bargraph

Import: `from app import bargraph`

### Functions
- `change(color: int, value: float) -> None`
- `clear_all() -> None`
- `get_value(color: int) -> Awaitable`
- `hide() -> None`
- `set_value(color: int, value: float) -> None`
- `show(fullscreen: bool) -> None`

### Constants
- (none documented)

---

## app.display

Import: `from app import display`

### Functions
- `hide() -> None`
- `image(image: int) -> None`
- `show(fullscreen: bool) -> None`
- `text(text: str) -> None`

### Constants
- `IMAGE_ROBOT_1 = 1`
- `IMAGE_ROBOT_2 = 2`
- `IMAGE_ROBOT_3 = 3`
- `IMAGE_ROBOT_4 = 4`
- `IMAGE_ROBOT_5 = 5`
- `IMAGE_HUB_1 = 6`
- `IMAGE_HUB_2 = 7`
- `IMAGE_HUB_3 = 8`
- `IMAGE_HUB_4 = 9`
- `IMAGE_AMUSEMENT_PARK = 10`
- `IMAGE_BEACH = 11`
- `IMAGE_HAUNTED_HOUSE = 12`
- `IMAGE_CARNIVAL = 13`
- `IMAGE_BOOKSHELF = 14`
- `IMAGE_PLAYGROUND = 15`
- `IMAGE_MOON = 16`
- `IMAGE_CAVE = 17`
- `IMAGE_OCEAN = 18`
- `IMAGE_POLAR_BEAR = 19`
- `IMAGE_PARK = 20`
- `IMAGE_RANDOM = 21`

The `image()` function's id range is documented as 1–21.

---

## app.linegraph

Import: `from app import linegraph`

### Functions
- `clear(color: int) -> None`
- `clear_all() -> None`
- `get_average(color: int) -> Awaitable`
- `get_last(color: int) -> Awaitable`
- `get_max(color: int) -> Awaitable`
- `get_min(color: int) -> Awaitable`
- `hide() -> None`
- `plot(color: int, x: float, y: float) -> None`
- `show(fullscreen: bool) -> None`

### Constants
- (none documented)

---

## app.music

Import: `from app import music`

### Functions
- `play_drum(drum: int) -> None`
- `play_instrument(instrument: int, note: int, duration: int) -> None`
  - `note` documented range: 0-130 (midi)
  - `duration` in milliseconds

### Constants

Drum values (1–18):
- `DRUM_SNARE = 1`
- `DRUM_BASS = 2`
- `DRUM_SIDE_STICK = 3`
- `DRUM_CRASH_CYMBAL = 4`
- `DRUM_OPEN_HI_HAT = 5`
- `DRUM_CLOSED_HI_HAT = 6`
- `DRUM_TAMBOURINE = 7`
- `DRUM_HAND_CLAP = 8`
- `DRUM_CLAVES = 9`
- `DRUM_WOOD_BLOCK = 10`
- `DRUM_COWBELL = 11`
- `DRUM_TRIANGLE = 12`
- `DRUM_BONGO = 13`
- `DRUM_CONGA = 14`
- `DRUM_CABASA = 15`
- `DRUM_GUIRO = 16`
- `DRUM_VIBRASLAP = 17`
- `DRUM_CUICA = 18`

Instrument values (1–21):
- `INSTRUMENT_PIANO = 1`
- `INSTRUMENT_ELECTRIC_PIANO = 2`
- `INSTRUMENT_ORGAN = 3`
- `INSTRUMENT_GUITAR = 4`
- `INSTRUMENT_ELECTRIC_GUITAR = 5`
- `INSTRUMENT_BASS = 6`
- `INSTRUMENT_PIZZICATO = 7`
- `INSTRUMENT_CELLO = 8`
- `INSTRUMENT_TROMBONE = 9`
- `INSTRUMENT_CLARINET = 10`
- `INSTRUMENT_SAXOPHONE = 11`
- `INSTRUMENT_FLUTE = 12`
- `INSTRUMENT_WOODEN_FLUTE = 13`
- `INSTRUMENT_BASSOON = 14`
- `INSTRUMENT_CHOIR = 15`
- `INSTRUMENT_VIBRAPHONE = 16`
- `INSTRUMENT_MUSIC_BOX = 17`
- `INSTRUMENT_STEEL_DRUM = 18`
- `INSTRUMENT_MARIMBA = 19`
- `INSTRUMENT_SYNTH_LEAD = 20`
- `INSTRUMENT_SYNTH_PAD = 21`

---

## app.sound

Import: `from app import sound`

### Functions
- `play(sound_name: str, volume: int = 100, pitch: int = 0, pan: int = 0) -> Awaitable`
  - `volume` (0-100); `pan` -100..0..100
- `set_attributes(volume: int, pitch: int, pan: int) -> None`
- `stop() -> None`

### Constants
- (none documented)

---

## color

Import: `import color`

### Functions
- (none — module is constants only)

### Constants
- `BLACK = 0`
- `MAGENTA = 1`
- `PURPLE = 2`
- `BLUE = 3`
- `AZURE = 4`
- `TURQUOISE = 5`
- `GREEN = 6`
- `YELLOW = 7`
- `ORANGE = 8`
- `RED = 9`
- `WHITE = 10`
- `UNKNOWN = -1`

---

## color_matrix

Import: `import color_matrix`

### Functions
- `clear(port: int) -> None`
- `get_pixel(port: int, x: int, y: int) -> tuple[int, int]`
  - `x` range 0-2; `y` range 0-2
- `set_pixel(port: int, x: int, y: int, pixel: tuple[color: int, intensity: int]) -> None`
  - `x` range 0-2; `y` range 0-2
- `show(port: int, pixels: list[tuple[int, int]]) -> None`
  - `pixels` is a list of 9 (color, intensity) tuples

### Constants
- (none documented)

---

## color_sensor

Import: `import color_sensor`

### Functions
- `color(port: int) -> int`
- `reflection(port: int) -> int` — returns 0-100%
- `rgbi(port: int) -> tuple[int, int, int, int]`
  - Documented as `tuple[red: int, green: int, blue: int, intensity: int]`

### Constants
- (none documented)

---

## device

Import: `import device`

### Functions
- `data(port: int) -> tuple[int]` — raw LPF-2 data
- `id(port: int) -> int`
- `get_duty_cycle(port: int) -> int` — range 0 to 10000
- `ready(port: int) -> bool`
- `set_duty_cycle(port: int, duty_cycle: int) -> None`
  - PWM 0-10000

### Constants
- (none documented)

---

## distance_sensor

Import: `import distance_sensor`

### Functions
- `clear(port: int) -> None`
- `distance(port: int) -> int` — millimeters; returns -1 if no valid reading
- `get_pixel(port: int, x: int, y: int) -> int`
  - `x` range 0-3; `y` range 0-3
- `set_pixel(port: int, x: int, y: int, intensity: int) -> None`
  - `x` range 0-3; `y` range 0-3
- `show(port: int, pixels: list[int]) -> None`
  - `pixels` is a list of 4 intensity values

### Constants
- (none documented)

---

## force_sensor

Import: `import force_sensor`

### Functions
- `force(port: int) -> int` — decinewtons, range 0 to 100
- `pressed(port: int) -> bool`
- `raw(port: int) -> int`

### Constants
- (none documented)

---

## hub

`hub` is a namespace module exposing sub-modules: `button`, `light`,
`light_matrix`, `motion_sensor`, `port`, `sound`. The H3 `Hub` page has its
own top-level functions listed below.

### Functions
- `device_uuid() -> str`
- `hardware_id() -> str`
- `power_off() -> int`
- `temperature() -> int` — decidegrees Celsius (1/10 °C)

### Constants
- (none documented at hub root)

---

## hub.button

Import: `from hub import button`

### Functions
- `int pressed(button: int) -> int`
  - (signature line is verbatim — leading `int` is in the rendered docs)
  - Returns press duration in milliseconds (per docs prose)

### Constants
- `LEFT = 1`
- `RIGHT = 2`

---

## hub.light

Import: `from hub import light`

### Functions
- `color(light: int, color: int) -> None`

### Constants
- `POWER = 0`
- `CONNECT = 1`

---

## hub.light_matrix

Import: `from hub import light_matrix`

### Functions
- `clear() -> None`
- `get_orientation() -> int`
- `get_pixel(x: int, y: int) -> int`
  - `x` range 0-4; `y` range 0-4
- `set_orientation(top: int) -> int`
- `set_pixel(x: int, y: int, intensity: int) -> None`
  - `x` range 0-4; `y` range 0-4
- `show(pixels: list[int]) -> None`
  - `pixels` is a list of 25 intensity values
- `show_image(image: int) -> None`
  - `image` id range 1-67
- `write(text: str, intensity: int = 100, time_per_character: int = 500) -> Awaitable`

### Constants
- `IMAGE_HEART = 1`
- `IMAGE_HEART_SMALL = 2`
- `IMAGE_HAPPY = 3`
- `IMAGE_SMILE = 4`
- `IMAGE_SAD = 5`
- `IMAGE_CONFUSED = 6`
- `IMAGE_ANGRY = 7`
- `IMAGE_ASLEEP = 8`
- `IMAGE_SURPRISED = 9`
- `IMAGE_SILLY = 10`
- `IMAGE_FABULOUS = 11`
- `IMAGE_MEH = 12`
- `IMAGE_YES = 13`
- `IMAGE_NO = 14`
- `IMAGE_CLOCK12 = 15`, `IMAGE_CLOCK1 = 16`, `IMAGE_CLOCK2 = 17`, `IMAGE_CLOCK3 = 18`, `IMAGE_CLOCK4 = 19`, `IMAGE_CLOCK5 = 20`, `IMAGE_CLOCK6 = 21`, `IMAGE_CLOCK7 = 22`, `IMAGE_CLOCK8 = 23`, `IMAGE_CLOCK9 = 24`, `IMAGE_CLOCK10 = 25`, `IMAGE_CLOCK11 = 26`
- `IMAGE_ARROW_N = 27`, `IMAGE_ARROW_NE = 28`, `IMAGE_ARROW_E = 29`, `IMAGE_ARROW_SE = 30`, `IMAGE_ARROW_S = 31`, `IMAGE_ARROW_SW = 32`, `IMAGE_ARROW_W = 33`, `IMAGE_ARROW_NW = 34`
- `IMAGE_GO_RIGHT = 35`, `IMAGE_GO_LEFT = 36`, `IMAGE_GO_UP = 37`, `IMAGE_GO_DOWN = 38`
- `IMAGE_TRIANGLE = 39`, `IMAGE_TRIANGLE_LEFT = 40`, `IMAGE_CHESSBOARD = 41`
- `IMAGE_DIAMOND = 42`, `IMAGE_DIAMOND_SMALL = 43`, `IMAGE_SQUARE = 44`, `IMAGE_SQUARE_SMALL = 45`
- `IMAGE_RABBIT = 46`, `IMAGE_COW = 47`
- `IMAGE_MUSIC_CROTCHET = 48`, `IMAGE_MUSIC_QUAVER = 49`, `IMAGE_MUSIC_QUAVERS = 50`
- `IMAGE_PITCHFORK = 51`, `IMAGE_XMAS = 52`, `IMAGE_PACMAN = 53`, `IMAGE_TARGET = 54`
- `IMAGE_TSHIRT = 55`, `IMAGE_ROLLERSKATE = 56`, `IMAGE_DUCK = 57`, `IMAGE_HOUSE = 58`
- `IMAGE_TORTOISE = 59`, `IMAGE_BUTTERFLY = 60`, `IMAGE_STICKFIGURE = 61`
- `IMAGE_GHOST = 62`, `IMAGE_SWORD = 63`, `IMAGE_GIRAFFE = 64`, `IMAGE_SKULL = 65`
- `IMAGE_UMBRELLA = 66`, `IMAGE_SNAKE = 67`

---

## hub.motion_sensor

Import: `from hub import motion_sensor`

### Functions
- `acceleration(raw_unfiltered: bool) -> tuple[int, int, int]` — values in milli-G (x, y, z)
- `angular_velocity(raw_unfiltered: bool) -> tuple[int, int, int]` — decidegrees/sec (x, y, z)
- `gesture() -> int` — returns one of `TAPPED`, `DOUBLE_TAPPED`, `SHAKEN`, `FALLING`, `UNKNOWN`
- `get_yaw_face() -> int` — returns the hub face that yaw is measured relative to
- `quaternion() -> tuple[float, float, float, float]` — `(w, x, y, z)`
- `reset_tap_count() -> None`
- `reset_yaw(angle: int) -> None` — sets the yaw offset to `angle`
- `set_yaw_face(up: int) -> bool` — pass `motion_sensor.TOP/FRONT/RIGHT/BOTTOM/BACK/LEFT`
- `stable() -> bool` — true if the hub is resting flat
- `tap_count() -> int` — number of taps since program start or last `reset_tap_count()`
- `tilt_angles() -> tuple[int, int, int]` — `(yaw, pitch, roll)` in decidegrees
- `up_face() -> int` — returns the hub face currently pointing up

### Constants

Gesture values:
- `TAPPED = 0`
- `DOUBLE_TAPPED = 1`
- `SHAKEN = 2`
- `FALLING = 3`
- `UNKNOWN = -1`

Hub-face values:
- `TOP = 0` — the face with the Light Matrix
- `FRONT = 1` — the face where the speaker is
- `RIGHT = 2` — the right side when facing the front face
- `BOTTOM = 3` — the side where the battery is
- `BACK = 4` — the face with the USB charging port
- `LEFT = 5` — the left side when facing the front face

> **Note:** The docs are internally inconsistent here. The `up_face` / `set_yaw_face` prose says `TOP` is "the SPIKE Prime hub face with the USB charging port" and `BACK` is "the face where the speaker is", swapping `TOP` ↔ `BACK` relative to the constants list. The constants table above follows the rendered constants section, not the prose.

---

## hub.port

Import: `from hub import port`

### Functions
- (none — module is constants only)

### Constants
- `A = 0`
- `B = 1`
- `C = 2`
- `D = 3`
- `E = 4`
- `F = 5`

---

## hub.sound

Import: `from hub import sound`

### Functions
- `beep(freq: int = 440, duration: int = 500, volume: int = 100, *, attack: int = 0, decay: int = 0, sustain: int = 100, release: int = 0, transition: int = 10, waveform: int = WAVEFORM_SINE, channel: int = DEFAULT) -> Awaitable`
- `stop() -> None`
- `volume(volume: int) -> None`

### Constants
- `ANY = -2`
- `DEFAULT = -1`
- `WAVEFORM_SINE = 1`
- `WAVEFORM_SAWTOOTH = 3`
- `WAVEFORM_SQUARE = 2`
- `WAVEFORM_TRIANGLE = 1`
  (note: `WAVEFORM_SINE` and `WAVEFORM_TRIANGLE` are both listed as `= 1` in
  the docs — recorded verbatim, no fixup applied.)

---

## motor

Import: `import motor`

### Functions
- `absolute_position(port: int) -> int`
- `get_duty_cycle(port: int) -> int`
- `relative_position(port: int) -> int`
- `reset_relative_position(port: int, position: int) -> None`
- `run(port: int, velocity: int, *, acceleration: int = 1000) -> None`
  - velocity ranges by motor type: small -660..660, medium -1110..1110, large -1050..1050
  - acceleration deg/sec² (1-10000)
- `run_for_degrees(port: int, degrees: int, velocity: int, *, stop: int = BRAKE, acceleration: int = 1000, deceleration: int = 1000) -> Awaitable`
  - Awaited result: one of `motor.READY` / `RUNNING` / `STALLED` / `CANCELED` / `ERROR` / `DISCONNECTED`
- `run_for_time(port: int, duration: int, velocity: int, *, stop: int = BRAKE, acceleration: int = 1000, deceleration: int = 1000) -> Awaitable`
  - Awaited result: `READY` / `RUNNING` / `STALLED` / `ERROR` / `DISCONNECTED` (note: docs omit `CANCELED` from the awaited-status list for this function)
- `run_to_absolute_position(port: int, position: int, velocity: int, *, direction: int = motor.SHORTEST_PATH, stop: int = BRAKE, acceleration: int = 1000, deceleration: int = 1000) -> Awaitable`
  - Awaited result: `READY` / `RUNNING` / `STALLED` / `CANCELED` / `ERROR` / `DISCONNECTED`
- `run_to_relative_position(port: int, position: int, velocity: int, *, stop: int = BRAKE, acceleration: int = 1000, deceleration: int = 1000) -> Awaitable`
  - Awaited result: `READY` / `RUNNING` / `STALLED` / `CANCELED` / `ERROR` / `DISCONNECTED`
- `set_duty_cycle(port: int, pwm: int) -> None` — pwm range -10000..10000
- `stop(port: int, *, stop: int = BRAKE) -> None`
- `velocity(port: int) -> int`

### Constants

Status values:
- `READY = 0`
- `RUNNING = 1`
- `STALLED = 2`
- `CANCELLED = 3`
  (note: docs constants page spells it `CANCELLED` with two L's, but the
  signature/awaited-status prose uses `CANCELED` with one L. Both forms
  recorded verbatim.)
- `ERROR = 4`
- `DISCONNECTED = 5`

Stop behaviors:
- `COAST = 0`
- `BRAKE = 1`
- `HOLD = 2`
- `CONTINUE = 3`
- `SMART_COAST = 4`
- `SMART_BRAKE = 5`

Direction values:
- `CLOCKWISE = 0`
- `COUNTERCLOCKWISE = 1`
- `SHORTEST_PATH = 2`
- `LONGEST_PATH = 3`

---

## motor_pair

Import: `import motor_pair`

### Functions
- `move(pair: int, steering: int, *, velocity: int = 360, acceleration: int = 1000) -> None`
  - steering: -100 to 100
- `move_for_degrees(pair: int, degrees: int, steering: int, *, velocity: int = 360, stop: int = motor.BRAKE, acceleration: int = 1000, deceleration: int = 1000) -> Awaitable`
  - Awaited result: `motor.READY` / `RUNNING` / `STALLED` / `CANCELED` / `ERROR` / `DISCONNECTED`
- `move_for_time(pair: int, duration: int, steering: int, *, velocity: int = 360, stop: int = motor.BRAKE, acceleration: int = 1000, deceleration: int = 1000) -> Awaitable`
  - Same awaited statuses
- `move_tank(pair: int, left_velocity: int, right_velocity: int, *, acceleration: int = 1000) -> None`
- `move_tank_for_degrees(pair: int, degrees: int, left_velocity: int, right_velocity: int, *, stop: int = motor.BRAKE, acceleration: int = 1000, deceleration: int = 1000) -> Awaitable`
  - Same awaited statuses
- `move_tank_for_time(pair: int, left_velocity: int, right_velocity: int, duration: int, *, stop: int = motor.BRAKE, acceleration: int = 1000, deceleration: int = 1000) -> Awaitable`
  - Same awaited statuses
  - (note: parameter ordering in the rendered signature places `duration`
    after the velocities, unlike `move_for_time` which places `duration`
    before `steering`. Recorded verbatim.)
- `pair(pair: int, left_motor: int, right_motor: int) -> None`
- `stop(pair: int, *, stop: int = motor.BRAKE) -> None`
- `unpair(pair: int) -> None`

### Constants
- `PAIR_1 = 0`
- `PAIR_2 = 1`
- `PAIR_3 = 2`

---

## orientation

Import: `import orientation`

### Functions
- (none — module is constants only)

### Constants
- `UP = 0`
- `RIGHT = 1`
- `DOWN = 2`
- `LEFT = 3`

---

## runloop

Import: `import runloop`

### Functions
- `run(*functions: Awaitable) -> None`
- `sleep_ms(duration: int) -> Awaitable`
- `until(function: Callable[[], bool], timeout: int = 0) -> Awaitable`
  - `timeout = 0` means no timeout

### Constants
- (none documented)
