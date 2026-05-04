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

Python runs in a **Web Worker** (via `<script type="mpy" worker>`). Main thread and worker communicate via plain `postMessage`, with one round-trip per Spike API call. Animation happens in real-time as commands arrive, not post-hoc.

1. Page load → PyScript boots MicroPython worker
2. Worker injects a small JS shim into its globalThis (`bridgeSend`, `signalReady`, `signalDone`, `signalError`) and sends `{type:'ready'}` → Run button unlocks
3. User clicks Run → main sends `{type:'run', code}` to the worker
4. Worker `exec`s the user script. Every API call returns a `_PromiseAwaitable` whose `_inner()` does `await js.bridgeSend(json.dumps(cmd))`:
   - `bridgeSend` posts `{type:'cmd', id, cmd}` to main and returns a Promise
   - Main's worker listener calls `await sim.executeCommand(cmd)` and posts `{type:'cmd_result', id, result}` back
   - The shim resolves the pending Promise with the JSON; the awaiting Python coroutine resumes and updates `_state`
5. After the user coroutine finishes, the worker calls `js.signalDone()` (or `js.signalError(msg)` on exception)

`js.bridgeSend(...)` is a JS function (not `js.postMessage` from Python) — this dodges polyscript's RPC interception that would otherwise raise a `runEvent` console error on every reply.

### Why no SharedArrayBuffer?

An earlier iteration used SAB + `Atomics.wait` for synchronous Python-side blocking. It worked but required cross-origin isolation (`coi-serviceworker.min.js`, COOP/COEP headers) and per-byte `Atomics.store` workarounds for MicroPython's TypedArray quirks. The postMessage model achieves the same observable behavior — Python pauses on each `await` until animation finishes — without any of that overhead.

### Data flow

```
py/spike_bridge.py  →  self.postMessage  →  worker.onmessage in main.js
  _bridge_call()      {type:'cmd',id,cmd}    sim.executeCommand(cmd)
  await Promise   ←   {type:'cmd_result'}  ←  _execCmd → _animateTank
```

Blockly bypasses the worker entirely — generated JS calls `window.sim._animateTank()` directly via `AsyncFunction`. This is why `sim.isRunning = true` must be set before Blockly code runs (`js/main.js:runBlockly()`).

### Coordinate system

- Field: 2362 × 1143 mm (actual FLL mat dimensions)
- Heading: `0° = east`, `90° = south (down)`, `-90° = north (up)`
- Robot starts at `(350mm, 980mm)`, heading `-90°` (facing up, in the home area)
- Canvas Y increases downward — this inverts the standard turning formula:
  `heading -= (rightDist - leftDist) / TRACK_W × (180/π)`  ← note the minus sign
- Drawing offset: `ctx.rotate((heading + 90) * π/180)` — the `+90` aligns the robot body (drawn pointing local-up) with the heading convention

### Key files

**`js/simulator.js`** — `RobotSimulator` class. The physics live in `_animateTank(leftV, rightV, refDistMM)`: normalized velocities (`-1..1`), reference distance is what the *faster* wheel travels. `_amountToMM()` converts `degrees/rotations/cm/inches` to mm. `_execCmd()` dispatches the command queue.

**`py/spike_bridge.py`** — Entire Spike Prime v3 API as MicroPython classes. Loaded via `<script type="mpy" worker src="py/spike_bridge.py">`. Each API call returns the coroutine produced by `_await_and_update(js.bridgeSend(...))` — user code must `await` motion calls for sensor state to stay in sync with animation. `runloop.run(coro)` stores the user coroutine; `_handle_run` (driven by `asyncio.create_task` from the `'run'` message handler) awaits it. No `import traceback` — MicroPython doesn't include it; errors surface as `ExcType: message`.

**`js/autocomplete.js`** — CodeMirror 5 hint function (`window.spikeHint`). Dot-completion resolves multi-level paths (`hub.light_matrix` → its methods). Triggered automatically on `.` and manually on `Ctrl+Space`.

**`js/blockly_config.js`** — Custom block definitions (`SPIKE_BLOCKS`) and JS code generators (`registerGenerators`). Turn arc formula: `(deg/360) × π × 112` (half track-width circumference). Steering: `lv = speed × (1 + steering)`, `rv = speed × (1 - steering)`. Uses `Blockly.utils.xml.textToDom` — not `Blockly.Xml.textToDom`, which was removed in Blockly 10.

### Steering convention

`steering > 0` = right turn = left wheel faster:
- `leftV  = spd × (1 + steer)`
- `rightV = spd × (1 - steer)`

This is consistent across `_execCmd('move')`, `blockly_config.js` generators, and `js/autocomplete.js` member tables.

## Extending the API

To add a new Spike Prime API method:

1. Add the method to the appropriate class in `py/spike_bridge.py` — `return _bridge_call({'type': 'your_type', ...})`
2. If it's a new command type, add a `case` in `_execCmd()` in `js/simulator.js`
3. Add the method name to the relevant entry in `SPIKE_MEMBERS` in `js/autocomplete.js`

To add a new Blockly block:

1. Add a JSON block definition to `SPIKE_BLOCKS` in `js/blockly_config.js`
2. Add a generator function in `registerGenerators()` that returns an `await window.sim._animateTank(...)` string
3. Add the block to the appropriate category in `TOOLBOX_XML`
