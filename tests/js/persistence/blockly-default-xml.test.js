'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeBlocklyEnv } = require('../mocks/blockly-env');

test('initBlockly: uses provided initialXml when it is a non-empty string', () => {
  const seen = [];
  const { window, calls } = makeBlocklyEnv({
    textToDom: (text) => { seen.push(text); return { ok: true }; },
  });
  const userXml = '<xml><block type="my_custom"/></xml>';
  window.initBlockly('blockly-div', 'light', userXml);
  assert.strictEqual(calls.inject, 1);
  assert.strictEqual(seen.length, 1);
  assert.strictEqual(seen[0], userXml);
});

test('initBlockly: falls back to DEFAULT_BLOCKLY_XML when initialXml is undefined', () => {
  const seen = [];
  const { window } = makeBlocklyEnv({
    textToDom: (text) => { seen.push(text); return { ok: true }; },
  });
  window.initBlockly('blockly-div', 'light');
  assert.strictEqual(seen.length, 1);
  assert.strictEqual(seen[0], window.DEFAULT_BLOCKLY_XML);
});

test('initBlockly: falls back to default when initialXml is whitespace-only', () => {
  const seen = [];
  const { window } = makeBlocklyEnv({
    textToDom: (text) => { seen.push(text); return { ok: true }; },
  });
  window.initBlockly('blockly-div', 'light', '   \n\t  ');
  assert.strictEqual(seen[0], window.DEFAULT_BLOCKLY_XML);
});

test('initBlockly: catches parse errors and reloads from DEFAULT_BLOCKLY_XML', () => {
  const seen = [];
  let firstCall = true;
  const { window, calls } = makeBlocklyEnv({
    textToDom: (text) => {
      seen.push(text);
      if (firstCall) { firstCall = false; throw new Error('bad xml'); }
      return { ok: true };
    },
  });
  const badXml = '<xml<<<malformed>';
  const origErr = console.error;
  console.error = () => {};
  try {
    window.initBlockly('blockly-div', 'light', badXml);
  } finally {
    console.error = origErr;
  }
  assert.strictEqual(seen.length, 2, 'textToDom called for badXml then for default');
  assert.strictEqual(seen[0], badXml);
  assert.strictEqual(seen[1], window.DEFAULT_BLOCKLY_XML);
  assert.strictEqual(calls.workspaceClear, 1, 'workspace.clear() called once on fallback');
  assert.strictEqual(calls.domToWorkspace.length, 1, 'only the fallback domToWorkspace runs');
});

test('DEFAULT_BLOCKLY_XML: contains move/turn/move/print sequence', () => {
  const { window } = makeBlocklyEnv();
  const xml = window.DEFAULT_BLOCKLY_XML;
  const moves  = (xml.match(/flippermove_move/g)  || []).length;
  const steers = (xml.match(/flippermove_steer/g) || []).length;
  assert.ok(moves  >= 2, 'expected at least two flippermove_move blocks');
  assert.ok(steers >= 1, 'expected at least one steering/turn block');
  assert.ok(xml.includes('flipperlight_lightDisplayText'), 'expected a print/lightDisplayText block');
});
