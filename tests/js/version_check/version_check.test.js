'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { loadVersionCheck } = require('./helper');

test('shouldShowBanner: false when latest matches baseline', () => {
  const { shouldShowBanner } = loadVersionCheck();
  assert.strictEqual(shouldShowBanner('abc', 'abc', null), false);
});

test('shouldShowBanner: false when latest matches dismissed', () => {
  const { shouldShowBanner } = loadVersionCheck();
  assert.strictEqual(shouldShowBanner('def', 'abc', 'def'), false);
});

test('shouldShowBanner: true when latest differs from both baseline and dismissed', () => {
  const { shouldShowBanner } = loadVersionCheck();
  assert.strictEqual(shouldShowBanner('xyz', 'abc', 'def'), true);
});

test('shouldShowBanner: true when latest differs from baseline and dismissed is null', () => {
  const { shouldShowBanner } = loadVersionCheck();
  assert.strictEqual(shouldShowBanner('xyz', 'abc', null), true);
});

test('shouldShowBanner: false on empty / null latest', () => {
  const { shouldShowBanner } = loadVersionCheck();
  assert.strictEqual(shouldShowBanner('',   'abc', null), false);
  assert.strictEqual(shouldShowBanner(null, 'abc', null), false);
});

test('shouldShowBanner: false on empty / null baseline (cannot compare)', () => {
  const { shouldShowBanner } = loadVersionCheck();
  assert.strictEqual(shouldShowBanner('xyz', '',   null), false);
  assert.strictEqual(shouldShowBanner('xyz', null, null), false);
});
