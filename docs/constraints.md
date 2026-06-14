# Constraints

Things that silently break when you get them wrong.

## Motion

- **Blockly pair-motion entry point:** always use `_runPairMotion(leftPort, rightPort, leftV, rightV, distMM)` — never `_animateTank` directly. Direct calls leave `_motionAborted` stuck and skip `_activeMotion` updates, aborting new motion on iteration zero.
- **Stop blocks:** use `_motorStopAndAwait(port)` / `_pairStopAndAwait()` so the program waits for any in-flight fire-and-forget motion to fully unwind before the next block runs.

## Coordinates

- **Internal coords are math y-up.** Origin bottom-left, y increases upward, headings CCW-positive. Canvas rendering flips at draw boundaries (`_drawField`, `_drawRobot`, `_drawTrail`, `_drawRuler`, `_handleHover`) — don't introduce flips inside physics or sensor code.

## Ports and API

- **Ports: `port.A..F = 0..5` (int).** `_port_id()` translates ints or `'A'..'F'` strings to wire letters. Simulator state (`pairMap`, `motors`) is keyed on `'A'..'F'` strings; Blockly generators emit those same strings. The boundary translation is intentional — don't unify.
- **Python → JS must use `js.bridgeSend(...)`, not `js.postMessage(...)`.** Polyscript intercepts the latter and fires `runEvent` errors on every reply.

## Project model

- **Single-mode projects:** Python or Blocks, chosen at creation, never switched. `localStorage.fll-vr-project-type` is the source of truth; `switchMode(mode)` is a view-update + persist helper, not a user-facing toggle.

## MicroPython

- **No `traceback` module.** Errors surface as `ExcType: message`.

## Blockly

- **Blockly 10 API:** use `Blockly.utils.xml.textToDom` — the old `Blockly.Xml.textToDom` was removed.
- **`light_matrix.write` mirrors to Console** via `_showText()` — don't add a separate print block; every Blockly block must map to a real LEGO/Scratch opcode, and there is no LEGO console opcode.

## Physics constants

- **`MM_PER_MS_100` = `π × WHEEL_DIA_MM / 360`.** Don't replace with a hardcoded number — it must track wheel diameter so velocity commands produce physically honest linear motion.
