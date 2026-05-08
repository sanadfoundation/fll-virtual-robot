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

test('mergeForSave: preserves unknown fields from the loaded manifest', () => {
  const ctx = freshEnv();
  const loaded = {
    type: 'python',
    appType: 'llsp3',
    name: 'Old name',
    id: 'preservedid12',
    created: '2025-01-01T00:00:00.000Z',
    lastsaved: '2025-01-01T00:00:00.000Z',
    autoDelete: false,
    size: 0,
    slotIndex: 2,
    workspaceX: -155, workspaceY: 0, zoomLevel: 0.5,
    hardware: { python: { name: 'My Hub', type: 'flipper', connectionState: 2 } },
    state: { canvasDrawerOpen: true, hasMonitors: false, playMode: 'download', knowledgeBaseSection: 'spm-help' },
    extraFiles: [],
    lastConnectedHubType: 'flipper',
    futureField: 'preserve-me',
  };

  const merged = ctx.LLSP3.manifest.mergeForSave(loaded, { name: 'New name' });

  assert.strictEqual(merged.name, 'New name');                          // overridden
  assert.strictEqual(merged.id, 'preservedid12');                       // preserved
  assert.strictEqual(merged.created, '2025-01-01T00:00:00.000Z');       // preserved
  assert.notStrictEqual(merged.lastsaved, '2025-01-01T00:00:00.000Z');  // bumped
  assert.match(merged.lastsaved, /^\d{4}-\d{2}-\d{2}T/);
  assert.strictEqual(merged.slotIndex, 2);                              // preserved
  assert.deepStrictEqual(merged.hardware, loaded.hardware);             // preserved
  assert.deepStrictEqual(merged.state, loaded.state);                   // preserved
  assert.strictEqual(merged.futureField, 'preserve-me');                // preserved
});

test('mergeForSave: word-blocks updates extensions when given', () => {
  const ctx = freshEnv();
  const loaded = ctx.LLSP3.manifest.defaultManifest('word-blocks', { name: 'X' });
  const merged = ctx.LLSP3.manifest.mergeForSave(loaded, {
    name: 'Y',
    extensions: ['flipperevents', 'flippermove'],
  });
  assert.strictEqual(merged.name, 'Y');
  assert.deepStrictEqual(merged.extensions, ['flipperevents', 'flippermove']);
});
