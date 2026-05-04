'use strict';

// Loads js/main.js into a vm sandbox with stub DOM, localStorage, and
// browser globals. Returns the context plus handles to the mock state so
// tests can drive individual functions without invoking the DOMContentLoaded
// bootstrap. Monaco and Blockly are NOT loaded — code paths gated on those
// (`if (editor)`, `if (blocklyWs)`) take their null branches by design.

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

function makeEl(initial) {
  const el = {
    style: {},
    dataset: {},
    classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
    children: [],
    appendChild(child) { this.children.push(child); },
    removeChild() {},
    addEventListener: () => {},
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
  };
  return Object.assign(el, initial || {});
}

function makeMainEnv(opts = {}) {
  // ── localStorage ──
  const storage = new Map(Object.entries(opts.storage || {}));
  const localStorage = {
    getItem: (k) => storage.has(k) ? storage.get(k) : null,
    setItem: (k, v) => { storage.set(k, String(v)); },
    removeItem: (k) => { storage.delete(k); },
    clear: () => { storage.clear(); },
    get length() { return storage.size; },
    key: (i) => Array.from(storage.keys())[i] || null,
  };

  // ── document ──
  const elementsById = {
    'speed-slider':   makeEl({ value: '1' }),
    'speed-label':    makeEl(),
    'btn-run':        makeEl(),
    'btn-stop':       makeEl(),
    'btn-reset':      makeEl(),
    'btn-defaults':   makeEl(),
    'btn-theme':      makeEl(),
    'tab-python':     makeEl(),
    'tab-blocks':     makeEl(),
    'console-output': makeEl(),
    'py-editor':      makeEl(),
    'py-editor-wrap': makeEl(),
    'blockly-div':    makeEl(),
    'resize-handle':  makeEl(),
    'py-loading':     makeEl(),
    'status-dot':     makeEl(),
    'status-label':   makeEl(),
  };

  const documentEl = makeEl();
  const document = {
    documentElement: documentEl,
    body: makeEl(),
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: (id) => {
      if (!(id in elementsById)) elementsById[id] = makeEl();
      return elementsById[id];
    },
    createElement: () => makeEl(),
  };

  // ── window ──
  const window = {
    addEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
    monaco: null,
    confirm: opts.confirm !== undefined ? () => opts.confirm : () => true,
    registerSpikeCompletions: () => {},
    initBlockly: opts.initBlockly || (() => null),
    DEFAULT_BLOCKLY_XML: opts.defaultBlocklyXml !== undefined
      ? opts.defaultBlocklyXml
      : '<xml xmlns="https://developers.google.com/blockly/xml"><block type="spike_event_start"/></xml>',
    generateBlocklyJS: () => '',
    sim: null,
    appendOutput: () => {},
    _pyWorker: null,
    RobotSimulator: function () { return { speedMult: 1, reset: () => {}, _setStatus: () => {} }; },
  };

  // RequireJS stub — main.js calls require.config() then require([...], cb).
  // The cb is never invoked, so `editor` stays null. That's the desired branch.
  const requireFn = function () {};
  requireFn.config = () => {};

  const context = vm.createContext({
    window,
    document,
    localStorage,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    setTimeout, clearTimeout, setInterval, clearInterval,
    require: requireFn,
    console,
    Promise,
  });

  const MAIN_CODE = fs.readFileSync(
    path.resolve(__dirname, '../../../js/main.js'),
    'utf8',
  );
  vm.runInContext(MAIN_CODE, context, { filename: 'js/main.js' });

  return { context, window, document, storage, elementsById };
}

module.exports = { makeMainEnv };
