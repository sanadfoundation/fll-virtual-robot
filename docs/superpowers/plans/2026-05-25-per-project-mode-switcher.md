# Per-Project Mode Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the global Blocks/Python tab switcher with a per-project model — a project is created as either Python or Blocks (chosen via a dropdown menu off the "New" button) and stays that way until a new project is started. Aligns the UI with the single-mode `.llsp3` file format and removes the silent data-loss path where switching tabs mid-project caused Save to drop the inactive editor's content.

**Architecture:**
- Introduce a `PROJECT_TYPE_KEY` (`fll-vr-project-type`) that holds `'python' | 'blocks'` and is the single source of truth for which editor is visible.
- Bootstrap migrates the legacy `TAB_KEY` (`fll-vr-tab`) into `PROJECT_TYPE_KEY` once, then retires `TAB_KEY`. The legacy buffer keys (`fll-vr-python-code`, `fll-vr-blockly-xml`) keep their meaning; whichever doesn't match the current project type sits dormant until the user starts a new project of that type.
- The header `#tab-blocks` / `#tab-python` buttons are demoted to a static badge that shows the current project type (no click behavior).
- `#btn-new` becomes a split button with a popover menu containing **🐍 New Python project** and **🧱 New Blocks project**, modelled on the existing `#settings-trigger` / `#settings-pop` pattern.
- `handleNewProject(type)` takes a required type, clears the corresponding buffer only, sets project type, and switches the visible editor.
- `switchMode(mode)` survives as an internal view-only helper called by load and by `handleNewProject`; it no longer persists `TAB_KEY`.

**Tech Stack:** Vanilla JS (no build), `node --test` for JS tests via `tests/js/mocks/main-env.js` vm-sandbox harness, CSS popover styled like `.settings-pop`.

---

## File Structure

**Created**
- `tests/js/main/project-type-migration.test.js` — legacy `TAB_KEY` migration into `PROJECT_TYPE_KEY`.
- `tests/js/main/new-project-dropdown.test.js` — dropdown open/close, item-click → `handleNewProject(type)` wiring, per-type buffer-clearing semantics.

**Modified**
- `js/main.js` — add `PROJECT_TYPE_KEY` constants and `applyProjectType` / `getProjectType` / `setProjectType` / `migrateLegacyTabKey`; rewrite `handleNewProject` to take a type; replace tab-button wiring with badge-update + dropdown wiring; tweak `applyStoredTab` (renamed `applyStoredProjectType`).
- `index.html` — replace the `<button id="tab-blocks">` / `<button id="tab-python">` pair with a `<div class="project-type-badge">` showing the active type; wrap `#btn-new` in a `.new-menu` container with a popover containing two menu items (`#btn-new-python`, `#btn-new-blocks`); add the popover open/close inline script next to the existing settings-popover script.
- `css/style.css` — add `.new-menu`, `.new-menu-pop`, `.new-menu-item`, `.project-type-badge` rules; reuse colours and shadow from `.settings-pop` (no new tokens).
- `tests/js/mocks/main-env.js` — extend `elementsById` seed to include `btn-new`, `btn-new-python`, `btn-new-blocks`, `new-menu-pop`, `project-type-badge` so tests that don't depend on those don't pay a recompute cost via the lazy fallback. Also export `documentEl` and the `setLoadedManifest` capture used by new tests.

**Not modified**
- `js/llsp3_ui.js` — its `hooks.switchTab(mode)` callback at load-time keeps working (now drives `applyProjectType` via the same function reference). No interface change needed.
- `.llsp3` format / `js/llsp3_io.js` / `js/llsp3_manifest.js` — already single-mode per project; this plan only fixes the UI mismatch.

---

## Decisions baked in (not negotiable mid-implementation, surface in PR description if revisited)

1. **Internal label is still `'python' | 'blocks'`** — the manifest boundary in `js/llsp3_ui.js` already maps `'blocks'` → `'word-blocks'`. Keeping the internal label avoids churning every reference.
2. **The tab buttons are removed, not disabled.** Disabled tabs invite "why can't I click this?" support questions. A badge ("🧱 Blocks project" / "🐍 Python project") communicates the constraint instead.
3. **Buffers for the non-active mode are preserved across migration** so a user mid-experiment doesn't lose work the first time they reload after this ships. They become dead state in localStorage that subsequent `handleNewProject` calls of that type will clear naturally. No proactive cleanup migration.
4. **The legacy `TAB_KEY` is removed during migration.** Keeping it would let a downgrade silently resurrect; removing it makes the migration commit a clean cutover.
5. **`handleNewProject()` with no argument is an error.** The previous no-arg form was the bug surface this plan retires; we throw on misuse rather than fall through to a default.
6. **No "Convert this project to <other mode>" command in this plan.** Scope deferral; can be added later as a separate menu item that explicitly warns about data loss.

---

## Task 1: Introduce `PROJECT_TYPE_KEY` constant and `getProjectType` / `setProjectType` helpers

**Files:**
- Modify: `js/main.js:50-66` (constants block)
- Modify: `js/main.js:78-90` (project state helpers)
- Test: `tests/js/main/project-type-migration.test.js` (new file)

- [ ] **Step 1: Write the failing test for `getProjectType` reading from storage**

Create `tests/js/main/project-type-migration.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMainEnv } = require('../mocks/main-env');

test('getProjectType: returns "python" when storage has fll-vr-project-type=python', () => {
  const { context } = makeMainEnv({ storage: { 'fll-vr-project-type': 'python' } });
  assert.strictEqual(context.getProjectType(), 'python');
});

test('getProjectType: returns "blocks" when storage has fll-vr-project-type=blocks', () => {
  const { context } = makeMainEnv({ storage: { 'fll-vr-project-type': 'blocks' } });
  assert.strictEqual(context.getProjectType(), 'blocks');
});

test('setProjectType("python"): persists fll-vr-project-type=python', () => {
  const { context, storage } = makeMainEnv();
  context.setProjectType('python');
  assert.strictEqual(storage.get('fll-vr-project-type'), 'python');
});

test('setProjectType("blocks"): persists fll-vr-project-type=blocks', () => {
  const { context, storage } = makeMainEnv();
  context.setProjectType('blocks');
  assert.strictEqual(storage.get('fll-vr-project-type'), 'blocks');
});

test('setProjectType: rejects unknown values (no write, throws)', () => {
  const { context, storage } = makeMainEnv();
  assert.throws(() => context.setProjectType('word-blocks'), /unknown project type/i);
  assert.strictEqual(storage.has('fll-vr-project-type'), false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:js -- --test-name-pattern=getProjectType`
Expected: FAIL with `context.getProjectType is not a function` (or similar — `getProjectType` is undefined in the vm context).

- [ ] **Step 3: Add the constant and helpers to `js/main.js`**

In the constants block (after `const DIRTY_KEY = 'fll-vr-dirty';`, line 59), add:

```javascript
const PROJECT_TYPE_KEY = 'fll-vr-project-type';
```

Also add to the defaults section (after `const DEFAULT_TAB = 'blocks';`, line 65):

```javascript
const DEFAULT_PROJECT_TYPE = 'blocks';
const VALID_PROJECT_TYPES  = ['python', 'blocks'];
```

In the project-state-helpers block (after `setLoadedManifest`, line 90), add:

```javascript
function getProjectType() {
  const stored = lsGet(PROJECT_TYPE_KEY);
  return (stored === 'python' || stored === 'blocks') ? stored : DEFAULT_PROJECT_TYPE;
}

function setProjectType(type) {
  if (!VALID_PROJECT_TYPES.includes(type)) {
    throw new Error('unknown project type: ' + type);
  }
  lsSet(PROJECT_TYPE_KEY, type);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:js -- --test-name-pattern=getProjectType`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full test suite to confirm no regression**

Run: `npm run test:js`
Expected: PASS — same count as before plus 5 new tests.

- [ ] **Step 6: Commit**

```bash
git add js/main.js tests/js/main/project-type-migration.test.js
git commit -m "feat(project-type): add PROJECT_TYPE_KEY constant and getter/setter helpers"
```

---

## Task 2: Migrate legacy `TAB_KEY` to `PROJECT_TYPE_KEY` on bootstrap

**Files:**
- Modify: `js/main.js` (add `migrateLegacyTabKey` function, call from bootstrap)
- Modify: `tests/js/main/project-type-migration.test.js` (add migration tests)

- [ ] **Step 1: Write the failing migration tests**

Append to `tests/js/main/project-type-migration.test.js`:

```javascript
test('migrateLegacyTabKey: legacy tab "python" migrates to project-type "python"', () => {
  const { context, storage } = makeMainEnv({ storage: { 'fll-vr-tab': 'python' } });
  context.migrateLegacyTabKey();
  assert.strictEqual(storage.get('fll-vr-project-type'), 'python');
  assert.strictEqual(storage.has('fll-vr-tab'), false,
    'legacy TAB_KEY should be removed after migration');
});

test('migrateLegacyTabKey: legacy tab "blocks" migrates to project-type "blocks"', () => {
  const { context, storage } = makeMainEnv({ storage: { 'fll-vr-tab': 'blocks' } });
  context.migrateLegacyTabKey();
  assert.strictEqual(storage.get('fll-vr-project-type'), 'blocks');
  assert.strictEqual(storage.has('fll-vr-tab'), false);
});

test('migrateLegacyTabKey: no legacy tab, no project-type → writes default "blocks"', () => {
  const { context, storage } = makeMainEnv();
  context.migrateLegacyTabKey();
  assert.strictEqual(storage.get('fll-vr-project-type'), 'blocks');
});

test('migrateLegacyTabKey: project-type already set → does not overwrite or touch TAB_KEY', () => {
  const { context, storage } = makeMainEnv({
    storage: { 'fll-vr-project-type': 'python', 'fll-vr-tab': 'blocks' },
  });
  context.migrateLegacyTabKey();
  assert.strictEqual(storage.get('fll-vr-project-type'), 'python',
    'an existing project-type must win over legacy tab');
  assert.strictEqual(storage.get('fll-vr-tab'), 'blocks',
    'legacy TAB_KEY is only retired when we use it for migration');
});

test('migrateLegacyTabKey: unrecognised legacy tab value falls back to default', () => {
  const { context, storage } = makeMainEnv({ storage: { 'fll-vr-tab': 'garbage' } });
  context.migrateLegacyTabKey();
  assert.strictEqual(storage.get('fll-vr-project-type'), 'blocks');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:js -- --test-name-pattern=migrateLegacyTabKey`
Expected: FAIL with `context.migrateLegacyTabKey is not a function`.

- [ ] **Step 3: Add `migrateLegacyTabKey` to `js/main.js`**

Add after the `setProjectType` definition from Task 1:

```javascript
function migrateLegacyTabKey() {
  if (lsGet(PROJECT_TYPE_KEY)) return;          // already migrated
  const legacy = lsGet(TAB_KEY);
  const type = (legacy === 'python' || legacy === 'blocks') ? legacy : DEFAULT_PROJECT_TYPE;
  lsSet(PROJECT_TYPE_KEY, type);
  if (legacy !== null) lsRemove(TAB_KEY);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:js -- --test-name-pattern=migrateLegacyTabKey`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full suite**

Run: `npm run test:js`
Expected: PASS — no regressions.

- [ ] **Step 6: Commit**

```bash
git add js/main.js tests/js/main/project-type-migration.test.js
git commit -m "feat(project-type): migrate legacy fll-vr-tab to fll-vr-project-type on bootstrap"
```

---

## Task 3: Wire the migration into the DOMContentLoaded bootstrap and rename `applyStoredTab`

**Files:**
- Modify: `js/main.js:271-275` (`applyStoredTab`)
- Modify: `js/main.js:690-720` (DOMContentLoaded)
- Test: integration via existing run-pipeline tests + a new bootstrap-order assertion

- [ ] **Step 1: Write the failing bootstrap-order test**

Append to `tests/js/main/project-type-migration.test.js`:

```javascript
test('bootstrap: legacy tab "python" + DOMContentLoaded fires → project-type=python persisted', () => {
  const { storage, document: doc } = makeMainEnv({
    storage: { 'fll-vr-tab': 'python' },
    fireDOMContentLoaded: true,
  });
  assert.strictEqual(storage.get('fll-vr-project-type'), 'python');
  assert.strictEqual(storage.has('fll-vr-tab'), false);
});
```

> The new flag `fireDOMContentLoaded` is added in this task (see Step 3) so the mock can simulate the DOM-ready handler running.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:js -- --test-name-pattern=bootstrap`
Expected: FAIL — either `fireDOMContentLoaded` is unrecognised (and migration is never invoked) or the assertion fails because no migration call happens.

- [ ] **Step 3: Extend `makeMainEnv` to optionally fire DOMContentLoaded**

Edit `tests/js/mocks/main-env.js`. Replace the `document` block (lines 73-84) with one that captures listeners:

```javascript
const docListeners = {};
const document = {
  documentElement: documentEl,
  body: makeEl(),
  addEventListener: (evt, handler) => {
    (docListeners[evt] = docListeners[evt] || []).push(handler);
  },
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: (id) => {
    if (!(id in elementsById)) elementsById[id] = makeEl();
    return elementsById[id];
  },
  createElement: () => makeEl(),
};
```

Then, after `vm.runInContext(MAIN_CODE, ...)` (line 129) but before `return`, add:

```javascript
if (opts.fireDOMContentLoaded) {
  const handlers = docListeners['DOMContentLoaded'] || [];
  for (const h of handlers) { try { h(); } catch (e) { /* surfaced via test */ } }
}
```

And add `documentEl` to the return object:

```javascript
return { context, window, document, storage, elementsById, documentEl };
```

- [ ] **Step 4: Replace `applyStoredTab` with `applyStoredProjectType` in `js/main.js`**

Lines 271-275 currently:

```javascript
function applyStoredTab() {
  const stored = lsGet(TAB_KEY);
  const tab = (stored === 'python' || stored === 'blocks') ? stored : DEFAULT_TAB;
  switchMode(tab, { persist: false });
}
```

Replace with:

```javascript
function applyStoredProjectType() {
  switchMode(getProjectType(), { persist: false });
}
```

- [ ] **Step 5: Update `switchMode` to stop writing `TAB_KEY`**

Line 268 currently:

```javascript
if (!options || options.persist !== false) lsSet(TAB_KEY, m);
```

Replace with:

```javascript
if (!options || options.persist !== false) setProjectType(m);
```

`setProjectType` writes the new `PROJECT_TYPE_KEY`. `switchMode` is now the one writer that updates the persisted project type — load handlers (`llsp3_ui.js`) call `switchTab` which is `switchMode`, so opening a file still persists the new type. ✅

- [ ] **Step 6: Insert `migrateLegacyTabKey()` and rename call in DOMContentLoaded**

In `js/main.js:690-720`, change the body of the `DOMContentLoaded` handler. Find:

```javascript
  projectName = lsGet(NAME_KEY) || DEFAULT_NAME;
  dirty       = lsGet(DIRTY_KEY) === '1';
```

Insert before those two lines:

```javascript
  migrateLegacyTabKey();
```

And find:

```javascript
  applyStoredTab();
```

Replace with:

```javascript
  applyStoredProjectType();
```

- [ ] **Step 7: Run the tests**

Run: `npm run test:js`
Expected: PASS — the new bootstrap test passes, and the existing run-pipeline tests still pass (they don't fire DOMContentLoaded, so they aren't affected by the bootstrap reorder).

- [ ] **Step 8: Commit**

```bash
git add js/main.js tests/js/mocks/main-env.js tests/js/main/project-type-migration.test.js
git commit -m "feat(project-type): migrate legacy tab on DOMContentLoaded; rename applyStoredTab"
```

---

## Task 4: Make `handleNewProject(type)` per-type, drop the no-arg form

**Files:**
- Modify: `js/main.js:357-376`
- Test: `tests/js/main/new-project-dropdown.test.js` (new file)

- [ ] **Step 1: Write the failing tests for the per-type new-project behaviour**

Create `tests/js/main/new-project-dropdown.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMainEnv } = require('../mocks/main-env');

test('handleNewProject("python"): clears python buffer, sets project-type to python', () => {
  const { context, storage } = makeMainEnv({
    storage: {
      'fll-vr-python-code': 'old python\n',
      'fll-vr-blockly-xml': '<xml/>',
      'fll-vr-project-type': 'blocks',
    },
    confirm: true,
  });
  context.handleNewProject('python');
  assert.strictEqual(storage.has('fll-vr-python-code'), false,
    'python buffer must be cleared');
  assert.strictEqual(storage.get('fll-vr-blockly-xml'), '<xml/>',
    'blocks buffer must NOT be touched when creating a Python project');
  assert.strictEqual(storage.get('fll-vr-project-type'), 'python');
});

test('handleNewProject("blocks"): clears blocks buffer, sets project-type to blocks', () => {
  const { context, storage } = makeMainEnv({
    storage: {
      'fll-vr-python-code': 'old python\n',
      'fll-vr-blockly-xml': '<xml>stale</xml>',
      'fll-vr-project-type': 'python',
    },
    confirm: true,
  });
  context.handleNewProject('blocks');
  assert.strictEqual(storage.has('fll-vr-blockly-xml'), false);
  assert.strictEqual(storage.get('fll-vr-python-code'), 'old python\n',
    'python buffer must NOT be touched when creating a Blocks project');
  assert.strictEqual(storage.get('fll-vr-project-type'), 'blocks');
});

test('handleNewProject: resets project name to default', () => {
  const { context, storage } = makeMainEnv({
    storage: { 'fll-vr-project-name': 'My Robot' },
    confirm: true,
  });
  context.handleNewProject('python');
  assert.strictEqual(storage.get('fll-vr-project-name'), 'Untitled-Project');
});

test('handleNewProject: clears dirty flag', () => {
  const { context, storage } = makeMainEnv({
    storage: { 'fll-vr-dirty': '1' },
    confirm: true,
  });
  context.handleNewProject('python');
  assert.strictEqual(storage.has('fll-vr-dirty'), false);
});

test('handleNewProject: when dirty and user declines confirm → no-op', () => {
  const { context, storage } = makeMainEnv({
    storage: { 'fll-vr-dirty': '1', 'fll-vr-python-code': 'keep me\n' },
    confirm: false,
  });
  context.handleNewProject('python');
  assert.strictEqual(storage.get('fll-vr-python-code'), 'keep me\n',
    'declining the confirm must preserve the buffer');
  assert.strictEqual(storage.get('fll-vr-dirty'), '1');
});

test('handleNewProject: throws when called without a type', () => {
  const { context } = makeMainEnv({ confirm: true });
  assert.throws(() => context.handleNewProject(), /project type required/i);
});

test('handleNewProject: throws on unknown type', () => {
  const { context } = makeMainEnv({ confirm: true });
  assert.throws(() => context.handleNewProject('word-blocks'), /unknown project type/i);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:js -- --test-name-pattern=handleNewProject`
Expected: FAIL — current `handleNewProject` clears both buffers and doesn't take a type arg.

- [ ] **Step 3: Rewrite `handleNewProject` in `js/main.js:357-376`**

Replace the existing function with:

```javascript
// "New" — start a fresh project of the given type. Only the buffer for
// `type` is cleared; the other buffer is left alone (it belongs to a
// different project type and clearing it would surprise a user who flips
// between projects). Confirms first if there are unsaved changes.
function handleNewProject(type) {
  if (type === undefined) throw new Error('project type required');
  if (!VALID_PROJECT_TYPES.includes(type)) {
    throw new Error('unknown project type: ' + type);
  }
  if (isDirty()) {
    const ok = window.confirm('Discard the current project and start a new one?');
    if (!ok) return;
  }

  if (type === 'python') {
    if (editor) editor.setValue(DEFAULT_PYTHON_CODE);
    lsRemove(PYCODE_KEY);
  } else {
    if (blocklyWs && typeof Blockly !== 'undefined') blocklyWs.clear();
    lsRemove(BLOCKLY_KEY);
  }

  setProjectName(DEFAULT_NAME);
  const nameInput = document.getElementById('project-name');
  if (nameInput) nameInput.value = DEFAULT_NAME;
  setLoadedManifest(null);
  setDirty(false);

  switchMode(type);

  appendOutput(`[new] Started a fresh ${type === 'python' ? 'Python' : 'Blocks'} project.`, 'info');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:js -- --test-name-pattern=handleNewProject`
Expected: PASS (7 tests).

- [ ] **Step 5: Run the full suite**

Run: `npm run test:js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add js/main.js tests/js/main/new-project-dropdown.test.js
git commit -m "feat(project-type): handleNewProject(type) clears only the matching buffer"
```

---

## Task 5: Replace header tabs with a static project-type badge

**Files:**
- Modify: `index.html:57-60` (tab buttons → badge)
- Modify: `js/main.js:245-269` (`switchMode` updates badge)
- Modify: `js/main.js:700-701` (remove tab-button click handlers)
- Modify: `css/style.css` (add `.project-type-badge` rule)
- Modify: `tests/js/mocks/main-env.js` (seed badge element)
- Test: extend `new-project-dropdown.test.js`

- [ ] **Step 1: Write the failing test for the badge updating with project type**

Append to `tests/js/main/new-project-dropdown.test.js`:

```javascript
test('switchMode("python"): updates project-type-badge text and dataset', () => {
  const { context, elementsById } = makeMainEnv();
  context.switchMode('python', { persist: false });
  const badge = elementsById['project-type-badge'];
  assert.strictEqual(badge.dataset.type, 'python');
  assert.match(badge.textContent, /python/i);
});

test('switchMode("blocks"): updates project-type-badge text and dataset', () => {
  const { context, elementsById } = makeMainEnv();
  context.switchMode('blocks', { persist: false });
  const badge = elementsById['project-type-badge'];
  assert.strictEqual(badge.dataset.type, 'blocks');
  assert.match(badge.textContent, /blocks/i);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:js -- --test-name-pattern=project-type-badge`
Expected: FAIL — `switchMode` doesn't touch the badge yet.

- [ ] **Step 3: Replace tab buttons with the badge in `index.html`**

Lines 57-60 currently:

```html
<div class="tab-group">
  <button class="tab-btn active" id="tab-blocks">🧱 Blocks</button>
  <button class="tab-btn"        id="tab-python">🐍 Python</button>
</div>
```

Replace with:

```html
<div class="tab-group">
  <span class="project-type-badge" id="project-type-badge" data-type="blocks" aria-live="polite">🧱 Blocks project</span>
</div>
```

- [ ] **Step 4: Update `switchMode` in `js/main.js:245-269` to drive the badge**

Replace the body of `switchMode` with:

```javascript
function switchMode(mode, options) {
  const m = mode === 'blocks' ? 'blocks' : 'python';
  currentMode = m;
  const pyWrap = document.getElementById('py-editor-wrap');
  const blkDiv = document.getElementById('blockly-div');
  const badge  = document.getElementById('project-type-badge');

  if (m === 'python') {
    pyWrap.style.display = 'block';
    blkDiv.style.display = 'none';
    if (editor) editor.layout();
  } else {
    pyWrap.style.display = 'none';
    blkDiv.style.display = 'block';
    initBlocklyWorkspace();
    resizeBlocklyWorkspace();
  }

  if (badge) {
    badge.dataset.type = m;
    badge.textContent  = m === 'python' ? '🐍 Python project' : '🧱 Blocks project';
  }

  if (!options || options.persist !== false) setProjectType(m);
}
```

- [ ] **Step 5: Remove the tab-button click handlers in DOMContentLoaded**

Lines 700-701 currently:

```javascript
document.getElementById('tab-python').addEventListener('click', () => switchMode('python'));
document.getElementById('tab-blocks').addEventListener('click', () => switchMode('blocks'));
```

Delete both lines. Also remove the Blockly-failed fallback at lines 740-743 that touches `#tab-blocks`:

```javascript
if (typeof Blockly === 'undefined') {
  const blkTab = document.getElementById('tab-blocks');
  if (blkTab) { blkTab.style.opacity = '0.4'; blkTab.title = 'Blockly failed to load'; }
}
```

Replace with:

```javascript
if (typeof Blockly === 'undefined') {
  const badge = document.getElementById('project-type-badge');
  if (badge && getProjectType() === 'blocks') {
    badge.title = 'Blockly failed to load';
  }
}
```

- [ ] **Step 6: Add `.project-type-badge` rule to `css/style.css`**

Insert near the existing `.tab-btn` styles (search for `.tab-btn` in the file; place this rule directly after that block):

```css
.project-type-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  background: var(--surface2);
  color: var(--text-mid);
  font: 700 12px var(--font-ui);
  letter-spacing: 0.04em;
  border: 1px solid var(--border2);
  user-select: none;
}
.project-type-badge[data-type="python"] { color: var(--cyan); border-color: var(--cyan); }
.project-type-badge[data-type="blocks"] { color: var(--amber); border-color: var(--amber); }
```

> If `--cyan` / `--amber` aren't defined as CSS custom properties in this file, fall back to the literal colours used by the existing `.btn-settings:hover` rule. Check the `:root` block at the top of `css/style.css` before committing.

- [ ] **Step 7: Seed the badge in the test mock**

In `tests/js/mocks/main-env.js`, add to the `elementsById` block (lines 52-70):

```javascript
'project-type-badge': makeEl({ dataset: {} }),
```

(The `makeEl` default already provides a `dataset` object, but stating it explicitly clarifies intent.)

- [ ] **Step 8: Run tests**

Run: `npm run test:js`
Expected: PASS — including the two new badge tests.

- [ ] **Step 9: Manual smoke test**

Run: `python3 -m http.server 8787` and open `http://localhost:8787` in a browser.

Verify:
- Header shows a badge ("🧱 Blocks project" or "🐍 Python project"), not the two tab buttons.
- Existing localStorage with `fll-vr-tab=python` (set by hand in DevTools before reload) results in the Python editor showing and the badge reading "🐍 Python project". `localStorage.getItem('fll-vr-tab')` returns `null` after the reload.

Document the smoke result in the commit body if anything unexpected appears.

- [ ] **Step 10: Commit**

```bash
git add js/main.js index.html css/style.css tests/js/mocks/main-env.js tests/js/main/new-project-dropdown.test.js
git commit -m "feat(project-type): replace Blocks/Python tabs with static badge"
```

---

## Task 6: Add the New-button dropdown markup, CSS, and open/close script

**Files:**
- Modify: `index.html:49-55` (file-actions block) and the inline scripts section near line 318
- Modify: `css/style.css` (new `.new-menu*` rules)

- [ ] **Step 1: Replace the `#btn-new` element with a `.new-menu` container in `index.html`**

Line 52 currently:

```html
<button class="btn btn-icon-file" id="btn-new"  type="button" title="New project" aria-label="New project">📄</button>
```

Replace with:

```html
<div class="new-menu" id="new-menu">
  <button class="btn btn-icon-file" id="btn-new" type="button"
          aria-haspopup="true" aria-expanded="false"
          title="New project" aria-label="New project">📄<span class="new-menu-caret" aria-hidden="true">▾</span></button>
  <div class="new-menu-pop" id="new-menu-pop" role="menu" aria-labelledby="btn-new">
    <button class="new-menu-item" id="btn-new-python" role="menuitem" type="button">
      <span aria-hidden="true">🐍</span> New Python project
    </button>
    <button class="new-menu-item" id="btn-new-blocks" role="menuitem" type="button">
      <span aria-hidden="true">🧱</span> New Blocks project
    </button>
  </div>
</div>
```

- [ ] **Step 2: Add CSS for the menu in `css/style.css`**

Add directly after the `.settings-pop` block (search for `.settings-pop.open { display: block; }`, around line 2159):

```css
/* ── New-project split-button + popover menu ─────────────────────────────
   Modelled on .settings-pop. Floats below the New (📄) button, closes on
   outside-click and Escape, and offers explicit per-type project creation.
   The legacy single-click behaviour (clearing both buffers) is replaced
   by per-type clears in handleNewProject(type). */
.new-menu { position: relative; display: inline-flex; }

.new-menu-caret {
  display: inline-block;
  margin-left: 4px;
  font-size: 10px;
  opacity: 0.7;
}

.new-menu-pop {
  display: none;
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  min-width: 220px;
  background: var(--surface);
  border: 1px solid var(--border2);
  border-radius: 12px;
  padding: 6px;
  box-shadow: 0 24px 48px rgba(0,0,0,0.45), 0 4px 12px rgba(0,0,0,0.25);
  z-index: 60;
  animation: settings-pop-in 0.18s ease-out;
}
:root[data-theme="light"] .new-menu-pop {
  box-shadow: 0 20px 40px rgba(15,23,42,0.18), 0 4px 10px rgba(15,23,42,0.10);
}
.new-menu-pop.open { display: block; }

.new-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-radius: 8px;
  font: 600 13px var(--font-ui);
  color: var(--text-mid);
  text-align: left;
  cursor: pointer;
}
.new-menu-item:hover,
.new-menu-item:focus-visible {
  background: var(--surface2);
  color: var(--text);
  outline: none;
}
```

- [ ] **Step 3: Add the open/close inline script in `index.html`**

Right after the existing settings-popover IIFE (around line 340, after the closing `})();`), insert:

```html
<script>
// New-project menu — split button next to the file actions. Click 📄 to
// toggle the popover; click an item to dispatch handleNewProject(type)
// (wired from main.js). Outside-click and Escape close it, mirroring the
// settings popover behaviour right above this block.
(function () {
  const trigger = document.getElementById('btn-new');
  const pop     = document.getElementById('new-menu-pop');
  if (!trigger || !pop) return;
  function close() {
    pop.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
  }
  function open() {
    pop.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
  }
  trigger.addEventListener('click', e => {
    e.stopPropagation();
    pop.classList.contains('open') ? close() : open();
  });
  pop.addEventListener('click', e => {
    // Any click on an item closes the menu; the item's own listener (wired
    // in main.js) actually dispatches handleNewProject.
    if (e.target.closest('.new-menu-item')) close();
  });
  document.addEventListener('click', e => {
    if (!pop.contains(e.target) && e.target !== trigger && !trigger.contains(e.target)) close();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && pop.classList.contains('open')) close();
  });
})();
</script>
```

- [ ] **Step 4: Manual smoke test (no JS-side wiring yet — that's Task 7)**

Run: `python3 -m http.server 8787` and open the app.

Verify:
- Clicking 📄 opens a popover with two items, "🐍 New Python project" and "🧱 New Blocks project".
- Clicking outside or pressing Escape closes the popover.
- Clicking an item closes the popover (but does nothing useful yet — that's Task 7).
- `aria-expanded` flips between "true" and "false" on the 📄 button.

- [ ] **Step 5: Commit**

```bash
git add index.html css/style.css
git commit -m "feat(new-menu): add split-button dropdown markup, CSS, and open/close logic"
```

---

## Task 7: Wire the menu items to `handleNewProject(type)`

**Files:**
- Modify: `js/main.js:708-709` (DOMContentLoaded — replace the single `#btn-new` listener)
- Test: extend `tests/js/main/new-project-dropdown.test.js`

- [ ] **Step 1: Write the failing wiring test**

Append to `tests/js/main/new-project-dropdown.test.js`:

```javascript
test('DOMContentLoaded: btn-new-python click → handleNewProject("python")', () => {
  const handlers = {};
  const { context, document: doc, storage, elementsById } = makeMainEnv({
    storage: { 'fll-vr-python-code': 'old\n' },
    confirm: true,
    fireDOMContentLoaded: true,
  });
  // The mock element's addEventListener captures the handler so we can
  // invoke it directly — that's how main-env validates wiring.
  // Find the click handler the bootstrap attached to btn-new-python:
  const el = elementsById['btn-new-python'];
  assert.ok(el._clickHandler, 'bootstrap must register a click handler on btn-new-python');
  el._clickHandler();
  assert.strictEqual(storage.has('fll-vr-python-code'), false);
  assert.strictEqual(storage.get('fll-vr-project-type'), 'python');
});

test('DOMContentLoaded: btn-new-blocks click → handleNewProject("blocks")', () => {
  const { storage, elementsById } = makeMainEnv({
    storage: { 'fll-vr-blockly-xml': '<xml/>' },
    confirm: true,
    fireDOMContentLoaded: true,
  });
  const el = elementsById['btn-new-blocks'];
  assert.ok(el._clickHandler);
  el._clickHandler();
  assert.strictEqual(storage.has('fll-vr-blockly-xml'), false);
  assert.strictEqual(storage.get('fll-vr-project-type'), 'blocks');
});
```

- [ ] **Step 2: Extend `makeEl` in `tests/js/mocks/main-env.js` to capture click handlers**

Lines 13-37 — replace the `addEventListener` stub with one that records:

```javascript
function makeEl(initial) {
  const el = {
    style: {},
    dataset: {},
    classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
    children: [],
    appendChild(child) { this.children.push(child); },
    removeChild() {},
    addEventListener(evt, handler) {
      if (evt === 'click') this._clickHandler = handler;
      // Other events are dropped on the floor; tests that need them can
      // extend this later.
    },
    removeEventListener: () => {},
    setAttribute: () => {},
    getAttribute: () => null,
    click: () => {},
    focus: () => {},
    value: '',
    textContent: '',
    innerHTML: '',
    title: '',
    disabled: false,
    offsetWidth: 0,
    scrollHeight: 0,
    scrollTop: 0,
    _clickHandler: null,
  };
  return Object.assign(el, initial || {});
}
```

Also seed the two new elements in `elementsById` (around line 52):

```javascript
'btn-new-python':  makeEl(),
'btn-new-blocks':  makeEl(),
'new-menu-pop':    makeEl(),
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:js -- --test-name-pattern="btn-new-python|btn-new-blocks"`
Expected: FAIL — `bootstrap must register a click handler on btn-new-python` (handler not wired yet).

- [ ] **Step 4: Replace the `btn-new` wiring in `js/main.js`**

Lines 708-709 currently:

```javascript
const newBtn = document.getElementById('btn-new');
if (newBtn) newBtn.addEventListener('click', handleNewProject);
```

Replace with:

```javascript
const newPyBtn  = document.getElementById('btn-new-python');
const newBlkBtn = document.getElementById('btn-new-blocks');
if (newPyBtn)  newPyBtn.addEventListener('click', () => handleNewProject('python'));
if (newBlkBtn) newBlkBtn.addEventListener('click', () => handleNewProject('blocks'));
```

(The 📄 `btn-new` button still exists in markup, but its only job is now toggling the popover — that wiring lives in the inline script added in Task 6.)

- [ ] **Step 5: Run tests**

Run: `npm run test:js`
Expected: PASS — including both wiring tests.

- [ ] **Step 6: Manual smoke test**

`python3 -m http.server 8787`. In the browser:
- Click 📄 → popover opens. Click "🐍 New Python project" → editor switches to Python, badge updates to "🐍 Python project", the Python editor shows `DEFAULT_PYTHON_CODE`, and the project name input resets to "Untitled-Project".
- Click 📄 → click "🧱 New Blocks project" → Blockly view appears, badge updates, workspace is empty (default starter blocks may still appear via `DEFAULT_BLOCKLY_XML`).
- Type something into the Python editor (dirty=true), click 📄 → "🐍 New Python project" → a confirm dialog appears. Click Cancel → editor content preserved. Click OK → reset.

- [ ] **Step 7: Commit**

```bash
git add js/main.js tests/js/mocks/main-env.js tests/js/main/new-project-dropdown.test.js
git commit -m "feat(new-menu): wire menu items to handleNewProject(type)"
```

---

## Task 8: Sweep — remove `TAB_KEY` constant if no longer referenced, and DEFAULT_TAB

**Files:**
- Modify: `js/main.js:57, 65` (constant declarations)

- [ ] **Step 1: Verify `TAB_KEY` and `DEFAULT_TAB` have no remaining readers other than the migration function**

Run: `grep -n "TAB_KEY\|DEFAULT_TAB" js/main.js`
Expected output: references inside `migrateLegacyTabKey` and the constant declarations. No other call sites.

If anything else turns up, stop and address it before continuing — this task assumes the previous tasks fully removed the live readers.

- [ ] **Step 2: Inline the legacy key string into `migrateLegacyTabKey` and delete the constants**

In `js/main.js`, change `migrateLegacyTabKey`:

```javascript
function migrateLegacyTabKey() {
  if (lsGet(PROJECT_TYPE_KEY)) return;
  const legacy = lsGet('fll-vr-tab');   // legacy TAB_KEY, retired
  const type = (legacy === 'python' || legacy === 'blocks') ? legacy : DEFAULT_PROJECT_TYPE;
  lsSet(PROJECT_TYPE_KEY, type);
  if (legacy !== null) lsRemove('fll-vr-tab');
}
```

Then delete lines:

```javascript
const TAB_KEY     = 'fll-vr-tab';
```

and:

```javascript
const DEFAULT_TAB   = 'blocks';
```

- [ ] **Step 3: Run tests**

Run: `npm run test:js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add js/main.js
git commit -m "refactor: retire TAB_KEY and DEFAULT_TAB constants (only migration reads it)"
```

---

## Task 9: Final manual verification + CLAUDE.md note

**Files:**
- Modify: `CLAUDE.md` (add a constraint note for future-Claude)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — both `test:py` and `test:js` clean.

- [ ] **Step 2: Manual scenarios in browser (`python3 -m http.server 8787`)**

For each scenario, refresh the page with a clean localStorage (`localStorage.clear()` then reload) unless otherwise noted.

| # | Scenario | Expected |
|---|---|---|
| 1 | Fresh load, no localStorage | Badge says "🧱 Blocks project". Blockly view shown. `localStorage.fll-vr-project-type === 'blocks'`. |
| 2 | Set `localStorage.setItem('fll-vr-tab','python')` and reload | Badge says "🐍 Python project". Python view shown. `fll-vr-tab` is gone. `fll-vr-project-type === 'python'`. |
| 3 | Click 📄 → "🐍 New Python project" | Popover closes. Python view appears (regardless of prior state). DEFAULT_PYTHON_CODE in editor. Project name "Untitled-Project". |
| 4 | Click 📄 → "🧱 New Blocks project" | Popover closes. Blockly view appears, workspace cleared (apart from `DEFAULT_BLOCKLY_XML` starter if defined). |
| 5 | With unsaved Python edits, 📄 → "🧱 New Blocks project" | Confirm dialog appears. Cancel → Python edits preserved. OK → Blocks project created, Python buffer NOT cleared (`fll-vr-python-code` still in storage). |
| 6 | Open a Python `.llsp3` | Badge switches to "🐍 Python project", code loads, `fll-vr-project-type === 'python'`. |
| 7 | Open a Blocks `.llsp3` | Badge switches to "🧱 Blocks project", workspace loads, `fll-vr-project-type === 'blocks'`. |
| 8 | Escape closes popover | Open 📄 menu, press Escape → menu closes. |
| 9 | Outside-click closes popover | Open 📄 menu, click canvas → menu closes. |
| 10 | Save (Ctrl+S equivalent via 💾) after creating a Python project | Resulting `.llsp3` has `manifest.type === 'python'` and contains `projectbody.json`. |

If any scenario fails, fix before continuing.

- [ ] **Step 3: Add a CLAUDE.md constraint note**

Open `CLAUDE.md` and add to the **Constraints** section (before the **Field** heading):

```markdown
- **A project is single-mode (Python or Blocks), set at creation and never switched.** `localStorage.fll-vr-project-type` is the source of truth; `switchMode(mode)` is now a view-update + persist helper, not a user-facing toggle. Creating a Python project clears only `fll-vr-python-code`; creating a Blocks project clears only `fll-vr-blockly-xml`. The 📄 New button is a split-button dropdown wired in `index.html` (popover open/close) and `js/main.js` (item → `handleNewProject(type)`). Legacy `fll-vr-tab` is migrated once at bootstrap and then deleted.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): note per-project mode constraint and migration"
```

---

## Spec coverage check

| Requirement | Task |
|---|---|
| Per-project mode (no live toggle) | Tasks 1, 3, 5 |
| Dropdown menu from New button (not modal) | Task 6, 7 |
| Account for existing localStorage settings | Task 2, 3 (`migrateLegacyTabKey`), Task 4 (per-type buffer clears) |
| TDD: failing test → minimal impl → green → commit | Every task |
| Remove silent data-loss path (switch + save) | Task 5 (no tab clicks) + Task 4 (per-type clears) |
| Load auto-switches project type | Already works via `llsp3_ui.js` `hooks.switchTab` → `switchMode` → `setProjectType` (Task 3 step 5). |

## Risks & rollback

- **Risk:** Inline `<script>` IIFEs in `index.html` aren't covered by `node:test`. The popover open/close logic is browser-only and only smoke-tested manually. If it regresses, the user can still trigger `handleNewProject` via `window.handleNewProject('python')` in DevTools. Acceptable for this scope.
- **Risk:** The `_clickHandler` capture in `makeEl` is a single-handler-per-element approximation. If a future test attaches two click listeners to the same element this approach will be wrong. The mock should be promoted to an array of listeners at that point. Out of scope here.
- **Rollback:** `git revert` the Task 9 → Task 1 commits in reverse order. The migration commit (Task 2/3) is the only one that *modifies* user storage; reverting it leaves `fll-vr-project-type` populated with no reader, harmless.
