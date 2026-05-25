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
