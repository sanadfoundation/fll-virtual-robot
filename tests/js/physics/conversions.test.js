'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

const WHEEL_CIRC_MM = Math.PI * 56;
const EPS = 1e-9;

test('degrees 360 → full wheel circumference', () => {
  const mm = createSim()._amountToMM(360, 'degrees');
  assert.ok(Math.abs(mm - WHEEL_CIRC_MM) < EPS, `got ${mm}`);
});

test('degrees 180 → half wheel circumference', () => {
  const mm = createSim()._amountToMM(180, 'degrees');
  assert.ok(Math.abs(mm - WHEEL_CIRC_MM / 2) < EPS, `got ${mm}`);
});

test('degrees 0 → 0 mm', () => {
  assert.strictEqual(createSim()._amountToMM(0, 'degrees'), 0);
});

test('rotations 1 → full wheel circumference', () => {
  assert.strictEqual(createSim()._amountToMM(1, 'rotations'), WHEEL_CIRC_MM);
});

test('rotations 2 → 2 × wheel circumference', () => {
  assert.strictEqual(createSim()._amountToMM(2, 'rotations'), 2 * WHEEL_CIRC_MM);
});

test('cm 1 → 10 mm', () => {
  assert.strictEqual(createSim()._amountToMM(1, 'cm'), 10);
});

test('cm 10 → 100 mm', () => {
  assert.strictEqual(createSim()._amountToMM(10, 'cm'), 100);
});

test('inches 1 → 25.4 mm', () => {
  assert.strictEqual(createSim()._amountToMM(1, 'inches'), 25.4);
});

test('inches 2 → 50.8 mm', () => {
  assert.ok(Math.abs(createSim()._amountToMM(2, 'inches') - 50.8) < EPS);
});

test('unknown unit falls through to degrees logic', () => {
  const mm = createSim()._amountToMM(360, 'mm');
  assert.ok(Math.abs(mm - WHEEL_CIRC_MM) < EPS, `got ${mm}`);
});
