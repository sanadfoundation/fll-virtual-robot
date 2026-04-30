# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

```bash
# Serve locally — PyScript requires HTTP, file:// will not work
python3 -m http.server 8787
# Open http://localhost:8787
```

No build step, no package manager, no bundler. All dependencies are loaded from CDN at runtime.

## Architecture

### Execution model

The most important thing to understand: **Python and animation never run concurrently.**

1. User clicks Run → `main.js` calls `window.pyRunCode(code)` (synchronous)
2. MicroPython executes the user script; every API call pushes a JSON dict onto `_cmds[]` in `py/spike_bridge.py` — nothing moves yet
3. At the end of the script, `window.receiveCommands(json.dumps(_cmds))` hands the full command list to JS
4. `sim.playQueue()` replays each command as a time-stepped canvas animation

Consequence: sensor reads (`color_sensor.color()`, `distance_sensor.distance()`) return simulator state at script-execution time, not during animation playback. This is by design.

### Data flow

```
py/spike_bridge.py  →  _cmds[] JSON  →  js/simulator.js receiveCommands()
                                         └── playQueue() → _execCmd() → _animateTank()
```

Blockly bypasses the command queue entirely — generated JS calls `window.sim._animateTank()` directly via `AsyncFunction`. This is why `sim.isRunning = true` must be set before Blockly code runs (`js/main.js:runBlockly()`).

### Coordinate system

- Field: 2362 × 1143 mm (actual FLL mat dimensions)
- Heading: `0° = east`, `90° = south (down)`, `-90° = north (up)`
- Robot starts at `(350mm, 980mm)`, heading `-90°` (facing up, in the home area)
- Canvas Y increases downward — this inverts the standard turning formula:
  `heading -= (rightDist - leftDist) / TRACK_W × (180/π)`  ← note the minus sign
- Drawing offset: `ctx.rotate((heading + 90) * π/180)` — the `+90` aligns the robot body (drawn pointing local-up) with the heading convention

### Key files

**`js/simulator.js`** — `RobotSimulator` class. The physics live in `_animateTank(leftV, rightV, refDistMM)`: normalized velocities (`-1..1`), reference distance is what the *faster* wheel travels. `_amountToMM()` converts `degrees/rotations/cm/inches` to mm. `_execCmd()` dispatches the command queue.

**`py/spike_bridge.py`** — Entire Spike Prime v3 API as MicroPython classes. Loaded via `<script type="mpy" src="py/spike_bridge.py">`. Calls `window.onPyReady()` on load to unlock the Run button. No `import traceback` — MicroPython doesn't include it; errors show `ExcType: message` only.

**`js/autocomplete.js`** — CodeMirror 5 hint function (`window.spikeHint`). Dot-completion resolves multi-level paths (`hub.light_matrix` → its methods). Triggered automatically on `.` and manually on `Ctrl+Space`.

**`js/blockly_config.js`** — Custom block definitions (`SPIKE_BLOCKS`) and JS code generators (`registerGenerators`). Turn arc formula: `(deg/360) × π × 112` (half track-width circumference). Steering: `lv = speed × (1 + steering)`, `rv = speed × (1 - steering)`. Uses `Blockly.utils.xml.textToDom` — not `Blockly.Xml.textToDom`, which was removed in Blockly 10.

### Steering convention

`steering > 0` = right turn = left wheel faster:
- `leftV  = spd × (1 + steer)`
- `rightV = spd × (1 - steer)`

This is consistent across `_execCmd('move')`, `blockly_config.js` generators, and `js/autocomplete.js` member tables.

## Extending the API

To add a new Spike Prime API method:

1. Add the method to the appropriate class in `py/spike_bridge.py` — either push a command dict onto `_cmds` or call back into JS via `window.getXxx()`
2. If it's a new command type, add a `case` in `_execCmd()` in `js/simulator.js`
3. Add the method name to the relevant entry in `SPIKE_MEMBERS` in `js/autocomplete.js`

To add a new Blockly block:

1. Add a JSON block definition to `SPIKE_BLOCKS` in `js/blockly_config.js`
2. Add a generator function in `registerGenerators()` that returns an `await window.sim._animateTank(...)` string
3. Add the block to the appropriate category in `TOOLBOX_XML`
