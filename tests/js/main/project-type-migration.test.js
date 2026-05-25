'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMainEnv } = require('../mocks/main-env');

test('getProjectType: returns "python" when storage has fll-vr-project-type=python', () => {
  const { context } = makeMainEnv({ storage: { 'fll-vr-project-type': 'python' } });
  assert.strictEqual(context.getProjectType(), 'python');
});

test('getProjectType: returns "blocks" when storage has fll-vr-project-type=blocks', () => {
  const { context } = makeMainEnv({ storage: { 'fll-vr-project-type': 'blocks' } });
  assert.strictEqual(context.getProjectType(), 'blocks');
});

test('setProjectType("python"): persists fll-vr-project-type=python', () => {
  const { context, storage } = makeMainEnv();
  context.setProjectType('python');
  assert.strictEqual(storage.get('fll-vr-project-type'), 'python');
});

test('setProjectType("blocks"): persists fll-vr-project-type=blocks', () => {
  const { context, storage } = makeMainEnv();
  context.setProjectType('blocks');
  assert.strictEqual(storage.get('fll-vr-project-type'), 'blocks');
});

test('setProjectType: rejects unknown values (no write, throws)', () => {
  const { context, storage } = makeMainEnv();
  assert.throws(() => context.setProjectType('word-blocks'), /unknown project type/i);
  assert.strictEqual(storage.has('fll-vr-project-type'), false);
});

test('migrateLegacyTabKey: legacy tab "python" migrates to project-type "python"', () => {
  const { context, storage } = makeMainEnv({ storage: { 'fll-vr-tab': 'python' } });
  context.migrateLegacyTabKey();
  assert.strictEqual(storage.get('fll-vr-project-type'), 'python');
  assert.strictEqual(storage.has('fll-vr-tab'), false,
    'legacy TAB_KEY should be removed after migration');
});

test('migrateLegacyTabKey: legacy tab "blocks" migrates to project-type "blocks"', () => {
  const { context, storage } = makeMainEnv({ storage: { 'fll-vr-tab': 'blocks' } });
  context.migrateLegacyTabKey();
  assert.strictEqual(storage.get('fll-vr-project-type'), 'blocks');
  assert.strictEqual(storage.has('fll-vr-tab'), false);
});

test('migrateLegacyTabKey: no legacy tab, no project-type → writes default "blocks"', () => {
  const { context, storage } = makeMainEnv();
  context.migrateLegacyTabKey();
  assert.strictEqual(storage.get('fll-vr-project-type'), 'blocks');
});

test('migrateLegacyTabKey: project-type already set → does not overwrite or touch TAB_KEY', () => {
  const { context, storage } = makeMainEnv({
    storage: { 'fll-vr-project-type': 'python', 'fll-vr-tab': 'blocks' },
  });
  context.migrateLegacyTabKey();
  assert.strictEqual(storage.get('fll-vr-project-type'), 'python',
    'an existing project-type must win over legacy tab');
  assert.strictEqual(storage.get('fll-vr-tab'), 'blocks',
    'legacy TAB_KEY is only retired when we use it for migration');
});

test('migrateLegacyTabKey: unrecognised legacy tab value falls back to default', () => {
  const { context, storage } = makeMainEnv({ storage: { 'fll-vr-tab': 'garbage' } });
  context.migrateLegacyTabKey();
  assert.strictEqual(storage.get('fll-vr-project-type'), 'blocks');
});
