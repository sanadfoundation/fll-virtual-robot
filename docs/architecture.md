# Architecture

## Execution paths

**Python path:** user code runs in a PyScript worker → `js.bridgeSend(...)` → `_execCmd()` in `js/simulator.js`.
Never use `js.postMessage()` — Polyscript intercepts it and fires `runEvent` errors on every reply.

**Blockly path:** generators emit JS that calls `window.sim` directly via `AsyncFunction` — no worker, no postMessage round-trip. `sim.isRunning = true` must be set before Blockly code runs (`js/main.js:runBlockly`).

**No SharedArrayBuffer / `Atomics.wait` / COOP-COEP** — that path was tried and abandoned. The postMessage round-trip is the design.

## Key files

| File | Purpose |
|------|---------|
| `py/spike_bridge.py` | Spike Prime v3 API as MicroPython classes. Each call must be `await`ed for sensor state to track animation. |
| `js/simulator.js` | `RobotSimulator`. Physics in `_animateTank`; `_execCmd()` dispatches commands. |
| `js/blockly_config.js` | `SPIKE_BLOCKS` definitions + `registerGenerators()`. |
| `js/monaco_config.js` | Monaco completions/hover. `SPIKE_API` table is the source of truth for docstrings and signatures. |
| `js/main.js` | App bootstrap, `runBlockly()`, project-type routing. |
| `js/llsp3_blocks.js` | LLSP3 (Spike app file) round-trip import/export for Blockly. |
