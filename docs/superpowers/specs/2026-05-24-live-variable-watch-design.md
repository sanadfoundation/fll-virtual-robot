# Live Variable Watch — Design

Date: 2026-05-24
Status: Draft for review
Branch: `feat/live-variable-watch`

## Problem

When kids run their program — Blockly or Python — they have no way to see what
their variables hold at any moment. The Console shows whatever they explicitly
`print` (or whatever `light_matrix.write` mirrors), but adding a print at every
interesting point is intrusive: it clutters the program and rots when the
program changes.

We want a real-time view of variable values that:

- **Updates while the program runs**, not just at the end.
- **Tracks variables automatically** — no "add to watch" step.
- **Stays out of the way** when there's nothing to show, and doesn't displace
  any of the existing always-visible status bands (Ports, Position, Console).
- **Works for both Blockly and Python** with one UI, so the experience is the
  same when a student moves between modes.

## Non-goals

- **No breakpoints, no stepping.** This is a watch panel, not a debugger.
- **No editing values at runtime.** Read-only.
- **No expression evaluation.** Only variables the program actually defines.
- **No history scrubber.** A short visual flash on change is enough; full
  time-series logging is a separate feature.
- **No persistence across runs.** The panel clears at the start of every run,
  same as the Console.

## How the two runtimes constrain the design

The Blockly and Python paths put user variables in opaque scopes:

- **Blockly** generates JS, hoists every workspace variable as `var v_<name>` in
  a preamble (`js/blockly_config.js:3657–3683`), then runs the whole thing as
  `new AsyncFunction(code)` in `runBlockly` (`js/main.js:330–342`). The
  AsyncFunction's local scope is sealed — outside code can't enumerate or read
  `v_x` once the function starts.
- **Python** runs in a Web Worker. User code is `exec(code, {})` where the
  globals dict is empty (`py/spike_bridge.py:762`). Locals inside `async def
  main()` are unreachable from outside without explicit hooks.

Reading state from outside is therefore not viable. We have to **capture
writes at the assignment site**, where we already control the codegen for
Blockly and the globals dict for Python.

## Recommended approach: capture at the set site

A single registry on the main window, `window._watch`, receives `(name, value)`
updates from both runtimes and renders them. The two runtimes feed the
registry through different mechanisms, but the surface area is identical.

### Blockly: instrument the three variable opcodes

The existing generators (`js/blockly_config.js:1918–1921`) become:

```js
js['data_variable']         = (b) => [_varNameOf(b), ORDER_ATOMIC];
js['data_setvariableto']    = (b) => {
  const name = _varNameOf(b);
  return `${name} = ${val(b,'VALUE','0')}; _watch.set('${_displayName(b)}', ${name});\n`;
};
js['data_changevariableby'] = (b) => {
  const name = _varNameOf(b);
  return `${name} = (Number(${name})||0) + (Number(${val(b,'VALUE','0')})||0); _watch.set('${_displayName(b)}', ${name});\n`;
};
```

`_displayName(b)` returns the unsanitized Scratch variable name (what the user
typed), so the watch panel shows `score` rather than `v_score`. The sanitized
form remains the JS identifier — it's the same lookup helper as `_varNameOf`,
just returning `v.name` directly.

The preamble (`js/blockly_config.js:3657–3661`) also emits one
`_watch.declare('<name>', 0);` per workspace variable. `declare` registers the
variable in the panel at value 0 but does **not** flash it, so the user sees
their full variable list the instant they hit Run, before any assignments
fire. (This matters because Blockly hoists vars at codegen time — without
`declare`, a variable that's only read, never written, would be invisible.)

`_watch` is a tiny helper attached to `window` by the watch panel module; the
generated AsyncFunction reads it via the captured `window._watch` reference at
the top of the preamble (`const _watch = window._watch;`).

### Python: wrap the globals dict

Replace `exec(code, {})` with a watching mapping. MicroPython's `exec` accepts
any object that implements the mapping protocol for globals, so a small class
suffices:

```python
class _WatchGlobals(dict):
    def __init__(self):
        super().__init__()
        self._baseline = set()           # filled after imports settle
        self._initialised = False
    def __setitem__(self, key, value):
        super().__setitem__(key, value)
        if self._initialised and self._is_user_var(key, value):
            _bridge_call({'type': 'var_update', 'name': key, 'value': _serialise(value)})
    def _is_user_var(self, key, value):
        if key.startswith('_'):                  return False
        if key in self._baseline:                return False
        if callable(value):                      return False
        if isinstance(value, type):              return False
        kind = type(value).__name__
        if kind in ('module',):                  return False
        return True
```

`_baseline` is seeded right before `exec` runs the user code, by walking
`__builtins__` plus any names already in the dict from the prelude (none, in
practice). Once `_initialised = True`, every assignment that isn't a function
def, class def, import, or `_`-prefixed name fires a `var_update`. Imports
inside user code (e.g. `import motor_pair`) still trip `__setitem__`, but
they're filtered out by the `module` type check.

`_serialise(value)` converts to a watch-safe form: numbers and bools pass
through; strings pass through (truncated by the panel, not here); tuples and
lists become JSON arrays of primitives, falling back to `repr()` for anything
that doesn't serialise cleanly.

`var_update` joins the existing command set in
`js/simulator.js:executeCommand`. The handler forwards to `window._watch.set`
and returns an empty result so the awaitable resolves immediately. (Unlike
motor commands, this one doesn't mutate sim state — it's a pass-through to UI.)

#### Function-local variables in Python

The natural FLL pattern is:

```python
async def main():
    count = 0
    while count < 5:
        count = count + 1
runloop.run(main())
```

`count` is a local of `main`, not a global, so `_WatchGlobals.__setitem__`
doesn't see it. Two options:

- **Accept this for v1.** Document that the watch panel shows top-level
  assignments only. Students who want to watch a value can hoist it to module
  scope with `global count` or write it as `_state['count'] = …`. This is the
  pragmatic call — Blockly users get full coverage, Python users get partial
  coverage, and the workaround is one line.

- **Trace-based capture.** Install `sys.settrace` to fire on `line` events and
  diff `frame.f_locals` against a snapshot. Works, but MicroPython's
  `settrace` is incomplete (no `frame.f_locals` writeback), and per-line
  overhead in a fast `while` loop would visibly slow simulations.

We go with **v1 accepts top-level only**, with a one-line tip in the panel
when it's empty and the program is Python: *"Top-level variables only —
assign to module scope to watch."*

## UI

### Placement

A floating card pinned to the top-right corner of the canvas viewport,
inside `.canvas-wrap`, with `position: absolute` so it overlays the field
rather than displacing the always-visible Ports / Position bands.

```
┌─────────────────────────────────────────────────────┐
│  Ports band (motors A/B, sensors C/D/E)             │
├─────────────────────────────────────────────────────┤
│                                          ┌────────┐ │
│                                          │ Watch  │ │
│           canvas                         ├────────┤ │
│                                          │ score  │ │
│                                          │   42   │ │
│                                          │        │ │
│                                          │ ready  │ │
│                                          │ true   │ │
│                                          └────────┘ │
├─────────────────────────────────────────────────────┤
│  Position band (X / Y / Heading / Yaw)              │
├─────────────────────────────────────────────────────┤
│  Console                                            │
└─────────────────────────────────────────────────────┘
```

Width ~160px, max-height 40% of the canvas (scrolls internally beyond that),
4px shadow, theme-aware background. Anchored top-right with 12px margin.
Draggable handle on its title bar so a student who'd rather have it elsewhere
can move it; position persists in localStorage (`fll-vr-watch-pos`).

### Behavior

- **Hidden by default** until a variable has been declared *or* set. The card
  fades in (`opacity 0 → 1` over 150ms) on first appearance and fades out when
  cleared. Zero-state = no card at all, no header taking up space.
- **One row per variable.** Sorted alphabetically by display name (the
  unsanitized Scratch name in Blockly, the Python identifier in Python).
- **Change flash:** when `set(name, value)` is called and the value differs
  from the current display, the row's background pulses (a 600ms ease-out
  highlight in the accent colour). No animation if the value didn't change —
  rapid no-op sets don't burn frames.
- **Numeric formatting:** integers as `42`, floats rounded to 3 dp (`3.142`,
  not `3.1415926…`), strings quoted (`"hello"`), booleans `true`/`false`,
  lists/tuples shown as `[a, b, c]` with truncation at 32 chars and full value
  in a `title` tooltip.
- **Clear on Run.** `handleRun` (`js/main.js:279`) calls `_watch.clear()` right
  after `clearOutput()`. The panel goes back to its hidden state until the new
  run's first declare/set.
- **Toggle.** A single button in the Settings popover — *Variables: shown /
  hidden* — lets a teacher hide the panel entirely for assessments. State in
  localStorage (`fll-vr-watch-enabled`). The default is **shown**.

### Throttling

Tight loops can fire `set()` thousands of times per second. The panel
schedules a render at most once per animation frame; intermediate `set` calls
update the in-memory registry but coalesce into a single repaint. Flash
animation deduplicates: if a row is already mid-flash, the timer resets
rather than stacking.

## Module layout

A single new file: `js/watch_panel.js`, loaded between `simulator.js` and
`blockly_config.js` so both can reference `window._watch`.

Exports on `window._watch`:

| Method | Use |
|---|---|
| `declare(name, value)` | Blockly preamble; registers a variable without flashing. Idempotent. |
| `set(name, value)` | Both runtimes; updates the row and triggers flash if value changed. |
| `clear()` | Called by `handleRun`; empties the registry and hides the card. |
| `enable(bool)` | Called by the Settings toggle. |

Internal state: a `Map<string, {value, lastChange}>` plus a list of
subscribers (currently one — the renderer). Renderer is a single
`requestAnimationFrame`-coalesced function.

Files touched at integration time:

- `index.html` — new `<script src="js/watch_panel.js"></script>` and a
  Settings popover row for the toggle, plus a positioned container div.
- `css/style.css` — `.watch-panel`, `.watch-row`, `.watch-row.flash`, theme
  tokens (`--watch-bg`, `--watch-accent`).
- `js/main.js` — `handleRun` calls `_watch.clear()`; init reads the toggle
  from localStorage.
- `js/blockly_config.js` — `data_setvariableto`, `data_changevariableby`,
  `data_variable` generators (set-site instrumentation); `generateBlocklyJS`
  preamble (add `_watch.declare` calls).
- `js/simulator.js` — new `case 'var_update':` in `executeCommand`, forwards
  to `_watch.set` and returns `{}`.
- `py/spike_bridge.py` — `_WatchGlobals` class, used in `_handle_run` instead
  of `{}`.

## Testing

The repo's existing test layout uses headless browser tests under `tests/`.
Add:

- **Unit (`tests/watch_panel.test.js`)** — `_watch.declare`, `_watch.set`,
  `_watch.clear`, render coalescing, flash decay timing, formatting edge
  cases (negative numbers, very long strings, tuples/lists, `null`).
- **Blockly integration** — build a workspace with a `data_setvariableto`
  inside a `control_repeat`, run the generated code, assert
  `_watch._snapshot()` matches expected sequence of values.
- **Python integration** — run a program that assigns `count = 0` then
  `count = count + 1` in a loop, intercept `var_update` commands at the
  worker boundary, assert the sequence.
- **UI smoke** — load the page, run a default program that uses a variable,
  assert the watch card is visible and contains the expected row. Hidden
  when no variables exist.

## Risks and mitigations

- **Generator-side leakage:** if `_watch.set` calls bypass the existing JS
  output ordering, students could see updates *after* an `await motor_pair…`
  resolves rather than at the assignment. Mitigation: emit the `_watch.set`
  on the same statement line as the assignment, never on a new awaited line.
- **Worker round-trip cost:** every Python assignment fires a `bridgeSend`,
  which is a `postMessage` round-trip. For typical FLL programs (variables
  set tens of times per run) this is negligible. Tight assignment loops
  could become measurable. Mitigation if it shows up: batch updates in
  Python using a 16ms-buffered list flushed on the next bridge call, at the
  cost of slight UI lag (deferred to a follow-up; v1 ships unbuffered).
- **Naming collisions:** `_watch` is a single underscore name. Could collide
  with user-defined `_watch` in Python. Mitigation: the wrapper is internal
  to the worker — user code never sees `_watch` as a globals key because the
  registry lives in `_WatchGlobals.__init__` as `self._baseline`, not as
  a globals entry. Blockly side uses `_watch` as a `const` captured in the
  preamble; the sanitizer maps every user variable to `v_<name>`, so a user
  variable literally named `_watch` would become `v__watch` and not collide.

## Out of scope (for follow-ups)

- Sparkline of recent values per row.
- Expand-on-click for collections — show indexed children.
- Pin / favourite a variable to keep it on top.
- Per-variable enable/disable from the panel (vs. global toggle).
- Export watch history as CSV alongside the existing console log.

## Open questions for review

- Default location top-right vs. inside the editor pane (left). Top-right keeps
  the editor uncluttered and lets students see variables while watching the
  robot move; left puts them next to the code that defines them. Top-right is
  the recommendation; flag if you'd rather try left.
- For Python locals (the common `async def main()` pattern), v1 documents
  the limitation. If kids hit this regularly in field tests, the next iteration
  could trace-instrument `main` only — but only if MicroPython's `settrace`
  proves stable enough.
