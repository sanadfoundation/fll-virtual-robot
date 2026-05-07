'use strict';

const test   = require('node:test');
const assert = require('node:assert');
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

test('handleDefaults: when confirm is declined, no state is touched', () => {
  const { context, storage, elementsById, document } = makeMainEnv({
    confirm: false,
    storage: { ...SEED },
  });
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
});

test('handleDefaults: when confirmed, writes light theme to storage and DOM', () => {
  const { context, storage, document } = makeMainEnv({
    confirm: true,
    storage: { ...SEED },
  });
  context.handleDefaults();
  assert.strictEqual(storage.get(THEME_KEY), 'light');
  assert.strictEqual(document.documentElement.dataset.theme, 'light');
});

test('handleDefaults: when confirmed, resets speed to 1 in storage, slider, and label', () => {
  const { context, storage, elementsById } = makeMainEnv({
    confirm: true,
    storage: { ...SEED },
  });
  elementsById['speed-slider'].value = '3';
  context.handleDefaults();
  assert.strictEqual(storage.get(SPEED_KEY), '1');
  assert.strictEqual(elementsById['speed-slider'].value, '1');
  assert.strictEqual(elementsById['speed-label'].textContent, '1x');
});

test('handleDefaults: when confirmed, removes the Python code key', () => {
  // The default Python code is implicit — main.js's load path treats an
  // absent PYCODE_KEY as "use DEFAULT_PYTHON_CODE". handleDefaults restores
  // that implicit-default state by removing the key, not by writing the
  // literal default text to storage. (The editor's visible text is updated
  // via editor.setValue(DEFAULT_PYTHON_CODE), which is a UI side effect we
  // don't observe in this test because Monaco isn't loaded.)
  const { context, storage } = makeMainEnv({
    confirm: true,
    storage: { ...SEED },
  });
  context.handleDefaults();
  assert.strictEqual(storage.has(PYCODE_KEY), false,
    'expected PYCODE_KEY to be removed (implicit default on next load)');
});

test('handleDefaults: writes window.DEFAULT_BLOCKLY_XML to storage', () => {
  const customDefault = '<xml><block type="default_marker"/></xml>';
  const { context, storage } = makeMainEnv({
    confirm: true,
    storage: { ...SEED },
    defaultBlocklyXml: customDefault,
  });
  context.handleDefaults();
  assert.strictEqual(storage.get(BLOCKLY_KEY), customDefault);
});

test('initTheme: defaults to light when nothing is stored', () => {
  const { document } = makeMainEnv();
  assert.strictEqual(document.documentElement.dataset.theme, 'light');
});

test('initTheme: respects a stored dark value', () => {
  const { document } = makeMainEnv({ storage: { [THEME_KEY]: 'dark' } });
  assert.strictEqual(document.documentElement.dataset.theme, 'dark');
});
