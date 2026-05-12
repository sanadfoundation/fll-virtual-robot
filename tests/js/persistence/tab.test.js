'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMainEnv } = require('../mocks/main-env');

const TAB_KEY = 'fll-vr-tab';

test('applyStoredTab: defaults to blocks when nothing is stored', () => {
  const { context, storage, elementsById } = makeMainEnv();
  context.applyStoredTab();
  assert.strictEqual(storage.has(TAB_KEY), false, 'fallback path must not write to storage');
  assert.strictEqual(elementsById['py-editor-wrap'].style.display, 'none',
    'python editor wrap should be hidden');
  assert.strictEqual(elementsById['blockly-div'].style.display, 'block',
    'blockly div should be visible');
});

test('applyStoredTab: falls back to blocks on an unknown stored value', () => {
  const { context, elementsById } = makeMainEnv({ storage: { [TAB_KEY]: 'banana' } });
  context.applyStoredTab();
  assert.strictEqual(elementsById['py-editor-wrap'].style.display, 'none');
  assert.strictEqual(elementsById['blockly-div'].style.display, 'block');
});

test('applyStoredTab: restores python tab when stored', () => {
  const { context, elementsById } = makeMainEnv({ storage: { [TAB_KEY]: 'python' } });
  context.applyStoredTab();
  assert.ok(elementsById['py-editor-wrap'].style.display !== 'none');
  assert.strictEqual(elementsById['blockly-div'].style.display, 'none');
});

test('switchMode: persists the active tab', () => {
  const { context, storage } = makeMainEnv();
  context.switchMode('blocks');
  assert.strictEqual(storage.get(TAB_KEY), 'blocks');
  context.switchMode('python');
  assert.strictEqual(storage.get(TAB_KEY), 'python');
});

test('switchMode: skips persistence when {persist:false} is passed', () => {
  const { context, storage } = makeMainEnv();
  context.switchMode('blocks', { persist: false });
  assert.strictEqual(storage.has(TAB_KEY), false);
});

test('handleDefaults: resets the active tab to blocks', () => {
  const { context, storage, elementsById } = makeMainEnv({
    confirm: true,
    storage: { [TAB_KEY]: 'python' },
  });
  context.switchMode('python', { persist: false });
  context.handleDefaults();
  assert.strictEqual(storage.get(TAB_KEY), 'blocks');
  assert.strictEqual(elementsById['py-editor-wrap'].style.display, 'none');
  assert.strictEqual(elementsById['blockly-div'].style.display, 'block');
});
