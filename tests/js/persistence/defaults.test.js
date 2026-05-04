'use strict';

const { makeMainEnv } = require('../mocks/main-env');

const THEME_KEY   = 'fll-vr-theme';
const SPEED_KEY   = 'fll-vr-speed';
const PYCODE_KEY  = 'fll-vr-python-code';
const BLOCKLY_KEY = 'fll-vr-blockly-xml';

const SEED = {
  [THEME_KEY]:   'dark',
  [SPEED_KEY]:   '3',
  [PYCODE_KEY]:  '# user-edited\n',
  [BLOCKLY_KEY]: '<xml><block type="user_block"/></xml>',
};

module.exports = [
  {
    name: 'handleDefaults: when confirm is declined, no state is touched',
    fn(_createSim, assert) {
      const { context, storage, elementsById, document } = makeMainEnv({
        confirm: false,
        storage: { ...SEED },
      });
      // Pre-set DOM state to a known non-default state.
      document.documentElement.dataset.theme = 'dark';
      elementsById['speed-slider'].value = '3';
      elementsById['speed-label'].textContent = '3x';

      context.handleDefaults();

      assert.strictEqual(storage.get(THEME_KEY),   SEED[THEME_KEY]);
      assert.strictEqual(storage.get(SPEED_KEY),   SEED[SPEED_KEY]);
      assert.strictEqual(storage.get(PYCODE_KEY),  SEED[PYCODE_KEY]);
      assert.strictEqual(storage.get(BLOCKLY_KEY), SEED[BLOCKLY_KEY]);
      assert.strictEqual(document.documentElement.dataset.theme, 'dark');
      assert.strictEqual(elementsById['speed-slider'].value, '3');
      assert.strictEqual(elementsById['speed-label'].textContent, '3x');
    },
  },
  {
    name: 'handleDefaults: when confirmed, writes light theme to storage and DOM',
    fn(_createSim, assert) {
      const { context, storage, document } = makeMainEnv({
        confirm: true,
        storage: { ...SEED },
      });
      context.handleDefaults();
      assert.strictEqual(storage.get(THEME_KEY), 'light');
      assert.strictEqual(document.documentElement.dataset.theme, 'light');
    },
  },
  {
    name: 'handleDefaults: when confirmed, resets speed to 1 in storage, slider, and label',
    fn(_createSim, assert) {
      const { context, storage, elementsById } = makeMainEnv({
        confirm: true,
        storage: { ...SEED },
      });
      elementsById['speed-slider'].value = '3';
      context.handleDefaults();
      assert.strictEqual(storage.get(SPEED_KEY), '1');
      assert.strictEqual(elementsById['speed-slider'].value, '1');
      assert.strictEqual(elementsById['speed-label'].textContent, '1x');
    },
  },
  {
    name: 'handleDefaults: when confirmed, writes the default Python code to storage',
    fn(_createSim, assert) {
      const { context, storage } = makeMainEnv({
        confirm: true,
        storage: { ...SEED },
      });
      context.handleDefaults();
      const code = storage.get(PYCODE_KEY);
      assert.ok(typeof code === 'string' && code.startsWith('# FLL Virtual Robot'),
        'expected default Python code in storage');
    },
  },
  {
    name: 'handleDefaults: writes window.DEFAULT_BLOCKLY_XML to storage',
    fn(_createSim, assert) {
      const customDefault = '<xml><block type="default_marker"/></xml>';
      const { context, storage } = makeMainEnv({
        confirm: true,
        storage: { ...SEED },
        defaultBlocklyXml: customDefault,
      });
      context.handleDefaults();
      assert.strictEqual(storage.get(BLOCKLY_KEY), customDefault);
    },
  },
  {
    name: 'initTheme: defaults to light when nothing is stored',
    fn(_createSim, assert) {
      const { document } = makeMainEnv();
      // initTheme runs on script load; check the resulting state.
      assert.strictEqual(document.documentElement.dataset.theme, 'light');
    },
  },
  {
    name: 'initTheme: respects a stored dark value',
    fn(_createSim, assert) {
      const { document } = makeMainEnv({ storage: { [THEME_KEY]: 'dark' } });
      assert.strictEqual(document.documentElement.dataset.theme, 'dark');
    },
  },
];
