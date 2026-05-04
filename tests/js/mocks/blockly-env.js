'use strict';

// Loads js/blockly_config.js into a vm sandbox with a minimal Blockly stub.
// Only the surface area used by initBlockly() is implemented — generators are
// registered but never invoked because we don't call generateBlocklyJS.

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

function makeBlocklyEnv(opts = {}) {
  const calls = {
    defineBlocksWithJsonArray: 0,
    inject: 0,
    domToWorkspace: [],
    textToDom: [],
    workspaceClear: 0,
  };

  // Mock workspace: initBlockly may call workspace.clear() during the
  // fallback path. Track invocations so tests can assert on them.
  const workspace = {
    clear() { calls.workspaceClear++; },
    dispose() {},
    addChangeListener: () => {},
  };

  // Tests can pass a textToDom that throws to exercise the catch path.
  const textToDom = opts.textToDom || ((text) => {
    calls.textToDom.push(text);
    return { kind: 'parsed', src: text };
  });

  const Blockly = {
    defineBlocksWithJsonArray: () => { calls.defineBlocksWithJsonArray++; },
    inject: () => { calls.inject++; return workspace; },
    Theme: { defineTheme: () => ({}) },
    Themes: { Classic: {} },
    Xml: {
      domToWorkspace: (domEl, ws) => {
        calls.domToWorkspace.push({ dom: domEl, ws });
      },
      domToText: () => '<xml/>',
      workspaceToDom: () => ({}),
    },
    utils: { xml: { textToDom: (text) => textToDom(text) } },
    JavaScript: {
      forBlock: {},
      ORDER_ATOMIC: 0,
      ORDER_NONE: 99,
      ORDER_FUNCTION_CALL: 1,
      addReservedWords: () => {},
      valueToCode: () => '',
      statementToCode: () => '',
      provideFunction_: () => '',
    },
  };

  const window = {};
  const context = vm.createContext({
    window,
    Blockly,
    console,
    Math, Promise,
  });

  const CODE = fs.readFileSync(
    path.resolve(__dirname, '../../../js/blockly_config.js'),
    'utf8',
  );
  vm.runInContext(CODE, context, { filename: 'js/blockly_config.js' });

  return { context, window, Blockly, workspace, calls };
}

module.exports = { makeBlocklyEnv };
