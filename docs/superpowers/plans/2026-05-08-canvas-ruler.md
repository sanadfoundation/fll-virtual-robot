# Canvas Ruler & Hover Position Readout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render an X/Y mm ruler along the inside of the field canvas, plus a cursor-following position readout, so users can read the robot's pose visually without checking the Hub panel.

**Architecture:** Pure tick / overlay-placement / coordinate helpers live in a new UMD module `js/ruler.js` (mirroring `js/kinematics.js`). `js/simulator.js` consumes them from `window.ruler`: a new `_drawRuler` paints ticks, labels, and a `0,0 mm` origin marker each frame; `mousemove` / `mouseleave` listeners drive a small absolute-positioned `<div>` in `index.html`.

**Tech Stack:** Vanilla JS, hand-written CSS, `node:test` + `node:assert`. No build step. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-08-canvas-ruler-design.md`

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `js/ruler.js` | New | Pure helpers: `tickPositions`, `clientToMM`, `placeHoverOverlay`. UMD-style export to `window.ruler` (browser) and `module.exports` (Node tests). |
| `tests/js/ruler/ruler.test.js` | New | Unit tests for the three helpers, requires `js/ruler.js` directly. |
| `js/simulator.js` | Modified | New `_drawRuler(ctx, s)` invoked from `_draw()`; new `_handleHover` method; two listeners attached in the constructor; references `window.ruler` (no module-level coupling, matches how `window.kinematics` is consumed today). |
| `index.html` | Modified | One `<div id="canvas-hover" hidden></div>` inside `.canvas-wrap`; one `<script src="js/ruler.js">` line before `<script src="js/simulator.js">`. |
| `css/style.css` | Modified | `#canvas-hover` styles using existing theme variables. |
| `BACKLOG.md` | Modified | Strike the "Field rulers" bullet under Debugging & Observation. |

---

## Constants used throughout

These are already defined at the top of `js/simulator.js` and don't need to be redeclared:

- `FIELD_W_MM = 2362`, `FIELD_H_MM = 1143` — canvas field dimensions in mm.
- `this._scale` — mm-to-pixel scale, recomputed in `_resize()`.
- `this._offX`, `this._offY` — pixel offsets where the canvas sits inside `.canvas-wrap` (canvas is centered with whitespace around it).

The ruler uses **major pitch 200 mm** and **minor pitch 100 mm** — pass these directly when calling `tickPositions`. They are not constants; they're the only call site.

---

## Task 1: Create `js/ruler.js` with `tickPositions` and its tests

**Files:**
- Create: `js/ruler.js`
- Create: `tests/js/ruler/ruler.test.js`

- [ ] **Step 1.1: Create the test file with all `tickPositions` cases (failing — module doesn't exist yet)**

`tests/js/ruler/ruler.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const r = require('../../../js/ruler.js');

// ── tickPositions ───────────────────────────────────────────────────────────

test('tickPositions: 2362 mm × 200/100 → 12 majors and 12 minors', () => {
  const { major, minor } = r.tickPositions(2362, 200, 100);
  assert.deepEqual(major, [0, 200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200]);
  assert.deepEqual(minor, [100, 300, 500, 700, 900, 1100, 1300, 1500, 1700, 1900, 2100, 2300]);
});

test('tickPositions: 1143 mm × 200/100 → 6 majors and 6 minors', () => {
  const { major, minor } = r.tickPositions(1143, 200, 100);
  assert.deepEqual(major, [0, 200, 400, 600, 800, 1000]);
  assert.deepEqual(minor, [100, 300, 500, 700, 900, 1100]);
});

test('tickPositions: positions on both pitches count as major only (no duplicates)', () => {
  const { major, minor } = r.tickPositions(1000, 200, 100);
  assert.deepEqual(major, [0, 200, 400, 600, 800, 1000]);
  assert.deepEqual(minor, [100, 300, 500, 700, 900]); // no 200/400/600/800/1000
});

test('tickPositions: tiny field smaller than minor pitch → only [0] for major, no minors', () => {
  const { major, minor } = r.tickPositions(50, 200, 100);
  assert.deepEqual(major, [0]);
  assert.deepEqual(minor, []);
});
```

- [ ] **Step 1.2: Run the tests, confirm they fail with module-not-found**

Run: `node --test tests/js/ruler/ruler.test.js`
Expected: failure containing `Cannot find module '.../js/ruler.js'` (or equivalent).

- [ ] **Step 1.3: Create `js/ruler.js` with `tickPositions` and the UMD wrapper**

`js/ruler.js`:

```javascript
'use strict';

// Pure helpers for the canvas ruler & hover position readout. Loadable both
// as a browser <script> (assigns to window.ruler) and as a Node CommonJS
// module (module.exports). Same source, no build step. Mirrors the pattern
// in js/kinematics.js — keep them in sync if that pattern evolves.

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.ruler = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  // Tick positions in mm along one axis. A position that falls on both pitches
  // appears in `major` only (no duplicate in `minor`).
  function tickPositions(fieldMM, majorPitch, minorPitch) {
    const major = [];
    for (let p = 0; p <= fieldMM; p += majorPitch) {
      major.push(p);
    }
    const minor = [];
    if (minorPitch > 0 && minorPitch < majorPitch) {
      for (let p = minorPitch; p <= fieldMM; p += minorPitch) {
        if (p % majorPitch === 0) continue;
        minor.push(p);
      }
    }
    return { major, minor };
  }

  return { tickPositions };
});
```

- [ ] **Step 1.4: Run the tests, confirm they pass**

Run: `node --test tests/js/ruler/ruler.test.js`
Expected: `pass 4`, `fail 0`.

- [ ] **Step 1.5: Commit**

```bash
git add js/ruler.js tests/js/ruler/ruler.test.js
git commit -m "feat(ruler): add tickPositions helper with UMD wrapper"
```

---

## Task 2: Add `clientToMM`

**Files:**
- Modify: `js/ruler.js`
- Modify: `tests/js/ruler/ruler.test.js`

- [ ] **Step 2.1: Append `clientToMM` tests below the `tickPositions` block in `tests/js/ruler/ruler.test.js`**

```javascript
// ── clientToMM ──────────────────────────────────────────────────────────────

test('clientToMM: cursor at canvas top-left → (0, 0) mm', () => {
  const rect = { left: 0, top: 0 };
  assert.deepEqual(r.clientToMM(0, 0, rect, 1), { x: 0, y: 0 });
});

test('clientToMM: cursor inside canvas with no rect offset → unscaled mm', () => {
  const rect = { left: 0, top: 0 };
  assert.deepEqual(r.clientToMM(100, 50, rect, 1), { x: 100, y: 50 });
});

test('clientToMM: subtracts rect.left/rect.top before dividing by scale', () => {
  const rect = { left: 100, top: 50 };
  assert.deepEqual(r.clientToMM(200, 150, rect, 1), { x: 100, y: 100 });
});

test('clientToMM: scale 0.5 doubles mm distance', () => {
  const rect = { left: 0, top: 0 };
  assert.deepEqual(r.clientToMM(200, 100, rect, 0.5), { x: 400, y: 200 });
});
```

- [ ] **Step 2.2: Run the tests, confirm the new ones fail**

Run: `node --test tests/js/ruler/ruler.test.js`
Expected: failures pointing at `r.clientToMM is not a function`.

- [ ] **Step 2.3: Add `clientToMM` to `js/ruler.js`**

Inside the factory function (after `tickPositions`, before `return`):

```javascript
  // Cursor pixel coordinates → field mm coordinates. `rect` is the canvas's
  // getBoundingClientRect() (we read only `left` and `top`); `scale` is the
  // simulator's mm→px factor.
  function clientToMM(clientX, clientY, rect, scale) {
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top)  / scale,
    };
  }
```

And update the `return` line:

```javascript
  return { tickPositions, clientToMM };
```

- [ ] **Step 2.4: Run the tests, confirm they pass**

Run: `node --test tests/js/ruler/ruler.test.js`
Expected: `pass 8`, `fail 0`.

- [ ] **Step 2.5: Commit**

```bash
git add js/ruler.js tests/js/ruler/ruler.test.js
git commit -m "feat(ruler): add clientToMM helper"
```

---

## Task 3: Add `placeHoverOverlay`

**Files:**
- Modify: `js/ruler.js`
- Modify: `tests/js/ruler/ruler.test.js`

- [ ] **Step 3.1: Append `placeHoverOverlay` tests below the `clientToMM` block**

The overlay is treated as an axis-aligned box. It's pinned at `cursor + offset` in both axes by default, and flips to `cursor - offset - overlaySize` when that would put it past the canvas edge. Tests use a 700 × 400 canvas, an 110 × 18 overlay, and offset 12.

```javascript
// ── placeHoverOverlay ───────────────────────────────────────────────────────

test('placeHoverOverlay: cursor in interior → bottom-right of cursor', () => {
  const out = r.placeHoverOverlay(50, 50, 700, 400, 110, 18, 12);
  assert.deepEqual(out, { left: 62, top: 62 });
});

test('placeHoverOverlay: cursor near right edge → flips to left of cursor', () => {
  const out = r.placeHoverOverlay(650, 50, 700, 400, 110, 18, 12);
  assert.deepEqual(out, { left: 528, top: 62 }); // 650 - 12 - 110 = 528
});

test('placeHoverOverlay: cursor near bottom edge → flips above cursor', () => {
  const out = r.placeHoverOverlay(50, 380, 700, 400, 110, 18, 12);
  assert.deepEqual(out, { left: 62, top: 350 }); // 380 - 12 - 18 = 350
});

test('placeHoverOverlay: cursor in bottom-right corner → flips both axes', () => {
  const out = r.placeHoverOverlay(680, 390, 700, 400, 110, 18, 12);
  assert.deepEqual(out, { left: 558, top: 360 });
});
```

- [ ] **Step 3.2: Run the tests, confirm the new ones fail**

Run: `node --test tests/js/ruler/ruler.test.js`
Expected: failures pointing at `r.placeHoverOverlay is not a function`.

- [ ] **Step 3.3: Add `placeHoverOverlay` to `js/ruler.js`**

Inside the factory function (after `clientToMM`):

```javascript
  // Pick a non-clipping corner near the cursor. Default placement is
  // bottom-right of the cursor; flips to the opposite side near the right
  // or bottom edge so the overlay never extends past the canvas.
  function placeHoverOverlay(cursorX, cursorY, canvasW, canvasH, overlayW, overlayH, offset) {
    let left = cursorX + offset;
    let top  = cursorY + offset;
    if (left + overlayW > canvasW) left = cursorX - offset - overlayW;
    if (top  + overlayH > canvasH) top  = cursorY - offset - overlayH;
    return { left, top };
  }
```

And update the `return`:

```javascript
  return { tickPositions, clientToMM, placeHoverOverlay };
```

- [ ] **Step 3.4: Run the tests, confirm they pass**

Run: `node --test tests/js/ruler/ruler.test.js`
Expected: `pass 12`, `fail 0`.

- [ ] **Step 3.5: Commit**

```bash
git add js/ruler.js tests/js/ruler/ruler.test.js
git commit -m "feat(ruler): add placeHoverOverlay edge-flip helper"
```

---

## Task 4: Wire `js/ruler.js` into the page

**Files:**
- Modify: `index.html`

- [ ] **Step 4.1: Add the `<script>` tag**

Currently `index.html` has (around line 179):

```html
<script src="js/kinematics.js"></script>
<script src="js/simulator.js"></script>
```

Insert `ruler.js` so it's available to `simulator.js` at evaluation time:

```html
<script src="js/kinematics.js"></script>
<script src="js/ruler.js"></script>
<script src="js/simulator.js"></script>
```

- [ ] **Step 4.2: Smoke-load the page**

Run in the project root: `python3 -m http.server 8787`

Open http://localhost:8787/. Confirm:
- Page loads with no console errors mentioning `ruler.js`.
- `window.ruler` exists (paste in DevTools console: `Object.keys(window.ruler)`). Expect `["tickPositions", "clientToMM", "placeHoverOverlay"]`.
- The simulator still draws and the robot still drives (run any built-in program to confirm nothing regressed).

- [ ] **Step 4.3: Commit**

```bash
git add index.html
git commit -m "feat(ruler): load ruler.js before simulator.js"
```

---

## Task 5: Render ruler ticks in `_drawRuler`

**Files:**
- Modify: `js/simulator.js`

This task adds the method and the call site. Labels and the origin marker come in Task 6.

- [ ] **Step 5.1: Add `_drawRuler` method and call it from `_draw()`**

In `js/simulator.js`, locate `_draw()` (around line 187):

```javascript
  _draw() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const s = this._scale;

    ctx.clearRect(0, 0, W, H);
    this._drawField(ctx, W, H, s);
    this._drawTrail(ctx);
    this._drawRobot(ctx, s);
    this._updateSensorPanel();
  }
```

Insert a call to `_drawRuler` between `_drawField` and `_drawTrail`:

```javascript
  _draw() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const s = this._scale;

    ctx.clearRect(0, 0, W, H);
    this._drawField(ctx, W, H, s);
    this._drawRuler(ctx, s);
    this._drawTrail(ctx);
    this._drawRobot(ctx, s);
    this._updateSensorPanel();
  }
```

Then add `_drawRuler` as a new method on `RobotSimulator`. Place it directly after `_drawField` (around line 256, after the closing `}` of `_drawField`):

```javascript
  // Ruler: ticks along the top and left inside edges of the field. Labels
  // and origin marker live in the same method (added in the next task).
  _drawRuler(ctx, s) {
    const ruler = window.ruler;
    const xTicks = ruler.tickPositions(FIELD_W_MM, 200, 100);
    const yTicks = ruler.tickPositions(FIELD_H_MM, 200, 100);

    ctx.save();
    ctx.lineWidth = 1;

    // Top edge — minors first (so majors paint over any overlap), then majors
    ctx.strokeStyle = '#555';
    for (const mm of xTicks.minor) {
      const px = mm * s;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, 5);
      ctx.stroke();
    }
    ctx.strokeStyle = '#333';
    for (const mm of xTicks.major) {
      const px = mm * s;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, 9);
      ctx.stroke();
    }

    // Left edge
    ctx.strokeStyle = '#555';
    for (const mm of yTicks.minor) {
      const px = mm * s;
      ctx.beginPath();
      ctx.moveTo(0, px);
      ctx.lineTo(5, px);
      ctx.stroke();
    }
    ctx.strokeStyle = '#333';
    for (const mm of yTicks.major) {
      const px = mm * s;
      ctx.beginPath();
      ctx.moveTo(0, px);
      ctx.lineTo(9, px);
      ctx.stroke();
    }

    ctx.restore();
  }
```

- [ ] **Step 5.2: Run existing tests to confirm nothing regressed**

Run: `node --test tests/js/`

Expected: all tests pass (the simulator-level tests use `_draw` indirectly via constructor / state; ruler ticks are pure-canvas-API and don't disturb logic).

- [ ] **Step 5.3: Visual smoke**

Run `python3 -m http.server 8787`, open http://localhost:8787/. Confirm:
- Tick marks visible along the top edge and left edge of the field.
- Major ticks are darker and longer than minor ticks.
- Tick spacing tracks the canvas width: resize the window and watch ticks reflow.
- Robot still draws correctly. Trail still renders over the ticks if any segment crosses an axis.

- [ ] **Step 5.4: Commit**

```bash
git add js/simulator.js
git commit -m "feat(ruler): draw tick marks along top and left field edges"
```

---

## Task 6: Add ruler labels and the origin marker

**Files:**
- Modify: `js/simulator.js`

- [ ] **Step 6.1: Extend `_drawRuler` with label and origin-marker rendering**

In `js/simulator.js`, append to the body of `_drawRuler` — just before the trailing `ctx.restore()`:

```javascript
    // Major-tick labels. Skip 0 (covered by the origin marker below).
    ctx.font = '9px ui-monospace, monospace';
    ctx.textBaseline = 'middle';

    // Top labels (centered on each major tick, ~11 px below the edge)
    ctx.textAlign = 'center';
    for (const mm of xTicks.major) {
      if (mm === 0) continue;
      const px = mm * s;
      const text = String(mm);
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(240,232,208,0.85)';
      ctx.fillRect(px - tw / 2 - 2, 5, tw + 4, 12);
      ctx.fillStyle = '#333';
      ctx.fillText(text, px, 11);
    }

    // Left labels (~11 px right of the edge, vertically centered on each tick)
    ctx.textAlign = 'left';
    for (const mm of yTicks.major) {
      if (mm === 0) continue;
      const px = mm * s;
      const text = String(mm);
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(240,232,208,0.85)';
      ctx.fillRect(9, px - 6, tw + 4, 12);
      ctx.fillStyle = '#333';
      ctx.fillText(text, 11, px);
    }

    // Origin marker — anchors the unit (mm) once so per-tick labels stay numeric
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const originText = '0,0 mm';
    const otw = ctx.measureText(originText).width;
    ctx.fillStyle = 'rgba(240,232,208,0.85)';
    ctx.fillRect(4, 4, otw + 4, 11);
    ctx.fillStyle = '#333';
    ctx.fillText(originText, 6, 5);
```

- [ ] **Step 6.2: Run existing tests**

Run: `node --test tests/js/`

Expected: still all green.

- [ ] **Step 6.3: Visual smoke**

Reload http://localhost:8787/. Confirm:
- Top edge shows `200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200`.
- Left edge shows `200, 400, 600, 800, 1000`.
- `0,0 mm` marker visible in the top-left corner.
- Labels read clearly over the HOME zone (test by hovering — HOME is at y=780, so the y=800 label sits inside it).
- Drive `motor_pair.move(1, 'rotations')` from the spawn (x=350, y=980, heading=-90 = north). Robot lands near y=804. Visually, the trail should end about one row above the y=1000 gridline and the tip near the y=800 label — confirms the ruler agrees with the physics.

- [ ] **Step 6.4: Commit**

```bash
git add js/simulator.js
git commit -m "feat(ruler): label major ticks and add 0,0 mm origin marker"
```

---

## Task 7: Add the hover overlay element and CSS

**Files:**
- Modify: `index.html`
- Modify: `css/style.css`

- [ ] **Step 7.1: Add the overlay element to `index.html`**

Find `.canvas-wrap` (around line 84):

```html
    <div class="canvas-wrap">
      <canvas id="robot-canvas"></canvas>
    </div>
```

Add the overlay as a sibling of the canvas, inside the wrap:

```html
    <div class="canvas-wrap">
      <canvas id="robot-canvas"></canvas>
      <div id="canvas-hover" hidden></div>
    </div>
```

- [ ] **Step 7.2: Add styles to `css/style.css`**

Append to `css/style.css`:

```css
/* Cursor-following position readout over the field canvas. JS positions it
 * absolutely within .canvas-wrap and toggles the [hidden] attribute. */
.canvas-wrap { position: relative; }

#canvas-hover {
  position: absolute;
  pointer-events: none;
  background: var(--surface2);
  color: var(--text);
  border: 1px solid var(--border2);
  font: 11px/14px var(--font-code);
  padding: 4px 8px;
  border-radius: 4px;
  white-space: nowrap;
  z-index: 10;
}
#canvas-hover[hidden] { display: none; }
```

(The `position: relative` on `.canvas-wrap` is defensive — if it's already set in the existing styles, the duplicate is harmless. Without it, `#canvas-hover`'s absolute positioning falls back to the next positioned ancestor.)

- [ ] **Step 7.3: Smoke-check the page still renders**

Reload http://localhost:8787/. Confirm:
- No layout shifts; canvas still fills the right panel.
- `#canvas-hover` is in the DOM (DevTools Inspector → search "canvas-hover") but `hidden`.
- No new console warnings.

- [ ] **Step 7.4: Commit**

```bash
git add index.html css/style.css
git commit -m "feat(ruler): add #canvas-hover overlay element and styles"
```

---

## Task 8: Wire hover listeners on the canvas

**Files:**
- Modify: `js/simulator.js`

- [ ] **Step 8.1: Attach listeners in the constructor and add `_handleHover`**

In `js/simulator.js`, find the constructor — specifically the block right after `this._resize()` and the resize listener (around line 137-138):

```javascript
    this._resize();
    window.addEventListener('resize', () => this._resize());

    this._raf = null;
    this._drawLoop();
  }
```

Insert the hover wiring between the resize listener and the `_raf` line:

```javascript
    this._resize();
    window.addEventListener('resize', () => this._resize());

    this._hoverEl = document.getElementById('canvas-hover');
    if (this._hoverEl) {
      this.canvas.addEventListener('mousemove', e => this._handleHover(e));
      this.canvas.addEventListener('mouseleave', () => { this._hoverEl.hidden = true; });
    }

    this._raf = null;
    this._drawLoop();
  }
```

Then add `_handleHover` as a new method. Place it directly above the existing `stop()` method (around line 451):

```javascript
  _handleHover(event) {
    const rect = this.canvas.getBoundingClientRect();
    const { x, y } = window.ruler.clientToMM(event.clientX, event.clientY, rect, this._scale);
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;

    this._hoverEl.textContent = `x=${Math.round(x)} mm  y=${Math.round(y)} mm`;
    this._hoverEl.hidden = false;

    // Read overlay dimensions after textContent set so size reflects content
    const ow = this._hoverEl.offsetWidth;
    const oh = this._hoverEl.offsetHeight;
    const { left, top } = window.ruler.placeHoverOverlay(
      cursorX, cursorY, this.canvas.width, this.canvas.height, ow, oh, 12,
    );
    // The canvas is centered inside .canvas-wrap with margin offsets; add
    // those so the overlay's top/left line up with the cursor inside the wrap.
    this._hoverEl.style.left = (left + this._offX) + 'px';
    this._hoverEl.style.top  = (top  + this._offY) + 'px';
  }
```

- [ ] **Step 8.2: Run all tests to confirm no regressions**

Run: `node --test tests/js/`

Expected: all green. The simulator-level tests don't fire mouse events; the listener wiring is dormant under tests because `document.getElementById('canvas-hover')` returns the mock element from `tests/js/sim-helper.js` only if `makeWindowGlobals` happens to provide one. If a test fails because of a missing element, the `if (this._hoverEl)` guard already handles that — confirm the failure isn't somewhere else.

- [ ] **Step 8.3: Visual smoke**

Reload http://localhost:8787/. Confirm:
- Hovering over the canvas shows a small pill near the cursor reading `x=<n> mm  y=<n> mm`.
- Values match the visible position. Hover at the spawn (the robot's center) — readout should show roughly `x=350, y=980`.
- Cursor near right edge: pill flips to the cursor's left side. Cursor near bottom edge: pill flips above the cursor.
- Cursor leaves canvas: pill disappears.
- Light/dark theme toggle: pill restyles via CSS variables; remains legible in both.
- Hub-panel collapse: canvas widens, hover values still match the visible position (they should, because `_scale` updates on resize).

- [ ] **Step 8.4: Commit**

```bash
git add js/simulator.js
git commit -m "feat(ruler): wire mousemove hover overlay with edge-flip placement"
```

---

## Task 9: Update BACKLOG.md and final smoke

**Files:**
- Modify: `BACKLOG.md`

- [ ] **Step 9.1: Strike the "Field rulers" line**

In `BACKLOG.md`, find the bullet under Debugging & Observation (around line 82):

```markdown
- **Field rulers** — render mm tick marks along the X and Y axes of the canvas so users can read robot position visually without checking the Hub panel.
```

Remove it. (The convention in this repo is to delete completed backlog items rather than crossing them out — see how the version-detection item was handled in `4bd848b`.)

- [ ] **Step 9.2: Run the full test suite once more**

Run: `node --test tests/js/`

Expected: all green.

- [ ] **Step 9.3: Final manual smoke pass**

Reload http://localhost:8787/. Walk through the full check list from the spec's "Manual smoke" section:

1. Ticks visible along top and left edges, majors longer than minors. ✓
2. Top labels: `200, 400, … 2200`. Left labels: `200, 400, … 1000`. ✓
3. `0,0 mm` marker in top-left. ✓
4. Hover overlay tracks the cursor and flips near edges. ✓
5. Window resize: ticks re-pitch, hover values still match. ✓
6. Hub-panel collapse: canvas widens, ruler tracks. ✓
7. Light/dark toggle: ticks remain legible, hover restyles. ✓
8. `motor_pair.move(1, 'rotations')` from spawn → robot ends near y=804; ruler agrees. ✓

- [ ] **Step 9.4: Commit**

```bash
git add BACKLOG.md
git commit -m "chore: close 'Field rulers' backlog item"
```

---

## Self-review notes

**Spec coverage:**
- Inside-edge placement, 200 / 100 mm ticks, mm labels, `0,0 mm` origin marker → Tasks 5, 6.
- Hover readout with edge-flip → Task 8 (helper from Task 3).
- UMD module mirroring `kinematics.js` → Tasks 1–3.
- File touch list (`js/ruler.js`, tests, `simulator.js`, `index.html`, `css/style.css`, `BACKLOG.md`) → Tasks 1–9 cover all six.
- Render order (ruler over field objects, under trail and robot) → Task 5.1's `_draw` insertion point.
- Theme variables (`--surface2`, `--text`, `--border2`, `--font-code`) → Task 7.2.
- Edge cases (resize, hub collapse, theme toggle, touch devices) — covered implicitly by `_scale`-driven coords (Tasks 5, 6) and by the `if (this._hoverEl)` guard (Task 8). Touch devices get the static ruler but no hover; spec accepts this.

**No placeholders:** All steps include concrete code or commands. No "TBD" / "implement later" / "similar to Task N".

**Type / signature consistency:** `tickPositions` returns `{ major: number[], minor: number[] }` everywhere; `clientToMM` returns `{ x, y }` everywhere; `placeHoverOverlay` returns `{ left, top }` everywhere. `_drawRuler(ctx, s)` signature consistent across Tasks 5 and 6.
