# CLAUDE.md

## Development

```bash
python3 -m http.server 8787   # PyScript needs HTTP, not file://
```

No build step, no package manager. Dependencies load from CDN.

## Constraints (things you'd otherwise get wrong)

- **Don't reintroduce SharedArrayBuffer / `Atomics.wait` / COOP-COEP.** That path was tried and abandoned. The current postMessage round-trip is the design.
- **Python → JS must use `js.bridgeSend(...)`, not `js.postMessage(...)`.** Polyscript intercepts the latter and fires `runEvent` errors on every reply.
- **Blockly bypasses the worker.** Generators emit JS that calls into `window.sim` directly via `AsyncFunction` (no postMessage round-trip). Pair-based motion (move/steer/startMove/startSteer) routes through `_runPairMotion`; single-motor blocks through `_animateSingleMotor`; stop blocks through `_motorStopAndAwait` / `_pairStopAndAwait`. Set `sim.isRunning = true` before Blockly code runs (`js/main.js:runBlockly`).
- **Don't call `_animateTank` from Blockly generators — use `_runPairMotion`.** Direct `_animateTank` calls skip `_runMotion`, leaving the sticky `_motionAborted` flag from a prior stop set true and aborting the new motion on iteration zero. They also don't refresh `_activeMotion`, so the off-side wheel's encoder doesn't accumulate. `_runPairMotion(leftPort, rightPort, leftV, rightV, distMM)` wraps `_animateTank` in `_runMotion` with a proper pair descriptor and is the only correct entry point for pair-based Blockly motion. Stop blocks must use `_motorStopAndAwait(port)` / `_pairStopAndAwait()` so the program waits for an in-flight fire-and-forget motion (e.g. "start motor") to fully unwind before the next block runs. Issue #47 was the canonical failure mode.
- **`light_matrix.write` mirrors to the Console panel — don't add a "print" block.** `_showText()` in `js/simulator.js` calls `window.appendOutput(s)` so Blockly users get a `print`-style debug surface via the existing block. A separate sim-only print block was rejected: every Blockly block must map to a real LEGO/Scratch opcode for LLSP3 round-trip, and there is no LEGO console opcode. Both paths (Python `_execCmd hub_display` and the Blockly generator's direct `sim._showText(...)`) flow through `_showText`, so the mirror covers both with one line.
- **`port.A..F = 0..5` (int, matches docs).** `_port_id()` in the bridge translates ints or `'A'..'F'` strings to wire letters. The simulator's `pairMap` and `motors` state are keyed on `'A'..'F'` strings; Blockly generators emit those same strings. Don't unify these — the boundary translation is intentional.
- **Steering: `> 0` is a right turn = left wheel faster.** `lv = spd × (1 + steer)`, `rv = spd × (1 - steer)`. Same convention in `_execCmd('move')`, Blockly generators, and the `motor_pair.move` docstring.
- **Internal coords are math y-up.** Origin bottom-left, y increases upward, headings are math (CCW positive). Canvas rendering converts math → canvas at the boundary in `_drawField`, `_drawRobot`, `_drawTrail` family, `_drawRuler`, `_handleHover` (`canvasY = FIELD_H_MM - mathY` for points/lines/circles; `(FIELD_H_MM - y - h)` for rectangle top-left). `_animateTank` and `_sensorPosition` are convention-agnostic — don't introduce flips there.
- **Blockly 10 API:** `Blockly.utils.xml.textToDom` (the old `Blockly.Xml.textToDom` was removed).
- **MicroPython has no `traceback` module.** Errors surface as `ExcType: message`.
- **A project is single-mode (Python or Blocks), chosen at creation and never switched.** `localStorage.fll-vr-project-type` is the source of truth; `switchMode(mode)` is a view-update + persist helper, not a user-facing toggle. The header carries a static `#project-type-badge`, not the old Blocks/Python tabs. Creating a Python project clears only `fll-vr-python-code`; creating a Blocks project clears only `fll-vr-blockly-xml`. The 📄 New button is a split-button dropdown — the popover is wired in `index.html` (open/close IIFE) and each menu item is wired in `js/main.js` to `handleNewProject(type)`. Legacy `fll-vr-tab` is migrated once at bootstrap via `migrateLegacyTabKey()` and then deleted.
- **My Blocks are 5 opcodes, not 1.** `myblocks_definition` (hat) + `myblocks_call` (stack) + `myblocks_arg_string_number` / `_arg_boolean` (body reporters) live in our Blockly model. At LLSP3 export they expand into Scratch's 5 opcodes — `procedures_definition`, shadow `procedures_prototype` (carries the `proccode` mutation), `procedures_call`, and the two `argument_reporter_*` — matching the real Spike app's encoding for round-trip. `js/myblocks_proccode.js` parses/emits the `"rotate %s %b my function"` template; `js/llsp3_blocks.js` handles the bidirectional mapping.
- **Definition↔call binding is by `procId` (UUID), not by name.** Renaming labels doesn't orphan call sites. Body reporters bind to defs by `argId` internally but degrade to by-name lookup at LLSP3 round-trip (Scratch only carries names on body reporters). Both indices are rebuilt at import time.
- **`myblocks_definition` is in `_SELF_REGISTERING_TOP_TYPES`.** Its generator emits `async function name(args) { body }` at top scope — must NOT be wrapped in `_hats.push(...)` or call sites can't reach it.
- **Click an arg pill on the definition hat to spawn a body reporter.** `FieldArgPillSpawn` (subclass of `FieldLabelSerializable`) overrides `showEditor_` to mint a `myblocks_arg_*` block at the click coordinates via `screenToWorkspace` + `getInverseScreenCTM()`. This is our drag-from-hat replacement — same destination, one click instead of one continuous gesture. Avoids `Blockly.Gesture` / `Blockly.Touch` internals which aren't a stable public surface.

## Field

2362 × 1143 mm. Origin bottom-left (math y-up). Robot spawn `(350, 163)` heading `90°` (north). Heading: `0° = east`, `90° = north`, `180° = west`, `270° = south`.

## Hardware spec reference (LEGO SPIKE Prime tech specs)

Source-of-truth numbers for what we simulate. When a Monaco/Python docstring claims a hardware fact, it should match this list (sources cited inline in `py/spike_bridge.py` and `js/monaco_config.js`).

- **Technic Angular Motor** — encoder 360 counts/rev (1°), accuracy ±3°, 100 Hz update. No-load 185 RPM Medium / 175 RPM Large (≈1110 / 1050 deg/sec). Rated (max-efficiency) 135 RPM ≈ 810 deg/sec @ 3.5 Ncm (M) / 8 Ncm (L). Stall torque 18 Ncm (M) / 25 Ncm (L). 7.2 V reference supply.
- **Technic Large Hub** — 6 LPF2 ports A–F (E/F "high-speed"); 5×5 white LED matrix, 10-step per-LED dimming; six-axis IMU (3-axis accel + 3-axis gyro), gestures (tap, double-tap, shake, free-fall); speaker 12-bit / 16 kHz mono; BT 4.2 Classic + BLE; 100 MHz Cortex-M4, 320 KB RAM, 1 MB flash, 32 MB storage; 88 × 56 × 32 mm, 63 g.
- **Technic Color Sensor** — 100 Hz; optimal reading distance 16 mm; reflectivity 0–100; ambient light 0–100; hardware reliably distinguishes 8 LEGO-named colors (white, blue, black, green, yellow, red, medium azur, bright reddish violet) — the API surfaces the 12 `color.*` constants via classification. 3× 4000 K white LEDs, 0–100% in 1% increments, exclusive with sensing.
- **Technic Distance Sensor** — ultrasonic; 100 Hz; range 50–2000 mm ±20 mm, 1 mm resolution; fast-distance 50–300 mm ±15 mm; entrance angle ±35°. **50 mm blind zone — below that the sensor returns no object.** 4× 4000 K white LED segments around the eyes, 0–100% in 1% increments.
- **Technic Force Sensor** — 100 Hz (internal force-filter / peak runs at 1 kHz). Touch: 0.5–1.0 N activation, depth 0–2 mm, binary output. Tap: 0–3 (single / quick / press-and-hold). Force: 2.5–10 N range (saturates at 10), 0.1 N steps, ±0.65 N accuracy, depth 2–8 mm.

**Linear-speed model.** `MM_PER_MS_100` in `js/simulator.js` (and `_MM_PER_MS_AT_100` in `js/blockly_config.js`) is `π × WHEEL_DIA_MM / 360` so that a velocity command of 1000 deg/sec yields physically-honest linear motion. Don't replace the derivation with a hard-coded number — it has to track wheel diameter.

**Wheel-diameter assumption.** Default `WHEEL_DIA_MM = 56` (Spike "small" / Technic 56×28 mm, LEGO part 32019). The kit also ships an 88×26 mm balloon wheel (part 49295) — if the team's robot uses that, set `WHEEL_DIA_MM = 88, WHEEL_WIDTH_MM = 26` in `js/simulator.js` AND `_WHEEL_DIA_MM = 88` in `js/blockly_config.js`. Everything downstream (linear speed, deg↔mm conversions, the wheel visual at `_drawRobot`, the Blockly `_moveRotMM` preamble) derives from those constants. With 88 mm wheels the model's full-speed linear motion becomes ~768 mm/s instead of ~488 mm/s, matching the Large motor's no-load cap of 806 mm/s.

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
2. Add a generator in `registerGenerators()`. Pair-based motion: `await window.sim._runPairMotion(_movePairL, _movePairR, leftV, rightV, distMM)`. Single motor: `await window.sim._animateSingleMotor(port, velocity, distMM)`. Stops: `await window.sim._motorStopAndAwait(port)` or `_pairStopAndAwait()`.
3. Place the block in the appropriate `TOOLBOX_XML` category.

## My Blocks (Scratch procedures)

- `js/myblocks_proccode.js` — proccode↔argspec parser/emitter (pure, Node-testable).
- `js/myblocks_blocks.js` — 4 Blockly block defs (definition, call, 2 arg reporters) + `applyArgspecToDefinition`/`applyArgspecToCall` UI builders + `syncCallsToDefinition` for live mutator sync.
- `js/myblocks_modal.js` — `createModalState()` (pure controller) + `openMyBlocksModal(Blockly)` (DOM shell, returns a Promise of `{procId, argspec}` or null).
- `css/myblocks.css` — modal styling matching SPIKE's `.my-blocks` palette/sizes.
- `_registerSpikeMyBlocksFlyout(Blockly, workspace)` (in `blockly_config.js`) — the `MY_BLOCKS` toolbox category callback + `CREATE_SPIKE_MYBLOCK` button → opens modal → instantiates definition on workspace.
- Round-trip mapping lives in `js/llsp3_blocks.js` (`buildMyBlocks*`, `emitMyBlocks*`, plus `findProtoFor` / `argspecFromProto` / `buildProccodeIndex`).
- Tests in `tests/js/myblocks/` (pure helpers, generators, modal state, flyout callback) and `tests/js/llsp3/myblocks.test.js` (round-trip against `tests/fixtures/llsp3/myblocks-project.llsp3`).
