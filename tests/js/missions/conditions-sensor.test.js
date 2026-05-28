'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv(['mission_schema', 'mission_conditions']).ctx;
}

function snap(sensors) {
  return { robot: { x: 0, y: 0, heading: 0 }, obstacles: {}, zones: {}, contacts: {}, sensors };
}

test('sensor: equality match (color = "red")', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate(
      { kind: 'sensor', port: 'C', op: '==', value: 'red' },
      snap({ C: 'red' })),
    true);
});

test('sensor: equality miss', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate(
      { kind: 'sensor', port: 'C', op: '==', value: 'red' },
      snap({ C: 'green' })),
    false);
});

test('sensor: numeric < operator', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate(
      { kind: 'sensor', port: 'D', op: '<', value: 100 },
      snap({ D: 80 })),
    true);
});

test('sensor: numeric > operator (false case)', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate(
      { kind: 'sensor', port: 'D', op: '>', value: 100 },
      snap({ D: 80 })),
    false);
});

test('sensor: <= boundary', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate(
      { kind: 'sensor', port: 'E', op: '<=', value: 5 },
      snap({ E: 5 })),
    true);
});

test('sensor: != operator', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate(
      { kind: 'sensor', port: 'C', op: '!=', value: 'red' },
      snap({ C: 'blue' })),
    true);
});

test('sensor: missing port returns false (does not throw)', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate(
      { kind: 'sensor', port: 'F', op: '==', value: 1 },
      snap({})),
    false);
});

test('sensor: unknown operator throws (programmer error)', () => {
  const ctx = env();
  assert.throws(() => ctx.MISSIONS.conditions.evaluate(
    { kind: 'sensor', port: 'C', op: '~', value: 1 },
    snap({ C: 1 })),
    /unknown.*operator/);
});
