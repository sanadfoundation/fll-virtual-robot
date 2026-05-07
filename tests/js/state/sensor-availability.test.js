'use strict';

// Tests for RobotSimulator._assertSensorAvailable — the runtime guard that
// Blockly force-sensor generators call to mirror Python's "no force sensor
// configured" RuntimeError. Bucket 1.7 fix from docs/audit/api-gap-report.md.

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

test('_assertSensorAvailable("color_sensor") passes — port E is color in default config', () => {
  const sim = createSim();
  assert.doesNotThrow(() => sim._assertSensorAvailable('color_sensor'));
});

test('_assertSensorAvailable("distance_sensor") passes — port F is distance in default config', () => {
  const sim = createSim();
  assert.doesNotThrow(() => sim._assertSensorAvailable('distance_sensor'));
});

test('_assertSensorAvailable("motor") passes — ports A,B are motors in default config', () => {
  const sim = createSim();
  assert.doesNotThrow(() => sim._assertSensorAvailable('motor'));
});

test('_assertSensorAvailable("force_sensor") throws under canonical wiring', () => {
  const sim = createSim();
  assert.throws(
    () => sim._assertSensorAvailable('force_sensor'),
    /no force sensor configured on any port/,
  );
});

test('_assertSensorAvailable passes once a port is reconfigured to force_sensor', () => {
  const sim = createSim();
  sim._portConfig = { ...sim._portConfig, C: { kind: 'force_sensor' } };
  assert.doesNotThrow(() => sim._assertSensorAvailable('force_sensor'));
});

test('_assertSensorAvailable error message names the kind in human form', () => {
  const sim = createSim();
  try {
    sim._assertSensorAvailable('color_matrix');
  } catch (e) {
    // 'color_matrix' is not configured anywhere; underscore should be a space
    // in the user-facing message (matches _assertPortKind's style).
    assert.match(e.message, /no color matrix /);
    return;
  }
  assert.fail('expected _assertSensorAvailable to throw');
});
