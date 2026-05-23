# light_matrix.write → Console mirror — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mirror every `light_matrix.write(text)` call to the Console panel as a side effect of the existing `_showText` path, so Blockly users can debug without leaving the Blockly tab and without changing the LLSP3 export format.

**Architecture:** Single-line behaviour addition inside `_showText(text)` in `js/simulator.js`. Both code paths (Python `hub_display` command → `_execCmd` → `_showText`, and Blockly generator → direct `sim._showText(...)`) flow through that one function, so one change covers both. No new blocks, no Python bridge changes, no LLSP3 changes.

**Tech Stack:** Vanilla JS (browser-side, no build step), Node-side test harness using `node:test` + `vm.createContext`, existing `tests/js/sim-helper.js` to load `simulator.js` into a sandboxed VM with mocked `window.appendOutput`.

**Spec:** `docs/superpowers/specs/2026-05-23-light-matrix-write-console-mirror-design.md`

---

## File Structure

- **Modify:** `js/simulator.js` (one function, `_showText` at line 1669) — add a guarded `window.appendOutput(s)` call at the top of the function, after the `String(text || '')` coercion.
- **Create:** `tests/js/commands/hub-display-console.test.js` — Node-side tests covering both call paths (Python `_execCmd({type:'hub_display',...})` and Blockly direct `sim._showText(...)`), plus edge cases (empty string, numeric coercion). Lives next to the existing `tests/js/commands/hub-display-glyphs.test.js` to mirror that file's domain partitioning (glyphs vs. console).

The existing `tests/js/commands/hub-display-glyphs.test.js` is **not** modified — the new console-mirror tests are cohesive enough to live in their own file. The spec mentioned adding a single test to the glyphs file, but cohesion wins: all console-mirror coverage in one place is easier to discover and maintain.

---

## Task 1: Add console-mirror tests (failing) and the one-line implementation

**Files:**
- Create: `tests/js/commands/hub-display-console.test.js`
- Modify: `js/simulator.js:1669-1686` (the `_showText` method)

This is a TDD task: write the tests first, watch them fail, then add the one-line change, then watch them pass.

### Step 1.1: Write the failing test file

- [ ] Create `tests/js/commands/hub-display-console.test.js` with the following content:

```javascript
'use strict';

// Verifies that light_matrix.write — whether invoked from the Python path
// (_execCmd({type: 'hub_display', ...})) or directly from the Blockly
// generator (sim._showText(text)) — mirrors the text to the Console panel
// via window.appendOutput. See spec:
//   docs/superpowers/specs/2026-05-23-light-matrix-write-console-mirror-design.md

const test = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

function makeSpy() {
  const calls = [];
  const spy = (text) => calls.push(text);
  return { spy, calls };
}

test('hub_display: _execCmd path calls window.appendOutput with the text (Python path)', async () => {
  const { spy, calls } = makeSpy();
  const sim = createSim({ appendOutput: spy });
  await sim._execCmd({ type: 'hub_display', text: 'speed=42' });
  assert.deepStrictEqual(calls, ['speed=42'],
    `expected appendOutput to receive "speed=42" exactly once, got ${JSON.stringify(calls)}`);
});

test('hub_display: direct _showText call mirrors text to appendOutput (Blockly path)', () => {
  const { spy, calls } = makeSpy();
  const sim = createSim({ appendOutput: spy });
  sim._showText('hello');
  assert.deepStrictEqual(calls, ['hello'],
    `expected appendOutput to receive "hello" exactly once, got ${JSON.stringify(calls)}`);
});

test('hub_display: empty string still produces a console line (matches print() of empty)', () => {
  const { spy, calls } = makeSpy();
  const sim = createSim({ appendOutput: spy });
  sim._showText('');
  assert.deepStrictEqual(calls, [''],
    `expected appendOutput to receive "" exactly once, got ${JSON.stringify(calls)}`);
});

test('hub_display: null/undefined coerces to empty string before mirroring', () => {
  const { spy, calls } = makeSpy();
  const sim = createSim({ appendOutput: spy });
  sim._showText(null);
  sim._showText(undefined);
  assert.deepStrictEqual(calls, ['', ''],
    `expected two empty-string calls (null and undefined coerced via String(text || '')), got ${JSON.stringify(calls)}`);
});

test('hub_display: missing window.appendOutput does not throw (defensive guard)', () => {
  const sim = createSim({ appendOutput: undefined });
  // Should not throw even though appendOutput is undefined on the mock window.
  assert.doesNotThrow(() => sim._showText('safe'),
    `_showText must guard against missing window.appendOutput`);
});
```

### Step 1.2: Run the new tests to confirm they fail

- [ ] Run only the new test file:

```bash
node --test tests/js/commands/hub-display-console.test.js
```

Expected: **5 tests fail**. The first four fail because `appendOutput` is never called by `_showText` today (the spy's `calls` array stays empty, `deepStrictEqual` rejects). The fifth (`missing window.appendOutput does not throw`) likely passes by accident today because `_showText` doesn't reference `window.appendOutput` at all — that's fine; it'll still pass after the implementation is added, as long as we keep the `typeof` guard.

If all five fail, that's also fine — the point is that the four positive-case tests must be red before we implement.

### Step 1.3: Add the one-line implementation

- [ ] Edit `js/simulator.js`. Locate `_showText(text)` (around line 1669) and add the mirror call inside the function, immediately after the `const s = String(text || '');` line.

Before (current state):

```javascript
  _showText(text) {
    const s = String(text || '');
    if (s.length === 0) {
      this.robot.display = Array(25).fill(0);
      return;
    }
```

After:

```javascript
  _showText(text) {
    const s = String(text || '');
    // Mirror to the Console panel so light_matrix.write doubles as a
    // print-style debug surface in the sim. On a real hub this same call
    // scrolls text on the 5×5; the Console mirror is sim-only because no
    // Console exists on hardware.
    if (typeof window !== 'undefined' && typeof window.appendOutput === 'function') {
      window.appendOutput(s);
    }
    if (s.length === 0) {
      this.robot.display = Array(25).fill(0);
      return;
    }
```

The comment captures the *why* (sim-only debugging surface that doesn't distort hub behaviour). It's the kind of WHY that isn't obvious from reading the code alone, so it earns its place.

### Step 1.4: Run the new tests to confirm they pass

- [ ] Run the new test file again:

```bash
node --test tests/js/commands/hub-display-console.test.js
```

Expected: **5 tests pass**.

### Step 1.5: Run the existing glyph tests to confirm no regression

- [ ] Run the sibling glyph tests, which exercise the same `_execCmd({type:'hub_display',...})` path:

```bash
node --test tests/js/commands/hub-display-glyphs.test.js
```

Expected: **4 tests pass** (the existing tests use the no-op `appendOutput: () => {}` from `tests/js/mocks/window.js:12`, so the new mirror call is harmless to them).

### Step 1.6: Run the full JS test suite to confirm no regression

- [ ] Run all Node-side JS tests:

```bash
npm run test:js
```

Expected: all tests pass. Pre-change baseline was 518 tests; the new file adds 5, so expect **523 passing, 0 failing**.

### Step 1.7: Run the Python test suite to confirm the bridge contract is unchanged

- [ ] Run the MicroPython tests, which include `tests/py/test_hub.py` asserting `light_matrix.write` sends `{type: 'hub_display', text: ...}`:

```bash
npm run test:py
```

Expected: all Python tests pass. The bridge is not touched, so this is just a belt-and-braces confirmation.

### Step 1.8: Manual UI smoke test

The Node-side tests cover the JS contract, but the actual Console panel rendering depends on browser DOM. A quick manual check:

- [ ] Start the dev server:

```bash
python3 -m http.server 8787
```

- [ ] Open `http://localhost:8787` in a browser.
- [ ] Switch to the Blockly tab. Drag in a `light_matrix.write` block from the **LIGHT** category. Set its text to `hello`. Click **Run**.
- [ ] Confirm:
  - The Console Output panel shows a new line: `hello`
  - The 5×5 matrix on the hub chip shows the letter `H` (first character)
- [ ] Switch to the Python tab. Paste:

```python
import hub
hub.light_matrix.write("speed=42")
```

Click **Run**. Confirm:
  - The Console Output panel shows: `speed=42`
  - The 5×5 matrix shows the letter `S`

If both behaviours show up as expected, the feature is live.

### Step 1.9: Commit

- [ ] Stage and commit:

```bash
git add js/simulator.js tests/js/commands/hub-display-console.test.js
git commit -m "$(cat <<'EOF'
feat(sim): mirror light_matrix.write to Console panel

Adds a window.appendOutput(s) call inside _showText so every
light_matrix.write — Python path (via _execCmd hub_display) and Blockly
path (via the generator's direct sim._showText call) — also appears in
the Console panel. Gives Blockly users a print-style debug surface
without adding a sim-only block or distorting the LLSP3 export format.

Spec: docs/superpowers/specs/2026-05-23-light-matrix-write-console-mirror-design.md
EOF
)"
```

---

## Task 2: Finish the development branch

After Task 1's commit, the feature is complete. Use the finishing-a-development-branch skill to decide between merging to `main`, opening a PR, or staying on the branch for further work.

- [ ] Invoke `superpowers:finishing-a-development-branch` and follow its prompts.
