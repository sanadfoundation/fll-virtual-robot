'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { loadVersionCheck, loadVersionCheckWithRoot } = require('./helper');

function makeDoc(byCss) {
  return {
    querySelectorAll(selector) {
      return byCss[selector] || [];
    },
  };
}
function makeEl(attrs) {
  return {
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
  };
}

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
  assert.deepEqual(result, { sha: 'abc', builtAt: '2026-05-07T18:42:11Z' });
});

test('parseVersionPayload: returns object with sha when builtAt missing', () => {
  const { parseVersionPayload } = loadVersionCheck();
  const result = parseVersionPayload('{"sha":"abc"}');
  assert.deepEqual(result, { sha: 'abc', builtAt: null });
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
  assert.deepEqual(result, { sha: 'abc', builtAt: 't' });
});

test('parseVersionPayload: rejects non-string sha', () => {
  const { parseVersionPayload } = loadVersionCheck();
  assert.strictEqual(parseVersionPayload('{"sha":123}'), null);
});

test('getBaselineSha: returns null before bootstrap', () => {
  const { getBaselineSha } = loadVersionCheck();
  assert.strictEqual(getBaselineSha(), null);
});

test('collectSameOriginAssetUrls: empty when baseHref is invalid', () => {
  const { collectSameOriginAssetUrls } = loadVersionCheck();
  const urls = collectSameOriginAssetUrls(makeDoc({}), null, 'not a url');
  assert.deepEqual([...urls], []);
});

test('collectSameOriginAssetUrls: picks up script/link/img from DOM and resolves relative URLs', () => {
  const { collectSameOriginAssetUrls } = loadVersionCheck();
  const doc = makeDoc({
    'link[rel="stylesheet"][href]': [makeEl({ href: 'css/style.css' })],
    'script[src]':                  [makeEl({ src: 'js/main.js' }), makeEl({ src: 'py/spike_bridge.py' })],
    'img[src]':                     [makeEl({ src: '/static/icons/foo.svg' })],
  });
  const urls = collectSameOriginAssetUrls(doc, null, 'http://example.test/app/');
  assert.deepEqual([...urls].sort(), [
    'http://example.test/app/css/style.css',
    'http://example.test/app/js/main.js',
    'http://example.test/app/py/spike_bridge.py',
    'http://example.test/static/icons/foo.svg',
  ]);
});

test('collectSameOriginAssetUrls: filters cross-origin URLs', () => {
  const { collectSameOriginAssetUrls } = loadVersionCheck();
  const doc = makeDoc({
    'script[src]': [
      makeEl({ src: 'https://cdn.example.com/blockly.js' }),
      makeEl({ src: 'js/main.js' }),
    ],
  });
  const urls = collectSameOriginAssetUrls(doc, null, 'http://example.test/app/');
  assert.deepEqual([...urls], ['http://example.test/app/js/main.js']);
});

test('collectSameOriginAssetUrls: includes Performance Resource Timing entries', () => {
  const { collectSameOriginAssetUrls } = loadVersionCheck();
  const perf = {
    getEntriesByType(type) {
      if (type !== 'resource') return [];
      return [
        { name: 'http://example.test/app/static/icons/RepeatCurl.svg' },
        { name: 'https://cdn.example.com/blockly.js' },
        { name: 'http://example.test/app/static/version.json?_=1234' },
      ];
    },
  };
  const urls = collectSameOriginAssetUrls(makeDoc({}), perf, 'http://example.test/app/');
  assert.deepEqual([...urls].sort(), [
    'http://example.test/app/static/icons/RepeatCurl.svg',
    'http://example.test/app/static/version.json?_=1234',
  ]);
});

test('collectSameOriginAssetUrls: dedupes URLs present in both DOM and Performance', () => {
  const { collectSameOriginAssetUrls } = loadVersionCheck();
  const doc = makeDoc({
    'script[src]': [makeEl({ src: 'js/main.js' })],
  });
  const perf = {
    getEntriesByType: () => [{ name: 'http://example.test/app/js/main.js' }],
  };
  const urls = collectSameOriginAssetUrls(doc, perf, 'http://example.test/app/');
  assert.deepEqual([...urls], ['http://example.test/app/js/main.js']);
});

test('hardReload: refetches same-origin assets with cache: reload, clears Cache Storage, then reloads', async () => {
  const { api, root } = loadVersionCheckWithRoot();
  const fetchCalls = [];
  root.fetch = (url, opts) => {
    fetchCalls.push({ url, opts });
    return Promise.resolve({ ok: true });
  };
  const cacheDeletes = [];
  root.caches = {
    keys: () => Promise.resolve(['v1', 'v2']),
    delete: (k) => { cacheDeletes.push(k); return Promise.resolve(true); },
  };
  let reloaded = 0;
  root.location = {
    href: 'http://example.test/app/',
    reload: () => { reloaded += 1; },
  };
  root.document = makeDoc({
    'script[src]': [makeEl({ src: 'js/main.js' })],
    'link[rel="stylesheet"][href]': [makeEl({ href: 'css/style.css' })],
  });
  root.performance = {
    getEntriesByType: () => [{ name: 'http://example.test/app/static/icons/repeat.svg' }],
  };

  await api.hardReload();

  const urls = fetchCalls.map(c => c.url).sort();
  assert.deepEqual(urls, [
    'http://example.test/app/css/style.css',
    'http://example.test/app/js/main.js',
    'http://example.test/app/static/icons/repeat.svg',
  ]);
  for (const c of fetchCalls) {
    assert.deepEqual(c.opts, { cache: 'reload' });
  }
  assert.deepEqual(cacheDeletes.sort(), ['v1', 'v2']);
  assert.strictEqual(reloaded, 1);
});

test('hardReload: still reloads when fetch throws on every asset', async () => {
  const { api, root } = loadVersionCheckWithRoot();
  root.fetch = () => Promise.reject(new Error('network down'));
  let reloaded = 0;
  root.location = {
    href: 'http://example.test/app/',
    reload: () => { reloaded += 1; },
  };
  root.document = makeDoc({
    'script[src]': [makeEl({ src: 'js/main.js' })],
  });
  await api.hardReload();
  assert.strictEqual(reloaded, 1);
});

test('hardReload: works when fetch is unavailable', async () => {
  const { api, root } = loadVersionCheckWithRoot();
  // no root.fetch
  let reloaded = 0;
  root.location = {
    href: 'http://example.test/app/',
    reload: () => { reloaded += 1; },
  };
  root.document = makeDoc({
    'script[src]': [makeEl({ src: 'js/main.js' })],
  });
  await api.hardReload();
  assert.strictEqual(reloaded, 1);
});
