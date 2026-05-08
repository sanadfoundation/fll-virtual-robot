# `.llsp3` Load & Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bidirectional `.llsp3` round-trip for both Python and Word-Blocks editor modes, so files saved from the simulator open in the official LEGO Spike Prime app and vice versa.

**Architecture:** Six new browser-side modules under `js/llsp3_*.js`, each attached to a `window.LLSP3` namespace. The outer `.llsp3` is a JSZip-built ZIP. Python writes a one-key `projectbody.json`. Blocks writes a nested `scratch.sb3` (also JSZip) whose `project.json` is a structural translation of the live Blockly serialization JSON — possible without a per-block name table because the simulator's Blockly types are already named with Spike Scratch opcodes (`flippermotor_*`, `flippermove_*`, etc.). UI adds an inline project-name input plus Open/Save buttons grouped with the tab toggles.

**Tech Stack:** Vanilla JavaScript (no build step, no npm), JSZip 3.x from CDN, Blockly 10 (already loaded), Monaco (already loaded). Tests use Node's built-in `node:test` runner and `vm.runInContext`, matching the existing `tests/js/**/*.test.js` pattern. JSZip is vendored once into `tests/vendor/jszip.min.js` for the test path.

**Spec:** [docs/superpowers/specs/2026-05-07-llsp3-load-save-design.md](../specs/2026-05-07-llsp3-load-save-design.md)

---

## File map

**Create (modules):**
- `js/llsp3_assets.js` — Base64 constants for the default sb3 sound (`Cat Meow 1`) and empty-MD5 SVG costume.
- `js/llsp3_manifest.js` — Manifest defaults, validators, and merge-on-resave logic.
- `js/llsp3_python.js` — `projectbody.json` read/write helpers.
- `js/llsp3_blocks.js` — Shadow contract table + Blockly-serialization-JSON ⇄ sb3 `project.json` converter + sb3 envelope (Stage, Sprite, costumes/sounds, meta).
- `js/llsp3_io.js` — Outer `.llsp3` read/write; dispatches on `manifest.type`.
- `js/llsp3_ui.js` — Header button wiring, project-name input, dirty flag, error rendering.

**Create (test fixtures + harness):**
- `tests/fixtures/llsp3/python-project.llsp3` — Real Spike-app sample (copied from `~/Downloads/Python Project.llsp3`).
- `tests/fixtures/llsp3/block-project.llsp3` — Real Spike-app sample (copied from `~/Downloads/Block Project.llsp3`).
- `tests/vendor/jszip.min.js` — Vendored JSZip 3.10.1 for Node test path.
- `tests/js/mocks/llsp3-env.js` — vm-context loader for the llsp3 modules.
- `tests/js/llsp3/manifest.test.js`
- `tests/js/llsp3/python.test.js`
- `tests/js/llsp3/blocks-converter.test.js`
- `tests/js/llsp3/blocks-envelope.test.js`
- `tests/js/llsp3/io.test.js`
- `tests/js/llsp3/round-trip.test.js`

**Modify:**
- `index.html` — JSZip CDN tag; project-name input + Open/Save buttons in header; new module `<script>` tags.
- `css/style.css` — Style for project-name input and `.btn-file` class.
- `js/main.js` — Wire Open/Save handlers, dirty flag tracking, project-name persistence, post-load tab switching.

---

## Module conventions

Every new `js/llsp3_*.js` module follows this pattern (matches existing `js/blockly_config.js`, `js/monaco_config.js`):

```js
'use strict';
(function (global) {
  const LLSP3 = (global.LLSP3 = global.LLSP3 || {});

  // ... module functions ...

  LLSP3.<module> = { /* exported API */ };
})(typeof window !== 'undefined' ? window : globalThis);
```

Tests load these via `vm.runInContext(fs.readFileSync(...), ctx)` and access through `ctx.LLSP3.<module>`.

**Localstorage keys** (additions):
- `fll-vr-project-name` — current project name; default `'Untitled'`.
- `fll-vr-dirty` — `'1'` if there are unsaved changes; absent otherwise.

---

## Phase 0 — Setup

### Task 0.1: Vendor JSZip and copy real fixtures

Establish the test fixtures and the JSZip dependency before any code is written. No tests yet — purely setup.

**Files:**
- Create: `tests/fixtures/llsp3/python-project.llsp3`
- Create: `tests/fixtures/llsp3/block-project.llsp3`
- Create: `tests/vendor/jszip.min.js`

- [ ] **Step 1: Create the fixture directory and copy the real samples**

```bash
mkdir -p tests/fixtures/llsp3 tests/vendor
cp "$HOME/Downloads/Python Project.llsp3" tests/fixtures/llsp3/python-project.llsp3
cp "$HOME/Downloads/Block Project.llsp3"  tests/fixtures/llsp3/block-project.llsp3
```

Expected: Both files copied. Verify with `ls -la tests/fixtures/llsp3/`.

- [ ] **Step 2: Vendor JSZip 3.10.1 for the Node test path**

```bash
curl -fsSL https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js \
  -o tests/vendor/jszip.min.js
```

Expected: ~95 KB file at `tests/vendor/jszip.min.js`. Verify with `wc -c tests/vendor/jszip.min.js` (should be ~95000).

- [ ] **Step 3: Verify JSZip loads in Node**

Create and run a one-liner sanity test:

```bash
node -e "
  const vm = require('vm');
  const fs = require('fs');
  const ctx = { setTimeout, setImmediate, clearTimeout, clearImmediate, console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('tests/vendor/jszip.min.js', 'utf8'), ctx);
  console.log('JSZip loaded:', typeof ctx.JSZip);
"
```

Expected: `JSZip loaded: function`. If anything else, JSZip didn't load — re-download.

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/llsp3/ tests/vendor/jszip.min.js
git commit -m "test(llsp3): vendor JSZip and check in real Spike-app fixtures"
```

---

### Task 0.2: Wire up the test environment helper

Create the vm-context loader the rest of the test files will use. No production code changes yet.

**Files:**
- Create: `tests/js/mocks/llsp3-env.js`

- [ ] **Step 1: Write the helper**

```js
// tests/js/mocks/llsp3-env.js
'use strict';

// Loads JSZip + the requested LLSP3 modules into a vm sandbox. Returns the
// context so tests can drive `ctx.LLSP3.<module>` and `ctx.JSZip` directly.
//
// Usage:
//   const { ctx } = makeLlsp3Env(['llsp3_assets', 'llsp3_manifest']);
//   await ctx.LLSP3.manifest.read(buffer);

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function loadInto(ctx, relPath) {
  const code = fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
  vm.runInContext(code, ctx, { filename: relPath });
}

function makeLlsp3Env(modules = []) {
  const ctx = {
    console,
    setTimeout, clearTimeout, setImmediate, clearImmediate,
    Buffer,
    URL, TextEncoder, TextDecoder,
  };
  vm.createContext(ctx);

  // JSZip first; LLSP3 modules depend on it.
  loadInto(ctx, 'tests/vendor/jszip.min.js');

  for (const mod of modules) {
    loadInto(ctx, `js/${mod}.js`);
  }

  return { ctx };
}

module.exports = { makeLlsp3Env, REPO_ROOT };
```

- [ ] **Step 2: Sanity test**

```bash
node -e "
  const { makeLlsp3Env } = require('./tests/js/mocks/llsp3-env');
  const { ctx } = makeLlsp3Env([]);
  console.log('JSZip via helper:', typeof ctx.JSZip);
"
```

Expected: `JSZip via helper: function`.

- [ ] **Step 3: Commit**

```bash
git add tests/js/mocks/llsp3-env.js
git commit -m "test(llsp3): add makeLlsp3Env vm-context loader"
```

---

### Task 0.3: Add JSZip CDN to the page

Make JSZip available to the browser. No new modules yet, so the CDN tag sits idle until the next phase wires it up.

**Files:**
- Modify: `index.html:13` (add after the Blockly script tags, before Monaco)

- [ ] **Step 1: Add the script tag**

After the Blockly `javascript_compressed.js` line, add:

```html
  <!-- JSZip (for .llsp3 read/write) -->
  <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
```

- [ ] **Step 2: Verify in a browser**

Run `python3 -m http.server 8787`, open `http://localhost:8787`, open DevTools console, type `typeof JSZip`.

Expected: `"function"`.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(llsp3): load JSZip from CDN"
```

---

## Phase 1 — Manifest module

### Task 1.1: Manifest defaults and writer

Generate a fresh manifest from project metadata. Pure-data; no I/O.

**Files:**
- Create: `js/llsp3_manifest.js`
- Create: `tests/js/llsp3/manifest.test.js`

- [ ] **Step 1: Write the failing test for `defaultManifest('python', ...)`**

```js
// tests/js/llsp3/manifest.test.js
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeLlsp3Env } = require('../mocks/llsp3-env');

function freshEnv() {
  return makeLlsp3Env(['llsp3_manifest']).ctx;
}

test('defaultManifest("python"): produces a Python-type manifest with required fields', () => {
  const ctx = freshEnv();
  const m = ctx.LLSP3.manifest.defaultManifest('python', { name: 'My Project' });

  assert.strictEqual(m.type, 'python');
  assert.strictEqual(m.appType, 'llsp3');
  assert.strictEqual(m.name, 'My Project');
  assert.strictEqual(m.autoDelete, false);
  assert.strictEqual(m.size, 0);
  assert.strictEqual(m.slotIndex, 0);
  assert.strictEqual(m.zoomLevel, 0.5);
  assert.strictEqual(m.lastConnectedHubType, 'flipper');
  assert.deepStrictEqual(m.extraFiles, []);
  assert.match(m.id, /^[A-Za-z0-9_-]{12}$/);
  assert.match(m.created, /^\d{4}-\d{2}-\d{2}T/);
  assert.strictEqual(m.created, m.lastsaved);
});
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
node --test tests/js/llsp3/manifest.test.js
```

Expected: ENOENT for `js/llsp3_manifest.js`.

- [ ] **Step 3: Create `js/llsp3_manifest.js` with `defaultManifest`**

```js
// js/llsp3_manifest.js
'use strict';
(function (global) {
  const LLSP3 = (global.LLSP3 = global.LLSP3 || {});

  const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

  function genId() {
    let id = '';
    for (let i = 0; i < 12; i++) {
      id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
    }
    return id;
  }

  function defaultManifest(type, opts = {}) {
    const now = new Date().toISOString();
    const name = opts.name || 'Untitled';
    const id = opts.id || genId();

    if (type === 'python') {
      return {
        type: 'python',
        appType: 'llsp3',
        autoDelete: false,
        created: now,
        id,
        lastsaved: now,
        size: 0,
        name,
        slotIndex: 0,
        workspaceX: -155,
        workspaceY: 0,
        zoomLevel: 0.5,
        hardware: { python: { type: 'flipper' } },
        state: { canvasDrawerOpen: true, hasMonitors: false, playMode: 'download' },
        extraFiles: [],
        lastConnectedHubType: 'flipper',
      };
    }
    if (type === 'word-blocks') {
      return {
        type: 'word-blocks',
        autoDelete: false,
        created: now,
        id,
        lastsaved: now,
        size: 0,
        name,
        slotIndex: 0,
        workspaceX: 0,
        workspaceY: 0,
        zoomLevel: 0.675,
        showAllBlocks: false,
        version: 38,
        hardware: { flipper: { type: 'flipper' } },
        extensions: [],
        state: { playMode: 'download', canvasDrawerOpen: false },
        extraFiles: [],
      };
    }
    throw new Error(`Unknown manifest type: ${type}`);
  }

  LLSP3.manifest = { defaultManifest, genId };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run the test, confirm it passes**

```bash
node --test tests/js/llsp3/manifest.test.js
```

Expected: `pass 1`.

- [ ] **Step 5: Add Word-Blocks default test**

Append to `tests/js/llsp3/manifest.test.js`:

```js
test('defaultManifest("word-blocks"): produces a word-blocks manifest with required fields', () => {
  const ctx = freshEnv();
  const m = ctx.LLSP3.manifest.defaultManifest('word-blocks', { name: 'Blocks demo' });

  assert.strictEqual(m.type, 'word-blocks');
  assert.strictEqual(m.appType, undefined);
  assert.strictEqual(m.name, 'Blocks demo');
  assert.strictEqual(m.version, 38);
  assert.strictEqual(m.showAllBlocks, false);
  assert.deepStrictEqual(m.extensions, []);
  assert.strictEqual(m.lastConnectedHubType, undefined);
});

test('defaultManifest: rejects unknown types', () => {
  const ctx = freshEnv();
  assert.throws(() => ctx.LLSP3.manifest.defaultManifest('icon-blocks', {}),
    /Unknown manifest type/);
});
```

- [ ] **Step 6: Run, confirm all pass**

```bash
node --test tests/js/llsp3/manifest.test.js
```

Expected: `pass 3`.

- [ ] **Step 7: Commit**

```bash
git add js/llsp3_manifest.js tests/js/llsp3/manifest.test.js
git commit -m "feat(llsp3): manifest defaults for python and word-blocks"
```

---

### Task 1.2: Manifest merge-on-resave

When the user re-saves a file they previously loaded, preserve fields we don't know about. Update only what we own.

**Files:**
- Modify: `js/llsp3_manifest.js`
- Modify: `tests/js/llsp3/manifest.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/js/llsp3/manifest.test.js`:

```js
test('mergeForSave: preserves unknown fields from the loaded manifest', () => {
  const ctx = freshEnv();
  const loaded = {
    type: 'python',
    appType: 'llsp3',
    name: 'Old name',
    id: 'preservedid12',
    created: '2025-01-01T00:00:00.000Z',
    lastsaved: '2025-01-01T00:00:00.000Z',
    autoDelete: false,
    size: 0,
    slotIndex: 2,
    workspaceX: -155, workspaceY: 0, zoomLevel: 0.5,
    hardware: { python: { name: 'My Hub', type: 'flipper', connectionState: 2 } },
    state: { canvasDrawerOpen: true, hasMonitors: false, playMode: 'download', knowledgeBaseSection: 'spm-help' },
    extraFiles: [],
    lastConnectedHubType: 'flipper',
    futureField: 'preserve-me',
  };

  const merged = ctx.LLSP3.manifest.mergeForSave(loaded, { name: 'New name' });

  assert.strictEqual(merged.name, 'New name');                          // overridden
  assert.strictEqual(merged.id, 'preservedid12');                       // preserved
  assert.strictEqual(merged.created, '2025-01-01T00:00:00.000Z');       // preserved
  assert.notStrictEqual(merged.lastsaved, '2025-01-01T00:00:00.000Z');  // bumped
  assert.match(merged.lastsaved, /^\d{4}-\d{2}-\d{2}T/);
  assert.strictEqual(merged.slotIndex, 2);                              // preserved
  assert.deepStrictEqual(merged.hardware, loaded.hardware);             // preserved
  assert.deepStrictEqual(merged.state, loaded.state);                   // preserved
  assert.strictEqual(merged.futureField, 'preserve-me');                // preserved
});

test('mergeForSave: word-blocks updates extensions when given', () => {
  const ctx = freshEnv();
  const loaded = ctx.LLSP3.manifest.defaultManifest('word-blocks', { name: 'X' });
  const merged = ctx.LLSP3.manifest.mergeForSave(loaded, {
    name: 'Y',
    extensions: ['flipperevents', 'flippermove'],
  });
  assert.strictEqual(merged.name, 'Y');
  assert.deepStrictEqual(merged.extensions, ['flipperevents', 'flippermove']);
});
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
node --test tests/js/llsp3/manifest.test.js
```

Expected: `mergeForSave is not a function`.

- [ ] **Step 3: Add `mergeForSave` to `js/llsp3_manifest.js`**

After the closing brace of `defaultManifest`, before the `LLSP3.manifest = ...` line, add:

```js
  function mergeForSave(loaded, opts = {}) {
    const merged = { ...loaded };
    if (opts.name !== undefined)       merged.name = opts.name;
    if (opts.extensions !== undefined) merged.extensions = opts.extensions.slice();
    if (opts.workspaceX !== undefined) merged.workspaceX = opts.workspaceX;
    if (opts.workspaceY !== undefined) merged.workspaceY = opts.workspaceY;
    if (opts.zoomLevel !== undefined)  merged.zoomLevel = opts.zoomLevel;
    merged.lastsaved = new Date().toISOString();
    return merged;
  }
```

And update the export line:

```js
  LLSP3.manifest = { defaultManifest, genId, mergeForSave };
```

- [ ] **Step 4: Run, confirm passes**

```bash
node --test tests/js/llsp3/manifest.test.js
```

Expected: `pass 5`.

- [ ] **Step 5: Commit**

```bash
git add js/llsp3_manifest.js tests/js/llsp3/manifest.test.js
git commit -m "feat(llsp3): merge-on-resave preserves unknown manifest fields"
```

---

## Phase 2 — Python projectbody module

### Task 2.1: Python projectbody read/write

Wrap and unwrap `{"main": "<source>"}`. Trivial in code; the tests pin down round-trip preservation including Unicode and trailing newlines.

**Files:**
- Create: `js/llsp3_python.js`
- Create: `tests/js/llsp3/python.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/js/llsp3/python.test.js
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeLlsp3Env } = require('../mocks/llsp3-env');

function freshEnv() {
  return makeLlsp3Env(['llsp3_python']).ctx;
}

test('writeProjectBody: wraps source as {"main": "..."}', () => {
  const ctx = freshEnv();
  const out = ctx.LLSP3.python.writeProjectBody('print("hi")\n');
  assert.strictEqual(typeof out, 'string');
  assert.deepStrictEqual(JSON.parse(out), { main: 'print("hi")\n' });
});

test('readProjectBody: extracts the main source string', () => {
  const ctx = freshEnv();
  const code = ctx.LLSP3.python.readProjectBody('{"main":"x = 1\\n"}');
  assert.strictEqual(code, 'x = 1\n');
});

test('readProjectBody: round-trip preserves Unicode and trailing newlines', () => {
  const ctx = freshEnv();
  const original = '# café\nprint("π ≈ 3.14")\n\n\n';
  const round = ctx.LLSP3.python.readProjectBody(
    ctx.LLSP3.python.writeProjectBody(original)
  );
  assert.strictEqual(round, original);
});

test('readProjectBody: rejects payloads missing the main key', () => {
  const ctx = freshEnv();
  assert.throws(() => ctx.LLSP3.python.readProjectBody('{}'),
    /missing required key "main"/);
});

test('readProjectBody: rejects non-JSON', () => {
  const ctx = freshEnv();
  assert.throws(() => ctx.LLSP3.python.readProjectBody('not json'),
    /projectbody\.json/i);
});
```

- [ ] **Step 2: Run, confirm it fails**

```bash
node --test tests/js/llsp3/python.test.js
```

Expected: ENOENT for `js/llsp3_python.js`.

- [ ] **Step 3: Create `js/llsp3_python.js`**

```js
// js/llsp3_python.js
'use strict';
(function (global) {
  const LLSP3 = (global.LLSP3 = global.LLSP3 || {});

  function writeProjectBody(source) {
    return JSON.stringify({ main: String(source) });
  }

  function readProjectBody(text) {
    let obj;
    try {
      obj = JSON.parse(text);
    } catch (e) {
      throw new Error(`projectbody.json is not valid JSON: ${e.message}`);
    }
    if (!obj || typeof obj.main !== 'string') {
      throw new Error('projectbody.json missing required key "main"');
    }
    return obj.main;
  }

  LLSP3.python = { writeProjectBody, readProjectBody };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run, confirm all 5 pass**

```bash
node --test tests/js/llsp3/python.test.js
```

Expected: `pass 5`.

- [ ] **Step 5: Commit**

```bash
git add js/llsp3_python.js tests/js/llsp3/python.test.js
git commit -m "feat(llsp3): python projectbody read/write"
```

---

## Phase 3 — Outer ZIP I/O for Python

### Task 3.1: Outer-ZIP read with type dispatch

Read a `.llsp3` ArrayBuffer, return `{ type, manifest, content }` where `content` is a string for Python or an ArrayBuffer (the inner sb3) for Word-Blocks.

**Files:**
- Create: `js/llsp3_io.js`
- Create: `tests/js/llsp3/io.test.js`

- [ ] **Step 1: Write the failing test using the real Python fixture**

```js
// tests/js/llsp3/io.test.js
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('fs');
const path   = require('path');
const { makeLlsp3Env, REPO_ROOT } = require('../mocks/llsp3-env');

function freshEnv() {
  return makeLlsp3Env([
    'llsp3_assets',     // empty placeholder for now; created in Phase 4
    'llsp3_manifest',
    'llsp3_python',
    'llsp3_io',
  ]).ctx;
}

const PYTHON_FIXTURE = fs.readFileSync(
  path.join(REPO_ROOT, 'tests/fixtures/llsp3/python-project.llsp3')
);

test('read: dispatches a Python .llsp3 to type=python with main source', async () => {
  const ctx = freshEnv();
  const result = await ctx.LLSP3.io.read(PYTHON_FIXTURE);

  assert.strictEqual(result.type, 'python');
  assert.strictEqual(result.manifest.type, 'python');
  assert.strictEqual(typeof result.manifest.name, 'string');
  assert.strictEqual(typeof result.python, 'string');
  assert.match(result.python, /async def main/);
});
```

Note: this test references `llsp3_assets`, which doesn't exist yet. Create a stub now so loaders don't error:

- [ ] **Step 2: Create the assets stub (filled in Phase 4)**

```js
// js/llsp3_assets.js
'use strict';
(function (global) {
  const LLSP3 = (global.LLSP3 = global.LLSP3 || {});
  LLSP3.assets = {
    SOUND_CAT_MEOW_1_BASE64: '',
    EMPTY_SVG: '',
  };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 3: Run the test, confirm it fails**

```bash
node --test tests/js/llsp3/io.test.js
```

Expected: ENOENT for `js/llsp3_io.js`.

- [ ] **Step 4: Create `js/llsp3_io.js` with the read path**

```js
// js/llsp3_io.js
'use strict';
(function (global) {
  const LLSP3 = (global.LLSP3 = global.LLSP3 || {});
  const JSZip = global.JSZip;
  if (!JSZip) throw new Error('llsp3_io requires JSZip to be loaded first');

  async function read(arrayBufferOrUint8) {
    const zip = await JSZip.loadAsync(arrayBufferOrUint8);
    const manifestEntry = zip.file('manifest.json');
    if (!manifestEntry) throw new Error('Not an .llsp3: missing manifest.json');

    const manifestText = await manifestEntry.async('string');
    let manifest;
    try { manifest = JSON.parse(manifestText); }
    catch (e) { throw new Error(`manifest.json is not valid JSON: ${e.message}`); }

    if (manifest.type === 'python') {
      const bodyEntry = zip.file('projectbody.json');
      if (!bodyEntry) throw new Error('Python .llsp3 missing projectbody.json');
      const bodyText = await bodyEntry.async('string');
      const code = LLSP3.python.readProjectBody(bodyText);
      return { type: 'python', manifest, python: code };
    }
    if (manifest.type === 'word-blocks') {
      const sb3Entry = zip.file('scratch.sb3');
      if (!sb3Entry) throw new Error('Word-Blocks .llsp3 missing scratch.sb3');
      const sb3Buffer = await sb3Entry.async('uint8array');
      return { type: 'word-blocks', manifest, sb3: sb3Buffer };
    }
    throw new Error(`Unsupported .llsp3 type: ${manifest.type}`);
  }

  LLSP3.io = { read };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 5: Run, confirm passes**

```bash
node --test tests/js/llsp3/io.test.js
```

Expected: `pass 1`.

- [ ] **Step 6: Commit**

```bash
git add js/llsp3_io.js js/llsp3_assets.js tests/js/llsp3/io.test.js
git commit -m "feat(llsp3): outer-zip read with type dispatch (python path)"
```

---

### Task 3.2: Outer-ZIP write for Python

Build a `.llsp3` from `{ type: 'python', manifest, code }`. Verifies by reading back through Task 3.1's `read` (round-trip).

**Files:**
- Modify: `js/llsp3_io.js`
- Modify: `tests/js/llsp3/io.test.js`

- [ ] **Step 1: Write the failing round-trip test**

Append to `tests/js/llsp3/io.test.js`:

```js
test('write+read round-trip for a fresh Python project', async () => {
  const ctx = freshEnv();
  const manifest = ctx.LLSP3.manifest.defaultManifest('python', { name: 'rt' });
  const original = '# round trip\nprint(1 + 1)\n';

  const blob = await ctx.LLSP3.io.write({ type: 'python', manifest, python: original });
  const back = await ctx.LLSP3.io.read(blob);

  assert.strictEqual(back.type, 'python');
  assert.strictEqual(back.python, original);
  assert.strictEqual(back.manifest.name, 'rt');
  assert.strictEqual(back.manifest.id, manifest.id);  // id preserved
});

test('write: a Python .llsp3 contains exactly manifest.json, projectbody.json, icon.svg', async () => {
  const ctx = freshEnv();
  const manifest = ctx.LLSP3.manifest.defaultManifest('python', { name: 'q' });
  const blob = await ctx.LLSP3.io.write({ type: 'python', manifest, python: 'pass\n' });
  const zip = await ctx.JSZip.loadAsync(blob);
  const names = Object.keys(zip.files).sort();
  assert.deepStrictEqual(names, ['icon.svg', 'manifest.json', 'projectbody.json']);
});
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
node --test tests/js/llsp3/io.test.js
```

Expected: `write is not a function`.

- [ ] **Step 3: Add `write` to `js/llsp3_io.js`**

Inside the IIFE, before `LLSP3.io = { read }`:

```js
  const PYTHON_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">` +
    `<rect width="96" height="96" rx="12" fill="#3b82f6"/>` +
    `<text x="48" y="58" text-anchor="middle" font-family="monospace" font-size="32" fill="#fff">Py</text>` +
    `</svg>`;

  const BLOCKS_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">` +
    `<rect width="96" height="96" rx="12" fill="#fbbf24"/>` +
    `<text x="48" y="58" text-anchor="middle" font-family="monospace" font-size="32" fill="#1f2937">Bl</text>` +
    `</svg>`;

  async function write(project) {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(project.manifest));

    if (project.type === 'python') {
      zip.file('projectbody.json', LLSP3.python.writeProjectBody(project.python));
      zip.file('icon.svg', PYTHON_ICON_SVG);
    } else if (project.type === 'word-blocks') {
      if (!project.sb3) throw new Error('write: word-blocks project requires sb3 bytes');
      zip.file('scratch.sb3', project.sb3);
      zip.file('icon.svg', BLOCKS_ICON_SVG);
    } else {
      throw new Error(`write: unsupported project type ${project.type}`);
    }

    return await zip.generateAsync({ type: 'uint8array' });
  }
```

Update the export:

```js
  LLSP3.io = { read, write };
```

- [ ] **Step 4: Run, confirm all 3 io tests pass**

```bash
node --test tests/js/llsp3/io.test.js
```

Expected: `pass 3`.

- [ ] **Step 5: Commit**

```bash
git add js/llsp3_io.js tests/js/llsp3/io.test.js
git commit -m "feat(llsp3): outer-zip write + python round-trip"
```

---

### Task 3.3: Real Python fixture round-trip

Confirm the real Spike-app Python fixture round-trips through our reader and writer with byte-identical source code.

**Files:**
- Create: `tests/js/llsp3/round-trip.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/js/llsp3/round-trip.test.js
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('fs');
const path   = require('path');
const { makeLlsp3Env, REPO_ROOT } = require('../mocks/llsp3-env');

function env() {
  return makeLlsp3Env([
    'llsp3_assets', 'llsp3_manifest', 'llsp3_python', 'llsp3_io',
  ]).ctx;
}

const PY_FIXTURE = fs.readFileSync(
  path.join(REPO_ROOT, 'tests/fixtures/llsp3/python-project.llsp3')
);

test('round-trip: real Spike-app Python fixture preserves main source byte-for-byte', async () => {
  const ctx = env();
  const loaded = await ctx.LLSP3.io.read(PY_FIXTURE);
  assert.strictEqual(loaded.type, 'python');

  const merged = ctx.LLSP3.manifest.mergeForSave(loaded.manifest, { name: loaded.manifest.name });
  const rewritten = await ctx.LLSP3.io.write({
    type: 'python',
    manifest: merged,
    python: loaded.python,
  });

  const back = await ctx.LLSP3.io.read(rewritten);
  assert.strictEqual(back.python, loaded.python);
  assert.strictEqual(back.manifest.id, loaded.manifest.id);
  assert.strictEqual(back.manifest.created, loaded.manifest.created);
  // lastsaved is updated; everything else preserved
  assert.notStrictEqual(back.manifest.lastsaved, loaded.manifest.lastsaved);
});
```

- [ ] **Step 2: Run, confirm it passes**

```bash
node --test tests/js/llsp3/round-trip.test.js
```

Expected: `pass 1`. (If it fails, the issue is in Phase 1–3 code; debug before proceeding.)

- [ ] **Step 3: Commit**

```bash
git add tests/js/llsp3/round-trip.test.js
git commit -m "test(llsp3): real Python fixture survives round-trip byte-for-byte"
```

---

## Phase 4 — sb3 envelope assets

### Task 4.1: Vendor the default sb3 sound and costume

The Spike app's `scratch.sb3` always contains:
- `1b8b032b06360a6cf7c31d86bddd144b.wav` — Cat Meow 1, ~14 KB
- `d41d8cd98f00b204e9800998ecf8427e.svg` — empty-string-MD5 placeholder costume (zero bytes)

Extract these from the real fixture and embed them as Base64 in `js/llsp3_assets.js`.

**Files:**
- Modify: `js/llsp3_assets.js`
- Create: `tests/js/llsp3/blocks-envelope.test.js`

- [ ] **Step 1: Extract the Cat Meow WAV as Base64**

```bash
unzip -p tests/fixtures/llsp3/block-project.llsp3 scratch.sb3 \
  | bsdtar -xOf - 1b8b032b06360a6cf7c31d86bddd144b.wav \
  | base64 > /tmp/catmeow.b64
wc -c /tmp/catmeow.b64
```

Expected: roughly 19500 bytes of base64 (the wav is ~14680 bytes raw).

If `bsdtar` isn't available:

```bash
# alternative: extract the inner sb3 first
mkdir -p /tmp/sb3-extract
unzip -p tests/fixtures/llsp3/block-project.llsp3 scratch.sb3 > /tmp/sb3-extract/scratch.sb3
unzip -p /tmp/sb3-extract/scratch.sb3 1b8b032b06360a6cf7c31d86bddd144b.wav | base64 > /tmp/catmeow.b64
```

- [ ] **Step 2: Replace the stub assets with real values**

```bash
CATMEOW=$(tr -d '\n' < /tmp/catmeow.b64)
cat > js/llsp3_assets.js <<JS
// js/llsp3_assets.js
// Default sb3 assets bundled with every Word-Blocks .llsp3 the Spike app emits.
// We ship them verbatim so simulator-saved .llsp3 files match the official format.
'use strict';
(function (global) {
  const LLSP3 = (global.LLSP3 = global.LLSP3 || {});

  // Cat Meow 1 — every fresh Spike-app sb3 includes this sound asset.
  // Filename: 1b8b032b06360a6cf7c31d86bddd144b.wav (md5 of the wav bytes)
  const SOUND_CAT_MEOW_1_BASE64 = '${CATMEOW}';

  // The placeholder costume is the empty string itself. Its md5 (the zero-byte
  // checksum) is d41d8cd98f00b204e9800998ecf8427e. We write zero bytes.
  const EMPTY_SVG = '';

  function base64ToUint8(b64) {
    if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(b64, 'base64'));
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  LLSP3.assets = {
    SOUND_CAT_MEOW_1_BASE64,
    SOUND_CAT_MEOW_1_FILENAME: '1b8b032b06360a6cf7c31d86bddd144b.wav',
    EMPTY_SVG,
    EMPTY_SVG_FILENAME: 'd41d8cd98f00b204e9800998ecf8427e.svg',
    base64ToUint8,
  };
})(typeof window !== 'undefined' ? window : globalThis);
JS
```

(The HEREDOC will inline the base64 string as a single literal. Verify the file looks sane after — it'll be large.)

- [ ] **Step 3: Write a sanity test**

```js
// tests/js/llsp3/blocks-envelope.test.js
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { makeLlsp3Env } = require('../mocks/llsp3-env');

function env() {
  return makeLlsp3Env(['llsp3_assets']).ctx;
}

test('Cat Meow 1 base64 decodes to the expected MD5', () => {
  const ctx = env();
  const bytes = ctx.LLSP3.assets.base64ToUint8(ctx.LLSP3.assets.SOUND_CAT_MEOW_1_BASE64);
  const md5 = crypto.createHash('md5').update(bytes).digest('hex');
  assert.strictEqual(md5, '1b8b032b06360a6cf7c31d86bddd144b');
});

test('EMPTY_SVG is the zero-byte placeholder', () => {
  const ctx = env();
  assert.strictEqual(ctx.LLSP3.assets.EMPTY_SVG, '');
});
```

- [ ] **Step 4: Run, confirm passes**

```bash
node --test tests/js/llsp3/blocks-envelope.test.js
```

Expected: `pass 2`.

- [ ] **Step 5: Commit**

```bash
git add js/llsp3_assets.js tests/js/llsp3/blocks-envelope.test.js
git commit -m "feat(llsp3): bundle default sb3 sound + costume assets"
```

---

## Phase 5 — Blockly ⇄ sb3 structural converter

### Task 5.1: Shadow contract table

The shadow contract maps `(blockOpcode, inputName)` to the shadow-block opcode and field that wraps a value-input when the user hasn't dragged in their own block. Derive entries by inspecting the real Block fixture's sb3 plus `js/blockly_config.js`.

**Files:**
- Create: `js/llsp3_blocks.js` (skeleton with the contract table only)
- Create: `tests/js/llsp3/blocks-converter.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/js/llsp3/blocks-converter.test.js
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeLlsp3Env } = require('../mocks/llsp3-env');

function env() {
  return makeLlsp3Env([
    'llsp3_assets', 'llsp3_manifest', 'llsp3_blocks',
  ]).ctx;
}

test('shadowFor: returns the documented shadow for flippermove_setMovementPair PAIR input', () => {
  const ctx = env();
  const s = ctx.LLSP3.blocks.shadowFor('flippermove_setMovementPair', 'PAIR');
  assert.strictEqual(s.opcode, 'flippermove_movement-port-selector');
  assert.strictEqual(s.fieldName, 'field_flippermove_movement-port-selector');
  assert.strictEqual(s.defaultValue, 'AB');
});

test('shadowFor: returns the documented shadow for flippermove_move DIRECTION input', () => {
  const ctx = env();
  const s = ctx.LLSP3.blocks.shadowFor('flippermove_move', 'DIRECTION');
  assert.strictEqual(s.opcode, 'flippermove_custom-icon-direction');
  assert.strictEqual(s.fieldName, 'field_flippermove_custom-icon-direction');
  assert.strictEqual(s.defaultValue, 'forward');
});

test('shadowFor: numeric value-inputs default to math_number', () => {
  const ctx = env();
  const s = ctx.LLSP3.blocks.shadowFor('flippermove_move', 'VALUE');
  assert.strictEqual(s.opcode, 'math_number');
  assert.strictEqual(s.fieldName, 'NUM');
  assert.strictEqual(s.defaultValue, '10');
});

test('shadowFor: unknown input falls back to math_number "10"', () => {
  const ctx = env();
  const s = ctx.LLSP3.blocks.shadowFor('flippermotor_motorTurnForDirection', 'NONEXISTENT');
  assert.strictEqual(s.opcode, 'math_number');
  assert.strictEqual(s.defaultValue, '10');
});
```

- [ ] **Step 2: Run, confirm it fails**

Expected: ENOENT for `js/llsp3_blocks.js`.

- [ ] **Step 3: Create `js/llsp3_blocks.js` skeleton with the contract table**

```js
// js/llsp3_blocks.js
'use strict';
(function (global) {
  const LLSP3 = (global.LLSP3 = global.LLSP3 || {});

  // Shadow contract table.
  // Keyed by `${opcode}|${inputName}`. Each entry says: when this input is
  // unconnected (just a typed-in value or an icon picker), what shadow block
  // wraps it in the Scratch sb3?
  //
  // Sources for entries:
  //  1. ~/Downloads/Block Project.llsp3 → scratch.sb3 → project.json
  //  2. js/blockly_config.js block defs
  //  3. Spot-checks vs the alexandrehardy reference (license-clean: shape only)
  //
  // Catalogue exceptions as we find them. Anything not listed falls back to
  // a `math_number` shadow with default "10".
  const SHADOW_CONTRACT = {
    // ── flippermove ────────────────────────────────────────────────────────
    'flippermove_setMovementPair|PAIR':
      { opcode: 'flippermove_movement-port-selector',
        fieldName: 'field_flippermove_movement-port-selector',
        defaultValue: 'AB' },
    'flippermove_move|DIRECTION':
      { opcode: 'flippermove_custom-icon-direction',
        fieldName: 'field_flippermove_custom-icon-direction',
        defaultValue: 'forward' },
    'flippermove_startMove|DIRECTION':
      { opcode: 'flippermove_custom-icon-direction',
        fieldName: 'field_flippermove_custom-icon-direction',
        defaultValue: 'forward' },
    // ── flippermotor ───────────────────────────────────────────────────────
    'flippermotor_motorTurnForDirection|PORT':
      { opcode: 'flippermotor_single-port-selector',
        fieldName: 'field_flippermotor_single-port-selector',
        defaultValue: 'A' },
    'flippermotor_motorGoDirectionToPosition|PORT':
      { opcode: 'flippermotor_single-port-selector',
        fieldName: 'field_flippermotor_single-port-selector',
        defaultValue: 'A' },
    'flippermotor_motorStartDirection|PORT':
      { opcode: 'flippermotor_single-port-selector',
        fieldName: 'field_flippermotor_single-port-selector',
        defaultValue: 'A' },
    'flippermotor_motorStop|PORT':
      { opcode: 'flippermotor_single-port-selector',
        fieldName: 'field_flippermotor_single-port-selector',
        defaultValue: 'A' },
    'flippermotor_motorSetSpeed|PORT':
      { opcode: 'flippermotor_single-port-selector',
        fieldName: 'field_flippermotor_single-port-selector',
        defaultValue: 'A' },
    // ── flipperevents ──────────────────────────────────────────────────────
    'flipperevents_whenColor|VALUE':
      { opcode: 'flipperevents_color-selector',
        fieldName: 'field_flipperevents_color-selector',
        defaultValue: '3' },
    'flipperevents_whenPressed|VALUE':
      { opcode: 'flipperevents_press-selector',
        fieldName: 'field_flipperevents_press-selector',
        defaultValue: 'pressed' },
    // ── flippersound ───────────────────────────────────────────────────────
    'flippersound_playSoundUntilDone|SOUND':
      { opcode: 'flippersound_sound-selector',
        fieldName: 'field_flippersound_sound-selector',
        defaultValue: 'Cat Meow 1' },
    'flippersound_playSound|SOUND':
      { opcode: 'flippersound_sound-selector',
        fieldName: 'field_flippersound_sound-selector',
        defaultValue: 'Cat Meow 1' },
  };

  const NUMERIC_DEFAULT = { opcode: 'math_number', fieldName: 'NUM', defaultValue: '10' };
  const STRING_DEFAULT  = { opcode: 'text',        fieldName: 'TEXT', defaultValue: '' };

  // Inputs whose default shadow should be `text` rather than `math_number`.
  const STRING_INPUT_KEYS = new Set([
    'flipperlight_lightDisplayImageOnForTime|MATRIX',
    'flipperlight_lightDisplayImageOn|MATRIX',
    'flipperlight_lightDisplayText|TEXT',
    'flipperlight_ultrasonicLightUp|VALUE',
  ]);

  function shadowFor(opcode, inputName) {
    const key = `${opcode}|${inputName}`;
    if (SHADOW_CONTRACT[key]) return SHADOW_CONTRACT[key];
    if (STRING_INPUT_KEYS.has(key)) return STRING_DEFAULT;
    return NUMERIC_DEFAULT;
  }

  LLSP3.blocks = { shadowFor, SHADOW_CONTRACT };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run, confirm 4 tests pass**

```bash
node --test tests/js/llsp3/blocks-converter.test.js
```

Expected: `pass 4`.

- [ ] **Step 5: Commit**

```bash
git add js/llsp3_blocks.js tests/js/llsp3/blocks-converter.test.js
git commit -m "feat(llsp3): shadow contract table for blockly→sb3 conversion"
```

> **Implementation note (carry through Phase 5–8):** the contract table above covers the inputs visible in the captured Block fixture plus the most common port/direction selectors. As Phase 8's real-fixture round-trip exercises more blocks, add entries here for any fallback that doesn't match what the Spike app emits. Keep this table as the single source of truth for shadow contracts.

---

### Task 5.2: Generate fresh sb3 block IDs

sb3 block IDs are 20-char strings of arbitrary printable chars. Helper for the converter.

**Files:**
- Modify: `js/llsp3_blocks.js`
- Modify: `tests/js/llsp3/blocks-converter.test.js`

- [ ] **Step 1: Add the failing test**

Append to `tests/js/llsp3/blocks-converter.test.js`:

```js
test('genSb3Id: produces 20-char unique ids', () => {
  const ctx = env();
  const ids = new Set();
  for (let i = 0; i < 100; i++) ids.add(ctx.LLSP3.blocks.genSb3Id());
  assert.strictEqual(ids.size, 100);
  for (const id of ids) assert.strictEqual(id.length, 20);
});
```

- [ ] **Step 2: Add the helper**

Inside the IIFE in `js/llsp3_blocks.js`, before the `LLSP3.blocks = ...` export:

```js
  const SB3_ID_ALPHABET =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-!#$%&()*+,.:;<=>?@[]^`{|}~';

  function genSb3Id() {
    let id = '';
    for (let i = 0; i < 20; i++) {
      id += SB3_ID_ALPHABET[Math.floor(Math.random() * SB3_ID_ALPHABET.length)];
    }
    return id;
  }
```

Update the export:

```js
  LLSP3.blocks = { shadowFor, genSb3Id, SHADOW_CONTRACT };
```

- [ ] **Step 3: Run, confirm passes**

```bash
node --test tests/js/llsp3/blocks-converter.test.js
```

Expected: `pass 5`.

- [ ] **Step 4: Commit**

```bash
git add js/llsp3_blocks.js tests/js/llsp3/blocks-converter.test.js
git commit -m "feat(llsp3): sb3 block id generator"
```

---

### Task 5.3: Save direction — Blockly serialization → sb3 blocks dictionary

Convert a Blockly serialization JSON `state` (from `Blockly.serialization.workspaces.save(workspace)`) into the sb3 `blocks` dictionary. This task handles a single top-level chain with no inner-block inputs (all values are typed numbers) so the structural shape is verifiable in isolation.

**Files:**
- Modify: `js/llsp3_blocks.js`
- Modify: `tests/js/llsp3/blocks-converter.test.js`

- [ ] **Step 1: Add the failing test**

Append to `tests/js/llsp3/blocks-converter.test.js`:

```js
test('blocklyStateToSb3Blocks: simple two-block chain (whenProgramStarts → setMovementPair)', () => {
  const ctx = env();

  // Blockly serialization shape (matches Blockly.serialization.workspaces.save output)
  const state = {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: 'flipperevents_whenProgramStarts',
          id: 'A1',
          x: -459, y: -252,
          next: {
            block: {
              type: 'flippermove_setMovementPair',
              id: 'B1',
              fields: {},
              inputs: {
                PAIR: { shadow: { type: 'flippermove_movement-port-selector', id: 'C1',
                  fields: { 'field_flippermove_movement-port-selector': 'AB' } } },
              },
            }
          }
        }
      ]
    }
  };

  const out = ctx.LLSP3.blocks.blocklyStateToSb3Blocks(state);
  assert.strictEqual(typeof out, 'object');

  // The whenProgramStarts hat block
  const hat = Object.values(out).find(b => b.opcode === 'flipperevents_whenProgramStarts');
  assert.ok(hat, 'hat block emitted');
  assert.strictEqual(hat.topLevel, true);
  assert.strictEqual(hat.parent, null);
  assert.strictEqual(hat.x, -459);
  assert.strictEqual(hat.y, -252);

  // The follow-up block
  const move = Object.values(out).find(b => b.opcode === 'flippermove_setMovementPair');
  assert.ok(move, 'move block emitted');
  assert.strictEqual(move.topLevel, false);
  assert.ok(move.parent, 'move has a parent');

  // Hat's `next` points to the move block's id
  const moveId = Object.keys(out).find(k => out[k] === move);
  assert.strictEqual(hat.next, moveId);

  // The PAIR input is wrapped as [1, shadowId]
  assert.ok(move.inputs.PAIR);
  assert.strictEqual(move.inputs.PAIR[0], 1, 'shadow-only input encoded as 1');
});
```

- [ ] **Step 2: Run, confirm fails**

Expected: `blocklyStateToSb3Blocks is not a function`.

- [ ] **Step 3: Add the converter to `js/llsp3_blocks.js`**

Inside the IIFE, before `LLSP3.blocks = ...`:

```js
  // ── Blockly serialization → sb3 blocks ───────────────────────────────────
  // Blockly's `inputs` shape:  { INPUTNAME: { block: {...}, shadow: {...} } }
  // Blockly's `fields` shape:  { FIELDNAME: <value> }
  // Blockly's chain shape:     { ..., next: { block: {...} } }
  //
  // sb3's `inputs` shape:      { INPUTNAME: [N, blockId, shadowId?] }
  //   N=1 shadow only, N=2 block only, N=3 block-with-shadow
  // sb3's `fields` shape:      { FIELDNAME: [<value>, null] }

  function blocklyStateToSb3Blocks(state) {
    const out = {};
    const root = state && state.blocks && state.blocks.blocks;
    if (!Array.isArray(root)) return out;

    for (const top of root) {
      emitBlock(out, top, /* parentId */ null, /* topLevel */ true);
    }
    return out;
  }

  function emitBlock(out, blkly, parentId, topLevel) {
    const id = blkly.id || genSb3Id();
    const node = {
      opcode: blkly.type,
      next: null,
      parent: parentId,
      inputs: {},
      fields: convertFields(blkly.fields || {}),
      shadow: !!blkly.shadow,
      topLevel: !!topLevel,
    };
    if (topLevel) {
      node.x = (blkly.x === undefined ? 0 : blkly.x);
      node.y = (blkly.y === undefined ? 0 : blkly.y);
    }
    out[id] = node;

    // Inputs: each is { shadow?, block? }
    for (const [name, inp] of Object.entries(blkly.inputs || {})) {
      node.inputs[name] = encodeInput(out, blkly.type, name, inp, id);
    }

    // Next link
    if (blkly.next && blkly.next.block) {
      const nextId = emitBlock(out, blkly.next.block, id, /* topLevel */ false);
      node.next = nextId;
    }
    return id;
  }

  function convertFields(fields) {
    const out = {};
    for (const [k, v] of Object.entries(fields)) out[k] = [v, null];
    return out;
  }

  function encodeInput(out, parentOpcode, inputName, inp, parentId) {
    // inp may have .block, .shadow, or both.
    let shadowId = null;
    let blockId  = null;

    if (inp.shadow) {
      shadowId = emitBlock(out, { ...inp.shadow, shadow: true }, parentId, false);
    }
    if (inp.block) {
      blockId = emitBlock(out, inp.block, parentId, false);
    }

    if (shadowId && blockId) return [3, blockId, shadowId];
    if (blockId)             return [2, blockId];
    if (shadowId)            return [1, shadowId];

    // No block, no shadow — synthesize a default shadow from the contract.
    const contract = shadowFor(parentOpcode, inputName);
    const synthId = genSb3Id();
    out[synthId] = {
      opcode: contract.opcode,
      next: null, parent: parentId,
      inputs: {},
      fields: { [contract.fieldName]: [contract.defaultValue, null] },
      shadow: true, topLevel: false,
    };
    return [1, synthId];
  }
```

Update export:

```js
  LLSP3.blocks = { shadowFor, genSb3Id, blocklyStateToSb3Blocks, SHADOW_CONTRACT };
```

- [ ] **Step 4: Run, confirm passes**

```bash
node --test tests/js/llsp3/blocks-converter.test.js
```

Expected: `pass 6`.

- [ ] **Step 5: Add a test for inline numeric literals (`[1, [4, "10"]]`)**

Append:

```js
test('blocklyStateToSb3Blocks: inline math_number shadow becomes [1, [4, "<num>"]]', () => {
  const ctx = env();
  const state = {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: 'flippermove_move',
          id: 'M1',
          x: 0, y: 0,
          fields: { UNIT: 'rotations' },
          inputs: {
            DIRECTION: { shadow: { type: 'flippermove_custom-icon-direction', id: 'D1',
              fields: { 'field_flippermove_custom-icon-direction': 'forward' } } },
            VALUE:     { shadow: { type: 'math_number', id: 'V1',
              fields: { NUM: '10' } } },
          },
        }
      ]
    }
  };

  const out = ctx.LLSP3.blocks.blocklyStateToSb3Blocks(state);
  const move = Object.values(out).find(b => b.opcode === 'flippermove_move');
  assert.ok(move);
  assert.strictEqual(move.inputs.VALUE[0], 1);
  // The shadow id must point to a math_number block in `out`
  const shadowId = move.inputs.VALUE[1];
  assert.ok(typeof shadowId === 'string');
  assert.strictEqual(out[shadowId].opcode, 'math_number');
  assert.deepStrictEqual(out[shadowId].fields.NUM, ['10', null]);
});
```

- [ ] **Step 6: Run, confirm passes**

```bash
node --test tests/js/llsp3/blocks-converter.test.js
```

Expected: `pass 7`.

- [ ] **Step 7: Commit**

```bash
git add js/llsp3_blocks.js tests/js/llsp3/blocks-converter.test.js
git commit -m "feat(llsp3): blockly serialization → sb3 blocks (save direction)"
```

---

### Task 5.4: Load direction — sb3 blocks dictionary → Blockly serialization

Inverse of Task 5.3.

**Files:**
- Modify: `js/llsp3_blocks.js`
- Modify: `tests/js/llsp3/blocks-converter.test.js`

- [ ] **Step 1: Write the failing round-trip test**

Append:

```js
test('sb3BlocksToBlocklyState: round-trips a chain through forward+inverse converters', () => {
  const ctx = env();
  const original = {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: 'flipperevents_whenProgramStarts',
          id: 'TOP',
          x: 100, y: 200,
          next: {
            block: {
              type: 'flippermove_move',
              id: 'MOV',
              fields: { UNIT: 'rotations' },
              inputs: {
                DIRECTION: { shadow: { type: 'flippermove_custom-icon-direction', id: 'DIR',
                  fields: { 'field_flippermove_custom-icon-direction': 'forward' } } },
                VALUE: { shadow: { type: 'math_number', id: 'NUM',
                  fields: { NUM: '5' } } },
              },
            },
          },
        },
      ],
    },
  };

  const sb3Blocks = ctx.LLSP3.blocks.blocklyStateToSb3Blocks(original);
  const back = ctx.LLSP3.blocks.sb3BlocksToBlocklyState(sb3Blocks);

  // Walk the chain in `back` and assert structure is preserved.
  const top = back.blocks.blocks[0];
  assert.strictEqual(top.type, 'flipperevents_whenProgramStarts');
  assert.strictEqual(top.x, 100);
  assert.strictEqual(top.y, 200);
  assert.ok(top.next);

  const mov = top.next.block;
  assert.strictEqual(mov.type, 'flippermove_move');
  assert.strictEqual(mov.fields.UNIT, 'rotations');
  assert.strictEqual(mov.inputs.DIRECTION.shadow.type, 'flippermove_custom-icon-direction');
  assert.strictEqual(mov.inputs.DIRECTION.shadow.fields['field_flippermove_custom-icon-direction'], 'forward');
  assert.strictEqual(mov.inputs.VALUE.shadow.type, 'math_number');
  assert.strictEqual(mov.inputs.VALUE.shadow.fields.NUM, '5');
});
```

- [ ] **Step 2: Run, confirm fails**

Expected: `sb3BlocksToBlocklyState is not a function`.

- [ ] **Step 3: Add the inverse converter**

Inside the IIFE in `js/llsp3_blocks.js`:

```js
  // ── sb3 blocks → Blockly serialization ───────────────────────────────────
  function sb3BlocksToBlocklyState(sb3Blocks) {
    const tops = Object.entries(sb3Blocks)
      .filter(([_, b]) => b.topLevel === true)
      .map(([id, b]) => buildBlocklyBlock(sb3Blocks, id));
    return { blocks: { languageVersion: 0, blocks: tops } };
  }

  function buildBlocklyBlock(sb3, id) {
    const sb = sb3[id];
    const blkly = {
      type: sb.opcode,
      id,
    };
    if (sb.topLevel) {
      blkly.x = sb.x || 0;
      blkly.y = sb.y || 0;
    }

    // Fields
    const fields = {};
    for (const [k, v] of Object.entries(sb.fields || {})) fields[k] = v[0];
    if (Object.keys(fields).length) blkly.fields = fields;

    // Inputs
    const inputs = {};
    for (const [name, value] of Object.entries(sb.inputs || {})) {
      const built = decodeInput(sb3, value);
      if (built) inputs[name] = built;
    }
    if (Object.keys(inputs).length) blkly.inputs = inputs;

    // Next
    if (sb.next) {
      blkly.next = { block: buildBlocklyBlock(sb3, sb.next) };
      delete blkly.next.block.x;  // only top-level blocks carry x/y
      delete blkly.next.block.y;
    }
    return blkly;
  }

  function decodeInput(sb3, value) {
    // value is one of:
    //   [1, idOrPrimitive]       — shadow only
    //   [2, blockId]             — block only
    //   [3, blockId, shadowId]   — block-with-shadow
    const tag = value[0];
    const a = value[1];
    const b = value[2];

    function decodeShadowSlot(slot) {
      if (Array.isArray(slot)) {
        // Inline primitive: [4, "10"] → math_number with NUM
        const ptype = slot[0];
        const pval  = slot[1];
        if (ptype === 4 || ptype === 5 || ptype === 6 || ptype === 7 || ptype === 8) {
          return { type: 'math_number', fields: { NUM: pval } };
        }
        if (ptype === 9) return { type: 'colour_picker', fields: { COLOUR: pval } };
        if (ptype === 10) return { type: 'text', fields: { TEXT: pval } };
        if (ptype === 11) return { type: 'event_broadcast_menu', fields: { BROADCAST_OPTION: pval } };
        return { type: 'math_number', fields: { NUM: String(pval) } };
      }
      // String id → look up in sb3
      const blk = buildBlocklyBlock(sb3, slot);
      delete blk.x; delete blk.y;
      return blk;
    }

    if (tag === 1) return { shadow: decodeShadowSlot(a) };
    if (tag === 2) {
      const block = decodeShadowSlot(a);
      return { block };
    }
    if (tag === 3) {
      return { block: decodeShadowSlot(a), shadow: decodeShadowSlot(b) };
    }
    return null;
  }
```

Update the export:

```js
  LLSP3.blocks = { shadowFor, genSb3Id, blocklyStateToSb3Blocks, sb3BlocksToBlocklyState, SHADOW_CONTRACT };
```

- [ ] **Step 4: Run, confirm passes**

```bash
node --test tests/js/llsp3/blocks-converter.test.js
```

Expected: `pass 8`.

- [ ] **Step 5: Commit**

```bash
git add js/llsp3_blocks.js tests/js/llsp3/blocks-converter.test.js
git commit -m "feat(llsp3): sb3 blocks → blockly serialization (load direction)"
```

---

## Phase 6 — sb3 envelope

### Task 6.1: Build a complete sb3 ZIP from a blocks dictionary

Wrap the converter output with the Stage target, default sprite, costumes, sounds, and `meta` block. Returns a `Uint8Array` ready to be embedded in the outer `.llsp3`.

**Files:**
- Modify: `js/llsp3_blocks.js`
- Modify: `tests/js/llsp3/blocks-envelope.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/js/llsp3/blocks-envelope.test.js`. The file already imports `test`, `assert`, `crypto`, and `makeLlsp3Env` from Task 4.1; the new test needs no further imports:

```js
test('writeSb3: produces a zip with project.json + the two default assets', async () => {
  const ctx = makeLlsp3Env([
    'llsp3_assets', 'llsp3_blocks',
  ]).ctx;

  const blocks = {
    'TOP': { opcode: 'flipperevents_whenProgramStarts', next: null, parent: null,
             inputs: {}, fields: {}, shadow: false, topLevel: true, x: 0, y: 0 },
  };
  const sb3Bytes = await ctx.LLSP3.blocks.writeSb3(blocks, ['flipperevents']);
  const inner = await ctx.JSZip.loadAsync(sb3Bytes);

  const names = Object.keys(inner.files).sort();
  assert.deepStrictEqual(names, [
    '1b8b032b06360a6cf7c31d86bddd144b.wav',
    'd41d8cd98f00b204e9800998ecf8427e.svg',
    'project.json',
  ]);

  const projectText = await inner.file('project.json').async('string');
  const project = JSON.parse(projectText);
  assert.strictEqual(project.targets.length, 2);
  assert.strictEqual(project.targets[0].isStage, true);
  assert.strictEqual(project.targets[1].isStage, false);
  assert.strictEqual(Object.keys(project.targets[1].blocks).length, 1);
  assert.deepStrictEqual(project.extensions, ['flipperevents']);
  assert.strictEqual(project.meta.semver, '3.0.0');
});
```

- [ ] **Step 2: Run, confirm fails**

Expected: `writeSb3 is not a function`.

- [ ] **Step 3: Add `writeSb3` and `readSb3` to `js/llsp3_blocks.js`**

Inside the IIFE:

```js
  // ── sb3 envelope ─────────────────────────────────────────────────────────
  const META = {
    semver: '3.0.0',
    vm: '0.2.0-prerelease.20200512204241',
    agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)',
  };

  function defaultStage() {
    return {
      isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {},
      blocks: {}, comments: {}, currentCostume: 0,
      costumes: [{
        assetId: 'd41d8cd98f00b204e9800998ecf8427e',
        name: 'backdrop1',
        bitmapResolution: 1,
        md5ext: 'd41d8cd98f00b204e9800998ecf8427e.svg',
        dataFormat: 'svg',
        rotationCenterX: 47, rotationCenterY: 55,
      }],
      sounds: [], volume: 0, tempo: 60,
      videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null,
    };
  }

  function defaultSpriteName() {
    let n = '';
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    for (let i = 0; i < 20; i++) n += alphabet[Math.floor(Math.random() * alphabet.length)];
    return n;
  }

  function defaultSprite(blocks) {
    return {
      isStage: false, name: defaultSpriteName(),
      variables: {}, lists: {}, broadcasts: {},
      blocks, comments: {}, currentCostume: 0,
      costumes: [{
        assetId: 'd41d8cd98f00b204e9800998ecf8427e',
        name: defaultSpriteName(),
        bitmapResolution: 1,
        md5ext: 'd41d8cd98f00b204e9800998ecf8427e.svg',
        dataFormat: 'svg',
        rotationCenterX: 240, rotationCenterY: 180,
      }],
      sounds: [{
        assetId: '1b8b032b06360a6cf7c31d86bddd144b',
        name: 'Cat Meow 1',
        dataFormat: 'wav',
        rate: 48000, sampleCount: 60000,
        md5ext: '1b8b032b06360a6cf7c31d86bddd144b.wav',
      }],
      volume: 100, visible: true, x: 0, y: 0, size: 100, direction: 90,
      draggable: false, rotationStyle: 'all around',
    };
  }

  function deriveExtensions(blocks) {
    const set = new Set();
    for (const b of Object.values(blocks)) {
      const m = /^([a-z]+)_/.exec(b.opcode || '');
      if (m && m[1].startsWith('flipper')) set.add(m[1]);
    }
    return Array.from(set).sort();
  }

  async function writeSb3(blocks, extensionsOverride) {
    const project = {
      targets: [defaultStage(), defaultSprite(blocks)],
      monitors: [],
      extensions: extensionsOverride || deriveExtensions(blocks),
      meta: META,
    };
    const zip = new (global.JSZip)();
    zip.file('project.json', JSON.stringify(project));
    zip.file(LLSP3.assets.SOUND_CAT_MEOW_1_FILENAME,
             LLSP3.assets.base64ToUint8(LLSP3.assets.SOUND_CAT_MEOW_1_BASE64));
    zip.file(LLSP3.assets.EMPTY_SVG_FILENAME, LLSP3.assets.EMPTY_SVG);
    return await zip.generateAsync({ type: 'uint8array' });
  }

  async function readSb3(bytes) {
    const zip = await (global.JSZip).loadAsync(bytes);
    const projectEntry = zip.file('project.json');
    if (!projectEntry) throw new Error('scratch.sb3 missing project.json');
    const project = JSON.parse(await projectEntry.async('string'));

    // Find the non-stage sprite that holds blocks. There may be multiple
    // sprites in unusual files; we collect blocks from all non-stage targets.
    const allBlocks = {};
    for (const t of project.targets || []) {
      if (t.isStage) continue;
      Object.assign(allBlocks, t.blocks || {});
    }
    return { blocks: allBlocks, extensions: project.extensions || [] };
  }
```

Update the export:

```js
  LLSP3.blocks = {
    shadowFor, genSb3Id,
    blocklyStateToSb3Blocks, sb3BlocksToBlocklyState,
    writeSb3, readSb3, deriveExtensions,
    SHADOW_CONTRACT,
  };
```

- [ ] **Step 4: Run, confirm passes**

```bash
node --test tests/js/llsp3/blocks-envelope.test.js
```

Expected: `pass 3`.

- [ ] **Step 5: Commit**

```bash
git add js/llsp3_blocks.js tests/js/llsp3/blocks-envelope.test.js
git commit -m "feat(llsp3): sb3 envelope (stage + sprite + assets + meta)"
```

---

### Task 6.2: Wire blocks I/O into `llsp3_io.js`

Add a `write` path for word-blocks and an `read` path that goes all the way to Blockly state. Now `llsp3_io.js` is the user-facing surface.

**Files:**
- Modify: `js/llsp3_io.js`
- Modify: `tests/js/llsp3/io.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/js/llsp3/io.test.js`:

```js
test('write+read round-trip for a word-blocks project', async () => {
  const ctx = makeLlsp3Env([
    'llsp3_assets', 'llsp3_manifest', 'llsp3_python', 'llsp3_blocks', 'llsp3_io',
  ]).ctx;

  const blocklyState = {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: 'flipperevents_whenProgramStarts',
          id: 'top1',
          x: 0, y: 0,
        },
      ],
    },
  };

  const sb3Blocks = ctx.LLSP3.blocks.blocklyStateToSb3Blocks(blocklyState);
  const sb3Bytes = await ctx.LLSP3.blocks.writeSb3(sb3Blocks, ['flipperevents']);

  const manifest = ctx.LLSP3.manifest.defaultManifest('word-blocks',
    { name: 'wb-rt' });
  manifest.extensions = ['flipperevents'];

  const llsp3 = await ctx.LLSP3.io.write({
    type: 'word-blocks', manifest, sb3: sb3Bytes,
  });
  const back = await ctx.LLSP3.io.read(llsp3);

  assert.strictEqual(back.type, 'word-blocks');
  assert.strictEqual(back.manifest.name, 'wb-rt');

  // ctx.LLSP3.io.read returns sb3 bytes; caller decodes via llsp3_blocks.readSb3.
  const sb3 = await ctx.LLSP3.blocks.readSb3(back.sb3);
  const restored = ctx.LLSP3.blocks.sb3BlocksToBlocklyState(sb3.blocks);
  assert.strictEqual(restored.blocks.blocks[0].type, 'flipperevents_whenProgramStarts');
});
```

- [ ] **Step 2: Run, confirm passes**

(`io.write` already supports `word-blocks` from Task 3.2.)

```bash
node --test tests/js/llsp3/io.test.js
```

Expected: `pass 4`.

- [ ] **Step 3: Commit**

```bash
git add tests/js/llsp3/io.test.js
git commit -m "test(llsp3): word-blocks round-trip through io.read/write"
```

---

## Phase 7 — Real Blocks fixture round-trip

### Task 7.1: Round-trip the real Block Project fixture

Confirm the real Spike-app block fixture loads through the converter and re-saves into a structurally-equivalent file.

**Files:**
- Modify: `tests/js/llsp3/round-trip.test.js`

- [ ] **Step 1: Add the failing test**

Append to `tests/js/llsp3/round-trip.test.js`:

```js
const BLOCK_FIXTURE = fs.readFileSync(
  path.join(REPO_ROOT, 'tests/fixtures/llsp3/block-project.llsp3')
);

test('round-trip: real Spike-app Block fixture preserves block structure', async () => {
  const ctx = makeLlsp3Env([
    'llsp3_assets', 'llsp3_manifest', 'llsp3_python', 'llsp3_blocks', 'llsp3_io',
  ]).ctx;

  const loaded = await ctx.LLSP3.io.read(BLOCK_FIXTURE);
  assert.strictEqual(loaded.type, 'word-blocks');

  const sb3In  = await ctx.LLSP3.blocks.readSb3(loaded.sb3);
  const blocklyState = ctx.LLSP3.blocks.sb3BlocksToBlocklyState(sb3In.blocks);

  // Should have at least the whenProgramStarts top-level block from the sample
  const tops = blocklyState.blocks.blocks;
  assert.ok(tops.length >= 1);
  const opcodes = tops.map(b => b.type).sort();
  assert.ok(opcodes.includes('flipperevents_whenProgramStarts'),
    `expected hat block in ${JSON.stringify(opcodes)}`);

  // Re-encode and confirm we can read what we wrote
  const reEncoded = ctx.LLSP3.blocks.blocklyStateToSb3Blocks(blocklyState);
  const sb3Out    = await ctx.LLSP3.blocks.writeSb3(reEncoded, sb3In.extensions);
  const merged    = ctx.LLSP3.manifest.mergeForSave(loaded.manifest,
    { name: loaded.manifest.name, extensions: sb3In.extensions });

  const llsp3 = await ctx.LLSP3.io.write({
    type: 'word-blocks', manifest: merged, sb3: sb3Out,
  });
  const back = await ctx.LLSP3.io.read(llsp3);
  assert.strictEqual(back.type, 'word-blocks');
  assert.strictEqual(back.manifest.id, loaded.manifest.id);
});
```

- [ ] **Step 2: Run, confirm passes**

```bash
node --test tests/js/llsp3/round-trip.test.js
```

Expected: `pass 2`.

If the test fails on a specific block opcode being missing from the shadow contract, add the entry to `SHADOW_CONTRACT` in `js/llsp3_blocks.js` and re-run. This is the data-collection loop.

- [ ] **Step 3: Commit**

```bash
git add tests/js/llsp3/round-trip.test.js js/llsp3_blocks.js
git commit -m "test(llsp3): real Block fixture round-trips through converter"
```

---

## Phase 8 — Header layout, CSS, name input

### Task 8.1: Add project-name input and Open/Save buttons to the header

**Files:**
- Modify: `index.html:43-46` (the tab group; add buttons after)
- Modify: `index.html:36-64` (the whole `<header>` block)

- [ ] **Step 1: Update `index.html` header markup**

Replace the contents of `<header>` (lines 36–64) with:

```html
<header>
  <div class="app-logo">
    <div class="logo-mark">🤖</div>
    <h1><span class="fll">FLL</span><span class="sep">/</span><span class="sub">Virtual Robot Simulator</span></h1>
  </div>

  <div class="project-name-wrap">
    <span class="project-name-icon">📝</span>
    <input type="text" id="project-name" class="project-name-input" placeholder="Untitled" maxlength="64">
  </div>

  <div class="tab-group">
    <button class="tab-btn active" id="tab-python">🐍 Python</button>
    <button class="tab-btn"        id="tab-blocks">🧱 Blocks</button>
  </div>

  <div class="file-controls">
    <input type="file" id="file-open-input" accept=".llsp3" style="display:none">
    <button class="btn btn-file" id="btn-open"  title="Open .llsp3 file">📂 Open</button>
    <button class="btn btn-file" id="btn-save"  title="Save current project as .llsp3">💾 Save</button>
  </div>

  <div class="spacer"></div>

  <div class="header-controls">
    <div class="speed-control">
      <span>Speed</span>
      <input type="range" id="speed-slider" min="0.25" max="4" step="0.25" value="1">
      <span id="speed-label">1x</span>
    </div>
    <button class="btn btn-theme" id="btn-theme" title="Toggle light/dark theme" aria-label="Toggle theme">
      <span class="icon-moon">🌙</span><span class="icon-sun">☀️</span>
    </button>
    <button class="btn btn-reset" id="btn-defaults" title="Reset theme, speed, and editor contents to defaults">⟲ Defaults</button>
    <button class="btn btn-reset" id="btn-reset">↺ Reset</button>
    <button class="btn btn-stop"  id="btn-stop"  disabled>■ Stop</button>
    <button class="btn btn-run"   id="btn-run"   disabled>▶ Run</button>
  </div>
</header>
```

- [ ] **Step 2: Add the new module `<script>` tags**

Replace the existing JS script-tag block (around `index.html:166-169`) with:

```html
<script src="js/simulator.js"></script>
<script src="js/blockly_config.js"></script>
<script src="js/monaco_config.js"></script>
<script src="js/llsp3_assets.js"></script>
<script src="js/llsp3_manifest.js"></script>
<script src="js/llsp3_python.js"></script>
<script src="js/llsp3_blocks.js"></script>
<script src="js/llsp3_io.js"></script>
<script src="js/llsp3_ui.js"></script>
<script src="js/main.js"></script>
```

- [ ] **Step 3: Reload the page and verify visually**

```bash
python3 -m http.server 8787
```

Open `http://localhost:8787`. Confirm:
- Project name input appears between logo and tab group.
- Open and Save buttons appear immediately right of the tab group.
- Buttons aren't wired yet — clicking does nothing.
- No console errors.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(llsp3): add project-name input + Open/Save buttons to header"
```

---

### Task 8.2: CSS for the new header elements

**Files:**
- Modify: `css/style.css` (add after the existing `.tab-btn` rules around line 164)

- [ ] **Step 1: Append the new styles**

Add to `css/style.css` (look for the existing `.btn-theme` block; insert these rules right after):

```css
/* ── Project name input ────────────────────────────────────────────────── */
.project-name-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-right: 14px;
}
.project-name-icon {
  font-size: 16px;
  opacity: 0.7;
}
.project-name-input {
  background: var(--surface-2, transparent);
  border: 1px solid var(--border, #cbd5e1);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 13px;
  color: var(--text-strong);
  min-width: 160px;
  max-width: 220px;
}
.project-name-input:focus {
  outline: none;
  border-color: var(--accent, #3b82f6);
}

/* ── File-controls cluster (Open + Save) ───────────────────────────────── */
.file-controls {
  display: flex;
  gap: 6px;
  margin-left: 8px;
}
.btn-file {
  background: var(--surface-2, transparent);
  border: 1px solid var(--border, #cbd5e1);
  color: var(--text-strong);
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}
.btn-file:hover { background: var(--surface-3, rgba(0,0,0,0.05)); }
.btn-file:active { transform: translateY(1px); }
```

- [ ] **Step 2: Reload and check visual fit in both themes**

Toggle between light and dark mode in the running simulator. Confirm the new input and buttons match the existing button styling and don't stand out.

- [ ] **Step 3: Commit**

```bash
git add css/style.css
git commit -m "feat(llsp3): style project-name input and Open/Save buttons"
```

---

## Phase 9 — UI module + main.js wiring

### Task 9.1: `llsp3_ui.js` — Open and Save handlers

The UI module owns the Open/Save flows but reads/writes editor state through callbacks main.js provides. This keeps llsp3_ui.js free of direct Monaco/Blockly dependencies.

**Files:**
- Create: `js/llsp3_ui.js`

- [ ] **Step 1: Write the module**

```js
// js/llsp3_ui.js
'use strict';
(function (global) {
  const LLSP3 = (global.LLSP3 = global.LLSP3 || {});

  const DEFAULT_NAME = 'Untitled';

  // hooks: {
  //   getActiveMode():       'python' | 'blocks'
  //   getPythonSource():     string
  //   setPythonSource(text): void
  //   getBlocklyState():     object   (from Blockly.serialization.workspaces.save)
  //   setBlocklyState(state):void
  //   switchTab(mode):       void
  //   isDirty():             boolean
  //   setDirty(flag):        void
  //   getProjectName():      string
  //   setProjectName(name):  void
  //   loadedManifest:        object | null  (last-loaded manifest, for re-save merge)
  //   setLoadedManifest(m):  void
  //   appendOutput(text, cls): void
  // }
  function init(hooks) {
    const fileInput = document.getElementById('file-open-input');
    const openBtn   = document.getElementById('btn-open');
    const saveBtn   = document.getElementById('btn-save');
    const nameInput = document.getElementById('project-name');

    if (!fileInput || !openBtn || !saveBtn || !nameInput) {
      console.error('llsp3_ui: required header elements missing');
      return;
    }

    nameInput.value = hooks.getProjectName() || DEFAULT_NAME;
    nameInput.addEventListener('input', () => {
      hooks.setProjectName(nameInput.value || DEFAULT_NAME);
      hooks.setDirty(true);
    });

    openBtn.addEventListener('click', () => {
      if (hooks.isDirty()) {
        const ok = window.confirm('You have unsaved changes. Discard and load this file?');
        if (!ok) return;
      }
      fileInput.value = '';
      fileInput.click();
    });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      try {
        const buffer = await file.arrayBuffer();
        const result = await LLSP3.io.read(buffer);

        if (result.type === 'python') {
          hooks.setPythonSource(result.python);
          hooks.switchTab('python');
        } else if (result.type === 'word-blocks') {
          const sb3 = await LLSP3.blocks.readSb3(result.sb3);
          const state = LLSP3.blocks.sb3BlocksToBlocklyState(sb3.blocks);
          hooks.setBlocklyState(state);
          hooks.switchTab('blocks');
        }

        const name = (result.manifest && result.manifest.name) || DEFAULT_NAME;
        hooks.setProjectName(name);
        nameInput.value = name;
        hooks.setLoadedManifest(result.manifest);
        hooks.setDirty(false);
        hooks.appendOutput(`[load] Opened "${name}"`, 'info');
      } catch (e) {
        hooks.appendOutput('[load] ' + (e && e.message ? e.message : String(e)), 'error');
      }
    });

    saveBtn.addEventListener('click', async () => {
      const mode = hooks.getActiveMode();
      const name = hooks.getProjectName() || DEFAULT_NAME;

      try {
        let llsp3Bytes;
        if (mode === 'python') {
          const code = hooks.getPythonSource();
          const manifest = hooks.loadedManifest && hooks.loadedManifest.type === 'python'
            ? LLSP3.manifest.mergeForSave(hooks.loadedManifest, { name })
            : LLSP3.manifest.defaultManifest('python', { name });
          llsp3Bytes = await LLSP3.io.write({ type: 'python', manifest, python: code });
        } else {
          const state = hooks.getBlocklyState();
          const sb3Blocks = LLSP3.blocks.blocklyStateToSb3Blocks(state);
          const extensions = LLSP3.blocks.deriveExtensions(sb3Blocks);
          const sb3 = await LLSP3.blocks.writeSb3(sb3Blocks, extensions);
          const manifest = hooks.loadedManifest && hooks.loadedManifest.type === 'word-blocks'
            ? LLSP3.manifest.mergeForSave(hooks.loadedManifest, { name, extensions })
            : LLSP3.manifest.defaultManifest('word-blocks', { name });
          if (!manifest.extensions || !manifest.extensions.length) manifest.extensions = extensions;
          llsp3Bytes = await LLSP3.io.write({ type: 'word-blocks', manifest, sb3 });
        }

        triggerDownload(llsp3Bytes, `${name}.llsp3`);
        hooks.setDirty(false);
        hooks.appendOutput(`[save] Saved "${name}.llsp3"`, 'info');
      } catch (e) {
        hooks.appendOutput('[save] ' + (e && e.message ? e.message : String(e)), 'error');
      }
    });
  }

  function triggerDownload(uint8, filename) {
    const blob = new Blob([uint8], { type: 'application/octet-stream' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  LLSP3.ui = { init };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 2: Sanity-load in a browser**

Reload the page after the next task; this module is dormant until `main.js` calls `LLSP3.ui.init(...)`.

- [ ] **Step 3: Commit**

```bash
git add js/llsp3_ui.js
git commit -m "feat(llsp3): UI handlers for Open/Save buttons and project-name input"
```

---

### Task 9.2: Wire `main.js` — dirty flag, name persistence, llsp3_ui.init

**Files:**
- Modify: `js/main.js`

- [ ] **Step 1: Add new localStorage keys near the existing ones**

After `js/main.js:53` (after `const TAB_KEY`), add:

```js
const NAME_KEY    = 'fll-vr-project-name';
const DIRTY_KEY   = 'fll-vr-dirty';

const DEFAULT_NAME = 'Untitled';
```

- [ ] **Step 2: Add dirty-flag and project-name state**

After `js/main.js:23` (after `let pyReady = false;`), add:

```js
let projectName    = DEFAULT_NAME;
let dirty          = false;
let loadedManifest = null;
```

…and immediately above `// ── Helpers ──` add the small helpers:

```js
function setDirty(v) {
  dirty = !!v;
  if (dirty) lsSet(DIRTY_KEY, '1'); else lsRemove(DIRTY_KEY);
}
function isDirty() { return dirty; }
function getProjectName() { return projectName; }
function setProjectName(name) {
  projectName = name || DEFAULT_NAME;
  lsSet(NAME_KEY, projectName);
}
function setLoadedManifest(m) { loadedManifest = m; }
```

- [ ] **Step 3: Restore name on boot**

In the `DOMContentLoaded` handler (around `js/main.js:473`), before any other initialization, add:

```js
  projectName = lsGet(NAME_KEY) || DEFAULT_NAME;
  dirty       = lsGet(DIRTY_KEY) === '1';
```

- [ ] **Step 4: Mark dirty on edits and clear on Run/Reset**

Find the Monaco change handler at `js/main.js:149`. Update its body:

```js
    editor.onDidChangeModelContent(() => {
      setDirty(true);
      clearTimeout(pySaveTimer);
      pySaveTimer = setTimeout(() => {
        const value = editor.getValue();
        if (value === DEFAULT_PYTHON_CODE) lsRemove(PYCODE_KEY);
        else lsSet(PYCODE_KEY, value);
      }, 250);
    });
```

Find the Blockly change listener at `js/main.js:176`. Update:

```js
      blocklyWs.addChangeListener((e) => {
        if (e && e.isUiEvent) return;
        setDirty(true);
        try {
          const xml = Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(blocklyWs));
          lsSet(BLOCKLY_KEY, xml);
        } catch (err) { /* workspace may be mid-dispose */ }
      });
```

In `handleDefaults` (around `js/main.js:323`), add to the success path (before the final `appendOutput(...)`):

```js
  setProjectName(DEFAULT_NAME);
  loadedManifest = null;
  setDirty(false);
```

- [ ] **Step 5: Add hooks for Blockly serialization read/write and tab switch**

Above the `DOMContentLoaded` block, define:

```js
function getActiveMode()    { return currentMode; }
function getPythonSource()  { return editor ? editor.getValue() : ''; }
function setPythonSource(t) { if (editor) editor.setValue(t); else lsSet(PYCODE_KEY, t); }

function getBlocklyState() {
  if (!blocklyWs || typeof Blockly === 'undefined') return { blocks: { languageVersion: 0, blocks: [] } };
  return Blockly.serialization.workspaces.save(blocklyWs);
}
function setBlocklyState(state) {
  if (!blocklyWs) initBlocklyWorkspace();
  if (!blocklyWs || typeof Blockly === 'undefined') return;
  blocklyWs.clear();
  try { Blockly.serialization.workspaces.load(state, blocklyWs); }
  catch (e) { console.error('Blockly load failed:', e); appendOutput('[load] Blockly load failed: ' + e.message, 'error'); }
  // Persist to legacy XML cache so refresh restores
  try {
    const xml = Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(blocklyWs));
    lsSet(BLOCKLY_KEY, xml);
  } catch (e) {}
}
```

- [ ] **Step 6: Call `LLSP3.ui.init(...)` in DOMContentLoaded**

Inside the `DOMContentLoaded` handler, after `applyStoredTab();` and before the closing `});` , add:

```js
  if (window.LLSP3 && window.LLSP3.ui && typeof window.LLSP3.ui.init === 'function') {
    window.LLSP3.ui.init({
      getActiveMode, getPythonSource, setPythonSource,
      getBlocklyState, setBlocklyState,
      switchTab: switchMode,
      isDirty, setDirty,
      getProjectName, setProjectName,
      get loadedManifest() { return loadedManifest; },
      setLoadedManifest,
      appendOutput,
    });
  }
```

- [ ] **Step 7: Reload and end-to-end smoke test**

```bash
python3 -m http.server 8787
```

In browser:
1. Confirm the project-name input is `"Untitled"` on first load.
2. Click **Save**. A `Untitled.llsp3` should download.
3. Move it: `mv ~/Downloads/Untitled.llsp3 /tmp/sim-rt.llsp3`. Click **Open**, pick `/tmp/sim-rt.llsp3`. The Python tab should reload the same code.
4. Switch to **Blocks** tab. Drag in any block. Click **Save**. A new `Untitled.llsp3` should download as a Word-Blocks file. Open it back; the workspace should restore.
5. Type into the project-name input → confirm dirty. Click Open without saving → confirm dialog should appear.

- [ ] **Step 8: Commit**

```bash
git add js/main.js
git commit -m "feat(llsp3): wire main.js to llsp3_ui (dirty flag, name, hooks)"
```

---

## Phase 10 — Polish

### Task 10.1: Friendly error messages on bad input

The IO and converter throws need to land in the console panel as understandable messages.

**Files:**
- Modify: `js/llsp3_ui.js`

- [ ] **Step 1: Categorize errors in the load handler**

Replace the catch block in the `fileInput.addEventListener('change', ...)` callback in `js/llsp3_ui.js`:

```js
      } catch (e) {
        const msg = (e && e.message) ? e.message : String(e);
        let display;
        if (/missing manifest|invalid JSON|loadAsync/i.test(msg)) {
          display = "[load] Couldn't read this file — it doesn't look like a .llsp3.";
        } else if (/Unsupported \.llsp3 type/i.test(msg)) {
          display = `[load] This file uses a project type the simulator doesn't support.`;
        } else {
          display = '[load] ' + msg;
        }
        hooks.appendOutput(display, 'error');
      }
```

- [ ] **Step 2: Verify with bad inputs**

In the browser:
1. Click Open → pick a non-llsp3 file (e.g., a plain `.txt`). Console should show the "doesn't look like a .llsp3" error.
2. Open `tests/fixtures/llsp3/python-project.llsp3` → success path.

- [ ] **Step 3: Commit**

```bash
git add js/llsp3_ui.js
git commit -m "feat(llsp3): friendlier error categories on bad load input"
```

---

### Task 10.2: Update README with the test command and Save/Load notes

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a small section**

Append to `README.md` (find the existing "Tests" section if any; otherwise add at the bottom):

```markdown
### Save / Load

Use **📂 Open** and **💾 Save** in the header to round-trip projects with the
official LEGO Spike Prime app. Both Python and Word-Blocks `.llsp3` files are
supported.

- The active tab determines what gets saved (Python tab → Python `.llsp3`,
  Blocks tab → Word-Blocks `.llsp3`).
- Loading a file auto-switches to the matching tab.
- The project-name input sets the download filename.

### Tests

- JavaScript: `node --test tests/js/`
- Python:     `python3 tests/py/run.py`
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document Save/Load and test commands"
```

---

## Phase 11 — Manual real-app verification (user-driven)

### Task 11.1: Round-trip a simulator-saved Python file through the Spike app

**This task cannot be automated — the user must run it.**

- [ ] **Step 1: Save a simple Python program from the simulator**

In the simulator: load the default Python program, click Save, accept the download as `RT-test.llsp3`.

- [ ] **Step 2: Open in the LEGO Spike Prime app**

Open the LEGO Spike app → File → Open → `~/Downloads/RT-test.llsp3`. The app should load the Python source. Run it on a real or virtual hub.

- [ ] **Step 3: If the app rejects the file**

Capture the rejection: error message, modal text, or silent failure.

Inspect what the Spike app accepts — open one of its own exported files and diff manifest fields against ours. Most likely culprits:
- `manifest.id` format (we use a 12-char nanoid; the app may demand a specific charset).
- `hardware.python` shape (we stub; the app may want real device fields).
- `appType` field presence/absence.

Add discovered fields to `defaultManifest` in `js/llsp3_manifest.js`. Re-run the round-trip self-tests after every edit.

- [ ] **Step 4: When a Python round-trip succeeds, repeat for Blocks**

Repeat Steps 1–3 with a Word-Blocks project saved from the simulator. Failures here are most likely in the sb3 envelope: `meta.agent`, costume/sound asset hashes, opcode mismatches.

- [ ] **Step 5: Reverse direction**

In the LEGO Spike app, save a fresh Python project and a fresh Word-Blocks project. Open both in the simulator. Both should restore correctly.

- [ ] **Step 6: Commit any spec/code changes discovered during verification**

```bash
git add -p
git commit -m "fix(llsp3): <specific manifest/sb3 field discovered during real-app test>"
```

Each fix should reference what failed and what was changed; one commit per concrete fix.

---

## Verification gate

Before declaring v1 done:

- [ ] `node --test tests/js/llsp3/` — all tests pass.
- [ ] Real Python fixture round-trips through the simulator with byte-identical `main` source.
- [ ] Real Block fixture round-trips through the simulator with structurally-identical block tree.
- [ ] A simulator-saved Python `.llsp3` opens and runs in the real Spike app.
- [ ] A simulator-saved Word-Blocks `.llsp3` opens in the real Spike app, all blocks render, the program runs.
- [ ] A Spike-app-saved Python `.llsp3` opens in the simulator and runs.
- [ ] A Spike-app-saved Word-Blocks `.llsp3` opens in the simulator and runs.
- [ ] All four error categories from the spec are reachable in the console panel by feeding crafted bad inputs.

---

## Open questions to flag during execution

These should not block Phase 0–10 progress, but the engineer should track them and surface to the user when they hit them:

1. **Spike-app `id` charset.** The samples used a 12-char nanoid alphabet. If the app rejects ours, narrow the alphabet to whatever the captured samples use exclusively.
2. **`hardware.python` device fields.** The app may expect connection state and a real device UUID. If it does, decide between (a) stubbing with a fixed magic UUID a la alexandrehardy, or (b) prompting the user to import a "stub device" file once.
3. **Shadow contract drift.** The contract table is best-effort from one captured Block sample. As Phase 11 surfaces unsupported blocks, append entries — don't try to enumerate all of Spike's blocks proactively.
4. **Block id collision risk.** Our `genSb3Id` uses 20-char random strings from a wide alphabet — collision probability is astronomically low for one workspace, but if a user reports a duplicated-id load failure, switch to nanoid + per-call uniqueness check against the in-progress dictionary.
