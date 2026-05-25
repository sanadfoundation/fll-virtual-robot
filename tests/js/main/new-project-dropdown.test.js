'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMainEnv } = require('../mocks/main-env');

test('handleNewProject("python"): clears python buffer, sets project-type to python', () => {
  const { context, storage } = makeMainEnv({
    storage: {
      'fll-vr-python-code': 'old python\n',
      'fll-vr-blockly-xml': '<xml/>',
      'fll-vr-project-type': 'blocks',
    },
    confirm: true,
  });
  context.handleNewProject('python');
  assert.strictEqual(storage.has('fll-vr-python-code'), false,
    'python buffer must be cleared');
  assert.strictEqual(storage.get('fll-vr-blockly-xml'), '<xml/>',
    'blocks buffer must NOT be touched when creating a Python project');
  assert.strictEqual(storage.get('fll-vr-project-type'), 'python');
});

test('handleNewProject("blocks"): clears blocks buffer, sets project-type to blocks', () => {
  const { context, storage } = makeMainEnv({
    storage: {
      'fll-vr-python-code': 'old python\n',
      'fll-vr-blockly-xml': '<xml>stale</xml>',
      'fll-vr-project-type': 'python',
    },
    confirm: true,
  });
  context.handleNewProject('blocks');
  assert.strictEqual(storage.has('fll-vr-blockly-xml'), false);
  assert.strictEqual(storage.get('fll-vr-python-code'), 'old python\n',
    'python buffer must NOT be touched when creating a Blocks project');
  assert.strictEqual(storage.get('fll-vr-project-type'), 'blocks');
});

test('handleNewProject: resets project name to default', () => {
  const { context, storage } = makeMainEnv({
    storage: { 'fll-vr-project-name': 'My Robot' },
    confirm: true,
  });
  context.handleNewProject('python');
  assert.strictEqual(storage.get('fll-vr-project-name'), 'Untitled-Project');
});

test('handleNewProject: clears dirty flag', () => {
  const { context, storage } = makeMainEnv({
    storage: { 'fll-vr-dirty': '1' },
    confirm: true,
  });
  context.handleNewProject('python');
  assert.strictEqual(storage.has('fll-vr-dirty'), false);
});

test('handleNewProject: when dirty and user declines confirm → no-op', () => {
  const { context, storage } = makeMainEnv({
    storage: { 'fll-vr-dirty': '1', 'fll-vr-python-code': 'keep me\n' },
    confirm: false,
  });
  context.handleNewProject('python');
  assert.strictEqual(storage.get('fll-vr-python-code'), 'keep me\n',
    'declining the confirm must preserve the buffer');
  assert.strictEqual(storage.get('fll-vr-dirty'), '1');
});

test('handleNewProject: when not dirty, skips the confirm dialog', () => {
  const { context, window, storage } = makeMainEnv({
    storage: { 'fll-vr-python-code': 'old\n' },
  });
  let confirmCalls = 0;
  window.confirm = () => { confirmCalls++; return true; };
  context.handleNewProject('python');
  assert.strictEqual(confirmCalls, 0,
    'clean project must not prompt for confirmation');
  assert.strictEqual(storage.has('fll-vr-python-code'), false,
    'clean-path still clears the python buffer');
});

test('handleNewProject: throws when called without a type', () => {
  const { context } = makeMainEnv({ confirm: true });
  assert.throws(() => context.handleNewProject(), /project type required/i);
});

test('handleNewProject: throws on unknown type', () => {
  const { context } = makeMainEnv({ confirm: true });
  assert.throws(() => context.handleNewProject('word-blocks'), /unknown project type/i);
});
