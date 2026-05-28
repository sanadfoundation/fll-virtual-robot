'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv(['mission_schema', 'mission_conditions']).ctx;
}

const T = { kind: 'contact', obstacle: 'touched' };
const F = { kind: 'contact', obstacle: 'never' };

function snap() {
  return {
    robot: { x: 0, y: 0, heading: 0 }, obstacles: {}, zones: {}, sensors: {},
    contacts: { touched: true },
  };
}

test('not: inverts a true child to false', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate({ kind: 'not', of: T }, snap()),
    false);
});

test('not: inverts a false child to true', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate({ kind: 'not', of: F }, snap()),
    true);
});

test('all_of: true only when every child is true', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate({ kind: 'all_of', of: [T, T] }, snap()),
    true);
});

test('all_of: false when any child is false', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate({ kind: 'all_of', of: [T, F] }, snap()),
    false);
});

test('any_of: true when at least one child is true', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate({ kind: 'any_of', of: [F, T] }, snap()),
    true);
});

test('any_of: false only when every child is false', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate({ kind: 'any_of', of: [F, F] }, snap()),
    false);
});

test('composite: nesting works (NOT(ANY_OF(F, NOT(T))))', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate(
      { kind: 'not',
        of: { kind: 'any_of', of: [F, { kind: 'not', of: T }] } },
      snap()),
    true);
});

test('all_of: short-circuits — does not evaluate later children once one is false', () => {
  const ctx = env();
  let calls = 0;
  const counted = { kind: 'sensor', port: 'X', op: '==', value: 1 };
  // Override evaluate via a wrapper - simpler: just measure with a child that throws.
  const throwing = { kind: 'sensor', port: 'C', op: 'bogus_op', value: 1 };
  // F first, throwing-on-eval second → must not throw because all_of short-circuits.
  assert.doesNotThrow(() => ctx.MISSIONS.conditions.evaluate(
    { kind: 'all_of', of: [F, throwing] }, snap()));
});

test('any_of: short-circuits — does not evaluate later children once one is true', () => {
  const ctx = env();
  const throwing = { kind: 'sensor', port: 'C', op: 'bogus_op', value: 1 };
  assert.doesNotThrow(() => ctx.MISSIONS.conditions.evaluate(
    { kind: 'any_of', of: [T, throwing] }, snap()));
});
