'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeLlsp3Env } = require('../mocks/llsp3-env');

function freshEnv() {
  return makeLlsp3Env(['llsp3_manifest']).ctx;
}

test('defaultManifest("python"): produces a Python-type manifest with required fields', () => {
  const ctx = freshEnv();
  const m = ctx.LLSP3.manifest.defaultManifest('python', { name: 'My Project' });

  assert.strictEqual(m.type, 'python');
  assert.strictEqual(m.appType, 'llsp3');
  assert.strictEqual(m.name, 'My Project');
  assert.strictEqual(m.autoDelete, false);
  assert.strictEqual(m.size, 0);
  assert.strictEqual(m.slotIndex, 0);
  assert.strictEqual(m.zoomLevel, 0.5);
  assert.strictEqual(m.lastConnectedHubType, 'flipper');
  assert.deepStrictEqual(m.extraFiles, []);
  assert.match(m.id, /^[A-Za-z0-9_-]{12}$/);
  assert.match(m.created, /^\d{4}-\d{2}-\d{2}T/);
  assert.strictEqual(m.created, m.lastsaved);
});

test('defaultManifest("word-blocks"): produces a word-blocks manifest with required fields', () => {
  const ctx = freshEnv();
  const m = ctx.LLSP3.manifest.defaultManifest('word-blocks', { name: 'Blocks demo' });

  assert.strictEqual(m.type, 'word-blocks');
  assert.strictEqual(m.appType, undefined);
  assert.strictEqual(m.name, 'Blocks demo');
  assert.strictEqual(m.version, 38);
  assert.strictEqual(m.showAllBlocks, false);
  assert.deepStrictEqual(m.extensions, []);
  assert.strictEqual(m.lastConnectedHubType, undefined);
});

test('defaultManifest: rejects unknown types', () => {
  const ctx = freshEnv();
  assert.throws(() => ctx.LLSP3.manifest.defaultManifest('icon-blocks', {}),
    /Unknown manifest type/);
});
