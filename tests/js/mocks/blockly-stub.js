'use strict';

// Minimal Blockly stub for editor-conditions tests. Captures the surface
// our code uses: inject (returns a workspace), defineBlocksWithJsonArray,
// JavaScript (generator with workspaceToCode + per-block stubs), and
// workspace.addChangeListener / clear / dispose.

function makeBlocklyStub() {
  const definedBlocks = {};
  let lastWorkspace = null;

  function createWorkspace() {
    const listeners = [];
    const blocks = [];
    const ws = {
      _blocks: blocks,
      addChangeListener(fn) { listeners.push(fn); },
      removeChangeListener(fn) {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      },
      clear() { blocks.length = 0; _fire(); },
      dispose() { listeners.length = 0; blocks.length = 0; },
      // Test seam: set a synthetic block tree, then notify listeners.
      _setBlocks(newBlocks) { blocks.length = 0; for (const b of newBlocks) blocks.push(b); _fire(); },
      _fire(ev) { for (const fn of listeners) fn(ev || {}); },
      getAllBlocks() { return blocks; },
      getTopBlocks() { return blocks.filter(b => !b.parent); },
    };
    function _fire() { ws._fire(); }
    lastWorkspace = ws;
    return ws;
  }

  return {
    inject: (container, opts) => createWorkspace(),
    defineBlocksWithJsonArray: (defs) => {
      for (const d of defs) definedBlocks[d.type] = d;
    },
    Blocks: definedBlocks,
    JavaScript: {
      // Per-block generator functions get attached here by the editor module.
      // workspaceToCode walks top blocks and concatenates per-block output.
      workspaceToCode(ws) {
        const top = ws.getTopBlocks();
        if (top.length === 0) return '';
        // For our condition workspace there is at most one top block — the
        // root predicate. Each block stub provides ._jsonCondition().
        return JSON.stringify(top[0]._jsonCondition());
      },
    },
    Xml: {
      // We do not need real XML for tests; the editor module always uses
      // its own condition-tree format.
      domToText() { return ''; },
      textToDom()  { return null; },
    },
    utils: { xml: { textToDom: () => null } },
    Events: { CHANGE: 'change' },
    _lastWorkspace: () => lastWorkspace,
    _definedBlocks: definedBlocks,
  };
}

module.exports = { makeBlocklyStub };
