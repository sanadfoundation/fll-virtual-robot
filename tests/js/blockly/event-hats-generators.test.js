'use strict';

// Tests that generateBlocklyJS emits the event-hat runtime scaffolding:
//   - preamble declares _hats / _mainBody / _hatBusy / _hatPrev / _hatFired / _t0
//   - epilogue awaits _mainBody (if present) then Promise.all(_hats)
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

test('epilogue awaits _mainBody then Promise.all hats', () => {
  const { source } = setupAndGenerate();
  // Must be an IIFE we await; conditionally runs _mainBody; then Promise.all.
  assert.ok(source.includes('await (async () => {'),
    `expected awaited IIFE in epilogue, got:\n${source.slice(-400)}`);
  assert.ok(source.includes('if (_mainBody)'),
    `expected guard on _mainBody`);
  assert.ok(source.includes('Promise.all(_hats.map(h => h()))'),
    `expected Promise.all over _hats`);
  assert.ok(source.includes('window.sim.isRunning = false'),
    `expected isRunning flip after _mainBody returns`);
});

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
  const origBlockToCode = js.blockToCode || (() => '');
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

// ── whenColor ──────────────────────────────────────────────────────────────

test('whenColor: emits polling task with color comparison', () => {
  const code = setupAndRunGenerator(
    'flipperevents_whenColor',
    { PORT: 'E', OPTION: 'red' },
    "window.sim.stop();\n",
  );
  assert.ok(code.startsWith('_hats.push(async () => {'),
    `expected polling-task push`);
  assert.ok(code.includes('window.sim.getColorSensorColor() === "red"') || code.includes("window.sim.getColorSensorColor() === 'red'"),
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

// ── whenDistance ───────────────────────────────────────────────────────────

// whenDistance has a VALUE input (not a field), so we need to stub
// js.valueToCode to return the number string.
function setupWhenDistance(comparator, valueStr, unit, body = '') {
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  const js = env.Blockly.JavaScript;
  const block = makeHatBlock('flipperevents_whenDistance', { COMPARATOR: comparator, UNIT: unit });
  // valueToCode lookup for input VALUE
  const origValueToCode = js.valueToCode || (() => '');
  js.valueToCode = (b, name) => (b === block && name === 'VALUE' ? valueStr : origValueToCode(b, name));
  // body for the next-chain
  const origBlockToCode = js.blockToCode || (() => '');
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
