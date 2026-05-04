'use strict';

const { makeBlocklyEnv } = require('../mocks/blockly-env');

module.exports = [
  {
    name: 'initBlockly: uses provided initialXml when it is a non-empty string',
    fn(_createSim, assert) {
      const seen = [];
      const { window, calls } = makeBlocklyEnv({
        textToDom: (text) => { seen.push(text); return { ok: true }; },
      });
      const userXml = '<xml><block type="my_custom"/></xml>';
      window.initBlockly('blockly-div', 'light', userXml);
      assert.strictEqual(calls.inject, 1);
      assert.strictEqual(seen.length, 1);
      assert.strictEqual(seen[0], userXml);
    },
  },
  {
    name: 'initBlockly: falls back to DEFAULT_BLOCKLY_XML when initialXml is undefined',
    fn(_createSim, assert) {
      const seen = [];
      const { window } = makeBlocklyEnv({
        textToDom: (text) => { seen.push(text); return { ok: true }; },
      });
      window.initBlockly('blockly-div', 'light');
      assert.strictEqual(seen.length, 1);
      assert.strictEqual(seen[0], window.DEFAULT_BLOCKLY_XML);
    },
  },
  {
    name: 'initBlockly: falls back to default when initialXml is whitespace-only',
    fn(_createSim, assert) {
      const seen = [];
      const { window } = makeBlocklyEnv({
        textToDom: (text) => { seen.push(text); return { ok: true }; },
      });
      window.initBlockly('blockly-div', 'light', '   \n\t  ');
      assert.strictEqual(seen[0], window.DEFAULT_BLOCKLY_XML);
    },
  },
  {
    name: 'initBlockly: catches parse errors and reloads from DEFAULT_BLOCKLY_XML',
    fn(_createSim, assert) {
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
      // The catch path logs to console.error — silence it for cleaner test output.
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
    },
  },
  {
    name: 'DEFAULT_BLOCKLY_XML: contains move/turn/move/print sequence',
    fn(_createSim, assert) {
      const { window } = makeBlocklyEnv();
      const xml = window.DEFAULT_BLOCKLY_XML;
      const moves = (xml.match(/flippermove_move/g) || []).length;
      assert.strictEqual(moves, 2, 'expected two flippermove_move blocks');
      assert.ok(xml.includes('flippermove_steer'),         'expected a steering/turn block');
      assert.ok(xml.includes('flipperlight_lightDisplayText'), 'expected a print/lightDisplayText block');
    },
  },
];
