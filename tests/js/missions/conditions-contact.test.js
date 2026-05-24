'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv(['mission_schema', 'mission_conditions']).ctx;
}

function snap(contacts) {
  return { robot: { x: 0, y: 0, heading: 0 }, obstacles: {}, zones: {}, sensors: {}, contacts };
}

test('contact: true when the named obstacle has been touched', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate(
      { kind: 'contact', obstacle: '1' },
      snap({ '1': true })),
    true);
});

test('contact: false when the obstacle has not been touched yet', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate(
      { kind: 'contact', obstacle: '1' },
      snap({})),
    false);
});

test('contact: untouched named obstacle is false even if others were touched', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate(
      { kind: 'contact', obstacle: '2' },
      snap({ '1': true })),
    false);
});
