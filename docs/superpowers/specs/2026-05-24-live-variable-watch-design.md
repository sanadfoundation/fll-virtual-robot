# Live Variable Watch — Design

Date: 2026-05-24
Status: Draft for review
Branch: `feat/live-variable-watch`
Scope: **Blockly only.** Python is out of scope for this iteration — see
"Python (deferred)" at the end for the reasoning.

## Problem

When kids run their Blockly program, they have no way to see what their
variables hold at any moment. `light_matrix.write` mirrors to the Console
panel (see CLAUDE.md), so they can spell things out — but that means adding a
"display text" block at every interesting point, which clutters the program
and rots when the program changes.

We want a real-time view of variable values that:

- **Updates while the program runs**, not just at the end.
- **Tracks variables automatically** — no "add to watch" step.
- **Stays out of the way** when there's nothing to show, and doesn't displace
  any of the existing always-visible status bands (Ports, Position, Console).

## Non-goals

- **No breakpoints, no stepping.** This is a watch panel, not a debugger.
- **No editing values at runtime.** Read-only.
- **No expression evaluation.** Only variables the Blockly workspace defines.
- **No history scrubber.** A short visual flash on change is enough; full
  time-series logging is a separate feature.
- **No persistence across runs.** The panel clears at the start of every run,
  same as the Console.
- **No Python support in this iteration.** See "Python (deferred)" below.

## How Blockly constrains the design

Blockly generates JS, hoists every workspace variable as `var v_<name>` in a
preamble (`js/blockly_config.js:3657–3683`), then runs the whole thing as
`new AsyncFunction(code)` in `runBlockly` (`js/main.js:330–342`). The
AsyncFunction's local scope is sealed — outside code can't enumerate or read
`v_x` once the function starts.

Reading state from outside is therefore not viable. We have to **capture
writes at the assignment site**, where we already control the codegen.

## Approach: capture at the set site

A single registry on the main window, `window._watch`, receives `(name, value)`
updates and renders them. The Blockly generators emit calls into that registry
inline with every assignment.

### Instrument the three variable opcodes

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
typed), so the watch panel shows `score` rather than `v_score`. It's a
one-line sibling of `_varNameOf` that returns `v.name` directly.

The preamble (`js/blockly_config.js:3657–3661`) also emits one
`_watch.declare('<name>', 0);` per workspace variable. `declare` registers
the variable at value 0 but does **not** flash, so the user sees their full
variable list the instant they hit Run, before any assignments fire. (This
matters because Blockly hoists vars at codegen time — without `declare`, a
variable that's only read, never written, would be invisible.)

`_watch` is a tiny helper attached to `window` by the watch panel module; the
generated AsyncFunction reads it via the captured `window._watch` reference at
the top of the preamble (`const _watch = window._watch;`).

### Display-name lookup helper

Where `_varNameOf` already exists at `js/blockly_config.js:1911–1916`, add:

```js
function _displayNameOf(block) {
  const id = block.getFieldValue('VARIABLE');
  const ws = block.workspace;
  const v = ws && ws.getVariableById ? ws.getVariableById(id) : null;
  return (v && v.name) ? v.name : id;
}
```

String-escape the result before inlining it into generated JS (workspace
variable names allow apostrophes, backslashes, and newlines). A small
`_jsString(s)` helper that returns `JSON.stringify(s)` is enough — generators
then emit `_watch.set(${_jsString(_displayNameOf(b))}, ${name})`.

The preamble's per-variable declare loop uses the same helper:

```js
const watchDecls = userVars
  .map(v => `_watch.declare(${_jsString(v.name)}, ${_sanitizeVarName(v.name)});`)
  .join('\n');
```

Emitted *after* the `var` declarations so each declare reads the initialised
JS identifier (value `0`) rather than `undefined`.

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
  after `clearOutput()`. The panel goes back to its hidden state until the new
  run's first declare/set.
- **Toggle.** A single button in the Settings popover — *Variables: shown /
  hidden* — lets a teacher hide the panel entirely for assessments. State in
  localStorage (`fll-vr-watch-enabled`). The default is **shown**.
- **Mode-aware.** The panel is only relevant in Blocks mode. When the user
  switches to the Python tab, the card hides; switching back restores it. (No
  data loss — the registry survives a tab switch.)

### Throttling

Tight loops can fire `set()` thousands of times per second. The panel
schedules a render at most once per animation frame; intermediate `set` calls
update the in-memory registry but coalesce into a single repaint. Flash
animation deduplicates: if a row is already mid-flash, the timer resets
rather than stacking.

## Module layout

A single new file: `js/watch_panel.js`, loaded before `blockly_config.js` so
the Blockly generators can reference `window._watch` at codegen and runtime.

Exports on `window._watch`:

| Method | Use |
|---|---|
| `declare(name, value)` | Blockly preamble; registers a variable without flashing. Idempotent. |
| `set(name, value)` | Emitted by the variable-set generators; updates the row and triggers flash if value changed. |
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
- `js/main.js` — `handleRun` calls `_watch.clear()`; `switchMode` calls
  `_watch.setVisibleForMode(mode)`; init reads the toggle from localStorage.
- `js/blockly_config.js` — `data_setvariableto`, `data_changevariableby`
  generators (set-site instrumentation); `generateBlocklyJS` preamble (capture
  `window._watch` and emit `_watch.declare` calls); new `_displayNameOf` and
  `_jsString` helpers near the existing `_sanitizeVarName`.

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
- **UI smoke** — load the page, run a default program that uses a variable,
  assert the watch card is visible and contains the expected row. Hidden when
  no variables exist, hidden when the user switches to the Python tab.

## Risks and mitigations

- **Variable-name escaping:** Scratch variable names allow characters that
  would break a naive `'…'`-wrapped JS literal (quotes, backslashes,
  newlines). Mitigation: all generator-side string interpolations go through
  `_jsString` (which is `JSON.stringify`). The integration test exercises a
  variable name with a quote in it.
- **Generator-side ordering:** if `_watch.set` calls were emitted on a new
  line *after* an `await`, students could see the update lag the assignment
  by one event-loop tick. Mitigation: emit the `_watch.set` on the same
  statement line as the assignment, never on a new awaited line. The
  generators in this spec do this — keep the pattern.
- **`_watch` name collision:** the sanitizer maps every user variable to
  `v_<name>`, so a user variable literally named `_watch` becomes `v__watch`
  and doesn't shadow the `const _watch` captured in the preamble.

## Out of scope (for follow-ups)

- Sparkline of recent values per row.
- Expand-on-click for collections — show indexed children.
- Pin / favourite a variable to keep it on top.
- Per-variable enable/disable from the panel (vs. global toggle).
- Export watch history as CSV alongside the existing console log.

## Python (deferred)

Python support is out of scope for this iteration. The set-site capture
pattern that works cleanly for Blockly is harder in Python because:

- **Subclassing `dict` for the `exec` globals doesn't reliably intercept
  assignments.** CPython's `STORE_GLOBAL` takes a fast path that bypasses
  `__setitem__`; MicroPython's behaviour here would need verification before
  it could be relied on as the only mechanism.
- **Most FLL Python programs put logic inside `async def main()`,** which
  means the variables we care about (`count`, `score`, `state`) are *locals*,
  not globals — invisible to any wrapper around the globals dict regardless.

Doing this well in Python likely means **source-rewriting** user code to
insert `_watch_set(...)` calls after every assignment (since MicroPython
ships no `ast` module, that needs a small custom parser or a careful regex).
An **explicit `watch('count', 'score')` API** is the simpler fallback but
gives up the "automatic, no setup" property of the Blockly experience.

We'll decide between those two when this lands and we know whether the
Blockly version is carrying its weight.

## Open question for review

- Default location: top-right of the canvas vs. inside the editor pane (left
  panel). Top-right keeps the editor uncluttered and lets students see
  variables while watching the robot move; left puts them next to the code
  that defines them. Top-right is the recommendation — flag if you'd rather
  try left.
