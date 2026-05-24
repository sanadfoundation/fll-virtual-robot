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

test('data_setvariableto generator emits a JS assignment', () => {
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
    assert.strictEqual(code.trim(), 'v_k_p = 0.5;');
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
