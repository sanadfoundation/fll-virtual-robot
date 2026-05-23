# light_matrix.write → Console mirror

## Problem

Blockly students have no fast way to inspect program state at runtime. Python
users already get `print()` for free (the bridge overrides `builtins.print` and
forwards to the Console panel — `py/spike_bridge.py:580-588`), but switching to
the Python tab to debug a Blockly program is a non-starter pedagogically.

The Blockly toolbox cannot grow a new "print" block without distorting the
LLSP3 export format: every block in the toolbox maps to a real Spike/Scratch
opcode (`flippermotor_*`, `flipperlight_*`, `control_*`, `operator_*`), and
LEGO has no "print to console" opcode because real Spike hubs have no console.
A simulator-only block would either fail to round-trip through `.llsp3` or
silently change semantics between sim and hub — both unacceptable.

## Solution

Mirror every `light_matrix.write(text)` call to the Console panel as a side
effect of the existing matrix-rendering path. No new blocks, no LLSP3 changes,
no Python bridge changes.

Students use the existing `light_matrix.write` block (Blockly) or method
(Python) as their print. In the simulator the text appears instantly in the
Console panel; the 5×5 matrix still renders the first character of the string
(today's behaviour). On a real hub the same LLSP3 still scrolls the full text
across the matrix — `light_matrix.write` is what real Spike students use to
display status anyway, so behaviour parity is preserved at the LEGO API level.

The change lives in one function: `_showText(text)` in `js/simulator.js`. Both
code paths reach it — the Python path via `_execCmd({type: 'hub_display', ...})`
at `js/simulator.js:1237-1240`, and the Blockly path via the generator emitting
`window.sim._showText(...)` at `js/blockly_config.js:1363-1366`. Adding the
mirror inside `_showText` covers both paths with a single edit.

## Behaviour

| Scenario                                              | Console panel      | 5×5 matrix          |
| ----------------------------------------------------- | ------------------ | ------------------- |
| Python `light_matrix.write("speed=42")`               | `speed=42`         | `S` (first glyph)   |
| Blockly `light_matrix.write` block, text `"speed=42"` | `speed=42`         | `S` (first glyph)   |
| Python `light_matrix.write("")`                       | empty line         | blank               |
| Python `light_matrix.write(42)` (numeric arg)         | `42`               | `4` (first glyph)   |
| Python `print("speed=42")` (unchanged today)          | `speed=42`         | unchanged           |

Tight-loop debugging works in the simulator because the sim's `_showText`
returns instantly — it does not replicate the real hub's 500 ms-per-character
scroll. On a real hub the same loop would crawl. That asymmetry is real but
acceptable: the sim is faster than the hub, never slower or behaviourally
different at the API level, and the student would discover the hub timing
issue the first time they deploy.

## Implementation

Inside `_showText(text)` (`js/simulator.js:1669`), at the top, after the
`const s = String(text || '')` line:

```js
if (typeof window !== 'undefined' && typeof window.appendOutput === 'function') {
  window.appendOutput(s);
}
```

The guard mirrors existing defensive patterns used elsewhere in `simulator.js`
and is necessary so the Node-side JS test harness (which loads `simulator.js`
without a DOM) does not crash. The test mocks at `tests/js/mocks/window.js:12`
and `tests/js/mocks/main-env.js:99` already stub `appendOutput: () => {}`, so
test runs will exercise the call path harmlessly.

No prefix tag (e.g. `[matrix]`) is added. Bracketed prefixes in this Console
are reserved for system events (`[Run]`, `[Done]`, `[Error]`, `[!]`); user
output (Python `print()` today, `light_matrix.write` after this change) is
unprefixed. This keeps `light_matrix.write` visually indistinguishable from
`print()` output, reinforcing the mental model that this is the student's
debugging surface.

## Testing

- **`tests/js/commands/hub-display-glyphs.test.js`** — add a new test:
  `hub_display: write("hello") also calls window.appendOutput("hello")`.
  Spy on `appendOutput`, dispatch `_execCmd({type: 'hub_display', text: 'hello'})`,
  assert spy received `"hello"`. Verifies the Python path.
- **New test file `tests/js/commands/hub-display-console.test.js`** — direct
  test of `sim._showText('hello')` calling `window.appendOutput('hello')`.
  Verifies the Blockly path.
- **`tests/py/test_hub.py`** — no change. The Python-side contract
  (`light_matrix.write(text)` sends `{type: 'hub_display', text: ...}`) is
  unchanged.
- **Manual UI smoke test** — `python3 -m http.server 8787`, open the app, run
  a Blockly program with a `light_matrix.write` block, confirm text appears
  in the Console panel and the first character lights up on the 5×5 chip.

## Non-goals

- **No new Blockly block.** That was option 2 in brainstorming, rejected to
  preserve LLSP3 round-trip integrity.
- **No live variable watch panel.** That was option 4 in brainstorming, set
  aside as a possible future addition orthogonal to this change.
- **No change to real-hub behaviour.** The LLSP3 export is byte-identical to
  today's; a real hub continues to scroll text on the 5×5 matrix exactly as
  before. The Console mirror is sim-only because no Console exists on the hub.
- **No change to Python `print()`.** It already mirrors to the Console via the
  bridge's `builtins.print` override (`py/spike_bridge.py:580-588`). This
  spec adds the second source — `light_matrix.write` — into the same panel.
