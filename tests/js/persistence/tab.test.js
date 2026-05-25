'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMainEnv } = require('../mocks/main-env');

const PROJECT_TYPE_KEY = 'fll-vr-project-type';

test('applyStoredProjectType: defaults to blocks when nothing is stored', () => {
  const { context, storage, elementsById } = makeMainEnv();
  context.applyStoredProjectType();
  assert.strictEqual(storage.has(PROJECT_TYPE_KEY), false, 'fallback path must not write to storage');
  assert.strictEqual(elementsById['py-editor-wrap'].style.display, 'none',
    'python editor wrap should be hidden');
  assert.strictEqual(elementsById['blockly-div'].style.display, 'block',
    'blockly div should be visible');
});

test('applyStoredProjectType: falls back to blocks on an unknown stored value', () => {
  const { context, elementsById } = makeMainEnv({ storage: { [PROJECT_TYPE_KEY]: 'banana' } });
  context.applyStoredProjectType();
  assert.strictEqual(elementsById['py-editor-wrap'].style.display, 'none');
  assert.strictEqual(elementsById['blockly-div'].style.display, 'block');
});

test('applyStoredProjectType: restores python tab when stored', () => {
  const { context, elementsById } = makeMainEnv({ storage: { [PROJECT_TYPE_KEY]: 'python' } });
  context.applyStoredProjectType();
  assert.ok(elementsById['py-editor-wrap'].style.display !== 'none');
  assert.strictEqual(elementsById['blockly-div'].style.display, 'none');
});

test('switchMode: persists the active tab', () => {
  const { context, storage } = makeMainEnv();
  context.switchMode('blocks');
  assert.strictEqual(storage.get(PROJECT_TYPE_KEY), 'blocks');
  context.switchMode('python');
  assert.strictEqual(storage.get(PROJECT_TYPE_KEY), 'python');
});

test('switchMode: skips persistence when {persist:false} is passed', () => {
  const { context, storage } = makeMainEnv();
  context.switchMode('blocks', { persist: false });
  assert.strictEqual(storage.has(PROJECT_TYPE_KEY), false);
});

test('handleDefaults: resets the active tab to blocks', () => {
  const { context, storage, elementsById } = makeMainEnv({
    confirm: true,
    storage: { [PROJECT_TYPE_KEY]: 'python' },
  });
  context.switchMode('python', { persist: false });
  context.handleDefaults();
  assert.strictEqual(storage.get(PROJECT_TYPE_KEY), 'blocks');
  assert.strictEqual(elementsById['py-editor-wrap'].style.display, 'none');
  assert.strictEqual(elementsById['blockly-div'].style.display, 'block');
});
