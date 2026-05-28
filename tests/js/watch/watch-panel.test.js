'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { loadWatchPanel } = require('./helper');

test('declare adds a name to the registry with the given value', () => {
  const { api } = loadWatchPanel();
  api.declare('score', 0);
  assert.deepEqual(api._snapshot(), { score: 0 });
});

test('declare is idempotent — a second declare for the same name is a no-op', () => {
  const { api } = loadWatchPanel();
  api.declare('score', 0);
  api.declare('score', 99);
  assert.strictEqual(api._snapshot().score, 0);
});

test('set adds a name when not previously declared', () => {
  const { api } = loadWatchPanel();
  api.set('score', 42);
  assert.deepEqual(api._snapshot(), { score: 42 });
});

test('set updates an existing value', () => {
  const { api } = loadWatchPanel();
  api.declare('score', 0);
  api.set('score', 42);
  assert.strictEqual(api._snapshot().score, 42);
});

test('clear empties the registry', () => {
  const { api } = loadWatchPanel();
  api.declare('score', 0);
  api.set('ready', true);
  api.clear();
  assert.deepEqual(api._snapshot(), {});
});

test('remove drops a single variable and leaves the rest', () => {
  const { api } = loadWatchPanel();
  api.declare('score', 0);
  api.set('ready', true);
  api.remove('score');
  assert.deepEqual(api._snapshot(), { ready: true });
});

test('remove for an unknown variable is a no-op', () => {
  const { api } = loadWatchPanel();
  api.declare('score', 7);
  api.remove('nope');
  assert.deepEqual(api._snapshot(), { score: 7 });
});

test('remove rerenders so the row leaves the DOM', () => {
  const { api, list, flushRaf } = loadWatchPanel();
  api.declare('alpha', 1);
  api.declare('beta', 2);
  flushRaf();
  assert.strictEqual(list.children.length, 2);
  api.remove('alpha');
  flushRaf();
  const names = list.children.map(row => row.dataset.name);
  assert.deepEqual(names, ['beta']);
});

test('remove of the last variable slides the pane out', () => {
  const { api, pane, flushRaf } = loadWatchPanel();
  api.declare('only', 1);
  flushRaf(); flushRaf();
  assert.ok(pane.classList.contains('visible'));
  api.remove('only');
  flushRaf();
  assert.ok(!pane.classList.contains('visible'));
});

test('render mounts a row per variable, sorted alphabetically', () => {
  const { api, list, flushRaf } = loadWatchPanel();
  api.declare('zeta', 0);
  api.declare('alpha', 0);
  api.declare('mike', 0);
  flushRaf();
  const names = list.children.map(row => row.dataset.name);
  assert.deepEqual(names, ['alpha', 'mike', 'zeta']);
});

test('render coalesces multiple sets into one frame', () => {
  const { api, list, flushRaf } = loadWatchPanel();
  api.set('x', 1);
  api.set('x', 2);
  api.set('x', 3);
  // Before flush: no rows mounted.
  assert.strictEqual(list.children.length, 0);
  flushRaf();
  assert.strictEqual(list.children.length, 1);
});

test('changed rows get a .flash class; unchanged rows do not', () => {
  const { api, list, flushRaf, flushTimers } = loadWatchPanel();
  api.declare('score', 0);
  flushRaf();
  // First render: no flash (just declared).
  assert.ok(!list.children[0].classList.contains('flash'));
  api.set('score', 1);
  flushRaf();
  assert.ok(list.children[0].classList.contains('flash'));
  // After the 600ms timer fires, .flash is removed.
  flushTimers();
  assert.ok(!list.children[0].classList.contains('flash'));
});

test('setting the same value twice does not flash on the second set', () => {
  const { api, list, flushRaf, flushTimers } = loadWatchPanel();
  api.declare('score', 5);
  api.set('score', 5);                  // declare → set with same value
  flushRaf();
  flushTimers();
  assert.ok(!list.children[0].classList.contains('flash'));
});

test('value formatting: integer renders as bare number', () => {
  const { api, list, flushRaf } = loadWatchPanel();
  api.set('n', 42);
  flushRaf();
  const valueEl = list.children[0].children.find(c => c.classList.contains('watch-row-value'));
  assert.strictEqual(valueEl.textContent, '42');
});

test('value formatting: float rounds to 3 dp', () => {
  const { api, list, flushRaf } = loadWatchPanel();
  api.set('pi', 3.14159265);
  flushRaf();
  const valueEl = list.children[0].children.find(c => c.classList.contains('watch-row-value'));
  assert.strictEqual(valueEl.textContent, '3.142');
});

test('value formatting: string is quoted', () => {
  const { api, list, flushRaf } = loadWatchPanel();
  api.set('name', 'hello');
  flushRaf();
  const valueEl = list.children[0].children.find(c => c.classList.contains('watch-row-value'));
  assert.strictEqual(valueEl.textContent, '"hello"');
});

test('value formatting: boolean renders as true / false', () => {
  const { api, list, flushRaf } = loadWatchPanel();
  api.set('ready', true);
  api.set('done', false);
  flushRaf();
  const values = list.children.map(row =>
    row.children.find(c => c.classList.contains('watch-row-value')).textContent
  );
  assert.deepEqual(values.sort(), ['false', 'true']);
});

test('value formatting: array renders as [a, b, c] truncated at 32 chars', () => {
  const { api, list, flushRaf } = loadWatchPanel();
  api.set('xs', [1, 2, 3]);
  api.set('long', Array.from({ length: 20 }, (_, i) => i));
  flushRaf();
  const shortValue = list.children
    .find(r => r.dataset.name === 'xs')
    .children.find(c => c.classList.contains('watch-row-value')).textContent;
  assert.strictEqual(shortValue, '[1, 2, 3]');
  const longValue = list.children
    .find(r => r.dataset.name === 'long')
    .children.find(c => c.classList.contains('watch-row-value')).textContent;
  assert.ok(longValue.length <= 32);
  assert.ok(longValue.endsWith('…]'));
});

test('value formatting: null renders as "null"', () => {
  const { api, list, flushRaf } = loadWatchPanel();
  api.set('x', null);
  flushRaf();
  const valueEl = list.children[0].children.find(c => c.classList.contains('watch-row-value'));
  assert.strictEqual(valueEl.textContent, 'null');
});

test('pane becomes visible when first variable lands', () => {
  const { api, pane, flushRaf } = loadWatchPanel();
  assert.ok(!pane.classList.contains('visible'));
  api.declare('x', 0);
  flushRaf();
  // First rAF schedules the visibility flip in a second rAF, so flush once more.
  flushRaf();
  assert.ok(pane.classList.contains('visible'));
});

test('clear() removes the .visible class so the pane slides out', () => {
  const { api, pane, flushRaf } = loadWatchPanel();
  api.declare('x', 0);
  flushRaf(); flushRaf();
  assert.ok(pane.classList.contains('visible'));
  api.clear();
  flushRaf();
  assert.ok(!pane.classList.contains('visible'));
});

test('content row gets .empty when registry is empty; loses it when non-empty', () => {
  // The CSS hide rule for the watch pane and its resize handle keys off
  // .console-content-row.empty, so the renderer must toggle it correctly.
  const { api, contentRow, flushRaf } = loadWatchPanel();
  flushRaf();
  // No declare/set yet — first render isn't even scheduled, so the class
  // should remain its initial state (no .empty). The first non-trivial
  // render is what actually does the toggle.
  api.declare('x', 0);
  flushRaf();
  assert.ok(!contentRow.classList.contains('empty'),
    'registry has one entry — row should not be marked empty');
  api.clear();
  flushRaf();
  assert.ok(contentRow.classList.contains('empty'),
    'registry empty after clear() — row should be marked empty');
  api.set('y', 1);
  flushRaf();
  assert.ok(!contentRow.classList.contains('empty'),
    'registry has one entry again — empty marker should clear');
});
