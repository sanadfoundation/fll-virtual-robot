# Live Variable Watch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live, read-only variable watch pane to the bottom console strip, fed by Blockly codegen for Blocks projects and by an explicit `sim.watch()` helper for Python projects.

**Architecture:** One `window._watch` registry on the main page receives `(name, value)` updates and renders sorted rows in a new `.watch-pane` to the right of the existing `.console-output-pane`. Blockly's `data_setvariableto` / `data_changevariableby` generators emit inline `_watch.set` calls; Python's new `sim.watch()` helper posts `{type:'var_update'}` bridge commands that `executeCommand` forwards to `_watch.set`. A 4px vertical divider between the two panes lets the user resize the split; the watch pane is `display:none` until at least one variable is declared/set, then slides in with a width transition.

**Tech Stack:** Vanilla JS (no build, no bundler — script tags in `index.html`), MicroPython on PyScript in a Web Worker, `node:test` + `vm.runInContext` for JS tests, MicroPython via `@micropython/micropython-webassembly-pyscript` for Python tests (`npm run test:py`), CPython for fast Python tests (`npm run test:py:cpython`).

**Spec:** `docs/superpowers/specs/2026-05-24-live-variable-watch-design.md` — read it first; this plan executes against that design.

**Decomposition:** Eight tasks. 1–4 build the panel/UI infrastructure end-to-end so the smoke test in any later task can exercise the pane. 5 hooks Blockly. 6–7 hook Python. 8 adds Monaco completion. Each task ends with a green test run (or a documented manual check) and a commit.

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `js/watch_panel.js` | The `window._watch` API and its DOM renderer. Pure self-contained module — installs `window._watch` and listens on DOM ready for its host elements. |
| `tests/js/watch/helper.js` | vm-context loader for `js/watch_panel.js`, matching the `tests/js/version_check/helper.js` pattern. |
| `tests/js/watch/watch-panel.test.js` | Unit tests for declare / set / clear / formatting / sorting / change-detection. |
| `tests/py/test_sim_watch.py` | Python tests for `sim.watch` positional and kwargs forms, matching `tests/py/test_print.py`. |

**Modified files:**

| Path | What changes |
|---|---|
| `index.html` | Restructure `#console-wrap`: existing `#console-output` is reparented into a new `.console-output-pane`, a `.watch-resize-handle` divider is added, then a `.watch-pane` with its header + list. New `<script src="js/watch_panel.js"></script>` is included before `js/main.js`. |
| `css/style.css` | `.console-wrap` becomes `display: flex`. New rules for `.console-output-pane`, `.watch-pane`, `.watch-pane-head`, `.watch-pane-list`, `.watch-row`, `.watch-row.flash`, `.watch-resize-handle`. Existing `.resize-handle::after` selector extended to also match `.watch-resize-handle::after`. |
| `js/main.js` | `handleRun` adds a call to `window._watch.clear()`. New `initWatchResizeHandle()` wired in `DOMContentLoaded`. Boot reads `fll-vr-watch-width` from localStorage and applies it to the pane. New `WATCH_W_KEY` constant alongside the other localStorage keys. |
| `js/blockly_config.js` | New `_displayNameOf(block)` and `_jsString(s)` helpers next to `_sanitizeVarName`. `data_setvariableto` and `data_changevariableby` generators emit a trailing `_watch.set(...)` on the same line. `generateBlocklyJS` preamble captures `const _watch = window._watch;` and emits a `_watch.declare(...)` per workspace variable after the `var` declarations. |
| `js/simulator.js` | New `case 'var_update':` in the command dispatch switch — forwards `cmd.name` + `cmd.value` to `window._watch.set` and returns `{}`. |
| `py/spike_bridge.py` | New `_Sim` class with a `watch()` static method that posts `{type:'var_update'}` bridge commands. Module registered as `sys.modules['sim'] = sim`. |
| `js/monaco_config.js` | New `SPIKE_API` entry for `sim.watch` so Monaco completion / signature help works in Python projects. |
| `tests/js/blockly/data-variables-generators.test.js` | Update the `data_setvariableto` assertion to expect the new `_watch.set(...)` suffix on the emitted line. The `data_changevariableby` and preamble assertions still pass as-is (their regex / substring matches survive). |

---

## Task 1: Build the `_watch` registry and its renderer

**Files:**
- Create: `js/watch_panel.js`
- Create: `tests/js/watch/helper.js`
- Create: `tests/js/watch/watch-panel.test.js`

The renderer keeps a single `Map<string, {value, isChanged}>` plus an rAF-coalesced render. Tests load the module into a vm sandbox with stub `document` / `window` / `requestAnimationFrame` and assert on registry state via `window._watch._snapshot()` plus DOM mutations the stub records.

- [ ] **Step 1: Write the helper that loads `watch_panel.js` into a vm sandbox**

Create `tests/js/watch/helper.js`:

```js
'use strict';

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../../js/watch_panel.js'),
  'utf8',
);

// Returns a sandbox with mocked DOM. The sandbox's `window._watch` is the
// installed API. The sandbox records DOM mutations on `__domLog` so tests
// can assert on what the renderer did.
function loadWatchPanel(opts = {}) {
  const rafQueue = [];
  const flushRaf = () => {
    while (rafQueue.length) {
      const cb = rafQueue.shift();
      cb(performance.now());
    }
  };
  const setTimeouts = [];
  const flushTimers = () => {
    while (setTimeouts.length) {
      const { fn } = setTimeouts.shift();
      fn();
    }
  };

  function makeElement(tag) {
    const el = {
      tagName: tag.toUpperCase(),
      children: [],
      classList: {
        _set: new Set(),
        add(c)    { this._set.add(c); },
        remove(c) { this._set.delete(c); },
        contains(c) { return this._set.has(c); },
        toggle(c, on) {
          if (on === undefined) on = !this._set.has(c);
          on ? this._set.add(c) : this._set.delete(c);
          return on;
        },
      },
      dataset: {},
      style: {},
      textContent: '',
      title: '',
      id: '',
      _eventListeners: {},
      get innerHTML() { return ''; },
      set innerHTML(v) { this.children = []; },
      appendChild(child) { this.children.push(child); return child; },
      querySelector() { return null; },
      addEventListener(name, fn) {
        (this._eventListeners[name] = this._eventListeners[name] || []).push(fn);
      },
    };
    return el;
  }

  const pane = makeElement('div');
  pane.classList.add('watch-pane');
  const list = makeElement('div');
  list.id = 'watch-pane-list';
  pane.appendChild(list);

  const elementsById = { 'watch-pane-list': list };
  const elementsBySelector = { '.watch-pane': pane };

  const documentStub = {
    readyState: 'complete',
    addEventListener(name, fn) { /* no DOMContentLoaded needed since readyState complete */ },
    getElementById(id) { return elementsById[id] || null; },
    querySelector(sel) { return elementsBySelector[sel] || null; },
    createElement: makeElement,
  };

  const root = {};
  const context = vm.createContext({
    window: root,
    globalThis: root,
    document: documentStub,
    requestAnimationFrame(cb) { rafQueue.push(cb); return rafQueue.length; },
    setTimeout(fn, ms) { setTimeouts.push({ fn, ms }); return setTimeouts.length; },
    performance: { now: () => Date.now() },
    console,
  });
  vm.runInContext(SRC, context);

  return {
    api: root._watch,
    pane,
    list,
    flushRaf,
    flushTimers,
  };
}

module.exports = { loadWatchPanel };
```

- [ ] **Step 2: Write the failing unit tests**

Create `tests/js/watch/watch-panel.test.js`:

```js
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { loadWatchPanel } = require('./helper');

test('declare adds a name to the registry with the given value', () => {
  const { api } = loadWatchPanel();
  api.declare('score', 0);
  assert.deepEqual(api._snapshot(), { score: 0 });
});

test('declare is idempotent — a second declare for the same name is a no-op', () => {
  const { api } = loadWatchPanel();
  api.declare('score', 0);
  api.declare('score', 99);
  assert.strictEqual(api._snapshot().score, 0);
});

test('set adds a name when not previously declared', () => {
  const { api } = loadWatchPanel();
  api.set('score', 42);
  assert.deepEqual(api._snapshot(), { score: 42 });
});

test('set updates an existing value', () => {
  const { api } = loadWatchPanel();
  api.declare('score', 0);
  api.set('score', 42);
  assert.strictEqual(api._snapshot().score, 42);
});

test('clear empties the registry', () => {
  const { api } = loadWatchPanel();
  api.declare('score', 0);
  api.set('ready', true);
  api.clear();
  assert.deepEqual(api._snapshot(), {});
});

test('render mounts a row per variable, sorted alphabetically', () => {
  const { api, list, flushRaf } = loadWatchPanel();
  api.declare('zeta', 0);
  api.declare('alpha', 0);
  api.declare('mike', 0);
  flushRaf();
  const names = list.children.map(row => row.dataset.name);
  assert.deepEqual(names, ['alpha', 'mike', 'zeta']);
});

test('render coalesces multiple sets into one frame', () => {
  const { api, list, flushRaf } = loadWatchPanel();
  api.set('x', 1);
  api.set('x', 2);
  api.set('x', 3);
  // Before flush: no rows mounted.
  assert.strictEqual(list.children.length, 0);
  flushRaf();
  assert.strictEqual(list.children.length, 1);
});

test('changed rows get a .flash class; unchanged rows do not', () => {
  const { api, list, flushRaf, flushTimers } = loadWatchPanel();
  api.declare('score', 0);
  flushRaf();
  // First render: no flash (just declared).
  assert.ok(!list.children[0].classList.contains('flash'));
  api.set('score', 1);
  flushRaf();
  assert.ok(list.children[0].classList.contains('flash'));
  // After the 600ms timer fires, .flash is removed.
  flushTimers();
  assert.ok(!list.children[0].classList.contains('flash'));
});

test('setting the same value twice does not flash on the second set', () => {
  const { api, list, flushRaf, flushTimers } = loadWatchPanel();
  api.declare('score', 5);
  api.set('score', 5);                  // declare → set with same value
  flushRaf();
  flushTimers();
  assert.ok(!list.children[0].classList.contains('flash'));
});

test('value formatting: integer renders as bare number', () => {
  const { api, list, flushRaf } = loadWatchPanel();
  api.set('n', 42);
  flushRaf();
  const valueEl = list.children[0].children.find(c => c.classList.contains('watch-row-value'));
  assert.strictEqual(valueEl.textContent, '42');
});

test('value formatting: float rounds to 3 dp', () => {
  const { api, list, flushRaf } = loadWatchPanel();
  api.set('pi', 3.14159265);
  flushRaf();
  const valueEl = list.children[0].children.find(c => c.classList.contains('watch-row-value'));
  assert.strictEqual(valueEl.textContent, '3.142');
});

test('value formatting: string is quoted', () => {
  const { api, list, flushRaf } = loadWatchPanel();
  api.set('name', 'hello');
  flushRaf();
  const valueEl = list.children[0].children.find(c => c.classList.contains('watch-row-value'));
  assert.strictEqual(valueEl.textContent, '"hello"');
});

test('value formatting: boolean renders as true / false', () => {
  const { api, list, flushRaf } = loadWatchPanel();
  api.set('ready', true);
  api.set('done', false);
  flushRaf();
  const values = list.children.map(row =>
    row.children.find(c => c.classList.contains('watch-row-value')).textContent
  );
  assert.deepEqual(values.sort(), ['false', 'true']);
});

test('value formatting: array renders as [a, b, c] truncated at 32 chars', () => {
  const { api, list, flushRaf } = loadWatchPanel();
  api.set('xs', [1, 2, 3]);
  api.set('long', Array.from({ length: 20 }, (_, i) => i));
  flushRaf();
  const shortValue = list.children
    .find(r => r.dataset.name === 'xs')
    .children.find(c => c.classList.contains('watch-row-value')).textContent;
  assert.strictEqual(shortValue, '[1, 2, 3]');
  const longValue = list.children
    .find(r => r.dataset.name === 'long')
    .children.find(c => c.classList.contains('watch-row-value')).textContent;
  assert.ok(longValue.length <= 32);
  assert.ok(longValue.endsWith('…]'));
});

test('value formatting: null renders as "null"', () => {
  const { api, list, flushRaf } = loadWatchPanel();
  api.set('x', null);
  flushRaf();
  const valueEl = list.children[0].children.find(c => c.classList.contains('watch-row-value'));
  assert.strictEqual(valueEl.textContent, 'null');
});

test('pane becomes visible when first variable lands', () => {
  const { api, pane, flushRaf } = loadWatchPanel();
  assert.ok(!pane.classList.contains('visible'));
  api.declare('x', 0);
  flushRaf();
  // First rAF schedules the visibility flip in a second rAF, so flush once more.
  flushRaf();
  assert.ok(pane.classList.contains('visible'));
});

test('clear() removes the .visible class so the pane slides out', () => {
  const { api, pane, flushRaf } = loadWatchPanel();
  api.declare('x', 0);
  flushRaf(); flushRaf();
  assert.ok(pane.classList.contains('visible'));
  api.clear();
  flushRaf();
  assert.ok(!pane.classList.contains('visible'));
});
```

- [ ] **Step 3: Run tests, verify they fail**

Run: `npm run test:js -- tests/js/watch/`
Expected: failures — `Cannot find module '../../../js/watch_panel.js'` or similar.

- [ ] **Step 4: Implement `js/watch_panel.js`**

Create `js/watch_panel.js`:

```js
'use strict';

// Live variable watch — one Map of name → value, one rAF-coalesced renderer,
// one DOM target. Installed as window._watch so Blockly codegen (`_watch.set`,
// `_watch.declare`) and the simulator's 'var_update' bridge case can both
// reach it through the same surface. Read-only from the user's perspective.

(function () {
  // ── State ────────────────────────────────────────────────────────────
  const state = new Map();              // name → { value, isChanged }
  let renderScheduled = false;
  let pane = null;
  let list = null;

  // ── DOM lookup (deferred until DOMContentLoaded) ─────────────────────
  function _ensureDom() {
    if (pane && list) return true;
    if (typeof document === 'undefined') return false;
    pane = document.querySelector('.watch-pane');
    list = document.getElementById('watch-pane-list');
    return !!(pane && list);
  }

  // ── Value formatting ─────────────────────────────────────────────────
  function _format(v) {
    if (typeof v === 'number') {
      return Number.isInteger(v) ? String(v) : v.toFixed(3);
    }
    if (typeof v === 'boolean')  return v ? 'true' : 'false';
    if (typeof v === 'string')   return JSON.stringify(v);
    if (v === null)              return 'null';
    if (v === undefined)         return 'undefined';
    if (Array.isArray(v)) {
      const inner = v.map(_format).join(', ');
      const full = '[' + inner + ']';
      if (full.length <= 32) return full;
      return full.slice(0, 29) + '…]';
    }
    try { return JSON.stringify(v); } catch (_) { return String(v); }
  }

  function _escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;',
      '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ── Render (rAF-coalesced) ───────────────────────────────────────────
  function _scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(_render);
  }

  function _render() {
    renderScheduled = false;
    if (!_ensureDom()) return;

    if (state.size === 0) {
      // Clear list and slide pane out. The CSS width transition fires;
      // a transitionend listener (attached on first mount) flips display:none
      // once the slide-out completes.
      list.innerHTML = '';
      pane.classList.remove('visible');
      return;
    }

    // Make sure the pane is mounted and animating in. Display first, then
    // add .visible in the next frame so the CSS transition runs.
    if (pane.style.display === 'none' || pane.style.display === '') {
      pane.style.display = 'flex';
    }
    if (!pane.classList.contains('visible')) {
      requestAnimationFrame(() => pane.classList.add('visible'));
    }

    // Diff-render: keep references to the previous rows so we don't reset
    // flash animations on rows that didn't change.
    const prevByName = new Map();
    for (const row of list.children) prevByName.set(row.dataset.name, row);

    const entries = Array.from(state.entries())
      .sort((a, b) => a[0].localeCompare(b[0]));

    list.innerHTML = '';
    for (const [name, info] of entries) {
      const row = document.createElement('div');
      row.className = 'watch-row';
      row.dataset.name = name;
      const formatted = _format(info.value);
      const nameSpan  = document.createElement('span');
      nameSpan.className = 'watch-row-name';
      nameSpan.textContent = name;
      const valueSpan = document.createElement('span');
      valueSpan.className = 'watch-row-value';
      valueSpan.textContent = formatted;
      valueSpan.title = String(info.value);
      row.appendChild(nameSpan);
      row.appendChild(valueSpan);
      list.appendChild(row);

      if (info.isChanged) {
        row.classList.add('flash');
        setTimeout(() => row.classList.remove('flash'), 600);
      }
      info.isChanged = false;
    }
  }

  // ── Public API ───────────────────────────────────────────────────────
  const api = {
    declare(name, value) {
      if (state.has(name)) return;       // idempotent
      state.set(name, { value, isChanged: false });
      _scheduleRender();
    },
    set(name, value) {
      const prev = state.get(name);
      const changed = !prev || !_valuesEqual(prev.value, value);
      state.set(name, { value, isChanged: changed });
      _scheduleRender();
    },
    clear() {
      state.clear();
      _scheduleRender();
    },
    _snapshot() {
      const out = {};
      for (const [k, v] of state.entries()) out[k] = v.value;
      return out;
    },
  };

  function _valuesEqual(a, b) {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!_valuesEqual(a[i], b[i])) return false;
      }
      return true;
    }
    return false;
  }

  // ── Hook up transitionend so the pane fully hides after slide-out ───
  function _attachHideListener() {
    if (!_ensureDom()) return;
    pane.addEventListener('transitionend', (e) => {
      if (e.propertyName !== 'width') return;
      if (state.size === 0) pane.style.display = 'none';
    });
  }

  // ── DOM-ready boot ───────────────────────────────────────────────────
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        _ensureDom();
        _attachHideListener();
      });
    } else {
      _ensureDom();
      _attachHideListener();
    }
  }

  // ── Expose on window ─────────────────────────────────────────────────
  if (typeof window !== 'undefined') {
    window._watch = api;
  } else if (typeof globalThis !== 'undefined') {
    globalThis._watch = api;
  }
})();
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `npm run test:js -- tests/js/watch/`
Expected: all tests PASS.

If a formatting test fails, the most likely culprit is `_format` rounding or escaping logic. Fix the implementation, not the test — the spec dictates the formatting rules.

- [ ] **Step 6: Commit**

```bash
git add js/watch_panel.js tests/js/watch/
git commit -m "$(cat <<'EOF'
feat(watch): registry + renderer for the live variable watch panel

window._watch installs declare/set/clear/_snapshot, an rAF-coalesced
renderer, value formatting (int/float/string/bool/array/null), sorted
row diff, and the visible/transitionend slide animation. DOM-deferred
mount lets the script load before its host elements exist.
EOF
)"
```

---

## Task 2: Restructure `#console-wrap` and add CSS for the split

**Files:**
- Modify: `index.html`
- Modify: `css/style.css`

The existing `#console-wrap` holds a `<button class="console-header">` and a `<div id="console-output">`. The toggle IIFE at the bottom of `index.html` flips `.collapsed` on `#console-wrap`. We wrap the existing output area inside a new `.console-output-pane`, append the resize handle and watch pane as siblings, and update CSS so `.console-wrap` is a flex row.

- [ ] **Step 1: Read the current `#console-wrap` markup**

Run: `grep -n -A 8 'class="console-wrap"' index.html`
Expected output: a block roughly like

```html
<div class="console-wrap" id="console-wrap">
  <button class="console-header" id="console-toggle" ...>
    ...
  </button>
  <div id="console-output"></div>
</div>
```

- [ ] **Step 2: Replace the `#console-wrap` block in `index.html`**

The header button stays as a child of `#console-wrap` (it's the row header that toggles `.collapsed`). The flex row sits *below* the header. To minimize disruption to the existing CSS, we keep the header where it is and turn the content area into a flex row by giving `#console-wrap` a column layout with the header on top and a new `.console-content-row` underneath. **Implementation note:** simpler than rewriting the toggle CSS — the header keeps its `display: flex` rule because it's still a direct child of `#console-wrap`.

Replace the existing block with:

```html
<div class="console-wrap" id="console-wrap">
  <button class="console-header" id="console-toggle" type="button" aria-expanded="true" aria-controls="console-output">
    <span class="dot"></span>
    <span class="console-header-label">Console Output</span>
    <span class="console-spacer"></span>
    <span class="console-toggle-chevron" aria-hidden="true">▾</span>
  </button>
  <div class="console-content-row">
    <div class="console-output-pane">
      <div id="console-output"></div>
    </div>
    <div class="watch-resize-handle" id="watch-resize-handle" aria-hidden="true"></div>
    <div class="watch-pane">
      <div class="watch-pane-head">
        <span class="watch-pane-label">Variables</span>
      </div>
      <div class="watch-pane-list" id="watch-pane-list"></div>
    </div>
  </div>
</div>
```

(Preserve the exact contents of the existing `.console-header` button — copy them from the current file rather than retyping. The shape above matches what's there now per the file read in Step 1; if your file diverges, mirror the actual current contents inside the new wrapper.)

- [ ] **Step 3: Add the `<script>` tag for the watch panel**

In `index.html`, in the `<script>` tag list near the bottom of `<body>` (the block that loads `js/simulator.js`, `js/blockly_config.js`, etc.), add `<script src="js/watch_panel.js"></script>` **before** `js/blockly_config.js` and `js/main.js`. The order matters: the Blockly generators and `handleRun` reference `window._watch` at runtime.

The expected order around the change:

```html
<script src="js/simulator.js"></script>
<script src="js/watch_panel.js"></script>
<script src="js/blockly_config.js"></script>
<script src="js/monaco_config.js"></script>
...
<script src="js/main.js"></script>
```

- [ ] **Step 4: Update `css/style.css` — `.console-wrap` and new pane styles**

Find the existing `.console-wrap` rule (search `grep -n '.console-wrap {' css/style.css`). Replace its `padding`, `font-family`, and `overflow` declarations with the column-layout shape:

```css
.console-wrap {
  background: var(--surface); border-top: 1px solid var(--border);
  height: 88px; flex-shrink: 0;
  display: flex; flex-direction: column;
}
```

(Keep any other declarations the existing rule has; only the listed properties change.)

After the `.console-wrap` rule (anywhere it's logically grouped with the console styles), add:

```css
.console-content-row {
  flex: 1;
  display: flex;
  align-items: stretch;
  overflow: hidden;
  min-height: 0;
}

.console-output-pane {
  flex: 1;
  padding: 8px 14px;
  font-family: var(--font-code); font-size: 12px; color: var(--text-mid);
  overflow: auto;
  min-width: 0;
}

#console-wrap.collapsed .console-content-row { display: none; }

/* ── Watch pane ─────────────────────────────────────────────────────── */
.watch-pane {
  width: 38%;
  min-width: 0;
  background: var(--surface);
  border-left: 1px solid var(--border);
  display: none;
  flex-direction: column;
  overflow: hidden;
  transition: width 200ms ease-out;
}

.watch-pane.visible {
  /* width is the inline default (38%) or whatever localStorage restored. */
}

.watch-pane-head {
  padding: 6px 14px;
  font-size: 10px; font-weight: 800; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--text-dim);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.watch-pane-list {
  flex: 1;
  padding: 2px 0;
  overflow: auto;
  min-height: 0;
}

.watch-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 4px 14px;
  font-family: var(--font-code); font-size: 12px;
  transition: background 600ms ease-out;
}

.watch-row.flash {
  background: rgba(251, 191, 36, 0.20);
  transition: none;
}

.watch-row-name { color: var(--text-mid); }
.watch-row-value {
  color: var(--amber);
  font-weight: 700;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Watch resize handle ────────────────────────────────────────────── */
.watch-resize-handle {
  width: 4px;
  background: var(--border);
  cursor: col-resize;
  flex-shrink: 0;
  transition: background 0.2s;
  position: relative;
}
.watch-resize-handle::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--amber);
  opacity: 0;
  transition: opacity 0.2s;
}
.watch-resize-handle:hover::after { opacity: 1; }

/* Hide the handle when the pane is hidden so dragging doesn't make a
   resize-cursor strip appear over a 0-width pane. */
.watch-pane:not(.visible) + .watch-resize-handle,
.watch-pane[style*="display: none"] ~ .watch-resize-handle {
  display: none;
}
```

Wait — the handle is a *sibling* of the pane in the markup, ordered `pane > handle > output-pane`? No: our markup has `output-pane, handle, watch-pane`. So the handle precedes the pane. We can hide the handle by reading the watch-pane's state via a CSS sibling selector. Easier: just hide the handle via JS in the same place we hide the pane, or via a `body[data-watch-empty]` flag. Simpler still: have the watch panel renderer toggle a `.empty` class on the `console-content-row` parent, and let CSS hide the handle when that's set.

Simpler rewrite — replace the two-selector rule above with:

```css
.console-content-row.empty .watch-resize-handle { display: none; }
```

…and in `js/watch_panel.js`'s `_render`, set `pane.parentElement.classList.toggle('empty', state.size === 0)` at the top of every render. That cleanly hides the handle alongside the pane in the empty state.

Update `js/watch_panel.js` `_render` (in Task 1's code) by adding right after `_ensureDom()`:

```js
const row = pane.parentElement;
if (row) row.classList.toggle('empty', state.size === 0);
```

Re-run the tests from Task 1 — they should still pass (the assertion on `pane.classList.contains('visible')` is unchanged; the new behaviour is purely additive).

- [ ] **Step 5: Manual smoke — load the page and verify console still works**

Run a local server:

```bash
python3 -m http.server 8787
```

Open `http://localhost:8787/` in a browser. Verify:
- The page loads without console errors.
- The console output strip at the bottom is intact — `[Init]` and `[Ready]` lines render.
- Clicking the console header still collapses/expands the strip.
- No watch pane is visible yet (state is empty).

Stop the server when done.

- [ ] **Step 6: Commit**

```bash
git add index.html css/style.css js/watch_panel.js
git commit -m "$(cat <<'EOF'
feat(watch): split console into output + watch panes

#console-wrap becomes a column with the existing header on top and a
new .console-content-row containing the original output pane, a 4px
resize handle, and the watch pane. CSS gives the watch pane a 38%
default width that animates in via the .visible class; an .empty
class on the content row hides both the watch pane and its handle
when no variables are present.

Watch panel renderer now toggles .empty on its parent row so the
existing handle/pane hide rules apply automatically.
EOF
)"
```

---

## Task 3: Wire `handleRun` to call `_watch.clear()`

**Files:**
- Modify: `js/main.js` (`handleRun` near line 279)
- Test: integration coverage via the existing `tests/js/main/run-pipeline.test.js` if it exercises `handleRun`; otherwise hand-verify.

- [ ] **Step 1: Read the existing `handleRun`**

Run: `grep -n -A 12 'async function handleRun' js/main.js`
Expected: a function that calls `clearOutput()` then dispatches to `runPython` or `runBlockly`.

- [ ] **Step 2: Add the `_watch.clear()` call**

Modify `js/main.js` — in `handleRun`, immediately after the `clearOutput();` line, add:

```js
  if (window._watch) window._watch.clear();
```

The guard (`if (window._watch)`) means a missing watch panel script doesn't break the run path. In normal operation `js/watch_panel.js` is loaded before `js/main.js`, so the guard is belt-and-suspenders.

- [ ] **Step 3: Run all existing tests to confirm no regressions**

Run: `npm run test:js`
Expected: all pre-existing tests still PASS.

- [ ] **Step 4: Commit**

```bash
git add js/main.js
git commit -m "$(cat <<'EOF'
feat(watch): clear watch panel at the start of every run

handleRun now calls window._watch.clear() right after clearOutput()
so a fresh run starts from an empty panel, matching the existing
behaviour of the Console.
EOF
)"
```

---

## Task 4: Add the resize handle

**Files:**
- Modify: `js/main.js` (new `initWatchResizeHandle()`, new `WATCH_W_KEY` constant, wire-in within `DOMContentLoaded`)

Mirrors `initResizeHandle()` at `js/main.js:540–582`. Drag updates the watch pane's width inline; min/max keep both panes readable.

- [ ] **Step 1: Add the constant**

In `js/main.js`, find the block of localStorage keys (search `const THEME_KEY`). Add a new line:

```js
const WATCH_W_KEY = 'fll-vr-watch-width';
```

- [ ] **Step 2: Add `initWatchResizeHandle()`**

Below the existing `initResizeHandle` function (its closing brace), add:

```js
function initWatchResizeHandle() {
  const handle = document.getElementById('watch-resize-handle');
  const pane   = document.querySelector('.watch-pane');
  if (!handle || !pane) return;

  // Apply stored width on boot so the pane doesn't flash to default on first
  // show. `pane.style.width` overrides the CSS 38% default.
  const stored = parseInt(lsGet(WATCH_W_KEY), 10);
  if (Number.isFinite(stored) && stored > 0) pane.style.width = stored + 'px';

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
    const min = 160;
    const max = wrap.offsetWidth - 200;          // keep output pane ≥ 200px
    // Dragging the handle left (delta < 0) widens the watch pane.
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

- [ ] **Step 3: Wire it into `DOMContentLoaded`**

In `js/main.js`, find the `DOMContentLoaded` handler. Below the existing `initResizeHandle();` call, add:

```js
  initWatchResizeHandle();
```

- [ ] **Step 4: Manual smoke**

Start the server (`python3 -m http.server 8787`), load the page. The watch pane is still hidden (no variables yet), so the handle is hidden too. Skip the resize check for now — Task 5's Blockly variables will make it appear, at which point you can:
- Drag the handle left/right; both panes resize, the watch pane stays ≥ 160px and the output ≥ 200px.
- Reload the page; the width persists.

For now, just verify no console errors after loading the page with the new code.

- [ ] **Step 5: Commit**

```bash
git add js/main.js
git commit -m "$(cat <<'EOF'
feat(watch): drag-to-resize between console output and watch pane

Mirrors initResizeHandle: mousedown captures start width, mousemove
clamps the new width to [160px, parent-200px] so neither pane
collapses below readable. Width persists in fll-vr-watch-width and
is applied on boot.
EOF
)"
```

---

## Task 5: Blockly codegen — set-site instrumentation

**Files:**
- Modify: `js/blockly_config.js` (new helpers, three generators, preamble)
- Modify: `tests/js/blockly/data-variables-generators.test.js` (the strictEqual assertion)
- Test: add cases to that file covering the new `_watch.set` and `_watch.declare` output

- [ ] **Step 1: Read the current generators and the existing data-variables test**

Run:
```bash
grep -n -A 6 "js\['data_setvariableto'\]" js/blockly_config.js
grep -n -A 12 "userVarDecls" js/blockly_config.js
sed -n '40,75p' tests/js/blockly/data-variables-generators.test.js
```

Read what you find — your edits must match the existing surrounding context exactly.

- [ ] **Step 2: Update the existing test to expect the new output, and add new cases**

Modify `tests/js/blockly/data-variables-generators.test.js`. Replace the `data_setvariableto generator emits a JS assignment` test body:

```js
test('data_setvariableto generator emits a JS assignment and a _watch.set', () => {
  const { Blockly, workspace } = setupGenerators();
  const js = Blockly.JavaScript;
  const origValueToCode = js.valueToCode;
  js.valueToCode = () => '0.5';
  try {
    const block = {
      workspace,
      getFieldValue() { return 'kp-id'; },
      getInputTargetBlock() { return null; },
    };
    const code = js['data_setvariableto'](block);
    // Assignment and watch call on the same line so the panel update can't
    // lag the variable write across an await boundary.
    assert.match(code, /^v_k_p\s*=\s*0\.5;\s*_watch\.set\("k_p",\s*v_k_p\);\s*$/);
  } finally {
    js.valueToCode = origValueToCode;
  }
});

test('data_setvariableto: variable name with quote escapes safely', () => {
  const { Blockly, env } = setupGenerators();
  const js = Blockly.JavaScript;
  const origValueToCode = js.valueToCode;
  js.valueToCode = () => '0';
  try {
    const block = {
      workspace: { getVariableById: () => ({ name: 'it\\'s' }) },
      getFieldValue() { return 'q-id'; },
      getInputTargetBlock() { return null; },
    };
    const code = js['data_setvariableto'](block);
    // _jsString uses JSON.stringify so apostrophes/backslashes are safe.
    assert.match(code, /_watch\.set\("it\\\\'s",\s*v_it__s\);/);
  } finally {
    js.valueToCode = origValueToCode;
  }
});

test('data_changevariableby generator emits the watch call after the add', () => {
  const { Blockly, workspace } = setupGenerators();
  const js = Blockly.JavaScript;
  const origValueToCode = js.valueToCode;
  js.valueToCode = () => '1';
  try {
    const block = {
      workspace,
      getFieldValue() { return 'err-id'; },
      getInputTargetBlock() { return null; },
    };
    const code = js['data_changevariableby'](block);
    assert.match(code, /v_error\s*=\s*\(Number\(v_error\)\s*\|\|\s*0\)\s*\+\s*\(Number\(1\)\s*\|\|\s*0\);\s*_watch\.set\("error",\s*v_error\);/);
  } finally {
    js.valueToCode = origValueToCode;
  }
});

test('generateBlocklyJS preamble declares each variable into _watch', () => {
  const { Blockly, env } = setupGenerators();
  const js = Blockly.JavaScript;
  const origWorkspaceToCode = js.workspaceToCode;
  js.workspaceToCode = () => '';
  try {
    const stub = {
      getAllVariables() {
        return [{ name: 'error' }, { name: 'has spaces!' }];
      },
    };
    const code = env.window.generateBlocklyJS(stub);
    assert.ok(code.includes('const _watch = window._watch;'),
      'captures window._watch into the AsyncFunction scope');
    assert.ok(code.includes('_watch.declare("error", v_error);'),
      'declares each variable with its display name');
    assert.ok(code.includes('_watch.declare("has spaces!", v_has_spaces_);'),
      'preserves the display name even when the JS identifier was sanitized');
  } finally {
    js.workspaceToCode = origWorkspaceToCode;
  }
});
```

Keep the existing `data_variable` test (it's unaffected — the reporter generator still returns the sanitized identifier).

Find the existing `'data_changevariableby generator emits numeric add with coercion'` test (the broad-regex one). **Replace** its body with the new version above (the one that also asserts the `_watch.set` suffix). The new regex still matches the math — it just also requires the watch call to follow.

- [ ] **Step 3: Run tests, verify they fail**

Run: `npm run test:js -- tests/js/blockly/`
Expected: the four tests above FAIL because the generators don't emit `_watch.set` or `_watch.declare` yet.

- [ ] **Step 4: Add the helpers and update the generators**

In `js/blockly_config.js`, find `_sanitizeVarName` (around line 3605). Immediately after `if (typeof window !== 'undefined') window._sanitizeVarName = _sanitizeVarName;`, add:

```js
// Display-name lookup: returns the unsanitized Scratch variable name (what
// the user typed), for the watch panel. Sibling of _varNameOf which returns
// the sanitized JS identifier.
function _displayNameOf(block) {
  const id = block.getFieldValue('VARIABLE');
  const ws = block.workspace;
  const v = ws && ws.getVariableById ? ws.getVariableById(id) : null;
  return (v && v.name) ? v.name : id;
}

// Safe-quote a string for inlining into generated JS source. JSON.stringify
// handles every character that would otherwise break a single-quoted literal
// (quotes, backslashes, newlines, control chars).
function _jsString(s) {
  return JSON.stringify(String(s == null ? '' : s));
}

if (typeof window !== 'undefined') {
  window._displayNameOf = _displayNameOf;
  window._jsString      = _jsString;
}
```

Now find the `data_setvariableto` and `data_changevariableby` generators (around line 1918–1921). Replace them with:

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

(`_displayNameOf` and `_jsString` are both in the module's closure when registerGenerators runs.)

Find `generateBlocklyJS` (around line 3629). Just inside the function, before the `preamble` array construction, locate the `userVarDecls` assignment (around line 3657). Below it, add:

```js
  const watchDecls = userVars
    .map(v => `_watch.declare(${_jsString(v.name)}, ${_sanitizeVarName(v.name)});`)
    .join('\n');
```

Then in the `preamble` array (`[ ... ]`), find `userVarDecls,` near the end (just before `].filter(Boolean).join('\n')`). Replace `userVarDecls,` with:

```js
    'const _watch = window._watch || { declare(){}, set(){}, clear(){} };',
    userVarDecls,
    watchDecls,
```

The fallback object (`{ declare(){}, set(){}, clear(){} }`) means the generated AsyncFunction still runs cleanly when `window._watch` happens not to be installed (e.g. some test path) — it just no-ops instead of throwing on `_watch.set(...)`.

- [ ] **Step 5: Run tests, verify they pass**

Run: `npm run test:js -- tests/js/blockly/`
Expected: all new tests PASS. The pre-existing `data_variable` test still passes. The pre-existing preamble test (`generateBlocklyJS preamble declares each workspace variable`) still passes because its `var v_error = 0;` substring check is unaffected.

- [ ] **Step 6: Run the full JS suite to catch regressions**

Run: `npm run test:js`
Expected: all green. If a Blockly behavior test breaks, the likely cause is the new `_watch.set(...)` call appearing in code emitted by a behavior test that doesn't define `window._watch`. The fallback added in Step 4 should prevent that. If it doesn't, find the failing test and confirm the AsyncFunction body now contains the fallback line.

- [ ] **Step 7: Commit**

```bash
git add js/blockly_config.js tests/js/blockly/data-variables-generators.test.js
git commit -m "$(cat <<'EOF'
feat(watch): Blockly codegen feeds the watch panel

data_setvariableto and data_changevariableby generators emit a
trailing _watch.set(displayName, sanitized) on the same line as the
assignment — same statement so the panel can't lag the variable
write across an await. generateBlocklyJS preamble captures
window._watch (with a no-op fallback) and emits _watch.declare for
every workspace variable so empty-but-declared variables still show.

New helpers _displayNameOf and _jsString live next to
_sanitizeVarName. Tests cover the watch-call format, the JSON
escaping for quotes/backslashes in variable names, and the preamble
declares.
EOF
)"
```

---

## Task 6: `sim.watch()` helper in Python

**Files:**
- Modify: `py/spike_bridge.py` (new `_Sim` class, `sys.modules['sim']` registration)
- Create: `tests/py/test_sim_watch.py`

Mirrors `tests/py/test_print.py`. The `bridge_mock` records the `var_update` commands `sim.watch` posts; assertions confirm the name and value reach the bridge correctly for positional, kwargs, and mixed forms.

- [ ] **Step 1: Write the failing tests**

Create `tests/py/test_sim_watch.py`:

```python
"""
Tests that sim.watch() posts var_update bridge commands.
"""
import unittest
import mock_js
import spike_bridge as sb


class TestSimWatch(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_positional_form_posts_one_var_update(self):
        from sim import watch
        watch('score', 42)
        cmd = mock_js.bridge_mock.last()
        self.assertEqual(cmd['type'], 'var_update')
        self.assertEqual(cmd['name'], 'score')
        self.assertEqual(cmd['value'], 42)

    def test_kwarg_form_posts_one_var_update(self):
        from sim import watch
        watch(score=42)
        cmd = mock_js.bridge_mock.last()
        self.assertEqual(cmd['type'], 'var_update')
        self.assertEqual(cmd['name'], 'score')
        self.assertEqual(cmd['value'], 42)

    def test_multiple_kwargs_post_multiple_var_updates_in_order(self):
        from sim import watch
        watch(score=10, ready=True, lap=3)
        cmds = mock_js.bridge_mock.all()
        # 3 kwargs → 3 updates
        self.assertEqual(len(cmds), 3)
        for c in cmds:
            self.assertEqual(c['type'], 'var_update')
        # MicroPython 1.28 preserves insertion order on dict; CPython 3.7+ same.
        names = [c['name'] for c in cmds]
        self.assertEqual(names, ['score', 'ready', 'lap'])
        values = [c['value'] for c in cmds]
        self.assertEqual(values, [10, True, 3])

    def test_positional_plus_kwargs_post_in_positional_first_order(self):
        from sim import watch
        watch('a', 1, b=2, c=3)
        cmds = mock_js.bridge_mock.all()
        self.assertEqual([c['name']  for c in cmds], ['a', 'b', 'c'])
        self.assertEqual([c['value'] for c in cmds], [1, 2, 3])

    def test_positional_name_coerced_to_str(self):
        # We accept any name input but always send a string.
        from sim import watch
        watch(123, 'value')
        cmd = mock_js.bridge_mock.last()
        self.assertEqual(cmd['name'], '123')

    def test_string_value_passes_through_unchanged(self):
        from sim import watch
        watch('greet', 'hello')
        self.assertEqual(mock_js.bridge_mock.last()['value'], 'hello')

    def test_bool_value_passes_through_unchanged(self):
        from sim import watch
        watch('ready', False)
        self.assertEqual(mock_js.bridge_mock.last()['value'], False)

    def test_list_value_passes_through_unchanged(self):
        from sim import watch
        watch('xs', [1, 2, 3])
        self.assertEqual(mock_js.bridge_mock.last()['value'], [1, 2, 3])

    def test_watch_interleaves_with_motor_commands(self):
        from sim import watch
        sb.motor_pair.move_for_degrees(0, 360, steering=0, velocity=500)
        watch('checkpoint', 1)
        sb.motor_pair.stop(0)
        types = [c['type'] for c in mock_js.bridge_mock.all()]
        # The watch update sits between the two motor commands.
        self.assertEqual(types.count('var_update'), 1)
        idx = types.index('var_update')
        self.assertEqual(types[idx - 1], 'move')
        self.assertEqual(types[idx + 1], 'stop')


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm run test:py:cpython`
Expected: `ModuleNotFoundError: No module named 'sim'`.

- [ ] **Step 3: Add `_Sim` and register the module in `py/spike_bridge.py`**

In `py/spike_bridge.py`, find the block of `sys.modules['...']` assignments near the end of "Phase 6: Module injection" (around line 729). Just *before* that block, add the class and instance:

```python
# ── sim: simulator-only helpers ──────────────────────────────────────────────
# This module is NOT in the official Spike Prime API; it's exposed by the
# simulator so kids can push values to the live watch panel directly. v1 has
# one function: watch(name, value) or watch(name=value, ...).
class _Sim:
    @staticmethod
    def watch(name=None, value=None, **kwargs):
        last = None
        if name is not None:
            last = _bridge_call({'type': 'var_update',
                                 'name': str(name), 'value': value})
        for k, v in kwargs.items():
            last = _bridge_call({'type': 'var_update',
                                 'name': k, 'value': v})
        return last

sim = _Sim()
```

Then in the `sys.modules` block, add the registration:

```python
sys.modules['sim'] = sim
```

Place it alongside the others (the order in that block isn't significant; group it with `app` and the rest of the simulator-aware modules).

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm run test:py:cpython`
Expected: the new tests PASS.

Run: `npm run test:py`
Expected: the MicroPython runner also passes. (If it fails on import, double-check that `sim` is registered before the `_handle_run` definition so module discovery works during user `exec`.)

- [ ] **Step 5: Commit**

```bash
git add py/spike_bridge.py tests/py/test_sim_watch.py
git commit -m "$(cat <<'EOF'
feat(watch): sim.watch() Python helper for the watch panel

New _Sim class with a watch(name, value, **kwargs) static method
that posts {type:'var_update', name, value} bridge commands. Three
call forms supported: positional, single kwarg, multiple kwargs.
Order of bridge messages is positional first, then kwargs in
insertion order.

sys.modules['sim'] is set alongside the existing module
registrations so user code does `from sim import watch`.
EOF
)"
```

---

## Task 7: `var_update` bridge command case

**Files:**
- Modify: `js/simulator.js` (new case in the command dispatch switch)
- Modify: `tests/js/commands/dispatch.test.js` (assert the case forwards to `window._watch.set` and returns `{}`)

- [ ] **Step 1: Find the dispatch switch**

Run: `grep -n "case '" js/simulator.js | head -20`
Expected: a sequence of `case 'pair':`, `case 'move':`, etc. Pick the file location to add the new case (any spot in the switch is fine; group with `'print'` since both are passive UI updates).

- [ ] **Step 2: Write the failing test**

In `tests/js/commands/dispatch.test.js`, find a good spot in the file (near the existing `'print:'` tests, if any, or anywhere in the non-physics section). Add:

```js
test('var_update: forwards to window._watch.set and returns empty result', async () => {
  const sim = createSim();
  const watchCalls = [];
  // Inject a fake _watch onto whatever globalThis the sim sees.
  // createSim's sandbox installs window === globalThis, so this works.
  global.window = global.window || {};
  global.window._watch = {
    set(name, value) { watchCalls.push({ name, value }); },
  };
  const result = await sim._execCmd({ type: 'var_update', name: 'score', value: 42 });
  assert.deepEqual(watchCalls, [{ name: 'score', value: 42 }]);
  assert.deepEqual(result, {});
  delete global.window._watch;
});

test('var_update: missing window._watch does not throw', async () => {
  const sim = createSim();
  delete global.window;          // simulate the panel script not loaded
  const result = await sim._execCmd({ type: 'var_update', name: 'x', value: 1 });
  assert.deepEqual(result, {});
});
```

(If `createSim` doesn't wire `window` to globalThis, adapt the test — but for the current sim-helper it does, per the existing dispatch tests.)

- [ ] **Step 3: Run tests, verify they fail**

Run: `npm run test:js -- tests/js/commands/dispatch.test.js`
Expected: the two new tests FAIL with something like "Unknown command type 'var_update'" or a returned value that isn't `{}`.

- [ ] **Step 4: Add the case**

Find the switch in `js/simulator.js`'s `_execCmd` / `executeCommand`. Add (near the `'print'` case if it exists, else anywhere in the switch):

```js
      case 'var_update':
        if (typeof window !== 'undefined' && window._watch) {
          window._watch.set(cmd.name, cmd.value);
        }
        return {};
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `npm run test:js -- tests/js/commands/dispatch.test.js`
Expected: the two new tests PASS, and no existing dispatch test regresses.

- [ ] **Step 6: Commit**

```bash
git add js/simulator.js tests/js/commands/dispatch.test.js
git commit -m "$(cat <<'EOF'
feat(watch): wire var_update bridge command to window._watch.set

New case 'var_update' in _execCmd forwards cmd.name/cmd.value to
window._watch.set and returns {} so the Python-side awaitable
resolves immediately. Guarded against window._watch being absent
(e.g. in tests that don't install the panel) so the bridge stays
robust if the script ever fails to load.
EOF
)"
```

---

## Task 8: Monaco completion for `sim.watch`

**Files:**
- Modify: `js/monaco_config.js` (add `sim` to `SPIKE_API`)

The `SPIKE_API` table feeds Monaco completion + signature help + hover. Adding `sim` makes `sim.watch(` show a parameter hint and lets `sim.` trigger completion.

- [ ] **Step 1: Read the existing SPIKE_API shape**

Run: `grep -n -A 6 "SPIKE_API\s*=" js/monaco_config.js | head -25`
Expected: an object with keys like `motor`, `motor_pair`, `color_sensor`, each containing `members` and `constants`.

- [ ] **Step 2: Add a `sim` module entry**

Find the end of the `SPIKE_API` table (the last `},` that closes the last module). Add a new entry following the existing pattern. Use the exact same shape as a nearby simple module (e.g. `force_sensor`); the watch method has a single primary signature plus the kwargs form documented in the hover:

```js
  sim: {
    members: {
      watch: {
        sig: 'watch(name, value)',
        doc: 'Show a variable in the watch panel. Pass a name and value (\
`sim.watch("score", score)`), a single kwarg (`sim.watch(score=score)`), \
or multiple kwargs (`sim.watch(score=score, ready=ready)`). Simulator-only \
— no real LEGO hub equivalent. The panel updates only at the moment of \
the call.',
        params: ['name', 'value'],
      },
    },
    constants: {},
  },
```

(Adjust the surrounding commas and indentation to match the file's style. If your file uses tabs vs. spaces, follow the file's convention — `git diff -w` after your edit should be empty when you trim whitespace differences.)

- [ ] **Step 3: Manual verification**

There's no Monaco-specific test harness; verify in the browser:

```bash
python3 -m http.server 8787
```

Open the page, create a Python project (or stay on the Python tab if your project type is Python). In the editor, type:

```python
from sim import watch
watch(
```

Hit `(` and confirm the signature hint shows `watch(name, value)` with the doc string. Type `sim.` (after `import sim`) and confirm `watch` appears in the completion list.

- [ ] **Step 4: Commit**

```bash
git add js/monaco_config.js
git commit -m "$(cat <<'EOF'
feat(watch): Monaco completion + signature hint for sim.watch

SPIKE_API gets a sim module entry with a single member watch(name,
value); the doc string documents all three call forms (positional,
single kwarg, multiple kwargs) and notes that it's simulator-only.
EOF
)"
```

---

## Final smoke test

The end-to-end behaviour is best verified in a browser since the panel involves CSS animation, DOM events, and the worker bridge. Two-mode check:

- [ ] **Step 1: Blocks-project smoke**

Start the server (`python3 -m http.server 8787`), open the page, create a Blocks project (or stay on a Blocks tab). Build a small program:

- `when program starts`
- `set "score" to 0`
- `repeat 5`
- `change "score" by 1`
- `wait 200 ms`

Run it. Verify:
- The console strip splits — output on the left, the watch pane on the right.
- The `score` row appears at value `0` immediately on Run (via `_watch.declare`).
- Each iteration the value increments and the row flashes amber for ~600ms.
- After the program finishes, the row stays at its final value.
- Run again — the panel clears at the start, then re-populates.
- Drag the handle between the panes — both resize within their min widths.
- Reload — the width persists.
- Collapse the console via its header — both panes fold together.

- [ ] **Step 2: Python-project smoke**

Create or switch to a Python project. Paste:

```python
from sim import watch
import motor_pair, runloop
from hub import port

async def main():
    motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)
    score = 0
    for i in range(5):
        score = score + 10
        watch('score', score, iter=i)
        await runloop.sleep_ms(200)
    watch(done=True)

runloop.run(main())
```

Run it. Verify:
- `score`, `iter`, and `done` all appear in the panel.
- `score` and `iter` update each iteration with a flash.
- `done` appears at the end as `true`.
- Console output is unaffected by the watch panel taking up its right side.

- [ ] **Step 3: Final commit if any touch-ups were needed**

If the smoke surfaced a small bug, fix it and commit:

```bash
git commit -m "fix(watch): <one-line fix description>"
```

Otherwise skip.

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| `window._watch.declare/set/clear/_snapshot` | 1 |
| rAF-coalesced render | 1 |
| Sorted alphabetically by display name | 1 |
| Value formatting (int/float/string/bool/array/null) | 1 |
| Change flash with 600ms decay, no flash on no-change | 1 |
| Hidden when empty, slide-in animation | 1 (JS) + 2 (CSS) |
| `.watch-pane` next to `.console-output-pane`, split inside `#console-wrap` | 2 |
| `index.html` restructure keeping `#console-output` ID stable for `appendOutput` | 2 |
| Console-collapse coexistence (both fold together) | 2 (`#console-wrap.collapsed .console-content-row { display: none }`) |
| `handleRun` clears the watch | 3 |
| Drag resize with persistence and min widths | 4 |
| Blockly: instrument `data_setvariableto` and `data_changevariableby` | 5 |
| Blockly: `_displayNameOf` and `_jsString` helpers | 5 |
| Blockly: preamble declares + capture `const _watch = window._watch` | 5 |
| Python: `sim.watch` helper with three call forms | 6 |
| Bridge `var_update` case | 7 |
| Monaco completion / signature for `sim.watch` | 8 |
| Variable-name escaping risk mitigation (`_jsString`) | 5 (test exercises a quote) |
| Generator-side ordering risk mitigation (same-line emit) | 5 (regex asserts trailing `_watch.set` after `;`) |
| Namespace collision risk mitigation | Spec audit — no code change needed |
| Staleness between `sim.watch` calls | Documented in spec — no code change |
| `sys._getframe` unavailable on PyScript MP | Spec only; test page already committed at `prototypes/flocals-test/` |
