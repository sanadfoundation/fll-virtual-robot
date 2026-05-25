# Live Variable Watch — Design

Date: 2026-05-24
Status: Draft for review
Branch: `feat/live-variable-watch`
Scope: Both Blocks and Python projects. Different *source paths* feed the
same single watch panel — see the architecture diagram below.

## Problem

When kids run their program — Blockly or Python — they have no way to see
what their variables hold at any moment. In Blockly, `light_matrix.write`
mirrors to the Console panel (per CLAUDE.md), so they can spell out values,
but that means adding a "display text" block at every interesting point.
In Python, `print()` works the same way. Both clutter the program and rot
when it changes.

We want a real-time view of variable values that:

- **Updates while the program runs**, not just at the end.
- **Stays out of the way** when there's nothing to show, and doesn't displace
  any of the existing always-visible status bands (Ports, Position, Console).
- **Feels the same** in a Blocks project and in a Python project, even though
  the way values reach the panel is different in each.

## Non-goals

- **No breakpoints, no stepping.** This is a watch panel, not a debugger.
- **No editing values at runtime.** Read-only.
- **No expression panel input.** The kid expresses what they want to watch
  in code (Blockly: by using the variable; Python: by calling `sim.watch`).
  There is no in-panel text field.
- **No history scrubber.** A short visual flash on change is enough; full
  time-series logging is a separate feature.
- **No persistence across runs.** The panel clears at the start of every run,
  same as the Console.

## Architecture

```
              Blocks project              Python project
              ──────────────              ──────────────
              data_setvariableto          sim.watch('score', score)
              data_changevariableby             │
                       │                  bridge: {type:'var_update',
              codegen emits inline               │  name, value}
              _watch.set(name, val);             │
                       │                  js/simulator.js
                       │                  case 'var_update':
                       └────────┬─────────────────┘
                                ▼
                        window._watch.set(name, value)
                                │
                                ▼
                        watch panel (one renderer)
```

A single registry on the main window, `window._watch`, receives `(name, value)`
updates and renders them. Blockly feeds it via codegen at every assignment;
Python feeds it via an explicit `sim.watch(name, value)` helper the user calls
in their own code. **One panel, one registry, one renderer.** A project being
Blocks-only or Python-only (per the project-type model in CLAUDE.md) means a
given project's panel only ever sees one source path, but the panel itself is
language-agnostic.

## Blockly: capture at the set site

The Blockly path is unchanged from the prior Blockly-only revision of this
spec — assignments call `_watch.set` inline with the variable write.

### Instrument the three variable opcodes

The existing generators (`js/blockly_config.js:1918–1921`) become:

```js
js['data_variable']         = (b) => [_varNameOf(b), ORDER_ATOMIC];
js['data_setvariableto']    = (b) => {
  const name = _varNameOf(b);
  return `${name} = ${val(b,'VALUE','0')}; _watch.set(${_jsString(_displayNameOf(b))}, ${name});\n`;
};
js['data_changevariableby'] = (b) => {
  const name = _varNameOf(b);
  return `${name} = (Number(${name})||0) + (Number(${val(b,'VALUE','0')})||0); _watch.set(${_jsString(_displayNameOf(b))}, ${name});\n`;
};
```

`_displayNameOf(b)` returns the unsanitized Scratch variable name (what the
user typed), so the panel shows `score` rather than `v_score`. It's a one-line
sibling of `_varNameOf`:

```js
function _displayNameOf(block) {
  const id = block.getFieldValue('VARIABLE');
  const ws = block.workspace;
  const v = ws && ws.getVariableById ? ws.getVariableById(id) : null;
  return (v && v.name) ? v.name : id;
}
```

`_jsString(s)` returns `JSON.stringify(s)` — handles variable names with
quotes, backslashes, or newlines safely. Both helpers live near
`_sanitizeVarName` at `js/blockly_config.js:3605–3611`.

### Preamble: declare so empty variables still show

The preamble (`js/blockly_config.js:3657–3661`) emits one `_watch.declare`
per workspace variable, immediately after the `var` declarations:

```js
const watchDecls = userVars
  .map(v => `_watch.declare(${_jsString(v.name)}, ${_sanitizeVarName(v.name)});`)
  .join('\n');
```

`declare` registers the variable at its initial value without flashing, so
variables that are only *read* (never written) still appear in the panel
the instant the program starts. The generated AsyncFunction picks up the
panel reference at the top of the preamble: `const _watch = window._watch;`.

## Python: explicit `sim.watch()` helper

Python can't read user-frame state from outside the user's code — PyScript
2025.3.1's MicroPython has no `sys._getframe` (verified by
`prototypes/flocals-test/index.html`), which forecloses `_getframe`,
`f_locals`, and `cr_frame` -based designs. The honest answer is to let the
user push values to the panel at the moments they care about, the same way
they already push values to the Console with `print()`.

### Call surface

A new `sim` module exposes a `watch` function. Three forms cover the natural
call sites:

```python
from sim import watch

# Single, positional — clearest when the watch name and the local name differ.
watch('score', score)
watch('color_under_robot', color_sensor.color(port.C))

# Single, kwarg — half the typing when the local name is the watch name.
watch(score=score)

# Multiple, kwargs — one line for a snapshot of related variables.
watch(score=score, ready=ready, lap=lap)
```

Because we just receive a value, any expression works — sensor reads,
computed quantities (`watch('miss_distance', target_x - sensor.distance())`),
derived state — all surface in the panel without us needing an expression
language.

### Implementation

Add a `sim` module and register it in `py/spike_bridge.py`:

```python
class _Sim:
    @staticmethod
    def watch(name=None, value=None, **kwargs):
        if name is not None:
            _bridge_call({'type': 'var_update',
                          'name': str(name), 'value': value})
        for k, v in kwargs.items():
            _bridge_call({'type': 'var_update',
                          'name': k, 'value': v})

sim = _Sim()
sys.modules['sim'] = sim
```

`_bridge_call` already handles JSON serialisation and the await round-trip,
so `watch` returns the awaitable from the last `_bridge_call`. User code that
ignores the return value works fine (it's the same shape as `print()`
internally — fire-and-forget). User code that explicitly `await`s it sees the
panel updated before the next statement runs.

### Bridge command

A new case in `js/simulator.js`'s `executeCommand` forwards to the panel:

```js
case 'var_update':
  window._watch.set(cmd.name, cmd.value);
  return {};
```

Returns an empty result so the Python-side awaitable resolves immediately.
Unlike motor commands this one doesn't mutate sim state — it's a pure
pass-through to UI.

### Trade-off: the "stale between calls" property

The panel only updates when the user calls `watch()`. In a tight loop the
kid puts the call inside the loop and gets per-iteration updates; outside
loops they get one-shot snapshots. This matches the `print()` debugging
mental model kids already know.

A possible follow-up (deliberately out of scope for v1) is a closure-based
form `watch_live('score', lambda: score)` paired with a 150ms asyncio
ticker — MicroPython closures hold live references to their enclosing
variables, so the ticker could re-evaluate the lambda on each tick without
frame introspection. Worth revisiting if v1 staleness proves annoying in
practice.

## UI

### Placement

The bottom console strip splits horizontally into a console-output pane (left)
and a variables pane (right), sharing the existing 88px-tall band. The
variables pane sits beside the print output kids already read, never overlaps
the field, and never displaces any always-visible status (Ports, Position).

```
┌─────────────────────────────────────────────────────┐
│  Ports band (motors A/B, sensors C/D/E)             │
├─────────────────────────────────────────────────────┤
│                                                     │
│                                                     │
│              FLL field canvas                       │
│                                                     │
│                                                     │
├─────────────────────────────────────────────────────┤
│  Position band (X / Y / Heading / Yaw)              │
├─────────────────────────────────────────────┬───────┤
│ [Run] Executing blocks…                     │ Vars  │
│ [info] Mission complete!                    ├───────┤
│                                             │ score │
│                                             │  42   │
│                                             │ ready │
│                                             │ true  │
└─────────────────────────────────────────────┴───────┘
```

The existing `#console-wrap` becomes a flex row. The console output keeps
its current padding, scroll, and styling but moves into a sibling div
(`.console-output-pane`). A new `.watch-pane` sits to its right, with its
own header strip, alphabetised row list, and internal scroll. The split
defaults to **62% / 38%**; both panes scroll independently when their
content overflows.

Decision (locked): chosen over the overlay, status-band, and editor-drawer
options. Rationale: the watch pane sits next to the print output kids already
read, the field stays visually uncluttered, and the layout claims no new
vertical space — the console strip is reused, not extended. The full
side-by-side comparison lives in `prototypes/watch-panel/index.html`.

### Behavior

- **Hidden when empty.** The watch pane is `display: none` until a variable
  has been declared *or* set; the console pane fills the strip alone. As soon
  as the first `_watch.declare` or `_watch.set` fires, the pane slides in (a
  width transition from 0 → 38% over 200ms) and stays for the rest of the
  run. Zero-state = console takes the whole bar, no header chrome wasted.
- **One row per variable.** Sorted alphabetically by display name.
- **Change flash:** when `set(name, value)` is called and the value differs
  from the current display, the row's background pulses (a 600ms ease-out
  highlight in the accent colour). No animation if the value didn't change —
  rapid no-op sets don't burn frames.
- **Value formatting:** integers as `42`, floats rounded to 3 dp (`3.142`,
  not `3.1415926…`), strings quoted (`"hello"`), booleans `true`/`false`,
  arrays shown as `[a, b, c]` with truncation at 32 chars and full value in
  a `title` tooltip.
- **Clear on Run.** `handleRun` (`js/main.js:279`) calls `_watch.clear()` right
  after `clearOutput()`. The pane goes back to its hidden state (width 0,
  `display: none` after the transition) until the new run's first declare/set.
- **Console-collapse coexistence.** The existing console can be collapsed via
  its header chevron (the IIFE at the bottom of `index.html` toggles
  `.collapsed` on `#console-wrap`). When collapsed, the entire strip — both
  the output pane and the watch pane — folds away together. No separate
  collapse for the watch pane; that would duplicate state for no kid-visible
  benefit.
### Resizing

A 4px vertical divider sits between `.console-output-pane` and `.watch-pane`,
matching the existing `.resize-handle` between the editor panel and the
canvas (`js/main.js:540–582`). Dragging it changes the watch pane's width
(positive delta narrows the watch pane and widens the output, mirroring the
panel-left resize's `startW + delta` math).

```js
function initWatchResizeHandle() {
  const handle = document.getElementById('watch-resize-handle');
  const pane   = document.querySelector('.watch-pane');
  if (!handle || !pane) return;

  let dragging = false, startX = 0, startW = 0;
  handle.addEventListener('mousedown', e => {
    dragging = true;
    startX = e.clientX;
    startW = pane.offsetWidth;
    document.body.style.userSelect = 'none';
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const wrap = handle.parentElement;
    const min = 160, max = wrap.offsetWidth - 200;       // keep output ≥ 200px
    const newW = Math.max(min, Math.min(startW - (e.clientX - startX), max));
    pane.style.width = newW + 'px';
    lsSet(WATCH_W_KEY, String(newW));
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
  });
}
```

Persistence: `localStorage` key `fll-vr-watch-width`. On boot, if a width is
stored, apply it before the pane becomes visible so the layout doesn't flash.
If no width is stored, the pane uses its default `width: 38%` from CSS.

Min widths: the watch pane clamps at 160px (enough for the widest
expected row — `lastColor "magenta"` is the worst case at our font size).
The output pane clamps at 200px so a student dragging aggressively can't
make the console unreadable. Matches the same belt-and-suspenders pattern
the editor/canvas resize uses (`Math.max(260, ...)`).

Cursor / hover: the handle gets `cursor: col-resize` and the same hover
amber glow as `.resize-handle::after` (re-use the existing CSS rule by
adding `.watch-resize-handle` to the selector list).

Per the CLAUDE.md project-type model, a project is created as either
Blocks-only or Python-only and never switches mid-session, so the panel has
no per-mode visibility logic — it's just always available, fed by whichever
source path the project's code uses.

### Throttling

Tight loops can fire `set()` thousands of times per second. The panel
schedules a render at most once per animation frame; intermediate `set` calls
update the in-memory registry but coalesce into a single repaint. Flash
animation deduplicates: if a row is already mid-flash, the timer resets
rather than stacking.

For Python specifically, each `sim.watch` call is a worker→main `postMessage`
round-trip. A typical FLL program calls it a handful of times per loop body,
which is negligible. A pathological case (`watch` inside a 10kHz loop) would
saturate the message channel; if that ever shows up in practice, the
mitigation is a 16ms-buffered batch in the worker that ships an array of
updates instead of one per call. Deferred to a follow-up.

## Module layout

A single new JS file: `js/watch_panel.js`, loaded before `blockly_config.js`
so the Blockly generators can reference `window._watch` at codegen and
runtime.

Exports on `window._watch`:

| Method | Use |
|---|---|
| `declare(name, value)` | Blockly preamble; registers a variable without flashing. Idempotent. |
| `set(name, value)` | Both source paths; updates the row and triggers flash if value changed. |
| `clear()` | Called by `handleRun`; empties the registry and hides the pane. |

Internal state: a `Map<string, {value, lastChange}>` plus a list of
subscribers (currently one — the renderer). Renderer is a single
`requestAnimationFrame`-coalesced function.

Files touched at integration time:

- `index.html` — new `<script src="js/watch_panel.js"></script>`; restructure
  `#console-wrap` into a flex row with `.console-output-pane` (existing log
  reparented into it, keeping `id="console-output"` so `appendOutput` is
  unchanged), a sibling `.watch-resize-handle` divider, then `.watch-pane`
  with the header and the row list.
- `css/style.css` — `.console-wrap` becomes `display: flex` and drops its
  inline padding (children own that); add `.console-output-pane`,
  `.watch-pane`, `.watch-pane-head`, `.watch-pane-list`, `.watch-row`,
  `.watch-row.flash`, `.watch-resize-handle`, theme tokens (`--watch-bg`,
  `--watch-accent`). Extend the existing `.resize-handle::after` hover rule
  to also match `.watch-resize-handle::after` so the amber-glow feedback is
  consistent. Keep the existing `#console-wrap.collapsed { height: ... }`
  rule so the collapse interaction still works when the watch pane is
  present.
- `js/main.js` — `handleRun` calls `_watch.clear()`; new
  `initWatchResizeHandle()` wired in `DOMContentLoaded` next to the existing
  `initResizeHandle()`; init reads the stored watch-pane width from
  localStorage.
- `js/blockly_config.js` — `data_setvariableto`, `data_changevariableby`
  generators (set-site instrumentation); `generateBlocklyJS` preamble (capture
  `window._watch`, emit `_watch.declare` calls); new `_displayNameOf` and
  `_jsString` helpers near the existing `_sanitizeVarName`.
- `js/simulator.js` — new `case 'var_update':` in `executeCommand`, forwards
  to `_watch.set` and returns `{}`.
- `py/spike_bridge.py` — new `_Sim` class with `watch()`, registered as
  `sys.modules['sim']` alongside the other module injections.
- `js/monaco_config.js` — add a `SPIKE_API` entry for `sim.watch` so Monaco
  offers completion / signature help. Sig: `watch(name, value)` plus the
  kwargs form documented in the hover.

## Testing

The repo's test layout uses headless browser tests under `tests/`. Add:

- **Unit (`tests/watch_panel.test.js`)** — `_watch.declare`, `_watch.set`,
  `_watch.clear`, render coalescing, flash decay timing, formatting edge
  cases (negative numbers, very long strings, arrays, `null`).
- **Blockly integration** — build a workspace with a `data_setvariableto`
  inside a `control_repeat`, run the generated code, assert
  `_watch._snapshot()` matches the expected sequence of values. Cover a
  variable whose Scratch name contains a space and an apostrophe so the
  `_jsString` escaping is exercised.
- **Python integration** — run a program that calls `sim.watch('count',
  count)` inside a loop body, intercept `var_update` commands at the worker
  boundary, assert the sequence. Also assert kwargs form
  (`sim.watch(score=10, ready=True)`) produces two updates in order.
- **UI smoke** — load the page in a Blocks project; run a default program
  that uses a variable; assert the watch card is visible and contains the
  expected row. Repeat for a Python project that calls `sim.watch`.

## Risks and mitigations

- **Variable-name escaping (Blockly):** Scratch variable names allow
  characters that would break a naive `'…'`-wrapped JS literal (quotes,
  backslashes, newlines). Mitigation: all generator-side string
  interpolations go through `_jsString` (which is `JSON.stringify`). The
  integration test exercises a variable name with a quote in it.
- **Generator-side ordering (Blockly):** if `_watch.set` calls were emitted
  on a new line *after* an `await`, students could see the update lag the
  assignment by one event-loop tick. Mitigation: emit the `_watch.set` on
  the same statement line as the assignment, never on a new awaited line.
  The generators in this spec do this — keep the pattern.
- **Namespace pollution — does anything we add collide with user code, or
  with what's already in the page?** Enumerating every surface the feature
  introduces, and what currently occupies it:

  | New name | Lives in | Could collide with | Verdict |
  |---|---|---|---|
  | `window._watch` | page globals | other `window.*` we set | None — audited `js/` for `window.*` assignments; current set is `sim`, `_pyWorker`, `_sanitizeVarName`, `_sensorPortWarns`, `_blkVolume`, `appendOutput`, `DEFAULT_BLOCKLY_XML`, `generateBlocklyJS`, `initBlockly`, `registerSpikeCompletions`, `RobotSimulator`. `_watch` is unused. |
  | `_watch` identifier inside generated Blockly JS | the AsyncFunction scope | a user Scratch variable named `_watch` | None — `_sanitizeVarName` prepends `v_` to every user name, so the JS identifier is `v__watch` (different from `_watch`). The preamble's `const _watch = window._watch;` is unreachable from user-named identifiers. |
  | `_watch` identifier inside generated Blockly JS | the AsyncFunction scope | the existing preamble vars (`_moveSpeed`, `_hats`, `_t0`, …) | None — none of the existing preamble names is `_watch`. Cross-checked against `js/blockly_config.js:3663–3683`. |
  | Bridge command type `var_update` | the cmd JSON shape | other types in `js/simulator.js:executeCommand` | None — audited the existing cases (`pair`, `move`, `move_tank`, `start`, `start_tank`, `stop`, `motor_*`, `print`, `wait`, `hub_*`, `beep`, `read_sensors`, `reset_yaw`). `var_update` is unique. |
  | `sim` module name | Python `sys.modules` | other modules registered by the bridge | None — current set is `hub`, `app`, `motor`, `motor_pair`, `runloop`, `color_sensor`, `distance_sensor`, `force_sensor`, `color`, `orientation`, `device`, `color_matrix`. `sim` is unused. |
  | `sim` identifier in Python user code | user's namespace | a user binding (e.g. `sim = motor.speed(port.A)`) | Possible — same shape as shadowing `motor` or `runloop`. Documented in the `sim` module hover; if v1 telemetry shows kids hitting it, we rename to `from sim import watch` and stop exposing `sim` as a name. |
  | localStorage key `fll-vr-watch-width` | `localStorage` | existing keys | None — audited `js/main.js` (`fll-vr-theme`, `-speed`, `-units`, `-python-code`, `-blockly-xml`, `-tab`, `-project-name`, `-dirty`) and `js/llsp3_*.js`. Follows the project's `fll-vr-*` prefix convention and is unused. |
  | `_Sim` class name in `py/spike_bridge.py` | bridge module | other classes there | None — current set is `_NoopAwaitable`, `_LightMatrix`, `_Speaker`, `_MotionSensor`, `_Button`, `_Light`, `_Hub`, `_HubModule`, `_AppSound`, `_AppMusic`, `_AppDisplay`, `_AppBarGraph`, `_AppLineGraph`, `_App`. `_Sim` is unique. |

  The audit is the mitigation: any future addition to the bridge should
  rerun the grep before picking a name. The risk is durable, not just a
  v1 concern.
- **Staleness between `sim.watch` calls (Python):** the panel only updates
  when the user calls the helper, so a variable that changes in a loop
  without a `watch` call in that loop stays stale. Mitigation in v1: shape
  the docs around "call watch where you'd put a print." Follow-up if it
  bites in practice: the `watch_live(name, lambda: name)` closure-based form
  noted above.
- **Frame introspection is unavailable (Python — load-bearing finding).**
  PyScript 2025.3.1 MicroPython has no `sys._getframe`, so any "read the
  user's locals from a helper" design is foreclosed. The empirical test
  page is committed at `prototypes/flocals-test/` for future re-runs; if a
  PyScript bump ever exposes frames, the `sim.watch` helper can stay as the
  primary surface and a `sim.watch_auto()` mode could read frames as a
  bonus. Don't re-propose frame-reading until that test passes.

## Out of scope (for follow-ups)

- Sparkline of recent values per row.
- Expand-on-click for collections — show indexed children.
- Pin / favourite a variable to keep it on top.
- Per-variable enable/disable from the panel.
- Export watch history as CSV alongside the existing console log.
- `sim.watch_live(name, lambda: name)` for automatic re-polling without
  manual call sites (depends on MicroPython closure-cell semantics; small
  empirical check required before committing).
- Worker-side update batching if `sim.watch` is ever called inside a hot
  loop in real student code.

## Decisions log

- **Panel placement: split console.** Chosen 2026-05-25 from four runnable
  prototypes in `prototypes/watch-panel/`. The split console keeps the
  watch pane adjacent to the print output kids already read, claims no new
  vertical real estate, and leaves the field uncluttered. The overlay,
  status-band, and editor-drawer prototypes remain in the page as
  reference for the rationale.
