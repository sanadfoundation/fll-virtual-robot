'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMainEnv } = require('../mocks/main-env');

const SPEED_KEY = 'fll-vr-speed';

test('applyStoredSpeed: falls back to 1 when storage is empty', () => {
  const { context, storage, elementsById } = makeMainEnv();
  context.applyStoredSpeed();
  assert.strictEqual(elementsById['speed-slider'].value, '1');
  assert.strictEqual(elementsById['speed-label'].textContent, '1x');
  assert.strictEqual(storage.has(SPEED_KEY), false, 'fallback path must not write to storage');
});

test('applyStoredSpeed: falls back to 1 when stored value is non-numeric', () => {
  const { context, elementsById } = makeMainEnv({ storage: { [SPEED_KEY]: 'banana' } });
  context.applyStoredSpeed();
  assert.strictEqual(elementsById['speed-slider'].value, '1');
  assert.strictEqual(elementsById['speed-label'].textContent, '1x');
});

test('applyStoredSpeed: falls back to 1 when stored value is non-positive', () => {
  const { context, elementsById } = makeMainEnv({ storage: { [SPEED_KEY]: '0' } });
  context.applyStoredSpeed();
  assert.strictEqual(elementsById['speed-slider'].value, '1');
});

test('applyStoredSpeed: applies a valid stored value', () => {
  const { context, elementsById } = makeMainEnv({ storage: { [SPEED_KEY]: '2.5' } });
  context.applyStoredSpeed();
  assert.strictEqual(elementsById['speed-slider'].value, '2.5');
  assert.strictEqual(elementsById['speed-label'].textContent, '2.5x');
});

test('updateSpeed: persists the value to storage by default', () => {
  const { context, storage } = makeMainEnv();
  context.updateSpeed('1.75');
  assert.strictEqual(storage.get(SPEED_KEY), '1.75');
});

test('updateSpeed: skips persistence when {persist:false} is passed', () => {
  const { context, storage } = makeMainEnv();
  context.updateSpeed(2, { persist: false });
  assert.strictEqual(storage.has(SPEED_KEY), false);
});
