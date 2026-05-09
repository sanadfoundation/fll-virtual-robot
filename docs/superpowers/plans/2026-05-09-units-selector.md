# Units Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Hub-panel dropdown that picks the unit (cm / mm / in) used for every on-screen position readout — Hub panel X/Y, ruler tick labels, ruler origin marker, hover overlay — with localStorage persistence. Default `cm`.

**Architecture:** Two pure helpers in `js/ruler.js` (`tickPitchFor`, `formatPosition`) plus a fix to the existing `tickPositions` for float-pitch drift. `RobotSimulator.units` holds the selected unit; `setUnits(unit)` is the single setter. Render sites read `this.units` each frame from one source of truth — no caching, no broadcast. localStorage read/write lives in `js/main.js` at the trust boundary.

**Tech Stack:** Vanilla JS UMD modules, native `<select>` control, hand-written CSS, `node:test` + `node:assert`. No build step. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-08-units-selector-design.md`

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `js/ruler.js` | Modified | Pure helpers extended: `tickPitchFor(unit) → {major, minor}`, `formatPosition(mm, unit) → string`, plus `tickPositions` float-pitch fix. UMD-style export (browser `window.ruler`, Node `module.exports`) — already in place; just append. |
| `tests/js/ruler/ruler.test.js` | Modified | Append unit tests for the two new helpers and a regression test for the float-pitch fix. |
| `js/simulator.js` | Modified | `RobotSimulator.units` field initialized in the constructor; `setUnits(unit)` method writes the field and marks `_dirty`; `_drawRuler` / `_handleHover` / `_updateSensorPanel` read `this.units` and call `tickPitchFor` / `formatPosition` instead of hardcoded `200, 100` and `cm` strings. |
| `index.html` | Modified | Position section gets a `position-header` flex row that wraps the existing `<h3>Position</h3>` and adds `<select id="units-select">`. |
| `css/style.css` | Modified | New `.position-header` flex row + `.units-select` dropdown styling using existing theme variables. |
| `js/main.js` | Modified | New `UNITS_KEY` / `DEFAULT_UNITS` / `VALID_UNITS` constants near `THEME_KEY` group; new `updateUnits(unit, options?)` and `applyStoredUnits` mirroring `updateSpeed` / `applyStoredSpeed`; change listener on `<select>`; `handleDefaults` resets units. |

No changes to `py/spike_bridge.py`, no changes to `js/world_2d.js`, no changes to existing tests other than appends.

---

## Constants used throughout

These are introduced or referenced by multiple tasks; record them once here:

- `UNITS_KEY = 'fll-vr-units'` — localStorage key (matches the `fll-vr-*` family).
- `DEFAULT_UNITS = 'cm'` — initial value when nothing is stored or storage is corrupt.
- `VALID_UNITS = ['cm', 'mm', 'in']` — allowlist for `applyStoredUnits` validation.
- `RobotSimulator.units` — the single source of truth read by every render site.

---

## Task 1: `tickPositions` float-pitch fix

**Files:**
- Modify: `js/ruler.js`
- Modify: `tests/js/ruler/ruler.test.js`

The existing `tickPositions` walks `for (let p = 0; p <= fieldMM; p += pitch)`. Float pitches (e.g. `25.4` for inches) accumulate IEEE 754 drift, so by the 10th step `p ≈ 253.999…` instead of `254`, and the dedupe check `p % majorPitch === 0` fails to skip the major-overlap. Index-based iteration (`i * pitch`) plus a rounded-key Set fixes both.

- [ ] **Step 1.1: Append a regression test for the inches-pitch case to `tests/js/ruler/ruler.test.js`**

Add immediately after the existing `tickPositions` block (before the `clientToMM` block, currently around line 32):

```javascript
test('tickPositions: float minor pitch (inches: 254 / 25.4) — no FP drift collisions', () => {
  const { major, minor } = r.tickPositions(2362, 254, 25.4);
  // 10 majors at 0, 254, 508, …, 2286.
  assert.deepEqual(major, [0, 254, 508, 762, 1016, 1270, 1524, 1778, 2032, 2286]);
  // 83 minors total (1×25.4 through 92×25.4 ≤ 2362), minus the 9 that overlap
  // a non-zero major (254, 508, …, 2286 → 9 collisions).
  // i.e. 92 minor candidates at i=1..92, minus 9 overlaps = 83.
  assert.strictEqual(minor.length, 83);
  // Spot-check: 254 mm sits on the major-pitch grid via 10*25.4; must not appear in minors.
  for (const m of minor) {
    for (const M of major) {
      if (M === 0) continue;
      assert.ok(Math.abs(m - M) > 1e-6, `minor ${m} collides with major ${M}`);
    }
  }
});
```

- [ ] **Step 1.2: Run the tests — the new test fails with the current accumulation-based implementation**

Run from `.worktrees/units-selector/`:
`node --test tests/js/ruler/ruler.test.js`

Expected: 1 fail (the new inches-pitch test); existing 11 still pass.

- [ ] **Step 1.3: Replace `tickPositions` body in `js/ruler.js`**

Find (around lines 19-32):

```javascript
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
```

Replace with:

```javascript
  // Tick positions in mm along one axis. A position that falls on both pitches
  // appears in `major` only (no duplicate in `minor`). Index-based iteration
  // (`i * pitch`) avoids float drift that would accumulate with `p += pitch`
  // for fractional-mm pitches like inches (25.4 mm). The dedupe Set keys on
  // `Math.round(p * 1000)` (1 µm precision) so values that should be equal
  // but differ by a few ULPs collapse to the same key.
  function tickPositions(fieldMM, majorPitch, minorPitch) {
    const major = [];
    for (let i = 0; i * majorPitch <= fieldMM + 1e-9; i++) {
      major.push(i * majorPitch);
    }
    const minor = [];
    if (minorPitch > 0 && minorPitch < majorPitch) {
      const majorKeys = new Set(major.map(p => Math.round(p * 1000)));
      for (let i = 1; i * minorPitch <= fieldMM + 1e-9; i++) {
        const p = i * minorPitch;
        if (majorKeys.has(Math.round(p * 1000))) continue;
        minor.push(p);
      }
    }
    return { major, minor };
  }
```

- [ ] **Step 1.4: Run the tests — all 12 pass**

Run: `node --test tests/js/ruler/ruler.test.js`
Expected: 12/12 pass (4 existing `tickPositions` + 1 new inches case + 4 `clientToMM` + 3 `placeHoverOverlay`).

- [ ] **Step 1.5: Commit**

```bash
git -C /Users/mahergamal/src/github.com/sanadfoundation/fll-virtual-robot/.worktrees/units-selector add js/ruler.js tests/js/ruler/ruler.test.js
git -C /Users/mahergamal/src/github.com/sanadfoundation/fll-virtual-robot/.worktrees/units-selector commit -m "fix(ruler): tickPositions index-based iteration for float pitches

Old impl accumulated p += pitch each step; for float pitches (e.g.
25.4 mm = 1 inch) IEEE 754 drift made p % majorPitch === 0 dedupe
miss overlaps. Index-based i*pitch + rounded-key Set fixes both.

Inches case (254 mm major, 25.4 mm minor) added as regression test."
```

---

## Task 2: `tickPitchFor` helper

**Files:**
- Modify: `js/ruler.js`
- Modify: `tests/js/ruler/ruler.test.js`

- [ ] **Step 2.1: Append `tickPitchFor` tests to `tests/js/ruler/ruler.test.js`**

Add immediately after the new `tickPositions` inches test (still before `clientToMM`):

```javascript
// ── tickPitchFor ────────────────────────────────────────────────────────────

test('tickPitchFor: cm → 200/100 mm pitches', () => {
  assert.deepEqual(r.tickPitchFor('cm'), { major: 200, minor: 100 });
});

test('tickPitchFor: mm → 200/100 mm pitches (same physical positions as cm)', () => {
  assert.deepEqual(r.tickPitchFor('mm'), { major: 200, minor: 100 });
});

test('tickPitchFor: in → 254/25.4 mm pitches (10″ major, 1″ minor)', () => {
  assert.deepEqual(r.tickPitchFor('in'), { major: 254, minor: 25.4 });
});
```

- [ ] **Step 2.2: Run the tests — 3 fail (function not defined)**

Run: `node --test tests/js/ruler/ruler.test.js`
Expected: 3 fails (`r.tickPitchFor is not a function`); other 12 pass.

- [ ] **Step 2.3: Add `tickPitchFor` to `js/ruler.js`**

Insert immediately after the new `tickPositions` (right before `clientToMM`):

```javascript
  // Tick pitches (in mm) for a unit, chosen so the rendered tick labels read
  // as round numbers in that unit. cm and mm share physical positions
  // (200 mm pitch — `20 cm` and `200 mm` line up); inches gets its own pitch
  // (254 mm = 10″ major, 25.4 mm = 1″ minor).
  function tickPitchFor(unit) {
    if (unit === 'in') return { major: 254, minor: 25.4 };
    return { major: 200, minor: 100 };
  }
```

Then update the module export (currently around line 55):

```javascript
  return { tickPositions, clientToMM, placeHoverOverlay };
```

to:

```javascript
  return { tickPositions, tickPitchFor, clientToMM, placeHoverOverlay };
```

- [ ] **Step 2.4: Run the tests — all 15 pass**

Run: `node --test tests/js/ruler/ruler.test.js`
Expected: 15/15 pass.

- [ ] **Step 2.5: Commit**

```bash
git -C /Users/mahergamal/src/github.com/sanadfoundation/fll-virtual-robot/.worktrees/units-selector add js/ruler.js tests/js/ruler/ruler.test.js
git -C /Users/mahergamal/src/github.com/sanadfoundation/fll-virtual-robot/.worktrees/units-selector commit -m "feat(ruler): tickPitchFor — per-unit tick pitches in mm

cm/mm share 200 mm pitch (so 20 cm and 200 mm tick labels both fall
on the same lines); inches uses 254 mm major / 25.4 mm minor."
```

---

## Task 3: `formatPosition` helper

**Files:**
- Modify: `js/ruler.js`
- Modify: `tests/js/ruler/ruler.test.js`

- [ ] **Step 3.1: Append `formatPosition` tests to `tests/js/ruler/ruler.test.js`**

Add immediately after the `tickPitchFor` tests:

```javascript
// ── formatPosition ──────────────────────────────────────────────────────────

test('formatPosition: 980 mm in cm → "98.0 cm"', () => {
  assert.strictEqual(r.formatPosition(980, 'cm'), '98.0 cm');
});

test('formatPosition: 980 mm in mm → "980 mm"', () => {
  assert.strictEqual(r.formatPosition(980, 'mm'), '980 mm');
});

test('formatPosition: 980 mm in inches → "38.6 in"', () => {
  assert.strictEqual(r.formatPosition(980, 'in'), '38.6 in');
});

test('formatPosition: 0 mm in cm → "0.0 cm"', () => {
  assert.strictEqual(r.formatPosition(0, 'cm'), '0.0 cm');
});

test('formatPosition: 0 mm in mm → "0 mm" (no decimals)', () => {
  assert.strictEqual(r.formatPosition(0, 'mm'), '0 mm');
});

test('formatPosition: exactly 25.4 mm in inches → "1.0 in"', () => {
  assert.strictEqual(r.formatPosition(25.4, 'in'), '1.0 in');
});
```

- [ ] **Step 3.2: Run the tests — 6 fail**

Run: `node --test tests/js/ruler/ruler.test.js`
Expected: 6 fails (`r.formatPosition is not a function`); other 15 pass.

- [ ] **Step 3.3: Add `formatPosition` to `js/ruler.js`**

Insert immediately after `tickPitchFor`:

```javascript
  // mm value → display string for a given unit. mm displays as a whole
  // number (matching the simulator's internal precision); cm and inches use
  // 1 decimal (matching what the rest of the simulator's UI shows).
  function formatPosition(mm, unit) {
    if (unit === 'mm') return `${Math.round(mm)} mm`;
    if (unit === 'in') return `${(mm / 25.4).toFixed(1)} in`;
    return `${(mm / 10).toFixed(1)} cm`;
  }
```

Update the module export to:

```javascript
  return { tickPositions, tickPitchFor, formatPosition, clientToMM, placeHoverOverlay };
```

- [ ] **Step 3.4: Run the tests — all 21 pass**

Run: `node --test tests/js/ruler/ruler.test.js`
Expected: 21/21 pass.

- [ ] **Step 3.5: Commit**

```bash
git -C /Users/mahergamal/src/github.com/sanadfoundation/fll-virtual-robot/.worktrees/units-selector add js/ruler.js tests/js/ruler/ruler.test.js
git -C /Users/mahergamal/src/github.com/sanadfoundation/fll-virtual-robot/.worktrees/units-selector commit -m "feat(ruler): formatPosition — single source of truth for mm → display

mm whole-number, cm/inches 1 decimal. Used by the Hub panel, ruler
tick labels, hover overlay, and origin marker — every position
readout flows through this one function."
```

---

## Task 4: `RobotSimulator.units` and `setUnits`

**Files:**
- Modify: `js/simulator.js`
- Modify: `tests/js/sensors/accessors.test.js` (use the existing `tests/js/sensors/` for sim-level assertions; no new file needed)

The `units` field carries the current selection through every render site. `setUnits` is a one-line setter that also marks `_dirty` so the next animation frame repaints the ruler with the new pitch.

- [ ] **Step 4.1: Append two tests to `tests/js/sensors/accessors.test.js`**

Add at the bottom of the file (after the `getColorSensorColorInt` test block):

```javascript
test('units: defaults to "cm"', () => {
  assert.strictEqual(createSim().units, 'cm');
});

test('setUnits: assigns the new unit and marks _dirty', () => {
  const sim = createSim();
  sim._dirty = false;
  sim.setUnits('mm');
  assert.strictEqual(sim.units, 'mm');
  assert.strictEqual(sim._dirty, true);
});
```

- [ ] **Step 4.2: Run the test file — 2 fail**

Run from worktree root:
`node --test tests/js/sensors/accessors.test.js`
Expected: 2 fails (`undefined !== 'cm'` and `setUnits is not a function`).

- [ ] **Step 4.3: Initialize `this.units` in the `RobotSimulator` constructor**

Find (around line 140 in `js/simulator.js`):

```javascript
    this.speedMult = 1.0;
    this.pairMap   = {};  // pair_id → { left, right }
    this._portConfig = PORT_CONFIG;
```

Insert `this.units = 'cm';` immediately after `this.speedMult = 1.0;`. The block becomes:

```javascript
    this.speedMult = 1.0;
    this.units     = 'cm';   // 'cm' | 'mm' | 'in'; main.js calls setUnits() with stored value on load
    this.pairMap   = {};  // pair_id → { left, right }
    this._portConfig = PORT_CONFIG;
```

- [ ] **Step 4.4: Add `setUnits` method**

Insert as a new method on `RobotSimulator`. Place it immediately after `_handleHover` (which currently ends with the `_hoverEl.style.top` assignment around line 691) and before `stop()`:

```javascript
  // Single setter for the position-readout unit. Trusts the caller (only
  // called from js/main.js, which validates against the allowed set before
  // calling). Marking _dirty triggers the next animation-frame redraw of
  // the ruler with the new tick pitch and labels.
  setUnits(unit) {
    this.units = unit;
    this._dirty = true;
  }
```

- [ ] **Step 4.5: Run the accessors test — all green**

Run: `node --test tests/js/sensors/accessors.test.js`
Expected: all pass.

- [ ] **Step 4.6: Run the full JS test suite — confirm no regressions**

Run: `find tests/js -name '*.test.js' -print0 | xargs -0 node --test`
Expected: same total as baseline plus 9 new (1 inches `tickPositions` + 3 `tickPitchFor` + 6 `formatPosition` − wait, 1+3+6=10 from earlier tasks, plus 2 from this task = 12 total new across the four tasks). Pre-existing 3 failures in `tests/js/persistence/tab.test.js` are unrelated to this work and persist.

- [ ] **Step 4.7: Commit**

```bash
git -C /Users/mahergamal/src/github.com/sanadfoundation/fll-virtual-robot/.worktrees/units-selector add js/simulator.js tests/js/sensors/accessors.test.js
git -C /Users/mahergamal/src/github.com/sanadfoundation/fll-virtual-robot/.worktrees/units-selector commit -m "feat(sim): RobotSimulator.units + setUnits — single source of truth

this.units defaults to 'cm'. setUnits writes the field and marks
_dirty so the next paint flows the change through the ruler, hover
overlay, and Hub panel."
```

---

## Task 5: `_drawRuler` reads `this.units`

**Files:**
- Modify: `js/simulator.js`
- Modify: `tests/js/sensors/accessors.test.js`

Replace hardcoded `200, 100` pitches with `tickPitchFor(this.units)`; replace `String(mm)` labels and `'0,0 mm'` origin marker with `formatPosition` / unit-suffixed origin.

- [ ] **Step 5.1: Append a smoke test to `tests/js/sensors/accessors.test.js`**

Add at the bottom of the file:

```javascript
test('_drawRuler: reads this.units for tick pitch and label format', () => {
  const sim = createSim();
  sim.setUnits('in');
  // Stand in a fake ctx that records ops and label texts.
  const calls = [];
  const fakeCtx = new Proxy({
    save: () => calls.push({ op: 'save' }),
    restore: () => calls.push({ op: 'restore' }),
  }, {
    get(t, k) { if (k in t) return t[k]; return (...a) => calls.push({ op: k, args: a }); },
    set() { return true; },
  });
  sim._drawRuler(fakeCtx, 1);
  // The rendered text labels should include " in" suffix (origin or some major).
  const labels = calls.filter(c => c.op === 'fillText').map(c => c.args[0]);
  assert.ok(labels.some(t => / in$/.test(t)),
    `expected at least one tick label to end with " in", got: ${labels.join(', ')}`);
});
```

- [ ] **Step 5.2: Run the test file — the new test fails**

Run: `node --test tests/js/sensors/accessors.test.js`
Expected: 1 fail (no `" in"`-suffixed label rendered yet); others pass.

- [ ] **Step 5.3: Update `_drawRuler` in `js/simulator.js`**

Find the start of `_drawRuler` (around line 380):

```javascript
  _drawRuler(ctx, s) {
    const ruler = window.ruler;
    const xTicks = ruler.tickPositions(FIELD_W_MM, 200, 100);
    const yTicks = ruler.tickPositions(FIELD_H_MM, 200, 100);
    const H = FIELD_H_MM * s;
```

Replace with:

```javascript
  _drawRuler(ctx, s) {
    const ruler = window.ruler;
    const { major: majorPitch, minor: minorPitch } = ruler.tickPitchFor(this.units);
    const xTicks = ruler.tickPositions(FIELD_W_MM, majorPitch, minorPitch);
    const yTicks = ruler.tickPositions(FIELD_H_MM, majorPitch, minorPitch);
    const H = FIELD_H_MM * s;
```

Then find the bottom-edge label loop (around line 431):

```javascript
    for (const mm of xTicks.major) {
      if (mm === 0) continue;
      const px = mm * s;
      const text = String(mm);
```

Replace `const text = String(mm);` with:

```javascript
      const text = ruler.formatPosition(mm, this.units);
```

Find the left-edge label loop (around line 444):

```javascript
    for (const mm of yTicks.major) {
      if (mm === 0) continue;
      const py = (FIELD_H_MM - mm) * s;
      const text = String(mm);
```

Replace `const text = String(mm);` with:

```javascript
      const text = ruler.formatPosition(mm, this.units);
```

Find the origin marker (around line 458):

```javascript
    const originText = '0,0 mm';
```

Replace with:

```javascript
    const originText = `0,0 ${this.units}`;
```

- [ ] **Step 5.4: Run the test file — all green**

Run: `node --test tests/js/sensors/accessors.test.js`
Expected: all pass; the smoke test now finds at least one `" in"`-suffixed label.

- [ ] **Step 5.5: Run the full JS suite**

Run: `find tests/js -name '*.test.js' -print0 | xargs -0 node --test`
Expected: same total green count, no new failures.

- [ ] **Step 5.6: Commit**

```bash
git -C /Users/mahergamal/src/github.com/sanadfoundation/fll-virtual-robot/.worktrees/units-selector add js/simulator.js tests/js/sensors/accessors.test.js
git -C /Users/mahergamal/src/github.com/sanadfoundation/fll-virtual-robot/.worktrees/units-selector commit -m "feat(sim): _drawRuler consumes this.units

Tick pitches via tickPitchFor; tick labels and origin marker via
formatPosition/unit suffix. Switching to inches reflows the tick
grid; switching cm↔mm is a label-only swap."
```

---

## Task 6: `_handleHover` reads `this.units`

**Files:**
- Modify: `js/simulator.js`

This is a one-line behavior change — the test value covered by Task 5 already exercises `formatPosition`, so a separate test isn't needed; the visual output change is verified in the smoke test (Task 10).

- [ ] **Step 6.1: Update `_handleHover`**

Find (around line 676 in `js/simulator.js`):

```javascript
    this._hoverEl.textContent = `x=${Math.round(x)} mm  y=${Math.round(y)} mm`;
```

Replace with:

```javascript
    this._hoverEl.textContent = `x=${window.ruler.formatPosition(x, this.units)}  y=${window.ruler.formatPosition(y, this.units)}`;
```

- [ ] **Step 6.2: Run the full JS test suite — confirm no regressions**

Run: `find tests/js -name '*.test.js' -print0 | xargs -0 node --test`
Expected: same green count, no new failures.

- [ ] **Step 6.3: Commit**

```bash
git -C /Users/mahergamal/src/github.com/sanadfoundation/fll-virtual-robot/.worktrees/units-selector add js/simulator.js
git -C /Users/mahergamal/src/github.com/sanadfoundation/fll-virtual-robot/.worktrees/units-selector commit -m "feat(sim): _handleHover formats position via this.units"
```

---

## Task 7: `_updateSensorPanel` reads `this.units` for X/Y

**Files:**
- Modify: `js/simulator.js`
- Modify: `tests/js/sensors/accessors.test.js`

Replace hardcoded `(r.x / 10).toFixed(1) + ' cm'` with `formatPosition(r.x, this.units)`. Heading stays in degrees, distance/color rows are unchanged.

- [ ] **Step 7.1: Append a panel-format test to `tests/js/sensors/accessors.test.js`**

Add at the bottom of the file:

```javascript
test('_updateSensorPanel: X/Y formatted via formatPosition(this.units)', () => {
  const sim = createSim();
  sim.robot.x = 980;
  sim.robot.y = 254;

  // Mount a minimal DOM so _updateSensorPanel finds its targets.
  const ids = ['sensor-panel', 'sp-x', 'sp-y', 'sp-heading'];
  for (const id of ids) {
    const node = sim.canvas.ownerDocument.createElement('div');
    node.id = id;
    sim.canvas.ownerDocument.body.appendChild(node);
  }

  sim.setUnits('mm');
  sim._updateSensorPanel();
  assert.strictEqual(document.getElementById('sp-x').textContent, '980 mm');
  assert.strictEqual(document.getElementById('sp-y').textContent, '254 mm');

  sim.setUnits('in');
  sim._updateSensorPanel();
  assert.strictEqual(document.getElementById('sp-x').textContent, '38.6 in');
  assert.strictEqual(document.getElementById('sp-y').textContent, '10.0 in');
});
```

- [ ] **Step 7.2: Run the test — fails on the cm format (current hardcoded suffix is "98.0 cm" / "25.4 cm" instead)**

Run: `node --test tests/js/sensors/accessors.test.js`
Expected: 1 fail (assertion mismatch on sp-x text).

- [ ] **Step 7.3: Update `_updateSensorPanel` in `js/simulator.js`**

Find (around lines 638-640):

```javascript
    const deg = (((r.heading % 360) + 360) % 360);
    set('sp-x',       (r.x / 10).toFixed(1) + ' cm');
    set('sp-y',       (r.y / 10).toFixed(1) + ' cm');
    set('sp-heading', deg.toFixed(0) + '°');
```

Replace the X/Y lines with:

```javascript
    const deg = (((r.heading % 360) + 360) % 360);
    set('sp-x',       window.ruler.formatPosition(r.x, this.units));
    set('sp-y',       window.ruler.formatPosition(r.y, this.units));
    set('sp-heading', deg.toFixed(0) + '°');
```

(Heading line is unchanged — kept here for context.)

- [ ] **Step 7.4: Run the test — all green**

Run: `node --test tests/js/sensors/accessors.test.js`
Expected: all pass.

- [ ] **Step 7.5: Run the full JS suite**

Run: `find tests/js -name '*.test.js' -print0 | xargs -0 node --test`
Expected: same green count.

- [ ] **Step 7.6: Commit**

```bash
git -C /Users/mahergamal/src/github.com/sanadfoundation/fll-virtual-robot/.worktrees/units-selector add js/simulator.js tests/js/sensors/accessors.test.js
git -C /Users/mahergamal/src/github.com/sanadfoundation/fll-virtual-robot/.worktrees/units-selector commit -m "feat(sim): Hub panel X/Y format via this.units

Replaces the hardcoded cm suffix with formatPosition(r.x, this.units)
so X/Y match the ruler/hover/distance label units."
```

---

## Task 8: `<select>` markup + CSS

**Files:**
- Modify: `index.html`
- Modify: `css/style.css`

- [ ] **Step 8.1: Restructure the Position section in `index.html`**

Find (around lines 122-123):

```html
      <div class="hub-section">
        <h3>Position</h3>
```

Replace with:

```html
      <div class="hub-section position-section">
        <div class="position-header">
          <h3>Position</h3>
          <select id="units-select" class="units-select" aria-label="Position units">
            <option value="cm">cm</option>
            <option value="mm">mm</option>
            <option value="in">in</option>
          </select>
        </div>
```

The closing `</div>` of the `hub-section` (a few lines below, after `sp-heading`) is unchanged.

- [ ] **Step 8.2: Append CSS for the new layout**

Add to `css/style.css` immediately after the existing `#sensor-panel h3` block (around line 751):

```css
.position-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}

/* The h3 was previously the section's bottom-bordered header. The border now
   lives on .position-header (above), so strip it from h3 inside this section
   to avoid a double rule. Other sections' h3 keeps its original styling. */
.position-section h3 {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.units-select {
  background: var(--surface2);
  color: var(--text);
  border: 1px solid var(--border);
  font-family: var(--font-code);
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 3px;
  cursor: pointer;
}

.units-select:hover {
  border-color: var(--cyan);
}
```

- [ ] **Step 8.3: Manually verify the markup renders without breaking layout**

Start the dev server (in another terminal):
`python3 -m http.server 8787`

Open `http://localhost:8787/`. Confirm:
- Hub panel still expands on the right.
- The Position section header has "Position" left-aligned and a `cm` dropdown right-aligned, on one row.
- Other sections (Ports, etc.) are visually unchanged.
- Theme toggle still works (light & dark).

(The `<select>` is not yet wired to anything — clicking it changes nothing yet. That's Task 9.)

Stop the dev server with Ctrl+C when done.

- [ ] **Step 8.4: Commit**

```bash
git -C /Users/mahergamal/src/github.com/sanadfoundation/fll-virtual-robot/.worktrees/units-selector add index.html css/style.css
git -C /Users/mahergamal/src/github.com/sanadfoundation/fll-virtual-robot/.worktrees/units-selector commit -m "ui(hub): position-header flex row + units <select>

Section heading and the new <select#units-select> share one row.
Border-bottom moves from the h3 to the .position-header so we don't
get a double rule. <select> not yet wired (next task)."
```

---

## Task 9: `js/main.js` storage + change listener

**Files:**
- Modify: `js/main.js`

Mirror the existing speed-control pattern: `UNITS_KEY` constant, `updateUnits` (writes localStorage and calls `sim.setUnits`), `applyStoredUnits` (validates against `VALID_UNITS`, falls back to `DEFAULT_UNITS`), change listener, `handleDefaults` integration.

- [ ] **Step 9.1: Add the constants**

Find (around lines 52-58):

```javascript
const THEME_KEY   = 'fll-vr-theme';
const SPEED_KEY   = 'fll-vr-speed';
const PYCODE_KEY  = 'fll-vr-python-code';
const BLOCKLY_KEY = 'fll-vr-blockly-xml';
const TAB_KEY     = 'fll-vr-tab';
const NAME_KEY    = 'fll-vr-project-name';
const DIRTY_KEY   = 'fll-vr-dirty';
```

Add `UNITS_KEY` to the group, in alphabetical-ish order:

```javascript
const THEME_KEY   = 'fll-vr-theme';
const SPEED_KEY   = 'fll-vr-speed';
const UNITS_KEY   = 'fll-vr-units';
const PYCODE_KEY  = 'fll-vr-python-code';
const BLOCKLY_KEY = 'fll-vr-blockly-xml';
const TAB_KEY     = 'fll-vr-tab';
const NAME_KEY    = 'fll-vr-project-name';
const DIRTY_KEY   = 'fll-vr-dirty';
```

Find (around lines 60-63):

```javascript
const DEFAULT_THEME = 'light';
const DEFAULT_SPEED = 1;
const DEFAULT_TAB   = 'blocks';
const DEFAULT_NAME  = 'Untitled-Project';
```

Add:

```javascript
const DEFAULT_THEME = 'light';
const DEFAULT_SPEED = 1;
const DEFAULT_UNITS = 'cm';
const VALID_UNITS   = ['cm', 'mm', 'in'];
const DEFAULT_TAB   = 'blocks';
const DEFAULT_NAME  = 'Untitled-Project';
```

- [ ] **Step 9.2: Add `updateUnits` and `applyStoredUnits`**

Insert immediately after `applyStoredSpeed` (around line 378):

```javascript
// ── Units selector ────────────────────────────────────────────────────────────

function updateUnits(unit, options) {
  if (sim) sim.setUnits(unit);
  if (!options || options.persist !== false) lsSet(UNITS_KEY, unit);
}

function applyStoredUnits() {
  const stored = lsGet(UNITS_KEY);
  const unit = VALID_UNITS.includes(stored) ? stored : DEFAULT_UNITS;
  const select = document.getElementById('units-select');
  if (select) select.value = unit;
  updateUnits(unit, { persist: false });
}
```

- [ ] **Step 9.3: Wire the change listener and initial application**

Find (around lines 590-593):

```javascript
  const speedSlider = document.getElementById('speed-slider');
  if (speedSlider) speedSlider.addEventListener('input', e => updateSpeed(e.target.value));
  applyStoredSpeed();
  applyStoredTab();
```

Add the units listener and call `applyStoredUnits` alongside the others:

```javascript
  const speedSlider = document.getElementById('speed-slider');
  if (speedSlider) speedSlider.addEventListener('input', e => updateSpeed(e.target.value));

  const unitsSelect = document.getElementById('units-select');
  if (unitsSelect) unitsSelect.addEventListener('change', e => updateUnits(e.target.value));

  applyStoredSpeed();
  applyStoredUnits();
  applyStoredTab();
```

- [ ] **Step 9.4: Reset units in `handleDefaults`**

Find (around lines 392-395):

```javascript
  // Speed
  const slider = document.getElementById('speed-slider');
  if (slider) slider.value = String(DEFAULT_SPEED);
  updateSpeed(DEFAULT_SPEED);
```

Add immediately after, before the `// Python code` comment:

```javascript
  // Units
  const unitsSelect = document.getElementById('units-select');
  if (unitsSelect) unitsSelect.value = DEFAULT_UNITS;
  updateUnits(DEFAULT_UNITS);
```

- [ ] **Step 9.5: Run the full JS suite**

Run: `find tests/js -name '*.test.js' -print0 | xargs -0 node --test`
Expected: same green count, no new failures.

- [ ] **Step 9.6: Commit**

```bash
git -C /Users/mahergamal/src/github.com/sanadfoundation/fll-virtual-robot/.worktrees/units-selector add js/main.js
git -C /Users/mahergamal/src/github.com/sanadfoundation/fll-virtual-robot/.worktrees/units-selector commit -m "feat(main): wire units selector — load, change, persist, defaults

UNITS_KEY ('fll-vr-units') with cm default. Mirrors the speed-control
pattern (updateUnits / applyStoredUnits, change listener, defaults
reset). Validates against ['cm','mm','in'] before applying so a
hand-edited localStorage value can't crash the page."
```

---

## Task 10: Manual browser smoke test

**Files:** none (verification only).

Run all six scenarios from the spec. Report findings inline. Capture screenshots to `/var/folders/yr/.../T/units-selector-*.png` for any anomalies.

- [ ] **Step 10.1: Start the dev server**

Run: `python3 -m http.server 8787`
Expected: `Serving HTTP on :: port 8787 …`

(If 8787 is busy, pick another free port and adjust the URL below.)

- [ ] **Step 10.2: Default cm display**

Reload `http://localhost:8787/`. Expected:
- Hub panel reads `35.0 cm` / `16.3 cm` for X/Y (default spawn).
- Ruler X-axis labels: `200, 400, 600 …` — wait. With cm pitch, labels should read in the **chosen unit's** scale. With cm: `20, 40, 60 …`. Verify the ruler labels appear as cm values (with " cm" suffix), not raw mm.
- Origin marker reads `0,0 cm`.
- Hover over the canvas. Overlay reads `x=NN.N cm  y=NN.N cm`.

- [ ] **Step 10.3: Switch to `mm`**

Click the `<select>` and choose `mm`. Expected:
- Hub panel updates immediately to `350 mm` / `163 mm`.
- Ruler tick positions stay the same (200 mm pitch == 20 cm pitch). Labels swap to `200, 400, 600 …`.
- Origin marker reads `0,0 mm`.
- Hover overlay reads in mm.
- Canvas distance-sensor label (if a distance-sensor work merge has landed) is unaffected (it's already in mm by the recent change).

- [ ] **Step 10.4: Switch to `in`**

Choose `in`. Expected:
- Tick positions reflow: 10″ majors at 0, 254, 508 …; 1″ minors between.
- Labels read `10, 20, 30 …` (with " in" suffix) — wait, formatPosition for in is `(mm/25.4).toFixed(1)`, so 254 mm renders as `10.0 in`, 508 mm as `20.0 in`, etc. Verify those.
- Hub panel reads `13.8 in` / `6.4 in` (or close).
- Origin marker `0,0 in`.

- [ ] **Step 10.5: Reload — selection persists**

With `in` selected, reload the page. Expected: the dropdown comes back with `in` selected and all readouts in inches.

- [ ] **Step 10.6: Defaults reset**

Click the `⟲ Defaults` button and confirm. Expected: dropdown returns to `cm`, all readouts switch back to cm.

- [ ] **Step 10.7: Theme toggle**

Toggle dark mode. Expected: dropdown re-styles via CSS theme variables and stays readable.

- [ ] **Step 10.8: Stop the dev server**

Press Ctrl+C in the terminal running the server.

- [ ] **Step 10.9: If all scenarios behaved as expected, no commit needed; report success.**

If a scenario failed, capture exact behavior, add a follow-up task, and only then mark this plan complete.

---

## Self-review summary

Spec coverage check (each goal maps to at least one task):

| Spec section | Task(s) |
|---|---|
| Goals — single Hub-panel control selects unit for all readouts | 8 (markup), 9 (wiring) |
| Goals — defaults to `cm` | 4 (sim default), 9 (`DEFAULT_UNITS`) |
| Goals — selection persists (localStorage) | 9 (`UNITS_KEY`, `applyStoredUnits`) |
| Goals — four readouts re-derive each render | 5 (ruler), 6 (hover), 7 (panel) |
| Goals — tick pitch chooses unit-friendly numbers | 2 (`tickPitchFor`), 5 (consumed in `_drawRuler`) |
| Architecture — pure helpers in `js/ruler.js` | 1, 2, 3 |
| Architecture — `tickPositions` float-pitch fix | 1 |
| Architecture — `<select>` markup | 8 |
| Architecture — `RobotSimulator.units` + `setUnits` | 4 |
| Architecture — render-side wiring | 5, 6, 7 |
| Architecture — `js/main.js` storage + listeners | 9 |
| Edge case — invalid `localStorage['fll-vr-units']` | 9 (`VALID_UNITS.includes` guard) |
| Edge case — tick reflow on unit change | 4 (`_dirty` in `setUnits`), 5 (consumed) |
| Edge case — defaults reset | 9 (`handleDefaults` block) |
| Testing — `tickPitchFor` unit tests | 2 |
| Testing — `formatPosition` unit tests | 3 |
| Testing — `tickPositions` regression | 1 |
| Testing — manual smoke | 10 |

No placeholders. Method/property names consistent across tasks (`this.units`, `setUnits`, `tickPitchFor`, `formatPosition`, `UNITS_KEY`, `DEFAULT_UNITS`, `VALID_UNITS`).

Pre-existing 3 failures in `tests/js/persistence/tab.test.js` (from main commit `4ff88a7`'s default-tab change) are unrelated to this work and are not introduced or fixed by this plan.
