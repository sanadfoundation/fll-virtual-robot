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

test('parseVersionPayload: returns { sha, builtAt } for well-formed JSON', () => {
  const { parseVersionPayload } = loadVersionCheck();
  const result = parseVersionPayload('{"sha":"abc","builtAt":"2026-05-07T18:42:11Z"}');
  assert.deepStrictEqual(result, { sha: 'abc', builtAt: '2026-05-07T18:42:11Z' });
});

test('parseVersionPayload: returns object with sha when builtAt missing', () => {
  const { parseVersionPayload } = loadVersionCheck();
  const result = parseVersionPayload('{"sha":"abc"}');
  assert.deepStrictEqual(result, { sha: 'abc', builtAt: null });
});

test('parseVersionPayload: returns null when sha missing', () => {
  const { parseVersionPayload } = loadVersionCheck();
  assert.strictEqual(parseVersionPayload('{"builtAt":"2026-05-07T18:42:11Z"}'), null);
});

test('parseVersionPayload: returns null on malformed JSON', () => {
  const { parseVersionPayload } = loadVersionCheck();
  assert.strictEqual(parseVersionPayload('not json'), null);
  assert.strictEqual(parseVersionPayload(''),         null);
});

test('parseVersionPayload: ignores unknown fields', () => {
  const { parseVersionPayload } = loadVersionCheck();
  const result = parseVersionPayload('{"sha":"abc","builtAt":"t","extra":42}');
  assert.deepStrictEqual(result, { sha: 'abc', builtAt: 't' });
});

test('parseVersionPayload: rejects non-string sha', () => {
  const { parseVersionPayload } = loadVersionCheck();
  assert.strictEqual(parseVersionPayload('{"sha":123}'), null);
});
