# CLAUDE.md

## Development

```bash
python3 -m http.server 8787   # PyScript needs HTTP, not file://
```

No build step, no package manager. Dependencies load from CDN.

## Constraints (things you'd otherwise get wrong)

- **Don't reintroduce SharedArrayBuffer / `Atomics.wait` / COOP-COEP.** That path was tried and abandoned. The current postMessage round-trip is the design.
- **Python → JS must use `js.bridgeSend(...)`, not `js.postMessage(...)`.** Polyscript intercepts the latter and fires `runEvent` errors on every reply.
- **Blockly bypasses the worker.** Generators emit JS that calls `window.sim._animateTank` / `_animateSingleMotor` directly via `AsyncFunction`. Set `sim.isRunning = true` before Blockly code runs (`js/main.js:runBlockly`).
- **`port.A..F = 0..5` (int, matches docs).** `_port_id()` in the bridge translates ints or `'A'..'F'` strings to wire letters. The simulator's `pairMap` and `motors` state are keyed on `'A'..'F'` strings; Blockly generators emit those same strings. Don't unify these — the boundary translation is intentional.
- **Steering: `> 0` is a right turn = left wheel faster.** `lv = spd × (1 + steer)`, `rv = spd × (1 - steer)`. Same convention in `_execCmd('move')`, Blockly generators, and the `motor_pair.move` docstring.
- **Canvas Y increases downward**, so `_animateTank` has a sign flip on the heading update. Don't "fix" it.
- **Blockly 10 API:** `Blockly.utils.xml.textToDom` (the old `Blockly.Xml.textToDom` was removed).
- **MicroPython has no `traceback` module.** Errors surface as `ExcType: message`.

## Field

2362 × 1143 mm. Robot spawn `(350, 980)` heading `-90°` (north). Heading: `0° = east`, `90° = south`.

## Key files

- `py/spike_bridge.py` — Spike Prime v3 API as MicroPython classes. Each call returns the coroutine from `_await_and_update(js.bridgeSend(...))`; user code must `await` for sensor state to track animation.
- `js/simulator.js` — `RobotSimulator`. Physics in `_animateTank(leftV, rightV, refDistMM)` (normalized `-1..1` velocities, ref distance = the faster wheel). `_execCmd()` dispatches commands.
- `js/monaco_config.js` — Monaco language services. The `SPIKE_API` table (members + constants) feeds completion / signature help / hover.
- `js/blockly_config.js` — `SPIKE_BLOCKS` definitions + `registerGenerators()`. Turn arc formula: `(deg/360) × π × 112` (half track-width circumference).

## Adding a Spike API method

1. Add the method to the right class in `py/spike_bridge.py`, returning `_bridge_call({'type': 'your_type', ...})`.
2. If it's a new command type, add a `case` in `_execCmd()` (`js/simulator.js`).
3. Add an entry to `SPIKE_API` (`js/monaco_config.js`) with `sig`, `doc`, `params`.

## Adding a Blockly block

1. Add a JSON definition to `SPIKE_BLOCKS`.
2. Add a generator in `registerGenerators()` returning `await window.sim._animateTank(...)` (or `_animateSingleMotor`).
3. Place the block in the appropriate `TOOLBOX_XML` category.
