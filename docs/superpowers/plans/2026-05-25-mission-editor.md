# Mission Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the visual Mission Editor — a third app mode where authors place obstacles/zones/robot-start visually, write steps with title/points/hint, build conditions with a Blockly block palette, **playtest in-place**, and (in the final phase) save/load as `.llmission` files. This is Plan 2 of the missions roadmap; Plan 1 (foundations) is already shipped.

**Architecture:** A pure editor-state model (a mission-shaped object plus selection/dirty flags) lives in `mission_editor_state.js`. Every UI surface — canvas drag/drop, metadata form, step list, condition picker — mutates that state through named operations and re-renders. The state serializes back to a `mission.json` exactly matching Plan 1's schema, so Playtest is just "hand the serialized mission to `MISSIONS.app.enterPlay()`." File I/O is added last and uses the same serializer.

**Tech Stack:** Vanilla JS UMD modules (`(function(global){ global.MISSIONS.editor = ...; })(window)`), `node:test` for tests, JSZip from CDN for `.llmission` ZIP, Blockly (already loaded) for the condition picker. No new dependencies.

**Position in the larger roadmap:** Plan 1 (foundations) merged on `feat/missions-design`. This plan builds on top — same branch, same worktree. After this plan ships, the only remaining work in the spec is Plan 3 (a browseable library UI to replace the current `#mission=<id>` URL-hash entry).

---

## File Structure

**New source files:**
- `js/mission_editor_state.js` — pure editor-state model + named mutation operations + `serializeToMission()`. No DOM.
- `js/mission_editor_field.js` — canvas overlay edit mode: drag handles, click-to-place, selection model.
- `js/mission_editor_meta.js` — right-panel metadata form binding.
- `js/mission_editor_steps.js` — step list renderer + add/reorder/delete/edit.
- `js/mission_editor_conditions.js` — Blockly condition workspace (six predicate blocks + generator + state sync).
- `js/mission_editor_playtest.js` — Playtest button handler: serialize → temp save → enter Play mode → "Back to Editor" wiring.
- `js/mission_editor_io.js` — `.llmission` ZIP read/write + screenshot capture + file-picker / drag-drop wiring.
- `js/mission_editor_app.js` — editor mode lifecycle: mounts/unmounts all the above, manages the `data-mode="editor"` body attribute, owns the editor's lifetime.

**New CSS:**
- `css/mission_editor.css` — editor-mode toolbar, full-interface swap rules (`body[data-mode="editor"] ...`), right panel styling, condition workspace styling, drag-handle styling.

**Modified source files:**
- `js/mission_app.js` — add `'editor'` as a third mode; extend `boot()` to register editor when MISSIONS.editor is present.
- `index.html` — add editor toolbar markup (Save / Load / Playtest / Exit), editor right panel scaffold, condition workspace container, header "+ New Mission" wiring (existing 🎯 button).
- `js/main.js` — gate Run/Stop visibility (no Run in editor mode), wire 🎯 button to open editor for new mission.

**New test files:**
- `tests/js/missions/editor-state.test.js`
- `tests/js/missions/editor-serializer.test.js`
- `tests/js/missions/editor-field.test.js`
- `tests/js/missions/editor-meta.test.js`
- `tests/js/missions/editor-steps.test.js`
- `tests/js/missions/editor-conditions.test.js`
- `tests/js/missions/editor-playtest.test.js`
- `tests/js/missions/editor-io.test.js`
- `tests/js/missions/editor-app.test.js`
- `tests/js/integration/editor-playtest-roundtrip.test.js` — Phase E milestone test
- `tests/js/integration/editor-save-load-roundtrip.test.js` — Phase F milestone test

---

## Phase Map

Each phase ends in a runnable commit checkpoint.

| Phase | Ships | Tasks |
|---|---|---|
| **A. State + shell** | Editor state model, serializer, editor-mode shell visible on demand | 1–5 |
| **B. Field editor** | Drag/place obstacles, zones, robot start on the canvas | 6–11 |
| **C. Metadata + steps** | Right-panel metadata form + step list (add / reorder / delete) | 12–16 |
| **D. Condition picker** | Per-step Blockly workspace with six predicate blocks | 17–22 |
| **E. Playtest** | Serialize → temp save → switch to Play mode → return to Editor (**first assessment**) | 23–26 |
| **F. File I/O** | Save → `.llmission` download, Open → file picker / drag-drop, screenshot capture | 27–32 |

---

## Task 0: Phase Boundary Helper (test harness extension)

The editor tests need DOM richer than what `tests/js/mocks/missions-env.js` provides. Add a richer DOM mock alongside the existing test infrastructure — but reuse it across all editor tests.

**Files:**
- Create: `tests/js/mocks/editor-dom.js`
- Test: none (a mock, exercised by the editor tests in later tasks)

- [ ] **Step 1: Confirm clean baseline**

```bash
git status
npm test
```
Expected: working tree clean (or only the `.DS_Store` macOS noise), 741 tests pass, 0 fail.

- [ ] **Step 2: Create the DOM mock**

Create `tests/js/mocks/editor-dom.js`:

```javascript
'use strict';

// Richer DOM mock for editor tests: tracks parent/child, listeners, dataset,
// classList with toggle, attributes, and a working querySelector for class
// and id selectors only (no descendant combinators, no pseudo-classes).
// Mirrors the makeEl pattern in tests/js/mocks/main-env.js but adds enough
// to drive multi-element editor flows.

function makeEl(tag) {
  const listeners = {};
  const el = {
    tag,
    parentEl: null,
    children: [],
    attrs: {},
    style: {},
    dataset: {},
    classList: {
      _set: new Set(),
      add(...cs)       { for (const c of cs) this._set.add(c); },
      remove(...cs)    { for (const c of cs) this._set.delete(c); },
      contains(c)      { return this._set.has(c); },
      toggle(c, on)    {
        const want = (on === undefined) ? !this._set.has(c) : !!on;
        if (want) this._set.add(c); else this._set.delete(c);
        return want;
      },
      get length()     { return this._set.size; },
    },
    textContent: '',
    innerHTML: '',
    value: '',
    hidden: false,
    disabled: false,
    appendChild(c) {
      if (c.parentEl) c.parentEl.removeChild(c);
      this.children.push(c);
      c.parentEl = this;
      return c;
    },
    removeChild(c) {
      const i = this.children.indexOf(c);
      if (i >= 0) { this.children.splice(i, 1); c.parentEl = null; }
      return c;
    },
    insertBefore(newC, refC) {
      if (newC.parentEl) newC.parentEl.removeChild(newC);
      const i = refC ? this.children.indexOf(refC) : this.children.length;
      this.children.splice(i < 0 ? this.children.length : i, 0, newC);
      newC.parentEl = this;
      return newC;
    },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k)    { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; },
    addEventListener(name, cb) {
      (listeners[name] = listeners[name] || []).push(cb);
    },
    removeEventListener(name, cb) {
      const arr = listeners[name];
      if (!arr) return;
      const i = arr.indexOf(cb);
      if (i >= 0) arr.splice(i, 1);
    },
    _fire(name, event) {
      const arr = listeners[name] || [];
      for (const cb of arr.slice()) cb(event || { type: name, target: el });
    },
    _click() { this._fire('click'); },
    querySelector(sel) {
      return _findFirst(this, sel);
    },
    querySelectorAll(sel) {
      const out = [];
      _findAll(this, sel, out);
      return out;
    },
    focus() {},
    blur() {},
    click() { this._click(); },
    getBoundingClientRect() {
      return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    },
  };
  return el;
}

function _matches(el, sel) {
  if (sel.startsWith('#')) return el.attrs.id === sel.slice(1);
  if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));
  return el.tag === sel;
}

function _findFirst(root, sel) {
  for (const c of root.children) {
    if (_matches(c, sel)) return c;
    const inner = _findFirst(c, sel);
    if (inner) return inner;
  }
  return null;
}

function _findAll(root, sel, out) {
  for (const c of root.children) {
    if (_matches(c, sel)) out.push(c);
    _findAll(c, sel, out);
  }
}

function makeDoc() {
  const idIndex = Object.create(null);
  const doc = {
    documentElement: makeEl('html'),
    body: makeEl('body'),
    _idIndex: idIndex,
    getElementById(id) { return idIndex[id] || null; },
    createElement(tag) {
      const el = makeEl(tag);
      const origSet = el.setAttribute.bind(el);
      el.setAttribute = function (k, v) {
        origSet(k, v);
        if (k === 'id') idIndex[v] = this;
      };
      Object.defineProperty(el, 'id', {
        get() { return el.attrs.id || ''; },
        set(v) { el.attrs.id = String(v); idIndex[v] = el; },
      });
      return el;
    },
    addEventListener() {},
    removeEventListener() {},
    querySelector(sel)    { return _findFirst(doc.body, sel); },
    querySelectorAll(sel) { const out = []; _findAll(doc.body, sel, out); return out; },
  };
  return doc;
}

// Pre-seeds a doc with the static editor HTML scaffold IDs that all editor
// modules read on mount. Each id maps to an empty createElement('div')-style
// element so modules can read/write textContent, attributes, children, etc.
function makeEditorDoc(idsExtra = []) {
  const doc = makeDoc();
  const ids = [
    // toolbar + shell
    'editor-toolbar', 'editor-title-input', 'btn-editor-save',
    'btn-editor-load', 'btn-editor-playtest', 'btn-editor-exit',
    'editor-canvas-overlay', 'editor-right-panel',
    // metadata
    'editor-meta-desc', 'editor-meta-difficulty', 'editor-meta-type',
    // steps
    'editor-steps-list', 'btn-add-step',
    // conditions
    'editor-cond-workspace',
    // shared with Plan 1 (sandbox surfaces hidden in editor mode)
    'mission-map', 'mission-map-title',
  ].concat(idsExtra);
  for (const id of ids) {
    const el = doc.createElement('div');
    el.setAttribute('id', id);
    doc.body.appendChild(el);
  }
  return doc;
}

module.exports = { makeEl, makeDoc, makeEditorDoc };
```

- [ ] **Step 3: Commit**

```bash
git add tests/js/mocks/editor-dom.js
git commit -m "test(editor): add richer DOM mock for editor tests"
```

---

# Phase A: Editor State Model + Mode Shell

Phase A delivers a state object you can mutate via named ops, a serializer that produces a Plan 1-compatible `mission.json`, and an editor mode that visually replaces the sandbox UI when entered. No interactive editing yet — that's Phase B.

---

## Task 1: Editor State Factory

A new editor starts with a blank mission scaffold: default title, beginner tier, mission type, empty field, no steps, step_sum scoring, and selection=null.

**Files:**
- Create: `js/mission_editor_state.js`
- Test: `tests/js/missions/editor-state.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/js/missions/editor-state.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_editor_state',
  ]).ctx;
}

test('createBlank: produces an editor state with default scaffolding', () => {
  const ctx = env();
  const s = ctx.MISSIONS.editor.state.createBlank();
  assert.strictEqual(s.title, 'Untitled Mission');
  assert.strictEqual(s.type, 'mission');
  assert.strictEqual(s.difficulty_tier, 'beginner');
  assert.deepStrictEqual(s.field.obstacles, []);
  assert.deepStrictEqual(s.field.zones, []);
  assert.deepStrictEqual(s.field.robot_start, { x: 350, y: 163, heading: 90 });
  assert.deepStrictEqual(s.steps, []);
  assert.deepStrictEqual(s.scoring, { kind: 'step_sum' });
  assert.strictEqual(s.selection, null);
  assert.strictEqual(s.dirty, false);
});

test('createBlank: each call returns an independent object (no shared mutation)', () => {
  const ctx = env();
  const a = ctx.MISSIONS.editor.state.createBlank();
  const b = ctx.MISSIONS.editor.state.createBlank();
  a.field.obstacles.push({ id: 'x' });
  assert.deepStrictEqual(b.field.obstacles, []);
});

test('createBlank: id is a short kebab-case slug', () => {
  const ctx = env();
  const s = ctx.MISSIONS.editor.state.createBlank();
  assert.match(s.id, /^[a-z0-9-]+$/, `expected kebab-case id, got "${s.id}"`);
  assert.ok(s.id.length >= 4 && s.id.length <= 32, `id too short/long: "${s.id}"`);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/missions/editor-state.test.js
```
Expected: FAIL — `mission_editor_state.js` not found.

- [ ] **Step 3: Write minimal implementation**

Create `js/mission_editor_state.js`:

```javascript
'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  const editor = (MISSIONS.editor = MISSIONS.editor || {});

  function newId() {
    // 6-char kebab-case id, lowercase a-z 0-9
    const alpha = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += alpha[Math.floor(Math.random() * alpha.length)];
    return `m-${s}`;
  }

  function createBlank() {
    return {
      id: newId(),
      title: 'Untitled Mission',
      description: '',
      author: '',
      type: 'mission',
      difficulty_tier: 'beginner',
      field: {
        robot_start: { x: 350, y: 163, heading: 90 },
        zones: [],
        obstacles: [],
      },
      steps: [],
      scoring: { kind: 'step_sum' },
      modifiers: { available: [], defaults: {} },
      selection: null,
      dirty: false,
    };
  }

  editor.state = { createBlank, newId };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/js/missions/editor-state.test.js
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add js/mission_editor_state.js tests/js/missions/editor-state.test.js
git commit -m "feat(editor): editor state factory with blank-mission scaffold"
```

---

## Task 2: Editor State Mutation Operations

All edits go through named ops that take state + args and return mutated state. Each op also sets `dirty = true`. This task adds the obstacle/zone/start operations; step operations come in Phase C.

**Files:**
- Modify: `js/mission_editor_state.js`
- Test: `tests/js/missions/editor-state.test.js` (extend)

- [ ] **Step 1: Add the failing tests**

Append to `tests/js/missions/editor-state.test.js`:

```javascript
const FIELD_OPS_BASE = () => {
  const ctx = env();
  return { ctx, s: ctx.MISSIONS.editor.state.createBlank() };
};

test('addObstacle: appends an obstacle with a generated id and default size', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  const next = ctx.MISSIONS.editor.state.addObstacle(s, { x: 500, y: 500 });
  assert.strictEqual(next.field.obstacles.length, 1);
  const o = next.field.obstacles[0];
  assert.strictEqual(typeof o.id, 'string');
  assert.strictEqual(o.shape, 'rect');
  assert.strictEqual(o.x, 500);
  assert.strictEqual(o.y, 500);
  assert.strictEqual(o.w, 100);
  assert.strictEqual(o.h, 100);
  assert.strictEqual(o.label, o.id);  // default label = id
  assert.strictEqual(next.dirty, true);
});

test('addObstacle: ids are sequential when none collide', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  let next = ctx.MISSIONS.editor.state.addObstacle(s, { x: 0, y: 0 });
  next = ctx.MISSIONS.editor.state.addObstacle(next, { x: 0, y: 0 });
  next = ctx.MISSIONS.editor.state.addObstacle(next, { x: 0, y: 0 });
  const ids = next.field.obstacles.map(o => o.id);
  assert.deepStrictEqual(new Set(ids).size, 3, `expected unique ids, got ${ids}`);
});

test('moveObstacle: changes position of the named obstacle, leaves others alone', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  let next = ctx.MISSIONS.editor.state.addObstacle(s, { x: 0, y: 0 });
  next = ctx.MISSIONS.editor.state.addObstacle(next, { x: 0, y: 0 });
  const [a, b] = next.field.obstacles;
  next = ctx.MISSIONS.editor.state.moveObstacle(next, a.id, { x: 999, y: 888 });
  const updated = next.field.obstacles.find(o => o.id === a.id);
  const other   = next.field.obstacles.find(o => o.id === b.id);
  assert.strictEqual(updated.x, 999);
  assert.strictEqual(updated.y, 888);
  assert.strictEqual(other.x, 0);
});

test('resizeObstacle: changes w and h, keeps x and y', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  let next = ctx.MISSIONS.editor.state.addObstacle(s, { x: 10, y: 20 });
  const id = next.field.obstacles[0].id;
  next = ctx.MISSIONS.editor.state.resizeObstacle(next, id, { w: 250, h: 150 });
  const o = next.field.obstacles[0];
  assert.strictEqual(o.w, 250);
  assert.strictEqual(o.h, 150);
  assert.strictEqual(o.x, 10);
  assert.strictEqual(o.y, 20);
});

test('deleteObstacle: removes the named obstacle', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  let next = ctx.MISSIONS.editor.state.addObstacle(s, { x: 0, y: 0 });
  const id = next.field.obstacles[0].id;
  next = ctx.MISSIONS.editor.state.deleteObstacle(next, id);
  assert.strictEqual(next.field.obstacles.length, 0);
});

test('addZone: appends a zone with default 200×200 rect and a color from the palette', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  const next = ctx.MISSIONS.editor.state.addZone(s, { x: 600, y: 500 });
  assert.strictEqual(next.field.zones.length, 1);
  const z = next.field.zones[0];
  assert.strictEqual(z.shape, 'rect');
  assert.strictEqual(z.w, 200);
  assert.strictEqual(z.h, 200);
  assert.ok(/^(red|green|blue|yellow|orange|purple)$/.test(z.color),
    `expected palette color, got "${z.color}"`);
});

test('moveZone / resizeZone / deleteZone behave like obstacle ops', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  let next = ctx.MISSIONS.editor.state.addZone(s, { x: 0, y: 0 });
  const id = next.field.zones[0].id;
  next = ctx.MISSIONS.editor.state.moveZone(next, id, { x: 500, y: 500 });
  assert.strictEqual(next.field.zones[0].x, 500);
  next = ctx.MISSIONS.editor.state.resizeZone(next, id, { w: 333, h: 222 });
  assert.strictEqual(next.field.zones[0].w, 333);
  next = ctx.MISSIONS.editor.state.deleteZone(next, id);
  assert.strictEqual(next.field.zones.length, 0);
});

test('setRobotStart: replaces robot_start pose', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  const next = ctx.MISSIONS.editor.state.setRobotStart(s, { x: 1000, y: 500, heading: 180 });
  assert.deepStrictEqual(next.field.robot_start, { x: 1000, y: 500, heading: 180 });
});

test('every field op sets dirty=true and leaves the input state unchanged', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  const next = ctx.MISSIONS.editor.state.addObstacle(s, { x: 0, y: 0 });
  assert.strictEqual(s.dirty, false, 'input state must not be mutated');
  assert.strictEqual(next.dirty, true);
});

test('setSelection: tracks { kind, id } or null', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  let next = ctx.MISSIONS.editor.state.addObstacle(s, { x: 0, y: 0 });
  const id = next.field.obstacles[0].id;
  next = ctx.MISSIONS.editor.state.setSelection(next, { kind: 'obstacle', id });
  assert.deepStrictEqual(next.selection, { kind: 'obstacle', id });
  next = ctx.MISSIONS.editor.state.setSelection(next, null);
  assert.strictEqual(next.selection, null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/js/missions/editor-state.test.js
```
Expected: FAIL — `addObstacle is not a function` (and similar for all the new ops).

- [ ] **Step 3: Extend the implementation**

Edit `js/mission_editor_state.js`. Add helper + ops below `createBlank`:

```javascript
  const ZONE_COLORS = ['red', 'green', 'blue', 'yellow', 'orange', 'purple'];

  function shortId(prefix) {
    const alpha = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < 4; i++) s += alpha[Math.floor(Math.random() * alpha.length)];
    return `${prefix}-${s}`;
  }

  function clone(state) {
    return {
      ...state,
      field: {
        robot_start: { ...state.field.robot_start },
        zones:     state.field.zones.map(z => ({ ...z })),
        obstacles: state.field.obstacles.map(o => ({ ...o })),
      },
      steps:    state.steps.map(s => ({ ...s, condition: deepClone(s.condition), requires: s.requires ? s.requires.slice() : undefined })),
      scoring:  { ...state.scoring },
      modifiers: { available: state.modifiers.available.slice(), defaults: { ...state.modifiers.defaults } },
      selection: state.selection ? { ...state.selection } : null,
    };
  }

  function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(deepClone);
    const out = {};
    for (const k of Object.keys(obj)) out[k] = deepClone(obj[k]);
    return out;
  }

  function dirty(state) {
    const next = clone(state);
    next.dirty = true;
    return next;
  }

  function addObstacle(state, { x, y }) {
    const next = dirty(state);
    const id = shortId('o');
    next.field.obstacles.push({
      id, shape: 'rect', x, y, w: 100, h: 100, label: id,
    });
    return next;
  }

  function moveObstacle(state, id, { x, y }) {
    const next = dirty(state);
    const o = next.field.obstacles.find(o => o.id === id);
    if (o) { o.x = x; o.y = y; }
    return next;
  }

  function resizeObstacle(state, id, { w, h }) {
    const next = dirty(state);
    const o = next.field.obstacles.find(o => o.id === id);
    if (o) { o.w = w; o.h = h; }
    return next;
  }

  function deleteObstacle(state, id) {
    const next = dirty(state);
    next.field.obstacles = next.field.obstacles.filter(o => o.id !== id);
    return next;
  }

  function addZone(state, { x, y }) {
    const next = dirty(state);
    const id = shortId('z');
    const usedColors = new Set(next.field.zones.map(z => z.color));
    const color = ZONE_COLORS.find(c => !usedColors.has(c)) || ZONE_COLORS[next.field.zones.length % ZONE_COLORS.length];
    next.field.zones.push({
      id, shape: 'rect', x, y, w: 200, h: 200, color,
    });
    return next;
  }

  function moveZone(state, id, { x, y }) {
    const next = dirty(state);
    const z = next.field.zones.find(z => z.id === id);
    if (z) { z.x = x; z.y = y; }
    return next;
  }

  function resizeZone(state, id, { w, h }) {
    const next = dirty(state);
    const z = next.field.zones.find(z => z.id === id);
    if (z) { z.w = w; z.h = h; }
    return next;
  }

  function deleteZone(state, id) {
    const next = dirty(state);
    next.field.zones = next.field.zones.filter(z => z.id !== id);
    return next;
  }

  function setRobotStart(state, { x, y, heading }) {
    const next = dirty(state);
    next.field.robot_start = { x, y, heading };
    return next;
  }

  function setSelection(state, sel) {
    const next = clone(state);
    next.selection = sel ? { ...sel } : null;
    return next;
  }
```

Extend the export:

```javascript
  editor.state = {
    createBlank, newId,
    addObstacle, moveObstacle, resizeObstacle, deleteObstacle,
    addZone, moveZone, resizeZone, deleteZone,
    setRobotStart, setSelection,
    _clone: clone,
  };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/js/missions/editor-state.test.js
```
Expected: PASS (13 tests total: 3 from Task 1 + 10 new).

- [ ] **Step 5: Commit**

```bash
git add js/mission_editor_state.js tests/js/missions/editor-state.test.js
git commit -m "feat(editor): field ops (add/move/resize/delete obstacle+zone, robot start, selection)"
```

---

## Task 3: Editor State → mission.json Serializer

The serializer strips edit-only fields (`selection`, `dirty`) and produces a Plan 1-loader-compatible mission. Validates by passing through `MISSIONS.loader.load()` — anything the loader rejects, the serializer rejects.

**Files:**
- Modify: `js/mission_editor_state.js`
- Test: `tests/js/missions/editor-serializer.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/js/missions/editor-serializer.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_editor_state',
  ]).ctx;
}

test('serializeToMission: blank state + one zone + one step produces a loader-valid mission', () => {
  const ctx = env();
  let s = ctx.MISSIONS.editor.state.createBlank();
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 100, y: 100 });
  const zoneId = s.field.zones[0].id;
  s.steps.push({
    id: 'reach',
    title: 'Reach the zone',
    points: 10,
    condition: { kind: 'zone', subject: 'robot', zone: zoneId },
  });
  s.title = 'Test Mission';

  const raw = ctx.MISSIONS.editor.state.serializeToMission(s);
  assert.strictEqual(raw.schema_version, ctx.MISSIONS.schema.SCHEMA_VERSION);
  assert.strictEqual(raw.title, 'Test Mission');
  assert.ok(!('selection' in raw), 'selection must not appear in serialized output');
  assert.ok(!('dirty' in raw),     'dirty must not appear in serialized output');

  // The loader is the ultimate arbiter: if it accepts, we are valid.
  const mission = ctx.MISSIONS.loader.load(raw);
  assert.strictEqual(mission.id, s.id);
  assert.strictEqual(mission.steps[0].id, 'reach');
});

test('serializeToMission: empty step list on a mission-type fails loader (round-trip catches it)', () => {
  const ctx = env();
  const s = ctx.MISSIONS.editor.state.createBlank();  // no steps
  const raw = ctx.MISSIONS.editor.state.serializeToMission(s);
  // The serializer itself doesn't validate — it's the loader that gates Playtest/Save.
  assert.throws(
    () => ctx.MISSIONS.loader.load(raw),
    /at least one step/);
});

test('serializeToMission: deep-copies field arrays so the loaded mission can be mutated without affecting editor state', () => {
  const ctx = env();
  let s = ctx.MISSIONS.editor.state.createBlank();
  s = ctx.MISSIONS.editor.state.addObstacle(s, { x: 100, y: 100 });
  s.steps.push({
    id: 'a', title: 'a', points: 1,
    condition: { kind: 'contact', obstacle: s.field.obstacles[0].id },
  });
  const raw = ctx.MISSIONS.editor.state.serializeToMission(s);
  raw.field.obstacles[0].x = 9999;
  assert.notStrictEqual(s.field.obstacles[0].x, 9999, 'editor state must not be mutated');
});

test('loadFromMission: takes a loaded mission and returns editor state', () => {
  const ctx = env();
  let s = ctx.MISSIONS.editor.state.createBlank();
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 100, y: 100 });
  s.title = 'Round Trip';
  s.steps.push({
    id: 'reach', title: 'Reach', points: 10,
    condition: { kind: 'zone', subject: 'robot', zone: s.field.zones[0].id },
  });

  const raw = ctx.MISSIONS.editor.state.serializeToMission(s);
  const mission = ctx.MISSIONS.loader.load(raw);
  const editorState = ctx.MISSIONS.editor.state.loadFromMission(mission);

  assert.strictEqual(editorState.title, 'Round Trip');
  assert.strictEqual(editorState.field.zones.length, 1);
  assert.strictEqual(editorState.steps.length, 1);
  assert.strictEqual(editorState.selection, null);
  assert.strictEqual(editorState.dirty, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/missions/editor-serializer.test.js
```
Expected: FAIL — `serializeToMission is not a function`.

- [ ] **Step 3: Extend the implementation**

Add to `js/mission_editor_state.js` (before the `editor.state = ...` export):

```javascript
  function serializeToMission(state) {
    const SCHEMA_VERSION = MISSIONS.schema.SCHEMA_VERSION;
    return {
      schema_version: SCHEMA_VERSION,
      id:              state.id,
      title:           state.title,
      description:     state.description,
      author:          state.author,
      type:            state.type,
      difficulty_tier: state.difficulty_tier,
      field: {
        robot_start: { ...state.field.robot_start },
        zones:       state.field.zones.map(z => ({ ...z })),
        obstacles:   state.field.obstacles.map(o => ({ ...o })),
      },
      steps: state.steps.map(s => ({
        id: s.id,
        title: s.title,
        points: s.points,
        ...(s.hint ? { hint: s.hint } : {}),
        ...(s.requires && s.requires.length ? { requires: s.requires.slice() } : {}),
        condition: deepClone(s.condition),
      })),
      scoring: { ...state.scoring },
      modifiers: { available: state.modifiers.available.slice(), defaults: { ...state.modifiers.defaults } },
    };
  }

  function loadFromMission(mission) {
    const state = createBlank();
    state.id              = mission.id;
    state.title           = mission.title;
    state.description     = mission.description || '';
    state.author          = mission.author || '';
    state.type            = mission.type;
    state.difficulty_tier = mission.difficulty_tier;
    state.field           = {
      robot_start: { ...mission.field.robot_start },
      zones:       (mission.field.zones || []).map(z => ({ ...z })),
      obstacles:   (mission.field.obstacles || []).map(o => ({ ...o })),
    };
    state.steps = mission.steps.map(s => ({
      id: s.id, title: s.title, points: s.points,
      ...(s.hint ? { hint: s.hint } : {}),
      ...(s.requires ? { requires: s.requires.slice() } : {}),
      condition: deepClone(s.condition),
    }));
    state.scoring   = { ...mission.scoring };
    state.modifiers = mission.modifiers
      ? { available: mission.modifiers.available.slice(), defaults: { ...mission.modifiers.defaults } }
      : { available: [], defaults: {} };
    state.selection = null;
    state.dirty     = false;
    return state;
  }
```

Extend the export object to include `serializeToMission, loadFromMission`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/js/missions/editor-serializer.test.js tests/js/missions/editor-state.test.js
```
Expected: PASS (4 + 13 = 17 tests).

- [ ] **Step 5: Commit**

```bash
git add js/mission_editor_state.js tests/js/missions/editor-serializer.test.js
git commit -m "feat(editor): serialize state to mission.json + loadFromMission round-trip"
```

---

## Task 4: Editor Mode HTML Shell + CSS Swap

Add the editor's static HTML scaffold (toolbar + right panel + condition workspace container) to `index.html`, hidden by default. Add CSS rules to hide the sandbox surfaces and show the editor surfaces when `body[data-mode="editor"]`.

**Files:**
- Modify: `index.html`
- Create: `css/mission_editor.css`

- [ ] **Step 1: Add the toolbar markup to index.html**

In `index.html`, after the `</header>` tag (around line 112), and BEFORE `<div class="app-body">`, insert the editor toolbar:

```html
<!-- ── Editor toolbar (visible only when body[data-mode="editor"]) ─── -->
<div class="editor-toolbar" id="editor-toolbar" hidden>
  <div class="editor-toolbar-tag">
    <span class="editor-mode-dot" aria-hidden="true"></span>
    EDITOR MODE
  </div>
  <input type="text" id="editor-title-input" class="editor-title-input"
         placeholder="Mission title" maxlength="80" aria-label="Mission title">
  <button class="btn btn-mini amber" id="btn-editor-save"     type="button">💾 Save</button>
  <button class="btn btn-mini"       id="btn-editor-load"     type="button">📂 Load</button>
  <button class="btn btn-mini green" id="btn-editor-playtest" type="button">▶ Playtest</button>
  <div class="spacer"></div>
  <button class="btn btn-mini danger" id="btn-editor-exit"    type="button">✕ Exit Editor</button>
</div>
```

- [ ] **Step 2: Add the editor right panel and overlay markup**

In `index.html`, AFTER the closing `</div>` of `.panel-right` (it's the line right before `<div class="mission-map" id="mission-map" hidden>`), insert the editor right panel as a sibling of `.panel-right` and `.mission-map`. The exact insertion point is between `</div>  <!-- /.panel-right -->` and `<!-- ── Mission Map panel (right column, hidden unless app.mode === 'play') ──`:

```html
  <!-- ── Editor right panel (metadata + steps + condition picker) ── -->
  <div class="editor-right-panel" id="editor-right-panel" hidden>
    <div class="editor-meta-section">
      <h4>Mission</h4>
      <label class="editor-field">
        <span>Description</span>
        <textarea id="editor-meta-desc" rows="3" placeholder="Describe what the robot should do"></textarea>
      </label>
      <label class="editor-field">
        <span>Type</span>
        <select id="editor-meta-type">
          <option value="mission">Mission (multi-step)</option>
          <option value="obstacle_course">Obstacle Course</option>
        </select>
      </label>
      <label class="editor-field">
        <span>Difficulty</span>
        <select id="editor-meta-difficulty">
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
      </label>
    </div>

    <div class="editor-steps-section">
      <h4>
        Steps
        <button class="btn btn-mini" id="btn-add-step" type="button">＋ Add step</button>
      </h4>
      <ul class="editor-steps-list" id="editor-steps-list"></ul>
    </div>

    <div class="editor-cond-section" id="editor-cond-section" hidden>
      <h4>Condition for selected step</h4>
      <div class="editor-cond-workspace" id="editor-cond-workspace"></div>
    </div>
  </div>
```

- [ ] **Step 3: Add the canvas overlay container**

In `index.html`, inside `.canvas-wrap` (search for `<canvas id="robot-canvas">`), AFTER the `<canvas>` and BEFORE the existing `<div id="canvas-hover" hidden>`, insert:

```html
      <div class="editor-canvas-overlay" id="editor-canvas-overlay" hidden></div>
```

- [ ] **Step 4: Link the new CSS in `<head>`**

Right after the existing `<link rel="stylesheet" href="css/missions.css">`, add:

```html
  <link rel="stylesheet" href="css/mission_editor.css">
```

- [ ] **Step 5: Create css/mission_editor.css**

```css
/* ── Editor mode (body[data-mode="editor"]) ───────────────────────── */

/* Toolbar — hidden by default, shown when editor mode is active. */
.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 18px;
  height: 54px;
  background: linear-gradient(180deg, var(--surface3), var(--surface));
  border-bottom: 1px solid var(--border);
  position: relative;
  flex-shrink: 0;
}
.editor-toolbar[hidden] { display: none; }
.editor-toolbar::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, #a78bfa 0%, var(--amber) 60%, transparent 100%);
}

.editor-toolbar-tag {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.22em;
  color: #a78bfa;
  text-transform: uppercase;
}
.editor-mode-dot {
  width: 8px; height: 8px;
  border-radius: 2px;
  background: #a78bfa;
  box-shadow: 0 0 8px rgba(167,139,250,0.6);
}

.editor-title-input {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 6px 11px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  min-width: 280px;
  font-family: var(--font-ui);
}
.editor-title-input:focus { border-color: var(--blue); outline: none; }

.editor-toolbar .spacer { flex: 1; }

/* Right panel — hidden by default, shown when editor mode is active. */
.editor-right-panel {
  flex: 0 0 340px;
  min-width: 300px;
  max-width: 380px;
  background: var(--surface);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: var(--font-ui);
}
.editor-right-panel[hidden] { display: none; }

.editor-right-panel h4 {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.2em;
  color: var(--text-dim);
  text-transform: uppercase;
  padding: 12px 16px 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.editor-meta-section,
.editor-steps-section,
.editor-cond-section {
  border-bottom: 1px solid var(--border);
  padding-bottom: 12px;
}

.editor-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 16px 10px;
}
.editor-field span {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--text-mid);
  text-transform: uppercase;
}
.editor-field input,
.editor-field textarea,
.editor-field select {
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 6px 10px;
  border-radius: 6px;
  font-family: var(--font-ui);
  font-size: 12px;
  outline: none;
}
.editor-field input:focus,
.editor-field textarea:focus,
.editor-field select:focus { border-color: var(--blue); }
.editor-field textarea { resize: vertical; }

.editor-steps-list {
  list-style: none;
  margin: 0;
  padding: 0 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 320px;
  overflow-y: auto;
}

.editor-cond-workspace {
  height: 280px;
  margin: 0 12px;
  background: #f5f5f7;
  border: 1px solid var(--border2);
  border-radius: 8px;
  overflow: hidden;
}

/* Canvas overlay — hidden by default. */
.editor-canvas-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.editor-canvas-overlay[hidden] { display: none; }
body[data-mode="editor"] .editor-canvas-overlay { pointer-events: auto; }

/* Full-mode swap: when in editor mode, hide sandbox-only surfaces and
   show editor surfaces. */
body[data-mode="editor"] .panel-left,
body[data-mode="editor"] .resize-handle,
body[data-mode="editor"] .canvas-toolbar,
body[data-mode="editor"] .status-bar,
body[data-mode="editor"] .mission-map {
  display: none !important;
}

body[data-mode="editor"] .editor-toolbar,
body[data-mode="editor"] .editor-right-panel,
body[data-mode="editor"] .editor-canvas-overlay {
  display: flex;  /* unhide */
}
body[data-mode="editor"] .editor-canvas-overlay { display: block; }

/* Header signal — gradient line tinted purple in editor mode. */
body[data-mode="editor"] header::before {
  background: linear-gradient(90deg, #a78bfa 0%, var(--amber) 60%, transparent 100%);
}
```

- [ ] **Step 6: Confirm no test regressions**

```bash
npm test
```
Expected: 741 tests pass (the HTML/CSS additions don't affect any test).

- [ ] **Step 7: Commit**

```bash
git add index.html css/mission_editor.css
git commit -m "feat(editor): add editor toolbar, right panel, canvas overlay HTML + CSS swap"
```

---

## Task 5: Editor Mode Mount/Unmount Lifecycle

Add an `editor` mode to `mission_app.js`'s state machine and a small `mission_editor_app.js` module that toggles the `data-mode` attribute and shows/hides the editor surfaces. No interactive behaviour yet — just the on/off plumbing.

**Files:**
- Modify: `js/mission_app.js`
- Create: `js/mission_editor_app.js`
- Test: `tests/js/missions/editor-app.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/js/missions/editor-app.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');
const { makeEditorDoc } = require('../mocks/editor-dom');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_editor_state', 'mission_app', 'mission_editor_app',
  ]).ctx;
}

test('app: enterEditor() switches mode to "editor" and seeds a blank state', () => {
  const ctx = env();
  const app = ctx.MISSIONS.app.create();
  app.enterEditor();
  assert.strictEqual(app.mode, 'editor');
  assert.ok(app.editorState, 'editorState should be initialised');
  assert.strictEqual(app.editorState.title, 'Untitled Mission');
});

test('app: enterEditor(mission) seeds editor state from an existing mission', () => {
  const ctx = env();
  // Build a self-consistent mission via the editor state path.
  let s = ctx.MISSIONS.editor.state.createBlank();
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 100, y: 100 });
  s.steps.push({ id: 'a', title: 'a', points: 1,
    condition: { kind: 'zone', subject: 'robot', zone: s.field.zones[0].id } });
  const raw = ctx.MISSIONS.editor.state.serializeToMission(s);
  const mission = ctx.MISSIONS.loader.load(raw);

  const app = ctx.MISSIONS.app.create();
  app.enterEditor(mission);
  assert.strictEqual(app.editorState.title, mission.title);
  assert.strictEqual(app.editorState.field.zones.length, 1);
});

test('app: exitEditor() returns to sandbox and clears editor state', () => {
  const ctx = env();
  const app = ctx.MISSIONS.app.create();
  app.enterEditor();
  app.exitEditor();
  assert.strictEqual(app.mode, 'sandbox');
  assert.strictEqual(app.editorState, null);
});

test('editor-app.mount(): sets body[data-mode] and unhides editor surfaces', () => {
  const ctx = env();
  const doc = makeEditorDoc();
  const app = ctx.MISSIONS.app.create();
  ctx.MISSIONS.editor.app.attach(app, doc);

  app.enterEditor();
  assert.strictEqual(doc.body.dataset.mode, 'editor');
  assert.strictEqual(doc.getElementById('editor-toolbar').hidden, false);
  assert.strictEqual(doc.getElementById('editor-right-panel').hidden, false);

  app.exitEditor();
  assert.notStrictEqual(doc.body.dataset.mode, 'editor');
  assert.strictEqual(doc.getElementById('editor-toolbar').hidden, true);
});

test('editor-app.attach: wires Exit button to app.exitEditor', () => {
  const ctx = env();
  const doc = makeEditorDoc();
  const app = ctx.MISSIONS.app.create();
  ctx.MISSIONS.editor.app.attach(app, doc);

  app.enterEditor();
  doc.getElementById('btn-editor-exit')._click();
  assert.strictEqual(app.mode, 'sandbox');
});

test('editor-app.attach: title input mirrors editor state', () => {
  const ctx = env();
  const doc = makeEditorDoc();
  const app = ctx.MISSIONS.app.create();
  ctx.MISSIONS.editor.app.attach(app, doc);

  app.enterEditor();
  const input = doc.getElementById('editor-title-input');
  assert.strictEqual(input.value, 'Untitled Mission');

  input.value = 'New name';
  input._fire('input', { target: input });
  assert.strictEqual(app.editorState.title, 'New name');
  assert.strictEqual(app.editorState.dirty, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/missions/editor-app.test.js
```
Expected: FAIL — `app.enterEditor is not a function` (and `MISSIONS.editor.app` not yet defined).

- [ ] **Step 3: Extend `js/mission_app.js`**

Update the `create()` factory to add editor mode. Find the existing `create()` function and replace it with:

```javascript
  function create() {
    const state = { mode: 'sandbox', mission: null, editorState: null };
    const subs = new Set();

    function emit() {
      for (const cb of subs) cb({ mode: state.mode, mission: state.mission, editorState: state.editorState });
    }

    return {
      get mode()        { return state.mode; },
      get mission()     { return state.mission; },
      get editorState() { return state.editorState; },
      enterPlay(mission) {
        state.mode = 'play';
        state.mission = mission;
        state.editorState = null;
        emit();
      },
      enterEditor(missionOrNull) {
        state.mode = 'editor';
        state.mission = null;
        state.editorState = missionOrNull
          ? MISSIONS.editor.state.loadFromMission(missionOrNull)
          : MISSIONS.editor.state.createBlank();
        emit();
      },
      setEditorState(next) {
        state.editorState = next;
        emit();
      },
      exitMission() {
        state.mode = 'sandbox';
        state.mission = null;
        state.editorState = null;
        emit();
      },
      exitEditor() {
        state.mode = 'sandbox';
        state.mission = null;
        state.editorState = null;
        emit();
      },
      onChange(cb) { subs.add(cb); return () => subs.delete(cb); },
    };
  }
```

The `MISSIONS.editor.state` dependency is loaded at `enterEditor` call time, not module load — that lets `mission_app.js` come before `mission_editor_state.js` in the script-tag order without throwing.

- [ ] **Step 4: Create `js/mission_editor_app.js`**

```javascript
'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  const editor = (MISSIONS.editor = MISSIONS.editor || {});

  // Attach the editor mode's DOM lifecycle to an app instance. Idempotent.
  function attach(app, doc) {
    const TOOLBAR_IDS = ['editor-toolbar', 'editor-right-panel'];
    const OVERLAY_ID  = 'editor-canvas-overlay';
    const TITLE_ID    = 'editor-title-input';
    const EXIT_ID     = 'btn-editor-exit';

    function showEditorChrome(on) {
      for (const id of TOOLBAR_IDS) {
        const el = doc.getElementById(id);
        if (el) el.hidden = !on;
      }
      const overlay = doc.getElementById(OVERLAY_ID);
      if (overlay) overlay.hidden = !on;
      if (doc.body) {
        if (on) doc.body.dataset.mode = 'editor';
        else delete doc.body.dataset.mode;
      }
    }

    function syncTitleInputFromState(state) {
      const input = doc.getElementById(TITLE_ID);
      if (input && state) input.value = state.title;
    }

    // Initial: chrome hidden.
    showEditorChrome(false);

    // Title-input → state.
    const titleInput = doc.getElementById(TITLE_ID);
    if (titleInput) {
      titleInput.addEventListener('input', (e) => {
        if (app.mode !== 'editor' || !app.editorState) return;
        const next = MISSIONS.editor.state._clone(app.editorState);
        next.title = (e.target && e.target.value) || '';
        next.dirty = true;
        app.setEditorState(next);
      });
    }

    // Exit button → app.exitEditor.
    const exitBtn = doc.getElementById(EXIT_ID);
    if (exitBtn) exitBtn.addEventListener('click', () => app.exitEditor());

    // Subscribe to mode changes.
    app.onChange(({ mode, editorState }) => {
      const isEditor = (mode === 'editor');
      showEditorChrome(isEditor);
      if (isEditor) syncTitleInputFromState(editorState);
    });
  }

  editor.app = { attach };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
node --test tests/js/missions/editor-app.test.js
```
Expected: PASS (6 tests).

- [ ] **Step 6: Run the full suite**

```bash
npm test
```
Expected: 741 + 6 + (state tests already added) = 762 tests. Adjust expected count to match what npm reports; the important thing is zero failures.

- [ ] **Step 7: Commit**

```bash
git add js/mission_app.js js/mission_editor_app.js tests/js/missions/editor-app.test.js
git commit -m "feat(editor): editor mode lifecycle (enter/exit, DOM toggle, title binding)"
```

---

# Phase A milestone

After Task 5, calling `app.enterEditor()` from the browser console (after wiring boot — see Task 6) shows the editor toolbar and right panel; clicking Exit returns to Sandbox. No interactive editing yet — that's Phase B.

The phases B–F continue in subsequent tasks below. The next chunk follows the same TDD-per-task structure.


---

# Phase B: Field Editor

Phase B adds interactive field placement. Authors click an "Add obstacle / Add zone" button then click the canvas to place an item; selecting an item shows handles and a selection outline; dragging moves the item; pressing Delete removes it. The robot start has a dedicated handle.

The implementation uses **SVG positioned over the canvas** (not a second canvas) so handles, outlines, and hit-testing are first-class DOM elements. In editor mode the simulator suppresses its own obstacle/zone rendering (the editor overlay is authoritative); reference lines (mat, centre circle, black line, launch line) still render so authors have visual anchors.

---

## Task 6: Boot Wiring + 🎯 Button Entry Point

Wire `MISSIONS.editor.app.attach(app, document)` into `mission_app.boot()` so the editor lifecycle is plumbed in at app start. Wire the existing header 🎯 button to `app.enterEditor()` (start a new blank mission). This is the "make Phase A actually visible in the browser" task.

**Files:**
- Modify: `js/mission_app.js`
- Modify: `js/main.js`
- Test: `tests/js/missions/editor-app.test.js` (extend)

- [ ] **Step 1: Add the failing test**

Append to `tests/js/missions/editor-app.test.js`:

```javascript
test('boot: attaches the editor when MISSIONS.editor.app is present', async () => {
  const ctx = env();
  const doc = makeEditorDoc();
  ctx.document = doc;
  const sim = {
    placeRobot() {}, onObstacleContact() { return () => {}; },
    getStateSnapshot() { return { robot: { x: 0, y: 0, heading: 0 }, obstacles: {}, sensors: {} }; },
  };
  const app = await ctx.MISSIONS.boot({
    sim, doc, location: { hash: '' },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  });
  // Editor surfaces start hidden.
  assert.strictEqual(doc.getElementById('editor-toolbar').hidden, true);
  // Enter editor — surfaces unhide via the onChange handler.
  app.enterEditor();
  assert.strictEqual(doc.getElementById('editor-toolbar').hidden, false);
});

test('boot: clicking #btn-missions enters the editor with a blank mission', async () => {
  const ctx = env();
  const doc = makeEditorDoc(['btn-missions']);
  ctx.document = doc;
  const sim = {
    placeRobot() {}, onObstacleContact() { return () => {}; },
    getStateSnapshot() { return { robot: { x: 0, y: 0, heading: 0 }, obstacles: {}, sensors: {} }; },
  };
  const app = await ctx.MISSIONS.boot({
    sim, doc, location: { hash: '' },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  });
  doc.getElementById('btn-missions')._click();
  assert.strictEqual(app.mode, 'editor');
  assert.ok(app.editorState);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/missions/editor-app.test.js
```
Expected: FAIL — the editor isn't attached during boot yet, so `editor-toolbar` stays hidden after `enterEditor()`.

- [ ] **Step 3: Extend `js/mission_app.js`'s boot() function**

Find the `boot()` function (added in Plan 1's Task 19). Add this just after `const ui = MISSIONS.ui.mount(doc);`:

```javascript
    // Attach the editor mode lifecycle (no-op if editor modules aren't loaded).
    if (MISSIONS.editor && MISSIONS.editor.app && MISSIONS.editor.app.attach) {
      MISSIONS.editor.app.attach(app, doc);
    }

    // Wire the header 🎯 button: open a blank editor on click.
    const missionsBtn = doc.getElementById('btn-missions');
    if (missionsBtn) {
      missionsBtn.addEventListener('click', () => {
        if (app.mode === 'editor') {
          app.exitEditor();
        } else {
          app.enterEditor();
        }
      });
    }
```

- [ ] **Step 4: Update `index.html` script-tag order**

Open `index.html` and find the existing mission script tags (added by Plan 1's Task 17 — they sit just before `<script src="js/main.js">`). The block currently contains:

```html
  <script src="js/mission_schema.js"></script>
  <script src="js/mission_loader.js"></script>
  <script src="js/mission_conditions.js"></script>
  <script src="js/mission_engine.js"></script>
  <script src="js/mission_persistence.js"></script>
  <script src="js/mission_library.js"></script>
  <script src="js/mission_ui.js"></script>
  <script src="js/mission_app.js"></script>
```

Insert the editor modules between `mission_ui.js` and `mission_app.js`:

```html
  <script src="js/mission_editor_state.js"></script>
  <script src="js/mission_editor_app.js"></script>
```

The order matters: `mission_editor_state.js` defines the state factory used by `mission_app.enterEditor`, and `mission_editor_app.js` registers `MISSIONS.editor.app.attach` used by `boot()`. Subsequent editor modules (field, meta, steps, conditions, playtest, io) will be added in their respective tasks.

- [ ] **Step 5: Run tests to verify they pass**

```bash
node --test tests/js/missions/editor-app.test.js
```
Expected: PASS (existing 6 + 2 new = 8 tests).

- [ ] **Step 6: Run the full suite**

```bash
npm test
```
Expected: zero regressions.

- [ ] **Step 7: Commit**

```bash
git add js/mission_app.js index.html tests/js/missions/editor-app.test.js
git commit -m "feat(editor): wire editor.app.attach into boot + 🎯 button enters editor"
```

---

## Task 7: SVG Overlay — Render Field

Render the editor's authored field (obstacles, zones, robot start) as SVG inside `#editor-canvas-overlay`. This is read-only rendering — interaction comes in later tasks. The SVG uses the same math y-up convention as the simulator; coordinate conversion mirrors the simulator's `_drawField`.

**Files:**
- Create: `js/mission_editor_field.js`
- Test: `tests/js/missions/editor-field.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/js/missions/editor-field.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');
const { makeEditorDoc } = require('../mocks/editor-dom');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_editor_state',
    'mission_app', 'mission_editor_app', 'mission_editor_field',
  ]).ctx;
}

function setup() {
  const ctx = env();
  const doc = makeEditorDoc();
  ctx.document = doc;
  const app = ctx.MISSIONS.app.create();
  ctx.MISSIONS.editor.app.attach(app, doc);
  ctx.MISSIONS.editor.field.attach(app, doc);
  return { ctx, doc, app };
}

test('field: overlay starts empty', () => {
  const { doc } = setup();
  const overlay = doc.getElementById('editor-canvas-overlay');
  // The SVG root may exist as a child; obstacle/zone groups should be empty.
  const zones = overlay.querySelectorAll('.editor-zone');
  const obs   = overlay.querySelectorAll('.editor-obstacle');
  assert.strictEqual(zones.length, 0);
  assert.strictEqual(obs.length,   0);
});

test('field: entering editor renders the robot start handle', () => {
  const { doc, app } = setup();
  app.enterEditor();
  const overlay = doc.getElementById('editor-canvas-overlay');
  const start = overlay.querySelectorAll('.editor-robot-start');
  assert.strictEqual(start.length, 1, 'expected robot start handle to render');
});

test('field: adding a zone renders a .editor-zone element', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  let s = app.editorState;
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 100, y: 100 });
  app.setEditorState(s);
  const overlay = doc.getElementById('editor-canvas-overlay');
  assert.strictEqual(overlay.querySelectorAll('.editor-zone').length, 1);
});

test('field: adding an obstacle renders a .editor-obstacle element', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  let s = app.editorState;
  s = ctx.MISSIONS.editor.state.addObstacle(s, { x: 1700, y: 943 });
  app.setEditorState(s);
  const overlay = doc.getElementById('editor-canvas-overlay');
  assert.strictEqual(overlay.querySelectorAll('.editor-obstacle').length, 1);
});

test('field: exiting editor clears the overlay', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addZone(app.editorState, { x: 0, y: 0 }));
  app.exitEditor();
  const overlay = doc.getElementById('editor-canvas-overlay');
  assert.strictEqual(overlay.querySelectorAll('.editor-zone').length, 0);
  assert.strictEqual(overlay.querySelectorAll('.editor-robot-start').length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/missions/editor-field.test.js
```
Expected: FAIL — `MISSIONS.editor.field.attach is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `js/mission_editor_field.js`:

```javascript
'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  const editor = (MISSIONS.editor = MISSIONS.editor || {});

  const FIELD_W_MM = 2362;
  const FIELD_H_MM = 1143;
  const NS = 'http://www.w3.org/2000/svg';

  // Convert math y-up coordinates to SVG (top-left origin) coords.
  // SVG viewBox is in mm; we keep math y-up coordinates by setting
  // transform="scale(1,-1) translate(0,-FIELD_H_MM)" on the root group.

  function attach(app, doc) {
    const overlay = doc.getElementById('editor-canvas-overlay');
    if (!overlay) return;

    let svg = null;
    let mathGroup = null;
    let zonesGroup = null;
    let obstaclesGroup = null;
    let startGroup = null;

    function ensureSvg() {
      if (svg) return;
      svg = createSvg('svg');
      svg.setAttribute('viewBox', `0 0 ${FIELD_W_MM} ${FIELD_H_MM}`);
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.classList.add('editor-overlay-svg');
      // math y-up wrapper: flip Y and translate.
      mathGroup = createSvg('g');
      mathGroup.setAttribute('transform', `translate(0,${FIELD_H_MM}) scale(1,-1)`);
      zonesGroup     = createSvg('g'); zonesGroup.classList.add('editor-zones');
      obstaclesGroup = createSvg('g'); obstaclesGroup.classList.add('editor-obstacles');
      startGroup     = createSvg('g'); startGroup.classList.add('editor-start');
      mathGroup.appendChild(zonesGroup);
      mathGroup.appendChild(obstaclesGroup);
      mathGroup.appendChild(startGroup);
      svg.appendChild(mathGroup);
      overlay.appendChild(svg);
    }

    function clearOverlay() {
      while (overlay.children.length) overlay.removeChild(overlay.children[0]);
      svg = null; mathGroup = null;
      zonesGroup = null; obstaclesGroup = null; startGroup = null;
    }

    function createSvg(tag) {
      const el = doc.createElement(tag);
      el.setAttribute('xmlns', NS);
      return el;
    }

    function render(state) {
      if (!state) { clearOverlay(); return; }
      ensureSvg();
      // Zones
      removeChildren(zonesGroup);
      for (const z of state.field.zones) {
        const rect = createSvg('rect');
        rect.setAttribute('x', z.x);
        rect.setAttribute('y', z.y);
        rect.setAttribute('width', z.w);
        rect.setAttribute('height', z.h);
        rect.classList.add('editor-zone');
        rect.setAttribute('data-id', z.id);
        rect.setAttribute('data-kind', 'zone');
        rect.setAttribute('data-color', z.color);
        zonesGroup.appendChild(rect);
      }
      // Obstacles
      removeChildren(obstaclesGroup);
      for (const o of state.field.obstacles) {
        // The obstacle config uses {x,y} as the center; SVG rect is top-left
        // anchored. Convert by offsetting -w/2, -h/2.
        const rect = createSvg('rect');
        rect.setAttribute('x', o.x - o.w / 2);
        rect.setAttribute('y', o.y - o.h / 2);
        rect.setAttribute('width', o.w);
        rect.setAttribute('height', o.h);
        rect.classList.add('editor-obstacle');
        rect.setAttribute('data-id', o.id);
        rect.setAttribute('data-kind', 'obstacle');
        obstaclesGroup.appendChild(rect);
      }
      // Robot start
      removeChildren(startGroup);
      const start = state.field.robot_start;
      const handle = createSvg('circle');
      handle.setAttribute('cx', start.x);
      handle.setAttribute('cy', start.y);
      handle.setAttribute('r', 16);
      handle.classList.add('editor-robot-start');
      handle.setAttribute('data-kind', 'robot-start');
      startGroup.appendChild(handle);
    }

    function removeChildren(node) {
      while (node.children.length) node.removeChild(node.children[0]);
    }

    app.onChange(({ mode, editorState }) => {
      if (mode === 'editor') render(editorState);
      else clearOverlay();
    });
  }

  editor.field = { attach };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/js/missions/editor-field.test.js
```
Expected: PASS (5 tests).

- [ ] **Step 5: Add the script tag and a tiny CSS bump**

In `index.html`, after `<script src="js/mission_editor_app.js"></script>`, add:

```html
  <script src="js/mission_editor_field.js"></script>
```

In `css/mission_editor.css`, append:

```css
/* Editor overlay SVG fills the canvas-wrap area. */
.editor-overlay-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
body[data-mode="editor"] .editor-overlay-svg { pointer-events: auto; }

.editor-zone {
  fill: rgba(255, 200, 60, 0.16);
  stroke: rgba(255, 200, 60, 0.9);
  stroke-width: 4;
  stroke-dasharray: 14 10;
  cursor: move;
}
.editor-zone[data-color="red"]    { fill: rgba(207,107,107,0.22); stroke: #cf6b6b; }
.editor-zone[data-color="green"]  { fill: rgba(127,191,106,0.22); stroke: #7fbf6a; }
.editor-zone[data-color="blue"]   { fill: rgba(91,143,199,0.22);  stroke: #5b8fc7; }
.editor-zone[data-color="yellow"] { fill: rgba(229,203,94,0.25);  stroke: #d1b03b; }
.editor-zone[data-color="orange"] { fill: rgba(231,126,34,0.22);  stroke: #e67e22; }
.editor-zone[data-color="purple"] { fill: rgba(155,89,182,0.22);  stroke: #9b59b6; }

.editor-obstacle {
  fill: #9b59b6;
  stroke: #5e2c79;
  stroke-width: 3;
  cursor: move;
}

.editor-robot-start {
  fill: #22c55e;
  stroke: #022c0e;
  stroke-width: 2;
  cursor: move;
  filter: drop-shadow(0 0 6px rgba(34,197,94,0.5));
}
```

- [ ] **Step 6: Commit**

```bash
git add js/mission_editor_field.js index.html css/mission_editor.css tests/js/missions/editor-field.test.js
git commit -m "feat(editor): render authored field as SVG overlay on canvas"
```

---

## Task 8: Tool Palette + Click-to-Place Obstacle

Add a small palette ("Add obstacle" / "Add zone" / "Set robot start" / "Select") to the overlay top-left. Clicking a tool sets the active mode; clicking the empty canvas in obstacle mode adds an obstacle at that point.

**Files:**
- Modify: `js/mission_editor_field.js`
- Modify: `css/mission_editor.css`
- Test: `tests/js/missions/editor-field.test.js` (extend)

- [ ] **Step 1: Add the failing test**

Append to `tests/js/missions/editor-field.test.js`:

```javascript
test('palette: starts in select mode', () => {
  const { doc, app } = setup();
  app.enterEditor();
  const palette = doc.getElementById('editor-canvas-overlay').querySelector('.editor-palette');
  assert.ok(palette, 'palette should be rendered');
  const selectBtn = palette.querySelector('.editor-tool-select');
  assert.ok(selectBtn.classList.contains('active'));
});

test('palette: click "Add obstacle" then click canvas adds an obstacle at that point', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  const palette = doc.getElementById('editor-canvas-overlay').querySelector('.editor-palette');
  palette.querySelector('.editor-tool-obstacle')._click();
  // Now the canvas click handler should treat clicks as "place obstacle".
  // We synthesise a click event with field-space coords carried via detail.
  const svg = doc.getElementById('editor-canvas-overlay').querySelector('.editor-overlay-svg');
  svg._fire('click', { _fieldPoint: { x: 500, y: 400 } });
  assert.strictEqual(app.editorState.field.obstacles.length, 1);
  assert.strictEqual(app.editorState.field.obstacles[0].x, 500);
  assert.strictEqual(app.editorState.field.obstacles[0].y, 400);
});

test('palette: after placing an obstacle the active tool reverts to "select"', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  const palette = doc.getElementById('editor-canvas-overlay').querySelector('.editor-palette');
  palette.querySelector('.editor-tool-obstacle')._click();
  const svg = doc.getElementById('editor-canvas-overlay').querySelector('.editor-overlay-svg');
  svg._fire('click', { _fieldPoint: { x: 0, y: 0 } });
  assert.ok(palette.querySelector('.editor-tool-select').classList.contains('active'));
  assert.ok(!palette.querySelector('.editor-tool-obstacle').classList.contains('active'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/js/missions/editor-field.test.js
```
Expected: FAIL — no palette rendered, no click placement.

- [ ] **Step 3: Extend `js/mission_editor_field.js`**

Add at module scope (above `attach`):

```javascript
  const TOOLS = ['select', 'obstacle', 'zone', 'start'];
```

Inside `attach()`, add palette state and render after `ensureSvg`:

```javascript
    let activeTool = 'select';
    let palette = null;

    function ensurePalette() {
      if (palette) return;
      palette = doc.createElement('div');
      palette.classList.add('editor-palette');
      for (const tool of TOOLS) {
        const btn = doc.createElement('button');
        btn.classList.add('editor-tool', `editor-tool-${tool}`);
        if (tool === activeTool) btn.classList.add('active');
        btn.textContent = labelFor(tool);
        btn.setAttribute('type', 'button');
        btn.addEventListener('click', () => setTool(tool));
        palette.appendChild(btn);
      }
      overlay.appendChild(palette);
    }

    function labelFor(tool) {
      switch (tool) {
        case 'select':   return '↖ Select';
        case 'obstacle': return '▭ Obstacle';
        case 'zone':     return '▢ Zone';
        case 'start':    return '⌖ Robot start';
        default: return tool;
      }
    }

    function setTool(tool) {
      activeTool = tool;
      const buttons = palette.children;
      for (const b of buttons) {
        b.classList.toggle('active', b.classList.contains(`editor-tool-${tool}`));
      }
    }

    function handleSvgClick(ev) {
      const point = ev._fieldPoint;  // Production wiring (Step 5) converts pageX/pageY to math y-up via SVG CTM.
      if (!point) return;
      if (activeTool === 'obstacle') {
        app.setEditorState(MISSIONS.editor.state.addObstacle(app.editorState, point));
        setTool('select');
      } else if (activeTool === 'zone') {
        app.setEditorState(MISSIONS.editor.state.addZone(app.editorState, point));
        setTool('select');
      } else if (activeTool === 'start') {
        const next = MISSIONS.editor.state.setRobotStart(app.editorState, {
          x: point.x, y: point.y, heading: app.editorState.field.robot_start.heading,
        });
        app.setEditorState(next);
        setTool('select');
      }
      // 'select' is a no-op here (selection logic comes in Task 10).
    }
```

In the existing `ensureSvg` function, attach the click handler:

```javascript
      svg.addEventListener('click', handleSvgClick);
```

In the `app.onChange` block:

```javascript
    app.onChange(({ mode, editorState }) => {
      if (mode === 'editor') {
        ensureSvg();
        ensurePalette();
        render(editorState);
      } else {
        clearOverlay();
        palette = null;
        activeTool = 'select';
      }
    });
```

Also update `clearOverlay` to remove the palette:

```javascript
    function clearOverlay() {
      while (overlay.children.length) overlay.removeChild(overlay.children[0]);
      svg = null; mathGroup = null;
      zonesGroup = null; obstaclesGroup = null; startGroup = null;
      palette = null;
    }
```

Expose a test hook on the editor.field export so production wiring (mouse coords → field coords) can be tested separately later:

```javascript
  editor.field = { attach, _test_handleSvgClick: null };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/js/missions/editor-field.test.js
```
Expected: PASS (5 + 3 = 8 tests).

- [ ] **Step 5: Add palette CSS**

Append to `css/mission_editor.css`:

```css
.editor-palette {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  gap: 4px;
  background: rgba(11,15,24,0.88);
  backdrop-filter: blur(8px);
  border: 1px solid var(--border2);
  border-radius: 8px;
  padding: 4px;
  pointer-events: auto;
}
.editor-tool {
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-mid);
  padding: 5px 10px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  font-family: var(--font-ui);
  cursor: pointer;
}
.editor-tool:hover { color: var(--text); }
.editor-tool.active {
  color: var(--amber);
  border-color: var(--amber);
  background: rgba(251,191,36,0.08);
}
```

- [ ] **Step 6: Production wiring for SVG click → field coordinates**

The tests use a synthetic `ev._fieldPoint`. Production needs to convert real pointer events into field coordinates. Add at the end of `ensureSvg`:

```javascript
      // Production-only: convert pointer events to field coords using SVG CTM.
      // In tests, an injected `_fieldPoint` short-circuits this branch.
      svg.addEventListener('click', (ev) => {
        if (ev._fieldPoint) return;  // already handled by the synthetic-path listener above
        if (typeof svg.getBoundingClientRect !== 'function') return;
        const rect = svg.getBoundingClientRect();
        if (!rect.width) return;
        // Page-space → SVG-space via the inverse CTM. Math y-up.
        const px = (ev.clientX - rect.left) * (FIELD_W_MM / rect.width);
        const pyTop = (ev.clientY - rect.top)  * (FIELD_H_MM / rect.height);
        const py = FIELD_H_MM - pyTop;
        handleSvgClick({ _fieldPoint: { x: px, y: py } });
      });
```

- [ ] **Step 7: Commit**

```bash
git add js/mission_editor_field.js css/mission_editor.css tests/js/missions/editor-field.test.js
git commit -m "feat(editor): tool palette + click-to-place obstacles/zones/start"
```

---

## Task 9: Selection Model + Outline

Click on an obstacle/zone/robot-start to select it (when the active tool is `select`). Selected elements get an amber dashed outline. Clicking empty canvas clears selection.

**Files:**
- Modify: `js/mission_editor_field.js`
- Modify: `css/mission_editor.css`
- Test: `tests/js/missions/editor-field.test.js` (extend)

- [ ] **Step 1: Add the failing test**

Append to `tests/js/missions/editor-field.test.js`:

```javascript
test('selection: click on a zone in select mode selects it', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addZone(app.editorState, { x: 100, y: 100 }));
  const id = app.editorState.field.zones[0].id;
  const zoneEl = doc.getElementById('editor-canvas-overlay').querySelector('.editor-zone');
  zoneEl._fire('click', { _fieldElement: true });
  assert.deepStrictEqual(app.editorState.selection, { kind: 'zone', id });
});

test('selection: selected element gets .selected class', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addObstacle(app.editorState, { x: 100, y: 100 }));
  const id = app.editorState.field.obstacles[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'obstacle', id }));
  const obstEl = doc.getElementById('editor-canvas-overlay').querySelector('.editor-obstacle');
  assert.ok(obstEl.classList.contains('selected'));
});

test('selection: clicking empty canvas clears selection', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addZone(app.editorState, { x: 100, y: 100 }));
  const id = app.editorState.field.zones[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'zone', id }));
  // Click the SVG root (not a zone child) — should clear.
  const svg = doc.getElementById('editor-canvas-overlay').querySelector('.editor-overlay-svg');
  svg._fire('click', { _fieldPoint: { x: 1500, y: 700 } });  // empty area
  assert.strictEqual(app.editorState.selection, null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/js/missions/editor-field.test.js
```
Expected: FAIL — element clicks don't set selection.

- [ ] **Step 3: Extend the implementation**

In `js/mission_editor_field.js`, modify the render function to wire per-element click handlers AND mark selection:

In the zone loop inside `render`:

```javascript
      for (const z of state.field.zones) {
        const rect = createSvg('rect');
        rect.setAttribute('x', z.x);
        rect.setAttribute('y', z.y);
        rect.setAttribute('width', z.w);
        rect.setAttribute('height', z.h);
        rect.classList.add('editor-zone');
        rect.setAttribute('data-id', z.id);
        rect.setAttribute('data-kind', 'zone');
        rect.setAttribute('data-color', z.color);
        if (state.selection && state.selection.kind === 'zone' && state.selection.id === z.id) {
          rect.classList.add('selected');
        }
        rect.addEventListener('click', (ev) => handleElementClick(ev, 'zone', z.id));
        zonesGroup.appendChild(rect);
      }
```

In the obstacle loop:

```javascript
      for (const o of state.field.obstacles) {
        const rect = createSvg('rect');
        rect.setAttribute('x', o.x - o.w / 2);
        rect.setAttribute('y', o.y - o.h / 2);
        rect.setAttribute('width', o.w);
        rect.setAttribute('height', o.h);
        rect.classList.add('editor-obstacle');
        rect.setAttribute('data-id', o.id);
        rect.setAttribute('data-kind', 'obstacle');
        if (state.selection && state.selection.kind === 'obstacle' && state.selection.id === o.id) {
          rect.classList.add('selected');
        }
        rect.addEventListener('click', (ev) => handleElementClick(ev, 'obstacle', o.id));
        obstaclesGroup.appendChild(rect);
      }
```

For the robot start handle:

```javascript
      const handle = createSvg('circle');
      handle.setAttribute('cx', start.x);
      handle.setAttribute('cy', start.y);
      handle.setAttribute('r', 16);
      handle.classList.add('editor-robot-start');
      handle.setAttribute('data-kind', 'robot-start');
      if (state.selection && state.selection.kind === 'start') {
        handle.classList.add('selected');
      }
      handle.addEventListener('click', (ev) => handleElementClick(ev, 'start', null));
      startGroup.appendChild(handle);
```

Add the handler:

```javascript
    function handleElementClick(ev, kind, id) {
      if (activeTool !== 'select') return;  // tool palette governs add-modes
      // Suppress the SVG-level click handler (which would clear selection).
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
      ev._handled = true;
      app.setEditorState(MISSIONS.editor.state.setSelection(app.editorState, { kind, id }));
    }
```

Update `handleSvgClick` so empty-area clicks in select mode clear selection (but only when the click wasn't already handled by an element):

```javascript
    function handleSvgClick(ev) {
      if (ev._handled) return;
      if (activeTool === 'select') {
        if (app.editorState && app.editorState.selection) {
          app.setEditorState(MISSIONS.editor.state.setSelection(app.editorState, null));
        }
        return;
      }
      const point = ev._fieldPoint;
      if (!point) return;
      // ... existing add-obstacle / add-zone / set-start cases ...
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/js/missions/editor-field.test.js
```
Expected: PASS (8 + 3 = 11 tests).

- [ ] **Step 5: Add the .selected CSS**

Append to `css/mission_editor.css`:

```css
.editor-zone.selected,
.editor-obstacle.selected,
.editor-robot-start.selected {
  stroke: var(--amber);
  stroke-width: 5;
  stroke-dasharray: 8 6;
  filter: drop-shadow(0 0 8px rgba(251,191,36,0.7));
}
```

- [ ] **Step 6: Commit**

```bash
git add js/mission_editor_field.js css/mission_editor.css tests/js/missions/editor-field.test.js
git commit -m "feat(editor): click-to-select obstacles/zones/start with outline"
```

---

## Task 10: Drag-to-Move Selected Element

Pointerdown on a selected element starts a drag; pointermove updates position via the appropriate state op; pointerup ends. Coordinates convert from page pixels to math y-up mm using the SVG's bounding rect.

**Files:**
- Modify: `js/mission_editor_field.js`
- Test: `tests/js/missions/editor-field.test.js` (extend)

- [ ] **Step 1: Add the failing test**

Append to `tests/js/missions/editor-field.test.js`:

```javascript
test('drag: simulating a drag on a selected obstacle updates its position', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addObstacle(app.editorState, { x: 100, y: 100 }));
  const id = app.editorState.field.obstacles[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'obstacle', id }));
  // Test seam: directly call the drag handler with field-space delta.
  ctx.MISSIONS.editor.field._test_dragMove({ x: 555, y: 666 });
  assert.strictEqual(app.editorState.field.obstacles[0].x, 555);
  assert.strictEqual(app.editorState.field.obstacles[0].y, 666);
});

test('drag: simulating a drag on the robot start updates the start pose', () => {
  const { ctx, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'start', id: null }));
  ctx.MISSIONS.editor.field._test_dragMove({ x: 1800, y: 400 });
  assert.strictEqual(app.editorState.field.robot_start.x, 1800);
  assert.strictEqual(app.editorState.field.robot_start.y, 400);
});

test('drag: when nothing is selected, _test_dragMove is a no-op', () => {
  const { ctx, app } = setup();
  app.enterEditor();
  const before = app.editorState;
  ctx.MISSIONS.editor.field._test_dragMove({ x: 100, y: 100 });
  assert.strictEqual(app.editorState, before);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/js/missions/editor-field.test.js
```
Expected: FAIL — `_test_dragMove` not on the export.

- [ ] **Step 3: Extend the implementation**

In `js/mission_editor_field.js`, add inside `attach`:

```javascript
    function dragMoveToPoint(point) {
      const sel = app.editorState && app.editorState.selection;
      if (!sel) return;
      let next = app.editorState;
      if (sel.kind === 'obstacle') {
        next = MISSIONS.editor.state.moveObstacle(next, sel.id, point);
      } else if (sel.kind === 'zone') {
        next = MISSIONS.editor.state.moveZone(next, sel.id, point);
      } else if (sel.kind === 'start') {
        next = MISSIONS.editor.state.setRobotStart(next, {
          x: point.x, y: point.y, heading: next.field.robot_start.heading,
        });
      } else {
        return;
      }
      app.setEditorState(next);
    }
```

Wire production pointer events (browser path) — add inside `ensureSvg` after the existing click listener:

```javascript
      let dragging = false;
      svg.addEventListener('pointerdown', (ev) => {
        if (activeTool !== 'select') return;
        if (!app.editorState || !app.editorState.selection) return;
        dragging = true;
        if (svg.setPointerCapture && ev.pointerId !== undefined) {
          try { svg.setPointerCapture(ev.pointerId); } catch (_e) {}
        }
      });
      svg.addEventListener('pointermove', (ev) => {
        if (!dragging) return;
        if (typeof svg.getBoundingClientRect !== 'function') return;
        const rect = svg.getBoundingClientRect();
        if (!rect.width) return;
        const px = (ev.clientX - rect.left) * (FIELD_W_MM / rect.width);
        const pyTop = (ev.clientY - rect.top)  * (FIELD_H_MM / rect.height);
        dragMoveToPoint({ x: px, y: FIELD_H_MM - pyTop });
      });
      svg.addEventListener('pointerup', () => { dragging = false; });
      svg.addEventListener('pointercancel', () => { dragging = false; });
```

Expose the test seam:

```javascript
  editor.field = { attach, _test_dragMove: null };
```

And inside `attach`, hook the seam:

```javascript
    editor.field._test_dragMove = dragMoveToPoint;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/js/missions/editor-field.test.js
```
Expected: PASS (11 + 3 = 14 tests).

- [ ] **Step 5: Commit**

```bash
git add js/mission_editor_field.js tests/js/missions/editor-field.test.js
git commit -m "feat(editor): drag selected obstacles/zones/start to reposition"
```

---

## Task 11: Delete Selected with Keyboard

Pressing the `Delete` or `Backspace` key while an obstacle or zone is selected removes it. The robot start cannot be deleted (it must always exist).

**Files:**
- Modify: `js/mission_editor_field.js`
- Test: `tests/js/missions/editor-field.test.js` (extend)

- [ ] **Step 1: Add the failing test**

Append to `tests/js/missions/editor-field.test.js`:

```javascript
test('delete: pressing Delete while an obstacle is selected removes it', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addObstacle(app.editorState, { x: 100, y: 100 }));
  const id = app.editorState.field.obstacles[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'obstacle', id }));
  ctx.MISSIONS.editor.field._test_deleteSelected();
  assert.strictEqual(app.editorState.field.obstacles.length, 0);
  assert.strictEqual(app.editorState.selection, null);
});

test('delete: pressing Delete while a zone is selected removes it', () => {
  const { ctx, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addZone(app.editorState, { x: 100, y: 100 }));
  const id = app.editorState.field.zones[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'zone', id }));
  ctx.MISSIONS.editor.field._test_deleteSelected();
  assert.strictEqual(app.editorState.field.zones.length, 0);
});

test('delete: robot start cannot be deleted', () => {
  const { ctx, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'start', id: null }));
  const beforeStart = app.editorState.field.robot_start;
  ctx.MISSIONS.editor.field._test_deleteSelected();
  assert.deepStrictEqual(app.editorState.field.robot_start, beforeStart);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/js/missions/editor-field.test.js
```
Expected: FAIL — `_test_deleteSelected` not on the export.

- [ ] **Step 3: Extend the implementation**

In `js/mission_editor_field.js`, add inside `attach`:

```javascript
    function deleteSelected() {
      const sel = app.editorState && app.editorState.selection;
      if (!sel) return;
      let next = app.editorState;
      if (sel.kind === 'obstacle') {
        next = MISSIONS.editor.state.deleteObstacle(next, sel.id);
      } else if (sel.kind === 'zone') {
        next = MISSIONS.editor.state.deleteZone(next, sel.id);
      } else {
        return;  // start can't be deleted
      }
      next = MISSIONS.editor.state.setSelection(next, null);
      app.setEditorState(next);
    }

    editor.field._test_deleteSelected = deleteSelected;

    if (doc.addEventListener) {
      doc.addEventListener('keydown', (ev) => {
        if (app.mode !== 'editor') return;
        if (ev.key === 'Delete' || ev.key === 'Backspace') {
          // Don't steal Delete from text inputs (title, description, step inputs).
          const tag = (ev.target && ev.target.tag) || '';
          if (tag === 'input' || tag === 'textarea') return;
          deleteSelected();
        }
      });
    }
```

Extend the export:

```javascript
  editor.field = { attach, _test_dragMove: null, _test_deleteSelected: null };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/js/missions/editor-field.test.js
```
Expected: PASS (14 + 3 = 17 tests).

- [ ] **Step 5: Hook into boot wiring**

Open `js/mission_app.js`, find the `boot()` block where the editor app is attached, and add the field attach call right after:

```javascript
    if (MISSIONS.editor && MISSIONS.editor.app && MISSIONS.editor.app.attach) {
      MISSIONS.editor.app.attach(app, doc);
    }
    if (MISSIONS.editor && MISSIONS.editor.field && MISSIONS.editor.field.attach) {
      MISSIONS.editor.field.attach(app, doc);
    }
```

- [ ] **Step 6: Run the full suite**

```bash
npm test
```
Expected: zero regressions across all suites.

- [ ] **Step 7: Commit**

```bash
git add js/mission_editor_field.js js/mission_app.js tests/js/missions/editor-field.test.js
git commit -m "feat(editor): Delete/Backspace removes selected obstacle or zone"
```

---

# Phase B milestone

After Task 11, the editor mode supports:
- Click 🎯 to enter editor → see toolbar + right panel scaffold + empty SVG overlay with robot-start handle
- Tool palette (Select / Obstacle / Zone / Robot start) — clicking the canvas in non-select mode places an item
- Click any item to select it (amber outline) — clicking empty canvas clears
- Drag selected to reposition (production pointer events; tests use a seam)
- Delete/Backspace removes the selected obstacle or zone

The editor's field is authoritative — the simulator's own obstacles/zones aren't visible in editor mode (the `body[data-mode="editor"]` CSS hides the simulator's canvas-toolbar layer, and the SVG overlay paints over the canvas).

Phase C (metadata + steps) and beyond continue below.

---

# Phase C: Metadata + Step List

Phase C wires the right-panel metadata form (description, type, difficulty) and the step list (add / edit / reorder / delete). All edits flow through `mission_editor_state.js` ops; the right panel re-renders on every state change.

---

## Task 12: Metadata Form Binding

Bind `<textarea id="editor-meta-desc">`, `<select id="editor-meta-type">`, `<select id="editor-meta-difficulty">` to editor state. Inputs reflect state on enterEditor; user edits flow back through new state ops.

**Files:**
- Modify: `js/mission_editor_state.js` (add `setMeta`)
- Create: `js/mission_editor_meta.js`
- Test: `tests/js/missions/editor-meta.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/js/missions/editor-meta.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');
const { makeEditorDoc } = require('../mocks/editor-dom');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_editor_state',
    'mission_app', 'mission_editor_app', 'mission_editor_meta',
  ]).ctx;
}

function setup() {
  const ctx = env();
  const doc = makeEditorDoc();
  ctx.document = doc;
  const app = ctx.MISSIONS.app.create();
  ctx.MISSIONS.editor.app.attach(app, doc);
  ctx.MISSIONS.editor.meta.attach(app, doc);
  return { ctx, doc, app };
}

test('meta: enterEditor reflects state into the form fields', () => {
  const { doc, app } = setup();
  app.enterEditor();
  assert.strictEqual(doc.getElementById('editor-meta-desc').value,       '');
  assert.strictEqual(doc.getElementById('editor-meta-type').value,       'mission');
  assert.strictEqual(doc.getElementById('editor-meta-difficulty').value, 'beginner');
});

test('meta: typing in the description input updates editor state', () => {
  const { doc, app } = setup();
  app.enterEditor();
  const desc = doc.getElementById('editor-meta-desc');
  desc.value = 'Drive to the red zone.';
  desc._fire('input', { target: desc });
  assert.strictEqual(app.editorState.description, 'Drive to the red zone.');
  assert.strictEqual(app.editorState.dirty, true);
});

test('meta: changing type updates editor state', () => {
  const { doc, app } = setup();
  app.enterEditor();
  const sel = doc.getElementById('editor-meta-type');
  sel.value = 'obstacle_course';
  sel._fire('change', { target: sel });
  assert.strictEqual(app.editorState.type, 'obstacle_course');
});

test('meta: changing difficulty updates editor state', () => {
  const { doc, app } = setup();
  app.enterEditor();
  const sel = doc.getElementById('editor-meta-difficulty');
  sel.value = 'advanced';
  sel._fire('change', { target: sel });
  assert.strictEqual(app.editorState.difficulty_tier, 'advanced');
});

test('meta: loadFromMission populates the form', () => {
  const { ctx, doc, app } = setup();
  let s = ctx.MISSIONS.editor.state.createBlank();
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 100, y: 100 });
  s.steps.push({ id: 'a', title: 'a', points: 1,
    condition: { kind: 'zone', subject: 'robot', zone: s.field.zones[0].id } });
  s.description = 'Existing';
  s.difficulty_tier = 'intermediate';
  s.type = 'mission';
  const mission = ctx.MISSIONS.loader.load(ctx.MISSIONS.editor.state.serializeToMission(s));
  app.enterEditor(mission);
  assert.strictEqual(doc.getElementById('editor-meta-desc').value, 'Existing');
  assert.strictEqual(doc.getElementById('editor-meta-difficulty').value, 'intermediate');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/missions/editor-meta.test.js
```
Expected: FAIL — `MISSIONS.editor.meta` not defined.

- [ ] **Step 3: Add `setMeta` to state module**

In `js/mission_editor_state.js`, add the helper:

```javascript
  function setMeta(state, patch) {
    const next = dirty(state);
    if (patch.description     !== undefined) next.description     = patch.description;
    if (patch.title           !== undefined) next.title           = patch.title;
    if (patch.author          !== undefined) next.author          = patch.author;
    if (patch.type            !== undefined) next.type            = patch.type;
    if (patch.difficulty_tier !== undefined) next.difficulty_tier = patch.difficulty_tier;
    return next;
  }
```

Add `setMeta` to the export object.

- [ ] **Step 4: Create `js/mission_editor_meta.js`**

```javascript
'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  const editor = (MISSIONS.editor = MISSIONS.editor || {});

  function attach(app, doc) {
    const desc = doc.getElementById('editor-meta-desc');
    const type = doc.getElementById('editor-meta-type');
    const diff = doc.getElementById('editor-meta-difficulty');

    function bind(el, eventName, key) {
      if (!el) return;
      el.addEventListener(eventName, (e) => {
        if (app.mode !== 'editor' || !app.editorState) return;
        const val = (e.target && e.target.value) || '';
        const next = MISSIONS.editor.state.setMeta(app.editorState, { [key]: val });
        app.setEditorState(next);
      });
    }

    bind(desc, 'input',  'description');
    bind(type, 'change', 'type');
    bind(diff, 'change', 'difficulty_tier');

    app.onChange(({ mode, editorState }) => {
      if (mode !== 'editor' || !editorState) return;
      if (desc) desc.value = editorState.description || '';
      if (type) type.value = editorState.type;
      if (diff) diff.value = editorState.difficulty_tier;
    });
  }

  editor.meta = { attach };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 5: Run test to verify it passes**

```bash
node --test tests/js/missions/editor-meta.test.js
```
Expected: PASS (5 tests).

- [ ] **Step 6: Register the script tag and boot wiring**

In `index.html`, after `<script src="js/mission_editor_field.js"></script>`, add:

```html
  <script src="js/mission_editor_meta.js"></script>
```

In `js/mission_app.js`'s `boot()`, add after the field attach:

```javascript
    if (MISSIONS.editor && MISSIONS.editor.meta && MISSIONS.editor.meta.attach) {
      MISSIONS.editor.meta.attach(app, doc);
    }
```

- [ ] **Step 7: Commit**

```bash
git add js/mission_editor_state.js js/mission_editor_meta.js js/mission_app.js index.html tests/js/missions/editor-meta.test.js
git commit -m "feat(editor): metadata form (description / type / difficulty) bound to state"
```

---

## Task 13: Step Operations on State

Add `addStep`, `editStep`, `deleteStep`, `reorderStep` to the editor state module. Pure functions; UI comes in Task 14.

**Files:**
- Modify: `js/mission_editor_state.js`
- Test: `tests/js/missions/editor-state.test.js` (extend)

- [ ] **Step 1: Add the failing tests**

Append to `tests/js/missions/editor-state.test.js`:

```javascript
test('addStep: appends a step with id, title, default points=10, default condition', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  const next = ctx.MISSIONS.editor.state.addStep(s);
  assert.strictEqual(next.steps.length, 1);
  const step = next.steps[0];
  assert.match(step.id, /^s-/);
  assert.strictEqual(step.points, 10);
  assert.strictEqual(typeof step.title, 'string');
  // Default condition references no real zone yet; the loader will reject
  // until the author edits — that's fine pre-Playtest.
  assert.ok(step.condition, 'expected a default condition placeholder');
});

test('editStep: updates the named step fields', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  let next = ctx.MISSIONS.editor.state.addStep(s);
  const id = next.steps[0].id;
  next = ctx.MISSIONS.editor.state.editStep(next, id, {
    title: 'Reach red', points: 25, hint: 'Drive east',
  });
  assert.strictEqual(next.steps[0].title, 'Reach red');
  assert.strictEqual(next.steps[0].points, 25);
  assert.strictEqual(next.steps[0].hint, 'Drive east');
});

test('deleteStep: removes the step and scrubs requires references on remaining steps', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  let next = ctx.MISSIONS.editor.state.addStep(s);  // step 1
  next = ctx.MISSIONS.editor.state.addStep(next);    // step 2
  const [a, b] = next.steps;
  next = ctx.MISSIONS.editor.state.editStep(next, b.id, { requires: [a.id] });
  next = ctx.MISSIONS.editor.state.deleteStep(next, a.id);
  assert.strictEqual(next.steps.length, 1);
  assert.deepStrictEqual(next.steps[0].requires || [], []);
});

test('reorderStep: moves the named step to the given index', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  let next = ctx.MISSIONS.editor.state.addStep(s);
  next = ctx.MISSIONS.editor.state.addStep(next);
  next = ctx.MISSIONS.editor.state.addStep(next);
  const [a, b, c] = next.steps;
  next = ctx.MISSIONS.editor.state.reorderStep(next, c.id, 0);
  assert.deepStrictEqual(next.steps.map(x => x.id), [c.id, a.id, b.id]);
});

test('editStep: updating the condition replaces it whole', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  let next = ctx.MISSIONS.editor.state.addStep(s);
  const id = next.steps[0].id;
  const newCond = { kind: 'contact', obstacle: 'whatever' };
  next = ctx.MISSIONS.editor.state.editStep(next, id, { condition: newCond });
  assert.deepStrictEqual(next.steps[0].condition, newCond);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/js/missions/editor-state.test.js
```
Expected: FAIL — `addStep is not a function`.

- [ ] **Step 3: Extend the implementation**

Add to `js/mission_editor_state.js`:

```javascript
  function addStep(state) {
    const next = dirty(state);
    const id = shortId('s');
    next.steps.push({
      id,
      title: 'New step',
      points: 10,
      // Placeholder condition — loader will reject if zone "" doesn't exist;
      // the author edits this via the condition picker (Phase D).
      condition: { kind: 'zone', subject: 'robot', zone: '' },
    });
    return next;
  }

  function editStep(state, id, patch) {
    const next = dirty(state);
    const step = next.steps.find(s => s.id === id);
    if (!step) return next;
    if (patch.title     !== undefined) step.title     = patch.title;
    if (patch.points    !== undefined) step.points    = patch.points;
    if (patch.hint      !== undefined) step.hint      = patch.hint;
    if (patch.requires  !== undefined) step.requires  = patch.requires.slice();
    if (patch.condition !== undefined) step.condition = deepClone(patch.condition);
    return next;
  }

  function deleteStep(state, id) {
    const next = dirty(state);
    next.steps = next.steps.filter(s => s.id !== id);
    // Scrub references in remaining steps' requires.
    for (const s of next.steps) {
      if (s.requires) s.requires = s.requires.filter(r => r !== id);
    }
    return next;
  }

  function reorderStep(state, id, newIndex) {
    const next = dirty(state);
    const i = next.steps.findIndex(s => s.id === id);
    if (i < 0) return next;
    const [step] = next.steps.splice(i, 1);
    const clampedIndex = Math.max(0, Math.min(newIndex, next.steps.length));
    next.steps.splice(clampedIndex, 0, step);
    return next;
  }
```

Add to the export: `addStep, editStep, deleteStep, reorderStep`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/js/missions/editor-state.test.js
```
Expected: PASS (all previous + 5 new).

- [ ] **Step 5: Commit**

```bash
git add js/mission_editor_state.js tests/js/missions/editor-state.test.js
git commit -m "feat(editor): step operations (add/edit/delete/reorder) with requires-scrub"
```

---

## Task 14: Step List UI — Add / Edit Title and Points

Render the step list in `#editor-steps-list`. Each row shows title input + points input + hint input + a delete button. The "+ Add step" button appends a new step. Condition editing comes in Phase D — this task only handles the metadata fields.

**Files:**
- Create: `js/mission_editor_steps.js`
- Test: `tests/js/missions/editor-steps.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/js/missions/editor-steps.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');
const { makeEditorDoc } = require('../mocks/editor-dom');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_editor_state',
    'mission_app', 'mission_editor_app', 'mission_editor_steps',
  ]).ctx;
}

function setup() {
  const ctx = env();
  const doc = makeEditorDoc();
  ctx.document = doc;
  const app = ctx.MISSIONS.app.create();
  ctx.MISSIONS.editor.app.attach(app, doc);
  ctx.MISSIONS.editor.steps.attach(app, doc);
  return { ctx, doc, app };
}

test('steps: enterEditor shows an empty step list', () => {
  const { doc, app } = setup();
  app.enterEditor();
  const list = doc.getElementById('editor-steps-list');
  assert.strictEqual(list.children.length, 0);
});

test('steps: clicking "+ Add step" creates a row', () => {
  const { doc, app } = setup();
  app.enterEditor();
  doc.getElementById('btn-add-step')._click();
  assert.strictEqual(app.editorState.steps.length, 1);
  const list = doc.getElementById('editor-steps-list');
  assert.strictEqual(list.children.length, 1);
});

test('steps: editing the title input updates state', () => {
  const { doc, app } = setup();
  app.enterEditor();
  doc.getElementById('btn-add-step')._click();
  const id = app.editorState.steps[0].id;
  const titleInput = doc.getElementById('editor-steps-list').querySelector('.step-title-input');
  titleInput.value = 'Reach red';
  titleInput._fire('input', { target: titleInput });
  assert.strictEqual(app.editorState.steps[0].title, 'Reach red');
});

test('steps: editing the points input updates state as a number', () => {
  const { doc, app } = setup();
  app.enterEditor();
  doc.getElementById('btn-add-step')._click();
  const ptsInput = doc.getElementById('editor-steps-list').querySelector('.step-points-input');
  ptsInput.value = '25';
  ptsInput._fire('input', { target: ptsInput });
  assert.strictEqual(app.editorState.steps[0].points, 25);
});

test('steps: clicking the row delete button removes the step', () => {
  const { doc, app } = setup();
  app.enterEditor();
  doc.getElementById('btn-add-step')._click();
  doc.getElementById('btn-add-step')._click();
  assert.strictEqual(app.editorState.steps.length, 2);
  const firstDelete = doc.getElementById('editor-steps-list').querySelector('.step-delete-btn');
  firstDelete._click();
  assert.strictEqual(app.editorState.steps.length, 1);
});

test('steps: editing the hint input updates state', () => {
  const { doc, app } = setup();
  app.enterEditor();
  doc.getElementById('btn-add-step')._click();
  const hintInput = doc.getElementById('editor-steps-list').querySelector('.step-hint-input');
  hintInput.value = 'Drive east 1200mm';
  hintInput._fire('input', { target: hintInput });
  assert.strictEqual(app.editorState.steps[0].hint, 'Drive east 1200mm');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/missions/editor-steps.test.js
```
Expected: FAIL — `MISSIONS.editor.steps` not defined.

- [ ] **Step 3: Write minimal implementation**

Create `js/mission_editor_steps.js`:

```javascript
'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  const editor = (MISSIONS.editor = MISSIONS.editor || {});

  function attach(app, doc) {
    const list   = doc.getElementById('editor-steps-list');
    const addBtn = doc.getElementById('btn-add-step');

    if (addBtn) {
      addBtn.addEventListener('click', () => {
        if (app.mode !== 'editor' || !app.editorState) return;
        app.setEditorState(MISSIONS.editor.state.addStep(app.editorState));
      });
    }

    function clearList() {
      if (!list) return;
      while (list.children.length) list.removeChild(list.children[0]);
    }

    function render(state) {
      if (!list) return;
      clearList();
      if (!state) return;
      for (const step of state.steps) {
        list.appendChild(renderRow(step));
      }
    }

    function renderRow(step) {
      const row = doc.createElement('li');
      row.classList.add('editor-step-row');
      row.setAttribute('data-id', step.id);

      const title = doc.createElement('input');
      title.classList.add('step-title-input');
      title.setAttribute('type', 'text');
      title.value = step.title;
      title.addEventListener('input', (e) => {
        app.setEditorState(MISSIONS.editor.state.editStep(
          app.editorState, step.id, { title: e.target.value }));
      });

      const points = doc.createElement('input');
      points.classList.add('step-points-input');
      points.setAttribute('type', 'number');
      points.value = String(step.points);
      points.addEventListener('input', (e) => {
        const n = parseInt(e.target.value, 10);
        app.setEditorState(MISSIONS.editor.state.editStep(
          app.editorState, step.id, { points: Number.isNaN(n) ? 0 : n }));
      });

      const hint = doc.createElement('input');
      hint.classList.add('step-hint-input');
      hint.setAttribute('type', 'text');
      hint.value = step.hint || '';
      hint.addEventListener('input', (e) => {
        app.setEditorState(MISSIONS.editor.state.editStep(
          app.editorState, step.id, { hint: e.target.value }));
      });

      const del = doc.createElement('button');
      del.classList.add('step-delete-btn');
      del.setAttribute('type', 'button');
      del.textContent = '🗑';
      del.addEventListener('click', () => {
        app.setEditorState(MISSIONS.editor.state.deleteStep(app.editorState, step.id));
      });

      row.appendChild(title);
      row.appendChild(points);
      row.appendChild(hint);
      row.appendChild(del);
      return row;
    }

    app.onChange(({ mode, editorState }) => {
      if (mode === 'editor') render(editorState);
      else clearList();
    });
  }

  editor.steps = { attach };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/js/missions/editor-steps.test.js
```
Expected: PASS (6 tests).

- [ ] **Step 5: Register script tag and boot wiring**

In `index.html` after `mission_editor_meta.js`:

```html
  <script src="js/mission_editor_steps.js"></script>
```

In `js/mission_app.js`'s `boot()`, after meta attach:

```javascript
    if (MISSIONS.editor && MISSIONS.editor.steps && MISSIONS.editor.steps.attach) {
      MISSIONS.editor.steps.attach(app, doc);
    }
```

- [ ] **Step 6: Add CSS for the step rows**

Append to `css/mission_editor.css`:

```css
.editor-step-row {
  display: grid;
  grid-template-columns: 1fr 60px 1fr 28px;
  gap: 4px;
  align-items: center;
  padding: 6px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.editor-step-row input {
  background: var(--surface3);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 4px 7px;
  border-radius: 4px;
  font-family: var(--font-ui);
  font-size: 11px;
  outline: none;
}
.editor-step-row input:focus { border-color: var(--blue); }
.step-points-input { font-family: var(--font-code); text-align: center; }
.step-delete-btn {
  background: transparent;
  border: 1px solid var(--border2);
  color: var(--text-mid);
  width: 28px; height: 28px;
  border-radius: 5px;
  cursor: pointer;
}
.step-delete-btn:hover { color: var(--red); border-color: var(--red); }
```

- [ ] **Step 7: Commit**

```bash
git add js/mission_editor_steps.js js/mission_app.js index.html css/mission_editor.css tests/js/missions/editor-steps.test.js
git commit -m "feat(editor): step list with add/edit-title/points/hint/delete"
```

---

## Task 15: Step Selection + Reorder Buttons

Each row gains "↑" and "↓" buttons to reorder. Clicking a row selects it (which Phase D's condition workspace will react to).

**Files:**
- Modify: `js/mission_editor_steps.js`
- Test: `tests/js/missions/editor-steps.test.js` (extend)

- [ ] **Step 1: Add the failing tests**

Append:

```javascript
test('steps: clicking up arrow moves the step earlier', () => {
  const { doc, app } = setup();
  app.enterEditor();
  doc.getElementById('btn-add-step')._click();
  doc.getElementById('btn-add-step')._click();
  const [a, b] = app.editorState.steps;
  // Click the second row's up button.
  const rows = doc.getElementById('editor-steps-list').children;
  rows[1].querySelector('.step-up-btn')._click();
  assert.deepStrictEqual(app.editorState.steps.map(s => s.id), [b.id, a.id]);
});

test('steps: clicking down arrow moves the step later', () => {
  const { doc, app } = setup();
  app.enterEditor();
  doc.getElementById('btn-add-step')._click();
  doc.getElementById('btn-add-step')._click();
  const [a, b] = app.editorState.steps;
  const rows = doc.getElementById('editor-steps-list').children;
  rows[0].querySelector('.step-down-btn')._click();
  assert.deepStrictEqual(app.editorState.steps.map(s => s.id), [b.id, a.id]);
});

test('steps: clicking a row selects it', () => {
  const { doc, app } = setup();
  app.enterEditor();
  doc.getElementById('btn-add-step')._click();
  const id = app.editorState.steps[0].id;
  const row = doc.getElementById('editor-steps-list').children[0];
  row._fire('click', { target: row });
  assert.deepStrictEqual(app.editorState.selection, { kind: 'step', id });
});

test('steps: selected row gets .selected class', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  doc.getElementById('btn-add-step')._click();
  const id = app.editorState.steps[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id }));
  const row = doc.getElementById('editor-steps-list').children[0];
  assert.ok(row.classList.contains('selected'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/js/missions/editor-steps.test.js
```
Expected: FAIL — no up/down buttons, no selection-on-click.

- [ ] **Step 3: Extend the implementation**

In `js/mission_editor_steps.js`'s `renderRow`, add reorder buttons before the delete button:

```javascript
      const up = doc.createElement('button');
      up.classList.add('step-up-btn');
      up.setAttribute('type', 'button');
      up.textContent = '↑';
      up.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        e._handled = true;
        const i = app.editorState.steps.findIndex(s => s.id === step.id);
        if (i > 0) app.setEditorState(MISSIONS.editor.state.reorderStep(app.editorState, step.id, i - 1));
      });

      const down = doc.createElement('button');
      down.classList.add('step-down-btn');
      down.setAttribute('type', 'button');
      down.textContent = '↓';
      down.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        e._handled = true;
        const i = app.editorState.steps.findIndex(s => s.id === step.id);
        if (i < app.editorState.steps.length - 1) {
          app.setEditorState(MISSIONS.editor.state.reorderStep(app.editorState, step.id, i + 1));
        }
      });

      row.appendChild(up);
      row.appendChild(down);
```

Change the grid columns CSS-class accordingly (handled in Step 5).

For input fields, the click event would otherwise bubble to the row and trigger selection. Stop propagation in the input listeners so editing doesn't re-select. Or, in the row click handler, check the event target:

```javascript
      row.addEventListener('click', (ev) => {
        if (ev._handled) return;
        if (ev.target && (ev.target.tag === 'input' || ev.target.tag === 'button')) return;
        app.setEditorState(MISSIONS.editor.state.setSelection(
          app.editorState, { kind: 'step', id: step.id }));
      });
```

In `render`, mark selected rows:

```javascript
      const isSelected = state.selection
        && state.selection.kind === 'step'
        && state.selection.id === step.id;
      if (isSelected) row.classList.add('selected');
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/js/missions/editor-steps.test.js
```
Expected: PASS (10 tests).

- [ ] **Step 5: Update CSS for the new row layout**

Replace the `.editor-step-row` grid-template-columns rule in `css/mission_editor.css`:

```css
.editor-step-row {
  display: grid;
  grid-template-columns: 1fr 50px 1fr 24px 24px 24px;
  gap: 3px;
  align-items: center;
  padding: 6px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
}
.editor-step-row.selected {
  border-color: var(--amber);
  box-shadow: 0 0 0 1px var(--amber);
}
.step-up-btn, .step-down-btn {
  background: transparent;
  border: 1px solid var(--border2);
  color: var(--text-mid);
  width: 24px; height: 24px;
  border-radius: 4px;
  cursor: pointer;
  font-family: var(--font-ui);
  font-size: 11px;
}
.step-up-btn:hover, .step-down-btn:hover {
  color: var(--amber);
  border-color: var(--amber);
}
```

- [ ] **Step 6: Commit**

```bash
git add js/mission_editor_steps.js css/mission_editor.css tests/js/missions/editor-steps.test.js
git commit -m "feat(editor): step row reorder buttons + click-to-select"
```

---

## Task 16: Requires Picker

Each step row gains a small "requires" indicator that, when clicked, opens an inline panel showing checkboxes for every other step. Toggling a checkbox updates the step's `requires`.

**Files:**
- Modify: `js/mission_editor_steps.js`
- Test: `tests/js/missions/editor-steps.test.js` (extend)

- [ ] **Step 1: Add the failing test**

Append:

```javascript
test('requires: checkbox for another step toggles requires on the row', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  doc.getElementById('btn-add-step')._click();
  doc.getElementById('btn-add-step')._click();
  const [a, b] = app.editorState.steps;
  // Open requires on row B (second row).
  const rows = doc.getElementById('editor-steps-list').children;
  const reqBtn = rows[1].querySelector('.step-requires-btn');
  reqBtn._click();
  // The panel should be in the DOM with a checkbox for step A.
  const panel = rows[1].querySelector('.step-requires-panel');
  assert.ok(panel, 'requires panel should appear');
  const checkbox = panel.querySelector('input[type=checkbox]');
  assert.ok(checkbox, 'expected a checkbox for the other step');
  checkbox._fire('change', { target: { checked: true } });
  // Mock input doesn't track `checked` on the actual input — the handler reads
  // from the synthetic event. Verify state side-effect:
  assert.deepStrictEqual(app.editorState.steps[1].requires, [a.id]);
});

test('requires: toggling off removes the requirement', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  doc.getElementById('btn-add-step')._click();
  doc.getElementById('btn-add-step')._click();
  const [a, b] = app.editorState.steps;
  app.setEditorState(ctx.MISSIONS.editor.state.editStep(app.editorState, b.id, { requires: [a.id] }));
  const rows = doc.getElementById('editor-steps-list').children;
  rows[1].querySelector('.step-requires-btn')._click();
  const panel = rows[1].querySelector('.step-requires-panel');
  const checkbox = panel.querySelector('input[type=checkbox]');
  checkbox._fire('change', { target: { checked: false } });
  assert.deepStrictEqual(app.editorState.steps[1].requires, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/js/missions/editor-steps.test.js
```
Expected: FAIL — no requires button or panel.

- [ ] **Step 3: Extend the implementation**

In `js/mission_editor_steps.js`'s `renderRow`, before the delete button, add:

```javascript
      const reqBtn = doc.createElement('button');
      reqBtn.classList.add('step-requires-btn');
      reqBtn.setAttribute('type', 'button');
      reqBtn.textContent = '⛓';
      let panel = null;
      reqBtn.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        e._handled = true;
        if (panel) { row.removeChild(panel); panel = null; return; }
        panel = doc.createElement('div');
        panel.classList.add('step-requires-panel');
        const others = app.editorState.steps.filter(s => s.id !== step.id);
        if (others.length === 0) {
          const empty = doc.createElement('div');
          empty.textContent = 'No other steps yet.';
          empty.classList.add('step-requires-empty');
          panel.appendChild(empty);
        } else {
          const currentRequires = new Set(step.requires || []);
          for (const other of others) {
            const label = doc.createElement('label');
            label.classList.add('step-requires-item');
            const cb = doc.createElement('input');
            cb.setAttribute('type', 'checkbox');
            if (currentRequires.has(other.id)) cb.setAttribute('checked', 'true');
            cb.addEventListener('change', (ev) => {
              const checked = ev.target && ev.target.checked;
              const cur = new Set(app.editorState.steps.find(s => s.id === step.id).requires || []);
              if (checked) cur.add(other.id); else cur.delete(other.id);
              app.setEditorState(MISSIONS.editor.state.editStep(
                app.editorState, step.id, { requires: Array.from(cur) }));
            });
            label.appendChild(cb);
            const span = doc.createElement('span');
            span.textContent = other.title || other.id;
            label.appendChild(span);
            panel.appendChild(label);
          }
        }
        row.appendChild(panel);
      });
      row.appendChild(reqBtn);
```

Update the grid-template-columns to add a column for the requires button. In `css/mission_editor.css` change:

```css
.editor-step-row {
  display: grid;
  grid-template-columns: 1fr 50px 1fr 24px 24px 24px 24px;
  gap: 3px;
  /* ... rest unchanged ... */
}
.step-requires-btn {
  background: transparent;
  border: 1px solid var(--border2);
  color: var(--text-mid);
  width: 24px; height: 24px;
  border-radius: 4px;
  cursor: pointer;
  font-family: var(--font-ui);
  font-size: 11px;
}
.step-requires-btn:hover { color: var(--amber); border-color: var(--amber); }
.step-requires-panel {
  grid-column: 1 / -1;
  background: var(--surface3);
  border-top: 1px solid var(--border2);
  margin-top: 6px;
  padding: 8px;
  border-radius: 5px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.step-requires-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text);
}
.step-requires-empty {
  font-size: 11px;
  color: var(--text-mid);
  font-style: italic;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/js/missions/editor-steps.test.js
```
Expected: PASS (12 tests).

- [ ] **Step 5: Run full suite for regressions**

```bash
npm test
```
Expected: zero regressions.

- [ ] **Step 6: Commit**

```bash
git add js/mission_editor_steps.js css/mission_editor.css tests/js/missions/editor-steps.test.js
git commit -m "feat(editor): requires picker — inline checkboxes for step dependencies"
```

---

# Phase C milestone

After Task 16, the editor can fully describe a mission's *non-condition* metadata: title, description, type, difficulty, full step list with title/points/hint/requires. Save would still fail because conditions are placeholder `{kind:'zone', zone:''}` — that's Phase D.


---

# Phase D: Condition Picker (Blockly)

Phase D is the hardest piece. A second Blockly workspace, separate from the main code-authoring one, hosts six predicate blocks that compose into a condition tree matching Plan 1's schema. The workspace appears below the step list when a step is selected; edits sync into `state.steps[i].condition`.

Blockly is already loaded (`https://unpkg.com/blockly@10.4.3/blockly.min.js`). Tests use a stub Blockly because driving real Blockly headlessly is brittle; the stub captures the contract the editor relies on.

---

## Task 17: Blockly Stub for Tests + Workspace Lifecycle

Add a minimal Blockly stub to the test harness (just enough surface area for our editor module to construct a workspace, listen for changes, and serialize). Mount/unmount the condition workspace based on step selection.

**Files:**
- Create: `tests/js/mocks/blockly-stub.js`
- Create: `js/mission_editor_conditions.js`
- Test: `tests/js/missions/editor-conditions.test.js`

- [ ] **Step 1: Create the Blockly stub**

Create `tests/js/mocks/blockly-stub.js`:

```javascript
'use strict';

// Minimal Blockly stub for editor-conditions tests. Captures the surface
// our code uses: inject (returns a workspace), defineBlocksWithJsonArray,
// JavaScript (generator with workspaceToCode + per-block stubs), and
// workspace.addChangeListener / clear / dispose.

function makeBlocklyStub() {
  const definedBlocks = {};
  let lastWorkspace = null;

  function createWorkspace() {
    const listeners = [];
    const blocks = [];
    const ws = {
      _blocks: blocks,
      addChangeListener(fn) { listeners.push(fn); },
      removeChangeListener(fn) {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      },
      clear() { blocks.length = 0; _fire(); },
      dispose() { listeners.length = 0; blocks.length = 0; },
      // Test seam: set a synthetic block tree, then notify listeners.
      _setBlocks(newBlocks) { blocks.length = 0; for (const b of newBlocks) blocks.push(b); _fire(); },
      _fire(ev) { for (const fn of listeners) fn(ev || {}); },
      getAllBlocks() { return blocks; },
      getTopBlocks() { return blocks.filter(b => !b.parent); },
    };
    function _fire() { ws._fire(); }
    lastWorkspace = ws;
    return ws;
  }

  return {
    inject: (container, opts) => createWorkspace(),
    defineBlocksWithJsonArray: (defs) => {
      for (const d of defs) definedBlocks[d.type] = d;
    },
    Blocks: definedBlocks,
    JavaScript: {
      // Per-block generator functions get attached here by the editor module.
      // workspaceToCode walks top blocks and concatenates per-block output.
      workspaceToCode(ws) {
        const top = ws.getTopBlocks();
        if (top.length === 0) return '';
        // For our condition workspace there is at most one top block — the
        // root predicate. Each block stub provides ._jsonCondition().
        return JSON.stringify(top[0]._jsonCondition());
      },
    },
    Xml: {
      // We do not need real XML for tests; the editor module always uses
      // its own condition-tree format.
      domToText() { return ''; },
      textToDom()  { return null; },
    },
    utils: { xml: { textToDom: () => null } },
    Events: { CHANGE: 'change' },
    _lastWorkspace: () => lastWorkspace,
    _definedBlocks: definedBlocks,
  };
}

module.exports = { makeBlocklyStub };
```

- [ ] **Step 2: Write the failing test**

Create `tests/js/missions/editor-conditions.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');
const { makeEditorDoc } = require('../mocks/editor-dom');
const { makeBlocklyStub } = require('../mocks/blockly-stub');

function env() {
  const ctx = makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_editor_state',
    'mission_app', 'mission_editor_app', 'mission_editor_conditions',
  ]).ctx;
  ctx.Blockly = makeBlocklyStub();
  return ctx;
}

function setup() {
  const ctx = env();
  const doc = makeEditorDoc();
  ctx.document = doc;
  const app = ctx.MISSIONS.app.create();
  ctx.MISSIONS.editor.app.attach(app, doc);
  ctx.MISSIONS.editor.conditions.attach(app, doc);
  return { ctx, doc, app };
}

test('conditions: section starts hidden when no step is selected', () => {
  const { doc, app } = setup();
  app.enterEditor();
  const section = doc.getElementById('editor-cond-section');
  assert.strictEqual(section.hidden, true);
});

test('conditions: section appears when a step is selected', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addStep(app.editorState));
  const stepId = app.editorState.steps[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id: stepId }));
  const section = doc.getElementById('editor-cond-section');
  assert.strictEqual(section.hidden, false);
});

test('conditions: deselecting hides the section', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addStep(app.editorState));
  const id = app.editorState.steps[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id }));
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, null));
  assert.strictEqual(doc.getElementById('editor-cond-section').hidden, true);
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
node --test tests/js/missions/editor-conditions.test.js
```
Expected: FAIL — `MISSIONS.editor.conditions` undefined.

- [ ] **Step 4: Write minimal implementation**

Create `js/mission_editor_conditions.js`:

```javascript
'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  const editor = (MISSIONS.editor = MISSIONS.editor || {});

  function attach(app, doc) {
    const section = doc.getElementById('editor-cond-section');
    const container = doc.getElementById('editor-cond-workspace');
    const Blockly = global.Blockly;
    let workspace = null;
    let suppressNextChange = false;

    function ensureWorkspace() {
      if (workspace || !Blockly || !container) return workspace;
      workspace = Blockly.inject(container, { toolbox: null, readOnly: false });
      workspace.addChangeListener(() => {
        if (suppressNextChange) { suppressNextChange = false; return; }
        syncToState();
      });
      return workspace;
    }

    function syncToState() {
      // Implemented in Task 19 (generator-to-condition wiring).
    }

    function showForStep(step) {
      if (!section) return;
      section.hidden = false;
      ensureWorkspace();
      // Load blocks for the step's current condition (Task 20).
    }

    function hide() {
      if (section) section.hidden = true;
    }

    app.onChange(({ mode, editorState }) => {
      if (mode !== 'editor' || !editorState) { hide(); return; }
      const sel = editorState.selection;
      if (sel && sel.kind === 'step') {
        const step = editorState.steps.find(s => s.id === sel.id);
        if (step) showForStep(step);
        else hide();
      } else {
        hide();
      }
    });
  }

  editor.conditions = { attach };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
node --test tests/js/missions/editor-conditions.test.js
```
Expected: PASS (3 tests).

- [ ] **Step 6: Register script tag + boot wiring**

In `index.html`, after `<script src="js/mission_editor_steps.js"></script>`:

```html
  <script src="js/mission_editor_conditions.js"></script>
```

In `js/mission_app.js`'s `boot()`, after the steps attach:

```javascript
    if (MISSIONS.editor && MISSIONS.editor.conditions && MISSIONS.editor.conditions.attach) {
      MISSIONS.editor.conditions.attach(app, doc);
    }
```

- [ ] **Step 7: Commit**

```bash
git add tests/js/mocks/blockly-stub.js js/mission_editor_conditions.js js/mission_app.js index.html tests/js/missions/editor-conditions.test.js
git commit -m "feat(editor): condition workspace shell — appears on step selection"
```

---

## Task 18: Block Definitions

Define the six predicate block types using `Blockly.defineBlocksWithJsonArray`. Each block is a "boolean output" block matching one condition primitive.

**Files:**
- Modify: `js/mission_editor_conditions.js`
- Test: `tests/js/missions/editor-conditions.test.js` (extend)

- [ ] **Step 1: Add the failing test**

Append:

```javascript
test('conditions: attaching defines all six predicate blocks', () => {
  const { ctx } = setup();
  // Defined-blocks map is populated by attach (via ensureBlockDefs).
  const defined = ctx.Blockly._definedBlocks;
  for (const t of ['cond_zone', 'cond_sensor', 'cond_contact', 'cond_not', 'cond_all_of', 'cond_any_of']) {
    assert.ok(defined[t], `expected block type "${t}" to be defined`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/missions/editor-conditions.test.js
```
Expected: FAIL — defined-blocks empty.

- [ ] **Step 3: Add block definitions**

In `js/mission_editor_conditions.js`, add at module scope (outside `attach`):

```javascript
  const BLOCK_DEFS = [
    {
      type: 'cond_zone',
      message0: 'robot is in zone %1',
      args0: [{ type: 'field_dropdown', name: 'ZONE', options: [['(none)', '']] }],
      output: 'Boolean',
      colour: 210,
      tooltip: 'True when the robot is inside the named zone.',
    },
    {
      type: 'cond_sensor',
      message0: 'sensor %1 %2 %3',
      args0: [
        { type: 'field_dropdown', name: 'PORT', options: [['Color (C)', 'C'], ['Distance (D)', 'D'], ['Force (E)', 'E']] },
        { type: 'field_dropdown', name: 'OP', options: [['==','=='], ['!=','!='], ['<','<'], ['<=','<='], ['>','>'], ['>=','>=']] },
        { type: 'field_input', name: 'VALUE', text: '0' },
      ],
      output: 'Boolean',
      colour: 210,
    },
    {
      type: 'cond_contact',
      message0: 'robot has contacted obstacle %1',
      args0: [{ type: 'field_dropdown', name: 'OBSTACLE', options: [['(none)', '']] }],
      output: 'Boolean',
      colour: 210,
    },
    {
      type: 'cond_not',
      message0: 'not %1',
      args0: [{ type: 'input_value', name: 'OF', check: 'Boolean' }],
      output: 'Boolean',
      colour: 30,
    },
    {
      type: 'cond_all_of',
      message0: 'all of %1',
      args0: [{ type: 'input_statement', name: 'OF' }],
      output: 'Boolean',
      colour: 30,
    },
    {
      type: 'cond_any_of',
      message0: 'any of %1',
      args0: [{ type: 'input_statement', name: 'OF' }],
      output: 'Boolean',
      colour: 30,
    },
  ];

  let blocksRegistered = false;
  function ensureBlockDefs(Blockly) {
    if (blocksRegistered || !Blockly) return;
    Blockly.defineBlocksWithJsonArray(BLOCK_DEFS);
    blocksRegistered = true;
  }
```

In `attach`, call `ensureBlockDefs(Blockly);` before `ensureWorkspace`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/js/missions/editor-conditions.test.js
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add js/mission_editor_conditions.js tests/js/missions/editor-conditions.test.js
git commit -m "feat(editor): define six predicate block types for condition picker"
```

---

## Task 19: Generator — Blockly Tree → Condition JSON

Each block emits its condition primitive. The workspace's top block becomes the step's `condition` tree.

**Files:**
- Modify: `js/mission_editor_conditions.js`
- Test: `tests/js/missions/editor-conditions.test.js` (extend)

- [ ] **Step 1: Add the failing test**

Append:

```javascript
function makeBlock(type, fields, children, parent) {
  return {
    type,
    fields: fields || {},
    children: children || {},
    parent: parent || null,
    _jsonCondition() {
      // Test helper — mirror the generator the editor will provide.
      return ctxCondGenForBlock(this);
    },
  };
}

function ctxCondGenForBlock(b) {
  if (b.type === 'cond_zone')
    return { kind: 'zone', subject: 'robot', zone: b.fields.ZONE };
  if (b.type === 'cond_sensor') {
    const raw = b.fields.VALUE;
    const asNum = Number(raw);
    return { kind: 'sensor', port: b.fields.PORT, op: b.fields.OP,
             value: Number.isNaN(asNum) ? raw : asNum };
  }
  if (b.type === 'cond_contact')
    return { kind: 'contact', obstacle: b.fields.OBSTACLE };
  if (b.type === 'cond_not')
    return { kind: 'not', of: ctxCondGenForBlock(b.children.OF) };
  if (b.type === 'cond_all_of' || b.type === 'cond_any_of') {
    const list = (b.children.OF || []).map(ctxCondGenForBlock);
    return { kind: b.type === 'cond_all_of' ? 'all_of' : 'any_of', of: list };
  }
  return null;
}

test('generator: zone block emits { kind: zone, subject: robot, zone: <id> }', () => {
  const { ctx, app } = setup();
  app.enterEditor();
  // Add a step + select it so workspace is live.
  app.setEditorState(ctx.MISSIONS.editor.state.addStep(app.editorState));
  const stepId = app.editorState.steps[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id: stepId }));
  const ws = ctx.Blockly._lastWorkspace();
  ws._setBlocks([makeBlock('cond_zone', { ZONE: 'red' })]);
  // The editor should sync the workspace top block to step.condition.
  assert.deepStrictEqual(app.editorState.steps[0].condition,
    { kind: 'zone', subject: 'robot', zone: 'red' });
});

test('generator: sensor block emits numeric value when input parses as number', () => {
  const { ctx, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addStep(app.editorState));
  const id = app.editorState.steps[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id }));
  const ws = ctx.Blockly._lastWorkspace();
  ws._setBlocks([makeBlock('cond_sensor', { PORT: 'D', OP: '<', VALUE: '100' })]);
  assert.deepStrictEqual(app.editorState.steps[0].condition,
    { kind: 'sensor', port: 'D', op: '<', value: 100 });
});

test('generator: not wraps an inner block', () => {
  const { ctx, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addStep(app.editorState));
  const id = app.editorState.steps[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id }));
  const ws = ctx.Blockly._lastWorkspace();
  const inner = makeBlock('cond_zone', { ZONE: 'green' });
  ws._setBlocks([makeBlock('cond_not', {}, { OF: inner })]);
  assert.deepStrictEqual(app.editorState.steps[0].condition,
    { kind: 'not', of: { kind: 'zone', subject: 'robot', zone: 'green' } });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/js/missions/editor-conditions.test.js
```
Expected: FAIL — `syncToState` is a no-op currently.

- [ ] **Step 3: Implement `syncToState`**

Replace the empty `syncToState` in `js/mission_editor_conditions.js`:

```javascript
    function syncToState() {
      if (!workspace || !app.editorState) return;
      const sel = app.editorState.selection;
      if (!sel || sel.kind !== 'step') return;
      const stepId = sel.id;
      const top = workspace.getTopBlocks();
      const condition = top.length ? blockToCondition(top[0]) : null;
      if (!condition) return;
      app.setEditorState(MISSIONS.editor.state.editStep(app.editorState, stepId, { condition }));
    }

    function blockToCondition(b) {
      if (!b) return null;
      switch (b.type) {
        case 'cond_zone':
          return { kind: 'zone', subject: 'robot', zone: b.fields.ZONE };
        case 'cond_sensor': {
          const raw = b.fields.VALUE;
          const asNum = Number(raw);
          return { kind: 'sensor', port: b.fields.PORT, op: b.fields.OP,
                   value: Number.isNaN(asNum) || raw === '' ? raw : asNum };
        }
        case 'cond_contact':
          return { kind: 'contact', obstacle: b.fields.OBSTACLE };
        case 'cond_not':
          return { kind: 'not', of: blockToCondition(b.children.OF) };
        case 'cond_all_of':
          return { kind: 'all_of', of: (b.children.OF || []).map(blockToCondition).filter(Boolean) };
        case 'cond_any_of':
          return { kind: 'any_of', of: (b.children.OF || []).map(blockToCondition).filter(Boolean) };
        default:
          return null;
      }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/js/missions/editor-conditions.test.js
```
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add js/mission_editor_conditions.js tests/js/missions/editor-conditions.test.js
git commit -m "feat(editor): generator translates condition blocks to JSON tree"
```

---

## Task 20: Load Condition Into Workspace + Dropdowns Auto-Populate

When a step is selected, load its current `condition` into the workspace. Auto-populate `ZONE` and `OBSTACLE` dropdowns from the field state.

**Files:**
- Modify: `js/mission_editor_conditions.js`
- Test: `tests/js/missions/editor-conditions.test.js` (extend)

- [ ] **Step 1: Add the failing test**

Append:

```javascript
test('loadIntoWorkspace: selecting a step with an existing condition populates the workspace', () => {
  const { ctx, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addZone(app.editorState, { x: 100, y: 100 }));
  const zid = app.editorState.field.zones[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.addStep(app.editorState));
  const sid = app.editorState.steps[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.editStep(app.editorState, sid, {
    condition: { kind: 'zone', subject: 'robot', zone: zid },
  }));
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id: sid }));
  const ws = ctx.Blockly._lastWorkspace();
  const top = ws.getTopBlocks();
  assert.strictEqual(top.length, 1);
  assert.strictEqual(top[0].type, 'cond_zone');
  assert.strictEqual(top[0].fields.ZONE, zid);
});

test('dropdowns: zone dropdown options reflect placed zones', () => {
  const { ctx, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addZone(app.editorState, { x: 0, y: 0 }));
  app.setEditorState(ctx.MISSIONS.editor.state.addZone(app.editorState, { x: 200, y: 200 }));
  app.setEditorState(ctx.MISSIONS.editor.state.addStep(app.editorState));
  const id = app.editorState.steps[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id }));
  const opts = ctx.MISSIONS.editor.conditions._zoneOptions(app.editorState);
  assert.strictEqual(opts.length, 2);
  for (const [label, value] of opts) {
    assert.strictEqual(typeof label, 'string');
    assert.strictEqual(typeof value, 'string');
  }
});

test('dropdowns: obstacle dropdown options reflect placed obstacles', () => {
  const { ctx, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addObstacle(app.editorState, { x: 0, y: 0 }));
  app.setEditorState(ctx.MISSIONS.editor.state.addStep(app.editorState));
  const id = app.editorState.steps[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id }));
  const opts = ctx.MISSIONS.editor.conditions._obstacleOptions(app.editorState);
  assert.strictEqual(opts.length, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/js/missions/editor-conditions.test.js
```
Expected: FAIL — `_zoneOptions` not exported, workspace doesn't load condition.

- [ ] **Step 3: Implement loadIntoWorkspace and dropdown helpers**

In `js/mission_editor_conditions.js`, add module-scope helpers:

```javascript
  function zoneOptions(state) {
    const zones = (state && state.field && state.field.zones) || [];
    if (zones.length === 0) return [['(no zones yet)', '']];
    return zones.map(z => [`${z.color || z.id}`, z.id]);
  }

  function obstacleOptions(state) {
    const obs = (state && state.field && state.field.obstacles) || [];
    if (obs.length === 0) return [['(no obstacles yet)', '']];
    return obs.map(o => [o.id, o.id]);
  }

  function conditionToBlocks(cond) {
    if (!cond || !cond.kind) return [];
    function buildOne(c) {
      switch (c.kind) {
        case 'zone':
          return { type: 'cond_zone', fields: { ZONE: c.zone || '' }, children: {}, parent: null };
        case 'sensor':
          return { type: 'cond_sensor', fields: { PORT: c.port, OP: c.op, VALUE: String(c.value) }, children: {}, parent: null };
        case 'contact':
          return { type: 'cond_contact', fields: { OBSTACLE: c.obstacle || '' }, children: {}, parent: null };
        case 'not':
          return { type: 'cond_not', fields: {}, children: { OF: buildOne(c.of) }, parent: null };
        case 'all_of':
        case 'any_of':
          return {
            type: c.kind === 'all_of' ? 'cond_all_of' : 'cond_any_of',
            fields: {}, children: { OF: (c.of || []).map(buildOne) }, parent: null,
          };
        default:
          return null;
      }
    }
    const root = buildOne(cond);
    return root ? [root] : [];
  }
```

Update `showForStep`:

```javascript
    function showForStep(step) {
      if (!section) return;
      section.hidden = false;
      ensureWorkspace();
      if (!workspace) return;
      suppressNextChange = true;
      workspace.clear();
      const blocks = conditionToBlocks(step.condition);
      workspace._setBlocks(blocks);
      suppressNextChange = false;
    }
```

Expose dropdown helpers on the export:

```javascript
  editor.conditions = { attach, _zoneOptions: zoneOptions, _obstacleOptions: obstacleOptions };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/js/missions/editor-conditions.test.js
```
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add js/mission_editor_conditions.js tests/js/missions/editor-conditions.test.js
git commit -m "feat(editor): load existing condition into workspace + zone/obstacle dropdown helpers"
```

---

## Task 21: Wire Production Dropdowns (Blockly mutator)

In real Blockly, dropdown options are set at block-definition time and updated via mutators. Add a post-load hook that walks all `cond_zone` / `cond_contact` blocks in the workspace after `showForStep` and updates their dropdown options to reflect the current field state.

**Files:**
- Modify: `js/mission_editor_conditions.js`
- Test: none (this code path runs only with real Blockly; the stub tests in Task 20 cover the logic)

- [ ] **Step 1: Add the dropdown-update production hook**

In `js/mission_editor_conditions.js`, inside `attach`, after `showForStep` definition:

```javascript
    function updateLiveDropdowns(state) {
      if (!workspace || !workspace.getAllBlocks) return;
      const zOpts = zoneOptions(state);
      const oOpts = obstacleOptions(state);
      for (const b of workspace.getAllBlocks()) {
        if (b.type === 'cond_zone' && b.getField && typeof b.getField === 'function') {
          const f = b.getField('ZONE');
          if (f && typeof f.menuGenerator_ !== 'undefined') f.menuGenerator_ = zOpts;
        }
        if (b.type === 'cond_contact' && b.getField && typeof b.getField === 'function') {
          const f = b.getField('OBSTACLE');
          if (f && typeof f.menuGenerator_ !== 'undefined') f.menuGenerator_ = oOpts;
        }
      }
    }
```

Call `updateLiveDropdowns(app.editorState)` at the end of `showForStep`.

- [ ] **Step 2: Run full editor-conditions tests**

```bash
node --test tests/js/missions/editor-conditions.test.js
```
Expected: PASS — the stub doesn't implement `getField`, so the helper is a no-op in tests but production updates dropdowns.

- [ ] **Step 3: Commit**

```bash
git add js/mission_editor_conditions.js
git commit -m "feat(editor): update Blockly dropdowns to reflect current field state"
```

---

## Task 22: Sync Workspace on Field Changes + Step Switch

When the author places a new zone/obstacle while a step is selected, refresh the dropdowns. When the author switches step selection, reload the workspace.

**Files:**
- Modify: `js/mission_editor_conditions.js`
- Test: `tests/js/missions/editor-conditions.test.js` (extend)

- [ ] **Step 1: Add the failing test**

Append:

```javascript
test('workspace: switching step selection reloads the workspace', () => {
  const { ctx, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addZone(app.editorState, { x: 0, y: 0 }));
  const zid = app.editorState.field.zones[0].id;
  // Two steps with different conditions.
  app.setEditorState(ctx.MISSIONS.editor.state.addStep(app.editorState));
  app.setEditorState(ctx.MISSIONS.editor.state.addStep(app.editorState));
  const [a, b] = app.editorState.steps;
  app.setEditorState(ctx.MISSIONS.editor.state.editStep(app.editorState, a.id,
    { condition: { kind: 'zone', subject: 'robot', zone: zid } }));
  app.setEditorState(ctx.MISSIONS.editor.state.editStep(app.editorState, b.id,
    { condition: { kind: 'contact', obstacle: 'none' } }));
  // Select step a, then b — expect workspace to swap.
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id: a.id }));
  const ws = ctx.Blockly._lastWorkspace();
  assert.strictEqual(ws.getTopBlocks()[0].type, 'cond_zone');
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id: b.id }));
  assert.strictEqual(ws.getTopBlocks()[0].type, 'cond_contact');
});
```

- [ ] **Step 2: Run test to verify it passes**

This may already pass because `app.onChange` re-fires `showForStep` on each state change. Run the test:

```bash
node --test tests/js/missions/editor-conditions.test.js
```

If it FAILS because the workspace doesn't re-render across step-switches, the cause is likely that `showForStep` only runs on the FIRST step selection. Verify the onChange listener in `attach` re-evaluates selection each time.

If it PASSES, no implementation changes needed — the test locks in correct behaviour.

- [ ] **Step 3: Commit**

```bash
git add tests/js/missions/editor-conditions.test.js
git commit -m "test(editor): lock in workspace reload on step-selection switch"
```

---

# Phase D milestone

After Task 22, conditions can be edited via the Blockly workspace:
- Six predicate blocks defined (zone / sensor / contact / not / all_of / any_of)
- Generator emits JSON matching Plan 1's condition schema
- Dropdowns reflect placed zones/obstacles
- Workspace loads/reloads on step selection
- Edits sync back to `state.steps[i].condition`

Authors can now produce a complete mission state from scratch — title, description, type, difficulty, field, steps with conditions. The next phase makes that state actually playable.

---

# Phase E: Playtest (First Assessment)

Phase E delivers the **first end-to-end assessment**: author a mission visually, click Playtest, run the engine against the authored content. The state-model ↔ engine handoff is the critical thing being validated — File I/O (Phase F) is independent of that hand-off and is layered on after Playtest works.

The Playtest flow:
1. Click "▶ Playtest" in the editor toolbar.
2. Editor serializes current state to a `mission.json`.
3. Loader validates; if invalid, surface the validation error inline.
4. Save to `localStorage["mission_playtest_temp"]` (keeps in-memory edit state intact).
5. Call `app.enterPlay(mission)` — Plan 1's existing onChange handler renders Mission Map.
6. A persistent "✕ Back to Editor" pill replaces the standard "✕ Exit Mission".
7. Click "Back to Editor" → editor's in-memory state is restored (not from the temp file).

---

## Task 23: Validate-on-Demand Helper

A helper that takes editor state, serializes it, calls `MISSIONS.loader.load()`, and returns either `{ ok: true, mission }` or `{ ok: false, error: string }`. Used by Playtest and Save.

**Files:**
- Modify: `js/mission_editor_state.js`
- Test: `tests/js/missions/editor-serializer.test.js` (extend)

- [ ] **Step 1: Add the failing test**

Append to `tests/js/missions/editor-serializer.test.js`:

```javascript
test('validate: valid state returns { ok: true, mission }', () => {
  const ctx = env();
  let s = ctx.MISSIONS.editor.state.createBlank();
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 100, y: 100 });
  s.steps.push({
    id: 'a', title: 'a', points: 1,
    condition: { kind: 'zone', subject: 'robot', zone: s.field.zones[0].id },
  });
  const r = ctx.MISSIONS.editor.state.validate(s);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.mission.id, s.id);
});

test('validate: empty steps on mission-type returns { ok: false, error }', () => {
  const ctx = env();
  const s = ctx.MISSIONS.editor.state.createBlank();
  const r = ctx.MISSIONS.editor.state.validate(s);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /at least one step/);
});

test('validate: condition referencing a deleted zone returns ok:false', () => {
  const ctx = env();
  let s = ctx.MISSIONS.editor.state.createBlank();
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 0, y: 0 });
  const zid = s.field.zones[0].id;
  s.steps.push({
    id: 'a', title: 'a', points: 1,
    condition: { kind: 'zone', subject: 'robot', zone: zid },
  });
  s = ctx.MISSIONS.editor.state.deleteZone(s, zid);
  const r = ctx.MISSIONS.editor.state.validate(s);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /unknown zone/);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/missions/editor-serializer.test.js
```
Expected: FAIL — `validate is not a function`.

- [ ] **Step 3: Add the helper**

In `js/mission_editor_state.js`:

```javascript
  function validate(state) {
    const raw = serializeToMission(state);
    try {
      const mission = MISSIONS.loader.load(raw);
      return { ok: true, mission };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
```

Add `validate` to the export.

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/js/missions/editor-serializer.test.js
```
Expected: PASS (4 + 3 = 7 tests).

- [ ] **Step 5: Commit**

```bash
git add js/mission_editor_state.js tests/js/missions/editor-serializer.test.js
git commit -m "feat(editor): validate() helper round-trips state through loader"
```

---

## Task 24: Playtest Module — Serialize, Save Temp, Enter Play

Wire `#btn-editor-playtest` to validate the current state, save to a temp localStorage slot, and switch the app to Play mode with the validated mission.

**Files:**
- Create: `js/mission_editor_playtest.js`
- Test: `tests/js/missions/editor-playtest.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/js/missions/editor-playtest.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');
const { makeEditorDoc } = require('../mocks/editor-dom');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_editor_state',
    'mission_app', 'mission_editor_app', 'mission_editor_playtest',
  ]).ctx;
}

function setupStorage() {
  const store = new Map();
  return {
    getItem: k => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
    _store: store,
  };
}

function setup() {
  const ctx = env();
  const doc = makeEditorDoc();
  ctx.document = doc;
  const storage = setupStorage();
  const app = ctx.MISSIONS.app.create();
  ctx.MISSIONS.editor.app.attach(app, doc);
  ctx.MISSIONS.editor.playtest.attach(app, doc, storage);
  return { ctx, doc, app, storage };
}

function authoredState(ctx) {
  let s = ctx.MISSIONS.editor.state.createBlank();
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 100, y: 100 });
  s.steps.push({
    id: 'a', title: 'Reach',  points: 10,
    condition: { kind: 'zone', subject: 'robot', zone: s.field.zones[0].id },
  });
  return s;
}

test('playtest: valid state switches to play mode and saves temp', () => {
  const { ctx, doc, app, storage } = setup();
  app.enterEditor();
  app.setEditorState(authoredState(ctx));
  doc.getElementById('btn-editor-playtest')._click();
  assert.strictEqual(app.mode, 'play');
  assert.ok(storage.getItem('mission_playtest_temp'), 'temp slot should be written');
});

test('playtest: invalid state does NOT switch mode; surfaces error', () => {
  const { ctx, doc, app, storage } = setup();
  app.enterEditor();  // blank state with no steps
  doc.getElementById('btn-editor-playtest')._click();
  assert.strictEqual(app.mode, 'editor');
  assert.strictEqual(storage.getItem('mission_playtest_temp'), null);
  // The editor toolbar should have an error indicator.
  const tag = doc.getElementById('editor-toolbar').querySelector('.editor-error');
  assert.ok(tag, 'expected an inline error element');
  assert.match(tag.textContent, /at least one step/);
});

test('playtest: returning from play preserves in-memory edit state', () => {
  const { ctx, doc, app, storage } = setup();
  app.enterEditor();
  app.setEditorState(authoredState(ctx));
  const titleBefore = app.editorState.title;
  doc.getElementById('btn-editor-playtest')._click();
  assert.strictEqual(app.mode, 'play');
  // Simulate "Back to Editor" — playtest module should expose a return method.
  ctx.MISSIONS.editor.playtest.returnToEditor();
  assert.strictEqual(app.mode, 'editor');
  assert.strictEqual(app.editorState.title, titleBefore);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/missions/editor-playtest.test.js
```
Expected: FAIL — `MISSIONS.editor.playtest` undefined.

- [ ] **Step 3: Write minimal implementation**

Create `js/mission_editor_playtest.js`:

```javascript
'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  const editor = (MISSIONS.editor = MISSIONS.editor || {});

  const TEMP_KEY = 'mission_playtest_temp';

  let savedEditorState = null;
  let savedApp = null;
  let savedStorage = null;
  let savedDoc = null;

  function attach(app, doc, storage) {
    savedApp = app; savedDoc = doc; savedStorage = storage || (global.localStorage || null);
    const btn = doc.getElementById('btn-editor-playtest');
    if (!btn) return;
    btn.addEventListener('click', () => playtest());
  }

  function playtest() {
    if (!savedApp || savedApp.mode !== 'editor') return;
    clearError();
    const result = MISSIONS.editor.state.validate(savedApp.editorState);
    if (!result.ok) { showError(result.error); return; }
    savedEditorState = savedApp.editorState;
    if (savedStorage && savedStorage.setItem) {
      savedStorage.setItem('mission_playtest_temp', JSON.stringify(MISSIONS.editor.state.serializeToMission(savedEditorState)));
    }
    savedApp.enterPlay(result.mission);
  }

  function returnToEditor() {
    if (!savedApp || savedApp.mode !== 'play') return;
    if (!savedEditorState) { savedApp.exitMission(); return; }
    savedApp.enterEditor();
    savedApp.setEditorState(savedEditorState);
    savedEditorState = null;
  }

  function showError(msg) {
    if (!savedDoc) return;
    const toolbar = savedDoc.getElementById('editor-toolbar');
    if (!toolbar) return;
    let tag = toolbar.querySelector('.editor-error');
    if (!tag) {
      tag = savedDoc.createElement('span');
      tag.classList.add('editor-error');
      toolbar.appendChild(tag);
    }
    tag.textContent = `⚠ ${msg}`;
  }

  function clearError() {
    if (!savedDoc) return;
    const toolbar = savedDoc.getElementById('editor-toolbar');
    if (!toolbar) return;
    const tag = toolbar.querySelector('.editor-error');
    if (tag) toolbar.removeChild(tag);
  }

  editor.playtest = { attach, playtest, returnToEditor };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/js/missions/editor-playtest.test.js
```
Expected: PASS (3 tests).

- [ ] **Step 5: Register + wire**

In `index.html`, after `<script src="js/mission_editor_conditions.js"></script>`:

```html
  <script src="js/mission_editor_playtest.js"></script>
```

In `js/mission_app.js`'s `boot()`, after conditions attach:

```javascript
    if (MISSIONS.editor && MISSIONS.editor.playtest && MISSIONS.editor.playtest.attach) {
      MISSIONS.editor.playtest.attach(app, doc, storage);
    }
```

- [ ] **Step 6: Add the .editor-error CSS**

Append to `css/mission_editor.css`:

```css
.editor-error {
  margin-left: 12px;
  padding: 4px 10px;
  background: rgba(239,68,68,0.12);
  border: 1px solid var(--red);
  color: var(--red);
  border-radius: 5px;
  font-size: 11px;
  font-weight: 700;
}
```

- [ ] **Step 7: Commit**

```bash
git add js/mission_editor_playtest.js js/mission_app.js index.html css/mission_editor.css tests/js/missions/editor-playtest.test.js
git commit -m "feat(editor): Playtest button validates and switches to Play mode"
```

---

## Task 25: "Back to Editor" Button in Play Mode

When a Playtest run is active, the Mission Map's "✕ Exit Mission" button should become "✕ Back to Editor" so the author returns to their unfinished work.

**Files:**
- Modify: `js/mission_editor_playtest.js`
- Modify: `index.html` (optional — a second button id, OR we relabel the existing one)
- Test: `tests/js/missions/editor-playtest.test.js` (extend)

- [ ] **Step 1: Add the failing test**

Append:

```javascript
test('playtest: clicking exit while a playtest is active calls returnToEditor', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  app.setEditorState(authoredState(ctx));
  doc.getElementById('btn-editor-playtest')._click();
  assert.strictEqual(app.mode, 'play');
  // The existing Exit Mission button (Plan 1) should now trigger return.
  doc.getElementById('mm-exit')._click();
  assert.strictEqual(app.mode, 'editor');
});

test('playtest: mm-exit label changes when entering play from editor', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  app.setEditorState(authoredState(ctx));
  const exitBefore = doc.getElementById('mm-exit').textContent;
  doc.getElementById('btn-editor-playtest')._click();
  assert.notStrictEqual(doc.getElementById('mm-exit').textContent, exitBefore);
  assert.match(doc.getElementById('mm-exit').textContent, /Back to Editor/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/js/missions/editor-playtest.test.js
```
Expected: FAIL — the existing mm-exit just calls `app.exitMission()`.

- [ ] **Step 3: Hook the playtest module to override exit behaviour**

In `js/mission_editor_playtest.js`, in `playtest()` after `savedApp.enterPlay(...)`:

```javascript
    // Re-label the exit button and intercept its click so it returns to editor.
    if (savedDoc) {
      const exit = savedDoc.getElementById('mm-exit');
      if (exit) {
        exit.textContent = '✕ Back to Editor';
        // Replace the listener: addEventListener will accumulate; we use a
        // one-time wrapper.
        const handler = (ev) => {
          ev._handled = true;
          // Restore default label/handler when we return.
          exit.removeEventListener('click', handler);
          exit.textContent = '✕ Exit Mission';
          returnToEditor();
        };
        exit.addEventListener('click', handler);
      }
    }
```

This works because the test mock's `addEventListener` accumulates listeners and `_click` runs all of them. The wrapper sets `_handled` to prevent the original `app.exitMission()` (registered by Plan 1's `mount`) from also firing on the same click — but that listener will still run unconditionally in the mock. To make the test pass, also patch the playtest's interception to defuse the default handler:

**Refined approach**: instead of trying to suppress the default, accept that `app.exitMission()` runs first (resetting mode to sandbox) and have the wrapper notice this and call `enterEditor` after. Update the wrapper:

```javascript
        const handler = () => {
          // exitMission already fired; defensively transition.
          exit.removeEventListener('click', handler);
          exit.textContent = '✕ Exit Mission';
          // Use setTimeout(0) only in production; tests want immediate.
          if (savedApp.mode === 'sandbox') {
            // exitMission already ran; restore editor.
            savedApp.enterEditor();
            savedApp.setEditorState(savedEditorState);
            savedEditorState = null;
          } else {
            returnToEditor();
          }
        };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/js/missions/editor-playtest.test.js
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add js/mission_editor_playtest.js tests/js/missions/editor-playtest.test.js
git commit -m "feat(editor): Mission Map exit button returns to editor during playtest"
```

---

## Task 26: Phase E Integration Test (First Assessment)

A single integration test that authors a mission entirely through state ops, runs Playtest, ticks the engine, verifies score, then returns to editor with state intact. This is the **first assessment** milestone.

**Files:**
- Create: `tests/js/integration/editor-playtest-roundtrip.test.js`

- [ ] **Step 1: Write the integration test**

Create `tests/js/integration/editor-playtest-roundtrip.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');
const { makeEditorDoc } = require('../mocks/editor-dom');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_persistence',
    'mission_editor_state', 'mission_ui', 'mission_app',
    'mission_editor_app', 'mission_editor_playtest',
  ]).ctx;
}

function stubSim() {
  const contactSubs = new Set();
  let robot = { x: 0, y: 0, heading: 0 };
  return {
    get robot() { return robot; },
    placeRobot(x, y, heading) { robot = { x, y, heading }; },
    getStateSnapshot() { return { robot, obstacles: {}, sensors: {} }; },
    onObstacleContact(cb) { contactSubs.add(cb); return () => contactSubs.delete(cb); },
  };
}

test('Phase E milestone: author → playtest → engine ticks against authored state', () => {
  const ctx = env();
  const doc = makeEditorDoc(['mm-title', 'mm-steps', 'mm-score-current', 'mm-score-max', 'mm-stars', 'mm-exit', 'mm-meta', 'mm-tag']);
  ctx.document = doc;
  const storage = new Map();
  const ls = {
    getItem: k => storage.has(k) ? storage.get(k) : null,
    setItem: (k, v) => { storage.set(k, String(v)); },
    removeItem: k => { storage.delete(k); },
  };
  const sim = stubSim();
  const app = ctx.MISSIONS.app.create();
  ctx.MISSIONS.ui.mount(doc);
  ctx.MISSIONS.editor.app.attach(app, doc);
  ctx.MISSIONS.editor.playtest.attach(app, doc, ls);

  // Author a one-step mission: robot enters a 200×200 zone at (1000, 500).
  app.enterEditor();
  let s = app.editorState;
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 1000, y: 500 });
  const zid = s.field.zones[0].id;
  s = ctx.MISSIONS.editor.state.addStep(s);
  const sid = s.steps[0].id;
  s = ctx.MISSIONS.editor.state.editStep(s, sid, {
    title: 'Reach zone', points: 10,
    condition: { kind: 'zone', subject: 'robot', zone: zid },
  });
  app.setEditorState(s);

  // Playtest.
  doc.getElementById('btn-editor-playtest')._click();
  assert.strictEqual(app.mode, 'play');
  assert.ok(app.mission);
  assert.strictEqual(app.mission.steps.length, 1);

  // Drive the engine like the simulator would: set robot inside the zone, tick.
  // Note: in production the engine lives on the boot path; here we instantiate it directly.
  const engine = new ctx.MISSIONS.engine.ChallengeEngine();
  engine.load(app.mission);
  engine.start(0);
  // Zone is centred-as-author-clicked at (1000, 500), 200×200 → corners (900, 400)-(1100, 600).
  // Robot at zone centre.
  const completed = engine.tick({
    robot: { x: 1000, y: 500, heading: 0 },
    obstacles: {}, sensors: {},
  });
  assert.deepStrictEqual(completed, [sid]);
  assert.strictEqual(engine.progress.score, 10);

  // Return to editor — state intact.
  doc.getElementById('mm-exit')._click();
  assert.strictEqual(app.mode, 'editor');
  assert.strictEqual(app.editorState.steps[0].title, 'Reach zone');
});
```

- [ ] **Step 2: Run the integration test**

```bash
node --test tests/js/integration/editor-playtest-roundtrip.test.js
```
Expected: PASS (1 test).

- [ ] **Step 3: Run the full suite**

```bash
npm test
```
Expected: all suites pass, zero failures.

- [ ] **Step 4: Commit**

```bash
git add tests/js/integration/editor-playtest-roundtrip.test.js
git commit -m "test(editor): Phase E milestone — author → playtest → score → return to editor"
```

---

# Phase E milestone — first assessment

After Task 26, an author can build a mission visually, click Playtest, see it run, and return to editing — entirely without ever touching a file. The state model produces engine-compatible missions; the editor mode and Play mode coexist; selections survive a round-trip.

Pause here for a manual browser smoke test before proceeding to Phase F:
1. `python3 -m http.server 8090`
2. `http://localhost:8090/`
3. Click 🎯 → editor opens
4. Add a zone, add a step, edit its condition (Blockly) to "robot in zone X"
5. Click ▶ Playtest → Mission Map appears
6. Click Run → robot drives (default Python program drives east)
7. Score updates
8. Click ✕ Back to Editor → resumed editing

If any of those break in the browser, fix before Phase F. The integration test catches the logic but not the visual wiring.


---

# Phase F: File I/O

Phase F adds `.llmission` ZIP save/load and screenshot capture. Once shipped, the user's full goal — "build, save, share, load, play" — is achievable end-to-end without backend.

The `.llmission` bundle structure (per spec §4):
```
mission.llmission/
├── mission.json     — required
├── screenshot.png   — optional; auto-captured by editor
├── solution.py      — optional; the editor doesn't generate one in v1
└── README.md        — optional
```

The save/load uses JSZip (already loaded for `.llsp3`). The screenshot is captured from a hidden offscreen canvas to avoid disturbing the live editor canvas.

---

## Task 27: ZIP Write Helper

`MISSIONS.editor.io.writeBundle(mission, opts)` returns a `Uint8Array` of the zipped `.llmission`. `opts` may include `screenshot` (Blob/Uint8Array PNG) and `readme` (string).

**Files:**
- Create: `js/mission_editor_io.js`
- Test: `tests/js/missions/editor-io.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/js/missions/editor-io.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeLlsp3Env } = require('../mocks/llsp3-env');

function env() {
  // The IO module needs JSZip + schema + loader + editor state; reuse the
  // llsp3 env loader (it already loads JSZip).
  const { ctx } = makeLlsp3Env([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_editor_state', 'mission_editor_io',
  ]);
  return ctx;
}

const MIN_MISSION = {
  schema_version: 1, id: 'mio', title: 'IO Test',
  type: 'mission', difficulty_tier: 'beginner',
  field: {
    robot_start: { x: 0, y: 0, heading: 0 },
    zones: [{ id: 'z', shape: 'rect', x: 0, y: 0, w: 100, h: 100, color: 'red' }],
    obstacles: [],
  },
  steps: [{ id: 'a', title: 'a', points: 10,
    condition: { kind: 'zone', subject: 'robot', zone: 'z' } }],
  scoring: { kind: 'step_sum' },
};

test('writeBundle: produces a ZIP containing mission.json', async () => {
  const ctx = env();
  const bytes = await ctx.MISSIONS.editor.io.writeBundle(MIN_MISSION);
  assert.ok(bytes instanceof Uint8Array);
  const zip = await ctx.JSZip.loadAsync(bytes);
  assert.ok(zip.file('mission.json'), 'mission.json must be present');
  const text = await zip.file('mission.json').async('string');
  const parsed = JSON.parse(text);
  assert.strictEqual(parsed.id, 'mio');
});

test('writeBundle: includes screenshot.png when provided', async () => {
  const ctx = env();
  const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);  // PNG magic
  const bytes = await ctx.MISSIONS.editor.io.writeBundle(MIN_MISSION, { screenshot: pngBytes });
  const zip = await ctx.JSZip.loadAsync(bytes);
  assert.ok(zip.file('screenshot.png'), 'screenshot.png must be present');
});

test('writeBundle: includes README.md when provided', async () => {
  const ctx = env();
  const bytes = await ctx.MISSIONS.editor.io.writeBundle(MIN_MISSION, { readme: '# Hello' });
  const zip = await ctx.JSZip.loadAsync(bytes);
  assert.ok(zip.file('README.md'));
  const txt = await zip.file('README.md').async('string');
  assert.strictEqual(txt, '# Hello');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/missions/editor-io.test.js
```
Expected: FAIL — `mission_editor_io.js` not found.

- [ ] **Step 3: Write minimal implementation**

Create `js/mission_editor_io.js`:

```javascript
'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  const editor = (MISSIONS.editor = MISSIONS.editor || {});
  const JSZip = global.JSZip;
  if (!JSZip) throw new Error('mission_editor_io requires JSZip to be loaded first');

  async function writeBundle(mission, opts = {}) {
    const zip = new JSZip();
    zip.file('mission.json', JSON.stringify(mission, null, 2));
    if (opts.screenshot) zip.file('screenshot.png', opts.screenshot);
    if (opts.readme)     zip.file('README.md',     opts.readme);
    return await zip.generateAsync({ type: 'uint8array' });
  }

  async function readBundle(arrayBufferOrUint8) {
    const zip = await JSZip.loadAsync(arrayBufferOrUint8);
    const missionEntry = zip.file('mission.json');
    if (!missionEntry) throw new Error('Not an .llmission: missing mission.json');
    const text = await missionEntry.async('string');
    let raw;
    try { raw = JSON.parse(text); }
    catch (e) { throw new Error(`mission.json is not valid JSON: ${e.message}`); }
    const mission = MISSIONS.loader.load(raw);
    const out = { mission };
    if (zip.file('screenshot.png')) out.screenshot = await zip.file('screenshot.png').async('uint8array');
    if (zip.file('README.md'))      out.readme     = await zip.file('README.md').async('string');
    return out;
  }

  editor.io = { writeBundle, readBundle };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/js/missions/editor-io.test.js
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add js/mission_editor_io.js tests/js/missions/editor-io.test.js
git commit -m "feat(editor): ZIP write/read for .llmission (mission.json + optional screenshot/readme)"
```

---

## Task 28: Save Button → Browser Download

Wire `#btn-editor-save`: validate current state, build the bundle, trigger a browser download via Blob URL.

**Files:**
- Modify: `js/mission_editor_io.js`
- Test: `tests/js/missions/editor-io.test.js` (extend)

- [ ] **Step 1: Add the failing test**

Append:

```javascript
test('attach: clicking the Save button triggers a download with the title as filename', async () => {
  const ctx = env();
  const doc = require('../mocks/editor-dom').makeEditorDoc();
  ctx.document = doc;
  const app = ctx.MISSIONS.app.create();
  // Provide minimal editor state via direct injection.
  app.enterEditor();
  let s = app.editorState;
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 0, y: 0 });
  s.steps.push({ id: 'a', title: 'a', points: 1,
    condition: { kind: 'zone', subject: 'robot', zone: s.field.zones[0].id } });
  s.title = 'My Mission';
  app.setEditorState(s);
  const downloads = [];
  ctx.MISSIONS.editor.io.attach(app, doc, {
    downloadFile: (filename, bytes) => downloads.push({ filename, size: bytes.length }),
  });
  doc.getElementById('btn-editor-save')._click();
  // The save flow is async — yield a microtask for the validate-and-zip path.
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(downloads.length, 1);
  assert.match(downloads[0].filename, /^my-mission(.*)\.llmission$/i);
});
```

This test (and Task 24's playtest tests) need the `mission_app` module loaded too. Adjust the `env()` to include `mission_app`:

```javascript
function env() {
  const { ctx } = makeLlsp3Env([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_editor_state', 'mission_app', 'mission_editor_app',
    'mission_editor_io',
  ]);
  return ctx;
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/missions/editor-io.test.js
```
Expected: FAIL — `editor.io.attach` not defined.

- [ ] **Step 3: Add `attach()` + download wiring**

In `js/mission_editor_io.js`, add:

```javascript
  function slugify(s) {
    return (s || 'mission')
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'mission';
  }

  function attach(app, doc, opts = {}) {
    const downloadFile = opts.downloadFile || _browserDownload;
    const btnSave = doc.getElementById('btn-editor-save');
    if (btnSave) {
      btnSave.addEventListener('click', async () => {
        if (app.mode !== 'editor' || !app.editorState) return;
        const r = MISSIONS.editor.state.validate(app.editorState);
        if (!r.ok) {
          _showError(doc, r.error);
          return;
        }
        const bytes = await writeBundle(r.mission);
        const filename = `${slugify(app.editorState.title)}.llmission`;
        downloadFile(filename, bytes);
      });
    }
  }

  function _showError(doc, msg) {
    const toolbar = doc.getElementById('editor-toolbar');
    if (!toolbar) return;
    let tag = toolbar.querySelector('.editor-error');
    if (!tag) {
      tag = doc.createElement('span');
      tag.classList.add('editor-error');
      toolbar.appendChild(tag);
    }
    tag.textContent = `⚠ ${msg}`;
  }

  function _browserDownload(filename, bytes) {
    if (!global.URL || !global.URL.createObjectURL) return;
    const blob = new global.Blob([bytes], { type: 'application/zip' });
    const url = global.URL.createObjectURL(blob);
    const a = global.document.createElement('a');
    a.href = url;
    a.download = filename;
    global.document.body.appendChild(a);
    a.click();
    global.document.body.removeChild(a);
    setTimeout(() => global.URL.revokeObjectURL(url), 0);
  }
```

Add `attach` to the export.

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/js/missions/editor-io.test.js
```
Expected: PASS (4 tests).

- [ ] **Step 5: Register + wire**

In `index.html`, after `<script src="js/mission_editor_playtest.js"></script>`:

```html
  <script src="js/mission_editor_io.js"></script>
```

In `js/mission_app.js`'s `boot()`, after playtest attach:

```javascript
    if (MISSIONS.editor && MISSIONS.editor.io && MISSIONS.editor.io.attach) {
      MISSIONS.editor.io.attach(app, doc, {});
    }
```

- [ ] **Step 6: Commit**

```bash
git add js/mission_editor_io.js js/mission_app.js index.html tests/js/missions/editor-io.test.js
git commit -m "feat(editor): Save button writes .llmission to browser download"
```

---

## Task 29: Open File → Load Into Editor

Wire `#btn-editor-load` to open a file picker, read the chosen `.llmission`, and replace the editor state with the loaded mission.

**Files:**
- Modify: `js/mission_editor_io.js`
- Modify: `index.html` (add hidden `<input type=file>`)
- Test: `tests/js/missions/editor-io.test.js` (extend)

- [ ] **Step 1: Add the file input to index.html**

In `index.html`, near the existing `file-open-input` (hidden), add a second hidden input:

```html
  <input type="file" id="editor-file-open-input" accept=".llmission" style="display:none">
```

- [ ] **Step 2: Add the failing test**

Append:

```javascript
test('attach: clicking Load opens file picker; selecting a file loads it', async () => {
  const ctx = env();
  const doc = require('../mocks/editor-dom').makeEditorDoc(['editor-file-open-input']);
  ctx.document = doc;
  const app = ctx.MISSIONS.app.create();
  // Build a small valid .llmission bytes via writeBundle.
  const mission = {
    schema_version: 1, id: 'load-test', title: 'Load Test',
    type: 'mission', difficulty_tier: 'beginner',
    field: { robot_start: { x: 0, y: 0, heading: 0 },
             zones: [{ id: 'z', shape: 'rect', x: 0, y: 0, w: 10, h: 10, color: 'red' }],
             obstacles: [] },
    steps: [{ id: 'a', title: 'a', points: 1,
      condition: { kind: 'zone', subject: 'robot', zone: 'z' } }],
    scoring: { kind: 'step_sum' },
  };
  const bytes = await ctx.MISSIONS.editor.io.writeBundle(mission);
  ctx.MISSIONS.editor.io.attach(app, doc, {});
  // Simulate file selection.
  await ctx.MISSIONS.editor.io._test_loadBytes(bytes);
  assert.strictEqual(app.mode, 'editor');
  assert.strictEqual(app.editorState.title, 'Load Test');
});
```

- [ ] **Step 3: Run test to verify it fails**

Expected: FAIL — `_test_loadBytes` not exported.

- [ ] **Step 4: Implement load wiring**

In `js/mission_editor_io.js`, add inside `attach`:

```javascript
    const btnLoad = doc.getElementById('btn-editor-load');
    const fileInput = doc.getElementById('editor-file-open-input');
    if (btnLoad && fileInput) {
      btnLoad.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async (ev) => {
        const file = ev.target && ev.target.files && ev.target.files[0];
        if (!file) return;
        const buf = await file.arrayBuffer();
        await loadBytesIntoEditor(app, new Uint8Array(buf));
        fileInput.value = '';
      });
    }

    async function loadBytesIntoEditor(app, bytes) {
      try {
        const { mission } = await readBundle(bytes);
        app.enterEditor(mission);
      } catch (e) {
        _showError(doc, e.message);
      }
    }

    // Test seam.
    editor.io._test_loadBytes = (bytes) => loadBytesIntoEditor(app, bytes);
```

Update the export to include the seam:

```javascript
  editor.io = { writeBundle, readBundle, attach, _test_loadBytes: null };
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
node --test tests/js/missions/editor-io.test.js
```
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add js/mission_editor_io.js index.html tests/js/missions/editor-io.test.js
git commit -m "feat(editor): Load button opens .llmission and replaces editor state"
```

---

## Task 30: Drag-and-Drop Loading

Drop a `.llmission` file anywhere on the app → load into editor (auto-switching out of sandbox if needed).

**Files:**
- Modify: `js/mission_editor_io.js`
- Test: `tests/js/missions/editor-io.test.js` (extend)

- [ ] **Step 1: Add the failing test**

Append:

```javascript
test('attach: dropping a .llmission file loads it', async () => {
  const ctx = env();
  const doc = require('../mocks/editor-dom').makeEditorDoc(['editor-file-open-input']);
  ctx.document = doc;
  const app = ctx.MISSIONS.app.create();
  const mission = {
    schema_version: 1, id: 'drop', title: 'Dropped', type: 'mission', difficulty_tier: 'beginner',
    field: { robot_start: { x: 0, y: 0, heading: 0 },
             zones: [{ id: 'z', shape: 'rect', x: 0, y: 0, w: 1, h: 1, color: 'red' }],
             obstacles: [] },
    steps: [{ id: 'a', title: 'a', points: 1, condition: { kind: 'zone', subject: 'robot', zone: 'z' } }],
    scoring: { kind: 'step_sum' },
  };
  const bytes = await ctx.MISSIONS.editor.io.writeBundle(mission);
  ctx.MISSIONS.editor.io.attach(app, doc, {});
  // Synthesize a drop event with a file-like object.
  const fakeFile = {
    name: 'drop.llmission',
    arrayBuffer: async () => bytes.buffer,
  };
  doc.body._fire('drop', {
    preventDefault: () => {},
    dataTransfer: { files: [fakeFile] },
  });
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(app.mode, 'editor');
  assert.strictEqual(app.editorState.title, 'Dropped');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/missions/editor-io.test.js
```
Expected: FAIL — no drop handler.

- [ ] **Step 3: Implement drop wiring**

In `js/mission_editor_io.js`, inside `attach`, add:

```javascript
    const body = doc.body;
    if (body) {
      body.addEventListener('dragover', (ev) => {
        if (ev && ev.preventDefault) ev.preventDefault();
        if (ev && ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
      });
      body.addEventListener('drop', async (ev) => {
        if (ev && ev.preventDefault) ev.preventDefault();
        const files = ev && ev.dataTransfer && ev.dataTransfer.files;
        if (!files || !files.length) return;
        const file = files[0];
        if (!/\.llmission$/i.test(file.name || '')) return;
        const buf = await file.arrayBuffer();
        await loadBytesIntoEditor(app, new Uint8Array(buf));
      });
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/js/missions/editor-io.test.js
```
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add js/mission_editor_io.js tests/js/missions/editor-io.test.js
git commit -m "feat(editor): drag-drop .llmission files to load"
```

---

## Task 31: Screenshot Capture on Save

When Save fires, capture the canvas (with the editor's authored field visible) as a PNG and include it in the ZIP.

**Files:**
- Modify: `js/mission_editor_io.js`
- Test: `tests/js/missions/editor-io.test.js` (extend)

- [ ] **Step 1: Add the failing test**

Append:

```javascript
test('attach: Save includes a screenshot.png when captureScreenshot is provided', async () => {
  const ctx = env();
  const doc = require('../mocks/editor-dom').makeEditorDoc(['editor-file-open-input']);
  ctx.document = doc;
  const app = ctx.MISSIONS.app.create();
  app.enterEditor();
  let s = app.editorState;
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 0, y: 0 });
  s.steps.push({ id: 'a', title: 'a', points: 1,
    condition: { kind: 'zone', subject: 'robot', zone: s.field.zones[0].id } });
  app.setEditorState(s);
  const fakePng = new Uint8Array([137, 80, 78, 71]);
  const downloads = [];
  ctx.MISSIONS.editor.io.attach(app, doc, {
    captureScreenshot: async () => fakePng,
    downloadFile: (filename, bytes) => downloads.push({ filename, bytes }),
  });
  doc.getElementById('btn-editor-save')._click();
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(downloads.length, 1);
  const zip = await ctx.JSZip.loadAsync(downloads[0].bytes);
  assert.ok(zip.file('screenshot.png'));
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/missions/editor-io.test.js
```
Expected: FAIL — Save doesn't currently call captureScreenshot.

- [ ] **Step 3: Wire captureScreenshot into save**

In `js/mission_editor_io.js`, modify `attach`:

```javascript
    const captureScreenshot = opts.captureScreenshot || _defaultCaptureScreenshot;
    // ... inside btnSave click handler, after r.ok validation ...
    let screenshot = null;
    try {
      if (captureScreenshot) screenshot = await captureScreenshot();
    } catch (_e) { /* ignore screenshot failures */ }
    const bytes = await writeBundle(r.mission, screenshot ? { screenshot } : {});
```

Add the default capture (browser-only, no-op in tests):

```javascript
  async function _defaultCaptureScreenshot() {
    if (typeof global.document === 'undefined') return null;
    const canvas = global.document.getElementById('robot-canvas');
    if (!canvas || typeof canvas.toBlob !== 'function') return null;
    return await new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) { resolve(null); return; }
        blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
      }, 'image/png');
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/js/missions/editor-io.test.js
```
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add js/mission_editor_io.js tests/js/missions/editor-io.test.js
git commit -m "feat(editor): capture canvas screenshot.png at Save time"
```

---

## Task 32: Phase F Integration Test — Author → Save → Reload → Open → Play

End-to-end roundtrip test: author a mission in the editor, save to bytes, re-import the bytes, verify state matches, and run the resulting mission through the engine.

**Files:**
- Create: `tests/js/integration/editor-save-load-roundtrip.test.js`

- [ ] **Step 1: Write the integration test**

Create `tests/js/integration/editor-save-load-roundtrip.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeLlsp3Env } = require('../mocks/llsp3-env');

function env() {
  const { ctx } = makeLlsp3Env([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_editor_state', 'mission_app',
    'mission_editor_io',
  ]);
  return ctx;
}

test('Phase F milestone: author → save → load → engine produces same score', async () => {
  const ctx = env();

  // Author in-memory.
  let s = ctx.MISSIONS.editor.state.createBlank();
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 500, y: 500 });
  const zid = s.field.zones[0].id;
  s.steps.push({ id: 'reach', title: 'Reach', points: 10,
    condition: { kind: 'zone', subject: 'robot', zone: zid } });
  s.title = 'Roundtrip Mission';
  const r = ctx.MISSIONS.editor.state.validate(s);
  assert.strictEqual(r.ok, true);

  // Save (ZIP bytes).
  const bytes = await ctx.MISSIONS.editor.io.writeBundle(r.mission);
  assert.ok(bytes instanceof Uint8Array);

  // Load back.
  const { mission: loaded } = await ctx.MISSIONS.editor.io.readBundle(bytes);
  assert.strictEqual(loaded.title, 'Roundtrip Mission');
  assert.strictEqual(loaded.steps.length, 1);

  // Run the engine against the loaded mission.
  const engine = new ctx.MISSIONS.engine.ChallengeEngine();
  engine.load(loaded);
  engine.start(0);
  const completed = engine.tick({
    robot: { x: 500, y: 500, heading: 0 },
    obstacles: {}, sensors: {},
  });
  assert.deepStrictEqual(completed, ['reach']);
  assert.strictEqual(engine.progress.score, 10);
});
```

- [ ] **Step 2: Run the integration test**

```bash
node --test tests/js/integration/editor-save-load-roundtrip.test.js
```
Expected: PASS (1 test).

- [ ] **Step 3: Run the full suite**

```bash
npm test
```
Expected: zero regressions across all suites.

- [ ] **Step 4: Commit**

```bash
git add tests/js/integration/editor-save-load-roundtrip.test.js
git commit -m "test(editor): Phase F milestone — author → save → load → engine roundtrip"
```

---

## Task 33: Manual Browser Smoke Test + PR Prep

Verify the full editor flow in a real browser before opening a PR.

**Files:** none (manual verification + PR creation)

- [ ] **Step 1: Run the dev server**

```bash
python3 -m http.server 8090
```

- [ ] **Step 2: Sanity-check sandbox unchanged**

`http://localhost:8090/` — no console errors related to editor; sandbox runs normally.

- [ ] **Step 3: Open the editor and author a mission**

- Click 🎯 in the header → editor toolbar appears, body gains `data-mode="editor"`
- Click "▢ Zone" tool → click somewhere on the field → red zone appears
- Click "▭ Obstacle" → click elsewhere → obstacle appears
- Click "⌖ Robot start" → click bottom-left → robot start handle moves
- Click "+ Add step" in the right panel → step row appears
- Edit the step's title and points
- Click the step row to select it → Blockly condition workspace appears below
- Drag a "robot is in zone (Red ▾)" block onto the workspace
- Verify the step's condition is reflected (use devtools: `window.missionApp.editorState.steps[0].condition`)

- [ ] **Step 4: Playtest**

- Click "▶ Playtest" → Mission Map appears with the authored mission
- Click ▶ Run on the bottom dock → Python program runs
- Drive the robot into the zone (or use the default Python which drives east)
- Verify step ticks green, score updates
- Click "✕ Back to Editor" → editor returns with state intact

- [ ] **Step 5: Save and Load**

- Click "💾 Save" → browser downloads `<title>.llmission`
- Click "📂 Load" → choose the just-downloaded file → editor state reloads
- Or drag-drop the file onto the app body — same effect

- [ ] **Step 6: Full test suite**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 7: Push branch and open PR**

```bash
git push -u origin feat/missions-design
gh pr create --title "feat(missions): Mission Editor (Plan 2)" \
  --body "$(cat <<'EOF'
## Summary

Adds the visual Mission Editor — Plan 2 of the missions roadmap. Authors can:

- Open the editor via the header 🎯 button
- Drag obstacles, zones, and the robot start handle onto the field
- Add steps with title / points / hint / requires
- Build each step's condition visually with a Blockly block palette (zone, sensor, contact, not, all_of, any_of)
- Click **Playtest** to validate and run the authored mission in Play mode
- Save as `.llmission` (ZIP with mission.json + screenshot.png)
- Load via file picker or drag-drop

Built on top of Plan 1's runtime — the editor's serializer produces a Plan 1-compatible mission, so Playtest is just `enterPlay(mission)` and Save/Load is just ZIP plumbing around `MISSIONS.loader.load()`.

## Phase E milestone (first assessment)

The Playtest pathway was the first end-to-end assessment: an integration test (`editor-playtest-roundtrip.test.js`) authors a mission entirely through state ops, calls Playtest, ticks the engine, and confirms the score. The state-model ↔ engine handoff is validated independently of file I/O.

## Test plan

- [x] All Plan 1 tests still pass (741 → unchanged)
- [x] ~60 new editor tests across state, serializer, field, meta, steps, conditions, playtest, io
- [x] Two milestone integration tests (Phase E and Phase F roundtrips)
- [x] Manual browser smoke per Task 33 of `docs/superpowers/plans/2026-05-25-mission-editor.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 8: Done**

Plan 2 is complete. The remaining roadmap work is Plan 3 (browseable Library panel to replace the `#mission=<id>` URL-hash entry).

---

# Self-Review Notes

**Spec coverage check:**

- §3 modes — Sandbox/Play covered in Plan 1; Editor added here (Phase A). ✓
- §4 file format — `.llmission` ZIP with mission.json + screenshot.png + optional README/solution (Phase F). ✓
- §5 scoring — covered by Plan 1's engine; editor produces step_sum or objective_minus_penalties scoring blocks. ✓
- §6 schema — editor state mirrors schema 1:1 (serializer is identity over the schema fields). ✓
- §7 ChallengeEngine — reused unchanged from Plan 1. ✓
- §8.3 Editor mode UI — full interface replacement (Phase A), tool palette (Phase B), step list (Phase C), condition picker (Phase D), Save/Load/Playtest toolbar (Phases E+F). ✓
- §8.4 Playtest flow — Phase E. ✓
- §9 Blockly reuse for the condition picker — Phase D. ✓
- §10 screenshot capture — Phase F Task 31. ✓
- §11 distribution — covered: bundled (Plan 1 ✓), `.llmission` files (Phase F), drag-drop & file picker (Phase F). My Missions list and Imported rail belong to Plan 3 (Library panel).
- §12 advancement — star rating handled by Plan 1's engine; editor doesn't render stars (Library does). ✓
- §13 difficulty — `difficulty_tier` form field (Phase C Task 12). ✓
- §14 out-of-scope — respected.
- §15 build order — this plan covers spec build steps 3, 4, 5, 6 (Editor + condition picker + screenshot), and part of step 7 (Playtest flow). The Library panel (step 2) remains for Plan 3.

**Type / name consistency check:**

- `MISSIONS.editor.state`, `.app`, `.field`, `.meta`, `.steps`, `.conditions`, `.playtest`, `.io` — consistent namespace.
- `app.editorState`, `app.setEditorState()`, `app.enterEditor()`, `app.exitEditor()` — consistent app surface.
- `state.field.{zones,obstacles,robot_start}` — same shape as Plan 1's mission schema.
- `state.selection = { kind: 'obstacle'|'zone'|'start'|'step', id }` — consistent across field and step paths.
- Condition picker block types `cond_zone, cond_sensor, cond_contact, cond_not, cond_all_of, cond_any_of` — used in defs (Task 18), generator (Task 19), and loader (Task 20).
- `MISSIONS.editor.io.writeBundle(mission, opts)` / `readBundle(bytes)` / `attach(app, doc, opts)` — consistent across Phase F tasks.

**Placeholder scan:** none of the disallowed patterns (`TBD`, `TODO`, `implement later`, "similar to Task N", "appropriate error handling") appear in the task bodies. Each step contains either exact code or an exact command with expected output.
