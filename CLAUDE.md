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

## My Blocks (Scratch procedures)

- `js/myblocks_proccode.js` — proccode↔argspec parser/emitter (pure, Node-testable).
- `js/myblocks_blocks.js` — 4 Blockly block defs (definition, call, 2 arg reporters) + `applyArgspecToDefinition`/`applyArgspecToCall` UI builders + `syncCallsToDefinition` for live mutator sync.
- `js/myblocks_modal.js` — `createModalState()` (pure controller) + `openMyBlocksModal(Blockly)` (DOM shell, returns a Promise of `{procId, argspec}` or null).
- `css/myblocks.css` — modal styling matching SPIKE's `.my-blocks` palette/sizes.
- `_registerSpikeMyBlocksFlyout(Blockly, workspace)` (in `blockly_config.js`) — the `MY_BLOCKS` toolbox category callback + `CREATE_SPIKE_MYBLOCK` button → opens modal → instantiates definition on workspace.
- Round-trip mapping lives in `js/llsp3_blocks.js` (`buildMyBlocks*`, `emitMyBlocks*`, plus `findProtoFor` / `argspecFromProto` / `buildProccodeIndex`).
- Tests in `tests/js/myblocks/` (pure helpers, generators, modal state, flyout callback) and `tests/js/llsp3/myblocks.test.js` (round-trip against `tests/fixtures/llsp3/myblocks-project.llsp3`).
