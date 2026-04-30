# FLL Virtual Robot Simulator

A browser-based simulator for FIRST LEGO League (FLL) robots using the Spike Prime v3 Python API. Write and run robot programs entirely in the browser — no hardware required.

![Spike Prime v3 API](https://img.shields.io/badge/Spike_Prime-v3_API-fbbf24) ![MicroPython](https://img.shields.io/badge/Runtime-MicroPython_WASM-3b82f6) ![No build step](https://img.shields.io/badge/Build-none-22c55e)

## Features

- **Python editor** with syntax highlighting, line numbers, and Spike Prime v3 autocomplete
- **Blockly drag-and-drop** programming mode for beginners
- **2D top-down simulation** of a differential-drive robot on an FLL-scale mat (2362 × 1143 mm)
- **Full Spike Prime v3 API** — `motor_pair`, `motor`, `color_sensor`, `distance_sensor`, `force_sensor`, `hub`, `color`, `Port`, `wait`
- **Live telemetry panel** showing robot X/Y position, heading, color sensor, and distance sensor
- **Adjustable simulation speed** (0.25× to 4×)
- **No build step** — plain HTML/CSS/JS served by any static file server

## Getting Started

```bash
# Clone the repo
git clone https://github.com/sanadfoundation/fll-virtual-robot.git
cd fll-virtual-robot

# Serve locally (PyScript requires HTTP, not file://)
python3 -m http.server 8787
```

Then open [http://localhost:8787](http://localhost:8787) in Chrome or Firefox.

> **Note:** The first load downloads the MicroPython WASM runtime (~170 KB). Subsequent loads use the browser cache.

## Usage

### Python mode

Write standard Spike Prime v3 Python. All API modules are pre-imported — no `import` statements needed.

```python
# Pair the drive motors
motor_pair.pair(motor_pair.PAIR_1, Port.A, Port.B)

# Move forward 30 cm
motor_pair.move(motor_pair.PAIR_1, 0, 500, 30, 'cm')

# Turn right 90°
motor_pair.move_tank(motor_pair.PAIR_1, 500, -500, 180, 'degrees')

# Display and beep
hub.light_matrix.write('Done')
hub.speaker.beep(72, 0.4)
print('Mission complete!')
```

Press **Run** or `Ctrl+Enter` to execute. The editor supports autocomplete — type `.` after any API object to see available methods, or press `Ctrl+Space` for global completions.

### Blockly mode

Click the **Blocks** tab to switch to drag-and-drop programming. Available block categories:

| Category | Blocks |
|----------|--------|
| Movement | Move forward/backward, Turn left/right, Move with steering, Move tank |
| Motors | Run motor for rotations/degrees |
| Sensors | Color sensor condition, Distance sensor condition |
| Hub | Display text, Beep, Wait, Print |
| Logic / Loops / Math / Text / Variables / Functions | Standard Blockly blocks |

### Controls

| Control | Action |
|---------|--------|
| `Ctrl+Enter` / `Cmd+Enter` | Run program |
| `Ctrl+Space` | Trigger autocomplete |
| **Run** button | Run program |
| **Stop** button | Stop simulation mid-run |
| **Reset** button | Reset robot to start position |
| Speed slider | Adjust simulation speed (0.25× – 4×) |

## API Reference

All Spike Prime v3 modules are available as globals:

### `motor_pair`

```python
motor_pair.pair(pair_id, left_port, right_port)
motor_pair.move(pair_id, steering, speed=500, amount=0, unit='degrees')
motor_pair.move_tank(pair_id, left_speed, right_speed, amount=0, unit='degrees')
motor_pair.start(pair_id, steering=0, speed=500)
motor_pair.start_tank(pair_id, left_speed, right_speed)
motor_pair.stop(pair_id)
# Constants: motor_pair.PAIR_1, PAIR_2, PAIR_3
```

`unit` accepts: `'degrees'`, `'rotations'`, `'cm'`, `'inches'`

### `motor`

```python
motor.run_for_degrees(port, degrees, velocity=500)
motor.run_for_time(port, duration_ms, velocity=500)
motor.run(port, velocity=500)
motor.stop(port)
motor.get_position(port)
```

### `color_sensor`

```python
color_sensor.color(port)       # → color constant string
color_sensor.reflection(port)  # → 0–100
color_sensor.rgb(port)         # → (r, g, b)
```

### `distance_sensor`

```python
distance_sensor.distance(port)        # → mm
distance_sensor.get_distance_cm(port) # → cm
distance_sensor.presence(port)        # → bool
```

### `hub`

```python
hub.light_matrix.write('Hello')
hub.light_matrix.set_pixel(x, y, brightness=100)
hub.speaker.beep(note=60, seconds=0.2)
hub.motion.get_yaw_angle()
```

### Constants

```python
Port.A, Port.B, Port.C, Port.D, Port.E, Port.F
color.BLACK, color.RED, color.GREEN, color.YELLOW
color.BLUE, color.WHITE, color.CYAN, color.MAGENTA, color.ORANGE, color.NONE
```

### `wait`

```python
wait(500)  # milliseconds
```

## Project Structure

```
index.html              — App shell
css/
  style.css             — All styles
js/
  simulator.js          — RobotSimulator class (physics + canvas rendering)
  blockly_config.js     — Custom Blockly block definitions and JS generators
  autocomplete.js       — CodeMirror autocomplete for Spike Prime + MicroPython
  main.js               — UI controller (editor, buttons, tabs, resize handle)
py/
  spike_bridge.py       — Spike Prime v3 API (runs in MicroPython WASM via PyScript)
```

## How It Works

Python code does not run concurrently with the animation. Execution follows two phases:

1. **Compile phase** — MicroPython executes the user's script synchronously. Every API call (`motor_pair.move`, `wait`, etc.) appends a JSON command to an internal queue instead of blocking.
2. **Animate phase** — Once the script finishes, JS receives the full command list and replays each command as a time-stepped canvas animation.

This means sensor reads (`color_sensor.color()`, `distance_sensor.distance()`) return the simulator state at the time the script runs, not during playback. It keeps the runtime simple and avoids async Python entirely while keeping the API surface identical to real Spike Prime v3.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Python runtime | PyScript (MicroPython WASM) |
| Simulation & rendering | HTML5 Canvas 2D API |
| Code editor | CodeMirror 5 |
| Visual programming | Blockly 10.x |
| Fonts | Exo 2 + JetBrains Mono (Google Fonts) |
| Audio | Web Audio API |
| Build tooling | None |

## License

TBD
