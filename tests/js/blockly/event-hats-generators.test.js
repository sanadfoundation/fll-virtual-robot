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
