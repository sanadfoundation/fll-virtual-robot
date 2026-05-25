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
  // Also capture registered toolbox/button callbacks so tests can drive
  // the flyout-building paths directly.
  const toolboxCallbacks = {};
  const buttonCallbacks  = {};
  const workspace = {
    clear() { calls.workspaceClear++; },
    dispose() {},
    addChangeListener: () => {},
    registerButtonCallback: (key, fn) => { buttonCallbacks[key] = fn; },
    registerToolboxCategoryCallback: (key, fn) => { toolboxCallbacks[key] = fn; },
    getAllBlocks: () => [],
    getVariablesOfType: () => [],
    toolboxCallbacks_: toolboxCallbacks,
    buttonCallbacks_:  buttonCallbacks,
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
      workspaceToCode: () => '',
    },
  };

  const window = {};
  // Post-redesign initBlockly schedules setTimeout-based toolbox repaints and
  // creates a "+extensions" toggle button via document. None of that affects
  // the XML-loading path we're testing — stub them so the script runs cleanly.
  // Richer createElement so toolbox callbacks (which return an array of
  // <button>/<block> DOM elements via createElement) can produce inspectable
  // values. Each element records its tagName, attributes, and children.
  function makeElement(tag) {
    const node = {
      tagName: tag.toLowerCase(),
      attributes: {},
      children: [],
      style: {},
      classList: { toggle: () => {}, add: () => {}, remove: () => {} },
      addEventListener: () => {},
      appendChild(child) { this.children.push(child); return child; },
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return this.attributes[k]; },
    };
    Object.defineProperty(node, 'textContent', {
      set(t) { this._text = String(t); },
      get() { return this._text || ''; },
    });
    return node;
  }
  const document = {
    querySelectorAll: () => [],
    getElementById:   () => null,
    createElement: (tag) => makeElement(tag),
  };
  const context = vm.createContext({
    window,
    document,
    Blockly,
    setTimeout,
    getComputedStyle: () => ({ borderLeftColor: 'transparent' }),
    console,
    Math, Promise,
  });

  // Load MyBlocks helpers first (proccode + slugifier + makeArgToken +
  // modal state). The generators in js/blockly_config.js reach for
  // window.MyBlocks, and the flyout callback uses setFocusedDefinitionProcId.
  for (const f of ['js/myblocks_proccode.js', 'js/myblocks_blocks.js', 'js/myblocks_modal.js']) {
    const src = fs.readFileSync(path.resolve(__dirname, '../../../', f), 'utf8');
    vm.runInContext(src, context, { filename: f });
  }

  const CODE = fs.readFileSync(
    path.resolve(__dirname, '../../../js/blockly_config.js'),
    'utf8',
  );
  vm.runInContext(CODE, context, { filename: 'js/blockly_config.js' });

  return { context, window, Blockly, workspace, calls };
}

module.exports = { makeBlocklyEnv };
