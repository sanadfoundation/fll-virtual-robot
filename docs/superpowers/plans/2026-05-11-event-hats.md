# Blockly Event Hats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Blockly event hats (`flipperevents_*` + the broadcast hat) functional. Multiple top-level hats run as concurrent async polling tasks inside the existing `AsyncFunction` wrapper; `whenProgramStarts` plays the role of program driver; edge-triggered + drop-while-busy firing.

**Architecture:** Six functional hat generators (`whenProgramStarts`, `whenPressed`, `whenColor`, `whenDistance`, `whenTimer`, `whenCondition`) emit either a `_mainBody = async () => { ... }` assignment (the driver) or a `_hats.push(async () => { while (sim.isRunning) { ...edge-detect... } })` polling closure. A small `scrub_` override in `Blockly.JavaScript` skips the auto-appended next-chain for hat block types — the hat generator manually fetches the body via `Blockly.JavaScript.blockToCode(block.getNextBlock())` and embeds it inside its closure. Five stub-warn generators (`whenButton`, `whenTilted`, `whenOrientation`, `whenGesture`, `event_whenbroadcastreceived`) emit a one-line warning + a no-op polling loop until their underlying APIs land. A new epilogue in `generateBlocklyJS` runs `_mainBody` (if present) and awaits `Promise.all(_hats)`.

**Tech Stack:** Vanilla browser JS (no build step). Blockly 10.4.3 (`blockly.min.js` + `javascript_compressed.js`). `node:test` for unit and integration tests. Tests invoke the generator directly and also drive the generated source via `new AsyncFunction(...)` against a stubbed `window.sim`.

**Reference spec:** [`docs/superpowers/specs/2026-05-11-event-hats-design.md`](../specs/2026-05-11-event-hats-design.md).

---

## File Structure

| File | New / Modified | Responsibility |
|---|---|---|
| `js/blockly_config.js` | modify | `registerGenerators`: replace the empty-string hat-generator loop with 11 real generators + a `scrub_` override that suppresses Blockly's auto-next-chain for hat types. `generateBlocklyJS`: extend the preamble with `_hats / _mainBody / _hatBusy / _hatPrev / _hatFired / _t0`; append the `await (async () => { ... })()` epilogue. |
| `tests/js/blockly/event-hats-generators.test.js` | new | Generator output-shape tests: assert each hat emits the expected closure shape and condition expression. |
| `tests/js/blockly/event-hats-runtime.test.js` | new | Integration tests: build a workspace, generate source, run it via `new AsyncFunction(...)` against a stubbed `window.sim`. Assert edge-trigger, drop-while-busy, isRunning-cancellation, one-shot timer, stub-warn output. |
| `tests/js/blockly/generators-smoke.test.js` | modify | The existing `every hat (event) generator returns empty string` test no longer holds. Replace with `every hat generator emits a wrapper for _mainBody or _hats.push`. |
| `BACKLOG.md` | modify | Strike the "`flipperevents_*` blocks are decorative" entry under Programming Experience → Blockly → Event hats. Update the "Functional hub-button blocks" cross-reference to drop the event-hat runtime addendum. |

---

## Task 1: Foundation — preamble, scrub_ override, epilogue

Lay the scaffolding the hat generators will plug into. None of the hat generators exist yet, so this task only adds inert structure; subsequent tasks fill it in.

**Files:**
- Modify: `js/blockly_config.js`
- Create: `tests/js/blockly/event-hats-generators.test.js`

- [ ] **Step 1: Write failing tests for the new preamble + epilogue shape**

Create `tests/js/blockly/event-hats-generators.test.js`:

```javascript
'use strict';

// Tests that generateBlocklyJS emits the event-hat runtime scaffolding:
//   - preamble declares _hats / _mainBody / _hatBusy / _hatPrev / _hatFired / _t0
//   - epilogue starts hats concurrently THEN awaits _mainBody (order matters
//     — see the load-bearing-ordering note in the design doc)
//   - scrub_ override skips next-chain append for hat block types
//
// Generator-output tests for each individual hat live further down (added by
// later tasks). The scaffolding tests here run first because every hat
// generator's emitted closure references the preamble vars.

const test   = require('node:test');
const assert = require('node:assert');
const { makeBlocklyEnv } = require('../mocks/blockly-env');

function setupAndGenerate(xml = '<xml/>') {
  const env = makeBlocklyEnv({
    textToDom: (s) => ({ kind: 'parsed', src: s }),
  });
  env.window.initBlockly('blockly-div', 'light');
  // The stub workspace doesn't actually parse XML — we drive generateBlocklyJS
  // with an empty workspace to read just the preamble + epilogue.
  const ws = { getTopBlocks: () => [] };  // empty workspace
  return { env, source: env.window.generateBlocklyJS(ws) };
}

test('preamble declares _hats array', () => {
  const { source } = setupAndGenerate();
  assert.ok(source.includes('var _hats     = [];'),
    `expected _hats declaration in preamble, got:\n${source.slice(0, 500)}`);
});

test('preamble declares _mainBody null', () => {
  const { source } = setupAndGenerate();
  assert.ok(source.includes('var _mainBody = null;'),
    `expected _mainBody declaration in preamble`);
});

test('preamble declares per-id state maps', () => {
  const { source } = setupAndGenerate();
  for (const v of ['_hatBusy', '_hatPrev', '_hatFired']) {
    assert.ok(source.includes(`var ${v}  = {};`),
      `expected ${v} declaration in preamble`);
  }
});

test('preamble seeds _t0 at program start', () => {
  const { source } = setupAndGenerate();
  assert.ok(source.includes('var _t0       = performance.now();'),
    `expected _t0 declaration in preamble`);
});

test('epilogue starts hats concurrently then awaits _mainBody', () => {
  const { source } = setupAndGenerate();
  // The epilogue must (a) start every hat BEFORE awaiting _mainBody so hat
  // polling loops are on the event loop while main runs; (b) conditionally
  // run _mainBody; (c) wait for the previously-started hats to wind down.
  assert.ok(source.includes('await (async () => {'),
    `expected awaited IIFE in epilogue, got:\n${source.slice(-400)}`);
  assert.ok(source.includes('_hats.map(h => h())'),
    `expected _hats.map(h => h()) to start every hat`);
  assert.ok(source.includes('if (_mainBody)'),
    `expected guard on _mainBody`);
  assert.ok(source.includes('window.sim.isRunning = false'),
    `expected isRunning flip after _mainBody returns`);
  assert.ok(source.includes('Promise.all('),
    `expected Promise.all over the started hat promises`);
  // Order check: hat-start must precede main-await in the source.
  const hatStartIdx = source.indexOf('_hats.map(h => h())');
  const mainAwaitIdx = source.indexOf('await _mainBody()');
  assert.ok(hatStartIdx > 0 && mainAwaitIdx > 0,
    'both _hats.map and await _mainBody() must appear in source');
  assert.ok(hatStartIdx < mainAwaitIdx,
    `hats must start before main is awaited (hatStartIdx=${hatStartIdx}, mainAwaitIdx=${mainAwaitIdx})`);
});
```

- [ ] **Step 2: Run the tests; they should fail**

```bash
node --test tests/js/blockly/event-hats-generators.test.js 2>&1 | tail -15
```

Expected: all five preamble/epilogue tests fail because the preamble doesn't declare the new vars and the epilogue doesn't exist.

- [ ] **Step 3: Extend the preamble in `generateBlocklyJS`**

Open `js/blockly_config.js`. Find `function generateBlocklyJS(workspace)` (around line 2257). The existing preamble is the `const preamble = [...].join('\n');` block. Add six lines to that array, BEFORE the join:

```javascript
  const preamble = [
    `var _moveSpeed     = 50;`,
    `var _motorSpeed    = 75;`,
    `var _movePairL     = 'A';`,
    `var _movePairR     = 'B';`,
    `var _moveRotMM     = ${(Math.PI * 56).toFixed(4)};`,
    `var _distMoved     = 0;`,
    `var _timerMs       = performance.now();`,
    `var _stopMethod    = 'brake';`,
    `var _moveAccel     = 'medium';`,
    `var _motorStop     = {};`,
    `var _motorAccel    = {};`,
    `var _motorRelOffset= {};`,
    // Event-hat runtime state (see docs/superpowers/specs/2026-05-11-event-hats-design.md).
    `var _hats     = [];`,
    `var _mainBody = null;`,
    `var _hatBusy  = {};`,
    `var _hatPrev  = {};`,
    `var _hatFired = {};`,
    `var _t0       = performance.now();`,
  ].join('\n');
```

- [ ] **Step 4: Append the epilogue to `generateBlocklyJS`'s return value**

In `generateBlocklyJS`, find the current `return preamble + '\n' + body;` line. Replace with:

```javascript
  const epilogue = [
    `await (async () => {`,
    `  // Start every hat first so it's polling on the event loop, then run`,
    `  // _mainBody concurrently. Calling an async fn returns a Promise and`,
    `  // begins execution; each hat runs synchronously to its first \`await rAF\``,
    `  // then yields, leaving the event loop free for _mainBody to start.`,
    `  const _hatPromises = _hats.map(h => h());`,
    `  if (_mainBody) {`,
    `    try { await _mainBody(); } finally { window.sim.isRunning = false; }`,
    `  }`,
    `  await Promise.all(_hatPromises);`,
    `})();`,
  ].join('\n');

  return preamble + '\n' + body + '\n' + epilogue + '\n';
```

**Why the hat-first ordering is load-bearing.** A `forever`-main + a hat-that-stops-it program (e.g. the 2026-05-10 screenshot) only works if the hat is *polling* while main runs. If we awaited `_mainBody()` before calling `_hats.map(h => h())`, the hat would be a parked async value in the array; nothing would call it; the user's press would never be observed; `isRunning` would stay true; main would loop forever. Starting the hats first puts their polling tasks on the event loop where they yield at every `await rAF` — `await _mainBody()` then gets its turn naturally.

- [ ] **Step 5: Re-run preamble/epilogue tests; they should pass**

```bash
node --test tests/js/blockly/event-hats-generators.test.js 2>&1 | tail -10
```

Expected: 5 passing.

- [ ] **Step 6: Add a failing test for the scrub_ override**

Append to `tests/js/blockly/event-hats-generators.test.js`:

```javascript
// ── scrub_ override ────────────────────────────────────────────────────────

test('scrub_ override is installed for hat block types', () => {
  const { env } = setupAndGenerate();
  const Blockly = env.Blockly;
  const js = Blockly.JavaScript || Blockly.javascriptGenerator;
  // The override should be a function (not the default scrub_).
  assert.strictEqual(typeof js.scrub_, 'function');
  // For a hat type, scrub_ should return code unchanged (no next-chain append).
  const hatBlock = { type: 'flipperevents_whenPressed', nextConnection: { targetBlock: () => null } };
  assert.strictEqual(js.scrub_(hatBlock, 'X;', undefined), 'X;');
  // For a non-hat, scrub_ should still append next-chain code (use a block
  // with no next so the result is just X; — this only checks the override
  // doesn't break non-hat blocks).
  const normalBlock = { type: 'flippermove_move', nextConnection: { targetBlock: () => null } };
  assert.strictEqual(js.scrub_(normalBlock, 'Y;', undefined), 'Y;');
});
```

- [ ] **Step 7: Run; verify it fails**

```bash
node --test tests/js/blockly/event-hats-generators.test.js -t scrub_ 2>&1 | tail -10
```

Expected: `scrub_ override is installed for hat block types` fails — likely the default scrub_ throws on the synthetic block because the mock Blockly doesn't have a real generator instance.

- [ ] **Step 8: Install the scrub_ override inside `registerGenerators`**

In `js/blockly_config.js`, find the hat-empty-string loop:

```javascript
  // ── Events (hat blocks → empty body chain) ─────────────────────────────────

  for (const t of [
    'flipperevents_whenProgramStarts','flipperevents_whenColor','flipperevents_whenPressed',
    'flipperevents_whenDistance','flipperevents_whenTilted','flipperevents_whenOrientation',
    'flipperevents_whenGesture','flipperevents_whenButton','flipperevents_whenTimer',
    'flipperevents_whenCondition','event_whenbroadcastreceived',
  ]) {
    js[t] = () => '';
  }
```

Replace it with:

```javascript
  // ── Events (hat blocks) ────────────────────────────────────────────────────
  //
  // Each hat generator below emits either a `_mainBody = ...` assignment
  // (whenProgramStarts) or a `_hats.push(async () => { ... })` polling task.
  // The runtime they reference is set up in generateBlocklyJS's preamble +
  // epilogue. See docs/superpowers/specs/2026-05-11-event-hats-design.md.

  const HAT_TYPES = new Set([
    'flipperevents_whenProgramStarts','flipperevents_whenColor','flipperevents_whenPressed',
    'flipperevents_whenDistance','flipperevents_whenTilted','flipperevents_whenOrientation',
    'flipperevents_whenGesture','flipperevents_whenButton','flipperevents_whenTimer',
    'flipperevents_whenCondition','event_whenbroadcastreceived',
  ]);

  // Hat generators emit code that wraps the next-chain body inside a closure.
  // Blockly's default scrub_ would then ALSO append the next-chain code after
  // the closure, duplicating it. Override scrub_ to skip the next-chain append
  // for hat blocks; the hat generator owns its body via blockToCode(getNextBlock()).
  const _origScrub = js.scrub_ ? js.scrub_.bind(js) : (_b, code) => code;
  js.scrub_ = function (block, code, opt_thisOnly) {
    if (block && HAT_TYPES.has(block.type)) return code;
    return _origScrub(block, code, opt_thisOnly);
  };

  // Placeholder generators — replaced by real ones in Tasks 3-9.
  for (const t of HAT_TYPES) {
    js[t] = () => '';
  }
```

- [ ] **Step 9: Re-run; both new tests should pass**

```bash
node --test tests/js/blockly/event-hats-generators.test.js 2>&1 | tail -10
```

Expected: 6 passing.

- [ ] **Step 10: Run the full JS suite to confirm no regression**

```bash
node --test 'tests/js/**/*.test.js' 2>&1 | grep -E "^ℹ tests|^ℹ pass|^ℹ fail"
```

Expected: same count as baseline (3 pre-existing tab.test.js failures stay; everything else green). The existing `generators-smoke.test.js` `every hat (event) generator returns empty string` test still passes because the placeholder still emits `''`.

- [ ] **Step 11: Commit**

```bash
git add js/blockly_config.js tests/js/blockly/event-hats-generators.test.js
git commit -m "feat(event-hats): scaffolding — preamble vars, scrub_ override, epilogue"
```

---

## Task 2: Update the existing hat-empty-string smoke test

Once Task 1 lands, the empty-string assertion in `generators-smoke.test.js` will no longer reflect intended behavior (subsequent tasks will replace the placeholders). Loosen the assertion now so future task commits don't fail it.

**Files:**
- Modify: `tests/js/blockly/generators-smoke.test.js`

- [ ] **Step 1: Replace the hat-empty-string test**

In `tests/js/blockly/generators-smoke.test.js`, find:

```javascript
test('every hat (event) generator returns empty string', () => {
  const { Blockly } = setupGenerators();
  const block = makeBlock();
  for (const name of HAT_GENERATORS) {
    const fn = Blockly.JavaScript[name];
    assert.ok(typeof fn === 'function', `${name} not registered`);
    const result = fn(block);
    assert.strictEqual(result, '',
      `${name}: hat blocks must emit empty string, got ${JSON.stringify(result).slice(0, 60)}`);
  }
});
```

Replace with:

```javascript
test('every hat (event) generator is registered and returns a string', () => {
  // Hats emit either an empty string (placeholder), a `_mainBody = ...`
  // assignment, or a `_hats.push(async () => { ... })` polling closure. The
  // contract this smoke test pins is just "registered and returns a string" —
  // shape assertions for each hat live in event-hats-generators.test.js.
  const { Blockly } = setupGenerators();
  const block = makeBlock();
  for (const name of HAT_GENERATORS) {
    const fn = Blockly.JavaScript[name];
    assert.ok(typeof fn === 'function', `${name} not registered`);
    const result = fn(block);
    assert.strictEqual(typeof result, 'string',
      `${name}: hat generator should return a string, got ${typeof result}`);
  }
});
```

- [ ] **Step 2: Run the smoke test**

```bash
node --test tests/js/blockly/generators-smoke.test.js 2>&1 | tail -10
```

Expected: all generators-smoke tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/js/blockly/generators-smoke.test.js
git commit -m "test(event-hats): loosen smoke contract — hat generators return any string"
```

---

## Task 3: `whenProgramStarts` generator

Emits `_mainBody = async () => { <body>; };`. No condition, no polling task — the body becomes the program driver.

**Files:**
- Modify: `js/blockly_config.js`
- Modify: `tests/js/blockly/event-hats-generators.test.js`

- [ ] **Step 1: Append the failing test**

Append to `tests/js/blockly/event-hats-generators.test.js`:

```javascript
// ── whenProgramStarts ──────────────────────────────────────────────────────

function makeHatBlock(type, fields = {}, nextBlock = null) {
  // Synthetic Blockly block for generator tests. `getNextBlock` returns the
  // block attached below the hat (its body). The real Blockly.JavaScript
  // recurses into that via blockToCode; tests can stub the recursion by
  // overriding what blockToCode returns.
  return {
    type,
    id: 'test-' + type,
    getFieldValue(name) { return name in fields ? fields[name] : ''; },
    getInputTargetBlock() { return null; },
    getNextBlock: () => nextBlock,
    nextConnection: { targetBlock: () => nextBlock },
  };
}

function setupAndRunGenerator(type, fields, nextBodyCode) {
  // Drive registerGenerators, monkey-patch blockToCode to return our stub
  // body for the next block, invoke the hat generator, return the source.
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  const js = env.Blockly.JavaScript;
  const next = nextBodyCode ? makeHatBlock('test-body') : null;
  // Stub blockToCode so the hat's blockToCode(getNextBlock()) call returns
  // our scripted body code instead of trying to recurse into a real block.
  const origBlockToCode = js.blockToCode.bind(js);
  js.blockToCode = (b) => (b === next ? nextBodyCode : origBlockToCode(b));
  const block = makeHatBlock(type, fields, next);
  return js[type](block);
}

test('whenProgramStarts: emits _mainBody = async closure containing the body', () => {
  const code = setupAndRunGenerator(
    'flipperevents_whenProgramStarts', {}, "window.sim._sleep(100);\n",
  );
  assert.ok(code.includes('_mainBody = async () => {'),
    `expected _mainBody assignment, got:\n${code}`);
  assert.ok(code.includes('window.sim._sleep(100);'),
    `expected body inlined inside closure, got:\n${code}`);
  assert.ok(code.trim().endsWith('};'),
    `expected closure to terminate cleanly, got tail:\n${code.slice(-100)}`);
});

test('whenProgramStarts: empty body still emits a no-op closure', () => {
  const code = setupAndRunGenerator('flipperevents_whenProgramStarts', {}, '');
  assert.ok(code.includes('_mainBody = async () => {'),
    `expected _mainBody assignment, got:\n${code}`);
});
```

- [ ] **Step 2: Run; verify failure**

```bash
node --test tests/js/blockly/event-hats-generators.test.js -t whenProgramStarts 2>&1 | tail -10
```

Expected: both tests fail — current placeholder returns `''`.

- [ ] **Step 3: Implement the generator**

In `js/blockly_config.js`, inside `registerGenerators`, AFTER the `HAT_TYPES` Set + scrub_ override and AFTER the placeholder loop, add this generator (which overrides the placeholder for this type):

```javascript
  js['flipperevents_whenProgramStarts'] = (block) => {
    const next = block.getNextBlock ? block.getNextBlock() : null;
    const body = next ? js.blockToCode(next) : '';
    return `_mainBody = async () => {\n${body}};\n`;
  };
```

- [ ] **Step 4: Re-run; verify pass**

```bash
node --test tests/js/blockly/event-hats-generators.test.js -t whenProgramStarts 2>&1 | tail -10
```

Expected: 2 passing.

- [ ] **Step 5: Run the full JS suite to confirm no regression**

```bash
node --test 'tests/js/**/*.test.js' 2>&1 | grep -E "^ℹ tests|^ℹ pass|^ℹ fail"
```

- [ ] **Step 6: Commit**

```bash
git add js/blockly_config.js tests/js/blockly/event-hats-generators.test.js
git commit -m "feat(event-hats): whenProgramStarts generator emits _mainBody assignment"
```

---

## Task 4: `_emitHatPollingTask` helper + `whenPressed` generator

First polling-task hat. Introduces the shared helper for boolean-prev hats. `whenPressed` has four `OPTION` variants (`pressed`, `hard-pressed`, `released`, `pressure changed`); the first three use the boolean-prev helper, the last needs custom numeric-prev logic.

**Files:**
- Modify: `js/blockly_config.js`
- Modify: `tests/js/blockly/event-hats-generators.test.js`

- [ ] **Step 1: Write failing tests for all four whenPressed variants**

Append to `tests/js/blockly/event-hats-generators.test.js`:

```javascript
// ── whenPressed ────────────────────────────────────────────────────────────

test('whenPressed pressed: emits polling task with getForceSensorPressed', () => {
  const code = setupAndRunGenerator(
    'flipperevents_whenPressed',
    { PORT: 'C', OPTION: 'pressed' },
    "window.sim.stop();\n",
  );
  assert.ok(code.startsWith('_hats.push(async () => {'),
    `expected polling-task push, got:\n${code.slice(0, 200)}`);
  assert.ok(code.includes('const cur = window.sim.getForceSensorPressed();'),
    `expected getForceSensorPressed in cur, got:\n${code}`);
  assert.ok(code.includes("_hatPrev['"),
    `expected _hatPrev edge-detect`);
  assert.ok(code.includes("_hatBusy['"),
    `expected _hatBusy guard`);
  assert.ok(code.includes('window.sim.stop();'),
    `expected body inside try block`);
  assert.ok(code.includes('requestAnimationFrame'),
    `expected rAF yield`);
});

test('whenPressed hard-pressed: condition uses getForceSensorValue >= 70', () => {
  const code = setupAndRunGenerator(
    'flipperevents_whenPressed',
    { PORT: 'C', OPTION: 'hard-pressed' },
    '',
  );
  assert.ok(code.includes('const cur = window.sim.getForceSensorValue() >= 70;'),
    `expected hard-pressed threshold, got:\n${code}`);
});

test('whenPressed released: condition negates getForceSensorPressed', () => {
  const code = setupAndRunGenerator(
    'flipperevents_whenPressed',
    { PORT: 'C', OPTION: 'released' },
    '',
  );
  assert.ok(code.includes('const cur = !window.sim.getForceSensorPressed();'),
    `expected released condition, got:\n${code}`);
});

test('whenPressed pressure-changed: uses numeric !== edge', () => {
  const code = setupAndRunGenerator(
    'flipperevents_whenPressed',
    { PORT: 'C', OPTION: 'pressure changed' },
    "window.appendOutput('changed');\n",
  );
  // Numeric prev: seeded outside the while loop at hat start; cur compared
  // via !== rather than && !prev.
  assert.ok(code.includes("_hatPrev['test-flipperevents_whenPressed'] = window.sim.getForceSensorValue();"),
    `expected numeric prev seed at hat start, got:\n${code}`);
  assert.ok(code.includes('const cur = window.sim.getForceSensorValue();'),
    `expected numeric cur, got:\n${code}`);
  assert.ok(code.includes("cur !== _hatPrev['"),
    `expected !== edge comparison, got:\n${code}`);
});
```

- [ ] **Step 2: Run; verify failures**

```bash
node --test tests/js/blockly/event-hats-generators.test.js -t whenPressed 2>&1 | tail -15
```

Expected: 4 failures.

- [ ] **Step 3: Implement the helper and the generator**

In `js/blockly_config.js`, inside `registerGenerators`, AFTER the `HAT_TYPES` / scrub_ / placeholder loop and the `whenProgramStarts` generator, add a private helper and the generator:

```javascript
  // ── Event-hat helpers ──────────────────────────────────────────────────────

  // emitBoolHatPoll: standard polling task for boolean-condition hats.
  // condExpr is a JS expression producing the current truthiness. opts.oneShot
  // adds a `_hatFired` gate and sets it inside the body.
  function emitBoolHatPoll(block, condExpr, opts = {}) {
    const id   = block.id;
    const next = block.getNextBlock ? block.getNextBlock() : null;
    const body = next ? js.blockToCode(next) : '';
    const fireGate = opts.oneShot ? ` && !_hatFired['${id}']` : '';
    const oneShotSet = opts.oneShot ? `\n        _hatFired['${id}'] = true;` : '';
    return [
      `_hats.push(async () => {`,
      `  while (window.sim.isRunning) {`,
      `    const cur = ${condExpr};`,
      `    if (cur && !_hatPrev['${id}'] && !_hatBusy['${id}']${fireGate}) {`,
      `      _hatBusy['${id}'] = true;`,
      `      try {`,
      `${body}${oneShotSet}`,
      `      } catch (e) {`,
      `        if (window.appendOutput) window.appendOutput('[Error] hat: ' + ((e && e.message) || e), 'error');`,
      `      } finally {`,
      `        _hatBusy['${id}'] = false;`,
      `      }`,
      `    }`,
      `    _hatPrev['${id}'] = cur;`,
      `    await new Promise(r => requestAnimationFrame(r));`,
      `  }`,
      `});`,
      ``,
    ].join('\n');
  }

  // emitNumericHatPoll: numeric-prev polling task for "X changed" style hats.
  // Uses !== for edge detection; seeds _hatPrev at hat start so the first
  // frame doesn't fire spuriously.
  function emitNumericHatPoll(block, valueExpr) {
    const id   = block.id;
    const next = block.getNextBlock ? block.getNextBlock() : null;
    const body = next ? js.blockToCode(next) : '';
    return [
      `_hats.push(async () => {`,
      `  _hatPrev['${id}'] = ${valueExpr};`,
      `  while (window.sim.isRunning) {`,
      `    const cur = ${valueExpr};`,
      `    if (cur !== _hatPrev['${id}'] && !_hatBusy['${id}']) {`,
      `      _hatBusy['${id}'] = true;`,
      `      try {`,
      `${body}      } catch (e) {`,
      `        if (window.appendOutput) window.appendOutput('[Error] hat: ' + ((e && e.message) || e), 'error');`,
      `      } finally {`,
      `        _hatBusy['${id}'] = false;`,
      `      }`,
      `    }`,
      `    _hatPrev['${id}'] = cur;`,
      `    await new Promise(r => requestAnimationFrame(r));`,
      `  }`,
      `});`,
      ``,
    ].join('\n');
  }

  js['flipperevents_whenPressed'] = (block) => {
    const option = block.getFieldValue('OPTION');
    if (option === 'hard-pressed') return emitBoolHatPoll(block, 'window.sim.getForceSensorValue() >= 70');
    if (option === 'released')     return emitBoolHatPoll(block, '!window.sim.getForceSensorPressed()');
    if (option === 'pressure changed') return emitNumericHatPoll(block, 'window.sim.getForceSensorValue()');
    // Default: 'pressed'
    return emitBoolHatPoll(block, 'window.sim.getForceSensorPressed()');
  };
```

- [ ] **Step 4: Re-run; verify pass**

```bash
node --test tests/js/blockly/event-hats-generators.test.js -t whenPressed 2>&1 | tail -10
```

Expected: 4 passing.

- [ ] **Step 5: Run full JS suite**

```bash
node --test 'tests/js/**/*.test.js' 2>&1 | grep -E "^ℹ tests|^ℹ pass|^ℹ fail"
```

Expected: no new failures.

- [ ] **Step 6: Commit**

```bash
git add js/blockly_config.js tests/js/blockly/event-hats-generators.test.js
git commit -m "feat(event-hats): whenPressed generator (4 OPTION variants) + polling helpers"
```

---

## Task 5: `whenColor` generator

Boolean-prev polling on `window.sim.getColorSensorColor() === '<OPTION>'`.

**Files:**
- Modify: `js/blockly_config.js`
- Modify: `tests/js/blockly/event-hats-generators.test.js`

- [ ] **Step 1: Write failing test**

Append to `tests/js/blockly/event-hats-generators.test.js`:

```javascript
// ── whenColor ──────────────────────────────────────────────────────────────

test('whenColor: emits polling task with color comparison', () => {
  const code = setupAndRunGenerator(
    'flipperevents_whenColor',
    { PORT: 'E', OPTION: 'red' },
    "window.sim.stop();\n",
  );
  assert.ok(code.startsWith('_hats.push(async () => {'),
    `expected polling-task push`);
  assert.ok(code.includes("const cur = window.sim.getColorSensorColor() === 'red';"),
    `expected color comparison, got:\n${code}`);
  assert.ok(code.includes('window.sim.stop();'),
    `expected body inside try block`);
});

test('whenColor: color name is JSON-safe (no quote injection)', () => {
  const code = setupAndRunGenerator(
    'flipperevents_whenColor',
    { PORT: 'E', OPTION: "it's-pink" },
    '',
  );
  // Shouldn't produce a syntax error from the quote in the color name.
  // The generator must JSON-quote the value.
  assert.ok(code.includes(`"it's-pink"`) || code.includes(`'it\\'s-pink'`),
    `expected safely-quoted color, got:\n${code}`);
});
```

- [ ] **Step 2: Run; verify failure**

```bash
node --test tests/js/blockly/event-hats-generators.test.js -t whenColor 2>&1 | tail -10
```

- [ ] **Step 3: Implement the generator**

In `js/blockly_config.js`, after `js['flipperevents_whenPressed']`:

```javascript
  js['flipperevents_whenColor'] = (block) => {
    const color = block.getFieldValue('OPTION');
    return emitBoolHatPoll(block, `window.sim.getColorSensorColor() === ${JSON.stringify(color)}`);
  };
```

- [ ] **Step 4: Re-run; verify pass**

```bash
node --test tests/js/blockly/event-hats-generators.test.js -t whenColor 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add js/blockly_config.js tests/js/blockly/event-hats-generators.test.js
git commit -m "feat(event-hats): whenColor generator polls getColorSensorColor"
```

---

## Task 6: `whenDistance` generator

Boolean-prev polling on `window.sim.getDistanceSensorValue() <comparator> <mm>`. Unit conversion happens at generator time (cm × 10, inches × 25.4, % × `DIST_SENSOR_MAX_MM`/100 where `DIST_SENSOR_MAX_MM = 2000`). The `=` comparator uses a ±10 mm tolerance band.

**Files:**
- Modify: `js/blockly_config.js`
- Modify: `tests/js/blockly/event-hats-generators.test.js`

- [ ] **Step 1: Write failing tests**

Append:

```javascript
// ── whenDistance ───────────────────────────────────────────────────────────

// whenDistance has a VALUE input (not a field), so we need to stub
// js.valueToCode to return the number string.
function setupWhenDistance(comparator, valueStr, unit, body = '') {
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  const js = env.Blockly.JavaScript;
  const block = makeHatBlock('flipperevents_whenDistance', { COMPARATOR: comparator, UNIT: unit });
  // valueToCode lookup for input VALUE
  const origValueToCode = js.valueToCode ? js.valueToCode.bind(js) : null;
  js.valueToCode = (b, name) => (b === block && name === 'VALUE' ? valueStr : (origValueToCode ? origValueToCode(b, name) : ''));
  // body for the next-chain
  const origBlockToCode = js.blockToCode.bind(js);
  const next = body ? { _stub: true } : null;
  if (next) {
    block.getNextBlock = () => next;
    js.blockToCode = (b) => (b === next ? body : origBlockToCode(b));
  }
  return js['flipperevents_whenDistance'](block);
}

test('whenDistance closer-than cm: emits < with mm conversion', () => {
  const code = setupWhenDistance('<', '10', 'cm', "window.sim.stop();\n");
  assert.ok(code.includes('window.sim.getDistanceSensorValue() < 100'),
    `expected 10 cm → 100 mm threshold, got:\n${code}`);
});

test('whenDistance closer-than inches: emits < with mm conversion', () => {
  const code = setupWhenDistance('<', '5', 'inches', '');
  // 5 × 25.4 = 127
  assert.ok(code.includes('window.sim.getDistanceSensorValue() < 127'),
    `expected 5 in → 127 mm threshold, got:\n${code}`);
});

test('whenDistance closer-than %: emits < with percent-of-max conversion', () => {
  // DIST_SENSOR_MAX_MM = 2000; 25 % → 500 mm
  const code = setupWhenDistance('<', '25', '%', '');
  assert.ok(code.includes('window.sim.getDistanceSensorValue() < 500'),
    `expected 25 % → 500 mm threshold, got:\n${code}`);
});

test('whenDistance further-than: emits > with mm conversion', () => {
  const code = setupWhenDistance('>', '30', 'cm', '');
  assert.ok(code.includes('window.sim.getDistanceSensorValue() > 300'),
    `expected 30 cm → 300 mm with >, got:\n${code}`);
});

test('whenDistance exactly-at: emits tolerance band (Math.abs … <= 10)', () => {
  const code = setupWhenDistance('=', '20', 'cm', '');
  // Tolerance band of ±10 mm around 200 mm.
  assert.ok(code.includes('Math.abs(window.sim.getDistanceSensorValue() - 200) <= 10'),
    `expected exact-match tolerance band, got:\n${code}`);
});
```

- [ ] **Step 2: Run; verify failures**

```bash
node --test tests/js/blockly/event-hats-generators.test.js -t whenDistance 2>&1 | tail -15
```

- [ ] **Step 3: Implement the generator**

In `js/blockly_config.js`, after `js['flipperevents_whenColor']`:

```javascript
  js['flipperevents_whenDistance'] = (block) => {
    const comp   = block.getFieldValue('COMPARATOR');
    const unit   = block.getFieldValue('UNIT');
    const valStr = js.valueToCode ? js.valueToCode(block, 'VALUE', ORDER_ATOMIC) : '0';
    const raw    = parseFloat(valStr);
    const value  = isNaN(raw) ? 0 : raw;
    // Convert to mm at generator time so the polling expression is just an int.
    const DIST_MAX_MM = 2000;  // matches simulator's DIST_SENSOR_MAX_MM
    let mm;
    if (unit === 'cm')      mm = Math.round(value * 10);
    else if (unit === 'inches') mm = Math.round(value * 25.4);
    else if (unit === '%')  mm = Math.round((value * DIST_MAX_MM) / 100);
    else                    mm = Math.round(value);
    let cond;
    if (comp === '<')      cond = `window.sim.getDistanceSensorValue() < ${mm}`;
    else if (comp === '>') cond = `window.sim.getDistanceSensorValue() > ${mm}`;
    else                   cond = `Math.abs(window.sim.getDistanceSensorValue() - ${mm}) <= 10`;  // '=' band
    return emitBoolHatPoll(block, cond);
  };
```

- [ ] **Step 4: Re-run; verify pass**

```bash
node --test tests/js/blockly/event-hats-generators.test.js -t whenDistance 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add js/blockly_config.js tests/js/blockly/event-hats-generators.test.js
git commit -m "feat(event-hats): whenDistance generator with unit conversion + tolerance band"
```

---

## Task 7: `whenTimer` generator

One-shot polling on `(performance.now() - _t0) >= <ms>`. Uses the `oneShot: true` option in `emitBoolHatPoll`, which adds the `_hatFired` gate and sets the flag inside the body.

**Files:**
- Modify: `js/blockly_config.js`
- Modify: `tests/js/blockly/event-hats-generators.test.js`

- [ ] **Step 1: Write failing tests**

Append:

```javascript
// ── whenTimer ──────────────────────────────────────────────────────────────

function setupWhenTimer(secondsStr, body = '') {
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  const js = env.Blockly.JavaScript;
  const block = makeHatBlock('flipperevents_whenTimer', {});
  js.valueToCode = (b, name) => (b === block && name === 'VALUE' ? secondsStr : '0');
  if (body) {
    const next = { _stub: true };
    block.getNextBlock = () => next;
    const origBlockToCode = js.blockToCode.bind(js);
    js.blockToCode = (b) => (b === next ? body : origBlockToCode(b));
  }
  return js['flipperevents_whenTimer'](block);
}

test('whenTimer: emits one-shot polling with elapsed-ms threshold', () => {
  const code = setupWhenTimer('2', "window.sim.stop();\n");
  // 2 s → 2000 ms.
  assert.ok(code.includes('(performance.now() - _t0) >= 2000'),
    `expected elapsed-ms threshold, got:\n${code}`);
});

test('whenTimer: gated by _hatFired (one-shot)', () => {
  const code = setupWhenTimer('1', '');
  assert.ok(code.includes(`!_hatFired['`),
    `expected _hatFired gate, got:\n${code}`);
  assert.ok(code.includes(`_hatFired['`) && code.includes(`] = true;`),
    `expected _hatFired set inside body, got:\n${code}`);
});

test('whenTimer: fractional seconds round to ms', () => {
  const code = setupWhenTimer('0.5', '');
  assert.ok(code.includes('>= 500'),
    `expected 0.5 s → 500 ms, got:\n${code}`);
});
```

- [ ] **Step 2: Run; verify failures**

```bash
node --test tests/js/blockly/event-hats-generators.test.js -t whenTimer 2>&1 | tail -10
```

- [ ] **Step 3: Implement the generator**

In `js/blockly_config.js`, after `js['flipperevents_whenDistance']`:

```javascript
  js['flipperevents_whenTimer'] = (block) => {
    const valStr  = js.valueToCode ? js.valueToCode(block, 'VALUE', ORDER_ATOMIC) : '0';
    const seconds = parseFloat(valStr);
    const ms      = isNaN(seconds) ? 0 : Math.round(seconds * 1000);
    return emitBoolHatPoll(block, `(performance.now() - _t0) >= ${ms}`, { oneShot: true });
  };
```

- [ ] **Step 4: Re-run; verify pass**

```bash
node --test tests/js/blockly/event-hats-generators.test.js -t whenTimer 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add js/blockly_config.js tests/js/blockly/event-hats-generators.test.js
git commit -m "feat(event-hats): whenTimer one-shot generator gated by _hatFired"
```

---

## Task 8: `whenCondition` generator

Boolean-prev polling on whatever the user wires into the `CONDITION` input. Works with any boolean reporter the existing generators provide.

**Files:**
- Modify: `js/blockly_config.js`
- Modify: `tests/js/blockly/event-hats-generators.test.js`

- [ ] **Step 1: Write failing test**

Append:

```javascript
// ── whenCondition ──────────────────────────────────────────────────────────

test('whenCondition: wraps the CONDITION input in !!(…) and polls', () => {
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  const js = env.Blockly.JavaScript;
  const block = makeHatBlock('flipperevents_whenCondition', {});
  js.valueToCode = (b, name) => (b === block && name === 'CONDITION'
    ? '(window.sim.robot.x > 1000)' : 'false');
  const code = js['flipperevents_whenCondition'](block);
  assert.ok(code.startsWith('_hats.push(async () => {'),
    `expected polling-task push, got head:\n${code.slice(0, 80)}`);
  assert.ok(code.includes('const cur = !!((window.sim.robot.x > 1000));'),
    `expected wrapped boolean condition, got:\n${code}`);
});

test('whenCondition: empty CONDITION falls back to false', () => {
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  const js = env.Blockly.JavaScript;
  const block = makeHatBlock('flipperevents_whenCondition', {});
  js.valueToCode = () => '';
  const code = js['flipperevents_whenCondition'](block);
  assert.ok(code.includes('const cur = !!(false);'),
    `expected false fallback, got:\n${code}`);
});
```

- [ ] **Step 2: Run; verify failures**

```bash
node --test tests/js/blockly/event-hats-generators.test.js -t whenCondition 2>&1 | tail -10
```

- [ ] **Step 3: Implement the generator**

In `js/blockly_config.js`, after `js['flipperevents_whenTimer']`:

```javascript
  js['flipperevents_whenCondition'] = (block) => {
    const condStr = js.valueToCode ? js.valueToCode(block, 'CONDITION', ORDER_ATOMIC) : '';
    const inner = condStr.trim() === '' ? 'false' : `(${condStr})`;
    return emitBoolHatPoll(block, `!!(${inner})`);
  };
```

- [ ] **Step 4: Re-run; verify pass**

```bash
node --test tests/js/blockly/event-hats-generators.test.js -t whenCondition 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add js/blockly_config.js tests/js/blockly/event-hats-generators.test.js
git commit -m "feat(event-hats): whenCondition generator polls a user-wired boolean"
```

---

## Task 9: Five stub-warn generators

`whenButton`, `whenTilted`, `whenOrientation`, `whenGesture`, `event_whenbroadcastreceived`. Each emits a one-shot warning at program start plus a no-op polling loop so `Promise.all` cleanup works the same way.

**Files:**
- Modify: `js/blockly_config.js`
- Modify: `tests/js/blockly/event-hats-generators.test.js`

- [ ] **Step 1: Write failing tests**

Append:

```javascript
// ── Stub-warn hats ─────────────────────────────────────────────────────────

const STUB_HATS = [
  { type: 'flipperevents_whenButton',          msg: 'hub-button API isn'  },
  { type: 'flipperevents_whenTilted',          msg: 'motion sensor isn'   },
  { type: 'flipperevents_whenOrientation',     msg: 'motion sensor isn'   },
  { type: 'flipperevents_whenGesture',         msg: 'motion sensor isn'   },
  { type: 'event_whenbroadcastreceived',       msg: 'broadcast runtime isn' },
];

for (const { type, msg } of STUB_HATS) {
  test(`${type}: emits stub-warn IIFE + no-op polling loop`, () => {
    const env = makeBlocklyEnv();
    env.window.initBlockly('blockly-div', 'light');
    const block = makeHatBlock(type, {});
    const code = env.Blockly.JavaScript[type](block);
    // Warn IIFE
    assert.ok(code.includes('window.appendOutput'),
      `${type}: expected appendOutput call, got:\n${code}`);
    assert.ok(code.includes(msg),
      `${type}: expected reason mentioning "${msg}", got:\n${code}`);
    // No-op polling loop so Promise.all winds down cleanly on isRunning=false
    assert.ok(code.includes('_hats.push(async () => {'),
      `${type}: expected _hats.push wrapping the no-op poll`);
    assert.ok(code.includes('window.sim.isRunning'),
      `${type}: expected isRunning loop guard`);
    assert.ok(code.includes('requestAnimationFrame'),
      `${type}: expected rAF yield`);
  });
}
```

- [ ] **Step 2: Run; verify failures**

```bash
node --test tests/js/blockly/event-hats-generators.test.js -t "stub-warn" 2>&1 | tail -20
```

- [ ] **Step 3: Implement the stub-warn helper + 5 generators**

In `js/blockly_config.js`, after `js['flipperevents_whenCondition']`:

```javascript
  // Stub-warn: hats whose underlying API isn't implemented yet. They emit a
  // one-line warning at program start and a no-op polling loop so they wind
  // down with Promise.all when isRunning flips to false.
  function emitStubWarnHat(kind, reason) {
    return [
      `;(function () {`,
      `  var _msg = "[!] when ${kind}: ${reason} — this hat won't fire";`,
      `  if (window.appendOutput) window.appendOutput(_msg, 'warn');`,
      `  else if (typeof console !== 'undefined' && console.warn) console.warn(_msg);`,
      `})();`,
      `_hats.push(async () => {`,
      `  while (window.sim.isRunning) { await new Promise(r => requestAnimationFrame(r)); }`,
      `});`,
      ``,
    ].join('\n');
  }

  js['flipperevents_whenButton']      = () => emitStubWarnHat('button',      "hub-button API isn't implemented yet");
  js['flipperevents_whenTilted']      = () => emitStubWarnHat('tilted',      "motion sensor isn't implemented yet");
  js['flipperevents_whenOrientation'] = () => emitStubWarnHat('orientation', "motion sensor isn't implemented yet");
  js['flipperevents_whenGesture']     = () => emitStubWarnHat('gesture',     "motion sensor isn't implemented yet");
  js['event_whenbroadcastreceived']   = () => emitStubWarnHat('broadcast',   "broadcast runtime isn't implemented yet");
```

- [ ] **Step 4: Re-run; verify all pass**

```bash
node --test tests/js/blockly/event-hats-generators.test.js -t "stub-warn" 2>&1 | tail -10
```

- [ ] **Step 5: Run full event-hats generators suite + full JS suite**

```bash
node --test tests/js/blockly/event-hats-generators.test.js 2>&1 | tail -5
node --test 'tests/js/**/*.test.js' 2>&1 | grep -E "^ℹ tests|^ℹ pass|^ℹ fail"
```

Expected: all green except the same 3 pre-existing tab.test.js failures.

- [ ] **Step 6: Commit**

```bash
git add js/blockly_config.js tests/js/blockly/event-hats-generators.test.js
git commit -m "feat(event-hats): stub-warn generators for whenButton/Tilted/Orientation/Gesture/broadcast"
```

---

## Task 10: Runtime integration tests

Build a workspace, generate source, run it via `new AsyncFunction(...)` against a stub `window.sim` + stub `requestAnimationFrame`. Verify edge-trigger, drop-while-busy, isRunning cancellation, one-shot timer.

**Files:**
- Create: `tests/js/blockly/event-hats-runtime.test.js`

- [ ] **Step 1: Write the test file**

Create `tests/js/blockly/event-hats-runtime.test.js`:

```javascript
'use strict';

// End-to-end tests that drive the generated source (preamble + hat-task
// closures + epilogue) through new AsyncFunction(...) against a stubbed
// window.sim and a controllable requestAnimationFrame. We don't go through
// Blockly's workspaceToCode here — instead we hand-write the source pieces
// using the same shape the generators emit, so we can pin runtime behaviour
// independently of the generator output (those are covered in
// event-hats-generators.test.js).

const test   = require('node:test');
const assert = require('node:assert');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// Minimal preamble matching what generateBlocklyJS emits.
const PREAMBLE = [
  `var _hats     = [];`,
  `var _mainBody = null;`,
  `var _hatBusy  = {};`,
  `var _hatPrev  = {};`,
  `var _hatFired = {};`,
  `var _t0       = performance.now();`,
].join('\n');

// Minimal epilogue matching what generateBlocklyJS emits. Hats are started
// BEFORE _mainBody so they're polling on the event loop while main runs —
// otherwise a `forever` main + a `when pressed → stop` hat deadlocks (main
// loops forever because the hat that would flip isRunning never gets called).
const EPILOGUE = [
  `await (async () => {`,
  `  const _hatPromises = _hats.map(h => h());`,
  `  if (_mainBody) {`,
  `    try { await _mainBody(); } finally { window.sim.isRunning = false; }`,
  `  }`,
  `  await Promise.all(_hatPromises);`,
  `})();`,
].join('\n');

function makeStubSim(overrides = {}) {
  const sim = {
    isRunning: true,
    pressed:   false,
    color:     'none',
    distance:  300,
    forceN:    0,
    stopCalls: 0,
    stop()    { this.isRunning = false; this.stopCalls++; },
    getForceSensorPressed() { return this.pressed; },
    getForceSensorValue()   { return this.forceN; },
    getColorSensorColor()   { return this.color; },
    getDistanceSensorValue(){ return this.distance; },
    ...overrides,
  };
  return sim;
}

function runProgram(source) {
  // requestAnimationFrame is run synchronously to keep tests deterministic.
  // performance.now is wall-clock; tests that need control over time inject
  // their own monkey-patch via the global setup before calling runProgram.
  const fn = new AsyncFunction(source);
  return fn();
}

// Each test runs with its own globalThis.window stub. setupWindow wires the
// stub sim and a deterministic rAF that schedules via setImmediate so tests
// can interleave with the polling loops via await.
function setupWindow(simOverrides = {}) {
  const sim = makeStubSim(simOverrides);
  const appendOutputCalls = [];
  globalThis.window = {
    sim,
    appendOutput: (msg, kind) => appendOutputCalls.push({ msg, kind }),
  };
  globalThis.requestAnimationFrame = (cb) => setImmediate(cb);
  return { sim, appendOutputCalls };
}

function teardown() {
  delete globalThis.window;
  delete globalThis.requestAnimationFrame;
}

// ── Tests ──────────────────────────────────────────────────────────────────

test('whenProgramStarts only: program ends when main returns', async () => {
  const { sim } = setupWindow();
  const main = `_mainBody = async () => { window.sim.beeped = true; };\n`;
  try {
    await runProgram(PREAMBLE + '\n' + main + '\n' + EPILOGUE);
    assert.strictEqual(sim.beeped, true);
    assert.strictEqual(sim.isRunning, false, 'isRunning flipped after main returned');
  } finally { teardown(); }
});

test('whenPressed edge-trigger: body fires once per false→true transition', async () => {
  const { sim } = setupWindow();
  // Scripted press sequence drained one value per poll.
  const seq = [false, false, true, true, true, false, true, false];
  let idx = 0;
  sim.getForceSensorPressed = () => seq[Math.min(idx++, seq.length - 1)];
  // Main exits when sim.fires hits 2 — gives the hat a chance to see both transitions.
  const main = `_mainBody = async () => {
    while (window.sim.isRunning && (window.sim.fires || 0) < 2) {
      await new Promise(r => requestAnimationFrame(r));
    }
  };`;
  const hat = `_hats.push(async () => {
    while (window.sim.isRunning) {
      const cur = window.sim.getForceSensorPressed();
      if (cur && !_hatPrev['h1'] && !_hatBusy['h1']) {
        _hatBusy['h1'] = true;
        try { window.sim.fires = (window.sim.fires || 0) + 1; }
        finally { _hatBusy['h1'] = false; }
      }
      _hatPrev['h1'] = cur;
      await new Promise(r => requestAnimationFrame(r));
    }
  });`;
  try {
    await runProgram(PREAMBLE + '\n' + main + '\n' + hat + '\n' + EPILOGUE);
    assert.strictEqual(sim.fires, 2, 'edge-trigger fired exactly twice for two false→true transitions');
  } finally { teardown(); }
});

test('drop-while-busy: re-triggers during body execution are dropped', async () => {
  const { sim } = setupWindow();
  // Condition is permanently true.
  sim.getForceSensorPressed = () => true;
  const main = `_mainBody = async () => {
    // Wait long enough for the hat body to start and several poll ticks to elapse.
    for (let i = 0; i < 10; i++) await new Promise(r => requestAnimationFrame(r));
  };`;
  const hat = `_hats.push(async () => {
    while (window.sim.isRunning) {
      const cur = window.sim.getForceSensorPressed();
      if (cur && !_hatPrev['h1'] && !_hatBusy['h1']) {
        _hatBusy['h1'] = true;
        try {
          // Body holds for 5 polling ticks — drop-while-busy must prevent re-fire.
          window.sim.fires = (window.sim.fires || 0) + 1;
          for (let i = 0; i < 5; i++) await new Promise(r => requestAnimationFrame(r));
        } finally { _hatBusy['h1'] = false; }
      }
      _hatPrev['h1'] = cur;
      await new Promise(r => requestAnimationFrame(r));
    }
  });`;
  try {
    await runProgram(PREAMBLE + '\n' + main + '\n' + hat + '\n' + EPILOGUE);
    assert.strictEqual(sim.fires, 1, 'drop-while-busy permitted only one fire');
  } finally { teardown(); }
});

test('stop() inside hat body unwinds main and hats together', async () => {
  const { sim } = setupWindow();
  sim.getForceSensorPressed = () => true;  // hat will fire on first poll
  const main = `_mainBody = async () => {
    // Main is a forever-loop; only exits when isRunning flips.
    while (window.sim.isRunning) { await new Promise(r => requestAnimationFrame(r)); }
  };`;
  const hat = `_hats.push(async () => {
    while (window.sim.isRunning) {
      const cur = window.sim.getForceSensorPressed();
      if (cur && !_hatPrev['h1'] && !_hatBusy['h1']) {
        _hatBusy['h1'] = true;
        try { window.sim.stop(); }
        finally { _hatBusy['h1'] = false; }
      }
      _hatPrev['h1'] = cur;
      await new Promise(r => requestAnimationFrame(r));
    }
  });`;
  try {
    await runProgram(PREAMBLE + '\n' + main + '\n' + hat + '\n' + EPILOGUE);
    assert.strictEqual(sim.stopCalls, 1, 'hat body called sim.stop() exactly once');
    assert.strictEqual(sim.isRunning, false, 'isRunning is false after the run');
  } finally { teardown(); }
});

test('one-shot timer: body fires once, _hatFired prevents re-fire', async () => {
  const { sim } = setupWindow();
  // Main waits 10 polling ticks so the timer has many chances to re-fire.
  const main = `_mainBody = async () => {
    for (let i = 0; i < 10; i++) await new Promise(r => requestAnimationFrame(r));
  };`;
  // Condition is permanently true; one-shot gate via _hatFired is what limits it to 1.
  const hat = `_hats.push(async () => {
    while (window.sim.isRunning) {
      const cur = true;  // condition met from frame 1
      if (cur && !_hatPrev['t1'] && !_hatBusy['t1'] && !_hatFired['t1']) {
        _hatBusy['t1'] = true;
        try {
          window.sim.fires = (window.sim.fires || 0) + 1;
          _hatFired['t1'] = true;
        } finally { _hatBusy['t1'] = false; }
      }
      _hatPrev['t1'] = cur;
      await new Promise(r => requestAnimationFrame(r));
    }
  });`;
  try {
    await runProgram(PREAMBLE + '\n' + main + '\n' + hat + '\n' + EPILOGUE);
    assert.strictEqual(sim.fires, 1, 'one-shot fired exactly once');
  } finally { teardown(); }
});

test('stub-warn hat: appendOutput called once at program start', async () => {
  const { sim, appendOutputCalls } = setupWindow();
  // No main; the stub-warn hat itself terminates when isRunning flips. The
  // test flips isRunning externally after one tick.
  const stubHat = `;(function () {
    var _msg = "[!] when button: hub-button API isn't implemented yet — this hat won't fire";
    if (window.appendOutput) window.appendOutput(_msg, 'warn');
  })();
  _hats.push(async () => {
    while (window.sim.isRunning) { await new Promise(r => requestAnimationFrame(r)); }
  });`;
  // Schedule the cancellation.
  setImmediate(() => { sim.isRunning = false; });
  try {
    await runProgram(PREAMBLE + '\n' + stubHat + '\n' + EPILOGUE);
    assert.strictEqual(appendOutputCalls.length, 1, 'warn emitted exactly once');
    assert.match(appendOutputCalls[0].msg, /hub-button API isn/);
    assert.strictEqual(appendOutputCalls[0].kind, 'warn');
  } finally { teardown(); }
});

test('no whenProgramStarts + finite cancellation: program resolves cleanly', async () => {
  const { sim } = setupWindow();
  const hat = `_hats.push(async () => {
    while (window.sim.isRunning) { await new Promise(r => requestAnimationFrame(r)); }
  });`;
  setImmediate(() => setImmediate(() => { sim.isRunning = false; }));
  try {
    await runProgram(PREAMBLE + '\n' + hat + '\n' + EPILOGUE);
    assert.strictEqual(sim.isRunning, false);
  } finally { teardown(); }
});
```

- [ ] **Step 2: Run the runtime tests**

```bash
node --test tests/js/blockly/event-hats-runtime.test.js 2>&1 | tail -15
```

Expected: 7 passing.

- [ ] **Step 3: Run the full JS suite**

```bash
node --test 'tests/js/**/*.test.js' 2>&1 | grep -E "^ℹ tests|^ℹ pass|^ℹ fail"
```

Expected: same as baseline + 7 new passes (and the new generator-output tests from Tasks 3-9 already in the count). 3 pre-existing tab.test.js failures persist.

- [ ] **Step 4: Commit**

```bash
git add tests/js/blockly/event-hats-runtime.test.js
git commit -m "test(event-hats): runtime integration tests via new AsyncFunction"
```

---

## Task 11: Backlog cleanup + manual smoke

Strike the now-resolved entries and validate the screenshot's program end-to-end against the live app.

**Files:**
- Modify: `BACKLOG.md`

- [ ] **Step 1: Strike the event-hat decorative entry**

In `BACKLOG.md`, find the "Event hats" group under "Programming Experience → Blockly". Delete the entire `**\`flipperevents_*\` blocks are decorative.**` bullet **and the two sub-bullets under it** (the fix sketch and the per-hat status table). The "Event hats" section header can also be removed if the bullet was the only one under it. Leave the rest of the Blockly section untouched.

- [ ] **Step 2: Update the hub-button cross-reference**

In the same Blockly → "Sensor-block gaps" section, find:

```markdown
- **Functional hub-button blocks** — see *Hub button* above. (The `when button pressed` hat also needs the event-hat runtime below.)
```

Replace with:

```markdown
- **Functional hub-button blocks** — see *Hub button* above. The `when button pressed` event hat is wired but emits a stub-warn until the underlying `hub.button.pressed()` API returns real values.
```

- [ ] **Step 3: Run all suites**

```bash
node --test 'tests/js/**/*.test.js' 2>&1 | grep -E "^ℹ tests|^ℹ pass|^ℹ fail"
python3 tests/py/run.py 2>&1 | grep -E "^(OK|FAILED|Ran)"
```

Expected: same baseline + new tests; 3 pre-existing tab.test.js failures persist.

- [ ] **Step 4: Manual end-to-end smoke (Blockly)**

Run `python3 -m http.server 8787`. Open the app in a browser. Switch to the Blocks tab. Build the program from the 2026-05-10 screenshot:

- `when program starts` → `forever` → `move ↑ for 50 cm`
- `when force sensor on C is pressed` → `stop moving`

Click Run. The robot starts driving north. Click the Apply button in the Hub panel's Settings section. Within ~16 ms the robot stops, the move loop exits, and the console prints `[Done] Simulation complete.` Click Reset, click Run again, click Apply — repeatable.

Then build a second program:

- `when program starts` → `forever` → `say "tick"` `wait 1 second`
- `when timer > 3 seconds` → `play sound: Beep`

Click Run. After 3 s the beep plays once and never repeats; the `tick / wait` loop keeps going until Stop.

Then build a stub-hat program:

- `when tilted any direction` → `say "tilted"`

Click Run. Console shows `[!] when tilted: motion sensor isn't implemented yet — this hat won't fire`. Click Stop.

If any of these don't behave as described, the runtime or a generator has a bug — file an issue and revisit before merging.

- [ ] **Step 5: Commit**

```bash
git add BACKLOG.md
git commit -m "docs(backlog): strike event-hat decorative entry — runtime landed"
```

---

## Done

The event-hat runtime is live. Six hat types are functional in v1 (`whenProgramStarts`, `whenPressed`, `whenColor`, `whenDistance`, `whenTimer`, `whenCondition`); five emit a one-line warn-on-stub message that points at the underlying API gap. The `Promise.all(_hats)` wrapper inside `generateBlocklyJS`'s epilogue runs all hats concurrently with the `_mainBody` driver, edge-detected on a per-block-id basis, dropping re-fires while a body is running. `sim.isRunning = false` (Stop button or `stop moving` in a hat body) cleanly unwinds main and hats together within one animation frame.
