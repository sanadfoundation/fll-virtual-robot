# Help Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "?" button to the header that opens a full-screen dim overlay with callout bubbles pointing at every major part of the UI (canvas, robot, obstacles, walls, ports, sensors, console, run/stop/reset, speed, mode toggle, toolbox/editor) — all visible at once for a 10-second glance map. (GitHub issue #46.)

**Architecture:** A single new vanilla-JS file `js/help_overlay.js` exposing `window.helpOverlay` with pure helpers (`fieldToScreen`, `resolveDomLabels`, `resolveFieldLabels`) and an imperative `openHelpOverlay()` that builds an absolutely-positioned overlay DOM tree on demand. Bubbles anchor to DOM elements via `getBoundingClientRect()` and to canvas-internal targets (robot, obstacles, walls) via the simulator's math-y-up → screen-px conversion. Mode awareness reads `window.getActiveMode()` exported from `js/main.js`. Dismiss on Esc or overlay click; recompute positions on window resize while open. No first-run auto-launch, no persistence, no third-party library.

**Tech Stack:** Vanilla ES2017+ JS, plain CSS. Tests use Node's built-in `node --test` runner with the `vm`-sandbox / stub-DOM pattern in `tests/js/mocks/main-env.js`.

---

## File Structure

**Create:**

- `js/help_overlay.js` — module that exposes `window.helpOverlay = { fieldToScreen, resolveDomLabels, resolveFieldLabels, anchorFor, openHelpOverlay, initHelpOverlay, _DOM_LABELS }` and auto-wires the `#btn-help` click on DOM ready.
- `tests/js/help_overlay/field-to-screen.test.js` — unit tests for the field-to-screen coordinate helper.
- `tests/js/help_overlay/dom-labels.test.js` — unit tests for `resolveDomLabels(mode, doc)`.
- `tests/js/help_overlay/field-labels.test.js` — unit tests for `resolveFieldLabels(sim, canvasRect)`.

**Modify:**

- `index.html` — add `<button id="btn-help">?</button>` inside `.header-controls`; add `<script src="js/help_overlay.js"></script>` after `js/main.js`.
- `css/style.css` — append a `Help overlay` section (header button + dim backdrop + bubble base + four side variants + arrows).

**Do not modify:**

- `js/main.js` — wire-up lives entirely inside `js/help_overlay.js`'s `initHelpOverlay()` to keep main.js stable.
- `js/simulator.js` — read-only access via `window.sim` (`sim.robot.x`, `sim.robot.y`, `sim._scale`, `sim._obstacles`, `sim.physics.readPose()`).

---

## Task 1: Module scaffold + `fieldToScreen` helper (TDD)

**Files:**

- Create: `js/help_overlay.js`
- Create: `tests/js/help_overlay/field-to-screen.test.js`

`fieldToScreen` is the math-y-up → screen-px conversion used for canvas-internal label anchoring. It mirrors the existing convention in `js/simulator.js`: math origin is bottom-left, canvas origin is top-left, so canvas-y = `(FIELD_H_MM - mathY) * scale`. We add the canvas's `getBoundingClientRect()` origin to get viewport-space pixels.

- [ ] **Step 1: Write the failing test**

Create `tests/js/help_overlay/field-to-screen.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

function loadHelpOverlay() {
  const ctx = { window: {}, document: undefined };
  vm.createContext(ctx);
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'js', 'help_overlay.js'),
    'utf8',
  );
  vm.runInContext(src, ctx);
  return ctx.window.helpOverlay;
}

test('fieldToScreen: math (0, 0) maps to the canvas bottom-left in screen px', () => {
  const { fieldToScreen } = loadHelpOverlay();
  const rect = { left: 10, top: 20, width: 800, height: 400 };
  // scale=1, fieldH=400  →  screen y = 20 + (400 - 0) = 420  (bottom)
  const p = fieldToScreen(0, 0, rect, 1, 400);
  assert.equal(p.x, 10);
  assert.equal(p.y, 420);
});

test('fieldToScreen: math (W, H) maps to the canvas top-right in screen px', () => {
  const { fieldToScreen } = loadHelpOverlay();
  const rect = { left: 10, top: 20, width: 800, height: 400 };
  // scale=1, fieldH=400  →  (800, 400) math = (810, 20) screen  (top-right)
  const p = fieldToScreen(800, 400, rect, 1, 400);
  assert.equal(p.x, 810);
  assert.equal(p.y, 20);
});

test('fieldToScreen: respects mm→px scale', () => {
  const { fieldToScreen } = loadHelpOverlay();
  const rect = { left: 0, top: 0, width: 1000, height: 500 };
  // mathX=100 mm with scale=2 px/mm  →  screen x = 0 + 200 = 200
  const p = fieldToScreen(100, 0, rect, 2, 250);
  assert.equal(p.x, 200);
  // mathY=0 mm  →  screen y = 0 + (250 - 0) * 2 = 500  (bottom)
  assert.equal(p.y, 500);
});

test('fieldToScreen: defaults fieldH to 1143 when omitted', () => {
  const { fieldToScreen } = loadHelpOverlay();
  const rect = { left: 0, top: 0, width: 1000, height: 500 };
  // mathY=0 with default fieldH=1143 and scale=1  →  y = 1143
  const p = fieldToScreen(0, 0, rect, 1);
  assert.equal(p.y, 1143);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/help_overlay/field-to-screen.test.js
```

Expected: FAIL — `Cannot read properties of undefined (reading 'fieldToScreen')` or similar (file does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `js/help_overlay.js`:

```js
'use strict';

(function () {
  // Field dimensions kept in sync with js/simulator.js. The two simulator
  // constants are not exported; duplicating them here is intentional — this
  // file must work even if simulator.js hasn't loaded (e.g., in tests).
  const FIELD_W_MM = 2362;
  const FIELD_H_MM = 1143;

  // Math y-up (mm) → screen px. canvasRect comes from
  // canvas.getBoundingClientRect(); scale is sim._scale (mm→px). Mirrors the
  // canvas-y = (FIELD_H_MM - mathY) * scale convention used throughout
  // js/simulator.js's _draw* family.
  function fieldToScreen(mathX, mathY, canvasRect, scale, fieldHmm) {
    const H = (fieldHmm == null) ? FIELD_H_MM : fieldHmm;
    return {
      x: canvasRect.left + mathX * scale,
      y: canvasRect.top + (H - mathY) * scale,
    };
  }

  const api = { fieldToScreen, FIELD_W_MM, FIELD_H_MM };

  if (typeof window !== 'undefined') {
    window.helpOverlay = api;
  }
})();
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/js/help_overlay/field-to-screen.test.js
```

Expected: PASS — all four tests pass.

- [ ] **Step 5: Commit**

```bash
git add js/help_overlay.js tests/js/help_overlay/field-to-screen.test.js
git commit -m "feat(help): scaffold help_overlay.js with fieldToScreen helper"
```

---

## Task 2: `resolveDomLabels(mode, doc)` — DOM-anchored label specs (TDD)

**Files:**

- Modify: `js/help_overlay.js` (add `DOM_LABELS` table + `resolveDomLabels`)
- Create: `tests/js/help_overlay/dom-labels.test.js`

`resolveDomLabels` filters the label table to entries whose mode matches (or is universal) and whose target selector resolves to a DOM element. The output is a list of `{ el, text, side }` records the renderer iterates over. Entries whose selector misses (e.g., `.blocklyToolboxDiv` before Blockly has bootstrapped) are silently skipped — the overlay still opens with the remaining bubbles.

- [ ] **Step 1: Write the failing test**

Create `tests/js/help_overlay/dom-labels.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

function loadHelpOverlay() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'js', 'help_overlay.js'),
    'utf8',
  );
  vm.runInContext(src, ctx);
  return ctx.window.helpOverlay;
}

// Returns a stub `document` whose querySelector returns a fake element only
// for selectors in `present`. Each fake element has a marker .__selector so
// the assertions can verify the right targets came back.
function stubDoc(present) {
  return {
    querySelector(sel) {
      if (present.includes(sel)) {
        return { __selector: sel, getBoundingClientRect: () => ({}) };
      }
      return null;
    },
  };
}

test('resolveDomLabels(blocks): includes Blockly-only labels, omits Python editor', () => {
  const { resolveDomLabels, _DOM_LABELS } = loadHelpOverlay();
  // Every selector resolves so we can see which ones the mode filter keeps.
  const allSelectors = _DOM_LABELS.map(l => l.selector);
  const doc = stubDoc(allSelectors);
  const out = resolveDomLabels('blocks', doc);
  const sels = out.map(o => o.el.__selector);
  assert.ok(sels.includes('.blocklyToolboxDiv'));
  assert.ok(sels.includes('#blockly-div'));
  assert.ok(!sels.includes('#py-editor'));
});

test('resolveDomLabels(python): includes Python editor, omits Blockly-only labels', () => {
  const { resolveDomLabels, _DOM_LABELS } = loadHelpOverlay();
  const doc = stubDoc(_DOM_LABELS.map(l => l.selector));
  const out = resolveDomLabels('python', doc);
  const sels = out.map(o => o.el.__selector);
  assert.ok(sels.includes('#py-editor'));
  assert.ok(!sels.includes('.blocklyToolboxDiv'));
  assert.ok(!sels.includes('#blockly-div'));
});

test('resolveDomLabels: always-on labels appear in both modes', () => {
  const { resolveDomLabels, _DOM_LABELS } = loadHelpOverlay();
  const doc = stubDoc(_DOM_LABELS.map(l => l.selector));
  const blocks = resolveDomLabels('blocks', doc).map(o => o.el.__selector);
  const python = resolveDomLabels('python', doc).map(o => o.el.__selector);
  for (const must of [
    '#robot-canvas', '#cstat-motors', '#cstat-sensors',
    '.dock-speed', '#console-output',
    '#btn-run', '#btn-stop', '#btn-reset', '.tab-group',
  ]) {
    assert.ok(blocks.includes(must), `blocks mode missing ${must}`);
    assert.ok(python.includes(must), `python mode missing ${must}`);
  }
});

test('resolveDomLabels: silently skips selectors that miss', () => {
  const { resolveDomLabels } = loadHelpOverlay();
  // Only the canvas resolves; everything else returns null.
  const doc = stubDoc(['#robot-canvas']);
  const out = resolveDomLabels('blocks', doc);
  assert.equal(out.length, 1);
  assert.equal(out[0].el.__selector, '#robot-canvas');
});

test('resolveDomLabels: every label has non-empty kid-friendly text', () => {
  const { _DOM_LABELS } = loadHelpOverlay();
  for (const l of _DOM_LABELS) {
    assert.ok(typeof l.text === 'string' && l.text.length > 0, `empty text on ${l.selector}`);
    assert.ok(['top','bottom','left','right'].includes(l.side), `bad side on ${l.selector}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/help_overlay/dom-labels.test.js
```

Expected: FAIL — `resolveDomLabels is not a function` and `_DOM_LABELS is undefined`.

- [ ] **Step 3: Write the implementation**

Edit `js/help_overlay.js`. Locate the `const api = { fieldToScreen, FIELD_W_MM, FIELD_H_MM };` line. Replace the block from `// Math y-up (mm) → screen px.` through `window.helpOverlay = api;` with:

```js
  // Math y-up (mm) → screen px. canvasRect comes from
  // canvas.getBoundingClientRect(); scale is sim._scale (mm→px). Mirrors the
  // canvas-y = (FIELD_H_MM - mathY) * scale convention used throughout
  // js/simulator.js's _draw* family.
  function fieldToScreen(mathX, mathY, canvasRect, scale, fieldHmm) {
    const H = (fieldHmm == null) ? FIELD_H_MM : fieldHmm;
    return {
      x: canvasRect.left + mathX * scale,
      y: canvasRect.top + (H - mathY) * scale,
    };
  }

  // Each label has a CSS `selector`, kid-friendly `text`, preferred bubble
  // `side`, and optional `mode` ('blocks' | 'python'). Universal entries omit
  // `mode`. The renderer skips entries whose selector misses (e.g.,
  // .blocklyToolboxDiv before Blockly bootstraps).
  const DOM_LABELS = [
    { selector: '#robot-canvas',      side: 'top',    text: 'The field your robot drives on.' },
    { selector: '#cstat-motors',      side: 'bottom', text: 'Motor ports — your wheels plug in here.' },
    { selector: '#cstat-sensors',     side: 'bottom', text: 'Sensor ports — color, distance, and force plug in here.' },
    { selector: '.dock-speed',        side: 'top',    text: 'How fast the robot moves. Slow it down to watch what happens.' },
    { selector: '#console-output',    side: 'top',    text: 'Messages your program prints show up here.' },
    { selector: '#btn-run',           side: 'top',    text: 'Start your program.' },
    { selector: '#btn-stop',          side: 'top',    text: 'Stop your program right now.' },
    { selector: '#btn-reset',         side: 'top',    text: 'Send the robot back to where it started.' },
    { selector: '.tab-group',         side: 'bottom', text: 'Switch between blocks and Python code.' },
    { selector: '.blocklyToolboxDiv', side: 'right',  text: 'Drag blocks from here.',                       mode: 'blocks' },
    { selector: '#blockly-div',       side: 'left',   text: 'Snap blocks together to build your program.', mode: 'blocks' },
    { selector: '#py-editor',         side: 'right',  text: 'Type Python code here.',                      mode: 'python' },
  ];

  function resolveDomLabels(mode, doc) {
    const out = [];
    for (const lbl of DOM_LABELS) {
      if (lbl.mode && lbl.mode !== mode) continue;
      const el = doc.querySelector(lbl.selector);
      if (!el) continue;
      out.push({ el, text: lbl.text, side: lbl.side });
    }
    return out;
  }

  const api = {
    fieldToScreen,
    resolveDomLabels,
    FIELD_W_MM,
    FIELD_H_MM,
    _DOM_LABELS: DOM_LABELS,
  };

  if (typeof window !== 'undefined') {
    window.helpOverlay = api;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/js/help_overlay/
```

Expected: PASS — all tests from Tasks 1 and 2 pass.

- [ ] **Step 5: Commit**

```bash
git add js/help_overlay.js tests/js/help_overlay/dom-labels.test.js
git commit -m "feat(help): add DOM-anchored label specs with mode-aware filtering"
```

---

## Task 3: `resolveFieldLabels(sim, canvasRect)` — canvas-internal label specs (TDD)

**Files:**

- Modify: `js/help_overlay.js` (add `resolveFieldLabels`)
- Create: `tests/js/help_overlay/field-labels.test.js`

The robot, the first obstacle, and the field walls are all *drawn on the canvas* — they don't have DOM elements. We resolve their positions from simulator state (`sim.robot.x/y`, `sim._obstacles[].body` via `sim.physics.readPose`) and the canvas's `getBoundingClientRect()` rect, both translated through `fieldToScreen`. The walls bubble anchors to a fixed canvas corner since the walls are the edges themselves.

- [ ] **Step 1: Write the failing test**

Create `tests/js/help_overlay/field-labels.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

function loadHelpOverlay() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'js', 'help_overlay.js'),
    'utf8',
  );
  vm.runInContext(src, ctx);
  return ctx.window.helpOverlay;
}

function fakeSim(opts) {
  return {
    robot:   opts.robot   || { x: 350, y: 163, heading: 90 },
    _scale:  opts.scale   || 1,
    _obstacles: opts.obstacles || [],
    physics: opts.physics || { readPose: (body) => body.pose },
  };
}

test('resolveFieldLabels: returns robot, walls, and (if present) obstacle bubbles', () => {
  const { resolveFieldLabels } = loadHelpOverlay();
  const sim = fakeSim({
    obstacles: [{ body: { pose: { x: 1000, y: 500, angle: 0 } } }],
  });
  const rect = { left: 0, top: 0, width: 2362, height: 1143 };
  const out = resolveFieldLabels(sim, rect);
  const tags = out.map(o => o.tag);
  assert.deepEqual(tags.sort(), ['obstacles', 'robot', 'walls'].sort());
});

test('resolveFieldLabels: skips obstacles when sim has none', () => {
  const { resolveFieldLabels } = loadHelpOverlay();
  const sim = fakeSim({ obstacles: [] });
  const rect = { left: 0, top: 0, width: 2362, height: 1143 };
  const out = resolveFieldLabels(sim, rect);
  const tags = out.map(o => o.tag);
  assert.ok(tags.includes('robot'));
  assert.ok(tags.includes('walls'));
  assert.ok(!tags.includes('obstacles'));
});

test('resolveFieldLabels: robot bubble points at math-y-up robot position in screen px', () => {
  const { resolveFieldLabels } = loadHelpOverlay();
  // spawn: x=350, y=163, fieldH=1143, scale=1, rect at origin
  //   → screen x = 0 + 350 = 350
  //   → screen y = 0 + (1143 - 163) = 980
  const sim = fakeSim({ robot: { x: 350, y: 163, heading: 90 } });
  const rect = { left: 0, top: 0, width: 2362, height: 1143 };
  const out = resolveFieldLabels(sim, rect);
  const robot = out.find(o => o.tag === 'robot');
  assert.equal(robot.x, 350);
  assert.equal(robot.y, 980);
});

test('resolveFieldLabels: returns empty when sim or canvasRect missing', () => {
  const { resolveFieldLabels } = loadHelpOverlay();
  assert.deepEqual(resolveFieldLabels(null, { left: 0, top: 0 }), []);
  assert.deepEqual(resolveFieldLabels({}, null), []);
});

test('resolveFieldLabels: every entry has x, y, text, side, and tag', () => {
  const { resolveFieldLabels } = loadHelpOverlay();
  const sim = fakeSim({
    obstacles: [{ body: { pose: { x: 1000, y: 500, angle: 0 } } }],
  });
  const rect = { left: 5, top: 7, width: 2362, height: 1143 };
  for (const lbl of resolveFieldLabels(sim, rect)) {
    assert.equal(typeof lbl.x, 'number');
    assert.equal(typeof lbl.y, 'number');
    assert.ok(lbl.text && lbl.text.length > 0);
    assert.ok(['top','bottom','left','right'].includes(lbl.side));
    assert.ok(typeof lbl.tag === 'string' && lbl.tag.length > 0);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/help_overlay/field-labels.test.js
```

Expected: FAIL — `resolveFieldLabels is not a function`.

- [ ] **Step 3: Write the implementation**

Edit `js/help_overlay.js`. Find the line `const api = {`. Insert this function immediately above it:

```js
  // Canvas-internal labels (robot, obstacles, walls) — these targets are
  // drawn on the canvas and have no DOM element, so we resolve their screen
  // positions from simulator state through fieldToScreen. Returns an array
  // of { x, y, text, side, tag } where (x, y) is a viewport-px anchor.
  function resolveFieldLabels(sim, canvasRect) {
    if (!sim || !canvasRect) return [];
    const scale = sim._scale || 1;
    const out = [];

    if (sim.robot && typeof sim.robot.x === 'number') {
      const p = fieldToScreen(sim.robot.x, sim.robot.y, canvasRect, scale);
      out.push({
        x: p.x, y: p.y, tag: 'robot', side: 'right',
        text: 'Your robot. Code controls this.',
      });
    }

    const obs = sim._obstacles || [];
    if (obs.length && sim.physics && typeof sim.physics.readPose === 'function') {
      const pose = sim.physics.readPose(obs[0].body);
      if (pose && typeof pose.x === 'number') {
        const p = fieldToScreen(pose.x, pose.y, canvasRect, scale);
        out.push({
          x: p.x, y: p.y, tag: 'obstacles', side: 'top',
          text: 'Obstacles — the robot can bump into these.',
        });
      }
    }

    // Walls are the field edges themselves; anchor the bubble near the
    // top-left interior corner of the canvas so its arrow points at the
    // border. Inset 16px so the bubble sits visibly inside the field.
    out.push({
      x: canvasRect.left + 16,
      y: canvasRect.top + 16,
      tag: 'walls',
      side: 'bottom',
      text: "The walls — the robot can't drive past the edges.",
    });

    return out;
  }

```

Then add `resolveFieldLabels` to the `api` object:

```js
  const api = {
    fieldToScreen,
    resolveDomLabels,
    resolveFieldLabels,
    FIELD_W_MM,
    FIELD_H_MM,
    _DOM_LABELS: DOM_LABELS,
  };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/js/help_overlay/
```

Expected: PASS — all tests from Tasks 1–3 pass.

- [ ] **Step 5: Commit**

```bash
git add js/help_overlay.js tests/js/help_overlay/field-labels.test.js
git commit -m "feat(help): resolve canvas-internal labels (robot, obstacles, walls)"
```

---

## Task 4: `openHelpOverlay()` — overlay rendering + dismissal + resize

**Files:**

- Modify: `js/help_overlay.js` (add `anchorFor`, `makeBubble`, `openHelpOverlay`, `initHelpOverlay`)

This task is DOM-heavy and brittle to unit-test in the existing Node mock harness, so we deliberately skip unit tests for the rendering layer and validate visually in Task 6's smoke test. The implementation is small enough to read end-to-end.

`anchorFor(rect, side)` picks a viewport-px point on the edge of `rect` matching `side`. `makeBubble` builds one positioned `<div class="help-bubble help-bubble-{side}">`. `openHelpOverlay` builds the root, wires Esc and dim-click dismissal, and re-renders on `resize`. `initHelpOverlay` is the DOM-ready boot hook the script auto-runs.

- [ ] **Step 1: Add the rendering and lifecycle code**

Edit `js/help_overlay.js`. Find the line `const api = {`. Insert these functions immediately above it (after `resolveFieldLabels`):

```js
  // Pick a viewport-px point on the named edge of `rect` for a bubble pointer.
  function anchorFor(rect, side) {
    switch (side) {
      case 'top':    return { x: rect.left + rect.width / 2, y: rect.top };
      case 'bottom': return { x: rect.left + rect.width / 2, y: rect.bottom };
      case 'left':   return { x: rect.left,                  y: rect.top + rect.height / 2 };
      case 'right':  return { x: rect.right,                 y: rect.top + rect.height / 2 };
      default:       return { x: rect.left + rect.width / 2, y: rect.top };
    }
  }

  function makeBubble(doc, text, point, side) {
    const b = doc.createElement('div');
    b.className = 'help-bubble help-bubble-' + (side || 'top');
    b.style.left = point.x + 'px';
    b.style.top = point.y + 'px';
    b.textContent = text;
    return b;
  }

  // Open the overlay. Returns a `close()` function. Idempotent — calling
  // twice in a row no-ops the second call. `opts` allows test injection of
  // document/window/sim/mode; in production all four come from the globals.
  function openHelpOverlay(opts) {
    opts = opts || {};
    const doc = opts.document || (typeof document !== 'undefined' ? document : null);
    const win = opts.window || (typeof window !== 'undefined' ? window : null);
    if (!doc || !win) return function noop() {};
    if (doc.getElementById('help-overlay-root')) return function noop() {};

    const sim = opts.sim || win.sim || null;
    const mode = opts.mode
      || (typeof win.getActiveMode === 'function' ? win.getActiveMode() : null)
      || 'blocks';

    const root = doc.createElement('div');
    root.id = 'help-overlay-root';
    root.className = 'help-overlay-root';

    const dim = doc.createElement('div');
    dim.className = 'help-overlay-dim';
    root.appendChild(dim);

    const bubbles = doc.createElement('div');
    bubbles.className = 'help-overlay-bubbles';
    root.appendChild(bubbles);

    doc.body.appendChild(root);

    function render() {
      bubbles.innerHTML = '';
      const canvas = doc.getElementById('robot-canvas');
      const canvasRect = canvas && canvas.getBoundingClientRect
        ? canvas.getBoundingClientRect()
        : null;

      const domLabels = resolveDomLabels(mode, doc);
      for (const lbl of domLabels) {
        if (!lbl.el.getBoundingClientRect) continue;
        const rect = lbl.el.getBoundingClientRect();
        bubbles.appendChild(makeBubble(doc, lbl.text, anchorFor(rect, lbl.side), lbl.side));
      }

      const fieldLabels = resolveFieldLabels(sim, canvasRect);
      for (const lbl of fieldLabels) {
        bubbles.appendChild(makeBubble(doc, lbl.text, { x: lbl.x, y: lbl.y }, lbl.side));
      }
    }

    function onResize() { render(); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    function close() {
      if (root.parentNode) root.parentNode.removeChild(root);
      win.removeEventListener('resize', onResize);
      doc.removeEventListener('keydown', onKey);
    }

    dim.addEventListener('click', close);
    win.addEventListener('resize', onResize);
    doc.addEventListener('keydown', onKey);

    render();
    return close;
  }

  function initHelpOverlay() {
    if (typeof document === 'undefined') return;
    const btn = document.getElementById('btn-help');
    if (!btn) return;
    btn.addEventListener('click', function () {
      openHelpOverlay({
        window: (typeof window !== 'undefined') ? window : null,
        document: document,
        sim: (typeof window !== 'undefined') ? window.sim : null,
      });
    });
  }

```

Then update the `api` object to expose them:

```js
  const api = {
    fieldToScreen,
    resolveDomLabels,
    resolveFieldLabels,
    anchorFor,
    openHelpOverlay,
    initHelpOverlay,
    FIELD_W_MM,
    FIELD_H_MM,
    _DOM_LABELS: DOM_LABELS,
  };
```

And add the auto-init at the very bottom of the IIFE, immediately after `window.helpOverlay = api;`:

```js
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading'
          && typeof document.addEventListener === 'function') {
        document.addEventListener('DOMContentLoaded', initHelpOverlay);
      } else {
        initHelpOverlay();
      }
    }
```

- [ ] **Step 2: Verify nothing regressed in the existing test suite**

```bash
node --test tests/js/help_overlay/
```

Expected: PASS — all Task 1–3 tests still pass (we added code but didn't change any tested function).

- [ ] **Step 3: Commit**

```bash
git add js/help_overlay.js
git commit -m "feat(help): build overlay DOM, Esc/click dismissal, resize handler"
```

---

## Task 5: HTML button + CSS

**Files:**

- Modify: `index.html` (header button + script tag)
- Modify: `css/style.css` (append help-overlay block)

The button mirrors the existing icon buttons in the header (`.btn-settings`, `.btn-github`). The CSS block is appended at the end of `style.css` so it sits next to the file's other late additions; the project follows a "feature blocks at the bottom" pattern visible in recent commits (`canvas-status` bands, `console-wrap` collapse).

- [ ] **Step 1: Add the help button to the header**

Edit `index.html`. Find this line (around line 89):

```html
    <a class="btn btn-github" id="btn-github" href="https://github.com/sanadfoundation/fll-virtual-robot" target="_blank" rel="noopener noreferrer" title="View source on GitHub">
```

Insert this button immediately *before* it (i.e., before the GitHub link, after the closing `</div>` of `#settings-menu`):

```html
    <button class="btn btn-help" id="btn-help" type="button" title="What's this? — show a labeled tour of the screen" aria-label="Show help overlay">
      <span class="btn-help-glyph" aria-hidden="true">?</span>
    </button>
```

- [ ] **Step 2: Add the help_overlay.js script tag**

In the same file, find this line (around line 279):

```html
<script src="js/main.js"></script>
```

Insert this line immediately *after* it (before `version_check.js`):

```html
<script src="js/help_overlay.js"></script>
```

- [ ] **Step 3: Append the CSS block**

Read the last 5 lines of `css/style.css` to confirm where the file ends, then append this block (no replacement — pure append at end-of-file):

```css

/* ── Help overlay ─────────────────────────────────────────────────────────
   "?" button in the header opens a dim full-screen overlay with callout
   bubbles labeling each major UI region. Lives in js/help_overlay.js.
*/

.btn-help {
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 16px;
  line-height: 1;
}
.btn-help-glyph { line-height: 1; }

.help-overlay-root {
  position: fixed;
  inset: 0;
  z-index: 10000;
}
.help-overlay-dim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  cursor: pointer;
  animation: help-overlay-fade-in 160ms ease-out;
}
.help-overlay-bubbles {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.help-bubble {
  position: absolute;
  max-width: 220px;
  padding: 10px 14px;
  background: #ffffff;
  color: #111111;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.4;
  font-weight: 500;
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.45);
  pointer-events: auto;
  animation: help-overlay-fade-in 220ms ease-out;
}

/* Each side variant offsets the bubble away from the anchor point and draws
   a small arrow pointing back at it. Anchor point is (left, top) of the bubble
   element BEFORE transform; transforms below move the bubble to its final
   resting position relative to the anchor. */

.help-bubble-top {
  transform: translate(-50%, -100%) translateY(-12px);
}
.help-bubble-top::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -6px;
  width: 12px; height: 12px;
  background: #ffffff;
  transform: translateX(-50%) rotate(45deg);
}

.help-bubble-bottom {
  transform: translate(-50%, 0) translateY(12px);
}
.help-bubble-bottom::after {
  content: "";
  position: absolute;
  left: 50%;
  top: -6px;
  width: 12px; height: 12px;
  background: #ffffff;
  transform: translateX(-50%) rotate(45deg);
}

.help-bubble-left {
  transform: translate(-100%, -50%) translateX(-12px);
}
.help-bubble-left::after {
  content: "";
  position: absolute;
  top: 50%;
  right: -6px;
  width: 12px; height: 12px;
  background: #ffffff;
  transform: translateY(-50%) rotate(45deg);
}

.help-bubble-right {
  transform: translate(0, -50%) translateX(12px);
}
.help-bubble-right::after {
  content: "";
  position: absolute;
  top: 50%;
  left: -6px;
  width: 12px; height: 12px;
  background: #ffffff;
  transform: translateY(-50%) rotate(45deg);
}

@keyframes help-overlay-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

- [ ] **Step 4: Commit**

```bash
git add index.html css/style.css
git commit -m "feat(help): add ? button to header and overlay styles"
```

---

## Task 6: Browser smoke test

**Files:**

- No code changes — manual verification only.

The unit tests cover the pure logic (coordinate math, label resolution, mode filtering). Rendering, layout, and z-index behavior need eyes on glass.

- [ ] **Step 1: Start the dev server**

```bash
python3 -m http.server 8787
```

Expected: server starts and serves `http://localhost:8787`. Leave it running.

- [ ] **Step 2: Verify Blockly-mode bubbles**

Open `http://localhost:8787` in a browser. The app loads in Blockly mode by default.

Click the **`?`** button in the header. Verify *all* of the following render as bubbles with arrows pointing at the right target:

- The canvas (top edge of `#robot-canvas`)
- The motor-ports band (bottom of `#cstat-motors`)
- The sensor-ports band (bottom of `#cstat-sensors`)
- The speed slider (top of `.dock-speed`)
- The console output (top of `#console-output`)
- Run / Stop / Start over (top of each)
- The Blocks/Python tabs (bottom of `.tab-group`)
- The Blockly toolbox (right of `.blocklyToolboxDiv`)
- The Blockly workspace (left of `#blockly-div`)
- The robot (right of robot's on-canvas position)
- The first obstacle on the field (top of)
- The walls (bottom-right of top-left canvas corner)

Then verify dismissal:

- Press **Esc** → overlay disappears.
- Click the `?` again → overlay reopens.
- Click the **dim background** (not a bubble) → overlay disappears.

- [ ] **Step 3: Verify Python-mode bubbles**

In the header, click **🐍 Python** to switch modes. Click the `?` button.

Verify:

- The **Python editor** bubble appears, pointing at `#py-editor`.
- The **Blockly toolbox** and **workspace** bubbles do NOT appear.
- All universal bubbles (canvas, ports, run, etc.) still appear.

Dismiss with Esc.

- [ ] **Step 4: Verify resize handling**

In Blockly mode, click `?` to open the overlay. While it's open, drag the browser window edge to a different width. Verify that bubble positions **track their targets** — they do not stay frozen at their initial pixel positions.

Also drag the editor-panel resize handle (the vertical bar between Blockly and the canvas) and verify canvas-internal bubbles (robot, obstacles, walls) reposition to follow the canvas's new size.

> Known limitation in v1: the resize handler listens to `window.resize` only. The editor-panel resize handle doesn't fire window resize; if the canvas-internal bubbles don't move during inner-panel drag, this is acceptable for v1 and a known follow-up — note in the PR description.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

```bash
npm run test:js
```

Expected: PASS. All existing tests, plus the new help-overlay tests, pass.

- [ ] **Step 6: Final commit (only if Steps 2–5 surfaced fixes)**

If the smoke test surfaced any visual issues (e.g., bubble cut off at the screen edge, arrow not aligned), fix them in `css/style.css` or `js/help_overlay.js`, re-run the smoke test, and commit:

```bash
git add -p
git commit -m "fix(help): <describe the visual fix>"
```

If no fixes were needed, no commit needed.

---

## Spec coverage check (against issue #46)

| Acceptance criterion | Task |
|---|---|
| Header has a visible "?" button | Task 5 |
| Clicking it opens the annotated overlay | Tasks 4–5 |
| All listed labels render in both modes | Tasks 2, 3, 6 |
| Esc and overlay-click both dismiss it | Task 4 |
| Bubbles stay anchored on window resize | Task 4 |
| Copy is plain-language and kid-appropriate | Task 2 (DOM_LABELS), Task 3 (field labels) |
| Canvas-internal targets use math y-up → screen px | Task 1 + Task 3 |
| Mode-aware (Blockly vs Python) | Task 2 |

All acceptance criteria covered.
