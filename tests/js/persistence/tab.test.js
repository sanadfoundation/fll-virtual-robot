'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMainEnv } = require('../mocks/main-env');

const TAB_KEY = 'fll-vr-tab';

test('applyStoredTab: defaults to python when nothing is stored', () => {
  const { context, storage, elementsById } = makeMainEnv();
  context.applyStoredTab();
  assert.strictEqual(storage.has(TAB_KEY), false, 'fallback path must not write to storage');
  assert.ok(elementsById['py-editor-wrap'].style.display !== 'none',
    'python editor wrap should be visible');
  assert.strictEqual(elementsById['blockly-div'].style.display, 'none',
    'blockly div should be hidden');
});

test('applyStoredTab: falls back to python on an unknown stored value', () => {
  const { context, elementsById } = makeMainEnv({ storage: { [TAB_KEY]: 'banana' } });
  context.applyStoredTab();
  assert.ok(elementsById['py-editor-wrap'].style.display !== 'none');
  assert.strictEqual(elementsById['blockly-div'].style.display, 'none');
});

test('applyStoredTab: restores blocks tab when stored', () => {
  const { context, elementsById } = makeMainEnv({ storage: { [TAB_KEY]: 'blocks' } });
  context.applyStoredTab();
  assert.strictEqual(elementsById['py-editor-wrap'].style.display, 'none');
  assert.strictEqual(elementsById['blockly-div'].style.display, 'block');
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

test('handleDefaults: resets the active tab to python', () => {
  const { context, storage, elementsById } = makeMainEnv({
    confirm: true,
    storage: { [TAB_KEY]: 'blocks' },
  });
  context.switchMode('blocks', { persist: false });
  context.handleDefaults();
  assert.strictEqual(storage.get(TAB_KEY), 'python');
  assert.ok(elementsById['py-editor-wrap'].style.display !== 'none');
  assert.strictEqual(elementsById['blockly-div'].style.display, 'none');
});
