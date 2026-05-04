'use strict';

const { makeMainEnv } = require('../mocks/main-env');

const TAB_KEY = 'fll-vr-tab';

module.exports = [
  {
    name: 'applyStoredTab: defaults to python when nothing is stored',
    fn(_createSim, assert) {
      const { context, storage, elementsById } = makeMainEnv();
      context.applyStoredTab();
      assert.strictEqual(storage.has(TAB_KEY), false, 'fallback path must not write to storage');
      assert.ok(elementsById['py-editor-wrap'].style.display !== 'none',
        'python editor wrap should be visible');
      assert.strictEqual(elementsById['blockly-div'].style.display, 'none',
        'blockly div should be hidden');
    },
  },
  {
    name: 'applyStoredTab: falls back to python on an unknown stored value',
    fn(_createSim, assert) {
      const { context, elementsById } = makeMainEnv({ storage: { [TAB_KEY]: 'banana' } });
      context.applyStoredTab();
      assert.ok(elementsById['py-editor-wrap'].style.display !== 'none');
      assert.strictEqual(elementsById['blockly-div'].style.display, 'none');
    },
  },
  {
    name: 'applyStoredTab: restores blocks tab when stored',
    fn(_createSim, assert) {
      const { context, elementsById } = makeMainEnv({ storage: { [TAB_KEY]: 'blocks' } });
      context.applyStoredTab();
      assert.strictEqual(elementsById['py-editor-wrap'].style.display, 'none');
      assert.strictEqual(elementsById['blockly-div'].style.display, 'block');
    },
  },
  {
    name: 'switchMode: persists the active tab',
    fn(_createSim, assert) {
      const { context, storage } = makeMainEnv();
      context.switchMode('blocks');
      assert.strictEqual(storage.get(TAB_KEY), 'blocks');
      context.switchMode('python');
      assert.strictEqual(storage.get(TAB_KEY), 'python');
    },
  },
  {
    name: 'switchMode: skips persistence when {persist:false} is passed',
    fn(_createSim, assert) {
      const { context, storage } = makeMainEnv();
      context.switchMode('blocks', { persist: false });
      assert.strictEqual(storage.has(TAB_KEY), false);
    },
  },
  {
    name: 'handleDefaults: resets the active tab to python',
    fn(_createSim, assert) {
      const { context, storage, elementsById } = makeMainEnv({
        confirm: true,
        storage: { [TAB_KEY]: 'blocks' },
      });
      // Pretend user is on the blocks tab before clicking Defaults.
      context.switchMode('blocks', { persist: false });
      context.handleDefaults();
      assert.strictEqual(storage.get(TAB_KEY), 'python');
      assert.ok(elementsById['py-editor-wrap'].style.display !== 'none');
      assert.strictEqual(elementsById['blockly-div'].style.display, 'none');
    },
  },
];
