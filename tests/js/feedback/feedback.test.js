'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { loadFeedback } = require('./helper');

const BASE_URL  = 'https://docs.google.com/forms/d/e/FORM_ID/viewform?embedded=true';
const ENTRY_IDS = {
  sha:       'entry.111',
  mode:      'entry.222',
  userAgent: 'entry.333',
};

test('buildPrefilledUrl: returns empty string when formBaseUrl is empty', () => {
  const { buildPrefilledUrl } = loadFeedback();
  const url = buildPrefilledUrl('', ENTRY_IDS, { sha: 'abc', mode: 'blocks', userAgent: 'UA' });
  assert.strictEqual(url, '');
});

test('buildPrefilledUrl: appends all three entry params when present', () => {
  const { buildPrefilledUrl } = loadFeedback();
  const url = buildPrefilledUrl(BASE_URL, ENTRY_IDS, {
    sha: 'abc123',
    mode: 'python',
    userAgent: 'Mozilla/5.0',
  });
  assert.ok(url.startsWith(BASE_URL + '&'));
  assert.ok(url.includes('entry.111=abc123'));
  assert.ok(url.includes('entry.222=python'));
  assert.ok(url.includes('entry.333=Mozilla%2F5.0'));
});

test('buildPrefilledUrl: URL-encodes special characters', () => {
  const { buildPrefilledUrl } = loadFeedback();
  const url = buildPrefilledUrl(BASE_URL, ENTRY_IDS, {
    sha: 'abc',
    mode: 'blocks',
    userAgent: 'Mozilla/5.0 (Mac OS X) Chrome/120.0 Safari/537.36',
  });
  // Spaces → %20, slashes → %2F
  assert.ok(url.includes('Mozilla%2F5.0%20(Mac%20OS%20X)'));
});

test('buildPrefilledUrl: skips entry whose ID is empty', () => {
  const { buildPrefilledUrl } = loadFeedback();
  const partialIds = { sha: 'entry.111', mode: '', userAgent: 'entry.333' };
  const url = buildPrefilledUrl(BASE_URL, partialIds, {
    sha: 'abc',
    mode: 'blocks',
    userAgent: 'UA',
  });
  assert.ok(url.includes('entry.111=abc'));
  assert.ok(!url.includes('entry.222'));
  assert.ok(!url.includes('=blocks'));
  assert.ok(url.includes('entry.333=UA'));
});

test('buildPrefilledUrl: skips entry whose value is missing or empty', () => {
  const { buildPrefilledUrl } = loadFeedback();
  const url = buildPrefilledUrl(BASE_URL, ENTRY_IDS, {
    sha: 'abc',
    mode: '',
    userAgent: undefined,
  });
  assert.ok(url.includes('entry.111=abc'));
  assert.ok(!url.includes('entry.222='));
  assert.ok(!url.includes('entry.333='));
});

test('buildPrefilledUrl: never emits a trailing & or && separator', () => {
  const { buildPrefilledUrl } = loadFeedback();
  const url = buildPrefilledUrl(BASE_URL, ENTRY_IDS, {
    sha: 'abc',
    mode: '',
    userAgent: 'UA',
  });
  assert.ok(!url.includes('&&'));
  assert.ok(!url.endsWith('&'));
});
