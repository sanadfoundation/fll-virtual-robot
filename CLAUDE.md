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

Python runs in a **Web Worker** (via `<script type="mpy" worker>`). The main thread and Python communicate through a **SharedArrayBuffer** (SAB) with **Atomics** for synchronization. Animation happens in real-time as commands arrive, not post-hoc.

1. Page load → PyScript boots MicroPython worker, worker sends `{type:'ready'}`
2. Main thread creates a 5132-byte SAB, calls `sim.setupSAB(sab)`, and sends `{type:'sab', sab}` to the worker
3. Worker calls `_init_bridge(sab)` → does an initial `read_sensors` round-trip to populate `_state`
4. Worker sends `{type:'ready_ack'}` → Run button unlocks
5. User clicks Run → main thread sends `{type:'run', code}` to the worker
6. Worker `exec`s the user script; every API call invokes `_bridge_call(cmd)`:
   - Writes JSON bytes to SAB offset 12 via `Atomics.store` (one byte at a time)
   - Sets `flagView[1] = cmdLen`, then `flagView[0] = 1`, then `Atomics.notify`
   - Blocks with `Atomics.wait(flagView, 0, 1)` until main thread resets the flag
7. Main thread's `_commandLoop()` wakes via `Atomics.waitAsync`, copies SAB bytes to a plain `Uint8Array` (TextDecoder rejects SAB-backed views), parses and executes the command, writes the sensor-state result back to SAB offset 4108, then stores `flagView[0] = 0` and notifies the worker
8. Worker reads the result, updates `_state`, and continues

Sensor reads return live simulator state at the moment of the `_bridge_call` round-trip, which is during script execution — in sync with animation.

### SAB layout (5132 bytes)

| Offset | Size | Content |
|--------|------|---------|
| 0–11 | 12 B | Int32 header: `[flag, cmd_len, result_len]` |
| 12–4107 | 4096 B | Command JSON (UTF-8) |
| 4108–5131 | 1024 B | Result JSON (UTF-8) |

### Data flow

```
py/spike_bridge.py  →  SAB (Atomics)  →  js/simulator.js _commandLoop()
  _bridge_call()           ↕                └── _execCmd() → _animateTank()
  Atomics.wait()      flagView[0]             Atomics.notify → unblocks worker
```

Blockly bypasses the SAB entirely — generated JS calls `window.sim._animateTank()` directly via `AsyncFunction`. This is why `sim.isRunning = true` must be set before Blockly code runs (`js/main.js:runBlockly()`).

### Cross-origin isolation

`SharedArrayBuffer` requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. `coi-serviceworker.min.js` (loaded first in `index.html`) injects these headers via a Service Worker and reloads the page once when needed.

### Coordinate system

- Field: 2362 × 1143 mm (actual FLL mat dimensions)
- Heading: `0° = east`, `90° = south (down)`, `-90° = north (up)`
- Robot starts at `(350mm, 980mm)`, heading `-90°` (facing up, in the home area)
- Canvas Y increases downward — this inverts the standard turning formula:
  `heading -= (rightDist - leftDist) / TRACK_W × (180/π)`  ← note the minus sign
- Drawing offset: `ctx.rotate((heading + 90) * π/180)` — the `+90` aligns the robot body (drawn pointing local-up) with the heading convention

### Key files

**`js/simulator.js`** — `RobotSimulator` class. The physics live in `_animateTank(leftV, rightV, refDistMM)`: normalized velocities (`-1..1`), reference distance is what the *faster* wheel travels. `_amountToMM()` converts `degrees/rotations/cm/inches` to mm. `_execCmd()` dispatches the command queue.

**`py/spike_bridge.py`** — Entire Spike Prime v3 API as MicroPython classes. Loaded via `<script type="mpy" worker src="py/spike_bridge.py">`. Every API call invokes `_bridge_call(cmd)` which communicates over the SAB. No `import traceback` — MicroPython doesn't include it; errors surface as `ExcType: message`.

**`js/autocomplete.js`** — CodeMirror 5 hint function (`window.spikeHint`). Dot-completion resolves multi-level paths (`hub.light_matrix` → its methods). Triggered automatically on `.` and manually on `Ctrl+Space`.

**`js/blockly_config.js`** — Custom block definitions (`SPIKE_BLOCKS`) and JS code generators (`registerGenerators`). Turn arc formula: `(deg/360) × π × 112` (half track-width circumference). Steering: `lv = speed × (1 + steering)`, `rv = speed × (1 - steering)`. Uses `Blockly.utils.xml.textToDom` — not `Blockly.Xml.textToDom`, which was removed in Blockly 10.

### Steering convention

`steering > 0` = right turn = left wheel faster:
- `leftV  = spd × (1 + steer)`
- `rightV = spd × (1 - steer)`

This is consistent across `_execCmd('move')`, `blockly_config.js` generators, and `js/autocomplete.js` member tables.

## Extending the API

To add a new Spike Prime API method:

1. Add the method to the appropriate class in `py/spike_bridge.py` — call `_bridge_call({'type': 'your_type', ...})` and return `_Awaitable()`
2. If it's a new command type, add a `case` in `_execCmd()` in `js/simulator.js`
3. Add the method name to the relevant entry in `SPIKE_MEMBERS` in `js/autocomplete.js`

To add a new Blockly block:

1. Add a JSON block definition to `SPIKE_BLOCKS` in `js/blockly_config.js`
2. Add a generator function in `registerGenerators()` that returns an `await window.sim._animateTank(...)` string
3. Add the block to the appropriate category in `TOOLBOX_XML`
