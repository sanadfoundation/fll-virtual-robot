'use strict';

// Generator smoke tests for the Scratch data_* opcodes. Mirrors the pattern
// used by tests/js/blockly/yaw-program-issue-9.test.js: spin up the Blockly
// stub, register the real generators via initBlockly, then call them with
// minimal block stubs and assert on the JS that comes out.

const test   = require('node:test');
const assert = require('node:assert');
const { makeBlocklyEnv } = require('../mocks/blockly-env');

function setupGenerators() {
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  const Blockly = env.Blockly;
  // Workspace stub: getVariableById returns objects with a `.name`.
  const workspace = {
    getVariableById(id) {
      const map = { 'kp-id': { name: 'k_p' }, 'err-id': { name: 'error' } };
      return map[id] || null;
    },
  };
  return { Blockly, env, workspace };
}

test('data_variable generator emits the sanitized identifier as a reporter', () => {
  const { Blockly, workspace } = setupGenerators();
  const js = Blockly.JavaScript;
  const block = {
    workspace,
    getFieldValue() { return 'kp-id'; },
    getInputTargetBlock() { return null; },
  };
  const [code, order] = js['data_variable'](block);
  assert.strictEqual(code, 'v_k_p');
  assert.strictEqual(order, js.ORDER_ATOMIC);
});

test('data_setvariableto generator emits a JS assignment and a _watch.set', () => {
  const { Blockly, workspace } = setupGenerators();
  const js = Blockly.JavaScript;
  const origValueToCode = js.valueToCode;
  js.valueToCode = () => '0.5';
  try {
    const block = {
      workspace,
      getFieldValue() { return 'kp-id'; },
      getInputTargetBlock() { return null; },
    };
    const code = js['data_setvariableto'](block);
    // Assignment and watch call on the same line so the panel update can't
    // lag the variable write across an await boundary.
    assert.match(code, /^v_k_p\s*=\s*0\.5;\s*_watch\.set\("k_p",\s*v_k_p\);\s*$/);
  } finally {
    js.valueToCode = origValueToCode;
  }
});

test('data_changevariableby generator emits numeric add with coercion', () => {
  const { Blockly, workspace } = setupGenerators();
  const js = Blockly.JavaScript;
  const origValueToCode = js.valueToCode;
  js.valueToCode = () => '1';
  try {
    const block = {
      workspace,
      getFieldValue() { return 'err-id'; },
      getInputTargetBlock() { return null; },
    };
    const code = js['data_changevariableby'](block);
    assert.match(code, /v_error\s*=\s*\(Number\(v_error\)\s*\|\|\s*0\)\s*\+\s*\(Number\(1\)\s*\|\|\s*0\);/);
  } finally {
    js.valueToCode = origValueToCode;
  }
});

test('generateBlocklyJS preamble declares each workspace variable', () => {
  const { Blockly, env } = setupGenerators();
  const js = Blockly.JavaScript;
  const origWorkspaceToCode = js.workspaceToCode;
  js.workspaceToCode = () => '';
  try {
    const stub = {
      getAllVariables() {
        return [
          { name: 'error' }, { name: 'k_p' }, { name: 'w_d' },
          { name: 'has spaces!' },
        ];
      },
    };
    const code = env.window.generateBlocklyJS(stub);
    assert.ok(code.includes('var v_error = 0;'),  'declares v_error');
    assert.ok(code.includes('var v_k_p = 0;'),    'declares v_k_p');
    assert.ok(code.includes('var v_w_d = 0;'),    'declares v_w_d');
    assert.ok(code.includes('var v_has_spaces_ = 0;'),
      'sanitizes spaces and punctuation');
  } finally {
    js.workspaceToCode = origWorkspaceToCode;
  }
});

test('data_setvariableto: variable name with double-quote escapes safely', () => {
  // Use a double-quote rather than an apostrophe — apostrophes don't need
  // escaping inside JSON.stringify's double-quoted output, so they'd pass
  // even if _jsString were a naive `"${s}"` concatenation. A double-quote
  // is the discriminating character: JSON.stringify produces \", naive
  // concatenation produces broken JS.
  const { Blockly, env } = setupGenerators();
  const js = Blockly.JavaScript;
  const origValueToCode = js.valueToCode;
  js.valueToCode = () => '0';
  try {
    const block = {
      workspace: { getVariableById: () => ({ name: 'say "hi"' }) },
      getFieldValue() { return 'q-id'; },
      getInputTargetBlock() { return null; },
    };
    const code = js['data_setvariableto'](block);
    // Sanitized JS identifier is v_say__hi_ (quotes/spaces become underscores).
    // Display name in the watch call is the JSON-escaped form: "say \"hi\"".
    assert.match(code, /_watch\.set\("say \\"hi\\"",\s*v_say__hi_\);/);
  } finally {
    js.valueToCode = origValueToCode;
  }
});

test('data_changevariableby generator emits the watch call after the add', () => {
  const { Blockly, workspace } = setupGenerators();
  const js = Blockly.JavaScript;
  const origValueToCode = js.valueToCode;
  js.valueToCode = () => '1';
  try {
    const block = {
      workspace,
      getFieldValue() { return 'err-id'; },
      getInputTargetBlock() { return null; },
    };
    const code = js['data_changevariableby'](block);
    assert.match(code, /v_error\s*=\s*\(Number\(v_error\)\s*\|\|\s*0\)\s*\+\s*\(Number\(1\)\s*\|\|\s*0\);\s*_watch\.set\("error",\s*v_error\);/);
  } finally {
    js.valueToCode = origValueToCode;
  }
});

test('generateBlocklyJS preamble declares each variable into _watch', () => {
  const { Blockly, env } = setupGenerators();
  const js = Blockly.JavaScript;
  const origWorkspaceToCode = js.workspaceToCode;
  js.workspaceToCode = () => '';
  try {
    const stub = {
      getAllVariables() {
        return [{ name: 'error' }, { name: 'has spaces!' }];
      },
    };
    const code = env.window.generateBlocklyJS(stub);
    assert.ok(code.includes('const _watch = window._watch'),
      'captures window._watch into the AsyncFunction scope');
    assert.ok(code.includes('_watch.declare("error", v_error);'),
      'declares each variable with its display name');
    assert.ok(code.includes('_watch.declare("has spaces!", v_has_spaces_);'),
      'preserves the display name even when the JS identifier was sanitized');
  } finally {
    js.workspaceToCode = origWorkspaceToCode;
  }
});
