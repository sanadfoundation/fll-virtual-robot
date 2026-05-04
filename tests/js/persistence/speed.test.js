'use strict';

const { makeMainEnv } = require('../mocks/main-env');

const SPEED_KEY = 'fll-vr-speed';

module.exports = [
  {
    name: 'applyStoredSpeed: falls back to 1 when storage is empty',
    fn(_createSim, assert) {
      const { context, storage, elementsById } = makeMainEnv();
      context.applyStoredSpeed();
      assert.strictEqual(elementsById['speed-slider'].value, '1');
      assert.strictEqual(elementsById['speed-label'].textContent, '1x');
      assert.strictEqual(storage.has(SPEED_KEY), false, 'fallback path must not write to storage');
    },
  },
  {
    name: 'applyStoredSpeed: falls back to 1 when stored value is non-numeric',
    fn(_createSim, assert) {
      const { context, elementsById } = makeMainEnv({ storage: { [SPEED_KEY]: 'banana' } });
      context.applyStoredSpeed();
      assert.strictEqual(elementsById['speed-slider'].value, '1');
      assert.strictEqual(elementsById['speed-label'].textContent, '1x');
    },
  },
  {
    name: 'applyStoredSpeed: falls back to 1 when stored value is non-positive',
    fn(_createSim, assert) {
      const { context, elementsById } = makeMainEnv({ storage: { [SPEED_KEY]: '0' } });
      context.applyStoredSpeed();
      assert.strictEqual(elementsById['speed-slider'].value, '1');
    },
  },
  {
    name: 'applyStoredSpeed: applies a valid stored value',
    fn(_createSim, assert) {
      const { context, elementsById } = makeMainEnv({ storage: { [SPEED_KEY]: '2.5' } });
      context.applyStoredSpeed();
      assert.strictEqual(elementsById['speed-slider'].value, '2.5');
      assert.strictEqual(elementsById['speed-label'].textContent, '2.5x');
    },
  },
  {
    name: 'updateSpeed: persists the value to storage by default',
    fn(_createSim, assert) {
      const { context, storage } = makeMainEnv();
      context.updateSpeed('1.75');
      assert.strictEqual(storage.get(SPEED_KEY), '1.75');
    },
  },
  {
    name: 'updateSpeed: skips persistence when {persist:false} is passed',
    fn(_createSim, assert) {
      const { context, storage } = makeMainEnv();
      context.updateSpeed(2, { persist: false });
      assert.strictEqual(storage.has(SPEED_KEY), false);
    },
  },
];
